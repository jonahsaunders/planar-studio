from sexp import *
from pathlib import Path
import copy,os
STOCK=Path(os.environ.get('KICAD9_SYMBOL_DIR','.toolchain/root/usr/share/kicad/symbols'))
def load_symbol(lib,name):
 doc=parse((STOCK/(lib+'.kicad_sym')).read_text());symbols={s[1]:s for s in all(doc,'symbol')}
 def resolve(name):
  s=copy.deepcopy(symbols[name]); ext=get(s,'extends')
  if ext:
   p=resolve(ext[1]);old=p[1];p[1]=Q(name)
   for c in all(p,'symbol'): c[1]=Q(str(c[1]).replace(old+'_',name+'_',1))
   for v in s[2:]:
    if isinstance(v,list) and v[0]=='extends':continue
    if isinstance(v,list) and v[0]=='property':p[:]=[x for x in p if not (isinstance(x,list) and x[0]=='property' and x[1]==v[1])]
    p.append(v)
   s=p
  return s
 return resolve(name)
if __name__=='__main__':
 for lib,name in [('Sensor_Proximity','LDC1614'),('Regulator_Linear','AP2112K-3.3'),('Power_Protection','USBLC6-2SC6')]:
  s=load_symbol(lib,name);print(name,[(get(p,'number')[1],get(p,'name')[1],get(p,'at')[1:],p[1]) for p in walk(s,'pin')])
