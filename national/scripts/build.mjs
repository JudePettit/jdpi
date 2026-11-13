// Builds national/data/: one profile per country for National Analysis.
//   node national/scripts/build.mjs [--retro ../hp-retrospective] [--atlas ../political-atlas] [--report <file.json>] [--allow-drop]
// - PESTLE pressure, exactly as Country PESTLE scored it: for each of its 22 World Bank indicators, the latest value is
//   compared with the previous one; past the indicator's threshold it is "improving" or "worsening". A dimension's
//   pressure is the share of its scored indicators that are worsening; overall pressure is the mean of the dimensions.
//   Decade view: first vs last value within each decade.
// - Extra World Bank metrics (debt, military spending, trade, homicide, poverty, patents…), shown and compared.
// - Country overview from JDP-I data: system of government (Wikidata), leaders since 1926 and average tenure
//   (H&P Retrospective), armed conflict 1946–2025 (UCDP/PRIO, as in Retrospective Battlefield), wars this year
//   (Realtime Battlefield), calendar events since 1980, energy share (Kardashev Tracker), Master Index entry.
// - Heads of state and government (Wikidata statements, with leader-corrections.json) and the current leader: the
//   holder of the office Political Atlas names as the most powerful (--atlas, the political-atlas folder; a regent
//   acting for the head of state, as in Liechtenstein, where a 'regent' correction names him), or else of
//   the office the system of government gives (leader-offices.json where the data cannot decide). leaders.mjs has the
//   rules. The build lists where the Atlas and these heads name different people for that office, for a person to look
//   at; --report writes every country's leader, rule and those disagreements to a JSON file.
// Guard: nothing is written when an indicator's countries halve, or the countries, their Wikidata matches, GW codes or
// leadership data fall by a tenth, against the committed index (a World Bank series, the code list or the
// Retrospective that failed); --allow-drop writes anyway.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INDICATORS, DIMENSIONS } from './indicators.mjs';
import { writeBrief } from './brief.mjs';
import { headsFromRows, applyCorrections, currentLeader, leaderOffice, readAtlas, atlasDisagreement, peopleInIndex, OFFICES } from './leaders.mjs';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const jdpi = resolve(here, '../..');
// --name <value> or --name=<value>
const option = name => { const i = process.argv.indexOf(`--${name}`); if (i > 0) return process.argv[i + 1]; return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null; };
const retroDir = resolve(option('retro') || join(jdpi, '../hp-retrospective'));
const atlasDir = option('atlas') ? resolve(option('atlas')) : null, reportFile = option('report');
const OUT = join(jdpi, 'national/data');
const UA = { 'User-Agent': 'JDP-I National Analysis (https://jdpi.pages.dev)' };
const FIRST = 1980, LAST = new Date().getUTCFullYear() - 1, TODAY = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = p => JSON.parse(readFileSync(p, 'utf8'));
async function getJson(url, init = {}) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } }); if (r.ok) return await r.json(); } catch {} // a cut-off body is tried again too
    await sleep(2000 * (i + 1));
  }
  throw new Error('Failed: ' + url.slice(0, 120));
}
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---- Countries: World Bank list (non-aggregates) + Wikidata codes and government
const wbCountries = (await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400'))[1].filter(c => c.region.id !== 'NA');
const sparql = `SELECT ?c ?iso3 ?iso2 ?num (GROUP_CONCAT(DISTINCT ?govL; separator="|") AS ?gov) ?capL WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?end }
  OPTIONAL { ?c wdt:P297 ?iso2 } OPTIONAL { ?c wdt:P299 ?num }
  OPTIONAL { ?c wdt:P122 ?gv. ?gv rdfs:label ?govL FILTER(LANG(?govL)="en") }
  OPTIONAL { ?c wdt:P36 ?cap. ?cap rdfs:label ?capL FILTER(LANG(?capL)="en") }
} GROUP BY ?c ?iso3 ?iso2 ?num ?capL`;
// The offices of head of state (P1906) and of government (P1313), a request of their own (in the query above they
// would reorder its forms of government): one office for both is an executive presidency (leaders.mjs, leaderOffice).
const officesQuery = `SELECT ?c ?hosO ?hogO WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?end }
  { ?c wdt:P1906 ?hosO } UNION { ?c wdt:P1313 ?hogO }
}`;
// Wikidata's ISO code for Kosovo is XKS; the World Bank's is XKX (which is why Kosovo had no Wikidata item or heads).
const WD_ISO3 = { XKS: 'XKX' };
const wd = (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
const wdBy = new Map();
for (const b of wd) {
  const k = WD_ISO3[b.iso3.value] || b.iso3.value, x = wdBy.get(k) || { qid: b.c.value.split('/').pop(), num: b.num?.value || null, iso2: b.iso2?.value || null, gov: new Set(), capital: null, hosOffices: new Set(), hogOffices: new Set() };
  (b.gov?.value || '').split('|').filter(Boolean).forEach(g => x.gov.add(g));
  x.capital ||= b.capL?.value || null;
  wdBy.set(k, x);
}
await sleep(1000);
const wdByQid = new Map([...wdBy.values()].map(x => [x.qid, x]));
for (const b of (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(officesQuery), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings) {
  const x = wdByQid.get(b.c.value.split('/').pop());
  if (b.hosO) x?.hosOffices.add(b.hosO.value);
  if (b.hogO) x?.hogOffices.add(b.hogO.value);
}
// Heads of state (P35) and government (P6), read as statements, not through the truthy wdt: shortcut (which returns
// ended statements too), and the "position held" (P39) statements of the country's offices of head of state (P1906)
// and government (P1313), ended ones included, against which the country's statements are checked (two requests);
// leaders.mjs chooses among them. The label is the English one, or else the item's "mul" label, which Wikidata now uses
// in place of an English one for many people (Donald Trump and Claudia Sheinbaum have no "en" label: why the United
// States and Mexico had no heads).
const HEAD_FIELDS = `?st wikibase:rank ?rank. FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?st pq:P1366 ?repl }
  OPTIONAL { ?h rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?h rdfs:label ?mul FILTER(LANG(?mul)="mul") }
  BIND(COALESCE(?en, ?mul) AS ?hL) OPTIONAL { ?h wdt:P570 ?dead } BIND(EXISTS { ?h wdt:P31 wd:Q5 } AS ?human)`;
const headsQuery = `SELECT ?c ?prop ?h ?hL ?rank ?start ?end ?repl ?dead ?human WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?gone }
  VALUES (?p ?ps ?prop) { (p:P35 ps:P35 "hos") (p:P6 ps:P6 "hog") }
  ?c ?p ?st. ?st ?ps ?h. ${HEAD_FIELDS}
}`;
const officeQuery = `SELECT ?c ?prop ?h ?hL ?rank ?start ?end ?repl ?dead ?human WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?gone }
  VALUES (?op ?prop) { (wdt:P1906 "hos") (wdt:P1313 "hog") }
  ?c ?op ?office. ?h p:P39 ?st. ?st ps:P39 ?office. ${HEAD_FIELDS}
}`;
const sparqlRows = async q => (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
await sleep(1000);
const headRows = await sparqlRows(headsQuery);
await sleep(1000);
const officeRows = await sparqlRows(officeQuery);
console.log(`heads: ${headRows.length} country statements, ${officeRows.length} office statements`);
const headsByQid = headsFromRows(headRows, officeRows, TODAY);
const heads = new Map([...wdBy].map(([iso3, x]) => { const h = headsByQid.get(x.qid) || {}; return [iso3, { headOfState: h.hos || null, headOfGovernment: h.hog || null, vacant: (h.vacant || []).map(v => (v === 'hos' ? 'headOfState' : 'headOfGovernment')) }]; }));
// Corrections (leader-corrections.json), each applied only while Wikidata still gives the value it replaces.
const fixes = applyCorrections(heads, json(join(here, 'leader-corrections.json')).corrections || [], m => console.log(m));
for (const h of heads.values()) h.vacant = h.vacant.filter(o => !h[o]?.name); // a correction fills an office
console.log(`heads: ${[...heads.values()].filter(h => h.headOfState).length} of state, ${[...heads.values()].filter(h => h.headOfGovernment).length} of government; corrections: ${fixes.applied.length} applied, ${fixes.lapsed.length} lapsed`);
console.log(`${wbCountries.length} countries; Wikidata matched ${wbCountries.filter(c => wdBy.has(c.id)).length}`);

// ---- Which office the current leader holds: Political Atlas's executive.leader, else leader-offices.json, else the
// system of government (leaders.mjs, leaderOffice).
const atlas = atlasDir ? readAtlas(atlasDir, json) : null;
if (atlasDir && !atlas) throw new Error(`--atlas ${atlasDir}: no data/manifest.json there`);
if (atlas) console.log(`Political Atlas: ${atlas.size} records (${atlasDir}); the current leader holds the office each names`);
else console.warn('Political Atlas: no --atlas <political-atlas folder>, so every current leader is chosen by the system of government');
const decisions = new Map((json(join(here, 'leader-offices.json')).decisions || []).map(d => [d.iso3, d]));
// A head of state who heads another country too (a monarch's realms and territories).
const hosCount = new Map();
for (const h of heads.values()) if (h.headOfState?.qid) hosCount.set(h.headOfState.qid, (hosCount.get(h.headOfState.qid) || 0) + 1);
const leaderLog = [], disagreements = [];

// ---- World Bank series
const series = new Map(wbCountries.map(c => [c.id, {}]));
for (const ind of INDICATORS) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${ind.code}?format=json&per_page=20000&date=${FIRST}:${LAST}&source=${ind.source}`;
  // The World Bank answers a moved, archived or mistyped series with a 200 and a message instead of rows, and a reply
  // longer than a page would be cut short (it asks for 20,000 rows a page; a series has about 12,500 today).
  // Either leaves the indicator empty here; the guard below stops the build if it had values before.
  const rows = await getJson(url).then(r => {
    if (!Array.isArray(r?.[1])) throw new Error(r?.[0]?.message?.map(m => m.value).join('; ') || 'no rows');
    if (r[0].pages > 1) throw new Error(`${r[0].total} rows, more than one page`);
    return r[1];
  }).catch(e => { console.warn(`${ind.code}: ${e.message}`); return []; });
  let n = 0;
  for (const row of rows) {
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
// Gleditsch–Ward codes for every state (the codes UCDP uses), from the countrycode project's code list. An error page
// would parse to no rows and cost about a hundred countries their codes, conflict history and wars this year.
// Read at a fixed commit, not the moving main branch, so an upstream change cannot alter the codes unseen. To update,
// set COUNTRYCODE_COMMIT to a newer commit of vincentarelbundock/countrycode and rebuild (2 October 2026: "Update
// dictionaries (#390)").
const COUNTRYCODE_COMMIT = '9546912ab023a6445cbe7b5620f5103446d84e52';
const codes = await fetch(`https://raw.githubusercontent.com/vincentarelbundock/countrycode/${COUNTRYCODE_COMMIT}/dictionary/codelist_without_cldr.csv`, { headers: UA });
if (!codes.ok) throw new Error(`countrycode code list: HTTP ${codes.status}`);
const codelist = parseCsv(await codes.text());
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

function leadership(gw, current) {
  const c = retro.countries[gw];
  if (!c) return null;
  const since = '1926-10-26';
  const ls = c.leaders.filter(l => (l.end || TODAY) >= since);
  const full = ls.filter(l => l.start >= since);
  const tenures = full.map(l => years(l.start, l.end)).filter(x => x > 0);
  const longest = [...ls].sort((a, b) => years(b.start, b.end) - years(a.start, a.end))[0];
  return {
    leaders100: ls.length,
    avgTenure: tenures.length ? round(tenures.reduce((a, b) => a + b, 0) / tenures.length, 1) : null,
    medianTenure: tenures.length ? round([...tenures].sort((a, b) => a - b)[Math.floor(tenures.length / 2)], 1) : null,
    longest: longest ? { name: longest.full || longest.name, years: round(years(longest.start, longest.end), 1), from: longest.start.slice(0, 4), to: longest.end ? longest.end.slice(0, 4) : 'present' } : null,
    irregular: c.leaders.filter(l => l.start >= since && l.entry && l.entry !== 'Regular').length,
    elections: c.events.filter(e => (e.type === 'election' || e.type === 'referendum') && e.date >= since).length,
    current, // the country's `leader`, repeated here for the Integration Hub's catalog
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

// ---- The guard, against the committed index. An indicator's coverage is the countries with a latest value, which
// they have exactly when their series has a point. World Bank revisions move a few countries, a failed or deprecated
// series all of them; a failed code list or Retrospective costs dozens of countries their GW code or leadership.
const OLD = existsSync(join(OUT, 'index.json')) ? json(join(OUT, 'index.json')) : { indicators: [], countries: [] };
// An indicator taken out of indicators.mjs is a decision, not a loss: only the ones still listed are compared.
const coverage = Object.fromEntries(OLD.indicators.filter(i => INDICATORS.some(x => x.code === i.code)).map(i => [i.code, OLD.countries.filter(c => c.latest?.[i.code]).length]));
const covered = Object.fromEntries(INDICATORS.map(i => [i.code, wbCountries.filter(c => series.get(c.id)[i.code]?.length).length]));
const tally = (list, qid, gw, lead) => ({ countries: list.length, 'with Wikidata': list.filter(qid).length, 'with a GW code': list.filter(gw).length, 'with leadership': list.filter(lead).length });
refuseIfLost([
  ...lostCounts(coverage, covered).map(x => `${x} countries`),
  ...lostCounts(tally(OLD.countries, c => c.qid, c => c.gw != null, c => c.leadership),
    tally(wbCountries, c => wdBy.has(c.id), c => gwByIso3.has(c.id), c => retro.countries[gwByIso3.get(c.id)]), { keep: 0.9 }),
  // The heads query is a second request: a failed or changed one would leave every country without heads.
  ...lostCounts({ 'with a head of state': OLD.countries.filter(c => c.headOfState).length, 'with a head of government': OLD.countries.filter(c => c.headOfGovernment).length },
    { 'with a head of state': wbCountries.filter(c => heads.get(c.id)?.headOfState).length, 'with a head of government': wbCountries.filter(c => heads.get(c.id)?.headOfGovernment).length }, { keep: 0.9 }),
]);

// ---- Assemble (in memory; national/data is replaced only once every country is done)
const countries = [], seriesFiles = [];
for (const c of wbCountries) {
  const s = series.get(c.id), w = wdBy.get(c.id) || {}, gw = gwByIso3.get(c.id);
  const h = heads.get(c.id) || {}, rc = gw != null ? retro.countries[gw] : null;
  const ar = atlas?.get(c.id) || null, sameOffice = [...(w.hosOffices || [])].some(o => w.hogOffices.has(o));
  const vacant = [...(h.vacant || [])];
  // The Atlas's "Vacant" counts where National Analysis has no holder either (Haiti's head of state).
  for (const o of OFFICES) if (!h[o]?.name && /^\s*vacant\b/i.test(ar?.executive?.[o]?.name || '') && !vacant.includes(o)) vacant.push(o);
  const choice = leaderOffice({ atlas: ar, decision: decisions.get(c.id), government: [...(w.gov || [])], heads: h, sameOffice, sharedHead: (hosCount.get(h.headOfState?.qid) || 0) > 1, retro: rc?.leaders });
  const leader = currentLeader(choice, h, { retro: rc?.leaders, vacant });
  const differ = ar ? atlasDisagreement(ar, choice.office, h, vacant) : null;
  if (differ) disagreements.push({ iso3: c.id, country: c.name, ...differ });
  if (ar && decisions.has(c.id)) console.log(`leader-offices.json: ${c.id} is decided by the Atlas (${ar.executive?.leader}); its decision (${decisions.get(c.id).office}) is not needed`);
  leaderLog.push({ iso3: c.id, country: c.name, office: choice.office, rule: choice.rule, leader: leader?.name || null });
  const latest = scorePeriod(s, latestPick);
  const decades = Object.fromEntries([1980, 1990, 2000, 2010, 2020].map(d => { const x = scorePeriod(s, decadePick(d)); return [d, { pressure: x.pressure, overall: x.overall, coverage: x.coverage }]; }));
  const calEvents = calendar.filter(e => e.country === c.name || e.country === nameOfGw(gw) || aliasToIso3.get(nameKey(e.country)) === c.id);
  const ks = KARDASHEV[c.id] ? energy.steps.at(-1).polities.find(p => p.id === KARDASHEV[c.id]) : null;
  const people = peopleInIndex({ headOfStateQid: h.headOfState?.qid, headOfGovernmentQid: h.headOfGovernment?.qid, leader }, q => lakeIdx.has(q));
  countries.push({
    iso3: c.id, iso2: c.iso2Code, num: w.num || null, name: c.name, region: c.region.value, income: c.incomeLevel.value, capital: w.capital || c.capitalCity || null,
    qid: w.qid || null, encyclopedia: w.qid && lakeIdx.has(w.qid) ? w.qid : null, gw: gw ?? null,
    government: [...(w.gov || [])].slice(0, 4), headOfState: h.headOfState?.name || null, headOfGovernment: h.headOfGovernment?.name || null,
    headOfStateQid: h.headOfState?.qid || null, headOfGovernmentQid: h.headOfGovernment?.qid || null,
    ...(h.regent?.name ? { regent: h.regent.name, regentQid: h.regent.qid || null } : {}), // who exercises the head of state's powers for him (a 'regent' correction)
    ...(people.length ? { peopleInIndex: people } : {}), // those of these IDs with a Master Index entry: the page tags only them
    ...(vacant.length ? { vacant } : {}), // offices with no holder now: the page shows "Vacant"
    leader, // the current leader, { name, qid, office, rule, since, party, url, source }, or null (leaders.mjs)
    latest: latest.items, pressure: latest.pressure, overall: latest.overall, coverage: latest.coverage, decades,
    leadership: rc ? leadership(gw, leader) : null,
    conflict: gw != null ? conflict(gw) : null,
    calendar: calEvents.length ? Object.fromEntries(['election', 'referendum', 'party', 'leader', 'inauguration', 'resignation', 'coup', 'conflict', 'ceasefire', 'assassination', 'crisis', 'protest', 'treaty', 'summit', 'sanctions', 'vote', 'court'].map(t => [t, calEvents.filter(e => e.type === t).length])) : null,
    energyShare: ks ? round(ks.share, 4) : null,
  });
  seriesFiles.push([join(OUT, `series/${c.id}.json`), JSON.stringify(s)]);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'series'), { recursive: true });
for (const [file, text] of seriesFiles) writeFileSync(file, text);
const index = {
  generated: new Date().toISOString(), years: [FIRST, LAST],
  indicators: INDICATORS.map(({ code, dimension, label, unit, better, threshold, core, source }) => ({ code, dimension, label, unit, better, threshold, core, source })),
  countries,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
writeBrief(index); // the small file Geopolitical Volatility reads (brief.mjs)
console.log(`wrote ${countries.length} countries; with leadership data ${countries.filter(c => c.leadership).length}`);
const byRule = {};
for (const l of leaderLog) byRule[l.rule] = (byRule[l.rule] || 0) + 1;
console.log(`current leader, by the rule that chose the office: ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(', ')}`);
const open = leaderLog.filter(l => l.leader && ['retrospective', 'undecided'].includes(l.rule));
if (open.length) console.log(`no data decides the office for ${open.length}: ${open.map(l => `${l.iso3} (${l.rule}: ${l.office})`).join(', ')}; add a decision to leader-offices.json`);
for (const d of disagreements) console.log(`Atlas and National Analysis differ: ${d.iso3} ${d.office}: Atlas "${d.atlas ?? '(none)'}", National Analysis "${d.national ?? '(none)'}"`);
if (atlas) console.log(`${disagreements.length} disagreements with the Atlas, for a person to look at`);
if (reportFile) writeFileSync(resolve(reportFile), JSON.stringify({ generated: index.generated, atlas: atlas ? atlasDir : null, leaders: leaderLog, disagreements }, null, 1));
