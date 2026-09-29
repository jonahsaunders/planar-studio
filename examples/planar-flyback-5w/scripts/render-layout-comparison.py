"""Compose historical/current KiCad renders without altering the board imagery. Pillow."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1];A=R/'evidence/audit'
def font(size):
    for name in ['C:/Windows/Fonts/segoeui.ttf','DejaVuSans.ttf']:
        try:return ImageFont.truetype(name,size)
        except OSError:pass
    return ImageFont.load_default(size=size)
canvas=Image.new('RGB',(1600,1480),'#f4f6fa');d=ImageDraw.Draw(canvas)
d.text((50,25),'KiStack layout review',font=font(40),fill='#193348')
d.text((50,86),'Same circuit and planar windings. Revised placement, power routes and returns.',font=font(22),fill='#4b6278')
sources=['board-3d-top-before.png','board-3d-top.png']
for i,(name,title) in enumerate(zip(sources,['Before · 4646097','After · revised A1'])):
    x=50+i*780
    d.rounded_rectangle((x,140,x+720,1270),radius=18,fill='white',outline='#d6dfe9',width=2)
    d.text((x+25,162),title,font=font(29),fill='#193348')
    # Crop only empty margins from fixed-camera orthographic native renders.
    im=Image.open(A/name).convert('RGB')
    # Both renders have the same board scale and camera, use identical crop.
    im=im.crop((410,0,1358,1768));im.thumbnail((645,1040))
    canvas.paste(im,(x+(720-im.width)//2,215))
for i,(label,value) in enumerate([('Input feed','34.87 → 6.70 mm'),('Clamp return','57.54 → 6.91 mm'),('Output feed','33.20 → 11.04 mm')]):
    x=50+510*i
    d.text((x,1300),label,font=font(23),fill='#4b6278')
    d.text((x,1338),value,font=font(31),fill='#193348')
d.text((50,1410),'Actual KiCad 3D views. Nominal models; hardware and manufacturing qualification remain open.',font=font(20),fill='#4b6278')
canvas.save(A/'layout-before-after.png')
record={'baseline_commit':'46460970e0e223c8738fd1d8be9bf6b80ef8369b',
        'method':'Identical margin crop and proportional scaling of archived/current native KiCad orthographic top views; no board pixels retouched.',
        'image_SHA256':{name:hashlib.sha256((A/name).read_bytes()).hexdigest() for name in sources},
        'current_board_SHA256':hashlib.sha256((R/'kicad/PS-FLYBACK-5W.kicad_pcb').read_bytes()).hexdigest()}
(A/'layout-comparison-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('Wrote native-render layout comparison.')
