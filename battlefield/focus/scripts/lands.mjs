// War Focus: whose land a Cliopatria row draws (fixer, 21 November 2026). Build only (scripts/build.mjs); the page reads
// what it writes into each war file's `lands`, and tests/warfocus.test.mjs checks it.
// Cliopatria v0.2.1 draws a state its own row only in the years it holds one, and places an occupied, annexed or
// administered land inside the row of the state that held it: South Vietnam inside the United States' row of 1967–2005,
// Iraq inside its row of 2006–2023, Libya and Norway inside Nazi Germany's of 1942. A row can also be only a far-off
// fragment of its state: the Kingdom of Norway of 1941–44 is Jan Mayen, Italy's row of 1944 its Tianjin concession.
// So that no part, puppet or occupier stands in for a whole state (the build's rule 3), for each year of a war:
// 1. A state whose rows that year hold less than FRAGMENT (a tenth) of the area they hold in the nearest years before
//    and after that differ from it (the smaller; years no more than GAP, twelve, away) is only a fragment: it is listed
//    as one VM cannot place, and its rows are drawn uncoloured (`parts`, and its polygons in `left`).
// 2. A state's reference land is its own rows in the nearest year (that one first, and no more than GAP years away) in
//    which it is drawn and no fragment (for the war's contested state, its rows also holding WHOLE, half, of what they
//    hold in the nearest different years, the larger); a colony whose first row is its independence decades later has
//    none. A polygon of another row that lies mostly (SHARE_IN, half its area or more) inside the
//    reference land of one of the war's states is drawn uncoloured (`left`, with the reference year) when that land is
//    the larger share of the war state's territory than of the row's own (the rule stateBoxes keeps for Britain's row
//    over Oman): the United States' part over South Vietnam, never Czechoslovakia inside Austria-Hungary.
// 3. Cliopatria's rows are dissolved shapes: a land joined to its holder (France inside Germany in 1942, Serb-held
//    Bosnia inside Serbia-Montenegro, Burma inside the British Raj) is in the same polygon and cannot be cut out without
//    drawing a border of another year, which VM never does. Where a quarter (INSIDE) or more of a war state's reference
//    land lies in a polygon of another place that is drawn coloured, the war file says so (`inside`, [state, place, row]), and
//    the page names it under the map.
// Areas are worked on the plane of longitude and latitude, each polygon scaled by the cosine of its mean latitude, and
// shares by points on a grid inside each polygon: good enough for shares of a half and a quarter, never drawn.
const FRAGMENT = 0.1, WHOLE = 0.5, SHARE_IN = 0.5, INSIDE = 0.25, GAP = 12;

/** Cliopatria's rows (the Omni-Map's TopoJSON) as polygons of [lon, lat] rings, with each polygon's area and box. */
export function decodeRows(topo) {
  const [kx, ky] = topo.transform.scale, [dx, dy] = topo.transform.translate;
  const pts = topo.arcs.map(a => { let x = 0, y = 0; return a.map(p => [(x += p[0]) * kx + dx, (y += p[1]) * ky + dy]); });
  const ring = idx => { const out = []; for (const i of idx) { const a = i < 0 ? pts[~i].slice().reverse() : pts[i]; if (out.length) out.pop(); out.push(...a); } return out; };
  return Object.values(topo.objects)[0].geometries.map(g => {
    const polys = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map(p => p.map(ring)) : [];
    return { p: g.properties, has: !!g.type, polys, area: polys.map(polyArea), box: polys.map(p => boxOf(p[0])) };
  });
}
const ringArea = r => { let s = 0, lat = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; lat += r[i][1]; } return Math.abs(s / 2) * Math.cos((lat / r.length) * Math.PI / 180); };
const polyArea = p => Math.max(0, ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0));
const boxOf = r => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of r) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; };
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const inRing = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (pt, p) => inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h));
const inBox = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// Points on a grid inside a polygon, each weighted by its share of the polygon's area; a polygon too small for the grid
// is one point, its first vertex.
function samples(poly, area, n = 14) {
  const b = boxOf(poly[0]), out = [];
  for (let k = n; k <= 4 * n && !out.length; k *= 2) {
    const sx = (b[2] - b[0]) / k, sy = (b[3] - b[1]) / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const pt = [b[0] + (i + 0.5) * sx, b[1] + (j + 0.5) * sy]; if (inPoly(pt, poly)) out.push(pt); }
  }
  if (!out.length) out.push(poly[0][0]);
  return out.map(pt => [pt, area / out.length]);
}

/**
 * The lands of each year from Cliopatria's decoded rows (decodeRows of the Omni-Map's files, in order of years) and the
 * Battlefield's crosswalk (`placeOf(row id, year)`, a Q-id or null). `drawn(properties, has a shape)` is the
 * Battlefield's drawnRow rule. Years from `from` to `to`; each year is read from one file only, `fileFor(year)` (the
 * files' rows overlap in years, and the page draws a year from the span cut from 1900-1999 before 2000, from
 * 2000-2024 after), so a polygon's index is its index in the row the page draws.
 */
export function makeLands(files, placeOf, drawn, { from = 1900, to = 2024, fileFor = y => (y < 2000 ? 0 : 1) } = {}) {
  const rowsByYear = new Map(), area = new Map(); // year → [{ r, q }]; Q → Map year → area
  for (let y = from; y <= to; y++) {
    const list = [];
    for (const r of files[fileFor(y)]) if (r.p.f <= y && y <= r.p.t && drawn(r.p, r.has)) {
      const q = placeOf(r.p.id, y);
      list.push({ r, q });
      if (q) { const m = area.get(q) || area.set(q, new Map()).get(q); m.set(y, (m.get(y) || 0) + r.area.reduce((s, a) => s + a, 0)); }
    }
    rowsByYear.set(y, list);
  }
  const at = y => Math.max(from, Math.min(to, y));
  const areaIn = (q, y) => area.get(q)?.get(y) || 0;
  // What a state's rows hold in the nearest years before and after y whose area differs from y's (the nearest in each
  // direction, at most GAP years away): [before, after], either null.
  const nearCache = new Map();
  const near = (q, y) => {
    const k = q + '@' + y;
    if (!nearCache.has(k)) {
      const a = areaIn(q, y);
      const other = d => { for (let z = y + d; z >= from && z <= to && Math.abs(z - y) <= GAP; z += d) { const v = areaIn(q, z); if (v > 0 && Math.abs(v - a) > 0.01 * Math.max(a, v)) return v; } return null; };
      nearCache.set(k, [other(-1), other(1)]);
    }
    return nearCache.get(k);
  };
  // A fragment: its rows that year hold less than FRAGMENT of what they hold in the nearest different years (the smaller
  // of the two), so a row that keeps an island when its state is occupied (Jan Mayen, the Faroes, Tianjin) is one, and
  // Denmark of 1945 (without Greenland, as in 1939) is not.
  const fragment = (q, y) => {
    y = at(y);
    const a = areaIn(q, y), vs = near(q, y).filter(v => v != null);
    return a > 0 && vs.length > 0 && a < FRAGMENT * Math.min(...vs);
  };
  // Whole: drawn that year and no fragment. The war's contested state (`theatre`) must also hold WHOLE of what its rows
  // hold in the nearest different years (the larger), so Bosnia and Herzegovina's row of 1992–95, a quarter of its row
  // of 1996 on, is not whole; a state on a side is drawn as its own row gives it (Japan's of 1926–31, before Manchuria).
  const whole = (q, y, theatre = false) => {
    const a = areaIn(q, y); if (!(a > 0) || fragment(q, y)) return false;
    const vs = near(q, y).filter(v => v != null);
    return !theatre || !vs.length || a >= WHOLE * Math.max(...vs);
  };
  // A state's reference land for year y: its rows' polygons in the nearest year they are whole.
  const refCache = new Map();
  function ref(q, y, theatre = false) {
    y = at(y);
    const k = q + '@' + y + (theatre ? 't' : '');
    if (refCache.has(k)) return refCache.get(k);
    let out = null;
    for (let d = 0; d <= GAP && !out; d++) for (const z of d ? [y - d, y + d] : [y]) {
      if (out || z < from || z > to || !whole(q, z, theatre)) continue;
      const polys = [], boxes = [], areas = [];
      for (const { r, q: p } of rowsByYear.get(z)) if (p === q) r.polys.forEach((poly, i) => { polys.push(poly); boxes.push(r.box[i]); areas.push(r.area[i]); });
      const total = areas.reduce((s, a) => s + a, 0);
      out = { year: z, polys, boxes, total, box: boxes.reduce((b, x) => [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])], [Infinity, Infinity, -Infinity, -Infinity]),
        points: polys.flatMap((poly, i) => samples(poly, areas[i], areas[i] / total > 0.05 ? 14 : 6)) };
    }
    refCache.set(k, out);
    return out;
  }
  const inRef = (pt, rf) => rf.polys.some((p, i) => inBox(pt, rf.boxes[i]) && inPoly(pt, p));
  const sampleCache = new Map();
  const samplesOf = (r, i) => { const k = r.p.id + '#' + i; if (!sampleCache.has(k)) sampleCache.set(k, samples(r.polys[i], r.area[i], 10)); return sampleCache.get(k); };

  /**
   * One year of a war: `qs`, the war's states taking part that year (places.mjs warStatesIn), `theatre` its contested
   * states. Returns { parts, left,
   * inside }: the states drawn only as a fragment; [row id, [polygon indexes], Q, reference year] drawn uncoloured; and
   * [Q, the place (or row:<id>) whose coloured polygon holds a quarter or more of its land, that row's id].
   */
  function year(y, qs, theatre = []) {
    const b = at(y), rows = rowsByYear.get(b) || [];
    const parts = [...qs].filter(q => fragment(q, b)).sort((p, q) => +p.slice(1) - +q.slice(1));
    const left = new Map(); // row id → { idx: Set, q, ry }
    const mark = (r, i, q, ry) => { const e = left.get(r.p.id) || left.set(r.p.id, { idx: new Set(), q, ry }).get(r.p.id); e.idx.add(i); };
    for (const q of parts) for (const { r, q: p } of rows) if (p === q) r.polys.forEach((_, i) => mark(r, i, q, b));
    const refs = [...qs].map(q => [q, ref(q, b, theatre.includes(q))]).filter(([, rf]) => rf);
    for (const { r, q: x } of rows) {
      if (parts.includes(x)) continue;
      const own = x ? areaIn(x, b) : r.area.reduce((s, a) => s + a, 0);
      r.polys.forEach((_, i) => {
        if (left.get(r.p.id)?.idx.has(i)) return;
        for (const [q, rf] of refs) {
          if (q === x || !meets(r.box[i], rf.box) || !(r.area[i] / rf.total > r.area[i] / own)) continue;
          const pts = samplesOf(r, i);
          const share = pts.reduce((s, [pt, w]) => s + (inRef(pt, rf) ? w : 0), 0) / r.area[i];
          if (share >= SHARE_IN) { mark(r, i, q, rf.year); return; }
        }
      });
    }
    // Where each war state's reference land lies, by its points: in a coloured polygon of another place (a point in the
    // state's own row that year is its own).
    const cells = new Map(), cell = (x, y) => `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
    for (const { r, q: x } of rows) r.polys.forEach((p, i) => {
      const bx = r.box[i];
      for (let cx = Math.floor(bx[0] / 10); cx <= Math.floor(bx[2] / 10); cx++) for (let cy = Math.floor(bx[1] / 10); cy <= Math.floor(bx[3] / 10); cy++) {
        const k = `${cx},${cy}`; (cells.get(k) || cells.set(k, []).get(k)).push({ r, x, i });
      }
    });
    const inside = [];
    for (const [q, rf] of refs) {
      const held = new Map();
      for (const [pt, w] of rf.points) {
        const hits = (cells.get(cell(...pt)) || []).filter(({ r, i }) => inBox(pt, r.box[i]) && inPoly(pt, r.polys[i]));
        if (!hits.length || hits.some(h => h.x === q)) continue;
        const h = hits.find(({ r, i }) => !left.get(r.p.id)?.idx.has(i));
        if (h) { const e = held.get(h.r.p.id) || held.set(h.r.p.id, { key: h.x || `row:${h.r.p.id}`, w: 0 }).get(h.r.p.id); e.w += w; }
      }
      for (const [id, e] of [...held].sort((m, n) => n[1].w - m[1].w)) if (e.w >= INSIDE * rf.total) inside.push([q, e.key, id]);
    }
    return {
      parts,
      left: [...left].map(([id, e]) => [id, [...e.idx].sort((m, n) => m - n), e.q, e.ry]).sort((m, n) => (m[0] < n[0] ? -1 : 1)),
      inside: inside.sort((m, n) => +m[0].slice(1) - +n[0].slice(1)),
    };
  }
  return { year, fragment, whole, ref, areaIn, near, bordersTo: to };
}
