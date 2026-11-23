import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// the read music data block of the app is pure: run it on its own
const src=await readFile(new URL('../../src/app.html',import.meta.url),'utf8');
const a=src.indexOf('/* ---------- read music data'), b=src.indexOf('/* ---------- end of read music data ---------- */');
const R=new Function(src.slice(a,b)+';return {RM_SETS,RM_KEYSET,RM_RANGE,RM_NX,RM_Y0,rmSetKeys,rmCard,rmStaffSvg,rmLayout,rmStep,rmP,rmSci,rmMidi};')();
const json=async f=>JSON.parse(await readFile(new URL('./fixtures/'+f,import.meta.url),'utf8'));

test('the chords are the 1392 of the Anki deck: same symbol, name, inversion, clef, level and pitches',async()=>{
  // fixture rows: [id, level, symbol, name, inversion, clef, pitches], read from Music_Reading_Chords_v2_FULL_UPDATE.apkg
  const deck=await json('anki-chords.json'), mine=new Map();
  for(const s of R.RM_SETS.filter(s=>s.kind==='chord')) for(const k of R.rmSetKeys(s.id)){
    const c=R.rmCard(k); mine.set([+s.id.slice(1),c.sym,c.name,c.invName,c.clef==='t'?'Treble':'Bass',c.sci].join('#'),k);
  }
  assert.equal(deck.length,1392); assert.equal(mine.size,1392);
  for(const r of deck) assert.ok(mine.has(r.slice(1).join('#')),r.join(' '));
});

test('the notes are the 42 of the Anki deck, with their ledger lines',async()=>{
  // fixture rows: [id, answer, pitch, clef, ledger lines], from Music_Reading_Notes.apkg
  const deck=await json('anki-notes.json');
  assert.equal(deck.length,42);
  for(const [id,ans,pitch,clef,ledger] of deck){
    const c=R.rmCard('n|'+(clef==='Treble'?'t':'b')+'|'+pitch);
    assert.ok(c,id); assert.equal(c.answer,ans,id); assert.equal(c.ledger,ledger,id);
  }
  assert.equal(R.rmSetKeys('nt').length+R.rmSetKeys('nb').length,42);
});

test('every card fits its staff: notes inside the frame, accidentals clear of the notes and of each other',()=>{
  const keys=[...R.RM_KEYSET.keys()];
  assert.equal(keys.length,1434);
  for(const k of keys){
    const c=R.rmCard(k), L=R.rmLayout(c.ps), bottom=c.clef==='t'?30:18, [lo,hi]=R.RM_RANGE[c.kind];
    for(const n of L.notes){
      const st=n.st-bottom; assert.ok(st>=lo+1&&st<=hi-1,`${k}: ${R.rmSci(n.p)} outside the frame`);
      if(n.p.a) assert.ok(n.ax<R.RM_NX-2,`${k}: accidental on the note`);
      if(n.p.a) assert.ok(n.ax>42,`${k}: accidental on the clef`);
    }
    // a note a second above an unmoved one goes to the right; nothing else moves
    L.notes.forEach((n,i)=>{ const p=L.notes[i-1]; assert.equal(n.right,!!(p&&n.st-p.st===1&&!p.right),k); });
    // accidentals sharing a column are at least a seventh apart
    const cols=new Map(); L.notes.filter(n=>n.p.a).forEach(n=>{ (cols.get(n.col)||cols.set(n.col,[]).get(n.col)).push(n.st); });
    for(const sts of cols.values()) for(let i=0;i<sts.length;i++) for(let j=i+1;j<sts.length;j++) assert.ok(Math.abs(sts[i]-sts[j])>=6,k);
    const svg=R.rmStaffSvg(c.clef,c.ps,{range:R.RM_RANGE[c.kind]});
    assert.match(svg,/^<svg class="rstaff" viewBox="0 -?\d+ 216 \d+"/); assert.doesNotMatch(svg,/NaN|undefined/);
  }
});

test('ledger lines: as many as the furthest note needs, on the right side of the staff',()=>{
  const count=k=>{ const c=R.rmCard(k); return (R.rmStaffSvg(c.clef,c.ps).match(/stroke-width="1.6"/g)||[]).length; };
  assert.equal(count('n|t|F3'),3); assert.equal(count('n|t|C4'),1); assert.equal(count('n|t|G4'),0); assert.equal(count('n|t|E6'),3);
  assert.equal(count('n|b|A1'),3); assert.equal(count('n|b|C4'),1);
  assert.equal(count('c|10|13|0|t'),4);       // B♭13 reaches G6, four lines above the treble staff
});

test('chord spelling: double sharps and flats where the chord needs them, inversions take the lowest notes up',()=>{
  const sci=k=>R.rmCard(k).sci;
  assert.equal(sci('c|1|aug|0|t'),'C♯4 – E♯4 – G𝄪4');
  assert.equal(sci('c|8|dim7|0|b'),'A♭2 – C♭3 – E𝄫3 – G𝄫3');
  assert.equal(sci('c|0|maj7|3|t'),'B4 – C5 – E5 – G5');
  assert.equal(R.rmCard('c|0|maj|1|t').bass,'E');
  assert.equal(R.rmMidi(R.rmP('A4')),69); assert.equal(R.rmMidi(R.rmP('B♯3')),60); assert.equal(R.rmMidi(R.rmP('C♭5')),71);
});
