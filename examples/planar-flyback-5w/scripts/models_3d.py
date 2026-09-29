"""Attach bundled project-relative STEP files, preserving all non-model CAD text."""
import argparse,hashlib,json,os,re,shutil
from pathlib import Path
R=Path(__file__).resolve().parents[1];CAD=R/'kicad';MODELS=CAD/'3dmodels'
EXTRA={
 'D_PowerDI-5':'custom/PowerDI5.step',
 'SOIC8_EP_LT_S8E':'stock/Package_SO.3dshapes/SOIC-8-1EP_3.9x4.9mm_P1.27mm_EP2.29x3mm.step',
 'CP_Panasonic_C6':'stock/Capacitor_SMD.3dshapes/CP_Elec_6.3x5.9.step',
 'Terminal_KF301_2P_5.00':'custom/KF301_5mm_2P.step',
 'Planar_EELP32_4T_2T':'custom/EELP32_prepared_pair.step',
 'MountingHole_3.2mm_M3_ExposedSubstrate':'custom/M3_8mm_mount_envelope.step',
}
def blocks(text,kind):
    result=[]
    for match in re.finditer(r'\('+re.escape(kind)+r'(?=\s)',text):
        depth=0;quoted=False;escaped=False
        for i in range(match.start(),len(text)):
            c=text[i]
            if quoted:
                if escaped:escaped=False
                elif c=='\\':escaped=True
                elif c=='"':quoted=False
            elif c=='"':quoted=True
            elif c=='(':depth+=1
            elif c==')':
                depth-=1
                if depth==0:result.append((match.start(),i+1));break
        else:raise ValueError('Unbalanced '+kind)
    return result
def without_models(text):
    for start,end in reversed(blocks(text,'model')):text=text[:start]+text[end:]
    return text
def attach_models(board_path,stock_dir=None):
    MODELS.mkdir(exist_ok=True)
    mapping={};sources={}
    for fp in (CAD/'Flyback.pretty').glob('*.kicad_mod'):
        source=fp.read_text(encoding='utf8')
        if fp.stem in EXTRA:model=EXTRA[fp.stem]
        else:
            old=re.search(r'\(model\s+"([^"]+)"',source)
            if not old:raise ValueError('No model mapping: '+fp.name)
            model=old[1].replace('${KIPRJMOD}/3dmodels/','')
            model=re.sub(r'^\$\{KICAD\d+_3DMODEL_DIR\}/','stock/',model)
        mapping[fp.stem]=model
    mapping['MountingHole_3.2mm_M3_ExposedSubstrate']=EXTRA['MountingHole_3.2mm_M3_ExposedSubstrate']
    for model in set(mapping.values()):
        target=MODELS/model
        if not target.exists() and model.startswith('stock/') and stock_dir:
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(Path(stock_dir)/model.removeprefix('stock/'),target)
        if not target.is_file():raise FileNotFoundError(f'Restore bundled model {target}; generate custom models or provide --stock-dir for stock assets.')
        target.write_bytes(target.read_bytes().replace(b'\r\n',b'\n'))
        sources[model]={'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
                        'type':'KiCad generic package' if model.startswith('stock/') else 'Original nominal geometry'}
    def replace_models(text,name):
        before=re.sub(r'[ \t]+\n','\n',without_models(text))
        model=mapping[name]
        result=before[:-1].rstrip()+f'\n (model "${{KIPRJMOD}}/3dmodels/{model}" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))\n)'
        # Whitespace aside, only model records may change.
        assert re.sub(r'\s+','',without_models(result))==re.sub(r'\s+','',before)
        return result
    for fp in (CAD/'Flyback.pretty').glob('*.kicad_mod'):
        fp.write_text(replace_models(fp.read_text(encoding='utf8').strip(),fp.stem)+'\n',encoding='utf8',newline='\n')
    # Keep the upstream mounting library unmodified; add illustrative hardware
    # to its board instances only, without adding it to the electrical BOM.
    text=board_path.read_text(encoding='utf8');original=text;coverage=[]
    for start,end in reversed(blocks(text,'footprint')):
        footprint=text[start:end];name=re.match(r'\(footprint\s+"([^"]+)"',footprint)[1].split(':')[-1]
        ref=re.search(r'\(property\s+"Reference"\s+"([^"]+)"',footprint)[1]
        coverage.append({'reference':ref,'footprint':name,'model':mapping[name],
                         'provisional_hardware':ref.startswith('H')})
        text=text[:start]+replace_models(footprint,name)+text[end:]
    assert re.sub(r'\s+','',without_models(text))==re.sub(r'\s+','',without_models(original))
    board_path.write_text(text,encoding='utf8',newline='\n')
    record={'model_root':'${KIPRJMOD}/3dmodels','covered_footprints':len(coverage),
            'electronic_components':21,'planar_core_assemblies':1,'provisional_mounting_assemblies':4,
            'footprints':sorted(coverage,key=lambda f:f['reference']),'assets':dict(sorted(sources.items()))}
    (MODELS/'model-index.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8',newline='\n')
    print(f'Attached local STEP models to all {len(coverage)} footprints; board geometry preserved.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock-dir',default=os.environ.get('KICAD10_3DMODEL_DIR'))
    args=parser.parse_args()
    attach_models(CAD/'PS-FLYBACK-5W.kicad_pcb',args.stock_dir)
