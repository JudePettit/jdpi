// Realtime Battlefield: a war's note for one month, from UCDP's candidate events of that month (each counted in the
// month it starts). Used by scripts/build-realtime.mjs; tests/battlefield.test.mjs tests it on UCDP's own rows.
//
// S0, 16 November 2026: some candidate events are not one clash but a total for a period. UCDP dates them only to a
// month or longer (date_prec 4 or 5) and often places them only in the country: Russia–Ukraine, January 2026, showed
// "Deadliest areas: Ukraine (12,952)", of which 8,002 was UCDP's event for all of January and 4,909 one for January to
// June, counted whole in January. The note now says how many of the month's deaths are in such events, how many of
// those run beyond the month, and how many have no area recorded below the country; the month carries the figures.
import { cleanName } from './wars.mjs';

export const MONTH = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
const fmt = n => n.toLocaleString('en-GB');
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
  const dyads = tally(e => cleanName(e.dyad_name, country(e.country))).slice(0, 2);
  const countries = tally(e => country(e.country));
  // Events UCDP dates only to a month or longer; of those, the ones whose period runs past this month; and the deaths
  // with no area below the country (the bare country name in the deadliest areas).
  const period = list.filter(e => +e.date_prec >= PERIOD_PREC);
  const periodDeaths = period.reduce((s, e) => s + best(e), 0);
  const periodBeyond = period.filter(e => String(e.date_end || '').slice(0, 7) > m).reduce((s, e) => s + best(e), 0);
  const unplacedDeaths = list.filter(e => !e.adm_1).reduce((s, e) => s + best(e), 0);
  let text = `${MONTH(m)}: ${fmt(list.length)} events, about ${fmt(deaths)} deaths`;
  if (civilians) text += ` (${fmt(civilians)} civilians)`;
  text += '.';
  if (prev && prev.deaths) {
    const ch = Math.round((deaths - prev.deaths) / prev.deaths * 100);
    text += Math.abs(ch) < 10 ? ' Roughly level with the month before.' : ` ${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch)}% on ${MONTH(prev.month)}.`;
  }
  if (places.length) text += ` Deadliest areas: ${places.map(([p, d]) => `${p} (${fmt(d)})`).join('; ')}.`;
  if (periodDeaths) text += ` Of these deaths, ${fmt(periodDeaths)} are in events UCDP dates only to a month or a longer period, not to a day, each counted here in the month it starts${periodBeyond ? ` (${fmt(periodBeyond)} in a period running beyond ${MONTH(m)})` : ''}.`;
  if (unplacedDeaths) text += ` ${fmt(unplacedDeaths)} have no area recorded below the country.`;
  if (countries.length > 1) text += ` Fighting recorded in ${countries.length} countries.`;
  if (dyads.length && w.conflicts.size > 1) text += ` Main fighting: ${dyads.map(([d]) => d).join('; ')}.`;
  const top = [...list].sort((a, b) => best(b) - best(a)).slice(0, 3);
  const sources = top.map(e => ({
    date: e.date_start.slice(0, 10), deaths: best(e), place: e.where_description || e.adm_1,
    headline: (e.source_headline || '').split(';')[0].replace(/^"|"$/g, '').slice(0, 160),
    office: (e.source_office || '').split(';')[0],
  }));
  return { month: m, deaths, events: list.length, civilians, periodDeaths, periodBeyond, unplacedDeaths, text, places: places.map(([p, d]) => ({ place: p, deaths: d })), sources };
}
