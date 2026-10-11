"""A11 assembly and pour refinements, executed inside rebuild_board.py.

Keep power SMT connections solid. Apply thermals only to insertion contacts;
do not add copper or ground bridges across the transformer isolation domains.
"""
# All printed text meets the supplier's 1.0 mm / 0.15 mm legend guidance.
for item in board.GetDrawings():
    if isinstance(item,pcb.PCB_TEXT) and item.GetLayer() in [pcb.F_SilkS,pcb.B_SilkS]:
        size=max(1.0,pcb.ToMM(item.GetTextHeight()))
        item.SetTextSize(pt(size,size));item.SetTextThickness(mm(.15))

# Put connector polarity beside, rather than underneath, the molded housings.
for item in list(board.GetDrawings()):
    if not isinstance(item,pcb.PCB_TEXT) or item.GetLayer()!=pcb.F_SilkS:continue
    if item.GetText()=='J2: 2+ 1-':board.Remove(item);continue
    if item.GetText()=='48V IN':item.SetPosition(pt(111.5,70.5))
    if item.GetText()=='12V OUT':item.SetPosition(pt(60,66.6))
    if item.GetText()=='VIN  GND':item.SetPosition(pt(112.5,91.3));item.SetTextSize(pt(1,1));item.SetText('IN  GND')
    if item.GetText()=='U6 / FB':item.SetPosition(pt(78.5,91.0));item.SetText('FB')
    if item.GetText()=='U8 / OVP':item.SetPosition(pt(67,110.5));item.SetText('OVP')

# Every plated insertion contact gets four 0.6 mm spokes and a 0.3 mm gap.
# An explicit wide track would bypass these thermals, so remove the two
# direct I4 entries into J2.2 and join the local reservoir through its pour.
for ref in ['J1','J2']:
    for q in fps[ref].Pads():
        q.SetLocalZoneConnection(pcb.ZONE_CONNECTION_THERMAL)
        q.SetLocalThermalSpokeWidthOverride(mm(.6));q.SetThermalGap(mm(.3))
q=pads[('J2','2')][0].GetPosition()
for t in list(board.GetTracks()):
    if isinstance(t,pcb.PCB_VIA):continue
    if t.GetNetname()==nets['VOUT'].GetNetname() and (t.GetStart()==q or t.GetEnd()==q):board.Remove(t)
Z('VOUT',I4,[(-5,18.9),(.8,18.9),(.8,28),(4.5,28),(4.5,30.8),(-5,30.8)])
# Deliberate raw-input landing gives J1.2 thermals without a solid track
# shunting them. Reserve its area from the In6 PGND return region.
cut=pcb.SHAPE_POLY_SET();cut.NewOutline()
for x,y in [(47.75,13.71),(52.75,13.71),(52.75,18.21),(47.75,18.21)]:cut.Append(mm(x+60),mm(y+60))
for z in board.Zones():
    if z.GetLayer()==I6 and z.GetNetname()==nets['PGND'].GetNetname():z.Outline().BooleanSubtract(cut)
Z('VIN_RAW',I6,[(48,13.96),(52.5,13.96),(52.5,17.96),(48,17.96)])

# Name every functional region for the native editor and evidence report.
counts={}
for z in board.Zones():
    if z.GetIsRuleArea():continue
    key=(z.GetNetname(),board.GetLayerName(z.GetLayer()));counts[key]=counts.get(key,0)+1
    z.SetZoneName(f'{key[0]} / {key[1]} / {counts[key]}')
    z.SetMinThickness(mm(.2));z.SetIslandRemovalMode(pcb.ISLAND_REMOVAL_MODE_ALWAYS)
    # Clear the large bias-switch lands and top-layer power route. Retain the
    # quiet reference/shield planes underneath its narrow In6 sense tap: a
    # blanket void there would interrupt the FB return immediately below U4.
    for fp in board.GetFootprints():
        for pd in fp.Pads():
            if not pd.IsOnLayer(F) or pd.GetNetname()!=nets['BIAS_SW'].GetNetname():continue
            shape=pcb.SHAPE_POLY_SET();pd.TransformShapeToPolygon(shape,F,mm(.25),mm(.005),pcb.ERROR_OUTSIDE)
            z.Outline().BooleanSubtract(shape)
    for t in board.GetTracks():
        if isinstance(t,pcb.PCB_VIA) or t.GetLayer()!=F or t.GetNetname()!=nets['BIAS_SW'].GetNetname():continue
        shape=pcb.SHAPE_POLY_SET();t.TransformShapeToPolygon(shape,t.GetLayer(),mm(.25),mm(.005),pcb.ERROR_OUTSIDE)
        z.Outline().BooleanSubtract(shape)
board.BuildConnectivity();pcb.ZONE_FILLER(board).Fill(board.Zones())
