"""Compose readable front/back documentation views from KiCad's actual SVGs."""
from pathlib import Path
import xml.etree.ElementTree as ET

R=Path(__file__).resolve().parents[1]
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
def element(name,attributes,parent=None):
    item=ET.Element('{'+NS+'}'+name,attributes)
    if parent is not None:parent.append(item)
    return item
svg=element('svg',{'width':'1160','height':'1190','viewBox':'0 0 1160 1190'})
element('rect',{'width':'1160','height':'1190','fill':'white'},svg)
labels=element('g',{'font-family':'Arial,sans-serif','fill':'#193348'},svg)
def text(x,y,value,size=18,bold=False):
    attrs={'x':str(x),'y':str(y),'font-size':str(size)}
    if bold:attrs['font-weight']='700'
    element('text',attrs,labels).text=value
text(40,49,'PCB layout · 44 × 94 mm · six layers',30,True)
text(40,82,'Actual KiCad copper, silkscreen and outline; display colors adjusted for contrast. Both views from above.',17)
text(75,129,'Front / components',24,True)
text(635,129,'Back / primary return',24,True)
for filename,x in [('board.svg',75),('board-back.svg',635)]:
    source=(R/'evidence'/filename).read_text(encoding='utf8')
    # Change display colors only. Copper, holes, coordinates and layer geometry
    # stay exactly as plotted; fabrication sources are never modified.
    for old,new in {'#F2EDA1':'#163244','#E8B2A7':'#163244','#D0D2CD':'#708090'}.items():source=source.replace(old,new)
    board=ET.fromstring(source)
    board.attrib.update({'x':str(x),'y':'154','width':'450','height':'936'})
    svg.append(board)
text(75,1126,'F.Cu: first 2-turn primary section')
text(635,1126,'B.Cu: second 2-turn primary section')
text(40,1166,'Four 3.2 mm M3 holes · Three routed ferrite openings · Internal windings shown in the six-layer review')
ET.ElementTree(svg).write(R/'evidence/layout-overview.svg',encoding='utf-8',xml_declaration=True)
print('Wrote front/back layout overview from actual KiCad layer plots.')
