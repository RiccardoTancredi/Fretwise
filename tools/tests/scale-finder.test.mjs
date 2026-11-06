import test from 'node:test';
import assert from 'node:assert/strict';
import {musicApp} from './helpers/music-app.mjs';

test('chord names are read, and the scales that hold every chord tone come first',async()=>{
  const a=await musicApp();
  const r=a.fitParse('C Am7 F#m7b5 B♭maj7 G7#9 Xyz');
  assert.equal(r.out.map(c=>c.ch).join(' '),'maj m7 m7b5 maj7 7s9'); assert.equal(r.bad.join(' '),'Xyz');
  const C=0, A=9, list=a.fitScales([{root:C,ch:'maj'},{root:A,ch:'m'}]);
  assert.ok(list.length>=3);
  assert.ok(list.every(x=>!x.missing.length),'C and Am fit many scales whole');
  const top=list.slice(0,4).map(x=>x.root+' '+x.sc.id);
  assert.ok(top.includes('0 majp')||top.includes('0 maj'),top.join(', '));       // C major pentatonic or C major
  // C7, C♯dim7 and F♯aug together: no scale here holds every note; the closest come with what is missing
  const hard=a.fitScales([{root:C,ch:'7'},{root:1,ch:'dim7'},{root:6,ch:'aug'}]);
  assert.ok(hard.length&&hard[0].missing.length>0);
});
