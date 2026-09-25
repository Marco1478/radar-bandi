// Radar Bandi — il matcher. Gira tutto nel browser: nessuna risposta lascia il dispositivo.

const $ = (s) => document.querySelector(s);
const form = $('#modulo');
const list = $('#list');
const PAGE = 30;
const BASE = document.documentElement.dataset.base || '';
const TODAY = new Date().toISOString().slice(0, 10);
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

let data = [];
let meta = {};
let shown = PAGE;
let lastCount = null;

// ---------- cosa vuoi finanziare → campi ufficiali ----------
const GOALS = {
  macchinari: { costs: ['Impianti/Macchinari/Attrezzature'] },
  digitale: { scopes: ['Digitalizzazione'] },
  personale: { costs: ['Costo del personale'] },
  formazione: { costs: ['Formazione Professionale'], scopes: ['Formazione (lavoro, occupazione, riqualificazione professionale dei lavoratori)'] },
  export: { scopes: ['Internazionalizzazione'] },
  energia: { scopes: ['Transizione ecologica'] },
  immobili: { costs: ['Fabbricati e terreni'] },
  ricerca: { scopes: ['Innovazione e ricerca'] },
  avvio: { scopes: ["Start up/Sviluppo d'impresa", 'Imprenditoria giovanile', 'Imprenditoria femminile'] },
  liquidita: { scopes: ['Sostegno liquidità', "Crisi d'impresa", 'Rafforzamento del capitale'] },
};

function subjectsFor(a) {
  const s = [];
  if (a.chi === 'attiva') {
    s.push('Impresa', 'Consorzio', "Rete d'impresa");
    if (a.fem) s.push('Impresa - prevalenza femminile');
    if (a.gio) s.push('Impresa - prevalenza giovanile');
    if (a.inn) s.push('Impresa - SU/PMI innovativa');
  } else if (a.chi === 'nuova') {
    s.push('Impresa da costituire - Altro');
    if (a.fem) s.push('Impresa da costituire - Femminile');
    if (a.gio) s.push('Impresa da costituire - Giovanile');
    if (a.inn) s.push('Impresa - SU/PMI innovativa');
  } else if (a.chi === 'pro') s.push('Professionista');
  else if (a.chi === 'noprofit') s.push('Cooperative/Associazioni Non Profit');
  else if (a.chi === 'privato') s.push('Cittadino');
  return s;
}

// Quanto un bando è pertinente agli obiettivi scelti: 2 = specifico, 1 = generico (ammette quasi ogni
// spesa o obiettivo, quindi il tag non dice molto), 0 = non pertinente.
const SPECIFIC_COSTS = 3;
const SPECIFIC_SCOPES = 3;
function goalScore(b, a) {
  if (!a.g.length) return 2;
  let best = 0;
  for (const g of a.g) {
    const m = GOALS[g];
    if ((m.scopes || []).some((s) => b.p.includes(s))) best = Math.max(best, b.p.length <= SPECIFIC_SCOPES ? 2 : 1);
    if ((m.costs || []).some((c) => b.k.includes(c))) best = Math.max(best, b.k.length <= SPECIFIC_COSTS ? 2 : 1);
  }
  return best;
}

// I bandi "in arrivo" restano nella lista: sono quelli da preparare adesso.
function matches(b, a) {
  if (a.r && !b.n && !b.r.includes(a.r)) return false;
  const subs = subjectsFor(a);
  if (subs.length && !b.u.some((u) => subs.includes(u))) return false;
  if (a.dim && a.chi === 'attiva' && b.z.length && !b.z.includes(a.dim) && !b.z.includes('Non classificabile/classificato')) return false;
  b._s = goalScore(b, a);
  if (!b._s) return false;
  if (a.fp && !b.f.includes('Contributo/Fondo perduto')) return false;
  return true;
}

// ---------- lettura/scrittura risposte (anche nell'URL, così la ricerca si può salvare e condividere) ----------
function readAnswers() {
  const fd = new FormData(form);
  return {
    r: fd.get('r') || '',
    chi: fd.get('chi') || '',
    fem: !!fd.get('fem'),
    gio: !!fd.get('gio'),
    inn: !!fd.get('inn'),
    dim: fd.get('dim') || '',
    g: fd.getAll('g'),
    fp: fd.get('fp') === '1',
  };
}

function answersToQuery(a) {
  const p = new URLSearchParams();
  if (a.r) p.set('r', a.r);
  if (a.chi) p.set('chi', a.chi);
  if (a.fem) p.set('fem', '1');
  if (a.gio) p.set('gio', '1');
  if (a.inn) p.set('inn', '1');
  if (a.dim) p.set('dim', a.dim);
  if (a.g.length) p.set('g', a.g.join(','));
  if (a.fp) p.set('fp', '1');
  return p.toString();
}

function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  const set = (name, value) => {
    const el = form.querySelector(`[name="${name}"][value="${CSS.escape(value)}"]`);
    if (el) el.checked = true;
  };
  if (p.get('r')) $('#f-r').value = p.get('r');
  if (p.get('chi')) set('chi', p.get('chi'));
  for (const k of ['fem', 'gio', 'inn']) if (p.get(k)) set(k, '1');
  if (p.get('dim')) set('dim', p.get('dim'));
  for (const g of (p.get('g') || '').split(',').filter(Boolean)) set('g', g);
  if (p.get('fp')) set('fp', '1');
}

// ---------- presentazione ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (d) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}${d.slice(0, 4) !== TODAY.slice(0, 4) ? ' ' + d.slice(0, 4) : ''}`;
const eur = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mln €` : `${n.toLocaleString('it-IT')} €`);
const daysTo = (d) => Math.round((Date.parse(d) - Date.parse(TODAY)) / 86400000);

function stamp(b) {
  if (b.o > TODAY) return { cls: 'soon', text: `Apre il ${fmtDate(b.o)}` };
  if (!b.c) return { cls: 'desk', text: b.v ? 'A sportello · da verificare' : 'A sportello' };
  const d = daysTo(b.c);
  if (d === 0) return { cls: 'hot', text: 'Scade oggi' };
  if (d <= 7) return { cls: 'hot', text: `Scade tra ${d} ${d === 1 ? 'giorno' : 'giorni'}` };
  return { cls: '', text: `Scade il ${fmtDate(b.c)}` };
}

function where(b) {
  if (b.n) return 'Tutta Italia';
  return b.r.length > 3 ? `${b.r.length} regioni` : b.r.join(', ');
}

function row(b) {
  const st = stamp(b);
  const isNew = b.y && daysTo(b.y) >= -7 && b.o <= TODAY;
  const aid = b.a ? `<span class="aid">fino a ${eur(b.a)}</span>` : b.m ? `spesa fino a ${eur(b.m)}` : '';
  const form0 = b.f[0] ? esc(b.f[0]) : '';
  const meta = [aid, form0, esc(where(b)), b.l ? 'solo alcuni comuni' : ''].filter(Boolean).join(' · ');
  return `<li><a class="row" href="${BASE}/bando/${esc(b.s)}/"><span class="stamp ${st.cls}">${st.text}${isNew ? '<span class="new">nuovo</span>' : ''}</span><span class="row-title">${esc(b.t)}</span>${b.h ? `<span class="row-sum">${esc(b.h)}</span>` : ''}<span class="row-meta">${meta}</span></a></li>`;
}

// Prima i bandi specifici, poi (se ci sono obiettivi scelti) quelli generici sotto un'intestazione.
function listHtml(found, limit) {
  const specific = found.filter((b) => b._s !== 1);
  const generic = found.filter((b) => b._s === 1);
  const rows = specific.slice(0, limit).map(row);
  const left = limit - specific.length;
  if (generic.length && left > 0) {
    rows.push(`<li class="divider"><strong>Bandi generici (${generic.length})</strong>Ammettono quasi ogni tipo di spesa: controlla se il tuo progetto ci rientra davvero.</li>`);
    rows.push(...generic.slice(0, left).map(row));
  }
  return rows.join('');
}

const SORTS = {
  close: (x, y) => (x.o > TODAY) - (y.o > TODAY) || x.v - y.v || (x.c || '9999').localeCompare(y.c || '9999'),
  aid: (x, y) => (y.a || y.m / 2 || 0) - (x.a || x.m / 2 || 0),
  new: (x, y) => (y.o || '').localeCompare(x.o || ''),
};

function renderCells(n) {
  const digits = String(n).padStart(3, '0').split('');
  const cells = $('#cells');
  const prev = [...cells.querySelectorAll('.d')].map((d) => d.textContent);
  cells.innerHTML = digits
    .map((d, i) => {
      const lead = i < digits.length - String(n).length;
      const changed = prev.length && prev[i] !== d;
      return `<span class="cell${lead ? ' blank' : ''}${changed ? ' flip' : ''}"><span class="d">${d}</span></span>`;
    })
    .join('');
}

function isFiltered(a) {
  return !!(a.r || a.chi || a.dim || a.g.length || a.fp);
}

function render({ resetPaging = true } = {}) {
  const a = readAnswers();
  if (resetPaging) shown = PAGE;

  // la dimensione ha senso solo per chi ha già un'impresa
  $('#fs-dim').disabled = a.chi !== '' && a.chi !== 'attiva';

  const found = data.filter((b) => matches(b, a)).sort(SORTS[$('#sort').value]);
  const openCount = found.filter((b) => b.o <= TODAY).length;

  if (openCount !== lastCount) renderCells(openCount);
  lastCount = openCount;
  const filtered = isFiltered(a);
  $('#counter-label').innerHTML = filtered ? `bandi aperti <em>adatti&nbsp;a&nbsp;te</em>` : 'bandi e incentivi aperti in Italia';
  $('#counter-sr').textContent = `${openCount} ${filtered ? 'bandi aperti adatti a te' : 'bandi e incentivi aperti in Italia'}`;
  const upcoming = found.length - openCount;
  $('#res-title').textContent = `${openCount} aperti${upcoming ? ` e ${upcoming} in arrivo` : ''}`;

  if (!found.length) {
    list.innerHTML = `<li class="empty"><strong>Nessun bando corrisponde a tutte queste risposte.</strong>Togli uno degli obiettivi al punto 4 o scegli “Qualsiasi” al punto 5.</li>`;
  } else {
    list.innerHTML = listHtml(found, shown);
  }
  const more = $('#more');
  more.hidden = found.length <= shown;
  more.textContent = `Mostra altri ${Math.min(PAGE, found.length - shown)} di ${found.length - shown}`;

  // strumenti calendario
  const withDeadline = found.filter((b) => b.c && b.c >= TODAY);
  $('#res-tools').hidden = !filtered || !withDeadline.length;
  $('#dl-ics').textContent = `Scarica ${withDeadline.length} scadenze nel calendario`;
  const sub = $('#sub-ics');
  if (a.r) {
    sub.hidden = false;
    sub.href = `webcal://${location.host}${BASE}/feeds/${slugify(a.r)}.ics`;
    sub.textContent = `Ricevi le scadenze ${a.r === 'Tutta Italia' ? '' : 'di ' + a.r + ' '}nel calendario, sempre aggiornate`;
  } else sub.hidden = true;

  $('#jump').textContent = `Vedi ${openCount === 1 ? 'il bando' : `i ${openCount} bandi`} ↓`;

  const q = answersToQuery(a);
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
  current = withDeadline;
  lastFound = found;
  lastAnswers = a;
}

let lastFound = [];
let lastAnswers = null;

// ---------- stampa: un resoconto da portare al commercialista ----------
const CHI_LABEL = { attiva: 'impresa attiva', nuova: 'impresa da aprire', pro: 'libero professionista', noprofit: 'associazione o cooperativa', privato: 'privato cittadino' };
const DIM_LABEL = { Microimpresa: 'meno di 10 addetti', 'Piccola Impresa': '10–49 addetti', 'Media Impresa': '50–249 addetti', 'Grande Impresa': '250 o più addetti' };
const GOAL_LABEL = { macchinari: 'macchinari', digitale: 'digitale', personale: 'assunzioni', formazione: 'formazione', export: 'export e fiere', energia: 'energia e ambiente', immobili: 'locali e immobili', ricerca: 'ricerca e innovazione', avvio: 'avvio o crescita', liquidita: 'liquidità' };

function printProfile(a) {
  const parts = [
    a.r || 'tutta Italia',
    CHI_LABEL[a.chi],
    a.fem && 'guidata da donne',
    a.gio && 'under 35',
    a.inn && 'startup o PMI innovativa',
    a.chi === 'attiva' && DIM_LABEL[a.dim],
    a.g.length && 'per: ' + a.g.map((g) => GOAL_LABEL[g]).join(', '),
    a.fp && 'solo fondo perduto',
  ].filter(Boolean);
  return parts.join(' · ');
}

function preparePrint() {
  const a = lastAnswers || readAnswers();
  const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#print-head').innerHTML = `<p><strong>Radar Bandi — resoconto del ${today}</strong></p><p>Profilo: ${esc(printProfile(a))}</p><p>${lastFound.length} bandi trovati. Verifica sempre requisiti e scadenze sul bando ufficiale. Fonte: incentivi.gov.it (MIMIT), IODL 2.0.</p>`;
  list.innerHTML = listHtml(lastFound, Infinity);
  list.querySelectorAll('a.row').forEach((el) => el.insertAdjacentHTML('beforeend', `<span class="print-url">${esc(el.href)}</span>`));
}

let current = [];

const slugify = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- .ics generato al volo con i soli bandi trovati ----------
function downloadIcs() {
  const stampNow = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const t = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const d = (s) => s.replace(/-/g, '');
  const next = (s) => new Date(Date.parse(s) + 86400000).toISOString().slice(0, 10);
  const ev = current.map((b) =>
    [
      'BEGIN:VEVENT',
      `UID:bando-${b.i}-${b.c}@radarbandi`,
      `DTSTAMP:${stampNow}`,
      `DTSTART;VALUE=DATE:${d(b.c)}`,
      `DTEND;VALUE=DATE:${d(next(b.c))}`,
      `SUMMARY:${t('Scade: ' + b.t)}`,
      `URL:${location.origin}${BASE}/bando/${b.s}/`,
      `DESCRIPTION:${t(location.origin + BASE + '/bando/' + b.s + '/')}`,
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${t('Tra 7 giorni scade: ' + b.t)}`, 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'),
  );
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Radar Bandi//IT', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR', ''].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'scadenze-bandi.ics' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- avvio ----------
async function init() {
  restoreFromUrl();
  try {
    const res = await fetch(`${BASE}/data/index.json`);
    const json = await res.json();
    data = json.b.filter((b) => !b.c || b.c >= TODAY); // chiusi dopo l'ultima build: fuori
    meta = json.meta;
  } catch {
    list.innerHTML = `<li class="empty"><strong>Non riesco a caricare i bandi.</strong>Controlla la connessione e ricarica la pagina.</li>`;
    return;
  }
  render();

  // la barra "Vedi i bandi" compare solo mentre il modulo è sullo schermo e i risultati no
  const jump = $('#jump');
  const results = $('#results');
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    jump.hidden = !(visible.has(form) && !visible.has(results));
  });
  io.observe(form);
  io.observe(results);

  form.addEventListener('change', () => render());
  $('#sort').addEventListener('change', () => render());
  $('#more').addEventListener('click', () => {
    shown += PAGE;
    render({ resetPaging: false });
  });
  $('#reset').addEventListener('click', () => {
    form.reset();
    render();
  });
  $('#print').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', () => render({ resetPaging: false }));
  $('#dl-ics').addEventListener('click', (e) => {
    e.preventDefault();
    downloadIcs();
  });
}

init();
