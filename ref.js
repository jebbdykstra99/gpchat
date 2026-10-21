/* Capture visit source for the hit pixel. Kept out of factory.js.
   The pixel Cloud Function writes the Firestore hits row from this beacon's
   query string. ref is omitted when absent (stored as null). referrer is
   origin + pathname only, omitted when missing or same-origin. */
(function () {
  var REF_RE = /^[a-z0-9_-]{1,32}$/;
  var SESSION_KEY = 'subx.ref';
  var FIRST_KEY = 'subx.ref.first';
  var UTM_KEY = 'subx.utm_source';
  var REFERRER_KEY = 'subx.referrer';

  function getStore(store, key) {
    try { return store.getItem(key) || ''; } catch (e) { return ''; }
  }
  function setStore(store, key, value) {
    try { store.setItem(key, value); } catch (e) {}
  }
  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (e) { return ''; }
  }

  var incoming = String(param('ref') || '').toLowerCase();
  if (REF_RE.test(incoming)) {
    setStore(window.sessionStorage, SESSION_KEY, incoming);
    if (!REF_RE.test(getStore(window.localStorage, FIRST_KEY))) {
      setStore(window.localStorage, FIRST_KEY, incoming);
    }
  }

  var utmIn = String(param('utm_source') || '').replace(/^\s+|\s+$/g, '').slice(0, 64);
  if (utmIn && !getStore(window.sessionStorage, UTM_KEY)) {
    setStore(window.sessionStorage, UTM_KEY, utmIn);
  }

  function externalReferrer(raw) {
    if (!raw) return '';
    try {
      var u = new URL(raw, window.location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      if (u.origin === window.location.origin) return '';
      var out = u.origin + u.pathname;
      return out.length > 200 ? out.slice(0, 200) : out;
    } catch (e) { return ''; }
  }

  var refPath = externalReferrer(window.document.referrer || '');
  if (refPath && !getStore(window.sessionStorage, REFERRER_KEY)) {
    setStore(window.sessionStorage, REFERRER_KEY, refPath);
  }

  if (!window.navigator || typeof window.navigator.sendBeacon !== 'function') return;

  var ref = getStore(window.sessionStorage, SESSION_KEY);
  if (!REF_RE.test(ref)) ref = '';
  var utm = getStore(window.sessionStorage, UTM_KEY).replace(/^\s+|\s+$/g, '').slice(0, 64);
  var referrer = externalReferrer(getStore(window.sessionStorage, REFERRER_KEY));

  function hasParam(url, key) {
    try { return new URL(url).searchParams.has(key); } catch (e) {
      return url.indexOf(key + '=') !== -1;
    }
  }
  function addParam(url, key, value) {
    if (!value || hasParam(url, key)) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + key + '=' + encodeURIComponent(value);
  }

  var orig = window.navigator.sendBeacon.bind(window.navigator);
  window.navigator.sendBeacon = function (url, data) {
    try {
      if (typeof url === 'string' && url.indexOf('/pixel') !== -1) {
        url = addParam(url, 'ref', ref);
        url = addParam(url, 'referrer', referrer);
        url = addParam(url, 'utm_source', utm);
      }
    } catch (e) {}
    return orig(url, data);
  };
})();
