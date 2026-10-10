import pcbnew as pcb,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[1];b=pcb.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'));a=json.loads((R/'planar-studio/T1-artwork.json').read_text())
def xy(p):return pcb.ToMM(p.x)-60,pcb.ToMM(p.y)-60
def closest(p,a,b):
 v=(b[0]-a[0],b[1]-a[1]);t=max(0,min(1,((p[0]-a[0])*v[0]+(p[1]-a[1])*v[1])/(v[0]**2+v[1]**2 or 1)))
 q=(a[0]+t*v[0],a[1]+t*v[1]);return math.dist(p,q),q
segments={}
for t in a['tracks']:
 for p,q in zip(t['pts'],t['pts'][1:]):segments.setdefault(t['layer'],[]).append(((22+p[1],15.5+p[0]),(22+q[1],15.5+q[0]),t['width']))
f=next(f for f in b.GetFootprints() if f.GetReference()=='T1');ports={p.GetNetname():xy(p.GetPosition()) for p in f.Pads() if p.GetNumber() in ['1','2','3','4','5']}
issues=[];contacts=[]
def check(net,label,layer,p,r):
 for a,c,w in segments.get(layer,[]):
  d,q=closest(p,a,c);gap=d-r-w/2
  if gap<.195:
   # Allow only the copper at the intended winding's terminal, not adjacent turns.
   port=ports.get(net)
   if port and math.dist(q,port)<.8:
    contacts.append((net,label,layer));continue
   issues.append({'net':net,'item':label,'layer':layer,'point':[round(x,3) for x in p],'winding_point':[round(x,3) for x in q],'clearance_mm':round(gap,4)})
for t in b.GetTracks():
 n=t.GetNetname()
 if n not in ports:continue
 if isinstance(t,pcb.PCB_VIA):
  for l in segments:check(n,'via',l,xy(t.GetPosition()),pcb.ToMM(t.GetWidth(pcb.F_Cu))/2)
 else:
  p,q=xy(t.GetStart()),xy(t.GetEnd());count=max(1,math.ceil(math.dist(p,q)/.08))
  for i in range(count+1):check(n,'track',b.GetLayerName(t.GetLayer()),tuple(p[j]+i/count*(q[j]-p[j]) for j in [0,1]),pcb.ToMM(t.GetWidth())/2)
for fp in b.GetFootprints():
 if fp.GetReference()=='T1':continue
 for p in fp.Pads():
  if p.GetNetname() not in ports:continue
  box=p.GetBoundingBox();x0,y0=xy(box.GetOrigin());x1,y1=x0+pcb.ToMM(box.GetWidth()),y0+pcb.ToMM(box.GetHeight())
  # Dense sampling of actual pad bounding rectangle: conservative for rounded lands.
  for i in range(max(1,math.ceil((x1-x0)/.08))+1):
   x=x0+(x1-x0)*i/max(1,math.ceil((x1-x0)/.08))
   for j in range(max(1,math.ceil((y1-y0)/.08))+1):
    y=y0+(y1-y0)*j/max(1,math.ceil((y1-y0)/.08));check(p.GetNetname(),fp.GetReference()+'.'+p.GetNumber(),'F.Cu',(x,y),0)
worst={}
for v in issues:
 k=(v['net'],v['item'],v['layer'])
 if k not in worst or v['clearance_mm']<worst[k]['clearance_mm']:worst[k]=v
report={'method':'Independent 0.08 mm swept-path samples against Planar Studio winding centerlines; 0.195 mm threshold. Intended terminal copper within 0.8 mm (the intended terminal landing) is excepted. Conservative rectangular pad envelope. Covers nets in the winding net-tie groups; KiCad checks other nets.','issues':list(worst.values()),'terminal_contacts':list(set(contacts)),'qualified':False}
(R/'evidence/winding-contact-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not issues, 'Unintended winding contacts found'
