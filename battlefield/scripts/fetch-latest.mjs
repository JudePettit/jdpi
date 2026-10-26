// Finds and downloads UCDP's latest year-to-date Candidate Events file, then rebuilds realtime.json.
//   node battlefield/scripts/fetch-latest.mjs
// UCDP publishes a cumulative file each month, e.g. candidateged/GEDEvent_v26_01_26_09.csv (Jan–Sep 2026).
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const page = await (await fetch('https://ucdp.uu.se/downloads/')).text();
const files = [...page.matchAll(/candidateged\/GEDEvent_v(\d+)_01_(\d+)_(\d+)\.csv/g)]
  .map(m => ({ path: m[0], version: `${m[1]}.01.${m[2]}.${m[3]}`, key: +m[2] * 100 + +m[3] }))
  .sort((a, b) => b.key - a.key);
if (!files.length) throw new Error('No cumulative candidate file found on the UCDP downloads page');
const latest = files[0];

const out = new URL('../data/realtime.json', import.meta.url);
if (existsSync(out) && JSON.parse(readFileSync(out, 'utf8')).version === latest.version && !process.argv.includes('--force')) {
  console.log(`Already on ${latest.version}`);
  process.exit(0);
}
const res = await fetch('https://ucdp.uu.se/downloads/' + latest.path);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const csv = join(mkdtempSync(join(tmpdir(), 'ucdp-')), 'candidate.csv');
writeFileSync(csv, Buffer.from(await res.arrayBuffer()));
execFileSync(process.execPath, [new URL('./build-realtime.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), csv, latest.version], { stdio: 'inherit' });
