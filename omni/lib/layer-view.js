/* The Omni-Map's layers on the page (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5a): the one list of layers with a switch
   for each, the data a layer needs loaded only once it is switched on (for a layer split by years, only the frame's
   file), its drawing on the map, its legend, and its rows for a bundle and "Download data". What is drawn is decided by
   omni/lib/layers.js (pure); omni/app.js asks this module at each frame. The borders and the battles stay omni/app.js's
   own (their lists and their map sources are older than S5a); here they are switches like any other.

   const lv = layerView({ data, getFile, map: () => S.map, sources: () => S.sources, onChange })
   lv.init(layersDoc)        the catalogue (omni/data/layers.json)
   lv.read(R, { subject })   the recipe's layers → { unknown, notes }
   lv.recipe()               the keys to write back: { fill, base, l, all }
   await lv.frame(year)      loads and draws what the frame needs
   lv.list(el, year)         the layer list, into el
   lv.legend(year)           legend blocks (HTML) for the layers it draws
   lv.rows(), lv.features(), await lv.datasets(), lv.pinList()   for the bundle (ds= pins of the layers drawn)
   lv.state()                for window.omniState: { on, drawn, fetched, notes, absent } */
import * as L from './layers.js';
import * as N from './layers-now.js';
import { formatValueDate } from '../../design/vm-dates.js';

const M = () => window.PRPMap;
const esc = s => M().esc(s);
const fmt = n => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-GB') : Number(n.toPrecision(3)).toLocaleString('en-GB'));
const stamp = iso => String(iso || '').replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})\d*(?:\.\d+)?Z$/, '$1Z');
const sha = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
const BEFORE = 'borders-fill'; // fills and bases are drawn under the borders
const GROUPS = { wb: 'World Bank indicators, by country' };

export function layerView({ data, getFile, map, sources, onChange, borders = () => null }) {
  let cat = L.catalogue(null), set = L.emptySet(), subject = null, note = '';
  const files = new Map(), fetched = [];
  const drawn = { fill: null, base: null, points: {} };
  const site = new URL('../../', data).href; // the site's root (data is omni/data/)
  const at = (p, base = site) => (/^https?:/.test(p) ? p : new URL(p, base).href);
  let frameYear = null, frameLo = null, picked = null;
  const load = url => {
    if (!files.has(url)) {
      fetched.push(url);
      const p = getFile(new URL(url, data).href);
      p.catch(() => files.delete(url));
      files.set(url, p);
    }
    return files.get(url);
  };
  const entry = id => cat.byId.get(id) || null;
  const src = id => (sources() || []).find(s => s.id === id) || null;
  // The files under omni/data are named from the site's root in the catalogue (omni/data/...): data is omni/data/.
  const rel = p => String(p).replace(/^omni\/data\//, '');

  /* ---------- the colours: tokens of omni/styles.css (--om-seq-1 … --om-seq-10), as the page has them ---------- */
  // The tokens mix the design system's sequential blues (--prp-seq-100 … 700) with color-mix(), so each is resolved
  // by the browser on a probe element, then read as a pixel: MapLibre and the grid's image take plain rgb().
  function ramp() {
    return Array.from({ length: 10 }, (_, k) => colour(`--om-seq-${k + 1}`));
  }
  // One colour token, as the browser resolves it, as plain rgb().
  function colour(name) {
    const out = [], probe = document.createElement('span');
    probe.hidden = true; document.body.append(probe);
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    probe.style.color = `var(${name}, var(--prp-muted))`;
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#888'; g.fillStyle = getComputedStyle(probe).color; g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    out.push({ css: `rgb(${r}, ${gr}, ${b})`, rgb: [r, gr, b] });
    probe.remove();
    return out[0];
  }
  // n classes from the ten tokens, from the ramp's second step (L.tokenOf: the first reads as sea).
  const classColours = n => { const r = ramp(); return Array.from({ length: n }, (_, i) => r[L.tokenOf(i, n) - 1]); };

  /* ---------- data a layer needs at a year ---------- */
  async function countries() {
    const e = entry('countries');
    const [topo, small] = await Promise.all([load(rel(e?.data || 'omni/data/base/countries.topo.json')), load(rel(e?.points || 'omni/data/base/small-states.json'))]);
    if (!topo.fc) topo.fc = M().decode(topo.json, 'countries');
    return { fc: topo.fc, small: small.json.points, topo, smallFile: small };
  }
  async function need(id, year) {
    const e = entry(id);
    const y = M().layerYear(e, year);
    // Before the years a layer holds, its gap's reason (conflict before 1946: no free source) follows the span.
    if (y == null) return { id, held: false, text: `${M().heldText(e, year)}${e.gap && year < e.gap.before ? `. ${e.gap.text}` : ''}` };
    if (e.split === 'year' && e.geometry !== 'grid') return needSplit(id, e, y); // HYDE's grid has its own split (below)
    if (e.on === 'states' || e.at === 'country') {
      const [c, d, keys] = await Promise.all([countries(), load(rel(e.data)), e.module === 'retrospective' ? load('layers/retro-keys.json').catch(() => null) : null]);
      return { id, held: true, year: y, ...c, doc: d.json, rows: d.json.rows || [], buf: d.buf, path: e.data, keys: keys?.json?.keys || null };
    }
    if (e.geometry === 'grid') {
      const index = await load(rel(e.data));
      const f = index.json.files.find(x => x.year === y);
      if (!f) return { id, held: false, text: `${e.title}: VM holds no file for ${y}` };
      const file = await load(rel(e.data).replace(/[^/]+$/, f.file));
      return { id, held: true, year: y, index: index.json, file: f, grid: file.json, buf: file.buf, path: `omni/data/${rel(e.data).replace(/[^/]+$/, f.file)}` };
    }
    if (e.on === 'countries' || id === 'countries') {
      const c = await countries();
      if (id === 'countries') return { id, held: true, year: y, ...c };
      const s = await load(rel(e.data));
      return { id, held: true, year: y, ...c, series: s.json, buf: s.buf, path: e.data };
    }
    const d = await load(rel(e.data));
    return { id, held: true, year: y, doc: d.json, rows: d.json.rows || [], buf: d.buf, path: e.data };
  }
  // S5c: a layer split by years (the Volatility score, UCDP's events, the calendars' events): its index, then only the
  // file holding the frame's year (layers-now.js reads it as a by-country series or as point rows).
  async function needSplit(id, e, y) {
    const index = await load(rel(e.data)), f = N.splitFile(index.json, y);
    if (!f) return { id, held: false, text: `${e.title}: VM holds no file for ${yr(y)}` };
    const p = rel(e.data).replace(/[^/]+$/, f.file), [file, c] = await Promise.all([load(p), countries()]);
    const base = { id, held: true, year: y, ...c, index: index.json, file: f, buf: file.buf, path: `omni/data/${p}`, split: true };
    if (e.on === 'countries') return { ...base, series: N.gviSeries(file.json) };
    if (file.json.format === 'vm-ged-cells/1') { const { rows, listed, listedRows } = N.cellRows(file.json); return { ...base, doc: file.json, rows, listed, listedRows }; }
    return { ...base, doc: file.json, rows: N.calendarRows(file.json) };
  }

  /* ---------- drawing ---------- */
  const raw = () => map()?.map || null;
  // Draws now once the map has loaded its style. isStyleLoaded() alone is false while any source is still loading (the
  // borders of a new frame), and 'load' fires only once, so a layer switched on then was never drawn (S5b): a map that
  // has loaded (MapLibre's _loaded, or 'load' seen here) draws at once.
  const ready = f => {
    const m = raw();
    if (!m) return;
    if (m._loaded || m._vmLoaded || m.isStyleLoaded()) f(m);
    else m.once('load', () => { m._vmLoaded = true; f(m); });
  };
  function put(m, id, source, layer, before = BEFORE) {
    if (m.getSource(id)) m.getSource(id).setData?.(source.data);
    else m.addSource(id, source);
    if (!m.getLayer(layer.id)) m.addLayer(layer, m.getLayer(before) ? before : undefined);
  }
  function clear(m, ids) { for (const id of ids) { if (m.getLayer(id)) m.removeLayer(id); } }
  function bordersAsOutlines(m, on) {
    if (!m.getLayer('borders-fill')) return;
    m.setPaintProperty('borders-fill', 'fill-opacity', on ? ['case', ['boolean', ['get', 'focus'], false], 0.18, 0] : ['case', ['boolean', ['get', 'focus'], false], 0.34, 0.1]);
  }
  function drawCountriesBase(m, d) {
    const line = getComputedStyle(document.documentElement).getPropertyValue('--prp-map-border').trim();
    put(m, 'lv-countries-base', { type: 'geojson', data: d ? { type: 'FeatureCollection', features: d.fc.features.filter(f => f.geometry) } : { type: 'FeatureCollection', features: [] } },
      { id: 'lv-countries-base', type: 'line', source: 'lv-countries-base', paint: { 'line-color': line, 'line-width': 0.6, 'line-dasharray': [3, 2] } }, 'borders-line');
    put(m, 'lv-small-base', { type: 'geojson', data: { type: 'FeatureCollection', features: d ? d.small.map(p => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: p.at } })) : [] } },
      { id: 'lv-small-base', type: 'circle', source: 'lv-small-base', paint: { 'circle-radius': 2, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': line, 'circle-stroke-width': 1 } }, 'borders-line');
  }
  function countryValues(d) {
    const e = entry(d.id), s = d.series, i = s.years.indexOf(d.year), breaks = e.style.breaks, colours = classColours(breaks.length + 1);
    const val = iso => (iso && s.values[iso] ? s.values[iso][i] : null);
    const feats = d.fc.features.filter(f => f.geometry).map(f => ({ f, v: val(f.properties.iso3) }));
    const pts = d.small.map(p => ({ p, v: val(p.iso3) }));
    // F3 (S5a review): an economy with a value this year that no free shape or point holds is listed, never dropped.
    const placed = new Set([...d.fc.features.map(f => f.properties.iso3), ...d.small.map(p => p.iso3)].filter(Boolean));
    const unplaced = Object.keys(s.values).filter(iso => !placed.has(iso) && val(iso) != null).map(iso => ({ iso3: iso, n: s.names[iso] || iso, v: val(iso) }));
    return { e, s, breaks, colours, feats, pts, unplaced };
  }
  function drawCountryFill(m, d) {
    const { breaks, colours, feats, pts } = countryValues(d);
    // R3: a country with no value this year is drawn in the no-data colour, and every country is outlined under a fill.
    const none = colour('--prp-map-nodata').css;
    const fc = { type: 'FeatureCollection', features: feats.map(({ f, v }) => ({ type: 'Feature', properties: { c: v == null ? none : colours[L.classOf(v, breaks)].css }, geometry: f.geometry })) };
    const pc = { type: 'FeatureCollection', features: pts.filter(x => x.v != null).map(({ p, v }) => ({ type: 'Feature', properties: { c: colours[L.classOf(v, breaks)].css }, geometry: { type: 'Point', coordinates: p.at } })) };
    put(m, 'lv-fill', { type: 'geojson', data: fc }, { id: 'lv-fill', type: 'fill', source: 'lv-fill', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.85 } });
    if (!m.getLayer('lv-fill-line')) m.addLayer({ id: 'lv-fill-line', type: 'line', source: 'lv-fill', paint: { 'line-color': getComputedStyle(document.documentElement).getPropertyValue('--prp-map-border').trim(), 'line-width': 0.5 } }, m.getLayer(BEFORE) ? BEFORE : undefined);
    put(m, 'lv-fill-pts', { type: 'geojson', data: pc }, { id: 'lv-fill-pts', type: 'circle', source: 'lv-fill-pts', paint: { 'circle-radius': 4, 'circle-color': ['get', 'c'], 'circle-stroke-width': 1, 'circle-stroke-color': getComputedStyle(document.documentElement).getPropertyValue('--prp-map-halo').trim() } }, 'borders-line');
  }
  // The grid as one image over ±85.0511°, its rows re-projected to Web Mercator so each cell is drawn where it is.
  function gridImage(d) {
    const g = d.grid, idx = d.index, breaks = idx.breaks, colours = classColours(breaks.length + 1);
    const cls = new Uint8Array(g.cols * g.rows);
    let i = 0;
    for (let k = 0; k + 1 < g.cells.length; k += 2) { i += g.cells[k]; cls[i] = 1 + L.classOf(g.cells[k + 1] / L.cellArea(Math.floor(i / g.cols), { deg: g.deg, north: g.north }), breaks); }
    const W = g.cols, H = g.cols, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const row = Math.min(g.rows - 1, Math.max(0, Math.floor((g.north - L.mercatorLat(y, H)) / g.deg)));
      for (let x = 0; x < W; x++) {
        const k = cls[row * g.cols + x];
        if (!k) continue;
        const [r, gg, b] = colours[k - 1].rgb, o = (y * W + x) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 230;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  function drawGrid(m, d) {
    const url = gridImage(d), lat = 85.0511287798066;
    const coordinates = [[-180, lat], [180, lat], [180, -lat], [-180, -lat]];
    if (m.getSource('lv-grid')) m.getSource('lv-grid').updateImage({ url, coordinates });
    else m.addSource('lv-grid', { type: 'image', url, coordinates });
    if (!m.getLayer('lv-grid')) m.addLayer({ id: 'lv-grid', type: 'raster', source: 'lv-grid', paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, BEFORE);
  }
  // A point layer of S5b or S5c: its rows' points in the period shown, clustered above 2,000 (4.2).
  function drawPoints(m, id, rows) {
    const s = `lv-pt-${id}`, cluster = L.clusters(rows.length), cells = entry(id)?.style?.kind === 'cells';
    // S5c: n (a cell's events) sizes a circle of UCDP's events, and sums over a cluster; h draws a row hollow (a
    // calendar event still expected, UCDP's events known only to a province or wider).
    const data = { type: 'FeatureCollection', features: rows.map(r => ({ type: 'Feature', properties: { id: r.id || r.q, n: r.n ?? 1, h: r.hollow || r.expected ? 1 : 0 }, geometry: { type: 'Point', coordinates: r.pt } })) };
    if (m.getSource(s) && m.getSource(s)._vmCluster !== cluster) { clear(m, [s, `${s}-n`]); m.removeSource(s); }
    if (!m.getSource(s)) { m.addSource(s, { type: 'geojson', data, cluster, clusterRadius: 40, ...(cluster ? { clusterProperties: { n: ['+', ['get', 'n']] } } : {}) }); m.getSource(s)._vmCluster = cluster; }
    else m.getSource(s).setData(data);
    const colour = getComputedStyle(document.documentElement).getPropertyValue(entry(id)?.style?.token || '--prp-ds').trim();
    const radius = cells ? ['case', ['has', 'point_count'], ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 8, 100, 26], ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 3, 30, 14]] : ['case', ['has', 'point_count'], 12, 5];
    const hollow = ['==', ['get', 'h'], 1];
    if (!m.getLayer(s)) m.addLayer({ id: s, type: 'circle', source: s, paint: { 'circle-radius': radius, 'circle-color': colour, 'circle-opacity': ['case', hollow, 0, cells ? 0.7 : 0.85], 'circle-stroke-color': colour, 'circle-stroke-width': ['case', hollow, 1.5, 0] } });
    clickable(m);
  }

  /* ---------- stage S5b: states on the borders of their year, and points at a country ---------- */
  // Where a state is drawn at the frame's year (L.placeState): Cliopatria's border through VM's crosswalk, else Natural
  // Earth's of today. Kept for the frame, so a country of many points is placed once.
  const placed = { year: null, map: new Map() };
  function placeOf(place, year, c) {
    if (placed.year !== year) { placed.year = year; placed.map = new Map(); }
    const k = `${place.q || ''}|${place.iso3 || ''}|${place.since ?? ''}`;
    if (placed.map.has(k)) return placed.map.get(k);
    const b = borders();
    const ff = b?.fc ? (q, y) => M().featuresFor(b.fc, b.qids, q, y, b.held || undefined) : null;
    const r = L.placeState(place, year, { featuresFor: ff, countries: c.fc, small: c.small });
    if (r.how && !r.at) {
      const big = [...r.features].sort((x, y) => area(y) - area(x))[0];
      r.at = big ? M().labelPoint(big) : null;
    }
    // A state's ISO3 for the module links: its own, else its Natural Earth country's of today.
    r.iso3 = place.iso3 || (c.fc.features.find(f => f.properties.q === place.q)?.properties.iso3) || (c.small.find(p => p.q === place.q)?.iso3) || null;
    placed.map.set(k, r);
    return r;
  }
  const area = f => { let s = 0; for (const p of (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.coordinates || [])) { const r = p[0] || []; for (let i = 0; i + 1 < r.length; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; } return Math.abs(s); };
  const whyNot = (r, year) => (r.reason === 'before-ne' ? `before ${L.NE_FROM}, and VM’s crosswalk of Cliopatria does not hold it at ${yr(year)}`
    : r.reason === 'before-since' ? `before its inception, and VM’s crosswalk of Cliopatria does not hold it at ${yr(year)}` : 'neither Cliopatria (through VM’s crosswalk) nor Natural Earth holds a border for it');
  // A by-state fill at its year: the states drawn (with their class), those fighting abroad, and those VM cannot place.
  function statesView(d) {
    const e = entry(d.id), doc = d.doc, classes = e.style.classes, r10 = ramp(), colours = classes.map((c, k) => r10[L.stateTokenOf(k, classes.length) - 1]);
    const vals = L.stateValues(doc, d.year), shown = [], unplaced = [];
    for (const s of vals) {
      const place = { q: s.q, ...(doc.places?.[s.q] || {}) };
      // The source names the state (UCDP's location, the state's own office) at this year, so its inception in Wikidata
      // (often its present form's: Iran 1979, Ethiopia 1995) does not keep it off today's border; the card says so.
      const r = placeOf({ ...place, since: null }, d.year, d);
      const k = classes.findIndex(c => c.v === s.v);
      const row = { ...s, place, n: place.n || s.q, how: r.how, iso3: r.iso3, at: r.at, features: r.features, colour: k >= 0 ? colours[k].css : null, label: k >= 0 ? classes[k].label : null };
      if (r.how) shown.push(row); else unplaced.push({ ...row, why: whyNot(r, d.year) });
    }
    return { e, doc, classes, colours, shown, unplaced };
  }
  function drawStates(m, d) {
    const { shown } = statesView(d);
    const fc = { type: 'FeatureCollection', features: shown.filter(s => s.colour && s.features.length).flatMap(s => s.features.map(f => ({ type: 'Feature', properties: { c: s.colour, q: s.q, lv: d.id }, geometry: f.geometry }))) };
    const pc = { type: 'FeatureCollection', features: shown.filter(s => s.colour && !s.features.length && s.at).map(s => ({ type: 'Feature', properties: { c: s.colour, q: s.q, lv: d.id }, geometry: { type: 'Point', coordinates: s.at } })) };
    const ab = { type: 'FeatureCollection', features: shown.filter(s => s.a.length).flatMap(s => (s.features.length ? s.features.map(f => ({ type: 'Feature', properties: { q: s.q, lv: d.id }, geometry: f.geometry })) : [])) };
    const css = getComputedStyle(document.documentElement), bad = css.getPropertyValue('--prp-bad').trim(), line = css.getPropertyValue('--prp-map-border').trim();
    put(m, 'lv-st', { type: 'geojson', data: fc }, { id: 'lv-st', type: 'fill', source: 'lv-st', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.8 } });
    if (!m.getLayer('lv-st-line')) m.addLayer({ id: 'lv-st-line', type: 'line', source: 'lv-st', paint: { 'line-color': line, 'line-width': 0.6 } }, m.getLayer(BEFORE) ? BEFORE : undefined);
    put(m, 'lv-st-abroad', { type: 'geojson', data: ab }, { id: 'lv-st-abroad', type: 'line', source: 'lv-st-abroad', paint: { 'line-color': bad, 'line-width': 2, 'line-dasharray': [2, 1.5] } }, 'borders-line');
    put(m, 'lv-st-pts', { type: 'geojson', data: pc }, { id: 'lv-st-pts', type: 'circle', source: 'lv-st-pts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'c'], 'circle-stroke-width': 1, 'circle-stroke-color': css.getPropertyValue('--prp-map-halo').trim() } }, 'borders-line');
    clickable(m);
  }
  const ST = ['lv-st-line', 'lv-st', 'lv-st-abroad', 'lv-st-pts'];
  // A point layer's rows in the period shown, through its filter, each at its point: its own, or its country's.
  function pointsView(d, year, lo) {
    // A layer split by years draws the frame's year (its file is the only one loaded).
    const e = entry(d.id), rows = L.inPeriod(d.rows, e.split ? year : lo, year, set.filters[d.id] || null), shown = [], unplaced = [];
    for (const r of rows) {
      // S5c: a row placed at its country by ISO3 (or a state not of today by Q-id); a split layer's row with neither
      // place nor point is listed (a calendar event of the European Union, of several countries).
      if (r.place) { const p = placeOf(r.place, year, d); if (p.how && p.at) shown.push({ r, pt: p.at, iso3: p.iso3 }); else unplaced.push({ r, why: whyNot(p, year) }); continue; }
      if (e.split && !Array.isArray(r.pt)) { unplaced.push({ r, why: `${r.country || r.key || 'its place'} is not one of today’s countries, so VM’s crosswalk gives it no ISO3` }); continue; }
      if (e.at !== 'country') { if (Array.isArray(r.pt)) shown.push({ r, pt: r.pt }); else unplaced.push({ r, why: 'no point' }); continue; }
      const q = (r.country || [])[0];
      const p = q ? placeOf({ q }, year, d) : { how: null, reason: 'no-shape' };
      if (p.how && p.at) shown.push({ r, pt: p.at, iso3: p.iso3 }); else unplaced.push({ r, why: q ? whyNot(p, year) : 'Wikidata gives it no country' });
    }
    return { e, shown, unplaced };
  }

  /* ---------- a click on what a layer draws: what it is, and the module that holds it at that place and year ---------- */
  function clickable(m) {
    if (m._vmPick) return; // once for each map (the page may make its map again)
    m._vmPick = true;
    m.on('click', ev => {
      const ids = ['lv-st', 'lv-st-pts', ...Object.keys(drawn.points).map(id => `lv-pt-${id}`)].filter(id => m.getLayer(id));
      const f = ids.length ? m.queryRenderedFeatures(ev.point, { layers: ids })[0] : null;
      if (!f) return;
      api.pick(f.layer.id.startsWith('lv-st') ? { layer: f.properties.lv, q: f.properties.q } : f.properties.point_count ? { layer: f.layer.id.slice(6), cluster: f.properties.point_count } : { layer: f.layer.id.slice(6), id: f.properties.id });
    });
    for (const id of ['lv-st', 'lv-st-pts']) {
      m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; });
    }
  }
  // The links of a state of a by-state layer at its year.
  function stateLinks(d, s) {
    const e = entry(d.id), out = [];
    if (e.module === 'battlefield-history') {
      out.push({ href: at(L.moduleLink('battlefield-history', { year: d.year, iso3: s.iso3, gw: s.place.gw })), text: `Retrospective Battlefield: ${s.n}, ${yr(d.year)}` });
      const wars = new Set([...s.t, ...s.a].map(id => d.doc.conflicts?.[id]?.wars?.[d.year]).filter(w => /^wf-/.test(w || '')));
      for (const w of wars) out.push({ href: at(L.moduleLink('war-focus', { war: w })), text: `War Focus: ${w.slice(3).replace(/-/g, ' ')}` });
    } else if (e.module === 'retrospective') {
      const key = L.retroKey(d.keys, s.iso3, s.n);
      out.push({ href: L.moduleLink('retrospective', { year: d.year, key }), text: `Political Retrospective: ${key ? s.n : 'the world'}, ${yr(d.year)}${key ? '' : ` (it does not cover ${s.n})`}` });
    }
    return out;
  }
  function stateWords(d, s) {
    if (d.doc.format === 'vm-terms/1') return s.t.map(i => d.doc.terms[i]).filter(Boolean).map(t => `${t.n} (${t.role === 'hos' ? 'head of state' : 'head of government'}, from ${formatValueDate(t.start, { source: 'Wikidata' })})`).join('; ');
    const c = id => d.doc.conflicts?.[id];
    const inten = id => d.doc.intensity?.[d.doc.years[d.year].c?.[id]?.[0]] || '';
    return [...s.t.map(id => `${c(id)?.n || id}: ${inten(id)}`), ...s.a.map(id => `abroad, ${c(id)?.n || id}`)].join('; ');
  }
  function rowLinks(id, r, iso3) {
    const e = entry(id), y = r.sortYear, out = [];
    if (r.q) out.push({ href: at(`encyclopedia/index.html#${r.q}`), text: 'In the encyclopaedia' });
    if (id === 'breakthroughs') out.push({ href: at(L.moduleLink('progress', { year: y, event: r.id })), text: `Invention Timeline: ${yr(y)}` });
    if (e.module === 'retrospective') { const d = drawn.points[id], key = L.retroKey(d?.keys, iso3); out.push({ href: L.moduleLink('retrospective', { year: y, key }), text: `Political Retrospective${key ? '' : ' (the world: it does not cover this country)'}, ${yr(y)}` }); }
    if (/^wf-/.test(r.war || '')) out.push({ href: at(L.moduleLink('war-focus', { war: r.war })), text: 'War Focus' });
    // S5c: a calendar event opens in the Calendars; UCDP's events open their War Focus wars and the Retrospective
    // Battlefield at their country and year.
    if (e.module === 'calendar') out.push({ href: at(L.moduleLink('calendar', { event: r.id })), text: 'In the Calendars' });
    if (e.module === 'battlefield') {
      for (const w of (r.w || []).filter(w => /^wf-/.test(w))) out.push({ href: at(L.moduleLink('war-focus', { war: w })), text: `War Focus: ${w.slice(3).replace(/-/g, ' ')}` });
      if (iso3 || r.place?.iso3) out.push({ href: at(L.moduleLink('battlefield-history', { year: y, iso3: iso3 || r.place.iso3 })), text: `Retrospective Battlefield, ${yr(y)}` });
    }
    return out;
  }
  // A layer's filter in words: its own (the discipline, the type of violence) or a war of the registry (l=ucdp-events:w=…).
  // A war of the registry is named by its words (wf-russia-ukraine: "the war Russia–Ukraine"), its id beside (V8).
const warName = id => (/^wf-/.test(id) ? `${id.slice(3).split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('–')} (${id})` : id);
const filterWords = (e, f) => (!f ? null : f.field === e.filter?.field ? `${e.filter.label.toLowerCase()} ${e.filter.values.find(v => v.id === f.value)?.name || f.value}` : f.field === 'w' ? `the war ${warName(f.value)}` : `${f.field} ${f.value}`);
  const linksHtml = ls => ls.map(l => `<a href="${esc(l.href)}" target="_top"${/^https?:/.test(l.href) && !l.href.startsWith(site) ? ' rel="noreferrer"' : ''}>${esc(l.text)}</a>`).join(' · ');
  const when = r => (r.date?.from ? formatValueDate(r.date, { source: 'Wikidata' }) : r.whenText || `${r.circa ? 'c. ' : ''}${yr(r.sortYear)}`);
  // A row's name for a reader: an item Wikidata gives no English name is "an unnamed Wikidata item (Q…)" (V12).
  const nameOf = r => (/^Q\d+$/.test(String(r.label || r.id || '')) ? `An unnamed Wikidata item (${r.label || r.id})` : r.label || r.id);
  const LIST_AT_MOST = 40; // a legend lists at most this many of a layer's points; the rest are counted

  /* ---------- the legend's key of a by-state layer: its classes, the count strip, the states drawn and those not ---------- */
  function strip(doc, year) {
    const ys = L.conflictCounts(doc), top = Math.max(1, ...ys.map(x => x.n)), W = ys.length * 3, H = 36, now = ys.find(x => x.y === year);
    const bars = ys.map((x, i) => `<rect x="${i * 3}" y="${H - Math.round((x.n / top) * (H - 2))}" width="2" height="${Math.round((x.n / top) * (H - 2))}" class="${x.y === year ? 'now' : ''}"><title>${x.y}: ${x.n}</title></rect>`).join('');
    const label = `Armed conflicts a year, as UCDP counts them, ${yr(doc.from)} to ${yr(doc.to)}: at most ${top}${now ? `; ${now.n} in ${yr(year)}` : ''}`;
    return `<figure class="om-strip"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${bars}</svg><figcaption>${esc(label)}.</figcaption></figure>`;
  }
  const placedWords = (s, year) => (s.how === 'cliopatria' ? `On Cliopatria’s border of ${yr(year)}` : `${s.how === 'natural-earth' ? 'On Natural Earth’s border of today' : 'At Natural Earth’s point of today'}`
    + `${Number.isFinite(s.place?.since) && s.place.since > year ? ` (Wikidata dates the state of today from ${yr(s.place.since)})` : ''}`);
  function statesKey(d) {
    const { e, doc, classes, shown, unplaced } = statesView(d);
    let key = `<ul class="om-ramp" aria-label="${esc(e.measure || e.title)}">${classes.map((c, k) => `<li><span class="om-swatch om-seq-${L.stateTokenOf(k, classes.length)}" aria-hidden="true"></span>${esc(c.label)}</li>`).join('')}`
      + (e.style.abroad ? `<li><span class="om-swatch abroad" aria-hidden="true"></span>${esc(e.style.abroad)}</li>` : '') + '</ul>';
    if (doc.format === 'vm-territory/1') key += strip(doc, d.year);
    const items = shown.map(s => `<li data-q="${esc(s.q)}"><b><bdi>${esc(s.n)}</bdi></b> <span class="om-q">${esc(s.q)}</span><span>${esc(stateWords(d, s))}</span>`
      + `<span class="om-src">${esc(placedWords(s, d.year))}</span><span>${linksHtml(stateLinks(d, s))}</span></li>`);
    key += `<details class="om-method" data-list="${esc(d.id)}"><summary>Drawn at ${esc(yr(d.year))}: ${shown.length} ${shown.length === 1 ? 'state' : 'states'}, each with its module</summary><ul class="om-list om-ly-items">${items.join('')}</ul></details>`;
    if (unplaced.length) key += `<p class="om-lg-credit" data-unplaced="${esc(unplaced.map(u => u.q).join(' '))}">VM cannot place ${unplaced.length === 1 ? 'this' : 'these'} on a free border for ${esc(yr(d.year))}, so ${unplaced.length === 1 ? 'it is' : 'they are'} not drawn: ${esc(unplaced.map(u => `${u.n} (${u.q}; ${stateWords(d, u)}): ${u.why}`).join('; '))}.</p>`;
    return key;
  }
  function pointsKey(d) {
    const { e, shown, unplaced } = pointsView(d, frameYear ?? d.year, frameLo ?? d.year);
    const f = set.filters[d.id], fv = filterWords(e, f);
    const span = e.split || (frameLo ?? d.year) === (frameYear ?? d.year) ? yr(frameYear ?? d.year) : `${yr(frameLo)} to ${yr(frameYear)}`;
    const items = shown.slice(-LIST_AT_MOST).reverse().map(({ r, iso3 }) => `<li data-id="${esc(r.id)}"><b><bdi>${esc(nameOf(r))}</bdi></b>${r.attempt ? ' <span class="om-q">an attempt</span>' : ''}${r.expected ? ' <span class="om-q">expected</span>' : ''} <span>${esc(when(r))}</span>`
      + `<span class="om-src">${esc(r.src?.date?.line || '')}</span><span>${linksHtml(rowLinks(d.id, r, iso3))}</span></li>`);
    let key = `<p class="om-lg-credit" data-drawn="${shown.length}">Drawn: ${shown.length} from ${esc(span)}${fv ? `, ${esc(fv)} only (l=${esc(d.id)}:${esc(f.field)}=${esc(f.value)})` : ''}${shown.length > LIST_AT_MOST ? `; the ${LIST_AT_MOST} latest listed` : ''}.</p>`
      // V8: the events not drawn are counted through the same filter as those drawn.
      + (listedN(d, f) ? `<p class="om-lg-credit" data-listed="${listedN(d, f)}">Not drawn: ${listedN(d, f)} ${listedN(d, f) === 1 ? 'event' : 'events'} UCDP knows only to the country, or at sea or in the air${fv ? `, ${esc(fv)} only` : ''}.</p>` : '')
      + (shown.some(x => x.r.hollow || x.r.expected) ? `<p class="om-lg-credit"><span class="om-swatch hollow" aria-hidden="true"></span> Hollow: ${esc(e.style?.hollow || (e.style?.kind === 'cells' ? 'events UCDP knows only to a province or wider, drawn at their country' : 'still expected'))}.</p>` : '');
    if (shown.length) key += `<details class="om-method" data-list="${esc(d.id)}"><summary>The ${shown.length > LIST_AT_MOST ? `${LIST_AT_MOST} latest` : shown.length === 1 ? 'one' : `${shown.length}`} drawn, each with its module</summary><ul class="om-list om-ly-items">${items.join('')}</ul></details>`;
    if (unplaced.length) key += `<p class="om-lg-credit" data-unplaced="${esc(unplaced.map(u => u.r.id).join(' '))}">VM cannot place ${unplaced.length === 1 ? 'this' : `these ${unplaced.length}`} at ${esc(yr(frameYear ?? d.year))}, so ${unplaced.length === 1 ? 'it is' : 'they are'} not drawn: ${esc(unplaced.slice(0, LIST_AT_MOST).map(u => `${nameOf(u.r)} (${u.why})`).join('; '))}${unplaced.length > LIST_AT_MOST ? `; and ${unplaced.length - LIST_AT_MOST} more` : ''}.</p>`;
    return key;
  }
  const listedN = (d, f) => (d.listedRows ? d.listedRows.filter(r => L.passes(r, f)).reduce((s, r) => s + r.n, 0) : d.listed || 0);
  // Whether what is drawn uses Natural Earth's countries of today (the base, a by-country fill, a state or a point placed on them).
  const usesCountries = () => !!(drawn.base?.held || (drawn.fill?.held && ['countries', 'states'].includes(entry(drawn.fill.id).on))
    || Object.values(drawn.points).some(d => d.held && (entry(d.id).at === 'country' || (d.split && d.rows.some(r => r.place)))));
  // The panel a click on the map fills (and the reader's keyboard reaches through the lists above): what it is, its
  // source, and the module that holds it at that place and year.
  function pickHtml() {
    if (!picked) return '';
    const d = picked.layer === drawn.fill?.id ? drawn.fill : drawn.points[picked.layer];
    if (!d?.held) return '';
    const e = entry(d.id);
    let body = '';
    if (picked.q && e.on === 'states') {
      const s = statesView(d).shown.find(x => x.q === picked.q);
      if (!s) return '';
      body = `<p><b><bdi>${esc(s.n)}</bdi></b> <span class="om-q">${esc(s.q)}</span>, ${esc(yr(d.year))}${s.label ? `: ${esc(s.label)}` : ''}</p><p>${esc(stateWords(d, s))}</p><p class="om-src">${esc(placedWords(s, d.year))}</p><p>${linksHtml(stateLinks(d, s))}</p>`;
    } else if (picked.cluster) body = `<p>${esc(String(picked.cluster))} points of ${esc(e.title)} here: zoom in to tell them apart.</p>`;
    else {
      const x = pointsView(d, frameYear, frameLo).shown.find(p => String(p.r.id) === String(picked.id));
      if (!x) return '';
      const r = x.r;
      body = `<p><b><bdi>${esc(nameOf(r))}</bdi></b>${r.q ? ` <span class="om-q">${esc(r.q)}</span>` : ''}${r.attempt ? ', an attempt' : ''}</p><p>${esc(when(r))}</p><p class="om-src">${esc(r.src?.date?.line || '')}</p>`
        + (r.note ? `<p>${esc(r.note)} <span class="om-q">VM’s own text</span></p>` : '') + (r.basis ? `<p class="om-src">Placed by the Invention Timeline’s rule “${esc(r.basis)}”${r.placeName ? `: ${esc(r.placeName)}` : ''}${r.vmPlaced ? ', set by hand by VM' : ''}</p>` : '')
        + `<p>${linksHtml(rowLinks(d.id, r, x.iso3))}</p>`;
    }
    return `<p class="om-lg-title">${esc(e.title)}: what you clicked</p>${body}`;
  }

  /* ---------- the list's words (R4 of the S5a review): the span always, then what the map shows of it ---------- */
  const yr = y => (y < 0 ? `${-y} BC` : String(y));
  const spanOf = e => `Holds ${M().spanWords ? M().spanWords(e) : `${yr(e.time.from)} to ${yr(e.time.to)}`}.`;
  function stateOf(e, on, year) {
    if (!on) return 'Off: its data loads when you switch it on.';
    if (e.id === 'countries') return 'On: today’s borders, whatever the year.';
    if (e.id === 'battles') return 'On.';
    const y = M().layerYear(e, year), s = src(e.source)?.short || e.source;
    if (y == null) return 'On: nothing of it falls at this year.';
    if (L.roleOf(e) === 'point') {
      const lo = frameYear === year && frameLo != null ? frameLo : year, fv = filterWords(e, set.filters[e.id]);
      // A layer split by years loads the frame's file alone: UCDP's events show the frame's year.
      const from = e.split ? year : lo;
      return `On: the map shows its ${e.style?.kind === 'cells' ? 'cells' : 'points'} ${from === year ? `of ${yr(year)}` : `from ${yr(from)} to ${yr(year)}`}${fv ? `, ${fv} only` : ''}.`;
    }
    const p = M().statusAt(e, y) === 'projection' ? ', a projection' : '';
    return y !== year ? `On: the map shows ${s}’s ${yr(y)}${p}, the last of its years before ${yr(year)}.` : `On: the map shows ${yr(y)}${p}.`;
  }

  const api = {
    init(doc) { cat = L.catalogue(doc); },
    catalogue: () => cat,
    read(R, opts = {}) {
      subject = opts.subject || null;
      const r = L.fromRecipe(R, cat, { subject });
      set = r.set; note = r.notes.join(' ');
      return { unknown: r.unknown, notes: r.notes };
    },
    recipe: () => L.toRecipe(set, cat),
    on: () => L.layersOn(set),
    isOn: id => id === 'borders' || L.layersOn(set).includes(id),
    // opts.lo: the first year of the period shown (design 2.1 rule 4); a point layer draws its rows of [lo, year].
    async frame(year, { lo = year } = {}) {
      drawn.fill = drawn.base = null; drawn.points = {};
      if (frameYear !== year || frameLo !== lo) picked = null;
      frameYear = year; frameLo = Math.min(lo ?? year, year);
      const jobs = [];
      if (set.base) jobs.push(need(set.base, year).then(d => { drawn.base = d; }));
      if (set.fill) jobs.push(need(set.fill, year).then(d => { drawn.fill = d; }));
      for (const id of set.points) if (id !== 'battles') jobs.push(need(id, year).then(d => { drawn.points[id] = d; }));
      const errs = [];
      await Promise.all(jobs.map(j => j.catch(e => errs.push(e.message))));
      ready(m => {
        drawCountriesBase(m, drawn.base?.held ? drawn.base : null);
        const f = drawn.fill?.held ? drawn.fill : null;
        if (f && entry(f.id).geometry === 'grid') { clear(m, ['lv-fill-line', 'lv-fill', 'lv-fill-pts', ...ST]); drawGrid(m, f); }
        else if (f && entry(f.id).on === 'states') { clear(m, ['lv-fill-line', 'lv-fill', 'lv-fill-pts', 'lv-grid']); drawStates(m, f); }
        else if (f) { clear(m, ['lv-grid', ...ST]); drawCountryFill(m, f); }
        else clear(m, ['lv-fill-line', 'lv-fill', 'lv-fill-pts', 'lv-grid', ...ST]);
        bordersAsOutlines(m, !!f);
        for (const id of cat.list.filter(e => L.roleOf(e) === 'point' && e.id !== 'battles').map(e => e.id)) {
          const d = drawn.points[id];
          if (d?.held) drawPoints(m, id, pointsView(d, year, frameLo).shown.map(x => ({ ...x.r, pt: x.pt })));
          else clear(m, [`lv-pt-${id}`]);
        }
      });
      return errs;
    },
    /* ---------- the list: a switch for each layer, its words, and the lines for those VM leaves out ---------- */
    list(el, year) {
      const html = cat.list.map(e => {
        const role = L.roleOf(e), on = api.isOn(e.id), held = M().heldText(e, year);
        const lg = M().legend(e, { sources: sources(), year });
        const what = role === 'borders' ? 'Always drawn: the map’s ground. Under a fill they are drawn as outlines.' : held || `${spanOf(e)} ${stateOf(e, on, year)}`;
        const sw = role === 'borders' ? `<input type="checkbox" role="switch" id="ly-${esc(e.id)}" checked disabled aria-describedby="ly-${esc(e.id)}-what">`
          : `<input type="checkbox" role="switch" id="ly-${esc(e.id)}" data-layer="${esc(e.id)}"${on ? ' checked' : ''} aria-describedby="ly-${esc(e.id)}-what">`;
        return `<li class="om-ly" data-layer="${esc(e.id)}" data-role="${esc(role)}"><div class="om-ly-row">${sw}<label for="ly-${esc(e.id)}">${esc(e.title)}</label><span class="om-ly-role">${esc({ borders: 'borders', fill: 'fill', base: 'base', point: 'points', line: 'lines' }[role])}</span></div>`
          + `<p class="om-ly-what" id="ly-${esc(e.id)}-what">${esc(what)}</p>`
          // A layer with a filter (the breakthroughs' discipline): one value alone, or all; kept in the address (l=id:field=value).
          + (e.filter && on ? `<p class="om-ly-filter"><label for="ly-${esc(e.id)}-filter">${esc(e.filter.label)}</label> <select id="ly-${esc(e.id)}-filter" data-filter="${esc(e.id)}" data-field="${esc(e.filter.field)}">`
            + `<option value="">All</option>${e.filter.values.map(v => `<option value="${esc(v.id)}"${set.filters[e.id]?.value === v.id ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></p>` : '')
          + `<details class="om-method"><summary>Legend, source, licence and method</summary><ul class="om-lg-lines">${lg.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p class="om-lg-credit">${esc(lg.credit)}</p><p>${esc(lg.method)}</p></details></li>`;
      });
      // S5c: the layers of a group (the World Bank's indicators) sit under one disclosure at the first one's place,
      // open while one of them is on, so forty switches do not bury the rest.
      const rows = [], groups = new Map();
      cat.list.forEach((e, i) => {
        if (!e.group) { rows.push(html[i]); return; }
        if (!groups.has(e.group)) { groups.set(e.group, []); rows.push(groups.get(e.group)); }
        groups.get(e.group).push(i);
      });
      for (let k = 0; k < rows.length; k++) {
        if (typeof rows[k] === 'string') continue;
        const ix = rows[k], g = cat.list[ix[0]].group, open = ix.some(i => api.isOn(cat.list[i].id));
        rows[k] = `<li class="om-ly om-ly-group" data-group="${esc(g)}"><details${open ? ' open' : ''}><summary>${esc(GROUPS[g] || g)}: ${ix.length} layers, one fill at a time</summary><ul class="om-list om-layers">${ix.map(i => html[i]).join('')}</ul></details></li>`;
      }
      for (const a of cat.absent) {
        rows.push(`<li class="om-ly absent" data-layer="${esc(a.id)}" data-absent="true"><div class="om-ly-row"><span class="om-ly-off" aria-hidden="true">—</span><b>${esc(a.title)}</b><span class="om-ly-role">left out</span></div>`
          + `<p class="om-ly-what">VM’s own text: not built, because ${esc(a.why)}. ${a.seen ? `What VM read: ${esc(a.seen)}. ` : ''}`
          + `${a.termsUrl ? `<a href="${esc(a.termsUrl)}" target="_blank" rel="noreferrer">Its terms</a>, read ${esc(a.read)}; ` : ''}<a href="${esc(a.url)}" target="_blank" rel="noreferrer">${a.termsUrl ? 'where its files are' : 'Where it is'}</a>${a.termsUrl ? '' : `, read ${esc(a.read)}`}.</p></li>`);
      }
      el.innerHTML = `<ul class="om-list om-layers">${rows.join('')}</ul>`
        + `<p class="om-ly-any"><input type="checkbox" id="ly-anyway"${set.anyway ? ' checked' : ''} aria-describedby="ly-anyway-what"> <label for="ly-anyway">Show anyway</label></p>`
        + `<p class="om-ly-what" id="ly-anyway-what">The map draws one fill, one base and at most ${L.MAX_POINTS} point or line layers; a fourth replaces the oldest. Ticked, every point or line layer switched on is drawn.</p>`
        + `<p class="om-ly-note" id="ly-note" role="status" aria-live="polite">${esc(note)}</p>`;
    },
    // A switch moved (pointer, or Space on the focused switch): the set changes and the page draws the frame again.
    wire(el) {
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.id === 'ly-anyway') { const r = L.setAnyway(set, t.checked, cat, { subject }); set = r.set; note = r.note || ''; onChange(); return; }
        if (t.dataset?.filter) { set = L.setFilter(set, t.dataset.filter, t.value ? { field: t.dataset.field, value: t.value } : null); note = ''; onChange({ focus: t.id }); return; }
        const id = t.dataset?.layer;
        if (!id) return;
        if (t.checked) { const r = L.switchOn(set, id, cat, { subject }); set = r.set; note = r.note || ''; }
        else { set = L.switchOff(set, id); note = ''; }
        onChange({ focus: `ly-${id}` });
      });
    },
    /* ---------- the legend of what it draws ---------- */
    legend(year) {
      const out = [];
      for (const d of [drawn.base, drawn.fill, ...Object.values(drawn.points)].filter(Boolean)) {
        const e = entry(d.id), lg = M().legend(e, { sources: sources(), year });
        // V8: a year a layer takes from another source than its own (UCDP's candidate events of 2026) says so first.
        const ds = d.held && d.split && d.doc?.source && d.doc.source !== e.source ? src(d.doc.source) : null;
        const own = ds ? [`This year’s source: ${ds.short || d.doc.source}${d.doc.version ? ` ${d.doc.version}` : ''}, ${d.doc.status || ''}${d.doc.format === 'vm-ged-cells/1' ? ': counts by country and month, not cells, and not split by type of violence' : ''}${ds.licence ? ` (${ds.licence})` : ''}`] : [];
        const lines = [...(d.held ? [] : [d.text]), ...own, ...lg.lines];
        let key = '';
        if (d.held && e.style?.kind === 'classes') {
          const breaks = e.geometry === 'grid' ? d.index.breaks : e.style.breaks;
          const labels = L.classLabels(breaks, fmt);
          const blank = e.geometry === 'grid' ? 'Blank: no one in the cell, or under half a person' : 'No value for this year';
          key = `<ul class="om-ramp" aria-label="${esc(e.style.unit)}">${labels.map((l, k) => `<li><span class="om-swatch om-seq-${L.tokenOf(k, labels.length)}" aria-hidden="true"></span>${esc(l)} ${esc(e.style.unit)}</li>`).join('')}`
            + `<li><span class="om-swatch om-nodata${e.geometry === 'grid' ? ' blank' : ''}" aria-hidden="true"></span>${esc(blank)}</li></ul>`;
          if (e.on === 'countries') {
            const { s, unplaced } = countryValues(d), agg = Object.values(s.aggregates || {});
            if (unplaced.length) key += `<p class="om-lg-credit" data-unplaced="${esc(unplaced.map(u => u.iso3).join(' '))}">VM cannot place ${unplaced.length === 1 ? 'this' : 'these'} on a free border for ${esc(String(d.year))}, so ${unplaced.length === 1 ? 'it is' : 'they are'} not drawn: ${esc(unplaced.map(u => `${u.n} (${u.iso3}), ${fmt(u.v)}`).join('; '))}.</p>`;
            if (agg.length) key += `<details class="om-method"><summary>Not drawn: the World Bank’s ${agg.length} aggregates</summary><p>${esc(agg.join('; '))}.</p></details>`;
            // S5c: a by-day score shows one day, the last VM holds of the frame's year.
            if (s.day) key += `<p class="om-lg-credit" data-day="${esc(s.day)}">Drawn: the score of ${esc(formatValueDate({ from: s.day, p: 11 }))}, the last day VM holds of ${esc(String(d.year))}${s.method ? ` (method ${esc(s.method)})` : ''}.</p>`;
          }
        }
        if (d.held && e.style?.kind === 'states') key = statesKey(d);
        else if (d.held && L.roleOf(e) === 'point') key = pointsKey(d);
        const shown = d.held && d.year !== year ? `<p class="om-lg-credit">Drawn: ${esc(String(d.year))}${M().statusAt(e, d.year) === 'projection' ? ', a projection' : ''}</p>` : '';
        out.push(`<div class="om-lg" data-layer="${esc(d.id)}"><p class="om-lg-title"><span class="om-swatch ${esc(L.roleOf(e))}" aria-hidden="true"></span>${esc(lg.title)}</p>`
          + `<ul class="om-lg-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${key}${shown}<p class="om-lg-credit">${esc(lg.credit)}</p>`
          + `<details class="om-method"><summary><span aria-hidden="true">ⓘ</span> How this layer was made</summary><p>${esc(lg.method)}</p></details></div>`);
      }
      if (out.length && (drawn.fill?.doc || Object.values(drawn.points).some(d => d.held))) out.unshift(`<div class="om-lg om-pick" id="ly-pick" role="status" aria-live="polite">${pickHtml()}</div>`);
      return out.join('');
    },
    // A click on a state or a point a layer draws: { layer, q } or { layer, id } or { layer, cluster }.
    pick(p) {
      picked = p || null;
      const el = document.getElementById('ly-pick');
      if (el) { el.innerHTML = pickHtml(); if (picked) el.closest('details:not([open])')?.setAttribute('open', ''); }
      return el ? el.textContent : '';
    },
    /* ---------- the bundle: rows (rows.csv's columns), features, datasets and pins of each layer drawn ---------- */
    rows() {
      const out = [];
      const base = { low: '', high: '', by: '', origin: 'source' };
      const fill = drawn.fill;
      if (fill?.held && entry(fill.id).geometry === 'grid') {
        const g = fill.grid, e = entry(fill.id), status = M().statusAt(e, fill.year), sh = src(e.source)?.short || e.source;
        let i = 0;
        for (let k = 0; k + 1 < g.cells.length; k += 2) {
          i += g.cells[k];
          const r = Math.floor(i / g.cols), c = i % g.cols, people = g.cells[k + 1];
          out.push({ ...base, Entity: `cell ${r},${c}`, Code: `g025-${r}-${c}`, date: String(fill.year), precision: 'year', value: +(people / L.cellArea(r, { deg: g.deg, north: g.north })).toPrecision(6),
            measure: `people per km² (${sh} ${fill.index.version}, VM’s 0.25° sum)`, status, source_id: e.source, source_loc: `${g.source_loc};0.25° row ${r} col ${c};people ${people}`, layer: fill.id, feature_id: `g025-${r}-${c}` });
        }
      } else if (fill?.held && entry(fill.id).on === 'states') {
        const { e, doc, shown } = statesView(fill);
        for (const s of shown) {
          const terms = doc.format === 'vm-terms/1';
          out.push({ ...base, Entity: s.n, Code: s.iso3 || s.q, date: String(fill.year), precision: 'year', value: s.v, measure: `${e.measure}${s.label ? `: ${s.label}` : ''}${s.a.length ? `; fighting abroad in ${s.a.length}` : ''}`, status: e.status,
            source_id: terms ? 'wikidata' : 'ucdp-acd', source_loc: terms ? s.t.map(i => `${doc.terms[i].q}#P39 ${doc.terms[i].st}`).join(';') : `conflict_id=${[...s.t, ...s.a].join(',')};year=${fill.year}`, layer: fill.id, feature_id: s.q });
        }
      } else if (fill?.held) {
        const { e, s, feats, pts } = countryValues(fill);
        for (const x of [...feats.map(({ f, v }) => ({ id: f.properties.id, iso3: f.properties.iso3, n: f.properties.n, v })), ...pts.map(({ p, v }) => ({ id: p.id, iso3: p.iso3, n: p.n, v }))]) {
          if (x.v == null) continue;
          out.push({ ...base, Entity: s.names[x.iso3] || x.n, Code: x.iso3, date: s.day || String(fill.year), precision: s.day ? 'day' : 'year', value: x.v, measure: `${s.indicator} (${e.measure})`, status: e.status,
            source_id: e.source, source_loc: `${s.indicator};economy=${x.iso3};date=${s.day || fill.year}${s.cov?.[x.iso3] ? `;coverage=${s.cov[x.iso3]}` : ''}`, layer: fill.id, feature_id: x.id });
        }
      }
      // A point layer's rows drawn in the period, each with its date as its source gives it.
      const P = { 9: 'year', 10: 'month', 11: 'day' };
      for (const [id, d] of Object.entries(drawn.points)) for (const { r } of d.held ? pointsView(d, frameYear ?? d.year, frameLo ?? d.year).shown : []) {
        // V8: UCDP's events, one row for each cell (or country) and month, the month its date, the file's row its place.
        if (r.byMonth) {
          for (const m of r.months) {
            const x = r.byMonth[m], mm = String(m).padStart(2, '0'), cand = d.doc?.status === 'candidate';
            out.push({ ...base, Entity: r.kind === 'cell' ? `cell ${r.cell}` : r.key, Code: r.kind === 'cell' ? `c${r.cell}` : r.key, date: `${r.sortYear}-${mm}`, precision: 'month', value: x.n,
              measure: `events; ${N.deathWords(x.best)} (best${cand ? '' : `; ${x.low} to ${x.high}`})`, status: cand ? 'candidate' : entry(id).status || '', source_id: d.doc?.source || entry(id).source,
              source_loc: `${cand ? 'battlefield/data/realtime.json' : 'GEDEvent_v26_1.csv'};year=${r.sortYear};month=${m};${r.kind === 'cell' ? `cell=${r.cell} (0.5°)` : `country=${r.key}`};type=${r.t}`, layer: id, feature_id: `${r.id}-m${mm}` });
          }
          continue;
        }
        out.push({ ...base, Entity: r.label || r.id, Code: r.q || r.place?.iso3 || r.place?.q || r.id, date: r.date?.from || `${r.circa ? 'c. ' : ''}${r.sortYear ?? ''}`, precision: P[r.date?.p] || (r.date ? '' : 'year'), value: r.value ?? '', measure: r.measure ?? '', status: (d.doc?.status === 'candidate' ? 'candidate' : '') || (r.expected ? 'expected' : '') || entry(id).status || '', source_id: r.src?.date?.id || (d.split && d.doc?.source) || entry(id).source, source_loc: r.src?.date?.loc || '', layer: id, feature_id: r.q || r.id });
      }
      return out;
    },
    features() {
      const out = [];
      const fill = drawn.fill;
      if (fill?.held && entry(fill.id).geometry === 'grid') out.push({ type: 'Feature', id: `${fill.id}@${fill.year}`, properties: { layer: fill.id, year: fill.year, file: fill.path, cells: fill.grid.populated, deg: fill.grid.deg, west: fill.grid.west, north: fill.grid.north, note: 'Each cell is a row of rows.csv; its square is 0.25° from its row and column (row 0 at 90° N, column 0 at 180° W).' }, geometry: null });
      else if (fill?.held && entry(fill.id).on === 'states') {
        for (const s of statesView(fill).shown) out.push({ type: 'Feature', id: `${fill.id}:${s.q}@${fill.year}`, properties: { layer: fill.id, q: s.q, n: s.n, iso3: s.iso3, year: fill.year, value: s.v, class: s.label, abroad: s.a.length > 0, placed: s.how },
          geometry: s.features.length ? (s.features.length === 1 ? s.features[0].geometry : { type: 'GeometryCollection', geometries: s.features.map(f => f.geometry) }) : s.at ? { type: 'Point', coordinates: s.at } : null });
      } else if (fill?.held) {
        const { breaks, feats } = countryValues(fill);
        for (const { f, v } of feats) out.push({ type: 'Feature', id: f.properties.id, properties: { layer: fill.id, iso3: f.properties.iso3, n: f.properties.n, year: fill.year, value: v, class: v == null ? null : L.classOf(v, breaks) }, geometry: f.geometry });
      }
      for (const [id, d] of Object.entries(drawn.points)) for (const { r, pt } of d.held ? pointsView(d, frameYear ?? d.year, frameLo ?? d.year).shown : []) out.push({ type: 'Feature', id: `${id}:${r.id}`, properties: { layer: id, q: r.q || null, label: r.label || null, year: r.sortYear, placed: entry(id).at === 'country' ? 'at its country' : 'its own point' }, geometry: { type: 'Point', coordinates: pt } });
      if (drawn.base?.held) out.push({ type: 'Feature', id: 'countries@v5.1.1', properties: { layer: 'countries', file: 'omni/data/base/countries.topo.json', countries: drawn.base.fc.features.length }, geometry: null });
      return out;
    },
    async datasets() {
      const out = [];
      const cite = id => { const s = src(id); return { licence: s?.licence, licenceUrl: s?.licenceUrl, citation: s?.citation, credit: s?.credit, changes: s?.changes }; };
      if (usesCountries()) {
        const c = await countries();
        out.push({ id: 'countries', version: stamp(c.topo.json.vm?.built), file: 'omni/data/base/countries.topo.json', sha256: await sha(c.topo.buf), source: 'natural-earth-admin0@v5.1.1', ...cite('natural-earth-admin0') });
      }
      const f = drawn.fill;
      if (f?.held && entry(f.id).geometry === 'grid') out.push({ id: f.id, version: stamp(f.index.built), file: f.path, sha256: await sha(f.buf), source: `${entry(f.id).source}@${f.index.version}`, sourceSha256: f.file.from.sha256, sourceFile: f.file.from.url, sourceEntry: f.file.from.entry, ...cite(entry(f.id).source) });
      else if (f?.held && entry(f.id).on === 'states') {
        const files = f.doc.files || {};
        for (const s of Object.keys(files).length ? Object.keys(files) : [entry(f.id).source]) out.push({ id: `${f.id}${Object.keys(files).length ? `:${s}` : ''}`, version: stamp(f.doc.built), file: f.path, sha256: await sha(f.buf), source: files[s] ? `${s}, ${files[s].file} (sha256 ${files[s].sha256})` : s, ...(files[s] ? { sourceSha256: files[s].sha256, sourceFile: files[s].url } : {}), ...cite(s) });
      }
      else if (f?.held) out.push({ id: f.id, version: stamp(f.series.built), file: f.path, sha256: await sha(f.buf), source: f.series.day ? `${entry(f.id).source}, ${f.path}, the day ${f.series.day}` : `${entry(f.id).source} ${f.series.indicator}, last updated ${f.series.lastupdated}`, ...cite(entry(f.id).source) });
      for (const [id, d] of Object.entries(drawn.points)) if (d.held) out.push({ id, version: d.doc?.built ? stamp(d.doc.built) : '', file: d.path, sha256: await sha(d.buf), ...(d.split && d.doc?.source !== entry(id).source ? { source: d.doc.source } : {}), ...cite((d.split && d.doc?.source) || entry(id).source) });
      return out;
    },
    // ds= pins of the layers drawn: a layer is pinned only when the view draws it, so a view of borders and battles
    // pins exactly what it pinned before S5a.
    pinList() {
      const out = [];
      const c = drawn.base?.held ? drawn.base : usesCountries() ? [drawn.fill, ...Object.values(drawn.points)].find(d => d?.held && d.topo) : null;
      if (c) out.push({ id: 'countries', version: stamp(c.topo.json.vm?.built) });
      const f = drawn.fill;
      if (f?.held && entry(f.id).geometry === 'grid') out.push({ id: f.id, version: stamp(f.index.built) });
      else if (f?.held && f.doc) out.push({ id: f.id, version: stamp(f.doc.built) });
      else if (f?.held) out.push({ id: f.id, version: stamp(f.series.built) });
      // The point layers of S5b drawn (the battles stay omni/app.js's own pin).
      for (const d of Object.values(drawn.points)) if (d.held && d.doc?.built) out.push({ id: d.id, version: stamp(d.doc.built) });
      return out;
    },
    drawnNow: () => [drawn.base, drawn.fill, ...Object.values(drawn.points)].filter(d => d?.held).map(d => d.id),
    state: () => ({ on: L.layersOn(set), anyway: set.anyway, drawn: api.drawnNow(), fetched: [...fetched], note, absent: cat.absent.map(a => a.id), period: [frameLo, frameYear], filters: { ...set.filters }, picked,
      counts: Object.fromEntries([drawn.fill, ...Object.values(drawn.points)].filter(d => d?.held && d.doc).map(d => {
        const v = entry(d.id).on === 'states' ? statesView(d) : pointsView(d, frameYear ?? d.year, frameLo ?? d.year);
        return [d.id, { drawn: v.shown.length, unplaced: v.unplaced.length }];
      })),
      // Where on the map (in its own pixels, as the map stands when read) each state of the fill is labelled, so a page
      // test can click it.
      get marks() { return drawn.fill?.held && drawn.fill.doc && raw() ? statesView(drawn.fill).shown.filter(s => s.at).map(s => { const p = raw().project(s.at); return { q: s.q, xy: [Math.round(p.x), Math.round(p.y)] }; }) : []; },
      years: Object.fromEntries([drawn.base, drawn.fill, ...Object.values(drawn.points)].filter(Boolean).map(d => [d.id, d.held ? d.year : null])) }),
  };
  return api;
}
