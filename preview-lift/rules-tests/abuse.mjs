// Named abuse cases, run twice:
//   RULESET=baseline  -> preview-lift/firestore.rules.BASELINE
//   RULESET=proposed  -> draft with guardedSite = ['gpchat']
// Each case records allow (write/read succeeded) or deny (rules rejected it).
// Expectations are honest: a case baseline already rejects stays deny/deny.
// A homoglyph the rules cannot fold stays allow/allow and is called out in `note`.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';

const RULESET = process.env.RULESET;
if (RULESET !== 'baseline' && RULESET !== 'proposed') {
  console.error('RULESET must be baseline or proposed');
  process.exit(2);
}

const FV = firebase.firestore.FieldValue;
const TS = firebase.firestore.Timestamp;
const ADMIN = 'o774wL9hUVSi19EkDCgLqQomP8i2';
const CYR_A = '\u0430'; // Cyrillic a
const CYR_O = '\u043e'; // Cyrillic o
const GR_O = '\u03bf'; // Greek omicron
const FW_A = '\uff41'; // fullwidth a (no NFKC fold in rules)
const DOTLESS_I = '\u0131';

const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT || 'demo-subx-abuse',
  firestore: { rules: fs.readFileSync(process.env.RULES, 'utf8'), host: '127.0.0.1', port: 8080 }
});
const db = (uid) => env.authenticatedContext(uid, { email_verified: true, email: uid + '@x.com' }).firestore();
const utcDay = () => {
  const d = new Date();
  return TS.fromDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
};
const base = (uid, extra = {}) => Object.assign({
  siteId: 'gpchat', parentId: null, authorUid: uid, authorName: 'Fan ' + uid,
  authorHandle: ('fan' + uid.toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 15),
  text: 'Box box box', likes: {}, likeCount: 0, replyCount: 0, nestSlug: '',
  createdAt: FV.serverTimestamp()
}, extra);

class SetupError extends Error {}

async function guardedPost(uid, data, prev) {
  const d = db(uid);
  const b = d.batch();
  b.set(d.collection('posts').doc(), data);
  const today = utcDay();
  const sameDay = prev && prev.day && prev.day.isEqual && prev.day.isEqual(today);
  b.set(d.collection('rateLimits').doc(uid), {
    lastPostAt: FV.serverTimestamp(), day: today, dayCount: sameDay ? FV.increment(1) : 1
  }, { merge: true });
  await b.commit();
}

// Proposed path includes the rate-limit bump so a denial is the guard under test,
// not the missing throttle doc. Baseline has no rateLimits match, so the same
// abuse is a plain posts.add (that write is what production allows today).
async function abusePost(uid, extra) {
  const data = base(uid, extra);
  if (RULESET === 'proposed') await guardedPost(uid, data);
  else await db(uid).collection('posts').add(data);
}

async function ensureConv(uid, other) {
  const cid = 'gpchat__' + uid + '_' + other;
  await db(uid).doc('conversations/' + cid).set({ siteId: 'gpchat', participants: [uid, other] });
  return cid;
}
async function dmMsg(uid, cid, msgId, text, throttle) {
  const d = db(uid);
  const msg = { siteId: 'gpchat', fromUid: uid, text, createdAt: FV.serverTimestamp() };
  if (!throttle) {
    await d.doc('conversations/' + cid + '/messages/' + msgId).set(msg);
    return;
  }
  const b = d.batch();
  b.set(d.doc('conversations/' + cid + '/messages/' + msgId), msg);
  b.set(d.doc('rateLimits/' + uid), { lastMsgAt: FV.serverTimestamp() }, { merge: true });
  await b.commit();
}

const seed = async (fn) => env.withSecurityRulesDisabled(async (c) => fn(c.firestore()));
const cases = [];
function define(id, baseline, proposed, note, run) {
  cases.push({ id, baseline, proposed, note, run });
}

define('flood-100-plain-posts', 'allow', 'deny',
  '100 plain posts, no rateLimits doc. Proposed rejects the first via postThrottled.',
  async () => {
    for (let i = 0; i < 100; i++) await db('flood').collection('posts').add(base('flood', { text: 'flood ' + i }));
  });

define('cooldown-20s', 'allow', 'deny',
  'Second post inside 20s. Baseline has no gap. Proposed postBump requires request.time > lastPostAt + 20s.',
  async () => {
    const uid = 'cool01';
    if (RULESET === 'proposed') {
      try { await guardedPost(uid, base(uid)); }
      catch (e) { throw new SetupError('first guarded post should succeed: ' + (e.message || e)); }
      await guardedPost(uid, base(uid), { day: utcDay() });
    } else {
      await db(uid).collection('posts').add(base(uid));
      await db(uid).collection('posts').add(base(uid));
    }
  });

define('daily-cap-51st', 'allow', 'deny',
  'Baseline has no daily cap (51 plain posts succeed). Proposed rejects a guarded post once dayCount is 50.',
  async () => {
    const uid = 'cap01';
    if (RULESET === 'proposed') {
      await seed(async (s) => s.doc('rateLimits/' + uid).set({
        lastPostAt: TS.fromDate(new Date(Date.now() - 3600e3)), day: utcDay(), dayCount: 50
      }));
      await guardedPost(uid, base(uid), { day: utcDay() });
    } else {
      for (let i = 0; i < 51; i++) await db(uid).collection('posts').add(base(uid, { text: 'day ' + i }));
    }
  });

define('backdated-createdAt', 'allow', 'deny',
  'createdAt yesterday. Proposed memberPostOk requires createdAt == request.time.',
  async () => abusePost('back01', { createdAt: TS.fromDate(new Date(Date.now() - 86400e3)) }));

define('future-createdAt-2099', 'allow', 'deny',
  'createdAt 2099-01-01 pins the post to the top of a time-ordered feed.',
  async () => abusePost('pin2099', { createdAt: TS.fromDate(new Date('2099-01-01')) }));

define('handle-admin', 'allow', 'deny', 'authorHandle admin.', async () => abusePost('hAdmin', { authorHandle: 'admin' }));
define('handle-official', 'allow', 'deny', 'authorHandle official.', async () => abusePost('hOff', { authorHandle: 'official' }));
define('handle-steward', 'allow', 'deny', 'authorHandle steward.', async () => abusePost('hStew', { authorHandle: 'steward' }));
define('name-gpchat-admin', 'allow', 'deny', 'authorName "gpchat Admin".', async () => abusePost('nGp', { authorName: 'gpchat Admin' }));
define('name-official', 'allow', 'deny', 'authorName "Official".', async () => abusePost('nOff', { authorName: 'Official' }));
define('name-steward', 'allow', 'deny', 'authorName "Steward".', async () => abusePost('nStew', { authorName: 'Steward' }));
define('handle-leet-adm1n', 'allow', 'deny', 'authorHandle adm1n.', async () => abusePost('hLeet', { authorHandle: 'adm1n' }));
define('handle-leet-4dmin', 'allow', 'deny', 'authorHandle 4dmin.', async () => abusePost('h4d', { authorHandle: '4dmin' }));
define('name-leet-adm1n', 'allow', 'deny', 'authorName "adm1n".', async () => abusePost('nLeet', { authorName: 'adm1n' }));
define('name-leet-0fficial', 'allow', 'deny', 'authorName "0fficial".', async () => abusePost('n0ff', { authorName: '0fficial' }));
define('name-leet-st3ward', 'allow', 'deny', 'authorName "st3ward".', async () => abusePost('nSt3', { authorName: 'st3ward' }));
define('handle-unicode-cyrillic-a', 'allow', 'deny',
  'Handle ' + CYR_A + 'dmin. Denied by the ASCII handle class, not by confusable folding.',
  async () => abusePost('hCyr', { authorHandle: CYR_A + 'dmin' }));
define('name-unicode-cyrillic-admin', 'allow', 'deny',
  'authorName Cyrillic-a + "dmin", listed explicitly in nameOk.',
  async () => abusePost('nCyr', { authorName: CYR_A + 'dmin' }));
define('name-unicode-greek-omicron-official', 'allow', 'deny',
  'authorName Greek omicron + "fficial", listed explicitly in nameOk.',
  async () => abusePost('nGr', { authorName: GR_O + 'fficial' }));
define('name-unicode-cyrillic-o-official', 'allow', 'deny',
  'authorName Cyrillic-o + "fficial", listed explicitly in nameOk.',
  async () => abusePost('nCyrO', { authorName: CYR_O + 'fficial' }));
define('name-unicode-unlisted-fullwidth', 'allow', 'allow',
  'RESIDUAL: fullwidth "a" + dmin. Rules have no confusable-normalize / NFKC, so this still passes.',
  async () => abusePost('nFw', { authorName: FW_A + 'dmin' }));
define('name-unicode-unlisted-dotless-i', 'allow', 'allow',
  'RESIDUAL: "adm" + dotless i + "n". Unlisted homoglyph; rules cannot fold it to admin.',
  async () => abusePost('nDot', { authorName: 'adm' + DOTLESS_I + 'n' }));
define('name-profile-gpchat-admin', 'allow', 'deny',
  'users doc displayName "gpchat Admin". profileOk now calls nameOk.',
  async () => {
    await db('prof1').doc('users/prof1').set({ siteId: 'gpchat', displayName: 'gpchat Admin', provider: 'google' });
  });

define('create-fake-likeCount', 'allow', 'deny', 'likeCount 9999 on create.', async () => abusePost('lk1', { likeCount: 9999 }));
define('create-fake-replyCount', 'allow', 'deny', 'replyCount 9999 on create.', async () => abusePost('rc1', { replyCount: 9999 }));
define('raise-replyCount-by-more-than-1', 'deny', 'deny',
  'ALREADY DENIED BY BASELINE. onlyReplyCountBump allows exactly +1, so increment(2) on someone else\'s post fails in both rulesets.',
  async () => { await db('bumper').doc('posts/counter').update({ replyCount: FV.increment(2) }); });

define('three-links', 'allow', 'deny', 'Three http links in text.', async () => abusePost('lnk3', { text: 'a https://a.com b https://b.com c https://c.com' }));
define('url-shortener-bitly', 'allow', 'deny', 'bit.ly in the post text.', async () => abusePost('bitly', { text: 'win bit.ly/xyz' }));
define('url-shortener-tinyurl', 'allow', 'deny', 'tinyurl.com in the post text.', async () => abusePost('tiny', { text: 'see tinyurl.com/abc' }));
define('junk-extra-fields', 'allow', 'deny', 'pinned:true is not in postKeysOk.', async () => abusePost('junk1', { pinned: true }));

define('dm-flood-100', 'allow', 'deny',
  '100 DMs with no lastMsgAt bump. Proposed rejects the first via msgThrottled.',
  async () => {
    const cid = await ensureConv('dmflood', 'peerf');
    for (let i = 0; i < 100; i++) await dmMsg('dmflood', cid, 'f' + i, 'buy ' + i, false);
  });
define('dm-cooldown-2s', 'allow', 'deny',
  'Second DM inside 2s. Baseline has no gap. Proposed msgBump requires request.time > lastMsgAt + 2s.',
  async () => {
    const uid = 'dmcool';
    const cid = await ensureConv(uid, 'peerc');
    if (RULESET === 'proposed') {
      try { await dmMsg(uid, cid, 'm1', 'hi', true); }
      catch (e) { throw new SetupError('first DM should succeed: ' + (e.message || e)); }
      await dmMsg(uid, cid, 'm2', 'hi again', true);
    } else {
      await dmMsg(uid, cid, 'm1', 'hi', false);
      await dmMsg(uid, cid, 'm2', 'hi again', false);
    }
  });
define('dm-shortener-spam', 'allow', 'deny',
  'DM text "win bit.ly/xyz". Proposed includes the lastMsgAt bump so the denial is spamFree.',
  async () => {
    const uid = 'dmspam';
    const cid = await ensureConv(uid, 'peers');
    await dmMsg(uid, cid, 'm1', 'win bit.ly/xyz', RULESET === 'proposed');
  });

define('cross-room-reply', 'allow', 'deny',
  'gpchat reply whose parentId is a 27chat post.',
  async () => abusePost('xroom', { parentId: 'parent27' }));

define('member-sets-steward-true', 'allow', 'deny',
  'Non-admin create with steward:true. Admin is the only principal that may set it.',
  async () => abusePost('stew1', { steward: true }));

define('member-deletes-others-post', 'deny', 'deny',
  'ALREADY DENIED BY BASELINE. Delete is author-only there, and author-or-admin in the draft. A non-author member still cannot delete.',
  async () => { await db('thief').doc('posts/victim').delete(); });

define('admin-steward-removes-any-post', 'deny', 'allow',
  'CAPABILITY. Steward is the admin uid (no second steward principal). Baseline delete is author-only, so this admin delete is denied. Proposed isAdmin() may delete any post.',
  async () => { await db(ADMIN).doc('posts/remove-me').delete(); });

define('users-write-email', 'deny', 'deny',
  'ALREADY DENIED BY BASELINE. users docs reject an email field in both rulesets.',
  async () => { await db('mail1').doc('users/mail1').set({ siteId: 'gpchat', displayName: 'Fan', email: 'mail1@x.com' }); });
define('users-write-phone', 'allow', 'deny',
  'phone is new in the draft. Baseline only blocks the email key.',
  async () => { await db('ph1').doc('users/ph1').set({ siteId: 'gpchat', displayName: 'Fan', phone: '+15555550100' }); });
define('users-write-phoneNumber', 'allow', 'deny',
  'phoneNumber is new in the draft. Baseline only blocks the email key.',
  async () => { await db('ph2').doc('users/ph2').set({ siteId: 'gpchat', displayName: 'Fan', phoneNumber: '+15555550101' }); });
define('non-owner-reads-users-doc', 'deny', 'deny',
  'ALREADY DENIED BY BASELINE. users get is owner-or-admin in both rulesets.',
  async () => { await db('reader').doc('users/privateFan').get(); });

define('report-create', 'allow', 'allow',
  'CAPABILITY. Verified reporter creates a reports doc. Allowed in both rulesets.',
  async () => {
    await db('rpt1').collection('reports').add({
      siteId: 'gpchat', postId: 'victim', reporterUid: 'rpt1', reason: 'abuse', createdAt: FV.serverTimestamp()
    });
  });
define('report-list-admin', 'allow', 'allow',
  'CAPABILITY. Admin list of reports where siteId == gpchat.',
  async () => {
    const snap = await db(ADMIN).collection('reports').where('siteId', '==', 'gpchat').get();
    if (snap.size < 1) throw new SetupError('admin list returned no seeded report');
  });
define('report-list-non-admin', 'deny', 'deny',
  'CAPABILITY. Member list filtered only by siteId is not constrained to reporterUid.',
  async () => { await db('rpt1').collection('reports').where('siteId', '==', 'gpchat').get(); });
define('report-dismiss-admin', 'allow', 'allow',
  'CAPABILITY. Admin update status=dismissed.',
  async () => { await db(ADMIN).doc('reports/dismiss-me').update({ status: 'dismissed' }); });
define('report-dismiss-non-admin', 'deny', 'deny',
  'CAPABILITY. Member cannot update a report.',
  async () => { await db('rpt1').doc('reports/dismiss-me').update({ status: 'dismissed' }); });

await env.clearFirestore();
await seed(async (s) => {
  const post = (id, extra) => s.doc('posts/' + id).set(Object.assign({
    siteId: 'gpchat', authorUid: 'u9', text: 'seed', likes: {}, likeCount: 0, replyCount: 0, createdAt: TS.now()
  }, extra));
  await post('victim');
  await post('remove-me');
  await post('counter', { replyCount: 0 });
  await post('parent27', { siteId: '27chat', text: 'other room' });
  await s.doc('users/privateFan').set({ siteId: 'gpchat', displayName: 'Private Fan', provider: 'google' });
  await s.doc('reports/listed').set({ siteId: 'gpchat', postId: 'victim', reporterUid: 'rpt1', reason: 'abuse', createdAt: TS.now() });
  await s.doc('reports/dismiss-me').set({ siteId: 'gpchat', postId: 'victim', reporterUid: 'rpt1', reason: 'abuse', createdAt: TS.now() });
});

const rows = [];
let failN = 0;
for (const c of cases) {
  const expected = c[RULESET];
  let outcome;
  try {
    await c.run();
    outcome = 'allow';
  } catch (e) {
    outcome = e instanceof SetupError ? 'error' : 'deny';
    if (outcome === 'error') console.error('SETUP ' + c.id + ' :: ' + (e.message || e));
  }
  const ok = outcome === expected;
  if (!ok) failN++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + c.id + ' expected ' + expected + ' got ' + outcome);
  rows.push({ id: c.id, outcome, expected, ok, note: c.note, baseline: c.baseline, proposed: c.proposed });
}

console.log('\n| case | baseline expect | proposed expect | this run (' + RULESET + ') | note |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const note = r.note.replace(/\|/g, '/');
  console.log('| ' + r.id + ' | ' + r.baseline + ' | ' + r.proposed + ' | ' + r.outcome + (r.ok ? '' : ' MISMATCH') + ' | ' + note + ' |');
}
console.log('\n' + rows.length + ' cases, ' + (failN ? failN + ' FAILED' : 'ALL PASS') + ' (' + RULESET + ')');
await env.cleanup();
process.exit(failN ? 1 : 0);
