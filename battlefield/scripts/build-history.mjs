// Builds battlefield/history/data/wars.json: every war and armed conflict, 1926–2025.
//   node battlefield/scripts/build-history.mjs <UcdpPrioConflict_v26_1.csv> <cow-dir>
// 1946–2025: UCDP/PRIO Armed Conflict Dataset v26.1 (CC BY 4.0), conflict-years with ≥25 battle deaths.
// 1926–1945: Correlates of War inter-, intra- and extra-state war lists v4 (wars with ≥1,000 battle deaths).
// Where each war was fought: the sources' location, unless history-fought.mjs records otherwise (check-fought.mjs
// tests UCDP's interstate conflicts against GED after each release).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.mjs';
import { COW_WIKI, UCDP_WIKI } from './history-wiki.mjs';
import { FOUGHT_IN, CHECKED_THROUGH } from './history-fought.mjs';
import { actors, interstateName } from './ucdp.mjs';

const [acdPath, cowDir] = process.argv.slice(2);
const FIRST = 1926, UCDP_FROM = 1946, LAST = 2025;
const gws = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0);
const wars = [];
// A war's places: the sources' `loc` (codes), unless history-fought.mjs has its own: `loc`, `where` (names for places
// the map has no shape for) or places by year (`locYears`; a year it doesn't list keeps the sources', own(year)).
function place(id, loc, years, own) {
  const f = FOUGHT_IN[id];
  if (!f) return { loc };
  if (!f.years) return { loc: f.loc, ...(f.where ? { where: f.where } : {}) };
  const locYears = Object.fromEntries(years.map(y => [y, f.years[y] || own(y)]));
  return { loc: [...new Set(Object.values(locYears).flat())], locYears };
}

// ---- UCDP/PRIO: one entry per conflict_id, with an intensity per active year (1 = minor, 2 = war).
const UCDP_TYPE = { 1: 'Colonial war', 2: 'Interstate war', 3: 'Civil conflict', 4: 'Internationalised civil conflict' };
const byId = new Map(), unchecked = [];
for (const r of parseCsv(readFileSync(acdPath, 'utf8'))) {
  const c = byId.get(r.conflict_id) || byId.set(r.conflict_id, { rows: [] }).get(r.conflict_id);
  c.rows.push(r);
}
for (const [id, { rows }] of byId) {
  rows.sort((a, b) => a.year - b.year);
  const last = rows.at(-1), first = rows[0];
  const territory = [...new Set(rows.map(r => r.territory_name).filter(Boolean))].join(', ');
  const name = last.type_of_conflict === '2' ? interstateName(rows) : `${last.location}: ${territory || 'government'}`;
  const sides = k => [...new Set(rows.flatMap(r => [...actors(r[k], r[`${k}_id`]), ...actors(r[`${k}_2nd`])]))];
  if (rows.some(r => r.type_of_conflict === '2') && +first.year > CHECKED_THROUGH && !FOUGHT_IN['u' + id]) unchecked.push('u' + id);
  wars.push({
    id: 'u' + id, src: 'ucdp', name, type: UCDP_TYPE[last.type_of_conflict],
    aim: last.incompatibility === '1' ? 'territory' : last.incompatibility === '2' ? 'government' : 'territory and government',
    years: rows.map(r => [+r.year, +r.intensity_level]),
    ...place('u' + id, [...new Set(rows.flatMap(r => gws(r.gwno_loc)))], rows.map(r => +r.year), y => gws(rows.find(r => +r.year === y).gwno_loc)),
    sideA: sides('side_a'), sideB: sides('side_b'),
    states: [...new Set(rows.flatMap(r => [...gws(r.gwno_a), ...gws(r.gwno_a_2nd), ...gws(r.gwno_b), ...gws(r.gwno_b_2nd)]))],
    start: first.start_date, wiki: UCDP_WIKI[id] || null,
  });
}

// ---- Correlates of War, wars active 1926–1945.
const yearsOf = r => {
  const ys = [];
  for (const [s, e] of [[r.StartYear1, r.EndYear1], [r.StartYear2, r.EndYear2]]) {
    if (+s < 0) continue;
    for (let y = +s; y <= (+e > 0 ? +e : +s); y++) ys.push(y);
  }
  return ys;
};
const cow = f => parseCsv(readFileSync(join(cowDir, f), 'latin1').replace(/^﻿/, '').replace(/EndDay2 ,/, 'EndDay2,'));
const cowWars = new Map();
function addCow(num, name, type, years, part) {
  const w = cowWars.get(num) || cowWars.set(num, { id: 'c' + num, src: 'cow', name, type, years: new Set(), sideA: new Set(), sideB: new Set(), states: new Set(), loc: new Set(), deaths: 0 }).get(num);
  years.forEach(y => w.years.add(y));
  part(w);
}
// COW WhereFought codes → regions (1 Americas, 2 Europe, 4 Africa, 6 Middle East, 7 Asia, 9 Oceania).
// A participant counts as fighting on its own territory only if its region is one the war was fought in.
const FOUGHT = { 1: [1], 2: [2], 4: [4], 6: [6], 7: [7], 9: [9], 11: [2, 6], 12: [2, 7], 13: [1, 7], 14: [2, 4, 6], 15: [2, 4, 6, 7], 16: [4, 6, 7, 9], 17: [7, 9], 18: [4, 6], 19: [2, 4, 6, 7, 9] };
const regionOf = c => c < 200 ? 1 : c < 400 ? 2 : c < 630 ? 4 : c < 700 ? 6 : c < 900 ? 7 : 9;
for (const r of cow('Inter-StateWarData_v4.0.csv')) addCow(r.WarNum, r.WarName, 'Interstate war', yearsOf(r), w => {
  (r.Side === '1' ? w.sideA : w.sideB).add(r.StateName); w.states.add(+r.ccode);
  if ((FOUGHT[+r.WhereFought] || []).includes(regionOf(+r.ccode))) w.loc.add(+r.ccode);
  if (+r.BatDeath > 0) w.deaths += +r.BatDeath;
});
for (const r of cow('Intra-StateWarData_v4.1.csv')) addCow(r.WarNum, r.WarName, 'Civil war', yearsOf(r), w => {
  w.sideA.add(r.SideA); w.sideB.add(r.SideB);
  for (const c of [+r.CcodeA, +r.CcodeB]) if (c > 0) { w.states.add(c); w.loc.add(c); }
  w.deaths += Math.max(0, +r.SideADeaths) + Math.max(0, +r.SideBDeaths);
});
for (const r of cow('Extra-StateWarData_v4.0.csv')) addCow(r.WarNum, r.WarName, 'Colonial or imperial war', yearsOf(r), w => {
  w.sideA.add(r.SideA); w.sideB.add(r.SideB);
  if (+r.ccode1 > 0) { w.states.add(+r.ccode1); w.loc.add(+r.ccode1); }
  w.deaths += Math.max(0, +r.BatDeath) + Math.max(0, +r.NonStateDeaths);
});
for (const w of cowWars.values()) {
  const years = [...w.years].filter(y => y >= FIRST && y < UCDP_FROM).sort((a, b) => a - b);
  if (!years.length) continue;
  const all = [...w.years].sort((a, b) => a - b);
  wars.push({
    id: w.id, src: 'cow', name: w.name, type: w.type, years: years.map(y => [y, 2]),
    span: `${all[0]}–${all.at(-1)}`, ...place(w.id, [...w.loc], years, () => [...w.loc]), states: [...w.states], sideA: [...w.sideA].filter(s => s !== '-8'), sideB: [...w.sideB].filter(s => s !== '-8'),
    deaths: w.deaths || null, wiki: COW_WIKI[w.id.slice(1)] || null,
  });
}

const out = new URL('../history/data/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('wars.json', out), JSON.stringify({
  generated: new Date().toISOString(), firstYear: FIRST, ucdpFrom: UCDP_FROM, lastYear: LAST,
  sources: {
    ucdp: 'UCDP/PRIO Armed Conflict Dataset v26.1 (Davies, Pettersson & Öberg 2026; Gleditsch et al. 2002), CC BY 4.0',
    cow: 'Correlates of War Project, Inter-State (v4.0), Intra-State (v4.1) and Extra-State (v4.0) War Data (Sarkees & Wayman 2010)',
  },
  wars,
}));
const n = y => wars.filter(w => w.years.some(([yy]) => yy === y)).length;
console.log(`${wars.length} wars/conflicts; 1926: ${n(1926)}, 1939: ${n(1939)}, 1946: ${n(1946)}, 2025: ${n(2025)}`);
if (unchecked.length) console.warn(`Interstate conflicts newer than ${CHECKED_THROUGH} not yet in history-fought.mjs: ${unchecked.join(', ')}. Run check-fought.mjs with the GED CSV.`);
if (process.argv.includes('--list-cow')) for (const w of wars.filter(w => w.src === 'cow')) console.log(w.id.slice(1), '|', w.name, '|', w.span);
