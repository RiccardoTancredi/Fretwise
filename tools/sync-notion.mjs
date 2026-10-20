// Copies the Notion dictionaries into the owner's private Firestore space (users/<OWNER_UID>/dict).
// Runs on a schedule in GitHub Actions. Everything sensitive comes from repository secrets:
//   NOTION_TOKEN              internal integration token, with the four dictionaries shared to it
//   FIREBASE_SERVICE_ACCOUNT  service-account key JSON for the Firebase project
//   OWNER_UID                 your Fretwise account ID (shown in the app under your name → Account ID)
// The log only ever prints counts, never words: Actions logs of a public repository are public.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { NOTION_TOKEN, FIREBASE_SERVICE_ACCOUNT, OWNER_UID } = process.env;
if (!NOTION_TOKEN || !FIREBASE_SERVICE_ACCOUNT || !OWNER_UID) {
  console.log('Skipping: set the NOTION_TOKEN, FIREBASE_SERVICE_ACCOUNT and OWNER_UID secrets to sync your words.');
  process.exit(0);
}

// Notion data sources of the four dictionaries. These IDs grant nothing by themselves:
// only the integration token (a secret) can read them, and only if you shared the databases with it.
const LANGS = [
  { id: 'it', source: '1e4085a6-3e81-8073-bfc3-000b77098807', f: { w: 'Parola', d: 'Definizione', e: 'Esempio', s: 'Fonte', date: 'Data' } },
  { id: 'en', source: '1e4085a6-3e81-81de-84ea-000b2ee269ad', f: { w: 'Word', d: 'Definition', e: 'Example', s: 'Source', date: 'Date' } },
  { id: 'es', source: '3c0085a6-3e81-817a-adfc-000b0d30c7ca', f: { w: 'Palabra', d: 'Definición', e: 'Ejemplo', s: 'Fuente', date: 'Fecha' } },
  { id: 'ca', source: '3c0085a6-3e81-812b-87a6-000bca20fb65', f: { w: 'Paraula', d: 'Definició', e: 'Exemple', s: 'Font', date: 'Data' } },
];
const CHUNK = 300; // rows per Firestore document, well under the 1 MiB document limit

async function notion(path, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.notion.com/v1/' + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 429 && attempt < 5) { await new Promise(res => setTimeout(res, 1000 * (Number(r.headers.get('retry-after')) || 2))); continue; }
    if (!r.ok) { const e = new Error('Notion ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
}
// plain text with line breaks kept as <br>, the way the app shows them
const text = p => {
  if (!p) return '';
  const parts = p.type === 'title' ? p.title : p.type === 'rich_text' ? p.rich_text : null;
  if (parts) return parts.map(t => t.plain_text).join('').replace(/\r?\n/g, '<br>').trim();
  if (p.type === 'select') return p.select ? p.select.name : '';
  if (p.type === 'multi_select') return p.multi_select.map(o => o.name).join(', ');
  if (p.type === 'url') return p.url || '';
  return '';
};
const plain = s => s.replace(/<br>/g, ' ').replace(/\s+/g, ' ').trim();

async function readLang(L) {
  const rows = []; let cursor;
  do {
    const res = await notion(`data_sources/${L.source}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const page of res.results) {
      if (page.object !== 'page' || page.in_trash || page.archived) continue;
      const pr = page.properties || {};
      const row = {
        id: page.id.replace(/-/g, ''),
        w: plain(text(pr[L.f.w])),
        d: text(pr[L.f.d]),
        e: text(pr[L.f.e]),
        s: plain(text(pr[L.f.s])),
        date: (pr[L.f.date] && pr[L.f.date].date && pr[L.f.date].date.start) || '',
      };
      if (row.w) rows.push(row);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return rows;
}

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const dict = db.collection('users').doc(OWNER_UID).collection('dict');
const metaRef = dict.doc('_meta');
const old = (await metaRef.get()).data() || { langs: {} };
const meta = { t: Date.now(), langs: { ...(old.langs || {}) } };
let failed = 0;

for (const L of LANGS) {
  try {
    const rows = await readLang(L);
    const chunks = Math.ceil(rows.length / CHUNK);
    const batch = db.batch();
    for (let i = 0; i < chunks; i++) batch.set(dict.doc(`${L.id}-${i}`), { rows: rows.slice(i * CHUNK, (i + 1) * CHUNK) });
    // remove chunks left over from a bigger dictionary
    for (let i = chunks; i < ((old.langs || {})[L.id]?.chunks || 0); i++) batch.delete(dict.doc(`${L.id}-${i}`));
    await batch.commit();
    meta.langs[L.id] = { chunks, count: rows.length, t: Date.now() };
    console.log(`${L.id}: ${rows.length} words`);
  } catch (e) {
    failed++;
    // keep the last good copy of this dictionary
    const why = e.status === 404 || e.status === 403 ? 'not shared with the Notion integration (open the database → ••• → Connections → add it)' : e.message;
    console.log(`${L.id}: skipped, ${why}`);
  }
}
await metaRef.set(meta);
console.log(failed ? `Done with ${failed} dictionaries skipped.` : 'Done.');
if (failed === LANGS.length) process.exit(1);
