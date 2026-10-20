"""Reject disabled constraints, old tangent via lands and thin T1 lands."""
import argparse,importlib.util,json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--kicad-cli',default='kicad-cli');args,rest=p.parse_known_args()
spec=importlib.util.spec_from_file_location('rules',Path(__file__).with_name('verify-clearance-rules.py'));check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
class ClearanceRules(unittest.TestCase):
    def setUp(self):
        self.board=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'));self.project=json.loads((R/'kicad/PS-FLYBACK-5W.kicad_pro').read_text())
    def test_current_rules_and_lands_pass(self):self.assertEqual(check.inspect(self.board,self.project)['status'],'PASS')
    def test_disabled_connection_width_is_rejected(self):
        self.project['board']['design_settings']['rules']['min_connection']=0
        self.assertEqual(check.inspect(self.board,self.project)['status'],'FAIL')
    def test_old_T1_annular_ring_is_rejected(self):
        t=next(f for f in self.board.GetFootprints() if f.GetReference()=='T1')
        next(iter(t.Pads())).SetSize(pcb.VECTOR2I(600000,600000))
        self.assertTrue(any('annular ring' in v for v in check.inspect(self.board,self.project)['violations']))
    def test_original_a9_via_contacts_fail_native_DRC(self):
        base='3b78238ea610fda599e0ad74c3479fc5de1ed315'
        with tempfile.TemporaryDirectory(dir=R/'.kicad-config') as temp:
            t=Path(temp);f=t/'PS-FLYBACK-5W.kicad_pcb'
            f.write_bytes(subprocess.check_output(['git','show',f'{base}:examples/planar-flyback-5w/kicad/PS-FLYBACK-5W.kicad_pcb'],cwd=R))
            f.with_suffix('.kicad_pro').write_text(json.dumps(self.project))
            (t/'fp-lib-table').write_text((R/'kicad/fp-lib-table').read_text().replace('${KIPRJMOD}',(R/'kicad').as_posix()))
            report=t/'drc.json'
            proc=subprocess.run([args.kicad_cli,'pcb','drc','--exit-code-violations','--format','json','-o',str(report),str(f)],capture_output=True,text=True,env=dict(os.environ,KICAD_CONFIG_HOME=str(R/'.kicad-config')))
            found=json.loads(report.read_text())['violations'];connections=[v for v in found if v['type']=='connection_width']
            self.assertNotEqual(proc.returncode,0);self.assertEqual(len(connections),8)
            self.assertTrue(all(v['severity']=='error' for v in connections))
if __name__=='__main__':unittest.main(argv=[__file__,*rest])
