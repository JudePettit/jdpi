// Builds battlefield/history/data/wars.json: every war and armed conflict, 1926–2025.
//   node battlefield/scripts/build-history.mjs <UcdpPrioConflict_v26_1.csv> [<cow-dir>]
// 1946–2025: UCDP/PRIO Armed Conflict Dataset v26.1 (CC BY 4.0), conflict-years with ≥25 battle deaths, from
// https://ucdp.uu.se/downloads/ (ucdpprio/ucdp-prio-acd-261-csv.zip). Each conflict keeps its state parties year by
// year (`statesYears`, from that year's row); `states` is all of them.
// 1926–1945: Correlates of War inter-, intra- and extra-state war lists v4 (wars with ≥1,000 battle deaths). While
// integration/scripts/cite-only.mjs records them as 'pending' (the S0 hold of 16 November 2026, Jude's choice on the
// Correlates of War), the rows already in wars.json are written back exactly as they are, places included, and
// <cow-dir> is not read: no row and no value is added from it.
// Where each war was fought: the sources' location, unless history-fought.mjs records otherwise (check-fought.mjs
// tests UCDP's interstate conflicts against GED after each release). The build then checks every war-year place
// against the CShapes 2.0 borders the page draws (history/data/borders.topo.json, on 1 July of the year).
// The 22 of VM's countries CShapes has no border for are written as `dots` (below), for the page to draw with the
// kit's dots (design/prp-mapkit.js).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.mjs';
import { COW_WIKI, UCDP_WIKI } from './history-wiki.mjs';
import { FOUGHT_IN, CHECKED_THROUGH } from './history-fought.mjs';
import { actors, interstateName } from './ucdp.mjs';
import { HOSTED } from '../../integration/scripts/cite-only.mjs';
import '../../design/prp-mapkit.js';

const [acdPath, cowDir] = process.argv.slice(2);
const FIRST = 1926, UCDP_FROM = 1946, LAST = 2025;
const UCDP_VERSION = '26.1';
const gws = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0);
const wars = [];
const OUT = new URL('../history/data/', import.meta.url);
const committed = existsSync(new URL('wars.json', OUT)) ? JSON.parse(readFileSync(new URL('wars.json', OUT), 'utf8')) : null;
// A war's places: the sources' `loc` (codes), unless history-fought.mjs has its own: `loc`, `where` (names for places
// the map has no shape for), places by year (`locYears`; a year it doesn't list keeps the sources', own(year)) and
// what a place is called in a year (`placeNames`, for the years the war was active). `loc` is every year's places,
// but for a shape named for another place that year: the Soviet Union's shape drawn for Georgia's war in 1991 is not
// the Soviet Union's own (National Analysis reads `loc`; the page lists a war under the shape it is drawn on each year).
function place(id, loc, years, own) {
  const f = FOUGHT_IN[id];
  if (!f) return { loc };
  const where = f.where ? { where: f.where } : {};
  const named = f.names ? Object.fromEntries(Object.entries(f.names).filter(([y]) => years.includes(+y))) : {};
  const placeNames = Object.keys(named).length ? { placeNames: named } : {};
  if (!f.years) return { loc: f.loc, ...where, ...placeNames };
  const locYears = Object.fromEntries(years.map(y => [y, f.years[y] || own(y)]));
  const ownPlaces = Object.entries(locYears).flatMap(([y, gs]) => gs.filter(gw => named[y]?.[gw] == null));
  return { loc: [...new Set(ownPlaces)], locYears, ...where, ...placeNames };
}

// ---- UCDP/PRIO: one entry per conflict_id, with an intensity per active year (1 = minor, 2 = war).
const UCDP_TYPE = { 1: 'Colonial war', 2: 'Interstate war', 3: 'Civil conflict', 4: 'Internationalised civil conflict' };
// u216, the First Indochina War (1946–54): UCDP's location, "Vietnam (North Vietnam)", names it for a state that came
// in 1954; its name drops the bracket, as UCDP's other colonial wars read ("Laos: Laos", "Kenya: Kenya").
const LOCATION_AS = { 216: 'Vietnam' };
const byId = new Map(), unchecked = [];
const acd = parseCsv(readFileSync(acdPath, 'utf8'));
const versions = [...new Set(acd.map(r => r.version))];
if (versions.join() !== UCDP_VERSION) throw new Error(`UCDP/PRIO ACD version ${versions.join(', ')}, not ${UCDP_VERSION}: update UCDP_VERSION, the sources line below and the page's Sources`);
const partiesOf = r => [...gws(r.gwno_a), ...gws(r.gwno_a_2nd), ...gws(r.gwno_b), ...gws(r.gwno_b_2nd)];
for (const r of acd) {
  const c = byId.get(r.conflict_id) || byId.set(r.conflict_id, { rows: [] }).get(r.conflict_id);
  c.rows.push(r);
}
for (const [id, { rows }] of byId) {
  rows.sort((a, b) => a.year - b.year);
  const last = rows.at(-1), first = rows[0];
  const territory = [...new Set(rows.map(r => r.territory_name).filter(Boolean))].join(', ');
  const name = last.type_of_conflict === '2' ? interstateName(rows) : `${LOCATION_AS[id] || last.location}: ${territory || 'government'}`;
  const sides = k => [...new Set(rows.flatMap(r => [...actors(r[k], r[`${k}_id`]), ...actors(r[`${k}_2nd`])]))];
  if (rows.some(r => r.type_of_conflict === '2') && +first.year > CHECKED_THROUGH && !FOUGHT_IN['u' + id]) unchecked.push('u' + id);
  wars.push({
    id: 'u' + id, src: 'ucdp', name, type: UCDP_TYPE[last.type_of_conflict],
    aim: last.incompatibility === '1' ? 'territory' : last.incompatibility === '2' ? 'government' : 'territory and government',
    years: rows.map(r => [+r.year, +r.intensity_level]),
    ...place('u' + id, [...new Set(rows.flatMap(r => gws(r.gwno_loc)))], rows.map(r => +r.year), y => gws(rows.find(r => +r.year === y).gwno_loc)),
    sideA: sides('side_a'), sideB: sides('side_b'),
    states: [...new Set(rows.flatMap(partiesOf))],
    // A state is a party in the years UCDP's rows name it, not in every year of the conflict (Tonga in Iraq).
    statesYears: Object.fromEntries(rows.map(r => [+r.year, [...new Set(partiesOf(r))].sort((x, y) => x - y)])),
    start: first.start_date, wiki: UCDP_WIKI[id] || null,
  });
}

// ---- Correlates of War, wars active 1926–1945.
const held = HOSTED.find(h => h.file === 'battlefield/history/data/wars.json')?.kind === 'pending';
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
  const w = cowWars.get(num) || cowWars.set(num, { id: 'c' + num, src: 'cow', name, type, years: new Set(), sideA: new Set(), sideB: new Set(), states: new Set(), loc: new Set(), deaths: 0, periods: [] }).get(num);
  years.forEach(y => w.years.add(y));
  part(w);
}
// COW WhereFought codes → regions (1 Americas, 2 Europe, 4 Africa, 6 Middle East, 7 Asia, 9 Oceania).
// A participant counts as fighting on its own territory only if its region is one the war was fought in.
const FOUGHT = { 1: [1], 2: [2], 4: [4], 6: [6], 7: [7], 9: [9], 11: [2, 6], 12: [2, 7], 13: [1, 7], 14: [2, 4, 6], 15: [2, 4, 6, 7], 16: [4, 6, 7, 9], 17: [7, 9], 18: [4, 6], 19: [2, 4, 6, 7, 9] };
const regionOf = c => c < 200 ? 1 : c < 400 ? 2 : c < 630 ? 4 : c < 700 ? 6 : c < 900 ? 7 : 9;
// A participant's dates in a COW inter-state war, as written: its one or two periods ("22 Jun 1941 – 23 Aug 1944").
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cowDay = (m, d, y) => (+y > 0 ? [+d > 0 && +m > 0 ? +d : null, +m > 0 ? MON[+m - 1] : null, +y].filter(Boolean).join(' ') : null);
const periodsOf = r => [[r.StartMonth1, r.StartDay1, r.StartYear1, r.EndMonth1, r.EndDay1, r.EndYear1], [r.StartMonth2, r.StartDay2, r.StartYear2, r.EndMonth2, r.EndDay2, r.EndYear2]]
  .map(([m, d, y, m2, d2, y2]) => [cowDay(m, d, y), cowDay(m2, d2, y2)]).filter(([a]) => a).map(([a, z]) => (z && z !== a ? `${a} – ${z}` : a));
function readCow() {
  for (const r of cow('Inter-StateWarData_v4.0.csv')) addCow(r.WarNum, r.WarName, 'Interstate war', yearsOf(r), w => {
    (r.Side === '1' ? w.sideA : w.sideB).add(r.StateName); w.states.add(+r.ccode);
    w.periods.push({ side: r.Side === '1' ? 'A' : 'B', name: r.StateName, when: periodsOf(r) });
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
}
// A state COW puts on both sides of a war (it changed sides: Italy in 1943, Romania and Bulgaria in 1944) is named on
// each with its dates there, so neither list reads as if it fought on that side throughout.
const dated = (w, side, names) => names.map(n => {
  if (!(w.sideA.has(n) && w.sideB.has(n))) return n;
  const when = w.periods.filter(p => p.side === side && p.name === n).flatMap(p => p.when), label = SIDE_NAMES[w.id.slice(1)]?.[side]?.[n] || n;
  return when.length ? `${label} (${when.join('; ')})` : label;
});
// A state COW names once that was two regimes on the two sides (see SIDE_NOTES).
const SIDE_NAMES = { 139: { B: { France: 'Vichy France' } } };
// Beside the sides where COW's states do not say enough. France: COW has one France, on side A to the fall of France
// and again from the Allies' recognition of the Provisional Government, and on side B in between.
const SIDE_NOTES = {
  139: 'France: COW\'s France on side B (7 Jul 1940 – 14 Jul 1941) is the Vichy regime: COW dates its side-B participation to the armistice in Syria and Lebanon (14 July 1941), though Vichy forces fought the Allies again in Madagascar (May–November 1942) and French North Africa (November 1942), which COW does not count; on side A it is the Third Republic to 22 June 1940 and the Provisional Government from 23 October 1944, when the Allies recognised it. Free France fought with the Allies from June 1940 but was not a state and is not a COW participant (Wikipedia: Vichy France; Free France; Madagascar campaign; Operation Torch).',
};
// Under the hold: the committed rows exactly as they are, places included ("the page stays as it is until Jude
// chooses"). history-fought.mjs's entries for them apply only when the COW files are read again, so a rebuild never
// feeds its own output back through them.
if (held) {
  const rows = (committed?.wars || []).filter(w => w.src === 'cow');
  if (!rows.length) throw new Error('The Correlates of War rows are held (cite-only.mjs: pending), but wars.json holds none to write back');
  if (cowDir) console.warn(`The Correlates of War rows are held (S0): ${cowDir} is not read; the ${rows.length} rows in wars.json are written back.`);
  wars.push(...rows);
} else {
  if (!cowDir) throw new Error('Give the folder with the Correlates of War CSVs');
  readCow();
}
for (const w of cowWars.values()) {
  const years = [...w.years].filter(y => y >= FIRST && y < UCDP_FROM).sort((a, b) => a - b);
  if (!years.length) continue;
  const all = [...w.years].sort((a, b) => a - b);
  const sideA = dated(w, 'A', [...w.sideA].filter(s => s !== '-8')), sideB = dated(w, 'B', [...w.sideB].filter(s => s !== '-8'));
  wars.push({
    id: w.id, src: 'cow', name: w.name, type: w.type, years: years.map(y => [y, 2]),
    span: `${all[0]}–${all.at(-1)}`, ...place(w.id, [...w.loc], years, () => [...w.loc]), states: [...w.states], sideA, sideB,
    ...(SIDE_NOTES[w.id.slice(1)] ? { sideNote: SIDE_NOTES[w.id.slice(1)] } : {}),
    deaths: w.deaths || null, wiki: COW_WIKI[w.id.slice(1)] || null,
  });
}

// ---- The 22 of VM's countries with no CShapes 2.0 border (design/prp-mapkit.js, PRPMapkit.dots('cshapes')): the
// page draws each as the kit's dot from its first day as a state, under the Gleditsch–Ward number UCDP's rows use.
// [gw, from]. gw: for its ten, the Political Retrospective's own codes (hp-retrospective, data/countries.json at commit
// 930b968, keyed by Gleditsch–Ward code); for the other eleven, Kristian Gleditsch and Michael Ward's list of
// microstates (http://ksgleditsch.com/data/microstatessystem.dat, read 17 November 2026), whose codes UCDP's follow:
// UCDP/PRIO ACD v26.1 files Grenada as 55 and Tonga as 972. The Holy See is on neither list, so it has none.
// from: the first day as a state. For the Retrospective's ten, the first day of its leader lists (scripts/leader-lists.mjs
// at 930b968, which start each list on the state's first day); null for the four European microstates that were
// states before 1926, drawn from the page's first year. For the other twelve, Wikidata's inception (P571; where it has
// several, the preferred statement), read 17 November 2026 from https://query.wikidata.org/ (CC0); Wikidata gives
// Tonga's and Samoa's to the year only.
const DOTS = {
  AND: [232, null], ATG: [58, '1981-11-01'], DMA: [54, '1978-11-03'], GRD: [55, '1974-02-07'], KNA: [60, '1983-09-19'],
  LCA: [56, '1979-02-22'], LIE: [223, null], MCO: [221, null], SMR: [331, null], VCT: [57, '1979-10-27'],
  FSM: [987, '1986-11-03'], KIR: [970, '1979-07-12'], MHL: [983, '1986-10-21'], NRU: [971, '1968-01-31'], PLW: [986, '1994-10-01'],
  STP: [403, '1975-07-12'], SYC: [591, '1976-06-29'], TON: [972, '1970'], TUV: [973, '1978-10-01'], VAT: [null, '1929-02-11'],
  VUT: [935, '1980-07-30'], WSM: [990, '1962'],
};
const RETROSPECTIVE_TEN = new Set(['AND', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'LIE', 'MCO', 'SMR', 'VCT']);
const kitDots = globalThis.PRPMapkit.dots('cshapes').map(d => d.iso3).sort();
if (kitDots.join() !== Object.keys(DOTS).sort().join()) throw new Error(`The kit's CShapes dots (${kitDots.join(' ')}) and DOTS differ`);
const borders = JSON.parse(readFileSync(new URL('borders.topo.json', OUT), 'utf8')).objects.borders.geometries.map(g => g.properties);
for (const [iso3, [gw]] of Object.entries(DOTS)) if (gw != null && borders.some(p => p.gw === gw)) throw new Error(`${iso3}: ${gw} has a CShapes shape`);
// Every war-year place is drawn on 1 July of the year: as a CShapes shape, or as a dot (a state CShapes has no border
// for, from its first day); a war-year with no place at all names it (`where`). The held Correlates of War rows are
// written back as they are, so theirs are listed apart (history-fought.mjs records what waits for the hold).
const drawn = (gw, y) => borders.some(p => p.gw === gw && p.s <= `${y}-07-01` && `${y}-07-01` <= p.e)
  || Object.values(DOTS).some(([g, from]) => g === gw && (from == null || from <= `${y}-07-01`));
const unplacedIn = w => w.years.flatMap(([y]) => {
  const gs = w.locYears?.[y] || w.loc;
  return [...gs.filter(gw => !drawn(gw, y)).map(gw => `${w.id} ${y} ${gw}`), ...(gs.length || w.where?.length ? [] : [`${w.id} ${y} (no place)`])];
});
const unplaced = wars.filter(w => !(held && w.src === 'cow')).flatMap(unplacedIn);
if (unplaced.length) console.warn(`War-year places not drawn on 1 July (add them to history-fought.mjs): ${unplaced.join(', ')}`);
const heldUnplaced = held ? wars.filter(w => w.src === 'cow').flatMap(unplacedIn) : [];
if (heldUnplaced.length) console.log(`Held Correlates of War rows (S0) with places not drawn on 1 July, as they stand: ${heldUnplaced.join(', ')}`);

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('wars.json', OUT), JSON.stringify({
  generated: new Date().toISOString(), firstYear: FIRST, ucdpFrom: UCDP_FROM, lastYear: LAST,
  sources: {
    ucdp: 'UCDP/PRIO Armed Conflict Dataset v26.1 (Davies, Pettersson & Öberg 2026; Gleditsch et al. 2002), CC BY 4.0',
    cow: 'Correlates of War Project, Inter-State (v4.0), Intra-State (v4.1) and Extra-State (v4.0) War Data, cited as Sarkees, Meredith Reid and Frank Wayman (2010). Resort to War: 1816–2007. Washington DC: CQ Press (https://correlatesofwar.org/data-sets/cow-war/)',
    dots: 'States with no CShapes 2.0 border: Gleditsch–Ward numbers from the Political Retrospective and from Gleditsch and Ward’s list of microstates (http://ksgleditsch.com/data/microstatessystem.dat); first days from the Retrospective’s leader lists and from Wikidata (inception, CC0)',
  },
  // src: where its first day comes from, for the page to name.
  dots: Object.fromEntries(Object.entries(DOTS).map(([iso3, [gw, from]]) => [iso3, { gw, from, src: RETROSPECTIVE_TEN.has(iso3) ? 'retrospective' : 'wikidata' }])),
  wars,
}));
const n = y => wars.filter(w => w.years.some(([yy]) => yy === y)).length;
console.log(`${wars.length} wars/conflicts; 1926: ${n(1926)}, 1939: ${n(1939)}, 1946: ${n(1946)}, 2025: ${n(2025)}`);
if (unchecked.length) console.warn(`Interstate conflicts newer than ${CHECKED_THROUGH} not yet in history-fought.mjs: ${unchecked.join(', ')}. Run check-fought.mjs with the GED CSV.`);
if (process.argv.includes('--list-cow')) for (const w of wars.filter(w => w.src === 'cow')) console.log(w.id.slice(1), '|', w.name, '|', w.span);
