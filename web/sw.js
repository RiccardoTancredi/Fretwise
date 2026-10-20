/* Fretwise service worker: keeps the app usable offline and shows the daily reminder. */
const VERSION='__BUILD__';
const CACHE='fretwise-'+VERSION, RUNTIME='fretwise-runtime';
const SHELL=['./','index.html','platform.js','firebase-config.js','manifest.webmanifest','puzzles.json','paintings.json','icons/icon-192.png','icons/badge-96.png'];
const CDN=/^https:\/\/(cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|www\.gstatic\.com\/firebasejs\/)/;

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
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('fretwise-')&&k!==CACHE&&k!==RUNTIME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
async function trim(c){ const ks=await c.keys(); for(let i=0;i<ks.length-60;i++) await c.delete(ks[i]); }
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // app files: network first so updates show up straight away, the saved copy when offline
    e.respondWith(fetch(req).then(r=>{ if(r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); } return r; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):Response.error()))));
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
