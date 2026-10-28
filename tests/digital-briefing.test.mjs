// Digital Briefing (Digital Science): the classifier sorts items into the eight fields and tells research from news,
// the parser reads arXiv's announcement feeds (new submissions only, a few a day, dated by announcement), journal and
// government feeds, the page's view logic reads deep links and orders "Major sources first", and the stored data
// (digital/briefing/data/stories.json) is well formed, free of duplicates and inside its seven-day window.
// The page test runs where the submodule is deployed (JDPI_URL, e.g. http://localhost:8787, or the live site).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { FIELDS, FIELD_IDS, classify, detectType, fieldId, isDroppedTitle } from '../digital/scripts/classify.mjs';
import { SOURCES, TIERS, KINDS, DEFAULT_CAP, outletId } from '../digital/scripts/briefing-sources.mjs';
import {
  parseDigitalFeed, normalise, mergeStore, pickDaily, isSkipped, formatAuthors, authorCount, keepsByline, tidyTex, parseFeedDate,
  urlKey, titleKey, SUMMARY_MAX, AUTHORS_MAX,
} from '../digital/scripts/briefing-feeds.mjs';
import { DEFAULTS, parseHash, toHash, filterItems, arrange, countByField, badgeOf, timeLabel, fieldColours } from '../digital/briefing/view.js';

const DATA = JSON.parse(readFileSync(new URL('../digital/briefing/data/stories.json', import.meta.url), 'utf8'));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const SRC = new Map(SOURCES.map(s => [s.id, s]));
const DAY = 864e5;
const SEEN = '2026-10-28T06:00:00.000Z';

// ---- Catalogue and classifier ----------------------------------------------------------------------------------------
test('catalogue: 60–90 unique feeds with known kinds, tiers and default fields', () => {
  assert.equal(SRC.size, SOURCES.length, 'feed ids are unique');
  assert.ok(SOURCES.length >= 60 && SOURCES.length <= 90, `${SOURCES.length} feeds`);
  for (const s of SOURCES) {
    assert.ok(KINDS[s.kind], `${s.id} kind`);
    assert.ok(TIERS[s.tier], `${s.id} tier`);
    assert.match(s.feed, /^https:\/\//, `${s.id} feed URL`);
    assert.match(s.url, /^https:\/\//, `${s.id} home page`);
    for (const f of s.fields) assert.ok(FIELD_IDS.includes(f), `${s.id} default ${f}`);
    if (s.qid !== null) assert.match(s.qid, /^Q\d+$/, `${s.id} qid`);
    for (const k of ['skip', 'skipUrl', 'skipCat', 'match', 'paperCat']) if (s[k]) assert.ok(s[k] instanceof RegExp && !s[k].global, `${s.id} ${k} is a plain RegExp`);
    if (s.strict) assert.deepEqual(s.fields, [], `${s.id}: a strict feed has no default fields`);
    if (s.kind === 'preprint') {
      assert.ok(s.newOnly && s.perDay >= 1 && s.perDay <= 8, `${s.id}: new submissions only, a few a day`);
      assert.ok(s.cap >= s.perDay * 6, `${s.id}: the cap keeps a week of daily picks`);
    }
  }
  assert.deepEqual(FIELD_IDS, ['ai', 'software', 'security', 'hardware', 'networks', 'quantum', 'privacy', 'policy']);
  assert.deepEqual(FIELDS.map(f => f.label), ['AI & machine learning', 'Software & computing', 'Cybersecurity', 'Hardware & semiconductors', 'Internet & networks', 'Quantum computing', 'Data & privacy', 'Digital policy & society']);
  for (const f of FIELD_IDS) assert.ok(SOURCES.some(s => s.fields.includes(f)), `a specialist feed for ${f}`);
  for (const id of ['natmachintell', 'natelectron', 'jacm', 'prxquantum']) assert.equal(SRC.get(id)?.tier, 1, `${id} is tier 1`);
  for (const k of Object.keys(KINDS)) assert.ok(SOURCES.some(s => s.kind === k), `a ${k} feed`);
  const arxiv = SOURCES.filter(s => s.kind === 'preprint').map(s => s.feed.split('/').pop());
  for (const c of ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CR', 'cs.SE', 'cs.DC', 'cs.HC', 'quant-ph']) assert.ok(arxiv.includes(c), `arXiv ${c}`);
  for (const o of ['MIT Technology Review', 'IEEE Spectrum', 'Ars Technica', 'The Register', 'WIRED', 'The Verge', 'Rest of World', 'CISA', 'NCSC', 'EFF', 'Nature Machine Intelligence', 'Nature Electronics'])
    assert.ok(SOURCES.some(s => s.outlet === o), `${o} is in the catalogue`);
  for (const id of ['cisa-alerts', 'cisa-advisories', 'ncsc']) assert.equal(SRC.get(id).kind, 'official', `${id}: government advisories`);
});

test('classifier: general feeds are classed by keywords', () => {
  const cases = [
    ['Hackers exploit a zero-day in Chrome to install spyware', ['security']],
    ['The EU AI Act enters into force', ['ai', 'policy']],
    ['Surface code thresholds on superconducting quantum computers', ['quantum']],
    ['5G spectrum auction raises billions', ['networks']],
    ['NIST releases post-quantum cryptography standards', ['security', 'quantum']],
    ['Meta fined €1.2bn over GDPR data transfers', ['privacy', 'policy']],
    ['Rust code lands in the Linux kernel', ['software']],
    ['Undersea cable cut slows internet across West Africa', ['networks']],
    ['Ofcom fines 4chan under the Online Safety Act', ['policy']],
    ['A knife-edge election in Israel', []],                                   // general: shown under All only
  ];
  for (const [title, want] of cases) assert.deepEqual(classify({ title }, []), want, title);
  assert.ok(classify({ title: 'Nvidia unveils Blackwell Ultra GPUs for AI data centres' }, []).includes('hardware'));
});

test('classifier: ambiguous phrases are settled first', () => {
  const has = (title, f) => classify({ title }, []).includes(f);
  assert.deepEqual(classify({ title: 'Policy gradient methods for LLM alignment' }, []), ['ai'], 'a policy gradient is reinforcement learning, not policy');
  assert.deepEqual(classify({ title: 'Graph neural networks for molecule design' }, []), ['ai'], 'a neural network is not networking');
  assert.deepEqual(classify({ title: 'Social media ban for under-16s passes parliament' }, []), ['policy'], 'social media is society, not the internet');
  assert.ok(has('Quantum dots brighten OLED displays', 'hardware') && !has('Quantum dots brighten OLED displays', 'quantum'), 'quantum dots are display hardware');
  assert.deepEqual(classify({ title: 'National security adviser warns on foreign investment' }, []), [], 'national security is not cybersecurity');
  assert.ok(!has('How solid-state transformers could help power the AI boom', 'software') && has('How solid-state transformers could help power the AI boom', 'hardware'), 'power transformers are grid hardware');
  assert.ok(has('Ninth Circuit rules on Section 230 immunity for TikTok', 'policy') && !has('Ninth Circuit rules on Section 230 immunity for TikTok', 'hardware'), 'a circuit court is not a circuit');
  // Governance words count only when the item is otherwise about technology.
  assert.deepEqual(classify({ title: 'FTC sues Dollar General over prices' }, []), []);
  assert.deepEqual(classify({ title: 'FTC sues Amazon over Prime cancellations' }, []), ['policy']);
});

test('classifier: specialist feeds keep their defaults and add only strongly indicated fields', () => {
  assert.deepEqual(classify({ title: 'Spin-orbit torque memory' }, ['hardware']), ['hardware']);
  assert.deepEqual(classify({ title: 'Benchmarking schedulers for GPU clusters' }, ['software']), ['software']);
  assert.deepEqual(classify({ title: 'Membership inference attacks on fine-tuned language models' }, ['security']), ['ai', 'security']);
  assert.deepEqual(classify({ title: 'A study', section: 'cs.CR · cs.LG' }, ['ai']), ['ai'], 'an arXiv cross-list alone does not add a field');
  assert.deepEqual(classify({ title: 'A short note' }, ['policy', 'ai']), ['ai', 'policy'], 'canonical order');
  assert.deepEqual(classify({ title: 'A short note' }, ['astrology']), [], 'unknown defaults are ignored');
  assert.deepEqual(['cybersecurity', 'chips', 'telecoms', 'quantum-computing', 'gdpr', 'tech-policy', 'ml', 'all', 'astrology', ''].map(fieldId),
    ['security', 'hardware', 'networks', 'quantum', 'privacy', 'policy', 'ai', null, null, null]);
});

test('classifier: research, news and dropped items', () => {
  const J = { kind: 'journal' }, P = { kind: 'preprint' }, L = { kind: 'lab' }, R = { kind: 'research' }, O = { kind: 'official' }, N = { kind: 'news' };
  const openai = SRC.get('openai');
  const cases = [
    [{ title: 'Front Matter' }, J, null],
    [{ title: 'Table of Contents' }, J, null],
    [{ title: 'A study', genres: ['Announcements'] }, J, null],
    [{ title: 'Agentic inequality', genres: ['Comment'] }, J, 'news'],
    [{ title: 'Large language models for computational social science', url: 'https://www.nature.com/articles/s41562-026-02539-9' }, J, 'paper'],
    [{ title: 'History’s long-secret codes are being cracked by amateurs using AI', url: 'https://www.nature.com/articles/d41586-026-03338-y' }, J, 'news'],
    [{ title: 'Log-To-Leak: prompt injection attacks on tool-using LLM agents' }, P, 'paper'],
    [{ title: 'Genie 4: a new generation of world simulation' }, L, 'paper'],
    [{ title: 'Introducing a new model', categories: ['Research'] }, openai, 'paper'],
    [{ title: 'OpenAI expands partnership with Oracle', categories: ['Company'] }, openai, 'news'],
    [{ title: 'How black-box distillation works' }, R, 'paper'],
    [{ title: 'Critical vulnerabilities in PHP require immediate patching' }, O, 'news'],
    [{ title: 'Pairing industrial AI autonomy and human control', categories: ['sponsored'] }, N, null],
    [{ title: 'Your robot’s safety functions already work', categories: ['Type-sponsored'] }, N, null],
    [{ title: 'Full-stack semiconductor solutions', categories: ['White Papers'] }, N, null],
    [{ title: 'A week of security news', categories: ['Podcast'] }, N, null],
    [{ title: 'Webinar: securing AI agents' }, N, null],
    [{ title: 'Ransomware gang leaks hospital data', categories: ['Security'] }, N, 'news'],
  ];
  for (const [item, source, want] of cases) assert.equal(detectType(item, source), want, item.title);
  assert.ok(isDroppedTitle('Publication information') && !isDroppedTitle('Publication of the AI Act’s first standard'));
});

// ---- Feeds -----------------------------------------------------------------------------------------------------------
const arxivItem = (n, title, type, creators, cats = '<category>cs.CR</category>') => `<item><title>${title}</title><link>https://arxiv.org/abs/2610.${36000 + n}</link>
  <description>arXiv:2610.${36000 + n}v1 Announce Type: ${type}
Abstract: We study ${title.toLowerCase()} in depth, with experiments on public benchmarks and a careful threat model.</description>
  <guid isPermaLink="false">oai:arXiv.org:2610.${36000 + n}v1</guid>${cats}<pubDate>Tue, 28 Oct 2026 00:00:00 -0400</pubDate>
  <arxiv:announce_type>${type}</arxiv:announce_type><dc:rights>http://creativecommons.org/licenses/by/4.0/</dc:rights><dc:creator>${creators}</dc:creator></item>`;

test('feeds: arXiv announcements: new submissions only, dated by announcement, a few a day', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><channel><title>cs.CR updates on arXiv.org</title>
    ${arxivItem(1, 'Log-To-Leak: Prompt Injection Attacks on Tool-Using LLM Agents via the Model Context Protocol', 'new', 'Ada Lovelace, Alan Turing', '<category>cs.CR</category><category>cs.AI</category>')}
    ${arxivItem(2, 'Merkle-Tree-Based Verifiable Public Data Auditing for Cloud Object Storage', 'new', 'Grace Hopper, Edsger Dijkstra, Barbara Liskov, Donald Knuth')}
    ${arxivItem(3, 'A Cross-Listed Paper on Federated Learning', 'cross', 'Claude Shannon, John von Neumann, Kurt Gödel, Alonzo Church, Emmy Noether')}
    ${arxivItem(4, 'A Revised Paper on Side Channels', 'replace', 'Tim Berners-Lee')}
    ${arxivItem(5, 'They Will See Johnny’s Message: A Measurement Study of Post-Quantum Cryptography', 'new', 'Radia Perlman, Vint Cerf, Bob Kahn')}
  </channel></rss>`;
  const raw = parseDigitalFeed(xml);
  assert.equal(raw.length, 5);
  assert.deepEqual(raw.map(r => r.announce), ['new', 'new', 'cross', 'replace', 'new']);
  assert.equal(raw[0].published, '2026-10-28T00:00:00.000Z', 'the announcement date, as a date');
  assert.match(raw[0].summary, /^We study log-to-leak/i, 'the "arXiv:… Announce Type: new Abstract:" prefix goes');
  assert.equal(raw[0].doi, '10.48550/arXiv.2610.36001', 'arXiv’s own DOI');
  assert.equal(raw[0].section, 'cs.CR · cs.AI');
  const s = SRC.get('arxiv-cr');
  assert.deepEqual(raw.map(r => isSkipped(r, s)), [false, false, true, true, false], 'cross-lists and revisions are left out');
  const kept = raw.map(r => ({ raw: r, item: normalise(r, s, SEEN) })).filter(e => e.item);
  assert.equal(kept.length, 3);
  assert.deepEqual(kept.map(e => authorCount(e.raw.authors)), [2, 4, 3]);
  const two = pickDaily(kept, 2);
  assert.deepEqual(two.map(e => e.raw.title.slice(0, 12)), ['Merkle-Tree-', 'They Will Se'], 'most authors first, then returned in listing order');
  assert.deepEqual(pickDaily(kept, 2).map(e => e.item.id), two.map(e => e.item.id), 'the same announcement gives the same picks');
  const item = kept[0].item;
  assert.equal(item.type, 'paper');
  assert.equal(item.kind, 'preprint');
  assert.equal(item.tier, 3);
  assert.equal(item.authors, 'Ada Lovelace and Alan Turing');
  assert.equal(item.url, 'https://arxiv.org/abs/2610.36001');
  assert.ok(item.fields.includes('security') && item.fields.includes('ai'), 'prompt injection is security and AI');
  assert.equal(timeLabel(item.published, item.undated), '', 'no clock time for an announcement date');
  // quant-ph keeps quantum computing and quantum information only.
  const q = SRC.get('arxiv-quantph');
  assert.equal(isSkipped({ title: 'Logical qubits below threshold on a neutral-atom array', summary: '', announce: 'new' }, q), false);
  assert.equal(isSkipped({ title: 'Casimir forces between graphene sheets', summary: 'We compute the Casimir interaction.', announce: 'new' }, q), true);
});

test('feeds: dates, TeX, titles and summaries', () => {
  assert.equal(parseFeedDate('Tue, 28 Oct 2026 00:00:00 -0400'), '2026-10-28T00:00:00.000Z');
  assert.equal(parseFeedDate('2026-10-28T00:00:00+02:00'), '2026-10-28T00:00:00.000Z');
  assert.equal(parseFeedDate('Wed, 28 Oct 2026 14:43:07 +0000'), '2026-10-28T14:43:07.000Z');
  assert.equal(parseFeedDate('not a date'), null);
  assert.equal(tidyTex('Regret bounds of $\\mathcal{O}(\\sqrt{T})$ for bandits'), 'Regret bounds of O(√T) for bandits');
  assert.equal(tidyTex('Interference in a $${\\pmb{\\mathbb{Z}}}_{\\bf{2}}$$ lattice gauge theory'), 'Interference in a Z₂ lattice gauge theory');
  assert.equal(tidyTex('Nvidia’s $5 billion deal and a $2 billion fund'), 'Nvidia’s $5 billion deal and a $2 billion fund', 'dollar amounts are not TeX');
  const feed = `<rss><channel>
    <item><title>[$] Guidelines for panics in kernel code</title><link>https://lwn.net/Articles/1000001/</link><description>A look at when the kernel should panic.</description><pubDate>Wed, 28 Oct 2026 14:05:00 +0000</pubDate></item>
    <item><title>Policy paper: Telecoms Modernisation: Critical National Infrastructure Charter</title><link>https://www.gov.uk/government/publications/telecoms-modernisation</link><summary>How the UK’s telecoms operators will modernise their networks.</summary><updated>2026-10-13T15:00:00+01:00</updated></item>
    <item><title>Quantum Authenticated Key Expansion with Key Recycling</title><link>https://quantum-journal.org/papers/q-2026-10-28-2255/</link><dc:creator><![CDATA[Wen Yu Kon, Jefferson Chu and Charles Lim]]></dc:creator><pubDate>Wed, 28 Oct 2026 14:43:07 +0000</pubDate>
      <description><![CDATA[<p>Quantum 10, 2255 (2026).</p><a href="https://doi.org/10.22331/q-2026-10-28-2255">https://doi.org/10.22331/q-2026-10-28-2255</a><p class="abstract">Data privacy and authentication are two main security requirements for remote access and cloud services.</p>]]></description></item>
    <item><title>AI training platform Outlier illegally surveils European platform workers</title><link>https://noyb.eu/en/outlier</link><pubDate>Tue, 27 Oct 2026 06:00:00 +0000</pubDate>
      <description>&lt;p&gt;Online &amp;amp; Mobile tracking &lt;/p&gt;&lt;strong&gt;&lt;p&gt;Today, noyb filed complaints against an AI training platform that records its workers’ screens.&lt;/p&gt;&lt;/strong&gt;</description></item>
  </channel></rss>`;
  const [lwn, gov, quantum, noyb] = parseDigitalFeed(feed);
  assert.equal(lwn.title, 'Guidelines for panics in kernel code', 'LWN’s subscriber mark goes');
  assert.equal(gov.title, 'Telecoms Modernisation: Critical National Infrastructure Charter');
  assert.equal(gov.section, 'Policy paper', 'GOV.UK’s document type becomes the section');
  assert.equal(quantum.doi, '10.22331/q-2026-10-28-2255', 'a DOI from the description’s doi.org link');
  assert.match(quantum.summary, /^Data privacy and authentication/, 'the citation line goes');
  assert.match(noyb.summary, /^Today, noyb filed/, 'a topic label at the start goes');
});

test('feeds: skip rules, strict feeds, bylines and dates stamped at noon', () => {
  const n = (id, raw) => normalise({ summary: '', published: SEEN, ...raw }, SRC.get(id), SEEN);
  assert.equal(n('cisa-alerts', { title: 'CISA Adds Two Known Exploited Vulnerabilities to Catalog', url: 'https://www.cisa.gov/a' }), null, 'routine catalogue additions');
  const alert = n('cisa-alerts', { title: 'Critical Vulnerabilities in PHP Require Immediate Patching', url: 'https://www.cisa.gov/b', published: '2026-10-27T12:00:00.000Z' });
  assert.equal(alert.published, '2026-10-27T00:00:00.000Z', 'CISA stamps dates at noon: stored as a date');
  assert.equal(badgeOf(alert, SRC.get('cisa-alerts')), 'Advisory');
  assert.equal(n('techreview', { title: 'The Download: dead startups fueling AI', url: 'https://www.technologyreview.com/x' }), null);
  assert.equal(n('schneier', { title: 'Friday Squid Blogging: Increasing Squid Populations', url: 'https://www.schneier.com/x' }), null);
  assert.equal(n('dsit', { title: 'Notice: Tech Town Business Survey: privacy notice 2026 to 2027', url: 'https://www.gov.uk/x' }), null);
  assert.equal(n('ftc', { title: 'FTC Sues Ticket Seller Over Prices at Festivals', url: 'https://www.ftc.gov/x' }), null, 'a strict feed drops what is not about technology');
  assert.ok(n('ftc', { title: 'FTC Sues Amazon Over Alexa Children’s Data', url: 'https://www.ftc.gov/y' }), 'and keeps what is');
  assert.equal(n('nature-cs', { title: 'Deep learning for traffic accident prediction', url: 'https://www.nature.com/articles/s41598-026-75741-4' }), null, 'Scientific Reports is left out of the subject feeds');
  const news = n('bleeping', { title: 'Volt Typhoon hides zero-day attacks using a new framework', url: 'https://www.bleepingcomputer.com/x', authors: ['Bill Toulas'] });
  assert.equal(news.authors, undefined, 'news items carry no byline');
  assert.ok(keepsByline(SRC.get('arxiv-ai')) && keepsByline(SRC.get('citizenlab')) && !keepsByline(SRC.get('wired-ai')) && !keepsByline(SRC.get('ncsc')));
  assert.ok(!keepsByline(SRC.get('jacm')), 'the ACM Digital Library runs names together: no authors');
  assert.equal(formatAuthors(['Naveed Ul MustafaXipeng ShenYan Solihin']), '', 'run-together names are refused');
  assert.equal(formatAuthors(['MIT Technology Review Insights']), '');
  assert.ok(formatAuthors([Array.from({ length: 30 }, (_, k) => `Author Number${k}`).join(', ')]).length <= AUTHORS_MAX);
  const openai = SRC.get('openai');
  assert.ok(isSkipped({ title: 'Legora is building the agentic operating system for legal work', categories: [], genres: [] }, openai), 'uncategorised OpenAI posts are customer stories');
  assert.ok(isSkipped({ title: 'A startup story', categories: ['Startup'], genres: [] }, openai));
  const future = n('nyt-tech', { title: 'Apple to unveil new iPhones in 2027', url: 'https://www.nytimes.com/x', published: '2026-11-17T14:30:00.000Z' });
  assert.equal(future.published, SEEN, 'dates more than 36 hours ahead count as undated');
});

test('store: duplicates merge, and stale, skipped, off-topic and retired items leave', () => {
  const now = Date.parse(SEEN);
  const base = { kind: 'news', tier: 4, type: 'news', summary: '', fields: [] };
  const merged = mergeStore({
    prevItems: [
      { ...base, id: 'a1', source: 'verge-ai', title: 'Meta delays its new business terms', url: 'https://www.theverge.com/a1', published: '2026-10-27T11:00:00.000Z' },
      { ...base, id: 'a2', source: 'register', title: 'Old news about mainframes and Linux kernels', url: 'https://www.theregister.com/a2', published: '2026-10-19T12:00:00.000Z' },
      { ...base, id: 'a3', source: 'register', title: 'A knife-edge election in Israel', url: 'https://www.theregister.com/a3', published: '2026-10-27T12:00:00.000Z' },
      { ...base, id: 'a4', source: 'retired-feed', title: 'From a feed that left the catalogue', url: 'https://example.org/a4', published: '2026-10-27T12:00:00.000Z' },
      { ...base, id: 'a5', kind: 'journal', tier: 2, type: 'paper', source: 'nature-cs', title: 'Deep learning for traffic accident prediction', url: 'https://www.nature.com/articles/s41598-026-75741-4', published: '2026-10-26T00:00:00.000Z' },
      { ...base, id: 'a6', kind: 'preprint', tier: 3, type: 'paper', source: 'arxiv-quantph', title: 'Casimir forces between graphene sheets', url: 'https://arxiv.org/abs/2610.30000', published: '2026-10-27T00:00:00.000Z' },
    ],
    freshItems: [
      { ...base, id: 'b1', source: 'verge-policy', title: 'Meta delays its new business terms', url: 'https://www.theverge.com/a1', published: '2026-10-27T11:00:00.000Z' },
      { ...base, id: 'b2', source: 'ars-ai', title: 'Anthropic warns investors its AI could end humanity in its IPO filing', url: 'https://arstechnica.com/b2', published: '2026-10-27T21:31:00.000Z' },
      { ...base, id: 'b3', source: 'wired-ai', title: 'Anthropic Warns Investors Its AI Could End Humanity in IPO Filing', url: 'https://www.wired.com/b3', published: '2026-10-28T01:00:00.000Z' },
    ],
    sources: SOURCES, now, keepDays: 7,
  });
  assert.deepEqual(merged.map(i => i.id).sort(), ['a1', 'b2']);
  const meta = merged.find(i => i.id === 'a1');
  assert.deepEqual(meta.also, ['verge-policy'], 'the same story on two section feeds: one item');
  assert.deepEqual(meta.fields, ['ai', 'policy'], 'with both sections’ default fields, in canonical order');
  assert.deepEqual(merged.find(i => i.id === 'b2').also, ['wired-ai'], 'near-identical titles from different outlets merge, the earlier copy kept');
  // Per-feed caps keep the newest.
  const many = Array.from({ length: 50 }, (_, k) => ({ ...base, kind: 'preprint', tier: 3, type: 'paper', id: `p${k}`, source: 'arxiv-cy', title: `Paper number ${k} on digital rights and platform governance`, url: `https://arxiv.org/abs/2610.${40000 + k}`, published: new Date(now - k * 36e5).toISOString() }));
  const capped = mergeStore({ freshItems: many, sources: SOURCES, now });
  assert.equal(capped.length, SRC.get('arxiv-cy').cap);
  assert.equal(capped[0].id, 'p0');
});

// ---- View logic (digital/briefing/view.js) ---------------------------------------------------------------------------
test('view: deep links (#f=<field>) and the URL hash', () => {
  const F = DATA.fields;
  assert.deepEqual(parseHash('#f=cybersecurity&type=news&w=7d&sort=newest', F), { ...DEFAULTS, f: 'security', type: 'news', w: '7d', sort: 'newest' });
  assert.equal(parseHash('#f=quantum', F).f, 'quantum');
  assert.equal(parseHash('#field=chips', F).f, 'hardware');
  assert.equal(parseHash('#f=nonsense', F).f, 'all');
  assert.equal(parseHash('#type=papers', F).type, 'paper');
  assert.equal(parseHash('#type=preprints', F).type, 'paper');
  assert.equal(parseHash('#type=bogus', F).type, 'both');
  assert.equal(parseHash('#w=30d', F).w, '3d');
  assert.equal(parseHash('#sort=random', F).sort, 'tier');
  assert.equal(parseHash('#tab=sources', F).tab, 'sources');
  assert.equal(parseHash('#src=arXiv!&q=ransomware', F).src, 'arxiv');
  assert.equal(parseHash('', F, { f: 'privacy' }).f, 'privacy', 'a remembered field fills in');
  assert.equal(parseHash('#f=all', F, { f: 'privacy' }).f, 'all', 'the link wins over the remembered field');
  assert.equal(toHash(DEFAULTS), '');
  const s = { ...DEFAULTS, f: 'networks', type: 'paper', w: '24h', src: 'cloudflare', q: 'bgp leak', sort: 'newest', tab: 'stories' };
  assert.equal(toHash(s), '#f=networks&type=paper&w=24h&src=cloudflare&q=bgp+leak&sort=newest');
  assert.deepEqual(parseHash(toHash(s), F), s);
});

test('view: filters, badges and "Major sources first" ordering', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const outlets = { 'arxiv-cr': { id: 'arxiv', name: 'arXiv' }, 'cisa-alerts': { id: 'cisa', name: 'CISA' }, bleeping: { id: 'bleepingcomputer', name: 'BleepingComputer' }, natmachintell: { id: 'nature-machine-intelligence', name: 'Nature Machine Intelligence' }, citizenlab: { id: 'citizen-lab', name: 'Citizen Lab' } };
  const outletOf = id => outlets[id] || null;
  const items = [
    { id: 'n', source: 'bleeping', kind: 'news', tier: 4, type: 'news', fields: ['security'], title: 'Ransomware gang hits hospital', summary: '', published: '2026-10-27T13:00:00.000Z' },
    { id: 'o', source: 'cisa-alerts', kind: 'official', tier: 2, type: 'news', fields: ['security'], title: 'Critical vulnerabilities in PHP', summary: '', published: '2026-10-27T00:00:00.000Z' },
    { id: 'p', source: 'arxiv-cr', kind: 'preprint', tier: 3, type: 'paper', fields: ['ai', 'security'], title: 'Prompt injection via tool calls', summary: '', authors: 'Ada Lovelace and Alan Turing', published: '2026-10-27T00:00:00.000Z' },
    { id: 'j', source: 'natmachintell', kind: 'journal', tier: 1, type: 'paper', fields: ['ai'], title: 'Agentic inequality', summary: '', published: '2026-10-26T00:00:00.000Z' },
    { id: 'r', source: 'citizenlab', kind: 'research', tier: 3, type: 'paper', fields: ['security', 'privacy'], title: 'Spyware targets a prosecutor', summary: '', published: '2026-10-27T16:49:00.000Z' },
    { id: 'old', source: 'bleeping', kind: 'news', tier: 4, type: 'news', fields: ['security'], title: 'Old breach', summary: '', published: '2026-10-21T04:00:00.000Z' },
  ];
  const ids = (st, o = {}) => filterItems(items, { ...DEFAULTS, ...st }, { now, outletOf, ...o }).map(i => i.id);
  assert.deepEqual(ids({}), ['n', 'o', 'p', 'j', 'r']);
  assert.deepEqual(ids({ w: '7d' }), ['n', 'o', 'p', 'j', 'r', 'old']);
  assert.deepEqual(ids({ w: '24h' }), ['n', 'o', 'p', 'r'], 'date-only items count from midday of their date');
  assert.deepEqual(ids({ f: 'ai' }), ['p', 'j']);
  assert.deepEqual(ids({ type: 'paper' }), ['p', 'j', 'r']);
  assert.deepEqual(ids({ src: 'bleepingcomputer', w: '7d' }), ['n', 'old']);
  assert.deepEqual(ids({ q: 'turing' }), ['p'], 'search covers authors');
  assert.deepEqual(ids({ q: 'citizen lab' }), ['r'], 'and the outlet name');
  const inWindow = filterItems(items, DEFAULTS, { now, outletOf });
  const day27 = arrange(inWindow, 'tier').find(g => g.key === '2026-10-27');
  assert.deepEqual(day27.items.map(i => i.id), ['o', 'r', 'p', 'n'], 'agencies, then preprints and institutes (newest first), then journalism');
  assert.deepEqual(arrange(inWindow, 'newest').find(g => g.key === '2026-10-27').items.map(i => i.id), ['r', 'n', 'o', 'p']);
  assert.deepEqual(countByField(inWindow, FIELDS), { all: 5, ai: 2, software: 0, security: 4, hardware: 0, networks: 0, quantum: 0, privacy: 1, policy: 0 });
  assert.deepEqual(items.map(i => badgeOf(i, SRC.get(i.source))), ['News', 'Advisory', 'Preprint', 'Article', 'Research', 'News']);
  assert.equal(badgeOf({ type: 'news', kind: 'news' }, SRC.get('eff')), 'Advocacy');
  assert.equal(badgeOf({ type: 'news', kind: 'news' }, SRC.get('schneier')), 'Commentary');
  assert.equal(badgeOf({ type: 'paper', kind: 'lab' }, SRC.get('deepmind')), 'Lab');
  assert.equal(badgeOf({ type: 'news', kind: 'lab' }, SRC.get('openai')), 'Announcement');
  assert.equal(badgeOf({ type: 'news', kind: 'journal' }, SRC.get('natmachintell')), 'Comment');
});

test('view: Figure 1 colours are the categorical tokens in field order, validated', () => {
  const tokens = { '--prp-cat-1': '#2a78d6', '--prp-cat-2': '#eb6834', '--prp-cat-3': 'not-a-colour', '--prp-cat-4': '' };
  const isColour = v => /^#[0-9a-f]{6}$/i.test(v);
  const c = fieldColours(FIELD_IDS, n => tokens[n], isColour, 'MUTED');
  assert.equal(c.ai, '#2a78d6');
  assert.equal(c.software, '#eb6834');
  assert.equal(c.security, 'MUTED', 'an invalid token falls back to the neutral colour');
  assert.equal(c.hardware, 'MUTED', 'so does a missing one; colours are never cycled or borrowed');
  assert.deepEqual(Object.keys(c), FIELD_IDS);
});

// ---- Stored data -------------------------------------------------------------------------------------------------------
test('data: stories.json has the expected shape', () => {
  const generated = Date.parse(DATA.generated);
  assert.ok(Number.isFinite(generated) && DATA.generated === new Date(generated).toISOString(), 'generated is an ISO time');
  assert.equal(DATA.keepDays, 7);
  assert.deepEqual(DATA.fields.map(f => f.id), FIELD_IDS);
  for (const f of DATA.fields) assert.ok(f.label && f.short && /^Q\d+$/.test(f.qid) && Array.isArray(f.aliases), `${f.id} label, short label, qid, aliases`);
  assert.deepEqual(DATA.tiers, Object.fromEntries(Object.entries(TIERS)));
  assert.deepEqual(DATA.kinds, KINDS);
  assert.deepEqual(DATA.sources.map(s => s.id).sort(), SOURCES.map(s => s.id).sort(), 'one status per catalogued feed');
  for (const s of DATA.sources) {
    assert.ok(['ok', 'error'].includes(s.status), `${s.id} status`);
    if (s.status === 'error') assert.ok(s.error, `${s.id} error message`);
    assert.equal(s.outletId, outletId(s.outlet), `${s.id} outletId`);
    assert.ok(Number.isInteger(s.count) && Number.isInteger(s.stored) && s.stored >= 0, `${s.id} counts`);
    if (SRC.get(s.id).perDay) assert.ok(s.perDay === SRC.get(s.id).perDay && s.count <= s.perDay, `${s.id} keeps at most ${s.perDay} a day`);
  }
  assert.ok(DATA.counts.working >= Math.ceil(DATA.counts.feeds * 0.75), `${DATA.counts.working} of ${DATA.counts.feeds} feeds working`);
  assert.ok(DATA.items.length >= 100 && DATA.items.length <= DATA.maxItems, `${DATA.items.length} items`);

  for (const i of DATA.items) {
    const s = SRC.get(i.source), where = `${i.id} ${i.title}`;
    assert.match(i.id, /^[0-9a-f]{12}$/, where);
    assert.ok(typeof i.title === 'string' && i.title.trim() && i.title.length <= 300, where);
    assert.ok(!isDroppedTitle(i.title), `dropped title kept: ${where}`);
    assert.ok(!/&[a-z]+;|&#\d+;/i.test(i.title + i.summary + (i.authors || '')), `undecoded entity: ${where}`);
    assert.ok(!/\$\$|\\(?:mathcal|mathbb|mathrm|textbf|emph)\b/.test(i.title), `TeX left in a title: ${where}`);
    assert.match(i.url, /^https?:\/\/[^\s]+$/, where);
    assert.ok(s, `unknown source: ${where}`);
    assert.equal(i.kind, s.kind, where);
    assert.equal(i.tier, s.tier, where);
    assert.ok(['paper', 'news'].includes(i.type), where);
    if (['news', 'official'].includes(s.kind)) assert.equal(i.type, 'news', `release or journalism typed as paper: ${where}`);
    if (['preprint', 'research'].includes(s.kind)) assert.equal(i.type, 'paper', `research typed as news: ${where}`);
    if (s.kind === 'preprint') assert.match(i.published, /T00:00:00\.000Z$/, `an arXiv item is dated by its announcement: ${where}`);
    assert.deepEqual(i.fields, FIELD_IDS.filter(f => i.fields.includes(f)), `fields in canonical order, no repeats: ${where}`);
    for (const f of s.fields) assert.ok(i.fields.includes(f), `feed default ${f} missing: ${where}`);
    if (s.strict) assert.ok(i.fields.length, `off-topic item from a strict feed: ${where}`);
    if (s.skip) assert.ok(!s.skip.test(i.title), `skipped title kept: ${where}`);
    if (s.skipUrl) assert.ok(!s.skipUrl.test(i.url), `skipped address kept: ${where}`);
    assert.equal(typeof i.summary, 'string', where);
    assert.ok(i.summary.length <= SUMMARY_MAX, `summary too long: ${where}`);
    assert.ok(!/^arXiv:\S+ Announce Type/i.test(i.summary), `arXiv prefix left in a summary: ${where}`);
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
  assert.ok(by(i => i.kind === 'preprint') >= 10, 'arXiv preprints');
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
test('page: field deep link, papers/news toggle, theme redraw, hash changes and the Sources tab at phone width', async t => {
  const live = await fetch(`${BASE}/digital/briefing/data/stories.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.items) { t.skip(`Digital Briefing is not deployed at ${BASE} (set JDPI_URL to test a local copy)`); return; }
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/digital/briefing/#f=cybersecurity&type=news&w=7d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#chips button', { timeout: 20000 });
    assert.equal(await page.getAttribute('#chips [data-v="security"]', 'aria-pressed'), 'true', 'alias deep link selects Cybersecurity');
    assert.equal(await page.getAttribute('#type [data-v="news"]', 'aria-pressed'), 'true');
    const types = await page.$$eval('#list .entry', els => els.map(e => e.dataset.type));
    assert.ok(types.length && types.every(x => x === 'news'), 'only news');
    assert.equal(await page.textContent('#toc-title'), 'Cybersecurity · last 7 days');
    assert.equal(await page.isVisible('#chips [data-v="hardware"] .short'), true, 'short field names on a phone');
    assert.equal(await page.textContent('.prp-eyebrow'), 'Digital Science · Digital Briefing');
    assert.equal(await page.getAttribute('html', 'data-suite'), 'ds');
    await page.click('#type [data-v="paper"]');
    assert.match(await page.evaluate(() => location.hash), /type=paper/);
    assert.ok((await page.$$eval('#list .entry', els => els.map(e => e.dataset.type))).every(x => x === 'paper'), 'only papers');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll at 390px');
    assert.equal(await page.$$eval('#chart svg rect[fill="transparent"]', r => r.length), 8 * 7, 'Figure 1 has seven days for each of eight fields');
    // Figure 1 draws with the theme's categorical tokens and redraws on prp:themechange.
    const barFill = () => page.evaluate(() => {
      const bars = [...document.querySelectorAll('#chart svg rect:not([fill="transparent"])')].filter(r => r.getAttribute('rx') === '1.5');
      return { fill: bars[0]?.getAttribute('fill') || null, token: getComputedStyle(document.documentElement).getPropertyValue('--prp-cat-1').trim() };
    });
    await page.evaluate(() => { location.hash = '#f=all&w=7d'; });
    await page.waitForFunction(() => document.querySelector('#chips [data-v="all"]')?.getAttribute('aria-pressed') === 'true');
    const light = await barFill();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new CustomEvent('prp:themechange', { detail: { theme: 'dark' } })); });
    const dark = await barFill();
    assert.ok(light.fill && dark.fill, 'Figure 1 draws bars for the last seven days');
    assert.equal(light.fill.toLowerCase(), light.token.toLowerCase(), 'bars use the light theme’s first categorical token');
    assert.notEqual(light.token, dark.token, 'the token differs between themes');
    assert.equal(dark.fill.toLowerCase(), dark.token.toLowerCase(), 'bars are redrawn with the dark token');
    // The shell moves the frame by hash: the page follows.
    await page.evaluate(() => { location.hash = '#f=quantum'; });
    await page.waitForFunction(() => document.querySelector('#chips [data-v="quantum"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.textContent('#toc-title'), 'Quantum computing · last 3 days');
    await page.click('#tab-sources');
    assert.equal(await page.isHidden('#panel-stories'), true);
    assert.equal(await page.$$eval('#src-rows tr', rows => rows.length), live.sources.length, 'one row per feed');
    assert.match(await page.evaluate(() => location.hash), /tab=sources/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll on the Sources tab');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
