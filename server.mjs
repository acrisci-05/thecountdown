import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const allowedPath = /^(index\.html|countdown\.html|js\/vendor\/[\w.-]+\.js|styles\.css|js\/[\w-]+\.js|assets\/[\w.-]+\.(svg|png|jpe?g|webp|avif))$/;
const contentTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif' };
const cache = new Map();
let envText = '';
try { envText = await readFile(join(root, '.env'), 'utf8'); } catch {}
function envKey(name) {
  if (process.env[name]) return process.env[name].trim();
  const match = envText.match(new RegExp('^\\s*' + name + '\\s*=\\s*["\']?([^"\'\\r\\n]+)["\']?\\s*$', 'm'));
  const value = match ? match[1].trim() : '';
  return /^your_|^la_tua/i.test(value) ? '' : value;
}
const apiKey = envKey('TMDB_API_KEY');
const rawgKey = envKey('RAWG_API_KEY');
const unsplashKey = envKey('UNSPLASH_ACCESS_KEY');
const ticketmasterKey = envKey('TICKETMASTER_API_KEY');
const footballToken = envKey('FOOTBALL_DATA_TOKEN');
const twitchId = envKey('TWITCH_CLIENT_ID');
const twitchSecret = envKey('TWITCH_CLIENT_SECRET');
const HOUR = 60 * 60 * 1000;
const IMAGE_HOSTS = new Set(['image.tmdb.org', 'media.rawg.io', 'api.rawg.io', 'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net', 'images.unsplash.com', 'static.tvmaze.com', 'images.igdb.com', 's1.ticketm.net', 'thespacedevs-prod.nyc3.digitaloceanspaces.com', 's4.anilist.co']);
const DAY = 24 * 60 * 60 * 1000;

// Fetch JSON con cache in memoria (le immagini cambiano raramente: 24 ore).
async function cachedJson(cacheKey, url, headers = {}, ttl = DAY) {
  const prior = cache.get(cacheKey);
  if (prior && prior.expires > Date.now()) return prior.body;
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR');
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const body = await response.json();
  cache.set(cacheKey, { body, expires: Date.now() + ttl });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return body;
}

/* ---------- Ricerca immagini: risultati normalizzati ---------- */
const UTM = '?utm_source=the_countdown&utm_medium=referral';
const unsplashDownloads = new Map();
const year = date => (date ? Number(String(date).slice(0, 4)) || null : null);
const providers = {
  async movie(q) {
    const data = await tmdb('search/movie', { language: 'it-IT', region: 'IT', include_adult: 'false', query: q, page: '1' }, DAY);
    return (data.results || []).filter(m => m.backdrop_path || m.poster_path).map(m => ({
      title: m.title, year: year(m.release_date),
      image: m.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + m.backdrop_path : 'https://image.tmdb.org/t/p/w780' + m.poster_path,
      thumb: m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : 'https://image.tmdb.org/t/p/w300' + m.backdrop_path,
      credit: { label: 'TMDb', url: 'https://www.themoviedb.org/movie/' + m.id },
    }));
  },
  async tv(q) {
    const data = await tmdb('search/tv', { language: 'it-IT', include_adult: 'false', query: q, page: '1' }, DAY);
    return (data.results || []).filter(m => m.backdrop_path || m.poster_path).map(m => ({
      title: m.name, year: year(m.first_air_date),
      image: m.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + m.backdrop_path : 'https://image.tmdb.org/t/p/w780' + m.poster_path,
      thumb: m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : 'https://image.tmdb.org/t/p/w300' + m.backdrop_path,
      credit: { label: 'TMDb', url: 'https://www.themoviedb.org/tv/' + m.id },
    }));
  },
  async game(q) {
    if (!rawgKey) throw Object.assign(new Error('RAWG_NOT_CONFIGURED'), { status: 503 });
    const params = new URLSearchParams({ key: rawgKey, search: q, page_size: '8' });
    const data = await cachedJson('rawg:' + q, 'https://api.rawg.io/api/games?' + params);
    return (data.results || []).filter(g => g.background_image).map(g => ({
      title: g.name, year: year(g.released),
      image: g.background_image.replace('/media/games/', '/media/resize/1280/-/games/'),
      thumb: g.background_image.replace('/media/games/', '/media/resize/640/-/games/'),
      credit: { label: 'RAWG', url: 'https://rawg.io/games/' + g.slug },
    }));
  },
  // Deezer serve solo per le immagini di artisti e album: le date dei concerti arrivano da Ticketmaster.
  async music(q) {
    const [artists, albums] = await Promise.all([
      cachedJson('dz-artist:' + q, 'https://api.deezer.com/search/artist?limit=4&q=' + encodeURIComponent(q)),
      cachedJson('dz-album:' + q, 'https://api.deezer.com/search/album?limit=6&q=' + encodeURIComponent(q)),
    ]);
    const list = [];
    for (const a of artists.data || []) if (a.picture_xl && !/\/artist\/\//.test(a.picture_xl)) list.push({ title: a.name, image: a.picture_xl, thumb: a.picture_medium, credit: { label: 'Deezer', url: a.link } });
    for (const a of albums.data || []) if (a.cover_xl) list.push({ title: a.title + (a.artist ? ' · ' + a.artist.name : ''), image: a.cover_xl, thumb: a.cover_medium, credit: { label: 'Deezer', url: a.link } });
    return list;
  },
  async photo(q) {
    if (!unsplashKey) throw Object.assign(new Error('UNSPLASH_NOT_CONFIGURED'), { status: 503 });
    const params = new URLSearchParams({ query: q, per_page: '8', orientation: 'landscape', content_filter: 'high' });
    const data = await cachedJson('unsplash:' + q, 'https://api.unsplash.com/search/photos?' + params, { Authorization: 'Client-ID ' + unsplashKey, 'Accept-Version': 'v1' });
    return (data.results || []).map(p => {
      unsplashDownloads.set(p.id, p.links?.download_location);
      return {
        id: 'unsplash:' + p.id, title: p.alt_description || p.description || q,
        image: p.urls.regular, thumb: p.urls.small,
        credit: { label: 'Unsplash', url: 'https://unsplash.com/' + UTM, author: p.user?.name, authorUrl: (p.user?.links?.html || 'https://unsplash.com') + UTM },
      };
    });
  },
};
/* ---------- AniList: calendario anime (GraphQL, nessuna chiave) ----------
   Limite standard 90 richieste/minuto, a volte ridotto (oggi 30): poche query, cache di 2 ore,
   e se AniList non risponde si usa l’ultima copia valida. Solo calendario: niente liste o tracking. */
const stale = new Map();
async function anilist(key, query, variables = {}) {
  const prior = cache.get('anilist:' + key);
  if (prior && prior.expires > Date.now()) return prior.body;
  try {
    const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw Object.assign(new Error('ANILIST_' + r.status), { status: r.status === 429 ? 429 : 502 });
    const body = (await r.json()).data;
    cache.set('anilist:' + key, { body, expires: Date.now() + 2 * HOUR });
    stale.set('anilist:' + key, body);
    return body;
  } catch (error) {
    if (stale.has('anilist:' + key)) return stale.get('anilist:' + key);
    throw error;
  }
}
const ANIME_FIELDS = 'id title{romaji english native} format episodes popularity isAdult countryOfOrigin startDate{year month day} nextAiringEpisode{airingAt episode} coverImage{extraLarge large} bannerImage siteUrl genres';
// TMDb per titolo italiano e immagini, solo se la corrispondenza è credibile (stesso anno, origine giapponese).
// Abbinamento prudente: formato compatibile, stesso titolo giapponese, anno coerente.
// Le stagioni successive su TMDb stanno nella scheda della serie originale (anno precedente).
// Se restano più candidati equivalenti, meglio nessuna immagine che quella sbagliata.
const SEQUEL = /season|\b\d+(st|nd|rd|th)\b|part\s*\d|cour|final|第.+[期部章]|続|２|2期/i;
async function tmdbAnimeMatch(m) {
  if (!apiKey) return null;
  const kind = m.format === 'MOVIE' ? 'movie' : ['TV', 'TV_SHORT', 'ONA'].includes(m.format) ? 'tv' : null;
  if (!kind) return null; // OVA, speciali, musicali: su TMDb sono sparsi e ambigui
  const year = m.startDate?.year;
  const native = String(m.title.native || '').replace(/\s+/g, '');
  if (!native) return null;
  const sequel = [m.title.english, m.title.romaji, m.title.native].some(t => SEQUEL.test(t || ''));
  const queries = [...new Set([m.title.english, m.title.romaji].filter(Boolean))];
  try {
    const seen = new Map();
    for (const q of queries) {
      const data = await tmdb('search/' + kind, { language: 'it-IT', query: q, include_adult: 'false', page: '1' }, DAY);
      for (const r of data.results || []) seen.set(r.id, r);
    }
    const scored = [...seen.values()].map(r => {
      const original = String(r.original_name || r.original_title || '').replace(/\s+/g, '');
      const y = Number(String(r.first_air_date || r.release_date || '').slice(0, 4)) || null;
      const exactTitle = original === native;
      const sameTitle = exactTitle || (original.length >= 2 && (native.startsWith(original) || original.startsWith(native)));
      const yearOk = !year || !y ? !year : kind === 'movie' ? Math.abs(y - year) <= 1 : sequel ? y <= year : Math.abs(y - year) <= 1;
      return { r, ok: r.original_language === 'ja' && (r.genre_ids || []).includes(16) && sameTitle && yearOk, exactTitle, exactYear: y === year };
    }).filter(c => c.ok);
    let pick = scored;
    if (pick.length > 1) pick = pick.filter(c => c.exactTitle);
    if (pick.length > 1) pick = pick.filter(c => c.exactYear);
    if (pick.length !== 1) return null;
    const hit = pick[0].r;
    const name = hit.name || hit.title;
    return {
      title: /[぀-ヿ㐀-鿿]/.test(name || '') ? null : name,
      image: tmdbImg(hit.backdrop_path, 'w1280'), poster: tmdbImg(hit.poster_path, 'w342'),
      url: `https://www.themoviedb.org/${kind}/${hit.id}`,
    };
  } catch { return null; }
}
async function animeItem(m, { id, at, day, status, precision, episode, group }) {
  const t = await tmdbAnimeMatch(m);
  const base = m.title.english || m.title.romaji;
  const name = t?.title && t.title.toLowerCase() !== base.toLowerCase() ? t.title : base;
  const format = { TV: 'Serie TV', TV_SHORT: 'Corti', MOVIE: 'Film', ONA: 'Web', OVA: 'OVA', SPECIAL: 'Speciale' }[m.format] || '';
  return {
    id, group, category: 'anime', status,
    title: episode > 1 ? `${name} · Ep. ${episode}` : name,
    day, at, precision,
    image: t?.image || m.bannerImage || m.coverImage?.extraLarge || '', poster: t?.poster || m.coverImage?.large || '',
    overview: [format, (m.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
    source: { label: 'AniList', url: m.siteUrl }, credit: t?.image ? { label: 'TMDb', url: t.url } : null,
    note: at ? 'Orario previsto per la messa in onda secondo AniList (di solito in Giappone): la disponibilità in Italia può essere diversa.' : 'Data di debutto prevista secondo AniList: l’orario non è ancora annunciato.',
  };
}

/* ---------- IGDB (Twitch): token app con rinnovo automatico ---------- */
let igdbToken = { value: '', expires: 0 };
async function igdb(endpoint, body) {
  const key = 'igdb:' + endpoint + ':' + body.replace(/\d{9,}/g, '');
  const prior = cache.get(key);
  if (prior && prior.expires > Date.now()) return prior.body;
  if (!igdbToken.value || igdbToken.expires < Date.now() + 60000) {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(twitchId)}&client_secret=${encodeURIComponent(twitchSecret)}&grant_type=client_credentials`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Object.assign(new Error('TWITCH_AUTH_FAILED'), { status: 502 });
    const j = await r.json();
    igdbToken = { value: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 };
  }
  const r = await fetch('https://api.igdb.com/v4/' + endpoint, { method: 'POST', body, headers: { 'Client-ID': twitchId, Authorization: 'Bearer ' + igdbToken.value, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw Object.assign(new Error('IGDB_ERROR'), { status: 502 });
  const rows = await r.json();
  cache.set(key, { body: rows, expires: Date.now() + 6 * HOUR });
  return rows;
}
// Foto a tema (Unsplash) per elenchi senza immagini proprie, es. partite e Gran Premi.
async function themedPhotos(query) {
  if (!unsplashKey) return [];
  try {
    const list = await providers.photo(query);
    list.slice(0, 3).forEach(p => trackUnsplash(p.id.replace(/^unsplash:/, '')));
    return list;
  } catch { return []; }
}

/* ---------- Uscite e ricorrenze: elenchi normalizzati ---------- */
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const tmdbImg = (path, size) => (path ? 'https://image.tmdb.org/t/p/' + size + path : '');
const feeds = {
  async film() {
    const pages = await Promise.all(['1', '2'].map(page => tmdb('movie/upcoming', { language: 'it-IT', region: 'IT', page }, 6 * 60 * 60 * 1000)));
    return pages.flatMap(p => p.results || []).map(m => ({
      id: 'film-' + m.id, category: 'film', title: m.title || m.original_title, day: m.release_date,
      image: tmdbImg(m.backdrop_path, 'w1280'), poster: tmdbImg(m.poster_path, 'w342'), overview: m.overview,
      source: { label: 'TMDb', url: 'https://www.themoviedb.org/movie/' + m.id }, note: 'Uscita al cinema in Italia secondo TMDb.', status: 'confermata',
    }));
  },
  // Premiere di stagione con orario esatto (TVmaze); se non risponde, nuove serie da TMDb.
  async serie() {
    try {
      const all = await cachedJson('tvmaze-full', 'https://api.tvmaze.com/schedule/full', {}, 6 * HOUR);
      const seen = new Set();
      const list = all.filter(e => e.number === 1 && e.airstamp && Date.parse(e.airstamp) > Date.now() && e._embedded?.show
        && ['Scripted', 'Animation'].includes(e._embedded.show.type) && (e._embedded.show.weight || 0) >= 97
        && !seen.has(e._embedded.show.id) && seen.add(e._embedded.show.id));
      if (list.length) return list.map(e => {
        const show = e._embedded.show;
        const channel = (show.webChannel || show.network || {}).name;
        return {
          id: 'serie-tvm-' + show.id + '-' + e.season, category: 'serie', title: show.name + (e.season > 1 ? ' · Stagione ' + e.season : ''),
          day: e.airstamp.slice(0, 10), at: e.airstamp, precision: e.airtime ? 'time' : 'day',
          image: show.image?.original || '', poster: show.image?.medium || '',
          overview: [channel, (show.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
          source: { label: 'TVmaze', url: show.url }, note: 'Primo episodio della stagione, orario di messa in onda originale secondo TVmaze.', status: 'confermata',
        };
      });
    } catch {}
    const pages = await Promise.all(['1', '2'].map(page => tmdb('discover/tv', { language: 'it-IT', sort_by: 'popularity.desc', 'first_air_date.gte': isoDay(Date.now()), 'first_air_date.lte': isoDay(Date.now() + 240 * DAY), without_genres: '16,10763,10764,10767', include_null_first_air_dates: 'false', page }, 6 * HOUR)));
    return pages.flatMap(p => p.results || []).filter(m => m.backdrop_path && m.popularity >= 5 && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(m.name || '')).map(m => ({
      id: 'serie-' + m.id, category: 'serie', title: m.name || m.original_name, day: m.first_air_date,
      image: tmdbImg(m.backdrop_path, 'w1280'), poster: tmdbImg(m.poster_path, 'w342'), overview: m.overview,
      source: { label: 'TMDb', url: 'https://www.themoviedb.org/tv/' + m.id }, note: 'Prima messa in onda nel paese d’origine secondo TMDb.',
    }));
  },
  // Anime da AniList: "nuove serie" (countdown al primo episodio) e "prossimi episodi" (solo nei prossimi 7 giorni).
  async anime() {
    const now = Math.floor(Date.now() / 1000);
    const [upcoming, airing] = await Promise.all([
      anilist('upcoming', `query{Page(perPage:50){media(type:ANIME,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,isAdult:false){${ANIME_FIELDS}}}}`),
      anilist('airing', `query{Page(perPage:50){media(type:ANIME,status:RELEASING,sort:POPULARITY_DESC,isAdult:false){${ANIME_FIELDS}}}}`),
    ]);
    const items = [];
    for (const m of upcoming?.Page?.media || []) {
      if (m.isAdult) continue;
      const ep = m.nextAiringEpisode;
      if (ep && ep.episode === 1 && ep.airingAt > now) {
        items.push(animeItem(m, { id: 'anime-al-' + m.id, group: 'nuove', at: new Date(ep.airingAt * 1000).toISOString(), day: new Date(ep.airingAt * 1000).toISOString().slice(0, 10), status: 'confermata', precision: 'time', episode: 1 }));
      } else if (m.startDate?.year && m.startDate?.month && m.startDate?.day) {
        const day = `${m.startDate.year}-${String(m.startDate.month).padStart(2, '0')}-${String(m.startDate.day).padStart(2, '0')}`;
        items.push(animeItem(m, { id: 'anime-al-' + m.id, group: 'nuove', day, status: 'prevista', precision: 'day', episode: 1 }));
      }
    }
    for (const m of airing?.Page?.media || []) {
      const ep = m.nextAiringEpisode;
      if (!ep || m.isAdult || ep.airingAt <= now || ep.airingAt > now + 7 * 86400) continue;
      items.push(animeItem(m, { id: `anime-al-${m.id}-ep${ep.episode}`, group: 'episodi', at: new Date(ep.airingAt * 1000).toISOString(), day: new Date(ep.airingAt * 1000).toISOString().slice(0, 10), status: 'prevista', precision: 'time', episode: ep.episode }));
    }
    const list = await Promise.all(items);
    if (list.length) return list;
    // Ripiego: TMDb, se AniList non è raggiungibile e non c’è copia in cache.
    const data = await tmdb('discover/tv', { language: 'en-US', sort_by: 'popularity.desc', with_genres: '16', with_original_language: 'ja', 'first_air_date.gte': isoDay(Date.now()), 'first_air_date.lte': isoDay(Date.now() + 365 * DAY), page: '1' }, 6 * HOUR);
    return (data.results || []).filter(m => m.backdrop_path || m.poster_path).map(m => ({
      id: 'anime-' + m.id, group: 'nuove', category: 'anime', status: 'prevista', title: m.name || m.original_name, day: m.first_air_date,
      image: tmdbImg(m.backdrop_path, 'w1280'), poster: tmdbImg(m.poster_path, 'w342'), overview: m.overview,
      source: { label: 'TMDb', url: 'https://www.themoviedb.org/tv/' + m.id }, note: 'Prima messa in onda in Giappone secondo TMDb.',
    }));
  },
  // Videogiochi: IGDB (date per piattaforma, più precise) se configurato, altrimenti RAWG.
  async giochi() {
    if (twitchId && twitchSecret) {
      try {
        const rows = await igdb('release_dates', `fields date,platform.abbreviation,game.name,game.slug,game.hypes,game.cover.image_id,game.artworks.image_id,game.screenshots.image_id; where date > ${Math.floor(Date.now() / 1000)} & date < ${Math.floor((Date.now() + 365 * DAY) / 1000)} & game.hypes > 15; sort date asc; limit 500;`);
        const games = new Map();
        for (const r of rows) {
          if (!r.game?.name || !r.date) continue;
          const g = games.get(r.game.id) || { r, platforms: new Set() };
          if (r.platform?.abbreviation) g.platforms.add(r.platform.abbreviation);
          games.set(r.game.id, g);
        }
        const igdbImg = (id, size) => (id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : '');
        const list = [...games.values()].map(({ r, platforms }) => {
          const wide = r.game.artworks?.[0]?.image_id || r.game.screenshots?.[0]?.image_id;
          return {
            id: 'giochi-igdb-' + r.game.id, category: 'gaming', title: r.game.name, day: new Date(r.date * 1000).toISOString().slice(0, 10),
            image: igdbImg(wide, 't_1080p') || igdbImg(r.game.cover?.image_id, 't_cover_big'), poster: igdbImg(r.game.cover?.image_id, 't_cover_big'),
            overview: [...platforms].join(' · '), platforms: [...platforms], status: 'prevista',
            source: { label: 'IGDB', url: 'https://www.igdb.com/games/' + r.game.slug }, note: 'Prima data di uscita secondo IGDB: può variare per piattaforma e paese.',
          };
        }).filter(g => g.image);
        if (list.length) return list;
      } catch {}
    }
    if (!rawgKey) throw Object.assign(new Error('RAWG_NOT_CONFIGURED'), { status: 503 });
    const params = new URLSearchParams({ key: rawgKey, dates: isoDay(Date.now() + DAY) + ',' + isoDay(Date.now() + 365 * DAY), ordering: '-added', page_size: '40' });
    const data = await cachedJson('rawg-upcoming:' + isoDay(Date.now()), 'https://api.rawg.io/api/games?' + params, {}, 6 * 60 * 60 * 1000);
    return (data.results || []).filter(g => !g.tba && g.released && g.background_image).map(g => ({
      id: 'giochi-' + g.id, category: 'gaming', title: g.name, day: g.released,
      image: g.background_image.replace('/media/games/', '/media/resize/1280/-/games/'),
      poster: g.background_image.replace('/media/games/', '/media/resize/640/-/games/'),
      overview: (g.platforms || []).map(p => p.platform?.name).filter(Boolean).join(' · '), status: 'prevista',
      platforms: (g.platforms || []).map(p => p.platform?.name).filter(Boolean),
      source: { label: 'RAWG', url: 'https://rawg.io/games/' + g.slug }, note: 'Data di uscita secondo RAWG: può variare per piattaforma e paese.',
    }));
  },
  // Concerti in Italia (Ticketmaster): i più rilevanti, uno per artista e città.
  async concerti() {
    if (!ticketmasterKey) throw Object.assign(new Error('TICKETMASTER_NOT_CONFIGURED'), { status: 503 });
    const params = new URLSearchParams({ apikey: ticketmasterKey, countryCode: 'IT', classificationName: 'music', sort: 'relevance,desc', size: '120', locale: '*' });
    const data = await cachedJson('tm-music', 'https://app.ticketmaster.com/discovery/v2/events.json?' + params, {}, 6 * HOUR);
    const seen = new Set();
    return (data._embedded?.events || []).filter(e => e.dates?.start?.localDate).map(e => {
      const venue = e._embedded?.venues?.[0] || {};
      const city = venue.city?.name || '';
      const key = (e._embedded?.attractions?.[0]?.id || e.name) + '|' + city;
      if (seen.has(key)) return null;
      seen.add(key);
      const img = (e.images || []).filter(i => i.ratio === '16_9').sort((a, b) => b.width - a.width)[0] || (e.images || [])[0];
      const poster = (e.images || []).filter(i => i.ratio === '3_2' || i.ratio === '4_3').sort((a, b) => b.width - a.width)[0];
      const exact = e.dates.start.dateTime && !e.dates.start.timeTBA && !e.dates.start.noSpecificTime;
      return {
        id: 'concerti-' + e.id, category: 'musica', title: e.name.replace(/\s+/g, ' ').trim() + (city ? ' · ' + city : ''),
        day: e.dates.start.localDate, at: exact ? e.dates.start.dateTime : undefined, precision: exact ? 'time' : 'day',
        image: img?.url || '', poster: poster?.url || img?.url || '',
        overview: [venue.name, city].filter(Boolean).join(', '),
        source: { label: 'Ticketmaster', url: e.url }, note: 'Data e orario secondo Ticketmaster. Controlla sempre il biglietto.', status: exact ? 'confermata' : 'prevista',
      };
    }).filter(Boolean).slice(0, 60);
  },
  // Serie A e Champions League (football-data.org), prossimi 30 giorni.
  async calcio() {
    if (!footballToken) throw Object.assign(new Error('FOOTBALL_NOT_CONFIGURED'), { status: 503 });
    const headers = { 'X-Auth-Token': footballToken };
    const range = `dateFrom=${isoDay(Date.now())}&dateTo=${isoDay(Date.now() + 30 * DAY)}`;
    const comps = [['SA', 'Serie A'], ['CL', 'Champions League']];
    const lists = await Promise.all(comps.map(([code]) => cachedJson('fd-' + code + range, `https://api.football-data.org/v4/competitions/${code}/matches?${range}`, headers, HOUR).catch(() => ({ matches: [] }))));
    const photos = await themedPhotos('football stadium night');
    let i = 0;
    // Della Champions teniamo solo le partite delle squadre di Serie A.
    const italian = new Set((lists[0].matches || []).flatMap(m => [m.homeTeam?.id, m.awayTeam?.id]));
    return lists.flatMap((l, n) => (l.matches || []).filter(m => ['SCHEDULED', 'TIMED'].includes(m.status) && (n === 0 || italian.has(m.homeTeam?.id) || italian.has(m.awayTeam?.id))).map(m => {
      const photo = photos.length ? photos[i++ % photos.length] : null;
      const stage = m.matchday ? 'Giornata ' + m.matchday : String(m.stage || '').replace(/_/g, ' ').toLowerCase();
      return {
        id: 'calcio-' + m.id, category: 'sport', title: `${m.homeTeam?.shortName || m.homeTeam?.name || '?'} – ${m.awayTeam?.shortName || m.awayTeam?.name || '?'}`,
        day: m.utcDate.slice(0, 10), at: m.utcDate, precision: m.status === 'TIMED' ? 'time' : 'approx',
        image: photo?.image || '', poster: photo?.thumb || '', credit: photo?.credit,
        overview: comps[n][1] + (stage ? ' · ' + stage : ''),
        status: m.status === 'TIMED' ? 'confermata' : 'prevista', source: { label: 'football-data.org', url: 'https://www.football-data.org/' }, note: 'Orario del calcio d’inizio: può essere anticipato o posticipato.',
      };
    }));
  },
  // Calendario di Formula 1 (Jolpica, ex Ergast): stagione in corso e successiva.
  async f1() {
    const y = new Date().getFullYear();
    const seasons = await Promise.all([y, y + 1].map(yy => cachedJson('f1-' + yy, `https://api.jolpi.ca/ergast/f1/${yy}/races/?format=json&limit=40`, {}, 12 * HOUR).catch(() => null)));
    const photos = await themedPhotos('formula 1 race car');
    return seasons.flatMap(d => d?.MRData?.RaceTable?.Races || []).map((r, i) => {
      const photo = photos.length ? photos[i % photos.length] : null;
      const at = r.time ? `${r.date}T${r.time}` : undefined;
      return {
        id: `f1-${r.season}-${r.round}`, category: 'sport', title: `F1 · ${r.raceName.replace('Grand Prix', 'GP')}`,
        day: r.date, at, precision: at ? 'time' : 'day',
        image: photo?.image || '', poster: photo?.thumb || '', credit: photo?.credit,
        overview: `${r.Circuit?.circuitName || ''} · ${r.Circuit?.Location?.locality || ''}, ${r.Circuit?.Location?.country || ''} · Round ${r.round}`,
        status: 'confermata', source: { label: 'Jolpica F1', url: 'https://github.com/jolpica/jolpica-f1' }, note: 'Orario di partenza della gara secondo il calendario ufficiale.',
      };
    });
  },
  // Lanci spaziali (Launch Library 2): l'API anonima concede 15 richieste l'ora, quindi cache lunga.
  async spazio() {
    const data = await cachedJson('ll2', 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=normal', {}, 3 * HOUR);
    return (data.results || []).filter(l => l.net).map(l => {
      const p = String(l.net_precision?.abbrev || l.net_precision?.name || '');
      const precision = /^(SEC|MIN|Second|Minute)/i.test(p) ? 'time' : /^(HR|Hour)/i.test(p) ? 'approx' : 'day';
      return {
        id: 'spazio-' + l.id, category: 'tech', title: l.name, day: l.net.slice(0, 10), at: l.net, precision,
        image: l.image?.image_url || '', poster: l.image?.thumbnail_url || l.image?.image_url || '',
        overview: [l.launch_service_provider?.name, l.pad?.location?.name].filter(Boolean).join(' · '),
        status: l.status?.abbrev === 'Go' ? 'confermata' : 'prevista', source: { label: 'Launch Library 2', url: 'https://thespacedevs.com/llapi' }, note: 'Finestra di lancio secondo The Space Devs: i lanci vengono spesso rinviati.',
      };
    });
  },
  async feste() {
    const y = new Date().getFullYear();
    const years = await Promise.all([y, y + 1].map(yy => cachedJson('nager:' + yy, 'https://date.nager.at/api/v3/PublicHolidays/' + yy + '/IT')));
    return years.flat().filter(h => h.global !== false).map(h => ({
      id: 'feste-' + h.date, category: 'ricorrenze', title: h.localName, day: h.date, local: true,
      overview: 'Festività nazionale in Italia.', status: 'confermata',
      source: { label: 'Nager.Date', url: 'https://date.nager.at/PublicHoliday/Italy/' + h.date.slice(0, 4) }, note: 'Mezzanotte nel tuo fuso orario.',
    }));
  },
};

/* ---------- Proxy immagini (serve solo alla card da condividere) ----------
   Ogni passo di redirect viene ricontrollato (https + host in elenco) e il corpo viene letto
   a pezzi, interrompendo appena supera il limite: un server remoto non può farci scaricare file enormi. */
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/;
function allowedImageUrl(raw, base) {
  let u;
  try { u = new URL(raw, base); } catch { throw Object.assign(new Error('BAD_URL'), { status: 400 }); }
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.has(u.hostname) || u.username || u.password || (u.port && u.port !== '443')) throw Object.assign(new Error('HOST_NOT_ALLOWED'), { status: 400 });
  return u;
}
async function fetchAllowedImage(raw) {
  let target = allowedImageUrl(raw);
  const signal = AbortSignal.timeout(12000);
  let r;
  for (let hop = 0; ; hop++) {
    r = await fetch(target, { signal, redirect: 'manual', headers: { Accept: 'image/*' } });
    if (r.status < 300 || r.status >= 400) break;
    if (hop >= 3) throw Object.assign(new Error('TOO_MANY_REDIRECTS'), { status: 502 });
    const location = r.headers.get('location');
    if (!location) throw Object.assign(new Error('BAD_REDIRECT'), { status: 502 });
    target = allowedImageUrl(location, target);
  }
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!r.ok || !IMAGE_TYPES.test(type) || !r.body) throw Object.assign(new Error('IMAGE_UNAVAILABLE'), { status: 502 });
  if (Number(r.headers.get('content-length')) > IMAGE_MAX_BYTES) throw Object.assign(new Error('IMAGE_TOO_LARGE'), { status: 413 });
  const reader = r.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > IMAGE_MAX_BYTES) { await reader.cancel().catch(() => {}); throw Object.assign(new Error('IMAGE_TOO_LARGE'), { status: 413 }); }
    chunks.push(value);
  }
  return { type, body: Buffer.concat(chunks.map(c => Buffer.from(c)), size) };
}

// Unsplash chiede di segnalare quando una foto viene effettivamente usata.
async function trackUnsplash(id) {
  const location = unsplashDownloads.get(id);
  if (!location || !unsplashKey || cache.has('track:' + id)) return;
  cache.set('track:' + id, { body: true, expires: Date.now() + DAY });
  try { await fetch(location, { headers: { Authorization: 'Client-ID ' + unsplashKey }, signal: AbortSignal.timeout(8000) }); } catch {}
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(body));
}
async function tmdb(endpoint, params={}, ttl=15*60*1000) {
  if (!apiKey) {
    const error = new Error('TMDB_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const query = new URLSearchParams(params).toString();
  return cachedJson('tmdb:' + endpoint + '?' + query, 'https://api.themoviedb.org/3/' + endpoint + '?' + query + '&api_key=' + encodeURIComponent(apiKey), {}, ttl);
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://media.rawg.io https://api.rawg.io https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net https://images.unsplash.com https://static.tvmaze.com https://images.igdb.com https://s1.ticketm.net https://thespacedevs-prod.nyc3.digitaloceanspaces.com https://s4.anilist.co; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
}
const server = createServer(async (req,res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
      let result;
      if (url.pathname === '/api/movies/upcoming') {
        result = await tmdb('movie/upcoming',{language:'it-IT',region:'IT',page:'1'});
      } else if (url.pathname === '/api/movies/search') {
        const query = (url.searchParams.get('query')||'').trim().slice(0,80);
        if (query.length < 2) return json(res,400,{error:'QUERY_TOO_SHORT'});
        result = await tmdb('search/movie',{language:'it-IT',region:'IT',include_adult:'false',query,page:'1'});
      } else if (url.pathname === '/api/art') {
        const kind = url.searchParams.get('kind') || '';
        const query = (url.searchParams.get('q')||'').trim().slice(0,80);
        if (!Object.hasOwn(providers, kind)) return json(res,400,{error:'UNKNOWN_KIND'});
        if (query.length < 2) return json(res,400,{error:'QUERY_TOO_SHORT'});
        result = { results: (await providers[kind](query)).slice(0, 8) };
      } else if (url.pathname === '/api/feed') {
        const type = url.searchParams.get('type') || '';
        if (!Object.hasOwn(feeds, type)) return json(res,400,{error:'UNKNOWN_FEED'});
        const today = isoDay(Date.now());
        const seen = new Set();
        result = { results: (await feeds[type]()).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.day || '') && f.day >= today && f.title && !seen.has(f.id) && seen.add(f.id)).sort((a, b) => a.day.localeCompare(b.day)) };
      } else if (url.pathname === '/api/img') {
        let image;
        try { image = await fetchAllowedImage(url.searchParams.get('u') || ''); }
        catch (error) { return json(res, error.status || 502, { error: error.message }); }
        res.writeHead(200, { 'Content-Type': image.type, 'Content-Length': image.body.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
        return res.end(image.body);
      } else if (url.pathname === '/api/art/status') {
        result = { movie: Boolean(apiKey), tv: Boolean(apiKey), game: Boolean(rawgKey), music: true, photo: Boolean(unsplashKey) };
      } else if (url.pathname === '/api/art/track') {
        await trackUnsplash(String(url.searchParams.get('id')||'').replace(/^unsplash:/,''));
        result = { ok: true };
      } else {
        return json(res,404,{error:'NOT_FOUND'});
      }
      return json(res,200,result);
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
    if (req.url?.startsWith('/api/')) return json(res,502,{error:'TMDB_UNAVAILABLE'});
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
