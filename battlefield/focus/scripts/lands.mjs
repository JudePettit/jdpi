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
//    over Oman): the United States' part over South Vietnam, never Czechoslovakia inside Austria-Hungary. A polygon of a
//    war state's row that lies on the land of a place taking no part is drawn uncoloured too (second review X1, 22
//    November 2026: Tokyo in the United States' row of 1946–51 is Japan's, never the United States'), the land being
//    the other place's in its whole years both before and after (each within GAP), smaller than the war state's or (for a speck, wholly on it) larger; where both rows draw it that
//    year, the one that keeps it (`whose`); the other place's land is read on its main rows only, and never on a row or
//    place listed below (MAIN_ROW, NOT_REFERENCE, NOT_HOLDER). Each `left` entry names its own holder and reference
//    year, so one row can leave Norway's land, and Yugoslavia's, each under its own name (second review X5), and is
//    marked where only part of the polygon lies on that land (ALL; third review R1).
// 3. Cliopatria's rows are dissolved shapes: a land joined to its holder (France inside Germany in 1942, Serb-held
//    Bosnia inside Serbia-Montenegro, Burma inside the British Raj) is in the same polygon and cannot be cut out without
//    drawing a border of another year, which VM never does. Where a quarter (INSIDE) or more of a war state's reference
//    land lies in a polygon of another place that is drawn coloured, the war file says so (`inside`, [state, place, row]), and
//    the page names it under the map.
// Areas are worked on the plane of longitude and latitude, each polygon scaled by the cosine of its mean latitude, and
// shares by points on a grid inside each polygon: good enough for shares of a half and a quarter, never drawn.
const FRAGMENT = 0.1, WHOLE = 0.5, SHARE_IN = 0.5, INSIDE = 0.25, GAP = 12;
// A polygon left uncoloured lies wholly on its holder's land when ALL (nine tenths) or more of it does; one that lies
// there only in part is marked so (a fifth element, 1, in its `left` entry) and the page says only part of the shape is
// the holder's (third review R1: Japan's polygon over Timor in 1943, half Portugal's, half the Netherlands' Indies).
const ALL = 0.9;
// Shares are sums of sample weights, so nine tenths exactly can come out a hair under (0.8999999999999999): compare
// against ALL less this (third read, 22 November 2026).
const ALL_BUT = ALL - 1e-9;
// The land a place taking no part is read on (rule 2's second half, and `whose`) is only its main rows': each holding a
// tenth (MAIN_ROW) or more of what its rows hold that year. A lesser row the crosswalk files under it is no ground for
// naming it a land's holder: Cliopatria's "Estado Novo" rows of 1979–2024 (cl-508df3f28d, cl-b16dfbb288) are Cabinda
// alone, Angola's land, which the Battlefield's crosswalk keys to Portugal (Q45) beside Portugal's own row.
const MAIN_ROW = 0.1;
// Rows the crosswalk files under a place that are not that place's land alone, so never its reference land in that
// rule (fixer 2, 22 November 2026; places.json is not changed):
//   cl-bdc9ff6cf8  "Republic of Cabo Verde", 1976–2023: Cape Verde's islands and the Comoros (with Mayotte), keyed to
//                  Cape Verde (Q1011); France's row of 1991 over the Comoros and Mayotte would be named Cape Verde's.
const NOT_REFERENCE = new Set(['cl-bdc9ff6cf8']);
// Places the crosswalk gives to Cliopatria's rows of a state's dependencies, not a state of their own: never named a
// land's holder in that rule. Q8680, "British Colonial Empire" (1926–1999: British colonies, and Australia's Papua and
// New Guinea, which Cliopatria files with them); Q46395, "British Overseas Territories" (2000–2024: Gibraltar and the
// rest, the United Kingdom's own).
const NOT_HOLDER = new Set(['Q8680', 'Q46395']);

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
  // A place's land in year z: its rows' polygons that year, whole or not; `main`, its main rows' only, none of
  // NOT_REFERENCE (MAIN_ROW).
  const landCache = new Map();
  function landOf(q, z, main = false) {
    const k = q + '@' + z + (main ? 'm' : '');
    if (landCache.has(k)) return landCache.get(k);
    const polys = [], boxes = [], areas = [], all = areaIn(q, z);
    for (const { r, q: p } of rowsByYear.get(z) || []) {
      if (p !== q || (main && (NOT_REFERENCE.has(r.p.id) || r.area.reduce((s, a) => s + a, 0) < MAIN_ROW * all))) continue;
      r.polys.forEach((poly, i) => { polys.push(poly); boxes.push(r.box[i]); areas.push(r.area[i]); });
    }
    const total = areas.reduce((s, a) => s + a, 0);
    let points = null; // its sample points, worked out the first time they are asked for (rule 3)
    const out = { year: z, polys, boxes, total, box: boxes.reduce((b, x) => [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])], [Infinity, Infinity, -Infinity, -Infinity]),
      get points() { return points || (points = polys.flatMap((poly, i) => samples(poly, areas[i], areas[i] / total > 0.05 ? 14 : 6))); } };
    landCache.set(k, out);
    return out;
  }
  // A state's reference land for year y: its rows' polygons in the nearest year they are whole (`dir` -1 or 1: the
  // nearest such year no later, or no earlier, than y), at most `reach` (GAP) years away.
  const refCache = new Map();
  function ref(q, y, theatre = false, dir = 0, main = false, reach = GAP) {
    y = at(y);
    const k = q + '@' + y + (theatre ? 't' : '') + dir + (main ? 'm' : '') + reach;
    if (refCache.has(k)) return refCache.get(k);
    let out = null;
    for (let d = 0; d <= Math.min(reach, to - from) && !out; d++) for (const z of !d ? [y] : dir ? [y + dir * d] : [y - d, y + d]) {
      if (!out && z >= from && z <= to && whole(q, z, theatre)) out = landOf(q, z, main);
    }
    if (out && !out.total) out = null;
    refCache.set(k, out);
    return out;
  }
  const inRef = (pt, rf) => rf.polys.some((p, i) => inBox(pt, rf.boxes[i]) && inPoly(pt, p));
  const shareOf = (smp, rf) => { let s = 0, t = 0; for (const [pt, w] of smp) { t += w; if (inRef(pt, rf)) s += w; } return t > 0 ? s / t : 0; };
  /**
   * Whose land it is where two places' rows draw the same land in year y (Cliopatria's Britain of 1969–2023 over Oman,
   * its British Colonial Empire of 1947–57 over Newfoundland, part of Canada from 1949): of `a` and `b`, the one whose
   * rows alone hold it (SHARE_IN of `poly`'s area) in the latest year that both are drawn and either does: the one
   * that keeps it. Oman, alone in 2024; Canada, alone from 1958; Norway, not Germany, whose rows draw it with Norway's
   * in 1940 and alone in 1941–44; South Vietnam, alone in 1956–66, not the United States, whose row holds it to 2005
   * when South Vietnam's rows are gone. Each place's land is its main rows' (MAIN_ROW, NOT_REFERENCE): Cabinda is
   * Angola's, not Portugal's. Null if neither ever holds it alone.
   */
  function whose(a, b, poly, y) {
    const smp = samples(poly, polyArea(poly), 8);
    for (let z = to; z >= from; z--) {
      if (z === y || !(areaIn(a, z) > 0 && areaIn(b, z) > 0)) continue;
      const ha = shareOf(smp, landOf(a, z, true)) >= SHARE_IN, hb = shareOf(smp, landOf(b, z, true)) >= SHARE_IN;
      if (ha !== hb) return ha ? a : b;
    }
    return null;
  }
  const sampleCache = new Map();
  const samplesOf = (r, i) => { const k = r.p.id + '#' + i; if (!sampleCache.has(k)) sampleCache.set(k, samples(r.polys[i], r.area[i], 10)); return sampleCache.get(k); };
  // The share of a polygon ({ poly, area, box, smp }) that lies inside a reference land, and whether its box meets it.
  const shareBy = (s, rf) => s.smp.reduce((t, [pt, w]) => t + (inRef(pt, rf) ? w : 0), 0) / s.area;
  const boxMeets = (b, rf) => meets(b, rf.box) && rf.boxes.some(x => meets(b, x));
  // Each place's reference lands for year b on its main rows: the nearest year it is whole no later than b and the
  // nearest no earlier, each within GAP (third review R2, 22 November 2026: a farther side at any distance was tried and
  // dropped, as it named Saaremaa Estonia's in the Soviet Union's rows of 1941 and 1980–89 while the mainland, merged
  // into the Soviet polygon, stayed Soviet). A place with one only is never a holder: land that never comes back to its earlier holder changed hands and
  // stays the row's (Kaliningrad in the Soviet Union's rows from 1945, Germany's land of 1938; Crimea in Russia's row of
  // 2024, Ukraine's of 2023; Goa, the Dodecanese, South Sakhalin), and a land is never named a successor's (Russia's of
  // 1992 in the Soviet Union's row of 1980–89) or a regime's that has gone (Vichy France's of 1943 in the Fourth
  // Republic's). Muscat is in Britain's row alone from 1920 to 1972 (Oman's of 1946 does not hold it; its of 1973 does),
  // so it is not named Oman's in 1950–53.
  const othersCache = new Map();
  const othersOf = b => othersCache.get(b) || othersCache.set(b, [...area.keys()].filter(q => !NOT_HOLDER.has(q))
    .map(q => [q, ref(q, b, false, -1, true), ref(q, b, false, 1, true)])
    .filter(([, p, n]) => p && n)).get(b);
  // Rule 2 for a place taking no part: the place, not x (nor one in `skip`), on whose land a polygon of x's row lies in
  // year b, { q, ry, share }, or null. The polygon lies mostly (SHARE_IN) inside the place's reference land before and
  // after; that land is smaller than x's own, or (third review R2) the polygon lies wholly (ALL) on it and is less than
  // FRAGMENT of x's land (Germany's row of 1939 over Mallorca, Spain's); where the place's own row draws it that year,
  // the place keeps it (`whose`).
  function onOther(x, s, b, skip = null) {
    const own = areaIn(x, b);
    for (const [q, p, n] of othersOf(b)) {
      if (q === x || skip?.has(q) || !boxMeets(s.box, p) || !boxMeets(s.box, n)) continue;
      const sp = shareBy(s, p), sn = n === p ? sp : shareBy(s, n);
      if (sp < SHARE_IN || sn < SHARE_IN) continue;
      if (!(p.total < own && n.total < own) && !(Math.min(sp, sn) >= ALL_BUT && s.area < FRAGMENT * own)) continue;
      if (p.year === b && whose(x, q, s.poly, b) !== q) continue;
      const ry = b - p.year <= n.year - b ? p.year : n.year;
      return { q, ry, share: ry === p.year ? sp : sn };
    }
    return null;
  }
  // For the theatre boxes (rules.mjs stateBoxes, third review R3): the place on whose land a polygon of x's row lies in
  // year y by rule 2, a place in `skip` (the war's states) aside, or null; `key` names the polygon, so its points are
  // worked out once.
  const polyCache = new Map();
  function holder(x, poly, y, key, skip = null) {
    let s = polyCache.get(key);
    if (!s) { const a = polyArea(poly); let smp = null; s = { poly, area: a, box: boxOf(poly[0]), get smp() { return smp || (smp = samples(poly, a, 10)); } }; polyCache.set(key, s); }
    return s.area > 0 ? onOther(x, s, at(y), skip)?.q || null : null;
  }

  /**
   * One year of a war: `qs`, the war's states taking part that year (places.mjs warStatesIn), `theatre` its contested
   * states. Returns { parts, left,
   * inside }: the states drawn only as a fragment; [row id, [polygon indexes], Q, reference year] drawn uncoloured; and
   * [Q, the place (or row:<id>) whose coloured polygon holds a quarter or more of its land, that row's id].
   */
  // The share of a row's polygon that lies inside a reference land.
  const shareIn = (r, i, rf) => samplesOf(r, i).reduce((s, [pt, w]) => s + (inRef(pt, rf) ? w : 0), 0) / r.area[i];
  function year(y, qs, theatre = []) {
    const b = at(y), rows = rowsByYear.get(b) || [];
    qs = new Set(qs);
    const parts = [...qs].filter(q => fragment(q, b)).sort((p, q) => +p.slice(1) - +q.slice(1));
    // Each polygon left uncoloured keeps its own holder and reference year (a row can hold Libya, Norway and Yugoslavia
    // at once): entries by row, holder and year; `marked` the polygons of each row already left.
    const left = new Map(), marked = new Map(); // `${row id} ${Q} ${year} ${part}` → { id, idx: Set, q, ry, part }; row id → Set
    const isMarked = (r, i) => !!marked.get(r.p.id)?.has(i);
    const mark = (r, i, q, ry, part = false) => {
      const k = `${r.p.id} ${q} ${ry} ${part}`, e = left.get(k) || left.set(k, { id: r.p.id, idx: new Set(), q, ry, part }).get(k);
      e.idx.add(i); (marked.get(r.p.id) || marked.set(r.p.id, new Set()).get(r.p.id)).add(i);
    };
    for (const q of parts) for (const { r, q: p } of rows) if (p === q) r.polys.forEach((_, i) => mark(r, i, q, b));
    const refs = [...qs].map(q => [q, ref(q, b, theatre.includes(q))]).filter(([, rf]) => rf);
    for (const { r, q: x } of rows) {
      if (parts.includes(x)) continue;
      const own = x ? areaIn(x, b) : r.area.reduce((s, a) => s + a, 0);
      r.polys.forEach((_, i) => {
        if (isMarked(r, i)) return;
        for (const [q, rf] of refs) {
          if (q === x || !meets(r.box[i], rf.box) || !(r.area[i] / rf.total > r.area[i] / own)) continue;
          const s = shareIn(r, i, rf);
          if (s >= SHARE_IN) { mark(r, i, q, rf.year, s < ALL_BUT); return; }
        }
      });
    }
    // Rule 2 for a place taking no part (second review X1): a polygon of a war state's row (one drawn in a side's
    // colour) that lies on another place's land is left uncoloured too, so no state that takes no part is coloured as
    // a side (onOther). The land is the other's when the polygon lies mostly (SHARE_IN) inside its reference land both
    // in the nearest year it is whole no later than this one and in the nearest no earlier (Tokyo, Japan's in 1945 and
    // 1958, in the United States' row of 1946–51), and that land is smaller than the war state's own: a land a successor
    // holds only later is not another's (Taiwan in the Republic of China's row of 1946–49, Japan's in 1945 and not
    // after). A polygon lying wholly
    // (ALL) on the other's land and less than FRAGMENT of the war state's is the other's whichever is larger (Mallorca,
    // Spain's, in Germany's row of 1939). Where the other place's own row draws the same land this year, it is the
    // other's only if it keeps it (`whose`): Oman, not Britain; Canada, not the British Colonial Empire, over
    // Newfoundland. The other place's land is its main rows' only (MAIN_ROW, NOT_REFERENCE), and a grouping of a
    // state's dependencies is never the other place (NOT_HOLDER), so no land is named a holder's falsely.
    for (const { r, q: x } of rows) {
      if (!x || !qs.has(x) || parts.includes(x)) continue;
      r.polys.forEach((poly, i) => {
        if (isMarked(r, i)) return;
        const o = onOther(x, { poly, area: r.area[i], box: r.box[i], get smp() { return samplesOf(r, i); } }, b, qs);
        if (o) mark(r, i, o.q, o.ry, o.share < ALL_BUT);
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
        const h = hits.find(({ r, i }) => !isMarked(r, i));
        if (h) { const e = held.get(h.r.p.id) || held.set(h.r.p.id, { key: h.x || `row:${h.r.p.id}`, w: 0 }).get(h.r.p.id); e.w += w; }
      }
      for (const [id, e] of [...held].sort((m, n) => n[1].w - m[1].w)) if (e.w >= INSIDE * rf.total) inside.push([q, e.key, id]);
    }
    return {
      parts,
      left: [...left.values()].map(e => [e.id, [...e.idx].sort((m, n) => m - n), e.q, e.ry, ...(e.part ? [1] : [])])
        .sort((m, n) => (m[0] !== n[0] ? (m[0] < n[0] ? -1 : 1) : m[1][0] - n[1][0])),
      inside: inside.sort((m, n) => +m[0].slice(1) - +n[0].slice(1)),
    };
  }
  return { year, fragment, whole, ref, whose, holder, areaIn, near, bordersTo: to };
}
