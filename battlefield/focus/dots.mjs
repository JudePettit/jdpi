// War Focus: 22 small states drawn as dots, at Natural Earth's point for each (omni/data/base/small-states.json, public
// domain), from their first day as states, in a year no Cliopatria row holds them (21 November 2026; before, the 22
// that CShapes 2.0 had no border for, drawn at the map kit's points under Gleditsch–Ward numbers). Keyed by Wikidata
// Q-id, Natural Earth's own (WIKIDATAID, as small-states.json carries it). Vanuatu has no Natural Earth point, so it
// has no dot: it is drawn where a Cliopatria row holds it, and is otherwise in none of War Focus's wars.
// The list and the first days were moved here unchanged from the Retrospective Battlefield's build on 20 November 2026.
// from: the first day as a state. For the Political Retrospective's ten (hp-retrospective, data/countries.json at
// commit 930b968), the first day of its leader lists; null for the four European microstates that were states before
// 1926, drawn from the page's first year. For the other twelve, Wikidata's inception (P571; where it has several, the
// preferred statement), read 17 November 2026 (CC0); Wikidata gives Tonga's and Samoa's to the year only. src: where
// its first day comes from, for the page to name.
const TABLE = {
  AND: ['Q228', null], ATG: ['Q781', '1981-11-01'], DMA: ['Q784', '1978-11-03'], GRD: ['Q769', '1974-02-07'], KNA: ['Q763', '1983-09-19'],
  LCA: ['Q760', '1979-02-22'], LIE: ['Q347', null], MCO: ['Q235', null], SMR: ['Q238', null], VCT: ['Q757', '1979-10-27'],
  FSM: ['Q702', '1986-11-03'], KIR: ['Q710', '1979-07-12'], MHL: ['Q709', '1986-10-21'], NRU: ['Q697', '1968-01-31'], PLW: ['Q695', '1994-10-01'],
  STP: ['Q1039', '1975-07-12'], SYC: ['Q1042', '1976-06-29'], TON: ['Q678', '1970'], TUV: ['Q672', '1978-10-01'], VAT: ['Q237', '1929-02-11'],
  VUT: ['Q686', '1980-07-30'], WSM: ['Q683', '1962'],
};
const RETROSPECTIVE_TEN = new Set(['AND', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'LIE', 'MCO', 'SMR', 'VCT']);
export const DOTS = Object.fromEntries(Object.entries(TABLE).map(([iso3, [q, from]]) => [iso3, { q, from, src: RETROSPECTIVE_TEN.has(iso3) ? 'retrospective' : 'wikidata' }]));
// A first day Wikidata gives only to its year (Tonga's 1970) is not known within that year, so the dot is drawn from the
// next year's first day, never before the state was one.
export const dotFrom = from => (from == null ? null : from.length === 4 ? `${+from + 1}-01-01` : from);
/** Whether a dot is drawn at a date (YYYY-MM-DD): from its first day, and only where no row of the year holds it. */
export const dotOn = (d, date, placedByRow) => (d.from == null || dotFrom(d.from) <= date) && !placedByRow.has(d.q);
