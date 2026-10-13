// Catalogo editoriale e definizioni condivise.
// Ogni evento ha una fonte: aggiornare data e fonte insieme quando cambiano.
// precision: 'time' = orario ufficiale · 'approx' = orario indicativo · 'day' = solo giorno (il countdown punta alla mezzanotte del fuso indicato)
// art: dove cercare l'immagine (movie/tv = TMDb, game = RAWG, music = Deezer, photo = Unsplash).
// image: 'assets/nome.webp' per usare una tua immagine locale (ha la precedenza).
// local: data "fluttuante", interpretata nel fuso orario di chi visita (es. Capodanno).

export const CATEGORIES = {
  film:      { label: 'Film',            color: '#ff4d4f', icon: 'film' },
  serie:     { label: 'Serie TV',        color: '#ffa53b', icon: 'tv' },
  gaming:    { label: 'Gaming',          color: '#8f6bff', icon: 'gamepad' },
  anime:     { label: 'Anime & Fumetti', color: '#ff6fae', icon: 'sparkle' },
  musica:    { label: 'Musica',          color: '#d36bff', icon: 'music' },
  sport:     { label: 'Sport',           color: '#2fd27a', icon: 'trophy' },
  tech:      { label: 'Tech',            color: '#36c5f0', icon: 'cpu' },
  ricorrenze:{ label: 'Ricorrenze',      color: '#f3c969', icon: 'party' },
  viaggi:    { label: 'Viaggi',          color: '#2ec4b6', icon: 'plane' },
  personale: { label: 'Personale',       color: '#c9d1dc', icon: 'heart' },
};

// Copertine predefinite (arte generata in CSS, nessuna immagine esterna).
export const COVERS = {
  eclipse:  'Eclissi',
  nebula:   'Nebulosa',
  aurora:   'Aurora',
  dunes:    'Dune',
  neon:     'Neon grid',
  stadium:  'Stadio',
  vinyl:    'Vinile',
  sakura:   'Sakura',
  circuit:  'Circuito',
  sunrise:  'Alba',
  ocean:    'Oceano',
  confetti: 'Festa',
};

export const ACCENTS = [
  { key: 'eclipse', label: 'Rosso eclissi', value: '#ff3b47' },
  { key: 'electric', label: 'Blu elettrico', value: '#3d7bff' },
  { key: 'silver', label: 'Argento freddo', value: '#c9d4e3' },
  { key: 'amber', label: 'Ambra', value: '#ffaa2b' },
  { key: 'violet', label: 'Viola', value: '#9b6bff' },
  { key: 'mint', label: 'Menta', value: '#2fd8a0' },
];

export const CURATED = [
  {
    id: 'lucca-2026', geo: { lat: 43.8429, lon: 10.5027, place: 'Lucca' }, art: { kind: 'photo', q: 'cosplay costume' }, category: 'anime', cover: 'sakura', featured: false,
    title: 'Lucca Comics & Games 2026',
    tagline: 'Sessant’anni di fumetti, giochi e cosplay.',
    date: '2026-10-28T09:00:00+01:00', tz: 'Europe/Rome', precision: 'approx',
    note: 'Dal 28 ottobre al 1° novembre 2026 a Lucca. Orario di apertura indicativo.',
    source: { label: 'AnimeClick', url: 'https://www.animeclick.it/news/108678-lucca-comics-games-2026-ecco-le-date-della-prossima-edizione' },
  },
  {
    id: 'gta-6', art: { kind: 'game', q: 'Grand Theft Auto VI' }, category: 'gaming', cover: 'neon', featured: true,
    title: 'Grand Theft Auto VI',
    tagline: 'Vice City, finalmente.',
    date: '2026-11-19T00:00:00+01:00', tz: 'Europe/Rome', precision: 'day',
    note: 'Lancio su console confermato da Take-Two per il 19 novembre 2026. L’orario di sblocco può variare per piattaforma.',
    source: { label: 'PCWorld', url: 'https://www.pcworld.com/article/3052217/gta-6s-release-date-confirmed-for-real-this-time-seriously.html' },
  },
  {
    id: 'avengers-doomsday', category: 'film', cover: 'eclipse', featured: true, art: { kind: 'movie', q: 'Avengers: Doomsday' },
    title: 'Avengers: Doomsday',
    tagline: 'Il multiverso ha un nuovo nemico.',
    date: '2026-12-16T00:00:00+01:00', tz: 'Europe/Rome', precision: 'day',
    note: 'Uscita nelle sale italiane.',
    source: { label: 'Sorrisi e Canzoni', url: 'https://www.sorrisi.com/cinema/film-in-uscita/avengers-doomsday/' },
  },
  {
    id: 'dune-3', category: 'film', cover: 'dunes', featured: true, art: { kind: 'movie', q: 'Dune: Part Three' },
    title: 'Dune: Parte Tre',
    tagline: 'Il capitolo finale di Villeneuve.',
    date: '2026-12-18T00:00:00-05:00', tz: 'America/New_York', precision: 'day',
    note: 'Data di uscita USA. La data italiana potrebbe differire di qualche giorno.',
    source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dune:_Part_Three' },
  },
  {
    id: 'natale-2026', art: { kind: 'photo', q: 'christmas lights night' }, category: 'ricorrenze', cover: 'confetti',
    title: 'Natale 2026',
    tagline: 'Luci, regali e tavole lunghe.',
    local: '2026-12-25T00:00', precision: 'day',
    note: 'Mezzanotte nel tuo fuso orario.',
  },
  {
    id: 'capodanno-2027', art: { kind: 'photo', q: 'new year fireworks' }, category: 'ricorrenze', cover: 'confetti',
    title: 'Capodanno 2027',
    tagline: 'Dieci, nove, otto…',
    local: '2027-01-01T00:00', precision: 'time',
    note: 'Mezzanotte nel tuo fuso orario.',
  },
  {
    id: 'super-bowl-lxi', geo: { lat: 33.9535, lon: -118.3392, place: 'SoFi Stadium, Inglewood' }, art: { kind: 'photo', q: 'american football stadium night' }, category: 'sport', cover: 'stadium',
    title: 'Super Bowl LXI',
    tagline: 'SoFi Stadium, Los Angeles.',
    date: '2027-02-14T15:30:00-08:00', tz: 'America/Los_Angeles', precision: 'approx',
    note: 'Domenica 14 febbraio 2027 al SoFi Stadium. Orario del kickoff indicativo.',
    source: { label: 'CBS Sports', url: 'https://www.cbssports.com/nfl/news/super-bowl-expected-to-return-to-sofi-in-2027-los-angeles-area-to-host-big-game-for-second-time-since-2022/' },
  },
  {
    id: 'sanremo-2027', geo: { lat: 43.8159, lon: 7.7761, place: 'Sanremo' }, art: { kind: 'photo', q: 'music festival stage lights' }, category: 'musica', cover: 'vinyl', featured: true,
    title: 'Festival di Sanremo 2027',
    tagline: 'La 77ª edizione, dal 16 al 20 febbraio.',
    date: '2027-02-16T20:45:00+01:00', tz: 'Europe/Rome', precision: 'approx',
    note: 'Date ufficiali annunciate da Stefano De Martino. Orario della prima serata indicativo.',
    source: { label: 'Sorrisi e Canzoni', url: 'https://www.sorrisi.com/musica/sanremo/sanremo-2027-le-date-ufficiali/' },
  },
  {
    id: 'f1-2027', geo: { lat: 26.0325, lon: 50.5106, place: 'Sakhir, Bahrain' }, art: { kind: 'photo', q: 'formula 1 race car' }, category: 'sport', cover: 'circuit',
    title: 'Formula 1 · GP del Bahrain 2027',
    tagline: 'Si apre la stagione 2027.',
    date: '2027-03-14T00:00:00+03:00', tz: 'Asia/Bahrain', precision: 'day',
    note: 'Gara inaugurale del calendario 2027. Orario della partenza non ancora indicato qui.',
    source: { label: 'Formula1.com', url: 'https://www.formula1.com/en/latest/article/everything-you-need-to-know-about-the-2027-f1-calendar.B8HW7bYE1DhRm4Ib1nlqT' },
  },
  {
    id: 'ucl-final-2027', geo: { lat: 40.4362, lon: -3.5995, place: 'Madrid' }, art: { kind: 'photo', q: 'football stadium night lights' }, category: 'sport', cover: 'stadium',
    title: 'Finale di Champions League 2027',
    tagline: 'Estadio Metropolitano, Madrid.',
    date: '2027-06-05T21:00:00+02:00', tz: 'Europe/Madrid', precision: 'approx',
    note: 'Sabato 5 giugno 2027. Orario di inizio indicativo, in attesa della UEFA.',
    source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/2027_UEFA_Champions_League_final' },
  },
  {
    id: 'spider-verse-3', category: 'film', cover: 'nebula', art: { kind: 'movie', q: 'Spider-Man: Beyond the Spider-Verse' },
    title: 'Spider-Man: Beyond the Spider-Verse',
    tagline: 'Miles torna nel multiverso.',
    date: '2027-06-25T00:00:00-04:00', tz: 'America/New_York', precision: 'day',
    note: 'Data di uscita USA.',
    source: { label: 'Variety', url: 'https://au.variety.com/2025/film/news/shrek-5-release-date-delayed-june-2027-26382' },
  },
  {
    id: 'shrek-5', category: 'film', cover: 'aurora', art: { kind: 'movie', q: 'Shrek 5' },
    title: 'Shrek 5',
    tagline: 'L’orco più famoso torna in palude.',
    date: '2027-06-30T00:00:00-04:00', tz: 'America/New_York', precision: 'day',
    note: 'Data di uscita USA.',
    source: { label: 'Variety', url: 'https://au.variety.com/2025/film/news/shrek-5-release-date-delayed-june-2027-26382' },
  },
  {
    id: 'batman-2', category: 'film', cover: 'ocean', art: { kind: 'movie', q: 'The Batman Part II' },
    title: 'The Batman – Parte II',
    tagline: 'Gotham non dorme mai.',
    date: '2027-10-01T00:00:00-04:00', tz: 'America/New_York', precision: 'day',
    note: 'Data di uscita USA.',
    source: { label: 'Rolling Stone', url: 'https://www.rollingstone.com/tv-movies/tv-movie-news/the-batman-part-ii-delayed-october-2027-1235219285/' },
  },
  {
    id: 'secret-wars', category: 'film', cover: 'eclipse', art: { kind: 'movie', q: 'Avengers: Secret Wars' },
    title: 'Avengers: Secret Wars',
    tagline: 'La fine della saga del multiverso.',
    date: '2027-12-17T00:00:00-05:00', tz: 'America/New_York', precision: 'day',
    note: 'Data di uscita annunciata.',
    source: { label: 'Sorrisi e Canzoni', url: 'https://www.sorrisi.com/cinema/film-in-uscita/avengers-doomsday/' },
  },
];

// Idee rapide per lo stato vuoto e per il creatore.
export const TEMPLATES = [
  { title: 'Il mio compleanno', category: 'personale', cover: 'confetti', repeat: 'yearly', time: '00:00' },
  { title: 'Le prossime vacanze', category: 'viaggi', cover: 'ocean', repeat: 'none', time: '08:00' },
  { title: 'L’esame', category: 'personale', cover: 'sunrise', repeat: 'none', time: '09:00' },
  { title: 'Il concerto', category: 'musica', cover: 'vinyl', repeat: 'none', time: '21:00' },
];

// Sezione "Il progetto": compila questi valori per mostrarli sul sito.
// I campi vuoti non vengono mostrati; i link devono iniziare con https://.
// avatar: meglio un file locale (es. 'assets/avatar.webp'); le immagini esterne sono bloccate dalla sicurezza del sito.
export const CREATOR = {
  name: 'Antonio Crisci',
  avatar: '',
  role: 'Studente · Creatore',
  bio: 'Studente con la passione per lo sviluppo web. Ho creato The Countdown per non perdere di vista le date che aspetto e condividerle con gli amici: lo porto avanti nel tempo libero, un aggiornamento alla volta.',
  donate: { label: 'Sostieni con Revolut', url: 'https://revolut.me/acrisci05' },
  socials: [
    { label: 'Instagram · @acrisci05', url: 'https://www.instagram.com/acrisci05/' },
  ],
};
