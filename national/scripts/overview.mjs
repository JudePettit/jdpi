// A country's leadership and conflict figures for National Analysis's overview (build.mjs), from the Political
// Retrospective's leaders and events and Retrospective Battlefield's wars (battlefield/history/data/wars.json).
//
// A present-day country the Retrospective files under more than one state code is read under each of them, for the
// years that code's state existed: Germany is 255 ("Germany", its leaders to May 1945) and 260 ("West Germany /
// Germany", from September 1949). The Correlates of War's state list (states2016.csv) has 255 for Germany from 1816 to
// 8 May 1945 and again from 3 October 1990, 260 for the German Federal Republic (5 May 1955 to 2 October 1990) and 265
// for the German Democratic Republic; the code list the build reads (countrycode) gives Germany GW 260 and COW 255.
// Until 17 November 2026 the build read Germany under 260 alone, so its leaders since 1926 began with Adenauer, and its
// wars of 1926–45 were none: Retrospective Battlefield's Correlates of War wars file Germany's Second World War and
// Spanish Civil War under 255. The GDR (265) is a state of its own, not counted in Germany's figures, as the
// Retrospective keeps it (no ISO3).

export const SINCE = '1926-10-26'; // "the last 100 years", as the overview has counted them

const years = (a, b, today) => Math.max(0, (Date.parse(b || today) - Date.parse(a)) / (365.25 * 864e5));
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** The Retrospective's codes for a country (ISO3), from its scripts/countries.mjs COUNTRIES: e.g. DEU → [255, 260]. */
export const retroCodes = (COUNTRIES, iso3) => Object.entries(COUNTRIES).filter(([, c]) => c.iso3 === iso3).map(([gw]) => +gw).sort((a, b) => a - b);

/**
 * Leaders in the last 100 years, their average and median time in office, the longest-serving, the irregular
 * seizures of power and the elections and referendums since 1926, over every one of the country's records (`records`:
 * the Retrospective's countries[code] for each of its codes). `current` is the country's leader, repeated for the
 * Integration Hub's catalog.
 */
export function leadership(records, current, today = new Date().toISOString().slice(0, 10)) {
  const rs = records.filter(Boolean);
  if (!rs.length) return null;
  const leaders = rs.flatMap(c => c.leaders).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const events = rs.flatMap(c => c.events);
  const ls = leaders.filter(l => (l.end || today) >= SINCE);
  const full = ls.filter(l => l.start >= SINCE);
  const tenures = full.map(l => years(l.start, l.end, today)).filter(x => x > 0);
  const longest = [...ls].sort((a, b) => years(b.start, b.end, today) - years(a.start, a.end, today))[0];
  // Terms that more than one person held together (San Marino's two Captains Regent a term): leaders100 counts each
  // person, so `together` says how many hold the office at once (`at`, the usual number) and for how long a term
  // usually runs (`months`, the middle length of the shared terms). A "term" here is a start and end pair, which
  // decides only whether the note shows (more than half of them shared). The counts of terms are not shown: the list
  // splits a term where one regent was replaced (April to October 1930 is three pairs) and holds four people in
  // 11 to 27 October 1957, so "201 of 204 terms" would tell the reader that three terms had one regent, which is
  // untrue (the review of 17 November 2026, F2).
  const terms = new Map();
  for (const l of ls) {
    const k = `${l.start}|${l.end}`, t = terms.get(k) || { n: 0, start: l.start, end: l.end };
    t.n++; terms.set(k, t);
  }
  const shared = [...terms.values()].filter(t => t.n > 1);
  const most = shared.reduce((m, t) => m.set(t.n, (m.get(t.n) || 0) + 1), new Map());
  const usual = [...most].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const lengths = shared.filter(t => t.end).map(t => (Date.parse(t.end) - Date.parse(t.start)) / 864e5).sort((a, b) => a - b);
  const months = lengths.length ? Math.round(lengths[Math.floor(lengths.length / 2)] / 30.44) : null;
  return {
    leaders100: ls.length,
    avgTenure: tenures.length ? round(tenures.reduce((a, b) => a + b, 0) / tenures.length, 1) : null,
    medianTenure: tenures.length ? round([...tenures].sort((a, b) => a - b)[Math.floor(tenures.length / 2)], 1) : null,
    longest: longest ? { name: longest.full || longest.name, years: round(years(longest.start, longest.end, today), 1), from: longest.start.slice(0, 4), to: longest.end ? longest.end.slice(0, 4) : 'present' } : null,
    irregular: leaders.filter(l => l.start >= SINCE && l.entry && l.entry !== 'Regular').length,
    elections: events.filter(e => (e.type === 'election' || e.type === 'referendum') && e.date >= SINCE).length,
    ...(shared.length > terms.size / 2 ? { together: { at: usual, ...(months ? { months } : {}) } } : {}),
    // The leaders come from the Retrospective's hand-built lists (its scripts/leader-lists.mjs: Montenegro and ten
    // microstates Archigos does not cover), not from Archigos and Wikidata: the page names those sources.
    ...(ls.some(l => l.source === 'leader-lists') ? { leaderLists: true } : {}),
    current,
  };
}

/**
 * Armed conflict under any of the country's codes: UCDP/PRIO's conflicts since 1946 on its soil (by year, onsets, new
 * wars) and abroad, the Correlates of War's wars of 1926–45 it fought in or on its soil, and `active` (Realtime
 * Battlefield's wars this year, chosen by the caller).
 */
export function conflict(codes, wars, active = []) {
  const has = list => codes.some(g => list.includes(g));
  const ucdp = wars.filter(w => w.src === 'ucdp' && (has(w.loc) || has(w.states)));
  const onSoil = ucdp.filter(w => has(w.loc));
  const byYear = new Map();
  for (const w of onSoil) for (const [y, lvl] of w.years) { const x = byYear.get(y) || { n: 0, war: false }; x.n++; if (lvl === 2) x.war = true; byYear.set(y, x); }
  let onsets = 0, newWars = 0;
  for (const w of onSoil) {
    const ys = new Map(w.years);
    for (const [y, lvl] of w.years) { if (!ys.has(y - 1)) onsets++; if (lvl === 2 && ys.get(y - 1) !== 2) newWars++; }
  }
  const span = 2025 - 1946 + 1;
  const cow = wars.filter(w => w.src === 'cow' && (has(w.loc) || has(w.states)));
  return {
    conflictYears: [...byYear.values()].reduce((s, x) => s + x.n, 0),
    avgConflictsPerYear: round([...byYear.values()].reduce((s, x) => s + x.n, 0) / span, 2),
    yearsWithConflict: byYear.size, yearsAtWar: [...byYear.values()].filter(x => x.war).length,
    onsetsPerDecade: round(onsets / (span / 10), 2), newWarsPerDecade: round(newWars / (span / 10), 2), newWarsPerYear: round(newWars / span, 3),
    conflictsAbroad: ucdp.filter(w => !has(w.loc)).length, cowWars1926_45: cow.length,
    active2026: active.map(w => ({ name: w.name, deaths: w.deaths, id: w.id })),
  };
}
