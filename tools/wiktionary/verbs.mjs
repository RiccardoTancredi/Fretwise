// The app's verb data, run on its own (the block tools/tests/verbs.test.mjs reads).
//   node verbs.mjs conj <lang> [new.js]   every verb's simple forms as JSON (new.js defines NEW_<LANG>, added to the list)
//   node verbs.mjs reg <lang> <words.json> the regular forms of each word for every class it could take
//   node verbs.mjs list <lang>             the verbs the app has
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const [cmd,lang,file]=process.argv.slice(2), U=lang.toUpperCase();
const src=await readFile(new URL('../../src/app.html',import.meta.url),'utf8');
const a=src.indexOf('/* ---------- verb data'), b=src.indexOf('/* ---------- end of verb data ---------- */');
let block=src.slice(a,b), only=null;
if(cmd==='conj'&&file){ const add=await readFile(file,'utf8'); const k=block.indexOf('const V_LANGS={'); block=block.slice(0,k)+add+`\nV_${U}_VERBS.push(...NEW_${U});\n`+block.slice(k); only=new Set(vm.runInNewContext(add+`;NEW_${U}.map(v=>v.inf)`)); }
const V=new Function('esc',block+';return {vUseLang,V_LANGS,vConj,vRegular};')(s=>String(s));
V.vUseLang(lang); const L=V.V_LANGS[lang], out={};
if(cmd==='list'){ console.log(JSON.stringify(L.verbs.map(v=>v.inf))); process.exit(); }
if(cmd==='conj'){ for(const v of L.verbs){ if(!only||only.has(v.inf)) out[v.inf]=V.vConj(v); } }
if(cmd==='reg'){
  const words=JSON.parse(await readFile(file,'utf8')), CLS0={es:[null],fr:[null,'ir3','oir'],ca:[null,'ir2']}[lang];
  for(const w of words){
    const CLS=L.end[L.cls(w)]?CLS0:['ir'];   // an ending the tables don't know (oír): the plain -ir pattern
    out[w]={futBase:L.futBase(w),fut:L.fut,cond:L.cond,cls:{}};
    for(const c of CLS){
      if((c==='ir3'||c==='ir2')&&!w.endsWith('ir')) continue; if(c==='oir'&&!w.endsWith('oir')) continue;
      const tmp={inf:w,it:''}; if(c) tmp.cls=c; L.verbs.push(tmp); out[w].cls[c||'']=V.vRegular(w); L.verbs.pop();
    }
  }
}
console.log(JSON.stringify(out));
