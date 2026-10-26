import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// the verb data block of the app is pure: run it on its own
const src=await readFile(new URL('../../src/app.html',import.meta.url),'utf8');
const a=src.indexOf('/* ---------- verb data'), b=src.indexOf('/* ---------- end of verb data ---------- */');
const esc=s=>String(s);
const V=new Function('esc',src.slice(a,b)+';return {VERBS,V_TENSES,vConj,vRegConj,vForm,vKind,vMark,vLevel,vVerb,vPersonsOf,vInfo};')(esc);

test('every verb has every form of every tense',()=>{
  assert.equal(V.VERBS.length,10);
  for(const v of V.VERBS) for(const t of V.V_TENSES) for(const p of V.vPersonsOf(t.id)){
    const f=V.vForm(v,t.id,p);
    assert.ok(f&&!/undefined|null/.test(f),`${v.inf} ${t.id} ${p}: ${f}`);
  }
  for(const v of V.VERBS){ const c=V.vConj(v); for(const k of ['pres','pret','impf','fut','cond','spres','sira','sise']) assert.equal(c[k].length,6,`${v.inf} ${k}`); }
});

test('forms, compound tenses and the imperatives',()=>{
  const f=(inf,t,p)=>V.vForm(V.vVerb(inf),t,p);
  assert.equal(f('ser','pres',0),'soy'); assert.equal(f('ir','impf',3),'íbamos'); assert.equal(f('tener','fut',4),'tendréis');
  assert.equal(f('hacer','pret',2),'hizo'); assert.equal(f('decir','cond',5),'dirían'); assert.equal(f('poder','sira',3),'pudiéramos');
  assert.equal(f('hacer','pperf',0),'he hecho'); assert.equal(f('ver','plusc',4),'habíais visto'); assert.equal(f('decir','splus',1),'hubieras dicho');
  assert.equal(f('ir','prog',0),'estoy yendo'); assert.equal(f('ser','impn',1),'no seas'); assert.equal(f('hacer','imp',1),'haz'); assert.equal(f('ir','imp',4),'id');
});

test('what is irregular is told apart from stem and spelling changes',()=>{
  const k=(inf,t,p)=>{ const v=V.vVerb(inf); return V.vKind(V.vConj(v)[t][p],V.vRegConj(v)[t][p]); };
  assert.equal(k('tener','pres',1),'stem');   // tienes: e → ie
  assert.equal(k('poder','pres',0),'stem');   // puedo: o → ue
  assert.equal(k('decir','pres',1),'stem');   // dices: e → i
  assert.equal(k('tener','pres',0),'irr');    // tengo
  assert.equal(k('ver','pret',2),'spell');    // vio: no accent on one syllable
  assert.equal(k('dar','pres',4),'spell');    // dais
  assert.equal(k('estar','pres',1),'irr');    // estás: the stress moves
  assert.equal(k('tener','pres',3),'');       // tenemos is regular
  const v=V.vVerb('tener'); assert.equal(V.vMark(V.vConj(v).pres[1],V.vRegConj(v).pres[1]),'t<mark class="v-stem">ie</mark>nes');
  assert.equal(V.vLevel(V.vVerb('ser')),3);
});

test('the building blocks of every form spell the form, and every form has a rule to read',()=>{
  const c=src.indexOf('/* ---------- progress ---------- */');
  const W=new Function('esc',src.slice(a,c)+';return {VERBS,V_TENSES,vForm,vFormTokens,vRules,vPersonsOf};')(esc);
  for(const v of W.VERBS) for(const t of W.V_TENSES) for(const p of W.vPersonsOf(t.id)){
    const T=W.vFormTokens(v,t.id,p), built=T.filter(x=>!x.op&&x.c!=='cut').map(x=>x.t.includes('→')?x.t.split('→')[1]:x.t).join('');
    assert.equal(built,W.vForm(v,t.id,p).replace(/ /g,''),`${v.inf} ${t.id} ${p}`);
    assert.ok(W.vRules(v,t.id,p).some(r=>r.text),`${v.inf} ${t.id} ${p} has no rule`);
  }
  const tok=(inf,t,p)=>W.vFormTokens(W.VERBS.find(v=>v.inf===inf),t,p).map(x=>x.op||x.t).join(' ');
  assert.equal(tok('ser','pres',0),'s − er + o + y');
  assert.equal(tok('tener','pres',1),'t e→ie n − er + es');
  assert.equal(tok('tener','pret',0),'tuv + e');
});
