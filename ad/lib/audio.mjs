// Audio sintetizzato in codice: 4 stem musicali a 120 BPM, effetti dalla timeline, voce posizionata.
// Il mix (ducking, loudness −14 LUFS / −1 dBTP) è fatto da FFmpeg in build.mjs.
import { writeFile } from 'node:fs/promises';

export const SR = 48000;
const TAU = Math.PI * 2;

/* ---------- utilità ---------- */
const track = sec => [new Float32Array(Math.ceil(sec * SR)), new Float32Array(Math.ceil(sec * SR))];
let seed = 1234567;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
function add(tr, start, buf, gain = 1, pan = 0) {
  const s0 = Math.round(start * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < buf.length; i++) {
    const j = s0 + i;
    if (j < 0 || j >= tr[0].length) continue;
    tr[0][j] += buf[i] * gl; tr[1][j] += buf[i] * gr;
  }
}
// Passa-basso a un polo (semplice ma musicale)
function lowpass(buf, cutoff) {
  const a = Math.exp(-TAU * cutoff / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
  return buf;
}
function highpass(buf, cutoff) {
  const a = Math.exp(-TAU * cutoff / SR);
  let y = 0, xp = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i]; y = a * (y + x - xp); xp = x; buf[i] = y; }
  return buf;
}
const saw = ph => 2 * (ph - Math.floor(ph + .5));

/* ---------- musica: La minore, Am – F – C – G, 120 BPM (1 battuta = 2 s) ---------- */
const BEAT = .5, BAR = 2;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const ROOTS = [45, 41, 48, 43];
const chordAt = t => Math.floor(t / BAR) % 4;
// Intensità per sezione: hook leggero, showcase e valore pieni, CTA ampio
function energy(t) {
  if (t < 3) return .35;
  if (t < 15) return 1;
  return t < 17 ? .8 : .5;
}

function kick() {
  const n = Math.round(.42 * SR), b = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 48 + 110 * Math.exp(-t * 28);
    ph += f / SR;
    b[i] = Math.sin(TAU * ph) * Math.exp(-t * 7.5) + (t < .004 ? noise() * .4 : 0);
  }
  return b;
}
function clap() {
  const n = Math.round(.28 * SR), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = (t < .01 ? 1 : 0) * .6 + Math.exp(-((t - .02 > 0 ? t - .02 : 0)) * 22) * (t > .02 ? 1 : 0) + (t > .01 && t < .02 ? .8 : 0);
    b[i] = noise() * env * .6;
  }
  return highpass(b, 900);
}
function hat(open = false) {
  const n = Math.round((open ? .22 : .06) * SR), b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = noise() * Math.exp(-(i / SR) * (open ? 18 : 70));
  return highpass(b, 7000);
}

export function music(duration) {
  const stems = { drums: track(duration), bass: track(duration), pad: track(duration), melody: track(duration) };
  const K = kick(), C = clap(), H = hat(), HO = hat(true);
  // Batteria
  for (let t = 0; t < duration - .01; t += BEAT / 2) {
    const beat = Math.round(t / BEAT * 2) / 2, inBar = beat % 4, e = energy(t);
    const isQuarter = Math.abs(beat - Math.round(beat)) < 1e-6;
    if (t < 3) { if (isQuarter && inBar === 0) add(stems.drums, t, K, .55); continue; }
    if (t >= 15 && t < 15.05) continue; // vuoto prima dell'impatto della CTA
    if (isQuarter && (inBar === 0 || inBar === 2 || (inBar === 3.5))) add(stems.drums, t, K, .9 * e);
    if (!isQuarter && inBar === 2.5) add(stems.drums, t, K, .45 * e);
    if (isQuarter && (inBar === 1 || inBar === 3)) add(stems.drums, t, C, .55 * e, .05);
    add(stems.drums, t, Math.abs(inBar - 3.5) < 1e-6 ? HO : H, (isQuarter ? .16 : .26) * e, .35);
  }
  // Basso: crome sulla fondamentale, saw filtrata con piccolo "pluck"
  for (let t = 3; t < duration - .01; t += BEAT / 2) {
    const ci = chordAt(t), f = midiHz(ROOTS[ci] - 12 + ((Math.round(t * 4) % 4 === 3) ? 12 : 0));
    const n = Math.round(.24 * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += f / SR; const tt = i / SR; b[i] = (saw(ph) * .6 + Math.sin(TAU * ph) * .7) * Math.min(1, tt * 200) * Math.exp(-tt * 6); }
    add(stems.bass, t, lowpass(b, 420), .55 * energy(t));
  }
  // Pad: accordi con saw desintonizzate, attacco lento, filtrati
  for (let bar = 0; bar * BAR < duration; bar++) {
    const t0 = bar * BAR, ci = chordAt(t0), len = Math.min(BAR + .4, duration - t0), n = Math.round(len * SR);
    for (const [k, m] of CHORDS[ci].entries()) {
      const b = new Float32Array(n);
      for (const det of [-.11, 0, .09]) {
        const f = midiHz(m) * Math.pow(2, det / 12);
        let ph = (k * .31 + det * 2.7 + 1) % 1; // fase fissa: build sempre identiche
        for (let i = 0; i < n; i++) { ph += f / SR; const tt = i / SR; b[i] += saw(ph) * Math.min(1, tt / .35) * Math.min(1, (len - tt) / .4) * .13; }
      }
      add(stems.pad, t0, lowpass(b, t0 < 3 ? 900 : 1600), .55 * (t0 < 3 ? .8 : 1), (k - 1) * .5);
    }
  }
  // Melodia: arpeggio a sedicesimi (pluck triangolare) in showcase e valore, accenti nella CTA
  const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
  for (let t = 3; t < 15; t += BEAT / 2) {
    const ci = chordAt(t), step = Math.round(t * 4) % pattern.length;
    const m = CHORDS[ci][pattern[step]] + 12 + (step === 5 ? 12 : 0);
    const f = midiHz(m), n = Math.round(.3 * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += f / SR; const tt = i / SR; b[i] = (Math.abs(saw(ph)) * 2 - 1) * Math.exp(-tt * 11); }
    add(stems.melody, t, lowpass(b, 3200), .16, step % 2 ? .4 : -.4);
  }
  for (const [t, m] of [[15.05, 81], [15.55, 84], [16.05, 88], [17.0, 81]]) {
    const f = midiHz(m), n = Math.round(1.4 * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += f / SR; const tt = i / SR; b[i] = (Math.sin(TAU * ph) + .3 * Math.sin(TAU * ph * 2)) * Math.exp(-tt * 2.6); }
    add(stems.melody, t, b, .2);
  }
  return stems;
}

/* ---------- effetti sonori ---------- */
function env(n, a, d) { const e = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; e[i] = Math.min(1, t / a) * Math.exp(-t / d); } return e; }
const SFX = {
  whoosh(dur = .5) {
    const n = Math.round(dur * SR), b = new Float32Array(n);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n, fc = 300 + 5000 * Math.sin(p * Math.PI), r = .985, w = TAU * fc / SR;
      const x = noise(), y = x + 2 * r * Math.cos(w) * y1 - r * r * y2; y2 = y1; y1 = y;
      b[i] = y * .02 * Math.sin(p * Math.PI) ** 1.5;
    }
    return b;
  },
  swish() { return SFX.whoosh(.28).map(v => v * .8); },
  riser(dur = 2) {
    const n = Math.round(dur * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const p = i / n; ph += (200 + 1400 * p * p) / SR; b[i] = (Math.sin(TAU * ph) * .25 + noise() * .35 * p) * p * p; }
    return highpass(b, 150);
  },
  impact() {
    const n = Math.round(1.2 * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (40 + 90 * Math.exp(-t * 14)) / SR; b[i] = Math.sin(TAU * ph) * Math.exp(-t * 3.2) + noise() * Math.exp(-t * 25) * .5; }
    return b;
  },
  impactSoft() { const b = SFX.impact(); return lowpass(b.map(v => v * .7), 1200); },
  pop() {
    const n = Math.round(.12 * SR), b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (900 * Math.exp(-t * 30) + 250) / SR; b[i] = Math.sin(TAU * ph) * Math.exp(-t * 32); }
    return b;
  },
  click() {
    const n = Math.round(.05 * SR), b = new Float32Array(n), e = env(n, .0005, .008);
    for (let i = 0; i < n; i++) b[i] = (Math.sin(TAU * 2400 * i / SR) * .6 + noise() * .4) * e[i];
    return b;
  },
  key() { return SFX.click().map(v => v * .7); },
  tick() {
    const n = Math.round(.04 * SR), b = new Float32Array(n), e = env(n, .0003, .006);
    for (let i = 0; i < n; i++) b[i] = Math.sin(TAU * 1600 * i / SR) * e[i];
    return b;
  },
  press() {
    const n = Math.round(.18 * SR), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; b[i] = Math.sin(TAU * (180 - t * 300) * t) * Math.exp(-t * 30) + noise() * Math.exp(-t * 90) * .3; }
    return b;
  },
  chime() {
    const n = Math.round(1.1 * SR), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; b[i] = (Math.sin(TAU * 880 * t) * Math.exp(-t * 4) + (t > .09 ? Math.sin(TAU * 1318.5 * (t - .09)) * Math.exp(-(t - .09) * 3.5) : 0)) * .5; }
    return b;
  },
  shimmer() {
    const n = Math.round(1.4 * SR), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (const f of [2093, 2637, 3136, 4186]) s += Math.sin(TAU * f * t + f); b[i] = s * .12 * Math.min(1, t / .25) * Math.exp(-t * 2); }
    return b;
  },
};
export function sfx(timeline) {
  const tr = track(timeline.format.duration);
  for (const cue of timeline.sfx) {
    const make = SFX[cue.type];
    if (!make) throw new Error('SFX sconosciuto: ' + cue.type);
    const pan = cue.type === 'swish' || cue.type === 'whoosh' ? (cue.t * 7 % 2) - 1 : 0;
    add(tr, cue.t, make(cue.dur), cue.gain ?? .5, pan * .5);
  }
  return tr;
}
export function voiceTrack(timeline, clips) {
  const tr = track(timeline.format.duration);
  for (const line of timeline.voiceover) {
    const clip = clips.find(c => c.id === line.id);
    add(tr, line.start, clip.samples, 1);
  }
  return tr;
}

/* ---------- WAV float 32 bit stereo (FFmpeg lo legge senza perdite) ---------- */
export async function writeWav(file, [l, r]) {
  const n = l.length, data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) { data.writeFloatLE(l[i], i * 8); data.writeFloatLE(r[i], i * 8 + 4); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([h, data]));
}
