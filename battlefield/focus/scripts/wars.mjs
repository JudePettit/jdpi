// War Focus: the major wars since 1926 (25,000+ battle deaths), curated from the PRIO Battle Deaths Dataset (1946–88),
// UCDP (1989 on) and, before 1946, the wars Wikipedia and Wikidata describe. Each entry says where its deaths come from
// and which UCDP conflicts' geolocated events (GED, 1989 on) belong to it; battles come from Wikidata ("part of" the war).
//   deaths: {} | { prio: [ids] } | { ucdp: true, prio?: [ids] }  ({} : no free source gives the war's battle deaths, so
//           none is shown (the nine wars before 1946; VM uses only free data since 20 November 2026). Otherwise annual
//           totals where a source has the year: PRIO's to 1988, UCDP's Battle-Related Deaths v26.1 from 1989 (by the
//           war's `ged` conflicts, else its bf u<id>); otherwise UCDP GED events within the dates)
//   ged: UCDP conflict ids whose state-based events within [start, end] are mapped
//   sides: a and b, each a label and the states fighting on that side (`q`, Wikidata Q-ids), optionally with dates
//          ([Q, from, to], to the day); civil wars list the contested state under `theatre` instead.
//   control: country-level occupation by date (WWII only), as [Q, side, from, to].
//   nameAs: { Q: Q2 }, a state the crosswalk keys by a later item, named in the years to Q2's dissolution (Wikidata P576)
//           by Q2's English label: WWII's Yugoslavia is drawn on the rows the Battlefield files under the Socialist
//           Federal Republic (Q83286) and named the Kingdom of Yugoslavia (Q191077) to 1945 (21 November 2026).
// A state is the Q-id of the place the Retrospective Battlefield draws it as (battlefield/history/data/places.json):
// its oldCountries where they hold the state's old Gleditsch–Ward number (Kenya, Q114, for the colony of 1939; the
// Soviet Union, Q15180, then Russia, Q159), else today's state where the territory is the same (Malta, Q233), else the
// territory's own item (the Dominion of Newfoundland, Q38610; Korea under Japanese rule, Q503585; Taiwan under Japanese
// rule, Q137816, not Q865, which Wikidata dates from 1912 as the Republic of China, 21 November 2026). Rewritten from
// Gleditsch–Ward numbers on 21 November 2026, when War Focus moved from CShapes 2.0 to Cliopatria's free borders:
// Alaska, Hawaii and Puerto Rico, three numbers of their own before, are the United States' (its Cliopatria row holds
// them), and Yugoslavia in the Bosnian War is the Socialist Federal Republic to 26 April 1992 and the Federal Republic
// of Yugoslavia from 27 April (Wikidata's dissolution and inception, P576 and P571). A state is drawn in a month only
// on a Cliopatria row of that year whose place it is; otherwise the page lists it as one VM cannot place.
//   bf: the war's id in Retrospective Battlefield when it isn't u<first GED conflict id> (before 1946, its Wikidata id).
//   deathsNote: what the deaths source says about the war that its figures alone do not (shown with the source).
// Dates are ISO; `end: null` means ongoing.
const ALLIES = 'Allies', AXIS = 'Axis';
export const WARS = [
  { id: 'northern-expedition', name: 'Northern Expedition', wiki: 'Northern Expedition', start: '1926-07-09', end: '1928-12-29', deaths: {}, bf: 'Q1073476',
    sides: { a: { label: 'National Revolutionary Army (KMT)', q: [] }, b: { label: 'Beiyang warlords', q: [] } }, theatre: ['Q148'] },
  { id: 'chinese-civil-war-1', name: 'Chinese Civil War (1927–1936)', wiki: 'Chinese Civil War', start: '1927-08-01', end: '1936-12-12', deaths: {}, bf: 'Q179975',
    sides: { a: { label: 'Nationalists (KMT)', q: [] }, b: { label: 'Communists (CCP)', q: [] } }, theatre: ['Q148'] },
  { id: 'manchuria', name: 'Japanese invasion of Manchuria', wiki: 'Japanese invasion of Manchuria', start: '1931-09-18', end: '1933-05-31', deaths: {}, bf: 'Q1551794',
    sides: { a: { label: 'Japan', q: ['Q17', 'Q503585', 'Q137816'] }, b: { label: 'China', q: ['Q148'] } } },
  { id: 'chaco', name: 'Chaco War', wiki: 'Chaco War', start: '1932-09-09', end: '1935-06-12', deaths: {}, bf: 'Q223126',
    sides: { a: { label: 'Bolivia', q: ['Q750'] }, b: { label: 'Paraguay', q: ['Q733'] } } },
  { id: 'spanish-civil-war', name: 'Spanish Civil War', wiki: 'Spanish Civil War', start: '1936-07-17', end: '1939-04-01', deaths: {}, bf: 'Q10859',
    sides: { a: { label: 'Republicans', q: [] }, b: { label: 'Nationalists', q: [] } }, theatre: ['Q29', 'Q457242'] },
  { id: 'second-sino-japanese', name: 'Second Sino-Japanese War', wiki: 'Second Sino-Japanese War', start: '1937-07-07', end: '1945-09-02', deaths: {}, bf: 'Q170314',
    sides: { a: { label: 'China', q: ['Q148'] }, b: { label: 'Japan', q: ['Q17', 'Q503585', 'Q137816'] } } },
  { id: 'khalkhin-gol', name: 'Battles of Khalkhin Gol', wiki: 'Battles of Khalkhin Gol', start: '1939-05-11', end: '1939-09-16', deaths: {}, bf: 'Q188925',
    sides: { a: { label: 'Soviet Union & Mongolia', q: ['Q15180', 'Q711'] }, b: { label: 'Japan & Manchukuo', q: ['Q17'] } } },
  { id: 'winter-war', name: 'Winter War', wiki: 'Winter War', start: '1939-11-30', end: '1940-03-13', deaths: {}, bf: 'Q134949',
    sides: { a: { label: 'Finland', q: ['Q33'] }, b: { label: 'Soviet Union', q: ['Q15180'] } } },
  { id: 'ww2', name: 'World War II', wiki: 'World War II', start: '1939-09-01', end: '1945-09-02', deaths: {}, bf: 'Q362',
    sides: {
      a: { label: ALLIES, q: [['Q36', '1939-09-01'], ['Q145', '1939-09-03'], ['Q142', '1939-09-03', '1940-06-22'], ['Q142', '1944-08-25'], ['Q408', '1939-09-03'], ['Q664', '1939-09-03'],
        ['Q668', '1939-09-03'], ['Q836', '1939-09-03'], ['Q854', '1939-09-03'], ['Q79', '1939-09-03'], ['Q1049', '1939-09-03'], ['Q114', '1939-09-03'], ['Q1036', '1939-09-03'], ['Q924', '1939-09-03'],
        ['Q1033', '1939-09-03'], ['Q117', '1939-09-03'], ['Q1044', '1939-09-03'], ['Q1005', '1939-09-03'], ['Q954', '1939-09-03'], ['Q953', '1939-09-03'], ['Q1020', '1939-09-03'], ['Q963', '1939-09-03'],
        ['Q1013', '1939-09-03'], ['Q1050', '1939-09-03'], ['Q662653', '1939-09-03'], ['Q193714', '1939-09-03'], ['Q810', '1939-09-03'], ['Q49910', '1939-09-03'], ['Q229', '1939-09-03'], ['Q233', '1939-09-03'],
        ['Q38610', '1939-09-03'], ['Q242', '1939-09-03'], ['Q734', '1939-09-03'], ['Q766', '1939-09-03'], ['Q754', '1939-09-03'], ['Q778', '1939-09-03'], ['Q244', '1939-09-03'], ['Q530560', '1939-09-03'],
        ['Q1443945', '1939-09-03'], ['Q685', '1939-09-03'], ['Q712', '1939-09-03'], ['Q1400154', '1939-09-03'], ['Q1973084', '1939-09-03'], ['Q1147441', '1939-09-03'], ['Q1658411', '1939-09-03'], ['Q376178', '1939-09-03'],
        ['Q921', '1939-09-03'], ['Q258', '1939-09-06'], ['Q1030', '1939-09-06'], ['Q16', '1939-09-10'], ['Q20', '1940-04-09'], ['Q55', '1940-05-10'], ['Q31', '1940-05-10'], ['Q32', '1940-05-10'],
        ['Q252', '1940-05-10'], ['Q730', '1940-05-10'], ['Q974', '1940-05-28'], ['Q590743', '1940-05-28'], ['Q41', '1940-10-28'], ['Q83286', '1941-04-06'], ['Q15180', '1941-06-22'], ['Q794', '1941-08-25'],
        ['Q30', '1941-12-08'], ['Q928', '1941-12-08'], ['Q148', '1941-12-09'], ['Q96', '1942-05-22'], ['Q155', '1942-08-22'],
        ['Q115', '1942-12-14'], ['Q796', '1943-01-16'], ['Q38', '1943-10-13'], ['Q218', '1944-08-23'], ['Q219', '1944-09-08'], ['Q33', '1944-09-19'], ['Q43', '1945-02-23'], ['Q711', '1945-08-10']] },
      b: { label: AXIS, q: [['Q183', '1939-09-01'], ['Q40', '1939-09-01'], ['Q38', '1940-06-10', '1943-09-08'], ['Q1016', '1940-06-10', '1943-02-04'], ['Q986', '1940-06-10', '1941-11-27'],
        ['Q319984', '1940-06-10', '1941-11-27'], ['Q222', '1940-06-10'], ['Q28', '1941-06-27', '1945-01-20'], ['Q218', '1941-06-22', '1944-08-23'], ['Q219', '1941-03-01', '1944-09-08'],
        ['Q33', '1941-06-25', '1944-09-19'], ['Q17', '1941-12-07'], ['Q503585', '1941-12-07'], ['Q137816', '1941-12-07'], ['Q696736', '1941-12-07'], ['Q869', '1942-01-25', '1945-08-15']] },
    },
    // Country-level occupation. A country here is shown held by the occupying side between the dates; this is not a
    // front line (France, the Soviet Union and China, for example, were never wholly held by either side).
    control: [['Q33946', 'b', '1939-03-15', '1945-05-09'], ['Q36', 'b', '1939-10-06', '1945-01-17'], ['Q35', 'b', '1940-04-09', '1945-05-05'], ['Q20', 'b', '1940-06-10', '1945-05-08'],
      ['Q55', 'b', '1940-05-15', '1945-05-05'], ['Q31', 'b', '1940-05-28', '1944-09-04'], ['Q32', 'b', '1940-05-10', '1944-09-10'], ['Q142', 'b', '1940-06-22', '1944-08-25'],
      ['Q83286', 'b', '1941-04-17', '1944-10-20'], ['Q41', 'b', '1941-06-01', '1944-10-12'], ['Q115', 'b', '1939-09-01', '1941-11-27'], ['Q1016', 'a', '1943-02-04', '1945-09-02'],
      ['Q986', 'a', '1941-11-27', '1945-09-02'], ['Q319984', 'a', '1941-11-27', '1945-09-02'], ['Q794', 'a', '1941-09-17', '1945-09-02'], ['Q881', 'b', '1940-09-22', '1945-08-28'],
      ['Q424', 'b', '1941-07-28', '1945-08-28'], ['Q819', 'b', '1941-07-28', '1945-08-28'], ['Q1400154', 'b', '1942-02-15', '1945-09-12'], ['Q1973084', 'b', '1942-02-15', '1945-09-12'],
      ['Q376178', 'b', '1942-02-15', '1945-09-12'], ['Q1147441', 'b', '1942-01-19', '1945-09-10'], ['Q1658411', 'b', '1941-12-24', '1945-09-10'], ['Q921', 'b', '1941-12-22', '1945-09-10'],
      ['Q252', 'b', '1942-03-09', '1945-09-02'], ['Q928', 'b', '1942-05-06', '1945-07-04'], ['Q836', 'b', '1942-05-20', '1945-05-03'], ['Q574', 'b', '1942-02-20', '1945-09-02'],
      ['Q685', 'b', '1942-05-03', '1943-02-09'], ['Q222', 'b', '1939-04-07', '1944-11-29'], ['Q40', 'b', '1939-09-01', '1945-04-13'], ['Q28', 'b', '1944-03-19', '1945-01-20']],
    nameAs: { Q83286: 'Q191077' } },
  { id: 'greek-civil-war', bf: 'u203', name: 'Greek Civil War', wiki: 'Greek Civil War', start: '1946-03-30', end: '1949-10-16', deaths: { prio: [4] },
    sides: { a: { label: 'Kingdom of Greece', q: [] }, b: { label: 'Democratic Army of Greece', q: [] } }, theatre: ['Q41'] },
  { id: 'chinese-civil-war-2', bf: 'u202', name: 'Chinese Civil War (1946–1949)', wiki: 'Chinese Civil War', start: '1946-06-26', end: '1949-12-07', deaths: { prio: [3] },
    sides: { a: { label: 'Nationalists (ROC)', q: [] }, b: { label: 'Communists (PLA)', q: [] } }, theatre: ['Q148'] },
  { id: 'first-indochina', bf: 'u216', name: 'First Indochina War', wiki: 'First Indochina War', start: '1946-12-19', end: '1954-07-21', deaths: { prio: [17] },
    sides: { a: { label: 'France & State of Vietnam', q: ['Q142'] }, b: { label: 'Viet Minh', q: [] } }, theatre: ['Q881', 'Q424', 'Q819'] },
  { id: 'korean-war', bf: 'u235', name: 'Korean War', wiki: 'Korean War', start: '1950-06-25', end: '1953-07-27', deaths: { prio: [38] },
    sides: { a: { label: 'South Korea & UN forces', q: ['Q884', ['Q30', '1950-06-27'], ['Q145', '1950-06-29'], ['Q16', '1950-07-12'], ['Q408', '1950-06-29'], ['Q664', '1950-07-03'], ['Q43', '1950-10-17'], ['Q142', '1950-11-29']] },
      b: { label: 'North Korea & China', q: ['Q423', ['Q148', '1950-10-19']] } } },
  { id: 'algerian-war', bf: 'u246', name: 'Algerian War', wiki: 'Algerian War', start: '1954-11-01', end: '1962-03-19', deaths: { prio: [49] },
    sides: { a: { label: 'France', q: ['Q142'] }, b: { label: 'FLN', q: [] } }, theatre: ['Q262'] },
  { id: 'vietnam-war', bf: 'u293', name: 'Vietnam War', wiki: 'Vietnam War', start: '1955-11-01', end: '1975-04-30', deaths: { prio: [52, 96] },
    sides: { a: { label: 'South Vietnam & allies', q: ['Q180573', ['Q30', '1965-03-08', '1973-03-29'], ['Q408', '1962-08-03', '1972-12-18'], ['Q884', '1964-09-22', '1973-03-23'], ['Q664', '1964-06-01', '1972-12-31'], ['Q869', '1965-01-01', '1972-12-31']] },
      b: { label: 'North Vietnam & Viet Cong', q: ['Q172640'] } }, theatre: ['Q424', 'Q819'] },
  { id: 'nigerian-civil-war', bf: 'u303', name: 'Nigerian Civil War', wiki: 'Nigerian Civil War', start: '1967-07-06', end: '1970-01-15', deaths: { prio: [107] },
    sides: { a: { label: 'Nigeria', q: [] }, b: { label: 'Biafra', q: [] } }, theatre: ['Q1033'] },
  { id: 'cambodian-civil-war', bf: 'u300', name: 'Cambodian Civil War', wiki: 'Cambodian Civil War', start: '1970-03-18', end: '1975-04-17', deaths: { prio: [103] },
    sides: { a: { label: 'Khmer Republic & US', q: [] }, b: { label: 'Khmer Rouge & North Vietnam', q: [] } }, theatre: ['Q424'] },
  { id: 'bangladesh-liberation', bf: 'u312', name: 'Bangladesh Liberation War', wiki: 'Bangladesh Liberation War', start: '1971-03-26', end: '1971-12-16', deaths: { prio: [116] },
    sides: { a: { label: 'Bangladesh (Mukti Bahini) & India', q: [['Q668', '1971-12-03']] }, b: { label: 'Pakistan', q: ['Q843'] } } },
  { id: 'lebanese-civil-war', bf: 'u260', name: 'Lebanese Civil War', wiki: 'Lebanese Civil War', start: '1975-04-13', end: '1990-10-13', deaths: { prio: [63] },
    sides: { a: { label: 'Lebanese government & allies', q: [] }, b: { label: 'Militias', q: [] } }, theatre: ['Q822'] },
  { id: 'angolan-civil-war', bf: 'u327', name: 'Angolan Civil War', wiki: 'Angolan Civil War', start: '1975-11-11', end: '2002-04-04', deaths: { prio: [131] }, ged: [327],
    sides: { a: { label: 'MPLA government & Cuba', q: [] }, b: { label: 'UNITA, FNLA & South Africa', q: [] } }, theatre: ['Q916'] },
  { id: 'mozambican-civil-war', bf: 'u332', name: 'Mozambican Civil War', wiki: 'Mozambican Civil War', start: '1977-05-30', end: '1992-10-04', deaths: { prio: [136] }, ged: [332],
    sides: { a: { label: 'FRELIMO government', q: [] }, b: { label: 'RENAMO', q: [] } }, theatre: ['Q1029'] },
  { id: 'soviet-afghan', bf: 'u333', name: 'Soviet–Afghan War', wiki: 'Soviet–Afghan War', start: '1979-12-24', end: '1989-02-15', deaths: { prio: [137] }, ged: [333],
    sides: { a: { label: 'Afghan government & Soviet Union', q: ['Q15180'] }, b: { label: 'Mujahideen', q: [] } }, theatre: ['Q889'] },
  { id: 'salvadoran-civil-war', bf: 'u316', name: 'Salvadoran Civil War', wiki: 'Salvadoran Civil War', start: '1979-10-15', end: '1992-01-16', deaths: { prio: [120] }, ged: [316],
    sides: { a: { label: 'Government of El Salvador', q: [] }, b: { label: 'FMLN', q: [] } }, theatre: ['Q792'] },
  { id: 'iran-iraq', bf: 'u324', name: 'Iran–Iraq War', wiki: 'Iran–Iraq War', start: '1980-09-22', end: '1988-08-20', deaths: { prio: [128] },
    sides: { a: { label: 'Iran', q: ['Q794'] }, b: { label: 'Iraq', q: ['Q796'] } } },
  { id: 'sri-lankan-civil-war', bf: 'u352', name: 'Sri Lankan Civil War', wiki: 'Sri Lankan Civil War', start: '1983-07-23', end: '2009-05-18', deaths: { prio: [157] }, ged: [352],
    sides: { a: { label: 'Government of Sri Lanka', q: [] }, b: { label: 'LTTE (Tamil Tigers)', q: [] } }, theatre: ['Q854'] },
  { id: 'gulf-war', name: 'Gulf War', wiki: 'Gulf War', start: '1990-08-02', end: '1991-02-28', deaths: { ucdp: true, prio: [176] }, ged: [371],
    sides: { a: { label: 'Kuwait & coalition', q: ['Q817', ['Q30', '1991-01-17'], ['Q145', '1991-01-17'], ['Q851', '1991-01-17'], ['Q142', '1991-01-17'], ['Q79', '1991-01-17'], ['Q858', '1991-01-17']] },
      b: { label: 'Iraq', q: ['Q796'] } }, control: [['Q817', 'b', '1990-08-02', '1991-02-26']] },
  { id: 'bosnian-war', name: 'Bosnian War', wiki: 'Bosnian War', start: '1992-04-06', end: '1995-12-14', deaths: { ucdp: true, prio: [194] }, ged: [389, 397, 398],
    sides: { a: { label: 'Bosnian government', q: [] }, b: { label: 'Republika Srpska & Yugoslavia', q: [['Q83286', null, '1992-04-26'], ['Q838261', '1992-04-27']] } }, theatre: ['Q225'] },
  { id: 'first-chechen', name: 'First Chechen War', wiki: 'First Chechen War', start: '1994-12-11', end: '1996-08-31', deaths: { ucdp: true, prio: [206] }, ged: [401],
    sides: { a: { label: 'Russia', q: [] }, b: { label: 'Chechen Republic of Ichkeria', q: [] } } },
  { id: 'eritrean-ethiopian', name: 'Eritrean–Ethiopian War', wiki: 'Eritrean–Ethiopian War', start: '1998-05-06', end: '2000-06-18', deaths: { ucdp: true, prio: [215] }, ged: [409],
    sides: { a: { label: 'Eritrea', q: ['Q986'] }, b: { label: 'Ethiopia', q: ['Q115'] } } },
  { id: 'second-congo', name: 'Second Congo War', wiki: 'Second Congo War', start: '1998-08-02', end: '2003-07-18', deaths: { ucdp: true, prio: [86] }, ged: [283],
    sides: { a: { label: 'DR Congo & allies', q: ['Q974', 'Q916', 'Q954', 'Q1030'] }, b: { label: 'Rwanda, Uganda & rebels', q: ['Q1037', 'Q1036', 'Q967'] } } },
  { id: 'second-chechen', name: 'Second Chechen War', wiki: 'Second Chechen War', start: '1999-08-26', end: '2009-04-16', deaths: { ucdp: true, prio: [206] }, ged: [401, 414, 432],
    sides: { a: { label: 'Russia', q: [] }, b: { label: 'Chechen separatists & Caucasus Emirate', q: [] } } },
  { id: 'afghanistan-2001', name: 'War in Afghanistan (2001–2021)', wiki: 'War in Afghanistan (2001–2021)', start: '2001-10-07', end: '2021-08-30', deaths: { ucdp: true, prio: [137] }, ged: [333, 13692, 13637],
    sides: { a: { label: 'Afghan government, US & NATO', q: ['Q30', 'Q145'] }, b: { label: 'Taliban & allies', q: [] } }, theatre: ['Q889'] },
  { id: 'iraq-war', name: 'Iraq War', wiki: 'Iraq War', start: '2003-03-20', end: '2011-12-18', deaths: { ucdp: true, prio: [226, 62] }, ged: [420, 259],
    sides: { a: { label: 'US-led coalition & new Iraqi government', q: ['Q30', 'Q145', 'Q408', 'Q36'] }, b: { label: "Ba'athist Iraq, then insurgents", q: [] } }, theatre: ['Q796'] },
  { id: 'syrian-civil-war', name: 'Syrian civil war', wiki: 'Syrian civil war', start: '2011-03-15', end: '2024-12-08', deaths: { ucdp: true }, ged: [299, 13604, 13042, 13809],
    sides: { a: { label: 'Assad government, Russia & Iran', q: [] }, b: { label: 'Rebels, Islamic State & SDF', q: [] } }, theatre: ['Q858'] },
  { id: 'yemen', name: 'Yemeni civil war', wiki: 'Yemeni civil war (2014–present)', start: '2014-09-16', end: null, deaths: { ucdp: true }, ged: [230, 402, 13645],
    sides: { a: { label: 'Government & Saudi-led coalition', q: [] }, b: { label: 'Houthis (Ansar Allah)', q: [] } }, theatre: ['Q805'] },
  { id: 'tigray', name: 'Tigray War', wiki: 'Tigray war', start: '2020-11-03', end: '2022-11-02', deaths: { ucdp: true }, ged: [267],
    sides: { a: { label: 'Ethiopia & Eritrea', q: ['Q986'] }, b: { label: 'Tigray (TPLF)', q: [] } }, theatre: ['Q115'] },
  { id: 'russia-ukraine', name: 'Russian invasion of Ukraine', wiki: 'Russian invasion of Ukraine', start: '2022-02-24', end: null, deaths: { ucdp: true }, ged: [13243, 13306],
    sides: { a: { label: 'Ukraine', q: ['Q212'] }, b: { label: 'Russia', q: ['Q159'] } } },
  { id: 'sudan-2023', name: 'Sudanese civil war (2023–present)', wiki: 'Sudanese civil war (2023–present)', start: '2023-04-15', end: null, deaths: { ucdp: true }, ged: [309],
    sides: { a: { label: 'Sudanese Armed Forces', q: [] }, b: { label: 'Rapid Support Forces', q: [] } }, theatre: ['Q1049'] },
  { id: 'gaza-war', name: 'Gaza war', wiki: 'Gaza war', start: '2023-10-07', end: '2025-10-10', deaths: { ucdp: true }, ged: [234, 426],
    sides: { a: { label: 'Israel', q: ['Q801'] }, b: { label: 'Hamas & allies', q: [] } } },
];

// ---- What War Focus leaves out of a war although Wikidata makes it part of the war (Jude's decision of 17 November
// 2026, VM-DECISIONS-17NOV.md section G, under the rule of section H5: an entry of its own needs an interstate war of
// 1,000 or more battle deaths in a year, a civil war of 25,000 or more, or the Falklands War by name). Each row's item
// is left out with everything Wikidata makes part of it, by any path, even where a part is also part of the war
// directly (the United States' strikes in Yemen of March and April 2025 are part of both). `why` is the page's method
// line; `source` and `url` name the figures it gives, as UCDP publishes them.
export const LEFT_OUT = [
  { war: 'gaza-war', qid: 'Q123285238', name: 'Red Sea crisis', ucdp: 16099,
    why: 'the Red Sea crisis and every operation Wikidata makes part of it. UCDP records them as a conflict of their own, the United Kingdom and the United States against the government of Yemen over the Red Sea, the Bab al-Mandab and the Gulf of Aden (its conflict 16099), with 130 battle deaths in 2024 and 781 in 2025 (best estimates). That is below the 1,000 battle deaths in a year that War Focus asks of an interstate war for an entry of its own, so they are shown neither here nor as a war of their own',
    source: 'UCDP Battle-Related Deaths Dataset v26.1, conflict level', url: 'https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip' },
];

/**
 * The items left out of a war (LEFT_OUT): Map q → the row that leaves it out, for each row's item and everything below
 * it in Wikidata's "part of" links (edges [{ c, parent }]), whatever other parent a part also has.
 */
export function leftOutOf(warId, edges, table = LEFT_OUT) {
  const kids = new Map();
  for (const { c, parent } of edges) (kids.get(parent) || kids.set(parent, []).get(parent)).push(c);
  const out = new Map();
  for (const row of table.filter(r => r.war === warId)) {
    const queue = [row.qid];
    while (queue.length) { const q = queue.shift(); if (out.has(q)) continue; out.set(q, row); queue.push(...(kids.get(q) || [])); }
  }
  return out;
}
