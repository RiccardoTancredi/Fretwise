// Builds data/paintings.json for the Fretwise paintings quiz from Wikidata (CC0 metadata).
// Pictures are public-domain files on Wikimedia Commons; the app loads them from there.
// Run: node tools/build-paintings.mjs   (Node 18+, needs internet; a monthly GitHub Action runs it)
//
// Copyright: in the EU a painting stays protected until 70 years after the painter's death, so only
// painters who died before (this year - 70) are included. The cut-off moves forward every January.
// To keep this from being only the Mona Lisa, each painter is capped and the cut-off for "how known"
// a work must be is low: plenty of lesser-known works by the great painters get in.
import { writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://query.wikidata.org/sparql?format=json&query=';
const UA = { Accept: 'application/sparql-results+json', 'User-Agent': 'Fretwise/1.0 (https://github.com/RiccardoTancredi/Fretwise)' };
const MAX = 900, PER_ARTIST = 12, TOP = 6, FAME_MIN = 6, PAINTER_MIN = 40;
const DIED_BEFORE = new Date().getUTCFullYear() - 70;   // 2026: died in 1955 or earlier
const EXCLUDE = new Set(['Q334138', 'Q326503']);        // explicit works, left out of a learning app

async function sparql(q, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(ENDPOINT + encodeURIComponent(q), { headers: UA });
      if (!r.ok) throw new Error('Wikidata ' + r.status);
      return JSON.parse(await r.text()).results.bindings; // a timed-out query comes back as broken JSON
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise(res => setTimeout(res, 5000 * i));
    }
  }
}
const qid = uri => uri.split('/').pop();
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

// 1) well-known painters whose works are out of copyright
const painters = (await sparql(`SELECT ?a WHERE { ?a wdt:P106 wd:Q1028181; wikibase:sitelinks ?n. FILTER(?n >= ${PAINTER_MIN})
  ?a wdt:P570 ?d. FILTER(YEAR(?d) < ${DIED_BEFORE}) }`)).map(b => qid(b.a.value));

// 2) their paintings that have a picture, with how many Wikipedias cover each (small batches stay fast)
const works = new Map();
for (const group of chunks(painters, 80)) {
  const rows = await sparql(`SELECT ?p ?a ?img ?links WHERE { VALUES ?a { ${group.map(a => 'wd:' + a).join(' ')} }
    ?p wdt:P170 ?a; wdt:P31 wd:Q3305213; wdt:P18 ?img; wikibase:sitelinks ?links. FILTER(?links >= ${FAME_MIN}) }`);
  for (const b of rows) {
    const id = qid(b.p.value);
    if (!works.has(id) && !EXCLUDE.has(id)) works.set(id, { id, a: qid(b.a.value), image: decodeURIComponent(qid(b.img.value)), links: +b.links.value });
  }
}

// 3) per painter: their best-known works, plus some much less covered ones (the "deep cuts")
const byPainter = new Map();
for (const o of works.values()) { if (!byPainter.has(o.a)) byPainter.set(o.a, []); byPainter.get(o.a).push(o); }
const picked = [];
for (const list of [...byPainter.values()].map(l => l.sort((x, y) => y.links - x.links)).sort((x, y) => y[0].links - x[0].links)) {
  const top = list.slice(0, TOP), rest = list.slice(TOP), step = Math.max(1, rest.length / (PER_ARTIST - TOP));
  const spread = []; for (let i = rest.length - 1; i >= 0 && spread.length < PER_ARTIST - TOP; i -= step) spread.push(rest[Math.floor(i)]);
  picked.push(...top, ...spread);
  if (picked.length >= MAX) break;
}

// 4) details for the chosen ones: English names, year, movement, museum, English Wikipedia article
const info = new Map();
for (const group of chunks(picked, 140)) {
  const rows = await sparql(`SELECT ?p ?pl ?al ?year ?ml ?cl ?t WHERE { VALUES (?p ?a) { ${group.map(o => `(wd:${o.id} wd:${o.a})`).join(' ')} }
    OPTIONAL { ?p rdfs:label ?pl. FILTER(LANG(?pl) = "en") }
    OPTIONAL { ?a rdfs:label ?al. FILTER(LANG(?al) = "en") }
    OPTIONAL { ?p wdt:P571 ?inc. BIND(YEAR(?inc) AS ?year) }
    OPTIONAL { ?p wdt:P135 ?m. ?m rdfs:label ?ml. FILTER(LANG(?ml) = "en") }
    OPTIONAL { ?p wdt:P195 ?c. ?c rdfs:label ?cl. FILTER(LANG(?cl) = "en") }
    OPTIONAL { ?art schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. } }`);
  for (const b of rows) {
    const id = qid(b.p.value), x = info.get(id) || {};
    x.pl ??= b.pl?.value; x.al ??= b.al?.value; x.t ??= b.t?.value; x.ml ??= b.ml?.value;
    if (b.cl && !x.cl) x.cl = b.cl.value.replace(/^Department of Paintings of the /, '');
    if (b.year && (x.year == null || +b.year.value < x.year)) x.year = +b.year.value;
    info.set(id, x);
  }
}

// 5) a painter's own movement, for works that have none of their own (often the less-covered ones);
//    only when Wikidata gives the painter exactly one, so the answer isn't a guess between several
const painterMv = new Map();
for (const group of chunks([...new Set(picked.map(o => o.a))], 150)) {
  const rows = await sparql(`SELECT ?a ?ml WHERE { VALUES ?a { ${group.map(a => 'wd:' + a).join(' ')} }
    ?a wdt:P135 ?m. ?m rdfs:label ?ml. FILTER(LANG(?ml) = "en") }`);
  for (const b of rows) { const a = qid(b.a.value); if (!painterMv.has(a)) painterMv.set(a, new Set()); painterMv.get(a).add(b.ml.value); }
}
const onlyMv = a => { const m = painterMv.get(a); return m && m.size === 1 ? [...m][0] : ''; };

const paintings = [];
for (const o of picked) {
  const x = info.get(o.id) || {};
  const title = (x.t || x.pl || '').replace(/\s*\([^)]*\)$/, '');   // drop Wikipedia's "(Manet)", "(painting)"
  if (!title || !x.al) continue;                       // nothing to ask about without both names
  const movement = x.ml || onlyMv(o.a);
  paintings.push({
    id: o.id, title, artist: x.al, year: x.year ?? null, movement, ...(movement && !x.ml ? { movementOf: 'painter' } : {}), museum: x.cl || '', image: o.image,
    wiki: x.t ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.t.replace(/ /g, '_')) : null,
    // Commons serves a resized copy of any file through Special:FilePath
    thumb: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(o.image) + '?width=900',
    fame: o.links >= 30 ? 'famous' : o.links >= 14 ? 'known' : 'deep cut',
  });
}

const out = { built: new Date().toISOString(), source: 'Wikidata (CC0); images from Wikimedia Commons (public domain)', diedBefore: DIED_BEFORE, paintings };
if (typeof process !== 'undefined' && process.versions?.node) {
  await writeFile(new URL('../data/paintings.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log(`data/paintings.json: ${paintings.length} paintings by ${new Set(paintings.map(p => p.artist)).size} painters`);
}
