// Daily Synopsis build (Omni News · Daily Synopsis): the day's major stories by rules, and the scheduled Claude run's
// draft, once the check has passed it. Run by .github/workflows/daily-synopsis.yml, and by hand:
//   node daily-synopsis/scripts/build.mjs [--draft <file>] [--now <ISO time>] [--data <dir>] [--stores <dir>]
// --draft   the day's draft, as the scheduled Claude run wrote it (the workflow fetches it from the drafts branch to a
//           file outside the repository; it is never committed to main)
// --now     the time of the run (default: now); the tests use it
// --data    where the days are kept (default daily-synopsis/data); --stores, the folder holding the four briefings'
//           stores and design/prp-access.json (default: this repository)
//
// Order of steps. Nothing is written until every step has worked, and then each file through a temporary file:
//   1. The day is the run's UTC date. A day before the newest day already kept, or before today, is never built, and a
//      kept day whose date has passed is never opened for writing again (a correction is added by correct.mjs, as a
//      dated note in corrections.json, which the page shows beside the day's text).
//   2. The input. A day's input, once written, is kept as it is, so a draft always answers the input it was written
//      from. Not written yet: built now from the stores, if the Political Briefing's store was refreshed on the day (its
//      `generated` on that UTC date) or the run is at 20:00 UTC or later; otherwise the run stops, writing nothing, and
//      a later run builds it. The 24 hours end at the store's own `generated`, so one day's window ends where the next
//      one's begins; when the store is more than 24 hours old they end at the run, and the day says how old it is.
//   3. The day's file. Not written yet: the rules-only digest, from the input.
//   4. The draft. Given, and the day's written digest not yet published: checked (daily-synopsis/lib/check.mjs). It
//      passes: its text is published in the day's file. It is refused: the day keeps its rules-only digest, with the
//      one plain line saying the written digest is not available, and the refusal's codes and places (never its words).
//   5. Each file to write is checked: JSON that reads back the same, and no larger than 1.5 MB gzipped.
//   6. The files are written (input, day, corrections.json the first time, empty, then the index of all days,
//      rebuilt from the days folder and corrections.json).
// Inputs: briefing/data/latest.json, science/briefing/data/stories.json, econ/briefing/data/stories.json,
// digital/briefing/data/stories.json (the four Omni News briefings' stores, read, never changed), design/prp-access.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import '../../design/prp-access.js'; // globalThis.PRPAccess
import { selectStories, makeInput, rulesDay, withDraft, indexOf, utcDay, CORRECTIONS_FORMAT } from '../lib/day.mjs';
import { checkDraft, MESSAGES } from '../lib/check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_GZIP = 1.5e6;

// `today` is the real UTC date (the tests give their own): a kept day before it has passed, whatever `now` says.
export async function build({ now = Date.now(), today = utcDay(Date.now()), draftFile = null, dataDir = join(ROOT, 'daily-synopsis/data'), storesDir = ROOT, log = console.log } = {}) {
  const J = p => JSON.parse(readFileSync(p, 'utf8'));
  const day = utcDay(now), stamp = new Date(now).toISOString();
  const daysDir = join(dataDir, 'days'), inputDir = join(dataDir, 'input');
  const kept = existsSync(daysDir) ? readdirSync(daysDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort() : [];
  // 1. The day.
  if (kept.length && day < kept[kept.length - 1]) { log(`${day} is before the newest day kept (${kept[kept.length - 1]}): nothing is built.`); return { wrote: [], day }; }
  const dayPath = join(daysDir, `${day}.json`), inputPath = join(inputDir, `${day}.json`);
  // A day that has passed is never built or written again (nor made afterwards from stores that have moved on).
  if (day < today) { log(`${day} has passed: it is never built or written again.`); return { wrote: [], day }; }
  const writes = new Map(); // path → text

  // 2. The input.
  let input;
  if (existsSync(inputPath)) input = J(inputPath);
  else {
    const S = p => (existsSync(join(storesDir, p)) ? J(join(storesDir, p)) : null);
    const political = S('briefing/data/latest.json');
    if (!political || !Array.isArray(political.items)) throw new Error('The Political Briefing\'s store could not be read.');
    const storeAt = Date.parse(political.generated);
    if (utcDay(storeAt) !== day && new Date(now).getUTCHours() < 20) { log(`The Political Briefing's store is from ${political.generated}, not ${day}: waiting for its refresh; nothing is written.`); return { wrote: [], day, waiting: true }; }
    const stores = [political, S('science/briefing/data/stories.json'), S('econ/briefing/data/stories.json'), S('digital/briefing/data/stories.json')];
    const access = existsSync(join(storesDir, 'design/prp-access.json')) ? globalThis.PRPAccess.table(J(join(storesDir, 'design/prp-access.json'))) : null;
    const ref = Number.isFinite(storeAt) && now - storeAt <= 24 * 36e5 && storeAt <= now + 36e5 ? storeAt : now;
    const stories = selectStories(stores, { ref, access });
    input = await makeInput(stories, { day, ref, storeGenerated: political.generated, generated: stamp });
    writes.set(inputPath, JSON.stringify(input, null, 1) + '\n');
    log(`${day}: ${stories.length} major stories in the 24 hours to ${new Date(ref).toISOString()}; ${input.stories.filter(s => s.written5).length} get a written analysis.`);
  }

  // 3. The day.
  let dayDoc = existsSync(dayPath) ? J(dayPath) : rulesDay(input, { generated: stamp });
  if (dayDoc.input !== input.id) throw new Error(`${day}: the day's file was made from another input than ${input.id}.`);

  // 4. The draft.
  if (draftFile && existsSync(draftFile)) {
    if (dayDoc.written.status === 'published') log(`${day}: the written digest is already published; the draft is not looked at.`);
    else {
      const text = readFileSync(draftFile, 'utf8');
      const result = checkDraft(input, text);
      const draft = result.ok ? JSON.parse(text) : null;
      dayDoc = withDraft(dayDoc, input, draft, result, { checked: stamp });
      if (result.ok) {
        const refused = Object.entries(result.five).filter(([, f]) => f && !f.ok);
        log(`${day}: the draft passed the check and is published.${refused.length ? ` Written analyses refused: ${refused.map(([id, f]) => `${id} (${f.reasons.map(r => `${MESSAGES[r.code]} ${r.where}`).join('; ')})`).join(', ')}.` : ''}`);
      } else log(`${day}: the draft was refused: ${result.reasons.map(r => `${MESSAGES[r.code] || r.code} (${r.where || 'the draft'})`).join('; ')}`);
    }
  } else if (draftFile) log(`${day}: no draft at ${draftFile}.`);
  const dayText = JSON.stringify(dayDoc, null, 1) + '\n';
  if (!existsSync(dayPath) || readFileSync(dayPath, 'utf8') !== dayText) writes.set(dayPath, dayText);

  // The index, rebuilt from the days kept and this one.
  const days = [...new Set([...kept, day])].map(d => (d === day ? dayDoc : J(join(daysDir, `${d}.json`))));
  const corrPath = join(dataDir, 'corrections.json');
  // corrections.json: written by correct.mjs; the first build writes it empty, so the page always finds it.
  const corrDoc = existsSync(corrPath) ? J(corrPath) : { format: CORRECTIONS_FORMAT, generated: null, notes: [] }, corrections = corrDoc.notes;
  if (!existsSync(corrPath)) writes.set(corrPath, JSON.stringify(corrDoc, null, 1) + '\n');
  const generated = [...days.map(d => d.updated), corrDoc.generated].filter(Boolean).sort().pop();
  const indexPath = join(dataDir, 'index.json'), indexText = JSON.stringify(indexOf(days, { generated, corrections }), null, 1) + '\n';
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== indexText) writes.set(indexPath, indexText);

  // 5. Each file checked before anything is written.
  for (const [p, t] of writes) {
    if (JSON.stringify(JSON.parse(t), null, 1) + '\n' !== t) throw new Error(`${p}: does not read back the same`);
    const gz = gzipSync(t).length;
    if (gz > MAX_GZIP) throw new Error(`${p}: ${gz} bytes gzipped, over ${MAX_GZIP}`);
  }
  // A kept day whose date has passed is never written again (step 1); this holds it whatever the code above did.
  for (const p of writes.keys()) {
    const m = p.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    if (m && (p.startsWith(daysDir) || p.startsWith(inputDir)) && m[1] !== day) throw new Error(`${p}: a past day is never rewritten`);
  }
  // 6. Write.
  for (const [p, t] of writes) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p + '.tmp', t);
    renameSync(p + '.tmp', p);
  }
  log(writes.size ? `Wrote ${[...writes.keys()].map(p => p.slice(dataDir.length + 1).replace(/\\/g, '/')).join(', ')}.` : 'Nothing changed.');
  return { wrote: [...writes.keys()], day, input, dayDoc };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const now = arg('--now') ? Date.parse(arg('--now')) : Date.now();
  if (!Number.isFinite(now)) { console.error('--now: not a time'); process.exit(2); }
  build({ now, draftFile: arg('--draft') || null, dataDir: arg('--data') ? resolve(arg('--data')) : undefined, storesDir: arg('--stores') ? resolve(arg('--stores')) : undefined })
    .catch(e => { console.error(e.message); process.exit(1); });
}
