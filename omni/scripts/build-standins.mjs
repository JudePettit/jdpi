#!/usr/bin/env node
// Stand-ins for four World Bank series VM leaves out (build C, 21 November 2026): the same subject from a different
// producer whose own terms are free, shown BESIDE the World Bank's series (its absent line in the Omni-Map, its row and
// originator line in National Analysis), never in its place. A stand-in is that producer's figure, named as theirs, with
// one plain line on how it differs from the World Bank's (method, units, years). It never takes the World Bank's id or
// code: a saved view with fill=wb:<code> opens as before.
//
//   CO2 per person   Global Carbon Project, fossil CO2 emissions (Zenodo, CC BY 4.0), its per-capita file, by ISO3
//   PM2.5 exposure   SatPM V5.GL.06, Washington University in St. Louis (CC BY 4.0), population-weighted, by name
//   Energy per person US Energy Information Administration, International Energy Data (public domain), by ISO3
//   Military spending Global Military Spending Dataset v9 (Harvard Dataverse, CC0 1.0), share of GDP, by state number;
//                    its series ends in 2019, and every line that shows it says so
//
// Still left out, with no stand-in (the free series found cover Europe only): the renewable share of final energy,
// Internet users and mobile subscriptions (STILL_LEFT_OUT).
//
// Terms, each read at its own address on 21 November 2026 (integration/sources.json holds the words and the addresses):
//   GCP     https://zenodo.org/records/23667912: licence "cc-by-4.0"; the file's metadata: "Licensed under Creative Commons
//           Attribution 4.0 International"
//   SatPM   https://www.satpm.org/v5-gl-06: "SatPM2.5 data V5.GL.06 are licensed under CC BY 4.0"
//   EIA     https://www.eia.gov/about/copyrights_reuse.php: "U.S. government publications are in the public domain and
//           are not subject to copyright protection."
//   GMSD    https://doi.org/10.7910/DVN/DHMZOW: licence "CC0 1.0"
//
// Inputs (no key, no sign-in; each is the producer's own public address):
//   GCP     https://zenodo.org/api/records/5569234/versions/latest (the dataset's newest version), then its file
//           *_percapita_flat.csv; the file's md5 is checked against the record's
//   SatPM   https://satpmdata.s3.amazonaws.com/V5GL06/RegionSummaries/GlobalPM25-V5GL06-Annual-1998-2024-wThresFrac.csv
//           (the address the V5.GL.06 page links; a new version has a new address and needs a change here)
//   EIA     https://www.eia.gov/opendata/bulk/INTL.zip (the bulk file the EIA's manifest names), its INTL.txt
//   GMSD    https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/DHMZOW (the newest
//           released version), then its file estimates_milburden_*, as originally deposited; its md5 is checked
//   VM      omni/data/base (Natural Earth's countries and small states), omni/scripts/country-names.mjs (names to ISO3),
//           national/data/index.json (each country's ISO3 and Gleditsch and Ward number, for GMSD)
//   Options: --gcp-file, --gcp-record (the Zenodo record's JSON), --satpm-file, --eia-file (the zip or its INTL.txt),
//   --gmsd-file, --gmsd-record (the Dataverse JSON) read copies already downloaded (into a scratch folder, never the
//   repository) in place of fetching; --dry builds and prints, writing nothing.
//
// Order of steps:
//   1. Fetch (or read) each producer's file and record its version, date, size and sha256; check its licence where the
//      record states one (Zenodo's licence id, Dataverse's licence name, the EIA's copyright field).
//   2. Parse each into values by ISO3 and year: GCP and the EIA by their own ISO3 codes (SAME_CODE gives VM's code
//      where a producer uses another, Kosovo); SatPM by name, through Natural Earth's names and VM's crosswalk
//      (country-names.mjs), then SATPM_NAMES, VM's table for SatPM's own spellings; GMSD by state number, through
//      National Analysis's numbers (index.json "gw") and GW_JOIN. A name or number that joins to nothing must be listed
//      in SATPM_LEFT or GMSD_LEFT with its reason, or the build stops: nothing is dropped unseen and no name is guessed.
//      The EIA's 0 is read as no value (VM's own step; its file gives 0 where it has no figure), and a code whose every
//      value is 0 is listed in the file's zeroOnly, not drawn.
//   3. Check each: enough countries, every key an ISO3, units and columns as expected, values in range.
//   4. Build every file in memory and measure it (each under 1.5 MB gzipped).
//   5. Only then write omni/data/layers/standin/<id>.json, each layer's entry in omni/data/layers.json (and its head),
//      and national/data/standins.json (each series' latest value for each of National Analysis's countries). If any
//      step fails, nothing is written and the last good files stay.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, keepBuilt, measure, readJson, arg, stamp, UA, LIMIT_GZ } from './layer-catalogue.mjs';
import { breaksOf, unplaced } from './build-wb.mjs';
import { isoResolver, neCountries } from './country-names.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const OUT = 'omni/data/layers/standin';
export const NATIONAL_FILE = 'national/data/standins.json';

export const URLS = {
  gcpLatest: 'https://zenodo.org/api/records/5569234/versions/latest',
  satpm: 'https://satpmdata.s3.amazonaws.com/V5GL06/RegionSummaries/GlobalPM25-V5GL06-Annual-1998-2024-wThresFrac.csv',
  satpmPage: 'https://www.satpm.org/v5-gl-06',
  eia: 'https://www.eia.gov/opendata/bulk/INTL.zip',
  gmsdRecord: 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/DHMZOW',
  gmsdFile: id => `https://dataverse.harvard.edu/api/access/datafile/${id}?format=original`,
};

/** The four stand-ins. `line` is VM's own text on how each differs from the World Bank's series (from, to: its years). */
export const STANDINS = [
  {
    id: 'standin-co2-gcp', source: 'gcp-fossil-co2', standsFor: 'EN.GHG.CO2.PC.CE.AR5', producer: 'Global Carbon Project',
    title: 'Fossil CO₂ per person (Global Carbon Project), by country', label: 'Fossil CO₂ per person (Global Carbon Project)',
    unit: 't CO₂ per person', measure: 'Fossil CO₂ emissions per person (tonnes of CO₂)', status: 'as the Global Carbon Project estimates it',
    line: (from, to) => `The Global Carbon Project’s figure, not the World Bank’s: fossil CO₂ alone (coal, oil, gas, cement, flaring and other carbonates), in tonnes of CO₂ per person, ${from}–${to}. The World Bank’s series is CO₂ excluding land use, in tonnes of CO₂ equivalent, from EDGAR and the IEA, so the two differ.`,
  },
  {
    id: 'standin-pm25-satpm', source: 'satpm-v5gl06', standsFor: 'EN.ATM.PM25.MC.M3', producer: 'SatPM, Washington University in St. Louis',
    title: 'PM2.5 exposure, population-weighted (SatPM), by country', label: 'PM2.5 exposure (SatPM)',
    unit: 'µg/m³', measure: 'Population-weighted mean PM2.5 (micrograms per cubic metre)', status: 'estimated: a model’s estimate from satellites, a chemical transport model and ground monitors',
    line: (from, to) => `SatPM’s figure, not the World Bank’s: fine particulate matter estimated from satellite readings, the GEOS-Chem model and ground monitors, averaged over each country’s people, in µg/m³, ${from}–${to}. The World Bank’s series is IHME’s Global Burden of Disease estimate, another model, so the two differ.`,
  },
  {
    id: 'standin-energy-eia', source: 'eia-intl', standsFor: 'EG.USE.PCAP.KG.OE', producer: 'US Energy Information Administration',
    title: 'Energy consumption per person (US EIA), by country', label: 'Energy consumption per person (US EIA)',
    unit: 'million Btu per person', measure: 'Total energy consumption per person (million Btu)', status: 'as the US Energy Information Administration estimates it',
    line: (from, to) => `The US Energy Information Administration’s figure, not the World Bank’s: total energy consumption per person in million Btu, not kilograms of oil equivalent, ${from}–${to}. The EIA’s file gives 0 for some places and years; VM reads the EIA’s 0 as no value and leaves it blank. The World Bank’s series comes in part from the IEA, another agency counting in another unit, so the two cannot be read one for one.`,
  },
  {
    id: 'standin-milex-gmsd', source: 'gmsd-v9', standsFor: 'MS.MIL.XPND.GD.ZS', producer: 'Global Military Spending Dataset (GMSD)',
    title: 'Military spending, % of GDP (GMSD, to 2019), by country', label: 'Military spending, % of GDP (GMSD)',
    unit: '% of GDP', measure: 'Military spending as a share of GDP (%)', status: 'estimated: GMSD’s estimate, with the standard deviation and range it publishes beside it',
    line: (from, to) => `The Global Military Spending Dataset’s figure, not the World Bank’s: its authors’ estimate of military spending as a share of GDP, ${from}–${to}; it ends in ${to}. GMSD gives a fraction, which VM multiplies by 100. The World Bank’s series is SIPRI’s.`,
  },
];

/** The three series still left out, with no stand-in. VM's own text. */
export const STILL_LEFT_OUT = [
  { code: 'EG.FEC.RNEW.ZS', label: 'the renewable share of final energy' },
  { code: 'IT.NET.USER.ZS', label: 'Internet users' },
  { code: 'IT.CEL.SETS.P2', label: 'mobile subscriptions' },
];
export const STILL_WHY = 'no free series has been found to stand in for it: the free series VM found cover Europe only';

// A producer's own code where Natural Earth and the World Bank use another (Kosovo has no ISO 3166 code of its own).
export const SAME_CODE = { gcp: { KSV: 'XKX' }, eia: { XKS: 'XKX' } };
// SatPM's spellings that Natural Earth's names and VM's crosswalk do not hold: SatPM's name → ISO3, each code one of
// Natural Earth's own (tests/standins.test.mjs checks). VM's own work, chosen by hand.
export const SATPM_NAMES = {
  Aland: 'ALA', 'Saint-Barthélemy': 'BLM', 'Cook Islands': 'COK', 'Democratic Republic of the Congo': 'COD', 'Republic of Congo': 'COG',
  'Czech Republic': 'CZE', 'Falkland Islands': 'FLK', 'Faroe Islands': 'FRO', 'Saint-Martin': 'MAF', Macedonia: 'MKD',
  'Northern Mariana Islands': 'MNP', 'Pitcairn Islands': 'PCN', Palestina: 'PSE', 'French Polynesia': 'PYF',
  'Saint Pierre and Miquelon': 'SPM', Swaziland: 'SWZ', 'Turks and Caicos Islands': 'TCA', 'British Virgin Islands': 'VGB',
  'Virgin Islands; U.S.': 'VIR', 'Wallis and Futuna': 'WLF',
};
// SatPM's regions VM does not draw: none has a shape or point with an ISO3 on Natural Earth's countries of today.
export const SATPM_LEFT = {
  'Akrotiri and Dhekelia': 'no shape of its own on Natural Earth’s countries', 'Caspian Sea': 'a sea, not a country',
  'Northern Cyprus': 'Natural Earth gives it no ISO3', 'Paracel Islands': 'no shape of its own on Natural Earth’s countries',
  'Bonaire; Sint Eustatius and Saba': 'no shape of its own on Natural Earth’s countries', 'Christmas Island': 'no shape of its own on Natural Earth’s countries',
  'Cocos Islands': 'no shape of its own on Natural Earth’s countries', Gibraltar: 'no shape of its own on Natural Earth’s countries',
  Guadeloupe: 'drawn by Natural Earth as part of France', 'French Guiana': 'drawn by Natural Earth as part of France',
  Martinique: 'drawn by Natural Earth as part of France', Mayotte: 'drawn by Natural Earth as part of France',
  Reunion: 'drawn by Natural Earth as part of France', Tokelau: 'no shape of its own on Natural Earth’s countries',
};
// GMSD's state numbers that National Analysis's table does not give, or gives for another code: number → ISO3. Each is
// the Gleditsch and Ward number of a state of today whose values in GMSD's file run in the years VM shows.
export const GW_JOIN = { 340: 'SRB', 713: 'TWN', 816: 'VNM' };
// GMSD's numbers VM does not draw, in the years it shows.
export const GMSD_LEFT = {
  345: 'Gleditsch and Ward’s number for Yugoslavia, then Serbia and Montenegro; GMSD’s values for it end in 2005, and it is not one of today’s countries',
};
// GMSD's years VM shows: from 1993, the first year in which every state number stands for a state of today (after the
// Soviet Union, Czechoslovakia and Yugoslavia broke up), so no value of a state that no longer exists is drawn on
// today's borders.
export const GMSD_FROM = 1993;
// Bounds that catch a unit gone wrong (a fraction for a percentage, kilotonnes for tonnes), not a producer's own outlier:
// a small territory's figure per person can be far above any country's (Sint Maarten's fossil CO2 in GCP's file).
const RANGE = { 'standin-co2-gcp': [0, 5000], 'standin-pm25-satpm': [0, 500], 'standin-energy-eia': [0, 10000], 'standin-milex-gmsd': [0, 100] };
const MIN_COUNTRIES = 140;

const sha = b => createHash('sha256').update(b).digest('hex');
const md5 = b => createHash('md5').update(b).digest('hex');
async function get(url, what) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`${what}: ${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const pause = () => new Promise(r => setTimeout(r, 1000)); // politely, one request after another
const fileInfo = (buf, url, at = stamp()) => ({ url, bytes: buf.length, sha256: sha(buf), read: at });

/** One CSV line into fields (quoted fields may hold commas). */
export function csvLine(line, sep = ',') {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const rowsOf = (text, sep) => { const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()); const head = csvLine(lines[0], sep).map(h => h.trim()); return { head, rows: lines.slice(1).map(l => csvLine(l, sep)) }; };
const num = v => { const s = String(v ?? '').trim(); if (!s || s === 'NA') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

/** The one file named `name` from a zip held in memory (stored or deflated). */
export function unzipOne(zip, name) {
  let e = zip.length - 22;
  while (e >= 0 && zip.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  let p = zip.readUInt32LE(e + 16);
  const n = zip.readUInt16LE(e + 10);
  for (let k = 0; k < n; k++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory');
    const method = zip.readUInt16LE(p + 10), size = zip.readUInt32LE(p + 20), nl = zip.readUInt16LE(p + 28), xl = zip.readUInt16LE(p + 30), cl = zip.readUInt16LE(p + 32), off = zip.readUInt32LE(p + 42);
    const fname = zip.toString('utf8', p + 46, p + 46 + nl);
    if (fname === name) {
      const lnl = zip.readUInt16LE(off + 26), lxl = zip.readUInt16LE(off + 28), start = off + 30 + lnl + lxl;
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip: ${name} uses method ${method}`);
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error(`zip: no ${name} in it`);
}

/** Years from the first to the last with a value, and values by code, from Map(code → Map(year → value)). */
function seriesOf(byCode, names) {
  let lo = Infinity, hi = -Infinity;
  for (const at of byCode.values()) for (const [y, v] of at) if (v != null) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const years = []; for (let y = lo; y <= hi; y++) years.push(y);
  const values = {}, nm = {};
  for (const code of [...byCode.keys()].sort()) {
    const at = byCode.get(code);
    if (![...at.values()].some(v => v != null)) continue;
    values[code] = years.map(y => (at.has(y) ? at.get(y) : null));
    nm[code] = names.get(code) || code;
  }
  return { years, values, names: nm };
}
const put = (byCode, code, y, v) => { if (!byCode.has(code)) byCode.set(code, new Map()); if (v != null) byCode.get(code).set(y, v); };

/* ---------------------------------------------------------------- the four parsers (pure: text in, series out) */
/** GCP's per-capita file: Country, ISO 3166-1 alpha-3, UN M49, Year, Total, Coal, Oil, Gas, Cement, Flaring, Other. In
    this file every column is per person (its metadata: "tonnes of CO2 per capita"); "Total" is the sum of the sources. */
export function parseGcp(text) {
  const { head, rows } = rowsOf(text);
  const ci = head.indexOf('ISO 3166-1 alpha-3'), ni = head.indexOf('Country'), yi = head.indexOf('Year'), vi = head.indexOf('Total');
  if ([ci, ni, yi, vi].includes(-1)) throw new Error(`GCP: unexpected columns ${head.join(', ')}`);
  const byCode = new Map(), names = new Map(), aggregates = {};
  for (const r of rows) {
    const raw = r[ci].trim(), name = r[ni].trim(), y = +r[yi];
    if (!/^[A-Z]{3}$/.test(raw)) { aggregates[raw || name] = name; continue; }
    if (raw === 'WLD') { aggregates.WLD = name; continue; }
    const code = SAME_CODE.gcp[raw] || raw;
    names.set(code, name); put(byCode, code, y, num(r[vi]));
  }
  return { ...seriesOf(byCode, names), aggregates };
}

/** SatPM's country summary: Region, Year, Population-Weighted PM2.5 [ug/m3], … Joined by name. */
export function parseSatpm(text, resolveName) {
  const { head, rows } = rowsOf(text);
  const ri = head.indexOf('Region'), yi = head.indexOf('Year'), vi = head.indexOf('Population-Weighted PM2.5 [ug/m3]');
  if ([ri, yi, vi].includes(-1)) throw new Error(`SatPM: unexpected columns ${head.join(', ')}`);
  const byCode = new Map(), names = new Map(), joined = {}, left = {}, unknown = new Set();
  for (const r of rows) {
    const name = r[ri].trim(), y = +r[yi];
    const code = resolveName(name) || SATPM_NAMES[name] || null;
    if (!code) { if (SATPM_LEFT[name]) left[name] = name; else unknown.add(name); continue; }
    if (joined[name] && joined[name] !== code) throw new Error(`SatPM: ${name} joins to two codes`);
    if (names.has(code) && names.get(code) !== name) throw new Error(`SatPM: ${names.get(code)} and ${name} both join to ${code}`);
    joined[name] = code; names.set(code, name); put(byCode, code, y, num(r[vi]));
  }
  if (unknown.size) throw new Error(`SatPM: names that join to nothing and are not in SATPM_LEFT: ${[...unknown].join(' | ')}`);
  return { ...seriesOf(byCode, names), aggregates: left, joined, regions: Object.keys(joined).length + Object.keys(left).length };
}

/** The EIA's INTL.txt (a JSON object a line): series INTL.47-33-<code>-MBTUPP.A, energy consumption per person.
    VM's own step: a 0 in this series is read as no value (the file gives 0 for Gibraltar, the Faroe Islands and Wake
    Island in every year 1980–2024, and for Hungary in 1980–1990), so it is never drawn or shown as a figure; a code
    whose every value is 0 is not drawn and is listed in zeroOnly, never dropped unseen. */
export function parseEia(text) {
  const byCode = new Map(), names = new Map(), aggregates = {}, zeroOnly = {};
  let updated = null;
  const units = new Set(), copyright = new Set();
  for (const line of text.split('\n')) {
    if (!line.includes('-MBTUPP.A"')) continue;
    const o = JSON.parse(line), m = /^INTL\.47-33-([A-Z0-9]+)-MBTUPP\.A$/.exec(o.series_id || '');
    if (!m) continue;
    units.add(o.units); copyright.add(o.copyright);
    const name = (/^Energy consumption per capita, (.+), Annual$/.exec(o.name || '') || [])[1] || o.name;
    if (String(o.geography || '').includes('+') || !/^[A-Z]{3}$/.test(m[1])) { aggregates[m[1]] = name; continue; }
    const code = SAME_CODE.eia[m[1]] || m[1];
    if (!updated || o.last_updated > updated) updated = o.last_updated;
    names.set(code, name);
    const data = o.data || [];
    for (const [y, v] of data) put(byCode, code, +y, typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null);
    if (!byCode.has(code)) byCode.set(code, new Map());
    if (data.some(([, v]) => v === 0) && !data.some(([, v]) => typeof v === 'number' && v !== 0)) zeroOnly[code] = name;
  }
  if (units.size !== 1 || ![...units][0] || [...units][0] !== 'million Btu per person') throw new Error(`EIA: units ${[...units].join(', ')}`);
  if ([...copyright].some(c => c && c !== 'None')) throw new Error(`EIA: a series' copyright field reads ${[...copyright].join(', ')}`);
  return { ...seriesOf(byCode, names), aggregates, zeroOnly, updated };
}

/** GMSD's burden estimates (tab- or comma-separated): gwno, year, …, milexgdp (a fraction of GDP), … */
export function parseGmsd(text, gwToIso, isoNames) {
  const sep = text.slice(0, 200).includes('\t') ? '\t' : ',';
  const { head, rows } = rowsOf(text, sep);
  const gi = head.indexOf('gwno'), yi = head.indexOf('year'), vi = head.indexOf('milexgdp');
  if ([gi, yi, vi].includes(-1)) throw new Error(`GMSD: unexpected columns ${head.join(', ')}`);
  const byCode = new Map(), names = new Map(), left = {}, unknown = new Set();
  let last = -Infinity;
  for (const r of rows) {
    const gw = +r[gi], y = +r[yi], v = num(r[vi]);
    if (v == null) continue;
    last = Math.max(last, y);
    if (y < GMSD_FROM) continue;
    const code = GW_JOIN[gw] || gwToIso.get(gw) || null;
    if (!code) { if (GMSD_LEFT[gw]) left[gw] = `state number ${gw} (${GMSD_LEFT[gw]})`; else unknown.add(gw); continue; }
    names.set(code, isoNames.get(code) || code);
    if (byCode.get(code)?.has(y)) throw new Error(`GMSD: two values for ${code} in ${y}`);
    put(byCode, code, y, Number((v * 100).toPrecision(6)));
  }
  if (unknown.size) throw new Error(`GMSD: state numbers with values since ${GMSD_FROM} that join to nothing and are not in GMSD_LEFT: ${[...unknown].join(' ')}`);
  return { ...seriesOf(byCode, names), aggregates: left, last };
}

/* ---------------------------------------------------------------- step 1: read the producers' files */
async function readGcp() {
  const recFile = arg('--gcp-record'), file = arg('--gcp-file');
  const rec = recFile ? JSON.parse(readFileSync(recFile, 'utf8')) : JSON.parse((await get(URLS.gcpLatest, 'GCP record')).toString('utf8'));
  const lic = rec.metadata?.license?.id;
  if (lic !== 'cc-by-4.0') throw new Error(`GCP: the record's licence reads ${lic}, not cc-by-4.0`);
  const f = (rec.files || []).find(x => /_percapita_flat\.csv$/.test(x.key));
  if (!f) throw new Error('GCP: no *_percapita_flat.csv in the record');
  const url = f.links?.self || `https://zenodo.org/api/records/${rec.id}/files/${encodeURIComponent(f.key)}/content`;
  if (!file) await pause();
  const buf = file ? readFileSync(file) : await get(url, 'GCP file');
  if (f.checksum && f.checksum !== `md5:${md5(buf)}`) throw new Error(`GCP: md5 ${md5(buf)} is not the record's ${f.checksum}`);
  return { buf, meta: { version: rec.metadata?.version, record: `https://zenodo.org/records/${rec.id}`, published: rec.metadata?.publication_date, file: f.key, licence: 'CC BY 4.0', ...fileInfo(buf, url) } };
}
async function readSatpm() {
  const file = arg('--satpm-file');
  const buf = file ? readFileSync(file) : await get(URLS.satpm, 'SatPM file');
  return { buf, meta: { version: 'V5.GL.06', file: URLS.satpm.split('/').pop(), licence: 'CC BY 4.0', ...fileInfo(buf, URLS.satpm) } };
}
async function readEia() {
  const file = arg('--eia-file');
  const buf = file ? readFileSync(file) : await get(URLS.eia, 'EIA bulk file');
  const txt = buf.readUInt32LE(0) === 0x04034b50 ? unzipOne(buf, 'INTL.txt') : buf;
  return { buf: txt, meta: { version: 'International Energy Data (bulk file INTL)', file: 'INTL.zip, its INTL.txt', licence: 'Public domain (US government work)', ...fileInfo(buf, URLS.eia) } };
}
async function readGmsd() {
  const recFile = arg('--gmsd-record'), file = arg('--gmsd-file');
  const rec = (recFile ? JSON.parse(readFileSync(recFile, 'utf8')) : JSON.parse((await get(URLS.gmsdRecord, 'GMSD record')).toString('utf8'))).data;
  const v = rec?.latestVersion, lic = v?.license?.name;
  if (!/^CC0 1\.0$/.test(lic || '')) throw new Error(`GMSD: the dataset's licence reads ${lic}, not CC0 1.0`);
  // The newest of the burden files by the date in its name (the dataset keeps earlier releases beside it), as a table.
  const f = (v.files || []).filter(x => /^estimates_milburden_\d{8}\.tab$/.test(x.dataFile?.filename || '')).sort((a, b) => b.dataFile.filename.localeCompare(a.dataFile.filename))[0];
  if (!f || f.restricted) throw new Error('GMSD: no open estimates_milburden_<date>.tab file in the newest version');
  const url = URLS.gmsdFile(f.dataFile.id);
  if (!file) await pause();
  const buf = file ? readFileSync(file) : await get(url, 'GMSD file');
  if (!file && f.dataFile.md5 && f.dataFile.md5 !== md5(buf)) throw new Error(`GMSD: md5 ${md5(buf)} is not the record's ${f.dataFile.md5}`);
  return { buf, meta: { version: `${v.versionNumber}.${v.versionMinorNumber}`, released: v.releaseTime, file: f.dataFile.originalFileName || f.dataFile.filename, record: 'https://doi.org/10.7910/DVN/DHMZOW', licence: 'CC0 1.0', ...fileInfo(buf, url) } };
}

/* ---------------------------------------------------------------- steps 2 to 4: the files, in memory */
const fmtCut = n => (Math.abs(n) >= 1000 ? n.toLocaleString('en-GB') : String(n));
const SPACE = 'by country, drawn on today’s borders (Natural Earth v5.1.1, 2022)';

export function buildAll(parsed, metas, { topo, small, national, now = stamp(), prevOf = () => null }) {
  const files = [], entries = [], nat = [];
  for (const spec of STANDINS) {
    const s = parsed[spec.id], m = metas[spec.id];
    const keys = Object.keys(s.values);
    if (keys.length < MIN_COUNTRIES) throw new Error(`${spec.id}: only ${keys.length} countries`);
    for (const k of keys) if (!/^[A-Z]{3}$/.test(k)) throw new Error(`${spec.id}: key ${k} is not an ISO3 code`);
    const [lo, hi] = RANGE[spec.id];
    for (const [k, vs] of Object.entries(s.values)) for (const v of vs) if (v != null && !(v >= lo && v <= hi)) throw new Error(`${spec.id}: ${k} has ${v}, outside ${lo}–${hi}`);
    const from = s.years[0], to = s.years.at(-1), line = spec.line(from, to), breaks = breaksOf(s);
    const away = unplaced(s, topo, small);
    const file = `${OUT}/${spec.id}.json`;
    const notDrawn = Object.keys(s.aggregates).length
      ? spec.id === 'standin-pm25-satpm' ? `SatPM’s ${Object.keys(s.aggregates).length} regions that VM cannot join to a country of Natural Earth’s`
        : spec.id === 'standin-milex-gmsd' ? `GMSD’s ${Object.keys(s.aggregates).length === 1 ? 'state number' : 'state numbers'} that VM does not draw`
          : spec.id === 'standin-energy-eia' ? `the EIA’s ${Object.keys(s.aggregates).length} regions, groups and areas under codes of its own` : `the Global Carbon Project’s ${Object.keys(s.aggregates).length} rows that are not a country of today`
      : null;
    const doc = {
      format: 'vm-series/1', layer: spec.id, source: spec.source, standsFor: spec.standsFor, indicator: s.indicator, name: spec.measure, unit: spec.unit,
      producer: spec.producer, licence: m.licence, version: m.version, lastupdated: m.date, url: m.url, built: null, line,
      years: s.years, join: 'iso3', values: s.values, names: s.names, aggregates: s.aggregates, ...(notDrawn ? { notDrawn } : {}), unplaced: away,
      ...(s.zeroOnly && Object.keys(s.zeroOnly).length ? { zeroOnly: s.zeroOnly } : {}),
      ...(s.joined ? { joined: s.joined, regions: s.regions } : {}),
    };
    doc.built = keepBuilt(prevOf(file), doc, now);
    const text = JSON.stringify(doc) + '\n', size = measure(text);
    if (size.gzip > LIMIT_GZ) throw new Error(`${file} is over the limit (${size.gzip} bytes gzipped)`);
    files.push({ file, text, size, doc });
    const nAway = Object.keys(away).length;
    entries.push({
      id: spec.id, module: 'omni-map', title: spec.title, role: 'fill', geometry: 'polygon', group: 'standin', standsFor: spec.standsFor,
      time: { field: 'year', from, to, step: 'y', precision: 'year' },
      data: file, on: 'countries', space: SPACE, measure: spec.measure, status: spec.status,
      style: { kind: 'classes', breaks, unit: spec.unit, scheme: 'sequential', cut: 'sevenths of every value, rounded to two significant figures' },
      legend: `${spec.measure}: ${spec.producer}, ${m.version}${m.date ? `, ${m.date}` : ''} (${m.licence}), on Natural Earth’s countries of today; a stand-in, not the World Bank’s series`,
      line,
      source: spec.source,
      method: `VM’s own text. A stand-in for the World Bank’s ${spec.standsFor}, which VM leaves out (its line under the map says why): ${line} Read from ${m.url} (${m.file}, ${m.bytes.toLocaleString('en-GB')} bytes, sha256 ${m.sha256.slice(0, 12)}…, read ${m.read.slice(0, 10)}). ${s.joinWords} VM draws each value on Natural Earth’s countries of today (v5.1.1, 2022), so a value of an early year is drawn on today’s borders, not on those of its time; a small state the 1:110 million map leaves out is a point. ${notDrawn ? `Not drawn, and listed under the map’s key: ${notDrawn}.` : ''} ${nAway ? `${Object.values(away).join(', ')} ${nAway === 1 ? 'has' : 'have'} a value but no shape or point on Natural Earth’s countries, so VM cannot place ${nAway === 1 ? 'it' : 'them'}; the key lists ${nAway === 1 ? 'it' : 'them'}.` : ''} The classes are VM’s: cut at the sevenths of every value the series holds (every country and year together), each rounded to two significant figures (${breaks.map(fmtCut).join(', ')}), the same for every year. A year with no value for a country leaves it blank (omni/scripts/build-standins.mjs).`.replace(/ {2,}/g, ' '),
      open: true, pinnable: true, built: doc.built, unplaced: away,
      files: [{ file, ...size }],
    });
    // National Analysis: each country's latest value and its year, for the countries it holds.
    const latest = {};
    for (const c of national) {
      const vs = s.values[c.iso3]; if (!vs) continue;
      for (let i = vs.length - 1; i >= 0; i--) if (vs[i] != null) { latest[c.iso3] = [s.years[i], vs[i]]; break; }
    }
    nat.push({ id: spec.id, standsFor: spec.standsFor, label: spec.label, unit: spec.unit, producer: spec.producer, source: spec.source, licence: m.licence, version: m.version, url: m.record || m.page || m.url, from, to, line, latest });
  }
  const natDoc = {
    format: 'vm-standins/1', generated: null,
    about: 'VM’s own text. Four series from producers other than the World Bank, each shown beside the World Bank’s series VM leaves out, never in its place: each country’s latest value and its year. Written by omni/scripts/build-standins.mjs; never edited by hand.',
    series: nat,
    stillLeftOut: STILL_LEFT_OUT.map(x => ({ ...x, why: STILL_WHY })),
  };
  const prevNat = prevOf(NATIONAL_FILE);
  natDoc.generated = keepBuilt(prevNat, natDoc, now, 'generated');
  const natText = JSON.stringify(natDoc) + '\n';
  if (measure(natText).gzip > LIMIT_GZ) throw new Error(`${NATIONAL_FILE} is over the limit`);
  return { files, entries, natText, natDoc };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const ne = neCountries(ROOT), byName = isoResolver(ne);
  const topo = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/countries.topo.json'), 'utf8'));
  const small = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/small-states.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(ROOT, 'national/data/index.json'), 'utf8'));
  const neCodes = new Set(ne.map(c => c.iso3).filter(Boolean));
  for (const [n, c] of Object.entries(SATPM_NAMES)) if (!neCodes.has(c)) throw new Error(`SATPM_NAMES: ${n} → ${c}, which is not one of Natural Earth’s codes`);
  const gwToIso = new Map();
  for (const c of index.countries) if (c.gw != null && !gwToIso.has(c.gw)) gwToIso.set(c.gw, c.iso3);
  for (const gw of Object.keys(GMSD_LEFT)) gwToIso.delete(+gw);
  const isoNames = new Map([...ne.filter(c => c.iso3).map(c => [c.iso3, c.n]), ...index.countries.map(c => [c.iso3, c.name])]);

  // Step 1, one producer after another.
  const gcp = await readGcp(); if (!arg('--gcp-file')) await pause();
  const sat = await readSatpm(); if (!arg('--satpm-file')) await pause();
  const eia = await readEia(); if (!arg('--eia-file')) await pause();
  const gmsd = await readGmsd();
  // Steps 2 and 3.
  const eiaParsed = parseEia(eia.buf.toString('utf8'));
  const eiaZero = Object.entries(eiaParsed.zeroOnly).map(([c, n]) => `${n} (${c})`);
  const parsed = {
    'standin-co2-gcp': { ...parseGcp(gcp.buf.toString('utf8')), indicator: 'Total (tonnes of CO₂ per person)', joinWords: 'Joined by the Global Carbon Project’s own ISO 3166-1 alpha-3 codes (its KSV is Kosovo, XKX).' },
    'standin-pm25-satpm': { ...parseSatpm(sat.buf.toString('utf8'), byName), indicator: 'Population-Weighted PM2.5 [ug/m3]', joinWords: 'SatPM’s file names each country and gives no code: VM joins each name to Natural Earth’s name and ISO3, or, for SatPM’s own spellings, through VM’s table in omni/scripts/build-standins.mjs (SATPM_NAMES); a name it cannot join is listed, never guessed.' },
    'standin-energy-eia': { ...eiaParsed, indicator: 'INTL.47-33-<ISO3>-MBTUPP.A', joinWords: `Joined by the EIA’s own three-letter codes (its XKS is Kosovo, XKX); its regions and groups of countries are not drawn, and a code with a value but no shape on today’s map is listed under the key. VM reads the EIA’s 0 as no value, so a year the file gives as 0 is blank${eiaZero.length ? `, and ${eiaZero.length} codes whose every value is 0 are not drawn: ${eiaZero.join(', ')}` : ''}.` },
    'standin-milex-gmsd': { ...parseGmsd(gmsd.buf.toString('utf8'), gwToIso, isoNames), indicator: 'milexgdp (×100)', joinWords: `GMSD keys each state by its Gleditsch and Ward number: VM joins each number to an ISO3 through National Analysis’s numbers (national/data/index.json), save ${Object.entries(GW_JOIN).map(([g, c]) => `${g} (${c})`).join(', ')}, from VM’s table (GW_JOIN). VM shows the years from ${GMSD_FROM}, the first in which every number stands for a state of today. GMSD gives each value as a fraction of GDP; VM multiplies it by 100 and keeps six significant figures.` },
  };
  if (parsed['standin-milex-gmsd'].last !== parsed['standin-milex-gmsd'].years.at(-1)) throw new Error('GMSD: its last year with a value is not the last year shown');
  const eiaDate = parsed['standin-energy-eia'].updated;
  const metas = {
    'standin-co2-gcp': { ...gcp.meta, date: gcp.meta.published },
    'standin-pm25-satpm': { ...sat.meta, page: URLS.satpmPage, date: null },
    'standin-energy-eia': { ...eia.meta, date: eiaDate ? eiaDate.slice(0, 10) : null },
    'standin-milex-gmsd': { ...gmsd.meta, date: gmsd.meta.released ? gmsd.meta.released.slice(0, 10) : null },
  };
  // Step 4.
  const out = buildAll(parsed, metas, { topo, small, national: index.countries, prevOf: f => readJson(join(ROOT, f)) });
  for (const f of out.files) console.log(`${f.file}: ${Object.keys(f.doc.values).length} countries, ${f.doc.years[0]}–${f.doc.years.at(-1)}, not drawn: ${Object.values(f.doc.aggregates).join('; ') || 'none'}, unplaced: ${Object.keys(f.doc.unplaced).join(' ') || 'none'}; ${f.size.bytes} bytes, ${f.size.gzip} gzipped`);
  for (const [id, m] of Object.entries(metas)) console.log(`${id}: ${m.url} ${m.bytes} bytes sha256 ${m.sha256}`);
  if (dry) { console.log('--dry: nothing written'); return; }
  // Step 5: every check passed; now write.
  mkdirSync(join(ROOT, OUT), { recursive: true });
  for (const f of out.files) writeFileSync(join(ROOT, f.file), f.text);
  for (const e of out.entries) putLayer(LAYERS, e);
  writeFileSync(join(ROOT, NATIONAL_FILE), out.natText);
  console.log(`${NATIONAL_FILE}: ${out.natDoc.series.map(s => `${s.id} ${Object.keys(s.latest).length}`).join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
