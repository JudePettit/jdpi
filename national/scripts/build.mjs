// Builds national/data/: one profile per country for National Analysis.
//   node national/scripts/build.mjs [--retro ../hp-retrospective] [--atlas ../political-atlas] [--report <file.json>] [--allow-drop]
// - PESTLE pressure, exactly as Country PESTLE scored it: for each of its 22 World Bank indicators, the latest value is
//   compared with the previous one; past the indicator's threshold it is "improving" or "worsening". A dimension's
//   pressure is the share of its scored indicators that are worsening; overall pressure is the mean of the dimensions.
//   Decade view: first vs last value within each decade (kept in index.json; the page has moved to the yearly layer).
//   The rule is national/lib/pestle.js. The yearly layer, national/data/years/ (years.mjs), holds every indicator by
//   year and each year's pressure (that year's values, or ones up to two years older), for the time slider (NA-05).
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
// - The World Bank's governance scores with their 90% range (national/data/governance/, indicators.mjs governanceFiles),
//   fetched again each run; the stand-in series (standins.json, omni/scripts/build-standins.mjs) are not this build's.
//   Both are carried across the emptying of national/data (carry.mjs): a failed governance fetch keeps the files there.
// Guard: nothing is written when an indicator's countries halve, or the countries, their Wikidata matches, GW codes or
// leadership data fall by a tenth, against the committed index (a World Bank series, the code list or the
// Retrospective that failed); --allow-drop writes anyway.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INDICATORS, DIMENSIONS, governanceFiles, writeGovernance } from './indicators.mjs';
import { readKept, governanceOrKept, writeKept } from './carry.mjs';
import { writeBrief } from './brief.mjs';
import { headsFromRows, applyCorrections, currentLeader, leaderOffice, readAtlas, atlasDisagreement, peopleInIndex, plainName, OFFICES } from './leaders.mjs';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';
import { writeHeads } from '../../integration/scripts/heads.mjs';
import { scorePeriod as scoreWith, latestPick, decadePick } from '../lib/pestle.js';
import { yearsFiles, writeYears } from './years.mjs';
import { leadership as leadershipOf, conflict as conflictOf, retroCodes, gwCodes, officeTerm, placeKeys } from './overview.mjs';

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
    let wait = 2000 * (i + 1);
    try {
      const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } });
      if (r.ok) return await r.json();
      // "Too many requests" (Wikidata's query service after a long query, 26 November 2026): wait as long as it asks,
      // or a minute where it does not say, at most two.
      if (r.status === 429) wait = Math.min(120, Number(r.headers.get('retry-after')) || 60) * 1000;
      console.warn(`HTTP ${r.status} (try ${i + 1} of 5): ${url.slice(0, 80)}`);
    } catch (e) { console.warn(`${e.message} (try ${i + 1} of 5): ${url.slice(0, 80)}`); } // a cut-off body is tried again too
    await sleep(wait);
  }
  throw new Error('Failed: ' + url.slice(0, 120));
}
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---- The Retrospective (hp-retrospective), in either of its shapes (overview.mjs retroCodes): its records for a country.
const RETRO_MOD = existsSync(join(retroDir, 'scripts/countries.mjs')) ? await import(pathToFileURL(join(retroDir, 'scripts/countries.mjs')).href) : {};
const RETRO_COUNTRIES = RETRO_MOD.COUNTRIES || {}, RETRO_OLD_KEYS = RETRO_MOD.OLD_KEYS || null;
const retro = existsSync(join(retroDir, 'data/countries.json')) ? json(join(retroDir, 'data/countries.json')) : { countries: {} };
const retroRecords = iso3 => retroCodes(RETRO_COUNTRIES, iso3).map(k => retro.countries[k]).filter(Boolean);
// The record that holds the country now: the one whose cover runs to today (spans, from 20 November 2026), else the last.
const retroNow = iso3 => { const rs = retroRecords(iso3); return rs.find(r => (r.spans || []).some(([, e]) => !e)) || rs.at(-1) || null; };
// That record's key in the Retrospective (its first Wikidata item, under 'retro-countries/2'), which the page's link to
// the Retrospective opens (#c=<key>; 20 November 2026, MP-11: in place of a Gleditsch and Ward number). Null where the
// Retrospective does not cover the country, or still keys it by number.
const retroKey = iso3 => { const now = retroNow(iso3); const k = now && retroCodes(RETRO_COUNTRIES, iso3).find(x => retro.countries[x] === now); return typeof k === 'string' ? k : null; };
const wars = json(join(jdpi, 'battlefield/history/data/wars.json')).wars;

// --overview-only (20 November 2026): each committed country's conflict figures again from the Retrospective
// Battlefield's wars.json, by Wikidata item (overview.mjs placeKeys and conflict), its wars this year kept as built, and
// each country's key in the Retrospective (retro, retroKey above); nothing else is read or fetched. Order of steps: read the committed index, the Retrospective and wars.json; count;
// write index.json once every country is done, then index.head.json from it.
if (process.argv.includes('--overview-only')) {
  const idx = json(join(OUT, 'index.json'));
  for (const c of idx.countries) {
    c.retro = retroKey(c.iso3);
    if (!c.conflict) continue;
    const { active2026 } = c.conflict;
    c.conflict = { ...conflictOf(placeKeys(c.iso3, c.qid, retroRecords(c.iso3)), wars), active2026 };
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(idx));
  writeHeads(join(OUT, 'index.json'), { root: jdpi }); // index.head.json in step with it; brief.json reads only active2026, kept
  console.log(`conflict figures again for ${idx.countries.filter(c => c.conflict).length} countries; Germany's wars of 1926–45: ${idx.countries.find(c => c.iso3 === 'DEU')?.conflict?.wars1926_45}`);
  process.exit(0);
}

// ---- Countries: World Bank list (non-aggregates) + Wikidata codes and government
const wbCountries = (await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400'))[1].filter(c => c.region.id !== 'NA');
const sparql = `SELECT ?c ?iso3 ?iso2 ?num (GROUP_CONCAT(DISTINCT ?govL; separator="|") AS ?gov) ?capL WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?end }
  OPTIONAL { ?c wdt:P297 ?iso2 } OPTIONAL { ?c wdt:P299 ?num }
  OPTIONAL { ?c wdt:P122 ?gv. ?c p:P122 ?gst. ?gst ps:P122 ?gv. FILTER NOT EXISTS { ?gst pq:P582 ?gend }
    ?gv rdfs:label ?govL FILTER(LANG(?govL)="en") }
  OPTIONAL { ?c wdt:P36 ?cap. ?cap rdfs:label ?capL FILTER(LANG(?capL)="en") }
} GROUP BY ?c ?iso3 ?iso2 ?num ?capL`;
// Forms of government (P122): the truthy ones (wdt:, best rank) whose statement has no end time (pq:P582). The truthy
// shortcut alone gives ended statements too: Mexico (Q96) showed "empire", whose two statements end in 1823 and 1867
// (the second readers, 26 November 2026). GROUP_CONCAT has no fixed order, so the build sorts the labels before it keeps
// four (government, below), and a rerun shows the same four.
// The offices of head of state (P1906) and of government (P1313), a request of their own (in the query above they
// would reorder its forms of government): one office for both is an executive presidency (leaders.mjs, leaderOffice).
// With each office its term length (P2097, amount and unit), where Wikidata gives one: overview.mjs (officeTerm) keeps
// it for an office held together for a fixed term (San Marino's Captains Regent, Q258045: 0.5 years).
const officesQuery = `SELECT ?c ?hosO ?hogO ?termAmt ?termUnit WHERE {
  ?c wdt:P298 ?iso3. FILTER NOT EXISTS { ?c wdt:P576 ?end }
  { ?c wdt:P1906 ?hosO OPTIONAL { ?hosO p:P2097/psv:P2097 [ wikibase:quantityAmount ?termAmt; wikibase:quantityUnit ?termUnit ] } }
  UNION { ?c wdt:P1313 ?hogO OPTIONAL { ?hogO p:P2097/psv:P2097 [ wikibase:quantityAmount ?termAmt; wikibase:quantityUnit ?termUnit ] } }
}`;
// Wikidata's ISO code for Kosovo is XKS; the World Bank's is XKX (which is why Kosovo had no Wikidata item or heads).
const WD_ISO3 = { XKS: 'XKX' };
const wd = (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
const wdBy = new Map();
for (const b of wd) {
  const k = WD_ISO3[b.iso3.value] || b.iso3.value, x = wdBy.get(k) || { qid: b.c.value.split('/').pop(), num: b.num?.value || null, iso2: b.iso2?.value || null, gov: new Set(), capital: null, hosOffices: new Set(), hogOffices: new Set() };
  (b.gov?.value || '').split('|').filter(Boolean).forEach(g => x.gov.add(g));
  if (b.capL?.value) (x.capitals ||= new Set()).add(b.capL.value);
  wdBy.set(k, x);
}
await sleep(1000);
const wdByQid = new Map([...wdBy.values()].map(x => [x.qid, x]));
for (const b of (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(officesQuery), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings) {
  const x = wdByQid.get(b.c.value.split('/').pop());
  if (b.hosO) x?.hosOffices.add(b.hosO.value);
  if (b.hogO) x?.hogOffices.add(b.hogO.value);
  // The offices' term lengths, by office (its QID) and by which head it is: { headOfState: Map(QID → [{ amount, unit }]) }.
  const o = b.hosO || b.hogO, which = b.hosO ? 'headOfState' : 'headOfGovernment';
  if (x && o) {
    const terms = (x.terms ||= { headOfState: new Map(), headOfGovernment: new Map() })[which], q = o.value.split('/').pop();
    if (!terms.has(q)) terms.set(q, []);
    if (b.termAmt && b.termUnit) terms.get(q).push({ amount: b.termAmt.value, unit: b.termUnit.value.split('/').pop() });
  }
}
// Heads of state (P35) and government (P6), read as statements, not through the truthy wdt: shortcut (which returns
// ended statements too), and the "position held" (P39) statements of the country's offices of head of state (P1906)
// and government (P1313), ended ones included, against which the country's statements are checked (four requests, and four for the offices);
// leaders.mjs chooses among them. The label is the English one, or else the item's "mul" label, which Wikidata now uses
// in place of an English one for many people (Donald Trump and Claudia Sheinbaum have no "en" label: why the United
// States and Mexico had no heads).
const HEAD_FIELDS = `?st wikibase:rank ?rank. FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?st pq:P1366 ?repl }
  OPTIONAL { ?h rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?h rdfs:label ?mul FILTER(LANG(?mul)="mul") }
  BIND(COALESCE(?en, ?mul) AS ?hL) OPTIONAL { ?h wdt:P570 ?dead } BIND(EXISTS { ?h wdt:P31 wd:Q5 } AS ?human)`;
// The country statements in four parts too, by property and by codes before and from M: asked for at once, the reply
// was cut short at the same place five times running on 26 November 2026 (the query service's 60-second limit).
const HEAD_PARTS = [['p:P35', 'ps:P35', 'hos'], ['p:P6', 'ps:P6', 'hog']].flatMap(([p, ps, prop]) => ['?iso3 < "M"', '?iso3 >= "M"'].map(half => ({ p, ps, prop, half })));
const headsQuery = ({ p, ps, prop, half }) => `SELECT ?c ?prop ?h ?hL ?rank ?start ?end ?repl ?dead ?human WHERE {
  ?c wdt:P298 ?iso3. FILTER(${half}) FILTER NOT EXISTS { ?c wdt:P576 ?gone }
  VALUES (?p ?ps ?prop) { (${p} ${ps} "${prop}") }
  ?c ?p ?st. ?st ?ps ?h. ${HEAD_FIELDS}
}`;
// The office statements are asked for in four parts, by office and by codes before and from M: asked for at once
// (13,726 rows on 26 November 2026), the query ran past the query service's 60-second limit, which then cuts the reply
// short with a TimeoutException, and the build stopped; each part takes well under that.
const OFFICE_PARTS = [['wdt:P1906', 'hos'], ['wdt:P1313', 'hog']].flatMap(([op, prop]) => ['?iso3 < "M"', '?iso3 >= "M"'].map(half => ({ op, prop, half })));
const officeQuery = ({ op, prop, half }) => `SELECT ?c ?prop ?h ?hL ?rank ?start ?end ?repl ?dead ?human WHERE {
  ?c wdt:P298 ?iso3. FILTER(${half}) FILTER NOT EXISTS { ?c wdt:P576 ?gone }
  VALUES (?op ?prop) { (${op} "${prop}") }
  ?c ?op ?office. ?h p:P39 ?st. ?st ps:P39 ?office. ${HEAD_FIELDS}
}`;
const sparqlRows = async q => (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
await sleep(1000);
const headRows = [];
for (const part of HEAD_PARTS) { await sleep(1000); headRows.push(...await sparqlRows(headsQuery(part))); }
const officeRows = [];
for (const part of OFFICE_PARTS) { await sleep(1000); officeRows.push(...await sparqlRows(officeQuery(part))); }
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

// ---- PESTLE scoring (Country PESTLE's method): national/lib/pestle.js, the one rule the page and the yearly layer use too
// (latestPick for Latest, decadePick for the decades kept in index.json until nothing reads them, yearPick for a year).
const scorePeriod = (s, pick) => scoreWith(s, pick, INDICATORS, DIMENSIONS);

// ---- JDP-I data for the overview
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
// The Retrospective's codes first, then the code list's, then a predecessor's row where the code list files a present
// state's code there (Yemen, 678: overview.mjs GW_PREDECESSOR).
const gwByIso3 = gwCodes(RETRO_COUNTRIES, codelist, msg => console.warn(msg), RETRO_OLD_KEYS);
const aliasToIso3 = new Map();
for (const r of codelist) if (r.iso3c) aliasToIso3.set(nameKey(r['country.name.en']), r.iso3c);
// UCDP's own country names that differ from the code list's.
for (const [n, iso] of Object.entries({ 'DR Congo': 'COD', Congo: 'COG', Russia: 'RUS', 'Ivory Coast': 'CIV', Myanmar: 'MMR', Yemen: 'YEM', Iran: 'IRN', Syria: 'SYR', Laos: 'LAO', 'South Korea': 'KOR', 'North Korea': 'PRK', 'United States of America': 'USA', 'Bosnia-Herzegovina': 'BIH', 'Kingdom of eSwatini': 'SWZ', Cambodia: 'KHM', Madagascar: 'MDG', Zimbabwe: 'ZWE', Serbia: 'SRB', Vietnam: 'VNM', Turkey: 'TUR', Egypt: 'EGY', Venezuela: 'VEN', Gambia: 'GMB', 'South Sudan': 'SSD', 'Central African Republic': 'CAF' })) aliasToIso3.set(nameKey(n), iso);
const realtime = json(join(jdpi, 'battlefield/data/realtime.json'));
const energy = json(join(jdpi, 'kardashev/data/energy.json'));
const KARDASHEV = { USA: 'usa', CHN: 'prc', IND: 'india', RUS: 'russia', JPN: 'japan', GBR: 'uk' };
const lakeIdx = existsSync(join(jdpi, 'lake/data/index.json')) ? new Set(json(join(jdpi, 'lake/data/index.json')).rows.map(r => r[0])) : new Set();
const calendar = ['1980s', '1990s', '2000s', '2010s', '2020s'].flatMap(d => existsSync(join(jdpi, `calendar/data/${d}.json`)) ? json(join(jdpi, `calendar/data/${d}.json`)).events : []);

// Leadership (overview.mjs), over every record the Retrospective files the country under (Germany: two, to 1945 and
// from 1949), under either of its shapes; conflict by Wikidata item (placeKeys), not by code.
const leadership = (iso3, current, term) => leadershipOf(retroRecords(iso3), current, TODAY, term);
// The Realtime Battlefield's quiet group ("other-recorded": under 25 deaths in a country this year, many countries in
// one group) is not a war active in any one of them, and its deaths are the whole group's: it is left out here.
const conflict = (iso3, qid) => conflictOf(placeKeys(iso3, qid, retroRecords(iso3)), wars, realtime.wars.filter(w => w.id !== 'other-recorded' && w.countries.some(n => aliasToIso3.get(nameKey(n)) === iso3)));
const retroName = iso3 => (retroNow(iso3)?.name || '').replace(/ \/.*$/, '');

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
    tally(wbCountries, c => wdBy.has(c.id), c => gwByIso3.has(c.id), c => retroRecords(c.id).length), { keep: 0.9 }),
  // The heads query is a second request: a failed or changed one would leave every country without heads.
  ...lostCounts({ 'with a head of state': OLD.countries.filter(c => c.headOfState).length, 'with a head of government': OLD.countries.filter(c => c.headOfGovernment).length },
    { 'with a head of state': wbCountries.filter(c => heads.get(c.id)?.headOfState).length, 'with a head of government': wbCountries.filter(c => heads.get(c.id)?.headOfGovernment).length }, { keep: 0.9 }),
]);

// ---- Assemble (in memory; national/data is replaced only once every country is done)
const countries = [], seriesFiles = [];
const oldBy = new Map(OLD.countries.map(c => [c.iso3, c]));
// Where Wikidata gives more than one capital (South Africa three, Sri Lanka and Palestine two), the one shown before
// while Wikidata still gives it, else the first by name: the query's rows have no fixed order, and the capital shown
// had changed from run to run (26 November 2026).
const capitalOf = (iso3, w) => { const all = [...(w.capitals || [])].sort((a, b) => a.localeCompare(b, 'en')), was = oldBy.get(iso3)?.capital; return all.includes(was) ? was : all[0] || null; };
for (const c of wbCountries) {
  const s = series.get(c.id), w = wdBy.get(c.id) || {}, gw = gwByIso3.get(c.id);
  const h = heads.get(c.id) || {}, rc = retroNow(c.id);
  const ar = atlas?.get(c.id) || null, sameOffice = [...(w.hosOffices || [])].some(o => w.hogOffices.has(o));
  const vacant = [...(h.vacant || [])];
  // The Atlas's "Vacant" counts where National Analysis has no holder either (Haiti's head of state).
  for (const o of OFFICES) if (!h[o]?.name && /^\s*vacant\b/i.test(ar?.executive?.[o]?.name || '') && !vacant.includes(o)) vacant.push(o);
  const choice = leaderOffice({ atlas: ar, decision: decisions.get(c.id), government: [...(w.gov || [])], heads: h, sameOffice, sharedHead: (hosCount.get(h.headOfState?.qid) || 0) > 1, retro: rc?.leaders });
  let leader = currentLeader(choice, h, { retro: rc?.leaders, vacant });
  // A party the Retrospective no longer gives for a leader who had one in the index before (its Finland record came to
  // list Presidents only, so Petteri Orpo lost his): the Political Atlas's for the same office and person, marked
  // partySource 'atlas' (leaders.mjs). The Atlas's parties for leaders who had none are not added here.
  const was = oldBy.get(c.id)?.leader;
  if (leader && !leader.party && was?.party && was.qid && was.qid === leader.qid) leader = currentLeader(choice, h, { retro: rc?.leaders, vacant, atlas: ar });
  const shown = leader && { ...leader, name: plainName(leader.name) }; // NA-03: the name without its realm
  const differ = ar ? atlasDisagreement(ar, choice.office, h, vacant) : null;
  if (differ) disagreements.push({ iso3: c.id, country: c.name, ...differ });
  if (ar && decisions.has(c.id)) console.log(`leader-offices.json: ${c.id} is decided by the Atlas (${ar.executive?.leader}); its decision (${decisions.get(c.id).office}) is not needed`);
  leaderLog.push({ iso3: c.id, country: c.name, office: choice.office, rule: choice.rule, leader: leader?.name || null });
  const latest = scorePeriod(s, latestPick);
  const decades = Object.fromEntries([1980, 1990, 2000, 2010, 2020].map(d => { const x = scorePeriod(s, decadePick(d)); return [d, { pressure: x.pressure, overall: x.overall, coverage: x.coverage }]; }));
  const calEvents = calendar.filter(e => e.country === c.name || (retroName(c.id) && e.country === retroName(c.id)) || aliasToIso3.get(nameKey(e.country)) === c.id);
  const ks = KARDASHEV[c.id] ? energy.steps.at(-1).polities.find(p => p.id === KARDASHEV[c.id]) : null;
  const people = peopleInIndex({ headOfStateQid: h.headOfState?.qid, headOfGovernmentQid: h.headOfGovernment?.qid, leader }, q => lakeIdx.has(q));
  countries.push({
    iso3: c.id, iso2: c.iso2Code, num: w.num || null, name: c.name, region: c.region.value, income: c.incomeLevel.value, capital: capitalOf(c.id, w) || c.capitalCity || null,
    qid: w.qid || null, encyclopedia: w.qid && lakeIdx.has(w.qid) ? w.qid : null, retro: retroKey(c.id),
    // The Gleditsch and Ward number stays for the builders that still read one (battlefield/scripts/build-realtime.mjs,
    // monthly/scripts/build.mjs and integration/scripts/coverage.mjs, through UCDP's own country codes); the page reads
    // none (MP-11, 20 November 2026).
    gw: gw ?? null,
    government: [...(w.gov || [])].sort((a, b) => a.localeCompare(b, 'en')).slice(0, 4), headOfState: plainName(h.headOfState?.name) || null, headOfGovernment: plainName(h.headOfGovernment?.name) || null, // NA-03: shown without the realm
    headOfStateQid: h.headOfState?.qid || null, headOfGovernmentQid: h.headOfGovernment?.qid || null,
    ...(h.regent?.name ? { regent: plainName(h.regent.name), regentQid: h.regent.qid || null } : {}), // who exercises the head of state's powers for him (a 'regent' correction)
    ...(people.length ? { peopleInIndex: people } : {}), // those of these IDs with a Master Index entry: the page tags only them
    ...(vacant.length ? { vacant } : {}), // offices with no holder now: the page shows "Vacant"
    leader: shown, // the current leader, { name, qid, office, rule, since, party, url, source }, or null (leaders.mjs)
    latest: latest.items, pressure: latest.pressure, overall: latest.overall, coverage: latest.coverage, decades,
    leadership: rc ? leadership(c.id, shown, officeTerm(w.terms?.[shown?.office])) : null,
    conflict: gw != null ? conflict(c.id, w.qid || null) : null,
    calendar: calEvents.length ? Object.fromEntries(['election', 'referendum', 'party', 'leader', 'inauguration', 'resignation', 'coup', 'conflict', 'ceasefire', 'assassination', 'crisis', 'protest', 'treaty', 'summit', 'sanctions', 'vote', 'court'].map(t => [t, calEvents.filter(e => e.type === t).length])) : null,
    energyShare: ks ? round(ks.share, 4) : null,
  });
  seriesFiles.push([join(OUT, `series/${c.id}.json`), JSON.stringify(s)]);
}
// The files this build does not make from its own sources, carried across the emptying below (carry.mjs): the
// governance scores with their 90% range, fetched again for these countries in index.json's order (the files there
// before are kept when the World Bank or the licence check fails), and the stand-in series, kept as they were.
const kept = readKept(OUT);
const governance = await governanceOrKept({
  fresh: () => governanceFiles({ getJson, countries: wbCountries.map(c => c.id), accessed: TODAY, wait: () => sleep(250) }),
  kept: kept.governance, countries: wbCountries.map(c => c.id), warn: m => console.warn(m),
});
console.log(`governance: ${governance.files.length} files (${governance.from}); kept as they were: ${kept.asIs.map(([p]) => p).join(', ') || 'none'}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'series'), { recursive: true });
for (const [file, text] of seriesFiles) writeFileSync(file, text);
writeKept(OUT, { governance: governance.files, asIs: kept.asIs }, writeGovernance);
// Each source's own date, so the page can put a statistic's age and source beside it rather than only the build's date
// (13 November 2026): when Wikidata was read (this build), the day Political Atlas's records were last reviewed (its
// manifest's lastUpdated), when the Political Retrospective's data was built, the calendars' and Realtime Battlefield's
// own times, and the years the conflict and energy figures run to. World Bank values carry their own year already.
const BUILT = new Date().toISOString();
const atlasManifest = atlasDir && existsSync(join(atlasDir, 'data/manifest.json')) ? json(join(atlasDir, 'data/manifest.json')) : null;
const calendarStamp = existsSync(join(jdpi, 'calendar/data/2020s.json')) ? json(join(jdpi, 'calendar/data/2020s.json')).generated || null : null;
const sources = {
  wikidataRead: BUILT,
  atlasReviewed: typeof atlasManifest?.lastUpdated === 'string' ? atlasManifest.lastUpdated : null,
  retrospectiveBuilt: typeof retro.built === 'string' ? retro.built : null,
  calendarBuilt: calendarStamp,
  battlefieldThrough: realtime.latest || null, battlefieldRelease: realtime.version || null,
  conflictYears: [1946, 2025],
  energyYear: energy.steps.at(-1)?.year ?? null,
};
const index = {
  generated: BUILT, years: [FIRST, LAST], sources,
  indicators: INDICATORS.map(({ code, dimension, label, unit, better, threshold, core, source }) => ({ code, dimension, label, unit, better, threshold, core, source })),
  countries,
};
// The yearly layer (national/data/years/, years.mjs): every country's indicators and PESTLE pressure by year, for the
// page's time slider and the Omni-Map.
writeYears(OUT, yearsFiles(index, new Map(wbCountries.map(c => [c.id, series.get(c.id)])), INDICATORS));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
writeBrief(index); // the small file Geopolitical Volatility reads (brief.mjs)
writeHeads(join(OUT, 'index.json'), { root: jdpi }); // index.head.json in step with it (integration/scripts/heads.mjs)
console.log(`wrote ${countries.length} countries; with leadership data ${countries.filter(c => c.leadership).length}`);
const byRule = {};
for (const l of leaderLog) byRule[l.rule] = (byRule[l.rule] || 0) + 1;
console.log(`current leader, by the rule that chose the office: ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(', ')}`);
const open = leaderLog.filter(l => l.leader && ['retrospective', 'undecided'].includes(l.rule));
if (open.length) console.log(`no data decides the office for ${open.length}: ${open.map(l => `${l.iso3} (${l.rule}: ${l.office})`).join(', ')}; add a decision to leader-offices.json`);
for (const d of disagreements) console.log(`Atlas and National Analysis differ: ${d.iso3} ${d.office}: Atlas "${d.atlas ?? '(none)'}", National Analysis "${d.national ?? '(none)'}"`);
if (atlas) console.log(`${disagreements.length} disagreements with the Atlas, for a person to look at`);
if (reportFile) writeFileSync(resolve(reportFile), JSON.stringify({ generated: index.generated, atlas: atlas ? atlasDir : null, leaders: leaderLog, disagreements }, null, 1));
