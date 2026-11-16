// National Analysis's yearly layer: national/data/years/, every country's figures by year, in the shape the page's time
// slider and the Omni-Map both read (NA-05, 16 November 2026; PRP-SCHOLAR-USP-DESIGN.md 4.1–4.2).
//   node national/scripts/years.mjs      rewrites national/data/years/ from the committed index.json and series/, with
//                                        no network (build.mjs calls yearsFiles() itself on its monthly run)
// Files:
//   years/manifest.json      the layers: id, title, unit, years, source, licence, method, file and its sha256; the
//                            country key (ISO3, in the order every file uses) and what a missing value looks like (null)
//   years/wb/<code>.json     one indicator: {layer, v, from, to, countries, values}; values[k] is the k-th country's value
//                            for each year from..to, null where the World Bank has none (never carried forward)
//   years/pressure.json      the PESTLE pressure of each single year, as integers ×1000 with the dimensions scored,
//                            worked out by national/lib/pestle.js (yearPick: the year's value, or one up to two years older)
// One file per indicator, not per year: the Omni-Map draws one fill at a time and Play needs every year of it, so one
// fetch serves a whole run (per-year files would need 46 fetches and carry 39 unseen indicators).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scoreYear, layerOf, pressureRow, PRESSURE_FIELDS, MAX_AGE, PREV_WITHIN, FLOOR } from '../lib/pestle.js';

const WGI = 3;
// The World Bank's figures are for today's countries: a year before a state existed (South Sudan in 1980, unified
// Germany, Russia or Ukraine in the 1980s) is the World Bank's reconstruction for its present territory.
const TERRITORY = 'Values are for present-day countries: a year before a state existed, or before its borders took today\'s shape, is the World Bank\'s reconstruction for its present territory, not a figure of the time.';
const sha256 = text => createHash('sha256').update(text).digest('hex');

// The files, in memory: [[path relative to national/data, text], …]. index: the index.json object; series: Map ISO3 →
// {code: [[year, value], …]}; indicators: indicators.mjs's list.
export function yearsFiles(index, series, indicators) {
  const countries = index.countries.map(c => c.iso3);
  const [FIRST, LAST] = index.years;
  const accessed = String(index.generated).slice(0, 10);
  const files = [], layers = [];
  for (const ind of indicators) {
    const wgi = ind.source === WGI;
    // USP 5.1's source shape. A governance series is cited by the code its values come from (GOV_WGI_<code>, the
    // Worldwide Governance Indicators' own source 3), not the archived WDI copy under the plain code.
    const source = wgi
      ? { id: 'worldbank-wgi', citation: `World Bank, Worldwide Governance Indicators, ${ind.code} (source 3)`, short: 'World Bank WGI', licence: 'CC BY 4.0', url: `https://api.worldbank.org/v2/country/all/indicator/${ind.code}?source=3`, home: 'https://www.worldbank.org/en/publication/worldwide-governance-indicators', accessed, terms: 'host' }
      : { id: 'worldbank-wdi', citation: `World Bank, World Development Indicators, ${ind.code}`, short: 'World Bank WDI', licence: 'CC BY 4.0', url: `https://data.worldbank.org/indicator/${ind.code}`, accessed, terms: 'host' };
    const layer = layerOf(series, countries, ind.code);
    const entry = {
      id: 'wb:' + ind.code, module: 'pestle', title: ind.label, geometry: 'country',
      time: layer ? { field: 'year', from: layer.from, to: layer.to, step: 'y', precision: 'year' } : null,
      data: null, sha256: null, measure: 'wb:' + ind.code, unit: ind.unit, dimension: ind.dimension, core: !!ind.core, better: ind.better ?? null,
      status: 'estimate', by: wgi ? 'scholarly-estimate' : 'official', origin: 'source', borderPrecision: 'present-day',
      style: { kind: 'sequential', ramp: '--prp-seq' }, legend: `${ind.label} (${ind.unit}); the year of each value is its own`,
      source,
      method: `The World Bank's value for the calendar year, rounded to four decimals; null where none; nothing filled or carried forward. For today's countries: an earlier year is the World Bank's reconstruction for the present territory.${wgi ? ' The Worldwide Governance Indicators are estimates built from surveys and expert assessments, yearly since 2002 (every two years 1996–2002).' : ''}`,
      open: layer ? `q/national.html#map&measure=wb:${ind.code}&year={at}` : null,
      openPeriod: layer ? `q/national.html#map&measure=wb:${ind.code}&from={from}&year={to}` : null,
      pinnable: false, pinNote: 'Rebuilt monthly, and the World Bank revises past years.', omni: true,
    };
    if (layer) {
      const text = JSON.stringify(layer), path = `years/wb/${ind.code}.json`;
      files.push([path, text]);
      Object.assign(entry, { data: `national/data/${path}`, sha256: sha256(text) });
    } else {
      Object.assign(entry, { omni: false, note: 'No values: the World Bank serves this series only from its archive, which the indicator API does not reach.' });
    }
    layers.push(entry);
  }
  // PESTLE pressure, each single year from the first held: 1980 has a coverage but no score (a change needs an earlier
  // value), so the first score is firstScore. Each field has its own scale (dims is a count, the rest thousandths).
  const years = Array.from({ length: LAST - FIRST + 1 }, (_, k) => FIRST + k);
  const rows = countries.map(iso => years.map(Y => pressureRow(scoreYear(series.get(iso) || {}, Y, indicators, MAX_AGE))));
  const from = years[Math.max(0, years.findIndex((_, k) => rows.some(r => r[k])))];
  const firstScore = years[Math.max(0, years.findIndex((_, k) => rows.some(r => r[k] && r[k][0] != null)))];
  const fieldUnits = Object.fromEntries(PRESSURE_FIELDS.map(f => [f, f === 'dims' ? { unit: 'dimensions scored, a count from 0 to 6 (fewer than six is partial)', scale: 1 }
    : f === 'coverage' ? { unit: 'share of the 22 core indicators with a value that year, 0–1', scale: 1000 }
    : { unit: f === 'overall' ? 'mean of the dimensions scored, 0–1' : `share of the ${f} dimension's scored indicators worsening, 0–1`, scale: 1000 }]));
  const pressure = { layer: 'national-pestle', v: 1, from, to: LAST, firstScore, maxAge: MAX_AGE, prevWithin: PREV_WITHIN, fields: PRESSURE_FIELDS, scales: PRESSURE_FIELDS.map(f => fieldUnits[f].scale), countries, values: rows.map(r => (r.slice(from - FIRST).some(Boolean) ? r.slice(from - FIRST) : null)) };
  const ptext = JSON.stringify(pressure);
  files.push(['years/pressure.json', ptext]);
  layers.unshift({
    id: 'national-pestle', module: 'pestle', title: 'PESTLE pressure, by year', geometry: 'country',
    time: { field: 'year', from, to: LAST, step: 'y', precision: 'year' }, firstScore,
    data: 'national/data/years/pressure.json', sha256: sha256(ptext), measure: 'national-pestle', unit: 'share of scored indicators worsening, 0–1 (each field\'s own unit and scale: fieldUnits)',
    fields: PRESSURE_FIELDS, fieldUnits,
    floor: { dims: FLOOR, note: `On the page, a score from fewer than ${FLOOR} of the six dimensions is shown in words but not coloured or ranked, and a period's two ends are compared only where both rest on the same dimensions. The values here are the rule's, unfiltered.` },
    status: 'estimate', origin: 'vm',
    style: { kind: 'sequential', ramp: '--prp-seq', max: 0.6 }, legend: 'Share of a dimension\'s scored indicators worsening; fewer than six dimensions is partial',
    source: { id: 'vm-national', citation: 'Vitruvian Manager, National Analysis, PESTLE pressure (after Country PESTLE), from World Bank WDI and WGI', short: 'VM National Analysis', licence: 'World Bank data CC BY 4.0; method © JDP-Iq', url: 'https://jdpi.pages.dev/q/national.html', accessed, terms: 'host' },
    method: `VM's own composite (an estimate VM derives), not a forecast or a ranking of how well a country is run. For each of the 22 core indicators, the value of the year (or one up to ${MAX_AGE} years older, never more) is compared with the country's previous value no more than ${PREV_WITHIN} years before it; a change past the indicator's threshold is improving or worsening. A dimension's pressure is the share of its scored indicators worsening; overall pressure is the mean of the dimensions scored (dims, 0–6; fewer than six is partial); coverage is the share of the 22 with a value. ${FIRST} has a coverage but no score, as a change needs an earlier value; VM's build asks the World Bank for ${FIRST} onwards, so for a value from before ${FIRST + PREV_WITHIN} the look-back stops at ${FIRST}. Recompute it from the wb: layers with national/lib/pestle.js (scoreYear).`,
    open: 'q/national.html#map&year={at}', openPeriod: 'q/national.html#map&from={from}&year={to}',
    pinnable: false, pinNote: 'Rebuilt monthly from World Bank data, which is revised.', omni: false, omniNote: "VM's composite; double-counting: the Omni-Map takes the wb: indicators instead, and this stays on National Analysis.",
  });
  const manifest = {
    v: 1, generated: index.generated, title: 'National Analysis: indicators and PESTLE pressure by year', page: 'q/national.html',
    key: 'iso3', missing: null, years: [FIRST, LAST],
    keyNote: 'The World Bank\'s three-letter codes: ISO 3166-1 alpha-3, save XKX (Kosovo) and CHI (the Channel Islands), which ISO does not assign. The ISO numeric and Gleditsch–Ward codes (num, gw), where a country has them, are in national/data/index.json; CHI has neither, so no border layer draws it.',
    note: `Each file lists the countries in the order given here; values[k][year - from] is the k-th country's value for that year, null where there is none. Nothing is carried forward. The years are VM's request window, ${FIRST} (where Country PESTLE began) to the newest year the World Bank holds. ${TERRITORY} In open and openPeriod, {at} is the frame's year and {from} and {to} the window's first and last, in AD years, as the Omni-Map's recipe gives them (USP 3.2). Per-country series of every indicator: national/data/series/<ISO3>.json.`,
    countries, layers,
  };
  files.unshift(['years/manifest.json', JSON.stringify(manifest)]);
  return files;
}

export function writeYears(OUT, files) {
  rmSync(join(OUT, 'years'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'years/wb'), { recursive: true });
  for (const [path, text] of files) writeFileSync(join(OUT, path), text);
}

// Run on its own: from the committed data, no network.
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const OUT = resolve(fileURLToPath(new URL('../data', import.meta.url)));
  const { INDICATORS } = await import('./indicators.mjs');
  const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
  const series = new Map(index.countries.map(c => [c.iso3, existsSync(join(OUT, `series/${c.iso3}.json`)) ? JSON.parse(readFileSync(join(OUT, `series/${c.iso3}.json`), 'utf8')) : {}]));
  const files = yearsFiles(index, series, INDICATORS);
  writeYears(OUT, files);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`wrote ${files.length} files to national/data/years (${kb(files.reduce((a, [, t]) => a + Buffer.byteLength(t), 0))})`);
}
