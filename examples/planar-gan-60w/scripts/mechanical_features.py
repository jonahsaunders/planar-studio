"""Reuse the flyback's exposed-substrate edge mounting footprints verbatim."""
name='MountingHole_3.2mm_M3_ExposedSubstrate_Edge'
holes=[]
for ref,x,y,a in [('H1',-2.5,.5,180),('H2',52.5,.5,0),('H3',-2.5,47.5,180),('H4',52.5,47.5,0)]:
 f=pcb.FootprintLoad(str(LIB),name);f.SetReference(ref);f.SetValue('M3 / NPTH 3.2mm')
 f.SetFPID(pcb.LIB_ID('PS',name));f.SetAttributes(pcb.FP_BOARD_ONLY|pcb.FP_EXCLUDE_FROM_BOM|pcb.FP_EXCLUDE_FROM_POS_FILES)
 f.SetPosition(pt(x+60,y+60));f.SetOrientationDegrees(a);board.Add(f)
 f.Reference().SetPosition(pt(x+60,y+60+(4.4 if y<20 else -4.4)));f.Reference().SetTextAngle(pcb.EDA_ANGLE(0,pcb.DEGREES_T))
 holes.append({'ref':ref,'x_mm':x+7,'y_mm':y+4,'rotation_deg':a,'drill_mm':3.2})
pcb.ZONE_FILLER(board).Fill(board.Zones())
# Three optical registration marks for single-board or panel assembly.
fidname='Fiducial_1mm_Mask3mm'
for ref,x,y in [('FID1',-3.5,39.5),('FID2',53.5,39.5),('FID3',35,-1.7)]:
 f=pcb.FootprintLoad(str(LIB),fidname);f.SetReference(ref);f.SetFPID(pcb.LIB_ID('PS',fidname))
 f.SetAttributes(f.GetAttributes()|pcb.FP_BOARD_ONLY|pcb.FP_EXCLUDE_FROM_BOM|pcb.FP_EXCLUDE_FROM_POS_FILES)
 f.SetPosition(pt(x+60,y+60));f.Reference().SetVisible(False);f.Value().SetVisible(False);board.Add(f)
(ROOT/'mechanical.json').write_text(json.dumps({'revision':'A3','board_mm':[64,56],'outline_origin_absolute_mm':[53,56], 'hole_pattern_mm':[55,47], 'mounting_footprint':name,'same_footprint_as':'planar-flyback-5w A5', 'holes':holes,'coordinate_system':'Board-relative, X right / Y down from upper-left outline bounding box','drill_mm':3.2,'plated':False,'mask_opening_diameter_mm':6.4,'copper_exclusion_diameter_mm':10,'mask_extension_outward_mm':5,'copper_to_mask_margin_mm':1.8,'hardware_note':'No fasteners in PCBA BOM. Nonconductive standoffs; contact diameter <=6.4mm. Leave underside clearance for ferrite. Pattern differs from flyback 35 x 85 mm to keep this board compact.'},indent=2),encoding='utf8')
