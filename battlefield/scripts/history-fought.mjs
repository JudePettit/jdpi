// Where wars were fought, for the wars whose sources would put them on the territory of every state that took part,
// or give no place the map can draw. UCDP's location for an interstate conflict lists every primary party's
// government, so Iraq 2003 would shade the United States, Britain and Australia as war zones; Wikidata's countries
// and locations for a war of 1926–1945 are often missing or name a region.
// Keys are war ids in wars.json (u<UCDP id>, or a Wikidata Q-id for 1926–1945). Places are VM's place keys, Wikidata
// Q-ids (battlefield/scripts/history-places.mjs; never a Gleditsch–Ward number). `loc`: where the fighting was;
// `where`: what the war's places are called when the map has no shape for them, over all its years (a war's record);
// `whereYears`: the same names by year, where they differ by year (World War II's Pearl Harbor and the Aleutians), so a
// year or a period names only its own; `years`: places by year, for a war that moved (World War II, a government
// fighting abroad); the years not listed keep the sources'.
// From 1989 the UCDP entries follow the countries that the UCDP Georeferenced Event Dataset (GED v26.1) places each
// conflict's events in; check-fought.mjs repeats that check and prints the entries.
// VM's own work. Re-keyed from Gleditsch–Ward numbers to Q-ids on 20 November 2026 (stage J1) by hand, place by place;
// the entries that only answered CShapes's dates of a border change are gone with CShapes.

// Every UCDP interstate conflict that started up to this year has been checked; build-history.mjs names newer ones.
export const CHECKED_THROUGH = 2025;

// World War II: where it was fought on land, or bombed heavily, each year. The war at sea, and places the map has no
// shape for (Hong Kong, Guam, the central Pacific islands), are not shown; Pearl Harbor and the Aleutians are named.
const WW2 = [
  [1939, 1945, ['Q183']], [1939, 1939, ['Q36']], [1941, 1945, ['Q36']], // Germany; Poland: the invasion, Barbarossa, the Warsaw uprisings, the Vistula–Oder offensive
  [1940, 1945, ['Q145', 'Q55', 'Q31', 'Q142', 'Q38']], // Britain (the Blitz, then V-weapons), the Netherlands, Belgium, France, Italy
  [1940, 1940, ['Q32', 'Q20', 'Q35']], [1944, 1945, ['Q32']], [1944, 1944, ['Q20']], // Luxembourg, Norway, Denmark; the Ardennes; Finnmark
  [1940, 1942, ['Q233']], [1940, 1943, ['Q1016']], [1940, 1942, ['Q79']], // the siege of Malta; the Western Desert
  [1940, 1941, ['Q34754', 'Q1049']], [1941, 1941, ['Q115', 'Q986', 'Q1045']], [1940, 1940, ['Q1041', 'Q1000']], // East Africa; Dakar, Gabon
  [1940, 1944, ['Q222', 'Q41']], [1941, 1945, ['Q83286']], // Albania and Greece (the Italian and German invasions, the resistance), Yugoslavia
  [1941, 1945, ['Q15180', 'Q33']], [1941, 1941, ['Q218', 'Q794', 'Q796', 'Q858', 'Q822']], [1943, 1944, ['Q219', 'Q218']], [1944, 1945, ['Q40', 'Q28', 'Q33946']],
  [1942, 1942, ['Q1019', 'Q1028', 'Q262']], [1942, 1943, ['Q948']], // Madagascar, Operation Torch, Tunisia
  [1941, 1945, ['Q148', 'Q869', 'Q928']], // China, Thailand, the Philippines
  [1941, 1942, ['Q833', 'Q334', 'Q921']], [1945, 1945, ['Q833', 'Q921']], // Malaya, Singapore and Borneo
  [1942, 1945, ['Q836', 'Q252', 'Q691', 'Q685']], [1942, 1943, ['Q574', 'Q408']], // Burma, the Dutch East Indies, New Guinea, the Solomons; Timor, northern Australia
  [1942, 1944, ['Q668']], [1942, 1942, ['Q854']], // India (air raids, Imphal and Kohima), Ceylon
  [1944, 1945, ['Q865', 'Q17']], [1945, 1945, ['Q423', 'Q185682']], // Taiwan and Japan; Korea, Vietnam
];
const byYear = spans => {
  const out = {};
  for (const [from, to, qs] of spans) for (let y = from; y <= to; y++) out[y] = [...new Set([...(out[y] || []), ...qs])];
  return out;
};

export const FOUGHT_IN = {
  // ---- UCDP/PRIO interstate conflicts, 1946–2025
  u214: { loc: ['Q869', 'Q424'] },          // France – Thailand 1946: northern Cambodia, held by Thailand since 1941
  u215: { loc: ['Q222'] },                  // Albania – United Kingdom 1946: the Corfu Channel, in Albanian waters
  u228: { loc: ['Q79', 'Q858', 'Q822', 'Q810', 'Q801', 'Q23792'] }, // Arab–Israeli war 1948–49: Palestine and its neighbours, not Iraq
  u239: { loc: ['Q79'] },                   // Egypt – United Kingdom 1951–52: the Suez Canal zone
  u250: { loc: ['Q28'] },                   // Hungary – Soviet Union 1956
  u252: { loc: ['Q79', 'Q23792'] },         // Suez 1956: Sinai, Gaza and Port Said
  u272: { loc: ['Q948'] },                  // France – Tunisia 1961: Bizerte
  u276: { loc: ['Q252'], where: ['West New Guinea'] }, // Indonesia – Netherlands 1962: West New Guinea, drawn within Indonesia
  u323: { loc: ['Q229'] },                  // Cyprus – Turkey 1974
  u346: { loc: ['Q9648'] },                 // Falklands 1982: the islands
  u350: { loc: ['Q769'] },                  // Grenada 1983
  u368: { loc: ['Q804'] },                  // Panama 1989
  u405: { loc: ['Q1009'] },                 // Cameroon – Nigeria 1996: the Bakassi peninsula
  u420: { loc: ['Q796'] },                  // Iraq 2003
  u431: { loc: ['Q889'] },                  // Afghanistan – Soviet Union 1979
  u435: { loc: ['Q977'] },                  // Djibouti – Eritrea 2008: Ras Doumeira
  u13692: { loc: ['Q889'] },                // Afghanistan 2001
  u16099: { loc: ['Q805'] },                // Red Sea 2024–25: US and British strikes on Yemen
  // Checked and kept as UCDP has them, though GED places no events in one of the two:
  u274: { loc: ['Q148', 'Q668'] },          // China – India: 1962 and 1967 were fought on both sides of the line (GED sees only 2020)
  u16470: { loc: ['Q801', 'Q805'] },        // Israel – Yemen 2025: Houthi missiles and drones struck Israel, without deaths

  // ---- UCDP/PRIO conflicts that a government also fought abroad: their places by year, from GED (the countries with
  // 25 or more of the year's battle deaths, or a tenth of them), where that differs from UCDP's location.
  u418: { years: { 2001: ['Q30', 'Q889'], 2002: ['Q889'], 2003: ['Q43', 'Q889', 'Q843'], 2004: ['Q851', 'Q843'], 2005: ['Q851', 'Q843'], 2006: ['Q843'], 2007: ['Q1045', 'Q889', 'Q843'], 2008: ['Q1045', 'Q889', 'Q843'], 2009: ['Q843'], 2010: ['Q843'], 2011: ['Q889', 'Q843'], 2012: ['Q843'], 2013: ['Q889', 'Q843'], 2014: ['Q858', 'Q843'], 2015: ['Q858', 'Q889', 'Q843'], 2016: ['Q889', 'Q843'], 2017: ['Q858', 'Q889'], 2019: ['Q889'] } }, // United States: al-Qaida
  u426: { years: Object.fromEntries([1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2006, 2023, 2024, 2025].map(y => [y, [2006, 2023, 2024].includes(y) ? ['Q822', 'Q801'] : ['Q822']])) }, // Israel: Hezbollah, in Lebanon
  u374: { years: { 1997: ['Q974', 'Q1037'], 1999: ['Q974'], 2000: ['Q974'], 2002: ['Q974', 'Q967'], 2009: ['Q974'], 2010: ['Q974'], 2011: ['Q974'], 2012: ['Q974', 'Q1037'], 2016: ['Q974'], 2019: ['Q974'], 2020: ['Q974'], 2022: ['Q974', 'Q967'], 2023: ['Q974'], 2024: ['Q974'], 2025: ['Q974'] } }, // Rwanda: the FDLR, in DR Congo
  u314: { years: { 1995: ['Q1036', 'Q1049'], 1996: ['Q974', 'Q1036'], 1997: ['Q1036', 'Q1049'], 1998: ['Q974', 'Q1036'], 2001: ['Q974', 'Q1036', 'Q1049'], 2002: ['Q974', 'Q1036', 'Q1049'], 2004: ['Q1036', 'Q1049'], 2005: ['Q1036', 'Q1049'], 2006: ['Q1036', 'Q1049'], 2008: ['Q974', 'Q1049'], 2009: ['Q929', 'Q974', 'Q1049'], 2010: ['Q929', 'Q974'], 2011: ['Q974'], 2013: ['Q929', 'Q974'], 2014: ['Q974'], 2015: ['Q974'], 2016: ['Q974'], 2017: ['Q974'] } }, // Uganda: the LRA and the ADF
  u287: { years: { 2014: ['Q974', 'Q967'], 2019: ['Q974', 'Q967'], 2020: ['Q974', 'Q967'], 2021: ['Q974', 'Q967'], 2022: ['Q974'], 2024: ['Q974', 'Q967'] } }, // Burundi: RED-Tabara, from DR Congo
  u288: { years: { 1989: ['Q657', 'Q1049'], 1990: ['Q657', 'Q1049'], 2010: ['Q1049'] } }, // Chad: rebels based in Sudan
  u354: { years: Object.fromEntries([1992, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2004, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map(y => [y, y === 2025 ? ['Q796'] : ['Q43', 'Q796']])) }, // Turkey: the PKK, also in northern Iraq
  u390: { years: { 1992: ['Q224', 'Q225'], 1993: ['Q224', 'Q225'], 1994: ['Q225'], 1995: ['Q224', 'Q225'] } }, // Croatia: the Krajina Serbs, also in Bosnia
  u442: { years: { 2010: ['Q912'] } },      // Mauritania: AQIM, in Mali
  u13902: { years: { 2015: ['Q43', 'Q858'], 2016: ['Q43', 'Q796', 'Q858'], 2017: ['Q858'] } }, // Turkey: Islamic State, also in Syria and Iraq

  // ---- UCDP/PRIO internal conflicts fought outside the government's state. UCDP's location is "the government side of
  // a conflict, and should not be interpreted as the geographical location of the conflict" (ACD codebook v26.1, 3.1),
  // so these few are placed where Wikidata places the war (read 25 November 2026; battlefield-history-3): the
  // Israeli–Palestinian conflict (Q151622) at Palestine (P276 Q23792), kept in Israel too; the South African Border War
  // (Q1993848) in Namibia (P17 and P276 Q1030), which Cliopatria draws within South Africa to 1989, so it is named under
  // the map; the Western Sahara War (Q1093550) in Western Sahara (P276 Q6250), which no Cliopatria row holds after
  // 1975 (in 1975 it lies in Spain's row, so it is named under the map then too), kept in Morocco and Mauritania too,
  // since Polisario "also raided cities and towns in Morocco and Mauritania proper" (English Wikipedia's "Western Sahara
  // War", read 26 November 2026: the raids on Nouakchott and on the Zouerate iron mines);
  // the Indonesian occupation of East Timor (Q2665403) in Timor-Leste (P276 Q574, read 26 November 2026; English
  // Wikipedia's article gives its location as East Timor), which Cliopatria draws within Portugal in 1975 and
  // Indonesia from 1976, so it is named under the map.
  u234: { loc: ['Q801', 'Q23792'] },        // Israel: Palestine
  u298: { loc: ['Q1030'] },                 // South Africa: Namibia, 1966–89
  u331: { loc: ['Q6250', 'Q1028'] },        // Morocco: Western Sahara, 1975–89
  u428: { loc: ['Q6250', 'Q1025'] },        // Mauritania: Western Sahara, 1975–78
  u330: { loc: ['Q574'] },                  // Indonesia: East Timor, 1975–99

  // ---- UCDP/PRIO places the map has no shape for in those years
  u207: { loc: ['Q193714'] },              // Israel 1946: Mandatory Palestine (no free border holds it, so it is named under the map)
  u226: { loc: ['Q668'], where: ['Hyderabad'] }, // Hyderabad – India 1948: Hyderabad lies within India on this map
  u11884: { loc: ['Q668'], where: ['Hyderabad'] },
  u216: { years: { 1946: ['Q185682'], 1947: ['Q185682'], 1948: ['Q185682'], 1949: ['Q185682'], 1950: ['Q185682'], 1951: ['Q185682'], 1952: ['Q185682'], 1953: ['Q185682'], 1954: ['Q185682'] }, where: ['Vietnam'] }, // First Indochina War: Cliopatria's French Indochina

  // ---- Wikidata's wars of 1926–1945, by their Q-ids: where Wikidata gives no place the map can draw, or one too wide.
  Q1551794: { loc: ['Q148'] },              // Japan's invasion of Manchuria, 1931–33
  Q170314: { loc: ['Q148'] },               // Second Sino-Japanese War
  Q188925: { loc: ['Q711'] },               // Khalkhin Gol 1939: Mongolia
  // World War II. Its named places by year (battlefield-history-6, 25 November 2026), from their own Wikidata items: the
  // attack on Pearl Harbor (Q52418, P585 7 December 1941) and the Aleutian Islands campaign (Q249708, P580 3 June 1942
  // to P582 15 August 1943); `where` keeps them with their years for the war's record.
  Q362: { years: byYear(WW2), where: ['Pearl Harbor (1941)', 'the Aleutian Islands (1942–43)'], whereYears: byYear([[1941, 1941, ['Pearl Harbor']], [1942, 1943, ['the Aleutian Islands']]]) },
  // Actions in Inner Mongolia, 1933–36 (battlefield-history-4): Wikidata (Q4211700) gives only its location, Chahar
  // (Q1058919), whose country (P17) is Q865 to 1948, the Republic of China; THEN reads Q865 as Taiwan under Japan, so
  // the war is placed in China by hand here, and wars-1926.mjs LOCATION_IN keeps Japan out of its states.
  Q4211700: { loc: ['Q148'] },
  Q134949: { loc: ['Q33'] },                // Winter War 1939–40: Finland
  Q3938020: { loc: ['Q851'] },              // Ikhwan Revolt 1927–30: Nejd (Cliopatria's Kingdom of Hejaz and Nejd)
  Q1073476: { loc: ['Q148'] },              // Northern Expedition: China
  Q179975: { loc: ['Q148'] },               // Chinese Civil War: China
  Q4247016: { loc: ['Q148'] },              // Kumul Rebellion: Xinjiang
  Q10859: { loc: ['Q29'] },                 // Spanish Civil War: Germany, Italy and Portugal fought in Spain
  Q766437: { loc: ['Q1028'] },              // the Rif War: Spanish and French Morocco
  Q1968718: { loc: ['Q858', 'Q822'] },      // the Great Syrian Revolt: Syria and Lebanon
  Q46057: { loc: ['Q193714'] },            // the Arab revolt in Palestine: Mandatory Palestine, not today's Israel or Palestine
  Q1332160: { loc: ['Q252'] },              // the Indonesian National Revolution
  // Fixer, 20 November 2026: Wikidata places these two only in a region spanning several states, which is no longer
  // spread to them (wars-1926.mjs). The Ahmed Barzani revolt (Wikidata: Kurdistan) was "in modern Iraq" (English
  // Wikipedia's article, read that day); the Soviet–Japanese border conflicts (Wikidata's country: Japan; location:
  // Northeast Asia) were fought on the borders of Wikidata's other participants: the Soviet Union, the Mongolian
  // People's Republic and Manchukuo, drawn within China as Japan's invasion of Manchuria is.
  Q4695762: { loc: ['Q796'] },              // Ahmed Barzani revolt, 1931–32
  Q696389: { loc: ['Q15180', 'Q711', 'Q148'] }, // Soviet–Japanese border conflicts, 1932–39
};
