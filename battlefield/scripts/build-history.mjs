// Builds the Retrospective Battlefield's data: battlefield/history/data/wars.json (every war and armed conflict,
// 1926–2025) and battlefield/history/data/places.json (where the page draws each place, year by year).
//   node --max-old-space-size=6000 battlefield/scripts/build-history.mjs <UcdpPrioConflict_v26_1.csv> [--cache <folder>]
// Sources, all free (stage J1, 20 November 2026):
//   · 1946–2025: UCDP/PRIO Armed Conflict Dataset v26.1 (CC BY 4.0), conflict-years with at least 25 battle deaths,
//     downloaded by hand from https://ucdp.uu.se/downloads/ (ucdpprio/ucdp-prio-acd-261-csv.zip).
//   · 1926–1945: Wikidata (CC0) and English Wikipedia's article titles (CC BY-SA 4.0), by VM's rule (wars-1926.mjs).
//   · Borders: Cliopatria v0.2.1 (CC BY 4.0) as VM holds it (omni/data/borders/1900-1999 and 2000-2024.topo.json,
//     with VM's crosswalk qids.json). Natural Earth (public domain: omni/data/base/countries.topo.json and
//     small-states.json) gives each place's ISO3 and, from 1946, the point of a small state UCDP names as a party that
//     year; its borders of today are never drawn for a past year (fixer, 20 November 2026: a border of today is a
//     guessed shape for 1941, and named states that did not exist yet, Israel in 1938).
// No Correlates of War file, no CShapes border and no Gleditsch–Ward number is read as a join: places are Wikidata
// Q-ids. UCDP's own Gleditsch–Ward numbers are kept only in the table of old addresses (`oldCountries`, below), so a
// link written before this change (c=365) still opens the same country; nothing is joined by them.
// The order of steps (nothing is written until every step has worked):
// 1. Reads the ACD file (version 26.1), Cliopatria's two files of the years, qids.json and Natural Earth's countries.
// 2. UCDP: one war per conflict_id with an intensity per active year (1 minor, 2 war); its places (`loc`, the location)
//    and its state parties by year (`statesYears`, the governments on either side), each UCDP name read as a Q-id
//    through VM's crosswalk (omni/scripts/ucdp-places.mjs); a name the crosswalk cannot read stops the build.
// 3. Wikidata: the wars of 1926–1945 (wars-1926.mjs), at level 3 for every active year ("a war Wikidata lists").
// 4. history-fought.mjs's places where the sources' are too wide or missing; then, year by year, a place Cliopatria
//    draws under another Q-id (history-places.mjs AS: one state under two Q-ids only, never another state or a part
//    standing in; empty since review X1, 21 November 2026).
// 5. Every place's Q-id asked of Wikidata (wbgetentities): its English label is the page's name for it, its ISO3
//    (P298) must agree with Natural Earth's, and its inception (P571, the earliest) is kept as `since` when it falls
//    after 1926, so the page can call a place named for a year before it "today’s …".
// 6. Where the page draws each place each year (places.json): Cliopatria's rows of the year (2025 on 2024's rows, the
//    last Cliopatria holds), each row's place by history-places.mjs; from 1946, a small state no row holds as Natural
//    Earth's point (`points`); any other war place no row holds that year is listed as one VM cannot place
//    (`unplaced`), which the page names under the map. No place is drawn on a border of today.
// 7. Old addresses: w=c<number> (a Correlates of War war) opens the same war where the new list holds it (by its
//    Wikipedia title, history-wiki.mjs), or the whole war it is part of (oldWithin); c=<number> opens the country UCDP's own rows give that number.
// 8. Writes both files.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv } from './csv.mjs';
import { COW_WIKI, UCDP_WIKI } from './history-wiki.mjs';
import { FOUGHT_IN, CHECKED_THROUGH } from './history-fought.mjs';
import { actors, interstateName } from './ucdp.mjs';
import { rowQid, drawnRow, canonical, placeAt, CANONICAL, NAMED_AS } from './history-places.mjs';
import { fetchWars, selectWars, THEN, FIRST as WD_FIRST, LAST as WD_LAST } from './wars-1926.mjs';
import { placeResolver, governments, SPECIAL } from '../../omni/scripts/ucdp-places.mjs';
import { entities, byTitles, sha256 } from '../../omni/scripts/history-common.mjs';
import '../../design/prp-map.js';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const acdPath = process.argv[2];
const CACHE = arg('--cache') || join(tmpdir(), 'battlefield-history-src');
mkdirSync(CACHE, { recursive: true });
const FIRST = 1926, UCDP_FROM = 1946, LAST = 2025, BORDERS_TO = 2024;
const UCDP_VERSION = '26.1';
const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('../history/data/', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const M = globalThis.PRPMap;
if (!acdPath || !existsSync(acdPath)) { console.error('Give the UCDP/PRIO ACD v26.1 CSV, downloaded from https://ucdp.uu.se/downloads/'); process.exit(1); }

// ---- 1. Inputs
const acdBuf = readFileSync(acdPath);
const acd = parseCsv(acdBuf.toString('utf8'));
const versions = [...new Set(acd.map(r => r.version))];
if (versions.join() !== UCDP_VERSION) throw new Error(`UCDP/PRIO ACD version ${versions.join(', ')}, not ${UCDP_VERSION}: update UCDP_VERSION, the sources line below and the page's Sources`);
const BORDER_FILES = ['omni/data/borders/1900-1999.topo.json', 'omni/data/borders/2000-2024.topo.json'];
const fcs = BORDER_FILES.map(f => M.decode(J(f)));
const fcAt = y => fcs[Math.min(y, BORDERS_TO) < 2000 ? 0 : 1];
const qids = J('omni/data/borders/qids.json');
const ne = J('omni/data/base/countries.topo.json').objects.countries.geometries.map(g => g.properties);
const small = J('omni/data/base/small-states.json').points;
const resolveName = placeResolver([...ne, ...small]);

// ---- 2. UCDP
const UCDP_TYPE = { 1: 'Colonial war', 2: 'Interstate war', 3: 'Civil conflict', 4: 'Internationalised civil conflict' };
// u216, the First Indochina War (1946–54): UCDP's location, "Vietnam (North Vietnam)", names it for a state that came
// in 1954; its name drops the bracket, as UCDP's other colonial wars read ("Laos: Laos", "Kenya: Kenya").
const LOCATION_AS = { 216: 'Vietnam' };
const unread = new Set(), unchecked = [];
const qOf = (name, y) => { const p = resolveName(name, y); if (!p) unread.add(name); return p?.q || null; };
const locQs = r => r.location.split(/,\s*/).map(n => qOf(n, +r.year)).filter(Boolean);
const partyQs = r => [...new Set([r.side_a, r.side_a_2nd, r.side_b, r.side_b_2nd].flatMap(governments).map(n => qOf(n, +r.year)).filter(Boolean))];
const byId = new Map();
for (const r of acd) (byId.get(r.conflict_id) || byId.set(r.conflict_id, []).get(r.conflict_id)).push(r);
const wars = [];
// A war's places: the sources' (`loc`), unless history-fought.mjs has its own: `loc`, `where` (names for places the
// map has no shape for) and places by year (`locYears`; a year it does not list keeps the sources', own(year)).
function place(id, loc, years, own) {
  const f = FOUGHT_IN[id];
  if (!f) {
    // A place whose name UCDP reads as another state in some years (the Soviet Union, then Russia) is kept by year.
    const by = Object.fromEntries(years.map(y => [y, own(y)]));
    return new Set(Object.values(by).map(l => l.join())).size > 1 ? { loc, locYears: by } : { loc };
  }
  const where = f.where ? { where: f.where } : {};
  if (!f.years) return { loc: f.loc, ...where };
  const locYears = Object.fromEntries(years.map(y => [y, f.years[y] || own(y)]));
  return { loc: [...new Set(Object.values(locYears).flat())], locYears, ...where };
}
for (const [id, rows] of byId) {
  rows.sort((a, b) => a.year - b.year);
  const last = rows.at(-1), first = rows[0];
  const territory = [...new Set(rows.map(r => r.territory_name).filter(Boolean))].join(', ');
  const name = last.type_of_conflict === '2' ? interstateName(rows) : `${LOCATION_AS[id] || last.location}: ${territory || 'government'}`;
  const sides = k => [...new Set(rows.flatMap(r => [...actors(r[k], r[`${k}_id`]), ...actors(r[`${k}_2nd`])]))];
  if (rows.some(r => r.type_of_conflict === '2') && +first.year > CHECKED_THROUGH && !FOUGHT_IN['u' + id]) unchecked.push('u' + id);
  const own = y => locQs(rows.find(r => +r.year === y));
  wars.push({
    id: 'u' + id, src: 'ucdp', name, type: UCDP_TYPE[last.type_of_conflict],
    aim: last.incompatibility === '1' ? 'territory' : last.incompatibility === '2' ? 'government' : 'territory and government',
    years: rows.map(r => [+r.year, +r.intensity_level]),
    ...place('u' + id, [...new Set(rows.flatMap(locQs))], rows.map(r => +r.year), own),
    sideA: sides('side_a'), sideB: sides('side_b'),
    states: [...new Set(rows.flatMap(partyQs))],
    // A state is a party in the years UCDP's rows name it, not in every year of the conflict (Tonga in Iraq).
    statesYears: Object.fromEntries(rows.map(r => [+r.year, partyQs(r)])),
    start: first.start_date, wiki: UCDP_WIKI[id] || null,
  });
}
if (unread.size) throw new Error(`VM's crosswalk cannot read these UCDP names: ${[...unread].join('; ')}. Add them to omni/scripts/ucdp-places.mjs.`);

// ---- 3. Wikidata, 1926–1945
const focusIndex = J('battlefield/focus/data/index.json');
const keep = focusIndex.wars.filter(w => w.start < `${UCDP_FROM}` && w.qid).map(w => w.qid);
const PLACEABLE = new Set([...ne.map(p => p.q), ...small.map(p => p.q), ...Object.keys(qids.entries).map(canonical), ...Object.values(CANONICAL), ...Object.values(SPECIAL).flat().map(x => x.q), ...Object.values(THEN)].filter(Boolean));
const fetched = await fetchWars({ cache: CACHE, keep });
const placedByHand = new Set(Object.keys(FOUGHT_IN).filter(id => /^Q\d+$/.test(id) && FOUGHT_IN[id].loc?.length));
const { wars: listed, left } = selectWars({ ...fetched, isPlace: q => PLACEABLE.has(q), keep: new Set(keep), placed: placedByHand });
const classes = await entities([...new Set(listed.map(w => w.cls[0]).filter(Boolean))], { props: 'labels', cache: CACHE, tag: 'bf26c' });
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
for (const w of listed) {
  const years = []; for (let y = Math.max(w.from, WD_FIRST); y <= Math.min(w.to, WD_LAST); y++) years.push([y, 3]);
  const own = () => w.loc;
  const p = place(w.q, w.loc, years.map(([y]) => y), own);
  const where = [...new Set([...(p.where || []), ...(p.loc.length || p.locYears ? [] : w.where)])];
  wars.push({
    id: w.q, src: 'wikidata', q: w.q, name: w.n, type: cap(classes[w.cls[0]]?.labels?.en?.value) || 'War', years,
    span: w.from === w.to ? `${w.from}` : `${w.from}–${w.to}`,
    loc: p.loc, ...(p.locYears ? { locYears: p.locYears } : {}), ...(where.length ? { where } : {}),
    sideA: [], sideB: [], states: [...new Set([...w.states, ...p.loc])],
    statesYears: Object.fromEntries(years.map(([y]) => [y, [...new Set([...w.states, ...(p.locYears?.[y] || p.loc)])]])),
    start: w.start, end: w.end, wiki: w.wiki,
  });
}
console.log(`Wikidata, ${WD_FIRST}–${WD_LAST}: ${fetched.candidates} candidates, ${listed.length} wars listed, ${left.length} left out`);
for (const l of left) console.log(`  left out: ${l.q} ${l.n}: ${l.why}`);
const unusedFought = Object.keys(FOUGHT_IN).filter(id => !wars.some(w => w.id === id));
if (unusedFought.length) console.warn(`history-fought.mjs entries for wars not on the list: ${unusedFought.join(', ')}`);

// ---- 4b. A place Cliopatria draws under another Q-id in a year (history-places.mjs AS: one state under two Q-ids;
// none at present): the war's places by year are rewritten, so the map and the counts agree.
const yearsOf = w => w.years.map(([y]) => y);
for (const w of wars) {
  const ys = yearsOf(w);
  const locBy = Object.fromEntries(ys.map(y => [y, [...new Set((w.locYears?.[y] || w.loc).map(q => placeAt(q, y)))]]));
  const stBy = Object.fromEntries(ys.map(y => [y, [...new Set((w.statesYears?.[y] || []).map(q => placeAt(q, y)))]]));
  if (w.locYears || ys.some(y => locBy[y].join() !== w.loc.join())) { w.locYears = locBy; w.loc = [...new Set(Object.values(locBy).flat())]; }
  if (w.statesYears) { w.statesYears = stBy; w.states = [...new Set([...Object.values(stBy).flat()])]; }
}

// ---- 5. Every place checked on Wikidata
const placesIn = (w, y) => [...new Set([...(w.locYears?.[y] || w.loc), ...(w.statesYears?.[y] || [])])];
const allPlaces = new Set(wars.flatMap(w => yearsOf(w).flatMap(y => placesIn(w, y))));
const rowQs = new Map(); // row id → [[from, to, Q]]
const rowsOfYear = new Map();
for (let y = FIRST; y <= LAST; y++) {
  const yb = Math.min(y, BORDERS_TO), list = [];
  for (const f of M.sliceAt(fcAt(y), yb)) {
    if (!drawnRow(f)) continue;
    const q = rowQid(qids, f.properties.n, yb, M.qidFor);
    list.push([f.id, q]);
    if (y > BORDERS_TO) continue;
    const runs = rowQs.get(f.id) || rowQs.set(f.id, []).get(f.id), lastRun = runs.at(-1);
    if (lastRun && lastRun[2] === q && lastRun[1] === yb - 1) lastRun[1] = yb; else runs.push([yb, yb, q]);
    if (q) allPlaces.add(q);
  }
  rowsOfYear.set(y, list);
}
const got = await entities([...allPlaces], { props: 'claims|labels', cache: CACHE, tag: 'bfpl' });
// A place keyed by a later state's item carries its earlier states' names (history-places.mjs NAMED_AS): each earlier
// item's English label and the year Wikidata ends it (P576), oldest first. A year takes the name it began with.
const earlier = await entities(Object.values(NAMED_AS).flat(), { props: 'claims|labels', cache: CACHE, tag: 'bfwas' });
const wasOf = q => (NAMED_AS[q] || []).map(id => {
  const e = earlier[id], to = (e?.claims?.P576 || []).filter(c => c.rank !== 'deprecated').map(c => /^\+?(-?\d+)-/.exec(c.mainsnak?.datavalue?.value?.time || '')?.[1]).filter(Boolean).map(Number);
  if (!e?.labels?.en?.value || !to.length) throw new Error(`Wikidata gives ${id} no English label or no end (P576), so ${q}'s earlier name has no last year`);
  return { n: e.labels.en.value, to: Math.max(...to) };
});
for (const q of Object.keys(NAMED_AS)) {
  if (!allPlaces.has(q)) throw new Error(`NAMED_AS names ${q}, which is not a place`);
  if (wasOf(q).some((w, i, l) => i && w.to <= l[i - 1].to)) throw new Error(`${q}: its earlier names are not oldest first`);
}
const neBy = new Map(ne.filter(p => p.q).map(p => [p.q, p])), smallBy = new Map(small.filter(p => p.q).map(p => [p.q, p]));
const places = {};
for (const q of [...allPlaces].sort((a, b) => +a.slice(1) - +b.slice(1))) {
  const e = got[q];
  if (!e || e.missing != null) throw new Error(`Wikidata holds no ${q}`);
  const iso = (e.claims?.P298 || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value);
  const nat = neBy.get(q) || smallBy.get(q);
  // Kosovo has no ISO 3166 code: Natural Earth and Wikidata each use a user-assigned X code, so X codes are not compared.
  if (nat?.iso3 && iso.length && !iso.includes(nat.iso3) && !/^X/.test(nat.iso3)) throw new Error(`${q}: Wikidata's ISO3 ${iso.join(', ')} is not Natural Earth's ${nat.iso3}`);
  const since = (e.claims?.P571 || []).filter(c => c.rank !== 'deprecated').map(c => /^\+?(-?\d+)-/.exec(c.mainsnak?.datavalue?.value?.time || '')?.[1]).filter(Boolean).map(Number);
  places[q] = { n: e.labels?.en?.value || nat?.n || q, ...(nat?.iso3 || iso[0] ? { iso3: nat?.iso3 || iso[0] } : {}),
    ...(since.length && Math.min(...since) > FIRST ? { since: Math.min(...since) } : {}), ...(NAMED_AS[q] ? { was: wasOf(q) } : {}) };
}

// ---- 6. Where each war place is drawn each year: a Cliopatria row; from 1946 a small state's point; else unplaced
const points = {}, unplaced = {};
for (let y = FIRST; y <= LAST; y++) {
  const onRows = new Set(rowsOfYear.get(y).map(([, q]) => q).filter(Boolean));
  const need = new Set(wars.filter(w => yearsOf(w).includes(y)).flatMap(w => placesIn(w, y)));
  for (const q of [...need].sort()) {
    if (onRows.has(q)) continue;
    const s = smallBy.get(q);
    if (s && y >= UCDP_FROM) (points[y] ||= {})[q] = s.id;
    else (unplaced[y] ||= []).push(q);
  }
}
const unplacedCount = Object.values(unplaced).reduce((s, l) => s + l.length, 0);
console.log(`Places: ${Object.keys(places).length}; war-year places as Natural Earth's point: ${Object.values(points).reduce((s, o) => s + Object.keys(o).length, 0)}; that VM cannot place: ${unplacedCount}`);
for (const [y, qs] of Object.entries(unplaced)) console.log(`  ${y}: VM cannot place ${qs.map(q => `${q} ${places[q]?.n}`).join(', ')}`);

// ---- 7. Old addresses
const titles = await byTitles(Object.values(COW_WIKI), { cache: CACHE });
const onList = new Set(wars.map(w => w.id));
// A war the new list holds as part of a whole one (the Franco-Thai War, within World War II) opens the whole, and
// the page says so (oldWithin); one it does not hold at all is named (oldGone).
const oldIds = {}, oldWithin = {}, oldGone = {};
const byWiki = new Map(wars.filter(w => w.src === 'ucdp' && w.wiki).map(w => [w.wiki, w.id]));
const wholeOf = new Map(left.filter(l => l.whole).map(l => [l.q, l.whole]));
for (const [num, title] of Object.entries(COW_WIKI)) {
  const q = titles[title];
  if (q && onList.has(q)) oldIds['c' + num] = q;
  else if (byWiki.has(title)) oldIds['c' + num] = byWiki.get(title); // a UCDP conflict by its Wikipedia title (1946–)
  else if (q && onList.has(wholeOf.get(q))) oldWithin['c' + num] = [wholeOf.get(q), title];
  else oldGone['c' + num] = title;
}
// War Focus's old links to the Battlefield (bf c700 …) name the same Correlates of War numbers, through COW_WIKI.
const oldCountries = {};
const gwList = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0);
for (const r of acd) {
  const locs = r.location.split(/,\s*/), gl = gwList(r.gwno_loc);
  const note = (gw, name) => {
    const q = qOf(name, +r.year); if (!q) return;
    const m = (oldCountries[gw] ||= new Map()), s = m.get(q) || [+r.year, +r.year];
    m.set(q, [Math.min(s[0], +r.year), Math.max(s[1], +r.year)]);
  };
  if (locs.length === 1 && gl.length === 1) note(gl[0], locs[0]);
  // A side of one state and one number (UCDP's lists of several are not in the same order as their names).
  for (const [k, g] of [['side_a', 'gwno_a'], ['side_b', 'gwno_b'], ['side_a_2nd', 'gwno_a_2nd'], ['side_b_2nd', 'gwno_b_2nd']]) {
    const gs = governments(r[k]), gn = gwList(r[g]);
    if (gs.length === 1 && gn.length === 1) note(gn[0], gs[0]);
  }
}
// A number UCDP gave two places over time (365: the Soviet Union to 1991, then Russia) is kept with each one's years
// in UCDP's rows, [[first, last, Q], …]; the page opens the one of the year shown (before the first, the first;
// after the last, the last; between two, the later from its inception, the earlier before it: history/old-countries.js).
const oldC = Object.fromEntries(Object.entries(oldCountries).map(([gw, m]) => {
  const runs = [...m].map(([q, [f, t]]) => [f, t, q]).sort((a, b) => a[0] - b[0]);
  return [gw, runs.length === 1 ? runs[0][2] : runs];
}).sort((a, b) => +a[0] - +b[0]));

// ---- 8. Write
wars.sort((a, b) => (a.years[0][0] - b.years[0][0]) || (a.id < b.id ? -1 : 1));
const sources = {
  ucdp: 'UCDP/PRIO Armed Conflict Dataset v26.1 (Davies, Pettersson & Öberg 2026; Gleditsch et al. 2002), CC BY 4.0',
  wikidata: 'Wikidata (CC0): the wars of 1926–1945 by VM’s rule (battlefield/scripts/wars-1926.mjs), with their dates, countries, locations and participants; English Wikipedia (CC BY-SA 4.0) for their titles',
  borders: 'Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager; Natural Earth (public domain) for the points of small states from 1946',
};
const warsDoc = { generated: new Date().toISOString(), format: 'vm-battlefield-wars/2', firstYear: FIRST, ucdpFrom: UCDP_FROM, lastYear: LAST,
  files: { 'ucdp-acd': { file: acdPath.split(/[\\/]/).pop(), sha256: sha256(acdBuf), url: 'https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip' } },
  levels: { 1: 'Minor conflict: 25 to 999 battle-related deaths in the year (UCDP)', 2: 'War: 1,000 or more battle-related deaths in the year (UCDP)', 3: 'A war Wikidata lists, 1926–1945; its intensity is not coded' },
  sources, oldIds, oldWithin, oldGone, wars };
const placesDoc = { generated: warsDoc.generated, format: 'vm-battlefield-places/2', borders: BORDER_FILES, bordersTo: BORDERS_TO,
  about: 'VM’s own work. Each Cliopatria row’s place by year (battlefield/scripts/history-places.mjs); from 1946, each small state that no row holds in a year, as Natural Earth’s point (points: year → Q-id → point id); and, each year, the war places VM cannot place on a free border (unplaced). No place is drawn on a border of today. A place’s `since` is its inception on Wikidata, where after 1926.',
  places, rows: Object.fromEntries([...rowQs].map(([id, runs]) => [id, runs.length === 1 && runs[0][2] ? runs[0][2] : runs])), points, unplaced, oldCountries: oldC };
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('wars.json', OUT), JSON.stringify(warsDoc));
writeFileSync(new URL('places.json', OUT), JSON.stringify(placesDoc));
const n = y => wars.filter(w => w.years.some(([yy]) => yy === y)).length;
console.log(`${wars.length} wars/conflicts; 1926: ${n(1926)}, 1939: ${n(1939)}, 1946: ${n(1946)}, 2025: ${n(2025)}; old war ids kept ${Object.keys(oldIds).length}, within a whole ${Object.keys(oldWithin).length}, gone ${Object.keys(oldGone).length}; old country numbers ${Object.keys(oldC).length}`);
if (unchecked.length) console.warn(`Interstate conflicts newer than ${CHECKED_THROUGH} not yet in history-fought.mjs: ${unchecked.join(', ')}. Run check-fought.mjs with the GED CSV.`);
