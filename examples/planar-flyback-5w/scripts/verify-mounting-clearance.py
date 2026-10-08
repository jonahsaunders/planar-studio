"""Compare enlarged mounting clearances with the first published A3 board."""
import hashlib,json,math,os,subprocess,tempfile
from collections import Counter
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
repo=Path(os.environ.get('PLANAR_STUDIO_ROOT',R.parents[1]))
baseline='37d2d9902e33ca4f4d6eff5d8464f795305074fd'
file=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
mechanical=json.loads((R/'mechanical.json').read_text())
def point(p):return p.x,p.y
def routing(board,move=False):
    result=[]
    for t in board.GetTracks():
        if isinstance(t,pcb.PCB_VIA):
            p=point(t.GetPosition())
            if move and p==(pcb.FromMM(85.5),pcb.FromMM(45)):
                assert t.GetNetname()=='/PGND';p=(pcb.FromMM(86),pcb.FromMM(47))
            result.append(('via',t.GetNetname(),p,t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()))
        else:result.append(('track',t.GetNetname(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())])),t.GetWidth(),t.GetLayer()))
    return Counter(result)
allowed=pcb.SHAPE_POLY_SET()
for h in mechanical['holes']:
    x,y=h['x_mm'],h['y_mm']
    # Bound the changed mounting clearance plus the single nearby stitching via.
    p=pcb.SHAPE_POLY_SET();p.NewOutline()
    for i in range(128):
        angle=2*math.pi*i/128
        p.Append(pcb.FromMM(x+6.25*math.cos(angle)),pcb.FromMM(y+6.25*math.sin(angle)))
    allowed.BooleanAdd(p)
    edge=77 if h['rotation_deg']==180 else 123
    p=pcb.SHAPE_POLY_SET();p.NewOutline()
    for a,b in [(x,y-5.5),(edge,y-5.5),(edge,y+5.5),(x,y+5.5)]:p.Append(pcb.FromMM(a),pcb.FromMM(b))
    allowed.BooleanAdd(p)
with tempfile.TemporaryDirectory(dir=R/'.kicad-config',prefix='mount-clearance-') as tmp:
    oldfile=Path(tmp)/'A3.kicad_pcb'
    oldfile.write_bytes(subprocess.check_output(['git','show',f'{baseline}:examples/planar-flyback-5w/kicad/PS-FLYBACK-5W.kicad_pcb'],cwd=repo))
    old=pcb.LoadBoard(str(oldfile));new=pcb.LoadBoard(str(file))
    assert routing(old,True)==routing(new),'Unexpected route or via change'
    def zones(board):return {(z.GetNetname(),z.GetLayer()):z.GetFilledPolysList(z.GetLayer()) for z in board.Zones()}
    before,after=zones(old),zones(new);assert before.keys()==after.keys();rows=[]
    for key,a in before.items():
        b=after[key]
        removed=pcb.SHAPE_POLY_SET(a);removed.BooleanSubtract(b)
        added=pcb.SHAPE_POLY_SET(b);added.BooleanSubtract(a)
        changed=pcb.SHAPE_POLY_SET(removed);changed.BooleanAdd(added);changed.BooleanSubtract(allowed)
        outside=changed.Area()/1e12
        assert outside<.0001,('Ground pour changed outside mounting areas',key,outside)
        rows.append({'net':key[0],'layer':new.GetLayerName(key[1]),'previous_A3_mm2':a.Area()/1e12,'current_A3_mm2':b.Area()/1e12,'removed_mm2':removed.Area()/1e12,'added_mm2':added.Area()/1e12,'changed_outside_mounting_regions_mm2':outside})
result={'baseline_commit':baseline,'unchanged_track_geometry_widths_layers':True,'unchanged_via_count_drills_diameters':True,
 'single_PGND_via_move_mm':{'from':[85.5,45],'to':[86,47]},'ground_pour_changes_confined_to_mounting_regions':True,'ground_planes':rows,
 'previous_copper_exclusion_diameter_mm':6.8,'current_copper_exclusion_diameter_mm':10,'previous_mask_margin_mm':.2,'current_mask_margin_mm':1.8,
 'source_SHA256':{f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in ['kicad/PS-FLYBACK-5W.kicad_pcb','mechanical.json']}}
(R/'evidence/audit/mounting-clearance-comparison.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
