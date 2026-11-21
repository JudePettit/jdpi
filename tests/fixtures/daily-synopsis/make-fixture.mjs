// Daily Synopsis's fixture days: what the page shows with ?data=fixture, under a notice that they are a test fixture.
//   node tests/fixtures/daily-synopsis/make-fixture.mjs
// Order of steps. Nothing is written until every step has worked:
//   1. In a new temporary folder, for each made-up day of fixture.mjs in turn: its Political Briefing store is written
//      there, and daily-synopsis/scripts/build.mjs builds the day at 08:20 UTC, as the first scheduled run would.
//   2. At 12:20 UTC the same day, the draft is given: 16 November none (the day keeps its rules-only digest, with the
//      line saying the written digest is not available), 17 November the hand-written good draft (draft-good.json:
//      published, with two written 5 Sided Analyses), 18 November a hand-written draft the check refuses
//      (draft-refused.json: reported speech in its lead).
//   3. The days, their inputs and the index are copied to tests/fixtures/daily-synopsis/data, replacing what was there.
// Inputs: fixture.mjs, draft-good.json, draft-refused.json, the build. tests/daily-synopsis.test.mjs checks that the
// committed fixture days are what this makes.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DAYS, fixtureStore } from './fixture.mjs';
import { build } from '../../../daily-synopsis/scripts/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DRAFTS = { '2026-11-16': null, '2026-11-17': join(HERE, 'draft-good.json'), '2026-11-18': join(HERE, 'draft-refused.json') };

/** Builds the fixture days into `dataDir` (a new folder), from stores written in `storesDir`. */
export async function makeFixture(dataDir, storesDir) {
  for (const day of DAYS) {
    mkdirSync(join(storesDir, 'briefing/data'), { recursive: true });
    writeFileSync(join(storesDir, 'briefing/data/latest.json'), JSON.stringify(fixtureStore(day)));
    const quiet = () => {};
    const first = await build({ now: Date.parse(`${day}T08:20:00Z`), today: day, dataDir, storesDir, log: quiet });
    if (!first.wrote.length) throw new Error(`${day}: the first run built nothing`);
    if (DRAFTS[day]) await build({ now: Date.parse(`${day}T12:20:00Z`), today: day, draftFile: DRAFTS[day], dataDir, storesDir, log: quiet });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tmp = mkdtempSync(join(tmpdir(), 'ds-fixture-'));
  try {
    await makeFixture(join(tmp, 'data'), join(tmp, 'stores'));
    const out = join(HERE, 'data'), old = join(HERE, 'data.old');
    if (existsSync(old)) rmSync(old, { recursive: true });
    if (existsSync(out)) renameSync(out, old);
    cpSync(join(tmp, 'data'), out, { recursive: true });
    if (existsSync(old)) rmSync(old, { recursive: true });
    console.log(`Wrote ${out}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
