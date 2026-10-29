// Economics Briefing (Money Management): the classifier sorts items into the eight fields and tells research from news,
// the parser keeps authors, DOIs and dates (and dates NBER's undated list), the page's view logic reads deep links and
// orders "Major sources first", and the stored data (econ/briefing/data/stories.json) is well formed, free of
// duplicates and inside its seven-day window.
// The page test runs where the submodule is deployed (JDPI_URL, e.g. http://localhost:8787, or the live site);
// PRP_PAGES=0 leaves it out, so a data workflow can run the rest on the file it is about to commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { FIELDS, FIELD_IDS, classify, detectType, fieldId, isDroppedTitle, isForeign } from '../econ/scripts/classify.mjs';
import { SOURCES, TIERS, KINDS, DEFAULT_CAP, MIN_WORKING_SHARE, outletId } from '../econ/scripts/briefing-sources.mjs';
import { parseEconFeed, normalise, mergeStore, formatAuthors, fixEntities, keepsByline, urlKey, titleKey, SUMMARY_MAX, AUTHORS_MAX } from '../econ/scripts/briefing-feeds.mjs';
import { DEFAULTS, parseHash, toHash, filterItems, arrange, countByField, badgeOf, timeLabel } from '../econ/briefing/view.js';

const DATA = JSON.parse(readFileSync(new URL('../econ/briefing/data/stories.json', import.meta.url), 'utf8'));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const SRC = new Map(SOURCES.map(s => [s.id, s]));
const DAY = 864e5;

// ---- Catalogue and classifier ----------------------------------------------------------------------------------------
test('catalogue: 35–50 unique feeds with known kinds, tiers and default fields', () => {
  assert.equal(SRC.size, SOURCES.length, 'feed ids are unique');
  assert.ok(SOURCES.length >= 35 && SOURCES.length <= 50, `${SOURCES.length} feeds`);
  for (const s of SOURCES) {
    assert.ok(KINDS[s.kind], `${s.id} kind`);
    assert.ok(TIERS[s.tier], `${s.id} tier`);
    assert.match(s.feed, /^https:\/\//, `${s.id} feed URL`);
    assert.match(s.url, /^https:\/\//, `${s.id} home page`);
    for (const f of s.fields) assert.ok(FIELD_IDS.includes(f), `${s.id} default ${f}`);
    if (s.qid !== null) assert.match(s.qid, /^Q\d+$/, `${s.id} qid`);
    if (s.skip) assert.ok(s.skip instanceof RegExp && !s.skip.global, `${s.id} skip is a plain RegExp`);
    if (s.strict) assert.deepEqual(s.fields, [], `${s.id}: a strict feed has no default fields`);
  }
  assert.deepEqual(FIELD_IDS, ['macro', 'monetary', 'trade', 'labour', 'development', 'finance', 'public', 'energy']);
  assert.deepEqual(FIELDS.map(f => f.label), ['Macro & growth', 'Monetary policy & central banks', 'Trade & globalisation', 'Labour & inequality', 'Development', 'Finance & markets', 'Public finance & policy', 'Energy & climate economics']);
  for (const f of FIELD_IDS) assert.ok(SOURCES.some(s => s.fields.includes(f)), `a specialist feed for ${f}`);
  for (const id of ['aer', 'qje', 'jpe', 'ecta', 'restud', 'jf', 'nber', 'cepr-dp']) assert.equal(SRC.get(id)?.tier, 1, `${id} is tier 1`);
  for (const id of ['fed-press', 'ecb-press', 'boe-news', 'boj', 'cbi']) assert.equal(SRC.get(id)?.kind, 'official', `${id}: central-bank releases`);
  for (const k of Object.keys(KINDS)) assert.ok(SOURCES.some(s => s.kind === k), `a ${k} feed`);
});

test('classifier: general feeds are classed by keywords', () => {
  const cases = [
    ['Fed holds interest rates steady as inflation cools', ['monetary']],
    ['Tariffs on Chinese imports raise US consumer prices', ['macro', 'trade']],
    ['Minimum wage rise lifts pay for low-paid workers', ['labour']],
    ['Cash transfers and child mortality in Kenya', ['development']],
    ['Bank runs and deposit insurance in the age of stablecoins', ['finance']],
    ['Wealth taxes and the budget deficit', ['public']],
    ['Data centres strain power grids', ['energy']],
    ['World Bank warns of debt distress in poor countries', ['development']],
    ['A knife-edge election in Israel', []],                                   // general: shown under All only
  ];
  for (const [title, want] of cases) assert.deepEqual(classify({ title }, []), want, title);
});

test('classifier: ambiguous phrases are settled first', () => {
  const has = (title, f) => classify({ title }, []).includes(f);
  assert.ok(!has('The trade-off between inflation and unemployment', 'trade'), 'a trade-off is not trade');
  assert.ok(has('Trade unions and wage bargaining', 'labour') && !has('Trade unions and wage bargaining', 'trade'), 'trade unions are labour');
  assert.ok(has('The labour market cools as job openings fall', 'labour') && !has('The labour market cools as job openings fall', 'finance'));
  assert.deepEqual(classify({ title: 'Central bank independence under pressure' }, []), ['monetary'], 'a central bank is not banking');
  assert.deepEqual(classify({ title: 'Labour could raise money in the Budget' }, []), ['public'], 'the Labour party is not labour, and money is not monetary policy');
  assert.ok(!has('Healey to Unveil Budget to Buy Breathing Room for UK and Labour', 'labour'));
  assert.ok(has('Automation, Capital and Labor', 'labour'), 'an American paper’s “Labor” is labour');
  assert.ok(!has('Business climate sours for small firms', 'energy'), 'the business climate is not the climate');
  assert.ok(!has('Banks adjust to a higher-rate environment', 'energy'), 'a rate environment is not the environment');
  assert.ok(has('Climate change and crop yields in India', 'energy') && has('Climate change and crop yields in India', 'development'));
});

test('classifier: specialist feeds keep their defaults and add only strongly indicated fields', () => {
  assert.deepEqual(classify({ title: 'Spin-offs and conglomerate discounts' }, ['finance']), ['finance']);
  assert.deepEqual(classify({ title: 'Unemployment insurance and job search' }, ['monetary']), ['monetary', 'labour']);
  assert.deepEqual(classify({ title: 'A short note' }, ['energy', 'macro']), ['macro', 'energy'], 'canonical order');
  assert.deepEqual(classify({ title: 'A short note' }, ['astrology']), [], 'unknown defaults are ignored');
  assert.deepEqual(['labor', 'Climate', 'central-banks', 'markets', 'globalization', 'all', 'astrology', ''].map(fieldId), ['labour', 'energy', 'monetary', 'finance', 'trade', null, null, null]);
});

test('classifier: research, news and dropped items', () => {
  const J = { kind: 'journal' }, W = { kind: 'working' }, R = { kind: 'research' }, O = { kind: 'official' }, N = { kind: 'news' };
  const cases = [
    [{ title: 'Front Matter' }, J, null],
    [{ title: 'Backmatter of Econometrica Vol. 94 Iss. 5' }, J, null],
    [{ title: 'ANNOUNCEMENTS', genres: ['Announcement'] }, J, null],
    [{ title: 'A study', genres: ['ISSUE INFORMATION'] }, J, null],
    [{ title: 'Minutes of the Annual Meeting' }, J, null],
    [{ title: 'Taxing Top Wealth', genres: ['Original Article'] }, J, 'paper'],
    [{ title: 'A reply to critics', genres: ['Comment'] }, J, 'news'],
    [{ title: 'Demand-Driven Inflation' }, W, 'paper'],
    [{ title: 'Rising R-stars across the Atlantic' }, R, 'paper'],
    [{ title: 'Minutes of the Meeting of the Court of Directors held on 16 July 2026' }, O, 'news'],   // central banks' minutes stay
    [{ title: 'Announcement of the publication of the Governor’s interview transcript' }, O, 'news'],
    [{ title: 'Webinar: financing the green transition' }, N, null],
    [{ title: 'A post', categories: ['Events'] }, N, null],
    [{ title: 'Hiring slows in October', categories: ['Jobs'] }, N, 'news'],                             // a subject, not a job advert
    [{ title: 'Session 2a: Can the EU’s better regulation agenda deliver competitiveness?' }, R, null], // an event programme
    [{ title: 'Les services sociaux destinés aux adultes peuvent offrir un meilleur rapport qualité-prix que les soins de santé' }, R, null],
    [{ title: 'El Niño risk cuts South Africa corn plantings' }, N, 'news'],
  ];
  for (const [item, source, want] of cases) assert.equal(detectType(item, source), want, item.title);
  assert.ok(isForeign('Los mercados emergentes y la política monetaria de los bancos centrales'));
  assert.ok(!isForeign('Los Angeles port traffic falls as tariffs bite') && !isForeign('Las Vegas casinos and the consumer'));
  assert.ok(isDroppedTitle('  Lunch ') && !isDroppedTitle('Lunch-hour trading and liquidity'));
});

// ---- Feeds -----------------------------------------------------------------------------------------------------------
test('feeds: NBER titles carry the authors and its undated list takes the feed time', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>NBER</title>
    <item><title>Beliefs Over Contracts -- by Francis Annan, Collin B. Raymond</title>
      <description>We study how firms choose among incentive contracts and how accurately managers predict their effects, using a survey of managerial beliefs and a large-scale field experiment.</description>
      <link>https://www.nber.org/papers/w35788#fromrss</link><guid>https://www.nber.org/papers/w35788#fromrss</guid></item></channel></rss>`;
  const [raw] = parseEconFeed(xml);
  assert.equal(raw.title, 'Beliefs Over Contracts');
  assert.equal(raw.published, null);
  const item = normalise(raw, SRC.get('nber'), '2026-10-28T06:00:00.000Z', '2026-10-26T04:02:06.000Z');
  assert.equal(item.published, '2026-10-26T04:02:06.000Z', 'the Last-Modified time, not the run time');
  assert.equal(item.undated, true);
  assert.equal(item.authors, 'Francis Annan and Collin B. Raymond');
  assert.equal(item.url, 'https://www.nber.org/papers/w35788');
  assert.equal(item.type, 'paper');
  assert.equal(timeLabel(item.published, item.undated), '', 'no clock time is shown for undated items');
});

test('feeds: the Fed’s author block, accented entities and series labels', () => {
  const xml = `<rss version="2.0"><channel><item>
    <title>FEDS Paper: A Macroeconomic Analysis of Household Labor Supply Responses to Large Fiscal Transfers</title>
    <link><![CDATA[https://www.federalreserve.gov/econres/feds/a-macroeconomic-analysis.htm]]></link>
    <description><![CDATA[<a href="https://www.federalreserve.gov/econres/isabel-cairo.htm">Isabel Cair&oacute;</a>, Shigeru Fujita, and <a href="https://www.federalreserve.gov/econres/camilo.htm">Camilo Morales-Jimenez</a><br><br>The fiscal transfers deployed during the COVID-19 pandemic were unprecedented in scale and strongly progressive.]]></description>
    <category>FEDS Paper</category><pubDate><![CDATA[Wed, 14 Oct 2026 15:25:00 GMT]]></pubDate></item></channel></rss>`;
  const [raw] = parseEconFeed(xml);
  assert.equal(raw.title, 'A Macroeconomic Analysis of Household Labor Supply Responses to Large Fiscal Transfers');
  assert.match(raw.summary, /^The fiscal transfers deployed/, 'the author block is not part of the summary');
  assert.equal(raw.section, 'FEDS Paper');
  assert.equal(raw.published, '2026-10-14T15:25:00.000Z');
  const item = normalise(raw, SRC.get('fed-feds'), '2026-10-28T06:00:00.000Z');
  assert.equal(item.authors, 'Isabel Cairó, Shigeru Fujita and Camilo Morales-Jimenez');
  assert.deepEqual(item.fields, ['macro', 'labour', 'public']);
  assert.equal(fixEntities('Pf&auml;uti &amp; &Eacute;mile'), 'Pfäuti &amp; Émile', 'only the accented-letter entities are added');
});

test('feeds: a journal table of contents keeps DOIs and authors and drops front matter', () => {
  const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
    <item rdf:about="https://pubs.aeaweb.org/doi/abs/10.1257/aer.20241596?af=R"><title>Taxing Top Wealth: Migration Responses and Their Aggregate Economic Implications</title>
      <link>https://pubs.aeaweb.org/doi/abs/10.1257/aer.20241596?af=R</link>
      <description>American Economic Review, Volume 116, Issue 10, Page 3674-3720, October 2026. &lt;br/&gt;</description>
      <dc:identifier>10.1257/aer.20241596</dc:identifier><dc:date>2026-10-01T12:40:42Z</dc:date>
      <dc:creator>Katrine Jakobsen</dc:creator><dc:creator>Henrik Kleven</dc:creator><dc:creator>Jonas Kolsrud</dc:creator><dc:creator>Camille Landais</dc:creator><dc:creator>Mathilde Munoz</dc:creator>
      <prism:doi>10.1257/aer.20241596</prism:doi></item>
    <item rdf:about="https://pubs.aeaweb.org/doi/abs/10.1257/aer.116.10.i?af=R"><title>Front Matter</title><link>https://pubs.aeaweb.org/doi/abs/10.1257/aer.116.10.i?af=R</link><dc:date>2026-10-01T12:41:32Z</dc:date></item>
  </rdf:RDF>`;
  const raw = parseEconFeed(xml);
  assert.equal(raw.length, 2);
  assert.equal(raw[0].doi, '10.1257/aer.20241596');
  assert.equal(raw[0].summary, '', 'a bare citation line is not a summary');
  const item = normalise(raw[0], SRC.get('aer'), '2026-10-02T00:00:00.000Z');
  assert.equal(item.authors, 'Katrine Jakobsen, Henrik Kleven, Jonas Kolsrud et al.');
  assert.ok(!item.url.includes('af=R'), 'feed tags go');
  assert.deepEqual(item.fields, ['labour', 'public']);
  assert.match(item.id, /^[0-9a-f]{12}$/);
  assert.equal(normalise(raw[1], SRC.get('aer'), '2026-10-02T00:00:00.000Z'), null);
});

test('feeds: author lists are cleaned or refused', () => {
  assert.equal(formatAuthors(['\nNED AUGENBLICK, \nEBEN LAZARUS\n']), 'Ned Augenblick and Eben Lazarus', 'capitals are set in title case');
  assert.equal(formatAuthors(['Michael Bordo, Cécile Bastidon']), 'Michael Bordo and Cécile Bastidon');
  assert.equal(formatAuthors(['Greg BuchakGregor MatvosTomasz PiskorskiAmit SeruStanford Graduate School of Business, Stanford Institute']), '', 'names run together with affiliations');
  assert.equal(formatAuthors(['BankUnderground'], 'Bank Underground'), '', 'a blog account');
  assert.equal(formatAuthors(['webmaster@cbo.gov (Webmaster)']), '');
  assert.equal(formatAuthors(['Carbon Brief Staff']), '');
  assert.ok(formatAuthors([Array.from({ length: 30 }, (_, k) => `Author Number${k}`).join(', ')]).length <= AUTHORS_MAX);
  const [dp] = parseEconFeed('<rss><channel><item><title>DP22097 Demand-Driven Inflation</title><link>https://cepr.org/publications/dp22097</link><description>Post-covid inflation was predominantly driven by unexpectedly strong demand forces---both in the United States and in the Euro Area.</description><dc:creator>Domenico Giannone, Giorgio Primiceri</dc:creator><pubDate>Tue, 27 Oct 2026 00:00:00 +0000</pubDate></item></channel></rss>');
  assert.equal(dp.title, 'Demand-Driven Inflation', 'series numbers go');
  assert.match(dp.summary, /demand forces—both/, 'TeX dashes become real ones');
});

test('feeds: strict feeds drop off-topic items, skip lists drop furniture, news keeps no byline', () => {
  const seen = '2026-10-28T06:00:00.000Z';
  const ps = SRC.get('ps');
  assert.equal(normalise({ title: 'Brazil’s Chapter in the Anti-Authoritarian Playbook', summary: 'Brazil’s renewed democratic confidence must be matched by institutional reforms.', url: 'https://www.project-syndicate.org/commentary/a', published: seen, authors: ['Robert Muggah'] }, ps, seen), null);
  const op = normalise({ title: 'The Specter of an AI-Driven Slowdown', summary: 'Growth forecasts ignore the risk of a bubble in tech stocks.', url: 'https://www.project-syndicate.org/commentary/b', published: seen, authors: ['Kenneth Rogoff'] }, ps, seen);
  assert.ok(op && op.fields.length, 'an economics column stays');
  assert.equal(op.authors, 'Kenneth Rogoff', 'commentary keeps its byline');
  assert.equal(normalise({ title: 'H.R. 2102, Major Richard Star Act', url: 'https://www.cbo.gov/publication/62877', published: seen }, SRC.get('cbo'), seen), null, 'a cost estimate for one bill');
  assert.equal(normalise({ title: 'CreditFlex - Central Bank of Ireland Issues Warning on Unauthorised Firm', url: 'https://www.centralbank.ie/x', published: seen }, SRC.get('cbi'), seen), null);
  assert.equal(normalise({ title: 'FirstFT: Israeli exit polls show no clear winner', url: 'https://www.ft.com/content/x', published: seen }, SRC.get('ft-economy'), seen), null);
  const wsj = normalise({ title: 'Jobless claims fall again', url: 'https://www.wsj.com/economy/x', published: seen, authors: ['Megumi Fujikawa'] }, SRC.get('wsj'), seen);
  assert.equal(wsj.authors, undefined, 'news items carry no byline');
  assert.ok(keepsByline(SRC.get('voxeu')) && keepsByline(ps) && !keepsByline(SRC.get('bbc')) && !keepsByline(SRC.get('fed-press')));
  const future = normalise({ title: 'Inflation outlook for 2027', url: 'https://www.bbc.co.uk/news/x', published: '2026-11-17T14:30:00.000Z' }, SRC.get('bbc'), seen);
  assert.equal(future.published, seen, 'dates more than 36 hours ahead count as undated');
});

test('store: duplicates merge, and stale, skipped and off-topic items leave', () => {
  const now = Date.parse('2026-10-28T06:00:00Z');
  const base = { kind: 'official', tier: 2, type: 'news', summary: '', fields: ['monetary'] };
  const merged = mergeStore({
    prevItems: [
      { ...base, id: 'a1', source: 'cbi', title: 'Brokevo - Central Bank of Ireland Issues Warning on Unauthorised Firm', url: 'https://www.centralbank.ie/a1', published: '2026-10-27T11:00:00.000Z' },
      { ...base, id: 'a2', source: 'fed-press', title: 'Federal Reserve Board announces approval of application', url: 'https://www.federalreserve.gov/a2', published: '2026-10-19T12:00:00.000Z' },
      { ...base, id: 'a3', kind: 'news', tier: 4, fields: [], source: 'ps', title: 'A knife-edge election in Israel', url: 'https://www.project-syndicate.org/a3', published: '2026-10-27T12:00:00.000Z' },
      { ...base, id: 'a4', source: 'retired-feed', title: 'From a feed that left the catalogue', url: 'https://example.org/a4', published: '2026-10-27T12:00:00.000Z' },
      { ...base, id: 'a5', type: 'paper', source: 'boe-news', title: 'Bank Rate maintained at 4% - October 2026', url: 'https://www.bankofengland.co.uk/a5', published: '2026-10-27T12:00:00.000Z' },
    ],
    freshItems: [
      { ...base, id: 'b1', source: 'bis-speeches', title: 'Monetary policy in a time of geopolitical tension and technological change', url: 'https://www.bis.org/review/r261027a.htm', published: '2026-10-27T00:00:00.000Z' },
      { ...base, id: 'b2', source: 'fed-speeches', title: 'Monetary Policy in a Time of Geopolitical Tension and Technological Change', url: 'https://www.federalreserve.gov/newsevents/speech/b2.htm', published: '2026-10-24T15:00:00.000Z' },
    ],
    sources: SOURCES, now, keepDays: 7,
  });
  assert.deepEqual(merged.map(i => i.id), ['a5', 'b2']);
  assert.deepEqual(merged.find(i => i.id === 'b2').also, ['bis-speeches'], 'the earlier copy is kept, the other source noted');
  assert.equal(merged.find(i => i.id === 'a5').type, 'news', 'a central bank’s releases are news');
  // The same FT story on two section pages: one item, both sections' fields, in the canonical order.
  const story = { kind: 'news', tier: 4, type: 'news', summary: '', fields: [], id: 'e1', title: 'US executives quit gas venture', url: 'https://www.ft.com/content/e1', published: '2026-10-27T10:00:00.000Z' };
  const ft = mergeStore({ freshItems: [{ ...story, source: 'ft-energy' }, { ...story, source: 'ft-trade' }], sources: SOURCES, now });
  assert.equal(ft.length, 1);
  assert.deepEqual(ft[0].fields, ['trade', 'energy']);
  assert.deepEqual(ft[0].also, ['ft-trade']);
});

// ---- View logic (econ/briefing/view.js) ------------------------------------------------------------------------------
test('view: deep links (#f=<field>) and the URL hash', () => {
  const F = DATA.fields;
  assert.deepEqual(parseHash('#f=labor&type=news&w=7d&sort=newest', F), { ...DEFAULTS, f: 'labour', type: 'news', w: '7d', sort: 'newest' });
  assert.equal(parseHash('#f=monetary', F).f, 'monetary');
  assert.equal(parseHash('#field=climate', F).f, 'energy');
  assert.equal(parseHash('#f=central-banks', F).f, 'monetary');
  assert.equal(parseHash('#f=nonsense', F).f, 'all');
  assert.equal(parseHash('#type=papers', F).type, 'paper');
  assert.equal(parseHash('#type=research', F).type, 'paper');
  assert.equal(parseHash('#type=bogus', F).type, 'both');
  assert.equal(parseHash('#w=30d', F).w, '3d');
  assert.equal(parseHash('#sort=random', F).sort, 'tier');
  assert.equal(parseHash('#tab=sources', F).tab, 'sources');
  assert.equal(parseHash('#src=NBER!&q=tariffs', F).src, 'nber');
  assert.equal(parseHash('', F, { f: 'trade' }).f, 'trade', 'a remembered field fills in');
  assert.equal(parseHash('#f=all', F, { f: 'trade' }).f, 'all', 'the link wins over the remembered field');
  assert.equal(toHash(DEFAULTS), '');
  const s = { ...DEFAULTS, f: 'development', type: 'paper', w: '24h', src: 'voxdev', q: 'cash transfers', sort: 'newest', tab: 'stories' };
  assert.equal(toHash(s), '#f=development&type=paper&w=24h&src=voxdev&q=cash+transfers&sort=newest');
  assert.deepEqual(parseHash(toHash(s), F), s);
});

test('view: filters, badges and "Major sources first" ordering', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const outlets = { nber: { id: 'nber', name: 'NBER' }, 'ecb-press': { id: 'ecb', name: 'ECB' }, bloomberg: { id: 'bloomberg', name: 'Bloomberg' }, voxeu: { id: 'voxeu', name: 'VoxEU' } };
  const outletOf = id => outlets[id] || null;
  const items = [
    { id: 'n', source: 'bloomberg', kind: 'news', tier: 4, type: 'news', fields: ['monetary'], title: 'RBA seen hiking again', summary: '', published: '2026-10-27T13:00:00.000Z' },
    { id: 'o', source: 'ecb-press', kind: 'official', tier: 2, type: 'news', fields: ['monetary', 'finance'], title: 'Euro area bank lending survey', summary: '', published: '2026-10-27T12:30:00.000Z' },
    { id: 'p', source: 'nber', kind: 'working', tier: 1, type: 'paper', fields: ['macro', 'monetary'], title: 'Strategic Monetary Policy in Open Economies', summary: '', authors: 'Louphou Coulibaly and Charles Engel', published: '2026-10-26T04:02:06.000Z', undated: true },
    { id: 'c', source: 'voxeu', kind: 'research', tier: 3, type: 'paper', fields: ['trade'], title: 'Tariff evasion and the US–China trade war', summary: '', published: '2026-10-27T00:00:00.000Z' },
    { id: 'old', source: 'nber', kind: 'working', tier: 1, type: 'paper', fields: ['labour'], title: 'Gender gaps', summary: '', published: '2026-10-21T04:00:00.000Z' },
  ];
  const ids = (st, o = {}) => filterItems(items, { ...DEFAULTS, ...st }, { now, outletOf, ...o }).map(i => i.id);
  assert.deepEqual(ids({}), ['n', 'o', 'p', 'c']);
  assert.deepEqual(ids({ w: '7d' }), ['n', 'o', 'p', 'c', 'old']);
  assert.deepEqual(ids({ f: 'monetary' }), ['n', 'o', 'p']);
  assert.deepEqual(ids({ type: 'paper' }), ['p', 'c']);
  assert.deepEqual(ids({ src: 'nber', w: '7d' }), ['p', 'old']);
  assert.deepEqual(ids({ q: 'engel' }), ['p'], 'search covers authors');
  assert.deepEqual(ids({ q: 'bloomberg' }), ['n'], 'and the outlet name');
  const inWindow = filterItems(items, DEFAULTS, { now, outletOf });
  const day27 = arrange(inWindow, 'tier').find(g => g.key === '2026-10-27');
  assert.deepEqual(day27.items.map(i => i.id), ['o', 'c', 'n'], 'institutions, then think tanks, then journalism');
  assert.deepEqual(arrange(inWindow, 'newest').find(g => g.key === '2026-10-27').items.map(i => i.id), ['n', 'o', 'c']);
  assert.deepEqual(countByField(inWindow, FIELDS), { all: 4, macro: 1, monetary: 3, trade: 1, labour: 0, development: 0, finance: 1, public: 0, energy: 0 });
  assert.deepEqual(items.map(i => badgeOf(i, SRC.get(i.source))), ['News', 'Official', 'Working paper', 'Research', 'Working paper']);
  assert.equal(badgeOf({ type: 'news', kind: 'news' }, SRC.get('ps')), 'Opinion');
  assert.equal(badgeOf({ type: 'paper', kind: 'journal' }, SRC.get('aer')), 'Article');
});

// ---- Stored data -------------------------------------------------------------------------------------------------------
test('data: stories.json has the expected shape', () => {
  const generated = Date.parse(DATA.generated);
  assert.ok(Number.isFinite(generated) && DATA.generated === new Date(generated).toISOString(), 'generated is an ISO time');
  assert.equal(DATA.keepDays, 7);
  assert.deepEqual(DATA.fields.map(f => f.id), FIELD_IDS);
  for (const f of DATA.fields) assert.ok(f.label && f.short && /^Q\d+$/.test(f.qid), `${f.id} label, short label, qid`);
  assert.deepEqual(DATA.tiers, Object.fromEntries(Object.entries(TIERS)));
  assert.deepEqual(DATA.kinds, KINDS);
  assert.deepEqual(DATA.sources.map(s => s.id).sort(), SOURCES.map(s => s.id).sort(), 'one status per catalogued feed');
  for (const s of DATA.sources) {
    assert.ok(['ok', 'error'].includes(s.status), `${s.id} status`);
    if (s.status === 'error') assert.ok(s.error, `${s.id} error message`);
    assert.equal(s.outletId, outletId(s.outlet), `${s.id} outletId`);
    assert.ok(Number.isInteger(s.count) && Number.isInteger(s.stored) && s.stored >= 0, `${s.id} counts`);
  }
  assert.ok(DATA.counts.working >= Math.ceil(DATA.counts.feeds * MIN_WORKING_SHARE), `${DATA.counts.working} of ${DATA.counts.feeds} feeds working`);
  assert.ok(DATA.items.length >= 100 && DATA.items.length <= DATA.maxItems, `${DATA.items.length} items`);

  for (const i of DATA.items) {
    const s = SRC.get(i.source), where = `${i.id} ${i.title}`;
    assert.match(i.id, /^[0-9a-f]{12}$/, where);
    assert.ok(typeof i.title === 'string' && i.title.trim() && i.title.length <= 300, where);
    assert.ok(!isDroppedTitle(i.title), `dropped title kept: ${where}`);
    assert.ok(!/&[a-z]+;/i.test(i.title + i.summary + (i.authors || '')), `undecoded entity: ${where}`);
    assert.match(i.url, /^https?:\/\/[^\s]+$/, where);
    assert.ok(s, `unknown source: ${where}`);
    assert.equal(i.kind, s.kind, where);
    assert.equal(i.tier, s.tier, where);
    assert.ok(['paper', 'news'].includes(i.type), where);
    if (['news', 'official'].includes(s.kind)) assert.equal(i.type, 'news', `release or journalism typed as paper: ${where}`);
    if (['working', 'research'].includes(s.kind)) assert.equal(i.type, 'paper', `research typed as news: ${where}`);
    assert.deepEqual(i.fields, FIELD_IDS.filter(f => i.fields.includes(f)), `fields in canonical order, no repeats: ${where}`);
    for (const f of s.fields) assert.ok(i.fields.includes(f), `feed default ${f} missing: ${where}`);
    if (s.strict) assert.ok(i.fields.length, `off-topic item from a strict feed: ${where}`);
    if (s.skip) assert.ok(!s.skip.test(i.title), `skipped title kept: ${where}`);
    assert.equal(typeof i.summary, 'string', where);
    assert.ok(i.summary.length <= SUMMARY_MAX, `summary too long: ${where}`);
    if (i.authors !== undefined) {
      assert.ok(typeof i.authors === 'string' && i.authors && i.authors.length <= AUTHORS_MAX, `authors: ${where}`);
      assert.ok(keepsByline(s), `byline on a news item: ${where}`);
    }
    if (i.doi !== undefined) assert.match(i.doi, /^10\.\d{4,9}\/\S+$/, where);
    if (i.also !== undefined) {
      assert.ok(Array.isArray(i.also) && i.also.length && new Set(i.also).size === i.also.length, where);
      for (const a of i.also) assert.ok(SRC.has(a) && a !== i.source, `also ${a}: ${where}`);
    }
  }
  const by = f => DATA.items.filter(f).length;
  assert.equal(DATA.counts.items, DATA.items.length);
  assert.equal(DATA.counts.papers, by(i => i.type === 'paper'));
  assert.equal(DATA.counts.news, by(i => i.type === 'news'));
  assert.equal(DATA.counts.general, by(i => !i.fields.length));
  for (const f of FIELD_IDS) {
    assert.equal(DATA.counts.fields[f], by(i => i.fields.includes(f)), f);
    assert.ok(DATA.counts.fields[f] > 0, `no items for ${f}`);
  }
  assert.ok(by(i => i.type === 'paper') >= 30 && by(i => i.type === 'news') >= 30, 'both research and news');
  for (const s of SOURCES) assert.ok(by(i => i.source === s.id) <= (s.cap || DEFAULT_CAP), `${s.id} over its cap`);
});

test('data: no duplicate items', () => {
  const seen = { id: new Map(), doi: new Map(), url: new Map() };
  for (const i of DATA.items) {
    for (const [k, v] of [['id', i.id], ['doi', i.doi?.toLowerCase()], ['url', urlKey(i.url)]]) {
      if (!v) continue;
      assert.ok(!seen[k].has(v), `same ${k}: "${i.title}" and "${seen[k].get(v)}"`);
      seen[k].set(v, i.title);
    }
  }
  // Identical titles within three days of each other are merged by the build.
  const byTitle = new Map();
  for (const i of DATA.items) {
    const k = titleKey(i.title);
    if (k.length <= 12) continue;
    for (const t of byTitle.get(k) || []) assert.ok(Math.abs(t - Date.parse(i.published)) > 3 * DAY, `duplicate title: ${i.title}`);
    byTitle.set(k, [...(byTitle.get(k) || []), Date.parse(i.published)]);
  }
});

test('data: every item is dated inside the seven-day window', () => {
  const generated = Date.parse(DATA.generated), from = generated - DATA.keepDays * DAY, to = generated + 36 * 36e5;
  for (const i of DATA.items) {
    const t = Date.parse(i.published);
    assert.ok(Number.isFinite(t) && i.published === new Date(t).toISOString(), `published is ISO: ${i.title}`);
    assert.ok(t >= from && t <= to, `${i.published} outside ${new Date(from).toISOString()} … ${DATA.generated}: ${i.title}`);
  }
  const days = new Set(DATA.items.map(i => i.published.slice(0, 10)));
  assert.ok(days.size >= 3, 'items span several days');
  for (const s of DATA.sources) if (s.latest) assert.ok(Date.parse(s.latest) <= to, `${s.id} latest in the future`);
});

// ---- Page ----------------------------------------------------------------------------------------------------------------
test('page: field deep link, papers/news toggle and the Sources tab at phone width', pageTest, async t => {
  const live = await fetch(`${BASE}/econ/briefing/data/stories.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.items) { t.skip(`Economics Briefing is not deployed at ${BASE} (set JDPI_URL to test a local copy)`); return; }
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/econ/briefing/#f=central-banks&type=news&w=7d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#chips button', { timeout: 20000 });
    assert.equal(await page.getAttribute('#chips [data-v="monetary"]', 'aria-pressed'), 'true', 'alias deep link selects Monetary policy & central banks');
    assert.equal(await page.getAttribute('#type [data-v="news"]', 'aria-pressed'), 'true');
    const types = await page.$$eval('#list .entry', els => els.map(e => e.dataset.type));
    assert.ok(types.length && types.every(x => x === 'news'), 'only news');
    assert.equal(await page.textContent('#toc-title'), 'Monetary policy & central banks · last 7 days');
    assert.equal(await page.isVisible('#chips [data-v="monetary"] .short'), true, 'short field names on a phone');
    await page.click('#type [data-v="paper"]');
    assert.match(await page.evaluate(() => location.hash), /type=paper/);
    assert.ok((await page.$$eval('#list .entry', els => els.map(e => e.dataset.type))).every(x => x === 'paper'), 'only papers');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 390px');
    assert.equal(await page.$$eval('#chart svg rect[fill="transparent"]', r => r.length), 8 * 7, 'Figure 1 has seven days for each of eight fields');
    await page.click('#tab-sources');
    assert.equal(await page.isHidden('#panel-stories'), true);
    assert.equal(await page.$$eval('#src-rows tr', rows => rows.length), live.sources.length, 'one row per feed');
    assert.match(await page.evaluate(() => location.hash), /tab=sources/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
