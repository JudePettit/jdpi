// Daily Synopsis: the check, run by the draft's writer before it pushes (PROMPT.md, "Check before you push"). It says
// which sentences the check refuses and why, and, for the support rule, which words it found in none of the items
// cited, so the writer can mend them and run it again.
//   node daily-synopsis/scripts/check-draft.mjs <draft file> [--input <input file>]
// --input   the day's input file (default: daily-synopsis/data/input/<the draft's day>.json)
// Order of steps. It writes nothing:
//   1. The draft is read as text, and the input file as JSON.
//   2. lib/check.mjs checkDraft checks the draft against the input, as the daily workflow will.
//   3. Each refusal is printed on its own line: its place, its fixed message, and for the support rule the words not
//      found. Exit code 0 when the digest passes (a written analysis may still be refused: its lines say so), 1 when
//      the whole draft is refused, 2 when a file cannot be read.
// This prints the draft's own words (the unsupported ones). It is for the writer's own run only: the daily workflow
// never runs it, and build.mjs logs codes and places alone.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDraft, MESSAGES } from '../lib/check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The lines the writer is shown for a check's result. */
export function report(result) {
  const line = r => `  ${r.where || 'the draft'}: ${MESSAGES[r.code] || r.code}${r.detail ? ` Not in the items cited: ${r.detail.join(', ')}.` : ''}`;
  if (!result.ok) return ['REFUSED: nothing of this draft would be published. Mend these sentences and check again:', ...result.reasons.map(line)];
  const out = ['PASSED: the lead and every story’s sentences would be published.'];
  for (const [id, f] of Object.entries(result.five)) {
    if (!f) continue;
    out.push(f.ok ? `  ${id}: its written 5 Sided Analysis passes.` : `  ${id}: its written 5 Sided Analysis is refused (the story keeps its headlines alone). Mend these and check again:`);
    if (!f.ok) out.push(...f.reasons.map(r => `  ${line(r)}`));
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const draftFile = process.argv[2];
  try {
    if (!draftFile || !existsSync(draftFile)) throw new Error('Give the draft file: node daily-synopsis/scripts/check-draft.mjs <draft file> [--input <input file>]');
    const text = readFileSync(draftFile, 'utf8');
    let day = null;
    try { day = JSON.parse(text).day; } catch { /* the check says it is not JSON */ }
    const inputFile = arg('--input') || (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? join(ROOT, 'daily-synopsis/data/input', `${day}.json`) : null);
    if (!inputFile || !existsSync(inputFile)) throw new Error('The day’s input file was not found: give it with --input.');
    const result = checkDraft(JSON.parse(readFileSync(inputFile, 'utf8')), text);
    console.log(report(result).join('\n'));
    process.exit(result.ok ? 0 : 1);
  } catch (e) { console.error(e.message); process.exit(2); }
}
