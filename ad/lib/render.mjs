// Render video: Playwright cattura i sotto-fotogrammi della scena e li passa a FFmpeg,
// che li fonde (motion blur con otturatore a 180°) e codifica in H.264 High a 60 fps.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import ffmpegPath from 'ffmpeg-static';

const SCENE = pathToFileURL(join(import.meta.dirname, '..', 'scene', 'index.html')).href;

async function openScene(browser, timeline) {
  const page = await browser.newPage({ viewport: { width: timeline.format.width, height: timeline.format.height }, deviceScaleFactor: 1 });
  await page.goto(SCENE, { waitUntil: 'networkidle' });
  await page.evaluate(tl => window.setup(tl), timeline);
  return page;
}

// Istanti dei sotto-fotogrammi di un fotogramma: otturatore a 180° = metà dell'intervallo,
// campionato in modo uniforme e centrato sul fotogramma.
export function subframeTimes(frame, { fps, subframes, shutterDegrees }) {
  const open = (shutterDegrees / 360) / fps;
  const start = frame / fps - open / 2;
  return Array.from({ length: subframes }, (_, k) => start + open * (k + .5) / subframes);
}

export async function renderStills(timeline, times, outDir) {
  const browser = await chromium.launch();
  const page = await openScene(browser, timeline);
  const files = [];
  for (const t of times) {
    await page.evaluate(tt => window.renderAt(tt), t);
    const file = join(outDir, `still_${String(t.toFixed(2)).replace('.', '_')}.png`);
    await page.screenshot({ path: file });
    files.push(file);
  }
  await browser.close();
  return files;
}

// Un worker = una pagina + un processo FFmpeg che riceve JPEG a (fps × subframes) e restituisce un segmento MP4.
async function renderChunk(browser, timeline, from, to, outFile, onFrame) {
  const { fps, subframes } = timeline.format;
  const page = await openScene(browser, timeline);
  const weights = Array(subframes).fill(1).join(' ');
  const ff = spawn(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps * subframes), '-i', 'pipe:0',
    '-vf', `tmix=frames=${subframes}:weights='${weights}',select='not(mod(n+1\\,${subframes}))',setpts=N/${fps}/TB,format=yuv420p`,
    '-r', String(fps), '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '15', '-g', String(fps), '-bf', '2',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ff.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg ' + code)))));
  for (let f = from; f < to; f++) {
    for (const t of subframeTimes(f, timeline.format)) {
      await page.evaluate(tt => window.renderAt(tt), Math.max(0, t));
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    onFrame();
  }
  ff.stdin.end();
  await done;
  await page.close();
}

export async function renderVideo(timeline, outFile, workDir, { workers = 4 } = {}) {
  const { fps, duration } = timeline.format;
  const total = Math.round(fps * duration);
  const size = Math.ceil(total / workers);
  const browser = await chromium.launch();
  let doneFrames = 0, last = 0;
  const started = Date.now();
  const tick = () => {
    doneFrames++;
    const pct = Math.floor(doneFrames / total * 100);
    if (pct >= last + 5) { last = pct; const el = (Date.now() - started) / 1000; console.log(`  video ${pct}% · ${doneFrames}/${total} fotogrammi · ${el.toFixed(0)} s`); }
  };
  const chunks = [];
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const from = w * size, to = Math.min(total, from + size);
    if (from >= to) break;
    const file = join(workDir, `chunk_${w}.mp4`);
    chunks.push(file);
    jobs.push(renderChunk(browser, timeline, from, to, file, tick));
  }
  await Promise.all(jobs);
  await browser.close();
  // I segmenti hanno gli stessi parametri: si uniscono senza ricodifica.
  const list = join(workDir, 'chunks.txt');
  await writeFile(list, chunks.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile]);
  for (const c of chunks) await rm(c, { force: true });
  return { frames: total, seconds: (Date.now() - started) / 1000 };
}

export function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.stdout.on('data', () => {});
    p.on('close', code => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${args.join(' ')}\n${err.slice(-2000)}`))));
  });
}
