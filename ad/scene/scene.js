// Scena dello spot: ogni proprietà visiva è una funzione pura del tempo t (secondi).
// Il renderer chiama window.setup(timeline) una volta, poi window.renderAt(t) per ogni sotto-fotogramma.
(() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeInOut = p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeIn = p => p * p * p;
  const back = p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const lerp = (a, b, p) => a + (b - a) * p;
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const set = (el, css) => { for (const k in css) el.style[k] = css[k]; };
  // Visibilità: entra in [a, a+d], esce in [b-d, b]
  const window_ = (t, a, b, d = .35) => Math.min(easeOut(seg(t, a, a + d)), 1 - easeIn(seg(t, b - d, b)));

  let TL = null;

  /* ---------- Fondale ---------- */
  function buildStars() {
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let html = '';
    for (let i = 0; i < 140; i++) {
      html += `<circle cx="${(rnd() * 1080).toFixed(1)}" cy="${(rnd() * 1300).toFixed(1)}" r="${(rnd() * 1.6 + .4).toFixed(2)}" fill="#fff" opacity="${(rnd() * .6 + .2).toFixed(2)}"/>`;
    }
    $('stars').innerHTML = html;
  }

  /* ---------- Cifre che scorrono (solo quella che cambia) ---------- */
  function rollNum(el, now, prev, p) {
    const n = String(now), o = String(prev).padStart(n.length, '0');
    let html = '';
    for (let i = 0; i < n.length; i++) {
      if (n[i] === o[i] || p >= 1) { html += `<span class="dg"><b>${n[i]}</b></span>`; continue; }
      const e = easeOut(p);
      html += `<span class="dg"><b class="o" style="transform:translateY(${(e * 55).toFixed(1)}%);opacity:${(1 - e).toFixed(3)};filter:blur(${(e * 3).toFixed(1)}px)">${o[i]}</b><b style="transform:translateY(${((e - 1) * 55).toFixed(1)}%);opacity:${e.toFixed(3)};filter:blur(${((1 - e) * 3).toFixed(1)}px)">${n[i]}</b></span>`;
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  function countdownAt(remaining) {
    const s = Math.max(0, Math.floor(remaining));
    return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
  }

  /* ---------- Logo orbitale (stesso disegno del sito) ---------- */
  function logos(t) {
    for (const svg of document.querySelectorAll('.logo')) {
      svg.querySelector('.lg-sweep').style.transform = `rotate(${(t / 12) * 360}deg)`;
      svg.querySelector('.lg-sat').style.transform = `rotate(${-(t / 7) * 360}deg)`;
      svg.querySelector('.lg-min').style.transform = `rotate(${Math.floor(t) * 6}deg)`;
    }
  }

  /* ---------- Contenuti della lista (eventi di esempio, senza marchi di terzi) ---------- */
  const CARDS = [
    { cat: 'Film', icon: 'film', c: '#ff4d4f', art: 'art-eclipse', title: 'Il film dell’anno', rem: 37 * 86400 + 5 * 3600 + 12 * 60 + 48, status: 'Confermata' },
    { cat: 'Anime', icon: 'sparkle', c: '#ff6fae', art: 'art-sakura', title: 'Nuovo episodio', rem: 2 * 86400 + 14 * 3600 + 30 * 60 + 5, status: 'Prevista' },
    { cat: 'Concerti', icon: 'music', c: '#d36bff', art: 'art-vinyl', title: 'Live a Milano', rem: 15 * 86400 + 20 * 3600 + 45 * 60 + 31, status: 'Confermata' },
    { cat: 'Sport', icon: 'trophy', c: '#2fd27a', art: 'art-stadium', title: 'La finale', rem: 54 * 86400 + 21 * 3600 + 9 * 60 + 12, status: 'Confermata' },
    { cat: 'Gaming', icon: 'gamepad', c: '#8f6bff', art: 'art-neon', title: 'Day one', rem: 37 * 86400 + 59 * 60 + 40, status: 'Prevista' },
  ];
  function buildList() {
    $('list').innerHTML = CARDS.map((k, i) => `<div class="lc" id="lc${i}" style="--c:${k.c}">
      <span class="th ${k.art}"></span>
      <div><p class="cat"><svg><use href="#i-${k.icon}"/></svg>${k.cat}</p><h4>${k.title}</h4><p class="tm" id="tm${i}"></p></div>
      <span class="badge ${k.status === 'Prevista' ? 'pv' : ''}">${k.status}</span></div>`).join('');
  }

  /* ---------- Shutter (taglio di luce) ---------- */
  function shutter(t) {
    const el = $('shutter'), line = $('shutter-line');
    const cuts = [[2.78, 3.22], [14.78, 15.22]];
    for (const [a, b] of cuts) {
      if (t >= a && t <= b) {
        const p = (t - a) / (b - a);
        // prima metà: il sipario copre da sinistra; seconda metà: si apre verso destra
        const cover = easeInOut(clamp(p / .5)), open = easeInOut(clamp((p - .5) / .5));
        set(el, { display: 'block', clipPath: p < .5 ? `inset(0 ${((1 - cover) * 100).toFixed(2)}% 0 0)` : `inset(0 0 0 ${(open * 100).toFixed(2)}%)` });
        set(line, { left: `${(p < .5 ? cover : open) * 100}%`, opacity: String(Math.sin(p * Math.PI) * .6 + .4) });
        return;
      }
    }
    el.style.display = 'none';
  }

  /* ---------- Sottotitoli dalla timeline della voce ---------- */
  function subs(t) {
    const box = $('subs'), text = $('subs-text');
    const vo = TL.voiceover.find(v => t >= v.start - .05 && t <= v.start + (v.duration || 2) + .25);
    if (!vo) { box.style.opacity = '0'; return; }
    const p = Math.min(easeOut(seg(t, vo.start - .05, vo.start + .2)), 1 - easeIn(seg(t, vo.start + (vo.duration || 2), vo.start + (vo.duration || 2) + .25)));
    if (text.textContent !== vo.text) text.textContent = vo.text;
    set(box, { opacity: p.toFixed(3), transform: `translateY(${((1 - p) * 16).toFixed(1)}px)` });
  }

  /* ---------- Scene ---------- */
  function background(t) {
    // Il pianeta respira appena; l'orbita avanza: è il "tempo che scorre".
    const drift = Math.sin(t * .7) * 6;
    $('planet').setAttribute('transform', `translate(0 ${drift.toFixed(2)}) rotate(${(t * 1.2).toFixed(2)} 540 760)`);
    const ctaGlow = easeOut(seg(t, 15.0, 16.0));
    $('rim').setAttribute('stroke-dasharray', `${lerp(100, 100, 0)} 0`);
    const a = (t / 18) * Math.PI * 2 - Math.PI / 2;
    const x = 540 + 520 * Math.cos(a), y = 760 + 150 * Math.sin(a);
    for (const id of ['orbit-dot', 'orbit-glow']) { $(id).setAttribute('cx', x.toFixed(1)); $(id).setAttribute('cy', y.toFixed(1)); }
    // In showcase e valore il pianeta si allontana e si scurisce per far spazio all'interfaccia.
    const away = window_(t, 3.0, 15.0, .6);
    $('planet').style.opacity = String(lerp(1, .38, away));
    $('bg-glow').style.opacity = String(lerp(1, .55, away) + ctaGlow * .4);
    $('orbit').style.opacity = String(lerp(1, .5, away));
  }

  function hook(t) {
    const vis = 1 - easeIn(seg(t, 2.7, 3.0));
    const root = $('hook');
    root.style.display = t < 3.05 ? 'block' : 'none';
    if (t >= 3.05) return;
    root.style.opacity = vis.toFixed(3);
    root.style.transform = `scale(${(1 + seg(t, 2.55, 3.0) * .08).toFixed(4)})`;
    root.style.filter = `blur(${(seg(t, 2.6, 3.0) * 8).toFixed(2)}px)`;
    const l1 = easeOut(seg(t, .15, .7)), l2 = easeOut(seg(t, .45, 1.0));
    $('h1a').style.transform = `translateY(${((1 - l1) * 105).toFixed(2)}%)`;
    $('h1b').style.transform = `translateY(${((1 - l2) * 105).toFixed(2)}%)`;
    const eb = easeOut(seg(t, .8, 1.3));
    set($('hook-eyebrow'), { opacity: eb.toFixed(3), letterSpacing: `${lerp(.7, .42, eb).toFixed(3)}em` });
    [1.0, 1.3, 1.6].forEach((at, i) => {
      const p = seg(t, at, at + .45);
      set($(`pill-${i + 1}`), { opacity: clamp(p * 2).toFixed(3), transform: `translateY(${((1 - easeOut(p)) * 40).toFixed(1)}px) scale(${(.85 + .15 * back(p)).toFixed(4)})` });
    });
    // Respiro della parola "MANCA?" mentre si attende
    const breathe = 1 + Math.sin(seg(t, 1.0, 2.7) * Math.PI) * .02;
    $('h1b').style.transform += ` scale(${breathe.toFixed(4)})`;
  }

  function showcase(t) {
    const root = $('show');
    const on = t >= 2.95 && t < 10.15;
    root.style.display = on ? 'block' : 'none';
    if (!on) return;
    // Ingresso 2.5D del pannello, oscillazione "idrodinamica" lenta, uscita in profondità
    const pin = easeOut(seg(t, 2.95, 3.75)), pout = easeInOut(seg(t, 9.75, 10.15));
    const sway = Math.sin(t * 1.1) * 1.2, bob = Math.sin(t * 1.4) * 8;
    const rx = lerp(26, 9, pin) + Math.sin(t * .9) * .8 + pout * 10;
    const ry = lerp(-24, -10, pin) + lerp(0, 16, seg(t, 3.75, 9.7)) + sway + pout * 30;
    const tz = lerp(-700, 0, pin) - pout * 900, ty = lerp(220, 0, pin) + bob;
    set($('panel'), { transform: `translate3d(0, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`, opacity: (Math.min(1, pin * 1.4) * (1 - pout)).toFixed(3) });

    // Timer dell'evento principale: conta davvero, una cifra alla volta
    const start = 37 * 86400 + 5 * 3600 + 12 * 60 + 48;
    const elapsed = Math.max(0, t - 3);
    const now = countdownAt(start - elapsed), prev = countdownAt(start - elapsed + 1);
    const p = clamp((elapsed % 1) / .32);
    rollNum($('d-days'), pad(now.d, 3), pad(prev.d, 3), p);
    rollNum($('d-h'), pad(now.h), pad(prev.h), p);
    rollNum($('d-m'), pad(now.m), pad(prev.m), p);
    rollNum($('d-s'), pad(now.s), pad(prev.s), elapsed < 1 ? 1 : p);

    // Card che entrano a cascata; la quinta spinge la lista in alto
    const at = [4.2, 4.5, 4.8, 5.1, 5.4];
    CARDS.forEach((k, i) => {
      const q = seg(t, at[i], at[i] + .55), e = easeOut(q);
      set($(`lc${i}`), { opacity: clamp(q * 1.8).toFixed(3), transform: `translateX(${((1 - e) * 360).toFixed(1)}px) rotateY(${((1 - e) * -28).toFixed(2)}deg)` });
      const r = countdownAt(k.rem - elapsed);
      $(`tm${i}`).innerHTML = `<b>${r.d}</b>g · <b>${pad(r.h)}:${pad(r.m)}:${pad(r.s)}</b>`;
    });
    $('list').style.transform = `translateY(${(-146 * easeInOut(seg(t, 5.4, 5.95))).toFixed(1)}px)`;

    // Schede: la pillola attiva scorre tra Presto, Anime, Film
    const tabs = [...document.querySelectorAll('#tabs .tab')];
    const stops = [[8.2, 1], [8.7, 2], [9.2, 3]];
    let pos = 0, active = 0;
    for (const [s, idx] of stops) { const q = easeInOut(seg(t, s, s + .3)); if (t >= s) active = q > .5 ? idx : active; pos = t >= s ? lerp(pos, idx, q) : pos; }
    const w = (tabs[0].offsetWidth + 6);
    set($('tab-active'), { width: `${tabs[0].offsetWidth}px`, transform: `translateX(${(pos * w).toFixed(1)}px)` });
    tabs.forEach((tb, i) => tb.classList.toggle('on', i === active));

    // Chip in primo piano (2.5D): entrano con un piccolo rimbalzo e fluttuano
    [['chip-events', 6.5, -1], ['chip-tz', 7.0, 1]].forEach(([id, s, dir]) => {
      const q = seg(t, s, s + .5), out = easeIn(seg(t, 9.7, 10.0));
      set($(id), { opacity: (clamp(q * 2) * (1 - out)).toFixed(3), transform: `translateY(${(Math.sin((t + s) * 1.6) * 7).toFixed(1)}px) rotate(${(dir * (1 - easeOut(q)) * 8).toFixed(2)}deg) scale(${(.6 + .4 * back(q)).toFixed(4)})` });
    });
  }

  function value(t) {
    const root = $('value');
    const on = t >= 10.0 && t < 15.25;
    root.style.display = on ? 'block' : 'none';
    if (!on) return;
    const min = easeOut(seg(t, 10.0, 10.6));
    const morph = easeInOut(seg(t, 13.05, 13.45)); // il modulo si trasforma nella card creata
    const sway = Math.sin(t * 1.05) * 1.2, bob = Math.sin(t * 1.3) * 7;
    set($('modal'), {
      opacity: (min * (1 - morph)).toFixed(3),
      transform: `translate3d(0, ${(lerp(160, 0, min) + bob).toFixed(1)}px, ${(lerp(-500, 0, min) - morph * 300).toFixed(1)}px) rotateX(${(lerp(18, 5, min) + morph * 8).toFixed(2)}deg) rotateY(${(lerp(14, 4, min) + sway).toFixed(2)}deg) scale(${(1 - morph * .25).toFixed(4)})`,
    });
    // Digitazione deterministica, un carattere alla volta
    const full = 'Viaggio a Lisbona';
    const chars = Math.round(full.length * seg(t, 10.35, 11.45));
    $('typed').textContent = full.slice(0, chars);
    $('caret').style.opacity = (t < 11.45 || Math.floor((t - 11.45) / .45) % 2 === 0) ? '1' : '0';
    $('q-100').classList.toggle('on', t >= 11.8);
    $('q-100').style.transform = `scale(${(1 - Math.sin(seg(t, 11.8, 11.95) * Math.PI) * .06).toFixed(4)})`;
    $('cv-ocean').classList.toggle('on', t >= 12.35);
    $('cv-ocean').style.transform = `scale(${(1 + Math.sin(seg(t, 12.35, 12.6) * Math.PI) * .08).toFixed(4)})`;
    $('st2').classList.toggle('on', t >= 11.6);
    $('st3').classList.toggle('on', t >= 12.2);
    const press = Math.sin(seg(t, 12.95, 13.12) * Math.PI);
    set($('m-btn'), { transform: `scale(${(1 - press * .05).toFixed(4)})`, filter: `brightness(${(1 + press * .25).toFixed(3)})` });

    // Card creata: nasce dal modulo, poi sale per lasciare spazio al pannello di condivisione
    const cin = easeOut(seg(t, 13.15, 13.75)), up = easeInOut(seg(t, 13.85, 14.35));
    set($('created'), {
      opacity: clamp(seg(t, 13.1, 13.4) * 1.5).toFixed(3),
      transform: `translate3d(0, ${(lerp(80, 0, cin) - up * 40 + Math.sin(t * 1.3) * 6).toFixed(1)}px, ${(lerp(-200, 0, cin)).toFixed(1)}px) rotateX(${(lerp(12, 3, cin)).toFixed(2)}deg) rotateY(${(Math.sin(t * .9) * 3 - 3).toFixed(2)}deg) scale(${(lerp(.82, 1, back(cin)) - up * .06).toFixed(4)})`,
    });
    const cs = countdownAt(100 * 86400 - Math.max(0, t - 13.15));
    $('c-s').textContent = pad(cs.s);
    // Pannello di condivisione con QR e azioni
    const sin = easeOut(seg(t, 13.9, 14.4));
    set($('sheet'), { opacity: sin.toFixed(3), transform: `translateY(${((1 - sin) * 260).toFixed(1)}px)` });
    const tq = seg(t, 14.5, 14.8);
    set($('toast'), { opacity: (clamp(tq * 2) * (1 - seg(t, 14.95, 15.2))).toFixed(3), transform: `translate(-50%, ${((1 - easeOut(tq)) * -30).toFixed(1)}px) scale(${(.8 + .2 * back(tq)).toFixed(4)})` });
    // Chip dei vantaggi, visibili mentre si compila il modulo
    [['chip-noacc', 10.7, -1], ['chip-local', 11.4, 1]].forEach(([id, s, dir]) => {
      const q = seg(t, s, s + .5), out = easeIn(seg(t, 13.5, 13.85));
      set($(id), { opacity: (clamp(q * 2) * (1 - out)).toFixed(3), transform: `translateY(${(Math.sin((t + s) * 1.5) * 6).toFixed(1)}px) rotate(${(dir * (1 - easeOut(q)) * 8).toFixed(2)}deg) scale(${(.6 + .4 * back(q)).toFixed(4)})` });
    });
  }

  function cta(t) {
    const root = $('cta');
    const on = t >= 15.0;
    root.style.display = on ? 'block' : 'none';
    if (!on) return;
    const lg = seg(t, 15.2, 15.9);
    set($('cta-logo'), { opacity: clamp(lg * 1.6).toFixed(3), transform: `scale(${(.5 + .5 * back(lg)).toFixed(4)}) rotate(${((1 - easeOut(lg)) * -90).toFixed(2)}deg)` });
    const th = easeOut(seg(t, 15.6, 16.1));
    set($('cta-the'), { opacity: th.toFixed(3), letterSpacing: `${lerp(1.4, .8, th).toFixed(3)}em` });
    // "COUNTDOWN": lettere che entrano in sequenza
    const name = $('cta-name');
    if (!name.dataset.ready) { name.innerHTML = [...'COUNTDOWN'].map(c => `<span>${c}</span>`).join(''); name.dataset.ready = '1'; }
    [...name.children].forEach((s, i) => {
      const q = easeOut(seg(t, 15.7 + i * .045, 16.15 + i * .045));
      set(s, { opacity: q.toFixed(3), transform: `translateY(${((1 - q) * 60).toFixed(1)}px)`, filter: `blur(${((1 - q) * 8).toFixed(1)}px)` });
    });
    const tag = $('cta-tag');
    if (tag.textContent !== TL.product.tagline) tag.textContent = TL.product.tagline;
    const tg = easeOut(seg(t, 16.15, 16.6));
    set(tag, { opacity: tg.toFixed(3), transform: `translateY(${((1 - tg) * 24).toFixed(1)}px)` });
    $('cta-label').textContent = TL.product.cta;
    const bt = seg(t, 16.35, 16.8), pulse = Math.sin(seg(t, 16.6, 16.9) * Math.PI);
    set($('cta-btn'), { opacity: clamp(bt * 1.8).toFixed(3), transform: `translateX(-50%) scale(${(.85 + .15 * back(bt) + pulse * .04).toFixed(4)})` });
    $('cta-shine').style.left = `${lerp(-30, 130, easeInOut(seg(t, 16.7, 17.3)))}%`;
    $('cta-sub').textContent = TL.product.ctaSub;
    $('cta-sub').style.opacity = easeOut(seg(t, 16.6, 17.0)).toFixed(3);
    $('cta-url').textContent = TL.product.url || '';
    $('cta-url').style.opacity = easeOut(seg(t, 16.8, 17.2)).toFixed(3);
  }

  function brand(t) {
    // Il marchio in alto accompagna showcase e valore; nell'hook e nella CTA il logo è altrove
    const v = window_(t, 3.2, 14.85, .4);
    set($('brand'), { opacity: v.toFixed(3), transform: `translateY(${((1 - v) * -20).toFixed(1)}px)` });
  }

  window.setup = timeline => {
    TL = timeline;
    buildStars();
    buildList();
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData('The Countdown');
      qr.make();
      $('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    }
    return document.fonts.ready.then(() => true);
  };
  window.renderAt = t => {
    background(t); hook(t); showcase(t); value(t); cta(t); brand(t); logos(t); shutter(t); subs(t);
  };
})();
