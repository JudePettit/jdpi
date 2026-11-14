// Country Headlines: top stories per outlet from Supabase (runs against JDPI_URL, default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';
import { RUBRIC, SECTIONS, TITLES, pickStories, ruleHit } from '../headlines/refresh-top-stories/lowbrow.js';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('UK shows top stories grouped by outlet, linking to the original articles', pageTest, async () => {
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

test('the map loads its small boundary file from the repo, with markers for the smallest countries', pageTest, async () => {
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

test('a country can be chosen with the keyboard, and the picker, list, map and address agree', pageTest, async () => {
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

test('?country= selects the country once the boundaries are ready, by name, older name or code', pageTest, async () => {
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

test('the country list works at phone width without a horizontal scroll', pageTest, async () => {
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

// ---- Highbrowse: what the page calls the lowbrow filter (the code and the database keep "lowbrow") ----

// The wordmark's drawing (design/highbrowse-wordmark.svg, without its comments, title, desc and standalone style), as
// the page inlines it: on one line, so the two can be compared exactly.
const wordmarkDrawing = svg => svg.slice(svg.indexOf('<g fill="currentColor">'), svg.lastIndexOf('</svg>')).replace(/<!--[\s\S]*?-->/g, '').replace(/\s*\r?\n\s*/g, '').trim();

test('Highbrowse: the caption names the filter, and its footer note opens with the wordmark, inlined in step with its file', () => {
  const html = readFileSync(new URL('../q/headlines.html', import.meta.url), 'utf8');
  const file = readFileSync(new URL('../design/highbrowse-wordmark.svg', import.meta.url), 'utf8');
  // The caption as served and as the view switch rewrites it.
  const caption = 'Top 3 stories from each of the country’s 5 most-read outlets · lowbrow stories left out by Highbrowse · translated to English';
  assert.equal(html.split(caption).length - 1, 2, 'the 24-hour caption names Highbrowse, in the markup and in VIEW_CAPTION');
  assert.ok(!/Lowbrow filter/.test(html), 'the old name is gone from what people read');
  // The note: the wordmark first, named for screen readers (its "alt text"), then what the filter does.
  const note = html.match(/<p class="hb-note">([\s\S]*?)<\/p>/)?.[1] || '';
  const mark = note.match(/^<svg class="hb-mark"[^>]*>([\s\S]*?)<\/svg>/);
  assert.ok(mark, 'the note opens with the inline wordmark');
  assert.match(mark[0], /^<svg class="hb-mark" viewBox="0 0 520 120" width="95" height="22" role="img" aria-labelledby="hb-name"/);
  assert.match(mark[1], /^<title id="hb-name">Highbrowse<\/title>/);
  assert.equal(mark[1].replace(/^<title id="hb-name">Highbrowse<\/title>/, ''), wordmarkDrawing(file), 'the inline copy draws exactly what design/highbrowse-wordmark.svg draws');
  assert.match(note.slice(mark[0].length), /^ keeps lowbrow stories out of the tracker\. Celebrity and showbiz gossip/);
});

test('Highbrowse: the wordmark heads the note at 40 px (large enough for the face) and takes the page\'s ink in light and dark', pageTest, async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`${BASE}/q/headlines.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const look = () => page.evaluate(() => {
      const m = document.querySelector('.hb-note .hb-mark'), r = m.getBoundingClientRect();
      const [R, G, B] = getComputedStyle(m).color.match(/\d+/g).map(Number);
      return { height: Math.round(r.height), width: Math.round(r.width), luminance: (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255, name: m.getAttribute('aria-labelledby') && document.getElementById(m.getAttribute('aria-labelledby')).textContent };
    });
    const light = await look();
    assert.deepEqual([light.height, light.width, light.name], [40, 173, 'Highbrowse']);
    assert.ok(light.luminance < 0.3, `dark letters on the light page (${light.luminance.toFixed(2)})`);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const dark = await look();
    assert.ok(dark.luminance > 0.7, `light letters on the dark page (${dark.luminance.toFixed(2)})`);
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

// Jude, 25 October 2026: translate before loading. A stored story whose English title has not arrived (title_en null)
// is hidden until it does, on every page that lists the stories (they all read them through q/supabase-client.js):
// no "translation pending" row, and every count counts only what is shown. The archive is faked, so the rows are
// known; the fake answers every query alike, so the page's own check is tested as well as the query's.
test('a story with no English title yet is not shown or counted, on the Tracker, National Analysis and the Battlefield', pageTest, async t => {
  const { launch } = await import('./tools/pages.mjs');
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const day = new Date().toISOString().slice(0, 10);
  const row = (outlet, host, r, k, en) => ({ snapshot_date: day, country_code: 'GB', outlet, outlet_domain: host, outlet_rank: r, story_rank: k, title_original: `${outlet} original ${k} Kyiv`, title_en: en, url: `https://${host}/news/${k}`, published_at: null, lowbrow: false });
  const rows = [row('One Daily', 'one.example', 1, 1, 'One Daily story 1 Kyiv'), row('One Daily', 'one.example', 1, 2, null), row('One Daily', 'one.example', 1, 3, 'One Daily story 3 Kyiv'),
    row('Two Post', 'two.example', 2, 1, null), row('Two Post', 'two.example', 2, 2, '  '), row('Three Times', 'three.example', 3, 1, 'Three Times story 1 Kyiv')];
  const asked = [];
  const open = async (path, width = 1360) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/rest/v1/country_top_stories*', r => { asked.push(r.request().url()); r.fulfill({ json: /select=snapshot_date&/.test(r.request().url()) ? [{ snapshot_date: day }] : rows }); });
    await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { page, errors };
  };
  for (const width of [1360, 360]) {
    const { page, errors } = await open('q/headlines.html?view=current', width);
    await page.waitForFunction(() => typeof loadTopStories === 'function');
    await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
    await page.waitForSelector('.outlet-group .article', { timeout: 15000 });
    const groups = await page.$$eval('.outlet-group', gs => gs.map(g => [g.querySelector('.outlet-name').textContent, ...[...g.querySelectorAll('a.headline')].map(a => a.textContent)]));
    assert.deepEqual(groups.map(g => g.slice(0, 1).concat(g.slice(1).sort())), [['One Daily', 'One Daily story 1 Kyiv', 'One Daily story 3 Kyiv'], ['Three Times', 'Three Times story 1 Kyiv']], `${width}: only the translated stories, and no outlet with none`);
    assert.doesNotMatch(await page.textContent('#articles'), /translation pending|original 2|Two Post/i, `${width}: no placeholder and no untranslated story`);
    assert.equal(await page.textContent('#newsstate'), '3 stories from 2 outlets', `${width}: the count is what is shown`);
    assert.match(await page.textContent('#status-news'), /Top stories · 3 saved/);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const nat = await open('q/national#country=GBR');
  await nat.page.waitForSelector('#stories .story a', { timeout: 30000 });
  assert.deepEqual((await nat.page.$$eval('#stories .story a', as => as.map(a => a.textContent))).sort(), ['One Daily story 1 Kyiv', 'One Daily story 3 Kyiv', 'Three Times story 1 Kyiv'], 'National Analysis: only the translated');
  assert.deepEqual(nat.errors, []);
  await nat.page.close();
  const war = await open('q/battlefield.html?view=live&war=russia-ukraine');
  await war.page.waitForSelector('#stories .story a', { timeout: 30000 });
  assert.deepEqual((await war.page.$$eval('#stories .story a', as => as.map(a => a.textContent))).sort(), ['One Daily story 1 Kyiv', 'One Daily story 3 Kyiv', 'Three Times story 1 Kyiv'], 'the Battlefield: only the translated');
  await war.page.close();
  // And the archive is asked for translated stories only, in every query of them.
  assert.ok(asked.length >= 3 && asked.every(u => /[?&]title_en=not\.is\.null(&|$)/.test(u)), asked.join('\n'));
});

// The archive date and the collection time, beside the results (13 November 2026; the second review: "Put archive
// date and collection time prominently beside results"): the UTC day or days whose front pages are shown, and when
// they were collected (each story's captured_at); when today's are not collected yet, the day shown instead says so.
// The archive is faked, so its days and times are known. The meta line has no ticking clock any more.
test('the results carry their archive date and collection time, today, while today\'s are pending, and in the archives', pageTest, async t => {
  const { launch } = await import('./tools/pages.mjs');
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const iso = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const today = iso(0), yday = iso(1);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const name = d => { const [y, m, n] = d.split('-').map(Number); return `${n} ${MON[m - 1]} ${y}`; };
  const row = (day, k, hhmm) => ({ snapshot_date: day, country_code: 'GB', outlet: `Outlet ${k}`, outlet_domain: `o${k}.example`, outlet_rank: k, story_rank: 1, title_original: `Story ${k} of ${day}`,
    title_en: `Story ${k} of ${day}`, url: `https://o${k}.example/${day}`, published_at: null, lowbrow: false, captured_at: `${day}T${hhmm}:10.000Z` });
  const open = async (path, handler, width = 1360) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/rest/v1/country_top_stories*', r => r.fulfill({ json: handler(decodeURIComponent(r.request().url())) }));
    await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof loadTopStories === 'function');
    return { page, errors };
  };
  // Today's front pages, collected this morning: their day and time.
  {
    const { page, errors } = await open('q/headlines.html?view=current', () => [row(today, 1, '00:40'), row(today, 2, '00:41')]);
    assert.doesNotMatch(await page.textContent('.prp-meta'), /\bNow\b/, 'no ticking clock');
    assert.match(await page.textContent('.prp-meta'), /Collected once a UTC day, country by country/);
    await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
    await page.waitForSelector('.outlet-group .article');
    assert.equal(await page.textContent('#dated'), `Front pages of ${name(today)} (UTC day) · collected 00:41 UTC`);
    assert.equal(await page.getAttribute('#dated', 'role'), 'status', 'a new archive date is announced with its stories');
    assert.equal(await page.evaluate(() => document.getElementById('dated').compareDocumentPosition(document.getElementById('articles')) & Node.DOCUMENT_POSITION_FOLLOWING), 4, 'beside the results, just above them');
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Today's not collected yet: yesterday's, and the line says which day it is.
  {
    const { page, errors } = await open('q/headlines.html?view=current', u => (/select=snapshot_date&/.test(u) ? [{ snapshot_date: yday }] : u.includes(`snapshot_date.gte.${today}`) ? [] : [row(yday, 1, '00:39')]), 390);
    await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
    await page.waitForSelector('.outlet-group .article');
    assert.equal(await page.textContent('#dated'), `Today’s front pages are not collected yet · showing those of ${name(yday)} (UTC day) · collected 00:39 UTC`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390 px: no sideways scroll');
    assert.deepEqual(errors, []);
    await page.close();
  }
  // A week's archive: the week's days, how many were collected and the latest's time, each story with its days.
  {
    const days = [iso(2), iso(1)];
    const { page, errors } = await open('q/headlines.html?view=archive&period=week', () => days.map(d => row(d, 1, '00:45')).concat([row(days[1], 2, '00:46')]).map(r => ({ ...r, url: `https://${r.outlet_domain}/same` })));
    await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
    await page.waitForSelector('#articles .article');
    const dated = await page.textContent('#dated');
    assert.match(dated, new RegExp(`^Front pages of \\d{1,2} [A-Z][a-z]{2} \\d{4} to \\d{1,2} [A-Z][a-z]{2} \\d{4} \\(UTC days\\) · 2 days collected, the latest ${name(days[1])}, collected 00:46 UTC · each story with its days on the front page$`));
    assert.match(await page.textContent('#articles .article .source'), new RegExp(`on the front page \\d days?, the last ${name(days[1])}`));
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('the archive is asked for each story\'s collection time', () => {
  assert.match(readFileSync(new URL('../q/supabase-client.js', import.meta.url), 'utf8'), /select: "snapshot_date,outlet,outlet_domain,outlet_rank,story_rank,title_original,title_en,url,published_at,lowbrow,captured_at"/);
});
