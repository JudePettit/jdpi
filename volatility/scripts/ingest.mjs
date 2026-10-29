// Geopolitical Volatility Index (GVI) for JDP-I — a port of the GTTS method "gvi-1.1" to a static daily build.
//   node volatility/scripts/ingest.mjs [--days 14] [--reindex]
// For each UTC day of the look-back window (the --days days ending yesterday) that has no complete stored file, oldest
// first: download GDELT 2.0's 96 quarter-hour event exports, keep events with a country location, and score five
// components per country:
//   conflict & security 35% (CAMEO 17–20) · political escalation 20% (10–13, 15, 16 excl. 162/163) · civil unrest 20%
//   (14) · economic disruption 10% (162/163) · cross-border spread 15% (conflict/political events between actors of
//   different countries).
// Intensity = Σ(0.1 + max(0, −Goldstein)/10) over a component's events ÷ all the country's events that day. Each
// component is ranked (mid-rank percentile) against all sufficiently covered country-days in the trailing 90 stored
// days; the score is the weighted sum, shrunk toward the day's evidence-weighted global mean by events/(events+75).
// Coverage: insufficient <25 events or <5 sources; low; medium ≥75 & 12; high ≥300 & 40. The baseline needs ≥7 days.
// A day with fewer than 72 of its 96 slices, or with its slices but too few located events or countries (GDELT published
// near-empty files, or its format or the FIPS table changed), is not written: it is a warning, and the day is tried again
// by each run while it is in the window; a stored day file that is short, thin or unreadable is fetched again whatever
// its age. The run fails only when such a day left it with nothing to write, so a change in GDELT's format shows on the
// first night while one bad day holds up nothing after it. While fewer than 7 complete days are stored, the window is
// at least 14 days, so a fresh store can fill its baseline. Writes volatility/data/days/<day>.json and, only when a day
// file changed (or with --reindex), volatility/data/index.json, so a run that finds nothing new changes nothing. The
// method's code is in gvi.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS, MIN_SLOTS, BASELINE_DAYS, MIN_BASELINE, ymd, addDays, unzipFirst, slotUrl, fetchDay, mergeDay, thinDay, dayProblem, daysToIngest, scoreDay, buildIndex, pruneBefore } from './gvi.mjs';

const ROOT = fileURLToPath(new URL('../data/', import.meta.url));
const DAYS_DIR = join(ROOT, 'days'), INDEX = join(ROOT, 'index.json');
const UA = { 'User-Agent': 'JDP-I Geopolitical Volatility (https://jdpi.pages.dev)' };
const argDays = process.argv.indexOf('--days');
const LOOKBACK = argDays > 0 ? +process.argv[argDays + 1] : 14;
const REINDEX = process.argv.includes('--reindex');
const stop = message => Object.assign(new Error(message), { stop: true }); // a failure that explains itself (no stack)

// A slice's text, null when GDELT has not published it (404), or undefined when 3 tries of up to 60 s each failed.
async function fetchSlot(day, slot) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(slotUrl(day, slot), { headers: UA, signal: AbortSignal.timeout(60e3) });
      if (r.status === 404) return null;
      if (r.ok) return unzipFirst(Buffer.from(await r.arrayBuffer()));
    } catch {}
    if (i < 2) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return undefined;
}

const storedDays = () => readdirSync(DAYS_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, 10)).sort();
const loadDay = d => JSON.parse(readFileSync(join(DAYS_DIR, d + '.json'), 'utf8'));
const complete = d => { try { return !dayProblem(loadDay(d)); } catch { return false; } };
let removed = 0, thinDays = [];

// Fetch, check, score and write one day: true when it was written, false when GDELT had too few of its slices or they
// held too little.
async function ingestDay(day) {
  const { ok, missing, failed, byCountry } = await fetchDay(day, fetchSlot);
  const file = join(DAYS_DIR, day + '.json');
  if (ok < MIN_SLOTS) {
    console.log(`::warning title=Volatility ${day}::Only ${ok}/${SLOTS} GDELT slices (${missing} not published, ${failed} failed), so the day is not written; it is tried again while it is in the ${LOOKBACK}-day look-back window.`);
    if (existsSync(file)) { unlinkSync(file); removed++; } // this day's stored file was short, thin or unreadable
    return false;
  }
  const merged = mergeDay(byCountry);
  const thin = thinDay(Object.values(merged).reduce((t, m) => t + m.n, 0), Object.keys(merged).length);
  if (thin) {
    console.log(`::warning title=Volatility ${day}::${ok}/${SLOTS} GDELT slices but ${thin}: either GDELT published near-empty files for this day, or its format or the FIPS table changed. The day is not written; it is tried again while it is in the look-back window.`);
    if (existsSync(file)) { unlinkSync(file); removed++; }
    thinDays.push(day);
    return false;
  }
  // Trailing baseline: the complete stored days of the 90 before this one, read one at a time.
  const from = addDays(day, -(BASELINE_DAYS - 1)), prior = storedDays().filter(d => d >= from && d < day);
  const x = scoreDay(day, merged, { ok, missing, failed }, (function* () { for (const d of prior) { const p = loadDay(d); if (!dayProblem(p)) yield p; } })());
  writeFileSync(file, JSON.stringify(x));
  console.log(`${day}: ${ok}/${SLOTS} slices, ${Object.keys(x.countries).length} countries, ${Object.values(x.countries).filter(c => c.score != null).length} scored, baseline ${x.baselineDays} days`);
  return true;
}

async function main() {
  if (!(Number.isInteger(LOOKBACK) && LOOKBACK >= 1)) throw stop(`--days must be a positive integer (got ${process.argv[argDays + 1]})`);
  mkdirSync(DAYS_DIR, { recursive: true });
  // ---- Days of the look-back window without a complete stored file, oldest first (the baseline must be built in order).
  // A day counts as over 45 minutes after midnight UTC, once GDELT has published its last slice.
  const yesterday = addDays(ymd(new Date(Date.now() - 45 * 60e3)), -1);
  // A store with too few complete days for a baseline looks back at least two weeks, so one short day cannot keep it from
  // ever scoring. Any stored day that is short, thin or unreadable is fetched again too, whatever its age.
  const lookback = storedDays().filter(complete).length < MIN_BASELINE ? Math.max(LOOKBACK, 14) : LOOKBACK;
  const targets = [...new Set([...storedDays().filter(d => !complete(d)), ...daysToIngest(yesterday, lookback, complete)])].sort();
  let wrote = 0;
  for (const d of targets) if (await ingestDay(d)) wrote++;
  // A thin day is only a failure when it left the run with nothing to write: then it is most likely a change in GDELT's
  // format or the FIPS table, which every later day would show too.
  const thinStop = () => { if (thinDays.length && !wrote) throw stop(`${thinDays.join(', ')}: too few located events or countries (see the warning above), and nothing else was there to write.`); };

  // ---- index.json, rebuilt only when the day files changed (or with --reindex), so its `generated` time is that of the
  // newest data. Day files older than the baseline window are then pruned; their rows live on in the index.
  const stored = storedDays();
  const prev = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : null;
  if (prev && !wrote && !removed && !REINDEX && prev.latest === stored.at(-1)) {
    console.log(`No day written; index.json unchanged (latest ${prev.latest})`);
    thinStop();
    return;
  }
  const index = buildIndex(prev, stored, loadDay, new Date().toISOString());
  writeFileSync(INDEX, JSON.stringify(index));
  for (const d of stored) if (d < pruneBefore(index.latest)) unlinkSync(join(DAYS_DIR, d + '.json'));
  console.log(`index: ${index.days} days, ${Object.keys(index.countries).length} countries, latest ${index.latest}`);
  thinStop();
}

await main().catch(e => {
  console.log(`::error title=Volatility::${e.message}`);
  if (!e.stop) console.error(e.stack);
  process.exitCode = 1;
});
