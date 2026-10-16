"""Run DRC with every ignored category enabled, then restore the project settings."""
import argparse,json,os,subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--kicad-cli',default='kicad-cli')
args=p.parse_args()
project=R/'kicad/PS-FLYBACK-5W.kicad_pro';original=project.read_bytes()
data=json.loads(original)
rules=data['board']['design_settings']['rule_severities']
for key,value in rules.items():
    if value=='ignore':rules[key]='warning'
try:
    project.write_text(json.dumps(data,indent=2),encoding='utf8')
    env=dict(os.environ,KICAD_CONFIG_HOME=str(R/'.kicad-config'))
    subprocess.run([args.kicad_cli,'pcb','drc','--exit-code-violations','--schematic-parity','--format','json','-o',str(R/'evidence/audit/all-drc-checks.json'),str(project.with_suffix('.kicad_pcb'))],env=env,check=True)
finally:
    project.write_bytes(original)
report=json.loads((R/'evidence/audit/all-drc-checks.json').read_text(encoding='utf8'))
assert not any(report[k] for k in ['ignored_checks','violations','unconnected_items','schematic_parity'])
print('All DRC categories enabled: zero violations, unconnected items or parity mismatches.')
