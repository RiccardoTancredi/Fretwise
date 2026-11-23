import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// the read music data block of the app is pure: run it on its own
const src=await readFile(new URL('../../src/app.html',import.meta.url),'utf8');
const a=src.indexOf('/* ---------- read music data'), b=src.indexOf('/* ---------- end of read music data ---------- */');
const R=new Function(src.slice(a,b)+';return {RM_SETS,RM_SET,RM_KEYSET,RM_RANGE,RM_NX,RM_Y0,RM_IVI,RM_QI,rmSetKeys,rmCard,rmStaffSvg,rmLayout,rmStep,rmP,rmSci,rmMidi,rmEarExample,rmGuessPitch,rmNm,RM_LESSONS,RM_LESSON,rmEx,rmStaffRow,rmKeyAlt,RM_KEYS,RM_KSIG,RM_MAJ,RM_DIA3,RM_DIA7,RM_PROGS,RM_SCALES,rmProg,rmScale};')();
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
  const keys=[...R.RM_KEYSET.keys()].filter(k=>k[0]==='n'||k[0]==='c');
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

// a repeatable "random": the same examples every run
const seeded=s=>()=>((s=Math.imul(s^(s>>>15),0x2c1b3c6d)+0x6d2b79f5|0)>>>0)/4294967296;

test('ear training: every interval and chord example sounds what its answer says, from any root',()=>{
  const ear=[...R.RM_KEYSET.keys()].filter(k=>k[0]==='e'&&['prog','scale'].indexOf(R.RM_SET[R.RM_KEYSET.get(k)].how)<0);
  assert.equal(ear.length,12*3+4+6+8+6+8);
  const rnd=seeded(7), pcs=ps=>ps.map(p=>(R.rmMidi(p)-R.rmMidi(ps[0])+120)%12);
  for(const k of ear) for(let i=0;i<40;i++){
    const c=R.rmCard(k), ex=R.rmEarExample(c,rnd), m=ex.ps.map(R.rmMidi);
    if(c.how==='up'||c.how==='together') assert.equal(m[1]-m[0],R.RM_IVI[c.ans].s,k);
    else if(c.how==='down') assert.equal(m[0]-m[1],R.RM_IVI[c.ans].s,k);
    else{
      const q=c.how==='inv'?c.q:c.ans, inv=c.how==='inv'?+c.ans:0, want=R.RM_QI[q].iv.map(([,s])=>s%12);
      assert.deepEqual([...new Set(m.map(x=>(x-m[inv?ex.ps.length-inv:0]+120)%12))].sort((a,b)=>a-b),[...new Set(want)].sort((a,b)=>a-b),k);
      for(let j=1;j<m.length;j++) assert.ok(m[j]>m[j-1],k+' goes up');
    }
    assert.ok(ex.ps.every(p=>Math.abs(p.a)<2),k+': no double sharps or flats');
    assert.ok(m.every(x=>x>=33&&x<=96),k+': inside the piano samples');
    assert.equal(ex.clef,Math.min(...m)<57?'b':'t');
  }
});

test('a wrong ear answer is played from the same root, so the two can be compared',()=>{
  const rnd=seeded(3);
  const c=R.rmCard('e|e1|M3'), ex=R.rmEarExample(c,rnd), y=R.rmEarExample(c,rnd,'m3',ex);
  assert.equal(R.rmSci(y.ps[0]),R.rmSci(ex.ps[0])); assert.equal(R.rmMidi(y.ps[1])-R.rmMidi(y.ps[0]),3);
  const t=R.rmCard('e|e5|maj|0'), tx=R.rmEarExample(t,rnd), ty=R.rmEarExample(t,rnd,'1',tx);
  assert.equal(R.rmMidi(ty.ps[2]),R.rmMidi(tx.ps[0])+12);      // first inversion: the root on top
});

test('a wrong note is drawn next to the right one, in its own colour, with its own ledger lines',()=>{
  const svg=R.rmStaffSvg('t',[R.rmP('F3')],{extra:R.rmP('A3')});
  assert.match(svg,/class="rextra"/); assert.equal((svg.match(/stroke-width="1.6"/g)||[]).length,3+2);
});

test('a wrong note name is placed in the nearest octave that stays inside the frame',()=>{
  assert.equal(R.rmSci(R.rmGuessPitch(R.rmP('F3'),'C','t')),'C4');     // C3 is nearer, but four ledger lines down
  assert.equal(R.rmSci(R.rmGuessPitch(R.rmP('G4'),'A','t')),'A4');
  for(const id of ['nt','nb']) for(const k of R.rmSetKeys(id)){ const c=R.rmCard(k);
    for(const L of 'CDEFGAB'){ const q=R.rmGuessPitch(c.ps[0],L,c.clef), st=R.rmStep(q)-(c.clef==='t'?30:18); assert.ok(st>=-7&&st<=15,k+' '+L); } }
});

test('the lessons: every example and question draws, every question has four different answers, the sets exist',()=>{
  const ids=new Set(), sets=new Set(R.RM_SETS.map(s=>s.id)); let qs=0;
  for(const L of R.RM_LESSONS){
    assert.ok(!ids.has(L.id)); ids.add(L.id); L.sets.forEach(id=>assert.ok(sets.has(id),L.id+' '+id));
    const exs=L.body.filter(b=>typeof b!=='string').concat(L.quiz.filter(q=>q.ex).map(q=>q.ex));
    for(const b of exs){ const e=R.rmEx(b), svg=R.rmStaffRow(e.clef,e.cols,{key:e.key,labels:e.labels});
      assert.doesNotMatch(svg,/NaN|undefined|@/,L.id); assert.ok(!e.labels.length||e.labels.length===e.cols.length,L.id+' labels'); }
    for(const q of L.quiz){ assert.equal(q.o.length,4,q.q); assert.equal(new Set(q.o).size,4,q.q); assert.ok(q.why,q.q); qs++; }
  }
  const keys=R.rmSetKeys('th'); assert.equal(keys.length,qs);
  for(const k of keys){ const c=R.rmCard(k); assert.equal(c.kind,'theory'); assert.equal(c.opts[0],R.RM_LESSON[c.lesson].quiz[c.i].o[0]); }
});

test('the key signature: sharps and flats in their order, notes in the key without their accidental',()=>{
  assert.equal(R.rmKeyAlt(2,R.rmP('C5').l),1); assert.equal(R.rmKeyAlt(2,R.rmP('G5').l),0); assert.equal(R.rmKeyAlt(-3,R.rmP('A4').l),-1); assert.equal(R.rmKeyAlt(-3,R.rmP('D4').l),0);
  const n=svg=>(svg.match(/<path/g)||[]).length;
  // G major on the G major key: clef, the sharp, eight notes and no accidental by them
  assert.equal(n(R.rmStaffRow('t','G4 A4 B4 C5 D5 E5 F♯5 G5'.split(' ').map(p=>[R.rmP(p)]),{key:1})),1+1+8);
  // an F natural in G major needs its natural sign
  assert.equal(n(R.rmStaffRow('t',[[R.rmP('F5')]],{key:1})),1+1+2);
});

test('the lessons say what they show: chord symbols and interval names match the notes written',()=>{
  const Q={'':'maj',m:'min',dim:'dim',aug:'aug','°':'dim','7':'7',m7:'m7','ø':'m7b5','m7♭5':'m7b5','Δ':'maj7',maj7:'maj7','°7':'dim7','−Δ':'mmaj7','+Δ':'maj7s5','+7':'7s5',
    '6':'6',m6:'m6',sus2:'sus2',sus4:'sus4',add9:'add9','m(add9)':'madd9','9':'9',maj9:'maj9',m9:'m9','13':'13',Im:'min',IIm:'min'};
  const IV={m3:3,M3:4,P5:7,A4:6,d5:6,m6:8};
  let checked=0;
  for(const L of R.RM_LESSONS) for(const b of L.body.filter(b=>typeof b!=='string')){ const e=R.rmEx(b);
    e.labels.forEach((lab,i)=>{ const ps=e.cols[i], m=ps.map(R.rmMidi);
      if(lab in IV&&ps.length===2){ assert.equal(m[1]-m[0],IV[lab],L.id+' '+lab); checked++; return; }
      const x=/^([A-G][♯♭]?)(.*?)(?:\/([A-G][♯♭]?))?$/u.exec(lab); if(!x||!(x[2] in Q)||ps.length<3) return;
      const root=R.rmMidi(R.rmP(x[1]+'4'))%12, want=new Set(R.RM_QI[Q[x[2]]].iv.map(([,s])=>(root+s)%12)), have=new Set(m.map(v=>v%12));
      // a full thirteenth: all seven notes; a voicing as played may leave some out, but adds nothing else
      if(ps.length<want.size) [...have].forEach(v=>assert.ok(want.has(v),L.id+' '+lab)); else assert.deepEqual([...have].sort(),[...want].sort(),L.id+' '+lab);
      if(x[3]) assert.equal(R.rmNm(ps[0]),x[3],L.id+' '+lab+' bass'); else if(ps.length===want.size) assert.equal(m[0]%12,root,L.id+' '+lab+' root');
      checked++; });
  }
  assert.ok(checked>=30,String(checked));
});

const pc=p=>((R.rmMidi(p)%12)+12)%12;
test('key cards: the chords of every major key, from the key, spelled with its key signature alone',()=>{
  const k1=R.rmSetKeys('k1'), k2=R.rmSetKeys('k2'); assert.equal(k1.length,12*7*2); assert.equal(k2.length,24);
  const paths=svg=>(svg.match(/<path/g)||[]).length;
  for(const k of k1.concat(k2)){
    const c=R.rmCard(k), a=k.split('|'), key=+a[2], tonic=R.rmP(R.RM_KEYS[key]+'4'), scale=new Set(R.RM_MAJ.map(x=>(pc(tonic)+x)%12)), ps=c.ex.cols[0];
    assert.equal(new Set(c.opts).size,c.opts.length,k); assert.ok(c.ans>=0&&c.ans<c.opts.length,k);
    assert.ok(ps.every(p=>scale.has(pc(p))),k+': notes of the key'); assert.ok(ps.every(p=>Math.abs(p.a)<2),k);
    // in its key signature the chord needs no accidental: clef, signature and note heads only
    assert.equal(paths(R.rmStaffRow('t',c.ex.cols,{key:R.RM_KSIG[key]})),1+Math.abs(R.RM_KSIG[key])+ps.length,k);
    if(a[1]==='k1'){ const d=+a[3], q=(a[4]==='7'?R.RM_DIA7:R.RM_DIA3)[d]; assert.equal(c.ans,d);
      assert.equal(pc(ps[0]),(pc(tonic)+R.RM_MAJ[d])%12,k); assert.deepEqual(ps.map(p=>(R.rmMidi(p)-R.rmMidi(ps[0]))),R.RM_QI[q].iv.map(([,x])=>x),k); }
    else { assert.equal(c.ans,key); assert.equal((pc(ps[0])-pc(tonic)+12)%12,a[3]==='V'?7:11,k); }
  }
  assert.equal(R.rmCard('k|k1|3|5|7').opts[5],'Cm7');       // E♭ major: VIm7 is Cm7
  assert.equal(R.rmCard('k|k2|7|V').q,'D7 is the V7 of which major key?');
});

test('progressions by ear: every chord is what its numeral says, the root in the bass, from any key',()=>{
  const pcsOf=ps=>[...new Set(ps.map(pc))].sort((x,y)=>x-y);
  for(const id of Object.keys(R.RM_PROGS)) for(let key=0;key<12;key++){
    const P=R.RM_PROGS[id], p=R.rmProg(key,id);
    assert.equal(p.cols.length,P.ch.length);
    p.cols.forEach((col,i)=>{ const [d,q]=P.ch[i], bass=col[0], up=col.slice(1);
      assert.ok(R.rmMidi(bass)>=40&&R.rmMidi(bass)<52,id+key); assert.ok(up.every(x=>R.rmMidi(x)>=55&&R.rmMidi(x)<67),id+key);
      assert.deepEqual(pcsOf(up),[...new Set(R.RM_QI[q].iv.map(([,s])=>(pc(bass)+s)%12))].sort((x,y)=>x-y),id+key+i);
      assert.ok(col.every(x=>Math.abs(x.a)<2),id+key+' spelled simply'); });
    // in the key signature only the leading tone of a minor V7 needs an accidental
    const svg=R.rmStaffRow('b',p.cols,{key:p.key}), heads=p.cols.flat().length;
    assert.equal((svg.match(/<path/g)||[]).length,1+Math.abs(p.key)+heads+(P.minor?1:0),id+key);
  }
  const c=R.rmCard('e|e9|perf'), seeded=s=>()=>((s=Math.imul(s^(s>>>15),0x2c1b3c6d)+0x6d2b79f5|0)>>>0)/4294967296, rnd=seeded(5);
  const ex=R.rmEarExample(c,rnd), y=R.rmEarExample(c,rnd,'dec',ex);
  assert.equal(y.keyName,ex.keyName); assert.deepEqual(y.labels,['I','IV','V7','VIm']);
});

test('scales by ear: each scale has its steps, one letter each, from roots that need no double accidentals',()=>{
  const seeded=s=>()=>((s=Math.imul(s^(s>>>15),0x2c1b3c6d)+0x6d2b79f5|0)>>>0)/4294967296, rnd=seeded(9);
  for(const id of Object.keys(R.RM_SCALES)) for(let i=0;i<30;i++){
    const ex=R.rmEarExample(R.rmCard('e|e11|'+id),rnd), m=ex.ps.map(R.rmMidi);
    assert.deepEqual(m.slice(0,7).map(x=>x-m[0]),R.RM_SCALES[id].st,id); assert.equal(m[7]-m[0],12);
    ex.ps.forEach((p,j)=>j&&assert.equal(R.rmStep(p)-R.rmStep(ex.ps[j-1]),1,id)); assert.ok(ex.ps.every(p=>Math.abs(p.a)<2),id+' '+R.rmSci(ex.ps[0]));
    assert.ok(m[0]>=57&&m[7]<=96);
  }
});
