"""Independent checks of KiCad exports and actual winding polygons. KiCad Python."""
import hashlib, json, re, math, xml.etree.ElementTree as ET
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
parts={p['ref']:p for p in json.loads((ROOT/'circuit.json').read_text())['parts']}
for comp in xml.findall('components/comp'):
    part=parts[comp.attrib['ref']]
    fields={x.attrib['name']:x.text or '' for x in comp.findall('fields/field')}
    for name,key in [('MPN','mpn'),('Manufacturer','mfr'),('LCSC','lcsc')]:
        assert fields.get(name,'')==part[key],('BOM field mismatch',part['ref'],name)
    assert comp.findtext('value')==part['value']
    assert comp.findtext('footprint')==part['footprint']
# Follow actual wire geometry independently of KiCad's named-net merging.
# The main rails and clamp must not regress to disconnected label-only blocks.
schematic=parse((ROOT/'kicad/PS-FLYBACK-5W.kicad_sch').read_text())
libraries={s[1]:s for s in children(child(schematic,'lib_symbols'),'symbol')}
sheet_pins={};pin_directions={}
for symbol in children(schematic,'symbol'):
    ref=next(p[2] for p in children(symbol,'property') if p[1]=='Reference')
    position=child(symbol,'at');x,y,angle=map(float,position[1:4]);theta=math.radians(angle)
    library=libraries[child(symbol,'lib_id')[1]]
    for unit in children(library,'symbol'):
        for pin in children(unit,'pin'):
            px,py=map(float,child(pin,'at')[1:3])
            position=(round(x+px*math.cos(theta)-py*math.sin(theta),6),round(y-px*math.sin(theta)-py*math.cos(theta),6))
            sheet_pins[(ref,child(pin,'number')[1])]=position
            direction=math.radians(float(child(pin,'at')[3])+angle)
            if float(child(pin,'length')[1])>0:
                pin_directions.setdefault(position,set()).add((round(math.cos(direction),6),round(-math.sin(direction),6)))
segments=[tuple((float(p[1]),float(p[2])) for p in child(w,'pts')[1:]) for w in children(schematic,'wire')]
points=set(sheet_pins.values())|{p for segment in segments for p in segment}
points|={tuple(map(float,child(j,'at')[1:3])) for j in children(schematic,'junction')}
def on_segment(p,a,b):
    return (abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<1e-6
            and min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6
            and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6)
# A symbol pin opposite a branch is still a fourth arm. Counting only wire
# endpoints would miss the ground symbols and power flags that prompted this gate.
junction_arms={}
for p in sorted(points):
    arms=set(pin_directions.get(p,set()))
    for a,b in segments:
        if on_segment(p,a,b):
            for end in (a,b):
                length=math.dist(p,end)
                if length>1e-6:arms.add((round((end[0]-p[0])/length,6),round((end[1]-p[1])/length,6)))
    junction_arms[p]=len(arms)
four_way=[p for p,arms in junction_arms.items() if arms>=4]
assert not four_way,('Four-way schematic connections (including symbol pins)',four_way)
parent={p:p for p in points}
def wire_root(p):
    while parent[p]!=p:
        parent[p]=parent[parent[p]];p=parent[p]
    return p
for a,b in segments:
    hits=sorted(p for p in points if abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<1e-6
                and min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6
                and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6)
    for p in hits:parent[wire_root(p)]=wire_root(a)
continuous={
    'VIN':['D1.1','T1.1','R6.1','D4.2','U1.3','R1.1','C1.1','C2.1','R8.1'],
    'SW':['T1.2','U1.5','R3.1','C6.2','D3.2'],
    'PGND':['J1.2','C1.2','C2.2','U1.4','U1.9','C5.2','R2.2','R4.2','C7.2'],
    '+5V_ISO':['D2.1','C3.1','C4.1','C8.1','R7.1','J2.1'],
    'GND_ISO':['T1.3','C3.2','C4.2','C8.2','R7.2','J2.2'],
}
wire_groups={}
for name,members in continuous.items():
    roots={wire_root(sheet_pins[tuple(member.split('.'))]) for member in members}
    assert len(roots)==1,('label-only connection or broken wire',name)
    wire_groups[name]=next(iter(roots))
assert len(set(wire_groups.values()))==len(wire_groups),'Different supply/return rails are joined by wires'

tree=parse((ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb').read_text())
f=next(f for f in children(tree,'footprint') if f[1].endswith('Planar_EELP22_4T_2T'))
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
stack_spec=json.loads((ROOT/'stackup.json').read_text())
assert abs(thickness-stack_spec['published_copper_plus_dielectric_mm'])<1e-8
assert [float(child(l,'thickness')[1]) for l in layers if child(l,'type')[1]=='copper']==stack_spec['copper_mm']
assert board.GetCopperLayerCount()==6
bounds=json.loads((ROOT/'layout.json').read_text())['board_bounds_mm']
assert pcb.ToMM(board.GetDesignSettings().GetAuxOrigin().x)==bounds[0]
assert pcb.ToMM(board.GetDesignSettings().GetAuxOrigin().y)==bounds[3]
drc=json.loads((ROOT/'evidence/board-drc.json').read_text())
assert not drc['violations'] and not drc['unconnected_items'] and not drc.get('schematic_parity',[])
rules=json.loads((ROOT/'kicad/PS-FLYBACK-5W.kicad_pro').read_text())['board']['design_settings']['rules']
assert json.loads((ROOT/'kicad/PS-FLYBACK-5W.kicad_pro').read_text())['erc']['rule_severities']['four_way_junction']=='error'
for key,value in {'min_clearance':.2,'min_track_width':.2,'min_via_diameter':.6,'min_through_hole_diameter':.3}.items():
    assert rules[key]==value,('inactive fabrication rule',key,rules[key])
mechanical=json.loads((ROOT/'mechanical.json').read_text())
required_radius=mechanical['copper_exclusion_diameter_mm']/2
mask_margin=mechanical['copper_to_mask_margin_mm']
assert required_radius>=5 and mask_margin>=1.8
mounting=[]
copper_layers=[pcb.F_Cu,pcb.In1_Cu,pcb.In2_Cu,pcb.In3_Cu,pcb.In4_Cu,pcb.B_Cu]
for h in mechanical['holes']:
    f=next(f for f in board.GetFootprints() if f.GetReference()==h['ref'])
    assert f.GetFPID().GetLibItemName()==mechanical['mounting_footprint'].split(':')[1]
    pads=list(f.Pads());assert len(pads)==1
    pad=pads[0];assert pad.GetAttribute()==pcb.PAD_ATTRIB_NPTH and not pad.GetNetCode()
    assert abs(pcb.ToMM(pad.GetDrillSize().x)-3.2)<1e-6
    assert abs(pcb.ToMM(pad.GetLocalClearance())-(required_radius-1.6))<1e-6
    assert abs(pcb.ToMM(f.GetPosition().x)-h['x_mm'])<1e-6 and abs(pcb.ToMM(f.GetPosition().y)-h['y_mm'])<1e-6
    assert abs((f.GetOrientationDegrees()-h.get('rotation_deg',0))%360)<1e-6
    assert f.IsExcludedFromBOM() and f.IsExcludedFromPosFiles()
    keepouts=list(f.Zones())
    if mechanical.get('variant')=='Edge':
        assert len(keepouts)==1 and keepouts[0].GetIsRuleArea()
        assert all(keepouts[0].IsOnLayer(l) for l in copper_layers)
        for layer in [pcb.F_Mask,pcb.B_Mask]:
            assert any(g.GetLayer()==layer and g.GetShape()==pcb.SHAPE_T_POLY for g in f.GraphicalItems())
    per_layer={}
    for layer in copper_layers:
        shapes=[]
        for t in board.GetTracks():
            if t.IsOnLayer(layer):shapes.append(t.GetEffectiveShape(layer))
        for other in board.GetFootprints():
            for p in other.Pads():
                if p.GetAttribute()!=pcb.PAD_ATTRIB_NPTH and p.IsOnLayer(layer):shapes.append(p.GetEffectiveShape(layer))
            for g in other.GraphicalItems():
                if g.GetLayer()==layer:shapes.append(g.GetEffectiveShape())
        for zone in board.Zones():
            if zone.IsOnLayer(layer) and not zone.GetIsRuleArea():shapes.append(zone.GetFilledPolysList(layer))
        distances=[pcb.ToMM(s.Distance(f.GetPosition())) for s in shapes]
        nearest=min(distances) if distances else None
        assert nearest is None or nearest>=required_radius-.01,(h['ref'],board.GetLayerName(layer),nearest)
        # Also test the complete exposed-substrate outline, including its edge
        # extension. No soldermask insulation credit is taken on any copper layer.
        mask=next(g.GetEffectiveShape() for g in f.GraphicalItems() if g.GetLayer()==pcb.F_Mask and g.GetShape()==pcb.SHAPE_T_POLY)
        assert not any(mask.Collide(s,pcb.FromMM(mask_margin-.01)) for s in shapes),(h['ref'],board.GetLayerName(layer),'mask-extension margin')
        # The Edge variant also clears copper outside the circular exclusion.
        # Check its complete transformed extension against actual layer copper.
        for keepout in keepouts:
            assert not any(keepout.Outline().Collide(s) for s in shapes),(h['ref'],board.GetLayerName(layer),'extension intersects copper')
        per_layer[board.GetLayerName(layer)]=nearest
    mounting.append({'reference':h['ref'],'drill_mm':3.2,'x_mm':h['x_mm'],'y_mm':h['y_mm'],
                     'nearest_copper_from_center_mm':per_layer,'excluded_from_BOM_CPL':True,
                     'footprint':str(f.GetFPID().GetLibItemName()),'rotation_deg':f.GetOrientationDegrees(),
                     'all_layer_extension_clear':True if keepouts else None,
                     'all_layer_mask_margin_checked_mm':mask_margin-.01})
(ROOT/'evidence/audit/mounting-checks.json').write_text(json.dumps({'holes':mounting,'required_copper_radius_mm':required_radius,'nominal_copper_to_mask_margin_mm':mask_margin,'maximum_hardware_contact_diameter_mm':mechanical['maximum_hardware_contact_diameter_mm'],'geometry_tolerance_mm':.01,'rules':rules,'source_SHA256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['kicad/PS-FLYBACK-5W.kicad_pcb','mechanical.json']}},indent=2))
out={'schematic_board_logical_pins_matched':len(bp),'physical_numbered_pads_checked':physical,'winding_polygon_count':len(polys),'polygon_terminal_contacts':{k:sorted(v) for k,v in expect.items()},'centerline_samples_inside_final_copper':samples,'stack_thickness_mm':thickness,'copper_layers':6,'drc_violations':0,'unconnected_items':0,'scope':'Final-board copper polygon containment and pin net agreement. Does not prove inductance, dielectric withstand, gap fringing or manufactured quality.'}
out['schematic_continuous_wire_groups']=continuous
out['schematic_junctions']={'four_way_connections':len(four_way),'maximum_connection_arms':max(junction_arms.values()),
                           'three_way_connections':sum(n==3 for n in junction_arms.values()),'includes_symbol_pin_stubs':True}
(ROOT/'evidence/independent-checks.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
