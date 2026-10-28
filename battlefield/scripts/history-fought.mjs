// Where wars were fought, for the wars whose sources would put them on the territory of every state that took part.
// UCDP's location for an interstate conflict lists every primary party's government, so Iraq 2003 would shade the
// United States, Britain and Australia as war zones. Correlates of War gives no location at all (build-history.mjs
// infers one from the regions a war was fought in), and its colonial wars name only the colonial power.
// Keys are war ids in wars.json. `loc`: the CShapes 2.0 (Gleditsch–Ward) codes of the states and colonies where the
// fighting was; `where`: what the war's places are called when the map has no shape for them; `years`: places by
// year, for a war that moved (World War II, a government fighting abroad); the years not listed keep the sources'.
// From 1989 the UCDP entries follow the countries that the UCDP Georeferenced Event Dataset (GED v26.1) places each
// conflict's events in; check-fought.mjs repeats that check and prints the entries.

// Every UCDP interstate conflict that started up to this year has been checked; build-history.mjs names newer ones.
export const CHECKED_THROUGH = 2025;

// World War II: where it was fought on land, or bombed heavily, each year. The war at sea, and places the map has no
// shape for (Hong Kong, Guam, the central Pacific islands), are not shown.
const WW2 = [
  [1939, 1945, [255]], // Germany
  [1939, 1939, [290]], [1941, 1945, [290]], // Poland: the invasion; Barbarossa, the Warsaw uprisings, the Vistula–Oder offensive
  [1940, 1945, [200, 210, 211, 220, 325]], // Britain (the Blitz, then V-weapons), the Netherlands, Belgium, France, Italy
  [1940, 1940, [212, 385, 390]], [1944, 1945, [212]], [1944, 1944, [385]], // Luxembourg, Norway, Denmark; the Ardennes; Finnmark
  [1940, 1942, [338]], [1940, 1943, [620]], [1940, 1942, [651]], // the siege of Malta; the Western Desert
  [1940, 1941, [521, 625]], [1941, 1941, [530, 531, 5200]], [1940, 1940, [433, 481]], // East Africa; Dakar, Gabon
  [1940, 1944, [339, 350]], [1941, 1945, [345]], // Albania and Greece (the Italian and German invasions, the resistance), Yugoslavia
  [1941, 1945, [365, 375]], [1941, 1941, [360, 630, 645, 652, 660]], [1943, 1944, [355, 360]], [1944, 1945, [305, 310, 315]],
  [1942, 1942, [580, 600, 615]], [1942, 1943, [616]], // Madagascar, Operation Torch, Tunisia
  [1941, 1945, [710, 800, 840]], [1941, 1941, [4]], [1942, 1943, [3]], // China, Thailand, the Philippines; Pearl Harbor; the Aleutians
  [1941, 1942, [821, 822, 827, 823, 824, 835]], [1945, 1945, [823, 824, 835]], // Malaya and Singapore; Borneo
  [1942, 1945, [775, 850, 911, 912, 940]], [1942, 1943, [860, 900]], // Burma, the Dutch East Indies, New Guinea, the Solomons; Timor, northern Australia
  [1942, 1944, [750]], [1942, 1942, [780]], // India (air raids, Imphal and Kohima), Ceylon
  [1944, 1945, [713, 740]], [1945, 1945, [730, 815, 7351]], // Taiwan and Japan; Korea, Vietnam and southern Sakhalin
];
const byYear = spans => {
  const out = {};
  for (const [from, to, gws] of spans) for (let y = from; y <= to; y++) out[y] = [...new Set([...(out[y] || []), ...gws])];
  return out;
};

export const FOUGHT_IN = {
  // ---- UCDP/PRIO interstate conflicts, 1946–2025
  u214: { loc: [800, 811] },               // France – Thailand 1946: northern Cambodia, held by Thailand since 1941
  u215: { loc: [339] },                    // Albania – United Kingdom 1946: the Corfu Channel, in Albanian waters
  u228: { loc: [651, 652, 660, 663, 666, 6511, 6631] }, // Arab–Israeli war 1948–49: Palestine and its neighbours, not Iraq
  u239: { loc: [651] },                    // Egypt – United Kingdom 1951–52: the Suez Canal zone
  u250: { loc: [310] },                    // Hungary – Soviet Union 1956
  u252: { loc: [651, 6511] },              // Suez 1956: Sinai, Gaza and Port Said
  u272: { loc: [616] },                    // France – Tunisia 1961: Bizerte
  u276: { loc: [851] },                    // Indonesia – Netherlands 1962: West New Guinea
  u323: { loc: [352] },                    // Cyprus – Turkey 1974
  u346: { loc: [], where: ['the Falkland Islands'] }, // Falklands 1982: islands the map has no shape for
  u350: { loc: [55], where: ['Grenada'] }, // Grenada 1983 (too small for the map)
  u368: { loc: [95] },                     // Panama 1989
  u405: { loc: [471] },                    // Cameroon – Nigeria 1996: the Bakassi peninsula
  u420: { loc: [645] },                    // Iraq 2003
  u431: { loc: [700] },                    // Afghanistan – Soviet Union 1979
  u435: { loc: [522] },                    // Djibouti – Eritrea 2008: Ras Doumeira
  u13692: { loc: [700] },                  // Afghanistan 2001
  u16099: { loc: [678] },                  // Red Sea 2024–25: US and British strikes on Yemen
  // Checked and kept as UCDP has them, though GED places no events in one of the two:
  u274: { loc: [710, 750] },               // China – India: 1962 and 1967 were fought on both sides of the line (GED sees only 2020)
  u16470: { loc: [666, 678] },             // Israel – Yemen 2025: Houthi missiles and drones struck Israel, without deaths

  // ---- UCDP/PRIO conflicts that a government also fought abroad: their places by year, from GED (the countries with
  // 25 or more of the year's battle deaths, or a tenth of them), where that differs from UCDP's location.
  u418: { years: { 2001: [2, 700], 2002: [700], 2003: [640, 700, 770], 2004: [670, 770], 2005: [670, 770], 2006: [770], 2007: [520, 700, 770], 2008: [520, 700, 770], 2009: [770], 2010: [770], 2011: [700, 770], 2012: [770], 2013: [700, 770], 2014: [652, 770], 2015: [652, 700, 770], 2016: [700, 770], 2017: [652, 700], 2019: [700] } }, // United States: al-Qaida
  u426: { years: { 1990: [660], 1991: [660], 1992: [660], 1993: [660], 1994: [660], 1995: [660], 1996: [660], 1997: [660], 1998: [660], 1999: [660], 2000: [660], 2006: [660, 666], 2023: [660, 666], 2024: [660, 666], 2025: [660] } }, // Israel: Hezbollah, in Lebanon
  u374: { years: { 1997: [490, 517], 1999: [490], 2000: [490], 2002: [490, 516], 2009: [490], 2010: [490], 2011: [490], 2012: [490, 517], 2016: [490], 2019: [490], 2020: [490], 2022: [490, 516], 2023: [490], 2024: [490], 2025: [490] } }, // Rwanda: the FDLR, in DR Congo
  u314: { years: { 1995: [500, 625], 1996: [490, 500], 1997: [500, 625], 1998: [490, 500], 2001: [490, 500, 625], 2002: [490, 500, 625], 2004: [500, 625], 2005: [500, 625], 2006: [500, 625], 2008: [490, 625], 2009: [482, 490, 625], 2010: [482, 490], 2011: [490], 2013: [482, 490], 2014: [490], 2015: [490], 2016: [490], 2017: [490] } }, // Uganda: the LRA and the ADF
  u287: { years: { 2014: [490, 516], 2019: [490, 516], 2020: [490, 516], 2021: [490, 516], 2022: [490], 2024: [490, 516] } }, // Burundi: RED-Tabara, from DR Congo
  u288: { years: { 1989: [483, 625], 1990: [483, 625], 2010: [625] } }, // Chad: rebels based in Sudan
  u354: { years: { 1992: [640, 645], 1994: [640, 645], 1995: [640, 645], 1996: [640, 645], 1997: [640, 645], 1998: [640, 645], 1999: [640, 645], 2000: [640, 645], 2001: [640, 645], 2002: [640, 645], 2004: [640, 645], 2006: [640, 645], 2007: [640, 645], 2008: [640, 645], 2009: [640, 645], 2010: [640, 645], 2011: [640, 645], 2012: [640, 645], 2013: [640, 645], 2016: [640, 645], 2017: [640, 645], 2018: [640, 645], 2019: [640, 645], 2020: [640, 645], 2021: [640, 645], 2022: [640, 645], 2023: [640, 645], 2024: [640, 645], 2025: [645] } }, // Turkey: the PKK, also in northern Iraq
  u390: { years: { 1992: [344, 346], 1993: [344, 346], 1994: [346], 1995: [344, 346] } }, // Croatia: the Krajina Serbs, also in Bosnia
  u442: { years: { 2010: [432] } },        // Mauritania: AQIM, in Mali
  u13902: { years: { 2015: [640, 652], 2016: [640, 645, 652], 2017: [652] } }, // Turkey: Islamic State, also in Syria and Iraq

  // ---- UCDP/PRIO places the map has no shape for in those years
  u207: { loc: [665] },                    // Israel 1946: Mandatory Palestine
  u226: { loc: [750], where: ['Hyderabad'] }, // Hyderabad – India 1948: Hyderabad lies within India on this map
  u11884: { loc: [750], where: ['Hyderabad'] },
  u286: { loc: [6801] },                   // Aden 1964–67: the Federation of South Arabia

  // ---- Correlates of War, 1926–1945
  c121: { loc: [710] },                    // Japan's invasion of Manchuria, 1931–33
  c130: { loc: [710] },                    // Second Sino-Japanese War, 1937–41
  c133: { loc: [365] },                    // Lake Khasan 1938: hills held by the Soviet Union
  c136: { loc: [712] },                    // Khalkhin Gol 1939: Mongolia
  c139: { years: byYear(WW2) },            // World War II
  c142: { loc: [375] },                    // Winter War 1939–40: Finland
  c145: { loc: [800, 811, 812] },          // Franco-Thai War 1940–41: Thailand, Cambodia and Laos
  c700: { loc: [710] },                    // Northern Expedition: Japan's troops fought at Jinan, in China
  c711: { loc: [710] },                    // Kumul Rebellion: the Soviet intervention in Xinjiang
  c718: { loc: [230] },                    // Spanish Civil War: Germany, Italy and Portugal fought in Spain
  c720: { loc: [350] },                    // Greek Civil War: Britain fought in Greece
  c447: { loc: [620] },                    // Libya (Italy and the Senussi)
  c449: { loc: [602, 600] },               // the Rif War: Spanish and French Morocco
  c451: { loc: [652, 660] },               // the Great Syrian Revolt: Syria and Lebanon
  c452: { loc: [815] },                    // the Yên Bái mutiny: Vietnam
  c453: { loc: [750], where: ['Burma'] },  // the Saya San rebellion: Burma, part of British India until 1937
  c454: { loc: [665] },                    // the Arab revolt in Palestine
  c455: { loc: [750] },                    // Waziristan, in British India
  c456: { loc: [850] },                    // the Indonesian National Revolution
};
