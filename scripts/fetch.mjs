// Scarica gli incentivi dal motore di ricerca pubblico di incentivi.gov.it (MIMIT)
// e li normalizza in data/bandi.json. Dati: IODL 2.0 — Fonte: incentivi.gov.it.
//
// Una sola richiesta al giorno: stesso carico di un utente che scarica il CSV open data.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const SOLR = 'https://www.incentivi.gov.it/solr/coredrupal/select';
const PORTAL = 'https://www.incentivi.gov.it';
const TODAY = new Date().toISOString().slice(0, 10);
const ALL_REGIONS = 20;

const FIELDS = [
  'zs_nid', 'zs_title', 'zs_subtitle', 'zs_url', 'zs_body', 'ds_last_update',
  'zs_field_open_date', 'zs_field_close_date', 'zs_field_close_date_descriptor',
  'zm_field_regions_value', 'zs_field_comuni', 'zm_field_special_territory_value',
  'zm_field_dimensions_value', 'zm_field_subject_type_value', 'zm_field_scopes_value',
  'zm_field_activity_sector_value', 'zm_field_granted_costs_value', 'zm_field_support_form_value',
  'zs_field_cost_min', 'zs_field_cost_max', 'zs_field_support_grant_type_min',
  'zs_field_support_grant_type_max', 'zs_field_budget_allocation', 'zs_field_subject_grant',
  'zs_field_link', 'zs_field_ateco', 'zs_field_other_characteristic',
];

async function download() {
  const params = new URLSearchParams({ q: '*:*', rows: '10000', wt: 'json', fl: FIELDS.join(',') });
  const res = await fetch(`${SOLR}?${params}`, {
    headers: { 'User-Agent': 'RadarBandi/0.1 (riuso open data IODL 2.0; aggiornamento giornaliero)' },
  });
  if (!res.ok) throw new Error(`Solr HTTP ${res.status}`);
  const json = await res.json();
  const docs = json.response?.docs ?? [];
  if (docs.length < 1000) throw new Error(`Solo ${docs.length} documenti: risposta sospetta, mi fermo`);
  return docs;
}

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', euro: '€', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì', deg: '°', hellip: '…' };

function clean(s = '') {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// Il testo ufficiale risponde sempre (quasi) a tre domande: Cos'è / A chi si rivolge / Cosa prevede.
function sections(body) {
  const text = clean(body);
  const re = /(Cos['’]è|A chi si rivolge|Cosa prevede)\s/g;
  const marks = [...text.matchAll(re)];
  if (!marks.length) return { cose: text, chi: '', cosa: '' };
  const out = { cose: '', chi: '', cosa: '' };
  const key = (h) => (h.startsWith('Cos') && h.includes('è') ? 'cose' : h.startsWith('A chi') ? 'chi' : 'cosa');
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const k = key(m[1]);
    if (!out[k]) out[k] = text.slice(m.index + m[0].length, end).trim();
  });
  return out;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const day = (v) => (v ? String(v).slice(0, 10) : '');
const arr = (v) => (Array.isArray(v) ? v.map(clean) : v ? [clean(v)] : []);

function normalize(d) {
  const open = day(d.zs_field_open_date);
  const close = day(d.zs_field_close_date);
  const regions = arr(d.zm_field_regions_value);
  const s = sections(d.zs_body);
  const url = d.zs_url || '';
  return {
    id: +d.zs_nid,
    slug: url.split('/').filter(Boolean).pop() || String(d.zs_nid),
    title: clean(d.zs_title),
    subtitle: clean(d.zs_subtitle),
    ente: clean(d.zs_field_subject_grant),
    open,
    close,
    closeNote: clean(d.zs_field_close_date_descriptor),
    national: regions.length >= ALL_REGIONS,
    regions,
    comuni: clean(d.zs_field_comuni),
    territory: arr(d.zm_field_special_territory_value),
    sizes: arr(d.zm_field_dimensions_value),
    subjects: arr(d.zm_field_subject_type_value),
    scopes: arr(d.zm_field_scopes_value),
    sectors: arr(d.zm_field_activity_sector_value),
    costs: arr(d.zm_field_granted_costs_value),
    forms: arr(d.zm_field_support_form_value),
    spesaMin: num(d.zs_field_cost_min),
    spesaMax: num(d.zs_field_cost_max),
    aiutoMin: num(d.zs_field_support_grant_type_min),
    aiutoMax: num(d.zs_field_support_grant_type_max),
    budget: num(d.zs_field_budget_allocation),
    ateco: clean(d.zs_field_ateco),
    keywords: clean(d.zs_field_other_characteristic),
    link: clean(d.zs_field_link),
    portal: url ? PORTAL + url : '',
    updated: day(d.ds_last_update),
    ...s,
  };
}

// Aperto oggi, oppure in arrivo. Senza data di chiusura = "a sportello" (resta dentro, con nota).
function isLive(b) {
  if (b.close && b.close < TODAY) return false;
  if (!b.open && !b.close) return false;
  return true;
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const docs = await download();
  const live = docs.map(normalize).filter(isLive).sort((a, b) => a.id - b.id);

  // first_seen per ogni id: serve per i badge "Nuovo" e per le date nei feed RSS.
  const seenPath = join(DATA, 'seen.json');
  const seen = existsSync(seenPath) ? JSON.parse(await readFile(seenPath, 'utf8')) : {};
  const firstRun = Object.keys(seen).length === 0;
  for (const b of live) {
    if (!seen[b.id]) seen[b.id] = firstRun ? b.open || TODAY : TODAY;
    b.firstSeen = seen[b.id];
  }

  const meta = {
    generated: new Date().toISOString(),
    source: 'incentivi.gov.it (MIMIT) — IODL 2.0',
    totalInCatalog: docs.length,
    live: live.length,
    open: live.filter((b) => b.open <= TODAY).length,
    upcoming: live.filter((b) => b.open > TODAY).length,
  };

  await writeFile(join(DATA, 'bandi.json'), JSON.stringify({ meta, bandi: live }, null, 1));
  await writeFile(seenPath, JSON.stringify(seen, null, 0));

  const histPath = join(DATA, 'history.csv');
  const line = `${TODAY},${meta.totalInCatalog},${meta.live},${meta.open},${meta.upcoming}\n`;
  const hist = existsSync(histPath) ? await readFile(histPath, 'utf8') : 'date,catalog,live,open,upcoming\n';
  if (!hist.includes(`\n${TODAY},`)) await writeFile(histPath, hist + line);

  console.log(`OK: ${meta.live} bandi vivi (${meta.open} aperti, ${meta.upcoming} in arrivo) su ${meta.totalInCatalog}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
