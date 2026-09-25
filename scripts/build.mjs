// Costruisce il sito statico in dist/ a partire da data/bandi.json:
// indice compatto per il matcher, una pagina per bando, feed calendario per regione, sitemap.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://radarbandi.example').replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
// Se il sito vive in una sottocartella (GitHub Pages: utente.github.io/repo) tutti i link assoluti la devono includere.
const BASE = new URL(SITE_URL).pathname.replace(/\/$/, '');
const withBase = (html) => html.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}/`).replace('<html lang="it">', `<html lang="it" data-base="${BASE}">`);

const data = JSON.parse(await readFile(join(ROOT, 'data', 'bandi.json'), 'utf8'));
// I dati possono avere qualche giorno (se il download fallisce si ricostruisce con gli ultimi salvati):
// i bandi chiusi nel frattempo spariscono comunque, e la data mostrata è quella dei dati, non della build.
const bandi = data.bandi.filter((b) => !b.close || b.close >= TODAY);
const DATA_DATE = data.meta.generated.slice(0, 10);
const meta = { ...data.meta, live: bandi.length, open: bandi.filter((b) => b.open <= TODAY).length, upcoming: bandi.filter((b) => b.open > TODAY).length };

// ---------- helper ----------
export const slugify = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const fmtDate = (d) => (d ? `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
const eur = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mln €` : `${n.toLocaleString('it-IT')} €`);
const shortRegion = (r) => r.split('/')[0];
const daysTo = (d) => Math.round((Date.parse(d) - Date.parse(TODAY)) / 86400000);
// Sportello senza data di chiusura e scheda ferma da più di 18 mesi: potrebbe essere chiuso, lo diciamo.
const STALE_DAYS = 540;
const isStale = (b) => !b.close && (!b.updated || daysTo(b.updated) < -STALE_DAYS);

function whereLabel(b) {
  if (b.national) return 'Tutta Italia';
  if (!b.regions.length) return '—';
  return b.regions.length > 3 ? `${b.regions.length} regioni` : b.regions.map(shortRegion).join(', ');
}

function aidLabel(b) {
  if (b.aiutoMax) return `fino a ${eur(b.aiutoMax)}`;
  if (b.spesaMax) return `spesa fino a ${eur(b.spesaMax)}`;
  return '';
}

// ---------- indice compatto per il browser ----------
const pick = (b) => ({
  i: b.id,
  s: b.slug,
  t: b.title,
  e: b.ente,
  o: b.open,
  c: b.close,
  n: b.national ? 1 : 0,
  r: b.regions.map(shortRegion),
  z: b.sizes,
  u: b.subjects,
  p: b.scopes,
  k: b.costs,
  f: b.forms,
  x: b.sectors.length >= 21 ? [] : b.sectors, // 21 = tutti i settori: niente da filtrare
  a: b.aiutoMax,
  m: b.spesaMax,
  g: b.budget,
  l: b.comuni ? 1 : 0,
  y: b.firstSeen,
  v: isStale(b) ? 1 : 0,
  h: (b.cose || '').slice(0, 220),
});

// ---------- pagina singolo bando ----------
function stamp(b) {
  if (b.open > TODAY) return { cls: 'soon', text: `Apre il ${fmtDate(b.open)}` };
  if (!b.close) return { cls: 'desk', text: isStale(b) ? 'A sportello · da verificare' : 'A sportello' };
  const d = daysTo(b.close);
  if (d === 0) return { cls: 'hot', text: 'Scade oggi' };
  if (d <= 7) return { cls: 'hot', text: `Scade tra ${d} ${d === 1 ? 'giorno' : 'giorni'}` };
  return { cls: '', text: `Scade il ${fmtDate(b.close)}` };
}

function pageShell({ title, description, canonical, body, extraHead = '' }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="it_IT">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F7F8F4">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Martian+Mono:wght@400;600&family=Schibsted+Grotesk:wght@600;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${extraHead}
</head>
<body>
${body}
</body>
</html>`;
}

const header = `<header class="bar"><a class="brand" href="/"><span class="brand-cell">R</span><span class="brand-cell">B</span> Radar Bandi</a><a class="bar-link" href="/come-funziona/">Come funziona</a></header>`;

const footer = `<footer class="foot">
  <p><strong>Radar Bandi non è un sito della Pubblica Amministrazione.</strong> Rielabora gli open data di
  <a href="https://www.incentivi.gov.it/it/open-data" rel="noopener">incentivi.gov.it</a> (Ministero delle Imprese e del Made in Italy),
  pubblicati con licenza <a href="https://www.dati.gov.it/iodl/2.0/" rel="noopener">IODL 2.0</a>. Controlla sempre il bando ufficiale prima di presentare domanda.</p>
  <p>Dati aggiornati il ${fmtDate(DATA_DATE)}. Nessun cookie, nessun tracciamento: le tue risposte restano nel tuo browser.</p>
</footer>`;

function factRow(label, value) {
  return value ? `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>` : '';
}

function bandoPage(b, similar) {
  const st = stamp(b);
  const facts = [
    factRow('Agevolazione', b.aiutoMax ? `${b.aiutoMin ? `da ${eur(b.aiutoMin)} ` : ''}fino a ${eur(b.aiutoMax)}` : ''),
    factRow('Spesa ammessa', b.spesaMax ? `${b.spesaMin ? `da ${eur(b.spesaMin)} ` : ''}fino a ${eur(b.spesaMax)}` : ''),
    factRow('Forma', esc(b.forms.join(', '))),
    factRow('Dove', esc(b.national ? 'Tutta Italia' : b.regions.join(', ')) + (b.comuni ? ` <span class="warn">· solo alcuni comuni</span>` : '')),
    factRow('Per chi', esc(b.subjects.join(', '))),
    factRow('Dimensione', esc(b.sizes.join(', '))),
    factRow('Cosa finanzia', esc(b.costs.join(', '))),
    factRow('Obiettivo', esc(b.scopes.join(', '))),
    factRow('Apertura', fmtDate(b.open)),
    factRow('Chiusura', b.close ? fmtDate(b.close) : 'Nessuna data fissa'),
    factRow('Dotazione totale', b.budget ? eur(b.budget) : ''),
    factRow('Ente', esc(b.ente)),
  ].join('');

  const section = (h, t) => (t ? `<section class="prose"><h2>${h}</h2><p>${esc(t)}</p></section>` : '');
  const desc = `${b.cose || b.title}`.slice(0, 155);

  const body = `${header}
<main class="wrap detail">
  <a class="back" href="/">← Tutti i bandi</a>
  <p class="stamp ${st.cls}">${st.text}</p>
  <h1>${esc(b.title)}</h1>
  <p class="ente">${esc(b.ente)}</p>
  <div class="actions">
    ${b.link ? `<a class="btn primary" href="${esc(b.link)}" rel="noopener">Apri il bando ufficiale</a>` : ''}
    ${b.close ? `<a class="btn" href="scadenza.ics" download>Aggiungi la scadenza al calendario</a>` : ''}
  </div>
  ${isStale(b) ? `<p class="note warn-note">La scheda ufficiale non viene aggiornata ${b.updated ? `dal ${fmtDate(b.updated)}` : 'da tempo'}: lo sportello potrebbe essere chiuso o senza fondi. Verifica sul sito dell’ente prima di muoverti.</p>` : ''}
  ${b.closeNote ? `<p class="note">${esc(b.closeNote)}</p>` : ''}
  ${section('Cos’è', b.cose)}
  ${section('A chi si rivolge', b.chi)}
  ${section('Cosa prevede', b.cosa)}
  <dl class="facts">${facts}</dl>
  <p class="source">Scheda ufficiale: <a href="${esc(b.portal)}" rel="noopener">incentivi.gov.it</a> · ultimo aggiornamento della fonte ${fmtDate(b.updated)}</p>
  ${similar.length ? `<section class="similar"><h2>Altri bandi con lo stesso obiettivo</h2><ul class="tab">${similar.map(rowHtml).join('')}</ul></section>` : ''}
</main>
${footer}`;

  return pageShell({
    title: `${b.title} — Radar Bandi`,
    description: desc,
    canonical: `${SITE_URL}/bando/${b.slug}/`,
    body,
  });
}

// Stessa riga usata dal matcher lato browser (app.js la ricostruisce identica).
function rowHtml(b) {
  const st = stamp(b);
  return `<li><a class="row" href="/bando/${b.slug}/"><span class="stamp ${st.cls}">${st.text}</span><span class="row-title">${esc(b.title)}</span><span class="row-meta">${[aidLabel(b), b.forms[0], whereLabel(b)].filter(Boolean).map(esc).join(' · ')}</span></a></li>`;
}

// ---------- calendario ICS ----------
const fold = (line) => {
  const out = [];
  let s = line;
  while (Buffer.byteLength(s) > 74) {
    let cut = 74;
    while (Buffer.byteLength(s.slice(0, cut)) > 74) cut--;
    out.push(s.slice(0, cut));
    s = ' ' + s.slice(cut);
  }
  out.push(s);
  return out.join('\r\n');
};
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDate = (d) => d.replace(/-/g, '');
const nextDay = (d) => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10);

function ics(name, items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = items
    .filter((b) => b.close && b.close >= TODAY)
    .map((b) =>
      [
        'BEGIN:VEVENT',
        `UID:bando-${b.id}-${b.close}@radarbandi`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(b.close)}`,
        `DTEND;VALUE=DATE:${icsDate(nextDay(b.close))}`,
        `SUMMARY:${icsText('Scade: ' + b.title)}`,
        `DESCRIPTION:${icsText(`${aidLabel(b)}\n${b.ente}\n${SITE_URL}/bando/${b.slug}/`)}`,
        `URL:${SITE_URL}/bando/${b.slug}/`,
        'BEGIN:VALARM',
        'TRIGGER:-P7D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText('Tra 7 giorni scade: ' + b.title)}`,
        'END:VALARM',
        'END:VEVENT',
      ]
        .map(fold)
        .join('\r\n'),
    );
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Radar Bandi//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsText(name)}`),
    'X-WR-TIMEZONE:Europe/Rome',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// ---------- build ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'data'), { recursive: true });
await mkdir(join(DIST, 'feeds'), { recursive: true });
await cp(join(ROOT, 'src'), DIST, { recursive: true });

const regions = [...new Set(bandi.flatMap((b) => (b.national ? [] : b.regions)))].filter((r) => r !== 'Estero').sort((a, b) => a.localeCompare(b, 'it'));

await writeFile(
  join(DIST, 'data', 'index.json'),
  JSON.stringify({ meta: { ...meta, built: TODAY, regions: regions.map(shortRegion) }, b: bandi.map(pick) }),
);

// pagine bando
for (const b of bandi) {
  const dir = join(DIST, 'bando', b.slug);
  await mkdir(dir, { recursive: true });
  const similar = bandi
    .filter((o) => o.id !== b.id && o.scopes.some((s) => b.scopes.includes(s)) && (o.national || b.national || o.regions.some((r) => b.regions.includes(r))))
    .sort((x, y) => (x.close || '9999').localeCompare(y.close || '9999'))
    .slice(0, 5);
  await writeFile(join(dir, 'index.html'), withBase(bandoPage(b, similar)));
  if (b.close) await writeFile(join(dir, 'scadenza.ics'), ics(b.title, [b]));
}

// feed calendario: uno per regione (regionali + nazionali) e uno solo nazionali
await writeFile(join(DIST, 'feeds', 'italia.ics'), ics('Bandi nazionali — Radar Bandi', bandi.filter((b) => b.national)));
for (const r of regions) {
  const items = bandi.filter((b) => b.national || b.regions.includes(r));
  await writeFile(join(DIST, 'feeds', `${slugify(shortRegion(r))}.ics`), ics(`Bandi ${shortRegion(r)} — Radar Bandi`, items));
}

// index.html: inietta i numeri di oggi, così la pagina ha senso anche prima che parta il JS
const indexPath = join(DIST, 'index.html');
let index = await readFile(indexPath, 'utf8');
index = index
  .replaceAll('{{OPEN}}', String(meta.open))
  .replaceAll('{{LIVE}}', String(meta.live))
  .replaceAll('{{UPCOMING}}', String(meta.upcoming))
  .replaceAll('{{DATE}}', fmtDate(DATA_DATE))
  .replaceAll('{{SITE_URL}}', SITE_URL)
  .replace('{{REGION_OPTIONS}}', regions.map((r) => `<option value="${esc(shortRegion(r))}">${esc(shortRegion(r))}</option>`).join(''));
await writeFile(indexPath, withBase(index));

for (const p of ['come-funziona/index.html']) {
  const f = join(DIST, p);
  await writeFile(f, withBase(await readFile(f, 'utf8')).replaceAll('{{DATE}}', fmtDate(DATA_DATE)).replaceAll('{{SITE_URL}}', SITE_URL).replaceAll('{{LIVE}}', String(meta.live)));
}

await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE_URL}/</loc><lastmod>${TODAY}</lastmod></url>\n<url><loc>${SITE_URL}/come-funziona/</loc></url>\n${bandi.map((b) => `<url><loc>${SITE_URL}/bando/${b.slug}/</loc><lastmod>${b.updated || TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Build OK: ${bandi.length} pagine bando, ${regions.length + 1} feed calendario → dist/`);
