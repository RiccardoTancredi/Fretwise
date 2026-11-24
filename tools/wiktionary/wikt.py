"""Verb tables from English Wiktionary, for adding verbs to Conjugate and checking them.

  python3 wikt.py fetch <list.py>          download the pages of every word in the list (cached)
  python3 wikt.py gen <list.py> <lang>     new_<lang>.js: each verb with only what differs from its regular pattern
  python3 wikt.py check <lang> <ours.json> every simple form compared with Wiktionary's table

A list file defines ES, FR, CA: [(infinitive, Italian meaning), ...] and optionally AUX_ETRE (French verbs on être).
Pages are cached in $WIKT_CACHE (default $TMPDIR/wikt-cache)."""
import html,json,os,re,subprocess,sys,time,urllib.parse,urllib.request,importlib.util
HERE=os.path.dirname(os.path.abspath(__file__))
CACHE=os.environ.get('WIKT_CACHE',os.path.join(os.environ.get('TMPDIR','/tmp'),'wikt-cache')); os.makedirs(CACHE,exist_ok=True)
TAG=r'<(?:[^>"\']|"[^"]*"|\'[^\']*\')*>'
SEC={'fr':'French','ca':'Catalan','es':'Spanish'}
MAP={'fr':{('indicative','present'):'pres',('indicative','imperfect'):'impf',('indicative','past historic'):'ps',('indicative','future'):'fut',('indicative','conditional'):'cond',
           ('subjunctive','present'):'spres',('subjunctive','imperfect'):'simp',('imperative','simple'):'imp'},
     'ca':{('indicative','present'):'pres',('indicative','imperfect'):'impf',('indicative','future'):'fut',('indicative','preterite'):'ps',('indicative','conditional'):'cond',
           ('subjunctive','present'):'spres',('subjunctive','imperfect'):'simp',('imperative','affirmative'):'imp'},
     'es':{('indicative','present'):'pres',('indicative','imperfect'):'impf',('indicative','preterite'):'pret',('indicative','future'):'fut',('indicative','conditional'):'cond',
           ('subjunctive','present'):'spres',('subjunctive','imperfect (ra)'):'sira',('subjunctive','imperfect (se)'):'sise',('imperative','affirmative'):'imp'}}
TENSES={'es':['pres','pret','impf','spres','sira','sise','imp'],'fr':['pres','impf','ps','spres','simp','imp'],'ca':['pres','impf','ps','spres','simp','imp']}
page=lambda w: os.path.join(CACHE,f'p_{w}.html')

def load_list(path):
    spec=importlib.util.spec_from_file_location('lst',path); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

def fetch(words):
    for w in words:
        p=page(w)
        if os.path.exists(p) and os.path.getsize(p)>1000: continue
        req=urllib.request.Request('https://en.wiktionary.org/api/rest_v1/page/html/'+urllib.parse.quote(w),headers={'User-Agent':'verb-tables/1.0 (personal study script)'})
        for attempt in range(3):
            try: data=urllib.request.urlopen(req,timeout=30).read(); open(p,'wb').write(data); break
            except Exception as e:
                if attempt==2:   # large pages sometimes arrive cut short through a proxy: curl copes better
                    subprocess.run(['curl','-s','--retry','3','-A','verb-tables/1.0 (personal study script)','-o',p,req.full_url])
                    if not (os.path.exists(p) and os.path.getsize(p)>1000): print('FAILED',w,e)
                time.sleep(3)
        time.sleep(1.5)

def table(w,lang):
    s=open(page(w)).read(); i=s.find(f'id="{SEC[lang]}"')
    if i<0: return None
    s=s[i:]
    for m in re.finditer(r'<table',s):
        j=m.start(); k=s.find('</table>',j); t=s[j:k]
        if f'lang-{lang}' not in t: continue
        rows=[]
        for row in re.findall(r'<tr.*?</tr>',t,re.S):
            cells=re.findall(r'<(th|td)(?:[^>"\']|"[^"]*"|\'[^\']*\')*>(.*?)</\1>',row,re.S)
            rows.append([re.sub(r'\s+',' ',html.unescape(re.sub(TAG,' ',re.sub(r'<sup.*?</sup>','',c[1],flags=re.S)))).strip() for c in cells])
        return rows

def alts(cell,lang):
    if lang=='es': return [x for x in re.split(r'[\s,]+',cell) if x and x not in '—–-']
    cell=re.sub(r'/[^/]*/','',cell); cell=re.sub(r'\b\d\b','',cell)
    return [x.strip() for x in re.split(r',|;| or ',cell) if x.strip() and x.strip() not in '—–-']

def cells(w,lang):
    """{tense: [6 cells' alternatives]}, ger, part: every form Wiktionary gives, in its order"""
    rows=table(w,lang)
    if not rows: return None
    out={}; sec=None
    for r in rows:
        if not r: continue
        h=r[0].lower()
        for name in ('indicative','subjunctive','imperative'):
            if h.startswith(name): sec=name
        if lang=='es':
            key=MAP['es'].get((sec,h))
            if key and key not in out:
                out[key]=[[]]+[alts(x,lang) for x in r[1:] if x!=''][:5] if key=='imp' else [alts(x,lang) for x in r[1:7]]
            if h=='gerund': out['ger']=alts(r[1],lang)
            if h=='singular' and 'part' not in out and len(r)>=2: out['part']=alts(r[1],lang)
            continue
        label=re.sub(r'\(.*?\)\s*','',re.sub(r'\s*\d+$','',(r[-7] if len(r)>=7 else '').lower()).strip()).strip()
        key=MAP[lang].get((sec,label))
        if key and len(r)>=7 and key not in out: out[key]=[alts(x,lang) for x in r[-6:]]
        if (h.startswith('gerund') or h.startswith('present participle')) and 'ger' not in out: out['ger']=alts(r[-1],lang)
        if h.startswith('past participle') and lang=='fr' and 'part' not in out: out['part']=alts(r[-1],lang)
        if lang=='ca' and h=='singular' and len(r)>=2 and 'part' not in out: out['part']=alts(r[1],lang)
    return out

def node(*args): return json.loads(subprocess.check_output(['node',os.path.join(HERE,'verbs.mjs'),*args]))

def gen(lst,lang):
    L=getattr(lst,lang.upper()); etre=set(getattr(lst,'AUX_ETRE',())) if lang=='fr' else set()
    words=[w for w,_ in L]; wf=os.path.join(CACHE,f'w_{lang}.json'); json.dump(words,open(wf,'w'))
    reg=node('reg',lang,wf); lines=[]
    js=lambda v:"'"+v.replace("'",'’')+"'"
    for w,it in L:
        c=cells(w,lang)
        if not c: print('NO TABLE',w); continue
        f={k:([x[0] if x else None for x in v] if isinstance(v,list) and v and isinstance(v[0],list) else (v[0] if v else None)) for k,v in c.items()}
        best=None
        for cl,r in reg[w]['cls'].items():
            diff=[k for k in TENSES[lang] if f.get(k) and f[k]!=r[k]]
            score=len(diff)+(f.get('ger')!=r['ger'])+(f.get('part')!=r['part'])
            if best is None or score<best[0]: best=(score,cl,r,diff)
        _,cl,r,diff=best; R=reg[w]; e={'inf':w,'it':it}
        if cl: e['cls']=cl
        if w in etre: e['aux']='être'
        fut,cond=f.get('fut'),f.get('cond')
        if fut and fut[0] and fut[0].endswith(R['fut'][0]):
            fs=fut[0][:len(fut[0])-len(R['fut'][0])]
            if fs!=R['futBase']: e['fs']=fs
        fs=e.get('fs',R['futBase'])
        if f.get('ger') and f['ger']!=r['ger']: e['ger']=f['ger']
        if f.get('part') and f['part']!=r['part']: e['part']=f['part']
        t={k:' '.join(x or '-' for x in f[k]) for k in diff}
        if fut and [fs+x for x in R['fut']]!=fut: t['fut']=' '.join(x or '-' for x in fut)
        if cond and [fs+x for x in R['cond']]!=cond: t['cond']=' '.join(x or '-' for x in cond)
        for k in TENSES[lang]+['fut','cond','ger','part']:
            if k not in f: print(f'{w}: no {k} in the table')
        parts=[f"inf:{js(w)}",f"it:{js(it)}"]+[f"{k}:{js(e[k])}" for k in ('cls','aux','fs','ger','part') if k in e]
        if t: parts.append('t:{'+','.join(f'{k}:{js(v)}' for k,v in t.items())+'}')
        lines.append('  {'+','.join(parts)+'}')
    out=f'new_{lang}.js'; open(out,'w').write(f'const NEW_{lang.upper()}=[\n'+',\n'.join(lines)+'\n];\n'); print(out,len(lines),'verbs')

def check(lang,ours):
    bad=0
    for w,c in ours.items():
        cs=cells(w,lang)
        if not cs: print('NO TABLE',w); bad+=1; continue
        for k,v in cs.items():
            if k in ('ger','part'):
                if v and c[k] not in v: bad+=1; print(f'{w} {k}: ours={c[k]} wiktionary={v}')
                continue
            for p,want in enumerate(v):
                have=c[k][p]
                if have is None and not want: continue
                if have not in want: bad+=1; print(f'{w} {k} {p}: ours={have} wiktionary={want}')
        miss=set(TENSES[lang]+['fut','cond'])-set(cs)
        if miss: bad+=1; print('NOT CHECKED',w,sorted(miss))
    print('mismatches',bad,'verbs',len(ours))

if __name__=='__main__':
    cmd=sys.argv[1]
    if cmd=='fetch': lst=load_list(sys.argv[2]); fetch(sorted({w for n in ('ES','FR','CA') for w,_ in getattr(lst,n)}))
    elif cmd=='gen': gen(load_list(sys.argv[2]),sys.argv[3])
    elif cmd=='check': check(sys.argv[2],json.load(open(sys.argv[3])))
