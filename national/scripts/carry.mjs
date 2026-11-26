// What national/scripts/build.mjs carries across its emptying of national/data (26 November 2026). The build replaces
// the whole folder (rmSync) once every country is done, so the files it does not make from its own sources would be
// lost on each monthly refresh (.github/workflows/national-refresh.yml):
//   governance/GOV_WGI_xx.json  the World Bank's governance scores with their 90% range (indicators.mjs, governanceFiles).
//                               The build fetches them again; if the World Bank fails or a licence no longer reads
//                               CC BY 4.0, the files there before are kept as they were, so the ranges never drop off.
//   standins.json               the four stand-in series, written by omni/scripts/build-standins.mjs on its own refresh
//                               (standins-refresh.yml); this build never makes it, so it is kept as it was.
// Read before the folder is emptied (readKept), written back after (writeKept). No network access here.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const GOVERNANCE_DIR = 'governance';
export const KEPT_AS_IS = ['standins.json'];

// { governance: [[path under national/data, text], …], asIs: [[path, text], …] }: what is there now.
export function readKept(OUT) {
  const dir = join(OUT, GOVERNANCE_DIR);
  const governance = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => [`${GOVERNANCE_DIR}/${f}`, readFileSync(join(dir, f), 'utf8')]) : [];
  const asIs = KEPT_AS_IS.filter(f => existsSync(join(OUT, f))).map(f => [f, readFileSync(join(OUT, f), 'utf8')]);
  return { governance, asIs };
}

// A kept governance file put in the order of this build's countries (`countries`, index.json's ISO3 codes in its
// order): each country's row moves with its code, a country new to the list gets null (no score), and one gone from
// it is dropped. The page reads a row by its code, but the files must follow index.json's order, as their test asks
// (tests/addition-governance-range.test.mjs). A file already in that order, or one that is not a layer, is unchanged.
export function realign(text, countries) {
  if (!Array.isArray(countries)) return text;
  let L;
  try { L = JSON.parse(text); } catch { return text; }
  if (!Array.isArray(L?.countries) || !Array.isArray(L.values)) return text;
  if (L.countries.length === countries.length && L.countries.every((c, i) => c === countries[i])) return text;
  const row = new Map(L.countries.map((c, i) => [c, L.values[i] ?? null]));
  return JSON.stringify({ ...L, countries: [...countries], values: countries.map(c => row.get(c) ?? null) });
}

// The governance files to write: the fresh ones (fresh(), indicators.mjs governanceFiles) when it succeeds, else the
// kept ones, put in the order of `countries` (realign). Never throws: a failure is reported through warn and the build
// goes on.
export async function governanceOrKept({ fresh, kept, countries = null, warn = () => {} }) {
  try {
    const files = await fresh();
    if (Array.isArray(files) && files.length) return { files, from: 'fresh' };
    warn('governance: the World Bank gave no files');
  } catch (e) {
    warn(`governance: ${e.message}`);
  }
  if (kept.length) warn(`governance: the ${kept.length} files there before are kept, with their figures as they were`);
  else warn('governance: no files there before either, so national/data/governance/ is not written');
  return { files: kept.map(([p, t]) => [p, realign(t, countries)]), from: kept.length ? 'kept' : 'none' };
}

// Writes the governance files (through indicators.mjs writeGovernance) and the files kept as they were.
export function writeKept(OUT, { governance, asIs }, writeGovernance) {
  if (governance.length) writeGovernance(OUT, governance);
  for (const [path, text] of asIs) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, path), text); }
}
