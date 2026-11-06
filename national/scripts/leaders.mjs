// National Analysis: who leads each country. Pure functions, no network, so the tests can load them (build.mjs feeds
// them Wikidata's statements, the Political Retrospective's leader lists and leader-corrections.json).
//
// Heads of state (P35) and government (P6) are read as statements, not through Wikidata's truthy shortcut (wdt:),
// which returns every best-ranked statement, ended ones included. A statement counts only when it is not deprecated,
// has no end time (P582), was not replaced by someone else (P1366) and does not start after today, and when it names a
// living human (not a council or other body); among several, the latest start time (P580) wins, then a preferred
// statement, then the name.
// The country's statements are often stale (an old head's statement left open, even preferred, when the next one was
// added), so they are checked against the people's own "position held" (P39) statements for the country's office of
// head of state (P1906) or of government (P1313). A country statement is set aside when the person's statements for
// that office have all ended (none before it began) and someone else's dated statement for the office began on or
// after the person's last one did (a successor). Where no country statement is left, the open, dated P39 statements
// for the office are the candidates. The country's statements still come first otherwise: P39 statements of past
// holders are often left open too. What Wikidata still gets wrong is put right in leader-corrections.json.
//
// The current leader is the Retrospective's last leader only when that entry is still open, is a name (has letters)
// and agrees with the present head of state or government by family name. Otherwise it is the head who governs: the
// head of state in a presidential system, the head of government elsewhere, or whichever of the two there is.
// `source` says which.

export const hasLetters = s => /\p{L}/u.test(String(s ?? ''));

// One statement: { name, qid, rank: 'preferred' | 'normal' | 'deprecated', start, end, dead, human } (dates as
// YYYY-MM-DD or null; `dead` is a date of death, `human` is false for a body such as a council).
export function pickHead(statements = [], today = new Date().toISOString().slice(0, 10)) {
  const open = statements.filter(s => s && s.rank !== 'deprecated' && !s.end && !s.dead && s.human !== false && !(s.start && s.start > today));
  if (!open.length) return null;
  const rank = s => (s.rank === 'preferred' ? 1 : 0);
  return [...open].sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')) || rank(b) - rank(a) || String(a.name || '').localeCompare(String(b.name || '')))[0];
}

// Wikidata's forms of government (P122 labels) in which the head of state governs.
export const PRESIDENTIAL = ['presidential system', 'super-presidential republic'];

// A name's letters only, without accents or case, with doubled letters collapsed and a closing -iy/-ij read as -y,
// so that Zelensky, Zelenskyy and Zelenskiy compare equal.
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/ß/g, 'ss')
  .replace(/[^\p{L}]/gu, '').replace(/(\p{L})\1+/gu, '$1').replace(/(?:iy|ij)$/u, 'y');
const words = s => String(s || '').split(/\s+/).filter(hasLetters);

// The family name the Retrospective gives (its short `name`), or else the last word of the full name.
export function familyName(entry) {
  if (hasLetters(entry?.name)) return entry.name;
  return words(entry?.full).at(-1) || null;
}

// True when the family name appears in the head's name as one word or as a run of words (de la Huerta).
export function sameFamily(family, headName) {
  const f = fold(family);
  if (!f || !hasLetters(headName)) return false;
  const w = words(headName).map(fold);
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= w.length; j++) if (w.slice(i, j).join('') === f) return true;
  return false;
}

// The Retrospective's last leader: the latest start (the last listed among equals).
export function lastLeader(leaders = []) {
  let last = null;
  for (const l of leaders) if (l && (!last || String(l.start || '') >= String(last.start || ''))) last = l;
  return last;
}

// heads: { hos, hog }, each { name, qid, start } or null. presidential: true where the head of state governs.
export function currentLeader(leaders, heads = {}, { presidential = false } = {}) {
  const { hos = null, hog = null } = heads;
  const last = lastLeader(leaders || []);
  const display = last && (hasLetters(last.full) ? last.full : last.name);
  // The short name, or else the last word of the full one (the short name can be misspelt: "Ilhma Aliyev").
  const families = last ? [familyName(last), words(last.full).at(-1)].filter(Boolean) : [];
  if (last && !last.end && hasLetters(display) && families.some(f => sameFamily(f, hos?.name) || sameFamily(f, hog?.name))) {
    const party = last.parties?.filter(p => !p.e).map(p => p.name)[0] || last.parties?.[0]?.name || null;
    return { name: display, since: last.start || null, party, url: last.url || null, source: 'retrospective' };
  }
  const [first, second] = presidential ? [hos, hog] : [hog, hos];
  const gov = hasLetters(first?.name) ? first : hasLetters(second?.name) ? second : null;
  if (!gov) return null;
  return { name: gov.name, since: gov.start || null, party: null, url: gov.qid ? `https://www.wikidata.org/wiki/${gov.qid}` : null, source: 'wikidata' };
}

// Corrections: [{ iso3, field: 'headOfState' | 'headOfGovernment', name, source, checked, replaces }]. One applies only
// while Wikidata still gives the value it replaces, so it lapses by itself once Wikidata is put right.
// heads: Map iso3 -> { headOfState, headOfGovernment } (each { name, qid, start } or null), changed in place.
export const FIELDS = ['headOfState', 'headOfGovernment'];
export function applyCorrections(heads, corrections = [], log = () => {}) {
  const applied = [], lapsed = [];
  for (const k of corrections) {
    if (!k || !FIELDS.includes(k.field) || !hasLetters(k.name) || !k.iso3) { log(`correction skipped (incomplete): ${JSON.stringify(k)}`); continue; }
    const h = heads.get(k.iso3);
    const now = h?.[k.field]?.name ?? null;
    if (h && now === (k.replaces ?? null)) {
      h[k.field] = { name: k.name, qid: null, start: null, corrected: true };
      applied.push(k);
      log(`correction applied: ${k.iso3} ${k.field} "${now ?? '(none)'}" -> "${k.name}" (${k.source}, checked ${k.checked})`);
    } else {
      lapsed.push(k);
      log(`correction lapsed: ${k.iso3} ${k.field}: Wikidata now gives "${now ?? '(none)'}", not "${k.replaces ?? '(none)'}"; remove it from leader-corrections.json`);
    }
  }
  return { applied, lapsed };
}

// SPARQL result rows -> Map country qid -> { hos, hog }. Each row: c (the country), prop ('hos' | 'hog'), h, hL (its
// label), rank, start, end, repl (a successor), dead (a date of death), human ('true' | 'false'; absent counts as
// human). `rows` are the country's own P35/P6 statements; `officeRows` are the P39 statements of the country's
// offices of head of state and government, ended ones included.
export function headsFromRows(rows, officeRows = [], today = new Date().toISOString().slice(0, 10)) {
  const v = x => x?.value ?? null;
  const day = x => (v(x) ? v(x).slice(0, 10) : null);
  const parse = b => ({
    country: v(b.c)?.split('/').pop(), prop: v(b.prop), name: v(b.hL), qid: v(b.h)?.split('/').pop() || null,
    rank: /Preferred/.test(v(b.rank) || '') ? 'preferred' : /Deprecated/.test(v(b.rank) || '') ? 'deprecated' : 'normal',
    start: day(b.start), dead: day(b.dead), human: v(b.human) !== 'false',
    end: day(b.end), repl: v(b.repl)?.split('/').pop() || null,
  });
  const byItem = new Map();
  const add = (b, kind) => {
    const r = parse(b);
    if (!r.country || !['hos', 'hog'].includes(r.prop)) return;
    const x = byItem.get(r.country) || { hos: { own: [], held: [] }, hog: { own: [], held: [] } };
    x[r.prop][kind].push(r);
    byItem.set(r.country, x);
  };
  for (const b of rows) add(b, 'own');
  for (const b of officeRows) add(b, 'held');
  const out = new Map();
  for (const [qid, x] of byItem) {
    const pick = ({ own, held }) => {
      // "Replaced by" (P1366) ends a statement only when that successor's statement for the office began later
      // (Wikidata sometimes names a predecessor there).
      const all = [...own, ...held];
      for (const r of all) if (!r.end && r.repl && r.repl !== r.qid && all.some(t => t.qid === r.repl && t.start && t.start > (r.start || ''))) r.end = 'replaced';
      const live = held.filter(h => h.rank !== 'deprecated');
      // A country statement is set aside when the person's P39 statements for the office have all ended, none before
      // the country statement began, and someone else's dated statement began on or after the person's last one did.
      const succeeded = o => {
        const hs = live.filter(h => h.qid === o.qid);
        if (!hs.length || hs.some(h => !h.end)) return false;
        const ended = hs.map(h => h.end).filter(e => /^\d{4}-/.test(e)).sort().at(-1) || null;
        if (o.start && ended && ended < o.start) return false;
        const began = [o.start, ...hs.map(h => h.start)].filter(Boolean).sort().at(-1) || '';
        return live.some(h => h.qid !== o.qid && h.start && h.start >= began);
      };
      const s = pickHead(own.filter(o => !succeeded(o)), today) || pickHead(live.filter(h => h.start), today);
      return s && hasLetters(s.name) ? { name: s.name, qid: s.qid, start: s.start } : null;
    };
    out.set(qid, { hos: pick(x.hos), hog: pick(x.hog) });
  }
  return out;
}
