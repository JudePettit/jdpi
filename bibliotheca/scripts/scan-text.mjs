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
/** hOCR → [{ p, w, h, lines: [{ bbox, size, base, par, words: [{ t, conf, b }] }] }]: base is the line's baseline (its
    y), par the OCR's paragraph, b a word's box */
export function readHocr(src) {
  const pages = [];
  let page = null, line = null, par = 0;
  const re = /<(?:div|p|span) class=['"](ocr_page|ocr_carea|ocr_par|ocr_line|ocr_caption|ocr_textfloat|ocr_header|ocrx_word)['"][^>]*title=['"]([^'"]*)['"][^>]*>([^<]*)/g;
  for (let m; (m = re.exec(src));) {
    const [, cls, title, text] = m;
    if (cls === 'ocr_page') { const b = bbox(title); page = { p: pages.length, w: b[2], h: b[3], lines: [] }; pages.push(page); line = null; }
    else if (cls === 'ocr_par') par++;
    else if (cls === 'ocrx_word') { if (line && text.trim()) line.words.push({ t: ent(text).trim(), conf: +(title.match(/x_wconf (\d+)/) || [0, 0])[1], b: bbox(title) }); }
    else if (cls !== 'ocr_carea') {
      const b = bbox(title), bl = title.match(/baseline (-?[\d.]+) (-?[\d.]+)/);
      line = { bbox: b, size: +(title.match(/x_size ([\d.]+)/) || [0, 0])[1], base: b[3] + (bl ? +bl[2] : 0), par, words: [] }; page.lines.push(line);
    }
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

/* ---------- a scan read on its own, a second copy its witness ----------
   A book whose only transcriptions carry their sites' own terms (Böhm-Bawerk's Karl Marx and the Close of His System,
   Wieser's Natural Value), or that has none (Menger's essay in the Economic Journal), is read from the scan's own OCR:
   `scan` names no `econlib`, and
     witness    the Internet Archive item of a second copy (another library's, scanned by another hand); its _djvu.txt is
                the second reading
     furniture  [regexp]: whole lines that are the printing's, not the text (a running head, a journal's signature line),
                dropped wherever they stand; a page number alone, and a short line with a page number at the top of the
                page, go anyway
     marks      { page: [token, …] }: for a page where the reading finds a note mark too many or too few, the tokens (as the
                OCR reads them, a word with its mark) that carry its notes' marks, in order
     restart    a regexp for the headings, as the OCR reads them, that open a chapter (where the notes are numbered from 1
                again), when the OCR misreads the layout's own (Menger's "IT.—" for "II.—"); the layout's headings otherwise
     witnessFrom, witnessTo: words that open and close the work in the witness, when the witness is a whole volume (a
                journal's) and the work a part of it
     witnessDrop [regexp]: the witness's lines that are its printing's, not the text (its running heads and page numbers),
                left out before it is read against the scan
     scribbles  true: a reader's pencilled scribbles in the margins, read as signs, go (scribble())
     fill       true: words the witness alone reads inside one of the scan's paragraphs (lost under a scribble or a flaw
                in the film) go in, when every one is a word or a reference and none the witness's running head
     headGap    how far apart, in lines, a heading's number and its title may stand and still be one heading (1.6)
     trustScan  true: a word the scan reads as a word stands, however low the OCR's confidence in it, when the witness
                reads another (the rule's last branch, below, is off): for a witness whose OCR misreads more often than
                the scan's (Natural Value's, where that branch put "fat" for "far" and "T" for "I")
     fix        [[find, replace, count = 1]]: the slips left, put right in the text written; find a string or, for a
                misreading the OCR makes throughout, a regexp with no groups; a note the list parts from another, or
                a mark it gives back, is "[*]", and the notes are numbered again after (renumber())
   What it does:
   1. reads the hOCR page by page: what is not the text goes (the furniture, specks the OCR read as letters); the notes are
      the small lines at the page's foot, from the first that opens on a mark (the superior figure or sign, as the OCR
      reads it: "1", "*", "!", "?", "t") or stands well clear of the text above it, a note's lines without a mark of their
      own carrying on the one before (over the page too); the text's lines are paragraphs, a new one where a line is
      indented (against the line after it) or the line before stopped short; lines set centred are headings, in
      capitals; a line set flush right (a signature, a place and date) is a paragraph of its own; a line whose words
      stand in columns is a table's row; a word broken at a line's end is joined, its hyphen kept where the two halves are
      words and the shelf writes the compound so;
   2. finds each note's mark in its page's text: a figure set after a word ("work.2"), a sign after a stop ("standpoint.!",
      "theory.*"), a token raised above the line; when the page has as many as it has notes they are its marks, in
      order, and otherwise the page is reported (and `marks` says which they are);
   3. reads the witness against the scan word by word (align.mjs): where the two differ, the scan's word stands unless it
      is a misreading: a word no book on the shelf has (nor the two scans elsewhere agree on), where the witness reads a
      word that is known and differs by a letter or two (by three in a long word), or a figure the OCR set with a letter
      for its 1 or 0; words the scan alone has that are no words at all (a library stamp, a smudge read as letters) go;
      the rest stands as the scan has it and is listed in the log, for a human to read the two and put a slip right in the
      shelf's `fix` list;
   4. writes the text in the shelf's shape: headings on lines of their own, paragraphs separated by blank lines, each note
      " [n] …" after the paragraph that cites it, numbered 1, 2 … through each chapter (`restart`: the headings that open
      one), the mark "[n]" in the text; spaced quotation marks and stops closed up as the shelf's other books have them. */
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// What an OCR makes of a superior figure or sign (1 read as "!", "t", "I" or "'"; 2 as "?"; a dagger as "t").
export const MARKISH = /^(?:[1-9]\d?|[*†‡§¶!?°'’tI|«¹²³⁴⁵⁶⁷⁸⁹])$/u;
// a reference's shape (checkAgainst): a volume's numeral, a page or pages, a figure, the abbreviations of a citation
const REF = /^[(\[“‘]?(?:[ivxlc]{1,7}|\d{1,4}(?:[-—–]\d{1,4})?|\d{1,3}(?:,\d{3})+|[Pp]p?|seq|[Ii]bid|[Cc]f|[Ll]oc|cit|[Oo]p|[Vv]ol|[Cc]h|note)[.,;:)\]’”%]*$/;
// a token as a mark is tested: without a quotation mark the OCR set before it or a stop after it ('"1', "1.")
const markOf = t => t.replace(/^["“‘']/, '').replace(/[.,]$/, '');
const NUMBERISH = /^(?:\d{1,4}|[IVXLCivxlcO1l|]{1,6}|[A-Z]?\d{1,3}|Q\d{1,3})[.,]?$/;
/** The scan's pages as lines: { p, body: [{ words, kind, x0, x1, y, size, ind, sh, W }], notes: [{ cont, label, lines }],
    dropped: [line text] } for each page of `ranges`. kind is 'text', 'center', 'right' or 'row' (see above). */
/** A reader's pencilled scribble in the margin, read as signs (the University of California's Natural Value has them): a
    line with carets, tildes, braces or many other signs for its length, and next to no word or figure in it (a line of
    the text with a sign misread, "its ^usefulness", or a table's row with its ditto marks read as tildes, has many). */
const ODD = /[^\p{L}\p{N}\s.,;:'’"“”‘„()[\]—–\-!?£%&§=+×/°]/gu;
export const scribble = t => {
  const odd = (t.match(ODD) || []).length;
  if (!/[\^~{}\\]/.test(t) && !(odd >= 3 && odd > 0.12 * t.replace(/\s/g, '').length)) return false;
  const real = t.split(/\s+/).filter(w => /^[(“‘"']?(?:\p{L}{3,}|£?\d[\d,.]*)[.,;:)’”"']*$/u.test(w)).length;
  return real <= 1;
};
export function ocrPages(pages, ranges, { cut = null, furniture = [], scribbles = false } = {}) {
  const sel = [];
  for (const [a, b] of ranges) sel.push(...pages.slice(a, b + 1));
  const med = median(sel.flatMap(pg => pg.lines.filter(l => l.words.length >= 4).map(l => l.size)));
  const pitches = [];
  for (const pg of sel) {
    const ls = pg.lines.filter(l => l.words.length >= 4 && l.size >= 0.8 * med);
    for (let i = 1; i < ls.length; i++) { const d = ls[i].bbox[1] - ls[i - 1].bbox[1]; if (d > 0 && d < 3 * med) pitches.push(d); }
  }
  const pitch = median(pitches), small = cut ?? med * 0.92;
  const furn = l => furniture.some(re => re.test(lineText(l).trim()));
  let open = false; // the last note of the page before stops short: the next page's first note lines carry it on
  return sel.map(pg => {
    const dropped = [];
    // a line the OCR cut in two (a gap in the print, a flaw in the film) is one line: pieces side by side, at one height
    const whole = [];
    for (const l of pg.lines) {
      // (a speck in the margin, far smaller than the type, is no piece of the line beside it)
      if (l.size < 0.45 * med && l.words.length < 4) { dropped.push(lineText(l)); continue; }
      const twin = whole.find(o => Math.abs(o.base - l.base) < 0.4 * Math.max(o.size, l.size, med * 0.5) && (o.bbox[2] <= l.bbox[0] || l.bbox[2] <= o.bbox[0]));
      if (!twin) { whole.push({ ...l, words: [...l.words], bbox: [...l.bbox] }); continue; }
      twin.words = [...twin.words, ...l.words].sort((a, b) => a.b[0] - b.b[0]);
      twin.bbox = [Math.min(twin.bbox[0], l.bbox[0]), Math.min(twin.bbox[1], l.bbox[1]), Math.max(twin.bbox[2], l.bbox[2]), Math.max(twin.bbox[3], l.bbox[3])];
      twin.size = Math.max(twin.size, l.size);
    }
    whole.sort((a, b) => a.bbox[1] - b.bbox[1]);
    // a note's sign read against its first word ("*III. 169."): the sign and the word apart
    for (const l of whole) {
      const m = l.words[0]?.t.match(/^([*«†‡])(\p{L}\S*)$/u);
      if (m) l.words.splice(0, 1, { ...l.words[0], t: m[1] }, { ...l.words[0], t: m[2] });
    }
    let lines = whole.filter(l => {
      // specks and stamps: lines far smaller than the type, or the printing's own lines (furniture)
      if ((l.size < 0.45 * med && l.words.length < 4) || furn(l) || (scribbles && scribble(lineText(l)))) { dropped.push(lineText(l)); return false; }
      return true;
    });
    while (lines.length) {
      // (a lone "|" is a speck in the margin, no numeral)
      const l = lines[0], ws = l.words.map(w => w.t).filter(t => t !== '|');
      if (!ws.length) { dropped.push(lineText(lines.shift())); continue; }
      // (a division's heading at the top of a page, "SECTION 2", is the text's)
      if (/^(?:SECTION|CHAP[A-Z]*|BOOK|PART)$/.test(ws[0])) break; // (read "CHAPTEE" as often as not)
      // (a head the OCR read letter by letter, "82 PRE VIO US A TTEMP TS AT SOL UTION BOOK 1 1 1", has more words, and
      // stands well clear of the text)
      const clear = lines[1] && lines[1].bbox[1] - l.bbox[1] >= 1.4 * pitch && ws.filter(t => /^[A-Z0-9,.:!)]+$/.test(t)).length >= 0.6 * ws.length;
      if (!(l.bbox[1] < 0.16 * pg.h && (ws.length <= 10 || (ws.length <= 18 && clear)) && (NUMBERISH.test(ws[0]) || NUMBERISH.test(ws.at(-1))))) break;
      // a running head stands clear of the text below it; a line of more than three words that does not is the text's
      // first, the head unread ("without receiving any equivalent for it (i. 205")
      if (ws.length > 3 && lines[1] && lines[1].bbox[1] - l.bbox[1] < 1.25 * pitch) break;
      dropped.push(lineText(lines.shift()));
    }
    while (lines.length) {
      const l = lines.at(-1);
      // (a page number, read with O for 0, "IO"; a signature mark; a speck read as a letter, "a")
      if (!(l.bbox[1] > 0.8 * pg.h && /^[\divxlcIVXLCO.,'’* ~|-]{1,9}$|^[A-Z]{1,2}(?: ?[A-Z\d]{1,2})?$|^[a-z]$/.test(lineText(l)))) break;
      dropped.push(lineText(lines.pop()));
    }
    // the notes: the run of small lines at the foot, from the first that opens on a mark or stands clear of the text (a
    // line of a few words opening on a mark counts as small whatever size the OCR gives it: "3 Pp. 593 seq.")
    // (a figure or an "I" opening a line is a mark only before what opens a note: a capital, a page, a numeral, a
    // quotation; not "I have two items", "10 lbs. of yarn")
    const marked = l => MARKISH.test(markOf(l.words[0].t)) && (!/^(?:\d|I$)/.test(markOf(l.words[0].t)) || /^(?:\p{Lu}|[ivx]+\.|pp?\.|[(“‘\d])/u.test(l.words[1]?.t || 'X'));
    let r = lines.length;
    while (r > 0 && (lines[r - 1].size < small || (lines[r - 1].words.length <= 5 && marked(lines[r - 1])))) r--;
    if (!lines.slice(r).some(l => l.size < small)) r = lines.length;
    let s = lines.length;
    for (let k = Math.max(r, 1); k < lines.length; k++) {
      const gap = lines[k].bbox[1] - lines[k - 1].bbox[1];
      if (gap >= 1.45 * pitch || marked(lines[k])) { s = k; break; }
    }
    // a run that opens on no mark carries on a note of the page before, if that one was left open (it stopped short of
    // a stop); otherwise it is the text's, set small (a table, a passage in smaller type at the foot), and the notes
    // begin at the first line of it that opens on a mark, if any does
    if (s < lines.length && !marked(lines[s]) && !open) {
      let m = s + 1;
      while (m < lines.length && !marked(lines[m])) m++;
      s = m;
    }
    const bodyLines = lines.slice(0, s), noteLines = lines.slice(s);
    const wide = bodyLines.filter(l => l.words.length >= 5);
    const L = median((wide.length ? wide : bodyLines).map(l => l.bbox[0])), R = median((wide.length ? wide : bodyLines).map(l => l.bbox[2])), W = Math.max(1, R - L);
    const body = bodyLines.map((l, i) => {
      const ind = l.bbox[0] - L, sh = R - l.bbox[2];
      // a row of a table: three or more words in two or more columns, the gaps between them far wider than a space
      const gaps = l.words.slice(1).map((w, k) => w.b[0] - l.words[k].b[2]);
      const space = median(gaps), wideGaps = gaps.filter(g => g > Math.max(3 * space, 0.05 * W)).length;
      const kind = wideGaps >= 2 && l.words.length >= 3 ? 'row'
        : ind > 0.06 * W && sh > 0.06 * W && Math.abs(ind - sh) < 0.25 * W ? 'center'
          : ind > 0.3 * W && sh < 0.06 * W ? 'right' : 'text';
      return { words: l.words, kind, x0: l.bbox[0], x1: l.bbox[2], y: l.bbox[1], base: l.base, size: l.size, ind, sh, W, at: i };
    });
    // the notes, each opening on a mark set in from the notes' margin; lines before the first carry on the last page's
    const nL = Math.min(...noteLines.map(l => l.bbox[0]));
    const notes = [];
    // short notes set side by side on one line ("1 Ibid., pp. 591 seq. 2 Ibid., p. 556."): a line apiece, where a mark
    // follows a stop and comes before a capital or a page
    const lineUp = [];
    for (const l of noteLines) {
      let from = 0;
      for (let k = 2; k < l.words.length - 1; k++) {
        // (a numeral with its stop, "propositions. 1. A is paid", is a list's, in the note)
        if (MARKISH.test(markOf(l.words[k].t)) && !/\.$/.test(l.words[k].t) && /[.;:)]$/.test(l.words[k - 1].t) && /^(?:\p{Lu}|pp?\.)/u.test(l.words[k + 1].t)) {
          lineUp.push({ ...l, words: l.words.slice(from, k), bbox: [from ? l.words[from].b[0] : l.bbox[0], l.bbox[1], l.words[k - 1].b[2], l.bbox[3]], beside: from > 0 });
          from = k;
        }
      }
      lineUp.push(from ? { ...l, words: l.words.slice(from), bbox: [l.words[from].b[0], l.bbox[1], l.bbox[2], l.bbox[3]], beside: true } : l);
    }
    for (const l of lineUp) {
      const first = markOf(l.words[0].t);
      // (or set where the note before it opens: short notes set in from both sides, "* For example, pp. 576, 577." over "2 P. 576.")
      const level = notes.length && !notes.at(-1).cont && Math.abs(l.bbox[0] - notes.at(-1).lines[0].bbox[0]) < 0.012 * W && l.bbox[0] - nL < 0.012 * W && notes.at(-1).lines[0].bbox[0] - nL < 0.012 * W && notes.at(-1).lines.length === 1;
      // (a figure opening a line is a note's mark only before a capital, a page, a numeral or a quotation: not "10 lbs.")
      // (and so is an "I", which may be the text's pronoun: "I have two items")
      const opens = !/^(?:\d|I$)/.test(first) || /^(?:\p{Lu}|[ivx]+\.|pp?\.|[(“‘\d])/u.test(l.words[1]?.t || 'X');
      if (MARKISH.test(first) && opens && (l.bbox[0] - nL > 0.012 * W || !notes.length || level || l.beside)) notes.push({ cont: false, label: first, lines: [l] });
      else if (notes.length) notes.at(-1).lines.push(l);
      else notes.push({ cont: true, label: null, lines: [l] });
    }
    // whether this page's last note runs over onto the next
    if (notes.length) open = !/[.!?)\]”’]$|[.:]—$/.test(lineText(notes.at(-1).lines.at(-1)).trim()) || /[-¬]$/.test(lineText(notes.at(-1).lines.at(-1)));
    else if (bodyLines.length) open = false;
    return { p: pg.p, body, notes, dropped, W, size: med, pitch };
  });
}

const forms = new Map(); // letters → { plain, hyph }: how the shelf writes a word, run together or with its hyphen
function countForm(t) {
  const k = letters(t);
  if (k.length < 4) return;
  const f = forms.get(k) || { plain: 0, hyph: 0 };
  if (/\p{L}-\p{L}/u.test(t)) f.hyph++; else f.plain++;
  forms.set(k, f);
}
/** A word broken at a line's end ("pro-" "duction"), joined: with its hyphen where the shelf (or the book itself) writes
    the compound so ("labour-power", "co-operative"), run together otherwise. */
export function joinBroken(a, b) {
  const left = a.replace(/[-¬]$/, ''), f = forms.get(letters(left + b));
  return f && f.hyph > f.plain ? `${left}-${b}` : left + b;
}
const lev = (a, b) => {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
const core = t => t.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u).slice(1);
/** The scan's tokens (`toks`, each { t, c }) read against the witness's words: sets t.t where the scan misread (the rule
    above) and t.gone on rubbish the scan alone has; returns the counts and pushes what it did, and what it left, to log. */
export function checkAgainst(toks, witness, known, log = [], { fill = false, trustScan = false } = {}) {
  const stats = { same: 0, scan: 0, witness: 0, gone: 0, left: 0 };
  const isWord = t => known(t.t);
  const ops = align(toks.map(x => key(x.t).toLowerCase()), witness.map(x => key(x.t).toLowerCase()));
  // words both read alike are words, whatever the shelf knows
  for (const op of ops) if (op.op === 'eq') for (let i = op.i0; i < op.i1; i++) toks[i].agreed = true;
  const ok = t => t.agreed || isWord(t);
  const where = t => `p${t.p}`;
  const figure = (o, w) => /\d/.test(w) && !/\p{L}/u.test(w) && /\d/.test(o) && o.replace(/[lI|]/g, '1').replace(/[Oo]/g, '0').replace(/[Ss]/g, '5') === w;
  // a reference's own shape, which no dictionary has: a volume's numeral, a page, a figure ("(iii.", "136,", "pp.")
  const clean = w => !/[^\p{L}\p{N}.,;:!?()[\]’‘“”'"—–\-%&§]/u.test(w) && ((known(w) && (letters(w).length > 1 || /^[aAI]\W*$/.test(w))) || REF.test(w));
  // a volume's numeral the scan read with figures or other strokes for its i's ("(111.", "(ili." for "(iii.")
  const romanLike = (o, w) => /^[ivx]+$/.test(core(w)[1]) && core(o)[1].replace(/[1lI|!tí]/g, 'i') === core(w)[1] && core(o)[0] === core(w)[0];
  for (const op of ops) {
    if (op.op === 'eq') { stats.same += op.i1 - op.i0; continue; }
    const a = toks.slice(op.i0, op.i1), b = witness.slice(op.j0, op.j1);
    if (!a.length) {
      // words the witness alone has, inside one of the scan's paragraphs: the scan lost them (a flaw in the film, a
      // pencilled scribble over the line), and with `fill` they go in, if every one is a word or a reference
      const before = toks[op.i0 - 1], after = toks[op.i0];
      if (fill && before && after && before.blk === after.blk && b.length <= 80 && b.every(w => clean(w.t)) && b.some(w => /\p{Ll}{2}/u.test(w.t))
        && !b.some(w => /^\p{Lu}{3,}\W*$/u.test(w.t) && !/^[IVXLC]+\W*$/.test(w.t))) { // (not the witness's running head, in capitals)
        before.t = `${before.t} ${b.map(w => w.t).join(' ')}`; stats.witness += b.length;
        log.push(`${where(before)}: witness filled "${b.map(w => w.t).join(' ')}"`);
        continue;
      }
      if (b.some(w => /\p{Ll}{2}/u.test(w.t)) && b.length <= 8) log.push(`${before ? where(before) : '?'}: witness alone "${b.map(w => w.t).join(' ')}" after "${before?.t}"`);
      continue;
    }
    if (!b.length) {
      // the scan alone: rubbish when no word of it is a word or a figure that reads as one
      if (a.every(x => !ok(x) && !/^[(\[]?\d{1,4}[.,;:)\]]*$|^[ivxlcIVXLC]+\.?$/.test(x.t) && !/^\p{Lu}\p{Ll}+[.,;:]?$/u.test(x.t))) { a.forEach(x => { x.gone = true; }); stats.gone += a.length; log.push(`${where(a[0])}: dropped "${a.map(x => x.t).join(' ')}" (no word, not in the witness)`); }
      else { stats.left += a.length; log.push(`${where(a[0])}: scan alone "${a.map(x => x.t).join(' ')}"`); }
      continue;
    }
    if (a.length === b.length) {
      a.forEach((x, i) => {
        const w = b[i].t, lo = letters(x.t), lw = letters(w);
        if (lo === lw) { stats.same++; return; }
        if (figure(core(x.t)[1], core(w)[1])) { x.t = core(x.t)[0] + core(w)[1] + core(x.t)[2]; stats.witness++; log.push(`${where(x)}: figure "${w}"`); return; }
        if (!ok(x) && !clean(x.t) && romanLike(x.t, w)) { x.was = x.t; x.t = core(x.t)[0] + core(w)[1] + core(x.t)[2]; stats.witness++; log.push(`${where(x)}: numeral "${x.was}" → "${x.t}"`); return; }
        const d = lev(lo, lw), room = lw.length <= 4 ? 1 : lw.length <= 8 ? 2 : 3;
        if (!ok(x) && known(w) && lw && d <= room) {
          const [pre, , post] = core(x.t);
          x.was = x.t; x.t = pre + core(w)[1] + post; stats.witness++; log.push(`${where(x)}: "${x.was}" → "${x.t}"`);
        } else if (!trustScan && ok(x) && known(w) && x.c < 50 && d <= Math.min(room, 2) && !x.agreed) {
          const [pre, , post] = core(x.t);
          x.was = x.t; x.t = pre + core(w)[1] + post; stats.witness++; log.push(`${where(x)}: "${x.was}" → "${x.t}" (scan read without confidence)`);
        } else { stats.left++; if (lo && lw && !/^\d+$/.test(lo + lw)) log.push(`${where(x)}: kept "${x.t}" (witness "${w}")${ok(x) ? '' : ' UNKNOWN'}`); }
      });
      continue;
    }
    // a different number of words: one side split or joined a word, or the two misread differently
    const la = a.map(x => letters(x.t)).join(''), lb = b.map(w => letters(w.t)).join('');
    if (la === lb) { stats.same += a.length; continue; }
    const one = a.every(x => x.blk === a[0].blk); // a stretch put right lies in one paragraph or note
    if (one && a.every(x => !ok(x)) && b.every(w => known(w.t)) && lev(la, lb) <= Math.max(2, Math.floor(lb.length / 4)) && b.length <= 3) {
      const was = a.map(x => x.t).join(' ');
      a.forEach((x, i) => { x.t = i ? '' : b.map(w => w.t).join(' '); if (i) x.gone = true; });
      stats.witness += a.length; log.push(`${where(a[0])}: "${was}" → "${a[0].t}"`);
    } else if (one && a.filter(x => ok(x) || REF.test(x.t)).length * 2 <= a.length && b.every(w => clean(w.t)) && b.length <= 14
      && Math.abs(la.length - lb.length) <= Math.max(3, 0.3 * Math.max(la.length, lb.length))) {
      // a stretch the scan misread past knowing (half its words or more no words) where the witness reads words and
      // references only, of much the same length: the witness's ("ina giveirsociety © (4.14)" for "in a given society”
      // (i. 14)")
      const was = a.map(x => x.t).join(' ');
      a.forEach((x, i) => { x.t = i ? '' : b.map(w => w.t).join(' '); if (i) x.gone = true; });
      stats.witness += a.length; log.push(`${where(a[0])}: "${was}" → "${a[0].t}" (a stretch)`);
    } else { stats.left += a.length; log.push(`${where(a[0])}: kept "${a.map(x => x.t).join(' ')}" (witness "${b.map(w => w.t).join(' ')}")${a.every(ok) ? '' : ' UNKNOWN'}`); }
  }
  return stats;
}

/** The candidates for a page's note marks among its text's tokens, in reading order: [{ tok, strong, cut }] where cut is
    the token as it stands without its mark ('' for a mark on its own). */
function markCandidates(toks) {
  const out = [];
  for (const x of toks) {
    // a smudge after the mark ("sales.!-", "prices.!_") is no part of the word
    const t = x.t.replace(/(?<=[\d*†‡!?°'t])[-_~]$/u, '');
    let m;
    if ((m = t.match(/^(.*[\p{L}.,;:’”)\]])([1-9]|[¹²³⁴⁵⁶⁷⁸⁹])$/u)) && /\p{L}/u.test(m[1]) && !/\d/.test(m[1])) out.push({ tok: x, strong: true, cut: m[1], mark: m[2] });
    else if (MARKISH.test(t) && t !== '|' && x.raised) out.push({ tok: x, strong: true, cut: '', mark: t }); // (a lone "|" is the margin's)
    // a sign after a stop is a mark, never the text's ("standpoint.!", "theory.*")
    else if ((m = t.match(/^(.*\p{L}[’”)\]]?[.,;:][’”)\]]?)([*†‡!?°'t])$/u))) out.push({ tok: x, strong: true, cut: m[1] });
    else if ((m = t.match(/^(.*[’”)\]])([*†‡!?°t])$/u)) && /\p{L}/u.test(m[1])) out.push({ tok: x, strong: false, cut: m[1] });
    else if (/^[*†‡!?°]$/.test(t)) out.push({ tok: x, strong: false, cut: '' });
    else if ((m = t.match(/^(.*\p{L})([*†‡])$/u))) out.push({ tok: x, strong: false, cut: m[1] });
    // the 1 read as "!" against a word, a stop or a figure ("volume!", "society ;!", "(iii. 175—6).!"): weak, an
    // exclamation looks the same
    else if ((m = t.match(/^(.*\p{Ll}|.*[\p{N})][.,;:]?)(!)$/u))) out.push({ tok: x, strong: false, cut: m[1] });
    else if (/^[.,;:][*†‡!]$/.test(t)) out.push({ tok: x, strong: false, cut: t[0] });
  }
  return out;
}

/** The text of a scan with no transcription (see above): { text, problems, stats }. `known(word)` says whether the shelf
    has a word; `restart(heading)` whether a heading opens a chapter (where the notes' numbers start again at 1). */
export function ocrText(pages, s, { witness = null, known = () => false, restart = () => true, log = [] } = {}) {
  const problems = [];
  const ranges = s.pages.split(',').map(r => r.split('-').map(Number));
  const laid = ocrPages(pages, ranges, { cut: s.cut, furniture: s.furniture || [], scribbles: s.scribbles });
  for (const pg of laid) for (const d of pg.dropped) log.push(`p${pg.p}: furniture "${d}"`);
  // how this book writes its compounds, from its own lines (a word whole on a line), for joinBroken
  for (const pg of laid) for (const l of [...pg.body, ...pg.notes.flatMap(n => n.lines)]) l.words.slice(0, -1).forEach(w => countForm(w.t));
  const tok = (w, p, l) => ({ t: w.t, c: w.conf ?? 100, p, raised: Boolean(w.b && l.base && l.size && w.b[3] < l.base - 0.3 * l.size && w.b[3] - w.b[1] < 0.75 * l.size) });
  const append = (blk, l, p) => {
    for (const [i, w] of l.words.entries()) {
      const x = tok(w, p, l), last = blk.toks.at(-1);
      if (i === 0 && last && /\p{L}[-¬]$/u.test(last.t) && /^\p{Ll}/u.test(x.t)) { last.t = joinBroken(last.t, x.t); last.c = Math.min(last.c, x.c); continue; }
      blk.toks.push(x);
    }
  };
  const blocks = [];
  let cur = null, lastNote = null, ids = 0, prevShort = true;
  for (const pg of laid) {
    const pageToks = [];
    const texts = pg.body.filter(l => l.kind === 'text');
    pg.body.forEach((l, i) => {
      if (l.kind === 'center') {
        const prev = pg.body[i - 1];
        // (`headGap`: how far apart, in lines, a heading's lines may stand, its number and its title: 1.6 unless the book
        // sets them wider, "CHAPTER I" over "RETURN VALUE")
        if (cur?.kind === 'h' && cur.page === pg.p && prev?.kind === 'center' && l.y - prev.y <= (s.headGap || 1.6) * pg.pitch) cur.lines.push(l.words.map(w => w.t).join(' '));
        else blocks.push((cur = { kind: 'h', page: pg.p, lines: [l.words.map(w => w.t).join(' ')], toks: [] }));
        prevShort = true;
        return;
      }
      if (l.kind === 'row') {
        // its cells, split at the wide gaps, each a list of tokens (which the witness may put right)
        const row = []; let cell = [];
        l.words.forEach((w, k) => { if (k && w.b[0] - l.words[k - 1].b[2] > Math.max(0.05 * l.W, 2.5 * l.size)) { row.push(cell); cell = []; } cell.push(tok(w, pg.p, l)); });
        row.push(cell);
        if (cur?.kind === 'row') cur.rows.push(row); else blocks.push((cur = { kind: 'row', page: pg.p, rows: [row], toks: [] }));
        for (const c of row) { cur.toks.push(...c); pageToks.push(...c); }
        prevShort = true;
        return;
      }
      const next = texts[texts.indexOf(l) + 1];
      const indented = l.ind - (next && next.y - l.y < 2 * pg.pitch ? Math.max(0, next.ind) : 0) > 0.025 * l.W;
      if (l.kind === 'right' || !cur || cur.kind !== 'p' || indented || prevShort) blocks.push((cur = { kind: 'p', page: pg.p, toks: [], right: l.kind === 'right' }));
      const n0 = cur.toks.length;
      append(cur, l, pg.p);
      pageToks.push(...cur.toks.slice(n0));
      prevShort = l.kind === 'right' || l.sh > 0.12 * l.W;
    });
    // the page's notes, and their marks in its text
    const own = [];
    for (const n of pg.notes) {
      if (n.cont && lastNote) { for (const l of n.lines) append(lastNote, l, pg.p); continue; }
      const note = { kind: 'note', id: ++ids, page: pg.p, toks: [], label: n.label };
      n.lines.forEach((l, k) => append(note, k ? l : { ...l, words: l.words.slice(1) }, pg.p));
      blocks.push(note); own.push(note); lastNote = note;
    }
    if (!own.length) continue;
    const hint = s.marks?.[pg.p];
    let found;
    if (hint) {
      found = [];
      let from = 0;
      for (const h of hint) {
        // "-": the note has no mark; "h:token": its mark is on the page's heading, and the note opens the chapter
        if (h === '-') { found.push(null); continue; }
        if (h.startsWith('h:')) {
          const head = blocks.find(b => b.kind === 'h' && b.page === pg.p && b.lines.some(l => l.split(' ').includes(h.slice(2))));
          if (!head) { problems.push(`page ${pg.p}: no heading has "${h.slice(2)}"`); found.push(null); continue; }
          head.lines = head.lines.map(l => l.split(' ').map(w => (w === h.slice(2) ? w.replace(/[1-9*†‡!?°'t]$/u, '') : w)).join(' '));
          found.push({ head });
          continue;
        }
        const k = pageToks.findIndex((x, i) => i >= from && x.t === h);
        if (k < 0) { problems.push(`page ${pg.p}: the mark "${h}" is not in the page's text`); continue; }
        const m = markCandidates([pageToks[k]])[0] || { tok: pageToks[k], cut: pageToks[k].t.replace(/[1-9*†‡!?°t]$/u, '') };
        found.push(m); from = k + 1;
      }
    } else {
      const all = markCandidates(pageToks), strong = all.filter(m => m.strong);
      // the notes' own figures, where the page's marks are figures too: each note's mark the next with its figure
      // ("Senior.1", "Gossen,2"), looked for among the strong candidates first, so a figure or sign of the text is left
      // alone ("? ? versd.1")
      const byLabel = list => {
        const labels = own.map(n => String(n.label).replace(/^[Il|!]$/, '1'));
        if (!labels.every(l => /^\d+$/.test(l))) return null;
        const seq = []; let from = 0;
        for (const l of labels) { const k = list.findIndex((m, i) => i >= from && m.mark === l); if (k < 0) return null; seq.push(list[k]); from = k + 1; }
        return seq;
      };
      found = byLabel(strong) || (all.length === own.length ? all : strong.length === own.length ? strong : byLabel(all));
      if (!found) { problems.push(`page ${pg.p}: ${own.length} note${own.length > 1 ? 's' : ''}, ${all.length} candidate marks (${all.map(m => m.tok.t).join(' ')}): set scan.marks[${pg.p}]`); found = []; }
    }
    found.slice(0, own.length).forEach((m, i) => {
      if (!m) { own[i].unmarked = true; return; }
      if (m.head) { (m.head.notes ||= []).push(own[i]); own[i].placed = true; return; }
      m.tok.t = m.cut; m.tok.mark = [...(m.tok.mark || []), own[i].id]; if (!m.cut) m.tok.markOnly = true;
    });
    own.slice(found.length).forEach(n => { n.unmarked = true; });
  }
  // the witness puts the scan's misreadings right
  blocks.forEach((b, i) => b.toks.forEach(x => { x.blk = i; }));
  const stream = blocks.flatMap(b => b.toks).filter(x => !x.markOnly && x.t);
  let stats = null;
  if (witness) stats = checkAgainst(stream, witness, known, log, { fill: Boolean(s.fill), trustScan: Boolean(s.trustScan) });
  // the text
  const lines = [];
  const push = (...ls) => lines.push(...ls, '');
  const notes = new Map(blocks.filter(b => b.kind === 'note').map(b => [b.id, b]));
  let k = 0;
  const words = b => {
    const out = [];
    for (const x of b.toks) {
      if (!x.gone && x.t) out.push(x.t);
      for (const id of x.mark || []) { const n = notes.get(id); n.n = ++k; out.push(`\u0001${n.n}`); }
    }
    return out.join(' ').replace(/ \u0001(\d+)/g, '[$1]').replace(/\u0001(\d+)/g, '[$1]');
  };
  let opening = false, cited = [];
  const flush = () => { for (const n of cited) push(` [${n.n}] ${words({ toks: n.toks })}`); cited = []; };
  for (const b of blocks) {
    if (b.kind === 'note') { if (b.unmarked && !b.placed) { b.n = ++k; cited.push(b); problems.push(`page ${b.page}: note "${b.label}" has no mark in the text`); } continue; }
    flush();
    if (b.kind === 'h') {
      const h = b.lines.map(l => l.toUpperCase());
      push(h.join('\n'));
      if (restart(h[0])) k = 0;
      // a note on the heading opens the chapter, before its first paragraph
      for (const n of b.notes || []) { n.n = ++k; cited.push(n); }
      flush();
      opening = true;
      continue;
    }
    if (b.kind === 'row') { push(b.rows.map(r => r.map(c => c.filter(x => !x.gone && x.t).map(x => x.t).join(' ')).filter(Boolean).join('    ')).join('\n')); continue; }
    // a heading set flush like a line of text (Menger's long ones) is read as a paragraph: with `restart` it still
    // opens a chapter, and the notes are numbered from 1 again
    if (s.restart && !b.right && b.toks.length <= 30 && restart(b.toks.map(x => x.t).join(' ').toUpperCase())) k = 0;
    let text = words(b);
    // the first word of a chapter set in capitals ("THERE is a phenomenon") as the word
    if (opening) text = text.replace(/^([“‘]?)(\p{Lu})(\p{Lu}+)(?=[\s,;:]+\p{Ll})/u, (m, q, a, z) => q + a + z.toLowerCase());
    opening = false;
    push(text);
    for (const x of b.toks) for (const id of x.mark || []) cited.push(notes.get(id));
  }
  flush();
  const text = lines.join('\n')
    // the OCR's typography: doubled single quotes for double ones, quotation marks and stops spaced off their words
    .replace(/ ” (\p{L})/gu, ' “$1').replace(/‘‘|‘ ‘|``/g, '“').replace(/’’|’ ’|''/g, '”').replace(/,,/g, '“')
    // (an OCR that reads straight quotation marks sets them apart too: " free gifts " — turned and closed up, each
    // paragraph's taken in turn: one against a word's start opens, one against its end closes, one standing alone
    // does what the one before did not)
    .split('\n').map(straightQuotes).join('\n')
    .replace(/([“‘(]) +(?=[\p{L}\p{N}])/gu, '$1').replace(/(?<=\S) +(?=[”;:?!)])/gu, '').replace(/(?<=[\p{L}.,!?]) ’(?=\s|$)/gu, '’')
    .replace(/(?<![\p{L}\p{N}])(?=[\dlI.,]*\d)(?=[\dlI.,]*[lI])[\dlI][\dlI.,]*(?=[a-z]?(?![\p{L}\p{N}]))/gu, m => m.replace(/[lI]/g, '1'));
  return { text, problems, stats };
}
/** A line's straight double quotation marks as the shelf's curly ones (ocrText): "“" or "”" by where each stands. */
export function straightQuotes(line) {
  if (!line.includes('"')) return line;
  let open = false;
  return line.replace(/( ?)"( ?)/g, (m, a, b, at, s) => {
    const prev = s[at - 1] || ' ', next = s[at + m.length] || ' ';
    const before = a ? ' ' : prev, after = b ? ' ' : next;
    let opens;
    if (/\s|[([—]/.test(before) && !/\s/.test(after)) opens = true;
    else if (!/\s/.test(before) && (/\s|[.,;:)\]!?—-]/.test(after))) opens = false;
    else opens = !open;
    open = opens;
    return opens ? `${a}“` : `”${b}`;
  });
}
/** The witness's words (an Internet Archive _djvu.txt), within `from` … `to` when the work is part of a volume, without
    the lines that match `drop` (its running heads: "52 Karl Marx", "Average Rate of Profit 51"). */
export function witnessWords(src, { from = null, to = null, drop = [] } = {}) {
  let t = String(src);
  if (from) { const i = t.indexOf(from); if (i < 0) throw new Error(`the witness has no "${from}"`); t = t.slice(i); }
  if (to) { const i = t.indexOf(to); if (i < 0) throw new Error(`the witness has no "${to}"`); t = t.slice(0, i + to.length); }
  if (drop.length) t = t.split('\n').filter(l => !drop.some(re => re.test(l.trim()))).join('\n');
  return textWords(t);
}

/** The words of the shelf's built books, other than `slug`'s own: what ocrText's witness rule calls known, and how the
    shelf writes its compounds (joinBroken). */
export function shelfWords(slug) {
  // (the forms are this book's and the shelf's: none left from a book read before it in the same process)
  forms.clear();
  const vocab = new Set();
  for (const f of readdirSync(BOOKS).filter(f => f.endsWith('.json') && f !== `${slug}.json`)) {
    for (const c of JSON.parse(readFileSync(join(BOOKS, f), 'utf8')).chapters) for (const p of c.paragraphs) for (const w of p.text.split(/\s+/)) { const k = letters(w); if (k) vocab.add(k); countForm(w); }
  }
  return vocab;
}
/** A book read from its scan alone, its witness the second copy (ocrText). */
async function scanAlone(entry, { log = [] } = {}) {
  const s = entry.scan;
  mkdirSync(CACHE, { recursive: true });
  const hocr = await fetchTo(`https://archive.org/download/${s.id}/${s.id}_hocr.html`, join(CACHE, `${s.id}_hocr.html`));
  const src = s.witness ? await fetchTo(`https://archive.org/download/${s.witness}/${s.witness}_djvu.txt`, join(CACHE, `${s.witness}_djvu.txt`)) : null;
  const vocab = shelfWords(entry.slug);
  const known = w => { const k = letters(w); return k.length > 0 && !/\d/.test(k) && vocab.has(k); };
  // the headings that open a chapter, where the notes are numbered from 1 again
  const L = entry.layout || {};
  const heads = [L.part?.heading, L.chapter?.heading, ...(L.sections || []).map(x => x.heading), ...(L.front?.pieces || []).map(x => x.heading)].filter(Boolean);
  const restart = h => (s.restart ? s.restart.test(h) : heads.some(re => re.test(h)));
  const { text: raw, problems, stats } = ocrText(readHocr(hocr), s, { witness: src && witnessWords(src, { from: s.witnessFrom, to: s.witnessTo, drop: s.witnessDrop }), known, restart, log });
  let text = raw;
  // the fix list: [find, replace, count = 1], find a string or (for a misreading the OCR makes throughout, its
  // quotation marks) a regexp with no groups, replace a string
  for (const [find, replace, count = 1] of s.fix || []) {
    const n = text.split(find).length - 1;
    if (n !== count) throw new Error(`fix "${find}" is in the text ${n} times, the shelf expects ${count}`);
    text = text.split(find).join(replace);
  }
  return { text: renumber(text, h => heads.some(re => re.test(h))), stats, problems, alone: true };
}

/** The notes numbered 1, 2 … through each chapter again once the fix list has done (it may part two notes the OCR ran
    together, or give one the mark the OCR lost): each mark "[n]" in a paragraph takes the next number, in the order the
    text cites them, and its note " [n] …" the same; a mark or note "[*]" (one the fix list adds) pairs with the next
    "[*]"; a note no paragraph cites (one on a heading) takes the next number where it stands. `opens(line)` says whether
    a block's first line is a heading that opens a chapter. */
export function renumber(text, opens) {
  const blocks = String(text).split('\n\n');
  // first the numbers, chapter by chapter (a "[*]" note may stand before the paragraph whose "[*]" mark it pairs with:
  // the i-th of the chapter's "[*]" notes is its i-th "[*]" mark's)
  let k = 0, map = new Map(), stars = [];
  const plan = blocks.map(b => {
    if (opens(b.split('\n')[0])) { k = 0; map = new Map(); stars = []; return { head: true }; }
    const note = b.match(/^ \[(\d+|\*)\] /);
    if (note) return note[1] === '*' ? { star: stars } : { n: map.get(note[1]) ?? ++k };
    const ns = [];
    b.replace(/\[(\d+|\*)\]/g, (m, old) => { const n = ++k; if (old === '*') stars.push(n); else map.set(old, n); ns.push(n); return m; });
    return { ns };
  });
  return blocks.map((b, i) => {
    const p = plan[i];
    if (p.head) return b;
    if (p.star) return b.replace(/^ \[\*\] /, ` [${p.star.shift() ?? '?'}] `);
    if (p.n != null) return b.replace(/^ \[(\d+)\] /, ` [${p.n}] `);
    let j = 0;
    return b.replace(/\[(\d+|\*)\]/g, () => `[${p.ns[j++]}]`);
  }).join('\n\n');
}

export async function scanText(entry, { log = [] } = {}) {
  const s = entry.scan;
  if (!s.econlib) return scanAlone(entry, { log });
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
  const { text, stats, problems, alone } = await scanText(entry, { log });
  const out = join(CACHE, `${entry.scan.id}.txt`);
  writeFileSync(out, text);
  if (alone) console.log(`${entry.title}: ${stats.same.toLocaleString('en-GB')} words as both scans read them, ${stats.witness} put right from the witness, ${stats.gone} dropped as no words, ${stats.left.toLocaleString('en-GB')} left as the scan reads them`);
  else {
    const [b, n] = stats;
    console.log(`${entry.title}: text ${b.same.toLocaleString('en-GB')} words as both read them, ${b.transcription.toLocaleString('en-GB')} the transcription's, ${b.scan} the scan's; notes ${n.same.toLocaleString('en-GB')}, ${n.transcription.toLocaleString('en-GB')}, ${n.scan}`);
  }
  if (problems.length) console.log(problems.join('\n'));
  if (process.argv.includes('--log')) console.log(log.join('\n'));
  console.log(`wrote ${out}; now node bibliotheca/scripts/build-book.mjs ${slug}`);
}
