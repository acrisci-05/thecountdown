const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE = {events:'tc-events-v2',favorites:'tc-favorites-v1',theme:'tc-theme-v1'};
const CATEGORIES = ['Cinema','Cultura','Gaming','Personale','Natura'];
const ART = ['moon','dawn','forest','ember','film'];
const readStore = (key, fallback) => { try { const value=JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
let events = Array.isArray(readStore(STORE.events,[])) ? readStore(STORE.events,[]) : [];
let favorites = new Set(readStore(STORE.favorites,[]));
let movies = [];
let upcomingMovies = [];
const movieCatalog = new Map();
let movieMode = 'upcoming';
let activeFilter = 'Tutti';
let activeView = 'grid';
let showHistory = false;
let editingId = null;
let calendarCursor = new Date(new Date().getFullYear(),new Date().getMonth(),1);
let toastTimer;
const previousRemaining = new Map();
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeImage = value => {
  if(typeof value !== 'string') return '';
  if(/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)) return value;
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length < 850000) return value;
  return '';
};
const persistEvents = () => { try { localStorage.setItem(STORE.events,JSON.stringify(events)); } catch { notify('Spazio locale esaurito: prova a rimuovere una copertina.'); } };
const persistFavorites = () => localStorage.setItem(STORE.favorites,JSON.stringify([...favorites]));
const notify = message => { const node=$('#toast'); node.textContent=message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),2800); };
const categoryOf = event => event.category || (event.tmdbId ? 'Cinema' : 'Personale');
const movieId = id => 'movie-'+id;
function movieDate(dateString) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateString||'')) return null;
  const [year,month,day]=dateString.split('-').map(Number);
  const value=new Date(year,month-1,day,0,0,0,0);
  return Number.isFinite(value.getTime())?value:null;
}
function eventDate(event) {
  let date=new Date(event.date);
  if(event.repeat==='yearly' && Number.isFinite(date.getTime())) {
    const now=new Date(), next=new Date(now.getFullYear(),date.getMonth(),date.getDate(),date.getHours(),date.getMinutes());
    if(next<=now) next.setFullYear(next.getFullYear()+1);
    return next;
  }
  return Number.isFinite(date.getTime())?date:null;
}
function msLeft(eventOrDate) {
  const date=eventOrDate instanceof Date?eventOrDate:eventDate(eventOrDate);
  return date?date.getTime()-Date.now():0;
}
function timeParts(ms) {
  ms=Math.max(0,ms);
  return {days:Math.floor(ms/86400000),hours:Math.floor(ms%86400000/3600000),minutes:Math.floor(ms%3600000/60000),seconds:Math.floor(ms%60000/1000)};
}
const two = value => String(value).padStart(2,'0');
const three = value => String(value).padStart(3,'0');
function dateText(date, options={day:'2-digit',month:'long',year:'numeric'}) {
  return new Intl.DateTimeFormat('it-IT',options).format(date);
}
function dateStamp(date) { return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric'}).format(date).toUpperCase(); }
function dateForInput(date) {
  const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return d.toISOString().slice(0,16);
}
function imagePath(path,size='w500') {
  if(!path) return '';
  if(/^https:\/\/image\.tmdb\.org\//.test(path)) return path;
  if(!/^\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(path)) return '';
  return 'https://image.tmdb.org/t/p/'+size+path;
}
function getMovieEvent(movie) {
  const date=movieDate(movie.release_date);
  return {id:movieId(movie.id),title:movie.title||movie.original_title||'Film in arrivo',description:movie.overview||'Una nuova storia sta per arrivare al cinema.',category:'Cinema',date:date?date.toISOString():null,createdAt:null,tmdbId:movie.id,poster:imagePath(movie.poster_path),backdrop:imagePath(movie.backdrop_path,'w1280'),rating:Number(movie.vote_average)||0,release:movie.release_date,art:'film'};
}
function visibleMovieEvents() {
  const stored=new Set(events.filter(e=>e.tmdbId).map(e=>String(e.tmdbId)));
  return [...movieCatalog.values()].filter(movie=>favorites.has(movieId(movie.id))&&!stored.has(String(movie.id))).map(getMovieEvent);
}
function collectionEvents(includeFavorites=false) {
  const all=includeFavorites?events.concat(visibleMovieEvents()):events;
  return all.map(event=>({...event,_date:eventDate(event)})).filter(event=>event._date);
}
function futureEvents() { return collectionEvents(true).filter(event=>event._date>Date.now()); }
function heroCandidates() {
  const saved=events.map(event=>({...event,_date:eventDate(event)})).filter(event=>event._date&&event._date>Date.now());
  const fromApi=upcomingMovies.filter(movie=>movieDate(movie.release_date)>Date.now()).map(getMovieEvent).map(event=>({...event,_date:eventDate(event)}));
  return saved.concat(fromApi).sort((a,b)=>a._date-b._date);
}
function updateHero() {
  const event=heroCandidates()[0];
  const title=$('#hero-event-title'), dateNode=$('#hero-event-date'), heroTimer=$('#hero-timer');
  if(!event) {
    title.textContent='Il prossimo grande momento';$('#hero-category').textContent='MOMENTO IN EVIDENZA';$('#hero-event-description').textContent='Crea un countdown e dagli una forma.';dateNode.textContent='QUANDO VUOI TU';
    heroTimer.dataset.date='';$('#hero-poster').classList.remove('loaded');$('#hero-poster').removeAttribute('src');$('#poster-placeholder').hidden=false;$('#hero-backdrop').classList.remove('has-image');$('#hero-progress').style.width='0%';$('#ticket-day').textContent='—';$('#ticket-month').textContent='NEXT MOMENT';return;
  }
  const date=event._date||eventDate(event);
  title.textContent=event.title;$('#hero-category').textContent=event.category==='Cinema'?'PROSSIMA USCITA · CINEMA':'IL TUO PROSSIMO MOMENTO';$('#hero-event-description').textContent=event.description||'Una nuova storia sta per cominciare.';
  dateNode.textContent=dateStamp(date);heroTimer.dataset.date=date.toISOString();
  const poster=safeImage(event.cover)||safeImage(event.poster);
  const img=$('#hero-poster'),placeholder=$('#poster-placeholder');
  if(poster){img.alt='Locandina di '+event.title;img.onload=()=>{img.classList.add('loaded');placeholder.hidden=true;};img.onerror=()=>{img.classList.remove('loaded');placeholder.hidden=false;};img.src=poster;}else{img.classList.remove('loaded');img.removeAttribute('src');placeholder.hidden=false;}
  const backdrop=safeImage(event.backdrop)||poster;
  if(backdrop){$('#hero-backdrop').style.setProperty('--hero-image','url("'+backdrop.replace(/"/g,'%22')+'")');$('#hero-backdrop').classList.add('has-image');}else $('#hero-backdrop').classList.remove('has-image');
  $('#poster-meta').textContent=event.category==='Cinema'?'PROSSIMA USCITA':'UN MOMENTO IN TEMPO';$('#poster-year').textContent=String(date.getFullYear());$('#ticket-day').textContent=new Intl.DateTimeFormat('it-IT',{day:'2-digit'}).format(date);$('#ticket-month').textContent=new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'}).format(date).toUpperCase();
  const start=event.createdAt?new Date(event.createdAt).getTime():date.getTime()-180*86400000;
  const progress=Math.max(0,Math.min(100,(Date.now()-start)/Math.max(1,date.getTime()-start)*100));$('#hero-progress').style.width=progress.toFixed(1)+'%';
}
function tickTimers() {
  const heroDate=$('#hero-timer').dataset.date;
  if(heroDate){const time=timeParts(new Date(heroDate).getTime()-Date.now());$$('#hero-timer [data-unit]').forEach(node=>{const unit=node.dataset.unit;node.textContent=unit==='days'?three(time.days):two(time[unit]);});}
  $$('.event-countdown').forEach(node=>{const event=events.find(e=>e.id===node.dataset.id)||visibleMovieEvents().find(e=>e.id===node.dataset.id);if(!event)return;const left=msLeft(event),parts=timeParts(left);node.innerHTML='<span><b>'+parts.days+'</b>d</span><span><b>'+two(parts.hours)+'</b>h</span><span><b>'+two(parts.minutes)+'</b>m</span><span><b>'+two(parts.seconds)+'</b>s</span>';});
  const detailTimer=$('.detail-timer');
  if(detailTimer){const left=new Date(detailTimer.dataset.date).getTime()-Date.now(),parts=timeParts(left);$$('b[data-detail-unit]',detailTimer).forEach(node=>node.textContent=node.dataset.detailUnit==='days'?parts.days:two(parts[node.dataset.detailUnit]));}
  checkRemindersAndSounds();
}
function checkRemindersAndSounds() {
  const now=Date.now();
  events.forEach(event=>{
    const date=eventDate(event);if(!date)return;
    const left=date.getTime()-now,previous=previousRemaining.get(event.id);
    if(event.sound&&previous>0&&left<=0)playChime();
    previousRemaining.set(event.id,left);
    const reminderFor=date.toDateString();
    if(event.reminder&&event.reminderFor!==reminderFor&&left>0&&left<=86400000&&'Notification'in window&&Notification.permission==='granted'){
      try{new Notification('Manca un giorno: '+event.title,{body:event.description||'Il momento che aspettavi è quasi qui.',tag:'tc-'+event.id});event.reminderFor=reminderFor;persistEvents();}catch{}
    }
  });
}
function playChime() {
  try {const context=new (window.AudioContext||window.webkitAudioContext)();const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(660,context.currentTime);oscillator.frequency.exponentialRampToValueAtTime(880,context.currentTime+.22);gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.09,context.currentTime+.035);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.65);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.67);oscillator.onended=()=>context.close();} catch {}
}
function movieCard(movie,index) {
  const event=getMovieEvent(movie),poster=safeImage(event.poster),release=movieDate(movie.release_date);
  const added=events.some(item=>String(item.tmdbId)===String(movie.id));
  const rating=event.rating?event.rating.toFixed(1):'';
  return "<article class='movie-card' style='animation-delay:"+Math.min(index*45,270)+"ms' data-movie='"+escapeHtml(movie.id)+"'><div class='movie-poster'>"+(poster?"<img src='"+escapeHtml(poster)+"' alt='' loading='lazy' />":"")+"<span class='movie-release-badge'><i class='live-dot'></i> "+(release?escapeHtml(new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short'}).format(release)).toUpperCase():'DATA DA DEFINIRE')+"</span>"+(rating?"<span class='movie-rating'>★ "+escapeHtml(rating)+"</span>":"")+"<span class='movie-poster-title'>"+escapeHtml(event.title)+"</span></div><div class='movie-copy'><h3 title='"+escapeHtml(event.title)+"'>"+escapeHtml(event.title)+"</h3><p>"+(release?escapeHtml(dateStamp(release)):'IN ARRIVO')+"</p><div class='movie-card-actions'><button type='button' data-movie-details='"+escapeHtml(movie.id)+"'>Dettagli ↗</button><button class='movie-add' type='button' data-add-movie='"+escapeHtml(movie.id)+"' "+(added?'disabled':'')+">"+(added?'✓ Aggiunto':'＋ Aggiungi')+"</button></div></div></article>";
}
function renderMovieShelf() {
  const shelf=$('#movie-shelf'),note=$('#movie-note');
  if(movieMode==='search'&&!$('#movie-search').value.trim()){shelf.innerHTML="<div class='loading-state'>Scrivi il titolo di un film per cercarlo.</div>";note.hidden=true;return;}
  const now=new Date();let list=movies.filter(movie=>movieDate(movie.release_date)>now);
  if(movieMode==='search'&&$('#movie-search').value.trim()) {const query=$('#movie-search').value.trim().toLowerCase();list=list.filter(movie=>(movie.title+' '+movie.original_title).toLowerCase().includes(query));}
  else if(movieMode==='popular') list.sort((a,b)=>(Number(b.popularity)||0)-(Number(a.popularity)||0));
  else list.sort((a,b)=>movieDate(a.release_date)-movieDate(b.release_date));
  list=list.slice(0,18);
  if(list.length){shelf.innerHTML=list.map(movieCard).join('');note.hidden=true;}
  else {shelf.innerHTML="<div class='loading-state'>Nessun film futuro trovato. Puoi comunque creare il tuo countdown.</div>";note.hidden=false;note.textContent='Le date di uscita dipendono dalle informazioni disponibili in Italia.';}
}
async function loadMovies() {
  const shelf=$('#movie-shelf'),note=$('#movie-note');
  try {
    const response=await fetch('/api/movies/upcoming',{headers:{'Accept':'application/json'}});
    const payload=await response.json();
    if(!response.ok) throw new Error(payload.error||'Servizio non disponibile');
    movies=Array.isArray(payload.results)?payload.results:[];
    upcomingMovies=movies;
    movies.forEach(movie=>movieCatalog.set(String(movie.id),movie));
    $('#source-status').textContent='DATI LIVE';$('.live-source').classList.remove('is-offline');
    note.hidden=true;
    renderMovieShelf();updateHero();renderCollection();
  } catch(error) {
    $('#source-status').textContent=error.message==='TMDB_NOT_CONFIGURED'?'TMDB NON CONFIGURATO':'NON DISPONIBILE';$('.live-source').classList.add('is-offline');
    shelf.innerHTML="<div class='loading-state'>Le locandine non sono raggiungibili in questo momento. I tuoi countdown restano disponibili.</div>";
    note.hidden=false;note.textContent=error.message==='TMDB_NOT_CONFIGURED'?'Aggiungi la chiave TMDb nel file .env per caricare film e locandine.':"Connessione TMDb non disponibile: puoi usare tutte le funzioni personali.";
    updateHero();renderCollection();
  }
}
async function searchMovies(query) {
  clearTimeout(searchMovies.timer);
  searchMovies.timer=setTimeout(async()=>{
    if(!query.trim()){movies=upcomingMovies;renderMovieShelf();return;}
    try{const response=await fetch('/api/movies/search?query='+encodeURIComponent(query.trim()),{headers:{'Accept':'application/json'}});const payload=await response.json();if(!response.ok)throw new Error();movies=Array.isArray(payload.results)?payload.results:[];movies.forEach(movie=>movieCatalog.set(String(movie.id),movie));renderMovieShelf();}
    catch{notify('La ricerca film non è al momento disponibile.');}
  },240);
}
function allFavoriteEvents() {
  const storedIds=new Set(events.filter(e=>e.tmdbId).map(e=>String(e.tmdbId)));
  return events.concat([...movieCatalog.values()].filter(movie=>favorites.has(movieId(movie.id))&&!storedIds.has(String(movie.id))).map(getMovieEvent));
}
function eventMarkup(event,index,archived=false) {
  const date=event._date||eventDate(event),remaining=Math.max(0,date.getTime()-Date.now()),time=timeParts(remaining);
  const image=safeImage(event.cover)||safeImage(event.poster),art=ART.includes(event.art)?event.art:(event.tmdbId?'film':'moon');
  const fav=favorites.has(event.id),start=event.createdAt?new Date(event.createdAt).getTime():date.getTime()-30*86400000;
  const progress=Math.max(2,Math.min(100,(Date.now()-start)/Math.max(1,date.getTime()-start)*100));
  const isEditable=events.some(item=>item.id===event.id);
  return "<article class='event-card' style='animation-delay:"+Math.min(index*45,225)+"ms'><div class='event-art event-art--"+art+"'>"+(image?"<img src='"+escapeHtml(image)+"' alt='' loading='lazy' />":"")+"<div class='event-card-top'><span class='event-pill'>"+escapeHtml(archived?'GIÀ SUCCESSO':event.tmdbId?'IN USCITA':'IN ATTESA')+"</span><button type='button' class='favorite-button "+(fav?'is-favorite':'')+"' data-action='favorite' data-id='"+escapeHtml(event.id)+"' aria-label='"+(fav?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+"' aria-pressed='"+fav+"'>"+(fav?'♥':'♡')+"</button></div><span class='art-sigil' aria-hidden='true'>"+(event.category==='Cinema'?'✦':event.category==='Gaming'?'✕':event.category==='Natura'?'☼':'◷')+"</span><span class='art-number'>"+String(index+1).padStart(2,'0')+" / MOMENTO</span></div><div class='event-body'><span class='event-category'>"+escapeHtml(event.category||'Personale')+(event.repeat==='yearly'?' · OGNI ANNO':'')+"</span><h3 title='"+escapeHtml(event.title)+"'>"+escapeHtml(event.title)+"</h3><p>"+escapeHtml(event.description||'Un momento che vale la pena aspettare.')+"</p>"+(archived?"<div class='event-time'><span>È successo</span><small> · "+escapeHtml(dateStamp(date))+"</small></div>":"<div class='event-time event-countdown' data-id='"+escapeHtml(event.id)+"'><span><b>"+time.days+"</b>d</span><span><b>"+two(time.hours)+"</b>h</span><span><b>"+two(time.minutes)+"</b>m</span><span><b>"+two(time.seconds)+"</b>s</span></div><div class='event-progress' aria-label='"+Math.round(progress)+"% del tempo trascorso'><span style='width:"+progress.toFixed(1)+"%'></span></div>")+"<div class='event-card-footer'><time datetime='"+date.toISOString()+"'>"+escapeHtml(dateStamp(date))+"</time><div class='event-card-actions'><button type='button' data-action='details' data-id='"+escapeHtml(event.id)+"'>Apri ↗</button>"+(isEditable?"<button type='button' data-action='duplicate' data-id='"+escapeHtml(event.id)+"' aria-label='Duplica'>Duplica</button><button type='button' data-action='edit' data-id='"+escapeHtml(event.id)+"' aria-label='Modifica'>Modifica</button><button class='delete-event' type='button' data-action='delete' data-id='"+escapeHtml(event.id)+"' aria-label='Elimina'>×</button>":"")+"<button type='button' data-action='share' data-id='"+escapeHtml(event.id)+"' aria-label='Condividi'>↗</button></div></div></div></article>";
}
function renderCalendar(items) {
  const panel=$('#calendar-view'),year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7,start=new Date(year,month,1-offset),today=new Date();
  const weekdays=['LUN','MAR','MER','GIO','VEN','SAB','DOM'];
  const itemMap=new Map();
  items.forEach(event=>{const date=event._date||eventDate(event),key=[date.getFullYear(),date.getMonth(),date.getDate()].join('-');if(!itemMap.has(key))itemMap.set(key,[]);itemMap.get(key).push(event);});
  let html="<div class='calendar-head'><h3>"+escapeHtml(new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(first))+"</h3><div><button type='button' data-calendar='prev' aria-label='Mese precedente'>←</button><button type='button' data-calendar='today' aria-label='Mese attuale'>○</button><button type='button' data-calendar='next' aria-label='Mese successivo'>→</button></div></div><div class='calendar-grid'>"+weekdays.map(day=>"<div class='calendar-weekday'>"+day+"</div>").join('');
  for(let index=0;index<42;index++){const date=new Date(start);date.setDate(start.getDate()+index);const key=[date.getFullYear(),date.getMonth(),date.getDate()].join('-'),same=date.getMonth()===month,isToday=date.toDateString()===today.toDateString();const dayEvents=itemMap.get(key)||[];html+="<div class='calendar-day "+(same?'':'is-muted')+" "+(isToday?'is-today':'')+"'><span>"+date.getDate()+"</span>"+dayEvents.slice(0,3).map(event=>"<button type='button' class='calendar-event' data-action='details' data-id='"+escapeHtml(event.id)+"' title='"+escapeHtml(event.title)+"'>"+escapeHtml(event.title)+"</button>").join('')+(dayEvents.length>3?"<span class='calendar-event-more'>+"+(dayEvents.length-3)+" altri</span>":"")+"</div>";}
  panel.innerHTML=html+"</div>";
}
function renderCollection() {
  const search=$('#event-search').value.trim().toLowerCase();
  const all=activeFilter==='Preferiti'?allFavoriteEvents().map(event=>({...event,_date:eventDate(event)})).filter(event=>event._date):collectionEvents(false);
  const filtered=all.filter(event=>(activeFilter==='Tutti'||activeFilter==='Preferiti'||event.category===activeFilter)&&(!search||(event.title+' '+event.description+' '+event.category).toLowerCase().includes(search)));
  const future=filtered.filter(event=>event._date>Date.now()),past=filtered.filter(event=>event._date<=Date.now());
  const sort=$('#sort-events').value;
  const sorter=(a,b)=>sort==='title'?a.title.localeCompare(b.title,'it'):sort==='created'?new Date(b.createdAt||0)-new Date(a.createdAt||0):a._date-b._date;
  future.sort(sorter);past.sort((a,b)=>b._date-a._date);
  const grid=$('#event-grid'),calendar=$('#calendar-view'),empty=$('#empty-state');
  grid.dataset.view=activeView;grid.hidden=activeView==='calendar';calendar.hidden=activeView!=='calendar';empty.hidden=future.length>0;
  if(!future.length){
    if(search||activeFilter!=='Tutti'){$('#empty-title').textContent='Nessun momento trovato.';$('#empty-copy').textContent='Prova un’altra ricerca o scegli una categoria diversa.';}
    else if(past.length){$('#empty-title').textContent='Per ora, tutti i countdown sono arrivati.';$('#empty-copy').textContent='Apri l’archivio per rivivere quei momenti, oppure inizia una nuova attesa.';}
    else{$('#empty-title').textContent='La prossima attesa comincia qui.';$('#empty-copy').textContent='Crea un countdown, oppure aggiungi un film dalla sezione qui sopra.';}
  }
  if(activeView==='calendar')renderCalendar(future);
  grid.innerHTML=future.map((event,index)=>eventMarkup(event,index)).join('');
  const count=$('#collection-count');count.textContent=future.length+' '+(future.length===1?'momento':'momenti');
  $$('.category-chip').forEach(button=>{const selected=button.dataset.filter===activeFilter;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  CATEGORIES.forEach(category=>{const node=$('[data-count="'+category+'"]');if(node)node.textContent=all.filter(event=>event.category===category&&event._date>Date.now()).length;});
  const total=$('[data-count="Tutti"]');if(total)total.textContent=collectionEvents(false).filter(event=>event._date>Date.now()).length;
  const archived=$('#archived-section');archived.hidden=!showHistory||past.length===0;$('#history-arrow').textContent=showHistory?'−':'＋';
  $('#archived-grid').innerHTML=showHistory?past.map((event,index)=>eventMarkup(event,index,true)).join(''):'';
  updateHero();
}
function renderAll() { renderMovieShelf();renderCollection();tickTimers(); }
function getEvent(id) {
  return events.find(event=>event.id===id)||visibleMovieEvents().find(event=>event.id===id)||[...movieCatalog.values()].map(getMovieEvent).find(event=>event.id===id)||null;
}
function openCreate(event=null) {
  const form=$('#create-form');editingId=event?.id||null;form.reset();
  $('#create-title').innerHTML=editingId?'Modifica il<br>tuo <em>momento.</em>':'C’è qualcosa<br>da <em>aspettare.</em>';
  const dateInput=form.elements.date;dateInput.min=dateForInput(new Date(Date.now()+60000));
  if(event){form.elements.title.value=event.title||'';form.elements.description.value=event.description||'';form.elements.date.value=dateForInput(eventDate(event));form.elements.category.value=event.category||'Personale';form.elements.repeat.value=event.repeat||'none';form.elements.art.value=ART.includes(event.art)?event.art:'moon';form.elements.reminder.checked=Boolean(event.reminder);form.elements.sound.checked=Boolean(event.sound);}
  const dialog=$('#create-dialog');if(!dialog.open)dialog.showModal();setTimeout(()=>form.elements.title.focus(),50);
}
function openDetails(id) {
  const event=getEvent(id);if(!event)return;
  const date=eventDate(event),image=safeImage(event.backdrop)||safeImage(event.cover)||safeImage(event.poster);
  const saved=events.some(item=>item.id===event.id);
  const addAction=!saved&&event.tmdbId?"<button class='button button-acid' type='button' data-detail-action='add' data-id='"+escapeHtml(event.id)+"'>Aggiungi alla collezione ＋</button>":"";
  const manageActions=saved?"<button class='button button-quiet' type='button' data-detail-action='edit' data-id='"+escapeHtml(event.id)+"'>Modifica</button><button class='button button-quiet' type='button' data-detail-action='reminder' data-id='"+escapeHtml(event.id)+"'>"+(event.reminder?'Promemoria attivo ✓':'Attiva promemoria')+"</button>":"";
  const markup="<div class='detail-cover'></div><div class='detail-copy'><span class='event-category'>"+escapeHtml(event.category||'Personale')+(event.tmdbId?' · THE MOVIE DATABASE':'')+"</span><h2 id='detail-title'>"+escapeHtml(event.title)+"</h2><p>"+escapeHtml(event.description||'Un momento che vale la pena aspettare.')+"</p><div class='detail-timer' data-date='"+date.toISOString()+"'><span><b data-detail-unit='days'>0</b>GIORNI</span><span><b data-detail-unit='hours'>00</b>ORE</span><span><b data-detail-unit='minutes'>00</b>MINUTI</span><span><b data-detail-unit='seconds'>00</b>SECONDI</span></div><p>"+escapeHtml(dateText(date,{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}))+"</p><div class='detail-actions'><button class='button button-quiet' type='button' data-detail-action='share' data-id='"+escapeHtml(event.id)+"'>Condividi ↗</button>"+addAction+manageActions+"</div></div>";
  $('#detail-content').innerHTML=markup;
  const detailCover=$('.detail-cover');detailCover.style.backgroundImage=image?'url("'+image.replace(/"/g,'%22')+'")':'';
  $('#detail-dialog').showModal();tickTimers();
}
function addMovie(id) {
  const movie=movies.find(item=>String(item.id)===String(id));if(!movie)return;
  const event=getMovieEvent(movie);
  if(!event.date){notify('Per questo film non è ancora disponibile una data.');return;}
  if(new Date(event.date)<=new Date()){notify('La data di uscita è già passata.');return;}
  if(events.some(item=>String(item.tmdbId)===String(id))){notify('Questo film è già nella tua collezione.');return;}
  events.push({...event,custom:true,createdAt:new Date().toISOString(),reminder:false,sound:false,repeat:'none'});persistEvents();renderCollection();renderMovieShelf();notify('Aggiunto alla tua collezione.');
}
function toggleFavorite(id) {
  favorites.has(id)?favorites.delete(id):favorites.add(id);persistFavorites();renderCollection();renderMovieShelf();notify(favorites.has(id)?'Aggiunto ai preferiti.':'Rimosso dai preferiti.');
}
function duplicateEvent(id) {
  const event=events.find(item=>item.id===id);if(!event)return;
  const copy={...event,id:'event-'+crypto.randomUUID(),title:event.title+' (copia)',createdAt:new Date().toISOString(),reminderFor:''};
  events.push(copy);persistEvents();renderCollection();notify('Countdown duplicato.');
}
function deleteEvent(id) {
  const event=events.find(item=>item.id===id);if(!event)return;
  if(!window.confirm('Eliminare “'+event.title+'” dalla tua collezione?'))return;
  events=events.filter(item=>item.id!==id);persistEvents();renderCollection();notify('Countdown eliminato.');
}
async function shareEvent(id) {
  const event=getEvent(id);if(!event)return;
  const shared={title:event.title,description:event.description,date:event.date,category:event.category,art:event.art,repeat:event.repeat};
  const url=location.origin+location.pathname+'#share='+encodeURIComponent(JSON.stringify(shared));
  try {if(navigator.share)await navigator.share({title:'The Countdown · '+event.title,text:'Un momento che vale la pena aspettare.',url});else {await navigator.clipboard.writeText(url);notify('Link copiato. Puoi condividerlo.');}}
  catch(error){if(error.name!=='AbortError')notify('Non sono riuscito a condividere il link.');}
}
function readImage(file) {
  return new Promise((resolve,reject)=>{
    if(!file){resolve('');return;}
    if(!/^image\/(?:png|jpeg|webp)$/.test(file.type)||file.size>600*1024){reject(new Error('Scegli un’immagine PNG, JPG o WebP fino a 600 KB.'));return;}
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Non riesco a leggere questa immagine.'));reader.readAsDataURL(file);
  });
}
async function saveForm(event) {
  event.preventDefault();const form=event.currentTarget,formData=new FormData(form);
  const date=new Date(formData.get('date'));
  if(!Number.isFinite(date.getTime())||date<=new Date()){form.elements.date.setCustomValidity('Scegli una data futura.');form.elements.date.reportValidity();form.elements.date.setCustomValidity('');return;}
  const title=String(formData.get('title')||'').trim();if(!title)return;
  let cover='';
  try{cover=await readImage(form.elements.cover.files[0]);}catch(error){notify(error.message);return;}
  const old=editingId?events.find(item=>item.id===editingId):null;
  const item={...(old||{}),id:old?.id||'event-'+crypto.randomUUID(),title,description:String(formData.get('description')||'').trim()||'Un momento che vale la pena aspettare.',category:String(formData.get('category')),date:date.toISOString(),repeat:String(formData.get('repeat')),art:ART.includes(String(formData.get('art')))?String(formData.get('art')):'moon',cover:cover||old?.cover||'',createdAt:old?.createdAt||new Date().toISOString(),custom:true,reminder:form.elements.reminder.checked,sound:form.elements.sound.checked,reminderFor:form.elements.reminder.checked&&!old?.reminder?'':old?.reminderFor||''};
  if(old)events=events.map(existing=>existing.id===old.id?item:existing);else events.push(item);
  persistEvents();
  if(item.reminder&&'Notification'in window&&Notification.permission==='default'){try{const permission=await Notification.requestPermission();if(permission!=='granted')notify('Il browser non ha attivato le notifiche.');}catch{}}
  $('#create-dialog').close();form.reset();editingId=null;renderCollection();notify(old?'Modifiche salvate.':'Il tuo countdown è pronto.');
}
function exportEvents() {
  const payload={app:'The Countdown',version:1,exportedAt:new Date().toISOString(),events};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='the-countdown-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();URL.revokeObjectURL(url);notify('Backup scaricato.');
}
function validImportItem(item) {
  if(!item||typeof item!=='object'||!String(item.title||'').trim()||!Number.isFinite(new Date(item.date).getTime()))return null;
  return {id:'event-'+crypto.randomUUID(),title:String(item.title).slice(0,54),description:String(item.description||'').slice(0,120),category:CATEGORIES.includes(item.category)?item.category:'Personale',date:new Date(item.date).toISOString(),repeat:item.repeat==='yearly'?'yearly':'none',art:ART.includes(item.art)?item.art:'moon',cover:safeImage(item.cover),createdAt:new Date().toISOString(),custom:true,reminder:Boolean(item.reminder),sound:Boolean(item.sound)};
}
async function importEvents(file) {
  try {const parsed=JSON.parse(await file.text()),rows=Array.isArray(parsed)?parsed:parsed.events;if(!Array.isArray(rows))throw new Error();const imported=rows.map(validImportItem).filter(Boolean);if(!imported.length)throw new Error();events=events.concat(imported);persistEvents();renderCollection();notify(imported.length+' countdown importati.');}
  catch {notify('Questo file non contiene countdown validi.');}
}
function toggleHistory() {showHistory=!showHistory;$('#history-toggle').setAttribute('aria-expanded',String(showHistory));renderCollection();}
function setTheme(theme) {
  document.body.classList.toggle('theme-light',theme==='light');document.documentElement.dataset.theme=theme;
  $('#theme-toggle').setAttribute('aria-label',theme==='light'?'Attiva tema scuro':'Attiva tema chiaro');
  try{localStorage.setItem(STORE.theme,theme);}catch{}
}
async function searchMovieHandler() {
  const input=$('#movie-search');
  if(movieMode!=='search'){$$('.movie-tab').forEach(button=>button.classList.toggle('active',button.dataset.movieFilter==='search'));movieMode='search';$('#movie-search-wrap').hidden=false;}
  input.focus();
}
function consumeSharedLink() {
  if(!location.hash.startsWith('#share='))return;
  try {const data=JSON.parse(decodeURIComponent(location.hash.slice(7))),item=validImportItem(data);if(item){events.push(item);persistEvents();history.replaceState(null,'',location.pathname+location.search);notify('Un momento condiviso è stato aggiunto.');}}
  catch {history.replaceState(null,'',location.pathname+location.search);}
}
function attachUI() {
  $('#open-create').addEventListener('click',()=>openCreate());$('#hero-create').addEventListener('click',()=>openCreate());$('#collection-create').addEventListener('click',()=>openCreate());$('#empty-create').addEventListener('click',()=>openCreate());
  $$('.modal-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('#create-dialog').addEventListener('click',event=>{if(event.target===$('#create-dialog'))$('#create-dialog').close();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog'))$('#detail-dialog').close();});
  $('#credits-dialog').addEventListener('click',event=>{if(event.target===$('#credits-dialog'))$('#credits-dialog').close();});
  $('#create-form').addEventListener('submit',saveForm);
  $('.category-filters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;activeFilter=button.dataset.filter;renderCollection();});
  $('#event-search').addEventListener('input',renderCollection);
  $('#sort-events').addEventListener('change',renderCollection);
  $$('.view-button').forEach(button=>button.addEventListener('click',()=>{$$('.view-button').forEach(other=>{const selected=other===button;other.classList.toggle('active',selected);other.setAttribute('aria-pressed',String(selected));});activeView=button.dataset.view;renderCollection();}));
  $('#event-grid').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;if(action==='favorite')toggleFavorite(id);if(action==='details')openDetails(id);if(action==='edit'){const item=events.find(row=>row.id===id);if(item)openCreate(item);}if(action==='delete')deleteEvent(id);if(action==='duplicate')duplicateEvent(id);if(action==='share')shareEvent(id);});
  $('#archived-grid').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button?.dataset.action==='details')openDetails(button.dataset.id);if(button?.dataset.action==='favorite')toggleFavorite(button.dataset.id);if(button?.dataset.action==='share')shareEvent(button.dataset.id);if(button?.dataset.action==='delete')deleteEvent(button.dataset.id);});
  $('#calendar-view').addEventListener('click',event=>{const button=event.target.closest('[data-calendar],[data-action]');if(!button)return;if(button.dataset.calendar==='prev')calendarCursor.setMonth(calendarCursor.getMonth()-1);if(button.dataset.calendar==='next')calendarCursor.setMonth(calendarCursor.getMonth()+1);if(button.dataset.calendar==='today')calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);if(button.dataset.calendar)renderCollection();if(button.dataset.action==='details')openDetails(button.dataset.id);});
  $('#movie-shelf').addEventListener('click',event=>{const add=event.target.closest('[data-add-movie]'),detail=event.target.closest('[data-movie-details]');if(add)addMovie(add.dataset.addMovie);if(detail){const movie=movieCatalog.get(String(detail.dataset.movieDetails));if(movie)openDetails(movieId(movie.id));}});
  $$('.movie-tab').forEach(button=>button.addEventListener('click',()=>{movieMode=button.dataset.movieFilter;$$('.movie-tab').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});$('#movie-search-wrap').hidden=movieMode!=='search';if(movieMode==='search'){$('#movie-search').focus();renderMovieShelf();}else{movies=upcomingMovies;renderMovieShelf();}}));
  $('#movie-search').addEventListener('input',event=>searchMovies(event.target.value));
  $('.shelf-prev').addEventListener('click',()=>$('#movie-shelf').scrollBy({left:-$('#movie-shelf').clientWidth*.8,behavior:'smooth'}));
  $('.shelf-next').addEventListener('click',()=>$('#movie-shelf').scrollBy({left:$('#movie-shelf').clientWidth*.8,behavior:'smooth'}));
  $('#theme-toggle').addEventListener('click',()=>setTheme(document.body.classList.contains('theme-light')?'dark':'light'));
  $('#search-trigger').addEventListener('click',()=>{document.querySelector('#collection').scrollIntoView({behavior:'smooth'});setTimeout(()=>$('#event-search').focus(),450);});
  $('#export-events').addEventListener('click',exportEvents);$('#import-trigger').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',event=>{if(event.target.files[0])importEvents(event.target.files[0]);event.target.value='';});
  $('#history-toggle').addEventListener('click',toggleHistory);$('#credits-open').addEventListener('click',()=>$('#credits-dialog').showModal());
  $('#detail-content').addEventListener('click',event=>{const button=event.target.closest('[data-detail-action]');if(!button)return;const id=button.dataset.id,action=button.dataset.detailAction;if(action==='share')shareEvent(id);if(action==='add'){addMovie(id.slice(6));$('#detail-dialog').close();}if(action==='edit'){const item=events.find(row=>row.id===id);$('#detail-dialog').close();if(item)openCreate(item);}if(action==='reminder'){const item=events.find(row=>row.id===id);if(!item)return;item.reminder=!item.reminder;item.reminderFor='';persistEvents();openDetails(id);if(item.reminder&&'Notification'in window&&Notification.permission==='default')Notification.requestPermission();notify(item.reminder?'Promemoria attivato.':'Promemoria disattivato.');}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#event-search').focus();document.querySelector('#collection').scrollIntoView({behavior:'smooth'});}if(event.key==='Escape'&&$('#create-dialog').open)editingId=null;});
  $('#credits-open').setAttribute('aria-haspopup','dialog');
  $('.hero').addEventListener('pointermove',event=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const rect=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--pointer-x',(event.clientX-rect.left)+'px');event.currentTarget.style.setProperty('--pointer-y',(event.clientY-rect.top)+'px');});
}
function init() {
  consumeSharedLink();attachUI();setTheme(localStorage.getItem(STORE.theme)||'dark');
  const min=$('#create-form').elements.date;min.min=dateForInput(new Date(Date.now()+60000));
  $('#credits-open').setAttribute('aria-label','Apri i crediti TMDB e le note sulle fonti');
  $$('.view-button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view==='grid')));
  $$('.movie-tab').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.movieFilter==='upcoming')));
  $('#history-toggle').setAttribute('aria-expanded','false');
  loadMovies();
  renderCollection();
  tickTimers();
  setInterval(()=>{tickTimers();if(Date.now()%15000<1000)updateHero();},1000);
}
init();
