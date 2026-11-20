/* Digital Science · Omni-Map (PRP-SCHOLAR-USP-DESIGN.md S1, the flagship): a view drawn from a recipe in the address.

   The address is a VR/1 recipe (design/vm-recipe.js): omni/index.html#vr=1&t=1446..1514&at=1494&show=frame&step=y&
   base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853&from=neo:the-prince/3/c03-p03 (Neo Book's click
   writes it, design/vm-click.js), with host=neo when the page is the reader's Map tab (a frame-only key, outside VR/1).
   With no recipe the page opens on the borders VM holds, from their first year. As the frame moves the page writes
   the recipe back to its own address (replaceState), and in the reader's frame posts { type: 'vm:view', recipe, state }
   to the reader, which keeps it in its own address (the contract's point 4).

   What it reads (all VM's own files; nothing else but MapLibre GL JS, which omni/index.html loads):
     data/layers.json               the layer catalogue (4.2), each entry checked by PRPMap.readLayer
     data/borders/index.json        which file holds which years (vm-borders-index/1); only the frame's file loads
     data/borders/<from>-<to>.topo.json   Cliopatria v0.2.1's rows (vm-borders/1), decoded by PRPMap.decode
     data/borders/qids.json         the crosswalk from Q-ids to Cliopatria's names by year (a Q-id is drawn only through it)
     data/base/ne_110m_land.geojson the plain base (Natural Earth 5.1.1, land only)
     data/layers/battles.json       the battles VM holds for 1400–1600, each value with its source line
     ../integration/sources.json    VM's sources (5.1): the legend names each source, its version and licence
     ../lake/data/e/<n>.json        the clicked object's Master Index record, for its name (the view's title)

   window.omniState, the page's state for its tests and for the reader (which holds a copy):
     { ready, mode: 'live' | 'saved', recipe, frame, window: [from, to], step, show, box: [w, s, e, n] | null,
       features: [ids drawn, borders and battles, sorted], layers, legend, battles: { held, drawn }, misses, focus,
       held: { from, to }, map: 'drawn' | 'no-webgl' | 'no-library', webgl, theme, pin? }
   features are every row the frame draws, whole: the same recipe and data give the same features whatever the
   screen, so a saved bundle's pin can be checked by anyone (the bundle's README says so). */
import { readRecipe, writeRecipe, readHost } from '../design/vm-recipe.js';
import { formatYear, formatSpan, formatValueDate, valueDateToEdtf, yearOf, addYears, precisionWord } from '../design/vm-dates.js';
import { bundleFiles, dataFiles, zipStored, readZip, pin as pinOf, apa } from '../design/vm-bundle.js';
import { makeMap, webglOk } from './lib/maplibre.js';
import { layerView } from './lib/layer-view.js'; // the layer list and the layers of stage S5a
import { listenFocus } from './lib/focus.js'; // prp:focus by ISO3 fits the map (stage S5c)
import { yearsText, ownYears } from '../design/vm-click.js';
import { yearText, readYear, ticksFor, playSteps, playStep, playSpan, nextStop, keepFiles } from './lib/time.js';

const M = window.PRPMap, P = window.PRPPeriod;
const $ = s => document.querySelector(s);
const esc = M.esc;
const DATA = new URL('data/', import.meta.url).href;
const SITE = new URL('../', import.meta.url).href;
// With no recipe the page opens on every year VM holds (Jude, 15 and 17 November 2026: "I can only see 1400 to 1600"),
// on 1400 where VM holds it, as the page always has; until 18 November 2026 the default was 1400..1600, and an address
// that names those years still opens on them.
const defaultRecipe = () => {
  const h = M.held(S.index) || { from: 1400, to: 1600 };
  const at = h.from <= 1400 && 1400 <= h.to ? 1400 : h.from;
  return `vr=1&t=${h.from}..${h.to}&at=${at}&show=frame&step=y&base=plain&fill=borders&l=battles`;
};
// A year as the track and the headings write it: '508 BC', and 'AD 33' wherever the view holds years before AD 1.
const yt = y => yearText(y, { bc: !!S.bc }) || formatYear(y);
const MAPLIBRE = 'MapLibre GL JS 5.24.0';
const MAPLIBRE_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
const MSG = {
  library: 'The map library (MapLibre GL JS 5.24.0, from cdn.jsdelivr.net) could not load, so the map cannot be drawn. What the map would show is listed below.',
  webgl: 'This map needs WebGL, which this browser does not have or has turned off. What the map would show is listed below.',
};
// The VM scripts this page runs, whose sha256 a bundle records (vmCommit is null: a static site cannot know its commit).
const CODE = ['design/prp-bar.js', 'design/prp-focus.js', 'design/prp-period.js', 'design/prp-map.js', 'design/vm-recipe.js', 'design/vm-dates.js',
  'design/vm-bundle.js', 'design/vm-click.js', 'lake/scripts/dates.mjs', 'omni/app.js', 'omni/lib/maplibre.js', 'omni/lib/time.js',
  'omni/lib/layers.js', 'omni/lib/layer-view.js', 'omni/lib/layers-now.js', 'omni/lib/focus.js'];
const PROVIDERS = ['Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager', 'Natural Earth 5.1.1 (public domain)', 'Wikidata (CC0)'];
const host = readHost(location.hash);
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (host) document.documentElement.classList.add(`om-host-${host}`);

const S = {
  R: null, layers: null, index: null, qids: null, base: null, battles: null, sources: null, subject: null, subjectQ: null,
  files: new Map(), bufs: new Map(), frame: null, start: null, stops: [], period: null, map: null, mapState: 'drawn',
  drawn: [], drawnBattles: [], focusPoints: [], box: null, seq: 0, notes: [], mode: 'live', saved: null, labelCache: new Map(),
  shards: new Map(), shelf: null, loaded: new Set(), loading: null, bare: false,
  // The slider's movement (MP-12): 'independent' (the default), 'together' or 'single'. It is a frame-only key outside
  // VR/1, as host= is (&move=… after the recipe, only away from the default): no recipe, saved view or bundle carries
  // it, so Kino's recipes and saved views open at the default, as before.
  move: 'independent',
};
const moveOf = raw => P.rules.readMovement(new URLSearchParams(String(raw || '').replace(/^#/, '')).get(P.MOVE_PARAM));
window.omniState = { ready: false };

/* ---------- loading ---------- */
async function getFile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url, location.href).pathname}`);
  const buf = await r.arrayBuffer();
  return { json: JSON.parse(new TextDecoder().decode(buf)), buf };
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const digest = bytes => crypto.subtle.digest('SHA-256', bytes);
const stamp = iso => String(iso || '').replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})\d*(?:\.\d+)?Z$/, '$1Z');
// A borders file, decoded once and kept while it is among the last few used (S.used, most recent last): over thousands
// of years Play passes through many files, and only the frame's and the next ones Play needs are always kept.
async function bordersFor(file) {
  if (!S.files.has(file.file)) {
    const p = getFile(`${DATA}borders/${file.file}`).then(({ json, buf }) => { S.bufs.set(file.file, buf); return M.decode(json); });
    p.then(() => { if (S.files.get(file.file) === p) S.loaded.add(file.file); }, () => { if (S.files.get(file.file) === p) S.files.delete(file.file); });
    S.files.set(file.file, p);
  }
  S.used = [...(S.used || []).filter(f => f !== file.file), file.file];
  return S.files.get(file.file);
}
function letGo(keep) {
  for (const f of keepFiles(S.used || [], keep, 4)) { S.files.delete(f); S.bufs.delete(f); S.loaded.delete(f); S.labelCache.clear(); }
  S.used = (S.used || []).filter(f => S.files.has(f));
}
const sourceOf = id => S.sources?.find(s => s.id === id) || null;
const layerOf = id => S.layers?.layers.find(l => l.id === id) || null;
// The Master Index record of a Q-id (lake/data/e/<n>.json, one small shard each, kept): its name, and its point (P625,
// stored as pt from the lake's build of 3 December 2026), for a place VM cannot outline.
const shardOf = q => +q.slice(1) % 512;
function lakeRecord(q) {
  if (!/^Q\d+$/.test(q || '')) return Promise.resolve(null);
  const n = shardOf(q);
  if (!S.shards.has(n)) S.shards.set(n, getFile(new URL(`lake/data/e/${n}.json`, SITE).href).then(r => r.json).catch(() => ({})));
  return S.shards.get(n).then(j => j[q] || null);
}
const records = new Map(); // q → the record, once read
async function readRecords(qs) {
  await Promise.all([...new Set(qs)].filter(q => !records.has(q)).map(async q => { records.set(q, await lakeRecord(q)); }));
}
const lakePoint = q => { const r = records.get(q); return Array.isArray(r?.pt) && r.pt.length === 2 && r.pt.every(Number.isFinite) ? r.pt : null; };
const battleRow = q => (S.battles?.rows || []).find(r => r.q === q) || null;
// A name for a Q-id: the Master Index's, else the battle's, else the crosswalk's (Cliopatria's), else the bare id.
const labelOf = q => records.get(q)?.label || battleRow(q)?.label || S.qids?.entries?.[q]?.[0]?.name || null;
// The places of a recipe VM may need a record for: those its crosswalk cannot outline (a name or a point to give).
const unoutlined = R => (R.focus || []).filter(x => /^Q\d+$/.test(x) && !S.qids?.entries?.[x]?.length);
// The shelf, for a book's title where a view came from Neo Book (a small file, read only then, once).
let shelfRead = null;
function loadShelf(R) {
  if (!NEO.test(R?.from || '')) return null;
  shelfRead ||= getFile(new URL('bibliotheca/data/index.json', SITE).href).then(r => { S.shelf = r.json.books || null; }).catch(() => { S.shelf = null; });
  return shelfRead;
}
async function loadSubject(q) {
  if (S.subjectQ === q) return;
  S.subjectQ = q; S.subject = null;
  if (!q) return;
  await readRecords([q]);
  if (S.subjectQ === q) S.subject = records.get(q)?.label || null;
}

/* ---------- the recipe ---------- */
// Every stop of the window: each year (or decade, or century) from its first to its last, however many thousands of
// years VM holds; never a year 0 (addYears steps from 1 BC to AD 1).
function stopsFor(from, to, step) {
  const size = step === 'c' ? 100 : step === '10y' ? 10 : 1;
  const out = [];
  for (let y = from; y <= to; y = addYears(y, size)) out.push(y);
  if (out.at(-1) !== to) out.push(to);
  return out;
}
function windowOf(R) {
  const held = M.held(S.index) || { from: 1400, to: 1600 };
  const a = yearOf(R.t?.from), b = yearOf(R.t?.to);
  return a != null && b != null && a <= b ? { from: a, to: b } : { from: held.from, to: held.to };
}
// The layers the recipe asks for that VM holds; any other is named, never drawn as if it were there.
function layerNotes(R) {
  const notes = [];
  // The catalogue's layers (stage S5a) are drawn through omni/lib/layer-view.js; an id it does not hold is named.
  const cat = S.lv?.catalogue();
  if (R.fill && R.fill !== 'borders' && !cat?.byFill.has(R.fill)) notes.push(`VM holds no "${R.fill}" fill, so this view draws borders.`);
  for (const l of R.l || []) if (l.id !== 'battles' && l.id !== 'borders' && !cat?.byId.has(l.id)) notes.push(`VM holds no "${l.id}" layer, so it is not drawn${battleFilter(R) ? '; this view draws the battles VM holds' : ''}.`);
  if (R.base && R.base !== 'plain' && !(R.base === 'countries' && cat?.byId.has('countries'))) notes.push(`VM holds the plain base and today's countries only (asked: ${R.base}).`);
  if (R.step === 'd' || R.step === 'm') notes.push('Borders change by the year here, so the slider steps by year.');
  return notes;
}
// The layers a view draws are the ones its recipe names (l=, design 3.2): a recipe without l=battles draws, exports and
// reports no battles; the battles VM holds for its years are still counted beside the map, said not to be drawn.
const battleFilter = R => (R?.l || []).find(l => l.id === 'battles') || null;
const battlesOn = () => !!battleFilter(S.R);
// The battles VM holds in the window (those matching the layer's filter, where the recipe gives one).
function battlesInWindow(win) {
  const f = battleFilter(S.R);
  return (S.battles?.rows || []).filter(r => r.sortYear >= win.from && r.sortYear <= win.to && (!f?.field || String(r[f.field] ?? '') === f.value));
}
// V4 (S5b/S5c review): the battles' file (about 140 KB gzipped since S5b) loads only when the view draws the battles,
// or when a bundle is made (its datasets carry the file's sha256), as every other layer's data does.
let battlesLoad = null;
async function ensureBattles(always = false) {
  if (S.battles || !(always || battlesOn())) return;
  battlesLoad ||= getFile(`${DATA}layers/battles.json`).then(b => { S.battles = b.json; S.bufs.set('battles', b.buf); }).finally(() => { battlesLoad = null; });
  await battlesLoad;
}
// The pins of a saved view's address that VM no longer holds (5.7: never drawn silently).
// The data versions a view draws: the release (cliopatria), VM's own files made from it (borders, the crosswalk qids),
// the base and the battles. A saved view pins all five (ds=), so a rebuild of VM's files from the same release is seen.
const nowPins = () => ({ cliopatria: S.index?.version, borders: stamp(S.index?.built), qids: stamp(S.qids?.built),
  'natural-earth': sourceOf('natural-earth')?.version, battles: stamp(S.battles?.built ?? layerOf('battles')?.built), // the catalogue's stamp is the file's (updateLayer)
  // the layers of stage S5a the frame draws (only those: a view of borders and battles pins what it pinned before)
  ...Object.fromEntries((S.lv?.pinList() || []).map(p => [p.id, p.version])) });
function pinNotes(R) {
  const now = nowPins();
  const notes = (R.ds || []).map(d => (now[d.id] == null ? `This view was saved with ${d.id}@${d.version}, which VM does not hold; it draws what VM holds.`
    : now[d.id] !== d.version ? `This view was saved with ${d.id}@${d.version}; VM no longer holds that version; you are seeing ${d.id}@${now[d.id]}. Open the view's bundle ("Open a saved view") to see it exactly.` : null)).filter(Boolean);
  if (R.pin && S.mode !== 'saved') notes.unshift(`This address is a saved view (pin ${R.pin}): it draws today's data, which may differ from what was saved. Open the view's bundle ("Open a saved view") to see exactly what was drawn.`);
  return notes;
}

/* ---------- the map ---------- */
const token = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colors = () => ({ water: token('--prp-map-water'), land: token('--prp-map-land'), border: token('--prp-map-border'), accent: token('--prp-ds') || token('--prp-accent'),
  battle: token('--prp-bad'), halo: token('--prp-map-halo'), label: token('--prp-map-label') });
const theme = () => (typeof window.prpTheme === 'function' ? window.prpTheme() : document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
function startMap() {
  const msg = $('#map-msg');
  // Without the map the lists stand under the message, as it says (one column).
  const none = () => document.documentElement.classList.add('om-nomap');
  if (!window.maplibregl || typeof window.maplibregl.Map !== 'function') { S.mapState = 'no-library'; msg.textContent = MSG.library; msg.hidden = false; $('#map').hidden = true; none(); return; }
  if (!webglOk()) { S.mapState = 'no-webgl'; msg.textContent = MSG.webgl; msg.hidden = false; $('#map').hidden = true; none(); return; }
  try {
    S.map = makeMap($('#map'), { colors: colors(), base: S.base, onMove: () => drawLabels(), onError: e => console.warn('Omni-Map:', e?.message || e) });
  } catch (e) {
    S.map = null; S.mapState = 'no-webgl'; msg.textContent = MSG.webgl; msg.hidden = false; $('#map').hidden = true; none();
    console.warn('Omni-Map: the map could not start:', e?.message || e);
  }
}
function drawLabels() {
  if (!S.map || S.mode === 'saved') return;
  const focus = new Set(S.focusHits || []);
  const [w, s, e, n] = S.map.bounds();
  const inView = ([x, y]) => y >= s && y <= n && (e - w >= 360 || [-360, 0, 360].some(k => x + k >= w && x + k <= e));
  const pt = f => { if (!S.labelCache.has(f.id)) S.labelCache.set(f.id, M.labelPoint(f)); return S.labelCache.get(f.id); };
  // A composite polity, "(…)", is outlined and left unlabelled: its core carries the name (S8).
  const polities = S.drawn.filter(f => f.properties.k === 'POLITY' && !/^\(.+\)$/.test(f.properties.n) && pt(f));
  const strong = polities.filter(f => focus.has(f.id));
  const rest = polities.filter(f => !focus.has(f.id) && inView(pt(f))).sort((a, b) => (b.properties.a || 0) - (a.properties.a || 0)).slice(0, 40);
  S.map.labels([...strong.map(f => ({ text: f.properties.n, at: pt(f), strong: true })), ...rest.map(f => ({ text: f.properties.n, at: pt(f) }))]);
}

/* ---------- a frame ---------- */
async function setFrame(year, { start = null, fit = false, source = 'set' } = {}) {
  const seq = ++S.seq;
  S.frame = year; S.start = start;
  if (S.mode === 'saved' && source !== 'saved') leaveSaved();
  const held = M.held(S.index);
  const file = M.fileFor(S.index, year);
  let fc = null;
  // While a borders file loads, the slider already stands on the new year and the map on the old: said, so neither the
  // thumb nor a screen reader passes the new year off as drawn (the year beside the slider moves only once it is).
  loadingNote(file && !S.loaded.has(file.file) ? `Loading the borders for ${yt(year)}…` : null);
  if (file) { try { fc = await bordersFor(file); } catch (e) { S.notes.push(`The borders file could not load: ${e.message}`); } }
  // Whatever moved the frame (Play, the slider, a typed year, an address), only the last few files used stay decoded.
  letGo(file ? [file.file] : []);
  if (seq !== S.seq) return;
  loadingNote(null);
  S.fc = fc;
  S.drawn = fc ? M.sliceAt(fc, year).filter(f => f.geometry) : [];
  // The period whose events are drawn (design 2.1 rule 4): the start the reader chose (since=), else its rest: on an
  // up-to view (show=upto) the window's first year, so the view shows everything up to the frame; on a frame view the
  // frame alone.
  const win = windowOf(S.R);
  const lo = start ?? (S.R.show === 'upto' ? win.from : year);
  S.lo = Math.min(lo, year);
  const inWin = battlesInWindow(win), on = battlesOn();
  S.drawnBattles = on ? inWin.filter(r => r.sortYear >= S.lo && r.sortYear <= year && Array.isArray(r.pt)) : [];
  // The extent (2.1 rule 5) at the opening frame, and again on "Fit to the view". A place VM cannot outline is placed
  // at its Master Index point (drawn as a point at every frame) or, for a battle, at the battle's point (drawn only in
  // the battle's own year, as the battles layer draws it). Outside the years VM holds, every place asked for is named
  // with that reason (the core gives "outside-slice" for a year beyond the span held).
  // A battle's own point counts only where the view draws the battles layer.
  const asBattle = q => (on ? battleRow(q) : null);
  const pointOf = q => lakePoint(q) || asBattle(q)?.pt || null;
  const fcNow = fc || { type: 'FeatureCollection', features: [], vm: null };
  const ext = M.extent({ focus: S.R.focus || [], year, fc: fcNow, qids: S.qids, held, pointOf });
  S.focusHits = fc ? ext.hits.flatMap(q => M.featuresFor(fc, S.qids, q, year, held).features.map(f => f.id)) : [];
  S.focusPoints = ext.misses.filter(m => m.point && lakePoint(m.qid) && !asBattle(m.qid)).map(m => ({ q: m.qid, pt: lakePoint(m.qid) }));
  S.ext = ext;
  // The box (MP-10, Jude, 17 November 2026: "when I clicked Classical Athens … it hovered over Italy"): a click on a
  // place in focus opens on that place alone, its outline or its recorded point; where VM holds neither for the
  // frame's year the map shows the whole world and says why (render), never the box of the other places named.
  const own = S.R.q && (S.R.focus || []).includes(S.R.q) ? M.extent({ focus: [S.R.q], year, fc: fcNow, qids: S.qids, held, pointOf }) : null;
  S.ownExt = own;
  const box = own ? own.box : ext.box, padding = own ? own.padding : ext.padding;
  if (fit || !S.boxSet) { S.box = box; S.boxSet = true; S.map?.fit(S.box, { padding, animate: source !== 'set' }); }
  // The layers switched on (stage S5a): each loads only now, and only the frame's file of a layer split by years.
  const lvErrors = S.lv ? await S.lv.frame(year, { lo: S.lo }) : [];
  if (seq !== S.seq) return;
  for (const e of lvErrors) S.notes.push(`A layer's data could not load: ${e}`);
  if (S.map) {
    S.map.setBorders(S.drawn, { focus: S.focusHits });
    S.map.setBattles(S.drawnBattles.map(r => ({ id: r.q, geometry: { type: 'Point', coordinates: r.pt } })));
    S.map.setPoints(S.focusPoints.map(p => ({ id: p.q, geometry: { type: 'Point', coordinates: p.pt } })));
    drawLabels();
  }
  render(inWin, ext, file, held);
  publish();
}

/* ---------- the page around the map ---------- */
const entryUrl = q => new URL(`encyclopedia/index.html#${q}`, SITE).href;
const nameOf = (q, year) => { const r = M.qidRows(S.qids, q, year); return r[0]?.name || null; };
const NEO = /^neo:([a-z0-9-]+)\/(\d+)\/([A-Za-z0-9_-]+)$/;
function fromLink(from) {
  const m = NEO.exec(from || '');
  if (!m) return from ? esc(from) : '';
  const at = new URL(`bibliotheca/neo/index.html#book=${m[1]}&ch=${m[2]}&p=${m[3]}${S.R.q ? `&t=${S.R.q}` : ''}`, SITE).href;
  const title = S.shelf?.find(b => b.slug === m[1])?.title || m[1].replace(/-/g, ' ');
  const pn = /^c\d+-p0*(\d+)$/.exec(m[3]);
  return `<a href="${esc(at)}" target="_top">Neo Book · <i>${esc(title)}</i> · chapter ${esc(m[2])} · ${pn ? `paragraph ${esc(pn[1])}` : esc(m[3])}</a>`;
}
// Why the view opens on its year (2.1 rule 2), as far as the recipe tells: the reader's card says which rule chose it.
function frameWhy(year, win) {
  const at = yearOf(S.R.at);
  if (S.mode === 'saved' || at == null || at !== year) return '';
  // A battle's own view opens on the year it was fought (decision D4 of 17 November 2026).
  const b = battlesOn() ? battleRow(S.R.q) : null;
  if (NEO.test(S.R.from || '') && b && b.sortYear === at) return `Opens on ${yt(at)}, the year it was fought, as VM's click chose it: a battle's view opens on its own year. The rules are under "Method" below.`;
  // A click's view: the one reason that applies, as far as this page can tell it from the clicked entry's own record and
  // the crosswalk (vm-click.js chose it by the same rules); the passage's year and the book's era are the reader's.
  if (NEO.test(S.R.from || '')) {
    const rec = S.R.q ? records.get(S.R.q) : null, name = S.subject || 'the clicked entry';
    const own = rec ? ownYears(rec, { today: new Date().toISOString().slice(0, 10) }) : null;
    const held = M.held(S.index);
    const firstOut = own?.from != null ? (S.qids?.entries?.[S.R.q] || []).filter(r => Number.isInteger(r.from) && Number.isInteger(r.to) && r.to >= own.from && (own.to == null || r.from <= own.to))
      .map(r => Math.max(r.from, own.from)).sort((x, y) => x - y)[0] : undefined;
    const why = firstOut === at ? `the first year of ${name}'s own that VM can outline`
      : own?.from === at ? `${name}'s own first recorded year`
      : own?.from != null && held && own.from < held.from && at === held.from ? `the first of ${name}'s own years that VM holds borders for (its first recorded year, ${yt(own.from)}, is before them)`
      : 'the passage\'s own year, or the start of the book\'s era, as the reader\'s card beside the map says';
    return `Opens on ${yt(at)}, as VM's click chose it: ${why}. The rules are under "Method" below.`;
  }
  // The page's own view, with no address: every year VM holds.
  if (S.bare) { const held = M.held(S.index); return held ? `Opens on ${yt(at)}; the slider holds every year VM holds, ${formatSpan(held.from, held.to)}.` : ''; }
  return at === win.from ? `Opens on ${yt(at)}, the first of these years.` : `Opens on ${yt(at)}, the year this view's address names.`;
}
// How a place in focus was matched to Cliopatria's rows at a year (S14): by Cliopatria's own Wikidata id, or by name.
function basisOf(q, year) {
  const r = M.qidRows(S.qids, q, year)[0];
  if (!r) return '';
  if (r.basis === 'cliopatria-wikidata') return 'by Cliopatria\'s own Wikidata id';
  // A rejection naming years holds only those years' rows (qids.json, design/prp-map.js).
  const holds = x => !x.years || [...x.years, ...(x.kept?.years || [])].some(([a, b]) => a <= year && year <= b);
  const no = (S.qids?.rejected || []).find(x => x.name === r.name && holds(x));
  return `matched by name${no ? `; Cliopatria's own Wikidata id for it, ${no.q}, was rejected (${no.why})` : ''}`;
}
// The years VM's crosswalk outlines a Q-id (qids.json's rows, merged where they touch): '1260–1571', or null.
function outlinedYears(q) {
  const rows = [...(S.qids?.entries?.[q] || [])].filter(r => Number.isInteger(r.from) && Number.isInteger(r.to)).sort((a, b) => a.from - b.from);
  const spans = [];
  for (const r of rows) { const last = spans.at(-1); if (last && r.from <= addYears(last[1], 1)) last[1] = Math.max(last[1], r.to); else spans.push([r.from, r.to]); }
  return spans.length ? spans.map(([a, b]) => formatSpan(a, b)).join(', ') : null;
}
// A clicked place VM can neither outline nor place at the frame's year, in a sentence: why, and that the map shows the
// whole world (a point would be drawn and the box set to it, so it is not said here).
function unplacedText(q, year, held, miss) {
  const name = S.subject || labelOf(q) || q;
  const why = miss?.reason === 'outside-slice' ? M.reasonText('outside-slice', { held })
    : miss?.reason === 'not-this-year' ? `Cliopatria has no outline for it in ${yt(year)}${outlinedYears(q) ? `; VM outlines it for ${outlinedYears(q)}` : ''}`
    : 'VM\'s crosswalk matches it to none of Cliopatria\'s rows';
  return `VM holds no outline of ${name} for ${yt(year)} (${why}), and the Master Index holds no point for it, so the map shows the whole world.`;
}
const ptText = (pt, prec) => {
  const d = prec > 0 ? Math.max(0, Math.min(6, Math.round(-Math.log10(prec)))) : 2;
  const c = `${Math.abs(pt[1]).toFixed(d)}° ${pt[1] >= 0 ? 'N' : 'S'}, ${Math.abs(pt[0]).toFixed(d)}° ${pt[0] >= 0 ? 'E' : 'W'}`;
  return prec > 0 ? `${c} (recorded to about ${Number(prec.toPrecision(2))}°, as Wikidata gives it)` : c;
};
const lower = s => String(s || '').replace(/^./, c => c.toLowerCase());
const srcLink = s => (s?.line ? (s.loc ? `<a href="https://www.wikidata.org/wiki/${esc(s.loc)}" target="_blank" rel="noreferrer">${esc(s.line)}</a>` : esc(s.line)) : '');
function render(inWin, ext, file, held) {
  const year = S.frame, win = windowOf(S.R);
  $('#frame-year').textContent = `· ${yt(year)}`;
  $('#time-year').textContent = yt(year);
  // The subject's own years as the Master Index records them ("Alexander the Great (356–323 BC)"), never the window, which
  // is its years with a margin and is named as the map's: "…: map of 360–319 BC".
  const today = new Date().toISOString().slice(0, 10);
  const subjYears = S.subject && S.R.q && records.get(S.R.q) ? yearsText(records.get(S.R.q), { today }) : null;
  $('#view-subject').textContent = S.mode === 'saved' ? S.saved.title
    : S.subject ? `${S.subject}${subjYears ? ` (${subjYears})` : ''}: map of ${formatSpan(win.from, win.to)}` : `The Omni-Map, ${formatSpan(win.from, win.to)}`;
  const why = frameWhy(year, win);
  $('#frame-why').textContent = why; $('#frame-why').hidden = !why;
  // Outside the borders VM holds: a gap, said, never empty land. "VM cannot place this" only when places were asked for.
  // A clicked place VM cannot place at this year: said in a sentence, with the years VM does outline it (MP-10).
  const note = $('#map-note');
  const asked = (S.R.focus || []).length > 0;
  const unplaced = S.ownExt && !S.ownExt.box ? unplacedText(S.R.q, year, held, S.ownExt.misses[0]) : '';
  const noteText = unplaced || (!file ? M.reasonText('outside-slice', { held }) : ext.box || !asked ? '' : ext.text);
  note.textContent = noteText; note.hidden = !noteText;

  // The legend: each layer's source, version, licence, precision and status, its credit, and its method under ⓘ: the
  // layers this view draws.
  const items = [], on = battlesOn();
  for (const id of ['borders', ...(on ? ['battles'] : [])]) {
    const entry = layerOf(id);
    if (!entry) continue;
    const lg = M.legend(entry, { sources: S.sources, year });
    // V5 (S5b/S5c review): a frame past the borders VM holds (a card's view of 2026) says that none are drawn.
    const hb = id === 'borders' ? M.held(S.index) : null;
    const none = hb && (year < hb.from || year > hb.to) ? [`No borders are drawn at ${formatYear(year)}: VM holds Cliopatria’s borders from ${formatYear(hb.from)} to ${formatYear(hb.to)}.`] : [];
    items.push(`<div class="om-lg" data-layer="${esc(id)}"><p class="om-lg-title"><span class="om-swatch ${esc(id)}" aria-hidden="true"></span>${esc(lg.title)}</p>`
      + `<ul class="om-lg-lines">${[...none, ...lg.lines].map(l => `<li>${esc(l)}</li>`).join('')}</ul><p class="om-lg-credit">${esc(lg.credit)}</p>`
      + `<details class="om-method"><summary><span aria-hidden="true">ⓘ</span> How this layer was made</summary><p>${esc(lg.method)}</p></details></div>`);
  }
  // The layers of stage S5a switched on: each its legend (measure, precision, status, source and licence) and method.
  if (S.lv && S.mode !== 'saved') items.push(S.lv.legend(year));
  // What the map's own marks mean (R7): the stronger fill of the places in focus, and the dashed outlines.
  items.push('<div class="om-lg" data-layer="key"><p class="om-lg-title">On the map</p><ul class="om-key">'
    + '<li><span class="om-swatch focus" aria-hidden="true"></span>In focus: the places of this view, filled more strongly</li>'
    + '<li><span class="om-swatch relation" aria-hidden="true"></span>A union, alliance or overlordship (a Cliopatria RELATION row), or a composite polity, written "(…)" (an entity with its dependencies): outlined, not filled</li>'
    + '<li><span class="om-swatch point" aria-hidden="true"></span>A place VM cannot outline, at its recorded point</li></ul></div>');
  const ne = sourceOf('natural-earth');
  // R2 (S5a review): with the countries base on, today's states are drawn from 1886, so the Base block says so.
  const baseNote = S.mode !== 'saved' && S.lv?.recipe().base === 'countries'
    ? (S.lv.drawnNow().includes('countries') ? ': land, with today’s countries (Natural Earth Admin 0) drawn over it, as they are from 1886' : ': land only at this year; today’s countries are drawn only from 1886')
    // V10 (S5b/S5c review): the Base line is the base's alone; a fill drawn on today's countries is said to be.
    : baseFillNote();
  items.push(`<div class="om-lg" data-layer="base"><p class="om-lg-title"><span class="om-swatch base" aria-hidden="true"></span>Base</p><ul class="om-lg-lines"><li>Source: ${esc(ne?.short || 'Natural Earth')} ${esc(ne?.version || '')}, ${esc(lower(ne?.licence || 'public domain'))}${esc(baseNote)}</li></ul><p class="om-lg-credit">Made with Natural Earth.</p></div>`);
  items.push(`<p class="om-lg-map">Map drawn with ${MAPLIBRE} (BSD 3-Clause).</p>`);
  $('#legend-body').innerHTML = items.join('');
  // The layer list, drawn again for the frame (what each holds at this year); a switch the reader is on keeps its focus.
  if (S.lv) {
    const was = document.activeElement?.id;
    S.lv.list($('#layers-body'), year);
    if (was && was.startsWith('ly-')) document.getElementById(was)?.focus({ preventScroll: true });
  }
  // The folded legend's one line (4.2's phone legend): the borders' source, version, licence and precision.
  const bl = layerOf('borders'), bsrc = sourceOf(bl?.source);
  const bp = bl ? M.borderPrecisionAt(bl, year) : null, bpRule = (bl?.borderPrecision || []).find(r => r.p === 'c');
  $('#legend-summary').textContent = bl ? `Borders: ${bsrc?.short || bl.source} ${bsrc?.version || ''}, ${bsrc?.licence || ''}, ${bp === 'c' ? `century precision before ${(bpRule?.to ?? 1499) + 1}` : 'at the years Cliopatria records'}${on ? '; battles: Wikidata' : ''}.` : '';

  // In focus: what the recipe asked to see, and what VM can and cannot outline at this frame.
  const f = [];
  // Its own dates as the Master Index records them: an end it does not record is said not to be (MP-10).
  const ownText = S.R.q && records.get(S.R.q) ? yearsText(records.get(S.R.q), { today }) : null;
  if (S.R.q) f.push(`<p>Clicked: <a href="${esc(entryUrl(S.R.q))}" target="_top"><bdi>${esc(S.subject || S.R.q)}</bdi></a> (${esc(S.R.q)})${S.R.from ? `, from ${fromLink(S.R.from)}` : ''}${ownText ? `; its own dates in the Master Index: ${esc(ownText)}` : ''}</p>`);
  const rows = [];
  for (const q of ext.hits) rows.push(`<li><b><bdi>${esc(nameOf(q, year) || q)}</bdi></b> <span class="om-q">${esc(q)}</span><span>Outlined at ${esc(formatYear(year))}, as Cliopatria names it, ${esc(basisOf(q, year))}</span></li>`);
  const drawnB = new Set(S.drawnBattles.map(r => r.q)), drawnP = new Set(S.focusPoints.map(p => p.q));
  for (const m of ext.misses) {
    const b = on ? battleRow(m.qid) : null;
    // A point is said to be shown only when it is on the map at this frame (S3): a battle's, in its own year.
    const text = !m.point ? m.text
      : drawnP.has(m.qid) || drawnB.has(m.qid) ? `${m.text}: shown as a point`
      : m.reason === 'outside-slice' ? m.text
      : b ? `${m.text}; it is drawn as a point at ${formatYear(b.sortYear)}, the year it was fought` : m.text;
    const name = labelOf(m.qid);
    rows.push(`<li><b><bdi>${esc(name || m.qid)}</bdi></b>${name ? ` <span class="om-q">${esc(m.qid)}</span>` : ''}<span>${esc(text)}</span></li>`);
  }
  for (const c of (S.R.focus || []).filter(x => !/^Q/.test(x))) rows.push(`<li><b>${esc(c)}</b><span>${ext.box ? 'In the box the view opens on' : 'VM cannot place this'}</span></li>`);
  f.push(rows.length ? `<ul class="om-list om-focus">${rows.join('')}</ul>` : '<p class="prp-empty">This view names no places; it opens on the borders VM holds.</p>');
  if (!ext.box && (S.R.focus || []).length) f.push(`<p class="om-held">${esc(M.reasonText('nothing-placeable'))}: the map shows the world.</p>`);
  const notes = [...layerNotes(S.R), ...S.notes];
  if (notes.length) f.push(`<ul class="om-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
  $('#focus-body').innerHTML = f.join('');

  // The battles VM holds for these years, each with its date as its source records it and its source line.
  $('#battles-held').textContent = on ? M.heldMessage('battle', inWin.length)
    : 'This view draws no battles, as its recipe names no battles layer (l=battles); the battles VM holds load when that layer is switched on.';
  const drawnIds = new Set(S.drawnBattles.map(r => r.q));
  // Stage S5b widened the battles to every located battle VM holds (about 2,000): a long window lists at most 300, those
  // drawn first, and says so; each battle of a war War Focus covers links to it.
  const LISTED = 300;
  const listed = inWin.length > LISTED ? [...inWin.filter(r => drawnIds.has(r.q)), ...inWin.filter(r => !drawnIds.has(r.q))].slice(0, LISTED) : inWin;
  if (on && inWin.length > LISTED) $('#battles-held').textContent += `; the first ${LISTED} are listed here, those drawn at this frame first`;
  $('#battles-list').innerHTML = !on ? '' : listed.map(r => {
    const on = drawnIds.has(r.q);
    const when = formatValueDate(r.date, { source: 'Wikidata' });
    const pt = Array.isArray(r.pt) ? ptText(r.pt, r.ptPrec) : 'no point';
    return `<li data-q="${esc(r.q)}"><p class="om-b-name"><a href="${esc(entryUrl(r.q))}" target="_top"><bdi>${esc(r.label)}</bdi></a>${r.partOfLabel ? ` <span class="om-q">part of ${esc(r.partOfLabel)}</span>` : ''}${/^wf-/.test(r.war || '') ? ` <a class="om-q" href="${esc(new URL(`battlefield/focus/index.html#war=${encodeURIComponent(r.war.slice(3))}`, SITE).href)}" target="_top">War Focus</a>` : ''}</p>`
      + `<p class="om-b-date">${esc(when)}</p><p class="om-src">${srcLink(r.src?.date)}</p>`
      + `<p class="om-b-pt">Point: ${esc(pt)}</p><p class="om-src">${srcLink(r.src?.pt)}</p>`
      // Drawn, with when it was fought: an up-to view draws at its frame the battles of every year before it.
      + `<p class="om-b-state">${on ? `Drawn at ${esc(formatYear(year))}${r.sortYear === year ? ', the year it was fought' : `; fought in ${esc(formatYear(r.sortYear))}`}` : `Not drawn at ${esc(formatYear(year))}; fought in ${esc(formatYear(r.sortYear))}`}`
      + `${!on && r.sortYear >= win.from && r.sortYear <= win.to ? ` <button type="button" class="prp-btn sm ghost" data-year="${r.sortYear}">Show ${esc(formatYear(r.sortYear))}</button>` : ''}</p></li>`;
  }).join('');

  // What the map shows: every outline drawn at the frame, by name, as the source writes it.
  const byName = [...S.drawn].sort((a, b) => a.properties.n.localeCompare(b.properties.n) || a.properties.f - b.properties.f);
  const k = byName.length;
  $('#shows-summary').textContent = file ? `${k} outline${k === 1 ? '' : 's'} at ${formatYear(year)}` : `No outlines at ${formatYear(year)}: ${M.reasonText('outside-slice', { held })}`;
  const tag = S.map ? 'button' : 'span';
  $('#shows-list').innerHTML = byName.map(x => {
    const p = x.properties, comp = p.k === 'POLITY' && /^\(.+\)$/.test(p.n);
    const rel = p.k === 'RELATION' ? ' · a union, alliance or overlordship, outlined' : comp ? ` · composite: ${esc(p.n.slice(1, -1))} with its dependencies, outlined` : '';
    return `<li><${tag}${tag === 'button' ? ` type="button" data-fit="${esc(p.id)}"` : ''} class="om-row"><bdi>${esc(p.n)}</bdi><span>${esc(formatSpan(p.f, p.t))}${rel}</span></${tag}></li>`;
  }).join('');

  // The live view and its label (5.7, 9).
  const live = liveUrl();
  $('#live-view').innerHTML = `<b>Live view:</b> <a href="${esc(live)}" target="_blank" rel="noopener">${esc(live)}</a>. This address draws today's data; only a saved bundle is exact.`;
  const pins = pinNotes(S.R);
  $('#pins-note').textContent = pins.join(' '); $('#pins-note').hidden = !pins.length;
  // Play says nothing each step (the year beside the slider moves); it says where it stopped.
  if (!PL.on) say(`${yt(year)}: ${k} outline${k === 1 ? '' : 's'}, ${S.drawnBattles.length} battle${S.drawnBattles.length === 1 ? '' : 's'} drawn`);
  $('#whole-span').hidden = S.mode === 'saved' || !held || (win.from <= held.from && win.to >= held.to);
  if (held) $('#whole-span').title = `Show ${formatSpan(held.from, held.to)} on the slider, keeping ${yt(year)}`;
}
// The plain base's words beside what a fill draws: a fill on Natural Earth's countries of today (a World Bank series,
// the Volatility score) or one placing states on them where Cliopatria holds no border.
function baseFillNote() {
  const f = S.mode !== 'saved' && S.lv ? S.lv.drawnNow().map(id => S.lv.catalogue().byId.get(id)).find(e => e && e.role === 'fill') : null;
  if (f?.on === 'countries') return ': land only; the fill above is drawn on today’s countries (Natural Earth Admin 0), not on the borders of the year';
  if (f?.on === 'states') return ': land only; the fill above draws a state on today’s countries (Natural Earth Admin 0) where Cliopatria holds no border for it';
  return ': land only, never today\'s states';
}
let sayTimer = 0;
function say(text) { clearTimeout(sayTimer); sayTimer = setTimeout(() => { $('#say').textContent = text; }, 200); }

/* ---------- the address and the reader ---------- */
// The view as it stands: the recipe at the frame shown, with the period's start where the reader moved it (since=).
const nowRecipe = extra => ({ ...S.R, at: S.frame, since: S.start ?? undefined, ...extra });
const currentRecipe = () => (S.mode === 'saved' ? S.saved.recipe : writeRecipe(nowRecipe()));
function liveUrl() {
  const r = nowRecipe(); delete r.ds; delete r.pin;
  return new URL(`omni/index.html#${writeRecipe(r)}`, SITE).href;
}
function publish() {
  const win = windowOf(S.R);
  const ids = S.mode === 'saved' ? S.saved.ids : [...S.drawn.map(f => f.id), ...S.drawnBattles.map(r => r.q), ...S.focusPoints.map(p => p.q)].sort();
  window.omniState = {
    ready: true, mode: S.mode, recipe: currentRecipe(), frame: S.frame, window: [win.from, win.to], step: S.R.step || 'y', show: S.R.show || 'frame',
    box: S.box, features: ids, layers: ['borders', ...(battleFilter(S.R) ? ['battles'] : []), ...(S.mode === 'saved' ? [] : S.lv?.drawnNow() || [])],
    lv: S.lv?.state() || null,
    legend: [...document.querySelectorAll('#legend .om-lg')].map(el => ({ layer: el.dataset.layer, text: el.textContent.replace(/\s+/g, ' ').trim() })),
    battles: { held: battlesInWindow(win).map(r => r.q), drawn: S.drawnBattles.map(r => r.q) },
    focus: S.ext?.hits || [], misses: (S.ext?.misses || []).map(m => ({ qid: m.qid, reason: m.reason, point: m.point, text: m.text })),
    points: S.focusPoints.map(p => p.q),
    held: M.held(S.index), map: S.mapState, webgl: webglOk(), theme: theme(), play: playState(), ...(S.mode === 'saved' ? { pin: S.saved.pin } : {}),
  };
  const mv = P.rules.movementParam(S.move);
  const hash = `#${currentRecipe()}${mv ? `&${P.MOVE_PARAM}=${mv}` : ''}${host ? `&host=${host}` : ''}`;
  if (hash !== location.hash) { try { history.replaceState(history.state, '', hash); } catch { /* rate-limited: the next move writes it */ } }
  if (host === 'neo' && embedded) {
    try { window.parent.postMessage({ type: 'vm:view', recipe: window.omniState.recipe, state: window.omniState }, location.origin); } catch { /* another origin: nothing to tell */ }
  }
}

/* ---------- the saved research version (5.7, 5.8, 5.9) ---------- */
let codeHashes = null;
async function code() {
  codeHashes ||= Promise.all(CODE.map(async path => {
    try { const r = await fetch(new URL(path, SITE)); return { path, sha256: r.ok ? await sha256(await r.arrayBuffer()) : null }; } catch { return { path, sha256: null }; }
  }));
  return codeHashes;
}
async function view() {
  if (S.mode === 'saved') throw new Error('This is a saved view: its bundle is the file you opened');
  await ensureBattles(true); // the bundle's datasets carry the battles' file and its sha256, drawn or not
  const year = S.frame, entry = layerOf('borders'), win = windowOf(S.R);
  const ne = sourceOf('natural-earth'), clio = sourceOf('cliopatria'), wd = sourceOf('wikidata');
  const pins = nowPins();
  const ds = ['cliopatria', 'borders', 'qids', 'natural-earth', 'battles'].map(id => ({ id, version: pins[id] || (id === 'natural-earth' ? '5.1.1' : '') }))
    .concat(S.lv?.pinList() || []); // each S5a layer drawn, at the version drawn (only when drawn)
  const recipe = writeRecipe(nowRecipe({ at: year, ds }));
  const p = M.borderPrecisionAt(entry, year);
  const rows = [
    ...S.drawn.map(f => M.borderRow(f, { qids: S.qids, year, precision: p })),
    ...S.drawnBattles.map(r => ({ Entity: r.label, Code: r.q, date: valueDateToEdtf(r.date), precision: precisionWord(r.date.p) || '', value: '', low: '', high: '', measure: '', status: '', by: '',
      origin: 'source', source_id: 'wikidata', source_loc: r.src?.date?.loc || `${r.q}#P585`, layer: 'battles', feature_id: r.q })),
    ...S.focusPoints.map(pt => ({ Entity: labelOf(pt.q) || pt.q, Code: pt.q, date: '', precision: '', value: '', low: '', high: '', measure: '', status: 'VM cannot outline this: its point', by: '',
      origin: 'source', source_id: 'wikidata', source_loc: `${pt.q}#P625`, layer: 'focus', feature_id: pt.q })),
    ...(S.lv?.rows() || []), // the S5a layers drawn: each value with its source and where in it
  ];
  // The source's own Wikidata id travels as cliopatria_q, never as a bare q, beside VM's crosswalk id (S7).
  const features = [...S.drawn.map(f => ({ type: 'Feature', id: f.id, properties: M.bundleProps(f, S.qids, year), geometry: f.geometry })),
    ...S.drawnBattles.map(r => ({ type: 'Feature', id: r.q, properties: { label: r.label, date: r.date, ptPrec: r.ptPrec ?? null, src: r.src }, geometry: { type: 'Point', coordinates: r.pt } })),
    ...S.focusPoints.map(pt => ({ type: 'Feature', id: pt.q, properties: { label: labelOf(pt.q) || pt.q, ptPrec: records.get(pt.q)?.ptp ?? null, src: { id: 'wikidata', loc: `${pt.q}#P625` } }, geometry: { type: 'Point', coordinates: pt.pt } })),
    ...(S.lv?.features() || [])];
  const file = M.fileFor(S.index, year);
  const hashOf = async key => (S.bufs.get(key) ? sha256(S.bufs.get(key)) : null);
  const clioLicence = { licence: clio?.licence, licenceUrl: clio?.licenceUrl, citation: clio?.citation, credit: clio?.credit, changes: clio?.changes };
  // The release (its archive's sha256, as omni/data/borders/index.json records it), and VM's files made from it, each
  // with the sha256 of the bytes this page read (S5): a reader can check either against what they hold.
  const data = [
    { id: 'cliopatria', version: S.index.version, sha256: S.index.archive?.sha256 || null, file: S.index.archive?.url, ...clioLicence },
    { id: 'borders', version: pins.borders, file: file ? `omni/data/borders/${file.file}` : null, sha256: file ? await hashOf(file.file) : null, source: `cliopatria@${S.index.version}`, sourceSha256: S.index.archive?.sha256 || null, ...clioLicence },
    { id: 'qids', version: pins.qids, file: 'omni/data/borders/qids.json', sha256: await hashOf('qids'), source: `${S.qids?.version || ''}; Wikidata read ${S.qids?.wikidata?.read || ''}`, licence: wd?.licence, licenceUrl: wd?.licenceUrl,
      citation: 'VM\'s crosswalk from Wikidata ids to Cliopatria\'s names by year (omni/data/borders/qids.json)' },
    { id: 'natural-earth', version: ne?.version, file: 'omni/data/base/ne_110m_land.geojson', sha256: await hashOf('base'), licence: ne?.licence, citation: ne?.citation, credit: ne?.credit },
    { id: 'battles', version: pins.battles, file: 'omni/data/layers/battles.json', sha256: await hashOf('battles'), licence: wd?.licence, licenceUrl: wd?.licenceUrl, citation: wd?.citation, credit: wd?.credit },
    ...(S.lv ? await S.lv.datasets() : []),
  ];
  const qids = [...new Set([S.R.q, ...(S.R.focus || []).filter(x => /^Q\d+$/.test(x)), ...S.drawnBattles.map(r => r.q)].filter(Boolean))];
  return {
    recipe, rows, features, made: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), vmCommit: null, deployment: location.origin, code: await code(), datasets: data, qids,
    from: S.R.from || null, subject: S.subject || 'Omni-Map view', window: [win.from, win.to], liveUrl: liveUrl(), providers: PROVIDERS, sources: S.sources,
    choices: { frame: year, period: [S.lo ?? year, year], fill: S.lv?.recipe().fill || 'borders', layers: (S.R.l || []).map(l => l.id), base: S.R.base || 'plain',
      drawn: { borders: S.drawn.length, battles: S.drawnBattles.length, points: S.focusPoints.length }, battlesHeld: battlesInWindow(win).length,
      borderPrecision: p === 'c' ? 'VM counts the borders of this frame as known only to their century (rows.csv: status); their date and precision columns give the years as Cliopatria records them' : 'the years as Cliopatria records them',
      deployment: 'the site\'s address, not a per-deployment address (VM does not yet keep each day\'s page)',
      events: 'every battle VM holds whose year falls in the period shown', clutter: S.lv?.state().anyway ? 'Show anyway: every point or line layer switched on is drawn'
        : 'one fill, one base and at most three point or line layers (a fourth replaces the oldest; the layer of the clicked object is never dropped)',
      layersDrawn: ['borders', ...(battlesOn() ? ['battles'] : []), ...(S.lv?.drawnNow() || [])],
      features: 'every row drawn at the frame, whole, not cut at the edge of the screen, so the same recipe gives the same features on any screen',
      renderer: `${MAPLIBRE} (${MAPLIBRE_SRI}), from cdn.jsdelivr.net`, notes: layerNotes(S.R) },
  };
}
function saveFile(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function act(btn, work) {
  const b = $(btn), was = b.textContent;
  b.disabled = true;
  try { await work(); } catch (e) { $('#saved-note').textContent = `That did not work: ${e.message}.`; } finally { b.disabled = false; b.textContent = was; }
}
async function saveBundle() {
  const v = await view();
  const { pin, files } = await bundleFiles(v, digest);
  saveFile(`vm-view-${pin}.zip`, zipStored(files), 'application/zip');
  $('#apa').textContent = apa({ ...v, pin });
  $('#saved-note').textContent = `Saved: vm-view-${pin}.zip, pin ${pin}. Deposit it in Zenodo or OSF under your own account for a DOI.`;
}
async function cite() {
  const v = await view();
  const { pin, files } = await bundleFiles(v, digest);
  saveFile(`vm-view-${pin}.csl.json`, new TextEncoder().encode(files.find(f => f.name === 'citation.csl.json').text), 'application/vnd.citationstyles.csl+json');
  $('#apa').textContent = apa({ ...v, pin });
}
async function download() {
  const v = await view();
  const files = dataFiles(v);
  saveFile(`${files[0].name.replace(/\.csv$/, '')}.zip`, zipStored(files), 'application/zip');
}
// "Open a saved view": a local file, read here and never uploaded; its CRCs and its pin checked; its frozen features drawn.
async function openSaved(file) {
  const note = $('#saved-note');
  try {
    const got = Object.fromEntries(readZip(new Uint8Array(await file.arrayBuffer())).map(f => [f.name, new TextDecoder('utf-8', { fatal: true }).decode(f.bytes)]));
    for (const n of ['recipe.txt', 'rows.csv', 'features.geojson', 'metadata.json']) if (!(n in got)) throw new Error(`it has no ${n}`);
    const meta = JSON.parse(got['metadata.json']);
    const p = await pinOf(got['recipe.txt'], got['rows.csv'], got['features.geojson'], digest);
    if (p !== meta.pin) throw new Error(`its pin (${meta.pin}) does not match its files (${p})`);
    const R = readRecipe(got['recipe.txt']);
    if (!R) throw new Error('its recipe is not VR/1');
    const fc = JSON.parse(got['features.geojson']);
    // The saved view whole (E5): its recipe, its years and its slider, its heading, and its address; never a mix of
    // the live view's window and the saved frame. The pin covers recipe.txt, rows.csv and features.geojson only, so what
    // the page states as the view comes from those: the heading is made again from the recipe (the clicked object's
    // name as VM holds it, and the recipe's years), never taken from the citation files, which the pin does not cover.
    S.mode = 'saved';
    S.saved = { pin: p, made: typeof meta.made === 'string' ? meta.made : null, ids: fc.features.map(f => f.id).sort(), recipe: got['recipe.txt'], title: '' };
    S.R = R;
    if (!S.R.show) S.R.show = 'frame';
    if (!S.R.step) S.R.step = 'y';
    S.boxSet = false;
    stopPlay(); playNote(''); S.goto = null;
    S.move = 'independent'; // a saved view carries no movement: its period is drawn as it was saved (MP-12)
    const { at, start } = mountPeriod();
    await loadSubject(R.q || null);
    await readRecords(unoutlined(R));
    const win = windowOf(R);
    S.saved.title = `${S.subject || 'Omni-Map view'}, ${formatSpan(win.from, win.to)}`;
    await setFrame(at, { start, fit: true, source: 'saved' });
    if (S.mode !== 'saved') return;
    if (S.map) {
      S.map.setBorders(fc.features.filter(f => f.geometry?.type !== 'Point').map(f => ({ ...f, properties: { ...f.properties, k: f.properties?.k || 'POLITY' } })), { focus: [] });
      S.map.setBattles(fc.features.filter(f => f.geometry?.type === 'Point'));
      S.map.setPoints([]);
      S.map.labels([]);
    }
    // What the pin does not cover is said to be the file's own word, unchecked (review X2).
    const made = S.saved.made ? `the time it gives (made ${esc(S.saved.made)}), ` : '';
    note.innerHTML = `Saved view, pin ${esc(p)}: its recipe, rows and features match the pin, and its frozen features are drawn (${S.saved.ids.length}); the lists beside it show today's data for its recipe. `
      + `Its other files are not covered by the pin, so ${made}its citations and its licence text are as the file gives them, unchecked; the heading is made from its recipe. Moving the slider goes back to the live view.`;
    publish();
  } catch (e) {
    note.textContent = `This file could not be opened as a saved view: ${e.message}.`;
  }
}
function leaveSaved() { S.mode = 'live'; S.saved = null; $('#saved-note').textContent = 'Back to the live view: today\'s data.'; }

/* ---------- the slider ---------- */
function mountPeriod() {
  const win = windowOf(S.R), step = S.R.step === 'c' || S.R.step === '10y' ? S.R.step : 'y';
  S.stops = stopsFor(win.from, win.to, step);
  // A year after the window's last opens on its last, one before its first (or none) on its first (applyRecipe says so).
  let at = yearOf(S.R.at);
  if (at != null && at > win.to) at = win.to;
  if (at == null || at < win.from) at = win.from;
  // The recipe's own year is a stop even when the step's stops pass it by (a decade step and at=1494), so the slider
  // always says the year the map shows, and the reader can come back to it (S4).
  if (!S.stops.includes(at)) S.stops = [...S.stops, at].sort((a, b) => a - b);
  // The period's start the recipe names (since=), a stop too, so the view is drawn again from where the reader left it.
  let since = yearOf(S.R.since);
  if (since == null || since < win.from || since > at) since = null;
  if (since != null && !S.stops.includes(since)) S.stops = [...S.stops, since].sort((a, b) => a - b);
  // A year the reader went to ("Go to year") is a stop too, where the step's stops pass it by.
  if (S.goto != null && S.goto >= win.from && S.goto <= win.to && !S.stops.includes(S.goto)) S.stops = [...S.stops, S.goto].sort((a, b) => a - b);
  const size = step === 'c' ? 100 : step === '10y' ? 10 : 1;
  // Years before AD 1 on the track: every year is written with its era ('508 BC', 'AD 33'); else as before ('1494').
  S.bc = win.from < 0;
  // The track's labels: its two ends and round years between, as many as its width holds (about one per 90 px), never
  // a year 0; minor ticks between them where they fit (R10).
  const ticks = trackTicks(win);
  // Where the start rests follows the recipe's show (2.1 rule 4): a new recipe that changes it mounts the slider again.
  // The control draws ‹ › and the track; Play is the page's own (below), so it can wait for each borders file and
  // step by more than one stop.
  const rest = S.R.show === 'upto' ? 'first' : 'end';
  if (!S.period || S.periodRest !== rest) {
    S.period?.stop();
    S.periodRest = rest;
    S.period = P.mount($('#timeline'), {
      stops: S.stops, from: since, to: at, rest, labels: y => yt(y), ticks,
      ids: { from: 'from', to: 'year', prev: 'prev', play: 'play-track', next: 'next' },
      names: { group: 'Year shown', from: 'First year of the period', to: 'Year shown', prev: 'Previous year', next: 'Next year' },
      play: false, steps: true,
      onChange: p => { stopPlay(); S.move = p.movement; setFrame(p.to, { start: p.atRest ? null : p.from, source: p.source }); },
    });
  } else {
    // The address's movement first: a slider still in Single Year would put the new period's start on its end, and the
    // start would be lost (second review X2, 20 November 2026).
    S.period.setMovement(S.move, { silent: true });
    S.period.update({ stops: S.stops, ticks, from: since, to: at });
  }
  // The movement the address chose (a slider mounted again starts at the default): Single Year puts the start on the
  // year shown.
  S.period.setMovement(S.move, { silent: true });
  fillSteps(win, size);
  // A start on its rest (the first stop of an up-to view, the frame of a frame view) is no start: since= is not written.
  const p = S.period.get();
  return { at: p.to ?? at, start: p.atRest ? null : p.from };
}
// The period the slider's movement gives with the year shown moved to y, for the page's own moves (Play): Move Together
// takes the start along, the span kept and the pair stopping at the track's ends; Single Year moves the one year (set()
// puts the start on it); Independent keeps the start, as before.
function periodAt(y) {
  const cur = S.period.get();
  if (cur.movement !== 'together') return { from: cur.atRest ? null : cur.from, to: y };
  const r = P.rules, nx = r.endTo({ i: cur.fromIndex, j: cur.toIndex, n: cur.stops.length, rest: S.periodRest, m: 'together' }, r.indexOf(cur.stops, y));
  return { from: cur.stops[nx.i], to: cur.stops[nx.j] };
}
function trackTicks(win) {
  // The track's own width: the drawn track's once it is there, else the control's less its ‹ › and movement buttons.
  const w = $('#timeline .prp-period-track')?.clientWidth || ($('#timeline')?.clientWidth || 800) - 170;
  return ticksFor(win.from, win.to, { maxLabels: Math.max(3, Math.min(10, Math.round(w / 90))), bc: S.bc });
}

/* ---------- Play (Jude, 15 November 2026: "a long playable slider … stepping through spans like 2,000 years") ---------- */
// The reader chooses the step (years a move) and the pace (time a move); each move waits for its borders file, and the
// files of the next few moves are asked for ahead, so a frame is never drawn before its borders. Play stops at the
// view's last year, at a move by the reader, and at a new recipe (Kino's, the reader's, the address).
const PL = { on: false, timer: 0, run: 0, step: null, pace: 1000 };
const PACES = [[250, 'a quarter of a second'], [500, 'half a second'], [1000, 'a second'], [2000, 'two seconds'], [4000, 'four seconds']];
const playState = () => ({ on: PL.on, step: PL.step, pace: PL.pace });
function fillSteps(win, size) {
  const sel = $('#play-step');
  const span = playSpan(win.from, win.to);
  const list = playSteps(span, size);
  const keep = list.includes(PL.step) ? PL.step : playStep(span, size);
  sel.replaceChildren(...list.map(k => { const o = document.createElement('option'); o.value = String(k); o.textContent = k === 1 ? '1 year' : `${k.toLocaleString('en-GB')} years`; return o; }));
  sel.value = String(keep); PL.step = keep;
}
function playButton() {
  // Its label says what a press does ("Play", "Pause"); it is not also a pressed toggle, which a screen reader would
  // announce as "Pause, pressed".
  const b = $('#play');
  b.textContent = PL.on ? 'Pause' : 'Play';
}
function playNote(text) { S.loading = null; $('#play-note').textContent = text || ''; }
// "Loading the borders for …" while a frame waits for its file; cleared when the frame is drawn, unless the note has
// since been given to something else (Play's stop, a typed year's answer).
function loadingNote(text) {
  const el = $('#play-note');
  if (text) { S.loading = text; el.textContent = text; return; }
  if (S.loading && el.textContent === S.loading) el.textContent = '';
  S.loading = null;
}
function stopPlay(text = null) {
  if (PL.on) { PL.on = false; PL.run++; clearTimeout(PL.timer); playButton(); if (window.omniState.ready) window.omniState = { ...window.omniState, play: playState() }; }
  if (text != null) playNote(text);
}
// The stops of the next n moves from `at`, and their borders files.
function aheadOf(at, n) {
  const out = [];
  let y = at;
  for (let k = 0; k < n; k++) { y = nextStop(S.stops, y, PL.step); if (y == null) break; out.push(y); if (y === S.stops.at(-1)) break; }
  return out;
}
const filesOf = years => [...new Set(years.map(y => M.fileFor(S.index, y)?.file).filter(Boolean))];
function askAhead(at) {
  const ahead = aheadOf(at, 3), keep = filesOf([at, ...ahead]);
  for (const y of ahead) { const f = M.fileFor(S.index, y); if (f) bordersFor(f).catch(() => {}); }
  letGo(keep);
}
function startPlay() {
  if (PL.on || S.stops.length < 2 || S.frame == null) return;
  PL.on = true; const run = ++PL.run;
  playButton(); playNote('');
  if (S.mode === 'saved') leaveSaved();
  window.omniState = { ...window.omniState, play: playState() };
  // From the last year it begins again at the first (in Move Together, with the start on the first, the span kept).
  const again = S.frame >= S.stops.at(-1), cur = S.period.get();
  const first = again ? S.stops[cur.movement === 'together' ? Math.min(S.stops.length - 1, cur.toIndex - cur.fromIndex) : 0] : S.frame;
  askAhead(first);
  if (again) move(run, first); else PL.timer = setTimeout(() => tick(run), PL.pace);
}
// One move: its file first, then the frame; the next move a pace after this one began.
async function move(run, y) {
  const t0 = performance.now();
  const to = periodAt(y); // by the slider's movement (MP-12): the year shown, and the start
  y = to.to;
  const f = M.fileFor(S.index, y);
  // A move that has to wait for its file says so, as a move by hand does (setFrame finds the file loaded and clears it).
  if (f && !S.loaded.has(f.file)) loadingNote(`Loading the borders for ${yt(y)}…`);
  if (f) { try { await bordersFor(f); } catch { /* setFrame says the file could not load */ } }
  if (run !== PL.run) return;
  const p = S.period.set(to.from, y, { silent: true });
  askAhead(y);
  await setFrame(y, { start: p.atRest ? null : p.from, source: 'play' });
  if (run !== PL.run) return;
  if (y >= S.stops.at(-1)) { stopPlay(`Stopped at ${yt(y)}, the last year of this view.`); publish(); return; }
  PL.timer = setTimeout(() => tick(run), Math.max(0, PL.pace - (performance.now() - t0)));
}
function tick(run) {
  if (run !== PL.run || !PL.on) return;
  const y = nextStop(S.stops, S.frame, PL.step);
  if (y == null) { stopPlay(`Stopped at ${yt(S.frame)}, the last year of this view.`); publish(); return; }
  move(run, y);
}

/* ---------- "Go to year" and every year VM holds ---------- */
// A year typed exactly ('500 BC', 'AD 33', '1494'), whatever the track's width: inside the view's years the map moves
// there; outside them, and inside the years VM holds, the slider shows every year VM holds; outside those, it is said.
async function goTo(text) {
  stopPlay();
  const r = readYear(text), held = M.held(S.index);
  if (r.error === 'zero') return playNote('There is no year 0: 1 BC is followed by AD 1.');
  if (r.error) return playNote('Write a year as 1494, 500 BC or AD 33.');
  const y = r.year, win = windowOf(S.R);
  if (held && (y < held.from || y > held.to)) return playNote(`${M.reasonText('outside-slice', { held })}, so the map stays on ${yt(S.frame)}.`);
  playNote('');
  if (S.mode === 'saved') leaveSaved();
  S.goto = y;
  if (held && (y < win.from || y > win.to)) S.R = { ...S.R, t: { from: held.from, to: held.to } };
  const { start } = mountPeriod();
  const p = S.period.set(S.period.get().atRest ? null : S.period.get().from, y, { silent: true });
  // In Single Year the slider has put its start on y: the map draws what the slider says.
  await setFrame(y, { start: p.movement === 'single' ? (p.atRest ? null : p.from) : start != null && start <= y ? start : null, source: 'goto' });
}
// "Every year VM holds": the same view, its slider over every year VM holds, at the year shown.
async function wholeSpan() {
  stopPlay();
  const held = M.held(S.index);
  if (!held || S.frame == null) return;
  if (S.mode === 'saved') leaveSaved();
  const at = S.frame;
  S.goto = at;
  S.R = { ...S.R, t: { from: held.from, to: held.to } };
  const { start } = mountPeriod();
  S.period.set(S.period.get().atRest ? null : S.period.get().from, at, { silent: true });
  await setFrame(at, { start, source: 'set' });
}

// What an address asked for that the view could not do as written, said, never changed in silence: a year 0 (there is
// none), years that could not be read, and a year outside the address's own years.
function addressNotes(raw, R, at) {
  const part = k => { const m = new RegExp(`(?:^|&)${k}=([^&]*)`).exec(raw); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return m[1]; } };
  const zero = v => /(?:^|\.\.)-?0+(?:-|\.\.|$)/.test(v);
  const notes = [], t = part('t'), a = part('at'), win = windowOf(S.R);
  if (t != null && !R.t) notes.push(zero(t) ? `This address's years (${t}) include a year 0, which does not exist (1 BC is followed by AD 1), so the slider shows every year VM holds, ${formatSpan(win.from, win.to)}.`
    : `This address's years (${t}) could not be read, so the slider shows every year VM holds, ${formatSpan(win.from, win.to)}.`);
  if (a != null && R.at == null) notes.push(zero(a) ? `This address names year 0, which does not exist (1 BC is followed by AD 1); it opens on ${yt(at)}.` : `This address's year (${a}) could not be read; it opens on ${yt(at)}.`);
  const y = yearOf(R.at);
  if (y != null && y !== at && (y < win.from || y > win.to)) notes.push(`This address's year, ${yt(y)}, is outside its own years (${formatSpan(win.from, win.to)}), so it opens on ${yt(at)}, the ${y > win.to ? 'last' : 'first'} of them.`);
  return notes;
}

/* ---------- start ---------- */
async function applyRecipe({ first = false } = {}) {
  const raw = location.hash.replace(/^#/, '');
  const R = readRecipe(raw);
  S.notes = [];
  // A new recipe (the address, Kino's next move, the reader's next click) stops Play and is drawn as it says.
  stopPlay(); playNote(''); S.goto = null;
  if (raw && !R) S.notes.push('This address is not a view VM can read (VR/1); it shows the borders VM holds instead.');
  S.bare = !raw;
  S.R = R || readRecipe(defaultRecipe());
  if (!S.R.show) S.R.show = 'frame';
  if (!S.R.step) S.R.step = 'y';
  S.boxSet = false;
  if (S.mode === 'saved') leaveSaved();
  S.move = moveOf(raw); // the address's movement (MP-12; none, as in every recipe Kino writes: Independent)
  const { at, start } = mountPeriod();
  if (R) S.notes.push(...addressNotes(raw, R, at));
  // The recipe's layers under the clutter rule (stage S5a); the clicked battle's layer is the subject's, never dropped.
  await ensureBattles().catch(e => S.notes.push(`The battles could not load: ${e.message}`));
  if (S.lv) S.notes.push(...S.lv.read(S.R, { subject: battleRow(S.R.q) ? 'battles' : null }).notes);
  // The subject's name follows the recipe (R2: the reader moves this frame by its hash, one click after another), and
  // the records of the places VM cannot outline give their names and points.
  await Promise.all([loadSubject(S.R.q || null), readRecords(unoutlined(S.R)), loadShelf(S.R)]);
  await setFrame(at, { start, fit: true, source: first ? 'set' : 'hash' });
}
async function init() {
  wire();
  try {
    // The battles' file is not among these: it loads only when the view draws the battles (ensureBattles, V4).
    const [layers, index, qids, base, sources] = await Promise.all([
      getFile(`${DATA}layers.json`), getFile(`${DATA}borders/index.json`), getFile(`${DATA}borders/qids.json`), getFile(`${DATA}base/ne_110m_land.geojson`),
      getFile(new URL('integration/sources.json', SITE).href)]);
    S.layers = layers.json; S.index = index.json; S.qids = qids.json; S.base = base.json; S.sources = sources.json.sources;
    S.bufs.set('base', base.buf); S.bufs.set('qids', qids.buf);
    const bad = S.layers.layers.map(l => M.readLayer(l)).filter(r => !r.ok);
    for (const b of bad) S.notes.push(`The layer "${b.entry?.id}" is not well formed: ${b.errors.join('; ')}`);
    for (const a of S.layers.absent || []) { const r = M.readAbsent(a); if (!r.ok) S.notes.push(`The line for "${a?.id}" is not well formed: ${r.errors.join('; ')}`); }
    // The layer list (stage S5a): a switch moved writes the recipe's layer keys and draws the frame again.
    // borders: the frame's Cliopatria borders and VM's crosswalk, on which a layer of stage S5b draws each state of its year.
    S.lv = layerView({ data: DATA, getFile, map: () => S.map, sources: () => S.sources, borders: () => ({ fc: S.fc, qids: S.qids, held: M.held(S.index) }), onChange: ({ focus } = {}) => {
      S.R = { ...S.R, ...S.lv.recipe() };
      if (S.frame != null) ensureBattles().then(() => setFrame(S.frame, { start: S.start, source: 'layer' })).then(() => { if (focus) document.getElementById(focus)?.focus({ preventScroll: true }); });
    } });
    S.lv.init(S.layers);
    S.lv.wire($('#layers-body'));
  } catch (e) {
    $('#meta').innerHTML = `<span>The Omni-Map's data could not load: ${esc(e.message)}</span>`;
    window.omniState = { ready: true, error: e.message };
    return;
  }
  const built = new Date(S.layers.generated);
  const held = M.held(S.index);
  $('#meta').innerHTML = [`<span>Borders <b>${esc(formatSpan(held.from, held.to))}</b> (Cliopatria ${esc(S.index.version)})</span>`,
    ...(layerOf('battles') ? [`<span>Battles <b>${esc(formatSpan(layerOf('battles').time.from, layerOf('battles').time.to))}</b> (Wikidata)</span>`] : []),
    `<span>Built <b>${esc(built.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b></span>`].join('');
  const borders = layerOf('borders');
  if (borders) $('#method-text').textContent = borders.method;
  startMap();
  await applyRecipe({ first: true });
}
function wire() {
  $('#zoom-in').addEventListener('click', () => S.map?.zoomBy(1));
  $('#zoom-out').addEventListener('click', () => S.map?.zoomBy(-1));
  $('#fit').addEventListener('click', () => { if (S.frame != null) setFrame(S.frame, { start: S.start, fit: true, source: 'fit' }); });
  $('#legend-fold').addEventListener('click', e => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open)); e.currentTarget.textContent = open ? 'Hide' : 'Show';
    $('#legend-body').hidden = !open;
    $('#legend-summary').hidden = open; // folded, the legend is its one line
  });
  // On a phone the legend is one line, opened on tap (design 4.2).
  if (matchMedia('(max-width: 599px)').matches || host) { $('#legend-fold').click(); }
  $('#battles-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-year]');
    if (!b) return;
    const y = +b.dataset.year;
    stopPlay();
    const p = S.period.set(null, y, { silent: true });
    setFrame(y, { start: p.atRest ? null : p.from, source: 'step' }); // the start as the slider has it (Single Year on an up-to view: y)
    $('#year').focus({ preventScroll: true });
  });
  $('#shows-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-fit]');
    const f = b && S.drawn.find(x => x.id === b.dataset.fit);
    if (f && S.map) S.map.fit(f.properties.b, { padding: 30 });
  });
  // Play, its step and pace, "Go to year" and every year VM holds.
  const pace = $('#play-pace');
  pace.replaceChildren(...PACES.map(([ms, words]) => { const o = document.createElement('option'); o.value = String(ms); o.textContent = words; return o; }));
  pace.value = String(PL.pace);
  pace.addEventListener('change', () => { PL.pace = +pace.value || 1000; if (window.omniState.ready) window.omniState = { ...window.omniState, play: playState() }; });
  $('#play-step').addEventListener('change', e => { PL.step = +e.target.value || PL.step; if (window.omniState.ready) window.omniState = { ...window.omniState, play: playState() }; });
  $('#play').addEventListener('click', () => (PL.on ? stopPlay(`Paused at ${yt(S.frame)}.`) : startPlay()));
  $('#goto').addEventListener('submit', e => { e.preventDefault(); goTo($('#goto-year').value); });
  $('#whole-span').addEventListener('click', () => wholeSpan());
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.period && S.R) S.period.update({ ticks: trackTicks(windowOf(S.R)) }); }, 200); });
  $('#save').addEventListener('click', () => act('#save', saveBundle));
  $('#cite').addEventListener('click', () => act('#cite', cite));
  $('#download').addEventListener('click', () => act('#download', download));
  $('#open-file').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) openSaved(f); e.target.value = ''; });
  window.addEventListener('hashchange', () => {
    const R = readRecipe(location.hash.replace(/^#/, ''));
    if (R && writeRecipe(R) === currentRecipe()) {
      // our own write, read back; or the same view with another movement (move=, MP-12), which the slider takes up
      const m = moveOf(location.hash);
      if (m === S.move || !S.period) return;
      stopPlay(); S.move = m;
      const p = S.period.setMovement(m, { silent: true });
      setFrame(p.to, { start: p.atRest ? null : p.from, source: 'hash' });
      return;
    }
    applyRecipe();
  });
  window.addEventListener('prp:themechange', () => { S.map?.setColors(colors()); if (window.omniState.ready) publish(); });
  window.addEventListener('resize', () => S.map?.resize());
  // Stage S5c: prp:focus fits the map to countries by ISO3, or a Q-id's border of the frame's year (else its lake
  // point); { reset: true } fits the view's own box again (omni/lib/focus.js).
  S.focus = listenFocus({ getFile, data: DATA, map: () => S.map, home: () => S.box,
    qid: q => { const fs = S.fc && S.index ? M.featuresFor(S.fc, S.qids, q, S.frame, M.held(S.index)).features : []; return fs.length ? { type: 'FeatureCollection', features: fs } : lakePoint(q); } });
  window.omniFocus = () => S.focus.state();
}
init();
