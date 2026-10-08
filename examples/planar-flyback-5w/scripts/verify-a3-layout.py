"""Prove the compact A3 layout preserves A2 winding, local routing and electronics."""
import hashlib,json,math,os,subprocess,tempfile
from collections import Counter
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
repo=Path(os.environ.get('PLANAR_STUDIO_ROOT',R.parents[1]))
cfg=json.loads((R/'layout.json').read_text());base=cfg['baseline_commit']
def original(name):return subprocess.check_output(['git','show',f'{base}:examples/planar-flyback-5w/{name}'],cwd=repo)
assert json.loads(original('circuit.json'))==json.loads((R/'circuit.json').read_text()),'Electronic circuit changed'
assert json.loads(original('planar-studio/T1-artwork.json'))==json.loads((R/'planar-studio/T1-artwork.json').read_text()),'Winding/cutout artwork changed'
def point(p):return p.x,p.y
def transform(p):
    x,y=p
    dy=5 if y<pcb.FromMM(69) else -5 if y>pcb.FromMM(102) else 0
    return x,y+pcb.FromMM(dy)
def footprint(f):
    return sorted((p.GetNumber(),p.GetNetname(),*point(p.GetPosition()),*point(p.GetSize()),*point(p.GetDrillSize())) for p in f.Pads())
def tracks(board,move=False):
    records=[];changed=[]
    for t in board.GetTracks():
        if isinstance(t,pcb.PCB_VIA):
            p=point(t.GetPosition());q=transform(p) if move else p
            if move and p==(pcb.FromMM(84.5),pcb.FromMM(40)):
                assert t.GetNetname()=='/PGND';q=(pcb.FromMM(86),pcb.FromMM(47))
            records.append(('via',t.GetNetname(),q,t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()))
        else:
            p,q=point(t.GetStart()),point(t.GetEnd());a,b=(transform(p),transform(q)) if move else (p,q)
            records.append(('track',t.GetNetname(),tuple(sorted([a,b])),t.GetWidth(),t.GetLayer()))
            if move and (a[1]-p[1])!=(b[1]-q[1]):
                before=math.dist(p,q)/1e6;after=math.dist(a,b)/1e6
                assert after<before,'Transformer connection grew'
                changed.append({'net':t.GetNetname(),'width_mm':pcb.ToMM(t.GetWidth()),'layer':board.GetLayerName(t.GetLayer()),'before_mm':before,'after_mm':after})
    return Counter(records),changed
with tempfile.TemporaryDirectory(dir=R/'.kicad-config',prefix='a3-baseline-') as temp:
    file=Path(temp)/'A2.kicad_pcb';file.write_bytes(original('kicad/PS-FLYBACK-5W.kicad_pcb'))
    old=pcb.LoadBoard(str(file))
    new=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'))
    oldfps={f.GetReference():f for f in old.GetFootprints()};newfps={f.GetReference():f for f in new.GetFootprints()}
    assert set(oldfps)==set(newfps)
    for ref,f in oldfps.items():
        if ref.startswith('H'):continue
        g=newfps[ref];assert f.GetOrientationDegrees()==g.GetOrientationDegrees()
        expected=[]
        for p in footprint(f):
            q=transform(p[2:4]) if ref!='T1' else p[2:4]
            expected.append((*p[:2],*q,*p[4:]))
        assert sorted(expected)==footprint(g),('Moved/resized pad',ref,expected,footprint(g))
    expected,leads=tracks(old,True);actual,_=tracks(new)
    assert expected==actual,('Routing changed',expected-actual,actual-expected)
    def polygons(f):
        out=[]
        for g in f.GraphicalItems():
            if g.GetLayer() in [pcb.F_Cu,pcb.In1_Cu,pcb.In4_Cu,pcb.B_Cu]:
                poly=g.GetPolyShape();out.append((g.GetLayer(),tuple(tuple(point(poly.COutline(i).CPoint(j)) for j in range(poly.COutline(i).PointCount())) for i in range(poly.OutlineCount()))))
        return sorted(out)
    assert polygons(oldfps['T1'])==polygons(newfps['T1']),'Saved winding polygons changed'
    def areas(board):
        return {(z.GetNetname(),board.GetLayerName(z.GetLayer())):z.GetFilledPolysList(z.GetLayer()).Area()/1e12 for z in board.Zones()}
    a,b=areas(old),areas(new);plane=[]
    for key in a:
        # Larger mounting clearance deliberately removes corner copper. The
        # separate mounting comparison proves changes stay in those regions.
        assert b[key]/a[key]>.96,('Ground plane area reduced >4% after enlarged mounting clearances',key,a[key],b[key])
        plane.append({'net':key[0],'layer':key[1],'A2_mm2':a[key],'A3_mm2':b[key],'retained_fraction':b[key]/a[key]})
    assert old.GetDesignSettings().GetBoardThickness()==new.GetDesignSettings().GetBoardThickness()
    assert old.GetCopperLayerCount()==new.GetCopperLayerCount()==6
record={'baseline_commit':base,'unchanged_circuit':True,'unchanged_winding_polygons_and_artwork':True,
 'unchanged_local_route_widths_layers_geometry_and_via_count':True,'electronic_blocks_translated_mm':{'primary':[0,5],'secondary':[0,-5]},
 'one_ground_stitching_via_exception':'A2 (84.5,40) -> A3 (86,47), to clear the enlarged H1 reservation; unchanged drill and copper diameter.',
 'shortened_transformer_connection_segments':leads,'ground_plane_areas':plane,
 'A2_board_mm':[50,104],'A3_board_mm':[44,94],'area_reduction_percent':100*(1-44*94/(50*104)),
 'mounting_pattern_changed_mm':{'A2':[41,95],'A3':[35,85]},'scope':'Geometric preservation and connectivity; no hardware EMI, thermal or control validation.',
 'source_SHA256':{f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in ['kicad/PS-FLYBACK-5W.kicad_pcb','circuit.json','layout.json','planar-studio/T1-artwork.json']}}
(R/'evidence/audit/a3-layout-comparison.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print(json.dumps(record,indent=2))
