// The quotation rule (S0 of the scholar design, 16 November 2026; Jude's rule): a person's words appear in Vitruvian
// Manager as a quotation only when they match a paragraph of a book on Bibliotheca's shelf whose EU finding is "pd"
// (shelf.mjs, rights.eu). Anything else that reports what someone said or wrote is VM's own summary, in VM's words,
// never shown or read as the person's. This module is the one place the match is made; the tests (tests/kino.test.mjs
// for Kino's scenes and every quotation field in the site's data, tests/learning.test.mjs for the courses) and Kino's
// validator (kino/scripts/validate.mjs) all call it.
// Later readers of the shelf that hand out its words (a passage export, the Book Builder, debates) must read rights.eu
// the same way: a book "unconfirmed" in the EU is read on its page but not quoted or exported.
//   shelfParagraphs()        the paragraphs of every "pd" book: { slug, id, url, text } (text normalised)
//   normalise(s)             what a match ignores: typography, note marks, spacing, the quotation's own marks
//   findQuote(text, paras)   the paragraphs that hold the quotation, its pieces (split at an ellipsis) in order
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKS } from './shelf.mjs';

/** What a match ignores: Unicode form, curly or straight quotation marks and apostrophes, the kind of dash and the
    spaces round it (a book's "creed -- that" is a quotation's "creed — that"), an edition's note marks ("society[2]"),
    runs of white space, and the quotation marks round the whole. Letters, words, their case and their punctuation
    otherwise count. */
export function normalise(s) {
  return String(s ?? '').normalize('NFC')
    .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"')
    // U+2010 and U+2011 are hyphens, not dashes: they read as the plain hyphen the books use (the second reviewer, X6)
    .replace(/[‐‑]/g, '-')
    .replace(/\s*(?:--|[‒–—―])\s*/g, '—')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^["']+|["']+$/g, '').trim();
}

/** The quotation in its pieces: an ellipsis ("…" or "...") marks words left out, so each piece must be found, in order. */
export const pieces = text => normalise(text).split(/…|\.\.\./).map(p => p.trim()).filter(Boolean);

let cache = null;
/** Every paragraph (of any kind: text, note, verse, table) of every book whose EU finding is "pd", normalised. */
export function shelfParagraphs(dir = BOOKS) {
  if (cache && cache.dir === dir) return cache.paras;
  const paras = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const book = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (book.rights?.eu !== 'pd') continue;
    for (const c of book.chapters || []) for (const p of c.paragraphs || []) {
      if (p.text) paras.push({ slug: book.slug, id: p.id, url: book.edition?.url || null, text: normalise(p.text) });
    }
  }
  cache = { dir, paras };
  return paras;
}

// A letter, digit or combining mark: a piece that begins or ends with one must not begin or end inside a word of the
// book ("t is necessary" is not in "it is necessary", nor "the wolve" in "the wolves": the second reviewer, X1).
const WORD = /[\p{L}\p{N}\p{M}]/u;
const wordAt = (s, i) => i >= 0 && i < s.length && WORD.test(s[i]);
/** Where a piece first stands in a text from `from` on, as whole words at both its ends; -1 when nowhere. */
function wholeAt(text, piece, from) {
  for (let i = text.indexOf(piece, from); i >= 0; i = text.indexOf(piece, i + 1)) {
    const end = i + piece.length;
    if (!(WORD.test(piece[0]) && wordAt(text, i - 1)) && !(WORD.test(piece[piece.length - 1]) && wordAt(text, end))) return i;
  }
  return -1;
}

/** The paragraphs that hold the quotation: every piece of it in one paragraph, in order, each as whole words. Empty
    when it matches none. */
export function findQuote(text, paras = shelfParagraphs()) {
  const parts = pieces(text);
  if (!parts.length) return [];
  return paras.filter(p => {
    let at = 0;
    for (const piece of parts) {
      const i = wholeAt(p.text, piece, at);
      if (i < 0) return false;
      at = i + piece.length;
    }
    return true;
  });
}

/** Double-quoted runs of `min` words or more in a text ("…", “…”): the candidates the courses' test checks. A run may
    cross a line break (a quotation the text wraps) but not a paragraph break (a blank line), so an unclosed mark cannot
    pair with one paragraphs away (the second reviewer, X3). */
export function quotedRuns(text, min = 6) {
  const out = [];
  for (const m of String(text).matchAll(/"((?:(?!\r?\n[ \t]*\r?\n)[^"])+)"|“((?:(?!\r?\n[ \t]*\r?\n)[^”])+)”/g)) {
    const q = (m[1] ?? m[2]).trim();
    if (q.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length >= min) out.push(q);
  }
  return out;
}
