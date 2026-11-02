import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  authorReason,
  classify,
  decodeValue,
  extractJsonLd,
  mergeSitemap,
  pagesEnabled,
  postLevelReason,
  readWebConfig,
  renderPostPage,
  reportReason,
  run,
  validatePage,
} from './build_post_pages.mjs';

const ORIGIN = 'https://gpchat.com';
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://gpchat.com/</loc></url>
  <url><loc>https://gpchat.com/us-grand-prix</loc><lastmod>2026-10-19</lastmod></url>
  <url><loc>https://gpchat.com/terms.html</loc></url>
  <url><loc>https://gpchat.com/privacy.html</loc></url>
  <url><loc>https://gpchat.com/guidelines.html</loc></url>
</urlset>
`;

function post(partial) {
  return {
    id: 'abc12345',
    siteId: 'gpchat',
    authorUid: 'user1',
    authorHandle: 'safetydesk',
    authorName: 'Safety Desk',
    text: 'Lights out and away we go.',
    createdAt: '2026-10-19T18:14:52.892Z',
    ...partial,
  };
}

function tempSite(postPages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpchat-pages-'));
  fs.writeFileSync(path.join(root, 'site.json'), JSON.stringify({
    siteId: 'gpchat',
    name: 'gpchat',
    postPages,
    accountsOpen: true,
  }));
  fs.writeFileSync(path.join(root, 'CNAME'), 'gpchat.com\n');
  fs.writeFileSync(path.join(root, 'sitemap.xml'), SITEMAP);
  fs.writeFileSync(path.join(root, '7f8d29189008d288ab04b85925adbc78.txt'), '7f8d29189008d288ab04b85925adbc78\n');
  return root;
}

test('web config is read from factory.js and the kill switch defaults off', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const src = fs.readFileSync(path.join(root, 'factory.js'), 'utf8');
  const cfg = readWebConfig(src);
  assert.equal(cfg.projectId, 'subx-skins');
  assert.ok(cfg.apiKey);
  const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
  assert.equal(site.postPages, false);
  assert.equal(site.accountsOpen, true);
  assert.equal(pagesEnabled(site), false);
  assert.equal(pagesEnabled({ postPages: true }), true);
  assert.equal(pagesEnabled({}), false);
});

test('firestore values decode without keeping nested private maps opaque', () => {
  const decoded = decodeValue({
    mapValue: {
      fields: {
        text: { stringValue: 'hello' },
        deleted: { booleanValue: false },
        createdAt: { timestampValue: '2026-10-19T18:14:52.892Z' },
        likeCount: { integerValue: '0' },
      },
    },
  });
  assert.equal(decoded.text, 'hello');
  assert.equal(decoded.deleted, false);
  assert.equal(decoded.createdAt, '2026-10-19T18:14:52.892Z');
  assert.equal(decoded.likeCount, 0);
});

test('post-level eligibility excludes deleted, hidden, private, and unsafe handles', () => {
  assert.equal(postLevelReason(post(), 'gpchat'), null);
  assert.equal(postLevelReason(post({ deleted: true }), 'gpchat'), 'deleted');
  assert.equal(postLevelReason(post({ hidden: true }), 'gpchat'), 'hidden');
  assert.equal(postLevelReason(post({ removed: true }), 'gpchat'), 'removed');
  assert.equal(postLevelReason(post({ public: false }), 'gpchat'), 'not-public');
  assert.equal(postLevelReason(post({ visibility: 'unlisted' }), 'gpchat'), 'not-public');
  assert.equal(postLevelReason(post({ moderationStatus: 'hidden' }), 'gpchat'), 'moderation');
  assert.equal(postLevelReason(post({ text: '   ' }), 'gpchat'), 'no-text');
  assert.equal(postLevelReason(post({ createdAt: '' }), 'gpchat'), 'missing-time');
  assert.equal(postLevelReason(post({ authorHandle: 'Jebb' }), 'gpchat'), 'unsafe-handle');
  assert.equal(postLevelReason(post({ authorHandle: 'a@b.com' }), 'gpchat'), 'unsafe-handle');
  assert.equal(postLevelReason(post({ authorHandle: 'o774wL9hUVSi19EkDCgLqQomP8i2' }), 'gpchat'), 'unsafe-handle');
  assert.equal(postLevelReason(post({ siteId: '415chat' }), 'gpchat'), 'other-site');
  assert.equal(postLevelReason(post({ id: '../x' }), 'gpchat'), 'unsafe-id');
});

test('author and report flags exclude, and a missing age attestation does not', () => {
  const ok = { suspended: false, ageAttested18: true, under18: false, profileHidden: false, suspendedReason: '' };
  assert.equal(authorReason(ok), null);
  assert.equal(authorReason({ ...ok, ageAttested18: null }), null);
  assert.equal(authorReason({ ...ok, ageAttested18: false }), 'under18');
  assert.equal(authorReason({ ...ok, under18: true }), 'under18');
  assert.equal(authorReason({ ...ok, suspended: true, suspendedReason: 'under18' }), 'under18');
  assert.equal(authorReason({ ...ok, suspended: true, suspendedReason: 'other' }), 'suspended');
  assert.equal(authorReason({ ...ok, profileHidden: true }), 'profile-hidden');
  assert.equal(authorReason(null), 'author-unknown');
  assert.equal(reportReason([]), null);
  assert.equal(reportReason([{ status: 'dismissed' }]), null);
  assert.equal(reportReason([{ status: '' }]), 'report');
  assert.equal(reportReason([{ status: 'dismissed' }, { status: 'hidden' }]), 'report');
  assert.equal(classify(post(), 'gpchat', ok, [{ status: 'dismissed' }]), null);
  assert.equal(classify(post(), 'gpchat', ok, [{ status: '' }]), 'report');
  assert.equal(classify(post({ deleted: true }), 'gpchat', ok, []), 'deleted');
  assert.equal(classify(post({ authorUid: '' }), 'gpchat', ok, []), 'author-unknown');
});

test('page HTML escapes text, omits private fields, and validates DiscussionForumPosting', () => {
  const text = 'A <b> & "quote" {{liquid}} {% endraw %}';
  const html = renderPostPage({
    origin: ORIGIN,
    siteName: 'gpchat',
    id: 'abc12345',
    handle: 'safetydesk',
    text,
    publishedIso: '2026-10-19T18:14:52.892Z',
    editedIso: '',
    profileUrl: null,
  });
  assert.equal(html.includes('{{'), false);
  assert.equal(html.includes('{%'), false);
  assert.equal(html.includes('<b>'), false);
  assert.equal(html.includes('authorUid'), false);
  assert.equal(html.includes('secret@example.com'), false);
  const checked = validatePage(html, {
    canonical: 'https://gpchat.com/p/abc12345/',
    publishedIso: '2026-10-19T18:14:52.892Z',
    id: 'abc12345',
    text,
    handle: 'safetydesk',
    profileUrl: null,
    origin: ORIGIN,
    siteName: 'gpchat',
    authorUid: 'o774wL9hUVSi19EkDCgLqQomP8i2',
    authorName: 'Safety Desk',
  });
  assert.deepEqual(checked.problems, []);
  const ld = extractJsonLd(html);
  assert.equal(ld.text, text);
  assert.equal(ld.author.name, '@safetydesk');
  assert.equal(Object.prototype.hasOwnProperty.call(ld.author, 'url'), false);
  assert.equal(ld.isPartOf.url, 'https://gpchat.com/');
  assert.equal(ld['@type'], 'DiscussionForumPosting');
  assert.match(html, /<time datetime="2026-10-19T18:14:52.892Z">19 Oct 2026, 18:14 UTC<\/time>/);
  assert.match(html, /View in the room/);
  for (const label of ['Terms', 'Privacy', 'Guidelines', 'Report']) assert.match(html, new RegExp(label));
});

test('sitemap keeps existing URLs, adds post URLs, and drops posts that leave', () => {
  const withPosts = mergeSitemap(SITEMAP, ORIGIN, [
    { id: 'abc12345', lastmod: '2026-10-19' },
    { id: 'zzz99999', lastmod: '2026-10-20' },
  ]);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/<\/loc>/);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/us-grand-prix<\/loc><lastmod>2026-10-19<\/lastmod>/);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/terms.html<\/loc>/);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/privacy.html<\/loc>/);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/guidelines.html<\/loc>/);
  assert.match(withPosts, /<loc>https:\/\/gpchat.com\/p\/abc12345\/<\/loc><lastmod>2026-10-19<\/lastmod>/);
  const removed = mergeSitemap(withPosts, ORIGIN, [{ id: 'zzz99999', lastmod: '2026-10-20' }]);
  assert.equal(removed.includes('/p/abc12345/'), false);
  assert.match(removed, /<loc>https:\/\/gpchat.com\/p\/zzz99999\/<\/loc>/);
  assert.match(removed, /<loc>https:\/\/gpchat.com\/<\/loc>/);
});

test('kill switch writes nothing and does not read Firestore', async () => {
  const root = tempSite(false);
  fs.mkdirSync(path.join(root, 'p', 'stalePost'), { recursive: true });
  fs.writeFileSync(path.join(root, 'p', 'stalePost', 'index.html'), '<p>stale</p>');
  let called = false;
  const result = await run({
    root,
    dryRun: false,
    indexnowPath: path.join(root, 'indexnow.json'),
    loadCorpus: async () => { called = true; return { posts: [], authFailures: [] }; },
  });
  assert.equal(called, false);
  assert.equal(result.code, 0);
  assert.equal(result.summary.action, 'skipped');
  assert.equal(fs.readFileSync(path.join(root, 'p', 'stalePost', 'index.html'), 'utf8'), '<p>stale</p>');
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), SITEMAP);
  const ping = JSON.parse(fs.readFileSync(path.join(root, 'indexnow.json'), 'utf8'));
  assert.equal(ping.ping, false);
});

test('auth failure publishes nothing and removes nothing', async () => {
  const root = tempSite(true);
  fs.mkdirSync(path.join(root, 'p', 'stalePost'), { recursive: true });
  fs.writeFileSync(path.join(root, 'p', 'stalePost', 'index.html'), '<p>stale</p>');
  const result = await run({
    root,
    dryRun: false,
    indexnowPath: path.join(root, 'indexnow.json'),
    loadCorpus: async () => ({
      posts: [post({ email: 'secret@example.com', dob: '2000-01-01', location: 'Austin', ip: '203.0.113.5' })],
      usersByUid: null,
      reportsByPostId: null,
      authFailures: [
        { collection: 'users/{authorUid}', fields: ['suspended', 'suspendedReason', 'ageAttested18', 'under18', 'profileHidden'], status: 403, detail: 'denied' },
        { collection: 'reports', fields: ['siteId', 'postId', 'status'], status: 403, detail: 'denied' },
      ],
    }),
  });
  assert.equal(result.code, 2);
  assert.equal(result.summary.wouldWrite, 0);
  assert.equal(result.summary.eligible, null);
  assert.equal(result.summary.postLevelKept, 1);
  assert.equal(fs.existsSync(path.join(root, 'p', 'abc12345', 'index.html')), false);
  assert.equal(fs.readFileSync(path.join(root, 'p', 'stalePost', 'index.html'), 'utf8'), '<p>stale</p>');
  assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), SITEMAP);
  assert.equal(result.sampleHtml.includes('secret@example.com'), false);
  assert.equal(result.sampleHtml.includes('2000-01-01'), false);
  assert.equal(result.sampleHtml.includes('203.0.113.5'), false);
  assert.equal(result.sampleHtml.includes('user1'), false);
  const ping = JSON.parse(fs.readFileSync(path.join(root, 'indexnow.json'), 'utf8'));
  assert.equal(ping.ping, false);
});

test('a cleared run writes the page, drops an ineligible page, and lists IndexNow URLs', async () => {
  const root = tempSite(true);
  fs.mkdirSync(path.join(root, 'p', 'stalePost'), { recursive: true });
  fs.writeFileSync(path.join(root, 'p', 'stalePost', 'index.html'), '<p>old</p>');
  const kept = post();
  const gone = post({ id: 'stalePost', deleted: true, text: 'gone' });
  const minor = post({
    id: 'minorPost',
    authorUid: 'kid',
    authorHandle: 'rookiefan',
    text: 'too young',
  });
  const reported = post({ id: 'reported1', authorUid: 'user2', authorHandle: 'pitwall', text: 'open report' });
  const dismissed = post({ id: 'cleared01', authorUid: 'user3', authorHandle: 'boxbox', text: 'dismissed report' });
  const users = new Map([
    ['user1', { suspended: false, ageAttested18: null, under18: false, profileHidden: false, suspendedReason: '' }],
    ['kid', { suspended: true, ageAttested18: false, under18: false, profileHidden: true, suspendedReason: 'under18' }],
    ['user2', { suspended: false, ageAttested18: true, under18: false, profileHidden: false, suspendedReason: '' }],
    ['user3', { suspended: false, ageAttested18: true, under18: false, profileHidden: false, suspendedReason: '' }],
  ]);
  const reports = new Map([
    ['reported1', [{ status: '' }]],
    ['cleared01', [{ status: 'dismissed' }]],
  ]);
  const result = await run({
    root,
    dryRun: false,
    indexnowPath: path.join(root, 'indexnow.json'),
    loadCorpus: async () => ({ posts: [kept, gone, minor, reported, dismissed], usersByUid: users, reportsByPostId: reports, authFailures: [] }),
  });
  assert.equal(result.code, 0);
  assert.equal(result.summary.eligible, 2);
  assert.equal(result.summary.excluded.deleted, 1);
  assert.equal(result.summary.excluded.under18, 1);
  assert.equal(result.summary.excluded.report, 1);
  assert.equal(fs.existsSync(path.join(root, 'p', 'stalePost')), false);
  assert.equal(fs.existsSync(path.join(root, 'p', 'minorPost')), false);
  assert.equal(fs.existsSync(path.join(root, 'p', 'reported1')), false);
  const html = fs.readFileSync(path.join(root, 'p', 'abc12345', 'index.html'), 'utf8');
  assert.match(html, /Lights out and away we go\./);
  assert.equal(html.includes('Safety Desk'), false);
  assert.equal(html.includes('user1'), false);
  const again = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(again, /<loc>https:\/\/gpchat.com\/<\/loc>/);
  assert.match(again, /<loc>https:\/\/gpchat.com\/p\/abc12345\/<\/loc><lastmod>2026-10-19<\/lastmod>/);
  assert.match(again, /<loc>https:\/\/gpchat.com\/p\/cleared01\/<\/loc>/);
  assert.equal(again.includes('/p/stalePost/'), false);
  assert.equal(again.includes('/p/minorPost/'), false);
  const ping = JSON.parse(fs.readFileSync(path.join(root, 'indexnow.json'), 'utf8'));
  assert.equal(ping.ping, true);
  assert.equal(ping.host, 'gpchat.com');
  assert.ok(ping.urls.includes('https://gpchat.com/p/abc12345/'));
  assert.ok(ping.urls.includes('https://gpchat.com/p/cleared01/'));
  assert.ok(ping.urls.includes('https://gpchat.com/p/stalePost/'));
  assert.equal(ping.urls.includes('https://gpchat.com/p/minorPost/'), false);

  const second = await run({
    root,
    dryRun: false,
    indexnowPath: path.join(root, 'indexnow.json'),
    loadCorpus: async () => ({ posts: [kept, gone, minor, reported, dismissed], usersByUid: users, reportsByPostId: reports, authFailures: [] }),
  });
  assert.equal(second.summary.created, 0);
  assert.equal(second.summary.changed, 0);
  assert.equal(second.summary.removed, 0);
  const quiet = JSON.parse(fs.readFileSync(path.join(root, 'indexnow.json'), 'utf8'));
  assert.equal(quiet.ping, false);
});

test('dry-run evaluates while the switch is off and does not write', async () => {
  const root = tempSite(false);
  const result = await run({
    root,
    dryRun: true,
    loadCorpus: async () => ({
      posts: [post()],
      usersByUid: new Map([['user1', { suspended: false, ageAttested18: true, under18: false, profileHidden: false, suspendedReason: '' }]]),
      reportsByPostId: new Map(),
      authFailures: [],
    }),
  });
  assert.equal(result.code, 0);
  assert.equal(result.summary.action, 'dry-run');
  assert.equal(result.summary.eligible, 1);
  assert.equal(result.summary.wouldWrite, 1);
  assert.equal(fs.existsSync(path.join(root, 'p')), false);
  assert.match(result.summary.note, /postPages is false/);
});
