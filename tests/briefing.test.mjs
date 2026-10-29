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
