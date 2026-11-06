// Kino (Vitruvian Manager's documentary module): the script format, links into the suite, sources, the built data, the speech rules and
// the validator itself. The page tests run when JDPI_URL is set (e.g. JDPI_URL=http://localhost:8787), and never with
// PRP_PAGES=0 (the refresh workflows' check before they commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, validateAll, validateScript, checkLink, validCountry, HISTORICAL } from '../kino/scripts/validate.mjs';
import { CATEGORY_IDS, VISUAL_KINDS, flatScenes, shortCite } from '../kino/lib/format.js';
import { tokens, sentences, utterances, wordAt, spoken, speechRule, countSentences, speechWarnings } from '../kino/lib/text.js';
import { shellHash, shellUrl, readKinoHash, kinoHash, filmRoute } from '../kino/lib/links.js';
import '../design/prp-voice.js';
import { pageTest, launch } from './tools/pages.mjs';
import { readKinoView, kinoViewHash, linkPlace, SHELL_URL } from '../kino/lib/links.js';
import { relatedPlaces, sceneEntities, tagTables, shardOf, CHIPS, PER_THING, MAP_COUNTRIES } from '../kino/lib/related.js';
import { sentenceRuns } from '../kino/lib/text.js';
import { existsSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const ctx = loadContext();
const results = validateAll(ctx);
const docs = [...ctx.docs.values()];
const clone = o => JSON.parse(JSON.stringify(o));
// The shell's listener accepts only shell routes (shell.js, 'prp:navigate').
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;

test('scripts: every documentary passes the validator', () => {
  assert.ok(results.length >= 2, 'at least the two exemplars');
  for (const r of results) assert.deepEqual(r.errors, [], `${r.id}: ${r.errors.join('; ')}`);
  for (const r of results) assert.deepEqual(r.warnings, [], `${r.id}: ${r.warnings.join('; ')}`);
});

test('scripts: the exemplars, and every kind of visual in use', () => {
  const ww2 = ctx.docs.get('ww2-europe'), wc = ctx.docs.get('winston-churchill');
  assert.equal(ww2?.category, 'wars');
  assert.equal(wc?.category, 'political-figures');
  for (const d of [ww2, wc]) { const n = flatScenes(d).length; assert.ok(n >= 10 && n <= 14, `${d.id}: ${n} scenes`); }
  const kinds = new Set(docs.flatMap(d => flatScenes(d).map(s => s.visual.kind)));
  for (const k of VISUAL_KINDS) assert.ok(kinds.has(k), `no scene uses the ${k} visual`);
  for (const d of docs) assert.ok(CATEGORY_IDS.includes(d.category));
});

test('focus: every highlighted country is a valid ISO3 code the map can draw', () => {
  const iso = read('kino/data/iso.json'), atlasIds = new Set(Object.values(iso.codes));
  for (const d of docs) for (const s of flatScenes(d)) {
    const codes = [...(s.focus?.countries || []), ...(s.visual.groups || []).flatMap(g => g.countries)];
    for (const c of codes) {
      assert.match(c, /^[A-Z]{3}$/, `${d.id}/${s.id}: ${c}`);
      assert.ok(validCountry(c, ctx), `${d.id}/${s.id}: ${c} is not a known ISO3 code`);
      for (const k of HISTORICAL[c] || [c]) assert.ok(iso.codes[k] || iso.byName?.[k], `${d.id}/${s.id}: ${k} has no map shape in iso.json`);
    }
    for (const p of s.focus?.points || []) assert.ok(Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 && p[2], `${d.id}/${s.id}: point ${p}`);
  }
  assert.ok(atlasIds.has('826') && atlasIds.has('616'), 'United Kingdom and Poland have their ISO numeric ids');
});

test('links: every scene link opens a real place in PRP, through the shell', () => {
  const targets = new Set();
  for (const d of docs) for (const s of flatScenes(d)) {
    if (!s.link) continue;
    assert.deepEqual(checkLink(s.link, ctx), [], `${d.id}/${s.id}`);
    if (s.link.suite !== 'kino') assert.match(shellHash(s.link), SHELL_ROUTE, `${d.id}/${s.id}: the shell would refuse ${shellHash(s.link)}`);
    targets.add(`${d.id} ${s.link.module}`);
  }
  // The war documentary follows War Focus (war "ww2") and Retrospective Battlefield; Churchill reaches four modules.
  const ww2 = flatScenes(ctx.docs.get('ww2-europe')).filter(s => s.link);
  assert.ok(ww2.filter(s => s.link.module === 'war-focus' && /#war=ww2&m=\d{4}-\d{2}$/.test(s.link.at)).length >= 5);
  assert.ok(ww2.some(s => s.link.module === 'battlefield-history' && /w=c139/.test(s.link.at)));
  assert.ok(new Set(flatScenes(ctx.docs.get('winston-churchill')).filter(s => s.link).map(s => s.link.suite)).size >= 3);
  // And the checks bite: a month outside the war, an unknown QID and a page that is not the module's are refused.
  assert.ok(checkLink({ label: 'x', suite: 'rs', module: 'war-focus', at: 'battlefield/focus/index.html#war=ww2&m=1946-01' }, ctx).length);
  assert.ok(checkLink({ label: 'x', suite: 'rs', module: 'encyclopedia', at: 'encyclopedia/index.html#Q1' }, ctx).length);
  assert.ok(checkLink({ label: 'x', suite: 'rs', module: 'war-focus', at: 'q/national.html#country=GBR' }, ctx).length);
  assert.ok(checkLink({ label: 'x', suite: 'rs', module: 'historical-calendar', at: 'q/calendar.html?period=history&month=1975-01' }, ctx).length);
  assert.ok(checkLink({ label: 'x', suite: 'rt', module: 'atlas', at: 'https://political-atlas.pages.dev/#BRA' }, ctx).length);
});

test('sources: scholarly works and Wikidata behind every documentary, cited scene by scene', () => {
  for (const d of docs) {
    const ids = new Set(d.sources.map(s => s.id));
    assert.ok(d.sources.filter(s => s.kind === 'book' || s.kind === 'article').length >= 4, `${d.id}: scholarly sources`);
    assert.ok(d.sources.some(s => s.kind === 'wikidata'), `${d.id}: Wikidata`);
    for (const s of d.sources) if (s.kind === 'book') assert.ok(s.author && s.title && s.year && s.publisher, `${d.id}: ${s.id}`);
    for (const s of flatScenes(d)) {
      assert.ok(s.cites?.length, `${d.id}/${s.id} cites no source`);
      for (const c of s.cites) assert.ok(ids.has(c), `${d.id}/${s.id}: ${c}`);
      if (s.visual.kind === 'chart' && /death|dead|killed|murder/i.test(s.visual.title + s.visual.data.map(r => r.label).join(' '))) {
        for (const r of s.visual.data) assert.ok(r.low <= r.high, `${d.id}/${s.id}: casualty figures as ranges`);
      }
    }
  }
  assert.equal(shortCite({ kind: 'book', author: 'David M. Glantz and Jonathan M. House', year: 1995 }), 'Glantz & House 1995');
  assert.equal(shortCite({ kind: 'web', publisher: 'Yad Vashem', title: 'x' }), 'Yad Vashem');
});

test('sources: short citations name the first author\'s family name, "A & B", or "A et al."', () => {
  const cite = (author, extra = {}) => shortCite({ kind: 'book', author, year: 1995, ...extra });
  // Natural order: the family name is the last word (with its particles, without Jr), and lists may use commas.
  assert.equal(cite('Antony Beevor'), 'Beevor 1995');
  assert.equal(cite('Charles Hirschman, Samuel Preston and Vu Manh Loi'), 'Hirschman et al. 1995');
  assert.equal(cite('Charles Hirschman, Samuel Preston, and Vu Manh Loi'), 'Hirschman et al. 1995');
  assert.equal(cite('Prashant Bharadwaj; Asim Khwaja; Atif Mian'), 'Bharadwaj et al. 1995');
  assert.equal(cite('Karl Marx & Friedrich Engels'), 'Marx & Engels 1995');
  assert.equal(cite('Wojciech Materski and Tomasz Szarota (eds)'), 'Materski & Szarota 1995');
  assert.equal(cite('Ian Kershaw et al.'), 'Kershaw et al. 1995');
  assert.equal(cite('Charles de Gaulle'), 'de Gaulle 1995');
  assert.equal(cite('Martin Luther King Jr.'), 'King 1995');
  // "Surname, Given", alone, in lists, and in the APA style.
  assert.equal(cite('Beevor, Antony'), 'Beevor 1995');
  assert.equal(cite('Garton Ash, Timothy'), 'Garton Ash 1995');
  assert.equal(cite('Glantz, David M. and Jonathan M. House'), 'Glantz & House 1995');
  assert.equal(cite('Glantz, David M., and House, Jonathan M.'), 'Glantz & House 1995');
  assert.equal(cite('Hirschman, Charles; Preston, Samuel; Vu, Manh Loi'), 'Hirschman et al. 1995');
  assert.equal(cite('Hirschman, C., Preston, S., & Vu, M. L.'), 'Hirschman et al. 1995');
  assert.equal(cite('King, Martin Luther, Jr.'), 'King 1995');
  // "cite" overrides the rule where it would be wrong (family name first, two-word surnames); "short" still works.
  assert.equal(cite('Shen Zhihua', { cite: 'Shen 2012' }), 'Shen 2012');
  assert.equal(cite('Timothy Garton Ash', { short: 'Garton Ash 1990' }), 'Garton Ash 1990');
  assert.equal(shortCite({ kind: 'wikidata', title: 'World War II (Q362)' }), 'Wikidata');
  // The scripts keep their authors' natural names.
  const src = (doc, id) => ctx.docs.get(doc).sources.find(s => s.id === id);
  assert.equal(src('korean-war', 'shen-2012').author, 'Shen Zhihua');
  assert.equal(shortCite(src('korean-war', 'shen-2012')), 'Shen 2012');
  assert.equal(shortCite(src('vietnam-war', 'hirschman-1995')), 'Hirschman et al. 1995');
  for (const d of docs) for (const s of d.sources) assert.match(shortCite(s), /\S/, `${d.id}: ${s.id} has a short citation`);
});

test('data: the catalogue, images and country codes match the scripts', () => {
  const index = read('kino/data/index.json'), media = read('kino/data/media.json');
  assert.deepEqual(index.categories.map(c => c.id), CATEGORY_IDS);
  assert.deepEqual(index.docs.map(d => d.id).sort(), docs.map(d => d.id).sort());
  for (const e of index.docs) {
    const d = ctx.docs.get(e.id);
    assert.equal(e.scenes, flatScenes(d).length, e.id);
    assert.equal(e.title, d.title);
    assert.equal(read(`kino/data/${e.path}`).id, e.id);
    for (const s of e.subjects) assert.match(s.qid, /^Q\d+$/);
  }
  for (const d of docs) for (const s of flatScenes(d).filter(x => x.visual.kind === 'portrait')) {
    const file = s.visual.file || media.qids[s.visual.qid], m = media.files[file];
    assert.ok(m, `${d.id}/${s.id}: no image resolved`);
    assert.match(m.src, /^https:\/\/[a-z.]*wikimedia\.org\//);
    assert.ok(m.licence && (m.artist || m.credit) && m.page, `${d.id}/${s.id}: credit and licence`);
  }
  for (const [cat, items] of Object.entries(index.plan)) { assert.ok(CATEGORY_IDS.includes(cat)); for (const p of items) if (p.qid) assert.match(p.qid, /^Q\d+$/); }
});

test('speech: a full stop with no space after it is "point" between digits and "dot" between letters', () => {
  assert.equal(speechRule('5.6 million'), '5 point 6 million');
  assert.equal(speechRule('0.73'), '0 point 7 3');
  assert.equal(speechRule('about .5'), 'about point 5');
  assert.equal(speechRule('jdpi.pages.dev'), 'jdpi dot pages dot dev');
  assert.equal(spoken('1939–1945'), '1939 to 1945');
  assert.equal(spoken('26–27'), '26 to 27');
  // Sentences end only where a full stop is followed by a space (or the end).
  assert.deepEqual(sentences('Poland lost between 5.6 and 5.8 million. The rows overlap.'), ['Poland lost between 5.6 and 5.8 million.', 'The rows overlap.']);
  assert.equal(countSentences('It cost 5.1 million lives. See jdpi.pages.dev for more.'), 2);
  const [u] = utterances('Between 5.6 and 5.8 million.');
  assert.equal(u.text, 'Between 5 point 6 and 5 point 8 million.');
  assert.equal(tokens('Between 5.6 and 5.8 million.')[wordAt(u, u.text.indexOf('point 8'))], '5.8');
  assert.ok(speechWarnings('The U.S. joined').length && speechWarnings('Mr. Churchill').length);
  for (const d of docs) for (const s of flatScenes(d)) assert.deepEqual(speechWarnings(s.narration), [], `${d.id}/${s.id}`);
});

test('validator: refuses broken scripts and accepts a course with parts and a quiz', () => {
  const doc = clone(ctx.docs.get('ww2-europe'));
  const s = doc.scenes[2];
  s.narration = 'One sentence only.';
  s.focus.countries.push('XYZ');
  s.link.at = 'battlefield/focus/index.html#war=ww2&m=1950-01';
  doc.scenes[12].visual.data[0] = { label: 'Soviet Union, all deaths', value: 26 };
  doc.scenes[1].cites = ['nobody-1999'];
  const { errors } = validateScript(doc, ctx);
  for (const want of [/2 to 5/, /XYZ/, /no month "1950-01"/, /range/, /nobody-1999/]) assert.ok(errors.some(e => want.test(e)), `expected ${want}: ${errors.join(' | ')}`);

  const wc = ctx.docs.get('winston-churchill'), scene = id => clone(wc.scenes.find(x => x.id === id));
  const course = {
    id: 'test-course', title: 'A test course', category: 'great-thinkers', subjects: [{ qid: 'Q9317', label: 'John Maynard Keynes' }], era: [1883, 1946],
    summary: 'A fixture.', minutes: 3, sources: wc.sources,
    parts: [{ id: 'one', title: 'Part one', scenes: [scene('opening'), scene('early-life')] }, { id: 'two', title: 'Part two', scenes: [scene('between-wars'), scene('munich')] }],
    quiz: [{ q: 'When did Britain return to gold?', options: ['1919', '1925', '1931'], answer: 1, explain: 'In the budget of April 1925.' }],
  };
  const r = validateScript(course, ctx);
  assert.deepEqual(r.errors, []);
  assert.equal(flatScenes(course).length, 4);
  assert.equal(flatScenes(course)[2].partTitle, 'Part two');
  assert.ok(validateScript({ ...course, quiz: [{ q: 'x', options: ['a'], answer: 3 }] }, ctx).errors.length);
});

test('links: shell routes and Kino deep links', () => {
  const link = { label: 'War Focus · September 1939', suite: 'rs', module: 'war-focus', at: 'battlefield/focus/index.html#war=ww2&m=1939-09' };
  assert.equal(shellHash(link), `#/rs/war-focus?at=${encodeURIComponent('https://jdpi.pages.dev/battlefield/focus/index.html#war=ww2&m=1939-09')}`);
  assert.match(shellHash(link, 'http://localhost:8787/'), SHELL_ROUTE);
  assert.match(shellUrl(link), /^https:\/\/jdpi\.pages\.dev\/#\/rs\/war-focus\?at=https%3A/);
  assert.equal(shellHash({ ...link, suite: 'rt', module: 'atlas', at: 'https://political-atlas.pages.dev/#GBR' }), `#/rt/atlas?at=${encodeURIComponent('https://political-atlas.pages.dev/#GBR')}`);
  assert.deepEqual(readKinoHash(kinoHash('ww2-europe', 'poland')), { doc: 'ww2-europe', s: 'poland' });
  assert.deepEqual(readKinoHash('#doc=winston-churchill&s=3'), { doc: 'winston-churchill', s: '3' });
  assert.equal(kinoHash(null), '');
  // The now-playing bar's "Back to film": the film at its scene, in the category page that plays it.
  const back = filmRoute('wars', 'korean-war', 'inchon', 'http://localhost:8787/');
  assert.match(back, SHELL_ROUTE);
  assert.equal(back, `#/kino/kino-wars?at=${encodeURIComponent('http://localhost:8787/kino/index.html?cat=wars#doc=korean-war&s=inchon')}`);
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page' };
test('page: catalogue, deep link, map, captions-only playback with highlighted words', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/kino/index.html?cat=wars`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.kn-card[data-doc="ww2-europe"]', { timeout: 20000 });
    assert.match(await page.locator('#cat-title').innerText(), /Wars/);
    await page.goto(`${BASE}/kino/index.html?cat=wars#doc=ww2-europe&s=poland`, { waitUntil: 'domcontentloaded' });
    // The stage's map, not a catalogue card's preview map (those use the same classes and stay in the page, hidden).
    await page.waitForSelector('.kn-stage svg.kn-map path.c.t1', { timeout: 30000 });
    assert.equal(await page.locator('#badge').innerText(), '3 / 14');
    const scene = flatScenes(ctx.docs.get('ww2-europe'))[2];
    assert.equal(await page.locator('#cap-text .w').count(), tokens(scene.narration).length);
    assert.equal(await page.locator('svg.kn-map path.c[data-iso="POL"].t1').count(), 1);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /s=west-1940/.test(location.hash));
    await page.locator('#voice').click(); // captions only: no voice needed in the test browser
    await page.locator('#play').click();
    await page.waitForSelector('#cap-text .w.on', { timeout: 10000 });
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: inside the shell, a scene link moves the shell to that place', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    // Serve the registry with Kino's submodules live, as they will be once published.
    await page.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      for (const m of reg.suites.find(s => s.id === 'kino')?.modules || []) { m.url ||= m.pendingUrl; m.status = 'live'; }
      await route.fulfill({ json: reg });
    });
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#frames iframe.active', { timeout: 20000 })).contentFrame();
    await frame.waitForSelector('.kn-card[data-doc="ww2-europe"]', { timeout: 20000 });
    await frame.evaluate(() => { location.hash = '#doc=ww2-europe&s=poland'; });
    await frame.waitForSelector('[data-open-link]', { timeout: 20000 });
    await frame.locator('[data-open-link]').click();
    await page.waitForFunction(() => location.hash.startsWith('#/rs/war-focus?at='), null, { timeout: 10000 });
    assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /battlefield\/focus\/index\.html#war=ww2&m=1939-09/);
  } finally { await browser.close(); }
});

test('page: following along in the shell, the now-playing bar shows the film and controls it', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      for (const m of reg.suites.find(s => s.id === 'kino')?.modules || []) { m.url ||= m.pendingUrl; m.status = 'live'; }
      await route.fulfill({ json: reg });
    });
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const kino = await (await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 })).contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="korean-war"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=korean-war'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    await kino.waitForTimeout(1800); // the player settles its voice after 1.6 s
    if (await kino.evaluate(() => document.querySelector('#voice').getAttribute('aria-pressed') === 'true' && !document.querySelector('#voice').disabled)) await kino.click('#voice'); // captions only
    const bar = page.locator('#np');
    assert.equal(await bar.isHidden(), true, 'no bar while nothing follows along');

    // Follow along: the shell opens the first scene's place and the bar takes over the captions and controls.
    await kino.click('#follow');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/battlefield-history?at='), null, { timeout: 10000 });
    await bar.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await bar.getAttribute('aria-label'), 'Now playing in Kino');
    assert.match((await page.locator('.np-head').innerText()).replace(/\s+/g, ' '), /^Kino · The Korean War, 1950–1953 · 1\/12$/);
    assert.equal(await page.locator('#np-cap').getAttribute('aria-live'), 'polite');
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Pause', null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#np-play').getAttribute('aria-label') === 'Pause');
    const first = flatScenes(ctx.docs.get('korean-war'))[0], caption = await page.locator('#np-cap').textContent();
    assert.ok(caption.length > 20 && sentences(first.narration).includes(caption), `the caption is the sentence being read: "${caption}"`);

    // Next, three times: the shell follows each scene's place, one frame per submodule, the bar keeps count.
    for (const [n, where] of [[2, '#/rs/encyclopedia?at='], [3, '#/rs/encyclopedia?at='], [4, '#/rs/war-focus?at=']]) {
      await page.click('#np-next');
      await page.waitForFunction(([n, where]) => location.hash.startsWith(where) && document.querySelector('#np-n').textContent === `${n}/12`, [n, where], { timeout: 10000 });
    }
    assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /#war=korean-war&m=1950-06$/);
    const modules = await page.locator('#frames iframe').evaluateAll(fs => fs.map(f => f.dataset.module));
    assert.deepEqual([...modules].sort(), ['battlefield-history', 'encyclopedia', 'kino-wars', 'war-focus']);
    assert.equal(await kino.evaluate(() => document.querySelector('#badge').textContent), '4 / 12');

    // Moving the shell yourself while the film follows along pauses it (it would otherwise drag the shell back); the
    // bar stays, and its Play resumes the film. Kino's own moves (Next above) never pause it.
    await page.evaluate(() => { location.hash = '#/rs/battlefield-history'; }); // a submodule already open: no new frame
    await page.waitForFunction(() => document.querySelector('#np-play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    assert.equal(await bar.isVisible(), true, 'the bar stays while paused');
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Pause', null, { timeout: 5000 });

    // Pause from the bar, then back to the film: Kino's frame shows at that scene and the bar goes.
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    await page.click('#np-back');
    await page.waitForFunction(() => location.hash.startsWith('#/kino/kino-wars?at='), null, { timeout: 5000 });
    assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /kino\/index\.html\?cat=wars#doc=korean-war&s=invasion$/);
    // The address changes a moment before the shell switches frames, so wait for the switch rather than racing it.
    await page.waitForFunction(() => document.querySelector('#frames iframe.active')?.dataset.module === 'kino-wars', null, { timeout: 5000 });
    assert.equal(await bar.isHidden(), true, 'no bar over Kino itself');
    assert.equal(await page.locator('#frames iframe').count(), 4);

    // Leaving Kino shows the bar again; its Stop ends the film and closes the bar; switching Follow along off takes it away.
    await page.click('#nav a[data-route="rs/war-focus"]');
    await bar.waitFor({ state: 'visible', timeout: 5000 });
    await page.click('#np-stop');
    await bar.waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await kino.evaluate(() => document.querySelector('#play').getAttribute('aria-label')), 'Play', 'Stop leaves the film paused in Kino');
    await page.click('#nav a[data-route="kino/kino-wars"]');
    await kino.click('#play');
    await page.click('#nav a[data-route="rs/war-focus"]');
    await bar.waitFor({ state: 'visible', timeout: 5000 });
    await page.click('#nav a[data-route="kino/kino-wars"]');
    await kino.click('#follow');
    await page.click('#nav a[data-route="rs/war-focus"]');
    await page.waitForTimeout(600);
    assert.equal(await bar.isHidden(), true, 'no bar once Follow along is off');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// For the test browser, in every frame: a speech engine with one British voice, each utterance kept (window.__spoken) and
// "said" in 150 ms; and audio as iOS allows it, an element playing only from inside a tap (a click in this frame or in the
// shell) or once it has played inside one, each play() kept (window.__plays) with whether it came inside a tap.
const FAKE_SPEECH = () => {
  const voices = [{ name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' }], spoken = (window.__spoken = []);
  const synth = { speaking: false, pending: false, paused: false, current: null, getVoices: () => voices, addEventListener() {}, resume() {},
    speak(u) { spoken.push(u.text); this.current = u; this.speaking = true; setTimeout(() => { if (this.current !== u) return; this.current = null; this.speaking = false; u.onend?.(); }, 150); },
    cancel() { const u = this.current; this.current = null; this.speaking = false; u?.onerror?.({ error: 'interrupted' }); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
};
const IOS_AUDIO = () => {
  addEventListener('click', () => { window.__tap = true; }, true);
  addEventListener('click', () => { window.__tap = false; });
  const inTap = () => { try { return window.__tap === true || window.top.__tap === true; } catch { return false; } };
  const blessed = new WeakSet(), play = HTMLMediaElement.prototype.play;
  window.__plays = [];
  HTMLMediaElement.prototype.play = function () {
    const tap = inTap();
    window.__plays.push({ src: String(this.src).split(':')[0], tap });
    if (!tap && !blessed.has(this)) return Promise.reject(new DOMException('Not allowed before a tap', 'NotAllowedError'));
    blessed.add(this);
    return play.call(this);
  };
};
const ONLINE_ID = 'azure:en-GB-RyanNeural';

test('page: the now-playing bar\'s Play unlocks Kino\'s audio inside the tap, as iOS needs, so the online voice reads', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      for (const m of reg.suites.find(s => s.id === 'kino')?.modules || []) { m.url ||= m.pendingUrl; m.status = 'live'; }
      await route.fulfill({ json: reg });
    });
    // The site's voice proxy, played by the test: set up, with one voice; each sentence a short silent clip.
    const said = [];
    await page.route('**/api/voice/v1/voices', route => route.fulfill({ json: { available: true, engine: 'azure', voices: [{ id: ONLINE_ID, name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' }] } }));
    await page.route('**/api/voice/v1/say', route => {
      said.push(route.request().postDataJSON().text);
      return route.fulfill({ status: 200, body: Buffer.from(globalThis.PRPVoice.silentWav(0.3)), headers: { 'content-type': 'audio/wav', 'x-prp-voice-duration': '0.3' } });
    });
    await page.addInitScript(FAKE_SPEECH);
    await page.addInitScript(IOS_AUDIO);
    await page.addInitScript(id => { try { localStorage.setItem('jdpi.doc.voice', JSON.stringify(id)); } catch { /* none */ } }, ONLINE_ID); // chosen in the settings
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const kino = await (await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 })).contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="korean-war"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=korean-war'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    await kino.click('#follow');
    await page.locator('#np').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await kino.evaluate(() => typeof window.prpKinoUnlock), 'function');

    // Play from the bar: Kino's audio first plays the silent clip inside the tap (the shell calls prpKinoUnlock before it
    // posts "play"), so the clips that follow, outside any tap, may play on that element; the device voice never reads.
    await page.click('#np-play');
    await kino.waitForFunction(() => window.__plays.filter(p => p.src === 'blob').length >= 2, null, { timeout: 15000 });
    const plays = await kino.evaluate(() => window.__plays);
    assert.deepEqual(plays[0], { src: 'data', tap: true }, 'unlocked inside the tap');
    assert.ok(plays.slice(1).every(p => p.src === 'blob' && !p.tap), JSON.stringify(plays));
    assert.ok(said.length >= 2, `${said.length} sentences asked for`);
    assert.deepEqual(await kino.evaluate(() => window.__spoken), [], 'the online voice read; the device voice never had to');

    // The hook failing never stands in the way of the bar's Play.
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    await kino.evaluate(() => { window.prpKinoUnlock = () => { throw new Error('unlock failed'); }; });
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Pause', null, { timeout: 5000 });
    await page.click('#np-play');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Follow pressed while Kino\'s page is still loading keeps the now-playing bar once the page has loaded, and Back to film keeps the film', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      for (const m of reg.suites.find(s => s.id === 'kino')?.modules || []) { m.url ||= m.pendingUrl; m.status = 'live'; }
      await route.fulfill({ json: reg });
    });
    // The web fonts and the map's scripts are held until Follow has been pressed, so Kino's page has not finished loading
    // then (its load event waits for them): as on a runner where they come over the network more slowly than the site.
    let release;
    const held = new Promise(r => { release = r; });
    await page.route(/^https:\/\/(fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, async route => { await held; await route.fallback(); });
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const frame = await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 });
    const kino = await frame.contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="korean-war"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=korean-war'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    assert.notEqual(await kino.evaluate(() => document.readyState), 'complete', 'Kino\'s page is still loading');
    const loaded = frame.evaluate(f => new Promise(r => f.addEventListener('load', r, { once: true })));
    loaded.catch(() => { /* awaited below; a failure before then closes the browser, and its own message is the one to see */ });
    await kino.click('#follow');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/battlefield-history?at='), null, { timeout: 10000 });
    await page.locator('#np').waitFor({ state: 'visible', timeout: 10000 });
    // Back to film, still loading: the shell moves Kino's page by its hash on the page's own address (kino/, where the
    // server put kino/index.html), so the film that was following along is the one shown, not the page loaded afresh.
    await kino.evaluate(() => { window.__sameDocument = true; });
    await page.click('#np-back');
    await page.waitForFunction(() => document.querySelector('#frames iframe.active')?.dataset.module === 'kino-wars', null, { timeout: 5000 });
    await kino.waitForFunction(() => /^#doc=korean-war&s=/.test(location.hash), null, { timeout: 5000 });
    assert.notEqual(await kino.evaluate(() => document.readyState), 'complete', 'Kino\'s page was still loading');
    assert.equal(await kino.evaluate(() => window.__sameDocument === true && document.querySelector('#follow').getAttribute('aria-pressed')), 'true', 'Back to film keeps the page and its Follow along');
    await page.evaluate(() => { location.hash = '#/rs/battlefield-history'; });
    await page.locator('#np').waitFor({ state: 'visible', timeout: 5000 });
    release();
    await loaded; // the shell's own listener on the frame ran first: it was added when the frame was made
    assert.equal(await page.locator('#np').isVisible(), true, 'the bar stays: the page that loaded is the one following along');
    assert.match((await page.locator('.np-head').innerText()).replace(/\s+/g, ' '), /^Kino · The Korean War, 1950–1953 · 1\/12$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* ---------- Split view, full screen and Related screens (Jude, 29 October and 5 November 2026) ----------
   K1: "The video player should give you the option to replace the text shown in the documentaries and similar with the
   relevant content which is accessible from the 'Follow on PRP' button. There should also be a way to correctly scale the
   player screen for full screen on a desktop screen. This mode should also allow for full screen of both the documentary
   and the 'follow on PRP' content."
   K2: "During the Kino section there should be a collapsable toggle that allows you to switch between the PRP screens
   which has data tags related to the content being shown. This toggle can be hidden while watching or brought up
   displaying a few highlights and a 'See More' which causes a popout." */
const registry = read('registry.json');
const LOCAL = 'http://localhost:8787/';

test('links: Split view is in the address after the film and scene, read and written apart from them', () => {
  assert.deepEqual(readKinoView('#doc=ww2-europe&s=poland&split=1'), { split: true });
  assert.deepEqual(readKinoView('#doc=ww2-europe&s=poland'), { split: false });
  assert.deepEqual(readKinoView(''), { split: false });
  assert.equal(kinoViewHash('ww2-europe', 'poland', { split: true }), '#doc=ww2-europe&s=poland&split=1');
  assert.equal(kinoViewHash('ww2-europe', 'poland', { split: false }), kinoHash('ww2-europe', 'poland'));
  assert.equal(kinoViewHash('ww2-europe', 'poland'), '#doc=ww2-europe&s=poland');
  assert.equal(kinoViewHash(null, null, { split: true }), '');
  // The film's own keys read as before, with the new one beside them.
  assert.deepEqual(readKinoHash('#doc=ww2-europe&s=poland&split=1'), { doc: 'ww2-europe', s: 'poland' });
  assert.equal(kinoHash('ww2-europe', 'poland'), '#doc=ww2-europe&s=poland');
  assert.equal(filmRoute('wars', 'korean-war', 'inchon', LOCAL), `#/kino/kino-wars?at=${encodeURIComponent(`${LOCAL}kino/index.html?cat=wars#doc=korean-war&s=inchon`)}`);
  // A scene's link as a place for the pane: what to frame, what Open opens, and the shell route.
  const link = { label: 'War Focus · September 1939', suite: 'rs', module: 'war-focus', at: 'battlefield/focus/index.html#war=ww2&m=1939-09' };
  assert.deepEqual(linkPlace(link, LOCAL, { name: 'War Focus', code: 'RS' }), {
    module: 'war-focus', suite: 'rs', name: 'War Focus', label: 'September 1939', code: 'RS',
    page: `${LOCAL}battlefield/focus/index.html#war=ww2&m=1939-09`, href: shellUrl(link, LOCAL), hash: shellHash(link, LOCAL),
  });
  assert.match(linkPlace(link, LOCAL).hash, SHELL_ROUTE);
  assert.equal(linkPlace({ ...link, module: 'atlas', suite: 'rt', at: 'https://political-atlas.pages.dev/#GBR' }, LOCAL).page, 'https://political-atlas.pages.dev/#GBR');
});

test('related: the scene\'s place, then what the Master Index records for what it names, then the film\'s places nearest first', () => {
  const L = (module, at, label, suite = 'rs') => ({ label, suite, module, at });
  const scenes = [
    { link: L('war-focus', 'battlefield/focus/index.html#war=ww2&m=1939-09', 'War Focus · September 1939') },
    { link: L('encyclopedia', 'encyclopedia/index.html#Q1', 'Master Index · A'), visual: { kind: 'portrait', qid: 'Q2' } },
    { link: L('kino-political-figures', 'kino/index.html?cat=political-figures#doc=x', 'Kino · Another film', 'kino') },
    { visual: { kind: 'map' } },
    { link: L('war-focus', 'battlefield/focus/index.html#war=ww2&m=1940-05', 'War Focus · May 1940') },
    { link: L('encyclopedia', 'encyclopedia/index.html#Q1', 'Master Index · A again') },
  ];
  const m = (mod, u, c) => ({ m: mod, u, c });
  const entities = new Map([
    ['Q1', { label: 'A', mentions: [
      m('kino-wars', 'https://jdpi.pages.dev/kino/index.html?cat=wars#doc=ww2-europe', 'another film'),
      m('no-such-module', 'https://jdpi.pages.dev/x.html', 'unlisted'),
      m('war-focus', 'https://jdpi.pages.dev/q/national.html#country=GBR', 'off its own page'),
      m('war-focus', 'https://jdpi.pages.dev/battlefield/focus/index.html#war=ww2&m=1939-09', 'September 1939'),
      m('retrospective', 'https://hp-retrospective.pages.dev/#y=1940&c=200', 'r1'),
      m('battlefield-history', 'https://jdpi.pages.dev/battlefield/history/index.html#y=1939&w=c139', 'b1'),
      m('battlefield-history', 'https://jdpi.pages.dev/battlefield/history/index.html#y=1939&w=c139', 'b1 again'),
      m('kardashev', 'https://jdpi.pages.dev/kardashev/index.html#y=1900&p=britain', 'k1'),
      m('pestle', 'https://jdpi.pages.dev/q/national.html#country=GBR', 'a fifth place: over the four'),
    ] }],
    ['Q2', null], // its shard did not load (on the live site a missing file is a page, not JSON)
  ]);
  assert.deepEqual(sceneEntities(scenes[1], [{ qid: 'Q9' }]), { qids: ['Q1', 'Q2'], own: true });
  assert.deepEqual(sceneEntities(scenes[0], [{ qid: 'Q9' }, { qid: 'Q8' }]), { qids: ['Q9', 'Q8'], own: false }, 'no entry of its own: the film\'s subjects');
  assert.deepEqual(sceneEntities({ visual: { kind: 'portrait', qid: 'Q5' } }, []), { qids: ['Q5'], own: true });

  const r = relatedPlaces(scenes, 1, { subjects: [{ qid: 'Q9' }], entities, registry, shell: LOCAL });
  assert.deepEqual(r.map(x => [x.group, x.link.module, x.link.at.replace(LOCAL, ''), x.scene || null]), [
    ['scene', 'encyclopedia', 'encyclopedia/index.html#Q1', 2],
    ['tagged', 'war-focus', 'battlefield/focus/index.html#war=ww2&m=1939-09', null],
    ['tagged', 'retrospective', 'https://hp-retrospective.pages.dev/#y=1940&c=200', null],
    ['tagged', 'battlefield-history', 'battlefield/history/index.html#y=1939&w=c139', null],
    ['tagged', 'kardashev', 'kardashev/index.html#y=1900&p=britain', null],
    // The film's: scene 3 is another film, scene 1's place is already listed, scene 4 has none, scene 6's is scene 2's.
    ['film', 'war-focus', 'battlefield/focus/index.html#war=ww2&m=1940-05', 5],
  ]);
  assert.equal(r.filter(x => x.group === 'tagged').length, PER_THING, 'at most four for each thing');
  assert.equal(new Set(r.map(x => x.key)).size, r.length, 'each address once');
  assert.ok(r.every(x => x.link.suite === 'rs' && !/kino/.test(x.link.module)), 'no other film; suites from the registry');
  assert.equal(r[1].link.label, 'War Focus · September 1939', 'a tagged place is named by its submodule and the Master Index\'s caption');
  // Shards that did not load: the scene's place and the film's, nearest scene first (the next, the one before, …).
  const none = relatedPlaces(scenes, 4, { entities: new Map([['Q9', null]]), subjects: [{ qid: 'Q9' }], registry, shell: LOCAL });
  assert.deepEqual(none.map(x => [x.group, x.scene]), [['scene', 5], ['film', 6], ['film', 1]]);
  assert.deepEqual(relatedPlaces(scenes, 9, { registry }), [], 'no such scene');
  // Bibliotheca sits in Kino's module but is not a film: a book the Master Index records is a related screen.
  const book = relatedPlaces([{ link: L('encyclopedia', 'encyclopedia/index.html#Q1399', 'Master Index · Machiavelli') }], 0, {
    entities: new Map([['Q1399', { label: 'Niccolò Machiavelli', mentions: [m('bibliotheca', 'https://jdpi.pages.dev/bibliotheca/neo/index.html#book=the-prince&ch=7&p=c07-n05&t=Q1399', 'Named in The Prince'), m('kino-great-thinkers', 'https://jdpi.pages.dev/kino/index.html?cat=great-thinkers#doc=niccolo-machiavelli', 'the film')] }]]),
    registry, shell: LOCAL,
  });
  assert.deepEqual(book.map(x => [x.group, x.link.suite, x.link.module, x.name || null, x.place || null]), [['scene', 'rs', 'encyclopedia', null, null], ['tagged', 'kino', 'bibliotheca', 'Bibliotheca', 'Named in The Prince']]);
  assert.equal(book[1].link.at, `${LOCAL}bibliotheca/neo/index.html#book=the-prince&ch=7&p=c07-n05&t=Q1399`, 'pointed at this copy of the site');
  // A submodule whose name has a " · " of its own keeps it whole.
  assert.deepEqual([linkPlace({ label: "Learning · Politics · Politics: offensive realism", suite: 'rs', module: 'learning-politics', at: 'fe/learning.html?course=politics' }, LOCAL, { name: 'Learning · Politics' })].map(p => [p.name, p.label]), [['Learning · Politics', 'Politics: offensive realism']]);
});

test('related: every scene of every film has at least three related places, each a route the shell accepts', () => {
  const shards = new Map();
  const entity = q => {
    const n = shardOf(q), file = join(ROOT, 'lake/data/e', `${n}.json`);
    if (!shards.has(n)) { try { shards.set(n, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null); } catch { shards.set(n, null); } }
    return shards.get(n)?.[q] || null;
  };
  const listed = new Set(registry.suites.flatMap(s => s.modules.flatMap(m => [m.id, ...(m.aliases || [])])));
  const tables = tagTables(read('battlefield/focus/data/index.json'), read('national/data/brief.json'));
  let scenes = 0, own = 0, untagged = 0;
  for (const d of docs) {
    const all = flatScenes(d);
    all.forEach((s, i) => {
      const things = sceneEntities(s, d.subjects, tables), qids = things.qids;
      const r = relatedPlaces(all, i, { subjects: d.subjects, entities: new Map(qids.map(q => [q, entity(q)])), registry, shell: SHELL_URL, tables });
      scenes++;
      if (things.own) own++;
      if (!r.some(x => x.group === 'tagged')) untagged++;
      assert.ok(r.length >= CHIPS, `${d.id}/${s.id}: ${r.length} places`);
      if (s.link && s.link.suite !== 'kino') assert.equal(r[0].group, 'scene', `${d.id}/${s.id}: its own place first`);
      assert.equal(new Set(r.map(x => x.key)).size, r.length, `${d.id}/${s.id}: an address twice`);
      for (const x of r) {
        assert.match(shellHash(x.link), SHELL_ROUTE, `${d.id}/${s.id}: the shell would refuse ${x.link.at}`);
        assert.ok(listed.has(x.link.module), `${d.id}/${s.id}: ${x.link.module} is not in the registry`);
        assert.ok(!/^kino-/.test(x.link.module), `${d.id}/${s.id}: another film`);
      }
    });
  }
  assert.ok(scenes >= 200, `${scenes} scenes`);
  // K2, "data tags related to the content being shown": with the wars, the countries and the maps as tags, most scenes
  // are tagged by what they show (155 of 221 when this was written; 86 by the links and portraits alone), and few have
  // no tagged screen (31; 55 before).
  assert.ok(own / scenes >= 0.65, `${own} of ${scenes} scenes tagged by what they show`);
  assert.ok(untagged / scenes <= 0.18, `${untagged} of ${scenes} scenes with no tagged screen`);
});

test('related: a scene is tagged by the war or the country its link names and the countries on its map', () => {
  const tables = tagTables({ wars: [{ id: 'ww2', qid: 'Q362' }, { id: 'no-qid' }] }, { countries: [{ iso3: 'POL', qid: 'Q36' }, { iso3: 'DEU', qid: 'Q183' }, { iso3: 'FRA', qid: 'Q142' }, { iso3: 'GBR', qid: 'Q145' }, { iso3: 'ITA', qid: 'Q38' }, { iso3: 'XXX' }] });
  assert.deepEqual([...tables.wars], [['ww2', 'Q362']]);
  assert.equal(tables.countries.size, 5);
  assert.deepEqual(tagTables(null, undefined), { wars: new Map(), countries: new Map() }, 'a table that did not load');
  const war = { link: { label: 'War Focus · 1939', suite: 'rs', module: 'war-focus', at: 'battlefield/focus/index.html#war=ww2&m=1939-09' },
    visual: { kind: 'map', groups: [{ countries: ['POL', 'DEU'] }, { countries: ['DEU', 'FRA', 'GBR', 'ITA'] }] } };
  assert.deepEqual(sceneEntities(war, [{ qid: 'Q9' }], tables), { qids: ['Q362', 'Q36', 'Q183', 'Q142', 'Q145'], own: true },
    `the war, then the countries on the map in order, each once, at most ${MAP_COUNTRIES}`);
  assert.deepEqual(sceneEntities(war, [{ qid: 'Q9' }]), { qids: ['Q9'], own: false }, 'without the tables, as before');
  const atlas = { link: { label: 'Atlas · Poland', suite: 'rs', module: 'atlas', at: 'atlas/index.html#pol' }, focus: { countries: ['DEU'] } };
  assert.deepEqual(sceneEntities(atlas, [], tables).qids, ['Q36', 'Q183']);
  const pestle = { link: { label: 'PESTLE · France', suite: 'rs', module: 'pestle', at: 'q/national.html#country=FRA' } };
  assert.deepEqual(sceneEntities(pestle, [], tables).qids, ['Q142']);
  // What the Master Index records for the scene's war is a tagged place of the scene.
  const entities = new Map([['Q362', { label: 'Second World War', mentions: [{ m: 'kardashev', u: 'https://jdpi.pages.dev/kardashev/index.html#y=1940', c: '1940' }] }]]);
  const r = relatedPlaces([war], 0, { entities, registry, shell: SHELL_URL, tables });
  assert.deepEqual(r.map(x => [x.group, x.link.module, x.qid || null]), [['scene', 'war-focus', null], ['tagged', 'kardashev', 'Q362']]);
});

// The registry with Kino's submodules live, as they will be once published (the shell tests above do the same).
const kinoLive = page => page.route('**/registry.json', async route => {
  const reg = await (await route.fetch()).json();
  for (const m of reg.suites.find(s => s.id === 'kino')?.modules || []) { m.url ||= m.pendingUrl; m.status = 'live'; }
  await route.fulfill({ json: reg });
});
const CAPTIONS_ONLY = speed => { try { localStorage.setItem('prp.kino.voice', 'false'); if (speed) localStorage.setItem('prp.kino.speed', String(speed)); } catch { /* none */ } };
async function openFilm(page, cat, hash) {
  await page.goto(`${BASE}/kino/index.html?cat=${cat}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cap-text .w', { timeout: 30000 });
}
const rect = (where, sel) => where.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const sideFrame = async (where, module) => (await where.waitForSelector(`#side iframe[data-module="${module}"]:not([hidden])`, { timeout: 20000 })).contentFrame();
const shownWords = where => where.locator('#cap-text .w').evaluateAll(ws => ws.filter(w => getComputedStyle(w).display !== 'none').map(w => w.textContent).join(' '));
const frameHash = (page, module) => page.evaluate(m => document.querySelector(`#side iframe[data-module="${m}"]`)?.contentWindow.location.hash, module);

test('page: Split view shows each scene\'s place beside the film in place of the text, and Follow stays as it was', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland');
    assert.equal(await page.locator('#controls #split').count(), 1, 'an option in the player\'s controls');
    assert.equal(await page.locator('#split').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#side').isHidden(), true, 'off until the viewer turns it on');
    await page.keyboard.press('v');
    // The scene's own place, the page Follow would open, framed as an embedded page.
    const wf = await sideFrame(page, 'war-focus');
    assert.match(await page.locator('#side iframe[data-module="war-focus"]').getAttribute('src'), /battlefield\/focus\/index\.html#war=ww2&m=1939-09$/);
    await wf.waitForSelector('html.prp-embedded', { timeout: 20000 });
    assert.equal(await wf.evaluate(() => window.name), 'prp-side');
    assert.match(await page.locator('#side .prp-side-head').innerText(), /War Focus\s*·\s*September 1939/);
    // The text gives way to the sentence being read; #cap-text still holds every word.
    const scene = flatScenes(ctx.docs.get('ww2-europe'))[2];
    assert.equal(await page.locator('#cap-text .w').count(), tokens(scene.narration).length);
    assert.equal(await shownWords(page), sentences(scene.narration)[0]);
    assert.equal(await page.locator('#follow').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#split').getAttribute('aria-pressed'), 'true');
    assert.match(await page.evaluate(() => location.hash), /^#doc=ww2-europe&s=poland&split=1$/);

    // The next scene moves the pane. A place on the same page moves by hash: the page is not loaded again.
    await wf.evaluate(() => { window.__kept = true; });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#side iframe[data-module="war-focus"]').contentWindow.location.hash === '#war=ww2&m=1940-05');
    assert.equal(await wf.evaluate(() => window.__kept), true, 'moved by hash, not reloaded');
    assert.match(await page.evaluate(() => location.hash), /s=west-1940&split=1$/);
    // A place in another submodule gets its own frame; going back to the first shows it, still not reloaded.
    await page.evaluate(() => { location.hash = '#doc=ww2-europe&s=road-to-war'; });
    await sideFrame(page, 'encyclopedia');
    assert.equal(await page.locator('#side iframe[data-module="war-focus"]').isHidden(), true);
    assert.match(await page.evaluate(() => location.hash), /s=road-to-war&split=1$/, 'a later address in the film never turns it off');
    await page.evaluate(() => { location.hash = '#doc=ww2-europe&s=barbarossa'; });
    await sideFrame(page, 'war-focus');
    await page.waitForFunction(() => document.querySelector('#side iframe[data-module="war-focus"]').contentWindow.location.hash === '#war=ww2&m=1941-06');
    assert.equal(await wf.evaluate(() => window.__kept), true);
    assert.equal(await page.locator('#side iframe').count(), 2, 'one frame for each submodule');

    // Side by side, the pane and the stage keep their size through scenes whose captions differ in length.
    const sizes = [];
    for (const s of ['poland', 'holocaust', 'mediterranean', 'science']) {
      await page.evaluate(id => { location.hash = `#doc=ww2-europe&s=${id}`; }, s);
      await page.waitForFunction(id => location.hash.includes(`s=${id}&`), s);
      sizes.push([await rect(page, '#side'), await rect(page, '#stage'), await rect(page, '#cap-text')]);
    }
    const lengths = ['poland', 'holocaust', 'mediterranean', 'science'].map(id => flatScenes(ctx.docs.get('ww2-europe')).find(x => x.id === id).narration.length);
    assert.ok(Math.max(...lengths) - Math.min(...lengths) > 150, 'the captions differ in length');
    for (const [side, stage, box] of sizes.slice(1)) {
      assert.deepEqual([side.w, side.h, stage.w, stage.h, box.h].map(Math.round), [sizes[0][0].w, sizes[0][0].h, sizes[0][1].w, sizes[0][1].h, sizes[0][2].h].map(Math.round));
    }

    // The player's theme reaches the framed page.
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new CustomEvent('prp:themechange')); });
    await wf.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 5000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('prp:themechange')); });
    await wf.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 5000 });

    // Turning Split view off leaves no pane frame in the page, and the text comes back.
    await page.click('#split');
    assert.equal(await page.locator('#side iframe').count(), 0);
    assert.equal(await page.locator('#side').isHidden(), true);
    assert.doesNotMatch(await page.evaluate(() => location.hash), /split/);
    const sc = flatScenes(ctx.docs.get('ww2-europe')).find(x => x.id === 'science');
    assert.equal(await shownWords(page), tokens(sc.narration).join(' '));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the pane shows a card where a page cannot be framed: no place, another film, a missing page, a private page', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openFilm(page, 'wars', '#doc=ww2-europe&s=holocaust&split=1');
    await page.waitForSelector('#side .prp-side-card[data-why="none"]');
    assert.match(await page.locator('#side .prp-side-card').innerText(), /This scene has no place in Vitruvian Manager\./);
    assert.equal(await page.locator('#side iframe:visible').count(), 0);
    await page.evaluate(() => { location.hash = '#doc=ww2-europe&s=britain-alone&split=1'; });
    await page.waitForSelector('#side .prp-side-card[data-why="film"]');
    assert.match(await page.locator('#side .prp-side-card').innerText(), /This scene points to another film: Winston Churchill/);
    assert.equal(await page.locator('#side .prp-side-card a').innerText(), 'Open the film ↗');
    assert.equal(await page.locator('#side iframe').count(), 0, 'no frame');

    // A missing page: the local server answers it with a 404 and the live site with the shell itself; either way the
    // page has no connector, so its frame goes and the card says so.
    const missing = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await missing.route(/\/battlefield\/focus\/(index\.html)?$/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Vitruvian Manager</title><p>The shell, served for a missing address.</p>' }));
    await openFilm(missing, 'wars', '#doc=ww2-europe&s=poland&split=1');
    await missing.waitForSelector('#side .prp-side-card[data-why="missing"]', { timeout: 20000 });
    assert.match(await missing.locator('#side .prp-side-card').innerText(), /This page could not be shown here\.\s*Open in Vitruvian Manager ↗/);
    assert.equal(await missing.locator('#side iframe').count(), 0, 'nothing left running in the pane');

    // A private submodule (opensInNewTab) is offered as a link in a new tab, never framed.
    const priv = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await priv.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      reg.suites.find(s => s.id === 'rs').modules.find(m => m.id === 'war-focus').opensInNewTab = true;
      await route.fulfill({ json: reg });
    });
    await openFilm(priv, 'wars', '#doc=ww2-europe&s=poland&split=1');
    await priv.waitForSelector('#side .prp-side-card[data-why="private"]');
    assert.match(await priv.locator('#side .prp-side-card').innerText(), /War Focus is private and asks you to sign in, which browsers do not allow inside another page\./);
    const a = priv.locator('#side .prp-side-card a');
    assert.equal(await a.getAttribute('target'), '_blank');
    assert.equal(await a.getAttribute('href'), `${BASE}/battlefield/focus/index.html#war=ww2&m=1939-09`);
    assert.equal(await priv.locator('#side iframe').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in a 480 px film column the sentence box keeps its height, and each word is in it when it is lit', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.addInitScript(() => { try { localStorage.setItem('prp.split.kino', '60'); } catch { /* none */ } });
    await page.addInitScript(CAPTIONS_ONLY, 4);
    // Kino's longest sentence (310 characters), the second of its scene.
    const doc = ctx.docs.get('end-of-the-soviet-union'), scene = flatScenes(doc).find(s => s.id === 'why');
    const runs = sentenceRuns(scene.narration), long = sentences(scene.narration)[1];
    assert.equal(long.length, Math.max(...docs.flatMap(d => flatScenes(d).flatMap(s => sentences(s.narration).map(t => t.length)))));
    await openFilm(page, 'geopolitical-events', '#doc=end-of-the-soviet-union&s=why&split=1');
    const stage = await rect(page, '#stage');
    assert.ok(stage.w >= 476 && stage.w <= 482, `the film column is ${stage.w} px`);
    await page.evaluate(() => {
      const box = document.querySelector('#cap-text');
      Object.assign(window, { __heights: new Set(), __outside: [], __lit: 0, __scrolled: 0 });
      new MutationObserver(ms => {
        for (const m of ms) {
          if (!m.target.classList?.contains('on') || /\bon\b/.test(m.oldValue || '')) continue; // the moment a word is lit
          const b = box.getBoundingClientRect(), r = m.target.getBoundingClientRect();
          window.__heights.add(Math.round(b.height)); window.__lit++; window.__scrolled = Math.max(window.__scrolled, box.scrollTop);
          if (r.top < b.top - 1 || r.bottom > b.bottom + 1) window.__outside.push(m.target.textContent);
        }
      }).observe(box, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
    });
    const height = (await rect(page, '#cap-text')).h;
    await page.click('#play');
    const last = runs[1][runs[1].length - 1];
    await page.waitForFunction(i => document.querySelector(`#cap-text .w[data-i="${i}"]`).classList.contains('on') || document.querySelector(`#cap-text .w[data-i="${i + 1}"]`)?.classList.contains('on'), last, { timeout: 60000 });
    const seen = await page.evaluate(() => ({ heights: [...window.__heights], outside: window.__outside, lit: window.__lit, scrolled: window.__scrolled }));
    assert.ok(seen.lit >= runs[0].length + runs[1].length - 4, `${seen.lit} words lit`);
    assert.deepEqual(seen.heights, [Math.round(height)], 'the box never changes height');
    assert.deepEqual(seen.outside, [], 'every word is inside the box when it is lit');
    assert.ok(seen.scrolled > 0, 'the long sentence scrolled by lines');
    assert.equal((await rect(page, '#cap-text')).h, height);
  } finally { await browser.close(); }
});

test('page: the divider between the film and the page, with a real pointer and with the keys', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland&split=1');
    await sideFrame(page, 'war-focus');
    const bar = page.locator('#side .prp-split-bar');
    assert.equal(await bar.getAttribute('role'), 'separator');
    assert.equal(await bar.getAttribute('aria-valuenow'), '40');
    const before = await rect(page, '#side'), b = await bar.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 120);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 60, b.y + 120, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2 - 120, b.y + 120, { steps: 4 });
    await page.mouse.up();
    const after = await rect(page, '#side');
    assert.ok(Math.abs(after.w - before.w - 120) <= 4, `the pane widened by ${after.w - before.w} px`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('prp.split.kino')));
    assert.ok(saved > 40 && saved < 60, `saved ${saved}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#side .prp-split-bar');
    assert.ok(Math.abs((await rect(page, '#side')).w - after.w) <= 1, 'the share survives a reload');
    // Left on the focused divider widens the pane by two points, and does not change the scene.
    const hash = await page.evaluate(() => location.hash), now = +(await bar.getAttribute('aria-valuenow'));
    await bar.focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(+(await bar.getAttribute('aria-valuenow')), now + 2);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(+(await bar.getAttribute('aria-valuenow')), now - 2);
    assert.equal(await page.evaluate(() => location.hash), hash, 'the scene stays');
    await page.keyboard.press('Enter');
    assert.equal(await bar.getAttribute('aria-valuenow'), '40', 'Enter puts it back where it began');
  } finally { await browser.close(); }
});

test('page: full screen fits the 16:9 stage to the screen, the same in every scene, with text that keeps its share', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [w, h, ew, eh] of [[1366, 768, 1099, 618], [1920, 1080, 1602, 901], [2560, 1440, 2219, 1248]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      // No voice on this device and none online, as on a Linux runner, on every machine: 1.6 s in, the player says so in
      // its note, which must not shrink the picture in full screen.
      await page.addInitScript(() => { try { Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => [], configurable: true }); } catch { /* no speech at all */ } });
      await page.route('**/api/voice/v1/voices', route => route.fulfill({ json: { available: false, voices: [] } }));
      // The film's longest scene (a portrait) and its shortest.
      await openFilm(page, 'political-events', '#doc=russian-revolutions-1917&s=october');
      await page.click('#fullscreen');
      await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
      await page.waitForSelector('.kn-v-portrait .text h3');
      const m = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        return { stage: r('#stage'), fit: r('.kn-fit'), cap: r('#captions'), ctl: r('#controls'), name: parseFloat(getComputedStyle(document.querySelector('.kn-v-portrait .text h3')).fontSize) };
      });
      const at = `${w}×${h}`;
      assert.ok(Math.abs(m.stage.width - m.stage.height * 16 / 9) <= 1.8, `${at}: 16:9 (${m.stage.width}×${m.stage.height})`);
      assert.ok(Math.abs(m.stage.height + m.cap.height + m.ctl.height - h) <= 2, `${at}: the stage, the sentence and the controls fill the screen`);
      assert.ok(Math.abs(m.stage.width - m.fit.width) <= 1 || Math.abs(m.stage.height - m.fit.height) <= 1, `${at}: the stage fills its room one way`);
      assert.ok(Math.abs(m.stage.width - ew) <= 12 && Math.abs(m.stage.height - eh) <= 12, `${at}: ${m.stage.width}×${m.stage.height}`);
      assert.ok(Math.abs(m.name / m.stage.width - 0.044) <= 0.001, `${at}: a portrait's name is ${(100 * m.name / m.stage.width).toFixed(2)}% of the stage`);
      // The note comes while the film is in full screen: it lies over the screen, and the stage keeps its box.
      await page.waitForFunction(() => /no speech voices/.test(document.querySelector('#note').textContent), null, { timeout: 10000 });
      const noted = await rect(page, '#stage'), said = await rect(page, '#note');
      assert.deepEqual([noted.x, noted.y, noted.w, noted.h].map(Math.round), [m.stage.x, m.stage.y, m.stage.width, m.stage.height].map(Math.round), `${at}: the note leaves the stage as it was`);
      assert.ok(said.h > 0 && said.y >= 0 && said.b <= h && said.x >= 0 && said.r <= w, `${at}: the note is on the screen`);
      // The shortest scene: the same box.
      await page.evaluate(() => { location.hash = '#doc=russian-revolutions-1917&s=assembly'; });
      await page.waitForFunction(() => /s=assembly/.test(location.hash));
      const short = await rect(page, '#stage');
      assert.deepEqual([short.x, short.y, short.w, short.h].map(Math.round), [m.stage.x, m.stage.y, m.stage.width, m.stage.height].map(Math.round), `${at}: the same stage in every scene`);
      // Map labels never fall under their 11 px floor.
      await page.evaluate(() => { location.hash = '#doc=russian-revolutions-1917&s=war'; });
      await page.waitForSelector('.kn-stage svg.kn-map .overlay text.lbl', { timeout: 30000 });
      const label = await page.evaluate(() => { const t = document.querySelector('.kn-stage svg.kn-map .overlay text.lbl'); return +t.getAttribute('font-size') * document.querySelector('#stage').getBoundingClientRect().width / 1600; });
      assert.ok(label >= 10.95, `${at}: map labels are ${label.toFixed(1)} px`);
      if (w > 1100) assert.ok(label >= (m.stage.width / 75) - 0.1, `${at}: map labels keep their share of the stage`);
      await page.keyboard.press('f');
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('page: the controls stay one row: in a 900 px theatre with signs, in full screen at 1280 px with words, on a phone held sideways', PAGE, async () => {
  const browser = await launch();
  const oneRow = page => page.locator('#controls > *').evaluateAll(els => {
    const shown = els.filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect());
    const mid = shown.map(r => r.top + r.height / 2);
    return Math.max(...mid) - Math.min(...mid) < 10;
  });
  const words = (page, id) => page.locator(`${id} .wide`).evaluate(e => getComputedStyle(e).display !== 'none');
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 906 } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland');
    const th = await rect(page, '#theatre');
    assert.ok(Math.abs(th.w - 900) <= 4, `the theatre is ${th.w} px`);
    assert.ok(await oneRow(page), 'one row of controls');
    assert.equal(await words(page, '#split'), false, 'the new buttons show their signs');
    assert.equal(await words(page, '#related'), false);
    assert.equal(await page.locator('#split').getAttribute('aria-label'), 'Split view');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    assert.ok(await oneRow(page), 'one row in full screen');
    assert.equal(await words(page, '#split'), true, 'with their words');
    assert.equal(await words(page, '#related'), true);
    await page.close();

    // A phone held sideways: two lines of text, one row of signs, and a stage at least 440 px wide.
    const phone = await browser.newPage({ viewport: { width: 780, height: 360 } });
    await openFilm(phone, 'wars', '#doc=ww2-europe&s=poland');
    await phone.click('#fullscreen');
    await phone.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    assert.ok(await oneRow(phone), 'one row of controls');
    const st = await rect(phone, '#stage');
    assert.ok(st.w >= 440, `the stage is ${st.w} px wide`);
    assert.ok(Math.abs(st.w - st.h * 16 / 9) <= 1.8);
    assert.ok(st.h + (await rect(phone, '#captions')).h + (await rect(phone, '#controls')).h <= 362);
  } finally { await browser.close(); }
});

test('page: full screen of both: the film and the page side by side, and F leaves it with Split view still on', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland&split=1');
    await sideFrame(page, 'war-focus');
    await page.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    const stage = await rect(page, '#stage'), side = await rect(page, '#side');
    assert.equal(await page.evaluate(() => document.querySelector('#theatre').contains(document.querySelector('#side'))), true);
    assert.ok(stage.r <= side.x + 0.5, 'side by side, not overlapping');
    assert.ok(Math.abs(stage.w + side.w - 1920) <= 2, `together as wide as the screen (${stage.w} + ${side.w})`);
    assert.ok(Math.abs(stage.w - stage.h * 16 / 9) <= 1.8, '16:9');
    assert.ok(side.h > 900, `the pane runs the full height above the controls (${side.h})`);
    assert.equal(await page.locator('#side iframe[data-module="war-focus"]').isVisible(), true, 'the scene\'s place');
    assert.equal(await page.locator('#related-strip').isHidden(), true);
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.locator('#split').getAttribute('aria-pressed'), 'true', 'Split view still on');
    assert.equal(await page.locator('#side iframe[data-module="war-focus"]').isVisible(), true);
  } finally { await browser.close(); }
});

test('page: a course\'s end leaves full screen with its quiz in view, and "Sources" on the end card leaves it too', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript(CAPTIONS_ONLY, 4);
    await openFilm(page, 'great-thinkers', '#doc=adam-smith&s=11');
    assert.ok(ctx.docs.get('adam-smith').quiz.length);
    await page.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    await page.click('#play');
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 60000 });
    await page.waitForFunction(() => { const r = document.querySelector('#quiz').getBoundingClientRect(); return !document.querySelector('#quiz').hidden && r.top < innerHeight && r.bottom > 0; }, null, { timeout: 5000 });
    await page.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    await page.click('.kn-v-end [data-act="sources"]');
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.waitForFunction(() => { const r = document.querySelector('#doc-sources').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, null, { timeout: 5000 });
  } finally { await browser.close(); }
});

test('page: in the shell, Split view and Follow are alternatives, and Follow still moves the shell', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await kinoLive(page);
    await page.addInitScript(CAPTIONS_ONLY);
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const kino = await (await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 })).contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="ww2-europe"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=ww2-europe&s=poland'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    await kino.click('#split');
    await sideFrame(kino, 'war-focus');
    assert.ok(page.url().includes('#/kino/kino-wars'), 'the pane fills inside Kino; the shell stays');
    await kino.click('#follow');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/war-focus?at='), null, { timeout: 10000 });
    assert.equal(await kino.locator('#split').getAttribute('aria-pressed'), 'false', 'Follow turns Split view off');
    assert.equal(await kino.locator('#side iframe').count(), 0);
    await page.click('#nav a[data-route="kino/kino-wars"]');
    await page.waitForFunction(() => document.querySelector('#frames iframe.active')?.dataset.module === 'kino-wars');
    assert.equal(await kino.locator('#follow').getAttribute('aria-pressed'), 'true');
    const at = await page.evaluate(() => location.hash);
    await kino.click('#split');
    await sideFrame(kino, 'war-focus');
    assert.equal(await kino.locator('#follow').getAttribute('aria-pressed'), 'false', 'Split view turns Follow off');
    assert.equal(await page.evaluate(() => location.hash), at);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in the shell, full screen is Kino\'s frame; O there shows the place beside the film, Open leaves, and so does any move of the shell', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await kinoLive(page);
    await page.addInitScript(CAPTIONS_ONLY);
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const handle = await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 }), kino = await handle.contentFrame();
    assert.match(await handle.getAttribute('allow'), /fullscreen/);
    await kino.waitForSelector('.kn-card[data-doc="ww2-europe"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=ww2-europe&s=poland'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    await kino.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.dataset.module === 'kino-wars');
    const route = await page.evaluate(() => location.hash);
    await page.keyboard.press('o');
    await sideFrame(kino, 'war-focus');
    assert.equal(await kino.locator('#split').getAttribute('aria-pressed'), 'true', 'O turns Split view on in full screen');
    assert.equal(await page.evaluate(() => location.hash), route, 'the shell stays where it is');
    assert.equal(await page.evaluate(() => document.fullscreenElement?.dataset.module), 'kino-wars');
    // Open in the pane's head: full screen ends and the shell moves there.
    await kino.click('#side [data-side-open]');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/war-focus?at='), null, { timeout: 10000 });
    await page.waitForFunction(() => !document.fullscreenElement);
    // With Kino in full screen, the shell's address changing (as Back does) leaves full screen and shows the new frame.
    await page.click('#nav a[data-route="kino/kino-wars"]');
    await page.waitForFunction(() => document.querySelector('#frames iframe.active')?.dataset.module === 'kino-wars');
    await kino.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.dataset.module === 'kino-wars');
    await page.evaluate(() => { location.hash = '#/rs/encyclopedia'; });
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#frames iframe.active')?.dataset.module === 'encyclopedia');
  } finally { await browser.close(); }
});

test('page: in the shell, a film playing with Follow off pauses once the shell has moved to another submodule', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await kinoLive(page);
    await page.addInitScript(CAPTIONS_ONLY);
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const kino = await (await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 })).contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="korean-war"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=korean-war'; });
    await kino.waitForSelector('#cap-text .w', { timeout: 20000 });
    await kino.click('#play');
    await kino.waitForSelector('#cap-text .w.on', { timeout: 10000 });
    assert.equal(await kino.locator('#play').getAttribute('aria-label'), 'Pause');
    await page.click('#nav a[data-route="rs/war-focus"]');
    await kino.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === 'Play', null, { timeout: 5000 });
    assert.equal(await page.locator('#np').isHidden(), true, 'no bar: it was not following along');
  } finally { await browser.close(); }
});

test('page: Related screens: a strip that is hidden at first, three chips and See more, following the scene', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland');
    assert.equal(await page.locator('#controls #related').count(), 1);
    assert.equal(await page.locator('#related-strip').isHidden(), true, 'hidden at first');
    assert.equal(await page.locator('#related').getAttribute('aria-expanded'), 'false');
    await page.click('#related');
    assert.equal(await page.locator('#related').getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    // What the strip lists is what relatedPlaces gives for the scene with the real Master Index.
    const shards = new Map(), entity = q => { const n = shardOf(q); if (!shards.has(n)) shards.set(n, read(`lake/data/e/${n}.json`)); return shards.get(n)[q] || null; };
    const tables = tagTables(read('battlefield/focus/data/index.json'), read('national/data/brief.json'));
    const expect = id => { const d = ctx.docs.get('ww2-europe'), all = flatScenes(d), i = all.findIndex(s => s.id === id); return relatedPlaces(all, i, { subjects: d.subjects, entities: new Map(sceneEntities(all[i], d.subjects, tables).qids.map(q => [q, entity(q)])), registry, shell: `${BASE}/`, tables }); };
    const poland = expect('poland');
    assert.equal(+(await page.locator('#related-n').innerText()), poland.length, 'See more counts every screen');
    assert.match(await page.locator('#related-see').innerText(), /^See more/);
    // A chip is titled "<submodule> · <place>": the place is the script's or the Master Index's own words.
    const place = label => label.split(' · ').slice(1).join(' · ');
    const chips = () => page.locator('#related-chips .kn-rel').evaluateAll(bs => bs.map(b => b.title.split(' · ').slice(1).join(' · ')));
    assert.deepEqual(await chips(), poland.slice(0, 3).map(x => place(x.link.label)));
    // The next scene changes the chips; T hides and shows the strip; the choice survives a reload.
    await page.keyboard.press('ArrowRight');
    const west = expect('west-1940');
    await page.waitForFunction(t => document.querySelector('#related-chips .kn-rel')?.title.endsWith(` · ${t}`), place(west[0].link.label));
    assert.deepEqual(await chips(), west.slice(0, 3).map(x => place(x.link.label)));
    await page.keyboard.press('t');
    assert.equal(await page.locator('#related-strip').isHidden(), true);
    assert.equal(await page.locator('#related').getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('t');
    assert.equal(await page.locator('#related-strip').isVisible(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    assert.equal(await page.locator('#related').getAttribute('aria-expanded'), 'true', 'remembered');

    // A chip, with Split view on: the pane shows it and holds it; the next scene leaves it; H lets go.
    await page.keyboard.press('v');
    await sideFrame(page, 'war-focus');
    const pick = west.findIndex((x, k) => k < 3 && x.link.module !== 'war-focus');
    assert.ok(pick > 0, 'a chip in another submodule');
    await page.locator('#related-chips .kn-rel').nth(pick).click();
    const chosen = west[pick].link;
    await sideFrame(page, chosen.module);
    assert.equal(await page.locator('#side [data-side-hold]').getAttribute('aria-pressed'), 'true', 'held');
    assert.equal(await page.locator('#related-chips .kn-rel').nth(pick).getAttribute('aria-current'), 'true');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /s=britain-alone/.test(location.hash));
    assert.equal(await page.locator(`#side iframe[data-module="${chosen.module}"]`).isVisible(), true, 'the next scene leaves it');
    await page.keyboard.press('h');
    await page.waitForSelector('#side .prp-side-card[data-why="film"]'); // the scene's own place: another film
    assert.equal(await page.locator('#side [data-side-hold]').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: See more opens every related screen in a panel over the player, and closes back to its button', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript(() => { try { localStorage.setItem('prp.kino.related', 'true'); } catch { /* none */ } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland');
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    const n = +(await page.locator('#related-n').innerText());
    const focusIn = sel => page.evaluate(s => !!document.activeElement?.closest(s), sel);
    const open = async () => {
      await page.click('#related-see');
      await page.locator('#related-more').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#related-see').getAttribute('aria-expanded'), 'true');
      assert.ok(await focusIn('#related-more'), 'the focus goes into the panel');
    };
    const closed = async how => {
      await page.locator('#related-more').waitFor({ state: 'hidden' });
      assert.ok(await focusIn('#related-see'), `${how}: the focus goes back to See more`);
      assert.equal(await page.locator('#related-see').getAttribute('aria-expanded'), 'false');
    };
    await open();
    assert.equal(await page.locator('#related-more').getAttribute('role'), 'dialog');
    // The invasion of Poland is tagged by what it shows (its War Focus war and the countries on its map, K2), not by
    // the film's subjects.
    assert.deepEqual(await page.locator('#related-more h4').allInnerTexts(), ['THIS SCENE', 'TAGGED IN THE MASTER INDEX', 'THIS FILM']);
    assert.equal(await page.locator('#related-more button[data-rel]').count(), n, 'every screen');
    assert.equal(await page.locator('#related-more li a[target="_blank"]').count(), n, 'each with its own Open link');
    await page.click('#related-close'); await closed('the close button');
    await open(); await page.keyboard.press('Escape'); await closed('Escape');
    await open(); await page.click('#doc-title'); await closed('a click outside');
    await open(); await page.click('#related-see'); await closed('See more again');
    await open();
    await page.locator('#related-more button[data-rel]').last().click();
    await closed('a choice');
    assert.equal(await page.locator('#split').getAttribute('aria-pressed'), 'true', 'a choice turns Split view on');
    assert.equal(await page.locator('#side [data-side-hold]').getAttribute('aria-pressed'), 'true');
    // It opens inside full screen too.
    await page.click('#fullscreen');
    await page.waitForFunction(() => document.fullscreenElement?.id === 'theatre');
    await open();
    const more = await rect(page, '#related-more');
    assert.ok(more.y >= 0 && more.b <= (await rect(page, '#related-strip')).y + 1, 'over the player, above the strip');
  } finally { await browser.close(); }
});

test('page: in the shell with Split view off, a related screen opens beside the film and the shell stays', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await kinoLive(page);
    await page.addInitScript(() => { try { localStorage.setItem('prp.kino.related', 'true'); localStorage.setItem('prp.kino.split', 'false'); } catch { /* none */ } });
    await page.goto(`${BASE}/#/kino/kino-wars`, { waitUntil: 'domcontentloaded' });
    const kino = await (await page.waitForSelector('#frames iframe[data-module="kino-wars"]', { timeout: 20000 })).contentFrame();
    await kino.waitForSelector('.kn-card[data-doc="ww2-europe"]', { timeout: 20000 });
    await kino.evaluate(() => { location.hash = '#doc=ww2-europe&s=poland'; });
    await kino.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3, null, { timeout: 20000 });
    const route = await page.evaluate(() => location.hash);
    assert.equal(await kino.locator('#split').getAttribute('aria-pressed'), 'false');
    await kino.locator('#related-chips .kn-rel').nth(1).click();
    await kino.waitForSelector('#side iframe:not([hidden])', { timeout: 20000 });
    assert.equal(await kino.locator('#split').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => location.hash), route, 'the shell does not move');
  } finally { await browser.close(); }
});

test('page: at 360 px, Split view, the strip and See more open, nothing scrolls sideways', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    await page.addInitScript(() => { try { localStorage.setItem('prp.kino.related', 'true'); } catch { /* none */ } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=poland&split=1');
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    await sideFrame(page, 'war-focus');
    assert.equal(await page.evaluate(() => document.querySelector('#theatre').dataset.dir), 'column', 'the pane goes under the player');
    const ctl = await rect(page, '#controls'), side = await rect(page, '#side');
    assert.ok(side.y >= ctl.b - 1, 'after the controls');
    await page.click('#related-see');
    await page.locator('#related-more').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll');
    const more = await rect(page, '#related-more');
    assert.ok(more.x >= 0 && more.r <= 360);
  } finally { await browser.close(); }
});

test('page: a page in a pane offers no pane of its own, and its requests to move the shell open a new tab, not the top page', PAGE, async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    // Bibliotheca on its own, with a Kino film in its pane (a place the Master Index records for Machiavelli).
    await page.goto(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=7&p=c07-p01&t=Q1399&pane=vm&show=m2`, { waitUntil: 'domcontentloaded' });
    const film = await (await page.waitForSelector('#vm-frame:not([hidden])', { timeout: 30000 })).contentFrame();
    await film.waitForSelector('#cap-text .w', { timeout: 30000 });
    assert.equal(await film.evaluate(() => window.name), 'prp-side');
    for (const id of ['#split', '#related', '#follow']) assert.equal(await film.locator(id).isHidden(), true, `${id} is not offered in a pane`);
    assert.equal(await film.locator('#fullscreen').isVisible(), true, 'full screen still is');
    const book = await page.evaluate(() => location.hash);
    const [tab] = await Promise.all([context.waitForEvent('page'), film.click('[data-open-link]')]);
    await tab.waitForURL(/#\/rs\/encyclopedia\?at=/, { timeout: 10000 });
    assert.ok(tab.url().startsWith(`${BASE}/#/rs/encyclopedia?at=`), tab.url());
    await (await tab.waitForSelector('#frames iframe.active', { timeout: 20000 })).contentFrame().then(f => f.waitForSelector('#entity h2', { timeout: 30000 }));
    assert.equal(await page.evaluate(() => location.hash), book, 'the book keeps its place (chapter VII)');
    await tab.close();

    // Kino on its own, with the book in its pane: a link in the book that opens in Vitruvian Manager opens a new tab.
    await page.goto(`${BASE}/kino/index.html?cat=great-thinkers#doc=niccolo-machiavelli&s=opening&split=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cap-text .w', { timeout: 30000 });
    await page.keyboard.press('t');
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    await page.click('#related-see');
    await page.locator('#related-more button[data-rel]', { hasText: 'Named in The Prince' }).click();
    const reading = await sideFrame(page, 'bibliotheca');
    await reading.waitForSelector('#pane-toggle', { timeout: 30000 });
    if (await reading.locator('#pane').isHidden()) await reading.click('#pane-toggle');
    await reading.waitForSelector('#pane-open:not([hidden])', { timeout: 20000 });
    const filmAt = await page.evaluate(() => location.hash);
    const [tab2] = await Promise.all([context.waitForEvent('page'), reading.click('#pane-open')]);
    await tab2.waitForURL(/#\/rs\/encyclopedia\?at=/, { timeout: 10000 });
    await (await tab2.waitForSelector('#frames iframe.active', { timeout: 20000 })).contentFrame().then(f => f.waitForSelector('#entity h2', { timeout: 30000 }));
    assert.equal(await page.evaluate(() => location.hash), filmAt, 'the film keeps its place');
  } finally { await browser.close(); }
});

test('page: the Follow button reads "Follow in VM", one word space apart, and the Related chips keep their labels where the row is narrow', PAGE, async () => {
  const browser = await launch();
  try {
    // 1366 × 768 with Split view off: the strip under the film is narrow; the review saw the first chip's label 0 px wide.
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('prp.kino.related', 'true'); localStorage.setItem('prp.kino.split', 'false'); } catch { /* none */ } });
    await openFilm(page, 'wars', '#doc=ww2-europe&s=barbarossa');
    // K1: "Follow" and " in VM" are one run of text, so the button's flex gap falls only between the arrow and the words.
    assert.equal(await page.locator('#follow .lbl').textContent(), 'Follow in VM');
    assert.equal(await page.locator('#follow .lbl > .wide').count(), 1, 'the wide words inside the label');
    const gap = await page.evaluate(() => {
      const lbl = document.querySelector('#follow .lbl'), r = document.createRange(), t = lbl.firstChild;
      r.setStart(t, 0); r.setEnd(t, t.length); const a = r.getBoundingClientRect();
      const b = lbl.querySelector('.wide').getBoundingClientRect();
      return { between: b.left - a.right, space: parseFloat(getComputedStyle(lbl).fontSize) * 0.5 };
    });
    assert.ok(gap.between <= gap.space, `"Follow" and "in VM" are a word space apart, not more: ${JSON.stringify(gap)}`);
    // K2: three chips, each label shown whole or at least 60 px of it; the row scrolls sideways rather than squeeze them.
    await page.waitForFunction(() => document.querySelectorAll('#related-chips .kn-rel').length === 3);
    const chips = await page.locator('#related-chips .kn-rel').evaluateAll(bs => bs.map(b => { const t = b.querySelector('.t'); return { label: t.textContent, shown: t.clientWidth, whole: t.scrollWidth }; }));
    for (const c of chips) assert.ok(c.shown >= Math.min(60, c.whole), `the chip "${c.label}" shows ${c.shown} of ${c.whole} px`);
    const row = await page.evaluate(() => { const c = document.querySelector('#related-chips'); return { overflow: getComputedStyle(c).overflowX, page: document.documentElement.scrollWidth <= innerWidth }; });
    assert.equal(row.overflow, 'auto', 'the row scrolls sideways');
    assert.ok(row.page, 'the page does not');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
