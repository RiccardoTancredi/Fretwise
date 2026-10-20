import test from 'node:test';
import assert from 'node:assert/strict';
import { recipients, syncDictionaries } from '../lib/dictionary-sync.mjs';

test('recipient list always includes the owner, deduplicates and fails closed on malformed IDs', () => {
  assert.deepEqual(recipients('owner'), ['owner']);
  assert.deepEqual(recipients('owner', 'friend, owner\nfriend'), ['owner', 'friend']);
  assert.deepEqual(recipients('owner', '["friend"]'), ['owner', 'friend']);
  for (const bad of ['["a/b"]', '[null]', '{bad}', '["good", 2]']) assert.throws(() => recipients('owner', bad));
});
function firestore(initial = {}, failPath) {
  const data = new Map(Object.entries(initial)), touched = [];
  const ref = path => ({ path, collection: name => ref(path + '/' + name), doc: id => ref(path + '/' + id), get: async () => ({ data: () => data.get(path) }) });
  return { data, touched, collection: name => ref(name), batch() {
    const ops = [];
    return { set: (r, v) => ops.push([r.path, v]), delete: r => ops.push([r.path, undefined]), async commit() {
      if (ops.some(([path]) => path === failPath)) throw new Error('private error details');
      for (const [path, value] of ops) { touched.push(path); value === undefined ? data.delete(path) : data.set(path, value); }
    } };
  } };
}

test('copies each language once to all recipients, prunes their own stale chunks and leaves progress untouched', async () => {
  const initial = {
    'users/owner/state/words': { p: { own: true } }, 'users/friend/state/words': { p: { different: true } },
    'users/owner/dict/_meta': { langs: { en: { chunks: 3 } } }, 'users/owner/dict/en-2': { rows: ['old'] },
    'users/friend/dict/_meta': { langs: { en: { chunks: 4 } } }, 'users/friend/dict/en-3': { rows: ['old'] }
  };
  const db = firestore(initial), calls = [], logs = [];
  const rows = Array.from({ length: 301 }, (_, i) => ({ id: String(i), w: 'private word' }));
  const failed = await syncDictionaries({ db, ids: ['owner', 'friend'], languages: [{ id: 'en' }, { id: 'ca' }],
    readLang: async l => { calls.push(l.id); return l.id === 'en' ? rows : []; }, log: s => logs.push(s), now: () => 100 });
  assert.equal(failed, 0); assert.deepEqual(calls, ['en', 'ca']);
  for (const uid of ['owner', 'friend']) {
    assert.deepEqual(db.data.get(`users/${uid}/dict/en-0`).rows, rows.slice(0, 300));
    assert.equal(db.data.get(`users/${uid}/dict/en-1`).rows.length, 1);
    assert.equal(db.data.get(`users/${uid}/dict/_meta`).langs.ca.count, 0);
  }
  assert.equal(db.data.has('users/owner/dict/en-2'), false); assert.equal(db.data.has('users/friend/dict/en-3'), false);
  for (const uid of ['owner', 'friend']) assert.deepEqual(db.data.get(`users/${uid}/state/words`), initial[`users/${uid}/state/words`]);
  assert.ok(db.touched.every(p => p.includes('/dict/')));
  assert.ok(logs.every(s => !/owner|friend|private word/.test(s)));
});

test('Notion and recipient write failures retain last good copies and report failure without leaking errors', async () => {
  const previous = { langs: { en: { chunks: 1, count: 1 }, it: { chunks: 1, count: 1 } } };
  const db = firestore({ 'users/owner/dict/_meta': previous, 'users/friend/dict/_meta': previous,
    'users/friend/dict/en-0': { rows: ['old'] } }, 'users/friend/dict/en-0');
  const logs = [];
  const failed = await syncDictionaries({ db, ids: ['owner', 'friend'], languages: [{ id: 'en' }, { id: 'it' }],
    readLang: async l => { if (l.id === 'it') throw new Error('private Notion details'); return [{ w: 'new' }]; }, log: s => logs.push(s) });
  assert.equal(failed, 2);
  assert.deepEqual(db.data.get('users/friend/dict/en-0').rows, ['old']);
  assert.deepEqual(db.data.get('users/friend/dict/_meta'), previous);
  assert.deepEqual(db.data.get('users/owner/dict/_meta').langs.it, previous.langs.it);
  assert.ok(logs.every(s => !s.includes('private')));
});
