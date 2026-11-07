import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const POPUP_MSG = 'Google popup was blocked. Allow popups for this site, or use email.';
const UID_KEY = 'subx.joinAttested.gpchat.google-user';

function installStub(page) {
  return Promise.all([
    page.addInitScript(() => {
      var origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opt) {
        if (type === 'click' && this && this.id === 'cv-google-login' && typeof fn === 'function') {
          var wrapped = function (ev) {
            window.__googleClickDepth = (window.__googleClickDepth || 0) + 1;
            try { return fn.call(this, ev); }
            finally { window.__googleClickDepth -= 1; }
          };
          return origAdd.call(this, type, wrapped, opt);
        }
        return origAdd.call(this, type, fn, opt);
      };

      function bumpBoot() {
        window.__bootMark = (window.__bootMark || 0) + 1;
        setTimeout(function () { window.__bootQuiet = window.__bootMark; }, 0);
      }

      function armObservers() {
        if (window.__obsArmed || !document.documentElement) return;
        window.__obsArmed = true;
        window.__ageDialogs = window.__ageDialogs || 0;
        window.__sheetOpens = window.__sheetOpens || 0;
        new MutationObserver(function (recs) {
          recs.forEach(function (r) {
            var nodes = r.addedNodes || [];
            for (var i = 0; i < nodes.length; i++) {
              if (nodes[i] && nodes[i].id === 'age-attest') window.__ageDialogs++;
            }
          });
          var ov = document.getElementById('cv-auth-overlay');
          if (ov && ov.classList.contains('open')) {
            if (!window.__sheetOpenSeen) {
              window.__sheetOpenSeen = true;
              window.__sheetOpens = (window.__sheetOpens || 0) + 1;
            }
          } else {
            window.__sheetOpenSeen = false;
          }
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armObservers);
      armObservers();

      var q = location.search || '';
      try {
        if (/ageFlag=local/.test(q)) localStorage.setItem('subx.joinAttested.gpchat.google-user', String(Date.now()));
        if (/ageFlag=session/.test(q)) {
          sessionStorage.setItem('subx.joinAttested.gpchat.google-user', String(Date.now()));
          localStorage.removeItem('subx.joinAttested.gpchat.google-user');
        }
        if (/armedRedirect=1/.test(q)) {
          localStorage.setItem('subx.googleRedirect', '1');
          sessionStorage.removeItem('subx.googleRedirect');
        }
      } catch (e) {}

      window.__installAuthStub = function () {
        if (!window.firebase) {
          window.__stubErr = 'firebase missing';
          return;
        }
        window.__googleCalls = [];
        window.__persistCalls = [];
        window.__likes = {};
        window.__likeUpdates = 0;
        window.__openedOnNull = false;
        var postListeners = [];
        var savedUsers = {};
        var state = { user: null, listeners: [] };

        function postSnap() {
          var likes = window.__likes || {};
          return {
            empty: false,
            docs: [{
              id: 'post1',
              data: function () {
                return {
                  siteId: 'gpchat',
                  authorUid: 'author1',
                  authorName: 'Pit Wall',
                  authorHandle: 'pitwall',
                  text: 'The car still answers.',
                  likes: Object.assign({}, likes),
                  likeCount: Object.keys(likes).length,
                  replyCount: 1,
                  createdAt: { toMillis: function () { return Date.now() - 3600000; } }
                };
              }
            }],
            forEach: function () {}
          };
        }
        function emitPosts() {
          postListeners.forEach(function (fn) { fn(postSnap()); });
        }
        function emptySnap() {
          return { empty: true, docs: [], forEach: function () {}, exists: false, data: function () { return {}; } };
        }
        function profileFor(id) {
          var search = location.search || '';
          if (/profile=stale/.test(search)) return { exists: true, data: { siteId: 'gpchat' } };
          if (savedUsers[id]) return { exists: true, data: savedUsers[id] };
          if (/profile=attested/.test(search) || (id === 'email-user' && !/profile=missing/.test(search))) {
            return { exists: true, data: { siteId: 'gpchat', ageAttested18: true, ageConfirmed: true } };
          }
          return { exists: false, data: {} };
        }
        function docRef(col, id) {
          return {
            id: id,
            onSnapshot: function (ok) {
              if (col === 'users') {
                var p = profileFor(id);
                ok({ exists: p.exists, data: function () { return p.data; } });
              } else {
                ok({ exists: false, data: function () { return {}; } });
              }
              return function () {};
            },
            get: function () {
              if (col === 'users') {
                var p = profileFor(id);
                return Promise.resolve({ exists: p.exists, data: function () { return p.data; } });
              }
              return Promise.resolve({ exists: false, data: function () { return {}; } });
            },
            set: function (data) {
              if (col === 'users' && !/profile=stale/.test(location.search)) {
                savedUsers[id] = Object.assign({}, savedUsers[id] || {}, data || {});
              }
              return Promise.resolve();
            },
            update: function (patch) {
              if (col === 'posts') {
                window.__likes = window.__likes || {};
                Object.keys(patch || {}).forEach(function (k) {
                  if (k.indexOf('likes.') !== 0) return;
                  var uid = k.slice(6);
                  if (patch[k] && patch[k].__del) delete window.__likes[uid];
                  else window.__likes[uid] = true;
                });
                window.__likeUpdates = (window.__likeUpdates || 0) + 1;
                emitPosts();
              }
              return Promise.resolve();
            },
            collection: function (name) { return collection(name); },
            delete: function () { return Promise.resolve(); }
          };
        }
        function collection(name) {
          var c = {
            where: function () { return c; },
            orderBy: function () { return c; },
            limit: function () { return c; },
            startAfter: function () { return c; },
            doc: function (id) { return docRef(name, id); },
            add: function () { return Promise.resolve({ id: 'new' }); },
            get: function () { return Promise.resolve(emptySnap()); },
            onSnapshot: function (ok) {
              if (name === 'posts') {
                postListeners.push(ok);
                ok(postSnap());
              } else {
                ok(emptySnap());
              }
              return function () {};
            }
          };
          return c;
        }
        function decorate(user) {
          user.sendEmailVerification = function () { return Promise.resolve(); };
          user.updateProfile = user.updateProfile || function () { return Promise.resolve(); };
          return user;
        }
        function signInUser(user) {
          decorate(user);
          state.user = user;
          api.currentUser = user;
          var fns = state.listeners.slice();
          fns.forEach(function (fn) { fn(user); });
          if (/doubleAuth=1/.test(location.search)) {
            setTimeout(function () { fns.forEach(function (fn) { fn(user); }); }, 80);
          }
          return Promise.resolve({ user: user });
        }
        if (/resume=1/.test(location.search)) {
          state.user = decorate({
            uid: 'google-user',
            email: 'listener@example.com',
            emailVerified: true,
            displayName: 'Listener',
            providerData: [{ providerId: 'google.com' }]
          });
        }
        var api = {
          currentUser: state.user,
          setPersistence: function (mode) {
            window.__persistCalls.push(mode);
            bumpBoot();
            if (mode === 'local' && /failPersist=1/.test(location.search)) {
              return Promise.reject(new Error('storage unavailable'));
            }
            return Promise.resolve();
          },
          signInWithEmailAndPassword: function (email, pw) {
            if (!email || String(pw || '').length < 6) {
              return Promise.reject(Object.assign(new Error('Sign-in failed.'), { code: 'auth/invalid-credential' }));
            }
            return signInUser({
              uid: 'email-user',
              email: email,
              emailVerified: true,
              displayName: 'Listener'
            });
          },
          createUserWithEmailAndPassword: function (email) {
            return signInUser({
              uid: 'new-user',
              email: email,
              emailVerified: false,
              displayName: ''
            });
          },
          signInWithPopup: function () {
            window.__googleCalls.push('popup');
            window.__popupDuringClick = (window.__googleClickDepth > 0) ? 'sync' : 'late';
            if (/popupBlocked=1/.test(location.search)) {
              return Promise.reject(Object.assign(new Error('popup blocked'), { code: 'auth/popup-blocked' }));
            }
            return signInUser({
              uid: 'google-user',
              email: 'listener@example.com',
              emailVerified: true,
              displayName: 'Listener',
              providerData: [{ providerId: 'google.com' }]
            });
          },
          signInWithRedirect: function () {
            window.__googleCalls.push('redirect');
            return Promise.resolve();
          },
          getRedirectResult: function () {
            bumpBoot();
            var result = { user: null };
            if (/prematureNull=1/.test(location.search)) {
              return new Promise(function (resolve) { setTimeout(function () { resolve(result); }, 50); });
            }
            return Promise.resolve(result);
          },
          onAuthStateChanged: function (fn) {
            state.listeners.push(fn);
            Promise.resolve().then(function () {
              if (/prematureNull=1/.test(location.search)) {
                fn(null);
                var ov = document.getElementById('cv-auth-overlay');
                window.__openedOnNull = !!(ov && ov.classList.contains('open'));
              }
              fn(api.currentUser);
              bumpBoot();
            });
            return function () {};
          },
          signOut: function () {
            state.user = null;
            api.currentUser = null;
            state.listeners.forEach(function (fn) { fn(null); });
            return Promise.resolve();
          }
        };
        var Persistence = { LOCAL: 'local', SESSION: 'session', NONE: 'none' };
        function GoogleAuthProvider() {}
        function authFn() { return api; }
        authFn.Auth = { Persistence: Persistence };
        authFn.GoogleAuthProvider = GoogleAuthProvider;
        firebase.auth = authFn;
        function firestoreFn() { return { collection: collection }; }
        firestoreFn.FieldValue = {
          serverTimestamp: function () { return { __ts: 1 }; },
          delete: function () { return { __del: 1 }; },
          increment: function (n) { return { __inc: n }; }
        };
        firestoreFn.Timestamp = {
          now: function () { return { toMillis: function () { return Date.now(); }, toDate: function () { return new Date(); } }; },
          fromMillis: function (ms) { return { toMillis: function () { return ms; }, toDate: function () { return new Date(ms); } }; },
          fromDate: function (d) { return { toMillis: function () { return d.getTime(); } }; }
        };
        firebase.firestore = firestoreFn;
        firebase.storage = function () {
          return { ref: function () { return { put: function () { return { on: function () {} }; } }; } };
        };
        firebase.appCheck = function () {
          return { activate: function () { return Promise.resolve(); } };
        };
        var origInit = firebase.initializeApp && firebase.initializeApp.bind(firebase);
        firebase.initializeApp = function (cfg) {
          window.__authDomain = cfg && cfg.authDomain;
          try { if (origInit) return origInit(cfg); }
          catch (e) { window.__initErr = String(e && e.message || e); }
          return { name: (cfg && cfg.projectId) || 'stub' };
        };
      };
    }),
    page.route('**/firebase-web-config.json', function (route) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apiKey: 'AIzaSyDUMMYKEYFORLOCALTEST00000000',
          authDomain: 'subx-skins.firebaseapp.com',
          projectId: 'subx-skins',
          storageBucket: 'subx-skins.appspot.com',
          messagingSenderId: '1234567890',
          appId: '1:1234567890:web:abcdef'
        })
      });
    }),
    page.route(/127\.0\.0\.1:8765\/(\?.*)?$/, async function (route) {
      const res = await route.fetch();
      let body = await res.text();
      if (body.indexOf('__installAuthStub()') === -1) {
        body = body.replace(
          '<script src="factory.js',
          '<script>window.__installAuthStub()</script><script src="factory.js'
        );
      }
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    })
  ]);
}

async function waitBoot(page) {
  await page.waitForFunction(function () {
    return window.__bootMark && window.__bootQuiet === window.__bootMark && document.querySelector('[data-act="like"]');
  });
}

async function openLikeGate(page) {
  await waitBoot(page);
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).toHaveClass(/open/);
}

async function emailSignIn(page) {
  await page.locator('#cv-use-email-btn').click();
  await page.locator('#cv-login-email').fill('listener@example.com');
  await page.locator('#cv-login-pw').fill('secret1');
  await page.locator('#cv-login-btn').click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
}

async function setDob(page, selector, value) {
  await page.locator(selector).evaluate(function (el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function fillAdultJoin(page) {
  await setDob(page, '#cv-google-dob', '1990-01-15');
  await page.locator('#cv-google-age').check();
}

test('factory source uses popup first on every browser', async () => {
  const src = fs.readFileSync(path.join(root, 'factory.js'), 'utf8');
  const start = src.indexOf("getElementById('cv-google-login').addEventListener");
  const end = src.indexOf("getElementById('cv-guest-login')", start);
  const block = src.slice(start, end);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  expect(block).not.toContain('isiOS');
  expect(block).not.toContain('isSafari');
  expect(block).not.toContain('runWithAuth');
  expect(block).not.toMatch(/\bawait\b/);
  expect(block).toContain('fbAuth.signInWithPopup(provider)');
  expect(block).toContain("code === 'auth/popup-blocked'");
  expect(block).toContain("code === 'auth/operation-not-supported-in-this-environment'");
  expect(block).not.toContain('cancelled-popup-request');
  expect(block).toContain('markJoinAttested()');
  expect(src).toContain('P.LOCAL');
  expect(src).toContain('P.SESSION');
  expect(src).toContain('P.NONE');
  expect(src).toContain('runAgeAttestGate');
  expect(src).toContain('function ageAttestUidKey');
  expect(src).toContain('function markAgeAttestedUid');
  expect(src).toContain(POPUP_MSG);
  expect(src.split('authPersistPromise.then').length - 1).toBeGreaterThanOrEqual(2);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  expect(html).toContain('factory.js?v=62');
});

test('guest Like opens the join sheet, email sign-in completes the Like, and it does not ask again', async ({ page }, testInfo) => {
  await installStub(page);
  await page.goto('/');
  await openLikeGate(page);
  if (testInfo.project.name === 'webkit-iphone') {
    await page.screenshot({ path: path.join(artifacts, 'auth-guest-sheet-webkit-iphone.png') });
  }
  await emailSignIn(page);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
  await expect(page.locator('[data-act="like"]').first()).toContainText('Like · 1');
  await expect(page.locator('#thoughts-compose-err')).toHaveText('');
  await expect(page.locator('#age-attest')).toHaveCount(0);
  const dialogs = await page.evaluate(function () { return window.__ageDialogs || 0; });
  expect(dialogs).toBe(0);
  await page.waitForTimeout(300);
  const updates = await page.evaluate(function () { return window.__likeUpdates; });
  expect(updates).toBe(1);
  if (testInfo.project.name === 'webkit-iphone') {
    await page.screenshot({ path: path.join(artifacts, 'auth-like-after-email-webkit-iphone.png') });
  }
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('[data-act="like"]').first()).not.toHaveClass(/liked/);
  fs.mkdirSync(artifacts, { recursive: true });
  fs.appendFileSync(path.join(artifacts, 'auth-loop-results.jsonl'), JSON.stringify({
    project: testInfo.project.name,
    ua: await page.evaluate(function () { return navigator.userAgent; }),
    authDomain: await page.evaluate(function () { return window.__authDomain; }),
    likeUpdates: await page.evaluate(function () { return window.__likeUpdates; }),
    ageDialogs: dialogs,
    initErr: await page.evaluate(function () { return window.__initErr || ''; })
  }) + '\n');
});

test('guest Reply opens the sheet once, then focuses the reply after email sign-in', async ({ page }) => {
  await installStub(page);
  await page.goto('/');
  await waitBoot(page);
  await page.locator('[data-act="reply"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).toHaveClass(/open/);
  await emailSignIn(page);
  await expect(page.locator('#thoughts-compose-input')).toHaveAttribute('placeholder', 'Reply to this post…');
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await page.locator('[data-act="reply"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
});

test('iPhone WebKit Google sign-in calls popup during the tap and then Likes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone', 'iPhone WebKit proof');
  await installStub(page);
  await page.goto('/');
  await openLikeGate(page);
  const ua = await page.evaluate(function () { return navigator.userAgent; });
  expect(ua).toMatch(/iPhone/);
  expect(ua).toMatch(/Safari/);
  await fillAdultJoin(page);
  await page.locator('#cv-google-login').click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#age-attest')).toHaveCount(0);
  const info = await page.evaluate(function () {
    return {
      calls: window.__googleCalls,
      when: window.__popupDuringClick,
      domain: window.__authDomain,
      updates: window.__likeUpdates,
      dialogs: window.__ageDialogs || 0
    };
  });
  expect(info.calls).toEqual(['popup']);
  expect(info.when).toBe('sync');
  expect(info.domain).toBe('subx-skins.firebaseapp.com');
  expect(info.updates).toBe(1);
  expect(info.dialogs).toBe(0);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
  fs.mkdirSync(artifacts, { recursive: true });
  fs.appendFileSync(path.join(artifacts, 'auth-loop-results.jsonl'), JSON.stringify({
    project: testInfo.project.name,
    ua: ua,
    google: info
  }) + '\n');
  await page.screenshot({ path: path.join(artifacts, 'auth-google-popup-webkit-iphone.png') });
});

test('popup-blocked falls back to redirect once and does not redirect again on reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'firefox', 'same fallback path; covered on Chromium and WebKit');
  await installStub(page);
  await page.goto('/?popupBlocked=1');
  await openLikeGate(page);
  await fillAdultJoin(page);
  await page.locator('#cv-google-login').click();
  await expect(page.locator('#cv-login-err')).toHaveText(POPUP_MSG);
  const first = await page.evaluate(function () { return window.__googleCalls.slice(); });
  expect(first).toEqual(['popup', 'redirect']);

  await page.reload();
  await waitBoot(page);
  await expect(page.locator('#cv-auth-overlay')).toHaveClass(/open/);
  await expect(page.locator('#cv-login-err')).toHaveText(POPUP_MSG);
  const second = await page.evaluate(function () { return window.__googleCalls.slice(); });
  expect(second).toEqual([]);
  if (testInfo.project.name === 'webkit-iphone') {
    await page.screenshot({ path: path.join(artifacts, 'auth-popup-blocked-webkit-iphone.png') });
  }

  await page.reload();
  await waitBoot(page);
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#cv-login-err')).not.toHaveText(POPUP_MSG);
  const third = await page.evaluate(function () { return window.__googleCalls.slice(); });
  expect(third).toEqual([]);
});

test('private-mode persistence falls back from LOCAL to SESSION', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'persistence chain is browser-independent');
  await installStub(page);
  await page.goto('/?failPersist=1');
  await waitBoot(page);
  const modes = await page.evaluate(function () { return window.__persistCalls.slice(); });
  expect(modes[0]).toBe('local');
  expect(modes).toContain('session');
  await openLikeGate(page);
  await emailSignIn(page);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
});

test('Google sign-in does not reopen the age dialog when the profile read stays stale', async ({ page }, testInfo) => {
  await installStub(page);
  await page.goto('/?profile=stale&doubleAuth=1');
  await openLikeGate(page);
  await fillAdultJoin(page);
  await page.locator('#cv-google-login').click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
  await page.waitForTimeout(250);
  const info = await page.evaluate(function (key) {
    return {
      dialogs: window.__ageDialogs || 0,
      calls: window.__googleCalls.slice(),
      updates: window.__likeUpdates,
      localFlag: localStorage.getItem(key),
      sessionSite: sessionStorage.getItem('subx.joinAttested.gpchat')
    };
  }, UID_KEY);
  expect(info.dialogs).toBe(0);
  expect(info.calls).toEqual(['popup']);
  expect(info.updates).toBe(1);
  expect(info.localFlag).toBeTruthy();
  expect(info.sessionSite).toBeFalsy();
  if (testInfo.project.name === 'webkit-iphone') {
    await page.screenshot({ path: path.join(artifacts, 'auth-age-gate-webkit-iphone.png') });
  }
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#age-attest')).toHaveCount(0);
});

test('a signed-in user ignores a premature null and does not reopen the join sheet', async ({ page }) => {
  await installStub(page);
  await page.goto('/?resume=1&prematureNull=1&profile=attested&armedRedirect=1');
  await waitBoot(page);
  await page.waitForTimeout(150);
  const info = await page.evaluate(function () {
    return {
      openedOnNull: window.__openedOnNull,
      dialogs: window.__ageDialogs || 0,
      calls: (window.__googleCalls || []).slice()
    };
  });
  expect(info.openedOnNull).toBe(false);
  expect(info.dialogs).toBe(0);
  expect(info.calls).toEqual([]);
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await expect(page.locator('#auth-signout')).toBeVisible();
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
  const updates = await page.evaluate(function () { return window.__likeUpdates; });
  expect(updates).toBe(1);
});

test('a per-uid attest flag skips the age dialog for a signed-in user', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'storage fallback is browser-independent');
  await installStub(page);
  await page.goto('/?resume=1&profile=stale&ageFlag=local&prematureNull=1');
  await waitBoot(page);
  await page.waitForTimeout(150);
  let info = await page.evaluate(function () {
    return { dialogs: window.__ageDialogs || 0, openedOnNull: window.__openedOnNull };
  });
  expect(info.openedOnNull).toBe(false);
  expect(info.dialogs).toBe(0);
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);

  await page.goto('/?resume=1&profile=stale&ageFlag=session&prematureNull=1');
  await waitBoot(page);
  await page.waitForTimeout(150);
  info = await page.evaluate(function (key) {
    return {
      dialogs: window.__ageDialogs || 0,
      openedOnNull: window.__openedOnNull,
      sessionFlag: sessionStorage.getItem(key)
    };
  }, UID_KEY);
  expect(info.openedOnNull).toBe(false);
  expect(info.dialogs).toBe(0);
  expect(info.sessionFlag).toBeTruthy();
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
});

test('legacy account confirms age once and a second auth event does not ask again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'firefox', 'same age dialog; covered on Chromium and WebKit');
  await installStub(page);
  await page.goto('/?profile=stale&doubleAuth=1');
  await openLikeGate(page);
  await page.locator('#cv-use-email-btn').click();
  await page.locator('#cv-login-email').fill('listener@example.com');
  await page.locator('#cv-login-pw').fill('secret1');
  await page.locator('#cv-login-btn').click();
  await expect(page.locator('#age-attest')).toBeVisible();
  await setDob(page, '#age-attest-dob', '1990-01-15');
  await page.locator('#age-attest-ok').check();
  await page.locator('#age-attest-go').click();
  await expect(page.locator('#age-attest')).toHaveCount(0);
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('[data-act="like"]').first()).toHaveClass(/liked/);
  await page.waitForTimeout(250);
  const dialogs = await page.evaluate(function () { return window.__ageDialogs || 0; });
  expect(dialogs).toBe(1);
  const updates = await page.evaluate(function () { return window.__likeUpdates; });
  expect(updates).toBe(1);
  await page.locator('[data-act="like"]').first().click();
  await expect(page.locator('#cv-auth-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#age-attest')).toHaveCount(0);
});

test('underage date of birth does not start Google sign-in', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'minAge check is browser-independent');
  await installStub(page);
  await page.goto('/');
  await openLikeGate(page);
  await setDob(page, '#cv-google-dob', '2015-01-15');
  await page.locator('#cv-google-age').check();
  await page.locator('#cv-google-login').click();
  const calls = await page.evaluate(function () { return window.__googleCalls.slice(); });
  expect(calls).toEqual([]);
  await expect(page.locator('#cv-login-err')).toContainText('18 or older');
  await expect(page.locator('#cv-auth-overlay')).toHaveClass(/open/);
});
