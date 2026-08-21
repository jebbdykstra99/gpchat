(function () {
  'use strict';

  const MOBILE_NAV_MQ = 900;
  const LS_USER = 'gpchat.user';
  const LS_LIKES = 'gpchat.likes';
  const SITE_JSON_URL = (document.currentScript && document.currentScript.getAttribute('data-site')) || 'site.json';

  let SITE_ID = 'gpchat';
  let site = null;
  let COLORS = ['#e10600', '#b10500', '#0a0a0c', '#d4af37', '#3a3a42', '#6b1a16'];
  let TRENDS = [];
  let PLACES = [];
  let TOPICS = [];

  let fbAuth = null;
  let fbDb = null;
  let fbStorage = null;
  let livePosts = [];
  let liveReady = false;
  let liveError = null;
  let replyTo = null;
  let attachedFile = null;
  let pollActive = false;
  let previewObjectUrl = null;
  let siteKilled = false;
  let blockedUids = {};
  let blocksUnsub = null;
  const ADMIN_UID = 'o774wL9hUVSi19EkDCgLqQomP8i2';

  try {
    firebase.initializeApp({
    apiKey: "AIzaSyD4CgKQTylEy03Lh9Uhe9UVloyrKaK3bdY",
    authDomain: "subx-skins.firebaseapp.com",
    projectId: "subx-skins",
    storageBucket: "subx-skins.firebasestorage.app",
    messagingSenderId: "869847405863",
    appId: "1:869847405863:web:26f902efb9a4ee0b7c0502"
    });
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    fbStorage = firebase.storage();
    try {
      firebase.appCheck().activate('6LffWZAtAAAAAGAXCR6JcwiXEY5FnowtegOLmElk', true);
    } catch (e2) { console.warn('app-check', e2); }
  } catch (e) { console.warn('subx-skins init', e); }

  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }

  let currentUser = loadJSON(LS_USER, null);
  let likes = loadJSON(LS_LIKES, {});
  let currentTab = 'foryou';

  function initials(name) {
    return String(name || 'M').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'M';
  }
  function colorFor(handle) {
    let n = 0;
    const h = String(handle || 'm');
    for (let i = 0; i < h.length; i++) n = (n + h.charCodeAt(i) * (i + 1)) % COLORS.length;
    return COLORS[n];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function looksLikeUid(s) {
    return typeof s === 'string' && /^[A-Za-z0-9]{20,36}$/.test(s);
  }
  function humanName(d, uid) {
    var n = (d && d.authorName) || '';
    if (n && n !== uid && !looksLikeUid(n)) return n;
    var h = (d && d.authorHandle) || '';
    if (h && h !== uid && !looksLikeUid(h)) return h;
    return 'Member';
  }
  function humanHandle(d, uid) {
    var h = (d && d.authorHandle) || '';
    if (h && h !== uid && !looksLikeUid(h)) return h;
    var n = humanName(d, uid);
    return String(n).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'member';
  }
  function liveUid() {
    return (fbAuth && fbAuth.currentUser && fbAuth.currentUser.uid) || null;
  }
  function isLiveUser() {
    return !!(fbAuth && fbAuth.currentUser);
  }
  function findPost(id) {
    for (var i = 0; i < livePosts.length; i++) if (livePosts[i].id === id) return livePosts[i];
    return null;
  }

  var deepPostId = '';
  var deepPostDone = false;
  var shareSheetPostId = null;

  function postPermalink(postId) {
    var id = String(postId || '');
    var host = location.host || '';
    return 'https://' + host + '/?p=' + encodeURIComponent(id);
  }

  function shareTextSlice(post) {
    var t = String((post && (post.title || post.text)) || '').replace(/\s+/g, ' ').trim();
    if (!t) t = ((site && site.name) || SITE_ID || '') + ' post';
    if (t.length > 200) t = t.slice(0, 197) + '...';
    return t;
  }

  function closeShareSheet() {
    var ov = document.getElementById('share-sheet');
    if (ov) ov.hidden = true;
    shareSheetPostId = null;
  }

  function ensureShareSheet() {
    var ov = document.getElementById('share-sheet');
    if (ov) return ov;
    if (!document.getElementById('share-sheet-css')) {
      var st = document.createElement('style');
      st.id = 'share-sheet-css';
      st.textContent =
        '#share-sheet{position:fixed;inset:0;z-index:80;background:rgba(18,24,28,.42);display:flex;align-items:flex-end;justify-content:center;padding:16px;}' +
        '#share-sheet[hidden]{display:none!important;}' +
        '.share-sheet{width:min(420px,100%);background:var(--surface,#fffaf3);color:var(--text,#1a2a30);border:1px solid var(--border,#e4d6c4);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:10px;}' +
        '.share-sheet h3{margin:6px 8px 10px;font-size:15px;font-weight:650;}' +
        '.share-sheet button{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:10px;padding:11px 12px;font:inherit;font-size:14px;cursor:pointer;color:inherit;}' +
        '.share-sheet button:hover{background:rgba(0,0,0,.06);}' +
        '.share-sheet .share-cancel{color:var(--text-muted,#4a5f66);margin-top:4px;}' +
        '.post.is-deep-post{box-shadow:inset 0 0 0 2px var(--accent,#e07a3d);border-radius:10px;}';
      document.head.appendChild(st);
    }
    ov = document.createElement('div');
    ov.id = 'share-sheet';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="share-sheet" role="dialog" aria-modal="true" aria-label="Share">' +
        '<h3>Share</h3>' +
        '<button type="button" data-share="copy">Copy link</button>' +
        '<button type="button" data-share="x">Post on X</button>' +
        '<button type="button" data-share="reddit">Post on Reddit</button>' +
        '<button type="button" class="share-cancel" data-share="close">Cancel</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { closeShareSheet(); return; }
      var btn = e.target.closest('[data-share]');
      if (!btn) return;
      var act = btn.getAttribute('data-share');
      if (act === 'close') { closeShareSheet(); return; }
      if (!shareSheetPostId) return;
      var post = findPost(shareSheetPostId);
      var permalink = postPermalink(shareSheetPostId);
      var slice = shareTextSlice(post);
      if (act === 'copy') {
        var done = function () { composeErr('Link copied'); closeShareSheet(); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(permalink).then(done).catch(function () {
            try { window.prompt('Copy link', permalink); } catch (e2) {}
            done();
          });
        } else {
          try { window.prompt('Copy link', permalink); } catch (e3) {}
          done();
        }
        return;
      }
      if (act === 'x') {
        var xUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(slice) +
          '&url=' + encodeURIComponent(permalink);
        window.open(xUrl, '_blank', 'noopener,noreferrer');
        closeShareSheet();
        return;
      }
      if (act === 'reddit') {
        var rUrl = 'https://www.reddit.com/submit?url=' + encodeURIComponent(permalink) +
          '&title=' + encodeURIComponent(slice);
        var sr = site && site.redditSr;
        if (sr) rUrl += '&sr=' + encodeURIComponent(String(sr));
        window.open(rUrl, '_blank', 'noopener,noreferrer');
        closeShareSheet();
      }
    });
    return ov;
  }

  function sharePost(postId) {
    if (!postId) return;
    var post = findPost(postId);
    if (!post) {
      composeErr('Could not find that post.');
      return;
    }
    shareSheetPostId = postId;
    ensureShareSheet().hidden = false;
  }

  function highlightDeepPost() {
    if (!deepPostId || deepPostDone || !liveReady) return;
    var feed = document.getElementById('thoughts-feed');
    if (!feed) return;
    var safe = String(deepPostId).replace(/"/g, '');
    var el = feed.querySelector('[data-post-id="' + safe + '"]');
    if (!el) return;
    deepPostDone = true;
    el.classList.add('is-deep-post');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
  }

  function isEmailVerified() {
    var u = fbAuth && fbAuth.currentUser;
    return !!(u && u.emailVerified);
  }
  function requireVerified(action) {
    if (!isLiveUser()) {
      composeErr('Sign in with email to ' + (action || 'post') + '. Guest can only browse.');
      openAuth('login');
      return false;
    }
    if (siteKilled) {
      composeErr('This room is paused.');
      return false;
    }
    if (!isEmailVerified()) {
      composeErr('Verify your email before you ' + (action || 'post') + '. Check your inbox, then refresh.');
      var u = fbAuth.currentUser;
      if (u && u.sendEmailVerification) u.sendEmailVerification().catch(function () {});
      return false;
    }
    return true;
  }
  function syncKillBanner() {
    var el = document.getElementById('kill-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kill-banner';
      el.className = 'preview-banner';
      el.setAttribute('role', 'status');
      el.hidden = true;
      var prev = document.querySelector('.preview-banner');
      if (prev && prev.parentNode) prev.parentNode.insertBefore(el, prev.nextSibling);
      else document.body.insertBefore(el, document.body.firstChild);
    }
    if (siteKilled) {
      el.hidden = false;
      el.textContent = 'This room is paused.';
    } else {
      el.hidden = true;
    }
  }
  function listenKillSwitch() {
    if (!fbDb) return;
    fbDb.collection('sites').doc(SITE_ID).onSnapshot(function (snap) {
      var d = snap.exists ? (snap.data() || {}) : {};
      siteKilled = d.killed === true;
      syncKillBanner();
    }, function () {});
  }
  function listenBlocks(uid) {
    if (blocksUnsub) { blocksUnsub(); blocksUnsub = null; }
    blockedUids = {};
    if (!fbDb || !uid) { renderFeed(); return; }
    blocksUnsub = fbDb.collection('users').doc(uid).collection('blocks').onSnapshot(function (snap) {
      blockedUids = {};
      snap.forEach(function (d) { blockedUids[d.id] = true; });
      renderFeed();
    }, function () {});
  }
  function reportPost(id) {
    if (!requireVerified('report')) return;
    var post = findPost(id);
    if (!post || !fbDb) return;
    fbDb.collection('reports').add({
      siteId: SITE_ID,
      postId: id,
      targetUid: post.authorUid || '',
      reporterUid: liveUid(),
      reason: 'abuse',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      composeErr('Reported. Thanks.');
    }).catch(function (e) {
      composeErr((e && e.message) ? e.message : 'Could not report.');
    });
  }
  function blockUser(uid) {
    if (!requireVerified('block')) return;
    if (!uid || uid === liveUid() || !fbDb) return;
    fbDb.collection('users').doc(liveUid()).collection('blocks').doc(uid).set({
      siteId: SITE_ID,
      blockerUid: liveUid(),
      targetUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      composeErr('Blocked. Their posts are hidden for you.');
    }).catch(function (e) {
      composeErr((e && e.message) ? e.message : 'Could not block.');
    });
  }
  window.subxKill = function (on) {
    if (!fbAuth || !fbAuth.currentUser || fbAuth.currentUser.uid !== ADMIN_UID) {
      console.warn('subxKill: not admin');
      return Promise.reject(new Error('not admin'));
    }
    return fbDb.collection('sites').doc(SITE_ID).set({
      killed: !!on,
      siteId: SITE_ID,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  };


  function applyTheme(tokens) {
    if (!tokens) return;
    var root = document.documentElement;
    Object.keys(tokens).forEach(function (k) {
      if (k === 'avatarColors') return;
      if (typeof tokens[k] === 'string') root.style.setProperty('--' + k, tokens[k]);
    });
    if (Array.isArray(tokens.avatarColors) && tokens.avatarColors.length) COLORS = tokens.avatarColors.slice();
  }

  function applySiteChrome() {
    if (!site) return;
    var title = site.name || "gpchat";
    var tag = site.tagline || '';
    document.title = tag ? (title + ' — ' + tag) : title;
    var brandTitle = document.querySelector('.brand-title');
    var brandSub = document.querySelector('.brand-sub');
    if (brandTitle) brandTitle.textContent = title;
    if (brandSub) brandSub.textContent = tag;
    var authTitle = document.getElementById('auth-title');
    if (authTitle) authTitle.textContent = 'Join ' + title;
    var input = document.getElementById('thoughts-compose-input');
    if (input && site.composePlaceholder) {
      input.placeholder = site.composePlaceholder;
      input.setAttribute('data-ph', site.composePlaceholder);
    }
  }

  function hideDummyChrome() {
    document.querySelectorAll('[data-soon]').forEach(function (el) {
      el.classList.add('is-soon');
      if (!el.querySelector('.nav-soon')) {
        var badge = document.createElement('span');
        badge.className = 'nav-soon';
        badge.textContent = 'Soon';
        el.appendChild(badge);
      }
    });
    var notifBadge = document.getElementById('notif-badge');
    if (notifBadge) {
      notifBadge.textContent = '';
      notifBadge.classList.remove('visible');
      notifBadge.hidden = true;
    }
    document.body.classList.toggle('is-live', isLiveUser());
    document.body.classList.toggle('is-guest', !isLiveUser());
  }

  function applyFbUser(user) {
    if (!user) return;
    const raw = user.displayName || (user.email || 'member').split('@')[0];
    currentUser = {
      uid: user.uid,
      name: raw,
      handle: String(raw).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'member',
      bio: '',
      live: true
    };
    saveJSON(LS_USER, currentUser);
    closeAuth();
    renderSidebarAuth();
    hideDummyChrome();
    syncProfile();
    listenBlocks(user.uid);
    if (!user.emailVerified) {
      composeErr('Verify your email before posting. Check your inbox, then refresh.');
    }
  }

  function mapLive(doc) {
    const d = doc.data() || {};
    const uid = d.authorUid || null;
    const ms = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : Date.now();
    const likedBy = d.likes || {};
    return {
      id: doc.id,
      authorUid: uid,
      name: humanName(d, uid),
      handle: humanHandle(d, uid),
      text: d.text || '',
      ms: ms,
      hours: Math.max(0, Math.round((Date.now() - ms) / 3600000)),
      likedBy: likedBy,
      likes: Object.keys(likedBy).length || d.likeCount || 0,
      replies: d.replyCount || 0,
      parentId: d.parentId || null,
      live: true,
      imageUrl: d.imageUrl || null,
      poll: d.poll || null
    };
  }

  function listenLivePosts() {
    if (!fbDb) {
      composeErr('Feed is not connected.');
      return;
    }
    fbDb.collection('posts')
      .where('siteId', '==', SITE_ID)
      .orderBy('createdAt', 'desc')
      .limit(80)
      .onSnapshot(function (snap) {
        liveReady = true;
        if (liveError) composeErr('');
        liveError = null;
        livePosts = snap.docs.map(mapLive);
        renderFeed();
        if (currentUser) syncProfile();
      }, function (err) {
        liveReady = false;
        liveError = err;
        var msg = (err && err.message) ? err.message : 'Could not load live posts.';
        composeErr('Feed: ' + msg + ' A composite index on posts (siteId ASC, createdAt DESC) may be required in Firebase project subx-skins. Do not treat this as a loaded empty room.');
        renderFeed();
      });
  }

  function composeErr(msg) {
    var el = document.getElementById('thoughts-compose-err');
    if (!el) {
      el = document.createElement('div');
      el.id = 'thoughts-compose-err';
      el.setAttribute('role', 'status');
      el.style.cssText = 'padding:8px 16px 0;font-size:13px;color:#c45e28;';
      var box = document.getElementById('thoughts-compose-wrap');
      if (box) box.appendChild(el);
    }
    el.textContent = msg || '';
  }

  function isMobileNav() { return window.innerWidth <= MOBILE_NAV_MQ; }
  function closeMobileNav() {
    document.body.classList.remove('nav-open');
    syncHamburgerAria();
  }
  function syncHamburgerAria() {
    if (!hamburger) return;
    const open = isMobileNav()
      ? document.body.classList.contains('nav-open')
      : !document.body.classList.contains('nav-collapsed');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }

  function highlightSocial(name) {
    document.querySelectorAll('.nav-social-link').forEach(function (l) { l.classList.remove('active'); });
    const el = document.querySelector('[data-social="' + name + '"]');
    if (el) el.classList.add('active');
  }

  function closeSocialOverlays() {
    ['explore-overlay', 'notif-overlay', 'chat-overlay', 'profile-overlay'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active', 'thread-open');
    });
  }

  function showContentPage(id) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    const page = document.getElementById('page-' + id);
    if (page) page.classList.add('active');
    window.scrollTo(0, 0);
  }

  function normalizeRoute(route) {
    let id = String(route || '').replace(/^#/, '').trim();
    if (!id) id = 'home';
    try { id = decodeURIComponent(id); } catch (e) { /* keep */ }
    return id;
  }
  function routeFromHash() { return normalizeRoute(window.location.hash); }
  function go(route) {
    const id = normalizeRoute(route);
    const hash = '#' + id;
    if (location.hash === hash) { applyRoute(); return; }
    location.hash = hash;
  }

  function selectThoughtsTab(tab) {
    currentTab = tab;
    document.querySelectorAll('[data-thoughts-tab]').forEach(function (t) {
      t.classList.toggle('active', t.dataset.thoughtsTab === tab);
    });
    renderFeed();
  }

  function applyRoute() {
    closeMobileNav();
    const raw = routeFromHash();

    if (raw === 'following') {
      closeSocialOverlays();
      showContentPage('thoughts');
      highlightSocial('following');
      selectThoughtsTab('following');
      return;
    }
    if (raw === 'hot' || raw === 'new') {
      closeSocialOverlays();
      showContentPage('thoughts');
      highlightSocial('home');
      selectThoughtsTab(raw);
      return;
    }
    if (raw === 'home' || raw === 'feed' || raw === 'thoughts') {
      closeSocialOverlays();
      showContentPage('thoughts');
      highlightSocial('home');
      selectThoughtsTab('foryou');
      return;
    }
    if (raw === 'chat') { openChat(); return; }
    if (raw === 'notifications') { openNotif(); return; }
    if (raw === 'explore') { openExplore(); return; }
    if (raw === 'profile') { openProfile(); return; }
    if (raw === 'news') {
      closeSocialOverlays();
      showContentPage('news');
      highlightSocial('news');
      return;
    }
    closeSocialOverlays();
    showContentPage('thoughts');
    highlightSocial('home');
  }

  function renderPostMedia(post) {
    var html = '';
    if (post.imageUrl) {
      html += '<div class="post-image"><img src="' + escapeHtml(post.imageUrl) + '" alt="" loading="lazy"></div>';
    }
    if (post.poll && post.poll.options && post.poll.options.length) {
      var votes = post.poll.votes || {};
      var keys = Object.keys(votes);
      var total = keys.length;
      var voterUid = liveUid();
      html += '<div class="post-poll">';
      post.poll.options.forEach(function (opt, i) {
        var count = 0;
        for (var v = 0; v < keys.length; v++) if (votes[keys[v]] === i) count++;
        var pct = total ? Math.round((count / total) * 100) : 0;
        var voted = voterUid != null && votes[voterUid] === i;
        html += '<div class="post-poll-option' + (voted ? ' voted' : '') + '" data-poll-idx="' + i + '" data-post-id="' + escapeHtml(String(post.id)) + '">' +
          '<div class="post-poll-bar" style="width:' + pct + '%"></div>' +
          '<span class="post-poll-label">' + escapeHtml(opt) + '</span>' +
          '<span class="post-poll-pct">' + count + ' · ' + pct + '%</span>' +
        '</div>';
      });
      html += '<div class="post-poll-meta">' + total + ' vote' + (total === 1 ? '' : 's') + (voterUid ? '' : ' · sign in to vote') + '</div></div>';
    }
    return html;
  }

  function renderPost(post, isReply) {
    const uid = liveUid();
    const liked = !!(uid && post.likedBy && post.likedBy[uid]);
    const likeCount = post.likes || 0;
    const av = initials(post.name);
    const bg = colorFor(post.handle);
    const canDelete = !!(uid && post.authorUid && post.authorUid === uid);
    const replyBtn = isReply
      ? ''
      : '<button class="post-action" data-act="reply" type="button">Reply · ' + (post.replies || 0) + '</button>';
    const delBtn = canDelete
      ? '<button class="post-action post-action-delete" data-act="delete" type="button">Delete</button>'
      : '';
    const other = !!(uid && post.authorUid && post.authorUid !== uid);
    const reportBtn = other
      ? '<button class="post-action" data-act="report" type="button">Report</button>'
      : '';
    const blockBtn = other
      ? '<button class="post-action" data-act="block" type="button">Block</button>'
      : '';
    return (
      '<article class="post' + (isReply ? ' post-reply' : '') + '" data-post-id="' + escapeHtml(post.id) + '"' +
        (post.parentId ? ' data-parent-id="' + escapeHtml(post.parentId) + '"' : '') + '>' +
        '<div class="post-avatar" style="background:' + bg + '">' + av + '</div>' +
        '<div class="post-body">' +
          '<div class="post-meta">' +
            '<span class="post-name">' + escapeHtml(post.name) + '</span>' +
            '<span class="post-handle">@' + escapeHtml(post.handle) + '</span>' +
            '<span class="post-time">· ' + (post.hours != null ? post.hours + 'h' : 'now') + '</span>' +
          '</div>' +
          (post.text ? '<p class="post-text">' + escapeHtml(post.text) + '</p>' : '') +
          renderPostMedia(post) +
          '<div class="post-actions">' +
            replyBtn +
            '<button class="post-action' + (liked ? ' liked' : '') + '" data-act="like" type="button">Like · ' + likeCount + '</button>' +
            '<button class="post-action" data-act="share" type="button">Share</button>' +
            reportBtn + blockBtn +
            delBtn +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function topLevelPosts() {
    return livePosts.filter(function (p) { return !p.parentId && !(p.authorUid && blockedUids[p.authorUid]); });
  }

  function repliesFor(parentId) {
    return livePosts.filter(function (p) { return p.parentId === parentId && !(p.authorUid && blockedUids[p.authorUid]); })
      .sort(function (a, b) { return (a.ms || 0) - (b.ms || 0); });
  }

  function renderFeed() {
    const el = document.getElementById('thoughts-feed');
    if (!el) return;

    if (currentTab === 'following') {
      el.innerHTML = '<div class="post-empty soon-panel"><strong>Following — Soon.</strong> There is no follows graph in this preview. The live room is on For You.</div>';
      return;
    }

    if (liveError) {
      el.innerHTML = '<div class="post-empty">Live feed could not load. The error is in the compose line above — this is not an empty room.</div>';
      return;
    }
    if (!liveReady) {
      el.innerHTML = '<div class="post-empty">Connecting to the live feed…</div>';
      return;
    }

    let posts = topLevelPosts().slice();
    if (currentTab === 'hot') posts.sort(function (a, b) { return (b.likes || 0) - (a.likes || 0); });
    if (currentTab === 'new') posts.sort(function (a, b) { return (b.ms || 0) - (a.ms || 0); });

    if (!posts.length) {
      var empty = (site && site.emptyState) || 'This room is empty. Sign in with email to post. Guest can browse only.';
      el.innerHTML = '<div class="post-empty">' + escapeHtml(empty) + '</div>';
      return;
    }

    el.innerHTML = posts.map(function (p) {
      var kids = repliesFor(p.id);
      return renderPost(p, false) + kids.map(function (r) { return renderPost(r, true); }).join('');
    }).join('');
    highlightDeepPost();
  }

  function renderTrends() {
    const card = function (t) {
      const href = t.url || '#explore';
      const extra = t.url ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<a class="news-item" href="' + href + '"' + extra + '>' +
        '<div class="news-item-tag">' + escapeHtml(t.tag) + '</div>' +
        '<div class="news-item-headline">' + escapeHtml(t.headline) + '</div>' +
        '<div class="news-item-snippet">' + escapeHtml(t.snippet) + '</div>' +
        '<div class="news-item-meta">' + escapeHtml(t.meta) + '</div>' +
      '</a>';
    };
    const rail = document.getElementById('news-feed');
    const page = document.getElementById('news-page-list');
    const html = TRENDS.map(card).join('');
    if (rail) rail.innerHTML = html;
    if (page) page.innerHTML = html;
  }

  function renderExplore() {
    function cards(list) {
      return list.map(function (c) {
        const inner = '<div class="explore-card-tag">' + escapeHtml(c.tag) + '</div>' +
          '<div class="explore-card-title">' + escapeHtml(c.title) + '</div>' +
          '<div class="explore-card-snippet">' + escapeHtml(c.snippet) + '</div>';
        if (c.url) {
          return '<a class="explore-card" href="' + c.url + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>';
        }
        return '<article class="explore-card">' + inner + '</article>';
      }).join('');
    }
    var places = document.getElementById('explore-pane-places');
    var topics = document.getElementById('explore-pane-topics');
    if (places) places.innerHTML = cards(PLACES);
    if (topics) topics.innerHTML = cards(TOPICS);
  }

  function renderNotifs() {
    const el = document.getElementById('notif-list');
    if (!el) return;
    el.innerHTML = '<div class="soon-panel">' +
      '<strong>Notifications — Soon.</strong>' +
      '<p>No live alerts in this preview. Dummy copy stays in site.json as sample only and is not shown as real activity.</p>' +
      '</div>';
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = '';
      badge.classList.remove('visible');
      badge.hidden = true;
    }
  }

  function renderThreads() {
    const el = document.getElementById('chat-thread-list');
    if (!el) return;
    el.innerHTML = '<div class="soon-panel soon-panel-pad">' +
      '<strong>Chat — Soon.</strong>' +
      '<p>Direct messages are not live. Sample thread copy in site.json is not a real inbox.</p>' +
      '</div>';
  }

  function openChat() {
    closeSocialOverlays();
    document.getElementById('chat-overlay').classList.add('active');
    highlightSocial('chat');
  }
  function openNotif() {
    closeSocialOverlays();
    document.getElementById('notif-overlay').classList.add('active');
    highlightSocial('notifications');
  }
  function openExplore() {
    closeSocialOverlays();
    document.getElementById('explore-overlay').classList.add('active');
    highlightSocial('explore');
  }
  function openProfile() {
    closeSocialOverlays();
    document.getElementById('profile-overlay').classList.add('active');
    highlightSocial('profile');
    syncProfile();
  }

  function syncProfile() {
    const prompt = document.getElementById('profile-signin-prompt');
    const content = document.getElementById('profile-content');
    if (!isLiveUser() || !currentUser || !currentUser.live) {
      if (prompt) prompt.hidden = false;
      if (content) content.hidden = true;
      var top = document.getElementById('profile-topbar-name');
      if (top) top.textContent = 'Profile';
      return;
    }
    if (prompt) prompt.hidden = true;
    if (content) content.hidden = false;
    document.getElementById('profile-topbar-name').textContent = currentUser.name;
    document.getElementById('profile-display-name').textContent = currentUser.name;
    document.getElementById('profile-handle').textContent = '@' + currentUser.handle;
    document.getElementById('profile-avatar').textContent = initials(currentUser.name);
    document.getElementById('profile-bio').textContent = currentUser.bio || "Nothing but Grand Prix.";
    const mine = livePosts.filter(function (p) { return p.authorUid && p.authorUid === currentUser.uid; });
    const pane = document.getElementById('profile-pane-posts');
    if (!pane) return;
    if (!mine.length) {
      pane.innerHTML = '<div class="empty-note" id="profile-posts-empty">No posts yet. Hit Post when the safety car comes out.</div>';
    } else {
      pane.innerHTML = mine.map(function (p) { return renderPost(p, !!p.parentId); }).join('');
    }
  }

  function renderSidebarAuth() {
    const el = document.getElementById('sidebar-auth');
    const av = document.getElementById('thoughts-compose-avatar');
    if (!el) return;
    if (isLiveUser() && currentUser && currentUser.live) {
      el.innerHTML =
        '<div class="sidebar-auth-user">' +
          '<div class="sidebar-auth-avatar">' + initials(currentUser.name) + '</div>' +
          '<div class="sidebar-auth-name">@' + escapeHtml(currentUser.handle) + '</div>' +
        '</div>' +
        '<button class="sidebar-auth-btn" id="auth-signout" type="button">Sign out</button>';
      if (av) {
        av.textContent = initials(currentUser.name);
        av.style.background = colorFor(currentUser.handle);
      }
    } else if (currentUser && !currentUser.live) {
      el.innerHTML =
        '<div class="sidebar-auth-user">' +
          '<div class="sidebar-auth-avatar">' + initials(currentUser.name || 'G') + '</div>' +
          '<div class="sidebar-auth-name">Guest · browse only</div>' +
        '</div>' +
        '<button class="sidebar-auth-btn primary" id="auth-signin" type="button">Sign in</button>' +
        '<button class="sidebar-auth-btn" id="auth-signout" type="button">Leave guest</button>';
      if (av) {
        av.textContent = initials(currentUser.name || 'G');
        av.style.background = colorFor(currentUser.handle || 'guest');
      }
    } else {
      el.innerHTML = '<button class="sidebar-auth-btn primary" id="auth-signin" type="button">Sign in</button>';
      if (av) {
        av.textContent = "GP";
        av.style.background = '';
      }
    }
  }

  function openAuth(tab) {
    const ov = document.getElementById('cv-auth-overlay');
    ov.classList.add('open');
    document.querySelectorAll('.conv-modal-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('cv-panel-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('cv-panel-register').style.display = tab === 'register' ? '' : 'none';
    const closeBtn = document.getElementById('cv-modal-close');
    if (closeBtn) closeBtn.focus();
  }
  function closeAuth() {
    document.getElementById('cv-auth-overlay').classList.remove('open');
  }
  function stubSignIn(name, handle) {
    currentUser = {
      name: name || 'Guest',
      handle: (handle || 'guestgp').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'guestgp',
      bio: "Nothing but Grand Prix.",
      live: false
    };
    saveJSON(LS_USER, currentUser);
    closeAuth();
    renderSidebarAuth();
    hideDummyChrome();
    syncProfile();
    listenBlocks(user.uid);
    if (!user.emailVerified) {
      composeErr('Verify your email before posting. Check your inbox, then refresh.');
    }
  }
  function signOut() {
    if (fbAuth && fbAuth.currentUser) fbAuth.signOut();
    currentUser = null;
    saveJSON(LS_USER, null);
    renderSidebarAuth();
    hideDummyChrome();
    syncProfile();
    renderFeed();
  }

  function syncPostBtn() {
    const input = document.getElementById('thoughts-compose-input');
    const text = (input && input.value || '').trim();
    const pollReady = pollActive && [...document.querySelectorAll('#compose-poll .compose-poll-input')].filter(function (i) { return i.value.trim(); }).length >= 2;
    const btn = document.getElementById('thoughts-post-btn');
    if (btn) btn.disabled = !(text || attachedFile || pollReady);
  }

  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  function isVideoFile(file) {
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('video/') === 0) return true;
    return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name || '');
  }
  function isProbablyImage(file) {
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('image/') === 0) return true;
    if (isVideoFile(file)) return false;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || '');
  }
  function showAttachedImage(file) {
    attachedFile = file;
    var img = document.getElementById('compose-preview-img');
    var box = document.getElementById('compose-image-preview');
    if (previewObjectUrl) {
      try { URL.revokeObjectURL(previewObjectUrl); } catch (e) {}
      previewObjectUrl = null;
    }
    previewObjectUrl = URL.createObjectURL(file);
    if (img) {
      img.alt = '';
      img.src = previewObjectUrl;
    }
    if (box) box.hidden = false;
    syncPostBtn();
  }
  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image. Try JPEG or PNG.'));
      };
      img.src = url;
    });
  }
  function jpegFromImage(img, maxEdge, quality) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return Promise.reject(new Error('Could not read that image.'));
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Could not shrink that image.')); return; }
        resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    });
  }
  function fitImageUnderLimit(file) {
    var readyTypes = { 'image/jpeg': 1, 'image/png': 1, 'image/gif': 1, 'image/webp': 1 };
    if (file.size <= MAX_IMAGE_BYTES && file.type && readyTypes[file.type]) {
      return Promise.resolve(file);
    }
    return loadImageElement(file).then(function (img) {
      var edge = 1920;
      var q = 0.82;
      function attempt() {
        return jpegFromImage(img, edge, q).then(function (out) {
          if (out.size <= MAX_IMAGE_BYTES) return out;
          if (q > 0.5) { q = Math.round((q - 0.12) * 100) / 100; return attempt(); }
          if (edge > 640) { edge = Math.round(edge * 0.7); q = 0.74; return attempt(); }
          return Promise.reject(new Error('Could not get that photo under 5 MB.'));
        });
      }
      return attempt();
    });
  }
  function setImagePreview(file) {
    if (!file) return;
    if (isVideoFile(file)) {
      composeErr('Images only. No video yet.');
      return;
    }
    if (!isProbablyImage(file)) {
      composeErr('Images only. No video.');
      return;
    }
    composeErr(file.size > MAX_IMAGE_BYTES ? 'Shrinking photo…' : '');
    fitImageUnderLimit(file).then(function (ready) {
      composeErr('');
      showAttachedImage(ready);
    }).catch(function (e) {
      composeErr((e && e.message) ? e.message : 'Could not attach that photo.');
    });
  }

  function uploadImage(file, uid) {
    if (!fbStorage) return Promise.reject(new Error('Storage not ready'));
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = 'posts/' + SITE_ID + '/' + uid + '/' + Date.now() + '.' + ext;
    const ref = fbStorage.ref(path);
    const bar = document.getElementById('compose-upload-bar');
    const fill = document.getElementById('compose-upload-fill');
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = '0%';
    return new Promise(function (resolve, reject) {
      const task = ref.put(file, { contentType: file.type || 'image/jpeg' });
      task.on('state_changed',
        function (snap) { if (fill) fill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + '%'; },
        function (err) { if (bar) bar.hidden = true; reject(err); },
        function () { if (bar) bar.hidden = true; task.snapshot.ref.getDownloadURL().then(resolve).catch(reject); }
      );
    });
  }

  function resetComposeExtras() {
    attachedFile = null;
    pollActive = false;
    var preview = document.getElementById('compose-image-preview');
    if (preview) preview.hidden = true;
    var img = document.getElementById('compose-preview-img');
    if (img) img.src = '';
    var imgIn = document.getElementById('compose-image-input');
    if (imgIn) imgIn.value = '';
    var gifIn = document.getElementById('compose-gif-input');
    if (gifIn) gifIn.value = '';
    var poll = document.getElementById('compose-poll');
    if (poll) {
      poll.hidden = true;
      var opts = poll.querySelectorAll('.compose-poll-option');
      opts.forEach(function (el, i) {
        if (i < 2) {
          var inp = el.querySelector('.compose-poll-input');
          if (inp) inp.value = '';
        } else el.remove();
      });
    }
    var dur = document.getElementById('compose-poll-duration');
    if (dur) dur.value = '3';
    var pollBtn = document.getElementById('compose-btn-poll');
    if (pollBtn) pollBtn.style.color = '';
    var wrap2 = document.getElementById('compose-emoji-wrap');
    if (wrap2) wrap2.remove();
    if (previewObjectUrl) {
      try { URL.revokeObjectURL(previewObjectUrl); } catch (e) {}
      previewObjectUrl = null;
    }
  }

  function maybePost() {
    const input = document.getElementById('thoughts-compose-input');
    const text = (input.value || '').trim();
    const pollReady = pollActive && [...document.querySelectorAll('#compose-poll .compose-poll-input')].filter(function (i) { return i.value.trim(); }).length >= 2;
    if (!(text || attachedFile || pollReady)) return;
    const live = fbAuth && fbAuth.currentUser;
    if (!live) { composeErr('Sign in with email to post. Guest can only browse.'); openAuth('login'); return; }
    if (!requireVerified('post')) return;
    if (!fbDb) { composeErr('Feed is not connected.'); return; }
    const parentId = replyTo;
    replyTo = null;
    composeErr('');
    const btn = document.getElementById('thoughts-post-btn');
    btn.disabled = true;
    const start = attachedFile ? uploadImage(attachedFile, live.uid) : Promise.resolve(null);
    start.then(function (imageUrl) {
      const disp = (currentUser && currentUser.name) || live.displayName || (live.email || 'member').split('@')[0] || 'Member';
      const handle = (currentUser && currentUser.handle) || String(disp).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'member';
      const doc = {
        siteId: SITE_ID,
        parentId: parentId,
        authorUid: live.uid,
        authorName: disp,
        authorHandle: handle,
        text: text.slice(0, 280),
        likes: {},
        likeCount: 0,
        replyCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (imageUrl) doc.imageUrl = imageUrl;
      if (pollActive) {
        const opts = [...document.querySelectorAll('#compose-poll .compose-poll-input')].map(function (i) { return i.value.trim(); }).filter(Boolean);
        if (opts.length >= 2) {
          const duration = parseInt(document.getElementById('compose-poll-duration').value, 10) || 3;
          doc.poll = {
            options: opts,
            votes: {},
            duration: duration,
            endsAt: firebase.firestore.Timestamp.fromMillis(Date.now() + duration * 86400000)
          };
        }
      }
      return fbDb.collection('posts').add(doc);
    }).then(function () {
      input.value = '';
      input.placeholder = input.getAttribute('data-ph') || input.placeholder;
      resetComposeExtras();
      syncPostBtn();
      if (parentId) {
        fbDb.collection('posts').doc(parentId).update({
          replyCount: firebase.firestore.FieldValue.increment(1)
        }).catch(function (e) {
          composeErr((e && e.message) ? ('Posted, but reply count did not update: ' + e.message) : 'Posted, but reply count did not update.');
        });
      }
    }).catch(function (e) {
      composeErr((e && e.message) ? e.message : 'Could not post.');
      console.warn('post', e);
      syncPostBtn();
    });
  }

  function deleteOwnPost(id) {
    var post = findPost(id);
    if (!post) return;
    var uid = liveUid();
    if (!uid || post.authorUid !== uid) {
      composeErr('You can only delete your own posts.');
      return;
    }
    if (!fbDb) { composeErr('Feed is not connected.'); return; }
    composeErr('');
    var chain = Promise.resolve();
    if (post.imageUrl && fbStorage) {
      chain = fbStorage.refFromURL(post.imageUrl).delete().catch(function (e) {
        console.warn('storage delete', e);
      });
    }
    chain.then(function () {
      return fbDb.collection('posts').doc(id).delete();
    }).catch(function (e) {
      composeErr((e && e.message) ? e.message : 'Could not delete post.');
    });
  }

  function votePoll(postId, idx) {
    var uid = liveUid();
    if (!requireVerified('vote')) return;
    if (!uid) {
      composeErr('Sign in with email to vote. Guest cannot vote.');
      openAuth('login');
      return;
    }
    if (!fbDb || !postId) return;
    var patch = {};
    patch['poll.votes.' + uid] = idx;
    fbDb.collection('posts').doc(postId).update(patch).catch(function (err) {
      composeErr((err && err.message) ? ('Vote: ' + err.message) : 'Could not save vote.');
      console.warn('poll vote', err);
    });
  }

  function toggleLike(postId) {
    var uid = liveUid();
    if (!requireVerified('like')) return;
    if (!uid) {
      composeErr('Sign in with email to like. Guest cannot like.');
      openAuth('login');
      return;
    }
    if (!fbDb || !postId) return;
    var post = findPost(postId);
    var likedBy = (post && post.likedBy) || {};
    var patch = {};
    if (likedBy[uid]) {
      patch['likes.' + uid] = firebase.firestore.FieldValue.delete();
    } else {
      patch['likes.' + uid] = true;
    }
    fbDb.collection('posts').doc(postId).update(patch).catch(function (err) {
      composeErr((err && err.message) ? ('Like: ' + err.message) : 'Could not save like.');
      console.warn('like', err);
    });
  }

  function wireComposeToolbar() {
    var imgBtn = document.getElementById('compose-btn-image');
    var gifBtn = document.getElementById('compose-btn-gif');
    var imgIn = document.getElementById('compose-image-input');
    var gifIn = document.getElementById('compose-gif-input');
    if (imgBtn && imgIn) imgBtn.addEventListener('click', function () { imgIn.click(); });
    if (gifBtn && gifIn) gifBtn.addEventListener('click', function () { gifIn.click(); });
    if (imgIn) imgIn.addEventListener('change', function (e) { if (e.target.files[0]) setImagePreview(e.target.files[0]); });
    if (gifIn) gifIn.addEventListener('change', function (e) { if (e.target.files[0]) setImagePreview(e.target.files[0]); });
    var remove = document.getElementById('compose-image-remove');
    if (remove) remove.addEventListener('click', function () {
      attachedFile = null;
      document.getElementById('compose-image-preview').hidden = true;
      document.getElementById('compose-preview-img').src = '';
      document.getElementById('compose-preview-img').alt = '';
      if (previewObjectUrl) {
        try { URL.revokeObjectURL(previewObjectUrl); } catch (e2) {}
        previewObjectUrl = null;
      }
      if (imgIn) imgIn.value = '';
      if (gifIn) gifIn.value = '';
      syncPostBtn();
    });
    var wrap = document.getElementById('thoughts-compose-wrap');
    if (wrap) {
      wrap.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('drag-over'); });
      wrap.addEventListener('dragleave', function () { wrap.classList.remove('drag-over'); });
      wrap.addEventListener('drop', function (e) {
        e.preventDefault(); wrap.classList.remove('drag-over');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files) return;
        for (var i = 0; i < files.length; i++) {
          if (files[i].type && files[i].type.indexOf('image/') === 0) { setImagePreview(files[i]); break; }
        }
      });
    }
    var pollPanel = document.getElementById('compose-poll');
    var pollBtn = document.getElementById('compose-btn-poll');
    if (pollBtn && pollPanel) {
      pollBtn.addEventListener('click', function () {
        pollActive = !pollActive;
        pollPanel.hidden = !pollActive;
        pollBtn.style.color = pollActive ? 'var(--accent)' : '';
        syncPostBtn();
      });
    }
    var pollAdd = document.getElementById('compose-poll-add');
    if (pollAdd && pollPanel) {
      pollAdd.addEventListener('click', function () {
        var options = pollPanel.querySelectorAll('.compose-poll-option');
        if (options.length >= 4) return;
        var idx = options.length;
        var div = document.createElement('div');
        div.className = 'compose-poll-option';
        div.innerHTML = '<input class="compose-poll-input" placeholder="Choice ' + (idx + 1) + '" maxlength="60" data-poll-opt="' + idx + '"><button type="button" class="compose-poll-remove" title="Remove">×</button>';
        var rm = div.querySelector('.compose-poll-remove');
        if (rm) rm.addEventListener('click', function () { div.remove(); syncPostBtn(); });
        pollPanel.querySelector('.compose-poll-footer').before(div);
        syncPostBtn();
      });
    }
    if (pollPanel) pollPanel.addEventListener('input', syncPostBtn);
    var emojiBtn = document.getElementById('compose-btn-emoji');
    if (emojiBtn) emojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wrap2 = document.getElementById('compose-emoji-wrap');
      if (wrap2) { wrap2.remove(); return; }
      wrap2 = document.createElement('div');
      wrap2.id = 'compose-emoji-wrap';
      wrap2.className = 'compose-emoji-wrap';
      var picker = document.createElement('emoji-picker');
      wrap2.appendChild(picker);
      document.body.appendChild(wrap2);
      var btnRect = e.currentTarget.getBoundingClientRect();
      wrap2.style.top = (btnRect.top - 315) + 'px';
      wrap2.style.left = Math.max(4, btnRect.left - 120) + 'px';
      var composeInput = document.getElementById('thoughts-compose-input');
      picker.addEventListener('emoji-click', function (ev) {
        var em = ev.detail.unicode;
        var pos = composeInput.selectionStart || composeInput.value.length;
        composeInput.value = composeInput.value.slice(0, pos) + em + composeInput.value.slice(pos);
        composeInput.dispatchEvent(new Event('input'));
        composeInput.focus();
        wrap2.remove();
      });
      var close = function (ev) {
        if (!wrap2.contains(ev.target) && ev.target !== e.currentTarget) {
          wrap2.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(function () { document.addEventListener('click', close); }, 20);
    });
  }

  function wireEvents() {
    document.addEventListener('click', function (e) {
      const social = e.target.closest('[data-social]');
      if (social) {
        e.preventDefault();
        go(social.dataset.social);
        return;
      }
      if (e.target.closest('#auth-signin') || e.target.closest('#profile-signin-prompt-btn')) {
        openAuth('login');
        return;
      }
      if (e.target.closest('#auth-signout')) { signOut(); return; }

      const pollOpt = e.target.closest('[data-poll-idx]');
      if (pollOpt) {
        votePoll(pollOpt.dataset.postId, parseInt(pollOpt.dataset.pollIdx, 10));
        return;
      }

      const tab = e.target.closest('[data-thoughts-tab]');
      if (tab) {
        const t = tab.dataset.thoughtsTab;
        if (t === 'following') go('following');
        else if (t === 'hot') go('hot');
        else if (t === 'new') go('new');
        else go('home');
        return;
      }

      const likeBtn = e.target.closest('[data-act="like"]');
      if (likeBtn) {
        const post = likeBtn.closest('[data-post-id]');
        if (!post) return;
        toggleLike(post.dataset.postId);
        return;
      }
      if (e.target.closest('[data-act="delete"]')) {
        const post = e.target.closest('[data-post-id]');
        if (!post) return;
        deleteOwnPost(post.dataset.postId);
        return;
      }
      if (e.target.closest('[data-act="reply"]')) {
        if (!isLiveUser()) { composeErr('Sign in with email to reply. Guest can only browse.'); openAuth('login'); return; }
        const post = e.target.closest('[data-post-id]');
        if (!post) return;
        replyTo = post.dataset.parentId || post.dataset.postId;
        const input = document.getElementById('thoughts-compose-input');
        if (!input.getAttribute('data-ph')) input.setAttribute('data-ph', input.placeholder);
        input.placeholder = 'Reply to this post…';
        input.focus();
        return;
      }
      if (e.target.closest('[data-act="share"]')) {
        const post = e.target.closest('[data-post-id]');
        if (!post) return;
        sharePost(post.dataset.postId);
        return;
      }
      if (e.target.closest('[data-act="report"]')) {
        const post = e.target.closest('[data-post-id]');
        if (!post) return;
        reportPost(post.dataset.postId);
        return;
      }
      if (e.target.closest('[data-act="block"]')) {
        const post = e.target.closest('[data-post-id]');
        if (!post) return;
        const p = findPost(post.dataset.postId);
        if (p && p.authorUid) blockUser(p.authorUid);
        return;
      }

      const etab = e.target.closest('[data-explore-tab]');
      if (etab) {
        document.querySelectorAll('[data-explore-tab]').forEach(function (t) {
          t.classList.toggle('active', t === etab);
        });
        document.getElementById('explore-pane-places').classList.toggle('active', etab.dataset.exploreTab === 'places');
        document.getElementById('explore-pane-topics').classList.toggle('active', etab.dataset.exploreTab === 'topics');
        return;
      }

      if (isMobileNav() && document.body.classList.contains('nav-open')
          && sidebar && !sidebar.contains(e.target) && hamburger && !hamburger.contains(e.target)) {
        closeMobileNav();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      const shareOv = document.getElementById('share-sheet');
      if (shareOv && !shareOv.hidden) { e.preventDefault(); closeShareSheet(); return; }
      const ov = document.getElementById('cv-auth-overlay');
      if (ov && ov.classList.contains('open')) { e.preventDefault(); closeAuth(); return; }
      if (isMobileNav() && document.body.classList.contains('nav-open')) closeMobileNav();
    });

    hamburger.addEventListener('click', function () {
      if (isMobileNav()) document.body.classList.toggle('nav-open');
      else document.body.classList.toggle('nav-collapsed');
      syncHamburgerAria();
    });
    window.addEventListener('resize', syncHamburgerAria);
    document.getElementById('nav-overlay').addEventListener('click', closeMobileNav);
    document.getElementById('right-panel-tab').addEventListener('click', function () {
      document.body.classList.toggle('right-collapsed');
    });
    document.getElementById('sidebar-search-btn').addEventListener('click', function () { go('explore'); });
    document.getElementById('sidebar-post-btn').addEventListener('click', function () {
      go('home');
      setTimeout(function () {
        const input = document.getElementById('thoughts-compose-input');
        if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 120);
    });

    ['profile-back', 'notif-back', 'explore-back'].forEach(function (id) {
      document.getElementById(id).addEventListener('click', function () { go('home'); });
    });
    var markRead = document.getElementById('notif-mark-read');
    if (markRead) markRead.addEventListener('click', function () { /* soon: no live notifs */ });

    var chatNew = document.getElementById('chat-new-btn');
    if (chatNew) chatNew.addEventListener('click', function () { /* soon */ });
    var chatPlaceholderNew = document.getElementById('chat-placeholder-new');
    if (chatPlaceholderNew) chatPlaceholderNew.addEventListener('click', function () { /* soon */ });
    var chatSend = document.getElementById('chat-send-btn');
    if (chatSend) chatSend.addEventListener('click', function () { /* soon: no live DMs */ });

    document.getElementById('profile-edit-btn').addEventListener('click', function () {
      openAuth('register');
    });

    const compose = document.getElementById('thoughts-compose-input');
    const postBtn = document.getElementById('thoughts-post-btn');
    compose.addEventListener('input', function () {
      compose.style.height = 'auto';
      compose.style.height = Math.min(compose.scrollHeight, 200) + 'px';
      syncPostBtn();
    });
    postBtn.addEventListener('click', maybePost);
    wireComposeToolbar();

    document.getElementById('cv-modal-close').addEventListener('click', function (e) {
      e.preventDefault();
      closeAuth();
    });
    document.getElementById('cv-auth-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'cv-auth-overlay') closeAuth();
    });
    document.querySelectorAll('.conv-modal-tab').forEach(function (t) {
      t.addEventListener('click', function () { openAuth(t.dataset.tab); });
    });
    document.getElementById('cv-login-btn').addEventListener('click', function () {
      const err = document.getElementById('cv-login-err');
      const email = (document.getElementById('cv-login-email').value || '').trim();
      const pw = document.getElementById('cv-login-pw').value || '';
      if (!fbAuth) { err.textContent = 'Auth is not ready.'; err.classList.add('show'); return; }
      err.textContent = '';
      fbAuth.signInWithEmailAndPassword(email, pw).catch(function (e) {
        err.textContent = (e && e.message) ? e.message : 'Sign-in failed.';
        err.classList.add('show');
      });
    });
    document.getElementById('cv-reg-btn').addEventListener('click', function () {
      const err = document.getElementById('cv-reg-err');
      const name = (document.getElementById('cv-reg-name').value || '').trim();
      const email = (document.getElementById('cv-reg-email').value || '').trim();
      const pw = document.getElementById('cv-reg-pw').value || '';
      const age = document.getElementById('cv-reg-age');
      if (!fbAuth) { err.textContent = 'Auth is not ready.'; err.classList.add('show'); return; }
      if (!age || !age.checked) {
        err.textContent = 'Confirm you are 13 or older and agree to the preview Terms and Privacy pages.';
        err.classList.add('show');
        return;
      }
      if (!email || pw.length < 6) { err.textContent = 'Email and a password of at least 6 characters.'; err.classList.add('show'); return; }
      err.textContent = '';
      fbAuth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
        const disp = name || email.split('@')[0];
        cred.user.sendEmailVerification().catch(function () {});
        return cred.user.updateProfile({ displayName: disp }).then(function () {
          if (fbDb) {
            return fbDb.collection('users').doc(cred.user.uid).set({
              displayName: disp,
              email: email,
              siteId: SITE_ID,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
        }).then(function () {
          composeErr('Account created. Verify your email before posting.');
        });
      }).catch(function (e) {
        err.textContent = (e && e.message) ? e.message : 'Could not create account.';
        err.classList.add('show');
      });
    });
    document.getElementById('cv-google-login').addEventListener('click', function () {
      var err = document.getElementById('cv-login-err');
      if (!fbAuth) { err.textContent = 'Auth is not ready.'; err.classList.add('show'); return; }
      var age = document.getElementById('cv-google-age');
      if (!age || !age.checked) {
        err.textContent = 'Confirm you are 13 or older and agree to the preview Terms and Privacy pages.';
        err.classList.add('show');
        return;
      }
      err.textContent = '';
      err.classList.remove('show');
      var provider = new firebase.auth.GoogleAuthProvider();
      fbAuth.signInWithPopup(provider).then(function (cred) {
        var u = cred && cred.user;
        if (fbDb && u) {
          var disp = u.displayName || (u.email || 'member').split('@')[0];
          return fbDb.collection('users').doc(u.uid).set({
            displayName: disp,
            email: u.email || '',
            siteId: SITE_ID,
            provider: 'google',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }).catch(function (e) {
        var msg;
        if (e && e.code === 'auth/operation-not-allowed') {
          msg = 'Google is not enabled on subx-skins yet.';
        } else if (e && e.code === 'auth/popup-closed-by-user') {
          msg = 'Google sign-in cancelled.';
        } else {
          msg = (e && e.message) ? e.message : 'Google sign-in failed.';
        }
        err.textContent = msg;
        err.classList.add('show');
      });
    });
    document.getElementById('cv-guest-login').addEventListener('click', function () { stubSignIn('Guest', 'guestgp'); });

    const search = document.getElementById('explore-search-input');
    search.addEventListener('input', function () {
      const q = search.value.trim().toLowerCase();
      function filt(list) {
        if (!q) return list;
        return list.filter(function (c) {
          return (c.title + ' ' + c.snippet + ' ' + c.tag).toLowerCase().indexOf(q) !== -1;
        });
      }
      function cards(list) {
        if (!list.length) return '<p class="empty-note">Nothing on the grid matched that.</p>';
        return list.map(function (c) {
          return '<article class="explore-card"><div class="explore-card-tag">' + escapeHtml(c.tag) +
            '</div><div class="explore-card-title">' + escapeHtml(c.title) +
            '</div><div class="explore-card-snippet">' + escapeHtml(c.snippet) + '</div></article>';
        }).join('');
      }
      document.getElementById('explore-pane-places').innerHTML = cards(filt(PLACES));
      document.getElementById('explore-pane-topics').innerHTML = cards(filt(TOPICS));
    });
  }

  function boot(data) {
    site = data || {};
    SITE_ID = 'gpchat';
    TRENDS = site.trends || [];
    PLACES = site.places || [];
    TOPICS = site.topics || [];
    applyTheme(site.theme);
    applySiteChrome();
    hideDummyChrome();

    if (fbAuth) {
      fbAuth.onAuthStateChanged(function (user) {
        if (user) applyFbUser(user);
        else {
          listenBlocks(null);
          if (currentUser && currentUser.live) {
            currentUser = null;
            saveJSON(LS_USER, null);
            renderSidebarAuth();
            hideDummyChrome();
            syncProfile();
            renderFeed();
          }
        }
      });
    }

    listenKillSwitch();
    wireEvents();
    renderTrends();
    renderExplore();
    renderNotifs();
    renderThreads();
    renderSidebarAuth();
    listenLivePosts();
    renderFeed();

    window.addEventListener('hashchange', applyRoute);
    try { deepPostId = new URLSearchParams(location.search).get('p') || ''; } catch (e) { deepPostId = ''; }
    if (!location.hash || location.hash === '#') {
      history.replaceState(null, '', location.pathname + location.search + '#home');
    }
    applyRoute();
    if (deepPostId) {
      closeSocialOverlays();
      showContentPage('thoughts');
      highlightSocial('home');
      selectThoughtsTab('foryou');
    }
    syncHamburgerAria();
  }

  fetch(SITE_JSON_URL)
    .then(function (res) {
      if (!res.ok) throw new Error('Could not load ' + SITE_JSON_URL);
      return res.json();
    })
    .then(boot)
    .catch(function (e) {
      console.warn('site.json', e);
      composeErr((e && e.message) ? e.message : 'Could not load site.json');
      boot({ siteId: "gpchat", name: "gpchat", tagline: "Nothing but Grand Prix." });
    });
})();
