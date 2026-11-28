// National Analysis, the follow-up to build 7 of the 26 November 2026 corrections (jdpi-corrections-verify.md, sections
// 3 and 4), and the repairs after its two second readers. Each test failed before its correction and passes after it.
//   carry       national/scripts/build.mjs empties national/data before it writes, so the monthly refresh
//               (national-refresh.yml) deleted national/data/governance/ and standins.json: it now fetches the
//               governance files again and keeps the ones there before when it cannot (carry.mjs), put in the order of
//               the new country list, and keeps standins.json as it was
//   overview    votes still to come are not counted; a country whose records hold no vote has an unknown count (null),
//               not 0 (Japan); a longest-serving leader tied with others at the shown precision is not named (Mexico)
//   leaders     the party comes from the Political Atlas where the Retrospective has none for the person (Finland)
//   government  forms of government whose Wikidata statement has ended are left out (Mexico's "empire"), in a fixed order
//   rebuild     the data rebuilt by build.mjs. These follow their sources (wars.json, realtime.json, Wikidata as read by
//               the build), so a routine refresh with new data passes them; the few figures read on 26 November 2026 are
//               checked only on a build of those days (THIS_REBUILD) and skipped with a message after it.
// FOLLOW_NATIONAL_DATA (a copy of national/data) and FOLLOW_NATIONAL_BUILD (a copy of build.mjs) point the tests at an
// older copy, to show they fail on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = process.env.FOLLOW_NATIONAL_DATA || join(ROOT, 'national/data');
const BUILD = process.env.FOLLOW_NATIONAL_BUILD || join(ROOT, 'national/scripts/build.mjs');
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const index = () => json(join(DATA, 'index.json'));
const country = iso3 => index().countries.find(c => c.iso3 === iso3);
// The rebuild of 26 November 2026: the figures read that day are checked only on a build of those days (refresh pins 2,
// 28 November 2026: the window was the 26th to the 29th, but a build run by hand on the 28th or 29th reads Wikidata
// again; the data holds the read of 27 November 2026, 12:17 UTC, with the same values).
const THIS_REBUILD = /^2026-11-2[67]/;
const laterBuild = () => { const at = index().sources?.wikidataRead || ''; return THIS_REBUILD.test(at) ? false : `a later build (${at}): the figures read on 26 November 2026 may have moved with their sources`; };

// ---- carry
test('carry: build.mjs fetches the governance files again and carries them and standins.json across its emptying of national/data', () => {
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /import \{[^}]*\bgovernanceFiles\b[^}]*\bwriteGovernance\b[^}]*\} from '\.\/indicators\.mjs'/, 'build.mjs imports the governance job');
  assert.match(src, /import \{[^}]*\breadKept\b[^}]*\bgovernanceOrKept\b[^}]*\bwriteKept\b[^}]*\} from '\.\/carry\.mjs'/, 'build.mjs imports carry.mjs');
  const empty = src.indexOf('rmSync(OUT,');
  assert.ok(empty > 0, 'build.mjs still replaces national/data whole');
  const at = s => src.indexOf(s);
  assert.ok(at('readKept(OUT)') > 0 && at('readKept(OUT)') < empty, 'the files there before are read before the folder is emptied');
  assert.ok(at('governanceOrKept(') > 0 && at('governanceOrKept(') < empty, 'the governance files are fetched before the folder is emptied');
  assert.ok(at('writeKept(OUT') > empty, 'and written back after it');
  assert.match(src, /governanceFiles\(\{ getJson, countries: wbCountries\.map\(c => c\.id\)/, 'for the countries of index.json, in its order');
  assert.match(src, /kept: kept\.governance, countries: wbCountries\.map\(c => c\.id\)/, 'kept files are put in the same order');
});

test('carry: a "too many requests" answer is waited out as long as the source asks, not retried within seconds', () => {
  // 26 November 2026: Wikidata's query service answered the heads query with 429 after the long office query, and the
  // build's five retries within 30 seconds all failed, so nothing was written.
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /r\.status === 429\) wait = Math\.min\(120, Number\(r\.headers\.get\('retry-after'\)\) \|\| 60\) \* 1000/);
});

test('carry: the office statements are asked for in four parts, each within Wikidata\'s 60-second limit', () => {
  // 26 November 2026: asked for at once, the 13,726 office statements ran past the query service's limit, and the reply
  // came back cut short with a TimeoutException, so the build stopped every time.
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /const OFFICE_PARTS = \[\['wdt:P1906', 'hos'\], \['wdt:P1313', 'hog'\]\]\.flatMap\(\(\[op, prop\]\) => \['\?iso3 < "M"', '\?iso3 >= "M"'\]/);
  assert.match(src, /for \(const part of OFFICE_PARTS\) \{ await sleep\(1000\); officeRows\.push\(\.\.\.await sparqlRows\(officeQuery\(part\)\)\); \}/);
  assert.doesNotMatch(src, /VALUES \(\?op \?prop\) \{ \(wdt:P1906 "hos"\) \(wdt:P1313 "hog"\) \}/, 'no single request for both offices');
  // The country statements (P35, P6) likewise: on the rerun of 26 November 2026 their single reply was cut short at the
  // same byte five times, and the build stopped.
  assert.match(src, /const HEAD_PARTS = \[\['p:P35', 'ps:P35', 'hos'\], \['p:P6', 'ps:P6', 'hog'\]\]\.flatMap\(\(\[p, ps, prop\]\) => \['\?iso3 < "M"', '\?iso3 >= "M"'\]/);
  assert.match(src, /for \(const part of HEAD_PARTS\) \{ await sleep\(1000\); headRows\.push\(\.\.\.await sparqlRows\(headsQuery\(part\)\)\); \}/);
  assert.doesNotMatch(src, /VALUES \(\?p \?ps \?prop\) \{ \(p:P35 ps:P35 "hos"\) \(p:P6 ps:P6 "hog"\) \}/, 'no single request for both properties');
});

test('carry: a failed governance fetch keeps the files there before; a good one replaces them; standins.json is kept as it was', async () => {
  const { readKept, governanceOrKept, writeKept } = await import('../national/scripts/carry.mjs');
  const { writeGovernance } = await import('../national/scripts/indicators.mjs');
  const OUT = mkdtempSync(join(tmpdir(), 'follow-national-'));
  try {
    mkdirSync(join(OUT, 'governance'), { recursive: true });
    writeFileSync(join(OUT, 'governance/GOV_WGI_PV.json'), '{"old":1}');
    writeFileSync(join(OUT, 'governance/GOV_WGI_CC.json'), '{"old":2}');
    writeFileSync(join(OUT, 'standins.json'), '{"format":"vm-standins/1"}');
    writeFileSync(join(OUT, 'index.json'), '{}');
    const kept = readKept(OUT);
    assert.deepEqual(kept.governance.map(([p]) => p), ['governance/GOV_WGI_CC.json', 'governance/GOV_WGI_PV.json']);
    assert.deepEqual(kept.asIs, [['standins.json', '{"format":"vm-standins/1"}']]);
    // The World Bank fails: the old files come back, and the build is told.
    const warned = [];
    const failed = await governanceOrKept({ fresh: async () => { throw new Error('Failed: https://api.worldbank.org/…'); }, kept: kept.governance, warn: m => warned.push(m) });
    assert.equal(failed.from, 'kept');
    assert.match(warned.join(' | '), /Failed: https:\/\/api\.worldbank\.org.*the 2 files there before are kept/);
    rmSync(OUT, { recursive: true, force: true }); // as build.mjs does
    writeKept(OUT, { governance: failed.files, asIs: kept.asIs }, writeGovernance);
    assert.deepEqual(readdirSync(join(OUT, 'governance')).sort(), ['GOV_WGI_CC.json', 'GOV_WGI_PV.json']);
    assert.equal(readFileSync(join(OUT, 'governance/GOV_WGI_PV.json'), 'utf8'), '{"old":1}');
    assert.equal(readFileSync(join(OUT, 'standins.json'), 'utf8'), '{"format":"vm-standins/1"}');
    // A licence that no longer reads CC BY 4.0 is a failure too (governanceFiles throws), so the same path.
    // The World Bank answers: its files replace the old ones (writeGovernance empties governance/ first).
    const good = await governanceOrKept({ fresh: async () => [['governance/GOV_WGI_PV.json', '{"new":1}']], kept: readKept(OUT).governance });
    assert.equal(good.from, 'fresh');
    writeKept(OUT, { governance: good.files, asIs: [] }, writeGovernance);
    assert.deepEqual(readdirSync(join(OUT, 'governance')), ['GOV_WGI_PV.json']);
    assert.equal(readFileSync(join(OUT, 'governance/GOV_WGI_PV.json'), 'utf8'), '{"new":1}');
    // Nothing there before and nothing fetched: nothing is written, and the build goes on.
    const none = await governanceOrKept({ fresh: async () => [], kept: [], warn: () => {} });
    assert.deepEqual([none.from, none.files], ['none', []]);
  } finally { rmSync(OUT, { recursive: true, force: true }); }
});

test('carry: kept governance files follow a changed country list, each row moving with its code, a new country with no score', async () => {
  // The second readers (26 November 2026): when the World Bank's list of economies changes in a month whose governance
  // fetch fails, the kept files kept the old list, index.json had the new one, and the deploy's test of their order failed.
  const { governanceOrKept, realign } = await import('../national/scripts/carry.mjs');
  const old = { layer: 'wgi-range', indicator: 'GOV_WGI_CC.EST', countries: ['AAA', 'BBB', 'CCC'], years: [2024, 2025], values: [[[50, 45, 55], [51]], null, [[20, 15, 25], null]], outside: [], released: '2026-09-25' };
  const kept = [['governance/GOV_WGI_CC.json', JSON.stringify(old)]];
  const out = await governanceOrKept({ fresh: async () => { throw new Error('Failed'); }, kept, countries: ['CCC', 'AAA', 'NEW'], warn: () => {} });
  assert.equal(out.from, 'kept');
  const L = JSON.parse(out.files[0][1]);
  assert.deepEqual(L.countries, ['CCC', 'AAA', 'NEW']);
  assert.deepEqual(L.values, [[[20, 15, 25], null], [[50, 45, 55], [51]], null], 'CCC and AAA keep their own rows; NEW has none; BBB, gone from the list, is dropped');
  assert.deepEqual([L.years, L.released, L.indicator], [old.years, old.released, old.indicator], 'nothing else changes');
  // A file already in the order is left byte for byte; text that is not a layer is left as it is.
  assert.equal(realign(kept[0][1], ['AAA', 'BBB', 'CCC']), kept[0][1]);
  assert.equal(realign('{"old":1}', ['AAA']), '{"old":1}');
  assert.equal(realign('not json', ['AAA']), 'not json');
});

test('carry: the rebuilt national/data still holds the six governance files and the stand-in series', () => {
  for (const k of ['CC', 'GE', 'PV', 'RL', 'RQ', 'VA']) {
    const L = json(join(DATA, `governance/GOV_WGI_${k}.json`));
    assert.equal(L.source.licence, 'CC BY 4.0');
    assert.deepEqual(L.countries, index().countries.map(c => c.iso3), `GOV_WGI_${k}: index.json's countries, in its order`);
  }
  assert.ok(existsSync(join(DATA, 'standins.json')), 'standins.json');
  assert.equal(json(join(DATA, 'standins.json')).format, 'vm-standins/1');
});

// ---- overview (national/scripts/overview.mjs, leadership)
const L = (full, start, end) => ({ full, name: full, start, end, entry: 'Regular' });
const TODAY = '2026-11-26';

test('overview: votes still to come are not counted (the Retrospective lists the United States\' elections of 2028)', async () => {
  const { leadership } = await import('../national/scripts/overview.mjs');
  const rec = { leaders: [L('A', '2000-01-01', null)], events: [
    { type: 'election', date: '2024-11-05', text: '2024 United States presidential election' },
    { type: 'election', date: '2028-11-07', text: '2028 United States presidential election' },
    { type: 'referendum', date: '2026-11-29' }, { type: 'election', date: '2029-09' }, { type: 'leader', date: '2025-01-20' },
  ] };
  assert.equal(leadership([rec], null, TODAY).elections, 1, 'the vote of 2024 only');
  assert.equal(leadership([rec], null, '2028-11-07').elections, 3, 'on the day itself a vote counts, with the referendum of 29 November 2026');
});

test('overview: a country whose records hold no vote at all has no count (null, the page\'s "–"), not 0 (Japan)', async () => {
  const { leadership } = await import('../national/scripts/overview.mjs');
  // hp-retrospective's Japan record (15ea9af) holds leader and border events only: the old 6 were regional votes.
  const japan = { leaders: [L('A', '2020-09-16', '2021-10-04'), L('B', '2021-10-04', null)], events: [{ type: 'leader', date: '2021-10-04' }, { type: 'border', date: '1972-05-15' }] };
  assert.equal(leadership([japan], null, TODAY).elections, null);
  // Votes held, but all before 1926: the record covers votes, and none fall in the period, so 0 is a count.
  const before = { leaders: [L('A', '1920-01-01', null)], events: [{ type: 'election', date: '1924-05-01' }] };
  assert.equal(leadership([before], null, TODAY).elections, 0);
  // Only a vote still to come: the record covers votes, none held yet in the period.
  assert.equal(leadership([{ leaders: [L('A', '2020-01-01', null)], events: [{ type: 'election', date: '2028-01-01' }] }], null, TODAY).elections, 0);
});

test('overview: leaders tied for the longest time in office at the shown precision are not one "longest-serving" (Mexico)', async () => {
  const { leadership } = await import('../national/scripts/overview.mjs');
  // The Retrospective (Archigos) ends Luis Echeverría's term on 1 December 1976, his successor's first day, so he came
  // out 6.001 years against 5.996 to 5.999 for the others who served the six-year term.
  const mex = { events: [], leaders: [
    L('José López Portillo', '1976-12-01', '1982-12-01'), L('Luis Echeverría', '1970-12-01', '1976-12-01'),
    L('Miguel de la Madrid', '1982-12-01', '1988-11-30'), L('Claudia Sheinbaum', '2024-10-01', null),
  ] };
  const x = leadership([mex], null, TODAY);
  assert.equal(x.longest, null, 'no one named');
  assert.deepEqual(x.longestTied, { years: 6, count: 3 });
  // One clearly longest: named, as before, with no tie.
  const usa = { events: [], leaders: [L('Franklin D. Roosevelt', '1933-03-04', '1945-04-12'), L('Barack Obama', '2009-01-20', '2017-01-20'), L('Ronald Reagan', '1981-01-20', '1989-01-20')] };
  const y = leadership([usa], null, TODAY);
  assert.deepEqual(y.longest, { name: 'Franklin D. Roosevelt', years: 12.1, from: '1933', to: '1945' });
  assert.equal(y.longestTied, undefined);
  // A real lead of more than a week is named, even where both round to the same tenth (Japan: Abe 7.72 years, Satō 7.66).
  const jpn = { events: [], leaders: [L('Eisaku Satō', '1964-11-09', '1972-07-07'), L('Shinzo Abe', '2012-12-26', '2020-09-16')] };
  assert.deepEqual(leadership([jpn], null, TODAY).longest, { name: 'Shinzo Abe', years: 7.7, from: '2012', to: '2020' });
  // Swiss Presidents, a calendar year each (one in a leap year a day longer): tied.
  const che = { events: [], leaders: [L('A', '1928-01-01', '1928-12-31'), L('B', '1929-01-01', '1929-12-31')] };
  assert.deepEqual([leadership([che], null, TODAY).longest, leadership([che], null, TODAY).longestTied], [null, { years: 1, count: 2 }]);
  // An office held together for a fixed term keeps its longest, which the page gives as the term in words (San Marino).
  const smr = { events: [], leaders: [L('A', '1990-04-01', '1990-10-01'), L('B', '1990-04-01', '1990-10-01'), L('C', '1990-10-01', '1991-04-01'), L('D', '1990-10-01', '1991-04-01')] };
  const z = leadership([smr], null, TODAY, { years: 0.5, office: 'Q258045' });
  assert.ok(z.longest?.name && z.longest.years === 0.5 && z.together.term, JSON.stringify(z));
});

// ---- leaders (national/scripts/leaders.mjs, currentLeader)
test('leaders: the party comes from the Political Atlas where the Retrospective has none for the person (Finland\'s Prime Minister)', async () => {
  const { currentLeader } = await import('../national/scripts/leaders.mjs');
  const heads = { headOfState: { name: 'Alexander Stubb', qid: 'Q312855', start: '2024-03-01' }, headOfGovernment: { name: 'Petteri Orpo', qid: 'Q6029546', start: '2023-06-20' } };
  // political-atlas data/countries/europe-north.json (read 26 November 2026).
  const atlas = { executive: { leader: 'headOfGovernment', headOfGovernment: { name: 'Petteri Orpo', title: 'Prime Minister', party: 'National Coalition (KOK)', since: '2023-06-20' } } };
  const presidentsOnly = [{ name: 'Alexander Stubb', start: '2024-03-01', parties: [{ name: 'National Coalition Party' }] }];
  const fin = currentLeader({ office: 'headOfGovernment', rule: 'atlas' }, heads, { retro: presidentsOnly, atlas });
  assert.deepEqual([fin.name, fin.party, fin.partySource, fin.source], ['Petteri Orpo', 'National Coalition (KOK)', 'atlas', 'wikidata']);
  // The Retrospective's party wins where it has one for the person, and partySource is not set.
  const withPm = [{ name: 'Petteri Orpo', start: '2023-06-20', parties: [{ name: 'National Coalition Party' }] }];
  const r = currentLeader({ office: 'headOfGovernment', rule: 'atlas' }, heads, { retro: withPm, atlas });
  assert.deepEqual([r.party, r.partySource], ['National Coalition Party', undefined]);
  // The Atlas naming someone else for the office gives no party.
  const other = { executive: { headOfGovernment: { name: 'Sanna Marin', party: 'Social Democratic Party' } } };
  assert.equal(currentLeader({ office: 'headOfGovernment', rule: 'atlas' }, heads, { retro: presidentsOnly, atlas: other }).party, null);
  // No Atlas at all: as before.
  assert.equal(currentLeader({ office: 'headOfGovernment', rule: 'atlas' }, heads, { retro: presidentsOnly }).party, null);
  // build.mjs asks the Atlas only for a party the index had before for the same leader (a party lost, not one added).
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /if \(leader && !leader\.party && was\?\.party && was\.qid && was\.qid === leader\.qid\) leader = currentLeader\(choice, h, \{ retro: rc\?\.leaders, vacant, atlas: ar \}\);/);
});

test('capital: where Wikidata gives several, the one shown before while Wikidata still gives it, else the first by name', () => {
  // South Africa (three capitals), Sri Lanka and Palestine (two each) changed capital from run to run with the order of
  // the query's rows (26 November 2026).
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /const capitalOf = \(iso3, w\) => \{ const all = \[\.\.\.\(w\.capitals \|\| \[\]\)\]\.sort\(\(a, b\) => a\.localeCompare\(b, 'en'\)\), was = oldBy\.get\(iso3\)\?\.capital; return all\.includes\(was\) \? was : all\[0\] \|\| null; \};/);
  assert.doesNotMatch(src, /x\.capital \|\|= /, 'not the first row that comes');
});

// ---- government (national/scripts/build.mjs, the countries query)
test('government: forms of government whose Wikidata statement has ended are left out, and the four shown are in a fixed order', () => {
  const src = readFileSync(BUILD, 'utf8');
  assert.match(src, /OPTIONAL \{ \?c wdt:P122 \?gv\. \?c p:P122 \?gst\. \?gst ps:P122 \?gv\. FILTER NOT EXISTS \{ \?gst pq:P582 \?gend \}/, 'the statement, not ended');
  assert.match(src, /government: \[\.\.\.\(w\.gov \|\| \[\]\)\]\.sort\(\(a, b\) => a\.localeCompare\(b, 'en'\)\)\.slice\(0, 4\)/, 'sorted before four are kept');
  // On the rebuilt data: Mexico's "empire" (Q48349, its statements end in 1823 and 1867) is gone.
  for (const c of index().countries) assert.deepEqual(c.government, [...c.government].sort((a, b) => a.localeCompare(b, 'en')), c.iso3);
  // Mexico's statements as Wikidata gave them on 26 November 2026: held only for that build (refresh pins 2), since the
  // rule is the query's (the source checks above) and Wikidata's statements may change.
  if (!laterBuild()) { const mex = country('MEX').government; assert.ok(!mex.includes('empire'), mex.join(', ')); }
});

// ---- rebuild
test('rebuild: Ethiopia\'s war goes by the Realtime Battlefield\'s name, and the old one is gone from index.json and brief.json', () => {
  const name = json(join(ROOT, 'battlefield/data/realtime.json')).wars.find(w => w.id === 'ethiopia')?.name;
  assert.ok(name, 'the Realtime Battlefield has the war');
  assert.equal(country('ETH').conflict.active2026.find(w => w.id === 'ethiopia')?.name, name);
  for (const f of ['index.json', 'brief.json', 'index.head.json']) assert.ok(!readFileSync(join(DATA, f), 'utf8').includes('Amhara and Oromia insurgencies'), f);
});

test('rebuild: the wars fought on a country\'s territory follow the Retrospective Battlefield\'s places (Timor-Leste, Namibia)', async () => {
  // battlefield/history/data/wars.json (UCDP/PRIO, build 2 of 26 November 2026): East Timor's war (u330) is placed in
  // Timor-Leste (Q574), not Indonesia (Q252); Namibia's war of independence (u298) in today's Namibia (Q1030), not South
  // Africa (Q258). The counts are worked out again here from wars.json, so a new UCDP release moves both together.
  const { conflict, placeKeys } = await import('../national/scripts/overview.mjs');
  const wars = json(join(ROOT, 'battlefield/history/data/wars.json')).wars;
  const loc = id => wars.find(w => w.id === id)?.loc || [];
  assert.ok(loc('u330').includes('Q574') && !loc('u330').includes('Q252'), `u330: ${loc('u330')}`);
  assert.ok(loc('u298').includes('Q1030') && !loc('u298').includes('Q258'), `u298: ${loc('u298')}`);
  for (const iso3 of ['IDN', 'TLS', 'NAM', 'ZAF']) {
    const c = country(iso3);
    assert.equal(c.conflict.conflictYears, conflict(placeKeys(iso3, c.qid), wars).conflictYears, `${iso3}: as wars.json gives it`);
  }
  assert.ok(country('TLS').conflict.conflictYears > 0 && country('NAM').conflict.conflictYears > 0);
  // Western Sahara is not on the World Bank's list of economies, so National Analysis has no profile for it.
  assert.equal(country('ESH'), undefined);
});

test('rebuild: Serbia\'s head of state comes from Wikidata, with no correction, and is not "Vacant"', { skip: false }, t => {
  // Wikidata's item for Aleksandar Čupić (Q142195374) was typed as something other than a human by vandalism on
  // 24 November 2026, undone on 26 November at 12:27 UTC; the correction made while it stood is removed.
  // The correction table is VM's own and is checked whatever the day; Serbia's head is Wikidata's, so after a later
  // build (refresh pins 2) the rest says so by a skip: every head named without a Wikidata ID is then still held to the
  // table by national.test.mjs ("a head named without a Wikidata ID is one leader-corrections.json supplied").
  assert.ok(!json(join(ROOT, 'national/scripts/leader-corrections.json')).corrections.some(k => k.iso3 === 'SRB'), 'no SRB correction');
  const later = laterBuild();
  if (later) { t.skip(later); return; }
  const c = country('SRB');
  assert.ok(c.headOfState && /^Q[1-9]\d*$/.test(c.headOfStateQid || ''), `a head with a Wikidata ID: ${c.headOfState} ${c.headOfStateQid}`);
  assert.ok(!(c.vacant || []).includes('headOfState'));
  if (c.leader.office === 'headOfState') assert.equal(c.leader.source, 'wikidata');
  // As Wikidata gave it on 26 November 2026: P39 President of Serbia (Q889830) from 19 November 2026.
  assert.deepEqual([c.headOfState, c.headOfStateQid, c.leader.name, c.leader.since, c.leader.source], ['Aleksandar Čupić', 'Q142195374', 'Aleksandar Čupić', '2026-11-19', 'wikidata']);
});

test('rebuild: Japan has no count of elections where the Retrospective holds none of its votes, and Finland\'s Prime Minister has his party', () => {
  const jpn = country('JPN').leadership;
  assert.notEqual(jpn.elections, 0, 'Japan has held general elections throughout the period; 0 is false');
  const fin = country('FIN').leader;
  if (fin?.name === 'Petteri Orpo') {
    assert.ok(fin.party, 'the party, from the Political Atlas where the Retrospective has none');
    if (fin.partySource) assert.equal(fin.partySource, 'atlas');
  }
  // Mexico: the presidents who served the six-year term are tied, so no one is named as the longest-serving.
  const mex = country('MEX').leadership;
  assert.equal(mex.longest, null, JSON.stringify(mex.longest));
  assert.ok(mex.longestTied?.count >= 2 && mex.longestTied.years >= 6, JSON.stringify(mex.longestTied));
});

// ---- the page (q/national.html is not this part's file: the main session makes these two edits, and this test holds
// the push until it does)
test('page: an unknown count of elections shows "–" (not "null"), and a party from the Political Atlas names it', () => {
  const page = readFileSync(join(ROOT, 'q/national.html'), 'utf8');
  assert.ok(/stat\('Elections and referendums', L\.elections \?\? '–'/.test(page), 'q/national.html, the profile\'s "Elections and referendums" (line 945): L.elections ?? \'–\'');
  assert.ok(/partySource === 'atlas'/.test(page), 'q/national.html, the leader\'s source line (leaderSrc, line 486): "party: Political Atlas" where leader.partySource is \'atlas\'');
});
