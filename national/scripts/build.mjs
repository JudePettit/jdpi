// Builds national/data/: one profile per country for National Analysis.
//   node national/scripts/build.mjs [--retro ../hp-retrospective]
// - PESTLE pressure, exactly as Country PESTLE scored it: for each of its 22 World Bank indicators, the latest value is
//   compared with the previous one; past the indicator's threshold it is "improving" or "worsening". A dimension's
//   pressure is the share of its scored indicators that are worsening; overall pressure is the mean of the dimensions.
//   Decade view: first vs last value within each decade.
// - Extra World Bank metrics (debt, military spending, trade, homicide, poverty, patents…), shown and compared.
// - Country overview from JDP-I data: system of government (Wikidata), leaders since 1926 and average tenure
//   (H&P Retrospective), armed conflict 1946–2025 (UCDP/PRIO, as in Retrospective Battlefield), wars this year
//   (Realtime Battlefield), calendar events since 1980, energy share (Kardashev Tracker), Encyclopaedia entry.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INDICATORS, DIMENSIONS } from './indicators.mjs';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const jdpi = resolve(here, '../..');
const arg = process.argv.indexOf('--retro');
const retroDir = resolve(arg > 0 ? process.argv[arg + 1] : join(jdpi, '../hp-retrospective'));
const OUT = join(jdpi, 'national/data');
const UA = { 'User-Agent': 'JDP-I National Analysis (https://jdpi.pages.dev; judep92@gmail.com)' };
const FIRST = 1980, LAST = new Date().getUTCFullYear() - 1, TODAY = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = p => JSON.parse(readFileSync(p, 'utf8'));
async function getJson(url, init = {}) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } }); if (r.ok) return r.json(); } catch {}
    await sleep(2000 * (i + 1));
  }
  throw new Error('Failed: ' + url.slice(0, 120));
}
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---- Countries: World Bank list (non-aggregates) + Wikidata codes and government
const wbCountries = (await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400'))[1].filter(c => c.region.id !== 'NA');
const sparql = `SELECT ?c ?iso3 ?iso2 ?num (GROUP_CONCAT(DISTINCT ?govL; separator="|") AS ?gov) ?capL ?hosL ?hogL WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?end }
  OPTIONAL { ?c wdt:P297 ?iso2 } OPTIONAL { ?c wdt:P299 ?num }
  OPTIONAL { ?c wdt:P122 ?gv. ?gv rdfs:label ?govL FILTER(LANG(?govL)="en") }
  OPTIONAL { ?c wdt:P36 ?cap. ?cap rdfs:label ?capL FILTER(LANG(?capL)="en") }
  OPTIONAL { ?c wdt:P35 ?hos. ?hos rdfs:label ?hosL FILTER(LANG(?hosL)="en") }
  OPTIONAL { ?c wdt:P6 ?hog. ?hog rdfs:label ?hogL FILTER(LANG(?hogL)="en") }
} GROUP BY ?c ?iso3 ?iso2 ?num ?capL ?hosL ?hogL`;
const wd = (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
const wdBy = new Map();
for (const b of wd) {
  const k = b.iso3.value, x = wdBy.get(k) || { qid: b.c.value.split('/').pop(), num: b.num?.value || null, iso2: b.iso2?.value || null, gov: new Set(), capital: null, hos: null, hog: null };
  (b.gov?.value || '').split('|').filter(Boolean).forEach(g => x.gov.add(g));
  x.capital ||= b.capL?.value || null; x.hos ||= b.hosL?.value || null; x.hog ||= b.hogL?.value || null;
  wdBy.set(k, x);
}
console.log(`${wbCountries.length} countries; Wikidata matched ${wbCountries.filter(c => wdBy.has(c.id)).length}`);

// ---- World Bank series
const series = new Map(wbCountries.map(c => [c.id, {}]));
for (const ind of INDICATORS) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${ind.code}?format=json&per_page=20000&date=${FIRST}:${LAST}&source=${ind.source}`;
  const r = await getJson(url).catch(e => { console.warn(ind.code, e.message); return null; });
  let n = 0;
  for (const row of r?.[1] || []) {
    const iso3 = row.countryiso3code, s = series.get(iso3);
    if (!s || row.value == null) continue;
    (s[ind.code] ||= []).push([+row.date, round(row.value, 4)]); n++;
  }
  for (const s of series.values()) s[ind.code]?.sort((a, b) => a[0] - b[0]);
  console.log(`${ind.code}: ${n} values`);
  await sleep(250);
}

// ---- PESTLE scoring (Country PESTLE's method)
function movement(ind, from, to) {
  if (!from || !to || ind.better == null) return null;
  const change = to[1] - from[1];
  if (Math.abs(change) <= ind.threshold) return 'stable';
  return (change > 0) === (ind.better === 'up') ? 'improving' : 'worsening';
}
function scorePeriod(s, pick) {
  const items = {}, dims = {};
  for (const ind of INDICATORS) {
    const pts = s[ind.code] || [];
    const [from, to] = pick(pts);
    const mv = movement(ind, from, to);
    if (to) items[ind.code] = [to[0], to[1], from ? from[0] : null, from ? round(to[1] - from[1], 4) : null, mv];
    if (!ind.core || !mv) continue;
    const d = (dims[ind.dimension] ||= { worsening: 0, scored: 0 });
    d.scored++; if (mv === 'worsening') d.worsening++;
  }
  const pressure = Object.fromEntries(DIMENSIONS.map(k => [k, dims[k]?.scored ? round(dims[k].worsening / dims[k].scored, 3) : null]));
  const vals = Object.values(pressure).filter(v => v != null);
  const core = INDICATORS.filter(i => i.core);
  return { items, pressure, overall: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null, coverage: round(core.filter(i => items[i.code]).length / core.length, 3) };
}
const latestPick = pts => { const to = pts.at(-1); if (!to) return [null, null]; const from = [...pts].reverse().find(p => p[0] < to[0] && p[0] >= to[0] - 5); return [from || null, to]; };
const decadePick = d => pts => { const inD = pts.filter(p => p[0] >= d && p[0] < d + 10); return inD.length >= 2 ? [inD[0], inD.at(-1)] : [null, inD[0] || null]; };

// ---- JDP-I data for the overview
const { COUNTRIES: RETRO_COUNTRIES } = existsSync(join(retroDir, 'scripts/countries.mjs')) ? await import(pathToFileURL(join(retroDir, 'scripts/countries.mjs')).href) : { COUNTRIES: {} };
const retro = existsSync(join(retroDir, 'data/countries.json')) ? json(join(retroDir, 'data/countries.json')) : { countries: {} };
const gwByIso3 = new Map(Object.entries(RETRO_COUNTRIES).map(([gw, c]) => [c.iso3, +gw]));
// Gleditsch–Ward codes for every state (the codes UCDP uses), from the countrycode project's code list.
const codelist = parseCsv(await (await fetch('https://raw.githubusercontent.com/vincentarelbundock/countrycode/main/dictionary/codelist_without_cldr.csv', { headers: UA })).text());
const nameKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
const aliasToIso3 = new Map();
for (const r of codelist) {
  if (r.iso3c && r.gwn && !gwByIso3.has(r.iso3c)) gwByIso3.set(r.iso3c, +r.gwn);
  if (r.iso3c) aliasToIso3.set(nameKey(r['country.name.en']), r.iso3c);
}
// UCDP's own country names that differ from the code list's.
for (const [n, iso] of Object.entries({ 'DR Congo': 'COD', Congo: 'COG', Russia: 'RUS', 'Ivory Coast': 'CIV', Myanmar: 'MMR', Yemen: 'YEM', Iran: 'IRN', Syria: 'SYR', Laos: 'LAO', 'South Korea': 'KOR', 'North Korea': 'PRK', 'United States of America': 'USA', 'Bosnia-Herzegovina': 'BIH', 'Kingdom of eSwatini': 'SWZ', Cambodia: 'KHM', Madagascar: 'MDG', Zimbabwe: 'ZWE', Serbia: 'SRB', Vietnam: 'VNM', Turkey: 'TUR', Egypt: 'EGY', Venezuela: 'VEN', Gambia: 'GMB', 'South Sudan': 'SSD', 'Central African Republic': 'CAF' })) aliasToIso3.set(nameKey(n), iso);
const wars = json(join(jdpi, 'battlefield/history/data/wars.json')).wars;
const realtime = json(join(jdpi, 'battlefield/data/realtime.json'));
const energy = json(join(jdpi, 'kardashev/data/energy.json'));
const KARDASHEV = { USA: 'usa', CHN: 'prc', IND: 'india', RUS: 'russia', JPN: 'japan', GBR: 'uk' };
const lakeIdx = existsSync(join(jdpi, 'lake/data/index.json')) ? new Set(json(join(jdpi, 'lake/data/index.json')).rows.map(r => r[0])) : new Set();
const calendar = ['1980s', '1990s', '2000s', '2010s', '2020s'].flatMap(d => existsSync(join(jdpi, `calendar/data/${d}.json`)) ? json(join(jdpi, `calendar/data/${d}.json`)).events : []);
const years = (a, b) => Math.max(0, (Date.parse(b || TODAY) - Date.parse(a)) / (365.25 * 864e5));

function leadership(gw) {
  const c = retro.countries[gw];
  if (!c) return null;
  const since = '1926-10-26';
  const ls = c.leaders.filter(l => (l.end || TODAY) >= since);
  const full = ls.filter(l => l.start >= since);
  const tenures = full.map(l => years(l.start, l.end)).filter(x => x > 0);
  const longest = [...ls].sort((a, b) => years(b.start, b.end) - years(a.start, a.end))[0];
  const current = c.leaders.filter(l => !l.end).at(-1) || c.leaders.at(-1);
  const party = current?.parties?.filter(p => !p.e).map(p => p.name)[0] || current?.parties?.[0]?.name || null;
  return {
    leaders100: ls.length,
    avgTenure: tenures.length ? round(tenures.reduce((a, b) => a + b, 0) / tenures.length, 1) : null,
    medianTenure: tenures.length ? round([...tenures].sort((a, b) => a - b)[Math.floor(tenures.length / 2)], 1) : null,
    longest: longest ? { name: longest.full || longest.name, years: round(years(longest.start, longest.end), 1), from: longest.start.slice(0, 4), to: longest.end ? longest.end.slice(0, 4) : 'present' } : null,
    irregular: c.leaders.filter(l => l.start >= since && l.entry && l.entry !== 'Regular').length,
    elections: c.events.filter(e => (e.type === 'election' || e.type === 'referendum') && e.date >= since).length,
    current: current ? { name: current.full || current.name, since: current.start, party, url: current.url || null } : null,
  };
}
function conflict(gw) {
  const ucdp = wars.filter(w => w.src === 'ucdp' && (w.loc.includes(gw) || w.states.includes(gw)));
  const onSoil = ucdp.filter(w => w.loc.includes(gw));
  const byYear = new Map();
  for (const w of onSoil) for (const [y, lvl] of w.years) { const x = byYear.get(y) || { n: 0, war: false }; x.n++; if (lvl === 2) x.war = true; byYear.set(y, x); }
  let onsets = 0, newWars = 0;
  for (const w of onSoil) {
    const ys = new Map(w.years);
    for (const [y, lvl] of w.years) { if (!ys.has(y - 1)) onsets++; if (lvl === 2 && ys.get(y - 1) !== 2) newWars++; }
  }
  const span = 2025 - 1946 + 1;
  const cow = wars.filter(w => w.src === 'cow' && (w.loc.includes(gw) || w.states.includes(gw)));
  const live = realtime.wars.filter(w => w.countries.some(n => aliasToIso3.get(nameKey(n)) === iso3Of.get(gw)));
  return {
    conflictYears: [...byYear.values()].reduce((s, x) => s + x.n, 0),
    avgConflictsPerYear: round([...byYear.values()].reduce((s, x) => s + x.n, 0) / span, 2),
    yearsWithConflict: byYear.size, yearsAtWar: [...byYear.values()].filter(x => x.war).length,
    onsetsPerDecade: round(onsets / (span / 10), 2), newWarsPerDecade: round(newWars / (span / 10), 2), newWarsPerYear: round(newWars / span, 3),
    conflictsAbroad: ucdp.filter(w => !w.loc.includes(gw)).length, cowWars1926_45: cow.length,
    active2026: live.map(w => ({ name: w.name, deaths: w.deaths, id: w.id })),
  };
}
function nameOfGw(gw) { return (retro.countries[gw]?.name || '').replace(/ \/.*$/, ''); }
const iso3Of = new Map([...gwByIso3].map(([iso, gw]) => [gw, iso]));

// ---- Assemble
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'series'), { recursive: true });
const countries = [];
for (const c of wbCountries) {
  const s = series.get(c.id), w = wdBy.get(c.id) || {}, gw = gwByIso3.get(c.id);
  const latest = scorePeriod(s, latestPick);
  const decades = Object.fromEntries([1980, 1990, 2000, 2010, 2020].map(d => { const x = scorePeriod(s, decadePick(d)); return [d, { pressure: x.pressure, overall: x.overall, coverage: x.coverage }]; }));
  const calEvents = calendar.filter(e => e.country === c.name || e.country === nameOfGw(gw) || aliasToIso3.get(nameKey(e.country)) === c.id);
  const ks = KARDASHEV[c.id] ? energy.steps.at(-1).polities.find(p => p.id === KARDASHEV[c.id]) : null;
  countries.push({
    iso3: c.id, iso2: c.iso2Code, num: w.num || null, name: c.name, region: c.region.value, income: c.incomeLevel.value, capital: w.capital || c.capitalCity || null,
    qid: w.qid || null, encyclopedia: w.qid && lakeIdx.has(w.qid) ? w.qid : null, gw: gw ?? null,
    government: [...(w.gov || [])].slice(0, 4), headOfState: w.hos || null, headOfGovernment: w.hog || null,
    latest: latest.items, pressure: latest.pressure, overall: latest.overall, coverage: latest.coverage, decades,
    leadership: gw != null && retro.countries[gw] ? leadership(gw) : null,
    conflict: gw != null ? conflict(gw) : null,
    calendar: calEvents.length ? Object.fromEntries(['election', 'leader', 'coup', 'conflict', 'assassination', 'crisis', 'treaty'].map(t => [t, calEvents.filter(e => e.type === t).length])) : null,
    energyShare: ks ? round(ks.share, 4) : null,
  });
  writeFileSync(join(OUT, `series/${c.id}.json`), JSON.stringify(s));
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({
  generated: new Date().toISOString(), years: [FIRST, LAST],
  indicators: INDICATORS.map(({ code, dimension, label, unit, better, threshold, core, source }) => ({ code, dimension, label, unit, better, threshold, core, source })),
  countries,
}));
console.log(`wrote ${countries.length} countries; with leadership data ${countries.filter(c => c.leadership).length}`);
