// OSINT Dashboard: pure helpers with no DOM. URL hash state; query builders for search engines, archives and GDELT;
// parsers for the Wayback Machine, RDAP, DNS-over-HTTPS, certificate transparency, GLEIF, OpenSanctions and GDELT;
// and the case notebook's model, import and export. Shared by the page (app.js and the tab modules) and by
// tests/osint.test.mjs. Nothing here touches the network: callers fetch, these functions build URLs and read replies.

/* ---------------------------------------------------------------------------------------------------------------
   Basics
   --------------------------------------------------------------------------------------------------------------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const pad = n => String(n).padStart(2, '0');
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** An http(s) URL as a normalised string, or '' for anything else (javascript:, data:, garbage). */
export function safeHttpUrl(u) {
  try {
    const x = new URL(String(u ?? '').trim());
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : '';
  } catch { return ''; }
}

/** A URL the user typed ("example.com/page", "http://…"), made absolute with https:// when it has no scheme. '' if invalid. */
export function normaliseUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  const u = safeHttpUrl(s);
  if (!u) return '';
  const host = new URL(u).hostname;
  return host.includes('.') || host === 'localhost' ? u : '';
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
/** The hostname from a URL or a bare domain, lower-case and in ASCII (punycode); '' when it is not a valid domain name. */
export function hostOf(input) {
  let s = String(input ?? '').trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s.replace(/^\/+/, '');
  let host;
  try { host = new URL(s).hostname; } catch { return ''; }
  host = host.replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return '';
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every(l => LABEL.test(l)) || /^\d+$/.test(labels.at(-1))) return '';
  return host;
}

/** Names to try for a domain registration, longest first: www.news.example.co.uk → …, example.co.uk, (never the bare TLD). */
export function domainCandidates(host) {
  const labels = String(host || '').split('.').filter(Boolean);
  const out = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join('.'));
  return out.filter(d => d.split('.').length >= 2);
}

export const isIPv4 = s => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(s));
export const isIPv6 = s => /^[0-9a-f:]+$/i.test(String(s)) && String(s).includes(':') && String(s).split('::').length <= 2;

/** Expand an IPv6 address to its eight full groups ("2001:db8::1" → ["2001","0db8","0000",…,"0001"]). */
export function expandIPv6(ip) {
  const [head, tail = ''] = String(ip).toLowerCase().split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const fill = String(ip).includes('::') ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map(g => g.padStart(4, '0'));
}

/** The reverse-DNS (PTR) name for an IP address. */
export function ptrName(ip) {
  if (isIPv4(ip)) return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  if (isIPv6(ip)) return expandIPv6(ip).join('').split('').reverse().join('.') + '.ip6.arpa';
  return '';
}

/** YYYY-MM-DD for a Date in UTC. */
export const isoDay = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** "28 Oct 2026, 14:05 UTC". */
export function utcLabel(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+t)) return '';
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
}
/** "28 Oct 2026". */
export function dayLabel(d) {
  const t = d instanceof Date ? d : new Date(String(d).length === 10 ? d + 'T00:00:00Z' : d);
  if (Number.isNaN(+t)) return '';
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
/** Whole years between an ISO date and now (or `ref`). */
export function yearsSince(iso, ref = Date.now()) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((ref - t) / (365.2425 * 864e5));
}

/* ---------------------------------------------------------------------------------------------------------------
   Tabs and the URL hash (#tab=domains&q=example.com)
   --------------------------------------------------------------------------------------------------------------- */
export const TABS = [
  { id: 'overview', name: 'Overview' },
  { id: 'search', name: 'Search' },
  { id: 'archives', name: 'Archives' },
  { id: 'domains', name: 'Domains' },
  { id: 'orgs', name: 'Organisations & sanctions' },
  { id: 'events', name: 'Events' },
  { id: 'media', name: 'Media check' },
  { id: 'notebook', name: 'Case notebook' },
  { id: 'cookbook', name: 'Software Cookbook' },
  { id: 'kit', name: 'Kit Guide' },
  { id: 'law', name: 'Law & ethics' },
];
const TAB_IDS = TABS.map(t => t.id);
const TAB_ALIASES = {
  home: 'overview', start: 'overview', engines: 'search', archive: 'archives', wayback: 'archives', domain: 'domains', dns: 'domains',
  whois: 'domains', rdap: 'domains', organisations: 'orgs', organizations: 'orgs', companies: 'orgs', sanctions: 'orgs', gleif: 'orgs',
  event: 'events', gdelt: 'events', news: 'events', image: 'media', images: 'media', exif: 'media', verify: 'media', case: 'notebook',
  notes: 'notebook', software: 'cookbook', tools: 'cookbook', hardware: 'kit', guide: 'kit', ethics: 'law', legal: 'law',
};
export const resolveTab = t => { const k = String(t || '').toLowerCase(); return TAB_IDS.includes(k) ? k : TAB_ALIASES[k] || null; };

/**
 * Page state from a hash such as "#tab=domains&q=example.com", "#tab=cookbook&s=exiftool" or "#tab=events&q=…&w=1m"
 * (q: the tab's query; s: a guide section; w: the Events window). Unknown tabs fall back to the overview.
 */
export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#\/?/, ''));
  const w = p.get('w') || '';
  return {
    tab: resolveTab(p.get('tab') || p.get('view')) || 'overview',
    q: (p.get('q') || '').slice(0, 500),
    s: (p.get('s') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80),
    w: Object.hasOwn(GDELT_SPANS, w) ? w : '',
  };
}
/** The hash for a state, in a fixed order; the overview with nothing else is just "#tab=overview". */
export function toHash({ tab = 'overview', q = '', s = '', w = '' } = {}) {
  const p = new URLSearchParams({ tab: resolveTab(tab) || 'overview' });
  if (q) p.set('q', q);
  if (s) p.set('s', s);
  if (w && Object.hasOwn(GDELT_SPANS, w)) p.set('w', w);
  return '#' + p.toString();
}

/* ---------------------------------------------------------------------------------------------------------------
   OSINT Training (fe/learning/osint.md): lesson ids are slugs of the lesson titles, as fe/learning.html makes them
   --------------------------------------------------------------------------------------------------------------- */
export const lessonSlug = title => String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
export const COURSE_URL = 'fe/learning.html?course=osint';
export const lessonUrl = slug => COURSE_URL + (slug ? '&lesson=' + enc(slug) : '');
export const LESSONS = {
  what: 'What OSINT is, and what it is not',
  cycle: 'The intelligence cycle',
  grading: 'Grading sources and tracing provenance',
  search: 'Search operators, languages and translation',
  archives: 'Archives and preservation',
  images: 'Reverse image search, metadata and synthetic media',
  geolocation: 'Geolocation',
  satellite: 'Satellite imagery and chronolocation',
  companies: 'Company registries and ownership',
  sanctions: 'Sanctions, procurement and court records',
  movement: 'Tracking aircraft, ships, fires and lights',
  events: 'Event data and base rates',
  writing: 'Bottom line up front, sourcing and the audit trail',
  law: 'Law, terms of service and data protection',
  harm: 'Doing no harm and staying safe',
};

/* ---------------------------------------------------------------------------------------------------------------
   Search launcher: one query spec, written in each engine's own syntax
   spec = { all, phrase, any, none, site, filetype, intitle, from, to }   (from/to are YYYY-MM-DD)
   --------------------------------------------------------------------------------------------------------------- */
export const FILETYPES = { '': 'Any format', pdf: 'PDF', doc: 'Word (doc, docx)', xls: 'Excel (xls, xlsx)', ppt: 'PowerPoint (ppt, pptx)', csv: 'CSV', txt: 'Plain text' };
const FILE_EXT = { pdf: ['pdf'], doc: ['doc', 'docx'], xls: ['xls', 'xlsx'], ppt: ['ppt', 'pptx'], csv: ['csv'], txt: ['txt'] };

/** Split typed words into terms, keeping "quoted phrases" whole: 'a "b c" d' → ['a', '"b c"', 'd']. */
export function splitTerms(s) {
  return (String(s ?? '').match(/"[^"]+"|[^\s,]+/g) || []).map(t => t.trim()).filter(t => t && t !== '"');
}
const quote = t => (/^".*"$/.test(t) ? t : /\s/.test(t) ? `"${t}"` : t);

export function normaliseSpec(spec = {}) {
  const s = {};
  for (const k of ['all', 'any', 'none', 'site']) s[k] = clean(spec[k]);
  s.phrase = clean(spec.phrase).replace(/"/g, '');
  s.intitle = clean(spec.intitle).replace(/"/g, '');
  s.filetype = FILETYPES[spec.filetype] !== undefined ? spec.filetype || '' : '';
  s.from = isDay(spec.from) ? spec.from : '';
  s.to = isDay(spec.to) ? spec.to : '';
  if (s.from && s.to && s.from > s.to) [s.from, s.to] = [s.to, s.from];
  s.site = splitTerms(s.site).map(x => x.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()).filter(Boolean).join(' ');
  return s;
}
export const specIsEmpty = s => !['all', 'phrase', 'any', 'intitle'].some(k => clean(s?.[k]));

const DIALECTS = {
  google: { or: 'OR', minus: true, site: 'site:', filetype: 'filetype:', intitle: 'intitle:', dates: 'ops' },
  scholar: { or: 'OR', minus: true, site: 'site:', filetype: null, intitle: 'intitle:', dates: 'years' },
  bing: { or: 'OR', minus: true, site: 'site:', filetype: 'filetype:', intitle: 'intitle:', dates: 'bing' },
  bingnews: { or: 'OR', minus: true, site: 'site:', filetype: null, intitle: 'intitle:', dates: null },
  ddg: { or: 'OR', minus: true, site: 'site:', filetype: 'filetype:', intitle: 'intitle:', dates: 'ddg' },
  brave: { or: 'OR', minus: true, site: 'site:', filetype: 'filetype:', intitle: 'intitle:', dates: null },
  yandex: { or: '|', minus: true, site: 'site:', filetype: 'mime:', intitle: 'title:', dates: null },
  baidu: { or: '|', minus: true, site: 'site:', filetype: 'filetype:', intitle: 'intitle:', dates: null },
  plain: { or: null, minus: false, site: null, filetype: null, intitle: null, dates: null },
};

/**
 * The query string for one engine's syntax, and what that engine cannot do (`dropped`, plain-English notes).
 * `override` replaces fields (e.g. the government shortcuts set `site`).
 */
export function buildQuery(spec, dialectId = 'google', override = {}) {
  const s = normaliseSpec({ ...spec, ...override });
  const d = DIALECTS[dialectId] || DIALECTS.plain;
  const parts = [], dropped = [];
  parts.push(...splitTerms(s.all).map(quote));
  if (s.phrase) parts.push(`"${s.phrase}"`);
  const any = splitTerms(s.any).map(quote);
  if (any.length === 1) parts.push(any[0]);
  else if (any.length > 1) {
    if (d.or) parts.push(`(${any.join(` ${d.or} `)})`);
    else { parts.push(...any); dropped.push('“any of these words” are added as ordinary words'); }
  }
  const none = splitTerms(s.none).map(quote);
  if (none.length) {
    if (d.minus) parts.push(...none.map(t => '-' + t));
    else dropped.push('excluded words are ignored');
  }
  if (s.intitle) {
    if (d.intitle) parts.push(d.intitle + quote(s.intitle));
    else { parts.push(...splitTerms(s.intitle).map(quote)); dropped.push('title words are searched anywhere');
    }
  }
  const sites = splitTerms(s.site);
  if (sites.length) {
    if (d.site) parts.push(sites.length === 1 ? d.site + sites[0] : `(${sites.map(x => d.site + x).join(` ${d.or || 'OR'} `)})`);
    else dropped.push('the site limit is ignored');
  }
  if (s.filetype) {
    if (d.filetype) {
      const ext = FILE_EXT[s.filetype];
      parts.push(ext.length === 1 ? d.filetype + ext[0] : `(${ext.map(x => d.filetype + x).join(` ${d.or || 'OR'} `)})`);
    } else dropped.push('the file type is ignored');
  }
  if (s.from || s.to) {
    if (d.dates === 'ops') { if (s.from) parts.push('after:' + s.from); if (s.to) parts.push('before:' + s.to); }
    else if (!d.dates) dropped.push('dates are ignored: filter on the results page');
  }
  return { q: parts.join(' ').trim(), dropped, spec: s };
}

const epochDays = day => Math.floor(Date.parse(day + 'T00:00:00Z') / 864e5);
/** Date-range URL parameters for engines that take them in the URL rather than in the query. */
export function dateParams(dialectId, s, today = isoDay()) {
  if (!s.from && !s.to) return '';
  const from = s.from || '1995-01-01', to = s.to || today;
  if (dialectId === 'bing') return '&filters=' + enc(`ex1:"ez5_${epochDays(from)}_${epochDays(to)}"`);
  if (dialectId === 'ddg') return '&df=' + enc(`${from}..${to}`);
  if (dialectId === 'scholar') return (s.from ? '&as_ylo=' + s.from.slice(0, 4) : '') + (s.to ? '&as_yhi=' + s.to.slice(0, 4) : '');
  return '';
}

/** The plain words of a query, for site search boxes that take no operators. */
export function plainQuery(spec) {
  const s = normaliseSpec(spec);
  return [s.all, s.phrase && `"${s.phrase}"`, s.any, s.intitle].filter(Boolean).join(' ').trim();
}

export const SEARCH_GROUPS = [
  { id: 'web', name: 'Web search', note: 'Different engines index different parts of the web: run important searches on more than one.' },
  { id: 'news', name: 'News', note: 'Recent reporting. GDELT runs inside this dashboard, on the Events tab.' },
  { id: 'gov', name: 'Government, law and procurement', note: 'Official publications, legislation, debates, court judgments and tenders.' },
  { id: 'academic', name: 'Academic', note: 'Papers, preprints and theses. Year ranges apply where the engine supports them.' },
  { id: 'data', name: 'Open data', note: 'Datasets published by governments and researchers.' },
  { id: 'social', name: 'Video and social (public posts)', note: 'Several platforms need a login to search. Use an honest research account within their rules, or skip them.' },
  { id: 'archives', name: 'Archives', note: 'What a site looked like before. Enter a site above to list its captured pages.' },
];

const GOV_SITES = [
  ['govie', 'Irish government', 'gov.ie'], ['govuk-site', 'UK government', 'gov.uk'], ['eu-site', 'EU institutions', 'europa.eu'],
  ['usgov', 'US government', '.gov'], ['un-site', 'UN system', 'un.org'],
];

/** Every launcher for a spec: [{ id, group, name, href, q, dropped, desc }]. Disabled ones have href ''. */
export function launchers(spec, today = isoDay()) {
  const s = normaliseSpec(spec);
  const empty = specIsEmpty(s);
  const out = [];
  const add = (group, id, name, dialect, url, desc, override) => {
    const b = buildQuery(s, dialect, override || {});
    out.push({ group, id, name, desc, q: b.q, dropped: b.dropped, href: b.q && !empty ? url(b.q, b.spec) : '' });
  };
  const plain = (group, id, name, url, desc) => {
    const q = plainQuery(s);
    const dropped = [];
    if (s.none) dropped.push('excluded words are ignored');
    if (s.site) dropped.push('the site limit is ignored');
    if (s.filetype) dropped.push('the file type is ignored');
    if (s.from || s.to) dropped.push('dates are ignored: filter on the results page');
    out.push({ group, id, name, desc, q, dropped, href: q ? url(q) : '' });
  };
  // Web
  add('web', 'google', 'Google', 'google', q => `https://www.google.com/search?q=${enc(q)}`, 'All operators, including dates (after:, before:)');
  add('web', 'bing', 'Bing', 'bing', (q, x) => `https://www.bing.com/search?q=${enc(q)}${dateParams('bing', x, today)}`, 'Its own index; date range set in the URL');
  add('web', 'duckduckgo', 'DuckDuckGo', 'ddg', (q, x) => `https://duckduckgo.com/?q=${enc(q)}${dateParams('ddg', x, today)}`, 'Private search; date range set in the URL');
  add('web', 'brave', 'Brave Search', 'brave', q => `https://search.brave.com/search?q=${enc(q)}`, 'An independent index');
  add('web', 'yandex', 'Yandex', 'yandex', q => `https://yandex.com/search/?text=${enc(q)}`, 'Strongest for the Russian-language web');
  add('web', 'baidu', 'Baidu', 'baidu', q => `https://www.baidu.com/s?wd=${enc(q)}`, 'The main engine in China');
  plain('web', 'naver', 'Naver', q => `https://search.naver.com/search.naver?query=${enc(q)}`, 'The main engine in South Korea');
  // News
  add('news', 'google-news', 'Google News', 'google', q => `https://news.google.com/search?q=${enc(q)}`, 'Accepts after: and before:');
  add('news', 'bing-news', 'Bing News', 'bingnews', q => `https://www.bing.com/news/search?q=${enc(q)}`, 'Sort by date on the results page');
  add('news', 'ddg-news', 'DuckDuckGo News', 'ddg', (q, x) => `https://duckduckgo.com/?q=${enc(q)}&iar=news&ia=news${dateParams('ddg', x, today)}`, 'News results only');
  { const q = gdeltQueryFromSpec(s); out.push({ group: 'news', id: 'gdelt', name: 'GDELT news monitor', internal: true, desc: 'Timeline and articles, on the Events tab of this dashboard', q, dropped: [], href: q ? '#' + new URLSearchParams({ tab: 'events', q }).toString() : '' }); }
  // Government
  for (const [id, label, site] of GOV_SITES) add('gov', id, `Google: ${label}`, 'google', q => `https://www.google.com/search?q=${enc(q)}`, `Only pages on ${site}`, { site });
  plain('gov', 'govuk', 'GOV.UK search', q => `https://www.gov.uk/search/all?keywords=${enc(q)}`, 'UK government guidance, news and documents');
  plain('gov', 'gov-ie', 'gov.ie search', q => `https://www.gov.ie/en/search/?q=${enc(q)}`, 'Irish government publications');
  plain('gov', 'eurlex', 'EUR-Lex', q => `https://eur-lex.europa.eu/search.html?text=${enc(q)}&scope=EURLEX&type=quick&lang=en`, 'EU law, including sanctions regulations');
  plain('gov', 'oireachtas', 'Oireachtas debates', q => `https://www.oireachtas.ie/en/debates/find/?term=${enc(q)}`, 'Irish parliamentary debates');
  plain('gov', 'hansard', 'UK Hansard', q => `https://hansard.parliament.uk/search?searchTerm=${enc(q)}`, 'UK parliamentary debates');
  plain('gov', 'federal-register', 'US Federal Register', q => `https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=${enc(q)}`, 'US rules, notices and sanctions actions');
  plain('gov', 'un-library', 'UN Digital Library', q => `https://digitallibrary.un.org/search?p=${enc(q)}`, 'UN documents, resolutions and reports');
  plain('gov', 'ted', 'EU tenders (TED)', q => `https://ted.europa.eu/en/search/result?FT=${enc(q)}`, 'Public procurement notices across the EU');
  plain('gov', 'case-law', 'UK Find Case Law', q => `https://caselaw.nationalarchives.gov.uk/search?query=${enc(q)}`, 'Judgments from UK courts and tribunals');
  plain('gov', 'courtlistener', 'CourtListener', q => `https://www.courtlistener.com/?q=${enc(q)}`, 'US court opinions, free');
  // Academic
  add('academic', 'scholar', 'Google Scholar', 'scholar', (q, x) => `https://scholar.google.com/scholar?q=${enc(q)}${dateParams('scholar', x, today)}`, 'Year range from your dates');
  plain('academic', 'semantic-scholar', 'Semantic Scholar', q => `https://www.semanticscholar.org/search?q=${enc(q)}`, 'Papers with citation graphs');
  plain('academic', 'openalex', 'OpenAlex', q => `https://openalex.org/works?search=${enc(q)}`, 'Open index of scholarly works');
  plain('academic', 'base', 'BASE', q => `https://www.base-search.net/Search/Results?lookfor=${enc(q)}`, 'Open-access repositories worldwide');
  plain('academic', 'core', 'CORE', q => `https://core.ac.uk/search/?q=${enc(q)}`, 'Full texts of open-access papers');
  plain('academic', 'arxiv', 'arXiv', q => `https://arxiv.org/search/?query=${enc(q)}&searchtype=all`, 'Preprints in physics, computing and more');
  plain('academic', 'pubmed', 'PubMed', q => `https://pubmed.ncbi.nlm.nih.gov/?term=${enc(q)}`, 'Biomedical literature');
  plain('academic', 'crossref', 'Crossref', q => `https://search.crossref.org/search/works?q=${enc(q)}&from_ui=yes`, 'DOIs and publication metadata');
  // Data
  plain('data', 'dataset-search', 'Google Dataset Search', q => `https://datasetsearch.research.google.com/search?query=${enc(q)}`, 'Datasets across the web');
  plain('data', 'data-europa', 'data.europa.eu', q => `https://data.europa.eu/data/datasets?query=${enc(q)}`, 'EU and member-state open data');
  plain('data', 'data-gov-ie', 'data.gov.ie', q => `https://data.gov.ie/dataset?q=${enc(q)}`, 'Irish open data');
  plain('data', 'data-gov-uk', 'data.gov.uk', q => `https://www.data.gov.uk/search?q=${enc(q)}`, 'UK open data');
  // Social
  plain('social', 'youtube', 'YouTube', q => `https://www.youtube.com/results?search_query=${enc(q)}`, 'Filter by upload date on the results page');
  plain('social', 'reddit', 'Reddit', q => `https://www.reddit.com/search/?q=${enc(q)}`, 'Public posts and comments');
  plain('social', 'bluesky', 'Bluesky', q => `https://bsky.app/search?q=${enc(q)}`, 'Public posts');
  // Archives
  const site = splitTerms(s.site)[0] || '';
  out.push({ group: 'archives', id: 'wayback-site', name: 'Wayback Machine: captured pages', desc: site ? `Every captured address under ${site}` : 'Enter a site above first', q: site, dropped: [], href: site ? `https://web.archive.org/web/*/${site.replace(/^\./, '')}*` : '' });
  out.push({ group: 'archives', id: 'archives-tab', name: 'Check one page in the archives', internal: true, desc: 'Captures, snapshots and Save Page Now, on the Archives tab', q: site, dropped: [], href: '#' + new URLSearchParams(site ? { tab: 'archives', q: site.replace(/^\./, '') } : { tab: 'archives' }).toString() });
  return out;
}

/* ---------------------------------------------------------------------------------------------------------------
   Archives: Wayback Machine availability and CDX APIs, Save Page Now, archive.today
   --------------------------------------------------------------------------------------------------------------- */
/** A 1–14 digit Wayback timestamp for a Date or YYYY-MM-DD ('' if none). */
export function waybackTimestamp(d) {
  if (!d) return '';
  if (typeof d === 'string' && isDay(d)) return d.replace(/-/g, '');
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+t)) return '';
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
}
/** A Date from a Wayback timestamp ("20261027205234", or a shorter prefix). */
export function parseWaybackTimestamp(ts) {
  const m = String(ts || '').match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?$/);
  if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00'] = m;
  const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(+t) ? null : t;
}
export const waybackAvailabilityUrl = (url, timestamp = '') => `https://archive.org/wayback/available?url=${enc(url)}${timestamp ? '&timestamp=' + enc(timestamp) : ''}`;
export const waybackCaptureUrl = (timestamp, original) => `https://web.archive.org/web/${timestamp}/${original}`;
export const waybackCalendarUrl = url => `https://web.archive.org/web/*/${url}`;
export const savePageNowUrl = url => `https://web.archive.org/save/${url}`;
export const archiveTodayUrls = url => ({ newest: `https://archive.ph/newest/${url}`, list: `https://archive.ph/${url}`, save: `https://archive.ph/?run=1&url=${enc(url)}` });

/** The closest capture from an availability reply, with an https capture address; null when nothing is archived. */
export function parseAvailability(json) {
  const c = json?.archived_snapshots?.closest;
  if (!c || c.available === false || !c.url) return null;
  return { url: String(c.url).replace(/^http:\/\//, 'https://'), timestamp: String(c.timestamp || ''), date: parseWaybackTimestamp(c.timestamp), status: String(c.status || '') };
}

/** A CDX query (one row per capture; collapse=digest keeps only captures whose content changed). */
export function cdxUrl(url, { limit = 500, collapseDigest = true, from = '', to = '', prefix = false } = {}) {
  const p = new URLSearchParams({ url: prefix ? url.replace(/\/?$/, '/*') : url, output: 'json', fl: 'timestamp,original,statuscode,mimetype,digest,length', limit: String(limit) });
  if (collapseDigest) p.set('collapse', 'digest');
  if (from) p.set('from', from.replace(/-/g, ''));
  if (to) p.set('to', to.replace(/-/g, ''));
  return 'https://web.archive.org/cdx/search/cdx?' + p.toString().replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2A/g, '*');
}

/** Rows from CDX output, JSON (output=json, first row is the header) or the default space-separated text. */
export function parseCdx(text) {
  const src = String(text ?? '').trim();
  if (!src) return [];
  const DEFAULT = ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'];
  let rows, header;
  if (src.startsWith('[')) {
    let data;
    try { data = JSON.parse(src); } catch { throw new Error('That is not valid CDX JSON. Copy the whole page, from the first [ to the last ].'); }
    if (!Array.isArray(data) || !data.length) return [];
    if (Array.isArray(data[0]) && data[0].includes('timestamp')) { header = data[0]; rows = data.slice(1); }
    else { header = DEFAULT; rows = data; }
  } else {
    const lines = src.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    header = lines[0].split(/\s+/).length === 6 ? ['timestamp', 'original', 'statuscode', 'mimetype', 'digest', 'length'] : DEFAULT;
    rows = lines.map(l => l.split(/\s+/));
  }
  const ix = k => header.indexOf(k);
  return rows.filter(r => Array.isArray(r) && /^\d{4,14}$/.test(r[ix('timestamp')] || '')).map(r => {
    const timestamp = r[ix('timestamp')], original = r[ix('original')] || '';
    const len = Number(r[ix('length')]);
    return {
      timestamp, date: parseWaybackTimestamp(timestamp), original,
      status: ix('statuscode') >= 0 ? r[ix('statuscode')] : '', mime: ix('mimetype') >= 0 ? r[ix('mimetype')] : '',
      digest: ix('digest') >= 0 ? r[ix('digest')] : '', length: Number.isFinite(len) ? len : null,
      capture: waybackCaptureUrl(timestamp, original),
    };
  });
}

/** Mark captures whose content differs from the previous one (by digest); rows must be in time order. */
export function markChanges(rows) {
  let prev = null;
  return rows.map(r => { const changed = prev === null || (r.digest && r.digest !== prev); prev = r.digest || prev; return { ...r, changed }; });
}

/** Mid-year timestamps from `fromYear` to `toYear`, newest first, for sampling one capture a year. */
export function yearSampleTimestamps(fromYear, toYear) {
  const out = [];
  for (let y = toYear; y >= fromYear; y--) out.push(`${y}0701`);
  return out;
}
/** Distinct captures from several availability replies, oldest first. */
export function distinctCaptures(list) {
  const seen = new Map();
  for (const c of list) if (c?.timestamp && !seen.has(c.timestamp)) seen.set(c.timestamp, c);
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/* ---------------------------------------------------------------------------------------------------------------
   Domains: RDAP (registration), DNS over HTTPS, IP RDAP (hosting), certificate transparency
   --------------------------------------------------------------------------------------------------------------- */
export const rdapDomainUrl = d => `https://rdap.org/domain/${enc(d)}`;
// IP addresses go into the path as they are: rdap.org answers 400 to an IPv6 address with its colons percent-encoded.
export const rdapIpUrl = ip => (isIPv4(ip) || isIPv6(ip) ? `https://rdap.org/ip/${ip}` : '');
export const icannLookupUrl = d => `https://lookup.icann.org/en/lookup?name=${enc(d)}`;
export const ianaTldUrl = d => `https://www.iana.org/domains/root/db/${enc(String(d).split('.').pop())}.html`;

/*
 * RDAP bootstrap (RFC 9224). IANA's files name the RDAP server of every top-level domain's registry and of the regional
 * internet registry for every address block. The page asks those servers directly (all CORS-enabled, checked 28 October
 * 2026) and uses rdap.org, a redirector built on the same files, only as a fallback: its firewall refuses some clients.
 */
export const IANA_RDAP = { dns: 'https://data.iana.org/rdap/dns.json', ipv4: 'https://data.iana.org/rdap/ipv4.json', ipv6: 'https://data.iana.org/rdap/ipv6.json' };
const httpsBase = urls => { const u = (Array.isArray(urls) ? urls : []).find(x => /^https:\/\/[^/]+/i.test(String(x))); return u ? (u.endsWith('/') ? u : u + '/') : ''; };
/** Which service in IANA's dns.json covers a domain: { base, httpOnly } (the longest matching label wins; base '' if none). */
export function rdapServiceForDomain(bootstrap, domain) {
  const labels = String(domain || '').toLowerCase().replace(/\.$/, '').split('.');
  let best = null, bestLen = 0;
  for (const [names, urls] of Array.isArray(bootstrap?.services) ? bootstrap.services : []) {
    for (const n of Array.isArray(names) ? names : []) {
      const k = String(n).toLowerCase(), len = k.split('.').length;
      if (len > bestLen && len < labels.length && labels.slice(-len).join('.') === k) { best = urls; bestLen = len; }
    }
  }
  const base = httpsBase(best);
  return { base, httpOnly: !base && Array.isArray(best) && best.length > 0 };
}
const ip4n = ip => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
const ip6n = ip => BigInt('0x' + expandIPv6(ip).join(''));
/** The https base of the regional registry's RDAP server for an IP address, from ipv4.json or ipv6.json (longest prefix wins). */
export function rdapBaseForIp(bootstrap, ip) {
  const v4 = isIPv4(ip), v6 = !v4 && isIPv6(ip);
  if (!v4 && !v6) return '';
  let best = null, bestLen = -1;
  for (const [prefixes, urls] of Array.isArray(bootstrap?.services) ? bootstrap.services : []) {
    for (const p of Array.isArray(prefixes) ? prefixes : []) {
      const [net, bits] = String(p).split('/'), len = Number(bits);
      if (!Number.isInteger(len) || len <= bestLen) continue;
      let hit = false;
      if (v4 && isIPv4(net) && len <= 32) hit = len === 0 || Math.floor(ip4n(ip) / 2 ** (32 - len)) === Math.floor(ip4n(net) / 2 ** (32 - len));
      else if (v6 && isIPv6(net) && len <= 128) hit = (ip6n(ip) >> BigInt(128 - len)) === (ip6n(net) >> BigInt(128 - len));
      if (hit) { best = urls; bestLen = len; }
    }
  }
  return httpsBase(best);
}
/** A registry RDAP address: base + domain/<name> or ip/<address> (IP addresses go in as they are, colons and all). */
export const rdapUrlAt = (base, kind, value) => (base ? `${base}${kind}/${kind === 'domain' ? enc(value) : value}` : '');

/** Fields from a jCard (vcardArray) — only what an organisation would publish. */
export function vcard(entity) {
  const props = Array.isArray(entity?.vcardArray?.[1]) ? entity.vcardArray[1] : [];
  const get = name => props.find(p => p[0] === name);
  const text = p => (p ? (Array.isArray(p[3]) ? p[3].filter(Boolean).join(' ') : String(p[3] ?? '')) : '');
  const adr = get('adr');
  const country = adr ? (adr[1]?.cc || (Array.isArray(adr[3]) ? adr[3][6] : '') || '') : '';
  const region = adr && Array.isArray(adr[3]) ? adr[3][4] || '' : '';
  return { fn: text(get('fn')), org: text(get('org')), kind: text(get('kind')), email: text(get('email')), tel: text(get('tel')).replace(/^tel:/, ''), country: String(country), region: String(region) };
}
const REDACTED = /redact|privacy|withheld|not disclosed|data protected|gdpr|statutory masking|^\s*$/i;
function walkEntities(list, fn, depth = 0) {
  for (const e of list || []) { fn(e, depth); if (depth < 3) walkEntities(e.entities, fn, depth + 1); }
}

/** A plain summary of a domain RDAP reply. Registrant details appear only when they name an organisation. */
export function summariseDomainRdap(j) {
  const ev = {};
  for (const e of j?.events || []) {
    const a = String(e.eventAction || '').toLowerCase();
    const key = a === 'registration' ? 'registration' : a === 'expiration' ? 'expiration' : a === 'last changed' ? 'lastChanged' : a.startsWith('last update of rdap') ? 'lastUpdate' : a === 'transfer' ? 'transfer' : null;
    if (key && !ev[key]) ev[key] = e.eventDate;
  }
  let registrar = null, abuse = null, registrant = null;
  walkEntities(j?.entities, e => {
    const roles = (e.roles || []).map(r => String(r).toLowerCase());
    const v = vcard(e);
    if (roles.includes('registrar') && !registrar) {
      const iana = (e.publicIds || []).find(p => /iana/i.test(p.type || ''))?.identifier || '';
      const url = (e.links || []).map(l => l.href).find(h => /^https?:/.test(h || '') && !/rdap/i.test(h)) || '';
      registrar = { name: v.fn || v.org || e.handle || '', ianaId: String(iana), url: safeHttpUrl(url) };
    }
    if (roles.includes('abuse') && !abuse && (v.email || v.tel)) abuse = { email: v.email, phone: v.tel };
    if (roles.includes('registrant') && !registrant) {
      const org = v.org || (v.kind === 'org' ? v.fn : '');
      registrant = { org: org && !REDACTED.test(org) ? org : '', country: v.country && !REDACTED.test(v.country) ? v.country : '', region: v.region && !REDACTED.test(v.region) ? v.region : '' };
    }
  });
  const status = (j?.status || []).map(String);
  return {
    name: String(j?.ldhName || '').toLowerCase(), unicodeName: j?.unicodeName || '', handle: j?.handle || '',
    status, locked: status.some(s => /transfer prohibited/.test(s)), events: ev, registrar, abuse, registrant,
    nameservers: (j?.nameservers || []).map(n => String(n.ldhName || '').toLowerCase()).filter(Boolean),
    dnssec: typeof j?.secureDNS?.delegationSigned === 'boolean' ? j.secureDNS.delegationSigned : null,
    redacted: Array.isArray(j?.redacted) && j.redacted.length > 0,
    self: safeHttpUrl((j?.links || []).find(l => l.rel === 'self')?.href || ''),
  };
}

/**
 * A plain summary of an IP-network RDAP reply: which organisation holds the address block, and where. Registries also
 * list people as technical and administrative contacts; they are never read, and the holder is only ever an organisation.
 */
export function summariseIpRdap(j) {
  let holder = '', abuse = '';
  walkEntities(j?.entities, e => {
    const roles = (e.roles || []).map(r => String(r).toLowerCase()), v = vcard(e);
    if (!holder && roles.includes('registrant') && v.kind === 'org') holder = v.fn || v.org;
    if (!abuse && roles.includes('abuse') && v.kind !== 'individual') abuse = v.email;
  });
  const cidr = (j?.cidr0_cidrs || []).map(c => `${c.v4prefix || c.v6prefix}/${c.length}`).join(', ');
  return {
    name: j?.name || '', handle: j?.handle || '', country: j?.country || '', type: j?.type || '',
    range: cidr || (j?.startAddress && j?.endAddress ? `${j.startAddress} – ${j.endAddress}` : ''),
    holder, abuse, port43: j?.port43 || '',
  };
}

export const DNS_TYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 43: 'DS', 46: 'RRSIG', 48: 'DNSKEY', 65: 'HTTPS', 257: 'CAA' };
export const DNS_RCODES = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };
export const RESOLVERS = {
  google: { name: 'Google Public DNS', url: (name, type) => `https://dns.google/resolve?name=${enc(name)}&type=${enc(type)}`, headers: {} },
  cloudflare: { name: 'Cloudflare 1.1.1.1', url: (name, type) => `https://cloudflare-dns.com/dns-query?name=${enc(name)}&type=${enc(type)}`, headers: { Accept: 'application/dns-json' } },
};
/** A DNS-over-HTTPS JSON reply as { status, rcode, ad, answers: [{ name, type, ttl, data }] }. */
export function parseDoh(j) {
  const rr = a => {
    const type = DNS_TYPES[a.type] || String(a.type);
    let data = String(a.data ?? '');
    if (type === 'TXT') data = data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''); // one TXT value can arrive as several quoted strings
    else if (/^(NS|CNAME|PTR|MX)$/.test(type)) data = data.replace(/\.$/, '');
    return { name: String(a.name || '').replace(/\.$/, ''), type, ttl: a.TTL, data };
  };
  return { status: j?.Status ?? null, rcode: DNS_RCODES[j?.Status] || String(j?.Status ?? ''), ad: !!j?.AD, answers: (j?.Answer || []).map(rr), authority: (j?.Authority || []).map(rr) };
}

const MX_PROVIDERS = [
  [/(^|\.)(google|googlemail)\.com$/, 'Google Workspace or Gmail'], [/\.mail\.protection\.outlook\.com$|\.outlook\.com$/, 'Microsoft 365 (Exchange Online)'],
  [/pphosted\.com$|ppe-hosted\.com$/, 'Proofpoint'], [/mimecast\.(com|co\.za)$/, 'Mimecast'], [/iphmx\.com$/, 'Cisco Secure Email'],
  [/barracudanetworks\.com$/, 'Barracuda'], [/zoho\.(com|eu|in)$/, 'Zoho Mail'], [/messagingengine\.com$/, 'Fastmail'], [/icloud\.com$/, 'Apple iCloud Mail'],
  [/protonmail\.ch$/, 'Proton Mail'], [/mx\.cloudflare\.net$/, 'Cloudflare Email Routing'], [/yahoodns\.net$/, 'Yahoo Mail'],
  [/amazonaws\.com$|amazonses\.com$/, 'Amazon SES'], [/mailgun\.org$/, 'Mailgun'], [/ovh\.net$/, 'OVHcloud'], [/gandi\.net$/, 'Gandi'],
  [/yandex\.(net|ru)$/, 'Yandex 360'], [/mail\.ru$/, 'Mail.ru (VK)'], [/qq\.com$/, 'Tencent'], [/aliyun\.com$/, 'Alibaba Cloud Mail'],
  [/secureserver\.net$/, 'GoDaddy'], [/registrar-servers\.com$/, 'Namecheap'], [/ionos\.(com|de|co\.uk)$|1and1\./, 'IONOS'],
];
/** The mail service behind an MX host, if it is a well-known one. "." (a null MX) means the domain takes no email. */
export function mxProvider(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h || h === '.') return 'No email (null MX)';
  return MX_PROVIDERS.find(([re]) => re.test(h))?.[1] || '';
}
const NS_PROVIDERS = [
  [/\.ns\.cloudflare\.com$/, 'Cloudflare'], [/awsdns-\d+\./, 'Amazon Route 53'], [/azure-dns\./, 'Microsoft Azure DNS'],
  [/googledomains\.com$|ns-cloud-[a-e]\d\.google/, 'Google Cloud DNS'], [/domaincontrol\.com$/, 'GoDaddy'], [/registrar-servers\.com$/, 'Namecheap'],
  [/nsone\.net$/, 'NS1 (IBM)'], [/dynect\.net$/, 'Oracle Dyn'], [/ultradns\./, 'UltraDNS (DigiCert)'], [/akam\.net$|akamaiedge|akamai/, 'Akamai'],
  [/dnsimple\.com$/, 'DNSimple'], [/digitalocean\.com$/, 'DigitalOcean'], [/linode\.com$/, 'Akamai Linode'], [/ovh\.net$/, 'OVHcloud'],
  [/hetzner\.(com|de)$/, 'Hetzner'], [/gandi\.net$/, 'Gandi'], [/ui-dns\.(com|de|org|biz)$/, 'IONOS'], [/wixdns\.net$/, 'Wix'],
  [/squarespacedns\.com$/, 'Squarespace'], [/vercel-dns\.com$/, 'Vercel'], [/netlify\.com$/, 'Netlify'], [/yandex\.(net|ru)$/, 'Yandex Cloud'],
];
/** The DNS host behind a name server, if well known; "self-hosted" when the server sits under the domain itself. */
export function nsProvider(host, domain = '') {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  const hit = NS_PROVIDERS.find(([re]) => re.test(h))?.[1];
  if (hit) return hit;
  return domain && (h === domain || h.endsWith('.' + domain)) ? 'Run by the organisation itself' : '';
}

const HOST_PROVIDERS = [
  [/cloudfront\.net$/, 'Amazon CloudFront'], [/amazonaws\.com$|awsglobalaccelerator\.com$|elb\.amazonaws/, 'Amazon Web Services'], [/akamai(edge|technologies|hd)?\.net$|edgekey\.net$|edgesuite\.net$/, 'Akamai'],
  [/fastly(lb)?\.net$|fastly\.com$/, 'Fastly'], [/cloudflare\.(net|com)$/, 'Cloudflare'], [/azurefd\.net$|azureedge\.net$|trafficmanager\.net$|cloudapp\.(net|azure\.com)$|azurewebsites\.net$/, 'Microsoft Azure'],
  [/googlehosted\.com$|ghs\.google\.com$|googleusercontent\.com$|1e100\.net$/, 'Google'], [/github\.io$|githubusercontent\.com$/, 'GitHub Pages'], [/netlify\.(app|com)$/, 'Netlify'],
  [/vercel(-dns)?\.(com|app)$/, 'Vercel'], [/herokuapp\.com$|herokudns\.com$/, 'Heroku'], [/wpengine\.com$/, 'WP Engine'], [/shopify\.com$|myshopify\.com$/, 'Shopify'],
  [/squarespace\.com$/, 'Squarespace'], [/wixdns\.net$|wix\.com$/, 'Wix'], [/pages\.dev$/, 'Cloudflare Pages'], [/hetzner\.(com|de)$|your-server\.de$/, 'Hetzner'],
  [/ovh\.(net|com)$/, 'OVHcloud'], [/linode(usercontent)?\.com$|members\.linode\.com$/, 'Akamai Linode'], [/digitalocean\.com$/, 'DigitalOcean'], [/edgecastcdn\.net$/, 'Edgio'],
];
/** The hosting or CDN company behind a CNAME target or reverse-DNS name, if well known. */
export function hostProvider(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return HOST_PROVIDERS.find(([re]) => re.test(h))?.[1] || '';
}
/** A CAA record in words: '0 issue "letsencrypt.org"' → who may issue certificates. */
export function caaMeaning(data) {
  const m = String(data || '').match(/^\d+\s+(issue|issuewild|iodef)\s+"?([^"]*)"?/i);
  if (!m) return '';
  return m[1].toLowerCase() === 'iodef' ? `Report certificate problems to ${m[2]}` : `${m[1].toLowerCase() === 'issuewild' ? 'Wildcard certificates' : 'Certificates'} may be issued by ${m[2] || 'nobody'}`;
}
/** A best guess at the registered domain when no RDAP service answers: two labels, or three under common second-level suffixes. */
export function guessRegistered(host) {
  const l = String(host || '').split('.');
  if (l.length <= 2) return l.join('.');
  const two = l.slice(-2).join('.');
  return /^(co|org|gov|ac|net|com|ltd|plc|edu|sch|nhs|police|mod|me|nic)\.(uk|au|nz|za|jp|kr|in|br|tr|il|cn|hk|sg|my|id|th|ar|mx|ua)$/.test(two) ? l.slice(-3).join('.') : two;
}

const TXT_TOKENS = [
  [/^google-site-verification=/i, 'Google site verification (Search Console or Workspace)'], [/^MS=ms\d+/i, 'Microsoft 365 domain verification'],
  [/^facebook-domain-verification=/i, 'Meta (Facebook) domain verification'], [/^apple-domain-verification=/i, 'Apple domain verification'],
  [/^atlassian-domain-verification=/i, 'Atlassian (Jira, Confluence) verification'], [/^docusign=/i, 'DocuSign verification'],
  [/^adobe-idp-site-verification=/i, 'Adobe verification'], [/^globalsign-domain-verification=/i, 'GlobalSign certificate verification'],
  [/^stripe-verification=/i, 'Stripe verification'], [/^ZOOM_verify_/i, 'Zoom verification'], [/^slack-domain-verification=/i, 'Slack verification'],
  [/^openai-domain-verification=/i, 'OpenAI verification'], [/^anthropic-domain-verification/i, 'Anthropic verification'],
  [/^cisco-ci-domain-verification=/i, 'Cisco Webex verification'], [/^dropbox-domain-verification=/i, 'Dropbox verification'],
  [/^yandex-verification:/i, 'Yandex Webmaster verification'], [/^have-i-been-pwned-verification=/i, 'Have I Been Pwned domain verification'],
  [/^hubspot-developer-verification=/i, 'HubSpot verification'], [/^miro-verification=/i, 'Miro verification'], [/^canva-site-verification=/i, 'Canva verification'],
  [/^v=BIMI1/i, 'BIMI (brand logo for email)'], [/^v=STSv1/i, 'MTA-STS policy (encrypted mail transport)'], [/^v=TLSRPTv1/i, 'TLS reporting for mail'],
  [/^_?globalsign|^_?digicert|^_?sectigo/i, 'Certificate authority validation'], [/^ahrefs-site-verification_/i, 'Ahrefs (SEO tool) verification'],
];
const SPF_INCLUDES = [
  [/spf\.protection\.outlook\.com$/, 'Microsoft 365'], [/_spf\.google\.com$/, 'Google Workspace'], [/sendgrid\.net$/, 'SendGrid'], [/mailgun\.org$/, 'Mailgun'],
  [/amazonses\.com$/, 'Amazon SES'], [/servers\.mcsv\.net$/, 'Mailchimp'], [/mandrillapp\.com$/, 'Mailchimp Transactional'], [/_spf\.salesforce\.com$/, 'Salesforce'],
  [/zendesk\.com$/, 'Zendesk'], [/hubspotemail\.net$/, 'HubSpot'], [/pphosted\.com$/, 'Proofpoint'], [/mimecast\.com$/, 'Mimecast'], [/zoho\.(com|eu)$/, 'Zoho'],
  [/spf\.messagingengine\.com$/, 'Fastmail'], [/_spf\.atlassian\.net$/, 'Atlassian'], [/freshdesk\.com$/, 'Freshdesk'], [/mail\.zendesk\.com$/, 'Zendesk'],
  [/spf\.brevo\.com$|sendinblue\.com$/, 'Brevo'], [/_spf\.intuit\.com$/, 'Intuit'], [/icloud\.com$/, 'Apple iCloud'], [/protonmail\.ch$/, 'Proton Mail'],
];
/** What a TXT record says about the organisation's services: { kind, label, detail }. */
export function txtMeaning(txt) {
  const t = String(txt || '').trim();
  if (/^v=spf1\b/i.test(t)) {
    const inc = [...t.matchAll(/\binclude:([^\s]+)/gi)].map(m => m[1].toLowerCase());
    const who = [...new Set(inc.map(i => SPF_INCLUDES.find(([re]) => re.test(i))?.[1]).filter(Boolean))];
    const all = (t.match(/([~?+-])all\b/) || [])[1];
    const policy = { '-': 'others are rejected', '~': 'others are marked as suspect', '?': 'no policy for others', '+': 'anyone may send (unsafe)' }[all] || '';
    return { kind: 'spf', label: 'SPF: who may send its email', detail: [who.length ? 'Senders include ' + who.join(', ') : '', policy].filter(Boolean).join('; ') };
  }
  if (/^v=DMARC1/i.test(t)) {
    const p = (t.match(/\bp=(\w+)/i) || [])[1]?.toLowerCase();
    return { kind: 'dmarc', label: 'DMARC: what receivers do with forged mail', detail: { reject: 'Policy: reject', quarantine: 'Policy: quarantine (spam folder)', none: 'Policy: none (monitoring only)' }[p] || '' };
  }
  const hit = TXT_TOKENS.find(([re]) => re.test(t));
  if (hit) return { kind: 'verification', label: hit[1], detail: 'Shows the organisation uses or once used this service' };
  return { kind: 'other', label: '', detail: '' };
}

// Certificate transparency
export const crtShUrl = (domain, json = true) => `https://crt.sh/?q=${enc('%.' + domain)}${json ? '&output=json&deduplicate=Y' : ''}`;
export const certSpotterUrl = domain => `https://api.certspotter.com/v1/issuances?domain=${enc(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`;
/** The organisation in an issuer DN ("C=US, O=Let's Encrypt, CN=R11" → "Let's Encrypt"). */
export function issuerOrg(dn) {
  const s = String(dn || '');
  const m = s.match(/(?:^|,\s*)O=("([^"]+)"|[^,]+)/);
  return (m ? (m[2] || m[1]) : (s.match(/CN=([^,]+)/) || [])[1] || s).trim();
}
/** crt.sh JSON rows → [{ id, issuer, notBefore, notAfter, names }]. */
export function parseCrtSh(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: String(r.id ?? ''), issuer: issuerOrg(r.issuer_name), notBefore: r.not_before ? r.not_before + (r.not_before.endsWith('Z') ? '' : 'Z') : '',
    notAfter: r.not_after ? r.not_after + (r.not_after.endsWith('Z') ? '' : 'Z') : '',
    names: [...new Set(String(r.name_value || r.common_name || '').toLowerCase().split(/\s+/).filter(Boolean))],
    link: r.id ? `https://crt.sh/?id=${enc(r.id)}` : '',
  }));
}
/** Cert Spotter rows → the same shape. */
export function parseCertSpotter(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: String(r.id ?? ''), issuer: r.issuer?.friendly_name || issuerOrg(r.issuer?.name), notBefore: r.not_before || '', notAfter: r.not_after || '',
    names: [...new Set((r.dns_names || []).map(n => String(n).toLowerCase()))], link: r.cert_sha256 ? `https://crt.sh/?q=${enc(r.cert_sha256)}` : '',
  }));
}
/** Hostnames seen in certificates for a domain, with first/last dates, plus issuers. */
export function summariseCerts(certs, domain) {
  const d = String(domain || '').toLowerCase();
  const names = new Map(), issuers = new Map();
  let first = '', last = '';
  for (const c of certs) {
    if (c.issuer) issuers.set(c.issuer, (issuers.get(c.issuer) || 0) + 1);
    if (c.notBefore && (!first || c.notBefore < first)) first = c.notBefore;
    if (c.notBefore && (!last || c.notBefore > last)) last = c.notBefore;
    for (const n of c.names) {
      if (d && !(n === d || n.endsWith('.' + d) || n === '*.' + d)) continue;
      const x = names.get(n) || { name: n, wildcard: n.startsWith('*.'), first: c.notBefore, last: c.notBefore, certs: 0 };
      x.certs++;
      if (c.notBefore && (!x.first || c.notBefore < x.first)) x.first = c.notBefore;
      if (c.notBefore && (!x.last || c.notBefore > x.last)) x.last = c.notBefore;
      names.set(n, x);
    }
  }
  return {
    count: certs.length, first, last,
    names: [...names.values()].sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name)),
    issuers: [...issuers].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

/* ---------------------------------------------------------------------------------------------------------------
   Organisations: GLEIF (legal entity identifiers and corporate parents), OpenSanctions, registries
   --------------------------------------------------------------------------------------------------------------- */
const GLEIF = 'https://api.gleif.org/api/v1';
export const gleifSearchUrl = (q, size = 20) => `${GLEIF}/lei-records?filter${enc('[fulltext]')}=${enc(q)}&page${enc('[size]')}=${size}`;
export const gleifRecordUrl = lei => `${GLEIF}/lei-records/${enc(lei)}`;
export const gleifRelationUrl = (lei, rel) => `${GLEIF}/lei-records/${enc(lei)}/${rel}`; // direct-parent, ultimate-parent, direct-children, direct-parent-reporting-exception…
export const gleifPageUrl = lei => `https://search.gleif.org/#/record/${enc(lei)}`;

/** True for a well-formed LEI (ISO 17442: 18 characters plus two check digits, mod 97 = 1). */
export function isLei(s) {
  const v = String(s || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{18}\d{2}$/.test(v)) return false;
  let rem = 0;
  for (const ch of v) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of n) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

export const LEI_CATEGORY = { GENERAL: 'Legal entity', BRANCH: 'Branch', FUND: 'Fund', SOLE_PROPRIETOR: 'Sole trader', RESIDENT_GOVERNMENT_ENTITY: 'Government body', INTERNATIONAL_ORGANIZATION: 'International organisation' };
export const REGISTRIES = {
  RA000585: { name: 'Companies House (England and Wales)', url: n => `https://find-and-update.company-information.service.gov.uk/company/${enc(n)}` },
  RA000586: { name: 'Companies House (Scotland)', url: n => `https://find-and-update.company-information.service.gov.uk/company/${enc(n)}` },
  RA000587: { name: 'Companies House (Northern Ireland)', url: n => `https://find-and-update.company-information.service.gov.uk/company/${enc(n)}` },
  RA000402: { name: 'Companies Registration Office (Ireland)', url: () => 'https://core.cro.ie/' },
};
/** A summary of a GLEIF lei-record. */
export function summariseLei(rec) {
  const a = rec?.attributes || {}, e = a.entity || {}, r = a.registration || {};
  const addr = x => x ? [...(x.addressLines || []), x.city, x.region, x.postalCode, x.country].filter(Boolean).join(', ') : '';
  const ra = e.registeredAt?.id || '';
  const reg = REGISTRIES[ra];
  // The record says which relationship endpoints exist, so the page never asks for one that would answer 404.
  const rel = rec?.relationships || {}, api = u => (/^https:\/\/api\.gleif\.org\/api\/v1\//.test(u || '') ? u : '');
  const links = {
    directParent: api(rel['direct-parent']?.links?.['lei-record']), directException: api(rel['direct-parent']?.links?.['reporting-exception']),
    ultimateParent: api(rel['ultimate-parent']?.links?.['lei-record']), ultimateException: api(rel['ultimate-parent']?.links?.['reporting-exception']),
    children: api(rel['direct-children']?.links?.related),
  };
  return {
    links,
    lei: a.lei || rec?.id || '', name: e.legalName?.name || '', otherNames: (e.otherNames || []).map(n => n.name).filter(Boolean),
    jurisdiction: e.jurisdiction || '', country: e.legalAddress?.country || '', city: e.legalAddress?.city || '',
    legalAddress: addr(e.legalAddress), hqAddress: addr(e.headquartersAddress), category: e.category || '', categoryLabel: LEI_CATEGORY[e.category] || e.category || '',
    legalForm: e.legalForm?.id || '', status: e.status || '', created: e.creationDate || '',
    registeredAt: ra, registeredAs: e.registeredAs || '', registry: reg ? { name: reg.name, url: reg.url(e.registeredAs || '') } : null,
    ocid: a.ocid || '', opencorporates: a.ocid ? `https://opencorporates.com/companies/${String(a.ocid).split('/').map(enc).join('/')}` : '',
    bic: (a.bic || []).join?.(', ') || a.bic || '', regStatus: r.status || '', lastUpdate: r.lastUpdateDate || '', nextRenewal: r.nextRenewalDate || '',
    corroboration: r.corroborationLevel || '', successor: e.successorEntity?.name || '', page: gleifPageUrl(a.lei || rec?.id || ''),
  };
}
/** Search results without sole traders, who are individuals; `hidden` counts what was left out. */
export function filterLeiResults(json) {
  const all = Array.isArray(json?.data) ? json.data.map(summariseLei) : [];
  const shown = all.filter(x => x.category !== 'SOLE_PROPRIETOR');
  return { total: json?.meta?.pagination?.total ?? all.length, shown, hidden: all.length - shown.length };
}
export const EXCEPTION_REASONS = {
  NATURAL_PERSONS: 'Controlled by one or more people, whom GLEIF does not name',
  NON_CONSOLIDATING: 'Its parent does not consolidate it in its accounts',
  NO_KNOWN_PERSON: 'No known person or entity controls it (for example, widely held)',
  NON_PUBLIC: 'The parent relationship is not made public',
  BINDING_LEGAL_COMMITMENTS: 'Legal commitments prevent disclosing the parent',
  LEGAL_OBSTACLES: 'Legal obstacles prevent disclosing the parent',
  DISCLOSURE_DETRIMENTAL: 'Disclosure would be detrimental to the entity or its parent',
  DETRIMENT_NOT_EXCLUDED: 'Detriment from disclosure cannot be excluded',
  CONSENT_NOT_OBTAINED: 'The parent did not consent to disclosure',
  NO_LEI: 'The parent has no LEI',
};
export const RELATIONSHIPS = {
  IS_DIRECTLY_CONSOLIDATED_BY: 'consolidated in the accounts of', IS_ULTIMATELY_CONSOLIDATED_BY: 'ultimately consolidated by',
  IS_INTERNATIONAL_BRANCH_OF: 'a branch of', IS_FUND_MANAGED_BY: 'a fund managed by', 'IS_FUND-MANAGED_BY': 'a fund managed by', IS_SUBFUND_OF: 'a sub-fund of', IS_FEEDER_TO: 'a feeder fund to',
};

const OPENSANCTIONS = 'https://api.opensanctions.org';
// Organisations, vessels and aircraft only: this dashboard does not screen people (the official lists, linked on the page, do).
export const OS_SCHEMAS = { Organization: 'Organisations and companies', Vessel: 'Vessels', Airplane: 'Aircraft' };
/**
 * An OpenSanctions search URL. The key travels as the api_key parameter: the API refuses the browser's CORS check for
 * a request with an Authorization header, while a plain GET needs no check. It goes only to api.opensanctions.org.
 */
export function osSearchUrl(q, { schema = 'Organization', key = '', limit = 15, dataset = 'default' } = {}) {
  const p = new URLSearchParams({ q, limit: String(limit) });
  p.set('schema', OS_SCHEMAS[schema] ? schema : 'Organization'); // never an unfiltered search, which would include people
  if (key) p.set('api_key', key);
  return `${OPENSANCTIONS}/search/${enc(dataset)}?${p}`;
}
export const osWebUrl = q => `https://www.opensanctions.org/search/?q=${enc(q)}`;
export const OS_TOPICS = {
  sanction: 'Sanctioned', 'sanction.linked': 'Linked to sanctions', 'sanction.counter': 'Counter-sanctions', debarment: 'Debarred', 'export.control': 'Export controls',
  crime: 'Crime', 'crime.fin': 'Financial crime', 'crime.terror': 'Terrorism', 'crime.war': 'War crimes', 'role.pep': 'Politically exposed', 'role.rca': 'Close associate',
  poi: 'Person of interest', 'corp.offshore': 'Offshore', 'corp.shell': 'Shell company', 'mare.detained': 'Detained vessel', 'mare.shadow': 'Shadow fleet', 'reg.warn': 'Regulator warning', 'gov.soe': 'State-owned',
};
/** A summary of an OpenSanctions search reply; any person in it is left out (and counted in `hidden`). */
export function summariseSanctions(j) {
  const all = Array.isArray(j?.results) ? j.results : [];
  const list = all.filter(r => r?.schema !== 'Person');
  return {
    total: j?.total?.value ?? list.length, relation: j?.total?.relation || 'eq', hidden: all.length - list.length,
    results: list.map(r => {
      const p = r.properties || {};
      return {
        id: r.id, caption: r.caption || (p.name || [])[0] || r.id, schema: r.schema || '',
        topics: (p.topics || []).map(t => OS_TOPICS[t] || t), countries: [...new Set([...(p.country || []), ...(p.jurisdiction || [])])],
        datasets: r.datasets || [], firstSeen: r.first_seen || '', lastSeen: r.last_seen || '', target: !!r.target,
        url: r.id ? `https://www.opensanctions.org/entities/${enc(r.id)}/` : '',
      };
    }),
  };
}

/** Registry and sanctions-list link-outs for a name (prefilled where the site accepts a query in its address). */
export function orgLinks(q) {
  const e = enc(String(q || '').trim());
  return [
    { id: 'opencorporates', group: 'Company registries', name: 'OpenCorporates', href: `https://opencorporates.com/companies?q=${e}`, desc: 'Companies from registries around the world in one search' },
    { id: 'companies-house', group: 'Company registries', name: 'UK Companies House', href: `https://find-and-update.company-information.service.gov.uk/search/companies?q=${e}`, desc: 'Officers, filings, accounts and persons with significant control, free' },
    { id: 'cro', group: 'Company registries', name: 'Ireland: CRO (CORE)', href: 'https://core.cro.ie/', desc: 'Irish companies and business names; type the name into CORE’s search', copy: true },
    { id: 'aleph', group: 'Company registries', name: 'OCCRP Aleph', href: `https://aleph.occrp.org/search?q=${e}`, desc: 'Registries, court records, leaks and documents from past investigations' },
    { id: 'gleif-web', group: 'Company registries', name: 'GLEIF search', href: `https://search.gleif.org/#/search/simpleSearch=${e}`, desc: 'The LEI register, with parent and child relationships' },
    { id: 'opensanctions-web', group: 'Sanctions and watchlists', name: 'OpenSanctions (website)', href: osWebUrl(q || ''), desc: 'Sanctions, watchlists and politically exposed persons combined; free to search' },
    { id: 'eu-fsd', group: 'Sanctions and watchlists', name: 'EU Financial Sanctions Database', href: 'https://webgate.ec.europa.eu/fsd/fsf/', desc: 'The EU consolidated list of financial sanctions', copy: true },
    { id: 'eu-map', group: 'Sanctions and watchlists', name: 'EU Sanctions Map', href: 'https://www.sanctionsmap.eu/', desc: 'EU sanctions regimes by country, with their legal acts', copy: true },
    { id: 'ofac', group: 'Sanctions and watchlists', name: 'OFAC Sanctions List Search (US)', href: 'https://sanctionssearch.ofac.treas.gov/', desc: 'The SDN list and other US Treasury lists', copy: true },
    { id: 'uk-sanctions', group: 'Sanctions and watchlists', name: 'UK Sanctions List search', href: 'https://search-uk-sanctions-list.service.gov.uk/', desc: 'The FCDO’s list, the only official UK source since January 2026', copy: true },
    { id: 'un-list', group: 'Sanctions and watchlists', name: 'UN Security Council Consolidated List', href: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', desc: 'Everyone and everything under UN sanctions', copy: true },
  ];
}

/* ---------------------------------------------------------------------------------------------------------------
   Events: GDELT DOC 2.0 (keyless; one request every five seconds; the last three months only)
   --------------------------------------------------------------------------------------------------------------- */
export const GDELT_SPANS = { '24h': '24 hours', '3d': '3 days', '1w': '1 week', '2w': '2 weeks', '1m': '1 month', '3m': '3 months' };
export const GDELT_SORTS = { hybridrel: 'Most relevant', datedesc: 'Newest first', dateasc: 'Oldest first', toneasc: 'Most negative tone', tonedesc: 'Most positive tone' };
export const GDELT_COUNTRIES = {
  '': 'Any country', ireland: 'Ireland', unitedkingdom: 'United Kingdom', unitedstates: 'United States', france: 'France', germany: 'Germany', spain: 'Spain',
  italy: 'Italy', netherlands: 'Netherlands', belgium: 'Belgium', poland: 'Poland', ukraine: 'Ukraine', russia: 'Russia', belarus: 'Belarus', turkey: 'Turkey',
  israel: 'Israel', iran: 'Iran', lebanon: 'Lebanon', syria: 'Syria', egypt: 'Egypt', saudiarabia: 'Saudi Arabia', yemen: 'Yemen', sudan: 'Sudan', ethiopia: 'Ethiopia',
  nigeria: 'Nigeria', southafrica: 'South Africa', kenya: 'Kenya', india: 'India', pakistan: 'Pakistan', china: 'China', taiwan: 'Taiwan', japan: 'Japan',
  southkorea: 'South Korea', australia: 'Australia', canada: 'Canada', mexico: 'Mexico', brazil: 'Brazil', argentina: 'Argentina', venezuela: 'Venezuela',
};
export const GDELT_LANGUAGES = {
  '': 'Any language', english: 'English', french: 'French', german: 'German', spanish: 'Spanish', portuguese: 'Portuguese', italian: 'Italian', russian: 'Russian',
  ukrainian: 'Ukrainian', arabic: 'Arabic', hebrew: 'Hebrew', persian: 'Persian', turkish: 'Turkish', chinese: 'Chinese', japanese: 'Japanese', korean: 'Korean', hindi: 'Hindi', polish: 'Polish',
};

/** A GDELT query from words, phrase, any-of, exclusions and filters, with problems GDELT would reject. */
export function buildGdeltQuery(spec = {}) {
  const errors = [], parts = [];
  const words = splitTerms(spec.all), any = splitTerms(spec.any), none = splitTerms(spec.none);
  const phrase = clean(spec.phrase).replace(/"/g, '');
  const tooShort = t => t.replace(/"/g, '').replace(/[^\p{L}\p{N}]/gu, '').length < 3 && !/^"/.test(t);
  for (const t of [...words, ...any, ...none]) if (tooShort(t)) errors.push(`“${t}” is too short: GDELT needs words of three letters or more (put short words inside a "quoted phrase")`);
  parts.push(...words.map(quote));
  if (phrase) parts.push(`"${phrase}"`);
  if (any.length === 1) parts.push(quote(any[0]));
  else if (any.length > 1) parts.push(`(${any.map(quote).join(' OR ')})`);
  parts.push(...none.map(t => '-' + quote(t)));
  const domain = hostOf(spec.domain);
  if (spec.domain && !domain) errors.push('The domain is not a valid domain name');
  if (!words.length && !phrase && !any.length && !domain) errors.push('Enter at least one word, phrase or domain');
  if (domain) parts.push('domainis:' + domain);
  if (spec.country && GDELT_COUNTRIES[spec.country] !== undefined) parts.push('sourcecountry:' + spec.country);
  if (spec.lang && GDELT_LANGUAGES[spec.lang] !== undefined) parts.push('sourcelang:' + spec.lang);
  return { query: parts.join(' '), errors };
}
/** The GDELT query for a search-launcher spec (words, phrase, any-of, exclusions; no operators GDELT lacks). */
export function gdeltQueryFromSpec(spec) {
  const s = normaliseSpec(spec);
  const { query } = buildGdeltQuery({ all: [s.all, s.intitle].filter(Boolean).join(' '), phrase: s.phrase, any: s.any, none: s.none });
  return query;
}
export function gdeltUrl({ query, mode = 'artlist', span = '1w', start = '', end = '', max = 75, sort = 'hybridrel', format = 'json' }) {
  const p = new URLSearchParams({ query, mode, format });
  // GDELT reads "24h", "3d", "1w", "1m" (m = months; minutes are "min").
  if (start && end) { p.set('startdatetime', start); p.set('enddatetime', end); } else p.set('timespan', GDELT_SPANS[span] ? span : '1w');
  if (mode === 'artlist') { p.set('maxrecords', String(Math.min(250, Math.max(1, max | 0 || 75)))); p.set('sort', GDELT_SORTS[sort] ? sort : 'hybridrel'); }
  return 'https://api.gdeltproject.org/api/v2/doc/doc?' + p.toString().replace(/\+/g, '%20');
}
/** A Date from GDELT's "20261027T121500Z" (or "20261027121500"). */
export function parseGdeltDate(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +(d.slice(8, 10) || 0), +(d.slice(10, 12) || 0), +(d.slice(12, 14) || 0)));
  return Number.isNaN(+t) ? null : t;
}
/** GDELT answers errors as plain text with status 200: { ok, json } or { ok: false, error }. */
export function parseGdeltText(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: true, json: {} }; // an empty reply means no matches
  if (t.startsWith('{')) {
    try { return { ok: true, json: JSON.parse(t) }; }
    catch { try { return { ok: true, json: JSON.parse(t.replace(/[\u0000-\u001f]/g, ' ')) }; } catch { return { ok: false, error: 'GDELT sent a reply that could not be read. Try again.' }; } }
  }
  return { ok: false, error: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
}
/** Timeline points from a TimelineVolRaw reply: [{ t: Date, value, norm, share }] (share is a percentage of all coverage). */
export function gdeltTimeline(json) {
  const data = json?.timeline?.[0]?.data || [];
  return data.map(d => {
    const t = parseGdeltDate(d.date), value = Number(d.value) || 0, norm = Number(d.norm) || 0;
    return t ? { t, value, norm, share: norm ? (value / norm) * 100 : 0 } : null;
  }).filter(Boolean);
}
/** Articles from an ArtList reply, with safe links only. */
export function gdeltArticles(json) {
  return (json?.articles || []).map(a => ({
    title: clean(a.title) || '(untitled)', url: safeHttpUrl(a.url), domain: String(a.domain || '').toLowerCase(), language: a.language || '',
    country: a.sourcecountry || a.sourceCountry || '', seen: parseGdeltDate(a.seendate), image: safeHttpUrl(a.socialimage),
  })).filter(a => a.url);
}
/** Top domains, countries and languages among articles. */
export function summariseArticles(list, top = 8) {
  const count = key => { const m = new Map(); for (const a of list) { const k = a[key]; if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, top); };
  return { domains: count('domain'), countries: count('country'), languages: count('language') };
}
/** When the next GDELT request may start: at least `gap` ms after the previous one finished. */
export const nextSlot = (lastDone, now, gap = 6000) => Math.max(now, (lastDone || 0) + gap);

/** A GDELT reply cut down to the fields the page shows, for the saved copy used when GDELT is busy. */
export function compactGdelt(json) {
  if (Array.isArray(json?.articles)) return { articles: json.articles.map(a => ({ url: a.url, title: a.title, domain: a.domain, language: a.language, sourcecountry: a.sourcecountry ?? a.sourceCountry, seendate: a.seendate })) };
  if (Array.isArray(json?.timeline)) return { timeline: [{ data: (json.timeline[0]?.data || []).map(d => ({ date: d.date, value: d.value, norm: d.norm })) }] };
  return {};
}
/** Saved replies ({ url: { at, json } }) trimmed to the newest `max` that fit in `bytes` of JSON, oldest dropped first. */
export function trimSaved(all, max = 6, bytes = 600000) {
  const list = Object.entries(all && typeof all === 'object' ? all : {}).filter(([, v]) => v && Number.isFinite(v.at) && v.json).sort((a, b) => b[1].at - a[1].at).slice(0, max);
  while (list.length && JSON.stringify(Object.fromEntries(list)).length > bytes) list.pop();
  return Object.fromEntries(list);
}

/* ---------------------------------------------------------------------------------------------------------------
   Charts: nice axis ticks
   --------------------------------------------------------------------------------------------------------------- */
/** A "nice" axis maximum and step for values up to `max`, with about `n` ticks. */
export function niceScale(max, n = 4) {
  if (!(max > 0)) return { max: 1, step: 1, ticks: [0, 1] };
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { max: top, step, ticks };
}

/* ---------------------------------------------------------------------------------------------------------------
   Reverse image search and map links
   --------------------------------------------------------------------------------------------------------------- */
/** Reverse image search launchers. With a public image address they search it directly; without, they open the upload page. */
export function reverseImageLinks(imageUrl = '') {
  const u = safeHttpUrl(imageUrl), e = enc(u);
  return [
    { id: 'google-lens', name: 'Google Lens', href: u ? `https://lens.google.com/uploadbyurl?url=${e}` : 'https://lens.google.com/', byUrl: !!u, desc: 'Strong on objects, landmarks and text' },
    { id: 'bing', name: 'Bing Visual Search', href: 'https://www.bing.com/images', byUrl: false, paste: !!u, desc: 'Use the camera icon, then paste the address or drop the file' },
    { id: 'yandex', name: 'Yandex Images', href: u ? `https://yandex.com/images/search?rpt=imageview&url=${e}` : 'https://yandex.com/images/', byUrl: !!u, desc: 'Often best for places in Russia and Eastern Europe' },
    { id: 'tineye', name: 'TinEye', href: u ? `https://tineye.com/search?url=${e}` : 'https://tineye.com/', byUrl: !!u, desc: 'Exact copies; sort by oldest to find the first appearance' },
  ];
}
/** Map and sun-position links for a point (and an optional local date and time "YYYY-MM-DD", "HH:MM"). */
export function mapLinks(lat, lon, day = '', time = '') {
  const la = (+lat).toFixed(6), lo = (+lon).toFixed(6);
  const d = isDay(day) ? day.replace(/-/g, '.') : '', t = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '12:00';
  return {
    osm: `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`,
    google: `https://www.google.com/maps/search/?api=1&query=${la},${lo}`,
    suncalc: `https://www.suncalc.org/#/${la},${lo},17/${d || isoDay().replace(/-/g, '.')}/${t}/1/3`,
  };
}
/** Decimal degrees as "53.34981° N, 6.26031° W". */
export function formatLatLon(lat, lon, digits = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? 'E' : 'W'}`;
}
/** Bytes as "1.4 MB". */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} bytes`;
  const u = ['KB', 'MB', 'GB']; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}
/** Lower-case hex of a SHA-256 digest (Web Crypto: browsers on https or localhost, and Node). */
export async function sha256Hex(data) {
  const buf = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const d = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------------------------------------------------------------
   Case notebook: model, grades, import and export (JSON and Markdown), sources table and timeline
   --------------------------------------------------------------------------------------------------------------- */
export const RELIABILITY = { A: 'Completely reliable', B: 'Usually reliable', C: 'Fairly reliable', D: 'Not usually reliable', E: 'Unreliable', F: 'Reliability cannot be judged' };
export const CREDIBILITY = { 1: 'Confirmed by other sources', 2: 'Probably true', 3: 'Possibly true', 4: 'Doubtful', 5: 'Improbable', 6: 'Truth cannot be judged' };
export const STORE_VERSION = 1;
const MAX = { title: 200, claim: 2000, notes: 20000, url: 2000, tag: 40, tags: 20, items: 5000, log: 5000 };

/** "B2", or "" when ungraded; partial grades show the missing half as "?". */
export const gradeCode = (r, c) => (r || c ? `${RELIABILITY[r] ? r : '?'}${CREDIBILITY[c] ? c : '?'}` : '');
/** "Usually reliable; probably true". */
export function gradeLabel(r, c) {
  const a = RELIABILITY[r], b = CREDIBILITY[c];
  return a && b ? `${a}; ${b.charAt(0).toLowerCase() + b.slice(1)}` : a || b || 'Not graded';
}
const uid = (prefix, rand = Math.random) => prefix + Date.now().toString(36) + rand().toString(36).slice(2, 8);
const str = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, max);
const day = v => (isDay(v) ? v : '');
const iso = v => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : '');

export function newCase(title = 'Untitled case', now = new Date()) {
  return { id: uid('c_'), title: str(title, MAX.title).trim() || 'Untitled case', created: now.toISOString(), updated: now.toISOString(), items: [], log: [] };
}
/** A notebook item from loose fields, every value checked and trimmed. */
export function normaliseItem(f = {}, now = new Date()) {
  const r = String(f.reliability || '').toUpperCase(), c = String(f.credibility || '');
  const tags = (Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(',')).map(t => str(t, MAX.tag).trim()).filter(Boolean);
  return {
    id: /^i_[a-z0-9]+$/i.test(f.id || '') ? f.id : uid('i_'),
    claim: str(f.claim, MAX.claim).trim(), url: safeHttpUrl(f.url).slice(0, MAX.url), archive: safeHttpUrl(f.archive).slice(0, MAX.url),
    accessed: day(f.accessed) || isoDay(now), eventDate: day(f.eventDate), reliability: RELIABILITY[r] ? r : '', credibility: CREDIBILITY[c] ? c : '',
    notes: str(f.notes, MAX.notes).trim(), tags: [...new Set(tags)].slice(0, MAX.tags), hash: /^[a-f0-9]{64}$/i.test(f.hash || '') ? f.hash.toLowerCase() : '',
    created: iso(f.created) || now.toISOString(), updated: iso(f.updated) || now.toISOString(),
  };
}
export function normaliseLogEntry(f = {}, now = new Date()) {
  const kind = ['search', 'lookup', 'capture', 'note'].includes(f.kind) ? f.kind : 'note';
  return { id: /^l_[a-z0-9]+$/i.test(f.id || '') ? f.id : uid('l_'), at: iso(f.at) || now.toISOString(), kind, text: str(f.text, 500).trim(), url: safeHttpUrl(f.url).slice(0, MAX.url) };
}
export function normaliseCase(c = {}, now = new Date()) {
  const items = (Array.isArray(c.items) ? c.items : []).slice(0, MAX.items).map(i => normaliseItem(i, now)).filter(i => i.claim || i.url);
  const ids = new Set();
  for (const i of items) { if (ids.has(i.id)) i.id = uid('i_'); ids.add(i.id); }
  return {
    id: /^c_[a-z0-9]+$/i.test(c.id || '') ? c.id : uid('c_'), title: str(c.title, MAX.title).trim() || 'Untitled case',
    created: iso(c.created) || now.toISOString(), updated: iso(c.updated) || now.toISOString(), items,
    log: (Array.isArray(c.log) ? c.log : []).slice(-MAX.log).map(l => normaliseLogEntry(l, now)).filter(l => l.text),
  };
}
/** A whole store, from localStorage or an import; always valid, with at least one case. */
export function normaliseStore(s, now = new Date()) {
  const cases = (Array.isArray(s?.cases) ? s.cases : []).map(c => normaliseCase(c, now));
  if (!cases.length) cases.push(newCase('My first case', now));
  const ids = new Set();
  for (const c of cases) { if (ids.has(c.id)) c.id = uid('c_'); ids.add(c.id); }
  return { version: STORE_VERSION, current: cases.some(c => c.id === s?.current) ? s.current : cases[0].id, cases };
}

/** JSON for one case or the whole notebook. */
export function exportJson(caseOrStore, now = new Date()) {
  const body = caseOrStore?.cases ? { format: 'prp-osint-notebook', version: STORE_VERSION, exported: now.toISOString(), cases: caseOrStore.cases }
    : { format: 'prp-osint-notebook', version: STORE_VERSION, exported: now.toISOString(), cases: [caseOrStore] };
  return JSON.stringify(body, null, 2);
}
/** Cases from exported JSON (a notebook, one case, or a bare list of items). */
export function importJson(text, now = new Date()) {
  let j;
  try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch { throw new Error('This file is not valid JSON.'); }
  const raw = Array.isArray(j?.cases) ? j.cases : Array.isArray(j?.items) ? [j] : Array.isArray(j) ? [{ title: 'Imported items', items: j }] : null;
  if (!raw) throw new Error('No case or items found in this file.');
  return raw.map(c => normaliseCase(c, now));
}

const MD_ESC = s => String(s).replace(/^(#|- [A-Za-z][A-Za-z -]*:|\\)/gm, '\\$1');
const MD_UNESC = s => String(s).replace(/^\\(#|- [A-Za-z][A-Za-z -]*:|\\)/gm, '$1');
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const short = (s, n = 90) => { const t = clean(s); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/** Numbered, de-duplicated sources for a write-up: one row per source URL (or per unsourced claim). */
export function sourcesTable(c) {
  const rows = [], byUrl = new Map();
  const sorted = [...c.items].sort((a, b) => (a.accessed || '').localeCompare(b.accessed || '') || (a.created || '').localeCompare(b.created || ''));
  for (const i of sorted) {
    const key = i.url || 'claim:' + i.id;
    let row = byUrl.get(key);
    if (!row) { row = { n: rows.length + 1, url: i.url, domain: i.url ? new URL(i.url).hostname.replace(/^www\./, '') : '', archive: i.archive, accessed: i.accessed, grade: gradeCode(i.reliability, i.credibility), claims: [] }; byUrl.set(key, row); rows.push(row); }
    row.claims.push(i.claim);
    if (!row.archive && i.archive) row.archive = i.archive;
    if (!row.grade && (i.reliability || i.credibility)) row.grade = gradeCode(i.reliability, i.credibility);
  }
  return rows;
}
export function sourcesMarkdown(c) {
  const rows = sourcesTable(c);
  return ['| # | Source | Archived copy | Accessed | Grade | Claim |', '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.n} | ${r.url ? `[${cell(r.domain)}](${r.url})` : 'No source URL'} | ${r.archive ? `[archive](${r.archive})` : 'none'} | ${r.accessed || ''} | ${r.grade || 'not graded'} | ${cell(short(r.claims.join('; ')))} |`)].join('\n');
}

/** A Markdown write-up of a case that importMarkdown reads back. */
export function exportMarkdown(c, now = new Date()) {
  const L = [`# Case: ${c.title}`, '', `Exported from the Vitruvian Manager OSINT Dashboard on ${utcLabel(now)}. ${c.items.length} item${c.items.length === 1 ? '' : 's'}. Grades use the Admiralty (NATO) system: a letter for the source's reliability (A–F) and a number for the information's credibility (1–6).`, ''];
  c.items.forEach((i, k) => {
    L.push(`## ${k + 1}. ${short(i.claim || i.url, 120)}`);
    L.push(`- Claim: ${clean(i.claim)}`);
    if (i.url) L.push(`- Source: ${i.url}`);
    if (i.archive) L.push(`- Archive: ${i.archive}`);
    L.push(`- Accessed: ${i.accessed}`);
    if (i.eventDate) L.push(`- Event date: ${i.eventDate}`);
    if (i.reliability || i.credibility) L.push(`- Grade: ${gradeCode(i.reliability, i.credibility)} (${gradeLabel(i.reliability, i.credibility)})`);
    if (i.tags.length) L.push(`- Tags: ${i.tags.join(', ')}`);
    if (i.hash) L.push(`- SHA-256: ${i.hash}`);
    L.push(`- ID: ${i.id}`, '');
    if (i.notes) L.push(MD_ESC(i.notes), '');
  });
  L.push('## Sources table', '', sourcesMarkdown(c), '');
  if (c.log.length) {
    L.push('## Activity log', '');
    for (const l of c.log) L.push(`- ${l.at} · ${l.kind} · ${clean(l.text)}${l.url ? ' · ' + l.url : ''}`);
    L.push('');
  }
  return L.join('\n');
}
/** Cases from Markdown written by exportMarkdown (one case per "# Case:" heading). */
export function importMarkdown(text, now = new Date()) {
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cases = [];
  let c = null, item = null, section = 'items', notes = [];
  const flush = () => { if (item) { item.notes = MD_UNESC(notes.join('\n')).trim(); c.items.push(item); } item = null; notes = []; };
  for (const line of lines) {
    const h1 = line.match(/^# Case:\s*(.*)$/);
    if (h1) { if (c) { flush(); cases.push(c); } c = { title: h1[1], items: [], log: [] }; section = 'items'; continue; }
    if (!c) continue;
    const h2 = line.match(/^## (.*)$/);
    if (h2) {
      flush();
      if (/^Sources table\s*$/.test(h2[1])) { section = 'sources'; continue; }
      if (/^Activity log\s*$/.test(h2[1])) { section = 'log'; continue; }
      section = 'items';
      item = { claim: h2[1].replace(/^\d+\.\s*/, ''), tags: [] };
      continue;
    }
    if (section === 'log') {
      const m = line.match(/^- (\S+) · (\w+) · (.*?)(?: · (https?:\/\/\S+))?$/);
      if (m) c.log.push({ at: m[1], kind: m[2], text: m[3], url: m[4] || '' });
      continue;
    }
    if (section !== 'items' || !item) continue;
    const f = !notes.length && line.match(/^- (Claim|Source|Archive|Accessed|Event date|Grade|Tags|SHA-256|ID): ?(.*)$/);
    if (f) {
      const [, k, v] = f;
      if (k === 'Claim') item.claim = v;
      else if (k === 'Source') item.url = v.trim();
      else if (k === 'Archive') item.archive = v.trim();
      else if (k === 'Accessed') item.accessed = v.trim();
      else if (k === 'Event date') item.eventDate = v.trim();
      else if (k === 'Grade') { const g = v.trim().match(/^([A-F?])([1-6?])/i); if (g) { item.reliability = g[1].toUpperCase(); item.credibility = g[2]; } }
      else if (k === 'Tags') item.tags = v.split(',');
      else if (k === 'SHA-256') item.hash = v.trim();
      else if (k === 'ID') item.id = v.trim();
      continue;
    }
    if (!notes.length && !line.trim()) continue;
    notes.push(line);
  }
  if (c) { flush(); cases.push(c); }
  if (!cases.length) throw new Error('No “# Case:” heading found. Import Markdown that this notebook exported.');
  return cases.map(x => normaliseCase(x, now));
}
/** Pick JSON or Markdown by content. */
export function importNotebook(text, now = new Date()) {
  const t = String(text).replace(/^﻿/, '').trimStart();
  return t.startsWith('{') || t.startsWith('[') ? importJson(t, now) : importMarkdown(t, now);
}

/** Items in date order for the timeline: by event date where known, otherwise by date accessed; undated last. */
export function timelineGroups(c) {
  const dated = c.items.map(i => ({ item: i, date: i.eventDate || i.accessed || '', byEvent: !!i.eventDate })).filter(x => x.date);
  dated.sort((a, b) => a.date.localeCompare(b.date) || (a.item.created || '').localeCompare(b.item.created || ''));
  const groups = [];
  for (const x of dated) {
    const g = groups.at(-1);
    if (g && g.date === x.date) g.entries.push(x); else groups.push({ date: x.date, entries: [x] });
  }
  return groups;
}
/** Counts for a case: items, graded, archived, confirmed (credibility 1), sources. */
export function caseStats(c) {
  const items = c?.items || [];
  return {
    items: items.length, graded: items.filter(i => i.reliability && i.credibility).length, archived: items.filter(i => i.archive).length,
    confirmed: items.filter(i => i.credibility === '1').length, sources: new Set(items.map(i => i.url).filter(Boolean)).size,
  };
}
