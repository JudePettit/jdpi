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

/** The paragraphs that hold the quotation: every piece of it in one paragraph, in order. Empty when it matches none. */
export function findQuote(text, paras = shelfParagraphs()) {
  const parts = pieces(text);
  if (!parts.length) return [];
  return paras.filter(p => {
    let at = 0;
    for (const piece of parts) {
      const i = p.text.indexOf(piece, at);
      if (i < 0) return false;
      at = i + piece.length;
    }
    return true;
  });
}

/** Double-quoted runs of `min` words or more in a text ("…", “…”): the candidates the courses' test checks. */
export function quotedRuns(text, min = 6) {
  const out = [];
  for (const m of String(text).matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)) {
    const q = (m[1] ?? m[2]).trim();
    if (q.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length >= min) out.push(q);
  }
  return out;
}
