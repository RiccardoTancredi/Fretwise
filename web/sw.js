/* Fretwise service worker: keeps the app usable offline and shows the daily reminder. */
const VERSION='__BUILD__';
const CACHE='fretwise-'+VERSION, RUNTIME='fretwise-runtime', PICS='fretwise-pics', FAV='fretwise-fav';
const SHELL=['./','index.html','platform.js','account-storage.js','firebase-config.js','manifest.webmanifest','puzzles.json','paintings.json','icons/icon-192.png','icons/badge-96.png'];
const CDN=/^https:\/\/(cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|www\.gstatic\.com\/firebasejs\/)/;
// paintings' pictures (the card and gallery sizes, not the full-screen one): the last ones seen are kept
const PIC=/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/.*[?&]width=(900|320)\b/, KEEP_PICS=250;

importScripts('firebase-config.js');
const CFG=self.FIREBASE_CONFIG||{};
if(CFG.apiKey&&!/^REPLACE/.test(CFG.apiKey)&&CFG.messagingSenderId){
  try{
    importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js','https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
    firebase.initializeApp(CFG);
    // reminders arrive as data messages, so this worker decides how they look
    firebase.messaging().onBackgroundMessage(m=>{
      const d=m.data||{};
      return self.registration.showNotification(d.title||'Fretwise',{body:d.body||'',icon:'icons/icon-192.png',badge:'icons/badge-96.png',tag:'fretwise-daily',renotify:true,data:{url:d.url||'./'}});
    });
  }catch(e){}
}

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('fretwise-')&&![CACHE,RUNTIME,PICS,FAV].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// once the network has kept a file waiting 3 s, the next minute's files come straight from the saved copy
// (each one still asks the network in the background), so a weak signal costs one wait, not one per file
let slowUntil=0;
async function trim(c,n=60){ const ks=await c.keys(); for(let i=0;i<ks.length-n;i++) await c.delete(ks[i]); }
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // app files: network first so updates show up straight away; the saved copy when offline, or when the
    // network hasn't answered within 3 seconds (a weak signal), while the fresh copy still lands for next time
    const saved=()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):null));
    const net=fetch(req).then(r=>{ if(r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); } return r; });
    e.waitUntil(net.catch(()=>{}));
    e.respondWith(new Promise(resolve=>{
      let done=false; const give=r=>{ if(!done&&r){ done=true; resolve(r); } };
      if(Date.now()<slowUntil) saved().then(give);
      const t=setTimeout(()=>{ slowUntil=Date.now()+60000; saved().then(give); },3000);
      net.then(r=>{ clearTimeout(t); if(!done) slowUntil=0; give(r); }).catch(()=>{ clearTimeout(t); saved().then(r=>{ give(r||Response.error()); }); });
    }));
    return;
  }
  if(PIC.test(req.url)){
    // a favourite's picture, or one seen lately, straight from the device; otherwise fetch it and keep it
    e.respondWith((async()=>{ const hit=await caches.match(req.url,{cacheName:FAV})||await caches.match(req.url,{cacheName:PICS}); if(hit) return hit;
      const r=await fetch(req); if(r.ok||r.type==='opaque'){ const c=await caches.open(PICS); c.put(req.url,r.clone()).then(()=>trim(c,KEEP_PICS)).catch(()=>{}); } return r; })());
    return;
  }
  if(CDN.test(req.url)){
    // pinned library versions and fonts never change: the saved copy first
    e.respondWith(caches.open(RUNTIME).then(async c=>{ const hit=await c.match(req); if(hit) return hit; const r=await fetch(req); if(r.ok||r.type==='opaque'){ c.put(req,r.clone()); trim(c); } return r; }));
  }
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if(w.url.startsWith(self.registration.scope)&&'focus' in w) return w.focus(); }
    return clients.openWindow(url);
  }));
});
