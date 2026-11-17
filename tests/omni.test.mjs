// Digital Science · Omni-Map (omni/), stage S1 of PRP-SCHOLAR-USP-DESIGN.md: the flagship. Its pure and file parts in
// Node (the reader's map pane in Neo Book's address, the page-test launcher's flag, the test script, the registration
// in Digital Science, the page's one outside script with its Subresource Integrity hash); then, when JDPI_URL is set
// (npm run test:e2e -- tests/omni.test.mjs serves the site locally and sets it), the design's "Tests" paragraph for S1,
// clause by clause, in Microsoft Edge:
//   1 bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p03&t=Q236853&pane=map sets window.omniState to frame 1494,
//     window 1446..1514, step y and a box containing the Duchy of Milan's (Q153529) 1494 polygon;
//   2 the legend names Cliopatria v0.2.1, its licence and century precision;
//   3 Fornovo and Agnadello show their recorded dates, calendars and sources ("VM holds 2 battles for these years");
//   4 the bundle's rows equal the drawn feature ids and its pin verifies;
//   5 CSL-JSON, "Download data" and the address labelled "live view";
//   6 the default view stays under 1.5 MB compressed (the CPU-limit check is in tests/omni-data.test.mjs);
//   and WebGL (present in the test browser; a clear message without it or without the library), the shell's route,
//   the keyboard, light and dark, 1440 by 900 and 390 wide, a non-Latin name as written, no console errors.
// PRP_PAGES=0 (npm run test:unit) leaves the browser tests out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readHash, writeHash, readMap, PANES } from '../bibliotheca/neo/lib/hash.js';
import { readRecipe, writeRecipe } from '../design/vm-recipe.js';
import { readZip, zipStored, COLUMNS } from '../design/vm-bundle.js';
import { freshnessLine } from '../design/prp-freshness.js';
import { pageTest, launch, launchOptions } from './tools/pages.mjs';
import '../design/prp-focus.js';
import '../design/prp-map.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const file = p => readFileSync(join(ROOT, p), 'utf8');
const read = p => JSON.parse(file(p));
const M = globalThis.PRPMap;
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni.test.mjs)' };

// The flagship (design S1 and 2.3): The Prince, chapter III, c03-p03, the term Ludovico Sforza.
const FLAGSHIP = '/bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p03&t=Q236853&pane=map';
const RECIPE = 'vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853&from=neo:the-prince/3/c03-p03';
// MapLibre GL JS as the plan pinned it (17 November 2026), from three copies that agree byte for byte.
const ML = {
  version: '5.24.0',
  js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  jsSri: 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp',
  css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  cssSri: 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK',
};
const LIBRARY_MSG = 'The map library (MapLibre GL JS 5.24.0, from cdn.jsdelivr.net) could not load, so the map cannot be drawn. What the map would show is listed below.';
const WEBGL_MSG = 'This map needs WebGL, which this browser does not have or has turned off. What the map would show is listed below.';

// The Duchy of Milan's 1494 polygon, from the committed slice, as the core decodes it.
function milanBox() {
  const fc = M.decode(read('omni/data/borders/1400-1499.topo.json')), qids = read('omni/data/borders/qids.json');
  const { features, reason } = M.featuresFor(fc, qids, 'Q153529', 1494);
  assert.equal(reason, null, 'Q153529 resolves in 1494');
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of features) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
    for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

/* ================================================================ the files */
test('the reader\'s address: pane=map, &map=<recipe> and &sel=<pid>:<s>-<e> round-trip; readHash keeps its seven keys', () => {
  assert.deepEqual(PANES, ['terms', 'ency', 'vm', 'map'], 'contract 4: pane=map joins PANES');
  const s = { book: 'the-prince', ch: 3, p: 'c03-p03', t: 'Q236853', pane: 'map', show: null, era: null };
  const hash = writeHash({ ...s, map: RECIPE, sel: [{ p: 'c03-p03', s: 0, e: 120 }, { p: 'c03-p04', s: 5, e: 9 }] });
  assert.equal(hash, `#book=the-prince&ch=3&p=c03-p03&t=Q236853&pane=map&map=${encodeURIComponent(RECIPE)}&sel=c03-p03:0-120,c03-p04:5-9`);
  assert.deepEqual(readHash(hash), s, 'the seven keys, as before');
  assert.equal(Object.keys(readHash(hash)).length, 7);
  assert.deepEqual(readMap(hash), { map: RECIPE, sel: [{ p: 'c03-p03', s: 0, e: 120 }, { p: 'c03-p04', s: 5, e: 9 }] });
  // The recipe inside the reader's hash is percent-encoded once, so its own & and = do not split the reader's keys.
  assert.equal(new URLSearchParams(hash.slice(1)).get('t'), 'Q236853');
  // map= only with pane=map; a malformed recipe or selection reads as absent.
  assert.doesNotMatch(writeHash({ ...s, pane: 'ency', map: RECIPE }), /map=/);
  assert.equal(readMap(`#pane=ency&map=${encodeURIComponent(RECIPE)}`).map, null);
  assert.equal(readMap('#pane=map&map=vr%3D2%26t%3D1..2').map, null, 'not VR/1');
  assert.equal(readMap('#pane=map&map=nonsense').map, null);
  for (const bad of ['c03-p03', 'c03-p03:9-1', 'c03-p03:a-b', '<b>:1-2']) assert.equal(readMap(`#sel=${encodeURIComponent(bad)}`).sel, null, bad);
  // host=neo is the frame's key, never the reader's: a recipe carrying it is written without it.
  assert.equal(readMap(`#pane=map&map=${encodeURIComponent(RECIPE + '&host=neo')}`).map, RECIPE);
  assert.equal(readRecipe(readMap(hash).map).at, 1494);
});

test('page tests launch the browser with --enable-unsafe-swiftshader (WebGL in headless Edge and on CI)', () => {
  const o = launchOptions({ args: ['--mute-audio'] });
  assert.ok(o.args.includes('--enable-unsafe-swiftshader'));
  assert.ok(o.args.includes('--mute-audio'), 'a flag given is kept');
  assert.ok(launchOptions().args.includes('--enable-unsafe-swiftshader'));
  assert.equal(launchOptions({ channel: 'chrome' }).channel, 'chrome');
  assert.match(file('tests/tools/pages.mjs'), /chromium\.launch\(launchOptions\(options\)\)/, 'launch() uses it');
});

test('package.json\'s test script runs the S1 tests', () => {
  const pkg = read('package.json'), listed = pkg.scripts.test.match(/tests\/\S+\.test\.mjs/g);
  for (const f of ['tests/omni.test.mjs', 'tests/vm-core.test.mjs', 'tests/omni-data.test.mjs']) assert.ok(listed.includes(f), f);
  // The design allows one script-only devDependency, for the borders build: exact, never loaded by a page.
  assert.equal(pkg.devDependencies['topojson-server'], '3.0.1');
  assert.doesNotMatch(file('omni/index.html') + file('omni/app.js') + file('omni/lib/maplibre.js'), /topojson-(server|client)/i, 'the page decodes TopoJSON with design/prp-map.js');
});

test('registration: omni-map in Digital Science, its freshness line, llms.txt, the skill and the submodules list', () => {
  const reg = read('registry.json'), ds = reg.suites.find(s => s.id === 'ds');
  assert.deepEqual(ds.modules.map(m => m.id), ['data-analytics', 'omni-map', 'integration-hub', 'iot-connect']);
  const m = ds.modules.find(x => x.id === 'omni-map');
  assert.deepEqual([m.name, m.kind, m.status, m.host, m.url], ['Omni-Map', 'reference', 'live', 'Vitruvian Manager', 'omni/index.html']);
  assert.ok(existsSync(join(ROOT, m.url)));
  const icons = reg.suites.flatMap(s => s.modules.map(x => x.icon));
  assert.equal(icons.filter(i => i === m.icon).length, 1, 'its icon is its own');
  assert.doesNotMatch(m.description, /\b(unique|the only|the first)\b|unlike any/i, 'no claim the survey does not support');
  // A page with no single data file: the layer catalogue is the one file read, and its `generated` the newest layer.
  assert.deepEqual(m.data, { class: 'reference', parts: [{ read: 'omni/data/layers.json' }] });
  const layers = read('omni/data/layers.json');
  assert.equal(layers.generated, layers.layers.map(l => l.built).sort().at(-1));
  // The day after the newest layer was built, whenever that is (a hand rebuild moves it).
  const now = Date.parse(layers.generated) + 86400e3;
  const day = new Date(layers.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  assert.equal(freshnessLine(m, { 'omni/data/layers.json': { generated: layers.generated } }, { now }).text, `Reference · built ${day} · no schedule`);
  assert.equal(freshnessLine(m, {}, { now }).text, 'Reference · no schedule');
  // llms.txt and its builder: one line, under Optional, after Bibliotheca's.
  const llms = file('llms.txt');
  assert.equal((llms.match(/\[Digital Science · Omni-Map\]/g) || []).length, 1);
  assert.match(llms, /\(https:\/\/jdpi\.pages\.dev\/omni\/index\.html\)/);
  assert.ok(llms.indexOf('[Digital Science · Omni-Map]') > llms.indexOf('[Bibliotheca · Neo Book]'));
  assert.match(file('integration/scripts/llms.mjs'), /Digital Science · Omni-Map\]\(\$\{site\}omni\/index\.html\)/);
  const skill = file('integration/skill/prp-data/SKILL.md');
  assert.match(skill, /Cliopatria v0\.2\.1 \(Bennett et al\. 2025\)/);
  assert.match(skill, /omni\/index\.html#vr=1/);
  // The submodules list (integration/data/prp-submodules.json) is derived from registry.json by the daily catalogue
  // run (integration/scripts/build-catalog.mjs, with the catalogue's row counts and summaries in step): its derive
  // reads every registry module. omni-map entered it at the catalogue build of 17 November 2026, and must stay.
  assert.match(file('integration/scripts/build-catalog.mjs'), /derive: \(\) => REG\.suites\.flatMap\(s => s\.modules\.map\(m => \(\{ module: s\.id/);
  const row = read('integration/data/prp-submodules.json').records.find(r => r.id === 'omni-map');
  assert.ok(row, 'omni-map is in the submodules list');
  assert.deepEqual([row.module, row.name, row.url, row.status, row.kind], ['ds', 'Omni-Map', 'https://jdpi.pages.dev/omni/index.html', 'live', 'reference']);
  assert.equal(row.description, m.description);
});

test('the page: the site\'s shell and contract; MapLibre GL JS at its exact version with SRI is its only outside code', () => {
  const html = file('omni/index.html');
  assert.match(html, /<html lang="en" data-suite="ds" class="prp">/);
  assert.match(html, /<title>Omni-Map · VM<\/title>/);
  assert.match(html, /<link rel="icon" href="\.\.\/design\/brand-vm-icon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/design\/prp\.css">/);
  assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="ds" data-module="omni-map" data-shell="\.\.\/" defer><\/script>/);
  assert.match(html, /Digital Science <span class="sep">·<\/span> Omni-Map/);
  for (const c of ['prp-title', 'prp-dek', 'prp-meta', 'prp-sources']) assert.match(html, new RegExp(`class="${c}"`));
  assert.ok(![...html.matchAll(/<script\b([^>]*)>/g)].some(x => !/\bsrc=/.test(x[1])), 'no inline script');
  assert.ok(!/\sstyle=|<style/i.test(html), 'no style attribute or element');
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline handlers');
  // The one outside script and stylesheet: MapLibre GL JS, pinned, with its hash and crossorigin.
  const outside = [...html.matchAll(/<(script|link)\b[^>]*(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/g)].map(x => x[0]);
  assert.equal(outside.length, 2, outside.join('\n'));
  assert.ok(outside.some(t => t.includes(`src="${ML.js}"`) && t.includes(`integrity="${ML.jsSri}"`) && t.includes('crossorigin="anonymous"')), 'the script');
  assert.ok(outside.some(t => t.includes(`href="${ML.css}"`) && t.includes(`integrity="${ML.cssSri}"`) && t.includes('crossorigin="anonymous"')), 'the stylesheet');
  // Its scripts: the shared cores before the module.
  for (const s of ['../design/prp-focus.js', '../design/prp-period.js', '../design/prp-map.js']) assert.match(html, new RegExp(`<script src="${s.replace(/\./g, '\\.')}"`));
  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  // What VM may say of itself (the survey's sentence), and nothing more.
  assert.doesNotMatch(html, /\b(unique|the only|the first)\b|unlike any/i);
  // The credits each source asks for, in its words.
  assert.match(html, /Made with Natural Earth\./);
  assert.match(html, /MapLibre GL JS 5\.24\.0/);
  const css = file('omni/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colours come from the design system\'s tokens');
  // MapLibre's terms, recorded as 5.1 shapes a source.
  const src = read('integration/sources.json').sources.find(s => s.id === 'maplibre');
  assert.ok(src, 'sources.json records MapLibre GL JS');
  assert.equal(src.version, ML.version); assert.equal(src.licence, 'BSD 3-Clause');
  assert.match(src.termsQuote, /Redistribution and use in source and binary forms, with or without modification, are permitted/);
  assert.match(src.termsUrl, /maplibre-gl-js\/blob\/v5\.24\.0\/LICENSE\.txt$/);
});

test('Neo Book: a Map tab and its frame (contract 4); the click dispatches vm:click', () => {
  const html = file('bibliotheca/neo/index.html');
  assert.match(html, /role="tab" id="tab-map"[^>]*aria-controls="panel-map"/);
  assert.match(html, /id="panel-map" role="tabpanel" aria-labelledby="tab-map"/);
  assert.match(html, /<iframe id="map-frame"[^>]*title="Omni-Map"/);
  const app = file('bibliotheca/neo/app.js');
  assert.match(app, /new CustomEvent\('vm:click', \{ detail \}\)/);
  assert.match(app, /e\.origin === location\.origin/, 'frame messages are checked against the origin');
  assert.match(app, /omni\/index\.html#\$\{recipe\}&host=neo/);
});

/* ================================================================ the pages, in a browser */
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return; // the network, not the page
    errors.push(`console: ${m.text()} (${url})`);
  });
  return errors;
}
const ready = (frameOrPage, frame = null) => frameOrPage.waitForFunction(f => window.omniState?.ready && (f == null || window.omniState.frame === f), frame, { timeout: 60000 });
const frameOf = async (page, sel) => (await page.waitForSelector(sel, { timeout: 30000 })).contentFrame();
async function downloadOf(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]);
  const path = await d.path();
  return { name: d.suggestedFilename(), bytes: readFileSync(path) };
}
const files = bytes => Object.fromEntries(readZip(new Uint8Array(bytes)).map(f => [f.name, Buffer.from(f.bytes).toString('utf8')]));
const csvRows = text => text.trim().split('\r\n').map(l => l.split(','));

test('page: the flagship address opens the map pane on 1494, 1446..1514, year steps, Milan in the box (S1 tests 1–3)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    await page.goto(BASE + FLAGSHIP, { waitUntil: 'domcontentloaded' });
    // 1. The reader's own window holds the frame's state, as the frame posts it.
    await page.waitForFunction(() => window.omniState?.frame === 1494, null, { timeout: 60000 });
    const st = await page.evaluate(() => window.omniState);
    assert.equal(st.frame, 1494);
    assert.deepEqual(st.window, [1446, 1514]);
    assert.equal(st.step, 'y');
    const [w, s, e, n] = milanBox();
    assert.ok(st.box && st.box[0] <= w && st.box[1] <= s && st.box[2] >= e && st.box[3] >= n, `the box ${st.box} holds Milan's ${[w, s, e, n]}`);
    // The acceptance clauses, not the whole string: the lake's monthly refresh may add a place to the paragraph's terms.
    const got = readRecipe(st.recipe);
    assert.deepEqual([got.at, got.t, got.step, got.q, got.from], [1494, { from: 1446, to: 1514 }, 'y', 'Q236853', 'neo:the-prince/3/c03-p03']);
    assert.ok(got.focus.includes('Q153529'), 'the Duchy of Milan in focus');
    assert.ok(st.focus.includes('Q153529'), 'and outlined');
    assert.equal(st.webgl, true, 'the test browser has WebGL (tests/tools/pages.mjs launches with --enable-unsafe-swiftshader)');
    // The frame: the Omni-Map at the click's recipe, host=neo; its state is the one the reader holds.
    const frame = await frameOf(page, '#map-frame');
    await ready(frame, 1494);
    assert.match(frame.url(), /\/omni\/(index\.html)?#vr=1&t=1446\.\.1514&at=1494&.*&host=neo$/);
    assert.deepEqual(await frame.evaluate(() => window.omniState), st);
    // The reader's hash gains map= (its single source of truth), with the tab open.
    await page.waitForFunction(() => /&map=/.test(location.hash));
    assert.equal(readMap(await page.evaluate(() => location.hash)).map, st.recipe);
    assert.equal(await page.getAttribute('#tab-map', 'aria-selected'), 'true');
    // The card: "This passage" says there is no periods record yet; "Its whole life" is the view shown.
    assert.match(await page.textContent('#map-card'), /This paragraph has no periods record yet/);
    assert.match(await page.textContent('#map-card'), /Its whole life/);
    // 2. The legend names the source with its version, its licence and the century precision.
    const legend = await frame.textContent('#legend');
    for (const words of ['Cliopatria v0.2.1', 'CC BY 4.0', 'century precision']) assert.ok(legend.includes(words), `the legend: ${words}`);
    // 3. The battles VM holds for these years, each with its date as recorded, its calendar and its source.
    const battles = await frame.textContent('#battles');
    assert.match(battles, /VM holds 2 battles for these years/);
    for (const words of ['Battle of Fornovo', '6 July 1495', 'Gregorian calendar, as Wikidata records it',
      'Wikidata Q764793, point in time (P585): Wikipedia-sourced, unverified (imported from French Wikipedia)',
      'Battle of Agnadello', '14 May 1509', 'Julian calendar', 'Wikidata Q1754732, point in time (P585): no reference']) assert.ok(battles.includes(words), `the battles: ${words}`);
    assert.ok(!st.features.includes('Q764793'), 'Fornovo is not drawn at 1494');
    // A step to 1495 draws Fornovo; the reader's hash follows the frame.
    await frame.click('#next');
    await page.waitForFunction(() => window.omniState?.frame === 1495, null, { timeout: 15000 });
    assert.ok((await page.evaluate(() => window.omniState.features)).includes('Q764793'), 'Fornovo drawn at 1495');
    await page.waitForFunction(() => /at%3D1495/.test(location.hash));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Save this view (bundle) — rows equal the drawn ids, the pin verifies; CSL-JSON; Download data; live view (S1 tests 4–5)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = watch(page);
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    const st = await page.evaluate(() => window.omniState);
    // 4. The bundle.
    const b = await downloadOf(page, () => page.click('#save'));
    const z = files(b.bytes);
    assert.deepEqual(Object.keys(z).sort(), ['README.txt', 'choices.json', 'citation.bib', 'citation.csl.json', 'citation.ris', 'features.geojson', 'metadata.json', 'recipe.txt', 'rows.csv'].sort());
    const rows = csvRows(z['rows.csv']), head = rows[0], ids = rows.slice(1).map(r => r[head.indexOf('feature_id')]);
    assert.deepEqual(head, COLUMNS);
    const geoIds = JSON.parse(z['features.geojson']).features.map(f => f.id);
    assert.deepEqual([...ids].sort(), [...geoIds].sort(), 'rows.csv and features.geojson hold the same features');
    assert.deepEqual([...ids].sort(), [...st.features].sort(), 'and they are the features drawn');
    assert.ok(ids.length >= 100, `the 1494 outlines (${ids.length})`);
    const meta = JSON.parse(z['metadata.json']);
    const pin = createHash('sha256').update(`${z['recipe.txt']}\n${z['rows.csv']}\n${z['features.geojson']}`, 'utf8').digest('hex').slice(0, 12);
    assert.equal(meta.pin, pin, 'the pin verifies from the files alone');
    assert.equal(b.name, `vm-view-${pin}.zip`);
    assert.equal(meta.recipe, `${z['recipe.txt']}&pin=${pin}`);
    assert.match(z['recipe.txt'], /&ds=cliopatria@v0\.2\.1,borders@\d{8}T\d{4}Z,qids@\d{8}T\d{4}Z,natural-earth@5\.1\.1,battles@\d{8}T\d{4}Z&/);
    assert.equal(meta.vmCommit, null);
    assert.ok(meta.code.some(c => c.path === 'omni/app.js' && /^[0-9a-f]{64}$/.test(c.sha256)), 'the sha256 of each VM script run');
    assert.ok(meta.datasets.find(d => d.id === 'cliopatria' && d.version === 'v0.2.1' && d.licence === 'CC BY 4.0'));
    assert.match(z['README.txt'], /Ludovico Sforza, 1446–1514/);
    assert.equal(JSON.parse(z['citation.csl.json'])[0].type, 'dataset');
    assert.match(z['citation.ris'], /^TY {2}- DATA/);
    assert.match(z['citation.bib'], /^@misc\{vm-view-/);
    // 5. Cite this view (CSL-JSON), Download data with 5.8's columns, and the live-view label.
    const c = await downloadOf(page, () => page.click('#cite'));
    const csl = JSON.parse(c.bytes.toString('utf8'));
    assert.equal(csl[0].type, 'dataset'); assert.equal(csl[0].title, 'Ludovico Sforza, 1446–1514'); assert.equal(csl[0].publisher, 'Vitruvian Manager');
    // The year the view was saved, as its bundle records it (never a year written into the test).
    assert.match(await page.textContent('#apa'), new RegExp(`^JDP-Iq\\. \\(${meta.made.slice(0, 4)}\\)\\. Ludovico Sforza, 1446–1514 \\[Data set, version [0-9a-f]{12}\\]\\. Vitruvian Manager\\.`));
    const d = await downloadOf(page, () => page.click('#download'));
    const dz = files(d.bytes), csvName = Object.keys(dz).find(k => k.endsWith('.csv'));
    assert.equal(csvName, 'ludovico-sforza-1446-1514.csv');
    assert.deepEqual(csvRows(dz[csvName])[0].slice(0, 13), ['Entity', 'Code', 'date', 'precision', 'value', 'low', 'high', 'measure', 'status', 'by', 'origin', 'source_id', 'source_loc']);
    assert.ok(dz['ludovico-sforza-1446-1514.metadata.json'] && dz['README.txt']);
    const live = await page.textContent('#live-view');
    assert.match(live, /Live view/); assert.match(live, /only a saved bundle is exact/);
    // "Open a saved view" reads the bundle back from this computer, checks its pin and draws its frozen features.
    await page.setInputFiles('#open-file', { name: b.name, mimeType: 'application/zip', buffer: b.bytes });
    await page.waitForFunction(p => window.omniState?.mode === 'saved' && window.omniState.pin === p, pin, { timeout: 15000 });
    assert.match(await page.textContent('#saved-note'), new RegExp(`Saved view, pin ${pin}: its recipe, rows and features match the pin`));
    assert.match(await page.textContent('#saved-note'), new RegExp(`not covered by the pin, so the time it gives \\(made ${meta.made}\\)`));
    assert.deepEqual([...(await page.evaluate(() => window.omniState.features))].sort(), [...ids].sort());
    // A changed byte is refused, and says so.
    const bad = Buffer.from(b.bytes); bad[200] ^= 1;
    await page.setInputFiles('#open-file', { name: 'changed.zip', mimeType: 'application/zip', buffer: bad });
    await page.waitForFunction(() => /could not be opened/.test(document.querySelector('#saved-note').textContent), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the default view weighs under 1.5 MB compressed, MapLibre included (S1 test 6)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const bodies = [];
    page.on('response', r => bodies.push(r.body().then(b => ({ url: r.url(), gz: gzipSync(b, { level: 9 }).length })).catch(() => null)));
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    await page.waitForLoadState('networkidle');
    const got = (await Promise.all(bodies)).filter(Boolean);
    const total = got.reduce((a, x) => a + x.gz, 0);
    assert.ok(got.some(x => x.url === ML.js), 'MapLibre is counted');
    assert.ok(got.some(x => /\/omni\/data\/borders\/1400-1499\.topo\.json$/.test(x.url)), 'the frame\'s borders file');
    assert.ok(!got.some(x => /1500-1600\.topo\.json$/.test(x.url)), 'and only that one');
    assert.ok(total < 1.5e6, `${(total / 1e6).toFixed(2)} MB`);
  } finally { await browser.close(); }
});

test('page: without WebGL, and without the library (blocked or altered), the page says so and its lists still work', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    // WebGL turned off: getContext answers null for it.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return /webgl/i.test(k) ? null : g.call(this, k, ...a); }; });
    const p1 = await ctx.newPage();
    const e1 = []; p1.on('pageerror', e => e1.push(e.message));
    await p1.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(p1, 1494);
    assert.equal(await p1.textContent('#map-msg'), WEBGL_MSG);
    assert.equal(await p1.evaluate(() => window.omniState.webgl), false);
    assert.match(await p1.textContent('#battles'), /VM holds 2 battles for these years/);
    assert.ok((await p1.locator('#shows-list li').count()) >= 100, 'the outlines are listed');
    await p1.click('#next');
    await p1.waitForFunction(() => window.omniState.frame === 1495);
    assert.deepEqual(e1, []);
    await ctx.close();
    // The library blocked, then altered (its Subresource Integrity check refuses it).
    for (const how of ['blocked', 'altered']) {
      const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.route(ML.js, r => (how === 'blocked' ? r.abort() : r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: 'window.maplibregl={};' })));
      await p.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
      await ready(p, 1494);
      assert.equal(await p.textContent('#map-msg'), LIBRARY_MSG, how);
      assert.equal(await p.evaluate(() => typeof window.maplibregl), 'undefined', `${how}: nothing of it ran`);
      assert.match(await p.textContent('#legend'), /Cliopatria v0\.2\.1/);
      assert.deepEqual(errs, [], how);
      await p.close();
    }
  } finally { await browser.close(); }
});

test('page: the shell\'s route; keyboard, live region, light and dark, 1440×900 and 390 wide, a name as written', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    // Contract 7: #/ds/omni-map?at=<omni address> opens through the registry, in the shell.
    const shell = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await shell.goto(`${BASE}/#/ds/omni-map?at=${encodeURIComponent(`${BASE}/omni/index.html#${RECIPE}`)}`, { waitUntil: 'domcontentloaded' });
    const sf = await frameOf(shell, '#frames iframe.active');
    await ready(sf, 1494);
    assert.match(await shell.textContent('#crumbs'), /Omni-Map/);
    await shell.close();

    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = watch(page);
      await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
      await ready(page, 1494);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
      assert.ok(scroll <= inner + 1, `${width}: no sideways scroll (${scroll} on ${inner})`);
      // The keyboard alone: Tab reaches the year handle, the outlines, the battles and the three actions, in order.
      const order = [];
      for (let i = 0; i < 60 && order.length < 200; i++) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || ''));
      }
      for (const id of ['year', 'save', 'cite', 'download']) assert.ok(order.includes(id), `${width}: Tab reaches #${id} (${order.join(' ')})`);
      assert.ok(order.indexOf('year') < order.indexOf('save'), 'the slider before the actions');
      await page.focus('#year');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => window.omniState.frame === 1495);
      await page.waitForFunction(() => /^1495: \d+ outlines, 1 battle drawn$/.test(document.querySelector('#say').textContent), null, { timeout: 5000 });
      assert.equal(await page.getAttribute('#say', 'aria-live'), 'polite');
      // Light and dark: the page and the map take the theme's tokens.
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('prp:themechange')); });
      const light = await bg();
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new CustomEvent('prp:themechange')); });
      const dark = await bg();
      assert.notEqual(light, dark);
      await page.waitForFunction(() => window.omniState.theme === 'dark');
      assert.deepEqual(errors, [], `${width}`);
      await page.close();
    }
    // Đại Việt, as Cliopatria writes it, in a frame of the 1500s.
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(`${BASE}/omni/index.html#vr=1&t=1500..1600&at=1550&show=frame&step=y&base=plain&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
    await ready(p, 1550);
    assert.ok((await p.$$eval('#shows-list bdi', b => b.map(x => x.textContent))).includes('Đại Việt'));
    assert.match(await p.textContent('#battles'), /VM holds 1 battle for these years/);
    await p.close();
    // Outside the slice: a gap, said, never empty land.
    const q = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await q.goto(`${BASE}/omni/index.html#vr=1&t=1700..1750&at=1700&show=frame&step=y&base=plain&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
    await ready(q, 1700);
    assert.match(await q.textContent('#map-note'), /VM holds borders for 1400–1600 only/);
    assert.deepEqual(await q.evaluate(() => window.omniState.features), []);
    await q.close();
  } finally { await browser.close(); }
});

/* ================================================================ the review of 17 November 2026, in a browser */
// Fornovo's view, as a click on "Il Taro" in The Prince XXVI (c26-p08) wrote it until 17 November 2026 (2.3's worked
// example; a click now opens on 1495, the year it was fought: decision D4). The older address still opens as written.
const FORNOVO = 'vr=1&t=1494..1496&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q764793,Q58477&q=Q764793&from=neo:the-prince/26/c26-p08';
const yearShown = p => p.evaluate(() => document.querySelector('#year').getAttribute('aria-valuetext'));
const sha = p => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');

test('page: the review\'s findings on the Omni-Map itself (S1, S3, S4, S5, S6, S7, S8, S11, S14, S15, R5, R6, R7, R9, R10, R11, E4, E6)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = watch(page);
    // R5: the page opened on its own names no places, so it never says it cannot place them.
    await page.goto(`${BASE}/omni/index.html`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1400);
    assert.equal(await page.isHidden('#map-note'), true, 'no "VM cannot place this" when nothing was asked');
    // E4, R4: the legend folds, and its button says what is shown.
    await page.click('#legend-fold');
    assert.equal(await page.getAttribute('#legend-fold', 'aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#legend-body')).display), 'none');
    assert.match(await page.textContent('#legend-summary'), /Cliopatria v0\.2\.1, CC BY 4\.0/);
    await page.click('#legend-fold');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#legend-body')).display), 'none');

    // The flagship: R7's legend rows, S8's composite polities, S14's basis of each match and the book's title, R10.
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    const legend = await page.textContent('#legend');
    for (const w of ['In focus: the places of this view', 'outlined, not filled', 'composite polity']) assert.ok(legend.includes(w), `the legend: ${w}`);
    assert.match(legend, /Natural Earth 5\.1\.1, public domain/, 'R11c');
    assert.match(legend, /Wikidata, read 17 November 2026/);
    const shows = await page.$$eval('#shows-list li', ls => ls.map(l => l.textContent));
    assert.ok(shows.some(t => t.startsWith('(Kingdom of France)') && /composite: Kingdom of France with its dependencies/.test(t)), 'S8');
    const focus = await page.textContent('#focus-body');
    assert.match(focus, /Kingdom of France[\s\S]*matched by name; Cliopatria's own Wikidata id for it, Q207162, was rejected/);
    assert.match(focus, /Duchy of Milan[\s\S]*by Cliopatria's own Wikidata id/);
    assert.match(focus, /Neo Book · The Prince · chapter 3 · paragraph 3/);
    assert.match(await page.textContent('#frame-why'), /1494/, 'S1: the frame is explained beside it');
    const links = await page.$$eval('#battles-list .om-src a', as => as.map(a => a.href));
    assert.ok(links.includes('https://www.wikidata.org/wiki/Q764793#P585'), `S14: source lines link (${links})`);
    const battles = await page.textContent('#battles');
    assert.match(battles, /Not drawn at 1494; fought in 1495/, 'R11d');
    assert.doesNotMatch(battles, /\d\.\d{3}° [NS]/, 'S15: never more decimals than Wikidata records');
    assert.match(battles, /recorded to about 0\.017°/);
    const inside = await page.evaluate(() => { const m = document.querySelector('#map').getBoundingClientRect();
      return [...document.querySelectorAll('.om-label')].every(l => { const r = l.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1; }); });
    assert.equal(inside, true, 'R10: no label is cut at the map\'s edge');
    // S2, S5, S6, S7, S11: the bundle pins VM's own files and the crosswalk; its citation carries the pin.
    const b = await downloadOf(page, () => page.click('#save'));
    const z = files(b.bytes), meta = JSON.parse(z['metadata.json']);
    assert.match(z['recipe.txt'], /&ds=cliopatria@v0\.2\.1,borders@\d{8}T\d{4}Z,qids@\d{8}T\d{4}Z,natural-earth@5\.1\.1,battles@\d{8}T\d{4}Z&/);
    const ds = Object.fromEntries(meta.datasets.map(d => [d.id, d]));
    assert.equal(ds.cliopatria.sha256, read('omni/data/borders/index.json').archive.sha256, 'the release archive\'s own sha256');
    assert.equal(ds.borders.sha256, sha('omni/data/borders/1400-1499.topo.json'));
    assert.equal(ds.borders.source, 'cliopatria@v0.2.1');
    assert.equal(ds.qids.sha256, sha('omni/data/borders/qids.json'));
    assert.equal(ds.cliopatria.licenceUrl, 'https://creativecommons.org/licenses/by/4.0/');
    assert.match(z['README.txt'], /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//, 'S2');
    const feats = JSON.parse(z['features.geojson']).features;
    assert.ok(feats.every(f => !('q' in f.properties)), 'S7: no bare q');
    const fr = feats.find(f => f.properties.n === 'Kingdom of France');
    assert.equal(fr.properties.cliopatria_q, 'Q207162'); assert.equal(fr.properties.vm_q, 'Q70972'); assert.equal(fr.properties.cliopatria_q_rejected, true);
    const rows = csvRows(z['rows.csv']), head = rows[0];
    assert.ok(rows.slice(1).filter(r => r[head.indexOf('layer')] === 'borders').every(r => r[head.indexOf('precision')] === 'year'), 'S11');
    const cited = JSON.parse(z['citation.csl.json'])[0].URL;
    assert.match(cited, /&ds=cliopatria@v0\.2\.1,.*&pin=[0-9a-f]{12}$/, 'S6');
    assert.match(await page.textContent('#apa'), /&pin=[0-9a-f]{12}$/);
    // S6: the cited address, opened, says it is a saved view's and offers the bundle.
    await page.goto(`${BASE}/omni/index.html#${cited.split('#')[1]}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    assert.match(await page.textContent('#pins-note'), new RegExp(`saved view \\(pin ${meta.pin}\\)`));

    // S3, R3, E3, R9: Fornovo at 1494 is not drawn, and the page says when it is; names, not bare Q-ids.
    await page.goto(`${BASE}/omni/index.html#${FORNOVO}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    await page.waitForFunction(() => /Capua/.test(document.querySelector('#focus-body').textContent), null, { timeout: 15000 });
    let f = await page.textContent('#focus-body');
    assert.doesNotMatch(f, /shown as a point/);
    assert.match(f, /Battle of Fornovo/); assert.match(f, /drawn as a point at 1495/);
    await page.click('#next');
    await ready(page, 1495);
    f = await page.textContent('#focus-body');
    assert.match(f, /Battle of Fornovo[\s\S]*shown as a point/);
    assert.ok((await page.evaluate(() => window.omniState.features)).includes('Q764793'));

    // Decision D4 of 17 November 2026: a click on a battle opens its own view on the year it was fought, so the battle
    // is drawn when the map opens, and the page says why it opened there. The older address (at=1494) still says the
    // older reason.
    assert.match(await page.textContent('#frame-why'), /^$|^(?!.*the year it was fought)/, 'stepped away from the opening year: no reason shown, or not this one');
    await page.goto(`${BASE}/omni/index.html#${FORNOVO.replace('at=1494', 'at=1495')}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1495);
    assert.match(await page.textContent('#frame-why'), /^Opens on 1495, the year it was fought, as VM's click chose it: a battle's view opens on its own year\./);
    assert.ok((await page.evaluate(() => window.omniState.features)).includes('Q764793'), 'Fornovo is drawn as the map opens');
    await page.goto(`${BASE}/omni/index.html#${FORNOVO}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    assert.match(await page.textContent('#frame-why'), /^Opens on 1494, as VM's click chose it: the passage's own year/);

    // S4: a decade step keeps the recipe's own year as a stop, and the slider says the year the map shows.
    const decades = 'vr=1&t=580..1910&at=1494&show=frame&step=10y&base=plain&fill=borders&l=battles&focus=Q4948&q=Q4948';
    await page.goto(`${BASE}/omni/index.html#${decades}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    assert.equal(await yearShown(page), '1494');
    await page.focus('#year'); await page.keyboard.press('ArrowRight');
    await ready(page, 1500);
    await page.keyboard.press('ArrowLeft');
    await ready(page, 1494);
    assert.equal(await yearShown(page), '1494', 'and it can be returned to');

    // R6: outside the years VM holds, the places asked for are named with that reason.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=1300..1450&at=1350&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q153529&q=Q236853`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1350);
    await page.waitForFunction(() => /Duchy of Milan/.test(document.querySelector('#focus-body').textContent), null, { timeout: 15000 });
    f = await page.textContent('#focus-body');
    assert.doesNotMatch(f, /names no places/);
    assert.match(f, /Duchy of Milan[\s\S]*VM holds borders for 1400–1600 only/);
    assert.deepEqual(errors, []);
    await page.close();

    // E6: a lake record with a point (P625, stored from the 3 December build) is drawn as one, and said to be.
    const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p2.route(/\/lake\/data\/e\/109\.json$/, async r => {
      const res = await r.fetch(); const j = await res.json();
      j.Q58477 = { ...j.Q58477, pt: [14.2131, 41.1063], ptp: 0.0001 };
      await r.fulfill({ response: res, body: JSON.stringify(j) });
    });
    await p2.goto(`${BASE}/omni/index.html#${FORNOVO}`, { waitUntil: 'domcontentloaded' });
    await ready(p2, 1494);
    await p2.waitForFunction(() => window.omniState.misses.some(m => m.qid === 'Q58477' && m.point), null, { timeout: 15000 });
    assert.match(await p2.textContent('#focus-body'), /Capua[\s\S]*VM cannot outline this: shown as a point/);
    assert.ok((await p2.evaluate(() => window.omniState.points)).includes('Q58477'));
    await p2.close();

    // E4 at 390 wide: the legend starts folded to one line that still names source, version and precision.
    const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p3.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(p3, 1494);
    assert.equal(await p3.evaluate(() => getComputedStyle(document.querySelector('#legend-body')).display), 'none');
    assert.equal(await p3.getAttribute('#legend-fold', 'aria-expanded'), 'false');
    assert.match(await p3.textContent('#legend-summary'), /Cliopatria v0\.2\.1, CC BY 4\.0.*century precision before 1500/);
    await p3.close();
  } finally { await browser.close(); }
});

test('page: "Open a saved view" of another recipe takes the saved view whole: recipe, years, slider, title, address (E5)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = watch(page);
    const other = 'vr=1&t=1500..1600&at=1550&show=frame&step=y&base=plain&fill=borders&l=battles';
    await page.goto(`${BASE}/omni/index.html#${other}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1550);
    const b = await downloadOf(page, () => page.click('#save'));
    const z = files(b.bytes), csl = JSON.parse(z['citation.csl.json'])[0];
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    await page.setInputFiles('#open-file', { name: b.name, mimeType: 'application/zip', buffer: b.bytes });
    await page.waitForFunction(() => window.omniState?.mode === 'saved', null, { timeout: 15000 });
    const st = await page.evaluate(() => window.omniState);
    assert.equal(st.recipe, z['recipe.txt'], 'the saved recipe, never a mix of two');
    assert.deepEqual(st.window, [1500, 1600]); assert.equal(st.frame, 1550);
    assert.equal(await yearShown(page), '1550');
    assert.equal(await page.textContent('#view-subject'), csl.title);
    assert.match(await page.evaluate(() => location.hash), /t=1500\.\.1600&at=1550/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in Neo Book a click on a tagged name opens the map; a second click names its own subject (R1, R2, S1, R8, R11e, E10b)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p03`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#c03-p03 a.term[data-qid="Q236853"]', { timeout: 30000 });
    await page.locator('#c03-p03 a.term[data-qid="Q236853"]').first().click();
    await page.waitForFunction(() => window.omniState?.frame === 1494, null, { timeout: 60000 });
    assert.equal(await page.getAttribute('#tab-map', 'aria-selected'), 'true', 'R1: the click opens the Map tab');
    assert.match(await page.evaluate(() => location.hash), /&t=Q236853&pane=map&map=/);
    assert.match(await page.textContent('#map-card'), /the map opens on 1494, the start of the book's era \(1494–1527\): this paragraph has no periods record yet, so VM has not dated it/, 'S1');
    const frame = await frameOf(page, '#map-frame');
    await ready(frame, 1494);
    // R11e: the view shown stays marked as the slider moves.
    await frame.click('#next');
    await page.waitForFunction(() => window.omniState?.frame === 1495);
    assert.equal(await page.getAttribute('#map-card button[data-recipe]', 'aria-pressed'), 'true');
    // R2: a second term redraws the map under its own name, and its citation carries it.
    await page.locator('#c03-p03 a.term[data-qid="Q70972"]').first().click();
    await frame.waitForFunction(() => /Kingdom of France/.test(document.querySelector('#view-subject').textContent), null, { timeout: 30000 });
    const c = await downloadOf(page, () => frame.click('#cite'));
    assert.match(JSON.parse(c.bytes.toString('utf8'))[0].title, /^Kingdom of France, /);
    assert.deepEqual(errors, []);
    await page.close();
    // R8, E10b: at 390 wide the selected Map tab is on screen and the map starts near the top of its frame.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(BASE + FLAGSHIP, { waitUntil: 'domcontentloaded' });
    await phone.waitForFunction(() => window.omniState?.frame === 1494, null, { timeout: 60000 });
    const tab = await phone.locator('#tab-map').boundingBox();
    assert.ok(tab && tab.x >= 0 && tab.x + tab.width <= 390, `the Map tab is on screen (${tab?.x}, ${tab?.width})`);
    const pf = await frameOf(phone, '#map-frame');
    const top = await pf.evaluate(() => document.querySelector('#map').getBoundingClientRect().top);
    assert.ok(top < 70, `the map starts ${top} px down its frame`);
    assert.match(await pf.textContent('.om-time'), /1494/, 'the year beside the slider');
    await phone.close();
  } finally { await browser.close(); }
});

/* ================================================================ the second review (17 November 2026), in a browser */
test('page: the second review: names escaped (X1), what a saved view\'s pin covers (X2), up-to periods (X3), layers (X4), the open control\'s focus (X8)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    // X1: a composite polity's name reaches the page as text, never as markup.
    const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const forged = '(<img src=x id=om-forged onerror="window.omForged=1">)';
    await p1.route(/\/omni\/data\/borders\/1400-1499\.topo\.json$/, async r => {
      const res = await r.fetch(); const j = await res.json();
      for (const g of j.objects.borders.geometries) if (g.properties.n === '(Kingdom of France)') g.properties.n = forged;
      await r.fulfill({ response: res, body: JSON.stringify(j) });
    });
    await p1.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(p1, 1494);
    assert.equal(await p1.locator('#shows-list img').count(), 0, 'no element made from the name');
    const shown = await p1.$$eval('#shows-list li', ls => ls.map(l => l.textContent));
    assert.ok(shown.some(t => t.includes('composite: <img src=x id=om-forged') && t.includes('with its dependencies')), 'the name is shown as written');
    assert.equal(await p1.evaluate(() => window.omForged), undefined);
    await p1.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = watch(page);
    // X3: an up-to view draws every battle from the window's first year to the frame (design 2.1 rule 4: rest 'first').
    const upto = 'vr=1&t=1494..1509&at=1509&show=upto&step=y&base=plain&fill=borders&l=battles';
    await page.goto(`${BASE}/omni/index.html#${upto}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1509);
    let st = await page.evaluate(() => window.omniState);
    assert.ok(st.features.includes('Q764793') && st.features.includes('Q1754732'), `Fornovo (1495) and Agnadello (1509) at 1509 (${st.battles.drawn})`);
    assert.equal(st.recipe, upto, 'a start at its rest writes no since=');
    // K6 (17 November 2026): a battle's row says when it was fought as well as that it is drawn ("Drawn at 1509" alone,
    // for Fornovo, read as if it were fought in 1509).
    const state = q => page.textContent(`#battles-list li[data-q="${q}"] .om-b-state`);
    assert.equal((await state('Q764793')).trim(), 'Drawn at 1509; fought in 1495', 'Fornovo, drawn in an up-to view');
    assert.equal((await state('Q1754732')).trim(), 'Drawn at 1509, the year it was fought', 'Agnadello, drawn in its own year');
    // A start chosen by hand is kept in the recipe (since=) and drawn again from it after a reload.
    await page.focus('#from');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /&since=1500&/.test(window.omniState.recipe), null, { timeout: 15000 });
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.battles.drawn, ['Q1754732'], 'from 1500: Agnadello alone');
    await page.waitForFunction(() => /&since=1500&/.test(location.hash));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1509);
    st = await page.evaluate(() => window.omniState);
    assert.match(st.recipe, /&at=1509&since=1500&show=upto&/);
    assert.deepEqual(st.battles.drawn, ['Q1754732']);
    assert.equal(await page.getAttribute('#from', 'data-value'), '1500', 'the start handle where it was left');
    // The bundle carries it too, and its choices name the period drawn.
    const ub = await downloadOf(page, () => page.click('#save'));
    const uz = files(ub.bytes);
    assert.match(uz['recipe.txt'], /&since=1500&/);
    assert.deepEqual(JSON.parse(uz['choices.json']).period, [1500, 1509]);

    // X4: a recipe naming no battles layer draws, exports and reports none, and says so.
    const none = 'vr=1&t=1494..1509&at=1495&show=frame&step=y&base=plain&fill=borders';
    await page.goto(`${BASE}/omni/index.html#${none}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1495);
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.layers, ['borders']);
    assert.ok(!st.features.includes('Q764793'), 'Fornovo is not drawn');
    assert.deepEqual(st.battles.drawn, []);
    assert.ok(!st.legend.some(l => l.layer === 'battles'), 'the legend names the layers drawn');
    assert.match(await page.textContent('#battles-held'), /VM holds 2 battles for these years; this view draws none, as its recipe names no battles layer/);
    const nb = await downloadOf(page, () => page.click('#save'));
    const nrows = csvRows(files(nb.bytes)['rows.csv']), nhead = nrows[0];
    assert.ok(!nrows.slice(1).some(r => r[nhead.indexOf('layer')] === 'battles'), 'the bundle holds no battle');
    // And with l=battles, the same frame draws Fornovo.
    await page.goto(`${BASE}/omni/index.html#${none}&l=battles`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1495);
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.layers, ['borders', 'battles']);
    assert.ok(st.features.includes('Q764793'));

    // X2: a bundle whose unpinned files were changed still opens under its pin, but the page states nothing from them
    // as fact: the heading is made from the recipe, and the time it gives is said to be unchecked.
    const other = 'vr=1&t=1500..1600&at=1550&show=frame&step=y&base=plain&fill=borders&l=battles';
    await page.goto(`${BASE}/omni/index.html#${other}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1550);
    const b = await downloadOf(page, () => page.click('#save'));
    const z = files(b.bytes), csl = JSON.parse(z['citation.csl.json']), meta = JSON.parse(z['metadata.json']);
    const forgedMeta = { ...meta, made: '1900-01-01T00:00:00Z', datasets: meta.datasets.map(d => ({ ...d, licence: 'Forged licence' })) };
    const changed = { ...z, 'metadata.json': JSON.stringify(forgedMeta, null, 2) + '\n', 'citation.csl.json': JSON.stringify([{ ...csl[0], title: 'Forged title' }], null, 2) + '\n' };
    const repacked = Buffer.from(zipStored(Object.keys(z).map(name => ({ name, text: changed[name] }))));
    await page.setInputFiles('#open-file', { name: 'changed-metadata.zip', mimeType: 'application/zip', buffer: repacked });
    await page.waitForFunction(p => window.omniState?.mode === 'saved' && window.omniState.pin === p, meta.pin, { timeout: 15000 });
    const subject = await page.textContent('#view-subject');
    assert.notEqual(subject, 'Forged title', 'the heading is not taken from a file the pin does not cover');
    assert.equal(subject, csl[0].title, 'it is made from the recipe, as the genuine citation was');
    const note = await page.textContent('#saved-note');
    assert.match(note, /not covered by the pin, so the time it gives \(made 1900-01-01T00:00:00Z\), its citations and its licence text are as the file gives them, unchecked/);
    assert.doesNotMatch(await page.textContent('body'), /Forged (title|licence)/);
    assert.deepEqual(errors, []);
    await page.close();

    // X8: "Open a saved view" shows the keyboard's focus, in light and dark, at 1440 by 900 and 390 wide.
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const p = await browser.newPage({ viewport: { width, height } });
      await p.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
      await ready(p, 1494);
      for (const theme of ['light', 'dark']) {
        await p.evaluate(t => { document.documentElement.dataset.theme = t; window.dispatchEvent(new CustomEvent('prp:themechange')); }, theme);
        await p.focus('#download');
        await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(() => document.activeElement?.id), 'open-file', `${width} ${theme}: Tab reaches the file input`);
        const ring = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('label.om-open')); return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }; });
        assert.equal(ring.style, 'solid', `${width} ${theme}: its label shows the focus (${JSON.stringify(ring)})`);
        assert.equal(ring.width, '2px');
        const focusColour = await p.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--prp-focus)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; });
        assert.equal(ring.color, focusColour, `${width} ${theme}: in the theme's focus colour`);
      }
      await p.close();
    }
  } finally { await browser.close(); }
});

test('page: Neo Book opens a map= view whole, with no reader term (t=) in its address (X6)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=3&pane=map&map=${encodeURIComponent(RECIPE)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.omniState?.frame === 1494, null, { timeout: 60000 });
    assert.equal(await page.isVisible('#map-frame'), true, 'the frame is shown');
    const frame = await frameOf(page, '#map-frame');
    await ready(frame, 1494);
    assert.equal(readRecipe(await frame.evaluate(() => window.omniState.recipe)).q, 'Q236853', 'the address\'s own view');
    assert.doesNotMatch(await page.textContent('#panel-map'), /No term chosen/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
