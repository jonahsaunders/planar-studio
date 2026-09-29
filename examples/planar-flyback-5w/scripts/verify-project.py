"""Independent checks of KiCad exports and actual winding polygons. KiCad Python."""
import json, re, math, xml.etree.ElementTree as ET
from pathlib import Path
import pcbnew as pcb
ROOT=Path(__file__).resolve().parents[1]
def parse(s):
    stack=[];root=[];current=root
    for t in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+',s):
        if t=='(':a=[];current.append(a);stack.append(current);current=a
        elif t==')':current=stack.pop()
        else:current.append(json.loads(t) if t.startswith('"') else t)
    assert not stack
    return root[0]
def children(s,name):return [x for x in s if isinstance(x,list) and x[0]==name]
def child(s,name):return children(s,name)[0]
def contains(p,poly):
    x,y=p;inside=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
    return inside
board=pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
xml=ET.parse(ROOT/'evidence/schematic-netlist.xml').getroot()
sch={(n.attrib['ref'],n.attrib['pin']):net.attrib['name'] for net in xml.findall('nets/net') for n in net.findall('node')}
bp={}
physical=0
for f in board.GetFootprints():
    for p in f.Pads():
        if not p.GetNumber():continue
        key=(f.GetReference(),p.GetNumber());net=p.GetNetname();physical+=1
        assert key in sch,('extra board pad',key)
        assert sch[key]==net,('net mismatch',key,sch[key],net)
        bp[key]=net
assert set(bp)==set(sch),(set(sch)-set(bp),set(bp)-set(sch))
assert {x.attrib['ref'] for x in xml.findall('components/comp')}=={f.GetReference() for f in board.GetFootprints()}
tree=parse((ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb').read_text())
f=next(f for f in children(tree,'footprint') if f[1].endswith('Planar_EELP32_4T_2T'))
polys={child(p,'layer')[1]:[(float(x[1]),float(x[2])) for x in child(p,'pts')[1:]] for p in children(f,'fp_poly')}
coords={p[1]:(float(child(p,'at')[1]),float(child(p,'at')[2])) for p in children(f,'pad')}
expect={'F.Cu':{'1','5'},'B.Cu':{'2','5'},'In1.Cu':{'3','4'},'In4.Cu':{'3','4'}}
assert len(polys)==4
for layer,poly in polys.items():
    hits={n for n,p in coords.items() if contains(p,poly)}
    assert hits==expect[layer],(layer,hits,expect[layer])
# Inspect every generated centerline sample against the final board conductor,
# independently of the intermediate footprint library and net-tie declaration.
art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text())
samples=0
for t in art['tracks']:
    for a,b in zip(t['pts'],t['pts'][1:]):
        steps=max(2,math.ceil(math.dist(a,b)/.05))
        for i in range(steps+1):
            u=i/steps;p=(a[0]*(1-u)+b[0]*u,-a[1]*(1-u)-b[1]*u)
            assert contains(p,polys[t['layer']]),('missing winding copper',t['layer'],p)
            samples+=1
setup=child(tree,'setup');stack=child(setup,'stackup')
layers=children(stack,'layer');thickness=sum(float(child(l,'thickness')[1]) for l in layers if children(l,'thickness'))
assert abs(thickness-1.6)<1e-8
assert board.GetCopperLayerCount()==6
assert pcb.ToMM(board.GetDesignSettings().GetAuxOrigin().x)==75
assert pcb.ToMM(board.GetDesignSettings().GetAuxOrigin().y)==137
drc=json.loads((ROOT/'evidence/board-drc.json').read_text())
assert not drc['violations'] and not drc['unconnected_items']
out={'schematic_board_logical_pins_matched':len(bp),'physical_numbered_pads_checked':physical,'winding_polygon_count':len(polys),'polygon_terminal_contacts':{k:sorted(v) for k,v in expect.items()},'centerline_samples_inside_final_copper':samples,'stack_thickness_mm':thickness,'copper_layers':6,'drc_violations':0,'unconnected_items':0,'scope':'Final-board copper polygon containment and pin net agreement. Does not prove inductance, dielectric withstand, gap fringing or manufactured quality.'}
(ROOT/'evidence/independent-checks.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
