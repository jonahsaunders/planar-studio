"""Render actual Gerber exports with PyGerber 2.4.x; requires pygerber and Pillow.
Review step only. Rasterization is not a substitute for DRC or factory DFM.
"""
from pathlib import Path
import subprocess,sys,json,hashlib
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];G=R/'manufacturing-prototype/gerbers';O=R/'evidence/gerber-renders';O.mkdir(exist_ok=True)
files=sorted(f for f in G.glob('*') if f.suffix in ['.gtl','.gbl','.g1','.g2','.g3','.g4','.g5','.g6','.gts','.gbs','.gtp','.gto','.gbo','.gm1'])
rows=[]
for f in files:
 out=O/(f.stem+'.png')
 result=subprocess.run([sys.executable,'-m','pygerber','render','raster',str(f),'-o',str(out),'-d','35'],capture_output=True,text=True)
 if result.returncode:raise RuntimeError(f.name+'\n'+result.stdout+'\n'+result.stderr)
 rows.append({'source':f.relative_to(R).as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'render':out.relative_to(R).as_posix()})
 print(f.name,flush=True)
names=['F_Cu','In1_Cu','In2_Cu','In3_Cu','In4_Cu','In5_Cu','In6_Cu','B_Cu','F_Mask','B_Mask','F_Paste','F_Silkscreen','B_Silkscreen','Edge_Cuts']
canvas=Image.new('RGB',(2000,1800),'#e9eded');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(names):
 x=(i%4)*500;y=(i//4)*450
 im=Image.open(O/f'PS-GAN-60W-{name}.png').convert('RGBA');im.thumbnail((490,405))
 draw.text((x+14,y+12),name,fill='#112b24',font_size=20)
 canvas.paste(im,(x+(500-im.width)//2,y+38+(405-im.height)//2),im)
canvas.save(R/'evidence/Gerber-review.png')
(R/'evidence/gerber-render-audit.json').write_text(json.dumps({'renderer':'PyGerber 2.4.3','dpmm':35,'files':rows,'limits':'Visual inspection of rendered fabrication output; does not certify manufacturing capability or electrical operation.'},indent=2)+'\n')
