// Runs before the first paint (a plain script at the end of index.html, not a module):
// turns on the saved theme and sidebar state so the page doesn't flash the defaults while
// main.js loads settings from IndexedDB, and starts connecting to the LiteLLM proxy (name lookup,
// secure handshake) so its first request doesn't wait for that. theme.js and main.js keep this copy up to date.
(function () {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('chat-boot')) || {}; } catch (e) {}
  var link = saved.theme && document.querySelector('link[data-theme="' + saved.theme + '"]');
  if (link) {
    link.media = 'all';
    document.querySelectorAll('.themed').forEach(function (n) { n.classList.add('theme-' + saved.theme); });
  }
  if (saved.collapsed) document.getElementById('app').classList.add('collapsed');
  if (/^https:\/\/[^/]+$/.test(saved.proxy || '')) {
    var warm = document.createElement('link');
    warm.rel = 'preconnect';
    warm.href = saved.proxy;
    warm.crossOrigin = 'anonymous'; // the app's requests to it carry no cookies, so this is the connection they use
    document.head.appendChild(warm);
  }
})();
