#!/usr/bin/env python3
"""Refresh review images after export-release.py; optional review-only dependencies.

Requires KiCad CLI, cairosvg, PyMuPDF, Pillow and pygerber==2.4.3.
No CAD or fabrication data is modified by this script.
"""
from pathlib import Path
import subprocess
import cairosvg
import fitz
from PIL import Image, ImageDraw
from pygerber.gerberx3.api.v2 import GerberFile

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence'
CAD=ROOT/'kicad'

def run(*args):
    subprocess.run(['kicad-cli',*map(str,args)],check=True)

run('sch','export','svg','-o',str(E/'schematic')+'/',CAD/'CoilTile.kicad_sch')
run('pcb','export','svg','--mode-multi','--exclude-drawing-sheet',
    '--layers','F.Cu,In1.Cu,In2.Cu,B.Cu,F.SilkS,Edge.Cuts',
    '--common-layers','Edge.Cuts','--page-size-mode','2',
    '-o',str(E/'pcb')+'/',CAD/'CoilTile.kicad_pcb')
cairosvg.svg2png(url=str(E/'schematic/CoilTile.svg'),write_to=str(E/'schematic.png'),output_width=2200)
for p in (E/'pcb').glob('*.svg'):
    cairosvg.svg2png(url=str(p),write_to=str(p.with_suffix('.png')),output_width=1500)
with fitz.open(ROOT/'docs/CoilTile-schematic.pdf') as doc:
    assert len(doc)==1
    doc[0].get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False).save(E/'schematic-pdf.png')
(E/'gerbers').mkdir(exist_ok=True)
for stem,ext in [('F_Cu','gtl'),('In1_Cu','g1'),('In2_Cu','g2'),('B_Cu','gbl'),
                 ('F_Mask','gts'),('B_Mask','gbs'),('F_Paste','gtp'),
                 ('F_Silkscreen','gto'),('Edge_Cuts','gm1')]:
    src=ROOT/f'manufacturing/gerbers/CoilTile-{stem}.{ext}'
    GerberFile.from_file(src).parse().render_raster(E/f'gerbers/CoilTile-{stem}.png',dpmm=18)
# These images are independent Gerber renders, not native PCB screenshots.
names=['F_Cu','In1_Cu','In2_Cu','B_Cu','F_Mask','F_Paste']
canvas=Image.new('RGB',(1500,1300),'#f2f2ef');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(names):
    x=(i%3)*500;y=(i//3)*650
    draw.text((x+20,y+16),name.replace('_','.'),fill='#19232f',font_size=24)
    im=Image.open(E/f'gerbers/CoilTile-{name}.png').convert('RGBA')
    im.thumbnail((470,590))
    canvas.paste(im,(x+(500-im.width)//2,y+50+(590-im.height)//2),im)
canvas.save(E/'gerber-review.png')
run('pcb','render','-o',E/'bare-board-top.png','--width','1300','--height','1600',
    '--side','top','--background','opaque','--quality','high',CAD/'CoilTile.kicad_pcb')
print('Updated schematic, copper-layer, independent Gerber and bare-board previews.')
