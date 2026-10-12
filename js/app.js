import { CATEGORIES, COVERS, ACCENTS, CURATED, TEMPLATES, CREATOR } from './data.js';
import { encodeShare, shareUrl as sharePageUrl, renderCard, qrSvg, saveBlob, slug, CARD_FORMATS } from './share.js';

/* ==========================================================================
   Utilità
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = n => String(n).padStart(2, '0');
const DAY = 864e5, HOUR = 36e5;
const GRACE = HOUR; // un countdown ricorrente resta "arrivato" per un'ora prima di passare alla prossima occorrenza
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const reducedMotion = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

const KEYS = { mine: 'tc-mine-v3', saved: 'tc-saved-v3', prefs: 'tc-prefs-v3', legacy: 'tc-events-v2' };
const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { toast('Spazio del browser esaurito: prova a rimuovere qualche immagine.'); return false; }
  },
};

const IMAGE_HOSTS = ['image.tmdb.org', 'media.rawg.io', 'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net', 'images.unsplash.com', 'static.tvmaze.com', 'images.igdb.com', 's1.ticketm.net', 'thespacedevs-prod.nyc3.digitaloceanspaces.com', 's4.anilist.co'];
function safeImage(v) {
  if (typeof v !== 'string') return '';
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v) && v.length < 1_500_000) return v;
  if (/^assets\/[\w.-]+\.(?:webp|png|jpe?g|avif)$/i.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && IMAGE_HOSTS.includes(u.hostname) && !/["'()\\\s]/.test(v)) return v;
  } catch {}
  return '';
}
function safeCredit(c) {
  if (!c || typeof c !== 'object') return null;
  const link = v => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const label = String(c.label || '').slice(0, 40);
  if (!label) return null;
  return { label, url: link(c.url), author: String(c.author || '').slice(0, 60), authorUrl: link(c.authorUrl) };
}
function safeSource(src) {
  if (!src || typeof src !== 'object') return null;
  try { const u = new URL(src.url); if (u.protocol !== 'https:') return null; return { label: String(src.label || u.hostname).slice(0, 40), url: u.href }; } catch { return null; }
}
function creditHTML(c) {
  if (!c) return '';
  const a = (text, url) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
  return c.author ? `Foto di ${a(c.author, c.authorUrl)} su ${a(c.label, c.url)}` : a(c.label, c.url);
}
const tmdbImage = (path, size) => (path && /^\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : '');
const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

/* ---------- Fusi orari ---------- */
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  return dtfCache.get(tz);
}
function tzOffset(ms, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(ms)) p[type] = value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - Math.floor(ms / 1000) * 1000;
}
function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = tzOffset(guess, tz);
  let t = guess - off;
  const off2 = tzOffset(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}
function wallParts(ms, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(ms)) p[type] = value;
  return { day: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(+p.hour % 24)}:${pad(p.minute)}` };
}

/* ---------- Formattazione ---------- */
function fmtDate(ms, { tz = USER_TZ, precision = 'time', weekday = true } = {}) {
  const o = { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz };
  if (weekday) o.weekday = 'long';
  if (precision !== 'day') { o.hour = '2-digit'; o.minute = '2-digit'; }
  return new Intl.DateTimeFormat('it-IT', o).format(ms);
}
const fmtShort = (ms, tz = USER_TZ) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(ms);
const fmtWhen = ms => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
const tzLabel = tz => (tz || '').replace(/_/g, ' ').split('/').pop();
function parts(ms) {
  ms = Math.max(0, ms);
  return { d: Math.floor(ms / DAY), h: Math.floor(ms % DAY / HOUR), m: Math.floor(ms % HOUR / 6e4), s: Math.floor(ms % 6e4 / 1e3) };
}
function relative(ms) {
  const r = ms - Date.now();
  if (r <= 0) return 'Concluso';
  const { d, h, m } = parts(r);
  if (d >= 2) return `tra ${d} giorni`;
  if (d === 1) return `tra 1 giorno e ${h} h`;
  if (h >= 1) return `tra ${h} h ${m} min`;
  return `tra ${m} min`;
}

/* ==========================================================================
   Stato
   ========================================================================== */
const prefs = Object.assign({ theme: 'dark', accent: ACCENTS[0].value, reduceMotion: false, view: 'grid', period: 'all', timelineMine: true, timelineHolidays: true }, store.get(KEYS.prefs, {}));
let mine = store.get(KEYS.mine, null);
let saved = new Set(store.get(KEYS.saved, []));
if (!Array.isArray(mine)) { mine = migrateLegacy(); store.set(KEYS.mine, mine); }
mine = mine.map(sanitizeMine).filter(Boolean);

const artMap = new Map();   // id evento curato -> { image, thumb, credit }
let artStatus = {};        // quali fonti di immagini sono configurate sul server
// Uscite e ricorrenze caricate dal server (TMDb, RAWG, Nager.Date)
const FEEDS = {
  presto:   { label: 'Presto',      title: 'Nei prossimi giorni' },
  anime:    { label: 'Anime',       title: 'Anime: nuove serie e prossimi episodi' },
  film:     { label: 'Film',        title: 'Al cinema in Italia' },
  serie:    { label: 'Serie TV',    title: 'Nuove stagioni in arrivo' },
  giochi:   { label: 'Videogiochi', title: 'Videogiochi in uscita' },
  concerti: { label: 'Concerti',    title: 'Concerti in Italia' },
  calcio:   { label: 'Calcio',      title: 'Serie A e Champions League' },
  f1:       { label: 'Formula 1',   title: 'Prossimi Gran Premi' },
  spazio:   { label: 'Spazio',      title: 'Prossimi lanci spaziali' },
};
const FEED_COVER = { film: 'eclipse', serie: 'nebula', anime: 'sakura', gaming: 'neon', ricorrenze: 'confetti', musica: 'vinyl', sport: 'stadium', tech: 'circuit' };
const feedData = { film: [], serie: [], anime: [], giochi: [], concerti: [], calcio: [], f1: [], spazio: [], feste: [] };
let shelfType = 'presto';
let animeGroup = 'nuove';   // 'nuove' | 'episodi'
let platformFilter = 'all';
const STATUS = { confermata: 'Confermata', prevista: 'Prevista', tba: 'Da annunciare' };
// Piattaforme raggruppate per il filtro dei videogiochi.
const PLATFORM_GROUPS = { PC: /^(PC|Win|Mac|Linux)/i, PlayStation: /^PS|PlayStation/i, Xbox: /Xbox|Series/i, Switch: /Switch|Nintendo/i, Mobile: /iOS|Android/i };
let sharedItem = null;      // countdown arrivato da un link
let exploreFilter = 'all';
let exploreExpanded = false;
let mineFilter = 'all';
let calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let slides = [], slideIdx = 0, slideTimer = null, heroPaused = false;
let openDetailId = null, focusId = null;
const prevRemaining = new Map();

const persistMine = () => store.set(KEYS.mine, mine);
const persistSaved = () => store.set(KEYS.saved, [...saved]);
const persistPrefs = () => store.set(KEYS.prefs, prefs);

function sanitizeMine(m) {
  if (!m || typeof m !== 'object' || !String(m.title || '').trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.day || '')) return null;
  return {
    id: typeof m.id === 'string' ? m.id : 'c-' + uid(),
    kind: m.kind === 'feed' || m.kind === 'tmdb' ? 'feed' : 'custom',
    feedId: m.feedId ? String(m.feedId).slice(0, 60) : m.tmdbId ? 'film-' + m.tmdbId : undefined,
    source: safeSource(m.source) || (m.tmdbId ? { label: 'TMDb', url: 'https://www.themoviedb.org/movie/' + encodeURIComponent(m.tmdbId) } : null),
    precision: ['day', 'time', 'approx'].includes(m.precision) ? m.precision : 'day',
    feedNote: String(m.feedNote || (m.kind === 'tmdb' ? 'Uscita al cinema in Italia secondo TMDb.' : '')).slice(0, 160),
    title: String(m.title).trim().slice(0, 80),
    note: String(m.note || '').slice(0, 200),
    category: CATEGORIES[m.category] ? m.category : 'personale',
    day: m.day,
    time: /^\d{2}:\d{2}$/.test(m.time || '') ? m.time : '00:00',
    tz: validTz(m.tz) ? m.tz : USER_TZ,
    repeat: ['yearly', 'monthly'].includes(m.repeat) ? m.repeat : 'none',
    cover: COVERS[m.cover] ? m.cover : 'eclipse',
    image: safeImage(m.image),
    poster: safeImage(m.poster),
    credit: safeCredit(m.credit),
    reminders: Array.isArray(m.reminders) ? m.reminders.filter(r => ['1d', '1h', '0'].includes(r)) : [],
    sound: Boolean(m.sound),
    pinned: Boolean(m.pinned),
    createdAt: Number.isFinite(Date.parse(m.createdAt)) ? m.createdAt : new Date().toISOString(),
  };
}

// Importa i countdown della versione precedente del sito.
function migrateLegacy(old = store.get(KEYS.legacy, [])) {
  if (!Array.isArray(old)) return [];
  const catMap = { Cinema: 'film', Gaming: 'gaming', Natura: 'viaggi', Cultura: 'musica', Personale: 'personale' };
  const legacyArt = { moon: 'nebula', dawn: 'sunrise', forest: 'aurora', ember: 'dunes', film: 'eclipse' };
  return old.map(e => {
    const t = Date.parse(e?.date);
    if (!Number.isFinite(t)) return null;
    const w = wallParts(t, USER_TZ);
    return sanitizeMine({
      id: e.id, kind: e.tmdbId ? 'tmdb' : 'custom', title: e.title, note: e.description, category: catMap[e.category] || 'personale',
      day: w.day, time: w.time, tz: USER_TZ, repeat: e.repeat === 'yearly' ? 'yearly' : 'none', cover: legacyArt[e.art] || 'eclipse',
      image: e.cover || e.backdrop || e.poster, poster: e.poster, tmdbId: e.tmdbId, reminders: e.reminder ? ['1d'] : [], sound: e.sound, createdAt: e.createdAt,
    });
  }).filter(Boolean);
}

/* ---------- Calcolo delle date ---------- */
function customTarget(m) {
  const [Y, M, D] = m.day.split('-').map(Number);
  const [h, mi] = m.time.split(':').map(Number);
  const first = zonedToUtc(Y, M, D, h, mi, m.tz);
  const now = Date.now();
  if (m.repeat === 'yearly') {
    for (let y = Math.max(Y, new Date().getFullYear() - 1); y < Y + 400; y++) {
      const t = zonedToUtc(y, M, D, h, mi, m.tz);
      if (t >= first && t > now - GRACE) return t;
    }
  }
  if (m.repeat === 'monthly') {
    const today = new Date();
    let y = today.getFullYear(), mo = today.getMonth(); // un mese prima, per sicurezza
    if (y * 12 + mo < Y * 12 + M - 1) { y = Y; mo = M - 1; }
    for (let i = 0; i < 40; i++) {
      const yy = y + Math.floor((mo - 1 + i) / 12), mm = ((mo - 1 + i) % 12 + 12) % 12 + 1;
      const dd = Math.min(D, new Date(yy, mm, 0).getDate());
      const t = zonedToUtc(yy, mm, dd, h, mi, m.tz);
      if (t >= first && t > now - GRACE) return t;
    }
  }
  return first;
}
function curatedTarget(e) {
  if (e.local) return new Date(e.local).getTime();
  return Date.parse(e.date);
}

/* ---------- View model ---------- */
function vmCurated(e) {
  const art = artMap.get(e.id) || {};
  const local = safeImage(e.image);
  return {
    ...e, kind: 'curated', sub: e.tagline, image: local || art.image || '', poster: local ? '' : art.thumb || '',
    credit: local ? null : art.credit || null,
    tz: e.tz || USER_TZ, target: curatedTarget(e), saved: saved.has(e.id),
  };
}
function vmMine(m) {
  const feed = m.kind === 'feed';
  return {
    ...m, sub: m.note || (feed ? 'In arrivo' : 'Un momento che vale la pena aspettare.'),
    target: customTarget(m), precision: feed ? m.precision : 'time', saved: true,
    source: feed ? m.source : null,
    note: feed ? m.feedNote : '',
    personalNote: feed ? '' : m.note,
  };
}
function vmFeed(f) {
  const [y, mo, d] = f.day.split('-').map(Number);
  const exact = Number.isFinite(Date.parse(f.at));
  const tz = f.local || exact ? USER_TZ : 'Europe/Rome';
  const category = CATEGORIES[f.category] ? f.category : 'personale';
  return {
    id: 'feed-' + f.id, feedId: f.id, kind: 'feed', category, cover: FEED_COVER[category] || 'eclipse',
    title: String(f.title).slice(0, 80), sub: String(f.overview || 'In arrivo').slice(0, 140), tagline: String(f.overview || '').slice(0, 300),
    image: safeImage(f.image), poster: safeImage(f.poster),
    day: f.day, tz, precision: exact ? (f.precision === 'approx' ? 'approx' : 'time') : 'day',
    target: exact ? Date.parse(f.at) : zonedToUtc(y, mo, d, 0, 0, tz),
    note: String(f.note || '').slice(0, 160), source: safeSource(f.source), credit: safeCredit(f.credit),
    status: STATUS[f.status] ? f.status : (exact ? 'confermata' : 'prevista'),
    group: f.group === 'episodi' ? 'episodi' : 'nuove',
    platforms: Array.isArray(f.platforms) ? f.platforms.map(String).slice(0, 12) : [],
    saved: mine.some(m => m.feedId === f.id),
  };
}
const feedItems = types => (types || Object.keys(feedData)).flatMap(t => feedData[t]).map(vmFeed);
const curatedItems = () => CURATED.map(vmCurated).filter(e => Number.isFinite(e.target));
const mineItems = () => mine.map(vmMine).concat(curatedItems().filter(e => e.saved));
function getItem(id) {
  if (sharedItem && sharedItem.id === id) return sharedItem;
  const m = mine.find(x => x.id === id);
  if (m) return vmMine(m);
  const c = CURATED.find(x => x.id === id);
  if (c) return vmCurated(c);
  const savedFeed = mine.find(x => 'feed-' + x.feedId === id);
  if (savedFeed) return vmMine(savedFeed);
  for (const list of Object.values(feedData)) { const f = list.find(x => 'feed-' + x.id === id); if (f) return vmFeed(f); }
  return null;
}
const catOf = item => CATEGORIES[item.category] || CATEGORIES.personale;
const isFuture = item => item.target > Date.now();

/* ==========================================================================
   Markup
   ========================================================================== */
const UNITS = [['d', 'Giorni'], ['h', 'Ore'], ['m', 'Minuti'], ['s', 'Secondi']];
function timerHTML(target, size = 'sm', extra = '') {
  const p = parts(target - Date.now());
  return `<div class="timer timer-${size} ${extra}" data-target="${target}" role="timer">${UNITS.map(([u, l]) => `<div><span class="num" data-u="${u}">${pad(p[u])}</span><span class="lbl">${l}</span></div>`).join('')}</div>`;
}
function endedHTML(item) {
  return `<p class="timer-ended">${icon('check')} Concluso · ${esc(fmtShort(item.target, item.tz))}</p>`;
}
// La copertina disegnata fa da segnaposto: la foto entra in dissolvenza quando è pronta.
// focus = punto di ritaglio, così il soggetto resta visibile da poster verticale a fondale panoramico.
function mediaHTML(item, size = 'card') {
  const src = size === 'thumb' ? (item.poster || item.image) : (item.image || item.poster);
  const art = `<div class="art art--${COVERS[item.cover] ? item.cover : 'eclipse'}"></div>`;
  if (!src) return art;
  const focus = /^\d{1,3}% \d{1,3}%$/.test(item.focus || '') ? item.focus : '50% 30%';
  return `${art}<img src="${esc(src)}" alt="" loading="lazy" decoding="async" style="--focus:${focus}" />`;
}
function badgeHTML(item) {
  const r = item.target - Date.now();
  if (r <= 0) return '<span class="badge">Concluso</span>';
  if (r < DAY) return '<span class="badge badge-hot">Oggi</span>';
  if (r < 7 * DAY) return '<span class="badge badge-hot">Imminente</span>';
  if (item.repeat === 'yearly') return '<span class="badge">Ogni anno</span>';
  if (item.repeat === 'monthly') return '<span class="badge">Ogni mese</span>';
  return '<span></span>';
}
// Inizio dell’attesa: per i countdown che si ripetono è l’occorrenza precedente (il ciclo in corso,
// anche se il countdown è stato creato dopo); per gli altri è il momento della creazione.
function cycleStart(item) {
  const created = Date.parse(item.createdAt || '');
  if (item.repeat !== 'yearly' && item.repeat !== 'monthly') return created;
  const w = wallParts(item.target, item.tz);
  let [y, mo] = w.day.split('-').map(Number);
  const [h, mi] = w.time.split(':').map(Number);
  const wanted = Number(String(item.day || w.day).slice(8, 10));
  if (item.repeat === 'yearly') y -= 1; else if (--mo === 0) { mo = 12; y -= 1; }
  return zonedToUtc(y, mo, Math.min(wanted, new Date(y, mo, 0).getDate()), h, mi, item.tz);
}
function progressOf(item) {
  if (!item.createdAt || item.kind === 'curated') return null;
  const start = cycleStart(item);
  if (!(item.target > start)) return null;
  return clamp((Date.now() - start) / (item.target - start) * 100, 0, 100);
}
function cardHTML(item, { mode = 'explore', i = 0, feature = false } = {}) {
  const cat = catOf(item);
  const ended = !isFuture(item);
  const isMine = item.kind === 'custom' || (item.kind === 'feed' && mine.some(m => m.id === item.id));
  let topRight = '';
  if (mode !== 'preview') {
    if (item.kind === 'custom') topRight = `<button class="fav" type="button" data-act="pin" data-id="${esc(item.id)}" aria-pressed="${item.pinned}" aria-label="${item.pinned ? 'Togli dalla hero' : 'Mostra nella hero'}" title="${item.pinned ? 'Togli dalla hero' : 'Mostra nella hero'}">${icon('pin')}</button>`;
    else topRight = `<button class="fav" type="button" data-act="save" data-id="${esc(item.id)}" aria-pressed="${item.saved}" aria-label="${item.saved ? 'Rimuovi dalla lista' : 'Aggiungi alla lista'}: ${esc(item.title)}" title="${item.saved ? 'Nella tua lista' : 'Aggiungi alla lista'}">${icon('heart')}</button>`;
  }
  const prog = mode === 'mine' && !ended ? progressOf(item) : null;
  let actions = '';
  if (mode === 'mine') {
    const id = esc(item.id);
    actions = `<div class="card-actions">
      <button type="button" data-act="share" data-id="${id}" aria-label="Condividi" title="Condividi">${icon('share')}</button>
      <button type="button" data-act="ics" data-id="${id}" aria-label="Aggiungi al calendario" title="Aggiungi al calendario">${icon('cal')}</button>
      <button type="button" data-act="focus" data-id="${id}" aria-label="Schermo intero" title="Schermo intero">${icon('expand')}</button>
      <span class="spacer"></span>
      ${item.kind === 'custom' ? `<button type="button" data-act="edit" data-id="${id}" aria-label="Modifica" title="Modifica">${icon('edit')}</button><button type="button" data-act="dup" data-id="${id}" aria-label="Duplica" title="Duplica">${icon('copy')}</button>` : ''}
      <button type="button" class="danger" data-act="${isMine ? 'del' : 'save'}" data-id="${id}" aria-label="${isMine ? 'Elimina' : 'Rimuovi dalla lista'}" title="${isMine ? 'Elimina' : 'Rimuovi dalla lista'}">${icon(isMine ? 'trash' : 'x')}</button>
    </div>`;
  }
  return `<article class="card${feature ? ' card--feature' : ''}" style="--c:${cat.color};--i:${i}" data-card="${esc(item.id)}">
    <div class="card-media">${mediaHTML(item)}</div>
    ${mode === 'preview' ? '' : `<button class="card-hit" type="button" data-act="open" data-id="${esc(item.id)}" aria-label="Apri ${esc(item.title)}"></button>`}
    <div class="card-top">${badgeHTML(item)}${topRight}</div>
    <div class="card-body">
      ${feature ? `<p class="card-kicker">In primo piano · ${esc(fmtShort(item.target, item.precision === 'day' ? item.tz : USER_TZ))}</p>` : ''}
      <p class="card-cat">${icon(cat.icon)} ${esc(cat.label)}</p>
      <h3 class="card-title">${esc(item.title)}</h3>
      <p class="card-sub">${esc(item.sub || '')}</p>
      <div class="card-foot">${ended ? endedHTML(item) : timerHTML(item.target, 'sm')}${mode === 'explore' ? `<span class="card-go" aria-hidden="true">${icon('chev')}</span>` : ''}</div>
      ${prog != null ? `<div class="progress" title="${Math.round(prog)}% dell’attesa trascorsa"><span style="width:${prog.toFixed(1)}%"></span></div>` : ''}
      ${actions}
    </div>
  </article>`;
}

/* ==========================================================================
   Hero
   ========================================================================== */
function buildSlides() {
  const pinned = mine.map(vmMine).filter(i => i.pinned && isFuture(i)).sort((a, b) => a.target - b.target);
  const future = curatedItems().filter(isFuture).sort((a, b) => a.target - b.target);
  const featured = future.filter(e => e.featured);
  const list = [...pinned, ...featured];
  for (const e of future) { if (list.length >= 4) break; if (!list.includes(e)) list.push(e); }
  const fallback = mine.map(vmMine).filter(isFuture).sort((a, b) => a.target - b.target);
  slides = (list.length ? list : fallback).slice(0, 4).map(i => i.id);
  if (slideIdx >= slides.length) slideIdx = 0;
}
function renderPager() {
  const pager = $('#feature-pager');
  if (slides.length < 2) { pager.innerHTML = ''; return; }
  pager.innerHTML = `<span class="pager-n">${pad(slideIdx + 1)}</span>` +
    slides.map((id, i) => `<button type="button" role="tab" aria-selected="${i === slideIdx}" aria-label="Evento ${i + 1}: ${esc(getItem(id)?.title)}" data-slide="${i}"></button>`).join('') +
    `<span class="pager-n">${pad(slides.length)}</span>`;
}
const MOOD = { film: 'cinema', serie: 'cinema', anime: 'cinema', gaming: 'hud', tech: 'hud', musica: 'waves', sport: 'stadium', viaggi: 'landscape', personale: 'landscape', ricorrenze: 'landscape' };
const ORBIT = { cx: 1090, cy: 400, rx: 520, ry: 225 }; // parte e arriva in alto, gira attorno al timer
let orbitShown = 0, orbitAnim = 0;
// Quanto dell'attesa è già passato: dalla creazione per i tuoi countdown, su una finestra di 6 mesi per gli altri.
function waitProgress(item) {
  const left = item.target - Date.now();
  if (left <= 0) return 1;
  const start = item.kind === 'custom' ? cycleStart(item) : NaN;
  const span = start < item.target ? item.target - start : 180 * DAY;
  return clamp(1 - left / span, 0, 1);
}
function drawOrbit(p) {
  orbitShown = p;
  const a = p * Math.PI * 2;
  const x = ORBIT.cx + ORBIT.rx * Math.sin(a), y = ORBIT.cy - ORBIT.ry * Math.cos(a);
  $('#orbit-progress').setAttribute('stroke-dasharray', `${(p * 100).toFixed(3)} 100`);
  for (const id of ['#orbit-dot', '#orbit-glow']) { $(id).setAttribute('cx', x.toFixed(1)); $(id).setAttribute('cy', y.toFixed(1)); }
}
// L'unico movimento continuo della hero: il puntino avanza verso l'evento.
function setOrbit(p, animate) {
  cancelAnimationFrame(orbitAnim);
  orbitAnim = 0;
  if (!animate || reducedMotion()) return drawOrbit(p);
  const from = orbitShown, start = performance.now(), dur = 1400;
  const step = now => {
    const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
    drawOrbit(from + (p - from) * e);
    orbitAnim = t < 1 ? requestAnimationFrame(step) : 0;
  };
  orbitAnim = requestAnimationFrame(step);
}
function featureProgressText(item) {
  const p = waitProgress(item);
  return item.kind === 'custom' && item.createdAt ? `<b>${Math.round(p * 100)}%</b> dell’attesa alle spalle` : `<b>${relative(item.target).replace(/^tra /, '')}</b> all’evento`;
}
function showSlide(i, animate = true) {
  if (!slides.length) {
    $('#feature-title').textContent = 'Il tuo prossimo momento';
    $('#feature-kicker').textContent = 'Nessun evento in programma';
    $('#feature-date').textContent = 'Crea un countdown per iniziare.';
    $('#feature-timer').dataset.target = '0';
    $('#feature-save').hidden = true; $('#feature-open').hidden = true;
    return;
  }
  slideIdx = (i + slides.length) % slides.length;
  const item = getItem(slides[slideIdx]);
  if (!item) return;
  const hero = $('.hero');
  const apply = () => {
    const cat = catOf(item);
    hero.style.setProperty('--scene', item.kind === 'custom' ? 'var(--accent)' : cat.color);
    hero.dataset.mood = MOOD[item.category] || 'landscape';
    const img = $('#scene-image');
    if (item.image) {
      img.style.setProperty('--scene-img', `url("${item.image.replace(/"/g, '%22')}")`);
      img.style.setProperty('--scene-pos', /^\d{1,3}% \d{1,3}%$/.test(item.focus || '') ? item.focus : '50% 30%');
      img.classList.add('is-on');
    } else img.classList.remove('is-on');
    $('#feature-progress').innerHTML = featureProgressText(item);
    setOrbit(waitProgress(item), true);
    $('#feature-kicker').textContent = item.kind === 'custom' ? 'Il tuo countdown' : (slideIdx === 0 ? 'Prossimo evento' : 'In evidenza') + ' · ' + cat.label;
    $('#feature-title').textContent = item.title;
    $('#feature-date').textContent = fmtDate(item.target, { tz: item.precision === 'day' ? item.tz : USER_TZ, precision: item.precision === 'day' ? 'day' : 'time' }) + (item.precision === 'approx' ? ' · orario indicativo' : '');
    const timer = $('#feature-timer');
    timer.dataset.target = item.target;
    tickTimer(timer, false);
    const save = $('#feature-save');
    save.hidden = item.kind === 'custom';
    save.dataset.id = item.id;
    save.classList.toggle('is-on', item.saved);
    save.querySelector('span').textContent = item.saved ? 'Nella tua lista' : 'Aggiungi alla lista';
    save.querySelector('use').setAttribute('href', item.saved ? '#i-check' : '#i-plus');
    $('#feature-open').hidden = false;
    $('#feature-open').dataset.id = item.id;
    renderPager();
  };
  // Cambio evento: la tendina copre il fondale, a metà corsa cambiano immagine e titolo.
  if (animate && !reducedMotion()) {
    hero.classList.remove('is-cut'); void hero.offsetWidth; hero.classList.add('is-cut');
    setTimeout(apply, 430);
    setTimeout(() => hero.classList.remove('is-cut'), 1000);
  } else apply();
}
function renderHero() {
  const current = slides[slideIdx];
  buildSlides();
  const keep = slides.indexOf(current);
  slideIdx = keep >= 0 ? keep : 0;
  showSlide(slideIdx, false);
  $('#stat-events').textContent = curatedItems().filter(isFuture).length + feedItems(['film', 'serie', 'anime', 'giochi']).filter(isFuture).length;
}
function startSlideshow() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => {
    if (heroPaused || document.hidden || reducedMotion() || slides.length < 2) return;
    showSlide(slideIdx + 1);
  }, 9000);
}
function buildStars() {
  const g = $('#stars');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let html = '';
  for (let i = 0; i < 110; i++) {
    const x = rnd() * 1600, y = rnd() * 620, r = rnd() * 1.2 + .3, o = rnd() * .6 + .25;
    html += `<circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
  }
  g.innerHTML = html;
}

/* ==========================================================================
   Eventi in evidenza
   ========================================================================== */
function renderExplore(animate = false) {
  const items = curatedItems().filter(isFuture).sort((a, b) => a.target - b.target);
  const counts = {};
  items.forEach(i => counts[i.category] = (counts[i.category] || 0) + 1);
  if (exploreFilter !== 'all' && !counts[exploreFilter]) exploreFilter = 'all';
  $('#event-chips').innerHTML = `<button class="chip" type="button" role="tab" data-filter="all" aria-selected="${exploreFilter === 'all'}">Tutti <span class="count">${items.length}</span></button>` +
    Object.keys(CATEGORIES).filter(k => counts[k]).map(k => `<button class="chip" type="button" role="tab" data-filter="${k}" style="--c:${CATEGORIES[k].color}" aria-selected="${exploreFilter === k}">${icon(CATEGORIES[k].icon)} ${esc(CATEGORIES[k].label)} <span class="count">${counts[k]}</span></button>`).join('');
  const list = items.filter(i => exploreFilter === 'all' || i.category === exploreFilter);
  // Una scheda grande + 8 compatte riempiono la griglia senza buchi (4, 3 o 2 colonne).
  const shown = exploreExpanded ? list : list.slice(0, 9);
  const box = $('#event-cards');
  box.classList.toggle('settled', !animate);
  box.innerHTML = shown.map((item, i) => cardHTML(item, { i, feature: i === 0 && shown.length >= 5 })).join('') ||
    '<p class="muted">Nessun evento in arrivo in questa categoria.</p>';
  if (list.length > 9) box.insertAdjacentHTML('beforeend', `<div class="cards-more"><button class="btn btn-outline btn-sm" type="button" id="explore-more">${exploreExpanded ? 'Mostra meno' : `Mostra tutti (${list.length})`}</button></div>`);
}

// "Presto": pochi eventi imminenti da tutte le fonti, in ordine di data (max 3 per tipo, così nessuno domina).
function soonItems() {
  const limit = Date.now() + 14 * DAY, perType = {};
  return Object.keys(FEEDS).filter(t => t !== 'presto').flatMap(t => feedItems([t]).filter(i => isFuture(i) && i.target <= limit && (t !== 'anime' || i.group === 'nuove' || i.target < Date.now() + 2 * DAY)).map(i => ({ ...i, feedType: t })))
    .sort((a, b) => a.target - b.target)
    .filter(i => (perType[i.feedType] = (perType[i.feedType] || 0) + 1) <= 3)
    .slice(0, 16);
}
function shelfList() {
  if (shelfType === 'presto') return soonItems();
  let list = feedItems([shelfType]).filter(isFuture);
  if (shelfType === 'anime') list = list.filter(i => i.group === animeGroup);
  if (shelfType === 'giochi' && platformFilter !== 'all') list = list.filter(i => i.platforms.some(p => PLATFORM_GROUPS[platformFilter].test(p)));
  return list.sort((a, b) => a.target - b.target).slice(0, 30);
}
function shelfSubTabs() {
  if (shelfType === 'anime') {
    const n = g => feedItems(['anime']).filter(i => isFuture(i) && i.group === g).length;
    return [['nuove', `Nuove serie · ${n('nuove')}`], ['episodi', `Prossimi episodi · ${n('episodi')}`]].map(([k, l]) => `<button class="chip" type="button" data-anime-group="${k}" aria-selected="${animeGroup === k}">${l}</button>`).join('');
  }
  if (shelfType === 'giochi') {
    return ['all', ...Object.keys(PLATFORM_GROUPS)].map(k => `<button class="chip" type="button" data-platform="${k}" aria-selected="${platformFilter === k}">${k === 'all' ? 'Tutte le piattaforme' : k}</button>`).join('');
  }
  return '';
}
let feedState = 'loading'; // 'loading' | 'ready' | 'error' | 'offline'
function renderShelfState() {
  const block = $('#cinema-block'), shelf = $('#cinema-shelf');
  block.hidden = false;
  $('#shelf-tabs').innerHTML = '';
  $('#shelf-sub').hidden = true;
  $('#shelf-note').textContent = '';
  $('#shelf-source').textContent = '';
  shelf.setAttribute('aria-busy', String(feedState === 'loading'));
  if (feedState === 'loading') {
    $('#shelf-title').textContent = 'Sto cercando le prossime uscite…';
    shelf.innerHTML = Array.from({ length: 7 }, () => '<article class="poster is-skel" aria-hidden="true"><div class="poster-img"></div><h4>&nbsp;</h4><p>&nbsp;</p></article>').join('');
    return;
  }
  $('#shelf-title').textContent = feedState === 'offline' ? 'Uscite non disponibili' : 'Le uscite non hanno risposto';
  shelf.innerHTML = `<div class="state-box" role="status">
    <span class="state-icon" aria-hidden="true">${icon(feedState === 'offline' ? 'link' : 'clock')}</span>
    <div><b>${feedState === 'offline' ? 'Serve il server locale.' : 'Nessuna fonte ha risposto.'}</b>
    <p class="muted small">${feedState === 'offline' ? 'Apri il sito con START.bat per vedere film, serie, anime, concerti e sport in arrivo. I tuoi countdown funzionano comunque.' : 'Può succedere se la connessione è assente o un servizio è momentaneamente lento. I tuoi countdown funzionano comunque.'}</p></div>
    ${feedState === 'error' ? `<button class="btn btn-outline btn-sm" type="button" id="feeds-retry">Riprova</button>` : ''}
  </div>`;
}
function renderShelf(animate = false) {
  const block = $('#cinema-block');
  const available = Object.keys(FEEDS).filter(t => t === 'presto' ? soonItems().length : feedData[t].some(f => vmFeed(f).target > Date.now()));
  if (!available.length && feedState !== 'ready') return renderShelfState();
  $('#cinema-shelf').setAttribute('aria-busy', 'false');
  block.hidden = !available.length;
  if (!available.length) return;
  if (!available.includes(shelfType)) shelfType = available[0];
  $('#shelf-title').textContent = FEEDS[shelfType].title;
  const first = shelfType === 'presto' ? null : feedData[shelfType][0];
  $('#shelf-source').textContent = first?.source?.label ? 'dati ' + first.source.label + (shelfType === 'anime' ? ' + TMDb' : '') : shelfType === 'presto' ? 'tutte le fonti' : '';
  $('#shelf-tabs').innerHTML = available.map(t => `<button type="button" data-shelf-type="${t}" aria-pressed="${t === shelfType}">${esc(FEEDS[t].label)}</button>`).join('');
  const tabs = $('#shelf-tabs'), activeTab = $('[aria-pressed="true"]', tabs);
  if (activeTab) tabs.scrollLeft = activeTab.offsetLeft - (tabs.clientWidth - activeTab.offsetWidth) / 2;
  const sub = shelfSubTabs();
  $('#shelf-sub').innerHTML = sub;
  $('#shelf-sub').hidden = !sub;
  $('#shelf-note').textContent = shelfType === 'anime' ? 'Orari previsti per la messa in onda in Giappone (fonte AniList): in Italia possono arrivare più tardi. Gli episodi compaiono solo nei 7 giorni prima.' : '';
  const list = shelfList();
  const shelf = $('#cinema-shelf');
  shelf.classList.toggle('settled', !animate);
  if (animate) shelf.scrollLeft = 0;
  shelf.innerHTML = list.length ? list.map(m => `<article class="poster" style="--c:${catOf(m).color}">
    <div class="poster-img">${mediaHTML({ ...m, image: m.poster || m.image, poster: '' })}<span class="status status--${m.status}">${STATUS[m.status]}</span></div>
    <button class="poster-open" type="button" data-act="open" data-id="${esc(m.id)}" aria-label="Apri ${esc(m.title)}"></button>
    <button class="fav" type="button" data-act="save" data-id="${esc(m.id)}" aria-pressed="${m.saved}" aria-label="${m.saved ? 'Rimuovi dalla lista' : 'Aggiungi alla lista'}: ${esc(m.title)}">${icon('heart')}</button>
    ${shelfType === 'presto' ? `<span class="poster-cat">${icon(catOf(m).icon)} ${esc(catOf(m).label)}</span>` : ''}
    <h4 title="${esc(m.title)}">${esc(m.title)}</h4>
    <p>${esc(m.precision === 'day' ? fmtShort(m.target, m.tz) : fmtWhen(m.target))} · ${esc(relative(m.target))}</p>
  </article>`).join('') : '<p class="shelf-msg">Nessuna uscita con questi filtri.</p>';
}

/* ==========================================================================
   Timeline
   ========================================================================== */
function timelineRow(item) {
  const cat = catOf(item);
  const d = new Date(item.target);
  const tz = item.precision === 'day' ? item.tz : USER_TZ;
  const day = new Intl.DateTimeFormat('it-IT', { day: '2-digit', timeZone: tz }).format(d);
  const wd = new Intl.DateTimeFormat('it-IT', { weekday: 'short', timeZone: tz }).format(d);
  const r = item.target - Date.now();
  const p = parts(r);
  const left = r <= 0 ? `<span class="tl-left">—<small>concluso</small></span>` : p.d > 0 ? `<span class="tl-left">${p.d}<small>${p.d === 1 ? 'giorno' : 'giorni'}</small></span>` : `<span class="tl-left">${pad(p.h)}:${pad(p.m)}<small>ore</small></span>`;
  return `<div class="tl-item" style="--c:${cat.color}">
    <div class="tl-date"><b>${day}</b><span>${esc(wd)}</span></div>
    <div class="tl-thumb">${mediaHTML(item, 'thumb')}</div>
    <div class="tl-copy"><h3>${esc(item.title)}</h3><p>${icon(cat.icon)} ${esc(cat.label)}${item.kind === 'custom' || (item.kind === 'feed' && mine.some(m => m.id === item.id)) || item.saved ? ' <span class="tl-mine">nella tua lista</span>' : ''}</p></div>
    ${left}
    <button class="tl-hit" type="button" data-act="open" data-id="${esc(item.id)}" aria-label="Apri ${esc(item.title)}"></button>
  </div>`;
}
function renderTimeline() {
  $$('#period-filter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === prefs.period)));
  $('#timeline-mine').checked = prefs.timelineMine;
  $('#timeline-holidays').checked = prefs.timelineHolidays;
  let items = curatedItems();
  const ids = new Set(items.map(i => i.id));
  if (prefs.timelineMine) items = items.concat(mine.map(vmMine).filter(i => !ids.has(i.id) && ids.add(i.id)));
  if (prefs.timelineHolidays) items = items.concat(feedItems(['feste']).filter(i => !ids.has(i.id)));
  const now = Date.now();
  const limit = prefs.period === 'all' ? Infinity : now + Number(prefs.period) * DAY;
  const future = items.filter(i => i.target > now && i.target <= limit).sort((a, b) => a.target - b.target);
  const past = curatedItems().filter(i => i.target <= now).sort((a, b) => b.target - a.target);
  const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  let html = '', lastMonth = '';
  for (const item of future) {
    const m = monthFmt.format(item.target);
    if (m !== lastMonth) { html += `<p class="tl-month">${esc(m)}</p>`; lastMonth = m; }
    html += timelineRow(item);
  }
  $('#timeline-items').innerHTML = html || `<div class="state-box"><span class="state-icon" aria-hidden="true">${icon('cal')}</span><div><b>Niente in questo periodo.</b><p class="muted small">Prova un intervallo più ampio${prefs.timelineMine ? '' : ' o includi i tuoi countdown'}.</p></div>${prefs.period !== 'all' ? '<button class="btn btn-outline btn-sm" type="button" data-period-all>Mostra tutto</button>' : ''}</div>`;
  $('#timeline-count').textContent = `${future.length} ${future.length === 1 ? 'evento' : 'eventi'} ${prefs.period === 'all' ? 'in arrivo' : `nei prossimi ${prefs.period === '365' ? '12 mesi' : prefs.period === '90' ? '3 mesi' : '30 giorni'}`}`;
  $('#past-curated').hidden = !past.length;
  $('#past-count').textContent = past.length;
  $('#past-items').innerHTML = past.map(timelineRow).join('');
  updateTimelineProgress();
}
function updateTimelineProgress() {
  const tl = $('#timeline');
  const r = tl.getBoundingClientRect();
  const mid = innerHeight * .62;
  $('#timeline-progress').style.height = clamp((mid - r.top) / Math.max(1, r.height), 0, 1) * 100 + '%';
  $$('#timeline-items .tl-item').forEach(el => el.classList.toggle('is-lit', el.getBoundingClientRect().top + 20 < mid));
}

/* ==========================================================================
   I miei countdown
   ========================================================================== */
function renderMine(animate = false) {
  const all = mineItems();
  const q = $('#mine-search').value.trim().toLowerCase();
  const cats = [...new Set(all.map(i => i.category))];
  const sel = $('#mine-category');
  if (mineFilter !== 'all' && !cats.includes(mineFilter)) mineFilter = 'all';
  sel.innerHTML = `<option value="all">Tutte le categorie</option>` + cats.map(c => `<option value="${c}" ${c === mineFilter ? 'selected' : ''}>${esc(CATEGORIES[c].label)}</option>`).join('');
  const filtered = all.filter(i => (mineFilter === 'all' || i.category === mineFilter) && (!q || `${i.title} ${i.sub} ${catOf(i).label}`.toLowerCase().includes(q)));
  const sort = $('#mine-sort').value;
  const sorter = sort === 'title' ? (a, b) => a.title.localeCompare(b.title, 'it') : sort === 'created' ? (a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) : (a, b) => a.target - b.target;
  const future = filtered.filter(isFuture).sort(sorter);
  const past = filtered.filter(i => !isFuture(i)).sort((a, b) => b.target - a.target);

  $$('.view-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view)));
  const cards = $('#mine-cards'), cal = $('#mine-calendar'), empty = $('#mine-empty');
  cards.dataset.view = prefs.view;
  $('#past-mine-items').dataset.view = prefs.view === 'list' ? 'list' : 'grid';
  cards.classList.toggle('settled', !animate);
  cards.hidden = prefs.view === 'calendar' || !future.length;
  cal.hidden = prefs.view !== 'calendar';
  empty.hidden = future.length > 0 || prefs.view === 'calendar';

  if (!future.length) {
    if (q || mineFilter !== 'all') { $('#empty-title').textContent = 'Nessun countdown trovato.'; $('#empty-copy').textContent = 'Prova un’altra ricerca o un’altra categoria.'; $('#templates').hidden = true; }
    else if (past.length) { $('#empty-title').textContent = 'Tutti i tuoi countdown sono arrivati.'; $('#empty-copy').textContent = 'Li trovi qui sotto tra i conclusi. Pronto per la prossima attesa?'; $('#templates').hidden = false; }
    else { $('#empty-title').textContent = 'La prossima attesa comincia qui.'; $('#empty-copy').textContent = 'Tocca il cuore su un evento qui sopra, oppure parti da un’idea:'; $('#templates').hidden = false; }
  }
  cards.innerHTML = future.map((item, i) => cardHTML(item, { mode: 'mine', i })).join('');
  if (prefs.view === 'calendar') renderCalendar(filtered);

  $('#mine-count').textContent = all.length ? `${future.length} ${future.length === 1 ? 'countdown attivo' : 'countdown attivi'}${filtered.length !== all.length ? ` · filtrati su ${all.length}` : ''}` : '';
  $('#past-mine').hidden = !past.length;
  $('#past-mine-count').textContent = past.length;
  $('#past-mine-items').innerHTML = past.map((item, i) => cardHTML(item, { mode: 'mine', i })).join('');

  const activeCount = all.filter(isFuture).length;
  $('#nav-count').hidden = !activeCount;
  $('#nav-count').textContent = activeCount;
}
function renderCalendar(items) {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7, start = new Date(y, m, 1 - offset);
  const map = new Map();
  items.forEach(i => { const d = new Date(i.target); const k = d.toDateString(); if (!map.has(k)) map.set(k, []); map.get(k).push(i); });
  let html = `<div class="cal-head"><h3>${esc(new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(first))}</h3><div>
    <button class="icon-btn" type="button" data-cal="-1" aria-label="Mese precedente">${icon('chev-l')}</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal="0">Oggi</button>
    <button class="icon-btn" type="button" data-cal="1" aria-label="Mese successivo">${icon('chev')}</button></div></div><div class="cal-grid">`;
  html += ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => `<div class="cal-wd">${d}</div>`).join('');
  const today = new Date().toDateString();
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const evs = map.get(d.toDateString()) || [];
    html += `<div class="cal-day ${d.getMonth() !== m ? 'is-out' : ''} ${d.toDateString() === today ? 'is-today' : ''}"><span>${d.getDate()}</span>` +
      evs.slice(0, 3).map(e => `<button class="cal-ev" type="button" style="--c:${catOf(e).color}" data-act="open" data-id="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</button>`).join('') +
      (evs.length > 3 ? `<span class="cal-more">+${evs.length - 3}</span>` : '') + '</div>';
  }
  $('#mine-calendar').innerHTML = html + '</div>';
}

function renderAll(animate = false) {
  renderHero();
  renderExplore(animate);
  renderShelf(animate);
  renderTimeline();
  renderMine(animate);
  if (openDetailId && $('#detail').open) renderDetail(openDetailId);
}

/* ==========================================================================
   Timer
   ========================================================================== */
function setNum(n, value, animate) {
  if (n.dataset.v === value) return;
  const old = n.dataset.v;
  n.dataset.v = value;
  if (!n.closest('.roll')) { n.textContent = value; return; }
  if (old == null || n.children.length !== value.length || !animate || reducedMotion()) {
    n.innerHTML = [...value].map(c => `<span class="dg">${c}</span>`).join('');
    return;
  }
  [...value].forEach((c, i) => {
    if (old[i] === c) return;
    const d = n.children[i];
    d.textContent = c;
    d.classList.remove('roll-in'); void d.offsetWidth; d.classList.add('roll-in');
  });
}
function tickTimer(node, animate = true) {
  const target = Number(node.dataset.target);
  const p = parts(target - Date.now());
  for (const n of node.querySelectorAll('.num')) setNum(n, String(p[n.dataset.u]).padStart(Number(n.dataset.pad) || 2, '0'), animate);
  return target - Date.now();
}
let needsRefresh = false;
function tick() {
  const now = Date.now();
  for (const node of $$('[data-target]')) {
    const rem = tickTimer(node, true);
    if (rem <= 0 && Number(node.dataset.target) > 0 && !node.dataset.done) { node.dataset.done = '1'; needsRefresh = true; }
  }
  // Promemoria, suoni e "è il momento" per i countdown della tua lista
  for (const item of mineItems()) {
    const rem = item.target - now;
    const key = item.id + ':' + item.target;
    const prev = prevRemaining.get(key);
    prevRemaining.set(key, rem);
    if (prev == null) continue;
    for (const [code, thr, label] of [['1d', DAY, 'Manca un giorno'], ['1h', HOUR, 'Manca un’ora']]) {
      if (item.reminders?.includes(code) && prev > thr && rem <= thr) systemNotify(`${label}: ${item.title}`, fmtDate(item.target, { tz: USER_TZ, precision: item.precision === 'day' ? 'day' : 'time' }), item.id);
    }
    if (prev > 0 && rem <= 0) {
      if (item.sound) chime();
      if (item.reminders?.includes('0')) systemNotify(`È il momento: ${item.title}`, 'Il countdown è arrivato a zero.', item.id);
      celebrate(item);
    }
  }
  if (focusId) {
    const item = getItem(focusId);
    if (item && item.target - now <= 0 && !$('#focus').dataset.done) { $('#focus').dataset.done = '1'; }
  }
  if (needsRefresh) { needsRefresh = false; renderAll(); }
  // L'orbita avanza davvero, un passo al secondo.
  const current = slides.length && getItem(slides[slideIdx]);
  if (current && !orbitAnim) drawOrbit(waitProgress(current));
  if (current && now % 15000 < 1000) $('#feature-progress').innerHTML = featureProgressText(current);
  if (now % 60000 < 1000) renderTimeline();
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}
function systemNotify(title, body, id) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: 'tc-' + id, icon: 'assets/favicon.svg' }); return; } catch {}
  }
  toast(title);
}
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18, .36].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = [660, 880, 1320][i];
      g.gain.setValueAtTime(.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + t + .03);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .6);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}
function celebrate(item) {
  $('#celebrate-text').textContent = `${item.title} è arrivato. Goditelo.`;
  $('#celebrate').hidden = false;
  $('#celebrate-close').focus();
}

/* ==========================================================================
   Dettaglio
   ========================================================================== */
function renderDetail(id) {
  const item = getItem(id);
  if (!item) return false;
  openDetailId = id;
  const cat = catOf(item);
  const ended = !isFuture(item);
  const showTz = item.precision === 'day' ? item.tz : USER_TZ;
  const facts = [];
  facts.push(['Data', fmtDate(item.target, { tz: showTz, precision: item.precision === 'day' ? 'day' : 'time' }) + (item.precision === 'approx' ? ' (orario indicativo)' : '')]);
  if (item.precision !== 'day' && item.tz && item.tz !== USER_TZ) facts.push([`Ora locale · ${tzLabel(item.tz)}`, fmtDate(item.target, { tz: item.tz, weekday: false })]);
  if (item.precision === 'day' && item.tz !== USER_TZ) facts.push(['Fuso di riferimento', tzLabel(item.tz)]);
  if (item.repeat && item.repeat !== 'none') facts.push(['Ripetizione', item.repeat === 'yearly' ? 'Ogni anno' : 'Ogni mese']);
  if (item.kind === 'feed' && STATUS[item.status]) facts.push(['Stato', STATUS[item.status] + (item.status === 'prevista' ? ' · può cambiare' : '')]);
  if (item.source) facts.push(['Fonte', `<a href="${esc(item.source.url)}" target="_blank" rel="noopener noreferrer">${esc(item.source.label)} ${icon('link')}</a>`, true]);
  const imageCredit = item.credit && item.credit.label !== item.source?.label ? item.credit : null;
  if (imageCredit && item.image) facts.push(['Immagine', creditHTML(imageCredit), true]);
  if (item.kind === 'custom' && item.reminders?.length) facts.push(['Promemoria', item.reminders.map(r => ({ '1d': '1 giorno prima', '1h': '1 ora prima', '0': 'al momento' })[r]).join(', ')]);

  const prog = progressOf(item);
  const isShared = sharedItem && sharedItem.id === id;
  const isMine = item.kind === 'custom' || (item.kind === 'feed' && mine.some(m => m.id === item.id));
  const sid = esc(item.id);
  let primary = '';
  if (isShared) primary = `<button class="btn btn-primary" type="button" data-act="adopt" data-id="${sid}">${icon('plus')} Aggiungi ai miei countdown</button>`;
  else if (item.kind === 'curated' || (item.kind === 'feed' && !mine.some(m => m.id === item.id))) primary = `<button class="btn ${item.saved ? 'btn-outline is-on' : 'btn-primary'}" type="button" data-act="save" data-id="${sid}">${icon(item.saved ? 'check' : 'plus')} ${item.saved ? 'Nella tua lista' : 'Aggiungi alla lista'}</button>`;

  $('#detail-body').innerHTML = `
    <div class="detail-hero" style="--c:${cat.color}">
      <div class="card-media">${mediaHTML(item)}</div>
      <button class="icon-btn detail-close" type="button" data-close aria-label="Chiudi">${icon('x')}</button>
      <p class="card-cat">${icon(cat.icon)} ${esc(cat.label)}${isShared ? ' · condiviso con te' : ''}</p>
      <h2 id="detail-title">${esc(item.title)}</h2>
      ${item.kind === 'custom' ? (item.personalNote ? `<p>${esc(item.personalNote)}</p>` : '') : `<p>${esc(item.tagline || item.sub || '')}</p>`}
    </div>
    <div class="detail-main" style="--c:${cat.color}">
      ${ended ? `<div class="detail-ended"><b>${item.repeat && item.repeat !== 'none' ? 'È il momento!' : 'Questo evento è già arrivato.'}</b><span class="muted">${esc(fmtDate(item.target, { tz: showTz, precision: item.precision === 'day' ? 'day' : 'time' }))}</span></div>` : timerHTML(item.target, 'xl', 'detail-timer roll')}
      ${prog != null && !ended ? `<div class="detail-progress"><p><span>Attesa trascorsa</span><span>${Math.round(prog)}%</span></p><div class="progress"><span style="width:${prog.toFixed(1)}%"></span></div></div>` : ''}
      <dl class="detail-facts">${facts.map(([k, v, raw]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join('')}</dl>
      ${item.note ? `<p class="detail-note">${icon('clock')}<span>${esc(item.note)}</span></p>` : ''}
      <div class="detail-actions">
        ${primary}
        <button class="btn btn-outline" type="button" data-act="share" data-id="${sid}">${icon('share')} Condividi</button>
        <button class="btn btn-outline" type="button" data-act="ics" data-id="${sid}">${icon('cal')} Calendario</button>
        ${ended ? '' : `<button class="btn btn-outline" type="button" data-act="focus" data-id="${sid}">${icon('expand')} Schermo intero</button>`}
        <span class="spacer"></span>
        ${item.kind === 'custom' && !isShared ? `<button class="icon-btn" type="button" data-act="edit" data-id="${sid}" aria-label="Modifica" title="Modifica">${icon('edit')}</button><button class="icon-btn" type="button" data-act="dup" data-id="${sid}" aria-label="Duplica" title="Duplica">${icon('copy')}</button>` : ''}
        ${isMine && !isShared ? `<button class="icon-btn" type="button" data-act="del" data-id="${sid}" aria-label="Elimina" title="Elimina">${icon('trash')}</button>` : ''}
      </div>
    </div>`;
  return true;
}
function openDetail(id) {
  if (!renderDetail(id)) return;
  const d = $('#detail');
  if (!d.open) d.showModal();
  $('.detail-close', d).focus();
}

/* ==========================================================================
   Azioni
   ========================================================================== */
function toggleSave(id) {
  const item = getItem(id);
  if (!item) return;
  if (item.kind === 'curated') {
    if (saved.has(id)) { saved.delete(id); toast('Rimosso dalla tua lista.', { label: 'Annulla', fn: () => toggleSave(id) }); }
    else { saved.add(id); toast('Aggiunto alla tua lista.', { label: 'Vedi', fn: () => $('#miei').scrollIntoView() }); }
    persistSaved();
  } else if (item.kind === 'feed') {
    const existing = mine.find(m => m.feedId === item.feedId);
    if (existing) { mine = mine.filter(m => m !== existing); toast('Rimosso dalla tua lista.'); }
    else {
      const wall = item.precision === 'day' ? { day: item.day, time: '00:00' } : wallParts(item.target, item.tz);
      mine.push(sanitizeMine({ id: 'feed-' + item.feedId, kind: 'feed', feedId: item.feedId, title: item.title, note: item.sub, category: item.category, day: wall.day, time: wall.time, tz: item.tz, precision: item.precision, credit: item.credit, cover: item.cover, image: item.image, poster: item.poster, source: item.source, feedNote: item.note, createdAt: new Date().toISOString() }));
      toast('Aggiunto alla tua lista.', { label: 'Vedi', fn: () => $('#miei').scrollIntoView() });
    }
    persistMine();
  }
  renderAll();
  const btn = $(`.fav[data-id="${CSS.escape(id)}"]`);
  if (btn && !reducedMotion()) btn.classList.add('pop');
}
function togglePin(id) {
  const m = mine.find(x => x.id === id);
  if (!m) return;
  m.pinned = !m.pinned;
  persistMine();
  if (m.pinned) { slides = []; slideIdx = 0; }
  renderAll();
  toast(m.pinned ? 'Lo vedrai nella hero in apertura.' : 'Tolto dalla hero.');
}
function duplicate(id) {
  const m = mine.find(x => x.id === id);
  if (!m) return;
  const copy = { ...m, id: 'c-' + uid(), title: (m.title + ' (copia)').slice(0, 80), pinned: false, createdAt: new Date().toISOString() };
  mine.push(copy);
  persistMine(); renderAll();
  toast('Countdown duplicato.', { label: 'Modifica', fn: () => openCreator({ edit: copy }) });
}
async function remove(id) {
  const m = mine.find(x => x.id === id);
  if (!m) return;
  const ok = await confirmDialog(`Eliminare “${m.title}”?`, 'Il countdown verrà rimosso da questo browser.');
  if (!ok) return;
  const index = mine.indexOf(m);
  mine = mine.filter(x => x !== m);
  persistMine();
  if ($('#detail').open && openDetailId === id) $('#detail').close();
  renderAll();
  toast('Countdown eliminato.', { label: 'Annulla', fn: () => { mine.splice(index, 0, m); persistMine(); renderAll(); } });
}
function confirmDialog(title, text) {
  return new Promise(resolve => {
    const d = $('#confirm');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    const done = v => { d.close(); resolve(v); };
    $('[data-confirm="yes"]', d).onclick = () => done(true);
    $('[data-confirm="no"]', d).onclick = () => done(false);
    d.oncancel = () => resolve(false);
    d.showModal();
    $('[data-confirm="no"]', d).focus();
  });
}

/* ---------- Condivisione ---------- */
// Serve ancora per aprire i link creati con la versione precedente (index.html#c=…).
const fromB64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
/* ---------- Schermata "Condividi" ---------- */
const shareState = { id: null, format: 'story', drawing: 0 };
function currentShareUrl() {
  const item = getItem(shareState.id);
  return item ? sharePageUrl(encodeShare(item, { includeNote: $('#share-note').checked })) : '';
}
function updateShareLink() {
  const url = currentShareUrl();
  $('#share-link').value = url;
  $('#share-open').href = url;
  if (!$('#share-qr').hidden) $('#share-qr').innerHTML = qrSvg(url) + '<p class="muted small">Inquadralo con la fotocamera del telefono.</p>';
}
async function drawShareCard() {
  const item = getItem(shareState.id);
  if (!item) return;
  const job = ++shareState.drawing;
  const cat = catOf(item);
  $$('#share-formats button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.format === shareState.format)));
  $('#share-canvas-wrap').dataset.format = shareState.format;
  $('#share-canvas-wrap').classList.add('is-drawing');
  const off = document.createElement('canvas');
  await renderCard(off, {
    title: item.title, categoryLabel: cat.label, color: item.kind === 'custom' ? prefs.accent : cat.color, image: item.image || '', target: item.target,
    dateText: fmtDate(item.target, { tz: item.precision === 'day' ? item.tz : USER_TZ, precision: item.precision === 'day' ? 'day' : 'time' }),
  }, shareState.format);
  if (job !== shareState.drawing) return;
  const c = $('#share-canvas');
  c.width = off.width; c.height = off.height;
  c.getContext('2d').drawImage(off, 0, 0);
  $('#share-canvas-wrap').classList.remove('is-drawing');
}
function share(id) {
  const item = getItem(id);
  if (!item) return;
  shareState.id = id;
  $('#share-title').textContent = item.title;
  $('#share-note-row').hidden = !(item.kind === 'custom' && item.personalNote);
  $('#share-note').checked = false;
  $('#share-qr').hidden = true;
  $('#share-qr-btn').setAttribute('aria-expanded', 'false');
  $('#share-send').hidden = !navigator.share;
  updateShareLink();
  if ($('#detail').open) $('#detail').close();
  $('#share').showModal();
  drawShareCard();
}
function shareCanvasBlob() {
  return new Promise(resolve => $('#share-canvas').toBlob(resolve, 'image/png'));
}
function bindShare() {
  $('#share-formats').addEventListener('click', e => { const b = e.target.closest('[data-format]'); if (!b) return; shareState.format = b.dataset.format; drawShareCard(); });
  $('#share-note').addEventListener('change', updateShareLink);
  $('#share-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#share-link').value); toast('Link copiato negli appunti.'); }
    catch { $('#share-link').select(); toast('Seleziona il link e copialo.'); }
  });
  $('#share-send').addEventListener('click', async () => {
    const item = getItem(shareState.id);
    const url = $('#share-link').value;
    try {
      const blob = await shareCanvasBlob();
      const file = blob && new File([blob], slug(item.title) + '.png', { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: item.title, text: `${item.title} · ${relative(item.target)}`, url, files: [file] });
      else await navigator.share({ title: item.title, text: `${item.title} · ${relative(item.target)}`, url });
    } catch (e) { if (e.name !== 'AbortError') toast('Invio non riuscito: copia il link.'); }
  });
  $('#share-download').addEventListener('click', async () => {
    const item = getItem(shareState.id);
    const blob = await shareCanvasBlob();
    if (!blob) return toast('Non riesco a creare l’immagine.');
    saveBlob(blob, `${slug(item.title)}-${shareState.format}.png`);
    toast(`Immagine ${CARD_FORMATS[shareState.format].label} scaricata.`);
  });
  $('#share-ics').addEventListener('click', () => downloadIcs(shareState.id));
  $('#share-qr-btn').addEventListener('click', () => {
    const box = $('#share-qr');
    box.hidden = !box.hidden;
    $('#share-qr-btn').setAttribute('aria-expanded', String(!box.hidden));
    updateShareLink();
  });
  $('#share-focus').addEventListener('click', () => { $('#share').close(); openFocus(shareState.id); });
}
function consumeHash() {
  const h = location.hash;
  try {
    if (h.startsWith('#e=')) {
      const id = decodeURIComponent(h.slice(3));
      if (CURATED.some(c => c.id === id)) setTimeout(() => openDetail(id), 400);
    } else if (h.startsWith('#c=')) {
      const p = JSON.parse(fromB64url(h.slice(3)));
      const m = sanitizeMine({ id: 'shared', title: p.t, note: p.n, day: p.d, time: p.h, tz: p.z, repeat: p.r, category: p.c, cover: p.v, createdAt: new Date().toISOString() });
      if (m) { sharedItem = vmMine(m); setTimeout(() => openDetail('shared'), 400); }
    } else return;
  } catch { toast('Il link condiviso non è valido.'); }
  history.replaceState(null, '', location.pathname + location.search);
}
function adoptShared() {
  if (!sharedItem) return;
  const m = sanitizeMine({ ...sharedItem, id: 'c-' + uid(), kind: 'custom', note: sharedItem.personalNote, createdAt: new Date().toISOString() });
  mine.push(m); persistMine();
  sharedItem = null;
  $('#detail').close();
  renderAll();
  toast('Aggiunto ai tuoi countdown.', { label: 'Vedi', fn: () => $('#miei').scrollIntoView() });
}

/* ---------- Calendario (.ics) ---------- */
function downloadIcs(id) {
  const item = getItem(id);
  if (!item) return;
  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Countdown//IT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${item.id}@the-countdown`, `DTSTAMP:${stamp(Date.now())}`];
  if (item.precision === 'day') {
    const { day } = wallParts(item.target, item.tz);
    const next = new Date(Date.parse(day + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
    lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`);
  } else {
    lines.push(`DTSTART:${stamp(item.target)}`, `DTEND:${stamp(item.target + HOUR)}`);
  }
  if (item.repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
  if (item.repeat === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
  lines.push(`SUMMARY:${icsEsc(item.title)}`, `DESCRIPTION:${icsEsc((item.personalNote || item.tagline || item.sub || '') + (item.source ? '\nFonte: ' + item.source.url : ''))}`, 'END:VEVENT', 'END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = item.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('File calendario scaricato.');
}

/* ---------- Focus ---------- */
function openFocus(id) {
  const item = getItem(id);
  if (!item) return;
  focusId = id;
  const f = $('#focus');
  delete f.dataset.done;
  $('#focus-bg').innerHTML = mediaHTML(item);
  $('#focus-bg').style.setProperty('--c', catOf(item).color);
  $('#focus-cat').textContent = catOf(item).label;
  $('#focus-title').textContent = item.title;
  $('#focus-date').textContent = fmtDate(item.target, { tz: item.precision === 'day' ? item.tz : USER_TZ, precision: item.precision === 'day' ? 'day' : 'time' });
  $('#focus-timer').dataset.target = item.target;
  tickTimer($('#focus-timer'), false);
  if ($('#detail').open) $('#detail').close();
  f.hidden = false;
  document.body.style.overflow = 'hidden';
  f.requestFullscreen?.().catch(() => {});
  $('#focus-close').focus();
}
function closeFocus() {
  $('#focus').hidden = true;
  $('#focus-timer').dataset.target = '0';
  document.body.style.overflow = '';
  focusId = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/* ---------- Import / export ---------- */
function exportData() {
  if (!mine.length && !saved.size) { toast('Non c’è ancora niente da esportare.'); return; }
  const payload = { app: 'The Countdown', version: 3, exportedAt: new Date().toISOString(), count: mine.length, mine, saved: [...saved] };
  saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `the-countdown-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast(`Backup scaricato: ${mine.length} countdown${saved.size ? ` e ${saved.size} eventi seguiti` : ''}.`);
}
const IMPORT_MAX = 5 * 1024 * 1024;
const sameCountdown = (a, b) => a.id === b.id || (a.title.toLowerCase() === b.title.toLowerCase() && a.day === b.day && a.time === b.time);
// Legge il file e mostra un’anteprima: niente viene scritto finché non scegli.
async function importData(file) {
  let data;
  if (file.size > IMPORT_MAX) return toast('Il file è troppo grande (massimo 5 MB).');
  try { data = JSON.parse(await file.text()); }
  catch { return toast('Questo file non è un JSON valido.'); }
  const raw = Array.isArray(data?.mine) ? data.mine : Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : null;
  if (!raw && !Array.isArray(data?.saved)) return toast('Il file non sembra un backup di The Countdown.');
  const rows = (raw || []).length && !Array.isArray(data?.mine) ? migrateLegacy(raw) : (raw || []).map(sanitizeMine).filter(Boolean);
  const invalid = (raw || []).length - rows.length;
  const fresh = rows.filter(r => !mine.some(m => sameCountdown(m, r)));
  const dupes = rows.length - fresh.length;
  const follow = (data?.saved || []).filter(id => CURATED.some(c => c.id === id));
  if (!rows.length && !follow.length) return toast('Nel file non ci sono countdown validi.');
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  $('#import-summary').innerHTML = `<p><b>${n(rows.length, 'countdown trovato', 'countdown trovati')}</b>${follow.length ? ` · ${n(follow.length, 'evento seguito', 'eventi seguiti')}` : ''}</p>
    <ul>${fresh.length ? `<li>${n(fresh.length, 'nuovo', 'nuovi')}</li>` : ''}${dupes ? `<li>${n(dupes, 'già presente (verrà saltato)', 'già presenti (verranno saltati)')}</li>` : ''}${invalid > 0 ? `<li>${n(invalid, 'non valido (verrà ignorato)', 'non validi (verranno ignorati)')}</li>` : ''}</ul>`;
  $('#import-detail').textContent = mine.length ? `Ora ne hai ${mine.length}. “Sostituisci tutto” li rimpiazza con quelli del file (potrai annullare subito dopo).` : 'La tua lista è vuota: verranno semplicemente aggiunti.';
  $('[data-import="replace"]').hidden = !mine.length;
  $('[data-import="merge"]').disabled = !fresh.length && !follow.length;
  const d = $('#import');
  d.showModal();
  $('[data-import="merge"]').focus();
  d.onclick = e => {
    const b = e.target.closest('[data-import]');
    if (!b && e.target !== d) return;
    const choice = b?.dataset.import || 'cancel';
    d.close();
    if (choice === 'cancel') return;
    const before = { mine: mine.slice(), saved: new Set(saved) };
    if (choice === 'replace') { mine = rows.map(r => ({ ...r })); saved = new Set(follow); }
    else { mine = mine.concat(fresh.map(r => mine.some(m => m.id === r.id) ? { ...r, id: 'c-' + uid() } : r)); follow.forEach(id => saved.add(id)); }
    if (!persistMine()) { mine = before.mine; return; }
    persistSaved(); renderAll(true);
    toast(choice === 'replace' ? `Lista sostituita: ${mine.length} countdown.` : fresh.length === 1 ? '1 countdown importato.' : `${fresh.length} countdown importati.`, { label: 'Annulla', fn: () => { mine = before.mine; saved = before.saved; persistMine(); persistSaved(); renderAll(); } });
  };
}

/* ---------- Web app: "Aggiungi alla schermata Home" ---------- */
// Chrome/Edge/Android offrono un prompt (beforeinstallprompt); Safari su iPhone no: lì mostriamo i passaggi.
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function updateInstallUI() {
  const can = !isStandalone() && Boolean(installPrompt || isIOS());
  $('#install-btn').hidden = !can;
  $('#install-card').hidden = !can;
}
async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    updateInstallUI();
    if (outcome === 'accepted') toast('The Countdown è nella tua schermata Home.');
    return;
  }
  $('#install-steps').innerHTML = `<li><span>1</span><p>Tocca ${icon('ios-share')} <b>Condividi</b> nella barra del browser.</p></li><li><span>2</span><p>Scorri e scegli <b>Aggiungi alla schermata Home</b>.</p></li><li><span>3</span><p>Conferma con <b>Aggiungi</b>.</p></li>`;
  $('#install-help').showModal();
}
function initInstall() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; updateInstallUI(); });
  addEventListener('appinstalled', () => { installPrompt = null; updateInstallUI(); toast('App installata: la trovi nella schermata Home.'); });
  $('#install-btn').addEventListener('click', installApp);
  $('#install-card').addEventListener('click', installApp);
  updateInstallUI();
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ---------- Il progetto / Creatore (valori in data.js: i campi vuoti non si mostrano) ---------- */
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
function renderProject() {
  const c = CREATOR || {};
  const name = String(c.name || '').trim();
  const card = $('#creator-card');
  card.hidden = !name;
  if (name) {
    $('#creator-name').textContent = name;
    $('#creator-role').textContent = String(c.role || '').trim();
    $('#creator-role').hidden = !c.role;
    $('#creator-bio').textContent = String(c.bio || '').trim();
    $('#creator-bio').hidden = !c.bio;
    const avatar = /^assets\/[\w.-]+\.(webp|png|jpe?g|avif|svg)$/i.test(c.avatar || '') ? c.avatar : safeImage(c.avatar || '');
    const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    $('#creator-avatar').innerHTML = avatar ? `<img src="${esc(avatar)}" alt="" />` : `<span>${esc(initials)}</span>`;
    const socials = (Array.isArray(c.socials) ? c.socials : []).map(x => ({ label: String(x?.label || '').trim().slice(0, 30), url: httpsUrl(x?.url) })).filter(x => x.label && x.url);
    $('#creator-socials').innerHTML = socials.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer me">${icon('link')} ${esc(x.label)}<span class="sr-only"> (si apre in una nuova scheda)</span></a></li>`).join('');
    $('#creator-socials').hidden = !socials.length;
  }
  const donate = httpsUrl(c.donate?.url);
  $('#support').hidden = !donate;
  if (donate) {
    $('#support-link').href = donate;
    $('#support-label').textContent = String(c.donate?.label || 'Sostieni il progetto').slice(0, 40);
  }
}

/* ---------- Toast ---------- */
function toast(message, action) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${icon('check')}<span></span>`;
  t.querySelector('span').textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = action.label;
    b.onclick = () => { action.fn(); dismiss(); };
    t.append(b);
  }
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  setTimeout(dismiss, action ? 5000 : 2800);
}

/* ==========================================================================
   Creatore guidato
   ========================================================================== */
const creator = { step: 0, editId: null, image: '', credit: null, cover: 'eclipse', category: 'personale', results: [] };
const ART_KIND = { film: 'movie', serie: 'tv', anime: 'tv', gaming: 'game', musica: 'music' };
const ART_LABEL = { movie: 'TMDb', tv: 'TMDb', game: 'RAWG', music: 'Deezer', photo: 'Unsplash' };
const artKind = () => ART_KIND[creator.category] || 'photo';
// Ogni fonte ha il suo formato: locandine verticali, copertine quadrate, foto panoramiche.
const ART_SHAPE = { movie: ['poster', 10], tv: ['poster', 10], music: ['square', 8], game: ['wide', 9], photo: ['wide', 9] };
function renderArtStage() {
  const stage = $('#art-stage');
  if (!creator.image || !/^https:/.test(creator.image)) { stage.hidden = true; return; }
  const img = $('#art-stage-img');
  if (img.getAttribute('src') !== creator.image) { img.classList.remove('is-loaded'); img.src = creator.image; }
  stage.dataset.shape = creator.shape || 'wide';
  const c = creator.credit;
  $('#art-stage-credit').innerHTML = !c ? '' : c.author ? `<span class="src">${esc(c.label)}</span> ${creditHTML(c)}` : `<span class="src">Fonte</span> ${creditHTML(c)}`;
  stage.hidden = false;
}
function updateArtHint() {
  const kind = artKind();
  $('#art-hint').textContent = artStatus[kind] ? `da ${ART_LABEL[kind]}` : kind === 'photo' ? '· serve la chiave Unsplash' : '';
}
async function runArtSearch() {
  const q = $('#art-query').value.trim() || $('#creator-form').title.value.trim();
  const box = $('#art-results');
  const kind = artKind();
  if (q.length < 2) { box.innerHTML = '<p class="muted small">Scrivi almeno due lettere.</p>'; return; }
  if (!artStatus[kind]) { box.innerHTML = `<p class="muted small">${kind === 'photo' ? 'Per le foto aggiungi UNSPLASH_ACCESS_KEY nel file .env e riavvia il sito.' : 'Ricerca immagini non disponibile: avvia il sito con START.bat.'}</p>`; return; }
  const [shape, count] = ART_SHAPE[kind];
  box.dataset.shape = shape;
  box.innerHTML = Array.from({ length: count }, () => '<span class="art-opt is-skel" aria-hidden="true"></span>').join('');
  try {
    // "Concerto di Taylor Swift" → "Taylor Swift": riprova senza le parole generiche.
    const core = q.replace(/^(?:(?:il|lo|la|l’|l'|i|gli|le|un|una|mio|mia|nostro|nostra)\s+)*(?:concerto|tour|live|uscita|album|film|serie|stagione|partita|finale|gara|viaggio|vacanza|vacanze|festival|evento|gioco|videogioco)\s+(?:di|dei|del|della|delle|degli|a|ad|in|per)?\s*/i, '').trim();
    let list = await searchArt(kind, q);
    if (!list.length && core && core !== q && core.length >= 2) list = await searchArt(kind, core);
    creator.results = list.filter(r => safeImage(r.image) && safeImage(r.thumb)).slice(0, count);
    creator.resultShape = shape;
    box.innerHTML = creator.results.length ? creator.results.map((r, i) => `<button class="art-opt" type="button" role="radio" data-art="${i}" aria-checked="${creator.image === r.image}" title="${esc(r.title)}" aria-label="${esc(r.title)}"><img src="${esc(r.thumb)}" alt="" loading="lazy" /></button>`).join('') + `<p class="art-credit">${creator.results.length} immagini da ${esc(ART_LABEL[kind])} · tocca per sceglierne una</p>` : `<p class="muted small">Nessuna immagine per “${esc(q)}”.</p>`;
  } catch { box.innerHTML = '<p class="muted small">La ricerca non ha risposto. Riprova tra poco.</p>'; }
}
function initCreator() {
  $('#cat-picker').innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `<button class="chip" type="button" role="radio" data-cat="${k}" style="--c:${c.color}" aria-checked="false">${icon(c.icon)} ${esc(c.label)}</button>`).join('');
  $('#cover-picker').innerHTML = Object.entries(COVERS).map(([k, label]) => `<button class="cover-opt" type="button" role="radio" data-cover="${k}" aria-checked="false" aria-label="${esc(label)}" title="${esc(label)}"><span class="art art--${k}"></span></button>`).join('');
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Europe/Rome', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
  $('#tz-list').innerHTML = zones.map(z => `<option value="${z}">`).join('');
  const quick = [['Domani', 1], ['Tra una settimana', 7], ['Tra un mese', 30], ['Tra 100 giorni', 100]];
  $('#quick-dates').innerHTML = quick.map(([l, n]) => `<button class="chip" type="button" data-quick="${n}">${l}</button>`).join('');
}
function setCreatorStep(n) {
  creator.step = n;
  $$('.step-panel').forEach(p => p.hidden = Number(p.dataset.step) !== n);
  $$('[data-step-dot]').forEach(li => { const i = Number(li.dataset.stepDot); li.classList.toggle('is-current', i === n); li.classList.toggle('is-done', i < n); });
  $('#step-back').style.visibility = n === 0 ? 'hidden' : 'visible';
  $('#step-next').hidden = n === 2;
  $('#step-save').hidden = n !== 2;
  const first = $(`.step-panel[data-step="${n}"] input, .step-panel[data-step="${n}"] button`);
  first?.focus({ preventScroll: true });
}
function openCreator({ edit = null, template = null } = {}) {
  const form = $('#creator-form');
  form.reset();
  $$('.field-error', form).forEach(e => e.textContent = '');
  creator.editId = edit?.id || null;
  const src = edit || template || {};
  const d = new Date(Date.now() + 7 * DAY);
  form.title.value = src.title || '';
  form.note.value = src.note || '';
  form.day.value = src.day || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  form.time.value = src.time || '20:00';
  form.tz.value = src.tz || USER_TZ;
  form.repeat.value = src.repeat || 'none';
  creator.category = src.category || 'personale';
  creator.cover = src.cover || 'eclipse';
  creator.image = edit?.image || '';
  creator.credit = edit?.credit || null;
  creator.results = [];
  $('#art-results').innerHTML = '';
  $('#art-query').value = '';
  $$('input[name="remind"]', form).forEach(c => c.checked = (edit?.reminders || []).includes(c.value));
  form.sound.checked = Boolean(edit?.sound);
  form.pinned.checked = Boolean(edit?.pinned);
  $('#creator-eyebrow').textContent = edit ? 'Modifica countdown' : 'Nuovo countdown';
  $('#creator-title').textContent = edit ? 'Ritocca il tuo countdown' : 'Cosa stai aspettando?';
  $('#step-save').innerHTML = `${icon('check')} ${edit ? 'Salva modifiche' : 'Crea countdown'}`;
  syncCreatorPickers();
  updatePreview();
  if ($('#detail').open) $('#detail').close();
  $('#creator').showModal();
  setCreatorStep(0);
}
function syncCreatorPickers() {
  $$('#cat-picker [data-cat]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.cat === creator.category)));
  $$('#cover-picker [data-cover]').forEach(b => b.setAttribute('aria-checked', String(!creator.image && b.dataset.cover === creator.cover)));
  $('#remove-image').hidden = !creator.image;
  renderArtStage();
  $$('#art-results [data-art]').forEach(b => b.setAttribute('aria-checked', String(creator.results[b.dataset.art]?.image === creator.image)));
  updateArtHint();
}
function draftFromForm() {
  const f = $('#creator-form');
  return {
    id: creator.editId || 'draft', kind: 'custom',
    title: f.title.value.trim(), note: f.note.value.trim(),
    category: creator.category, day: f.day.value, time: f.time.value || '00:00',
    tz: validTz(f.tz.value.trim()) ? f.tz.value.trim() : USER_TZ,
    repeat: f.repeat.value, cover: creator.cover, image: creator.image, credit: creator.image ? creator.credit : null,
    reminders: $$('input[name="remind"]:checked', f).map(c => c.value),
    sound: f.sound.checked, pinned: f.pinned.checked,
    createdAt: (creator.editId && mine.find(m => m.id === creator.editId)?.createdAt) || new Date().toISOString(),
  };
}
function updatePreview() {
  const draft = draftFromForm();
  const m = sanitizeMine({ ...draft, title: draft.title || 'Il tuo countdown', day: /^\d{4}-\d{2}-\d{2}$/.test(draft.day) ? draft.day : '2099-01-01' });
  const item = vmMine(m);
  const tzInput = $('#creator-form').tz.value.trim();
  $('#tz-hint').textContent = !validTz(tzInput) ? 'Fuso non riconosciuto: verrà usato ' + USER_TZ : tzInput !== USER_TZ ? `Per te: ${fmtDate(item.target, { tz: USER_TZ })}` : '';
  $('#creator-preview').innerHTML = cardHTML(item, { mode: 'preview' }) +
    `<div class="preview-meta"><span>${icon('cal')} ${esc(fmtDate(item.target, { tz: item.tz }))}</span><span>${icon('clock')} ${esc(relative(item.target))}</span>${item.repeat !== 'none' ? `<span>${icon('sparkle')} ${item.repeat === 'yearly' ? 'Si ripete ogni anno' : 'Si ripete ogni mese'}</span>` : ''}</div>`;
}
function validateStep(n) {
  const f = $('#creator-form');
  const err = (k, msg) => { $(`[data-error="${k}"]`).textContent = msg; };
  if (n === 0) {
    const ok = Boolean(f.title.value.trim());
    err('title', ok ? '' : 'Dai un nome al tuo countdown.');
    f.title.setAttribute('aria-invalid', String(!ok));
    if (!ok) f.title.focus();
    return ok;
  }
  if (n === 1) {
    const d = draftFromForm();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day)) { err('date', 'Scegli una data.'); f.day.focus(); return false; }
    const t = customTarget(sanitizeMine(d));
    if (d.repeat === 'none' && t <= Date.now()) { err('date', 'La data è già passata: scegline una futura o imposta una ripetizione.'); f.day.focus(); return false; }
    err('date', '');
    return true;
  }
  return true;
}
async function saveCreator(e) {
  e.preventDefault();
  if (creator.step < 2) { if (validateStep(creator.step)) setCreatorStep(creator.step + 1); return; }
  if (!validateStep(0)) return setCreatorStep(0);
  if (!validateStep(1)) return setCreatorStep(1);
  const draft = draftFromForm();
  const item = sanitizeMine({ ...draft, id: creator.editId || 'c-' + uid() });
  if (creator.editId) mine = mine.map(m => m.id === creator.editId ? item : m);
  else mine.push(item);
  if (!persistMine()) return;
  trackArt(item.credit && creator.credit);
  if (item.reminders.length && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  $('#creator').close();
  if (item.pinned) slides = [];
  renderAll();
  toast(creator.editId ? 'Modifiche salvate.' : 'Il tuo countdown è pronto.', { label: 'Apri', fn: () => openDetail(item.id) });
  if (!creator.editId) setTimeout(() => $(`[data-card="${CSS.escape(item.id)}"]`)?.scrollIntoView({ block: 'center' }), 50);
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Usa un’immagine PNG, JPG o WebP.'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('L’immagine supera 12 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = .82, out = c.toDataURL('image/jpeg', q);
      while (out.length > 900_000 && q > .4) { q -= .12; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Non riesco a leggere questa immagine.')); };
    img.src = url;
  });
}

/* ==========================================================================
   Ricerca (Ctrl K)
   ========================================================================== */
let searchSel = 0;
function searchIndex() {
  const seen = new Set();
  return [...mineItems(), ...curatedItems(), ...feedItems()].filter(i => !seen.has(i.id) && seen.add(i.id));
}
function renderSearch() {
  const q = $('#search-input').value.trim().toLowerCase();
  const all = searchIndex();
  let list = q ? all.filter(i => `${i.title} ${catOf(i).label} ${i.sub || ''}`.toLowerCase().includes(q)) : all.filter(isFuture).sort((a, b) => a.target - b.target).slice(0, 6);
  list = list.slice(0, 12);
  searchSel = clamp(searchSel, 0, Math.max(0, list.length));
  const row = (i, n) => `<button class="sr-item" type="button" role="option" data-act="open" data-id="${esc(i.id)}" aria-selected="${n === searchSel}" style="--c:${catOf(i).color}">
    <span class="sr-thumb">${i.image || i.poster ? mediaHTML(i, 'thumb') : icon(catOf(i).icon)}</span>
    <span><b>${esc(i.title)}</b><small>${esc(catOf(i).label)} · ${esc(fmtShort(i.target, i.tz))}</small></span>
    <span class="sr-left">${esc(relative(i.target))}</span></button>`;
  const create = `<button class="sr-item" type="button" role="option" data-act="create-from-search" aria-selected="${list.length === searchSel}"><span class="sr-thumb">${icon('plus')}</span><span><b>${q ? `Crea “${esc($('#search-input').value.trim())}”` : 'Crea un nuovo countdown'}</b><small>Apri il creatore guidato</small></span></button>`;
  $('#search-results').innerHTML = (list.length ? `<p class="sr-group">${q ? 'Risultati' : 'I prossimi'}</p>` + list.map(row).join('') : `<p class="sr-empty">Nessun risultato per “${esc(q)}”.</p>`) + `<p class="sr-group">Azioni</p>` + create;
}
function openSearch() {
  const d = $('#search');
  $('#search-input').value = '';
  searchSel = 0;
  renderSearch();
  if (!d.open) d.showModal();
  $('#search-input').focus();
}

/* ==========================================================================
   Aspetto
   ========================================================================== */
function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.style.setProperty('--accent', prefs.accent);
  root.classList.toggle('reduce-motion', prefs.reduceMotion);
  $('meta[name="theme-color"]').content = prefs.theme === 'light' ? '#f3f1ed' : '#07080c';
  $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === prefs.theme)));
  $('#accent-swatches').innerHTML = ACCENTS.map(a => `<button class="swatch" type="button" role="radio" style="--c:${a.value}" data-accent="${a.value}" aria-checked="${a.value === prefs.accent}" aria-label="${esc(a.label)}" title="${esc(a.label)}"></button>`).join('');
  $('#pref-motion').checked = prefs.reduceMotion;
}

/* ==========================================================================
   TMDb (facoltativo: funziona solo con il server locale e una chiave)
   ========================================================================== */
async function api(path) {
  const r = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('api');
  return r.json();
}
// Carica le uscite (film, serie, anime, giochi) e le festività. Ogni fonte è indipendente.
async function loadFeeds() {
  if (location.protocol === 'file:') { feedState = 'offline'; return renderShelfState(); }
  feedState = 'loading';
  renderShelfState();
  let ok = 0;
  const curatedDays = new Set(CURATED.filter(e => e.local).map(e => e.local.slice(0, 10)));
  await Promise.all(Object.keys(feedData).map(async type => {
    try {
      const rows = ((await api('/api/feed?type=' + type)).results || []).filter(f => f && typeof f.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.day || ''));
      feedData[type] = type === 'feste' ? rows.filter(f => !curatedDays.has(f.day)) : rows;
      ok++;
      feedState = 'ready';
      renderShelf(type === shelfType || shelfType === 'presto');
      if (type === 'feste') renderTimeline();
    } catch {}
  }));
  if (!ok) { feedState = 'error'; renderShelfState(); }
  renderHero();
}
const searchArt = async (kind, q) => (await api(`/api/art?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`)).results || [];
const trackArt = credit => { if (credit?.id?.startsWith('unsplash:')) fetch('/api/art/track?id=' + encodeURIComponent(credit.id)).catch(() => {}); };
// Immagini per il catalogo: film/serie da TMDb, giochi da RAWG, musica da Deezer, il resto da Unsplash.
async function loadArt() {
  try { artStatus = await api('/api/art/status'); } catch { return; }
  await Promise.all(CURATED.filter(e => e.art && !safeImage(e.image) && artStatus[e.art.kind]).map(async e => {
    try {
      const list = await searchArt(e.art.kind, e.art.q);
      const year = new Date(curatedTarget(e)).getFullYear();
      const dated = e.art.kind === 'movie' || e.art.kind === 'tv' || e.art.kind === 'game';
      const hit = list.find(r => safeImage(r.image) && (!dated || !r.year || Math.abs(r.year - year) <= 1));
      if (!hit) return;
      artMap.set(e.id, { image: hit.image, thumb: safeImage(hit.thumb), credit: safeCredit({ ...hit.credit }) });
      if (hit.id) trackArt({ id: hit.id });
    } catch {}
  }));
  if (artMap.size) renderAll();
}

/* ==========================================================================
   Eventi UI
   ========================================================================== */
function bind() {
  // Immagini: dissolvenza quando sono pronte; se falliscono resta la copertina disegnata.
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.closest('.card-media, .poster-img, .tl-thumb, .sr-thumb, .focus-bg')) e.target.remove(); }, true);
  // Azioni delegate
  document.addEventListener('click', e => {
    const create = e.target.closest('[data-create]');
    if (create) { openCreator(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const { act, id } = t.dataset;
    if (act !== 'open' && act !== 'create-from-search' && $('#search').open) $('#search').close();
    switch (act) {
      case 'open': if ($('#search').open) $('#search').close(); openDetail(id); break;
      case 'save': toggleSave(id); break;
      case 'pin': togglePin(id); break;
      case 'edit': { const m = mine.find(x => x.id === id); if (m) openCreator({ edit: m }); break; }
      case 'dup': duplicate(id); break;
      case 'del': remove(id); break;
      case 'share': share(id); break;
      case 'ics': downloadIcs(id); break;
      case 'focus': openFocus(id); break;
      case 'adopt': adoptShared(); break;
      case 'template': openCreator({ template: TEMPLATES[Number(t.dataset.i)] }); break;
      case 'create-from-search': { const q = $('#search-input').value.trim(); $('#search').close(); openCreator({ template: q ? { title: q } : null }); break; }
    }
  });
  $$('dialog').forEach(d => d.addEventListener('click', e => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  }));
  $('#detail').addEventListener('close', () => { openDetailId = null; });

  // Hero
  $('#feature-pager').addEventListener('click', e => { const b = e.target.closest('[data-slide]'); if (b) { showSlide(Number(b.dataset.slide)); startSlideshow(); } });
  $('#feature-save').addEventListener('click', e => toggleSave(e.currentTarget.dataset.id));
  $('#feature-open').addEventListener('click', e => openDetail(e.currentTarget.dataset.id));
  const hero = $('.hero');
  hero.addEventListener('pointerenter', () => heroPaused = true);
  hero.addEventListener('pointerleave', () => heroPaused = false);
  hero.addEventListener('focusin', () => heroPaused = true);
  hero.addEventListener('focusout', () => heroPaused = false);

  // Esplora
  $('#event-chips').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; exploreFilter = b.dataset.filter; exploreExpanded = false; renderExplore(true); });
  $('#event-cards').addEventListener('click', e => { if (e.target.closest('#explore-more')) { exploreExpanded = !exploreExpanded; renderExplore(true); } });
  $('#shelf-tabs').addEventListener('click', e => { const b = e.target.closest('[data-shelf-type]'); if (!b) return; shelfType = b.dataset.shelfType; renderShelf(true); });
  $('#cinema-shelf').addEventListener('click', e => { if (e.target.closest('#feeds-retry')) loadFeeds(); });
  $('#shelf-sub').addEventListener('click', e => {
    const g = e.target.closest('[data-anime-group]'), pl = e.target.closest('[data-platform]');
    if (g) animeGroup = g.dataset.animeGroup;
    if (pl) platformFilter = pl.dataset.platform;
    if (g || pl) renderShelf(true);
  });
  $$('[data-shelf]').forEach(b => b.addEventListener('click', () => { const s = $('#cinema-shelf'); s.scrollBy({ left: Number(b.dataset.shelf) * s.clientWidth * .8, behavior: reducedMotion() ? 'auto' : 'smooth' }); }));

  // Timeline
  $('#timeline-items').addEventListener('click', e => { if (e.target.closest('[data-period-all]')) { prefs.period = 'all'; persistPrefs(); renderTimeline(); } });
  $('#period-filter').addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (!b) return; prefs.period = b.dataset.period; persistPrefs(); renderTimeline(); });
  $('#timeline-mine').addEventListener('change', e => { prefs.timelineMine = e.target.checked; persistPrefs(); renderTimeline(); });
  $('#timeline-holidays').addEventListener('change', e => { prefs.timelineHolidays = e.target.checked; persistPrefs(); renderTimeline(); });

  // I miei
  $('#mine-search').addEventListener('input', () => renderMine(true));
  $('#mine-category').addEventListener('change', e => { mineFilter = e.target.value; renderMine(true); });
  $('#mine-sort').addEventListener('change', () => renderMine(true));
  $$('.view-switch button').forEach(b => b.addEventListener('click', () => { prefs.view = b.dataset.view; persistPrefs(); renderMine(true); }));
  $('#mine-calendar').addEventListener('click', e => {
    const b = e.target.closest('[data-cal]'); if (!b) return;
    const n = Number(b.dataset.cal);
    calCursor = n === 0 ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(calCursor.getFullYear(), calCursor.getMonth() + n, 1);
    renderMine();
  });
  $('#templates').innerHTML = TEMPLATES.map((t, i) => `<button class="chip" type="button" data-act="template" data-i="${i}" style="--c:${CATEGORIES[t.category].color}">${icon(CATEGORIES[t.category].icon)} ${esc(t.title)}</button>`).join('');
  $('#export-btn').addEventListener('click', exportData);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

  // Creatore
  const form = $('#creator-form');
  form.addEventListener('submit', saveCreator);
  form.addEventListener('input', e => { if (e.target.name === 'title') { form.title.removeAttribute('aria-invalid'); $('[data-error="title"]').textContent = ''; } updatePreview(); });
  form.addEventListener('change', updatePreview);
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); $('#step-next').hidden ? $('#step-save').click() : $('#step-next').click(); } });
  $('#step-next').addEventListener('click', () => { if (validateStep(creator.step)) setCreatorStep(creator.step + 1); });
  $('#step-back').addEventListener('click', () => setCreatorStep(Math.max(0, creator.step - 1)));
  $('#cat-picker').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; creator.category = b.dataset.cat; syncCreatorPickers(); updatePreview(); });
  $('#cover-picker').addEventListener('click', e => { const b = e.target.closest('[data-cover]'); if (!b) return; creator.cover = b.dataset.cover; creator.image = ''; creator.credit = null; form.image.value = ''; syncCreatorPickers(); updatePreview(); });
  $('#quick-dates').addEventListener('click', e => {
    const b = e.target.closest('[data-quick]'); if (!b) return;
    const d = new Date(Date.now() + Number(b.dataset.quick) * DAY);
    form.day.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $('[data-error="date"]').textContent = '';
    updatePreview();
  });
  form.image.addEventListener('change', async () => {
    const file = form.image.files[0]; if (!file) return;
    try { creator.image = await readImage(file); creator.credit = null; syncCreatorPickers(); updatePreview(); }
    catch (err) { toast(err.message); form.image.value = ''; }
  });
  $('#art-search-btn').addEventListener('click', runArtSearch);
  $('#art-query').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); runArtSearch(); } });
  $('#art-results').addEventListener('click', e => {
    const b = e.target.closest('[data-art]'); if (!b) return;
    const r = creator.results[Number(b.dataset.art)]; if (!r) return;
    creator.image = r.image; creator.credit = { ...r.credit, id: r.id }; creator.shape = creator.resultShape;
    form.image.value = '';
    syncCreatorPickers(); updatePreview();
  });
  $('#remove-image').addEventListener('click', () => { creator.image = ''; creator.credit = null; form.image.value = ''; syncCreatorPickers(); updatePreview(); });

  // Ricerca
  $('#open-search').addEventListener('click', openSearch);
  $('#search-input').addEventListener('input', () => { searchSel = 0; renderSearch(); });
  $('#search-input').addEventListener('keydown', e => {
    const items = $$('#search-results .sr-item');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.setAttribute('aria-selected', String(i === searchSel)));
      items[searchSel]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); items[searchSel]?.click(); }
  });

  // Aspetto
  const panel = $('#appearance-panel'), trigger = $('#open-appearance');
  const setPanel = open => { panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); };
  trigger.addEventListener('click', e => { e.stopPropagation(); setPanel(panel.hidden); });
  document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.appearance')) setPanel(false); });
  panel.addEventListener('click', e => {
    const th = e.target.closest('[data-theme-set]');
    if (th) { prefs.theme = th.dataset.themeSet; persistPrefs(); applyPrefs(); }
    const ac = e.target.closest('[data-accent]');
    if (ac) { prefs.accent = ac.dataset.accent; persistPrefs(); applyPrefs(); renderHero(); }
  });
  $('#pref-motion').addEventListener('change', e => { prefs.reduceMotion = e.target.checked; persistPrefs(); applyPrefs(); });

  // Focus e celebrazione
  $('#focus-close').addEventListener('click', closeFocus);
  $('#celebrate-close').addEventListener('click', () => { $('#celebrate').hidden = true; });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && focusId) closeFocus(); });

  // Info
  $('#open-credits').addEventListener('click', () => openInfo('Fonti e crediti', `
    <p>Le date degli eventi in evidenza sono state verificate su fonti pubbliche il 12 ottobre 2026 e possono cambiare. Ogni scheda indica precisione e fonte:</p>
    <ul>${CURATED.filter(e => e.source).map(e => `<li>${esc(e.title)} — <a href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">${esc(e.source.label)}</a></li>`).join('')}</ul>
    <p>Locandine, uscite al cinema, serie TV e anime sono fornite da <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">The Movie Database (TMDb)</a>. Questo prodotto utilizza l’API di TMDb ma non è approvato né certificato da TMDb.</p>
    <p>Le altre uscite arrivano da TVmaze (serie TV), IGDB (videogiochi), Ticketmaster (concerti), football-data.org (calcio), Jolpica (Formula 1) e Launch Library 2 di The Space Devs (lanci spaziali). Gli orari sono convertiti nel tuo fuso orario.</p>
    <p>Le festività italiane arrivano da <a href="https://date.nager.at/" target="_blank" rel="noopener noreferrer">Nager.Date</a>; le uscite dei videogiochi da RAWG.</p>
    <p>Le immagini dei videogiochi arrivano da <a href="https://rawg.io/" target="_blank" rel="noopener noreferrer">RAWG</a>, quelle musicali da <a href="https://www.deezer.com/" target="_blank" rel="noopener noreferrer">Deezer</a> e le foto da <a href="https://unsplash.com/?utm_source=the_countdown&amp;utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>. Ogni scheda indica l’autore o la fonte dell’immagine.</p>
    <p>I tuoi countdown, la lista e le preferenze restano solo in questo browser (localStorage). Nessun account, nessun server esterno.</p>`));
  $('#open-shortcuts').addEventListener('click', () => openInfo('Scorciatoie da tastiera', `
    <div class="shortcuts"><span><kbd>Ctrl</kbd> <kbd>K</kbd></span><span>Cerca eventi e countdown</span><span><kbd>/</kbd></span><span>Cerca</span><span><kbd>N</kbd></span><span>Nuovo countdown</span><span><kbd>←</kbd> <kbd>→</kbd></span><span>Cambia evento nella hero</span><span><kbd>Esc</kbd></span><span>Chiudi finestre e modalità focus</span></div>`));

  // Tastiera globale
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') { if (!$('#focus').hidden) closeFocus(); if (!$('#celebrate').hidden) $('#celebrate').hidden = true; setPanel(false); }
    if (typing || $$('dialog[open]').length || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); }
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); openCreator(); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && scrollY < innerHeight * .6 && slides.length > 1) { showSlide(slideIdx + (e.key === 'ArrowRight' ? 1 : -1)); startSlideshow(); }
  });

  // Scroll: nav solida, torna su, timeline
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      $('#nav').classList.toggle('is-solid', scrollY > 24);
      const hero = $('.hero');
      if (!reducedMotion() && innerWidth > 900) hero.style.setProperty('--sp', clamp(scrollY / hero.offsetHeight, 0, 1).toFixed(3));
      $('#to-top').classList.toggle('is-on', scrollY > 900);
      updateTimelineProgress();
      ticking = false;
    });
  }, { passive: true });
  $('#to-top').addEventListener('click', () => scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }));

  // Reveal on scroll + voce di menu attiva
  const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));
  const navIo = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) $$('[data-nav]').forEach(a => a.classList.toggle('is-active', a.dataset.nav === en.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['top', 'eventi', 'in-arrivo', 'miei', 'progetto'].forEach(id => navIo.observe(document.getElementById(id)));
}
function openInfo(title, html) {
  $('#info-title').textContent = title;
  $('#info-body').innerHTML = html;
  $('#info').showModal();
}

/* ==========================================================================
   Avvio
   ========================================================================== */
applyPrefs();
buildStars();
initCreator();
renderProject();
initInstall();
bind();
bindShare();
consumeHash();
renderAll(true);
startSlideshow();
tick();
loadFeeds();
loadArt();
