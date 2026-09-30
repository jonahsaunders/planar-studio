"""Audit the actual board's routing, ground regions, probe lands and fabrication features.

KiCad Python; no parasitic/current-density/thermal or safety-isolation claim.
"""
import hashlib,json,math
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1];source=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
b=pcb.LoadBoard(str(source));fps={f.GetReference():f for f in b.GetFootprints()}
pad={f'{f.GetReference()}.{p.GetNumber()}':p for f in b.GetFootprints() for p in f.Pads() if p.GetNumber()}
def xy(p):return [pcb.ToMM(p.x),pcb.ToMM(p.y)]
def point(p):return pcb.VECTOR2I(pcb.FromMM(p[0]),pcb.FromMM(p[1]))
tracks=[t for t in b.GetTracks() if not isinstance(t,pcb.PCB_VIA)]
vias=[v for v in b.GetTracks() if isinstance(v,pcb.PCB_VIA)]
non45=[]
for t in tracks:
    a,c=xy(t.GetStart()),xy(t.GetEnd());dx,dy=abs(a[0]-c[0]),abs(a[1]-c[1])
    if min(dx,dy)>1e-5 and abs(dx-dy)>1e-5:non45.append({'net':t.GetNetname(),'start':a,'end':c})
planes=[];plane_by_net={}
for z in b.Zones():
    if z.GetIsRuleArea():continue
    poly=z.GetFilledPolysList(z.GetLayer())
    planes.append({'net':z.GetNetname(),'layer':b.GetLayerName(z.GetLayer()),
                   'connected_filled_outlines':poly.OutlineCount(),'area_mm2':z.GetFilledArea()/1e12})
    if z.GetLayer()==pcb.B_Cu:plane_by_net[z.GetNetname()]=poly
# Sample straight projected return corridors in the bottom ground regions.
# Native DRC and via/pad connectivity remain the authoritative connectivity checks.
returns=[]
pairs=[('C1.2','U1.9'),('C2.2','U1.9'),('C5.2','U1.4'),('R4.2','U1.9'),
       ('C7.2','U1.9'),('C8.2','secondary_return_vias'),('C3.2','secondary_return_vias'),('C4.2','secondary_return_vias')]
for first,last in pairs:
    a=xy(pad[first].GetPosition());c=xy(pad[last].GetPosition()) if last in pad else [98.169595,106.5]
    net=pad[first].GetNetname();poly=plane_by_net[net];length=math.dist(a,c)
    normal=[-(c[1]-a[1])/length,(c[0]-a[0])/length]
    misses=[]
    for i in range(1,200):
        u=i/200
        # Exclude 0.8 mm at each pad/via attachment; inspect those with DRC.
        if min(u,1-u)*length<.8:continue
        for offset in [-.25,0,.25]:
            p=[a[k]+u*(c[k]-a[k])+offset*normal[k] for k in range(2)]
            if not poly.Contains(point(p)):misses.append(p)
    # Explicit alternative corridors around the VIN/SEC_A via antipads. These
    # are unobstructed review paths, not predictions of distributed return flow.
    alternatives={'C1.2':[[86,58.66]],'C4.2':[[104,108.8],[99.5,108.8]]}
    route=[a,*alternatives.get(first,[]),c] if misses else [a,c]
    alternate_misses=[]
    for start,end in zip(route,route[1:]):
        distance=math.dist(start,end);n=[-(end[1]-start[1])/distance,(end[0]-start[0])/distance]
        for i in range(201):
            u=i/200
            for offset in [-.25,0,.25]:
                q=[start[k]+u*(end[k]-start[k])+offset*n[k] for k in range(2)]
                if min(math.dist(q,a),math.dist(q,c))<.8:continue
                if not poly.Contains(point(q)):alternate_misses.append(q)
    returns.append({'from':first,'to':last,'net':net,'plane':'B.Cu',
                    'straight_distance_mm':round(length,4),'corridor_width_mm':.5,
                    'sampled_straight_corridor_in_filled_plane':not misses,'straight_miss_count':len(misses),
                    'review_path_mm':route,'review_path_length_mm':sum(math.dist(a,c) for a,c in zip(route,route[1:])),
                    'sampled_review_corridor_in_filled_plane':not alternate_misses,'review_miss_count':len(alternate_misses)})
probes=json.loads((R/'evidence/audit/probe-sites.json').read_text())
for item in probes:
    target=point(item['position_mm']);net='/'+item['net']
    if 'via land' in item['type']:
        hits=[v for v in vias if v.GetPosition()==target and v.GetNetname()==net]
        assert len(hits)==1,item
        v=hits[0];assert v.GetFrontTentingMode()==pcb.TENTING_MODE_NOT_TENTED
        assert v.GetBackTentingMode()==pcb.TENTING_MODE_TENTED
        assert abs(pcb.ToMM(v.GetWidth(pcb.F_Cu))-item['land_diameter_mm'])<1e-6
    else:
        assert any(p.GetPosition()==target and p.GetNetname()==net for p in pad.values()),item
thermals=[]
for ref in ['J1','J2']:
    p=pad[ref+'.2'];assert p.GetLocalZoneConnection()==pcb.ZONE_CONNECTION_THERMAL
    thermals.append({'reference':ref+'.2','gap_mm':pcb.ToMM(p.GetThermalGap()),
                     'spoke_width_mm':pcb.ToMM(p.GetLocalThermalSpokeWidthOverride())})
before=json.loads((R/'evidence/audit/layout-before.json').read_text())
now=json.loads((R/'evidence/audit/pcb-layout-metrics.json').read_text())
assert now['board_sha256']==hashlib.sha256(source.read_bytes()).hexdigest(),'Refresh route measurements for this board first'
changes=[]
for r in now['routes']:
    old=next((x for x in before['routes'] if (x['from'],x['to'])==(r['from'],r['to'])),None)
    if old is None:continue
    changes.append({'from':r['from'],'to':r['to'],'before_mm':old['routed_centerline_mm'],
                    'after_mm':r['routed_centerline_mm'],'reduction_percent':round(100*(1-r['routed_centerline_mm']/old['routed_centerline_mm']),1),
                    'minimum_width_mm':r['minimum_track_width_mm'],'layer_transitions':r['layer_transitions']})
result={'board_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'baseline_commit':'46460970e0e223c8738fd1d8be9bf6b80ef8369b',
        'method':'Actual KiCad objects, filled ground polygons, netted probe features and explicit routed-centerline comparison. Corridor sampling is a projected geometry check, not a current-density model.',
        'route_comparison':changes,'new_filter_routes':[r for r in now['routes'] if any(t.startswith(('C7.','C8.','R8.')) for t in [r['from'],r['to']])],'orthogonal_or_45_degree_tracks':len(tracks)-len(non45),'other_track_angles':non45,
        'SW_routing_layers':sorted({b.GetLayerName(t.GetLayer()) for t in tracks if t.GetNetname()=='/SW'}),
        'SW_added_vias':sum(v.GetNetname()=='/SW' for v in vias),
        'return_planes':planes,'sampled_return_corridors':returns,
        'through_vias':len(vias),'minimum_via_annular_ring_mm':min(pcb.ToMM(v.GetWidth(pcb.F_Cu)-v.GetDrill())/2 for v in vias),
        'connector_ground_thermals':thermals,'named_probe_locations':probes,
        'unpopulated_ground_probe_lands':sum('via land' in p['type'] for p in probes),
        'dedicated_testpoint_component_footprints':sum(ref.startswith('TP') for ref in fps),
        'component_sides':sorted({b.GetLayerName(f.GetLayer()) for f in fps.values()}),
        'review_limits':['No extracted parasitics, EMI or current-density solution.',
                         'No hardware ripple, overshoot, thermal or isolation test.',
                         'Enclosure, wire/tool access, process tolerance and supplier acceptance remain open.']}
assert not non45,non45
assert result['SW_routing_layers']==['F.Cu'] and result['SW_added_vias']==0
assert all(r['sampled_review_corridor_in_filled_plane'] for r in returns)
assert all(p['connected_filled_outlines']==1 for p in planes)
assert result['minimum_via_annular_ring_mm']>=.15
(R/'evidence/audit/complete-layout-checks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ['route_comparison','named_probe_locations','return_planes']},indent=2))
