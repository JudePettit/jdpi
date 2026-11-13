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
// The current leader is the holder of the office that holds the most power in practice (Jude, 6 November 2026: "the
// most powerful political figure, not the head of state"). leaderOffice() chooses the office: the one Political Atlas
// names (its executive.leader) where the Atlas has the country; otherwise a dated decision (leader-offices.json), then
// what the data says about the system of government (one person in both offices, one office for both, Wikidata's forms
// of government, a head of state shared with other countries), then the only office with a holder, then the
// Retrospective's open entry where it is one of the heads; the rest are undecided and get the head of government.
// currentLeader() then names its holder from National Analysis's own heads (refreshed more often than the Atlas), or
// "Vacant" where the office has no holder.

export const hasLetters = s => /\p{L}/u.test(String(s ?? ''));

// One statement: { name, qid, rank: 'preferred' | 'normal' | 'deprecated', start, end, dead, human } (dates as
// YYYY-MM-DD or null; `dead` is a date of death, `human` is false for a body such as a council).
export function pickHead(statements = [], today = new Date().toISOString().slice(0, 10)) {
  const open = statements.filter(s => s && s.rank !== 'deprecated' && !s.end && !s.dead && s.human !== false && !(s.start && s.start > today));
  if (!open.length) return null;
  const rank = s => (s.rank === 'preferred' ? 1 : 0);
  return [...open].sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')) || rank(b) - rank(a) || String(a.name || '').localeCompare(String(b.name || '')))[0];
}

// Wikidata's forms of government (P122 labels): those in which the head of state governs (presidential systems, ruling
// monarchies, juntas and one-party states, whose leader is head of state), and the parliamentary ones, in which the
// head of government does. A country with forms of both kinds, or of neither (a bare "republic"), is not decided by
// them. A semi-presidential country is never decided by a head of state it shares with another country (France and
// Andorra).
export const HEAD_OF_STATE_FORMS = ['presidential system', 'super-presidential republic', 'presidential republic', 'absolute monarchy', 'Emirate',
  'islamic theocracy', 'Islamic state', 'military junta', 'one-party state', 'communist dictatorship', 'Juche', 'family dictatorship'];
export const HEAD_OF_GOVERNMENT_FORMS = ['parliamentary republic', 'parliamentary system', 'parliamentary monarchy', 'constitutional monarchy',
  'federal parliamentary republic', 'parliamentary democracy', 'Westminster system', 'parliamentary coprincipality'];
const MIXED_FORMS = ['semi-presidential system'];
export const OFFICES = ['headOfState', 'headOfGovernment'];

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

// The Retrospective's last leader when that entry is still open, is a name and is the given head by family name (the
// short name, or else the last word of the full one: the short name can be misspelt, "Ilhma Aliyev").
export function openRetroEntry(leaders, head) {
  const last = lastLeader(leaders || []);
  const display = last && (hasLetters(last.full) ? last.full : last.name);
  if (!last || last.end || !hasLetters(display) || !hasLetters(head?.name)) return null;
  const families = [familyName(last), words(last.full).at(-1)].filter(Boolean);
  return families.some(f => sameFamily(f, head.name)) || samePerson(display, head.name) ? last : null;
}

// True when two names are one person as the Atlas and Wikidata write them: the family names agree (or differ by one
// letter in a longer name: Lukashenko and Lukashenka), and so do the first initials where both give a first name
// (Mohammed bin Salman is not Salman bin Abdulaziz). What follows a comma, a bracket or " of " is a title or a note
// ("Albert II, Prince of Monaco", "Hans-Adam II (Hereditary Prince Alois as regent)", "Mohammed VI of Morocco"); a
// Roman numeral is no family name; "A and B" (and a list after a colon) is several people, any of whom may match.
const ROMAN = /^(?=[IVXLC])(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
const people = s => String(s ?? '').replace(/\([^)]*\)/g, ' ').replace(/^[^:]*:\s*/, '').split(/\s+and\s+|;/i)
  .map(p => p.split(',')[0].replace(/\s+of\s+.*$/i, '')).map(p => words(p).filter(w => !ROMAN.test(w)).map(fold).filter(Boolean)).filter(p => p.length);
export function samePerson(a, b) {
  for (const x of people(a)) for (const y of people(b)) {
    const fx = x.at(-1), fy = y.at(-1);
    // The family name may be one of several (Laura Fernández Delgado, Mohammed bin Salman Al Saud).
    const family = fx === fy || (Math.min(fx.length, fy.length) >= 5 && lev(fx, fy) <= 1) || y.includes(fx) || x.includes(fy);
    if (family && (x.length === 1 || y.length === 1 || x[0][0] === y[0][0])) return true;
  }
  return false;
}

const named = h => hasLetters(h?.name);
// Which office's holder is the current leader, and the rule that decided it. heads: { headOfState, headOfGovernment },
// each { name, qid, start } or null. atlas: the country's Political Atlas record, or null. decision: its entry in
// leader-offices.json, or null. government: Wikidata's forms of government. sameOffice: Wikidata names one office as
// the country's head of state and head of government (P1906 and P1313). sharedHead: its head of state heads another
// country too (a realm or a territory). retro: the Retrospective's leader list.
export function leaderOffice({ atlas = null, decision = null, government = [], heads = {}, sameOffice = false, sharedHead = false, retro = null } = {}) {
  const hos = heads.headOfState || null, hog = heads.headOfGovernment || null;
  if (OFFICES.includes(atlas?.executive?.leader)) return { office: atlas.executive.leader, rule: 'atlas' };
  // A regent exercises the head of state's powers (Liechtenstein): the office is the head of state's, and
  // currentLeader names the regent where leader-corrections.json gives one.
  if (atlas?.executive?.leader === 'regent') return { office: 'headOfState', rule: 'atlas' };
  if (OFFICES.includes(decision?.office)) return { office: decision.office, rule: 'decision' };
  if (named(hos) && named(hog) && ((hos.qid && hos.qid === hog.qid) || hos.name === hog.name)) return { office: 'headOfState', rule: 'same-person' };
  if (sameOffice) return { office: 'headOfState', rule: 'same-office' };
  const s = government.some(g => HEAD_OF_STATE_FORMS.includes(g)), p = government.some(g => HEAD_OF_GOVERNMENT_FORMS.includes(g));
  if (s !== p) return { office: s ? 'headOfState' : 'headOfGovernment', rule: 'system' };
  if (sharedHead && !s && !government.some(g => MIXED_FORMS.includes(g))) return { office: 'headOfGovernment', rule: 'shared-head-of-state' };
  if (named(hos) !== named(hog)) return { office: named(hos) ? 'headOfState' : 'headOfGovernment', rule: 'only-holder' };
  if (openRetroEntry(retro, hos)) return { office: 'headOfState', rule: 'retrospective' };
  if (openRetroEntry(retro, hog)) return { office: 'headOfGovernment', rule: 'retrospective' };
  return { office: named(hog) || !named(hos) ? 'headOfGovernment' : 'headOfState', rule: 'undecided' };
}

// The current leader: the holder of the chosen office, from National Analysis's heads, with the Retrospective's party,
// article and start where its open entry is that person. An office with no holder is "Vacant" where it is known to
// be (vacant: the offices Wikidata or the Atlas give as having no holder now); with nothing known, the other office's
// holder (San Marino: the Atlas names its Congress of State, which Wikidata does not give as head of government). Null
// only where there is no head at all.
// Where the head of state's powers are exercised by a regent on his behalf (heads.regent, from a 'regent' correction:
// Liechtenstein, where Hereditary Prince Alois has acted for Prince Hans-Adam II since 15 August 2004; Jude, 12 November
// 2026), the leader is the regent, office 'regent', and the head of state stays head of state.
// { name, qid, office, rule, since, party, url, source: 'wikidata' | 'correction' | 'vacant' }
export function currentLeader({ office, rule }, heads = {}, { retro = null, vacant = [] } = {}) {
  if (office === 'headOfState' && named(heads.regent)) {
    const r = heads.regent;
    return { name: r.name, qid: r.qid || null, office: 'regent', rule, since: r.start || null, party: null, url: r.qid ? `https://www.wikidata.org/wiki/${r.qid}` : null, source: 'correction' };
  }
  const h = heads[office];
  if (!named(h)) {
    if (vacant.includes(office)) return { name: 'Vacant', qid: null, office, rule, since: null, party: null, url: null, source: 'vacant' };
    const other = OFFICES.find(o => o !== office);
    return named(heads[other]) ? currentLeader({ office: other, rule: 'only-holder' }, heads, { retro }) : null;
  }
  const r = openRetroEntry(retro, h);
  const party = r ? r.parties?.filter(p => !p.e).map(p => p.name)[0] || r.parties?.[0]?.name || null : null;
  return {
    name: h.name, qid: h.qid || null, office, rule, since: h.start || r?.start || null, party,
    url: r?.url || (h.qid ? `https://www.wikidata.org/wiki/${h.qid}` : null), source: h.corrected ? 'correction' : 'wikidata',
  };
}

// The Wikidata IDs of a country's heads and current leader that the Master Index has an entry for (has: the lake's
// lake/data/index.json IDs), in order and once each. The page tags only these with data-qid: design/jdpi-entities.js
// puts a link to the Master Index beside every data-qid, and one with no entry would open "No entry for Q…". The lake's
// National Analysis adapter registers countries, not their heads, so most heads have no entry until it does.
export function peopleInIndex(country, has) {
  const ids = [country?.headOfStateQid, country?.headOfGovernmentQid, country?.leader?.qid];
  return [...new Set(ids.filter(q => /^Q[1-9]\d*$/.test(q || '') && has(q)))];
}

// Political Atlas records (political-atlas/data/manifest.json lists the files, each an array of records) by ISO3, or
// null when the folder is not there.
export function readAtlas(dir, read) {
  let manifest;
  try { manifest = read(`${dir}/data/manifest.json`); } catch { return null; }
  const out = new Map();
  for (const f of manifest.files || []) for (const c of read(`${dir}/data/${f}`)) if (/^[A-Z]{3}$/.test(c?.iso3 || '')) out.set(c.iso3, c);
  return out;
}

// Where the Atlas and National Analysis name different people for the leader's office (or one names someone and the
// other no one): for a person to look at; nothing on the page.
export function atlasDisagreement(atlas, office, heads, vacant = []) {
  const a = atlas?.executive?.[office]?.name || null, n = heads?.[office]?.name || null;
  const aVacant = /^\s*vacant\b/i.test(a || '');
  if (!a && !n) return null;
  if (aVacant && !n) return null;
  if (aVacant || !a) return { office, atlas: a, national: n };
  if (!n) return vacant.includes(office) ? { office, atlas: a, national: 'Vacant' } : { office, atlas: a, national: null };
  return samePerson(a, n) ? null : { office, atlas: a, national: n };
}

// Corrections: [{ iso3, field: 'headOfState' | 'headOfGovernment', name, source, checked, replaces }]. One applies only
// while Wikidata still gives the value it replaces, so it lapses by itself once Wikidata is put right.
// A regent is a correction of its own kind: { iso3, field: 'regent', name, qid, since, actsFor, source, checked,
// replaces: null }. It adds heads.regent and changes neither head, and applies only while Wikidata's head of state is
// still the one it acts for (actsFor, as Wikidata writes the name), so it lapses by itself when the regent succeeds.
// heads: Map iso3 -> { headOfState, headOfGovernment } (each { name, qid, start } or null), changed in place.
export const FIELDS = ['headOfState', 'headOfGovernment', 'regent'];
export function applyCorrections(heads, corrections = [], log = () => {}) {
  const applied = [], lapsed = [];
  for (const k of corrections) {
    if (!k || !FIELDS.includes(k.field) || !hasLetters(k.name) || !k.iso3 || (k.field === 'regent' && !hasLetters(k.actsFor))) { log(`correction skipped (incomplete): ${JSON.stringify(k)}`); continue; }
    const h = heads.get(k.iso3);
    if (k.field === 'regent') {
      const head = h?.headOfState?.name ?? null;
      if (h && head === k.actsFor) {
        h.regent = { name: k.name, qid: /^Q[1-9]\d*$/.test(k.qid || '') ? k.qid : null, start: k.since || null, corrected: true };
        applied.push(k);
        log(`correction applied: ${k.iso3} regent "${k.name}" for the head of state "${head}" (${k.source}, checked ${k.checked})`);
      } else {
        lapsed.push(k);
        log(`correction lapsed: ${k.iso3} regent: Wikidata's head of state is now "${head ?? '(none)'}", not "${k.actsFor}"; remove it from leader-corrections.json`);
      }
      continue;
    }
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
      // Statements for the office, and none current (all ended, or held by a body or the dead): it has no holder now.
      if (!s && (own.length || live.length)) return 'vacant';
      return s && hasLetters(s.name) ? { name: s.name, qid: s.qid, start: s.start } : null;
    };
    const hos = pick(x.hos), hog = pick(x.hog), vacant = [hos === 'vacant' && 'hos', hog === 'vacant' && 'hog'].filter(Boolean);
    out.set(qid, { hos: hos === 'vacant' ? null : hos, hog: hog === 'vacant' ? null : hog, ...(vacant.length ? { vacant } : {}) });
  }
  return out;
}
