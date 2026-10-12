// Applica tema, accento e preferenza movimento prima del primo render (evita il flash).
(function () {
  var root = document.documentElement;
  try {
    var prefs = JSON.parse(localStorage.getItem('tc-prefs-v3') || '{}');
    root.dataset.theme = prefs.theme === 'light' ? 'light' : 'dark';
    if (prefs.accent) root.style.setProperty('--accent', prefs.accent);
    if (prefs.reduceMotion) root.classList.add('reduce-motion');
  } catch (e) { root.dataset.theme = 'dark'; }
  root.classList.add('js');
})();
