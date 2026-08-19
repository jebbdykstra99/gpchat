(function () {
  'use strict';

  const MOBILE_NAV_MQ = 900;
  const LS_USER = 'gpchat.user';
  const LS_LIKES = 'gpchat.likes';
  const LS_POSTS = 'gpchat.localPosts';

  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');

  const COLORS = ['#e10600', '#b10500', '#0a0a0c', '#d4af37', '#3a3a42', '#6b1a16'];

  const TRENDS = [
    { tag: 'Quali', headline: 'Q3 is a yellow-flag lottery tonight', snippet: 'Pole is whoever does not lift for the marshal. Dummy quali chatter — not a timing feed.', meta: 'Race weekend' },
    { tag: 'Safety car', headline: 'SC boards out, field bunches', snippet: 'VSC to full SC. Overcut people are grinning. Dummy race-control energy only.', meta: 'SC / VSC' },
    { tag: 'Team radio', headline: 'BOX BOX vs stay out', snippet: 'Plan B. Confirm plan B. What is plan B. Pit wall is a group chat with telemetry.', meta: 'Radio energy' },
    { tag: 'DNF', headline: 'Power unit smoke, retirement talk', snippet: 'Championship points leaking onto the grass. Dummy DNF log, no live results.', meta: 'Retirement' },
    { tag: 'Championship', headline: 'Constructors is a street fight', snippet: 'Gold trophy talk in the garage. Dummy points math. Not official F1.', meta: 'Points fight', gold: true },
    { tag: 'Pit lane', headline: 'Double stack mixup at the box', snippet: 'Second car waited like it was a drive-through. Same compound. Same mistake.', meta: 'Pit-lane mixup' },
    { tag: 'Undercut', headline: 'Undercut window is three cars wide', snippet: 'Nobody is taking it. Overcut paid last dummy stint. Tire offset math on the couch.', meta: 'Strategy' },
    { tag: '2026', headline: 'Dummy 2026 grid talk in the paddock', snippet: 'New regs, new faces, no real entry list here. Phase 2 is an API. Tonight is vibes.', meta: 'Regs chatter' }
  ];

  const PLACES = [
    { tag: 'Circuit', title: 'Monaco', snippet: 'Quali is the race. Barriers, yacht energy, and a formation lap that feels like a parade.' },
    { tag: 'Circuit', title: 'Spa-Francorchamps', snippet: 'Eau Rouge in the blood. Weather that changes twice a sector. Safety cars love it here.' },
    { tag: 'Circuit', title: 'Silverstone', snippet: 'Copse, Maggotts, Becketts. Crowd roar. Dummy British GP weekend chatter.' },
    { tag: 'Circuit', title: 'Monza', snippet: 'Temple of speed. DRS detect on the main straight. Slipstream is a religion.' },
    { tag: 'Circuit', title: 'Suzuka', snippet: 'Figure-eight. 130R. Quali laps that look illegal. Dummy Japanese GP energy.' },
    { tag: 'Circuit', title: 'Interlagos', snippet: 'Interlagos weather, championship points, and a last-lap DRS that bottles into the hairpin.' },
    { tag: 'Circuit', title: 'Marina Bay', snippet: 'Night race. Walls. Safety car magnet. Paddock/night-race canvas energy.' },
    { tag: 'Circuit', title: 'Circuit of the Americas', snippet: 'T1 climb, T12 overtake, dummy COTA weekend. Formation lap up the hill.' }
  ];

  const TOPICS = [
    { tag: 'Quali', title: 'Qualifying drama', snippet: 'Q1 traffic, Q3 yellows, pole that the paint did not agree with.' },
    { tag: 'SC', title: 'Safety car & VSC', snippet: 'Boards out. Delta is a suggestion. Field bunches. Dummy race control.' },
    { tag: 'Box', title: 'Pit-lane mixups', snippet: 'Double stack, wrong compound, traffic light that lied.' },
    { tag: 'Radio', title: 'Team radio', snippet: 'Box this lap. Stay out. Plan B. We are checking.' },
    { tag: 'Points', title: 'Championship fight', snippet: 'Dummy points math. Gold trophy talk. Not live standings.' },
    { tag: '2026', title: '2026 grid talk', snippet: 'New regs chatter. No real entry list. Phase 2 is an API.' },
    { tag: 'DRS', title: 'DRS & overtakes', snippet: 'Zone is a rumor. Detect on, still stuck. ERS empty before the line.' },
    { tag: 'Formation', title: 'Formation lap', snippet: 'Tire temps, a stall on the grid, P1 lights that take forever.' }
  ];

  const SEED = [
    { id: 'p1', name: 'Grid Watch', handle: 'gridwatch', text: 'Formation lap is a crawl and someone already locked up into T1 in my head. Dummy weekend. No live timing. Lights out when the paddock says so.', hours: 1, likes: 318, replies: 52, followed: true, snippet: { handle: 'formationlap', text: 'Tire blankets off too early. I called the stall from the couch.' } },
    { id: 'p2', name: 'DRS Detect', handle: 'drsdetect', text: 'DRS detect on the main straight and half the field still cannot pass. This zone is a rumor. Dummy overtakes only.', hours: 2, likes: 241, replies: 38, followed: true },
    { id: 'p3', name: 'Box Box Box', handle: 'boxboxbox', text: 'BOX BOX BOX and they sent him out on the same compound. Pit-lane mixup of the dummy year. The second car in the double stack waited like it was a drive-through.', hours: 3, likes: 412, replies: 67, followed: true, snippet: { handle: 'pitwallradio', text: 'Plan B was the same compound. We are checking.' } },
    { id: 'p4', name: 'VSC Watch', handle: 'vscwatch', text: 'VSC, then SC, then VSC again. Race control is playing scales. Dummy chatter, not a timing feed. The delta is a suggestion.', hours: 4, likes: 276, replies: 41, followed: false },
    { id: 'p5', name: 'Undercut Now', handle: 'undercutnow', text: 'Undercut window is open for three cars and nobody is taking it. I am screaming at the TV like I have a radio. Dummy strategy only.', hours: 5, likes: 189, replies: 27, followed: true },
    { id: 'p6', name: 'Formation Lap', handle: 'formationlap', text: 'Formation lap tire temps look nervous. If P1 lights go out and someone stalls, I called it from the couch. Dummy grid. No live lights.', hours: 6, likes: 154, replies: 22, followed: true, snippet: { handle: 'gridwatch', text: 'Saw the lockup in my soul before T1.' } },
    { id: 'p7', name: 'Pit Wall Radio', handle: 'pitwallradio', text: 'Team radio: "Plan B." "Confirm plan B." "What is plan B." Classic. Dummy radio energy. Not official F1.', hours: 7, likes: 203, replies: 44, followed: true },
    { id: 'p8', name: 'SC Boards', handle: 'scboards', text: 'Safety car boards. Field bunches. Overcut people are grinning. Dummy weekend only — no live SC status here.', hours: 8, likes: 167, replies: 19, followed: false },
    { id: 'p9', name: 'Quali Drama', handle: 'qualidrama', text: 'Q3 is a yellow-flag lottery. Pole is whoever does not lift for the marshal. Track limits? The paint is a suggestion. Dummy quali. Not a result.', hours: 9, likes: 388, replies: 61, followed: true, snippet: { handle: 'polewatch', text: 'That lap looked illegal. I loved it.' } },
    { id: 'p10', name: 'DNF Log', handle: 'dnflog', text: 'DNF. Hydraulics. That is the championship fight leaking onto the grass. Dummy retirement — we do not have a live classification.', hours: 11, likes: 131, replies: 18, followed: true },
    { id: 'p11', name: 'Champ Points', handle: 'champpoints', text: 'Constructor points are a street fight. Gold trophy talk. Dummy 2026 grid chat starts in the next garage. Not standings. Not official F1.', hours: 13, likes: 298, replies: 49, followed: true },
    { id: 'p12', name: 'Overcut King', handle: 'overcutking', text: 'Overcut paid. They stayed out one more lap, the undercut car came out in traffic. Textbook, still dummy. Tire offset math on the couch.', hours: 15, likes: 220, replies: 34, followed: false, snippet: { handle: 'undercutnow', text: 'I told you the window was open. Nobody boxed.' } },
    { id: 'p13', name: 'Apex Hunter', handle: 'apexhunter', text: 'Spa energy even when we are not at Spa. Eau Rouge in my blood, kerbs in my timeline. Dummy circuit chatter. Night-race canvas.', hours: 16, likes: 97, replies: 11, followed: true },
    { id: 'p14', name: 'Kerb Skip', handle: 'kerbskip', text: 'They cut the chicane, kept the place, and the stewards are "noting it." Noted. Dummy steward energy. Not a bulletin.', hours: 18, likes: 176, replies: 29, followed: false },
    { id: 'p15', name: 'Tire Whisper', handle: 'tirewhisper', text: 'Softs are gone after six laps. Mediums are a myth. Hards are a lifestyle. Dummy deg. No live tire data tonight.', hours: 20, likes: 109, replies: 21, followed: true },
    { id: 'p16', name: 'Grid Ghost', handle: 'gridghost', text: 'Dummy 2026 grid talk: new regs, new faces, nobody here has a real entry list. Phase 2 is an API. Tonight is vibes. Not official F1.', hours: 22, likes: 84, replies: 14, followed: false },
    { id: 'p17', name: 'Red Flag Wait', handle: 'redflagwait', text: 'Red flag. Everyone walking back to the garage like it is a fire drill. Quali restart in "a few minutes" which means never. Dummy session.', hours: 24, likes: 198, replies: 33, followed: true },
    { id: 'p18', name: 'Pole Watch', handle: 'polewatch', text: 'Pole lap looked illegal. Track limits? The paint is a suggestion. Dummy quali. We are not posting a grid.', hours: 26, likes: 147, replies: 24, followed: true, snippet: { handle: 'qualidrama', text: 'Yellow in sector 3. Pole is a lottery ticket.' } },
    { id: 'p19', name: 'Last Lap', handle: 'lastlap', text: 'Last lap, DRS open, they bottled it into the hairpin. Championship points left on the table. Dummy finish. No live results.', hours: 28, likes: 255, replies: 40, followed: false },
    { id: 'p20', name: 'Paddock Noise', handle: 'paddocknoise', text: 'Paddock rumor mill: engine freeze, 2026 chassis, a driver who "might" be on the dummy grid. Not news. Not official F1. Dress rehearsal.', hours: 30, likes: 73, replies: 9, followed: true },
    { id: 'p21', name: 'ERS Deploy', handle: 'ersdeploy', text: 'ERS empty before the DRS zone. That is not a strategy that is a prayer. Dummy hybrid chatter. No live energy numbers.', hours: 32, likes: 118, replies: 16, followed: true },
    { id: 'p22', name: 'Wet Line', handle: 'wetline', text: 'Intermediate call with three corners of wet. They boxed. Safety car would have been cheaper. Dummy weather. Dummy call.', hours: 36, likes: 162, replies: 23, followed: false, snippet: { handle: 'scboards', text: 'SC would have bunched them. Inters were a vibe.' } },
    { id: 'p23', name: 'Box Wait', handle: 'boxboxwait', text: 'Double stack in the pit lane, the second car waited like it was a drive-through. Mixup. Dummy pit-lane only — no live garage feed.', hours: 38, likes: 91, replies: 12, followed: true },
    { id: 'p24', name: 'SC Detect', handle: 'scdetect', text: 'Virtual safety car to full SC. The delta is a suggestion. I am not a timing app. Dummy race control. Nothing but Grand Prix.', hours: 40, likes: 140, replies: 20, followed: false }
  ];

  const NOTIFS = [
    { id: 'n1', text: '@boxboxbox liked your take on the double stack mixup.', time: '1h', unread: true },
    { id: 'n2', text: '@drsdetect mentioned you in a DRS detect.', time: '3h', unread: true },
    { id: 'n3', text: '@champpoints started following you. Dummy follow.', time: 'Yesterday', unread: true }
  ];

  const THREADS = [
    { id: 't1', name: 'Box Box Box', handle: 'boxboxbox', preview: 'Did they really send him out on the same compound?', messages: [
      { me: false, text: 'Did they really send him out on the same compound?' },
      { me: true, text: 'Same compound. Double stack. Dummy pit-lane. See you at the next box.' }
    ]},
    { id: 't2', name: 'DRS Detect', handle: 'drsdetect', preview: 'Zone is a rumor tonight.', messages: [
      { me: false, text: 'Zone is a rumor tonight.' },
      { me: true, text: 'Detect on, still stuck. ERS empty before the line.' }
    ]}
  ];

  function initials(name) {
    return name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function colorFor(handle) {
    let n = 0;
    for (let i = 0; i < handle.length; i++) n = (n + handle.charCodeAt(i) * (i + 1)) % COLORS.length;
    return COLORS[n];
  }
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
  let extraPosts = loadJSON(LS_POSTS, []);
  let currentTab = 'foryou';
  let activeThread = null;

  function allPosts() {
    return extraPosts.concat(SEED);
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

  function renderPost(post) {
    const liked = !!likes[post.id];
    const likeCount = post.likes + (liked ? 1 : 0);
    const av = initials(post.name);
    const bg = colorFor(post.handle);
    return (
      '<article class="post" data-post-id="' + post.id + '">' +
        '<div class="post-avatar" style="background:' + bg + '">' + av + '</div>' +
        '<div class="post-body">' +
          '<div class="post-meta">' +
            '<span class="post-name">' + escapeHtml(post.name) + '</span>' +
            '<span class="post-handle">@' + escapeHtml(post.handle) + '</span>' +
            '<span class="post-time">· ' + (post.hours != null ? post.hours + 'h' : 'now') + '</span>' +
          '</div>' +
          '<p class="post-text">' + escapeHtml(post.text) + '</p>' +
          (post.snippet
            ? '<div class="post-snippet"><span class="post-snippet-handle">@' + escapeHtml(post.snippet.handle) + '</span>' + escapeHtml(post.snippet.text) + '</div>'
            : '') +
          '<div class="post-actions">' +
            '<button class="post-action" data-act="reply" type="button">Reply · ' + (post.replies || 0) + '</button>' +
            '<button class="post-action' + (liked ? ' liked' : '') + '" data-act="like" type="button">Like · ' + likeCount + '</button>' +
            '<button class="post-action" data-act="share" type="button">Share</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function sliceFeed(posts, tab) {
    var list = posts.slice();
    if (tab === 'following') {
      return list.filter(function (p) {
        return p.followed || (currentUser && p.handle === currentUser.handle);
      });
    }
    if (tab === 'hot') {
      return list.sort(function (a, b) {
        return (b.likes + (likes[b.id] ? 1 : 0)) - (a.likes + (likes[a.id] ? 1 : 0));
      });
    }
    if (tab === 'new') {
      return list.sort(function (a, b) { return (a.hours || 0) - (b.hours || 0); });
    }
    // For You: conversation-weighted mix (replies + recency), not pure likes or clock order
    return list.sort(function (a, b) {
      var sa = (a.replies || 0) * 4 - (a.hours || 0);
      var sb = (b.replies || 0) * 4 - (b.hours || 0);
      return sb - sa;
    });
  }

  function renderFeed() {
    const el = document.getElementById('thoughts-feed');
    if (!el) return;
    var posts = sliceFeed(allPosts(), currentTab);
    if (!posts.length) {
      el.innerHTML = '<div class="post-empty">No posts in this ranking yet. Following / Hot / New are different slices of the same Grand Prix feed — dress rehearsal only.</div>';
      return;
    }
    el.innerHTML = posts.map(renderPost).join('');
  }

  function renderTrends() {
    const card = function (t) {
      return '<a class="news-item" href="#explore">' +
        '<div class="news-item-tag' + (t.gold ? ' gold' : '') + '">' + escapeHtml(t.tag) + '</div>' +
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
        return '<article class="explore-card">' +
          '<div class="explore-card-tag">' + escapeHtml(c.tag) + '</div>' +
          '<div class="explore-card-title">' + escapeHtml(c.title) + '</div>' +
          '<div class="explore-card-snippet">' + escapeHtml(c.snippet) + '</div>' +
        '</article>';
      }).join('');
    }
    document.getElementById('explore-pane-places').innerHTML = cards(PLACES);
    document.getElementById('explore-pane-topics').innerHTML = cards(TOPICS);
  }

  function renderNotifs() {
    const el = document.getElementById('notif-list');
    if (!el) return;
    el.innerHTML = NOTIFS.map(function (n) {
      return '<div class="notif-item' + (n.unread ? ' unread' : '') + '" data-nid="' + n.id + '">' +
        '<div><p>' + escapeHtml(n.text) + '</p><time>' + n.time + '</time></div></div>';
    }).join('');
    const unread = NOTIFS.filter(function (n) { return n.unread; }).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = String(unread);
      badge.classList.toggle('visible', unread > 0);
    }
  }

  function renderThreads() {
    const el = document.getElementById('chat-thread-list');
    if (!el) return;
    el.innerHTML = THREADS.map(function (t) {
      return '<div class="chat-thread-item" data-tid="' + t.id + '">' +
        '<div class="post-avatar" style="background:' + colorFor(t.handle) + '">' + initials(t.name) + '</div>' +
        '<div><div class="thread-name">' + escapeHtml(t.name) + '</div>' +
        '<div class="thread-preview">' + escapeHtml(t.preview) + '</div></div></div>';
    }).join('');
  }

  function openThread(id) {
    const t = THREADS.find(function (x) { return x.id === id; });
    if (!t) return;
    activeThread = t;
    document.getElementById('chat-placeholder').hidden = true;
    const view = document.getElementById('chat-thread-view');
    view.hidden = false;
    document.getElementById('chat-active-name').textContent = t.name;
    document.getElementById('chat-messages').innerHTML = t.messages.map(function (m) {
      return '<div class="chat-bubble ' + (m.me ? 'me' : 'them') + '">' + escapeHtml(m.text) + '</div>';
    }).join('');
    document.getElementById('chat-overlay').classList.add('thread-open');
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
    if (!currentUser) {
      prompt.hidden = false;
      content.hidden = true;
      document.getElementById('profile-topbar-name').textContent = 'Profile';
      return;
    }
    prompt.hidden = true;
    content.hidden = false;
    document.getElementById('profile-topbar-name').textContent = currentUser.name;
    document.getElementById('profile-display-name').textContent = currentUser.name;
    document.getElementById('profile-handle').textContent = '@' + currentUser.handle;
    document.getElementById('profile-avatar').textContent = initials(currentUser.name);
    document.getElementById('profile-bio').textContent = currentUser.bio || 'Nothing but Grand Prix.';
    const mine = allPosts().filter(function (p) { return p.handle === currentUser.handle; });
    const pane = document.getElementById('profile-pane-posts');
    if (!mine.length) {
      pane.innerHTML = '<div class="empty-note" id="profile-posts-empty">No posts yet. Hit Post when the safety car comes out.</div>';
    } else {
      pane.innerHTML = mine.map(renderPost).join('');
    }
  }

  function renderSidebarAuth() {
    const el = document.getElementById('sidebar-auth');
    const av = document.getElementById('thoughts-compose-avatar');
    if (currentUser) {
      el.innerHTML =
        '<div class="sidebar-auth-user">' +
          '<div class="sidebar-auth-avatar">' + initials(currentUser.name) + '</div>' +
          '<div class="sidebar-auth-name">@' + escapeHtml(currentUser.handle) + '</div>' +
        '</div>' +
        '<button class="sidebar-auth-btn" id="auth-signout" type="button">Sign out</button>';
      av.textContent = initials(currentUser.name);
      av.style.background = colorFor(currentUser.handle);
    } else {
      el.innerHTML = '<button class="sidebar-auth-btn primary" id="auth-signin" type="button">Sign in</button>';
      av.textContent = 'GP';
      av.style.background = '';
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
      bio: 'Nothing but Grand Prix.'
    };
    saveJSON(LS_USER, currentUser);
    closeAuth();
    renderSidebarAuth();
    syncProfile();
  }
  function signOut() {
    currentUser = null;
    saveJSON(LS_USER, null);
    renderSidebarAuth();
    syncProfile();
  }

  function maybePost() {
    const input = document.getElementById('thoughts-compose-input');
    const text = (input.value || '').trim();
    if (!text) return;
    if (!currentUser) { openAuth('login'); return; }
    extraPosts.unshift({
      id: 'local-' + Date.now(),
      name: currentUser.name,
      handle: currentUser.handle,
      text: text.slice(0, 280),
      hours: 0,
      likes: 0,
      replies: 0,
      followed: true
    });
    saveJSON(LS_POSTS, extraPosts);
    input.value = '';
    document.getElementById('thoughts-post-btn').disabled = true;
    renderFeed();
    syncProfile();
  }

  /* ── Events ─────────────────────────────────────── */
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
      const id = post.dataset.postId;
      likes[id] = !likes[id];
      if (!likes[id]) delete likes[id];
      saveJSON(LS_LIKES, likes);
      renderFeed();
      syncProfile();
      return;
    }
    if (e.target.closest('[data-act="reply"]') || e.target.closest('[data-act="share"]')) {
      if (!currentUser) openAuth('login');
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

    const thread = e.target.closest('[data-tid]');
    if (thread) { openThread(thread.dataset.tid); return; }

    if (isMobileNav() && document.body.classList.contains('nav-open')
        && !sidebar.contains(e.target) && !hamburger.contains(e.target)) {
      closeMobileNav();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
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
  document.getElementById('notif-mark-read').addEventListener('click', function () {
    NOTIFS.forEach(function (n) { n.unread = false; });
    renderNotifs();
  });
  document.getElementById('chat-new-btn').addEventListener('click', function () {
    if (!currentUser) { openAuth('login'); return; }
    openThread('t1');
  });
  document.getElementById('chat-placeholder-new').addEventListener('click', function () {
    if (!currentUser) { openAuth('login'); return; }
    openThread('t1');
  });
  document.getElementById('chat-send-btn').addEventListener('click', function () {
    if (!currentUser) { openAuth('login'); return; }
    const input = document.getElementById('chat-compose-input');
    const text = (input.value || '').trim();
    if (!text || !activeThread) return;
    activeThread.messages.push({ me: true, text: text });
    input.value = '';
    openThread(activeThread.id);
  });
  document.getElementById('profile-edit-btn').addEventListener('click', function () {
    openAuth('register');
  });

  const compose = document.getElementById('thoughts-compose-input');
  const postBtn = document.getElementById('thoughts-post-btn');
  compose.addEventListener('input', function () {
    postBtn.disabled = !(compose.value || '').trim();
    compose.style.height = 'auto';
    compose.style.height = Math.min(compose.scrollHeight, 200) + 'px';
  });
  postBtn.addEventListener('click', maybePost);

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
  function stubSubmit(errId) {
    const err = document.getElementById(errId);
    err.textContent = 'Dress rehearsal — no live auth. Continuing as guest.';
    err.classList.add('show');
    setTimeout(function () { stubSignIn('Guest', 'guestgp'); }, 500);
  }
  document.getElementById('cv-login-btn').addEventListener('click', function () { stubSubmit('cv-login-err'); });
  document.getElementById('cv-reg-btn').addEventListener('click', function () {
    const name = (document.getElementById('cv-reg-name').value || '').trim() || 'Guest';
    const err = document.getElementById('cv-reg-err');
    err.textContent = 'Dress rehearsal — no live auth. Local guest only.';
    err.classList.add('show');
    setTimeout(function () { stubSignIn(name, name.replace(/\s+/g, '').slice(0, 12)); }, 500);
  });
  document.getElementById('cv-google-login').addEventListener('click', function () { stubSignIn('Guest', 'guestgp'); });

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

  renderTrends();
  renderExplore();
  renderNotifs();
  renderThreads();
  renderSidebarAuth();
  renderFeed();

  window.addEventListener('hashchange', applyRoute);
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#home');
  applyRoute();
  syncHamburgerAria();
})();
