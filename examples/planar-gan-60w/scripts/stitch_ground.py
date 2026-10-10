"""Add ground stitching only where two existing filled reference layers overlap.

Executed by rebuild_board after mechanical holes and the first complete fill.
Candidate rows are deliberately outside the winding/core envelope. No stitch
joins domains, crosses the isolation corridor, or ties AGND to PGND.
"""
layers=[F,I1,I2,I3,I4,I5,I6,B]
occupied=list(board.GetTracks())
pad_shapes=[(pd.GetNetname(),pd.GetEffectiveShape(l)) for fp in board.GetFootprints() for pd in fp.Pads() for l in layers if pd.IsOnLayer(l)]
track_shapes=[(t.GetNetname(),t.GetEffectiveShape(t.GetLayer())) for t in occupied]
edges=[s.GetEffectiveShape(pcb.Edge_Cuts) for s in board.GetDrawings() if s.GetLayer()==pcb.Edge_Cuts]
fills=[(z.GetNetname(),z.GetLayer(),z.GetFilledPolysList(z.GetLayer())) for z in board.Zones() if not z.GetIsRuleArea()]
rows={
 'PGND': [(x,y) for y in [2,6,10,14,18,22,26,30,34,38,42,46,48] for x in [39,43,47,51,54]],
 'AGND': [(x,y) for y in [31,35,39,43,47] for x in [19,23,27,31,35]]+[(x,y) for y in [4,8] for x in [39,43,47,51]],
 'SGND': [(x,y) for y in [6,10,14,18,22,26,30,34,38,42,46,48] for x in [-3,1,5,9,13,16]],
}
added=[]
silk=[]
for item in board.GetDrawings():
 if item.GetLayer()==pcb.F_SilkS:
  box=item.GetBoundingBox();box.Inflate(mm(.55));silk.append(box)
for net,points in rows.items():
 native=nets[net].GetNetname()
 for x,y in points:
  if 9<x<37.5 and y<29.5:continue # No conductive stitch loops through the magnetic assembly.
  q=pt(x+60,y+60)
  if any(box.Contains(q) for box in silk):continue
  if any(fp.GetReference().startswith('FID') and math.dist(xy(fp.GetPosition()),(x+60,y+60))<2.2 for fp in board.GetFootprints()):continue
  if any(s.Collide(q,mm(.56)) for s in edges):continue
  if any(n!=native and s.Collide(q,mm(.56)) for n,s in pad_shapes+track_shapes):continue
  if any(isinstance(t,pcb.PCB_VIA) and math.dist(xy(t.GetPosition()),(x+60,y+60))<1.0 for t in occupied):continue
  if any(math.dist((x,y),tuple(a['position_mm']))<2 for a in added):continue
  # A full via annulus must already be covered on at least two same-net layers.
  ring=[pt(x+60+.31*math.cos(a*math.pi/4),y+60+.31*math.sin(a*math.pi/4)) for a in range(8)]+[q]
  connected=sorted({l for n,l,poly in fills if n==native and all(poly.Contains(p) for p in ring)})
  if len(connected)<2:continue
  V(net,(x,y))
  added.append({'net':net,'position_mm':[x,y],'preexisting_reference_layers':[board.GetLayerName(l) for l in connected]})
board.BuildConnectivity();pcb.ZONE_FILLER(board).Fill(board.Zones())
for a in added:
 q=pt(a['position_mm'][0]+60,a['position_mm'][1]+60)
 connected=sorted({z.GetLayer() for z in board.Zones() if not z.GetIsRuleArea() and z.GetNetname()==nets[a['net']].GetNetname() and z.GetFilledPolysList(z.GetLayer()).Contains(q)})
 assert len(connected)>=2,a
 a['connected_filled_layers']=[board.GetLayerName(l) for l in connected]
report={'revision':'A6','diameter_mm':.6,'drill_mm':.3,'added_stitches':len(added),'counts_by_net':{n:sum(a['net']==n for a in added) for n in rows},'method':'Selected 4 mm rows outside the magnetic assembly; reject foreign copper/edge conflicts and require full annulus on at least two preexisting same-net filled layers. Refilled and verified each stitch touches at least two same-net planes. Domains remain separate.','vias':added}
(ROOT/'evidence/stitching-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('Ground stitches:',report['counts_by_net'])
