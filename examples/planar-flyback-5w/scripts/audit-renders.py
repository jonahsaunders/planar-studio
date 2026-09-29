"""KiStack visual evidence: KiCad 3D views and PyGerber fabrication-layer renders.

Run with a Python virtual environment containing pygerber==2.4.3 and Pillow.
These pictures complement ERC/DRC; they are not a manufacturing release.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageDraw, ImageOps

R=Path(__file__).resolve().parents[1];out=R/'evidence/audit';out.mkdir(exist_ok=True)
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--kicad-cli',default='kicad-cli')
p.add_argument('--dpmm',type=int,default=25)
args=p.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
gerber_cli=Path(sys.executable).parent/('pygerber.exe' if os.name=='nt' else 'pygerber')
if not gerber_cli.exists():raise SystemExit('Install pygerber==2.4.3 and Pillow in this Python environment first.')
for side in ['top','bottom']:
    subprocess.run([args.kicad_cli,'pcb','render','--output',str(out/f'board-3d-{side}.png'),
        '--width','1600','--height','1600','--background','opaque','--quality','basic','--side',side,
        str(R/'kicad/PS-FLYBACK-5W.kicad_pcb')],check=True,cwd=R)
files=[('F_Cu','gtl'),('In1_Cu','g1'),('In2_Cu','g2'),('In3_Cu','g3'),('In4_Cu','g4'),('B_Cu','gbl'),
       ('F_Mask','gts'),('B_Mask','gbs'),('F_Paste','gtp'),('F_Silkscreen','gto'),('B_Silkscreen','gbo'),('Edge_Cuts','gm1')]
for name,ext in files:
    subprocess.run([str(gerber_cli),'render','raster',str(R/f'manufacturing/gerbers/PS-FLYBACK-5W-{name}.{ext}'),
        '-o',str(out/f'gerber-{name}.png'),'-d',str(args.dpmm)],check=True)
for group,names in [('copper',[n for n,_ in files[:6]]),('technical',[n for n,_ in files[6:]])]:
    sheet=Image.new('RGB',(1800,1900),'#e8edf3');draw=ImageDraw.Draw(sheet)
    for i,name in enumerate(names):
        with Image.open(out/f'gerber-{name}.png') as im:
            tile=ImageOps.contain(im.convert('RGB'),(570,875))
            x=(i%3)*600+(600-tile.width)//2;y=(i//3)*950+45
            sheet.paste(tile,(x,y));draw.text(((i%3)*600+20,(i//3)*950+15),name,fill='black',font_size=22)
    sheet.save(out/f'gerber-{group}-overview.png')
record={'kistack_commit':'8494dbde095669df081950cbb6b24d08a21e25b0','pygerber_version':'2.4.3',
        'dots_per_mm':args.dpmm,'gerber_layers':[n for n,_ in files],
        '3D_scope':'KiCad installed stock models. U1, C3, J1, J2 and T1 custom footprints have no 3D body models; review their drawings and mechanical envelopes separately.',
        'review_scope':'Rendered actual exported Gerbers. Visual review is supplementary to DRC, netlist and mounting geometry checks.'}
inputs=[R/'kicad/PS-FLYBACK-5W.kicad_pcb']+[R/f'manufacturing/gerbers/PS-FLYBACK-5W-{n}.{e}' for n,e in files]
record['source_SHA256']={f.relative_to(R).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs}
(out/'render-provenance.json').write_text(json.dumps(record,indent=2))
print('Rendered 12 Gerber layers, two contact sheets and top/bottom 3D views.')
