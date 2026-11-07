// Makes the source text of a Bibliotheca book that Project Gutenberg does not have, from a scan: the Internet Archive's
// OCR of the edition (its hOCR, which places every word on its page), checked word by word against a transcription of
// the same edition whose text is in the public domain (Econlib's pages). The shelf entry's `scan` names both:
//   scan: { id, econlib, files, pages, cut?, fix?, licence }
//     id       the Internet Archive item (archive.org/details/<id>); its <id>_hocr.html is the OCR
//     econlib  the transcription's address; its pages are <econlib>?chapter_num=1 … files
//     pages    the scan's pages that hold the text, "9-26,53-481" (the preface, the body; not the contents or the index)
//     cut      the line height under which a line is a note (the OCR's x_size), when the page's own median misleads
//     fix      [[find, replace, count = 1], …]: the transcription's few slips that neither reading puts right
// What it does:
//   1. reads the hOCR, page by page: the running head and a page number at the foot go; the full-size lines are the
//      text and the small lines after the last of them the notes; a word broken by a hyphen at a line's end is joined;
//   2. reads the transcription's pages: headings, paragraphs, quotations, tables, notes and the place of each note's
//      mark; its own matter goes (its bracketed editorial notes and cross-references "—Econlib Ed.", its links), and the
//      words it sets as pictures (the edition's Greek, two formulas) are set as text (PICTURES);
//   3. aligns the two (align.mjs) and keeps, where they differ, the transcription's word when the OCR misread (a word
//      no book on the shelf has, a letter that looks like another: c/e, rn/m), and the scan's when the transcription
//      has letters more or fewer (Econlib's "creator" for the edition's "creditor"); headings, tables and whatever only
//      the transcription has (a line the OCR lost) are the transcription's;
//   4. writes bibliotheca/scripts/cache/<id>.txt in the shape the shelf's layouts read: headings in capitals on lines of
//      their own, paragraphs separated by blank lines, each note " [n] …" after the paragraph that cites it, numbered
//      1, 2 … through each chapter, the mark "[n]" in the text; a table's rows in columns.
//   node bibliotheca/scripts/scan-text.mjs <slug> [--log]
// The downloads are kept in the cache (not committed): <id>_hocr.html and econlib/<id>-NN.html; a missing one is fetched,
// one request at a time. build-book.mjs then builds the book from <id>.txt.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE, BOOKS, SHELF, shelfEntry } from './shelf.mjs';
import { align } from './align.mjs';

const UA = { 'User-Agent': 'VM build check (https://jdpi.pages.dev)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchTo(url, file) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      writeFileSync(file, text);
      console.log(`downloaded ${url} (${text.length.toLocaleString('en-GB')} characters)`);
      await sleep(2000);
      return text;
    } catch (e) {
      if (attempt >= 3) throw new Error(`could not fetch ${url}: ${e.message}`);
      await sleep(3000 * attempt);
    }
  }
}

/* ---------- the OCR ---------- */
const ent = s => s.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const bbox = t => (t.match(/bbox (\d+) (\d+) (\d+) (\d+)/) || []).slice(1).map(Number);
/** hOCR → [{ p, w, h, lines: [{ bbox, size, words: [{ t, conf }] }] }] */
export function readHocr(src) {
  const pages = [];
  let page = null, line = null;
  const re = /<(?:div|p|span) class=['"](ocr_page|ocr_carea|ocr_par|ocr_line|ocr_caption|ocr_textfloat|ocr_header|ocrx_word)['"][^>]*title=['"]([^'"]*)['"][^>]*>([^<]*)/g;
  for (let m; (m = re.exec(src));) {
    const [, cls, title, text] = m;
    if (cls === 'ocr_page') { const b = bbox(title); page = { p: pages.length, w: b[2], h: b[3], lines: [] }; pages.push(page); line = null; }
    else if (cls === 'ocrx_word') { if (line && text.trim()) line.words.push({ t: ent(text).trim(), conf: +(title.match(/x_wconf (\d+)/) || [0, 0])[1] }); }
    else if (cls !== 'ocr_carea' && cls !== 'ocr_par') { line = { bbox: bbox(title), size: +(title.match(/x_size ([\d.]+)/) || [0, 0])[1], words: [] }; page.lines.push(line); }
  }
  for (const pg of pages) pg.lines = pg.lines.filter(l => l.words.length).sort((a, b) => a.bbox[1] - b.bbox[1]);
  return pages;
}
const lineText = l => l.words.map(w => w.t).join(' ');
/** The text's words and the notes' words, in reading order, page furniture gone, broken words joined. */
export function ocrStreams(pages, ranges, cut = null) {
  const body = [], notes = [];
  const sizes = [];
  for (const [a, b] of ranges) for (const pg of pages.slice(a, b + 1)) for (const l of pg.lines) if (l.words.length >= 4) sizes.push(l.size);
  sizes.sort((x, y) => x - y);
  const small = cut ?? sizes[Math.floor(sizes.length / 2)] * 0.86;
  for (const [a, b] of ranges) for (const pg of pages.slice(a, b + 1)) {
    const lines = [...pg.lines];
    if (lines.length && lines[0].bbox[1] < 0.075 * pg.h && lines[0].words.length <= 12) lines.shift();
    while (lines.length && lines.at(-1).bbox[1] > 0.85 * pg.h && /^[\divxlcIVXLC.,'’ ]{1,6}$|^[A-Z]{1,2} ?\d?$/.test(lineText(lines.at(-1)))) lines.pop();
    let lastBody = -1;
    lines.forEach((l, k) => { if (l.size >= small) lastBody = k; });
    lines.forEach((l, k) => {
      const target = k > lastBody && l.size < small ? notes : body;
      l.words.forEach((w, i) => target.push({ t: w.t, c: w.conf, p: pg.p, nl: i === 0 }));
    });
  }
  const join = toks => {
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k], next = toks[k + 1];
      if (next && next.nl && /\p{L}-$/u.test(t.t) && /^\p{Ll}/u.test(next.t)) { out.push({ ...t, t: t.t.slice(0, -1) + next.t, c: Math.min(t.c, next.c), hy: true }); k++; }
      else out.push(t);
    }
    return out;
  };
  return { body: join(body), notes: join(notes) };
}

/* ---------- the transcription ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', aelig: 'æ', AElig: 'Æ', oelig: 'œ', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-zA-Z]+);/g, (m, k) => ENT[k] ?? m);
// The edition's Greek words and formulas, which Econlib sets as pictures (its alt text transliterates the Greek; the
// scan has the formulas, garbled by the OCR): the words as the edition prints them, a formula in one line. The figure
// of The Positive Theory (the concentric annual circles of Book II, Chapter V) and the braces of two tables are
// pictures with no words, and go.
export const PICTURES = {
  'BohmBawerkGreek1.gif': 'τόκος', 'BohmBawerkGreek2.gif': 'ἀπ’ ἀλλήλων ἐστίν', 'BohmBawerkGreek3.gif': 'ἀερικόν',
  'BohmBawerkGreek4.gif': 'τόκον', 'BohmBawerkGreek5.gif': 'τόκος', 'BohmBawerkGreek6.gif': 'κεφάλαιον',
  'BohmBawerkMath1.gif': '(F(t + Δt) − Ft) / (Δt · Ft)',
  'bbPTCmath1.gif': '(10 + 9 + 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1) / 100 = 55/100',
  'bbPTCmath2.gif': '(200 + 180 + 40 + 35 + 30 + 25 + 20 + 15 + 10 + 5) / 100 = 560/100',
  'bbPTCfig1.gif': '', 'leftbrace1.gif': '', 'rightbrace1.gif': '',
};
const MARK = /\u0001([a-z]*(?:\d+|\*))\u0001/g;
function inline(html) {
  return decode(html
    .replace(/<img[^>]*src="[^"]*\/([^"/]+\.gif)"[^>]*>/g, (m, f) => { if (!(f in PICTURES)) throw new Error(`a picture scan-text.mjs does not know: ${f}`); return ` ${PICTURES[f]} `; })
    .replace(/<font face="symbol">D<\/font>/g, 'Δ')
    .replace(/<span class="footnote" id="anchor_([a-z]*(?:\d+|\*))">[\s\S]*?<\/span>/g, '\u0001$1\u0001')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    // Econlib's own matter: "[ Book I, Chapter II, par. …—Econlib Ed.]", "[Note from Econlib Editor: …]", the same once
    // with its opening bracket lost, and the chapter it gives an appendix ("[Book VI, Chapter V]").
    .replace(/\s*\[[^\[\]]*(?:Econlib|Editor)[^\[\]]*\]/g, '')
    .replace(/\s*\b(?:Book|Chapter) [IVX]+[^\[\]]{0,80}?—Econlib Ed\.\]/g, '')
    .replace(/\s*\[Book [IVX]+, Chapter [IVX]+\]/g, '')
    // Econlib's own OCR took the pound sign for "œ" five times ("œ100"): before a figure it is "£"
    .replace(/œ(?=\d)/g, '£')
    // a bracket's inside is set close, as printed ("Usury (τόκος)", "(agents naturels)")
    .replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/(\p{Script=Greek})\s+([,.;:])/gu, '$1$2').trim();
}
/** A <table>'s rows: [[{ t, span, down }]], each cell with the columns it spans (colspan) and the rows (rowspan). */
export function tableRows(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r => [...r[0].matchAll(/<t[dh]([^>]*?)(?:\/>|>([\s\S]*?)<\/t[dh]>)/g)].map(c => ({
    t: inline(c[2] || ''), span: +(c[1].match(/colspan="(\d+)"/) || [0, 1])[1], down: +(c[1].match(/rowspan="(\d+)"/) || [0, 1])[1],
  })));
}
// A table inside a quotation or a note stands in its text as \u0002k\u0002, its k-th table (TABLE_AT).
const TABLE = /<table[\s\S]*?<\/table>/g;
export const TABLE_AT = /\u0002(\d+)\u0002/g;
/** One Econlib page → [{ kind: 'h', level, text } | { kind: 'p', text } | { kind: 'table', rows } | { kind: 'note', id, text, tables }];
    a note's mark in the text is \u0001id\u0001. A note is a <div class="text"> after a record marked type="N", and the
    plain paragraphs and quotations after it (before the next record) are more of it; elsewhere a plain <p> (the
    paragraph after a formula, a signature) is text. A quotation or a numbered list splits at a doubled break. A table
    is a block of its own wherever Econlib sets it: in a quotation (Carey's, in Capital and Interest) it falls between
    the quotation's paragraphs; in a note it stays in the note's text as \u0002k\u0002 (`tables`, sourceOf). */
export function readEconlib(src) {
  const a = src.indexOf('<div class="book-reader-content">'), b = src.indexOf('book-reader-tools', a);
  if (a < 0 || b < 0) throw new Error('not an Econlib book page');
  const html = src.slice(a, b), out = [];
  const re = /<h([2-6])>([\s\S]*?)<\/h\1>|<blockquote>([\s\S]*?)<\/blockquote>|<p class="para">([\s\S]*?)<\/p>|<div class="text" id="([a-z]*(?:\d+|\*))">([\s\S]*?)<\/div>|<table[\s\S]*?<\/table>|<p>((?:(?!<\/p>)[\s\S])*?)<\/p>|<div align="right">([\s\S]*?)<\/div>/g;
  let note = null;
  const add = t => { if (!t) return; if (note) note.text += ` ${t}`; else out.push({ kind: 'p', text: t }); };
  // a table met in a note's text, or in a quotation that is more of a note, is the note's
  const noteTable = t => { note.text += ` \u0002${note.tables.length}\u0002`; note.tables.push(tableRows(t)); };
  for (let m; (m = re.exec(html));) {
    if (m[7] != null) { if (/<rec id="[^"]*"/.test(m[7])) note = null; add(inline(m[7])); }
    else if (m[8] != null) add(inline(m[8]));
    else if (m[1]) { note = null; out.push({ kind: 'h', level: +m[1], text: inline(m[2]) }); }
    else if (m[3] != null) {
      let at = 0;
      for (const t of [...m[3].matchAll(TABLE), null]) {
        for (const item of m[3].slice(at, t ? t.index : undefined).split(/<br\s*\/?>\s*<br\s*\/?>/)) add(inline(item));
        if (!t) break;
        if (note) noteTable(t[0]); else out.push({ kind: 'table', rows: tableRows(t[0]) });
        at = t.index + t[0].length;
      }
    }
    else if (m[4] != null) { note = null; add(inline(m[4])); }
    else if (m[5]) {
      note = { kind: 'note', id: m[5], text: '', tables: [] }; out.push(note);
      let at = 0;
      for (const t of [...m[6].matchAll(TABLE), null]) { add(inline(m[6].slice(at, t ? t.index : undefined))); if (!t) break; noteTable(t[0]); at = t.index + t[0].length; }
      note.text = note.text.trim();
    }
    else { note = null; out.push({ kind: 'table', rows: tableRows(m[0]) }); }
  }
  return out;
}

/* ---------- the two readings ---------- */
const key = t => t.normalize('NFC').replace(/[‘’'`´]/g, "'").replace(/[“”"„]/g, '"').replace(/[—–]/g, '-').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl');
const letters = t => key(t).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const bare = t => letters(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
// Letters an OCR takes for one another; a word that differs from the transcription's only in these is the OCR's misreading.
const ALIKE = new Set(['ce', 'ec', 'ae', 'ea', 'ui', 'iu', 'nu', 'un', 'hb', 'bh', 'li', 'il', 'l1', '1l', 'vy', 'yv', 'ao', 'oa', 'ti', 'it', 'ft', 'tf', 'fs', 'sf', 'cs', 'sc', 'oe', 'eo']);
function looksAlike(x, y) {
  x = letters(x); y = letters(y);
  if (x.replace(/rn/g, 'm') === y.replace(/rn/g, 'm')) return true;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !ALIKE.has(x[i] + y[i])) return false;
  return true;
}
/** Sets t.final on every transcription token: its own word, or the scan's where the scan's stands. With a second scan's
    OCR (`witness`, another copy of the same printing, read by another engine), the two scans agreeing against the
    transcription win (Econlib's own text came from an OCR, and has "aides" for "sides", "œ100" for "£100"), and so do the
    words both scans have where the transcription lost them (a few at most, never a running head); otherwise the scan's
    word stands only as above: a known word, read with confidence, not a look-alike of the transcription's. */
export function merge(ocr, ed, vocab, log = [], witness = null) {
  const stats = { same: 0, transcription: 0, scan: 0 };
  const lk = ts => ts.map(x => letters(x.t)).join(' ');
  // The witness's reading of each stretch of the transcription, and what it has before a transcription word.
  const wAt = new Array(ed.length).fill(null), wBefore = new Map();
  if (witness) for (const op of align(witness.map(x => key(x.t)), ed.map(x => key(x.t)))) {
    const w = witness.slice(op.i0, op.i1);
    if (op.j0 === op.j1) { wBefore.set(op.j0, lk(w)); continue; }
    if (op.op === 'eq' || op.i1 - op.i0 === op.j1 - op.j0) for (let j = op.j0; j < op.j1; j++) wAt[j] = letters(witness[op.i0 + j - op.j0].t);
    else for (let j = op.j0; j < op.j1; j++) wAt[j] = { hunk: op.j0, s: lk(w) };
  }
  const wReading = (j0, j1) => {
    const out = [];
    for (let j = j0; j < j1; j++) {
      const r = wAt[j];
      if (r == null) return null;
      if (typeof r === 'string') out.push(r);
      else if (r.hunk === j || j === j0) { if (r.hunk < j0) return null; out.push(r.s); }
    }
    return out.join(' ');
  };
  for (const op of align(ocr.map(x => key(x.t)), ed.map(x => key(x.t)))) {
    const a = ocr.slice(op.i0, op.i1), b = ed.slice(op.j0, op.j1);
    for (const x of b) x.final = x.t;
    if (op.op === 'eq') { stats.same += b.length; continue; }
    if (!b.length) {
      // words both scans have and the transcription lacks
      const s = lk(a);
      if (witness && a.length <= 8 && op.j0 < ed.length && wBefore.get(op.j0) === s && /\p{Ll}/u.test(a.map(x => x.t).join(' ')) && !ed[op.j0].head) {
        ed[op.j0].before = a.map(x => x.t).join(' '); stats.scan += a.length; log.push(`p${a[0].p}: both scans add "${ed[op.j0].before}" before "${ed[op.j0].t}"`);
      }
      continue;
    }
    if (!a.length) { stats.transcription += b.length; continue; }
    if (b.some(x => x.head)) { stats.transcription += b.length; continue; }
    // Compared as letters alone (a stop's spacing, a quote's glyph are no difference), and a word lost by both scans'
    // OCR the same way (an accent, a ligature: "aegis" for "ægis") is no word of theirs; what the two scans agree on
    // must be words the shelf knows ("Eent" is no word, whoever reads it).
    const nk = s => s.replace(/ /g, ''), fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe');
    const ar = nk(lk(a)), er = nk(lk(b)), wr0 = witness ? wReading(op.j0, op.j1) : null, wr = wr0 == null ? null : nk(wr0);
    if (ar === er) { stats.transcription += b.length; continue; }
    let scanStands;
    // Word for word only (a stretch where one side has words more is the side that lost a line's words), each a word
    // or a figure on both sides.
    // Two readings by OCR still share an OCR's slips (u for n, c for e, h for b, a figure for a figure), so those, and
    // short words, stay the transcription's.
    const wordForWord = a.length === b.length && a.every((x, i) => /\p{L}{3}/u.test(letters(x.t)) && /\p{L}{3}/u.test(letters(b[i].t))
      && /^[\p{L}\p{N}’'.,;:!?()“”‘"-]+$/u.test(x.t) && (vocab.common || vocab).has(letters(x.t)) && !looksAlike(x.t, b[i].t));
    // A look-alike too, when the transcription's word is its own slip: a word no other book on the shelf has and the
    // transcription has this once, where both scans read a word the shelf knows ("theoiogical" for "theological",
    // "anthoritatively", "pecunism"); it needs the shelf's words and the transcription's counts (vocab.shelf, vocab.ed).
    const ownSlip = Boolean(vocab.shelf && vocab.ed) && a.length === b.length && a.every((x, i) => letters(x.t) === letters(b[i].t) || (/\p{L}{3}/u.test(letters(x.t))
      && /^[\p{L}\p{N}’'.,;:!?()“”‘"-]+$/u.test(x.t) && vocab.has(letters(x.t)) && !vocab.shelf?.has(letters(b[i].t)) && (vocab.ed?.get(letters(b[i].t)) || 0) <= 1));
    if (wr != null && wr === ar && fold(ar) !== fold(er) && (wordForWord || ownSlip)) scanStands = true;
    else if (wr != null && (wr === er || fold(ar) === fold(er))) scanStands = false;
    else scanStands = a.length === b.length && a.every((x, i) => x.c >= 95 && !x.hy && vocab.has(letters(x.t))
      && letters(x.t).length >= 4 && letters(b[i].t).length >= 4 && bare(x.t) !== bare(b[i].t) && !looksAlike(x.t, b[i].t));
    if (scanStands) {
      if (a.length === b.length) b.forEach((x, i) => { x.final = a[i].t; });
      else { b.forEach((x, i) => { x.final = i ? '' : a.map(y => y.t).join(' '); }); }
      stats.scan += b.length; log.push(`p${a[0].p}: scan "${a.map(x => x.t).join(' ')}" for "${b.map(x => x.t).join(' ')}"${wr === ar ? ' (both scans)' : ''}`);
    } else {
      stats.transcription += b.length;
      // for a reader of the log: a word of the transcription's that no other book has, kept against the scans
      if (b.some(x => !vocab.shelf?.has(letters(x.t)))) log.push(`p${a[0].p}: kept "${b.map(x => x.t).join(' ')}" (scan "${a.map(x => x.t).join(' ')}", second scan "${wr0 ?? '?'}")`);
    }
  }
  return stats;
}
/** A plain OCR text (an Internet Archive _djvu.txt) as words, a word broken at a line's end joined again. */
export function textWords(src) {
  const out = [];
  const lines = String(src).replace(/\f/g, '\n').split('\n');
  lines.forEach(l => {
    const ws = l.trim().split(/\s+/).filter(Boolean);
    ws.forEach((t, i) => out.push({ t: t.replace(/¬$/, '-'), nl: i === 0 }));
  });
  const joined = [];
  for (let k = 0; k < out.length; k++) {
    const t = out[k], next = out[k + 1];
    if (next && next.nl && /\p{L}-$/u.test(t.t) && /^\p{Ll}/u.test(next.t)) { joined.push({ t: t.t.slice(0, -1) + next.t }); k++; } else joined.push(t);
  }
  return joined;
}

/* ---------- the source text ---------- */
const caps = s => s.toUpperCase();
/** A table's rows ([[{ t, span, down }]], or plain strings) in columns, four spaces between them: each cell put in the
    first column its row has free (a cell spanning rows above holds its column), a cell spanning columns as wide as
    they are with the gaps between them, and a column no cell starts in with words left out (Econlib's empty
    spacers), so every figure stands under its heading. */
export function table(rows, gap = 4) {
  rows = rows.map(r => r.map(c => (typeof c === 'string' ? { t: c, span: 1, down: 1 } : c)).map(c => ({ ...c, t: c.t.trim() })));
  const grid = [], held = [];
  rows.forEach((r, i) => {
    const row = grid[i] = [];
    let col = 0;
    for (const c of r) {
      while ((held[col] || 0) > i) col++;
      row.push({ ...c, col });
      for (let k = col; k < col + c.span; k++) held[k] = i + c.down;
      col += c.span;
    }
  });
  const used = [...new Set(grid.flatMap(r => r.filter(c => c.t).map(c => c.col)))].sort((x, y) => x - y);
  // each cell's first and last column among those kept
  const place = c => { const cols = used.filter(k => k >= c.col && k < c.col + c.span); return cols.length ? [used.indexOf(cols[0]), used.indexOf(cols.at(-1))] : null; };
  const cellsAt = grid.map(r => r.filter(c => c.t).map(c => ({ t: c.t, at: place(c) })));
  const w = used.map(() => 0);
  for (const r of cellsAt) for (const c of r) if (c.at[0] === c.at[1]) w[c.at[0]] = Math.max(w[c.at[0]], c.t.length);
  for (const r of cellsAt) for (const c of r) {
    const [a, z] = c.at, room = w.slice(a, z + 1).reduce((s, x) => s + x, 0) + gap * (z - a);
    if (c.t.length > room) w[z] += c.t.length - room;
  }
  const lines = cellsAt.filter(r => r.length).map(r => {
    let line = '';
    for (const c of r) {
      const start = w.slice(0, c.at[0]).reduce((s, x) => s + x + gap, 0);
      line = line.padEnd(start) + (line.length > start ? ' ' : '') + c.t;
    }
    return line.replace(/\s+$/, '');
  });
  return lines.join('\n');
}
/** A note's text, and the tables set in it: " [n] …" and, after a table, its words on as " [n] …" again. */
function noteBlocks(n, text, tables) {
  const out = [], parts = text.split(TABLE_AT);
  for (let i = 0; i < parts.length; i += 2) {
    const words = parts[i].trim();
    if (words) out.push(` [${n}] ${words}`);
    if (i + 1 < parts.length) out.push(table(tables[+parts[i + 1]]));
  }
  return out;
}
/** The pages (each [blocks] with merged text) as the source text; problems are pushed to `problems`. */
export function sourceOf(pages, problems = []) {
  const lines = [];
  const push = (...ls) => lines.push(...ls, '');
  pages.forEach((blocks, f) => {
    const notes = new Map(blocks.filter(b => b.kind === 'note').map(b => [b.id, b.text.trim()])), tables = new Map(blocks.filter(b => b.kind === 'note').map(b => [b.id, b.tables || []]));
    const note = (n, id) => { for (const l of noteBlocks(n, notes.get(id), tables.get(id))) push(l); };
    let k = 0;
    const cite = (id, cited) => {
      if (!notes.has(id)) { problems.push(`page ${f + 1}: mark ${id} has no note`); return ''; }
      if (!notes.get(id)) return ''; // a note that was Econlib's alone, nothing left once its matter is gone
      cited.push([++k, id]);
      return `[${k}]`;
    };
    const heads = blocks.filter(b => b.kind === 'h'), h2 = heads.filter(h => h.level === 2).map(h => h.text);
    const chap = h2.map(t => t.match(/^Book ([IVX]+), Chapter ([IVX]+)$/)).find(Boolean);
    const book = h2.find(t => /^BOOK [IVX]+$/.test(t)), appendix = h2.find(t => /^APPENDIX/.test(t));
    const titles = heads.filter(h => h.level !== 2 && h.level !== 6);
    const own = titles.find(h => h.text !== h.text.toUpperCase()) || titles[0];
    const bookTitle = titles.find(h => h !== own && h.text === h.text.toUpperCase());
    const headNotes = [];
    const strip = t => t.replace(MARK, (_, id) => { headNotes.push(id); return ''; }).trim().replace(/^\[|\]$/g, '');
    if (book) push(book, caps(strip(bookTitle?.text || '')));
    if (chap) push(`CHAPTER ${chap[2]}`, caps(strip(own.text)));
    else if (appendix) push(appendix, caps(strip(own.text)));
    else push(caps(strip(own.text)));
    { const cited = []; for (const id of headNotes) cite(id, cited); for (const [n, id] of cited) note(n, id); }
    for (const b of blocks) {
      if (b.kind === 'h' && b.level === 6) { push(b.text.replace(/\bGroup\b/, 'group')); continue; } // Book V's three groups
      if (b.kind === 'note' || b.kind === 'h') continue;
      const cited = [];
      if (b.kind === 'table') push(table(b.rows.map(r => r.map(c => ({ ...c, t: c.t.replace(/\s*\u0001([a-z]*(?:\d+|\*))\u0001/g, (_, id) => cite(id, cited)) })))));
      else push(b.text.replace(/\s*\u0001([a-z]*(?:\d+|\*))\u0001/g, (_, id) => cite(id, cited)));
      for (const [n, id] of cited) note(n, id);
    }
  });
  return lines.join('\n');
}

export async function scanText(entry, { log = [] } = {}) {
  const s = entry.scan;
  mkdirSync(join(CACHE, 'econlib'), { recursive: true });
  const hocr = await fetchTo(`https://archive.org/download/${s.id}/${s.id}_hocr.html`, join(CACHE, `${s.id}_hocr.html`));
  const ranges = s.pages.split(',').map(r => r.split('-').map(Number));
  const ocr = ocrStreams(readHocr(hocr), ranges, s.cut);
  const pages = [];
  for (let n = 1; n <= s.files; n++) pages.push(readEconlib(await fetchTo(`${s.econlib}?chapter_num=${n}`, join(CACHE, 'econlib', `${s.id}-${String(n).padStart(2, '0')}.html`))));
  // The transcription's words, each knowing its block; a mark is no word.
  const ed = { body: [], notes: [] };
  // A table's words are aligned with the OCR's (they are on its page) but never rewritten (below): a note's table
  // stands in the note as one token, its words after it.
  const cells = rows => rows.map(r => r.map(c => c.t).join(' ')).join(' ');
  for (const blocks of pages) for (const b of blocks) {
    const text = b.kind === 'table' ? cells(b.rows) : b.text;
    const target = b.kind === 'note' ? ed.notes : ed.body;
    b.toks = text.replace(MARK, ' \u0001$1\u0001 ').split(/\s+/).filter(Boolean).flatMap(t => {
      const m = t.match(/^\u0001(.*)\u0001$/), k = t.match(/^\u0002(\d+)\u0002$/);
      if (m) return [{ mark: m[1] }];
      if (k) { for (const w of cells(b.tables[+k[1]]).split(/\s+/).filter(Boolean)) target.push({ t: w, head: false }); return [{ table: +k[1] }]; }
      const tok = { t, head: b.kind === 'h' };
      target.push(tok);
      return [tok];
    });
  }
  // The words the shelf's other books have, and the transcription's own.
  // (`vocab.common`: the words the other books have three times or more, which a two-scan reading must be)
  const vocab = new Set(), counts = new Map();
  const others = new Set(SHELF.filter(e => e.scan).map(e => `${e.slug}.json`));
  for (const f of readdirSync(BOOKS).filter(f => !others.has(f))) for (const c of JSON.parse(readFileSync(join(BOOKS, f), 'utf8')).chapters) for (const p of c.paragraphs) for (const w of p.text.split(/\s+/)) { const k = letters(w); vocab.add(k); counts.set(k, (counts.get(k) || 0) + 1); }
  vocab.common = new Set([...counts].filter(([, n]) => n >= 3).map(([k]) => k));
  vocab.shelf = new Set(counts.keys()); vocab.ed = new Map();
  for (const t of [...ed.body, ...ed.notes]) { const k = letters(t.t); vocab.add(k); vocab.ed.set(k, (vocab.ed.get(k) || 0) + 1); }
  const witness = s.witness ? textWords(await fetchTo(`https://archive.org/download/${s.witness}/${s.witness}_djvu.txt`, join(CACHE, `${s.witness}_djvu.txt`))) : null;
  const stats = [merge(ocr.body, ed.body, vocab, log, witness), merge(ocr.notes, ed.notes, vocab, log, witness)];
  for (const blocks of pages) for (const b of blocks) {
    if (b.kind === 'table') continue; // a table is the transcription's: the OCR of a table is no reading of it
    b.text = b.toks.map(x => (x.mark ? `\u0001${x.mark}\u0001` : x.table != null ? `\u0002${x.table}\u0002` : `${x.before ? `${x.before} ` : ''}${x.final}`)).join(' ').replace(/\s+/g, ' ').replace(/ \u0001/g, '\u0001').trim();
  }
  const problems = [];
  // A figure the transcription's OCR set with a letter for the 1 ("l804", "£I00", "l.3") has its 1: no word of the
  // books mixes figures with l or I.
  let text = sourceOf(pages, problems).replace(/(?<![\p{L}\p{N}])(?=[\dlI.,]*\d)(?=[\dlI.,]*[lI])[\dlI][\dlI.,]*(?=[a-z]?(?![\p{L}\p{N}]))/gu, m => m.replace(/[lI]/g, '1'))
    // and its spaced quotation marks: a closing mark with a space before a word opens ("the words ” Gebrauch for …”"),
    // one with a space before it closes on the word ("“sacrifice ”")
    .replace(/ ” (\p{L})/gu, ' “$1').replace(/(\S) ”/g, '$1”');
  for (const [find, replace, count = 1] of s.fix || []) {
    const n = text.split(find).length - 1;
    if (n !== count) throw new Error(`fix "${find}" is in the text ${n} times, the shelf expects ${count}`);
    text = text.split(find).join(replace);
  }
  return { text, stats, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [slug] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const entry = shelfEntry(slug);
  if (!entry.scan) throw new Error(`${slug} is a Project Gutenberg book: build-book.mjs reads its file`);
  const log = [];
  const { text, stats, problems } = await scanText(entry, { log });
  const out = join(CACHE, `${entry.scan.id}.txt`);
  writeFileSync(out, text);
  const [b, n] = stats;
  console.log(`${entry.title}: text ${b.same.toLocaleString('en-GB')} words as both read them, ${b.transcription.toLocaleString('en-GB')} the transcription's, ${b.scan} the scan's; notes ${n.same.toLocaleString('en-GB')}, ${n.transcription.toLocaleString('en-GB')}, ${n.scan}`);
  if (problems.length) console.log(problems.join('\n'));
  if (process.argv.includes('--log')) console.log(log.join('\n'));
  console.log(`wrote ${out}; now node bibliotheca/scripts/build-book.mjs ${slug}`);
}
