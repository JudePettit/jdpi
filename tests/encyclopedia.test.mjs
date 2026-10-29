// Encyclopaedia: the entity layer it reads (the committed lake/data, which lake-refresh tests before committing), then
// the Boolean tag Explorer, entity pages with links into modules, and the cross-suite linker (pages, against JDPI_URL,
// default live; PRP_PAGES=0 leaves them out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('data: the entity layer is complete, consistent, and every entity is in its shard', () => {
  const m = read('lake/data/manifest.json'), index = read('lake/data/index.json'), keys = read('lake/data/keys.json');
  // Floors against a collapse (the build compares with the last build itself): about 12,000 entities and 16,800
  // mentions in October 2026, of which the Retrospective alone gives 7,900, and every module some.
  assert.ok(m.entities >= 10000 && m.mentions >= 12000, `${m.entities} entities, ${m.mentions} mentions`);
  for (const [module, n] of Object.entries(m.modules)) assert.ok(n > 0, `no mentions from ${module}`);
  assert.equal(index.rows.length, m.entities, 'index rows');
  assert.equal(Object.values(m.types).reduce((a, b) => a + b, 0), m.entities, 'types');
  const entities = new Map();
  for (let i = 0; i < m.shards.entities; i++) for (const [q, r] of Object.entries(read(`lake/data/e/${i}.json`))) {
    assert.equal(+q.slice(1) % m.shards.entities, i, `${q} is in shard ${i}`);
    entities.set(q, r);
  }
  assert.equal(entities.size, m.entities, 'entities in the shards');
  for (const r of index.rows) assert.ok(entities.has(r[0]), `index row ${r[0]}`);
  for (let i = 0; i < m.shards.titles; i++) for (const [t, q] of Object.entries(read(`lake/data/t/${i}.json`))) assert.ok(entities.has(q), `${t} → ${q}`);
  for (const [k, q] of Object.entries(keys)) assert.ok(entities.has(q), `${k} → ${q}`);
  // Auto Trader's members of Congress have entries (129 now): they need the Bioguide IDs in traders/data.
  assert.ok(Object.keys(keys).filter(k => k.startsWith('congress:')).length >= 50, 'members of Congress');
  // 98% of the entities with an article have its summary; a failed fetch is tried again by the next build.
  const withArticle = [...entities.values()].filter(r => r.wiki);
  assert.ok(withArticle.filter(r => r.summary).length >= withArticle.length * 0.9, 'summaries');
});

test('a Boolean tag query finds John Mearsheimer, and his page links to where he appears', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/encyclopedia/index.html#explore`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr td', { timeout: 30000 });
  const total = await page.locator('#count').innerText();
  await page.fill('#query', 'Realist + "Structural realism" + American + "Political science"');
  await page.waitForTimeout(600);
  const names = await page.locator('#rows .name a').allInnerTexts();
  const err = await page.locator('#qerr').isVisible();
  // NOT and OR
  await page.fill('#query', 'Realist - "Offensive realism"');
  await page.waitForTimeout(600);
  const withoutOffensive = await page.locator('#rows .name a').allInnerTexts();
  await page.fill('#query', '"Austrian School" | "Chicago School"');
  await page.waitForTimeout(600);
  const either = await page.locator('#rows .name a').allInnerTexts();
  // Facet filter (Excel-style)
  await page.fill('#query', '');
  await page.locator('.facet button[data-toggle="Type"]').count();
  await page.goto(`${BASE}/encyclopedia/index.html#explore?q=${encodeURIComponent('Realist + "Structural realism" + American + "Political science"')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#rows .name a');
  await page.locator('#rows .name a', { hasText: 'Mearsheimer' }).click();
  await page.waitForSelector('.ment a', { timeout: 15000 });
  const entity = await page.locator('#entity').innerText();
  const links = await page.locator('.ment a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  await browser.close();
  assert.match(total, /\d/);
  assert.ok(names.some(n => /Mearsheimer/.test(n)), `results: ${names.join(', ')}`);
  assert.ok(names.some(n => /Waltz|Walt/.test(n)), 'other structural realists also match');
  assert.equal(err, false);
  assert.ok(!withoutOffensive.some(n => /Mearsheimer/.test(n)) && withoutOffensive.some(n => /Morgenthau/.test(n)), 'NOT excludes offensive realists');
  assert.ok(either.some(n => /Hayek|Mises/.test(n)) && either.some(n => /Friedman/.test(n)), 'OR combines schools');
  assert.match(entity, /appears in prp/i);
  assert.ok(links.some(h => /learning\.html\?course=politics/.test(decodeURIComponent(h))), 'links to the Politics lesson');
  assert.deepEqual(errors, []);
});

test('other modules link names into the Encyclopaedia', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.goto(`${BASE}/q/calendar?period=2020s&month=2022-02`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.eventrow', { timeout: 20000 });
  // Badges arrive shard by shard as the linker resolves titles; wait for several rather than the first.
  await page.waitForFunction(() => document.querySelectorAll('a.jdpi-ency').length >= 3, null, { timeout: 15000 }).catch(() => {});
  const n = await page.locator('a.jdpi-ency').count();
  const href = await page.locator('a.jdpi-ency').first().getAttribute('href');
  await browser.close();
  assert.ok(n >= 3, `badges: ${n}`);
  assert.match(href, /encyclopedia\/index\.html#Q\d+/);
});
