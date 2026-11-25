// VM's crosswalk from Cliopatria's rows to the Retrospective Battlefield's places (stage J1, 20 November 2026).
// A place is a state keyed by one Wikidata Q-id: the Q-id Natural Earth gives today's country (public domain), which
// is the one UCDP's names resolve to (omni/scripts/ucdp-places.mjs), or, for a state that is gone, that state's own
// Q-id (the Soviet Union, Yugoslavia, Czechoslovakia, North Yemen…). A Gleditsch and Ward number is never the key.
// Cliopatria v0.2.1 (CC BY 4.0) names each row by the regime of its years ("Weimar Republic", "Nazi Germany",
// "Federal Republic of Germany"); VM's crosswalk of those names (omni/data/borders/qids.json) gives each the regime's
// own Q-id. The tables below are VM's own work, chosen by hand on 20 November 2026 from Cliopatria's names and years
// and Wikidata's items: CANONICAL folds a regime's Q-id into the state it governed, so a war placed in "Germany" fills
// Germany's row in 1938 and in 1975; ROWS gives a Q-id to rows the crosswalk leaves without one, or corrects one.
// Each Q-id is checked on Wikidata at every build of wars.json (its English label is written beside it).

/** A regime's Q-id → the place's Q-id. */
export const CANONICAL = {
  Q23666: 'Q145',                                   // Kingdom of Great Britain → United Kingdom
  Q70802: 'Q142', Q69829: 'Q142', Q200686: 'Q142',  // French Third, Fourth and Fifth Republics → France (Vichy kept apart)
  Q172579: 'Q38',                                   // Kingdom of Italy → Italy
  Q7318: 'Q183', Q41304: 'Q183', Q713750: 'Q183',   // Nazi Germany, the Weimar Republic, West Germany → Germany
  Q207272: 'Q36',                                   // Second Polish Republic → Poland
  Q203493: 'Q218', Q842794: 'Q218',                 // Kingdom of Romania, Socialist Republic of Romania → Romania
  Q207521: 'Q115',                                  // Ethiopian Empire → Ethiopia
  Q1155700: 'Q869',                                 // Rattanakosin Kingdom → Thailand
  Q62567: 'Q189',                                   // Kingdom of Iceland → Iceland
  Q36704: 'Q83286',                                 // Kingdom of Yugoslavia → Yugoslavia (the Yugoslav Partisans' row of 1944 is not: ROWS)
  Q31747: 'Q27', Q5306909: 'Q27',                   // Irish Free State, Éire → Ireland
  Q13426199: 'Q148', Q31113: 'Q148', Q17427: 'Q148', // Republic of China to 1949, the Kuomintang, the Communists' areas → China
  Q188712: 'Q17',                                   // Empire of Japan → Japan
  Q124943: 'Q79', Q170468: 'Q79',                   // Kingdom of Egypt, United Arab Republic → Egypt
  Q149805: 'Q796',                                  // Kingdom of Iraq → Iraq
  Q1138904: 'Q889', Q1415128: 'Q889', Q42759: 'Q889', Q42418: 'Q889', // Afghanistan's kingdom, republic, and the areas the mujahideen and the Taliban held
  Q207991: 'Q794',                                  // Pahlavi Iran → Iran
  Q178038: 'Q29', Q13474305: 'Q29', Q2742116: 'Q29', // Second Spanish Republic, Francoist Spain, the Nationalists' zone → Spain
  Q209065: 'Q41', Q504081: 'Q41', Q17765809: 'Q41', // Kingdom of Greece, the junta, Third Hellenic Republic → Greece
  Q467864: 'Q222',                                  // People's Socialist Republic of Albania → Albania
  Q121932: 'Q219',                                  // People's Republic of Bulgaria → Bulgaria
  Q16410: 'Q28',                                    // Hungarian People's Republic → Hungary
  Q1998401: 'Q267584',                              // North Yemen (Cliopatria's row) → the Yemen Arab Republic, as UCDP's "Yemen (North Yemen)"
  Q1756546: 'Q851',                                 // Kingdom of Hejaz and Nejd → Saudi Arabia
  Q157734: 'Q842',                                  // Sultanate of Muscat and Oman → Oman
  Q870055: 'Q819',                                  // Kingdom of Laos → Laos
  Q6500954: 'Q974',                                 // Zaire → DR Congo
  Q213510: 'Q974',                                  // Belgian Congo → DR Congo (the same territory)
  Q188161: 'Q252',                                  // Dutch East Indies → Indonesia (the same territory, less West New Guinea after 1949)
  Q503623: 'Q117',                                  // British Gold Coast → Ghana
  Q944391: 'Q846',                                  // Qatar Protectorate → Qatar
  Q17435890: 'Q1016', Q31454: 'Q1016',              // Libyan Arab Republic, Kingdom of Libya → Libya
  Q146885: 'Q858', Q16243030: 'Q858',               // Second Syrian Republic, Ba'athist Syria (Cliopatria's 1967–72 row) → Syria
  Q187830: 'Q40',                                   // Second Republic of Austria → Austria
  Q1479726: 'Q833',                                 // Federation of Malaya → Malaysia
  Q37024: 'Q838261',                                // Serbia and Montenegro → the Federal Republic of Yugoslavia, as UCDP's "Serbia (Yugoslavia)" 1992–2005
  Q3359409: 'Q702',                                 // Micronesia (Cliopatria's) → Federated States of Micronesia
  Q204989: 'Q763',                                  // Saint Kitts → Saint Kitts and Nevis
  Q824489: 'Q45',                                   // Estado Novo (Portugal) → Portugal
  Q191764: 'Q424', Q867778: 'Q424',                 // Democratic Kampuchea, People's Republic of Kampuchea → Cambodia
  Q129286: 'Q668',                                  // British Raj → India (to 1947; Pakistan, Bangladesh and, to 1937, Burma within it)
  Q212056: 'Q711',                                 // Mongolian People's Republic → Mongolia
  Q5187: 'Q159',                                   // the Chechen Republic of Ichkeria's area → Russia, where UCDP places the Chechen wars
};

/** A place the tables above key by a later state's item, named in earlier years by the earlier states' own items, oldest
    first: place Q → [earlier Q, …] (VM's own, by hand, 22 November 2026, MP-16). The build writes each earlier item's
    English label and the year Wikidata ends it (P576) beside the place (`was`: [{ n, to }]), and the page names the
    place by the first of them whose last year is not before the year shown: Yugoslavia (the item of 1945–1992) is the
    Kingdom of Serbs, Croats and Slovenes to 1929 and the Kingdom of Yugoslavia to 1945, as War Focus names it for its
    war (focus/scripts/wars.mjs nameAs).
    An entry is an earlier item (its last year: the latest of its ends, P576), or a pair that says which end is meant:
    [item, { P518: Q }], the end that "applies to part" (P518) Q; [item, { P31: Q }], the end time (P582) of the item's
    "instance of" Q. An earlier item is never a place of its own, and is a state by EARLIER_STATE (below). A name runs
    from its item's inception (P571) where that leaves a gap after the name before it (the Malayan Union from 1946:
    Malaysia in 1941 is "today’s"). The year of a change keeps the earlier name (names.js).
    Rows added 25 November 2026 (review of 22 November: places named by states founded later, "today’s Ethiopia" for a
    year Ethiopia existed; second review of 25 November: Lebanon in 1926, the Malayan Union, protectorates, South
    Yemen), each read on Wikidata that day; the values in brackets are Wikidata's as read, "(to the year)" where
    Wikidata holds only the year. */
export const NAMED_AS = {
  Q115: ['Q207521'],                          // Ethiopia ← Ethiopian Empire: P576 1975-03-12 (P571 1270). Not 1974: Q115's own P571 includes 1974-09-12 and Q207521 is P31 historical country (Q3024240) from 1974, but P576 is the end Wikidata gives the Empire, and 1975 began with it
  Q148: [['Q13426199', { P518: 'Q19188' }]],  // People's Republic of China ← Republic of China: P576 1949-12-07, P518 mainland China (Q19188); its other P576, 1971, P518 United Nations (Q1065), is not meant
  Q796: ['Q149805'],                          // Iraq ← Kingdom of Iraq: P576 1958-07-14 (P571 1921, to the year)
  Q822: ['Q108865226', 'Q108865218'],         // Lebanon ← State of Greater Lebanon: P576 1926-09-01 (P571 1920-09-01); then Lebanese Republic under French mandate: P576 1943 (to the year; P571 1926-09-01)
  Q833: ['Q976099', 'Q1479726'],              // Malaysia ← Malayan Union: P571 1946, P576 1948 (each to the year; P31 sovereign state, Q3624078, 1946–1948); then Federation of Malaya: P576 1963 (to the year; P571 1948, to the year)
  Q842: ['Q157734'],                          // Oman ← Muscat and Oman: P576 1970 (to the year; P571 1820, to the year)
  Q851: ['Q1756546'],                         // Saudi Arabia ← Kingdom of Nejd and Hejaz: P576 1932-09-23 (P571 1926-01-08)
  Q854: ['Q2670092'],                         // Sri Lanka ← Dominion of Ceylon: P576 1972-05-22, P571 1948-02-04
  Q948: ['Q2017684'],                         // Tunisia ← French protectorate of Tunisia: P576 1956-03-20 (P571 1881-05-12; P31 protectorate, Q164142, and historical country, Q3024240); Q948's P1365
  Q34754: ['Q662653'],                        // Somaliland ← British Somaliland: P576 1960-06-26 (P571 1884, to the year; P31 protectorate, Q164142, and historical country, Q3024240)
  Q83286: ['Q15102440', 'Q191077'],           // Yugoslavia ← Kingdom of Serbs, Croats and Slovenes (P576 1929), Kingdom of Yugoslavia (P576 1945)
  Q199841: ['Q834486'],                       // South Yemen ← Federation of South Arabia: P576 1967-11-30 (P571 1962-04-04); one of Q199841's two P1365 (the other: PASSED_OVER)
  Q267584: [['Q580188', { P31: 'Q3624078' }]], // Yemen Arab Republic ← Kingdom of Yemen: P31 sovereign state (Q3624078), P582 1962; its P576, 1970-12-01, is the royalists' end in the civil war, not meant
};

/** What VM counts as an earlier state (second review, 25 November 2026), as Wikidata's classes: the item's "instance
    of" (P31) includes historical country (Q3024240) or sovereign state (Q3624078), and none of colony (Q133156), crown
    colony (Q1351282), condominium (Q734818), overseas province of Portugal (Q333542), League of Nations mandate
    (Q426759) or United Nations trust territory (Q985073). A protectorate (Q164142, or the item "British protectorate",
    Q21479969, which has no class of its own) is a state where Wikidata also calls it a historical country: it kept a
    government of its own (Muscat and Oman, the French protectorate of Tunisia). The build checks every NAMED_AS item. */
export const EARLIER_STATE = { is: ['Q3024240', 'Q3624078'], not: ['Q133156', 'Q1351282', 'Q734818', 'Q333542', 'Q426759', 'Q985073'] };
export const isEarlierState = e => {
  const cls = (e?.claims?.P31 || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.id);
  return EARLIER_STATE.is.some(q => cls.includes(q)) && !EARLIER_STATE.not.some(q => cls.includes(q));
};

/** Items that meet EARLIER_STATE for a year a place is in a war, and that VM does not name, each with its place and the
    reason (reviewed by hand, 25 November 2026). Every other earlier item checked for the review's 28 places is a
    colony, a territory or a protectorate only (the build report lists them). */
export const PASSED_OVER = {
  Q704358: ['Q836', 'State of Burma (P31 historical country; P571 1943, P576 1945, each to the year): the Japanese occupation’s puppet state. VM never lets a puppet or an occupier stand for the place (AS, below; review X1); Burma stays “today’s Myanmar” under British rule (Q2376315, P31 colony) to 1948.'],
  Q1517772: ['Q199841', 'Protectorate of South Arabia (P31 historical country and protectorate; P576 1967-11-30): Q199841’s other P1365, for the same years. UCDP’s u286 is fought over “Aden/South Yemen”, and Aden (Q131694) is the Federation of South Arabia’s capital (Q834486 P36), not the Protectorate’s, so the Federation names the place.'],
  Q1320058: ['Q819', 'French Protectorate of Laos (P31 historical country; P576 1954, to the year): Wikidata’s Laos items overlap (the Kingdom of Laos, Q870055, which CANONICAL folds into Laos, from 1947; Laos itself, P571 1949), so no one earlier state is meant; Laos is “today’s Laos” in 1946–48 and Laos from 1949. Laos is not among the review’s 28.'],
};

/** Places named in a war's year (or under the map) before their inception with no earlier name, whose own item has an
    end (P576): a state that is gone, which "today’s …" would name as if it were there today. The build stops on any:
    `places` { Q: places.json entry }, `wars` wars.json's, `own(q)` the place's own Wikidata entity. → [[Q, year]]. */
export function goneUnnamed(places, wars, own) {
  const out = new Set();
  for (const w of wars) for (const [y] of w.years) {
    for (const q of new Set([...(w.locYears?.[y] || w.loc), ...(w.statesYears ? w.statesYears[y] || [] : w.states)])) {
      const p = places[q];
      if (!p || !(p.since > y) || earlierName(p, y) || !live(own(q), 'P576').length) continue;
      out.add(`${q} ${y}`);
    }
  }
  return [...out].map(s => s.split(' ')).map(([q, y]) => [q, +y]).sort((a, b) => a[1] - b[1]);
}
/** A place's name in a year, and as the page says it: battlefield/history/names.js, one rule for the page and the build. */
import { earlierName } from '../history/names.js';
export { nameIn, placeName, earlierName, isToday } from '../history/names.js';

/** The year of a Wikidata time value ("+1949-12-07T00:00:00Z" → 1949), or null. */
const yearOf = v => { const m = /^\+?(-?\d+)-/.exec(v?.time || ''); return m ? +m[1] : null; };
const live = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated');
const qualifierIds = (c, p) => (c.qualifiers?.[p] || []).map(x => x.datavalue?.value?.id).filter(Boolean);

/** The last year of one NAMED_AS entry, from the earlier item `e`: its end (P576), the latest; for [item, { P518: Q }]
    the end that "applies to part" (P518) Q; for [item, { P31: Q }] the end time (P582) of its "instance of" Q. */
export function endOf(entry, e) {
  const [id, pick] = Array.isArray(entry) ? entry : [entry, null];
  let ends;
  if (!pick) ends = live(e, 'P576').map(c => yearOf(c.mainsnak?.datavalue?.value));
  else if (pick.P518) ends = live(e, 'P576').filter(c => qualifierIds(c, 'P518').includes(pick.P518)).map(c => yearOf(c.mainsnak?.datavalue?.value));
  else if (pick.P31) ends = live(e, 'P31').filter(c => c.mainsnak?.datavalue?.value?.id === pick.P31).flatMap(c => (c.qualifiers?.P582 || []).map(x => yearOf(x.datavalue?.value)));
  else throw new Error(`NAMED_AS: ${id}'s entry names no end VM can read`);
  ends = ends.filter(Number.isInteger);
  return ends.length ? Math.max(...ends) : null;
}

/** A place's earlier names (places.json `was`) from the earlier items' entities `got` ({ Q: entity }): each item's
    English label and last year (endOf), and its first year (its earliest inception, P571) where that leaves a gap
    after the name before it, or after `first` (1926) for the first name. Throws where Wikidata gives no label or
    no end, or the names are not oldest first. */
export function earlierNames(q, got, first = 1926) {
  const out = [];
  for (const entry of NAMED_AS[q] || []) {
    const id = Array.isArray(entry) ? entry[0] : entry, e = got[id];
    const n = e?.labels?.en?.value, to = endOf(entry, e);
    if (!n || to == null) throw new Error(`Wikidata gives ${id} no English label or no end, so ${q}'s earlier name has no last year`);
    const starts = live(e, 'P571').map(c => yearOf(c.mainsnak?.datavalue?.value)).filter(Number.isInteger);
    const from = starts.length ? Math.min(...starts) : null, after = out.length ? out.at(-1).to + 1 : first;
    if (from != null && from > to) throw new Error(`${q}: ${id} begins (${from}) after it ends (${to})`);
    if (out.length && to <= out.at(-1).to) throw new Error(`${q}: its earlier names are not oldest first`);
    out.push({ n, ...(from != null && from > after ? { from } : {}), to });
  }
  return out;
}

/** A place whose item's inception (P571, `since`) is a later change of regime, not the start of the state of that
    name, so the page must not call it "today’s …" in the years between (VM's own, reviewed by hand, 25 November
    2026): place Q → the "instance of" (P31) value whose earliest start time (P580) on the place's own item shows the
    state existed. The build writes that year as `stateFrom`. */
export const STATE_FROM = {
  Q817: 'Q3624078', // Kuwait: P571 1991-02-26 (the liberation); P31 sovereign state (Q3624078), P580 1961-06-19 and P582 1990-08-02, and again from 1991-02-26
};

/** A place's `stateFrom` from its own entity `e`, or null where STATE_FROM does not name it. */
export function stateFrom(q, e) {
  const as = STATE_FROM[q];
  if (!as) return null;
  const starts = live(e, 'P31').filter(c => c.mainsnak?.datavalue?.value?.id === as).flatMap(c => (c.qualifiers?.P580 || []).map(x => yearOf(x.datavalue?.value))).filter(Number.isInteger);
  if (!starts.length) throw new Error(`Wikidata gives ${q} no start time (P580) for its instance of ${as}`);
  return Math.min(...starts);
}

/** A place's entry in places.json, its keys in the build's order: { n, iso3?, since?, stateFrom?, was? }. */
export const placeEntry = ({ n, iso3, since }, { stateFrom: s = null, was = null } = {}) => ({
  n, ...(iso3 ? { iso3 } : {}), ...(since ? { since } : {}), ...(s != null ? { stateFrom: s } : {}), ...(was ? { was } : {}) });

/** Rows Cliopatria names that the crosswalk leaves without a Q-id, or gives the wrong one: [name, from, to, Q]. A Q of
    null: the row is a part or a puppet of a state that has no row of its own in those years, so it stands for no
    place VM lists (the page draws it under Cliopatria's name) and the state is listed as one VM cannot place; a part
    never stands in for the whole (review X1, 21 November 2026). */
export const ROWS = [
  ['Argentine Confederation', 1926, 1929, 'Q414'],
  ['Denmark-Norway', 1926, 1940, 'Q35'],            // Cliopatria's name for Denmark's row to 1940 (Norway has its own)
  ['Principality of Bulgaria', 1926, 1944, 'Q219'],
  ['Kingdom of Bulgaria', 1947, 1947, 'Q219'],
  ['Republic of Bulgaria', 1991, 2024, 'Q219'],
  ['Kingdom of Lithuania', 1926, 1939, 'Q37'],
  ['First Hellenic Republic', 1926, 1940, 'Q41'],
  ['Kingdom of Bhutan', 1926, 1947, 'Q917'],
  ['Estado Novo', 1926, 2024, 'Q45'],               // Portugal's row (the crosswalk names only its 1932–75 row)
  ['Ethiopia', 1942, 1991, 'Q115'],
  ['Kingdom of Spain', 1926, 2024, 'Q29'],
  ['Swiss Confederation', 1926, 2024, 'Q39'],
  ['French Fourth Republic', 1945, 1945, 'Q142'],
  ['Republic of Korea', 1948, 2024, 'Q884'],
  ['Republic of China', 1950, 2024, 'Q865'],        // Taiwan from 1950
  ['Republic of Vietnam', 1956, 1975, 'Q180573'],
  ['State of Kuwait', 1961, 1989, 'Q817'],
  ['Republic of Albania', 1991, 2024, 'Q222'],
  ['Republic of Yemen', 1990, 2024, 'Q805'],        // the crosswalk gives South Yemen's Q-id to the united Yemen
  ['Mali Federation', 1961, 2024, 'Q912'],          // Mali after 1960
  ['Zimbabwe Rhodesia', 1979, 1979, 'Q217169'],     // as UCDP's "Zimbabwe (Rhodesia)" to 1979
  ['Zimbabwe Rhodesia', 1980, 1982, 'Q954'],
  ['Sultanate of Brunei', 1987, 2024, 'Q921'],
  ['People\'s Republic of Kampuchea', 1992, 1995, 'Q424'],
  ['Serbia-Montenegro', 1992, 1999, 'Q838261'],
  ['Kosovo', 2000, 2005, 'Q1246'],
  ['Gaza/Hamas', 2014, 2024, null],                 // the Gaza Strip alone: Palestine has no row of its own (the West Bank lies in Israel's)
  ['Yugoslav Partisans', 1944, 1944, null],         // the Partisans' territory, a part of Yugoslavia, which has no row in 1941–44
  ['Hungarian Nationalists', 1956, 1957, 'Q28'],    // Hungary's whole land, as the Hungarian People's Republic's rows draw it
  ['Cuban Communists', 1958, 1959, 'Q241'],
];

/** A war's place in a year Cliopatria draws it under another Q-id: [Q, from, to, Q drawn, why] (VM's own, by hand).
    Only for one state under two Q-ids, never for another state, a puppet, an occupier or a part standing in for a state
    with no row of its own: that state is listed as one VM cannot place. Occupied Yugoslavia, 1941–43, was drawn as the
    Independent State of Croatia until review X1 (21 November 2026); it is now listed. */
export const AS = [];
/** The Q-id a war's place `q` is drawn under in `year`. */
export const placeAt = (q, year) => AS.find(([a, f, t]) => a === q && f <= year && year <= t)?.[3] || q;

/** The place a regime's Q-id stands for. */
export const canonical = q => (q && CANONICAL[q]) || q || null;

/** A Cliopatria row's place at a year: ROWS, else the crosswalk's Q-id (PRPMap.qidFor) folded by CANONICAL. */
export function rowQid(qids, name, year, qidFor = globalThis.PRPMap?.qidFor) {
  const o = ROWS.find(([n, f, t]) => n === name && f <= year && year <= t);
  if (o) return o[3];
  return canonical(qidFor ? qidFor(qids, name, year) : null);
}

/** A Cliopatria row VM fills and lets a reader click: a polity (not a relation), not a composite (its name in
    brackets: Cliopatria's outline of an empire around its parts), with a shape. */
export const drawnRow = f => f?.properties?.k === 'POLITY' && !/^\(.+\)$/.test(f.properties.n || '') && !!f.geometry;
