// The calendar's elections outlook: the Political Atlas's elections as events, then one record per vote across every
// source (Wikidata through the Retrospective, Wikipedia's national electoral calendars, the Atlas), with the best date
// known, and expected events resolved once their day has passed. Used by build-events.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toBeConfirmed } from './wiki-lists.mjs';

const longDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const HEDGED = /\b(?:if needed|planned|target|expected|possible|provisional|tentative|due|latest|postponed|verify)\b/i;
const CONDITIONAL = /\b(?:if needed|planned|target|possible|postponed|verify)\b/i;
const LOCAL = /\b(?:local|municipal|regional|mayoral|county)\b|\bstate elections?\b/i;

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
      const type = /referend|plebiscite/i.test(name) ? 'referendum' : /inaugurat/i.test(name) ? 'inauguration' : /\bcongress\b|leadership|primar/i.test(name) ? 'party' : 'election';
      const checked = /^\d{4}-\d{2}-\d{2}$/.test(c.lastVerified || '') ? `Political Atlas, checked ${longDate(c.lastVerified)}.` : 'Political Atlas.';
      out.push({ date: day ? x.date : `${x.date}-01`, country: c.name, title: month ? toBeConfirmed(name) : name, type,
        status: month || HEDGED.test(`${name} ${x.note || ''}`) ? 'tentative' : 'declared', precision: month ? 'month' : 'day',
        source: `https://political-atlas.pages.dev/#${c.iso3}`, summary: [x.note, checked].filter(Boolean).join(' ') });
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
 */
export function mergeBallots(events, { today, undated = new Set(), calendarsFrom = Infinity }) {
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
  const dated = new Set(out.filter(e => isBallot(e) && e.precision !== 'month').map(e => key(e, true)));
  out = out.filter(e => !(isBallot(e) && e.precision === 'month' && dated.has(key(e, true))));
  const others = new Set(out.filter(e => e.via !== 'atlas').flatMap(e => [key(e), key(e, true)]));
  return out.filter(e => e.via !== 'atlas' || !others.has(key(e, e.precision === 'month')));
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
