// Review of MI-14 (primary and secondary sources), the pages lens, 22 November 2026: three findings (P2, P3, P1), each a
// test that failed on the working tree as the builders left it and passes since the fixer's mends. In package.json's
// list since then; alone:
//   PRP_PAGES=0 node --test tests/review-mi14-pages.test.mjs      (the two unit findings)
//   npm run test:e2e -- tests/review-mi14-pages.test.mjs           (and the page finding, in Edge, muted)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDING, FLAGS } from '../bibliotheca/lib/sources.js';
import { applySourceLinks } from '../lake/scripts/source-links.mjs';
import { pageTest, launch } from './tools/pages.mjs';

// 1. The rule's paragraph says what the notes mean, but it types them again rather than reading WORDING.flag, and it
//    leaves one out ("the author’s relation to it is not known"): a later link with that note would show words the
//    paragraph never explains.
test('review: the rule’s paragraph names every note a page can show, in the table’s own words', () => {
  for (const id of Object.keys(FLAGS)) assert.ok(WORDING.about.includes(WORDING.flag[id]), `${id}: “${WORDING.flag[id]}” is not in the paragraph`);
});

// 2. A part by another hand that the shelf holds in one volume of a set (part.book) is marked on every volume's line on
//    the subject's entry, because the build gives it the whole set's volumes.
test('review: a part by another hand in one volume of a set is marked on that volume only', () => {
  const shelf = { books: [
    { slug: 'set-1', title: 'A Set, Volume I', set: { slug: 'a-set', title: 'A Set', volume: 1, volumes: 2 } },
    { slug: 'set-2', title: 'A Set, Volume II', set: { slug: 'a-set', title: 'A Set', volume: 2, volumes: 2 } },
  ] };
  const file = { judged: '2026-11-22', links: [{
    work: 'a-set', wq: null, part: { ch: 0, heading: 'Editor’s preface', by: 'An Editor', book: 'set-2' },
    subject: { q: 'Q9', label: 'An Author', kind: 'person' }, tag: 'secondary', basis: 'FROMOTHERS', flags: [],
    evidence: 'The editor’s preface to the second volume tells the author’s life from others’ accounts.', source: [{ book: 'set-2', ch: 0 }],
    confidence: 'medium', why: 'The set is the author’s own work.', judged: '2026-11-22', entry: true }] };
  const records = new Map([['Q9', { q: 'Q9', label: 'An Author', type: 'person', tags: ['Type:Person'], mentions: [] }]]);
  applySourceLinks(records, { file, shelf, chapter: () => null });
  const [x] = records.get('Q9').src;
  assert.equal(x.book, 'set-2');
  assert.deepEqual(x.vols, ['set-2'], 'the encyclopedia marks every appearance whose book is in vols');
});

// 3. Neo Book inside the VM shell: a plain click on a subject in "Primary and secondary sources" loads the whole shell
//    inside Neo Book's frame (the link is the shell's route, with no target), instead of moving the shell to the entry.
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('review page: in the shell, a source subject in Neo Book moves the shell to its entry, not a shell into the frame', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const at = encodeURIComponent(`${BASE}/bibliotheca/neo/index.html#book=on-war`);
  await page.goto(`${BASE}/#/bibliotheca/neo-classic?at=${at}`, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { await page.waitForTimeout(500); frame = page.frames().find(f => f.url().startsWith(`${BASE}/bibliotheca/neo`)); }
  assert.ok(frame, 'Neo Book opens in the shell');
  await frame.waitForSelector('#book-srcs:not([hidden])', { state: 'attached', timeout: 30000 });
  await frame.locator('#book-srcs').scrollIntoViewIfNeeded();
  await frame.locator('#book-srcs > summary').click();
  const subject = frame.locator('#book-srcs [data-q="Q78994"] a.nc-src-subj').first();
  await subject.waitFor({ timeout: 15000 });
  await subject.click();
  await page.waitForTimeout(3000);
  const nested = page.frames().filter(f => f !== page.mainFrame() && /\/#\//.test(f.url()));
  assert.deepEqual(nested.map(f => f.url()), [], 'no shell is loaded inside a frame');
  assert.match(decodeURIComponent(page.url()), /encyclopedia\/index\.html#Q78994/, 'the shell itself moves to the entry');
  await context.close();
});
