// One-off, after each UCDP release: the conflicts UCDP places where none of their fighting was, with entries for
// history-fought.mjs. GED, UCDP's event dataset (1989 on), says where each clash happened.
//   · Interstate conflicts: UCDP's location lists every primary party's government; the states among them where GED
//     records none of the conflict's events.
//   · Other conflicts: years in which the fighting was all abroad (the United States against al-Qaida, Rwanda against
//     the FDLR in DR Congo). Their places by year follow GED: the countries with 25 or more of the year's battle
//     deaths, or a tenth of them; years where that matches UCDP's location are left out.
//   node battlefield/scripts/check-fought.mjs <UcdpPrioConflict_v26_1.csv> <GEDEvent_v26_1.csv>
import { readFileSync } from 'node:fs';
import { parseCsv, eachCsvRow } from './csv.mjs';
import { FOUGHT_IN, CHECKED_THROUGH } from './history-fought.mjs';
import { interstateName } from './ucdp.mjs';

const [acdPath, gedPath] = process.argv.slice(2);
const gws = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0).sort((a, b) => a - b);
const byId = new Map();
for (const r of parseCsv(readFileSync(acdPath, 'utf8'))) (byId.get(r.conflict_id) || byId.set(r.conflict_id, []).get(r.conflict_id)).push(r);
// Battle deaths by conflict, year and country (GED's state-based events).
const ged = new Map();
await eachCsvRow(gedPath, e => {
  if (e.type_of_violence !== '1' || !byId.has(e.conflict_new_id)) return;
  const years = ged.get(e.conflict_new_id) || ged.set(e.conflict_new_id, new Map()).get(e.conflict_new_id);
  const deaths = years.get(+e.year) || years.set(+e.year, new Map()).get(+e.year);
  deaths.set(+e.country_id, (deaths.get(+e.country_id) || 0) + (+e.best || 0));
});
const main = deaths => { const total = [...deaths.values()].reduce((a, b) => a + b, 0); return [...deaths].filter(([, d]) => d >= 25 || d >= total / 10).map(([gw]) => gw).sort((a, b) => a - b); };
for (const [id, rows] of byId) {
  rows.sort((a, b) => a.year - b.year);
  const last = rows.at(-1), years = ged.get(id), now = FOUGHT_IN['u' + id];
  const label = `${last.type_of_conflict === '2' ? interstateName(rows) : `${last.location}: ${last.territory_name || 'government'}`}, ${rows[0].year}–${last.year}${now ? ` (now ${JSON.stringify(now)})` : ''}`;
  if (!years) {
    if (last.type_of_conflict === '2' && +rows[0].year > CHECKED_THROUGH && !now) console.log(`// u${id} ${label}: no GED events; check by hand`);
    continue;
  }
  if (last.type_of_conflict === '2') {
    const loc = [...new Set(rows.flatMap(r => gws(r.gwno_loc)))], fought = new Set([...years.values()].flatMap(d => [...d.keys()]));
    const kept = loc.filter(gw => fought.has(gw));
    if (kept.length < loc.length) console.log(`u${id}: { loc: ${JSON.stringify(kept)} }, // ${label}${+rows[0].year < 1989 ? '; GED starts in 1989' : ''}`);
    continue;
  }
  const out = {};
  let abroad = false;
  for (const r of rows) {
    const deaths = years.get(+r.year);
    if (!deaths) continue;
    const places = main(deaths), loc = gws(r.gwno_loc);
    if (!places.some(gw => loc.includes(gw))) abroad = true;
    if (places.join() !== loc.join()) out[r.year] = places;
  }
  if (abroad) console.log(`u${id}: { years: ${JSON.stringify(out).replace(/"(\d+)":/g, '$1: ').replace(/,(?=\d+:)/g, ', ')} }, // ${label}`);
}
