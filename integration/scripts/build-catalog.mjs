// Integration Hub build (Digital Science · Integration Hub). Surveys PRP's own data and writes:
//   integration/catalog.json              the public data catalogue (the contract with Data Analytics, the MCP server and the API)
//   integration/data/<id>.json            flat datasets derived from sources that are not simple record arrays, or too heavy to
//   integration/data/<id>/<n>.json        query at the edge (sharded, with each shard's date ranges or partition values)
//   integration/data/query-index.json     what the MCP server and the API may read: every part, its size, cost and ranges, a sample
//   integration/data/names/…              a compact name index for the Encyclopaedia (token prefixes → Wikidata ids)
//   integration/data/countries/…          one small profile per country, joining National Analysis, Volatility, Battlefield and the calendars
//   integration/feeds/*.ics               the Realtime Calendar and the Historical Calendar (one file per decade) as iCalendar
//   integration/skill/prp-data.zip        the downloadable Claude skill (SKILL.md plus a generated dataset reference)
//
//   node integration/scripts/build-catalog.mjs [--quiet] [--calibrate] [--allow-drop]
//
// Deterministic: a file is rewritten only when its content changes (generated stamps and DTSTAMPs aside), and generated files
// that are no longer produced are removed, so the daily run in calendar-refresh.yml does not churn git. Nothing is written if
// a dataset would lose more than half of its rows since the last catalogue (see "guard" below); --allow-drop writes anyway.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { toICS, foldText, tokenize, jsonCost, BASE_URL } from '../mcp/prp-mcp.mjs';
import { openapi } from './openapi.mjs';
import { llmsTxt } from './llms.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const STAMP = NOW.toISOString();

const abs = p => join(ROOT, p);
const has = p => existsSync(abs(p));
const text = p => readFileSync(abs(p), 'utf8');
const J = p => JSON.parse(text(p));
const day = s => (s == null || s === '' ? null : String(s).slice(0, 10));
const wiki = t => (t ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(t).replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')') : null);
const round = (v, d = 3) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 10 ** d) / 10 ** d);

/* ------------------------------------------------------------------ outputs */
const out = new Map(); // relative path -> string | Buffer
const put = (p, data) => out.set(p, data);
const putJson = (p, obj, pretty = false) => put(p, JSON.stringify(obj, null, pretty ? 2 : 0) + '\n');
// The generated folders: everything in them is ours, and files we no longer produce are removed.
const OWNED_DIRS = ['integration/data', 'integration/feeds'];

/* ------------------------------------------------------------------ shared lookups */
const REG = J('registry.json');
const SUBMODULE_URL = {};
for (const s of REG.suites) for (const m of s.modules) SUBMODULE_URL[m.id] = m.url || m.pendingUrl || null;

const NAT = J('national/data/index.json');
const VOL = J('volatility/data/index.json');
const BF = J('battlefield/data/realtime.json');
const DECADE_FILES = readdirSync(abs('calendar/data')).filter(f => /^\d{4}s\.json$/.test(f)).sort();
const CAL = DECADE_FILES.map(f => ({ file: `calendar/data/${f}`, decade: f.slice(0, 5), data: J(`calendar/data/${f}`) }));
const CAL_EVENTS = CAL.flatMap(c => c.data.events);
const CAL_GENERATED = CAL.map(c => c.data.generated).sort().pop();

// Country names → ISO3. National Analysis uses World Bank names, Volatility common names; the calendars and Battlefield use
// common names and a few historical ones, mapped to today's state.
const ISO3 = new Map();
const nameKey = s => foldText(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const addName = (name, iso3) => { const k = nameKey(name); if (k && !ISO3.has(k)) ISO3.set(k, iso3); };
const COMMON = {}; // iso3 -> common name
for (const [iso3, c] of Object.entries(VOL.countries)) COMMON[iso3] = c.name;
for (const c of NAT.countries) { addName(c.name, c.iso3); addName(c.iso3, c.iso3); if (c.iso2) addName(c.iso2, c.iso3); }
for (const [iso3, c] of Object.entries(VOL.countries)) addName(c.name, iso3);
const EXTRA_NAMES = {
  USA: ['United States of America', 'US', 'U.S.', 'America'], GBR: ['UK', 'U.K.', 'Britain', 'Great Britain'], RUS: ['Russia', 'Soviet Union / Russia', 'Soviet Union', 'USSR'],
  KOR: ['South Korea', 'Republic of Korea'], PRK: ['North Korea'], COD: ['DR Congo', 'Democratic Republic of the Congo', 'Congo-Kinshasa'],
  COG: ['Congo', 'Republic of the Congo', 'Congo-Brazzaville'], CIV: ['Ivory Coast', "Côte d'Ivoire"], IRN: ['Iran'], EGY: ['Egypt'], SYR: ['Syria'],
  VEN: ['Venezuela'], YEM: ['Yemen'], LAO: ['Laos'], KGZ: ['Kyrgyzstan'], SVK: ['Slovakia'], TUR: ['Turkey', 'Türkiye'], MMR: ['Burma'],
  CPV: ['Cape Verde'], SWZ: ['Swaziland'], MKD: ['Macedonia'], PSE: ['Palestine', 'State of Palestine'], VNM: ['Vietnam'], BHS: ['Bahamas', 'The Bahamas'],
  GMB: ['Gambia', 'The Gambia'], FSM: ['Micronesia'], KNA: ['Saint Kitts and Nevis'], LCA: ['Saint Lucia'], VCT: ['Saint Vincent and the Grenadines'],
  TLS: ['East Timor'], BRN: ['Brunei'], STP: ['São Tomé and Príncipe', 'Sao Tome and Principe'], SOM: ['Somalia'], NRU: ['Nauru'], CZE: ['Czech Republic'],
  DEU: ['West Germany / Germany', 'Federal Republic of Germany'], SRB: ['Yugoslavia / Serbia'], GRL: ['Greenland (Denmark)'], BFA: ['Republic of Upper Volta', 'Upper Volta'],
  HKG: ['Hong Kong'], MAC: ['Macau', 'Macao'], PRI: ['Puerto Rico'], VIR: ['US Virgin Islands', 'U.S. Virgin Islands'], CUW: ['Curaçao'], TWN: ['Taiwan', 'Republic of China']
};
for (const [iso3, names] of Object.entries(EXTRA_NAMES)) for (const n of names) addName(n, iso3);
const iso3Of = name => ISO3.get(nameKey(name)) || null;
const commonName = c => COMMON[c.iso3] || c.name;

/* ------------------------------------------------------------------ type inference */
const DATE_RE = /^-?\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;
function typeOf(values) {
  const seen = new Set();
  let dates = true, strings = 0;
  for (const v of values) {
    if (v == null) continue;
    if (Array.isArray(v)) seen.add('array');
    else if (typeof v === 'object') seen.add('object');
    else if (typeof v === 'number') seen.add('number');
    else if (typeof v === 'boolean') seen.add('boolean');
    else { seen.add('string'); strings++; if (!DATE_RE.test(v)) dates = false; }
  }
  if (!seen.size) return 'string';
  if (seen.size === 1) { const t = [...seen][0]; return t === 'string' && dates && strings ? 'date' : t; }
  if (seen.has('string') && !seen.has('array') && !seen.has('object')) return 'string';
  return [...seen].sort().join('|').includes('array') ? 'array' : 'string';
}
const pick = (obj, path) => (!path ? obj : path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj));

/* ------------------------------------------------------------------ datasets */
// Each spec: id, title, module, submodule, description, licence, sources, refresh, fields [[name, description]], and either
//   source: { urls: [...], records: 'items' }          (served as is), or
//   derive: () => rows, partition?, parts?             (written to integration/data/), from: [source files]
// Optional: page (a PRP page that shows the data), sort ('-field'), rangeFields (date fields whose min/max per part let a
// query skip parts), partitionBy (one part per value), partBudget (cost per part), sampleFrom, resets ('yearly' or
// 'quarterly': the dataset covers only the latest period, so it shrinks when a new one starts; see the guard).
const SPECS = [];
// A field a source has added since its catalogue entry was written: listed honestly, and flagged in the build log.
const UNDESCRIBED = 'Not yet described in the catalogue (a field the source has added)';
const spec = s => SPECS.push(s);
const genOf = p => { try { const j = J(p); return day(j.generated || j.day || null); } catch { return null; } };

// ---- Realtime Intelligence ------------------------------------------------------------------------------------
const BRIEF = has('briefing/data/latest.json') ? J('briefing/data/latest.json') : null;
const POSITION = { far_left: 'Far left', left: 'Left', centre: 'Centre', right: 'Right', far_right: 'Far right' };
if (BRIEF) {
  spec({
    id: 'intelligence-briefing-stories', title: 'Intelligence Briefing: stories', module: 'rt', submodule: 'briefing',
    description: 'Every story from the Intelligence Briefing\'s publishers over the last seven days, ten active publishers for each of five political positions (far left to far right). Join `s` to intelligence-briefing-sources for the outlet\'s name and position.',
    source: { urls: ['briefing/data/latest.json'], records: 'items' }, refresh: 'twice daily',
    licence: 'Headlines, standfirsts and links © their publishers, quoted for reference; selection and metadata © JDP-Iq.',
    sources: ['RSS and Atom feeds of the publishers listed in intelligence-briefing-sources', 'Political positions: AllSides Media Bias Ratings, otherwise Media Bias/Fact Check, adjusted to five steps'],
    fields: [['s', 'Source id; join to `id` in intelligence-briefing-sources'], ['t', 'Headline'], ['u', 'Link to the article at its publisher'], ['p', 'Publication time (ISO 8601, UTC)'],
      ['d', 'Standfirst or opening lines from the feed'], ['c', 'Soft-news class when the story is not hard news: s sport, e entertainment, l lifestyle; absent for news']]
  });
  spec({
    id: 'intelligence-briefing-sources', title: 'Intelligence Briefing: publishers', module: 'rt', submodule: 'briefing',
    description: 'The Intelligence Briefing\'s publishers with their political position (far left, left, centre, right, far right), country, reliability caution and feed status at the last refresh.',
    source: { urls: ['briefing/data/latest.json'], records: 'sources' }, refresh: 'twice daily',
    licence: 'Metadata © JDP-Iq; position ratings after AllSides and Media Bias/Fact Check.', sources: ['AllSides Media Bias Ratings', 'Media Bias/Fact Check', 'The publishers\' own feeds'],
    fields: [['id', 'Source id, as used in `s` of intelligence-briefing-stories'], ['name', 'Publisher'], ['position', 'Political position: far_left, left, centre, right or far_right'],
      ['country', 'Country of the publisher (ISO 3166-1 alpha-2)'], ['caution', 'True when the outlet is rated mixed or low for factual reliability'], ['active', 'True when the outlet is one of the ten shown for its position'],
      ['reserve', 'True for a reserve outlet that stands in when an active one fails'], ['status', 'Feed status at the last refresh (ok or an error)'], ['count', 'Items in the publisher\'s feed at the last refresh']]
  });
}

spec({
  id: 'headline-outlets', title: 'Global Headline Tracker: outlets', module: 'rt', submodule: 'headlines',
  description: 'The most-read news outlets of each covered country whose front pages the Global Headline Tracker follows, with the feed it reads. (The daily top-story archive itself lives in a database, not in a static file, so it is not in this catalogue.)',
  derive: () => Object.entries(J('headlines/outlets.json')).flatMap(([cc, list]) => (Array.isArray(list) ? list : []).map(o => ({ country: cc, iso3: iso3Of(cc), outlet: o.name, home: o.home || null, rss: o.rss || null, via: o.via || null }))),
  from: ['headlines/outlets.json'], refresh: 'static', updatedFrom: 'headlines/outlets.json',
  licence: 'List © JDP-Iq; feeds and articles belong to the outlets.', sources: ['The outlets\' own RSS feeds, or Google News restricted to the outlet\'s site'],
  fields: [['country', 'Country (ISO 3166-1 alpha-2)'], ['iso3', 'Country (ISO 3166-1 alpha-3), when known'], ['outlet', 'Outlet name'], ['home', 'Outlet home page'], ['rss', 'Feed the tracker reads'], ['via', 'site (the outlet\'s own feed) or google-news (Google News restricted to the site)']]
});

const VCOMP = VOL.components.map(c => c.key);
spec({
  id: 'volatility-latest', title: 'Geopolitical Volatility: latest scores', module: 'rt', submodule: 'volatility',
  description: `The Geopolitical Volatility Index (0–100) for every country on the latest day (${VOL.latest}), with its five components: conflict & security (35%), political/diplomatic escalation (20%), civil unrest (20%), economic disruption (10%) and cross-border spread (15%). It measures news coverage of events, not events on the ground.`,
  derive: () => Object.entries(VOL.countries).map(([iso3, c]) => { const l = c.latest || {}; return { iso3, name: c.name, date: VOL.latest, score: l.score ?? null, ...Object.fromEntries(VCOMP.map(k => [k, l.components?.[k] ?? null])), events: l.events ?? null, articles: l.articles ?? null, sources: l.sources ?? null, tone: l.tone ?? null, coverage: l.coverage ?? null, reason: l.reason ?? null }; }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
  from: ['volatility/data/index.json'], refresh: 'daily', updatedFrom: 'volatility/data/index.json', page: 'q/volatility.html',
  licence: 'Index © JDP-Iq (method gvi-1.1); GDELT data free to use with attribution to the GDELT Project.', sources: ['GDELT 2.0 event exports, all 96 quarter-hour files a day (the GDELT Project)'],
  fields: [['iso3', 'Country (ISO 3166-1 alpha-3)'], ['name', 'Country'], ['date', 'Day scored'], ['score', 'Geopolitical Volatility Index, 0–100 (null when too few events or sources)'],
    ['conflict', 'Component: conflict & security, 0–100'], ['political', 'Component: political/diplomatic escalation, 0–100'], ['unrest', 'Component: civil unrest, 0–100'], ['economic', 'Component: economic disruption, 0–100'], ['spread', 'Component: cross-border spread, 0–100'],
    ['events', 'GDELT events located in the country that day'], ['articles', 'News articles behind those events'], ['sources', 'Distinct news sources'], ['tone', 'Mean GDELT tone of the coverage (negative is hostile)'], ['coverage', 'Coverage level: high, medium or low'], ['reason', 'Why no score was given, if none']]
});
const COV = { h: 'high', m: 'medium', l: 'low' };
spec({
  id: 'volatility-daily', title: 'Geopolitical Volatility: daily scores', module: 'rt', submodule: 'volatility',
  description: `Daily Geopolitical Volatility Index scores and components for every country over the last ${VOL.days} days, for trends and comparisons.`,
  derive: () => Object.entries(VOL.countries).flatMap(([iso3, c]) => (c.days || []).map(([date, score, comps, events, tone, cov]) => ({ date, iso3, name: c.name, score: score ?? null, ...Object.fromEntries(VCOMP.map((k, i) => [k, comps?.[i] ?? null])), events: events ?? null, tone: tone ?? null, coverage: COV[cov] || cov || null }))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.iso3 < b.iso3 ? -1 : 1)),
  from: ['volatility/data/index.json'], refresh: 'daily', updatedFrom: 'volatility/data/index.json', page: 'q/volatility.html', rangeFields: ['date'],
  licence: 'Index © JDP-Iq (method gvi-1.1); GDELT data free to use with attribution to the GDELT Project.', sources: ['GDELT 2.0 event exports (the GDELT Project)'],
  fields: [['date', 'Day'], ['iso3', 'Country (ISO 3166-1 alpha-3)'], ['name', 'Country'], ['score', 'Geopolitical Volatility Index, 0–100'], ['conflict', 'Component: conflict & security'], ['political', 'Component: political/diplomatic escalation'],
    ['unrest', 'Component: civil unrest'], ['economic', 'Component: economic disruption'], ['spread', 'Component: cross-border spread'], ['events', 'GDELT events that day'], ['tone', 'Mean tone of the coverage'], ['coverage', 'Coverage level: high, medium or low']]
});
spec({
  id: 'volatility-global', title: 'Geopolitical Volatility: global mean', module: 'rt', submodule: 'volatility',
  description: 'The world mean of the Geopolitical Volatility Index each day, with the number of GDELT events and quarter-hour files processed.',
  derive: () => VOL.global.map(([date, events, slots, mean]) => ({ date, mean_score: mean ?? null, events: events ?? null, files: slots ?? null })),
  from: ['volatility/data/index.json'], refresh: 'daily', updatedFrom: 'volatility/data/index.json', page: 'q/volatility.html',
  licence: 'Index © JDP-Iq; GDELT data free to use with attribution to the GDELT Project.', sources: ['GDELT 2.0 event exports (the GDELT Project)'],
  fields: [['date', 'Day'], ['mean_score', 'Mean index across scored countries'], ['events', 'GDELT events processed'], ['files', 'Quarter-hour GDELT files processed (96 is a full day)']]
});

const BF_SRC = [`${BF.source} v${BF.version} (${BF.citation})`.replace(/\s+/g, ' ')];
const bfCite = (/^([^,]+),.*?\((\d{4})\)/.exec(BF.citation || '') || []).slice(1).join(' et al. ') || 'UCDP';
const bfLicence = `UCDP data ${BF.licence || 'CC BY 4.0'} (cite ${bfCite}); war groupings, background and monthly text © JDP-Iq.`;
spec({
  id: 'realtime-wars', title: 'Realtime Battlefield: wars this year', module: 'rt', submodule: 'battlefield',
  description: `Every armed conflict recorded so far in ${BF.year}, grouped into wars, with deaths, events, status and a plain-English background. UCDP candidate events through ${BF.latest}.`,
  derive: () => BF.wars.map(w => ({ id: w.id, name: w.name, zone: w.zone, status: w.status, countries: w.countries || [], deaths: w.deaths, events: w.events,
    deaths_last_3_months: (w.monthly || []).slice(-3).reduce((a, m) => a + (m.deaths || 0), 0), last_active: w.lastActive || null, summary: w.summary || null, background: w.background || null,
    conflicts: (w.conflicts || []).map(c => c.name), wikipedia: wiki(w.wiki) })).sort((a, b) => b.deaths - a.deaths),
  from: ['battlefield/data/realtime.json'], refresh: 'weekly', resets: 'yearly', updatedFrom: 'battlefield/data/realtime.json', page: 'q/battlefield.html',
  licence: bfLicence, sources: BF_SRC,
  fields: [['id', 'War id'], ['name', 'War'], ['zone', 'Region'], ['status', 'active, or quiet when no event in the last three months'], ['countries', 'Countries where fighting was recorded'], ['deaths', 'Best-estimate deaths this year'],
    ['events', 'Recorded events this year'], ['deaths_last_3_months', 'Deaths in the last three recorded months'], ['last_active', 'Date of the last recorded event'], ['summary', 'One-line summary'], ['background', 'Plain-English background (PRP)'],
    ['conflicts', 'UCDP conflicts grouped into this war'], ['wikipedia', 'Wikipedia article, if any']]
});
spec({
  id: 'realtime-war-months', title: 'Realtime Battlefield: war by month', module: 'rt', submodule: 'battlefield',
  description: `Each war's deaths, events and civilian deaths month by month in ${BF.year}, with PRP's monthly note (change on the previous month, deadliest areas).`,
  derive: () => BF.wars.flatMap(w => (w.monthly || []).map(m => ({ war_id: w.id, war: w.name, zone: w.zone, month: m.month, deaths: m.deaths ?? 0, events: m.events ?? 0, civilians: m.civilians ?? 0, deadliest_place: m.places?.[0]?.place || null, note: m.text || null }))),
  from: ['battlefield/data/realtime.json'], refresh: 'weekly', resets: 'yearly', updatedFrom: 'battlefield/data/realtime.json', page: 'q/battlefield.html?view=archive',
  licence: bfLicence, sources: BF_SRC,
  fields: [['war_id', 'War id (realtime-wars)'], ['war', 'War'], ['zone', 'Region'], ['month', 'Month (YYYY-MM)'], ['deaths', 'Best-estimate deaths'], ['events', 'Recorded events'], ['civilians', 'Civilian deaths'], ['deadliest_place', 'Place with the most deaths that month'], ['note', 'Monthly note (PRP, from the events)']]
});
spec({
  id: 'realtime-conflict-cells', title: 'Realtime Battlefield: events on a 0.1° grid', module: 'rt', submodule: 'battlefield',
  description: 'Conflict events this year summed by war, month and 0.1° grid cell (about 11 km): the points on the Realtime Battlefield map.',
  derive: () => BF.wars.flatMap(w => (w.points || []).map(([lat, lon, mi, deaths, events]) => ({ war_id: w.id, war: w.name, month: BF.months[mi] || null, lat, lon, deaths, events }))).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0)),
  from: ['battlefield/data/realtime.json'], refresh: 'weekly', resets: 'yearly', updatedFrom: 'battlefield/data/realtime.json', page: 'q/battlefield.html', partitionBy: 'month', indexFields: ['war_id'],
  licence: bfLicence, sources: BF_SRC,
  fields: [['war_id', 'War id (realtime-wars)'], ['war', 'War'], ['month', 'Month (YYYY-MM)'], ['lat', 'Latitude of the cell (0.1°)'], ['lon', 'Longitude of the cell (0.1°)'], ['deaths', 'Best-estimate deaths in the cell that month'], ['events', 'Recorded events in the cell that month']]
});

const IND = new Map(NAT.indicators.map(i => [i.code, i]));
const DIMS = ['political', 'economic', 'social', 'technological', 'legal', 'environmental'];
const natLicence = 'World Bank WDI and WGI CC BY 4.0; Wikidata CC0; UCDP CC BY 4.0; PESTLE scores © JDP-Iq.';
const natSources = ['World Bank World Development Indicators and Worldwide Governance Indicators (CC BY 4.0)', 'Wikidata (CC0): government, heads of state, capitals', 'Political Retrospective (Archigos and Wikidata): leaders and elections since 1926', 'UCDP/PRIO Armed Conflict Dataset (CC BY 4.0) and Correlates of War: conflict history', 'Kardashev Tracker: energy share'];
const latestVal = (c, code) => c.latest?.[code]?.[1] ?? null;
spec({
  id: 'national-countries', title: 'National Analysis: countries', module: 'rt', submodule: 'pestle',
  description: 'One row per country: region, income group, government, heads of state and government, PESTLE pressure (the share of each dimension\'s indicators that are worsening), leadership turnover, conflict history and a few headline indicators.',
  derive: () => NAT.countries.map(c => ({ iso3: c.iso3, iso2: c.iso2, name: commonName(c), official_name: c.name, region: (c.region || '').trim() || null, income: c.income || null, capital: c.capital || null,
    government: c.government || [], head_of_state: c.headOfState || null, head_of_government: c.headOfGovernment || null, qid: c.qid || null,
    pestle_overall: c.overall ?? null, ...Object.fromEntries(DIMS.map(d => ['pestle_' + d, c.pressure?.[d] ?? null])), pestle_coverage: c.coverage ?? null,
    population: latestVal(c, 'SP.POP.TOTL'), gdp_usd: latestVal(c, 'NY.GDP.MKTP.CD'), gdp_growth: round(latestVal(c, 'NY.GDP.MKTP.KD.ZG')), gdp_per_capita: round(latestVal(c, 'NY.GDP.PCAP.KD'), 0),
    inflation: round(latestVal(c, 'FP.CPI.TOTL.ZG')), life_expectancy: round(latestVal(c, 'SP.DYN.LE00.IN'), 1),
    current_leader: c.leadership?.current?.name || null, leader_since: c.leadership?.current?.since || null, leader_party: c.leadership?.current?.party || null,
    leaders_since_1926: c.leadership?.leaders100 ?? null, average_tenure_years: c.leadership?.avgTenure ?? null, irregular_exits: c.leadership?.irregular ?? null, elections_since_1926: c.leadership?.elections ?? null,
    conflict_years: c.conflict?.conflictYears ?? null, years_at_war: c.conflict?.yearsAtWar ?? null, wars_active_this_year: (c.conflict?.active2026 || []).length, energy_share: c.energyShare ?? null })),
  from: ['national/data/index.json', 'volatility/data/index.json'], refresh: 'monthly', updatedFrom: 'national/data/index.json', page: 'q/national.html',
  licence: natLicence, sources: natSources,
  fields: [['iso3', 'Country (ISO 3166-1 alpha-3)'], ['iso2', 'Country (ISO 3166-1 alpha-2)'], ['name', 'Common name'], ['official_name', 'World Bank name'], ['region', 'World Bank region'], ['income', 'World Bank income group'], ['capital', 'Capital'],
    ['government', 'System(s) of government (Wikidata)'], ['head_of_state', 'Head of state (Wikidata)'], ['head_of_government', 'Head of government (Wikidata)'], ['qid', 'Wikidata id (also the Encyclopaedia entry)'],
    ['pestle_overall', 'Overall PESTLE pressure, 0–1: mean of the six dimensions'], ['pestle_political', 'Political pressure: share of scored indicators worsening, 0–1'], ['pestle_economic', 'Economic pressure, 0–1'], ['pestle_social', 'Social pressure, 0–1'],
    ['pestle_technological', 'Technological pressure, 0–1'], ['pestle_legal', 'Legal pressure, 0–1'], ['pestle_environmental', 'Environmental pressure, 0–1'], ['pestle_coverage', 'Share of indicators with data, 0–1'],
    ['population', 'Population (latest year)'], ['gdp_usd', 'GDP, current US$ (latest year)'], ['gdp_growth', 'GDP growth, % (latest year)'], ['gdp_per_capita', 'GDP per capita, constant 2015 US$'], ['inflation', 'Consumer price inflation, %'], ['life_expectancy', 'Life expectancy at birth, years'],
    ['current_leader', 'Current leader (Political Retrospective)'], ['leader_since', 'In office since'], ['leader_party', 'Leader\'s party'], ['leaders_since_1926', 'Leaders since 1926'], ['average_tenure_years', 'Average leader tenure, years'],
    ['irregular_exits', 'Leaders removed irregularly (coups, assassinations)'], ['elections_since_1926', 'National elections since 1926'], ['conflict_years', 'Years with armed conflict since 1946'], ['years_at_war', 'Years at war (1,000+ battle deaths)'],
    ['wars_active_this_year', 'Wars the country is involved in this year (Realtime Battlefield)'], ['energy_share', 'Share of world energy capture (Kardashev Tracker)']]
});
spec({
  id: 'national-indicators', title: 'National Analysis: indicator definitions', module: 'rt', submodule: 'pestle',
  description: 'The 41 indicators behind National Analysis: PESTLE dimension, unit, which direction is better and the change that counts as improving or worsening.',
  derive: () => NAT.indicators.map(i => ({ code: i.code, label: i.label, dimension: i.dimension, unit: i.unit, better: i.better, threshold: i.threshold ?? null, scored: !!i.core })),
  from: ['national/data/index.json'], refresh: 'monthly', updatedFrom: 'national/data/index.json', page: 'q/national.html',
  licence: 'World Bank CC BY 4.0; definitions © JDP-Iq.', sources: ['World Bank World Development Indicators and Worldwide Governance Indicators'],
  fields: [['code', 'World Bank indicator code'], ['label', 'Indicator'], ['dimension', 'PESTLE dimension'], ['unit', 'Unit'], ['better', 'up or down: which direction is an improvement'], ['threshold', 'Change between the last two values that counts as improving or worsening'], ['scored', 'True when the indicator counts towards the PESTLE pressure scores']]
});
spec({
  id: 'national-indicator-latest', title: 'National Analysis: latest indicator values', module: 'rt', submodule: 'pestle',
  description: 'For each country and indicator, the latest value, its year, the change on the previous value and whether that counts as improving, stable or worsening.',
  derive: () => NAT.countries.flatMap(c => NAT.indicators.filter(i => c.latest?.[i.code]).map(i => { const [year, value, prevYear, change, trend] = c.latest[i.code]; return { iso3: c.iso3, country: commonName(c), dimension: i.dimension, code: i.code, indicator: i.label, unit: i.unit, year, value: round(value, 4), previous_year: prevYear ?? null, change: round(change, 4), trend: trend || null }; })),
  from: ['national/data/index.json'], refresh: 'monthly', updatedFrom: 'national/data/index.json', page: 'q/national.html', partitionBy: 'dimension', rangeFields: ['iso3'], indexFields: ['code'],
  licence: natLicence, sources: natSources.slice(0, 1),
  fields: [['iso3', 'Country (ISO 3166-1 alpha-3)'], ['country', 'Country'], ['dimension', 'PESTLE dimension'], ['code', 'Indicator code'], ['indicator', 'Indicator'], ['unit', 'Unit'], ['year', 'Year of the latest value'], ['value', 'Latest value'],
    ['previous_year', 'Year of the previous value'], ['change', 'Change on the previous value'], ['trend', 'improving, stable or worsening (by the indicator\'s threshold)']]
});
const KEY_SERIES = ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'NY.GDP.PCAP.KD', 'SP.POP.TOTL', 'SP.DYN.LE00.IN', 'SL.UEM.TOTL.ZS', 'MS.MIL.XPND.GD.ZS', 'EN.GHG.CO2.PC.CE.AR5'].filter(c => IND.has(c));
spec({
  id: 'national-key-series', title: 'National Analysis: key indicator time series', module: 'rt', submodule: 'pestle',
  description: `Yearly values since 1980 for every country of eight headline indicators (${KEY_SERIES.map(c => `${c}: ${IND.get(c).label}, ${IND.get(c).unit}`).join('; ')}). Sharded by indicator, then by country; filter on indicator (and iso3) to read one shard. Labels and units are in national-indicators; all 41 indicators for one country are at national/data/series/<ISO3>.json.`,
  derive: () => KEY_SERIES.flatMap(code => NAT.countries.flatMap(c => { if (!has(`national/data/series/${c.iso3}.json`)) return []; const s = J(`national/data/series/${c.iso3}.json`)[code] || []; return s.map(([year, value]) => ({ indicator: code, iso3: c.iso3, country: commonName(c), year, value: round(value, 4) })); })),
  from: ['national/data/series/*.json', 'national/data/index.json'], refresh: 'monthly', updatedFrom: 'national/data/index.json', page: 'q/national.html#compare=USA,CHN,RUS,IND', partitionBy: 'indicator', rangeFields: ['iso3', 'year'],
  licence: 'World Bank WDI, CC BY 4.0.', sources: ['World Bank World Development Indicators (CC BY 4.0)'],
  fields: [['indicator', 'Indicator code (see national-indicators)'], ['iso3', 'Country (ISO 3166-1 alpha-3)'], ['country', 'Country'], ['year', 'Year'], ['value', 'Value, in the indicator\'s unit']]
});

const calLicence = 'Summaries from Wikipedia, CC BY-SA 4.0 (credit Wikipedia); facts from Wikidata (CC0) and UCDP/PRIO (CC BY 4.0); compilation © JDP-Iq.';
const calSources = ['Wikipedia national electoral calendars and lists of summits', 'Political Atlas (Europe, North America and the major powers)', 'Political Retrospective (Archigos and Wikidata)', 'UCDP/PRIO Armed Conflict Dataset (CC BY 4.0)', 'Wikidata (CC0)', 'Wikipedia Current events portal (CC BY-SA), from January 2026'];
const calFields = [['date', 'Date (YYYY-MM-DD)'], ['country', 'Country, or International'], ['title', 'Event'], ['type', 'election, referendum, party, leader, inauguration, resignation, coup, conflict, ceasefire, assassination, crisis, protest, treaty, summit, sanctions, vote or court'],
  ['status', 'declared, or tentative when the date is not yet fixed'], ['source', 'Wikipedia (or other) page for the event'], ['summary', 'Plain-English account (Wikipedia, CC BY-SA)'], ['ref', 'News report cited for events since 2026, if any'], ['refName', 'Name of that news outlet']];
const addMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const RT_FROM = addMonths(TODAY, -6), RT_TO = addMonths(TODAY, 18);
spec({
  id: 'upcoming-political-events', title: 'Realtime Calendar: recent and upcoming events', module: 'rt', submodule: 'calendar',
  description: `The Realtime Calendar's window: political events from six months ago to eighteen months ahead (${RT_FROM} to ${RT_TO} at the last build): elections, referendums, summits, new leaders, coups, ceasefires, protests, court rulings and more.`,
  derive: () => CAL_EVENTS.filter(e => e.date >= RT_FROM && e.date <= RT_TO).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  from: DECADE_FILES.map(f => `calendar/data/${f}`), refresh: 'daily', updated: day(CAL_GENERATED), page: 'q/calendar.html?period=contemporary', rangeFields: ['date'],
  licence: calLicence, sources: calSources, fields: calFields
});

// ---- Retrospective Intelligence -------------------------------------------------------------------------------
spec({
  id: 'political-calendar', title: 'Historical Calendar: political events since 1980', module: 'rs', submodule: 'historical-calendar',
  description: 'Political history from 1980 to today and scheduled events ahead, one file per decade: elections and referendums, new leaders, inaugurations and resignations, coups, wars and ceasefires, assassinations, summits, treaties, sanctions, protests, parliamentary votes and court rulings, each with a plain-English account. The Realtime Calendar shows the same records for the current window.',
  source: { urls: DECADE_FILES.map(f => `calendar/data/${f}`), records: 'events', ranges: Object.fromEntries(DECADE_FILES.map(f => [`calendar/data/${f}`, { date: [`${f.slice(0, 4)}-01-01`, `${f.slice(0, 3)}9-12-31`] }])) },
  refresh: 'daily', page: 'q/calendar.html?period=history', licence: calLicence, sources: calSources, fields: calFields
});

// Encyclopaedia: every entity (the lake), flattened with its main dates and country.
const LAKE_TYPES = ['person', 'place', 'party', 'election', 'event', 'topic', 'idea', 'conflict', 'organisation'];
let LAKE_ENTITIES = null;
const lakeEntities = () => {
  if (LAKE_ENTITIES) return LAKE_ENTITIES;
  const idx = J('lake/data/index.json');
  const links = new Map(idx.rows.map(r => [r[0], (r[7] || []).map(l => l[0])]));
  const all = [];
  for (let i = 0; i < 512; i++) {
    const p = `lake/data/e/${i}.json`; if (!has(p)) continue;
    for (const e of Object.values(J(p))) all.push({ e, appears: links.get(e.q) || [...new Set((e.mentions || []).map(m => m.m))] });
  }
  return (LAKE_ENTITIES = all);
};
const ENC_TYPE_ORDER = ['person', 'conflict', 'election', 'event', 'topic', 'party', 'place', 'idea', 'organisation'];
spec({
  id: 'encyclopaedia-entities', title: 'Encyclopaedia: entities', module: 'rs', submodule: 'encyclopedia',
  description: 'Every person, place, party, election, war, event, idea and organisation in the PRP Encyclopaedia, keyed by Wikidata id, with its main dates, country, how often PRP mentions it and which submodules it appears in. One shard per type. Full records (facts, relations, tags, every mention, Wikipedia summary) are one get_entity call away, or at lake/data/e/<qid number % 512>.json.',
  derive: () => lakeEntities().map(({ e, appears }) => {
    const f = e.facts || {}, rel = e.rel || {};
    const country = (rel.Country || rel.Citizenship || rel.Jurisdiction || [])[0];
    return { qid: e.q, label: e.label, type: e.type, description: e.desc || null, start: f.born || f.start || f.date || f.founded || null, end: f.died || f.end || f.dissolved || null,
      country: country ? country[1] : null, mentions: e.total || 0, appears_in: appears, wikipedia: wiki(e.wiki) };
  }).sort((a, b) => ENC_TYPE_ORDER.indexOf(a.type) - ENC_TYPE_ORDER.indexOf(b.type) || b.mentions - a.mentions || (a.qid < b.qid ? -1 : 1)),
  from: ['lake/data/index.json', 'lake/data/e/*.json'], refresh: 'monthly', updatedFrom: 'lake/data/manifest.json', page: 'encyclopedia/index.html', partitionBy: 'type',
  licence: 'Wikidata facts, labels and descriptions CC0; tags and links © JDP-Iq. (Wikipedia summaries, CC BY-SA 4.0, are only in the full entity records.)', sources: ['Wikidata (CC0)', 'Every PRP submodule that mentions the entity'],
  fields: [['qid', 'Wikidata id; the Encyclopaedia page is encyclopedia/index.html#<qid>'], ['label', 'Name'], ['type', LAKE_TYPES.join(', ')], ['description', 'Short description (Wikidata)'],
    ['start', 'Born, founded, held or started (as precise as Wikidata records it)'], ['end', 'Died, dissolved or ended'], ['country', 'Country, citizenship or jurisdiction (the first Wikidata gives)'],
    ['mentions', 'How many times PRP mentions it'], ['appears_in', 'PRP submodule ids that mention it'], ['wikipedia', 'English Wikipedia article']]
});

const borders = J('battlefield/history/data/borders.topo.json');
const GW_NAME = new Map(); // gw -> [[s, e, name]]
for (const g of Object.values(borders.objects)[0].geometries) { const p = g.properties || {}; if (p.gw == null) continue; (GW_NAME.get(p.gw) || GW_NAME.set(p.gw, []).get(p.gw)).push([p.s, p.e, p.name]); }
const { displayName } = await import('../../battlefield/history/names.mjs');
const gwName = (gw, date) => { const list = GW_NAME.get(gw) || []; const hit = list.find(([s, e]) => date >= s && date <= e) || list[list.length - 1]; return displayName(gw, hit ? hit[2] : `State ${gw}`, date || '0000'); };
const HIST = J('battlefield/history/data/wars.json');
spec({
  id: 'retrospective-wars', title: 'Retrospective Battlefield: wars and armed conflicts 1926–2025', module: 'rs', submodule: 'battlefield-history',
  description: `Every war and armed conflict from ${HIST.firstYear} to ${HIST.lastYear}: UCDP/PRIO from ${HIST.ucdpFrom} (25+ battle deaths a year; intensity 2 means 1,000+), Correlates of War before (wars of 1,000+ battle deaths), with type, aim, sides, where it was fought and its active years.`,
  derive: () => HIST.wars.map(w => { const ys = (w.years || []).map(y => y[0]); const first = ys.length ? Math.min(...ys) : null, last = ys.length ? Math.max(...ys) : null; const d = w.start || (first ? `${first}-01-01` : '0000');
    return { id: w.id, dataset: w.src === 'ucdp' ? 'UCDP/PRIO' : 'Correlates of War', name: w.name, type: w.type, aim: w.aim || null, start: w.start || null, first_year: first, last_year: last, active_years: ys.length,
      peak_intensity: (w.years || []).reduce((m, y) => Math.max(m, y[1] || 0), 0) || null, war_years: (w.years || []).filter(y => y[1] === 2).length, fought_in: [...new Set((w.loc || []).map(g => gwName(g, d)))],
      states_involved: [...new Set((w.states || []).map(g => gwName(g, d)))], side_a: w.sideA || [], side_b: w.sideB || [], battle_deaths: w.deaths ?? null, wikipedia: wiki(w.wiki) }; }),
  from: ['battlefield/history/data/wars.json', 'battlefield/history/data/borders.topo.json'], refresh: 'static', updatedFrom: 'battlefield/history/data/wars.json', page: 'battlefield/history/index.html',
  licence: 'UCDP/PRIO Armed Conflict Dataset CC BY 4.0 (1946–2025); Correlates of War data free to use with citation (Sarkees & Wayman 2010); state names from CShapes 2.0 (CC BY-NC-SA 4.0).',
  sources: [HIST.sources.ucdp, HIST.sources.cow, 'CShapes 2.0 (Schvitz et al. 2022) for state names'],
  fields: [['id', 'Conflict id (u… UCDP, c… Correlates of War)'], ['dataset', 'UCDP/PRIO or Correlates of War'], ['name', 'Conflict'], ['type', 'Conflict type (civil, internationalised civil, interstate, colonial…)'], ['aim', 'Incompatibility: government or territory (UCDP)'],
    ['start', 'Start date, where recorded'], ['first_year', 'First active year'], ['last_year', 'Last active year'], ['active_years', 'Number of active years'], ['peak_intensity', 'Highest yearly intensity: 1 = 25–999 battle deaths, 2 = 1,000 or more'],
    ['war_years', 'Years at intensity 2'], ['fought_in', 'States where it was fought'], ['states_involved', 'States taking part'], ['side_a', 'Side A'], ['side_b', 'Side B'], ['battle_deaths', 'Battle deaths (Correlates of War only)'], ['wikipedia', 'Wikipedia article, where known']]
});

const FOCUS = J('battlefield/focus/data/index.json');
const focusLicence = 'UCDP GED CC BY 4.0; PRIO Battle Deaths and Correlates of War free to use with citation; battles from Wikidata (CC0); borders CShapes 2.0 CC BY-NC-SA 4.0 (non-commercial).';
const focusSources = Object.values(FOCUS.sources);
spec({
  id: 'war-focus-wars', title: 'War Focus: major wars', module: 'rs', submodule: 'war-focus',
  description: 'The major wars of the last hundred years that War Focus follows month by month: dates, sides, total deaths and where the figure comes from, and how many battles are recorded and mapped.',
  source: { urls: ['battlefield/focus/data/index.json'], records: 'wars' }, refresh: 'monthly', page: 'battlefield/focus/index.html',
  licence: focusLicence, sources: focusSources,
  fields: [['id', 'War id (also the file battlefield/focus/data/wars/<id>.json)'], ['name', 'War'], ['qid', 'Wikidata id'], ['wiki', 'Wikipedia title'], ['bf', 'Matching conflict id in retrospective-wars'], ['start', 'Start date'], ['end', 'End date (null if ongoing)'],
    ['ongoing', 'True if still being fought'], ['totalDeaths', 'Total deaths'], ['deathsSource', 'Where the death figure comes from'], ['battles', 'Battles, sieges and operations recorded (Wikidata)'], ['mappedBattles', 'Of those, how many have coordinates'],
    ['events', 'UCDP georeferenced events'], ['sides', 'The two sides'], ['bbox', 'Map extent [west, south, east, north]']]
});
const focusWars = () => FOCUS.wars.map(w => (has(`battlefield/focus/data/wars/${w.id}.json`) ? J(`battlefield/focus/data/wars/${w.id}.json`) : null)).filter(Boolean);
const PREC = { m: 'month', y: 'year' };
spec({
  id: 'war-focus-battles', title: 'War Focus: battles, sieges and operations', module: 'rs', submodule: 'war-focus',
  description: 'Every battle, siege and operation that Wikidata records as part of a War Focus war, with dates at the precision Wikidata gives, deaths or casualties where known, and coordinates where mapped.',
  derive: () => focusWars().flatMap(w => (w.battles || []).map(b => ({ war_id: w.id, war: w.name, qid: b.q, name: b.n, description: b.desc || null, start: b.s || null, end: b.e || null, precision: PREC[b.p] || 'day', deaths: b.deaths ?? null, casualties: b.cas ?? null, lat: b.lat ?? null, lon: b.lon ?? null, wikipedia: wiki(b.w) }))),
  from: ['battlefield/focus/data/wars/*.json'], refresh: 'monthly', updatedFrom: 'battlefield/focus/data/index.json', page: 'battlefield/focus/index.html', indexFields: ['war_id', 'war'],
  licence: 'Wikidata CC0.', sources: ['Wikidata (CC0): battles, sieges and operations that are part of each war'],
  fields: [['war_id', 'War id (war-focus-wars)'], ['war', 'War'], ['qid', 'Wikidata id of the battle'], ['name', 'Battle, siege or operation'], ['description', 'Wikidata description'], ['start', 'Start date'], ['end', 'End date'],
    ['precision', 'Precision of the dates: day, month or year'], ['deaths', 'Deaths (Wikidata), if recorded'], ['casualties', 'Casualties (Wikidata), if recorded'], ['lat', 'Latitude, if mapped'], ['lon', 'Longitude, if mapped'], ['wikipedia', 'Wikipedia article']]
});
spec({
  id: 'war-focus-monthly-deaths', title: 'War Focus: deaths by month', module: 'rs', submodule: 'war-focus',
  description: 'Deaths in each War Focus war month by month. Where no monthly record exists, annual or war totals are spread across months by recorded events or battles; those months are marked as estimates.',
  derive: () => focusWars().flatMap(w => (w.months || []).map((m, i) => ({ war_id: w.id, war: w.name, month: m, deaths: w.deaths?.[i] ?? null, estimated: !!w.estimated?.[i], source: w.deathsSource || null }))),
  from: ['battlefield/focus/data/wars/*.json'], refresh: 'monthly', updatedFrom: 'battlefield/focus/data/index.json', page: 'battlefield/focus/index.html', indexFields: ['war_id', 'war'],
  licence: focusLicence, sources: focusSources.slice(0, 3),
  fields: [['war_id', 'War id (war-focus-wars)'], ['war', 'War'], ['month', 'Month (YYYY-MM)'], ['deaths', 'Deaths that month'], ['estimated', 'True when spread from an annual or war total'], ['source', 'Where the war\'s death figures come from']]
});

const KAR = J('kardashev/data/energy.json');
const karLicence = 'Estimates © JDP-Iq after Ian Morris (2010, 2013), McEvedy & Jones and Maddison; from 1900, Energy Institute / Our World in Data (CC BY 4.0).';
const karSources = ['Ian Morris, Why the West Rules — For Now (2010) and The Measure of Civilization (2013)', 'McEvedy & Jones, Maddison: populations', 'Energy Institute Statistical Review / Our World in Data (from 1900)'];
spec({
  id: 'kardashev-polities', title: 'Kardashev Tracker: powers', module: 'rs', submodule: 'kardashev',
  description: 'The empires and countries the Kardashev Tracker follows from 2000 BC to today, with their capital\'s position and years.',
  source: { urls: ['kardashev/data/energy.json'], records: 'polities' }, refresh: 'static', page: 'kardashev/index.html', licence: karLicence, sources: karSources,
  fields: [['id', 'Power id'], ['name', 'Empire or country'], ['lat', 'Latitude of its centre'], ['lon', 'Longitude of its centre'], ['region', 'Region'], ['wiki', 'Wikipedia title'], ['from', 'First year (negative = BC)'], ['to', 'Last year']]
});
const POL = new Map(KAR.polities.map(p => [p.id, p]));
spec({
  id: 'kardashev-shares', title: 'Kardashev Tracker: shares of world energy', module: 'rs', submodule: 'kardashev',
  description: 'Each power\'s population, energy capture per person and share of humanity\'s energy capture, century by century from 2000 BC (then 1850, 1900, 1950, 2000 and 2025), with its own Kardashev rating. "Rest of world" rows complete each year.',
  derive: () => KAR.steps.flatMap(s => [...(s.polities || []).map(p => ({ year: s.year, polity_id: p.id, polity: POL.get(p.id)?.name || p.id, population: p.pop, kcal_per_person_day: p.kcal ?? null, watts: Math.round(p.watts), share: round(p.share, 4), kardashev: p.K ?? null })),
    ...(s.rest ? [{ year: s.year, polity_id: 'rest', polity: 'Rest of world', population: s.rest.pop, kcal_per_person_day: null, watts: Math.round(s.rest.watts), share: round(s.rest.share, 4), kardashev: null }] : [])]),
  from: ['kardashev/data/energy.json'], refresh: 'static', updatedFrom: 'kardashev/data/energy.json', page: 'kardashev/index.html', licence: karLicence, sources: karSources,
  fields: [['year', 'Year (negative = BC)'], ['polity_id', 'Power id (kardashev-polities), or rest'], ['polity', 'Power'], ['population', 'Population'], ['kcal_per_person_day', 'Energy capture per person, kcal a day'], ['watts', 'Total energy capture, watts'], ['share', 'Share of world energy capture, 0–1'], ['kardashev', 'Kardashev rating of the power alone']]
});
spec({
  id: 'kardashev-world', title: 'Kardashev Tracker: humanity', module: 'rs', submodule: 'kardashev',
  description: 'World population, total energy capture and humanity\'s Kardashev rating (Sagan: K = (log10 P − 6) / 10, P in watts) for each step from 2000 BC to 2025.',
  derive: () => KAR.steps.map(s => ({ year: s.year, world_population: s.worldPop, world_watts: Math.round(s.worldWatts), kardashev: s.K })),
  from: ['kardashev/data/energy.json'], refresh: 'static', updatedFrom: 'kardashev/data/energy.json', page: 'kardashev/index.html', licence: karLicence, sources: karSources,
  fields: [['year', 'Year (negative = BC)'], ['world_population', 'World population'], ['world_watts', 'Humanity\'s energy capture, watts'], ['kardashev', 'Kardashev rating']]
});

// ---- Money Management -----------------------------------------------------------------------------------------
const briefSpecs = (id, file, module, submodule, title, facetKey, refresh, sourcesNote) => {
  if (!has(file)) return;
  const d = J(file);
  const facets = (d[facetKey] || []).map(f => f.id).join(', ');
  const itemKeys = new Set(d.items.flatMap(i => Object.keys(i)));
  const F = { id: 'Item id', title: 'Title', url: 'Link to the item at its publisher', source: `Source id; join to \`id\` in ${id}-sources`, kind: `Kind of source: ${Object.keys(d.kinds || {}).join(', ')}`, tier: `Source tier: ${Object.entries(d.tiers || {}).map(([k, v]) => `${k} ${v}`).join('; ')}`,
    [facetKey]: `${facetKey[0].toUpperCase() + facetKey.slice(1)} it is classed under (${facets})`, type: 'paper (research) or news', published: 'Publication time (ISO 8601, UTC)', summary: 'Short summary from the feed (the text remains the publisher\'s)', section: 'Publisher\'s section or journal heading',
    doi: 'DOI, if any', authors: 'Authors, if given', also: 'Other outlets that carried the same item', undated: 'True when the feed gave no date (the time is when PRP first saw it)' };
  spec({
    id: `${id}-stories`, title: `${title}: stories and papers`, module, submodule,
    description: `Every paper and story in the ${title} over the last ${d.keepDays || 7} days, classed by ${facetKey} (${facets}) and by type (papers or news). Join \`source\` to ${id}-sources.`,
    source: { urls: [file], records: 'items' }, refresh, licence: 'Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.', sources: [sourcesNote],
    fields: [...Object.keys(F).filter(k => itemKeys.has(k)).map(k => [k, F[k]]), ...[...itemKeys].filter(k => !F[k]).map(k => [k, UNDESCRIBED])]
  });
  const srcKeys = new Set(d.sources.flatMap(s => Object.keys(s)));
  const S = { id: 'Source id', outlet: 'Outlet or publisher', outletId: 'Outlet id', name: 'Feed name', url: 'Home page', feed: 'Feed URL', kind: 'Kind of source', tier: 'Tier (1 is the most authoritative)', [facetKey]: `Default ${facetKey} for the feed`, qid: 'Wikidata id of the outlet',
    status: 'Feed status at the last refresh', count: 'Items in the feed at the last check', stored: 'Items kept from this feed', latest: 'Latest item time', checked: 'Last checked', lastOk: 'Last successful read', etag: 'HTTP ETag of the feed', lastModified: 'HTTP Last-Modified of the feed', error: 'Last error, if any',
    notModified: 'True when the feed answered "not modified" at the last check (its earlier items are kept)', strict: `True when items matching none of the briefing's ${facetKey} are dropped (feeds that also carry other subjects)`,
    badge: "Label shown on this source's items instead of its kind (e.g. Opinion)", byline: "True when the feed's author line is shown",
    perDay: 'Preprint servers: at most this many new submissions kept from each daily announcement', matched: 'Items in the feed that matched the briefing before the daily cap' };
  spec({
    id: `${id}-sources`, title: `${title}: sources`, module, submodule,
    description: `The journals, preprint servers, institutions and news desks the ${title} reads, with their tier, default ${facetKey} and feed status.`,
    source: { urls: [file], records: 'sources' }, refresh, licence: 'Metadata © JDP-Iq.', sources: [sourcesNote],
    fields: [...Object.keys(S).filter(k => srcKeys.has(k)).map(k => [k, S[k]]), ...[...srcKeys].filter(k => !S[k]).map(k => [k, UNDESCRIBED])]
  });
};
briefSpecs('econ-briefing', 'econ/briefing/data/stories.json', 'mm', 'econ-briefing', 'Economics Briefing', 'fields', '6-hourly', 'RSS and Atom feeds of the journals, working-paper series, central banks, think tanks and economics desks listed in econ-briefing-sources');

const CONG = J('traders/data/congress.json');
const MEMBERS = new Map(CONG.members.map(m => [m.id, m]));
const AMT = s => { const m = String(s || '').match(/\$([\d,]+(?:\.\d+)?)(?:\s*-\s*\$([\d,]+(?:\.\d+)?))?/); if (!m) return [null, null]; const a = +m[1].replace(/,/g, ''), b = m[2] ? +m[2].replace(/,/g, '') : a; return [a, b]; };
const OWNER = { self: 'self', JT: 'joint', SP: 'spouse', DC: 'dependent child' };
const congLicence = 'Public records: Periodic Transaction Reports filed with the Clerk of the US House of Representatives (STOCK Act); compilation © JDP-Iq. Not investment advice.';
spec({
  id: 'congress-members', title: 'Auto Trader: members of Congress who trade', module: 'mm', submodule: 'traders',
  description: `Members of the US House of Representatives with Periodic Transaction Reports in ${CONG.years.join(' and ')}, with party, district and how many trades PRP read from their filings.`,
  derive: () => CONG.members.map(m => ({ id: m.id, name: m.name, party: m.party, district: m.district, state: (m.district || '').slice(0, 2) || null, bioguide: m.bioguide || null, filings: m.filings ?? 0, trades: m.trades ?? 0, unreadable_filings: m.unreadable ?? 0 })).sort((a, b) => b.trades - a.trades),
  from: ['traders/data/congress.json'], refresh: 'weekly', resets: 'yearly', updatedFrom: 'traders/data/congress.json', page: 'fe/traders.html?tab=congress', licence: congLicence, sources: [CONG.source],
  fields: [['id', 'Member id (join to member in congress-trades)'], ['name', 'Member'], ['party', 'Party'], ['district', 'State and district, e.g. CA31'], ['state', 'State (USPS code)'], ['bioguide', 'Congressional Bioguide id'], ['filings', 'Filings read'], ['trades', 'Trades read from them'], ['unreadable_filings', 'Scanned paper filings linked but not read']]
});
spec({
  id: 'congress-trades', title: 'Auto Trader: trades by members of Congress', module: 'mm', submodule: 'traders',
  description: `Every stock, bond and option trade reported by members of the House in ${CONG.years.join(' and ')} (STOCK Act), newest filing first, sharded by filing date. Amounts are the ranges filed, with their bounds as numbers.`,
  derive: () => CONG.trades.map(t => { const m = MEMBERS.get(t.member) || {}; const [lo, hi] = AMT(t.amount); return { filed: t.filed, date: t.date || null, member: t.member, name: m.name || null, party: m.party || null, district: m.district || null, owner: OWNER[t.owner] || t.owner || null,
    type: t.type, ticker: t.ticker || null, asset: t.asset || null, asset_type: t.assetType || null, amount: t.amount || null, amount_min: lo, amount_max: hi, account: t.account || null, filing: t.url || null }; }).sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0)),
  from: ['traders/data/congress.json'], refresh: 'weekly', resets: 'yearly', updatedFrom: 'traders/data/congress.json', page: 'fe/traders.html?tab=congress', rangeFields: ['filed', 'date'], indexFields: ['ticker', 'member', 'name'], licence: congLicence, sources: [CONG.source],
  fields: [['filed', 'Date the report was filed'], ['date', 'Date of the trade'], ['member', 'Member id (congress-members)'], ['name', 'Member'], ['party', 'Party'], ['district', 'State and district'], ['owner', 'Whose account: self, spouse, joint or dependent child'],
    ['type', 'buy, sell, partial sale or exchange'], ['ticker', 'Ticker, where the filing gives one'], ['asset', 'Asset as described in the filing'], ['asset_type', 'House asset-type code (ST stock, GS government security, OP option, CS corporate security…)'],
    ['amount', 'Amount range as filed'], ['amount_min', 'Lower bound of the range, US$'], ['amount_max', 'Upper bound of the range, US$'], ['account', 'Account or broker, if given'], ['filing', 'Link to the filing (PDF)']]
});
const INV = J('traders/data/investors.json');
const invLicence = 'Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.';
const invSources = ['SEC EDGAR Form 13F-HR (the latest two filings per manager)', `${INV.tickers?.source || 'OpenFIGI'}: CUSIP to US listing`];
spec({
  id: 'investors', title: 'Auto Trader: famous investors', module: 'mm', submodule: 'traders',
  description: 'The famous investors Auto Trader follows, with their fund, style, latest 13F period and filing, and the reported value of their US long positions.',
  derive: () => INV.investors.map(i => ({ cik: i.cik, person: i.person, fund: i.fund, style: i.style || null, registered_name: i.registeredName || null, period: i.period || null, filed: i.filed || null, previous_period: i.previousPeriod || null, total_value: i.total ?? null, positions: (i.positions || []).length, sold_out: (i.sold || []).length, filing: i.filingUrl || null })),
  from: ['traders/data/investors.json'], refresh: 'weekly', updatedFrom: 'traders/data/investors.json', page: 'fe/traders.html?tab=investors', licence: invLicence, sources: invSources,
  fields: [['cik', 'SEC CIK'], ['person', 'Investor'], ['fund', 'Fund'], ['style', 'Investment style (PRP)'], ['registered_name', 'Name on the filing'], ['period', 'Quarter end of the latest 13F'], ['filed', 'Filing date'], ['previous_period', 'Quarter end of the filing compared against'],
    ['total_value', 'Reported value of positions, US$'], ['positions', 'Positions held'], ['sold_out', 'Positions sold out since the previous filing'], ['filing', 'Filing index on EDGAR']]
});
spec({
  id: 'investor-holdings', title: 'Auto Trader: famous investors\' holdings', module: 'mm', submodule: 'traders',
  description: 'Every position in the latest 13F filing of each famous investor, with value, shares, weight in the portfolio and the change since the previous filing (new, added, reduced, unchanged).',
  derive: () => INV.investors.flatMap(i => (i.positions || []).map(p => ({ person: i.person, fund: i.fund, period: i.period, name: p.name, ticker: p.ticker || null, class: p.cls || null, cusip: p.cusip || null, put_call: p.putCall || null, value: p.value ?? null, shares: p.shares ?? null, weight: round(p.weight, 5), change: p.change || null, shares_change: p.sharesChange ?? null }))),
  from: ['traders/data/investors.json'], refresh: 'weekly', updatedFrom: 'traders/data/investors.json', page: 'fe/traders.html?tab=investors', indexFields: ['person', 'ticker'], licence: invLicence, sources: invSources,
  fields: [['person', 'Investor'], ['fund', 'Fund'], ['period', 'Quarter end'], ['name', 'Issuer'], ['ticker', 'Ticker (OpenFIGI)'], ['class', 'Class of security'], ['cusip', 'CUSIP'], ['put_call', 'Put or Call for options, else null'], ['value', 'Reported value, US$'], ['shares', 'Shares or principal'],
    ['weight', 'Share of the portfolio by value, 0–1'], ['change', 'Change since the previous filing: new, added, reduced or unchanged'], ['shares_change', 'Change in shares since the previous filing']]
});
spec({
  id: 'investor-sales', title: 'Auto Trader: famous investors\' exits', module: 'mm', submodule: 'traders',
  description: 'Positions each famous investor held at the previous quarter end and no longer reports in the latest 13F.',
  derive: () => INV.investors.flatMap(i => (i.sold || []).map(p => ({ person: i.person, fund: i.fund, period: i.period, previous_period: i.previousPeriod || null, name: p.name, ticker: p.ticker || null, class: p.cls || null, cusip: p.cusip || null, put_call: p.putCall || null, previous_value: p.value ?? null, previous_shares: p.shares ?? null }))),
  from: ['traders/data/investors.json'], refresh: 'weekly', resets: 'quarterly', updatedFrom: 'traders/data/investors.json', page: 'fe/traders.html?tab=investors', licence: invLicence, sources: invSources,
  fields: [['person', 'Investor'], ['fund', 'Fund'], ['period', 'Quarter end of the latest filing'], ['previous_period', 'Quarter end when it was last held'], ['name', 'Issuer'], ['ticker', 'Ticker'], ['class', 'Class of security'], ['cusip', 'CUSIP'], ['put_call', 'Put or Call for options'], ['previous_value', 'Value at the previous quarter end, US$'], ['previous_shares', 'Shares at the previous quarter end']]
});

// ---- Natural Science ------------------------------------------------------------------------------------------
briefSpecs('science-briefing', 'science/briefing/data/stories.json', 'ns', 'science-briefing', 'Scientific Briefing', 'disciplines', '6-hourly', 'RSS and Atom feeds of the journals and science desks listed in science-briefing-sources (Springer Nature, AAAS, Cell Press, PNAS, APS, Wiley, IOP, AAS, PLOS, NASA, ESA and others)');
const PROG = J('science/progress/data/events.json');
const DISC = new Map(PROG.disciplines.map(d => [d.id, d.name]));
const progLicence = 'Facts from Wikidata (CC0); titles and notes © JDP-Iq.';
const progSources = [PROG.source, 'Natural Earth (public domain) for the map'];
spec({
  id: 'science-progress-events', title: 'Invention Timeline: breakthroughs', module: 'ns', submodule: 'progress',
  description: `Key scientific and technical breakthroughs from ${-PROG.firstYear} BC to ${PROG.lastYear}, with year, discipline, where they happened (and on what basis that place was chosen), the people and the institutions involved.`,
  derive: () => PROG.events.map(e => ({ id: e.id, year: e.y, circa: !!e.ca, disciplines: (e.d || []).map(d => DISC.get(d) || d), title: e.t, note: e.n || null, qid: e.q || null, wikipedia: wiki(e.w), place: e.place?.n || null, place_qid: e.place?.q || null,
    lat: e.place?.lat ?? null, lon: e.place?.lon ?? null, position_basis: e.positionBasis || null, people: (e.people || []).map(q => PROG.people[q]?.name || q), people_qids: e.people || [], institutions: (e.inst || []).map(q => PROG.institutions[q]?.name || q) })),
  from: ['science/progress/data/events.json'], refresh: 'monthly', updatedFrom: 'science/progress/data/events.json', page: 'science/progress/index.html', licence: progLicence, sources: progSources,
  fields: [['id', 'Event id'], ['year', 'Year (negative = BC)'], ['circa', 'True when the year is approximate'], ['disciplines', 'Disciplines'], ['title', 'Breakthrough'], ['note', 'One-line explanation (PRP)'], ['qid', 'Wikidata id'], ['wikipedia', 'Wikipedia article'],
    ['place', 'Where it happened'], ['place_qid', 'Wikidata id of the place'], ['lat', 'Latitude'], ['lon', 'Longitude'], ['position_basis', `How the place was chosen: ${Object.keys(PROG.basis).join(', ')}`], ['people', 'People involved'], ['people_qids', 'Their Wikidata ids (science-progress-people)'], ['institutions', 'Institutions involved']]
});
spec({
  id: 'science-progress-people', title: 'Invention Timeline: people', module: 'ns', submodule: 'progress',
  description: 'The scientists, inventors and thinkers behind the Invention Timeline, with life dates, countries, occupations and fields (Wikidata).',
  derive: () => Object.entries(PROG.people).map(([qid, p]) => ({ qid, name: p.name, description: p.desc || null, born: p.born ?? null, died: p.died ?? null, countries: p.country || [], occupations: p.occupation || [], fields: p.field || [], institutions: (p.inst || []).map(q => PROG.institutions[q]?.name || q), wikipedia: wiki(p.wiki) })).sort((a, b) => (a.born ?? 0) - (b.born ?? 0)),
  from: ['science/progress/data/events.json'], refresh: 'monthly', updatedFrom: 'science/progress/data/events.json', page: 'science/progress/index.html', licence: 'Wikidata CC0.', sources: [PROG.source],
  fields: [['qid', 'Wikidata id'], ['name', 'Name'], ['description', 'Wikidata description'], ['born', 'Year of birth (negative = BC)'], ['died', 'Year of death'], ['countries', 'Countries of citizenship'], ['occupations', 'Occupations'], ['fields', 'Fields of work'], ['institutions', 'Institutions'], ['wikipedia', 'Wikipedia article']]
});
spec({
  id: 'science-progress-institutions', title: 'Invention Timeline: institutions', module: 'ns', submodule: 'progress',
  description: 'Universities, laboratories, companies and academies linked to the Invention Timeline, with coordinates (Wikidata).',
  derive: () => Object.entries(PROG.institutions).map(([qid, p]) => ({ qid, name: p.name, description: p.desc || null, lat: p.lat ?? null, lon: p.lon ?? null, wikipedia: wiki(p.wiki) })),
  from: ['science/progress/data/events.json'], refresh: 'monthly', updatedFrom: 'science/progress/data/events.json', page: 'science/progress/index.html', licence: 'Wikidata CC0.', sources: [PROG.source],
  fields: [['qid', 'Wikidata id'], ['name', 'Institution'], ['description', 'Wikidata description'], ['lat', 'Latitude'], ['lon', 'Longitude'], ['wikipedia', 'Wikipedia article']]
});

// ---- Digital Science ------------------------------------------------------------------------------------------
if (has('digital/briefing/data/stories.json')) {
  const d = J('digital/briefing/data/stories.json');
  const key = ['fields', 'topics', 'disciplines', 'areas'].find(k => Array.isArray(d[k])) || 'fields';
  briefSpecs('digital-briefing', 'digital/briefing/data/stories.json', 'ds', 'digital-briefing', 'Digital Briefing', key, '6-hourly', 'RSS and Atom feeds of the journals, preprint servers, labs and technology desks listed in digital-briefing-sources');
}
spec({
  id: 'prp-submodules', title: 'PRP: modules and submodules', module: 'ds', submodule: 'integration-hub',
  description: 'Every PRP submodule: its module, kind, status, address and what it does. Private submodules (behind their own sign-in) are listed but none of their data is published here.',
  derive: () => REG.suites.flatMap(s => s.modules.map(m => ({ module: s.id, module_code: s.code, module_name: s.name, id: m.id, name: m.name, kind: m.kind, status: m.status, private: !!m.opensInNewTab || /Private\.?$/.test(m.description || ''),
    url: m.url ? (/^https?:/.test(m.url) ? m.url : BASE_URL + m.url) : null, planned_url: m.pendingUrl ? BASE_URL + m.pendingUrl : null, host: m.host || null, description: m.description || null, views: (m.views || []).map(v => v.name) }))),
  from: ['registry.json'], refresh: 'on change', updated: TODAY, page: 'index.html', licence: '© JDP-Iq.', sources: ['registry.json'],
  fields: [['module', 'Module id (rt, rs, mm, ns, ds, kino)'], ['module_code', 'Module code'], ['module_name', 'Module'], ['id', 'Submodule id'], ['name', 'Submodule'], ['kind', 'realtime, retrospective, reference, learning, operations or automation'], ['status', 'live, in-build or planned'],
    ['private', 'True for private submodules behind their own sign-in'], ['url', 'Address'], ['planned_url', 'Address once built (in-build submodules)'], ['host', 'Where it is hosted'], ['description', 'What it does'], ['views', 'Tabs inside the page']]
});

// ---- Kino -----------------------------------------------------------------------------------------------------
spec({
  id: 'kino-documentaries', title: 'Kino: documentaries and courses', module: 'kino', submodule: 'kino-political-events', submodules: REG.suites.find(s => s.id === 'kino')?.modules.map(m => m.id) || [],
  description: 'Every Kino documentary and Great Thinkers course: category, era, running time, subjects (Wikidata ids), scenes, parts, quiz questions, how many sources (and scholarly sources) it draws on, and the PRP submodules its scenes link to.',
  source: { urls: ['kino/data/index.json'], records: 'docs' }, refresh: 'monthly', page: 'kino/index.html', licence: 'Documentary texts and index © JDP-Iq; images from Wikimedia Commons, each under its own licence (kino/data/media.json).', sources: ['Scholarly books and articles listed in each documentary', 'Wikidata (CC0)', 'Wikimedia Commons'],
  fields: [['id', 'Documentary id'], ['title', 'Title'], ['category', 'Kino category (the submodule kino-<category>)'], ['era', '[first year, last year]'], ['minutes', 'Approximate running time, minutes'], ['summary', 'Summary'], ['subjects', 'Subjects, each {qid, label}'], ['scenes', 'Scenes'], ['parts', 'Parts (courses)'],
    ['quiz', 'Quiz questions'], ['sources', 'Sources cited'], ['scholarly', 'Of those, scholarly'], ['links', 'PRP submodules the scenes link to (module/submodule)'], ['preview', 'Preview image: {kind, file, position}'], ['path', 'Script file under kino/data/']]
});

/* ------------------------------------------------------------------ build datasets */
const PART_BUDGET = 1_200_000; // parse cost per derived part (jsonCost ≈ ns of JSON.parse on a fast core: ~1.2 ms)
const catalogue = [];
const query = {};
const derivedFiles = new Set();

function ranges(rows, fields) {
  const r = {};
  for (const f of fields || []) { let lo = null, hi = null; for (const row of rows) { const v = row[f]; if (v == null || v === '') continue; if (lo === null || v < lo) lo = v; if (hi === null || v > hi) hi = v; } if (lo !== null) r[f] = [lo, hi]; }
  return r;
}
const trimSample = v => (typeof v === 'string' ? (v.length > 160 ? v.slice(0, 159) + '…' : v) : Array.isArray(v) ? v.slice(0, 4).map(trimSample) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 6).map(([k, x]) => [k, trimSample(x)])) : v);

for (const s of SPECS) {
  let parts = [], allRows = [];
  const rowsOf = new Map(); // part url -> rows (derived datasets), for the value index
  if (s.derive) {
    const rows = s.derive();
    allRows = rows;
    // One group per partition value (if any), each split into parts of at most partBudget parse cost.
    const partitions = [];
    if (s.partitionBy) { const m = new Map(); for (const r of rows) { const k = r[s.partitionBy] ?? '(none)'; (m.get(k) || m.set(k, []).get(k)).push(r); } for (const [k, rs] of m) partitions.push({ rows: rs, values: { [s.partitionBy]: [k] } }); }
    else partitions.push({ rows });
    const groups = [];
    const budget = s.partBudget || PART_BUDGET;
    for (const p of partitions) {
      let cur = [], cost = 0;
      for (const r of p.rows) { const c = jsonCost(JSON.stringify(r)) + 1; if (cur.length && cost + c > budget) { groups.push({ rows: cur, values: p.values }); cur = []; cost = 0; } cur.push(r); cost += c; }
      if (cur.length || !groups.length) groups.push({ rows: cur, values: p.values });
    }
    const multi = groups.length > 1;
    groups.forEach((g, i) => {
      const url = multi ? `integration/data/${s.id}/${i}.json` : `integration/data/${s.id}.json`;
      const body = { dataset: s.id, generated: STAMP, derivedFrom: s.from, licence: s.licence, ...(multi ? { part: i, parts: groups.length } : {}), records: g.rows };
      const str = JSON.stringify(body) + '\n';
      put(url, str); derivedFiles.add(url); rowsOf.set(url, g.rows);
      parts.push({ url, records: 'records', rows: g.rows.length, bytes: Buffer.byteLength(str), cost: jsonCost(str), ...(g.values ? { values: g.values } : {}), ...(Object.keys(ranges(g.rows, s.rangeFields)).length ? { ranges: ranges(g.rows, s.rangeFields) } : {}) });
    });
  } else {
    for (const url of s.source.urls) {
      const str = text(url); const recs = pick(JSON.parse(str), s.source.records) || [];
      allRows = allRows.concat(recs);
      parts.push({ url, records: s.source.records, rows: recs.length, bytes: Buffer.byteLength(str), cost: jsonCost(str), ...(s.source.ranges?.[url] ? { ranges: s.source.ranges[url] } : {}) });
    }
  }
  // Fields: the described ones, in order, with types inferred from every record.
  const described = new Map(s.fields);
  const present = new Set(allRows.flatMap(r => (r && typeof r === 'object' ? Object.keys(r) : [])));
  const fields = [...described.keys()].filter(k => present.has(k) || s.derive).map(name => ({ name, type: typeOf(allRows.map(r => r?.[name])), description: described.get(name) }));
  for (const k of present) if (!described.has(k)) fields.push({ name: k, type: typeOf(allRows.map(r => r?.[k])), description: UNDESCRIBED });
  for (const f of fields) if (f.description === UNDESCRIBED) console.warn(`  ! ${s.id}: field "${f.name}" is not described yet (add it to build-catalog.mjs)`);
  const urls = parts.map(p => p.url);
  const updated = s.updated || (s.updatedFrom ? genOf(s.updatedFrom) : null) || (s.source ? s.source.urls.map(genOf).filter(Boolean).sort().pop() : null) || TODAY;
  const entry = {
    id: s.id, title: s.title, module: s.module, submodule: s.submodule, description: s.description,
    ...(urls.length === 1 ? { url: urls[0] } : { urls }), format: 'json', records: parts[0]?.records ?? '',
    fields, rows: allRows.length, licence: s.licence, sources: s.sources, updated, refresh: s.refresh,
    ...(s.page ? { page: s.page } : SUBMODULE_URL[s.submodule] ? { page: SUBMODULE_URL[s.submodule] } : {}),
    ...(s.derive ? { derivedFrom: s.from } : {}), ...(s.submodules ? { submodules: s.submodules } : {}),
    bytes: parts.reduce((a, p) => a + p.bytes, 0)
  };
  catalogue.push(entry);
  // Scan order for queries: newest data first when the parts carry date ranges.
  const order = [...parts].sort((a, b) => { const ra = a.ranges && Object.values(a.ranges)[0], rb = b.ranges && Object.values(b.ranges)[0]; return ra && rb ? (ra[1] < rb[1] ? 1 : ra[1] > rb[1] ? -1 : 0) : 0; });
  // Value index: for selective fields of sharded datasets, which shards hold each value (folded), so an eq/in query reads only those.
  const index = {};
  if (s.indexFields && order.length > 1) for (const f of s.indexFields) {
    const m = new Map();
    order.forEach((p, i) => { for (const r of rowsOf.get(p.url) || []) { const v = r[f]; if (v == null || v === '') continue; const k = foldText(String(v)); (m.get(k) || m.set(k, new Set()).get(k)).add(i); } });
    const avg = [...m.values()].reduce((a, x) => a + x.size, 0) / Math.max(1, m.size);
    if (avg <= order.length / 2) index[f] = Object.fromEntries([...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
  }
  query[s.id] = { parts: order, ...(Object.keys(index).length ? { index } : {}), sample: allRows.slice(0, 2).map(trimSample) };
  log(`${s.id.padEnd(34)} ${String(allRows.length).padStart(6)} rows  ${String(parts.length).padStart(2)} part(s)  ${(entry.bytes / 1024).toFixed(0).padStart(5)} KB  max part cost ${Math.max(...parts.map(p => p.cost))}`);
}

const MODULE_ORDER = ['rt', 'rs', 'oi', 'mm', 'ns', 'ds', 'kino'];
catalogue.sort((a, b) => MODULE_ORDER.indexOf(a.module) - MODULE_ORDER.indexOf(b.module));
const CATALOGUE = {
  generated: TODAY,
  name: 'PRP data catalogue',
  publisher: 'JDP-Iq',
  description: 'Every public dataset in PRP (Personal Resource Planner), with its fields, size, licence and sources. Read-only; no keys. Files are static JSON on this site; the MCP server (/mcp) and the JSON API (/api/v1/) query them with row and size caps.',
  site: BASE_URL, mcp: BASE_URL + 'mcp', api: BASE_URL + 'api/v1/', openapi: BASE_URL + 'integration/openapi.json', docs: BASE_URL + 'integration/', llms: BASE_URL + 'llms.txt',
  datasets: catalogue
};
putJson('integration/catalog.json', CATALOGUE, true);
putJson('integration/openapi.json', openapi(CATALOGUE, { site: BASE_URL }), true);
put('llms.txt', llmsTxt(CATALOGUE, { site: BASE_URL }));

/* ------------------------------------------------------------------ Encyclopaedia name index */
// Tokens of every label and alias → entity codes (qid number × 1000 + min(mentions, 99) × 10 + type), sorted by mentions.
// Shards are keyed by token prefix (two characters, extended where a shard grows past ~24 KB) and packed into ~40 files.
{
  const ents = lakeEntities().map(({ e }) => ({ qn: +String(e.q).slice(1), label: e.label || '', aliases: e.aliases || [], type: e.type, total: e.total || 0 }))
    .filter(e => Number.isFinite(e.qn)).sort((a, b) => b.total - a.total || a.qn - b.qn);
  const tok = new Map();
  const ok = t => [...t].length >= 2;
  for (const e of ents) {
    const code = e.qn * 1000 + Math.min(e.total, 99) * 10 + Math.max(0, LAKE_TYPES.indexOf(e.type));
    const lt = new Set(tokenize(e.label).filter(ok));
    const at = new Set(); for (const a of e.aliases) for (const t of tokenize(a)) if (ok(t) && !lt.has(t)) at.add(t);
    // x: the whole label or alias is this one word (acronyms such as UN, NATO, USSR; one-word names), for an exact-name boost
    const whole = new Set([e.label, ...e.aliases].map(n => tokenize(n)).filter(t => t.length === 1 && ok(t[0])).map(t => t[0]));
    const rec = t => tok.get(t) || tok.set(t, { l: [], a: [], x: [] }).get(t);
    for (const t of lt) rec(t).l.push(code);
    for (const t of at) rec(t).a.push(code);
    for (const t of whole) rec(t).x.push(code);
  }
  const LIMIT = 24000;
  const size = m => { let n = 20; for (const [t, r] of m) n += t.length + 12 + (r.l.length + r.a.length + r.x.length) * 11; return n; };
  const shards = new Map();
  for (const [t, r] of tok) { const k = [...t].slice(0, 2).join(''); (shards.get(k) || shards.set(k, new Map()).get(k)).set(t, r); }
  const split = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const [k, m] of [...shards]) {
      const L = [...k].length;
      if (L >= 8 || size(m) <= LIMIT || ![...m.keys()].some(t => [...t].length > L)) continue;
      split.add(k); changed = true;
      const keep = new Map();
      for (const [t, r] of m) { if ([...t].length === L) { keep.set(t, r); continue; } const k2 = [...t].slice(0, L + 1).join(''); (shards.get(k2) || shards.set(k2, new Map()).get(k2)).set(t, r); }
      if (keep.size) shards.set(k, keep); else shards.delete(k);
    }
  }
  const keys = [...shards.keys()].sort();
  const files = []; let cur = {}, curSize = 0;
  const keyFile = {};
  for (const k of keys) {
    const m = shards.get(k); const s = size(m);
    if (curSize && curSize + s > LIMIT) { files.push(cur); cur = {}; curSize = 0; }
    const l = {}, a = {}, x = {}; for (const [t, r] of [...m].sort((p, q) => (p[0] < q[0] ? -1 : 1))) { if (r.l.length) l[t] = r.l; if (r.a.length) a[t] = r.a; if (r.x.length) x[t] = r.x; }
    cur[k] = { l, a, x }; curSize += s; keyFile[k] = files.length;
  }
  if (Object.keys(cur).length) files.push(cur);
  files.forEach((f, i) => { const p = `integration/data/names/${i}.json`; put(p, JSON.stringify(f) + '\n'); derivedFiles.add(p); });
  putJson('integration/data/names/index.json', { generated: STAMP, about: 'Encyclopaedia name index: token prefix → file. Codes are qid number × 1000 + min(mentions, 99) × 10 + type index.', types: LAKE_TYPES, entities: ents.length, split: [...split].sort(), keys: keyFile });
  log(`names: ${tok.size} tokens, ${keys.length} keys, ${files.length} files, ${(files.reduce((a, f) => a + JSON.stringify(f).length, 0) / 1024).toFixed(0)} KB`);
}

/* ------------------------------------------------------------------ country profiles */
{
  const bfByIso = new Map();
  for (const w of BF.wars) for (const c of w.countries || []) { const i = iso3Of(c); if (i) (bfByIso.get(i) || bfByIso.set(i, []).get(i)).push(w); }
  const calByIso = new Map();
  for (const e of CAL_EVENTS) { const i = iso3Of(e.country); if (i) (calByIso.get(i) || calByIso.set(i, []).get(i)).push(e); }
  const index = [];
  // Volatility changes every day, so it is kept out of the 217 profiles (which then change only when their country's data
  // do) and joined at call time from one small file: every country's scores over the last 30 days, and today's details.
  const dates = VOL.global.map(g => g[0]).slice(-30);
  const scored = Object.entries(VOL.countries).filter(([, c]) => c.latest?.score != null).sort((a, b) => b[1].latest.score - a[1].latest.score).map(([k]) => k);
  putJson('integration/data/countries/volatility.json', {
    generated: STAMP, date: VOL.latest, scored: scored.length, dates,
    countries: Object.fromEntries(Object.entries(VOL.countries).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([iso3, c]) => {
      const byDate = new Map((c.days || []).map(d => [d[0], d[1]]));
      const l = c.latest || {};
      return [iso3, { score: l.score ?? null, rank: scored.indexOf(iso3) + 1 || null, components: l.components || null, events: l.events ?? null, coverage: l.coverage ?? null, reason: l.reason ?? null, days: dates.map(d => byDate.get(d) ?? null) }];
    }))
  });
  for (const c of NAT.countries) {
    const cal = (calByIso.get(c.iso3) || []).sort((a, b) => (a.date < b.date ? -1 : 1));
    const upcoming = cal.filter(e => e.date >= TODAY).slice(0, 8).map(e => ({ date: e.date, type: e.type, title: e.title, status: e.status, source: e.source }));
    const recent = cal.filter(e => e.date < TODAY).slice(-8).reverse().map(e => ({ date: e.date, type: e.type, title: e.title, source: e.source }));
    const names = [...new Set([c.name, commonName(c), ...(EXTRA_NAMES[c.iso3] || [])])];
    index.push({ iso3: c.iso3, iso2: c.iso2, name: commonName(c), names });
    const profile = {
      generated: STAMP, iso3: c.iso3, iso2: c.iso2, name: commonName(c), official_name: c.name, region: (c.region || '').trim() || null, income: c.income || null, capital: c.capital || null,
      qid: c.qid || null, encyclopaedia: c.qid ? `${BASE_URL}encyclopedia/index.html#${c.qid}` : null,
      government: c.government || [], head_of_state: c.headOfState || null, head_of_government: c.headOfGovernment || null,
      leader: c.leadership?.current || null,
      leadership: c.leadership ? { leaders_since_1926: c.leadership.leaders100 ?? null, average_tenure_years: c.leadership.avgTenure ?? null, median_tenure_years: c.leadership.medianTenure ?? null, longest: c.leadership.longest || null, irregular_exits: c.leadership.irregular ?? null, elections_since_1926: c.leadership.elections ?? null } : null,
      pestle: { overall: c.overall ?? null, coverage: c.coverage ?? null, ...Object.fromEntries(DIMS.map(d => [d, c.pressure?.[d] ?? null])), note: 'Pressure is the share of a dimension\'s scored indicators that are worsening (0 none, 1 all).' },
      indicators: NAT.indicators.filter(i => c.latest?.[i.code]).map(i => { const [year, value, , change, trend] = c.latest[i.code]; return { code: i.code, label: i.label, dimension: i.dimension, unit: i.unit, year, value: round(value, 4), change: round(change, 4), trend }; }),
      wars_this_year: (bfByIso.get(c.iso3) || []).map(w => ({ id: w.id, name: w.name, status: w.status, deaths: w.deaths, events: w.events, last_active: w.lastActive })),
      conflict_history: c.conflict ? { conflict_years_since_1946: c.conflict.conflictYears ?? null, years_at_war: c.conflict.yearsAtWar ?? null, conflicts_abroad: c.conflict.conflictsAbroad ?? null, wars_1926_1945: c.conflict.cowWars1926_45 ?? null, onsets_per_decade: c.conflict.onsetsPerDecade ?? null } : null,
      calendar: { since_1980: c.calendar || null, upcoming, recent },
      energy_share: c.energyShare ?? null,
      pages: { national: `${BASE_URL}q/national.html#compare=${c.iso3}`, volatility: `${BASE_URL}q/volatility.html`, calendar: `${BASE_URL}q/calendar.html?period=contemporary&countries=${encodeURIComponent(cal[0]?.country || commonName(c))}` },
      sources: ['National Analysis (World Bank WDI/WGI CC BY 4.0, Wikidata CC0)', 'Geopolitical Volatility (GDELT)', 'Realtime Battlefield (UCDP CC BY 4.0)', 'Realtime and Historical Calendars (Wikipedia CC BY-SA, Wikidata CC0)']
    };
    const p = `integration/data/countries/${c.iso3}.json`; putJson(p, profile); derivedFiles.add(p);
  }
  putJson('integration/data/countries/index.json', { generated: STAMP, countries: index });
}

/* ------------------------------------------------------------------ query index */
putJson('integration/data/query-index.json', {
  generated: STAMP,
  about: 'Internal to the Integration Hub: the parts the MCP server and the JSON API may read for each dataset, newest first, with rows, bytes, parse cost and the date ranges or partition values that let a query skip parts.',
  datasets: query
});

/* ------------------------------------------------------------------ ICS calendars */
{
  const opts = { stamp: CAL_GENERATED };
  put('integration/feeds/realtime-calendar.ics', toICS(CAL_EVENTS.filter(e => e.date >= RT_FROM && e.date <= RT_TO), { ...opts, name: 'PRP Realtime Calendar', description: `Political events from six months ago to eighteen months ahead (${RT_FROM} to ${RT_TO}), from PRP's Realtime Calendar.` }));
  for (const c of CAL) put(`integration/feeds/historical-calendar-${c.decade}.ics`, toICS(c.data.events, { ...opts, name: `PRP Historical Calendar · ${c.decade}`, description: `Political events of the ${c.decade} from PRP's Historical Calendar.` }));
}

/* ------------------------------------------------------------------ Claude skill */
{
  const skillDir = 'integration/skill/prp-data';
  const lines = ['# PRP datasets', '', `Generated ${TODAY} from ${BASE_URL}integration/catalog.json. Read the live catalogue for current row counts.`, ''];
  for (const m of MODULE_ORDER) {
    const list = catalogue.filter(d => d.module === m); if (!list.length) continue;
    lines.push(`## ${{ rt: 'Realtime Intelligence', rs: 'Retrospective Intelligence', oi: 'Offensive Intelligence', mm: 'Money Management', ns: 'Natural Science', ds: 'Digital Science', kino: 'Kino' }[m]}`, '');
    for (const d of list) {
      lines.push(`### ${d.id}`, '', `${d.title}. ${d.description}`, '', `- Rows: ${d.rows.toLocaleString('en-GB')} · refresh: ${d.refresh} · licence: ${d.licence}`, `- File${d.urls ? 's' : ''}: ${(d.urls || [d.url]).slice(0, 3).map(u => BASE_URL + u).join(', ')}${(d.urls || []).length > 3 ? ` (+${d.urls.length - 3} more)` : ''} (records at \`${d.records || '(root)'}\`)`,
        `- Fields: ${d.fields.map(f => `\`${f.name}\` (${f.type})`).join(', ')}`, '');
    }
  }
  put(`${skillDir}/reference/datasets.md`, lines.join('\n'));
  const skill = has(`${skillDir}/SKILL.md`) ? readFileSync(abs(`${skillDir}/SKILL.md`)) : null;
  if (skill) put('integration/skill/prp-data.zip', zip([['prp-data/SKILL.md', skill], ['prp-data/reference/datasets.md', Buffer.from(lines.join('\n'))]]));
}

// A minimal deterministic ZIP (deflate, fixed timestamps), so the skill downloads ready to upload.
function zip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const local = [], central = []; let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 2026-01-01 00:00
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), comp = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, nameBuf, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += h.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/* ------------------------------------------------------------------ guard */
// Nothing is written yet. A dataset that would lose more than half of its rows since the last catalogue (it had more than
// 20), or empty or vanish whatever its size, stops the build here, by the calendar build's rule (calendar/scripts/guard.mjs;
// --allow-drop writes anyway, for a deliberate change). The catalogue republishes whatever the modules committed and removes
// the shards it no longer makes, so this is the last check on a source that was wiped or cut short, a dataset that vanished,
// or a derive that no longer fits its source. Two kinds shrink by design, so only emptying or vanishing counts for them:
// datasets that `resets` with each new year or quarter (UCDP's year to date starts again in January, the House filings drop
// their older year, a new 13F quarter brings a new list of exits), and the briefings, which refresh several times between
// catalogue builds and whose rows the MCP server and the API read from the briefings' own files.
{
  const LIVE = new Set(['6-hourly', 'twice daily']);
  const rows = list => Object.fromEntries(list.map(d => [d.id, d.rows]));
  // A dataset taken out of SPECS is a decision, not a loss: only the ones still specified are compared.
  const was = rows((has('integration/catalog.json') ? J('integration/catalog.json').datasets : []).filter(d => SPECS.some(s => s.id === d.id))), now = rows(catalogue);
  const shrinks = new Set(SPECS.filter(s => s.resets || LIVE.has(s.refresh)).map(s => s.id));
  const steady = Object.fromEntries(Object.entries(was).filter(([id]) => !shrinks.has(id)));
  const emptied = Object.keys(was).filter(id => was[id] > 0 && !now[id]).map(id => `${id} ${was[id]} → 0`);
  refuseIfLost([...new Set([...lostCounts(steady, now), ...emptied])]);
}

/* ------------------------------------------------------------------ write */
const normalise = (p, s) => (Buffer.isBuffer(s) ? s.toString('base64') : p.endsWith('.ics') ? s.replace(/^DTSTAMP:.*\r?\n/gm, '') : s.replace(/"generated":\s*"[^"]*"/g, '"generated":""'));
let written = 0, kept = 0, removed = 0;
for (const [p, data] of out) {
  const file = abs(p);
  if (existsSync(file)) {
    const old = readFileSync(file);
    const same = Buffer.isBuffer(data) ? old.equals(data) : normalise(p, old.toString('utf8')) === normalise(p, data);
    if (same) { kept++; continue; }
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data); written++;
}
const walk = d => (existsSync(abs(d)) ? readdirSync(abs(d)).flatMap(f => { const p = `${d}/${f}`; return statSync(abs(p)).isDirectory() ? walk(p) : [p]; }) : []);
for (const d of OWNED_DIRS) for (const p of walk(d)) if (!out.has(p)) { rmSync(abs(p)); removed++; }
for (const d of OWNED_DIRS) for (const sub of walk(d).map(p => dirname(p))) void sub;
log(`\n${catalogue.length} datasets · ${out.size} files: ${written} written, ${kept} unchanged, ${removed} removed`);

if (args.includes('--calibrate')) {
  // Prints measured JSON.parse time against the cost model, to keep jsonCost honest.
  for (const p of [...new Set(Object.values(query).flatMap(q => q.parts.map(x => x.url)))]) {
    const s = readFileSync(abs(p), 'utf8'); let best = 1e9;
    for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); JSON.parse(s); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); }
    console.log(`${p.padEnd(56)} ${(s.length / 1024).toFixed(0).padStart(6)} KB  cost ${String(jsonCost(s)).padStart(8)}  parse ${best.toFixed(2)} ms  µs/cost ${(best * 1000 / jsonCost(s) * 1000).toFixed(2)}`);
  }
}
