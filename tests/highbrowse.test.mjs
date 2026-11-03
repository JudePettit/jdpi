// Highbrowse, the module of the four briefings, and its landing page (highbrowse/): the analysis (analysis.js) on a small
// made-up week of stories, whose stories, topics, shared stories and political spread are known; the search (words at
// the start of a word, short words whole, plurals, phrases, the briefing, date and topic filters, one result per
// article) and its speed on the four real stores; the links into the briefings, read back by each briefing's own code
// (its view.js, or the Political Briefing's page), so a story opens where it is; the Political Briefing's topics, held
// to its page's own defaults and matching; the module's figure (design/brand-hb.svg and its icon); and the page itself:
// the analysis renders, the search finds a known story, the links open the right pages in the shell and on their own,
// with no console errors, in light, dark and at phone width.
//   npm run test:unit -- tests/highbrowse.test.mjs      (no browser, no network)
//   npm run test:e2e -- tests/highbrowse.test.mjs       (the page too, against a local copy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pageTest, launch } from './tools/pages.mjs';
import {
  BRIEFINGS, BRIEFING, POSITIONS, POSITION_LABELS, POLITICAL_TOPICS, TOPICS_KEY, terms, cluster, buildModel, digest, search, parseQuery, parseHash, toHash,
  briefingPage, itemPage, referenceTime, topicsFrom, normalise, localDay, findWord, fold, inWindow, DEFAULTS,
} from '../highbrowse/analysis.js';
import * as SCI from '../science/briefing/view.js';
import * as ECON from '../econ/briefing/view.js';
import * as DIG from '../digital/briefing/view.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const H = 36e5;
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

/* --- a made-up week: four briefings' stores, in their own shapes ------------------------------------------------------ */
const NOW = Date.parse('2026-11-03T12:00:00Z');
const ago = h => new Date(NOW - h * H).toISOString();
const POL_SOURCES = [['fl1', 'Red Dawn', 'far_left'], ['l1', 'Left Daily', 'left'], ['l2', 'The Progressive Post', 'left'], ['c1', 'Centre Wire', 'centre'], ['c2', 'BBC News', 'centre'],
  ['r1', 'Right Times', 'right'], ['r2', 'The Conservative', 'right'], ['fr1', 'Far Right Herald', 'far_right'], ['fr2', 'Patriot Pulse', 'far_right']]
  .map(([id, name, position]) => ({ id, name, position, country: 'US', caution: id === 'fr2', active: true, reserve: false, status: 'ok' }));
const pol = (s, t, h, extra = {}) => ({ s, t, u: `https://${s}.example/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, p: ago(h), d: `${t}. More on this story.`, ...extra });
function fixtureStores() {
  const political = {
    generated: ago(1), keepDays: 7, perPosition: 10, positions: POSITIONS.map(key => ({ key, label: POSITION_LABELS[key] })), sources: POL_SOURCES,
    items: [
      // A: the Binance hack, five political publishers in the last 24 hours (and the economics and digital desks below)
      pol('c1', 'Binance hack: $6 billion stolen from crypto exchange', 2),
      pol('r1', 'Binance crypto exchange hack costs $6 billion', 3),
      pol('fr1', 'North Korea behind $6 billion Binance crypto hack', 4),
      pol('fr2', 'Binance hack: $6 billion crypto heist blamed on North Korea', 5),
      { ...pol('c2', 'Binance hack: billions stolen from crypto exchange', 6), u: 'https://www.bbc.co.uk/news/binance-hack' },
      // B: covered only from the right, two days ago
      pol('r1', 'Murkowski endorses Democrat in Alaska governor race', 50),
      pol('r2', 'Lisa Murkowski backs Democrat for Alaska governor', 52),
      pol('fr1', 'Murkowski endorses Democrat for Alaska governor', 55),
      pol('fr2', 'Senator Murkowski endorses Democrat for Alaska governor race', 56),
      // C: covered mostly from the left, three days ago
      pol('fl1', 'Farmworker leader Dolores Huerta dies at 96', 70),
      pol('l1', 'Dolores Huerta, farmworker organiser, dies at 96', 71),
      pol('l2', 'Dolores Huerta, farmworker leader, dead at 96', 72),
      pol('c1', 'Dolores Huerta, farmworker leader, dies at 96', 73),
      // sport: the Political Briefing's own tag, left out unless asked for
      pol('r2', 'Binance sponsors football club in record kit deal', 3, { c: 's' }),
      // stories on their own, for the topics and the search
      pol('l1', 'Starmer faces questions over Westminster budget', 10),
      pol('c1', 'Ukraine says Russia struck Kyiv overnight', 12),
      pol('r1', 'Trump said the plan was fine', 20),
      pol('c2', 'Israel election ends in deadlock', 30),
    ],
  };
  const science = {
    generated: ago(2), keepDays: 7, disciplines: [{ id: 'physics', label: 'Physics', aliases: [] }, { id: 'earth', label: 'Earth & Environment', aliases: ['environment'] }],
    sources: [{ id: 'nature', outlet: 'Nature', outletId: 'nature', name: 'Nature', kind: 'journal', tier: 1, disciplines: [] }],
    items: [
      { id: 's1', title: 'Methane leaks from oil and gas wells are worse than reported', url: 'https://nature.example/methane', source: 'nature', kind: 'journal', tier: 1, disciplines: ['earth'], type: 'news', published: ago(5), summary: 'Satellite surveys of oil and gas fields.' },
      { id: 's2', title: 'A quantum sensor maps magnetic fields', url: 'https://nature.example/quantum', source: 'nature', kind: 'journal', tier: 1, disciplines: ['physics'], type: 'paper', published: new Date(NOW - 40 * H).toISOString().slice(0, 10) + 'T00:00:00.000Z', summary: 'A diamond sensor.' },
    ],
  };
  const economics = {
    generated: ago(2), keepDays: 7, fields: [{ id: 'finance', label: 'Finance & markets', short: 'Finance & markets', aliases: [] }, { id: 'trade', label: 'Trade & globalisation', short: 'Trade', aliases: [] }],
    sources: [{ id: 'bbg', outlet: 'Bloomberg', outletId: 'bloomberg', name: 'Bloomberg', kind: 'news', tier: 4, fields: [] }],
    items: [
      { id: 'e1', title: 'Binance crypto hack: $4.7 billion in outflows after North Korea heist', url: 'https://bloomberg.example/binance', source: 'bbg', kind: 'news', tier: 4, fields: ['finance'], type: 'news', published: ago(7), summary: 'Withdrawals after the record hack.' },
      { id: 'e2', title: 'Trump tariff threat weighs on markets', url: 'https://bloomberg.example/tariff', source: 'bbg', kind: 'news', tier: 4, fields: ['trade'], type: 'news', published: ago(30), summary: 'Markets fell.' },
    ],
  };
  const digital = {
    generated: ago(2), keepDays: 7, fields: [{ id: 'security', label: 'Cybersecurity', short: 'Security', aliases: [] }, { id: 'ai', label: 'AI & machine learning', short: 'AI & ML', aliases: [] }],
    sources: [{ id: 'bbc-tech', outlet: 'BBC News', outletId: 'bbc-news', name: 'BBC News · Technology', kind: 'news', tier: 4, fields: [] }, { id: 'verge', outlet: 'The Verge', outletId: 'the-verge', name: 'The Verge', kind: 'news', tier: 4, fields: [] }],
    items: [
      // the same article as the Political Briefing's BBC News story (another scheme, no www.): one article, in two briefings
      { id: 'd1', title: 'Binance hack: billions stolen from crypto exchange', url: 'http://bbc.co.uk/news/binance-hack/', source: 'bbc-tech', kind: 'news', tier: 4, fields: ['security'], type: 'news', published: ago(6), summary: 'The largest crypto theft.' },
      { id: 'd2', title: 'AI chatbots get a new safety test', url: 'https://verge.example/ai', source: 'verge', kind: 'news', tier: 4, fields: ['ai'], type: 'news', published: ago(8), summary: 'Labs said the test is hard.' },
      { id: 'd3', title: 'Binance hack victims wait for refunds', url: 'https://verge.example/binance-refunds', source: 'verge', kind: 'news', tier: 4, fields: ['security'], type: 'news', published: ago(9), summary: 'Customers are still waiting.' },
    ],
  };
  return [political, science, economics, digital];
}
const model = buildModel(fixtureStores(), { now: NOW });
const url = i => i.u;

/* ---------------------------------------------------------------- the Political Briefing's topics */
// A constant as the page writes it (`const NAME = [...]`), read without running the page.
function literal(src, name) {
  const at = src.indexOf(`const ${name} = `), from = src.indexOf('=', at) + 2;
  let depth = 0, quote = null, i = from;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '[' || c === '{') depth++; else if ((c === ']' || c === '}') && --depth === 0) break;
  }
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${src.slice(from, i + 1)})`)));
}
const BRIEFING_PAGE = read('q/briefing.html');

test('topics: the Political Briefing\'s defaults, as its page has them', () => {
  assert.deepEqual(POLITICAL_TOPICS, literal(BRIEFING_PAGE, 'DEFAULT_TOPICS'));
  assert.equal(TOPICS_KEY, /const KEY = '([^']+)'/.exec(BRIEFING_PAGE)[1], 'the key the page keeps a viewer\'s topics under');
  // A viewer's own topics replace them; paused ones are left out, as the page counts none for them.
  const mine = topicsFrom([{ name: 'Elections', keywords: ['election', 'ballot'] }, { name: 'Paused', keywords: ['x'], paused: true }, { name: '', keywords: ['y'] }]);
  assert.deepEqual(mine.map(t => [t.id, t.label]), [['elections', 'Elections']]);
  assert.deepEqual(topicsFrom(null).map(t => t.label), POLITICAL_TOPICS.map(t => t[0]));
});

test('topics: every stored story is filed under exactly the topics the Political Briefing\'s own matching gives it', () => {
  // The page's matcher, run from the page's own source.
  const from = BRIEFING_PAGE.indexOf('const reCache = new Map();'), to = BRIEFING_PAGE.indexOf('const matches =');
  assert.ok(from > 0 && to > from, 'q/briefing.html still has its matcher');
  const ctx = vm.createContext({});
  vm.runInContext(BRIEFING_PAGE.slice(from, to), ctx);
  const DATA = json('briefing/data/latest.json');
  const topics = topicsFrom(null), theirs = topics.map(t => ({ id: t.id, test: ctx.matcher(t.keywords) }));
  const mineAll = normalise('political', DATA, { topics }).items;
  const wrong = [];
  DATA.items.forEach((i, n) => {
    const want = theirs.filter(t => t.test(`${i.t} ${i.d}`)).map(t => t.id).join(), got = mineAll[n].tp.join();
    if (want !== got) wrong.push(`${i.t}: page ${want}, Highbrowse ${got}`);
  });
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} stories filed differently`);
  assert.ok(mineAll.some(i => i.tp.length) && mineAll.length === DATA.items.length);
});

/* ---------------------------------------------------------------- terms and stories */
test('terms: names kept whole, US and AI in capitals, stop words and numbers out, plurals in', () => {
  const k = t => terms(t).map(w => w.k);
  assert.deepEqual(k('U.S. says AI firms in New York face new tariffs'), ['us', 'ai', 'firm', 'new-york', 'tariff']);
  assert.deepEqual(k('Let us see: the White House and the Supreme Court in 2026'), ['white-house', 'supreme-court']);
  assert.deepEqual(k("Trump's 25% tariffs hit Texas"), ['trump', 'tariff', 'texas']);
  assert.deepEqual(terms('Haley Stevens’ rivals').map(w => w.f), ['Haley', 'Stevens', 'rivals']);
});

test('stories: headlines that share their rarer words are one story, others stand alone', () => {
  // Forty headlines with words of their own around them, so the stories' words are as rare as in a real week.
  const items = ['Binance hack: $6 billion stolen', 'Binance hack costs $6 billion', 'FBI says North Korea behind $6 billion Binance hack', 'Rain in Spain', 'Train crash in Spain kills 40', 'Spain train crash: what we know',
    ...Array.from({ length: 40 }, (_, k) => `Zeta${k} and omega${k}`)].map((t, n) => ({ t, n }));
  const { groups } = cluster(items);
  const of = t => groups.find(g => g.items.some(i => i.t === t)).items.map(i => i.t).sort();
  assert.deepEqual(of('Binance hack costs $6 billion'), ['Binance hack costs $6 billion', 'Binance hack: $6 billion stolen', 'FBI says North Korea behind $6 billion Binance hack']);
  assert.deepEqual(of('Train crash in Spain kills 40'), ['Spain train crash: what we know', 'Train crash in Spain kills 40']);
  assert.deepEqual(of('Rain in Spain'), ['Rain in Spain'], 'one shared word is not a story');
  assert.equal(groups.reduce((a, g) => a + g.items.length, 0), items.length, 'every headline in one group');
});

/* ---------------------------------------------------------------- the analysis */
test('analysis: the last 24 hours, the biggest story counted by outlets across briefings, an article once', () => {
  const d = digest(model, '24h');
  assert.deepEqual(d.counts, { all: 13, soft: 1, political: 8, scientific: 1, economics: 1, digital: 3 });
  const s = d.stories[0];
  assert.match(s.lead.t, /Binance/);
  assert.deepEqual(s.briefings, ['political', 'economics', 'digital']);
  // Centre Wire, Right Times, Far Right Herald, Patriot Pulse, BBC News (in two briefings, once) and Bloomberg.
  assert.equal(s.outlets, 6);
  assert.equal(s.headlines, 6, 'the BBC News article the Political and Digital Briefings both carry is one headline');
  const bbc = s.entries.find(e => /bbc/.test(e.item.u));
  assert.deepEqual([bbc.item, ...bbc.also].map(i => i.b).sort(), ['digital', 'political']);
  assert.deepEqual(bbc.also.map(i => itemPage(i).split('#')[0]), [BRIEFING[bbc.also[0].b].page], 'the other briefing\'s own copy, for its link');
  assert.deepEqual(s.positions, { far_left: 0, left: 0, centre: 2, right: 1, far_right: 2 });
  // The words the Political Briefing's search box is given show every one of the story's political headlines there.
  assert.ok(s.key.map(k => k.toLowerCase()).includes(s.query), `"${s.query}" is one of its main terms`);
  assert.ok(s.entries.filter(e => e.item.b === 'political').every(e => e.item.t.toLowerCase().includes(s.query)), s.query);
  assert.ok(!s.entries.some(e => /football/.test(e.item.t)), 'sport is left out');
  assert.deepEqual(d.stories.map(x => x.id), [s.id], 'one story had two outlets or more in the last 24 hours');
  // Topics: the names first ("Binance", "North Korea"), not the words every story uses.
  assert.equal(d.topics[0].term, 'Binance');
  assert.equal(d.topics[0].outlets, 7);
  assert.deepEqual(d.topics[0].by, { political: 5, scientific: 0, economics: 1, digital: 2 });
  // Each briefing: its count, its own topics by count, its biggest story.
  const c = Object.fromEntries(d.coverage.map(x => [x.key, x]));
  assert.equal(c.political.count, 8);
  assert.equal(c.political.facets.find(f => f.id === 'ukraine-russia').count, 1);
  assert.equal(c.political.story.mineOutlets, 5);
  assert.deepEqual([c.scientific.papers, c.scientific.news, c.digital.facets[0].id], [0, 1, 'security']);
  assert.equal(c.economics.story, null, 'no story with two of its own outlets');
  // Shared: the Binance story is in three briefings; Binance is a name two of them used twice or more (the Economics
  // Briefing once: not enough to count).
  assert.equal(d.shared.stories[0].id, s.id);
  assert.deepEqual([d.shared.terms[0].term, d.shared.terms[0].briefings.join()], ['Binance', 'political,digital']);
});

test('analysis: the week, and the Political Briefing\'s spread across positions', () => {
  const d = digest(model, '7d');
  assert.equal(d.counts.all, 24);
  assert.deepEqual(d.stories.map(s => s.lead.t.match(/Binance|Murkowski|Huerta/)[0]), ['Binance', 'Murkowski', 'Huerta']);
  const sp = d.spread;
  assert.equal(sp.total, 17);
  assert.deepEqual(sp.positions.map(p => [p.key, p.items, p.publishers]), [['far_left', 1, 1], ['left', 3, 2], ['centre', 5, 2], ['right', 4, 2], ['far_right', 4, 2]]);
  // Murkowski: right and far right only; the Binance hack: three of its five on the right; Huerta: far left, left twice
  // and the centre.
  assert.deepEqual(sp.right.map(s => [s.lead.t.match(/Binance|Murkowski/)[0], s.lean]), [['Murkowski', 1], ['Binance', 0.6]]);
  assert.deepEqual(sp.left.map(s => [s.lead.t.match(/Huerta/)[0], s.lean]), [['Huerta', -0.75]]);
  assert.deepEqual(sp.stories.map(s => s.publishers), [5, 4, 4]);
});

test('analysis: windows count back from now, or from the newest refresh when every briefing is a day old', () => {
  const stale = fixtureStores().map(s => ({ ...s, generated: ago(80) }));
  assert.equal(referenceTime(stale, NOW), NOW - 80 * H);
  assert.equal(referenceTime(fixtureStores(), NOW), NOW);
  // A briefing that could not be read is missing, and the rest still work.
  const m = buildModel([null, ...fixtureStores().slice(1)], { now: NOW });
  assert.equal(m.briefings[0].missing, true);
  assert.equal(digest(m, '24h').counts.political, 0);
  assert.equal(search(m, { q: 'binance' }).total, 3);
});

/* ---------------------------------------------------------------- the search */
test('search: words at the start of a word, short words whole, plurals, phrases, one result per article', () => {
  const titles = q => search(model, { q }).results.map(r => r.item.t);
  assert.deepEqual(parseQuery('Tariffs  "Crypto Exchange" ai'), ['tariff', 'crypto exchange', 'ai']);
  assert.deepEqual(titles('ai'), ['AI chatbots get a new safety test'], '"ai" is not "said"');
  assert.deepEqual(titles('tariffs'), ['Trump tariff threat weighs on markets']);
  assert.deepEqual(titles('elect'), ['Israel election ends in deadlock'], 'the start of a word');
  assert.deepEqual(titles('lection'), [], 'not the middle of one');
  // A plural in "-ies" is searched as its stem in "-y", which the plural does not contain (on the real stores "companies"
  // missed 78 of the 88 stories that say "companies", and "series" and "species" found none): either form finds both,
  // and the plural counts as a whole word.
  const at = (text, q) => findWord(fold(text), parseQuery(q)[0])?.slice(0, 2);
  assert.deepEqual(parseQuery('companies'), ['company']);
  assert.deepEqual([at('Tech companies cut jobs', 'companies'), at('Tech companies cut jobs', 'company'), at('One company cuts jobs', 'companies')], [[5, 14], [5, 14], [4, 11]]);
  for (const [text, q] of [['A new series of tests', 'series'], ['Two species found', 'species'], ['Allies meet', 'allies'], ['Spies caught', 'spy'], ['Movies of the year', 'movies'], ['Studies show', 'studies'], ['Policies and politics', 'policy']]) {
    assert.ok(at(text, q), `"${q}" finds "${text}"`);
  }
  assert.equal(findWord(fold('Tech companies'), 'company')[2], true, 'a whole word');
  assert.equal(at('Today', 'toy'), undefined, 'no "-ies" form after a vowel');
  // A phrase's last word is a plural like any other: the topic "Senate races" finds "Senate race" too.
  assert.deepEqual(parseQuery('"Senate races" "tech companies" "supreme court"'), ['senate race', 'tech company', 'supreme court']);
  assert.deepEqual([at('Senate race tightens', '"Senate races"'), at('Tech companies cut jobs', '"tech companies"')], [[0, 11], [0, 14]]);
  assert.deepEqual([search(model, { q: '"governor races"' }).total, search(model, { q: '"governor race"' }).total], [2, 2]);
  // Initials with and without stops, and the names they stand for, are one topic (terms()), so each finds the others.
  assert.deepEqual([at('Iran deal with the U.S. stalls', 'US'), at('US deal', 'U.S.'), at('How A.I. is changing jobs', 'AI'), at('Made in the United States', 'us'),
    at('US deal', '"United States"'), at('Bodum USA recalls', 'U.S.')], [[19, 22], [0, 2], [4, 7], [12, 25], [0, 2], [6, 9]]);
  assert.equal(at('Ukraine talks', 'UK'), undefined, 'still a whole word');
  assert.equal(search(model, { q: '"crypto exchange"' }).total, 3);
  assert.equal(search(model, { q: '"exchange crypto"' }).total, 0, 'a phrase only in its order');
  const r = search(model, { q: 'binance' });
  assert.equal(r.total, 7);
  assert.equal(r.all, 7);
  assert.deepEqual(r.byBriefing, { political: 5, scientific: 0, economics: 1, digital: 2 }, 'the shared article counts in both briefings');
  const shared = r.results.find(x => /bbc/.test(x.item.u));
  assert.deepEqual([shared.item.b, ...shared.also.map(a => a.b)].sort(), ['digital', 'political']);
  assert.equal(search(model, { q: 'binance', soft: true }).total, 8, 'sport when asked for');
  assert.equal(search(model, { q: 'withdrawals' }).results[0].item.id, 'e1', 'summaries are searched');
  // Best match first: a word in the headline beats one only in the summary.
  assert.deepEqual(search(model, { q: 'record' }).results.map(x => x.item.id), ['e1'], 'in a summary; the sport story is out');
  assert.deepEqual(search(model, { q: 'record', soft: true }).results.map(x => x.item.id), ['p13', 'e1'], 'a headline before a summary');
});

test('search: the briefing, date and topic filters, and the counts they show', () => {
  const ids = s => s.results.map(r => r.item.id).sort();
  assert.deepEqual(ids(search(model, { q: 'binance', b: ['economics'] })), ['e1']);
  // A topic narrows to its briefing; the article both briefings carry is shown by the copy that passes.
  const sec = search(model, { q: 'binance', t: 'digital.security' });
  assert.deepEqual(ids(sec), ['d1', 'd3']);
  assert.deepEqual(sec.results.find(r => r.item.id === 'd1').also.map(a => a.b), ['political']);
  assert.equal(search(model, { q: 'binance', t: 'political.ukraine-russia' }).total, 0);
  assert.deepEqual(ids(search(model, { t: 'political.ukraine-russia' })), ['p15']);
  assert.equal(search(model, { q: 'binance' }).byTopic['digital.security'], 2);
  // Windows: the last 24 hours, or one day.
  assert.equal(search(model, { q: 'murkowski', w: '24h' }).total, 0);
  assert.equal(search(model, { q: 'murkowski', w: '3d' }).total, 4);
  const day = localDay(NOW - 50 * H);
  assert.ok(search(model, { w: day }).results.every(r => r.item.day === day) && search(model, { w: day }).total > 0);
  // No words: every story in the window, newest first.
  const all = search(model, {});
  assert.equal(all.order, 'newest');
  assert.ok(all.results.every((r, k) => !k || all.results[k - 1].item.at >= r.item.at));
  assert.equal(search(model, { q: 'binance', sort: 'newest' }).results[0].item.id, 'p0');
});

test('search: fast enough on the four real stores', () => {
  const stores = BRIEFINGS.map(b => json(b.data));
  let t = performance.now();
  const real = buildModel(stores);
  const build = performance.now() - t;
  const queries = ['election', 'ukraine war', 'ai chips', 'inflation', '"climate change"', 'trump tariffs', 'quantum', 'nato'];
  t = performance.now();
  for (let k = 0; k < 40; k++) search(real, { q: queries[k % queries.length] });
  const each = (performance.now() - t) / 40;
  assert.ok(build < 8000, `the model took ${Math.round(build)} ms`);
  assert.ok(each < 60, `a search took ${each.toFixed(1)} ms on average`);
  assert.ok(real.items.length === stores.reduce((a, s) => a + s.items.length, 0));
});

// A name or term on the page (the biggest topics, each briefing's names and terms, the shared ones) says how many
// headlines used it and opens a search for it: the search must find every one of them. ("US" missed its "U.S.", "USA"
// and "United States" headlines, 111 of 419 in a week, and "AI" its "A.I." ones.) Names of two words are left out
// here: a headline that puts a possessive or a quote between the two ("Trump's administration") is not found by the
// phrase yet, a known gap; their plural and singular are held above.
test('search: each name or term the page shows finds every headline it counted, on the real stores', () => {
  const real = buildModel(BRIEFINGS.map(b => json(b.data)));
  const missed = [];
  for (const w of ['24h', '7d']) {
    const d = digest(real, w);
    for (const [t, b] of [...d.topics.map(x => [x, []]), ...d.coverage.flatMap(c => c.terms.map(x => [x, [c.key]])), ...d.shared.terms.map(x => [x, []])]) {
      if (t.k.includes(' ')) continue;
      const r = search(real, { q: /\s/.test(t.term) ? `"${t.term}"` : t.term, w, b });
      const found = new Set(r.results.flatMap(x => [x.item, ...x.also]).map(i => i.n));
      const counted = inWindow(real.items, w, real.ref).filter(i => !i.soft && (!b.length || b.includes(i.b)) && i.tm.some(x => x.k === t.k));
      assert.equal(counted.length, b.length ? t.by[b[0]] : t.items, `${w} ${t.term}: the headlines it counted`);
      for (const i of counted) if (!found.has(i.n)) missed.push(`${w} ${t.term}: ${i.t}`);
    }
  }
  assert.deepEqual(missed.slice(0, 5), [], `${missed.length} headlines a term counted are not found by its search`);
});

/* ---------------------------------------------------------------- links into the briefings */
test('links: each briefing reads its link with its own code and shows the story', () => {
  const stores = BRIEFINGS.map(b => json(b.data));
  const real = buildModel(stores);
  // The subject briefings: their own parseHash (a remembered discipline or field must not hide the story) and filterItems.
  for (const [k, view, facets, key] of [[1, SCI, 'disciplines', 'd'], [2, ECON, 'fields', 'f'], [3, DIG, 'fields', 'f']]) {
    const b = BRIEFINGS[k], store = stores[k], src = new Map(store.sources.map(s => [s.id, s]));
    const outletOf = id => { const s = src.get(id); return s ? { id: s.outletId, name: s.outlet } : null; };
    const gen = Date.parse(store.generated);
    const sample = real.items.filter(i => i.b === b.key && i.at > gen - 6 * 24 * H).slice(0, 150);
    assert.ok(sample.length > 10, `${b.key}: stories to try`);
    for (const i of sample) {
      const link = itemPage(i), [page, hash] = link.split('#');
      assert.equal(page, b.page);
      const state = view.parseHash('#' + hash, store[facets], { [key]: store[facets][0].id });
      assert.deepEqual([state[key], state.w], ['all', '7d'], `${b.key}: ${link}`);
      const shown = view.filterItems(store.items, state, { now: gen, outletOf });
      assert.ok(shown.some(x => x.id === i.id), `${b.key}: ${i.t} is shown by ${link}`);
    }
    // A topic opens the briefing on it.
    const f = store[facets][1];
    assert.equal(view.parseHash('#' + briefingPage(b.key, { topic: f.id, w: '24h' }).split('#')[1], store[facets])[key], f.id);
  }
  // The Political Briefing: its search box matches within a headline, at most 120 characters of it, over seven days.
  const pages = real.items.filter(i => i.b === 'political').slice(0, 400);
  for (const i of pages) {
    const [page, hash] = itemPage(i).split('#'), p = new URLSearchParams(hash);
    assert.equal(page, 'q/briefing.html');
    assert.equal(p.get('w'), '7d');
    assert.ok(i.t.toLowerCase().includes(p.get('q').slice(0, 120).trim().toLowerCase()), i.t);
  }
  // A story's own query finds its political headlines there.
  const s = digest(real, '7d').stories.find(x => x.publishers);
  assert.ok(s.entries.filter(e => e.item.b === 'political').some(e => e.item.t.toLowerCase().includes(s.query)), s.query);
  // Sport, entertainment and lifestyle (the search lists them when asked): the link says soft=1, which the page shows on
  // that visit, or its Hard news only, on by default, would hide the story (tests/briefing.test.mjs holds the page to it).
  const soft = real.items.find(i => i.b === 'political' && i.soft), hard = real.items.find(i => i.b === 'political' && !i.soft);
  assert.deepEqual([soft, hard].map(i => new URLSearchParams(itemPage(i).split('#')[1]).get('soft')), ['1', null]);
});

/* ---------------------------------------------------------------- the page's address */
test('address: views and searches round-trip through the hash, unknown values fall back', () => {
  assert.deepEqual(parseHash(''), { ...DEFAULTS, b: [] });
  assert.equal(parseHash('#tab=week').tab, 'week');
  const s = parseHash('#q=binance%20hack&b=digital,nope,political&w=24h&t=digital.security&soft=1&sort=newest');
  assert.deepEqual(s, { tab: 'search', q: 'binance hack', b: ['digital', 'political'], w: '24h', t: 'digital.security', soft: true, sort: 'newest' });
  assert.equal(toHash(s), '#q=binance+hack&b=digital%2Cpolitical&w=24h&t=digital.security&soft=1&sort=newest');
  assert.deepEqual(parseHash(toHash(s)), s);
  assert.equal(toHash({ ...DEFAULTS, tab: 'search' }), '#tab=search');
  assert.equal(toHash({ ...DEFAULTS }), '');
  assert.deepEqual([parseHash('#w=1y').w, parseHash('#t=nope.x').t, parseHash('#tab=x').tab], ['7d', '', 'today']);
  assert.equal(parseHash('#w=2026-11-02').tab, 'search');
});

/* ---------------------------------------------------------------- the module and its figure */
test('module: Highbrowse holds its landing page and the four briefings; the page is hooked up to it', () => {
  const reg = json('registry.json'), hb = reg.suites.find(s => s.id === 'hb');
  assert.deepEqual(hb.modules.map(m => m.id), ['highbrowse', 'briefing', 'science-briefing', 'econ-briefing', 'digital-briefing']);
  assert.deepEqual(hb.modules.slice(1).map(m => m.url), BRIEFINGS.map(b => b.page), 'the briefings keep their pages, in analysis.js\'s order');
  assert.deepEqual(BRIEFINGS.map(b => b.id), hb.modules.slice(1).map(m => m.id));
  assert.deepEqual([hb.mark, hb.figure], ['design/brand-hb-icon.svg', 'design/brand-hb.svg']);
  const html = read('highbrowse/index.html');
  assert.match(html, /<html lang="en" data-suite="hb" class="prp">/);
  assert.match(html, /<title>Highbrowse · VM<\/title>/);
  assert.match(html, /<link rel="icon" href="\.\.\/design\/brand-vm-icon\.svg"/);
  assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="hb" data-module="highbrowse" data-shell="\.\.\/" defer><\/script>/);
  assert.match(html, /<div class="prp-eyebrow">Highbrowse <span class="sep">·<\/span>/);
  assert.match(html, /<img class="figure" src="\.\.\/design\/brand-hb\.svg"[^>]+alt="[^"]{20,}"/);
  for (const [page, id] of [['q/briefing.html', 'briefing'], ['science/briefing/index.html', 'science-briefing'], ['econ/briefing/index.html', 'econ-briefing'], ['digital/briefing/index.html', 'digital-briefing']]) {
    const p = read(page);
    assert.match(p, /<html lang="en" (class="prp" )?data-suite="hb"/, page);
    assert.match(p, new RegExp(`data-suite="hb" data-module="${id}"`), page);
    assert.match(p, /<div class="prp-eyebrow">Highbrowse <span class="sep">·<\/span>/, page);
  }
  // Only tokens in the page's own CSS, but for the Political Briefing's position colours, defined for both themes.
  const css = read('highbrowse/highbrowse.css').replace(/--pos-[\w]+: #[0-9a-f]{6}/g, '');
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g), null);
});

test('figure: the Highbrowse figure and its icon, well formed, in the design system\'s colours', () => {
  const tokens = new Set(read('design/prp.css').match(/#[0-9a-f]{6}\b/gi).map(c => c.toLowerCase()));
  for (const [file, box] of [['design/brand-hb.svg', '0 0 256 256'], ['design/brand-hb-icon.svg', '0 0 32 32']]) {
    const svg = read(file);
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-labelledby="[\\w-]+ [\\w-]+">`), file);
    assert.match(svg, /<title id="[\w-]+">Highbrowse<\/title>/, file);
    for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!body.includes('--'), `${file}: "--" inside a comment is not XML`);
    // Every colour is one of the design system's (the dark tile is its ink, the paper the dark theme's ink, …).
    for (const c of svg.match(/#[0-9a-f]{6}\b/gi)) assert.ok(tokens.has(c.toLowerCase()), `${file}: ${c} is not a design-system colour`);
    // Balanced: every element opened is closed (a cheap well-formedness check; the page test draws it). Comments may
    // name an element ("<text>"), so they are taken out first.
    const tags = svg.replace(/<!--[\s\S]*?-->/g, '');
    const opens = (tags.match(/<(?!\/|!)[a-z]+[^>]*[^/]>/g) || []).length, closes = (tags.match(/<\/[a-z]+>/g) || []).length;
    assert.equal(opens, closes, file);
  }
  const fig = read('design/brand-hb.svg');
  for (const words of ['ACTA DIURNA', 'NOVA VERITATIS']) assert.match(fig, new RegExp(`>${words}</text>`), 'the Latin headlines');
  assert.match(fig, /<circle cx="133.6" cy="95.6" r="5.3" fill="none" stroke="#d9a35c"/, 'the monocle');
});

/* ---------------------------------------------------------------- the page */
test('page: the analysis renders, the search finds a known story, and its links open the right pages', pageTest, async t => {
  const res = await fetch(`${BASE}/highbrowse/`).catch(() => null);
  if (!res?.ok) { t.skip(`Highbrowse is not deployed at ${BASE} (set JDPI_URL to test a local copy)`); return; }
  // The stores the page reads, from the same site, and what the page should make of them.
  const stores = await Promise.all(BRIEFINGS.map(b => fetch(`${BASE}/${b.data}`).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  const m = buildModel(stores), today = digest(m, '24h'), week = digest(m, '7d');
  const browser = await launch();
  t.after(() => browser.close());
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); }); return p; };
  const page = watch(await browser.newPage({ viewport: { width: 1360, height: 900 } }));
  await page.goto(`${BASE}/highbrowse/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('html[data-ready="1"]', { timeout: 30000 });

  // The analysis: its five sections, the stories and topics the analysis finds, the four briefings.
  const shown = await page.evaluate(() => ({
    sections: [...document.querySelectorAll('#panel-today .sec h2')].map(h => h.textContent.replace(/^\d+\./, '')),
    stories: document.querySelectorAll('#panel-today .story').length, lead: document.querySelector('#panel-today .story h3 a')?.textContent,
    topics: [...document.querySelectorAll('#panel-today .topics .nm')].map(a => a.textContent),
    briefs: [...document.querySelectorAll('#panel-today .brief')].map(b => b.dataset.b), eyebrow: document.querySelector('.prp-eyebrow').textContent.replace(/\s+/g, ' ').trim(),
  }));
  assert.deepEqual(shown.sections, ['The biggest stories', 'The biggest topics', 'What each briefing covers most', 'Shared across briefings', 'The Political Briefing across positions']);
  assert.equal(shown.stories, today.stories.length);
  if (today.stories.length) assert.equal(shown.lead, today.stories[0].lead.t);
  // The lead's line links to every briefing that carries its article (an article in two briefings is listed once).
  if (today.stories.length) {
    assert.deepEqual(await page.$$eval('#panel-today .story.lead .st-src a.bp', as => as.map(a => a.textContent)),
      [today.stories[0].lead, ...today.stories[0].entries[0].also].map(i => `In the ${BRIEFING[i.b].name} ›`));
  }
  assert.deepEqual(shown.topics, today.topics.map(x => x.term));
  assert.deepEqual(shown.briefs, ['political', 'scientific', 'economics', 'digital']);
  assert.match(shown.eyebrow, /^Highbrowse · \w+day,? \d+ \w+ \d{4}$/, 'the module, and the day the page is for');
  await page.click('#tab-week');
  await page.waitForSelector('#panel-week .story', { timeout: 20000 });
  assert.equal(await page.evaluate(() => location.hash), '#tab=week');
  assert.equal(await page.textContent('#panel-week .story h3 a'), week.stories[0].lead.t);
  // The header's count is the week's hard news, as This week counts it (it once counted every stored story: soft ones
  // and those a little over seven days old too).
  const [metaCount, weekCount] = await page.evaluate(() => [document.querySelector('#meta b').textContent, document.querySelector('#panel-week .lede b').textContent]);
  assert.equal(weekCount, `${metaCount} stories`);
  assert.ok(Math.abs(Number(metaCount.replace(/,/g, '')) - m.week.length) <= 5, `${metaCount} stories in the week, ${m.week.length} by the model`);

  // The search finds a known story: the week's biggest, by two of its main terms.
  const known = week.stories[0].lead, q = week.stories[0].key.slice(0, 2).join(' ');
  await page.fill('#q', q);
  await page.waitForFunction(w => document.querySelector('#r-title')?.textContent.startsWith(`“${w}”`), q, { timeout: 10000 });
  assert.equal(await page.evaluate(() => location.hash.startsWith('#q=')), true, 'the search is in the address');
  const expect = search(m, { q });
  assert.match(await page.textContent('#r-status'), new RegExp(`^${expect.total.toLocaleString('en-GB')} stor`));
  const hit = page.locator('#results .res', { has: page.locator(`.r-title a[href="${known.u}"]`) });
  assert.equal(await hit.count(), 1, `"${q}" finds ${known.t}`);
  // Its links: the article at its publisher in a new tab, and the story in its briefing (on its own: this tab).
  assert.deepEqual(await hit.locator('.r-title a').evaluate(a => [a.target, a.rel]), ['_blank', 'noopener']);
  const toBriefing = await hit.locator('.r3 a.bp').first().evaluate(a => [a.href, a.target]);
  assert.deepEqual(toBriefing, [new URL(itemPage(known), `${BASE}/`).href, '_self']);
  // A briefing chip narrows the search, and every count agrees.
  await page.click(`#b [data-pick="${known.b}"]`);
  await page.waitForFunction(k => document.querySelectorAll(`#results .res`).length && [...document.querySelectorAll('#results .res')].every(r => r.dataset.b === k || r.querySelector(`.bchip[data-b="${k}"]`)), known.b);
  assert.equal(await page.evaluate(() => location.hash.includes('b=')), true);

  // The link opens the briefing on the story.
  const brief = watch(await browser.newPage({ viewport: { width: 1360, height: 900 } }));
  await brief.goto(toBriefing[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
  const where = known.b === 'political' ? `#out .story a.t[href="${known.u}"]` : `#list .entry h4 a[href="${known.u}"]`;
  await brief.waitForSelector(where, { timeout: 20000 });

  // Inside the shell: the story's link moves the shell to its briefing's own frame, on the story.
  const shell = watch(await browser.newPage({ viewport: { width: 1360, height: 900 } }));
  await shell.goto(`${BASE}/#/hb/highbrowse`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const frame = await (await shell.waitForSelector('#frames iframe.active[data-module="highbrowse"]', { timeout: 20000 })).contentFrame();
  await frame.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  const link = frame.locator('#panel-today .story .st-src a.bp').first();
  if (await link.count()) {
    const [href, target] = await link.evaluate(a => [a.href, a.target]);
    const lead = today.stories[0].lead, b = BRIEFING[lead.b];
    assert.equal(target, '_top');
    assert.equal(href, `${BASE}/#/hb/${b.id}?at=${encodeURIComponent(new URL(itemPage(lead), `${BASE}/`).href)}`);
    await link.click();
    await shell.waitForFunction(id => location.hash.startsWith(`#/hb/${id}?at=`), b.id, { timeout: 10000 });
    const inner = await (await shell.waitForSelector(`#frames iframe.active[data-module="${b.id}"]`, { timeout: 20000 })).contentFrame();
    await inner.waitForSelector(lead.b === 'political' ? `#out .story a.t[href="${lead.u}"]` : `#list .entry h4 a[href="${lead.u}"]`, { timeout: 30000 });
    assert.match(await shell.textContent('#crumbs'), new RegExp(`Highbrowse.*${b.name}`));
  }

  // Dark: the page follows the theme; at phone width nothing scrolls sideways.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 19, 24)');
  const phone = watch(await browser.newPage({ viewport: { width: 360, height: 780 } }));
  await phone.goto(`${BASE}/highbrowse/#tab=week`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await phone.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  await phone.waitForSelector('#panel-week .story');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 360 px');
  assert.deepEqual(errors, []);
});
