import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const storageCode = await readFile(new URL('../../web/account-storage.js', import.meta.url), 'utf8');
const platformCode = await readFile(new URL('../../web/platform.js', import.meta.url), 'utf8');
const keys = ['fretwise.v1', 'fretwise.v1.runs', 'fretwise.chess', 'fretwise.words.settings', 'fretwise.words.data', 'fretwise.words.progress', 'fretwise.activity', 'fretwise.device', 'fretwise.paintings', 'fretwise.pushToken'];
function backend() {
  const data = new Map();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function factory() { const window = {}; vm.runInNewContext(storageCode, { window }); return window.FretwiseAccountStorage.create; }

test('all local stores separate owner, recipient and guest, and restore the same account', () => {
  const create = factory(), disk = backend();
  for (const key of keys) disk.setItem(key, 'unowned legacy data');
  const owner = create('owner', disk), friend = create('friend', disk), guest = create(null, disk);
  for (const key of keys) {
    assert.equal(owner.getItem(key), null); assert.equal(friend.getItem(key), null);
    owner.setItem(key, 'owner value'); friend.setItem(key, 'friend value'); guest.setItem(key, 'guest value');
    assert.equal(create('owner', disk).getItem(key), 'owner value');
    assert.equal(friend.getItem(key), 'friend value'); assert.equal(guest.getItem(key), 'guest value');
    assert.equal(disk.getItem(key), 'unowned legacy data');
  }
  owner.deactivate(); owner.setItem(keys[0], 'late callback'); owner.removeItem(keys[1]);
  assert.equal(create('owner', disk).getItem(keys[0]), 'owner value');
  assert.equal(create('owner', disk).getItem(keys[1]), 'owner value');
});

test('blocked browser storage remains usable in memory without touching another scope', () => {
  const store = factory()('owner', undefined);
  store.setItem('progress', 'saved'); assert.equal(store.getItem('progress'), 'saved');
  store.removeItem('progress'); assert.equal(store.getItem('progress'), null);
});

async function platform(initialUid = 'owner', waitForAuth = Promise.resolve()) {
  const disk = backend(), writes = [], listeners = [];
  let changeAuth, reloads = 0, resolveRead;
  let reads = Promise.resolve({ exists: () => true, data: () => ({ p: {} }) });
  const auth = { currentUser: initialUid ? { uid: initialUid } : null, authStateReady: () => waitForAuth };
  const D = {
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    doc: (_, ...parts) => parts.join('/'), collection: (_, ...parts) => parts.join('/'),
    setDoc: async (path, value) => { writes.push({ path, value }); }, getDoc: () => reads,
    getDocs: async () => ({ empty: true }),
    onSnapshot: (path, cb) => { listeners.push(cb); return () => {}; }
  };
  const U = {
    getAuth: () => auth, getRedirectResult: async () => null,
    onAuthStateChanged: (_, cb) => { changeAuth = cb; queueMicrotask(() => cb(auth.currentUser)); },
    signOut: async () => { auth.currentUser = null; changeAuth(null); }
  };
  const document = { documentElement: {}, head: { appendChild() {} }, createElement: () => ({}), getElementById: () => null, addEventListener() {} };
  const context = { document, navigator: {}, location: { reload: () => reloads++ }, console, setTimeout, Intl,
    FIREBASE_CONFIG: { apiKey: 'configured', projectId: 'fixture' }, localStorage: disk, addEventListener() {},
    loadSDK: async name => name === 'firebase-app.js' ? { initializeApp: () => ({}) } : name === 'firebase-auth.js' ? U : D };
  context.window = context; context.self = context;
  vm.createContext(context); vm.runInContext(storageCode, context);
  // Substitute only the SDK transport; exercise the production identity and storage logic.
  vm.runInContext(platformCode.replace(/import\(SDK\+'([^']+)'\)/g, "loadSDK('$1')"), context);
  return { context, writes, listeners, get reloads() { return reloads; },
    async ready() { await context.fretwiseReady; await new Promise(r => setImmediate(r)); },
    switchTo(uid) { auth.currentUser = uid ? { uid } : null; changeAuth(auth.currentUser); },
    deferRead() { reads = new Promise(r => { resolveRead = r; }); return () => resolveRead({ exists: () => true, data: () => ({ private: true }) }); }
  };
}

test('identity resolves before local state becomes available', async () => {
  let settle; const p = await platform('owner', new Promise(r => { settle = r; }));
  assert.equal(p.context.fretwiseStorage, undefined);
  settle(); await p.ready();
  assert.ok(p.context.fretwiseStorage);
  assert.equal(await (await p.context.claude.use('user')).id(), 'owner');
});

for (const next of ['friend', null]) test(`account transition to ${next} blocks old reads, writes and listeners before reload`, async () => {
  const p = await platform(); await p.ready();
  const db = await p.context.claude.use('db');
  assert.throws(() => db.doc('data/users/friend/words'), e => e.code === 'not_granted');
  const ref = db.doc('data/users/owner/words');
  await ref.set({ p: { owner: true } });
  let snapshots = 0; ref.onSnapshot(() => snapshots++);
  const finishRead = p.deferRead(), pending = ref.get();
  p.context.fretwiseStorage.setItem('progress', 'owner');
  p.switchTo(next);
  finishRead(); await assert.rejects(pending, e => e.code === 'signed_out');
  await assert.rejects(ref.set({ p: { leaked: true } }), e => e.code === 'signed_out');
  p.listeners[0]({ metadata: {}, exists: () => true, data: () => ({}) });
  assert.equal(snapshots, 0); assert.equal(p.reloads, 1);
  assert.equal(p.context.document.documentElement.inert, true);
  assert.equal(await p.context.claude.use('db'), null);
  assert.equal(p.writes.filter(w => w.path.includes('/state/')).length, 1);
});

test('signing in from a guest page reloads before connecting any progress', async () => {
  const p = await platform(null); await p.ready();
  p.context.fretwiseStorage.setItem('progress', 'guest');
  p.switchTo('friend');
  assert.equal(p.reloads, 1); assert.equal(p.writes.length, 0);
});
