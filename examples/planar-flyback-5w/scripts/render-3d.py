"""Render the bundled assembly and export portable STEP/GLB. Standard Python."""
import argparse,hashlib,json,os,struct,subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--kicad-cli',default='kicad-cli')
a=p.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
out=R/'evidence/audit';out.mkdir(exist_ok=True)
cad=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
views={'top':['--side','top'],'bottom':['--side','bottom'],
       'assembled':['--side','top','--rotate','-45,0,30'],
       'underside':['--side','bottom','--rotate','-45,0,-30'],
       'side':['--side','right']}
for name,options in views.items():
    subprocess.run([a.kicad_cli,'pcb','render','--output',str(out/f'board-3d-{name}.png'),
        '--width','1800','--height','650' if name=='side' else '1800','--background','opaque','--quality','high',
        *options,str(cad)],cwd=R,check=True)
assembly=R/'3d';assembly.mkdir(exist_ok=True)
for kind in ['step','glb']:
    subprocess.run([a.kicad_cli,'pcb','export',kind,'--force','--drill-origin',
        '--output',str(assembly/f'PS-FLYBACK-5W.{kind}'),str(cad)],cwd=R,check=True)
inputs=[cad]+sorted((R/'kicad/3dmodels').rglob('*.step'))
glb=(assembly/'PS-FLYBACK-5W.glb').read_bytes()
size,kind=struct.unpack('<II',glb[12:20]);scene=json.loads(glb[20:20+size])
expected={f['reference'] for f in json.loads((R/'kicad/3dmodels/model-index.json').read_text())['footprints']}
assert expected.issubset({n.get('name') for n in scene['nodes']}),'Missing exported component'
def has_geometry(index):
    node=scene['nodes'][index]
    return ('mesh' in node and bool(scene['meshes'][node['mesh']].get('primitives'))) or any(has_geometry(i) for i in node.get('children',[]))
for ref in expected:
    matches=[i for i,n in enumerate(scene['nodes']) if n.get('name')==ref]
    assert any(has_geometry(i) for i in matches),('Exported component has no mesh geometry',ref)
record={'tool':'KiCad 10 pcb render / export','views':list(views),
        'GLB_component_references_verified':sorted(expected),'GLB_all_reference_subtrees_have_mesh_geometry':True,
        'scope':'All saved-board footprints have local STEP models. Core and connectors are nominal drawing-based geometry; H1-H4 and core retention are provisional envelopes. See 3D-MODELS.md.',
        'source_SHA256':{f.relative_to(R).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs},
        'output_SHA256':{f.relative_to(R).as_posix():hashlib.sha256(f.read_bytes()).hexdigest()
                         for f in [*(out/f'board-3d-{v}.png' for v in views),*assembly.glob('PS-FLYBACK-5W.*')]}}
(out/'3d-render-provenance.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print('Saved five assembly views and portable STEP/GLB files.')
