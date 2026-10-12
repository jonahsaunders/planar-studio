"""Minimal KiCad S-expression reader/writer; quoted strings stay quoted."""
import re,json
class Q(str):pass
def parse(s):
 tok=re.findall(r'\(|\)|"(?:\\.|[^"\\])*"|[^\s()]+',s); stack=[];root=[];cur=root
 for t in tok:
  if t=='(': n=[];cur.append(n);stack.append(cur);cur=n
  elif t==')':cur=stack.pop()
  elif t.startswith('"'):cur.append(Q(json.loads(t)))
  else:cur.append(t)
 return root[0]
def dump(n):
 if isinstance(n,list):return '('+' '.join(map(dump,n))+')'
 return json.dumps(str(n),ensure_ascii=False) if isinstance(n,Q) else str(n)
def get(n,k):return next((v for v in n if isinstance(v,list) and v and v[0]==k),None)
def all(n,k):return [v for v in n if isinstance(v,list) and v and v[0]==k]
def walk(n,k):
 if isinstance(n,list):
  if n and n[0]==k:yield n
  for x in n:yield from walk(x,k)
