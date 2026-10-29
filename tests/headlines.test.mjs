// Country Headlines: top stories per outlet from Supabase (runs against JDPI_URL, default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { RUBRIC, SECTIONS, TITLES, pickStories, ruleHit } from '../headlines/refresh-top-stories/lowbrow.js';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('UK shows top stories grouped by outlet, linking to the original articles', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The page keeps polling (map tiles, clock), so wait for DOM ready rather than network idle.
  await page.goto(`${BASE}/q/headlines.html?view=current`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof loadTopStories === 'function');
  await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
  await page.waitForSelector('.outlet-group .article', { timeout: 15000 });
  const groups = await page.locator('.outlet-group').count();
  const stories = await page.locator('.outlet-group .article').count();
  const firstHref = await page.locator('.outlet-group a.headline').first().getAttribute('href');
  await browser.close();
  assert.ok(groups >= 3, `outlet groups: ${groups}`);
  assert.ok(stories >= 9, `stories: ${stories}`);
  assert.match(firstHref, /^https?:\/\//);
  assert.deepEqual(errors, []);
});

// ---- The map's boundaries (headlines/boundaries.json, built by headlines/scripts/build-boundaries.mjs) ----

const outlets = JSON.parse(readFileSync(new URL('../headlines/outlets.json', import.meta.url), 'utf8'));
const topo = JSON.parse(readFileSync(new URL('../headlines/boundaries.json', import.meta.url), 'utf8'));
const shapes = topo.objects.countries.geometries;

test('the boundary file has a shape or a marker for every collected country, and nothing else', () => {
  const codes = Object.keys(outlets);
  const usable = new Set(shapes.filter(g => g.type || g.properties.dot).map(g => g.properties.code));
  assert.deepEqual(codes.filter(c => !usable.has(c)), [], 'collected but not on the map (rebuild: node headlines/scripts/build-boundaries.mjs)');
  assert.deepEqual(shapes.map(g => g.properties.code).filter(c => !(c in outlets)), [], 'on the map but not collected');
  for (const c of ['SV', 'XK']) assert.ok(usable.has(c), `${c} can be chosen`);
  for (const c of ['VA', 'MC', 'SM', 'LI', 'AD', 'MT']) assert.ok(shapes.find(g => g.properties.code === c).properties.dot, `${c} has a marker`);
  for (const g of shapes) assert.ok(g.properties.name && /^[A-Z]{2}$/.test(g.properties.code), JSON.stringify(g.properties));
  const kb = readFileSync(new URL('../headlines/boundaries.json', import.meta.url)).length / 1024;
  assert.ok(kb < 300, `boundaries.json is ${kb.toFixed(0)} KB`);
});

async function openTracker(query, { width = 1280 } = {}) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfinished', async r => { try { requests.push({ url: r.url(), bytes: (await r.sizes()).responseBodySize }); } catch {} });
  await page.goto(`${BASE}/q/headlines.html${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('status-boundaries')?.dataset.state === 'ready', null, { timeout: 30000 });
  return { browser, page, errors, requests };
}
const shown = page => page.evaluate(() => ({ name: document.getElementById('countryname').textContent, pick: document.getElementById('countryPick').value,
  inList: [...document.querySelectorAll('#countryList [aria-current="true"]')].map(b => b.textContent), onMap: document.querySelectorAll('#map path.country.selected').length,
  country: new URLSearchParams(location.search).get('country') }));

test('the map loads its small boundary file from the repo, with markers for the smallest countries', async () => {
  const { browser, page, errors, requests } = await openTracker('?view=current');
  try {
    assert.equal(await page.textContent('#status-boundaries'), `Boundaries · ${Object.keys(outlets).length} covered countries`);
    const boundaries = () => requests.find(r => r.url.endsWith('/headlines/boundaries.json'));
    for (let i = 0; i < 30 && !boundaries(); i++) await page.waitForTimeout(100); // sizes arrive just after the response
    assert.ok(!requests.some(r => /geo-countries|countries\.geojson/.test(r.url)), 'no request for the 14.6 MB world GeoJSON');
    const file = boundaries();
    assert.ok(file && file.bytes < 300 * 1024, `boundaries.json: ${file?.bytes} bytes`);
    assert.equal(await page.locator('#map path.country-dot').count(), shapes.filter(g => g.properties.dot).length);
    // Markers stay above the shapes: with Italy selected (and so brought to the front), San Marino's and Vatican City's
    // markers are still drawn over it.
    await page.evaluate(() => geoLayer.eachLayer(l => { if (l.feature.properties.code === 'IT') l.fire('click'); }));
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Italy');
    const after = await page.evaluate(() => { const paths = [...document.querySelectorAll('#map path.country')], italy = paths.findIndex(p => p.classList.contains('selected'));
      return paths.slice(italy + 1).map(p => p.classList.contains('country-dot')); });
    assert.equal(after.length, shapes.filter(g => g.properties.dot).length, 'only the markers come after the selected shape');
    assert.ok(after.every(Boolean));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a country can be chosen with the keyboard, and the picker, list, map and address agree', async () => {
  const { browser, page, errors } = await openTracker('?view=current');
  try {
    await page.waitForFunction(() => !document.getElementById('countryPick').disabled);
    assert.equal(await page.locator('#countryPick option:not([disabled])').count(), Object.keys(outlets).length);
    assert.equal(await page.locator('label[for="countryPick"]').count(), 1, 'the picker is labelled');
    // Tab to the picker and type a name.
    await page.focus('.research-watchlist-button');
    for (let i = 0; i < 8 && await page.evaluate(() => document.activeElement.id !== 'countryPick'); i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'countryPick');
    await page.keyboard.type('malta');
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Malta', null, { timeout: 15000 });
    assert.deepEqual(await shown(page), { name: 'Malta', pick: 'MT', inList: ['Malta'], onMap: 2, country: 'Malta' }); // its shape and its marker
    // A click on the map moves the picker and the list with it.
    await page.evaluate(() => geoLayer.eachLayer(l => { if (l.feature.properties.code === 'FR') l.fire('click'); }));
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'France');
    assert.deepEqual(await shown(page), { name: 'France', pick: 'FR', inList: ['France'], onMap: 1, country: 'France' });
    // The A–Z list chooses too.
    await page.click('details.country-az summary');
    await page.click('#countryList .az-item[data-code="SM"]');
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'San Marino');
    assert.equal((await shown(page)).pick, 'SM');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('?country= selects the country once the boundaries are ready, by name, older name or code', async () => {
  for (const [query, name, code] of [['El%20Salvador', 'El Salvador', 'SV'], ['Kosovo', 'Kosovo', 'XK'], ['Republic%20of%20Serbia', 'Serbia', 'RS'],
    ['United%20States%20of%20America', 'United States', 'US'], ['Soviet%20Union%20%2F%20Russia', 'Russia', 'RU'], ['Vatican', 'Vatican City', 'VA']]) {
    const { browser, page, errors } = await openTracker(`?view=current&country=${query}`);
    try {
      await page.waitForFunction(n => document.getElementById('countryname').textContent === n, name, { timeout: 15000 });
      const s = await shown(page);
      assert.equal(s.pick, code, query);
      assert.ok(s.onMap >= 1, `${query}: highlighted on the map`);
      assert.equal(s.country, name, `${query}: the address keeps the name shown`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  const { browser, page } = await openTracker('?view=current&country=Narnia');
  try {
    await page.waitForFunction(() => document.getElementById('newsstate').textContent === 'Country not covered', null, { timeout: 15000 });
    assert.match(await page.textContent('#articles'), /Narnia is not one of the countries/);
  } finally { await browser.close(); }
});

test('the country list works at phone width without a horizontal scroll', async () => {
  const { browser, page, errors } = await openTracker('?view=current', { width: 390 });
  try {
    await page.click('details.country-az summary');
    const item = page.locator('#countryList .az-item[data-code="LI"]');
    const box = await item.boundingBox();
    assert.ok(box.height >= 36, `list items are ${box.height}px tall`);
    await item.click();
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Liechtenstein');
    // On one column the headlines are below the list, so the choice scrolls them into view.
    await page.waitForFunction(() => { const r = document.getElementById('countryname').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 5000 });
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---- The lowbrow filter (headlines/refresh-top-stories/lowbrow.js) and the Edge Function that applies it ----

test('the lowbrow rules catch the obvious cases by site section or headline', () => {
  const cases = [
    ['https://www.dailymail.co.uk/tvshowbiz/article-1/x.html', 'Star steps out', 'section /tvshowbiz/'],
    ['https://www.thesun.co.uk/tvandshowbiz/123/x/', 'Soap twist', 'section /tvandshowbiz/'],
    ['https://www.bild.de/unterhaltung/leute/leute/x-123.bild.html', 'Promi-Paar getrennt', 'section /leute/'],
    ['https://www.leparisien.fr/people/x-123.php', 'Le chanteur se confie', 'section /people/'],
    ['https://example.com/news/1', 'Your horoscope for Friday', 'title: horoscope'],
    ['https://example.com/news/2', 'EuroMillions results: winning numbers for Tuesday', 'title: lottery results'],
    ['https://example.com/news/3', 'Wordle hints and answer for today', 'title: puzzle answers'],
    ['https://example.com/news/4', 'Love Island star reveals split', 'title: reality TV'],
    ['https://example.com/news/5', 'Singer wows in plunging gown at premiere', 'title: looks and outfits'],
    ['https://example.com/news/6', 'Sponsored: the best savings accounts', 'title: sponsored'],
  ];
  for (const [url, title, why] of cases) assert.equal(ruleHit(url, title), why, title);
  assert.equal(ruleHit('https://example.com/a', 'Le chanteur', 'Quiz: name the capitals'), 'title: quiz', 'any title given is checked');
});

test('the lowbrow rules leave news alone, including headlines that only look like the patterns', () => {
  const news = [
    ['https://www.bbc.co.uk/news/world-europe-1', 'Parliament passes the budget after an all-night sitting'],
    ['https://www.theguardian.com/politics/2026/oct/29/x', 'MPs quiz the chancellor over borrowing'],
    ['https://example.com/world/1', 'US marks 80 years since the tests in Bikini Atoll'],
    ['https://example.com/tech/1', 'State-sponsored hackers breached the ministry, report says'],
    ['https://example.com/politics/1', 'Critics warn ID cards would build a Big Brother state'],
    ['https://example.com/crime/1', 'Police name a new suspect in the Zodiac killer case'],
    ['https://example.com/business/1', 'Families set for life of poverty, numbers show'],
    ['https://example.com/sport/1', 'Underdogs stun champions in a daring cup upset'],
    ['https://example.com/culture/1', 'Booker Prize goes to a debut novel'],
    ['https://news.google.com/rss/articles/CBMiX2h0dHBzOi8vd3d3?oc=5', 'Government falls after a confidence vote'],
  ];
  for (const [url, title] of news) assert.equal(ruleHit(url, title), null, title);
  assert.equal(ruleHit('not a url', 'Ministers meet'), null);
  for (const s of SECTIONS) assert.match(s, /^[a-z0-9-]+$/, `section "${s}" is one lower-case path segment`);
  for (const [label, re] of TITLES) assert.ok(label && re.flags.includes('i'), label);
  assert.match(RUBRIC, /When unsure, it is news\.$/);
});

test('an outlet keeps its first three stories that are not lowbrow, in front-page order', () => {
  const items = [{ title: 'a' }, { title: 'b', rule: 'section /showbiz/' }, { title: 'c', verdict: { lowbrow: true } },
    { title: 'd', verdict: { lowbrow: false } }, { title: 'e', verdict: null }, { title: 'f' }];
  const { kept, left } = pickStories(items, 3);
  assert.deepEqual(kept.map(i => i.title), ['a', 'd', 'e']);
  assert.deepEqual(left.map(i => [i.title, i.reason]), [['b', 'section /showbiz/'], ['c', 'classifier']]);
  assert.deepEqual(pickStories([{ title: 'x', rule: 'title: quiz' }]).kept, []);
});

// The Edge Function itself, under Node (type stripping) with Deno, the database, Claude and the feeds stubbed: the
// runner records every database write and Claude request. Claude's stand-in calls a headline lowbrow when it says
// "gossip" or "LOWBROW", and translates by prefixing "EN ".
const RUNNER = `import { readFileSync } from 'node:fs';
const scenario = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const log = [], calls = [];
let handler;
globalThis.Deno = { env: { get: k => scenario.env[k] }, serve: h => { handler = h; } };
const answer = (table, ops) => {
  const sel = (ops.find(o => o[0] === 'select') || [])[1];
  if (table === 'country_top_stories' && sel === 'country_code') return { data: (scenario.done || []).map(c => ({ country_code: c })) };
  if (table === 'country_top_stories' && sel === '*') return { data: scenario.pending || [] };
  return { data: [] };
};
globalThis.__db = { from(table) {
  const ops = [];
  const b = {
    upsert(rows) { log.push({ table, op: 'upsert', rows }); return Promise.resolve({ error: null }); },
    insert(row) { log.push({ table, op: 'insert', row }); return Promise.resolve({ error: null }); },
    then(ok, fail) { log.push({ table, op: 'query', ops }); return Promise.resolve(answer(table, ops)).then(ok, fail); },
  };
  for (const m of ['select', 'eq', 'is', 'or', 'gte', 'order', 'limit']) b[m] = (...a) => { ops.push([m, ...a]); return b; };
  return b;
} };
globalThis.__claude = async p => {
  calls.push(p);
  if (scenario.claude === 'refuse') return { stop_reason: 'refusal', usage: { input_tokens: 9, output_tokens: 1 }, content: [] };
  const text = p.messages[0].content, titles = JSON.parse(text.slice(text.lastIndexOf('\\n\\n') + 2)), translate = text.startsWith('For each news headline');
  const items = titles.map(t => { const low = /LOWBROW|gossip/i.test(t); return { en: translate && !low ? 'EN ' + t : '', lowbrow: low }; });
  return { stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ items }) }] };
};
globalThis.fetch = async url => {
  if (url === 'https://jdpi.pages.dev/headlines/outlets.json') return new Response(JSON.stringify(scenario.outlets));
  const xml = scenario.feeds[url];
  return xml ? new Response(xml) : new Response('', { status: 404 });
};
await import('./index.mts');
const res = await handler(new Request('http://localhost/', { method: 'POST', body: '{}' }));
process.stdout.write(JSON.stringify({ response: await res.json(), log, calls }));
`;
function runFunction(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'prp-headlines-'));
  try {
    const src = readFileSync(new URL('../headlines/refresh-top-stories/index.ts', import.meta.url), 'utf8')
      .replace(/^import "jsr:[^"]+";\r?\n/m, '')
      .replace('"npm:@supabase/supabase-js@2.45.4"', '"./supabase.mjs"')
      .replace('"npm:@anthropic-ai/sdk@0.110.0"', '"./anthropic.mjs"');
    assert.doesNotMatch(src, /"(?:npm|jsr):/, 'every remote import is stubbed (update the test when the function imports change)');
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'index.mts'), src);
    copyFileSync(new URL('../headlines/refresh-top-stories/lowbrow.js', import.meta.url), join(dir, 'lowbrow.js'));
    writeFileSync(join(dir, 'supabase.mjs'), 'export const createClient = () => globalThis.__db;\n');
    writeFileSync(join(dir, 'anthropic.mjs'), 'export default class Anthropic { constructor() { this.beta = { messages: { create: p => globalThis.__claude(p) } }; } }\n');
    writeFileSync(join(dir, 'runner.mjs'), RUNNER);
    writeFileSync(join(dir, 'scenario.json'), JSON.stringify(scenario));
    return JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(dir, 'runner.mjs'), join(dir, 'scenario.json')], { encoding: 'utf8' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const rss = items => '<rss><channel>' + items.map(([title, link]) => `<item><title>${title}</title><link>${link}</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item>`).join('') + '</channel></rss>';
const SCENARIO = {
  env: { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role', ANTHROPIC_API_KEY: 'stub-key' },
  outlets: {
    GB: [{ name: 'GB One', home: 'https://www.gb1.example', rss: 'https://gb1.example/rss', via: 'site' },
      { name: 'GB Two', home: 'https://gb2.example', rss: 'https://news.google.com/rss/search?q=gb2', via: 'google-news' }],
    FR: [{ name: 'FR Un', home: 'https://fr1.example', rss: 'https://fr1.example/rss', via: 'site' }],
  },
  feeds: {
    'https://gb1.example/rss': rss([['Minister resigns', 'https://gb1.example/news/a1'], ['Star steps out', 'https://gb1.example/tvshowbiz/b1'],
      ['Celebrity gossip as couple split', 'https://gb1.example/news/c1'], ['Budget passes', 'https://gb1.example/news/d1'],
      ['Rail strike called', 'https://gb1.example/news/e1'], ['Sixth story', 'https://gb1.example/news/f1']]),
    'https://news.google.com/rss/search?q=gb2': rss([['Floods hit the north - GB Two', 'https://news.google.com/rss/articles/A'],
      ['Your horoscope for Friday - GB Two', 'https://news.google.com/rss/articles/B'], ['Court rules on strike - GB Two', 'https://news.google.com/rss/articles/C'],
      ['Inflation falls - GB Two', 'https://news.google.com/rss/articles/D']]),
    'https://fr1.example/rss': rss([['Le gouvernement tombe', 'https://fr1.example/a'], ['LOWBROW la chanteuse', 'https://fr1.example/b'],
      ['La grève continue', 'https://fr1.example/c'], ['Le budget adopté', 'https://fr1.example/d']]),
  },
};
const story = (id, over) => ({ id, snapshot_date: '2026-10-28', country_code: 'GB', outlet: 'GB One', outlet_domain: 'gb1.example', outlet_rank: 1, story_rank: id,
  title_original: '', title_en: null, url: `https://gb1.example/news/z${id}`, published_at: null, lowbrow: null, lowbrow_reason: null, ...over });
const upserts = run => run.log.filter(e => e.op === 'upsert' && e.table === 'country_top_stories').map(e => e.rows);
const statuses = run => run.log.filter(e => e.op === 'insert' && e.table === 'source_status_history').map(e => e.row);

test('the refresh function leaves lowbrow stories out and gives their places to the next stories', () => {
  const run = runFunction({ ...SCENARIO, pending: [
    story(1, { title_original: 'Love Island star reveals split', title_en: 'Love Island star reveals split' }),
    story(2, { title_original: 'Parliament passes the budget', title_en: 'Parliament passes the budget' }),
    story(3, { country_code: 'FR', title_original: 'Potins : gossip du jour' }),
    story(4, { country_code: 'FR', title_original: 'La réforme votée', lowbrow: false }),
  ] });
  assert.deepEqual(run.response.results, { GB: 6, FR: 3 });
  const [gb, fr, backfill] = upserts(run);
  assert.deepEqual(gb.map(r => [r.outlet, r.story_rank, r.title_original]), [['GB One', 1, 'Minister resigns'], ['GB One', 2, 'Budget passes'],
    ['GB One', 3, 'Rail strike called'], ['GB Two', 1, 'Floods hit the north'], ['GB Two', 2, 'Court rules on strike'], ['GB Two', 3, 'Inflation falls']]);
  assert.ok(gb.every(r => r.title_en === r.title_original && r.lowbrow === false), 'English titles as they are, every story judged news');
  assert.deepEqual(fr.map(r => [r.story_rank, r.title_en, r.lowbrow]), [[1, 'EN Le gouvernement tombe', false], [2, 'EN La grève continue', false], [3, 'EN Le budget adopté', false]]);
  const gbStatus = statuses(run).find(s => s.country_code === 'GB');
  assert.equal(gbStatus.message, '6 stories from 2 outlets, 3 lowbrow left out');
  assert.deepEqual(gbStatus.metadata.lowbrow.map(l => [l.outlet, l.title, l.reason]), [['GB One', 'Star steps out', 'section /tvshowbiz/'],
    ['GB One', 'Celebrity gossip as couple split', 'classifier'], ['GB Two', 'Your horoscope for Friday', 'title: horoscope']]);
  // One request per country (rule hits never sent) and two for the backfill, all on Opus 5.5 with structured output.
  assert.equal(run.calls.length, 4);
  for (const c of run.calls) {
    assert.equal(c.model, 'claude-opus-5-5');
    assert.deepEqual([c.output_config.effort, c.output_config.format.type, c.fallbacks], ['low', 'json_schema', 'default']);
    assert.ok(c.messages[0].content.includes(RUBRIC));
  }
  const gbAsked = JSON.parse(run.calls[0].messages[0].content.split('\n\n').pop());
  assert.deepEqual(gbAsked, ['Minister resigns', 'Celebrity gossip as couple split', 'Budget passes', 'Rail strike called', 'Floods hit the north', 'Court rules on strike', 'Inflation falls']);
  assert.match(run.calls[0].messages[0].content, /^For each English news headline/);
  assert.match(run.calls[1].messages[0].content, /^For each news headline/);
  // The backfill: a rule hides story 1 without a request, Claude hides 3 and clears 2, and 4 gets its translation.
  const pendingQuery = run.log.find(e => e.op === 'query' && e.ops.some(o => o[0] === 'select' && o[1] === '*'));
  assert.match(pendingQuery.ops.find(o => o[0] === 'or')[1], /^lowbrow\.is\.null,and\(title_en\.is\.null,lowbrow\.is\.false,snapshot_date\.gte\.\d{4}-\d{2}-\d{2}\)$/);
  const byUrl = Object.fromEntries(backfill.map(r => [r.url.slice(-2), [r.lowbrow, r.lowbrow_reason, r.title_en]]));
  assert.deepEqual(byUrl, { z1: [true, 'title: reality TV', 'Love Island star reveals split'], z2: [false, null, 'Parliament passes the budget'],
    z3: [true, 'classifier', null], z4: [false, null, 'EN La réforme votée'] });
  assert.ok(backfill.every(r => !('id' in r)));
  assert.deepEqual([run.response.judged, run.response.hidden, run.response.backfilled, run.response.backfillError], [4, 2, 1, null]);
});

test('without a verdict (a refusal, or no API key) only the fixed rules filter, and the backfill judges the stories later', () => {
  const refused = runFunction({ ...SCENARIO, claude: 'refuse' });
  const [gb, fr] = upserts(refused);
  assert.deepEqual(gb.filter(r => r.outlet === 'GB One').map(r => r.title_original), ['Minister resigns', 'Celebrity gossip as couple split', 'Budget passes']);
  assert.ok([...gb, ...fr].every(r => r.lowbrow === null), 'no verdict yet');
  assert.ok(fr.every(r => r.title_en === null), 'translation waits for the backfill');
  assert.deepEqual(statuses(refused).find(s => s.country_code === 'GB').metadata.lowbrow.map(l => l.reason), ['section /tvshowbiz/', 'title: horoscope']);
  const keyless = runFunction({ ...SCENARIO, env: { ...SCENARIO.env, ANTHROPIC_API_KEY: undefined }, pending: [story(1, { title_original: 'Love Island star reveals split' })] });
  assert.equal(keyless.calls.length, 0);
  assert.equal(upserts(keyless).length, 2, 'no backfill without Claude');
  assert.equal(keyless.response.translation, 'not configured');
});
