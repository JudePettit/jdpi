// A book's cast: the people, places, states, battles, wars, organisations and works its text names that the
// Encyclopaedia's lake does not know yet, each resolved to its Wikidata item (CC0), so the lake's Bibliotheca adapter
// (lake/scripts/adapters.mjs) feeds them into the lake and the tagger (tag-terms.mjs) finds them in the text.
//   node bibliotheca/scripts/cast.mjs <slug> [--refresh] [--offline]
//     --refresh   ask Wikidata again, though the cache has the answer
//     --offline   the cache alone: a name it has nothing for is left unresolved
//   then  node lake/scripts/build.mjs --only bibliotheca   (adds the cast to the committed lake; the monthly refresh
//                                                           builds it with everything else)
//   and   node bibliotheca/scripts/tag-terms.mjs <slug>    (the monthly refresh re-tags every book itself)
// The steps, each a pure function the tests run on fixtures (tests/bibliotheca-cast.test.mjs):
//   1. names (extractNames): capitalised words and runs of them, joined by of/the/de/da/di (and del, della, dei,
//      degli, delle, ad), that the lake does not tag, seen at least twice. A one-word name that is also a lower-case
//      word of the book is a common word wherever it stands ("Fortune", "Duke", a sentence's "Therefore"); one the
//      book never writes in lower case stays a name though it only opens sentences (a note's "Machiavelli"). A
//      sentence-initial common word before a name goes ("Thus Louis" is Louis); a title before a name stays ("Pope
//      Alexander"), a title of a place is the place ("the Duke of Urbino" names Urbino), an honorific goes ("Messer
//      Giorgio Scali"); a string the shelf has decided (shelf.mjs, `decisions`) is the shelf's, not the cast's. The
//      lake here is the lake less this cast's own entities and names (lakeWithoutCast), so a run after a lake build
//      finds the cast the run before it found;
//   2. candidates (candidates): Wikidata's search (wbsearchentities) for the name as written, with its ordinals as
//      Roman numerals ("Louis the Twelfth" → "Louis XII") and without its title; each result read (wbgetentities)
//      for its type (P31, through its classes' labels), dates (P569/P570 born and died, P571/P576 founded and
//      dissolved, P580/P582 and P585 for a war or a battle, P577 published, P1317 flourished), description, aliases
//      and English Wikipedia title; and, on a second pass, the picks of the book's other names, which count when the
//      name matches them ("Pandolfo" is the book's Pandolfo Petrucci). A candidate counts only as a person, place,
//      polity, battle, war, organisation or work (KINDS) first dated by the bound: for a name the text uses, the time
//      the text was written, the later of the era's end and the work's publication (tests/bibliotheca-data.test.mjs
//      holds every term of the text to it); for a name only a translator's note uses, the work's publication (the
//      tagger's own era rule, tag-terms.mjs, which a later name passes only in full); an undated one only when it is
//      well known (UNDATED_SITELINKS): a town in Arkansas named Alexander is not what a classic means;
//   3. the pick and its confidence (candidates' rank, confidence): the pick is the best by match (MATCH), era fit
//      (ERA) and how well known it is (sitelinks), so a famous referent beats an obscure namesake that has the exact
//      label; the confidence adds the book's mentions and the lead over the next candidate (CONFIDENCE). Held for
//      review whatever it scores (holds, hazards): a match on the start of a label alone, a rival close behind, a
//      one-word name for a little-known item or one the book's longer names give to two entities ("Alexander"), a
//      name the tagger would match as a common word ("The Prince" is "Prince" to it), a string that tags something
//      else in the book now, or an alias that is the book's name for another of its entities;
//   4. decisions (decide): at or over the threshold and unheld 'auto', fed to the lake; otherwise 'review', fed only
//      when a human flips it. The threshold and the overrides (a name → an entity, 'auto', 'review' or 'skip'; an
//      entity → 'skip') live in the cast file's header, and a new run keeps them; an override cannot bring in an item
//      dated after the bound. Names of one entity with one decision are one record. A given name, alone or after a
//      regnal title, that the entity does not have on Wikidata ("Julian" for Didius Julianus, "Pope Alexander" for
//      Alexander VI) stays the book's own (`local`): the entity is fed, but not the name, which would tag him in every
//      book; the report proposes the shelf decision that gives it to him in this one. An override's "local": true
//      makes its name the book's own too, for what the given-name test cannot see: a title ("San Giorgio", Cardinal
//      Riario's), a name the other books give other men ("Cyrus": Thucydides' is Cyrus the Younger), or a name the book
//      means one thing by and the lake another ("Naples": the Prince's is the Kingdom); its "shelf": false proposes no
//      decision, its note saying why (the Prince's bare "Charles" is Charles VIII, Charles VII and Charles the Bold).
//      A shelf decision that gives a name to an entity the cast feeds (an 'auto' record's, or an override's) is the
//      cast's to keep: the run leaves it out of its own dictionary, so the name is still found and its record, and the
//      entity the decision names, stay in the lake.
// The lake is the shelf's: an entity a cast feeds is tagged in every book that names it (the Prince's cast brought
// Africa, Asia, Sicily and Septimius Severus, whom Gibbon and Smith are tagged with too), so a record dropped, moved to
// another entity or made book-only takes those terms from the other books at their next re-tag (tag-terms.mjs; the
// monthly refresh re-tags them all). After a change to a cast, re-tag every book and read the counts.
// The cast file, bibliotheca/data/cast/<slug>.json (castJson: the head a field a line, every record on a line):
//   { slug, title, author, year, era, bound: { text, notes }, generated, threshold, rules, counts,
//     overrides: [ { name | qid, qid? , decision?, local?, shelf?, note } ],
//     records: [ { name, aliases, local, qid, label, type, dates, description, mentions, first: { ch, p }, contexts,
//                  confidence, decision: 'auto' | 'review', why } ],
//     skipped: [ { name, aliases, qid, label, mentions, note } ],      the overrides' 'skip', for the record
//     unresolved: [ { name, mentions, first, contexts, why } ] }
// and its report, bibliotheca/data/cast/<slug>.txt (report). Wikidata is asked through its API with a descriptive
// User-Agent, a request a second at most, and every answer is kept in bibliotheca/scripts/cache/wikidata/ (not
// committed), so a second run asks nothing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DATA, CACHE, shelfEntry, readBook } from './shelf.mjs';
import { LAKE, buildAliasIndex, tagText, fold } from './tag-terms.mjs';
import { recordAliases } from '../../lake/scripts/aliases.mjs';

export const CAST = join(DATA, 'cast');
export const castPath = slug => join(CAST, `${slug}.json`);
export const reportPath = slug => join(CAST, `${slug}.txt`);
export const WD_CACHE = join(CACHE, 'wikidata');
export const DEFAULT_THRESHOLD = 0.75;
export const MIN_MENTIONS = 2;
export const KINDS = ['person', 'place', 'polity', 'battle', 'war', 'organisation', 'work'];
// How well known an item is: the Wikimedia sites with a page on it (sitelinks), on a log scale, full at about 200.
// The people and places a classic names are nearly always known across Wikipedias; a namesake with an exact label
// (an archbishop called Pandolfo, a town in Indiana called English) seldom is.
export const known = sitelinks => Math.min(1, Math.log10(1 + sitelinks) / 2.3);
// An undated candidate (no birth, death, founding or event date) is a namesake unless at least this well known.
export const UNDATED_SITELINKS = 20;
// A one-word name ("Severus", "Vaila") names many things: it is held for review unless its pick is this well known.
export const ONE_WORD_SITELINKS = 40;
// How a name matches an item (matchOf): the label; an alias; all its words in order in a label or alias ("Francesco
// Sforza" in "Francesco I Sforza"; one word in a longer name, "Cesare" in "Cesare Borgia", is weaker); the name
// without its title; or only the start of a longer label (what Wikidata's prefix search found).
export const MATCH = { label: 1, alias: 0.9, words: 0.75, untitled: 0.6, word: 0.55, prefix: 0.35 };
// How its dates fit the era (eraFit): alive or standing in it, earlier (or of legend), undated.
export const ERA = { in: 1, earlier: 0.9, legend: 0.9, undated: 0.6 };
// The order candidates are picked in (rank): the match, the era fit and how well known each is, so a famous referent
// that matches by an alias beats an obscure one that matches by its label (Francesco I Sforza, 45 sitelinks, over a
// Francesco Sforza of 11); the era decides between equals, a person alive in it first.
const RANK = { match: 0.3, era: 0.2, known: 0.5 };
// The confidence of a pick, 0 to 1: the match, the era fit, how well known it is, the book's mentions (log scale, full
// at 16) and its lead over the next candidate in rank (full at RANK_MARGIN). Held for review whatever it scores (holds
// in decide): a match on the start of a label alone, a rival within CLOSE in rank, a one-word name for an item known to
// fewer than ONE_WORD_SITELINKS sites or that the book's longer names give to more than one entity, and the hazards.
export const CONFIDENCE = { match: 0.35, era: 0.2, known: 0.15, mentions: 0.15, margin: 0.15 };
const RANK_MARGIN = 0.3, CLOSE = 0.06;
const UA = 'PRP-Bibliotheca/1.0 (https://jdpi.pages.dev; bibliotheca/scripts/cast.mjs)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lower = s => Array.from(String(s), c => { const l = c.toLowerCase(); return l.length === c.length ? l : c; }).join('');
// The tagger's cleaning of a dictionary string (tag-terms.mjs): a leading "the" dropped, spaces collapsed.
const clean = s => String(s ?? '').replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim();
/** A name for comparing: the tagger's cleaning, accents folded, lower case. */
export const nameKey = s => lower(fold(clean(s)));
const round = x => Math.round(x * 100) / 100;
const yearOf = d => { const m = String(d ?? '').match(/^(-?\d{1,4})/); return m ? +m[1] : null; };
const fmtYear = y => (y < 0 ? `${-y} BC` : String(y));

/* ---------- 1. Names ---------- */

const WORD = /[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu;
export const JOINS = new Set(['of', 'the', 'de', 'da', 'di', 'del', 'della', 'dei', 'degli', 'delle', 'ad']);
export const TITLES = new Set(['Pope', 'King', 'Queen', 'Emperor', 'Empress', 'Duke', 'Duchess', 'Prince', 'Princess', 'Count', 'Countess',
  'Marquess', 'Marquis', 'Marchioness', 'Cardinal', 'Bishop', 'Archbishop', 'Sultan', 'Soldan', 'Doge', 'Consul', 'Tsar', 'Czar', 'Caliph', 'Shah', 'Lord', 'Lady']);
export const HONORIFICS = new Set(['Messer', 'Mr', 'Mrs', 'Sir', 'Dr', 'Madonna', 'Monsignor', 'Signor', 'Signore', 'Ser', 'Don', 'Dom', 'Magnificent', 'Illustrious']);
// A heading-like word before a number is a reference, not a name ("Chapter VII", "Book III").
const REFERENCE = /^(Chapter|Book|Part|Canto|Vol|Volume|Section|Note|Page|Ch|Cap|Lib|Art|Fig|Plate)$/;
const ROMAN = /^[IVXLCDM]+$/;
// Capitalised: an upper-case first letter, or an elided particle before one ("d’Orco", "dell’Anguillara").
const capital = w => /^\p{Lu}/u.test(w) || /^\p{Ll}{1,4}[’']\p{Lu}/u.test(w);

/** Whether the word at t[s] opens a sentence: the paragraph's or a verse line's start, or after . ! ? : ; (through any
    opening quote or bracket, and through a closing quote after a full stop), or after a note's "[n]" marker. */
export function sentenceInitial(t, s) {
  let k = s - 1;
  while (k >= 0 && /[\s“‘"'(\[]/.test(t[k])) { if (t[k] === '\n') return true; k--; }
  if (k < 0) return true;
  const c = t[k];
  if (/[.!?:;\]]/.test(c)) return true;
  if (/[”’")]/.test(c)) return /[.!?]/.test(t[k - 1] || '');
  return false;
}

/** The book's lower-case words (folded), possessives off: a capitalised word that is one of them is a common word. */
export function commonWords(book) {
  const out = new Set();
  for (const c of book.chapters) for (const p of c.paragraphs) for (const m of fold(p.text).matchAll(WORD)) if (/^\p{Ll}/u.test(m[0])) out.add(lower(m[0].replace(/'s$/, '')));
  return out;
}

const context = (text, s, e) => {
  const a = Math.max(0, s - 45), b = Math.min(text.length, e + 45);
  return `${a > 0 ? '…' : ''}${text.slice(a, s)}[${text.slice(s, e)}]${text.slice(e, b)}${b < text.length ? '…' : ''}`.replace(/\n/g, ' ');
};

/** The names of a book the index does not tag (the steps in the header, 1). `index` is the tagger's dictionary
    (buildAliasIndex) and `year` its era year. Returns [{ name, spellings, mentions, initial, notesOnly, first: { ch, p },
    contexts }], most mentioned first; `spellings` are the other ways the text writes the same name (accents, case). */
export function extractNames(book, index, { year = null, minMentions = MIN_MENTIONS, common = commonWords(book) } = {}) {
  const found = new Map();
  const isCommon = w => common.has(lower(fold(w)));
  const add = (run, p, ch) => {
    const t = p.text;
    let r = run.slice();
    for (;;) {
      if (!r.length) return;
      const w = r[0].w;
      if (HONORIFICS.has(w) || JOINS.has(lower(w))) { r.shift(); continue; }
      if (TITLES.has(w) && r[1]?.w === 'of') { r.splice(0, 2); continue; }
      if (r.length > 1 && !TITLES.has(w) && sentenceInitial(t, r[0].s) && isCommon(w)) { r.shift(); continue; }
      break;
    }
    while (r.length && JOINS.has(lower(r.at(-1).w))) r.pop();
    if (!r.length || REFERENCE.test(r[0].w)) return;
    if (r.length === 1 ? r[0].w.length < 2 || ROMAN.test(r[0].w) || isCommon(r[0].w) : r.every(x => ROMAN.test(x.w) || JOINS.has(lower(x.w)))) return;
    const name = t.slice(r[0].s, r.at(-1).e), k = nameKey(name);
    const f = found.get(k) || { spellings: new Map(), n: 0, initial: 0, notes: 0, occ: [], words: r.length };
    f.spellings.set(name, (f.spellings.get(name) || 0) + 1);
    f.n++;
    if (sentenceInitial(t, r[0].s)) f.initial++;
    if (p.kind === 'note') f.notes++;
    f.occ.push({ ch, p: p.id, text: t, s: r[0].s, e: r.at(-1).e });
    found.set(k, f);
  };
  for (const c of book.chapters) for (const p of c.paragraphs) {
    const t = p.text, taken = new Uint8Array(t.length);
    for (const term of tagText(t, index, { year })) taken.fill(1, term.s, term.e);
    const toks = [];
    for (const m of t.matchAll(WORD)) {
      let w = m[0], e = m.index + w.length, poss = false;
      if (/[’']s$/.test(w) && w.length > 3) { w = w.slice(0, -2); e -= 2; poss = true; }
      toks.push({ w, s: m.index, e, poss, free: !taken.subarray(m.index, e).some(Boolean) });
    }
    let run = [];
    const flush = () => { if (run.length) add(run, p, c.n); run = []; };
    for (const tk of toks) {
      const prev = run.at(-1);
      if (prev) {
        const gap = t.slice(prev.e, tk.s);
        // One space between the words of a name; "de’ Medici" keeps its elision.
        if (prev.poss || !(gap === ' ' || (/^d[ei]?$/i.test(prev.w) && /^[’'] $/.test(gap)))) flush();
      }
      if (tk.free && (capital(tk.w) || (run.length && JOINS.has(tk.w)))) { run.push(tk); if (tk.poss) flush(); } else flush();
    }
    flush();
  }
  const out = [];
  for (const f of found.values()) {
    if (f.n < minMentions) continue;
    const [name] = [...f.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (index.decided?.has(fold(clean(name)))) continue;
    const seen = new Set(), contexts = [];
    for (const o of f.occ) { if (seen.has(o.p) || contexts.length >= 3) continue; seen.add(o.p); contexts.push(`${o.p}: ${context(o.text, o.s, o.e)}`); }
    out.push({ name, spellings: [...f.spellings.keys()].filter(s => s !== name), mentions: f.n, initial: f.initial, notesOnly: f.notes === f.n,
      first: { ch: f.occ[0].ch, p: f.occ[0].p }, contexts });
  }
  return out.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}

// The lake build's relations that bring an entity a page of its own (build.mjs, PAGE_RELATIONS, by their REL names).
const PAGE_RELATIONS = new Set(['Party', 'Ideology', 'Movement', 'Country', 'Citizenship', 'Conflicts', 'Influenced by']);

/** The lake as the tagger reads it (tag-terms.mjs, loadLake), less what this book's own cast put there: the entities
    only this book's cast mentions, the related entities the lake build fetched for those alone (no mentions, and no
    entity that stays relates to them: the Crown of Aragon of Ferdinand of Aragon), and the names the cast gave the
    others. A name the cast found stays the cast's when the lake has learnt it from the cast, so a run after a lake
    build finds the same cast as the run before it. */
export function lakeWithoutCast(slug, previous = null, dir = LAKE) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const own = new Set((previous?.records || []).flatMap(r => [r.name, ...(r.aliases || [])]).map(nameKey));
  const mine = m => m.m === 'bibliotheca' && String(m.u).includes(`#book=${slug}&`);
  const all = new Map();
  for (let i = 0; i < manifest.shards.entities; i++) for (const [q, r] of Object.entries(JSON.parse(readFileSync(join(dir, `e/${i}.json`), 'utf8')))) all.set(q, r);
  const related = r => Object.entries(r.rel || {}).filter(([k]) => PAGE_RELATIONS.has(k)).flatMap(([, list]) => list.map(([x]) => x));
  const gone = new Set([...all].filter(([, r]) => r.mentions?.length && r.mentions.every(mine)).map(([q]) => q));
  const kept = new Set([...all].filter(([q, r]) => !gone.has(q) && r.mentions?.length).flatMap(([, r]) => related(r)));
  for (const q of [...gone]) for (const x of related(all.get(q))) if (all.has(x) && !all.get(x).mentions?.length && !kept.has(x)) gone.add(x);
  const entities = new Map();
  for (const [q, r] of all) {
    if (gone.has(q)) continue;
    entities.set(q, { q, label: r.label, type: r.type, aliases: (r.aliases || []).filter(a => !own.has(nameKey(a))), facts: r.facts || {}, total: r.total || 0 });
  }
  return entities;
}

/* ---------- 2. Wikidata ---------- */

const API = 'https://www.wikidata.org/w/api.php';
const DATE_PROPS = { P569: 'born', P570: 'died', P571: 'founded', P576: 'dissolved', P580: 'start', P582: 'end', P585: 'date', P577: 'published', P1317: 'floruit' };

/** A Wikidata time value as text: "1475-09-13", "1494-08", "-0356" (356 BC), by its precision. */
export function wdTime(v) {
  const m = String(v?.time || '').match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
  if (!m) return null;
  const y = `${m[1] === '-' ? '-' : ''}${m[2].replace(/^0+(?=\d{4})/, '').padStart(4, '0')}`;
  return v.precision >= 11 ? `${y}-${m[3]}-${m[4]}` : v.precision === 10 ? `${y}-${m[3]}` : y;
}

/** What the cast keeps of a wbgetentities entity. The label and aliases are the English ones the lake build keeps
    (lake/scripts/build.mjs: the label, else the English Wikipedia title; the first six aliases), and each date is the
    first statement's, as the lake's facts have it, so the era the cast checks is the era the tagger and the data test
    will read. */
export function trimEntity(e) {
  const value = c => c?.mainsnak?.datavalue?.value;
  const dates = {};
  for (const [p, k] of Object.entries(DATE_PROPS)) { const d = wdTime(value((e.claims?.[p] || [])[0])); if (d) dates[k] = d; }
  return {
    id: e.id, label: e.labels?.en?.value || e.sitelinks?.enwiki?.title || null, description: e.descriptions?.en?.value || '',
    aliases: (e.aliases?.en || []).map(a => a.value),
    p31: (e.claims?.P31 || []).filter(c => c.rank !== 'deprecated').map(c => value(c)?.id).filter(Boolean),
    dates, sitelinks: Object.keys(e.sitelinks || {}).length, wiki: e.sitelinks?.enwiki?.title || null,
  };
}

/** A Wikidata client that keeps every answer: search(query), entities(ids), classes(ids). At most one request a second
    (Wikimedia's API etiquette for a script), maxlag=5, and a failed request tried again with a growing pause; an answer
    is cached only when it came back whole. `offline` answers from the cache alone (null for what it lacks). */
export function wikidata({ dir = WD_CACHE, refresh = false, offline = false, log = () => {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const files = { search: join(dir, 'search.json'), entities: join(dir, 'entities.json'), classes: join(dir, 'classes.json') };
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
  const cache = refresh ? { search: {}, entities: {}, classes: {} } : { search: read(files.search), entities: read(files.entities), classes: read(files.classes) };
  const stats = { requests: 0, cached: 0 };
  let last = 0;
  async function get(params) {
    for (let attempt = 1; ; attempt++) {
      const wait = last + 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      stats.requests++;
      try {
        const r = await fetch(`${API}?${new URLSearchParams({ format: 'json', maxlag: '5', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { retryAfter: +r.headers.get('retry-after') || 0 });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(`${j.error.code}: ${j.error.info}`), { retryAfter: j.error.code === 'maxlag' ? 5 : 0 });
        return j;
      } catch (e) {
        if (attempt >= 5) throw new Error(`Wikidata: ${e.message} (${params.action} ${params.search || params.ids || ''})`);
        log(`  Wikidata: ${e.message}; trying again`);
        await sleep(Math.max(e.retryAfter * 1000 || 0, 3000 * attempt));
      }
    }
  }
  const save = k => writeFileSync(files[k], JSON.stringify(cache[k]));
  return {
    stats,
    /** The first ten items whose English label or alias starts with the query: [{ id, label, description, match }]. */
    async search(query) {
      if (query in cache.search) { stats.cached++; return cache.search[query]; }
      if (offline) return null;
      const j = await get({ action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', type: 'item', limit: '10' });
      cache.search[query] = (j.search || []).map(x => ({ id: x.id, label: x.label || '', description: x.description || '', match: x.match ? { type: x.match.type, text: x.match.text } : null }));
      save('search');
      return cache.search[query];
    },
    /** The items (trimEntity), by id; null for one that does not exist; absent offline when the cache lacks it. */
    async entities(ids) {
      const need = [...new Set(ids)].filter(q => !(q in cache.entities));
      stats.cached += ids.length - need.length;
      if (!offline) for (let i = 0; i < need.length; i += 50) {
        const batch = need.slice(i, i + 50);
        const j = await get({ action: 'wbgetentities', ids: batch.join('|'), props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en' });
        for (const q of batch) cache.entities[q] = null;
        for (const [q, e] of Object.entries(j.entities || {})) if (!e.missing) cache.entities[e.id || q] = trimEntity(e);
        save('entities');
      }
      return new Map(ids.filter(q => q in cache.entities).map(q => [q, cache.entities[q]]));
    },
    /** The English labels of classes (the values of P31), by id. */
    async classes(ids) {
      const need = [...new Set(ids)].filter(q => !(q in cache.classes));
      if (!offline) for (let i = 0; i < need.length; i += 50) {
        const batch = need.slice(i, i + 50);
        const j = await get({ action: 'wbgetentities', ids: batch.join('|'), props: 'labels', languages: 'en' });
        for (const q of batch) cache.classes[q] = j.entities?.[q]?.labels?.en?.value || '';
        save('classes');
      }
      return new Map(ids.filter(q => q in cache.classes).map(q => [q, cache.classes[q]]));
    },
  };
}

/* ---------- 3. Candidates and the pick ---------- */

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth',
  'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
/** "Louis the Twelfth" → "Louis XII": the ordinal after a name as the Roman numeral Wikidata's labels use. */
export const romanOrdinals = name => name.replace(new RegExp(`\\bthe (${ORDINALS.join('|')})\\b`, 'g'), (_, o) => NUMERALS[ORDINALS.indexOf(o)]);
/** The name without the title before it ("Pope Julius" → "Julius"), or null when it has none. */
export const untitled = name => { const [w, ...rest] = name.split(' '); return TITLES.has(w) && rest.length ? rest.join(' ') : null; };
/** What Wikidata is asked for a name: as written, with Roman numerals, without its title. */
export function queries(name) {
  const bare = untitled(name);
  return [...new Set([name, romanOrdinals(name), ...(bare ? [bare, romanOrdinals(bare)] : [])])];
}

/// What a candidate is, from the English labels of its classes (P31), so a new class needs no list: the first rule a
// class label matches is its kind. A class none of them matches (a given name, a film, a ship, a taxon, a Wikimedia
// page, a deity) makes no cast member; a battle before a war before a state before a place … when an item has several.
const NOT_KIND = /\b(given name|family name|surname|disambiguation|wikimedia|taxon|species|genus|scholarly|article|encyclopedia|dictionary|asteroid|minor planet|ship|film|television|video game|album|song|single|band|software|website|journal|newspaper|magazine|award|street|road|railway|station|school|university|hospital|team|club|brand|product|chemical|edition|version|translation|statue|star|crater)\b/;
const KIND_RULES = [
  ['battle', /\b(battle|siege|sack|skirmish|naval engagement)\b/],
  ['war', /\b(war|military campaign|campaign|armed conflict|military conflict|rebellion|revolt|uprising|invasion|conquest|crusade|military expedition)\b/],
  ['polity', /\b(country|sovereign state|state|kingdom|empire|duchy|principality|republic|city-state|polis|marquisate|margraviate|march|county|lordship|signoria|seigniory|confederation|confederacy|caliphate|sultanate|khanate|emirate|satrapy|realm|monarchy|theocracy|polity|medieval commune|dominion|protectorate|vassal state|civilization)\b/],
  ['place', /\b(city|town|village|comune|commune|municipality|frazione|hamlet|settlement|capital|port|island|archipelago|peninsula|region|province|territory|river|lake|mountain|mountain range|valley|sea|strait|gulf|bay|cape|plain|desert|forest|continent|castle|fortress|fort|citadel|archaeological site|church building|basilica|cathedral|abbey|monastery|palace|area)\b/],
  ['organisation', /\b(organization|organisation|company|family|dynasty|royal house|noble house|clan|religious order|military order|guild|army|military unit|mercenary|political party|faction|league|alliance|coalition|legislature|senate|council|assembly|institution|church|bank)\b/],
  ['work', /\b(literary work|written work|work of art|creative work|book|poem|epic poem|treatise|text|play|painting|sculpture|essay|dialogue|chronicle|manuscript|scripture|novel)\b/],
  // People of legend count (Theseus, Achilles, the centaur Chiron); gods do not: a deity is no one's cast.
  ['person', /\b(mythological|mythical|legendary|biblical|fictional|folkloric)\b.*\b(human|character|figure|hero|king|being|person)\b|\b(demigod|centaur|prophet|human biblical figure)\b|^hero$/],
];
const LEGEND = /\b(mythological|mythical|legendary|biblical|demigod|centaur|prophet|hero)\b/;

/** { kind, legendary } of an item from its classes' labels (Map id → label); kind null when it is none of KINDS. */
export function kindOf(entity, classLabels) {
  if (entity.p31.includes('Q5')) return { kind: 'person', legendary: false };
  let best = null, legendary = false;
  for (const c of entity.p31) {
    const label = lower(classLabels.get(c) || '');
    if (!label || NOT_KIND.test(label)) continue;
    const i = KIND_RULES.findIndex(([, re]) => re.test(label));
    if (i >= 0 && (best === null || i < best)) best = i;
    if (i >= 0 && KIND_RULES[i][0] === 'person' && LEGEND.test(label)) legendary = true;
  }
  return { kind: best === null ? null : KIND_RULES[best][0], legendary };
}

/** The first year the lake will date an item by (tag-terms.mjs firstYear over the lake's facts: born, founded,
    started or held), from the cast's dates. */
export const lakeFirst = dates => { const ys = ['born', 'founded', 'start', 'date'].map(k => yearOf(dates[k])).filter(y => y !== null); return ys.length ? Math.min(...ys) : null; };

/** How an item's dates fit a book whose era is [from, to], for a name bound by `bound` (the steps in the header, 2):
    { fit: ERA.in alive or standing in the era, ERA.earlier (or ERA.legend), ERA.undated, 0 dated after the bound; why }. */
export function eraFit(entity, kind, { era, bound, legendary = false }) {
  const d = entity.dates || {}, [from, to] = era;
  const first = lakeFirst(d);
  if (first !== null && first > bound) return { fit: 0, why: `first dated ${fmtYear(first)}, after ${fmtYear(bound)}` };
  const y = k => yearOf(d[k]);
  let a, b;
  if (kind === 'person') { a = y('born') ?? y('floruit'); b = y('died'); if (a === null && b !== null) a = b - 70; if (b === null && a !== null) b = a + 90; }
  else if (kind === 'battle' || kind === 'war') { a = y('date') ?? y('start'); b = y('end') ?? y('date') ?? a; }
  else if (kind === 'work') { a = y('published') ?? y('founded') ?? y('date'); b = null; }
  else { a = y('founded') ?? y('start'); b = y('dissolved') ?? y('end'); }
  if (a === null && b === null) return legendary ? { fit: ERA.legend, why: 'of legend' } : { fit: ERA.undated, why: 'undated' };
  if (a !== null && a > bound) return { fit: 0, why: `dated ${fmtYear(a)}, after ${fmtYear(bound)}` };
  const span = `${a === null ? '' : fmtYear(a)}–${b === null ? '' : fmtYear(b)}`;
  if (kind === 'work') return a >= from ? { fit: ERA.in, why: `${fmtYear(a)}, in the era` } : { fit: ERA.earlier, why: `${fmtYear(a)}, before the era` };
  if ((a ?? -Infinity) <= to && (b ?? Infinity) >= from) return { fit: ERA.in, why: `${span}, in the era ${fmtYear(from)}–${fmtYear(to)}` };
  return { fit: ERA.earlier, why: `${span}, before the era` };
}

const wordsOf = s => nameKey(s).split(/[\s\-]+/).filter(Boolean);
/** Whether the words of a name come in order among the words of a label, none of them only a place after "of" there
    (a title's place or a toponymic is not the name: "Duke of Romagna" is not Romagna, "Oliverotto da Fermo" not Fermo). */
export function within(name, label) {
  const n = wordsOf(name), l = wordsOf(label);
  let j = 0;
  for (let i = 0; i < l.length && j < n.length; i++) {
    if (l[i] !== n[j]) continue;
    if (i > 0 && JOINS.has(l[i - 1]) && !(j > 0 && n[j - 1] === l[i - 1])) continue;
    j++;
  }
  return j === n.length;
}

/** How a name matches an item (MATCH): 'label', 'alias', 'words' (or 'word' for a one-word name), 'untitled' (the
    name without its title is the label or an alias, and the title is in its label, description or aliases), or, for
    an item Wikidata's search returned, 'prefix'; null when an item the book's other names brought (`searched` false)
    does not match at all. A form with Roman numerals counts as the name ("Alexander the Sixth", "Alexander VI"). */
export function matchOf(entity, name, { searched = true } = {}) {
  const forms = [...new Set([name, romanOrdinals(name)])], keys = new Set(forms.map(nameKey));
  const strings = [entity.label, ...entity.aliases].filter(Boolean);
  if (entity.label && keys.has(nameKey(entity.label))) return 'label';
  if (entity.aliases.some(a => keys.has(nameKey(a)))) return 'alias';
  const oneWord = !/\s/.test(name.trim());
  if (!oneWord && forms.some(f => strings.some(s => within(f, s)))) return 'words';
  const bare = untitled(name);
  if (bare) {
    const bareKeys = new Set([bare, romanOrdinals(bare)].map(nameKey)), title = lower(name.split(' ')[0]);
    if (strings.some(s => bareKeys.has(nameKey(s))) && lower([entity.label, entity.description, ...entity.aliases].join(' ')).includes(title)) return 'untitled';
  }
  if (oneWord && strings.some(s => within(name, s))) return 'word';
  return searched ? 'prefix' : null;
}

/** Every candidate for a name, evaluated, best first: [{ q, label, description, kind, legendary, dates, sitelinks,
    aliases, match, era, eraWhy, known, rank, rejected? }]. `ids` are what Wikidata's search returned for the name;
    `pooled` the book's other names' picks, which count only when the name matches them (a short name of the book is
    often its longer one: "Cesare" for Cesare Borgia, which the search for "Cesare" does not return). `entities` and
    `classLabels` are Maps from the Wikidata client. */
export function candidates(name, ids, entities, classLabels, { era, bound, excluded = new Set(), pooled = [] }) {
  const out = [], searched = new Set(ids);
  for (const q of [...new Set([...ids, ...pooled])]) {
    const e = entities.get(q);
    if (!e) continue;
    const match = matchOf(e, name, { searched: searched.has(q) });
    if (!match) continue;
    const { kind, legendary } = kindOf(e, classLabels);
    const c = { q, label: e.label || q, description: e.description, kind, legendary, dates: e.dates, sitelinks: e.sitelinks, wiki: e.wiki, aliases: e.aliases, match };
    const fit = kind ? eraFit(e, kind, { era, bound, legendary }) : { fit: 0, why: 'not a person, place, polity, battle, war, organisation or work' };
    c.era = fit.fit; c.eraWhy = fit.why;
    c.known = round(known(e.sitelinks));
    // A hard rejection binds a human's override too: an item dated after the bound would be skipped by the tagger and
    // refused by the data test, and one the shelf leaves out is never tagged in the book.
    if (excluded.has(q)) { c.rejected = 'the shelf leaves it out of this book'; c.hard = true; }
    else if (!kind) c.rejected = fit.why;
    else if (!fit.fit) { c.rejected = fit.why; c.hard = true; }
    else if (fit.fit === ERA.undated && e.sitelinks < UNDATED_SITELINKS) c.rejected = `undated and little known (${e.sitelinks} sitelinks): a namesake`;
    c.rank = round(RANK.match * MATCH[match] + RANK.era * c.era + RANK.known * c.known);
    out.push(c);
  }
  return out.sort((a, b) => !!a.rejected - !!b.rejected || b.rank - a.rank || b.sitelinks - a.sitelinks || a.q.localeCompare(b.q));
}

/** The confidence of a pick (CONFIDENCE) and the reasons in words. */
export function confidence(pick, runnerUp, mentions) {
  const m = Math.min(1, Math.log2(Math.max(1, mentions)) / 4);
  const margin = runnerUp ? Math.max(0, Math.min(1, (pick.rank - runnerUp.rank) / RANK_MARGIN)) : 1;
  const score = round(CONFIDENCE.match * MATCH[pick.match] + CONFIDENCE.era * pick.era + CONFIDENCE.known * pick.known + CONFIDENCE.mentions * m + CONFIDENCE.margin * margin);
  const matchWhy = { label: 'the name is its label', alias: 'the name is one of its aliases', words: 'the name’s words are in its name', word: 'the name is one word of its name',
    untitled: 'the name without its title is its name', prefix: 'only the start of its name matches' }[pick.match];
  const rival = runnerUp ? `next: ${runnerUp.q} ${runnerUp.label}` : 'no other candidate';
  return { score, why: `${matchWhy}; ${pick.eraWhy}; ${pick.sitelinks} sitelinks; ${mentions} mention${mentions === 1 ? '' : 's'}; ${rival}` };
}

/** The aliases the lake build keeps of an item (lake/scripts/build.mjs, record, by lake/scripts/aliases.mjs): its first
    six, tidied (a trailing comma goes, and the full stop after a regnal number; an abbreviation's stays: "With."). */
export const lakeAliases = item => recordAliases(item.aliases || [], item.label);

/** What feeding a pick would do to the book besides naming it (the steps in the header, 3): its names as the tagger
    would hold them (the label, the first six aliases, the book's own names) that are a common word of the book, or a
    string that tags something else in it now. */
export function hazards(pick, names, { common, termStrings }) {
  const out = [];
  for (const s of new Set([pick.label, ...lakeAliases(pick), ...names].map(clean).filter(Boolean))) {
    if (!/\s/.test(s) && /^\p{Lu}/u.test(s) && common.has(lower(fold(s)))) out.push(`"${s}" is a common word of the book`);
    const other = termStrings.get(fold(s));
    if (other && other !== pick.q) out.push(`"${s}" tags ${other} in the book now`);
  }
  return out;
}

/** Why a pick is held for review whatever its confidence (the holds in CONFIDENCE's note): [reason]. `bookRivals` are
    the entities the book's longer names containing this one-word name were given. */
export function holds(name, pick, runnerUp, { bookRivals = [] } = {}) {
  const out = [];
  if (pick.match === 'prefix') out.push('only the start of its name matches');
  if (runnerUp && pick.rank - runnerUp.rank < CLOSE) out.push(`${runnerUp.q} ${runnerUp.label} is close behind`);
  if (!/\s/.test(name.trim()) && pick.sitelinks < ONE_WORD_SITELINKS) out.push(`a one-word name for an item known to ${pick.sitelinks} sites`);
  if (bookRivals.length > 1) out.push(`the book's longer names give "${name}" to ${bookRivals.map(r => `${r.q} ${r.label} (${r.names.join(', ')})`).join(' and ')}`);
  return out;
}

/* ---------- 4. Decisions ---------- */

const DECISIONS = new Set(['auto', 'review', 'skip']);
/** The override that applies to a name or an entity: the last one for the name, else the last one for the entity. */
export function overrideFor(overrides, name, qid) {
  const k = nameKey(name);
  for (const o of overrides || []) {
    if (o.decision && !DECISIONS.has(o.decision)) throw new Error(`override ${JSON.stringify(o)}: a decision is auto, review or skip`);
    if (!o.name && !o.qid) throw new Error(`override ${JSON.stringify(o)}: it needs a name or a qid`);
    if (o.qid && !/^Q[1-9]\d*$/.test(o.qid)) throw new Error(`override ${JSON.stringify(o)}: ${o.qid} is not a Wikidata ID`);
    for (const k of ['local', 'shelf']) if (k in o && typeof o[k] !== 'boolean') throw new Error(`override ${JSON.stringify(o)}: "${k}" is true or false`);
    if ((o.local || o.shelf === false) && !o.name) throw new Error(`override ${JSON.stringify(o)}: "local" and "shelf" are a name's`);
  }
  const rev = [...(overrides || [])].reverse();
  return rev.find(o => o.name && nameKey(o.name) === k) || (qid && rev.find(o => !o.name && o.qid === qid)) || null;
}

/** Whether a name of the book stays the book's own (`local`) rather than an alias the lake gives the entity everywhere:
    a given name or a Roman cognomen, alone or after a regnal title (`givenName`: Wikidata has a given-name item of
    that word; REGNAL), that Wikidata does not give the entity itself ("Julian" for Didius Julianus, "Charles" for
    Charles VIII, "Pope Alexander" for Alexander VI). Fed to the lake, such a name would tag that man in every book
    (Gibbon's Julian is the Apostate, his Pope Alexander of the eleventh century); a shelf decision gives it to him in
    this book alone, so the report proposes one. */
export const isLocal = (name, pick, givenName) => !!givenName && ![pick.label, ...(pick.aliases || [])].some(s => s && nameKey(s) === nameKey(name));
// The titles that come with regnal numbers: "Pope Alexander" is eight popes, "King Louis" eighteen kings.
export const REGNAL = new Set(['Pope', 'King', 'Queen', 'Emperor', 'Empress', 'Sultan', 'Soldan', 'Tsar', 'Czar', 'Caliph', 'Shah', 'Doge']);

/** The cast from the names and their evaluated candidates: the records (one per entity and decision), the skipped and
    the unresolved, with the counts. `resolved` is [{ …an extractNames row, cands (candidates()), override, givenName }]. */
export function decide(resolved, { threshold = DEFAULT_THRESHOLD, common = new Set(), termStrings = new Map() } = {}) {
  const groups = new Map(), skipped = [], unresolved = [];
  const pickOf = n => (n.override?.qid ? n.cands.find(c => c.q === n.override.qid) : n.cands.find(c => !c.rejected)) || null;
  const live = resolved.map(n => ({ n, pick: pickOf(n) })).filter(x => x.pick && x.n.override?.decision !== 'skip');
  // The entities the book's longer names were given, for each one-word name inside them ("Alexander" is in "Alexander
  // the Great" and "Alexander the Sixth": two men).
  const longer = live.filter(x => /\s/.test(x.n.name));
  // Every name of the book and the entity it is given, so a pick whose own label or alias is the book's name for
  // another entity is held: fed, it would take that name's matches ("Antoninus", an alias of Marcus Aurelius, is the
  // book's Caracalla).
  const bookName = new Map();
  for (const x of live) for (const s of [x.n.name, ...x.n.spellings]) bookName.set(nameKey(s), x.pick);
  for (const n of resolved) {
    const o = n.override;
    const pick = pickOf(n);
    if (o?.qid && !pick) { unresolved.push(row(n, `the override names ${o.qid}, which Wikidata did not return`)); continue; }
    if (!pick) {
      const typed = n.cands.filter(c => c.kind);
      const why = !n.cands.length ? 'Wikidata has no item of that name'
        : !typed.length ? 'no candidate is a person, place, polity, battle, war, organisation or work'
        : `no candidate fits: ${typed.slice(0, 3).map(c => `${c.q} ${c.label} (${c.rejected})`).join('; ')}`;
      unresolved.push(row(n, why));
      continue;
    }
    if (o?.decision === 'skip') { skipped.push({ name: n.name, aliases: n.spellings, qid: pick.q, label: pick.label, mentions: n.mentions, note: o.note || '' }); continue; }
    const runnerUp = n.cands.find(c => !c.rejected && c.q !== pick.q) || null;
    const conf = confidence(pick, runnerUp, n.mentions);
    const rivals = new Map();
    if (!/\s/.test(n.name)) for (const x of longer) if (within(n.name, x.n.name)) { const r = rivals.get(x.pick.q) || { q: x.pick.q, label: x.pick.label, names: [] }; r.names.push(x.n.name); rivals.set(x.pick.q, r); }
    const takes = [...new Set([pick.label, ...lakeAliases(pick)].map(clean).filter(Boolean))]
      .map(s => [s, bookName.get(nameKey(s))]).filter(([, other]) => other && other.q !== pick.q).map(([s, other]) => `its name "${s}" is the book's for ${other.q} ${other.label}`);
    const held = [...holds(n.name, pick, runnerUp, { bookRivals: [...rivals.values()] }), ...hazards(pick, [n.name, ...n.spellings], { common, termStrings }), ...takes];
    let decision = conf.score >= threshold && !held.length ? 'auto' : 'review';
    let why = conf.why + (held.length ? `; held: ${held.join('; ')}` : '');
    // A human's decision stands, but what it risks stays in the record.
    if (o?.qid) { decision = pick.hard ? 'review' : (o.decision || 'auto'); why = `override: ${o.note || o.qid}${pick.hard ? ` (but ${pick.rejected})` : ''}; ${conf.why}${held.length ? `; noted: ${held.join('; ')}` : ''}`; }
    else if (o?.decision) { decision = o.decision; why = `override (${o.decision}): ${o.note || ''}; ${why}`; }
    const k = `${pick.q} ${decision}`;
    const g = groups.get(k) || { pick, decision, names: [], confidence: -1, why };
    // The book's own names: a given name the entity lacks (isLocal), or every form of a name an override keeps so.
    n.local = o?.local ? [n.name, ...n.spellings] : [n.name, ...n.spellings].filter(s => isLocal(s, pick, n.givenName));
    g.names.push(n);
    if (conf.score > g.confidence) { g.confidence = conf.score; g.why = why; }
    groups.set(k, g);
  }
  const records = [];
  for (const g of groups.values()) {
    const names = g.names.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
    const first = names.map(n => n.first).sort((a, b) => order(a) - order(b))[0];
    records.push({
      name: names[0].name, aliases: [...new Set([...names[0].spellings, ...names.slice(1).flatMap(n => [n.name, ...n.spellings])])],
      local: [...new Set(names.flatMap(n => n.local))],
      qid: g.pick.q, label: g.pick.label, type: g.pick.kind, dates: g.pick.dates, description: g.pick.description,
      mentions: names.reduce((s, n) => s + n.mentions, 0), first, contexts: names.flatMap(n => n.contexts).slice(0, 3),
      confidence: g.confidence, decision: g.decision, why: names.length > 1 ? `${g.why}; also as ${names.slice(1).map(n => `${n.name} (${n.mentions})`).join(', ')}` : g.why,
    });
  }
  records.sort((a, b) => (a.decision === 'auto' ? 0 : 1) - (b.decision === 'auto' ? 0 : 1) || b.mentions - a.mentions || a.name.localeCompare(b.name));
  const counts = {
    names: resolved.length, resolved: resolved.length - unresolved.length - skipped.length, entities: records.length,
    auto: records.filter(r => r.decision === 'auto').length, review: records.filter(r => r.decision === 'review').length,
    unresolved: unresolved.length, skipped: skipped.length,
  };
  return { records, skipped, unresolved, counts };
}
const row = (n, why) => ({ name: n.name, mentions: n.mentions, first: n.first, contexts: n.contexts, why });
/** A paragraph's place in book order, from its { ch, p } (one counter per chapter runs through c07-p01, c07-n02 …). */
export const order = f => f.ch * 1000 + +String(f.p).split('-')[1].slice(1);

/* ---------- The file and the report ---------- */

export const RULES = 'Names the lake does not know, seen at least twice, resolved against Wikidata. A record at or over the threshold is auto and '
  + 'fed to the lake (lake/scripts/adapters.mjs, bibliotheca); under it, review, fed only once a human flips it. Overrides, kept by every run: '
  + '{ "name": "<as in the text>", "qid": "Q…" } (the name means that item: auto, or the decision given with it), { "name", "decision": '
  + '"auto" | "review" | "skip" } (skip: a false positive, never fed), { "qid", "decision": "skip" } (that item under any name), each '
  + 'with a "note" saying why; "local": true with a name keeps the name out of the lake though its entity is fed (a title, or a name '
  + 'other books give other men), and "shelf": false proposes no shelf decision for it. A record\'s local names (one-word given names '
  + 'the entity lacks on Wikidata, and the overrides\' local names) are kept out of the lake; the report proposes shelf decisions '
  + 'that give them back to it in this book.';

/** The cast file's text: the head a field a line, every override, record and name on a line of its own. */
export function castJson(cast) {
  const { overrides = [], records = [], skipped = [], unresolved = [], ...head } = cast;
  const out = ['{'];
  for (const [k, v] of Object.entries(head)) out.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const list = (k, a, last = false) => {
    out.push(` ${JSON.stringify(k)}: [`);
    a.forEach((x, i) => out.push(`  ${JSON.stringify(x)}${i < a.length - 1 ? ',' : ''}`));
    out.push(` ]${last ? '' : ','}`);
  };
  list('overrides', overrides); list('records', records); list('skipped', skipped); list('unresolved', unresolved, true);
  out.push('}');
  return out.join('\n') + '\n';
}

const span = d => { const a = yearOf(d.born ?? d.founded ?? d.start ?? d.date ?? d.published ?? d.floruit), b = yearOf(d.died ?? d.dissolved ?? d.end); return a === null && b === null ? '' : `${a === null ? '' : fmtYear(a)}–${b === null ? '' : fmtYear(b)}`; };
/** The report as text: the counts, then every record, the skipped and the unresolved with a context each. `decisions`
    (the shelf entry's) marks the book-only names the shelf already gives back. */
export function report(cast, { wd = null, decisions = {} } = {}) {
  const c = cast.counts, out = [];
  out.push(`${cast.title}: the cast — ${c.names} names the lake does not know, seen at least twice${wd ? ` (Wikidata: ${wd.requests} requests, ${wd.cached} answers from the cache)` : ''}`);
  out.push(`  resolved ${c.resolved} into ${c.entities} records: ${c.auto} auto (fed to the lake), ${c.review} review (fed once a human flips them); ${c.unresolved} unresolved; ${c.skipped} skipped by the overrides`);
  out.push(`  threshold ${cast.threshold}; ${cast.overrides.length} override${cast.overrides.length === 1 ? '' : 's'}; era ${fmtYear(cast.era[0])}–${fmtYear(cast.era[1])}, names bound to ${fmtYear(cast.bound.text)} (${fmtYear(cast.bound.notes)} for a name only a note uses)`);
  const line = r => `  ${r.confidence.toFixed(2)}  ${r.qid.padEnd(10)} ${String(r.type).padEnd(12)} ${span(r.dates).padEnd(11)} ${`${r.name} (${r.mentions})${r.aliases.length ? ` + ${r.aliases.join(', ')}` : ''}`.slice(0, 46).padEnd(47)} ${r.label}${r.description ? ` — ${r.description}` : ''}`.slice(0, 190);
  for (const [title, d] of [['Auto: fed to the lake', 'auto'], ['Review: not fed until a human flips them (overrides)', 'review']]) {
    const rs = cast.records.filter(r => r.decision === d);
    out.push('', `${title}: ${rs.length}`, '  conf  qid        type         dates       name (mentions) + other forms                  label — description');
    for (const r of rs) { out.push(line(r)); if (d === 'review') out.push(`        ${r.why}`); }
  }
  const local = cast.records.filter(r => r.decision === 'auto' && r.local?.length);
  out.push('', `Book-only names: ${local.reduce((n, r) => n + r.local.length, 0)}, names the lake does not get as aliases, since they would tag the man in every book (given names, alone or after a regnal title, that Wikidata does not give him) or are the book's sense alone (the overrides' "local": a title, a name other books give other men); their entities are fed, and these shelf decisions (shelf.mjs, decisions) give the names to them in this book:`);
  const unsafe = [];
  for (const r of local) for (const s of r.local) {
    const o = overrideFor(cast.overrides, s, r.qid);
    if (o?.shelf === false) { unsafe.push(`  ${JSON.stringify(s)} (${r.qid} ${r.label}): ${o.note || ''}`); continue; }
    out.push(`  ${JSON.stringify(s)}: '${r.qid}', // ${r.label}${decisions[s] === r.qid ? ' (in the shelf)' : ''}`);
  }
  if (unsafe.length) out.push(`  None proposed for ${unsafe.length}, whose bare form the book uses for others too (the overrides' "shelf": false):`, ...unsafe.map(l => `  ${l}`));
  out.push('', `Skipped by the overrides: ${cast.skipped.length}`);
  for (const s of cast.skipped) out.push(`  "${s.name}" (${s.mentions}) → ${s.qid} ${s.label}: ${s.note}`);
  out.push('', `Unresolved: ${cast.unresolved.length}`);
  for (const u of cast.unresolved) out.push(`  "${u.name}" (${u.mentions}): ${u.why}`, `        ${u.contexts[0] || ''}`.slice(0, 190));
  return out.join('\n') + '\n';
}

/* ---------- The run ---------- */

/** The shelf's decisions (shelf.mjs) as a run of the cast applies them: less those that give a name to an entity the
    cast feeds (an 'auto' record's of the last run, or an override's), since that name is the cast's to find (the
    header, 4): its record stays, and so does the entity the decision names, in the lake. */
export function castDecisions(decisions = {}, { previous = null, overrides = [] } = {}) {
  const fed = new Set([...(previous?.records || []).filter(r => r.decision === 'auto').map(r => r.qid), ...overrides.filter(o => o.qid && o.decision !== 'skip').map(o => o.qid)]);
  return Object.fromEntries(Object.entries(decisions || {}).filter(([k, v]) => /^Q\d+$/.test(k) || !fed.has(v)));
}

/** Makes a book's cast (the steps in the header) and writes the cast file and its report. Returns { cast, text }. */
export async function makeCast(slug, { refresh = false, offline = false, log = console.log } = {}) {
  const entry = shelfEntry(slug), book = readBook(slug);
  const path = castPath(slug), previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  const threshold = previous?.threshold ?? DEFAULT_THRESHOLD, overrides = previous?.overrides || [];
  const index = buildAliasIndex(lakeWithoutCast(slug, previous), { decisions: castDecisions(entry.decisions, { previous, overrides }) });
  const year = entry.work.published, era = [...entry.era];
  const bound = { text: Math.max(era[1], year), notes: year };
  const common = commonWords(book);
  const names = extractNames(book, index, { year, common });
  // The strings that tag something in the book now (with the lake less the cast), for the hazards.
  const termStrings = new Map();
  for (const c of book.chapters) for (const p of c.paragraphs) for (const t of tagText(p.text, index, { year })) termStrings.set(fold(clean(p.text.slice(t.s, t.e))), t.qid);
  log(`${entry.title}: ${names.length} names the lake does not know, seen at least twice; asking Wikidata (cached in ${WD_CACHE.slice(ROOT.length).replace(/\\/g, '/')})`);
  const wd = wikidata({ refresh, offline, log });
  const found = new Map();
  for (const [i, n] of names.entries()) {
    const ids = [];
    for (const q of queries(n.name)) for (const r of (await wd.search(q)) || []) ids.push(r.id);
    const o = overrideFor(overrides, n.name, null);
    if (o?.qid) ids.push(o.qid);
    found.set(n.name, ids);
    if ((i + 1) % 25 === 0) log(`  searched ${i + 1}/${names.length}`);
  }
  const entities = await wd.entities([...new Set([...found.values()].flat())]);
  const classLabels = await wd.classes([...new Set([...entities.values()].filter(Boolean).flatMap(e => e.p31))]);
  const evaluate = (n, pooled = []) => candidates(n.name, found.get(n.name), entities, classLabels, { era, bound: n.notesOnly ? bound.notes : bound.text, excluded: index.excluded, pooled });
  // Twice: the second time with the first's picks (and the overrides' entities) as candidates for every name, so a
  // short name may be one of the book's longer ones (the steps in the header, 3).
  const picks = [...new Set(names.map(n => overrideFor(overrides, n.name, null)?.qid || evaluate(n).find(c => !c.rejected)?.q).filter(Boolean))];
  // A name that is a given name or cognomen Wikidata has an item of, alone or after a regnal title (isLocal): "Julian",
  // "Charles", "Pope Alexander". The searches for a name include its form without the title (queries).
  const GIVEN = /\b(given name|cognomen|praenomen|nomen gentilicium)\b/;
  const isGiven = (n, word) => (found.get(n.name) || []).some(q => { const e = entities.get(q); return e && [e.label, ...e.aliases].some(s => s && nameKey(s) === nameKey(word)) && e.p31.some(c => GIVEN.test(lower(classLabels.get(c) || ''))); });
  const givenName = n => { const bare = untitled(n.name); return (!/\s/.test(n.name) && isGiven(n, n.name)) || (!!bare && REGNAL.has(n.name.split(' ')[0]) && !/\s/.test(bare) && isGiven(n, bare)); };
  const resolved = names.map(n => {
    const cands = evaluate(n, picks);
    return { ...n, cands, override: overrideFor(overrides, n.name, cands.find(c => !c.rejected)?.q), givenName: givenName(n) };
  });
  const { records, skipped, unresolved, counts } = decide(resolved, { threshold, common, termStrings });
  const cast = {
    slug, title: entry.title, author: entry.author.name, year, era, bound, generated: new Date().toISOString(), threshold, rules: RULES, counts,
    overrides, records, skipped, unresolved,
  };
  mkdirSync(CAST, { recursive: true });
  const json = castJson(cast);
  if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw new Error(`${path} would be over 2 MB`);
  writeFileSync(path, json);
  const text = report(cast, { wd: wd.stats, decisions: entry.decisions });
  writeFileSync(reportPath(slug), text);
  return { cast, text, stats: wd.stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), slug = args.find(a => !a.startsWith('--'));
  if (!slug) { console.error('usage: node bibliotheca/scripts/cast.mjs <slug> [--refresh] [--offline]'); process.exit(2); }
  const { text, cast } = await makeCast(slug, { refresh: args.includes('--refresh'), offline: args.includes('--offline') });
  console.log(text);
  console.log(`wrote ${castPath(slug).slice(ROOT.length).replace(/\\/g, '/')} (${cast.records.length} records) and ${reportPath(slug).slice(ROOT.length).replace(/\\/g, '/')}`);
  console.log(`next: node lake/scripts/build.mjs --only bibliotheca, then node bibliotheca/scripts/tag-terms.mjs ${slug}`);
}
