// Builds the web app into dist/: wraps src/app.html in a full page with the web platform layer,
// copies the PWA files and the data. Run: node tools/build.mjs   (Node 18+, no dependencies)
// src/app.html on its own is also the page published inside Claude.
import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const at = p => new URL(p, root);
const exists = p => access(at(p)).then(() => true, () => false);

const app = await readFile(at('src/app.html'), 'utf8');
const cut = app.indexOf('\n<div class="app">');
if (cut < 0) throw new Error('src/app.html: could not find <div class="app">');
const headPart = app.slice(0, cut).replace(/<meta name="claude:[^>]*>\n?/g, '');
const bodyPart = app.slice(cut + 1);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Practise the fretboard, ukulele, chess, your vocabulary and paintings, ten minutes at a time.">
<meta name="theme-color" content="#2b5c8e">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<script src="firebase-config.js"></script>
<script src="account-storage.js"></script>
<script src="platform.js"></script>
${headPart}
</head>
<body>
${bodyPart}
</body>
</html>
`;

await rm(at('dist'), { recursive: true, force: true });
await mkdir(at('dist'), { recursive: true });
await cp(at('web'), at('dist'), { recursive: true });
await writeFile(at('dist/index.html'), page);
for (const f of ['puzzles.json', 'paintings.json']) {
  if (await exists('data/' + f)) await cp(at('data/' + f), at('dist/' + f));
  else console.warn(`data/${f} is missing: that section will say it isn't available yet`);
}
// a new service-worker version whenever anything changes, so phones pick up updates
const hash = createHash('sha256').update(page).update(await readFile(at('web/platform.js'))).update(await readFile(at('web/account-storage.js'))).update(await readFile(at('web/firebase-config.js'))).digest('hex').slice(0, 12);
const sw = await readFile(at('web/sw.js'), 'utf8');
await writeFile(at('dist/sw.js'), sw.replace('__BUILD__', hash));
await writeFile(at('dist/.nojekyll'), '');
console.log('dist/ built, version ' + hash);
