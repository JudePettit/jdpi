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

const M = window.PRPMap, P = window.PRPPeriod;
const $ = s => document.querySelector(s);
const esc = M.esc;
const DATA = new URL('data/', import.meta.url).href;
const SITE = new URL('../', import.meta.url).href;
const DEFAULT = 'vr=1&t=1400..1600&at=1400&show=frame&step=y&base=plain&fill=borders&l=battles';
const MAPLIBRE = 'MapLibre GL JS 5.24.0';
const MAPLIBRE_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
const MSG = {
  library: 'The map library (MapLibre GL JS 5.24.0, from cdn.jsdelivr.net) could not load, so the map cannot be drawn. What the map would show is listed below.',
  webgl: 'This map needs WebGL, which this browser does not have or has turned off. What the map would show is listed below.',
};
// The VM scripts this page runs, whose sha256 a bundle records (vmCommit is null: a static site cannot know its commit).
const CODE = ['design/prp-bar.js', 'design/prp-focus.js', 'design/prp-period.js', 'design/prp-map.js', 'design/vm-recipe.js', 'design/vm-dates.js',
  'design/vm-bundle.js', 'lake/scripts/dates.mjs', 'omni/app.js', 'omni/lib/maplibre.js'];
const PROVIDERS = ['Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager', 'Natural Earth 5.1.1 (public domain)', 'Wikidata (CC0)'];
const host = readHost(location.hash);
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (host) document.documentElement.classList.add(`om-host-${host}`);

const S = {
  R: null, layers: null, index: null, qids: null, base: null, battles: null, sources: null, subject: null, subjectQ: null,
  files: new Map(), bufs: new Map(), frame: null, start: null, stops: [], period: null, map: null, mapState: 'drawn',
  drawn: [], drawnBattles: [], focusPoints: [], box: null, seq: 0, notes: [], mode: 'live', saved: null, labelCache: new Map(),
  shards: new Map(), shelf: null,
};
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
async function bordersFor(file) {
  if (!S.files.has(file.file)) S.files.set(file.file, getFile(`${DATA}borders/${file.file}`).then(({ json, buf }) => { S.bufs.set(file.file, buf); return M.decode(json); }));
  return S.files.get(file.file);
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
function stopsFor(from, to, step) {
  const size = step === 'c' ? 100 : step === '10y' ? 10 : 1;
  const out = [];
  for (let y = from; y <= to && out.length < 5000; y = addYears(y, size)) out.push(y);
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
  if (R.fill && R.fill !== 'borders') notes.push(`VM builds the borders fill first; it holds no "${R.fill}" fill yet, so this view draws borders.`);
  for (const l of R.l || []) if (l.id !== 'battles') notes.push(`VM holds no "${l.id}" layer yet, so it is not drawn${battleFilter(R) ? '; this view draws the battles VM holds' : ''}.`);
  if (R.base && R.base !== 'plain') notes.push(`VM holds the plain base only in this first version (asked: ${R.base}).`);
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
// The pins of a saved view's address that VM no longer holds (5.7: never drawn silently).
// The data versions a view draws: the release (cliopatria), VM's own files made from it (borders, the crosswalk qids),
// the base and the battles. A saved view pins all five (ds=), so a rebuild of VM's files from the same release is seen.
const nowPins = () => ({ cliopatria: S.index?.version, borders: stamp(S.index?.built), qids: stamp(S.qids?.built),
  'natural-earth': sourceOf('natural-earth')?.version, battles: stamp(S.battles?.built) });
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
  if (file) { try { fc = await bordersFor(file); } catch (e) { S.notes.push(`The borders file could not load: ${e.message}`); } }
  if (seq !== S.seq) return;
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
  const ext = M.extent({ focus: S.R.focus || [], year, fc: fc || { type: 'FeatureCollection', features: [], vm: null }, qids: S.qids, held, pointOf });
  S.focusHits = fc ? ext.hits.flatMap(q => M.featuresFor(fc, S.qids, q, year, held).features.map(f => f.id)) : [];
  S.focusPoints = ext.misses.filter(m => m.point && lakePoint(m.qid) && !asBattle(m.qid)).map(m => ({ q: m.qid, pt: lakePoint(m.qid) }));
  S.ext = ext;
  if (fit || !S.boxSet) { S.box = ext.box; S.boxSet = true; S.map?.fit(S.box, { padding: ext.padding, animate: source !== 'set' }); }
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
  if (NEO.test(S.R.from || '')) return `Opens on ${formatYear(at)}, as VM's click chose it: the passage's own year where VM has dated the passage, until then the start of the book's era. The rules are under "Method" below.`;
  return at === win.from ? `Opens on ${formatYear(at)}, the first of these years.` : `Opens on ${formatYear(at)}, the year this view's recipe names.`;
}
// How a place in focus was matched to Cliopatria's rows at a year (S14): by Cliopatria's own Wikidata id, or by name.
function basisOf(q, year) {
  const r = M.qidRows(S.qids, q, year)[0];
  if (!r) return '';
  if (r.basis === 'cliopatria-wikidata') return 'by Cliopatria\'s own Wikidata id';
  const no = (S.qids?.rejected || []).find(x => x.name === r.name);
  return `matched by name${no ? `; Cliopatria's own Wikidata id for it, ${no.q}, was rejected (${no.why})` : ''}`;
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
  $('#frame-year').textContent = `· ${formatYear(year)}`;
  $('#time-year').textContent = formatYear(year);
  $('#view-subject').textContent = S.mode === 'saved' ? S.saved.title : `${S.subject || 'The Omni-Map'}, ${formatSpan(win.from, win.to)}`;
  const why = frameWhy(year, win);
  $('#frame-why').textContent = why; $('#frame-why').hidden = !why;
  // Outside the borders VM holds: a gap, said, never empty land. "VM cannot place this" only when places were asked for.
  const note = $('#map-note');
  const asked = (S.R.focus || []).length > 0;
  const noteText = !file ? M.reasonText('outside-slice', { held }) : ext.box || !asked ? '' : ext.text;
  note.textContent = noteText; note.hidden = !noteText;

  // The legend: each layer's source, version, licence, precision and status, its credit, and its method under ⓘ: the
  // layers this view draws.
  const items = [], on = battlesOn();
  for (const id of ['borders', ...(on ? ['battles'] : [])]) {
    const entry = layerOf(id);
    if (!entry) continue;
    const lg = M.legend(entry, { sources: S.sources, year });
    items.push(`<div class="om-lg" data-layer="${esc(id)}"><p class="om-lg-title"><span class="om-swatch ${esc(id)}" aria-hidden="true"></span>${esc(lg.title)}</p>`
      + `<ul class="om-lg-lines">${lg.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p class="om-lg-credit">${esc(lg.credit)}</p>`
      + `<details class="om-method"><summary><span aria-hidden="true">ⓘ</span> How this layer was made</summary><p>${esc(lg.method)}</p></details></div>`);
  }
  // What the map's own marks mean (R7): the stronger fill of the places in focus, and the dashed outlines.
  items.push('<div class="om-lg" data-layer="key"><p class="om-lg-title">On the map</p><ul class="om-key">'
    + '<li><span class="om-swatch focus" aria-hidden="true"></span>In focus: the places of this view, filled more strongly</li>'
    + '<li><span class="om-swatch relation" aria-hidden="true"></span>A union, alliance or overlordship (a Cliopatria RELATION row), or a composite polity, written "(…)" (an entity with its dependencies): outlined, not filled</li>'
    + '<li><span class="om-swatch point" aria-hidden="true"></span>A place VM cannot outline, at its recorded point</li></ul></div>');
  const ne = sourceOf('natural-earth');
  items.push(`<div class="om-lg" data-layer="base"><p class="om-lg-title"><span class="om-swatch base" aria-hidden="true"></span>Base</p><ul class="om-lg-lines"><li>Source: ${esc(ne?.short || 'Natural Earth')} ${esc(ne?.version || '')}, ${esc(lower(ne?.licence || 'public domain'))}: land only, never today's states</li></ul><p class="om-lg-credit">Made with Natural Earth.</p></div>`);
  items.push(`<p class="om-lg-map">Map drawn with ${MAPLIBRE} (BSD 3-Clause).</p>`);
  $('#legend-body').innerHTML = items.join('');
  // The folded legend's one line (4.2's phone legend): the borders' source, version, licence and precision.
  const bl = layerOf('borders'), bsrc = sourceOf(bl?.source);
  const bp = bl ? M.borderPrecisionAt(bl, year) : null, bpRule = (bl?.borderPrecision || []).find(r => r.p === 'c');
  $('#legend-summary').textContent = bl ? `Borders: ${bsrc?.short || bl.source} ${bsrc?.version || ''}, ${bsrc?.licence || ''}, ${bp === 'c' ? `century precision before ${(bpRule?.to ?? 1499) + 1}` : 'at the years Cliopatria records'}${on ? '; battles: Wikidata' : ''}.` : '';

  // In focus: what the recipe asked to see, and what VM can and cannot outline at this frame.
  const f = [];
  if (S.R.q) f.push(`<p>Clicked: <a href="${esc(entryUrl(S.R.q))}" target="_top"><bdi>${esc(S.subject || S.R.q)}</bdi></a> (${esc(S.R.q)})${S.R.from ? `, from ${fromLink(S.R.from)}` : ''}</p>`);
  const rows = [];
  for (const q of ext.hits) rows.push(`<li><b><bdi>${esc(nameOf(q, year) || q)}</bdi></b> <span class="om-q">${esc(q)}</span><span>Outlined at ${esc(formatYear(year))}, as Cliopatria names it, ${esc(basisOf(q, year))}</span></li>`);
  const drawnB = new Set(S.drawnBattles.map(r => r.q)), drawnP = new Set(S.focusPoints.map(p => p.q));
  for (const m of ext.misses) {
    const b = on ? battleRow(m.qid) : null;
    // A point is said to be shown only when it is on the map at this frame (S3): a battle's, in its own year.
    const text = !m.point || m.reason === 'outside-slice' ? m.text
      : drawnP.has(m.qid) || drawnB.has(m.qid) ? `${m.text}: shown as a point`
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
    : `${M.heldMessage('battle', inWin.length)}; this view draws none, as its recipe names no battles layer (l=battles).`;
  const drawnIds = new Set(S.drawnBattles.map(r => r.q));
  $('#battles-list').innerHTML = !on ? '' : inWin.map(r => {
    const on = drawnIds.has(r.q);
    const when = formatValueDate(r.date, { source: 'Wikidata' });
    const pt = Array.isArray(r.pt) ? ptText(r.pt, r.ptPrec) : 'no point';
    return `<li data-q="${esc(r.q)}"><p class="om-b-name"><a href="${esc(entryUrl(r.q))}" target="_top"><bdi>${esc(r.label)}</bdi></a>${r.partOfLabel ? ` <span class="om-q">part of ${esc(r.partOfLabel)}</span>` : ''}</p>`
      + `<p class="om-b-date">${esc(when)}</p><p class="om-src">${srcLink(r.src?.date)}</p>`
      + `<p class="om-b-pt">Point: ${esc(pt)}</p><p class="om-src">${srcLink(r.src?.pt)}</p>`
      + `<p class="om-b-state">${on ? `Drawn at ${esc(formatYear(year))}` : `Not drawn at ${esc(formatYear(year))}; fought in ${esc(formatYear(r.sortYear))}`}`
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
  say(`${formatYear(year)}: ${k} outline${k === 1 ? '' : 's'}, ${S.drawnBattles.length} battle${S.drawnBattles.length === 1 ? '' : 's'} drawn`);
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
    box: S.box, features: ids, layers: ['borders', ...(battleFilter(S.R) ? ['battles'] : [])],
    legend: [...document.querySelectorAll('#legend .om-lg')].map(el => ({ layer: el.dataset.layer, text: el.textContent.replace(/\s+/g, ' ').trim() })),
    battles: { held: battlesInWindow(win).map(r => r.q), drawn: S.drawnBattles.map(r => r.q) },
    focus: S.ext?.hits || [], misses: (S.ext?.misses || []).map(m => ({ qid: m.qid, reason: m.reason, point: m.point, text: m.text })),
    points: S.focusPoints.map(p => p.q),
    held: M.held(S.index), map: S.mapState, webgl: webglOk(), theme: theme(), ...(S.mode === 'saved' ? { pin: S.saved.pin } : {}),
  };
  const hash = `#${currentRecipe()}${host ? `&host=${host}` : ''}`;
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
  const year = S.frame, entry = layerOf('borders'), win = windowOf(S.R);
  const ne = sourceOf('natural-earth'), clio = sourceOf('cliopatria'), wd = sourceOf('wikidata');
  const pins = nowPins();
  const ds = ['cliopatria', 'borders', 'qids', 'natural-earth', 'battles'].map(id => ({ id, version: pins[id] || (id === 'natural-earth' ? '5.1.1' : '') }));
  const recipe = writeRecipe(nowRecipe({ at: year, ds }));
  const p = M.borderPrecisionAt(entry, year);
  const rows = [
    ...S.drawn.map(f => M.borderRow(f, { qids: S.qids, year, precision: p })),
    ...S.drawnBattles.map(r => ({ Entity: r.label, Code: r.q, date: valueDateToEdtf(r.date), precision: precisionWord(r.date.p) || '', value: '', low: '', high: '', measure: '', status: '', by: '',
      origin: 'source', source_id: 'wikidata', source_loc: r.src?.date?.loc || `${r.q}#P585`, layer: 'battles', feature_id: r.q })),
    ...S.focusPoints.map(pt => ({ Entity: labelOf(pt.q) || pt.q, Code: pt.q, date: '', precision: '', value: '', low: '', high: '', measure: '', status: 'VM cannot outline this: its point', by: '',
      origin: 'source', source_id: 'wikidata', source_loc: `${pt.q}#P625`, layer: 'focus', feature_id: pt.q })),
  ];
  // The source's own Wikidata id travels as cliopatria_q, never as a bare q, beside VM's crosswalk id (S7).
  const features = [...S.drawn.map(f => ({ type: 'Feature', id: f.id, properties: M.bundleProps(f, S.qids, year), geometry: f.geometry })),
    ...S.drawnBattles.map(r => ({ type: 'Feature', id: r.q, properties: { label: r.label, date: r.date, ptPrec: r.ptPrec ?? null, src: r.src }, geometry: { type: 'Point', coordinates: r.pt } })),
    ...S.focusPoints.map(pt => ({ type: 'Feature', id: pt.q, properties: { label: labelOf(pt.q) || pt.q, ptPrec: records.get(pt.q)?.ptp ?? null, src: { id: 'wikidata', loc: `${pt.q}#P625` } }, geometry: { type: 'Point', coordinates: pt.pt } }))];
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
  ];
  const qids = [...new Set([S.R.q, ...(S.R.focus || []).filter(x => /^Q\d+$/.test(x)), ...S.drawnBattles.map(r => r.q)].filter(Boolean))];
  return {
    recipe, rows, features, made: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), vmCommit: null, deployment: location.origin, code: await code(), datasets: data, qids,
    from: S.R.from || null, subject: S.subject || 'Omni-Map view', window: [win.from, win.to], liveUrl: liveUrl(), providers: PROVIDERS, sources: S.sources,
    choices: { frame: year, period: [S.lo ?? year, year], fill: 'borders', layers: (S.R.l || []).map(l => l.id), base: S.R.base || 'plain',
      drawn: { borders: S.drawn.length, battles: S.drawnBattles.length, points: S.focusPoints.length }, battlesHeld: battlesInWindow(win).length,
      borderPrecision: p === 'c' ? 'VM counts the borders of this frame as known only to their century (rows.csv: status); their date and precision columns give the years as Cliopatria records them' : 'the years as Cliopatria records them',
      deployment: 'the site\'s address, not a per-deployment address (VM does not yet keep each day\'s page)',
      events: 'every battle VM holds whose year falls in the period shown', clutter: 'one fill, one point layer, one base: nothing left out',
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
  let at = yearOf(S.R.at);
  if (at == null || at < win.from || at > win.to) at = win.from;
  // The recipe's own year is a stop even when the step's stops pass it by (a decade step and at=1494), so the slider
  // always says the year the map shows, and the reader can come back to it (S4).
  if (!S.stops.includes(at)) S.stops = [...S.stops, at].sort((a, b) => a - b);
  // The period's start the recipe names (since=), a stop too, so the view is drawn again from where the reader left it.
  let since = yearOf(S.R.since);
  if (since == null || since < win.from || since > at) since = null;
  if (since != null && !S.stops.includes(since)) S.stops = [...S.stops, since].sort((a, b) => a - b);
  const size = step === 'c' ? 100 : step === '10y' ? 10 : 1;
  // Minor tick labels only where they fit (R10): a long track of yearly stops shows its key years alone.
  const minorText = S.stops.length <= 120;
  const ticks = S.stops.filter((y, i) => i === 0 || i === S.stops.length - 1 || y % (size * 10) === 0 || y % (size * 50) === 0)
    .map(y => ({ at: y, text: y % (size * 50) === 0 || minorText || y === S.stops[0] || y === S.stops.at(-1) ? formatYear(y) : '', kind: y % (size * 50) === 0 ? 'key' : 'minor' }));
  // Where the start rests follows the recipe's show (2.1 rule 4): a new recipe that changes it mounts the slider again.
  const rest = S.R.show === 'upto' ? 'first' : 'end';
  if (!S.period || S.periodRest !== rest) {
    S.period?.stop();
    S.periodRest = rest;
    S.period = P.mount($('#timeline'), {
      stops: S.stops, from: since, to: at, rest, labels: y => formatYear(y), ticks,
      ids: { from: 'from', to: 'year', prev: 'prev', play: 'play', next: 'next' },
      names: { group: 'Year shown', from: 'First year of the period', to: 'Year shown', prev: 'Previous year', next: 'Next year' },
      play: { interval: 1200, label: 'Play through the years' },
      onChange: p => setFrame(p.to, { start: p.atRest ? null : p.from, source: p.source }),
    });
  } else S.period.update({ stops: S.stops, ticks, from: since, to: at });
  // A start on its rest (the first stop of an up-to view, the frame of a frame view) is no start: since= is not written.
  const p = S.period.get();
  return { at, start: p.atRest ? null : p.from };
}

/* ---------- start ---------- */
async function applyRecipe({ first = false } = {}) {
  const raw = location.hash.replace(/^#/, '');
  const R = readRecipe(raw);
  S.notes = [];
  if (raw && !R) S.notes.push('This address is not a view VM can read (VR/1); it shows the borders VM holds instead.');
  S.R = R || readRecipe(DEFAULT);
  if (!S.R.show) S.R.show = 'frame';
  if (!S.R.step) S.R.step = 'y';
  S.boxSet = false;
  if (S.mode === 'saved') leaveSaved();
  const { at, start } = mountPeriod();
  // The subject's name follows the recipe (R2: the reader moves this frame by its hash, one click after another), and
  // the records of the places VM cannot outline give their names and points.
  await Promise.all([loadSubject(S.R.q || null), readRecords(unoutlined(S.R)), loadShelf(S.R)]);
  await setFrame(at, { start, fit: true, source: first ? 'set' : 'hash' });
}
async function init() {
  wire();
  try {
    const [layers, index, qids, base, battles, sources] = await Promise.all([
      getFile(`${DATA}layers.json`), getFile(`${DATA}borders/index.json`), getFile(`${DATA}borders/qids.json`), getFile(`${DATA}base/ne_110m_land.geojson`),
      getFile(`${DATA}layers/battles.json`), getFile(new URL('integration/sources.json', SITE).href)]);
    S.layers = layers.json; S.index = index.json; S.qids = qids.json; S.base = base.json; S.battles = battles.json; S.sources = sources.json.sources;
    S.bufs.set('base', base.buf); S.bufs.set('battles', battles.buf); S.bufs.set('qids', qids.buf);
    const bad = S.layers.layers.map(l => M.readLayer(l)).filter(r => !r.ok);
    for (const b of bad) S.notes.push(`The layer "${b.entry?.id}" is not well formed: ${b.errors.join('; ')}`);
  } catch (e) {
    $('#meta').innerHTML = `<span>The Omni-Map's data could not load: ${esc(e.message)}</span>`;
    window.omniState = { ready: true, error: e.message };
    return;
  }
  const built = new Date(S.layers.generated);
  const held = M.held(S.index);
  $('#meta').innerHTML = [`<span>Borders <b>${esc(formatSpan(held.from, held.to))}</b> (Cliopatria ${esc(S.index.version)})</span>`,
    `<span>Battles <b>${(S.battles.rows || []).length}</b> (Wikidata)</span>`,
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
    S.period.set(null, y, { silent: true });
    setFrame(y, { source: 'step' });
    $('#year').focus({ preventScroll: true });
  });
  $('#shows-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-fit]');
    const f = b && S.drawn.find(x => x.id === b.dataset.fit);
    if (f && S.map) S.map.fit(f.properties.b, { padding: 30 });
  });
  $('#save').addEventListener('click', () => act('#save', saveBundle));
  $('#cite').addEventListener('click', () => act('#cite', cite));
  $('#download').addEventListener('click', () => act('#download', download));
  $('#open-file').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) openSaved(f); e.target.value = ''; });
  window.addEventListener('hashchange', () => {
    const R = readRecipe(location.hash.replace(/^#/, ''));
    if (R && writeRecipe(R) === currentRecipe()) return; // our own write, read back
    applyRecipe();
  });
  window.addEventListener('prp:themechange', () => { S.map?.setColors(colors()); if (window.omniState.ready) publish(); });
  window.addEventListener('resize', () => S.map?.resize());
}
init();
