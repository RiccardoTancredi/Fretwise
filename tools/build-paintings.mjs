// Builds data/paintings.json for the Fretwise paintings quiz from Wikidata (CC0 metadata).
// Pictures are public-domain files on Wikimedia Commons; the app loads them from there.
// Run: node tools/build-paintings.mjs   (Node 18+, needs internet; a monthly GitHub Action runs it)
//
// Copyright: in the EU a painting stays protected until 70 years after the painter's death, so only
// painters who died before (this year - 70) are included. The cut-off moves forward every January.
// To keep this from being only the Mona Lisa, each painter is capped and the cut-off for "how known"
// a work must be is low: plenty of lesser-known works by the great painters get in.
import { readFile, writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://query.wikidata.org/sparql?format=json&query=';
const UA = { Accept: 'application/sparql-results+json', 'User-Agent': 'paintings-list/1.0 (personal study script)' };
// what counts as a painting: canvases and panels, and the frescoes and wall paintings (the School of Athens,
// the Sistine Chapel, the Last Supper are frescoes on Wikidata, not paintings)
const KINDS = 'VALUES ?kind { wd:Q3305213 wd:Q22669139 wd:Q134194 wd:Q99516640 wd:Q219423 }';
const MAX = 900, PER_ARTIST = 12, TOP = 6, FAME_MIN = 6, PAINTER_MIN = 40;
const DIED_BEFORE = new Date().getUTCFullYear() - 70;   // 2026: died in 1955 or earlier
const EXCLUDE = new Set(['Q334138', 'Q326503',         // explicit works, left out of a learning app
  'Q4945054',                                            // the Sleeping Hermaphroditus: antique; Bernini only made the mattress
  'Q463400', 'Q2266081',                                 // Piazza Navona and Palazzo Corsini: not designed by Bernini
  'Q5033460',                                            // the Corcoran's lions: 19th-century copies of Canova's
  'Q521680',                                             // "Perla di Modena": its picture is a portrait, not the work
  'Q1774735',                                            // Michelangelo's Saint Paul: its picture is his Saint Peter
  'Q2626926']);                                          // Michelangelo's Hercules: lost; the picture is Rubens's copy
// pictures Wikidata has wrong (checked by eye): the right file on Commons
const IMAGE_FIX = {
  Q1766454: 'Gustave Caillebotte - The Floor Planers - Google Art Project.jpg',   // was a photo of a farm in Surrey
  Q3955632: 'Michelangelo, Separation of the Earth from the Waters 00.jpg',       // was the whole ceiling, with the Creation of Adam
};
// a file name says what it shows more often than not: does it name the work or its artist?
const plain = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nameWords = t => plain(t).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !/^(with|from|the|and|della|dello|des|les|der|die|das|van|von|portrait|painting)$/.test(w));
const namesWork = (file, title, artist) => { const f = plain(file); return [...nameWords(title), ...nameWords(artist)].some(w => f.includes(w)); };
const looksLikePhoto = file => /geograph\.org\.uk|^(img|dsc|dscn|pict|p\d{6,})[_ -]?\d/i.test(plain(file));

// too many queries in a row get a 429: wait as long as Wikidata asks (or longer each time), then try again
async function sparql(q, tries = 6) {
  for (let i = 1; ; i++) {
    let wait = 5000 * i;
    try {
      const r = await fetch(ENDPOINT + encodeURIComponent(q), { headers: UA });
      if (r.status === 429) wait = Math.max(wait, 1000 * (+r.headers.get('retry-after') || 30));
      if (!r.ok) throw new Error('Wikidata ' + r.status);
      return JSON.parse(await r.text()).results.bindings; // a timed-out query comes back as broken JSON
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise(res => setTimeout(res, wait));
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
  const rows = await sparql(`SELECT DISTINCT ?p ?a ?img ?links WHERE { VALUES ?a { ${group.map(a => 'wd:' + a).join(' ')} } ${KINDS}
    ?p wdt:P170 ?a; wdt:P31 ?kind; wdt:P18 ?img; wikibase:sitelinks ?links. FILTER(?links >= ${FAME_MIN}) }`);
  for (const b of rows) {
    const id = qid(b.p.value);
    if (!works.has(id) && !EXCLUDE.has(id)) works.set(id, { id, a: qid(b.a.value), image: decodeURIComponent(qid(b.img.value)), links: +b.links.value });
  }
}

// 2b) the periods this collection cares about most, painted the world over: the Renaissance first, then
//     Romanticism, then Impressionism. Their painters (by movement on Wikidata, plus the great ones Wikidata
//     gives no movement, such as Dürer, Masaccio, Mantegna, Friedrich) get every work that a few Wikipedias
//     cover, up to a cap per painter, outside the cap of everyone else
const PERIODS = [
  { id: 'ren', cap: 100, movements: ['Q4692', 'Q1474884', 'Q1472236', 'Q610877', 'Q610687', 'Q131808', 'Q443153', 'Q2455000'],
    painters: ['Q5580', 'Q5681', 'Q240737', 'Q8457', 'Q248615', 'Q8453', 'Q191423', 'Q368546', 'Q296265', 'Q5664', 'Q290407', 'Q8459', 'Q7814', 'Q17169', 'Q48319', 'Q130531', 'Q215251', 'Q346502', 'Q9319', 'Q102272', 'Q762', 'Q310973', 'Q7031', 'Q5811', 'Q5592', 'Q9440', 'Q5822', 'Q43270', 'Q5827', 'Q314275', 'Q5597', 'Q312617', 'Q5669', 'Q285423', 'Q47551', 'Q5581'] },
  { id: 'rom', cap: 60, movements: ['Q37068'], painters: ['Q433434', 'Q216999', 'Q104884', 'Q33477', 'Q223725', 'Q5432', 'Q159758', 'Q159297', 'Q937096', 'Q166585', 'Q334001', 'Q184212'] },
  { id: 'imp', cap: 60, movements: ['Q40415'], painters: ['Q175130', 'Q436844', 'Q105320', 'Q134741', 'Q737635', 'Q296', 'Q46373', 'Q1355820', 'Q607495', 'Q295144', 'Q173223', 'Q39931', 'Q40599'] },
];
const PERIOD_MIN = 5;
const periodOf = new Map();
for (const per of PERIODS) {
  const rows = await sparql(`SELECT DISTINCT ?a WHERE { VALUES ?m { ${per.movements.map(m => 'wd:' + m).join(' ')} }
    ?a wdt:P106 wd:Q1028181; wdt:P135 ?m; wikibase:sitelinks ?n. FILTER(?n >= 30) ?a wdt:P570 ?d. FILTER(YEAR(?d) < ${DIED_BEFORE}) }`);
  for (const a of [...rows.map(b => qid(b.a.value)), ...per.painters]) if (!periodOf.has(a)) periodOf.set(a, per);
}
// the named ones are checked too: out of copyright only
const periodPainters = [];
for (const group of chunks([...periodOf.keys()], 150)) {
  const rows = await sparql(`SELECT ?a WHERE { VALUES ?a { ${group.map(a => 'wd:' + a).join(' ')} } ?a wdt:P570 ?d. FILTER(YEAR(?d) < ${DIED_BEFORE}) }`);
  periodPainters.push(...rows.map(b => qid(b.a.value)));
}
const picked = [], inSet = new Set();
const periodWorks = new Map();
for (const group of chunks([...new Set(periodPainters)], 60)) {
  const rows = await sparql(`SELECT DISTINCT ?p ?a ?img ?links WHERE { VALUES ?a { ${group.map(a => 'wd:' + a).join(' ')} } ${KINDS}
    ?p wdt:P170 ?a; wdt:P31 ?kind; wdt:P18 ?img; wikibase:sitelinks ?links. FILTER(?links >= ${PERIOD_MIN}) }`);
  for (const b of rows) {
    const id = qid(b.p.value), a = qid(b.a.value);
    if (EXCLUDE.has(id)) continue;
    if (!periodWorks.has(a)) periodWorks.set(a, new Map());
    if (!periodWorks.get(a).has(id)) periodWorks.get(a).set(id, { id, a, image: decodeURIComponent(qid(b.img.value)), links: +b.links.value });
  }
}
for (const [a, m] of periodWorks) {
  for (const o of [...m.values()].sort((x, y) => y.links - x.links).slice(0, periodOf.get(a).cap)) {
    if (inSet.has(o.id)) continue; picked.push(o); inSet.add(o.id);
  }
}
console.log(`periods: ${picked.length} works by ${periodWorks.size} painters`);

// 2c) beyond paintings, for a few artists: Michelangelo's sculptures and drawings, Leonardo's drawings and
//     sculptures, and Alphonse Mucha's posters and lithographs with his paintings (none of which a few
//     Wikipedias cover, so no fame floor for him). kind: what the app calls the work; none for a painting
// (the classes listed one by one: walking Wikidata's whole tree under "drawing" times out)
const SCULPTURE = ['Q860861', 'Q179700', 'Q837249', 'Q2793709', 'Q29168168', 'Q14562306', 'Q241045', 'Q848330'];
const DRAWING = ['Q93184', 'Q2647254', 'Q217106', 'Q1416517', 'Q5078274'];
const PRINT = ['Q429785', 'Q15123870', 'Q11060274'];
const LOST = 'wd:Q26883973 wd:Q4140840 wd:Q104438958';
const EXTRA = [
  { a: 'Q5592', kind: 'sculpture', classes: SCULPTURE, min: 3, cap: 60 },
  { a: 'Q5592', kind: 'drawing', classes: DRAWING, min: 0, cap: 35 },
  { a: 'Q762', kind: 'drawing', classes: DRAWING, min: 2, cap: 40 },
  { a: 'Q762', kind: 'sculpture', classes: SCULPTURE, min: 0, cap: 5 },
  { a: 'Q146691', kind: null, min: 0, cap: 50 },
  { a: 'Q146691', kind: 'print', classes: PRINT, min: 0, cap: 30 },
  // Bernini's sculptures, fountains and tombs, and the buildings he and Borromini designed (architect: P84)
  { a: 'Q160538', kind: 'sculpture', classes: [...SCULPTURE, 'Q483453', 'Q381885', 'Q56055312'], min: 3, cap: 50, born: 1598, antique: true },
  // Canova's sculptures (Venus Victrix at the Borghese, Cupid and Psyche, the Three Graces…), tombs and groups
  { a: 'Q5547', kind: 'sculpture', any: true, min: 2, cap: 40, born: 1757, antique: true },
  { a: 'Q160538', kind: 'building', prop: 'P84', any: true, min: 3, cap: 15, born: 1598 },
  { a: 'Q123150', kind: 'building', prop: 'P84', any: true, min: 3, cap: 20, born: 1599 },
];
// dates Wikidata has wrong, so the rules above would misread them: Cupid and Psyche is dated 174 there
const YEAR_FIX = { Q517408: 1793 };
for (const e of EXTRA) {
  const what = e.any ? '' : e.classes ? `VALUES ?t { ${e.classes.map(c => 'wd:' + c).join(' ')} } ?p wdt:P31 ?t.` : `${KINDS} ?p wdt:P31 ?kind.`;
  // antique: a sculpture dated before the artist was born is an antique they restored, not their work
  const rows = await sparql(`SELECT DISTINCT ?p ?img ?links WHERE { ${what} ?p wdt:${e.prop || 'P170'} wd:${e.a}; wdt:P18 ?img; wikibase:sitelinks ?links.
    FILTER(?links >= ${e.min}) ${e.kind ? 'FILTER NOT EXISTS { ?p wdt:P31 wd:Q3305213 }' : ''}
    ${e.antique ? `FILTER NOT EXISTS { ?p wdt:P571 ?inc. FILTER(YEAR(?inc) < ${e.born}) FILTER(?p NOT IN (${Object.keys(YEAR_FIX).map(q => 'wd:' + q).join(', ')})) }` : ''}
    FILTER NOT EXISTS { VALUES ?lost { ${LOST} } ?p wdt:P31 ?lost } }`);
  const seen = new Set(); let n = 0;
  for (const b of rows.sort((x, y) => +y.links.value - +x.links.value)) {
    const id = qid(b.p.value); if (seen.has(id)) continue; seen.add(id);
    if (EXCLUDE.has(id) || inSet.has(id)) continue;
    picked.push({ id, a: e.a, image: decodeURIComponent(qid(b.img.value)), links: +b.links.value, ...(e.kind ? { kind: e.kind } : {}), ...(e.born ? { born: e.born } : {}) }); inSet.add(id);
    if (++n >= e.cap) break;
  }
  console.log(`${e.a} ${e.kind || 'painting'}: +${n}`);
}

// 3) per painter: their best-known works, plus some much less covered ones (the "deep cuts")
const byPainter = new Map();
for (const o of works.values()) { if (!byPainter.has(o.a)) byPainter.set(o.a, []); byPainter.get(o.a).push(o); }
let general = 0;
for (const list of [...byPainter.values()].filter(l => !periodWorks.has(l[0].a)).map(l => l.sort((x, y) => y.links - x.links)).sort((x, y) => y[0].links - x[0].links)) {
  const top = list.slice(0, TOP), rest = list.slice(TOP), step = Math.max(1, rest.length / (PER_ARTIST - TOP));
  const spread = []; for (let i = rest.length - 1; i >= 0 && spread.length < PER_ARTIST - TOP; i -= step) spread.push(rest[Math.floor(i)]);
  for (const o of [...top, ...spread]) if (!inSet.has(o.id)) { picked.push(o); inSet.add(o.id); general++; }
  if (general >= MAX) break;
}

// 3b) the great museums: their best-known works too, so the collection doesn't rest on the painters' fame
//     alone (it left the Vatican with 4 works, the Borghese with 2 and Palazzo Pitti with none)
const MUSEUMS = ['Uffizi Gallery', 'Vatican Museums', 'Pinacoteca Vaticana', 'Galleria Borghese', 'Palatine Gallery', 'Pinacoteca di Brera',
  "Gallerie dell'Accademia", 'Museo di Capodimonte', "Galleria Nazionale d'Arte Antica", 'Pinacoteca Ambrosiana', 'Accademia Carrara',
  'Galleria Doria Pamphilj', 'Capitoline Museums', 'Galleria Sabauda', 'Galleria Nazionale delle Marche', 'Louvre', "Musée d'Orsay",
  'Museo del Prado', 'Thyssen-Bornemisza Museum', 'National Gallery', 'Rijksmuseum', 'Mauritshuis', 'Kunsthistorisches Museum',
  'Alte Pinakothek', 'Gemäldegalerie Alte Meister', 'Hermitage Museum', 'Royal Museums of Fine Arts of Belgium', 'Musée Condé', 'Louvre Museum', 'Galleria Palatina', 'Palazzo Pitti',
  "Musée de l'Orangerie", 'Musée Marmottan Monet', 'Metropolitan Museum of Art', 'Art Institute of Chicago', 'National Gallery of Art', 'Courtauld Gallery',
  'Museum of Fine Arts, Boston', 'Tate Britain', 'Alte Nationalgalerie', 'Hamburger Kunsthalle', 'Städel Museum', 'Gemäldegalerie, Berlin'];
const PER_MUSEUM = 15, PER_MUSEUM_OF = { 'Vatican Museums': 40, "Musée d'Orsay": 60, 'Pinacoteca di Brera': 50, 'National Gallery': 60 };   // the Vatican: the Raphael Rooms and the Sistine Chapel too
// museums whose great works have no Wikipedia pages of their own (Monet's Water Lilies panels at the Orangerie):
// every painting there by a painter already in the collection, however little covered
const ANY_FAME = { "Musée de l'Orangerie": 0, 'Musée Marmottan Monet': 0 };
const museums = await sparql(`SELECT DISTINCT ?m ?ml WHERE { VALUES ?ml { ${MUSEUMS.map(m => JSON.stringify(m) + '@en').join(' ')} } ?m rdfs:label ?ml; wdt:P17 []. }`);
for (const b of museums) {
  const m = qid(b.m.value);
  const rows = await sparql(`SELECT DISTINCT ?p ?a ?img ?links WHERE { ${KINDS} ?p wdt:P195 wd:${m}; wdt:P31 ?kind; wdt:P170 ?a; wdt:P18 ?img; wikibase:sitelinks ?links.
    FILTER(?links >= ${ANY_FAME[b.ml.value] ?? FAME_MIN}) ?a wdt:P570 ?d. FILTER(YEAR(?d) < ${DIED_BEFORE}) } ORDER BY DESC(?links) LIMIT 100`);
  let added = 0;
  for (const r of rows) {
    const id = qid(r.p.value);
    if (inSet.has(id) || EXCLUDE.has(id)) continue;
    picked.push({ id, a: qid(r.a.value), image: decodeURIComponent(qid(r.img.value)), links: +r.links.value }); inSet.add(id);
    if (++added >= (PER_MUSEUM_OF[b.ml.value] || (b.ml.value in ANY_FAME ? 30 : PER_MUSEUM))) break;
  }
  console.log(`${b.ml.value}: +${added}`);
}

// 3c) works already in the collection stay (while still out of copyright, with a picture), so a rebuild
//     never takes away a painting someone has been learning
let previous = []; const previousKind = new Map(), previousImage = new Map();
try { previous = JSON.parse(await readFile(new URL('../data/paintings.json', import.meta.url), 'utf8')).paintings.map(x => { if (x.kind) previousKind.set(x.id, x.kind); previousImage.set(x.id, x.image); return x.id; }); } catch (e) {}
for (const group of chunks(previous.filter(id => !inSet.has(id) && !EXCLUDE.has(id)), 150)) {
  const rows = await sparql(`SELECT ?p ?a ?img ?links WHERE { VALUES ?p { ${group.map(id => 'wd:' + id).join(' ')} }
    ?p wdt:P170 ?a; wdt:P18 ?img; wikibase:sitelinks ?links. ?a wdt:P570 ?d. FILTER(YEAR(?d) < ${DIED_BEFORE}) }`);
  for (const r of rows) {
    const id = qid(r.p.value); if (inSet.has(id)) continue;
    picked.push({ id, a: qid(r.a.value), image: decodeURIComponent(qid(r.img.value)), links: +r.links.value, ...(previousKind.has(id) ? { kind: previousKind.get(id) } : {}) }); inSet.add(id);
  }
}

// 4) details for the chosen ones: English names, year, movement, museum, English Wikipedia article
const info = new Map();
for (const group of chunks(picked, 140)) {
  // a name may be kept only as the "mul" label (the same in every language), as Albrecht Dürer's is
  const rows = await sparql(`SELECT ?p ?pl ?al ?plm ?alm ?year ?ml ?cl ?t WHERE { VALUES (?p ?a) { ${group.map(o => `(wd:${o.id} wd:${o.a})`).join(' ')} }
    OPTIONAL { ?p rdfs:label ?pl. FILTER(LANG(?pl) = "en") }
    OPTIONAL { ?a rdfs:label ?al. FILTER(LANG(?al) = "en") }
    OPTIONAL { ?p rdfs:label ?plm. FILTER(LANG(?plm) = "mul") }
    OPTIONAL { ?a rdfs:label ?alm. FILTER(LANG(?alm) = "mul") }
    OPTIONAL { ?p wdt:P571 ?inc. BIND(YEAR(?inc) AS ?year) }
    OPTIONAL { ?p wdt:P135 ?m. ?m rdfs:label ?ml. FILTER(LANG(?ml) = "en") }
    OPTIONAL { ?p wdt:P195 ?c. ?c rdfs:label ?cl. FILTER(LANG(?cl) = "en") }
    OPTIONAL { ?art schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. } }`);
  for (const b of rows) {
    const id = qid(b.p.value), x = info.get(id) || {};
    x.pl ??= b.pl?.value; x.al ??= b.al?.value; x.t ??= b.t?.value; x.ml ??= b.ml?.value;
    x.plm ??= b.plm?.value; x.alm ??= b.alm?.value;
    if (b.cl && !x.cl) x.cl = b.cl.value.replace(/^Department of (?:Paintings|Sculptures) of the /, '');
    if (b.year && (x.year == null || +b.year.value < x.year)) x.year = +b.year.value;
    info.set(id, x);
  }
}

// 4b) where each work hangs now: Wikidata keeps former owners as collections with an end date, so the
//     museum is a collection without one (the one already named when it qualifies), and the country is that
//     museum's present-day country. None of either rather than a former collection or a guess.
const COUNTRY_NAME = { 'Kingdom of the Netherlands': 'Netherlands', "People's Republic of China": 'China', 'Kingdom of Denmark': 'Denmark' };
async function museumPlaces(list, museumOf) {
  const out = new Map();
  for (const group of chunks(list, 150)) {
    const rows = await sparql(`SELECT ?p ?cl ?ended ?col WHERE { VALUES ?p { ${group.map(o => 'wd:' + o.id).join(' ')} }
      ?p p:P195 ?st. ?st ps:P195 ?c. ?c rdfs:label ?cl. FILTER(LANG(?cl) = "en") BIND(EXISTS { ?st pq:P582 [] } AS ?ended)
      OPTIONAL { ?c wdt:P17 ?co. FILTER NOT EXISTS { ?co wdt:P576 [] } ?co rdfs:label ?col. FILTER(LANG(?col) = "en") } }`);
    const cands = new Map();
    for (const b of rows) {
      if (b.ended.value === 'true' || /^concept of unknown value/.test(b.cl.value)) continue;
      const id = qid(b.p.value); if (!cands.has(id)) cands.set(id, []);
      cands.get(id).push({ museum: b.cl.value.replace(/^Department of (?:Paintings|Sculptures) of the /, ''), country: b.col ? COUNTRY_NAME[b.col.value] || b.col.value : '' });
    }
    for (const o of group) {
      const c = cands.get(o.id) || [], named = museumOf(o.id);
      const pick = c.find(x => x.museum === named && x.country) || c.find(x => x.country) || c.find(x => x.museum === named) || c[0];
      out.set(o.id, pick || { museum: '', country: '' });
    }
  }
  return out;
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
const placeOf = await museumPlaces(picked, id => (info.get(id) || {}).cl || '');

const paintings = [], usedImage = new Set();
// when two Wikidata items share one picture (one poster, two items), the better-known one keeps it
const imageOwner = new Map();
for (const o of picked) { const img = IMAGE_FIX[o.id] || o.image, w = imageOwner.get(img); if (!w || o.links > w.links) imageOwner.set(img, o); }
for (const o of picked) {
  const x = info.get(o.id) || {};
  x.al ??= x.alm; x.pl ??= x.plm;
  const title = (x.t || x.pl || '').replace(/\s*\([^)]*\)$/, '');   // drop Wikipedia's "(Manet)", "(painting)"
  if (!title || !x.al) continue;                       // nothing to ask about without both names
  const movement = x.ml || onlyMv(o.a);
  // Wikidata's picture can change under us, sometimes to the wrong one (a farm instead of Caillebotte's
  // Floor Planers): a new picture is taken only if its file name names the work or its artist; otherwise
  // the one checked before stays. A new work whose picture looks like someone's holiday photo is left out
  const before = previousImage.get(o.id);
  if (IMAGE_FIX[o.id]) o.image = IMAGE_FIX[o.id];
  else if (before && before !== o.image && !namesWork(o.image, title, x.al)) { console.log(`kept the earlier picture of ${o.id} ${title}: not ${o.image}`); o.image = before; }
  else if (!before && looksLikePhoto(o.image) && !namesWork(o.image, title, x.al)) { console.log(`left out ${o.id} ${title}: its picture ${o.image} looks unrelated`); continue; }
  if (usedImage.has(o.image) || imageOwner.get(o.image) && imageOwner.get(o.image) !== o && imageOwner.get(o.image).image === o.image) continue;   // the same picture twice
  usedImage.add(o.image);
  paintings.push({
    id: o.id, ...(o.kind ? { kind: o.kind } : {}), title, artist: x.al, year: YEAR_FIX[o.id] ?? (o.born && x.year != null && x.year < o.born + 12 ? null : x.year ?? null), movement, ...(movement && !x.ml ? { movementOf: 'painter' } : {}), museum: placeOf.get(o.id).museum, ...(placeOf.get(o.id).country ? { country: placeOf.get(o.id).country } : {}), image: o.image,
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
