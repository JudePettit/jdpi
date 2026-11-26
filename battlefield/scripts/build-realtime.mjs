// Builds battlefield/data/realtime.json from a UCDP Candidate Events CSV (year to date).
//   node battlefield/scripts/build-realtime.mjs path/to/GEDEvent_v26_01_26_09.csv [version] [--allow-drop]
// Source: UCDP Candidate Events Dataset (Hegre et al. 2020), CC BY 4.0.
// Each war, and each country (by UCDP's country_id, a Gleditsch and Ward code), also gets `series`: its months with an
// event UCDP dates only to a span of days shared out over those days and counted in each month it touches, as War
// Focus counts (monthly/scripts/series.mjs); Month by Month's marks read it. The page's own `monthly` figures still
// count each event in the month it starts.
// Guard: within a year the file only grows (each release adds a month), so a build with fewer months, or with far
// fewer events or deaths than the committed file, is not written; --allow-drop writes it anyway.
// AC-14 (17 November 2026; PRP-ALL-COUNTRIES-PLAN.md): every event is in a war or warzone. An "Other armed violence in
// <country>" group under 25 deaths in the year is no longer dropped: all of them are kept under one quiet group, "Other
// recorded armed violence (under 25 deaths in a country this year)" (id other-recorded; Month by Month, which leaves
// every other-… group to its country units, leaves it too). Each country in `countries` also carries its ISO3 (from
// Gleditsch and Ward's code by Month by Month's table, monthly/scripts/series.mjs gwTable, on National Analysis's
// codes), its events and deaths, and its events and deaths in each war month by month, each event in the month it
// starts as the page counts; each circle (`points`) names in a sixth field the country UCDP files its events under.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseCsv } from './csv.mjs';
import { WARS, cleanName } from './wars.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';
import { writeHeads } from '../../integration/scripts/heads.mjs';
import { seriesFromEvents } from '../../monthly/scripts/series.mjs';
import { gwTable } from '../../monthly/scripts/series.mjs';
// Each month's note, with the deaths in events UCDP dates only to a month or longer said apart (S0).
import { monthInsight, country, sidesOf } from './realtime-insight.mjs';
import { actors, stateName } from './ucdp.mjs';

const [csvPath, version = ''] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
// An empty download, an error page or a re-shaped file would otherwise build quietly into zeros or "other" wars.
// The notes' "Main fighting" and the conflicts' names are built from side_a and side_b (26 November 2026), not from
// dyad_name, so a file without the sides is refused here rather than half-way through the build.
const COLUMNS = ['date_start', 'date_end', 'date_prec', 'best', 'deaths_civilians', 'conflict_new_id', 'conflict_name', 'side_a', 'side_b', 'type_of_violence', 'country', 'country_id', 'region', 'adm_1', 'latitude', 'longitude'];
if (!rows.length) throw new Error(`${csvPath} has no events`);
const missing = COLUMNS.filter(k => !(k in rows[0]));
if (missing.length) throw new Error(`${csvPath} is not a UCDP candidate events file this build can read: no ${missing.join(', ')}`);
const events = rows.filter(e => e.date_start);
if (!events.length) throw new Error(`${csvPath} has no dated events`);
const TYPES = { 1: 'state-based', 2: 'non-state', 3: 'one-sided violence against civilians' };
const fmt = n => n.toLocaleString('en-GB');

// A conflict's name under "Conflicts in this war (UCDP)" (26 November 2026, the follow-on to front-pages-47). UCDP names
// a non-state conflict and one-sided violence by its dyad joined with " - ", and an interstate conflict by its states so
// joined; " - " also falls inside actors' own names ("FARC - Segunda Marquetalia  - Civilians"), and a state can carry
// its old name ("DR Congo (Zaire) - Rwanda"). Such a name is now "A v B", as the notes' "Main fighting" is: a non-state
// conflict or one-sided violence (one dyad in UCDP) by its event's side_a and side_b (realtime-insight.mjs sidesOf); an
// interstate conflict by the states on each side of UCDP's name, each by its name on the event's day (ucdp.mjs
// stateName), an alliance joined with "and", or kept in UCDP's comma list when a state's own name has " and " in it
// ("Trinidad and Tobago"), as the notes' sides are (realtime-insight.mjs sideOf). A state-based conflict within a state
// keeps UCDP's name, its state too by the name on the day ("Myanmar (Burma): Karen" in 2026 → "Myanmar: Karen").
const andList = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] || '');
const sideList = l => (l.some(a => / and /.test(a)) ? l.join(', ') : andList(l));
// A count with its noun, singular for one ("1 death in 1 recorded event").
const count = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
function conflictName(e) {
  const c = country(e.country), date = String(e.date_start || '').slice(0, 10), name = String(e.conflict_name || '');
  if (e.type_of_violence === '2' || e.type_of_violence === '3') return sidesOf(e);
  const sides = name.split(' - ');
  if (e.type_of_violence === '1' && sides.length === 2 && !name.includes(':'))
    return sides.map(s => sideList(actors(s).map(a => cleanName(stateName(a, date), c)))).join(' v ');
  return cleanName(name.replace(/^([^:]+):/, (m, s) => `${stateName(s, date)}:`), c);
}

const warOf = new Map(WARS.flatMap(w => w.ids.map(id => [String(id), w.id])));
const wars = new Map(WARS.map(w => [w.id, { ...w, conflicts: new Map() }]));

for (const e of events) {
  let wid = warOf.get(e.conflict_new_id);
  if (!wid) {
    const c = country(e.country);
    wid = 'other-' + c.toLowerCase().replace(/[^a-z]+/g, '-');
    if (!wars.has(wid)) wars.set(wid, { id: wid, name: `Other armed violence in ${c}`, zone: e.region, ids: [], wiki: null, background: null, conflicts: new Map() });
  }
  e.war = wid;
  const w = wars.get(wid);
  const k = e.conflict_new_id;
  if (!w.conflicts.has(k)) w.conflicts.set(k, { id: +k, name: conflictName(e), type: TYPES[e.type_of_violence], deaths: 0, events: 0 });
  const c = w.conflicts.get(k); c.deaths += +e.best || 0; c.events++;
}

// A country's "Other armed violence" with under 25 deaths in the year joins the one quiet group, circles and all.
const QUIET = 'other-recorded';
const deathsIn = new Map();
for (const e of events) deathsIn.set(e.war, (deathsIn.get(e.war) || 0) + (+e.best || 0));
const small = [...wars.values()].filter(w => w.id.startsWith('other-') && w.conflicts.size && (deathsIn.get(w.id) || 0) < 25);
if (small.length) {
  const q = { id: QUIET, name: 'Other recorded armed violence (under 25 deaths in a country this year)', zone: [...new Set(small.map(w => w.zone))].sort().join(', '), ids: [], wiki: null, background: null, conflicts: new Map() };
  for (const w of small) {
    for (const [k, c] of w.conflicts) { const x = q.conflicts.get(k); if (x) { x.deaths += c.deaths; x.events += c.events; } else q.conflicts.set(k, { ...c }); }
    wars.delete(w.id);
  }
  const moved = new Set(small.map(w => w.id));
  for (const e of events) if (moved.has(e.war)) e.war = QUIET;
  wars.set(QUIET, q);
}
// UCDP's own country field: its Gleditsch and Ward code (the first, where a row names more than one).
const gwOf = e => { const g = String(e.country_id || '').split(/[;,\s]/)[0]; return /^\d+$/.test(g) ? g : null; };

const months = [...new Set(events.map(e => e.date_start.slice(0, 7)))].sort();
// An event for the shared rule: its first and last day, deaths, place and first source.
const asSpan = e => ({ d: e.date_start.slice(0, 10), de: (e.date_end || e.date_start).slice(0, 10), best: +e.best || 0, place: e.where_description || e.adm_1, headline: (e.source_headline || '').split(';')[0].replace(/^"|"$/g, ''), office: (e.source_office || '').split(';')[0] });
const latest = months.at(-1);

const out = [];
for (const w of wars.values()) {
  const evs = events.filter(e => e.war === w.id);
  const deaths = evs.reduce((s, e) => s + (+e.best || 0), 0);
  if (!evs.length) continue; // a named war with no events this year
  const monthly = [];
  for (const m of months) monthly.push(monthInsight(w, evs.filter(e => e.date_start.startsWith(m)), m, monthly.at(-1)));
  const lastActive = evs.reduce((a, e) => (e.date_start > a ? e.date_start : a), '').slice(0, 10);
  const countries = [...new Set(evs.map(e => country(e.country)))];
  const cells = new Map();
  // One circle per place (0.1°), month and country as UCDP files it: [lat, lon, month index, deaths, events, code].
  for (const e of evs) {
    const k = `${(+e.latitude).toFixed(1)},${(+e.longitude).toFixed(1)},${e.date_start.slice(0, 7)},${gwOf(e)}`;
    const c = cells.get(k) || cells.set(k, [+(+e.latitude).toFixed(1), +(+e.longitude).toFixed(1), months.indexOf(e.date_start.slice(0, 7)), 0, 0, gwOf(e) == null ? null : +gwOf(e)]).get(k);
    c[3] += +e.best || 0; c[4]++;
  }
  const recent = monthly.slice(-3).reduce((s, x) => s + x.deaths, 0);
  const series = seriesFromEvents(evs.map(asSpan), months[0], latest);
  out.push({
    id: w.id, name: w.name, zone: w.zone, wiki: w.wiki, background: w.background, keywords: w.keywords || [], countries, deaths, events: evs.length, lastActive,
    status: lastActive >= `${months.at(-2) || latest}-01` ? 'active' : 'quiet',
    summary: `${count(deaths, 'death', 'deaths')} in ${count(evs.length, 'recorded event', 'recorded events')} so far this year; ${fmt(recent)} in the last three months. Last recorded event ${lastActive}.`,
    conflicts: [...w.conflicts.values()].sort((a, b) => b.deaths - a.deaths),
    monthly, points: [...cells.values()], series,
  });
}
out.sort((a, b) => b.deaths - a.deaths);

// Each country where UCDP recorded events this year, by its country_id (all three kinds of violence), for Month by Month
// and for the page's country layer: its ISO3, events and deaths, and each war's events and deaths in it month by month.
const { gw: isoOfGw } = gwTable(JSON.parse(readFileSync(new URL('../../national/data/index.json', import.meta.url), 'utf8')));
// One of VM's 197 that National Analysis does not hold, so its table has no code for it: Taiwan, Gleditsch and Ward's
// 713 (as design/scripts/focus-countries.mjs and integration/scripts/coverage.mjs file it). No event of this release is
// filed under it; without it, a later one would leave Taiwan's shape saying no events were recorded.
const GW_NOT_IN_NATIONAL = Object.freeze({ 713: 'TWN' });
const countries = {};
let countryDeaths = 0, uncoded = 0;
for (const e of events) {
  const gw = gwOf(e);
  if (!gw) { uncoded++; continue; }
  const c = countries[gw] || (countries[gw] = { name: country(e.country), events: [], conflicts: new Set() });
  c.events.push(e); c.conflicts.add(+e.conflict_new_id); countryDeaths += +e.best || 0;
}
const unnamed = [];
for (const [gw, c] of Object.entries(countries)) {
  const byWar = new Map();
  for (const e of c.events) {
    const x = byWar.get(e.war) || byWar.set(e.war, { events: months.map(() => 0), deaths: months.map(() => 0), total: 0 }).get(e.war);
    const i = months.indexOf(e.date_start.slice(0, 7));
    x.events[i]++; x.deaths[i] += +e.best || 0; x.total += +e.best || 0;
  }
  const iso3 = isoOfGw.get(+gw) || GW_NOT_IN_NATIONAL[gw] || null;
  if (!iso3) unnamed.push(`${gw} ${c.name}`);
  countries[gw] = { name: c.name, iso3, events: c.events.length, deaths: c.events.reduce((s, e) => s + (+e.best || 0), 0),
    conflicts: [...c.conflicts].filter(Number.isFinite).sort((a, b) => a - b),
    wars: Object.fromEntries([...byWar].sort((a, b) => b[1].total - a[1].total).map(([id, x]) => [id, { events: x.events, deaths: x.deaths }])),
    series: seriesFromEvents(c.events.map(asSpan), months[0], latest) };
}
if (unnamed.length) console.warn(`No ISO3 for UCDP's country code ${unnamed.join(', ')}: add it to National Analysis's codes or monthly/scripts/series.mjs GW_EXTRA`);

const data = {
  generated: new Date().toISOString(), source: 'UCDP Candidate Events Dataset', version, licence: 'CC BY 4.0',
  citation: 'Hegre, H. et al. (2020). Introducing the UCDP Candidate Events Dataset. Research & Politics 7(3). Data: Uppsala Conflict Data Program, ucdp.uu.se.',
  year: +latest.slice(0, 4), months, latest, totals: { deaths: events.reduce((s, e) => s + (+e.best || 0), 0), events: events.length },
  wars: out, countries,
};
// The guard compares with the committed file of the same year; a new year's first file starts again from January.
// UCDP revises candidate events by a few per cent, so a tenth fewer events or deaths means a short or broken file,
// and half the events falling out of the named wars into "Other armed violence" means the conflict ids have changed.
const OUT = new URL('../data/realtime.json', import.meta.url);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const named = list => list.filter(w => !w.id.startsWith('other-')).reduce((s, w) => s + w.events, 0);
if (prev && data.year < prev.year) refuseIfLost([`year ${prev.year} → ${data.year}`]);
if (prev?.year === data.year) refuseIfLost([
  ...lostCounts({ months: prev.months.length }, { months: months.length }, { over: 0, keep: 1 }),
  ...lostCounts({ events: prev.totals.events, deaths: prev.totals.deaths }, { events: data.totals.events, deaths: data.totals.deaths }, { over: 0, keep: 0.9 }),
  ...lostCounts({ 'events in named wars': named(prev.wars) }, { 'events in named wars': named(out) }),
]);
// The series share deaths over days but never lose or add one: each war's and the countries' must add up.
const sum = a => a.reduce((s, x) => s + x, 0);
refuseIfLost([
  ...out.filter(w => sum(w.series.deaths) !== w.deaths).map(w => `${w.id}: series deaths ${sum(w.series.deaths)} ≠ ${w.deaths}`),
  ...(sum(Object.values(countries).map(c => sum(c.series.deaths))) !== countryDeaths ? [`countries' series deaths ≠ ${countryDeaths}`] : []),
  // An event with no readable country code is in the wars' totals and in no country: the country layer would then say
  // "no events recorded" over recorded violence. The comparison above cannot see it (both sides leave the event out).
  ...(uncoded ? [`${uncoded} of ${events.length} events have no country code (country_id), so the countries would not add up to the total`] : []),
]);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify(data));
writeHeads('battlefield/data/realtime.json'); // realtime.head.json in step with it (integration/scripts/heads.mjs)
console.log(`${out.length} wars/warzones, ${events.length} events, months ${months[0]}..${latest}`);
