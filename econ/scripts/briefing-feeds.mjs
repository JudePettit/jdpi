// Economics Briefing feed handling: parse journal, working-paper, central-bank and news feeds (RSS 2.0, RSS 1.0/RDF
// with Dublin Core and PRISM, Atom) into plain items with DOIs, authors and the feed's own section labels; normalise
// them; de-duplicate; and roll the seven-day store forward. Pure functions (no network), so tests can run them on
// fixtures. Entity decoding, canonical URLs and title keys come from the Intelligence Briefing's parser
// (briefing/scripts/rss.mjs); the text clean-up (plain text, summaries, DOIs, dates) from the Scientific Briefing's
// (science/scripts/briefing-feeds.mjs).
import { decode, canonicalUrl, titleKey } from '../../briefing/scripts/rss.mjs';
import { plain, clip, summarise, extractDoi, parseDate, urlKey, makeId, titleSimilarity, SUMMARY_MAX } from '../../science/scripts/briefing-feeds.mjs';
import { classify, detectType, isGenre, isDroppedTitle, FIELD_IDS } from './classify.mjs';

export { titleKey, urlKey, SUMMARY_MAX };
export const AUTHORS_MAX = 120;

// ---- Entities ----------------------------------------------------------------------------------------------------------
// The shared decoder knows only the commonest named entities; the Fed's and others' feeds also use the accented-letter
// ones ("Cair&oacute;", "Pf&auml;uti").
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const NAMED = Object.fromEntries([
  ...LATIN1.map((n, k) => [n, String.fromCodePoint(160 + k)]),
  ['OElig', 'Œ'], ['oelig', 'œ'], ['Scaron', 'Š'], ['scaron', 'š'], ['Yuml', 'Ÿ'], ['Zcaron', 'Ž'], ['zcaron', 'ž'], ['euro', '€'],
  ['trade', '™'], ['bull', '•'], ['dagger', '†'], ['Dagger', '‡'], ['permil', '‰'], ['lsaquo', '‹'], ['rsaquo', '›'], ['sbquo', '‚'],
  ['bdquo', '„'], ['minus', '−'], ['ensp', ' '], ['emsp', ' '], ['thinsp', ' '], ['prime', '′'], ['Prime', '″'], ['circ', 'ˆ'], ['tilde', '˜'],
]);
/** Named entities the shared decoder leaves behind, turned into characters. */
export const fixEntities = s => String(s ?? '').replace(/&([a-zA-Z][a-zA-Z0-9]{1,7});/g, (m, n) => NAMED[n] ?? m);
const txt = s => fixEntities(plain(fixEntities(s)));

// ---- Fields ----------------------------------------------------------------------------------------------------------
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const field = (block, name) => { const m = block.match(new RegExp(`<${reEsc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${reEsc(name)}>`, 'i')); return m ? m[1] : ''; };
const fields = (block, name) => [...block.matchAll(new RegExp(`<${reEsc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${reEsc(name)}>`, 'gi'))].map(m => m[1]);
const attr = (tagText, a) => { const m = tagText.match(new RegExp(`\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

// ---- Titles and authors ----------------------------------------------------------------------------------------------
// Series numbers and labels that some feeds put in front of the title, and footnote marks after it.
const TITLE_CLEAN = [
  /^DP\d{3,6}\s+/,                                                        // CEPR: "DP22097 Demand-Driven Inflation"
  /^(?:FEDS Notes?|FEDS Paper|FEDS Working Paper|IFDP Paper|IFDP Notes?)\s*:\s*/i,   // Federal Reserve Board series labels
  /\s*[*†‡]+$/,                                                           // Oxford journals' acknowledgement marks
];
// Leading author block in the Federal Reserve's FEDS feeds: "<a …>Canlin Li</a> and <a …>Emre Yoldas</a><br><br>Abstract…".
// A name is two to four capitalised words (particles such as "de" or "van" allowed), linked or not.
const PERSON = String.raw`\p{Lu}[\p{L}.'’-]*(?:\s+(?:(?:de|da|van|von|der|del|la|le|di|du|bin|al|el)\s+)*\p{Lu}[\p{L}.'’-]*){1,3}`;
const NAME = String.raw`(?:<a\b[^>]*>\s*${PERSON}\s*<\/a>|${PERSON})`;
const LEAD_AUTHORS = new RegExp(String.raw`^\s*(${NAME}(?:\s*(?:,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)${NAME})*)\s*(?:<a\s+name="[^"]*"\s*><\/a>\s*)?<br\s*\/?>\s*<br\s*\/?>`, 'u');

/** "NED AUGENBLICK" → "Ned Augenblick"; other names unchanged. */
const titleCase = n => (/\p{Ll}/u.test(n) ? n : n.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()));
// Words that mark an affiliation or a site account rather than a person.
const NOT_A_PERSON = /@|https?:|webmaster|\bstaff\b|\beditor|universit|institut|\bschool\b|college|department|research|bureau|\bbank\b|cent(?:re|er)\b|foundation|\bteam\b/i;

/**
 * A display string for a list of author names: "A", "A and B", "A, B and C", or "A, B, C et al." for more; '' when the
 * names look like a site account or a run-together list rather than people.
 * @param {string[]} raw author fields (each may hold one name or a list)
 * @param {string} [outlet] the outlet's name, which some blogs use as the author
 */
export function formatAuthors(raw, outlet = '') {
  const names = [];
  for (const r of raw) {
    const t = txt(r);
    if (!t) continue;
    // One field holding several names run together with their affiliations (the Chicago journals) is not usable.
    if ((t.match(/\p{Ll}{3}\p{Lu}\p{Ll}{2}/gu) || []).length >= 2) return '';
    for (const n of t.split(/\s*(?:;|,(?!\s*(?:Jr|Sr|III|II)\b)|\s&\s|\band\b)\s*/)) {
      const name = titleCase(n.replace(/\s+/g, ' ').replace(/^by\s+/i, '').trim());
      if (!name || name.length > 60 || NOT_A_PERSON.test(name) || !/\s/.test(name)) continue;
      if (outlet && name.toLowerCase().replace(/\W/g, '') === outlet.toLowerCase().replace(/\W/g, '')) continue;
      if (!names.includes(name)) names.push(name);
    }
  }
  if (!names.length) return '';
  const s = names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return clip(s, AUTHORS_MAX);
}

// ---- Summaries -------------------------------------------------------------------------------------------------------
// Boilerplate and furniture that economics feeds put around the teaser, removed before the shared summary clean-up.
const PRE_CLEAN = [
  [LEAD_AUTHORS, ' '],
  [/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, ' '],                                                     // headings ("Key takeaways", "Overview")
  [/<span[^>]*reading-time[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi, ' '],                                // WordPress reading-time widgets
  [/Reading Time:\s*(?:<[^>]*>\s*)*\d+(?:\s*<[^>]*>)*\s*min(?:ute)?s?\.?/gi, ' '],
  [/Staff working papers set out research in progress by our staff, with the aim of encouraging comments and debate\.?/gi, ' '],
  [/^\s*(?:<[^>]+>\s*)*(?:Introduction|Overview|Key [Tt]akeaways:?)\s*(?=<|[A-Z])/, ' '],
];
const preClean = html => { let s = fixEntities(decode(String(html || ''))); for (const [re, to] of PRE_CLEAN) s = s.replace(re, to); return s; };
// Section labels left at the start of a summary, newsletter and live-blog promotions at its end, and TeX-style dashes
// ("demand forces---both") in working-paper abstracts.
const tidySummary = s => s.replace(/^(?:(?:Key [Tt]akeaways|Overview|Introduction|Summary|Abstract)\s*:?\s+)+(?=\p{Lu})/u, '')
  .replace(/\s*(?:Follow (?:our|the) [^.]{0,60}?live(?: blog| coverage)?|Sign up (?:for|to) [^.]{0,80}|Get our [^.]{0,80}?newsletter)\.?\s*(?:…)?$/i, '')
  .replace(/\s*---\s*/g, '—').replace(/\s+--\s+/g, ' – ').replace(/(\S)--(\S)/g, '$1–$2').trim();

// Category labels that say nothing about the subject.
const GENERIC_CAT = /^(?:uncategori[sz]ed|not categori[sz]ed|general|news|latest|business|economics|economy|world|world news|blogs?|featured|top stories|opinion|commentary|articles?|posts?)$/i;

/**
 * Parse an RSS 2.0, RSS 1.0 (RDF) or Atom document into items:
 * { title, url, published (ISO|null), summary, doi, authors[], categories[], genres[], section }.
 */
export function parseEconFeed(xml) {
  const text = String(xml || '');
  const blocks = text.match(/<item\b[\s\S]*?<\/item>/gi) || text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocks) {
    let title = txt(field(b, 'title') || field(b, 'dc:title')).slice(0, 400);
    const authors = [];
    // NBER: "Beliefs Over Contracts -- by Francis Annan, Collin B. Raymond"
    const by = title.match(/^(.{8,}?)\s+--\s+by\s+(.+)$/);
    if (by) { title = by[1]; authors.push(by[2]); }
    for (const re of TITLE_CLEAN) title = title.replace(re, '').trim();
    title = title.slice(0, 300);
    let link = plain(field(b, 'link'));
    if (!/^https?:/i.test(link)) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      const alt = links.find(l => !/\brel=/i.test(l) || /\brel=["']alternate["']/i.test(l)) || links[0] || '';
      link = attr(alt, 'href') || plain(field(b, 'prism:url')) || plain(field(b, 'guid'));
    }
    const url = canonicalUrl(link);
    if (!title || !url) continue;
    const [published] = parseDate(field(b, 'pubDate') || field(b, 'dc:date') || field(b, 'prism:publicationDate') || field(b, 'published') || field(b, 'updated') || field(b, 'prism:coverDate'));
    const labels = [
      ...fields(b, 'dc:type'), ...fields(b, 'prism:section'), ...fields(b, 'category'), ...fields(b, 'dc:subject'),
      ...(b.match(/<category\b[^>]*\bterm=["'][^"']+["'][^>]*\/?>/gi) || []).map(t => attr(t, 'term')),
    ].map(txt).filter(Boolean);
    const uniq = [...new Set(labels.map(l => l.replace(/\s+/g, ' ').trim()))];
    const genres = uniq.filter(isGenre), categories = uniq.filter(l => !isGenre(l));
    const doi = extractDoi({ prismDoi: field(b, 'prism:doi'), identifier: field(b, 'dc:identifier'), guid: field(b, 'guid'), atomId: field(b, 'id'), url });
    const candidates = [field(b, 'dc:description'), field(b, 'description'), field(b, 'summary'), field(b, 'content'), field(b, 'content:encoded')];
    // Authors: Dublin Core creators, Atom authors (or names in an RSS <author>), or the FEDS lead block.
    authors.push(...fields(b, 'dc:creator'));
    for (const a of fields(b, 'author')) authors.push(field(a, 'name') || a);
    const lead = fixEntities(decode(candidates.find(Boolean) || '')).match(LEAD_AUTHORS);
    if (lead && !authors.some(a => txt(a))) authors.push(lead[1]);
    const summary = tidySummary(fixEntities(summarise(candidates.map(preClean), title)));
    const section = categories.filter(c => !GENERIC_CAT.test(c) && c.length <= 60).slice(0, 2).join(' · ').slice(0, 80);
    out.push({ title, url, published, summary, doi, authors, categories, genres, section });
  }
  return out;
}

// ---- Normalising -----------------------------------------------------------------------------------------------------
const STRIP_PARAMS = /^(?:af|rss|sc|src|feed|feedtype|from|mod|ito|cmpid|_ga|sr_share|via|dicbo|campaign_id|emc|cid|ftag|dgcid|syn-\d+|traffic_source|smid)$/i;
/** The canonical URL kept for an item: tracking parameters removed, doubled slashes in the path closed up. */
export function cleanUrl(u) {
  const c = canonicalUrl(u);
  if (!c) return '';
  try {
    const x = new URL(c);
    for (const k of [...x.searchParams.keys()]) if (STRIP_PARAMS.test(k)) x.searchParams.delete(k);
    x.pathname = x.pathname.replace(/\/{2,}/g, '/');
    return x.toString();
  } catch { return c; }
}

/** Whether a feed's items carry their authors (research, and named commentary). */
export const keepsByline = source => source.byline === true || !['news', 'official'].includes(source.kind);

/**
 * A parsed feed item → the stored shape, or null when it is dropped (front matter, corrections, events, the feed's
 * skip list, or an off-topic item from a strict feed). `seen` stamps undated items, or `fallback` when the feed gave a
 * better guess (its Last-Modified time); dates more than 36 hours ahead are treated as undated.
 */
export function normalise(raw, source, seen, fallback = seen) {
  if (source.skip && source.skip.test(raw.title)) return null;
  const type = detectType(raw, source);
  if (!type) return null;
  const fieldsOf = classify(raw, source.fields);
  if (source.strict && !fieldsOf.length) return null;
  const now = Date.parse(seen);
  const published = raw.published && Date.parse(raw.published) <= now + 36e5 * 36 ? raw.published : null;
  const url = cleanUrl(raw.url);
  const item = {
    id: makeId(raw.doi, url), title: raw.title, url, source: source.id, kind: source.kind, tier: source.tier,
    fields: fieldsOf, type, published: published || fallback || seen, summary: clip(raw.summary || ''),
  };
  const authors = keepsByline(source) ? formatAuthors(raw.authors || [], source.outlet) : '';
  if (authors) item.authors = authors;
  if (raw.doi) item.doi = raw.doi;
  if (raw.section) item.section = raw.section;
  if (!published) item.undated = true;
  return item;
}

// ---- De-duplication --------------------------------------------------------------------------------------------------
const KIND_RANK = { journal: 0, working: 1, research: 2, official: 3, news: 4 };

/**
 * Merge duplicates: the same DOI, the same URL, the same normalised title, or near-identical titles (Dice ≥ 0.88, five
 * or more words) from different outlets within three days. The best copy is kept (lower tier, research before releases
 * and news, paper before news, earliest); the others' sources go into `also`, their fields are added and a missing
 * summary, DOI or author list is filled in.
 * @param {object[]} items  stored-shape items
 * @param {(id: string) => {outlet: string}} sourceOf
 */
export function dedupe(items, sourceOf) {
  const rank = i => [i.tier, KIND_RANK[i.kind] ?? 9, i.type === 'paper' ? 0 : 1, Date.parse(i.published) || 0];
  const sorted = [...items].sort((a, b) => { const x = rank(a), y = rank(b); for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k]; return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  const STOP = new Set(['of', 'in', 'on', 'for', 'and', 'to', 'with', 'by', 'from', 'at', 'as', 'is', 'are', 'its', 'new', 'how', 'why', 'what']);
  const tokens = t => [...new Set(titleKey(t).split(' ').filter(w => w.length > 1 && !STOP.has(w)))];
  const kept = [], byDoi = new Map(), byUrl = new Map(), byTitle = new Map(), postings = new Map();
  const outlet = i => sourceOf(i.source)?.outlet || i.source;
  for (const it of sorted) {
    const tk = titleKey(it.title), toks = tokens(it.title), t = Date.parse(it.published) || 0;
    let hit = (it.doi && byDoi.get(it.doi.toLowerCase())) || byUrl.get(urlKey(it.url)) || null;
    if (!hit && tk.length > 12) { const h = byTitle.get(tk); if (h && Math.abs((Date.parse(h.published) || 0) - t) <= 3 * 864e5) hit = h; }
    if (!hit && toks.length >= 5) {
      const counts = new Map();
      for (const w of toks) for (const k of postings.get(w) || []) counts.set(k, (counts.get(k) || 0) + 1);
      for (const [k, n] of counts) {
        const c = kept[k];
        if (n < 0.75 * toks.length || outlet(c) === outlet(it) || Math.abs((Date.parse(c.published) || 0) - t) > 3 * 864e5) continue;
        if (titleSimilarity(c.title, it.title) >= 0.88) { hit = c; break; }
      }
    }
    if (hit) {
      if (it.source !== hit.source && !(hit.also || []).includes(it.source)) hit.also = [...(hit.also || []), it.source];
      for (const s of it.also || []) if (s !== hit.source && !(hit.also || []).includes(s)) hit.also = [...(hit.also || []), s];
      const merged = new Set([...hit.fields, ...it.fields]);
      hit.fields = FIELD_IDS.filter(f => merged.has(f));
      if (!hit.summary && it.summary) hit.summary = it.summary;
      if (!hit.doi && it.doi) hit.doi = it.doi;
      if (!hit.authors && it.authors && it.type === 'paper') hit.authors = it.authors;
      if (it.doi) byDoi.set(it.doi.toLowerCase(), hit);
      byUrl.set(urlKey(it.url), hit);
      continue;
    }
    const k = kept.push({ ...it }) - 1, copy = kept[k];
    if (copy.doi) byDoi.set(copy.doi.toLowerCase(), copy);
    byUrl.set(urlKey(copy.url), copy);
    if (tk.length > 12 && !byTitle.has(tk)) byTitle.set(tk, copy);
    for (const w of toks) (postings.get(w) || postings.set(w, []).get(w)).push(k);
  }
  return kept;
}

/**
 * Roll the store forward: previous items + this run's items → de-duplicated, re-classified, inside the window, at most
 * `cap` per source and `maxItems` overall, newest first.
 * @param {{prevItems: object[], freshItems: object[], sources: object[], now: number, keepDays?: number, maxItems?: number, defaultCap?: number}} o
 */
export function mergeStore({ prevItems = [], freshItems = [], sources, now, keepDays = 7, maxItems = 2500, defaultCap = 150 }) {
  const byId = new Map(sources.map(s => [s.id, s]));
  const since = now - keepDays * 864e5;
  // Items from feeds that left the catalogue go, and so do titles the drop and skip rules now catch; the rest are
  // re-classified so rule changes apply to the whole store (and strict feeds lose items that no longer match a field).
  const pool = [];
  for (const i of [...prevItems, ...freshItems]) {
    const s = byId.get(i.source);
    if (!s || isDroppedTitle(i.title) || (s.skip && s.skip.test(i.title))) continue;
    const set = new Set(classify(i, s.fields));
    for (const a of i.also || []) for (const f of byId.get(a)?.fields || []) set.add(f);
    const fieldsOf = FIELD_IDS.filter(f => set.has(f));
    if (s.strict && !fieldsOf.length) continue;
    const item = { ...i, kind: s.kind, tier: s.tier, fields: fieldsOf, type: ['news', 'official'].includes(s.kind) ? 'news' : i.type };
    if (!keepsByline(s)) delete item.authors;
    const also = (i.also || []).filter(a => byId.has(a));
    if (also.length) item.also = also; else delete item.also;
    pool.push(item);
  }
  const recent = pool.filter(i => (Date.parse(i.published) || 0) >= since);
  const unique = dedupe(recent, id => byId.get(id));
  unique.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0) || (a.id < b.id ? -1 : 1));
  const perSource = new Map();
  const capped = unique.filter(i => { const n = (perSource.get(i.source) || 0) + 1; perSource.set(i.source, n); return n <= (byId.get(i.source).cap || defaultCap); });
  return capped.slice(0, maxItems);
}
