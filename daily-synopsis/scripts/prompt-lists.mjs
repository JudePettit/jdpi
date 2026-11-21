// Daily Synopsis: writes the check's own word lists into the scheduled run's instructions (daily-synopsis/PROMPT.md), so
// the model is told exactly what the check refuses, from the same file the check reads.
//   node daily-synopsis/scripts/prompt-lists.mjs
// Order of steps. Nothing is written until every step has worked:
//   1. daily-synopsis/lib/check-words.json (through lib/check.mjs) and daily-synopsis/PROMPT.md are read.
//   2. Each list named in a marker pair, <!-- list:NAME --> … <!-- /list -->, gets its words, comma separated, between
//      the two markers; a marker naming no list, or a list with no marker, stops the run.
//   3. PROMPT.md is written through a temporary file, and only when its text has changed.
// Inputs: check-words.json and PROMPT.md. tests/daily-synopsis.test.mjs checks that PROMPT.md is what this writes.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDS } from '../lib/check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT = join(HERE, '../PROMPT.md');
/** The lists PROMPT.md carries, by their name in check-words.json. */
export const LISTS = ['openers', 'commonWordNames', 'reportedSpeech', 'judgement', 'judgementEverywhere', 'journalist', 'instructionLike', 'closingSame', 'closingDiffer',
  'supportWords', 'numberWords', 'dateNames', 'relativeDates', 'outletCommonWords'];
const MARK = /<!-- list:([A-Za-z]+) -->[^]*?<!-- \/list -->/g;

/** A list as PROMPT.md shows it: its words, comma separated (for numberWords, the words without their figures). */
export const listText = name => (Array.isArray(WORDS[name].words) ? WORDS[name].words : Object.keys(WORDS[name].words)).join(', ');
/** The words between a list's markers in a text, or null. */
export function listBlock(text, name) {
  const m = text.match(new RegExp(`<!-- list:${name} -->([^]*?)<!-- /list -->`));
  return m ? m[1] : null;
}
/** The text with every list put between its markers. Throws on a marker naming no list, or a list with no marker. */
export function withLists(text) {
  const seen = new Set();
  const out = text.replace(MARK, (all, name) => {
    if (!LISTS.includes(name)) throw new Error(`PROMPT.md: no list called ${name}`);
    seen.add(name);
    return `<!-- list:${name} -->${listText(name)}<!-- /list -->`;
  });
  for (const name of LISTS) if (!seen.has(name)) throw new Error(`PROMPT.md: no marker for the list ${name}`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const before = readFileSync(PROMPT, 'utf8');
  const after = withLists(before);
  if (after === before) console.log('PROMPT.md already carries the lists.');
  else {
    const tmp = `${PROMPT}.tmp`;
    writeFileSync(tmp, after);
    renameSync(tmp, PROMPT);
    console.log(`Wrote ${PROMPT}`);
  }
}
