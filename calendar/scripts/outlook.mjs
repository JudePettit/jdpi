// The calendar's elections outlook: the Political Atlas's elections as events, then one record per vote across every
// source (Wikidata through the Retrospective, Wikipedia's national electoral calendars, the Atlas), with the best date
// known, and expected events resolved once their day has passed. Used by build-events.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toBeConfirmed } from './wiki-lists.mjs';

const longDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const HEDGED = /\b(?:if needed|planned|target|expected|possible|provisional|tentative|due|latest|postponed|verify)\b/i;
const CONDITIONAL = /\b(?:if needed|planned|target|possible|postponed|verify)\b/i;
// Votes below the state. Nigeria's "Governorship and State Houses of Assembly elections" (6 February 2027) passed the
// first list and stood on the calendar as a national election (follow-up of 26 November 2026); so did the Philippines'
// barangay (village) and Hong Kong's district council elections.
const LOCAL = /\b(?:local|municipal|regional|mayoral|county|governorship|gubernatorial|barangay)\b|\bstate elections?\b|\bstate houses? of assembly\b|\bdistrict council\b/i;
// A party's own contest. "Congress" alone named the legislature too: Micronesia's general election "(all 14 seats in
// Congress)", its Congress's election of the President, Argentina's, Brazil's and Paraguay's general elections were typed
// as party contests (VM-POLITICAL-EVENT-TYPES-STUDY.md, stage 0; Political Atlas, read 26 November 2026).
const PARTY = /\bparty congress\b|\bleadership\b|\bprimar(?:y|ies)\b/i;

/** What a ballot elects, as far as its title says: 'presidential', 'legislative', or 'any' (a general election, or
 *  both). Two records of one country are one vote, or its two rounds, only when these agree. An indirect vote (a
 *  Senate or a National Assembly chosen by councils) is a vote of its own. */
export function ballotKind(title) {
  const t = String(title);
  if (/\bindirect\b/i.test(t)) return 'indirect';
  const pres = /\bpresiden/i.test(t), leg = /\b(?:parliament|legislat|congress|assembly|senate|chamber|seimas|sejm|duma|knesset|national council|house of)/i.test(t);
  return /\bgeneral\b/i.test(t) || pres === leg ? 'any' : pres ? 'presidential' : 'legislative';
}
export const sameKind = (a, b) => { const x = ballotKind(a), y = ballotKind(b); return x !== 'indirect' && y !== 'indirect' && (x === 'any' || y === 'any' || x === y); };
const dayMonth = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
// A title that names a round or a phase of a vote held over several (Myanmar's of 2025 and 2026).
const ROUND = /\b(?:round|run-?off|phase)\b/i;
// An Atlas note that says a vote has no date: "No polling date has been set" (Fiji's referendum, 26 November 2026).
const DATE_GONE = /\b(?:postpon|delay|moved|date has gone|no (?:polling )?date (?:has|had) (?:yet )?been set)/i;
/** The title of a Wikipedia article from its address, with spaces ("1990 Romanian general election"), or null. */
export const pageTitle = s => { const m = /en\.wikipedia\.org\/wiki\/([^#]+)/.exec(s || ''); if (!m) return null; try { return decodeURIComponent(m[1]).replace(/_/g, ' '); } catch { return null; } };
/** The cached lead of an event's Wikipedia article (title → lead, as calendar/scripts/summary-cache.json keys it). */
export function leadOf(e, leads = {}) {
  const t = /en\.wikipedia\.org\/wiki\/([^#]+)/.exec(e?.source || '')?.[1];
  if (!t) return '';
  let title = t; try { title = decodeURIComponent(t); } catch { /* keep it */ }
  return leads[title] || leads[title.replace(/ /g, '_')] || '';
}
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** The days the first sentence of a lead gives a vote, as ISO dates: "held in the Czech Republic on 3 and 4 October
 *  2025" → 3 and 4 October; "held in Seychelles on 27 September 2025" → 27 September; "held from 9 to 11 October 2025"
 *  → 9, 10 and 11 October; "on February 9, 2025" → 9 February. */
export function daysNamed(lead) {
  const out = new Set(), s = String(lead || '').split(/(?<=[a-z0-9)]\.)\s+(?=[A-Z])/)[0];
  const add = (d1, d2, sep, m, y) => {
    const i = MONTH_NAMES.indexOf(String(m).toLowerCase());
    if (i < 0) return;
    const a = +d1, b = d2 ? +d2 : a, range = sep && !/and/i.test(sep);
    for (let d = a; d <= b; d += range ? 1 : Math.max(1, b - a)) out.add(`${y}-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  for (const m of s.matchAll(/\b(\d{1,2})(?:\s*(–|-|and|to)\s*(\d{1,2}))?\s+([A-Z][a-z]+),?\s+(\d{4})\b/g)) add(m[1], m[3], m[2], m[4], m[5]);
  for (const m of s.matchAll(/\b([A-Z][a-z]+)\s+(\d{1,2})(?:\s*(–|-|and|to)\s*(\d{1,2}))?,\s+(\d{4})\b/g)) add(m[2], m[4], m[3], m[1], m[5]);
  // "on 23 May and 24 May 1997" (the 1997 Slovak referendum's lead): the first day names its month without the year.
  for (const m of s.matchAll(/\b(\d{1,2})\s+([A-Z][a-z]+)\s*(–|-|and|to)\s*(\d{1,2})\s+([A-Z][a-z]+),?\s+(\d{4})\b/g)) {
    if (m[2] === m[5]) add(m[1], m[4], m[3], m[2], m[6]);
    else { add(m[1], null, null, m[2], m[6]); add(m[4], null, null, m[5], m[6]); }
  }
  return out;
}

/**
 * Each country's national elections from a Political Atlas checkout (data/manifest.json and the files it lists; not
 * its state, regional and local elections). One known only to the month is expected on the 1st and says so; one known
 * only to the year, or not yet at all, can't go on a calendar. A hedged entry ("if needed", "planned", "latest") is
 * expected, not confirmed. The source is the Atlas's own page for the country.
 */
export function atlasElections(dir) {
  const out = [];
  for (const f of JSON.parse(readFileSync(join(dir, 'data/manifest.json'), 'utf8')).files) {
    for (const c of JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'))) for (const x of c.elections || []) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(x.date), month = /^\d{4}-\d{2}$/.test(x.date), name = String(x.name).trim();
      if ((!day && !month) || LOCAL.test(name)) continue;
      const type = /referend|plebiscite/i.test(name) ? 'referendum' : /inaugurat/i.test(name) ? 'inauguration' : PARTY.test(name) ? 'party' : 'election';
      const checked = /^\d{4}-\d{2}-\d{2}$/.test(c.lastVerified || '') ? `Political Atlas, checked ${longDate(c.lastVerified)}.` : 'Political Atlas.';
      out.push({ date: day ? x.date : `${x.date}-01`, country: c.name, title: month ? toBeConfirmed(name) : name, type,
        status: month || HEDGED.test(`${name} ${x.note || ''}`) ? 'tentative' : 'declared', precision: month ? 'month' : 'day',
        source: `https://political-atlas.pages.dev/#${c.iso3}`, summary: [x.note, checked].filter(Boolean).join(' ') });
    }
  }
  return out;
}

/**
 * The Atlas's national votes known only to the year ("2027"), with the day the country was checked. One that the Atlas
 * puts in a later year than another source's date for that vote means the date has gone: Fiji's constitutional
 * referendum, which Wikipedia's 2026 electoral calendar still gives on 9 December 2026, is in 2027 in the Atlas
 * (checked 25 November 2026), whose review note says "The referendum's 9 December date has gone" (Fijivillage, FBC and
 * the Fiji Times, 25 November). See mergeBallots, `later`. Each entry keeps its note: the Atlas also keeps a year-only
 * entry for the next regular vote in most countries (Bulgaria's parliamentary election of 2030), which says nothing of a
 * snap election before it.
 */
export function atlasLater(dir) {
  const out = [];
  for (const f of JSON.parse(readFileSync(join(dir, 'data/manifest.json'), 'utf8')).files) {
    for (const c of JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'))) for (const x of c.elections || []) {
      const name = String(x.name).trim();
      if (!/^\d{4}$/.test(String(x.date)) || LOCAL.test(name) || x.status === 'held') continue;
      const type = /referend|plebiscite/i.test(name) ? 'referendum' : /inaugurat/i.test(name) ? 'inauguration' : PARTY.test(name) ? 'party' : 'election';
      if (type !== 'election' && type !== 'referendum') continue;
      out.push({ country: c.name, type, year: String(x.date), title: name, checked: c.lastVerified || null, note: String(x.note || '') });
    }
  }
  return out;
}

/**
 * One record per vote and round, with the best date known. Events carry `via` (where they came from: 'retro', 'list'
 * for Wikipedia's lists and electoral calendars, 'atlas', …) and `precision` ('month' for a date known only to the
 * month). For votes, Wikidata (through the Retrospective) often holds a placeholder date: the 1st of the month or its
 * last day (a legal deadline). Such a record gives way to the electoral calendars' records of the same article when
 * they date it otherwise (in a year they cover, from `calendarsFrom`), or list it as not yet dated (`undated`, article
 * URLs); a future one that nothing confirms is expected, on the 1st of its month. A record known only to the month gives
 * way to a dated one of the same type and country in that month, and an Atlas record to any other record of its type
 * and country on its day (or in its month).
 *
 * Since 26 November 2026 (follow-up of the corrections of that day) the sources' records of one vote are also matched
 * when their days differ, if what they elect agrees (ballotKind):
 *  - An Atlas record dated up to 14 days after another source's record of the vote is that vote: its last day (the
 *    Czech Chamber election of 3 and 4 October 2025: the Retrospective gave the 3rd, the Atlas the 4th), or, five days
 *    or more after, its second round (France's legislative election of 30 June and 7 July 2024; Lithuania's of 13 and
 *    27 October 2024; Turkey's presidential run-off of 28 May 2023). The Atlas record goes; the other record, which
 *    links to the vote's article, names its second round in its title unless it names a round already. Where a
 *    presidential and a parliamentary vote share their first day, the run-off is the presidential vote's.
 *  - A past record of the Retrospective on a placeholder day (the 1st or the last of a month) takes the day of the
 *    Atlas's or the electoral calendars' record of the vote in that month, which then goes (the Dominican Republic's
 *    general election, 19 May 2024, not 31 May).
 *  - A record known only to the month gives way to a dated record of the vote in the same year from another source (the
 *    Retrospective's "Next Italian general election", September 2027, and the calendar's 22 December 2027; the Atlas's
 *    Polish election of October 2027 and the calendar's 11 November 2027), and an Atlas record known only to the month
 *    to another source's, in the same year (Madagascar's presidential election, September or October 2027).
 *  - `later` (atlasLater): a future vote that the Atlas, checked since, puts in the next year, saying its date has gone
 *    or was never set, has lost its date and is left out (Fiji's constitutional referendum of 9 December 2026: "No
 *    polling date has been set"). `dropped`, if given, collects what is left out.
 *
 * After the second readers of 26 November 2026:
 *  - The month-only rule holds for a record of the same article (through `redirects`, title → the title it leads to:
 *    "Next Italian general election" leads to "2027 Italian general election"), or else, for an election, within three
 *    months: Switzerland, Italy, Ireland and Taiwan hold several referendums a year, and a snap election can follow a
 *    regular one in the same year (Spain 2019).
 *  - Where the Atlas's day is the vote's last day (fewer than five days after), the other record takes the Atlas's day
 *    when the first sentence of its article's lead (`leads`, title → lead, as summary-cache.json holds them) names that
 *    day and not its own: Seychelles' first round was "held in Seychelles on 27 September 2025"; the 25th, the list's
 *    day, was early voting.
 *  - Two records of one article, title and kind, up to 14 days apart, are one vote unless the title names a round: the
 *    one whose day the lead's first sentence names stays, else the electoral calendar's, which dates each vote from its
 *    article ("2025 Liechtenstein general election": the Retrospective's 2 February and the calendar's 9 February; the
 *    lead says "held in Liechtenstein on 9 February 2025").
 */
export function mergeBallots(events, { today, undated = new Set(), calendarsFrom = Infinity, later = [], dropped = [], leads = {}, redirects = new Map() }) {
  const art = e => { const t = pageTitle(e.source); return t ? redirects.get(t) || t : e.source; };
  const isBallot = e => e.type === 'election' || e.type === 'referendum';
  const nowCalled = c => String(c).split(' / ').at(-1); // "Soviet Union / Russia" is Russia
  const placeholder = d => d.endsWith('-01') || new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate() === +d.slice(8);
  const calendarDays = new Map();
  for (const e of events) if (e.via === 'list' && isBallot(e) && e.precision !== 'month') (calendarDays.get(e.source) || calendarDays.set(e.source, new Set()).get(e.source)).add(e.date);
  let out = events.filter(e => {
    if (e.via !== 'retro' || !isBallot(e) || !placeholder(e.date)) return true;
    if (calendarDays.has(e.source) && +e.date.slice(0, 4) >= calendarsFrom) return calendarDays.get(e.source).has(e.date);
    if (e.date <= today) return true;
    if (undated.has(e.source)) return false;
    return Object.assign(e, { date: e.date.slice(0, 8) + '01', status: 'tentative', precision: 'month', title: toBeConfirmed(e.title) });
  });
  const key = (e, month) => `${e.type}|${nowCalled(e.country)}|${month ? e.date.slice(0, 7) : e.date}`;
  const same = (a, b) => a !== b && a.type === b.type && nowCalled(a.country) === nowCalled(b.country) && sameKind(a.title, b.title);
  const days = (a, b) => (Date.parse(b.date) - Date.parse(a.date)) / 864e5;
  const day = e => isBallot(e) && e.precision !== 'month';
  // A past placeholder day of the Retrospective takes the day another source gives the vote in that month.
  for (const e of out) {
    if (e.via !== 'retro' || !day(e) || !placeholder(e.date) || e.date > today) continue;
    const d = out.find(x => (x.via === 'atlas' || x.via === 'list') && day(x) && same(e, x) && x.date.slice(0, 7) === e.date.slice(0, 7) && x.date !== e.date);
    if (d) e.date = d.date;
  }
  const dated = new Set(out.filter(e => isBallot(e) && e.precision !== 'month').map(e => key(e, true)));
  out = out.filter(e => !(isBallot(e) && e.precision === 'month' && dated.has(key(e, true))));
  // A month-only record and a dated one of the vote in the same year, within three months (a referendum: of the same
  // article); an Atlas month-only one and another's.
  out = out.filter(e => {
    if (!isBallot(e) || e.precision !== 'month') return true;
    const d = out.find(x => same(e, x) && x.via !== e.via && x.date.slice(0, 4) === e.date.slice(0, 4) && (x.precision !== 'month' || e.via === 'atlas')
      && (art(e) === art(x) || (e.type !== 'referendum' && Math.abs(days(e, x)) <= 92)));
    if (d) dropped.push({ ...e, why: `the same vote as "${d.title}" (${d.date})` });
    return !d;
  });
  const others = new Set(out.filter(e => e.via !== 'atlas').flatMap(e => [key(e), key(e, true)]));
  out = out.filter(e => e.via !== 'atlas' || !others.has(key(e, e.precision === 'month')));
  // An Atlas record up to 14 days after another source's: the vote's last day, or its second round.
  out = out.filter(e => {
    if (e.via !== 'atlas' || !day(e)) return true;
    const first = out.filter(x => x.via !== 'atlas' && day(x) && same(e, x) && days(x, e) > 0 && days(x, e) <= 14)
      .sort((a, b) => days(a, e) - days(b, e) || (ballotKind(b.title) === 'presidential') - (ballotKind(a.title) === 'presidential'))[0];
    if (!first) return true;
    if (days(first, e) >= 5 && !ROUND.test(first.title)) first.title += ` (first round; second round ${dayMonth(e.date)})`;
    // The vote's last day, which the article's lead gives as the day it was held: that day, not the first.
    const named = daysNamed(leadOf(first, leads));
    if (days(first, e) < 5 && named.has(e.date) && !named.has(first.date)) {
      dropped.push({ ...e, why: `the same vote as "${first.title}", which moves from ${first.date} to the day its article gives` });
      first.date = e.date;
      return false;
    }
    dropped.push({ ...e, why: `the same vote as "${first.title}" (${first.date})` });
    return false;
  });
  // Two records of one article and title up to 14 days apart, from two different feeds, neither naming a round: one
  // vote. Two rows of one feed are polling days it lists on purpose (Wikipedia's electoral calendars list Myanmar's
  // three phases, 28 December 2025, 11 January and 25 January 2026, under one title), so they stay.
  out = out.filter(e => {
    if (!day(e) || e.via === 'atlas' || ROUND.test(e.title)) return true;
    const twin = out.find(x => x !== e && day(x) && x.via !== e.via && x.source === e.source && x.title === e.title && x.type === e.type && x.date !== e.date
      && Math.abs(days(x, e)) <= 14 && nowCalled(x.country) === nowCalled(e.country));
    if (!twin) return true;
    const named = daysNamed(leadOf(e, leads)), told = named.has(e.date) !== named.has(twin.date);
    // When the lead names both days or neither ("on 13 and 14 June 2003"; "between 25 June and 1 July 2020"), a pair up
    // to 3 days apart, or a Wikidata copy of a Retrospective vote, is left to build-events.mjs, which keeps one record of
    // the two (dupOf there; the Wikidata copy takes the Retrospective's day, sameVote).
    if (!told && (Math.abs(days(twin, e)) <= 3 || [e.via, twin.via].sort().join() === 'retro,wikidata')) return true;
    const keep = told ? (named.has(e.date) ? e : twin)
      : (e.via === 'list' || twin.via === 'list') ? (e.via === 'list' ? e : twin) : (e.date < twin.date ? e : twin);
    if (keep === e) return true;
    dropped.push({ ...e, why: `the same vote as "${twin.title}" (${twin.date})${told ? ', the day its article gives' : ''}` });
    return false;
  });
  // A future vote that the Atlas, checked since, puts in the next year, saying its date has gone or was never set.
  return out.filter(e => {
    if (!isBallot(e) || e.via === 'atlas' || e.date <= today) return true;
    const l = later.find(x => x.type === e.type && nowCalled(e.country) === x.country && +x.year === +e.date.slice(0, 4) + 1 && DATE_GONE.test(x.note || '') && sameKind(e.title, x.title)
      && !events.some(y => y.via === 'atlas' && same(y, e) && y.date.slice(0, 4) === e.date.slice(0, 4)));
    if (l) dropped.push({ ...e, why: `the Political Atlas (checked ${l.checked}) puts the vote in ${l.year}` });
    return !l;
  });
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** The deadlines a lead gives a vote ("will occur in Italy no later than 22 December 2027", "will be held in Poland by
 *  11 November 2027 at the latest", "on or before December 1, 2027"), as ISO dates. A bare "by" is a deadline when the
 *  sentence speaks of a vote to come ("Parliamentary elections are to be held by 25 July 2027", "due to be held in Fiji
 *  by 6 February 2027", "will be held in Serbia by 26 December 2026"; second readers, 26 November 2026), not of one held
 *  ("The vote was held by …"). */
const FUTURE = /\b(?:will be held|are to be held|is to be held|(?:are|is) due to be held|due to be held|(?:are |is )?scheduled to be held|scheduled to take place|will take place|will occur)\b[^.;]*$/i;
export function deadlinesIn(lead) {
  const out = [], text = String(lead || '');
  const iso = (d, m, y) => { const i = MONTHS.indexOf(m.toLowerCase()); return i < 0 ? null : `${y}-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
  for (const m of text.matchAll(/\b(?:no later than|not later than|on or before|(by))\s+(?:(\d{1,2}) ([A-Za-z]+),? (\d{4})|([A-Za-z]+) (\d{1,2}), (\d{4}))(\s+at the latest)?/g)) {
    if (m[1] && !m[8] && !FUTURE.test(text.slice(0, m.index))) continue; // a bare "by" of a vote held is not a deadline
    const d = m[2] ? iso(m[2], m[3], m[4]) : iso(m[6], m[5], m[7]);
    if (d) out.push(d);
  }
  return out;
}

/**
 * A future vote dated by its legal deadline is expected, not set: the electoral calendars give Italy's general
 * election as "22 December" and Poland's as "11 November" 2027, plainly, while the articles' leads (Wikipedia, read 26
 * November 2026) say "no later than 22 December 2027" and "by 11 November 2027 at the latest". `leads` maps a
 * Wikipedia article's title (as in its address) to its lead, as calendar/scripts/summary-cache.json holds them. A vote
 * dated after the deadline its lead gives, within three months, is expected too: Wikipedia's 2026 electoral calendar
 * gives Serbia's presidential election on 27 December 2026, with no reference, and its lead "by 26 December 2026"
 * (second readers, 26 November 2026).
 */
export function markDeadlines(events, leads, today) {
  let n = 0;
  for (const e of events) {
    if ((e.type !== 'election' && e.type !== 'referendum') || e.status !== 'declared' || e.date <= today) continue;
    const t = /en\.wikipedia\.org\/wiki\/(.+)$/.exec(e.source || '')?.[1];
    let title = t; try { title = t && decodeURIComponent(t); } catch { /* keep it */ }
    const due = title ? deadlinesIn(leads[title]) : [];
    if (due.some(d => d === e.date || (d < e.date && (Date.parse(e.date) - Date.parse(d)) / 864e5 <= 92))) { e.status = 'tentative'; n++; }
  }
  return n;
}

/**
 * Two titles that open one article (a redirect) for one event: the record under the redirect gives way to the record
 * under the article's own title, which keeps its title, its address and its day (second readers, 26 November 2026).
 * `redirects` maps a title to the title it leads to (wiki-lists.mjs, resolveTitles), as the addresses' titles read with
 * spaces. An election gives way to one of its kind in its country within 14 days ("1990 Romanian parliamentary
 * election" leads to "1990 Romanian general election", whose record stands on the same day; so do Serbia's of 1992 and
 * Costa Rica's of 1994); a summit to one in its country within 3 days ("Pope Leo XIV's 2026 visit to Uruguay" leads to
 * "Visit by Pope Leo XIV to Uruguay, Argentina, and Peru", 6 to 17 November 2026). A referendum never does: one article
 * often holds several votes of a day (the Irish referendums of November 1992; Donetsk's and Luhansk's of 2014).
 */
export function sameArticle(events, redirects, dropped = []) {
  const titleOf = pageTitle;
  const byTitle = new Map();
  for (const e of events) { const t = titleOf(e.source); if (t) (byTitle.get(t) || byTitle.set(t, []).get(t)).push(e); }
  const nowCalled = c => String(c).split(' / ').at(-1);
  return events.filter(e => {
    if (e.type !== 'election' && e.type !== 'summit') return true;
    const to = redirects.get(titleOf(e.source));
    if (!to) return true;
    const window = e.type === 'summit' ? 3 : 14;
    const x = (byTitle.get(to) || []).find(x => x !== e && x.type === e.type && nowCalled(x.country) === nowCalled(e.country)
      && Math.abs(Date.parse(x.date) - Date.parse(e.date)) / 864e5 <= window && (e.type !== 'election' || sameKind(e.title, x.title)));
    if (x) dropped.push({ ...e, why: `the same ${e.type === 'summit' ? 'event' : 'vote'} as "${x.title}" (${x.date}), whose article its title leads to` });
    return !x;
  });
}

/**
 * Expected events whose day has passed are held, unless they depended on something ("if needed", "planned"); one known
 * only to the month is dropped once its month is over.
 */
export function resolveExpected(events, today) {
  return events.filter(e => {
    if (e.status !== 'tentative' || e.date >= today) return true;
    if (e.precision === 'month') return e.date.slice(0, 7) >= today.slice(0, 7);
    if (CONDITIONAL.test(e.title)) return false;
    e.status = 'declared';
    return true;
  });
}
