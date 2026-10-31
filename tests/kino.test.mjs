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
import { pageTest, launch } from './tools/pages.mjs';

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
