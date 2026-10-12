@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e installato. Scaricalo da https://nodejs.org/
  pause
  exit /b 1
)
echo Avvio The Countdown. Il browser si aprira quando il server sara pronto.
echo Lascia aperta questa finestra mentre usi il sito; premi Ctrl+C per fermarlo.
node server.mjs --open
if errorlevel 1 (
  echo.
  echo The Countdown non e riuscito ad avviarsi. Leggi il messaggio qui sopra.
  pause
)
