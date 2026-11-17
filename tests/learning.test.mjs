// Learning: the Finance and Economics (Wealth Automation) and Politics (Retrospective Geopolitics) courses render,
// quizzes respond, progress saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';
import { fileURLToPath } from 'node:url';
import { THINKERS, SPECTRUM_SCHOOL, spectrumTag } from '../lake/scripts/thinkers.mjs';
import { learning } from '../lake/scripts/adapters.mjs';
import { findQuote, quotedRuns, pieces, shelfParagraphs } from '../bibliotheca/scripts/quotes.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('politics: realism is taught as a school of its own, outside the line from left to right', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  assert.deepEqual(units.map(u => u.split(' · ')[0]), ['Introduction', 'Far left', 'Left wing', 'Centre', 'Right wing', 'Outside the spectrum', 'Far right', 'Comparing the spectrum'], 'the units, in their places');
  assert.equal(units[4], 'Right wing · Conservatism and market liberalism');
  assert.match(units[5], /Mearsheimer and the Realists/);
  // No sentence, heading, table cell or answer files the Realists or realism under the right.
  for (const line of md.split('\n')) assert.doesNotMatch(line, /\bright( wing)?\s*\((Realists?|Mearsheimer)|realism is closer to the right|the right is represented by|^# Right wing.*Realis/i, line);
  // The quiz on the crisis: its right answer is the Realists, not a place on the line.
  const crisis = md.slice(md.indexOf('? Which of these would most stress the balance of power'));
  assert.match(crisis.split('\n').find(l => l.startsWith('+ ')), /^\+ The Realists$/);
  // The Master Index takes its spectrum tag from the unit: Realists only, and none of them "Right wing".
  assert.equal(spectrumTag(units[5], ['Realist', 'Offensive realism']), 'Sui generis (Realist)');
  assert.equal(spectrumTag(units[5], ['Liberal institutionalist']), null, 'a critic taught in the unit takes no position from it');
  assert.equal(spectrumTag(units[6], ['Fascist', 'Far right']), 'Far right');
  assert.equal(spectrumTag(units[6], ['Historian', 'Scholar of fascism']), null, 'a scholar taught in the unit takes no position from it');
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning-politics').description;
  assert.doesNotMatch(desc, /right \(Mearsheimer/i);
  assert.match(desc, /Realists/);
  assert.match(desc, /right \(conservatism and market liberalism\)/);
});

test('politics: the mainstream right has its unit, in the form of the others, with no realist and no far right in it', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const unitOf = title => { const at = md.indexOf(`\n# ${title}`); return md.slice(at + 1, md.indexOf('\n# ', at + 1)); };
  const right = unitOf('Right wing · '), farLeft = unitOf('Far left · ');
  const heads = u => u.split('\n').filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/\b(the far left|the right)\b/gi, 'X'));
  assert.deepEqual(heads(right), ['## Thinkers of X', '### Shared commitments', '## X in power and its critics', '### What critics say', '### What defenders say']);
  assert.deepEqual(heads(right), heads(farLeft), 'the same headings as the far left');
  for (const name of ['Burke', 'Hayek', 'Friedman', 'Oakeshott', 'Buckley', 'Thatcher', 'Reagan', 'Kirk', 'Scruton']) assert.match(right, new RegExp(`\\*\\*[^*]*${name}`), `${name} is taught`);
  assert.match(right, /\*\*Neoliberalism\.\*\*.*used mostly by critics/);
  // Every lesson ends in a quiz with one right answer, as in the other units.
  for (const lesson of right.split('\n## ').slice(1)) {
    const qs = lesson.split('\n? ').slice(1);
    assert.ok(qs.length >= 1, 'a quiz');
    for (const q of qs) assert.equal(q.split('\n').filter(l => l.startsWith('+ ')).length, 1, q.split('\n')[0]);
  }
  // No realist under the right, and the far right stays in its own unit.
  assert.doesNotMatch(right, /Mearsheimer|Morgenthau|Waltz|Kissinger|Thucydides|Machiavelli|Hobbes|offensive realism|Mussolini|Hitler|fascis|Le Pen|Mudde/i);
  // The comparison has its five positions back, in order, with the Realists apart at the end.
  const head = md.split('\n').find(l => l.startsWith('| Question |'));
  assert.equal(head, '| Question | Far left | Left | Centre | Right | Far right | Realists (outside the line) |');
  const crisis = unitOf('Comparing the spectrum').slice(unitOf('Comparing the spectrum').indexOf('## A crisis'));
  assert.deepEqual([...crisis.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]), ['Far left', 'Left', 'Centre', 'Right', 'Far right', 'Realists (Mearsheimer)']);
  const table = unitOf('Comparing the spectrum').split('\n## ')[1];
  assert.match(table.split('\n').find(l => l.startsWith('+ ')), /^\+ Right$/);
  // The Master Index: the unit gives "Right wing" to the right's own thinkers and schools only.
  const unit = 'Right wing · Conservatism and market liberalism';
  assert.equal(spectrumTag(unit, ['Conservative', 'Right wing', 'Philosopher']), 'Right wing');
  for (const tags of [['Realist', 'Classical realism'], ['Liberal', 'Left wing', 'Philosopher'], ['School of thought', 'Centre right'], ['Third Way', 'Centrist']]) assert.equal(spectrumTag(unit, tags), null, tags.join(', '));
  // A thinker of the right named in another unit (Thatcher in a quiz on the left) takes no position from it.
  assert.equal(spectrumTag('Left wing · Social democracy and progressive liberalism', ['Conservative', 'Right wing', 'Head of government']), null);
});

test('politics: a unit gives its position to its own school only, never to the scholars and critics it teaches', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  const farRight = units.find(u => u.startsWith('Far right · '));
  const tagsOf = name => THINKERS.find(t => t[0] === name)[2];
  // Mudde, Paxton and Griffin are taught in the far right's unit as its scholars: they take no position from it.
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) assert.equal(spectrumTag(farRight, tagsOf(name)), null, name);
  for (const name of ['Benito Mussolini', 'Adolf Hitler', 'Jean-Marie Le Pen', 'Fascism']) assert.equal(spectrumTag(farRight, tagsOf(name)), 'Far right', name);
  // In every unit, everyone the Master Index places there belongs to that position's school.
  const mentions = learning({ jdpiDir: fileURLToPath(new URL('..', import.meta.url)) }).filter(x => x.module === 'learning-politics');
  const placed = mentions.flatMap(x => x.tags.filter(t => t[0] === 'Political spectrum').map(t => [x.label, t[1], x.tags.map(g => g[1])]));
  assert.ok(placed.length >= 60, `${placed.length} placed`);
  for (const [label, s, tags] of placed) assert.ok(SPECTRUM_SCHOOL[s].some(t => tags.includes(t)), `${label} takes ${s} without belonging to its school`);
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) assert.ok(mentions.some(x => x.label === name) && !placed.some(p => p[0] === name), `${name} is taught and placed nowhere`);
  // Beveridge's report is a wrong answer in a quiz on the centre: he stays the left's only.
  assert.deepEqual([...new Set(placed.filter(p => p[0] === 'William Beveridge').map(p => p[1]))], ['Left wing']);
});

test('politics: the crisis lesson is titled for its six answers (Kino\'s link to it: tests/kino.test.mjs)', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const heads = md.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3));
  assert.ok(heads.includes('A crisis seen six ways') && !heads.some(h => /five ways/.test(h)), 'the new title');
  assert.ok(heads.includes('Five answers to the same questions'), 'the comparison table keeps its title');
  const crisis = md.slice(md.indexOf('## A crisis seen six ways')).split('\n## ')[0].split('\n? ')[0];
  assert.equal([...crisis.matchAll(/^- \*\*/gm)].length, 6, 'six answers');
});

test('each course renders its lessons and quiz, in the right suite', pageTest, async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const seen = {};
  for (const [course, suite, mustSay] of [['finance', 'mm', /Compounding/], ['economics', 'mm', /werner/i], ['politics', 'rs', /mearsheimer/i]]) {
    await page.goto(`${BASE}/fe/learning?course=${course}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#toc button', { timeout: 20000 });
    const toc = await page.locator('#toc').innerText();
    seen[course] = {
      lessons: await page.locator('#toc button').count(),
      suite: await page.evaluate(() => document.documentElement.dataset.suite),
      tabs: await page.locator('.tabs a:not([hidden])').count(),
      mentions: mustSay.test(toc),
    };
  }
  // Answer a quiz question and mark a lesson complete.
  await page.goto(`${BASE}/fe/learning?course=finance`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.q .opt');
  await page.locator('.q').first().locator('.opt').first().click();
  const marked = await page.locator('.q').first().locator('.opt.right').count();
  const why = await page.locator('.q').first().locator('.why').isVisible();
  await page.click('#mark');
  const progress = await page.locator('#progress-label').innerText();
  await browser.close();
  assert.ok(seen.finance.lessons >= 20 && seen.economics.lessons >= 12 && seen.politics.lessons >= 10, JSON.stringify(seen));
  assert.equal(seen.finance.suite, 'mm');
  assert.equal(seen.politics.suite, 'rs');
  assert.equal(seen.finance.tabs, 2);
  assert.equal(seen.politics.tabs, 1);
  assert.ok(seen.economics.mentions && seen.politics.mentions);
  assert.equal(marked, 1);
  assert.ok(why);
  assert.match(progress, /^1 of/);
  assert.deepEqual(errors, []);
});

// The review of 12 November 2026: the Finance & Economics material is short (the page counts its own reading time), so
// it is called introductory wherever it is described, never a university course.
test('finance and economics: the courses are called introductory, on the page, in its fallback and in the registry', () => {
  const intro = f => readFileSync(new URL(`../fe/learning/${f}.md`, import.meta.url), 'utf8').replace(/\r/g, '').split('\n').find(l => l.startsWith('intro: '));
  assert.match(intro('finance'), /^intro: An introductory course in finance/);
  assert.match(intro('finance'), /a short introduction, not a full university course/);
  assert.doesNotMatch(intro('finance'), /first-year university|university-style/);
  assert.match(intro('economics'), /^intro: An introductory course in economics/);
  const page = readFileSync(new URL('../fe/learning.html', import.meta.url), 'utf8');
  assert.match(page, /intro: 'Two introductory courses: Finance, with worked examples, and Economics/);
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning').description;
  assert.match(desc, /^Two introductory courses: /);
  assert.doesNotMatch(desc, /university/);
});

// The quotation rule (S0 of the scholar design, 16 November 2026; Jude's rule): a person's words, or a document's, appear
// in quotation marks in a course only when they match a paragraph of a Bibliotheca book whose rights.eu is "pd"
// (bibliotheca/scripts/quotes.mjs). Anything else is said in VM's words, as reported speech with the source and year.
test('quotations: every quotation in the courses matches a book on the shelf; anything else is said in VM\'s words', () => {
  // Quoted strings that are not a person's words: VM's own example sentences, and an article's title.
  const NOT_WORDS = new Map([
    ['The minimum wage should be raised because inequality is unjust.', 'VM’s example of a normative statement'],
    ['raising the minimum wage by 10% reduces teenage employment by X%', 'VM’s example of a positive statement'],
    ['Why the Ukraine Crisis Is the West\'s Fault', 'the title of Mearsheimer’s article (Foreign Affairs, 2014)'],
  ]);
  // The intelligence courses' quoted strings are VM's example report wording and headlines and the credit lines that
  // imagery licences ask for, so they are left out as a whole (their definitions from US law are in VM's words).
  const COURSES = ['economics', 'politics', 'finance'];
  const md = f => readFileSync(new URL(`../fe/learning/${f}.md`, import.meta.url), 'utf8').replace(/\r/g, '').split('\n');
  // The quoted runs of a course, each with the line it starts on. The file is read whole, not line by line, so a
  // quotation that runs across a line break is seen too (the second reviewer, 17 November 2026, X3).
  const runsOf = lines => {
    const all = lines.join('\n'), starts = lines.map((_, i) => lines.slice(0, i).join('\n').length + (i ? 1 : 0));
    const out = [];
    let from = 0;
    for (const q of quotedRuns(all, 6)) { const i = all.indexOf(q, from); from = i + q.length; out.push([q.replace(/\s+/g, ' '), starts.findLastIndex(s => s <= i) + 1]); }
    return out;
  };
  assert.deepEqual(runsOf(['He wrote "these are six invented words', 'that span two lines" in 1900.']), [['these are six invented words that span two lines', 1]], 'a quotation across a line break is seen');
  let blocks = 0;
  for (const f of COURSES) {
    md(f).forEach((line, i) => {
      const block = /^> "(.+?)"\s+—\s+(.+)$/.exec(line);
      if (block) { blocks++; assert.ok(findQuote(block[1]).length, `${f}.md:${i + 1}: the quotation "${block[1]}" matches no paragraph of a book on the shelf that is public domain in the EU`); }
    });
    for (const [q, line] of runsOf(md(f))) if (!NOT_WORDS.has(q)) assert.ok(findQuote(q).length, `${f}.md:${line}: "${q}" is quoted but matches no paragraph of a book on the shelf; say it in VM's words`);
  }
  assert.ok(blocks >= 4, 'the quotations the shelf holds stay quotations');
  for (const f of ['osint', 'geoint']) assert.ok(!quotedRuns(md(f)[6], 6).length, `${f}.md: the definition from US law is in VM's words`);
  // the shelf's quotations name their translator
  assert.match(md('economics').find(l => l.startsWith('> "The history of all')), /translated by Samuel Moore/);
  assert.match(md('politics').find(l => l.startsWith('> "… the strong do')), /translated by Richard Crawley/);
});

// The quotation rule's two named exceptions (Jude's decision F2, 17 November 2026). Outside the courses, words in
// quotation marks that match no book on the shelf are allowed in two places only, and only on these terms:
//  1. Omni News briefings (briefing/data/latest.json and the Science, Economics and Digital briefings' stories.json):
//     a publisher's own words, inside an item that carries that publisher's name (its source, named in the file's
//     sources) and the link to its story. The words are the publisher's headline or description, shown as its own and
//     led back to it; VM does not quote anyone in its own voice there.
//  2. Wikipedia extracts in the Master Index (lake/data/e, each entity's summary): Wikipedia's text, which may be
//     reused under CC BY-SA 4.0 with its credit and link, so only where the store and the page credit Wikipedia and
//     the entity carries its article's title (the page links "Wikipedia ↗" from it). On 16 November three extracts were
//     seen quoting Nobel prize citations: Thomas Cech (Q135180), Eric Allin Cornell (Q205954) and Carl Wieman (Q206379).
// A quoted run anywhere else in those files, or one in an item without its link or publisher, or an extract without
// Wikipedia's credit or link, fails the test.
// A run is on the shelf only when findQuote finds it; a piece found nowhere in the shelf's text settles it sooner.
let shelfText = null;
const seen = new Map();
const onShelf = q => {
  if (!seen.has(q)) seen.set(q, !!(shelfText ??= shelfParagraphs().map(p => p.text).join('\n')) && pieces(q).every(p => shelfText.includes(p)) && findQuote(q).length > 0);
  return seen.get(q);
};
const unshelved = text => (typeof text === 'string' ? quotedRuns(text, 6) : []).filter(q => !onShelf(q));
function briefingQuoteProblems(file, data) {
  const named = new Map((data.sources || []).map(s => [s.id, s.name || s.outlet]));
  const out = [];
  for (const it of data.items || []) {
    const runs = Object.values(it).flatMap(unshelved);
    if (!runs.length) continue;
    const link = it.u ?? it.url, src = it.s ?? it.source;
    if (!/^https?:\/\/\S+$/.test(link || '')) out.push(`${file}: "${runs[0]}" is quoted in an item with no link to its story`);
    if (!named.get(src)) out.push(`${file}: "${runs[0]}" is quoted in an item whose publisher is not named (source ${JSON.stringify(src)})`);
  }
  return out;
}
const WIKIPEDIA_CREDIT = 'Wikipedia summaries (CC BY-SA 4.0)';
function extractQuoteProblems(file, entities, sources) {
  const credited = (sources || []).includes(WIKIPEDIA_CREDIT), out = [];
  for (const [q, e] of Object.entries(entities)) {
    const runs = unshelved(e.summary);
    if (!runs.length) continue;
    if (!credited) out.push(`${file} ${q}: "${runs[0]}" is quoted in a Wikipedia extract but the store does not credit Wikipedia`);
    if (!(typeof e.wiki === 'string' && e.wiki.trim())) out.push(`${file} ${q}: "${runs[0]}" is quoted in an extract with no Wikipedia article to link to`);
  }
  return out;
}

test('quotations: the two named exceptions, a publisher\'s words with its name and link, Wikipedia\'s with its credit and link', () => {
  const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  // Fixtures: each exception fails without its link, name or credit.
  const run = 'He said “these six words are not on the shelf at all” today.';
  const brief = { sources: [{ id: 'pub', name: 'A Publisher' }], items: [{ s: 'pub', t: 'A headline', u: 'https://example.org/story', d: run }] };
  assert.deepEqual(briefingQuoteProblems('fixture', brief), [], 'a publisher\'s words with its name and link');
  assert.equal(briefingQuoteProblems('fixture', { ...brief, items: [{ ...brief.items[0], u: '' }] }).length, 1, 'no link: fails');
  assert.equal(briefingQuoteProblems('fixture', { ...brief, items: [{ ...brief.items[0], s: 'unknown' }] }).length, 1, 'no publisher\'s name: fails');
  assert.equal(briefingQuoteProblems('fixture', { sources: [{ id: 'pub', outlet: 'An Outlet' }], items: [{ source: 'pub', title: run }] }).length, 1, 'the other briefings\' shape, with no url: fails');
  const ent = { Q1: { label: 'X', wiki: 'X', summary: run } };
  assert.deepEqual(extractQuoteProblems('fixture', ent, [WIKIPEDIA_CREDIT]), [], 'an extract with its credit and link');
  assert.equal(extractQuoteProblems('fixture', ent, ['Wikidata (CC0)']).length, 1, 'no credit: fails');
  assert.equal(extractQuoteProblems('fixture', { Q1: { ...ent.Q1, wiki: null } }, [WIKIPEDIA_CREDIT]).length, 1, 'no link: fails');
  assert.deepEqual(extractQuoteProblems('fixture', { Q1: { summary: 'No quotation here.' } }, []), [], 'no quoted run, nothing to credit');

  // The briefings as committed.
  let runs = 0;
  for (const f of ['briefing/data/latest.json', 'science/briefing/data/stories.json', 'econ/briefing/data/stories.json', 'digital/briefing/data/stories.json']) {
    const data = read(f);
    assert.deepEqual(briefingQuoteProblems(f, data), []);
    runs += data.items.flatMap(it => Object.values(it).flatMap(unshelved)).length;
    // the files' other parts (sources, counts) hold no quoted words
    const strings = v => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
    assert.deepEqual(strings(Object.entries(data).filter(([k]) => k !== 'items')).flatMap(unshelved), [], `${f}: quoted words outside the items`);
  }
  assert.ok(runs > 0, 'the briefings were read');
  // The Master Index: the store and the page credit Wikipedia, and every quoted extract has its article.
  const manifest = read('lake/data/manifest.json');
  assert.ok(manifest.sources.includes(WIKIPEDIA_CREDIT), 'the store credits Wikipedia');
  assert.match(readFileSync(new URL('../encyclopedia/index.html', import.meta.url), 'utf8'), /Summaries from <a href="https:\/\/en\.wikipedia\.org"[^>]*>Wikipedia<\/a> \(CC BY-SA 4\.0/, 'the page credits Wikipedia');
  const dir = new URL('../lake/data/e/', import.meta.url);
  const problems = [], named = new Map();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const entities = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    problems.push(...extractQuoteProblems(`lake/data/e/${f}`, entities, manifest.sources));
    for (const q of ['Q135180', 'Q205954', 'Q206379']) if (entities[q]) named.set(q, entities[q]);
  }
  assert.deepEqual(problems, []);
  // the three extracts named on 16 November are still covered: each quotes a Nobel citation and has its article
  for (const [q, label] of [['Q135180', 'Thomas Cech'], ['Q205954', 'Eric Allin Cornell'], ['Q206379', 'Carl Wieman']]) {
    const e = named.get(q);
    if (!e) continue; // an entity that has left the store needs no exception
    assert.equal(e.label, label);
    if (unshelved(e.summary).length) assert.ok(e.wiki, `${q} carries its Wikipedia article`);
  }
});

test('page: Finance and Economics open with their introductory intros', pageTest, async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    for (const [course, want] of [['finance', /^An introductory course in finance.*not a full university course/], ['economics', /^An introductory course in economics/]]) {
      await page.goto(`${BASE}/fe/learning?course=${course}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#toc button', { timeout: 20000 });
      assert.match(await page.textContent('#intro'), want, course);
    }
  } finally {
    await browser.close();
  }
});
