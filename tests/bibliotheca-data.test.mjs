// Bibliotheca data: the corpus importer (Gutenberg boilerplate cut, chapters and paragraphs split by a book's layout,
// typography set), the Encyclopaedia tagger (whole words, longest match first, names exact, common nouns by their own
// name, the era rule, the shelf's decisions) on fixtures, the rights rule, and the built files
// (bibliotheca/data/books/*.json, bibliotheca/data/index.json) against the data contract in
// bibliotheca/scripts/build-book.mjs, the lake, and the book's own era (no term dated after its text). Pure: no
// server, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripBoilerplate, normalise, roman, sentenceCase, splitChapters } from '../bibliotheca/scripts/text.mjs';
import { buildAliasIndex, tagText, tagBook, newStats, report, firstYear, fold, loadLake } from '../bibliotheca/scripts/tag-terms.mjs';
import { SHELF, shelfEntry, checkRights, indexEntry, bookJson, BOOKS, INDEX, ROOT } from '../bibliotheca/scripts/shelf.mjs';
import { bookRecord } from '../bibliotheca/scripts/build-book.mjs';

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

test('shelf: every book is public domain in the US and the UK by its dates, and a wrong finding is refused', () => {
  assert.ok(SHELF.length >= 1);
  for (const e of SHELF) {
    assert.match(e.slug, /^[a-z0-9-]+$/);
    assert.ok(e.title && e.author?.qid && Number.isInteger(e.gutenberg) && e.layout?.chapter instanceof RegExp && e.work?.published && e.era?.length === 2, `${e.slug} is complete`);
    assert.equal(checkRights(e).length, e.translator ? 3 : 2, `${e.slug}: a reason per term`);
  }
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
  for (const c of prince.chapters) {
    assert.ok(c.title && c.heading && c.paragraphs.length && c.words > 0, `chapter ${c.n}`);
    assert.equal(c.words, c.paragraphs.reduce((n, p) => n + p.text.trim().split(/\s+/).length, 0), `chapter ${c.n} word count`);
    const ids = c.paragraphs.map(p => p.id);
    assert.deepEqual(ids, [...new Set(ids)], `chapter ${c.n}: paragraph ids unique`);
    // One counter per chapter runs through prose, notes and verse alike (c03-p03, c03-n04, c03-p05), so an id says
    // where a block stands in the chapter as well as what it is.
    assert.deepEqual(ids.map(id => +id.slice(-2)), ids.map((_, i) => i + 1), `chapter ${c.n}: paragraph ids in order`);
    for (const p of c.paragraphs) {
      assert.match(p.id, new RegExp(`^c${String(c.n).padStart(2, '0')}-[pnv]\\d{2}$`));
      assert.ok(['para', 'note', 'verse'].includes(p.kind), p.id);
      assert.ok(typeof p.text === 'string' && p.text.trim() === p.text && p.text.length > 0, p.id);
      assert.ok(Array.isArray(p.terms), p.id);
      if (p.kind === 'note') { assert.ok(Number.isInteger(p.note) && p.text.startsWith(`[${p.note}] `), `${p.id} is note ${p.note}`); assert.equal(p.id[4], 'n'); }
      if (p.kind === 'verse') assert.ok(p.text.includes('\n'), `${p.id} keeps its lines`);
      if (p.kind === 'para') assert.ok(!p.text.includes('\n'), `${p.id} is one paragraph`);
    }
  }
  const all = texts(prince);
  assert.ok(all.length >= 240 && all.length <= 270, `${all.length} paragraphs`);
  assert.equal(all.filter(p => p.kind === 'note').length, 48, 'Marriott’s 48 footnotes');
  assert.equal(all.filter(p => p.kind === 'verse').length, 2, 'Petrarch’s lines and Dacre’s rendering');
  const words = prince.chapters.reduce((n, c) => n + c.words, 0);
  assert.ok(words > 32000 && words < 33000, `${words} words`);
  for (const p of all) {
    assert.doesNotMatch(p.text, /gutenberg|\*\*\* (START|END)|™/i, `${p.id}: no Gutenberg boilerplate`);
    assert.doesNotMatch(p.text, /_|"|(^|\s)'/, `${p.id}: typography set`);
  }
  assert.equal(all[0].text, 'To the Magnificent Lorenzo Di Piero De’ Medici');
  assert.equal(prince.chapters[26].paragraphs.at(-1).text, 'Edward Dacre, 1640.', 'the book ends before the appended works');
  assert.ok(statSync(join(BOOKS, 'the-prince.json')).size < 1024 * 1024, 'under 1 MB');
  assert.equal(readFileSync(join(BOOKS, 'the-prince.json'), 'utf8'), bookJson(prince), 'written by bookJson, one paragraph per line');
});

test('built: every term has valid offsets, a whole word, a known string of its entity, and an entity the lake has', () => {
  const lake = loadLake();
  const decisions = shelfEntry('the-prince').decisions;
  const decided = new Map(Object.entries(decisions).filter(([k]) => !/^Q\d+$/.test(k)).map(([k, v]) => [fold(k.replace(/^the\s+/i, '')), v]));
  let n = 0;
  const byQid = new Map();
  for (const c of prince.chapters) for (const p of c.paragraphs) {
    let last = 0;
    for (const t of p.terms) {
      assert.ok(Number.isInteger(t.s) && Number.isInteger(t.e) && t.s >= last && t.s < t.e && t.e <= p.text.length, `${p.id}: offsets ${t.s}–${t.e}`);
      last = t.e;
      const matched = p.text.slice(t.s, t.e);
      assert.match(matched, /^[\p{L}\p{N}]/u, `${p.id}: "${matched}" starts on a word`);
      assert.match(matched, /[\p{L}\p{N}]$/u, `${p.id}: "${matched}" ends on a word`);
      assert.ok(t.s === 0 || !/[\p{L}\p{N}]/u.test(p.text[t.s - 1]), `${p.id}: "${matched}" starts at a word boundary`);
      assert.ok(t.e === p.text.length || !/[\p{L}\p{N}]/u.test(p.text[t.e]), `${p.id}: "${matched}" ends at a word boundary`);
      const e = lake.get(t.qid);
      assert.ok(e, `${p.id}: ${t.qid} is in the lake`);
      assert.equal(t.label, e.label, `${p.id}: label is the lake's`);
      const key = fold(matched);
      if (decided.has(key)) assert.equal(decided.get(key), t.qid, `${p.id}: "${matched}" follows the shelf's decision`);
      else {
        const known = [e.label, ...e.aliases].map(s => fold(s.replace(/^the\s+/i, '')));
        assert.ok(known.some(k => k === key || (k === k.toLowerCase() && k === key.toLowerCase())), `${p.id}: "${matched}" is a name of ${t.qid} ${e.label}`);
      }
      n++;
      byQid.set(t.qid, (byQid.get(t.qid) || 0) + 1);
    }
  }
  assert.ok(n >= 240, `${n} terms`); // 245 since Italy and Greece are left untagged and the Church is tagged
  // Strings the shelf leaves untagged never appear as terms; retargeted ones never go to the lake's own match.
  for (const c of prince.chapters) for (const p of c.paragraphs) for (const t of p.terms) {
    const key = fold(p.text.slice(t.s, t.e));
    assert.ok(!(decided.has(key) && decided.get(key) === null), `${p.id}: "${p.text.slice(t.s, t.e)}" is left untagged by the shelf`);
  }
  assert.ok(!byQid.has('Q142') && !byQid.has('Q29') && !byQid.has('Q1032') && !byQid.has('Q801'), 'no present-day France, Spain, Niger or Israel in a text of 1513');
  for (const [q, what] of [['Q38', 'Italy'], ['Q41', 'Greece'], ['Q79', 'Egypt'], ['Q159', 'Russia'], ['Q40', 'Austria']]) assert.ok(!byQid.has(q), `no present-day ${what} (${q})`);
  // Chapter XII: "Rome and Sparta stood for many ages armed and free. The Switzers are completely armed and quite free."
  const c12 = prince.chapters[12], armed = c12.paragraphs.find(p => p.text.includes('Rome and Sparta stood'));
  assert.deepEqual(armed.terms.map(t => [armed.text.slice(t.s, t.e), t.qid]), [['Rome', 'Q1747689'], ['Switzers', 'Q435583']]);
  assert.ok(c12.paragraphs.some(p => p.terms.some(t => t.qid === 'Q4948')), 'the Venetians of chapter XII are the Republic of Venice');
  assert.ok(c12.paragraphs.some(p => p.terms.some(t => t.qid === 'Q170174')), 'the Church of chapter XII is the Papal States');
  const top = [...byQid].sort((a, b) => b[1] - a[1])[0];
  assert.equal(top[0], 'Q70972', 'France, the book’s most frequent term');
  assert.ok(top[1] >= 30, `${top[1]} France`);
  // Ancient Egypt for Moses' Egypt (chapter VI), the Russian Empire for Marriott's Russia of 1908 (a note).
  const termAt = (id, word) => { const p = texts(prince).find(x => x.id === id); return p.terms.find(t => p.text.slice(t.s, t.e) === word); };
  assert.equal(termAt('c06-p04', 'Egypt')?.qid, 'Q11768');
  assert.equal(termAt('c21-n09', 'Russia')?.qid, 'Q34266');
});

test('built: every term is of its text’s time: first dated by the end of the book’s period, or by the edition in a note', () => {
  // A string the era rule lets through by its exact name (a present-day state's: Italy 1946, Greece 1821) is caught
  // here, so a book never offers a reader of 1513 the entry of a later state. The bound is the book's era for the text
  // itself and the edition's year for a translator's note (Marriott, 1908, may name the British Empire). An entity a
  // book keeps although it is dated later goes in ALLOWED, with the shelf decision that explains it; none does yet.
  const ALLOWED = new Set();
  const lake = loadLake(), late = [];
  for (const row of shelfIndex.books) {
    const book = read(join(BOOKS, `${row.slug}.json`));
    for (const c of book.chapters) for (const p of c.paragraphs) {
      const bound = p.kind === 'note' ? book.edition.published : book.era[1];
      for (const t of p.terms) {
        const first = firstYear(lake.get(t.qid)?.facts);
        if (first !== null && first > bound && !ALLOWED.has(t.qid)) late.push(`${row.slug} ${p.id} "${p.text.slice(t.s, t.e)}" → ${t.qid} ${t.label}, first dated ${first}, after ${bound}`);
      }
    }
  }
  assert.deepEqual(late, []);
  // The rule bites: the Encyclopaedia's Italy is first dated 1946, after the book's 1527.
  assert.ok(firstYear(lake.get('Q38').facts) > prince.era[1]);
});

test('built: index.json lists the shelf with the counts of the book files', () => {
  assert.match(shelfIndex.generated, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(shelfIndex.books.length, SHELF.length);
  assert.deepEqual(shelfIndex.books.map(b => b.slug), SHELF.map(b => b.slug), 'shelf order');
  const entry = shelfIndex.books.find(b => b.slug === 'the-prince');
  assert.deepEqual(entry, indexEntry(prince));
  assert.deepEqual([entry.title, entry.author, entry.translator, entry.year, entry.era, entry.chapters], ['The Prince', 'Niccolò Machiavelli', 'W. K. Marriott', 1532, [1494, 1527], 27]);
  assert.equal(entry.terms, texts(prince).reduce((n, p) => n + p.terms.length, 0));
  assert.equal(entry.words, prince.chapters.reduce((n, c) => n + c.words, 0));
  assert.equal(entry.paragraphs, texts(prince).length);
  for (const b of shelfIndex.books) for (const k of ['slug', 'title', 'author', 'year', 'words', 'chapters', 'terms']) assert.ok(k in b, `${b.slug} has ${k}`);
});
