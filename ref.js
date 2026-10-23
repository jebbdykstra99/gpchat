(function () {
  'use strict';
  var PIXEL_RE = /^https:\/\/us-central1-subx-skins\.cloudfunctions\.net\/pixel\b/;
  var REF_RE = /^[a-z0-9_-]{1,64}$/;
  var INTERNAL_PAGE_REF_RE = /^(usgp-|share-usgp-)/;
  var SESSION_KEY = 'subx.ref';
  var SIGNUP_KEY = 'subx.signupRef';
  var REFERRER_KEY = 'subx.referrer';
  var UTM_KEY = 'subx.utm_source';
  var PAGE_REF = '';
  try {
    if (document.currentScript && document.currentScript.getAttribute) {
      PAGE_REF = String(document.currentScript.getAttribute('data-page-ref') || '').toLowerCase();
    }
  } catch (e) {}

  function getStore(store, k) {
    try { return store ? store.getItem(k) : ''; } catch (e) { return ''; }
  }
  function setStore(store, k, v) {
    try { if (store && v) store.setItem(k, v); } catch (e) {}
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search || '').get(name) || '';
    } catch (e) { return ''; }
  }

  var incoming = String(param('ref') || '').toLowerCase();
  var existingSessionRef = getStore(window.sessionStorage, SESSION_KEY);
  if (REF_RE.test(incoming)) {
    var keepExisting = existingSessionRef && !INTERNAL_PAGE_REF_RE.test(existingSessionRef) && INTERNAL_PAGE_REF_RE.test(incoming);
    if (!keepExisting) {
      setStore(window.sessionStorage, SESSION_KEY, incoming);
    }
    if (!getStore(window.localStorage, SIGNUP_KEY) || (!keepExisting && !INTERNAL_PAGE_REF_RE.test(incoming))) {
      setStore(window.localStorage, SIGNUP_KEY, incoming);
    }
  } else if (!existingSessionRef && REF_RE.test(PAGE_REF)) {
    setStore(window.sessionStorage, SESSION_KEY, PAGE_REF);
    if (!getStore(window.localStorage, SIGNUP_KEY)) {
      setStore(window.localStorage, SIGNUP_KEY, PAGE_REF);
    }
  }

  var utm = String(param('utm_source') || '').toLowerCase();
  if (REF_RE.test(utm) && !getStore(window.sessionStorage, UTM_KEY)) {
    setStore(window.sessionStorage, UTM_KEY, utm);
  }

  try {
    var docRef = String(document.referrer || '');
    if (docRef && !getStore(window.sessionStorage, REFERRER_KEY)) {
      var refHost = new URL(docRef).hostname.replace(/^www\./i, '').toLowerCase();
      var ownHost = String(window.location.hostname || '').replace(/^www\./i, '').toLowerCase();
      if (refHost && refHost !== ownHost) {
        setStore(window.sessionStorage, REFERRER_KEY, docRef.slice(0, 512));
      }
    }
  } catch (e) {}

  function enrichPixelUrl(url) {
    try {
      var s = String(url || '');
      if (!PIXEL_RE.test(s)) return url;
      var u = new URL(s);
      var ref = getStore(window.sessionStorage, SESSION_KEY);
      var referrer = getStore(window.sessionStorage, REFERRER_KEY);
      var utmVal = getStore(window.sessionStorage, UTM_KEY);
      if (ref && !u.searchParams.get('ref')) u.searchParams.set('ref', ref);
      if (referrer && !u.searchParams.get('referrer')) u.searchParams.set('referrer', referrer);
      if (utmVal && !u.searchParams.get('utm_source')) u.searchParams.set('utm_source', utmVal);
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      return origBeacon(enrichPixelUrl(url), data);
    };
  }

  window.__subxRef = {
    getRef: function () { return getStore(window.sessionStorage, SESSION_KEY) || ''; },
    getSignupRef: function () { return getStore(window.localStorage, SIGNUP_KEY) || ''; },
    enrichPixelUrl: enrichPixelUrl
  };
})();
