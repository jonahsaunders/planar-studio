"""Compose PCB audit close-ups from KiCad's actual front copper plot."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

R=Path(__file__).resolve().parents[1]
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
def add(parent,name,**attributes):
    return ET.SubElement(parent,'{'+NS+'}'+name,{k.replace('_','-'):str(v) for k,v in attributes.items()})
svg=ET.Element('{'+NS+'}svg',{'width':'1280','height':'1150','viewBox':'0 0 1280 1150'})
add(svg,'rect',width=1280,height=1150,fill='white')
labels=add(svg,'g',font_family='Arial,sans-serif',fill='#193348')
def text(x,y,value,size=20,bold=False,color=None):
    attributes={'x':x,'y':y,'font_size':size,'font_weight':700 if bold else 400}
    if color:attributes['fill']=color
    add(labels,'text',**attributes).text=value
text(36,48,'PCB layout audit · A1 development board',32,True)
text(36,82,'Actual front copper and silkscreen. Colored overlays identify measured routes; routing is unchanged.',18)
text(36,130,'1  Primary input and clamp',25,True)
text(720,130,'2  Secondary and output',25,True)
metrics=json.loads((R/'evidence/audit/pcb-layout-metrics.json').read_text())
def length(first,last):
    return f"{next(r for r in metrics['routes'] if r['from']==first and r['to']==last)['routed_centerline_mm']:.2f}"
source=(R/'evidence/board.svg').read_text(encoding='utf8')
for old,new in {'#F2EDA1':'#163244','#E8B2A7':'#163244','#D0D2CD':'#708090'}.items():
    source=source.replace(old,new)
for x,y,w,h,view,first,last,color in [
    (36,157,640,499.2,'0 0 50 39','D4.2','T1.1','#a54800'),
    (720,157,504,548.47,'8 67 34 37','C3.1','J2.1','#006a99'),
]:
    plot=ET.fromstring(source)
    original_width,original_height=map(float,plot.attrib['viewBox'].split()[2:])
    plot.attrib.update({'x':str(x),'y':str(y),'width':str(w),'height':str(h),'viewBox':view})
    # The fitted plot is centered on the 50 x 104 mm outline at (100,85).
    offset_x,offset_y=100-original_width/2,85-original_height/2
    route=next(r for r in metrics['routes'] if r['from']==first and r['to']==last)
    add(plot,'polyline',points=' '.join(f"{p['x_mm']-offset_x:.4f},{p['y_mm']-offset_y:.4f}" for p in route['path']),
        fill='none',stroke=color,stroke_width=.22,stroke_dasharray='.6 .25')
    svg.append(plot)
text(720,730,f"Blue: C3+ to J2+ = {length('C3.1','J2.1')} mm",20,True,'#006a99')
text(720,762,f"D2 to C3+ = {length('D2.1','C3.1')} mm",19)
text(720,791,f"D2 to C4+ = {length('D2.1','C4.1')} mm",19)
text(36,695,f"Orange: D4 VIN return to T1 = {length('D4.2','T1.1')} mm",20,True,'#a54800')
text(36,730,f"C2+ to T1 VIN = {length('C2.1','T1.1')} mm",19)
text(36,762,f"C1+ to U1 VIN = {length('C1.1','U1.3')} mm",19)
text(36,847,f"Snubber SW branch = {length('T1.2','C6.2')} mm on In3.Cu (not shown in this front view)",19)
text(36,936,'Priority: tighten the primary input and clamp loops before fabrication.',24,True)
text(36,972,'Keep input bypassing and both suppression networks close to U1 / T1; shorten the output feed.',20)
text(36,1006,f"Preserve the short {length('C5.1','U1.2')} mm INTVCC and {length('R3.2','U1.6')} mm RFB connections during any placement change.",20)
text(36,1061,'Measurements: explicit routed centerlines; exclude windings, plane spreading and component internals.',17)
text(36,1091,'Clean DRC establishes checked geometry. It does not establish loop inductance, EMI, temperature or regulation.',17)
ET.ElementTree(svg).write(R/'evidence/audit/pcb-layout-audit.svg',encoding='utf-8',xml_declaration=True)
print('Wrote actual-board PCB audit close-ups.')
