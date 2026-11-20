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
// days, and the percentile shrunk toward 50 by events/(events+75) (gvi-1.2, 15 November 2026: a few reports cannot make
// an extreme component); the score is the weighted sum, shrunk toward the day's evidence-weighted global mean by the same.
// Coverage: insufficient <25 events or <5 sources; low; medium ≥75 & 12; high ≥300 & 40. The baseline needs ≥7 days.
// A day with fewer than 72 of its 96 slices, or with its slices but too few located events or countries (GDELT published
// near-empty files, or its format or the FIPS table changed), is not written: it is a warning, and the day is tried again
// by each run while it is in the window; a stored day file that is short, thin or unreadable is fetched again whatever
// its age. The run fails only when such a day left it with nothing to write, so a change in GDELT's format shows on the
// first night while one bad day holds up nothing after it. While fewer than 7 complete days are stored, the window is
// at least 14 days, so a fresh store can fill its baseline. Writes volatility/data/days/<day>.json and, only when a day
// file changed (or with --reindex), volatility/data/index.json, so a run that finds nothing new changes nothing. The
// method's code is in gvi.mjs. With --rescore, every stored day file is scored again, oldest first, from what it keeps of
// each country (no download), and the index rebuilt: for a change of method. Each day's row in the index records the
// method that scored it and its baseline's days, as the day file says (buildIndex), so a change of method shows by day.
// The kept days (stage S5c of the Omni-Map, 20 November 2026): each time index.json is written, every country's day rows
// are also written to volatility/data/kept/<year>.json as [day, score, coverage initial, method] (keepDays), before the
// index's 365-day cut can drop them: a day once kept is never removed there, and a day scored again (--rescore) keeps
// its newer row. The Omni-Map's Volatility layer is built from these files (omni/scripts/build-gvi.mjs). With
// --keep-only, nothing is downloaded or scored: the kept files are brought up to date from index.json as it stands.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS, MIN_SLOTS, BASELINE_DAYS, MIN_BASELINE, ymd, addDays, unzipFirst, slotUrl, fetchDay, mergeDay, thinDay, dayProblem, daysToIngest, scoreDay, rescoreDay, buildIndex, pruneBefore } from './gvi.mjs';
import { writeHeads } from '../../integration/scripts/heads.mjs';

const ROOT = fileURLToPath(new URL('../data/', import.meta.url));
const DAYS_DIR = join(ROOT, 'days'), INDEX = join(ROOT, 'index.json'), KEPT_DIR = join(ROOT, 'kept');

/** The kept days of one year after an index (pure): prev, the year's kept file or null; index, index.json as written.
    Every day of prev stays; each of the index's rows of that year is put in (a day scored again replaces its row).
    Rows are [day, score, coverage initial, method]; the method is the day's own (the index's global row), else null. */
export function keepDays(prev, index, year) {
  const method = new Map((index.global || []).map(g => [g[0], g[4] ?? null]));
  const out = { format: 'vm-gvi-kept/1', of: 'volatility/data/index.json', year, about: 'Each country’s Volatility score by day, kept by volatility/scripts/ingest.mjs before index.json’s 365-day cut: [day, score (null: too little coverage to score), coverage (h high, m medium, l low, i insufficient), method]. A day once kept is never removed.', countries: {} };
  const put = (iso, name, row) => { const c = (out.countries[iso] ||= { name, days: new Map() }); c.name = name || c.name; c.days.set(row[0], row); };
  for (const [iso, c] of Object.entries(prev?.countries || {})) for (const r of c.days) put(iso, c.name, r);
  for (const [iso, c] of Object.entries(index.countries || {})) for (const r of c.days || []) if (String(r[0]).startsWith(`${year}-`)) put(iso, c.name, [r[0], r[1] ?? null, r[5] ?? null, method.get(r[0]) ?? null]);
  for (const iso of Object.keys(out.countries).sort()) { const c = out.countries[iso]; delete out.countries[iso]; out.countries[iso] = { name: c.name, days: [...c.days.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) }; }
  return out;
}
/** Writes the kept file of every year the index holds a day of; a file whose rows did not change is left as it is. */
function writeKept(index) {
  mkdirSync(KEPT_DIR, { recursive: true });
  const years = [...new Set((index.global || []).map(g => String(g[0]).slice(0, 4)))].sort();
  for (const y of years) {
    const file = join(KEPT_DIR, `${y}.json`), prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const next = JSON.stringify(keepDays(prev, index, +y)) + '\n';
    if (!prev || next !== readFileSync(file, 'utf8')) writeFileSync(file, next);
  }
}
const UA = { 'User-Agent': 'JDP-I Geopolitical Volatility (https://jdpi.pages.dev)' };
const argDays = process.argv.indexOf('--days');
const LOOKBACK = argDays > 0 ? +process.argv[argDays + 1] : 14;
const RESCORE = process.argv.includes('--rescore'), REINDEX = RESCORE || process.argv.includes('--reindex');
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

// Every stored day file scored again with this method, oldest first, each against the days before it as rescored.
function rescoreAll() {
  const done = new Map(), stored = storedDays().filter(complete);
  for (const d of stored) {
    const from = addDays(d, -(BASELINE_DAYS - 1)), x = rescoreDay(loadDay(d), stored.filter(p => p >= from && p < d).map(p => done.get(p)));
    done.set(d, x);
    writeFileSync(join(DAYS_DIR, d + '.json'), JSON.stringify(x));
  }
  console.log(`rescored ${stored.length} stored days with ${done.size ? [...done.values()][0].method : '-'}`);
}

async function main() {
  if (!(Number.isInteger(LOOKBACK) && LOOKBACK >= 1)) throw stop(`--days must be a positive integer (got ${process.argv[argDays + 1]})`);
  if (process.argv.includes('--keep-only')) {
    if (!existsSync(INDEX)) throw stop('--keep-only: there is no index.json to keep the days of');
    writeKept(JSON.parse(readFileSync(INDEX, 'utf8')));
    console.log(`kept: ${readdirSync(KEPT_DIR).join(', ')}`);
    return;
  }
  mkdirSync(DAYS_DIR, { recursive: true });
  if (RESCORE) rescoreAll();
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
  writeKept(index); // every day row of the index kept, before a later index's 365-day cut drops it (the Omni-Map's layer 9)
  writeHeads(INDEX); // index.head.json (the Dashboard's movers) in step with it (integration/scripts/heads.mjs)
  for (const d of stored) if (d < pruneBefore(index.latest)) unlinkSync(join(DAYS_DIR, d + '.json'));
  console.log(`index: ${index.days} days, ${Object.keys(index.countries).length} countries, latest ${index.latest}`);
  thinStop();
}

// Run as a script (the refresh, the tests' copy); imported, it only lends keepDays.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(e => {
  console.log(`::error title=Volatility::${e.message}`);
  if (!e.stop) console.error(e.stack);
  process.exitCode = 1;
});
