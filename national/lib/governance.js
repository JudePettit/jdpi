// National Analysis: the World Bank's governance scores with their own 90% range (the Worldwide Governance Indicators'
// score on its 0–100 scale and the lower and upper bounds of its 90% confidence interval). One place for the job that
// writes national/data/governance/ (national/scripts/indicators.mjs, governanceFiles), the page (q/national.html loads
// it with import()) and the tests. A pure ES module: no file or network access, no dependencies.
//
// The bounds exist only for the score (GOV_WGI_xx.SC, SC_LB and SC_UB: the World Bank's source 3, its series list read
// 25 November 2026), not for the −2.5 to 2.5 estimate (GOV_WGI_xx.EST) the rest of the page shows, which has a standard
// error instead. So the range is drawn on the score, and the page says where it moves from the estimate to the score.
//
// A layer file: { layer, v, indicator, codes, label, years, countries, values, … }. values[k] is the k-th country's
// list, one entry per year of `years` (which skips the years the World Bank published none: 1997, 1999 and 2001):
// [score, lower, upper], or [score] where the Bank gives a score with no bound, or null where it gives no score. A
// country with no score in any year is null. Nothing is filled or carried forward.

export const LAYER = 'wgi-range';
// The API serves each value with seven decimals and gives its own display precision with every row ("decimal": 1 for
// all eighteen series, read 26 November 2026). VM keeps that one decimal, as the source rounds them, and the job stops
// if a row gives another (national/scripts/indicators.mjs). Ranks and overlaps are judged on these rounded figures, so
// two ends within a tenth of a point of each other may fall the other way on the Bank's unrounded ones.
export const DECIMALS = 1;
export const round = (x, d = DECIMALS) => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 10 ** d) / 10 ** d);

// The three series of one indicator, from its estimate's code (GOV_WGI_PV.EST → GOV_WGI_PV.SC, .SC_LB, .SC_UB).
export const rangeCodes = est => { const k = String(est).replace(/\.EST$/, ''); return { score: `${k}.SC`, lower: `${k}.SC_LB`, upper: `${k}.SC_UB` }; };
// The file a layer is written to, under national/data/: governance/GOV_WGI_PV.json.
export const fileOf = est => `governance/${String(est).replace(/\.EST$/, '')}.json`;

// One indicator's layer from the API's rows (rows.score, rows.lower, rows.upper: the World Bank's own rows,
// { countryiso3code, date, value }) for the countries given (ISO3, in index.json's order). Rows for anything else (the
// aggregates, a code not in the list) are left out. A bound with no score is not kept: a range needs its score.
// The economies the Bank scores that are not in the list (it serves Taiwan, Jersey, Anguilla and a few more with no
// ISO3 code) are named in `outside`, [{ name, years }] under the names the Bank gives, so the page can say what its
// ranking leaves out; their figures are not kept.
export function rangeLayer(spec, rows, countries, meta = {}) {
  const at = new Map(countries.map((c, k) => [c, k]));
  const cells = new Map(); // `${k}|${year}` → [score, lower, upper]
  const away = new Map(); // a scored economy not in the list → the years it has a score
  const put = (list, i) => {
    for (const r of list || []) {
      const k = at.get(r?.countryiso3code), y = +r?.date, v = round(r?.value);
      if (k == null && i === 0 && Number.isInteger(y) && v != null) {
        const name = String(r?.country?.value || r?.countryiso3code || '').trim();
        if (name) { if (!away.has(name)) away.set(name, new Set()); away.get(name).add(y); }
      }
      if (k == null || !Number.isInteger(y) || v == null) continue;
      const key = `${k}|${y}`;
      if (!cells.has(key)) cells.set(key, [null, null, null]);
      cells.get(key)[i] = v;
    }
  };
  put(rows.score, 0); put(rows.lower, 1); put(rows.upper, 2);
  const years = [...new Set([...cells].filter(([, c]) => c[0] != null).map(([key]) => +key.split('|')[1]))].sort((a, b) => a - b);
  const values = countries.map((_, k) => {
    const list = years.map(y => {
      const c = cells.get(`${k}|${y}`);
      if (!c || c[0] == null) return null;
      return c[1] != null && c[2] != null ? [c[0], c[1], c[2]] : [c[0]];
    });
    return list.some(Boolean) ? list : null;
  });
  const codes = rangeCodes(spec.est);
  const outside = [...away].map(([name, ys]) => ({ name, years: [...ys].filter(y => years.includes(y)).sort((a, b) => a - b) })).filter(o => o.years.length).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { layer: LAYER, v: 1, indicator: spec.est, codes, label: spec.label, scale: 'governance score, 0 to 100 (100 the best)', interval: 0.9, decimals: DECIMALS, ...meta, years, countries, values, outside };
}
// The economies the Bank scores in a year that the layer's list leaves out: their names, as the Bank gives them.
export const outsideIn = (L, year) => (L?.outside || []).filter(o => o.years.includes(year)).map(o => o.name);

// The k-th country's range in a year: { score, lower, upper } (lower and upper null where the Bank gives no bound), or
// null where it gives no score that year.
export function rangeAt(L, k, year) {
  const j = L?.years ? L.years.indexOf(year) : -1, c = j < 0 || k == null ? null : L.values?.[k]?.[j];
  if (!c) return null;
  return { score: c[0], lower: c.length >= 3 ? c[1] : null, upper: c.length >= 3 ? c[2] : null };
}
// The k-th country's every year: [[year, score, lower, upper], …], lower and upper null where there is no bound.
export function rangeSeries(L, k) {
  const row = k == null ? null : L?.values?.[k];
  if (!row) return [];
  return L.years.map((y, j) => (row[j] ? [y, row[j][0], row[j].length >= 3 ? row[j][1] : null, row[j].length >= 3 ? row[j][2] : null] : null)).filter(Boolean);
}
// The year the file holds for a year asked for: that year, else the newest earlier one it holds (the indicators were
// published every two years until 2002), else null. Latest (Infinity, or anything past the last) is the newest year.
export function yearFor(L, want) {
  if (!L?.years?.length) return null;
  const ys = L.years.filter(y => y <= want);
  return ys.length ? ys.at(-1) : null;
}

// Every country with a score in a year, best first: [{ k, iso3, score, lower, upper, rank }]. Ties share a rank (1, 2,
// 2, 4) and are listed by name (names: ISO3 → name; else by code).
export function ranked(L, year, names = new Map()) {
  const name = iso => names.get?.(iso) ?? names[iso] ?? iso;
  const list = (L?.countries || []).map((iso3, k) => ({ k, iso3, ...(rangeAt(L, k, year) || {}) })).filter(x => x.score != null);
  list.sort((a, b) => b.score - a.score || String(name(a.iso3)).localeCompare(String(name(b.iso3)), 'en'));
  list.forEach((x, i) => { x.rank = i && list[i - 1].score === x.score ? list[i - 1].rank : i + 1; });
  return list;
}
// Whether two ranges overlap: true or false, or null where either has no bound (or no score). Touching ends overlap.
export function overlaps(a, b) {
  if (!a || !b || a.lower == null || a.upper == null || b.lower == null || b.upper == null) return null;
  return a.lower <= b.upper && b.lower <= a.upper;
}
// How sure a country's rank is. count: the countries whose range overlaps its own (itself included), which the data
// cannot tell it apart from. from and to: the ranks it would take with its score anywhere within its own range, every
// other country held at its score (from: at its upper bound, to: at its lower; ties share a rank). Based on its own
// range alone, so one other country with a very wide range does not stretch it. Null where it has no bound or is not
// in the list.
export function rankSpan(list, iso3) {
  const me = list.find(x => x.iso3 === iso3);
  if (!me || overlaps(me, me) == null) return null;
  const others = list.filter(x => x !== me);
  return {
    from: 1 + others.filter(x => x.score > me.upper).length,
    to: 1 + others.filter(x => x.score > me.lower).length,
    count: 1 + others.filter(x => overlaps(me, x)).length,
  };
}
// Per year, how many countries have a score with its range and how many a score alone: [{ year, ranged, scoreOnly }].
export function countsByYear(L) {
  return (L?.years || []).map((year, j) => {
    let ranged = 0, scoreOnly = 0;
    for (const row of L.values || []) { const c = row?.[j]; if (!c) continue; if (c.length >= 3) ranged++; else scoreOnly++; }
    return { year, ranged, scoreOnly };
  });
}
// An ordinal in words for a rank ("1st", "22nd", "113th").
export const ordinal = n => { const t = n % 100, u = n % 10; return `${n}${t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'}`; };
