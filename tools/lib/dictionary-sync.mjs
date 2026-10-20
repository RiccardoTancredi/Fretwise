// Account IDs stay in Actions secrets; public logs contain only counts and language codes.
export function recipients(owner, shared = '') {
  const extra = shared.trim().startsWith('[') ? JSON.parse(shared) : shared.split(/[\s,]+/).filter(Boolean);
  if (!Array.isArray(extra)) throw new Error('Invalid recipient list');
  const ids = [...new Set([owner, ...extra])];
  if (ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('Invalid account ID');
  return ids;
}

export async function syncDictionaries({ db, ids, languages, readLang, log = console.log, now = Date.now }) {
  const targets = [];
  for (const uid of ids) {
    const dict = db.collection('users').doc(uid).collection('dict');
    const metaRef = dict.doc('_meta');
    const old = (await metaRef.get()).data() || {};
    targets.push({ dict, metaRef, langs: { ...(old.langs || {}) } });
  }
  let failed = 0;
  for (const lang of languages) {
    let rows;
    try { rows = await readLang(lang); }
    catch (e) {
      failed++;
      log(`${lang.id}: skipped, ${e.status === 403 || e.status === 404 ? 'not shared with the Notion integration' : 'Notion request failed'}`);
      continue;
    }
    const chunks = Math.ceil(rows.length / 300);
    let copied = 0;
    for (const target of targets) {
      try {
        const batch = db.batch();
        for (let i = 0; i < chunks; i++) batch.set(target.dict.doc(`${lang.id}-${i}`), { rows: rows.slice(i * 300, (i + 1) * 300) });
        for (let i = chunks; i < (target.langs[lang.id]?.chunks || 0); i++) batch.delete(target.dict.doc(`${lang.id}-${i}`));
        const langs = { ...target.langs, [lang.id]: { chunks, count: rows.length, t: now() } };
        // Publish metadata with its chunks so readers never see a half-published language.
        batch.set(target.metaRef, { t: now(), langs });
        await batch.commit();
        target.langs = langs;
        copied++;
      } catch {
        failed++;
      }
    }
    log(`${lang.id}: ${rows.length} words, ${copied}/${ids.length} accounts synced`);
  }
  log(failed ? `Finished with ${failed} sync errors; last good copies retained.` : `Done. ${ids.length} accounts synced.`);
  return failed;
}
