// War Focus: the 22 of VM's countries with no CShapes 2.0 border (design/prp-mapkit.js, PRPMapkit.dots('cshapes')),
// which the page draws as the kit's dots from their first day as states, under the Gleditsch–Ward numbers its sides use.
// Moved here unchanged from the Retrospective Battlefield's build (battlefield/scripts/build-history.mjs, which wrote it
// into its wars.json as `dots`) on 20 November 2026, when that page moved to free borders (Cliopatria and Natural
// Earth) and Wikidata ids. War Focus still draws CShapes borders by Gleditsch–Ward number until it moves too.
// gw: for its ten, the Political Retrospective's own codes (hp-retrospective, data/countries.json at commit 930b968);
// for the other eleven, Kristian Gleditsch and Michael Ward's list of microstates
// (http://ksgleditsch.com/data/microstatessystem.dat, read 17 November 2026). The Holy See is on neither list, so it
// has none. from: the first day as a state. For the Retrospective's ten, the first day of its leader lists; null for
// the four European microstates that were states before 1926, drawn from the page's first year. For the other twelve,
// Wikidata's inception (P571; where it has several, the preferred statement), read 17 November 2026 (CC0); Wikidata
// gives Tonga's and Samoa's to the year only. src: where its first day comes from, for the page to name.
const TABLE = {
  AND: [232, null], ATG: [58, '1981-11-01'], DMA: [54, '1978-11-03'], GRD: [55, '1974-02-07'], KNA: [60, '1983-09-19'],
  LCA: [56, '1979-02-22'], LIE: [223, null], MCO: [221, null], SMR: [331, null], VCT: [57, '1979-10-27'],
  FSM: [987, '1986-11-03'], KIR: [970, '1979-07-12'], MHL: [983, '1986-10-21'], NRU: [971, '1968-01-31'], PLW: [986, '1994-10-01'],
  STP: [403, '1975-07-12'], SYC: [591, '1976-06-29'], TON: [972, '1970'], TUV: [973, '1978-10-01'], VAT: [null, '1929-02-11'],
  VUT: [935, '1980-07-30'], WSM: [990, '1962'],
};
const RETROSPECTIVE_TEN = new Set(['AND', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'LIE', 'MCO', 'SMR', 'VCT']);
export const DOTS = Object.fromEntries(Object.entries(TABLE).map(([iso3, [gw, from]]) => [iso3, { gw, from, src: RETROSPECTIVE_TEN.has(iso3) ? 'retrospective' : 'wikidata' }]));
