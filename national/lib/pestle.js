// National Analysis: the PESTLE rule, in one place for the build (national/scripts/build.mjs and years.mjs), the page
// (q/national.html loads it with import()) and the tests. A pure ES module: no file or network access, no dependencies.
//
// PESTLE pressure is VM's own composite, after Country PESTLE: not a forecast, and not a ranking of how well a country
// is run. For each of the 22 core indicators a value is compared with the country's previous value no more than five
// years before it; a change past the indicator's threshold is improving or worsening. A dimension's pressure is the
// share of its scored indicators worsening; overall pressure is the mean of the dimensions scored; coverage is the share
// of the 22 with a value. Which value and which previous value are compared is the "pick":
//   latestPick       each indicator's newest value, of any year (the page's Latest, as before 16 November 2026)
//   yearPick(Y, 2)   the value of year Y, else the newest from Y-1 or Y-2 (labelled with its own year); anything older
//                    counts as no value, never carried forward
//   periodPick(A, B) the first against the last value inside A…B (the decade view was periodPick(d, d + 9))
// A series is [[year, value], …], ascending, with gaps where the source has none.

export const DIMENSIONS = ['political', 'economic', 'social', 'technological', 'legal', 'environmental'];
export const MAX_AGE = 2; // a year's value may be up to two years older than the year, and says so
export const PREV_WITHIN = 5; // the previous value it is compared with is at most five years before it
export const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// improving, worsening or stable against the indicator's threshold; null when either value is missing or the
// indicator has no better direction (a context metric).
export function movement(ind, from, to) {
  if (!from || !to || ind.better == null) return null;
  const change = to[1] - from[1];
  if (Math.abs(change) <= ind.threshold) return 'stable';
  return (change > 0) === (ind.better === 'up') ? 'improving' : 'worsening';
}

// The score of one country (s: code → series) under a pick. items[code] = [year, value, previous year, change, movement].
// dims: how many of the six dimensions have a score (fewer than six is "partial").
export function scorePeriod(s, pick, indicators, dimensions = DIMENSIONS) {
  const items = {}, dims = {};
  for (const ind of indicators) {
    const pts = s[ind.code] || [];
    const [from, to] = pick(pts);
    const mv = movement(ind, from, to);
    if (to) items[ind.code] = [to[0], to[1], from ? from[0] : null, from ? round(to[1] - from[1], 4) : null, mv];
    if (!ind.core || !mv) continue;
    const d = (dims[ind.dimension] ||= { worsening: 0, scored: 0 });
    d.scored++; if (mv === 'worsening') d.worsening++;
  }
  // Each share is rounded once: a dimension's to thousandths as stored, and overall from the unrounded shares (pestle-3,
  // 25 November 2026), not from the rounded ones (which put 63 of 9,765 yearly scores a point out).
  const shares = dimensions.map(k => (dims[k]?.scored ? dims[k].worsening / dims[k].scored : null));
  const pressure = Object.fromEntries(dimensions.map((k, i) => [k, round(shares[i], 3)]));
  const vals = shares.filter(v => v != null);
  const core = indicators.filter(i => i.core);
  return { items, pressure, overall: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null, coverage: round(core.filter(i => items[i.code]).length / core.length, 3), dims: vals.length };
}

const previous = (pts, to) => { for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; if (p[0] < to[0] && p[0] >= to[0] - PREV_WITHIN) return p; if (p[0] < to[0] - PREV_WITHIN) break; } return null; };
export const latestPick = pts => { const to = pts.at(-1); if (!to) return [null, null]; return [previous(pts, to), to]; };
export const decadePick = d => pts => { const inD = pts.filter(p => p[0] >= d && p[0] < d + 10); return inD.length >= 2 ? [inD[0], inD.at(-1)] : [null, inD[0] || null]; };
// Year Y: the newest value at or before Y, if it is no more than maxAge years old (Infinity: Latest's rule up to Y).
export const yearPick = (Y, maxAge = MAX_AGE) => pts => {
  let to = null;
  for (let k = pts.length - 1; k >= 0; k--) if (pts[k][0] <= Y) { to = pts[k]; break; }
  if (!to || to[0] < Y - maxAge) return [null, null];
  return [previous(pts, to), to];
};
// A..B: the first and last values inside the period (B Infinity: to the newest value).
export const periodPick = (A, B) => pts => { const inP = pts.filter(p => p[0] >= A && p[0] <= B); return inP.length >= 2 ? [inP[0], inP.at(-1)] : [null, inP[0] || null]; };
export const scoreYear = (s, Y, indicators, maxAge = MAX_AGE) => scorePeriod(s, yearPick(Y, maxAge), indicators);

// The newest value before a year beyond the limit, for "No value for 2010 (latest earlier value 2006)".
export const earlierYear = (pts, Y) => { for (let k = (pts || []).length - 1; k >= 0; k--) if (pts[k][0] < Y) return pts[k][0]; return null; };

// A ranking: highest first (dir -1) or lowest first (dir 1); no value always last, then by name. Ties keep the order
// given. get(row) → number or null.
export function rank(rows, get, dir = -1, name = r => r.name || '') {
  return rows.map((r, k) => [r, get(r), k]).sort((a, b) => {
    const x = a[1], y = b[1];
    if (x == null && y == null) return String(name(a[0])).localeCompare(String(name(b[0]))) || a[2] - b[2];
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a[2] - b[2];
  }).map(x => x[0]);
}

/* ---------- a period's change, and the countries that rose and fell most (NA-05 review, 16 November 2026) ----------
   FLOOR: a score from fewer than three of the six dimensions is too few values to colour or rank (it is still shown,
   in words). At Latest every score has three or more; in 1981–1990 ten or eleven countries a year rest on one. */
export const FLOOR = 3;
// b − a, rounded (3 decimals: pressure.json's thousandths; 4 for an indicator, as its values are stored), so equal
// changes are equal and ties are settled by name, not by floating-point noise.
export const changeOf = (a, b, d = 3) => (a == null || b == null ? null : round(b - a, d));
// Two scores can be compared, end against end, when both rest on the same dimensions, at least FLOOR of them: a
// change from one dimension to six measures the data's growth, not any change in conditions.
export function comparable(a, b) {
  if (!a || !b || a.overall == null || b.overall == null) return false;
  const has = x => DIMENSIONS.filter(k => x.pressure?.[k] != null);
  const ha = has(a), hb = has(b);
  return ha.length >= FLOOR && ha.length === hb.length && ha.every(k => b.pressure[k] != null);
}
// Rose most · Fell most: rows [{name, d, ok}] (d the change, ok whether its ends can be compared). The n largest each
// way among the comparable, ties by name; more: how many others share the last one's change; apart: how many changes
// were left out as not like for like.
export function movers(rows, n = 6) {
  const live = rows.filter(r => r.d != null && r.d !== 0), ok = live.filter(r => r.ok);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const cut = list => { const top = list.slice(0, n), at = top.length ? top.at(-1).d : null; return { top, at, more: at == null ? 0 : list.slice(n).filter(r => r.d === at).length }; };
  return {
    rose: cut(ok.filter(r => r.d > 0).sort((a, b) => b.d - a.d || byName(a, b))),
    fell: cut(ok.filter(r => r.d < 0).sort((a, b) => a.d - b.d || byName(a, b))),
    apart: live.length - ok.length,
  };
}

/* ---------- the yearly layer (national/data/years/) ----------
   One file per indicator: {layer, v, from, to, countries, values}, values[k] the k-th country's value for each year
   from..to (null: no value; a whole null row: none at all). countries is the same list in every file and in the
   manifest. pressure.json holds each single-year score as integers ×1000 with the number of dimensions scored. */
export function layerOf(seriesByIso, countries, code) {
  let from = Infinity, to = -Infinity;
  for (const iso of countries) for (const [y] of seriesByIso.get(iso)?.[code] || []) { if (y < from) from = y; if (y > to) to = y; }
  if (from > to) return null;
  const values = countries.map(iso => {
    const pts = seriesByIso.get(iso)?.[code] || [];
    if (!pts.length) return null;
    const row = new Array(to - from + 1).fill(null);
    for (const [y, v] of pts) row[y - from] = v;
    return row;
  });
  return { layer: 'wb:' + code, v: 1, from, to, countries, values };
}
// One country's series back out of a layer file: [[year, value], …] with the gaps left out.
export function ptsOf(layer, k) {
  const row = layer?.values?.[k];
  if (!row) return [];
  const out = [];
  for (let i = 0; i < row.length; i++) if (row[i] != null) out.push([layer.from + i, row[i]]);
  return out;
}
export const PRESSURE_FIELDS = ['overall', ...DIMENSIONS, 'coverage', 'dims'];
const enc = v => (v == null ? null : Math.round(v * 1000));
export function pressureRow(x) { return x.overall == null && !x.coverage ? null : [enc(x.overall), ...DIMENSIONS.map(k => enc(x.pressure[k])), enc(x.coverage), x.dims]; }
// A pressure.json cell back to the score's shape: { overall, pressure, coverage, dims }, or null.
export function pressureOf(cell) {
  if (!cell) return null;
  const dec = v => (v == null ? null : v / 1000);
  return { overall: dec(cell[0]), pressure: Object.fromEntries(DIMENSIONS.map((k, i) => [k, dec(cell[i + 1])])), coverage: dec(cell[7]), dims: cell[8] };
}
