// Bibliotheca data: the corpus importer (Gutenberg boilerplate cut, chapters and paragraphs split by a book's layout,
// typography set: text.mjs's one level of chapters, and build-book.mjs's splitWork for books of books, notes of other
// shapes, front matter and titles in Title Case), the Encyclopaedia tagger (whole words, longest match first, names
// exact, common nouns by their own name, the era rule, the shelf's decisions) on fixtures, the rights rule, and the
// built files of every book on the shelf (bibliotheca/data/books/*.json, bibliotheca/data/index.json) against the data
// contract in bibliotheca/scripts/build-book.mjs, the chapters stated for each below, the lake, and the book's own
// time (no term dated after its text). Pure: no server, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripBoilerplate, normalise, roman, sentenceCase, splitChapters } from '../bibliotheca/scripts/text.mjs';
import { buildAliasIndex, tagText, tagBook, newStats, report, firstYear, fold, loadLake } from '../bibliotheca/scripts/tag-terms.mjs';
import { SHELF, shelfEntry, checkRights, indexEntry, bookJson, BOOKS, INDEX, ROOT, MAX_BYTES, CACHE } from '../bibliotheca/scripts/shelf.mjs';
import { bookRecord, splitWork, splitBook, titleCase, caseCounts } from '../bibliotheca/scripts/build-book.mjs';
import { tidyAlias } from '../lake/scripts/aliases.mjs';
import { wordCount } from '../kino/lib/text.js';

const read = p => JSON.parse(readFileSync(p, 'utf8'));
const texts = book => book.chapters.flatMap(c => c.paragraphs);

// ---- Fixtures: a Gutenberg-shaped file (CRLF, header, contents list, a dedication, two chapters with a footnote,
// verse and a note on a heading, an appendix, the footer) and the layout that reads it.
const FIXTURE = [
  'The Project Gutenberg eBook of A Test Book', '', 'This eBook is for the use of anyone anywhere.', '', 'Title: A Test Book', '',
  '*** START OF THE PROJECT GUTENBERG EBOOK A TEST BOOK ***', '', 'A Test Book', '', 'Contents', '', ' DEDICATION', ' CHAPTER I. OF ROME AND SPARTA', ' CHAPTER II. OF FRANCE', '', '',
  'DEDICATION', '', 'To the reader', '', 'A short word of _dedication_ -- nothing more.', '', '', '', '',
  'THE BOOK', '', '', '', '',
  'CHAPTER I.', 'OF ROME AND SPARTA, AND OF', 'DARIUS', '', '',
  'Rome and Sparta stood for many ages armed', 'and free.[1] So did the Switzers.', '',
  ' [1] A note on Rome, _cf_. "Burd," p. 5, written 1469-94.', ' It runs on.', '',
  "Second paragraph of chapter one, 'quoted' here.", '',
  'Virtu contro al Furore', "    Prendera l'arme, e fia il combatter corto.", '', '', '', '',
  'CHAPTER II.[1]', 'OF FRANCE', '', ' [1] This chapter has a note on its heading.', '', 'The King of France went to Italy.', '', '', '', '',
  'APPENDIX', '', 'Not part of the book.', '',
  '*** END OF THE PROJECT GUTENBERG EBOOK A TEST BOOK ***', '', 'Updated editions will replace the previous one.', '',
].join('\r\n');
const LAYOUT = {
  chapter: /^CHAPTER ([IVXL]+)\.(?:\[\d+\])?$/, numbering: 'roman', count: 2,
  sections: [{ heading: /^DEDICATION$/, n: 0, title: 'Dedication', until: /^THE BOOK$/ }],
  end: /^APPENDIX$/, proper: ['Rome', 'Sparta', 'Darius', 'France'],
};
const entity = (q, label, type, aliases, facts, total = 0) => [q, { q, label, type, aliases, facts, total }];
// A lake in little: the shapes and the clashes the real one has (lake/data/e/*.json).
const LAKE = new Map([
  entity('Q1747689', 'Ancient Rome', 'place', ['Roman civilization'], { founded: '-0753', dissolved: '0476' }),
  entity('Q17167', 'Roman Republic', 'place', ['res publica', 'Rome'], { founded: '-0509', dissolved: '-0027-01-1' }, 1),
  entity('Q2277', 'Roman Empire', 'place', ['Imperium Romanum'], { start: '-0027-0', end: '0395' }, 1),
  entity('Q12544', 'Byzantine Empire', 'place', ['Roman Empire', 'Byzantium'], { founded: '0395-01-17', dissolved: '1453-05-29' }, 5),
  entity('Q38', 'Italy', 'place', ['Italian Republic'], { founded: '1946-06-18' }, 1),
  entity('Q172579', 'Kingdom of Italy', 'place', ['Italy'], { founded: '1861-03-17', dissolved: '1946-06-18' }, 1),
  entity('Q142', 'France', 'place', ['French Republic'], { founded: '1958-10-04' }, 2),
  entity('Q70972', 'Kingdom of France', 'place', ['French kingdom'], { founded: '0987', dissolved: '1791-09-04' }, 1),
  entity('Q4128', 'Louis Aragon', 'person', ['Aragon'], { born: '1897-10-03', died: '1982-12-24' }),
  entity('Q1399', 'Niccolò Machiavelli', 'person', ['Machiavel'], { born: '1469-05-03', died: '1527-06-21' }, 1),
  entity('Q179073', 'protectionism', 'idea', ['protection'], {}),
  entity('Q7257', 'ideology', 'idea', [], {}),
  entity('Q198', 'war', 'topic', [], {}, 9),
  entity('Q435583', 'Old Swiss Confederacy', 'place', ['Swiss Confederation', 'Switzerland'], { founded: '1291-08', dissolved: '1798-03-05' }),
  entity('Q12548', 'Holy Roman Empire', 'place', ['HRE', 'Reich'], { founded: '0962-02-02', dissolved: '1806-08-06' }),
  entity('Q1519778', 'Republic', 'party', ['REPUBLIKA'], { founded: '2021-03-09' }),
]);
const YEAR = 1532;
const spans = (text, index, opts = { year: YEAR }) => tagText(text, index, opts).map(t => [text.slice(t.s, t.e), t.qid]);

test('importer: the Gutenberg header, footer and licence are cut, and a file without the markers is refused', () => {
  const body = stripBoilerplate(FIXTURE);
  assert.ok(!/Gutenberg/.test(body), 'no Gutenberg text survives');
  assert.ok(!body.includes('Updated editions'), 'the licence is cut');
  assert.ok(body.includes('CHAPTER I.') && body.includes('Not part of the book.'), 'everything between the markers stays for the splitter');
  assert.ok(!body.includes('\r'), 'line endings are \\n');
  assert.equal(stripBoilerplate('﻿' + FIXTURE), body, 'a byte-order mark goes');
  assert.throws(() => stripBoilerplate('Just text\nwith no markers\n'), /START OF THE PROJECT GUTENBERG/);
  assert.throws(() => stripBoilerplate(FIXTURE.split('*** END')[0]), /END OF THE PROJECT GUTENBERG/);
});

test('importer: chapters by the layout, with the kept section first and nothing after the end of the book', () => {
  const chapters = splitChapters(stripBoilerplate(FIXTURE), LAYOUT);
  assert.deepEqual(chapters.map(c => [c.n, c.heading, c.title]), [[0, 'Dedication', 'Dedication'], [1, 'Chapter I', 'Of Rome and Sparta, and of Darius'], [2, 'Chapter II', 'Of France']]);
  assert.deepEqual(chapters[0].paragraphs.map(p => p.text), ['To the reader', 'A short word of dedication — nothing more.'], 'the section ends at its `until` line');
  const all = chapters.flatMap(c => c.paragraphs.map(p => p.text)).join('\n');
  assert.ok(!/APPENDIX|Not part of the book|THE BOOK|Contents/.test(all), 'the contents list, the divider and the appendix are not chapters');
  assert.deepEqual(chapters[2].paragraphs.map(p => [p.id, p.kind, p.note ?? null]), [['c02-n01', 'note', 1], ['c02-p02', 'para', null]], 'a note on the heading comes first');
  assert.equal(chapters[2].words, 9 + 7, 'words are whitespace tokens, as Kino counts them; a note’s "[1]" marker is one');
  for (const c of chapters) for (const p of c.paragraphs) assert.deepEqual(p.terms, [], 'no terms before the tagger runs');
  assert.throws(() => splitChapters(stripBoilerplate(FIXTURE), { ...LAYOUT, count: 3 }), /2 numbered chapters found, the layout expects 3/);
  assert.throws(() => splitChapters(stripBoilerplate(FIXTURE), { ...LAYOUT, end: /^COLOPHON$/ }), /`end` line was not found/);
  assert.throws(() => splitChapters(stripBoilerplate(FIXTURE), { ...LAYOUT, chapter: /^PART ([IVXL]+)$/, sections: [] }), /no heading line matched/);
});

test('importer: paragraphs join their hard wraps, notes and verse are told apart, typography is set', () => {
  const c1 = splitChapters(stripBoilerplate(FIXTURE), LAYOUT)[1];
  assert.deepEqual(c1.paragraphs.map(p => [p.id, p.kind, p.text]), [
    ['c01-p01', 'para', 'Rome and Sparta stood for many ages armed and free.[1] So did the Switzers.'],
    ['c01-n02', 'note', '[1] A note on Rome, cf. “Burd,” p. 5, written 1469–94. It runs on.'],
    ['c01-p03', 'para', 'Second paragraph of chapter one, ‘quoted’ here.'],
    ['c01-v04', 'verse', 'Virtu contro al Furore\nPrendera l’arme, e fia il combatter corto.'],
  ]);
  assert.equal(c1.paragraphs[1].note, 1);
  assert.equal(normalise('a -- b "c" \'d\' e_f 1469-94  x y'), 'a — b “c” ‘d’ ef 1469–94 x y');
  assert.equal(normalise('“already curly” — stays'), '“already curly” — stays');
  assert.equal(roman('XVIII'), 18);
  assert.equal(roman('XXVI'), 26);
  assert.throws(() => roman('ABC'), /not a Roman numeral/);
  assert.equal(sentenceCase('WHY THE KINGDOM OF DARIUS, CONQUERED BY ALEXANDER, DID NOT REBEL', ['Darius', 'Alexander']), 'Why the kingdom of Darius, conquered by Alexander, did not rebel');
  assert.equal(sentenceCase('CONCERNING NEW PRINCIPALITIES WHICH ARE ACQUIRED BY ONE’S OWN ARMS'), 'Concerning new principalities which are acquired by one’s own arms');
});

test('tagger: whole words, longest match first, no match inside another, names case and all', () => {
  const index = buildAliasIndex(LAKE);
  assert.deepEqual(spans('Rome and Sparta stood armed; Rome’s walls; Romeo; rome.', index), [['Rome', 'Q17167'], ['Rome', 'Q17167']], 'a possessive ’s after a name is fine; Romeo and rome are not Rome');
  assert.deepEqual(spans('the Kingdom of France and France', index), [['Kingdom of France', 'Q70972'], ['France', 'Q142']], 'the longer string wins and nothing is matched inside it');
  assert.deepEqual(spans('the Roman Empire fell', index), [['Roman Empire', 'Q2277']], 'the entity whose own name the string is beats one that has it as an alias, whatever its mentions');
  assert.deepEqual(spans('the Holy Roman Empire, or HRE, and the Reich', index), [['Holy Roman Empire', 'Q12548'], ['HRE', 'Q12548'], ['Reich', 'Q12548']], 'short names in capitals match exactly');
  assert.deepEqual(spans('Anglo-Rome and d’Rome', index), [], 'a hyphen or apostrophe inside a word is no boundary');
  const text = 'Niccolo Machiavelli wrote it; Machiavel to the English.';
  const terms = tagText(text, index, { year: YEAR });
  assert.deepEqual(terms, [{ s: 0, e: 19, qid: 'Q1399', label: 'Niccolò Machiavelli' }, { s: 30, e: 39, qid: 'Q1399', label: 'Niccolò Machiavelli' }], 'accents fold for matching; offsets index the original text; label is the entity’s name');
  assert.equal(fold('Niccolò').length, 'Niccolò'.length);
  assert.equal(fold('Niccolò’s'), "Niccolo's");
});

test('tagger: common nouns match in any case, by their own name only, four letters or more', () => {
  const index = buildAliasIndex(LAKE);
  assert.deepEqual(spans('Ideology and ideology; under the protection of Venice; war and wars; ideologies.', index), [['Ideology', 'Q7257'], ['ideology', 'Q7257']]);
});

test('tagger: the era rule skips an entity first dated after the book unless the text has its full name, and explains', () => {
  const index = buildAliasIndex(LAKE), stats = newStats();
  assert.deepEqual(spans('Ferdinand of Aragon; Louis Aragon the poet; Italy; Italian Republic', index, { year: YEAR, stats }), [['Louis Aragon', 'Q4128'], ['Italy', 'Q38']]);
  assert.deepEqual([...stats.skipped.values()].map(s => [s.q, s.alias, s.count]), [['Q4128', 'Aragon', 1], ['Q172579', 'Italy', 1], ['Q38', 'Italian Republic', 1]]);
  assert.deepEqual([...stats.ambiguous], [['"Italy" → Q38 Italy (over Q172579 Kingdom of Italy)', 1]]);
  assert.deepEqual(spans('Ferdinand of Aragon', index, { year: null }), [['Aragon', 'Q4128']], 'with no year there is no era rule');
  assert.equal(firstYear({ founded: '-0509', dissolved: '-0027-01-1' }), -509);
  assert.equal(firstYear({ start: '-0027-0', end: '0395' }), -27);
  assert.equal(firstYear({ born: '1469-05-03', died: '1527-06-21' }), 1469);
  assert.equal(firstYear({ died: '1527' }), null, 'a death alone does not date an entity');
  assert.equal(firstYear({}), null);
});

test('tagger: the shelf’s decisions win: retarget, leave out, add a word; a wrong decision is refused', () => {
  const index = buildAliasIndex(LAKE, { decisions: { France: 'Q70972', Republic: null, Switzers: 'Q435583', 'the Rome': 'Q1747689', Q198: null } });
  assert.deepEqual(spans('France, the Republic, the Switzers, Rome and war; the Kingdom of France', index),
    [['France', 'Q70972'], ['Switzers', 'Q435583'], ['Rome', 'Q1747689'], ['Kingdom of France', 'Q70972']]);
  assert.throws(() => buildAliasIndex(LAKE, { decisions: { Foo: 'Q999999' } }), /no entry/);
  assert.throws(() => buildAliasIndex(LAKE, { decisions: { Q198: 'Q7257' } }), /only be null/);
});

test('tagger: a string the shelf leaves untagged is left whole, so no shorter name inside it is a term', () => {
  const lake = new Map([...LAKE, entity('Q15', 'Africa', 'place', [], {}), entity('Q180393', 'Kingdom of the Two Sicilies', 'place', ['Sicilies'], { founded: '1738' })]);
  const index = buildAliasIndex(lake, { decisions: { 'South Africa': null, 'Two Sicilies': null } });
  assert.deepEqual(spans('South Africa and Africa; the Two Sicilies, and the Sicilies of 1816.', index, { year: 1788 }), [['Africa', 'Q15'], ['Sicilies', 'Q180393']],
    'Darwin’s South Africa is not the continent, Gibbon’s Two Sicilies not the Bourbons’ kingdom; the bare words still are');
  assert.deepEqual(spans('South African Republic', buildAliasIndex(new Map([...lake, entity('Q193619', 'South African Republic', 'place', [], { founded: '1852' })]), { decisions: { 'South Africa': null } })),
    [['South African Republic', 'Q193619']], 'a longer name that starts with it is still the longest match');
});

test('tagger: tagBook fills every paragraph and the report names the top entities, the skipped and the decided', () => {
  const index = buildAliasIndex(LAKE, { decisions: { Switzers: 'Q435583' } });
  const book = { title: 'T', chapters: [{ n: 1, paragraphs: [{ id: 'c01-p01', text: 'Rome, Italy and the Switzers; Aragon.', terms: [] }, { id: 'c01-p02', text: 'Nothing here.', terms: [] }] }] };
  const stats = tagBook(book, index, { year: YEAR });
  assert.equal(stats.terms, 3);
  assert.equal(stats.paragraphs, 2);
  assert.deepEqual(book.chapters[0].paragraphs[1].terms, []);
  const r = report(book, stats, index, { year: YEAR });
  for (const s of ['3 terms, 3 entities', 'Roman Republic', 'Skipped by the era rule (first dated after 1532', 'Louis Aragon', '"Switzers" → Q435583 Old Swiss Confederacy (1 matches)']) assert.ok(r.includes(s), `report has: ${s}`);
});

// ---- splitWork (build-book.mjs): the layouts the other books need, each on a file in little of the shape it reads.
const gutenberg = (...lines) => ['*** START OF THE PROJECT GUTENBERG EBOOK A TEST ***', '', ...lines, '', '*** END OF THE PROJECT GUTENBERG EBOOK A TEST ***'].join('\r\n');
const summary = chapters => chapters.map(c => [c.n, c.heading, c.title, ...(c.part ? [c.part] : [])]);
const paras = c => c.paragraphs.map(p => [p.id, p.kind, ...(p.note ? [p.note] : []), p.text]);

test('splitWork: books of chapters numbered within each (Smith), a book’s introduction and appendix, a table, a margin', () => {
  const text = stripBoilerplate(gutenberg(
    'Contents', '', ' BOOK I. OF THINGS', ' CHAPTER I. OF A', '',
    'INTRODUCTION AND PLAN', '', '      The plan of the work, set', '      with a margin of six.', '',
    'BOOK I.', 'OF THE CAUSES OF', 'THINGS IN EUROPE.', '',
    'CHAPTER I.', 'OF THE DIVISION OF LABOUR IN EUROPE.', '', '      Labour in Europe is divided, and the division', '      of labour is all.', '',
    '  Year    Price     Average', '  1202      0  12   0', '  1205      0  13   4', '',
    'CHAPTER II.', 'OF MONEY.', '', '      Money is a wheel.', '',
    'BOOK II.', 'OF STOCK.', '', '      INTRODUCTION.', '', '      The introduction of the second book.', '',
    'CHAPTER I.', 'OF THE DIVISION OF STOCK.', '', '      Stock is divided.', '',
    '      APPENDIX TO BOOK II', '', '      An account.'));
  const layout = {
    indent: 6, tables: true,
    sections: [{ heading: /^INTRODUCTION AND PLAN$/, n: 0, title: 'Introduction and plan' }, { heading: /^\s*APPENDIX TO BOOK II$/, n: 299, title: 'Appendix', part: true }],
    part: { heading: /^BOOK ([IVX]+)\.$/, label: 'Book', title: 'block', count: 2 },
    chapter: { heading: /^CHAPTER ([IVXL]+)\.$/, title: 'block', within: true, count: 3 },
    intro: { title: 'Introduction', drop: /^\s*INTRODUCTION\.$/ },
  };
  const chapters = splitWork(text, layout);
  const one = { n: 1, heading: 'Book I', title: 'Of the causes of things in Europe' }, two = { n: 2, heading: 'Book II', title: 'Of stock' };
  assert.deepEqual(summary(chapters), [
    [0, 'Introduction and plan', 'Introduction and plan'],
    [101, 'Book I, Chapter I', 'Of the division of labour in Europe', one], [102, 'Book I, Chapter II', 'Of money', one],
    [200, 'Book II', 'Introduction', two], [201, 'Book II, Chapter I', 'Of the division of stock', two],
    [299, 'Book II, Appendix', 'Appendix', two],
  ], 'n is book × 100 + chapter; a title in capitals takes the text’s own case (Europe); the contents list is no book');
  assert.deepEqual(paras(chapters[0]), [['c00-p01', 'para', 'The plan of the work, set with a margin of six.']], 'the margin is not verse');
  assert.deepEqual(paras(chapters[1]), [['c101-p01', 'para', 'Labour in Europe is divided, and the division of labour is all.'],
    ['c101-v02', 'verse', 'Year    Price     Average\n1202      0  12   0\n1205      0  13   4']], 'a table keeps its lines, and its columns less the indent its lines share');
  assert.equal(normalise('     £   s   d\n  1202      0  12   0  ', { columns: true }), '   £   s   d\n1202      0  12   0', 'a first line keeps an indent of its own');
  assert.deepEqual(paras(chapters[3]), [['c200-p01', 'para', 'The introduction of the second book.']], 'the INTRODUCTION label gives way to the title');
  assert.throws(() => splitWork(text, { ...layout, chapter: { ...layout.chapter, count: 4 } }), /3 numbered chapters found, the layout expects 4/);
  assert.throws(() => splitWork(text, { ...layout, part: { ...layout.part, count: 3 } }), /2 books found, the layout expects 3/);
  assert.throws(() => splitWork(text, { ...layout, fix: [['NO SUCH LINE', 'X']] }), /is in the text 0 times, the layout expects 1/);
  assert.throws(() => splitWork(text, { ...layout, start: /^NOWHERE$/ }), /start .* was not found/);
  assert.equal(splitBook(stripBoilerplate(FIXTURE), LAYOUT).length, 3, 'a layout with a chapter regexp is text.mjs’s');
});

test('splitWork: Gibbon’s shape: parts joined, the long title, notes over blocks with their marks, a stray tail', () => {
  const text = stripBoilerplate(gutenberg(
    '         CONTENTS', '', '         Chapter I: The Short Title.—Part I.', '', '     The Long Title Of Rome.—The Fall Of Rome.', '',
    '      Chapter I: The Short Title.—Part I.', '', '     The Long Title Of Rome.—The Fall Of Rome. 101', '',
    '      101 (return) [ A note on the title.—M.]', '',
    '      The empire of Rome was great and long. 1 It fell in A.D. 2 and the', '      fall of the emperors was a title of shame, 2a at last, in its 3d age. 3', '',
    '      1 (return) [ Gibbon’s note, with [a bracket] inside.', '', '      Note: An editor’s note.—M.]', '',
    '      2 (return) [ Another.] The text the file ran on.', '',
    '      3 (return) [ A third.]?', '',
    '      Chapter I: The Short Title.—Part II.', '', '      More of the chapter, by Tangier4 and the rest.', '',
    '      4 (return) [ The fourth.]', '',
    '      Chapter II: The Next.—Part I.', '', '     Of The Senate Of Rome.', '', '      The senate met.'));
  const layout = {
    start: /^ {6}Chapter I:/, notes: 'return', verse: false, indent: 6,
    chapter: { heading: /^\s*Chapter ([IVXLC]+)[:.]/, title: 'next', continued: /Part\s*([IVX]+)\.?$/, case: 'text', first: 1, count: 2 },
  };
  const stats = { notes: 0, unmarked: [] };
  const chapters = splitWork(text, layout, stats);
  assert.deepEqual(summary(chapters), [[1, 'Chapter I', 'The long title of Rome.—The fall of Rome'], [2, 'Chapter II', 'Of the senate of Rome']],
    'the long title in the text’s own case, its mark gone; Part II carries chapter I on');
  assert.deepEqual(paras(chapters[0]), [
    ['c01-n01', 'note', 101, '[101] A note on the title.—M.'],
    ['c01-p02', 'para', 'The empire of Rome was great and long.[1] It fell in A.D. 2 and the fall of the emperors was a title of shame,[2] at last, in its 3d age.[3]'],
    ['c01-n03', 'note', 1, '[1] Gibbon’s note, with [a bracket] inside.\nNote: An editor’s note.—M.'],
    ['c01-n04', 'note', 2, '[2] Another.'], ['c01-p05', 'para', 'The text the file ran on.'],
    ['c01-n06', 'note', 3, '[3] A third.'],
    ['c01-p07', 'para', 'More of the chapter, by Tangier[4] and the rest.'], ['c01-n08', 'note', 4, '[4] The fourth.'],
  ], 'a date is no mark, nor an ordinal ("3d"); "2a" is note 2’s when the file labels the note "2"; a mark run on to its word is found, text after a note’s bracket is a paragraph, a stray "?" is not');
  // A note's label is its mark: "2a" is note 2a's, and note 2 is not the ordinal "2d" before it (Gibbon's chapter XV).
  const marks = splitWork(stripBoilerplate(gutenberg('      Chapter I: The Short Title.—Part I.', '', '     A Title.', '',
    '      2d. The Romans, and the senate. 2 And the people, and the plebs. 2a', '',
    '      2 (return) [ Gibbon’s.]', '', '      2a (return) [ An editor’s.—M.]')), { ...layout, start: /^ {6}Chapter I:/, chapter: { ...layout.chapter, count: 1 } });
  assert.equal(marks[0].paragraphs[0].text, '2d. The Romans, and the senate.[2] And the people, and the plebs.[2]');
  assert.deepEqual([stats.notes, stats.unmarked], [5, ['Chapter I: note 101']], 'only the title’s note has no mark in the text');
});

test('splitWork: Clausewitz’s shape: pieces before Book I, titles on the heading line, star notes, verse set flush left', () => {
  const text = stripBoilerplate(gutenberg(
    'Contents', '', 'INTRODUCTION', 'BOOK I. ON THE NATURE OF WAR', 'CHAPTER I.\t  What is War?', '',
    'INTRODUCTION', '', 'An editor writes.', '', 'This Life within', 'all living things.', '',
    'BOOK I. ON THE NATURE OF WAR', '',
    'CHAPTER I. What is War?(*)', '', '(*) A note on the title.', '', 'War is a duel.(*) It is no more.(**)', '', '(*) The first note.', '', '(**) The second.', '',
    'CHAPTER II. Ends and Means in', 'War', '', 'Means.'));
  const layout = {
    start: { line: /^INTRODUCTION$/, nth: 2 }, notes: 'star', keep: [/^This Life within/],
    sections: [{ heading: /^INTRODUCTION$/, n: 0, title: 'Introduction' }],
    part: { heading: /^BOOK ([IVX]+)\.?\s+(.+)$/, label: 'Book', title: 'line', count: 1 },
    chapter: { heading: /^CHAPTER ([IVXL]+)\.\s+(.+)$/, title: 'line', within: true, count: 2 },
  };
  const stats = { notes: 0, unmarked: [] };
  const chapters = splitWork(text, layout, stats);
  const book = { n: 1, heading: 'Book I', title: 'On the nature of war' };
  assert.deepEqual(summary(chapters), [[0, 'Introduction', 'Introduction'], [101, 'Book I, Chapter I', 'What is War?', book], [102, 'Book I, Chapter II', 'Ends and Means in War', book]],
    'the second INTRODUCTION starts the book; a title as printed runs on to its next line');
  assert.deepEqual(paras(chapters[0]), [['c00-p01', 'para', 'An editor writes.'], ['c00-v02', 'verse', 'This Life within\nall living things.']]);
  assert.deepEqual(paras(chapters[1]), [['c101-n01', 'note', 1, '[1] A note on the title.'], ['c101-p02', 'para', 'War is a duel.[2] It is no more.[3]'],
    ['c101-n03', 'note', 2, '[2] The first note.'], ['c101-n04', 'note', 3, '[3] The second.']], 'notes are numbered through the chapter, "(**)" its second in a paragraph');
  assert.deepEqual([stats.notes, stats.unmarked.length], [3, 1]);
});

test('splitWork: Darwin’s shape: an epigraph and two pieces sharing chapter 0, skipped contents, the end of the book', () => {
  const text = stripBoilerplate(gutenberg(
    'A note on the editions of this ebook.', '', 'THE TITLE PAGE', '', '“An epigraph.”', '', 'WHEWELL: Bridgewater.', '',
    'AN HISTORICAL SKETCH OF THE', 'PROGRESS OF OPINION.', '', 'The sketch.[1]', '', ' [1] A footnote', ' running on.', '',
    'Contents', '', 'INTRODUCTION.', 'CHAPTER I. VARIATION', '', 'ORIGIN.', '', 'INTRODUCTION.', '', 'The introduction of geographical distribution.', '',
    'CHAPTER I.', 'VARIATION UNDER DOMESTICATION.', '', 'Causes of variability—Effects of habit.', '', '    An indented aside, prose.', '',
    'CHAPTER II.', 'GEOGRAPHICAL DISTRIBUTION—_continued_.', '', 'Distribution again.', '',
    'GLOSSARY OF TERMS.', '', 'Not the book.'));
  const layout = {
    start: /^“An epigraph/, end: /^GLOSSARY/, notes: 'bracket', verse: false,
    skip: [{ from: /^Contents$/, to: /^ORIGIN\.$/ }, { from: /^ORIGIN\.$/, to: /^INTRODUCTION\.$/ }],
    front: { title: 'Sketch and introduction', pieces: [{ heading: /^AN HISTORICAL SKETCH/, title: 'An historical sketch' }, { heading: /^INTRODUCTION\.$/, title: 'Introduction' }] },
    chapter: { heading: /^CHAPTER ([IVXL]+)\.$/, title: 'block', count: 2 },
  };
  const chapters = splitWork(text, layout);
  assert.deepEqual(summary(chapters), [[0, 'Sketch and introduction', 'Sketch and introduction'], [1, 'Chapter I', 'Variation under domestication'], [2, 'Chapter II', 'Geographical distribution—continued']],
    'a dash in a title set in capitals keeps its italic lower case');
  assert.deepEqual(paras(chapters[0]).map(p => p.slice(1)), [['para', '“An epigraph.”'], ['para', 'WHEWELL: Bridgewater.'], ['para', 'An historical sketch'],
    ['para', 'The sketch.[1]'], ['note', 1, '[1] A footnote running on.'], ['para', 'Introduction'], ['para', 'The introduction of geographical distribution.']]);
  assert.deepEqual(paras(chapters[1]).map(p => p[1]), ['para', 'para'], 'with verse: false an indented block is prose');
  assert.ok(!chapters.flatMap(c => c.paragraphs).some(p => /Not the book|Contents|ORIGIN|editions of this ebook|TITLE PAGE/.test(p.text)));
});

test('titleCase: sentence case by the text’s own usage, regnal numbers, an item’s numeral, a verb by its kin', () => {
  const counts = caseCounts(['the death of Severus was a tyranny of Caracalla, and Richard the First of England, and the reign of Odoacer, the first barbarian king',
    'the empress and the factions of the circus in the reign of Justinian', 'he invaded Italy; the discouragement of agriculture in Europe']);
  assert.equal(titleCase('The Death Of Severus.—Tyranny Of Caracalla.—Richard The First Of England.—Reign Of Odoacer, The First Barbarian King', counts),
    'The death of Severus.—Tyranny of Caracalla.—Richard the First of England.—Reign of Odoacer, the first barbarian king');
  assert.equal(titleCase('Reign Of Justinian.—I. The Empress Theodora.—II. Factions Of The Circus', counts), 'Reign of Justinian.—I. The empress Theodora.—II. Factions of the circus');
  assert.equal(titleCase('He Invades Italy', counts), 'He invades Italy');
  assert.equal(titleCase('OF THE DISCOURAGEMENT OF AGRICULTURE IN EUROPE.', counts), 'Of the discouragement of agriculture in Europe');
  assert.equal(titleCase('The Germans Overrun Gaul', counts, { lower: ['overrun'] }), 'The Germans overrun Gaul');
});

test('shelf: every book is public domain in the US and the UK by its dates, and a wrong finding is refused', () => {
  assert.ok(SHELF.length >= 1);
  for (const e of SHELF) {
    assert.match(e.slug, /^[a-z0-9-]+$/);
    const chapter = e.layout?.chapter instanceof RegExp ? e.layout.chapter : e.layout?.chapter?.heading;
    assert.ok(e.title && e.author?.qid && Number.isInteger(e.gutenberg) && chapter instanceof RegExp && Number.isInteger(e.work?.published) && e.era?.length === 2, `${e.slug} is complete`);
    // A reason for every person whose words the edition carries, and one for the publication; the finding in words
    // names each one's death and the edition's year, and the dates bear it out.
    const people = [e.author, e.translator, ...(e.editors || [])].filter(Boolean);
    assert.equal(checkRights(e).length, people.length + 1, `${e.slug}: a reason per term`);
    for (const who of people) assert.ok(e.rights.basis.includes(who.died < 0 ? `${-who.died} BC` : String(who.died)), `${e.slug}: the basis gives ${who.name}’s death (${who.died})`);
    assert.ok(e.rights.basis.includes(String(e.published)), `${e.slug}: the basis gives the edition’s year (${e.published})`);
    assert.match(e.rights.basis, /every work published before 1931 is in the public domain in the United States/, e.slug);
    assert.match(e.rights.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.ok(checkRights(shelfEntry('peloponnesian-war')).includes('Thucydides died 395 BC: UK term ended 31 December 325 BC'), 'a year BC says so');
  assert.ok(checkRights(shelfEntry('on-war')).includes('F. N. Maude died 1933: UK term ended 31 December 2003'), 'an editor’s term is checked too');
  assert.throws(() => checkRights({ ...shelfEntry('on-war'), editors: [{ name: 'Y', died: 1960 }] }), /Y died in 1960, so the UK term runs to 31 December 2030/);
  const prince = shelfEntry('the-prince');
  assert.throws(() => checkRights({ ...prince, rights: { ...prince.rights, uk: 'unknown' } }), /not pd\/pd; the book is not written/);
  assert.throws(() => checkRights({ ...prince, translator: { name: 'X', died: 1990 } }), /UK term runs to 31 December 2060/);
  // The US test is the safe bound (published before this year − 95), not a term: a 1908 book was clear by 1984.
  assert.throws(() => checkRights({ ...prince, published: 1980 }, 2026), /published 1980 is not before 1931, so the date alone cannot confirm "us: pd"/);
  assert.throws(() => checkRights({ ...prince, published: 1931 }, 2026), /not before 1931/);
  assert.ok(checkRights({ ...prince, published: 1930 }, 2026).includes('published 1930, before 1931: public domain in the US'));
  assert.ok(checkRights(prince, 2026).includes('published 1908, before 1931: public domain in the US'));
  // The finding in words states the US rule as it is: no 95-year term for a 1908 publication.
  assert.match(prince.rights.basis, /every work published before 1931 is in the public domain in the United States/);
  assert.match(prince.rights.basis, /at most 75 years, to 31 December 1983/);
  assert.doesNotMatch(prince.rights.basis, /95 years from publication for works published before 1978|31 December 2003/);
  assert.throws(() => checkRights({ ...prince, rights: { us: 'pd', uk: 'pd' } }), /basis in words/);
  assert.throws(() => shelfEntry('no-such-book'), /not on the shelf/);
  const record = bookRecord(prince, []);
  assert.match(record.edition.licence, /header, footer and licence have been removed/);
  assert.deepEqual(record.rights, prince.rights);
  assert.equal(record.edition.url, 'https://www.gutenberg.org/ebooks/1232');
});

// ---- The built files.
const prince = read(join(BOOKS, 'the-prince.json'));
const shelfIndex = read(INDEX);
const shelfBooks = SHELF.map(e => [e, read(join(BOOKS, `${e.slug}.json`))]);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// What each book on the shelf is stated to be: its chapter numbers (n, as the contract numbers them), how many books
// it is divided into, its footnotes and how many of those have no mark in their chapter's text (a note on a heading),
// its verse and tables kept in lines, and its length in words (a little either side of the build's count, so a fix of a
// word does not fail the test but a lost or doubled chapter does).
const STATED = {
  'the-prince': { n: range(0, 26), notes: 48, unmarked: 1, verse: 2, words: [32000, 33000] },
  'peloponnesian-war': { n: range(1, 26), books: 8, notes: 0, verse: 0, words: [203000, 205000] },
  'origin-of-species': { n: range(0, 15), notes: 3, verse: 0, words: [195000, 197000] },
  'wealth-of-nations-1': { n: [0, ...range(101, 111), ...range(200, 205), ...range(301, 304)], books: 3, notes: 0, verse: 14, words: [161500, 163000] },
  'wealth-of-nations-2': { n: [...range(400, 409), 499, ...range(501, 503)], books: 2, notes: 0, verse: 15, words: [217000, 218500] },
  'decline-and-fall-1': { n: range(0, 15), notes: 1681, unmarked: 2, verse: 0, words: [260500, 262500] },
  'decline-and-fall-2': { n: range(16, 26), notes: 1637, unmarked: 1, verse: 0, words: [287500, 289500] },
  'decline-and-fall-3': { n: range(27, 38), notes: 1361, verse: 0, words: [241500, 243000] },
  'decline-and-fall-4': { n: range(39, 48), notes: 1269, verse: 0, words: [275000, 277000] },
  'decline-and-fall-5': { n: range(49, 58), notes: 1356, unmarked: 1, verse: 0, words: [259500, 261500] },
  'decline-and-fall-6': { n: range(59, 71), notes: 1245, verse: 0, words: [233000, 234500] },
  'on-war': { n: [...range(0, 4), ...range(101, 108), ...range(201, 206), ...range(301, 318), ...range(401, 414), ...range(501, 518), ...range(601, 630), ...range(701, 722), ...range(801, 809)],
    books: 8, notes: 61, unmarked: 2, verse: 3, words: [291000, 293000] },
};

test('built: the-prince.json follows the data contract', () => {
  for (const k of ['slug', 'title', 'author', 'translator', 'work', 'era', 'edition', 'rights', 'generated', 'chapters']) assert.ok(k in prince, `has ${k}`);
  assert.equal(prince.slug, 'the-prince');
  assert.deepEqual(prince.author, { name: 'Niccolò Machiavelli', qid: 'Q1399', born: 1469, died: 1527 });
  assert.deepEqual(prince.translator, { name: 'W. K. Marriott', died: 1927 });
  assert.deepEqual(prince.work, { qid: 'Q131719', written: 1513, published: 1532 });
  assert.deepEqual(prince.era, [1494, 1527]);
  assert.deepEqual([prince.edition.source, prince.edition.id, prince.edition.url, prince.edition.published], ['Project Gutenberg', 'pg1232', 'https://www.gutenberg.org/ebooks/1232', 1908]);
  assert.match(prince.edition.licence, /without the Project Gutenberg trademark/);
  assert.deepEqual([prince.rights.us, prince.rights.uk], ['pd', 'pd']);
  assert.match(prince.rights.basis, /1927/);
  // build-book.mjs copies the shelf's finding into the book, and tag-terms.mjs does not refresh it: a finding put right
  // in the shelf needs the book rebuilt.
  assert.deepEqual(prince.rights, shelfEntry('the-prince').rights, 'the built book carries the shelf’s rights finding');
  assert.match(prince.rights.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(prince.generated, /^\d{4}-\d{2}-\d{2}T/);
  // Chapters: the dedication (0) and the twenty-six chapters, in order, each with a title and paragraphs.
  assert.deepEqual(prince.chapters.map(c => c.n), Array.from({ length: 27 }, (_, i) => i));
  assert.equal(prince.chapters[0].title, 'Dedication');
  assert.equal(prince.chapters[12].title, 'How many kinds of soldiery there are, and concerning mercenaries');
  assert.equal(prince.chapters[26].heading, 'Chapter XXVI');
  const all = texts(prince);
  assert.ok(all.length >= 240 && all.length <= 270, `${all.length} paragraphs`);
  assert.equal(all.filter(p => p.kind === 'note').length, 48, 'Marriott’s 48 footnotes');
  assert.equal(all.filter(p => p.kind === 'verse').length, 2, 'Petrarch’s lines and Dacre’s rendering');
  assert.equal(all[0].text, 'To the Magnificent Lorenzo Di Piero De’ Medici');
  assert.equal(prince.chapters[26].paragraphs.at(-1).text, 'Edward Dacre, 1640.', 'the book ends before the appended works');
  assert.ok(statSync(join(BOOKS, 'the-prince.json')).size < 1024 * 1024, 'under 1 MB');
});

test('built: every book on the shelf follows the data contract, with the chapters, notes and length stated for it', () => {
  assert.deepEqual(Object.keys(STATED), SHELF.map(e => e.slug), 'a statement for every book, in shelf order');
  for (const [e, book] of shelfBooks) {
    const s = STATED[e.slug], at = what => `${e.slug}: ${what}`;
    for (const k of ['slug', 'title', 'author', 'translator', 'work', 'era', 'edition', 'rights', 'generated', 'chapters']) assert.ok(k in book, at(`has ${k}`));
    // The head is the shelf's, copied by build-book.mjs (bookRecord): a finding or a date put right in the shelf needs
    // the book rebuilt.
    const head = bookRecord(e, []);
    for (const k of ['slug', 'title', 'author', 'translator', 'editors', 'set', 'work', 'era', 'rights']) assert.deepEqual(book[k], head[k], at(k));
    assert.deepEqual({ ...book.edition }, head.edition, at('edition'));
    assert.deepEqual([book.rights.us, book.rights.uk], ['pd', 'pd'], at('pd/pd'));
    assert.ok(checkRights(e).length > 1, at('the dates bear the finding out'));
    assert.match(book.edition.licence, /header, footer and licence have been removed/, at('licence'));
    assert.equal(book.edition.url, `https://www.gutenberg.org/ebooks/${e.gutenberg}`, at('edition url'));
    assert.ok(Number.isInteger(book.work.published) && book.era.every(Number.isInteger) && book.era[0] <= book.era[1], at('work and era'));
    assert.match(book.generated, /^\d{4}-\d{2}-\d{2}T/, at('generated'));
    // Chapters: the numbers stated, rising, each with its heading, title, words and paragraphs.
    assert.deepEqual(book.chapters.map(c => c.n), s.n, at('chapter numbers'));
    if (s.books) {
      const parts = new Map();
      for (const c of book.chapters.filter(c => c.n >= 100 || e.slug === 'peloponnesian-war')) {
        assert.ok(c.part && Number.isInteger(c.part.n) && c.heading.startsWith(c.part.heading), at(`${c.heading} names its book`));
        if (c.n >= 100) assert.equal(c.part.n, Math.floor(c.n / 100), at(`${c.heading} is in book ${Math.floor(c.n / 100)}`));
        parts.set(c.part.n, c.part);
      }
      assert.equal(parts.size, s.books, at('books'));
    }
    let notes = 0, unmarked = 0, verse = 0, words = 0;
    for (const c of book.chapters) {
      assert.ok(c.title && c.heading && c.paragraphs.length && c.words > 0, at(`chapter ${c.n}`));
      assert.equal(c.words, c.paragraphs.reduce((n, p) => n + wordCount(p.text), 0), at(`chapter ${c.n} word count`));
      words += c.words;
      const ids = c.paragraphs.map(p => p.id);
      assert.deepEqual(ids, [...new Set(ids)], at(`chapter ${c.n}: paragraph ids unique`));
      // One counter per chapter runs through prose, notes and verse alike (c03-p03, c03-n04, c03-p05; c16-p100 after
      // c16-p99 in a long chapter of Gibbon's).
      assert.deepEqual(ids.map(id => +id.split('-')[1].slice(1)), ids.map((_, i) => i + 1), at(`chapter ${c.n}: paragraph ids in order`));
      const marks = c.paragraphs.filter(p => p.kind !== 'note').map(p => p.text);
      for (const p of c.paragraphs) {
        assert.match(p.id, new RegExp(`^c${String(c.n).padStart(2, '0')}-[pnv]\\d{2,}$`), at(p.id));
        assert.ok(['para', 'note', 'verse'].includes(p.kind), at(p.id));
        // Trimmed, but a table's first line may keep the indent that puts its figures in their columns (normalise).
        const table = p.kind === 'verse' && / {2}/.test(p.text);
        assert.ok(typeof p.text === 'string' && p.text.trimEnd() === p.text && (table || p.text.trimStart() === p.text) && p.text.trim().length > 0, at(p.id));
        assert.ok(Array.isArray(p.terms), at(p.id));
        if (p.kind === 'note') {
          assert.ok(Number.isInteger(p.note) && p.text.startsWith(`[${p.note}] `), at(`${p.id} is note ${p.note}`));
          assert.equal(p.id.split('-')[1][0], 'n', at(p.id));
          notes++;
          if (!marks.some(t => t.includes(`[${p.note}]`))) unmarked++;
        }
        if (p.kind === 'verse') { assert.ok(p.text.includes('\n'), at(`${p.id} keeps its lines`)); verse++; }
        if (p.kind === 'para') assert.ok(!p.text.includes('\n'), at(`${p.id} is one paragraph`));
        // No Gutenberg boilerplate, no note label left in the text, and the typography set.
        assert.doesNotMatch(p.text, /gutenberg|\*\*\* ?(START|END)|™|\(return\)/i, at(`${p.id}: no boilerplate`));
        assert.doesNotMatch(p.text, /_|"|(^|\s)'/, at(`${p.id}: typography set`));
      }
    }
    assert.equal(notes, s.notes, at('notes'));
    assert.equal(unmarked, s.unmarked || 0, at('notes with no mark in their chapter'));
    assert.equal(verse, s.verse, at('verse and tables'));
    assert.ok(words >= s.words[0] && words <= s.words[1], at(`${words} words`));
    // One file, loaded in one go: under the limit, written by bookJson (one paragraph per line).
    assert.ok(statSync(join(BOOKS, `${e.slug}.json`)).size < MAX_BYTES, at('under 2 MB'));
    assert.equal(readFileSync(join(BOOKS, `${e.slug}.json`), 'utf8'), bookJson(book), at('written by bookJson'));
  }
});

test('built: the first and last words of the new books are where their layouts put them', () => {
  const book = slug => shelfBooks.find(([e]) => e.slug === slug)[1];
  const first = (slug, n) => book(slug).chapters.find(c => c.n === n).paragraphs[0].text;
  const last = (slug, n) => book(slug).chapters.find(c => c.n === n).paragraphs.at(-1).text;
  const title = (slug, n) => book(slug).chapters.find(c => c.n === n).title;
  assert.match(first('peloponnesian-war', 1), /^Thucydides, an Athenian, wrote the history of the war/);
  assert.equal(last('peloponnesian-war', 26), '[When the winter after this summer is over the twenty-first year of this war will be completed.]');
  assert.equal(title('peloponnesian-war', 11), 'Sixth Year of the War—Campaigns of Demosthenes in Western Greece—Ruin of Ambracia');
  assert.equal(book('peloponnesian-war').chapters.find(c => c.n === 6).heading, 'Book II, Chapter VI');
  assert.equal(first('origin-of-species', 0), '“But with regard to the material world, we can at least go so far as this—we can perceive that events are brought about not by insulated interpositions of Divine power, exerted in each particular case, but by the establishment of general laws.”');
  assert.match(first('origin-of-species', 1), /^Causes of Variability—Effects of Habit/);
  assert.match(last('origin-of-species', 15), /^It is interesting to contemplate a tangled bank.*endless forms most beautiful and most wonderful have been, and are being evolved\.$/);
  assert.equal(title('origin-of-species', 13), 'Geographical distribution—continued');
  assert.match(first('wealth-of-nations-1', 0), /^The annual labour of every nation is the fund/);
  assert.equal(title('wealth-of-nations-1', 302), 'Of the discouragement of agriculture in the ancient state of Europe, after the fall of the Roman empire');
  assert.match(last('wealth-of-nations-2', 503), /accommodate her future views and designs to the real mediocrity of her circumstances\.$/);
  assert.match(first('decline-and-fall-1', 1), /^In the second century of the Christian Æra, the empire of Rome comprehended/);
  assert.equal(title('decline-and-fall-1', 5), 'Public sale of the empire to Didius Julianus by the Prætorian guards—Clodius Albinus in Britain, Pescennius Niger in Syria, and Septimius Severus in Pannonia, declare against the murderers of Pertinax—Civil wars and victory of Severus over his three rivals—Relaxation of discipline—New maxims of government');
  assert.match(last('decline-and-fall-6', 71), /^Lausanne, June 27 1787$/);
  assert.match(first('on-war', 101), /^1\. INTRODUCTION\.$/);
  assert.equal(title('on-war', 806), 'A. Influence of the Political Object on the Military Object.—B. War as an Instrument of Policy');
  assert.equal(book('on-war').chapters.find(c => c.n === 622).title, 'The Cordon', 'Book VI’s Chapter XXII, numbered XX in the file');
  // Gibbon's notes stand under the paragraph that cites them, the mark set close to its word.
  const c1 = book('decline-and-fall-1').chapters.find(c => c.n === 1).paragraphs;
  assert.match(c1[1].text, /^The principal conquests of the Romans.*the defeat of Crassus\.\[1\]$/);
  assert.match(c1[2].text, /^\[1\] Dion Cassius, \(l\. liv\. p\. 736,\) with the annotations of Reimar/);
  // An ordinal is no mark: Guizot's note in the body of chapter XV keeps its "3d." and "2d.", and Gibbon's own marks
  // 2 and 3 are found where he set them.
  const c15 = book('decline-and-fall-1').chapters.find(c => c.n === 15).paragraphs;
  assert.ok(c15.some(p => p.text.startsWith('3d. The Greeks.—')) && c15.some(p => p.text.startsWith('2d. The Roman character')));
  assert.ok(c15.some(p => /other nations\.\[2\] The sullen obstinacy/.test(p.text) && /human kind\.\[3\] Neither/.test(p.text)));
  // Milman's note opens chapter XLIV on its own, before Gibbon's first paragraph.
  const c44 = book('decline-and-fall-4').chapters.find(c => c.n === 44).paragraphs;
  assert.match(c44[0].text, /^Note: In the notes to this important chapter/);
  assert.match(c44[4].text, /distinguished by the letter W\.—M\.$/);
  assert.match(c44[5].text, /^The vain titles of the victories of Justinian are crumbled into dust/);
  // Titles as the current build sets them: regnal numbers capitalised, the words the file dropped put back.
  const titleOf = (slug, n) => book(slug).chapters.find(c => c.n === n).title;
  assert.match(titleOf('decline-and-fall-2', 17), /^Foundation of Constantinople\.—Political system of Constantine, and his successors/);
  assert.match(titleOf('decline-and-fall-3', 35), /Valentinian the Third$/);
  assert.match(titleOf('decline-and-fall-3', 37), /^Origin, progress, and effects of the monastic life/);
  assert.match(titleOf('decline-and-fall-4', 46), /^Revolutions of Persia after the death of Chosroes or Nushirvan/);
  assert.match(titleOf('decline-and-fall-6', 65), /Georgia, Tartary, Russia, India/);
  assert.match(titleOf('decline-and-fall-6', 68), /^Reign and character of Mahomet the Second/);
  // Smith's tables keep their columns: a year, then its pounds, shillings and pence, each under its own heading.
  const wheat = texts(book('wealth-of-nations-1')).find(p => p.kind === 'verse' && p.text.includes('\n1202 '));
  assert.match(wheat.text, /^ +£ {3}s {3}d +£ {3}s {3}d +£ {3}s {3}d\n1202 {6}0 {2}12 {3}0 {31}1 {2}16 {3}0\n/);
});

test('built: every term has valid offsets, a whole word, a known string of its entity, and an entity the lake has', () => {
  const lake = loadLake();
  for (const [e, book] of shelfBooks) {
    const decided = new Map(Object.entries(e.decisions || {}).filter(([k]) => !/^Q\d+$/.test(k)).map(([k, v]) => [fold(k.replace(/^the\s+/i, '')), v]));
    const excluded = new Set(Object.entries(e.decisions || {}).filter(([k, v]) => /^Q\d+$/.test(k) && v === null).map(([k]) => k));
    for (const c of book.chapters) for (const p of c.paragraphs) {
      let last = 0;
      const at = `${e.slug} ${p.id}`;
      for (const t of p.terms) {
        assert.ok(Number.isInteger(t.s) && Number.isInteger(t.e) && t.s >= last && t.s < t.e && t.e <= p.text.length, `${at}: offsets ${t.s}–${t.e}`);
        last = t.e;
        const matched = p.text.slice(t.s, t.e);
        assert.match(matched, /^[\p{L}\p{N}]/u, `${at}: "${matched}" starts on a word`);
        assert.match(matched, /[\p{L}\p{N}]$/u, `${at}: "${matched}" ends on a word`);
        assert.ok(t.s === 0 || !/[\p{L}\p{N}]/u.test(p.text[t.s - 1]), `${at}: "${matched}" starts at a word boundary`);
        assert.ok(t.e === p.text.length || !/[\p{L}\p{N}]/u.test(p.text[t.e]), `${at}: "${matched}" ends at a word boundary`);
        const ent = lake.get(t.qid);
        assert.ok(ent, `${at}: ${t.qid} is in the lake`);
        assert.equal(t.label, ent.label, `${at}: label is the lake's`);
        assert.ok(!excluded.has(t.qid), `${at}: ${t.qid} is left out of this book`);
        const key = fold(matched);
        // A string the shelf decides goes where it says, and one it leaves untagged is never a term.
        if (decided.has(key)) assert.equal(decided.get(key), t.qid, `${at}: "${matched}" follows the shelf's decision`);
        else {
          const known = [ent.label, ...ent.aliases].map(s => fold(s.replace(/^the\s+/i, '')));
          assert.ok(known.some(k => k === key || (k === k.toLowerCase() && k === key.toLowerCase())), `${at}: "${matched}" is a name of ${t.qid} ${ent.label}`);
        }
      }
    }
  }
  // The Prince's own decisions at work.
  const byQid = new Map();
  for (const p of texts(prince)) for (const t of p.terms) byQid.set(t.qid, (byQid.get(t.qid) || 0) + 1);
  assert.ok([...byQid.values()].reduce((a, b) => a + b, 0) >= 240, 'the Prince’s terms');
  assert.ok(!byQid.has('Q142') && !byQid.has('Q29') && !byQid.has('Q1032') && !byQid.has('Q801'), 'no present-day France, Spain, Niger or Israel in a text of 1513');
  for (const [q, what] of [['Q38', 'Italy'], ['Q41', 'Greece'], ['Q79', 'Egypt'], ['Q159', 'Russia'], ['Q40', 'Austria']]) assert.ok(!byQid.has(q), `no present-day ${what} (${q})`);
  // Chapter XII: "Rome and Sparta stood for many ages armed and free. The Switzers are completely armed and quite free."
  const c12 = prince.chapters[12], armed = c12.paragraphs.find(p => p.text.includes('Rome and Sparta stood'));
  const armedTerms = armed.terms.map(t => `${armed.text.slice(t.s, t.e)} ${t.qid}`);
  for (const t of ['Rome Q1747689', 'Switzers Q435583']) assert.ok(armedTerms.includes(t), `chapter XII: ${t}`);
  assert.ok(c12.paragraphs.some(p => p.terms.some(t => t.qid === 'Q4948')), 'the Venetians of chapter XII are the Republic of Venice');
  assert.ok(c12.paragraphs.some(p => p.terms.some(t => t.qid === 'Q170174')), 'the Church of chapter XII is the Papal States');
  const top = [...byQid].sort((a, b) => b[1] - a[1])[0];
  assert.equal(top[0], 'Q70972', 'France, the book’s most frequent term');
  assert.ok(top[1] >= 30, `${top[1]} France`);
  // Ancient Egypt for Moses' Egypt (chapter VI), the Russian Empire for Marriott's Russia of 1908 (a note).
  const termAt = (book, id, word) => { const p = texts(book).find(x => x.id === id); return p.terms.find(t => p.text.slice(t.s, t.e) === word); };
  assert.equal(termAt(prince, 'c06-p04', 'Egypt')?.qid, 'Q11768');
  assert.equal(termAt(prince, 'c21-n09', 'Russia')?.qid, 'Q34266');
  // And the new books': Gibbon's Rome to 476 is Ancient Rome and his France the kingdom of his day; Smith's Germany
  // the Empire; Thucydides' Lacedaemon is Sparta; nobody's Italy, Greece or Egypt is a present-day state.
  const book = slug => shelfBooks.find(([e]) => e.slug === slug)[1];
  const qids = slug => new Set(texts(book(slug)).flatMap(p => p.terms.map(t => t.qid)));
  assert.equal(termAt(book('decline-and-fall-1'), 'c01-p01', 'Rome')?.qid, 'Q1747689');
  assert.ok(qids('decline-and-fall-1').has('Q70972') && !qids('decline-and-fall-1').has('Q142'));
  assert.ok(qids('wealth-of-nations-1').has('Q12548'), 'Smith’s Germany');
  assert.ok(qids('peloponnesian-war').has('Q5690'), 'Lacedaemon');
  for (const [e] of shelfBooks) for (const q of ['Q38', 'Q41', 'Q79', 'Q142', 'Q183', 'Q668']) assert.ok(!qids(e.slug).has(q), `${e.slug}: no present-day state ${q}`);
});

test('built: every term is of its text’s time: first dated by the time the text was written, or by the edition in a note', () => {
  // A string the era rule lets through by its exact name (a present-day state's: Italy 1946, Greece 1821) is caught
  // here, so a book never offers a reader of 1513 the entry of a later state. The bound for the text itself is the
  // later of the end of the book's period and the year the work was published (a text may speak of its own day:
  // Gibbon's of the Europe of 1788, Smith's of 1776), and the edition's year for a note (Marriott, 1908, may name the
  // British Empire; Milman, 1845, the Austrian). An entity a book keeps although it is dated later goes in ALLOWED,
  // with the shelf decision that explains it; none does yet.
  const ALLOWED = new Set();
  const lake = loadLake(), late = [];
  for (const row of shelfIndex.books) {
    const book = read(join(BOOKS, `${row.slug}.json`));
    for (const c of book.chapters) for (const p of c.paragraphs) {
      const bound = p.kind === 'note' ? book.edition.published : Math.max(book.era[1], book.work.published);
      for (const t of p.terms) {
        const first = firstYear(lake.get(t.qid)?.facts);
        if (first !== null && first > bound && !ALLOWED.has(t.qid)) late.push(`${row.slug} ${p.id} "${p.text.slice(t.s, t.e)}" → ${t.qid} ${t.label}, first dated ${first}, after ${bound}`);
      }
    }
  }
  assert.deepEqual(late, []);
  // The rule bites: the Encyclopaedia's Italy is first dated 1946, after the Prince's 1532.
  assert.ok(firstYear(lake.get('Q38').facts) > Math.max(prince.era[1], prince.work.published));
});

// The word as the lake files a string (tag-terms.mjs: a leading "the" dropped, spaces collapsed, accents folded).
const filed = s => fold(String(s).replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim());
let lakeOnce = null;
const lakeNow = () => (lakeOnce ||= loadLake());

test('built: no term is a common word of its book, a name only where it opens a sentence', () => {
  // A one-word name the book writes in lower case more often than with a capital in mid-sentence (build-book.mjs,
  // caseCounts) is a common word, and as a term it is that word wherever a sentence opens with it: the botanical "With."
  // of William Withering trimmed to "With" was 342 sentence-opening Withs across ten books. A shelf decision that names
  // the string is a human's word that the book means the entity there (Gibbon's "the dynasty of the Song").
  const lake = lakeNow(), common = [];
  for (const [e, book] of shelfBooks) {
    const all = texts(book), counts = caseCounts(all.map(p => p.text));
    const decided = new Set(Object.keys(e.decisions || {}).filter(k => !/^Q\d+$/.test(k)).map(filed));
    for (const p of all) for (const t of p.terms) {
      const s = p.text.slice(t.s, t.e), c = counts.get(s.toLowerCase());
      if (!c || c.lower <= c.upper || !/^\p{Lu}\p{Ll}+$/u.test(s) || decided.has(fold(s))) continue;
      // A common noun matched by its own name in any case ("Paper" for paper) is the tagger's rule, not a name's.
      const ent = lake.get(t.qid);
      if (![ent.label, ...ent.aliases].some(a => filed(a) === fold(s))) continue;
      common.push(`${e.slug} ${p.id} "${s}" → ${t.qid} ${t.label} (${c.lower} in lower case, ${c.upper} capitalised mid-sentence)`);
    }
  }
  assert.deepEqual(common, []);
});

test('built: the next full lake build keeps every alias as the books were tagged with it (lake/scripts/aliases.mjs)', () => {
  // The monthly refresh builds the lake from scratch, re-tags every book against it and commits what comes out. Between
  // full builds the lake holds Wikidata's aliases as the last one kept them, and --only remakes a module's own entities
  // by the rule in force: so here every alias is kept as the next build will keep it (tidyAlias), and every paragraph
  // that has a string the rule adds to the dictionary or takes from it is tagged against both lakes. The rule as it once
  // was, every trailing full stop gone, turned William Withering's "With." into "With" and the University of Oxford's
  // "Oxon." into "Oxon": 351 new terms, every one wrong, on 3 November.
  assert.deepEqual(['With.', 'Oxon.', 'Lond.', 'J. R. M.', 'Alexander VI.', 'Leo X.', 'Venice, '].map(tidyAlias), ['With.', 'Oxon.', 'Lond.', 'J. R. M.', 'Alexander VI', 'Leo X', 'Venice']);
  const lake = lakeNow(), next = new Map(), strings = new Set();
  const names = e => new Set([e.label, ...e.aliases].map(filed));
  for (const [q, e] of lake) {
    const n = { ...e, aliases: [...new Set(e.aliases.map(tidyAlias).filter(a => a && a !== e.label))] }, was = names(e), is = names(n);
    for (const s of was) if (!is.has(s)) strings.add(s);
    for (const s of is) if (!was.has(s)) strings.add(s);
    next.set(q, n);
  }
  strings.delete('');
  const loose = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
  const wanted = [...strings].map(loose);
  const changed = [];
  for (const [e, book] of shelfBooks) {
    // A first sieve in one pass per paragraph (accents stripped, case folded); the tagger itself decides.
    const hits = texts(book).filter(p => { const t = loose(p.text); return wanted.some(s => t.includes(s)); });
    if (!hits.length) continue;
    const now = buildAliasIndex(lake, { decisions: e.decisions }), then = buildAliasIndex(next, { decisions: e.decisions });
    const key = ts => ts.map(t => `${t.s}-${t.e}-${t.qid}`).join(',');
    for (const p of hits) {
      const a = tagText(p.text, now, { year: e.work.published }), b = tagText(p.text, then, { year: e.work.published });
      if (key(a) !== key(b)) changed.push(`${e.slug} ${p.id}: ${key(a)} → ${b.map(t => `"${p.text.slice(t.s, t.e)}" ${t.qid}`).join(', ')}`);
    }
  }
  assert.deepEqual(changed, []);
});

// A book file is what the scripts make of its source: a fix to the layout or the splitter (a title's typo, a note's mark)
// with no rebuild leaves the file stale (eight of Gibbon's titles were). The Gutenberg files stay out of the repository
// (bibliotheca/scripts/cache/.gitignore), so this runs where they are, on the machine that builds the books.
const cached = SHELF.filter(e => existsSync(join(CACHE, `pg${e.gutenberg}.txt`)));
test('built: every book whose source is cached is what the current scripts make of it (terms aside)', cached.length ? {} : { skip: 'no Gutenberg file in bibliotheca/scripts/cache' }, () => {
  for (const e of cached) {
    const fresh = splitBook(stripBoilerplate(readFileSync(join(CACHE, `pg${e.gutenberg}.txt`), 'utf8')), e.layout, { notes: 0, unmarked: [] });
    const built = shelfBooks.find(([x]) => x.slug === e.slug)[1].chapters;
    const shape = cs => cs.map(c => ({ ...c, paragraphs: c.paragraphs.map(({ terms, ...p }) => p) }));
    // Compared as text first (fast); the structures only when they differ, for the message.
    if (JSON.stringify(shape(built)) !== JSON.stringify(shape(fresh))) assert.deepEqual(shape(built), shape(fresh), `${e.slug}: rebuild it (build-book.mjs ${e.slug})`);
  }
});

test('built: index.json lists the shelf with the counts of the book files, a work in volumes as one set', () => {
  assert.match(shelfIndex.generated, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(shelfIndex.books.length, SHELF.length);
  assert.deepEqual(shelfIndex.books.map(b => b.slug), SHELF.map(b => b.slug), 'shelf order');
  assert.equal(shelfIndex.books[0].slug, 'the-prince', 'the page opens on the Prince when its address names no book');
  for (const [e, book] of shelfBooks) {
    const row = shelfIndex.books.find(b => b.slug === e.slug);
    assert.deepEqual(row, indexEntry(book), `${e.slug}: the row is the book's`);
    assert.equal(row.terms, texts(book).reduce((n, p) => n + p.terms.length, 0));
    assert.equal(row.words, book.chapters.reduce((n, c) => n + c.words, 0));
    assert.equal(row.paragraphs, texts(book).length);
    for (const k of ['slug', 'title', 'author', 'year', 'words', 'chapters', 'terms']) assert.ok(k in row, `${row.slug} has ${k}`);
  }
  const entry = shelfIndex.books.find(b => b.slug === 'the-prince');
  assert.deepEqual([entry.title, entry.author, entry.translator, entry.year, entry.era, entry.chapters], ['The Prince', 'Niccolò Machiavelli', 'W. K. Marriott', 1532, [1494, 1527], 27]);
  assert.ok(!('set' in entry), 'a book in one volume has no set');
  // The Decline and Fall is one work in six volumes, the Wealth of Nations one in two: each row says which.
  for (const [slug, volumes] of [['decline-and-fall', 6], ['wealth-of-nations', 2]]) {
    const rows = shelfIndex.books.filter(b => b.set?.slug === slug);
    assert.deepEqual(rows.map(b => b.slug), range(1, volumes).map(v => `${slug}-${v}`), `${slug}: the volumes in order`);
    assert.deepEqual(rows.map(b => b.set.volume), range(1, volumes));
    assert.ok(rows.every(b => b.set.volumes === volumes && b.set.title === rows[0].set.title && b.author === rows[0].author), `${slug}: one work`);
  }
  assert.equal(shelfIndex.books.find(b => b.slug === 'decline-and-fall-1').set.title, 'The History of the Decline and Fall of the Roman Empire');
  // Gibbon's chapters run on through the volumes (I–XV, XVI–XXVI …) and Smith's books (I–III, IV–V): no number twice.
  for (const slug of ['decline-and-fall', 'wealth-of-nations']) {
    const ns = shelfBooks.filter(([e]) => e.set?.slug === slug).flatMap(([, b]) => b.chapters.map(c => c.n));
    assert.deepEqual(ns, [...new Set(ns)].sort((a, b) => a - b), `${slug}: chapter numbers unique and rising through the volumes`);
  }
});
