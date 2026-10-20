import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const storageCode = await readFile(new URL('../../web/account-storage.js', import.meta.url), 'utf8');
const platformCode = await readFile(new URL('../../web/platform.js', import.meta.url), 'utf8');
const keys = ['fretwise.v1', 'fretwise.v1.runs', 'fretwise.chess', 'fretwise.words.settings', 'fretwise.words.data', 'fretwise.words.progress', 'fretwise.activity', 'fretwise.device', 'fretwise.paintings', 'fretwise.pushToken', 'fretwise.pushEnabled'];
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

async function platform(initialUid = 'owner', waitForAuth = Promise.resolve(), options = {}) {
  const disk = backend(), writes = [], listeners = [], removed = [], foreground = [], notifications = [];
  if(options.legacy) disk.setItem('fretwise.pushToken',options.legacy);
  const seed=factory()(initialUid,disk);
  for(const [key,value] of Object.entries(options.local||{})) seed.setItem(key,value);
  let changeAuth, reloads = 0, resolveRead;
  let reads = Promise.resolve({ exists: () => true, data: () => options.push||{ p: {} } });
  const auth = { currentUser: initialUid ? { uid: initialUid } : null, authStateReady: () => waitForAuth };
  const D = {
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    doc: (_, ...parts) => parts.join('/'), collection: (_, ...parts) => parts.join('/'),
    setDoc: async (path, value) => { if(options.failSave&&path.endsWith('/push')) throw new Error('offline'); writes.push({ path, value }); },
    getDoc: () => reads,
    FieldPath: class { constructor(...parts){ this.parts=parts; } }, deleteField: () => null,
    updateDoc: async (path, field) => { removed.push({path,token:field.parts[1]}); },
    getDocs: async () => ({ empty: true }),
    onSnapshot: (path, cb) => { listeners.push(cb); return () => {}; }
  };
  const U = {
    getAuth: () => auth, getRedirectResult: async () => null,
    onAuthStateChanged: (_, cb) => { changeAuth = cb; queueMicrotask(() => cb(auth.currentUser)); },
    signOut: async () => { auth.currentUser = null; changeAuth(null); }
  };
  const document = { documentElement: {}, head: { appendChild() {} }, createElement: () => ({}), getElementById: () => null, addEventListener() {} };
  const M={isSupported:async()=>true,getMessaging:()=>({}),getToken:async()=>options.token||'current',onMessage:(_,cb)=>foreground.push(cb)};
  const context = { document, navigator: {userAgent:'test browser'}, location: { reload: () => reloads++ }, console, setTimeout, Intl,
    FIREBASE_CONFIG: { apiKey: 'configured', projectId: 'fixture', vapidKey:'public fixture' }, localStorage: disk, addEventListener() {},
    loadSDK: async name => name === 'firebase-app.js' ? { initializeApp: () => ({}) } : name === 'firebase-auth.js' ? U : name === 'firebase-messaging.js' ? M : D };
  if(options.pushSupport){
    context.Notification={permission:'granted'}; context.PushManager=function(){};
    context.navigator.serviceWorker={ready:Promise.resolve({showNotification:async(title,config)=>notifications.push({title,config})})};
  }
  context.window = context; context.self = context;
  vm.createContext(context); vm.runInContext(storageCode, context);
  // Replace SDK transport and expose private push functions inside this test VM only.
  const code=platformCode.replace(/import\(SDK\+'([^']+)'\)/g,"loadSDK('$1')")
    .replace(/\}\)\(\);\s*$/, "window.testPush={refreshToken,removeToken};})();");
  vm.runInContext(code, context);
  return { context, writes, listeners, removed, foreground, notifications, get reloads() { return reloads; },
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

test('legacy reminder consent renews an expired token only for the original account', async () => {
  const options={pushSupport:true,legacy:'expired',push:{tokens:{expired:{t:1}},hour:20,items:{words:true}},token:'renewed'};
  const owner=await platform('owner',Promise.resolve(),options); await owner.ready();
  assert.equal(owner.context.fretwiseStorage.getItem('fretwise.pushToken'),'renewed');
  assert.equal(owner.context.fretwiseStorage.getItem('fretwise.pushEnabled'),'1');
  assert.deepEqual(owner.removed,[{path:'users/owner/state/push',token:'expired'}]);
  assert.equal(owner.writes.find(w=>w.path.endsWith('/push')).value.hour,20);
  const friend=await platform('friend',Promise.resolve(),{...options,push:{tokens:{}}}); await friend.ready();
  assert.equal(friend.context.fretwiseStorage.getItem('fretwise.pushToken'),null);
  assert.equal(friend.writes.filter(w=>w.path.endsWith('/push')).length,0);
});

test('an opted-in account recovers a token removed by FCM, without changing another account', async () => {
  for(const uid of ['owner','friend']){
    const p=await platform(uid,Promise.resolve(),{pushSupport:true,local:{'fretwise.pushEnabled':'1'},push:{tokens:{}},token:uid+'-new'}); await p.ready();
    assert.equal(p.writes.find(w=>w.path.endsWith('/push')).path,`users/${uid}/state/push`);
    assert.equal(p.context.fretwiseStorage.getItem('fretwise.pushToken'),uid+'-new');
  }
});

test('foreground delivery shows a notification for each signed-in account, only once per message', async () => {
  for(const uid of ['owner','friend']){
    const p=await platform(uid,Promise.resolve(),{pushSupport:true,local:{'fretwise.pushEnabled':'1'}}); await p.ready();
    await p.context.testPush.refreshToken();
    assert.equal(p.foreground.length,1);
    await p.foreground[0]({data:{title:'Practice?',body:'Words',url:'./'}});
    assert.equal(p.notifications.length,1); assert.equal(p.notifications[0].config.body,'Words');
    p.switchTo(uid==='owner'?'friend':'owner');
    await p.foreground[0]({data:{title:'Late message'}});
    assert.equal(p.notifications.length,1);
  }
});

test('explicitly disabled reminders remain disabled and a failed renewal preserves the previous token', async () => {
  const off=await platform('owner',Promise.resolve(),{pushSupport:true,legacy:'old',push:{tokens:{old:{}}},local:{'fretwise.pushEnabled':'0'}}); await off.ready();
  assert.equal(off.writes.filter(w=>w.path.endsWith('/push')).length,0);
  const failed=await platform('owner',Promise.resolve(),{pushSupport:true,token:'new',failSave:true,local:{'fretwise.pushToken':'old','fretwise.pushEnabled':'1'}}); await failed.ready();
  assert.equal(failed.context.fretwiseStorage.getItem('fretwise.pushToken'),'old');
  assert.equal(failed.removed.length,0);
});
