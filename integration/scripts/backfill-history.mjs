// Rebuilds each briefing's history.json from every version of its store committed to this repository (git show), then
// writes its summaries (heads.mjs), so headline trends do not have to wait weeks for history to accrue. Run by hand,
// once, from the repository's root; never in a workflow (a refresh's checkout has no history to read).
//
//   node integration/scripts/backfill-history.mjs [<briefing key>…]     (scientific, economics, digital, political)
//
// The versions are accrued oldest first by the same rule as every refresh (design/prp-trends.js, accrue): every story collected for
// a UTC day while a store held the whole day counts for that day, once; a day is held in full when the store was
// already running when the day began (its first committed version) and a store made no later than the lateness limit
// after the day ended held all of it. Days before the first committed store, and stories a feed had already dropped
// during an outage, cannot be filled in; such days do not count, and the weeks that hold them do not count either.
// The working tree's store is accrued last, so a store not yet committed is not lost. Rewrites history.json, trends.json
// and the head of each briefing it rebuilds.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRIEFINGS, snapshot, writeHeads, ROOT } from './heads.mjs';
import { accrue, emptyHistory, LATE_HOURS } from '../../design/prp-trends.js';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 30, encoding: 'utf8' });
const want = process.argv.slice(2);
for (const b of BRIEFINGS.filter(x => !want.length || want.includes(x.key))) {
  const versions = git('log', '--format=%H', '--reverse', '--', b.store).trim().split('\n').filter(Boolean);
  let history = emptyHistory(), first = null, n = 0;
  for (const h of versions) {
    let s;
    try { s = JSON.parse(git('show', `${h}:${b.store}`)); } catch { continue; }
    if (!s?.generated || !Array.isArray(s.items)) continue;
    first ||= s.generated;
    history = accrue(history, snapshot(b, s), { lateHours: LATE_HOURS[b.key] });
    n++;
  }
  const here = join(ROOT, b.store);
  if (existsSync(here)) history = accrue(history, snapshot(b, JSON.parse(readFileSync(here, 'utf8'))), { lateHours: LATE_HOURS[b.key] });
  const hp = join(ROOT, b.dir, 'history.json');
  const rebuilt = { at: new Date().toISOString().slice(0, 10), versions: n, from: first, note: 'Rebuilt from the versions of the store committed to the repository. From 12 November 2026 the briefings merge repeated titles, which lowers the counts slightly.' };
  // The summaries are written next (writeHeads), which stamps history.json with the store it read.
  writeFileSync(hp, JSON.stringify({ summaryOf: {}, briefing: b.key, rebuilt, history }));
  const days = Object.entries(history.days), ok = days.filter(([, d]) => d.ok).map(([k]) => k);
  console.log(`${b.name}: ${n} versions from ${first}; ${days.length} days, ${ok.length} held in full (${ok[0] || '–'} to ${ok.at(-1) || '–'}).`);
  writeHeads(b.store, { quiet: true });
}
