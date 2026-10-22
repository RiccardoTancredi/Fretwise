import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
const saved=[-1,6,8,6,8,8];
function chordQuestion(a){return {type:'chord',ch:a.CHORDS.find(c=>c.id==='13'),root:3,rootName:'E♭',voicings:[saved],found:[saved],sel:new Map([[5,4]]),show:{src:'u',i:0}};}

test('review preserves the current question, draft, round and all progress; past chord snapshots do not change',async()=>{
  const a=await musicApp();a.S.mode='chord';const q=chordQuestion(a);a.setQuestion(q);
  a.rememberMusic(true,'E♭13');q.found[0]=[0,0,0,0,0,0];
  const live=a.getState(),before=plain({...live,Q:{...q,sel:[...q.sel]}});
  a.openReview('music');assert.equal(a.node('exerciseReview').open,true);
  assert.match(a.node('reviewBody').innerHTML,/Your saved shape/);
  assert.deepEqual(plain(a.getReview().list[0].chord.found[0]),saved);
  a.renderReview();a.stepReview(-1);a.closeReview();
  assert.equal(a.getQuestion(),q);assert.deepEqual(plain({...a.getState(),Q:{...q,sel:[...q.sel]}}),before);
});

test('history is bounded per section, restored across reload, and only records in its scoped storage',async()=>{
  const owner=new Map(),friend=new Map(),a=await musicApp({storage:owner});
  for(let i=0;i<105;i++)a.rememberExercise('guitar',{kind:'music',title:String(i)});
  a.rememberExercise('ukulele',{kind:'music',title:'uke'});
  const b=await musicApp({storage:owner}),c=await musicApp({storage:friend});
  assert.equal(b.exerciseHistory().guitar.length,100);assert.equal(b.exerciseHistory().guitar[0].title,'5');
  assert.equal(b.exerciseHistory().ukulele.length,1);assert.equal(c.exerciseHistory().guitar,undefined);
  a.storage.set('fretwise.exercise-history.v1','broken');assert.deepEqual(plain(a.exerciseHistory()),{});
});

test('history excludes private word contents and repeated answer clicks do not create duplicate entries',async()=>{
  const a=await musicApp();
  const rows=[{id:'one',w:'private word',d:'private definition'},{id:'two',w:'other word',d:'other definition'}];
  a.setWordSession({lang:'en',mode:'practice',ids:['one'],queue:['one'],qi:0,phase:'quiz',q:{id:'one',dir:'w2d',opts:['one','two'],pick:null},results:{},mistakes:0,requeued:new Set()},{en:{rows}});
  a.answerQuiz('one');a.answerQuiz('two');
  assert.equal(a.exerciseHistory().words.length,1);
  const before=plain(a.getState());a.openReview('words');assert.match(a.node('reviewBody').innerHTML,/private word/);a.closeReview();assert.deepEqual(plain(a.getState()),before);
  const raw=a.storage.get('fretwise.exercise-history.v1');assert.doesNotMatch(raw,/private word|private definition|other definition/);
});

test('modal keyboard events cannot submit the underlying exercise, and timed runs cannot open review',async()=>{
  const a=await musicApp();a.S.mode='chord';a.setQuestion(chordQuestion(a));a.openReview('music');
  const handler=a.documentListeners.keydown.at(-1);let stopped=false;
  handler({key:'Enter',target:{tagName:'DIV'},stopImmediatePropagation(){stopped=true;},preventDefault(){}});
  assert.equal(stopped,true);a.closeReview();
  a.S.mode='all';a.openReview('music');assert.equal(a.getReview(),null);
  a.setChessView('coords');a.setCoordsPhase('run');a.openReview('chess');assert.equal(a.getReview(),null);
});

test('puzzle completion is logged once, replay has no live engine or scoring dependency',async()=>{
  const a=await musicApp();a.setPuzzle({id:'test',fen:'initial',moves:['a2a4'],rating:1200});
  a.rememberPuzzle();a.rememberPuzzle();assert.equal(a.exerciseHistory().chess.length,1);
  const before=plain(a.getState());a.openReview('chess');a.renderReview();a.closeReview();assert.deepEqual(plain(a.getState()),before);
});

test('catalog uses its own range and bass preferences and offers all generated suggestions, not just eight',async()=>{
  const a=await musicApp();a.S.mode='chord';a.setQuestion(chordQuestion(a));
  a.S.library={root:3,chord:'13',start:0,end:15,bass:false};
  const before=plain({range:a.S.by,bass:a.S.rootBass,stats:a.getStats()}), q=a.getQuestion();
  const {shapes}=a.libraryData();assert.ok(shapes.length>8);a.renderLibrary();
  assert.equal(a.getQuestion(),q);assert.deepEqual(plain({range:a.S.by,bass:a.S.rootBass,stats:a.getStats()}),before);
  assert.match(a.node('answer').innerHTML,/E♭13/);assert.match(a.node('answer').innerHTML,/More shapes/);
  for(const fr of shapes) assert.equal(a.evalShape({ch:q.ch,root:3},fr).missing.length,0);
  a.S.library.root=4;a.libraryData();assert.equal(a.getQuestion(),q);
});


test('painting answers are recorded once and viewing the answer does not alter its review schedule',async()=>{
  const a=await musicApp(),work={id:'p1',title:'Test painting',artist:'A painter',thumb:'https://example.test/image.jpg'};
  a.setPaintSession({i:0,day:'2026-10-22',phase:'ask',right:0,items:[{x:work,kind:'artist',opts:['A painter','Other'],pick:null}]});
  a.answerPaint(0);a.answerPaint(1);assert.equal(a.exerciseHistory().paintings.length,1);
  const before=plain(a.getState());a.openReview('paintings');assert.match(a.node('reviewBody').innerHTML,/Correct answer: <b>A painter/);a.closeReview();assert.deepEqual(plain(a.getState()),before);
});
