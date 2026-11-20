/* The Omni-Map's layers of stage S5c, pure (PRP-SCHOLAR-USP-DESIGN.md 4.2): what omni/lib/layer-view.js needs to read
   a layer split by years (the Volatility score, UCDP's events in cells, the calendars' events), as rows and series the
   S5a and S5b drawing already knows. No DOM, no fetch.
     splitFile(index, year)       the file of a split layer's index that holds the year, or null
     gviSeries(doc)               a year of the Volatility score (vm-gvi/1) as a by-country series of one value, the last
                                  day held of the year
     cellRows(doc, { wars })      a year of UCDP's events (vm-ged-cells/1) as point rows: a cell, or a country, by type
                                  of violence and war, its months summed; each with its events and best, low and high deaths
     calendarRows(doc)            a decade of the calendars' events (vm-layer/1) as point rows, the expected ones hollow
     cellOf / cellCentre          a 0.5° cell's index and centre (row 0 at 90° N, column 0 at 180° W)
   A cell, a country row and a calendar event name no actor, side or person beyond what its own source titles it. */

export const GED_DEG = 0.5, GED_COLS = 720;
export const cellOf = (lon, lat, deg = GED_DEG, cols = GED_COLS) => Math.min(180 / deg - 1, Math.floor((90 - lat) / deg)) * cols + Math.min(cols - 1, Math.floor((lon + 180) / deg));
export const cellCentre = (cell, deg = GED_DEG, cols = GED_COLS) => [-180 + (cell % cols) * deg + deg / 2, 90 - Math.floor(cell / cols) * deg - deg / 2];
export const TYPE_NAMES = { 0: 'every type (candidate events are not split by type)', 1: 'state-based', 2: 'non-state', 3: 'one-sided' };

/** The file of a split layer's index that holds a year: { year } or { from, to } entries. */
export function splitFile(index, year) {
  return (index?.files || []).find(f => (Number.isInteger(f.year) ? f.year === year : f.from <= year && year <= f.to)) || null;
}

/** A year of the Volatility score as a series of one value a country: the last day held of the year. */
export function gviSeries(doc) {
  const i = (doc?.days?.length ?? 0) - 1, values = {};
  for (const [iso, v] of Object.entries(doc?.values || {})) values[iso] = [i >= 0 ? v[i] ?? null : null];
  const cov = Object.fromEntries(Object.entries(doc?.cov || {}).map(([iso, c]) => [iso, c[i] || '-']));
  return { indicator: 'GVI', years: [doc?.year], values, names: doc?.names || {}, aggregates: {}, built: doc?.built, day: doc?.days?.[i] || null, method: doc?.methods?.[i] || null, cov, lastupdated: doc?.days?.[i] || '' };
}

const fmtLat = v => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`, fmtLon = v => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'E' : 'W'}`;
/** A year of UCDP's events as point rows. A cell row is at its cell's centre; a country row (events UCDP knows only to a
    province or wider, and the candidate events) is placed at its country by ISO3, or by Q-id for a state not of today,
    and drawn hollow. Listed rows (known only to the country) are counted, never drawn: { rows, listed }. */
export function cellRows(doc) {
  const wars = doc?.wars || [], year = doc?.year, out = new Map();
  const add = (key, base, r) => {
    const x = out.get(key) || { ...base, n: 0, best: 0, low: 0, high: 0, months: [], byMonth: {} };
    x.n += r[3]; x.best += r[4]; x.low += r[5] ?? 0; x.high += r[6] ?? 0;
    if (!x.months.includes(r[1])) x.months.push(r[1]);
    // V8 (S5b/S5c review): each month's own counts, so a bundle row is a cell (or country) and a month, as the file holds it.
    const m = (x.byMonth[r[1]] ||= { n: 0, best: 0, low: 0, high: 0 });
    m.n += r[3]; m.best += r[4]; m.low += r[5] ?? 0; m.high += r[6] ?? 0;
    out.set(key, x);
  };
  const ws = r => (r[7] || []).map(i => wars[i]).filter(Boolean);
  for (const r of doc?.cells || []) {
    const w = ws(r), key = `c${r[0]}-t${r[2]}${w.length ? `-${w.join('+')}` : ''}`, pt = cellCentre(r[0], doc.deg || GED_DEG, doc.cols || GED_COLS);
    add(key, { id: key, kind: 'cell', cell: r[0], pt, t: String(r[2]), w, sortYear: year, hollow: false }, r);
  }
  for (const r of doc?.country || []) {
    const w = ws(r), key = `k${r[0]}-t${r[2]}${w.length ? `-${w.join('+')}` : ''}`, place = /^[A-Z]{3}$/.test(r[0]) ? { iso3: r[0] } : /^Q\d+$/.test(r[0]) ? { q: r[0] } : null;
    add(key, { id: key, kind: 'country', key: r[0], place, t: String(r[2]), w, sortYear: year, hollow: true }, r);
  }
  const cand = doc?.status === 'candidate';
  const rows = [...out.values()].map(x => {
    // A candidate row is UCDP Candidate's count for the country and month, not GED's events known to a province (V8).
    const where = x.kind === 'cell' ? `the 0.5° cell at ${fmtLat(x.pt[1])}, ${fmtLon(x.pt[0])}` : cand ? `${x.key} (UCDP Candidate’s count for the country)` : `${x.key}, known to a province or wider`;
    const deaths = cand ? `${deathWords(x.best)} (best)` : `${deathWords(x.best)} (best; ${x.low} to ${x.high})`;
    const months = x.months.sort((a, b) => a - b);
    return { ...x, months, value: x.n, whenText: monthsText(months, year), label: `${x.n} ${x.n === 1 ? 'event' : 'events'} in ${where}, ${TYPE_NAMES[x.t] || x.t}: ${deaths}`, measure: `events; ${deaths}` };
  // The latest last: a legend lists the last forty, the latest month first.
  }).sort((a, b) => a.months.at(-1) - b.months.at(-1) || a.n - b.n || String(a.id).localeCompare(String(b.id)));
  const listedRows = (doc?.listed || []).map(r => ({ t: String(r[2]), w: ws(r), n: r[3] }));
  const listed = listedRows.reduce((s, r) => s + r.n, 0);
  return { rows, listed, listedRows };
}
export const deathWords = n => `${n} ${n === 1 ? 'death' : 'deaths'}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A row's months in words: "March 2015", or "2015, in 4 months from March to November". */
export function monthsText(months, year) {
  if (!months?.length) return String(year);
  if (months.length === 1) return `${MONTHS[months[0] - 1]} ${year}`;
  return `${year}, in ${months.length} months from ${MONTHS[months[0] - 1]} to ${MONTHS[months.at(-1) - 1]}`;
}

/** A decade of the calendars' events as point rows: each at its country by ISO3, the expected ones hollow. */
export function calendarRows(doc) {
  return (doc?.rows || []).map(r => ({ ...r, hollow: !!r.expected }));
}
