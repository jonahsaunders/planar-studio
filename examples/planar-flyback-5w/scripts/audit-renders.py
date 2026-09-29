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
from pygerber.gerberx3.api.v2 import GerberFile, FileTypeEnum
from pygerber.gerberx3.api._v2 import DEFAULT_COLOR_MAP

R=Path(__file__).resolve().parents[1];out=R/'evidence/audit';out.mkdir(exist_ok=True)
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--kicad-cli',default='kicad-cli')
p.add_argument('--dpmm',type=int,default=25)
p.add_argument('--skip-3d',action='store_true',help='Reuse already refreshed 3D renders after validating their input hashes.')
args=p.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
gerber_cli=Path(sys.executable).parent/('pygerber.exe' if os.name=='nt' else 'pygerber')
if not gerber_cli.exists():raise SystemExit('Install pygerber==2.4.3 and Pillow in this Python environment first.')
if args.skip_3d:
    previous=json.loads((out/'3d-render-provenance.json').read_text())
    for name,digest in previous['source_SHA256'].items():
        assert hashlib.sha256((R/name).read_bytes()).hexdigest()==digest,('Stale 3D view',name)
else:
    subprocess.run([sys.executable,str(R/'scripts/render-3d.py'),'--kicad-cli',args.kicad_cli],check=True,cwd=R)
files=[('F_Cu','gtl'),('In1_Cu','g1'),('In2_Cu','g2'),('In3_Cu','g3'),('In4_Cu','g4'),('B_Cu','gbl'),
       ('F_Mask','gts'),('B_Mask','gbs'),('F_Paste','gtp'),('F_Silkscreen','gto'),('B_Silkscreen','gbo'),('Edge_Cuts','gm1')]
for name,ext in files:
    source=(R/f'manufacturing/gerbers/PS-FLYBACK-5W-{name}.{ext}').read_text()
    # Fixed viewport prevents the 2.4.3 tight-bounds raster path from cropping
    # aperture macros and makes layer contact sheets directly comparable.
    # Two clear flashes outside the board exist only in this in-memory view;
    # they add no artwork and never enter any fabrication file.
    # Include the intentional off-board mask extensions of the M3 Edge holes.
    frame='%ADD999C,0.010*%\n%LPC*%\nD999*\nX-5000000Y-1000000D03*\nX55000000Y105000000D03*\n'
    assert source.count('M02*')==1 and '%ADD999' not in source
    parsed=GerberFile.from_str(source.replace('M02*',frame+'M02*'),FileTypeEnum.INFER_FROM_ATTRIBUTES).parse()
    parsed.render_raster(out/f'gerber-{name}.png',dpmm=args.dpmm,color_scheme=DEFAULT_COLOR_MAP[parsed.get_file_type()])
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
        'render_viewport':'Common approximately -5..55 by -1..105 mm viewport, including intentional off-board mask extensions, using two render-only clear flashes outside the board. Original manufacturing files are unmodified.',
        '3D_scope':'All 26 footprints have bundled models. Nominal package/core geometry and provisional mounting/retention envelopes; see 3D-MODELS.md and 3d-render-provenance.json.',
        'review_scope':'Rendered actual exported Gerbers. Visual review is supplementary to DRC, netlist and mounting geometry checks.'}
inputs=[R/'kicad/PS-FLYBACK-5W.kicad_pcb']+[R/f'manufacturing/gerbers/PS-FLYBACK-5W-{n}.{e}' for n,e in files]
inputs+=sorted((R/'kicad/3dmodels').rglob('*.step'))
record['source_SHA256']={f.relative_to(R).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs}
(out/'render-provenance.json').write_text(json.dumps(record,indent=2))
print('Rendered 12 Gerber layers, two contact sheets and five assembly views.')
