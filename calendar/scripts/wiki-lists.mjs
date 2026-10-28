// Summits and other scheduled political events from Wikipedia's own lists and infoboxes, past and upcoming:
// the European Council's meetings, the G7, G20, NATO, BRICS, SCO, APEC, ASEAN, Commonwealth (CHOGM) and European
// Political Community summits, the UN climate conferences (COP) and the UN General Assembly's general debates.
//   import { listEvents } from './wiki-lists.mjs'; await listEvents({ from: '1980-01-01', today: '2026-10-28' })
// Each list row gives a summit's article, its year and its dates; an upcoming summit with only a month is kept as
// "expected" on the 1st of that month and says so in its title. Rows with no date yet ("TBA") are skipped.
import { COUNTRIES, countryInText, countryOfLink, normaliseCountry } from './countries.mjs';

const UA = { 'User-Agent': 'JDP-Iq Political Calendar (https://jdpi.pages.dev)' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const M = `(${MONTHS.join('|')})`;
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const monthNo = name => MONTHS.indexOf(name) + 1;
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

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

/**
 * A date from table or infobox text: { date, precision: 'day' | 'month' } or null.
 * Understands "14–15 December 2026", "November 18 – 19, 2026", "7–8 July" (with the row's year), "April 2027",
 * {{start date|2026|11|9}} and {{start and end dates|2026|11|9|…}}.
 */
export function parseDate(raw, year = null) {
  const s = String(raw || '');
  let m = /\{\{\s*(?:start(?: and end)? dates?|dts|date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(s);
  if (m) return { date: iso(m[1], m[2], m[3]), precision: 'day' };
  const t = strip(s);
  const ok = (y, mo, d) => +d >= 1 && +d <= 31 ? { date: iso(y, mo, d), precision: 'day' } : null;
  // "14–15 December 2026", "30 November – 1 December 2026"
  m = new RegExp(`\\b(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+${M}(?:\\s*[–-]\\s*\\d{1,2}\\s+${M})?\\s+(\\d{4})\\b`).exec(t);
  if (m) return ok(m[4], monthNo(m[2]), m[1]);
  // "November 18 – 19, 2026", "January 3, 2027"
  m = new RegExp(`\\b${M}\\s+(\\d{1,2})(?:\\s*[–-]\\s*(?:${M}\\s+)?\\d{1,2})?,?\\s+(\\d{4})\\b`).exec(t);
  if (m) return ok(m[4], monthNo(m[1]), m[2]);
  // "7–8 July" or "July 7" in a row whose year is known
  m = new RegExp(`\\b(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+${M}\\b`).exec(t);
  if (m && year) return ok(year, monthNo(m[2]), m[1]);
  m = new RegExp(`\\b${M}\\s+(\\d{1,2})\\b(?!,?\\s*\\d{4})`).exec(t);
  if (m && year) return ok(year, monthNo(m[1]), m[2]);
  // "April 2027": the month only
  m = new RegExp(`\\b${M}\\s+(\\d{4})\\b`).exec(t);
  if (m) return { date: iso(m[2], monthNo(m[1]), 1), precision: 'month' };
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
    const d = dateCell ? parseDate(dateCell, y) : null;
    if (!d || d.date < from) continue;
    if (y && !d.date.startsWith(String(y))) continue;
    const kind = cells.map(strip).find(c => /^(?:Informal|Scheduled|Extraordinary|Special|Formal|Euro summit|Emergency)\b/i.test(c));
    const name = own ? own.target : title + (kind && !/^Scheduled/i.test(kind) ? ` (${kind.replace(/\s*\(.*$/, '').toLowerCase()})` : '');
    const future = d.date > today;
    const city = own ? links.filter(l => l !== own).map(l => l.target).find(t => countryOfLink(t) && !/^(?:President|Prime Minister|King|Queen)/.test(t)) : null;
    const where = country || hostOf(raw) || (city && countryOfLink(city)) || (own && countryInText(own.target)) || host || 'International';
    const official = (/\[(https?:\/\/(?:www\.)?consilium\.europa\.eu[^\s\]]*)/.exec(raw) || [])[1];
    out.push({
      date: d.date, country: where,
      title: name + (d.precision === 'month' ? ' (date to be confirmed)' : ''),
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
    status: d.precision === 'month' ? 'tentative' : 'declared', source: wiki(article) };
}

/**
 * Referendums from a "<year> national electoral calendar" article: "* 9 December: [[Elections in Fiji|Fiji]],
 * [[2026 Fijian constitutional referendum|Constitutional referendum]]" (a date line may hold several countries).
 */
export function referendumsFromCalendar(wikitext, year) {
  const out = [];
  let month = null, date = null;
  for (const line of String(wikitext).split('\n')) {
    const h = new RegExp(`^==\\s*${M}\\s*==`).exec(line);
    if (h) { month = monthNo(h[1]); date = null; continue; }
    if (/^==/.test(line)) { month = null; continue; }
    const b = /^(\*+)\s*(.*)$/.exec(line);
    if (!b || !month) continue;
    const lead = /^(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+[A-Z][a-z]+\s*:/.exec(b[2]);
    if (b[1].length === 1) date = lead ? iso(year, month, lead[1]) : (/^[A-Z][a-z]+\s*:/.test(b[2]) ? iso(year, month, 1) + '~' : null);
    if (!date) continue;
    for (const m of b[2].matchAll(/\[\[([^\]|]*(?:referend|plebiscite)[^\]|]*)(?:\|[^\]]*)?\]\]/gi)) {
      const first = /\[\[(?:Elections in |Politics of )?([^\]|]+?)(?:\|([^\]]+))?\]\]/.exec(b[2]);
      const name = first && !/referend|plebiscite|election/i.test(first[1]) ? normaliseCountry((first[2] || first[1]).replace(/^the /, '').trim()) : countryInText(m[1]) || 'International';
      const monthOnly = date.endsWith('~');
      out.push({ date: date.replace('~', ''), country: name, title: m[1].trim() + (monthOnly ? ' (date to be confirmed)' : ''), type: 'referendum', status: monthOnly ? 'tentative' : 'declared', source: wiki(m[1].trim()) });
    }
  }
  return out;
}

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

async function wikitexts(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' });
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const j = await (await fetch(url, { headers: UA })).json();
        const redirect = new Map((j.query?.redirects || []).map(r => [r.to, r.from]));
        const normal = new Map((j.query?.normalized || []).map(r => [r.to, r.from]));
        for (const p of j.query?.pages || []) {
          const from = redirect.get(p.title) || p.title;
          out.set(normal.get(from) || from, p.revisions?.[0]?.slots?.main?.content || '');
        }
        break;
      } catch { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); }
    }
  }
  return out;
}

/** Summits (and a few scheduled sessions) from the lists and articles above. */
export async function listEvents({ from = '1980-01-01', today = new Date().toISOString().slice(0, 10) } = {}) {
  // This year's, next year's and the year after's national electoral calendars, for scheduled referendums.
  const y = +today.slice(0, 4), calendars = [y, y + 1, y + 2].map(n => [n, `${n} national electoral calendar`]);
  const texts = await wikitexts([...LISTS.map(l => l.article), ...ARTICLES.map(a => a.article), ...calendars.map(c => c[1])]);
  const events = [], log = [];
  for (const [year, article] of calendars) {
    const list = texts.get(article) ? referendumsFromCalendar(texts.get(article), year).filter(e => e.date >= from) : [];
    log.push(`${article}: ${texts.get(article) ? list.length + ' referendums' : 'no article'}`);
    events.push(...list);
  }
  for (const l of LISTS) {
    const list = eventsFromList(texts.get(l.article) || '', { ...l, from, today });
    log.push(`${l.article}: ${list.length}`);
    events.push(...list);
  }
  for (const a of ARTICLES) {
    const text = texts.get(a.article);
    const e = text ? eventFromInfobox(text, { ...a, today }) : null;
    log.push(`${a.article}: ${e ? e.date : text ? 'no date yet' : 'no article'}`);
    if (e && e.date >= from) events.push(e);
  }
  return { events, log };
}
