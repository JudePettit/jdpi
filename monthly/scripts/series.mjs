// Month by Month: a unit's months, from each store VM publishes, in the one shape the rule reads (monthly/scripts/
// rules.mjs: { m, d, e, sh, top, src, est, prov }). Pure functions; the builder and the tests share them.
//
// Counting, the same wherever VM holds the events themselves (Realtime Battlefield's `series`, War Focus, the per-country
// figures): an event UCDP dates only to a span of days has its deaths shared out over those days (eventMonths, War
// Focus's rule), and it counts as one event in each month its span touches. `sh` is the deaths from events whose span
// runs across more than one month. Realtime Battlefield's older files, without `series`, count each event and its
// deaths in the month it starts: those months carry sh: null, and the rule says it could not check them.
import { eventMonths } from '../../battlefield/focus/scripts/rules.mjs';

const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return out; };
const lastDay = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) : t; };

/**
 * A month series from events: { from, deaths[], events[], shared[], top[] } over the months fromMonth..toMonth.
 * events: [{ d: date_start, de: date_end, best, place, headline, office }]. top[i] is the month's largest event by its
 * deaths in that month: [date_start, deaths this month, place, date_end or null, its whole count, headline, office].
 */
export function seriesFromEvents(events, fromMonth, toMonth) {
  const months = monthsBetween(fromMonth, toMonth), at = new Map(months.map((m, i) => [m, i]));
  const deaths = months.map(() => 0), count = months.map(() => 0), shared = months.map(() => 0), top = months.map(() => null);
  const from = `${fromMonth}-01`, to = lastDay(toMonth);
  for (const e of events) {
    if (!e.d) continue;
    const parts = eventMonths(e.d, e.de || e.d, +e.best || 0, from, to).filter(([m]) => at.has(m));
    for (const [m, n] of parts) {
      const i = at.get(m);
      deaths[i] += n; count[i]++;
      if (parts.length > 1) shared[i] += n;
      if (!top[i] || n > top[i][1]) top[i] = [e.d, n, clip(e.place, 60), e.de && e.de !== e.d ? e.de : null, +e.best || 0, clip(e.headline, 140), clip(e.office, 50)];
    }
  }
  return { from: fromMonth, deaths, events: count, shared, top };
}

const topOf = t => (t ? { date: t[0], n: t[1], place: t[2] || '', end: t[3] || null, whole: t[4] ?? t[1], headline: t[5] || '', office: t[6] || '' } : null);

/** Rows from a published series ({ from, deaths, events, shared, top }), every month from one dataset. */
export function rowsFromSeries(s, { src, prov }) {
  if (!s?.from || !Array.isArray(s.deaths)) return [];
  return monthsBetween(s.from, addMonths(s.from, s.deaths.length - 1)).map((m, i) => ({
    m, d: s.deaths[i] || 0, e: s.events?.[i] || 0, sh: Array.isArray(s.shared) ? (s.shared[i] || 0) : null,
    top: topOf(s.top?.[i]), src, est: false, prov: !!prov,
  }));
}
const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number), t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/** The dataset a candidate-events month comes from: one family per year, since each release revises the whole year. */
export const candidateSrc = year => `UCDP Candidate Events ${year}`;
export const gedSrc = version => `UCDP GED ${version}`;

/**
 * A Realtime Battlefield war's rows. With `series` (written by build-realtime.mjs since 15 November 2026), by the
 * shared rule; without, the page's own monthly figures, each event in the month it starts (sh: null), the largest
 * event from the month's sources.
 */
export function realtimeRows(war, rt) {
  const src = candidateSrc(rt.year), prov = true;
  if (war.series) return rowsFromSeries(war.series, { src, prov });
  return (war.monthly || []).map(x => {
    const s = (x.sources || []).slice().sort((a, b) => b.deaths - a.deaths)[0];
    return { m: x.month, d: x.deaths || 0, e: x.events || 0, sh: null, top: s ? { date: s.date, n: s.deaths, place: clip(s.place, 60), end: null, whole: s.deaths, headline: clip(s.headline, 140), office: clip(s.office, 50) } : null, src, est: false, prov };
  });
}

/**
 * A War Focus war's rows: deaths as War Focus gives them (UCDP GED events shared over their days, or a PRIO or COW
 * total spread over months, flagged `estimated`), events as the clashes it maps in each month (an event over a span
 * counts in each of its months), the largest clash from `top`. Months up to GED's last year are GED's; later ones the
 * candidate events'. A month not complete in the data (an ongoing war's last, when dataThrough falls inside it) is left
 * out. A war's first month, when it starts after the 1st, and an ended war's last, when it ends before the month's
 * last day, are kept for the strip but carry `part` (War Focus counts events only from the start and to the end), so
 * the rule gives them and the months they are compared with no mark. `headlines`: an optional map from
 * "date|deaths" to { headline, office } (Realtime Battlefield's sources for the same war), to name a report War Focus
 * records only by place.
 */
const longDay = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`; };
export function focusRows(war, { gedThrough = 2025, gedVersion = '26.1', headlines = null } = {}) {
  const rows = [];
  const through = war.dataThrough || null;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(war.start || '') ? war.start : null, end = !war.ongoing && /^\d{4}-\d{2}-\d{2}$/.test(war.end || '') ? war.end : null;
  const monthOf = m => {
    const a = `${m}-01`, z = lastDay(m);
    const from = start && start > a && start <= z ? start : a, to = end && end < z && end >= a ? end : z;
    if (from === a && to === z) return null;
    const why = from !== a
      ? `War Focus counts this war from ${longDay(from)}, its start, so ${longDay(from).replace(/^\d+ /, '')} is not a whole month and cannot be compared with whole months.`
      : `War Focus counts this war only to ${longDay(to)}, its end, so ${longDay(to).replace(/^\d+ /, '')} is not a whole month and cannot be compared with whole months.`;
    return { from, to, why };
  };
  war.months.forEach((m, i) => {
    if (war.ongoing && through && lastDay(m) > through) return;
    if (war.covered && (m < war.covered[0] || m > war.covered[1])) return;
    const t = (war.top?.[i] || [])[0];
    const top = t ? { date: t[0], n: t[1], place: clip(t[2], 60), end: t[4] || null, whole: t[5] ?? t[1], headline: '', office: '' } : null;
    if (top && headlines) { const h = headlines.get(`${top.date}|${top.whole}`); if (h) Object.assign(top, h); }
    const year = +m.slice(0, 4);
    rows.push({
      m, d: war.deaths[i] || 0, e: (war.cells?.[i] || []).reduce((s, c) => s + (c[3] || 0), 0),
      sh: war.shared ? (war.shared[i] || 0) : 0, top, est: !!war.estimated?.[i],
      src: year <= gedThrough ? gedSrc(gedVersion) : candidateSrc(year), prov: year > gedThrough,
      ...(monthOf(m) ? { part: monthOf(m) } : {}),
    });
  });
  return rows;
}

/** Merge rows: later lists win month by month (the newest release replaces the months it covers). */
export function mergeRows(...lists) {
  const by = new Map();
  for (const l of lists) for (const r of l || []) by.set(r.m, r);
  return [...by.values()].sort((a, b) => (a.m < b.m ? -1 : 1));
}

/* ------------------------------------------------------------------------------------------- countries */
// Gleditsch and Ward's codes are how UCDP names a country (country_id); National Analysis gives most countries theirs.
// Its gaps that UCDP's events need: Yemen is 678 in UCDP's coding (the Yemen Arab Republic's code, kept for the united
// state from May 1990). UCDP records events in the West Bank and Gaza under Israel (666), so Palestine has no unit of
// its own: its events are in Israel's, and its profile says so. GW_FIX corrects a code National Analysis holds for a
// country's earlier state: Vietnam's there is 815 (the pre-1954 state), and UCDP records today's Vietnam as 816 (both
// still name Vietnam, so War Focus's older wars map too).
export const GW_EXTRA = Object.freeze({ YEM: 678 });
export const GW_FIX = Object.freeze({ VNM: 816 });
export const GW_NOTES = Object.freeze({ PSE: 'UCDP records events in the West Bank and Gaza under Israel (its country code 666), so their figures are in Israel\'s.' });
// A strip starts at a state's independence or unification (the month), not in 1989; its first three months show why
// they have no mark. The third item, where given, is the reason in full (a merger or split, not an independence).
// Russia's and Serbia's codes held the whole Soviet Union and Yugoslavia before their splits, so their strips start
// after them.
export const INDEPENDENCE = Object.freeze({
  260: ['1990-10', 'West and East Germany', 'Germany was united in October 1990; before that UCDP counts West Germany\'s events under this code and East Germany\'s under another.'],
  345: ['1992-05', 'Yugoslavia', 'Until April 1992 UCDP counts the whole of Yugoslavia under this code, so the strip starts in May 1992 (until June 2006 it also holds Montenegro, and until February 2008 Kosovo).'],
  365: ['1992-01', 'the Soviet Union', 'Until December 1991 UCDP counts the whole Soviet Union under this code, so the strip starts in January 1992.'],
  678: ['1990-05', 'North and South Yemen', 'Yemen was united in May 1990; before that UCDP counts these events under North Yemen (this code) and South Yemen.'],
  316: ['1993-01', 'Czechoslovakia'], 317: ['1993-01', 'Czechoslovakia'], 341: ['2006-06', 'Serbia and Montenegro'], 343: ['1991-09', 'Yugoslavia'],
  344: ['1991-06', 'Yugoslavia'], 346: ['1992-03', 'Yugoslavia'], 347: ['2008-02', 'Serbia'], 349: ['1991-06', 'Yugoslavia'],
  359: ['1991-08', 'the Soviet Union'], 366: ['1991-08', 'the Soviet Union'], 367: ['1991-08', 'the Soviet Union'], 368: ['1990-03', 'the Soviet Union'],
  369: ['1991-08', 'the Soviet Union'], 370: ['1991-08', 'the Soviet Union'], 371: ['1991-09', 'the Soviet Union'], 372: ['1991-04', 'the Soviet Union'],
  373: ['1991-08', 'the Soviet Union'], 531: ['1993-05', 'Ethiopia'], 565: ['1990-03', 'South Africa'], 626: ['2011-07', 'Sudan'],
  701: ['1991-10', 'the Soviet Union'], 702: ['1991-09', 'the Soviet Union'], 703: ['1991-08', 'the Soviet Union'], 704: ['1991-08', 'the Soviet Union'],
  705: ['1991-12', 'the Soviet Union'], 860: ['2002-05', 'Indonesia'],
});
/** ISO3 → GW for every country National Analysis holds, with GW_EXTRA; and the reverse. */
export function gwTable(national) {
  const iso = new Map(), gw = new Map();
  for (const c of national.countries || []) {
    const g = GW_FIX[c.iso3] ?? c.gw ?? GW_EXTRA[c.iso3] ?? null;
    if (g == null) continue;
    iso.set(c.iso3, g);
    if (!gw.has(g)) gw.set(g, c.iso3);
    if (c.gw != null && c.gw !== g && !gw.has(c.gw)) gw.set(c.gw, c.iso3);
  }
  return { iso, gw };
}

/** Rows of a country from GED's months (ged-countries.json) and the year's candidate months (realtime.json countries). */
export function countryRows(gw, ged, rt) {
  const g = ged?.countries?.[gw], c = rt?.countries?.[gw];
  const a = g ? rowsFromSeries(g, { src: gedSrc(ged.version || '26.1'), prov: false }) : [];
  // A country with no events in the year's candidate file had none recorded: its months are zeros, not missing, once the
  // file has per-country figures at all.
  const zeros = rt?.countries && Array.isArray(rt.months) && rt.months.length ? { from: rt.months[0], deaths: rt.months.map(() => 0), events: rt.months.map(() => 0), shared: rt.months.map(() => 0), top: rt.months.map(() => null) } : null;
  const b = c?.series ? rowsFromSeries(c.series, { src: candidateSrc(rt.year), prov: true }) : zeros ? rowsFromSeries(zeros, { src: candidateSrc(rt.year), prov: true }) : [];
  return mergeRows(a, b);
}
