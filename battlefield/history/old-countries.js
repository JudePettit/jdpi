/* The Retrospective Battlefield's old country addresses (c=<number>, a Gleditsch–Ward number UCDP's rows gave a
   country, written before 20 November 2026) as the place of a year. One function for every reader of
   battlefield/history/data/places.json's oldCountries: the page (app.js) and the coverage report
   (integration/scripts/coverage.mjs).
   An entry is a Q-id, or, for a number UCDP gave two states over time (365: the Soviet Union to 1991, then Russia),
   runs [[first, last, Q], …] of the years UCDP's rows name each (battlefield/scripts/build-history.mjs). The place of
   year y:
   · the run that holds y;
   · before the first run, the first; after the last, the last (as the build writes them);
   · in a year between two runs (no row of UCDP's names either), the later state from the year Wikidata dates it
     (places.json `since`, its inception, kept where after 1926), the earlier before it: 678 in 1988 is the Yemen Arab
     Republic, since Yemen dates from 1990; 552 in 1982 is Zimbabwe, a state from 1980; 365 in 1992 is Russia (review X2,
     21 November 2026; until then the last run was opened for every year in a gap). */

/** The place (a Q-id) an old country number stands for in year y, or null where oldCountries holds no such number. */
export function oldCountry(oldCountries, places, number, y) {
  const v = oldCountries?.[number];
  if (!Array.isArray(v)) return v || null;
  if (!v.length) return null;
  y = Number.isFinite(+y) && y !== null && y !== '' ? +y : v.at(-1)[1];
  const at = v.find(([a, b]) => a <= y && y <= b);
  if (at) return at[2];
  if (y < v[0][0]) return v[0][2];
  const next = v.findIndex(([a]) => a > y);
  if (next < 0) return v.at(-1)[2];
  const later = v[next], earlier = v[next - 1];
  return places?.[later[2]]?.since > y ? earlier[2] : later[2];
}
