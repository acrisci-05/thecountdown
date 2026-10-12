# The Countdown

Il conto alla rovescia delle tue cose preferite: film, giochi, musica, sport e i tuoi momenti personali.
HTML, CSS e JavaScript puri, senza build, senza account e senza database: tutto resta nel browser (localStorage).

## Avvio

Doppio clic su START.bat, oppure: `node server.mjs --open` → http://127.0.0.1:4187

Il server locale serve i file e fa da ponte verso le fonti di immagini (chiavi in `.env`, mai esposte alla pagina):

| Fonte | Per cosa | Chiave in `.env` |
|---|---|---|
| TMDb | film, serie TV, anime (immagini e uscite) | `TMDB_API_KEY` |
| RAWG | videogiochi (immagini e uscite) | `RAWG_API_KEY` |
| Deezer | solo immagini di artisti e album (le date dei concerti arrivano da Ticketmaster) | nessuna |
| Unsplash | foto generiche (sport, ricorrenze, viaggi) | `UNSPLASH_ACCESS_KEY` |
| Nager.Date | festività italiane (timeline) | nessuna |
| AniList (+ TMDb) | anime: nuove serie e prossimi episodi; TMDb per titoli e immagini quando c’è corrispondenza | nessuna |
| TVmaze | premiere delle serie TV con orario esatto | nessuna |
| IGDB (Twitch) | videogiochi in uscita (al posto di RAWG) | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` |
| Ticketmaster | concerti in Italia | `TICKETMASTER_API_KEY` |
| football-data.org | Serie A e Champions League | `FOOTBALL_DATA_TOKEN` |
| Jolpica F1 | calendario di Formula 1 | nessuna |
| Launch Library 2 | lanci spaziali | nessuna |

Senza una chiave il sito funziona lo stesso: al posto delle foto restano le copertine disegnate.
Dopo aver modificato `.env`, chiudi e riapri START.bat.

## Struttura

- `index.html` — struttura della pagina, icone SVG, finestre (dettaglio, creatore, ricerca…)
- `styles.css` — design system (token, componenti, copertine generate, responsive, tema chiaro)
- `js/data.js` — **catalogo eventi con date e fonti verificate** (12/10/2026), categorie, copertine, colori
- `js/app.js` — logica: timer, hero, timeline, i miei countdown, creatore guidato, condivisione, .ics
- `js/boot.js` — applica tema e colore prima del primo render
- `_old/` — la versione precedente del sito

## Condivisione

Ogni countdown si condivide da **Condividi**: link, invio, immagine scaricabile (storia 9:16, post 1:1, anteprima 1.91:1), file calendario, QR code e schermo intero.
Il link apre `countdown.html`, una pagina dedicata con timer e pulsante “Aggiungilo ai miei”.
I dati stanno nel frammento `#c=…` dell’indirizzo: codificati, non cifrati. La nota personale è esclusa se non la includi tu; le immagini caricate dal dispositivo non vengono mai incluse.
Il QR code usa `js/vendor/qrcode.js` (qrcode-generator di Kazuhiko Arase, licenza MIT).

## Il progetto / Creatore

La sezione “Il progetto” (menu e footer) mostra la scheda del creatore e l’invito al sostegno solo se compili `CREATOR` in fondo a `js/data.js`:
nome, ruolo, breve descrizione, avatar (meglio un file in `assets/`), link di donazione e profili social (solo indirizzi `https://`).
I campi vuoti non vengono mostrati. La donazione è facoltativa e non compare mai come popup.

## Backup

“Esporta” scarica un file JSON con i tuoi countdown e gli eventi che segui. “Importa” mostra un’anteprima (nuovi, già presenti, non validi) e ti lascia scegliere tra aggiungere o sostituire, con la possibilità di annullare.
Sono accettati anche i backup della versione precedente del sito.

## Aggiornare gli eventi

Modifica `js/data.js`. Ogni evento ha `date` (con fuso), `precision` (`time`, `approx`, `day`) e `source`.
Quando una data cambia, aggiorna anche la fonte. Gli eventi passati finiscono da soli in "Eventi già passati".
