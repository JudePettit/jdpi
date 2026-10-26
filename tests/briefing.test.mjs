// Briefing: the catalogue is balanced across the five positions, stories are fresh, and the page filters by topic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { POSITIONS, PER_POSITION, SOURCES } from '../briefing/scripts/sources.mjs';
import { parseFeed, canonicalUrl } from '../briefing/scripts/rss.mjs';
import { categorize } from '../briefing/scripts/categorize.mjs';

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

test('live data: ten active publishers per position, recent stories', async () => {
  const d = await (await fetch(`${BASE}/briefing/data/latest.json`)).json();
  for (const p of POSITIONS) {
    assert.equal(d.sources.filter(s => s.position === p.key && s.active).length, PER_POSITION, p.key);
    assert.ok(d.items.some(i => d.sources.find(s => s.id === i.s)?.position === p.key), `stories for ${p.key}`);
  }
  assert.ok((Date.now() - Date.parse(d.generated)) / 36e5 < 30, `generated ${d.generated}`);
});

test('page shows five columns and filters by topic', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
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
