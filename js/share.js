// Condivisione: link per la pagina dedicata, card grafica da scaricare, QR code e file calendario.
// Usato sia dalla home (app.js) sia dalla pagina del countdown condiviso (countdown-page.js).

export const DAY = 864e5, HOUR = 36e5;
export const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
export const pad = n => String(n).padStart(2, '0');
export const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

/* ---------- Fusi orari ---------- */
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  return dtfCache.get(tz);
}
export const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
function tzOffset(ms, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(ms)) p[type] = value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = tzOffset(guess, tz);
  let t = guess - off;
  const off2 = tzOffset(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}
export function wallParts(ms, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(ms)) p[type] = value;
  return { day: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(+p.hour % 24)}:${pad(p.minute)}` };
}
export function parts(ms) {
  ms = Math.max(0, ms);
  return { d: Math.floor(ms / DAY), h: Math.floor(ms % DAY / HOUR), m: Math.floor(ms % HOUR / 6e4), s: Math.floor(ms % 6e4 / 1e3) };
}
export function fmtDate(ms, { tz = USER_TZ, precision = 'time', weekday = true } = {}) {
  const o = { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz };
  if (weekday) o.weekday = 'long';
  if (precision !== 'day') { o.hour = '2-digit'; o.minute = '2-digit'; }
  return new Intl.DateTimeFormat('it-IT', o).format(ms);
}

/* ---------- Payload del link ----------
   I dati viaggiano nel frammento (#), che il browser non manda al server.
   Sono codificati, NON cifrati: per questo la nota personale è esclusa se non la scegli tu. */
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
const SHAREABLE_HOSTS = ['image.tmdb.org', 'media.rawg.io', 'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net', 'images.unsplash.com', 'static.tvmaze.com', 'images.igdb.com', 's1.ticketm.net', 'thespacedevs-prod.nyc3.digitaloceanspaces.com', 's4.anilist.co'];
export function shareableImage(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && SHAREABLE_HOSTS.includes(u.hostname) ? u.href : ''; } catch { return ''; }
}
export function encodeShare(item, { includeNote = false } = {}) {
  const tz = item.tz || USER_TZ;
  const wall = item.day && item.time ? { day: item.day, time: item.time } : wallParts(item.target, tz);
  const payload = { v: 2, t: item.title, d: wall.day, h: wall.time, z: tz, r: item.repeat || 'none', c: item.category, cv: item.cover, p: item.precision || 'time' };
  const img = shareableImage(item.image || '');
  if (img) payload.i = img;
  if (item.source?.label) payload.s = item.source.label;
  if (item.kind === 'custom' && Number.isFinite(Date.parse(item.createdAt))) payload.st = item.createdAt.slice(0, 10); // inizio dell’attesa, per l’anello
  if (includeNote && item.personalNote) payload.n = item.personalNote.slice(0, 160);
  return b64url(JSON.stringify(payload));
}
export function decodeShare(code) {
  const p = JSON.parse(fromB64url(code));
  if (!p || typeof p.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.d || '')) return null;
  return {
    title: p.t.slice(0, 80), note: typeof p.n === 'string' ? p.n.slice(0, 160) : '',
    day: p.d, time: /^\d{2}:\d{2}$/.test(p.h || '') ? p.h : '00:00', tz: validTz(p.z) ? p.z : USER_TZ,
    repeat: ['yearly', 'monthly'].includes(p.r) ? p.r : 'none', category: typeof p.c === 'string' ? p.c : 'personale',
    cover: typeof (p.cv || p.v) === 'string' ? (p.cv || p.v) : 'eclipse', image: shareableImage(p.i || ''),
    precision: ['day', 'time', 'approx'].includes(p.p) ? p.p : 'time', source: typeof p.s === 'string' ? p.s.slice(0, 40) : '',
    start: /^\d{4}-\d{2}-\d{2}$/.test(p.st || '') ? p.st : '',
  };
}
export const shareUrl = code => `${location.origin}/countdown.html#c=${code}`;

/* ---------- Calendario (.ics) ---------- */
// alarms: promemoria che il calendario del telefono mostrerà anche a sito chiuso ('1d', '1h', '0').
const ICS_ALARMS = {
  time: { '1d': ['-P1D', 'Domani'], '1h': ['-PT1H', 'Tra un’ora'], '0': ['PT0S', 'È il momento'] },
  // Eventi "tutto il giorno": l’inizio è la mezzanotte, quindi avvisi a orari sensati.
  day: { '1d': ['-PT15H', 'Domani'], '1h': ['PT9H', 'Oggi'], '0': ['PT9H', 'Oggi'] },
};
export function downloadIcs({ id, title, target, precision, tz, repeat, description, alarms = ['1d', '1h'] }) {
  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Countdown//IT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${id || target}@the-countdown`, `DTSTAMP:${stamp(Date.now())}`];
  if (precision === 'day') {
    const { day } = wallParts(target, tz || USER_TZ);
    const next = new Date(Date.parse(day + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
    lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`);
  } else lines.push(`DTSTART:${stamp(target)}`, `DTEND:${stamp(target + HOUR)}`);
  if (repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
  if (repeat === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
  lines.push(`SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(description)}`);
  const table = ICS_ALARMS[precision === 'day' ? 'day' : 'time'], seen = new Set();
  for (const code of alarms) {
    const [trigger, label] = table[code] || [];
    if (!trigger || seen.has(trigger)) continue;
    seen.add(trigger);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(label + ': ' + title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  saveBlob(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), slug(title) + '.ics');
}
export const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'countdown';
export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ---------- QR code (libreria locale js/vendor/qrcode.js) ---------- */
export function qrSvg(text) {
  if (typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

/* ---------- Card grafica (canvas) ---------- */
export const CARD_FORMATS = {
  story: { w: 1080, h: 1920, label: 'Storia 9:16' },
  square: { w: 1080, h: 1080, label: 'Post 1:1' },
  wide: { w: 1200, h: 630, label: 'Anteprima 1.91:1' },
};
function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Le immagini esterne passano dal proxy locale, così il canvas resta esportabile.
    img.src = /^https:/.test(src) ? '/api/img?u=' + encodeURIComponent(src) : src;
  });
}
function cover(ctx, img, w, h, focusY = .3) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) * focusY, dw, dh);
}
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}
// data: { title, categoryLabel, color, image, target, dateText, accent }
export async function renderCard(canvas, data, format = 'story') {
  const { w, h } = CARD_FORMATS[format];
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  await Promise.all(['200 100px "Barlow Condensed"', '500 40px "Sora"', '400 30px "Inter"'].map(f => document.fonts?.load(f).catch(() => {})));
  const color = data.color || '#ff3b47';
  // Fondale
  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, 0, w, h);
  const img = await loadImage(data.image);
  if (img) { ctx.globalAlpha = .85; cover(ctx, img, w, h); ctx.globalAlpha = 1; }
  else {
    const g = ctx.createRadialGradient(w * .7, h * .35, 0, w * .7, h * .35, Math.max(w, h) * .7);
    g.addColorStop(0, color + '66'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.shadowColor = color; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(w * .68, h * .34, Math.min(w, h) * .26, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
  }
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(7,8,12,.55)'); shade.addColorStop(.35, 'rgba(7,8,12,.15)'); shade.addColorStop(.62, 'rgba(7,8,12,.7)'); shade.addColorStop(1, 'rgba(7,8,12,.97)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);

  const m = format === 'wide' ? 64 : 84;
  const unit = format === 'wide' ? 0.62 : format === 'square' ? 0.9 : 1;
  // Marchio
  ctx.strokeStyle = color; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(m + 18, m + 18, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m + 18, m + 18, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(26 * unit + 4)}px Sora`; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '8px';
  ctx.fillText('THE COUNTDOWN', m + 54, m + 19);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';

  const left = parts(data.target - Date.now());
  const days = String(left.d).padStart(left.d > 99 ? 3 : 2, '0');
  const ended = data.target <= Date.now();
  // Testi in basso
  const bottom = h - m;
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = `400 ${Math.round(30 * unit)}px Inter`;
  ctx.fillText(data.dateText, m, bottom);
  ctx.font = `200 ${Math.round(330 * unit)}px "Barlow Condensed"`;
  const daysY = bottom - Math.round(70 * unit);
  ctx.fillStyle = '#fff'; ctx.shadowColor = color; ctx.shadowBlur = 50;
  ctx.fillText(ended ? '00' : days, m - 8, daysY);
  ctx.shadowBlur = 0;
  const dw = ctx.measureText(ended ? '00' : days).width;
  ctx.fillStyle = color; ctx.font = `600 ${Math.round(28 * unit)}px Sora`;
  ctx.letterSpacing = '6px';
  ctx.fillText(ended ? 'È IL MOMENTO' : left.d === 1 ? 'GIORNO' : 'GIORNI', m + dw + 18, daysY - 8);
  ctx.letterSpacing = '0px';
  const titleSize = Math.round(76 * unit);
  ctx.font = `500 ${titleSize}px Sora`;
  ctx.fillStyle = '#fff';
  const lines = wrap(ctx, data.title, w - m * 2, format === 'wide' ? 2 : 3);
  let y = daysY - Math.round(330 * unit * .86) - (lines.length - 1) * titleSize * 1.08;
  for (const line of lines) { ctx.fillText(line, m, y); y += titleSize * 1.08; }
  // Categoria
  const catY = daysY - Math.round(330 * unit * .86) - (lines.length - 1) * titleSize * 1.08 - titleSize - 10;
  ctx.font = `600 ${Math.round(24 * unit)}px Inter`;
  const label = (data.categoryLabel || '').toUpperCase();
  const lw = ctx.measureText(label).width + 36;
  ctx.fillStyle = color + '55';
  ctx.beginPath(); ctx.roundRect(m, catY - 30 * unit, lw, 44 * unit, 22 * unit); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, m + 18, catY);
  return canvas;
}

/* ---------- Coriandoli per il momento zero ---------- */
// Leggeri (canvas, ~3 secondi) e mai con "riduci animazioni".
export function confetti({ colors = ['#ff3b47', '#ffb3a8', '#ffffff', '#f3c969', '#36c5f0', '#9b6bff'], count = 160, z = 200 } = {}) {
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:${z}`;
  document.body.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1, a = (-90 + side * (20 + Math.random() * 45)) * Math.PI / 180, v = 9 + Math.random() * 10;
    return { x: W / 2 + side * W * .18, y: H * .62, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, c: colors[i % colors.length] };
  });
  const start = performance.now();
  const frame = now => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += .32; p.vx *= .99; p.vy *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2.2)); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t < 3.3) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
