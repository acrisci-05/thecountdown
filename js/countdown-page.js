// Pagina dedicata a un countdown condiviso (countdown.html#c=…).
import { CATEGORIES } from './data.js';
import { decodeShare, zonedToUtc, wallParts, parts, fmtDate, downloadIcs, confetti, USER_TZ, DAY } from './share.js';

const $ = s => document.querySelector(s);
const reduced = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2800);
}

// Prossima occorrenza (per compleanni e anniversari) come nella home.
function targetOf(c) {
  const [Y, M, D] = c.day.split('-').map(Number);
  const [h, mi] = c.time.split(':').map(Number);
  const first = zonedToUtc(Y, M, D, h, mi, c.tz);
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  if (c.repeat === 'yearly') {
    for (let y = Math.max(Y, new Date().getFullYear() - 1); y < Y + 200; y++) {
      const t = zonedToUtc(y, M, Math.min(D, daysIn(y, M)), h, mi, c.tz);
      if (t >= first && t > Date.now() - 36e5) return t;
    }
  }
  if (c.repeat === 'monthly') {
    const now = new Date();
    for (let i = -1; i < 40; i++) {
      const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12), m = ((now.getMonth() + i) % 12 + 12) % 12 + 1;
      const t = zonedToUtc(y, m, Math.min(D, daysIn(y, m)), h, mi, c.tz);
      if (t >= first && t > Date.now() - 36e5) return t;
    }
  }
  return first;
}

function setNum(n, value, animate) {
  if (n.dataset.v === value) return;
  const old = n.dataset.v;
  n.dataset.v = value;
  if (old == null || n.children.length !== value.length || !animate || reduced()) {
    n.innerHTML = [...value].map(ch => `<span class="dg">${ch}</span>`).join('');
    return;
  }
  [...value].forEach((ch, i) => {
    if (old[i] === ch) return;
    const d = n.children[i];
    d.textContent = ch;
    d.classList.remove('roll-in'); void d.offsetWidth; d.classList.add('roll-in');
  });
}

let c = null;
try { c = location.hash.startsWith('#c=') ? decodeShare(location.hash.slice(3)) : null; } catch { c = null; }

if (!c) {
  $('#cd-error').hidden = false;
} else {
  const cat = CATEGORIES[c.category] || CATEGORIES.personale;
  const target = targetOf(c);
  // Anello: per gli eventi annuali conta il ciclo in corso (dall’occorrenza precedente), non la creazione.
  const prevOccurrence = () => {
    const D = Number(c.day.slice(8, 10)), [h, mi] = c.time.split(':').map(Number);
    let [y, m] = wallParts(target, c.tz).day.split('-').map(Number);
    if (c.repeat === 'yearly') y -= 1; else if (--m === 0) { m = 12; y -= 1; }
    return zonedToUtc(y, m, Math.min(D, new Date(y, m, 0).getDate()), h, mi, c.tz);
  };
  const created = c.start ? Date.parse(c.start + 'T00:00:00') : NaN;
  const start = c.repeat !== 'none' ? prevOccurrence() : Number.isFinite(created) ? created : target - 180 * DAY;
  const root = document.documentElement;
  root.style.setProperty('--scene', cat.color);
  document.title = `${c.title} · The Countdown`;

  $('#cd-cat').textContent = cat.label;
  $('#cd-title').textContent = c.title;
  const dayOnly = c.precision === 'day';
  $('#cd-date').textContent = fmtDate(target, { tz: dayOnly ? c.tz : USER_TZ, precision: dayOnly ? 'day' : 'time' }) + (c.precision === 'approx' ? ' · orario indicativo' : '');
  $('#cd-sub').textContent = !dayOnly && c.tz !== USER_TZ ? `Ora locale dell’evento: ${fmtDate(target, { tz: c.tz, weekday: false })} (${c.tz.replace(/_/g, ' ')})` : c.repeat === 'yearly' ? 'Si ripete ogni anno' : c.repeat === 'monthly' ? 'Si ripete ogni mese' : '';
  if (c.note) { $('#cd-note').textContent = c.note; $('#cd-note').hidden = false; }
  $('#cd-foot').textContent = (c.source ? `Data secondo ${c.source}: può cambiare. ` : 'Condiviso con te tramite The Countdown. ') + 'Aggiungendolo ne salvi una copia nel tuo browser: eventuali modifiche di chi l’ha creato non arrivano in automatico.';
  if (c.image) { $('#cd-bg').style.backgroundImage = `url("${c.image.replace(/"/g, '%22')}")`; $('#cd-bg').classList.add('has-image'); }
  else $('#cd-bg').classList.add(`art`, `art--${/^[a-z]+$/.test(c.cover) ? c.cover : 'eclipse'}`);
  $('#cd-main').hidden = false;

  const ring = $('#cd-progress'), dot = $('#cd-dot');
  let shownProgress = 0;
  function drawRing(p) {
    shownProgress = p;
    ring.setAttribute('stroke-dasharray', `${(p * 100).toFixed(3)} 100`);
    const a = p * Math.PI * 2;
    dot.setAttribute('cx', (200 + 186 * Math.sin(a)).toFixed(1));
    dot.setAttribute('cy', (200 - 186 * Math.cos(a)).toFixed(1));
  }
  const progress = () => Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, target - start)));
  // All’apertura l’anello parte da zero e raggiunge il punto reale.
  if (reduced()) drawRing(progress());
  else {
    const from = performance.now();
    const step = now => {
      const t = Math.min(1, (now - from - 900) / 1400);
      if (t > 0) drawRing(progress() * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const timer = $('#cd-timer');
  let celebrated = false;
  function tick(animate = true) {
    const left = target - Date.now();
    const p = parts(left);
    // Ultimo minuto: timer rosso, il numero grande mostra i secondi; negli ultimi 10 la cifra batte.
    const final = left > 0 && left <= 60000, last = final && left <= 10000;
    timer.classList.toggle('is-final', final);
    timer.classList.toggle('is-last10', last);
    const big = timer.querySelector('.ft-days .num');
    if (big.dataset.u !== (final ? 's' : 'd')) { big.dataset.u = final ? 's' : 'd'; delete big.dataset.v; timer.querySelector('.ft-days .lbl').textContent = final ? 'Secondi' : 'Giorni'; }
    for (const n of timer.querySelectorAll('.num')) {
      const before = n.dataset.v;
      setNum(n, String(p[n.dataset.u]).padStart(n.dataset.u === 'd' && p.d > 99 ? 3 : 2, '0'), animate);
      if (last && n.dataset.u === 's' && before !== n.dataset.v && !reduced()) { n.classList.remove('beat'); void n.offsetWidth; n.classList.add('beat'); }
    }
    if (shownProgress >= progress() - .02) drawRing(progress());
    // Momenti speciali: l’ultima settimana e l’arrivo.
    const ms = $('#cd-milestone');
    if (left > 0 && left < 7 * DAY) {
      if (ms.hidden) { ms.hidden = false; root.classList.add('cd-final-week'); }
      ms.textContent = p.d >= 1 ? `Manca meno di una settimana` : 'È oggi!';
    }
    if (left <= 0 && !celebrated) {
      celebrated = true;
      timer.hidden = true;
      $('#cd-now').hidden = false;
      ms.hidden = true;
      root.classList.add('cd-arrived');
      if (left > -5000) confetti(); // solo se l’arrivo avviene con la pagina aperta
    }
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }
  tick(false);

  $('#cd-add').addEventListener('click', () => {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('tc-mine-v3')) || []; } catch {}
    if (list.some(m => m.title === c.title && m.day === c.day)) { toast('È già nella tua lista.'); return; }
    list.push({ id: 'c-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)), kind: 'custom', title: c.title, note: c.note, category: c.category, day: c.day, time: c.time, tz: c.tz, repeat: c.repeat, cover: c.cover, image: c.image, reminders: [], createdAt: new Date().toISOString() });
    try { localStorage.setItem('tc-mine-v3', JSON.stringify(list)); } catch { toast('Spazio del browser esaurito.'); return; }
    const b = $('#cd-add');
    b.textContent = 'Aggiunto ✓ · Apri la lista';
    b.classList.add('is-done');
    b.onclick = () => { location.href = '/#miei'; };
  });
  $('#cd-ics').addEventListener('click', () => downloadIcs({ title: c.title, target, precision: c.precision, tz: c.tz, repeat: c.repeat, description: location.href }));
  $('#cd-share').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: c.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); toast('Link copiato.'); }
    } catch (e) { if (e.name !== 'AbortError') toast('Copia il link dalla barra degli indirizzi.'); }
  });
  // Modalità display: solo titolo e timer, a tutto schermo (per una festa o un viaggio).
  const setDisplay = on => {
    root.classList.toggle('cd-display', on);
    $('#cd-exit').hidden = !on;
    if (on) root.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  $('#cd-display').addEventListener('click', () => setDisplay(true));
  $('#cd-exit').addEventListener('click', () => setDisplay(false));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setDisplay(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDisplay(false); });
}

// Stesso service worker della home: la pagina condivisa si apre anche offline una volta visitata.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('/sw.js').catch(() => {});
