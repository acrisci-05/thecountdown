// Genera favicon, icone della web app e immagine di anteprima (WhatsApp, social) dal logo "T-0".
//   node tools/brand-assets.mjs
// Usa Playwright già installato nella cartella dello spot (ad/node_modules).
import { chromium } from '../ad/node_modules/playwright-core/index.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ASSETS = join(import.meta.dirname, '..', 'assets');
const ACCENT = '#ff3b47', BG = '#07080c';

// Logo statico (fotogramma "pieno" dell’animazione): anello al 75%, segno dello zero, nucleo.
const logo = (size, { glow = true } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  ${glow ? `<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : ''}
  <circle cx="24" cy="24" r="17" fill="none" stroke="#c5c8cf" stroke-opacity=".22" stroke-width="3.2"/>
  <circle cx="24" cy="24" r="17" fill="none" stroke="${ACCENT}" stroke-width="3.8" stroke-linecap="round" pathLength="100" stroke-dasharray="75 100" transform="rotate(-90 24 24)" ${glow ? 'filter="url(#g)"' : ''}/>
  <rect x="22.4" y="2.6" width="3.2" height="7" rx="1.6" fill="#fff"/>
  <circle cx="24" cy="24" r="4.6" fill="${ACCENT}" ${glow ? 'filter="url(#g)"' : ''}/>
</svg>`;

// Icona quadrata: fondo scuro con alone; "safe" = margine per le icone mascherabili di Android.
const iconPage = (size, safe) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${BG};display:grid;place-items:center;
  background-image:radial-gradient(circle at 50% 45%, rgba(255,59,71,.28), transparent 62%)">
  <div style="width:${Math.round(size * safe)}px;height:${Math.round(size * safe)}px">${logo('100%')}</div></body></html>`;

// Anteprima 1200×630 per WhatsApp, Telegram, Facebook, X.
const ogPage = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@200;300&family=Inter:wght@500&family=Sora:wght@400;600&display=block" rel="stylesheet">
<style>
  *{margin:0;box-sizing:border-box} body{width:1200px;height:630px;overflow:hidden;background:${BG};color:#f2f1ee;font-family:Inter;position:relative}
  .planet{position:absolute;right:-120px;top:-60px;width:720px;height:720px;border-radius:50%;
    background:radial-gradient(circle at 68% 22%, rgba(255,59,71,.45), #1a0b0e 26%, #050507 66%);
    box-shadow:0 0 0 3px rgba(255,90,100,.9), 0 0 60px 18px rgba(255,59,71,.55), inset -30px 30px 80px rgba(255,59,71,.2)}
  .glow{position:absolute;inset:0;background:linear-gradient(90deg, ${BG} 30%, rgba(7,8,12,.6) 55%, transparent 80%)}
  .stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 12% 20%,#fff8,transparent),radial-gradient(1px 1px at 30% 70%,#fff6,transparent),radial-gradient(1.5px 1.5px at 48% 12%,#fff7,transparent),radial-gradient(1px 1px at 22% 88%,#fff5,transparent),radial-gradient(1px 1px at 40% 40%,#fff5,transparent)}
  .content{position:absolute;left:72px;top:64px;right:520px}
  .brand{display:flex;align-items:center;gap:20px;font:600 26px/1 Sora;letter-spacing:.32em;margin-bottom:58px}
  .brand svg{width:76px;height:76px}
  h1{font:400 60px/1.08 Sora;letter-spacing:-.01em;text-transform:uppercase;margin-bottom:26px}
  h1 em{font-style:normal;color:${ACCENT}}
  p{font:500 25px/1.4 Inter;color:#c5c8cf}
  .timer{position:absolute;right:120px;top:205px;text-align:center}
  .timer b{display:block;font:200 190px/.85 'Barlow Condensed';text-shadow:0 0 40px rgba(255,59,71,.6)}
  .timer span{font:600 20px/1 Sora;letter-spacing:.32em;color:${ACCENT}}
</style></head><body>
  <div class="stars"></div><div class="planet"></div><div class="glow"></div>
  <div class="timer"><b>037</b><span>GIORNI</span></div>
  <div class="content">
    <div class="brand">${logo(76)}<span>THE COUNTDOWN</span></div>
    <h1>Il conto alla rovescia delle <em>tue cose preferite.</em></h1>
    <p>Film, serie, anime, giochi, concerti e sport. Crea e condividi i tuoi countdown, gratis.</p>
  </div>
</body></html>`;

const browser = await chromium.launch();
const shot = async (html, w, h, file, type = 'png') => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ASSETS, file), type, ...(type === 'jpeg' ? { quality: 86 } : {}) });
  await page.close();
  console.log('  ' + file);
};
await shot(iconPage(192, .78), 192, 192, 'icon-192.png');
await shot(iconPage(512, .78), 512, 512, 'icon-512.png');
await shot(iconPage(512, .58), 512, 512, 'icon-maskable-512.png');
await shot(iconPage(180, .74), 180, 180, 'apple-touch-icon.png');
await shot(iconPage(32, .9), 32, 32, 'favicon-32.png');
await shot(ogPage, 1200, 630, 'og-image.jpg', 'jpeg');
await browser.close();

// Favicon SVG (nitida a qualsiasi dimensione)
await writeFile(join(ASSETS, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${BG}"/>${logo(48, { glow: false }).replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '')}</svg>\n`);
console.log('  favicon.svg');
