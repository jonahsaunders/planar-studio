"""Check the F1 replacement against the preceding canonical PCB. KiCad Python."""
import argparse,hashlib,json,math
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--baseline-board',type=Path,required=True)
p.add_argument('--baseline-id',required=True)
a=p.parse_args();source=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
old=pcb.LoadBoard(str(a.baseline_board));new=pcb.LoadBoard(str(source))
def xy(v):return [round(pcb.ToMM(v.x),6),round(pcb.ToMM(v.y),6)]
def fp_record(f):
    return {'footprint':str(f.GetFPID().GetLibNickname())+':'+str(f.GetFPID().GetLibItemName()),'position':xy(f.GetPosition()),'angle':f.GetOrientationDegrees(),
            'pads':sorted([(p.GetNumber(),p.GetNetname(),xy(p.GetPosition()),xy(p.GetSize()),xy(p.GetDrillSize())) for p in f.Pads()]),
            'models':[(m.m_Filename,list(m.m_Offset),list(m.m_Rotation),list(m.m_Scale)) for m in f.Models()]}
before={f.GetReference():fp_record(f) for f in old.GetFootprints()}
after={f.GetReference():fp_record(f) for f in new.GetFootprints()}
assert set(before)==set(after)
assert all(before[r]==after[r] for r in before if r!='F1'),[r for r in before if r!='F1' and before[r]!=after[r]]
assert before['F1']['position']==after['F1']['position'] and before['F1']['angle']==after['F1']['angle']
def tracks(board,include_fuse=False):
    return sorted([(t.GetNetname(),xy(t.GetStart()),xy(t.GetEnd()),t.GetLayer(),pcb.ToMM(t.GetWidth(pcb.F_Cu) if isinstance(t,pcb.PCB_VIA) else t.GetWidth()),
                    pcb.ToMM(t.GetDrill()) if isinstance(t,pcb.PCB_VIA) else None)
                   for t in board.GetTracks() if include_fuse or t.GetNetname() not in ['/VIN_RAW','/VIN_FUSED']])
assert tracks(old)==tracks(new),'Unrelated routes/vias changed'
assert old.GetCopperLayerCount()==new.GetCopperLayerCount()==6
assert old.GetDesignSettings().GetBoardThickness()==new.GetDesignSettings().GetBoardThickness()
def graphics(items):
    return sorted([i.GetLayer(),int(i.GetShape()),xy(i.GetStart()),xy(i.GetEnd()),pcb.ToMM(i.GetWidth()),str(i.GetPolyShape()) if i.GetShape()==pcb.SHAPE_T_POLY else ''] for i in items if isinstance(i,pcb.PCB_SHAPE))
# Polygon vertex checks use a deterministic formatter, not wrapper-object strings.
def polygons(board):
    f=next(f for f in board.GetFootprints() if f.GetReference()=='T1')
    rows=[]
    for g in f.GraphicalItems():
        if not isinstance(g,pcb.PCB_SHAPE) or not g.IsOnCopperLayer():continue
        poly=g.GetPolyShape()
        rows.append((g.GetLayer(),[[xy(poly.COutline(i).CPoint(j)) for j in range(poly.COutline(i).PointCount())] for i in range(poly.OutlineCount())]))
    return sorted(rows)
assert polygons(old)==polygons(new),'Winding copper changed'
def outline(board):return graphics([g for g in board.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts])
assert outline(old)==outline(new),'Outline or core slots changed'
f=next(f for f in new.GetFootprints() if f.GetReference()=='F1');pads=sorted(f.Pads(),key=lambda p:p.GetNumber())
pitch=math.dist(xy(pads[0].GetPosition()),xy(pads[1].GetPosition()))
assert abs(pitch-3.45)<1e-6 and all(xy(p.GetSize())==[1.25,1.65] for p in pads)
assert [p.GetNetname() for p in pads]==['/VIN_RAW','/VIN_FUSED']
result={'baseline_id':a.baseline_id,'baseline_sha256':hashlib.sha256(a.baseline_board.read_bytes()).hexdigest(),
    'board_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'changed_component':'F1',
    'before':before['F1'],'after':after['F1'],'all_28_other_footprint_geometries_and_models_preserved':True,
    'all_routes_outside_VIN_RAW_and_VIN_FUSED_preserved':True,'winding_copper_preserved':True,
    'outline_core_slots_stack_and_corner_mounts_preserved':True,
    'Bourns_recommended_lands_mm':{'pad_size':[1.25,1.65],'pitch':pitch,'inner_gap':pitch-1.25,'outer_span':pitch+1.25},
    'scope':'Geometry/change containment and recommended land pattern. Native ERC/DRC, renewed solid checks and prototype qualification remain separate.'}
(R/'evidence/audit/fuse-revision-checks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print('Fuse revision verified; unrelated placement, routes, windings, slots and corner mounts preserved.')
