// The Master Index's entity types, from an entity's Wikidata statements (P31 "instance of", with P569, P36 and P576 as
// signs): person, election, conflict, party, polity, period, idea, series, site, place, organisation, event or topic.
// typeOf reads them in this order: a person; an election by its label; a treaty or a partition (an event); a conflict
// by its class; a party; a polity (a state that no longer exists); a period, unless a war word in its label makes it a
// conflict; an idea by its class; a conflict by a war word in its label, unless its class is no war; an idea by its
// "-ism"; a series (an entry that is only a grouping of others); a site; a place by its class; an international
// organisation; a place by its capital; an organisation; a thing (a topic); an event by its date; else a topic.
// lake/scripts/build.mjs types every record by typeOf and names the type by TYPE_NAMES; tests/master-index.test.mjs
// tests both. Moved out of build.mjs (a script, which a test cannot import) on 16 November 2026 (S0), when the polis and
// the ancient city became places.
// Corrected on 18 November 2026 (MI-12, step F3 of VM-MASTER-INDEX-CANON-REVIEW.md, fault 7; and row 10 of
// VM-ATLAS-TOPICS-SUGGESTIONS.md part D), each class read from Wikidata that day: see the notes at each set.
// Polity, Period, Site and Series came on 21 November 2026 (MI-12, MI-13 and MI-07; the atlas review's question 3 of
// part E, PRP-SCHOLAR-USP-DESIGN.md 7.1), each class read from Wikidata that day: see the notes at POLITY and after.

// Every type typeOf gives, and the name a reader sees for it (the "Type:" tag, the page, the catalogue).
export const TYPE_NAMES = { person: 'Person', place: 'Place or state', polity: 'Polity', period: 'Period', site: 'Site', series: 'Series',
  conflict: 'War or conflict', election: 'Election', party: 'Political party', idea: 'Idea or school of thought', organisation: 'Organisation', event: 'Event', topic: 'Topic' };
export const TYPES = Object.keys(TYPE_NAMES);

export const PERSON = new Set(['Q5']), CONFLICT = new Set(['Q198', 'Q180684', 'Q350604', 'Q178561', 'Q8465', 'Q103495', 'Q645883', 'Q1261499', 'Q124734', 'Q831663', 'Q2001676', 'Q1006311', 'Q3119160', 'Q188055']);
// The treaty (Q131569) was here until 18 November 2026, so the Paris Agreement, START II and the Schengen Agreement were
// places; a treaty is an event (EVENT).
export const PLACE = new Set(['Q6256', 'Q3624078', 'Q3024240', 'Q7275', 'Q48349', 'Q417175', 'Q1250464', 'Q133442', 'Q1763527', 'Q107390', 'Q35657', 'Q34876', 'Q515', 'Q5119', 'Q15634554', 'Q28171280', 'Q112099', 'Q161243',
  // A polis and an ancient city (S0, 16 November 2026: Sparta, Q5690, was a topic).
  'Q148837', 'Q15661340',
  // A Chinese dynasty and an ancient Chinese state (18 November 2026: the Zhou dynasty, Q35216, which has no capital in
  // Wikidata, was a topic, while the Shang, which has one, was a place).
  'Q12857432', 'Q836688']);
// A political party in Germany, a defunct political party and a state party (18 November 2026: the Nazi Party, Q7320,
// carries these and no other party class, and was a topic).
// The kinds of party below them were also topics; each is a subclass (P279) of political party (Q7278) in Wikidata,
// walked up on 18 November 2026: a social democratic party (the Norwegian Labour Party), a Nordic agrarian party, a
// former liberal party, a political party in Spain, a Soviet republic's Communist party, a political party in
// Bulgaria, a political party in Croatia, a European political party (the European People's Party), a green party
// (the Green Party of Canada) and a political party in the Ottoman Empire.
export const PARTY = new Set(['Q7278', 'Q233591', 'Q1393724', 'Q6440541', 'Q2510446', 'Q2023214', 'Q40482169', 'Q1469680',
  'Q108564724', 'Q3282509', 'Q23702035', 'Q6065085', 'Q115326462', 'Q43791339', 'Q43639983', 'Q24649', 'Q3778417', 'Q136193351']);
// A school of economic thought (Q3048444) and a doctrine (Q117850) since 18 November 2026: Keynesian, Austrian, Chicago,
// classical, post-Keynesian and New Keynesian economics were topics, and just war theory a war by its label. Artificial
// intelligence (Q11660) is no longer here: AlphaFold, software, carries it as a class.
export const IDEA = new Set(['Q12909644', 'Q179805', 'Q7257', 'Q1387659', 'Q2198855', 'Q12345877', 'Q5891', 'Q4692', 'Q3048444', 'Q117850']);
export const ORG = new Set(['Q4830453', 'Q6881511', 'Q891723', 'Q43229', 'Q783794', 'Q484652', 'Q163740', 'Q245065']);
// International organisations come before a capital (18 November 2026: the European Union, Q458, a regional
// organisation and a supranational union with no place class but a capital, P36, was a place): international,
// intergovernmental and regional organisations, a supranational union, a political and economic union. A place's own
// classes still come first.
export const INTERNATIONAL_ORG = new Set(['Q484652', 'Q245065', 'Q4120211', 'Q1335818', 'Q120121699']);
// Events whatever their dates or their other classes: a treaty, with the kinds of treaty that entries carry without the
// class itself (a peace treaty, a multilateral treaty, a United Nations treaty, a treaty of the European Union, a free
// trade agreement: the Treaty on European Union, the Convention against Torture and NAFTA were topics), and a partition
// (18 November 2026: the partition of India, Q129053, which Wikidata also makes a war and a civil war, was a conflict).
export const EVENT = new Set(['Q131569', 'Q625298', 'Q6934728', 'Q1691434', 'Q11122', 'Q3536928', 'Q518554']);
// Things, not ideas or events, whatever their label or dates: an archaeological artefact (the Antikythera mechanism,
// Q182324, was an idea by its label's "-ism" and has a start time, P580).
export const THING = new Set(['Q220659']);

// ---- Polity: a state or other body that ruled territory and no longer exists (21 November 2026). A state that exists
// today stays a place ("Place or state"), as do cities, regions and continents; so a polity is decided only among what
// would otherwise be a place, by its classes, never by a word in its label.
// Classes every instance of which is a state that no longer exists: a historical country, a historical unrecognised
// state, a historical Chinese state, a Chinese dynasty, an ancient Chinese state, a Hellenistic kingdom, a historic state
// of Italy, a state in the Holy Roman Empire, a state of the German Confederation, a state in the Confederation of the
// Rhine, a Napoleonic client state, a republic of the Soviet Union, a subdivision of the Socialist Federal Republic of
// Yugoslavia, a League of Nations mandate, a han (a Japanese domain), a crown land of Austria, a shogunate and a former
// administrative territorial entity. The Soviet Union, the Holy Roman Empire, the Republic of Florence and the Ming
// dynasty are also a sovereign state in Wikidata (as they were), and polities by these classes.
export const POLITY = new Set(['Q3024240', 'Q99541706', 'Q50068795', 'Q12857432', 'Q836688', 'Q3932025', 'Q107230986', 'Q26830017', 'Q113136497',
  'Q26879769', 'Q26879763', 'Q236036', 'Q12959600', 'Q426759', 'Q841985', 'Q681026', 'Q1074150', 'Q19953632']);
// A polis and a city-state: a polity (Sparta, Classical Athens), unless it is also a city lived in today (Hong Kong,
// Macau, the island of Samos).
export const CITY_STATE = new Set(['Q148837', 'Q133442']);
// Classes of a state or a ruled territory that may still exist: a polity only with a date it was dissolved (P576), and
// only where it would otherwise be a place. A sovereign state, a country, a state, a republic, an empire, a colonial
// empire, a kingdom, a realm, a colony, a crown colony, a protectorate, a confederation, a federation, a puppet, vassal,
// satellite, client or rump state, a duchy, a grand duchy, a principality, a landgraviate, a sultanate, a caliphate, a
// khanate, a state with limited recognition, a self-proclaimed state, a quasi-state, a de facto regime, a soviet
// republic, a military occupation, an occupied territory, a dependent territory, a territory, a political territorial
// entity, a federated state, an overseas province of Portugal. (Italian Libya, the Crown Colony of Malta, the
// Confederation of the Rhine and the British Empire carry no historical-country class; Oman, a sultanate, and Greenland,
// a dependent territory, have no date of dissolution and stay places.)
export const STATE = new Set(['Q3624078', 'Q6256', 'Q7275', 'Q7270', 'Q48349', 'Q1790360', 'Q417175', 'Q1250464', 'Q133156', 'Q1351282', 'Q164142',
  'Q170156', 'Q43702', 'Q208164', 'Q1371288', 'Q325261', 'Q1151405', 'Q1088391', 'Q154547', 'Q165116', 'Q208500', 'Q20856058', 'Q12759805', 'Q131401',
  'Q331644', 'Q10711424', 'Q21512251', 'Q23037160', 'Q1179466', 'Q1075404', 'Q188686', 'Q2577883', 'Q161243', 'Q4835091', 'Q1048835', 'Q107390', 'Q333542']);
// A city lived in today stays a place, whatever older classes Wikidata also gives it: a city, a big city, a metropolis,
// a capital city, a national capital, a largest city, a port city, a comune of Italy, a special administrative region of
// China, an island. (Venice is also an "Italian city-state", Hong Kong a city-state, Samos a polis, Byblos and Jericho
// an archaeological site or a tell.)
export const LIVING = new Set(['Q515', 'Q1549591', 'Q200250', 'Q5119', 'Q108178728', 'Q51929311', 'Q2264924', 'Q747074', 'Q779415', 'Q23442']);
// A sovereign state or a country with no date it was dissolved (P576) exists today and stays a place, whatever older
// classes Wikidata also gives it: the United States and Indonesia are also a "historical unrecognized state", Georgia a
// republic of the Soviet Union, Liechtenstein a state in the Confederation of the Rhine, Monaco and Vatican City a
// city-state (read 21 November 2026). The Soviet Union, the Republic of Florence and the Ming dynasty, sovereign states
// in Wikidata too, have their dates of dissolution.
export const CURRENT = new Set(['Q3624078', 'Q6256']);

// ---- Period: a named span of history (21 November 2026): a historical period, an era, a periodisation, a golden age,
// an archaeological age, an archaeological period, an age (the Middle Ages, the Age of Discovery). A polity's classes
// come first (the Zhou, Shang, Tang and Ming dynasties are also historical periods in Wikidata), and so do a war's (World
// War II, the Russo-Ukrainian war), and a war word in the label (the Cold War, which VM holds as a conflict). A
// movement Wikidata also classes as a period is a period (the High Renaissance); one it does not stays an idea (the
// Renaissance and the Age of Enlightenment are a cultural movement in Wikidata, read 21 November 2026, not a period).
export const PERIOD = new Set(['Q11514315', 'Q6428674', 'Q816829', 'Q238526', 'Q15401699', 'Q15401633', 'Q17522177']);
// A historical event or a revolution that Wikidata also calls a period is an event (the French Revolution).
export const NOT_PERIOD = new Set(['Q13418847', 'Q10931']);

// ---- Site: an archaeological site, a monument or a building of historical note (21 November 2026): an archaeological
// site and its kinds (an Ancient Greek or Roman archaeological site, a settlement site, a Bronze Age or Neolithic
// settlement, a tell, the Samian ware discovery sites), a monument, an ancient monument, a tomb, a mausoleum, the
// Egyptian pyramids and the step and smooth-sided pyramids, a Roman or ancient Greek temple, an ancient Roman
// structure, a ruined religious building, a Roman amphitheatre, an acropolis, a henge, a cromlech, a castle, a palace,
// a royal palace, a historic building, a former cathedral, a destroyed building or structure. A museum, a university,
// a school or college building and a heritage designation are not among them: the British Museum, the Sorbonne and
// Trinity College are institutions. A polis or a city-state that is also an archaeological site is a polity (Classical
// Athens); a city lived in today stays a place (Byblos, Jericho).
export const SITE = new Set(['Q839954', 'Q93342462', 'Q21752084', 'Q1708422', 'Q65064889', 'Q106491339', 'Q755017', 'Q102202066', 'Q4989906', 'Q3395377',
  'Q381885', 'Q162875', 'Q175582', 'Q1456099', 'Q4363262', 'Q867143', 'Q267596', 'Q14752696', 'Q96352513', 'Q7362268', 'Q131668', 'Q1035294', 'Q935773',
  'Q23413', 'Q16560', 'Q53536964', 'Q35112127', 'Q97588309', 'Q19860854']);

// ---- Series: an entry that is itself only a grouping of other entries (21 November 2026; MI-07): every class it has is
// a series, a series of wars, the wars of one sovereign, the events of a year or time period ("2006 in Iceland"), a
// series of creative works or a group of literary works. An entry with a class of its own besides is not only a grouping
// (the 2011–2012 Iranian protests, the Yugoslav Wars, an ethnic conflict too; the Hippocratic Corpus, a written work
// too). A war that has battles stays a war: Wikidata's war or civil war class (the Napoleonic Wars, the Punic Wars), or
// the war word in its label (the War in the Sahel), comes first; it gains its members under MI-07.
export const SERIES = new Set(['Q20937557', 'Q104212151', 'Q130525743', 'Q18340514', 'Q7725310', 'Q17518870']);

// The few entries whose classes cannot tell them apart from what they are not, each with its reason (18 November 2026).
export const TYPE_OVERRIDES = {
  // Wikidata makes it a school of thought, as it does the Frankfurt School; it was a group of philosophers and
  // scientists ("former group of philosophers and scientists", its Wikidata description), so an organisation.
  Q208238: 'organisation',
  // The Virginia school of political economy has no class (P31) in Wikidata at all; its Wikidata description is
  // "school of economic thought", as the Chicago and Austrian schools' class is.
  Q3482308: 'idea',
};
// Classes that are no war, whatever a war word in the label says (18 November 2026: "protests against the 2026 Iran
// war", "international sanctions during the Russo-Ukrainian war" and the "Twelve-Day War ceasefire" were conflicts): a
// protest, an international sanction, a ceasefire, an arrest warrant, a Wikimedia list article, humanitarian aid, an
// international reaction. Such an entry is typed by the rules after the war word (an event by its date, else a topic).
export const NOT_CONFLICT = new Set(['Q273120', 'Q2061202', 'Q208383', 'Q584041', 'Q13406463', 'Q826745', 'Q100886746']);
// A label's "-ism" makes an idea, but not a mechanism or a magnetism (the Higgs mechanism, electromagnetism).
const ISM = /ism$/i, NOT_ISM = /(mechanism|magnetism)$/i;
import { wikidataDate, bestClaim } from './dates.mjs';
const WAR_WORD = /\b(war|battle|siege|invasion|insurgency|conflict|revolt|rebellion|uprising|massacre|genocide|coup)\b/i;
export function typeOf(e) {
  if (e.id && TYPE_OVERRIDES[e.id]) return TYPE_OVERRIDES[e.id];
  // A date counts as a sign only when it is the date the record will show (dates.mjs datedFacts reads it the same way):
  // Wikidata's best statement, never a deprecated one, and one that states a time. A "no value" or "unknown value"
  // statement, or only a deprecated date, ends nothing (second review X1, 21 November 2026: a state of today whose
  // dissolution is stated as "no value" was a polity, with no date to show for it).
  const dated = p => Boolean(wikidataDate(bestClaim(e.claims?.[p])));
  const p31 = (e.claims?.P31 || []).map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);
  const label = e.labels?.en?.value || '';
  const has = s => p31.some(x => s.has(x));
  if (has(PERSON) || e.claims?.P569) return 'person';
  if (/election|referendum/i.test(label)) return 'election';
  if (has(EVENT)) return 'event';
  if (has(CONFLICT)) return 'conflict';
  if (has(PARTY)) return 'party';
  // A polity before a period (a Chinese dynasty is also a historical period) and before an idea, among what would
  // otherwise be a place: a place's class, a polity's, or a capital with no international organisation's class.
  const living = has(LIVING), dissolved = dated('P576');
  // Among a state's or a ruled territory's classes, an end time (P582) stands for a date of dissolution: Wikidata records
  // the end of a military occupation so (the Ukrainian occupation of Kursk Oblast, Q129167851, has P582 May 2025 and no
  // P576, read 21 November 2026). A sovereign state or a country still needs its P576 to be a polity (CURRENT), and a
  // period's end time ends a span, not a state: Ottoman Palestine (Q2909425, a historical period and a dependent
  // territory with an end time) stays a period.
  const ended = dissolved || (dated('P582') && !has(PERIOD));
  const placeLike = has(PLACE) || has(POLITY) || (Boolean(e.claims?.P36) && !has(INTERNATIONAL_ORG));
  if (!(has(CURRENT) && !dissolved) && (has(POLITY) || (!living && has(CITY_STATE)) || (placeLike && !living && has(STATE) && ended))) return 'polity';
  const warByLabel = WAR_WORD.test(label) && !has(NOT_CONFLICT);
  // A period before an idea (the High Renaissance is an art movement too), but a war word keeps a conflict (the Cold War).
  if (has(PERIOD) && !has(NOT_PERIOD) && !warByLabel) return 'period';
  // An idea's classes before the war words in a label: just war theory is a doctrine.
  if (has(IDEA)) return 'idea';
  if (warByLabel) return 'conflict';
  if (ISM.test(label) && !NOT_ISM.test(label)) return 'idea';
  if (p31.length && p31.every(x => SERIES.has(x))) return 'series';
  // A site before a place (Pompeii is also an ancient city), unless it is a city lived in today.
  if (has(SITE) && !living) return 'site';
  // A place's classes first (the Soviet Union is a country and also, in Wikidata, a supranational union), then an
  // international organisation, then a capital as the sign of a place.
  if (has(PLACE)) return 'place';
  if (has(INTERNATIONAL_ORG)) return 'organisation';
  if (e.claims?.P36) return 'place';
  if (has(ORG)) return 'organisation';
  if (has(THING)) return 'topic';
  if (e.claims?.P585 || e.claims?.P580) return 'event';
  return 'topic';
}
