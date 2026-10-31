// Builds one book of the Bibliotheca shelf (shelf.mjs) from its Project Gutenberg plain-text file:
//   1. checks the rights finding (both US and UK must be "pd", and the dates must bear it out), else stops;
//   2. downloads the UTF-8 text (kept in scripts/cache/, which is not committed) unless --source gives a local file;
//   3. cuts the Gutenberg header, footer and licence, splits chapters and paragraphs, sets the typography (text.mjs,
//      and splitWork below for the books text.mjs's one level of chapters does not fit);
//   4. tags every paragraph with the Encyclopaedia's terms (tag-terms.mjs) and prints the tagging report;
//   5. writes bibliotheca/data/books/<slug>.json and the shelf index bibliotheca/data/index.json.
//   node bibliotheca/scripts/build-book.mjs <slug> [--refresh] [--source <file>] [--no-tag]
//     --refresh   download the text again even though the cache has it
//     --source    read the Gutenberg file from this path instead of downloading
//     --no-tag    write the book with no terms (the tagger runs later: tag-terms.mjs <slug>)
//
// The data contract, shared by every Bibliotheca script and page:
//   bibliotheca/data/books/<slug>.json = {
//     slug, title,
//     author: { name, qid, born, died },
//     translator: { name, died } | null,
//     editors?: [ { name, died, role } ],      others whose words the edition carries (an editor's notes, a preface)
//     set?: { slug, title, volume, volumes },  one volume of a work the shelf has in several (The Decline and Fall)
//     work: { qid, written, published },      the work itself (published is the year the era rule uses)
//     era: [from, to],                          the years the book is about, for the screens that take a period
//     edition: { source, id, url, published, licence },
//     rights: { us, uk, basis, checked },
//     generated,
//     chapters: [ { n, heading, title, part?, words, paragraphs: [ { id, kind, note?, text, terms: [ { s, e, qid, label } ] } ] } ]
//   }
//   where n is the chapter's number, unique in the book and rising in reading order: the book's own chapter number when
//   it numbers its chapters once through (The Prince, Thucydides, Darwin, Gibbon across his six volumes), what comes
//   before chapter 1 being chapter 0 (several pieces there share it, each under a heading paragraph of its own); and
//   book × 100 + chapter when the chapters are numbered within books (Smith, Clausewitz: Book II, Chapter III is 203,
//   Book II's own introduction 200, the pieces before Book I 0, 1, 2 …). part is the book a chapter belongs to,
//   { n, heading: 'Book II', title }; heading names both ('Book II, Chapter III'). kind is 'para', 'note' (a footnote,
//   numbered by `note`; its text starts "[n] " and the paragraph that cites it carries the same "[n]") or 'verse'
//   (lines kept, separated by "\n": verse, and the tables of figures that are set in lines, which keep the spaces of
//   their columns too, the first line any indent of its own), and s/e are JavaScript string offsets into text
//   (text.slice(s, e) is the matched term; label is the entity's name).
//   bibliotheca/data/index.json = { generated, books: [ { slug, title, author, translator, year, era, words, chapters,
//   paragraphs, terms, generated, set? } ] } (author and translator are names; year is the work's).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE, shelfEntry, checkRights, writeBook, writeIndex, bookPath, ROOT, MAX_BYTES } from './shelf.mjs';
import { stripBoilerplate, splitChapters, normalise, roman } from './text.mjs';
import { loadLake, buildAliasIndex, tagBook, report } from './tag-terms.mjs';
import { wordCount } from '../../kino/lib/text.js';

const UA = { 'User-Agent': 'PRP-Bibliotheca/1.0 (https://jdpi.pages.dev; bibliotheca/scripts/build-book.mjs)', Accept: 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The Gutenberg plain-text file (UTF-8) for a shelf entry, from the cache, a local file or gutenberg.org. The file
    is checked for its START marker before it is cached, so a maintenance page or an error body is never kept. */
export async function sourceText(entry, { refresh = false, source = null } = {}) {
  if (source) return readFileSync(resolve(source), 'utf8');
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, `pg${entry.gutenberg}.txt`);
  if (!refresh && existsSync(cached)) return readFileSync(cached, 'utf8');
  const url = `https://www.gutenberg.org/cache/epub/${entry.gutenberg}/pg${entry.gutenberg}.txt`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK/.test(text)) throw new Error('the response is not a Gutenberg plain-text file');
      writeFileSync(cached, text);
      console.log(`downloaded ${url} (${text.length.toLocaleString('en-GB')} characters) to ${cached}`);
      return text;
    } catch (e) {
      if (attempt >= 4) throw new Error(`could not fetch ${url}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

/* ---------- the layouts text.mjs's splitChapters does not cover ----------
   splitChapters reads a book of one level of chapters set flush left, the Prince's shape. The other books of the shelf
   need more, and their layouts (shelf.mjs) say so with these keys; a layout whose `chapter` is an object is read here.
     fix       [[find, replace, count = 1], …]: exact corrections made to the stripped text first, each explained in the
               shelf (a heading misnumbered in the file, two blocks of one title); a find that does not occur `count`
               times stops the build, so a changed source file fails loudly
     start     the book's first line, a regexp tested on each line as it is (indentation and all), or { line, nth } for
               its nth match (when a contents list repeats it); what comes before is the title page and the contents
     skip      [{ from, to }]: the lines from one matching `from` up to the next matching `to` (not included) are not
               the book: a contents list, a half-title, the Gutenberg's own notes between the front matter and the text
     end       the first line after the book (a glossary, an index, "THE END"); nothing from it on is kept
     part      { heading, label: 'Book', title: 'line' | 'block' | 'none', count }: the books a work is divided into;
               heading is a regexp for the line that opens one, its first group the numeral, its second (with 'line')
               the title; 'block' takes the title from the rest of the heading's lines
     chapter   { heading, title: 'line' | 'block' | 'next', within, continued, first, count, case }: heading as above;
               'next' takes the title from the next block (Thucydides, and Gibbon's long titles after the short ones);
               within: the chapters are numbered within each part (n = part × 100 + chapter); continued: a regexp for
               a heading block that only carries the chapter on (the Gutenberg Gibbon cuts every chapter into "Part I",
               "Part II" …, which are no divisions of Gibbon's: its first group is the part's numeral, and any part after
               the first joins the chapter before); first and count: the numbers the chapters run through (checked);
               case 'text' sets a title printed in Title Case in sentence case too (a title in capitals always is)
     sections  [{ heading, n, title, part }]: pieces kept as chapters of their own (an introduction, a preface, a
               memoir) before the first chapter; with part: true one that follows a part's chapters (Smith's appendix to
               Book IV, n = 499: book × 100 + 99), its heading naming the part
     front     { title, pieces: [{ heading, title }] }: the pieces before chapter 1 of a book numbered once through, which
               share chapter 0 (`title`), each opening with its title as a paragraph of its own; text before the first
               of them (an epigraph) opens chapter 0 too
     intro     { title, drop }: text between a part's heading and its first chapter is the part's own introduction, kept
               as chapter part × 100; a block matching `drop` (its "INTRODUCTION." label) gives way to the title
     notes     'bracket' (a block opening "[n]", its mark "[n]" already in the text: Marriott, Darwin), 'return'
               (Gibbon: a block "12 (return) [ … ]" or "12a (return) [ … ]", which may run over several blocks to its
               closing bracket, with its label, "12" or "12a", standing in the text it annotates) or 'star' (Clausewitz: a block "(*) …", the mark "(*)" in the
               text; "(**)" for a second): each becomes a 'note' numbered "[n] …", and its mark in the paragraph before
               it becomes "[n]" too; notes are numbered by the edition (Gibbon), or 1, 2 … through each chapter
     indent    the text's own left margin, so a file with every line indented (Smith, Gibbon) is not all verse
     verse     false: no block is verse by its indentation (Gibbon's and Darwin's indents are quotations and asides
               rewrapped as prose); otherwise a block with a line indented four spaces past the margin keeps its lines
     keep      [regexp]: blocks whose first line matches keep their lines (verse set flush left)
     tables    true: a block of three lines or more, most with a gap of three spaces inside them, is a table of figures
               and keeps its lines (as 'verse', the contract's only kind with lines) and its columns: the spaces inside
               each line, less the indent the lines share, so a figure stays under its £, s or d (the page sets a verse
               block with a run of spaces in a fixed-width face, as a table)
     lower, proper  words a title set in sentence case has in lower case, or with a capital, whatever the text's
               usage says (a verb the past-tense text never has: Gibbon's "The Germans Overrun Gaul")
     drop      [regexp]: blocks that are not the book's text and are left out (the Gutenberg's links to pictures of
               its own choosing, "[See The Pantheon …]")
   Titles: a title set in capitals (and with case 'text' one in Title Case) is set in sentence case, each word cased as
   the book's own text has it in mid-sentence ("Of the discouragement of agriculture in the ancient state of Europe,
   after the fall of the Roman empire"), with a capital after a dash or a full stop (Gibbon's titles are lists:
   "The death of Severus.—Tyranny of Caracalla"); a trailing full stop goes. Typography is text.mjs's (normalise). */
const pad = n => String(n).padStart(2, '0');
const PREFIX = { para: 'p', note: 'n', verse: 'v' };
const indentOf = l => l.match(/^ */)[0].length;
const numeral = (s, numbering = 'roman') => (numbering === 'arabic' ? +s : roman(String(s).toUpperCase()));
const ROMAN = /^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

/** How often each word stands capitalised and in lower case in mid-sentence (after a letter, a digit, a comma, a
    semicolon or a colon, so a sentence's first word does not count): Map(lower case → { lower, upper }). */
export function caseCounts(texts) {
  const counts = new Map();
  for (const t of texts) {
    // Headings are no evidence: a block in capitals, or in Title Case ("Public Sale Of The Empire"), is passed over.
    const words = String(t).match(/\p{L}+/gu) || [];
    if (words.length && words.filter(w => /^\p{Lu}/u.test(w)).length >= 0.6 * words.length) continue;
    for (const [w] of String(t).matchAll(/(?<=[\p{L}\p{N},;:] +)\p{L}[\p{L}’'-]*/gu)) {
      // Counted under the word and, for a hyphened one, under it run together too ("re-establishment").
      for (const k of new Set([w.toLowerCase(), w.toLowerCase().replace(/-/g, '')])) {
        const c = counts.get(k) || { lower: 0, upper: 0 };
        if (w === w.toLowerCase()) c.lower++; else if (/^\p{Lu}\p{Ll}/u.test(w) || w.length === 1) c.upper++;
        counts.set(k, c);
      }
    }
  }
  return counts;
}

/** Whether a title is set in capitals: seven letters in ten or more ("GEOGRAPHICAL DISTRIBUTION—_continued_" is). */
const inCapitals = s => { const l = String(s).replace(/[^\p{L}]/gu, ''); return l.length > 0 && l.replace(/[^\p{Lu}]/gu, '').length >= 0.7 * l.length; };

/** A title in capitals or Title Case in sentence case by the text's own usage (caseCounts), as described above. The
    capital after a dash is the source's: Gibbon's lists are "The Death Of Severus.—Tyranny Of Caracalla", where a
    full stop alone ("Valentinian II., Succeed", "&c., Under") begins nothing. An ordinal after "the" and a name is a
    regnal number and keeps its capital ("Richard the First", "Mahomet the Second"); one elsewhere is a common word
    ("the fourth and fifth crusades"). A word the text never has is looked up as its kin ("invades" as "invaded",
    "saves" as "save"), which past-tense history has where it lacks the title's present; failing that it goes to lower
    case in a title in capitals, and in Title Case when it has a common noun's or an adjective's ending
    ("Reestablishment", which Gibbon's text hyphens), and keeps its capital otherwise (a name). */
const ORDINAL = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)$/;
const kin = k => [k.replace(/es$/, ''), k.replace(/s$/, ''), k.replace(/s$/, 'd'), k.replace(/es$/, 'ed'), k.replace(/s$/, 'ed'), `${k}ed`, `${k}d`, `${k}s`, k.replace(/ies$/, 'ied')]
  .filter(x => x !== k && x.length > 2);
export function titleCase(title, counts, { lower = [], proper = [] } = {}) {
  const t = String(title).replace(/\s+/g, ' ').trim();
  const caps = inCapitals(t);
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const seen = k => { const c = counts.get(k); return c && (c.upper || c.lower) ? c : null; };
  let start = true;
  const out = []; // the words as set, with where they stand in the title, for the regnal rule
  return t.replace(/(\p{L}[\p{L}’'-]*)|(—)/gu, (m, w, dash, at) => {
    if (!w) { start = true; return m; }
    const word = set => { out.push({ w: set, at, end: at + w.length }); return set; };
    const k = w.toLowerCase(), first = start;
    // An item's numeral ("—II. Factions of the circus") leaves the item's first word to begin it.
    const numeral = !caps && w === w.toUpperCase() && ROMAN.test(w);
    start = first && numeral && t[at + w.length] === '.';
    if (numeral && (w.length > 1 || first)) return word(w); // "Valentinian II", "—I. The empress Theodora"
    if (proper.includes(w) || proper.includes(cap(w))) return word(cap(w));
    if (lower.includes(k)) return word(k);
    if (first && /^\p{Lu}/u.test(w)) return word(cap(w)); // not Darwin's "DISTRIBUTION—_continued_", lower case in italics
    if (ORDINAL.test(k)) {
      // "Richard the First": the word before is "the", and the one before that a name, each a space apart (not
      // "Odoacer, the first", nor "Of The First" in a Title Case title, whose "Of" is set in lower case).
      const [a, b] = [out.at(-2), out.at(-1)];
      const regnal = a && b && b.w === 'the' && t.slice(b.end, at) === ' ' && t.slice(a.end, b.at) === ' ' && /^\p{Lu}/u.test(a.w);
      return word(regnal ? cap(w) : k);
    }
    const c = seen(k) || kin(k).map(seen).find(Boolean);
    if (!c) return word(caps || /(ment|tion|sion|ness|ity|ance|ence|ings?|ed|ly|ous|ive|al)$/.test(k) ? k : w);
    return word(c.upper > c.lower ? cap(w) : k);
  }).replace(/\s*—\s*/g, '—').replace(/\.$/, '');
}

/** The book's lines after the fixes, from its start to its end, with the skipped ranges gone. */
function cut(text, layout) {
  let t = String(text).split('\n').map(l => l.replace(/\s+$/, '')).join('\n'); // a fix is written without trailing spaces
  for (const [find, replace, count = 1] of layout.fix || []) {
    const n = t.split(find).length - 1;
    if (n !== count) throw new Error(`fix "${find.slice(0, 60).replace(/\n/g, '\\n')}" is in the text ${n} times, the layout expects ${count}: the source file has changed`);
    t = t.split(find).join(replace);
  }
  let lines = t.split('\n').map(l => l.replace(/\s+$/, ''));
  if (layout.start) {
    const { line, nth = 1 } = layout.start instanceof RegExp ? { line: layout.start } : layout.start;
    let seen = 0;
    const i = lines.findIndex(l => line.test(l) && ++seen === nth);
    if (i < 0) throw new Error(`the layout's start (${line}, match ${nth}) was not found: the source file has changed shape`);
    lines = lines.slice(i);
  }
  for (const { from, to } of layout.skip || []) {
    const a = lines.findIndex(l => from.test(l));
    const b = a < 0 ? -1 : lines.findIndex((l, i) => i > a && to.test(l));
    if (a < 0 || b < 0) throw new Error(`skip ${from} … ${to} was not found: the source file has changed shape`);
    lines.splice(a, b - a);
  }
  if (layout.end) {
    const i = lines.findIndex(l => layout.end.test(l));
    if (i < 0) throw new Error('the layout\'s `end` line was not found: the source file has changed shape');
    lines = lines.slice(0, i);
  }
  return lines;
}

/** Blank-line separated blocks: [{ at, lines }], lines as they are (indented). */
function blocks(lines) {
  const out = [];
  let b = null;
  lines.forEach((l, at) => { if (!l.trim()) b = null; else { if (!b) out.push((b = { at, lines: [] })); b.lines.push(l); } });
  return out;
}

const joined = b => b.lines.map(l => l.trim()).join(' ');
const bracketDepth = s => { let d = 0; for (const c of s) { if (c === '[') d++; else if (c === ']') d--; } return d; };
const RETURN = /^\s*(\d+)([a-z]?)\]?\s*\(return\)\s*(\[?)\s*/;
const STAR = /^\s*\((\*+)\)\s*/;
const BRACKET = /^\s*\[(\d+)\]\s/;
// A number after these is a date or a reference, never a note's mark (abbreviations only: "the new sect. 143" is one).
const NOT_A_MARK = /(?:A\.\s?D\.|B\.\s?C\.|\b(?:p|pp|l|c|cap|vol|tom|chap|ch|No|n|lib|Ep|v|ver|fol|col)\.)\s*$/i;

/** Puts note `num`'s mark into the paragraph that cites it: the first `label` (Gibbon: "12", or "12a" for the note the
    file labels "12a") at or after the paragraph's last mark that is a number of its own (not inside another, and not
    before a letter: after a space, a stop or, where the file has run it on, the word itself, "Tangier149"), or the star
    sign for a Clausewitz note, becomes "[num]" set close against the word before it. The label is matched exactly, so
    note 2 is not the ordinal "2d." (Guizot's "3d. The Greeks", in a note set in the body of chapter XV) and "2a" is only
    note 2a; `suffix` (a pattern) lets a letter follow it, for the caller's second try. True when it was found. */
function placeMark(p, find, num, { suffix = '' } = {}) {
  const re = find instanceof RegExp ? find : new RegExp(`(?<![\\p{N}\\[])${find}${suffix}(?![\\p{L}\\p{N}\\]])`, 'gu');
  for (const from of [p.cursor || 0, 0]) {
    re.lastIndex = from;
    for (let m; (m = re.exec(p.text));) {
      const before = p.text.slice(0, m.index);
      if (!(find instanceof RegExp) && NOT_A_MARK.test(before)) continue;
      const head = before.replace(/\s+$/, ''), mark = `[${num}]`;
      p.text = head + mark + p.text.slice(m.index + m[0].length);
      p.cursor = head.length + mark.length;
      return true;
    }
  }
  return false;
}

/** The book's chapters from the stripped text by a layout of the keys above: [{ n, heading, title, part?, words,
    paragraphs: [{ id, kind, note?, text, terms: [] }] }] in reading order. `stats` (optional) counts the notes whose
    mark was not found in the text before them, for the build's report. */
export function splitWork(text, layout, stats = { notes: 0, unmarked: [] }) {
  const lines = cut(text, layout), bl = blocks(lines);
  const C = layout.chapter, P = layout.part, margin = layout.indent || 0;
  const counts = caseCounts(bl.map(joined));
  const titleOf = (s, mode) => {
    // A note's mark on a title goes with it (its note opens the chapter): Clausewitz's "(*)", Gibbon's trailing "101".
    let t = normalise(String(s).replace(/\s+/g, ' ').replace(/\(\*+\)/g, ''));
    if (layout.notes === 'return') t = t.replace(/\s+\d{1,4}[a-z]?$/, '');
    return (inCapitals(t) || mode === 'text') ? titleCase(t, counts, layout) : t.replace(/\s*—\s*/g, '—').replace(/\.$/, '');
  };
  const chapters = [];
  let part = null, ch = null, numbered = false;
  const open = c => { ch = { ...c, ps: [], notes: 0 }; chapters.push(ch); return ch; };
  const front = () => chapters.find(c => c.n === 0) || open({ n: 0, heading: layout.front.title, title: layout.front.title });
  const textParas = c => c.ps.filter(p => p.kind !== 'note' && !p.head);

  for (let k = 0; k < bl.length; k++) {
    const b = bl[k], line = b.lines[0], whole = joined(b);
    if ((layout.drop || []).some(re => re.test(whole))) continue;
    // A part (a book of the work).
    const pm = P && line.match(P.heading);
    if (pm) {
      const n = numeral(pm[1], P.numbering);
      const title = P.title === 'line' ? titleOf(pm[2] || '') : P.title === 'block' ? titleOf(b.lines.slice(1).join(' ')) : '';
      part = { n, heading: `${P.label} ${pm[1].toUpperCase()}`, ...(title ? { title } : {}) };
      ch = null;
      continue;
    }
    // A chapter, or a heading that only carries one on.
    const cm = C && line.match(C.heading);
    if (cm) {
      const num = numeral(cm[1], C.numbering);
      const cont = C.continued && whole.match(C.continued);
      if (cont && numeral(cont[1]) > 1) {
        if (!ch || ch.num !== num) throw new Error(`"${whole.slice(0, 70)}" (line ${b.at + 1}) continues chapter ${num}, but chapter ${ch?.num ?? 'none'} is open`);
        continue;
      }
      if (C.within && !part) throw new Error(`chapter ${cm[1]} (line ${b.at + 1}) comes before any ${P?.label || 'part'}`);
      let title;
      if (C.title === 'next') { title = titleOf(joined(bl[++k] || { lines: [''] }), C.case); }
      else if (C.title === 'line') title = titleOf([cm[2] || '', ...b.lines.slice(1)].join(' '), C.case);
      else title = titleOf(b.lines.slice(1).join(' '), C.case);
      const n = C.within ? part.n * 100 + num : num;
      const label = `Chapter ${cm[1].toUpperCase()}`;
      open({ n, num, heading: part ? `${part.heading}, ${label}` : label, title, ...(part ? { part: { ...part } } : {}) });
      numbered = true;
      continue;
    }
    // A piece kept as a chapter of its own (before the chapters, or with `part` after a part's last: an appendix to a
    // book), or one of the pieces sharing chapter 0.
    const s = (layout.sections || []).find(x => (x.part ? part : !numbered) && x.heading.test(line));
    if (s) {
      if (s.part) open({ n: s.n, heading: `${part.heading}, ${s.title}`, title: s.title, part: { ...part } });
      else open({ n: s.n, heading: s.title, title: s.title });
      continue;
    }
    const f = !numbered && layout.front && layout.front.pieces.find(x => x.heading.test(line));
    if (f) { ch = front(); ch.ps.push({ kind: 'para', head: true, text: f.title }); continue; }
    // Text with no chapter open: a part's own introduction, chapter 0's epigraph, or what the title page leaves over.
    if (!ch) {
      if (part && layout.intro) {
        open({ n: part.n * 100, heading: part.heading, title: layout.intro.title, part: { ...part } });
        if (layout.intro.drop?.test(line)) continue;
      } else if (layout.front && !numbered) ch = front();
      else continue;
    }
    // Notes.
    if (layout.notes === 'return') {
      const m = line.match(RETURN);
      if (m) {
        // The note runs to the bracket that closes its own, over as many blocks as it takes (an editor's note after
        // Gibbon's is a block of its own inside the same brackets). What follows that bracket in its block is text the
        // file failed to set apart ("… p. 124, &c.] It was once proposed …"), a paragraph of its own again.
        const num = +m[1], parts = [];
        let rest = whole.replace(RETURN, ''), tail = '', level = 1, closed = !m[3];
        while (!closed) {
          let at = -1;
          for (let i = 0; i < rest.length; i++) { if (rest[i] === '[') level++; else if (rest[i] === ']' && --level === 0) { at = i; break; } }
          if (at >= 0) { parts.push(rest.slice(0, at)); tail = rest.slice(at + 1).trim(); closed = true; break; }
          parts.push(rest);
          const next = bl[k + 1];
          if (!next || RETURN.test(next.lines[0]) || C.heading.test(next.lines[0]) || parts.length >= 30) break;
          rest = joined(bl[++k]);
        }
        if (closed && !m[3]) parts.push(rest);
        if (!closed) stats.unclosed = [...(stats.unclosed || []), `${ch.heading}: note ${m[1]}${m[2]} (line ${b.at + 1})`];
        const note = { kind: 'note', note: num, text: `[${num}] ${parts.map(x => normalise(x)).filter(Boolean).join('\n')}` };
        // The label as the file gives the note; failing that, for a note labelled with a number alone, the number with a
        // letter after it, where the file's text has one its note lacks ("Crassus. 1a" for note 1 of Chapter I), but
        // never an old ordinal's d ("3d.").
        const recent = textParas(ch).slice(-12).reverse();
        const found = recent.some(p => placeMark(p, `${m[1]}${m[2]}`, num)) || (!m[2] && recent.some(p => placeMark(p, m[1], num, { suffix: '[a-ce-z]' })));
        stats.notes++; if (!found) stats.unmarked.push(`${ch.heading}: note ${m[1]}${m[2]}`);
        ch.ps.push(note);
        if (/\p{L}/u.test(tail)) ch.ps.push({ kind: 'para', text: normalise(tail) }); // not a stray "?" after it
        continue;
      }
    }
    if (layout.notes === 'star') {
      const m = line.match(STAR);
      if (m) {
        const num = ++ch.notes, star = m[1];
        const re = new RegExp(`\\(${'\\*'.repeat(star.length)}\\)`, 'g');
        const found = textParas(ch).slice(-12).reverse().some(p => placeMark(p, re, num));
        stats.notes++; if (!found) stats.unmarked.push(`${ch.heading}: note ${num} (${star})`);
        ch.ps.push({ kind: 'note', note: num, text: `[${num}] ${normalise(whole.replace(STAR, ''))}` });
        continue;
      }
    }
    if (layout.notes === 'bracket') {
      const m = line.match(BRACKET);
      if (m) { stats.notes++; ch.ps.push({ kind: 'note', note: +m[1], text: normalise(whole) }); continue; }
    }
    // Prose, verse, a table.
    const inner = b.lines.filter(l => /\S {3,}\S/.test(l.trim())).length;
    const table = layout.tables && b.lines.length >= 3 && inner * 2 >= b.lines.length;
    const verse = table || (layout.keep || []).some(re => re.test(line)) || (layout.verse !== false && b.lines.some(l => indentOf(l) >= margin + 4));
    // A table keeps its columns: the spaces inside its lines, less the indent they share (text.mjs, normalise).
    const t = table ? normalise(b.lines.join('\n'), { columns: true }) : verse ? normalise(b.lines.join('\n')) : normalise(whole);
    if (t) ch.ps.push({ kind: verse && t.includes('\n') ? 'verse' : 'para', text: t });
  }

  // Ids, words and the checks.
  const out = chapters.map(c => {
    let i = 0;
    const paragraphs = c.ps.map(p => ({ id: `c${pad(c.n)}-${PREFIX[p.kind]}${pad(++i)}`, kind: p.kind, ...(p.kind === 'note' ? { note: p.note } : {}), text: p.text, terms: [] }));
    if (!paragraphs.length) throw new Error(`${c.heading} has no paragraphs`);
    if (!c.title) throw new Error(`${c.heading} has no title`);
    return { n: c.n, heading: c.heading, title: c.title, ...(c.part ? { part: c.part } : {}), words: paragraphs.reduce((s, p) => s + wordCount(p.text), 0), paragraphs };
  });
  out.forEach((c, i) => { if (i && c.n <= out[i - 1].n) throw new Error(`chapter numbers do not rise: ${out[i - 1].heading} (${out[i - 1].n}) then ${c.heading} (${c.n})`); });
  const nums = chapters.filter(c => c.num != null);
  if (C.within) {
    for (const [pn, list] of Object.entries(Object.groupBy(nums, c => c.part.n))) {
      list.forEach((c, i) => { if (c.num !== i + 1) throw new Error(`Book ${pn}: chapter ${i + 1} is missing or doubled`); });
    }
  } else {
    const first = C.first ?? 1;
    nums.forEach((c, i) => { if (c.num !== first + i) throw new Error(`chapter numbers run ${nums.map(x => x.num).join(', ')}: ${first + i} is missing or doubled`); });
  }
  if (C.count != null && nums.length !== C.count) throw new Error(`${nums.length} numbered chapters found, the layout expects ${C.count}`);
  if (P?.count != null) { const parts = new Set(nums.map(c => c.part?.n)); if (parts.size !== P.count) throw new Error(`${parts.size} ${P.label.toLowerCase()}s found, the layout expects ${P.count}`); }
  return out;
}

/** The chapters of a stripped text by its shelf layout: splitWork for a layout that needs it, text.mjs's
    splitChapters for the Prince's shape (a `chapter` regexp). */
export function splitBook(text, layout, stats) {
  return layout.chapter instanceof RegExp ? splitChapters(text, layout) : splitWork(text, layout, stats);
}

/** The book record for a shelf entry and its chapters (no terms yet). */
export function bookRecord(entry, chapters) {
  const id = `pg${entry.gutenberg}`;
  const edition = entry.edition || (entry.translator ? `${entry.translator.name}'s translation` : null);
  return {
    slug: entry.slug, title: entry.title,
    author: { ...entry.author },
    translator: entry.translator ? { ...entry.translator } : null,
    ...(entry.editors?.length ? { editors: entry.editors.map(e => ({ ...e })) } : {}),
    ...(entry.set ? { set: { ...entry.set } } : {}),
    work: { ...entry.work },
    era: [...entry.era],
    edition: {
      source: 'Project Gutenberg', id, url: `https://www.gutenberg.org/ebooks/${entry.gutenberg}`, published: entry.published,
      licence: `Project Gutenberg eBook #${entry.gutenberg} (${edition ? `${edition}, ` : ''}${entry.published}). `
        + 'The Project Gutenberg header, footer and licence have been removed, so this text is redistributed as public-domain text '
        + 'without the Project Gutenberg trademark, as its licence provides (gutenberg.org/policy/license.html).',
    },
    rights: { ...entry.rights },
    generated: new Date().toISOString(),
    chapters,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--source');
  if (!slug) { console.error('usage: node bibliotheca/scripts/build-book.mjs <slug> [--refresh] [--source <file>] [--no-tag]'); process.exit(2); }
  const entry = shelfEntry(slug);
  const reasons = checkRights(entry);
  console.log(`${entry.title}: rights pd/pd (${reasons.join('; ')})`);
  const raw = await sourceText(entry, { refresh: args.includes('--refresh'), source: args.includes('--source') ? args[args.indexOf('--source') + 1] : null });
  const notes = { notes: 0, unmarked: [] };
  const chapters = splitBook(stripBoilerplate(raw), entry.layout, notes);
  const book = bookRecord(entry, chapters);
  const words = chapters.reduce((n, c) => n + c.words, 0), paragraphs = chapters.reduce((n, c) => n + c.paragraphs.length, 0);
  console.log(`${chapters.length} chapters, ${paragraphs.toLocaleString('en-GB')} paragraphs, ${words.toLocaleString('en-GB')} words`);
  if (notes.notes) console.log(`${notes.notes.toLocaleString('en-GB')} notes, ${notes.unmarked.length} with no mark found in the text before them${notes.unmarked.length ? `: ${notes.unmarked.slice(0, 12).join('; ')}${notes.unmarked.length > 12 ? ' …' : ''}` : ''}`);
  if (!args.includes('--no-tag')) {
    const index = buildAliasIndex(loadLake(), { decisions: entry.decisions });
    const stats = tagBook(book, index, { year: entry.work.published });
    console.log(report(book, stats, index, { year: entry.work.published }));
  }
  writeBook(book);
  const shelf = writeIndex();
  const size = readFileSync(bookPath(slug)).length;
  console.log(`\nwrote ${bookPath(slug).slice(ROOT.length).replace(/\\/g, '/')} (${(size / 1024).toFixed(0)} KB) and bibliotheca/data/index.json (${shelf.length} book${shelf.length === 1 ? '' : 's'})`);
  if (size > MAX_BYTES) { console.error(`✗ the book file is over ${MAX_BYTES / 1024 / 1024} MB`); process.exit(1); }
}
