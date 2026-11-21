// The wars of 1926–1945 for the Retrospective Battlefield, from Wikidata (CC0) and English Wikipedia's titles
// (CC BY-SA 4.0): VM's own list, chosen by the rule below, never matched against another list of wars. It replaces the
// Correlates of War rows, whose terms bar commercial use (stage J1, Jude's decision of 17 November 2026: "let's use
// only free data if possible").
// The rule (VM's own, 20 November 2026):
//   · an item that is an instance of war (Q198) or of a subclass of it (a civil war, a world war, a border conflict…),
//     or an instance of rebellion (Q124734), revolt (Q6107280) or peasant revolt (Q13427116) itself that lasted 30
//     days or more by its start and end (a rising of a day or a week is not a war; one with a single date, or with
//     both dates in the same year and dated only to the year, cannot be shown to have lasted 30 days and is left out);
//   · with an English Wikipedia article;
//   · active within 1926–1945 by its start and end (P580, P582) or its one date (P585), over 30 years or fewer;
//   · not also of a class in NOT_CLASSES (a coup attempt, a mutiny, a massacre, a series of wars…), and not in
//     LEFT_OUT (VM's reasons beside each);
//   · not part of (P361, up to three steps) another war on the list: the list names the whole war once (World War II,
//     not its Eastern Front), so National Analysis counts it once;
//   · with at least one state VM can place: a country (P17), a location (P276) that is a state or lies in exactly one
//     state (Wikidata's P17 of the location), or a participant (P710) that is a state, or a place VM gives it by hand
//     (history-fought.mjs). A location that spans several states (a region: the Gran Chaco, the Iberian Peninsula) is
//     named in `where` and never spread to the states it spans, so no state is called a place of a war, or counted
//     by National Analysis, because a region it shares was (fixer, 20 November 2026; until then the Chaco War was
//     placed in Argentina and Brazil, and the Spanish Civil War in Portugal, Andorra and France).
// A war's dates are Wikidata's start and end (P580, P582; else its one date, P585), each at the precision Wikidata
// gives it: "1932-09-09" to the day, "1932-09" to the month, "1932" to the year (`start`, `end`).
// War Focus's own wars of 1926–1945 are always on the list (VM's editorial choice; by their Q-ids in
// battlefield/focus/data/index.json), even where Wikidata files them under another class (an invasion, a battle).
// A war's years are its active years within 1926–1945. Wikidata does not code a war's intensity as UCDP does, so every
// year is level 3, "a war Wikidata lists", and no battle-death total is given.
import { sparql, entities, claimIds } from '../../omni/scripts/history-common.mjs';
import { canonical } from './history-places.mjs';

export const FIRST = 1926, LAST = 1945, MAX_SPAN = 30;
export const ROOTS = ['Q198', 'Q124734', 'Q6107280'];
/** Instances of these themselves are rebellions VM counts when they lasted 30 days or more. */
export const REBELLIONS = new Set(['Q124734', 'Q6107280', 'Q13427116']);
export const MIN_DAYS = 30;
/** Classes left out, whatever else the item is: a period or a series rather than a war, and events that are not wars
    (a coup or its attempt, a mutiny, a massacre, a pogrom, a riot, a murder, a raid, an incident, a conspiracy). */
export const NOT_CLASSES = new Set(['Q11514315', 'Q4176199', 'Q1469686', 'Q104212151', 'Q124042044', 'Q842332', 'Q1344887', 'Q930164', 'Q25906438',
  'Q45382', 'Q81672', 'Q3882219', 'Q132821', 'Q511866', 'Q133800469', 'Q628191', 'Q168983', 'Q135010', 'Q3199915', 'Q47092', 'Q476807',
  'Q2920604', 'Q177716', 'Q3588250', 'Q13634374', 'Q528892', 'Q131621892', 'Q41397', 'Q12890393']);
/** A place of today named for a war of 1926–1945, as the state that held it then (VM's own, by hand): Wikidata often
    gives a war's country as today's (Russia for a revolt in the Soviet Union). Applied after canonical. */
export const THEN = {
  Q159: 'Q15180', Q212: 'Q15180', Q184: 'Q15180', Q230: 'Q15180', Q227: 'Q15180', Q399: 'Q15180', Q232: 'Q15180', Q265: 'Q15180', Q813: 'Q15180', Q863: 'Q15180', Q874: 'Q15180',
  Q403: 'Q83286', Q224: 'Q83286', Q225: 'Q83286', Q215: 'Q83286', Q236: 'Q83286', Q221: 'Q83286', Q1246: 'Q83286',
  Q213: 'Q33946', Q881: 'Q185682', Q424: 'Q185682', Q819: 'Q185682', Q843: 'Q668', Q902: 'Q668', Q129286: 'Q668',
  Q865: 'Q17', Q884: 'Q17', Q423: 'Q17', Q23681: 'Q229',
  Q34266: 'Q15180', Q139319: 'Q15180',              // the Russian Empire and the Russian Republic, gone by 1926
  Q801: 'Q193714', Q23792: 'Q193714',               // Israel (from 1948) and Palestine, 1926–1945: Mandatory Palestine
};
const then = q => THEN[q] || q;
/** Items left out by VM, with why (VM's own text). */
export const LEFT_OUT = {
  Q611027: 'a gang war in New York between Mafia families, not a war between armed forces',
  Q7304835: 'a bridge dispute between two US states, settled without fighting',
  Q3916827: 'Wikidata’s name for a series of wars, each listed on its own',
  Q163270: 'a historians’ name for the period of the two world wars, not a war',
  Q768496: 'a name for a series of US interventions over 36 years',
  Q8683: 'the Cold War, which VM does not list as a war',
};
/** Classes of item that count as a state among a war's participants and locations. */
export const STATE_CLASSES = new Set(['Q6256', 'Q3624078', 'Q3024240', 'Q7275', 'Q133156', 'Q1336152', 'Q15634554', 'Q417175', 'Q48349',
  'Q164950', 'Q170156', 'Q1520223', 'Q41614', 'Q1763527', 'Q10711424', 'Q20181813', 'Q2577883', 'Q107390', 'Q1371288', 'Q99541706', 'Q113489728']);

const yearOfTime = t => { const m = /^([+-]?\d+)-/.exec(t || ''); return m ? +m[1] : null; };
const timeOf = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.time).filter(Boolean);
/** An item's first and last year: start (P580) and end (P582), else its one date (P585). */
export function spanOf(e) {
  const s = timeOf(e, 'P580').map(yearOfTime).filter(Number.isFinite), t = timeOf(e, 'P582').map(yearOfTime).filter(Number.isFinite), p = timeOf(e, 'P585').map(yearOfTime).filter(Number.isFinite);
  const from = s.length ? Math.min(...s) : p.length ? Math.min(...p) : null;
  const to = t.length ? Math.max(...t) : p.length ? Math.max(...p) : from;
  return from == null ? null : { from, to: to ?? from };
}

/** A Wikidata time value as a date string at its own precision: 11 the day ("1932-09-09"), 10 the month ("1932-09"),
    9 or coarser the year ("1932"); null when there is none. */
export function dateAt(v) {
  const m = /^\+?(-?\d+)-(\d\d)-(\d\d)/.exec(v?.time || '');
  if (!m) return null;
  const y = String(+m[1]);
  return v.precision >= 11 && m[3] !== '00' ? `${y}-${m[2]}-${m[3]}` : v.precision >= 10 && m[2] !== '00' ? `${y}-${m[2]}` : y;
}
/** An item's start and end (P580, P582; else its one date, P585, for both), each at its own precision. */
export function datesOf(e) {
  const at = p => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => v?.time)[0] || null;
  const s = at('P580') || at('P585'), t = at('P582') || (at('P580') ? null : at('P585'));
  return { start: dateAt(s), end: dateAt(t) };
}

/** An item's length in days by its start and end, when both are dated to the month or the day (precision 10 or 11);
    null when either is dated only to the year. */
export function daysOf(e) {
  const at = p => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => v?.time)[0] || null;
  const s = at('P580'), t = at('P582');
  if (!s || !t || s.precision < 10 || t.precision < 10) return null;
  const day = v => { const m = /^\+?(-?\d+)-(\d\d)-(\d\d)/.exec(v.time); return Date.UTC(+m[1], Math.max(0, +m[2] - 1), Math.max(1, +m[3])); };
  return Math.round((day(t) - day(s)) / 864e5) + 1;
}

/** Why a rebellion does not count as lasting 30 days or more by its Wikidata dates, or null when it does: both a start
    and an end are needed, 30 days apart or more when both are dated to the month or the day, or in different years. */
export function tooShort(e) {
  const at = p => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => v?.time)[0] || null;
  const s = at('P580'), t = at('P582');
  if (!s || !t) return 'dated by one date only, so VM cannot tell that it lasted 30 days';
  const d = daysOf(e);
  if (d != null) return d < MIN_DAYS ? `a rising of ${d} day${d === 1 ? '' : 's'}` : null;
  return yearOfTime(t.time) > yearOfTime(s.time) ? null : 'dated only to its year, so VM cannot tell that it lasted 30 days';
}

/** The query for one root class: candidate items and their English article titles (step 1; one query a root, since
    the three at once run past the query service's time limit). */
export const query = root => `SELECT DISTINCT ?w ?article WHERE {
  ?w wdt:P31 ?cls . ?cls wdt:P279* wd:${root} .
  OPTIONAL { ?w wdt:P580 ?start } OPTIONAL { ?w wdt:P582 ?end } OPTIONAL { ?w wdt:P585 ?pit }
  FILTER( (BOUND(?start) && YEAR(?start) <= ${LAST} && ((!BOUND(?end) && YEAR(?start) >= ${FIRST}) || (BOUND(?end) && YEAR(?end) >= ${FIRST}))) || (!BOUND(?start) && BOUND(?pit) && YEAR(?pit) >= ${FIRST} && YEAR(?pit) <= ${LAST}) )
  ?article schema:about ?w ; schema:isPartOf <https://en.wikipedia.org/> .
}`;

/**
 * The list from Wikidata's answers (steps 3–5), a pure function for the tests:
 *   items   { Q: entity } for the candidates and War Focus's wars (claims, labels, sitelinks)
 *   things  { Q: entity } for their countries, locations, participants and parents (claims, labels)
 *   isPlace (q) → true when q (after canonical) is a state VM can place (Natural Earth, the crosswalk, ucdp-places)
 *   keep    Q-ids always kept (War Focus's)
 *   warTree Q-ids that are instances of war or a subclass of it (the first query's answers)
 *   placed  Q-ids VM places by hand (history-fought.mjs), which pass the last test without a state of Wikidata's
 * Returns { wars, left } with left [{ q, n, why }] for the build's log.
 */
export function selectWars({ items, things, isPlace, keep = new Set(), warTree = new Set(), placed: byHand = new Set() }) {
  const left = [], rows = [];
  const label = q => things[q]?.labels?.en?.value || items[q]?.labels?.en?.value || q;
  const isState = q => isPlace(canonical(q)) || claimIds(things[q], 'P31').some(c => STATE_CLASSES.has(c));
  const key = q => then(canonical(q));
  for (const [q, e] of Object.entries(items)) {
    const n = e?.labels?.en?.value || q, wiki = e?.sitelinks?.enwiki?.title || null;
    const why = w => left.push({ q, n, why: w });
    if (!e || e.missing != null) { why('no item'); continue; }
    const cls = claimIds(e, 'P31');
    if (!keep.has(q)) {
      if (LEFT_OUT[q]) { why(LEFT_OUT[q]); continue; }
      if (!wiki) { why('no English Wikipedia article'); continue; }
      const bad = cls.find(c => NOT_CLASSES.has(c));
      if (bad) { why(`of a class VM does not count as a war (${bad})`); continue; }
      if (!warTree.has(q)) {
        if (!cls.some(c => REBELLIONS.has(c))) { why('neither a war nor a rebellion or revolt itself'); continue; }
        const short = tooShort(e);
        if (short) { why(short); continue; }
      }
    }
    const sp = spanOf(e);
    if (!sp) { why('no dates'); continue; }
    if (!keep.has(q) && sp.to - sp.from > MAX_SPAN) { why(`over ${MAX_SPAN} years (${sp.from}–${sp.to})`); continue; }
    if (sp.to < FIRST || sp.from > LAST) { why(`outside ${FIRST}–${LAST}`); continue; }
    // Where: its countries, and its locations that are states or lie in exactly one; a location that spans several
    // states is named, not spread to them. Who: its participants that are states.
    const where = new Set(), parties = new Set(), placeNames = [];
    for (const c of claimIds(e, 'P17')) if (isState(c)) where.add(key(c));
    for (const l of claimIds(e, 'P276')) {
      if (isState(l)) { where.add(key(l)); continue; }
      const cs = [...new Set(claimIds(things[l], 'P17').filter(isState).map(key))];
      if (cs.length === 1) where.add(cs[0]); else placeNames.push(label(l));
    }
    for (const p of claimIds(e, 'P710')) if (isState(p)) parties.add(key(p));
    const placed = [...where].filter(isPlace), states = [...new Set([...placed, ...[...parties].filter(isPlace)])];
    if (!states.length && !keep.has(q) && !byHand.has(q)) { why('no state VM can place'); continue; }
    rows.push({ q, n, wiki, from: sp.from, to: sp.to, ...datesOf(e), cls: claimIds(e, 'P31'), up: claimIds(e, 'P361'), loc: placed, states, where: placeNames });
  }
  // Part of another war on the list, up to three steps through Wikidata's parents.
  const on = new Set(rows.map(r => r.q));
  const parents = q => claimIds(items[q] || things[q], 'P361');
  const within = r => {
    let level = r.up, seen = new Set();
    for (let i = 0; i < 3 && level.length; i++) {
      const hit = level.find(p => on.has(p) && p !== r.q);
      if (hit) return hit;
      level.forEach(p => seen.add(p));
      level = [...new Set(level.flatMap(parents))].filter(p => !seen.has(p));
    }
    return null;
  };
  const wars = [];
  for (const r of rows) {
    const whole = keep.has(r.q) ? null : within(r);
    if (whole) { left.push({ q: r.q, n: r.n, whole, why: `part of ${label(whole)} (${whole}), listed once` }); continue; }
    wars.push(r);
  }
  wars.sort((a, b) => a.from - b.from || a.n.localeCompare(b.n));
  return { wars, left };
}

/** Steps 1–2 and the fetches: the candidates by QUERY plus `keep`, then their items and every item they name. */
export async function fetchWars({ cache, keep = [] }) {
  const rows = [], warTree = new Set();
  for (const root of ROOTS) {
    const got = await sparql(query(root), { cache, key: `battlefield-wars-1926-1945-${root}.json` });
    if (root === 'Q198') got.forEach(r => warTree.add(r.w.split('/').pop()));
    rows.push(...got);
  }
  const ids = [...new Set([...rows.map(r => r.w.split('/').pop()), ...keep])];
  const items = await entities(ids, { props: 'claims|labels|sitelinks', cache, tag: 'bf26' });
  const named = new Set();
  for (const e of Object.values(items)) for (const p of ['P17', 'P276', 'P710', 'P361']) claimIds(e, p).forEach(q => named.add(q));
  const things = await entities([...named], { props: 'claims|labels', cache, tag: 'bf26n' });
  // The parents' parents, for "part of" (two more steps).
  for (let i = 0; i < 2; i++) {
    const more = new Set();
    for (const e of Object.values(things)) claimIds(e, 'P361').forEach(q => { if (!things[q] && !items[q]) more.add(q); });
    if (!more.size) break;
    Object.assign(things, await entities([...more], { props: 'claims|labels', cache, tag: `bf26p${i}` }));
  }
  return { items, things, warTree, candidates: ids.length };
}
