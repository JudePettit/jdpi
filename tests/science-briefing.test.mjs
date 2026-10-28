// Scientific Briefing (Natural Science): the classifier sorts items into the five disciplines and tells papers from
// news, the page's view logic reads deep links and orders "Major journals first", and the stored data
// (science/briefing/data/stories.json) is well formed, free of duplicates and inside its seven-day window.
// The page test runs where the submodule is deployed (JDPI_URL, e.g. http://localhost:8787, or the live site).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { DISCIPLINES, DISCIPLINE_IDS, classify, detectType, disciplineId, isDroppedTitle } from '../science/scripts/classify.mjs';
import { SOURCES, TIERS, KINDS, DEFAULT_CAP, outletId } from '../science/scripts/briefing-sources.mjs';
import { parseScienceFeed, normalise, mergeStore, urlKey, titleKey, SUMMARY_MAX } from '../science/scripts/briefing-feeds.mjs';
import { DEFAULTS, parseHash, toHash, filterItems, arrange, countByDiscipline } from '../science/briefing/view.js';

const DATA = JSON.parse(readFileSync(new URL('../science/briefing/data/stories.json', import.meta.url), 'utf8'));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const SRC = new Map(SOURCES.map(s => [s.id, s]));
const DAY = 864e5;

// ---- Catalogue and classifier ----------------------------------------------------------------------------------------
test('catalogue: unique feeds with known kinds, tiers and default disciplines', () => {
  assert.equal(SRC.size, SOURCES.length, 'feed ids are unique');
  for (const s of SOURCES) {
    assert.ok(KINDS[s.kind], `${s.id} kind`);
    assert.ok(TIERS[s.tier], `${s.id} tier`);
    assert.match(s.feed, /^https?:\/\//, `${s.id} feed URL`);
    for (const d of s.disciplines) assert.ok(DISCIPLINE_IDS.includes(d), `${s.id} default ${d}`);
  }
  assert.deepEqual(DISCIPLINE_IDS, ['physics', 'chemistry', 'biology', 'earth', 'space']);
  for (const d of DISCIPLINE_IDS) assert.ok(SOURCES.some(s => s.disciplines.includes(d)), `a specialist feed for ${d}`);
  for (const id of ['nature', 'science', 'cell', 'pnas', 'prl']) assert.equal(SRC.get(id)?.tier, 1, `${id} is a flagship journal`);
});

test('classifier: multidisciplinary feeds are classed by keywords', () => {
  const cases = [
    ['Entanglement between two superconducting qubits across a cryogenic link', ['physics']],
    ['A copper catalyst for selective electrochemical reduction of CO2 to ethylene', ['chemistry']],
    ['CRISPR screen reveals genes that control T cell exhaustion in tumours', ['biology']],
    ['Antarctic ice-sheet melt accelerates sea-level rise', ['earth']],
    ['JWST detects carbon dioxide in the atmosphere of a hot Jupiter exoplanet', ['space']],
    ['Perovskite solar cells with 27% efficiency', ['physics', 'chemistry']],           // a solar cell is not astronomy
    ['A neural network predicts protein structures from sequence', ['biology']],         // nor is a neural network neuroscience
    ['Dust storms on Mars lift water into the upper atmosphere', ['space']],
    ['Spin‐Orbit Torque Switching in Antiferromagnets', ['physics']],                    // U+2010 hyphen
    ['Science funding faces deep cuts in the new budget', []],                           // general: shown under All only
    ['Climate of fear in the lab environment', []],
  ];
  for (const [title, want] of cases) assert.deepEqual(classify({ title }, []), want, title);
  assert.deepEqual(classify({ title: 'Solar storm sparks auroras at low latitudes', summary: 'A geomagnetic storm triggered by a coronal mass ejection lit up the sky.' }, []), ['space']);
});

test('classifier: specialist feeds keep their defaults and add only strongly indicated disciplines', () => {
  assert.deepEqual(classify({ title: 'Spin liquid ground state in a kagome magnet' }, ['physics']), ['physics']);
  assert.deepEqual(classify({ title: 'Thermal stability of enzymes in living cells', summary: 'protein folding in bacteria' }, ['physics']), ['physics', 'biology']);
  assert.deepEqual(classify({ title: 'Clouds on a lava planet challenge what astronomers expected' }, ['space']), ['space']);
  assert.deepEqual(classify({ title: 'A short note' }, ['space', 'physics']), ['physics', 'space'], 'canonical order');
  assert.deepEqual(classify({ title: 'A short note' }, ['astrology']), [], 'unknown defaults are ignored');
});

test('classifier: papers, news and dropped items', () => {
  const J = { kind: 'journal' }, N = { kind: 'news' };
  const cases = [
    [{ title: 'Author Correction: Quantum dots in cells' }, J, null],
    [{ title: 'Erratum to: Ice cores from Greenland' }, J, null],
    [{ title: 'A study', genres: ['Correction'] }, J, null],
    [{ title: 'A post', categories: ['Sponsored'] }, N, null],
    [{ title: 'Webinar: how to publish open access' }, N, null],
    [{ title: 'Publications' }, N, null],                                                 // a bare site page
    [{ title: 'Publications of the year' }, N, 'news'],
    [{ title: 'Seeing the unseen', genres: ['News & Views'] }, J, 'news'],
    [{ title: 'A new look at old bones', genres: ['Perspective'] }, J, 'news'],
    [{ title: 'Mapping a protein', genres: ['Research Article'] }, J, 'paper'],
    [{ title: 'Why it matters', doi: '10.1038/d41586-026-03108-w' }, J, 'news'],          // Nature magazine content
    [{ title: 'ctDNA clearance and outcomes', doi: '10.1038/s41586-026-11328-3' }, J, 'paper'],
    [{ title: 'Rubin finds a dwarf planet', genres: ['Research Article'] }, N, 'news'],   // everything from a science desk
  ];
  for (const [item, source, want] of cases) assert.equal(detectType(item, source), want, item.title);
  assert.ok(isDroppedTitle('  Retraction Note: X ') && !isDroppedTitle('Retractable landing gear for Mars drones'));
  assert.deepEqual(['astronomy', 'Climate', 'life', 'physics', 'all', 'astrology', ''].map(disciplineId), ['space', 'earth', 'biology', 'physics', null, null, null]);
});

test('feeds: an RSS 1.0 table of contents parses, normalises and drops corrections', () => {
  const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
    <item rdf:about="https://www.nature.com/articles/s41567-026-01234-5"><title>Quantum spin liquid in a kagome magnet</title>
      <link>https://www.nature.com/articles/s41567-026-01234-5?utm_source=rss</link>
      <description>&lt;p&gt;Frustrated magnets ${'host exotic ground states '.repeat(20)}&lt;/p&gt;</description>
      <dc:type>Article</dc:type><dc:date>2026-10-27</dc:date><prism:doi>10.1038/s41567-026-01234-5</prism:doi></item>
    <item rdf:about="https://www.nature.com/articles/s41567-026-09999-9"><title>Author Correction: Something</title>
      <link>https://www.nature.com/articles/s41567-026-09999-9</link><dc:date>2026-10-27</dc:date></item>
  </rdf:RDF>`;
  const raw = parseScienceFeed(xml);
  assert.equal(raw.length, 2);
  assert.equal(raw[0].doi, '10.1038/s41567-026-01234-5');
  assert.equal(raw[0].published, '2026-10-27T00:00:00.000Z', 'date-only feeds give midnight UTC');
  const source = SRC.get('nphys') || { id: 'nphys', kind: 'journal', tier: 2, disciplines: ['physics'] };
  const item = normalise(raw[0], source, '2026-10-27T21:00:00.000Z');
  assert.equal(item.type, 'paper');
  assert.deepEqual(item.disciplines, ['physics']);
  assert.ok(!item.url.includes('utm_source'), 'tracking parameters go');
  assert.ok(item.summary.length > 0 && item.summary.length <= SUMMARY_MAX, 'summary clipped');
  assert.match(item.id, /^[0-9a-f]{12}$/);
  assert.equal(normalise(raw[1], source, '2026-10-27T21:00:00.000Z'), null);
});

test('store: duplicates merge into the highest tier, stale and dropped items leave', () => {
  const now = Date.parse('2026-10-28T00:00:00Z');
  const base = { kind: 'news', tier: 3, type: 'news', summary: '', disciplines: [] };
  const merged = mergeStore({
    prevItems: [
      { ...base, id: 'a1', title: 'Publications', url: 'https://www.nasa.gov/publications/', source: 'nasa-science', published: '2026-10-27T20:00:00.000Z' },
      { ...base, id: 'a2', title: 'An old story about neutrinos', url: 'https://phys.org/news/old.html', source: 'physorg-physics', published: '2026-10-19T12:00:00.000Z' },
    ],
    freshItems: [
      { ...base, id: 'b1', title: 'Physicists trap a single positron in a cyclotron', url: 'https://phys.org/news/positron.html', source: 'physorg-physics', published: '2026-10-27T15:00:00.000Z', doi: '10.1103/gbkc-6nlj' },
      { ...base, id: 'b2', kind: 'journal', tier: 1, type: 'paper', title: 'One-Positron Quantum Cyclotron', url: 'http://link.aps.org/doi/10.1103/gbkc-6nlj', source: 'prl', published: '2026-10-27T10:00:00.000Z', doi: '10.1103/gbkc-6nlj' },
    ],
    sources: SOURCES, now, keepDays: 7,
  });
  assert.deepEqual(merged.map(i => i.id), ['b2']);
  assert.equal(merged[0].source, 'prl');
  assert.deepEqual(merged[0].also, ['physorg-physics']);
  assert.deepEqual(merged[0].disciplines, ['physics']);
});

// ---- View logic (science/briefing/view.js) ---------------------------------------------------------------------------
test('view: deep links (#d=<discipline>) and the URL hash', () => {
  const D = DATA.disciplines;
  assert.deepEqual(parseHash('#d=astronomy&type=news&w=7d&sort=newest', D), { ...DEFAULTS, d: 'space', type: 'news', w: '7d', sort: 'newest' });
  assert.equal(parseHash('#d=physics', D).d, 'physics');
  assert.equal(parseHash('#discipline=climate', D).d, 'earth');
  assert.equal(parseHash('#d=nonsense', D).d, 'all');
  assert.equal(parseHash('#type=papers', D).type, 'paper');
  assert.equal(parseHash('#type=news', D).type, 'news');
  assert.equal(parseHash('#type=bogus', D).type, 'both');
  assert.equal(parseHash('#w=30d', D).w, '3d');
  assert.equal(parseHash('#sort=random', D).sort, 'tier');
  assert.equal(parseHash('#tab=sources', D).tab, 'sources');
  assert.equal(parseHash('#src=Nature!&q=quantum%20dots', D).src, 'nature');
  assert.equal(parseHash('', D, { d: 'chemistry' }).d, 'chemistry', 'a remembered discipline fills in');
  assert.equal(parseHash('#d=all', D, { d: 'chemistry' }).d, 'all', 'the link wins over the remembered discipline');
  assert.equal(toHash(DEFAULTS), '');
  const s = { ...DEFAULTS, d: 'biology', type: 'paper', w: '24h', src: 'cell', q: 'gene editing', sort: 'newest', tab: 'stories' };
  assert.equal(toHash(s), '#d=biology&type=paper&w=24h&src=cell&q=gene+editing&sort=newest');
  assert.deepEqual(parseHash(toHash(s), D), s);
});

test('view: filters and "Major journals first" ordering', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const outletOf = id => ({ prl: { id: 'physical-review-letters', name: 'Physical Review Letters' }, prx: { id: 'physical-review-x', name: 'Physical Review X' }, sciam: { id: 'scientific-american', name: 'Scientific American' } })[id] || null;
  const items = [
    { id: 'n', source: 'sciam', tier: 3, type: 'news', disciplines: ['space'], title: 'Rubin sees a new dwarf planet', summary: '', published: '2026-10-27T13:00:00.000Z' },
    { id: 'p2', source: 'prx', tier: 2, type: 'paper', disciplines: ['physics'], title: 'Twinned dynamical decoupling', summary: '', published: '2026-10-27T12:00:00.000Z' },
    { id: 'p1', source: 'prl', tier: 1, type: 'paper', disciplines: ['physics', 'space'], title: 'Gravitational waves from a quantum sensor', summary: '', published: '2026-10-27T11:00:00.000Z' },
    { id: 'old', source: 'prl', tier: 1, type: 'paper', disciplines: ['physics'], title: 'Quantum cyclotron', summary: '', published: '2026-10-22T11:00:00.000Z' },
  ];
  const ids = (st, o = {}) => filterItems(items, { ...DEFAULTS, ...st }, { now, outletOf, ...o }).map(i => i.id);
  assert.deepEqual(ids({}), ['n', 'p2', 'p1']);
  assert.deepEqual(ids({ w: '7d' }), ['n', 'p2', 'p1', 'old']);
  assert.deepEqual(ids({ d: 'space' }), ['n', 'p1']);
  assert.deepEqual(ids({ type: 'paper' }), ['p2', 'p1']);
  assert.deepEqual(ids({ src: 'physical-review-letters', w: '7d' }), ['p1', 'old']);
  assert.deepEqual(ids({ q: 'QUANTUM sensor' }), ['p1']);
  assert.deepEqual(ids({ q: 'scientific american' }), ['n'], 'search covers the outlet name');
  const inWindow = filterItems(items, DEFAULTS, { now, outletOf });
  assert.deepEqual(arrange(inWindow, 'tier')[0].items.map(i => i.id), ['p1', 'p2', 'n'], 'flagship first');
  assert.deepEqual(arrange(inWindow, 'newest')[0].items.map(i => i.id), ['n', 'p2', 'p1']);
  assert.deepEqual(arrange(items, 'tier').map(g => g.key), ['2026-10-27', '2026-10-22'], 'newest day first');
  assert.deepEqual(countByDiscipline(inWindow, DISCIPLINES), { all: 3, physics: 2, chemistry: 0, biology: 0, earth: 0, space: 2 });
});

// ---- Stored data -------------------------------------------------------------------------------------------------------
test('data: stories.json has the expected shape', () => {
  const generated = Date.parse(DATA.generated);
  assert.ok(Number.isFinite(generated) && DATA.generated === new Date(generated).toISOString(), 'generated is an ISO time');
  assert.equal(DATA.keepDays, 7);
  assert.deepEqual(DATA.disciplines.map(d => d.id), DISCIPLINE_IDS);
  assert.deepEqual(DATA.tiers, Object.fromEntries(Object.entries(TIERS)));
  assert.deepEqual(DATA.kinds, KINDS);
  assert.deepEqual(DATA.sources.map(s => s.id).sort(), SOURCES.map(s => s.id).sort(), 'one status per catalogued feed');
  for (const s of DATA.sources) {
    assert.ok(['ok', 'error'].includes(s.status), `${s.id} status`);
    if (s.status === 'error') assert.ok(s.error, `${s.id} error message`);
    assert.equal(s.outletId, outletId(s.outlet), `${s.id} outletId`);
    assert.ok(Number.isInteger(s.count) && Number.isInteger(s.stored) && s.stored >= 0, `${s.id} counts`);
  }
  assert.ok(DATA.counts.working >= Math.ceil(DATA.counts.feeds * 0.75), `${DATA.counts.working} of ${DATA.counts.feeds} feeds working`);
  assert.ok(DATA.items.length >= 100 && DATA.items.length <= DATA.maxItems, `${DATA.items.length} items`);

  for (const i of DATA.items) {
    const s = SRC.get(i.source), where = `${i.id} ${i.title}`;
    assert.match(i.id, /^[0-9a-f]{12}$/, where);
    assert.ok(typeof i.title === 'string' && i.title.trim() && i.title.length <= 300, where);
    assert.ok(!isDroppedTitle(i.title), `dropped title kept: ${where}`);
    assert.match(i.url, /^https?:\/\/[^\s]+$/, where);
    assert.ok(s, `unknown source: ${where}`);
    assert.equal(i.kind, s.kind, where);
    assert.equal(i.tier, s.tier, where);
    assert.ok(['paper', 'news'].includes(i.type), where);
    if (s.kind === 'news') assert.equal(i.type, 'news', `science-desk item typed as paper: ${where}`);
    assert.deepEqual(i.disciplines, DISCIPLINE_IDS.filter(d => i.disciplines.includes(d)), `disciplines in canonical order, no repeats: ${where}`);
    for (const d of s.disciplines) assert.ok(i.disciplines.includes(d), `feed default ${d} missing: ${where}`);
    assert.equal(typeof i.summary, 'string', where);
    assert.ok(i.summary.length <= SUMMARY_MAX, `summary too long: ${where}`);
    if (i.doi !== undefined) assert.match(i.doi, /^10\.\d{4,9}\/\S+$/, where);
    if (i.also !== undefined) {
      assert.ok(Array.isArray(i.also) && i.also.length && new Set(i.also).size === i.also.length, where);
      for (const a of i.also) assert.ok(SRC.has(a) && a !== i.source, `also ${a}: ${where}`);
    }
  }
  const by = f => DATA.items.filter(f).length;
  assert.equal(DATA.counts.items, DATA.items.length);
  assert.equal(DATA.counts.papers, by(i => i.type === 'paper'));
  assert.equal(DATA.counts.news, by(i => i.type === 'news'));
  assert.equal(DATA.counts.general, by(i => !i.disciplines.length));
  for (const d of DISCIPLINE_IDS) {
    assert.equal(DATA.counts.disciplines[d], by(i => i.disciplines.includes(d)), d);
    assert.ok(DATA.counts.disciplines[d] > 0, `no items for ${d}`);
  }
  for (const s of SOURCES) assert.ok(by(i => i.source === s.id) <= (s.cap || DEFAULT_CAP), `${s.id} over its cap`);
});

test('data: no duplicate items', () => {
  const seen = { id: new Map(), doi: new Map(), url: new Map() };
  for (const i of DATA.items) {
    for (const [k, v] of [['id', i.id], ['doi', i.doi?.toLowerCase()], ['url', urlKey(i.url)]]) {
      if (!v) continue;
      assert.ok(!seen[k].has(v), `same ${k}: "${i.title}" and "${seen[k].get(v)}"`);
      seen[k].set(v, i.title);
    }
  }
  // Identical titles within three days of each other are merged by the build.
  const byTitle = new Map();
  for (const i of DATA.items) {
    const k = titleKey(i.title);
    if (k.length <= 12) continue;
    for (const t of byTitle.get(k) || []) assert.ok(Math.abs(t - Date.parse(i.published)) > 3 * DAY, `duplicate title: ${i.title}`);
    byTitle.set(k, [...(byTitle.get(k) || []), Date.parse(i.published)]);
  }
});

test('data: every item is dated inside the seven-day window', () => {
  const generated = Date.parse(DATA.generated), from = generated - DATA.keepDays * DAY, to = generated + 36 * 36e5;
  for (const i of DATA.items) {
    const t = Date.parse(i.published);
    assert.ok(Number.isFinite(t) && i.published === new Date(t).toISOString(), `published is ISO: ${i.title}`);
    assert.ok(t >= from && t <= to, `${i.published} outside ${new Date(from).toISOString()} … ${DATA.generated}: ${i.title}`);
  }
  const days = new Set(DATA.items.map(i => i.published.slice(0, 10)));
  assert.ok(days.size >= 3, 'items span several days');
  for (const s of DATA.sources) if (s.latest) assert.ok(Date.parse(s.latest) <= to, `${s.id} latest in the future`);
});

// ---- Page ----------------------------------------------------------------------------------------------------------------
test('page: deep link, papers/news toggle and the Sources tab at phone width', async t => {
  const live = await fetch(`${BASE}/science/briefing/data/stories.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.items) { t.skip(`Scientific Briefing is not deployed at ${BASE} (set JDPI_URL to test a local copy)`); return; }
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/science/briefing/#d=astronomy&type=news&w=7d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#chips button', { timeout: 20000 });
    assert.equal(await page.getAttribute('#chips [data-v="space"]', 'aria-pressed'), 'true', 'alias deep link selects Astronomy & Space');
    assert.equal(await page.getAttribute('#type [data-v="news"]', 'aria-pressed'), 'true');
    const badges = await page.$$eval('#list .entry .badge', els => els.map(e => e.textContent.trim()));
    assert.ok(badges.length && badges.every(b => b === 'News'), 'only news');
    assert.equal(await page.textContent('#toc-title'), 'Astronomy & Space · last 7 days');
    await page.click('#type [data-v="paper"]');
    assert.match(await page.evaluate(() => location.hash), /type=paper/);
    assert.ok((await page.$$eval('#list .entry .badge', els => els.map(e => e.textContent.trim()))).every(b => b === 'Paper'), 'only papers');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 390px');
    await page.click('#tab-sources');
    assert.equal(await page.isHidden('#panel-stories'), true);
    assert.equal(await page.$$eval('#src-rows tr', rows => rows.length), live.sources.length, 'one row per feed');
    assert.match(await page.evaluate(() => location.hash), /tab=sources/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
