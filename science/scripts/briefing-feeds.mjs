// Scientific Briefing feed handling: parse journal and news feeds (RSS 2.0, RSS 1.0/RDF with Dublin Core and PRISM,
// Atom) into plain items with DOIs and the feed's own section labels; normalise them; de-duplicate; and roll the
// seven-day store forward. Pure functions (no network), so tests can run them on fixtures.
// Entity decoding, canonical URLs and title keys come from the Intelligence Briefing's parser (briefing/scripts/rss.mjs).
import { createHash } from 'node:crypto';
import { decode, canonicalUrl, titleKey } from '../../briefing/scripts/rss.mjs';
import { classify, detectType, isGenre, isDroppedTitle, DISCIPLINE_IDS } from './classify.mjs';

export { titleKey };
export const SUMMARY_MAX = 280;

// ---- Text ------------------------------------------------------------------------------------------------------------
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const script = (inner, map) => { const t = inner.replace(/<[^>]*>/g, '').trim(); return [...t].every(c => map[c]) ? [...t].map(c => map[c]).join('') : t; };
const BLOCK = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|blockquote|figure|figcaption|header|footer|hr)\b[^>]*>/gi;

/** HTML or XML text → plain text: entities decoded, tags removed (block tags become spaces, sub/superscript digits kept). */
export function plain(html) {
  let s = decode(String(html ?? ''));
  s = s.replace(/<(script|style|svg|form|button|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, x) => script(x, SUB)).replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, x) => script(x, SUP));
  s = s.replace(BLOCK, ' ').replace(/<[^>]*>/g, '');
  return decode(s).replace(/[ \s]+/g, ' ').trim();
}

/** Cut to at most n characters at a word boundary, with an ellipsis. */
export function clip(s, n = SUMMARY_MAX) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

// Journal citation lines, author lists and blog footers that feeds put around the abstract or teaser.
const RAW_CLEAN = [
  /^\s*(?:<p>\s*)?Author\(s\):[\s\S]*?(?:<br\s*\/?>|<\/p>)/i,              // APS: "Author(s): A, B and C<br/>"
  /^\s*<p>\s*by\s[^<]{2,2000}<\/p>/i,                                      // PLOS: "<p>by A, B, C</p>"
  /<p>\s*\[[^\]]{3,80}\]\s*Published[^<]*<\/p>/gi,                         // APS: "<p>[Phys. Rev. Lett. 137, 180401] Published …</p>"
];
const TEXT_CLEAN = [
  /^[^.;|]{2,100}?,\s*Published online:\s*[^;|]{4,40}[;|]\s*(?:\|\s*)?(?:doi:\s*\S+)?\s*/i,   // Nature: "Nature, Published online: …; doi:…"
  /^(?:[A-Z][^.]{1,120}?),\s*(?:Volume\s+\d+[^.]*|EarlyView|Early View|Ahead of Print|Accepted Manuscript|Just Accepted)\.?\s*/,  // "Science, Volume 394, Issue 6822, Page 419-422, October 2026."
  /^(?:Significance|Abstract|ABSTRACT|Summary|SUMMARY|Background|Highlights|Graphical abstract)(?:\s*[:.]?\s+|(?=[A-Z]))/,
  /\s*\[[^\]]{3,80}\]\s*Published\s+\w{3}\s+\w{3}\s+\d{1,2},\s+\d{4}\s*$/,  // APS trailer
  /\s*The post\s.{3,400}?\s(?:appeared first|first appeared) on\s.{2,80}?\.?\s*$/i,   // WordPress footer
  /\s*(?:Continue reading|Read more|Read the full (?:story|article))\b.*$/i,
  /\s*\[(?:…|\.\.\.)\]\s*$/,
];

/** The first informative summary among the candidate fields, cleaned and clipped to SUMMARY_MAX characters. */
export function summarise(candidates, title = '') {
  const tk = titleKey(title);
  for (const raw of candidates) {
    if (!raw) continue;
    let html = decode(String(raw));
    for (const re of RAW_CLEAN) html = html.replace(re, ' ');
    let s = plain(html);
    for (let pass = 0; pass < 2; pass++) for (const re of TEXT_CLEAN) s = s.replace(re, '').trim();
    if (tk && titleKey(s).startsWith(tk)) s = s.slice(Math.min(s.length, title.length)).replace(/^[\s.:;,–—-]+/, '');
    if (s.length < 25 || titleKey(s) === tk || /^(?:by\s|doi:)/i.test(s)) continue;
    return clip(s);
  }
  return '';
}

// ---- Fields ----------------------------------------------------------------------------------------------------------
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const field = (block, name) => { const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'i')); return m ? m[1] : ''; };
const fields = (block, name) => [...block.matchAll(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'gi'))].map(m => m[1]);
const attr = (tagText, a) => { const m = tagText.match(new RegExp(`\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/;
/** A bare DOI ("10.1038/…") from a DOI field, a doi: or info:doi/ identifier, or a publisher URL; '' if none. */
export function extractDoi({ prismDoi = '', identifier = '', guid = '', atomId = '', url = '' } = {}) {
  const tidy = d => d.replace(/[.,;)\]]+$/, '').replace(/\?.*$/, '');
  for (const v of [prismDoi, identifier, guid, atomId]) {
    const t = plain(v).replace(/^(?:doi:|info:doi\/|https?:\/\/(?:dx\.)?doi\.org\/)/i, '');
    if (/^10\.\d{4,9}\/\S+$/.test(t)) return tidy(t);
  }
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'nature.com') { const m = u.pathname.match(/^\/articles\/([sd]\d{5}-\d{3}-\d{5}-\w|[a-z]+\d+[a-z]?)$/i); if (m) return '10.1038/' + m[1]; }
    if (host === 'elifesciences.org') { const m = u.pathname.match(/^\/articles\/(\d{4,7})$/); if (m) return '10.7554/eLife.' + m[1]; }
    const id = u.searchParams.get('id'); if (id && /^10\.\d{4,9}\//.test(id)) return tidy(id);
    const m = decodeURIComponent(u.pathname).match(DOI_RE); if (m) return tidy(m[1]);
  } catch { /* not a URL */ }
  return '';
}

/** Date text → [ISO string or null, dateOnly]. Date-only values become midnight UTC. */
export function parseDate(text) {
  const t = plain(text);
  if (!t) return [null, false];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return [`${t}T00:00:00.000Z`, true];
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? [new Date(ms).toISOString(), false] : [null, false];
}

/**
 * Parse an RSS 2.0, RSS 1.0 (RDF) or Atom document into items:
 * { title, url, published (ISO|null), summary, doi, categories[], genres[], section }.
 */
export function parseScienceFeed(xml) {
  const text = String(xml || '');
  const blocks = text.match(/<item\b[\s\S]*?<\/item>/gi) || text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocks) {
    const title = plain(field(b, 'title') || field(b, 'dc:title')).slice(0, 300);
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
      ...fields(b, 'dc:type'), ...fields(b, 'prism:section'), ...fields(b, 'category'), ...fields(b, 'dc:subject'), ...fields(b, 'pw:primaryCategory'),
      ...(b.match(/<category\b[^>]*\bterm=["'][^"']+["'][^>]*\/?>/gi) || []).map(t => attr(t, 'term')),
    ].map(plain).filter(Boolean);
    const uniq = [...new Set(labels.map(l => l.replace(/\s+/g, ' ').trim()))];
    const genres = uniq.filter(isGenre), categories = uniq.filter(l => !isGenre(l));
    const doi = extractDoi({ prismDoi: field(b, 'prism:doi'), identifier: field(b, 'dc:identifier'), guid: field(b, 'guid'), atomId: field(b, 'id'), url });
    const summary = summarise([field(b, 'dc:description'), field(b, 'description'), field(b, 'summary'), field(b, 'content'), field(b, 'content:encoded')], title);
    out.push({ title, url, published, summary, doi, categories, genres, section: categories.slice(0, 3).join(' · ').slice(0, 80) });
  }
  return out;
}

// ---- Normalising -----------------------------------------------------------------------------------------------------
const STRIP_PARAMS = /^(?:af|rss|sc|src|feed|feedtype|from|mod|ito|cmpid|_ga|sr_share|via|dicbo|campaign_id|emc|cid|ftag)$/i;
/** The canonical URL kept for an item: tracking parameters removed (Briefing rules plus journal feed tags such as ?af=R). */
export function cleanUrl(u) {
  const c = canonicalUrl(u);
  if (!c) return '';
  try { const x = new URL(c); for (const k of [...x.searchParams.keys()]) if (STRIP_PARAMS.test(k)) x.searchParams.delete(k); return x.toString(); } catch { return c; }
}
/** A comparison key for URLs: no scheme, no www., no trailing slash. */
export const urlKey = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase(); } catch { return String(u).toLowerCase(); } };
/** A stable 12-character id from the DOI (preferred) or the URL. */
export const makeId = (doi, url) => createHash('sha1').update(doi ? 'doi:' + doi.toLowerCase() : 'url:' + urlKey(url)).digest('hex').slice(0, 12);

/**
 * A parsed feed item → the stored shape, or null when it is dropped (corrections, errata, sponsored posts) or undated
 * beyond the fallback. `seen` stamps undated items; dates more than 36 hours ahead are treated as undated.
 */
export function normalise(raw, source, seen) {
  const type = detectType(raw, source);
  if (!type) return null;
  const now = Date.parse(seen);
  let published = raw.published && Date.parse(raw.published) <= now + 36e5 * 36 ? raw.published : null;
  const url = cleanUrl(raw.url);
  const item = {
    id: makeId(raw.doi, url), title: raw.title, url, source: source.id, kind: source.kind, tier: source.tier,
    disciplines: classify(raw, source.disciplines), type, published: published || seen, summary: clip(raw.summary || ''),
  };
  if (raw.doi) item.doi = raw.doi;
  if (raw.section) item.section = raw.section;
  if (!published) item.undated = true;
  return item;
}

// ---- De-duplication --------------------------------------------------------------------------------------------------
const STOP = new Set(['of', 'in', 'on', 'for', 'and', 'to', 'with', 'by', 'from', 'at', 'as', 'is', 'are', 'its', 'new', 'study', 'how', 'why', 'what']);
const tokens = t => [...new Set(titleKey(t).split(' ').filter(w => w.length > 1 && !STOP.has(w)))];
/** Dice similarity of two titles' word sets (0…1). */
export function titleSimilarity(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  if (!A.length || !B.size) return 0;
  return (2 * A.filter(w => B.has(w)).length) / (A.length + B.size);
}

/**
 * Merge duplicates: the same DOI, the same URL, the same normalised title, or near-identical titles (Dice ≥ 0.88, five
 * or more words) from different outlets within three days. The best copy is kept (lower tier, journal before news,
 * paper before news, earliest); the others' sources go into `also`, their disciplines are added and a missing
 * summary or DOI is filled in.
 * @param {object[]} items  stored-shape items
 * @param {(id: string) => {outlet: string, tier: number, kind: string}} sourceOf
 */
export function dedupe(items, sourceOf) {
  const rank = i => [i.tier, i.kind === 'journal' ? 0 : 1, i.type === 'paper' ? 0 : 1, Date.parse(i.published) || 0];
  const sorted = [...items].sort((a, b) => { const x = rank(a), y = rank(b); for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k]; return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
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
      hit.disciplines = [...new Set([...hit.disciplines, ...it.disciplines])];
      if (!hit.summary && it.summary) hit.summary = it.summary;
      if (!hit.doi && it.doi) hit.doi = it.doi;
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
  // Items from feeds that left the catalogue go, and so do titles the drop rules now catch; the rest are re-classified
  // so rule changes apply to the whole store.
  const pool = [...prevItems, ...freshItems].filter(i => byId.has(i.source) && !isDroppedTitle(i.title)).map(i => {
    const s = byId.get(i.source);
    const disciplines = new Set(classify(i, s.disciplines));
    for (const a of i.also || []) for (const d of byId.get(a)?.disciplines || []) disciplines.add(d);
    return { ...i, kind: s.kind, tier: s.tier, disciplines: DISCIPLINE_IDS.filter(d => disciplines.has(d)) };
  });
  const recent = pool.filter(i => (Date.parse(i.published) || 0) >= since);
  const unique = dedupe(recent, id => byId.get(id));
  unique.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0) || (a.id < b.id ? -1 : 1));
  const perSource = new Map();
  const capped = unique.filter(i => { const n = (perSource.get(i.source) || 0) + 1; perSource.set(i.source, n); return n <= (byId.get(i.source).cap || defaultCap); });
  return capped.slice(0, maxItems);
}
