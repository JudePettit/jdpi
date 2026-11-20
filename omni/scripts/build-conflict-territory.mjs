// Builds the Omni-Map's layer 2, conflict on territory (PRP-SCHOLAR-USP-DESIGN.md 4.2 and stage S5b): each state whose
// territory held an armed conflict in a year, as UCDP/PRIO's Armed Conflict Dataset 26.1 records it (at least 25
// battle-related deaths in the year), with the conflicts' battle-related deaths (best, low and high) from UCDP's Battle-
// Related Deaths Dataset 26.1 from 1989, the count of conflicts each year (the Retrospective Battlefield's count strip,
// a J part of 4.1), and the states fighting outside their own territory as outlines (its B part).
//   node omni/scripts/build-conflict-territory.mjs --acd <UcdpPrioConflict_v26_1.csv> --brd <BattleDeaths_v26_1_conf.csv> [--cache <folder>]
// Both files are CC BY 4.0, downloaded by hand from https://ucdp.uu.se/downloads/ into scratch folders. The Correlates
// of War (1926–1945) is not read (its terms bar commercial use), and neither are PRIO's battle deaths (no licence
// stated): before 1946 the layer holds nothing, and before 1989 it gives no deaths, and its entry says why.
//
// The order of steps:
// 1. Reads both CSV files and the war registry (omni/data/layers/wars/registry.json, built first by build-wars.mjs).
// 2. Names each state by Q-id and ISO3 through VM's crosswalk (ucdp-places.mjs: UCDP's names against Natural Earth's,
//    and the few that differ); a name the crosswalk cannot read stops the build, so none is dropped unseen.
// 3. Asks Wikidata (wbgetentities) for every Q-id it names: its English label checks the id, its ISO3 (P298) must agree
//    with the crosswalk's, and its inception (P571) is the first year VM may draw the state on today's border.
// 4. For each year: the states whose territory held a conflict (its location), each with its conflicts and their
//    intensity (1: 25 to 999 deaths in the year; 2: 1,000 or more), and the states that fought outside their territory
//    (a government on either side, primary or secondary, that is not a location of that conflict).
// 5. Writes omni/data/layers/conflict-territory/conflicts.json and the layer's entry in omni/data/layers.json, and the
//    sources ucdp-acd and ucdp-brd in integration/sources.json. The `built` stamp moves only when the rows change.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csv, entities, keepStamp, sha256, claimIds } from './history-common.mjs';
import { placeResolver, governments, SPECIAL } from './ucdp-places.mjs';
import { warOf } from './build-wars.mjs';
import { arg, stamp, measure, putLayer, putSource } from './layer-catalogue.mjs';
import { wikidataDate, bestClaim } from '../../lake/scripts/dates.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/conflict-territory/conflicts.json');
const LAYERS = join(ROOT, 'omni/data/layers.json');
const SOURCES = join(ROOT, 'integration/sources.json');
const yearOf = v => { const m = /^(-?\d+)/.exec(String(v ?? '')); return m ? +m[1] : null; };
const TYPES = { 1: 'extrasystemic', 2: 'interstate', 3: 'internal', 4: 'internationalised internal' };

/** Step 4: the layer's rows from ACD and BRD rows and a resolver; { places, conflicts, years, unread }. */
export function territoryRows(acd, brd, resolveName, registry) {
  const deaths = new Map(brd.map(r => [`${r.conflict_id}:${r.year}`, [+r.bd_best, +r.bd_low, +r.bd_high]]));
  const places = {}, conflicts = {}, years = {}, unread = new Set();
  const place = (name, y, gw = null) => {
    const p = resolveName(name, y);
    if (!p) { unread.add(name); return null; }
    const e = (places[p.q] ||= { q: p.q, iso3: p.iso3, ucdp: name });
    if (gw && !e.gw) e.gw = gw;
    return p.q;
  };
  for (const r of acd) {
    const id = +r.conflict_id, y = +r.year;
    conflicts[id] ||= { n: null, inc: r.incompatibility === '1' ? 'territory' : r.incompatibility === '2' ? 'government' : 'both', terr: r.territory_name || null, type: TYPES[r.type_of_conflict] || r.type_of_conflict, wars: {} };
    const war = warOf(registry, id, y);
    if (war) conflicts[id].wars[y] = war;
    const locs = r.location.split(/,\s*/);
    // A single location: UCDP's own Gleditsch and Ward number for it, kept only as the Retrospective Battlefield's link
    // parameter (its address names a country by it), never to join a value.
    const qs = locs.map(n => place(n, y, locs.length === 1 ? r.gwno_loc : null)).filter(Boolean);
    const sides = [r.side_a, r.side_a_2nd, r.side_b, r.side_b_2nd].flatMap(governments);
    const abroad = [...new Set(sides.map(n => place(n, y)).filter(q => q && !qs.includes(q)))];
    const Y = (years[y] ||= { t: {}, a: {}, c: {} });
    const d = y >= 1989 ? deaths.get(`${id}:${y}`) : null;
    Y.c[id] = d ? [+r.intensity_level, ...d] : [+r.intensity_level];
    for (const q of qs) (Y.t[q] ||= []).push(id);
    for (const q of abroad) (Y.a[q] ||= []).push(id);
  }
  return { places, conflicts, years, unread: [...unread] };
}

async function main() {
  const acdFile = arg('--acd'), brdFile = arg('--brd'), cache = arg('--cache');
  for (const [f, n] of [[acdFile, '--acd <UcdpPrioConflict_v26_1.csv>'], [brdFile, '--brd <BattleDeaths_v26_1_conf.csv>']]) if (!f || !existsSync(f)) { console.error(`Give ${n}, downloaded from https://ucdp.uu.se/downloads/`); process.exit(1); }
  const acdBuf = readFileSync(acdFile), brdBuf = readFileSync(brdFile);
  const acd = csv(acdBuf.toString('utf8')), brd = csv(brdBuf.toString('utf8'));
  if (!acd.every(r => r.version === '26.1') || !brd.every(r => r.version === '26.1')) throw new Error('Not version 26.1 throughout');
  const registry = JSON.parse(readFileSync(join(ROOT, 'omni/data/layers/wars/registry.json'), 'utf8'));
  const topo = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/countries.topo.json'), 'utf8'));
  const small = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/small-states.json'), 'utf8')).points;
  const resolveName = placeResolver([...topo.objects.countries.geometries.map(g => g.properties), ...small]);
  const out = territoryRows(acd, brd, resolveName, registry);
  if (out.unread.length) { console.error(`VM's crosswalk cannot read these UCDP names: ${out.unread.join('; ')}. Add them to ucdp-places.mjs.`); process.exit(1); }
  // Step 3: each Q-id checked on Wikidata.
  const got = await entities(Object.keys(out.places), { props: 'claims|labels', cache, tag: 'ct' });
  for (const [q, p] of Object.entries(out.places)) {
    const e = got[q];
    if (!e) throw new Error(`Wikidata holds no ${q} (UCDP's "${p.ucdp}")`);
    p.n = e.labels?.en?.value || p.ucdp;
    const iso = (e.claims?.P298 || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value);
    if (p.iso3 && iso.length && !iso.includes(p.iso3)) throw new Error(`${q}: Wikidata's ISO3 ${iso.join(', ')} is not the crosswalk's ${p.iso3}`);
    const inc = wikidataDate(bestClaim(e.claims?.P571));
    p.since = yearOf(inc?.v);
    p.src = { id: 'wikidata', loc: `${q}#P571` };
  }
  // The crosswalk's own choices, with Wikidata's names for them, for the reader of the build's log to check.
  for (const [n, rs] of Object.entries(SPECIAL)) for (const r of rs) if (out.places[r.q]) console.log(`  ${n} ${r.from ?? ''}–${r.to ?? ''}: ${r.q} ${out.places[r.q].n}`);
  // VM's names of the conflicts (battlefield/history/data/wars.json, its UCDP rows only), else UCDP's location.
  const wj = JSON.parse(readFileSync(join(ROOT, 'battlefield/history/data/wars.json'), 'utf8'));
  const names = Object.fromEntries(wj.wars.filter(w => w.src === 'ucdp' && /^u\d+$/.test(w.id)).map(w => [+w.id.slice(1), w.name]));
  for (const [id, c] of Object.entries(out.conflicts)) c.n = names[id] || acd.find(r => +r.conflict_id === +id).location;
  const ys = Object.keys(out.years).map(Number).sort((a, b) => a - b);
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const body = {
    layer: 'conflict-territory', format: 'vm-territory/1', source: 'ucdp-acd', built: null, from: ys[0], to: ys.at(-1),
    about: 'VM’s own text. The states whose territory held an armed conflict each year (UCDP/PRIO Armed Conflict Dataset 26.1: at least 25 battle-related deaths in the year), with each conflict’s intensity and, from 1989, its battle-related deaths (UCDP Battle-Related Deaths Dataset 26.1, conflict level: best, low and high), and the states fighting outside their own territory. States are named by Wikidata Q-id and ISO3 through VM’s crosswalk of UCDP’s names.',
    files: { 'ucdp-acd': { file: basename(acdFile), sha256: sha256(acdBuf), url: 'https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip' }, 'ucdp-brd': { file: basename(brdFile), sha256: sha256(brdBuf), url: 'https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip' } },
    intensity: { 1: '25 to 999 battle-related deaths in the year', 2: '1,000 or more battle-related deaths in the year' },
    places: Object.fromEntries(Object.entries(out.places).sort(([a], [b]) => +a.slice(1) - +b.slice(1))),
    conflicts: out.conflicts,
    years: Object.fromEntries(ys.map(y => [y, out.years[y]])) };
  const file = { ...body, built: keepStamp(prev, body, stamp()) };
  const text = JSON.stringify(file) + '\n';
  mkdirSync(join(ROOT, 'omni/data/layers/conflict-territory'), { recursive: true });
  writeFileSync(OUT, text);
  const m = measure(text);
  console.log(`conflicts.json: ${ys[0]}–${ys.at(-1)}, ${Object.keys(out.places).length} states, ${Object.keys(out.conflicts).length} conflicts; ${m.bytes} bytes, ${m.gzip} gzipped; built ${file.built}`);
  putSource(SOURCES, ACD_SOURCE); putSource(SOURCES, BRD_SOURCE);
  putLayer(LAYERS, entry(file, m));
}

const UCDP_TERMS = 'All datasets are free of charge and licensed under CC BY 4.0 — you are free to use and redistribute them provided you cite the relevant publications listed with each dataset.';
export const ACD_SOURCE = { id: 'ucdp-acd',
  citation: 'Davies, Shawn, Therése Pettersson and Magnus Öberg (2026). Organized violence 1989–2025. Journal of Peace Research; Gleditsch, Nils Petter, Peter Wallensteen, Mikael Eriksson, Margareta Sollenberg and Håvard Strand (2002). Armed Conflict 1946–2001: A New Dataset. Journal of Peace Research 39(5): 615–637',
  short: 'UCDP/PRIO ACD', version: '26.1', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  url: 'https://ucdp.uu.se/downloads/', file: 'https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip', accessed: '2026-11-20',
  terms: 'host', termsUrl: 'https://ucdp.uu.se/downloads/', termsQuote: UCDP_TERMS, termsRead: '2026-11-20',
  databaseRight: 'CC BY 4.0 licenses the sui generis database right as well as copyright.',
  credit: 'UCDP/PRIO Armed Conflict Dataset 26.1, CC BY 4.0',
  changes: 'UCDP’s state names joined to Wikidata Q-ids and ISO3 codes by VM’s crosswalk; each state-year’s conflicts gathered, with the states fighting outside their own territory (omni/scripts/build-conflict-territory.mjs).' };
export const BRD_SOURCE = { id: 'ucdp-brd',
  citation: 'Davies, Shawn, Therése Pettersson and Magnus Öberg (2026). Organized violence 1989–2025. Journal of Peace Research; UCDP Battle-Related Deaths Dataset version 26.1 (conflict level)',
  short: 'UCDP BRD', version: '26.1', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  url: 'https://ucdp.uu.se/downloads/', file: 'https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip', accessed: '2026-11-20',
  terms: 'host', termsUrl: 'https://ucdp.uu.se/downloads/', termsQuote: UCDP_TERMS, termsRead: '2026-11-20',
  databaseRight: 'CC BY 4.0 licenses the sui generis database right as well as copyright.',
  credit: 'UCDP Battle-Related Deaths Dataset 26.1, CC BY 4.0',
  changes: 'Each conflict-year’s best, low and high battle-related deaths set beside its ACD row (omni/scripts/build-conflict-territory.mjs).' };

/** The catalogue entry of layer 2. */
export function entry(file, m) {
  return {
    id: 'conflict-territory', module: 'battlefield-history', title: 'Conflict on territory', role: 'fill', geometry: 'polygon',
    time: { field: 'year', from: file.from, to: file.to, step: 'y', precision: 'year' },
    data: 'omni/data/layers/conflict-territory/conflicts.json', on: 'states',
    space: 'each state on Cliopatria’s border for the year, else on Natural Earth’s border of today from the state’s inception; a state neither holds is listed',
    measure: 'armed conflicts on a state’s territory in the year, by intensity (UCDP: at least 25 battle-related deaths a year)',
    status: 'recorded', style: { kind: 'states', classes: [{ v: 1, label: 'Minor conflict: 25 to 999 battle-related deaths in the year' }, { v: 2, label: 'War: 1,000 or more battle-related deaths in the year' }], abroad: 'Fighting outside its own territory (outlined)' },
    gap: { before: file.from, text: 'Before 1946 VM holds no free conflict data: the Correlates of War, which covers 1926–1945, says “Data are not to be used for any commercial activity” (https://correlatesofwar.org/data-sets/, read 18 November 2026)' },
    legend: 'Conflict on territory: UCDP/PRIO Armed Conflict Dataset 26.1 and UCDP Battle-Related Deaths Dataset 26.1 (CC BY 4.0), on Cliopatria v0.2.1 (CC BY 4.0) or Natural Earth (public domain) – processed by Vitruvian Manager',
    source: 'ucdp-acd',
    method: 'VM’s own text. A state is filled in a year when UCDP/PRIO’s Armed Conflict Dataset 26.1 records an armed conflict on its territory that year: a contested incompatibility over government or territory, between two parties of which at least one is a state’s government, with at least 25 battle-related deaths in the year (UCDP’s threshold). The stronger colour is a war, 1,000 or more deaths in the year. From 1989 each conflict’s battle-related deaths are UCDP’s Battle-Related Deaths Dataset 26.1 (conflict level), its best estimate with its low and high; before 1989 VM gives none, because the only series, PRIO’s Battle Deaths Dataset, states no licence. A state that fought outside its own territory that year (a government on either side, primary or secondary, that is not a location of the conflict) is outlined. UCDP names each state by today’s name with the older one in brackets (“Vietnam (North Vietnam)”); VM joins the names to Wikidata Q-ids and ISO3 codes through its own crosswalk, checked on Wikidata at each build, never by a Gleditsch and Ward number. Each state is drawn on Cliopatria’s border for the year, where VM’s crosswalk of Cliopatria holds it, else on Natural Earth’s border of today from the year Wikidata gives as the state’s inception; a state neither holds is listed beside the map, never drawn on a guessed shape. Before 1946 the layer is empty: the Correlates of War, which covers 1926–1945, bars commercial use. 2026 is not in this layer: UCDP’s Candidate Events, which cover it, give counts of events by country and month, not the conflicts and their intensity this layer draws; the layer “Organised violence, UCDP events” shows 2026 from them, marked candidate.',
    open: true, pinnable: true, built: file.built,
    files: [{ file: 'omni/data/layers/conflict-territory/conflicts.json', ...m }],
    gw: 'link only: the Retrospective Battlefield’s address names a country by UCDP’s Gleditsch and Ward number (c=), so each state keeps the number UCDP gives it, for that link alone',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
