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
  await page.goto(`${BASE}/q/briefing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    await page.goto(`${BASE}/q/briefing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
