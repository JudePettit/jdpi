// Builds battlefield/data/realtime.json from a UCDP Candidate Events CSV (year to date).
//   node battlefield/scripts/build-realtime.mjs path/to/GEDEvent_v26_01_26_09.csv [version] [--allow-drop]
// Source: UCDP Candidate Events Dataset (Hegre et al. 2020), CC BY 4.0.
// Each war, and each country (by UCDP's country_id, a Gleditsch and Ward code), also gets `series`: its months with an
// event UCDP dates only to a span of days shared out over those days and counted in each month it touches, as War
// Focus counts (monthly/scripts/series.mjs); Month by Month's marks read it. The page's own `monthly` figures still
// count each event in the month it starts.
// Guard: within a year the file only grows (each release adds a month), so a build with fewer months, or with far
// fewer events or deaths than the committed file, is not written; --allow-drop writes it anyway.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseCsv } from './csv.mjs';
import { WARS, cleanName } from './wars.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';
import { writeHeads } from '../../integration/scripts/heads.mjs';
import { seriesFromEvents } from '../../monthly/scripts/series.mjs';
// Each month's note, with the deaths in events UCDP dates only to a month or longer said apart (S0).
import { monthInsight, country } from './realtime-insight.mjs';

const [csvPath, version = ''] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
// An empty download, an error page or a re-shaped file would otherwise build quietly into zeros or "other" wars.
const COLUMNS = ['date_start', 'date_end', 'date_prec', 'best', 'deaths_civilians', 'conflict_new_id', 'conflict_name', 'dyad_name', 'type_of_violence', 'country', 'region', 'adm_1', 'latitude', 'longitude'];
if (!rows.length) throw new Error(`${csvPath} has no events`);
const missing = COLUMNS.filter(k => !(k in rows[0]));
if (missing.length) throw new Error(`${csvPath} is not a UCDP candidate events file this build can read: no ${missing.join(', ')}`);
const events = rows.filter(e => e.date_start);
if (!events.length) throw new Error(`${csvPath} has no dated events`);
const TYPES = { 1: 'state-based', 2: 'non-state', 3: 'one-sided violence against civilians' };
const fmt = n => n.toLocaleString('en-GB');

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
  if (!w.conflicts.has(k)) w.conflicts.set(k, { id: +k, name: cleanName(e.conflict_name, country(e.country)), type: TYPES[e.type_of_violence], deaths: 0, events: 0 });
  const c = w.conflicts.get(k); c.deaths += +e.best || 0; c.events++;
}

const months = [...new Set(events.map(e => e.date_start.slice(0, 7)))].sort();
// An event for the shared rule: its first and last day, deaths, place and first source.
const asSpan = e => ({ d: e.date_start.slice(0, 10), de: (e.date_end || e.date_start).slice(0, 10), best: +e.best || 0, place: e.where_description || e.adm_1, headline: (e.source_headline || '').split(';')[0].replace(/^"|"$/g, ''), office: (e.source_office || '').split(';')[0] });
const latest = months.at(-1);

const out = [];
for (const w of wars.values()) {
  const evs = events.filter(e => e.war === w.id);
  const deaths = evs.reduce((s, e) => s + (+e.best || 0), 0);
  if (!evs.length || (w.id.startsWith('other-') && deaths < 25)) continue;
  const monthly = [];
  for (const m of months) monthly.push(monthInsight(w, evs.filter(e => e.date_start.startsWith(m)), m, monthly.at(-1)));
  const lastActive = evs.reduce((a, e) => (e.date_start > a ? e.date_start : a), '').slice(0, 10);
  const countries = [...new Set(evs.map(e => country(e.country)))];
  const cells = new Map();
  for (const e of evs) {
    const k = `${(+e.latitude).toFixed(1)},${(+e.longitude).toFixed(1)},${e.date_start.slice(0, 7)}`;
    const c = cells.get(k) || cells.set(k, [+(+e.latitude).toFixed(1), +(+e.longitude).toFixed(1), months.indexOf(e.date_start.slice(0, 7)), 0, 0]).get(k);
    c[3] += +e.best || 0; c[4]++;
  }
  const recent = monthly.slice(-3).reduce((s, x) => s + x.deaths, 0);
  const series = seriesFromEvents(evs.map(asSpan), months[0], latest);
  out.push({
    id: w.id, name: w.name, zone: w.zone, wiki: w.wiki, background: w.background, keywords: w.keywords || [], countries, deaths, events: evs.length, lastActive,
    status: lastActive >= `${months.at(-2) || latest}-01` ? 'active' : 'quiet',
    summary: `${fmt(deaths)} deaths in ${fmt(evs.length)} recorded events so far this year; ${fmt(recent)} in the last three months. Last recorded event ${lastActive}.`,
    conflicts: [...w.conflicts.values()].sort((a, b) => b.deaths - a.deaths),
    monthly, points: [...cells.values()], series,
  });
}
out.sort((a, b) => b.deaths - a.deaths);

// Each country where UCDP recorded events this year, by its country_id (all three kinds of violence), for Month by Month.
const countries = {};
let countryDeaths = 0;
for (const e of events) {
  const gw = String(e.country_id || '').split(/[;,\s]/)[0];
  if (!/^\d+$/.test(gw)) continue;
  const c = countries[gw] || (countries[gw] = { name: country(e.country), events: [], conflicts: new Set() });
  c.events.push(e); c.conflicts.add(+e.conflict_new_id); countryDeaths += +e.best || 0;
}
for (const [gw, c] of Object.entries(countries)) countries[gw] = { name: c.name, conflicts: [...c.conflicts].filter(Number.isFinite).sort((a, b) => a - b), series: seriesFromEvents(c.events.map(asSpan), months[0], latest) };

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
]);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify(data));
writeHeads('battlefield/data/realtime.json'); // realtime.head.json in step with it (integration/scripts/heads.mjs)
console.log(`${out.length} wars/warzones, ${events.length} events, months ${months[0]}..${latest}`);
