// The Master Index's entity types, from an entity's Wikidata statements (P31 "instance of", with P569 and P36 as
// signs): person, election, conflict, party, idea, place, organisation, event or topic. typeOf reads them in this order:
// a person; an election by its label; a treaty or a partition (an event); a conflict by its class; a party; an idea by
// its class; a conflict by a war word in its label, unless its class is no war; an idea by its "-ism"; a place by its class; an international
// organisation; a place by its capital; an organisation; a thing (a topic); an event by its date; else a topic.
// lake/scripts/build.mjs types every record by typeOf; tests/master-index.test.mjs tests it. Moved out of build.mjs (a
// script, which a test cannot import) on 16 November 2026 (S0), when the polis and the ancient city became places.
// Corrected on 18 November 2026 (MI-12, step F3 of VM-MASTER-INDEX-CANON-REVIEW.md, fault 7; and row 10 of
// VM-ATLAS-TOPICS-SUGGESTIONS.md part D), each class read from Wikidata that day: see the notes at each set.
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
const WAR_WORD = /\b(war|battle|siege|invasion|insurgency|conflict|revolt|rebellion|uprising|massacre|genocide|coup)\b/i;
export function typeOf(e) {
  if (e.id && TYPE_OVERRIDES[e.id]) return TYPE_OVERRIDES[e.id];
  const p31 = (e.claims?.P31 || []).map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);
  const label = e.labels?.en?.value || '';
  const has = s => p31.some(x => s.has(x));
  if (has(PERSON) || e.claims?.P569) return 'person';
  if (/election|referendum/i.test(label)) return 'election';
  if (has(EVENT)) return 'event';
  if (has(CONFLICT)) return 'conflict';
  if (has(PARTY)) return 'party';
  // An idea's classes before the war words in a label: just war theory is a doctrine.
  if (has(IDEA)) return 'idea';
  if (WAR_WORD.test(label) && !has(NOT_CONFLICT)) return 'conflict';
  if (ISM.test(label) && !NOT_ISM.test(label)) return 'idea';
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
