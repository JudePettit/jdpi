// Primary and secondary sources (ledger MI-14, 17 November 2026): the rule, the one table of plain wording, and the
// checks every link in bibliotheca/data/source-links.json must pass. Plain JavaScript with no imports, so the lake's
// build (node) and the pages (the browser) read the same rule and the same words.
//
// The rule is part A2 of VM-PRIMARY-SOURCES-SUGGESTIONS.md, steps 0 to 6, as the owner's choices of 22 November 2026
// settle it:
//  - A tag belongs to the link between one work and one subject, never to a work as a whole: "primary", "secondary"
//    or none (null). A flag is never a third tag: it stands beside a tag (RETROSPECTIVE, AS-TOLD-TO, DISPUTED) or in
//    place of one (CONTEMPORARY, UNKNOWN, FORERUNNER, POLEMIC, DISPUTED).
//  - Step 0: the subject is a happening (an event, war, treaty, period, polity or organisation), an idea (an ideology,
//    school, movement, doctrine or concept) or a person. Each basis fits some kinds only (BASES[*].kinds).
//  - Step 1, ACT: the work is an act, record or output of the subject itself (a party's programme, a treaty's text).
//  - Step 2, a happening: PART or WIT where the author took part in it or saw it AND the author's life overlaps its
//    dates; BORNAFTER where the author was born after it ended (both dates from Wikidata); FROMOTHERS where the work
//    says it is built from others' accounts. Otherwise none, with CONTEMPORARY (the lives overlap) or UNKNOWN.
//  - Step 3, an idea: OWN where the author states or develops it in the author's own voice and belongs to it; OUTSIDE
//    where the work is an analysis, history or critique by someone who is not an exponent. A polemic by a contemporary
//    who stands outside the idea: none, POLEMIC. FORERUNNER, as the owner's choice 2 words it: the author wrote before
//    the idea had its name, which a source must date (dates.named, later than the work or the author's death). Part
//    A2's step 3 of the study words it as an idea that arose after the author's death; the owner's wording, on the name,
//    is the one this rule follows (review R4, 22 November 2026).
//  - Step 4, a person: OWN for the person's own work (always high confidence); WIT for a work by someone who knew the
//    person and says so; BORNAFTER for one by someone born after the person died; FROMOTHERS for one built from
//    others' accounts; OUTSIDE for a study of the person's own writings or deeds by someone not shown to have known
//    the person (step 4's second clause).
//  - Step 5: RETROSPECTIVE stands beside a primary tag on a happening written more than ten years after it ended, with
//    the gap in years where both dates are held. The gap counts from when the writing began where the book itself
//    says so (dates.begun, by chapter), else from the shelf's date of writing; where both are held the note gives the
//    span, from the start of the writing to its last revision. Step 6: a part by another hand (a translator's preface, an editor's
//    introduction) is tagged apart, as a secondary source on the text's subject; where the shelf does not hold the
//    parts apart, the link's note says so and only the main text is tagged.
//  - No tag on dates alone, except BORNAFTER. A tag is never forced. Every tag stores its basis, its evidence in one
//    plain sentence, its sources and a confidence; only high and medium are shown, a low one keeps its reason (held).
//  - A script may decide three bases by itself (derive): BORNAFTER from the two dates, ACT where the collection's
//    heading says the work is the subject's own act, OWN where the author's Wikidata movement (P135) or ideology
//    (P1142) names the idea. Every other tag is a judgement made by reading the evidence, and names it.
//
// A link's shape (bibliotheca/data/source-links.json, one record per link):
//   work        the shelf's slug: a book's, or a set's (bibliotheca/data/index.json books[].set.slug) for every volume
//   wq          the work's Wikidata id as the shelf gives it (books/<slug>.json work.qid), or null
//   part        null for the main text; for a part by another hand { ch, heading, by, byq?, book? }: the chapter the
//               shelf holds it as, its heading there, its writer (and his Wikidata id), the volume where a set
//   subject     { q, label, kind }: the subject's Wikidata id, its label, happening | idea | person
//   tag         "primary" | "secondary" | null
//   basis       one of BASES, or null with no tag
//   flags       [{ id, years?, to?, with? }]: id from FLAGS; years for RETROSPECTIVE (from the start of the writing),
//               and to (from its last revision) where dates.begun is held; with (the other person) for AS-TOLD-TO
//   evidence    one plain sentence: what was read, described and never quoted, with the chapter named
//   source      [{ wd, p, v? }] a Wikidata statement (item, property, value item) read on the day judged
//               | [{ book, ch, other? }] a chapter of a book Bibliotheca holds (other: true for another book's)
//               | [{ collection }] the source collection's heading | [{ lake, tag }] a Master Index tag
//   dates       where the basis needs them: { born, died, start, end, written, begun, named }, each [year, item,
//               property] from Wikidata, or [year, "shelf"] for written (books/<slug>.json work.written). born and died
//               are the author's (the part's writer's, for a part), read from that person's own item; start and end are
//               the subject's, from its own item (for a person, the person's birth and death). begun is when the writing
//               began, as the book's own text says: [year, book, chapter]. named, for FORERUNNER, is the earliest the
//               idea's name can date from: the idea's inception (P571), or the birth of the person Wikidata says named it
//   confidence  high | medium | low;  held: why a low one is not shown (required with low)
//   why         why the book is plainly about this subject;  note: anything else the reader should know (the parts)
//   judged      the day judged (YYYY-MM-DD);  entry: whether the subject had a Master Index entry that day. The pages
//               ask the lake, not this field, so a subject that gains its entry later needs no change to the file.

export const LINKS_PATH = 'bibliotheca/data/source-links.json';

export const TAGS = Object.freeze({ primary: 'Primary source', secondary: 'Secondary source' });
export const KINDS = Object.freeze(['happening', 'idea', 'person']);
export const CONFIDENCE = Object.freeze(['high', 'medium', 'low']);
export const SHOWN = Object.freeze(['high', 'medium']);
export const RETROSPECTIVE_YEARS = 10;

// tag: the tag the basis gives; kinds: the subjects it fits; dates: what it needs; script: a script may decide it.
export const BASES = Object.freeze({
  ACT: { tag: 'primary', kinds: ['happening', 'person'], script: true },
  PART: { tag: 'primary', kinds: ['happening'], dates: 'overlap' },
  WIT: { tag: 'primary', kinds: ['happening', 'person'], dates: 'overlap' },
  OWN: { tag: 'primary', kinds: ['idea', 'person'], script: true },
  BORNAFTER: { tag: 'secondary', kinds: ['happening', 'person'], dates: 'after', script: true },
  FROMOTHERS: { tag: 'secondary', kinds: ['happening', 'idea', 'person'] },
  OUTSIDE: { tag: 'secondary', kinds: ['idea', 'person'] },
});

// stands: 'beside' a tag, 'instead' of one, or 'either'; with: the tag it stands beside; kinds: the subjects it fits.
export const FLAGS = Object.freeze({
  RETROSPECTIVE: { stands: 'beside', with: 'primary', kinds: ['happening'] },
  CONTEMPORARY: { stands: 'instead', kinds: ['happening'], dates: 'overlap' },
  UNKNOWN: { stands: 'instead', kinds: ['happening', 'idea', 'person'] },
  FORERUNNER: { stands: 'instead', kinds: ['idea'] },
  POLEMIC: { stands: 'instead', kinds: ['idea'] },
  'AS-TOLD-TO': { stands: 'beside', kinds: ['happening', 'idea', 'person'] },
  DISPUTED: { stands: 'either', kinds: ['happening', 'idea', 'person'] },
});

// ---- The one table of plain wording. Every word a reader sees about these tags comes from here. The notes' words are
// written once, here, and the rule's paragraph (WORDING.about) lists them from this table, so a note added later is
// explained there with no second copy (review P2).
const FLAG_WORDS = Object.freeze({
  RETROSPECTIVE: 'written long after',
  CONTEMPORARY: 'lived through it; not shown to be a witness',
  UNKNOWN: 'the author’s relation to the subject is not known',
  FORERUNNER: 'wrote before the idea had its name',
  POLEMIC: 'a polemic against it, written at the time',
  'AS-TOLD-TO': 'written with another person',
  DISPUTED: 'the sources disagree',
});
const inQuotes = list => list.map(w => `“${w}”`);
const orList = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list.join(''));
export const WORDING = Object.freeze({
  heading: 'Primary and secondary sources',
  tag: { primary: 'Primary source', secondary: 'Secondary source' },
  on: { primary: 'A primary source on', secondary: 'A secondary source on' },
  basis: {
    ACT: { happening: 'an act or record of the subject itself', person: 'a record of the person’s own acts or words' },
    PART: { happening: 'the author took part in it' },
    WIT: { happening: 'the author saw it, and says so', person: 'the author knew the person, and says so' },
    OWN: { idea: 'stated in the author’s own voice, as one who holds it', person: 'the person’s own work' },
    BORNAFTER: { happening: 'the author was born after it ended', person: 'the author was born after the person died' },
    FROMOTHERS: { happening: 'written from others’ accounts', idea: 'an account of another writer’s work', person: 'written from others’ accounts' },
    OUTSIDE: { idea: 'an analysis or critique from outside it', person: 'a study by someone not shown to have known the person' },
  },
  flag: FLAG_WORDS,
  years: (n, to) => (Number.isInteger(to) && to !== n ? `${n} to ${to} years after it ended` : `${n} years after it ended`),
  confidence: { high: 'strong evidence', medium: 'fair evidence', low: 'weak evidence, not shown' },
  part: (heading, by) => by ? `${heading}, by ${by}` : heading,
  waiting: 'no Master Index entry yet',
  evidence: 'Evidence',
  // Where the links are shown and served (the second builder of MI-14): the tag groups on a work's own entry, the
  // books listed apart on a subject's entry, the rule's link, the sources named in words.
  group: { primary: 'Primary source on', secondary: 'Secondary source on' },
  noted: 'No tag, with a note',
  notNamed: 'Also judged a source on it',
  notNamedNote: 'No passage of these books is linked to this entry yet; each was judged a source on the subject from the evidence shown.',
  what: 'What these tags mean',
  partsApart: 'Parts by other hands',
  read: day => `Wikidata as read on ${longDay(day)}`,
  collection: 'Source collection',
  lakeTag: (tag, on) => on ? `Master Index tag ${tag}, on ${on}` : `Master Index tag ${tag}`,
  // Wikidata's English labels of the properties a link cites, as read on Wikidata on 22 November 2026.
  property: {
    P26: 'spouse', P39: 'position held', P50: 'author', P61: 'discoverer or inventor', P98: 'editor', P101: 'field of work',
    P112: 'founder', P135: 'movement', P241: 'military branch', P361: 'part of', P463: 'member of', P569: 'date of birth',
    P570: 'date of death', P571: 'inception', P576: 'dissolved, abolished or demolished', P577: 'publication date',
    P580: 'start time', P582: 'end time', P585: 'point in time', P607: 'participated in conflict', P710: 'participant',
    P921: 'main subject', P1142: 'political ideology', P1344: 'participant in', P279: 'subclass of', P3938: 'named by',
  },
  about: 'A primary source on a subject is evidence made by the subject itself, or by someone who took part in it or saw it: a party’s own programme, a soldier’s own account of a war, an adherent’s own statement of a school of thought, a person’s own book. A secondary source is an account from a distance: by someone born after the events, written from others’ accounts, a study of a person by someone not shown to have known the person, or an analysis of an idea from outside it. The tag belongs to the link between one book and one subject, not to the book: the same book can be a primary source on one subject and a secondary source on another, and many links carry no tag at all, because the evidence shows neither, and then nothing is said rather than a guess. '
    + `A short note may stand beside a tag or in its place: ${orList(inQuotes(Object.values(FLAG_WORDS)))}. “${FLAG_WORDS.RETROSPECTIVE}” means more than ten years after the events, counted from when the writing began where the book says so. `
    + 'A preface or introduction by another hand, such as a translator’s, is tagged apart from the text it introduces. A date alone never gives a tag, except that an author born after a subject ended is a secondary source on it. Each judgement was made for Vitruvian Manager by an AI model (Claude), reading the evidence named beside it (the book’s own words, by chapter, or a statement on Wikidata, read on the day it was judged), and checked by Vitruvian Manager’s rules; no person checked it. Only judgements resting on strong or fair evidence are shown.',
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(day || '');
}

export const basisText = (basis, kind) => WORDING.basis[basis]?.[kind] ?? null;
export function flagText(f) {
  const id = typeof f === 'string' ? f : f?.id;
  const w = WORDING.flag[id];
  if (!w) return null;
  if (id === 'RETROSPECTIVE' && Number.isInteger(f.years)) return `${w} (${WORDING.years(f.years, f.to)})`;
  if (id === 'AS-TOLD-TO' && f.with) return `${w} (${f.with})`;
  return w;
}

// Every sentence of the table a reader may see, for the tests: no id may reach a page.
export function readerTexts() {
  const out = [WORDING.heading, WORDING.about, WORDING.waiting, WORDING.evidence, WORDING.years(15), WORDING.part('Editor’s preface', 'An Editor'),
    ...Object.values(WORDING.tag), ...Object.values(WORDING.on), ...Object.values(WORDING.flag), ...Object.values(WORDING.confidence)];
  for (const byKind of Object.values(WORDING.basis)) out.push(...Object.values(byKind));
  for (const id of Object.keys(FLAGS)) out.push(flagText({ id, years: 15, with: 'A. N. Other' }), flagText({ id, years: 16, to: 28 }));
  out.push(...Object.values(WORDING.group), WORDING.noted, WORDING.notNamed, WORDING.notNamedNote, WORDING.what, WORDING.partsApart, WORDING.read('2026-11-22'),
    WORDING.collection, WORDING.lakeTag('A doctrine', 'An Author'), WORDING.lakeTag('A doctrine'), ...Object.values(WORDING.property));
  return out;
}

export const isShown = l => SHOWN.includes(l?.confidence) && (l.tag != null || (l.flags || []).length > 0);

// What a reader is told about one link: words only.
export function plain(l) {
  return {
    tag: l.tag ? WORDING.tag[l.tag] : null,
    basis: l.basis ? basisText(l.basis, l.subject?.kind) : null,
    flags: (l.flags || []).map(flagText).filter(Boolean),
    evidence: l.evidence || null,
    part: l.part ? WORDING.part(l.part.heading, l.part.by) : null,
    confidence: WORDING.confidence[l.confidence] ?? null,
    shown: isShown(l),
  };
}

// ---- The three bases a script may decide, from data alone.
//   { kind, born, end }                      BORNAFTER: a happening or a person, the author born after its end
//   { kind, act }                            ACT: the collection's heading says the work is the subject's own act
//   { kind, subject, movements, ideologies } OWN: the author's Wikidata P135 or P1142 names the idea
export function derive(f = {}) {
  const num = n => typeof n === 'number' && Number.isFinite(n);
  if ((f.kind === 'happening' || f.kind === 'person') && num(f.born) && num(f.end) && f.born > f.end) return { tag: 'secondary', basis: 'BORNAFTER', confidence: 'high' };
  if ((f.kind === 'happening' || f.kind === 'person') && typeof f.act === 'string' && f.act.trim()) return { tag: 'primary', basis: 'ACT', confidence: 'high' };
  if (f.kind === 'idea' && f.subject && [...(f.movements || []), ...(f.ideologies || [])].includes(f.subject)) return { tag: 'primary', basis: 'OWN', confidence: 'medium' };
  return null;
}

// derive() on a stored link's own data: its dates, its collection heading, and the author's movement or ideology
// statements it names as sources (author: the Wikidata id of the work's author, or of the part's writer).
export function scriptBasis(l, author) {
  const kind = l.subject?.kind;
  const stmts = p => (l.source || []).filter(s => s.wd === author && s.p === p && s.v).map(s => s.v);
  const collection = (l.source || []).find(s => s.collection)?.collection;
  return derive({
    kind, subject: l.subject?.q,
    born: l.dates?.born?.[0], end: l.dates?.end?.[0],
    act: l.basis === 'ACT' ? collection : undefined,
    movements: stmts('P135'), ideologies: stmts('P1142'),
  });
}

// ---- The checks. check(link) returns the problems with one link, as sentences; [] when it passes.
const QID = /^Q\d+$/, PID = /^P\d+$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PROPS = { born: ['P569'], died: ['P570'], start: ['P580', 'P571', 'P569', 'P585'], end: ['P582', 'P576', 'P570', 'P585'], named: ['P571', 'P569', 'P580', 'P585'] };
const DATE_KEYS = ['born', 'died', 'start', 'end', 'written', 'begun', 'named'];

function checkDate(name, d, out) {
  if (d === undefined) return;
  if (!Array.isArray(d) || typeof d[0] !== 'number') return out.push(`dates.${name} must be [year, item, property]`);
  if (name === 'written') { if (d[1] !== 'shelf' && !(QID.test(d[1] || '') && PID.test(d[2] || ''))) out.push('dates.written comes from the shelf or Wikidata'); return; }
  if (name === 'begun') { if (typeof d[1] !== 'string' || !d[1] || QID.test(d[1]) || d[1] === 'shelf' || !Number.isInteger(d[2])) out.push('dates.begun is read from the book’s own text: [year, book, chapter]'); return; }
  if (!QID.test(d[1] || '') || !PID.test(d[2] || '')) return out.push(`dates.${name} must come from Wikidata (an item and a property)`);
  if (!DATE_PROPS[name].includes(d[2])) out.push(`dates.${name} is read from ${DATE_PROPS[name].join(' or ')}, not ${d[2]}`);
}

function checkSource(s, out) {
  if (s && QID.test(s.wd || '') && PID.test(s.p || '') && (s.v === undefined || QID.test(s.v))) return;
  if (s && typeof s.book === 'string' && s.book && Number.isInteger(s.ch)) return;
  if (s && typeof s.collection === 'string' && s.collection.trim()) return;
  if (s && QID.test(s.lake || '') && typeof s.tag === 'string' && s.tag.includes(':')) return;
  out.push(`a source must be a Wikidata statement, a chapter of a book on the shelf, a collection's heading or a Master Index tag: ${JSON.stringify(s)}`);
}

function checkProse(name, s, out) {
  if (/["“”„]/.test(s)) out.push(`${name} describes and never quotes: no quotation marks`);
  if (/'/.test(s)) out.push(`${name} uses the typographic apostrophe`);
}

// ctx.authors, where given: the Wikidata ids of the people whose lives the link may read (the work's authors, or the
// part's writer); the file's test gives them from the shelf, so a date read from anyone else's item fails (review R5).
export function check(l, ctx = {}) {
  const out = [];
  if (!l || typeof l !== 'object') return ['a link must be an object'];
  if (typeof l.work !== 'string' || !l.work) out.push('work is the shelf’s slug');
  if (l.wq !== null && !QID.test(l.wq || '')) out.push('wq is the work’s Wikidata id or null');
  const s = l.subject || {};
  if (!QID.test(s.q || '') || typeof s.label !== 'string' || !s.label) out.push('subject needs a Wikidata id and a label');
  if (!KINDS.includes(s.kind)) out.push(`subject kind must be one of ${KINDS.join(', ')}`);
  if (l.part !== null && l.part !== undefined) {
    const p = l.part;
    if (!Number.isInteger(p.ch) || typeof p.heading !== 'string' || !p.heading || typeof p.by !== 'string' || !p.by || (p.byq !== undefined && !QID.test(p.byq))) out.push('a part names its chapter, its heading and its writer');
  }
  if (!(l.tag === null || l.tag in TAGS)) out.push('tag is "primary", "secondary" or null');
  const b = BASES[l.basis];
  if (l.tag) {
    if (!b) out.push('a tag needs a basis');
    else {
      if (b.tag !== l.tag) out.push(`${l.basis} gives a ${b.tag} tag, not ${l.tag}`);
      if (KINDS.includes(s.kind) && !b.kinds.includes(s.kind)) out.push(`${l.basis} does not fit a subject of the kind ${s.kind}`);
    }
  } else if (l.basis != null) out.push('a basis without a tag: a link with no tag has no basis');
  if (!Array.isArray(l.source) || !l.source.length) out.push('every link names its source');
  else l.source.forEach(x => checkSource(x, out));
  if (typeof l.evidence !== 'string' || l.evidence.trim().length < 12) out.push('every link states its evidence in a sentence');
  else checkProse('evidence', l.evidence, out);
  for (const k of ['why', 'note', 'held']) if (l[k] !== undefined && typeof l[k] === 'string') checkProse(k, l[k], out);
  if (typeof l.why !== 'string' || !l.why.trim()) out.push('every link says why the book is about the subject (why)');
  if (!CONFIDENCE.includes(l.confidence)) out.push(`confidence must be one of ${CONFIDENCE.join(', ')}`);
  if (l.confidence === 'low' && (typeof l.held !== 'string' || !l.held.trim())) out.push('a low confidence keeps its reason (held)');
  if (!DAY.test(l.judged || '')) out.push('judged is the day, YYYY-MM-DD');
  if (typeof l.entry !== 'boolean') out.push('entry is true or false');

  // dates
  const d = l.dates || {};
  if (l.dates !== undefined && (typeof l.dates !== 'object' || l.dates === null)) out.push('dates is an object');
  for (const k of Object.keys(d)) { if (!DATE_KEYS.includes(k)) out.push(`dates.${k} is not a date this rule reads`); else checkDate(k, d[k], out); }
  const y = k => (Array.isArray(d[k]) ? d[k][0] : undefined);
  // whose dates they are: the author's life from the author's own item, the subject's span from the subject's
  const who = k => (Array.isArray(d[k]) ? d[k][1] : undefined);
  if (Array.isArray(ctx.authors)) for (const k of ['born', 'died']) if (QID.test(who(k) || '') && !ctx.authors.includes(who(k))) out.push(`dates.${k} is read from ${who(k)}, who is not the author (${ctx.authors.join(', ') || 'none known'})`);
  for (const k of ['start', 'end']) if (QID.test(who(k) || '') && QID.test(s.q || '') && who(k) !== s.q) out.push(`dates.${k} is read from ${who(k)}, not from the subject’s own item ${s.q}`);
  if (typeof y('begun') === 'number' && typeof y('written') === 'number' && y('begun') > y('written')) out.push(`dates.begun (${y('begun')}) comes after the writing was done (${y('written')})`);
  const from = typeof y('begun') === 'number' ? 'begun' : 'written';
  const overlaps = () => [y('born'), y('died'), y('start'), y('end')].every(n => typeof n === 'number') && y('born') <= y('end') && y('died') >= y('start');
  if (b?.dates === 'after' && l.tag) {
    if (typeof y('born') !== 'number' || typeof y('end') !== 'number') out.push('BORNAFTER needs both dates: dates.born and dates.end');
    else if (!(y('born') > y('end'))) out.push(`BORNAFTER: the author was born in ${y('born')}, not after ${y('end')}`);
  }
  if (b?.dates === 'overlap' && l.tag && !overlaps()) out.push(`${l.basis}: the author’s life must overlap the subject’s (dates.born, died, start and end), and the dates must show it`);

  // flags
  const flags = Array.isArray(l.flags) ? l.flags : (out.push('flags is a list'), []);
  const seen = new Set();
  for (const f of flags) {
    const def = FLAGS[f?.id];
    if (!def) { out.push(`a flag must be one of ${Object.keys(FLAGS).join(', ')}: ${JSON.stringify(f)}`); continue; }
    if (seen.has(f.id)) out.push(`${f.id} is given twice`);
    seen.add(f.id);
    if (KINDS.includes(s.kind) && !def.kinds.includes(s.kind)) out.push(`${f.id} does not fit a subject of the kind ${s.kind}`);
    if (def.stands === 'instead' && l.tag) out.push(`${f.id} stands in place of a tag, never beside one`);
    if (def.stands === 'beside' && !l.tag) out.push(`${f.id} stands beside a tag`);
    if (def.with && l.tag && l.tag !== def.with) out.push(`${f.id} stands beside a ${def.with} tag only`);
    if (def.dates === 'overlap' && !overlaps()) out.push(`${f.id}: the lives must overlap, and the dates must show it`);
    if (f.id === 'AS-TOLD-TO' && (typeof f.with !== 'string' || !f.with)) out.push('AS-TOLD-TO names the other person (with)');
    if (f.id === 'RETROSPECTIVE') {
      const end = y('end');
      if (!Number.isInteger(f.years) || f.years <= RETROSPECTIVE_YEARS) out.push('RETROSPECTIVE: written more than ten years after the subject ended (years)');
      else if (typeof y(from) === 'number' && typeof end === 'number' && f.years !== y(from) - end) out.push(`RETROSPECTIVE: the dates give ${y(from) - end} years${from === 'begun' ? ' from the start of the writing' : ''}, not ${f.years}`);
      if (from === 'begun' && typeof y('written') === 'number' && typeof end === 'number' && f.to !== y('written') - end) out.push(`RETROSPECTIVE: the last revision came ${y('written') - end} years after the subject ended (to), not ${f.to ?? 'unsaid'}`);
      if (f.to !== undefined && (!Number.isInteger(f.to) || f.to < f.years)) out.push('RETROSPECTIVE: to is the gap to the last revision, no shorter than years');
    }
    if (f.id === 'FORERUNNER') {
      const before = typeof y('written') === 'number' ? 'written' : 'died';
      if (typeof y('named') !== 'number' || !QID.test(who('named') || '') || typeof y(before) !== 'number') out.push('FORERUNNER needs a source that dates the idea’s name (dates.named, from Wikidata) and the work’s writing or the author’s death');
      else if (!(y('named') > y(before))) out.push(`FORERUNNER: the name dates from ${y('named')} at the earliest, not after the ${before === 'written' ? 'writing' : 'author’s death'} in ${y(before)}`);
    }
  }
  // a primary tag on a happening written more than ten years after it ended must carry RETROSPECTIVE (counted from the
  // start of the writing where the book says when that was)
  if (l.tag === 'primary' && s.kind === 'happening' && typeof y(from) === 'number' && typeof y('end') === 'number') {
    const gap = y(from) - y('end');
    if (gap > RETROSPECTIVE_YEARS && !seen.has('RETROSPECTIVE')) out.push(`RETROSPECTIVE: written ${gap} years after the subject ended, and the link must say so`);
  }
  // step 4: a person's own book is primary on that person at high confidence
  if (l.basis === 'OWN' && s.kind === 'person' && l.confidence !== 'high') out.push('a person’s own book is primary on him at high confidence');
  return out;
}

const linkKey = l => [l.work, l.part ? `${l.part.book || ''}#${l.part.ch}` : '', l.subject?.q].join('|');

// checkFile(file, ctx) checks every link, the file's own fields, and that no link is stored twice. ctx.authorsOf(link),
// where given, names the people whose lives each link may read (see check).
export function checkFile(file, ctx = {}) {
  const out = [];
  if (!file || !Array.isArray(file.links)) return ['the file holds links: [...]'];
  if (!DAY.test(file.judged || '')) out.push('the file says the day it was judged (judged)');
  const keys = new Set();
  file.links.forEach((l, i) => {
    for (const p of check(l, ctx.authorsOf ? { authors: ctx.authorsOf(l) } : {})) out.push(`link ${i} (${l?.work} → ${l?.subject?.label}): ${p}`);
    const k = linkKey(l);
    if (keys.has(k)) out.push(`link ${i} (${l?.work} → ${l?.subject?.label}) is stored twice`);
    keys.add(k);
  });
  return out;
}

// ---- Reading the file.
// The Master Index's type of an entry (lake records' type) as one of the three kinds.
export function kindOfType(type) {
  if (type === 'person') return 'person';
  if (type === 'idea' || type === 'topic') return 'idea';
  return 'happening';
}

// The links on one subject (a Wikidata id), in the file's order.
export const linksOn = (file, q) => (file?.links || []).filter(l => l.subject?.q === q);

// The links from one book of the shelf: its own and its set's. shelf is bibliotheca/data/index.json.
export function linksFrom(file, slug, shelf) {
  const set = shelf?.books?.find(b => b.slug === slug)?.set?.slug;
  return (file?.links || []).filter(l => l.work === slug || (set && l.work === set));
}

// ---- Naming a link's sources in words (the pages, the lake's build, the catalogue).
// The work's title as the shelf gives it: a set's own title for a set, a book's for a book.
export function workTitle(shelf, work) {
  const books = shelf?.books || [];
  return books.find(b => b.slug === work)?.title || books.find(b => b.set?.slug === work)?.set?.title || null;
}
// The shelf slugs a work's link opens: a set's volumes in order, or the book itself.
export function workVolumes(shelf, work) {
  const vols = (shelf?.books || []).filter(b => b.set?.slug === work).sort((a, b) => (a.set.volume || 0) - (b.set.volume || 0)).map(b => b.slug);
  return vols.length ? vols : [work];
}
// The names the file itself holds for Wikidata ids: its subjects' labels, its parts' writers, its works' titles.
export function nameMap(file, shelf) {
  const m = new Map();
  for (const l of file?.links || []) {
    if (l.subject?.q && !m.has(l.subject.q)) m.set(l.subject.q, l.subject.label);
    if (l.part?.byq && !m.has(l.part.byq)) m.set(l.part.byq, l.part.by);
    if (l.wq && !m.has(l.wq)) { const t = workTitle(shelf, l.work); if (t) m.set(l.wq, t); }
  }
  return m;
}
// One source in words, with where it can be read: { text, href }. ctx: { name(q), title(slug), chapter(slug, ch) }, each
// giving null when it does not know. A name it does not know is left out, never shown as an id. href is relative to the
// site's root (bibliotheca/…, encyclopedia/…) or a full address (Wikidata's), or null.
export function cite(s, ctx = {}) {
  const name = q => (q && ctx.name?.(q)) || null;
  if (s?.wd) {
    const item = name(s.wd), prop = WORDING.property[s.p] || null, value = s.v ? name(s.v) : null;
    const said = [item, prop && value ? `${prop}: ${value}` : prop].filter(Boolean).join(', ');
    return { text: said ? `Wikidata: ${said}` : 'Wikidata', href: `https://www.wikidata.org/wiki/${s.wd}${s.p ? '#' + s.p : ''}` };
  }
  if (s?.book) {
    const title = ctx.title?.(s.book) || null, heading = ctx.chapter?.(s.book, s.ch) || null;
    return { text: [title, heading].filter(Boolean).join(', ') || WORDING.evidence, href: `bibliotheca/neo/index.html#book=${encodeURIComponent(s.book)}&ch=${s.ch}` };
  }
  if (s?.collection) return { text: `${WORDING.collection}: ${s.collection}`, href: null };
  if (s?.lake) {
    const value = String(s.tag || '').slice(String(s.tag || '').indexOf(':') + 1);
    return { text: WORDING.lakeTag(value, name(s.lake)), href: `encyclopedia/index.html#${s.lake}` };
  }
  return { text: WORDING.evidence, href: null };
}
// The day a link's Wikidata statements were read, in words, when it cites any.
export const readOn = l => ((l?.source || []).some(s => s.wd) && l.judged ? WORDING.read(l.judged) : null);
