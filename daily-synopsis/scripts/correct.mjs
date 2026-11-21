// Daily Synopsis: a correction to a kept day, as a dated note. A day's file is never opened again once its date has
// passed (build.mjs), so a correction never changes the day's text: it is added to daily-synopsis/data/corrections.json,
// and the page shows it, with its date, beside the day (or the story) it corrects. Run by hand, by the owner or a session
// he asks:
//   node daily-synopsis/scripts/correct.mjs --day 2026-11-21 [--story s3] [--date 2026-11-22] --text "<the note>"
// --date is the note's date (default: today, UTC). The text is VM's own words: plain text, at most 500 characters, with
// no link, no markup and no quotation mark.
// Order of steps. Nothing is written until every step has worked, and then each file through a temporary file:
//   1. corrections.json is read (none yet: an empty list), and the days kept are listed from the days folder.
//   2. The note is checked (lib/day.mjs correctionNote): a day kept, a date on or after it, the text's rules.
//   3. The note is added at the end of the list (no note is ever changed or taken out), and the index is rebuilt with
//      each day's count of notes.
//   4. Both files are checked to read back the same, then written: corrections.json, then index.json.
// Inputs: daily-synopsis/data/corrections.json, daily-synopsis/data/days/*.json, daily-synopsis/data/index.json.
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { correctionNote, indexOf, utcDay, CORRECTIONS_FORMAT } from '../lib/day.mjs';
import { hasLink, hasMarkup, hasQuote } from '../lib/check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkText = t => (hasLink(t) ? 'a link' : hasMarkup(t) ? 'markup' : hasQuote(t) ? 'a quotation mark' : null);

export function correct({ day, story = null, date = utcDay(Date.now()), text, dataDir = join(ROOT, 'daily-synopsis/data'), now = Date.now() }) {
  const J = p => JSON.parse(readFileSync(p, 'utf8'));
  const corrPath = join(dataDir, 'corrections.json'), indexPath = join(dataDir, 'index.json'), daysDir = join(dataDir, 'days');
  // 1.
  const doc = existsSync(corrPath) ? J(corrPath) : { format: CORRECTIONS_FORMAT, generated: null, notes: [] };
  const kept = readdirSync(daysDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
  // 2.
  const note = correctionNote({ day, date, story, text }, { days: kept, checkText });
  if (story && !J(join(daysDir, `${day}.json`)).stories.some(s => s.id === story)) throw new Error(`${day} has no story ${story}`);
  // 3.
  const stamp = new Date(now).toISOString();
  const next = { format: CORRECTIONS_FORMAT, generated: stamp, notes: [...doc.notes, { ...note, added: stamp }] };
  const days = kept.map(d => J(join(daysDir, `${d}.json`)));
  const index = indexOf(days, { generated: [stamp, ...days.map(d => d.updated)].sort().pop(), corrections: next.notes });
  // 4.
  const files = [[corrPath, JSON.stringify(next, null, 1) + '\n'], [indexPath, JSON.stringify(index, null, 1) + '\n']];
  for (const [p, t] of files) if (JSON.stringify(JSON.parse(t), null, 1) + '\n' !== t) throw new Error(`${p}: does not read back the same`);
  for (const [p, t] of files) { writeFileSync(p + '.tmp', t); renameSync(p + '.tmp', p); }
  return note;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const note = correct({ day: arg('--day'), story: arg('--story') || null, date: arg('--date') || undefined, text: arg('--text') });
    console.log(`Added a correction dated ${note.date} to ${note.day}${note.story ? ` (${note.story})` : ''}.`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
