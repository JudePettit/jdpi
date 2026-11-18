/* PRP map core: the Omni-Map's dated borders, layers and legends, pure (PRP-SCHOLAR-USP-DESIGN.md S1, 4.2, 5.6, 7.3).
   A plain script like design/prp-focus.js, loadable in Node (import '../design/prp-map.js'; globalThis.PRPMap) and in
   a page before its module script. No DOM, no fetch: the page loads the files and hands them in. Boxes go through
   PRPFocus.resolve (load prp-focus.js first), so a map fits a place the way every VM map does.

   The dated-borders format, version 1 (omni/data/borders/<from>-<to>.topo.json, a year below zero written m and its
   digits, as in m3400-m301.topo.json; written by omni/scripts/build-borders.mjs):
     A TopoJSON Topology (spec 1.0, quantised: "transform" with delta-encoded arcs) whose object "borders" is a
     GeometryCollection of Polygon / MultiPolygon (or null) geometries, each with
       properties { id: 'cl-<10 hex>', n: <the source's name>, f: <from year>, t: <to year>, k: 'POLITY' | 'RELATION',
                    q: <the source's own Wikidata id> | null, a: <area, km²>, w: <Wikipedia phrase> | null,
                    b: [w, s, e, n] the box of the unquantised geometry }
     and at the top level vm { format: 'vm-borders/1', source, version, from, to }.
     Years are signed historical years with no year 0. A row is drawn at year y when f <= y <= t (inclusive both ends).
     RELATION rows (unions, alliances, overlordships) are outlines only; POLITY rows are filled.
   The index (omni/data/borders/index.json): { format: 'vm-borders-index/1', source, version, built, from, to,
     files: [{ from, to, file, rows, bytes, gzip, sha256 }] }.
   The crosswalk (omni/data/borders/qids.json): { format: 'vm-qids/1', version, built,
     entries: { <Q-id>: [{ name, from, to, basis: 'cliopatria-wikidata' | 'name' }] },
     rejected: [{ q, name, wikidataLabel, why, wikidataYears?, years?: [[from, to]], kept?: { years, why } }] }: a
     rejection with `years` holds the rows of those years (and of kept.years) only; one without holds every row.
     A Q-id is drawn only through this crosswalk, never through a row's own `q` (the source's ids are checked first).
   A layer's catalogue entry (4.2), checked by readLayer: { id, module, title, geometry, time: { field, from, to, step,
     precision }, data, measure, status, borderPrecision?, style, legend, source, method, open, pinnable }. */
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const ID = /^cl-[0-9a-f]{10}$/;
  const QID = /^Q[1-9]\d*$/;
  const STEPS = ['d', 'm', 'y', '10y', 'c'];
  const GEOMETRIES = ['polygon', 'point', 'line'];
  const yearOf = v => { const y = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10); return Number.isInteger(y) && y !== 0 ? y : null; };
  const fmtYear = y => (y < 0 ? `${-y} BC` : String(y));
  const fmtSpan = (a, b) => (a < 0 && b < 0 ? `${-a}–${-b} BC` : a < 0 ? `${-a} BC–AD ${b}` : `${a}–${b}`);

  /* ---------- TopoJSON → GeoJSON (its own small decoder, so pages need no topojson-client) ---------- */
  function arcPoints(topology) {
    const t = topology.transform, arcs = topology.arcs || [];
    if (!t) return arcs.map(a => a.map(p => [p[0], p[1]]));
    const [kx, ky] = t.scale, [dx, dy] = t.translate;
    return arcs.map(a => { let x = 0, y = 0; return a.map(p => [(x += p[0]) * kx + dx, (y += p[1]) * ky + dy]); });
  }
  // A ring from its arcs: arc i, or ~i (written -i-1) for arc i reversed; each arc after the first starts where the
  // last ended, so that shared point is kept once.
  function ring(indexes, pts) {
    const out = [];
    for (const i of indexes) {
      const a = i < 0 ? pts[~i].slice().reverse() : pts[i];
      if (!a) throw new Error(`arc ${i} is missing`);
      if (out.length) out.pop();
      for (const p of a) out.push(p);
    }
    if (out.length && (out[0][0] !== out.at(-1)[0] || out[0][1] !== out.at(-1)[1])) out.push(out[0].slice());
    return out;
  }
  function geometry(g, pts) {
    switch (g.type) {
      case 'Polygon': return { type: 'Polygon', coordinates: g.arcs.map(r => ring(r, pts)) };
      case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: g.arcs.map(p => p.map(r => ring(r, pts))) };
      case null: case undefined: return null;
      default: throw new Error(`geometry type ${g.type} is not part of vm-borders/1`);
    }
  }
  /** The dated-borders file as a GeoJSON FeatureCollection; each feature's id is its row id. `vm` is kept. */
  function decode(topology, name = 'borders') {
    if (!topology || topology.type !== 'Topology') throw new Error('not a TopoJSON Topology');
    const obj = topology.objects?.[name];
    const fc = { type: 'FeatureCollection', features: [], vm: topology.vm || null };
    if (!obj) return fc;
    const pts = arcPoints(topology);
    for (const g of obj.type === 'GeometryCollection' ? obj.geometries : [obj]) {
      const properties = g.properties || {};
      fc.features.push({ type: 'Feature', id: properties.id, properties, geometry: geometry(g, pts) });
    }
    return fc;
  }
  const validId = id => ID.test(String(id ?? ''));

  /* ---------- years ---------- */
  /** The index's file holding a year ('1494' or '1494-07' read by its year), or null outside the span VM holds. */
  function fileFor(index, year) {
    const y = yearOf(year);
    if (!index || !Array.isArray(index.files) || y == null) return null;
    return index.files.find(f => f.from <= y && y <= f.to) || null;
  }
  /** The span of years the index holds: { from, to }. */
  function held(index) {
    const fs = index?.files || [];
    if (!fs.length) return null;
    return { from: Math.min(...fs.map(f => f.from)), to: Math.max(...fs.map(f => f.to)) };
  }
  /** The rows drawn at a year: f <= year <= t, in file order. */
  function sliceAt(fc, year) {
    const y = yearOf(year);
    if (y == null || !fc?.features) return [];
    return fc.features.filter(f => f.properties.f <= y && y <= f.properties.t);
  }
  /** The crosswalk rows of a Q-id holding a year. */
  function qidRows(qids, qid, year) {
    const y = yearOf(year), rows = qids?.entries?.[qid];
    return Array.isArray(rows) && y != null ? rows.filter(r => r.from <= y && y <= r.to) : [];
  }
  /** A Q-id's features at a year: { features, reason }, reason null when drawn, else
        'outside-slice'  the year is outside the span VM holds (held: { from, to }, the index's)
        'not-this-year'  the crosswalk knows it, but not for this year
        'not-outlined'   VM cannot outline it (no crosswalk row, or a row with no geometry). */
  function featuresFor(fc, qids, qid, year, span = fc?.vm) {
    const y = yearOf(year);
    if (y == null || (span && (y < span.from || y > span.to))) return { features: [], reason: 'outside-slice' };
    if (!QID.test(String(qid ?? '')) || !qids?.entries?.[qid]?.length) return { features: [], reason: 'not-outlined' };
    const rows = qidRows(qids, qid, y);
    if (!rows.length) return { features: [], reason: 'not-this-year' };
    const named = sliceAt(fc, y).filter(f => rows.some(r => r.name === f.properties.n));
    if (!named.length) return { features: [], reason: 'not-this-year' };
    const drawn = named.filter(f => f.geometry);
    return drawn.length ? { features: drawn, reason: null } : { features: [], reason: 'not-outlined' };
  }
  /** A reason in the design's words. */
  function reasonText(reason, { year, held: span, point } = {}) {
    switch (reason) {
      case 'outside-slice': return span ? `VM holds borders for ${fmtSpan(span.from, span.to)} only` : 'VM holds no borders for this year';
      case 'not-this-year': return `Cliopatria has no outline for it in ${year != null ? fmtYear(year) : 'this year'}`;
      case 'not-outlined': return point === false ? 'VM cannot outline this, and holds no coordinates for it yet' : 'VM cannot outline this';
      case 'nothing-placeable': return 'VM cannot place this';
      default: return '';
    }
  }

  /* ---------- the extent ---------- */
  /** The box a view opens on: { box, hits, points, misses, padding, text }. focus holds Q-ids (outlined through the
      crosswalk at `year`, else placed at pointOf[qid] as a point, "VM cannot outline this"), ISO3 and gw:N (PRPFocus's
      own table) and bbox:w,s,e,n. Nothing placeable: box null, text "VM cannot place this" (the page shows the world). */
  function extent({ focus = [], year, fc, qids, held: span, pointOf = null } = {}) {
    const F = root.PRPFocus;
    if (!F) throw new Error('PRPFocus is not loaded (design/prp-focus.js)');
    const pt = q => (typeof pointOf === 'function' ? pointOf(q) : pointOf?.[q]) || null;
    const shapes = new Map(), hits = [], points = [], misses = [], countries = [], boxes = [];
    for (const f of focus || []) {
      if (typeof f !== 'string') continue;
      if (f.startsWith('bbox:')) { const b = f.slice(5).split(',').map(Number); if (b.length === 4 && b.every(Number.isFinite)) boxes.push(b); continue; }
      if (/^[A-Z]{3}$/.test(f) || /^gw:\d+$/.test(f)) { countries.push(f); continue; }
      if (!QID.test(f)) continue;
      const r = featuresFor(fc, qids, f, year, span);
      if (!r.reason) { shapes.set(f, { type: 'FeatureCollection', features: r.features }); hits.push(f); continue; }
      const p = pt(f);
      if (p) { shapes.set(f, p); points.push(f); }
      misses.push({ qid: f, reason: r.reason, point: !!p, text: reasonText(r.reason, { year: yearOf(year), held: span, point: !!p }) });
    }
    const t = F.resolve({ countries, qids: [...shapes.keys()], bbox: boxes.length ? F.union(boxes) : null, padding: 40 }, { qid: q => shapes.get(q) || null });
    return { box: t.box, hits, points, misses, padding: t.padding, text: t.box ? null : reasonText('nothing-placeable') };
  }

  /* ---------- points in polygons ---------- */
  const polygons = g => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
  function inRing([x, y], r) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inPolygon = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some(h => inRing(p, h));
  /** The POLITY drawn at `year` whose polygon holds [lon, lat], the smallest first (a duchy before the realm around
      it); RELATION rows and holes are left out; null when none. */
  function polityAt(fc, year, p) {
    const hits = sliceAt(fc, year).filter(f => f.properties.k === 'POLITY' && polygons(f.geometry).some(poly => inPolygon(p, poly)));
    hits.sort((a, b) => (a.properties.a ?? Infinity) - (b.properties.a ?? Infinity));
    return hits[0] || null;
  }
  function ringArea(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
  /** Where a feature's label goes: the area-weighted centroid of its largest outer ring, or that ring's box centre when
      the centroid falls outside it (a crescent); null for a feature with no geometry. */
  function labelPoint(feature) {
    const rings = polygons(feature?.geometry).map(p => p[0]).filter(r => r && r.length > 3);
    if (!rings.length) return null;
    const r = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
    const A = ringArea(r);
    let cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) { const c = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; cx += (r[i][0] + r[i + 1][0]) * c; cy += (r[i][1] + r[i + 1][1]) * c; }
    const c = A ? [cx / (6 * A), cy / (6 * A)] : null;
    if (c && inRing(c, r)) return c;
    const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  /** Text for HTML (labels are HTML markers): escaped, otherwise exactly as the source writes it. */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- layers: the catalogue entry, border precision, legend ---------- */
  /** Checks a catalogue entry against 4.2's shape: { ok, entry, errors }. */
  function readLayer(entry) {
    const errors = [];
    const need = (k, ok, what) => { if (!(entry && k in entry)) errors.push(`${k} is missing`); else if (!ok(entry[k])) errors.push(`${k} is not ${what}`); };
    if (!entry || typeof entry !== 'object') return { ok: false, entry: entry ?? null, errors: ['the entry is not an object'] };
    const str = v => typeof v === 'string' && v.trim() !== '';
    need('id', v => str(v) && /^[a-z][a-z0-9:-]*$/.test(v), 'a layer id');
    need('module', str, 'a submodule id');
    need('title', str, 'a title');
    need('geometry', v => GEOMETRIES.includes(v), `one of ${GEOMETRIES.join(', ')}`);
    need('time', v => v && typeof v === 'object' && str(v.field) && Number.isInteger(v.from) && Number.isInteger(v.to) && v.from <= v.to
      && STEPS.includes(v.step) && str(v.precision), 'a time { field, from, to, step, precision } with from <= to');
    need('data', str, 'the address of its data');
    need('measure', v => v === null || str(v), 'a measure id or null');
    need('status', str, 'a status');
    if ('borderPrecision' in entry && !(Array.isArray(entry.borderPrecision) && entry.borderPrecision.every(r => r && ['c', 'y', '10y', 'd', 'm'].includes(r.p))))
      errors.push('borderPrecision is not a list of { from?, to?, p }');
    need('style', v => v === null || typeof v === 'object', 'an object or null');
    need('legend', str, 'a legend');
    need('source', str, 'a source id');
    need('method', str, 'a method note');
    need('open', v => typeof v === 'boolean', 'true or false');
    need('pinnable', v => typeof v === 'boolean', 'true or false');
    return { ok: !errors.length, entry, errors };
  }
  /** The precision VM gives a layer's borders at a year ('c' century, 'y' year), from its borderPrecision rules
      ([{ to: 1499, p: 'c' }, { from: 1500, p: 'y' }]); null when no rule holds the year. */
  function borderPrecisionAt(entry, year) {
    const y = yearOf(year);
    const rule = (entry?.borderPrecision || []).find(r => (r.from == null || r.from <= y) && (r.to == null || y <= r.to));
    return y != null && rule ? rule.p : null;
  }
  const PRECISION = { c: 'century', y: 'year', '10y': 'decade', m: 'month', d: 'day' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // A source's version as a reader takes it: a release tag as written ('v0.2.1'); a time VM read the source (a live
  // source such as Wikidata has no release) as 'read 17 November 2026', never as if it were a version number.
  const versionWords = v => {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:T[\d:.]+Z)?$/.exec(String(v ?? ''));
    if (m) return `, read ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
    return v ? ` ${v}` : '';
  };
  const sourceOf = (sources, id) => (Array.isArray(sources) ? sources.find(s => s?.id === id) : sources?.[id]) || null;
  /** A layer's legend at a year, as plain text the page escapes: { title, lines, credit, method }. The lines state the
      source and version, the licence, the precision, the status and the measure (4.2: "The legend states measure,
      precision, status, source and version"). */
  function legend(entry, { sources, year } = {}) {
    const src = sourceOf(sources, entry?.source), lines = [];
    if (src) lines.push(`Source: ${src.short || src.id}${versionWords(src.version)}` + (src.licence ? `, ${src.licence}` : ''));
    else lines.push(`Source: ${entry?.source} (not in VM's list of sources)`);
    if (entry?.geometry === 'polygon' && Array.isArray(entry.borderPrecision)) {
      const p = borderPrecisionAt(entry, year), rule = (entry.borderPrecision || []).find(r => r.p === p);
      if (p === 'c') lines.push(`Borders at century precision${rule?.to != null ? ` before ${fmtYear(rule.to + 1)}` : ''}: VM counts a border of these years as known only to its century`);
      else if (p) lines.push(`Borders at ${PRECISION[p] || p} precision, as ${src?.short || 'the source'} dates its rows; VM has not checked them`);
    } else if (entry?.time?.precision) lines.push(`Dates at the precision ${src?.short || 'the source'} records, at best to the ${entry.time.precision}`);
    if (entry?.status === 'reconstruction') lines.push('A reconstruction: one version of each border, with no measure of its uncertainty');
    else if (entry?.status) lines.push(`Status: ${entry.status}`);
    if (entry?.measure) lines.push(`Measure: ${entry.measure}`);
    return { title: entry?.title || '', lines, credit: entry?.legend || '', method: entry?.method || '' };
  }
  /** What VM holds, in the design's words: 'VM holds 2 battles for these years'. */
  function heldMessage(kind, n) {
    const k = String(kind || 'item');
    return `VM holds ${n > 0 ? n : 'no'} ${n === 1 ? k : `${k}s`} for these years`;
  }

  /* ---------- a border row as a saved view passes it on (5.7, 5.8) ---------- */
  /** VM's crosswalk Q-id for a row's name at a year (the lowest, when several hold it), or null. */
  function qidFor(qids, name, year) {
    const y = yearOf(year);
    const qs = Object.entries(qids?.entries || {}).filter(([, rows]) => rows.some(r => r.name === name && r.from <= y && y <= r.to)).map(([q]) => q);
    return qs.sort((a, b) => +a.slice(1) - +b.slice(1))[0] || null;
  }
  /** A border row's properties for a bundle or a download: the source's own Wikidata id as cliopatria_q (never a bare
      q, which a reader would take for VM's), VM's crosswalk id as vm_q (or null), and, where VM's crosswalk rejected
      the source's id for this row, cliopatria_q_rejected: true with VM's reason. */
  function bundleProps(feature, qids, year) {
    const { q = null, ...rest } = feature?.properties || {};
    const out = { ...rest, cliopatria_q: q ?? null, vm_q: qidFor(qids, rest.n, year) };
    // A rejection that names years (the rows Wikidata's years do not meet, and those kept rejected by decision) holds
    // only the rows of those years; one that names none holds every row of that id and name.
    const holds = r => !r.years || [...r.years, ...(r.kept?.years || [])].some(([a, b]) => a <= rest.t && rest.f <= b);
    const no = q ? (qids?.rejected || []).find(r => r.q === q && r.name === rest.n && holds(r)) : null;
    if (no) { out.cliopatria_q_rejected = true; out.cliopatria_q_why = no.why || 'rejected by VM\'s crosswalk'; }
    return out;
  }
  /** A border row of rows.csv (5.8): its years as an EDTF interval at the precision the source records them (year), and
      VM's own rule for its border (century before 1500) said in the status column, so the two never contradict. */
  function borderRow(feature, { qids, year, precision } = {}) {
    const p = feature.properties;
    const span = (a, b) => { const e = n => (n < 0 ? `-${String(-n - 1).padStart(4, '0')}` : String(n).padStart(4, '0')); return a === b ? e(a) : `${e(a)}/${e(b)}`; };
    return { Entity: p.n, Code: qidFor(qids, p.n, year) || p.id, date: span(p.f, p.t), precision: 'year', value: p.a ?? '', low: '', high: '',
      measure: 'cliopatria-area-km2', status: precision === 'c' ? 'reconstruction; VM counts this border as known only to its century' : 'reconstruction',
      by: '', origin: 'source', source_id: 'cliopatria', source_loc: `Name=${p.n};FromYear=${p.f};ToYear=${p.t};Type=${p.k}`, layer: 'borders', feature_id: p.id };
  }

  root.PRPMap = { decode, validId, fileFor, held, sliceAt, qidRows, featuresFor, reasonText, extent, polityAt, labelPoint, esc,
    readLayer, borderPrecisionAt, legend, heldMessage, qidFor, bundleProps, borderRow };
})();
