// National Analysis indicators. The first 22 are Country PESTLE's (same codes, directions and thresholds), so the
// pressure scores match it; the rest widen the profile. `better: null` marks context metrics (size, structure),
// shown and compared but not scored as improving or worsening.
// Sources: World Bank World Development Indicators (source 2) and Worldwide Governance Indicators (source 3).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rangeCodes, rangeLayer, fileOf, DECIMALS } from '../lib/governance.js';
const WDI = 2, WGI = 3;
export const DIMENSIONS = ['political', 'economic', 'social', 'technological', 'legal', 'environmental'];
export const INDICATORS = [
  // ---- Country PESTLE's core set
  ['GOV_WGI_PV.EST', 'political', 'Political stability & absence of violence', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_VA.EST', 'political', 'Voice & accountability', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_GE.EST', 'political', 'Government effectiveness', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['NY.GDP.MKTP.KD.ZG', 'economic', 'GDP growth', '% a year', 'up', 1, WDI],
  ['FP.CPI.TOTL.ZG', 'economic', 'Inflation (consumer prices)', '% a year', 'down', 1, WDI],
  ['SL.UEM.TOTL.ZS', 'economic', 'Unemployment', '% of labour force', 'down', 0.5, WDI],
  ['NY.GDP.PCAP.KD', 'economic', 'GDP per person (constant 2015 US$)', 'US$', 'up', 0, WDI],
  ['SP.DYN.LE00.IN', 'social', 'Life expectancy at birth', 'years', 'up', 0.3, WDI],
  ['SP.DYN.IMRT.IN', 'social', 'Infant mortality', 'per 1,000 live births', 'down', 0.5, WDI],
  ['SE.SEC.ENRR', 'social', 'Secondary school enrolment (gross)', '%', 'up', 1, WDI],
  ['SI.POV.GINI', 'social', 'Income inequality (Gini)', 'index', 'down', 0.5, WDI],
  ['IT.NET.USER.ZS', 'technological', 'Internet users', '% of population', 'up', 1, WDI],
  ['IT.CEL.SETS.P2', 'technological', 'Mobile subscriptions', 'per 100 people', 'up', 2, WDI],
  ['GB.XPD.RSDV.GD.ZS', 'technological', 'R&D spending', '% of GDP', 'up', 0.05, WDI],
  ['EG.ELC.ACCS.ZS', 'technological', 'Access to electricity', '% of population', 'up', 0.5, WDI],
  ['GOV_WGI_RL.EST', 'legal', 'Rule of law', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_CC.EST', 'legal', 'Control of corruption', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['GOV_WGI_RQ.EST', 'legal', 'Regulatory quality', 'index −2.5…2.5', 'up', 0.1, WGI],
  ['EN.GHG.CO2.PC.CE.AR5', 'environmental', 'CO₂ emissions per person', 't CO₂e', 'down', 0.1, WDI],
  ['EG.FEC.RNEW.ZS', 'environmental', 'Renewable share of energy use', '%', 'up', 0.5, WDI],
  ['AG.LND.FRST.ZS', 'environmental', 'Forest area', '% of land', 'up', 0.2, WDI],
  ['EN.ATM.PM25.MC.M3', 'environmental', 'PM2.5 air pollution exposure', 'µg/m³', 'down', 1, WDI],
  // ---- Added in National Analysis
  ['MS.MIL.XPND.GD.ZS', 'political', 'Military spending', '% of GDP', null, 0, WDI],
  ['SM.POP.REFG.OR', 'political', 'Refugees originating from the country', 'people', 'down', 0, WDI],
  ['VC.IHR.PSRC.P5', 'legal', 'Intentional homicides', 'per 100,000 people', 'down', 0.3, WDI],
  ['GC.DOD.TOTL.GD.ZS', 'economic', 'Central government debt', '% of GDP', 'down', 2, WDI],
  ['BN.CAB.XOKA.GD.ZS', 'economic', 'Current account balance', '% of GDP', 'up', 1, WDI],
  ['NE.TRD.GNFS.ZS', 'economic', 'Trade', '% of GDP', null, 0, WDI],
  ['BX.KLT.DINV.WD.GD.ZS', 'economic', 'Foreign direct investment inflows', '% of GDP', 'up', 0.5, WDI],
  ['NY.GDP.MKTP.CD', 'economic', 'GDP (current US$)', 'US$', null, 0, WDI],
  // The World Bank names SI.POV.DDAY "Poverty headcount ratio at $3.00 a day (2021 PPP)" (its indicator API, read
  // 25 November 2026), and the values it serves are that line's: the label was "$2.15/day" until then (pestle-5).
  ['SI.POV.DDAY', 'social', 'Extreme poverty ($3.00/day, 2021 PPP)', '% of population', 'down', 0.5, WDI],
  ['SP.POP.TOTL', 'social', 'Population', 'people', null, 0, WDI],
  ['SP.POP.GROW', 'social', 'Population growth', '% a year', null, 0, WDI],
  ['SP.DYN.TFRT.IN', 'social', 'Fertility rate', 'births per woman', null, 0, WDI],
  ['SP.URB.TOTL.IN.ZS', 'social', 'Urban population', '% of population', null, 0, WDI],
  ['SE.TER.ENRR', 'social', 'Tertiary (university) enrolment', '% gross', 'up', 1, WDI],
  ['SH.XPD.CHEX.GD.ZS', 'social', 'Health spending', '% of GDP', null, 0, WDI],
  ['TX.VAL.TECH.MF.ZS', 'technological', 'High-tech exports', '% of manufactured exports', 'up', 1, WDI],
  ['IP.PAT.RESD', 'technological', 'Patent applications by residents', 'applications', 'up', 0, WDI],
  ['EG.USE.PCAP.KG.OE', 'environmental', 'Energy use per person', 'kg oil equivalent', null, 0, WDI],
  ['ER.H2O.FWST.ZS', 'environmental', 'Water stress', '% of available freshwater', 'down', 2, WDI],
].map(([code, dimension, label, unit, better, threshold, source]) => ({ code, dimension, label, unit, better, threshold, source, core: false }));
INDICATORS.slice(0, 22).forEach(i => { i.core = true; });

// ---- The six governance indicators' own 90% range (HD-13, 25 November 2026)
// The World Bank gives each governance indicator as an estimate (GOV_WGI_xx.EST, about −2.5 to 2.5, the value shown
// above), a score on a 0–100 scale (GOV_WGI_xx.SC) and the lower and upper bounds of the score's 90% confidence interval
// (GOV_WGI_xx.SC_LB, SC_UB): its series list for source 3 (https://api.worldbank.org/v2/source/3/indicator?format=json,
// read 25 November 2026) names all 36 series of the six, and gives bounds for the score only (the estimate has a standard
// error, .SE). Each series' metadata gives "CC BY-4.0" (License_Type), and the data catalogue gives the dataset
// "Creative Commons Attribution 4.0" (https://datacatalog.worldbank.org/search/dataset/0038026, read the same day).
// The job below writes national/data/governance/<GOV_WGI_xx>.json (national/lib/governance.js has the shape):
//   node national/scripts/indicators.mjs --governance      no key; it stops unless every series' licence reads CC BY 4.0
// It reads the countries from the committed index.json. national/scripts/build.mjs, which empties national/data on its
// monthly run, calls governanceFiles() and writeGovernance() too, and keeps the previous files if the fetch or the
// licence check fails (carry.mjs, 26 November 2026).
export const GOVERNANCE = INDICATORS.filter(i => i.source === WGI).map(i => ({ est: i.code, label: i.label, dimension: i.dimension, ...rangeCodes(i.code) }));
export const GOVERNANCE_META = code => `https://api.worldbank.org/v2/sources/${WGI}/series/${code}/metadata?format=json`;
export const GOVERNANCE_DATA = code => `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=1996:2100&source=${WGI}`;
export const GOVERNANCE_HOME = 'https://www.worldbank.org/en/publication/worldwide-governance-indicators';
export const isCcBy4 = l => /^CC[ -]?BY[ -]4\.0$/i.test(String(l || '').trim());
// The licence a series' metadata gives (License_Type), or null.
export const licenceOf = meta => (meta?.source?.[0]?.concept?.[0]?.variable?.[0]?.metatype || []).find(x => x.id === 'License_Type')?.value ?? null;

// The files, in memory: [[path relative to national/data, text], …]. getJson(url) fetches and parses; countries: ISO3s
// in index.json's order; accessed: the day read (YYYY-MM-DD). Stops, writing nothing, if a series' licence is not
// CC BY 4.0, a reply is not rows, or an indicator comes back with no score at all.
export async function governanceFiles({ getJson, countries, accessed, wait = () => null }) {
  const released = (await getJson(`https://api.worldbank.org/v2/sources/${WGI}?format=json`).catch(() => null))?.[1]?.[0]?.lastupdated || null;
  const files = [];
  for (const g of GOVERNANCE) {
    const rows = {};
    for (const part of ['score', 'lower', 'upper']) {
      const code = g[part], licence = licenceOf(await getJson(GOVERNANCE_META(code)));
      if (!isCcBy4(licence)) throw new Error(`${code}: its metadata gives the licence "${licence}", not CC BY 4.0; nothing is written`);
      const r = await getJson(GOVERNANCE_DATA(code));
      if (!Array.isArray(r?.[1])) throw new Error(`${code}: ${r?.[0]?.message?.map(m => m.value).join('; ') || 'no rows'}`);
      if (r[0].pages > 1) throw new Error(`${code}: ${r[0].total} rows, more than one page`);
      // The Bank gives each row's display precision ("decimal"); VM stores the values as the source rounds them, so a
      // change at the Bank stops the job rather than being rounded the old way unseen.
      const odd = r[1].find(x => x?.value != null && x.decimal !== DECIMALS);
      if (odd) throw new Error(`${code}: the World Bank gives ${odd.decimal ?? 'no'} decimal places (${odd.countryiso3code || odd.country?.value} ${odd.date}), not ${DECIMALS}; change DECIMALS in national/lib/governance.js; nothing is written`);
      rows[part] = r[1];
      await wait();
    }
    const L = rangeLayer(g, rows, countries, {
      generated: accessed, released,
      source: { citation: `World Bank, Worldwide Governance Indicators, ${g.score}, ${g.lower} and ${g.upper} (source ${WGI})`, short: 'World Bank WGI', licence: 'CC BY 4.0', url: GOVERNANCE_DATA(g.score).replace(/&per_page.*$/, `&source=${WGI}`), home: GOVERNANCE_HOME, accessed },
    });
    if (!L.values.some(Boolean)) throw new Error(`${g.score}: no country has a score; nothing is written`);
    files.push([fileOf(g.est), JSON.stringify(L)]);
  }
  return files;
}
export function writeGovernance(OUT, files) {
  rmSync(join(OUT, 'governance'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'governance'), { recursive: true });
  for (const [path, text] of files) writeFileSync(join(OUT, path), text);
}

// Run on its own: the six indicators' ranges, for the countries of the committed index.json.
if (process.argv.includes('--governance') && resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const OUT = resolve(fileURLToPath(new URL('../data', import.meta.url)));
  const UA = { 'User-Agent': 'JDP-I National Analysis (https://jdpi.pages.dev)' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJson = async url => {
    for (let i = 0; i < 5; i++) {
      try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch {}
      await sleep(2000 * (i + 1));
    }
    throw new Error('Failed: ' + url.slice(0, 120));
  };
  const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
  const files = await governanceFiles({ getJson, countries: index.countries.map(c => c.iso3), accessed: new Date().toISOString().slice(0, 10), wait: () => sleep(250) });
  writeGovernance(OUT, files);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`wrote ${files.length} files to national/data/governance (${kb(files.reduce((a, [, t]) => a + Buffer.byteLength(t), 0))})`);
}
