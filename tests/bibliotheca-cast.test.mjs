// Bibliotheca cast (bibliotheca/scripts/cast.mjs) and the lake's Bibliotheca adapter (lake/scripts/adapters.mjs): the
// name finder, the era fit, the match, the pick and its confidence, the holds, the book-only names and the overrides
// on fixtures (no network: the Wikidata items are made up here in the shape the client keeps, trimEntity's), the
// adapter on a cast written to a temporary folder; then the cast files (bibliotheca/data/cast/*.json) against their
// contract, the lake (every 'auto' record's entity is in it, with the book's names) and the books (re-tagged with them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  extractNames, sentenceInitial, commonWords, queries, romanOrdinals, untitled, kindOf, eraFit, lakeFirst, within, matchOf,
  candidates, confidence, hazards, holds, isLocal, overrideFor, decide, castJson, wdTime, trimEntity, nameKey, order, CAST,
  castPath, reportPath, DEFAULT_THRESHOLD, MIN_MENTIONS, KINDS, lakeAliases, report, castDecisions,
} from '../bibliotheca/scripts/cast.mjs';
import { buildAliasIndex, loadLake, firstYear, fold } from '../bibliotheca/scripts/tag-terms.mjs';
import { bookPath, readBook, shelfEntry } from '../bibliotheca/scripts/shelf.mjs';
import { bibliotheca } from '../lake/scripts/adapters.mjs';
import { tidyAlias, recordAliases } from '../lake/scripts/aliases.mjs';

const read = p => JSON.parse(readFileSync(p, 'utf8'));
const ROOT = new URL('../', import.meta.url);

// ---- Fixtures: a book in little (three chapters, a note) and a lake that knows France and leaves Italy to the shelf.
const para = (id, text, kind = 'para') => ({ id, kind, text, terms: [] });
const BOOK = {
  title: 'A Test Prince', chapters: [
    { n: 1, paragraphs: [
      para('c01-p01', 'Thus Louis the Twelfth, King of France, lost Lombardy. Ferdinand of Aragon took Naples; Ferdinand of Aragon kept it.'),
      para('c01-p02', 'Therefore Pope Alexander sent Cesare Borgia into the Romagna, and Cesare Borgia took it. Fortune favours the bold, and fortune is a woman.'),
      para('c01-p03', 'Pope Alexander died, and thus Louis the Twelfth lost Italy and Lombardy. Machiavelli’s friend Messer Giorgio Scali was killed, as Messer Giorgio Scali had feared.'),
    ] },
    { n: 2, paragraphs: [
      para('c02-p01', 'The Duke of Urbino fled from Urbino. Alexander the Great and Alexander the Great’s Asia; the days of Lorenzo di Piero de’ Medici and of Lorenzo di Piero de’ Medici again.'),
      para('c02-n02', '[1] Machiavelli wrote this in exile from Italy, as Mr Burd says. Machiavelli says so again, and therefore so do we.', 'note'),
      para('c02-p03', 'Therefore the prince must act. Therefore he must not wait. Oliverotto da Fermo met Oliverotto da Fermo’s end at Sinigalia; Sinigalia saw it.'),
    ] },
  ],
};
const entity = (q, label, type, aliases = [], facts = {}) => [q, { q, label, type, aliases, facts, total: 1 }];
const LAKE = new Map([entity('Q70972', 'Kingdom of France', 'place', ['French kingdom'], { founded: '0987' }), entity('Q142', 'France', 'place', [], { founded: '1958' })]);
const INDEX = buildAliasIndex(LAKE, { decisions: { France: 'Q70972', Italy: null } });

test('names: capitalised runs with their joins, seen twice, less the lake’s terms, the shelf’s strings and common words', () => {
  const names = extractNames(BOOK, INDEX, { year: 1532 });
  const byName = new Map(names.map(n => [n.name, n]));
  assert.deepEqual(names.map(n => n.name).sort(), ['Alexander the Great', 'Cesare Borgia', 'Ferdinand of Aragon', 'Giorgio Scali', 'Lombardy', 'Lorenzo di Piero de’ Medici',
    'Louis the Twelfth', 'Machiavelli', 'Oliverotto da Fermo', 'Pope Alexander', 'Sinigalia', 'Urbino'].sort());
  // Joins (of, the, da, di, de’ with its elision), a possessive off, a title of a place is the place, an honorific goes.
  assert.equal(byName.get('Ferdinand of Aragon').mentions, 2);
  assert.equal(byName.get('Alexander the Great').mentions, 2, 'the possessive ’s is not part of the name');
  assert.equal(byName.get('Urbino').mentions, 2, '"the Duke of Urbino" names Urbino');
  assert.equal(byName.get('Giorgio Scali').mentions, 2, '"Messer" is an honorific');
  assert.equal(byName.get('Pope Alexander').mentions, 2, 'a title before a name stays with it');
  assert.equal(byName.get('Louis the Twelfth').mentions, 2, '"Thus", a sentence-initial common word, is not part of the name');
  // Machiavelli: once in the text (possessive), twice in a note; Lombardy twice. Counts and contexts.
  assert.equal(byName.get('Machiavelli').mentions, 3);
  assert.equal(byName.get('Machiavelli').notesOnly, false);
  assert.deepEqual(byName.get('Machiavelli').first, { ch: 1, p: 'c01-p03' });
  assert.match(byName.get('Lombardy').contexts[0], /^c01-p01: .*\[Lombardy\]/);
  for (const n of ['France', 'King', 'Italy', 'Fortune', 'Therefore', 'Burd', 'Naples', 'Romagna', 'Asia', 'Thus', 'Mr Burd']) assert.ok(!byName.has(n), `${n} is not a cast name`);
  assert.equal(MIN_MENTIONS, 2);
  // The building blocks.
  assert.equal(sentenceInitial('He went. Then Louis came', 9), true);
  assert.equal(sentenceInitial('He went, then Louis came', 14), false);
  assert.equal(sentenceInitial('[1] Machiavelli wrote', 4), true, 'after a note’s marker');
  assert.equal(sentenceInitial('line one\nLine two', 9), true, 'a line of verse');
  assert.ok(commonWords(BOOK).has('fortune') && !commonWords(BOOK).has('lombardy'));
});

test('queries: the name as written, with Roman numerals, without its title', () => {
  assert.equal(romanOrdinals('Louis the Twelfth'), 'Louis XII');
  assert.equal(romanOrdinals('Pope Julius the Second'), 'Pope Julius II');
  assert.equal(untitled('Pope Julius'), 'Julius');
  assert.equal(untitled('Cesare Borgia'), null);
  assert.deepEqual(queries('Pope Julius the Second'), ['Pope Julius the Second', 'Pope Julius II', 'Julius the Second', 'Julius II']);
  assert.deepEqual(queries('Cesare Borgia'), ['Cesare Borgia']);
  assert.equal(nameKey('The Niccolò  Machiavelli'), 'niccolo machiavelli');
});

// Wikidata items in the client's shape (trimEntity) and the labels of their classes.
const CLASSES = new Map([['Q5', 'human'], ['Q11424', 'film'], ['Q515', 'city'], ['Q3024240', 'historical country'], ['Q178561', 'battle'], ['Q3305213', 'painting'],
  ['Q12308941', 'male given name'], ['Q13417114', 'noble family'], ['Q4271324', 'mythological character'], ['Q178885', 'deity'], ['Q4167410', 'Wikimedia disambiguation page']]);
const item = (id, label, p31, dates = {}, sitelinks = 50, aliases = [], description = '') => ({ id, label, description, aliases, p31: [p31], dates, sitelinks, wiki: label });
const ITEMS = new Map([
  item('Q1', 'Cesare Borgia', 'Q5', { born: '1980' }, 0, [], 'materials science researcher'),
  item('Q2', 'Cesare Borgia', 'Q5', { born: '1475-09-13', died: '1507-03-12' }, 65, ['Caesar Borgia'], 'Duke of Romagna'),
  item('Q3', 'Cesare Borgia', 'Q11424', { published: '1912' }, 3, [], '1912 film'),
  item('Q4', 'Francesco Sforza', 'Q5', { born: '1491', died: '1512' }, 11),
  item('Q5x', 'Francesco I Sforza', 'Q5', { born: '1401-07-23', died: '1466-03-08' }, 45),
  item('Q6', 'Pandolfo', 'Q5', { died: '1299' }, 0, [], 'archbishop'),
  item('Q7', 'Pandolfo Petrucci', 'Q5', { born: '1452', died: '1512' }, 10),
  item('Q8', 'Alexander', 'Q515', {}, 5, [], 'a small town far away'),
  item('Q9', 'Alexander the Great', 'Q5', { born: '-0356-07-20', died: '-0323-06-10' }, 262, ['Alexander']),
  item('Q10', 'Alexander VI', 'Q5', { born: '1431', died: '1503-08-18' }, 104, ['Pope Alexander VI.']),
  item('Q11', 'Duchy of Urbino', 'Q3024240', { founded: '1443', dissolved: '1631' }, 40),
  item('Q12', 'Battle of Agnadello', 'Q178561', { date: '1509-05-14' }, 20, ['Vaila']),
  item('Q13', 'Theseus', 'Q4271324', {}, 90),
  item('Q14', 'Alexander', 'Q12308941', {}, 31, [], 'male given name'),
  item('Q15', 'The Prince', 'Q3305213', { founded: '1513' }, 100, ['Il Principe']),
  item('Q16', 'Orsini', 'Q13417114', {}, 32),
  item('Q17', 'God', 'Q178885', {}, 266),
  item('Q18', 'Ferrara', 'Q515', {}, 120),
  item('Q19', 'Ferrara', 'Q515', {}, 30, [], 'a city in another country'),
].map(e => [e.id, e]));
const ERA = { era: [1494, 1527], bound: 1527 };

test('era: alive or standing in the era best, earlier next, undated last; anything dated after the bound out', () => {
  const fit = (id, kind) => eraFit(ITEMS.get(id), kind, ERA);
  assert.equal(fit('Q2', 'person').fit, 1, 'Cesare Borgia lived in the era');
  assert.equal(fit('Q5x', 'person').fit, 0.9, 'Francesco I Sforza died before it');
  assert.equal(fit('Q9', 'person').fit, 0.9, 'Alexander the Great: 356 BC');
  assert.equal(fit('Q1', 'person').fit, 0, 'born 1980');
  assert.match(fit('Q1', 'person').why, /first dated 1980, after 1527/);
  assert.equal(fit('Q3', 'work').fit, 0, 'a film of 1912');
  assert.equal(fit('Q11', 'polity').fit, 1, 'the Duchy of Urbino stood in the era');
  assert.equal(fit('Q12', 'battle').fit, 1, 'Agnadello, 1509');
  assert.equal(fit('Q18', 'place').fit, 0.6, 'undated');
  assert.equal(eraFit(ITEMS.get('Q13'), 'person', { ...ERA, legendary: true }).fit, 0.9, 'of legend');
  assert.equal(eraFit({ dates: { founded: '1530' } }, 'polity', ERA).fit, 0, 'founded after the end of the era');
  assert.equal(eraFit({ dates: { founded: '1530' } }, 'polity', { ...ERA, bound: 1532 }).fit, 0.9, 'a note’s name is bound by the publication');
  assert.equal(lakeFirst({ born: '-0356-07-20', died: '-0323' }), -356);
  assert.equal(lakeFirst({ died: '1507' }), null, 'as tag-terms.mjs: a death alone dates nothing');
  assert.equal(lakeFirst({ published: '1912' }), null, 'nor does a publication date, which the lake does not keep');
  assert.equal(firstYear({ born: '-0356-07-20' }), lakeFirst({ born: '-0356-07-20' }), 'the cast reads the era as the tagger does');
});

test('kinds: person, place, polity, battle, war, organisation or work, from the classes’ labels; a deity, a film or a given name is none', () => {
  const kind = id => kindOf(ITEMS.get(id), CLASSES).kind;
  assert.deepEqual(['Q2', 'Q18', 'Q11', 'Q12', 'Q16', 'Q15', 'Q13'].map(kind), ['person', 'place', 'polity', 'battle', 'organisation', 'work', 'person']);
  assert.equal(kindOf(ITEMS.get('Q13'), CLASSES).legendary, true);
  for (const id of ['Q3', 'Q14', 'Q17']) assert.equal(kind(id), null, id);
  assert.deepEqual(KINDS, ['person', 'place', 'polity', 'battle', 'war', 'organisation', 'work']);
});

test('match: label, alias, the words in order (none of them only a place after "of"), without the title, or a prefix', () => {
  assert.equal(matchOf(ITEMS.get('Q2'), 'Cesare Borgia'), 'label');
  assert.equal(matchOf(ITEMS.get('Q2'), 'Caesar Borgia'), 'alias');
  assert.equal(matchOf(ITEMS.get('Q5x'), 'Francesco Sforza'), 'words');
  assert.equal(matchOf(ITEMS.get('Q7'), 'Pandolfo'), 'word');
  assert.equal(matchOf(ITEMS.get('Q10'), 'Alexander the Sixth'), 'label', 'the Roman-numeral form of the name');
  assert.equal(matchOf(ITEMS.get('Q10'), 'Pope Alexander'), 'words');
  assert.equal(matchOf(ITEMS.get('Q11'), 'Urbino', { searched: false }), null, 'a pooled item must match: Urbino is only the place after "of"');
  assert.equal(matchOf(ITEMS.get('Q11'), 'Urbino'), 'prefix', 'what the search returned matches at least by its start');
  assert.equal(within('Philip of Macedon', 'Philip II of Macedon'), true);
  assert.equal(within('Romagna', 'Duke of Romagna'), false);
  assert.equal(within('Fermo', 'Oliverotto da Fermo'), false);
  assert.equal(within('Sforza', 'Francesco I Sforza'), true);
});

const evaluate = (name, ids, extra = {}) => candidates(name, ids, ITEMS, CLASSES, { ...ERA, ...extra });

test('pick: the well known referent over an obscure namesake, the era between equals, a namesake out', () => {
  const cb = evaluate('Cesare Borgia', ['Q1', 'Q2', 'Q3']);
  assert.equal(cb[0].q, 'Q2');
  assert.deepEqual(cb.filter(c => c.rejected).map(c => c.q).sort(), ['Q1', 'Q3'], 'the researcher born 1980 and the film of 1912');
  const fs = evaluate('Francesco Sforza', ['Q4', 'Q5x']);
  assert.equal(fs[0].q, 'Q5x', 'Francesco I Sforza (45 sitelinks, by his words) over a Francesco Sforza of 11 (by his label)');
  assert.ok(holds('Francesco Sforza', fs[0], fs[1]).some(h => /close behind/.test(h)), 'and held: the namesake is close behind');
  const al = evaluate('Alexander', ['Q8', 'Q9', 'Q14']);
  assert.equal(al[0].q, 'Q9');
  assert.match(al.find(c => c.q === 'Q8').rejected, /undated and little known/, 'a small undated town of that name is a namesake');
  assert.match(al.find(c => c.q === 'Q14').rejected, /not a person/, 'a given name is no one');
  // The book's other names' picks are candidates: "Pandolfo" is the book's Pandolfo Petrucci, not the archbishop.
  const pa = evaluate('Pandolfo', ['Q6'], { pooled: ['Q7', 'Q2'] });
  assert.equal(pa[0].q, 'Q7');
  assert.ok(!pa.some(c => c.q === 'Q2'), 'a pooled item that does not match is no candidate');
  assert.equal(evaluate('Theseus', ['Q13'])[0].era, 0.9, 'of legend');
  assert.equal(evaluate('Ferrara', ['Q18', 'Q19'])[0].q, 'Q18');
});

test('confidence: the match, the era, how well known, the mentions and the lead; and the holds', () => {
  const [cb] = evaluate('Cesare Borgia', ['Q1', 'Q2', 'Q3']);
  const c = confidence(cb, null, 9);
  assert.ok(c.score >= DEFAULT_THRESHOLD && c.score <= 1, `${c.score}`);
  assert.match(c.why, /the name is its label; 1475–1507, in the era 1494–1527; 65 sitelinks; 9 mentions; no other candidate/);
  const few = confidence(cb, null, 2), many = confidence(cb, null, 16);
  assert.ok(few.score < c.score && c.score < many.score, 'more mentions, more confidence');
  const [ur] = evaluate('Urbino', ['Q11']);
  assert.ok(holds('Urbino', ur, null).includes('only the start of its name matches'), 'a prefix match is held');
  const [fe] = evaluate('Ferrara', ['Q19']);
  assert.ok(holds('Ferrara', fe, null).some(h => /one-word name for an item known to 30 sites/.test(h)));
  const [ag] = evaluate('Vaila', ['Q12']);
  assert.ok(holds('Vaila', ag, null).some(h => /one-word name/.test(h)), 'Agnadello is known to 20 sites');
  const rivals = [{ q: 'Q9', label: 'Alexander the Great', names: ['Alexander the Great'] }, { q: 'Q10', label: 'Alexander VI', names: ['Alexander the Sixth'] }];
  assert.ok(holds('Alexander', evaluate('Alexander', ['Q9'])[0], null, { bookRivals: rivals }).some(h => /longer names give "Alexander" to Q9 .* and Q10/.test(h)));
  // Hazards: a name the tagger would match as a common word of the book, or a string that tags something else now.
  const [pr] = evaluate('Il Principe', ['Q15']);
  assert.deepEqual(hazards(pr, ['Il Principe'], { common: new Set(['prince']), termStrings: new Map() }), ['"Prince" is a common word of the book']);
  assert.deepEqual(hazards(cb, ['Cesare Borgia'], { common: new Set(), termStrings: new Map([['Caesar Borgia', 'Q999']]) }), ['"Caesar Borgia" tags Q999 in the book now']);
});

test('aliases: the lake keeps an abbreviation’s full stop and drops a regnal number’s, as the cast reads them', () => {
  // lake/scripts/aliases.mjs, shared by build.mjs (record) and the cast (lakeAliases). Trimming every trailing stop
  // made William Withering's "With." the word "With", a term at every sentence it opens in ten books.
  assert.equal(tidyAlias('With.'), 'With.');
  assert.equal(tidyAlias('Oxon.'), 'Oxon.');
  assert.equal(tidyAlias('Lond.'), 'Lond.');
  assert.equal(tidyAlias('J. R. M.'), 'J. R. M.', 'an initial is not a regnal number');
  assert.equal(tidyAlias('Alexander VI.'), 'Alexander VI');
  assert.equal(tidyAlias('Pope Leo X.,'), 'Pope Leo X');
  assert.equal(tidyAlias('second Italian War (1499–1501),'), 'second Italian War (1499–1501)');
  assert.equal(tidyAlias('Venice;  '), 'Venice');
  assert.deepEqual(recordAliases(['Alexander VI.', 'With.', 'Rodrigo Borgia', 'Rodrigo Borgia', 'Alexander VI', 'a', 'b', 'c'], 'Alexander VI', ['Pope Alexander', 'With.', 'Alexander VI']),
    ['With.', 'Rodrigo Borgia', 'a', 'Pope Alexander'], 'the first six, tidied, less the label and repeats, then the module’s own names');
  assert.deepEqual(lakeAliases({ label: 'William Withering', aliases: ['With.', 'W. Withering,'] }), ['With.', 'W. Withering']);
});

test('book-only names: a given name (alone or after a regnal title) the item does not have on Wikidata stays the book’s', () => {
  assert.equal(isLocal('Pandolfo', ITEMS.get('Q7'), true), true);
  assert.equal(isLocal('Alexander', ITEMS.get('Q9'), true), false, 'Wikidata gives Alexander the Great that alias');
  assert.equal(isLocal('Pope Alexander', ITEMS.get('Q10'), true), true);
  assert.equal(isLocal('Cesare Borgia', ITEMS.get('Q2'), false), false);
});

const row = (name, ids, extra = {}) => ({ name, spellings: [], mentions: 4, initial: 0, notesOnly: false, first: { ch: 1, p: 'c01-p01' }, contexts: [`c01-p01: …[${name}]…`], cands: evaluate(name, ids), override: null, givenName: false, ...extra });

test('decide: auto over the threshold and unheld, review under it, one record per entity and decision; overrides win', () => {
  const resolved = [
    row('Cesare Borgia', ['Q1', 'Q2', 'Q3'], { mentions: 9 }),
    row('Caesar Borgia', ['Q2'], { mentions: 2, first: { ch: 2, p: 'c02-p03' } }),
    row('Alexander', ['Q9', 'Q14'], { mentions: 20 }),
    row('Alexander the Great', ['Q9']),
    row('Alexander the Sixth', ['Q10']),
    row('Urbino', ['Q11']),
    row('Vaila', ['Q12'], { override: { name: 'Vaila', qid: 'Q12', note: 'the battle' } }),
    row('Il Principe', ['Q15'], { override: { name: 'Il Principe', decision: 'skip', note: 'the book itself' } }),
    row('Testina', []),
    row('God', ['Q17']),
    row('Pandolfo', ['Q6', 'Q7'], { cands: evaluate('Pandolfo', ['Q6'], { pooled: ['Q7'] }), givenName: true, override: { name: 'Pandolfo', qid: 'Q7', note: 'Petrucci' } }),
    row('Theseus', ['Q13'], { spellings: ['THESEUS'], override: { name: 'Theseus', local: true, note: 'the book’s own: other books’ Theseus is another' } }),
  ];
  const { records, skipped, unresolved, counts } = decide(resolved, { threshold: DEFAULT_THRESHOLD });
  const rec = (q, d) => records.find(r => r.qid === q && r.decision === d);
  assert.deepEqual([rec('Q2', 'auto').name, rec('Q2', 'auto').aliases, rec('Q2', 'auto').mentions], ['Cesare Borgia', ['Caesar Borgia'], 11], 'two names of one man, one record');
  assert.deepEqual(rec('Q2', 'auto').first, { ch: 1, p: 'c01-p01' });
  assert.ok(rec('Q9', 'review'), '"Alexander" is held: the book gives the word to two men');
  assert.ok(rec('Q9', 'auto') && rec('Q10', 'auto'));
  assert.equal(rec('Q11', 'review').name, 'Urbino', 'a prefix match waits for a human');
  assert.equal(rec('Q12', 'auto').name, 'Vaila', 'an override names the item');
  assert.match(rec('Q12', 'auto').why, /^override: the battle/);
  assert.deepEqual(rec('Q7', 'auto').local, ['Pandolfo'], 'a given name stays the book’s');
  assert.deepEqual(rec('Q13', 'auto').local, ['Theseus', 'THESEUS'], 'an override’s "local" keeps every form of the name the book’s, though the item has it');
  assert.deepEqual(skipped.map(s => [s.name, s.qid, s.note]), [['Il Principe', 'Q15', 'the book itself']]);
  assert.deepEqual(unresolved.map(u => [u.name, u.why]), [['Testina', 'Wikidata has no item of that name'], ['God', 'no candidate is a person, place, polity, battle, war, organisation or work']]);
  assert.deepEqual(counts, { names: 12, resolved: 9, entities: records.length, auto: records.filter(r => r.decision === 'auto').length, review: records.filter(r => r.decision === 'review').length, unresolved: 2, skipped: 1 });
  // A human's override cannot bring in what the tagger and the data test would refuse.
  const late = decide([row('Cesare Borgia', ['Q1'], { override: { name: 'Cesare Borgia', qid: 'Q1', note: 'wrong' } })]).records[0];
  assert.equal(late.decision, 'review');
  assert.match(late.why, /but first dated 1980, after 1527/);
  // Overrides: the last for a name, else one for the entity; a malformed one is refused.
  const os = [{ name: 'Vaila', decision: 'review' }, { name: 'vaila', qid: 'Q12' }, { qid: 'Q2', decision: 'skip' }];
  assert.deepEqual(overrideFor(os, 'Vaila', null), { name: 'vaila', qid: 'Q12' });
  assert.deepEqual(overrideFor(os, 'Caesar Borgia', 'Q2'), { qid: 'Q2', decision: 'skip' });
  assert.throws(() => overrideFor([{ name: 'X', decision: 'maybe' }], 'X'), /auto, review or skip/);
  assert.throws(() => overrideFor([{ note: 'nothing' }], 'X'), /a name or a qid/);
  assert.throws(() => overrideFor([{ name: 'X', qid: 'P31' }], 'X'), /not a Wikidata ID/);
  assert.throws(() => overrideFor([{ name: 'X', local: 'yes' }], 'X'), /"local" is true or false/);
  assert.throws(() => overrideFor([{ qid: 'Q1', local: true }], 'X', 'Q1'), /a name's/);
  // A shelf decision that gives a name to an entity the cast feeds is the cast's to find (its record and the entity
  // stay); the rest are the shelf's, an entity's decision among them.
  const decisions = { France: 'Q70972', 'San Giorgio': 'Q966188', Naples: 'Q173065', Italy: null, Q30974: null };
  assert.deepEqual(castDecisions(decisions, { previous: { records: [{ qid: 'Q966188', decision: 'auto' }, { qid: 'Q70972', decision: 'review' }] }, overrides: [{ name: 'Naples', qid: 'Q173065', local: true }, { name: 'Rouen', qid: 'Q30974', decision: 'skip' }] }),
    { France: 'Q70972', Italy: null, Q30974: null });
  assert.deepEqual(castDecisions(decisions), decisions, 'with no cast yet, every decision is the shelf’s');
});

test('report: the book-only names with the shelf decisions that give them back, and those it proposes none for', () => {
  const r = (name, qid, label, local) => ({ name, aliases: [], local, qid, label, type: 'person', dates: {}, description: '', mentions: 3, first: { ch: 1, p: 'c01-p01' }, contexts: [], confidence: 0.9, decision: 'auto', why: '' });
  const cast = { title: 'T', threshold: 0.75, era: [1494, 1527], bound: { text: 1532, notes: 1532 }, counts: { names: 3, resolved: 3, entities: 3, auto: 3, review: 0, unresolved: 0, skipped: 0 },
    overrides: [{ name: 'Charles', shelf: false, note: 'three kings' }, { name: 'Cyrus', qid: 'Q8423', local: true, note: 'Cyrus the Great' }],
    records: [r('Charles', 'Q134452', 'Charles VIII of France', ['Charles']), r('Cyrus', 'Q8423', 'Cyrus the Great', ['Cyrus']), r('Julian', 'Q1440', 'Didius Julianus', ['Julian'])], skipped: [], unresolved: [] };
  const text = report(cast, { decisions: { Cyrus: 'Q8423' } });
  assert.match(text, /^ {2}"Cyrus": 'Q8423', \/\/ Cyrus the Great \(in the shelf\)$/m);
  assert.match(text, /^ {2}"Julian": 'Q1440', \/\/ Didius Julianus$/m);
  assert.doesNotMatch(text, /"Charles": 'Q134452'/, 'no decision proposed for a name the book gives to others too');
  assert.match(text, /None proposed for 1[^\n]*\n {4}"Charles" \(Q134452 Charles VIII of France\): three kings/);
});

test('the file: the head a field a line, every override, record and name on a line; Wikidata’s answers trimmed', () => {
  const cast = { slug: 't', title: 'T', threshold: 0.75, overrides: [{ name: 'A', qid: 'Q1', note: 'n' }], records: [{ name: 'A', qid: 'Q1' }, { name: 'B', qid: 'Q2' }], skipped: [], unresolved: [{ name: 'C' }] };
  const text = castJson(cast);
  assert.deepEqual(JSON.parse(text), cast);
  assert.deepEqual(text.split('\n').filter(l => /^ {2}\{/.test(l)).length, 4, 'an override, two records and an unresolved name');
  assert.equal(wdTime({ time: '+1475-09-13T00:00:00Z', precision: 11 }), '1475-09-13');
  assert.equal(wdTime({ time: '-0356-07-20T00:00:00Z', precision: 11 }), '-0356-07-20');
  assert.equal(wdTime({ time: '+1494-00-00T00:00:00Z', precision: 9 }), '1494');
  const e = trimEntity({ id: 'Q2', labels: { en: { value: 'Cesare Borgia' } }, descriptions: {}, aliases: { en: [{ value: 'Caesar Borgia' }] },
    claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }, { rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q1' } } } }],
      P569: [{ mainsnak: { datavalue: { value: { time: '+1475-09-13T00:00:00Z', precision: 11 } } } }] },
    sitelinks: { enwiki: { title: 'Cesare Borgia' }, itwiki: { title: 'Cesare Borgia' } } });
  assert.deepEqual(e, { id: 'Q2', label: 'Cesare Borgia', description: '', aliases: ['Caesar Borgia'], p31: ['Q5'], dates: { born: '1475-09-13' }, sitelinks: 2, wiki: 'Cesare Borgia' });
  assert.equal(order({ ch: 7, p: 'c07-n12' }), 7012);
});

test('adapter: one mention per book and entity for the auto records, linked to Neo Classic, with the book’s names but not its own', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cast-'));
  try {
    mkdirSync(join(dir, 'bibliotheca/data/cast'), { recursive: true });
    const records = [
      { name: 'Cesare Borgia', aliases: ['Duke Valentino', 'Cesare'], local: ['Cesare'], qid: 'Q2', label: 'Cesare Borgia', mentions: 9, first: { ch: 7, p: 'c07-p04' }, decision: 'auto' },
      { name: 'Valentino', aliases: [], local: ['Valentino'], qid: 'Q2', label: 'Cesare Borgia', mentions: 2, first: { ch: 3, p: 'c03-p24' }, decision: 'auto' },
      { name: 'Alexander', aliases: [], local: [], qid: 'Q9', label: 'Alexander the Great', mentions: 20, first: { ch: 3, p: 'c03-p17' }, decision: 'review' },
    ];
    writeFileSync(join(dir, 'bibliotheca/data/cast/t.json'), castJson({ slug: 't', title: 'T', author: 'A', year: 1532, threshold: 0.75, overrides: [], records, skipped: [], unresolved: [] }));
    writeFileSync(join(dir, 'bibliotheca/data/cast/t.txt'), 'the report, which the adapter does not read');
    const ms = bibliotheca({ jdpiDir: dir });
    assert.equal(ms.length, 1, 'one entity, its two records together; the review record is not fed');
    assert.deepEqual(ms[0], {
      key: { qid: 'Q2' }, label: 'Cesare Borgia', module: 'bibliotheca', source: 'bibliotheca:t',
      url: 'https://jdpi.pages.dev/bibliotheca/neo/index.html#book=t&ch=3&p=c03-p24&t=Q2', date: '1532',
      context: 'Named in T (A, 1532), 11 times, as Cesare Borgia, Duke Valentino, Cesare, Valentino', aliases: ['Cesare Borgia', 'Duke Valentino'],
    });
    assert.deepEqual(bibliotheca({ jdpiDir: join(dir, 'nowhere') }), [], 'no casts, no mentions');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- The cast files, the lake and the books.
const casts = existsSync(CAST) ? readdirSync(CAST).filter(f => f.endsWith('.json')).map(f => read(join(CAST, f))) : [];

test('built: every cast file follows its contract, written by castJson, under 2 MB, with its report beside it', () => {
  assert.ok(casts.length >= 1, 'The Prince has a cast');
  for (const cast of casts) {
    const path = castPath(cast.slug);
    assert.equal(readFileSync(path, 'utf8'), castJson(cast), `${cast.slug}: one record per line`);
    assert.ok(statSync(path).size < 2 * 1024 * 1024, `${cast.slug}: under 2 MB`);
    assert.ok(existsSync(reportPath(cast.slug)) && readFileSync(reportPath(cast.slug), 'utf8').startsWith(`${cast.title}: the cast`), `${cast.slug}: the report`);
    for (const k of ['slug', 'title', 'author', 'year', 'era', 'bound', 'generated', 'threshold', 'rules', 'counts', 'overrides', 'records', 'skipped', 'unresolved']) assert.ok(k in cast, `${cast.slug} has ${k}`);
    assert.ok(cast.threshold > 0 && cast.threshold <= 1);
    assert.ok(existsSync(bookPath(cast.slug)), `${cast.slug}: the book is built`);
    const book = readBook(cast.slug);
    assert.deepEqual([cast.title, cast.year, cast.era], [book.title, book.work.published, book.era], `${cast.slug}: the book's own title, year and era`);
    const ids = new Set(book.chapters.flatMap(c => c.paragraphs.map(p => p.id)));
    for (const o of cast.overrides) { overrideFor([o], o.name || '', o.qid); assert.ok(o.note, `${cast.slug}: override ${JSON.stringify(o)} says why`); }
    const qids = new Map();
    for (const r of cast.records) {
      const at = `${cast.slug} ${r.name}`;
      for (const k of ['name', 'aliases', 'local', 'qid', 'label', 'type', 'dates', 'description', 'mentions', 'first', 'contexts', 'confidence', 'decision', 'why']) assert.ok(k in r, `${at} has ${k}`);
      assert.match(r.qid, /^Q[1-9]\d*$/, at);
      assert.ok(['auto', 'review'].includes(r.decision), at);
      assert.ok(KINDS.includes(r.type) || /^override/.test(r.why), `${at}: a ${r.type}`);
      assert.ok(r.confidence >= 0 && r.confidence <= 1, at);
      assert.ok(r.mentions >= MIN_MENTIONS, at);
      assert.ok(ids.has(r.first.p) && r.first.p.startsWith(`c${String(r.first.ch).padStart(2, '0')}-`), `${at}: first named at ${r.first.p}`);
      assert.ok(r.local.every(s => [r.name, ...r.aliases].includes(s)), `${at}: its book-only names are its names`);
      // Auto means over the threshold and unheld, or a human's override; review means neither.
      if (r.decision === 'auto') assert.ok((r.confidence >= cast.threshold && !/held:/.test(r.why)) || /^override/.test(r.why), `${at}: auto at ${r.confidence}: ${r.why}`);
      else assert.ok(r.confidence < cast.threshold || /held:/.test(r.why) || /^override/.test(r.why), `${at}: review at ${r.confidence}`);
      const k = `${r.qid} ${r.decision}`;
      assert.ok(!qids.has(k), `${at}: one record per entity and decision`);
      qids.set(k, r);
    }
    for (const u of cast.unresolved) assert.ok(u.name && u.why && u.contexts.length, `${cast.slug} unresolved ${u.name}: why and where`);
    const c = cast.counts;
    assert.deepEqual([c.auto, c.review, c.unresolved, c.skipped, c.entities], [cast.records.filter(r => r.decision === 'auto').length, cast.records.filter(r => r.decision === 'review').length, cast.unresolved.length, cast.skipped.length, cast.records.length]);
    assert.equal(c.names, c.resolved + c.unresolved + c.skipped);
  }
});

test('built: every auto record’s entity is in the lake, with the book’s names, the Neo Classic link and the book’s era', () => {
  const lake = loadLake();
  const shards = new Map();
  const record = q => { const i = +q.slice(1) % 512; if (!shards.has(i)) shards.set(i, read(new URL(`lake/data/e/${i}.json`, ROOT))); return shards.get(i)[q]; };
  const manifest = read(new URL('lake/data/manifest.json', ROOT));
  assert.ok(manifest.modules.bibliotheca > 0, 'the lake counts the Bibliotheca mentions');
  for (const cast of casts) {
    for (const r of cast.records.filter(x => x.decision === 'auto')) {
      const at = `${cast.slug} ${r.name} → ${r.qid}`;
      const e = lake.get(r.qid);
      assert.ok(e, `${at} is in the lake`);
      const strings = new Set([e.label, ...e.aliases].map(s => fold(s)));
      for (const s of [r.name, ...r.aliases].filter(x => !r.local.includes(x))) assert.ok(strings.has(fold(s)), `${at}: the lake has the name "${s}"`);
      const first = firstYear(e.facts);
      assert.ok(first === null || first <= cast.bound.notes, `${at}: first dated ${first}, after ${cast.bound.notes}`);
      const ms = record(r.qid).mentions.filter(m => m.m === 'bibliotheca' && m.u.includes(`#book=${cast.slug}&`));
      assert.equal(ms.length, 1, `${at}: one mention of the book`);
      assert.match(ms[0].u, new RegExp(`^https://jdpi\\.pages\\.dev/bibliotheca/neo/index\\.html#book=${cast.slug}&ch=\\d+&p=[cnpv0-9-]+&t=${r.qid}$`), at);
    }
    // The adapter feeds exactly the auto records' entities, and the lake has no other mention of the book.
    const fed = new Set(cast.records.filter(x => x.decision === 'auto').map(x => x.qid));
    assert.deepEqual(new Set(bibliotheca({ jdpiDir: fileURLToPath(ROOT) }).filter(m => m.source === `bibliotheca:${cast.slug}`).map(m => m.key.qid)), fed);
    for (const r of cast.records.filter(x => x.decision === 'review' && !fed.has(x.qid))) {
      const lr = record(r.qid);
      assert.ok(!lr || !lr.mentions.some(m => m.m === 'bibliotheca' && m.u.includes(`#book=${cast.slug}&`)), `${cast.slug} ${r.name}: a review record is not fed`);
    }
  }
});

test('built: an override’s book-only name is not the lake’s, and the shelf gives it back to its entity in the book', () => {
  // "San Giorgio", "Cyrus", "Antiochus", "Braccio" and "Naples" mean in the Prince what they do not mean in the other
  // books (a cardinal's title, Cyrus the Younger, half a dozen Seleucids, the city): their entities are fed, the names
  // stay the Prince's, and its shelf decisions give them back to them there.
  const lake = loadLake();
  for (const cast of casts) {
    const decisions = shelfEntry(cast.slug).decisions || {}, book = readBook(cast.slug);
    for (const o of cast.overrides.filter(x => x.local)) {
      const r = cast.records.find(x => x.decision === 'auto' && [x.name, ...x.aliases].includes(o.name));
      assert.ok(r, `${cast.slug} "${o.name}": a record fed to the lake`);
      assert.ok(r.local.includes(o.name), `${cast.slug} "${o.name}": kept the book's`);
      assert.ok(!lake.get(r.qid).aliases.some(a => fold(a) === fold(o.name)), `${cast.slug} "${o.name}": not an alias of ${r.qid} in the lake`);
      if (o.shelf === false) continue;
      assert.equal(decisions[o.name], r.qid, `${cast.slug} "${o.name}": the shelf gives it to ${r.qid} ${r.label}`);
      assert.ok(book.chapters.some(c => c.paragraphs.some(p => p.terms.some(t => t.qid === r.qid && p.text.slice(t.s, t.e) === o.name))), `${cast.slug} "${o.name}" is tagged ${r.qid}`);
    }
  }
  const prince = casts.find(c => c.slug === 'the-prince');
  if (prince) assert.equal(prince.records.find(r => r.name === 'Naples')?.qid, 'Q173065', 'the Prince’s Naples is the Kingdom of Naples');
});

test('built: every book with a cast is tagged with it (re-tagged after the lake learnt it)', () => {
  for (const cast of casts) {
    const book = readBook(cast.slug);
    const tagged = new Set(book.chapters.flatMap(c => c.paragraphs.flatMap(p => p.terms.map(t => t.qid))));
    const missing = cast.records.filter(r => r.decision === 'auto' && [r.name, ...r.aliases].some(s => !r.local.includes(s)) && !tagged.has(r.qid)).map(r => `${r.name} → ${r.qid}`);
    assert.deepEqual(missing, [], `${cast.slug}: auto records the book is not tagged with (run tag-terms.mjs ${cast.slug} after the lake build)`);
  }
});
