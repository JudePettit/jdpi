// Builds an Omni-Map layer of one World Bank series by country (PRP-SCHOLAR-USP-DESIGN.md 4.2, layer 6), drawn on
// Natural Earth's countries (omni/data/base/countries.topo.json, joined by ISO 3166 alpha-3 code). S5a built population
// density (EN.POP.DNST); S5c (20 November 2026) builds every series National Analysis shows (NATIONAL below), one layer
// each, from the World Development Indicators (the API's source 2) and the Worldwide Governance Indicators (source 3).
//   node omni/scripts/build-wb.mjs --code EN.POP.DNST [--data <copy>] [--meta <copy>] [--countries <copy>]
//   node omni/scripts/build-wb.mjs --all [--meta-dir <folder of <code>.json copies>]   every series, one after another
// A series whose licence does not read CC BY 4.0 (MS.MIL.XPND.GD.ZS: "SIPRI terms and conditions") is not hosted: with
// --all it is written as a line of the catalogue's `absent` list, with the licence its metadata gives and SIPRI's terms.
// The order of steps:
// 1. Reads the series' metadata from the World Bank's API (META_URL, User-Agent "VM build check
//    (https://jdpi.pages.dev)"), or --meta, and stops unless its License_Type is CC BY 4.0: the series' own licence,
//    read at each build, decides, and the licence the World Bank's data catalogue gives CC BY 4.0 is in
//    integration/sources.json ("world-bank-wdi").
// 2. Reads the values for every economy and aggregate, 1960–2025, from DATA_URL, or --data; and the World Bank's list of
//    economies (COUNTRIES_URL), or --countries, which marks each aggregate (region "Aggregates").
// 3. Keeps each economy's value of each year as the World Bank gives it, and null where it gives none; the aggregates
//    (regions, income groups, the world) are listed by code and name and hold no values, since the map draws countries.
// 4. Lists the economies that hold a value but that neither a country of the countries base nor one of its small-state
//    points holds (omni/data/base/countries.topo.json and small-states.json, by ISO3: build-countries.mjs runs first):
//    they are not drawn, and the page lists them beside the map ("VM cannot place these on a free border").
// 5. Writes omni/data/layers/wb/<code>.json (vm-series/1: the years from the first to the last that hold a value, and
//    each economy's values in year order) and the layer's entry in omni/data/layers.json. The file keeps its `built` when
//    nothing in it changes (the World Bank's lastupdated date is in it, so a new release writes new bytes).
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, putAbsent, dropAbsent, dropLayer, keepBuilt, measure, readJson, arg, stamp, UA, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/wb');
const LAYERS = join(ROOT, 'omni/data/layers.json');
// The API's source of a series: the Worldwide Governance Indicators (GOV_WGI_*) are source 3, the rest source 2 (WDI).
export const sourceOf = code => (/^GOV_WGI_/.test(code) ? 3 : 2);
export const META_URL = code => `https://api.worldbank.org/v2/sources/${sourceOf(code)}/series/${code}/metadata?format=json`;
export const DATA_URL = code => `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=1960:2025${sourceOf(code) === 3 ? '&source=3' : ''}`;
// The series National Analysis shows (national/data/years/wb, 41 files on 20 November 2026), each a layer of its own.
export const NATIONAL = ['AG.LND.FRST.ZS', 'BN.CAB.XOKA.GD.ZS', 'BX.KLT.DINV.WD.GD.ZS', 'EG.ELC.ACCS.ZS', 'EG.FEC.RNEW.ZS', 'EG.USE.PCAP.KG.OE',
  'EN.ATM.PM25.MC.M3', 'EN.GHG.CO2.PC.CE.AR5', 'ER.H2O.FWST.ZS', 'FP.CPI.TOTL.ZG', 'GB.XPD.RSDV.GD.ZS', 'GC.DOD.TOTL.GD.ZS', 'GOV_WGI_CC.EST',
  'GOV_WGI_GE.EST', 'GOV_WGI_PV.EST', 'GOV_WGI_RL.EST', 'GOV_WGI_RQ.EST', 'GOV_WGI_VA.EST', 'IP.PAT.RESD', 'IT.CEL.SETS.P2', 'IT.NET.USER.ZS',
  'MS.MIL.XPND.GD.ZS', 'NE.TRD.GNFS.ZS', 'NY.GDP.MKTP.CD', 'NY.GDP.MKTP.KD.ZG', 'NY.GDP.PCAP.KD', 'SE.SEC.ENRR', 'SE.TER.ENRR', 'SH.XPD.CHEX.GD.ZS',
  'SI.POV.DDAY', 'SI.POV.GINI', 'SL.UEM.TOTL.ZS', 'SP.DYN.IMRT.IN', 'SP.DYN.LE00.IN', 'SP.DYN.TFRT.IN', 'SP.POP.GROW', 'SP.POP.TOTL',
  'SP.URB.TOTL.IN.ZS', 'TX.VAL.TECH.MF.ZS', 'VC.IHR.PSRC.P5'];
// A series' layer id: its code in the recipe's id form (wb-sp-pop-totl), since an id holds no capitals or dots; the
// recipe names it fill=wb:SP.POP.TOTL, the design's own form (omni/lib/layers.js maps one to the other).
export const idOf = code => SERIES[code]?.id || `wb-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
// The terms of a series VM does not host, read at their owner's own address (the line on the page quotes them).
export const BARRED = {
  'MS.MIL.XPND.GD.ZS': { title: 'Military expenditure (% of GDP), by country', termsUrl: 'https://www.sipri.org/about/terms-and-conditions', read: '2026-11-18',
    seen: '“Use of SIPRI copyrighted material for commercial purposes must be authorized and will normally require the payment of a reasonable royalty.” (SIPRI’s terms and conditions); the World Bank’s metadata for the series gives its licence as “SIPRI terms and conditions”',
    why: 'the World Bank takes this series from the Stockholm International Peace Research Institute (SIPRI), whose terms bar commercial use without its authorisation and a royalty, so it is not free data; military spending as a share of GDP cannot be drawn until a series under an open licence (CC BY or similar) exists' },
  // D1 (S5b/S5c review, 20 November 2026): three series whose own metadata reads CC BY 4.0 but whose originator, the
  // International Energy Agency, keeps its datasets outside CC BY 4.0. The originator's own terms decide (MP-11), so
  // VM hosts none of their values, whatever the World Bank's label says. `originator: true` bars a series even when its
  // licence reads CC BY 4.0.
  ...Object.fromEntries([
    ['EG.USE.PCAP.KG.OE', 'Energy use (kg of oil equivalent per capita), by country', 'energy use per person'],
    ['EG.FEC.RNEW.ZS', 'Renewable energy consumption (% of total final energy consumption), by country', 'the renewable share of final energy'],
    ['EN.GHG.CO2.PC.CE.AR5', 'Carbon dioxide (CO2) emissions excluding LULUCF per capita, by country', 'carbon dioxide emissions per person'],
  ].map(([code, title, what]) => [code, { title, originator: true, termsUrl: 'https://www.iea.org/terms', read: '2026-11-20',
    seen: `the World Bank’s metadata for the series gives “CC BY-4.0” and names the International Energy Agency (IEA) among its sources${code === 'EN.GHG.CO2.PC.CE.AR5' ? ' (beside the European Commission’s EDGAR)' : ''}; the IEA’s terms (https://www.iea.org/terms, read 20 November 2026) list “Standalone datasets, data explorers and databases” as content not made available under CC BY 4.0, and its terms for that material (https://www.iea.org/terms/terms-of-use-for-non-cc-material) bar “making more than 5 (five) raw data points from the Non-CC Material, whether or not aggregated, accessible for download” and allow public use only when it is “neither primarily intended for, or directed towards, commercial advantage or revenue generation”`,
    why: `the World Bank takes this series in part from the International Energy Agency, whose own terms keep its datasets outside CC BY 4.0, bar offering more than five of its data points for download and limit their use to non-commercial ends, so it is not free data; ${what} cannot be drawn until a series under an open licence exists (for energy, an energy balance published under CC BY or similar${code === 'EN.GHG.CO2.PC.CE.AR5' ? '; for carbon dioxide, EDGAR’s own CC BY 4.0 release read and joined by VM without the IEA’s part' : ''})` }])),
};
export const COUNTRIES_URL = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
// The series VM draws, each with its layer's own words (the method and legend are VM's; the definition is the World Bank's).
export const SERIES = {
  'EN.POP.DNST': {
    id: 'density-country', title: 'Population density (by country)', measure: 'people per km² of land area',
    legend: 'Population density: World Bank, World Development Indicators, EN.POP.DNST (CC BY 4.0), on Natural Earth’s countries of today',
    // Its land area is FAO’s (the series’ Source names FAO); FAO’s own terms, read at FAO’s own address, decide that input.
    inputs: 'One of its inputs is FAO’s land area (the series’ own sources name FAO). FAO’s terms for its statistical databases (https://www.fao.org/contact-us/terms/db-terms-of-use/en/, read 20 November 2026) license its datasets under CC BY 4.0 “unless specified otherwise in their metadata or webpage”, allow them to be adapted and re-disseminated, and add that they are not to be used to promote a commercial enterprise or to suggest that FAO endorses one; VM uses them for neither. The land-use domain’s own metadata could not be read: FAOSTAT’s interface asks for authorisation, which VM does not have. VM treats every series resting on FAO’s land area alike, on FAO’s own terms.',
  },
};

/** Step 1: the series' licence and words from its metadata: { name, licence, licenceUrl, unit, source, definition, period }. */
export function seriesMeta(meta) {
  const v = meta?.source?.[0]?.concept?.[0]?.variable?.[0];
  const m = Object.fromEntries((v?.metatype || []).map(x => [x.id, x.value]));
  return { code: v?.id, name: m.IndicatorName, licence: m.License_Type, licenceUrl: m.License_URL, unit: m.Unitofmeasure, source: m.Source, definition: m.Longdefinition, period: m.Referenceperiod };
}
export const isCcBy = l => /^CC[ -]BY[ -]4\.0$/i.test(String(l || '').trim());

/** Step 3: the file's body from the API's rows and the list of economies. */
export function series(rows, economies) {
  const agg = new Map(economies.filter(e => e.region?.value === 'Aggregates').map(e => [e.id, e.name]));
  const byCode = new Map();
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) {
    const code = r.countryiso3code, y = +r.date;
    if (!/^[A-Z]{3}$/.test(code || '') || agg.has(code)) continue;
    if (!byCode.has(code)) byCode.set(code, { name: r.country.value, at: new Map() });
    if (r.value != null) { byCode.get(code).at.set(y, r.value); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  }
  const years = []; for (let y = lo; y <= hi; y++) years.push(y);
  const values = {}, names = {};
  for (const code of [...byCode.keys()].sort()) {
    const c = byCode.get(code);
    if (!c.at.size) continue;
    values[code] = years.map(y => (c.at.has(y) ? c.at.get(y) : null));
    names[code] = c.name;
  }
  const aggregates = Object.fromEntries([...agg].filter(([code]) => rows.some(r => r.countryiso3code === code)).sort());
  return { years, values, names, aggregates };
}
/** Step 4: the economies with a value that no country or small-state point of the base holds, by ISO3: { code: name }. */
export function unplaced(s, topo, small) {
  const have = new Set([...Object.values(topo.objects).flatMap(o => o.geometries.map(g => g.properties?.iso3)), ...small.points.map(p => p.iso3)].filter(Boolean));
  return Object.fromEntries(Object.keys(s.values).filter(c => !have.has(c)).sort().map(c => [c, s.names[c]]));
}

/** The classes of a series VM gives no classes of its own (S5c): cut at the sevenths of every value it holds, every
    economy and year together, each rounded to two significant figures, so the same class means the same values in every
    year; equal cuts are merged. Returns the rising breaks. */
export const CUTS = 7;
export function breaksOf(s) {
  const all = Object.values(s.values).flat().filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!all.length) return [0];
  const out = [];
  for (let k = 1; k < CUTS; k++) {
    const v = Number(all[Math.min(all.length - 1, Math.floor((k * all.length) / CUTS))].toPrecision(2));
    if (!out.length || v > out.at(-1)) out.push(v);
  }
  return out;
}
const fmtCut = n => (Math.abs(n) >= 1000 ? n.toLocaleString('en-GB') : String(n));

async function json(url, file) {
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// V6 (S5b/S5c review): the unit a series' classes are labelled with. The metadata's Unitofmeasure is not used: it can
// be a placeholder ("Unit" for SP.POP.TOTL) or contradict the name ("% of GDP" for high-technology exports, which are
// a share of manufactured exports). The unit is the last bracket of the series' name that states a unit (not
// "(modeled ILO estimate)" or "(2021 PPP)"), else VM's checked word for the series (UNITS).
export const UNITS = { 'SP.POP.TOTL': 'people', 'IP.PAT.RESD': 'applications', 'SI.POV.GINI': 'index, 0 to 100', 'ER.H2O.FWST.ZS': '% of the freshwater available' };
export function unitOf(code, name) {
  if (UNITS[code]) return UNITS[code];
  const all = [...String(name || '').matchAll(/\(([^()]+)\)/g)].map(m => m[1]).filter(b => !/estimate\b|^\d{4} PPP$/i.test(b) || /approx/.test(b));
  return all.at(-1) || null;
}
// The words of a series that SERIES gives none for (S5c): its name as the World Bank gives it, its classes from its data.
function specOf(code, meta, s) {
  if (SERIES[code]) return SERIES[code];
  const wgi = sourceOf(code) === 3, breaks = breaksOf(s);
  const unit = unitOf(code, meta.name);
  if (!unit) throw new Error(`${code}: its name "${meta.name}" states no unit and UNITS gives none`);
  const named = unit === unitOf(null, meta.name);
  return {
    id: idOf(code), title: meta.name, breaks, group: 'wb',
    measure: named ? meta.name : /\([^()]+\)\s*$/.test(meta.name) ? meta.name.replace(/\([^()]+\)\s*$/, `(${unit})`) : `${meta.name} (${unit})`,
    unit,
    set: wgi ? 'Worldwide Governance Indicators' : 'World Development Indicators',
    source: wgi ? 'world-bank-wgi' : 'world-bank-wdi',
    status: wgi ? 'estimated: a model’s estimate, with a margin of error the World Bank publishes beside it' : 'as the World Bank and the sources it names estimate it',
    legend: `${meta.name}: World Bank, ${wgi ? 'Worldwide Governance Indicators' : 'World Development Indicators'}, ${code} (${meta.licence === 'CC BY-4.0' ? 'CC BY 4.0' : meta.licence}), on Natural Earth’s countries of today`,
    classes: `The classes are VM’s: cut at the sevenths of every value the series holds (every economy and year together), each rounded to two significant figures (${breaks.map(fmtCut).join(', ')}), the same for every year.`,
  };
}

async function buildOne(code, { metaFile = null, dataFile = null, countriesFile = null } = {}) {
  const meta = seriesMeta(await json(META_URL(code), metaFile));
  if (!isCcBy(meta.licence) || BARRED[code]?.originator) {
    const b = BARRED[code];
    if (!b) throw new Error(`${code}: its licence reads "${meta.licence}", not CC BY 4.0; VM does not host it, and BARRED gives no words for its line`);
    putAbsent(LAYERS, { id: idOf(code), title: b.title, geometry: 'polygon', group: 'wb', wb: code, why: b.why, seen: b.seen, url: META_URL(code), termsUrl: b.termsUrl, read: b.read, licence: meta.licence, source: 'world-bank-wdi' });
    // A series built before its originator's terms were read is taken off: its layer entry and its file of values.
    dropLayer(LAYERS, idOf(code));
    const old = join(OUT, `${code}.json`);
    if (existsSync(old)) unlinkSync(old);
    console.log(`${code}: ${b.originator ? 'its originator’s terms bar it' : `its licence reads "${meta.licence}"`}: not hosted; a line in the catalogue's absent list says why`);
    return;
  }
  dropAbsent(LAYERS, idOf(code));
  const data = await json(DATA_URL(code), dataFile);
  const economies = (await json(COUNTRIES_URL, countriesFile))[1];
  const s = series(data[1], economies), now = stamp();
  const spec = specOf(code, meta, s);
  const base = joinPath(ROOT, 'omni/data/base');
  const away = unplaced(s, JSON.parse(readFileSync(joinPath(base, 'countries.topo.json'), 'utf8')), JSON.parse(readFileSync(joinPath(base, 'small-states.json'), 'utf8')));
  const doc = { format: 'vm-series/1', layer: spec.id, source: spec.source || 'world-bank-wdi', indicator: code, name: meta.name, unit: meta.unit, licence: meta.licence,
    licenceUrl: meta.licenceUrl, lastupdated: data[0].lastupdated, url: DATA_URL(code), built: null, years: s.years, join: 'iso3', values: s.values, names: s.names,
    aggregates: s.aggregates, unplaced: away };
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${code}.json`);
  doc.built = keepBuilt(readJson(file), doc, now);
  const text = JSON.stringify(doc) + '\n', m = measure(text);
  if (m.gzip > LIMIT_GZ) throw new Error(`${code}.json is over the limit`);
  writeFileSync(file, text);
  console.log(`${code}.json: ${Object.keys(s.values).length} economies, ${s.years[0]}–${s.years.at(-1)}, ${Object.keys(s.aggregates).length} aggregates left out; not placed: ${Object.keys(away).join(' ') || 'none'}; ${m.bytes} bytes, ${m.gzip} gzipped`);
  const breaks = spec.breaks || [10, 25, 50, 100, 200, 500];
  const classWords = spec.classes || 'The classes are VM’s choice (10, 25, 50, 100, 200 and 500 people per km²), the same for every year.';
  putLayer(LAYERS, {
    id: spec.id, module: 'omni-map', title: spec.title, role: 'fill', geometry: 'polygon', wb: code, ...(spec.group ? { group: spec.group } : {}),
    time: { field: 'year', from: s.years[0], to: s.years.at(-1), step: 'y', precision: 'year' },
    data: `omni/data/layers/wb/${code}.json`, on: 'countries', space: 'by country, drawn on today’s borders (Natural Earth v5.1.1, 2022)', measure: spec.measure, status: spec.status || 'as the World Bank estimates it',
    style: { kind: 'classes', breaks, unit: spec.unit || spec.measure, scheme: 'sequential', ...(spec.group ? { cut: `sevenths of every value, rounded to two significant figures` } : {}) },
    legend: spec.legend, source: spec.source || 'world-bank-wdi',
    method: `VM’s own text, quoting the World Bank. The World Bank’s ${meta.name} (${code}), from its ${spec.set || 'World Development Indicators'}, every economy and year it gives (${s.years[0]}–${s.years.at(-1)}), as last updated by the World Bank on ${doc.lastupdated}; licence, as the series’ own metadata gives it at each build: ${meta.licence}. ${meta.definition ? `Its definition, in the World Bank’s words: “${meta.definition}”${' '}` : ''}${meta.source ? `Its sources, as it names them: ${meta.source.replace(/\s*\n\s*/g, ' ')}.` : 'The World Bank names no sources for it in its metadata.'} VM draws each economy’s value on Natural Earth’s countries of today (v5.1.1, 2022), joined by ISO 3166 alpha-3 code, so a value of 1961 is drawn on today’s borders, not on those of 1961; a small state the 1:110 million map leaves out is a point. ${spec.inputs ? spec.inputs + ' ' : ''}The ${Object.keys(s.aggregates).length} aggregates the World Bank also gives (regions, income groups, the world) are not drawn, and are listed under the map’s key. ${Object.keys(away).length ? `The ${Object.keys(away).length === 1 ? 'economy' : 'economies'} ${Object.values(away).join(' and ')} ${Object.keys(away).length === 1 ? 'has' : 'have'} a value but no shape or point on Natural Earth’s countries, so VM cannot place ${Object.keys(away).length === 1 ? 'it' : 'them'} on a free border; the key lists ${Object.keys(away).length === 1 ? 'it' : 'them'}.` : ''} ${classWords} A year with no value for an economy leaves it blank (omni/scripts/build-wb.mjs).`.replace(/\.\.(?=\s|$)/g, '.').replace(/ {2,}/g, ' '),
    open: true, pinnable: true, built: doc.built, unplaced: away,
    files: [{ file: `omni/data/layers/wb/${code}.json`, ...m }],
  });
}

async function main() {
  if (process.argv.includes('--all')) {
    const dir = arg('--meta-dir');
    for (const code of ['EN.POP.DNST', ...NATIONAL]) {
      await buildOne(code, { metaFile: dir ? joinPath(dir, `${code}.json`) : null });
      await new Promise(r => setTimeout(r, 500)); // politely, one series after another
    }
    return;
  }
  const code = arg('--code');
  if (!code || !(SERIES[code] || NATIONAL.includes(code))) throw new Error(`--code must be one of ${[...Object.keys(SERIES), ...NATIONAL].join(', ')}, or use --all`);
  await buildOne(code, { metaFile: arg('--meta'), dataFile: arg('--data'), countriesFile: arg('--countries') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
