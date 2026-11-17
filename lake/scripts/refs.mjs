// What supports a Wikidata statement, by PRP-SCHOLAR-USP-DESIGN.md 5.1: "a reference of only P143, P4656 or P887 is
// unreferenced, and Wikipedia-only support reads 'Wikipedia-sourced, unverified'".
//
// Each of a statement's references is a set of snaks. One counts as a reference when it names where the value was
// stated: P248 (stated in, a work's item), P854 (reference URL) or a record in a database (an external identifier).
// Its place in that work is kept as `loc`: P304 (page or pages, "p. 112–114"), else P958 (section, verse or paragraph),
// else the record ("P214:113230702"). P143 (imported from Wikimedia project) and P4656 (Wikimedia import URL) say only
// that a bot copied the value from a Wikipedia: "wikipedia", with the project's item as `via`. P887 (based on
// heuristic) and the retrieval date P813 name no source. The best reference wins: referenced, then wikipedia, then none.
// Pure: no Node APIs.

const IMPORTED = ['P143', 'P4656'];
const first = (snaks, p) => (snaks?.[p] || []).find(s => s?.snaktype === 'value')?.datavalue?.value;
const idOf = v => (v && typeof v === 'object' ? v.id || (v['numeric-id'] ? `Q${v['numeric-id']}` : null) : null);

function readOne(snaks) {
  if (!snaks || typeof snaks !== 'object') return null;
  const stated = idOf(first(snaks, 'P248')), url = first(snaks, 'P854');
  const record = Object.entries(snaks).find(([, list]) => (list || []).some(s => s?.datatype === 'external-id' && s.snaktype === 'value'));
  if (stated || typeof url === 'string' || record) {
    const page = first(snaks, 'P304'), section = first(snaks, 'P958');
    const loc = typeof page === 'string' ? `p. ${page}` : typeof section === 'string' ? section
      : record ? `${record[0]}:${record[1].find(s => s.snaktype === 'value').datavalue.value}` : null;
    const ref = stated || (typeof url === 'string' ? url : null);
    return { support: 'referenced', ...(ref ? { ref } : {}), ...(loc ? { loc } : {}) };
  }
  for (const p of IMPORTED) {
    const v = first(snaks, p);
    if (v !== undefined) return { support: 'wikipedia', ...(idOf(v) ? { via: idOf(v) } : typeof v === 'string' ? { via: v } : {}) };
  }
  return null;
}

/** What supports a claim: { support: 'referenced', ref?, loc? } | { support: 'wikipedia', via? } | { support: 'none' }. */
export function support(claim) {
  let wiki = null;
  for (const r of claim?.references || []) {
    const got = readOne(r?.snaks);
    if (got?.support === 'referenced') return got;
    if (got && !wiki) wiki = got;
  }
  return wiki || { support: 'none' };
}

/** A claim's support in words, for a value's source line: 'Wikipedia-sourced, unverified (imported from French
 *  Wikipedia)', 'no reference', or the work and place. `label(q)` names an item. */
export function supportText(s, label = q => q) {
  if (s?.support === 'referenced') return `referenced${s.ref ? `: ${/^Q\d+$/.test(s.ref) ? label(s.ref) : s.ref}` : ''}${s.loc ? `, ${s.loc}` : ''}`;
  if (s?.support === 'wikipedia') return `Wikipedia-sourced, unverified${s.via ? ` (imported from ${label(s.via)})` : ''}`;
  return 'no reference';
}
