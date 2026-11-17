// The Master Index's entity types, from an entity's Wikidata statements (P31 "instance of", with P569 and P36 as
// signs): person, election, conflict, party, idea, place, organisation, event or topic, in that order of precedence.
// lake/scripts/build.mjs types every record by typeOf; tests/master-index.test.mjs tests it. Moved out of build.mjs (a
// script, which a test cannot import) on 16 November 2026 (S0), when the polis and the ancient city became places.
export const PERSON = new Set(['Q5']), CONFLICT = new Set(['Q198', 'Q180684', 'Q350604', 'Q178561', 'Q8465', 'Q103495', 'Q645883', 'Q1261499', 'Q124734', 'Q831663', 'Q2001676', 'Q1006311', 'Q3119160', 'Q188055']);
export const PLACE = new Set(['Q6256', 'Q3624078', 'Q3024240', 'Q7275', 'Q48349', 'Q417175', 'Q1250464', 'Q133442', 'Q1763527', 'Q107390', 'Q35657', 'Q34876', 'Q515', 'Q5119', 'Q15634554', 'Q28171280', 'Q112099', 'Q161243', 'Q131569',
  // A polis and an ancient city (S0, 16 November 2026: Sparta, Q5690, was a topic).
  'Q148837', 'Q15661340']);
export const PARTY = new Set(['Q7278', 'Q233591', 'Q1393724', 'Q6440541', 'Q2510446']);
export const IDEA = new Set(['Q12909644', 'Q179805', 'Q7257', 'Q1387659', 'Q2198855', 'Q12345877', 'Q11660', 'Q5891', 'Q4692']);
export const ORG = new Set(['Q4830453', 'Q6881511', 'Q891723', 'Q43229', 'Q783794', 'Q484652', 'Q163740', 'Q245065']);
export function typeOf(e) {
  const p31 = (e.claims?.P31 || []).map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);
  const label = e.labels?.en?.value || '';
  const has = s => p31.some(x => s.has(x));
  if (has(PERSON) || e.claims?.P569) return 'person';
  if (/election|referendum/i.test(label)) return 'election';
  if (has(CONFLICT) || /\b(war|battle|siege|invasion|insurgency|conflict|revolt|rebellion|uprising|massacre|genocide|coup)\b/i.test(label)) return 'conflict';
  if (has(PARTY)) return 'party';
  if (has(IDEA) || /ism$/i.test(label)) return 'idea';
  if (has(PLACE) || e.claims?.P36) return 'place';
  if (has(ORG)) return 'organisation';
  if (e.claims?.P585 || e.claims?.P580) return 'event';
  return 'topic';
}
