# The Countdown · spot verticale 9:16

Spot di 18 secondi in 1080×1920 a 60 fps, generato interamente da codice: scena HTML/SVG/CSS 3D,
render con Playwright, motion blur reale 8×, musica ed effetti sintetizzati, voce narrante di Windows.

## Rigenerare

```
cd ad
npm install
node build.mjs
```

`node build.mjs --audio` rifà solo l’audio (pochi secondi), utile per provare il mix.
`node preview.mjs 1.2,5,13.6,17.6` cattura solo alcuni fotogrammi in `out/preview/`.

## Cosa produce (`ad/out/`)

| File | Contenuto |
|---|---|
| `Ad_9x16.mp4` | Video finale: H.264 High, 1080×1920, 60 fps, AAC 320 kb/s 48 kHz |
| `contact_sheet.jpg` | 15 fotogrammi chiave in griglia |
| `stems/*.flac` | drums, bass, pad, melody, music_ducked, sfx, voiceover, master |
| `loudness_report.txt` | Loudness integrata e true peak, prima e dopo la normalizzazione |
| `timeline.json` | La timeline usata, con le durate reali della voce |

## Come funziona

- **Timeline** (`timeline.json`): unica fonte per segmenti, battute della voce, marker e 40 effetti sonori.
  Cambia testi, CTA o tempi qui. Se hai un dominio, mettilo in `product.url`: comparirà sotto il pulsante finale.
- **Scena** (`scene/`): ogni proprietà visiva è una funzione del tempo (`renderAt(t)`), senza animazioni CSS automatiche,
  quindi ogni fotogramma è riproducibile. Gli eventi mostrati sono esempi generici (“Il film dell’anno”, “Live a Milano”…):
  niente locandine o marchi di terzi in una pubblicità.
- **Motion blur**: per ogni fotogramma si catturano 8 sotto-fotogrammi distribuiti su metà dell’intervallo (otturatore a 180°),
  che FFmpeg fonde con `tmix`. Il render è diviso tra più processi in parallelo, ognuno con il suo segmento H.264, poi uniti senza ricodifica.
- **Audio** (`lib/audio.mjs`): La minore, Am–F–C–G a 120 BPM, in 4 stem (batteria, basso, pad, melodia), più gli effetti della timeline.
  Mix in FFmpeg: la musica si abbassa sotto la voce (sidechain compressor), un limiter toglie i picchi,
  poi loudnorm a due passaggi porta il master a −14 LUFS con true peak ≤ −1 dBTP (target interno −1,5).
- **Voce** (`lib/voice.mjs`): sintesi di Windows con la voce italiana installata (Elsa). Ogni battuta viene accelerata solo
  quanto basta per stare nel suo spazio; i sottotitoli seguono le durate reali. È una voce di servizio:
  per la versione definitiva conviene registrare una voce vera e sostituire `out/work/vo*.wav`.
- **Safe zone**: 120 px liberi in alto e 340 px in basso; sottotitoli e pulsante finale stanno sopra la fascia dell’interfaccia social.

Strumenti: Playwright (Chromium già scaricato sul PC) e `ffmpeg-static` (FFmpeg 6 locale al progetto, nessuna installazione di sistema).
