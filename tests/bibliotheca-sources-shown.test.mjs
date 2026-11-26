// Primary and secondary sources (ledger MI-14), where a reader and an outside reader meet them: the lake's build
// reading bibliotheca/data/source-links.json (lake/scripts/source-links.mjs) onto a subject's Master Index entry and a
// work's own entry, the citations in plain words (bibliotheca/lib/sources.js cite), the committed lake held to the
// file as it is today, the catalogue's dataset, the MCP server's get_entity and their documents; then, with JDPI_URL
// set, the Master Index entry page and Neo Book's book side in a browser, in both themes, 1440 and 390 wide.
// PRP_PAGES=0 leaves the browser tests out. The rule and the file themselves are tests/bibliotheca-sources.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, normalize, resolve, dirname, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WORDING, plain, isShown, cite, nameMap, readerTexts, linksFrom } from '../bibliotheca/lib/sources.js';
import { applySourceLinks, readSourceLinks, SOURCE_GROUPS } from '../lake/scripts/source-links.mjs';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = p => readFileSync(join(ROOT, p), 'utf8');
const read = p => JSON.parse(text(p));
const ID = /\b(?:ACT|PART|WIT|OWN|BORNAFTER|FROMOTHERS|OUTSIDE|RETROSPECTIVE|CONTEMPORARY|UNKNOWN|FORERUNNER|POLEMIC|AS-TOLD-TO|DISPUTED)\b|\bQ\d+\b|\bP\d+\b/;
const clone = o => JSON.parse(JSON.stringify(o));

// ---- Fixtures: a shelf of two books (one a set of two volumes), their links, and a small lake.
const SHELF = { books: [
  { slug: 'a-history', title: 'A History', author: 'An Author' },
  { slug: 'set-1', title: 'A Set, Volume I', author: 'A Writer', set: { slug: 'a-set', title: 'A Set', volume: 1, volumes: 2 } },
  { slug: 'set-2', title: 'A Set, Volume II', author: 'A Writer', set: { slug: 'a-set', title: 'A Set', volume: 2, volumes: 2 } },
] };
const HEADINGS = { 'a-history': { 0: 'Preface', 7: 'Chapter VII' }, 'set-2': { 401: 'Book IV, Chapter I' } };
const chapter = (book, ch) => HEADINGS[book]?.[ch] ?? null;
const link = over => ({
  work: 'a-history', wq: 'Q100', part: null, subject: { q: 'Q1', label: 'A war', kind: 'happening' }, tag: 'primary', basis: 'PART', flags: [],
  evidence: 'The author says in chapter VII that he commanded a fleet in the war.', source: [{ book: 'a-history', ch: 7 }, { wd: 'Q9', p: 'P607', v: 'Q1' }],
  dates: { born: [-460, 'Q9', 'P569'], died: [-395, 'Q9', 'P570'], start: [-431, 'Q1', 'P580'], end: [-404, 'Q1', 'P582'] },
  confidence: 'high', why: 'The book is the history of this war.', judged: '2026-11-22', entry: true, ...over,
});
const FILE = { judged: '2026-11-22', links: [
  link(),
  link({ subject: { q: 'Q9', label: 'An Author', kind: 'person' }, basis: 'OWN', dates: undefined, evidence: 'Wikidata names him as the author, and he says so in his preface.', source: [{ wd: 'Q100', p: 'P50', v: 'Q9' }, { book: 'a-history', ch: 0 }] }),
  link({ subject: { q: 'Q2', label: 'a school', kind: 'idea' }, tag: null, basis: null, flags: [{ id: 'POLEMIC' }], dates: undefined, confidence: 'medium', evidence: 'Chapter VII attacks the school as a contemporary of its founders.', source: [{ book: 'a-history', ch: 7 }] }),
  link({ subject: { q: 'Q3', label: 'a doctrine', kind: 'idea' }, tag: null, basis: null, confidence: 'low', held: 'Only a hand-made tag says so.', evidence: 'Nothing in the text uses the name of the doctrine.', source: [{ lake: 'Q9', tag: 'School:A doctrine' }], dates: undefined }),
  link({ part: { ch: 0, heading: 'Preface', by: 'An Editor', byq: 'Q8' }, subject: { q: 'Q9', label: 'An Author', kind: 'person' }, tag: 'secondary', basis: 'BORNAFTER', evidence: 'The editor was born long after the author died.', source: [{ wd: 'Q8', p: 'P569' }, { wd: 'Q9', p: 'P570' }], dates: { born: [1850, 'Q8', 'P569'], end: [-395, 'Q9', 'P570'] }, confidence: 'high' }),
  link({ work: 'a-set', wq: 'Q200', subject: { q: 'Q4', label: 'a trade', kind: 'idea' }, tag: 'secondary', basis: 'OUTSIDE', dates: undefined, confidence: 'medium', evidence: 'Book IV describes the trade and attacks it as a critic.', source: [{ book: 'set-2', ch: 401 }] }),
  link({ subject: { q: 'Q5', label: 'a battle with no entry', kind: 'happening' }, entry: false }),
] };
const rec = (q, label, extra = {}) => ({ q, label, type: 'conflict', tags: ['Type:War or conflict'], mentions: [], total: 0, ...extra });
const LAKE = () => new Map([
  ['Q1', rec('Q1', 'A war')], ['Q2', rec('Q2', 'A school', { type: 'idea', tags: ['Type:Idea or school of thought'] })],
  ['Q3', rec('Q3', 'A doctrine', { type: 'idea' })], ['Q4', rec('Q4', 'A trade', { type: 'topic' })],
  ['Q9', rec('Q9', 'An Author', { type: 'person', tags: ['Type:Person'] })], ['Q100', rec('Q100', 'A History', { type: 'topic', tags: ['Type:Topic'] })],
]);
const CTX = { file: FILE, shelf: SHELF, chapter };

test('the wording table names every Wikidata property a link cites, and its new sentences are plain', () => {
  const file = read('bibliotheca/data/source-links.json');
  const props = new Set(file.links.flatMap(l => l.source.filter(s => s.wd).map(s => s.p)));
  for (const p of props) assert.ok(WORDING.property[p], `${p} has its Wikidata label`);
  for (const g of Object.values(WORDING.group)) assert.ok(g);
  assert.deepEqual(SOURCE_GROUPS, ['Primary source on', 'Secondary source on']);
  for (const s of readerTexts()) { assert.doesNotMatch(s, ID, s); assert.doesNotMatch(s, /'/, s); }
  for (const s of [WORDING.notNamed, WORDING.notNamedNote, WORDING.what, WORDING.noted, WORDING.read('2026-11-22')]) assert.ok(readerTexts().includes(s), `readerTexts() holds ${s}`);
  assert.equal(WORDING.read('2026-11-22'), 'Wikidata as read on 22 November 2026');
});

test('cite: a Wikidata statement, a chapter of a book, a collection and a tag, in words, with their links', () => {
  const names = nameMap(FILE, SHELF);
  assert.equal(names.get('Q9'), 'An Author'); assert.equal(names.get('Q8'), 'An Editor'); assert.equal(names.get('Q100'), 'A History'); assert.equal(names.get('Q200'), 'A Set');
  const ctx = { name: q => names.get(q) || null, title: slug => SHELF.books.find(b => b.slug === slug)?.title || null, chapter };
  assert.deepEqual(cite({ wd: 'Q9', p: 'P607', v: 'Q1' }, ctx), { text: 'Wikidata: An Author, participated in conflict: A war', href: 'https://www.wikidata.org/wiki/Q9#P607' });
  assert.deepEqual(cite({ wd: 'Q8', p: 'P569' }, ctx), { text: 'Wikidata: An Editor, date of birth', href: 'https://www.wikidata.org/wiki/Q8#P569' });
  assert.deepEqual(cite({ wd: 'Q77', p: 'P361', v: 'Q78' }, ctx), { text: 'Wikidata: part of', href: 'https://www.wikidata.org/wiki/Q77#P361' }, 'a name the file does not hold is left out, never shown as an id');
  assert.deepEqual(cite({ book: 'a-history', ch: 7 }, ctx), { text: 'A History, Chapter VII', href: 'bibliotheca/neo/index.html#book=a-history&ch=7' });
  assert.deepEqual(cite({ book: 'set-2', ch: 401 }, { ...ctx, chapter: () => null }), { text: 'A Set, Volume II', href: 'bibliotheca/neo/index.html#book=set-2&ch=401' }, 'a heading the page does not hold: the volume');
  assert.deepEqual(cite({ collection: 'Treaties of the Powers' }, ctx), { text: 'Source collection: Treaties of the Powers', href: null });
  assert.deepEqual(cite({ lake: 'Q9', tag: 'School:A doctrine' }, ctx), { text: 'Master Index tag A doctrine, on An Author', href: 'encyclopedia/index.html#Q9' });
  for (const s of FILE.links.flatMap(l => l.source)) assert.doesNotMatch(cite(s, ctx).text, ID);
});

test('the build: a subject’s entry carries its shown links in words; a low one, and a subject with no entry, carry nothing', () => {
  const records = LAKE(), n = applySourceLinks(records, CTX);
  const war = records.get('Q1').src;
  assert.equal(war.length, 1);
  const [s] = war;
  assert.equal(s.work, 'a-history'); assert.equal(s.title, 'A History'); assert.equal(s.book, 'a-history'); assert.deepEqual(s.vols, ['a-history']);
  assert.equal(s.tag, 'primary'); assert.equal(s.basis, 'PART'); assert.equal(s.kind, 'happening'); assert.equal(s.confidence, 'high'); assert.equal(s.judged, '2026-11-22');
  assert.deepEqual(s.say, { tag: 'Primary source', basis: 'the author took part in it', flags: [], part: null, confidence: 'strong evidence' });
  assert.equal(s.evidence, FILE.links[0].evidence);
  assert.deepEqual(s.cites.map(c => c.text), ['A History, Chapter VII', 'Wikidata: An Author, participated in conflict: A war']);
  // A link with a flag in place of a tag is shown: its words are the flag's.
  assert.deepEqual(records.get('Q2').src.map(x => [x.tag, x.say.tag, x.say.flags]), [[null, null, ['a polemic against it, written at the time']]]);
  assert.equal(records.get('Q3').src, undefined, 'a low judgement stays in the file, unshown');
  assert.equal(records.has('Q5'), false, 'no entry is made for a subject that has none');
  assert.deepEqual(n, { on: 5, from: 5, waiting: 1 });
  // A set's link opens its volumes; the author's own book and the editor's preface are both on him, each with its part.
  assert.deepEqual(records.get('Q4').src.map(x => [x.work, x.title, x.book, x.vols]), [['a-set', 'A Set', 'set-1', ['set-1', 'set-2']]]);
  assert.deepEqual(records.get('Q9').src.map(x => [x.tag, x.part, x.say.part, x.book]), [['primary', null, null, 'a-history'], ['secondary', { ch: 0, heading: 'Preface', by: 'An Editor' }, 'Preface, by An Editor', 'a-history']]);
  for (const r of records.values()) for (const x of [...(r.src || []), ...(r.srcFrom || [])]) {
    for (const v of [x.say.tag, x.say.basis, ...x.say.flags, x.say.part, x.say.confidence, x.evidence, ...x.cites.map(c => c.text)].filter(Boolean)) assert.doesNotMatch(v, ID, `${r.q}: ${v}`);
  }
});

test('the build: a work’s own entry lists its subjects and carries their groups as tags; its author’s entry gains no tag', () => {
  const records = LAKE();
  applySourceLinks(records, CTX);
  const work = records.get('Q100');
  assert.deepEqual(work.srcFrom.map(x => [x.q, x.label, x.tag, x.part?.heading || null]),
    [['Q1', 'A war', 'primary', null], ['Q9', 'An Author', 'primary', null], ['Q2', 'a school', null, null], ['Q9', 'An Author', 'secondary', 'Preface'], ['Q5', 'a battle with no entry', 'primary', null]]);
  // The groups come from the main text's tags only (a part by another hand is not the work), named as the entry is.
  assert.deepEqual(work.tags, ['Type:Topic', 'Primary source on:A war', 'Primary source on:An Author', 'Primary source on:A battle with no entry']);
  assert.ok(!records.get('Q9').tags.some(t => SOURCE_GROUPS.some(g => t.startsWith(g + ':'))), 'no tag on the author’s entry');
  // Each group tag carries its note, who made the judgement (X6); no other tag does.
  assert.deepEqual(work.tn, Object.fromEntries(work.tags.slice(1).map(t => [t, WORDING.tagNote])));
  assert.equal(records.get('Q9').tn, undefined);
  assert.equal(records.get('Q9').srcFrom, undefined);
});

test('the build: applying again replaces what the last file gave, and a file without a link takes it away', () => {
  const records = LAKE();
  applySourceLinks(records, CTX);
  const once = clone([...records]);
  applySourceLinks(records, CTX);
  assert.deepEqual(clone([...records]), once, 'the same file gives the same records');
  applySourceLinks(records, { ...CTX, file: { ...FILE, links: FILE.links.slice(2, 6) } });
  assert.equal(records.get('Q1').src, undefined);
  assert.deepEqual(records.get('Q100').tags, ['Type:Topic']);
  assert.equal(records.get('Q100').tn, undefined, 'the notes go with the tags');
  // A note another module gave another tag is kept.
  const kept = LAKE();
  kept.get('Q100').tn = { 'Type:Topic': 'a note of another module' };
  applySourceLinks(kept, CTX);
  applySourceLinks(kept, { ...CTX, file: { ...FILE, links: [] } });
  assert.deepEqual(kept.get('Q100').tn, { 'Type:Topic': 'a note of another module' });
  assert.deepEqual(records.get('Q9').src.map(x => x.tag), ['secondary']);
});

// ---- The committed lake, as the last build left it: the file as it is today, on every entry it names.
const lake = () => { const m = read('lake/data/manifest.json'), all = new Map(); for (let i = 0; i < m.shards.entities; i++) for (const [q, r] of Object.entries(read(`lake/data/e/${i}.json`))) all.set(q, r); return all; };

test('committed lake: every entry carries the links the file gives it today, and no other entry carries any', () => {
  const committed = lake(), again = new Map([...committed].map(([q, r]) => [q, clone(r)]));
  const ctx = readSourceLinks(ROOT);
  applySourceLinks(again, ctx);
  for (const [q, r] of committed) {
    assert.deepEqual(r.src, again.get(q).src, `${q} ${r.label}: rebuild the lake (node lake/scripts/build.mjs --only bibliotheca) after changing the links file`);
    assert.deepEqual(r.srcFrom, again.get(q).srcFrom, `${q} ${r.label}: srcFrom`);
    assert.deepEqual(r.tags, again.get(q).tags, `${q} ${r.label}: tags`);
  }
  const shown = ctx.file.links.filter(isShown), on = new Set(shown.map(l => l.subject.q).filter(q => committed.has(q)));
  assert.deepEqual([...committed.values()].filter(r => r.src).map(r => r.q).sort(), [...on].sort());
  assert.ok(on.size >= 20, `${on.size} entries carry links`);
  // Origin of Species is the one work the Master Index holds today: its entry lists its subjects and its groups.
  const origin = committed.get('Q20124');
  assert.ok(origin.srcFrom.length >= 3 && origin.tags.includes('Primary source on:Charles Darwin'), JSON.stringify(origin.tags));
  const index = read('lake/data/index.json');
  assert.ok(index.tags.includes('Primary source on:Charles Darwin'));
  // No author's entry carries a group: each author is a subject of his own book, never its work.
  const authors = new Set(ctx.file.links.filter(l => l.basis === 'OWN' && l.subject.kind === 'person').map(l => l.subject.q));
  for (const q of authors) if (committed.has(q)) assert.ok(!committed.get(q).tags.some(t => SOURCE_GROUPS.some(g => t.startsWith(g + ':'))), q);
});

// ---- For outside readers: the catalogue, llms.txt, the OpenAPI file, the skill's reference, the MCP server.
const CAT = read('integration/catalog.json');
const DS = 'bibliotheca-source-links';

test('catalogue: every link is a row of its own dataset, with the words, the evidence, its sources and whether its subject has an entry', () => {
  const d = CAT.datasets.find(x => x.id === DS);
  assert.ok(d, `the catalogue has ${DS}`);
  assert.equal(d.module, 'bibliotheca'); assert.equal(d.submodule, 'neo-classic'); assert.equal(d.page, 'bibliotheca/neo/index.html');
  assert.match(d.description, /AI model \(Claude\)/); assert.match(d.description, /link/);
  const file = read('bibliotheca/data/source-links.json'), rows = read(d.url)[d.records || 'records'] ?? read(d.url);
  assert.equal(d.rows, file.links.length);
  const want = ['work', 'work_qid', 'work_title', 'part', 'part_by', 'subject_qid', 'subject_label', 'subject_kind', 'tag', 'tag_words', 'basis', 'basis_words', 'flags', 'flag_words', 'evidence', 'sources', 'source_words', 'confidence', 'shown', 'held', 'why', 'note', 'judged', 'entry'];
  assert.deepEqual(d.fields.map(f => f.name), want);
  for (const f of d.fields) assert.doesNotMatch(f.description, /Not yet described/, f.name);
  // `entry` is read from the lake when the catalogue is built. The monthly lake refresh rebuilds the lake alone, so a
  // subject may gain its entry there before the next catalogue build (the calendar refresh's, each day): the two are
  // held equal while the catalogue is the newer of the two, and the field is a plain true or false until then (X5).
  const committed = lake(), abreast = read('integration/catalog.json').generated >= read('lake/data/manifest.json').generated;
  file.links.forEach((l, i) => {
    const r = rows[i], p = plain(l);
    assert.equal(r.subject_qid, l.subject.q); assert.equal(r.tag, l.tag); assert.equal(r.tag_words, p.tag); assert.equal(r.basis_words, p.basis);
    assert.deepEqual(r.flag_words, p.flags); assert.equal(r.shown, isShown(l)); assert.equal(r.confidence, l.confidence); assert.equal(r.judged, l.judged);
    assert.deepEqual(r.sources, l.source); assert.equal(r.source_words.length, l.source.length);
    if (abreast) assert.equal(r.entry, committed.has(l.subject.q), `${l.subject.label}: entry is read from the lake, not the file`);
    else assert.equal(typeof r.entry, 'boolean', l.subject.label);
  });
});

test('documents: llms.txt, the OpenAPI file and the skill’s reference name the dataset; the Hub names the module', () => {
  const llms = text('llms.txt');
  assert.match(llms, new RegExp(`\\[${DS}\\]`));
  assert.match(llms, /### Bibliotheca/);
  const oa = read('integration/openapi.json');
  assert.ok(oa.paths['/datasets/{id}'].get.parameters[0].schema.enum.includes(DS));
  assert.ok(oa.paths['/catalog'].get.parameters[0].schema.enum.includes('bibliotheca'));
  assert.ok(oa.components.schemas.Entity.properties.source_links, 'get_entity’s links in the OpenAPI file');
  assert.ok(oa.components.schemas.Entity.properties.source_links_from);
  assert.match(text('integration/skill/prp-data/reference/datasets.md'), new RegExp(`### ${DS}`));
  assert.match(text('integration/skill/prp-data/SKILL.md'), new RegExp(DS));
  assert.match(text('integration/hub.js'), /bibliotheca: \['BT', 'Bibliotheca'\]/);
});

// The MCP server, called as Pages calls it, with ASSETS reading this checkout.
const env = { ASSETS: { fetch: async req => {
  const file = normalize(join(ROOT, decodeURIComponent(new URL(typeof req === 'string' ? req : req.url).pathname)));
  try { return new Response(await readFile(file), { headers: { 'content-type': extname(file) === '.json' ? 'application/json' : 'text/plain' } }); } catch { return new Response('not found', { status: 404 }); }
} } };
const { onRequest: mcp } = await import(pathToFileURL(join(ROOT, 'functions/mcp.js')).href);
const call = async (name, args) => {
  const res = await mcp({ request: new Request('https://sources.jdpi.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env });
  return (await res.json()).result.structuredContent;
};

test('MCP: get_entity gives a subject’s source links and a work’s, in words, with the evidence and its sources', async () => {
  const rome = await call('get_entity', { qid: 'Q2277' });
  const dfall = rome.source_links.find(s => s.work === 'decline-and-fall');
  assert.ok(dfall, JSON.stringify(rome.source_links));
  assert.equal(dfall.tag, 'secondary'); assert.equal(dfall.tag_words, 'Secondary source'); assert.equal(dfall.basis, 'BORNAFTER');
  assert.equal(dfall.basis_words, WORDING.basis.BORNAFTER.happening);
  assert.ok(dfall.evidence.length > 20 && dfall.sources.length >= 2 && dfall.sources.every(s => s.text && 'href' in s));
  assert.equal(dfall.judged, '2026-11-22'); assert.match(dfall.confidence, /^(high|medium)$/);
  const origin = await call('get_entity', { qid: 'Q20124' });
  assert.ok(origin.source_links_from.some(s => s.subject_qid === 'Q1035' && s.tag === 'primary'), JSON.stringify(origin.source_links_from));
  const plainOne = await call('get_entity', { qid: 'Q461830' });
  assert.equal(plainOne.source_links, undefined, 'an entry no book is judged on has none');
});

// ---- The pages, in a browser.
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page' };
const SIZES = [[1440, 900], [390, 844]];
const THEMES = ['light', 'dark'];
async function open(browser, { width, height, theme }, path) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await context.addInitScript(t => { try { localStorage.setItem('prp.theme', t); } catch { /* blocked storage */ } }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { page, context, errors };
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('page: a subject’s entry marks each book judged on it among its Bibliotheca appearances, the evidence a click away, the rule a click away', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, height] of SIZES) for (const theme of THEMES) {
    const { page, context, errors } = await open(browser, { width, height, theme }, 'encyclopedia/index.html#Q2277');
    await page.waitForSelector('#entity .srcmark', { timeout: 30000 });
    const marks = await page.$$eval('#entity .suite .group[data-module="neo-classic"] .ment', ms => ms.map(m => ({ book: new URL(m.querySelector('a').href).hash.match(/book=([^&]+)/)?.[1] || decodeURIComponent(m.querySelector('a').href).match(/book=([^&]+)/)?.[1], mark: m.querySelector('.srcmark .prp-kind')?.textContent || null, why: m.querySelector('.srcmark .srcwhy')?.textContent || null, title: m.querySelector('.srcmark')?.title || null })));
    const dfall = marks.filter(m => /^decline-and-fall-/.test(m.book || ''));
    assert.ok(dfall.length >= 1 && dfall.every(m => m.mark === 'Secondary source' && m.why === WORDING.basis.BORNAFTER.happening), JSON.stringify(marks));
    assert.ok(marks.filter(m => !/^decline-and-fall-/.test(m.book || '')).every(m => m.mark === null), 'a book with no tag is listed as it was');
    assert.match(dfall[0].title, /1737/, 'the evidence on hover');
    // The evidence opens on a click, with its sources; the rule's paragraph opens from the card.
    const ev = page.locator('#entity .srcmark details').first();
    await ev.locator('summary').click();
    assert.match(await ev.textContent(), /Wikidata as read on 22 November 2026/);
    assert.ok(await ev.locator('a[href*="wikidata.org/wiki/Q"]').count() >= 1);
    await page.locator('#entity [data-srcwhat]').first().click();
    assert.equal(await page.textContent('#mtitle'), WORDING.heading);
    assert.equal((await page.textContent('#mbody')).trim(), WORDING.about);
    await page.keyboard.press('Escape');
    const card = await page.textContent('#entity');
    assert.doesNotMatch(card.replace(/https?:\S+/g, ''), /\b(?:ACT|PART|WIT|OWN|BORNAFTER|FROMOTHERS|OUTSIDE|RETROSPECTIVE|CONTEMPORARY|UNKNOWN|FORERUNNER|POLEMIC|AS-TOLD-TO|DISPUTED)\b/, 'no id reaches the page');
    assert.ok(await sideways(page) <= 0, `${width} ${theme}: nothing scrolls sideways`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('page: a book judged a source on an entry that it does not name is listed under Bibliotheca, apart, with its mark', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, height] of SIZES) {
    const { page, context, errors } = await open(browser, { width, height, theme: 'light' }, 'encyclopedia/index.html#Q78994');
    await page.waitForSelector('#entity .srcmark', { timeout: 30000 });
    const g = page.locator('#entity .group[data-sources]');
    assert.equal(await g.locator('h4').first().textContent(), WORDING.notNamed);
    const line = await g.locator('.ment').first().textContent();
    assert.match(line, /On War/); assert.match(line, /Primary source/); assert.ok(line.includes(WORDING.basis.PART.happening), line);
    assert.doesNotMatch(line, /written long after/, 'the writing began in 1818, three years after the wars ended (review R3)');
    assert.equal(await g.locator('.ment a').first().evaluate(a => /book=on-war/.test(decodeURIComponent(a.href))), true);
    const head = await page.textContent('#entity .card h3 >> nth=1');
    const r = read(`lake/data/e/${78994 % 512}.json`).Q78994;
    assert.match(head, new RegExp(`· ${(r.places ?? r.mentions.length).toLocaleString('en-GB')}$`), 'the header still counts the places that name it');
    assert.ok(await sideways(page) <= 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('page: a work’s own entry lists the subjects it is a primary or a secondary source on, each linked to its entry where one exists', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, height] of SIZES) for (const theme of THEMES) {
    const { page, context, errors } = await open(browser, { width, height, theme }, 'encyclopedia/index.html#Q20124');
    await page.waitForSelector('#entity .srcs', { timeout: 30000 });
    const card = page.locator('#entity .srcs');
    assert.equal(await card.locator('h3').textContent(), WORDING.heading);
    assert.equal(await card.locator('a[href="#Q1035"]').count(), 1, 'Charles Darwin, linked to his entry');
    const t2 = await card.textContent();
    assert.match(t2, new RegExp(WORDING.on.primary)); assert.match(t2, /natural selection/); assert.match(t2, new RegExp(WORDING.waiting));
    assert.equal(await card.locator('a.srcsubj', { hasText: 'natural selection' }).count(), 0, 'a subject with no entry is named, not linked');
    assert.doesNotMatch(t2, ID);
    assert.ok(await sideways(page) <= 0, `${width} ${theme}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('page: Neo Book’s book side lists what the book is a source on, its parts by other hands apart, each subject linked where it has an entry', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, height] of SIZES) for (const theme of THEMES) {
    const { page, context, errors } = await open(browser, { width, height, theme }, 'bibliotheca/neo/index.html#book=on-war');
    await page.waitForSelector('#book-srcs:not([hidden])', { timeout: 30000 });
    await page.locator('#book-srcs > summary').click();
    await page.waitForSelector('#book-srcs [data-q="Q78994"] a.srcsubj', { timeout: 15000 });
    const box = page.locator('#book-srcs');
    const all = await box.textContent();
    assert.match(all, new RegExp(WORDING.on.primary)); assert.match(all, new RegExp(WORDING.on.secondary));
    assert.match(await box.locator('[data-q="Q78994"]').textContent(), /Napoleonic Wars.*the author took part in it/s);
    assert.doesNotMatch(await box.locator('[data-q="Q78994"]').textContent(), /written long after/, 'begun in 1818 (review R3)');
    assert.match(await box.locator('[data-q="Q207318"]').textContent(), /French Revolutionary Wars.*the author took part in it.*written long after \(16 to 28 years after it ended\)/s);
    assert.match(all, /Brief memoir of General Clausewitz, by J\. J\. Graham/, 'the memoir is the translator’s (review R2)');
    assert.match(await box.locator('[data-q="Q78994"] a.srcsubj').first().getAttribute('href'), /encyclopedia\/index\.html#Q78994/);
    // Clausewitz has had his entry since VM's canon list (25 November 2026; he waited until then, named but not
    // linked): his lines link to it, and none says it waits; the introduction by Maude is a part apart.
    const carl = box.locator('[data-q="Q76430"]');
    assert.match(await carl.locator('a.srcsubj').first().getAttribute('href'), /encyclopedia\/index\.html#Q76430/);
    assert.doesNotMatch(await carl.first().textContent(), new RegExp(WORDING.waiting));
    assert.match(all, /Introduction, by F\. N\. Maude/);
    assert.match(all, /AI model \(Claude\)/, 'the rule, with who made the judgements');
    assert.doesNotMatch(all, ID);
    assert.ok(await sideways(page) <= 0, `${width} ${theme}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Every book on the shelf today has a shown link; a book with none is the next test's last case.
  const shelf = read('bibliotheca/data/index.json');
  assert.ok(shelf.books.every(b => read('bibliotheca/data/source-links.json').links.some(l => isShown(l) && (l.work === b.slug || l.work === b.set?.slug))), 'every book on the shelf has a shown link');
});

// ---- The second reader's points of 22 November 2026 (Codex on the first commit), where a reader meets them.
// X6: the statement that an AI model made the judgements and no person checked them stood in the catalogue's
// description and on the entry page, but not in the dataset's own file, in a query's answer, or beside the Explorer's
// two filters. It is one sentence of the table (WORDING.made), said in each.
test('X6: wherever a judgement is served or filtered, it is said that an AI model made it and no person checked it', async () => {
  assert.match(WORDING.made, /made for Vitruvian Manager by an AI model \(Claude\).*no person checked it\.$/);
  assert.ok(WORDING.about.includes(WORDING.made), 'the rule’s paragraph says it in the same words');
  assert.match(WORDING.tagNote, /by an AI model \(Claude\).*no person checked it$/);
  const d = read('integration/catalog.json').datasets.find(x => x.id === DS);
  assert.equal(d.notes[0], WORDING.made);
  assert.deepEqual(read(d.url).notes, d.notes, 'the downloaded file says it too');
  const answer = await call('query_dataset', { id: DS, limit: 2 });
  assert.equal(answer.rows.length, 2);
  assert.deepEqual(answer.dataset_notes, d.notes, 'and so does every answer from it');
  // The Explorer: each tag of the two groups carries its note in index.json, which the filter's heading and the tag show.
  const idx = read('lake/data/index.json');
  const groupTags = idx.tags.map((t, i) => [t, i]).filter(([t]) => SOURCE_GROUPS.some(g => t.startsWith(g + ':')));
  assert.ok(groupTags.length);
  const noted = new Set(Object.values(idx.notes.at).flatMap(m => Object.entries(m).filter(([, n]) => idx.notes.texts[n] === WORDING.tagNote).map(([t]) => +t)));
  for (const [t, i] of groupTags) assert.ok(noted.has(i), `${t} carries its note`);
  assert.equal(noted.size, groupTags.length, 'and no other tag carries it');
  const ency = text('encyclopedia/index.html');
  assert.match(ency, /facetNotes\.get\(f\)/, 'the filter’s heading shows a facet’s notes');
  // An outside reader of one work's entry is told beside the tags too.
  const origin = await call('get_entity', { qid: 'Q20124' });
  const tagged = origin.tags.filter(t => SOURCE_GROUPS.some(g => t.startsWith(g + ':')));
  assert.ok(tagged.length);
  for (const t of tagged) assert.equal(origin.tag_notes[t], WORDING.tagNote, t);
});

// X7: Neo Book read a subject's entry through a loader that kept a failed read as "no entry", so one failed request
// labelled an existing entry as absent until the page was loaded again. A failure now settles nothing and is asked
// again the next time the list is opened. And a book with no shown link shows no list (the file served emptied).
test('page: Neo Book says a subject has no entry only when the lake says so; a failed lookup is asked again', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const { page, context } = await open(browser, { width: 1440, height: 900, theme: 'light' }, 'bibliotheca/neo/index.html#book=on-war');
  await page.waitForSelector('#book-srcs:not([hidden])', { timeout: 30000 });
  let failing = true, asked = 0;
  await page.route('**/lake/data/e/*.json', r => { asked++; return failing ? r.abort() : r.continue(); });
  const box = page.locator('#book-srcs'), summary = page.locator('#book-srcs > summary');
  const settle = async () => {
    for (let i = 0; i < 100 && !asked; i++) await page.waitForTimeout(50);
    await page.waitForFunction(() => !document.querySelector('#book-srcs').dataset.asking, null, { timeout: 15000 });
  };
  await summary.click();
  await settle();
  assert.ok(asked > 0, 'the entries were asked for');
  assert.equal(await box.locator('.nc-src-wait').count(), 0, 'a failed lookup is not “no entry”');
  assert.equal(await box.locator('a.srcsubj').count(), 0);
  // Closed and opened again with the lake answering: the entries are found, and only the subjects the lake does not
  // hold are said to have none.
  failing = false; asked = 0;
  await summary.click(); await summary.click();
  await page.waitForSelector('#book-srcs [data-q="Q78994"] a.srcsubj', { timeout: 15000 });
  const all = lake(), shown = linksFrom(read('bibliotheca/data/source-links.json'), 'on-war', read('bibliotheca/data/index.json')).filter(isShown);
  assert.equal(await box.locator('.nc-src-wait').count(), shown.filter(l => !all.has(l.subject.q)).length);
  assert.equal(await box.locator('a.srcsubj').count(), shown.filter(l => all.has(l.subject.q)).length);
  // What is settled is not asked for a third time.
  const before = asked;
  await summary.click(); await summary.click();
  await page.waitForTimeout(400);
  assert.equal(asked, before);
  // A book with no shown link shows no list.
  const bare = await context.newPage();
  await bare.route('**/bibliotheca/data/source-links.json', r => r.fulfill({ json: { judged: '2026-11-22', links: [] } }));
  await Promise.all([bare.waitForResponse(r => /source-links\.json/.test(r.url())), bare.goto(`${BASE}/bibliotheca/neo/index.html#book=on-war`, { waitUntil: 'domcontentloaded', timeout: 30000 })]);
  await bare.waitForSelector('#toc-list a', { state: 'attached', timeout: 30000 });
  await bare.waitForTimeout(300);
  assert.equal(await bare.locator('#book-srcs').isHidden(), true);
  assert.equal((await bare.locator('#book-srcs-body').innerHTML()).trim(), '');
  await context.close();
});

test('page files: the entry page and Neo Book read the links through the one rule module, and type no wording of their own', () => {
  // The facets' order names the two tag groups (a literal list tests/encyclopedia.test.mjs reads): that line aside.
  const ency = text('encyclopedia/index.html').replace(/^const FACET_ORDER = .*$/m, ''), app = text('bibliotheca/neo/app.js');
  assert.match(text('encyclopedia/index.html'), /'Primary source on', 'Secondary source on'/, 'the work entry’s groups have their place among the facets');
  assert.match(ency, /import\('\.\.\/bibliotheca\/lib\/sources\.js'\)/);
  assert.match(app, /from '\.\.\/lib\/sources\.js'/);
  for (const s of [WORDING.about, WORDING.notNamed, 'Primary source', 'Secondary source', 'written long after']) {
    assert.ok(!ency.includes(s) && !app.includes(s), `"${s}" is typed in a page, not taken from the table`);
  }
  assert.doesNotMatch(text('bibliotheca/neo/styles.css').replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test('data: the files the pages read exist where they read them', () => {
  assert.ok(readdirSync(join(ROOT, 'bibliotheca/data')).includes('source-links.json'));
  assert.ok(readdirSync(join(ROOT, 'lake/scripts')).includes('source-links.mjs'));
});
