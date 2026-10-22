#!/usr/bin/env node
/**
 * Build static /p/<postId>/index.html pages for public gpchat posts and
 * refresh sitemap.xml. Reads Firestore with the public web config in
 * factory.js (no service account).
 *
 * site.json "postPages" must be true or a normal run exits without writing.
 * --dry-run never writes. It still evaluates, including when the switch is off.
 *
 * Eligibility fields (factory.js, and the hand-published subx-skins rules):
 *   posts are hard-deleted (deleteOwnPost / adminRemovePost). There is no
 *   deleted/hidden field in the member post key list. Honor deleted, hidden,
 *   or removed if a document ever has them.
 *   users/{uid}.suspended, suspendedReason "under18", ageAttested18 === false,
 *   under18 === true, profileHidden === true. This collection is owner/admin
 *   read only.
 *   reports.status: anything other than "dismissed" hides the post. Open
 *   reports are written with no status. This collection is admin/reporter only.
 * If those reads are not public, this script writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SAFE_ID = /^[A-Za-z0-9]{1,128}$/;
const SAFE_HANDLE = /^[a-z0-9_]{1,15}$/;
const BRACE = '\uE000';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const USER_FIELDS = ['suspended', 'suspendedReason', 'ageAttested18', 'under18', 'profileHidden'];
export const REPORT_FIELDS = ['siteId', 'postId', 'status'];
export const POST_FIELDS = ['siteId', 'deleted', 'hidden', 'removed', 'public', 'visibility', 'moderationStatus', 'authorHandle', 'text', 'createdAt'];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function flagTrue(v) {
  return v === true || v === 'true' || v === 1;
}
function flagFalse(v) {
  return v === false || v === 'false' || v === 0;
}

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(v, 'stringValue')) return v.stringValue;
  if (Object.prototype.hasOwnProperty.call(v, 'booleanValue')) return v.booleanValue;
  if (Object.prototype.hasOwnProperty.call(v, 'integerValue')) return Number(v.integerValue);
  if (Object.prototype.hasOwnProperty.call(v, 'doubleValue')) return Number(v.doubleValue);
  if (Object.prototype.hasOwnProperty.call(v, 'timestampValue')) return v.timestampValue;
  if (Object.prototype.hasOwnProperty.call(v, 'nullValue')) return null;
  if (v.mapValue) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = decodeValue(val);
    return out;
  }
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

export function readWebConfig(factorySource) {
  const apiKey = /apiKey:\s*"([^"]+)"/.exec(factorySource);
  const projectId = /projectId:\s*"([^"]+)"/.exec(factorySource);
  if (!apiKey || !projectId) throw new Error('Could not read the Firebase web config (apiKey, projectId) from factory.js');
  return { apiKey: apiKey[1], projectId: projectId[1] };
}

export function pagesEnabled(site) {
  return !!(site && site.postPages === true);
}

export function safeHandle(h) {
  return typeof h === 'string' && SAFE_HANDLE.test(h);
}

export function parseTime(value) {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function readableUtc(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function postLevelReason(post, siteId) {
  if (!post || typeof post.id !== 'string' || !SAFE_ID.test(post.id)) return 'unsafe-id';
  if (post.siteId !== siteId) return 'other-site';
  if (flagTrue(post.deleted)) return 'deleted';
  if (flagTrue(post.hidden)) return 'hidden';
  if (flagTrue(post.removed)) return 'removed';
  if (flagFalse(post.public)) return 'not-public';
  const vis = typeof post.visibility === 'string' ? post.visibility.trim().toLowerCase() : '';
  if (vis && vis !== 'public' && vis !== 'visible') return 'not-public';
  const mod = typeof post.moderationStatus === 'string' ? post.moderationStatus
    : typeof post.moderation === 'string' ? post.moderation : '';
  if (['hidden', 'removed', 'deleted', 'rejected', 'blocked', 'suspended'].includes(String(mod).trim().toLowerCase())) {
    return 'moderation';
  }
  if (!parseTime(post.createdAt)) return 'missing-time';
  if (typeof post.text !== 'string' || !post.text.trim()) return 'no-text';
  if (!safeHandle(post.authorHandle)) return 'unsafe-handle';
  return null;
}

export function authorReason(user) {
  if (!user) return 'author-unknown';
  if (flagTrue(user.under18) || flagFalse(user.ageAttested18) || user.suspendedReason === 'under18') return 'under18';
  if (flagTrue(user.suspended)) return 'suspended';
  if (flagTrue(user.profileHidden)) return 'profile-hidden';
  return null;
}

export function reportReason(reports) {
  if (!reports || !reports.length) return null;
  for (const report of reports) {
    const status = String((report && report.status) || '').trim().toLowerCase();
    if (status !== 'dismissed') return 'report';
  }
  return null;
}

export function classify(post, siteId, user, reports) {
  return postLevelReason(post, siteId) || authorReason(post && post.authorUid ? user : null) || reportReason(reports) || null;
}

/** No public profile URL exists that does not embed the uid. Omit author.url. */
export function publicProfileUrl() {
  return null;
}

export function makeHeadline(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= 110) return flat;
  const cut = flat.slice(0, 107);
  const sp = cut.lastIndexOf(' ');
  const base = (sp > 40 ? cut.slice(0, sp) : cut).replace(/[.,;:!?]+$/, '');
  return `${base}…`;
}

export function makeDescription(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 157);
  const sp = cut.lastIndexOf(' ');
  const base = (sp > 80 ? cut.slice(0, sp) : cut).replace(/[.,;:!?]+$/, '');
  return `${base}…`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c])).replaceAll('{', '&#123;');
}

function markBraces(value) {
  if (typeof value === 'string') return value.replaceAll('{', BRACE);
  if (Array.isArray(value)) return value.map(markBraces);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = markBraces(v);
    return out;
  }
  return value;
}

export function jsonForHtml(value) {
  return JSON.stringify(markBraces(value)).split(BRACE).join('\\u007b').replaceAll('<', '\\u003c');
}

export function lastmodFor(post) {
  const iso = parseTime(post && post.editedAt) || parseTime(post && post.createdAt);
  return iso ? iso.slice(0, 10) : '';
}

function navLinks() {
  return [
    ['/terms.html', 'Terms'],
    ['/privacy.html', 'Privacy'],
    ['/guidelines.html', 'Guidelines'],
    ['/report.html', 'Report'],
  ];
}

export function renderPostPage({ origin, siteName, id, handle, text, publishedIso, editedIso, profileUrl }) {
  const headline = makeHeadline(text);
  const description = makeDescription(text);
  const canonical = `${origin}/p/${id}/`;
  const author = { '@type': 'Person', name: `@${handle}` };
  if (profileUrl) author.url = profileUrl;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline,
    text,
    author,
    datePublished: publishedIso,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: siteName || 'gpchat', url: `${origin}/` },
  };
  if (editedIso) ld.dateModified = editedIso;
  const title = `@${handle} on ${siteName || 'gpchat'}: ${headline}`;
  const links = navLinks().map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n    ');
  const footer = navLinks().map(([href, label]) => `<a href="${href}">${label}</a>`).join(' · ');
  const edited = editedIso
    ? ` <span class="edited">Edited <time datetime="${escapeHtml(editedIso)}">${escapeHtml(readableUtc(editedIso))}</time></span>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(siteName || 'gpchat')}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(origin)}/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${jsonForHtml(ld)}</script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #141416; color: #f2f2f2; font: 16px/1.5 system-ui, sans-serif; }
  header, footer, article { max-width: 40rem; margin: 0 auto; padding: 1rem 1.1rem; }
  header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; border-bottom: 1px solid #2c2c32; }
  .brand { color: #e10600; font-weight: 700; text-decoration: none; }
  nav { display: flex; flex-wrap: wrap; gap: 0.75rem; }
  nav a, footer a, .room { color: #9a9aa3; }
  .byline { margin: 0; font-weight: 600; }
  .when { color: #9a9aa3; font-size: 0.85rem; }
  .post-text { font-size: 1.15rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { border-top: 1px solid #2c2c32; color: #9a9aa3; font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <a class="brand" href="/">${escapeHtml(siteName || 'gpchat')}</a>
  <nav aria-label="Site">
    ${links}
  </nav>
</header>
<article>
  <p class="byline">@${escapeHtml(handle)}</p>
  <p class="when">Posted <time datetime="${escapeHtml(publishedIso)}">${escapeHtml(readableUtc(publishedIso))}</time>${edited}</p>
  <p class="post-text">${escapeHtml(text)}</p>
  <p><a class="room" href="/?p=${encodeURIComponent(id)}">View in the room</a></p>
</article>
<footer>
  ${footer}
</footer>
</body>
</html>
`;
}

export function extractJsonLd(html) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  return JSON.parse(m[1]);
}

export function validatePage(html, expect) {
  const problems = [];
  const ld = (() => { try { return extractJsonLd(html); } catch (e) { problems.push('json-ld parse: ' + e.message); return null; } })();
  if (!html.includes(`<link rel="canonical" href="${expect.canonical}">`)) problems.push('canonical');
  if (!html.includes('name="description"')) problems.push('meta description');
  if (!html.includes(`datetime="${expect.publishedIso}"`)) problems.push('time datetime');
  if (!html.includes(escapeHtml(readableUtc(expect.publishedIso)))) problems.push('readable time');
  if (!html.includes(`href="/?p=${expect.id}"`)) problems.push('room link');
  for (const href of ['/terms.html', '/privacy.html', '/guidelines.html', '/report.html']) {
    if (!html.includes(`href="${href}"`)) problems.push('missing ' + href);
  }
  if (!html.includes(`<p class="post-text">${escapeHtml(expect.text)}</p>`)) problems.push('post text');
  if (!html.includes(`@${expect.handle}`)) problems.push('handle');
  if (html.includes('{{') || html.includes('{%')) problems.push('jekyll liquid');
  if (expect.authorUid && html.includes(expect.authorUid)) problems.push('uid leaked');
  if (expect.authorName
    && expect.authorName !== expect.handle
    && expect.authorName !== `@${expect.handle}`
    && !String(expect.text).includes(expect.authorName)
    && html.includes(expect.authorName)) {
    problems.push('display name leaked');
  }
  if (!ld) return { ok: false, problems, ld: null };
  if (ld['@context'] !== 'https://schema.org') problems.push('@context');
  if (ld['@type'] !== 'DiscussionForumPosting') problems.push('@type');
  if (typeof ld.headline !== 'string' || !ld.headline) problems.push('headline');
  if (ld.text !== expect.text) problems.push('json text');
  if (!ld.author || ld.author['@type'] !== 'Person' || ld.author.name !== `@${expect.handle}`) problems.push('author');
  if (expect.profileUrl) {
    if (ld.author.url !== expect.profileUrl) problems.push('author url');
  } else if (Object.prototype.hasOwnProperty.call(ld.author, 'url')) problems.push('unexpected author url');
  if (ld.datePublished !== expect.publishedIso) problems.push('datePublished');
  if (ld.url !== expect.canonical) problems.push('json url');
  if (!ld.isPartOf || ld.isPartOf['@type'] !== 'WebSite' || ld.isPartOf.url !== `${expect.origin}/` || ld.isPartOf.name !== expect.siteName) {
    problems.push('isPartOf');
  }
  const blob = JSON.stringify(ld);
  if (expect.authorUid && blob.includes(expect.authorUid)) problems.push('uid in json-ld');
  for (const key of ['email', 'dob', 'dateOfBirth', 'birthDate', 'location', 'ip', 'authorUid', 'reporterUid']) {
    if (Object.prototype.hasOwnProperty.call(ld, key) || (ld.author && Object.prototype.hasOwnProperty.call(ld.author, key))) {
      problems.push('private key ' + key);
    }
  }
  return { ok: problems.length === 0, problems, ld };
}

export function postLocTest(origin) {
  const host = origin.replace(/^https:\/\//, '');
  return new RegExp(`^https://${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/p/${SAFE_ID.source.slice(1, -1)}/$`);
}

export function mergeSitemap(xml, origin, pages) {
  const isPost = postLocTest(origin);
  const headerEnd = xml.search(/<url\b|<\/urlset>/);
  if (headerEnd < 0) throw new Error('sitemap.xml is missing <urlset>');
  const header = xml.slice(0, headerEnd).replace(/\s*$/, '\n');
  const blocks = [];
  const re = /<url\b[\s\S]*?<\/url>/g;
  let m;
  while ((m = re.exec(xml))) {
    const loc = /<loc>([^<]*)<\/loc>/.exec(m[0]);
    const value = loc ? loc[1].trim() : '';
    if (isPost.test(value)) continue;
    blocks.push('  ' + m[0].trim());
  }
  if (!blocks.length) throw new Error('Refusing to rewrite sitemap.xml without its existing URLs');
  const postLines = pages.map((p) => `  <url><loc>${origin}/p/${p.id}/</loc><lastmod>${p.lastmod}</lastmod></url>`);
  return header + blocks.join('\n') + '\n' + (postLines.length ? postLines.join('\n') + '\n' : '') + '</urlset>\n';
}

export function readExistingPages(root) {
  const dir = path.join(root, 'p');
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !SAFE_ID.test(ent.name)) continue;
    const file = path.join(dir, ent.name, 'index.html');
    if (!fs.existsSync(file)) continue;
    map.set(ent.name, fs.readFileSync(file, 'utf8'));
  }
  return map;
}

function removePostDir(dir) {
  const names = fs.readdirSync(dir);
  const onlyPage = names.every((name) => name === 'index.html' || name.endsWith('.tmp'));
  if (onlyPage) fs.rmSync(dir, { recursive: true, force: true });
  else fs.rmSync(path.join(dir, 'index.html'), { force: true });
}

export function diffPages(existing, pages) {
  const next = new Map(pages.map((p) => [p.id, p.html]));
  const created = [];
  const changed = [];
  const removed = [];
  for (const page of pages) {
    if (!existing.has(page.id)) created.push(page.id);
    else if (existing.get(page.id) !== page.html) changed.push(page.id);
  }
  for (const id of existing.keys()) {
    if (!next.has(id)) removed.push(id);
  }
  return { created, changed, removed };
}

export function applyOutput(root, origin, pages, existing) {
  const diff = diffPages(existing, pages);
  for (const page of pages) {
    if (existing.get(page.id) === page.html) continue;
    const dir = path.join(root, 'p', page.id);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, 'index.html');
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, page.html);
    fs.renameSync(tmp, dest);
  }
  for (const id of diff.removed) removePostDir(path.join(root, 'p', id));
  const sitemapPath = path.join(root, 'sitemap.xml');
  const current = fs.readFileSync(sitemapPath, 'utf8');
  const next = mergeSitemap(current, origin, pages.map((p) => ({ id: p.id, lastmod: p.lastmod })));
  if (next !== current) fs.writeFileSync(sitemapPath, next);
  return diff;
}

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

export function pageFor(post, ctx) {
  const publishedIso = parseTime(post.createdAt);
  const editedIso = parseTime(post.editedAt);
  const profileUrl = publicProfileUrl();
  const html = renderPostPage({
    origin: ctx.origin,
    siteName: ctx.siteName,
    id: post.id,
    handle: post.authorHandle,
    text: post.text,
    publishedIso,
    editedIso: editedIso && editedIso !== publishedIso ? editedIso : '',
    profileUrl,
  });
  return { id: post.id, html, lastmod: lastmodFor(post), profileUrl, publishedIso };
}

function postFromDocument(doc) {
  const fields = decodeValue({ mapValue: { fields: doc.fields || {} } }) || {};
  const id = String(doc.name || '').split('/').pop();
  return { id, ...fields };
}

function userFromDocument(doc) {
  const d = decodeValue({ mapValue: { fields: doc.fields || {} } }) || {};
  return {
    suspended: d.suspended === true,
    suspendedReason: d.suspendedReason === 'under18' ? 'under18' : (d.suspendedReason ? 'other' : ''),
    ageAttested18: flagFalse(d.ageAttested18) ? false : flagTrue(d.ageAttested18) ? true : null,
    under18: flagTrue(d.under18),
    profileHidden: flagTrue(d.profileHidden),
  };
}

function reportFromDocument(doc) {
  const d = decodeValue({ mapValue: { fields: doc.fields || {} } }) || {};
  return {
    postId: typeof d.postId === 'string' ? d.postId : '',
    status: typeof d.status === 'string' ? d.status : '',
  };
}

function isDenied(status, json) {
  if (status === 401 || status === 403) return true;
  const items = Array.isArray(json) ? json : [json];
  return items.some((item) => item && item.error && (item.error.status === 'PERMISSION_DENIED' || item.error.code === 403 || item.error.code === 401));
}

async function firestore(fetchImpl, projectId, apiKey, suffix, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents${suffix}?key=${encodeURIComponent(apiKey)}`;
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    last = { status: res.status, json, text };
    if (res.status !== 429 && res.status < 500) return last;
  }
  return last;
}

async function fetchAllPosts(fetchImpl, config, siteId) {
  const posts = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < 1000; page++) {
    const structuredQuery = {
      from: [{ collectionId: 'posts' }],
      where: { fieldFilter: { field: { fieldPath: 'siteId' }, op: 'EQUAL', value: { stringValue: siteId } } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: 300,
    };
    if (cursor) structuredQuery.startAt = { values: [{ referenceValue: cursor }], before: false };
    const res = await firestore(fetchImpl, config.projectId, config.apiKey, ':runQuery', { structuredQuery });
    if (!res || isDenied(res.status, res.json)) {
      const err = new Error('posts query is not public');
      err.denied = true;
      err.collection = 'posts';
      err.fields = POST_FIELDS;
      err.status = res && res.status;
      throw err;
    }
    if (res.status !== 200) throw new Error(`posts query failed HTTP ${res.status}`);
    const docs = (Array.isArray(res.json) ? res.json : []).filter((row) => row && row.document);
    if (!docs.length) break;
    let fresh = docs;
    if (cursor && docs[0].document.name === cursor) fresh = docs.slice(1);
    if (!fresh.length) break;
    for (const row of fresh) {
      const post = postFromDocument(row.document);
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push(post);
    }
    const next = fresh[fresh.length - 1].document.name;
    if (next === cursor) break;
    cursor = next;
    if (fresh.length < 300 && docs.length < 300) break;
  }
  return posts;
}

async function fetchUsers(fetchImpl, config, uids) {
  const byUid = new Map();
  const list = [...uids];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const documents = chunk.map((uid) => `projects/${config.projectId}/databases/(default)/documents/users/${uid}`);
    const res = await firestore(fetchImpl, config.projectId, config.apiKey, ':batchGet', { documents });
    if (!res || isDenied(res.status, res.json)) {
      return { denied: true, status: res && res.status, byUid };
    }
    if (res.status !== 200) throw new Error(`users batchGet failed HTTP ${res.status}`);
    const rows = Array.isArray(res.json) ? res.json : [];
    for (const row of rows) {
      if (row && row.found) {
        const uid = String(row.found.name || '').split('/').pop();
        byUid.set(uid, userFromDocument(row.found));
      }
    }
  }
  return { denied: false, status: 200, byUid };
}

async function fetchReports(fetchImpl, config, siteId) {
  const reports = [];
  let cursor = null;
  for (let page = 0; page < 1000; page++) {
    const structuredQuery = {
      from: [{ collectionId: 'reports' }],
      where: { fieldFilter: { field: { fieldPath: 'siteId' }, op: 'EQUAL', value: { stringValue: siteId } } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: 300,
    };
    if (cursor) structuredQuery.startAt = { values: [{ referenceValue: cursor }], before: false };
    const res = await firestore(fetchImpl, config.projectId, config.apiKey, ':runQuery', { structuredQuery });
    if (!res || isDenied(res.status, res.json)) return { denied: true, status: res && res.status, reports };
    if (res.status !== 200) throw new Error(`reports query failed HTTP ${res.status}`);
    const docs = (Array.isArray(res.json) ? res.json : []).filter((row) => row && row.document);
    if (!docs.length) break;
    let fresh = docs;
    if (cursor && docs[0].document.name === cursor) fresh = docs.slice(1);
    if (!fresh.length) break;
    for (const row of fresh) reports.push(reportFromDocument(row.document));
    const next = fresh[fresh.length - 1].document.name;
    if (next === cursor) break;
    cursor = next;
    if (fresh.length < 300 && docs.length < 300) break;
  }
  return { denied: false, status: 200, reports };
}

export async function loadCorpusFromFirestore({ fetchImpl, config, siteId, posts }) {
  const all = posts || await fetchAllPosts(fetchImpl, config, siteId);
  const kept = all.filter((post) => !postLevelReason(post, siteId));
  const failures = [];
  if (!kept.length) {
    return { posts: all, usersByUid: new Map(), reportsByPostId: new Map(), authFailures: failures };
  }
  const uids = new Set(kept.map((post) => post.authorUid).filter((uid) => typeof uid === 'string' && /^[A-Za-z0-9]{1,128}$/.test(uid)));
  const users = await fetchUsers(fetchImpl, config, uids);
  if (users.denied) {
    failures.push({
      collection: 'users/{authorUid}',
      fields: USER_FIELDS,
      status: users.status || 403,
      detail: 'Unauthenticated get/batchGet is denied. factory.js reads users/{uid} only for the signed-in member. The rules draft allows get for the owner or admin.',
    });
  }
  const reports = await fetchReports(fetchImpl, config, siteId);
  if (reports.denied) {
    failures.push({
      collection: 'reports',
      fields: REPORT_FIELDS,
      status: reports.status || 403,
      detail: 'Unauthenticated query is denied. factory.js reads reports only for the admin queue. The rules draft allows read for the admin or the reporter. status is empty on create and "dismissed" after dismissReport.',
    });
  }
  const reportsByPostId = new Map();
  if (!reports.denied) {
    for (const report of reports.reports) {
      if (!report.postId) continue;
      if (!reportsByPostId.has(report.postId)) reportsByPostId.set(report.postId, []);
      reportsByPostId.get(report.postId).push({ status: report.status });
    }
  }
  return {
    posts: all,
    usersByUid: users.denied ? null : users.byUid,
    reportsByPostId: reports.denied ? null : reportsByPostId,
    authFailures: failures,
  };
}

function readOrigin(root) {
  const host = fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim();
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error('Unexpected CNAME host');
  return { host, origin: `https://${host}` };
}

function readIndexNow(root) {
  const names = fs.readdirSync(root).filter((name) => /^[a-f0-9]{8,128}\.txt$/.test(name));
  for (const name of names) {
    const key = name.slice(0, -4);
    const body = fs.readFileSync(path.join(root, name), 'utf8').trim();
    if (body === key) return { key, file: name };
  }
  return null;
}

function chooseSample(posts, siteId) {
  const kept = posts.filter((post) => !postLevelReason(post, siteId));
  const stewards = kept.filter((post) => post.steward === true);
  const pool = (stewards.length ? stewards : kept).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool[0] || null;
}

function printSummary(summary) {
  const lines = [];
  lines.push(`siteId: ${summary.siteId}`);
  lines.push(`postPages: ${summary.postPages === true}`);
  lines.push(`action: ${summary.action}`);
  if (summary.note) lines.push(summary.note);
  if (summary.postsRead != null) lines.push(`posts read: ${summary.postsRead}`);
  if (summary.postLevelExcluded) {
    const keys = Object.keys(summary.postLevelExcluded).sort();
    lines.push('post-level excluded:');
    if (!keys.length) lines.push('  (none)');
    for (const key of keys) lines.push(`  ${key}: ${summary.postLevelExcluded[key]}`);
    lines.push(`post-level kept: ${summary.postLevelKept}`);
  }
  if (summary.authFailures && summary.authFailures.length) {
    lines.push('eligibility reads that require auth:');
    for (const failure of summary.authFailures) {
      lines.push(`  ${failure.collection} HTTP ${failure.status}`);
      lines.push(`    fields: ${failure.fields.join(', ')}`);
      lines.push(`    ${failure.detail}`);
    }
  }
  if (summary.excluded) {
    const keys = Object.keys(summary.excluded).sort();
    lines.push('excluded by reason:');
    if (!keys.length) lines.push('  (none)');
    for (const key of keys) lines.push(`  ${key}: ${summary.excluded[key]}`);
  }
  if (summary.eligible != null) lines.push(`eligible: ${summary.eligible}`);
  lines.push(`pages that would be written: ${summary.wouldWrite}`);
  if (summary.created != null) lines.push(`new: ${summary.created}  changed: ${summary.changed}  removed: ${summary.removed}`);
  if (summary.sample) {
    lines.push(`sample post: ${summary.sample.id} @${summary.sample.handle} jsonLd=${summary.sample.ok ? 'valid' : 'INVALID'}`);
    if (summary.sample.problems && summary.sample.problems.length) lines.push(`sample problems: ${summary.sample.problems.join('; ')}`);
    if (summary.sample.note) lines.push(summary.sample.note);
  }
  console.log(lines.join('\n'));
  console.log('SUMMARY_JSON ' + JSON.stringify(summary));
}

export async function run(opts = {}) {
  const root = opts.root || repoRoot;
  const dryRun = !!opts.dryRun;
  const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
  const siteId = site.siteId;
  if (!pagesEnabled(site) && !dryRun) {
    if (opts.indexnowPath) {
      fs.writeFileSync(opts.indexnowPath, JSON.stringify({ ping: false, reason: 'postPages is false', urls: [] }, null, 2));
    }
    const summary = {
      siteId,
      postPages: false,
      action: 'skipped',
      note: 'postPages is false. Exiting without reading Firestore or writing files.',
      wouldWrite: 0,
    };
    printSummary(summary);
    return { code: 0, summary, sampleHtml: '' };
  }
  const note = !pagesEnabled(site)
    ? 'postPages is false. A normal run would exit before reading Firestore or writing. Continuing because this is a dry run.'
    : '';
  const { host, origin } = readOrigin(root);
  const load = opts.loadCorpus || (async () => {
    const config = readWebConfig(fs.readFileSync(path.join(root, 'factory.js'), 'utf8'));
    return loadCorpusFromFirestore({ fetchImpl: opts.fetchImpl || globalThis.fetch, config, siteId });
  });
  let corpus;
  try {
    corpus = await load(site);
  } catch (err) {
    if (err && err.denied) {
      const summary = {
        siteId,
        postPages: site.postPages === true,
        dryRun,
        action: 'blocked',
        note,
        postsRead: 0,
        authFailures: [{ collection: err.collection, fields: err.fields, status: err.status || 403, detail: err.message }],
        eligible: null,
        wouldWrite: 0,
      };
      printSummary(summary);
      return { code: 2, summary, sampleHtml: '' };
    }
    throw err;
  }
  const posts = corpus.posts || [];
  const postLevelExcluded = {};
  const kept = [];
  for (const post of posts) {
    const reason = postLevelReason(post, siteId);
    if (reason) bump(postLevelExcluded, reason);
    else kept.push(post);
  }
  const blocked = corpus.authFailures && corpus.authFailures.length;
  let excluded = null;
  let eligiblePosts = [];
  if (!blocked) {
    excluded = {};
    for (const post of posts) {
      const user = corpus.usersByUid ? corpus.usersByUid.get(post.authorUid) || null : null;
      const reports = corpus.reportsByPostId ? (corpus.reportsByPostId.get(post.id) || []) : [];
      const reason = classify(post, siteId, user, reports);
      if (reason) bump(excluded, reason);
      else eligiblePosts.push(post);
    }
  }
  const ctx = { origin, siteName: site.name || siteId };
  const pages = eligiblePosts.map((post) => pageFor(post, ctx));
  const existing = readExistingPages(root);
  const diff = blocked ? { created: [], changed: [], removed: [] } : diffPages(existing, pages);
  const samplePost = chooseSample(posts, siteId);
  let sampleHtml = '';
  let sample = null;
  if (samplePost) {
    const page = pageFor(samplePost, ctx);
    sampleHtml = page.html;
    const checked = validatePage(sampleHtml, {
      canonical: `${origin}/p/${samplePost.id}/`,
      publishedIso: page.publishedIso,
      id: samplePost.id,
      text: samplePost.text,
      handle: samplePost.authorHandle,
      profileUrl: null,
      origin,
      siteName: ctx.siteName,
      authorUid: samplePost.authorUid || '',
      authorName: samplePost.authorName || '',
    });
    sample = {
      id: samplePost.id,
      handle: samplePost.authorHandle,
      ok: checked.ok,
      problems: checked.problems,
      note: blocked
        ? 'Shape sample only. This post was not eligibility-cleared and is not published. Author suspension, under-18 flags, and report status could not be read.'
        : 'Sample of a page that passed eligibility.',
    };
    if (opts.samplePath) fs.writeFileSync(opts.samplePath, sampleHtml);
  }
  const wouldWrite = blocked ? 0 : pages.length;
  const summary = {
    siteId,
    host,
    postPages: site.postPages === true,
    dryRun,
    action: blocked ? 'blocked' : (dryRun ? 'dry-run' : 'wrote'),
    note,
    postsRead: posts.length,
    postLevelExcluded,
    postLevelKept: kept.length,
    authFailures: corpus.authFailures || [],
    excluded,
    eligible: blocked ? null : pages.length,
    wouldWrite,
    created: diff.created.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    sample,
  };
  if (blocked) {
    if (!dryRun && opts.indexnowPath) {
      fs.writeFileSync(opts.indexnowPath, JSON.stringify({ ping: false, reason: 'eligibility reads require auth', urls: [] }, null, 2));
    }
    printSummary(summary);
    return { code: 2, summary, sampleHtml };
  }
  if (!dryRun) {
    applyOutput(root, origin, pages, existing);
    if (opts.indexnowPath) {
      const key = readIndexNow(root);
      const gpchat = siteId === 'gpchat' && host === 'gpchat.com';
      const toUrl = (id) => `${origin}/p/${id}/`;
      const created = gpchat ? diff.created.map(toUrl) : [];
      const changed = gpchat ? diff.changed.map(toUrl) : [];
      const removed = gpchat ? diff.removed.map(toUrl) : [];
      const urls = [...created, ...changed, ...removed];
      const payload = {
        ping: !!(gpchat && key && urls.length),
        reason: !gpchat ? 'IndexNow is gpchat only' : (!key ? 'IndexNow key file missing' : (urls.length ? '' : 'no new, changed, or removed post URLs')),
        host,
        key: key ? key.key : '',
        keyLocation: key ? `${origin}/${key.file}` : '',
        created,
        changed,
        removed,
        urls,
      };
      fs.writeFileSync(opts.indexnowPath, JSON.stringify(payload, null, 2));
    }
    summary.action = 'wrote';
  }
  printSummary(summary);
  return { code: 0, summary, sampleHtml };
}

function parseArgs(argv) {
  const out = { dryRun: false, samplePath: '', root: repoRoot, indexnowPath: '/tmp/gpchat-indexnow.json' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--sample') out.samplePath = argv[++i] || '';
    else if (arg === '--root') out.root = argv[++i] || repoRoot;
    else if (arg === '--indexnow-out') out.indexnowPath = argv[++i] || '';
    else throw new Error('Unknown argument ' + arg);
  }
  return out;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await run({
    root: args.root,
    dryRun: args.dryRun,
    samplePath: args.samplePath,
    indexnowPath: args.dryRun ? '' : args.indexnowPath,
  });
  return result.code;
}

if (invokedDirectly()) {
  main().then((code) => {
    process.exit(code || 0);
  }).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
