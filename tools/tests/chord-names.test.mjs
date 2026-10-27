import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';

test('one altered colour is named: A♭7♯9 and A♭7♭9, not 7alt',async()=>{
  const a=await musicApp(); a.setInst('guitar');
  // × A♭ C G♭ B × and the same with B𝄫 on the B string (the endings of Pink Floyd's Time, moved)
  const ctx={ch:a.CHORDS.find(c=>c.id==='maj9'),root:8,rootName:'A♭'};   // explored from an A♭maj9 exercise
  const sharp=a.identifyChord('guitar',[-1,11,10,11,12,-1],ctx), flat=a.identifyChord('guitar',[-1,11,10,11,10,-1],ctx);
  assert.equal(sharp.matches[0].name,'A♭7♯9'); assert.equal(flat.matches[0].name,'A♭7♭9');
  // xx6576: A♭ C G♭ B♭ is a dominant ninth, A♭9, not maj9
  assert.equal(a.identifyChord('guitar',[-1,-1,6,5,7,6],ctx).matches[0].name,'A♭9');
});

test('a right shape that needs five fingers is flagged; a barre counts as one finger',async()=>{
  const a=await musicApp();
  assert.equal(a.shapeFingers([-1,11,13,15,13,15]),5);          // A♭maj9 high up: right, but unplayable
  assert.equal(a.shapeFingers([1,3,3,2,1,1]),4);                  // F barre chord
  assert.equal(a.shapeFingers([-1,0,2,2,2,0]),1);                // A: one finger across three strings
});

test('the guide says what dim7 and half-diminished are',async()=>{
  const a=await musicApp(), q=id=>({ch:a.CHORDS.find(c=>c.id===id),root:10,rootName:'A♯'});
  assert.match(a.chordGuide(q('dim7')),/No diminished chord has a major 7th/);
  assert.match(a.chordGuide(q('m7b5')),/Half-diminished/);
});
