// Free sources lead: Jude's rule of 6 November 2026 for every section that gathers the day's biggest stories from many
// outlets (design/prp-access.js, with each source's class in design/prp-access.json). A story's lead link is a free source
// whenever a free source carries it; a story only sign-up, metered or paid sources carry never takes the top place of a
// section or list; links to sources that are not free are labelled, with a free copy of the same story beside them
// where VM already groups the story across sources.
//   1. The rule on small fixtures, with no network: the shared module, Highbrowse's analysis, the subject briefings'
//      merge and order, and the Global Headline Tracker's outlet groups.
//   2. The table: well formed, and every source VM collects from is in it.
//   3. Every section on its committed data (the four briefings' stores, and the Tracker's outlet list).
//   4. The pages, on fixtures served in place of the data: the labels and the free copies show, can be reached by
//      keyboard, and read as part of their link; light, dark and phone width, with no console errors.
//   npm run test:unit -- tests/prp-access.test.mjs      (1 to 3)
//   npm run test:e2e -- tests/prp-access.test.mjs       (4 too, against a local copy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import '../design/prp-access.js';
import { buildModel, digest, search, freeAlt, isFree as hbFree, normalise as hbNormalise, POSITIONS } from '../highbrowse/analysis.js';
import * as SCI from '../science/briefing/view.js';
import * as ECON from '../econ/briefing/view.js';
import * as DIG from '../digital/briefing/view.js';
import { mergeStore as sciMerge } from '../science/scripts/briefing-feeds.mjs';
import { mergeStore as econMerge } from '../econ/scripts/briefing-feeds.mjs';
import { mergeStore as digMerge, parseDigitalFeed, normalise as digNormalise } from '../digital/scripts/briefing-feeds.mjs';
import { SOURCES as POL_SOURCES } from '../briefing/scripts/sources.mjs';
import { SOURCES as SCI_SOURCES } from '../science/scripts/briefing-sources.mjs';
import { SOURCES as ECON_SOURCES } from '../econ/scripts/briefing-sources.mjs';
import { SOURCES as DIG_SOURCES } from '../digital/scripts/briefing-sources.mjs';

const A = globalThis.PRPAccess;
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const H = 36e5;

/* --- a small table: real feed ids (so the pages' fixtures join), made-up hosts --------------------------------------- */
const FIX = {
  checked: '2026-11-07',
  sources: [
    { name: 'The Guardian', class: 'free', keys: ['political:guardian'], hosts: ['freedaily.example'] },
    { name: 'Fox News', class: 'free', keys: ['political:foxnews'], hosts: [] },
    { name: 'The New York Times', class: 'paid', keys: ['political:nyt'], hosts: ['paytimes.example'], match: [{ url: '/free-to-read/', class: 'free' }] },
    { name: 'The Telegraph', class: 'paid', keys: ['political:telegraph'], hosts: [] },
    { name: 'Vox', class: 'paid', keys: ['political:vox'], hosts: [] },
    { name: 'The Atlantic', class: 'metered', keys: ['political:atlantic'], hosts: [] },
    { name: 'The Intercept', class: 'signup', keys: ['political:intercept'], hosts: ['signup.example'] },
    { name: 'Nature', class: 'paid', keys: ['science:nature'], hosts: [] },
    { name: 'Phys.org', class: 'free', keys: ['science:physorg-physics'], hosts: [] },
    { name: 'Unchecked Herald', class: 'unknown', keys: ['political:unchecked'], hosts: ['unchecked.example'] },
  ],
};
const T = A.table(FIX);
const free = x => A.isFree(typeof x === 'string' ? x : x.acc ?? x.access);

/* ================================================================ 1. the rule on fixtures */
test('rule: the first free entry takes the top place, every other entry keeps its order', () => {
  const L = ['paid', 'metered', 'free', 'signup', 'free'].map((c, n) => ({ n, access: c }));
  assert.deepEqual(A.leadFree(L).map(x => x.n), [2, 0, 1, 3, 4]);
  assert.deepEqual(A.leadFree(L.slice(0, 2)).map(x => x.n), [0, 1], 'nothing free: the order stands');
  assert.deepEqual(A.leadFree([{ n: 0, access: 'paid' }, { n: 1, access: 'unknown' }]).map(x => x.n), [1, 0], 'unknown counts as free');
  assert.deepEqual(A.leadFree([{ n: 0 }, { n: 1, access: 'paid' }]).map(x => x.n), [0, 1], 'no class counts as free');
  assert.deepEqual(A.leadFree([]), []);
  // Groups (the Tracker's outlets): each led by its free story, the first group with one at the top.
  const g = A.leadFreeGroups([[{ n: 'a1', access: 'paid' }, { n: 'a2', access: 'paid' }], [{ n: 'b1', access: 'metered' }, { n: 'b2' }], [{ n: 'c1' }]]);
  assert.deepEqual(g.map(x => x.map(i => i.n)), [['b2', 'b1'], ['a1', 'a2'], ['c1']]);
});

test('table: feed ids, hosts and the domains above them, parts of a site by address, names last; relays never decide', () => {
  assert.equal(T.classify({ briefing: 'political', id: 'nyt' }), 'paid');
  assert.equal(T.classify({ briefing: 'political', id: 'intercept' }), 'signup');
  assert.equal(T.classify({ host: 'www.paytimes.example' }), 'paid');
  assert.equal(T.classify({ host: 'edition.paytimes.example' }), 'paid', 'a subdomain is its site');
  assert.equal(T.classify({ host: 'paytimes.example', url: 'https://paytimes.example/free-to-read/x' }), 'free', 'a free part of a paid site');
  assert.equal(T.classify({ url: 'https://news.google.com/rss/articles/abc', name: 'The Atlantic' }), 'metered', 'a Google News link is looked up by the name');
  assert.equal(T.classify({ host: 'news.google.com' }), 'unknown');
  assert.equal(T.classify({ host: 'example' }), 'unknown', 'never a bare suffix');
  assert.equal(T.classify({ briefing: 'political', id: 'nobody' }), 'unknown', 'a source the table does not have');
  assert.equal(T.free({ briefing: 'political', id: 'nobody' }), true);
  assert.equal(T.classify({ briefing: 'political', id: 'unchecked' }), 'unknown');
  assert.equal(A.isFree('unknown'), true, 'a source that could not be checked counts as free');
  // The publisher's own mark on one article overrides its source.
  assert.equal(T.classify({ briefing: 'science', id: 'nature', mark: 'free' }), 'free');
  assert.equal(T.classify({ briefing: 'political', id: 'guardian', mark: 'paid' }), 'paid');
  assert.equal(T.classify({ briefing: 'science', id: 'nature', mark: 'nonsense' }), 'paid', 'a mark that is not a class is ignored');
  // A host two sources of different classes share decides nothing.
  const mixed = A.table({ sources: [{ name: 'A', class: 'paid', hosts: ['shared.example'] }, { name: 'B', class: 'free', hosts: ['shared.example'] }] });
  assert.equal(mixed.classify({ host: 'shared.example' }), 'unknown');
  // A table that cannot be read: every source counts as free.
  assert.equal(A.table(null).classify({ briefing: 'political', id: 'nyt' }), 'unknown');
});

test('marks: the feed flags builders already read (LWN\'s "[$]", isAccessibleForFree, an open licence) and nothing else', () => {
  assert.equal(A.feedMark('<item><title>[$] Guidelines for panics in kernel code</title></item>'), 'paid');
  assert.equal(A.feedMark('<item><title><![CDATA[[$] Guidelines]]></title></item>'), 'paid');
  assert.equal(A.feedMark('<item><title>Free article</title><dc:rights>http://creativecommons.org/licenses/by/4.0/</dc:rights></item>'), 'free');
  assert.equal(A.feedMark('<entry><link rel="license" href="https://creativecommons.org/licenses/by/4.0/"/></entry>'), null, 'only the licence elements count');
  assert.equal(A.feedMark('<item><cc:license rdf:resource="https://creativecommons.org/licenses/by-nc/4.0/"/></item>'), 'free');
  assert.equal(A.feedMark('<item>"isAccessibleForFree": false</item>'), 'paid');
  assert.equal(A.feedMark('<item>"isAccessibleForFree":"True"</item>'), 'free');
  assert.equal(A.feedMark('<item><dc:rights>http://arxiv.org/licenses/nonexclusive-distrib/1.0/</dc:rights></item>'), null);
  assert.equal(A.feedMark('<item><dc:rights>Personal use only</dc:rights></item>'), null);
  // The Digital Briefing keeps LWN's mark on the item (and takes it out of the title).
  const lwn = DIG_SOURCES.find(s => s.id === 'lwn');
  const raw = parseDigitalFeed('<rss><channel><item><title>[$] Guidelines for panics in kernel code</title><link>https://lwn.net/Articles/1/</link><pubDate>Fri, 06 Nov 2026 10:00:00 +0000</pubDate><description>Kernel developers debate when to panic.</description></item></channel></rss>');
  const item = digNormalise(raw[0], lwn, '2026-11-06T12:00:00.000Z');
  assert.equal(item.title, 'Guidelines for panics in kernel code');
  assert.equal(item.accessMark, 'paid');
  // A mark seen on this run's copy of a stored article holds for the stored copy, which the store keeps.
  const now = Date.parse('2026-11-07T00:00:00Z');
  const stored = { ...item }; delete stored.accessMark;
  const merged = digMerge({ prevItems: [stored], freshItems: [item], sources: DIG_SOURCES, now });
  assert.deepEqual(merged.map(i => [i.source, i.access, i.accessMark]), [['lwn', 'paid', 'paid']]);
});

test('labels: a word on every link to a source that is not free, read as part of the link; a free copy only by its address', () => {
  assert.equal(A.label('free'), '');
  assert.equal(A.label('unknown'), '');
  assert.equal(A.label(undefined), '');
  for (const [c, word] of [['paid', 'Paywall'], ['metered', 'Paywall'], ['signup', 'Sign-up']]) {
    const h = A.label(c);
    assert.match(h, new RegExp(`^<span class="prp-vh">, </span><span class="prp-access" data-access="${c}" title="[^"]+">${word}</span>$`));
  }
  assert.match(A.altLink({ url: 'https://freedaily.example/a', outlet: 'Free Daily', title: 'A "story"' }), /^<a class="prp-access-alt" href="https:\/\/freedaily\.example\/a" target="_blank" rel="noopener" title="The same story, free to read: A &quot;story&quot;">Free at Free Daily<\/a>$/);
  assert.equal(A.altLink({ url: 'javascript:alert(1)', outlet: 'X' }), '', 'only http(s) addresses');
});

/* --- Highbrowse: a made-up day of political headlines ---------------------------------------------------------------- */
const NOW = Date.parse('2026-11-07T12:00:00Z');
const ago = h => new Date(NOW - h * H).toISOString();
const HB_SOURCES = [['guardian', 'The Guardian', 'left'], ['foxnews', 'Fox News', 'right'], ['nyt', 'The New York Times', 'centre'], ['telegraph', 'The Telegraph', 'right'],
  ['vox', 'Vox', 'left'], ['atlantic', 'The Atlantic', 'centre'], ['unchecked', 'Unchecked Herald', 'far_right']]
  .map(([id, name, position]) => ({ id, name, position, country: 'US', caution: false, active: true, reserve: false, status: 'ok' }));
const pol = (s, t, h) => ({ s, t, u: `https://${s}.example/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, p: ago(h), d: `${t}.` });
function hbStores() {
  const political = {
    generated: ago(1), keepDays: 7, perPosition: 10, positions: POSITIONS.map(key => ({ key, label: key })), sources: HB_SOURCES,
    items: [
      // A: four outlets, none of them free: the most outlets, but it may not lead.
      pol('nyt', 'Glacier collapse in Patagonia buries mountain village', 2),
      pol('telegraph', 'Patagonia glacier collapse buries mountain village', 3),
      pol('vox', 'Mountain village buried as Patagonia glacier collapses', 4),
      pol('atlantic', 'Patagonia glacier collapse: mountain village buried', 5),
      // B: three outlets, two of them free; the paid headline is the most typical, but a free one leads.
      pol('nyt', 'Senate passes Kowalski water reform bill', 6),
      pol('guardian', 'Kowalski water reform bill passes Senate vote', 7),
      pol('foxnews', 'Senate approves Kowalski water bill', 8),
      // C: two outlets, one that could not be checked (counts as free) and one paid.
      pol('unchecked', 'Drought rations Quillon reservoir towns', 9),
      pol('telegraph', 'Quillon reservoir towns ration water in drought', 10),
      // Headlines on their own, so the stories' words are as rare as in a real day.
      ...Array.from({ length: 40 }, (_, k) => pol(['guardian', 'foxnews', 'vox'][k % 3], `Zeta${k} and omega${k} meet`, 11 + k / 10)),
    ],
  };
  const science = {
    generated: ago(1), keepDays: 7, disciplines: [{ id: 'physics', label: 'Physics', aliases: [] }],
    sources: [{ id: 'nature', outlet: 'Nature', outletId: 'nature', name: 'Nature', kind: 'journal', tier: 1, disciplines: [] }],
    items: [
      { id: 's1', title: 'An open paper on muon magnets', url: 'https://nature.example/open', source: 'nature', kind: 'journal', tier: 1, disciplines: ['physics'], type: 'paper', published: ago(3), summary: '', accessMark: 'free' },
      { id: 's2', title: 'A paywalled paper on muon optics', url: 'https://nature.example/closed', source: 'nature', kind: 'journal', tier: 1, disciplines: ['physics'], type: 'paper', published: ago(4), summary: '' },
    ],
  };
  return [political, science, null, null];
}

test('Highbrowse: a story a free source carries leads with it, a story only paid sources carry never comes first', () => {
  const plain = digest(buildModel(hbStores(), { now: NOW }), '24h');
  assert.match(plain.stories[0].lead.t, /glacier/i, 'without the table, the most outlets come first (the order the rule changes)');
  const m = buildModel(hbStores(), { now: NOW, access: T }), d = digest(m, '24h');
  const leads = d.stories.map(s => [s.lead.t.match(/glacier|Kowalski|Quillon/i)[0].replace(/^g/, 'G'), s.lead.sid, s.free]);
  assert.deepEqual(leads[0].slice(0, 1), ['Kowalski']);
  assert.ok(['guardian', 'foxnews'].includes(leads[0][1]) && leads[0][2], `a free headline leads: ${leads[0]}`);
  // Glacier is still there, lower, in its usual order (by outlets: before Quillon's two); its lead is not free.
  assert.deepEqual(leads.slice(1).map(x => x[0]), ['Glacier', 'Quillon']);
  assert.equal(leads[1][2], false);
  // Quillon: the source that could not be checked counts as free, so it leads its story.
  assert.deepEqual(leads[2].slice(1), ['unchecked', true]);
  // The paid headline of the Kowalski story is offered with the story's free lead beside it; the Glacier story has none.
  const k = d.stories[0], nyt = k.entries.find(e => e.item.sid === 'nyt').item;
  assert.equal(nyt.acc, 'paid');
  assert.equal(freeAlt(m, nyt, k), k.lead);
  assert.equal(freeAlt(m, k.lead, k), null, 'a free headline needs none');
  const g = d.stories[1];
  assert.ok(g.entries.every(e => freeAlt(m, e.item, g) === null), 'never a guess: no free copy where the story has none');
  // Every list of stories keeps the rule: each briefing's biggest story, the political spread.
  const pc = d.coverage.find(c => c.key === 'political');
  assert.match(pc.story.here.t, /Kowalski/);
  assert.ok(hbFree(pc.story.here), 'its own free headline stands for it');
  assert.ok(d.spread.stories[0].free, 'the biggest political stories table');
  assert.match(d.spread.stories[0].lead.t, /Kowalski/);
  // The search keeps the rule too, in both orders and after any filter: the first free result takes the top place and
  // the rest keep their order; it offers the free copy the analysis grouped.
  const q0 = search(buildModel(hbStores(), { now: NOW }), { q: 'kowalski' }).results.map(r => r.item.u);
  assert.match(q0[0], /nyt\.example/, 'without the table, the best match (the paid headline) comes first');
  const q = search(m, { q: 'kowalski' });
  assert.deepEqual(q.results.map(r => r.item.u), [q0[1], q0[0], ...q0.slice(2)], 'the free result leads, the rest in their order');
  for (const opts of [{ q: 'kowalski', sort: 'newest' }, { q: 'glacier' }, { q: '', w: '24h' }, { q: '', w: '24h', sort: 'best' }, { q: 'patagonia quillon kowalski' }]) {
    const r = search(m, opts).results;
    if (r.some(x => hbFree(x.item))) assert.ok(hbFree(r[0].item), `${JSON.stringify(opts)}: ${r[0].item.src} first`);
  }
  assert.ok(search(m, { q: 'glacier' }).results.every(x => !hbFree(x.item)), 'a search only paid headlines match keeps its order');
  const hit = q.results.find(r => r.item.sid === 'nyt').item;
  assert.ok(['guardian', 'foxnews'].includes(freeAlt(m, hit).sid), 'the search offers a free headline of the same story');
});

test('Highbrowse: the publisher\'s mark on an article overrides its source; no table keeps the builders\' classes', () => {
  const sci = hbNormalise('scientific', hbStores()[1], { access: T }).items;
  assert.deepEqual(sci.map(i => [i.id, i.acc]), [['s1', 'free'], ['s2', 'paid']]);
  const stored = { ...hbStores()[1], items: hbStores()[1].items.map(i => ({ ...i, access: 'paid' })) };
  assert.deepEqual(hbNormalise('scientific', stored).items.map(i => i.acc), ['paid', 'paid'], 'the stored class, without a table');
  assert.ok(hbNormalise('political', hbStores()[0]).items.every(i => i.acc === 'free'), 'without a table, everything counts as free');
});

/* --- the subject briefings: their merge keeps every copy's link and stands under a free one; their order -------------- */
test('subject briefings: a story merged from free and paid copies stands under the free one, in all three builders', () => {
  const now = Date.parse('2026-11-07T00:00:00Z');
  for (const [name, merge, SOURCES, paidId, freeId, facet] of [
    ['science', sciMerge, SCI_SOURCES, 'nature', 'physorg-physics', 'disciplines'],
    ['econ', econMerge, ECON_SOURCES, 'ft-economy', 'guardian', 'fields'],
    ['digital', digMerge, DIG_SOURCES, 'ft-tech', 'guardian-tech', 'fields'],
  ]) {
    const S = new Map(SOURCES.map(s => [s.id, s]));
    const mk = (id, source, url, h) => ({ id, title: 'Quantum battery charges a city block in record test run', url, source, kind: S.get(source).kind, tier: S.get(source).tier, type: 'news', summary: '', [facet]: [], published: new Date(now - h * H).toISOString() });
    const out = merge({ freshItems: [mk('p', paidId, `https://${paidId}.example/q`, 3), mk('f', freeId, `https://${freeId}.example/q`, 2)], sources: SOURCES, now });
    assert.equal(out.length, 1, name);
    assert.deepEqual([out[0].source, out[0].access, out[0].also], [freeId, undefined, [paidId]], `${name}: the free copy stands for the story`);
    assert.deepEqual(out[0].alt.map(a => [a.source, a.url, a.access]), [[paidId, `https://${paidId}.example/q`, 'paid']], `${name}: the paid copy keeps its link, labelled`);
    // Only the link is swapped: the story keeps the best copy's standing and day (the paid copy, three hours old).
    const best = [S.get(paidId), S.get(freeId)].sort((x, y) => x.tier - y.tier)[0];
    assert.deepEqual([out[0].tier, out[0].kind, out[0].published], [best.tier, best.kind, mk('p', paidId, '', 3).published], `${name}: the story keeps its standing`);
    assert.deepEqual(merge({ prevItems: out, sources: SOURCES, now }).map(i => [i.source, i.tier, i.kind, i.published]), out.map(i => [i.source, i.tier, i.kind, i.published]), `${name}: and keeps it on the next run`);
    // A store from before the rule (the paid copy kept, the free one's link lost) is not guessed at: it stays as it was.
    const old = merge({ prevItems: [{ ...mk('p', paidId, `https://${paidId}.example/q`, 3), also: [freeId] }], sources: SOURCES, now });
    assert.deepEqual([old[0].source, old[0].access, old[0].alt], [paidId, 'paid', undefined], `${name}: no link, no free copy`);
    // A stored item that holds a free copy is turned round on the next run.
    const turned = merge({ prevItems: [{ ...mk('p', paidId, `https://${paidId}.example/q`, 3), also: [freeId], alt: [{ source: freeId, url: `https://${freeId}.example/q` }] }], sources: SOURCES, now });
    assert.deepEqual([turned[0].source, turned[0].alt.map(a => a.source)], [freeId, [paidId]], `${name}: turned round`);
  }
});

test('subject briefings: in both orders, after any filter, a day\'s first item is free wherever the day has one', () => {
  const now = Date.parse('2026-11-07T18:00:00Z');
  for (const [name, V, facet, key] of [['science', SCI, 'disciplines', 'd'], ['econ', ECON, 'fields', 'f'], ['digital', DIG, 'fields', 'f']]) {
    const it = (id, tier, type, h, access) => ({ id, source: id, tier, type, [facet]: ['x'], title: `Item ${id} about lasers`, summary: '', published: new Date(now - h * H).toISOString(), ...(access ? { access } : {}) });
    const items = [it('p1', 1, 'paper', 3, 'paid'), it('p2', 2, 'paper', 1, 'paid'), it('n', 3, 'news', 2), it('m', 4, 'news', 4, 'metered')];
    const day = (o, list = items) => V.arrange(list, o)[0].items.map(i => i.id);
    assert.deepEqual(day('tier'), ['n', 'p1', 'p2', 'm'], `${name}: the free item first, the rest by tier`);
    assert.deepEqual(day('newest'), ['n', 'p2', 'p1', 'm'], `${name}: the free item first, the rest newest first`);
    const filt = st => V.filterItems(items, { ...V.DEFAULTS, w: '24h', [key]: 'all', ...st }, { now });
    assert.deepEqual(day('tier', filt({ type: 'paper' })), ['p1', 'p2'], `${name}: papers only, none free: the order stands`);
    assert.deepEqual(day('newest', filt({ q: 'lasers' })), ['n', 'p2', 'p1', 'm'], `${name}: a search keeps the rule`);
    assert.deepEqual(V.arrange([it('u', 1, 'paper', 2, 'paid'), it('k', 2, 'paper', 1, 'unknown')], 'tier')[0].items.map(i => i.id), ['k', 'u'], `${name}: unknown counts as free`);
  }
});

/* ================================================================ 2. the table */
const TABLE = json('design/prp-access.json');
const REAL = A.table(TABLE);

test('table: every source has a class, the evidence and the day it was checked; the counts add up', () => {
  assert.match(TABLE.checked, /^\d{4}-\d\d-\d\d$/);
  assert.deepEqual(Object.keys(TABLE.classes), A.CLASSES);
  const counts = Object.fromEntries(A.CLASSES.map(c => [c, 0]));
  for (const s of TABLE.sources) {
    assert.ok(s.name && A.CLASSES.includes(s.class), JSON.stringify(s).slice(0, 200));
    assert.ok(typeof s.evidence === 'string' && s.evidence.length > 20, `${s.name}: the evidence`);
    assert.match(s.checked, /^\d{4}-\d\d-\d\d$/, `${s.name}: the day it was checked`);
    assert.ok(Array.isArray(s.keys) && Array.isArray(s.hosts), s.name);
    for (const r of s.match || []) { assert.ok(A.CLASSES.includes(r.class)); new RegExp(r.url); }
    counts[s.class]++;
  }
  assert.deepEqual(TABLE.counts, counts);
  assert.ok(TABLE.sources.length >= 400, `${TABLE.sources.length} sources`);
  assert.ok(new Set(TABLE.sources.flatMap(s => s.keys)).size === TABLE.sources.flatMap(s => s.keys).length, 'a feed id in one source only');
});

test('table: the evidence names what was seen; one rule for freemium sites and for journals', () => {
  // An article "opened" is a story, never a font, an image, a style sheet or a data file (the review of 7 November 2026
  // found 23 such lines).
  const ASSET = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|svg|ico|css|js|json)(\?|$)/i;
  for (const s of TABLE.sources) {
    const opened = /or (\S+) \(an article opened/.exec(s.evidence)?.[1];
    if (opened) {
      assert.ok(!ASSET.test(opened), `${s.name}: "${opened}" is not an article`);
      const home = /on (\S+) or /.exec(s.evidence)?.[1];
      assert.notEqual(opened.replace(/\/$/, ''), String(home).replace(/\/$/, ''), `${s.name}: the article is its home page`);
    }
    for (const u of s.evidence.match(/https?:\/\/[^\s)"';,]+/g) || []) assert.ok(!ASSET.test(u), `${s.name}: evidence ${u}`);
    // Freemium: a site whose home page marks a few stories for subscribers is free, with the share it counted.
    if (/marks some stories for subscribers only/.test(s.evidence)) assert.fail(`${s.name}: "some stories" marked says nothing of the rest (count them)`);
    if (/^Freemium:/.test(s.evidence)) { assert.equal(s.class, 'free', s.name); assert.match(s.evidence, /\d+%/, `${s.name}: the share`); }
    // Journals: free when more than half of the newest 40 carry an open licence.
    const n = /Crossref's licence records: (\d+) of the 40 newest/.exec(s.evidence)?.[1];
    if (n != null && s.class !== 'unknown' && !s.manual) assert.equal(s.class, +n > 20 ? 'free' : 'paid', `${s.name}: ${n} of 40 open`);
    if (s.manual) assert.match(s.evidence, /by hand/, `${s.name}: a class set by hand says so`);
    // An address rule names a real part of the site (the Daily Mail's never matched its Mail+ addresses).
    for (const r of s.match || []) assert.ok(!/^subscriber-exclusive$/i.test(r.url), `${s.name}: ${r.url}`);
  }
  const cls = (ref, want, why) => assert.equal(REAL.classify(ref), want, why || JSON.stringify(ref));
  // Freemium sites: their free articles are free; a paid part with its own address is labelled.
  cls({ host: 'bild.de', url: 'https://www.bild.de/politik/ausland-und-internationales/gps-stoerungen-6aed9635320931eb80f5bbd1' }, 'free');
  cls({ host: 'www.spiegel.de', url: 'https://www.spiegel.de/ausland/x-a-1' }, 'free');
  cls({ host: 'hvg.hu', url: 'https://hvg.hu/360/20261106_izrael-valasztas' }, 'paid', 'HVG360');
  cls({ host: 'hvg.hu', url: 'https://hvg.hu/itthon/20261106_x' }, 'free');
  cls({ host: 'haaretz.co.il', url: 'https://www.haaretz.co.il/news/world/2026-11-05/ty-article/.premium/000001a1' }, 'paid');
  cls({ host: 'haaretz.co.il', url: 'https://www.haaretz.co.il/news/world/2026-11-05/ty-article/000001a1' }, 'free');
  cls({ url: 'https://ekspress.delfi.ee/artikkel/120623013/x' }, 'paid', 'Eesti Ekspress on Delfi');
  cls({ host: 'delfi.ee', url: 'https://www.delfi.ee/artikkel/1/x' }, 'free');
  cls({ host: 'epl.delfi.ee' }, 'paid', 'Eesti Päevaleht keeps its own class');
  for (const host of ['lemonde.fr', 'nikkei.com', 'postimees.ee', 'timesofmalta.com']) cls({ host }, 'paid', `${host}: most stories marked`);
  // Outlets that are paywalled but could not be checked on their own pages, classed from a reliable description.
  cls({ host: 'www.washingtonpost.com' }, 'paid');
  cls({ briefing: 'econ', id: 'economist' }, 'paid');
  cls({ host: 'corriere.it' }, 'metered');
  cls({ host: 'svd.se' }, 'metered');
  cls({ host: 'marketwatch.com' }, 'paid', 'the Market Briefing\'s MarketWatch feed');
  // Nature Portfolio's subject feeds: the fully open-access journals are free, Nature's news unknown, on every key.
  cls({ briefing: 'digital', id: 'nature-cs', url: 'https://www.nature.com/articles/s41467-026-78948-1' }, 'free');
  cls({ briefing: 'digital', id: 'nature-ee', url: 'https://www.nature.com/articles/s44172-026-00814-1' }, 'free');
  cls({ briefing: 'digital', id: 'nature-qi', url: 'https://www.nature.com/articles/s44460-026-00148-7' }, 'paid', 'Nature Sensors: a subscription journal');
  for (const [b, id] of [['science', 'nature'], ['digital', 'nature-ee'], ['science', 'nphys']]) cls({ briefing: b, id, url: 'https://www.nature.com/articles/d41586-026-03456-7' }, 'unknown', `${b}:${id} news`);
  // The Daily Mail stays free, and says why its Mail+ stories cannot be told apart.
  const dm = TABLE.sources.find(s => s.name === 'Daily Mail');
  assert.equal(dm.class, 'free'); assert.equal(dm.match, undefined); assert.match(dm.sections[0].how, /cannot tell them apart/);
});

test('table: every source VM collects from is in it, by the key each section looks it up by', () => {
  const missing = [];
  for (const [b, list] of [['political', POL_SOURCES], ['science', SCI_SOURCES], ['econ', ECON_SOURCES], ['digital', DIG_SOURCES]]) {
    for (const s of list) if (!REAL.find({ briefing: b, id: s.id })) missing.push(`${b}:${s.id}`);
  }
  const outlets = json('headlines/outlets.json');
  for (const [cc, list] of Object.entries(outlets)) for (const o of list) {
    const host = new URL(o.home).hostname;
    if (!REAL.find({ host, name: o.name })) missing.push(`${cc} ${o.name} (${host})`);
  }
  assert.deepEqual(missing, []);
});

/* ================================================================ 3. every section on its committed data */
const STORES = ['briefing/data/latest.json', 'science/briefing/data/stories.json', 'econ/briefing/data/stories.json', 'digital/briefing/data/stories.json'].map(json);

test('committed: Highbrowse, Today and This week: every list of stories starts with a free lead wherever it has one', () => {
  const m = buildModel(STORES, { access: REAL });
  for (const w of ['24h', '7d']) {
    const d = digest(m, w);
    const lists = { stories: d.stories, shared: d.shared.stories, spread: d.spread.stories, left: d.spread.left, right: d.spread.right };
    for (const [name, list] of Object.entries(lists)) if (list.some(s => s.free)) assert.ok(list[0].free, `${w} ${name}: ${list[0].lead.t} (${list[0].lead.src}) is not free`);
    for (const s of d.stories) if (s.entries.some(e => hbFree(e.item))) assert.ok(s.free, `${w}: ${s.lead.t} has a free headline but leads with ${s.lead.src}`);
    // Each briefing's biggest story is shown by its own free headline wherever it has one.
    for (const c of d.coverage) if (c.story) {
      const mine = c.story.entries.map(e => [e.item, ...e.also].find(i => i.b === c.key)).filter(Boolean);
      if (mine.some(hbFree)) assert.ok(hbFree(c.story.here), `${w} ${c.key}: ${c.story.here.src}`);
    }
    if (w === '24h' && d.stories.length) assert.ok(d.stories[0].free, `the day's biggest story leads with a free source: ${d.stories[0].lead.src}`);
  }
});

test('committed: the Political Briefing, every position\'s column and the stream start with a free story', () => {
  const D = STORES[0], src = new Map(D.sources.map(s => [s.id, s]));
  // The page's default view: three days back from now (or from the refresh, when it is more than a day old), hard news.
  const end = Date.now() - Date.parse(D.generated) > 24 * H ? Date.parse(D.generated) : Date.now();
  const items = D.items.filter(i => Date.parse(i.p) >= end - 72 * H && !i.c);
  const isFreeItem = i => REAL.free({ briefing: 'political', id: i.s, url: i.u });
  const first = list => A.leadFree(list, isFreeItem)[0];
  assert.ok(items.length > 50 && isFreeItem(first(items)), 'the stream');
  for (const p of D.positions) {
    const col = items.filter(i => src.get(i.s)?.position === p.key);
    assert.ok(col.length && isFreeItem(first(col)), `${p.label}: its column starts with a free story`);
  }
  // Every publisher in the store is in the table, so each is classed by its feed id, never guessed.
  assert.deepEqual(D.sources.filter(s => !REAL.find({ briefing: 'political', id: s.id })).map(s => s.id), []);
});

test('committed: the Scientific, Economics and Digital Briefings, each day in both orders starts with a free item', () => {
  for (const [k, V, b] of [[1, SCI, 'science'], [2, ECON, 'econ'], [3, DIG, 'digital']]) {
    const D = STORES[k], SRC = new Set(D.sources.map(s => s.id));
    const cls = x => REAL.classify({ briefing: b, id: x.source, url: x.url, mark: x.accessMark });
    const items = D.items.map(i => A.restamp(i, cls, id => SRC.has(id)));
    // The builder's own classes are the table's (the page classes them again on load, for a table that changed since).
    const norm = c => (A.isFree(c) ? 'free' : c);
    const stale = D.items.filter(i => norm(i.access) !== norm(cls(i)));
    assert.ok(stale.length <= D.items.length * 0.02, `${b}: ${stale.length} items classed differently from the table`);
    assert.ok(!items.some(i => !A.isFree(i.access) && (i.alt || []).some(a => A.isFree(a.access))), `${b}: an item not free that holds a free copy`);
    for (const order of ['tier', 'newest']) {
      const days = V.arrange(items, order);
      assert.ok(days.length >= 5, `${b}: ${days.length} days`);
      for (const d of days) if (d.items.some(i => A.isFree(i.access))) assert.ok(A.isFree(d.items[0].access), `${b} ${order} ${d.key}: ${d.items[0].title}`);
    }
  }
});

test('committed: the Global Headline Tracker and National Analysis, with the outlets each country is collected from', () => {
  // The stories themselves are in the archive (Supabase), so each country's rows are made from its five most-read
  // outlets in their order, three stories each, as the collector writes them; the pages order them with this table.
  const outlets = json('headlines/outlets.json');
  let countries = 0, paidFirst = 0;
  for (const [cc, list] of Object.entries(outlets)) {
    const rows = list.slice(0, 5).flatMap((o, r) => [1, 2, 3].map(k => ({ outlet: o.name, outlet_domain: new URL(o.home).hostname, outlet_rank: r + 1, story_rank: k, url: `${o.home}/story-${k}` })));
    const rowFree = r => REAL.free({ host: r.outlet_domain, name: r.outlet, url: r.url });
    const groups = A.leadFreeGroups(list.slice(0, 5).map((o, r) => rows.filter(x => x.outlet_rank === r + 1)), rowFree);
    const national = A.leadFree(rows, rowFree).slice(0, 8);
    countries++;
    if (!rowFree(rows[0])) paidFirst++;
    if (rows.some(rowFree)) {
      assert.ok(rowFree(groups[0][0]), `${cc}: the Tracker's first outlet ${groups[0][0].outlet}`);
      assert.ok(rowFree(national[0]), `${cc}: National Analysis's first headline`);
    }
  }
  assert.ok(countries >= 70 && paidFirst >= 5, `${countries} countries, ${paidFirst} of them led by an outlet that is not free before the rule`);
  // The United States: CNN (metered) is first by readers; Fox News (free) now leads.
  const us = outlets.US.slice(0, 5).map((o, r) => [{ outlet: o.name, outlet_domain: new URL(o.home).hostname, outlet_rank: r + 1, url: o.home }]);
  assert.equal(A.leadFreeGroups(us, r => REAL.free({ host: r.outlet_domain, name: r.outlet, url: r.url }))[0][0].outlet, 'Fox News');
});

/* ================================================================ 4. the pages */
// Fixtures served in place of the data, with the small table above: the pages are tested on stories whose classes are known.
async function openWith(browser, path, routes, { width = 1360, dark = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.route('**/design/prp-access.json', r => r.fulfill({ json: FIX }));
  for (const [glob, body] of Object.entries(routes)) await page.route(glob, r => r.fulfill(typeof body === 'function' ? body(r) : { json: body }));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { page, errors };
}
// Tab from `from` until the focus is on an element that matches `to` (at most 8 presses: the Tracker puts its research
// buttons after each story): the keyboard reaches it.
async function tabTo(page, from, to, trail = []) {
  await page.focus(from);
  for (let k = 0; k < 8; k++) { await page.keyboard.press('Tab'); trail.push(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))); if (await page.evaluate(s => document.activeElement?.matches(s), to)) return true; }
  return false;
}
const labelStyle = page => page.evaluate(() => { const l = document.querySelector('.prp-access'); const s = l && getComputedStyle(l); return s && { color: s.color, bg: s.backgroundColor, border: s.borderTopColor, display: s.display }; });
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('page: Highbrowse leads with free sources, labels the paid ones and offers the free headline beside them, by keyboard', pageTest, async t => {
  const res = await fetch(`${BASE}/highbrowse/`).catch(() => null);
  if (!res?.ok) { t.skip(`Highbrowse is not at ${BASE}`); return; }
  // The fixture's day, moved to now (the page counts its windows back from now).
  const shift = Date.now() - NOW;
  const [political, science] = hbStores();
  const moved = { ...political, generated: new Date(Date.now() - H).toISOString(), items: political.items.map(i => ({ ...i, p: new Date(Date.parse(i.p) + shift).toISOString() })) };
  const sci = { ...science, generated: moved.generated, items: science.items.map(i => ({ ...i, published: new Date(Date.parse(i.published) + shift).toISOString() })) };
  const empty = { generated: moved.generated, keepDays: 7, fields: [], sources: [], items: [] };
  const routes = { '**/briefing/data/latest.json': moved, '**/science/briefing/data/stories.json': sci, '**/econ/briefing/data/stories.json': empty, '**/digital/briefing/data/stories.json': empty };
  const browser = await launch();
  t.after(() => browser.close());
  for (const [width, dark] of [[1360, false], [1360, true], [360, false], [360, true]]) {
    const { page, errors } = await openWith(browser, 'highbrowse/', routes, { width, dark });
    await page.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
    await page.waitForSelector('#panel-today .story');
    const lead = await page.$eval('#panel-today .story.lead h3 a', a => [a.textContent, !!a.querySelector('.prp-access')]);
    assert.match(lead[0], /Kowalski/, 'the free story leads');
    assert.equal(lead[1], false, 'its lead is not labelled');
    // The second story, which only paid sources carry, is labelled throughout, with nothing offered beside it.
    const second = await page.$eval('#panel-today .story:nth-child(2)', s => ({ t: s.querySelector('h3 a').textContent, alts: s.querySelectorAll('.prp-access-alt').length }));
    assert.match(second.t, /glacier.*, Paywall$/i);
    assert.equal(second.alts, 0);
    // In the lead story, the New York Times' headline is labelled and the free lead is offered beside it.
    const nyt = page.locator('#panel-today .story.lead .st-list a.h', { hasText: 'Kowalski' }).filter({ has: page.locator('.prp-access') });
    assert.equal(await nyt.count(), 1);
    assert.equal(await page.getByRole('link', { name: /^Senate passes Kowalski water reform bill, Paywall$/ }).count() >= 1, true, 'the label is part of the link\'s name');
    assert.ok(await tabTo(page, '#panel-today .story.lead .st-list a.h:has(.prp-access)', '.prp-access-alt'), 'Tab reaches the free headline');
    const alt = await page.evaluate(() => [document.activeElement.textContent, document.activeElement.href, document.activeElement.target]);
    assert.match(alt[0], /^Free at (The Guardian|Fox News)$/);
    assert.match(alt[1], /^https:\/\/(guardian|foxnews)\.example\//);
    assert.equal(alt[2], '_blank');
    const st = await labelStyle(page);
    assert.ok(st && st.color !== st.bg && st.display === 'inline-flex', JSON.stringify(st));
    if (width === 360) assert.ok(await noSideScroll(page), 'no sideways scroll at 360 px');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('page: the Political Briefing starts each column and the stream with a free story, and labels the rest', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const now = Date.now(), at = h => new Date(now - h * H).toISOString();
  const S = [['nyt', 'The New York Times', 'centre'], ['atlantic', 'The Atlantic', 'centre'], ['guardian', 'The Guardian', 'left'], ['vox', 'Vox', 'left'], ['intercept', 'The Intercept', 'far_left'],
    ['foxnews', 'Fox News', 'right'], ['telegraph', 'The Telegraph', 'right'], ['unchecked', 'Unchecked Herald', 'far_right']]
    .map(([id, name, position]) => ({ id, name, position, country: 'US', caution: false, active: true, reserve: false, status: 'ok' }));
  const it = (s, t, h) => ({ s, t, u: `https://${s}.example/${h}`, p: at(h), d: '' });
  const D = { generated: at(1), keepDays: 7, perPosition: 10, positions: [['far_left', 'Far left'], ['left', 'Left'], ['centre', 'Centre'], ['right', 'Right'], ['far_right', 'Far right']].map(([key, label]) => ({ key, label })),
    sources: S, items: [it('nyt', 'Centre paid newest', 2), it('atlantic', 'Centre metered', 3), it('guardian', 'Left free older', 6), it('vox', 'Left paid newest', 2.5), it('intercept', 'Far left sign-up only', 4),
      it('telegraph', 'Right paid newest', 1.5), it('foxnews', 'Right free older', 5), it('unchecked', 'Far right unchecked', 7), it('nyt', 'Centre paid oldest', 9)].sort((x, y) => (x.p < y.p ? 1 : -1)) }; // newest first, as the store is
  for (const [width, dark] of [[1400, false], [1400, true], [360, false]]) {
    const { page, errors } = await openWith(browser, 'q/briefing.html', { '**/briefing/data/latest.json': D }, { width, dark });
    await page.waitForSelector('.cols5 .col .story', { timeout: 20000 });
    const tops = await page.$$eval('.cols5 .col', cols => cols.map(c => [c.querySelector('h3 span').textContent, c.querySelector('.story a.t')?.textContent || '']));
    assert.deepEqual(tops, [['Far left', 'Far left sign-up only, Sign-up'], ['Left', 'Left free older'], ['Centre', 'Centre paid newest, Paywall'], ['Right', 'Right free older'], ['Far right', 'Far right unchecked']]);
    // The rest keep their order, newest first, labelled.
    assert.deepEqual(await page.$$eval('.cols5 .col:nth-child(2) .story a.t', as => as.map(a => a.textContent)), ['Left free older', 'Left paid newest, Paywall']);
    assert.deepEqual(await page.$$eval('.cols5 .col:nth-child(3) .story a.t', as => as.map(a => a.textContent)), ['Centre paid newest, Paywall', 'Centre metered, Paywall', 'Centre paid oldest, Paywall']);
    assert.equal(await page.getByRole('link', { name: 'Left paid newest, Paywall' }).count(), 1, 'the label is part of the link\'s name');
    assert.ok(await tabTo(page, '.cols5 .col:nth-child(2) .story a.t', '.cols5 .col:nth-child(2) .story:nth-child(3) a.t'), 'the labelled link is reached by Tab');
    // The stream; a search or a publisher keeps the rule.
    // The stream: the newest free story first (Fox News, five hours old), then the rest newest first.
    await page.selectOption('#view', 'stream');
    assert.deepEqual((await page.$$eval('.stream .story a.t', as => as.map(a => a.textContent))).slice(0, 3), ['Right free older', 'Right paid newest, Paywall', 'Centre paid newest, Paywall']);
    // A search keeps the rule.
    await page.fill('#q', 'paid');
    await page.waitForFunction(() => document.querySelectorAll('.stream .story').length === 4);
    assert.equal(await page.textContent('.stream .story a.t'), 'Right paid newest, Paywall', 'no free story matches: newest first');
    await page.fill('#q', 'left');
    await page.waitForFunction(() => document.querySelectorAll('.stream .story').length === 3);
    assert.deepEqual(await page.$$eval('.stream .story a.t', as => as.map(a => a.textContent)), ['Left free older', 'Left paid newest, Paywall', 'Far left sign-up only, Sign-up']);
    await page.fill('#q', '');
    if (width === 360) assert.ok(await noSideScroll(page), 'no sideways scroll at 360 px');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('page: the Scientific Briefing leads each day with a free item in both orders, and labels the paid copy it merged', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const D = json('science/briefing/data/stories.json');
  const now = new Date().toISOString(), at = h => new Date(Date.now() - h * H).toISOString();
  const S = new Map(D.sources.map(s => [s.id, s]));
  const item = (id, source, title, h, extra = {}) => ({ id, title, url: `https://${source}.example/${id}`, source, kind: S.get(source).kind, tier: S.get(source).tier, type: S.get(source).kind === 'journal' ? 'paper' : 'news', published: at(h), summary: '', disciplines: ['physics'], ...extra });
  // Today: a paid flagship paper (newest), and a free news story with the paid journal's copy merged into it.
  const items = [item('fx-paid', 'nature', 'Flagship paper on frozen light', 0.5),
    item('fx-free', 'physorg-physics', 'Physicists freeze light in a crystal', 1, { also: ['nature'], alt: [{ source: 'nature', url: 'https://nature.example/frozen', title: 'Frozen light in a crystal', access: 'paid' }] })];
  const fixture = { ...D, generated: now, items: [...items, ...D.items.map(i => ({ ...i, published: i.published < at(30) ? i.published : at(30) }))] };
  for (const [width, dark] of [[1360, false], [1360, true], [360, false]]) {
    const { page, errors } = await openWith(browser, 'science/briefing/index.html#d=all&w=7d', { '**/science/briefing/data/stories.json': fixture }, { width, dark });
    await page.waitForSelector('#list .entry h4 a', { timeout: 20000 });
    for (const order of ['tier', 'newest']) {
      await page.selectOption('#order', order);
      await page.waitForTimeout(150);
      assert.equal(await page.textContent('#list .entry h4 a'), 'Physicists freeze light in a crystal', `${order}: the free item leads the day`);
    }
    const paid = await page.$$eval('#list .entry h4 a', as => as.map(a => a.textContent).filter(t => /Flagship/.test(t)));
    assert.deepEqual(paid, ['Flagship paper on frozen light, Paywall']);
    const also = page.locator('#list .entry', { hasText: 'Physicists freeze light' }).locator('.also a');
    assert.deepEqual(await also.allTextContents(), ['Nature, Paywall'], 'the merged paid copy keeps its link, labelled');
    assert.ok(await tabTo(page, '#list .entry h4 a', '#list .entry .also a'), 'Tab reaches it');
    if (width === 360) assert.ok(await noSideScroll(page), 'no sideways scroll at 360 px');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('page: the Global Headline Tracker and National Analysis lead with a free outlet and label the rest', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const day = new Date().toISOString().slice(0, 10);
  const row = (outlet, host, r, k, extra = {}) => ({ snapshot_date: day, country_code: 'GB', outlet, outlet_domain: host, outlet_rank: r, story_rank: k, title_original: `${outlet} story ${k}`, title_en: `${outlet} story ${k}`, url: `https://${host}/news/${k}`, published_at: null, lowbrow: false, ...extra });
  const rows = [row('Pay Times', 'paytimes.example', 1, 1), row('Pay Times', 'paytimes.example', 1, 2),
    row('Sign-up Post', 'signup.example', 2, 1), row('Free Daily', 'freedaily.example', 3, 1), row('Free Daily', 'freedaily.example', 3, 2)];
  const archive = { '**/rest/v1/country_top_stories*': r => ({ json: /select=snapshot_date&/.test(r.request().url()) ? [{ snapshot_date: day }] : rows }) };
  const { page, errors } = await openWith(browser, 'q/headlines.html?view=current', archive);
  await page.waitForFunction(() => typeof loadTopStories === 'function');
  await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
  await page.waitForSelector('.outlet-group .article', { timeout: 15000 });
  const groups = await page.$$eval('.outlet-group', gs => gs.map(g => [g.querySelector('.outlet-name').textContent, ...[...g.querySelectorAll('a.headline')].map(a => a.textContent)]));
  assert.deepEqual(groups, [
    ['Free Daily', 'Free Daily story 1', 'Free Daily story 2'],
    ['Pay Times', 'Pay Times story 1, Paywall', 'Pay Times story 2, Paywall'],
    ['Sign-up Post', 'Sign-up Post story 1, Sign-up'],
  ]);
  assert.equal(await page.getByRole('link', { name: 'Pay Times story 1, Paywall' }).count(), 1, 'the label is part of the link\'s name');
  const trail = []; assert.ok(await tabTo(page, '.outlet-group:nth-child(1) a.headline', '.outlet-group:nth-child(2) a.headline', trail), 'Tab reaches the labelled links: ' + trail.join(' | '));
  // The ranked archive (a week): a free part of a paid site (by its address) leads; the GDELT fallback keeps the rule too.
  await page.evaluate(r => renderMostPersistent(r), [...rows.filter(r => r.outlet !== 'Free Daily'), row('Pay Times', 'paytimes.example', 1, 3, { url: 'https://paytimes.example/free-to-read/3' })]);
  assert.deepEqual(await page.$$eval('#articles a.headline', as => as.map(a => a.textContent)), ['Pay Times story 3', 'Pay Times story 1, Paywall', 'Pay Times story 2, Paywall', 'Sign-up Post story 1, Sign-up']);
  // The GDELT rows are saved to this device's history as they are: their class is never written onto them, so a saved
  // snapshot is classed by the table of the day it is shown.
  const gdelt = await page.evaluate(() => { const rows = [{ title: 'Paid wire', url: 'https://paytimes.example/w', domain: 'paytimes.example' }, { title: 'Free wire', url: 'https://freedaily.example/w', domain: 'freedaily.example' }]; renderArticles(rows); return rows.map(r => Object.keys(r).join(',')); });
  assert.deepEqual(gdelt, ['title,url,domain', 'title,url,domain'], 'no class on the saved rows');
  assert.deepEqual(await page.$$eval('#articles a.headline', as => as.map(a => a.textContent)), ['Free wire', 'Paid wire, Paywall']);
  // The evidence board saves a labelled headline by its own words, without the label.
  await page.evaluate(() => { try { localStorage.removeItem('jdpiq.research-workspace.v1'); } catch {} });
  await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
  await page.waitForSelector('.outlet-group .article .research-action', { timeout: 15000 });
  await page.locator('.article', { has: page.locator('a.headline .prp-access') }).first().locator('.research-action').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jdpiq.research-workspace.v1') || '{}'));
  const titles = JSON.stringify(saved).match(/"title":"[^"]*"/g) || [];
  assert.ok(titles.includes('"title":"Pay Times story 1"'), `saved: ${titles.join(' ')}`);
  assert.ok(!titles.some(t => /Paywall|Sign-up/.test(t)), `saved: ${titles.join(' ')}`);
  assert.deepEqual(errors, []);
  await page.close();
  // National Analysis: the country profile's latest headlines.
  const nat = await openWith(browser, 'q/national#country=GBR', archive);
  await nat.page.waitForSelector('#stories .story a', { timeout: 30000 });
  assert.deepEqual(await nat.page.$$eval('#stories .story a', as => as.map(a => a.textContent)), ['Free Daily story 1', 'Pay Times story 1, Paywall', 'Pay Times story 2, Paywall', 'Sign-up Post story 1, Sign-up', 'Free Daily story 2']);
  assert.equal(await nat.page.getByRole('link', { name: 'Sign-up Post story 1, Sign-up' }).count(), 1);
  assert.deepEqual(nat.errors, []);
});

test('page: the Realtime Battlefield\'s news of a war leads with a free outlet and labels the rest', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const day = new Date().toISOString().slice(0, 10);
  const row = (outlet, host, k) => ({ snapshot_date: day, country_code: 'UA', outlet, outlet_domain: host, title_original: `${outlet} on Kyiv ${k}`, title_en: `${outlet} on Kyiv ${k}`, url: `https://${host}/kyiv-${k}`, published_at: null });
  // Newest first, as the archive returns them: two paid stories and a sign-up one before the first free one.
  const rows = [row('Pay Times', 'paytimes.example', 1), row('Sign-up Post', 'signup.example', 2), row('Pay Times', 'paytimes.example', 3), row('Free Daily', 'freedaily.example', 4), row('Unchecked Herald', 'unchecked.example', 5)];
  for (const [width, dark] of [[1400, false], [1400, true], [390, false]]) {
    const { page, errors } = await openWith(browser, 'q/battlefield.html?view=live&war=russia-ukraine', { '**/rest/v1/country_top_stories*': rows }, { width, dark });
    await page.waitForSelector('#stories .story a', { timeout: 30000 });
    assert.deepEqual(await page.$$eval('#stories .story a', as => as.map(a => a.textContent)),
      ['Free Daily on Kyiv 4', 'Pay Times on Kyiv 1, Paywall', 'Sign-up Post on Kyiv 2, Sign-up', 'Pay Times on Kyiv 3, Paywall', 'Unchecked Herald on Kyiv 5']);
    assert.equal(await page.getByRole('link', { name: 'Pay Times on Kyiv 1, Paywall' }).count(), 1, 'the label is part of the link\'s name');
    assert.match(await page.textContent('#stories'), /Free sources lead/);
    const st = await labelStyle(page);
    assert.ok(st && st.color !== st.bg, JSON.stringify(st));
    if (width === 390) assert.ok(await noSideScroll(page), 'no sideways scroll at 390 px');
    assert.deepEqual(errors.filter(e => !/tile|leaflet|Failed to load resource/i.test(e)), []);
    await page.close();
  }
});
