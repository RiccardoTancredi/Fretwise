import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// every tense of every language has its page: a few paragraphs and three examples with a translation and a note
const src=await readFile(new URL('../../src/app.html',import.meta.url),'utf8');
const a=src.indexOf('/* ---------- verb data'), b=src.indexOf('/* ---------- end of verb data ---------- */');
const V=new Function('esc',src.slice(a,b)+';return {V_LANGS};')(s=>String(s));
const i=src.indexOf('/* ---------- about each tense ---------- */'), j=src.indexOf('/* ---------- end of about each tense ---------- */');
const T=new Function(src.slice(i,j)+';return {es:TENSE_INFO_ES,fr:TENSE_INFO_FR,ca:TENSE_INFO_CA};')();

test('every tense has an explanation and three examples',()=>{
  for(const lang of ['es','fr','ca']) for(const t of V.V_LANGS[lang].tenses){
    const x=T[lang][t.id]; assert.ok(x,`${lang} ${t.id} has no page`);
    assert.ok(x.p.length>=2&&x.p.length<=4,`${lang} ${t.id} paragraphs`);
    assert.equal(x.ex.length,3,`${lang} ${t.id} examples`);
    for(const e of x.ex) assert.ok(e.length===3&&e.every(s=>s.trim()),`${lang} ${t.id} example`);
    for(const p of x.p) assert.ok(!/<(?!\/?(b|i)>)/.test(p),`${lang} ${t.id} only <b> and <i>`);
  }
});
