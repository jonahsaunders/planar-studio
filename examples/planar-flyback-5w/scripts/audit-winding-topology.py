"""Independent Shapely analysis of saved-board copper exported by pcbnew."""
import json
import math
import argparse
from collections import defaultdict
from pathlib import Path
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union, nearest_points
from shapely.validation import explain_validity

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT
parser=argparse.ArgumentParser()
parser.add_argument('--geometry',type=Path,default=ROOT/'.kicad-config/copper-audit-geometry.json')
parser.add_argument('--artwork',type=Path,default=ROOT/'planar-studio/T1-artwork.json')
parser.add_argument('--output',type=Path,default=ROOT/'evidence/audit/copper-topology-checks.json')
args=parser.parse_args()
data=json.loads(args.geometry.read_text())
items=data['items']
layers=['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','B.Cu']
geom={}
normalizations=[]
for item in items:
    for layer,ps in item['geometry'].items():
        poly=unary_union([Polygon(p['shell'],p['holes']) for p in ps])
        if not poly.is_valid:
            # KiCad fills use zero-width bridges to represent interior rings.
            # GEOS normalizes these weakly-simple outlines without changing area.
            clean=poly.buffer(0)
            delta=abs(clean.area-poly.area)
            assert clean.is_valid and delta<1e-7,(item['name'],layer,delta)
            normalizations.append([item['name'],layer,explain_validity(poly),delta])
            poly=clean
        geom[item['name'],layer]=poly

def components(poly):
    return list(poly.geoms) if hasattr(poly,'geoms') else [poly]

def layer_unions(exclude=None):
    return {l:unary_union([g for (n,ly),g in geom.items() if ly==l and (n,l)!=exclude]) for l in layers}

def connectivity(unions):
    nodes={}
    for l,poly in unions.items():
        for k,g in enumerate(components(poly)):
            if not g.is_empty: nodes[l,k]=g
    parent={n:n for n in nodes}
    def root(n):
        while parent[n]!=n:
            parent[n]=parent[parent[n]];n=parent[n]
        return n
    def union(a,b): parent[root(a)]=root(b)
    labels={}
    for item in items:
        if item['kind'] not in ['via','pad']: continue
        # Points lie at the solid annulus center; treating the drill as filled
        # is a connectivity-only abstraction, not a copper-area measurement.
        pt=Point(item['position'])
        hits=[n for n,g in nodes.items() if n[0] in item['geometry'] and g.covers(pt)]
        if item['barrel']:
            for n in hits[1:]:union(hits[0],n)
        if item['kind']=='pad':
            labels[item['name']]=hits
    return {name:{root(n) for n in ns} for name,ns in labels.items()}

base=layer_unions()
connected=connectivity(base)
netgroups=defaultdict(set)
missing=[]
for item in items:
    if item['kind']!='pad' or not item['net']:continue
    ns=connected[item['name']]
    if not ns:missing.append(item['name'])
    for n in ns:netgroups[n].add(item['net'])
allowed=[{'/VIN','/SW','unconnected-(T1-P_MID-Pad5)'},{'/GND_ISO','/SEC_A'}]
unexpected=[sorted(s) for s in netgroups.values() if len(s)>1 and s not in allowed]
netcomponents=defaultdict(set)
for n,ns in netgroups.items():
    for net in ns:netcomponents[net].add(n)
opens={n:len(c) for n,c in netcomponents.items() if len(c)>1}
report={'board_sha256':data['board_sha256'],'net_ties':data['net_ties'],
        'zone_outline_normalizations':normalizations,
        'copper_graphics':sum(i['kind']=='graphic' for i in items),
        'physical_connected_pad_net_groups':[sorted(s) for s in netgroups.values()],
        'unexpected_net_merges':unexpected,'missing_pad_contacts':missing,'split_nets':opens,
        'layers':{},'cut_tests':{}}
print('Physical connectivity:',json.dumps({k:report[k] for k in ['unexpected_net_merges','missing_pad_contacts','split_nets']}),flush=True)

art=json.loads(args.artwork.read_text())
terminals={'F.Cu':('T1.1','T1.5'),'B.Cu':('T1.5','T1.2'),'In1.Cu':('T1.3','T1.4'),'In4.Cu':('T1.3','T1.4')}
windings={l:n for (n,l) in geom if n.startswith('T1.graphic')}
for track in art['tracks']:
    layer=track['layer'];width=track['width']
    pts=[(100+x,85-y) for x,y in track['pts']]
    segs=[LineString([a,b]) for a,b in zip(pts,pts[1:])]
    cum=[0]
    for s in segs:cum.append(cum[-1]+s.length)
    best=(1e9,None,None)
    close=[]
    for i,s in enumerate(segs):
        for j in range(i+1,len(segs)):
            # Segments within 2 mm along the path are adjacent conductor,
            # not neighboring turns; retain all other geometric pairs.
            if cum[j]-cum[i+1]<2:continue
            gap=s.distance(segs[j])-width
            if gap<best[0]:best=(gap,i,j)
            if gap<.198:close.append([i,j,gap])
    actual=geom[windings[layer],layer]
    expected=LineString(pts).buffer(width/2,quad_segs=128)
    # The expected stroke approximation is much finer than the KiCad polygon.
    # Report boundary deviation, without treating this as a library identity check.
    record={'segments':len(segs),'length_mm':cum[-1],
            'winding_components':len(components(actual)),
            'winding_holes':sum(len(p.interiors) for p in components(actual)),
            'nonlocal_turn_gap_min_mm':best[0], 'closest_segments':best[1:],
            'closest_centerline_points':[list(p.coords)[0] for p in nearest_points(segs[best[1]],segs[best[2]])],
            'turn_gap_below_0_198_mm':close,
            'centerline_stroke_boundary_deviation_mm':actual.boundary.hausdorff_distance(expected.boundary)}
    p0,p1=record['closest_centerline_points']
    local=actual.intersection(box(min(p0[0],p1[0])-.5,min(p0[1],p1[1])-.5,
                                  max(p0[0],p1[0])+.5,max(p0[1],p1[1])+.5))
    pieces=components(local)
    assert len(pieces)==2,(layer,len(pieces))
    record['saved_polygon_local_gap_mm']=pieces[0].distance(pieces[1])
    record['saved_polygon_gap_endpoints']=[list(p.coords)[0] for p in nearest_points(*pieces)]
    report['layers'][layer]=record
    print(layer,'spacing',json.dumps({k:v for k,v in record.items() if k!='turn_gap_below_0_198_mm'}),flush=True)
    # Remove the other deliberately parallel secondary winding, retaining
    # all routes, pads, and barrels, to expose any bypass of this branch.
    if layer.startswith('In'):
        other='In4.Cu' if layer=='In1.Cu' else 'In1.Cu'
        unions=layer_unions((windings[other],other))
        terminal_pair=('T1.3','T1.4')
    else:
        unions=base
        terminal_pair=('T1.1','T1.2')
    valid=connectivity(unions)
    assert valid[terminal_pair[0]] & valid[terminal_pair[1]],('baseline open',layer)
    failures=[];tested=0;skipped=0;invalid_cuts=[]
    for i,(a,b) in enumerate(zip(pts,pts[1:])):
        distance=(cum[i]+cum[i+1])/2
        if min(distance,cum[-1]-distance)<.45:
            skipped+=1;continue
        length=math.dist(a,b)
        if length<.00001:continue
        x=(a[0]+b[0])/2;y=(a[1]+b[1])/2
        dx=(b[0]-a[0])/length;dy=(b[1]-a[1])/length
        # A 0.024 mm wide cut crosses the 0.6 mm conductor, with 0.18 mm
        # beyond each edge; neighboring turns are ~0.2 mm farther away.
        cutter=Polygon([(x+dx*u-dy*v,y+dy*u+dx*v)
                        for u,v in [(-.012,-.48),(.012,-.48),(.012,.48),(-.012,.48)]])
        # At short corner segments the adjacent segment may extend around
        # the cutter. Such a cut cannot establish a bypass, so exclude it.
        severed=components(expected.difference(cutter))
        first=Point(pts[0]);last=Point(pts[-1])
        if any(g.covers(first) and g.covers(last) for g in severed):
            invalid_cuts.append(i);continue
        changed=dict(unions);changed[layer]=unions[layer].difference(cutter)
        state=connectivity(changed);tested+=1
        if state[terminal_pair[0]] & state[terminal_pair[1]]:
            failures.append({'segment':i,'position':[x,y],'distance_from_start_mm':distance})
    report['cut_tests'][layer]={'tested':tested,'terminal_zone_skipped':skipped,'invalid_corner_cuts':invalid_cuts,'bypasses':failures}
    print(layer,'cut test',tested,'bypasses',len(failures),json.dumps(failures[:8]),flush=True)

report['scope']='Physical copper connectivity with all six layers and plated barrels; nonlocal winding segment spacing; one virtual cut per eligible centerline segment. Other secondary winding removed for each parallel-branch cut test. Does not model component conduction, dielectric manufacture, thermal or magnetic performance.'
args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')

assert not unexpected and not missing and not opens, 'Unexpected physical connectivity'
assert all(not r['bypasses'] for r in report['cut_tests'].values()), 'Winding bypass detected'
assert all(r['saved_polygon_local_gap_mm']>=.20 for r in report['layers'].values()), 'Turn spacing below minimum'
print('All six-layer physical connectivity and virtual-cut checks passed.')
