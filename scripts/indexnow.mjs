// Avvisa i motori che supportano IndexNow (Bing, Yandex, Seznam, Naver…) delle pagine nuove.
//   node scripts/indexnow.mjs          → solo i bandi comparsi negli ultimi 2 giorni
//   node scripts/indexnow.mjs --all    → tutte le pagine (da usare una volta sola, al lancio)
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!SITE_URL.startsWith('https://')) {
  console.log('SITE_URL mancante: niente IndexNow.');
  process.exit(0);
}
const key = (await readdir(join(ROOT, 'src'))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, 32);
const { bandi } = JSON.parse(await readFile(join(ROOT, 'data', 'bandi.json'), 'utf8'));
const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const all = process.argv.includes('--all');
const pages = bandi.filter((b) => all || b.firstSeen >= since).map((b) => `${SITE_URL}/bando/${b.slug}/`);
if (all) pages.unshift(`${SITE_URL}/`, `${SITE_URL}/come-funziona/`);
if (!pages.length) {
  console.log('Nessuna pagina nuova da segnalare.');
  process.exit(0);
}
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: pages.slice(0, 10000) }),
});
console.log(`IndexNow: ${pages.length} URL → HTTP ${res.status}`);
