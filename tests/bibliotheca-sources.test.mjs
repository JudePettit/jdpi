// Primary and secondary sources (ledger MI-14): the rule module (bibliotheca/lib/sources.js) on fixtures — the bases
// and the kinds of subject they fit, the flags and where they stand, the dates a basis needs, the three bases a script
// may decide (BORNAFTER, ACT from a collection's heading, OWN from the author's Wikidata movement or ideology), the one
// table of plain wording and that no id reaches a reader — then the reviewed file of links
// (bibliotheca/data/source-links.json) against the rule, the shelf (its books, sets, chapters, authors and work ids) and
// the Master Index (an entry the file says exists is there, of a kind that fits). Pure: no server, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TAGS, KINDS, CONFIDENCE, BASES, FLAGS, RETROSPECTIVE_YEARS, WORDING, LINKS_PATH,
  check, checkFile, derive, scriptBasis, plain, isShown, basisText, flagText, readerTexts, linksOn, linksFrom, kindOfType, yearsFrom,
} from '../bibliotheca/lib/sources.js';
import { builtOn, readAfter } from './tools/as-built.mjs';

const read = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const ID = /\b(?:ACT|PART|WIT|OWN|BORNAFTER|FROMOTHERS|OUTSIDE|RETROSPECTIVE|CONTEMPORARY|UNKNOWN|FORERUNNER|POLEMIC|AS-TOLD-TO|DISPUTED)\b|\bQ\d+\b|\bP\d+\b/;

// ---- Fixtures: links in the file's shape, each valid as it stands; the tests break one thing at a time.
const base = over => ({
  work: 'a-book', wq: null, part: null,
  subject: { q: 'Q1', label: 'A war', kind: 'happening' },
  tag: 'primary', basis: 'PART', flags: [],
  evidence: 'The author says in chapter II that he commanded a fleet in the war.',
  source: [{ book: 'a-book', ch: 2 }, { wd: 'Q9', p: 'P39' }],
  dates: { born: [-460, 'Q9', 'P569'], died: [-395, 'Q9', 'P570'], start: [-431, 'Q1', 'P580'], end: [-404, 'Q1', 'P582'] },
  confidence: 'high', why: 'The book is the history of this war.', judged: '2026-11-22', entry: false,
  ...over,
});
const later = over => base({
  subject: { q: 'Q2', label: 'An empire', kind: 'happening' }, tag: 'secondary', basis: 'BORNAFTER',
  evidence: 'The author was born in 1737, long after the empire ended in 476.',
  source: [{ wd: 'Q9', p: 'P569' }, { wd: 'Q2', p: 'P576' }],
  dates: { born: [1737, 'Q9', 'P569'], end: [476, 'Q2', 'P576'] }, ...over,
});
const idea = over => base({
  subject: { q: 'Q3', label: 'A school', kind: 'idea' }, basis: 'OWN', dates: undefined,
  evidence: 'Wikidata gives the school as the author’s movement.', source: [{ wd: 'Q9', p: 'P135', v: 'Q3' }],
  confidence: 'medium', ...over,
});

test('the vocabulary: two tags, three kinds, three confidences, seven bases and seven flags', () => {
  assert.deepEqual(Object.keys(TAGS), ['primary', 'secondary']);
  assert.deepEqual(KINDS, ['happening', 'idea', 'person']);
  assert.deepEqual(CONFIDENCE, ['high', 'medium', 'low']);
  assert.deepEqual(Object.keys(BASES), ['ACT', 'PART', 'WIT', 'OWN', 'BORNAFTER', 'FROMOTHERS', 'OUTSIDE']);
  assert.deepEqual(Object.keys(FLAGS), ['RETROSPECTIVE', 'CONTEMPORARY', 'UNKNOWN', 'FORERUNNER', 'POLEMIC', 'AS-TOLD-TO', 'DISPUTED']);
  for (const b of ['ACT', 'PART', 'WIT', 'OWN']) assert.equal(BASES[b].tag, 'primary', b);
  for (const b of ['BORNAFTER', 'FROMOTHERS', 'OUTSIDE']) assert.equal(BASES[b].tag, 'secondary', b);
  assert.equal(RETROSPECTIVE_YEARS, 10);
  assert.deepEqual(Object.keys(BASES).filter(b => BASES[b].script), ['ACT', 'OWN', 'BORNAFTER']);
});

test('a valid link has no problems, and each kind of link is checked', () => {
  for (const l of [base(), later(), idea()]) assert.deepEqual(check(l), [], JSON.stringify(l));
});

test('a tag needs a basis that fits it and the kind of subject', () => {
  assert.match(check(base({ basis: null })).join(), /basis/);
  assert.match(check(base({ basis: 'OUTSIDE' })).join(), /OUTSIDE.*primary|tag/);
  assert.match(check(base({ basis: 'OWN' })).join(), /OWN.*happening/);
  assert.match(check(idea({ basis: 'PART', dates: base().dates })).join(), /PART.*idea/);
  assert.match(check(later({ subject: { q: 'Q2', label: 'A school', kind: 'idea' } })).join(), /BORNAFTER.*idea/);
  assert.match(check(base({ tag: 'tertiary' })).join(), /tag/);
  assert.match(check(base({ subject: { q: 'Q1', label: 'A war', kind: 'event' } })).join(), /kind/);
  assert.match(check(base({ tag: null })).join(), /basis.*no tag|without a tag/);
});

test('no tag without a source, an evidence sentence, a confidence and a day', () => {
  assert.match(check(base({ source: [] })).join(), /source/);
  assert.match(check(base({ source: [{ web: 'https://example.org' }] })).join(), /source/);
  assert.match(check(base({ source: [{ wd: 'Q9', p: 'P39x' }] })).join(), /source/);
  assert.match(check(base({ evidence: '' })).join(), /evidence/);
  assert.match(check(base({ confidence: 'certain' })).join(), /confidence/);
  assert.match(check(base({ judged: '22 November' })).join(), /judged/);
  assert.match(check(base({ entry: 'yes' })).join(), /entry/);
  assert.match(check(base({ why: '' })).join(), /why/);
  assert.match(check(base({ subject: { q: 'Peloponnesian War', label: 'x', kind: 'happening' } })).join(), /subject/);
});

test('a low confidence keeps its reason; a link with no tag says why', () => {
  assert.match(check(base({ confidence: 'low' })).join(), /held/);
  assert.deepEqual(check(base({ confidence: 'low', held: 'The only evidence is VM’s own course tag.' })), []);
  const none = base({ tag: null, basis: null, flags: [{ id: 'CONTEMPORARY' }], confidence: 'medium', evidence: 'The author lived through the war; nothing shows he saw it.' });
  assert.deepEqual(check(none), []);
});

test('evidence is described, never quoted, in plain typography', () => {
  assert.match(check(base({ evidence: 'He wrote “I was there” in chapter II.' })).join(), /quot/);
  assert.match(check(base({ evidence: 'He wrote "I was there" in chapter II.' })).join(), /quot/);
  assert.match(check(base({ evidence: "The author's own words." })).join(), /apostrophe/);
});

test('BORNAFTER needs both dates from Wikidata, in the right order', () => {
  assert.match(check(later({ dates: { born: [1737, 'Q9', 'P569'] } })).join(), /BORNAFTER.*dates/);
  assert.match(check(later({ dates: { born: [300, 'Q9', 'P569'], end: [476, 'Q2', 'P576'] } })).join(), /born.*after/);
  assert.match(check(later({ dates: { born: [1737, 'shelf'], end: [476, 'Q2', 'P576'] } })).join(), /Wikidata/);
  assert.match(check(later({ dates: { born: [1737, 'Q9', 'P580'], end: [476, 'Q2', 'P576'] } })).join(), /P569/);
  assert.match(check(later({ dates: { born: [1737, 'Q9', 'P569'], end: [476, 'Q2', 'P569'] } })).join(), /end/);
});

test('a primary tag on a happening needs an author whose life overlaps it', () => {
  assert.match(check(base({ dates: undefined })).join(), /overlap|dates/);
  assert.match(check(base({ dates: { ...base().dates, born: [-380, 'Q9', 'P569'], died: [-320, 'Q9', 'P570'] } })).join(), /overlap/);
  const duke = over => base({ basis: 'WIT', subject: { q: 'Q5', label: 'A duke', kind: 'person' }, evidence: 'The author says in chapter II that he spoke with the duke at his court.', ...over });
  assert.match(check(duke({ dates: { born: [1469, 'Q9', 'P569'], died: [1527, 'Q9', 'P570'], start: [1530, 'Q5', 'P569'], end: [1580, 'Q5', 'P570'] } })).join(), /overlap/);
  // X9: on a person the rule asks for the author's own word that he knew him, not for dates; dates held must overlap
  assert.deepEqual(check(duke({ dates: undefined })), []);
  assert.deepEqual(check(duke({ dates: { born: [1469, 'Q9', 'P569'], died: [1527, 'Q9', 'P570'], start: [1475, 'Q5', 'P569'], end: [1507, 'Q5', 'P570'] } })), []);
  assert.match(check(duke({ dates: { born: [1469, 'Q9', 'P569'], died: [1527, 'Q9', 'P570'] } })).join(), /overlap/, 'half the dates show nothing');
  // an act needs no dates: a treaty's text has no author whose life could overlap
  const act = over => base({ basis: 'ACT', dates: undefined, source: [{ collection: 'A treaty series' }], ...over });
  assert.deepEqual(check(act()), []);
  // X2: but an act with an author is that author's: born in 1900, he wrote no programme of a league that ended in 1852
  assert.match(check(act({ dates: { born: [1900, 'Q9', 'P569'], died: [1970, 'Q9', 'P570'], start: [1847, 'Q1', 'P571'], end: [1852, 'Q1', 'P576'] } })).join(), /ACT.*overlap/);
  assert.deepEqual(check(act({ dates: { born: [1818, 'Q9', 'P569'], died: [1883, 'Q9', 'P570'], start: [1847, 'Q1', 'P571'], end: [1852, 'Q1', 'P576'] } })), []);
});

test('flags come from the list and stand where the rule puts them', () => {
  assert.match(check(base({ flags: [{ id: 'LATE' }] })).join(), /flag/);
  assert.match(check(base({ flags: ['RETROSPECTIVE'] })).join(), /flag/);
  // CONTEMPORARY, UNKNOWN, FORERUNNER and POLEMIC stand in place of a tag, never beside one
  for (const id of ['CONTEMPORARY', 'UNKNOWN']) assert.match(check(base({ flags: [{ id }] })).join(), new RegExp(id + '.*in place'));
  for (const id of ['FORERUNNER', 'POLEMIC']) assert.match(check(idea({ flags: [{ id }] })).join(), new RegExp(id + '.*in place'));
  assert.match(check(base({ tag: null, basis: null, flags: [{ id: 'FORERUNNER' }] })).join(), /FORERUNNER.*happening/);
  assert.match(check(idea({ tag: null, basis: null, flags: [{ id: 'CONTEMPORARY' }] })).join(), /CONTEMPORARY.*idea/);
  // RETROSPECTIVE stands beside a primary tag on a happening, with the gap in years over ten where both dates are held
  const retro = base({ flags: [{ id: 'RETROSPECTIVE', years: 15 }], dates: { ...base().dates, written: [-389, 'shelf'] } });
  assert.deepEqual(check(retro), []);
  assert.match(check(base({ flags: [{ id: 'RETROSPECTIVE', years: 8 }] })).join(), /RETROSPECTIVE.*ten/);
  assert.match(check(base({ flags: [{ id: 'RETROSPECTIVE', years: 12 }], dates: { ...base().dates, written: [-389, 'shelf'] } })).join(), /RETROSPECTIVE.*15/);
  assert.match(check(later({ flags: [{ id: 'RETROSPECTIVE', years: 15 }] })).join(), /RETROSPECTIVE.*primary/);
  // and a primary tag written over ten years after a happening ended must say so
  assert.match(check(base({ dates: { ...base().dates, written: [-380, 'shelf'] } })).join(), /RETROSPECTIVE.*24/);
  // AS-TOLD-TO names the other person; DISPUTED may stand anywhere
  assert.match(check(base({ flags: [{ id: 'AS-TOLD-TO' }] })).join(), /AS-TOLD-TO.*name/);
  assert.deepEqual(check(base({ flags: [{ id: 'AS-TOLD-TO', with: 'Richard Washburn Child' }] })), []);
  assert.deepEqual(check(idea({ flags: [{ id: 'DISPUTED' }] })), []);
  assert.match(check(idea({ flags: [{ id: 'DISPUTED' }, { id: 'DISPUTED' }] })).join(), /twice/);
});

test('a CONTEMPORARY flag needs the lives to overlap, which only the dates can show', () => {
  const c = base({ tag: null, basis: null, flags: [{ id: 'CONTEMPORARY' }], evidence: 'He lived through it.' });
  assert.deepEqual(check(c), []);
  assert.match(check({ ...c, dates: { ...c.dates, born: [-380, 'Q9', 'P569'], died: [-320, 'Q9', 'P570'] } }).join(), /CONTEMPORARY.*overlap/);
});

test('a person’s own book is primary on that person at high confidence', () => {
  const own = base({ subject: { q: 'Q9', label: 'The author', kind: 'person' }, basis: 'OWN', dates: undefined, source: [{ wd: 'Q99', p: 'P50', v: 'Q9' }], evidence: 'The author wrote the book.' });
  assert.deepEqual(check(own), []);
  assert.match(check({ ...own, confidence: 'medium' }).join(), /own book.*high/);
});

test('a part by another hand names its chapter and its writer', () => {
  const p = later({ part: { ch: 0, heading: 'Editor’s preface', by: 'An Editor', byq: 'Q9' } });
  assert.deepEqual(check(p), []);
  assert.match(check(later({ part: { ch: 0, heading: '', by: 'An Editor' } })).join(), /part/);
  assert.match(check(later({ part: { heading: 'Editor’s preface', by: 'An Editor' } })).join(), /part/);
});

test('the three script-decided bases come from data alone', () => {
  // BORNAFTER: a happening or a person, the author born after its end, both dates held
  assert.deepEqual(derive({ kind: 'happening', born: 1737, end: 476 }), { tag: 'secondary', basis: 'BORNAFTER', confidence: 'high' });
  assert.deepEqual(derive({ kind: 'person', born: 1854, end: 1831 }), { tag: 'secondary', basis: 'BORNAFTER', confidence: 'high' });
  assert.equal(derive({ kind: 'happening', born: 1780, end: 1815 }), null, 'an overlap gives no tag');
  assert.equal(derive({ kind: 'happening', born: 1737 }), null, 'no tag on one date');
  assert.equal(derive({ kind: 'idea', born: 1851, end: 1883 }), null, 'nobody is born after an idea');
  assert.equal(derive({ kind: 'idea', born: 1900, end: 1800 }), null, 'not even with the dates in order: BORNAFTER is for happenings and persons');
  // ACT: the work is the subject's own act and its collection says so
  assert.deepEqual(derive({ kind: 'happening', act: 'Treaty series of the League' }), { tag: 'primary', basis: 'ACT', confidence: 'high' });
  // OWN: the author's movement (P135) or ideology (P1142) on Wikidata names the idea
  assert.deepEqual(derive({ kind: 'idea', subject: 'Q7264', ideologies: ['Q7264', 'Q6186'] }), { tag: 'primary', basis: 'OWN', confidence: 'medium' });
  assert.deepEqual(derive({ kind: 'idea', subject: 'Q203411', movements: ['Q203411'] }), { tag: 'primary', basis: 'OWN', confidence: 'medium' });
  assert.equal(derive({ kind: 'idea', subject: 'Q7264', movements: ['Q203411'] }), null);
  assert.equal(derive({ kind: 'happening', subject: 'Q7264', ideologies: ['Q7264'] }), null, 'OWN is for ideas');
  assert.equal(derive({}), null);
});

test('scriptBasis reads a stored link’s own data the way derive does', () => {
  assert.equal(scriptBasis(later(), 'Q9').basis, 'BORNAFTER');
  assert.equal(scriptBasis(idea(), 'Q9').basis, 'OWN');
  assert.equal(scriptBasis(idea(), 'Q8'), null, 'another man’s movement is not the author’s');
  assert.equal(scriptBasis(base(), 'Q9'), null);
  assert.equal(scriptBasis(base({ basis: 'ACT', dates: undefined, source: [{ collection: 'A treaty series' }] }), 'Q9').basis, 'ACT');
});

test('the one table of wording covers every tag, basis, flag and confidence, in plain words', () => {
  for (const t of Object.keys(TAGS)) assert.ok(WORDING.tag[t], t);
  assert.equal(WORDING.tag.primary, 'Primary source');
  assert.equal(WORDING.tag.secondary, 'Secondary source');
  for (const b of Object.keys(BASES)) for (const k of BASES[b].kinds) assert.ok(basisText(b, k), `${b} on ${k}`);
  for (const f of Object.keys(FLAGS)) assert.ok(WORDING.flag[f], f);
  for (const c of CONFIDENCE) assert.ok(WORDING.confidence[c], c);
  assert.equal(flagText({ id: 'RETROSPECTIVE', years: 15 }), 'written long after (15 years after it ended)');
  assert.equal(flagText({ id: 'RETROSPECTIVE' }), 'written long after');
  assert.equal(flagText({ id: 'CONTEMPORARY' }), 'lived through it; not shown to be a witness');
  assert.equal(flagText({ id: 'FORERUNNER' }), 'wrote before the idea had its name');
  assert.match(flagText({ id: 'AS-TOLD-TO', with: 'Richard Washburn Child' }), /Richard Washburn Child/);
  for (const s of readerTexts()) {
    assert.doesNotMatch(s, ID, `an id reaches the reader: ${s}`);
    assert.doesNotMatch(s, /'/, `a straight apostrophe: ${s}`);
  }
  assert.match(WORDING.about, /AI model \(Claude\)/, 'the paragraph says who judged, in VM’s words for generated text');
  assert.match(WORDING.about, /link/);
});

test('plain() gives a reader the words and never an id; only high and medium show', () => {
  const p = plain(base({ flags: [{ id: 'RETROSPECTIVE', years: 15 }], dates: { ...base().dates, written: [-389, 'shelf'] } }));
  assert.equal(p.tag, 'Primary source');
  assert.equal(p.basis, basisText('PART', 'happening'));
  assert.deepEqual(p.flags, ['written long after (15 years after it ended)']);
  assert.equal(p.shown, true);
  for (const s of [p.tag, p.basis, ...p.flags]) assert.doesNotMatch(s, ID);
  assert.equal(isShown(base({ confidence: 'low', held: 'x' })), false);
  assert.equal(plain(base({ confidence: 'low', held: 'x' })).shown, false);
  const none = plain(idea({ tag: null, basis: null, flags: [{ id: 'FORERUNNER' }], confidence: 'medium' }));
  assert.equal(none.tag, null);
  assert.deepEqual(none.flags, ['wrote before the idea had its name']);
  assert.equal(isShown(idea({ tag: null, basis: null, flags: [], confidence: 'medium' })), false, 'no tag and no flag: the reader is told nothing');
  const part = plain(later({ part: { ch: 0, heading: 'Editor’s preface', by: 'An Editor', byq: 'Q9' } }));
  assert.match(part.part, /Editor’s preface.*An Editor/);
});

// ---- Added by the fixer of MI-14 (review findings R3 to R6 and P4, 22 November 2026).
test('the dates a link reads are its author’s and its subject’s own (R5)', () => {
  // the author's life: given the work's authors, a birth or a death read from anyone else fails
  assert.deepEqual(check(later(), { authors: ['Q9'] }), []);
  assert.match(check(later({ dates: { born: [1737, 'Q8', 'P569'], end: [476, 'Q2', 'P576'] } }), { authors: ['Q9'] }).join(), /author/);
  assert.match(check(base({ dates: { ...base().dates, born: [-469, 'Q517', 'P569'], died: [-399, 'Q517', 'P570'] } }), { authors: ['Q9'] }).join(), /author/);
  assert.deepEqual(check(base(), { authors: ['Q7', 'Q9'] }), [], 'a work by two hands may read either author’s life');
  // the subject's span: the start and the end are read from the subject's own item
  assert.match(check(later({ dates: { born: [1737, 'Q9', 'P569'], end: [476, 'Q3', 'P576'] } })).join(), /subject/);
  assert.match(check(base({ dates: { ...base().dates, start: [-431, 'Q4', 'P580'] } })).join(), /subject/);
});

test('RETROSPECTIVE counts from when the writing began, where the book says, to its last revision (R3)', () => {
  const span = (over, flags) => base({ dates: { ...base().dates, ...over }, flags });
  // begun 3 years after the end: not written long after, and no note is wanted, though the last revision came later
  assert.deepEqual(check(span({ begun: [-401, 'a-book', 1], written: [-389, 'shelf'] }, [])), []);
  assert.match(check(span({ begun: [-401, 'a-book', 1], written: [-389, 'shelf'] }, [{ id: 'RETROSPECTIVE', years: 15 }])).join(), /RETROSPECTIVE/);
  // begun 16 years after: the note gives the gap from the start of the writing to its last revision
  assert.deepEqual(check(span({ begun: [-388, 'a-book', 1], written: [-376, 'shelf'] }, [{ id: 'RETROSPECTIVE', years: 16, to: 28 }])), []);
  assert.match(check(span({ begun: [-388, 'a-book', 1], written: [-376, 'shelf'] }, [{ id: 'RETROSPECTIVE', years: 28 }])).join(), /RETROSPECTIVE.*16/);
  assert.match(check(span({ begun: [-388, 'a-book', 1], written: [-376, 'shelf'] }, [{ id: 'RETROSPECTIVE', years: 16 }])).join(), /RETROSPECTIVE.*28/);
  assert.match(check(span({ begun: [-388, 'a-book', 1], written: [-376, 'shelf'] }, [])).join(), /RETROSPECTIVE.*16/);
  // begun is read from the book's own text, by chapter, and cannot come after the last revision
  assert.match(check(span({ begun: [-388, 'Q1', 'P571'] }, [{ id: 'RETROSPECTIVE', years: 16 }])).join(), /begun/);
  assert.match(check(span({ begun: [-370, 'a-book', 1], written: [-376, 'shelf'] }, [{ id: 'RETROSPECTIVE', years: 34, to: 28 }])).join(), /begun/);
  assert.equal(flagText({ id: 'RETROSPECTIVE', years: 16, to: 28 }), 'written long after (16 to 28 years after it ended)');
  assert.equal(flagText({ id: 'RETROSPECTIVE', years: 16, to: 16 }), 'written long after (16 years after it ended)');
});

test('FORERUNNER needs a source that dates the idea’s name after the work (R4)', () => {
  const fore = over => idea({ tag: null, basis: null, flags: [{ id: 'FORERUNNER' }], evidence: 'Wikidata names a man born after the book as the one who named the school.',
    source: [{ wd: 'Q3', p: 'P3938', v: 'Q7' }, { wd: 'Q7', p: 'P569' }], ...over });
  assert.deepEqual(check(fore({ dates: { died: [1790, 'Q9', 'P570'], written: [1776, 'shelf'], named: [1818, 'Q7', 'P569'] } })), []);
  assert.match(check(fore({ dates: undefined })).join(), /FORERUNNER.*named/);
  assert.match(check(fore({ dates: { written: [1776, 'shelf'], named: [1770, 'Q7', 'P569'] } })).join(), /FORERUNNER.*1770/);
  assert.match(check(fore({ dates: { written: [1776, 'shelf'], named: [1818, 'shelf'] } })).join(), /named/);
  assert.equal(WORDING.property.P3938, 'named by');
});

test('a study of a person by someone not shown to have known the person is a secondary source on the person (R6, step 4)', () => {
  const study = base({ subject: { q: 'Q9061', label: 'A thinker', kind: 'person' }, tag: 'secondary', basis: 'OUTSIDE', dates: undefined,
    evidence: 'Wikidata gives the thinker as the book’s main subject, and the book studies his writings.', source: [{ wd: 'Q6372070', p: 'P921', v: 'Q9061' }], confidence: 'medium' });
  assert.deepEqual(check(study), []);
  assert.ok(basisText('OUTSIDE', 'person'));
  assert.notEqual(basisText('OUTSIDE', 'person'), basisText('FROMOTHERS', 'person'), 'a study of a person’s own writings is not written from others’ accounts');
  assert.match(check({ ...study, subject: { ...study.subject, kind: 'happening' } }).join(), /OUTSIDE.*happening/);
});

test('the wording of the bases and notes assumes no sex of author or subject (P4)', () => {
  for (const byKind of Object.values(WORDING.basis)) for (const s of Object.values(byKind)) assert.doesNotMatch(s, /\b(?:he|him|his|she|her|hers)\b/i, s);
  for (const s of Object.values(WORDING.flag)) assert.doesNotMatch(s, /\b(?:he|him|his|she|her|hers)\b/i, s);
});

test('checkFile finds a link stored twice and a file without its fields', () => {
  assert.deepEqual(checkFile({ judged: '2026-11-22', links: [base(), later()] }), []);
  assert.match(checkFile({ judged: '2026-11-22', links: [base(), base()] }).join(), /twice/);
  assert.match(checkFile({ links: [] }).join(), /judged/);
});

test('the Master Index types map onto the three kinds', () => {
  assert.equal(kindOfType('person'), 'person');
  for (const t of ['idea', 'topic']) assert.equal(kindOfType(t), 'idea', t);
  for (const t of ['conflict', 'polity', 'event', 'party', 'period', 'series', 'organisation', 'election']) assert.equal(kindOfType(t), 'happening', t);
});

// ---- The reviewed file against the rule, the shelf and the Master Index.
const FILE = read(LINKS_PATH);
const SHELF = read('bibliotheca/data/index.json');
const book = slug => read(`bibliotheca/data/books/${slug}.json`);
const volumes = slug => SHELF.books.filter(b => b.slug === slug || b.set?.slug === slug).map(b => b.slug);
const lake = q => { const s = read(`lake/data/e/${+q.slice(1) % 512}.json`); return s[q] || null; };

// The people whose lives a link may read (R5): a part's writer for a part; for the main text the shelf's author, and a
// second author the file itself cites as the work's author on Wikidata (P50), as Engels is of the Manifesto.
const authorsOf = l => (l.part ? [l.part.byq].filter(Boolean)
  : [book(volumes(l.work)[0]).author.qid, ...FILE.links.filter(x => x.work === l.work).flatMap(x => x.source.filter(s => s.p === 'P50' && s.wd === (x.wq || l.wq)).map(s => s.v))]);

test('the file passes the rule, each link reading its own author’s life', () => {
  assert.deepEqual(checkFile(FILE, { authorsOf, volumesOf: l => volumes(l.work) }), []);
  assert.ok(FILE.links.length >= 40, `${FILE.links.length} links`);
});

test('the review’s findings stay fixed in the file (R1 to R4, R6, R7)', () => {
  const one = (work, q, part = null) => FILE.links.find(l => l.work === work && l.subject.q === q && (part === null ? !l.part : l.part?.ch === part));
  // R1: the Manifesto's authors hold kinds of socialism, so it is no polemic against it: the sources disagree
  const soc = one('communist-manifesto', 'Q7272');
  assert.equal(soc.tag, null);
  assert.deepEqual(soc.flags.map(f => f.id), ['DISPUTED']);
  assert.ok(soc.source.some(s => s.wd === 'Q6186' && s.p === 'P279' && s.v === 'Q7272'));
  // R2: the memoir in On War is the translator's, J. J. Graham's
  const memoir = one('on-war', 'Q76430', 4);
  assert.equal(memoir.part.by, 'J. J. Graham');
  assert.equal(memoir.part.byq, 'Q29584485');
  assert.doesNotMatch(memoir.evidence, /unsigned/);
  // R3: the Napoleonic Wars rest on Wikidata, not the book's own words: fair evidence; the writing began in 1818
  const napo = one('on-war', 'Q78994');
  assert.equal(napo.confidence, 'medium');
  assert.equal(napo.dates.begun[0], 1818);
  assert.ok(!napo.flags.some(f => f.id === 'RETROSPECTIVE'), 'begun three years after the wars ended');
  for (const q of ['Q154426', 'Q184320', 'Q151005', 'Q855429', 'Q920107']) assert.ok(napo.source.some(s => s.p === 'P607' && s.v === q), q);
  assert.deepEqual(one('on-war', 'Q207318').flags, [{ id: 'RETROSPECTIVE', years: 16, to: 28 }]);
  // R4: Wikidata dates the name of classical economics after Smith
  const ce = one('wealth-of-nations', 'Q271857');
  assert.equal(ce.tag, null);
  assert.deepEqual(ce.flags.map(f => f.id), ['FORERUNNER']);
  assert.ok(ce.source.some(s => s.wd === 'Q271857' && s.p === 'P3938' && s.v === 'Q9061'));
  // R6: the subjects the books are plainly about are each in the file; the study's two rows that were dropped, which
  // the file itself says the books are not about, are kept apart from the links (X11: step 0 stores a link only for a
  // subject the book is plainly about), each with its reason
  for (const [w, q] of [['karl-marx-and-the-close-of-his-system', 'Q9061'], ['wealth-of-nations', 'Q207449'], ['origin-of-species', 'Q1063'], ['on-war', 'Q198']]) assert.ok(one(w, q), `${w} → ${q}`);
  for (const [w, q] of [['decline-and-fall', 'Q12539'], ['origin-of-species', 'Q202261']]) {
    assert.equal(one(w, q), undefined, `${w} → ${q} is not a link`);
    assert.match(FILE.setAside.find(a => a.work === w && a.q === q)?.why || '', /not a subject the book is about/, `${w} → ${q} is set aside with its reason`);
  }
  assert.equal(FILE.setAside.length, 2);
  assert.equal(one('karl-marx-and-the-close-of-his-system', 'Q9061').basis, 'OUTSIDE');
  // R7: Böhm-Bawerk's authorship of Capital and Interest is cited from the work's author statement
  assert.ok(one('capital-and-interest', 'Q311535').source.some(s => s.wd === 'Q4212911' && s.p === 'P50' && s.v === 'Q311535'));
});

test('a begun date is a chapter of the work itself', () => {
  for (const l of FILE.links.filter(l => l.dates?.begun)) {
    const [, slug, n] = l.dates.begun;
    assert.ok(volumes(l.work).includes(slug), `${l.work}: ${slug}`);
    assert.ok(book(slug).chapters.some(c => c.n === n), `${slug} has no chapter ${n}`);
    assert.ok(l.source.some(s => s.book === slug && s.ch === n), `${l.work} → ${l.subject.label}: the begun date’s chapter is among the sources`);
  }
});

test('every work is on the shelf, every book on the shelf has links, and the work ids are the shelf’s', () => {
  for (const l of FILE.links) {
    const vols = volumes(l.work);
    assert.ok(vols.length, `${l.work} is not on the shelf`);
    assert.equal(l.wq, book(vols[0]).work.qid, `${l.work}: the work’s id is the shelf’s`);
  }
  const covered = new Set(FILE.links.flatMap(l => volumes(l.work)));
  for (const b of SHELF.books) assert.ok(covered.has(b.slug), `${b.slug} has no links`);
});

test('every chapter named as a source or a part is in that book, under that heading', () => {
  for (const l of FILE.links) {
    for (const s of l.source.filter(s => s.book)) {
      const vols = volumes(l.work);
      assert.ok(vols.includes(s.book) || s.other, `${l.work} → ${l.subject.label}: ${s.book} is not this work (say other: true for another book of the shelf)`);
      assert.ok(book(s.book).chapters.some(c => c.n === s.ch), `${s.book} has no chapter ${s.ch}`);
    }
    if (l.part) {
      const ch = book(l.part.book || l.work).chapters.find(c => c.n === l.part.ch);
      assert.ok(ch, `${l.work} has no chapter ${l.part.ch}`);
      assert.equal(ch.heading, l.part.heading);
    }
  }
});

test('an author’s own book is on its author, as the shelf or Wikidata names him', () => {
  for (const l of FILE.links.filter(l => l.basis === 'OWN' && l.subject.kind === 'person')) {
    const authors = [book(volumes(l.work)[0]).author.qid, ...l.source.filter(s => s.p === 'P50').map(s => s.v)];
    assert.ok(authors.includes(l.subject.q), `${l.work}: ${l.subject.label} is not its author`);
  }
});

test('where a script could decide a link, the stored link agrees with it', () => {
  for (const l of FILE.links) {
    const author = l.part?.byq || book(volumes(l.work)[0]).author.qid;
    const s = scriptBasis(l, author);
    if (s) assert.equal(l.tag, s.tag, `${l.work} → ${l.subject.label}: the script says ${s.basis}`);
  }
});

test('the dates a link holds are the shelf’s where they come from the shelf', () => {
  for (const l of FILE.links.filter(l => l.dates?.written)) {
    assert.equal(l.dates.written[1], 'shelf');
    assert.equal(l.dates.written[0], book(volumes(l.work)[0]).work.written, l.work);
  }
});

// Refresh pins 2 (28 November 2026): the file is VM's, judged on one day; the lake is rebuilt from Wikidata each month
// (lake-refresh.yml, which does not run this file), and an entry dropped or retyped there (its type is from Wikidata's
// classes) would fail the deploy, not the refresh. So the file is held to the lake while the lake is the one it was
// checked against (built on 26 November 2026) or the file was judged after the lake was built; whatever the day, its
// shape. (The pages ask the lake, not the file's entry flag, so a stale flag misleads no reader.)
test('a subject the file says has an entry has one, of a kind that fits; a link waits for one otherwise', t => {
  for (const l of FILE.links.filter(l => l.entry)) {
    assert.match(l.subject.q, /^Q\d+$/, `${l.subject.label}: a Q-id`);
    assert.ok(KINDS.includes(l.subject.kind), `${l.subject.label}: a kind the rule knows (${l.subject.kind})`);
  }
  // a later entry needs no change to the file: the pages ask the lake, so a link marked false may gain one
  assert.ok(FILE.links.some(l => !l.entry), 'some links wait for their entry');
  const lakeBuilt = read('lake/data/manifest.json').generated;
  if (!builtOn(lakeBuilt, '2026-11-26') && !readAfter(FILE.judged, lakeBuilt)) {
    t.skip(`the lake was rebuilt from Wikidata at ${lakeBuilt}, after the file was judged (${FILE.judged}) and after the lake of 26 November 2026 it was checked against: its entries are not compared with the file`);
    return;
  }
  for (const l of FILE.links.filter(l => l.entry)) {
    const e = lake(l.subject.q);
    assert.ok(e, `${l.subject.label} (${l.subject.q}) has no entry`);
    assert.equal(kindOfType(e.type), l.subject.kind, `${l.subject.label}: the entry is a ${e.type}`);
  }
});

test('linksOn and linksFrom find a subject’s books and a book’s subjects, sets included', () => {
  const on = linksOn(FILE, 'Q2277');
  assert.ok(on.length && on.every(l => l.subject.q === 'Q2277'));
  const from = linksFrom(FILE, 'decline-and-fall-3', SHELF);
  assert.ok(from.length && from.every(l => l.work === 'decline-and-fall'));
  assert.ok(linksFrom(FILE, 'the-prince', SHELF).every(l => l.work === 'the-prince'));
});

test('every reader sentence in the file is plain: no id, no quotation, the typographic apostrophe', () => {
  for (const l of FILE.links) {
    const p = plain(l);
    for (const s of [p.tag, p.basis, ...p.flags, p.evidence, p.part, l.why, l.note, l.held].filter(Boolean)) {
      assert.doesNotMatch(s, ID, `${l.work} → ${l.subject.label}: ${s}`);
      assert.doesNotMatch(s, /'|"|“|”/, `${l.work} → ${l.subject.label}: ${s}`);
    }
  }
});

// ---- The second reader's points of 22 November 2026 (Codex on the first commit): what the checker let through.
test('X1: a shown link rests on evidence of its own; another book’s chapter or a Master Index tag alone is weak', () => {
  const weak = idea({ source: [{ book: 'another-book', ch: 1, other: true }, { lake: 'Q9', tag: 'School:A school' }], evidence: 'Other books on the shelf name the author as the source of the school’s theory.' });
  assert.match(check(weak).join(), /shown link rests on/);
  assert.match(check({ ...weak, confidence: 'high' }).join(), /shown link rests on/);
  assert.deepEqual(check({ ...weak, confidence: 'low', held: 'The evidence lies only in other books.' }), []);
  // the committed record that prompted it, raised from low to high, no longer passes
  const money = FILE.links.find(l => l.work === 'origin-of-money' && l.subject.q === 'Q203411');
  assert.equal(money.confidence, 'low');
  assert.equal(isShown(money), false);
  assert.match(check({ ...money, confidence: 'high', held: undefined }).join(), /shown link rests on/);
  // a chapter of another book is marked as such, where the work's own volumes are known
  assert.match(check(base({ source: [{ book: 'another-book', ch: 2 }] }), { volumes: ['a-book'] }).join(), /another book \(another-book\) is marked other/);
  assert.deepEqual(check(base(), { volumes: ['a-book'] }), []);
});

test('X1: OWN on an idea cites the author’s movement or ideology naming it, or the work’s own text', () => {
  assert.deepEqual(check(idea()), []);
  assert.match(check(idea({ source: [{ wd: 'Q9', p: 'P135', v: 'Q4' }] })).join(), /OWN on an idea cites/, 'the movement named is another');
  assert.match(check(idea({ source: [{ wd: 'Q3', p: 'P921' }] })).join(), /OWN on an idea cites/, 'a statement, but not the author’s movement');
  assert.match(check(idea(), { authors: ['Q8'] }).join(), /OWN on an idea cites/, 'the statement is on someone else’s item');
  assert.deepEqual(check(idea(), { authors: ['Q9'] }), []);
  assert.deepEqual(check(idea({ source: [{ book: 'a-book', ch: 1 }], evidence: 'Chapter I states the doctrine in the author’s own voice.' })), []);
});

test('X1: FORERUNNER’s naming date is the idea’s own, or that of a person a cited statement on the idea names', () => {
  const fore = over => idea({ tag: null, basis: null, flags: [{ id: 'FORERUNNER' }], source: [{ wd: 'Q3', p: 'P3938', v: 'Q7' }],
    evidence: 'Wikidata says the school was named by a writer born after the author died.', dates: { died: [1790, 'Q9', 'P570'], named: [1818, 'Q7', 'P569'] }, ...over });
  assert.deepEqual(check(fore()), []);
  assert.deepEqual(check(fore({ dates: { died: [1790, 'Q9', 'P570'], named: [1800, 'Q3', 'P571'] } })), []);
  assert.match(check(fore({ dates: { died: [1790, 'Q9', 'P570'], named: [1818, 'Q8', 'P569'] } })).join(), /FORERUNNER: dates\.named is read from Q8/, 'an unrelated person’s birth');
  // Only a "named by" statement names the namer, and only a birth or the idea's own inception dates the name: another
  // idea's inception reached through another relation, the namer's death, or another date of the idea's item do not.
  assert.match(check(fore({ source: [{ wd: 'Q3', p: 'P279', v: 'Q7' }], dates: { died: [1790, 'Q9', 'P570'], named: [1900, 'Q7', 'P571'] } })).join(), /FORERUNNER: dates\.named is read from Q7 \(P571\)/, 'another idea’s inception');
  assert.match(check(fore({ source: [{ wd: 'Q3', p: 'P279', v: 'Q7' }] })).join(), /FORERUNNER: dates\.named is read from Q7 \(P569\)/, 'a birth, but of no one a “named by” statement names');
  assert.match(check(fore({ dates: { died: [1790, 'Q9', 'P570'], named: [1883, 'Q7', 'P570'] } })).join(), /FORERUNNER: dates\.named is read from Q7 \(P570\)/, 'the namer’s death');
  assert.match(check(fore({ dates: { died: [1790, 'Q9', 'P570'], named: [1800, 'Q3', 'P580'] } })).join(), /FORERUNNER: dates\.named is read from Q3 \(P580\)/, 'the idea’s item, but not its inception');
});

test('X1: RETROSPECTIVE gives a range only where the book dates the start of its writing', () => {
  const late = flag => base({ dates: { ...base().dates, written: [-391, 'shelf'] }, flags: [flag] });
  assert.deepEqual(check(late({ id: 'RETROSPECTIVE', years: 13 })), []);
  assert.match(check(late({ id: 'RETROSPECTIVE', years: 13, to: 99 })).join(), /to is given only where/);
});

test('X8: years across 1 BC and AD 1 are counted with no year zero', () => {
  assert.equal(yearsFrom(-10, 1), 10);
  assert.equal(yearsFrom(-431, -404), 27);
  assert.equal(yearsFrom(1836, 1859), 23);
  const d = { born: [-40, 'Q9', 'P569'], died: [30, 'Q9', 'P570'], start: [-20, 'Q1', 'P580'], end: [-10, 'Q1', 'P582'], written: [5, 'shelf'] };
  assert.deepEqual(check(base({ dates: d, flags: [{ id: 'RETROSPECTIVE', years: 14 }] })), []);
  assert.match(check(base({ dates: d, flags: [{ id: 'RETROSPECTIVE', years: 15 }] })).join(), /the dates give 14 years/);
  // ten years exactly is not long after: no flag is asked for where the old sum made eleven
  assert.deepEqual(check(base({ dates: { ...d, written: [1, 'shelf'] } })), []);
});

test('X4: a part by another hand that one volume holds is listed on that volume only', () => {
  const shelf = { books: [{ slug: 'v1', set: { slug: 's' } }, { slug: 'v2', set: { slug: 's' } }] };
  const file = { links: [{ work: 's', part: null, subject: { q: 'Q1' } }, { work: 's', part: { ch: 0, heading: 'Preface', by: 'An Editor', book: 'v2' }, subject: { q: 'Q2' } },
    { work: 's', part: { ch: 3, heading: 'Note', by: 'An Editor' }, subject: { q: 'Q3' } }] };
  assert.deepEqual(linksFrom(file, 'v1', shelf).map(l => l.subject.q), ['Q1', 'Q3']);
  assert.deepEqual(linksFrom(file, 'v2', shelf).map(l => l.subject.q), ['Q1', 'Q2', 'Q3']);
  // on the shelf: every part that names its volume is listed on that volume and on no other of its set
  const held = FILE.links.filter(l => l.part?.book);
  for (const l of held) for (const v of volumes(l.work)) assert.equal(linksFrom(FILE, v, SHELF).includes(l), v === l.part.book, `${l.work}, ${l.part.heading}, on ${v}`);
});

test('X11: a subject set aside is not a link, and says why', () => {
  const ok = { judged: '2026-11-22', links: [base()], setAside: [{ work: 'a-book', q: 'Q5', label: 'A later doctrine', why: 'Later readers drew it from the book; the book is not about it.' }] };
  assert.deepEqual(checkFile(ok), []);
  assert.match(checkFile({ ...ok, setAside: [{ work: 'a-book', q: 'Q1', label: 'A war', why: 'It is stored above as a link as well.' }] }).join(), /also stored as a link/);
  assert.match(checkFile({ ...ok, setAside: [{ work: 'a-book', q: 'Q5', label: 'A later doctrine' }] }).join(), /why it is not a subject/);
  assert.match(checkFile({ ...ok, setAside: {} }).join(), /setAside is a list/);
  // no link of the committed file says of itself that the book is not about its subject (step 0)
  for (const l of FILE.links) assert.doesNotMatch(`${l.held || ''} ${l.why}`, /not a subject the book is about|the book is not about it/, `${l.work} → ${l.subject.label}`);
  for (const a of FILE.setAside) assert.doesNotMatch(a.why, ID, `${a.work} → ${a.label}`);
});

test('the file’s mends of 22 November: the League’s years, who devised Marxism, what the Origin’s introduction dates', () => {
  const one = (work, q) => FILE.links.find(l => l.work === work && l.subject.q === q && !l.part);
  // X2: the Manifesto is the League's own act, and its authors' lives are shown to overlap the League's years
  const league = one('communist-manifesto', 'Q642562');
  assert.equal(league.basis, 'ACT');
  assert.deepEqual(league.dates, { born: [1818, 'Q9061', 'P569'], died: [1883, 'Q9061', 'P570'], start: [1847, 'Q642562', 'P571'], end: [1852, 'Q642562', 'P576'] });
  // X10: the sentence says what its cited statements carry: both men, by the property it cites
  const marxism = one('communist-manifesto', 'Q7264');
  for (const v of ['Q9061', 'Q34787']) assert.ok(marxism.source.some(s => s.wd === 'Q7264' && s.p === 'P61' && s.v === v), v);
  assert.match(marxism.evidence, /Marx and Engels as those who devised it/);
  assert.doesNotMatch(marxism.evidence, /founders/);
  // X3: the gap is from the book's own date; the sentence says the introduction dates earlier notes, not this book's start
  const beagle = one('origin-of-species', 'Q1564366');
  assert.deepEqual(beagle.flags, [{ id: 'RETROSPECTIVE', years: 23 }]);
  assert.equal(beagle.dates.begun, undefined);
  assert.match(beagle.evidence, /first notes .* a sketch to 1844, but not the start of this book/);
  const intro = book('origin-of-species').chapters.find(c => c.n === 0).paragraphs.map(p => (typeof p === 'string' ? p : p.text || '')).join(' ');
  assert.match(intro, /After five years’ work I allowed myself to speculate/);
  assert.match(intro, /these I enlarged in 1844 into a sketch/);
  assert.match(intro, /I have been urged to publish this abstract/);
});
