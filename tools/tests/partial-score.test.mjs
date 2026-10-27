import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';

// a chord question asking for three shapes of C major
async function cMajor(){
  const a=await musicApp(); a.disableRendering(); a.S.mode='chord'; a.S.chordShapes=3;
  const ch=a.CHORDS.find(c=>c.id==='maj'), voicings=a.genVoicings(0,ch);
  a.setQuestion(a.capturePractice({type:'chord',ch,root:0,rootName:'C',voicings,sel:new Map(),found:[],checked:null,mist:0,show:null}));
  const play=fr=>{ const q=a.getQuestion(); q.sel=new Map(fr.map((f,s)=>[s,f]).filter(([,f])=>f>=0)); a.checkChord(); };
  return {a,voicings,play};
}

test('two clean chord shapes and one off by a note score above 80%: a yellow dot, not a red one',async()=>{
  const {a,voicings,play}=await cMajor();
  play(voicings[0]); play(voicings[1]);
  const v=voicings[2].slice(), s=v.findIndex(f=>f>0); v[s]=v[s]+1;       // one note a fret too high
  play(v); play(voicings[2]);
  const r=a.getRoundResults()[0];
  assert.equal(r.ok,false); assert.ok(r.sc>=0.8&&r.sc<1,`score ${r.sc}`); assert.equal(a.resClass(r),'part');
});

test('every shape right first time is green; giving up after one shape is red',async()=>{
  let {a,voicings,play}=await cMajor();
  voicings.slice(0,3).forEach(play);
  assert.equal(a.resClass(a.getRoundResults()[0]),'ok');
  ({a,voicings,play}=await cMajor());
  play(voicings[0]); a.action('giveup');
  const r=a.getRoundResults()[0]; assert.ok(Math.abs(r.sc-1/3)<1e-9,`score ${r.sc}`); assert.equal(a.resClass(r),'no');
  assert.equal(a.resScore({ok:true}),1); assert.equal(a.resScore({ok:false}),0);   // answers saved before scores
});

test('yellow starts at 60%: two shapes of three is yellow, one is red',async()=>{
  const a=await musicApp();
  assert.equal(a.resClass({ok:false,sc:2/3}),'part'); assert.equal(a.resClass({ok:false,sc:0.6}),'part');
  assert.equal(a.resClass({ok:false,sc:1/3}),'no'); assert.equal(a.resClass({ok:true,sc:1}),'ok');
});
