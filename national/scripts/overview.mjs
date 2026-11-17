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
// Retrospective keeps it (no ISO3). Yemen, which had no code at all, is GW_PREDECESSOR's (below).

export const SINCE = '1926-10-26'; // "the last 100 years", as the overview has counted them

const years = (a, b, today) => Math.max(0, (Date.parse(b || today) - Date.parse(a)) / (365.25 * 864e5));
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** The Retrospective's codes for a country (ISO3), from its scripts/countries.mjs COUNTRIES: e.g. DEU → [255, 260]. */
export const retroCodes = (COUNTRIES, iso3) => Object.entries(COUNTRIES).filter(([, c]) => c.iso3 === iso3).map(([gw]) => +gw).sort((a, b) => a - b);

// A present-day state whose Gleditsch and Ward code the code list (countrycode) files under a predecessor's row, which
// has no ISO3, so the state itself had none: Yemen (until 17 November 2026 National Analysis had no code for it, and so
// no conflict figures, no wars this year and no links to the Battlefield or the Retrospective). The Gleditsch and Ward
// list, as the UCDP/PRIO Armed Conflict Dataset's codebook (version 25.1, Appendix 1, "List of System Members Since
// 1946") gives it, has "678 YEM Yemen (Arab Republic of Yemen)" from 1946 with no end, and "680 YPR Yemen, People's
// Republic of" from 1967 to 1990: the list carries North Yemen's 678 on through the union of 22 May 1990, which has no
// code of its own there (679, the union's code, is the Correlates of War's), and UCDP files the wars of Yemen since 1990
// under 678. So Yemen is 678 for all its years; South Yemen (680) is a state of its own until 1990, not counted in
// Yemen's figures, as the German Democratic Republic is not in Germany's. `row` is the code list's row that holds the
// code: the build takes the code only while that row still gives it.
export const GW_PREDECESSOR = { YEM: { gw: 678, row: 'Yemen Arab Republic' } };

/**
 * Every country's Gleditsch and Ward code: the Retrospective's (COUNTRIES, keyed by code), else the code list's
 * (`gwn` of the row with its ISO3), else GW_PREDECESSOR's where the code list's own row gives that code. `codelist` is
 * the parsed code list (rows with iso3c, gwn and country.name.en). Returns Map(ISO3 → code); `warn` hears of a
 * predecessor row that no longer gives its code.
 */
export function gwCodes(COUNTRIES, codelist, warn = () => {}) {
  const out = new Map(Object.entries(COUNTRIES).map(([gw, c]) => [c.iso3, +gw]));
  for (const r of codelist) if (r.iso3c && r.gwn && !out.has(r.iso3c)) out.set(r.iso3c, +r.gwn);
  for (const [iso3, p] of Object.entries(GW_PREDECESSOR)) {
    if (out.has(iso3)) continue;
    const row = codelist.find(r => r['country.name.en'] === p.row);
    if (row && +row.gwn === p.gw && !row.iso3c) out.set(iso3, p.gw);
    else warn(`GW_PREDECESSOR: the code list's row "${p.row}" no longer gives ${p.gw} without an ISO3; ${iso3} has no code`);
  }
  return out;
}

/**
 * Leaders in the last 100 years, their average and median time in office, the longest-serving, the irregular
 * seizures of power and the elections and referendums since 1926, over every one of the country's records (`records`:
 * the Retrospective's countries[code] for each of its codes). `current` is the country's leader, repeated for the
 * Integration Hub's catalog. `term` is the fixed term of the office the current leader holds, from Wikidata (the
 * office's "term length", P2097: { years, office }, officeTerm below), or null; it is kept only where the office is
 * held together (`together.term`), where the page gives it in words in place of a longest-serving leader.
 */
export function leadership(records, current, today = new Date().toISOString().slice(0, 10), term = null) {
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
    // An office held together for a fixed term (San Marino's Captains Regent: Wikidata gives Q258045 a term length of
    // 0.5 years) carries the term, `together.term`: the page then names no longest-serving leader (every holder serves
    // one term at a time, so the "longest" is one of hundreds tied at 0.5 years) and gives the term's length in words.
    ...(shared.length > terms.size / 2 ? { together: { at: usual, ...(months ? { months } : {}), ...(term ? { term } : {}) } } : {}),
    // The leaders come from the Retrospective's hand-built lists (its scripts/leader-lists.mjs: Montenegro and ten
    // microstates Archigos does not cover), not from Archigos and Wikidata: the page names those sources.
    ...(ls.some(l => l.source === 'leader-lists') ? { leaderLists: true } : {}),
    current,
  };
}

// Wikidata's units for a term length (P2097) in years: year (Q577), annum (Q1092296, which Germany's chancellor has) and
// month (Q5151). Another unit is not read.
const TERM_UNITS = { Q577: 1, Q1092296: 1, Q5151: 1 / 12 };

/**
 * The fixed term of the office the current leader holds, from Wikidata: `offices` is Map(office QID → [{ amount, unit }])
 * of the country's offices of head of state or of government (the one `current.office` names), as the build's offices
 * query reads them (P2097, with its unit). Returns { years, office } where exactly one such office has exactly one term
 * length in years or months; otherwise null (no term, or more than one to choose from).
 */
export function officeTerm(offices) {
  const found = [];
  for (const [office, vals] of offices || []) {
    const ys = [...new Set(vals.filter(v => TERM_UNITS[v.unit] != null && Number.isFinite(+v.amount)).map(v => round(+v.amount * TERM_UNITS[v.unit])))];
    if (ys.length === 1 && ys[0] > 0) found.push({ years: ys[0], office });
    else if (ys.length > 1) return null;
  }
  return found.length === 1 ? found[0] : null;
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
