// Bibliotheca · Neo Classic, the reading page (bibliotheca/neo/): its pure parts in Node (the address, a paragraph's
// HTML and its terms, the screens for an era, how a pane frame moves) and the page's own files against the page
// contract; then, when JDPI_URL is set (e.g. JDPI_URL=http://localhost:8787), the page in a browser: on the test
// fixture (three excerpts of The Prince with their terms, bibliotheca/neo/fixture.json, served in place of the shelf),
// on the real book, at phone width and inside the shell. PRP_PAGES=0 leaves the browser tests out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHash, writeHash } from '../bibliotheca/neo/lib/hash.js';
import { paragraphHtml, validTerms, termsOnScreen, distinctTerms, termCount, chapterLabel } from '../bibliotheca/neo/lib/text.js';
import { eraRows, eraFromFacts, bookEra, kardashevStep, kardashevPolity, yearOf, fmtEra, KARDASHEV_STEPS } from '../bibliotheca/neo/lib/era.js';
import { frameMove } from '../bibliotheca/neo/lib/frame.js';
import { shellHash } from '../kino/lib/links.js';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const file = p => readFileSync(join(ROOT, p), 'utf8');
const read = p => JSON.parse(file(p));
const FIXTURE = read('bibliotheca/neo/fixture.json');
const SHELF = read('bibliotheca/data/index.json');
const PRINCE = read('bibliotheca/data/books/the-prince.json');
const TODAY = new Date('2026-10-30T12:00:00Z');
// The only routes the shell accepts from a page (shell.js, 'prp:navigate').
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;
const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// A paragraph's HTML back to its text: line breaks for <br>, tags gone, entities decoded.
const textOf = html => unescape(html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));

/* ---------- the address ---------- */
const NONE = { book: null, ch: null, p: null, t: null, pane: null, show: null, era: null };
test('address: reads every key, and anything malformed as absent', () => {
  assert.deepEqual(readHash('#book=the-prince&ch=12&p=c12-p03&t=Q70972&pane=ency'), { ...NONE, book: 'the-prince', ch: 12, p: 'c12-p03', t: 'Q70972', pane: 'ency' });
  assert.deepEqual(readHash('book=the-prince'), { ...NONE, book: 'the-prince' }, 'with or without the #');
  assert.deepEqual(readHash(''), NONE);
  assert.deepEqual(readHash('#book=../secrets&ch=1.5&p=<b>&t=France&pane=side&show=../x&era=mine'), NONE);
  assert.equal(readHash('#ch=0').ch, 0, 'the dedication is chapter 0');
  assert.equal(readHash('#t=q70972').t, 'Q70972', 'a QID typed in lower case');
  assert.equal(readHash('#t=Q0').t, null);
  assert.equal(readHash('#pane=VM').pane, 'vm');
  // The screen shown in the pane: a row key of the "In Vitruvian Manager" tab, and only with that tab open.
  assert.deepEqual(readHash('#book=the-prince&t=Q70972&pane=vm&show=kardashev&era=term'), { ...NONE, book: 'the-prince', t: 'Q70972', pane: 'vm', show: 'kardashev', era: 'term' });
  for (const k of ['progress', 'retrospective', 'battlefield-history', 'historical-calendar', 'pestle', 'war-focus:korean-war', 'm0', 'm7']) assert.equal(readHash(`#pane=vm&show=${k}`).show, k, k);
  assert.equal(readHash('#pane=vm&show=War-Focus:Korean-War').show, 'war-focus:korean-war', 'typed in capitals');
  for (const k of ['kardashev2', 'war-focus:', 'war-focus:<b>', 'm10', 'mx', 'encyclopedia', '']) assert.equal(readHash(`#pane=vm&show=${encodeURIComponent(k)}`).show, null, `"${k}"`);
  assert.equal(readHash('#pane=ency&show=kardashev').show, null, 'a screen means nothing on the Encyclopaedia tab');
  assert.equal(readHash('#show=kardashev').show, null, 'nor with the pane shut');
  // Whose era: the term's, or (absent) the book's.
  assert.equal(readHash('#era=TERM').era, 'term');
  assert.equal(readHash('#era=book').era, null, 'the book’s era is the default, not a value');
});

test('address: writes a canonical hash that reads back, leaving out what would not', () => {
  const s = { book: 'the-prince', ch: 0, p: 'c00-p01', t: 'Q1399', pane: 'vm', show: null, era: null };
  assert.equal(writeHash(s), '#book=the-prince&ch=0&p=c00-p01&t=Q1399&pane=vm');
  assert.deepEqual(readHash(writeHash(s)), s);
  const shown = { ...s, show: 'war-focus:korean-war', era: 'term' };
  assert.equal(writeHash(shown), '#book=the-prince&ch=0&p=c00-p01&t=Q1399&pane=vm&show=war-focus:korean-war&era=term', 'the screen after the pane, the era last');
  assert.deepEqual(readHash(writeHash(shown)), shown);
  assert.equal(writeHash({ pane: 'ency', ch: 3 }), '', 'no book, no address');
  assert.equal(writeHash({ book: 'the-prince', ch: null, p: '', t: 'France', pane: 'side' }), '#book=the-prince');
  assert.equal(writeHash({ book: 'the-prince', ch: 3, t: 'Q70972' }), '#book=the-prince&ch=3&t=Q70972', 'a term may stay highlighted with the pane shut');
  assert.equal(writeHash({ book: 'the-prince', t: 'Q70972', pane: 'ency', show: 'kardashev', era: 'term' }), '#book=the-prince&t=Q70972&pane=ency&era=term', 'a screen only with pane=vm');
  assert.equal(writeHash({ book: 'the-prince', pane: 'vm', show: 'nowhere', era: 'book' }), '#book=the-prince&pane=vm', 'an unknown screen and the book’s era are not written');
});

/* ---------- a paragraph and its terms ---------- */
test('text: a paragraph renders its terms as Encyclopaedia links, in the words of the text, and nothing else changes', () => {
  const href = q => `/encyclopedia/index.html#${q}`;
  for (const c of FIXTURE.chapters) for (const p of c.paragraphs) {
    const html = paragraphHtml(p, { href });
    assert.equal(textOf(html), p.text, `${p.id}: the text survives`);
    const links = [...html.matchAll(/<a class="term" data-qid="(Q\d+)" data-jdpi-ency="\1" href="([^"]+)" title="[^"]*">([^<]*)<\/a>/g)];
    assert.equal(links.length, p.terms.length, `${p.id}: every term is a link`);
    links.forEach((m, i) => {
      assert.equal(m[1], p.terms[i].qid);
      assert.equal(m[2], href(p.terms[i].qid));
      assert.equal(unescape(m[3]), p.text.slice(p.terms[i].s, p.terms[i].e));
    });
    assert.match(html, new RegExp(`^<p class="para${p.kind === 'para' ? '' : ' ' + p.kind}" id="${p.id}" data-p="${p.id}">`));
  }
  // Verse keeps its lines; a footnote mark is set small; markup in the text is escaped, never run.
  const verse = FIXTURE.chapters.flatMap(c => c.paragraphs).find(p => p.kind === 'verse');
  assert.equal((paragraphHtml(verse).match(/<br>/g) || []).length, verse.text.split('\n').length - 1);
  assert.match(paragraphHtml({ id: 'x', text: 'the Duke Lodovico[1] to raise' }), /Lodovico<sup class="fn">\[1\]<\/sup> to/);
  assert.match(paragraphHtml({ id: 'x', text: '<img src=x onerror=alert(1)> & "so"' }), /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;so&quot;/);
});

test('text: terms with broken offsets or ids are left out rather than garbling the text', () => {
  const p = { id: 'x', text: 'Rome and Sparta and France', terms: [
    { s: 0, e: 4, qid: 'Q17167', label: 'Roman Republic' }, { s: 2, e: 8, qid: 'Q5', label: 'overlaps' }, { s: 9, e: 15, qid: 'Sparta', label: 'no QID' },
    { s: 20, e: 26, qid: 'Q70972', label: 'Kingdom of France' }, { s: 22, e: 99, qid: 'Q1', label: 'past the end' }, { s: 1.5, e: 3, qid: 'Q2', label: 'not whole' }] };
  assert.deepEqual(validTerms(p).map(t => t.qid), ['Q17167', 'Q70972']);
  assert.equal(textOf(paragraphHtml(p)), p.text);
  assert.deepEqual(termCount([p]), { n: 2, distinct: 2 });
});

test('text: the terms in view fold into distinct entries in reading order, with counts and the words used', () => {
  const ch3 = FIXTURE.chapters.find(c => c.n === 3);
  const rows = termsOnScreen(ch3.paragraphs);
  const firstSeen = [...new Set(ch3.paragraphs.flatMap(p => p.terms.map(t => t.qid)))];
  assert.deepEqual(rows.map(r => r.qid), firstSeen);
  for (const r of rows) assert.equal(r.n, ch3.paragraphs.flatMap(p => p.terms).filter(t => t.qid === r.qid).length, r.label);
  // One entry, several words: the Swiss in chapter XXVI are "Swiss" and "Switzers".
  const swiss = termsOnScreen(FIXTURE.chapters.find(c => c.n === 26).paragraphs).find(r => r.qid === 'Q435583');
  assert.deepEqual(swiss.forms.sort(), ['Swiss', 'Switzers']);
  assert.deepEqual(distinctTerms([{ qid: 'Q1', form: 'a' }, { qid: 'Q2', label: 'B', form: 'b' }, { qid: 'Q1', label: 'A', form: 'a' }]),
    [{ qid: 'Q1', label: 'a', n: 2, forms: ['a'] }, { qid: 'Q2', label: 'B', n: 1, forms: ['b'] }]);
  assert.deepEqual(chapterLabel({ n: 0, heading: 'Dedication', title: 'Dedication' }), { no: '', title: 'Dedication' });
  assert.deepEqual(chapterLabel({ n: 12, heading: 'Chapter XII', title: 'How many kinds of soldiery' }), { no: 'Chapter XII', title: 'How many kinds of soldiery' });
});

/* ---------- the screens for an era ---------- */
test('era: The Prince\'s period (1494–1527) opens the Invention Timeline and Kardashev; the rest say why not', () => {
  const rows = eraRows([1494, 1527], { today: TODAY });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.progress.at, 'science/progress/index.html#y=1527&f=1494');
  assert.equal(by.kardashev.at, 'kardashev/index.html#y=1500');
  assert.equal(by.pestle.at, 'q/national.html');
  assert.equal(by.pestle.today, true, 'National Analysis is countries today, and says so');
  for (const [id, why] of [['retrospective', /1926/], ['battlefield-history', /1926/], ['war-focus', /1926/], ['historical-calendar', /1980/]]) {
    assert.equal(by[id].available, false, id);
    assert.match(by[id].reason, why, id);
  }
  // Every available screen opens through the shell, on a route shell.js accepts, in the module and suite the
  // registry gives it.
  const reg = read('registry.json');
  for (const r of rows) {
    const suite = reg.suites.find(s => s.modules.some(m => m.id === r.module));
    assert.equal(suite?.id, r.suite, `${r.module} is in suite ${r.suite}`);
    if (r.available) assert.match(shellHash({ suite: r.suite, module: r.module, at: r.at }, 'http://localhost:8787/'), SHELL_ROUTE);
  }
});

test('era: the twentieth century opens every screen, War Focus at each war\'s first month in the period', () => {
  const wars = read('battlefield/focus/data/index.json').wars;
  const rows = eraRows([1939, 1945], { wars, today: TODAY });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.retrospective.at, 'https://hp-retrospective.pages.dev/#y=1939');
  assert.equal(by['battlefield-history'].at, 'battlefield/history/index.html#y=1939');
  assert.equal(by['historical-calendar'].available, false, 'the calendar begins in 1980');
  const focus = rows.filter(r => r.module === 'war-focus');
  assert.ok(focus.length >= 1 && focus.length <= 4 && focus.every(r => r.available));
  for (const r of focus) {
    const [, id, m] = r.at.match(/#war=([^&]+)&m=(\d{4}-\d{2})$/);
    const w = wars.find(x => x.id === decodeURIComponent(id));
    assert.ok(w, id);
    assert.ok(m >= w.start.slice(0, 7) && m >= '1939-01' && m <= (w.end || '9999').slice(0, 7), `${id} at ${m}`);
  }
  // The term that is itself a war comes first, at its own first month.
  const korea = wars.find(w => w.id === 'korean-war');
  if (korea) {
    const k = eraRows([1950, 1953], { wars, qid: korea.qid, today: TODAY }).find(r => r.module === 'war-focus');
    assert.equal(k.at, `battlefield/focus/index.html#war=korean-war&m=${korea.start.slice(0, 7)}`);
  }
  assert.equal(Object.fromEntries(eraRows([1989, 1991], { today: TODAY }).map(r => [r.id, r]))['historical-calendar'].at, 'q/calendar.html?period=history&month=1989-01');
  assert.equal(eraRows([2031, 2040], { today: TODAY }).find(r => r.id === 'historical-calendar').at, 'q/calendar.html?period=history&month=2026-01');
});

test('era: with a term\'s own dates, War Focus lists only the war that is the term', () => {
  const wars = read('battlefield/focus/data/index.json').wars;
  const focus = (era, opts) => eraRows(era, { wars, today: TODAY, ...opts }).filter(r => r.module === 'war-focus');
  // Italy's own era, 1946 to today: the wars of those years are not Italy's (the review found the Greek Civil War,
  // the Chinese Civil War, the First Indochina War and the Korean War listed).
  assert.deepEqual(focus([1946, 2026], { qid: 'Q38', ownEra: true }).map(r => [r.available, r.reason]), [[false, 'none of its wars is this term']]);
  assert.ok(focus([1946, 2026], { qid: 'Q38' }).every(r => r.available) && focus([1946, 2026], { qid: 'Q38' }).length >= 1, 'for a book of those years they are listed');
  // A term that is a war: that war alone, at its own first month.
  const korea = wars.find(w => w.id === 'korean-war');
  if (korea) assert.deepEqual(focus([1945, 2026], { qid: korea.qid, ownEra: true }).map(r => r.at), [`battlefield/focus/index.html#war=korean-war&m=${korea.start.slice(0, 7)}`]);
  // An era that ends before 1926 says that first.
  assert.match(focus([987, 1791], { qid: 'Q70972', ownEra: true })[0].reason, /begin in 1926/);
});

test('era: Kardashev steps and polities, an entity\'s dates, a book\'s period', () => {
  const energy = read('kardashev/data/energy.json');
  assert.deepEqual(KARDASHEV_STEPS, energy.steps.map(s => s.year), 'the steps are the tracker\'s');
  assert.equal(kardashevStep(1510), 1500);
  assert.equal(kardashevStep(0), 1);
  assert.equal(kardashevStep(1875), 1850, 'a tie goes to the earlier step');
  assert.equal(kardashevStep(2026), 2025);
  assert.equal(kardashevPolity('Kingdom of France', energy.polities, 1500), 'france');
  assert.equal(kardashevPolity('Kingdom_of_France', energy.polities, 1500), 'france');
  assert.equal(kardashevPolity('Kingdom of France', energy.polities, 1800), null, 'not after 1791');
  assert.equal(kardashevPolity('Duchy of Milan', energy.polities, 1500), null);
  assert.ok(eraRows([987, 1791], { polity: 'france', today: TODAY }).find(r => r.id === 'kardashev').at.endsWith('&p=france'));
  assert.deepEqual(eraFromFacts({ born: '1469-05-03', died: '1527-06-21' }), [1469, 1527]);
  assert.deepEqual(eraFromFacts({ founded: '0987', dissolved: '1791-09-04' }), [987, 1791]);
  assert.deepEqual(eraFromFacts({ founded: '1946-06-18' }, 2026), [1946, 2026], 'a standing state runs to today');
  assert.deepEqual(eraFromFacts({ date: '-0500' }), [-500, -500]);
  assert.equal(eraFromFacts({}), null);
  // Mixed pairs, as the lake has the Roman Empire: the earliest beginning to the latest end, not 476 alone.
  assert.deepEqual(eraFromFacts({ dissolved: '0476-10-04', start: '-0027-0', end: '0395' }), [-27, 476]);
  assert.deepEqual(eraFromFacts({ died: '1527' }), [1527, 1527], 'an end alone is that year');
  assert.deepEqual(eraFromFacts({ founded: '-0735' }, 2026), [-735, 2026], 'a beginning alone runs to today');
  assert.deepEqual(eraFromFacts({ start: '1950-06-25', end: '1953-07-27', date: '1950' }), [1950, 1953], 'a date beside a pair adds nothing');
  assert.equal(yearOf('1527-06-21'), 1527);
  assert.equal(fmtEra([-500, 1]), '500 BC–1');
  assert.deepEqual(bookEra(PRINCE, SHELF.books[0]), { years: [1494, 1527], label: 'the book’s period' });
  assert.deepEqual(bookEra(PRINCE, null, { era: [1500, 1503] }).years, [1500, 1503], 'a chapter\'s own period wins');
  assert.deepEqual(bookEra({ author: { born: 1723, died: 1790 } }).years, [1723, 1790]);
  assert.equal(bookEra({}), null);
});

/* ---------- the pane's frames ---------- */
test('frames: a pane frame moves by hash on its own page, and loads anything else', () => {
  assert.deepEqual(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/index.html#Q2'), { how: 'hash', url: 'http://x/encyclopedia/#Q2' }, 'the page\'s clean address is kept');
  assert.deepEqual(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/index.html#Q1'), { how: 'none' });
  assert.deepEqual(frameMove('about:blank', 'http://x/encyclopedia/index.html#Q1'), { how: 'load', url: 'http://x/encyclopedia/index.html#Q1' });
  assert.equal(frameMove(null, 'http://x/a.html').how, 'load');
  assert.equal(frameMove('http://x/q/calendar?period=history&month=1990-01', 'http://x/q/calendar.html?period=history&month=1991-01').how, 'load', 'a query reloads');
  assert.equal(frameMove('http://x/science/progress/#y=1527&f=1494', 'http://x/kardashev/index.html#y=1500').how, 'load');
  assert.equal(frameMove('https://hp-retrospective.pages.dev/#y=1946', 'https://hp-retrospective.pages.dev/#y=1950').how, 'hash');
  assert.equal(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/').how, 'load', 'dropping the hash is a navigation');
});

/* ---------- the data as the page reads it ---------- */
test('data: every term of every book on the shelf renders, and every paragraph can be addressed', () => {
  for (const row of SHELF.books) {
    const book = read(`bibliotheca/data/books/${row.slug}.json`);
    assert.equal(book.slug, row.slug);
    assert.deepEqual(readHash(writeHash({ book: row.slug })).book, row.slug, `${row.slug} is a slug the address keeps`);
    const ns = book.chapters.map(c => c.n);
    assert.equal(new Set(ns).size, ns.length, `${row.slug}: chapter numbers are unique`);
    const ids = new Set();
    for (const c of book.chapters) for (const p of c.paragraphs) {
      assert.equal(validTerms(p).length, p.terms.length, `${row.slug} ${p.id}: a term the page would skip`);
      assert.ok(!ids.has(p.id), `${row.slug} ${p.id}: duplicate id`); ids.add(p.id);
      assert.equal(readHash(writeHash({ book: row.slug, p: p.id })).p, p.id, `${row.slug} ${p.id}: the address keeps it`);
    }
  }
  // The fixture is three excerpts of the real book's text, with terms that are whole words of it and terms of the
  // corpus there: a re-tagged corpus may since have more, which the page tests on the fixture do not need, but never
  // fewer, so the page is not tested on a term the book no longer has (as Italy and Greece, now left untagged).
  const byId = new Map(PRINCE.chapters.flatMap(c => c.paragraphs).map(p => [p.id, p]));
  for (const p of FIXTURE.chapters.flatMap(c => c.paragraphs)) {
    assert.deepEqual({ kind: p.kind, text: p.text }, { kind: byId.get(p.id)?.kind, text: byId.get(p.id)?.text }, p.id);
    assert.equal(validTerms(p).length, p.terms.length, p.id);
    const corpus = new Set(byId.get(p.id).terms.map(t => `${t.s}:${t.e}:${t.qid}`));
    for (const t of p.terms) {
      assert.match(p.text.slice(t.s, t.e), /^[A-Z][\p{L}’']+$/u, `${p.id}: ${t.label}`);
      assert.ok(corpus.has(`${t.s}:${t.e}:${t.qid}`), `${p.id}: "${p.text.slice(t.s, t.e)}" → ${t.qid} is a term of the corpus there`);
    }
  }
  assert.deepEqual(FIXTURE.rights, PRINCE.rights, 'the fixture carries the corpus’s rights finding');
});

/* ---------- the page's own files ---------- */
test('page files: the page contract (front matter, connector, design system, tokens only)', () => {
  const html = file('bibliotheca/neo/index.html');
  assert.match(html, /<p class="prp-eyebrow" data-jdpi-standalone><span>Kino <span class="sep">·<\/span> Bibliotheca <span class="sep">·<\/span> Neo Classic<\/span><\/p>/);
  assert.match(html, /<script src="\.\.\/\.\.\/design\/prp-bar\.js" data-suite="kino" data-module="bibliotheca" data-shell="\.\.\/\.\.\/" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/design\/prp\.css">/);
  assert.match(html, /<html lang="en" class="prp" data-suite="kino">/);
  // The page contract as the rename to Vitruvian Manager left it (design/PRP-STYLE.md): "<Submodule> · VM", the VM icon.
  assert.match(html, /<title>Neo Classic · Bibliotheca · VM<\/title>/);
  assert.match(html, /<link rel="icon" href="\.\.\/\.\.\/design\/brand-vm-icon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /class="prp-title"/); assert.match(html, /class="prp-dek"/); assert.match(html, /class="prp-meta"/); assert.match(html, /class="prp-sources"/);
  assert.match(html, /role="tablist"/);
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /JDP-I(?!q)|>\s*Q\s*·|H&amp;P|F&amp;E/, 'no old brand names');
  const css = file('bibliotheca/neo/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colours come from the design system\'s tokens');
  assert.match(css, /\.nc-col \{[^}]*font: var\(--nc-size\)\/1\.7 var\(--prp-font-serif\)/, 'the text is the design system\'s serif');
  assert.match(css, /max-width: 66ch/, 'the reading measure');
});

/* ---------- the page in a browser ---------- */
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page' };
const FIXTURE_ROW = {
  slug: FIXTURE.slug, title: FIXTURE.title, author: FIXTURE.author.name, translator: FIXTURE.translator.name, year: FIXTURE.work.published, era: FIXTURE.era,
  words: FIXTURE.chapters.reduce((a, c) => a + c.words, 0), chapters: FIXTURE.chapters.length,
  paragraphs: FIXTURE.chapters.reduce((a, c) => a + c.paragraphs.length, 0), terms: FIXTURE.chapters.reduce((a, c) => a + termCount(c.paragraphs).n, 0),
};
// The fixture on the shelf, ahead of the real books.
async function withFixture(page) {
  await page.route('**/bibliotheca/data/index.json', route => route.fulfill({ json: { generated: SHELF.generated, books: [FIXTURE_ROW, ...SHELF.books] } }));
  await page.route('**/bibliotheca/data/books/fixture-the-prince.json', route => route.fulfill({ json: FIXTURE }));
}
// Uncaught errors, and console errors, except a resource on another site that did not load (the fonts, Wikimedia
// images in an entry: the network, not the page). `only` keeps those whose source matches (inside the shell, this page's).
function watch(page, only = null) {
  const errors = [];
  page.on('pageerror', e => { if (!only || only.test(e.stack || '')) errors.push(`pageerror: ${e.message}`); });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return;
    if (only && !only.test(url)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  return errors;
}
// Wait until the bar lists exactly the distinct terms whose links are in view (under the sticky head, and under the
// bar itself where it is a strip over the text, not the list in the margin; above the pane's sheet on a phone), in
// reading order, worked out from the page as a reader sees it, not from the page's own idea of the reading region;
// return them.
async function barShows(page) {
  const h = await page.waitForFunction(() => {
    const head = document.querySelector('#head').getBoundingClientRect().bottom, pane = document.querySelector('#pane');
    const pop = document.querySelector('#popout'), text = document.querySelector('#text').getBoundingClientRect();
    const strip = pop.hidden ? null : pop.getBoundingClientRect();
    const top = strip && strip.left < text.right && strip.right > text.left ? Math.max(head, strip.bottom) : head;
    const bottom = innerHeight - (!pane.hidden && getComputedStyle(pane).position === 'fixed' ? pane.getBoundingClientRect().height : 0);
    const want = [];
    for (const a of document.querySelectorAll('#text a.term')) { const r = a.getBoundingClientRect(); if (r.bottom > top && r.top < bottom && !want.includes(a.dataset.qid)) want.push(a.dataset.qid); }
    const chips = [...document.querySelectorAll('#chips .nc-chip')].map(b => b.dataset.term);
    return JSON.stringify(chips) === JSON.stringify(want) && want;
  }, null, { timeout: 8000 });
  return h.jsonValue();
}
const frameOf = (page, sel) => page.locator(sel).elementHandle().then(h => h.contentFrame());

test('page: the fixture: terms as links, the bar follows the terms in view, a term opens the pane, the address follows', PAGE, async () => {
  const browser = await launch();
  try {
    // 1120 px: wide enough to split, narrow enough that the pane narrows the text (so closing it reflows the text).
    const page = await browser.newPage({ viewport: { width: 1120, height: 800 } });
    const errors = watch(page);
    await withFixture(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=fixture-the-prince&ch=3`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para', { timeout: 20000 });
    const ch3 = FIXTURE.chapters.find(c => c.n === 3);
    assert.equal(await page.locator('#shelf').inputValue(), 'fixture-the-prince');
    assert.equal((await page.locator('#chapter-title').innerText()).replace(/\s+/g, ' '), 'III Concerning mixed principalities');
    assert.equal(await page.locator('#text p.para').count(), ch3.paragraphs.length);

    // Every term is a link into the Encyclopaedia, in the data's order and the text's own words.
    const links = await page.locator('#text a.term').evaluateAll(as => as.map(a => ({ qid: a.dataset.qid, text: a.textContent, href: a.href })));
    assert.deepEqual(links.map(({ qid, text }) => ({ qid, text })), ch3.paragraphs.flatMap(p => p.terms.map(t => ({ qid: t.qid, text: p.text.slice(t.s, t.e) }))));
    for (const l of links) assert.equal(l.href, `${BASE}/encyclopedia/index.html#${l.qid}`);

    // The bar opens over the text: nothing moves (the paragraph being read stays where it is, to the pixel).
    assert.equal(await page.getAttribute('#bar-toggle', 'aria-expanded'), 'false', 'collapsed by default where it would cover text');
    const place = () => page.evaluate(() => document.querySelector('#text p.current')?.getBoundingClientRect().top);
    await page.waitForSelector('#text p.current');
    await page.evaluate(() => document.fonts.ready);
    // Opened at a chapter, the chapter's head is at the top and stays there while the fonts arrive.
    await page.waitForTimeout(300);
    // (Within half a pixel: Chromium on Linux lays the sticky head out at a fraction, 0.48 px on the CI runner.)
    const headTop = await page.evaluate(() => document.querySelector('#head').getBoundingClientRect().top);
    assert.ok(Math.abs(headTop) < 0.5, `the chapter head is at the top (${headTop})`);
    const still = await place();
    await page.click('#bar-toggle');
    await page.waitForSelector('#popout:not([hidden])');
    const opened = await place();
    assert.ok(Math.abs(opened - still) < 0.5, `no layout shift when the bar opens (${still} -> ${opened})`);
    // The bar lists the terms in view; scrolled on, others; the address follows the current paragraph.
    const top = await barShows(page);
    assert.equal(await page.locator('#bar-count').innerText(), String(top.length));
    await page.evaluate(() => document.getElementById('c03-p07').scrollIntoView({ block: 'center' }));
    const end = await barShows(page);
    assert.ok(end.includes('Q12560'), `the Turk at the end of the excerpt: ${end}`);
    assert.notDeepEqual(end, top, 'the bar changed as the reader scrolled');
    await page.waitForFunction(() => /&p=c03-p0[67]\b/.test(location.hash));
    assert.equal(readHash(await page.evaluate(() => location.hash)).p, await page.evaluate(() => document.querySelector('#text p.current').id));
    assert.match(await page.locator('#pos').innerText(), /^¶ [67] of 7 · \d+%$/);
    assert.equal(await page.evaluate(() => document.querySelector('#head').getBoundingClientRect().top), 0, 'the chapter head stays at the top');
    assert.equal((await page.locator('#chapter-title').innerText()).replace(/\s+/g, ' '), 'III Concerning mixed principalities');
    // The bar can be hidden altogether (the switch, or T to bring it back), and collapsed (T, or its ×).
    await page.click('#bar-switch');
    assert.equal(await page.locator('#bar-toggle').isHidden(), true);
    assert.equal(await page.locator('#popout').isHidden(), true);
    await page.keyboard.press('t');
    await page.waitForSelector('#popout:not([hidden])');
    assert.equal(await page.getAttribute('#bar-switch', 'aria-pressed'), 'true');
    await page.click('#popout-close');
    assert.equal(await page.locator('#popout').isHidden(), true);
    await page.keyboard.press('t');
    await page.waitForSelector('#popout:not([hidden])');
    // At the very end of the page the sources fill the screen: no term in view, and the bar says so.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    if (!(await barShows(page)).length) assert.equal(await page.locator('#chips').innerText(), 'No terms in view.');
    await page.evaluate(() => document.getElementById('c03-p07').scrollIntoView({ block: 'center' }));
    await barShows(page);

    // Clicking a term uses it: every occurrence ringed, its chip pressed, the pane open beside the text on its entry.
    await page.locator('#text a.term[data-qid="Q12560"]').first().click();
    await page.waitForSelector('#pane:not([hidden])');
    assert.equal(await page.locator('a.term.lit').count(), await page.locator('a.term[data-qid="Q12560"]').count());
    assert.equal(await page.getAttribute('#chips .nc-chip[data-term="Q12560"]', 'aria-pressed'), 'true');
    const [book, pane] = await Promise.all(['#book .nc-col', '#pane'].map(s => page.locator(s).boundingBox()));
    assert.ok(pane.x >= book.x + book.width, 'book | pane, side by side above 1100 px');
    await page.waitForFunction(() => /&t=Q12560&pane=ency$/.test(location.hash));
    assert.equal(await page.locator('#pane-title').innerText(), 'Ottoman Empire');
    // The Encyclopaedia page frames (same origin, no X-Frame-Options), on the entry.
    const ency = await frameOf(page, '#ency-frame');
    await ency.waitForFunction(() => location.hash === '#Q12560' && document.querySelector('#entity h2')?.textContent === 'Ottoman Empire', null, { timeout: 30000 });
    assert.equal(await page.locator('#ency-fallback').isHidden(), true);
    // Another term, from the bar: the same frame moves by hash, without reloading.
    await ency.evaluate(() => { window.stillHere = true; });
    await page.evaluate(() => document.querySelector('#text a.term[data-qid="Q70972"]').scrollIntoView({ block: 'center' }));
    assert.ok((await barShows(page)).includes('Q70972'));
    await page.click('#chips .nc-chip[data-term="Q70972"]');
    await ency.waitForFunction(() => location.hash === '#Q70972' && document.querySelector('#entity h2')?.textContent === 'Kingdom of France', null, { timeout: 15000 });
    assert.equal(await ency.evaluate(() => window.stillHere), true, 'no reload');
    assert.equal(await page.getAttribute('#pane-open', 'href'), `${BASE}/#/rs/encyclopedia?at=${encodeURIComponent(`${BASE}/encyclopedia/index.html#Q70972`)}`);
    // A link in the entry that opens at the top (the framed Encyclopaedia believes it is in the shell): on its own,
    // the page sends it to a new tab, the shell at that place, and the book stays where it is.
    const topLink = ency.locator('#entity a[target="_top"]').first();
    await topLink.waitFor({ timeout: 15000 });
    const [tab] = await Promise.all([page.context().waitForEvent('page', { timeout: 15000 }), topLink.click()]);
    await tab.waitForURL(new RegExp(`^${BASE}/#/[a-z-]+/`), { timeout: 15000 });
    await tab.close();
    assert.equal(new URL(page.url()).pathname, '/bibliotheca/neo/', 'the book is still the page');
    assert.match(page.url(), /&t=Q70972&pane=ency$/);
    assert.equal(await ency.evaluate(() => location.hash), '#Q70972', 'and the pane still shows the entry');

    // In Vitruvian Manager: the screens for the book's period; one shown in the pane, at the period.
    await page.click('#tab-vm');
    await page.waitForSelector('#era-rows li[data-key="progress"]');
    const progress = page.locator('#era-rows li[data-key="progress"]');
    assert.equal(decodeURIComponent(await progress.locator('a').getAttribute('data-shell-hash')), `#/ns/progress?at=${BASE}/science/progress/index.html#y=1527&f=1494`);
    assert.match(await page.locator('#era-rows li.off[data-key="war-focus"]').innerText(), /its wars begin in 1926/);
    assert.equal(await page.locator('#era-rows li[data-key="pestle"] .prp-kind').innerText(), 'TODAY');
    await progress.locator('[data-show]').click();
    const vm = await frameOf(page, '#vm-frame');
    await vm.waitForFunction(() => /\/science\/progress\/(index\.html)?$/.test(location.pathname) && location.hash === '#y=1527&f=1494', null, { timeout: 20000 });
    await page.waitForFunction(() => /&pane=vm&show=progress$/.test(location.hash), null, { timeout: 5000 });
    assert.equal(await page.getAttribute('#pane-tall', 'aria-pressed'), 'false', 'beside the text the pane keeps its height');
    // The term's own dates are a choice too (the Kingdom of France: 987 to 1791, so War Focus still says why not).
    await vm.evaluate(() => { window.stillHere = true; });
    await page.click('#era-pick input[value="term"]');
    await page.waitForFunction(() => /the dates of Kingdom of France/.test(document.querySelector('#era-title').textContent), null, { timeout: 10000 });
    assert.match(await page.locator('#era-rows li.off[data-key="war-focus"]').innerText(), /its wars begin in 1926/);
    // The screen in the pane follows the era: the same Invention Timeline frame, moved to France's dates by its hash.
    await vm.waitForFunction(() => location.hash === '#y=1791&f=987', null, { timeout: 10000 });
    assert.equal(await vm.evaluate(() => window.stillHere), true, 'no reload');
    await page.waitForFunction(() => /&t=Q70972&pane=vm&show=progress&era=term$/.test(location.hash), null, { timeout: 5000 });

    // A reload brings back the screen shown in the pane and whose era it is.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vm-frame:not([hidden])', { timeout: 20000 });
    const vm2 = await frameOf(page, '#vm-frame');
    await vm2.waitForFunction(() => /\/science\/progress\/(index\.html)?$/.test(location.pathname) && location.hash === '#y=1791&f=987', null, { timeout: 20000 });
    assert.equal(await page.locator('#era-pick input[value="term"]').isChecked(), true);
    assert.match(await page.locator('#pane-title').innerText(), /^Invention Timeline · 987 to 1791$/);
    assert.equal(await page.locator('#era-rows li[data-key="progress"]').getAttribute('aria-current'), 'true');
    assert.match(page.url(), /&t=Q70972&pane=vm&show=progress&era=term$/);

    // Closing the pane gives the text the width back, the paragraph being read where it was.
    const before = await page.evaluate(() => { const p = document.querySelector('#text p.current'); return { id: p.id, top: p.getBoundingClientRect().top }; });
    await page.click('#pane-close');
    assert.equal(await page.locator('#pane').isHidden(), true);
    const after = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().top, before.id);
    assert.ok(Math.abs(after - before.top) <= 2, `the reader's place kept: ${before.top} → ${after}`);
    await page.waitForFunction(() => !/pane=|show=/.test(location.hash) && /t=Q70972/.test(location.hash));

    // Keys: → and ← move between chapters, and the address says which.
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /^#book=fixture-the-prince&ch=26\b/.test(location.hash));
    assert.equal((await page.locator('#chapter-no').innerText()), 'XXVI');
    assert.equal(await page.locator('#text p.verse').count(), 2);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => /^#book=fixture-the-prince&ch=3\b/.test(location.hash));
    // A term first dated after the book's period (an address may still name one: the Encyclopaedia's Italy, 1946)
    // offers no era of its own: the pane keeps the book's period, whatever the address asks.
    await page.evaluate(() => { location.hash = '#book=fixture-the-prince&ch=3&t=Q38&pane=vm&era=term'; });
    await page.waitForFunction(() => !document.querySelector('#pane').hidden && /the book’s period/.test(document.querySelector('#era-title').textContent), null, { timeout: 15000 });
    assert.equal(await page.locator('#era-pick').isHidden(), true, 'no choice of Italy’s 1946 to today beside a text of 1513');
    assert.match(await page.locator('#era-title').innerText(), /1494–1527/);
    assert.equal(await page.locator('#era-rows li.off[data-key="retrospective"]').count(), 1);
    assert.equal(await page.locator('#vm-frame').isHidden(), true, 'an address with no screen named shows the list alone');
    // By now the entity linker (design/jdpi-entities.js, 1.6 s after load) has run: it adds no second ◈ link to a term
    // or a chip, which carry their own.
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#text a.jdpi-ency, #byline a.jdpi-ency, #chips a.jdpi-ency').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the real book opens at a deep link with the paragraph in place, and the contents change chapter', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=12&p=c12-p08`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const ch12 = PRINCE.chapters.find(c => c.n === 12);
    const at = await page.evaluate(() => ({ id: document.querySelector('#text p.current').id, top: document.getElementById('c12-p08').getBoundingClientRect().top, head: document.querySelector('#head').offsetHeight }));
    assert.equal(at.id, 'c12-p08');
    assert.ok(at.top >= at.head && at.top <= at.head + 30, `the paragraph sits under the head: ${at.top} (head ${at.head})`);
    assert.equal(await page.locator('#text a.term').count(), termCount(ch12.paragraphs).n);
    assert.equal(await page.locator('#chapter-no').innerText(), 'XII');
    assert.equal(await page.locator('#shelf').inputValue(), 'the-prince');
    assert.equal(await page.evaluate(() => location.hash), '#book=the-prince&ch=12&p=c12-p08');
    assert.equal(await page.title(), 'The Prince, Chapter XII · Neo Classic · Bibliotheca · VM', 'page titles end "· VM"');
    assert.match(await page.locator('#sources').innerText(), /Project Gutenberg pg1232[\s\S]*header, footer and licence have been removed/);
    assert.match(await page.locator('#sources').innerText(), /every work published before 1931 is in the public domain in the United States/);
    // Light and dark: the page and its terms take the design system's tokens for the theme in force.
    const look = () => page.evaluate(() => {
      const css = getComputedStyle(document.documentElement), probe = document.createElement('i');
      document.body.append(probe);
      const resolve = v => { probe.style.color = css.getPropertyValue(v).trim(); return getComputedStyle(probe).color; };
      const out = { body: getComputedStyle(document.body).backgroundColor, canvas: resolve('--prp-canvas'), term: getComputedStyle(document.querySelector('#text a.term')).backgroundColor, soft: resolve('--prp-kn-soft') };
      probe.remove();
      return out;
    });
    const light = await look();
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await look();
    for (const t of [light, dark]) { assert.equal(t.body, t.canvas); assert.equal(t.term, t.soft); }
    assert.notEqual(light.body, dark.body);
    await page.emulateMedia({ colorScheme: 'light' });
    // The contents list every chapter; choosing one opens it at its top.
    await page.click('#toc-toggle');
    assert.equal(await page.locator('#toc-list a').count(), PRINCE.chapters.length);
    await page.click('#toc-list a[data-ci="13"]');
    await page.waitForFunction(() => /^#book=the-prince&ch=13\b/.test(location.hash));
    assert.equal(await page.locator('#toc').isHidden(), true);
    assert.equal(await page.locator('#chapter-no').innerText(), 'XIII');
    assert.ok(Math.abs(await page.evaluate(() => document.querySelector('#head').getBoundingClientRect().top)) <= 1, 'the chapter starts at the top');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the terms strip hides nothing the page counts as in view: a deep link lands below it, a term it covers is moved clear', PAGE, async () => {
  const browser = await launch();
  // The bar as the reader sees it: a strip over the text (not the list in the margin), its bottom, open or not.
  const bar = page => page.evaluate(() => {
    const p = document.querySelector('#popout'), r = p.getBoundingClientRect(), t = document.querySelector('#text').getBoundingClientRect();
    return { strip: !p.hidden && r.left < t.right && r.right > t.left, bottom: r.bottom, open: document.querySelector('#bar-toggle').getAttribute('aria-expanded') };
  });
  // A reader who has opened the bar (it is remembered).
  const opened = async width => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('prp.bibliotheca.popout', 'true'); } catch { /* no storage */ } });
    return ctx;
  };
  const open = async (ctx, hash) => {
    const page = await ctx.newPage(), errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    return { page, errors };
  };
  try {
    // 1120 px, the bar open: a strip under the head. The review measured a deep link to c03-p16 landing with the
    // paragraph's first line 26 px under it (strip bottom 114, paragraph top 88).
    const narrow = await opened(1120);
    const { page, errors } = await open(narrow, '#book=the-prince&ch=3&p=c03-p16');
    const s = await bar(page);
    const p = await page.evaluate(() => ({ id: document.querySelector('#text p.current').id, top: document.getElementById('c03-p16').getBoundingClientRect().top }));
    assert.ok(s.strip, 'the bar is a strip over the text');
    assert.equal(p.id, 'c03-p16');
    assert.ok(p.top >= s.bottom && p.top <= s.bottom + 30, `the paragraph sits below the strip: top ${p.top}, strip bottom ${s.bottom}`);
    await barShows(page);
    // Through the chapter, the bar lists only the terms the strip leaves in view (it listed covered ones at 12 of 29
    // positions).
    for (const f of [0.3, 0.42, 0.54, 0.66, 0.78]) { await page.evaluate(f => window.scrollTo(0, f * document.documentElement.scrollHeight), f); await barShows(page); }
    // Collapsing and opening the strip moves nothing.
    const place = () => page.evaluate(() => { const c = document.querySelector('#text p.current'); return { id: c.id, top: c.getBoundingClientRect().top }; });
    const before = await place();
    await page.click('#popout-close');
    await page.click('#bar-toggle');
    await page.waitForSelector('#popout:not([hidden])');
    assert.deepEqual(await place(), before);
    await barShows(page);
    assert.deepEqual(errors, []);
    await narrow.close();

    // 1280 px, the bar open: the list in the margin until the pane opens, then a strip. The review's case: "France" in
    // the first line of c03-p13, clicked, ended up under it. Now it moves just clear, and its paragraph stays the one read.
    const wide = await opened(1280);
    const w = await open(wide, '#book=the-prince&ch=3&p=c03-p13');
    assert.equal((await bar(w.page)).strip, false, 'with the pane shut the bar is the list in the margin');
    const france = w.page.locator('#c03-p13 a.term[data-qid="Q70972"]').first();
    await france.click();
    await w.page.waitForSelector('#pane:not([hidden])');
    const s2 = await bar(w.page), box = await france.boundingBox();
    assert.ok(s2.strip, 'with the pane open the list is a strip');
    assert.ok(box.y >= s2.bottom, `the term clicked is clear of the strip: ${box.y} (strip bottom ${s2.bottom})`);
    await w.page.waitForFunction(() => /&p=c03-p13&t=Q70972&pane=ency$/.test(location.hash));
    await barShows(w.page);
    assert.deepEqual(w.errors, []);
    await wide.close();

    // A reader who has never opened or collapsed the bar: open as the margin list, collapsed while the pane is open
    // (rather than a strip they did not ask for), back when it shuts.
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const d = await open(fresh, '#book=the-prince&ch=3&p=c03-p13');
    assert.deepEqual(await bar(d.page).then(b => [b.strip, b.open]), [false, 'true']);
    await d.page.locator('#c03-p13 a.term[data-qid="Q70972"]').first().click();
    await d.page.waitForSelector('#pane:not([hidden])');
    assert.equal(await d.page.getAttribute('#bar-toggle', 'aria-expanded'), 'false');
    assert.equal(await d.page.locator('#popout').isHidden(), true);
    await d.page.click('#pane-close');
    assert.deepEqual(await bar(d.page).then(b => [b.strip, b.open]), [false, 'true']);
    assert.deepEqual(d.errors, []);
    await fresh.close();
  } finally { await browser.close(); }
});

test('page: at phone width the pane is a sheet under the text, and nothing scrolls sideways', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    const errors = watch(page);
    await withFixture(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=fixture-the-prince&ch=3&p=c03-p03`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(await wide(), 360);
    const term = page.locator('#text a.term[data-qid="Q70972"]').first();
    await term.click();
    await page.waitForSelector('#pane:not([hidden])');
    const sheet = await page.evaluate(() => { const p = document.querySelector('#pane'), r = p.getBoundingClientRect(); return { position: getComputedStyle(p).position, top: r.top, bottom: r.bottom, width: r.width }; });
    assert.equal(sheet.position, 'fixed');
    assert.ok(sheet.top > 250 && Math.round(sheet.bottom) === 780 && Math.round(sheet.width) === 360, JSON.stringify(sheet));
    const t = await term.boundingBox();
    assert.ok(t.y + t.height <= sheet.top, 'the term clicked stays above the sheet');
    if (await page.getAttribute('#bar-toggle', 'aria-expanded') !== 'true') await page.click('#bar-toggle');
    await barShows(page); // the bar counts only what the strip and the sheet leave in view
    assert.equal(await wide(), 360);
    // "Show here" on a phone: the sheet opens taller for the screen, which is scrolled past its own front matter (title,
    // description, readings) to what it shows for the era.
    await page.click('#tab-vm');
    await page.locator('#era-rows li[data-key="progress"] [data-show]').click();
    assert.equal(await page.getAttribute('#pane-tall', 'aria-pressed'), 'true');
    const vm = await frameOf(page, '#vm-frame');
    await vm.waitForFunction(() => {
      const m = document.querySelector('.prp-meta');
      return /\/science\/progress\//.test(location.pathname) && m && scrollY > 0 && m.getBoundingClientRect().bottom <= 8 && m.getBoundingClientRect().bottom >= -40;
    }, null, { timeout: 20000 });
    assert.equal(await wide(), 360);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: inside the shell, a hash move keeps the page loaded and the pane\'s links move the shell', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page, /\/bibliotheca\//); // the shell's own panels fetch from other sites; this page's errors only
    // The registry with Bibliotheca in Kino, as recommended (the coordinator adds it to registry.json).
    await page.route('**/registry.json', async route => {
      const reg = await (await route.fetch()).json();
      const kino = reg.suites.find(s => s.id === 'kino');
      kino.modules = kino.modules.filter(m => m.id !== 'bibliotheca');
      const at = kino.modules.findIndex(m => m.id === 'kino-great-thinkers'); // the course comes last
      kino.modules.splice(at < 0 ? kino.modules.length : at, 0, { id: 'bibliotheca', name: 'Bibliotheca', kind: 'learning', icon: '¶', status: 'live', host: 'Vitruvian Manager', url: 'bibliotheca/neo/index.html',
        description: 'Public-domain classics read on screen.', views: [{ id: 'neo-classic', name: 'Neo Classic', url: 'bibliotheca/neo/index.html' }] });
      await route.fulfill({ json: reg });
    });
    await page.goto(`${BASE}/#/kino/bibliotheca`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#frames iframe.active[data-module="bibliotheca"]', { timeout: 20000 })).contentFrame();
    await frame.waitForSelector('#text p.para', { timeout: 20000 });
    assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('prp-embedded')), true);
    // The shell's frame at a 1440 px window is 1168 px wide: wide enough for the bar's list in the margin, open by
    // default, beside the text and inside the frame (it needed 1240 px before).
    const list = await frame.evaluate(() => {
      const p = document.querySelector('#popout'), r = p.getBoundingClientRect(), t = document.querySelector('#text').getBoundingClientRect();
      return { width: innerWidth, open: !p.hidden, beside: r.left >= t.right, inside: r.right <= document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(list, { width: list.width, open: true, beside: true, inside: true, scroll: true }, JSON.stringify(list));
    assert.ok(list.width >= 1150 && list.width < 1240, `the frame is ${list.width} px`);
    // Inside the shell a term's own link is the shell's route to its entry.
    assert.match(await frame.locator('#byline a.term').getAttribute('href'), new RegExp(`^${BASE}/#/rs/encyclopedia\\?at=`));
    // A deep link moves the page by its hash alone: same document, new chapter and paragraph. (Once the shell has seen
    // the frame load: until then shell.js compares with the address it asked for, bibliotheca/neo/index.html, which the
    // server has redirected to bibliotheca/neo/, and a hash written on the former reloads the page.)
    await page.waitForFunction(() => !document.querySelector('#frames iframe[data-module="bibliotheca"]').hasAttribute('data-loading'), null, { timeout: 20000 });
    await frame.evaluate(() => { window.stillHere = true; });
    await page.evaluate(h => { location.hash = h; }, `#/kino/bibliotheca?at=${encodeURIComponent(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=12&p=c12-p06`)}`);
    await frame.waitForFunction(() => document.querySelector('#text p.current')?.id === 'c12-p06', null, { timeout: 15000 });
    assert.equal(await frame.evaluate(() => window.stillHere), true, 'no reload');
    // The pane's "open in Vitruvian Manager" moves the shell to that screen, at the book's period.
    await frame.click('#pane-toggle');
    await frame.waitForSelector('#era-rows li[data-key="kardashev"] a');
    await frame.click('#era-rows li[data-key="kardashev"] a');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/kardashev?at='), null, { timeout: 10000 });
    assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /kardashev\/index\.html#y=1500$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
