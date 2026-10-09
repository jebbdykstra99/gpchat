/* Capture ?ref= for the visit pixel. Kept out of factory.js. */
(function () {
  var REF_RE = /^[a-z0-9_-]{1,32}$/;
  var SESSION_KEY = 'subx.ref';
  var FIRST_KEY = 'subx.ref.first';

  function getStore(store, key) {
    try { return store.getItem(key) || ''; } catch (e) { return ''; }
  }
  function setStore(store, key, value) {
    try { store.setItem(key, value); } catch (e) {}
  }

  var incoming = '';
  try {
    incoming = String(new URLSearchParams(window.location.search).get('ref') || '').toLowerCase();
  } catch (e) {}

  if (REF_RE.test(incoming)) {
    setStore(window.sessionStorage, SESSION_KEY, incoming);
    if (!REF_RE.test(getStore(window.localStorage, FIRST_KEY))) {
      setStore(window.localStorage, FIRST_KEY, incoming);
    }
  }

  var ref = getStore(window.sessionStorage, SESSION_KEY);
  if (!REF_RE.test(ref) || !window.navigator || typeof window.navigator.sendBeacon !== 'function') return;

  var orig = window.navigator.sendBeacon.bind(window.navigator);
  window.navigator.sendBeacon = function (url, data) {
    try {
      if (typeof url === 'string' && url.indexOf('/pixel') !== -1 && url.indexOf('ref=') === -1) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'ref=' + encodeURIComponent(ref);
      }
    } catch (e) {}
    return orig(url, data);
  };
})();
