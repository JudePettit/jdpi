// Realtime Battlefield: a war's note for one month, from UCDP's candidate events of that month (each counted in the
// month it starts). Used by scripts/build-realtime.mjs; tests/battlefield.test.mjs and tests/corrections-9.test.mjs test
// it on UCDP's own rows.
//
// S0, 16 November 2026: some candidate events are not one clash but a total for a period. UCDP dates them only to a
// month or longer (date_prec 4 or 5) and often places them only in the country: Russia–Ukraine, January 2026, showed
// "Deadliest areas: Ukraine (12,952)", of which 8,002 was UCDP's event for all of January and 4,909 one for January to
// June, counted whole in January. The note now says how many of the month's deaths are in such events, how many of
// those run beyond the month, and how many have no area recorded below the country; the month carries the figures.
//
// 25 November 2026 (ChatGPT's review, front-pages-47 and -48): "Main fighting" joined UCDP's dyad names, which put " - "
// both between the sides and inside some actors' own names ("Sinaloa Cartel - Los Chapitos - Sinaloa Cartel - Los
// Mayos"), so the reader could not tell a name from a side. Each line is now built from UCDP's own side_a and side_b,
// "A v B", an alliance's actors joined with "and". And a count of one is singular: "1 has no area recorded", "1 event".
// After the second readers: where an actor's own name has " and " in it ("March and March", with Operation Dudula on
// one UCDP side), the side keeps UCDP's own comma list, so "and" never sits both between actors and inside a name; and
// a state UCDP names for its old and new selves at once ("Government of Russia (Soviet Union)") takes the name that
// fits the event's date (ucdp.mjs stateName), as the conflict names already do.
import { cleanName } from './wars.mjs';
import { actors, stateName } from './ucdp.mjs';

export const MONTH = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
const fmt = n => n.toLocaleString('en-GB');
// "1 event", "2 events": the count and its noun (or verb) in agreement.
const count = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const andList = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] || '');
/** A state's actor by the name that fits the date: "Government of Russia (Soviet Union)" in 2026 → "Government of Russia". */
const dated = (a, date) => (/^Government of /.test(a) ? `Government of ${stateName(a, date)}` : a);
/**
 * One side of a UCDP event as the reader sees it: its actors (an alliance's joined with "and", or kept in UCDP's comma
 * list when one of the names itself has " and " in it), states by their name on the day, unidentified groups named.
 */
const sideOf = (e, k, c) => {
  if (!String(e[k] || '').trim()) throw new Error(`UCDP event ${e.id || ''} has no ${k}: "Main fighting" is built from side_a and side_b`);
  const date = String(e.date_start || '').slice(0, 10);
  const l = actors(e[k]).map(a => cleanName(dated(a, date), c));
  return l.some(a => / and /.test(a)) ? l.join(', ') : andList(l);
};
/** "Government of Ethiopia v TPLF": the two sides of an event's dyad, from UCDP's side_a and side_b. */
export const sidesOf = e => { const c = country(e.country); return `${sideOf(e, 'side_a', c)} v ${sideOf(e, 'side_b', c)}`; };
export const country = s => s.replace(/ \(.*\)$/, '').replace('DR Congo', 'DR Congo');
// UCDP's date precision: 1 the day, 2 two to six days, 3 the week, 4 the month, 5 a longer period.
export const PERIOD_PREC = 4;
const best = e => +e.best || 0;

/** The month's note and figures for war `w` ({ conflicts: Map }), from `list` (its events starting in month `m`). */
export function monthInsight(w, list, m, prev) {
  const deaths = list.reduce((s, e) => s + best(e), 0);
  if (!list.length) return { month: m, deaths: 0, events: 0, civilians: 0, periodDeaths: 0, periodBeyond: 0, unplacedDeaths: 0, text: `No events recorded in ${MONTH(m)}.`, places: [], sources: [] };
  const civilians = list.reduce((s, e) => s + (+e.deaths_civilians || 0), 0);
  const tally = key => { const t = new Map(); for (const e of list) { const k = key(e); if (k) t.set(k, (t.get(k) || 0) + best(e)); } return [...t].sort((a, b) => b[1] - a[1]); };
  const places = tally(e => [e.adm_1.replace(/ (province|state|region|governorate|oblast|district)$/i, ''), country(e.country)].filter(Boolean).join(', ')).slice(0, 3);
  // The main dyads are said only when the war has more than one conflict (below).
  const dyads = w.conflicts.size > 1 ? tally(sidesOf).slice(0, 2) : [];
  const countries = tally(e => country(e.country));
  // Events UCDP dates only to a month or longer; of those, the ones whose period runs past this month; and the deaths
  // with no area below the country (the bare country name in the deadliest areas).
  const period = list.filter(e => +e.date_prec >= PERIOD_PREC);
  const periodDeaths = period.reduce((s, e) => s + best(e), 0);
  const periodBeyond = period.filter(e => String(e.date_end || '').slice(0, 7) > m).reduce((s, e) => s + best(e), 0);
  const unplacedDeaths = list.filter(e => !e.adm_1).reduce((s, e) => s + best(e), 0);
  let text = `${MONTH(m)}: ${count(list.length, 'event', 'events')}, about ${count(deaths, 'death', 'deaths')}`;
  if (civilians) text += ` (${count(civilians, 'civilian', 'civilians')})`;
  text += '.';
  if (prev && prev.deaths) {
    const ch = Math.round((deaths - prev.deaths) / prev.deaths * 100);
    text += Math.abs(ch) < 10 ? ' Roughly level with the month before.' : ` ${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch)}% on ${MONTH(prev.month)}.`;
  }
  if (places.length) text += ` Deadliest areas: ${places.map(([p, d]) => `${p} (${fmt(d)})`).join('; ')}.`;
  if (periodDeaths) text += ` Of these deaths, ${periodDeaths === 1 ? '1 is in an event UCDP dates only to a month or a longer period, not to a day, counted' : `${fmt(periodDeaths)} are in events UCDP dates only to a month or a longer period, not to a day, each counted`} here in the month it starts${periodBeyond ? ` (${fmt(periodBeyond)} in a period running beyond ${MONTH(m)})` : ''}.`;
  if (unplacedDeaths) text += ` ${count(unplacedDeaths, 'has', 'have')} no area recorded below the country.`;
  if (countries.length > 1) text += ` Fighting recorded in ${countries.length} countries.`;
  if (dyads.length) text += ` Main fighting: ${dyads.map(([d]) => d).join('; ')}.`;
  const top = [...list].sort((a, b) => best(b) - best(a)).slice(0, 3);
  const sources = top.map(e => ({
    date: e.date_start.slice(0, 10), deaths: best(e), place: e.where_description || e.adm_1,
    headline: (e.source_headline || '').split(';')[0].replace(/^"|"$/g, '').slice(0, 160),
    office: (e.source_office || '').split(';')[0],
  }));
  return { month: m, deaths, events: list.length, civilians, periodDeaths, periodBeyond, unplacedDeaths, text, places: places.map(([p, d]) => ({ place: p, deaths: d })), sources };
}
