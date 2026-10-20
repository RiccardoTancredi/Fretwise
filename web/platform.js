/* Fretwise web platform layer.
   Google sign-in, private sync in Firestore, the owner's words, daily reminders, offline install.
   It loads before the app script. The app talks to it the same way it talks to Claude's runtime:
   window.claude.use('db' | 'user') for progress, plus window.fretwiseWordsSource for the words.
   Without a Firebase config everything still works, saved in this browser only. */
(function(){
'use strict';
const CFG=self.FIREBASE_CONFIG||{};
const CONFIGURED=!!(CFG.apiKey&&!/^REPLACE/.test(CFG.apiKey)&&CFG.projectId);
const SDK='https://www.gstatic.com/firebasejs/12.19.0/';
const ITEMS=[['guitar','Guitar'],['ukulele','Ukulele'],['chess','Chess'],['words','Words'],['paintings','Paintings']];
window.FW_WEB=true;

let F=null, authKnown=!CONFIGURED;
const ready=CONFIGURED?init().catch(e=>{ console.warn('Fretwise: Firebase did not start',e); authKnown=true; renderAcct(); return null; }):Promise.resolve(null);

async function init(){
  const [A,U,D]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=A.initializeApp(CFG);
  const auth=U.getAuth(app);
  let db;
  try{ db=D.initializeFirestore(app,{ignoreUndefinedProperties:true,localCache:D.persistentLocalCache({tabManager:D.persistentMultipleTabManager()})}); }
  catch(e){ db=D.initializeFirestore(app,{ignoreUndefinedProperties:true}); }
  F={A,U,D,app,auth,db};
  U.getRedirectResult(auth).catch(()=>{});
  await auth.authStateReady();
  authKnown=true;
  U.onAuthStateChanged(auth,u=>{ renderAcct(); if(u) afterSignIn(u); });
  return F;
}
const me=()=>F&&F.auth.currentUser;

/* ---------- the store the app expects: data/users/<uid>/<name> -> users/<uid>/state/<name> ---------- */
function docRef(path){
  const m=/^data\/users\/([^/]+)\/([A-Za-z0-9_-]+)$/.exec(path);
  if(!m) throw {code:'invalid_argument'};
  return F.D.doc(F.db,'users',m[1],'state',m[2]);
}
const dbShim={ doc(path){ const r=docRef(path); return {
  async get(){ const s=await F.D.getDoc(r); return {exists:s.exists(),data:()=>s.data()}; },
  async set(v){ await F.D.setDoc(r,v); },
  onSnapshot(cb,err){ return F.D.onSnapshot(r,s=>{ if(s.metadata.hasPendingWrites) return; cb({exists:s.exists(),data:()=>s.data()}); },err); }
}; } };
const userShim={ async id(){ const u=me(); return u?u.uid:null; } };
if(!window.claude) window.claude={ async use(name){ const f=await ready; if(!f||!me()) return null; if(name==='db') return dbShim; if(name==='user') return userShim; return null; } };

/* ---------- words: written by the Notion sync job, readable only by their owner ---------- */
window.fretwiseWordsSource={
  signedIn:()=>!!me(),
  signIn,
  async load(){
    const f=await ready; if(!f) throw {code:'not_configured'};
    const u=me(); if(!u) throw {code:'signed_out'};
    let snap;
    try{ snap=await f.D.getDocs(f.D.collection(f.db,'users',u.uid,'dict')); }
    catch(e){ throw {code:(e&&e.code)||'upstream_error'}; }
    if(snap.empty) throw {code:'no_words'};
    const meta={}, parts={};
    snap.forEach(d=>{ const x=d.data(); if(d.id==='_meta') Object.assign(meta,x); else { const k=d.id.lastIndexOf('-'); const lang=d.id.slice(0,k), i=+d.id.slice(k+1); (parts[lang]=parts[lang]||[])[i]=x.rows||[]; } });
    const out={};
    Object.entries(meta.langs||{}).forEach(([lang,info])=>{
      const p=parts[lang]||[], rows=[]; for(let i=0;i<(info.chunks||p.length);i++) rows.push(...(p[i]||[]));
      out[lang]={t:info.t||meta.t||Date.now(),rows};
    });
    return out;
  }
};

/* ---------- signing in and out ---------- */
async function signIn(){
  const f=await ready; if(!f){ openDialog(); return; }
  const p=new f.U.GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'});
  try{ await f.U.signInWithPopup(f.auth,p); }
  catch(e){
    const c=e&&e.code;
    if(c==='auth/popup-blocked'||c==='auth/operation-not-supported-in-this-environment') await f.U.signInWithRedirect(f.auth,p);
    else if(c!=='auth/popup-closed-by-user'&&c!=='auth/cancelled-popup-request') toast('Sign-in didn’t work ('+(c||'unknown error')+').');
  }
}
async function signOut(){
  // the words live in the account: take the copy out of this browser too
  try{ localStorage.removeItem('fretwise.words.data'); }catch(e){}
  try{ const t=localStorage.getItem('fretwise.pushToken'); if(t) await removeToken(t); }catch(e){}
  await F.U.signOut(F.auth); location.reload();
}
async function afterSignIn(u){
  try{ await F.D.setDoc(F.D.doc(F.db,'users',u.uid),{seen:Date.now()},{merge:true}); }catch(e){}
  const app=window.fretwiseApp; if(app){ app.reconnect(); app.refreshWords().then(()=>app.wordsChanged()); }
  refreshToken();
}

/* ---------- daily reminders (Firebase Cloud Messaging) ---------- */
const pushRef=()=>F.D.doc(F.db,'users',me().uid,'state','push');
const tz=()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Madrid'; }catch(e){ return 'Europe/Madrid'; } };
let PUSH={hour:19,items:{guitar:true,ukulele:true,chess:true,words:true,paintings:false},tokens:{}};
async function loadPush(){ try{ const s=await F.D.getDoc(pushRef()); if(s.exists()) PUSH=Object.assign(PUSH,s.data()); }catch(e){} }
const pushSupported=()=>'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;
async function getToken(){
  const M=await import(SDK+'firebase-messaging.js');
  if(!(await M.isSupported())) throw new Error('unsupported');
  const reg=await navigator.serviceWorker.ready;
  return M.getToken(M.getMessaging(F.app),{vapidKey:CFG.vapidKey,serviceWorkerRegistration:reg});
}
async function saveToken(token){
  await F.D.setDoc(pushRef(),{hour:PUSH.hour,tz:tz(),items:PUSH.items,goal:10,tokens:{[token]:{t:Date.now(),ua:navigator.userAgent.slice(0,140)}}},{merge:true});
  try{ localStorage.setItem('fretwise.pushToken',token); }catch(e){}
}
async function removeToken(token){
  try{ await F.D.updateDoc(pushRef(),new F.D.FieldPath('tokens',token),F.D.deleteField()); }catch(e){}
  try{ localStorage.removeItem('fretwise.pushToken'); }catch(e){}
}
async function refreshToken(){
  // tokens change now and then; keep this device's one current
  try{
    const old=localStorage.getItem('fretwise.pushToken');
    if(!old||!pushSupported()||Notification.permission!=='granted'||!CFG.vapidKey) return;
    const t=await getToken(); if(t&&t!==old){ await removeToken(old); await saveToken(t); }
  }catch(e){}
}
async function enablePush(){
  if(!pushSupported()) return say('This browser can’t show notifications.');
  if(!CFG.vapidKey) return say('Reminders need the Web Push key (vapidKey) in firebase-config.js.');
  const perm=await Notification.requestPermission();
  if(perm!=='granted') return say('Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.');
  say('Turning reminders on…');
  try{ const t=await getToken(); await saveToken(t); say(`On. You’ll get a reminder at ${hh(PUSH.hour)} if you haven’t practised yet.`); }
  catch(e){ say('Couldn’t turn reminders on: '+((e&&e.message)||e)); }
  renderDialog();
}
async function disablePush(){ const t=localStorage.getItem('fretwise.pushToken'); if(t) await removeToken(t); say('Reminders are off on this device.'); renderDialog(); }
async function savePushSettings(){ try{ await F.D.setDoc(pushRef(),{hour:PUSH.hour,tz:tz(),items:PUSH.items,goal:10},{merge:true}); say('Saved.'); }catch(e){ say('Couldn’t save: '+(e.code||e.message)); } }
async function testNotification(){
  try{ const reg=await navigator.serviceWorker.ready; await reg.showNotification('Fretwise',{body:'Notifications work on this device.',icon:'icons/icon-192.png',badge:'icons/badge-96.png',tag:'fretwise-test'}); }
  catch(e){ say('This device couldn’t show a notification.'); }
}
const hh=h=>String(h).padStart(2,'0')+':00';

/* ---------- install as an app ---------- */
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installEvt=e; renderDialog(); });
if('serviceWorker' in navigator) window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });

/* ---------- UI: account button in the header and a dialog ---------- */
const css=`
.acct-btn{display:flex;align-items:center;gap:8px}
.acct-btn .av{width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-size:.75rem;font-weight:800;overflow:hidden}
.acct-btn .av img{width:100%;height:100%;object-fit:cover}
dialog.fw{border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink);padding:0;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px)}
dialog.fw::backdrop{background:rgba(10,14,18,.5)}
dialog.fw .in{padding:18px 18px 16px;display:flex;flex-direction:column;gap:14px}
dialog.fw h2{font-family:var(--font-display);font-weight:800;font-size:1.25rem;margin:0}
dialog.fw h3{font-family:var(--font-display);font-weight:800;font-size:1rem;margin:0 0 6px}
dialog.fw .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
dialog.fw .muted{color:var(--muted);font-size:.88rem}
dialog.fw code{font-family:var(--font-mono);font-size:.78rem;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:2px 6px;word-break:break-all}
dialog.fw label{display:flex;gap:8px;align-items:center}
dialog.fw select{border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:6px 8px}
dialog.fw section{border-top:1px solid var(--line);padding-top:12px}
.fw-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:50;max-width:calc(100vw - 32px)}`;
const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dlg=null, msg='';
function say(t){ msg=t; const el=dlg&&dlg.querySelector('[data-msg]'); if(el) el.textContent=t; }
function toast(t){ const d=document.createElement('div'); d.className='fw-toast'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),4200); }

function renderAcct(){
  const el=document.getElementById('acct'); if(!el) return;
  if(!CONFIGURED||!authKnown){ el.innerHTML=''; return; }
  const u=me();
  if(!u){ el.innerHTML='<button type="button" class="inst-btn" data-fw="signin">Sign in</button>'; return; }
  const name=(u.displayName||u.email||'Account').split(' ')[0];
  el.innerHTML=`<button type="button" class="inst-btn acct-btn" data-fw="open" aria-label="Account and reminders"><span class="av">${u.photoURL?`<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`:esc(name[0])}</span>${esc(name)}</button>`;
}
function openDialog(){
  if(!dlg){
    dlg=document.createElement('dialog'); dlg.className='fw'; document.body.appendChild(dlg);
    dlg.addEventListener('click',onDlgClick); dlg.addEventListener('change',onDlgChange);
    dlg.addEventListener('click',e=>{ if(e.target===dlg) dlg.close(); });
  }
  msg=''; renderDialog(); if(!dlg.open) dlg.showModal();
  if(me()) loadPush().then(renderDialog);
}
function renderDialog(){
  if(!dlg) return;
  const u=me(), on=!!localStorage.getItem('fretwise.pushToken')&&pushSupported()&&Notification.permission==='granted';
  let h='<div class="in">';
  if(!CONFIGURED){
    h+='<h2>Fretwise</h2><p class="muted">This copy isn’t connected to Firebase yet, so progress is saved in this browser only. Fill in firebase-config.js to add sign-in, sync and reminders.</p>';
  }else if(!u){
    h+='<h2>Sign in</h2><p class="muted">Sign in with Google to sync progress between devices and to load your dictionaries.</p><div class="row"><button type="button" class="btn primary" data-fw="signin">Sign in with Google</button></div>';
  }else{
    h+=`<h2>${esc(u.displayName||'Your account')}</h2><div class="muted">${esc(u.email||'')}<br>Progress syncs to this account on every device you sign in on.</div>`;
    h+=`<section><h3>Daily reminder</h3><div class="muted" style="margin-bottom:8px">One notification a day for anything you haven’t practised for 10 minutes yet, plus words due for review.</div>`;
    h+=`<label><input type="checkbox" data-fw="pushon" ${on?'checked':''}> Remind me on this device</label>`;
    h+=`<div class="row" style="margin-top:8px"><span class="muted">At</span><select data-fw="hour">${Array.from({length:18},(_,i)=>i+6).map(x=>`<option value="${x}" ${x===PUSH.hour?'selected':''}>${hh(x)}</option>`).join('')}</select><span class="muted">${esc(tz())}</span></div>`;
    h+=`<div class="row" style="margin-top:8px">${ITEMS.map(([k,l])=>`<label><input type="checkbox" data-fw="item" value="${k}" ${PUSH.items[k]?'checked':''}> ${l}</label>`).join('')}</div>`;
    h+=`<div class="row" style="margin-top:8px"><button type="button" class="btn quiet" data-fw="test">Send a test notification</button></div></section>`;
    if(installEvt) h+=`<section><h3>Install</h3><div class="row"><span class="muted">Add Fretwise to your home screen, with its own window and icon.</span><button type="button" class="btn" data-fw="install">Install</button></div></section>`;
    h+=`<section><h3>Account ID</h3><div class="muted" style="margin-bottom:6px">The word sync on GitHub needs this, as the OWNER_UID secret.</div><div class="row"><code>${esc(u.uid)}</code><button type="button" class="btn quiet" data-fw="copy">Copy</button></div></section>`;
    h+=`<div class="row"><button type="button" class="btn quiet" data-fw="signout">Sign out</button><span style="flex:1"></span><button type="button" class="btn primary" data-fw="close">Done</button></div>`;
  }
  if(!u) h+='<div class="row"><span style="flex:1"></span><button type="button" class="btn" data-fw="close">Close</button></div>';
  h+=`<div class="muted" data-msg aria-live="polite">${esc(msg)}</div></div>`;
  dlg.innerHTML=h;
}
function onDlgClick(e){
  const b=e.target.closest('[data-fw]'); if(!b||b.tagName==='INPUT'||b.tagName==='SELECT') return;
  const a=b.dataset.fw;
  if(a==='close') dlg.close();
  else if(a==='signin'){ dlg.close(); signIn(); }
  else if(a==='signout') signOut();
  else if(a==='test') testNotification();
  else if(a==='install'&&installEvt){ installEvt.prompt(); installEvt=null; renderDialog(); }
  else if(a==='copy'){ navigator.clipboard&&navigator.clipboard.writeText(me().uid).then(()=>say('Copied.'),()=>say('Select the ID and copy it by hand.')); }
}
function onDlgChange(e){
  const t=e.target, a=t.dataset.fw;
  if(a==='pushon') (t.checked?enablePush:disablePush)();
  else if(a==='hour'){ PUSH.hour=+t.value; savePushSettings(); }
  else if(a==='item'){ PUSH.items[t.value]=t.checked; savePushSettings(); }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#acct [data-fw]'); if(!b) return;
  if(b.dataset.fw==='signin') signIn(); else openDialog();
});
document.addEventListener('DOMContentLoaded',renderAcct);
})();
