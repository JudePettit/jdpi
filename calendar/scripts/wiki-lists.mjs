// Summits and other scheduled political events from Wikipedia's own lists and infoboxes, past and upcoming:
// the European Council's meetings, the G7, G20, NATO, BRICS, SCO, APEC, ASEAN, Commonwealth (CHOGM), European
// Political Community and Organization of Turkic States summits, the UN climate conferences (COP) and the UN General
// Assembly's general debates.
//   import { listEvents } from './wiki-lists.mjs'; await listEvents({ from: '1980-01-01', today: '2026-10-28' })
// Each list row gives a summit's article, its year and its dates; an upcoming summit with only a month is kept as
// "expected" on the 1st of that month and says so in its title. Rows with no date yet ("TBA") are skipped.
// Also each year's national electoral calendar: elections and referendums, past and scheduled.
import { COUNTRIES, countryInText, countryOfLink, normaliseCountry } from './countries.mjs';

const UA = { 'User-Agent': 'JDP-Iq Political Calendar (https://jdpi.pages.dev)' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const M = `(${MONTHS.join('|')})`;
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const monthNo = name => MONTHS.indexOf(name) + 1;
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
// The title of something dated only to the month: "General election (second round; date to be confirmed)".
export const toBeConfirmed = t => /\)$/.test(t) ? t.replace(/\)$/, '; date to be confirmed)') : `${t} (date to be confirmed)`;

// Flag templates name the host: {{flag|Turkey}}, {{flagu|Cyprus}}, {{Country|France|1974}}, {{IRL}}.
const IOC = { IRL: 'Ireland', SWI: 'Switzerland', SUI: 'Switzerland', KGZ: 'Kyrgyzstan', PAK: 'Pakistan', CHN: 'China', RUS: 'Russia', IND: 'India', USA: 'United States', GBR: 'United Kingdom', FRA: 'France',
  GER: 'Germany', DEU: 'Germany', ITA: 'Italy', JPN: 'Japan', CAN: 'Canada', BRA: 'Brazil', RSA: 'South Africa', ZAF: 'South Africa', KAZ: 'Kazakhstan', UZB: 'Uzbekistan', TJK: 'Tajikistan', IRN: 'Iran',
  ESP: 'Spain', MDA: 'Moldova', GEO: 'Georgia', HUN: 'Hungary', ALB: 'Albania', ARM: 'Armenia', DEN: 'Denmark', DNK: 'Denmark', CZE: 'Czechia', AUT: 'Austria', BEL: 'Belgium', NED: 'Netherlands', NLD: 'Netherlands',
  POL: 'Poland', TUR: 'Turkey', AZE: 'Azerbaijan', BLR: 'Belarus', MGL: 'Mongolia', VIE: 'Vietnam', VNM: 'Vietnam', KOR: 'South Korea', PER: 'Peru', AUS: 'Australia', NZL: 'New Zealand', CHI: 'Chile', CHL: 'Chile',
  MAS: 'Malaysia', MYS: 'Malaysia', PHI: 'Philippines', PHL: 'Philippines', SIN: 'Singapore', SGP: 'Singapore', THA: 'Thailand', INA: 'Indonesia', IDN: 'Indonesia', MEX: 'Mexico', ARG: 'Argentina', ETH: 'Ethiopia', EGY: 'Egypt',
  KSA: 'Saudi Arabia', SAU: 'Saudi Arabia', UAE: 'United Arab Emirates', ARE: 'United Arab Emirates', QAT: 'Qatar', LTU: 'Lithuania', LAT: 'Latvia', LVA: 'Latvia', EST: 'Estonia', FIN: 'Finland', SWE: 'Sweden', NOR: 'Norway',
  POR: 'Portugal', PRT: 'Portugal', GRE: 'Greece', GRC: 'Greece', CYP: 'Cyprus', SLO: 'Slovenia', SVN: 'Slovenia', CRO: 'Croatia', HRV: 'Croatia', ROU: 'Romania', BUL: 'Bulgaria', BGR: 'Bulgaria', SVK: 'Slovakia',
  LUX: 'Luxembourg', MLT: 'Malta', ISL: 'Iceland', MNE: 'Montenegro', SRB: 'Serbia', MKD: 'North Macedonia', BIH: 'Bosnia and Herzegovina', UKR: 'Ukraine', RWA: 'Rwanda', SAM: 'Samoa', WSM: 'Samoa', ATG: 'Antigua and Barbuda' };
function hostOf(text) {
  let m = /\{\{\s*(?:flag|flagu|flagcountry|flagdeco|Country)\s*\|\s*([^|}]+)/i.exec(text);
  if (m) return normaliseCountry(m[1].trim());
  m = /\{\{\s*([A-Z]{3})\s*\}\}/.exec(text);
  if (m && IOC[m[1]]) return IOC[m[1]];
  return null;
}
// "Antalya, Turkey" → Turkey (a place line ends with its country, even one that is also a common word)
const placeCountry = s => { const last = String(s).split(',').at(-1).trim(); return COUNTRIES.includes(normaliseCountry(last)) ? normaliseCountry(last) : countryInText(s); };
const strip = s => String(s).replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?(?:<\/ref>|$)/g, '').replace(/\{\{(?:TBA|TBD)[^}]*\}\}\}?/gi, 'TBA')
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s*([^\]]*)\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Every dash a range is written with, as the en dash the patterns below read: the hyphen, the non-breaking hyphen
// ("22‑23 November"), the figure dash ("27‒28 November 1999"), the em dash, the minus sign, &ndash; and {{ndash}}.
// Without it a range written with one of the others was read from its last day ("27‒28 November" as the 28th).
// The class holds the characters themselves: U+2010 to U+2015 (hyphen to horizontal bar) and U+2212 (minus sign).
const DASH = /[‐-―−]|&[nm]dash;|\{\{\s*(?:ndash|snd|spaced ndash|mdash|spaced mdash)\s*\}\}/gi;
export const dashes = s => String(s).replace(DASH, '–');

/**
 * A date from table or infobox text: { date, precision: 'day' | 'month' } or null.
 * Understands "14–15 December 2026", "November 18 – 19, 2026", "7–8 July" (with the row's year), "April 2027",
 * {{start date|2026|11|9}} and {{start and end dates|2026|11|9|…}}; a range's first day is the date.
 */
export function parseDate(raw, year = null) {
  const d = dateRange(raw, year);
  return d && { date: d.date, precision: d.precision };
}
/** The same, with the range's last day as `end` (the first, when the text gives one day). */
export function dateRange(raw, year = null) {
  const s = dashes(String(raw || ''));
  let m = /\{\{\s*(?:start(?: and end)? dates?|dts|date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})(?:\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2}))?/i.exec(s);
  if (m) return { date: iso(m[1], m[2], m[3]), precision: 'day', end: m[4] ? iso(m[4], m[5], m[6]) : iso(m[1], m[2], m[3]) };
  const t = strip(s);
  const ok = (y, mo, d, mo2 = mo, d2 = d) => +d >= 1 && +d <= 31 ? { date: iso(y, mo, d), precision: 'day', end: iso(y, mo2, +d2 >= 1 && +d2 <= 31 ? d2 : d) } : null;
  // "14–15 December 2026", "30 November – 1 December 2026"
  m = new RegExp(`\\b(\\d{1,2})(?:\\s*[–-]\\s*(\\d{1,2}))?\\s+${M}(?:\\s*[–-]\\s*(\\d{1,2})\\s+${M})?\\s+(\\d{4})\\b`).exec(t);
  if (m) return m[4] ? ok(m[6], monthNo(m[3]), m[1], monthNo(m[5]), m[4]) : ok(m[6], monthNo(m[3]), m[1], monthNo(m[3]), m[2]);
  // "November 18 – 19, 2026", "January 3, 2027"
  m = new RegExp(`\\b${M}\\s+(\\d{1,2})(?:\\s*[–-]\\s*(?:${M}\\s+)?(\\d{1,2}))?,?\\s+(\\d{4})\\b`).exec(t);
  if (m) return ok(m[5], monthNo(m[1]), m[2], monthNo(m[3] || m[1]), m[4]);
  // "7–8 July" or "July 7" in a row whose year is known
  m = new RegExp(`\\b(\\d{1,2})(?:\\s*[–-]\\s*(\\d{1,2}))?\\s+${M}\\b`).exec(t);
  if (m && year) return ok(year, monthNo(m[3]), m[1], monthNo(m[3]), m[2]);
  m = new RegExp(`\\b${M}\\s+(\\d{1,2})\\b(?!,?\\s*\\d{4})`).exec(t);
  if (m && year) return ok(year, monthNo(m[1]), m[2]);
  // "April 2027": the month only
  m = new RegExp(`\\b${M}\\s+(\\d{4})\\b`).exec(t);
  if (m) return { date: iso(m[2], monthNo(m[1]), 1), precision: 'month', end: iso(m[2], monthNo(m[1]), 1) };
  return null;
}

/** Table rows of a wikitext page: [{ cells: [raw cell text], raw }]. */
export function tableRows(wikitext) {
  const rows = [];
  for (const table of String(wikitext).split(/(?:^|\n)\{\|/).slice(1)) {
    const body = table.split(/\n\|\}/)[0];
    for (const chunk of body.split(/\n\|-[^\n]*/).slice(1)) {
      const cells = [];
      for (const line of chunk.split('\n')) {
        if (!/^\s*[!|]/.test(line)) { if (cells.length) cells[cells.length - 1] += '\n' + line; continue; }
        for (const part of line.replace(/^\s*[!|]/, '').split(/\s*(?:!!|\|\|)\s*/)) {
          // "style="…" | content" → content (but not the "|" inside [[a|b]] or {{a|b}})
          const depth = part.replace(/\[\[[^\]]*\]\]|\{\{[^}]*\}\}/g, m => '_'.repeat(m.length));
          const bar = depth.indexOf('|');
          cells.push(bar >= 0 && /=|^\s*(?:rowspan|colspan|scope|style|align|data-sort-value)/i.test(depth.slice(0, bar)) ? part.slice(bar + 1) : part);
        }
      }
      if (cells.length) rows.push({ cells: cells.map(c => c.trim()), raw: chunk });
    }
  }
  return rows;
}

/**
 * Summits from a list article's tables. `link` picks each row's summit article; `title` names rows that have none
 * (the European Council's meetings); the year comes from a year cell (carried down rowspans), the article's title,
 * or a data-sort-value.
 */
export function eventsFromList(wikitext, { article, link, title, country, type = 'summit', from = '1980-01-01', today }) {
  const out = [];
  let year = null, host = null;
  for (const { cells, raw } of tableRows(wikitext)) {
    const yc = cells.find(c => /^\d{4}\s*\*?$/.test(strip(c)));
    const links = [...raw.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)].map(m => ({ target: m[1].trim(), label: m[2] || m[1] }));
    const own = link ? links.find(l => link.test(l.target)) : null;
    if (link && !own) { if (yc) year = +strip(yc).slice(0, 4); continue; }
    const y = (own && /^(\d{4})\b/.exec(own.target)?.[1]) || (yc && strip(yc).slice(0, 4)) || /data-sort-value="?(\d{4})/.exec(raw)?.[1] || year;
    if (yc) year = +strip(yc).slice(0, 4);
    host = hostOf(raw) || (raw.match(/rowspan/) ? host : null) || host;
    const dateCell = cells.find(c => parseDate(c, y)?.date?.startsWith(String(y || '')) || (!y && parseDate(c)));
    const d = dateCell ? dateRange(dateCell, y) : null;
    if (!d || d.date < from) continue;
    if (y && !d.date.startsWith(String(y))) continue;
    const kind = cells.map(strip).find(c => /^(?:Informal|Scheduled|Extraordinary|Special|Formal|Euro summit|Emergency)\b/i.test(c));
    const name = own ? own.target : title + (kind && !/^Scheduled/i.test(kind) ? ` (${kind.replace(/\s*\(.*$/, '').toLowerCase()})` : '');
    const future = d.date > today;
    const city = own ? links.filter(l => l !== own).map(l => l.target).find(t => countryOfLink(t) && !/^(?:President|Prime Minister|King|Queen)/.test(t)) : null;
    const where = country || hostOf(raw) || (city && countryOfLink(city)) || (own && countryInText(own.target)) || host || 'International';
    const official = (/\[(https?:\/\/(?:www\.)?consilium\.europa\.eu[^\s\]]*)/.exec(raw) || [])[1];
    // `end` (the row's last day) is for preferOwnDates; listEvents leaves it out of what it returns.
    out.push({
      date: d.date, end: d.end, country: where,
      title: name + (d.precision === 'month' ? ' (date to be confirmed)' : ''), precision: d.precision,
      type, status: d.precision === 'month' || (future && !official && !own) ? 'tentative' : 'declared',
      source: own ? wiki(own.target) : (official || wiki(article)),
      ...(own ? {} : { summary: `EU heads of state or government meet as the European Council${kind ? ` (${kind.replace(/\s*\(.*$/, '').toLowerCase()} meeting)` : ''}.${host ? ` Council presidency: ${host}.` : ''}` }),
    });
  }
  return out;
}

/** One event from an article's infobox (dates, place), for summits and sessions that have no list row yet. */
export function eventFromInfobox(wikitext, { article, type = 'summit', title, field, today }) {
  const box = /\{\{\s*Infobox[\s\S]*?\n\}\}/i.exec(String(wikitext))?.[0] || '';
  const fields = Object.fromEntries([...box.matchAll(/\n\s*\|\s*([\w ]+?)\s*=\s*([^\n]*)/g)].map(m => [m[1].trim().toLowerCase(), m[2]]));
  const raw = (field ? fields[field] : null) ?? fields.date ?? fields.dates ?? fields['start_date'] ?? fields.start ?? '';
  const d = parseDate(raw);
  if (!d) return null;
  const place = strip(fields.location || fields.city || fields.cities || fields.venue || '');
  const where = hostOf(fields.country || '') || placeCountry(place) || countryInText(article) || 'International';
  return { date: d.date, country: where, title: (title || article) + (d.precision === 'month' ? ' (date to be confirmed)' : ''), type,
    status: d.precision === 'month' ? 'tentative' : 'declared', precision: d.precision, source: wiki(article) };
}

/**
 * The dates of every infobox in an article: [{ date, precision, end }]. An article on a year's summits ("2026 ASEAN
 * Summits") has one infobox for each, and may write one on a single line: "{{Infobox summit|…|date=November 15–17,
 * 2026|…}}".
 */
export function infoboxDates(wikitext) {
  const s = String(wikitext), out = [];
  const START = /\{\{\s*Infobox/gi;
  for (let m; (m = START.exec(s)); ) {
    // The box runs to its own closing braces; its fields are split at the bars outside links and templates.
    let depth = 0, i = m.index, field = '', fields = [];
    for (; i < s.length; i++) {
      const two = s.slice(i, i + 2);
      if (two === '{{' || two === '[[') { depth++; field += two; i++; continue; }
      if (two === '}}' || two === ']]') { depth--; if (depth === 0) break; field += two; i++; continue; }
      if (s[i] === '|' && depth === 1) { fields.push(field); field = ''; continue; }
      field += s[i];
    }
    fields.push(field);
    START.lastIndex = Math.max(START.lastIndex, i);
    const raw = fields.map(f => /^\s*(?:date|dates|start_date)\s*=\s*([\s\S]*)$/i.exec(f)?.[1]).find(v => v && v.trim());
    const d = raw ? dateRange(raw) : null;
    if (d) out.push(d);
  }
  return out;
}

/**
 * The summit's own article for a list row, or null: the title its source links to on Wikipedia, unless that is the
 * list article itself (a row with no link of its own takes the list as its source) or not Wikipedia (an official page).
 * Only such an article is a second word on the row's date (the review of 17 November 2026, F3).
 */
export function ownArticle(e, listArticle) {
  const m = /^https:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(e?.source || '');
  const t = m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : '';
  return t && t !== listArticle ? t : null;
}

/**
 * A list row's date checked against the summit's own article. When the article's infobox gives other days in the same
 * month, the summit was moved and the list not yet updated: the "ASEAN Summit" list still gave the 49th summit's first
 * schedule, 16–18 November 2026, when its own article (and the news) had it held on 15–17 November. Then the article's
 * first day is the date, and the log says so. When the article's days hold the row's (the 2024 G20 summit's article
 * gives 16–19 November 2024, its social summit included; the list gives the leaders' 18–19 November), the row names
 * the meeting itself and its date stands. `own` gives each event's own article title, or nothing; a row known only to
 * the month is not checked.
 */
export function preferOwnDates(events, own, texts, log = []) {
  return events.map(e => {
    const title = own(e), text = title && texts.get(title);
    if (!text || e.precision !== 'day') return e;
    const end = e.end || e.date;
    const same = infoboxDates(text).filter(d => d.precision === 'day' && d.date.slice(0, 7) === e.date.slice(0, 7));
    if (!same.length || same.some(d => d.date <= e.date && d.end >= end)) return e;
    const gap = d => Math.abs(Date.parse(d.date) - Date.parse(e.date));
    const best = same.sort((a, b) => gap(a) - gap(b))[0];
    log.push(`${title}: ${best.date} from its own article, not the list's ${e.date}`);
    return { ...e, date: best.date, end: best.end };
  });
}

/**
 * Elections and referendums from a "<year> national electoral calendar" article: "* 9 December: [[Elections in
 * Fiji|Fiji]], [[2026 Fijian constitutional referendum|Constitutional referendum]]" (a date line may hold several
 * countries, one per sub-bullet). A vote known only to the month ("* March: …") is expected on the 1st and says so in
 * its title; an election's round says which. Elections in dependencies and unrecognised states, which the article
 * sets in italics, are left out. `unknown` holds the articles of the votes it lists under "Unknown date".
 */
export function ballotsFromCalendar(wikitext, year) {
  const events = [], unknown = new Set();
  let month = null, date = null, undated = false;
  for (const raw of String(wikitext).split('\n')) {
    const line = raw.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?(?:<\/ref>|$)/g, '');
    const h = new RegExp(`^==\\s*${M}\\s*==`).exec(line);
    if (h) { month = monthNo(h[1]); date = null; undated = false; continue; }
    if (/^==/.test(line)) { month = null; undated = /^==\s*Unknown date\s*==/i.test(line); continue; }
    const b = /^(\*+)\s*(.*)$/.exec(line);
    if (!b || !(month || undated)) continue;
    const links = [...b[2].matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)].map(m => ({ target: m[1].trim(), label: (m[2] || m[1]).trim(), at: m.index }));
    const ballots = links.filter(l => /referend|plebiscite|election/i.test(l.target) && !/^(?:Elections in|Politics of) /.test(l.target));
    if (undated) { for (const l of ballots) unknown.add(l.target); continue; }
    const lead = /^(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+[A-Z][a-z]+\s*:/.exec(dashes(b[2]));
    if (b[1].length === 1) date = lead ? iso(year, month, lead[1]) : (/^[A-Z][a-z]+\s*:/.test(b[2]) ? iso(year, month, 1) + '~' : null);
    if (!date || !ballots.length) continue;
    const first = links[0], monthOnly = date.endsWith('~');
    const name = first && !ballots.includes(first)
      ? normaliseCountry(first.label.replace(/''/g, '').replace(/^the /, '').replace(/[\s,;:.]+$/, '').trim()) : countryInText(ballots[0].target) || 'International';
    // A country in italics: its link's label is, or the whole entry is wrapped in ''…''.
    const italic = /''/.test(first?.label || '') || /''\s*$/.test(b[2].slice(0, first?.at ?? 0));
    for (const l of ballots.filter((x, i, a) => a.findIndex(y => y.target === x.target) === i)) {
      const type = /referend|plebiscite/i.test(l.target) ? 'referendum' : 'election';
      if (type === 'election' && italic) continue;
      const round = type === 'election' ? (/\b(?:1st|first) round/i.test(l.label) ? ' (first round)' : /\b(?:2nd|second) round/i.test(l.label) ? ' (second round)' : '') : '';
      events.push({ date: date.replace('~', ''), country: name, title: monthOnly ? toBeConfirmed(l.target + round) : l.target + round, type,
        status: monthOnly ? 'tentative' : 'declared', precision: monthOnly ? 'month' : 'day', source: wiki(l.target) });
    }
  }
  return { events, unknown };
}
/** The referendums alone. */
export const referendumsFromCalendar = (wikitext, year) => ballotsFromCalendar(wikitext, year).events.filter(e => e.type === 'referendum');

// The lists, and single articles for meetings the lists don't date (yet).
export const LISTS = [
  { article: 'List of European Council meetings', title: 'European Council meeting', country: 'European Union' },
  { article: 'G7', link: /^\d+(?:st|nd|rd|th) G[78] summit$/ },
  { article: 'List of G20 summits', link: /G20/ },
  { article: 'NATO summit', link: /NATO summit/ },
  { article: 'BRICS', link: /BRICS summit/ },
  { article: 'Shanghai Cooperation Organisation', link: /SCO summit/ },
  { article: 'Asia-Pacific Economic Cooperation', link: /^APEC |APEC (?:China|Vietnam|Peru|United States|Thailand|New Zealand|Malaysia|Papua New Guinea|Viet Nam)/ },
  { article: 'ASEAN Summit', link: /ASEAN Summits?$/ },
  { article: 'Commonwealth Heads of Government Meeting', link: /Commonwealth Heads of Government Meeting/ },
  { article: 'European Political Community', link: /European Political Community Summit/ },
  // Its summits table links each summit since 2022 that had an article of its own (the second readers, 26 November 2026:
  // the 2023 and 2024 summits, in Astana and Bishkek, had come from Wikidata through their articles, deleted that day).
  { article: 'Organization of Turkic States', link: /^\d{4} Organization of Turkic States summit$/ },
];
export const ARTICLES = [
  { article: '2026 United Nations Climate Change Conference', title: 'COP31: 2026 United Nations Climate Change Conference' },
  { article: '2027 United Nations Climate Change Conference', title: 'COP32: 2027 United Nations Climate Change Conference' },
  { article: 'General debate of the eighty-first session of the United Nations General Assembly', title: 'UN General Assembly: general debate of the 81st session' },
  { article: 'General debate of the eighty-second session of the United Nations General Assembly', title: 'UN General Assembly: general debate of the 82nd session' },
  { article: '9th European Political Community Summit' },
  { article: '10th European Political Community Summit' },
  { article: '2027 G20 summit' },
  { article: '19th BRICS summit' },
  { article: '2027 Albania NATO summit' },
  { article: 'APEC Vietnam 2027' },
];

// Wikitext by title, 50 titles per request. A batch with no answer after four tries (a network error, an HTTP error, an
// API error with no pages) throws, as Current events does: build-events.mjs then skips the lists and its guard stops the
// write if that costs the calendar its summits or its outlook, instead of the batch's articles vanishing without a word.
async function wikitexts(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' });
    let j = null;
    for (let attempt = 0; attempt < 4 && !j; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 3000 * attempt));
      try {
        const res = await fetch(url, { headers: UA });
        const body = res.ok ? await res.json() : null;
        if (Array.isArray(body?.query?.pages)) j = body;
      } catch {}
    }
    if (!j) throw new Error(`could not fetch ${batch.length} articles from the Wikipedia API (${batch[0]}…)`);
    const redirect = new Map((j.query.redirects || []).map(r => [r.to, r.from]));
    const normal = new Map((j.query.normalized || []).map(r => [r.to, r.from]));
    for (const p of j.query.pages) {
      const from = redirect.get(p.title) || p.title;
      out.set(normal.get(from) || from, p.revisions?.[0]?.slots?.main?.content || '');
    }
  }
  return out;
}

/**
 * Where each title leads on Wikipedia today: a Map of title → { to, fragment } for a redirect ("1990 Romanian
 * parliamentary election" → "1990 Romanian general election", fragment "Parliament"), → { missing: true } for a page
 * that is not there (the 2023 and 2024 Organization of Turkic States summits, deleted on 26 November 2026), and no entry
 * for a title that is its own article. 50 titles per request, no page text; a batch with no answer after four tries
 * throws (follow-up of 26 November 2026, after the second readers).
 */
export async function resolveTitles(titles) {
  const out = new Map(), list = [...new Set(titles.filter(Boolean))];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' });
    let j = null;
    for (let attempt = 0; attempt < 4 && !j; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 3000 * attempt));
      try {
        const res = await fetch(url, { headers: UA });
        const body = res.ok ? await res.json() : null;
        if (Array.isArray(body?.query?.pages)) j = body;
      } catch {}
    }
    if (!j) throw new Error(`could not resolve ${batch.length} titles with the Wikipedia API (${batch[0]}…)`);
    const normal = new Map((j.query.normalized || []).map(r => [r.to, r.from]));
    const asked = t => normal.get(t) || t;
    const missing = new Set(j.query.pages.filter(p => p.missing || p.invalid).map(p => p.title));
    for (const r of j.query.redirects || []) out.set(asked(r.from), missing.has(r.to) ? { missing: true } : { to: r.to, fragment: r.tofragment || '' });
    for (const t of missing) if (!out.has(asked(t))) out.set(asked(t), { missing: true });
  }
  return out;
}

/**
 * Summits (and a few scheduled sessions) from the lists and articles above, and elections and referendums from the
 * national electoral calendars of every year from 2026 (or last year, if earlier) to the year after next.
 * `unknown`: the articles of the calendars' votes that have no date yet; `calendarsFrom`: the first calendar's year.
 */
export async function listEvents({ from = '1980-01-01', today = new Date().toISOString().slice(0, 10) } = {}) {
  const y = +today.slice(0, 4), calendars = [], calendarsFrom = Math.min(2026, y - 1);
  for (let n = calendarsFrom; n <= y + 2; n++) calendars.push([n, `${n} national electoral calendar`]);
  const texts = await wikitexts([...LISTS.map(l => l.article), ...ARTICLES.map(a => a.article), ...calendars.map(c => c[1])]);
  const events = [], log = [], unknown = new Set();
  for (const [year, article] of calendars) {
    const ballots = texts.get(article) ? ballotsFromCalendar(texts.get(article), year) : null;
    const list = ballots ? ballots.events.filter(e => e.date >= from) : [];
    log.push(`${article}: ${ballots ? `${list.filter(e => e.type === 'election').length} elections, ${list.filter(e => e.type === 'referendum').length} referendums, ${ballots.unknown.size} undated` : 'no article'}`);
    events.push(...list);
    ballots?.unknown.forEach(t => unknown.add(t));
  }
  // The rows of the last two years and those to come are checked against their summits' own articles (preferOwnDates).
  const since = `${y - 2}${today.slice(4)}`, listed = [], ownOf = new Map(), listOf = new Map();
  for (const l of LISTS) {
    const list = eventsFromList(texts.get(l.article) || '', { ...l, from, today });
    log.push(`${l.article}: ${list.length}`);
    if (l.link) for (const e of list) { const t = ownArticle(e, l.article); if (t) listOf.set(e, [t, l.article]); if (t && e.date >= since) ownOf.set(e, t); }
    listed.push(...list);
  }
  // A row whose own article is not on Wikipedia (a red link, or a page deleted: the 2023 and 2024 Organization of Turkic
  // States summits, deleted on 26 November 2026) takes the list as its source, as a row with no link does.
  const gone = await resolveTitles([...listOf.values()].map(([t]) => t)).catch(err => { log.push(`own articles: not looked up (${err.message})`); return new Map(); });
  let relinked = 0;
  for (const [e, [t, article]] of listOf) if (gone.get(t)?.missing) { e.source = wiki(article); ownOf.delete(e); relinked++; }
  log.push(`rows whose own article is not on Wikipedia: ${relinked}`);
  const ownTexts = ownOf.size ? await wikitexts([...new Set(ownOf.values())]).catch(err => { log.push(`own articles: not checked (${err.message})`); return new Map(); }) : new Map();
  events.push(...preferOwnDates(listed, e => ownOf.get(e), ownTexts, log).map(({ end, ...e }) => e));
  for (const a of ARTICLES) {
    const text = texts.get(a.article);
    const e = text ? eventFromInfobox(text, { ...a, today }) : null;
    log.push(`${a.article}: ${e ? e.date : text ? 'no date yet' : 'no article'}`);
    if (e && e.date >= from) events.push(e);
  }
  return { events, log, unknown, calendarsFrom };
}
