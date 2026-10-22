import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
function q9(a){return {type:'chord',ch:a.CHORDS.find(c=>c.id==='9'),root:10,rootName:'B♭',sel:new Map(),found:[[6,3,3,3,3,4]],voicings:[],show:{src:'u',i:0},mist:0};}
const settings=(a,act,v)=>a.click('settings','[data-act]',{act,v});

test('removing the duplicated bass in the screenshot changes B♭9 to B♭9/C, not a rootless chord',async()=>{
  const a=await musicApp(),q=q9(a), original=q.found[0];
  assert.equal(a.identifyChord('guitar',original,q).matches[0].name,'B♭9');
  const changed=original.slice();changed[0]=-1;
  const result=a.identifyChord('guitar',changed,q);
  assert.equal(result.matches[0].name,'B♭9/C');assert.equal(result.bass,0);assert.equal(result.rootless,null);
});

test('identification distinguishes sus2, literal half-diminished and contextual rootless ninths',async()=>{
  const a=await musicApp(),q=q9(a);
  const sus=a.identifyChord('guitar',[-1,1,3,3,1,1],q);assert.equal(sus.matches[0].q.ch.id,'sus2');
  const rootless=a.identifyChord('guitar',[-1,-1,0,1,1,1],q);
  assert.equal(rootless.matches[0].name,'Dm7♭5');assert.equal(rootless.rootless,'B♭9 (no root)/D');
  const uke=a.identifyChord('ukulele',[0,0,0,0],{root:0,rootName:'C',ch:a.CHORDS.find(c=>c.id==='6')});
  assert.equal(uke.bass,0);assert.equal(uke.matches[0].name,'C6'); // actual C string below the first, high G string
  assert.equal(a.identifyChord('guitar',[-1,-1,-1,-1,-1,-1],q).notes.length,0);
});

test('exploring and undoing a copy never changes the completed exercise, stored shapes or progress',async()=>{
  const a=await musicApp();a.S.mode='chord';const q=q9(a);a.setQuestion(q);a.setPhase('answered');a.S.sound=false;
  const before=plain({...a.getState(),Q:{...q,sel:[...q.sel]}});
  a.openChordExplorer('guitar',q,q.found[0],[0,15]);a.exploreCell(0,6);
  assert.match(a.node('exploreTitle').textContent,/B♭9 → B♭9\/C/);
  a.click('chordExplorer','[data-eact]',{eact:'undo'});assert.equal(a.getExplorer().frets[0],6);
  a.click('chordExplorer','[data-eact]',{eact:'redo'});assert.equal(a.getExplorer().frets[0],-1);
  a.closeChordExplorer();assert.deepEqual(plain({...a.getState(),Q:{...q,sel:[...q.sel]}}),before);
});

test('length, inversions, shape count and fret changes keep answered questions and the current draft on both instruments',async()=>{
  for(const inst of ['guitar','ukulele']){
    const a=await musicApp();a.setInst(inst);a.S.mode='chord';a.S.roundLen=10;const q=q9(a);a.capturePractice(q);a.setQuestion(q);a.disableRendering();
    q.sel.set(1,3);a.setRound([{ok:true,ms:100,label:'first'},{ok:false,ms:200,label:'second'}]);
    const before=plain(a.getStats());const oldBass=a.questionBass(q);
    settings(a,'round','5');settings(a,'cbass',oldBass?'0':'1');settings(a,'cshapes','3');settings(a,'preset','0-15');
    assert.equal(a.getQuestion(),q);assert.equal(q.sel.get(1),3);assert.equal(q.found.length,1);assert.equal(a.getState().round.results.length,2);
    assert.equal(a.questionBass(q),oldBass);assert.equal(a.questionRange().fretEnd,12);assert.equal(q.practice.shapes,2);
    assert.deepEqual(plain(a.getStats()),before);
    a.nextQuestion();assert.equal(a.getQuestion().practice.bass,!oldBass);assert.equal(a.getQuestion().practice.shapes,3);assert.equal(a.questionRange().fretEnd,15);
    assert.equal(a.getState().round.results.length,2);
  }
});

test('shortening below completed count keeps every result and counts the summary once, including after reload',async()=>{
  const a=await musicApp();a.S.mode='chord';a.setQuestion(a.capturePractice(q9(a)));a.disableRendering();
  a.setRound([{ok:true,ms:100,label:'one'},{ok:false,ms:200,label:'two'}]);settings(a,'round','1');
  assert.equal(a.getState().phase,'summary');assert.equal(a.getState().round.results.length,2);assert.equal(a.getStats().guitar.rounds,1);
  settings(a,'cbass','0');assert.equal(a.getStats().guitar.rounds,1);
  const b=await musicApp({storage:a.storage});b.load();b.disableRendering();b.newRound();
  assert.equal(b.getState().round.results.length,2);assert.equal(b.getState().round.counted,true);assert.equal(b.getStats().guitar.rounds,1);
  settings(a,'round','10');assert.equal(a.getState().phase,'ask');assert.equal(a.getState().round.results.length,2);assert.equal(a.getStats().guitar.rounds,1);
});

test('changing exercise and reloading restores the question and Map/Set drafts independently of round length',async()=>{
  const a=await musicApp();a.S.mode='chord';const q=q9(a);a.capturePractice(q);a.setQuestion(q);a.disableRendering();q.sel.set(2,7);a.setRound([{ok:true,label:'kept',ms:10}]);a.storeRound();
  a.S.mode='name';a.newRound();a.S.mode='chord';a.S.roundLen=5;a.newRound();
  assert.equal(a.getQuestion().sel.get(2),7);assert.equal(a.getQuestion().found[0][0],6);assert.equal(a.getState().round.results[0].label,'kept');
  const b=await musicApp({storage:a.storage});b.S.mode='chord';b.disableRendering();b.newRound();assert.equal(b.getQuestion().sel.get(2),7);
  a.S.mode='all';a.newRound();a.startRun();a.getQuestion().found.add('0-0');a.setTime(2500);a.storeRound();
  a.S.mode='name';a.newRound();a.setTime(3000);a.S.mode='all';a.newRound();
  assert.equal(a.getState().phase,'ready');assert.ok(a.getQuestion().found.has('0-0'));assert.equal(a.getQuestion().elapsed,2500);
});

test('word answers are saved before Finish and are not counted twice when the session completes',async()=>{
  const a=await musicApp(),rows=[{id:'one',w:'one',d:'first'},{id:'two',w:'two',d:'second'}];
  a.setWordSession({lang:'en',day:'2026-10-22',mode:'learn',ids:['one','two'],queue:['one','two'],qi:0,phase:'quiz',q:{id:'one',dir:'w2d',opts:['one','two'],pick:null},results:{},mistakes:0,requeued:new Set()},{en:{rows}});
  a.answerQuiz('one');assert.equal(a.getState().WP.p.en.one.n,1);assert.equal(a.getState().WP.p.en.two,undefined);
  const session=a.getState().WSN,first=plain(a.getState().WP.p.en.one);
  a.click('wsettings','[data-wgoal]',{wgoal:'1'});a.click('wsettings','[data-wset]',{wset:'dir',v:'d2w'});
  assert.equal(a.getState().WSN,session);assert.equal(session.q.pick,'one');
  a.finishSession();a.finishSession();assert.deepEqual(plain(a.getState().WP.p.en.one),first);assert.equal(a.getState().WP.p.en.two,undefined);
});

test('painting settings and daily goal preserve answered items, active question and scores',async()=>{
  const a=await musicApp(),work={id:'p1',title:'A painting',artist:'Painter',thumb:'https://example.test/img.jpg'};
  a.setPaintSession({i:0,phase:'ask',day:'2026-10-22',right:0,items:[{x:work,kind:'artist',opts:['Painter','Other'],pick:null}]});a.answerPaint(0);
  const session=a.getState().PSN,before=plain(a.getState().PS.p);
  a.click('psettings','[data-pgoal]',{pgoal:'1'});a.click('psettings','[data-pkind]',{pkind:'museum'});
  assert.equal(a.getState().PSN,session);assert.equal(session.items[0].pick,0);assert.equal(session.right,1);assert.deepEqual(plain(a.getState().PS.p),before);
});


test('chess difficulty and coordinate settings apply to the next exercise without restarting the active one',async()=>{
  const a=await musicApp(),p={id:'sample',phase:'user',step:2,moves:['a2a4','a7a5','b2b4'],rating:1200,themes:[]};
  a.setPuzzle(p);a.setChessView('puzzles');a.click('csettings','[data-cset]',{cset:'diff',v:'200'});
  assert.equal(a.getPuzzle(),p);assert.equal(p.step,2);assert.equal(p.phase,'user');
  a.setChessView('coords');const r=a.getCoordState();r.phase='run';r.end=60000;r.score=7;r.wrong=1;r.target='e4';
  a.click('csettings','[data-cset]',{cset:'cdur',v:'30'});a.click('csettings','[data-cset]',{cset:'cside',v:'b'});
  assert.equal(r.phase,'run');assert.equal(r.end,60000);assert.equal(r.score,7);assert.equal(r.target,'e4');assert.equal(r.dur,60);assert.equal(a.getState().CS.coord.dur,30);
});


test('nested history and chord exploration exclude all consultation time from the current question',async()=>{
  const a=await musicApp();a.S.mode='chord';const q=q9(a);a.setQuestion(q);a.disableRendering();a.rememberMusic(true,'B♭9');
  a.setTime(1000);a.openReview('music');a.setTime(2000);a.openChordExplorer('guitar',q,q.found[0],[0,15]);
  a.setTime(5000);a.closeChordExplorer();a.setTime(6000);a.closeReview();a.finish(true,'B♭9');
  assert.equal(a.getState().round.results[0].ms,1000);
});


test('a valid original chord remains the primary reading of an ambiguous inversion',async()=>{
  const a=await musicApp(),q={root:9,rootName:'A',ch:a.CHORDS.find(c=>c.id==='m7')};
  const inversion=a.identifyChord('guitar',[-1,3,2,0,1,5],q); // C E G C A = Am7/C and C6
  assert.equal(inversion.matches[0].name,'Am7/C');assert.ok(inversion.matches.some(x=>x.name==='C6'));
});


test('a custom three-question round preserves progress and is restored on guitar and ukulele',async()=>{
  for(const inst of ['guitar','ukulele']){
    const a=await musicApp();a.setInst(inst);a.S.mode='chord';a.S.roundLen=10;a.setQuestion(a.capturePractice(q9(a)));a.disableRendering();
    a.setRound([{ok:true,ms:10,label:'one'},{ok:false,ms:20,label:'two'}]);
    const input={id:'roundLength',value:'3'};
    for(const cb of a.node('settings').listeners.change||[])cb({target:input});
    assert.equal(a.S.roundLen,3);assert.equal(a.getState().round.results.length,2);assert.equal(a.getState().phase,'ask');
    a.renderSettings();assert.match(a.node('settings').innerHTML,/id="roundLength"[^>]*value="3"/);
    const b=await musicApp({storage:a.storage});b.load();assert.equal(b.S.inst,inst);assert.equal(b.S.roundLen,3);
    for(const value of ['','0','-2','1.5','101','not a number']){
      input.value=value;for(const cb of a.node('settings').listeners.change||[])cb({target:input});
      assert.equal(a.S.roundLen,3);assert.equal(a.getState().round.results.length,2);
    }
  }
});


test('custom round length can be applied explicitly with Set or Enter without removing answers',async()=>{
  const a=await musicApp();a.S.mode='chord';a.setQuestion(a.capturePractice(q9(a)));a.disableRendering();a.setRound([{ok:true,ms:10,label:'one'}]);
  a.node('roundLength').value='3';settings(a,'roundcustom','');assert.equal(a.S.roundLen,3);assert.equal(a.getState().round.results.length,1);
  a.node('roundLength').value='4';let prevented=false;
  for(const cb of a.node('settings').listeners.keydown||[])cb({key:'Enter',target:{id:'roundLength'},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(a.S.roundLen,4);assert.equal(a.getState().round.results.length,1);
});
