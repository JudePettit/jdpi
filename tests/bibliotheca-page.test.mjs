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
  assert.equal(readHash('#pane=terms').pane, 'terms', 'AR Mode\'s "On screen" tab (BI-23)');
  // The screen shown in the pane: a row key of the "In Vitruvian Manager" tab, and only with that tab open.
  assert.deepEqual(readHash('#book=the-prince&t=Q70972&pane=vm&show=kardashev&era=term'), { ...NONE, book: 'the-prince', t: 'Q70972', pane: 'vm', show: 'kardashev', era: 'term' });
  for (const k of ['progress', 'retrospective', 'battlefield-history', 'historical-calendar', 'pestle', 'war-focus:korean-war', 'm0', 'm7', 'm12', 'm99']) assert.equal(readHash(`#pane=vm&show=${k}`).show, k, k);
  assert.equal(readHash('#pane=vm&show=War-Focus:Korean-War').show, 'war-focus:korean-war', 'typed in capitals');
  for (const k of ['kardashev2', 'war-focus:', 'war-focus:<b>', 'm100', 'mx', 'encyclopedia', '']) assert.equal(readHash(`#pane=vm&show=${encodeURIComponent(k)}`).show, null, `"${k}"`);
  assert.equal(readHash('#pane=ency&show=kardashev').show, null, 'a screen means nothing on the Master Index tab');
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
test('text: a paragraph renders its terms as Master Index links, in the words of the text, and nothing else changes', () => {
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
  assert.match(html, /<p class="prp-eyebrow" data-jdpi-standalone><span>Bibliotheca <span class="sep">·<\/span> Neo Classic<\/span><\/p>/);
  assert.match(html, /<script src="\.\.\/\.\.\/design\/prp-bar\.js" data-suite="bibliotheca" data-module="neo-classic" data-shell="\.\.\/\.\.\/" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/design\/prp\.css">/);
  assert.match(html, /<html lang="en" class="prp" data-suite="bibliotheca">/);
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
// Wait until AR Mode's "On screen" tab (BI-23; the floating bar until then) lists exactly the distinct terms whose
// links are in view (under the sticky head, above the pane's sheet on a phone), in reading order, worked out from the
// page as a reader sees it, not from the page's own idea of the reading region; return them.
async function barShows(page) {
  const h = await page.waitForFunction(() => {
    const top = document.querySelector('#head').getBoundingClientRect().bottom, pane = document.querySelector('#pane');
    const bottom = innerHeight - (!pane.hidden && getComputedStyle(pane).position === 'fixed' ? pane.getBoundingClientRect().height : 0);
    const want = [];
    for (const a of document.querySelectorAll('#text a.term')) { const r = a.getBoundingClientRect(); if (r.bottom > top && r.top < bottom && !want.includes(a.dataset.qid)) want.push(a.dataset.qid); }
    const chips = [...document.querySelectorAll('#chips .nc-chip')].map(b => b.dataset.term);
    return JSON.stringify(chips) === JSON.stringify(want) && want;
  }, null, { timeout: 8000 });
  return h.jsonValue();
}
const frameOf = (page, sel) => page.locator(sel).elementHandle().then(h => h.contentFrame());

test('page: the fixture: terms as links, AR Mode\'s "On screen" follows the terms in view, a term opens its entry, the address follows', PAGE, async () => {
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

    // Every term is a link into the Master Index, in the data's order and the text's own words.
    const links = await page.locator('#text a.term').evaluateAll(as => as.map(a => ({ qid: a.dataset.qid, text: a.textContent, href: a.href })));
    assert.deepEqual(links.map(({ qid, text }) => ({ qid, text })), ch3.paragraphs.flatMap(p => p.terms.map(t => ({ qid: t.qid, text: p.text.slice(t.s, t.e) }))));
    for (const l of links) assert.equal(l.href, `${BASE}/encyclopedia/index.html#${l.qid}`);

    // AR Mode, one button (BI-23): no bar lies over the text; the terms on screen are the pane's first tab.
    assert.equal(await page.locator('#popout, #bar-toggle, #bar-switch').count(), 0, 'no floating bar, no terms button of its own');
    assert.equal(await page.getAttribute('#pane-toggle', 'aria-label'), 'AR Mode');
    await page.waitForSelector('#text p.current');
    await page.evaluate(() => document.fonts.ready);
    // Opened at a chapter, the chapter's head is at the top and stays there while the fonts arrive.
    await page.waitForTimeout(300);
    // (Within two pixels: Chromium on Linux lands the sticky head at a fraction after the jump, 0.48 px then 1.48 px
    // on the CI runner; what matters is that the head is at the top, not a page further down.)
    const headTop = await page.evaluate(() => document.querySelector('#head').getBoundingClientRect().top);
    assert.ok(Math.abs(headTop) < 2, `the chapter head is at the top (${headTop})`);
    await page.click('#pane-toggle');
    await page.waitForSelector('#pane:not([hidden])');
    assert.equal(await page.getAttribute('#pane-toggle', 'aria-pressed'), 'true');
    assert.equal(await page.getAttribute('#tab-terms', 'aria-selected'), 'true', 'AR Mode opens on the terms on screen');
    await page.waitForFunction(() => /&pane=terms$/.test(location.hash));
    // The tab lists the terms in view; scrolled on, others; the address follows the current paragraph.
    const top = await barShows(page);
    assert.equal(await page.locator('#terms-count').innerText(), String(top.length));
    assert.equal(await page.textContent('#pane-title'), `${top.length} term${top.length === 1 ? '' : 's'} in view`);
    await page.evaluate(() => document.getElementById('c03-p07').scrollIntoView({ block: 'center' }));
    const end = await barShows(page);
    assert.ok(end.includes('Q12560'), `the Turk at the end of the excerpt: ${end}`);
    assert.notDeepEqual(end, top, 'the list changed as the reader scrolled');
    await page.waitForFunction(() => /&p=c03-p0[67]\b/.test(location.hash));
    assert.equal(readHash(await page.evaluate(() => location.hash)).p, await page.evaluate(() => document.querySelector('#text p.current').id));
    assert.match(await page.locator('#pos').innerText(), /^¶ [67] of 7 · \d+%$/);
    assert.equal(await page.evaluate(() => document.querySelector('#head').getBoundingClientRect().top), 0, 'the chapter head stays at the top');
    assert.equal((await page.locator('#chapter-title').innerText()).replace(/\s+/g, ' '), 'III Concerning mixed principalities');
    // P closes AR Mode and opens it again; T opens it on the terms on screen, and closes it from there.
    await page.keyboard.press('p');
    await page.waitForSelector('#pane', { state: 'hidden' });
    assert.equal(await page.getAttribute('#pane-toggle', 'aria-pressed'), 'false');
    await page.keyboard.press('p');
    await page.waitForSelector('#panel-terms:not([hidden])');
    await page.click('#tab-vm');
    await page.keyboard.press('t');
    await page.waitForSelector('#panel-terms:not([hidden])');
    await page.keyboard.press('t');
    await page.waitForSelector('#pane', { state: 'hidden' });
    await page.keyboard.press('t');
    await page.waitForSelector('#panel-terms:not([hidden])');
    // At the very end of the page the sources fill the screen: no term in view, and the tab says so.
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
    // The Master Index page frames (same origin, no X-Frame-Options), on the entry.
    const ency = await frameOf(page, '#ency-frame');
    await ency.waitForFunction(() => location.hash === '#Q12560' && document.querySelector('#entity h2')?.textContent === 'Ottoman Empire', null, { timeout: 30000 });
    assert.equal(await page.locator('#ency-fallback').isHidden(), true);
    // Another term, from the "On screen" tab: the entry opens on the Master Index tab, the same frame moved by hash,
    // without reloading.
    await ency.evaluate(() => { window.stillHere = true; });
    await page.evaluate(() => document.querySelector('#text a.term[data-qid="Q70972"]').scrollIntoView({ block: 'center' }));
    assert.ok((await barShows(page)).includes('Q70972'));
    await page.click('#tab-terms');
    await page.click('#chips .nc-chip[data-term="Q70972"]');
    await page.waitForSelector('#panel-ency:not([hidden])');
    await ency.waitForFunction(() => location.hash === '#Q70972' && document.querySelector('#entity h2')?.textContent === 'Kingdom of France', null, { timeout: 15000 });
    assert.equal(await ency.evaluate(() => window.stillHere), true, 'no reload');
    assert.equal(await page.getAttribute('#pane-open', 'href'), `${BASE}/#/rs/encyclopedia?at=${encodeURIComponent(`${BASE}/encyclopedia/index.html#Q70972`)}`);
    // A link in the entry that opens at the top (the framed Master Index believes it is in the shell): on its own,
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
    // The text re-flows to its full width and the place is restored a frame or two later, so wait for it to settle
    // rather than measure the reflow itself (CI once caught it 9 px short).
    const settled = await page.waitForFunction(([id, top]) => Math.abs(document.getElementById(id).getBoundingClientRect().top - top) <= 2,
      [before.id, before.top], { timeout: 3000 }).then(() => true, () => false);
    const after = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().top, before.id);
    assert.ok(settled && Math.abs(after - before.top) <= 2, `the reader's place kept: ${before.top} → ${after}`);
    await page.waitForFunction(() => !/pane=|show=/.test(location.hash) && /t=Q70972/.test(location.hash));

    // Keys: → and ← move between chapters, and the address says which.
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /^#book=fixture-the-prince&ch=26\b/.test(location.hash));
    assert.equal((await page.locator('#chapter-no').innerText()), 'XXVI');
    assert.equal(await page.locator('#text p.verse').count(), 2);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => /^#book=fixture-the-prince&ch=3\b/.test(location.hash));
    // A term first dated after the book's period (an address may still name one: the Master Index's Italy, 1946)
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
      const out = { body: getComputedStyle(document.body).backgroundColor, canvas: resolve('--prp-canvas'), term: getComputedStyle(document.querySelector('#text a.term')).backgroundColor, soft: resolve('--prp-bb-soft') };
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

// Until BI-23 the terms were a strip over the text, and this test kept what it covered out of what the page counted as
// in view. Now they are AR Mode's "On screen" tab: nothing lies over the text, a deep link lands just under the head,
// and the tab lists what the head and the sheet leave in view.
test('page: AR Mode on its terms: a deep link lands under the head, the list is what is in view through the chapter, a term clicked stays in view', PAGE, async () => {
  const browser = await launch();
  const open = async (width, hash) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage(), errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    return { ctx, page, errors };
  };
  try {
    // 1120 px, AR Mode open on its terms (pane=terms in the address): the paragraph sits just under the head.
    const { ctx, page, errors } = await open(1120, '#book=the-prince&ch=3&p=c03-p16&pane=terms');
    assert.equal(await page.getAttribute('#tab-terms', 'aria-selected'), 'true');
    const p = await page.evaluate(() => ({ id: document.querySelector('#text p.current').id, top: document.getElementById('c03-p16').getBoundingClientRect().top, head: document.querySelector('#head').getBoundingClientRect().bottom }));
    assert.equal(p.id, 'c03-p16');
    assert.ok(p.top >= p.head && p.top <= p.head + 30, `the paragraph sits under the head: ${JSON.stringify(p)}`);
    await barShows(page);
    for (const f of [0.3, 0.42, 0.54, 0.66, 0.78]) { await page.evaluate(f => window.scrollTo(0, f * document.documentElement.scrollHeight), f); await barShows(page); }
    assert.deepEqual(errors, []);
    await ctx.close();

    // 1280 px, AR Mode shut: "France" in the first line of c03-p13, clicked, opens its entry and stays in view.
    const w = await open(1280, '#book=the-prince&ch=3&p=c03-p13');
    const france = w.page.locator('#c03-p13 a.term[data-qid="Q70972"]').first();
    await france.click();
    await w.page.waitForSelector('#pane:not([hidden])');
    const box = await france.boundingBox(), head = await w.page.evaluate(() => document.querySelector('#head').getBoundingClientRect().bottom);
    assert.ok(box.y >= head && box.y + box.height <= 800, `the term clicked is in view: ${box.y} (head ${head})`);
    await w.page.waitForFunction(() => /&p=c03-p13&t=Q70972&pane=ency$/.test(location.hash));
    assert.equal(await w.page.getAttribute('#chips .nc-chip[data-term="Q70972"]', 'aria-pressed'), 'true', 'its chip on the terms tab is pressed');
    assert.deepEqual(w.errors, []);
    await w.ctx.close();
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
    await page.click('#tab-terms');
    await barShows(page); // AR Mode's terms count only what the sheet leaves in view
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
    // Bibliotheca is a module of its own (November 2026), Neo Classic its reader: the address it had under Kino lands
    // there, under its own name in the breadcrumb and the sidebar, in its own accent.
    await page.goto(`${BASE}/#/kino/bibliotheca`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#frames iframe.active[data-module="neo-classic"]', { timeout: 20000 })).contentFrame();
    await frame.waitForSelector('#text p.para', { timeout: 20000 });
    assert.equal(await page.evaluate(() => location.hash), '#/bibliotheca/neo-classic');
    assert.equal((await page.textContent('#crumbs')).replace(/\s+/g, ''), 'VM/Bibliotheca/NeoClassic');
    assert.equal(await page.getAttribute('#nav a[aria-current="page"]', 'href'), '#/bibliotheca/neo-classic');
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.suite), 'bibliotheca');
    assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('prp-embedded')), true);
    // The shell's frame at a 1440 px window is 1168 px wide; with AR Mode shut the text takes most of it (BI-21), and
    // nothing lies beside or over it.
    const list = await frame.evaluate(() => ({ width: innerWidth, text: document.querySelector('#text').getBoundingClientRect().width, scroll: document.documentElement.scrollWidth <= innerWidth }));
    assert.ok(list.width >= 1150 && list.width < 1240, `the frame is ${list.width} px`);
    assert.ok(list.text >= 0.8 * list.width && list.scroll, JSON.stringify(list));
    // Inside the shell a term's own link is the shell's route to its entry.
    assert.match(await frame.locator('#byline a.term').getAttribute('href'), new RegExp(`^${BASE}/#/rs/encyclopedia\\?at=`));
    // A deep link moves the page by its hash alone: same document, new chapter and paragraph. (Once the shell has seen
    // the frame load: until then shell.js compares with the address it asked for, bibliotheca/neo/index.html, which the
    // server has redirected to bibliotheca/neo/, and a hash written on the former reloads the page.)
    await page.waitForFunction(() => !document.querySelector('#frames iframe[data-module="neo-classic"]').hasAttribute('data-loading'), null, { timeout: 20000 });
    await frame.evaluate(() => { window.stillHere = true; });
    // (An old deep link, at Kino's address, moves the same frame, and the address becomes Bibliotheca's.)
    const deep = encodeURIComponent(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=12&p=c12-p06`);
    await page.evaluate(h => { location.hash = h; }, `#/kino/bibliotheca?at=${deep}`);
    await frame.waitForFunction(() => document.querySelector('#text p.current')?.id === 'c12-p06', null, { timeout: 15000 });
    assert.equal(await frame.evaluate(() => window.stillHere), true, 'no reload');
    assert.equal(await page.evaluate(() => location.hash), `#/bibliotheca/neo-classic?at=${deep}`);
    // The pane's "open in Vitruvian Manager" moves the shell to that screen, at the book's period.
    await frame.click('#pane-toggle');
    await frame.click('#tab-vm');
    await frame.waitForSelector('#era-rows li[data-key="kardashev"] a');
    await frame.click('#era-rows li[data-key="kardashev"] a');
    await page.waitForFunction(() => location.hash.startsWith('#/rs/kardashev?at='), null, { timeout: 10000 });
    assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /kardashev\/index\.html#y=1500$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* ---------- Augmented Reading, the shared pane and full screen (B1, B2) ----------
   The narrator's page tests, with the fake speech engine and the fake proxy of tests/tools/voice-fakes.mjs. The pure
   parts are tested in tests/bibliotheca-narrator.test.mjs. Imported here, at the end, so nothing above changes. */
const { chapterPassages, costFrom, speakable } = await import('../bibliotheca/neo/lib/narrate.js');
const { chapterTerms, span, nearestTerm, follow } = await import('../bibliotheca/neo/lib/follow.js');
const { FAKE_SPEECH, fakeProxy, RYAN_ID } = await import('./tools/voice-fakes.mjs');
const CH3 = PRINCE.chapters.find(c => c.n === 3), FX1 = FIXTURE.chapters.find(c => c.n === 1), FX3 = FIXTURE.chapters.find(c => c.n === 3);
// A page with the fake speech engine (and the fixture on the shelf), opened at an address, Augmented Reading turned on.
async function reading(browser, hash, { viewport = { width: 1366, height: 768 }, speech = {}, proxy = null, ar = true, context = {}, fixture = false } = {}) {
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.addInitScript(FAKE_SPEECH, speech);
  if (fixture) await withFixture(page);
  // With no proxy played, it answers as the real one does before it is set up (the local server has no Functions).
  const said = proxy ? await fakeProxy(page, proxy) : await fakeProxy(page, { available: false }).then(() => null);
  await page.goto(`${BASE}/bibliotheca/neo/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#text p.para.current', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  // On its own the page gains the connector's return bar a moment after it loads, which moves the text down: wait
  // for it, so that nothing measured below moves under the test.
  await page.waitForSelector('.prp-returnbar', { state: 'attached', timeout: 8000 }).catch(() => {});
  if (ar) { await page.keyboard.press('a'); await page.waitForSelector('#nar:not([hidden])'); }
  return { ctx, page, errors, said };
}
const spokenN = page => page.evaluate(() => window.__spoken.length);
const narAt = page => page.evaluate(() => ({ pid: window.__narrator.passage?.id, k: window.__narrator.pos.k, playing: window.__narrator.playing }));
// The unit being read, as the page marks it: the highlight's text, and its box against the reading region.
const marked = page => page.evaluate(() => {
  // The box is the unit's: the piece being read of a long sentence (nc-say-part), else the sentence.
  const r = [...(CSS.highlights.get('nc-say') || [])][0], part = [...(CSS.highlights.get('nc-say-part') || [])][0], head = document.querySelector('#head').getBoundingClientRect().bottom;
  const pane = document.querySelector('#pane'), sheet = !pane.hidden && getComputedStyle(pane).position === 'fixed' && !document.querySelector('#layout').classList.contains('fill') ? pane.getBoundingClientRect().top : innerHeight;
  const box = (part || r)?.getBoundingClientRect();
  return { text: r?.toString() || '', top: box?.top, bottom: box?.bottom, region: [head, sheet], pid: window.__narrator.passage?.id, k: window.__narrator.pos.k };
});
const unitOf = (chapterData, pid, k) => speakable(chapterData.paragraphs.find(p => p.id === pid)).units[k];

test('page: AR Reader (Augmented Reading until 15 November 2026): the button and the kicker say so, the pane shows the nearest term before Play, the narrator reads and marks the unit, keeps it in view, and R pauses and resumes it', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=the-prince&ch=3&p=c03-p03', { speech: { ms: 250 } });
    assert.match(await page.textContent('#ar-toggle'), /AR Reader/);
    assert.equal(await page.getAttribute('#ar-toggle', 'aria-label'), 'AR Reader');
    assert.equal(await page.getAttribute('#ar-toggle', 'aria-pressed'), 'true');
    await page.waitForFunction(() => /&pane=ency&ar=1$/.test(location.hash));
    assert.equal(await page.textContent('#pane-kicker'), 'AR Reader · Master Index');
    // Before Play, the term nearest the reader's paragraph.
    const { terms, base } = chapterTerms(CH3), p3 = CH3.paragraphs.find(p => p.id === 'c03-p03');
    const near = nearestTerm(terms, base.get('c03-p03'), base.get('c03-p03') + p3.text.length);
    const ency = await frameOf(page, '#ency-frame');
    await ency.waitForFunction(q => location.hash === `#${q}` && document.querySelector('#entity h2'), near, { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => window.__spoken), [], 'nothing is read until Play');
    // Play: the first unit of the paragraph under the reading line, without its footnote marks; it is the one marked.
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__spoken.length >= 1);
    const first = speakable(p3).units[0];
    assert.equal((await page.evaluate(() => window.__spoken[0])).text, first.text);
    assert.doesNotMatch(first.text, /\[\d+\]/);
    for (let i = 0; i < 4; i++) {
      const m = await marked(page), u = unitOf(CH3, m.pid, m.k);
      assert.equal(m.text, CH3.paragraphs.find(p => p.id === m.pid).text.slice(u.say[0], u.say[1]), `the mark is the unit being read (${m.pid}:${m.k})`);
      await page.waitForTimeout(200);
    }
    // Past a screenful the page scrolls by itself, the unit stays in the reading region, and after the deep link the
    // current paragraph moves on with the voice.
    await page.waitForFunction(() => window.__narrator.passage?.id === 'c03-p07', null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const m = await marked(page);
    assert.ok(m.top >= m.region[0] - 1 && m.bottom <= m.region[1] + 1, `the unit is in the reading region: ${JSON.stringify(m)}`);
    await page.waitForFunction(() => document.querySelector('#text p.current')?.id === 'c03-p07' && /&p=c03-p07&/.test(location.hash), null, { timeout: 5000 });
    // Scrolled away by hand, the page stays where the reader put it while the voice reads on.
    await page.mouse.move(300, 400);
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => scrollY), n = await spokenN(page);
    await page.waitForFunction(n => window.__spoken.length >= n + 3, n, { timeout: 10000 });
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - y) <= 1, 'the page stayed put');
    // R pauses; R again reads the same unit from its start, and brings it back into view.
    await page.keyboard.press('r');
    const at = await narAt(page);
    assert.equal(at.playing, false);
    const stopped = await spokenN(page);
    await page.waitForTimeout(600);
    assert.equal(await spokenN(page), stopped, 'silent while paused');
    await page.keyboard.press('r');
    await page.waitForFunction(n => window.__spoken.length > n, stopped);
    assert.equal((await page.evaluate(n => window.__spoken[n], stopped)).text, unitOf(CH3, at.pid, at.k).text, 'the same unit again');
    await page.waitForTimeout(700);
    const back = await marked(page);
    assert.ok(back.top >= back.region[0] - 1 && back.bottom <= back.region[1] + 1, 'Play follows the voice again');
    await page.keyboard.press('r');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the pane follows the rule\'s entries as it reads, with no reload; H holds and lets go; a term clicked holds; P opens the Master Index tab', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=the-prince&ch=3', { speech: { ms: 150 } });
    const ency = await frameOf(page, '#ency-frame');
    await ency.waitForFunction(() => document.querySelector('#entity h2'), null, { timeout: 30000 });
    // The frame is loaded: from now on it must only move by hash. What the pane is sent is recorded inside it.
    await ency.evaluate(() => { window.stillHere = true; window.__sent = []; addEventListener('hashchange', () => window.__sent.push(location.hash.slice(1))); });
    const showing = (await ency.evaluate(() => location.hash)).slice(1);
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__narrator.passage?.id === 'c03-p11', null, { timeout: 30000 });
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    const at = await narAt(page);
    // The same units through the rule, from Play (the first sentence shown at once).
    const { terms, base } = chapterTerms(CH3), want = [];
    let state = { showing, read: 0, fresh: true };
    outer: for (const p of chapterPassages(CH3)) for (const [k, u] of p.units.entries()) {
      const r = follow(state, span(base, p.id, u), terms); state = r.state;
      if (r.show) want.push(r.show);
      if (p.id === at.pid && k === at.k) break outer;
    }
    assert.ok(want.length >= 2, `the rule moves the pane ${want.length} times`);
    assert.deepEqual(await ency.evaluate(() => window.__sent), want, 'the entries the pane was sent are the rule\'s');
    assert.equal(await ency.evaluate(() => window.stillHere), true, 'and the frame was never reloaded');
    // H holds: the term showing becomes the reader's (t=), and the pane stays while the reading goes on.
    const held = want.at(-1);
    await page.keyboard.press('h');
    await page.waitForFunction(q => new RegExp(`&t=${q}&pane=ency&ar=1$`).test(location.hash), held);
    assert.equal(await page.getAttribute('#nar-hold', 'aria-pressed'), 'true');
    const sent = (await ency.evaluate(() => window.__sent)).length, n = await spokenN(page);
    await page.keyboard.press('r');
    await page.waitForFunction(n => window.__spoken.length >= n + 12, n, { timeout: 15000 });
    assert.equal((await ency.evaluate(() => window.__sent)).length, sent, 'held: the pane did not move');
    // H again: t= goes, and the pane shows the term nearest the unit being read.
    await page.keyboard.press('r');
    await page.keyboard.press('h');
    await page.waitForFunction(() => !/&t=/.test(location.hash));
    const now = await page.evaluate(() => ({ pid: window.__narrator.passage.id, k: window.__narrator.pos.k }));
    const u = unitOf(CH3, now.pid, now.k), sp = span(base, now.pid, u);
    await ency.waitForFunction(q => location.hash === `#${q}`, nearestTerm(terms, sp.from, sp.to), { timeout: 5000 });
    // A term clicked while it reads holds the pane on that term.
    await page.keyboard.press('r');
    const term = page.locator('#text a.term[data-qid="Q38"], #text a.term[data-qid="Q70972"]').first();
    const q = await term.getAttribute('data-qid');
    await term.scrollIntoViewIfNeeded();
    await term.click();
    await page.waitForFunction(q => new RegExp(`&t=${q}&`).test(location.hash), q);
    const n2 = await spokenN(page);
    await page.waitForFunction(n => window.__spoken.length >= n + 8, n2, { timeout: 15000 });
    assert.equal(await ency.evaluate(() => location.hash), `#${q}`, 'the reader\'s term stays');
    await page.keyboard.press('r');
    // P, with the mode on, opens the Master Index tab.
    await page.click('#tab-vm');
    await page.keyboard.press('p');
    await page.waitForSelector('#pane', { state: 'hidden' });
    await page.keyboard.press('p');
    await page.waitForSelector('#pane:not([hidden])');
    assert.equal(await page.getAttribute('#tab-ency', 'aria-selected'), 'true');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the divider between the text and the pane, with a real pointer: the pane widens, the reader\'s paragraph stays within 2 px, and the share is kept', PAGE, async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(), errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=3&p=c03-p06&t=Q70972&pane=ency`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#pane:not([hidden])');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const bar = page.locator('#pane > .prp-split-bar');
    assert.equal(await bar.getAttribute('role'), 'separator');
    assert.equal(await bar.getAttribute('aria-valuenow'), '44');
    const place = () => page.evaluate(() => { const p = document.querySelector('#text p.current'); return { id: p.id, top: p.getBoundingClientRect().top }; });
    const before = await place(), w0 = (await page.locator('#pane').boundingBox()).width;
    const b = await bar.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width / 2 - i * 15, b.y + 300);
    await page.mouse.up();
    const w1 = (await page.locator('#pane').boundingBox()).width;
    assert.ok(w1 > w0 + 100, `the pane widened: ${w0} → ${w1}`);
    const kept = await page.waitForFunction(([id, top]) => Math.abs(document.getElementById(id).getBoundingClientRect().top - top) <= 2, [before.id, before.top], { timeout: 3000 }).then(() => true, () => false);
    assert.ok(kept, `the reader's paragraph stayed: ${JSON.stringify(before)} → ${JSON.stringify(await place())}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('prp.split.bibliotheca')));
    assert.ok(saved > 44 && saved <= 60, `saved ${saved}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#pane:not([hidden])');
    assert.ok(Math.abs((await page.locator('#pane').boundingBox()).width - w1) <= 2, 'and kept after a reload');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: full screen is the whole page: the text and the pane side by side with no width limit, P leaves the text alone and centred; inside the shell it is Bibliotheca\'s frame', PAGE, async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage(), errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=3&p=c03-p06&t=Q70972&pane=ency`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#pane:not([hidden])');
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(() => document.querySelector('#text p.current').id);
    await page.keyboard.press('f');
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement && document.documentElement.hasAttribute('data-prp-fs'));
    const look = await page.evaluate(() => {
      const col = document.querySelector('#book .nc-col').getBoundingClientRect(), pane = document.querySelector('#pane').getBoundingClientRect();
      return { max: getComputedStyle(document.querySelector('.nc-page')).maxWidth, front: getComputedStyle(document.querySelector('.nc-front')).display, colRight: col.right, paneLeft: pane.left, paneRight: pane.right, w: innerWidth, size: getComputedStyle(document.querySelector('.nc-col')).fontSize };
    });
    assert.equal(look.max, 'none', 'the page\'s width limit is gone');
    assert.equal(look.front, 'none', 'and its own header');
    assert.ok(look.paneLeft >= look.colRight && look.paneRight > 1850, `side by side across the screen: ${JSON.stringify(look)}`);
    assert.equal(look.size, '20.16px', 'the reading size grows with the screen (1.05vw at 1920)');
    await page.waitForFunction(id => document.querySelector('#text p.current')?.id === id, before, { timeout: 3000 });
    await page.keyboard.press('p');
    await page.waitForSelector('#pane', { state: 'hidden' });
    const col = await page.locator('#book .nc-col').boundingBox();
    assert.ok(Math.abs(col.x + col.width / 2 - 960) <= 3, `the text alone, centred: ${JSON.stringify(col)}`);
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement && !document.documentElement.hasAttribute('data-prp-fs'));
    // Inside the shell, the shell's full-screen element is Bibliotheca's frame.
    await page.goto(`${BASE}/#/bibliotheca/neo-classic`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#frames iframe.active[data-module="neo-classic"]', { timeout: 20000 })).contentFrame();
    await frame.waitForSelector('#text p.para', { timeout: 20000 });
    await frame.locator('#chapter-title').click(); // focus into the frame (the head's fade lies over the text's first 12 px)
    await page.keyboard.press('f');
    await page.waitForFunction(() => document.fullscreenElement?.matches?.('iframe[data-module="neo-classic"]'), null, { timeout: 5000 });
    await page.keyboard.press('f');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Screens only lays the pane over the text under the head (1366 and 360 wide); the reading, the current paragraph and the address carry on; Escape gives the text back', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [viewport, context] of [[{ width: 1366, height: 768 }, {}], [{ width: 360, height: 780 }, { isMobile: true, hasTouch: true }]]) {
      const { page, errors } = await reading(browser, '#book=the-prince&ch=3&p=c03-p02', { viewport, context, speech: { ms: 120 } });
      await page.keyboard.press('d');
      await page.waitForFunction(() => document.querySelector('#layout').classList.contains('fill'));
      const box = await page.evaluate(() => { const p = document.querySelector('#pane').getBoundingClientRect(), h = document.querySelector('#head').getBoundingClientRect(); return { top: p.top, left: p.left, right: p.right, bottom: p.bottom, head: h.bottom, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth }; });
      assert.ok(Math.abs(box.top - box.head) <= 1 && box.left === 0 && Math.round(box.right) === box.w && Math.round(box.bottom) === box.h, `over the text, under the head: ${JSON.stringify(box)}`);
      assert.equal(box.sw, box.w, 'nothing scrolls sideways');
      assert.equal(await page.locator('#popout').count(), 0, 'no terms strip over anything');
      // The head's buttons still work, and the reading goes on beneath, the current paragraph and the address with it.
      await page.click('#nar-play');
      await page.waitForFunction(() => window.__spoken.length >= 2);
      await page.waitForFunction(() => window.__narrator.passage?.id === 'c03-p05', null, { timeout: 20000 });
      await page.waitForFunction(() => /&p=c03-p0[56]&/.test(location.hash) && /^c03-p0[56]$/.test(document.querySelector('#text p.current')?.id), null, { timeout: 5000 });
      await page.click('#nar-play');
      assert.equal(await page.getAttribute('#nar-play', 'aria-pressed'), 'false');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#layout').classList.contains('fill'));
      assert.equal(await page.locator('#pane').isVisible(), true, 'the pane stays open');
      assert.deepEqual(errors, []);
      await page.context().close();
    }
  } finally { await browser.close(); }
});

// BI-20 (Jude, 15 November 2026): in Screens only a screen of "In Vitruvian Manager" ran out about 100 px above the
// foot of the window (an empty subtitles strip), in a frame the list of screens left two fifths of the pane, its map cut
// off, with four scroll bars. The pane, and the screen in it, run from under the head to the foot of the window; on a
// desktop the screen is given the window's height and scaled to its frame, on a phone it keeps its own layout.
test('page: in Screens only a screen fills the pane to the foot of the window and is scaled to its frame (1530 × 770, 390 × 844)', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [viewport, context] of [[{ width: 1530, height: 770 }, {}], [{ width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
      const { page, errors, ctx } = await reading(browser, '#book=the-prince&ch=4&p=c04-p02&pane=vm&show=pestle&ar=1', { viewport, context, speech: { ms: 120 }, ar: false });
      await page.waitForSelector('#nar:not([hidden])', { timeout: 20000 }); // ar=1 in the address: the pane stays on its screen
      const vm = await frameOf(page, '#vm-frame');
      await vm.waitForSelector('.prp-meta', { state: 'attached', timeout: 20000 });
      await page.keyboard.press('d');
      await page.waitForSelector('#layout.fill');
      const at = `${viewport.width} × ${viewport.height}`;
      const fits = () => page.waitForFunction(() => {
        const f = document.querySelector('#vm-frame'), z = Number(f.style.zoom || 1), b = f.getBoundingClientRect();
        return Math.abs(f.contentWindow.innerHeight * z - b.height) <= 2;
      }, null, { timeout: 5000 }).catch(() => {});
      await fits();
      const m = await page.evaluate(() => {
        const f = document.querySelector('#vm-frame'), b = f.getBoundingClientRect(), p = document.querySelector('#pane').getBoundingClientRect();
        const list = document.querySelector('#vm-list'), tabs = document.querySelector('#pane .prp-tabs');
        return { ih: innerHeight, head: document.querySelector('#head').getBoundingClientRect().bottom, pane: [p.top, p.bottom], frame: [b.top, b.bottom, b.height],
          zoom: Number(f.style.zoom || 1), inner: f.contentWindow.innerHeight, subs: document.querySelector('#subs').hidden,
          listScrolls: list.scrollHeight > list.clientHeight + 1, rows: [...list.querySelectorAll('li')].filter(li => li.offsetParent).map(li => li.dataset.key),
          tabsScroll: getComputedStyle(tabs).overflowY, pageBar: getComputedStyle(document.documentElement).scrollbarWidth };
      });
      const why = `${at}: ${JSON.stringify(m)}`;
      assert.equal(m.subs, true, `${at}: no subtitles strip before anything is said`);
      assert.ok(Math.abs(m.pane[0] - m.head) <= 1 && m.ih - m.pane[1] <= 2, `the pane from under the head to the foot: ${why}`);
      assert.ok(m.ih - m.frame[1] <= 2 && m.ih - m.frame[1] >= -1, `the screen runs to the foot of the window: ${why}`);
      assert.ok(m.frame[0] >= m.pane[0] && m.frame[1] <= m.pane[1] + 1, `the screen inside the pane: ${why}`);
      // The screen's own viewport, scaled, is exactly its frame: none of it hangs below, cut off.
      assert.ok(Math.abs(m.inner * m.zoom - m.frame[2]) <= 2, `the screen is not taller than its frame: ${why}`);
      if (viewport.width >= 1000) assert.ok(m.zoom < 1 && m.zoom >= 0.6 && Math.abs(m.inner - Math.min(m.ih, m.frame[2] / 0.6)) <= 2, `a desktop screen is given the window's height, scaled: ${why}`);
      else assert.equal(m.zoom, 1, `${at}: a phone's screen keeps its own layout`);
      assert.deepEqual(m.rows, ['pestle'], `${at}: the list is the shown screen's row alone`);
      assert.equal(m.listScrolls, false, `${at}: the list does not scroll`);
      assert.equal(m.tabsScroll, 'hidden', `${at}: the tabs have no scroll bar`);
      assert.equal(m.pageBar, 'none', `${at}: the page's own scroll bar goes`);
      // Reading: the subtitles take the foot, the screen ends where they begin and is scaled again.
      await page.click('#nar-play');
      await page.waitForSelector('#subs:not([hidden])');
      await page.click('#nar-play');
      await fits();
      const r = await page.evaluate(() => {
        const f = document.querySelector('#vm-frame'), b = f.getBoundingClientRect(), s = document.querySelector('#subs').getBoundingClientRect();
        return { ih: innerHeight, frame: b.bottom, h: b.height, subs: [s.top, s.bottom], zoom: Number(f.style.zoom || 1), inner: f.contentWindow.innerHeight };
      });
      assert.ok(Math.abs(r.frame - r.subs[0]) <= 1 && r.ih - r.subs[1] <= 2 && Math.abs(r.inner * r.zoom - r.h) <= 2, `${at}, reading: ${JSON.stringify(r)}`);
      // Escape gives the text back: the screen at its own size, the whole list again.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#layout.fill'));
      await page.waitForFunction(() => !document.querySelector('#vm-frame').style.zoom, null, { timeout: 5000 });
      assert.ok(await page.locator('#era-rows li').count() > 1 && await page.locator('#era-title').isVisible(), `${at}: the list is whole again`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth), 'auto');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// BI-21 (Jude, 15 November 2026): with nothing open the text sat in a 606 px column in the middle of a 1,530 px window.
test('page: with nothing beside it the text takes most of the window (1530 × 770, 1920 × 1080); AR Mode\'s pane still fits beside it', PAGE, async () => {
  const browser = await launch();
  try {
    for (const viewport of [{ width: 1530, height: 770 }, { width: 1920, height: 1080 }]) {
      const { page, errors, ctx } = await reading(browser, '#book=the-prince&ch=4&p=c04-p01', { viewport, ar: false });
      const at = `${viewport.width} × ${viewport.height}`;
      const box = () => page.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; };
        const z = document.createElement('span'); z.textContent = '0'; document.querySelector('.nc-col').append(z); const ch = z.getBoundingClientRect().width; z.remove();
        return { vw: innerWidth, sw: document.documentElement.scrollWidth, text: r('#text'), pane: r('#pane'), ch };
      });
      // Nothing beside it: at least 70% of the window, or the 110ch cap.
      const none = await box();
      assert.ok(none.text.w >= Math.min(0.7 * none.vw, 110 * none.ch) - 2 && none.text.w <= 110 * none.ch + 2, `${at}, nothing open: ${JSON.stringify(none)}`);
      assert.equal(none.sw, none.vw, `${at}: nothing scrolls sideways`);
      // The pane open: the 66ch column beside it, as before, no overlap.
      await page.click('#pane-toggle');
      await page.waitForSelector('#pane:not([hidden])');
      await page.waitForFunction(() => document.querySelector('#text').getBoundingClientRect().right <= document.querySelector('#pane').getBoundingClientRect().left);
      const pane = await box();
      assert.ok(pane.text.r <= pane.pane.l && Math.abs(pane.text.w - 66 * pane.ch) <= 2 && pane.sw === pane.vw, `${at}, the pane open: ${JSON.stringify(pane)}`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// BI-22 (Jude, 15 November 2026): with Links open, the terms bar was a strip hanging from the head over the first
// lines of the text. Since BI-23 the terms on screen are AR Mode's first tab, in the pane: nothing of them lies over
// the book (on a phone the pane is the sheet docked under the text, as before, and the first line is above it).
// The lines of the text on screen below the head (each clipped to its part below the head) that the bar's box covers.
const barCovers = page => page.evaluate(() => {
  const head = document.querySelector('#head').getBoundingClientRect(), pop = document.querySelector('#chips');
  if (!pop.offsetParent) return { open: false, over: [] };
  const b = pop.getBoundingClientRect(), range = document.createRange(), over = [];
  let first = null;
  for (const p of document.querySelectorAll('#text p.para')) {
    range.selectNodeContents(p);
    for (const r of range.getClientRects()) {
      if (!r.width || r.bottom <= head.bottom + 1 || r.top >= innerHeight) continue;
      const line = { l: r.left, r: r.right, t: Math.max(r.top, head.bottom), b: r.bottom };
      first ||= line;
      if (line.l < b.right && line.r > b.left && line.t < b.bottom - 0.5 && line.b > b.top + 0.5) over.push(line);
    }
  }
  return { open: true, bar: { l: b.left, r: b.right, t: b.top, b: b.bottom }, head: head.bottom, first, over };
});
test('page: the terms on screen cover no line of the text: AR Mode open on them, at 1530 × 770 and 390 × 844', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [viewport, context] of [[{ width: 1530, height: 770 }, {}], [{ width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
      const { page, errors, ctx } = await reading(browser, '#book=the-prince&ch=4&p=c04-p03', { viewport, context, ar: false });
      const at = `${viewport.width} × ${viewport.height}`;
      assert.equal(await page.locator('#popout').count(), 0, `${at}: no floating bar`);
      // AR Mode: one button, the pane on its first tab, the terms on screen.
      await page.click('#pane-toggle');
      await page.waitForSelector('#panel-terms:not([hidden])');
      await page.waitForTimeout(300);
      const both = await barCovers(page);
      assert.ok(both.open && both.first, `${at}: the terms are listed, and text is on screen: ${JSON.stringify(both)}`);
      const f = both.first, b = both.bar;
      assert.ok(!(f.l < b.r && f.r > b.l && f.t < b.b && f.b > b.t), `${at}: the first line on screen is clear of the terms: ${JSON.stringify(both)}`);
      if (viewport.width >= 1000) assert.deepEqual(both.over, [], `${at}: beside the text, over none of it`);
      // Scrolled on, the same (the head is stuck at the top of the window).
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(400);
      const on = await barCovers(page);
      assert.ok(on.first && !(on.first.l < on.bar.r && on.first.r > on.bar.l && on.first.t < on.bar.b && on.first.b > on.bar.t), `${at}, scrolled: ${JSON.stringify(on)}`);
      if (viewport.width >= 1000) assert.deepEqual(on.over, [], `${at}, scrolled`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// The Master Index now names every book that names an entry (MI-08): for Machiavelli seven books besides his Kino film
// and his lesson. "Where … appears" lists the other modules first and leaves out the book open (this page); a place's
// key is its index in the entry, so show= keeps naming it.
test('page: "Where … appears" lists the other modules before the books, leaves out the book open, and keys a place by its index in the entry', PAGE, async () => {
  const mentions = read(`lake/data/e/${1399 % 512}.json`).Q1399.mentions;
  const film = mentions.findIndex(m => m.m === 'kino-great-thinkers');
  const browser = await launch();
  try {
    const { page, errors, ctx } = await reading(browser, `#book=the-prince&ch=7&p=c07-p01&t=Q1399&pane=vm&show=m${film}`, { ar: false });
    await page.waitForSelector('#mention-rows li');
    const rows = await page.locator('#mention-rows li').evaluateAll(ls => ls.map(l => ({ key: l.dataset.key, name: l.querySelector('b').textContent, place: l.querySelector('span').textContent })));
    const at = JSON.stringify(rows);
    const other = rows.findIndex(r => /^Named in/.test(r.place));
    assert.ok(rows.length <= 8 && rows.length > 0, at);
    assert.ok(other < 0 || rows.slice(other).every(r => /^Named in/.test(r.place)), `the books after the other modules: ${at}`);
    assert.ok(rows.some(r => r.key === `m${film}`), `the Kino film is listed, as m${film}: ${at}`);
    assert.ok(!rows.some(r => /^Named in The Prince \(/.test(r.place)), `the book open is not listed: ${at}`);
    for (const r of rows) assert.equal(mentions[+r.key.slice(1)].c || '', r.place, `${r.key} is the entry's place of that index`);
    assert.equal(await page.getAttribute(`#mention-rows li[data-key="m${film}"]`, 'aria-current'), 'true', 'show= names the film');
    await page.waitForSelector('#vm-frame:not([hidden])');
    assert.match(await page.getAttribute('#vm-frame', 'data-url') || '', /\/kino\//);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
});

// Eight rows, whatever the address shows: a place past the eighth takes the eighth row, keeping its own key (until
// 15 November 2026 it was a ninth row). Aristotle in the first volume of Gibbon: the Invention Timeline, then eleven
// other books; show=m11 is the twelfth.
test('page: "Where … appears" lists eight places; one show= names past them takes the eighth row, as its own key', PAGE, async () => {
  const mentions = read(`lake/data/e/${868 % 512}.json`).Q868.mentions;
  const order = mentions.map((m, i) => ({ m, i })).filter(x => !x.m.u.includes('#book=decline-and-fall-1&'));
  const keys = [...order.filter(x => x.m.m !== 'neo-classic'), ...order.filter(x => x.m.m === 'neo-classic')].map(x => `m${x.i}`);
  const past = keys[keys.length - 1];
  assert.ok(keys.length > 8 && keys.indexOf(past) >= 8, `a place past the eighth: ${keys}`);
  const browser = await launch();
  try {
    for (const [show, want] of [[past, [...keys.slice(0, 7), past]], [keys[2], keys.slice(0, 8)]]) {
      const { page, errors, ctx } = await reading(browser, `#book=decline-and-fall-1&ch=2&p=c02-p156&t=Q868&pane=vm&show=${show}`, { ar: false });
      await page.waitForSelector(`#mention-rows li[data-key="${show}"][aria-current="true"]`, { timeout: 20000 });
      assert.deepEqual(await page.locator('#mention-rows li').evaluateAll(ls => ls.map(l => l.dataset.key)), want, `show=${show}`);
      assert.ok(new RegExp(`&show=${show}$`).test(await page.evaluate(() => location.hash)), 'the address keeps the place');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// A term chosen from the "On screen" tab by keyboard opens its entry on the Master Index tab, which hides the chips:
// focus goes to that tab (until 15 November 2026 it stayed on the chip, in the hidden panel, where nothing showed it).
test('page: Enter on an "On screen" chip leaves the focus on the Master Index tab, seen, in the pane', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors, ctx } = await reading(browser, '#book=the-prince&ch=7&p=c07-p01&pane=terms', { ar: false });
    await page.evaluate(() => document.querySelector('#text a.term').scrollIntoView({ block: 'center' }));
    await page.waitForSelector('#panel-terms:not([hidden]) #chips .nc-chip');
    const qid = await page.getAttribute('#chips .nc-chip', 'data-term');
    await page.focus(`#chips .nc-chip[data-term="${qid}"]`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#panel-ency:not([hidden])');
    await page.waitForFunction(q => new RegExp(`&t=${q}&pane=ency$`).test(location.hash), qid);
    const focus = await page.evaluate(() => {
      const a = document.activeElement, r = a.getBoundingClientRect();
      return { id: a.id, inPane: !!a.closest('#pane'), seen: a.checkVisibility() && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight };
    });
    assert.deepEqual(focus, { id: 'tab-ency', inPane: true, seen: true });
    assert.equal(await page.getAttribute('#tab-ency', 'aria-selected'), 'true');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
});

test('page: subtitles in Screens only show the unit being read; S hides and shows them, and the choice is kept; in a 360 px pane each word of a long unit is in the strip when it is said', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors, ctx } = await reading(browser, '#book=the-prince&ch=3&p=c03-p06', { speech: { ms: 120 } });
    assert.equal(await page.locator('#nar-subs').isHidden(), true, 'not offered while the text is in view');
    await page.keyboard.press('d');
    await page.waitForSelector('#layout.fill');
    // With nothing said yet the strip is not there: the screen runs to the foot (BI-20).
    assert.equal(await page.locator('#subs').isHidden(), true, 'no empty strip before Play');
    assert.equal(await page.locator('#nar-subs').isVisible(), true);
    await page.keyboard.press('r');
    await page.waitForSelector('#subs:not([hidden])');
    assert.equal(await page.getAttribute('#subs', 'aria-hidden'), 'true');
    await page.waitForFunction(() => window.__spoken.length >= 2);
    await page.keyboard.press('r');
    const at = await narAt(page);
    assert.equal((await page.textContent('#subs-box')).replace(/\s+/g, ' ').trim(), unitOf(CH3, at.pid, at.k).text);
    await page.keyboard.press('s');
    await page.waitForSelector('#subs', { state: 'hidden' });
    await page.keyboard.press('s');
    await page.waitForSelector('#subs:not([hidden])');
    await page.keyboard.press('s');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nar:not([hidden])', { timeout: 20000 }); // ar=1 in the address
    await page.keyboard.press('d');
    await page.waitForFunction(() => document.querySelector('#layout').classList.contains('fill'));
    assert.equal(await page.locator('#subs').isHidden(), true, 'hidden, as the reader left them');
    assert.equal(await page.getAttribute('#nar-subs', 'aria-pressed'), 'false');
    await page.keyboard.press('s');
    assert.deepEqual(errors, []);
    await ctx.close();

    // 360 px: a unit of 200 characters needs five or six lines; each word said is inside the three the strip shows.
    const long = CH3.paragraphs.flatMap(p => speakable(p).units.map((u, k) => ({ p, u, k }))).find(x => x.u.text.length >= 175);
    const phone = await reading(browser, `#book=the-prince&ch=3&p=${long.p.id}`, { viewport: { width: 360, height: 780 }, context: { isMobile: true, hasTouch: true }, speech: { ms: 3000 } });
    await phone.page.keyboard.press('d');
    await phone.page.waitForSelector('#layout.fill');
    await phone.page.evaluate(() => {
      const box = document.querySelector('#subs-box');
      window.__subs = { seen: 0, out: [] };
      new MutationObserver(() => {
        const w = box.querySelector('span.on');
        if (!w) return;
        const a = w.getBoundingClientRect(), b = box.getBoundingClientRect();
        window.__subs.seen++;
        if (a.top < b.top - 1 || a.bottom > b.bottom + 1) window.__subs.out.push(w.textContent);
      }).observe(box, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    // Read from the long unit.
    await phone.page.evaluate(k => window.__narrator.at(window.__narrator.passage.pi, { k }), long.k);
    await phone.page.keyboard.press('r');
    await phone.page.waitForFunction(n => window.__subs.seen >= n - 1, long.u.words.length, { timeout: 15000 });
    await phone.page.keyboard.press('r');
    const subs = await phone.page.evaluate(() => window.__subs);
    assert.deepEqual(subs.out, [], `${subs.seen} words lit, all inside the strip`);
    assert.ok(await phone.page.evaluate(() => document.querySelector('#subs-box').scrollHeight > document.querySelector('#subs-box').clientHeight * 1.4), 'the unit needed more than the three lines');
    assert.deepEqual(phone.errors, []);
  } finally { await browser.close(); }
});

test('page: a screen of "In Vitruvian Manager" held in the pane stays while the reading goes on', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=the-prince&ch=3&p=c03-p02', { speech: { ms: 120 } });
    await page.click('#tab-vm');
    await page.locator('#era-rows li[data-key="progress"] [data-show]').click();
    const vm = await frameOf(page, '#vm-frame');
    await vm.waitForFunction(() => /\/science\/progress\//.test(location.pathname), null, { timeout: 20000 });
    await vm.evaluate(() => { window.stillHere = true; });
    assert.equal(await page.getAttribute('#nar-hold', 'aria-pressed'), 'true', 'a screen chosen by hand holds the pane');
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__spoken.length >= 10, null, { timeout: 15000 });
    await page.keyboard.press('r');
    assert.equal(await vm.evaluate(() => window.stillHere), true);
    assert.equal(await page.getAttribute('#tab-vm', 'aria-selected'), 'true');
    assert.match(page.url(), /&pane=vm&show=progress&ar=1$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: at 360 × 780 the pane is the sheet, the narrator\'s row fits, the sentence being read stays above the sheet, and nothing scrolls sideways', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=fixture-the-prince&ch=3&p=c03-p03', { fixture: true, viewport: { width: 360, height: 780 }, context: { isMobile: true, hasTouch: true }, speech: { ms: 1500 } });
    const sheet = await page.evaluate(() => { const p = document.querySelector('#pane'); return { position: getComputedStyle(p).position, top: p.getBoundingClientRect().top }; });
    assert.equal(sheet.position, 'fixed');
    const row = await page.evaluate(() => { const r = document.querySelector('#nar'); return { right: Math.max(...[...r.children].filter(c => c.offsetParent).map(c => c.getBoundingClientRect().right)), sw: r.scrollWidth, cw: r.clientWidth }; });
    assert.ok(row.right <= 360 - 15 && row.sw <= row.cw, `the row fits: ${JSON.stringify(row)}`);
    await page.click('#nar-play');
    for (let i = 0; i < 4; i++) {
      // Each new unit, once the page has scrolled to it.
      await page.waitForFunction(n => window.__spoken.length > n, i, { timeout: 5000 });
      await page.waitForTimeout(900);
      const m = await marked(page);
      assert.ok(m.bottom <= sheet.top + 1 && m.top >= m.region[0] - 1, `above the sheet: ${JSON.stringify(m)}`);
    }
    await page.click('#nar-play');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: with reduced motion the text jumps to the sentence without gliding', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=the-prince&ch=3&p=c03-p06', { context: { reducedMotion: 'reduce' }, speech: { ms: 3000 } });
    await page.evaluate(() => window.scrollTo(0, 0)); // away from the paragraph to be read
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__ys = []; const tick = () => { window.__ys.push(Math.round(scrollY)); if (window.__ys.length < 40) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.click('#nar-play');
    await page.waitForFunction(() => window.__ys.length >= 40);
    await page.click('#nar-play');
    const ys = [...new Set(await page.evaluate(() => window.__ys))];
    assert.equal(ys.length, 2, `one jump, no glide: ${ys}`);
    const m = await marked(page);
    assert.ok(m.top >= m.region[0] - 1 && m.bottom <= m.region[1], 'the sentence is in view');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the sentence\'s mark has a background that is not the canvas\'s, in light and in dark', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await reading(browser, '#book=the-prince&ch=3&p=c03-p02', { speech: { ms: 2000 } });
    await page.keyboard.press('r');
    await page.waitForFunction(() => [...(CSS.highlights.get('nc-say') || [])].length === 1);
    const look = () => page.evaluate(() => {
      const css = getComputedStyle(document.documentElement), probe = document.createElement('i');
      document.body.append(probe); probe.style.color = css.getPropertyValue('--prp-canvas').trim();
      const canvas = getComputedStyle(probe).color; probe.remove();
      return { canvas, mark: getComputedStyle(document.querySelector('#text p.para'), '::highlight(nc-say)').backgroundColor };
    });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const l = await look();
      assert.ok(l.mark && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(l.mark) && l.mark !== l.canvas, `${scheme}: ${JSON.stringify(l)}`);
    }
    await page.keyboard.press('r');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in the shell, moving the shell to another submodule pauses the narrator within one unit', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page, /\/bibliotheca\//);
    await page.addInitScript(FAKE_SPEECH, { ms: 300 });
    await page.goto(`${BASE}/#/bibliotheca/neo-classic?at=${encodeURIComponent(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p02`)}`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#frames iframe.active[data-module="neo-classic"]', { timeout: 20000 })).contentFrame();
    await frame.waitForSelector('#text p.para.current', { timeout: 20000 });
    await frame.click('#ar-toggle');
    await frame.click('#nar-play');
    await frame.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 10000 });
    await page.evaluate(() => { location.hash = '#/rs/encyclopedia'; });
    await page.waitForSelector('#frames iframe.active[data-module="encyclopedia"]', { timeout: 20000 });
    const at = await frame.evaluate(() => window.__spoken.length);
    await frame.waitForFunction(() => !window.__narrator.playing, null, { timeout: 2000 });
    await page.waitForTimeout(1200);
    assert.ok(await frame.evaluate(() => window.__spoken.length) <= at + 1, 'at most the unit it was on');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* The online voice and its allowance. */
test('page: with jdpi.doc.voice set to an online voice and the proxy ready, Play makes no request: this device\'s voice reads', PAGE, async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('jdpi.doc.voice', JSON.stringify(id)); } catch { /* none */ } }, RYAN_ID);
    const page = await ctx.newPage(), errors = watch(page);
    await page.addInitScript(FAKE_SPEECH, { ms: 120 });
    const said = await fakeProxy(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=3&p=c03-p02`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__spoken.length >= 4);
    await page.keyboard.press('r');
    assert.equal(said.length, 0, 'no request to say');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jdpi.doc.voice'))), RYAN_ID, 'Kino\'s choice is left alone');
    assert.match(await page.inputValue('#nar-voice'), /^device:/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: choosing the online voice reads nothing and shows the cost and what is left; "Read with it" makes one request a unit, never past what was allowed, and none for a paragraph it could not finish', PAGE, async () => {
  const browser = await launch();
  try {
    const ps = chapterPassages(FX3), allowed = costFrom(ps.slice(0, 2));
    const { page, errors, said } = await reading(browser, '#book=fixture-the-prince&ch=3', { fixture: true, proxy: { clip: 0.05, left: { today: allowed + 50, month: 450000 } }, speech: { ms: 120 } });
    await page.waitForSelector(`#nar-voice option[value="${RYAN_ID}"]`, { state: 'attached', timeout: 10000 });
    assert.deepEqual(await page.$$eval('#nar-voice optgroup', gs => gs.map(g => g.label)), ['This device', 'Azure (online)']);
    const at = await narAt(page);
    await page.selectOption('#nar-voice', RYAN_ID);
    await page.waitForFunction(() => !document.querySelector('#nar-offer').hidden && document.querySelector('#nar-offer').dataset.cost);
    assert.equal(said.length, 0, 'choosing reads nothing');
    const offer = await page.textContent('#nar-offer-text'), cost = costFrom(ps, at.pid, at.k);
    assert.equal(+(await page.getAttribute('#nar-offer', 'data-cost')), cost, 'the cost is the units\' own sum');
    assert.match(offer, new RegExp(`is ${cost.toLocaleString('en-GB')} characters, about \\d+ minutes?\\. About ${(allowed + 50).toLocaleString('en-GB')} are left to you today, and about 450,000 to the site this month\\. Each sentence is sent to Microsoft Azure`));
    assert.match(offer, new RegExp(`covers the first ${allowed.toLocaleString('en-GB')},`), 'to the end of the second paragraph');
    await page.click('#nar-accept');
    await page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 30000 });
    const units = ps.slice(0, 2).flatMap(p => p.units.map(u => u.text));
    assert.deepEqual(said.map(b => b.text), units, 'one request a unit, the two paragraphs allowed, nothing ahead of the third');
    assert.ok(said.every(b => b.norm === 'plain@1' && b.voice === RYAN_ID && b.private === false));
    assert.equal(said.reduce((n, b) => n + b.text.length, 0), allowed);
    assert.equal((await page.evaluate(() => window.__spoken[0])).text, ps[2].units[0].text, 'this device\'s voice reads on from the third');
    await page.waitForFunction(n => document.querySelector('#nar-msg-text').textContent.includes(`The ${n} characters you allowed have been read`), allowed.toLocaleString('en-GB'));
    await page.keyboard.press('r');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: when the proxy says the day\'s allowance is spent, this device\'s voice reads on from that unit and says so, the next paragraph asks nothing, and the row\'s offer reads online again at once', PAGE, async () => {
  const browser = await launch();
  try {
    const ps = chapterPassages(FX3);
    const { page, errors, said } = await reading(browser, '#book=fixture-the-prince&ch=3', { fixture: true, proxy: { clip: 0.05, quotaAfter: 2 }, speech: { ms: 150 } });
    await page.waitForSelector(`#nar-voice option[value="${RYAN_ID}"]`, { state: 'attached', timeout: 10000 });
    await page.selectOption('#nar-voice', RYAN_ID);
    await page.waitForFunction(() => !document.querySelector('#nar-accept').disabled);
    await page.click('#nar-accept');
    await page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 20000 });
    assert.equal((await page.evaluate(() => window.__spoken[0])).text, ps[0].units[2].text, 'from the unit the proxy refused');
    await page.waitForFunction(() => /today’s allowance/.test(document.querySelector('#nar-msg-text').textContent));
    await page.waitForFunction(id => window.__narrator.passage?.id === id, ps[1].id, { timeout: 20000 });
    await page.waitForTimeout(500);
    assert.equal(said.length, 3, 'two read, one refused, and nothing for the next paragraph');
    await page.waitForSelector('#nar-again:not([hidden])');
    assert.match(await page.textContent('#nar-again'), /^Read on with Ryan \(online\): [\d,]+ characters$/);
    // The proxy has its allowance back: the one press reads online again at once, not with the device's voice.
    await page.unroute('**/api/voice/v1/say');
    const again = [];
    await page.route('**/api/voice/v1/say', route => { again.push(route.request().postDataJSON().text); return route.fulfill({ status: 200, body: Buffer.from(globalThis.PRPVoice.silentWav(0.05)), headers: { 'content-type': 'audio/wav', 'x-prp-voice-duration': '0.05' } }); });
    const spoke = await spokenN(page);
    await page.click('#nar-again');
    const at = await narAt(page);
    await page.waitForFunction(() => window.__narrator.voiceKind === 'stream');
    await new Promise(r => setTimeout(r, 800));
    assert.ok(again.length >= 1, 'the online voice asked');
    assert.equal(again[0], unitOf(FX3, at.pid, at.k).text, 'from the unit being read');
    assert.ok(await spokenN(page) <= spoke + 1, 'and the device voice stopped');
    await page.keyboard.press('r');
    // (The browser reports the proxy's 429 as a resource that failed to load: that is the answer the test played.)
    assert.deepEqual(errors.filter(e => !/status of 429/.test(e)), []);
  } finally { await browser.close(); }
});

test('page: at the next chapter no request is made and the row offers the new chapter\'s cost', PAGE, async () => {
  const browser = await launch();
  try {
    const { page, errors, said } = await reading(browser, '#book=fixture-the-prince&ch=1', { fixture: true, proxy: { clip: 0.05 }, speech: { ms: 120 } });
    await page.waitForSelector(`#nar-voice option[value="${RYAN_ID}"]`, { state: 'attached', timeout: 10000 });
    await page.selectOption('#nar-voice', RYAN_ID);
    await page.waitForFunction(() => !document.querySelector('#nar-accept').disabled);
    await page.click('#nar-accept');
    const asked = said.voices;
    await page.waitForFunction(() => /&ch=3\b/.test(location.hash), null, { timeout: 30000 });
    await page.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 20000 });
    assert.deepEqual(said.map(b => b.text), chapterPassages(FX1).flatMap(p => p.units.map(u => u.text)), 'chapter I online, and nothing of chapter III');
    await page.waitForSelector('#nar-again:not([hidden])');
    assert.equal(said.voices, asked + 1, 'the proxy is asked afresh what is left for the new chapter\'s offer');
    await page.keyboard.press('r');
    const ps = chapterPassages(FX3), at = await narAt(page);
    assert.equal(await page.textContent('#nar-again'), `Read on with Ryan (online): ${costFrom(ps, at.pid, at.k).toLocaleString('en-GB')} characters`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: with no voice on the device Play is off and says why, and no request is made; a voice the browser lists after a second turns Play on', PAGE, async () => {
  const browser = await launch();
  try {
    const none = await reading(browser, '#book=fixture-the-prince&ch=3', { fixture: true, proxy: {}, speech: { voices: 0 } });
    await none.page.waitForFunction(() => document.querySelector('#nar-play').disabled, null, { timeout: 5000 });
    assert.match(await none.page.textContent('#nar-msg-text'), /This browser has no voice of its own\. Choose an online voice to hear the book\./);
    await none.page.keyboard.press('r');
    await none.page.waitForTimeout(500);
    assert.equal(none.said.length, 0);
    assert.deepEqual(none.errors, []);
    await none.ctx.close();
    const late = await reading(browser, '#book=fixture-the-prince&ch=3', { fixture: true, speech: { late: 1000 } });
    await late.page.waitForTimeout(2000);
    assert.equal(await late.page.locator('#nar-play').isDisabled(), false, 'Play is on');
    await late.page.click('#nar-play');
    await late.page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 5000 });
    await late.page.click('#nar-play');
    assert.deepEqual(late.errors, []);
  } finally { await browser.close(); }
});

test('page: Bibliotheca shown in another page\'s pane (a frame named prp-side) offers no AR Reader', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`${BASE}/registry.json`);
    await page.setContent(`<iframe name="prp-side" style="width:1200px;height:800px" src="${BASE}/bibliotheca/neo/#book=the-prince&ch=3"></iframe>`);
    const f = await (await page.waitForSelector('iframe')).contentFrame();
    await f.waitForSelector('#text p.para', { timeout: 20000 });
    assert.equal(await f.evaluate(() => window.name), 'prp-side');
    assert.equal(await f.locator('#ar-toggle').isHidden(), true);
    await f.locator('#chapter-title').click(); // focus into the frame
    await page.keyboard.press('a');
    await page.waitForTimeout(300);
    assert.equal(await f.locator('#nar').isHidden(), true, 'A does nothing there');
    assert.doesNotMatch(await f.evaluate(() => location.hash), /ar=1/);
  } finally { await browser.close(); }
});

/* ---------- The review's findings (R1, R2, B1, F1, B2) ---------- */
test('page: a jump lands its paragraph 12 px under the head, whose fade is inside its own height; the pane runs to its border', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
    const errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=7&p=c07-p01`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para.current', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.prp-returnbar', { state: 'attached', timeout: 8000 }).catch(() => {});
    // R1: the head's fade (::after, 12 px with a -12 px margin) counts in its height, as before the mode's button asked
    // the head's width: the head is not a container (that would lay it out on its own and leave the fade outside).
    // The head's last line is the progress row; under it, inside the head, the 12 px fade.
    const head = await page.evaluate(() => { const h = document.querySelector('#head'); return { container: getComputedStyle(h).containerType, fade: h.getBoundingClientRect().bottom - document.querySelector('.nc-progress-row').getBoundingClientRect().bottom, nc: getComputedStyle(document.documentElement).getPropertyValue('--nc-head').trim(), offset: h.offsetHeight }; });
    assert.equal(head.container, 'normal', 'the head is not a container');
    assert.ok(head.fade >= 11.5 && head.fade <= 12.5, `the fade is inside the head: ${JSON.stringify(head)}`);
    assert.equal(head.nc, `${head.offset}px`);
    // J (with reduced motion, so the jump is not a glide): 12 px under the head and its fade, 24 under its last line.
    await page.keyboard.press('j');
    await page.waitForFunction(() => /&p=c07-p02/.test(location.hash));
    const at = await page.evaluate(() => ({ p: document.getElementById('c07-p02').getBoundingClientRect().top, head: document.querySelector('#head').getBoundingClientRect().bottom, line: document.querySelector('.nc-progress-row').getBoundingClientRect().bottom }));
    assert.ok(at.p - at.head >= 11 && at.p - at.head <= 13, `12 px under the head and its fade: ${JSON.stringify(at)}`);
    assert.ok(at.p - at.line >= 23, `clear of the fade: ${JSON.stringify(at)}`);
    // R2: with the pane beside the text, its head, tabs and frame start at its border: Kino's gutter for its divider is
    // not Bibliotheca's, whose divider lies over the border.
    await page.evaluate(() => { location.hash = '#book=the-prince&ch=7&p=c07-p02&t=Q1399&pane=ency'; });
    await page.waitForSelector('#pane:not([hidden])');
    const pane = await page.evaluate(() => { const p = document.querySelector('#pane'), r = p.getBoundingClientRect(); return { dir: document.querySelector('#layout').dataset.dir, pad: getComputedStyle(p).paddingLeft, head: document.querySelector('.nc-pane-head').getBoundingClientRect().left - r.left, frame: document.querySelector('#ency-frame').getBoundingClientRect().left - r.left }; });
    assert.equal(pane.dir, 'row');
    assert.equal(pane.pad, '0px');
    assert.ok(pane.head <= 1.5 && pane.frame <= 1.5, `no gutter inside the border: ${JSON.stringify(pane)}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in a frame 1,094 px wide (the shell at 1366 × 768) the pane is beside the text, not a sheet under it; under 1,000 px it is the sheet', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [width, height, beside] of [[1094, 716, true], [1000, 716, true], [999, 716, false]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = watch(page);
      await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=7&p=c07-p02&t=Q1399&pane=ency`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#pane:not([hidden])', { timeout: 20000 });
      await page.waitForSelector('#text p.para.current', { timeout: 20000 });
      const m = await page.evaluate(() => {
        const p = document.querySelector('#pane').getBoundingClientRect(), t = document.querySelector('#text').getBoundingClientRect();
        return { dir: document.querySelector('#layout').dataset.dir, position: getComputedStyle(document.querySelector('#pane')).position, pane: p.width, text: t.width, beside: p.left >= t.right, scroll: document.documentElement.scrollWidth <= innerWidth };
      });
      if (beside) {
        assert.deepEqual([m.dir, m.position, m.beside], ['row', 'sticky', true], `${width}: ${JSON.stringify(m)}`);
        assert.ok(m.text >= 420 && m.pane >= 380, `${width}: the text at least 420 px and the pane 380: ${JSON.stringify(m)}`);
      } else assert.deepEqual([m.dir, m.position], ['column', 'fixed'], `${width}: the sheet: ${JSON.stringify(m)}`);
      assert.ok(m.scroll, `${width}: nothing scrolls sideways`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('page: "In Vitruvian Manager" frames only what the shell would: a private page is a card with its link, and a page without the connector leaves the pane', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = watch(page);
    const asked = [];
    page.on('request', r => { if (/trade-desk|cloudflareaccess/.test(r.url())) asked.push(r.url()); });
    const reg = read('registry.json'), tally = reg.suites.flatMap(s => s.modules).find(m => m.id === 'tally-stick');
    // Machiavelli's entry (shard 375) with two more mentions: Tally Stick (private) and an Invention Timeline page that is missing.
    await page.route('**/lake/data/e/375.json', async route => {
      const json = await (await route.fetch()).json();
      json.Q1399 = { ...json.Q1399, mentions: [{ m: 'tally-stick', u: tally.url, c: 'A private page' }, { m: 'progress', u: 'https://jdpi.pages.dev/science/progress/index.html#y=1513&f=1494', c: 'A missing page' }, ...json.Q1399.mentions] };
      return route.fulfill({ json });
    });
    await page.route(url => /^\/science\/progress\/(index\.html)?$/.test(url.pathname), route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Not here</title><p>Not here.</p>' }));
    await page.goto(`${BASE}/bibliotheca/neo/#book=the-prince&ch=7&p=c07-p01&t=Q1399&pane=vm&show=m0`, { waitUntil: 'domcontentloaded' });
    const card = await page.waitForSelector('#panel-vm .prp-side-card[data-why="private"]', { timeout: 20000 });
    assert.match(await card.textContent(), /Tally Stick is private/);
    assert.equal(await card.$eval('a', a => [a.href, a.target].join(' ')), `${tally.url} _blank`, 'its link instead');
    assert.equal(await page.locator('#vm-frame').isHidden(), true);
    assert.notEqual(await page.getAttribute('#vm-frame', 'data-url'), tally.url, 'never framed');
    // The missing page: shown, found to have no connector, and its frame emptied.
    await page.click('#mention-rows li[data-key="m1"] [data-show]');
    await page.waitForSelector('#panel-vm .prp-side-card[data-why="missing"]', { timeout: 20000 });
    assert.equal(await page.locator('#vm-frame').isHidden(), true);
    await page.waitForFunction(() => document.querySelector('#vm-frame').dataset.url === 'about:blank');
    // A screen that can be framed still is.
    await page.click('#era-rows li[data-key="kardashev"] [data-show]');
    await page.waitForSelector('#vm-frame:not([hidden])');
    assert.equal(await page.locator('#panel-vm .prp-side-card').count(), 0);
    assert.deepEqual(asked, [], 'nothing was asked of the private page');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in Screens only the book\'s picture and the screens for its era take their turn with the entries, unheld; Hold keeps a screen', PAGE, async () => {
  const browser = await launch();
  try {
    // On War, Book I chapter IV: a chapter that names no term, so only pictures and screens can have the pane.
    const { page, errors } = await reading(browser, '#book=on-war&ch=104', { speech: { ms: 400 } });
    await page.keyboard.press('d');
    await page.waitForSelector('#layout.fill');
    await page.keyboard.press('r');
    // The chapter's picture comes first, drawn by Kino's stage, and says what it is.
    await page.waitForSelector('#picture:not([hidden])', { timeout: 30000 });
    assert.equal(await page.getAttribute('#picture-stage', 'data-key'), 'picture:0');
    assert.match(await page.textContent('#picture-cap'), /^The wars of 1792 to 1815 · a picture made for On War$/);
    assert.equal(await page.textContent('#pane-kicker'), 'AR Reader · A picture for the book');
    assert.equal(await page.locator('#picture-stage .kn-layer').count(), 1);
    assert.equal(await page.locator('#nar-hold').isDisabled(), true, 'a picture passes by itself');
    // Then a screen for the book's era, in its own frame on the Master Index tab: not held, not in the address.
    await page.waitForSelector('#tour-frame:not([hidden])', { timeout: 30000 });
    const screen = await page.evaluate(() => ({ url: document.querySelector('#tour-frame').dataset.url, key: document.querySelector('#tour-frame').dataset.key, picture: document.querySelector('#picture').hidden, kicker: document.querySelector('#pane-kicker').textContent, hash: location.hash }));
    assert.match(screen.url, /\/(science\/progress|kardashev)\/index\.html#y=/);
    assert.equal(screen.picture, true);
    assert.equal(screen.kicker, 'AR Reader · Vitruvian Manager');
    assert.doesNotMatch(screen.hash, /pane=vm|show=/);
    assert.match(screen.hash, /pane=ency/);
    // Hold keeps it: the other tab, with the screen named in the address.
    await page.keyboard.press('r');
    await page.keyboard.press('h');
    await page.waitForFunction(k => location.hash.includes(`pane=vm&show=${encodeURIComponent(k)}`) || location.hash.includes(`pane=vm&show=${k}`), screen.key);
    await page.waitForSelector('#vm-frame:not([hidden])');
    assert.equal(await page.locator('#tour-frame').isHidden(), true);
    // Screens only off: no picture or screen is left running.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#picture').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the Manifesto names both its authors and counts its four sections; Böhm-Bawerk\'s books name the scan and the transcription their text was checked against', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = watch(page);
    await page.goto(`${BASE}/bibliotheca/neo/#book=communist-manifesto&ch=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#text p.para', { timeout: 20000 });
    assert.match(await page.locator('#byline').innerText(), /^Karl Marx \(1818–1883\) and Frederick Engels, translated by Samuel Moore \(edition of 1908\)$/);
    assert.match(await page.locator('#book-meta').innerText(), /4 sections and the preface and preamble/);
    assert.match(await page.locator('#sources').innerText(), /Manifesto of the Communist Party by Karl Marx and Frederick Engels, translated by Samuel Moore \(1908\): Project Gutenberg pg31193/);
    assert.match(await page.locator('#shelf option[value="communist-manifesto"]').innerText(), /Karl Marx and Frederick Engels \(1848\)/);
    // Engels's notes stand after the paragraphs that cite them, his first, on the section's title, first.
    assert.equal(await page.locator('#c01-n01').count(), 1);
    assert.match(await page.locator('#c01-p02').innerText(), /^The history of all hitherto existing society\[?2\]? is the history of class struggles\.$/);
    for (const [slug, id] of [['capital-and-interest', 'capitalinterestc00bhuoft'], ['positive-theory-of-capital', 'positivetheoryof00bhuoft']]) {
      await page.goto(`${BASE}/bibliotheca/neo/#book=${slug}&ch=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(s => document.querySelector('#shelf')?.value === s && document.querySelector('#text p.para'), slug, { timeout: 20000 });
      const sources = await page.locator('#sources').innerText();
      assert.match(sources, new RegExp(`Internet Archive ${id}`), `${slug}: the scan`);
      assert.match(sources, /Econlib’s transcription of the same edition[\s\S]*public domain/, `${slug}: the transcription`);
      assert.match(sources, /William Smart on 19 March 1915/, `${slug}: the rights`);
      assert.match(await page.locator('#byline').innerText(), /^Eugen von Böhm-Bawerk \(1851–1914\), translated by William Smart/);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: in Screens the new books show their pictures: the Marx film\'s scene for the Manifesto, the timeline made for Capital and Interest', PAGE, async () => {
  const browser = await launch();
  try {
    for (const [hash, cap] of [['#book=communist-manifesto&ch=1', /\S · /], ['#book=capital-and-interest&ch=101', /^The theories of interest the book reviews, 1766 to 1884 · a picture made for Capital and Interest$/]]) {
      const { ctx, page, errors } = await reading(browser, hash, { speech: { ms: 400 } });
      await page.keyboard.press('d');
      await page.waitForSelector('#layout.fill');
      await page.keyboard.press('r');
      await page.waitForSelector('#picture:not([hidden])', { timeout: 60000 });
      assert.match(await page.getAttribute('#picture-stage', 'data-key'), /^picture:\d+$/, hash);
      assert.match(await page.textContent('#picture-cap'), cap, hash);
      assert.equal(await page.textContent('#pane-kicker'), 'AR Reader · A picture for the book');
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, [], hash);
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// ---- The second shelf of 7 November 2026: three books read from scans alone, against a second scan.
test('page: the scan-read books name their scans, their witnesses and, where a translator\'s death date was not found, say so', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = watch(page);
    for (const [slug, id, witness, byline, rights] of [
      ['origin-of-money', 'sim_economic-journal_march-december-1892_2_5-8', 'economicjournal00socigoog', /^Carl Menger \(1840–1921\), translated by Caroline A\. Foley \(edition of 1892\)$/, /Caroline Rhys Davids\), on 26 June 1942/],
      ['karl-marx-and-the-close-of-his-system', 'karlmarxcloseofh0000euge', 'karlmarxandclos00macdgoog', /^Eugen von Böhm-Bawerk \(1851–1914\), translated by Alice M\. Macdonald \(edition of 1898\)$/, /death date of Alice M\. Macdonald not having been found after a reasonable search/],
      ['natural-value', 'naturalvalue00wiesiala', 'naturalvalue00smargoog', /^Friedrich von Wieser \(1851–1926\), translated by Christian A\. Malloch \(edition of 1893\)$/, /death date of Christian A\. Malloch not having been found after a reasonable search/]]) {
      await page.goto(`${BASE}/bibliotheca/neo/#book=${slug}&ch=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(s => document.querySelector('#shelf')?.value === s && document.querySelector('#text p.para'), slug, { timeout: 20000 });
      const sources = await page.locator('#sources').innerText();
      assert.match(sources, new RegExp(`Internet Archive ${id}`), `${slug}: the scan`);
      assert.match(sources, new RegExp(`OCR of a second (?:copy|scan)[\\s\\S]*${witness}[\\s\\S]*No transcription is used`), `${slug}: the witness`);
      assert.doesNotMatch(sources, /Econlib’s transcription/, `${slug}: no transcription`);
      assert.match(sources, rights, `${slug}: the rights`);
      assert.match(await page.locator('#byline').innerText(), byline, `${slug}: byline`);
    }
    assert.match(await page.locator('#book-meta').innerText(), /Public domain US · UK on a reasonable search/, 'the badge says what the finding rests on');
    await page.goto(`${BASE}/bibliotheca/neo/#book=origin-of-money&ch=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#shelf')?.value === 'origin-of-money' && document.querySelector('#text p.para'), null, { timeout: 20000 });
    assert.match(await page.locator('#book-meta').innerText(), /9 sections/);
    assert.match(await page.locator('#book-meta').innerText(), /Public domain US · UK(?! on)/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Jude, 12 November 2026: on a phone the AR Reader button (Augmented Reading until 15 November) no longer shortens the chapter's title. It has a row
// of its own under the title, in words, with the same name and key; the title shows in full. Wider, nothing changes.
test('page: at 360 wide the AR Reader button has its own row under the title, in words, and the title is whole; at 1366 it stays in the title\'s row', PAGE, async () => {
  const browser = await launch();
  try {
    const head = page => page.evaluate(() => {
      const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
      const t = document.querySelector('#chapter-name'), ar = document.querySelector('#ar-toggle');
      const others = [...document.querySelectorAll('.nc-chapter-row > *')].filter(e => e !== ar && e.offsetParent).map(e => e.getBoundingClientRect());
      const a = ar.getBoundingClientRect();
      return { title: box('#chapter-title'), ar: box('#ar-toggle'), whole: t.scrollWidth <= t.clientWidth + 1,
        shares: others.some(r => r.top < a.bottom - 1 && r.bottom > a.top + 1), words: ar.querySelector('.lbl').getBoundingClientRect().width > 0 ? ar.querySelector('.lbl').textContent : '',
        sw: document.documentElement.scrollWidth };
    });
    // Chapter XVIII's title is the longest in The Prince: it shortened to "Concer…" at 360 before.
    const phone = await reading(browser, '#book=the-prince&ch=18', { viewport: { width: 360, height: 780 }, context: { isMobile: true, hasTouch: true }, ar: false });
    const p = await head(phone.page);
    assert.ok(p.whole, `the title is whole: ${JSON.stringify(p)}`);
    assert.ok(p.ar.top >= p.title.bottom, `the button is under the title: ${JSON.stringify(p)}`);
    assert.equal(p.shares, false, 'nothing else shares its row');
    assert.equal(p.words, 'AR Reader', 'its label in words');
    assert.ok(p.ar.left >= 16 && p.ar.right <= 344, `inside the column: ${JSON.stringify(p.ar)}`);
    assert.equal(p.sw, 360, 'no sideways scroll');
    assert.equal(await phone.page.getByRole('button', { name: 'AR Reader', exact: true }).count(), 1, 'its accessible name');
    await phone.page.keyboard.press('a');
    await phone.page.waitForSelector('#nar:not([hidden])');
    assert.equal(await phone.page.getAttribute('#ar-toggle', 'aria-pressed'), 'true', 'A still turns it on');
    const on = await head(phone.page);
    assert.ok(on.whole && on.ar.top >= on.title.bottom && on.sw === 360, `on, the head still holds: ${JSON.stringify(on)}`);
    assert.deepEqual(phone.errors, []);
    await phone.ctx.close();
    const desk = await reading(browser, '#book=the-prince&ch=18', { ar: false });
    const d = await head(desk.page);
    assert.ok(d.ar.top < d.title.bottom && d.ar.bottom > d.title.top, `1366: in the title's row, as before: ${JSON.stringify(d)}`);
    assert.deepEqual(desk.errors, []);
    await desk.ctx.close();
  } finally { await browser.close(); }
});

// Jude, 13 November 2026: every chapter title shows in full at every width. Wider than a phone the head used to cut the
// longest short (The Prince, chapter XVIII, at 1366: a box of about 282 px for a title of about 415); the title now takes
// a second line there, the buttons stay in its row, centred beside it, and a title that fits keeps the 36 px row. The
// phone layout of 12 November does not change.
test('page: every chapter title is whole: chapter XVIII wraps at 1024, 1366 and 1920 with the buttons beside it; a short title keeps its row; the phone layout holds', PAGE, async () => {
  const browser = await launch();
  try {
    const head = page => page.evaluate(() => {
      const box = e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 }; };
      const t = document.querySelector('#chapter-name'), title = box(document.querySelector('#chapter-title'));
      const row = document.querySelector('.nc-chapter-row');
      const buttons = [...row.children].filter(e => e.id !== 'chapter-title' && e.offsetParent).map(e => ({ id: e.id, ...box(e) }));
      const lh = parseFloat(getComputedStyle(t).lineHeight);
      return { whole: t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1, lines: Math.round(t.getBoundingClientRect().height / lh), title, buttons,
        row: row.getBoundingClientRect().height, headVar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nc-head')),
        headH: document.querySelector('#head').offsetHeight, sw: document.documentElement.scrollWidth, w: innerWidth };
    });
    // Since BI-21 the column is wide with AR Mode shut, where the title may fit one line; with AR Mode open (the pane
    // beside the text) the column is the 66ch one, and the longest title wraps.
    for (const width of [1024, 1366, 1920]) {
      const { ctx, page, errors } = await reading(browser, '#book=the-prince&ch=18&pane=terms', { viewport: { width, height: 768 }, ar: false });
      const h = await head(page);
      const at = `${width} wide: ${JSON.stringify(h)}`;
      assert.ok(h.whole, `the title is whole, ${at}`);
      assert.ok(h.lines >= 2, `on more than one line, ${at}`);
      // Every button is in the title's row, centred beside it, after it (the contents button before it), and in view.
      for (const b of h.buttons) {
        assert.ok(Math.abs(b.mid - h.title.mid) <= 1, `${b.id} is centred on the title, ${at}`);
        assert.ok(b.id === 'toc-toggle' ? b.right <= h.title.left : b.left >= h.title.right, `${b.id} is beside the title, not over it, ${at}`);
        assert.ok(b.left >= 0 && b.right <= h.w, `${b.id} is on screen, ${at}`);
      }
      assert.equal(h.sw, width, `no sideways scroll, ${at}`);
      assert.equal(h.headVar, h.headH, `the page knows the head's height, so a jump lands below it, ${at}`);
      assert.equal(await page.getByRole('button', { name: 'AR Reader', exact: true }).count(), 1, 'the mode\'s button keeps its name');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // A short title is one line in a 36 px row, as before.
    const short = await reading(browser, '#book=the-prince&ch=3', { ar: false });
    const s = await head(short.page);
    assert.ok(s.whole && s.lines === 1 && s.row === 36, `chapter III: ${JSON.stringify(s)}`);
    assert.deepEqual(short.errors, []);
    await short.ctx.close();
    // The phone layout of 12 November: the title whole beside the contents button, the arrows and AR Mode (the terms
    // and Links until 15 November) on the next row, and the AR Reader button on its own row under them.
    const phone = await reading(browser, '#book=the-prince&ch=18', { viewport: { width: 360, height: 780 }, context: { isMobile: true, hasTouch: true }, ar: false });
    const p = await head(phone.page);
    const by = id => p.buttons.find(b => b.id === id);
    assert.ok(p.whole, `the title is whole: ${JSON.stringify(p)}`);
    assert.ok(Math.abs(by('toc-toggle').mid - p.title.mid) <= 1, 'the contents button beside the title');
    for (const id of ['prev', 'next', 'pane-toggle']) assert.ok(by(id).top >= p.title.bottom && by(id).bottom <= by('ar-toggle').top, `${id} on the row under the title`);
    assert.ok(by('ar-toggle').left >= 16 && by('ar-toggle').right <= 344, 'the mode\'s button on its own row, inside the column');
    assert.equal(p.sw, 360, 'no sideways scroll');
    assert.deepEqual(phone.errors, []);
    await phone.ctx.close();
  } finally { await browser.close(); }
});
