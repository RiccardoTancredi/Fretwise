import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';

const saved=[-1,6,8,6,8,8]; // E♭13: E♭, B♭, D♭, G, C; no 9th or 11th.
function question(app,id='13',root=3){return {type:'chord',ch:app.CHORDS.find(c=>c.id===id),root,rootName:id==='13'&&root===3?'E♭':app.chordRootName(root,app.CHORDS.find(c=>c.id===id)),voicings:[],found:[saved],show:{src:'u',i:0},sel:new Map(),checked:null,mist:0};}

test('editing a new shape closes the saved-shape overlay and renders only the editable selection',async()=>{
  const app=await musicApp(); app.S.mode='chord'; app.disableRendering();
  const q=question(app); app.setQuestion(q);
  assert.equal(app.markers().length,5);
  app.onCell(5,6);
  assert.equal(q.show,null); assert.equal(q.sel.get(5),6);
  const marks=app.markers(); assert.equal(marks.length,1); assert.equal(marks[0].kind,'sel'); assert.equal(marks[0].f,6);
  assert.deepEqual(q.found[0],saved);
});

test('Continue building preserves the draft, Clear removes the preview, and accepting the next shape resets it',async()=>{
  const app=await musicApp(); app.S.mode='chord'; app.S.chordShapes=3; app.disableRendering();
  const q=question(app); q.sel.set(1,6); app.setQuestion(q);
  app.action('resumechord'); assert.equal(q.show,null); assert.equal(q.sel.get(1),6);
  app.renderAnswer(); assert.match(app.node('answer').innerHTML,/aria-pressed="false"/);
  q.show={src:'u',i:0}; app.action('clear'); assert.equal(q.show,null); assert.equal(q.sel.size,0); assert.equal(app.markers().length,0);
  const next=app.genVoicings(3,q.ch).find(fr=>!app.sameShape(fr,saved)); assert.ok(next);
  next.forEach((f,s)=>{if(f>=0)q.sel.set(s,f);}); q.show={src:'u',i:0};
  app.checkChord(); assert.equal(q.found.length,2); assert.equal(q.show,null); assert.equal(q.sel.size,0);
});

test('E♭13 accepts the reported voicing, keeps ♭7 essential and names missing notes in the chord spelling',async()=>{
  const app=await musicApp(); app.S.mode='chord'; app.S.acc='sharp'; app.disableRendering();
  const q=question(app); q.found=[]; q.show=null; app.setQuestion(q);
  assert.equal(app.evalShape(q,saved).ok,true);
  assert.equal(app.chordRootName(3,q.ch),'E♭'); assert.equal(app.chordNoteName(q,1),'D♭');
  const missing=[-1,6,8,-1,8,8]; missing.forEach((f,s)=>{if(f>=0)q.sel.set(s,f);});
  app.checkChord(); assert.match(app.node('feedback').textContent,/D♭ \(the ♭7\)/); assert.doesNotMatch(app.node('feedback').textContent,/C♯/);
  app.S.acc='flat'; assert.equal(app.chordNoteName(q,1),'D♭');
});

test('7alt accepts a choice of altered colours, rejects an unaltered shell and the natural fifth',async()=>{
  const app=await musicApp(); app.setInst('guitar'); app.S.mode='chord';
  const q=question(app,'7alt',4); app.setQuestion(q);
  const valid=app.evalShape(q,[0,7,6,7,6,-1]); assert.equal(valid.ok,true); // E G♯ D F
  assert.equal(app.evalShape(q,[0,7,6,7,5,-1]).missingColour,true); // E G♯ D only
  assert.equal(app.evalShape(q,[0,2,0,1,0,1]).ok,false); // includes natural B
});

test('generated altered voicings are valid across roots on guitar and ukulele',async()=>{
  const app=await musicApp(), ch=app.CHORDS.find(c=>c.id==='7alt');
  for(const inst of ['guitar','ukulele']){
    app.setInst(inst); app.S.by[inst].fretEnd=15;
    for(let root=0;root<12;root++){
      const voicings=app.genVoicings(root,ch); assert.ok(voicings.length,`${inst} root ${root}`);
      for(const fr of voicings) assert.equal(app.evalShape({ch,root},fr).ok,true,`${inst} ${root}: ${fr}`);
    }
  }
});

test('chord controls use contextual spelling and theory distinguishes 13, maj13 and altered choices',async()=>{
  const app=await musicApp(); app.S.mode='chord'; app.renderSettings();
  assert.doesNotMatch(app.node('settings').innerHTML,/data-act="acc"/);
  app.S.mode='name'; app.renderSettings(); assert.match(app.node('settings').innerHTML,/data-act="acc"/);
  const dom=question(app), major=question(app,'maj13',3), alt=question(app,'7alt',4);
  assert.ok(dom.ch.t.some(t=>t[0]===10&&t[2])); assert.ok(major.ch.t.some(t=>t[0]===11&&t[2]));
  assert.match(app.chordGuide(dom),/11th is normally omitted/); assert.match(app.chordGuide(alt),/Choose ≥1 colour/);
  app.S.mode='chord'; app.setQuestion(dom); app.renderAnswer(); assert.match(app.node('answer').innerHTML,/Continue building/);
});
