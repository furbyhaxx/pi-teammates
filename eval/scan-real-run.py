import json,sys
raw=open(sys.argv[1],'r',errors='replace').read()
dec=json.JSONDecoder(); i=0; ev=[]
while True:
    k=raw.find('{"type":"tool_execution_start"',i)
    if k==-1: break
    try: o,_=dec.raw_decode(raw,k); ev.append(o)
    except: pass
    i=k+30
deleg=[e for e in ev if e.get('toolName')=='delegate']
other=[e.get('toolName') for e in ev if e.get('toolName')!='delegate']
print(f"{sys.argv[1]}: execs={len(ev)} delegate={len(deleg)} other={other}")
for n,e in enumerate(deleg,1):
    a=e.get('args') or {}
    if isinstance(a.get('tasks'),list): print(f"  #{n}: PARALLEL tasks[{len(a['tasks'])}] -> {[t.get('teammate') for t in a['tasks']]} ctx={a.get('context')}")
    elif isinstance(a.get('chain'),list): print(f"  #{n}: CHAIN[{len(a['chain'])}] -> {[c.get('teammate') for c in a['chain']]}")
    elif a.get('teammate'): print(f"  #{n}: SINGLE({a.get('teammate')}): {str(a.get('task',''))[:60]}")
    else: print(f"  #{n}: {list(a.keys())}")
