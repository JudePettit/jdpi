// The calendars' follow-up of the corrections of 26 November 2026: the faults the verifier of build 8 saw that no build
// reached, and stage 0 ("Groundwork") of VM-POLITICAL-EVENT-TYPES-STUDY.md.
//   PRP_PAGES=0 node --test tests/follow-calendar.test.mjs                          (rules and the built data)
//   JDPI_URL=http://localhost:9324 node --test tests/follow-calendar.test.mjs       (and the page)
// 1. One record per vote: France's legislative election of 2024 and the Czech election of 2025 stood twice (the
//    Retrospective's first day beside the Atlas's second round or second day); their kin too.
// 2. "Antonio Saca takes power" (1 June 2004), not "Saca González".
// 3. Three whole leads that end at an abbreviation are no longer fetched on every run.
// 4. Wikidata's referendums below the state, and votes never held on the day Wikidata gives, are left out and counted.
// 5. Stage 0: Micronesia's and the other Atlas elections typed as party contests; the Barnier and May confidence votes
//    placed in France and the United Kingdom; Fiji's referendum of 9 December 2026, whose date has gone.
// "After the second readers" (26 November 2026): deadlines given with a bare "by"; votes below the state still listed
// (Brno, Berlin, Hamburg, Hong Kong, North Kosovo, Ethiopia's zones, Arenys de Munt, the breakaway territories) and one
// national vote left out (Macedonia, 2004); dependent territories' votes under their own names; one vote under two titles
// (a redirect, or the same article on two days); the Turkic States' summits of 2023 and 2024; the Pope's visit under its
// article's title; Seychelles' first round on its day; the Atlas's year-only votes and the month-only rule narrowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pageTest, launch } from './tools/pages.mjs';
import { atlasElections, atlasLater, mergeBallots, ballotKind, deadlinesIn, markDeadlines, sameArticle, daysNamed, articleOf, titlesToResolve } from '../calendar/scripts/outlook.mjs';
import { PARTY_CONTEST, belowState, NOT_HELD, offYear, PLACED, ownTerritory } from '../calendar/scripts/ballot-scope.mjs';
import { titlesToFetch, cutAtAbbreviation, titleOf } from '../calendar/scripts/enrich-summaries.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const DECADES = ['1980s', '1990s', '2000s', '2010s', '2020s'].map(d => JSON.parse(readFileSync(new URL(`../calendar/data/${d}.json`, import.meta.url), 'utf8')));
const ALL = DECADES.flatMap(d => d.events);
const CACHE = JSON.parse(readFileSync(new URL('../calendar/scripts/summary-cache.json', import.meta.url), 'utf8'));
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
const ev = (via, date, country, title, more = {}) => ({ via, date, country, title, type: 'election', status: 'declared', precision: 'day', source: wiki(title), ...more });
const atlas = (date, country, title, iso, more = {}) => ev('atlas', date, country, title, { source: `https://political-atlas.pages.dev/#${iso}`, ...more });
const month = { status: 'tentative', precision: 'month' };
const rows = list => list.map(e => [e.date, e.country, e.title]);

test('1. one record per vote: a second round or a second day from the Atlas joins the vote, both rounds named', () => {
  const dropped = [];
  const out = mergeBallots([
    // Wikipedia: "held in France on 30 June and 7 July 2024"; the Political Atlas dates its "Snap legislative election" 7 July.
    ev('retro', '2024-06-30', 'France', '2024 French legislative election'),
    atlas('2024-07-07', 'France', 'Snap legislative election', 'FRA'),
    // Wikipedia: "held in the Czech Republic on 3 and 4 October 2025"; the Atlas gives the 4th. One round, two days.
    ev('retro', '2025-10-03', 'Czechia', '2025 Czech parliamentary election'),
    atlas('2025-10-04', 'Czechia', 'Chamber election', 'CZE'),
    // Wikipedia: "13 and 27 October 2024"; a parliamentary and a presidential vote of one day, and the run-off of 28 May
    // 2023, which was the presidential vote's (Wikipedia, "2023 Turkish presidential election": "28 May 2023 (second round)").
    ev('retro', '2024-10-13', 'Lithuania', '2024 Lithuanian parliamentary election'),
    atlas('2024-10-27', 'Lithuania', 'Seimas election', 'LTU'),
    ev('retro', '2023-05-14', 'Turkey', '2023 Turkish parliamentary election'),
    ev('retro', '2023-05-14', 'Turkey', '2023 Turkish presidential election'),
    atlas('2023-05-28', 'Turkey', 'Presidential & parliamentary elections', 'TUR'),
    // The lists name their own rounds; the Atlas's days two days later are the rounds' last days (25-27 September, 9-11 October).
    ev('list', '2025-09-25', 'Seychelles', '2025 Seychellois general election (first round)'),
    atlas('2025-09-27', 'Seychelles', 'National Assembly election', 'SYC'),
    ev('list', '2025-10-09', 'Seychelles', '2025 Seychellois general election (second round)'),
    atlas('2025-10-11', 'Seychelles', 'Presidential election (runoff)', 'SYC'),
    // Not the same vote: an indirect election, and a presidential vote beside a legislative one.
    ev('list', '2025-03-02', 'Tajikistan', '2025 Tajik parliamentary election'),
    atlas('2025-03-28', 'Tajikistan', 'National Assembly (indirect) election', 'TJK'),
    ev('retro', '2030-01-05', 'Testland', 'Testland legislative election'),
    atlas('2030-01-12', 'Testland', 'Presidential election', 'TST'),
  ], { today: '2026-11-26', dropped });
  assert.deepEqual(rows(out), [
    ['2024-06-30', 'France', '2024 French legislative election (first round; second round 7 July)'],
    ['2025-10-03', 'Czechia', '2025 Czech parliamentary election'],
    ['2024-10-13', 'Lithuania', '2024 Lithuanian parliamentary election (first round; second round 27 October)'],
    ['2023-05-14', 'Turkey', '2023 Turkish parliamentary election'],
    ['2023-05-14', 'Turkey', '2023 Turkish presidential election (first round; second round 28 May)'],
    ['2025-09-25', 'Seychelles', '2025 Seychellois general election (first round)'],
    ['2025-10-09', 'Seychelles', '2025 Seychellois general election (second round)'],
    ['2025-03-02', 'Tajikistan', '2025 Tajik parliamentary election'],
    ['2025-03-28', 'Tajikistan', 'National Assembly (indirect) election'],
    ['2030-01-05', 'Testland', 'Testland legislative election'],
    ['2030-01-12', 'Testland', 'Presidential election'],
  ]);
  assert.equal(dropped.length, 6);
  assert.deepEqual([ballotKind('Snap legislative election'), ballotKind('2023 Turkish presidential election'), ballotKind('General election'), ballotKind('Senate election (indirect)')], ['legislative', 'presidential', 'any', 'indirect']);
});

test('1. kin: a placeholder day takes the vote\'s day; a month-only record gives way to the dated one of its year', () => {
  const out = mergeBallots([
    // Wikipedia: "held in the Dominican Republic on 19 May 2024"; the Retrospective had Wikidata's 31 May.
    ev('retro', '2024-05-31', 'Dominican Republic', '2024 Dominican Republic general election'),
    atlas('2024-05-19', 'Dominican Republic', 'General election', 'DOM'),
    // "Next Italian general election" (the Retrospective's, September 2027) is the calendar's "2027 Italian general election".
    ev('retro', '2027-09-30', 'Italy', 'Next Italian general election'),
    ev('list', '2027-12-22', 'Italy', '2027 Italian general election'),
    atlas('2027-10-01', 'Poland', 'Parliamentary election (date to be confirmed)', 'POL', month),
    ev('list', '2027-11-11', 'Poland', 'Next Polish parliamentary election'),
    ev('list', '2027-09-01', 'Madagascar', '2027 Malagasy presidential election (date to be confirmed)', month),
    atlas('2027-10-01', 'Madagascar', 'Presidential election (date to be confirmed)', 'MDG', month),
  ], { today: '2026-11-26', calendarsFrom: 2026, redirects: new Map([['Next Italian general election', '2027 Italian general election']]) });
  assert.deepEqual(rows(out), [
    ['2024-05-19', 'Dominican Republic', '2024 Dominican Republic general election'],
    ['2027-12-22', 'Italy', '2027 Italian general election'],
    ['2027-11-11', 'Poland', 'Next Polish parliamentary election'],
    ['2027-09-01', 'Madagascar', '2027 Malagasy presidential election (date to be confirmed)'],
  ]);
  // Their dates are deadlines (Wikipedia, read 26 November 2026), so they are expected, not set.
  assert.deepEqual(deadlinesIn('General elections will occur in Italy no later than 22 December 2027.'), ['2027-12-22']);
  assert.deepEqual(deadlinesIn('Parliamentary elections will be held in Poland by 11 November 2027 at the latest to elect members of the Sejm and Senate'), ['2027-11-11']);
  // A bare "by" of a vote held is no deadline (second readers, 26 November 2026: one of a vote to come is; see below).
  assert.deepEqual(deadlinesIn('The vote was held by 11 November 2027, a Thursday.'), []);
  assert.deepEqual(deadlinesIn('Elections were held by 11 November 2027. They will be held again in 2031.'), []);
  assert.equal(markDeadlines(out, {
    '2027_Italian_general_election': 'General elections will occur in Italy no later than 22 December 2027.',
    'Next_Polish_parliamentary_election': 'Parliamentary elections will be held in Poland by 11 November 2027 at the latest to elect members of the Sejm and Senate.',
  }, '2026-11-26'), 2);
  assert.deepEqual(out.map(e => e.status), ['declared', 'tentative', 'tentative', 'tentative']);
});

test('1. undated: a placeholder gives way to the calendars\' "Unknown date" by article, through redirects either way', () => {
  // 27 November 2026: Wikipedia's "2027 national electoral calendar" lists Italy under "Unknown date", linking "2027
  // Italian general election"; the Retrospective's record links "Next Italian general election", a redirect to it, with
  // Wikidata's 30 September 2027.
  const redirects = new Map([['Next Italian general election', '2027 Italian general election']]);
  const opts = more => ({ today: '2026-11-27', calendarsFrom: 2026, redirects, ...more });
  const dropped = [];
  assert.deepEqual(mergeBallots([ev('retro', '2027-09-30', 'Italy', 'Next Italian general election')],
    opts({ undated: new Set([wiki('2027 Italian general election')]), dropped })), [], 'the record leads to the undated article');
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].why, /not yet dated/);
  // The reverse: the calendar's undated link is the redirect, the record links the article.
  assert.deepEqual(mergeBallots([ev('retro', '2027-09-30', 'Italy', '2027 Italian general election')],
    opts({ undated: new Set([wiki('Next Italian general election')]) })), [], 'the undated link leads to the record\'s article');
  // The raw address still matches with no redirects known (the Wikipedia API did not answer).
  assert.deepEqual(mergeBallots([ev('retro', '2027-09-30', 'Italy', 'Next Italian general election')],
    { today: '2026-11-27', undated: new Set([wiki('Next Italian general election')]) }), []);
  // Not dropped: without the redirect the two addresses are two articles; another country's placeholder; a vote whose
  // undated link leads to another article; a past vote.
  const undated = new Set([wiki('2027 Italian general election'), wiki('Next Testland general election')]);
  assert.deepEqual(rows(mergeBallots([ev('retro', '2027-09-30', 'Italy', 'Next Italian general election')], { today: '2026-11-27', undated })),
    [['2027-09-01', 'Italy', 'Next Italian general election (date to be confirmed)']]);
  const kept = mergeBallots([
    ev('retro', '2027-12-31', 'Malta', 'Next Maltese general election'),
    ev('retro', '2027-06-30', 'Testland', '2027 Testland general election'),
    ev('retro', '2026-10-31', 'Testland', 'Next Testland general election'), // past: the rule is for votes to come
  ], opts({ undated, redirects: new Map([...redirects, ['Next Testland general election', '2028 Testland general election']]) }));
  assert.deepEqual(kept.map(e => [e.date, e.country, e.title, e.status]), [
    ['2027-12-01', 'Malta', 'Next Maltese general election (date to be confirmed)', 'tentative'],
    ['2027-06-01', 'Testland', '2027 Testland general election (date to be confirmed)', 'tentative'],
    ['2026-10-31', 'Testland', 'Next Testland general election', 'declared'],
  ]);
});

test('1. undated, after the second readers: by article and section, type, every hop, either case; the calendars\' days by article', () => {
  // Ruritania and Testland are made up; each case is one the second readers of 27 November 2026 probed.
  const base = { today: '2026-11-27', calendarsFrom: 2026 };
  const ref = (date, title, more = {}) => ev('retro', date, 'Ruritania', title, { type: 'referendum', ...more });
  const states = list => list.map(e => [e.date, e.title, e.status]);
  // One article holds two referendums; the calendar lists only November's as undated. June's record stays.
  const toArticle = new Map([['June 2027 Ruritanian referendum', '2027 Ruritanian referendums'], ['November 2027 Ruritanian referendum', '2027 Ruritanian referendums']]);
  const toSection = new Map([['June 2027 Ruritanian referendum', 'June'], ['November 2027 Ruritanian referendum', 'November']]);
  const two = () => [ref('2027-06-30', 'June 2027 Ruritanian referendum'), ref('2027-11-30', 'November 2027 Ruritanian referendum')];
  const november = new Set([wiki('2027 Ruritanian referendums#November')]);
  assert.deepEqual(states(mergeBallots(two(), { ...base, undated: november, redirects: toArticle, sections: toSection })),
    [['2027-06-01', 'June 2027 Ruritanian referendum (date to be confirmed)', 'tentative']]);
  // With no section known for the redirects, neither record is read as November's: both stay.
  assert.equal(mergeBallots(two(), { ...base, undated: november, redirects: toArticle }).length, 2);
  // A record of one section does not give way to an undated link to the whole article (a literal '#' in the address).
  assert.equal(mergeBallots([ref('2027-06-30', 'June referendum', { source: 'https://en.wikipedia.org/wiki/2027_Ruritanian_referendums#June' })],
    { ...base, undated: new Set([wiki('2027 Ruritanian referendums')]) }).length, 1);
  // The same section, written once with %23 and once with '#', is one.
  assert.deepEqual(mergeBallots([ref('2027-11-30', 'November referendum', { source: 'https://en.wikipedia.org/wiki/2027_Ruritanian_referendums#November' })],
    { ...base, undated: november }), []);
  // A referendum's record does not give way to an undated general election, even through a redirect.
  assert.equal(mergeBallots([ref('2027-06-30', '2027 Ruritanian referendum')],
    { ...base, undated: new Set([wiki('2027 Ruritanian general election')]), redirects: new Map([['2027 Ruritanian referendum', '2027 Ruritanian general election']]) }).length, 1);
  // A double redirect, followed hop by hop: the record's R → U → A, the calendar's A; and the record's R → U, the
  // calendar's U, U → A.
  const hops = new Map([['Next Testland general election', 'Testland general election, 2027'], ['Testland general election, 2027', '2027 Testland general election']]);
  const testland = () => [ev('retro', '2027-09-30', 'Testland', 'Next Testland general election')];
  assert.deepEqual(mergeBallots(testland(), { ...base, undated: new Set([wiki('2027 Testland general election')]), redirects: hops }), []);
  assert.deepEqual(mergeBallots(testland(), { ...base, undated: new Set([wiki('Testland general election, 2027')]), redirects: hops }), []);
  // A redirect that loops does not hang the build, and leaves the record as it was.
  assert.equal(mergeBallots(testland(), { ...base, undated: new Set([wiki('2027 Testland general election')]),
    redirects: new Map([['Next Testland general election', 'Testland general election, 2027'], ['Testland general election, 2027', 'Next Testland general election']]) }).length, 1);
  // A lower-case first letter in the calendar's link to the article itself.
  assert.deepEqual(mergeBallots([ev('retro', '2027-12-31', 'Bahrain', 'Next Bahraini general election')],
    { ...base, undated: new Set([wiki('next Bahraini general election')]) }), []);
  // The calendars' days by article: a deadline on 31 December 2027 under a redirect, and the calendar's January vote
  // under the article it leads to. One record stays, the calendar's; before, the month-only rule (same year) left two.
  const calendar = ev('list', '2028-01-16', 'Testland', '2028 Testland general election');
  assert.deepEqual(rows(mergeBallots([ev('retro', '2027-12-31', 'Testland', 'Next Testland general election'), calendar],
    { ...base, redirects: new Map([['Next Testland general election', '2028 Testland general election']]) })),
  [['2028-01-16', 'Testland', '2028 Testland general election']]);
  // ... but a referendum the calendar dates does not take an election's placeholder away through a redirect.
  assert.equal(mergeBallots([ev('retro', '2027-12-31', 'Testland', 'Next Testland general election'), { ...calendar, type: 'referendum' }],
    { ...base, redirects: new Map([['Next Testland general election', '2028 Testland general election']]) }).length, 2);
  // articleOf: the article and section an address opens.
  assert.equal(articleOf(wiki('Next Italian general election'), new Map([['Next Italian general election', '2027 Italian general election']])), '2027 Italian general election');
  assert.equal(articleOf('https://en.wikipedia.org/wiki/June_2027_Ruritanian_referendum', toArticle, toSection), '2027 Ruritanian referendums#June');
  assert.equal(articleOf(wiki('next Bahraini general election')), 'Next Bahraini general election');
  assert.equal(articleOf('https://example.org/vote'), null);
  // build-events.mjs sends the calendars' undated links to the Wikipedia API with the votes' and summits' articles,
  // each as its address spells it and without its section; a link that is itself a redirect then matches.
  assert.deepEqual(titlesToResolve([
    ev('retro', '2027-09-30', 'Italy', '2027 Italian general election'),
    ev('list', '2027-06-30', 'Ruritania', 'x', { type: 'referendum', source: wiki('2027 Ruritanian referendums#June') }),
    ev('news', '2026-11-01', 'Ruritania', 'x', { type: 'protest', source: wiki('2026 Ruritanian protests') }),
    ev('list', '2026-11-01', 'Ruritania', 'x', { source: wiki('2026 in Ruritania') }),
  ], new Set([wiki('Next Italian general election'), wiki('next Bahraini general election'), wiki('2027 Ruritanian referendums#November')])),
  ['2027 Italian general election', '2027 Ruritanian referendums', 'Next Italian general election', 'next Bahraini general election']);
});

test('5. the Atlas: an election of Congress is an election, a vote below the state is left out, a year-only vote takes a lost date away', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-follow-'));
  try {
    mkdirSync(join(dir, 'data/countries'), { recursive: true });
    writeFileSync(join(dir, 'data/manifest.json'), JSON.stringify({ files: ['countries/test.json'] }));
    // Names as the Political Atlas gives them (data/countries/*.json, read 26 November 2026).
    writeFileSync(join(dir, 'data/countries/test.json'), JSON.stringify([
      { iso3: 'FSM', name: 'Micronesia', lastVerified: '2026-11-25', elections: [
        { name: 'General election (all 14 seats in Congress)', date: '2027-03-02', status: 'upcoming' },
        { name: 'Election of President and Vice President by the 25th Congress', date: '2027-05-11', status: 'upcoming' }] },
      { iso3: 'BRA', name: 'Brazil', elections: [{ name: 'General election (first round: president, Congress, governors)', date: '2026-10-04', status: 'held' }] },
      { iso3: 'CHN', name: 'China', elections: [{ name: '21st Party Congress', date: '2027-10', status: 'upcoming' }] },
      { iso3: 'NGA', name: 'Nigeria', elections: [{ name: 'Governorship and State Houses of Assembly elections', date: '2027-02-06', status: 'upcoming' }] },
      { iso3: 'FJI', name: 'Fiji', lastVerified: '2026-11-25', elections: [
        { name: 'Constitutional referendum', date: '2027', status: 'upcoming', note: 'Vote on a new constitution to replace the 2013 Constitution. No polling date has been set.' },
        { name: 'General election', date: '2027', status: 'upcoming' }] },
    ]));
    assert.deepEqual(atlasElections(dir).map(e => [e.country, e.title, e.type]), [
      ['Micronesia', 'General election (all 14 seats in Congress)', 'election'],
      ['Micronesia', 'Election of President and Vice President by the 25th Congress', 'election'],
      ['Brazil', 'General election (first round: president, Congress, governors)', 'election'],
      ['China', '21st Party Congress (date to be confirmed)', 'party'],
    ]);
    const later = atlasLater(dir);
    assert.deepEqual(later.map(x => [x.country, x.type, x.year]), [['Fiji', 'referendum', '2027'], ['Fiji', 'election', '2027']]);
    // Wikipedia's 2026 electoral calendar still gives "9 December: Fiji, Constitutional referendum"; the Atlas's review
    // note: "The referendum's 9 December date has gone" (Fijivillage, FBC and the Fiji Times, 25 November 2026).
    const dropped = [];
    const out = mergeBallots([
      ev('list', '2026-12-09', 'Fiji', '2026 Fijian constitutional referendum', { type: 'referendum' }),
      ev('list', '2027-02-06', 'Fiji', 'Next Fijian general election'),
    ], { today: '2026-11-26', later, dropped });
    assert.deepEqual(rows(out), [['2027-02-06', 'Fiji', 'Next Fijian general election']]);
    assert.match(dropped[0].why, /Political Atlas \(checked 2026-11-25\) puts the vote in 2027/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('4 and 5. Wikidata\'s referendums: below the state, never held, party contests, and items placed by hand', () => {
  // Below the state, by Wikidata's jurisdiction (P1001, P131) or by the title; a status vote stays.
  assert.equal(belowState({ title: '2018 California Proposition 12', country: 'United States' }), true);
  assert.equal(belowState({ title: '2017 Lombard autonomy referendum', country: 'Italy', jurs: ['Lombardy'] }), true);
  assert.equal(belowState({ title: '2026 Hamburg Olympics referendum', country: 'Germany', jurs: ['Hamburg'] }), true);
  assert.equal(belowState({ title: '1996 Okinawan referendum', country: 'Japan' }), true);
  assert.equal(belowState({ title: '2014 Scottish independence referendum', country: 'United Kingdom', jurs: ['Scotland'] }), false);
  assert.equal(belowState({ title: '2024 Puerto Rican status referendum', country: 'United States', jurs: ['Puerto Rico'] }), false);
  assert.equal(belowState({ title: '1999 Abkhazian constitutional referendum', country: 'Republic of Abkhazia' }), false);
  assert.equal(belowState({ title: '2001 Somaliland constitutional referendum', country: 'Somaliland' }), false);
  assert.equal(belowState({ title: '2016 Republika Srpska National Day referendum', country: 'Bosnia and Herzegovina' }), true);
  assert.equal(belowState({ title: '1995 Quebec referendum', country: 'Canada', jurs: ['Quebec'] }), false);
  assert.equal(belowState({ title: '1998 Northern Territory referendum', country: 'Australia' }), false);
  assert.equal(belowState({ title: '2021 Alberta referendum', country: 'Canada', jurs: ['Alberta'] }), true);
  assert.equal(belowState({ title: '2020 Italian constitutional referendum', country: 'Italy', jurs: ['Italy'], jurState: true }), false);
  assert.equal(belowState({ title: '2020 New Zealand cannabis referendum', country: 'New Zealand' }), false);
  assert.equal(belowState({ title: '2016 United Kingdom European Union membership referendum', country: 'United Kingdom' }), false);
  // Never held on the day Wikidata gives.
  assert.ok(NOT_HELD.has('2020 Armenian constitutional amendment'));
  assert.equal(offYear('2025 Marshallese constitutional referendum', '2023-11-20'), true);
  assert.equal(offYear('2025 Marshallese constitutional referendum', '2025-04-25'), false);
  assert.equal(offYear('1989–1990 Transnistrian referendum', '1989-12-03'), false);
  assert.equal(offYear('No Billag', '2018-03-04'), false);
  // Party contests filed under referendums.
  for (const t of ['2017 Lega Nord leadership election', '2021 The Republicans congress', 'Super Tuesday, 2008', '2024 Nevada Republican presidential nominating contests', '2019 Civic Platform presidential primary']) assert.ok(PARTY_CONTEST.test(t), t);
  assert.ok(!PARTY_CONTEST.test('2020 Italian constitutional referendum'));
  assert.equal(PLACED['2019 vote of confidence in the May ministry'], 'United Kingdom');
});

test('3. a whole lead that ends at an abbreviation is not fetched again on every run', () => {
  const whole = ['Hamdan_v._Rumsfeld', '2018_California_Proposition_12', '2024_Libertarian_National_Convention'];
  // The leads as Wikipedia's REST summaries gave them on 26 November 2026: whole, and ending at "U.S.", "No." and "D.C.".
  for (const t of whole) assert.ok(cutAtAbbreviation(CACHE[t]), t);
  const events = whole.map(t => ({ date: '2006-06-29', class: 'wikidata', source: `https://en.wikipedia.org/wiki/${t}`, summary: CACHE[t] }));
  assert.deepEqual(titlesToFetch(events, CACHE, '2026-11-26').titles, []);
  // On the whole calendar, a run fetches no lead that is already cached unless its day passed in the last 30 days.
  const { titles, recent } = titlesToFetch(ALL, CACHE, '2026-11-26');
  assert.deepEqual(titles.filter(t => t in CACHE && !recent.includes(t)), []);
  for (const t of whole) assert.ok(!titles.includes(t), t);
});

test('second readers: a bare "by" of a vote to come is a deadline, and a day after the deadline is expected', () => {
  // Wikipedia's leads (summary-cache.json, read 26 November 2026).
  const greek = 'Parliamentary elections are to be held by 25 July 2027, to elect the 300 members of the Hellenic Parliament.';
  const fiji = 'General elections are due to be held in Fiji by 6 February 2027 to elect the 55 members of parliament.';
  const serbia = 'Presidential elections will be held in Serbia by 26 December 2026 to elect the president of Serbia.';
  const libya = 'The next Libyan presidential election is scheduled to take place by 17 February 2027 to elect the President of Libya.';
  assert.deepEqual(deadlinesIn(greek), ['2027-07-25']);
  assert.deepEqual(deadlinesIn(fiji), ['2027-02-06']);
  assert.deepEqual(deadlinesIn(serbia), ['2026-12-26']);
  assert.deepEqual(deadlinesIn(libya), ['2027-02-17']);
  const out = [ev('list', '2027-07-25', 'Greece', 'Next Greek parliamentary election'), ev('list', '2026-12-27', 'Serbia', '2026 Serbian presidential election'),
    ev('list', '2027-03-15', 'Testland', 'Next Testland election')];
  assert.equal(markDeadlines(out, { Next_Greek_parliamentary_election: greek, '2026_Serbian_presidential_election': serbia,
    Next_Testland_election: 'Elections were held by 15 March 2027 in Testland.' }, '2026-11-26'), 2);
  assert.deepEqual(out.map(e => e.status), ['tentative', 'tentative', 'declared']);
});

test('second readers: votes below the state, a national vote, breakaway and dependent territories, party contests', () => {
  // Leads in summary-cache.json (Wikipedia, read 26 November 2026).
  for (const [title, country, jurs] of [
    ['2016 Brno central station referendum', 'Czechia', []],           // "a municipal referendum … in Brno"
    ['Deutsche Wohnen & Co. enteignen', 'Germany', ['Berlin']],         // "The 2021 Berlin referendum"
    ['Hamburger Zukunftsentscheid', 'Germany', ['Hamburg']],            // "in the German city-state of Hamburg"
    ['Hamburg testet Grundeinkommen', 'Germany', ['Hamburg']],
    ['2023 South Ethiopia Region referendum', 'Ethiopia', []],          // zones and special woredas of the SNNP Region
    ['6.22 Civil Referendum', 'China', []],                             // organised by the University of Hong Kong's Public Opinion Programme
    ['2012 North Kosovo referendum', 'Kosovo', []],                     // "held in the Serb-dominated regions of North Kosovo"
    ['2009 Catalan independence referendum in Arenys de Munt', 'Spain', ['Arenys de Munt', 'Catalonia']], // "a municipal non-binding query"
    ['2011 South Ossetian referendum', 'South Ossetia', []],            // filed under Georgia
    ['2017 South Ossetian name change referendum', 'South Ossetia', []],
    ['2003 Transnistrian referendum', 'Transnistria', []],              // filed under Moldova
  ]) assert.equal(belowState({ title, country, jurs }), true, title);
  for (const [title, country, jurs] of [
    ['2004 Macedonian autonomy referendum', 'North Macedonia', []],     // "held in Macedonia on 7 November 2004"
    ['1993 Republika Srpska referendum', 'Republika Srpska', []],       // "whether Republika Srpska should be able to join another country"
    ['1989–1990 Transnistrian referendum', 'Transnistria', []],         // "on the formation of the Pridnestrovian Moldavian Soviet Socialist Republic"
    ['2001 Somaliland constitutional referendum', 'Somaliland', []],    // "affirmed Somaliland's independence from Somalia"
    ['1991 Transcarpathian general regional referendum', 'Ukraine', []], // "status of an autonomous province within Ukraine"
    ['2006 South Ossetian independence referendum', 'South Ossetia', []],
    ['1999 Abkhazian constitutional referendum', 'Republic of Abkhazia', []],
    ['2011 Falkland Islands electoral system referendum', 'Falkland Islands', ['Falkland Islands']],
  ]) assert.equal(belowState({ title, country, jurs }), false, title);
  // A dependent territory's own vote is filed under it; a region's is not.
  assert.equal(ownTerritory(['Falkland Islands']), 'Falkland Islands');
  assert.equal(ownTerritory(['Saint Helena']), 'Saint Helena');
  assert.equal(ownTerritory(['Lombardy']), null);
  assert.equal(ownTerritory(['Hamburg']), null);
  assert.equal(ownTerritory(['Gibraltar', 'United Kingdom']), null);
  assert.ok(NOT_HELD.has('2020 Falkland Islands electoral system referendum')); // held on 24 September, not Wikidata's 26 March
  // A congress or convention is a party's only when a party is named.
  for (const t of ['2024 Libertarian National Convention', '26th Congress of the Communist Party of the Soviet Union', "36th Republican People's Party Ordinary Convention"]) assert.ok(PARTY_CONTEST.test(t), t);
  for (const t of ['2020 Chilean Constitutional Convention referendum', '2020 United States Virgin Islands constitutional convention referendum', '1983 Northern Mariana Islands Constitutional Convention referendum']) assert.ok(!PARTY_CONTEST.test(t), t);
});

test('second readers: one vote under two titles or two days, the lead\'s day, and the narrower month-only and year-only rules', () => {
  // A redirect: "1990 Romanian parliamentary election" leads to "1990 Romanian general election" (MediaWiki API, 26
  // November 2026); "Pope Leo XIV's 2026 visit to Uruguay" to "Visit by Pope Leo XIV to Uruguay, Argentina, and Peru".
  const pope = 'Visit by Pope Leo XIV to Uruguay, Argentina, and Peru';
  const redirects = new Map([['1990 Romanian parliamentary election', '1990 Romanian general election'], ["Pope Leo XIV's 2026 visit to Uruguay", pope],
    ['2021 Bulgarian presidential election', '2021 Bulgarian general election'], ['2014 Donetsk status referendum', '2014 Donbas status referendums'],
    ['2014 Luhansk status referendum', '2014 Donbas status referendums']]);
  const dropped = [];
  const kept = sameArticle([
    ev('retro', '1990-05-20', 'Romania', '1990 Romanian parliamentary election'), ev('retro', '1990-05-20', 'Romania', '1990 Romanian general election'),
    ev('wikidata', '2026-11-06', 'Uruguay', "Pope Leo XIV's 2026 visit to Uruguay", { type: 'summit' }),
    ev('wikidata', '2026-11-06', 'Uruguay', pope, { type: 'summit', source: 'https://en.wikipedia.org/wiki/Visit_by_Pope_Leo_XIV_to_Uruguay%2C_Argentina%2C_and_Peru' }),
    ev('retro', '2021-11-14', 'Bulgaria', '2021 Bulgarian presidential election'),
    ev('wikidata', '2014-05-11', 'Ukraine', '2014 Donetsk status referendum', { type: 'referendum' }),
    ev('wikidata', '2014-05-11', 'Ukraine', '2014 Luhansk status referendum', { type: 'referendum' }),
  ], redirects, dropped);
  assert.deepEqual(rows(kept), [['1990-05-20', 'Romania', '1990 Romanian general election'], ['2026-11-06', 'Uruguay', pope],
    ['2021-11-14', 'Bulgaria', '2021 Bulgarian presidential election'], ['2014-05-11', 'Ukraine', '2014 Donetsk status referendum'],
    ['2014-05-11', 'Ukraine', '2014 Luhansk status referendum']]);
  assert.equal(dropped.length, 2);
  // One article and title on two days: the day the lead gives ("held in Liechtenstein on 9 February 2025").
  const leads = {
    '2025_Liechtenstein_general_election': 'General elections were held in Liechtenstein on 9 February 2025 to elect the 25 members of the Landtag.',
    '2025_Seychellois_general_election': 'General elections were held in Seychelles on 27 September 2025 to elect a president and members of the National Assembly, with a second round of the presidential election held from 9 to 11 October after no candidate received a majority of the vote in the first round.',
    '2025_Czech_parliamentary_election': 'Parliamentary elections were held in the Czech Republic on 3 and 4 October 2025.',
  };
  const two = [ev('retro', '2025-02-02', 'Liechtenstein', '2025 Liechtenstein general election'), ev('list', '2025-02-09', 'Liechtenstein', '2025 Liechtenstein general election')];
  assert.deepEqual(rows(mergeBallots(two.map(e => ({ ...e })), { today: '2026-11-26', leads })), [['2025-02-09', 'Liechtenstein', '2025 Liechtenstein general election']]);
  assert.deepEqual(rows(mergeBallots(two.map(e => ({ ...e })), { today: '2026-11-26' })), [['2025-02-09', 'Liechtenstein', '2025 Liechtenstein general election']]);
  // Polling days that one feed lists under one title are its phases, not twins (Myanmar's of 28 December 2025 and
  // 11 January 2026). A vote over days its lead names both of, "23 May and 24 May 1997" included (the 1997 Slovak
  // referendum's lead, summary-cache.json, read 26 November 2026), is left to build-events.mjs, which keeps the
  // Retrospective's day.
  const myanmar = '2025–26 Myanmar general election';
  assert.equal(mergeBallots([ev('list', '2025-12-28', 'Myanmar', myanmar), ev('list', '2026-01-11', 'Myanmar', myanmar)], { today: '2026-11-26' }).length, 2);
  const slovak = { '1997_Slovak_referendum': 'A referendum was held in Slovakia on 23 May and 24 May 1997. Voters in Slovakia were asked four separate questions.' };
  assert.deepEqual([...daysNamed(slovak['1997_Slovak_referendum'])].sort(), ['1997-05-23', '1997-05-24']);
  assert.equal(mergeBallots([ev('retro', '1997-05-24', 'Slovakia', '1997 Slovak referendum', { type: 'referendum' }),
    ev('wikidata', '1997-05-23', 'Slovakia', '1997 Slovak referendum', { type: 'referendum' })], { today: '2026-11-26', leads: slovak }).length, 2);
  // So is a Wikidata copy of a Retrospective vote further apart ("held in Russia between 25 June and 1 July 2020").
  const russia = { '2020_Russian_constitutional_referendum': 'A constitutional referendum was held in Russia between 25 June and 1 July 2020.' };
  assert.deepEqual([...daysNamed(russia['2020_Russian_constitutional_referendum'])].sort(), ['2020-06-25', '2020-07-01']);
  assert.equal(mergeBallots([ev('retro', '2020-07-01', 'Russia', '2020 Russian constitutional referendum', { type: 'referendum' }),
    ev('wikidata', '2020-06-25', 'Russia', '2020 Russian constitutional referendum', { type: 'referendum' })], { today: '2026-11-26', leads: russia }).length, 2);
  // Named rounds of one article stay apart.
  assert.equal(mergeBallots([ev('retro', '2024-12-29', 'Croatia', '2024–25 Croatian presidential election'), ev('list', '2025-01-12', 'Croatia', '2024–25 Croatian presidential election (second round)')], { today: '2026-11-26' }).length, 2);
  // The Atlas's last day is the vote's day when the lead's first sentence gives it and not the other record's.
  assert.deepEqual([...daysNamed(leads['2025_Czech_parliamentary_election'])], ['2025-10-03', '2025-10-04']);
  assert.deepEqual([...daysNamed(leads['2025_Seychellois_general_election'])], ['2025-09-27']);
  assert.deepEqual([...daysNamed('Elections were held on February 9, 2025.')], ['2025-02-09']);
  assert.deepEqual(rows(mergeBallots([
    ev('list', '2025-09-25', 'Seychelles', '2025 Seychellois general election (first round)', { source: wiki('2025 Seychellois general election') }),
    atlas('2025-09-27', 'Seychelles', 'National Assembly election', 'SYC'),
    ev('list', '2025-10-09', 'Seychelles', '2025 Seychellois general election (second round)', { source: wiki('2025 Seychellois general election') }),
    atlas('2025-10-11', 'Seychelles', 'Presidential election (runoff)', 'SYC'),
    ev('retro', '2025-10-03', 'Czechia', '2025 Czech parliamentary election'),
    atlas('2025-10-04', 'Czechia', 'Chamber election', 'CZE'),
  ], { today: '2026-11-26', leads })), [
    ['2025-09-27', 'Seychelles', '2025 Seychellois general election (first round)'],
    ['2025-10-09', 'Seychelles', '2025 Seychellois general election (second round)'],
    ['2025-10-03', 'Czechia', '2025 Czech parliamentary election'],
  ]);
  // A year-only Atlas entry for the next regular vote (Bulgaria's of 2030, no note) does not take a snap election away.
  const later = [{ country: 'Bulgaria', type: 'election', year: '2030', title: 'Parliamentary election', checked: '2026-11-02', note: '' },
    { country: 'Testland', type: 'election', year: '2028', title: 'General election', checked: '2026-11-02', note: 'Due by law at the end of the term.' }];
  assert.deepEqual(rows(mergeBallots([ev('list', '2027-03-28', 'Bulgaria', '2027 Bulgarian parliamentary election'), ev('list', '2027-05-02', 'Testland', '2027 Testland general election')],
    { today: '2026-11-26', later })), [['2027-03-28', 'Bulgaria', '2027 Bulgarian parliamentary election'], ['2027-05-02', 'Testland', '2027 Testland general election']]);
  // Two Swiss referendums of one year, one known to the month and one dated six months later, are two votes; so are a
  // regular election and a snap one, known to the month, seven months later.
  assert.equal(mergeBallots([
    ev('retro', '2027-03-01', 'Switzerland', 'March 2027 Swiss referendum (date to be confirmed)', { type: 'referendum', ...month }),
    ev('list', '2027-09-26', 'Switzerland', 'September 2027 Swiss referendums', { type: 'referendum' }),
    ev('list', '2019-04-28', 'Spain', 'April 2019 Spanish general election'),
    atlas('2019-11-01', 'Spain', 'Snap general election (date to be confirmed)', 'ESP', month),
  ], { today: '2018-01-01' }).length, 4);
});

test('the built calendar: one record per vote, Antonio Saca, the referendums left out and counted, the votes placed', () => {
  const on = (date, re) => ALL.filter(e => e.date === date && re.test(e.title));
  // 1. France 2024 and Czechia 2025, once each.
  assert.deepEqual(ALL.filter(e => e.country === 'France' && e.type === 'election' && /^2024-0[67]/.test(e.date)).map(e => [e.date, e.title]),
    [['2024-06-30', '2024 French legislative election (first round; second round 7 July)']]);
  assert.deepEqual(ALL.filter(e => e.country === 'Czechia' && e.type === 'election' && /^2025-10/.test(e.date)).map(e => [e.date, e.title]),
    [['2025-10-03', '2025 Czech parliamentary election']]);
  // Italy's next general election, at most once, and then tentative. Which source dates it is not this test's business:
  // until 26 November 2026 the daily build kept Wikipedia's electoral calendar's record (22 December 2027, the last day
  // the vote may be held), and on 27 November the Retrospective's, known to the month (September 2027, to be confirmed);
  // the pinned date and title then failed four refreshes' suites and held their deploys back. That day the calendar
  // moved Italy to "Unknown date", and the Retrospective's placeholder gives way to it by article (mergeBallots), so a
  // build made while the calendar leaves the vote undated lists no Italian election in 2027, unless another source dates
  // it. The title is matched without the country's name: the Political Atlas holds the vote as
  // "General election (latest)", known to the year (political-atlas/data/countries/europe-west-south.json), and a month
  // or a day there would make its record the vote's under that title.
  const italy = ALL.filter(e => e.country === 'Italy' && e.type === 'election' && e.date.startsWith('2027')).map(e => [e.date, e.title, e.status]);
  assert.ok(italy.length <= 1, JSON.stringify(italy));
  for (const [date, title, status] of italy) {
    assert.match(title, /\bgeneral election\b/i);
    assert.equal(status, 'tentative');
    assert.ok(date <= '2027-12-22', `not after the last day the vote may be held: ${date}`);
  }
  assert.deepEqual(ALL.filter(e => e.country === 'Poland' && e.type === 'election' && e.date.startsWith('2027')).map(e => [e.date, e.title, e.status]),
    [['2027-11-11', 'Next Polish parliamentary election', 'tentative']]);
  assert.deepEqual(ALL.filter(e => e.country === 'Dominican Republic' && e.type === 'election' && e.date.startsWith('2024-05')).map(e => e.date), ['2024-05-19']);
  // 2. The 2004 leader of El Salvador by his name.
  assert.deepEqual(on('2004-06-01', /takes power/).filter(e => e.country === 'El Salvador').map(e => e.title), ['Antonio Saca takes power']);
  assert.deepEqual(ALL.filter(e => /Saca González/.test(e.title)).map(e => e.title), []);
  // 4. Below the state, and never held: left out. Status votes stay.
  for (const t of ['2018 California Proposition 12', '2017 Lombard autonomy referendum', '2017 Venetian autonomy referendum', '2026 Hamburg Olympics referendum', '2020 Armenian constitutional amendment'])
    assert.deepEqual(ALL.filter(e => e.title === t).map(e => e.date), [], t);
  assert.deepEqual(ALL.filter(e => e.title === '2025 Marshallese constitutional referendum' || (e.country === 'Marshall Islands' && e.type === 'referendum')).map(e => e.date), ['2025-04-25']);
  assert.deepEqual(ALL.filter(e => e.title === '2020 Italian constitutional referendum').map(e => e.date), ['2020-09-21']);
  // Wikidata's deprecated dates are not read: New Caledonia voted on 4 October 2020, not 6 September; Taiwan's 2021
  // referendum was held on 18 December, not 28 August (Wikipedia's leads, read 26 November 2026).
  assert.deepEqual(ALL.filter(e => e.title === '2020 New Caledonian independence referendum').map(e => e.date), ['2020-10-04']);
  assert.deepEqual(ALL.filter(e => e.title === '2021 Taiwanese referendum').map(e => e.date), ['2021-12-18']);
  // A Wikidata vote that is a Retrospective vote of its year takes the Retrospective's day: one record, 28 June 1998.
  assert.deepEqual(ALL.filter(e => e.title === '1998 Portuguese abortion referendum').map(e => e.date), ['1998-06-28']);
  // An item with two countries is filed under the one its title names.
  assert.deepEqual(ALL.filter(e => e.title === '1991 Russian presidential referendum').map(e => e.country), ['Russia']);
  assert.deepEqual(ALL.filter(e => e.title === '2014 Donetsk status referendum').map(e => e.country), ['Ukraine']);
  for (const t of ['2014 Scottish independence referendum', '1980 Quebec referendum', '1995 Quebec referendum', '2001 Somaliland constitutional referendum'])
    assert.equal(ALL.filter(e => e.title === t && e.type === 'referendum').length, 1, t);
  assert.deepEqual(ALL.filter(e => e.type === 'referendum' && PARTY_CONTEST.test(e.title)).map(e => e.title), []);
  // The counted note: the same counts in every decade's file, and at least the votes named above.
  const counts = DECADES.map(d => JSON.stringify(d.leftOut));
  assert.equal(new Set(counts).size, 1, counts.join(' / '));
  const n = DECADES[0].leftOut;
  assert.ok(n.belowState >= 50 && n.notHeld >= 2 && n.datesGone >= 1, JSON.stringify(n));
  // 5. Micronesia's elections are elections; the Barnier and May votes are France's and the United Kingdom's; Fiji's
  // referendum of 9 December 2026 is gone.
  const fsm = ALL.filter(e => e.country === 'Micronesia' && /Congress/.test(e.title));
  assert.ok(fsm.length >= 1 && fsm.every(e => e.type === 'election'), JSON.stringify(fsm.map(e => [e.title, e.type])));
  assert.deepEqual(ALL.filter(e => e.class === 'atlas' && e.type === 'party' && !/\bparty congress\b|\bleadership\b|\bprimar/i.test(e.title)).map(e => e.title), []);
  assert.deepEqual(on('2024-12-04', /Barnier government/).map(e => [e.country, e.iso3]), [['France', 'FRA']]);
  assert.deepEqual(on('2019-01-16', /May ministry/).map(e => [e.country, e.iso3]), [['United Kingdom', 'GBR']]);
  assert.deepEqual(ALL.filter(e => e.country === 'Fiji' && e.date === '2026-12-09').map(e => e.title), []);
  // Nigeria's governorship elections are below the state.
  assert.deepEqual(ALL.filter(e => /Governorship/.test(e.title)).map(e => e.title), []);
});

test('the built calendar after the second readers', () => {
  const titled = t => ALL.filter(e => e.title === t);
  // Votes whose leads give a deadline (summary-cache.json, read 26 November 2026) are expected, not set.
  for (const [country, date] of [['Greece', '2027-07-25'], ['Fiji', '2027-02-06'], ['Estonia', '2027-03-07'], ['Montenegro', '2027-06-30'], ['Slovakia', '2027-09-25'], ['Libya', '2027-02-17'], ['Serbia', '2026-12-27']]) {
    const list = ALL.filter(e => e.country === country && e.date === date && e.type === 'election');
    assert.ok(list.length >= 1 && list.every(e => e.status === 'tentative'), `${country} ${date}: ${JSON.stringify(list.map(e => [e.title, e.status]))}`);
  }
  // Below the state: left out. A national vote, status votes and a dependent territory's own votes: kept, where they are.
  for (const t of ['2016 Brno central station referendum', 'Deutsche Wohnen & Co. enteignen', 'Hamburger Zukunftsentscheid', '2023 South Ethiopia Region referendum',
    '6.22 Civil Referendum', '2009 Catalan independence referendum in Arenys de Munt', '2012 North Kosovo referendum', '2011 South Ossetian referendum',
    '2017 South Ossetian name change referendum', '2003 Transnistrian referendum', '2020 Falkland Islands electoral system referendum'])
    assert.deepEqual(titled(t).map(e => e.date), [], t);
  assert.deepEqual(titled('2004 Macedonian autonomy referendum').map(e => [e.date, e.country]), [['2004-11-07', 'North Macedonia']]);
  for (const t of ['1993 Republika Srpska referendum', '1989–1990 Transnistrian referendum', '1991 Transcarpathian general regional referendum'])
    assert.equal(titled(t).length, 1, t);
  assert.deepEqual(titled('2011 Falkland Islands electoral system referendum').map(e => e.country), ['Falkland Islands']);
  assert.deepEqual(titled('2021 Saint Helena governance system referendum').map(e => e.country), ['Saint Helena']);
  // One record per vote: the titles that lead to another article's, and the Retrospective's 2 February for Liechtenstein.
  for (const [country, date] of [['Romania', '1990-05-20'], ['Romania', '1992-09-27'], ['Romania', '1996-11-03'], ['Romania', '2000-11-26'], ['Romania', '2004-11-28'], ['Costa Rica', '1994-02-06']])
    assert.equal(ALL.filter(e => e.country === country && e.date === date && e.type === 'election' && !/presidential|second round/i.test(e.title)).length, 1, `${country} ${date}`);
  assert.equal(ALL.filter(e => /Serbia/.test(e.country) && e.date === '1992-12-20' && e.type === 'election' && !/presidential/i.test(e.title)).length, 1);
  assert.deepEqual(titled('2025 Liechtenstein general election').map(e => e.date), ['2025-02-09']);
  assert.deepEqual(titled('2025–26 Myanmar general election').map(e => e.date), ['2025-12-28', '2026-01-11', '2026-01-25']);
  // Votes over two or three days keep one record, on the day they had before the second readers.
  for (const [t, d] of [['1997 Slovak referendum', '1997-05-24'], ['2003 Czech European Union membership referendum', '2003-06-14'],
    ['2020 Italian constitutional referendum', '2020-09-21'], ['2026 Russian legislative election', '2026-09-20'], ['2020 Russian constitutional referendum', '2020-07-01']])
    assert.deepEqual(titled(t).map(e => e.date), [d], t);
  // The Turkic States' summits of 2023 and 2024, from the Organization of Turkic States article's table.
  assert.deepEqual(ALL.filter(e => /Organization of Turkic States summit/.test(e.title) && e.date > '2023').map(e => [e.date, e.country, e.source]), [
    ['2023-11-03', 'Kazakhstan', 'https://en.wikipedia.org/wiki/Organization_of_Turkic_States'],
    ['2024-11-06', 'Kyrgyzstan', 'https://en.wikipedia.org/wiki/Organization_of_Turkic_States']]);
  // The Pope's visit under its article's own title; Seychelles' first round on the day it was held.
  assert.deepEqual(ALL.filter(e => e.date === '2026-11-06' && /Pope Leo XIV/.test(e.title)).map(e => e.title), ['Visit by Pope Leo XIV to Uruguay, Argentina, and Peru']);
  assert.deepEqual(ALL.filter(e => e.country === 'Seychelles' && /first round/.test(e.title)).map(e => e.date), ['2025-09-27']);
  // No referendum is typed as a party contest for naming a constitutional convention.
  assert.deepEqual(ALL.filter(e => e.type === 'party' && /\bconstitutional convention\b/i.test(e.title)).map(e => e.title), []);
});

test('the Sources count what the build left out', pageTest, async () => {
  const n = DECADES[0].leftOut;
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/calendar.html?period=history&month=2014-09`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => /Left out:/.test(document.getElementById('left-out')?.textContent || ''), null, { timeout: 30000 });
    const text = await page.locator('#left-out').innerText();
    assert.match(text, new RegExp(`Left out: ${n.belowState} of Wikidata’s referendums, held in only a part of a state`));
    assert.match(text, new RegExp(`; ${n.notHeld} referendums? that Wikidata dates on a day no vote was held`));
    assert.match(text, /a vote on a territory’s independence, sovereignty or status, as its title or Wikipedia’s lead names it, stays under its state \(one on its autonomy does not\), and a dependent territory’s own votes stand under its name/);
    assert.doesNotMatch(text, /or a dependent territory\)/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
