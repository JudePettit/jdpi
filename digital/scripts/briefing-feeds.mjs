// Digital Briefing feed handling: parse journal, preprint, lab, advisory and news feeds (RSS 2.0, RSS 1.0/RDF with
// Dublin Core and PRISM, Atom, and arXiv's announcement feeds) into plain items with DOIs, authors and the feed's own
// section labels; normalise them; pick a day's preprints; de-duplicate; and roll the seven-day store forward. Pure
// functions (no network), so tests can run them on fixtures. Entity decoding, canonical URLs and title keys come from
// the Intelligence Briefing's parser (briefing/scripts/rss.mjs); the text clean-up (plain text, summaries, DOIs, dates,
// ids, title similarity) from the Scientific Briefing's (science/scripts/briefing-feeds.mjs). The shape of the store
// follows the Economics Briefing (econ/scripts/briefing-feeds.mjs).
import { decode, canonicalUrl, titleKey } from '../../briefing/scripts/rss.mjs';
import { plain, clip, summarise, extractDoi, parseDate, urlKey, makeId, titleSimilarity, SUMMARY_MAX } from '../../science/scripts/briefing-feeds.mjs';
import { classify, detectType, isGenre, isDroppedTitle, FIELD_IDS } from './classify.mjs';

export { titleKey, urlKey, SUMMARY_MAX };
export const AUTHORS_MAX = 120;

// ---- Entities ----------------------------------------------------------------------------------------------------------
// The shared decoder knows only the commonest named entities; some feeds also use the accented-letter ones.
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const NAMED = Object.fromEntries([
  ...LATIN1.map((n, k) => [n, String.fromCodePoint(160 + k)]),
  ['OElig', 'Œ'], ['oelig', 'œ'], ['Scaron', 'Š'], ['scaron', 'š'], ['Yuml', 'Ÿ'], ['Zcaron', 'Ž'], ['zcaron', 'ž'], ['euro', '€'],
  ['trade', '™'], ['bull', '•'], ['dagger', '†'], ['Dagger', '‡'], ['permil', '‰'], ['lsaquo', '‹'], ['rsaquo', '›'], ['sbquo', '‚'],
  ['bdquo', '„'], ['minus', '−'], ['ensp', ' '], ['emsp', ' '], ['thinsp', ' '], ['prime', '′'], ['Prime', '″'], ['circ', 'ˆ'], ['tilde', '˜'],
]);
/** Named entities the shared decoder leaves behind, turned into characters. */
export const fixEntities = s => String(s ?? '').replace(/&([a-zA-Z][a-zA-Z0-9]{1,7});/g, (m, n) => NAMED[n] ?? m);

// ---- TeX ---------------------------------------------------------------------------------------------------------------
// Preprint and journal titles carry inline TeX ("$\mathcal{O}(n)$", "$${\pmb{\mathbb{Z}}}_{\bf{2}}$$"): unwrap the
// formatting commands, turn simple sub- and superscripts and common symbols into characters, and drop the dollars.
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', n: 'ₙ', k: 'ₖ', i: 'ᵢ', j: 'ⱼ' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ', T: 'ᵀ', '*': '*' };
const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ',
  Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', times: '×', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈', sim: '~',
  pm: '±', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', ell: 'ℓ', log: 'log', ln: 'ln', sqrt: '√', in: '∈', partial: '∂', nabla: '∇', ldots: '…',
  dots: '…', cdots: '…', langle: '⟨', rangle: '⟩', mid: '|', otimes: '⊗', oplus: '⊕', dagger: '†', hbar: 'ħ', star: '⋆', circ: '∘',
};
const WRAPS = 'pmb|mathbb|mathbf|mathcal|mathrm|mathit|mathsf|mathfrak|mathscr|boldsymbol|bm|textbf|textit|textrm|textsf|texttt|text|emph|bf|it|rm|operatorname|mbox|hat|tilde|bar|vec|widetilde|widehat|overline';
const TEX_WRAP = new RegExp(`\\\\(?:${WRAPS})\\s*\\{([^{}]*)\\}`, 'g'), HAS_WRAP = new RegExp(TEX_WRAP.source);
// Real TeX only: "$$…$$", a command, or dollars around something with _ ^ { } or \ in it ("$5 billion" stays as it is).
const HAS_TEX = /\$\$|\\[A-Za-z]{2,}|\$[^$]*[_^{}\\][^$]*\$/;
const script = (body, map) => { const t = body.replace(/[{}]/g, ''); return [...t].every(c => map[c]) ? [...t].map(c => map[c]).join('') : `${map === SUB ? '_' : '^'}${t}`; };
const texToText = t => {
  for (let pass = 0; pass < 5 && HAS_WRAP.test(t); pass++) t = t.replace(TEX_WRAP, '$1');
  return t.replace(/\\([A-Za-z]+)\s?/g, (m, n) => SYMBOLS[n] ?? '')
    .replace(/_(\{[^{}]*\}|[0-9a-z+-])/g, (_, b) => script(b, SUB))
    .replace(/\^(\{[^{}]*\}|[0-9a-zA-Z+*-])/g, (_, b) => script(b, SUP))
    .replace(/\\([{}$%&_#])/g, '$1').replace(/\\[,;:! ]/g, ' ').replace(/[{}]/g, '');
};
/** Inline TeX in a title or summary → readable text; text without TeX is returned unchanged. */
export function tidyTex(s) {
  s = String(s ?? '');
  if (!HAS_TEX.test(s)) return s;
  s = s.replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (m, a, b) => texToText(a ?? b));
  if (/\\[A-Za-z]{2,}/.test(s)) s = texToText(s);
  return s.replace(/\s+/g, ' ').trim();
}
const txt = s => fixEntities(plain(fixEntities(s)));

// ---- Fields ----------------------------------------------------------------------------------------------------------
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const field = (block, name) => { const m = block.match(new RegExp(`<${reEsc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${reEsc(name)}>`, 'i')); return m ? m[1] : ''; };
const fields = (block, name) => [...block.matchAll(new RegExp(`<${reEsc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${reEsc(name)}>`, 'gi'))].map(m => m[1]);
const attr = (tagText, a) => { const m = tagText.match(new RegExp(`\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

// ---- Dates -----------------------------------------------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
/**
 * Date text → ISO string or null. A date at the publisher's own midnight ("Tue, 28 Oct 2026 00:00:00 -0400", arXiv's
 * announcement date; "2026-10-28T00:00:00+02:00") is a date without a time and becomes midnight UTC of that date, so it
 * is grouped under that day and shown without a clock time.
 */
export function parseFeedDate(text) {
  const t = plain(text);
  if (!t) return null;
  let m = t.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\s+00:00(?::00)?(?:\s*(?:[+-]\d{2}:?\d{2}|GMT|UTC?|Z|[ECMP][SD]T))?$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}T00:00:00.000Z`;
  m = t.match(/^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return `${m[1]}T00:00:00.000Z`;
  return parseDate(t)[0];
}

// ---- Titles and authors ----------------------------------------------------------------------------------------------
// Marks some feeds put in front of the title or after it.
const TITLE_CLEAN = [
  /^\[\$\]\s*/,                     // LWN: "[$] Guidelines for panics in kernel code" (subscriber-only for a week)
  /\s*[*†‡]+$/,                     // journals' acknowledgement marks
];
// GOV.UK prefixes the kind of document to the title ("Policy paper: Telecoms Modernisation"); it becomes the section.
const GOVUK = /^(Policy paper|Guidance|Research and analysis|Research|Press release|News story|Speech|Consultation outcome|Open consultation|Closed consultation|Independent report|Correspondence|Decision|Impact assessment|Government response|Written statement to Parliament|Oral statement to Parliament|Statutory guidance|Corporate report|Case study|Collection):\s+(?=\S)/;

/** "NED AUGENBLICK" → "Ned Augenblick"; other names unchanged. */
const titleCase = n => (/\p{Ll}/u.test(n) ? n : n.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()));
// Words that mark an affiliation or a site account rather than a person.
const NOT_A_PERSON = /@|https?:|webmaster|\bstaff\b|\beditor|universit|institut|\bschool\b|college|department|research|bureau|\bteam\b|\bdesk\b|\bnews\b|insights|\binc\b|\bltd\b|foundation|laborator|technolog|\blab\b/i;
const splitNames = t => t.split(/\s*(?:;|,(?!\s*(?:Jr|Sr|III|II)\b)|\s&\s|\band\b)\s*/);

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
    // One field holding several names run together with their affiliations is not usable.
    if ((t.match(/\p{Ll}{3}\p{Lu}\p{Ll}{2}/gu) || []).length >= 2) return '';
    for (const n of splitNames(t)) {
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

/** How many people an item's author fields name (arXiv lists them all in one dc:creator). */
export const authorCount = raw => (raw || []).flatMap(r => splitNames(txt(r))).filter(n => /\S\s+\S/.test(n.trim())).length;

// ---- Summaries -------------------------------------------------------------------------------------------------------
// Boilerplate and furniture around the teaser, removed before the shared summary clean-up.
const PRE_CLEAN = [
  [/^\s*arXiv:\S+\s+Announce Type:\s*[\w-]+\s*(?:Abstract:\s*)?/i, ' '],                         // arXiv: "arXiv:2610.35996v1 Announce Type: new Abstract: …"
  [/^\s*(?:<p>\s*)?Quantum \d+, \d+ \(\d{4}\)\.\s*(?:<\/p>)?\s*(?:<a\b[^>]*>[^<]*<\/a>)?/i, ' '],   // Quantum: "Quantum 10, 2255 (2026). https://doi.org/…"
  [/<a\b[^>]*>\s*(?:<strong>)?\s*View CSAF\s*(?:<\/strong>)?\s*<\/a>/gi, ' '],                   // CISA's machine-readable advisory link
  [/^\s*<p>\s*[^<.,:!?]{2,40}?\s*<\/p>\s*(?=<(?:strong|p|div|b)\b)/i, ' '],                       // noyb: a topic label as the first paragraph
  [/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, ' '],                                                   // headings ("Summary", "Key takeaways")
  [/<span[^>]*reading-time[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi, ' '],                             // WordPress reading-time widgets
  [/Reading Time:\s*(?:<[^>]*>\s*)*\d+(?:\s*<[^>]*>)*\s*min(?:ute)?s?\.?/gi, ' '],
  [/^\s*(?:<[^>]+>\s*)*(?:Introduction|Overview|Key [Tt]akeaways:?|TL;DR:?)\s*(?=<|[A-Z])/, ' '],
];
const preClean = html => { let s = fixEntities(decode(String(html || ''))); for (const [re, to] of PRE_CLEAN) s = s.replace(re, to); return s; };
// Section labels and bylines left at the start of a summary ("Anonymous (not verified) Mon, 10/26/2026 - 10:28" from
// Drupal sites, "Insider Brief PRESS RELEASE —"), newsletter promotions at its end, and TeX-style dashes.
const tidySummary = s => s.replace(/^[\p{L}.' -]{2,40} \(not verified\)\s+\w{3}, \d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}\s*/u, '')
  .replace(/^(?:Insider Brief\s+)?(?:PRESS RELEASE\s*[—–-]\s*)?/, '')
  .replace(/^(?:(?:Key [Tt]akeaways|Overview|Introduction|Summary|Abstract|TL;DR)\s*:?\s+)+(?=\p{Lu})/u, '')
  .replace(/\s*(?:Sign up (?:for|to) [^.]{0,80}|Get our [^.]{0,80}?newsletter|Subscribe (?:to|for) [^.]{0,80})\.?\s*(?:…)?$/i, '')
  .replace(/\s*---\s*/g, '—').replace(/\s+--\s+/g, ' – ').trim();

// Category labels that say nothing about the subject, or are a site's internal tags.
const GENERIC_CAT = /^(?:uncategori[sz]ed|not categori[sz]ed|general|news|latest|technology|tech|blogs?|blog posts?|featured|top stories|opinion|articles?|posts?|stories|industry news|research blog|homepage|app|summary)$/i;
const tidyLabel = l => (/^[A-Z][a-z0-9]+(?:-[a-z0-9]+)+$/.test(l) ? l.replace(/-/g, ' ') : l);
const sectionLabel = l => l.length <= 60 && !GENERIC_CAT.test(l) && !/^(?:#|type[\w-]*$|ieee-)/i.test(l);

const DOI_LINK = /\bhttps?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^\s"'<>]+)/i;
const ARXIV_ABS = /^https?:\/\/(?:www\.)?arxiv\.org\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?$/i;

/**
 * Parse an RSS 2.0, RSS 1.0 (RDF) or Atom document into items:
 * { title, url, published (ISO|null), summary, doi, authors[], categories[], genres[], section, announce }.
 * `announce` is arXiv's announcement type (new, cross, replace, replace-cross), '' elsewhere.
 */
export function parseDigitalFeed(xml) {
  const text = String(xml || '');
  const blocks = text.match(/<item\b[\s\S]*?<\/item>/gi) || text.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocks) {
    let title = tidyTex(txt(field(b, 'title') || field(b, 'dc:title'))).slice(0, 400);
    for (const re of TITLE_CLEAN) title = title.replace(re, '').trim();
    let govSection = '';
    const gov = title.match(GOVUK);
    if (gov) { govSection = gov[1]; title = title.slice(gov[0].length); }
    title = title.slice(0, 300);
    let link = plain(field(b, 'link'));
    if (!/^https?:/i.test(link)) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      const alt = links.find(l => !/\brel=/i.test(l) || /\brel=["']alternate["']/i.test(l)) || links[0] || '';
      link = attr(alt, 'href') || plain(field(b, 'prism:url')) || plain(field(b, 'guid'));
    }
    const url = canonicalUrl(link);
    if (!title || !url) continue;
    const published = parseFeedDate(field(b, 'pubDate') || field(b, 'dc:date') || field(b, 'prism:publicationDate') || field(b, 'published') || field(b, 'updated') || field(b, 'prism:coverDate'));
    const labels = [
      ...fields(b, 'dc:type'), ...fields(b, 'prism:section'), ...fields(b, 'category'), ...fields(b, 'dc:subject'),
      ...(b.match(/<category\b[^>]*\bterm=["'][^"']+["'][^>]*\/?>/gi) || []).map(t => attr(t, 'term')),
    ].map(txt).filter(Boolean);
    const uniq = [...new Set(labels.map(l => l.replace(/\s+/g, ' ').trim()))];
    const genres = uniq.filter(isGenre), categories = uniq.filter(l => !isGenre(l));
    const candidates = [field(b, 'dc:description'), field(b, 'description'), field(b, 'summary'), field(b, 'content'), field(b, 'content:encoded')];
    let doi = extractDoi({ prismDoi: field(b, 'prism:doi'), identifier: field(b, 'dc:identifier'), guid: field(b, 'guid'), atomId: field(b, 'id'), url });
    if (!doi) { const m = decode(candidates.filter(Boolean).join(' ')).match(DOI_LINK); if (m) doi = m[1].replace(/[.,;)\]]+$/, ''); }
    const arxiv = url.match(ARXIV_ABS);
    if (!doi && arxiv) doi = `10.48550/arXiv.${arxiv[1]}`;
    const authors = [...fields(b, 'dc:creator')];
    for (const a of fields(b, 'author')) authors.push(field(a, 'name') || a);
    const announce = (plain(field(b, 'arxiv:announce_type')) || (decode(candidates.find(Boolean) || '').match(/Announce Type:\s*([\w-]+)/i) || [])[1] || '').toLowerCase();
    const summary = tidySummary(fixEntities(tidyTex(summarise(candidates.map(preClean), title))));
    const section = govSection || categories.map(tidyLabel).filter(sectionLabel).slice(0, 2).join(' · ').slice(0, 80);
    out.push({ title, url, published, summary, doi, authors, categories, genres, section, announce });
  }
  return out;
}

// ---- Normalising -----------------------------------------------------------------------------------------------------
const STRIP_PARAMS = /^(?:af|rss|sc|src|feed|feedtype|from|mod|ito|cmpid|_ga|sr_share|via|dicbo|campaign_id|emc|cid|ftag|dgcid|syn-\d+|traffic_source|smid|guccounter|ncid|taid|soc_src|soc_trk|mc_cid|mc_eid|guce_referrer\w*|partner|tid|tpcc|ocid)$/i;
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

/**
 * Whether a feed's items carry their authors (research, and named commentary); not for feeds marked noAuthors (the ACM
 * Digital Library runs its authors' names together: "Naveed Ul MustafaXipeng ShenYan Solihin").
 */
export const keepsByline = source => !source.noAuthors && (source.byline === true || !['news', 'official'].includes(source.kind));

/**
 * Whether a feed's own rules leave an item out: its skip list (titles), skipped addresses (Scientific Reports in the
 * Nature Portfolio subject feeds) and categories, items with no category where the feed requires one (OpenAI's
 * customer stories), items that do not match the feed's topic (arXiv quant-ph: quantum computing and information
 * only) and arXiv's cross-lists and revisions.
 */
export function isSkipped(raw, source) {
  const labels = [...(raw.genres || []), ...(raw.categories || [])];
  return Boolean((source.skip && source.skip.test(raw.title)) || (source.skipUrl && source.skipUrl.test(raw.url || '')) ||
    (source.skipCat && labels.some(l => source.skipCat.test(l))) || (source.needsCat && !labels.length) ||
    (source.match && !source.match.test(`${raw.title} ${raw.summary || ''}`)) || (source.newOnly && raw.announce && raw.announce !== 'new'));
}

/**
 * A parsed feed item → the stored shape, or null when it is dropped (front matter, corrections, sponsored posts,
 * the feed's own rules, or an off-topic item from a strict feed). `seen` stamps undated items, or `fallback` when the
 * feed gave a better guess (its Last-Modified time); dates more than 36 hours ahead are treated as undated. Feeds
 * marked dateOnly stamp a date at noon or midnight: they are stored as dates.
 */
export function normalise(raw, source, seen, fallback = seen) {
  if (isSkipped(raw, source)) return null;
  const type = detectType(raw, source);
  if (!type) return null;
  const fieldsOf = classify(raw, source.fields);
  if (source.strict && !fieldsOf.length) return null;
  const now = Date.parse(seen);
  let published = raw.published && Date.parse(raw.published) <= now + 36e5 * 36 ? raw.published : null;
  if (published && source.dateOnly) published = `${published.slice(0, 10)}T00:00:00.000Z`;
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

/**
 * A day's preprints from one category: at most `n` of the entries ({raw, item}) kept from one fetch of an arXiv
 * announcement feed, those with the most authors first (a rough guide to the large lab and collaboration papers),
 * then in arXiv's listing order; returned in listing order. Every fetch of the same announcement picks the same ones.
 */
export function pickDaily(entries, n) {
  if (!n || entries.length <= n) return entries;
  return entries.map((e, k) => ({ e, k, a: authorCount(e.raw.authors) }))
    .sort((x, y) => y.a - x.a || x.k - y.k).slice(0, n).sort((x, y) => x.k - y.k).map(x => x.e);
}

// ---- De-duplication --------------------------------------------------------------------------------------------------
const KIND_RANK = { journal: 0, preprint: 1, lab: 2, research: 3, official: 4, news: 5 };

/**
 * Merge duplicates: the same DOI, the same URL, the same normalised title, or near-identical titles (Dice ≥ 0.88, five
 * or more words) from different outlets within three days. The best copy is kept (lower tier, journals before
 * preprints, labs, institutes, official releases and news, paper before news, earliest); the others' sources go into
 * `also`, their fields are added and a missing summary, DOI or author list is filled in.
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
      if (!hit.section && it.section) hit.section = it.section;
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
  // Items from feeds that left the catalogue go, and so do titles and addresses the drop and skip rules now catch; the
  // rest are re-classified so rule changes apply to the whole store (and strict feeds lose items that no longer match a
  // field).
  const pool = [];
  for (const i of [...prevItems, ...freshItems]) {
    const s = byId.get(i.source);
    if (!s || isDroppedTitle(i.title) || (s.skip && s.skip.test(i.title)) || (s.skipUrl && s.skipUrl.test(i.url)) || (s.match && !s.match.test(`${i.title} ${i.summary || ''}`))) continue;
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
