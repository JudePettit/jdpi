// Tags a book's paragraphs with the terms the Encyclopaedia knows, so NEO CLASSIC can highlight them and open their
// entries. The dictionary is every label and alias in the lake (lake/data/e/*.json, built by lake/scripts/build.mjs
// from Wikidata's labels and aliases); the rules are:
//   - whole words only: a match starts and ends at a word boundary (letters and digits make a word; a hyphen or an
//     apostrophe between letters stays inside it, and a possessive ’s straight after a match is allowed);
//   - longest match first, and never a match inside another match (nor inside a longest string the era rule below
//     skips: the words of a skipped "Italian Republic" are not terms of their own);
//   - a name (a string that starts with a capital) matches exactly, case and all; a common noun (an all-lowercase
//     string, which the lake has for ideas and topics: "fascism", "combustion") matches in any case, so a sentence-
//     initial "Fascism" counts, only by the entity's own name (an idea's aliases are loose synonyms: "protection" for
//     protectionism, "burn" for combustion) and only when four characters or longer ("war" is a word, not a term);
//     a name may be shorter (three letters, or two in capitals: "HRE");
//   - a leading "The " is dropped from the dictionary string, so "The Republic of Venice" matches "the Republic of
//     Venice" in the running text;
//   - accents are folded for matching ("Niccolò" matches "Niccolo"), with the offsets kept on the original text;
//   - era: an entity first dated after the book's year (born, founded, started or held after it) cannot be what a text
//     written before it meant, so it is skipped, unless the text has its exact full name (a translator's note may
//     name a later author in full); a present-day state let through that way where the text means an older place
//     ("Italy" and "Greece" in The Prince) is put right by a shelf decision, and the data test holds every term of a
//     book to its era; a string shared by several entities goes to one alive in the book's era, then by type (a
//     place before a person before a war …), then by how often the Encyclopaedia mentions it;
//   - the book's own decisions (shelf.mjs) come last and win: a string sent to another entity, a string or an entity
//     left out, a word the lake lacks added.
// Every choice is counted and printed in the report, so a human can read the top matches, the strings skipped by the
// era rule and the shared strings resolved, and put a wrong one right with a decision in the shelf.
//   node bibliotheca/scripts/tag-terms.mjs <slug>    re-tag bibliotheca/data/books/<slug>.json in place, rewrite the
//                                                    shelf index and print the report
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, shelfEntry, readBook, writeBook, writeIndex } from './shelf.mjs';

export const LAKE = join(ROOT, 'lake', 'data');
const MIN_COMMON = 4;
// Which of two entities sharing a string a text of a given era is likelier to mean, all else equal.
export const TYPE_RANK = ['place', 'person', 'conflict', 'event', 'organisation', 'party', 'idea', 'topic', 'election'];
// Only these types' lowercase strings are terms a text uses as common nouns; a place's or party's lowercase alias
// ("res publica", "labour") is left alone.
const COMMON_TYPES = new Set(['idea', 'topic']);
const END = Symbol('end');

/** The Encyclopaedia's entities, read from the lake's shards: Map qid → { q, label, type, aliases, facts, total }. */
export function loadLake(dir = LAKE) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const entities = new Map();
  for (let i = 0; i < manifest.shards.entities; i++) {
    for (const [q, r] of Object.entries(JSON.parse(readFileSync(join(dir, `e/${i}.json`), 'utf8')))) {
      entities.set(q, { q, label: r.label, type: r.type, aliases: r.aliases || [], facts: r.facts || {}, total: r.total || 0 });
    }
  }
  return entities;
}

/** The year an entity's record first dates it: born, founded, started or held (the lake's facts, from Wikidata);
    null when it has none. "-0509" is 509 BC. */
export function firstYear(facts = {}) {
  const years = ['born', 'founded', 'start', 'date'].map(k => { const m = String(facts[k] || '').match(/^(-?\d{1,4})/); return m ? +m[1] : null; }).filter(y => y !== null);
  return years.length ? Math.min(...years) : null;
}

// Folding keeps every character's length, so an offset into the folded text is the same offset into the original.
const foldChar = c => { if (c === '’' || c === '‘') return "'"; const d = c.normalize('NFD').replace(/[̀-ͯ]/g, ''); return d.length === c.length ? d : c; };
export const fold = s => Array.from(String(s), foldChar).join('');
const lower = s => Array.from(s, c => { const l = c.toLowerCase(); return l.length === c.length ? l : c; }).join('');
const clean = s => String(s ?? '').replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim();

const isWord = c => c !== undefined && /[\p{L}\p{N}]/u.test(c);
// A hyphen or apostrophe with letters on both sides is inside a word ("Anglo-Saxon", "d'Amboise"), except the
// possessive ’s, which may follow a match ("Alexander’s").
export function startsWord(t, i) {
  if (i === 0) return true;
  const p = t[i - 1];
  if (isWord(p)) return false;
  if ((p === '-' || p === "'") && isWord(t[i - 2])) return false;
  return true;
}
export function endsWord(t, j) {
  if (j >= t.length) return true;
  const n = t[j];
  if (isWord(n)) return false;
  if (n === "'" && isWord(t[j + 1])) return t[j + 1] === 's' && !isWord(t[j + 2]);
  if (n === '-' && isWord(t[j + 1])) return false;
  return true;
}

function addTo(trie, key, entry) {
  let node = trie;
  for (let k = 0; k < key.length; k++) { let next = node.get(key[k]); if (!next) { next = new Map(); node.set(key[k], next); } node = next; }
  let ends = node.get(END);
  if (!ends) node.set(END, (ends = []));
  ends.push(entry);
}
/** The longest dictionary string starting at t[i] that ends at a word boundary: { e, ends } or null. */
function longest(trie, t, i) {
  let node = trie, j = i, best = null;
  for (;;) {
    const ends = node.get(END);
    if (ends && j > i && endsWord(t, j)) best = { e: j, ends };
    if (j >= t.length) break;
    const next = node.get(t[j]);
    if (!next) break;
    node = next; j++;
  }
  return best;
}

/** The dictionary: two tries, names (matched exactly) and common nouns (matched in any case), from every entity's
    label and aliases under the rules above, with the book's decisions applied. An entry is
    { q, label, alias, exact (the alias is the entity's full name), proper, type, first (year), total, decided }. */
export function buildAliasIndex(entities, { decisions = {} } = {}) {
  const exact = new Map(), loose = new Map();
  const decided = new Map(); // folded string → { text, q } (q null: left untagged)
  const excluded = new Set();
  for (const [k, v] of Object.entries(decisions)) {
    if (/^Q\d+$/.test(k)) { if (v === null) excluded.add(k); else throw new Error(`decision ${k}: an entity's decision can only be null (left out)`); } else decided.set(fold(clean(k)), { text: clean(k), q: v });
  }
  let strings = 0;
  for (const e of entities.values()) {
    if (excluded.has(e.q)) continue;
    const label = clean(e.label), seen = new Set();
    for (const raw of [e.label, ...e.aliases]) {
      const s = clean(raw);
      if (!s) continue;
      const key = fold(s);
      if (seen.has(key)) continue;
      seen.add(key);
      if (decided.has(key)) continue;
      const proper = /^\p{Lu}/u.test(key), caps = proper && key === key.toUpperCase();
      if (proper ? key.length < (caps ? 2 : 3) : key.length < MIN_COMMON) continue;
      // A common noun matches only by the entity's own name: an idea's aliases are loose synonyms ("protection" for
      // protectionism, "burn" for combustion), where a person's or a place's are other names for the same thing.
      if (!proper && (!COMMON_TYPES.has(e.type) || s !== label)) continue;
      const entry = { q: e.q, label: e.label, alias: s, exact: s === label, proper, type: e.type, first: firstYear(e.facts), total: e.total, decided: false };
      if (proper) addTo(exact, key, entry); else addTo(loose, lower(key), entry);
      strings++;
    }
  }
  for (const [key, d] of decided) {
    if (!d.q) continue;
    const e = entities.get(d.q);
    if (!e) throw new Error(`decision "${d.text}" names ${d.q}, which the lake has no entry for`);
    const proper = /^\p{Lu}/u.test(key);
    const entry = { q: e.q, label: e.label, alias: d.text, exact: true, proper, type: e.type, first: firstYear(e.facts), total: e.total, decided: true };
    if (proper) addTo(exact, key, entry); else addTo(loose, lower(key), entry);
    strings++;
  }
  return { exact, loose, strings, decided, excluded };
}

/** The counts a human reads: per entity (with the strings it was matched as and one context), per entity skipped by
    the era rule, and per shared string resolved. */
export function newStats() {
  return {
    terms: 0, paragraphs: 0,
    byEntity: new Map(), // q → { q, label, type, first, count, aliases: Map(text → n), example }
    skipped: new Map(),  // q → { q, label, type, first, alias, count }
    ambiguous: new Map(), // "text → q (over q2, q3)" → n
  };
}
function context(text, s, e) {
  const a = Math.max(0, s - 45), b = Math.min(text.length, e + 45);
  return `${a > 0 ? '…' : ''}${text.slice(a, s)}[${text.slice(s, e)}]${text.slice(e, b)}${b < text.length ? '…' : ''}`.replace(/\n/g, ' ');
}

/** Which candidate a matched string means, by the era rule, the type order and the mention count. */
export function choose(ends, year, stats) {
  const decided = ends.find(c => c.decided);
  if (decided) return decided;
  const after = c => year != null && c.first != null && c.first > year;
  const pool = ends.filter(c => !after(c) || c.exact);
  if (stats) for (const c of ends) if (after(c) && !c.exact) {
    const s = stats.skipped.get(c.q) || { q: c.q, label: c.label, type: c.type, first: c.first, alias: c.alias, count: 0 };
    s.count++; stats.skipped.set(c.q, s);
  }
  if (!pool.length) return null;
  // Alive in the era first; then the entity whose own name the string is, before one that has it as an alias (the
  // Roman Empire before the Byzantine Empire for "Roman Empire"); then by type; then by the Encyclopaedia's mentions.
  if (pool.length > 1) pool.sort((a, b) => (after(a) - after(b)) || (b.exact - a.exact) || (TYPE_RANK.indexOf(a.type) - TYPE_RANK.indexOf(b.type)) || (b.total - a.total) || a.q.localeCompare(b.q));
  return pool[0];
}

/** The terms of one text: [{ s, e, qid, label }], offsets into `text`, sorted and non-overlapping. */
export function tagText(text, index, { year = null, stats = null } = {}) {
  const t = fold(text), tl = lower(t), out = [];
  for (let i = 0; i < t.length;) {
    if (!isWord(t[i]) || !startsWord(t, i)) { i++; continue; }
    const a = longest(index.exact, t, i), b = longest(index.loose, tl, i);
    const hit = a && (!b || a.e >= b.e) ? a : b;
    if (!hit) { i++; continue; }
    const c = choose(hit.ends, year, stats);
    // The longest string at this position is what the text means here, even when its entity is out of era: the
    // words inside it are not terms of their own ("Republic" in a skipped "Italian Republic").
    if (!c) { i = hit.e; continue; }
    out.push({ s: i, e: hit.e, qid: c.q, label: c.label });
    if (stats) {
      stats.terms++;
      const matched = text.slice(i, hit.e);
      const r = stats.byEntity.get(c.q) || { q: c.q, label: c.label, type: c.type, first: c.first, count: 0, aliases: new Map(), example: context(text, i, hit.e) };
      r.count++; r.aliases.set(matched, (r.aliases.get(matched) || 0) + 1); stats.byEntity.set(c.q, r);
      if (hit.ends.length > 1 && !c.decided) { const k = `"${matched}" → ${c.q} ${c.label} (over ${hit.ends.filter(x => x !== c).map(x => `${x.q} ${x.label}`).join(', ')})`; stats.ambiguous.set(k, (stats.ambiguous.get(k) || 0) + 1); }
    }
    i = hit.e;
  }
  return out;
}

/** Tags every paragraph of a book in place; returns the stats. */
export function tagBook(book, index, { year = null, stats = newStats() } = {}) {
  for (const c of book.chapters) for (const p of c.paragraphs) { p.terms = tagText(p.text, index, { year, stats }); stats.paragraphs++; }
  return stats;
}

const fmt = n => n.toLocaleString('en-GB');
/** The report as text. */
export function report(book, stats, index, { top = 40, year = null } = {}) {
  const rows = [...stats.byEntity.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const out = [];
  out.push(`${book.title}: ${fmt(book.chapters.length)} chapters, ${fmt(stats.paragraphs)} paragraphs, ${fmt(stats.terms)} terms, ${fmt(rows.length)} entities (dictionary of ${fmt(index.strings)} strings${year != null ? `, era rule at ${year}` : ''})`);
  out.push('', `Top ${Math.min(top, rows.length)} entities by matches:`);
  out.push('  count  qid         type          first  label                                 matched as                              e.g.');
  for (const r of rows.slice(0, top)) {
    const as = [...r.aliases].sort((a, b) => b[1] - a[1]).map(([t, n]) => (r.aliases.size > 1 ? `${t} (${n})` : t)).join(', ');
    out.push(`  ${String(r.count).padStart(5)}  ${r.q.padEnd(11)} ${r.type.padEnd(13)} ${String(r.first ?? '').padStart(5)}  ${r.label.slice(0, 36).padEnd(37)} ${as.slice(0, 38).padEnd(39)} ${r.example}`);
  }
  const skipped = [...stats.skipped.values()].sort((a, b) => b.count - a.count);
  out.push('', `Skipped by the era rule (first dated after ${year ?? '—'}, matched by a short alias, not the full name): ${fmt(skipped.reduce((n, s) => n + s.count, 0))} matches of ${fmt(skipped.length)} entities`);
  for (const s of skipped.slice(0, 15)) out.push(`  ${String(s.count).padStart(5)}  ${s.q.padEnd(11)} ${s.type.padEnd(13)} ${String(s.first).padStart(5)}  ${s.label.slice(0, 36).padEnd(37)} as "${s.alias}"`);
  const amb = [...stats.ambiguous].sort((a, b) => b[1] - a[1]);
  out.push('', `Shared strings resolved (era, then type, then mentions): ${fmt(amb.length)}`);
  for (const [k, n] of amb.slice(0, 15)) out.push(`  ${String(n).padStart(5)}  ${k}`);
  const dec = [...index.decided.values()];
  out.push('', `Decisions from the shelf: ${fmt(dec.length + index.excluded.size)}`);
  for (const d of dec) out.push(`  "${d.text}" → ${d.q ? `${d.q} ${stats.byEntity.get(d.q)?.label || ''} (${fmt(stats.byEntity.get(d.q)?.aliases.get(d.text) || 0)} matches)` : 'left untagged'}`);
  for (const q of index.excluded) out.push(`  ${q} left out`);
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: node bibliotheca/scripts/tag-terms.mjs <slug>'); process.exit(2); }
  const entry = shelfEntry(slug), book = readBook(slug);
  const index = buildAliasIndex(loadLake(), { decisions: entry.decisions });
  const year = entry.work.published;
  const stats = tagBook(book, index, { year });
  book.generated = new Date().toISOString();
  writeBook(book);
  writeIndex();
  console.log(report(book, stats, index, { year }));
}
