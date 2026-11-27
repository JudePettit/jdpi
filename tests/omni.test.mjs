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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readHash, writeHash, readMap, PANES } from '../bibliotheca/neo/lib/hash.js';
import { readRecipe, writeRecipe } from '../design/vm-recipe.js';
import { readZip, zipStored, COLUMNS } from '../design/vm-bundle.js';
import { freshnessLine } from '../design/prp-freshness.js';
import { resolve, windowFor, frameFor, yearsNote, yearsText, ownYears } from '../design/vm-click.js';
import { formatSpan } from '../design/vm-dates.js';
import { yearText, readYear, ticksFor, playSteps, playStep, playSpan, nextStop, keepFiles } from '../omni/lib/time.js';
import { pageTest, launch, launchOptions, openFresh } from './tools/pages.mjs';
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

/* ================================================================ the whole span of borders (18 November 2026) */
// Jude, 17 November 2026: "I can only see 1400 to 1600 on the Omni Map on my browser, is the rest being built?" The
// borders now cover every year Cliopatria v0.2.1 holds. Its first and last years, as its archive's rows give them
// (read from cliopatria_polities_only_v021.geojson on 18 November 2026; build-borders.mjs reads them again on every
// run and stops if its files do not cover them exactly).
const CLIO_FIRST = -3400, CLIO_LAST = 2024;
const LIMIT_GZ = 1.5 * 1024 * 1024; // the design's limit per borders file (7.3), gzipped
const bordersIndex = () => read('omni/data/borders/index.json');
const decoded = new Map();
const fcOf = f => { if (!decoded.has(f.file)) decoded.set(f.file, M.decode(read(`omni/data/borders/${f.file}`))); return decoded.get(f.file); };

test('whole span: the index covers every year from Cliopatria\'s first to its last, with no gap and no year in no file', () => {
  const index = bordersIndex(), files = [...index.files].sort((a, b) => a.from - b.from);
  assert.deepEqual([index.from, index.to], [CLIO_FIRST, CLIO_LAST]);
  assert.deepEqual(M.held(index), { from: CLIO_FIRST, to: CLIO_LAST });
  assert.equal(files[0].from, CLIO_FIRST); assert.equal(files.at(-1).to, CLIO_LAST);
  for (let i = 1; i < files.length; i++) assert.equal(files[i].from, files[i - 1].to + 1, `no gap or overlap before ${files[i].file}`);
  // Every year a reader can ask for is in exactly one file (VM's years have no year 0: PRPMap reads 0 as no year).
  for (let y = CLIO_FIRST; y <= CLIO_LAST; y++) {
    if (y === 0) { assert.equal(M.fileFor(index, y), null); continue; }
    const holding = index.files.filter(f => f.from <= y && y <= f.to);
    assert.equal(holding.length, 1, `${y} is in one file`);
    assert.equal(M.fileFor(index, y), holding[0]);
  }
  assert.equal(M.fileFor(index, CLIO_FIRST - 1), null); assert.equal(M.fileFor(index, CLIO_LAST + 1), null);
  // The span is the rows' own: the first file holds a row from the first year, the last a row to the last.
  assert.ok(fcOf(files[0]).features.some(x => x.properties.f === CLIO_FIRST), 'a row starts in the first year');
  assert.ok(fcOf(files.at(-1)).features.some(x => x.properties.t === CLIO_LAST), 'a row ends in the last year');
  // The flagship's file is the one it has opened since 17 November 2026.
  assert.equal(M.fileFor(index, 1494).file, '1400-1499.topo.json');
  // The borders layer says the same years.
  const layer = read('omni/data/layers.json').layers.find(l => l.id === 'borders');
  assert.deepEqual([layer.time.from, layer.time.to], [CLIO_FIRST, CLIO_LAST]);
});

test('whole span: every file is within 1.5 MB gzipped, matches its index entry, and every row has its id, years and area', () => {
  const index = bordersIndex();
  let bytes = 0, gzip = 0;
  for (const f of index.files) {
    const p = `omni/data/borders/${f.file}`, buf = readFileSync(join(ROOT, p));
    const name = n => (n < 0 ? `m${-n}` : String(n));
    assert.equal(f.file, `${name(f.from)}-${name(f.to)}.topo.json`, 'the file is named by its years');
    assert.equal(createHash('sha256').update(buf).digest('hex'), f.sha256, `${f.file}: sha256`);
    const gz = gzipSync(buf, { level: 9 }).length;
    assert.ok(gz <= LIMIT_GZ, `${f.file}: ${gz} bytes gzipped (limit ${LIMIT_GZ})`);
    bytes += buf.length; gzip += gz;
    const fc = fcOf(f);
    assert.deepEqual(fc.vm, { format: 'vm-borders/1', source: 'cliopatria', version: 'v0.2.1', from: f.from, to: f.to });
    assert.equal(fc.features.length, f.rows, `${f.file}: rows`);
    const ids = new Set();
    for (const x of fc.features) {
      const r = x.properties;
      assert.ok(M.validId(r.id) && !ids.has(r.id), `${f.file}: ${r.id} an id, once`); ids.add(r.id);
      assert.ok(Number.isInteger(r.f) && Number.isInteger(r.t) && r.f <= r.t && r.f <= f.to && r.t >= f.from, `${r.n}: years ${r.f}..${r.t} in ${f.file}`);
      assert.ok(Number.isInteger(r.a) && r.a >= 0, `${r.n}: an area`);
      assert.ok(x.geometry && /Polygon$/.test(x.geometry.type), `${r.n}: a shape`);
    }
  }
  assert.ok(index.files.length >= 10, `${index.files.length} files`);
  assert.ok(bytes > 0 && gzip > 0);
});

test('whole span: no file names CShapes (its licence bars commercial use; VM\'s borders are Cliopatria\'s alone)', () => {
  const dir = join(ROOT, 'omni/data');
  const files = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  for (const p of files) assert.doesNotMatch(readFileSync(p, 'utf8'), /cshapes/i, p);
  assert.doesNotMatch(file('omni/index.html') + file('omni/app.js') + file('omni/scripts/build-borders.mjs').replace(/^\/\/.*$/gm, ''), /cshapes/i);
});

test('whole span: the crosswalk uses no rejected id, and the 24 pairs rejected on 17 November 2026 stay rejected', () => {
  const qids = read('omni/data/borders/qids.json');
  const overlaps = (r, a, b) => r.from <= b && a <= r.to;
  for (const no of qids.rejected) {
    const years = no.years ? [...no.years, ...(no.kept?.years || [])] : null;
    for (const r of qids.entries[no.q] || []) {
      if (r.name !== no.name) continue;
      assert.ok(years && !years.some(([a, b]) => overlaps(r, a, b)), `${no.q} "${no.name}" is rejected${years ? ` for ${JSON.stringify(years)}` : ''}, and never used (${r.from}..${r.to})`);
    }
  }
  const B = { stay: ['Q1074947|Kingdom of Pajana', 'Q10921634|Khoshut Khanate', 'Q112039853|Byzantine Empire', 'Q1406298|Serbian Empire',
    'Q202266|Old Kingdom of Norway', 'Q205662|Tokugawa Shogunate', 'Q207162|(Kingdom of France)', 'Q207162|Kingdom of France', 'Q213763|County of Béarn',
    'Q269109|Ryazan', 'Q28405|Joseon', 'Q29|Kingdom of Spain', 'Q373981|Tahirid Sultanate', 'Q39|Swiss Confederation', 'Q5582862|Cuzco',
    'Q577867|(Kingdom of Poland)', 'Q577867|Kingdom of Poland', 'Q605051|County of Touraine', 'Q703919|Ngô Dynasty', 'Q751868|County of Brabant',
    'Q79861|Michoacán', 'Q83546|Principality of Vladimir-Suzdal', 'Q918153|Ceylon', 'Q9676|Isle of Man'] };
  assert.equal(B.stay.length, 24);
  for (const pair of B.stay) {
    const [q, name] = pair.split('|');
    assert.ok(qids.rejected.some(r => r.q === q && r.name === name), `${pair} is listed as rejected`);
    assert.ok(!(qids.entries[q] || []).some(r => r.name === name), `${pair} is never used, in any year`);
  }
  // Every name the crosswalk gives is a row's name in the files of its years.
  const index = bordersIndex();
  for (const [q, rows] of Object.entries(qids.entries)) for (const r of rows) {
    const f = M.fileFor(index, r.from === 0 ? 1 : r.from);
    assert.ok(f && fcOf(f).features.some(x => x.properties.n === r.name), `${q}: "${r.name}" is in ${f?.file}`);
  }
  // What the crosswalk rests on: when Wikidata was read, and the Master Index's build it took its names from.
  assert.match(qids.wikidata.read, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(qids.wikidata.readings.reduce((a, r) => a + r.ids, 0), qids.wikidata.ids, 'each id under the reading that gave it');
  assert.match(qids.lake.generated, /^\d{4}-\d\d-\d\dT/);
});

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
  // A page with no single data file: the layer catalogue's head is the one file read (only `generated`, the newest
  // layer's build, which the builders write beside omni/data/layers.json), so every page's sidebar reads a few bytes
  // however large the catalogue grows (S5a fixer, R1).
  assert.deepEqual(m.data, { class: 'reference', parts: [{ read: 'omni/data/layers.head.json' }] });
  const layers = read('omni/data/layers.json'), head = read('omni/data/layers.head.json');
  assert.equal(layers.generated, layers.layers.map(l => l.built).sort().at(-1));
  assert.deepEqual(head, { format: 'vm-layers-head/1', of: 'omni/data/layers.json', generated: layers.generated }, 'the head follows the catalogue');
  // The day after the newest layer was built, whenever that is (a hand rebuild moves it).
  const now = Date.parse(layers.generated) + 86400e3;
  const day = new Date(layers.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  assert.equal(freshnessLine(m, { 'omni/data/layers.head.json': head }, { now }).text, `Reference · built ${day} · no schedule`);
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

/* ================================================================ the slider, Play and the click's own years (18 November 2026) */
// Jude, 15 November 2026: a slider back at least to cuneiform, with a Play button; 17 November (MP-08, MP-11): "I can
// only see 1400 to 1600 on the Omni Map"; and MP-10: "when I clicked Classical Athens in The Prince on Bibliotheca it
// hovered over Italy. It also notes classical Athens as lasting to 2026."
const heldNow = () => M.held(read('omni/data/borders/index.json'));

test('time: years before AD 1 are BC, and AD is written where a track holds both; a typed year is read, never year 0', () => {
  assert.equal(yearText(-508), '508 BC'); assert.equal(yearText(-1), '1 BC');
  assert.equal(yearText(1, { bc: true }), 'AD 1'); assert.equal(yearText(1494), '1494'); assert.equal(yearText(0), '');
  for (const [t, y] of [['500 BC', -500], ['500 bce', -500], ['AD 33', 33], ['33 AD', 33], ['33 CE', 33], ['-500', -500], ['−500', -500], ['1494', 1494], [' 1,494 ', 1494], ['3400 B.C.', -3400]]) assert.deepEqual(readYear(t), { year: y }, t);
  assert.deepEqual(readYear('0'), { error: 'zero' }); assert.deepEqual(readYear('0 BC'), { error: 'zero' });
  for (const t of ['', 'year', '15th century', '12-34']) assert.deepEqual(readYear(t), { error: 'unreadable' }, t);
});

test('time: the track\'s labels are its two ends and round years, few enough to read, never a year 0', () => {
  const held = heldNow();
  const all = ticksFor(-3400, 2024, { maxLabels: 8 });
  const keys = all.filter(t => t.text);
  assert.equal(keys[0].text, '3400 BC'); assert.equal(keys.at(-1).text, 'AD 2024');
  assert.ok(keys.length <= 9, `${keys.length} labels`);
  assert.ok(all.every(t => t.at !== 0), 'no tick on a year 0');
  assert.ok(keys.some(t => t.text === 'AD 1000') && keys.some(t => t.text === '1000 BC'), keys.map(t => t.text).join(', '));
  // A short window keeps plain years, as the flagship's slider always has.
  const f = ticksFor(1446, 1514, { maxLabels: 8 }).filter(t => t.text).map(t => t.text);
  assert.deepEqual([f[0], f.at(-1)], ['1446', '1514']); assert.ok(f.includes('1480'), f.join(', '));
  assert.ok(ticksFor(held.from, held.to).length > 2, 'the held span has labels between its ends');
  // Over 1 BC to AD 1 the years run on with no year 0.
  assert.deepEqual(ticksFor(-3, 3, { maxLabels: 10 }).filter(t => t.text).map(t => t.text), ['3 BC', '2 BC', '1 BC', 'AD 1', 'AD 2', 'AD 3']);
});

test('time: Play\'s steps, its next year (no year 0, the last stop, then stop) and the files it lets go of', () => {
  assert.deepEqual(playSteps(68, 1), [1, 5, 10, 25, 50]);
  assert.equal(playStep(68, 1), 1, 'the flagship plays year by year');
  assert.equal(playStep(5424, 1), 50, 'every year VM holds: in about 110 steps');
  assert.equal(playStep(1000, 1), 10);
  assert.deepEqual(playSteps(1300, 10), [10, 50, 100, 250, 500, 1000], 'a decade slider plays in decades or more');
  const stops = []; for (let y = -500; y <= 500; y++) if (y) stops.push(y);
  assert.equal(nextStop(stops, -1, 1), 1, '1 BC is followed by AD 1');
  assert.equal(nextStop(stops, -100, 100), 1, 'a hundred years after 100 BC is AD 1');
  assert.equal(nextStop(stops, 450, 100), 500, 'the last stop, when a step passes it');
  assert.equal(nextStop(stops, 500, 100), null, 'at the last stop Play stops');
  assert.deepEqual(keepFiles(['a', 'b', 'c', 'd', 'e', 'f'], ['a'], 4), ['b', 'c'], 'the oldest go, never one kept');
  assert.deepEqual(keepFiles(['a', 'b'], [], 4), []);
  // The second review of 18 November 2026. A view's span has no year 0 in it: 60 BC to AD 61 is 120 years and plays
  // year by year (121 would default to five), and 1 BC to AD 4 offers no five-year step across four years.
  assert.equal(playSpan(-60, 61), 120); assert.equal(playStep(playSpan(-60, 61), 1), 1); assert.equal(playStep(121, 1), 5);
  assert.equal(playSpan(-1, 4), 4); assert.deepEqual(playSteps(playSpan(-1, 4), 1), [1]);
  assert.equal(playSpan(1446, 1514), 68); assert.equal(playSpan(7, 7), 1);
  const app = readFileSync(new URL('../omni/app.js', import.meta.url), 'utf8');
  assert.match(app, /const span = playSpan\(win\.from, win\.to\);/, 'Play counts its span with no year 0');
  // A move by hand lets go of old files too, not only Play; and a Play move that waits for its file says so.
  assert.match(app, /letGo\(file \? \[file\.file\] : \[\]\);\s+if \(seq !== S\.seq\) return;/, 'setFrame bounds the decoded files');
  assert.match(app, /if \(f && !S\.loaded\.has\(f\.file\)\) loadingNote\(`Loading the borders for \$\{yt\(y\)\}…`\);\s+if \(f\) \{ try \{ await bordersFor\(f\)/, 'Play says when it waits for a file');
});

// Classical Athens as the Master Index holds it (lake/data/e/130.json, read 18 November 2026): founded -0508, no end.
const ATHENS = { q: 'Q844930', label: 'Classical Athens', type: 'place', facts: { founded: '-0508' },
  rel: { Country: [['Q844930', 'Classical Athens'], ['Q41', 'Greece']], 'Member of': [['Q193235', 'Delian League'], ['Q332337', 'League of Corinth']] } };
const GREECE = { q: 'Q41', label: 'Greece', type: 'place', facts: { founded: '1821-03-25' }, rel: { 'Member of': [['Q1065', 'United Nations']] } };
const ROME = { q: 'Q1747689', label: 'Ancient Rome', type: 'place', facts: { founded: '-0753', dissolved: '0476' } };
const ATHENS_FROM = { module: 'neo-classic', at: 'bibliotheca/neo/index.html#book=the-prince&ch=5&p=c05-p02&t=Q844930', passage: { book: 'the-prince', ch: 5, p: 'c05-p02' } };
const princeCtx = extra => ({ today: '2026-11-18', era: [1494, 1527], lookup: q => ({ Q41: GREECE, Q1747689: ROME })[q] || null, passagePlaces: ['Q1747689', 'Q844930'], ...extra });

test('MP-10: an entry with a start and no end is never shown as lasting to this year; the heading says the end is not recorded', () => {
  const w = windowFor(ATHENS, { kind: 'place', today: '2026-11-18' });
  assert.deepEqual([w.from, w.to], [-513, -503], 'its first recorded year, five years either side (a lone date\'s rule), never AD 2026');
  assert.equal(yearsNote(ATHENS, { today: '2026-11-18' }), 'from 508 BC, end not recorded');
  assert.equal(yearsNote(ROME, { today: '2026-11-18' }), null, 'both ends recorded: the window says it');
  // What the data says still exists runs to today: a member of the United Nations with no end, and a person born within
  // a lifetime of today (vm-core's rule, unchanged).
  const g = windowFor(GREECE, { kind: 'place', today: '2026-11-18' });
  assert.equal(g.to, 2026, 'Greece, a member of the United Nations with no end, still stands');
  assert.equal(windowFor({ facts: { born: '1950-01-01' } }, { kind: 'person', today: '2026-11-18' }).to, 2026);
  // A war with a start and no end, and a place with no end, are their start alone.
  assert.notEqual(windowFor({ type: 'conflict', facts: { start: '1618' } }, { kind: 'war', today: '2026-11-18' }).to, 2026);
  assert.equal(yearsNote({ type: 'person', facts: { born: '1452' } }, { today: '2026-11-18' }), 'born 1452, death not recorded');
  assert.equal(yearsNote({ type: 'place', facts: { dissolved: '1406' } }, {}), 'to 1406, start not recorded');
});

test('MP-10: a click opens on the entry\'s own years: its first year VM can outline, else its own first year; the book\'s era only inside them', () => {
  // Classical Athens from The Prince V: the book's era (1494–1527) is not in its years, so the map opens on 508 BC.
  const r = resolve(ATHENS, ATHENS_FROM, princeCtx());
  const v = readRecipe(r.recipe);
  assert.deepEqual([v.t, v.at], [{ from: -513, to: -503 }, -508], r.recipe);
  assert.doesNotMatch(r.recipe, /2026/);
  assert.ok(v.focus.includes('Q844930'), 'itself in focus');
  assert.ok(!v.focus.includes('Q41'), 'never today\'s Greece');
  const life = r.offers.find(o => o.id === 'life');
  assert.match(life.why, /^Classical Athens's first recorded year, 508 BC, five years either side \(its end is not recorded\); the map opens on 508 BC, its own first recorded year/);
  assert.doesNotMatch(life.why, /2026|book's era/);
  // A place whose rows begin after its own first year opens on the first year VM can outline it.
  const republic = { q: 'Q17167', label: 'Roman Republic', type: 'place', facts: { founded: '-0509', dissolved: '-0027-01-16' } };
  const rr = readRecipe(resolve(republic, ATHENS_FROM, princeCtx({ outlined: q => (q === 'Q17167' ? [[-500, -32]] : null) })).recipe);
  assert.equal(rr.at, -500, 'Cliopatria outlines the Roman Republic from 500 BC');
  assert.equal(readRecipe(resolve(republic, ATHENS_FROM, princeCtx()).recipe).at, -509, 'without the crosswalk: its own first year');
  assert.match(resolve(republic, ATHENS_FROM, princeCtx({ outlined: () => [[-500, -32]] })).offers.find(o => o.id === 'life').why, /the map opens on 500 BC, the first year of its own that VM can outline/);
  // The rule on its own: the era's start where it falls in the window, as before (Ludovico Sforza's 1494).
  assert.equal(frameFor({ from: 1446, to: 1514 }, { era: [1494, 1527], own: 1452, outlined: [[1300, 1600]] }), 1494);
  assert.equal(frameFor({ from: -513, to: -503 }, { era: [1494, 1527], own: -508 }), -508);
  assert.equal(frameFor({ from: -561, to: 30 }, { era: [1494, 1527], own: -509, ownTo: -27, outlined: [[-750, -501], [-500, -32]] }), -509, 'the first outlined year inside its own');
  assert.equal(frameFor({ from: 1060, to: 1620 }, { own: 1115, ownTo: 1569, outlined: [[1260, 1571]] }), 1260);
  assert.equal(frameFor({ from: 1060, to: 1620 }, { own: 1115, ownTo: 1569, outlined: [[1600, 1700]] }), 1115, 'outlined only after its own end: its own first year');
});

// Review R2 (18 November 2026): the Roman Empire's record (lake/data/e/229.json, read 18 November 2026) holds its start
// under `start` and its end under both `dissolved` and `end`; it was read as an end alone, "start not recorded".
test('R2: each end is taken from the first key that records it, so the Roman Empire runs 27 BC to AD 395', () => {
  const EMPIRE = { q: 'Q2277', label: 'Roman Empire', type: 'place', facts: { dissolved: '0395-01-17', start: '-0027-01', end: '0395' } };
  assert.equal(yearsText(EMPIRE, { today: '2026-11-18' }), '27 BC–AD 395');
  assert.equal(yearsNote(EMPIRE, { today: '2026-11-18' }), null, 'both ends recorded: nothing is said to be missing');
  assert.deepEqual(ownYears(EMPIRE, { today: '2026-11-18' }), { from: -27, to: 395 });
  const w = windowFor(EMPIRE, { kind: 'place', today: '2026-11-18' });
  assert.ok(w.from < -27 && w.to > 395, `its whole span, with a margin (${w.from}..${w.to})`);
  const life = resolve(EMPIRE, ATHENS_FROM, princeCtx()).offers.find(o => o.id === 'life');
  assert.doesNotMatch(life.why, /not recorded/);
  // Founded beats start, dissolved beats end, as before; a person's birth and death are never mixed with them.
  assert.deepEqual(ownYears({ type: 'place', facts: { founded: '1100', start: '1200', end: '1300' } }), { from: 1100, to: 1300 });
  assert.deepEqual(ownYears({ type: 'person', facts: { born: '1452', end: '1500' } }, { today: '2026-11-18' }), { from: 1452, to: null });
  assert.equal(ownYears({ type: 'place', facts: {} }), null);
});

// Review R5: Ancient Egypt (founded -4000, dissolved -0030 in the Master Index) began before the borders VM holds.
test('R5: an entry whose own first year is before the borders VM holds opens on their first year, and says why', () => {
  const EGYPT = { q: 'Q11768', label: 'Ancient Egypt', type: 'place', facts: { founded: '-4000', dissolved: '-0030' } };
  const r = resolve(EGYPT, ATHENS_FROM, princeCtx({ held: [-3400, 2024] }));
  assert.equal(readRecipe(r.recipe).at, -3400);
  assert.match(r.offers.find(o => o.id === 'life').why, /the map opens on 3400 BC, the first of its own years that VM holds borders for \(its first recorded year, 4000 BC, is before them\)/);
  assert.equal(readRecipe(resolve(EGYPT, ATHENS_FROM, princeCtx()).recipe).at, -4000, 'without the years VM holds: its own first year, as before');
  // A lone start before them is not moved to a year it never reached (Classical Athens, with only 1400–1600 held).
  assert.equal(readRecipe(resolve(ATHENS, ATHENS_FROM, princeCtx({ held: [1400, 1600] })).recipe).at, -508);
});

test('the page: Play, its step and pace, "Go to year" and every year VM holds are the page\'s own; design/prp-period.js draws the track', () => {
  const html = file('omni/index.html'), app = file('omni/app.js');
  for (const id of ['play', 'play-step', 'play-pace', 'goto', 'goto-year', 'whole-span', 'play-note']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<label for="goto-year">Go to year<\/label>/);
  assert.match(app, /from '\.\/lib\/time\.js'/);
  assert.match(app, /play: false, steps: true/, 'the period control draws ‹ ›; Play is the page\'s, so it can wait for a file');
  assert.doesNotMatch(html.match(/<button[^>]*id="play"[^>]*>/)[0], /aria-pressed/, 'R9: its label says what a press does; it is not also a pressed toggle');
  assert.match(app, /'omni\/lib\/time\.js'/, 'a bundle records the sha256 of the time script too');
  assert.doesNotMatch(app, /out\.length < 5000/, 'the stops are not cut short of every year VM holds');
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
    assert.equal(got.filter(x => /\/omni\/data\/borders\/[^/]+\.topo\.json$/.test(x.url)).length, 1, 'and only that one');
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
      for (let i = 0; i < 90 && order.length < 200; i++) { // S5c's layers add tab stops before the actions
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
    // 1700, outside the first version's 1400–1600, is drawn since 18 November 2026, from its own file.
    const q = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await q.goto(`${BASE}/omni/index.html#vr=1&t=1700..1750&at=1700&show=frame&step=y&base=plain&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
    await ready(q, 1700);
    assert.ok((await q.evaluate(() => window.omniState.features)).length >= 100, 'the borders of 1700 are drawn');
    assert.deepEqual(await q.evaluate(() => window.omniState.held), { from: -3400, to: 2024 });
    await q.close();
    // Past the last year Cliopatria holds: a gap, said, never empty land.
    const q2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await q2.goto(`${BASE}/omni/index.html#vr=1&t=2025..2030&at=2026&show=frame&step=y&base=plain&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
    await ready(q2, 2026);
    assert.match(await q2.textContent('#map-note'), /VM holds borders for 3400 BC–AD 2024 only/);
    assert.deepEqual(await q2.evaluate(() => window.omniState.features), []);
    await q2.close();
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
    // The date of VM's read of Wikidata, as sources.json gives it (S5b's widened battles read it again on 20 November 2026).
    const wdRead = new Date(read('integration/sources.json').sources.find(s => s.id === 'wikidata').version).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.ok(legend.includes(`Wikidata, read ${wdRead}`), `the legend names Wikidata's read of ${wdRead}`);
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
    // S6: the cited address, opened, says it is a saved view's and offers the bundle. (Opened in a new document, as a
    // reader opens it: a hash-only goto and a reload could open the page's rewrite of it instead, tests/tools/pages.mjs.)
    await openFresh(page, `${BASE}/omni/index.html#${cited.split('#')[1]}`);
    await ready(page, 1494);
    assert.match(await page.textContent('#pins-note'), new RegExp(`saved view \\(pin ${meta.pin}\\)`));

    // S3, R3, E3, R9: Fornovo at 1494 is not drawn, and the page says when it is; names, not bare Q-ids.
    await page.goto(`${BASE}/omni/index.html#${FORNOVO}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    await page.waitForFunction(() => /Capua/.test(document.querySelector('#focus-body').textContent), null, { timeout: 15000 });
    let f = await page.textContent('#focus-body');
    // Fornovo is not drawn at 1494 (Capua may be: the Master Index stores its point from its full build).
    const fornovoRow = await page.$$eval('#focus-body li', ls => ls.map(l => l.textContent).find(t => /Battle of Fornovo/.test(t)) || '');
    assert.doesNotMatch(fornovoRow, /shown as a point/);
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

    // R6: outside the years VM holds (since 18 November 2026, after Cliopatria's last year), the places asked for are
    // named with that reason.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=2025..2030&at=2026&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q153529&q=Q236853`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 2026);
    await page.waitForFunction(() => /Duchy of Milan/.test(document.querySelector('#focus-body').textContent), null, { timeout: 15000 });
    f = await page.textContent('#focus-body');
    assert.doesNotMatch(f, /names no places/);
    assert.match(f, /Duchy of Milan[\s\S]*VM holds borders for 3400 BC–AD 2024 only/);
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
    // 27 November 2026, once, on a machine under heavy load: this goto failed with net::ERR_ABORTED. A reader found it is
    // the message of a navigation the browser dropped, thought not a timeout, a download or the page navigating away;
    // none of that is proved, and the cause is not found. One lead is not yet probed: tests/tools/serve.mjs answers
    // /bibliotheca/neo/index.html with a 308 to /bibliotheca/neo/, so this goto is two requests, and a starved server or
    // network service could drop the second. Should it come again, the failure says how long the goto took, where the
    // page was left, and each request that failed on the way (its address and the browser's reason).
    const t0 = Date.now(), dropped = [];
    const onFailed = r => dropped.push(`${r.url()} (${r.failure()?.errorText || 'no reason given'})`);
    page.on('requestfailed', onFailed);
    await page.goto(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p03`, { waitUntil: 'domcontentloaded' })
      .catch(e => { throw new Error(`${e.message.split('\n')[0]} (after ${Date.now() - t0} ms; the page is at ${page.url()}; failed on the way: ${dropped.join('; ') || 'none'})`, { cause: e }); });
    page.off('requestfailed', onFailed);
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
    // V4 (S5b/S5c review): the battles' file is not read for a view that does not draw them, so they are not counted.
    assert.match(await page.textContent('#battles-held'), /^This view draws no battles, as its recipe names no battles layer \(l=battles\)/);
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

/* ================================================================ the slider and Play, in a browser (18 November 2026) */
const BC_AD = 'vr=1&t=-3..3&at=-1&show=frame&step=y&base=plain&fill=borders';
const PLAY_VIEW = 'vr=1&t=-500..500&at=-500&show=frame&step=y&base=plain&fill=borders';

test('page: the slider covers every year VM holds: its two ends, 1 BC to AD 1, a typed year, and every year from a click\'s view', PAGE, async () => {
  const held = heldNow(), bc = held.from < 0;
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    // With no recipe: every year VM holds, opening on 1400 as it always has.
    await page.goto(`${BASE}/omni/index.html`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1400);
    let st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.window, [held.from, held.to]);
    assert.deepEqual(readRecipe(st.recipe).t, { from: held.from, to: held.to });
    assert.equal(await page.isHidden('#whole-span'), true, 'every year is shown already');
    const ticks = await page.$$eval('#timeline .prp-period-ticks span', s => s.map(x => x.textContent).filter(Boolean));
    assert.deepEqual([ticks[0], ticks.at(-1)], [yearText(held.from, { bc }), yearText(held.to, { bc })], 'the track\'s two ends');
    // Its two ends, by key.
    await page.focus('#year');
    await page.keyboard.press('Home');
    await ready(page, held.from);
    assert.equal(await yearShown(page), yearText(held.from, { bc }));
    assert.equal(await page.textContent('#time-year'), yearText(held.from, { bc }));
    await page.keyboard.press('End');
    await ready(page, held.to);
    assert.equal(await yearShown(page), yearText(held.to, { bc }));
    // 1 BC is followed by AD 1: there is no year 0.
    await page.goto(`${BASE}/omni/index.html#${BC_AD}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, -1);
    assert.equal(await yearShown(page), '1 BC');
    await page.focus('#year');
    await page.keyboard.press('ArrowRight');
    await ready(page, 1);
    assert.equal(await yearShown(page), 'AD 1');
    assert.equal(await page.textContent('#time-year'), 'AD 1');
    assert.match(await page.evaluate(() => location.hash), /&at=1&/);
    await page.keyboard.press('ArrowLeft');
    await ready(page, -1);
    // A year typed: exact, whatever the track's width; outside the view's years it shows every year VM holds.
    const target = held.from <= -500 ? -500 : held.from + 50;
    await page.fill('#goto-year', yearText(target, { bc: true }));
    await page.press('#goto-year', 'Enter');
    await ready(page, target);
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.window, [held.from, held.to], 'widened to every year VM holds');
    assert.equal(await yearShown(page), yearText(target, { bc }));
    await page.fill('#goto-year', '0');
    await page.press('#goto-year', 'Enter');
    await page.waitForFunction(() => /There is no year 0/.test(document.querySelector('#play-note').textContent));
    await page.fill('#goto-year', 'AD 3000');
    await page.press('#goto-year', 'Enter');
    await page.waitForFunction(() => /VM holds borders for .* only/.test(document.querySelector('#play-note').textContent));
    assert.equal(await page.evaluate(() => window.omniState.frame), target, 'a year VM does not hold leaves the map where it was');
    // From a click's view, "Every year VM holds" widens its slider and keeps its year.
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    assert.equal(await page.isVisible('#whole-span'), true);
    await page.click('#whole-span');
    await page.waitForFunction(w => window.omniState.window[0] === w, held.from);
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual([st.frame, st.window], [1494, [held.from, held.to]]);
    assert.equal(readRecipe(st.recipe).q, 'Q236853', 'the same view, over every year');
    assert.deepEqual(errors, []);
    // At 390 wide the controls fit without a sideways scroll.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(`${BASE}/omni/index.html`, { waitUntil: 'domcontentloaded' });
    await ready(phone, 1400);
    const { scroll, inner } = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
    assert.ok(scroll <= inner + 1, `no sideways scroll (${scroll} on ${inner})`);
    await phone.close();
  } finally { await browser.close(); }
});

test('page: Play steps through 500 BC to AD 500 at the step and pace chosen, loads each file before it is drawn, pauses, and stops at the end', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    const asked = new Map();
    page.on('request', r => { const m = /\/omni\/data\/borders\/([^/?#]+\.topo\.json)$/.exec(r.url()); if (m && !asked.has(m[1])) asked.set(m[1], Date.now()); });
    await page.goto(`${BASE}/omni/index.html#${PLAY_VIEW}`, { waitUntil: 'domcontentloaded' });
    await ready(page, -500);
    assert.equal((await page.textContent('#play')).trim(), 'Play');
    assert.equal(await page.getAttribute('#play', 'aria-pressed'), null, 'R9: not a pressed toggle as well as a label that changes');
    await page.selectOption('#play-step', '100');
    await page.selectOption('#play-pace', '250');
    // Each frame as the page publishes it, with when it was drawn.
    await page.evaluate(() => { window.__frames = []; let last = null; setInterval(() => { const s = window.omniState; if (s.frame !== last) { last = s.frame; window.__frames.push([s.frame, Date.now()]); } }, 5); });
    await page.click('#play');
    assert.equal((await page.textContent('#play')).trim(), 'Pause');
    await page.waitForFunction(() => window.omniState.frame === 500 && window.omniState.play && !window.omniState.play.on, null, { timeout: 60000 });
    const frames = await page.evaluate(() => window.__frames);
    assert.deepEqual(frames.map(f => f[0]), [-500, -400, -300, -200, -100, 1, 101, 201, 301, 401, 500], 'a hundred years a step, AD 1 after 100 BC, and the last year');
    assert.equal((await page.textContent('#play')).trim(), 'Play', 'stopped at the end');
    assert.match(await page.textContent('#play-note'), /Stopped at AD 500, the last year of this view/);
    // Each borders file Play needed was asked for before it was needed: at least one step (250 ms) before the first
    // frame it holds was drawn. (With the first version's data these years hold no file, and none is asked for.)
    const index = read('omni/data/borders/index.json');
    for (const [y, when] of frames.slice(1)) {
      const f = M.fileFor(index, y);
      const first = frames.find(([z]) => M.fileFor(index, z)?.file === f?.file);
      if (!f || first[0] !== y || f.file === M.fileFor(index, -500)?.file) continue;
      assert.ok(asked.has(f.file), `${f.file} was asked for`);
      assert.ok(asked.get(f.file) <= when - 150, `${f.file} asked for ${when - asked.get(f.file)} ms before ${y} was drawn`);
    }
    // Played again from the end, it starts at the view's first year; paused, it stays.
    await page.click('#play');
    await page.waitForFunction(() => window.omniState.frame >= -300 && window.omniState.play.on, null, { timeout: 20000 });
    await page.click('#play');
    const at = await page.evaluate(() => window.omniState.frame);
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.omniState.frame), at, 'paused');
    assert.equal(await page.evaluate(() => window.omniState.play.on), false);
    // A move by the reader stops it too.
    await page.click('#play');
    await page.waitForFunction(a => window.omniState.frame > a, at, { timeout: 20000 });
    await page.focus('#year');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => !window.omniState.play.on, null, { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: addresses from before the whole span open what they opened: a saved view\'s, the old default\'s, and Kino\'s moves', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    // A saved view's address as a bundle of 17 November 2026 wrote it (its pins name that day's files).
    const OLD = `${RECIPE}&ds=cliopatria@v0.2.1,borders@20261117T0524Z,qids@20261117T0524Z,natural-earth@5.1.1,battles@20261117T0522Z&pin=5f0e1c2d3b4a`;
    await page.goto(`${BASE}/omni/index.html#${OLD}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    let st = await page.evaluate(() => window.omniState);
    assert.deepEqual([st.frame, st.window, st.step], [1494, [1446, 1514], 'y']);
    const got = readRecipe(st.recipe);
    assert.deepEqual([got.t, got.at, got.q, got.pin], [{ from: 1446, to: 1514 }, 1494, 'Q236853', '5f0e1c2d3b4a']);
    assert.match(await page.textContent('#pins-note'), /saved view \(pin 5f0e1c2d3b4a\)/);
    assert.ok(st.focus.includes('Q153529'), 'Milan outlined, as it was');
    // The page's default until 18 November 2026, opened by its address.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=1400..1600&at=1400&show=frame&step=y&base=plain&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1400);
    st = await page.evaluate(() => window.omniState);
    assert.deepEqual(st.window, [1400, 1600]);
    // Kino drives the map by its address (host=kino): each new recipe redraws it, and stops Play.
    await page.goto(`${BASE}/omni/index.html#${PLAY_VIEW}&host=kino`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, -500);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('om-host-kino')), true);
    await page.click('#play');
    await page.waitForFunction(() => window.omniState.play.on);
    await page.evaluate(r => { location.hash = `#${r}&host=kino`; }, RECIPE);
    await ready(page, 1494);
    assert.equal(await page.evaluate(() => window.omniState.play.on), false, 'a recipe from Kino stops Play');
    assert.match(await page.evaluate(() => location.hash), /&host=kino$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Review R1, R3, R6, R8 (18 November 2026).
test('page: the heading gives the clicked entry\'s own years, a slow borders file is said to be loading, the frame says its one reason, and an address it cannot follow is said', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    // R1: Ludovico Sforza's own years (the Master Index's), with the window named as the map's, never as his dates.
    await page.goto(`${BASE}/omni/index.html#${RECIPE}`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    const rec = read(`lake/data/e/${236853 % 512}.json`).Q236853;
    const own = yearsText(rec, { today: new Date().toISOString().slice(0, 10) });
    assert.equal(await page.textContent('#view-subject'), `${rec.label} (${own}): map of 1446–1514`);
    // R6: the one reason that applies (the start of the book's era is the reader's to say).
    assert.match(await page.textContent('#frame-why'), /^Opens on 1494, as VM's click chose it: the passage's own year, or the start of the book's era, as the reader's card beside the map says\./);
    // R3: while the file for the slider's new year loads, the note says so and the map's year stays where it is drawn.
    // The file is held until the test has seen all this, not for a set time, which a loaded runner's test process can
    // outlast (National's busy map was missed that way, 26 November 2026).
    const slow = /\/omni\/data\/borders\/(?!1400-1499)[^/]+\.topo\.json$/;
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route(slow, async route => { await gate; await route.continue(); });
    await page.focus('#year');
    await page.keyboard.press('End');
    await page.waitForFunction(() => /^Loading the borders for 1514…$/.test(document.querySelector('#play-note').textContent), null, { timeout: 5000 });
    assert.equal(await page.textContent('#time-year'), '1494', 'the year shown is the one drawn');
    assert.equal(await page.evaluate(() => window.omniState.frame), 1494);
    release();
    await ready(page, 1514);
    assert.equal(await page.textContent('#time-year'), '1514');
    assert.equal(await page.textContent('#play-note'), '', 'said no more once drawn');
    await page.unroute(slow);
    // R6: the page's own view, with no address. (Each address below is opened in a new document, as a reader opens it:
    // a goto and a reload could open the page's own rewrite of it instead, which leaves out what it cannot read, at=0
    // say, and so has nothing to note; tests/tools/pages.mjs, openFresh.)
    await openFresh(page, `${BASE}/omni/index.html`);
    const held = heldNow(), bc = held.from < 0;
    await ready(page, held.from <= 1400 && 1400 <= held.to ? 1400 : held.from);
    assert.match(await page.textContent('#frame-why'), new RegExp(`^Opens on ${yearText(held.from <= 1400 && 1400 <= held.to ? 1400 : held.from, { bc })}; the slider holds every year VM holds, ${formatSpan(held.from, held.to)}\\.$`));
    assert.doesNotMatch(await page.textContent('#frame-why'), /recipe/);
    // R8: a year 0, years that hold a year 0, and a year after the address's own years are said, not changed in silence.
    for (const [hash, at, says] of [
      ['vr=1&t=-5..5&at=0&show=frame&step=y&base=plain&fill=borders', -5, /This address names year 0, which does not exist \(1 BC is followed by AD 1\); it opens on 5 BC\./],
      ['vr=1&t=0..10&at=5&show=frame&step=y&base=plain&fill=borders', held.from <= 5 ? 5 : held.from, /This address's years \(0\.\.10\) include a year 0, which does not exist \(1 BC is followed by AD 1\), so the slider shows every year VM holds/],
      [`vr=1&t=${held.from}..${held.to}&at=${held.to + 2}&show=frame&step=y&base=plain&fill=borders`, held.to, /is outside its own years .*, so it opens on .*, the last of them\./],
    ]) {
      await openFresh(page, `${BASE}/omni/index.html#${hash}`);
      await ready(page, at);
      assert.match(await page.textContent('#focus-body'), says, hash);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: a click\'s view opens on the clicked place\'s own outline; where VM holds none, it says so and shows the world (MP-10)', PAGE, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    const boxOf = q => { const fc = M.decode(read('omni/data/borders/1400-1499.topo.json')), qids = read('omni/data/borders/qids.json');
      const { features } = M.featuresFor(fc, qids, q, 1494); let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const f of features) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      return [w, s, e, n]; };
    // The Republic of Florence clicked, with the Kingdom of France in the same passage: the map opens on Florence.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=1060..1620&at=1494&show=frame&step=10y&base=plain&fill=borders&l=battles&focus=Q148540,Q70972&q=Q148540`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1494);
    let st = await page.evaluate(() => window.omniState);
    const fl = boxOf('Q148540'), fr = boxOf('Q70972');
    assert.ok(st.focus.includes('Q148540') && st.focus.includes('Q70972'), 'both outlined and in focus');
    assert.ok(st.box[0] <= fl[0] && st.box[1] <= fl[1] && st.box[2] >= fl[2] && st.box[3] >= fl[3], `the box ${st.box} holds Florence ${fl}`);
    assert.ok(st.box[2] - st.box[0] < fr[2] - fr[0], 'and is Florence\'s, not France\'s too');
    // Classical Athens, which Cliopatria does not outline under its name and the Master Index gives no point: said, and the world.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=-513..-503&at=-508&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q844930,Q148540&q=Q844930`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, -508);
    // The Master Index stores each entry's point (pt) from its full build: with one, the map opens on it; without, it
    // says so and shows the world.
    const rec = read(`lake/data/e/${844930 % 512}.json`).Q844930;
    if (Array.isArray(rec?.pt)) await page.waitForFunction(() => window.omniState.points?.includes('Q844930'), null, { timeout: 15000 });
    else await page.waitForFunction(() => /Classical Athens/.test(document.querySelector('#map-note').textContent), null, { timeout: 15000 });
    st = await page.evaluate(() => window.omniState);
    const note = await page.textContent('#map-note');
    if (Array.isArray(rec?.pt)) {
      assert.ok(st.box && st.box[0] <= rec.pt[0] && rec.pt[0] <= st.box[2] && st.box[1] <= rec.pt[1] && rec.pt[1] <= st.box[3], `centred on its recorded point ${rec.pt} (${st.box})`);
      assert.ok(st.box[2] - st.box[0] < 20, 'Classical Athens\'s point, not a box over Florence as well');
      assert.match(await page.textContent('#focus-body'), /Classical Athens Q844930[^]*?: shown as a point/);
    } else {
      assert.equal(st.box, null, 'the world, not another place\'s box');
      assert.match(note, /^VM holds no outline of Classical Athens for 508 BC/);
      assert.match(note, /the Master Index holds no point for it, so the map shows the whole world/);
    }
    assert.match(await page.textContent('#focus-body'), /Classical Athens[\s\S]*its own dates in the Master Index: from 508 BC, end not recorded/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// MP-12 (Jude, 17 November 2026): the three movement buttons. move= is a frame-only key after the recipe (as host=),
// outside VR/1: the recipe the page publishes (omniState.recipe) never carries it, so Kino and saved views are unchanged.
import { movementCheck } from './tools/movement.mjs';
test('page: the movement buttons: Move Together moves both years with the span kept, Single Year draws one year, the address keeps move= outside the recipe', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const recipe = 'vr=1&t=1900..2000&at=1950&since=1940&show=frame&step=y&base=plain&fill=borders';
  const ready = p => p.waitForFunction(() => window.omniState?.ready && window.omniState.frame != null && document.querySelector('#year')?.dataset.value, null, { timeout: 60000 });
  const { s0, s5 } = await movementCheck(page, {
    url: `${BASE}/omni/index.html#${recipe}`, from: '#from', to: '#year', single: 'Single Year', ready,
    // What the map draws: the published recipe's year shown (at=) and the period's start (since=, absent for one year).
    readout: p => p.evaluate(() => window.omniState.recipe),
    together: (r, s) => r.includes(`at=${s.to}`) && r.includes(`since=${s.from}`), one: (r, s) => r.includes(`at=${s.to}`) && !/since=/.test(r),
  });
  assert.deepEqual([s0.from, s0.to], ['1940', '1950'], 'an address with no move= opens its period as before');
  assert.match(s5.address, /&move=single/);
  // The recipe never carries the movement; the page's own Play in Move Together moves both, the span kept.
  await page.goto(`${BASE}/omni/index.html#${recipe}&move=together`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  assert.doesNotMatch(await page.evaluate(() => window.omniState.recipe), /move/);
  assert.equal(await page.locator('[data-move="together"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#play-pace').selectOption('250');
  await page.locator('#play').click();
  await page.waitForFunction(() => +document.querySelector('#year').dataset.value >= 1953, null, { timeout: 30000 });
  await page.locator('#play').click();
  const span = await page.evaluate(() => +document.querySelector('#year').dataset.value - +document.querySelector('#from').dataset.value);
  assert.equal(span, 10, 'Play in Move Together keeps the span');
  // A new address that arrives while Single Year is chosen is drawn in its own movement, its period whole (second
  // review X2, 20 November 2026: the slider took the new period while still in Single Year, and its start was lost).
  await page.goto('about:blank');
  await page.goto(`${BASE}/omni/index.html#${recipe}&move=single`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#from').dataset.value, document.querySelector('#year').dataset.value]), ['1950', '1950']);
  await page.evaluate(r => { location.hash = r; }, recipe.replace('at=1950', 'at=1960'));
  await page.waitForFunction(() => document.querySelector('#year').dataset.value === '1960' && /at=1960/.test(window.omniState.recipe), null, { timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#from').dataset.value, document.querySelector('#year').dataset.value, document.querySelector('.prp-period-move[aria-pressed="true"]').dataset.move]),
    ['1940', '1960', 'independent'], 'the period the new address names, in Independent');
  assert.match(await page.evaluate(() => window.omniState.recipe), /since=1940/);
  assert.deepEqual(errors, []);
});
