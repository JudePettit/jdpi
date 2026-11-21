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
