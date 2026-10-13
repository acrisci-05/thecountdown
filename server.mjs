import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const allowedPath = /^(index\.html|countdown\.html|sw\.js|manifest\.webmanifest|js\/vendor\/[\w.-]+\.js|styles\.css|js\/[\w-]+\.js|assets\/[\w.-]+\.(svg|png|jpe?g|webp|avif))$/;
const contentTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.webmanifest':'application/manifest+json' };
// Chiavi API dal file .env (mai mandate alla pagina): caricate in process.env prima di importare le API.
try {
  const envText = await readFile(join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]*)["']?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}
const { handleApi } = await import('./lib/api.mjs');

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(body));
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://media.rawg.io https://api.rawg.io https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net https://images.unsplash.com https://static.tvmaze.com https://images.igdb.com https://s1.ticketm.net https://thespacedevs-prod.nyc3.digitaloceanspaces.com https://s4.anilist.co https://i.ytimg.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
}
const server = createServer(async (req,res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      // Stessa logica della funzione Vercel: costruiamo una Request standard e copiamo la Response.
      const response = await handleApi(new Request(new URL(req.url, 'http://127.0.0.1'), { method: req.method }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(req.method === 'HEAD' ? '' : Buffer.from(await response.arrayBuffer()));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filename = normalize(resolve(root,'.'+requested));
    const rel = relative(root,filename).split(sep).join('/');
    if (rel.startsWith('..') || !allowedPath.test(rel)) {
      res.writeHead(404,{ 'Content-Type':'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const details = await stat(filename);
    if (!details.isFile()) throw new Error('Not found');
    const body = await readFile(filename);
    res.writeHead(200,{ 'Content-Type':contentTypes[extname(filename)]||'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method==='HEAD'?'':body);
  } catch (error) {
    if (error.status) return json(res,error.status,{error:error.message});
    res.writeHead(404,{ 'Content-Type':'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
const defaultPort=Number(process.env.PORT||4187);
const openOnStart=process.argv.includes('--open');

function listenOn(port) {
  return new Promise((resolve,reject)=>{
    const onError=error=>{server.off('listening',onListening);reject(error);};
    const onListening=()=>{server.off('error',onError);resolve();};
    server.once('error',onError);
    server.once('listening',onListening);
    server.listen(port,'127.0.0.1');
  });
}

function openBrowser(url) {
  if (process.platform !== 'win32') return;
  const browser=spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{
    detached:true,
    stdio:'ignore',
    windowsHide:true
  });
  browser.on('error',error=>console.error('Non riesco ad aprire il browser automaticamente:',error.message));
  browser.unref();
}

let port=defaultPort;
for (let attempt=0;attempt<10;attempt++,port++) {
  try {
    await listenOn(port);
    break;
  } catch (error) {
    if (error.code==='EADDRINUSE' && !process.env.PORT && attempt<9) {
      console.log(`La porta ${port} è già occupata; provo la ${port+1}…`);
      continue;
    }
    console.error(`Impossibile avviare The Countdown sulla porta ${port}: ${error.message}`);
    if (error.code==='EADDRINUSE') console.error('Chiudi l’altro servizio oppure imposta PORT nel file .env.');
    process.exit(1);
  }
}

const url=`http://127.0.0.1:${port}`;
console.log(`The Countdown è pronto: ${url}`);
console.log('Lascia aperta questa finestra mentre usi il sito. Premi Ctrl+C per fermarlo.');
if (openOnStart) openBrowser(url);
