/* Bibliotheca text rules: how a Project Gutenberg plain-text file becomes chapters of paragraphs. Pure functions, no
   file or network access, shared by the build (build-book.mjs) and its tests (tests/bibliotheca-data.test.mjs).
   - The Gutenberg boilerplate (everything up to the "*** START OF …" line, and from the "*** END OF …" line on) is
     cut, so the built book carries no Project Gutenberg trademark or licence; the licence asks exactly that of a text
     redistributed without them (gutenberg.org/policy/license.html).
   - A book's shape (which heading lines open chapters, how they are numbered, where the book ends) comes from its
     shelf entry (shelf.mjs, `layout`), so the splitter has no book built in.
   - Paragraphs are separated by blank lines; hard wraps inside one are joined with a space. A block whose first line
     is indented one space and opens with "[n]" is a translator's footnote (Marriott's are set that way); a block with
     a line indented four spaces is verse and keeps its line breaks.
   - Gutenberg's typography is normalised: _italics_ markers dropped, straight quotes made typographic, "--" an em
     dash, a hyphen between digits an en dash (1469–94). The text's own curly quotes and dashes pass through.
   Offsets the tagger writes (tag-terms.mjs) are JavaScript string offsets into the text as stored here. */
import { wordCount } from '../../kino/lib/text.js';

/** The text between Project Gutenberg's START and END marker lines; throws when either is missing, since a file
    without them is not the plain-text edition this expects. Line endings become "\n"; a byte-order mark goes. */
export function stripBoilerplate(raw) {
  const lines = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(l => /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK\b/.test(l));
  const end = lines.findIndex(l => /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK\b/.test(l));
  if (start < 0) throw new Error('no "*** START OF THE PROJECT GUTENBERG EBOOK" line: not a Gutenberg plain-text file');
  if (end < 0 || end <= start) throw new Error('no "*** END OF THE PROJECT GUTENBERG EBOOK" line after the start marker');
  return lines.slice(start + 1, end).join('\n');
}

/** Typography of one paragraph (see the rules above). Newlines are kept: verse arrives with them. With `columns` (a
    table of figures, set in lines: Smith's prices of wheat) the spaces inside a line stay and only the indent the
    lines share goes, so each figure stays in its column (£ s d) and a heading over its own; the first line keeps any
    indent of its own, and the page sets such a block in a fixed-width face (bibliotheca/neo/lib/text.js). */
export function normalise(text, { columns = false } = {}) {
  const t = String(text)
    .replace(/ /g, ' ')
    .replace(/_/g, '')
    .replace(/(\d)-(?=\d)/g, '$1–')
    .replace(/--/g, '—')
    .replace(/(^|[\s(\[—–/])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s(\[—–/])'(?=\p{L})/gu, '$1‘').replace(/'/g, '’');
  if (!columns) return t.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).join('\n').trim();
  const lines = t.replace(/\t/g, ' ').split('\n').map(l => l.replace(/\s+$/, '')).filter(Boolean);
  const indent = Math.min(...lines.map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(indent)).join('\n');
}

/** A Roman numeral's value ("XVIII" → 18); throws on anything else. */
export function roman(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  if (!/^[IVXLCDM]+$/.test(s)) throw new Error(`"${s}" is not a Roman numeral`);
  let n = 0;
  for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; n += a < b ? -a : a; }
  return n;
}

/** A title set in capitals ("WHY THE KINGDOM OF DARIUS …") in sentence case, keeping the capitals of `proper`. */
export function sentenceCase(title, proper = []) {
  let t = String(title).replace(/\s+/g, ' ').trim().toLowerCase().replace(/^\p{Ll}/u, c => c.toUpperCase());
  for (const w of proper) t = t.replace(new RegExp(`(^|[^\\p{L}])${w.toLowerCase()}(?=$|[^\\p{L}])`, 'gu'), `$1${w}`);
  return t;
}

/** Blank-line separated blocks of lines as paragraphs: [{ kind: 'para' | 'note' | 'verse', text, note? }]. */
export function paragraphs(lines) {
  const out = [];
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const note = block[0].match(/^ \[(\d+)\]/);
    const kind = note ? 'note' : block.some(l => /^ {4}\S/.test(l)) ? 'verse' : 'para';
    const text = normalise(block.map(l => l.trim()).join(kind === 'verse' ? '\n' : ' '));
    if (text) out.push(note ? { kind, note: +note[1], text } : { kind, text });
    block = [];
  };
  for (const line of lines) { if (/^\s*$/.test(line)) flush(); else block.push(line); }
  flush();
  return out;
}

const pad = n => String(n).padStart(2, '0');
const PREFIX = { para: 'p', note: 'n', verse: 'v' };

/** The book's chapters from the stripped text, by its layout:
      chapter    a regexp a heading line matches, with the number as its first group ("CHAPTER XII." → "XII")
      numbering  'roman' or 'arabic' for that group
      count      how many numbered chapters the book has (checked, so a changed source file fails loudly)
      sections   other parts kept as chapters: [{ heading: regexp, n, title, until?: regexp ending it early }]
      end        a regexp for the first line after the book (an appendix, another work); nothing after it is kept
      proper     words that keep their capital when a capitalised chapter title is set in sentence case
    A numbered chapter's title is the capitalised line or lines straight after its heading; a section's is given.
    Returns [{ n, heading, title, words, paragraphs: [{ id, kind, note?, text, terms: [] }] }] in chapter order, with
    paragraph ids like c12-p03 (chapter 12, third block, a paragraph; n for a note, v for verse). */
export function splitChapters(text, layout) {
  const lines = String(text).split('\n').map(l => l.replace(/\s+$/, ''));
  const marks = [];
  lines.forEach((line, i) => {
    const m = layout.chapter && line.match(layout.chapter);
    if (m) marks.push({ i, n: layout.numbering === 'roman' ? roman(m[1]) : +m[1], heading: `Chapter ${m[1]}` });
    for (const s of layout.sections || []) if (s.heading.test(line)) marks.push({ i, n: s.n, heading: s.title, title: s.title, until: s.until });
    if (layout.end && layout.end.test(line)) marks.push({ i, end: true });
  });
  marks.sort((a, b) => a.i - b.i);
  const endAt = marks.findIndex(m => m.end);
  if (layout.end && endAt < 0) throw new Error('the layout\'s `end` line was not found: the source file has changed shape');
  const kept = endAt < 0 ? marks : marks.slice(0, endAt);
  if (!kept.length) throw new Error('no heading line matched the layout: the source file has changed shape');
  const chapters = kept.map((m, k) => {
    let stop = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    if (m.until) { const j = lines.findIndex((l, idx) => idx > m.i && m.until.test(l)); if (j >= 0 && j < stop) stop = j; }
    const body = lines.slice(m.i + 1, stop);
    let title = m.title;
    if (title == null) {
      while (body.length && !body[0].trim()) body.shift();
      const t = [];
      while (body.length && body[0].trim()) t.push(body.shift().trim());
      title = sentenceCase(t.join(' '), layout.proper);
    }
    if (!title) throw new Error(`chapter ${m.n} (line ${m.i + 1}) has no title`);
    let k2 = 0;
    const paras = paragraphs(body).map(p => ({ id: `c${pad(m.n)}-${PREFIX[p.kind]}${pad(++k2)}`, kind: p.kind, ...(p.note ? { note: p.note } : {}), text: p.text, terms: [] }));
    if (!paras.length) throw new Error(`chapter ${m.n} (line ${m.i + 1}) has no paragraphs`);
    return { n: m.n, heading: m.heading, title, words: paras.reduce((s, p) => s + wordCount(p.text), 0), paragraphs: paras };
  });
  chapters.sort((a, b) => a.n - b.n);
  const numbered = chapters.filter(c => !(layout.sections || []).some(s => s.n === c.n)).map(c => c.n);
  numbered.forEach((n, i) => { if (n !== i + 1) throw new Error(`chapter numbers run ${numbered.join(', ')}: ${i + 1} is missing or doubled`); });
  if (layout.count != null && numbered.length !== layout.count) throw new Error(`${numbered.length} numbered chapters found, the layout expects ${layout.count}`);
  const ids = new Set(chapters.map(c => c.n));
  if (ids.size !== chapters.length) throw new Error('two chapters share a number');
  return chapters;
}
