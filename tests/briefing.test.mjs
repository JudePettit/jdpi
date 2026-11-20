// Briefing: the catalogue is balanced across the five positions, stories are fresh, and the page filters by topic.
// The data test reads briefing/data/latest.json from this checkout and holds it to the build's own thresholds
// (sources.mjs), so a data workflow can run it on the file it is about to commit. The live-data and page tests run
// where the site is deployed (JDPI_URL, e.g. http://localhost:8787, or the live site); PRP_PAGES=0 leaves them out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { POSITIONS, PER_POSITION, MIN_WORKING_SHARE, MIN_ACTIVE, SOURCES } from '../briefing/scripts/sources.mjs';
import { parseFeed, canonicalUrl, titleKey } from '../briefing/scripts/rss.mjs';
import { categorize } from '../briefing/scripts/categorize.mjs';
import '../design/prp-access.js'; // globalThis.PRPAccess: free sources lead

const DATA = JSON.parse(readFileSync(new URL('../briefing/data/latest.json', import.meta.url), 'utf8'));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('catalogue has enough sources per position', () => {
  for (const p of POSITIONS) assert.ok(SOURCES.filter(s => s.position === p.key).length >= PER_POSITION, p.key);
  assert.equal(new Set(SOURCES.map(s => s.id)).size, SOURCES.length);
});

test('parses RSS and Atom and strips tracking', () => {
  const rss = parseFeed('<rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://x.com/a?utm_source=rss&id=2#top</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>');
  assert.deepEqual([rss[0].title, rss[0].url, rss[0].published], ['A & B', 'https://x.com/a?id=2', '2026-10-26T10:00:00.000Z']);
  // Google News: the " - <publisher>" suffix its titles carry is dropped when <source> names that publisher, and only then.
  const gn = parseFeed('<rss><channel><item><title>Senate passes the bill - Newsmax</title><link>https://news.google.com/rss/articles/CBMi1</link><pubDate>Fri, 30 Oct 2026 15:22:37 GMT</pubDate><source url="https://www.newsmax.com">Newsmax</source></item><item><title>Cats - Dogs</title><link>https://x.com/c</link></item></channel></rss>');
  assert.deepEqual(gn.map(i => i.title), ['Senate passes the bill', 'Cats - Dogs']);
  const atom = parseFeed('<feed><entry><title>T</title><link rel="self" href="https://x.com/self"/><link rel="alternate" href="https://x.com/post"/><updated>2026-10-26T10:00:00Z</updated></entry></feed>');
  assert.equal(atom[0].url, 'https://x.com/post');
  assert.equal(canonicalUrl('https://x.com/?fbclid=1'), 'https://x.com/');
});

test('soft-news filter classifies sport, entertainment and lifestyle but keeps hard news', () => {
  const cases = [
    ['Arsenal striker scores hat-trick in derby', 'https://x.com/news/a', 'sports'],
    ['Antonelli takes F1 pole', 'https://x.com/formula-1/2026/a', 'sports'],
    ['Red carpet looks from the Met Gala', 'https://x.com/news/a', 'entertainment'],
    ['Slate Mini Crossword for Oct. 26', 'https://slate.com/life/2026/10/x', 'lifestyle'],
    ['Government bans betting ads in football', 'https://x.com/sport/a', 'news'],
    ['FIFA corruption trial opens', 'https://x.com/football/a', 'news'],
    ['Actress joins rally for Texas Democrat', 'https://x.com/entertainment/a', 'news'],
    ['Senate race tightens in Ohio', 'https://x.com/politics/a', 'news'],
    ['Election games: who blinks first?', 'https://x.com/world/a', 'news'],
  ];
  for (const [t, u, want] of cases) assert.equal(categorize(t, u), want, t);
});

// The store's checks, shared by the data test (this checkout's file) and the live-data test (a deployed copy). The
// feed thresholds are the build's own, so a store the build would have refused to write fails here too. At least 100
// stories per position: the smallest position had 237 even in the first store, built from a single run, so a store
// with fewer has lost most of its week.
function checkStore(d) {
  const generated = Date.parse(d.generated);
  assert.ok(Number.isFinite(generated) && d.generated === new Date(generated).toISOString(), 'generated is an ISO time');
  assert.equal(d.keepDays, 7);
  assert.equal(d.perPosition, PER_POSITION);
  assert.deepEqual(d.positions, POSITIONS);
  assert.deepEqual(d.sources.map(s => s.id).sort(), SOURCES.map(s => s.id).sort(), 'one status per catalogued feed');
  // A feed is working (an active publisher or a reserve) exactly when it returned fresh stories (status ok).
  for (const s of d.sources) assert.ok(!(s.active && s.reserve) && (s.active || s.reserve) === (s.status === 'ok'), `${s.id}: ${s.status}`);
  const working = d.sources.filter(s => s.active || s.reserve).length;
  assert.ok(working >= Math.ceil(SOURCES.length * MIN_WORKING_SHARE), `${working} of ${SOURCES.length} feeds returned fresh stories`);
  const position = new Map(d.sources.map(s => [s.id, s.position]));
  for (const p of POSITIONS) {
    const active = d.sources.filter(s => s.position === p.key && s.active).length, stories = d.items.filter(i => position.get(i.s) === p.key).length;
    assert.ok(active >= MIN_ACTIVE && active <= PER_POSITION, `${p.key}: ${active} active publishers`);
    assert.ok(stories >= 100, `${p.key}: ${stories} stories`);
  }
  // Stories: newest first, inside the seven-day window (dates more than an hour ahead are replaced by the fetch time),
  // one per URL and one per headline from each publisher.
  const since = generated - d.keepDays * 864e5, urls = new Set(), headlines = new Set();
  d.items.forEach((i, k) => {
    const where = `${i.s}: ${i.t}`, t = Date.parse(i.p);
    assert.ok(position.has(i.s), `unknown source: ${where}`);
    assert.ok(typeof i.t === 'string' && i.t.trim(), where);
    assert.match(i.u, /^https?:\/\/\S+$/, where);
    assert.ok(typeof i.d === 'string' && i.d.length <= 240, `summary: ${where}`);
    assert.ok(i.c === undefined || ['s', 'e', 'l'].includes(i.c), `soft-news tag: ${where}`);
    assert.ok(i.p === new Date(t).toISOString() && t >= since && t <= generated + 36e5, `${i.p} outside ${new Date(since).toISOString()} … ${d.generated}: ${where}`);
    assert.ok(!k || d.items[k - 1].p >= i.p, `newest first: ${where}`);
    assert.ok(!urls.has(i.u), `same URL twice: ${where}`);
    assert.ok(!headlines.has(i.s + '|' + titleKey(i.t)), `same headline twice: ${where}`);
    urls.add(i.u); headlines.add(i.s + '|' + titleKey(i.t));
  });
}

test('data: latest.json has enough working feeds, every position’s publishers and a well-formed seven-day store', () => {
  checkStore(DATA);
});

// JDPI_URL tests that deployed copy, otherwise this checkout's file. Under 30 hours: the refresh runs every 12 hours
// and starts up to an hour late, so one failed refresh leaves the data about 25 hours old and passes; two in a row fail.
test('live data: the deployed store passes the same checks and was refreshed in the last 30 hours', pageTest, async () => {
  const d = process.env.JDPI_URL ? await (await fetch(`${BASE}/briefing/data/latest.json`)).json() : DATA;
  checkStore(d);
  assert.ok((Date.now() - Date.parse(d.generated)) / 36e5 < 30, `generated ${d.generated}`);
});

test('page shows five columns and filters by topic', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/briefing#v=latest`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cols5 .col', { timeout: 20000 });
  const cols = await page.locator('.cols5 .col').count();
  const all = await page.locator('#out .story').count();
  const hardOnly = await page.locator('#hardnews').isChecked();
  const visibleSoft = await page.evaluate(() => [...document.querySelectorAll('#out .story a.t')].filter(a => D.items.find(i => i.u === a.getAttribute('href'))?.c).length);
  await page.locator('.topic[data-id="t0"]').click();
  const title = await page.locator('#viewtitle').innerText();
  await page.locator('[data-pos="far_right"]').click();
  const cols2 = await page.locator('.cols5 .col').count();
  await browser.close();
  assert.equal(cols, 5);
  assert.ok(all > 20, `stories: ${all}`);
  assert.ok(hardOnly, 'hard-news filter on by default');
  assert.equal(visibleSoft, 0, 'no soft-news stories shown while filtered');
  assert.equal(title, 'US politics');
  assert.equal(cols2, 4);
  assert.deepEqual(errors, []);
});

// Highbrowse opens a story here by its headline: #q=<words in a headline>&w=7d, which the page reads on load and again
// when the shell moves its frame by hash, and writes back as the search box and the window change.
test('page follows #q= and #w= deep links, and keeps them in its address', pageTest, async t => {
  const d = await (await fetch(`${BASE}/briefing/data/latest.json`)).json();
  // A hard-news story four to six days old: outside the page's default three days, inside the link's seven.
  const story = d.items.find(i => !i.c && Date.parse(d.generated) - Date.parse(i.p) > 100 * 36e5 && Date.parse(d.generated) - Date.parse(i.p) < 140 * 36e5);
  if (!story) { t.skip('no story four to six days old in the store'); return; }
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/briefing#w=7d&q=${encodeURIComponent(story.t.slice(0, 120))}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(`#out .story a.t[href="${story.u}"]`, { timeout: 20000 });
    assert.deepEqual([await page.inputValue('#window'), await page.inputValue('#q')], ['168', story.t.slice(0, 120)], 'a story older than three days, in the seven-day window');
    // A move by hash (as the shell makes): the page follows without reloading.
    await page.evaluate(() => { window.sameDocument = true; location.hash = '#w=24h&q=zzzz-nothing'; });
    await page.waitForFunction(() => document.querySelector('#window').value === '24' && document.querySelector('#out .prp-empty'), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.sameDocument), true);
    // Typing writes the search back to the address; the default window (3 days) is left out of it.
    await page.selectOption('#window', '72');
    await page.fill('#q', 'trump');
    assert.equal(await page.evaluate(() => location.hash), '#q=trump');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// In the shell the page keeps its frame, so a Highbrowse link often arrives after the viewer has used the page: a move
// by hash must still show the story it names (the topic, publisher and positions picked before go back to all), a link
// without a search must clear the old one, and soft=1 must show a sport, entertainment or lifestyle story, which Hard news
// only hides, on that visit, without changing the saved choice. (Each of these failed before: the story was hidden.)
test('page: a move by hash shows the story it names whatever was picked before, and soft=1 shows sport for one visit', pageTest, async t => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/briefing#v=latest`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.cols5 .col', { timeout: 20000 });
    // Pick a topic (US politics), a publisher and one position off, then link to a far-left story none of them shows.
    const pick = await page.evaluate(() => {
      const since = Date.now() - 70 * 36e5, pos = id => SRC.get(id)?.position;
      const story = D.items.find(i => !i.c && Date.parse(i.p) >= since && pos(i.s) === 'far_left' && !matches(topics[0], i));
      const other = D.items.find(i => !i.c && Date.parse(i.p) >= since && pos(i.s) === 'right');
      const soft = D.items.find(i => i.c && Date.parse(i.p) >= Date.now() - 150 * 36e5);
      return story && other && soft && { u: story.u, t: story.t, pub: other.s, soft: { u: soft.u, t: soft.t } };
    });
    if (!pick) { t.skip('no recent far-left story outside US politics, right-wing publisher or soft story in the store'); return; }
    await page.locator('.topic[data-id="t0"] button.n').click();
    await page.selectOption('#publisher', pick.pub);
    await page.locator('[data-pos="far_left"]').click();
    assert.equal(await page.locator(`#out .story a.t[href="${pick.u}"]`).count(), 0, 'the story is filtered out before the link');
    await page.evaluate(h => { location.hash = h; }, `#w=7d&q=${encodeURIComponent(pick.t.slice(0, 120))}`);
    await page.waitForSelector(`#out .story a.t[href="${pick.u}"]`, { timeout: 10000 });
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#viewtitle').textContent, document.querySelector('#publisher').value,
      [...document.querySelectorAll('#posbtns [data-pos]')].every(b => b.getAttribute('aria-pressed') === 'true')]), ['All stories', '', true]);
    // A link with no search (Highbrowse's "Open the Political Briefing") clears the one before.
    await page.evaluate(() => { location.hash = '#w=24h'; });
    await page.waitForFunction(() => document.querySelector('#window').value === '24', null, { timeout: 10000 });
    assert.equal(await page.inputValue('#q'), '');
    // soft=1: a lifestyle, entertainment or sport story shows, Hard news only is off for this visit and still saved on.
    const { soft } = pick;
    await page.evaluate(h => { location.hash = h; }, `#w=7d&q=${encodeURIComponent(soft.t.slice(0, 120))}&soft=1`);
    await page.waitForSelector(`#out .story a.t[href="${soft.u}"]`, { timeout: 10000 });
    assert.deepEqual([await page.isChecked('#hardnews'), await page.evaluate(() => localStorage.getItem('jdpi.briefing.hideSoft'))], [false, null]);
    // Ticking Hard news only again is a choice: saved, and the address no longer says soft=1.
    await page.check('#hardnews');
    assert.deepEqual([await page.evaluate(() => localStorage.getItem('jdpi.briefing.hideSoft')), await page.evaluate(() => location.hash.includes('soft'))], ['1', false]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

/* ---- Top stories (Jude, 15 November 2026, HL-08: "top stories" like Omni News, and the top stories of each of the five
   positions). The grouping is Highbrowse's own code (highbrowse/analysis.js: buildModel on the four briefings' stores,
   then politicalTops and rankTops), so the same headlines make the same story on both pages. A fixed week: ten
   publishers, two a position, c1 behind a paywall and l2 metered, five stories and forty headlines on their own. */
import { buildModel, digest, politicalTops, rankTops, isFree as hbFree, POSITIONS as HB_POSITIONS, POSITION_LABELS as HB_LABELS } from '../highbrowse/analysis.js';
const TH = 36e5, TNOW = Date.parse('2026-11-16T12:00:00Z');
const tAgo = (h, now = TNOW) => new Date(now - h * TH).toISOString();
const TSRC = [['fl1', 'far_left'], ['fl2', 'far_left'], ['l1', 'left'], ['l2', 'left'], ['c1', 'centre'], ['c2', 'centre'], ['r1', 'right'], ['r2', 'right'], ['fr1', 'far_right'], ['fr2', 'far_right']]
  .map(([id, position]) => ({ id, name: id.toUpperCase() + ' News', position, country: 'US', caution: id === 'fr2', active: true, reserve: false, status: 'ok' }));
const TACCESS = { sources: [{ keys: ['political:c1'], class: 'paid', name: 'C1 News', hosts: ['c1.example'] }, { keys: ['political:l2'], class: 'metered', name: 'L2 News', hosts: ['l2.example'] }] };
function topsWeek(now = TNOW) {
  const pol = (s, t, h, extra = {}) => ({ s, t, u: `https://${s}.example/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, p: tAgo(h, now), d: '', ...extra });
  const items = [
    // Hallworth: seven publishers, every position, 3 to 9 hours ago (and a sport headline, left out)
    // (c1, paid, words its headline as fl1 does and is older, so it is the most typical: a free one must still lead)
    pol('fl1', 'Senate passes Hallworth shutdown deal', 3), pol('l1', 'Hallworth shutdown deal passes the Senate', 4), pol('c1', 'Senate passes Hallworth shutdown deal', 5),
    pol('c2', 'Hallworth shutdown deal clears Senate', 6), pol('r1', 'Hallworth shutdown deal through Senate', 7), pol('r2', 'Senate backs Hallworth shutdown deal', 8), pol('fr1', 'Hallworth shutdown deal: Senate votes yes', 9),
    pol('r2', 'Hallworth shutdown deal sponsor buys football club', 2, { c: 's' }),
    // Brennick: four publishers, right and far right only, the newest 2 hours ago
    pol('r1', 'Massie files Brennick impeachment articles', 2), pol('r2', 'Brennick impeachment articles filed by Massie', 10), pol('fr1', 'Massie Brennick impeachment articles', 11), pol('fr2', 'Brennick impeachment articles: Massie acts', 12),
    // Zorvex: four publishers, far left and left only, the newest 5 hours ago
    pol('fl1', 'Mamdani freezes Zorvex transit fares', 5), pol('fl2', 'Zorvex transit fares frozen by Mamdani', 13), pol('l1', 'Mamdani Zorvex transit fares freeze', 14), pol('l2', 'Zorvex transit fares: Mamdani freeze', 15),
    // Vantor: two publishers, neither free (c1 paid, l2 metered), 17 and 16 hours ago. The two headlines carry the same
    // terms, so they are as typical as each other and the older, c1's, leads.
    pol('c1', 'Vantor pension fund sues Brexley bank', 17), pol('l2', 'Brexley bank sued by Vantor pension fund', 16),
    // Quillon: two centre publishers, 30 and 31 hours ago; c1 is paid
    pol('c1', 'Quillon refinery fire forces evacuation', 30), pol('c2', 'Quillon refinery fire evacuation ordered', 31),
    pol('fr2', 'Local fair opens with pumpkin contest', 1),
    ...Array.from({ length: 40 }, (_, k) => pol(TSRC[k % 10].id, `Zeta${k} meets omega${k}`, 30 + k)),
  ].sort((a, b) => (a.p < b.p ? 1 : -1));
  return { generated: tAgo(1, now), keepDays: 7, perPosition: 10, positions: HB_POSITIONS.map(key => ({ key, label: HB_LABELS[key] })), sources: TSRC, items };
}
const TM = buildModel([topsWeek(), null, null, null], { now: TNOW, access: globalThis.PRPAccess.table(TACCESS) });
const tag = s => (s.lead.t.match(/Hallworth|Brennick|Zorvex|Vantor|Quillon/) || ['?'])[0];

test('top stories: ranked by the publishers that ran them, a tie to the newer headline; two publishers at least', () => {
  const top = rankTops(politicalTops(TM, '3d'));
  assert.deepEqual(top.map(tag), ['Hallworth', 'Brennick', 'Zorvex', 'Vantor', 'Quillon']);
  assert.deepEqual(top.map(s => s.publishers), [7, 4, 4, 2, 2]);
  assert.ok(top[1].last > top[2].last && top[1].headlines === top[2].headlines, 'Brennick passes Zorvex on its newer headline');
  assert.deepEqual(rankTops(politicalTops(TM, '24h')).map(tag), ['Hallworth', 'Brennick', 'Zorvex', 'Vantor'], 'Quillon ran 30 hours ago');
  assert.equal(top[0].headlines, 7, 'the sport headline is left out, as Hard news only does');
  assert.ok(top[0].entries.every(e => !/football/.test(e.item.t)));
  assert.deepEqual(HB_POSITIONS.map(p => top[0].positions[p]), [1, 1, 2, 2, 1]);
});

// Two headlines made of the same terms in another order are as typical as each other, whatever the order their terms
// are added up in: the sums differ in the last binary digit, and the browser and Node need not agree which is the larger
// (refresh run 44326050282, 18 November 2026: the page led with one Hill headline, this file's model with the other).
test('top stories: headlines of the same terms in another order tie, and the older is the more typical', () => {
  const W = ['bral', 'drim', 'fost', 'gulp', 'hask', 'jolm', 'kerv', 'lund', 'mirb', 'nopt'];
  const items = [];
  for (let k = 0; k < 26; k++) {
    const [a, b, c, d, e, f, g, h, i, j] = W.map(w => `${w}${String.fromCharCode(97 + k)}ux`);
    const at = n => tAgo(2 + k + n), it = (s, t, p) => items.push({ s, t, u: `https://${s}.example/${t.replace(/ /g, '-')}`, p, d: '' });
    // the two under test, the older now in one order of words, now in the other; three more of the story, so that its
    // four terms differ in how many headlines carry them
    it('l1', k % 2 ? `${a} ${b} ${c} ${d}` : `${d} ${c} ${b} ${a}`, at(0.5)); it('r1', k % 2 ? `${d} ${c} ${b} ${a}` : `${a} ${b} ${c} ${d}`, at(0));
    it('c2', `${a} ${b} ${c} ${e}`, at(0.1)); it('fr1', `${a} ${b} ${f} ${g}`, at(0.2)); it('fl1', `${a} ${h} ${i} ${j}`, at(0.3));
  }
  const store = { generated: tAgo(1), keepDays: 7, perPosition: 10, positions: HB_POSITIONS.map(key => ({ key, label: HB_LABELS[key] })), sources: TSRC, items };
  const M = buildModel([store, null, null, null], { now: TNOW, access: globalThis.PRPAccess.table({ sources: [] }) });
  const tops = politicalTops(M, '3d');
  let pairs = 0;
  for (const s of tops) {
    const older = s.entries.find(x => x.item.sid === 'l1'), newer = s.entries.find(x => x.item.sid === 'r1');
    if (!older || !newer) continue;
    pairs++;
    assert.ok(older.rank < newer.rank, `${older.item.t}: the older of two headlines with the same terms comes first (ranks ${older.rank} and ${newer.rank})`);
  }
  assert.equal(pairs, 26, 'every pair is in one story');
});

test('top stories: each position\'s list counts only its own publishers, needs two of them, and leads with its own headline', () => {
  const tops = politicalTops(TM, '3d');
  const by = Object.fromEntries(HB_POSITIONS.map(p => [p, rankTops(tops, { position: p })]));
  assert.deepEqual(Object.fromEntries(HB_POSITIONS.map(p => [p, by[p].map(tag)])),
    { far_left: ['Zorvex'], left: ['Zorvex'], centre: ['Hallworth', 'Quillon'], right: ['Hallworth', 'Brennick'], far_right: ['Brennick'] },
    'Hallworth, with one far-left publisher, is not on the far left\'s list; on the right it beats Brennick (two each) on seven publishers to four');
  assert.deepEqual(Object.fromEntries(HB_POSITIONS.map(p => [p, by[p].map(s => s.lead.sid)])),
    { far_left: ['fl1'], left: ['l1'], centre: ['c2', 'c2'], right: ['r2', 'r2'], far_right: ['fr1'] },
    'c1 is paid, so c2 leads both centre stories; Brennick\'s r1 and r2 are as typical as each other, and a tie goes to the first headline, as on Highbrowse');
  for (const p of HB_POSITIONS) for (const s of by[p]) {
    assert.equal(s.lead.pos, p, `${p}: its own headline leads`);
    assert.equal(s.count, s.positions[p], `${p}: ranked by its own publishers`);
  }
});

test('top stories: free sources lead, and a story only paywalled publishers ran never comes first', () => {
  const tops = politicalTops(TM, '3d');
  const kept = rankTops(tops, { keep: s => /Vantor|Quillon/.test(s.entries[0].item.t) });
  assert.deepEqual(kept.map(tag), ['Quillon', 'Vantor'], 'Vantor ranks first on its newer headline, but no one can read it free');
  assert.equal(kept[1].lead.acc, 'paid');
  assert.equal(kept[1].free, false);
  assert.equal(kept[1].alt, null, 'no free headline of Vantor exists: none is offered');
  const hall = rankTops(tops)[0];
  assert.equal(hall.entries[0].item.sid, 'c1', 'the paid headline is the most typical of Hallworth');
  assert.notEqual(hall.lead.sid, 'c1', 'but a free one leads');
  assert.equal(hall.entries[0].alt?.sid, hall.lead.sid, 'and stands beside it');
  const q = kept[0], c1 = q.entries.find(e => e.item.sid === 'c1');
  assert.equal(q.lead.sid, 'c2');
  assert.equal(c1.alt?.sid, 'c2', 'beside the paid headline, the same story\'s free one');
  for (const s of rankTops(tops)) assert.equal(s.free, hbFree(s.lead));
  for (const p of [null, ...HB_POSITIONS]) { const l = rankTops(tops, { position: p }); if (l.some(s => s.free)) assert.ok(l[0].free, `${p || 'all'}: a free story first`); }
});

// An article two briefings carry, worded differently in each (review X1, 16 November 2026: the BBC's Microsoft outage
// headline led on the rank of its Digital Briefing copy's wording): the Political Briefing's own headline is the one
// shown, so it is ranked by how typical that headline is, not by the other copy's.
test('top stories: an article in two briefings is ranked by the political headline the page shows, not the other briefing\'s wording', () => {
  const week = topsWeek(), r1 = week.items.find(i => i.s === 'r1' && /Hallworth/.test(i.t));
  const digital = { generated: tAgo(1), keepDays: 7, fields: [], sources: [{ id: 'r1d', outlet: 'R1 News' }],
    items: [{ id: 'd1', title: 'Senate passes Hallworth shutdown deal', url: r1.u, published: tAgo(10), source: 'r1d', fields: [] }] };
  const M = buildModel([week, null, null, digital], { now: TNOW, access: globalThis.PRPAccess.table(TACCESS) });
  const tops = politicalTops(M, '3d'), hall = tops.find(s => s.entries.some(e => /Hallworth/.test(e.item.t)));
  assert.ok(hall.entries.every(e => e.item.b === 'political'), 'its political headlines alone');
  assert.equal(hall.entries.find(e => e.item.sid === 'r1').item.t, 'Hallworth shutdown deal through Senate', 'r1\'s own headline is the one shown');
  assert.equal(hall.entries[0].item.sid, 'c1', 'the most typical political headline is still c1\'s, not r1\'s, whose digital copy words it as c1 does');
  assert.deepEqual(hall.entries.map(e => e.rank), hall.entries.map((e, k) => k));
  assert.equal(rankTops(tops)[0].lead.sid, 'l1', 'the most typical free political headline leads (l1 words it as c1 does, and is older than fl1)');
  assert.equal(rankTops(tops, { position: 'right' }).find(s => s.id === hall.id).lead.sid, 'r2', 'and on the right r2\'s, as typical as r1\'s own wording and older');
});

// On the committed stores: Top stories is quick enough to run in the browser, and counts exactly what Highbrowse's
// spread table counts (the same groups from the same four stores).
test('top stories: on the committed stores, quick, and the same publishers and positions as Highbrowse\'s spread table', () => {
  const J = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
  const stores = ['briefing/data/latest.json', 'science/briefing/data/stories.json', 'econ/briefing/data/stories.json', 'digital/briefing/data/stories.json'].map(J);
  const access = globalThis.PRPAccess.table(J('design/prp-access.json'));
  const t0 = performance.now();
  const M = buildModel(stores, { now: Date.parse(stores[0].generated), access });
  const tops = politicalTops(M, '3d');
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `grouping and Top stories took ${Math.round(ms)} ms`);
  const top = rankTops(tops), d = digest(M, '3d', { stories: 1e6 });
  assert.ok(top.length >= 5, `${top.length} top stories`);
  const same = d.stories.find(s => s.id === top[0].id);
  assert.ok(same, 'the first top story is one of Highbrowse\'s stories');
  assert.deepEqual([top[0].publishers, top[0].positions], [same.publishers, same.positions]);
  for (const s of d.spread.stories) {
    const t = tops.find(x => x.id === s.id);
    assert.ok(t, `${s.lead.t}: in Top stories`);
    assert.deepEqual([t.publishers, t.positions], [s.publishers, s.positions], s.lead.t);
  }
  assert.ok(top[0].free, 'a free headline leads');
});

// The second grouping pass (analysis.js, attachSmall), on real headlines of 13 to 15 November 2026: a headline that words
// a story differently, as comment and the far left's often do, is counted with it, so no position looks as if it passed
// over a story it ran (review findings R1-01 to R1-04). Words of their own around them, as rare as in a real week.
test('top stories: a story worded differently is still one story, so the far left counts Van Hollen and Miami is not the far right\'s alone', () => {
  const NOW = Date.parse('2026-11-16T04:00:00Z');
  const S = { far_left: ['commondreams', 'thenation'], left: ['guardian', 'independent'], centre: ['upi', 'euronews', 'bbc'], right: ['nypost', 'washingtonexaminer'], far_right: ['gatewaypundit', 'wnd', 'oann', 'amgreatness'] };
  const sources = Object.entries(S).flatMap(([position, ids]) => ids.map(id => ({ id, name: id, position, country: 'US', caution: false, active: true, reserve: false, status: 'ok' })));
  const pol = (s, t, h) => ({ s, t, u: `https://${s}.example/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, p: tAgo(h, NOW), d: '' });
  const items = [
    pol('oann', 'Van Hollen announces bid to challenge Schumer for Senate Dem leader role', 52), pol('amgreatness', 'Van Hollen Launches Bid to Topple Schumer as Senate Democrat Leader', 66),
    pol('upi', 'Van Hollen announces run for Democratic Senate leader', 69), pol('euronews', 'US senator Chris Van Hollen to challenge Chuck Schumer for Senate majority leader', 71),
    pol('commondreams', 'Our Revolution Endorses Chris Van Hollen for Senate Majority Leader', 57), pol('nypost', 'Dem Sen. Chris Van Hollen boasts he has ‘very open lane’ to take Senate leadership from Schumer', 10),
    pol('independent', 'Democratic civil war erupts as Van Hollen challenges Chuck Schumer for Senate Majority Leader', 70), pol('bbc', 'Van Hollen to challenge Schumer for Senate leader', 68),
    pol('thenation', 'Why Progressives Are Backing Chris Van Hollen', 60),
    // The week's other airport headlines (the FAA's ground stop), so "airport" is no rarer than in the real week
    // and its other Senate and leaders' headlines, so "senate" and "leader" are as common as they were
    pol('upi', 'Senate passes defence bill', 26), pol('guardian', 'Labour leader faces party revolt', 27), pol('oann', 'Senate Republicans block nominee', 28),
    pol('euronews', 'EU leaders meet in Brussels', 29), pol('wnd', 'Senate leader sets vote on funding bill', 31), pol('independent', 'Opposition leader quits after poll defeat', 34),
    pol('upi', 'Airport chaos began long before the ground stop', 30), pol('nypost', 'Travellers stranded at airport after ground stop', 33), pol('oann', 'Airport lines stretch for hours on second day', 40),
    pol('guardian', 'Two planes collide on taxiway at Miami airport', 12), pol('independent', 'Two planes collide while taxiing at Miami International Airport', 11),
    pol('upi', '2 planes collide while taxiing at Miami International Airport', 13), pol('euronews', 'Planes collide on taxiway at Miami airport', 14),
    pol('washingtonexaminer', 'Two planes collide on Miami airport taxiway', 15),
    pol('gatewaypundit', 'UPS Boeing 767 Cargo Plane COLLIDES with Copa Airlines Passenger Jet at Miami International Airport', 15), pol('wnd', '‘Somebody hit us’: Watch Boeing 737 passenger jet collide with UPS 767 plane in Miami', 14),
    // Not the same stories: one shared name, or the same names five days before
    pol('guardian', 'Chris Evans to star in a film shot in Miami', 20), pol('thenation', 'Van Hollen backs the farm bill', 150),
    ...Array.from({ length: 300 }, (_, k) => pol(sources[k % sources.length].id, `Zeta${k} meets omega${k}`, 20 + (k % 140))),
  ].sort((a, b) => (a.p < b.p ? 1 : -1));
  const store = { generated: tAgo(1, NOW), keepDays: 7, perPosition: 10, positions: HB_POSITIONS.map(key => ({ key, label: HB_LABELS[key] })), sources, items };
  const tops = attach => politicalTops(buildModel([store, null, null, null], { now: NOW, attach }), '3d');
  const story = (list, re) => list.find(s => s.entries.some(e => re.test(e.item.t)));
  const all = tops(true), far = rankTops(all, { position: 'far_left' }), fr = rankTops(all, { position: 'far_right' });
  const hollen = story(far, /Progressives Are Backing/);
  assert.ok(hollen, 'the far left\'s list has the Van Hollen story: Common Dreams and The Nation ran it');
  assert.equal(hollen.count, 2);
  assert.equal(story(all, /Van Hollen/).publishers, 8);
  assert.ok(!story(all, /Van Hollen/).entries.some(e => /farm bill/.test(e.item.t)), 'five days before the story, its names alone do not join it');
  const miami = story(fr, /Copa Airlines/);
  assert.ok(miami && miami.count === 2, 'the far right\'s Miami story');
  assert.deepEqual(HB_POSITIONS.map(p => miami.positions[p]), [0, 2, 2, 1, 2], 'and the left, centre and right publishers that ran it beside it');
  assert.ok(!miami.entries.some(e => /Chris Evans/.test(e.item.t)), 'one shared name is not a story');
  // Without the second pass, the far left had no story and the far right's Miami story stood alone: what the pass fixes.
  const before = tops(false);
  assert.ok(!story(rankTops(before, { position: 'far_left' }), /Van Hollen/));
  assert.equal(story(rankTops(before, { position: 'far_right' }), /Copa Airlines/)?.publishers, 2);
});

/* ---- its summaries (integration/scripts/heads.mjs): latest.head.json, trends.json and history.json, written by the build with
   the store and committed with it; checked here too, so a refresh never commits one out of step. */
import { checkHeads as checkSummaries } from '../integration/scripts/heads.mjs';
import { readFileSync as readSummary } from 'node:fs';
test('its head, trends.json and history.json are in step with the store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('briefing/data/latest.json'), [], 'run node integration/scripts/heads.mjs briefing/data/latest.json');
  const J = f => JSON.parse(readSummary(new URL('../' + f, import.meta.url), 'utf8'));
  const store = J('briefing/data/latest.json'), head = J('briefing/data/latest.head.json'), t = J('briefing/data/trends.json'), h = J('briefing/data/history.json');
  assert.equal(head.generated, store.generated); assert.equal(head.stories, store.items.length);
  assert.equal(t.generated, store.generated); assert.ok(['ok', 'short', 'week'].includes(t.status), t.status);
  assert.deepEqual(t.topics.map(x => x.id), ['us-politics', 'ukraine-russia', 'middle-east', 'china', 'uk-politics', 'europe', 'economy', 'immigration', 'ai-tech', 'climate-energy']);
  for (const x of t.topics) if (t.status !== 'ok') assert.equal(x.trend, null, 'no trend without enough history');
  for (const [d, v] of Object.entries(h.history.days)) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isInteger(v.n) && typeof v.ok === 'boolean', d);
});

// Beside the publisher counts (the review of 12 November 2026): equal numbers of publishers are neither equal numbers of
// stories nor a balance of facts. The note gives the store's own fewest and most stories by position, so it is true of
// whatever store the page reads; Figure 1's caption says the same beside the shares. A headline sent in TeX reads in
// plain characters here too (design/prp-tex.js).
test('page: the publisher counts say they are not equal stories or a balance of facts, from the store\'s own counts', pageTest, async () => {
  const d = await (await fetch(`${BASE}/briefing/data/latest.json`)).json();
  const pos = new Map(d.sources.map(s => [s.id, s.position])), n = new Map(d.positions.map(p => [p.key, 0]));
  for (const i of d.items) n.set(pos.get(i.s), n.get(pos.get(i.s)) + 1);
  const by = d.positions.map(p => [p.label.toLowerCase(), n.get(p.key)]).sort((a, b) => a[1] - b[1]);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/briefing?tab=publishers`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#balance')?.textContent.length > 0, null, { timeout: 20000 });
    const note = await page.textContent('#balance');
    assert.match(note, /^Equal numbers of publishers are not equal numbers of stories: /);
    assert.ok(note.includes(`${by[0][1].toLocaleString('en-GB')} stories from the ${by[0][0]}`) && note.includes(`${by.at(-1)[1].toLocaleString('en-GB')} from the ${by.at(-1)[0]}`), note);
    assert.match(note, /Nor are they a balance of facts: the briefing counts and sorts headlines by their publishers' slant, and does not check what any story says\.$/);
    assert.ok(await page.isVisible('#balance'), 'shown');
    assert.ok(await page.evaluate(() => { const b = document.querySelector('#balance'); return b.previousElementSibling.querySelector('#srcmeta') && b.nextElementSibling.classList.contains('tablewrap'); }), 'beside the counts: under the catalogue\'s head, above its table');
    assert.match(await page.textContent('.coverage figcaption'), /balanced by their numbers of publishers, not of stories, and neither is a balance of facts/);
    const story = await page.evaluate(() => storyHtml({ ...D.items[0], t: 'Decay of $^{224}\\mathrm{Ra}$ for $5', d: '' }, false));
    assert.match(story, /Decay of ²²⁴Ra for \$5/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

/* ---- Top stories on the page (HL-08). Each test builds the same model here, from the same stores, with the page's own
   clock (TOPINFO.now), and holds the page to it. */
const STORES = ['briefing/data/latest.json', 'science/briefing/data/stories.json', 'econ/briefing/data/stories.json', 'digital/briefing/data/stories.json'];
const POS_ORDER = ['far_left', 'left', 'centre', 'right', 'far_right'];
async function openTop(browser, path, { width = 1440, height = 900, dark = false, routes = {}, init = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (init) await page.addInitScript(init);
  for (const [glob, body] of Object.entries(routes)) await page.route(glob, r => r.fulfill({ json: body }));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { page, errors };
}
const topsReady = (page, w = '3d') => page.waitForFunction(x => document.documentElement.dataset.tops === x, w, { timeout: 60000 });
// The model the page should show: the stores it read (fetched here from the same site, or the fixtures it was served).
async function expected(page, stores, accessDoc, w = '3d') {
  const now = await page.evaluate(() => TOPINFO.now);
  const M = buildModel(stores, { now, access: globalThis.PRPAccess.table(accessDoc) });
  const tops = politicalTops(M, w);
  return { all: rankTops(tops), by: Object.fromEntries(POS_ORDER.map(p => [p, rankTops(tops, { position: p })])) };
}
const siteStores = async () => Promise.all(STORES.map(f => fetch(`${BASE}/${f}`).then(r => r.json())));
const siteAccess = async () => (await fetch(`${BASE}/design/prp-access.json`)).json();
// The fixed week, served in place of the data: the other three briefings empty, the small access table.
function fixtureRoutes(now = Date.now()) {
  const empty = { generated: new Date(now - TH).toISOString(), keepDays: 7, sources: [], items: [], fields: [], disciplines: [] };
  return { '**/briefing/data/latest.json': topsWeek(now), '**/science/briefing/data/stories.json': empty, '**/econ/briefing/data/stories.json': empty,
    '**/digital/briefing/data/stories.json': empty, '**/design/prp-access.json': TACCESS };
}
const fixtureStores = routes => STORES.map(f => routes['**/' + f]);
const tabSelected = page => page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').id);

test('page: opens on Top stories, ten at most, ranked as the model ranks them, with each position\'s own five and the rule beside them', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing');
    await topsReady(page);
    const want = await expected(page, await siteStores(), await siteAccess());
    assert.equal(await tabSelected(page), 'tabbtn-top');
    assert.ok(await page.isVisible('#tab-top') && !(await page.isVisible('#tab-stories')), 'Top stories shown, Latest not');
    const cards = page.locator('#topout .tcard');
    assert.equal(await cards.count(), Math.min(10, want.all.length));
    assert.deepEqual(await page.$$eval('#topout .tcard h3 a.t', as => as.map(a => a.getAttribute('href'))), want.all.slice(0, 10).map(s => s.lead.u), 'the model\'s stories and leads, in its order');
    // The first card: its publishers, headlines and the five positions' counts.
    const s = want.all[0];
    assert.equal(await page.textContent('#topout .tcard.lead .pubs'), `${s.publishers.toLocaleString('en-GB')} publishers · ${s.headlines.toLocaleString('en-GB')} headlines`);
    assert.deepEqual(await page.$$eval('#topout .tcard.lead .tc-pos [data-pos]', xs => xs.map(x => [x.dataset.pos, Number(x.querySelector('b').textContent)])), POS_ORDER.map(p => [p, s.positions[p]]));
    // Five columns, in the data's order, each with its first five and a sentence when it has fewer.
    assert.deepEqual(await page.$$eval('#poscols .poscol', cs => cs.map(c => c.dataset.pos)), POS_ORDER);
    for (const p of POS_ORDER) {
      const col = page.locator(`#poscols .poscol[data-pos="${p}"]`), list = want.by[p];
      assert.equal(await col.locator('.pcard').count(), Math.min(5, list.length), p);
      if (list.length) assert.equal(await col.locator('.pcard h4 a.t').first().getAttribute('href'), list[0].lead.u, `${p}: led by its own headline`);
      assert.equal(await col.locator('.pnote').count(), list.length < 5 ? 1 : 0, `${p}: a short list says so`);
      // What VM grouped, never what the publishers ran (review R1-01, R1-06)
      if (list.length && list.length < 5) assert.match(await col.locator('.pnote').textContent(), /^VM grouped only \w+ (story|stories) that two or more [\w-]+ publishers ran in the last 3 days\.$/);
      if (!list.length) assert.match(await col.locator('.pnote').textContent(), /^VM grouped no story that two or more [\w-]+ publishers ran in the last 3 days\. Headlines worded differently, as comment often is, may not be grouped: its headlines are in Latest ›$/);
    }
    // Beside the list: a count, not a judgement; and the rule, in plain words, with the window shown.
    assert.match(await page.textContent('.top-sub'), /a count, not a judgement of how important it is/);
    await page.click('[data-how]');
    assert.ok(await page.evaluate(() => document.querySelector('#how').open));
    const note = await page.textContent('#hownote');
    for (const words of ['not a judgement of how important', 'the last 3 days', 'at least two publishers', 'a tie goes to more headlines, then to the newer headline', 'Sport, entertainment and lifestyle are left out', 'not accuracy', 'briefing/data/latest.json'])
      assert.ok(note.includes(words), words);
    const ms = await page.evaluate(() => TOPINFO.ms['3d']);
    assert.ok(ms.build < 4000, `grouping took ${Math.round(ms.build)} ms`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('page: every address that opened the page still opens the same view; a search opens Latest, a window alone Top stories', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const d = await (await fetch(`${BASE}/briefing/data/latest.json`)).json();
    const story = d.items.find(i => !i.c);
    const { page, errors } = await openTop(browser, `q/briefing#w=7d&q=${encodeURIComponent(story.t.slice(0, 120))}`);
    await page.waitForSelector(`#out .story a.t[href="${story.u}"]`, { timeout: 20000 });
    assert.equal(await tabSelected(page), 'tabbtn-stories', 'Highbrowse\'s story link opens Latest');
    for (const q of ['?tab=publishers', '?tab=sources']) {
      await page.goto(`${BASE}/q/briefing${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#srcrows tr'), null, { timeout: 20000 });
      assert.deepEqual([await tabSelected(page), await page.isVisible('#tab-publishers'), await page.isVisible('#storyviews')], ['tabbtn-publishers', true, false], q);
    }
    // A move by hash leaves the catalogue for the view it names (here Top stories over 24 hours).
    await page.evaluate(() => { location.hash = '#w=24h'; });
    await topsReady(page, '24h');
    assert.deepEqual([await tabSelected(page), await page.inputValue('#window'), await page.textContent('#toptitle')], ['tabbtn-top', '24', 'Top stories · Last 24 hours']);
    await page.goto(`${BASE}/q/briefing#w=24h`, { waitUntil: 'domcontentloaded' });
    await topsReady(page, '24h');
    assert.equal(await tabSelected(page), 'tabbtn-top', 'Highbrowse\'s "Open the Political Briefing" opens Top stories');
    // The view is written only when it is not the address's default.
    await page.click('#tabbtn-stories');
    assert.equal(await page.evaluate(() => location.hash), '#v=latest&w=24h');
    await page.fill('#q', 'trump');
    assert.equal(await page.evaluate(() => location.hash), '#w=24h&q=trump');
    await page.click('#tabbtn-top');
    assert.equal(await page.evaluate(() => location.hash), '#v=top&w=24h&q=trump');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('page: "Compare the positions" opens Latest\'s columns on the story, and Back returns to Top stories', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing');
    await topsReady(page);
    // A card whose lead its search finds, among few enough headlines that every column shows them.
    const pick = await page.evaluate(() => [...document.querySelectorAll('#topout .tcard')].map(c => {
      const q = new URLSearchParams(c.querySelector('a.cmp').getAttribute('href').slice(1)).get('q'), lead = c.querySelector('h3 a.t');
      const hits = windowed().filter(i => i.t.toLowerCase().includes(q));
      return { id: c.dataset.story, q, href: lead.getAttribute('href'), lead: D.items.find(i => i.u === lead.getAttribute('href')), most: Math.max(0, ...D.positions.map(p => hits.filter(i => SRC.get(i.s).position === p.key).length)) };
    }).find(x => x.lead && x.lead.t.toLowerCase().includes(x.q) && x.most <= 12));
    assert.ok(pick, 'a card to compare');
    await page.click(`#topout .tcard[data-story="${pick.id}"] a.cmp`);
    await page.waitForSelector(`#out .cols5 a.t[href="${pick.href}"]`, { timeout: 10000 });
    assert.deepEqual([await tabSelected(page), await page.inputValue('#q'), await page.locator('#out .cols5 .col').count()], ['tabbtn-stories', pick.q, 5]);
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#tabbtn-top').getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
    assert.equal(await page.inputValue('#q'), '');
    assert.ok(await page.isVisible(`#topout .tcard[data-story="${pick.id}"]`));
    // With a topic picked, by the keyboard: Latest shows exactly the story's headlines, the focus lands on its title, and
    // Back puts back the reader's topic, its match count and the link they followed (review R2-02, R2-08, R1 of the
    // regressions; Compare once matched any headline containing its words).
    await page.click('.topic[data-id="t0"] button.n');
    await page.waitForFunction(() => /match$/.test(document.querySelector('#topcount').textContent));
    const before = await page.textContent('#topcount');
    const story = await page.evaluate(() => [...document.querySelectorAll('#topout .tcard')].map(c => {
      const s = TOPS[wKey()].find(x => x.id === c.dataset.story), urls = [...new Set(s.entries.map(e => e.item.u))];
      const most = Math.max(...D.positions.map(p => s.entries.filter(e => e.item.pos === p.key).length));
      return { id: s.id, urls, most };
    }).filter(x => x.most <= 12).at(-1));
    assert.ok(story, 'a card under the topic');
    await page.focus(`#topout .tcard[data-story="${story.id}"] a.cmp`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#tabbtn-stories').getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
    const shown = await page.$$eval('#out .cols5 a.t', as => as.map(a => a.getAttribute('href')));
    assert.deepEqual([...shown].sort(), [...story.urls].sort(), 'the story\'s own headlines, and only those');
    assert.match(await page.textContent('#viewtitle'), /^One story: /);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'viewtitle');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#tabbtn-top').getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
    assert.deepEqual([await page.textContent('#topicname'), await page.textContent('#topcount')], ['US politics', before]);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.tcard')?.dataset.story), story.id, 'the focus is back on the link it left from');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Review X3 (16 November 2026): Compare once opened the story in whatever layout Latest was left in, so a reader who had
// picked Stream got a stream, not the positions side by side. It opens the balanced columns, and the reader's own layout
// comes back when they leave the story.
test('page: "Compare the positions" opens the balanced columns even after Stream was picked, and Stream comes back after', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing', { routes: fixtureRoutes() });
    await topsReady(page);
    await page.click('#tabbtn-stories');
    await page.selectOption('#view', 'stream');
    await page.waitForSelector('#out .stream');
    await page.click('#tabbtn-top');
    const id = await page.getAttribute('#topout .tcard.lead', 'data-story');
    await page.click(`#topout .tcard[data-story="${id}"] a.cmp`);
    await page.waitForFunction(() => /^One story: /.test(document.querySelector('#viewtitle').textContent), null, { timeout: 10000 });
    assert.deepEqual([await tabSelected(page), await page.inputValue('#view'), await page.locator('#out .cols5 .col').count(), await page.locator('#out .stream').count()],
      ['tabbtn-stories', 'balanced', 5, 0], 'the story in the balanced columns, and the layout choice says so');
    // Back returns to Top stories; Latest is then as the reader left it, in Stream.
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#tabbtn-top').getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
    await page.click('#tabbtn-stories');
    assert.deepEqual([await page.inputValue('#view'), await page.locator('#out .stream').count()], ['stream', 1]);
    // Leaving the story by "Show all headlines" puts Stream back too; a layout the reader picks on the story stands.
    await page.click('#tabbtn-top');
    await page.click(`#topout .tcard[data-story="${id}"] a.cmp`);
    await page.waitForSelector('#out .cols5', { timeout: 10000 });
    await page.click('#storynote [data-allstories]');
    assert.deepEqual([await page.inputValue('#view'), await page.locator('#out .stream').count()], ['stream', 1]);
    await page.click('#tabbtn-top');
    await page.click(`#topout .tcard[data-story="${id}"] a.cmp`);
    await page.waitForSelector('#out .cols5', { timeout: 10000 });
    await page.selectOption('#view', 'stream');
    await page.waitForSelector('#out .stream');
    await page.click('#storynote [data-allstories]');
    assert.equal(await page.inputValue('#view'), 'stream');
    await page.selectOption('#view', 'balanced');
    await page.click('#tabbtn-top');
    await page.click(`#topout .tcard[data-story="${id}"] a.cmp`);
    await page.waitForSelector('#out .cols5', { timeout: 10000 });
    await page.click('#storynote [data-allstories]');
    assert.equal(await page.inputValue('#view'), 'balanced', 'a reader who left Latest in the columns keeps them');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Review X2 (16 November 2026): a card once listed at most 80 of its other headlines, so a story of 126 headlines showed
// 81 with nothing to say so. Every headline the card counts can be reached.
test('page: a Top stories card lists every headline it counts, however many', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing', { routes: fixtureRoutes() });
    await topsReady(page);
    const got = await page.evaluate(() => {
      const s = RANK(TOPS[wKey()])[0], e = s.others[0];
      const others = Array.from({ length: 140 }, (_, k) => ({ ...e, item: { ...e.item, u: `${e.item.u}-${k}`, t: `${e.item.t} ${k}` } }));
      const big = { ...s, others, headlines: others.length + 1 };
      const box = document.createElement('div');
      return [0, 3].map(k => {
        box.innerHTML = topCard(big, k);
        const links = [...box.querySelectorAll('h3 a.t, .tc-list a.h')].map(a => a.getAttribute('href'));
        return { links: links.length, distinct: new Set(links).size, said: box.querySelector('.pubs').textContent, more: box.querySelector('details summary')?.textContent };
      });
    });
    for (const g of got) {
      assert.deepEqual([g.links, g.distinct], [141, 141], 'the lead and all 140 others');
      assert.match(g.said, / · 141 headlines$/);
    }
    assert.deepEqual(got.map(g => g.more), ['135 more headlines', '137 more headlines']);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The same in Latest: "Show N more" once stopped at 200 a column (400 in the stream) and then did nothing, however many
// it said were left. Each press shows the next ones, and says how many.
test('page: Latest\'s "Show more" reaches every headline, a step at a time, and says how many it adds', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing#v=latest&w=7d');
    await page.waitForSelector('#out .cols5 .col');
    // The biggest column (the columns are the positions in the data's order, all five on).
    const { idx, pos, n } = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('#out .cols5 .col')].map((c, k) => ({ idx: k + 1, pos: D.positions[k].key, n: Number(c.querySelector('h3 span:last-child').textContent.replace(/,/g, '')) }));
      return cols.sort((a, b) => b.n - a.n)[0];
    });
    assert.ok(n > 400, `a column of more than 400 headlines (${n})`);
    const shown = () => page.locator(`#out .cols5 .col:nth-child(${idx}) .story`).count();
    assert.equal(await shown(), 12);
    for (const want of [200, 400]) {
      const btn = page.locator(`#out button.more[data-more="${pos}"]`), before = await shown();
      const said = Number((await btn.textContent()).match(/^Show ([\d,]+) more/)[1].replace(/,/g, ''));
      await btn.click();
      assert.deepEqual([await shown(), await shown() - before], [want, said], `the column shows ${want}, as many more as the button said`);
    }
    await page.selectOption('#view', 'stream');
    const total = Number((await page.textContent('#viewcount')).replace(/[^\d]/g, ''));
    assert.ok(total > 800, `a stream of more than 800 headlines (${total})`);
    for (const want of [80, 400, 800]) {
      assert.equal(await page.locator('#out .stream .story').count(), want);
      await page.click('#out button.more[data-more="stream"]');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('page: free sources lead in Top stories, a paid headline is labelled with the free one beside it, and a topic keeps its stories', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    for (const dark of [false, true]) {
      const routes = fixtureRoutes();
      const topic = [{ id: 'u1', name: 'Funds and fires', keywords: ['Vantor', 'Quillon'], paused: false }];
      const { page, errors } = await openTop(browser, 'q/briefing', { dark, routes, init: `localStorage.setItem('jdpi.briefing.topics.v1', ${JSON.stringify(JSON.stringify(topic))})` });
      await topsReady(page);
      const want = await expected(page, fixtureStores(routes), TACCESS);
      assert.deepEqual(await page.$$eval('#topout .tcard h3 a.t', as => as.map(a => a.getAttribute('href'))), want.all.map(s => s.lead.u));
      // Hallworth: paid c1 is its most typical headline; the overall card and the centre's lead with free ones.
      const hall = want.all[0];
      assert.equal(hall.entries[0].item.sid, 'c1');
      assert.notEqual(await page.getAttribute('#topout .tcard.lead h3 a.t', 'href'), hall.entries[0].item.u);
      const centre = page.locator('#poscols .poscol[data-pos="centre"] .pcard h4 a.t');
      assert.deepEqual((await centre.evaluateAll(as => as.map(a => a.getAttribute('href')))).map(u => new URL(u).hostname), ['c2.example', 'c2.example']);
      // No list starts with Vantor, which no one can read free.
      const firsts = await page.$$eval('#topout .tcard:first-child h3 a.t, #poscols .poscol .pcard:first-of-type h4 a.t', as => as.map(a => a.textContent));
      assert.ok(firsts.length >= 5 && firsts.every(t => !/Vantor/.test(t)), firsts.join(' | '));
      // A paid headline: the label inside its link, the same story's free headline beside it, reached by Tab.
      const paid = page.locator('#topout .tcard', { hasText: 'Hallworth' }).locator('.tc-list li', { hasText: 'C1 News' });
      assert.equal(await paid.locator('a.h .prp-access').textContent(), 'Paywall');
      assert.equal(await paid.locator('a.h + .prp-access-alt').textContent(), `Free at ${hall.lead.src}`);
      assert.equal(await paid.locator('a.h').getAttribute('target'), '_blank', 'it opens at its publisher');
      // The topic keeps Vantor and Quillon, the free one first.
      await page.click('.topic[data-id="u1"] button.n');
      await page.waitForFunction(() => document.querySelectorAll('#topout .tcard').length === 2);
      const two = await page.$$eval('#topout .tcard h3 a.t', as => as.map(a => a.textContent));
      assert.equal(two.length, 2);
      assert.match(two[0], /^Quillon refinery fire evacuation ordered$/);
      assert.match(two[1], /Vantor.*, Paywall$/);
      assert.match(await page.textContent('#topcount'), /^VM grouped 5 stories that two publishers or more ran; 2 match$/);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('page: on a phone, one position at a time with a switch that keeps to the keyboard, and no sideways scroll', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const { page, errors } = await openTop(browser, 'q/briefing', { width: 390, height: 844, routes: fixtureRoutes() });
    await topsReady(page);
    const shown = () => page.$$eval('#poscols .poscol', cs => cs.filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.pos));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll at 390 px');
    assert.deepEqual(await shown(), ['far_left'], 'the first position, with nothing chosen');
    assert.equal(await page.isVisible('#topics'), false, 'the topics fold into one button');
    // The keyboard: Tab from the last card reaches the switch; the arrows move along it, as along any radio group.
    await page.focus('#topout .tcard:last-child a.cmp');
    let k = 0;
    for (; k < 4 && !(await page.evaluate(() => document.activeElement?.name === 'topos')); k++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.value), 'far_left', 'Tab reaches the switch');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual([await page.evaluate(() => document.activeElement?.value), await shown()], ['left', ['left']]);
    await page.check('#posopts input[value="right"]');
    assert.deepEqual(await shown(), ['right']);
    assert.match(await page.evaluate(() => location.hash), /(^#|&)p=right$/);
    // The three tabs, by the arrows.
    await page.focus('#tabbtn-top');
    const seen = [];
    for (let n = 0; n < 3; n++) { await page.keyboard.press('ArrowRight'); seen.push(await page.evaluate(() => [document.activeElement.id, document.activeElement.getAttribute('aria-selected')].join(' '))); }
    assert.deepEqual(seen, ['tabbtn-stories true', 'tabbtn-publishers true', 'tabbtn-top true']);
    assert.deepEqual(errors, []);
    const other = await openTop(browser, 'q/briefing#p=centre', { width: 390, height: 844, routes: fixtureRoutes() });
    await topsReady(other.page);
    assert.deepEqual([await other.page.$$eval('#poscols .poscol', cs => cs.filter(c => getComputedStyle(c).display !== 'none').map(c => c.dataset.pos)), await other.page.isChecked('#posopts input[value="centre"]')], [['centre'], true]);
    assert.deepEqual(other.errors, []);
  } finally {
    await browser.close();
  }
});

// The review of 16 November 2026 (findings R2-01, R2-03, R2-04, R2-05, R2-06, R2-11): a failed load says so in plain
// words and stops waiting; the cards are not a live region; the switch gives each position's count; a topic picked on a
// phone closes the fold; between 861 and 1200 pixels the positions are one at a time, never three and two; a filter that
// leaves nothing gives one sentence, not five.
test('page: a failed load says so plainly, the cards are not read out on every keystroke, and the switch and fold behave', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const failed = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await failed.route('**/briefing/data/latest.json', r => r.fulfill({ status: 503, body: 'down' }));
    await failed.goto(`${BASE}/q/briefing`, { waitUntil: 'domcontentloaded' });
    const plain = 'The stories could not be loaded just now. Try again in a few minutes.';
    await failed.waitForFunction(t => document.querySelector('#topstatus').textContent === t, plain, { timeout: 20000 });
    assert.deepEqual(await failed.evaluate(() => [document.querySelector('#meta').textContent, document.querySelector('#tab-top').getAttribute('aria-busy'), document.querySelector('.pos-panel').hidden]), [plain, 'false', true]);
    await failed.close();

    const topic = [{ id: 'u9', name: 'Zzqx', keywords: ['Zzqxwv'], paused: false }];
    const init = `localStorage.setItem('jdpi.briefing.topics.v1', ${JSON.stringify(JSON.stringify(topic))})`;
    const { page, errors } = await openTop(browser, 'q/briefing', { routes: fixtureRoutes(), init });
    await topsReady(page);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#topout').getAttribute('aria-live'), document.querySelector('#topcount').getAttribute('aria-live'), document.querySelector('#topstatus').getAttribute('role')]), [null, 'polite', 'status']);
    await page.click('.topic[data-id="u9"] button.n');
    await page.waitForFunction(() => document.querySelectorAll('#topout .tcard').length === 0);
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('#poscols .poscol').length, document.querySelectorAll('#poscols .pnote').length, document.querySelectorAll('[data-latest-pos]').length]), [0, 1, 0], 'one sentence for the five, and no link to Latest under a filter');
    assert.deepEqual(errors, []);
    await page.close();

    const mid = await openTop(browser, 'q/briefing', { width: 1024, height: 768, routes: fixtureRoutes() });
    await topsReady(mid.page);
    assert.deepEqual([await mid.page.isVisible('#posswitch'), await mid.page.$$eval('#poscols .poscol', cs => cs.filter(c => getComputedStyle(c).display !== 'none').length)], [true, 1], 'one position at a time at 1024 px');
    await mid.page.close();

    const phone = await openTop(browser, 'q/briefing', { width: 390, height: 844, routes: fixtureRoutes() });
    await topsReady(phone.page);
    const want = await expected(phone.page, fixtureStores(fixtureRoutes()), TACCESS);
    assert.deepEqual(await phone.page.$$eval('#posopts label', ls => ls.map(l => l.querySelector('input').value + ' ' + l.querySelector('.n').textContent.replace(/\D+/g, ''))), POS_ORDER.map(p => `${p} ${want.by[p].length}`), 'each position\'s number of stories in its switch');
    await phone.page.click('#topicfold');
    await phone.page.click('.topic[data-id="t1"] button.n');
    assert.deepEqual(await phone.page.evaluate(() => [document.querySelector('#topicfold').getAttribute('aria-expanded'), document.activeElement.id, document.querySelector('#topicname').textContent]), ['false', 'topicfold', 'Ukraine & Russia']);
    assert.deepEqual(phone.errors, []);
  } finally {
    await browser.close();
  }
});
