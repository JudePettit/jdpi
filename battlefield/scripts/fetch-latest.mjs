// Finds and downloads UCDP's latest year-to-date Candidate Events file, then rebuilds realtime.json.
//   node battlefield/scripts/fetch-latest.mjs [--force] [--allow-drop]
// UCDP publishes a cumulative file each month, e.g. candidateged/GEDEvent_v26_01_26_09.csv (Jan–Sep 2026).
// --force downloads even when realtime.json is already on that release, or on a newer one than UCDP lists;
// --allow-drop is passed to build-realtime.mjs, whose guard otherwise refuses a file with fewer months or events.
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const force = process.argv.includes('--force');
// A release's order: year, then the last month it covers ('26.01.26.09' → 2609), the same for file names and versions.
const keyOf = version => { const p = String(version).split('.').map(Number); return p[2] * 100 + p[3]; };
const downloads = await fetch('https://ucdp.uu.se/downloads/');
if (!downloads.ok) throw new Error(`UCDP downloads page: HTTP ${downloads.status}`);
const page = await downloads.text();
const files = [...page.matchAll(/candidateged\/GEDEvent_v(\d+)_01_(\d+)_(\d+)\.csv/g)]
  .map(m => { const version = `${m[1]}.01.${m[2]}.${m[3]}`; return { path: m[0], version, key: keyOf(version) }; })
  .sort((a, b) => b.key - a.key);
if (!files.length) throw new Error('No cumulative candidate file found on the UCDP downloads page');
const latest = files[0];

const out = new URL('../data/realtime.json', import.meta.url);
const current = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).version : null;
if (current === latest.version && !force) {
  console.log(`Already on ${latest.version}`);
  process.exit(0);
}
// The newest file the page lists is older than the one already built: the page has changed (or lost the current
// file), and downloading would roll the year's data back. Fail so the weekly run shows it.
if (current && latest.key < keyOf(current) && !force) throw new Error(`UCDP lists ${latest.version}, older than the committed ${current}; not rolling back (--force --allow-drop does)`);
const res = await fetch('https://ucdp.uu.se/downloads/' + latest.path);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const csv = join(mkdtempSync(join(tmpdir(), 'ucdp-')), 'candidate.csv');
writeFileSync(csv, Buffer.from(await res.arrayBuffer()));
const pass = process.argv.includes('--allow-drop') ? ['--allow-drop'] : [];
execFileSync(process.execPath, [fileURLToPath(new URL('./build-realtime.mjs', import.meta.url)), csv, latest.version, ...pass], { stdio: 'inherit' });
