"""Measure the saved PCB for layout review. Run with KiCad 10 Python.

This is a geometry report, not a parasitic, current-density or thermal solver.
It never rewrites the board. Trace paths exclude winding polygons, plane
spreading, component internals and vertical via-barrel length.
"""
import hashlib
import heapq
import json
import math
from pathlib import Path
import pcbnew as pcb

R = Path(__file__).resolve().parents[1]
source = R / 'kicad/PS-FLYBACK-5W.kicad_pcb'
board = pcb.LoadBoard(str(source))
layers = [pcb.F_Cu, pcb.In1_Cu, pcb.In2_Cu, pcb.In3_Cu, pcb.In4_Cu, pcb.B_Cu]
footprints = {f.GetReference(): f for f in board.GetFootprints()}
pads = {}
for ref, footprint in footprints.items():
    for pad in footprint.Pads():
        if pad.GetNumber():
            pads.setdefault(f'{ref}.{pad.GetNumber()}', []).append(pad)

def xy(point):
    return tuple(round(pcb.ToMM(v), 6) for v in (point.x, point.y))

def on_segment(point, start, end):
    length = math.dist(start, end)
    if length < 1e-6:
        return False
    cross = abs((end[0]-start[0])*(point[1]-start[1])-(end[1]-start[1])*(point[0]-start[0]))
    return (cross/length < .000002 and
            all(min(a,b)-.000002 <= p <= max(a,b)+.000002 for p,a,b in zip(point,start,end)))

def route_between(first, last):
    first_pad, last_pad = pads[first][0], pads[last][0]
    net = first_pad.GetNetname()
    assert net == last_pad.GetNetname()
    tracks = [t for t in board.GetTracks() if t.GetNetname() == net and not isinstance(t, pcb.PCB_VIA)]
    vias = [v for v in board.GetTracks() if v.GetNetname() == net and isinstance(v, pcb.PCB_VIA)]
    relevant_pads = [p for group in pads.values() for p in group if p.GetNetname() == net]
    points = {xy(t.GetStart()) for t in tracks} | {xy(t.GetEnd()) for t in tracks}
    points |= {xy(v.GetPosition()) for v in vias} | {xy(p.GetPosition()) for p in relevant_pads}
    graph = {}

    def link(a, b, length, width=None):
        graph.setdefault(a, []).append((b, length, width))
        graph.setdefault(b, []).append((a, length, width))

    for track in tracks:
        start, end, layer = xy(track.GetStart()), xy(track.GetEnd()), track.GetLayer()
        hits = sorted((p for p in points if on_segment(p,start,end)), key=lambda p: math.dist(start,p))
        for a,b in zip(hits,hits[1:]):
            link((layer,*a),(layer,*b),math.dist(a,b),pcb.ToMM(track.GetWidth()))
    for item in [*vias, *[p for p in relevant_pads if p.GetAttribute() == pcb.PAD_ATTRIB_PTH]]:
        position = xy(item.GetPosition())
        copper = [layer for layer in layers if item.IsOnLayer(layer)]
        for a,b in zip(copper,copper[1:]):
            link((a,*position),(b,*position),0)

    starts = [(layer,*xy(first_pad.GetPosition())) for layer in layers if first_pad.IsOnLayer(layer)]
    ends = {(layer,*xy(last_pad.GetPosition())) for layer in layers if last_pad.IsOnLayer(layer)}
    queue = [(0,p) for p in starts]
    heapq.heapify(queue)
    distances = {p:0 for p in starts}; previous = {}
    reached = None
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances[node]:
            continue
        if node in ends:
            reached = node
            break
        for neighbor, length, width in graph.get(node, []):
            candidate = distance+length
            if candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                previous[neighbor] = (node,width)
                heapq.heappush(queue,(candidate,neighbor))
    assert reached is not None, ('No explicit centerline path; inspect pad/plane spreading separately', first, last)
    path = [reached]; widths = []
    while path[-1] in previous:
        node, width = previous[path[-1]]
        path.append(node)
        if width is not None:
            widths.append(width)
    path.reverse()
    return {'from':first,'to':last,'net':net,'routed_centerline_mm':round(distances[reached],4),
            'straight_pad_distance_mm':round(math.dist(xy(first_pad.GetPosition()),xy(last_pad.GetPosition())),4),
            'minimum_track_width_mm':min(widths),
            'layer_transitions':sum(a[0] != b[0] for a,b in zip(path,path[1:])),
            'path':[{'layer':board.GetLayerName(layer),'x_mm':x,'y_mm':y} for layer,x,y in path]}

pairs = [('C2.1','T1.1'),('C1.1','U1.3'),('U1.5','T1.2'),('T1.2','D3.2'),
         ('D3.1','D4.1'),('D4.2','T1.1'),('T1.2','C6.2'),('R6.1','T1.1'),
         ('R6.2','C6.1'),('C5.1','U1.2'),('R3.2','U1.6'),('U1.7','R4.1'),
         ('D2.1','C3.1'),('D2.1','C4.1'),('C3.1','J2.1')]
routes = [route_between(a,b) for a,b in pairs]
zones = [{'net':z.GetNetname(),'layer':board.GetLayerName(z.GetLayer()),
          'filled_area_mm2':round(z.GetFilledArea()/1e12,3)} for z in board.Zones() if not z.GetIsRuleArea()]
ep = pads['U1.9'][0]
ep_vias = [{'position_mm':xy(v.GetPosition()),'diameter_mm':pcb.ToMM(v.GetWidth(pcb.F_Cu)),
            'drill_mm':pcb.ToMM(v.GetDrill())} for v in board.GetTracks()
           if isinstance(v,pcb.PCB_VIA) and v.GetNetname() == '/PGND'
           and ep.GetEffectiveShape(pcb.F_Cu).Distance(v.GetPosition()) == 0]
missing_models = sorted(ref for ref,f in footprints.items() if not list(f.Models()) or
    any(not m.m_Show or not Path(m.m_Filename.replace('${KIPRJMOD}',str(R/'kicad'))).is_file() for m in f.Models()))
track_totals = {}
for track in board.GetTracks():
    if isinstance(track,pcb.PCB_VIA):
        continue
    key = track.GetNetname()+' / '+board.GetLayerName(track.GetLayer())
    track_totals[key] = track_totals.get(key,0)+pcb.ToMM(track.GetLength())
provenance = json.loads((R/'evidence/audit/render-provenance.json').read_text())
for name,expected in provenance['source_SHA256'].items():
    assert hashlib.sha256((R/name).read_bytes()).hexdigest() == expected, ('Stale Gerber/3D audit render',name)
out = {'board_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
       'method':'Shortest explicit trace centerline paths, split at collinear endpoints (2 nm tolerance). Through vias and plated pads join layers at zero vertical length. No pad-spreading shortcuts.',
       'scope':'Geometry only; excludes winding length, component internals, plane spreading, via barrel length, parasitic extraction and measured performance.',
       'routes':routes,'track_length_totals_by_net_and_layer_mm':{k:round(v,4) for k,v in sorted(track_totals.items())},
       'secondary_escape_note':'SEC_A uses two off-center vias touching the wide In2.Cu trace. Its per-layer totals include branched front routing; no fictitious pad-center shortest path is reported.',
       'return_planes':zones,'U1_exposed_pad_ground_vias':ep_vias,
       'footprints_without_body_models':missing_models,'dedicated_testpoint_footprints':sum(ref.startswith('TP') for ref in footprints),
       'existing_Gerber_and_3D_render_source_hashes_match':True}
(R/'evidence/audit/pcb-layout-metrics.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
for route in routes:
    print(f"{route['from']} -> {route['to']}: {route['routed_centerline_mm']:.2f} mm, {route['minimum_track_width_mm']:.2f} mm min width")
print(json.dumps({k:v for k,v in out.items() if k not in ['routes','method','scope']},indent=2))
