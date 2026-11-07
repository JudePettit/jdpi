// National Analysis: map, country profile (overview + PESTLE), and side-by-side comparison.
// The data test reads the committed national/data (which national-refresh tests before committing); the page test
// runs against JDPI_URL (default live), and PRP_PAGES=0 leaves it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
// The World Bank has moved SM.POP.REFG.OR (refugees by country of origin) to its "WDI Database Archives", which the
// indicator API does not serve, so it has no values until national/scripts/indicators.mjs drops or replaces it.
const ARCHIVED = new Set(['SM.POP.REFG.OR']);

test('data: the brief Geopolitical Volatility reads is the index\'s, field for field, and stays small', async () => {
  const { brief } = await import('../national/scripts/brief.mjs');
  const committed = read('national/data/brief.json');
  assert.deepEqual(committed, brief(read('national/data/index.json')), 'rebuild it with: node national/scripts/brief.mjs');
  const ukr = committed.countries.find(c => c.iso3 === 'UKR');
  assert.ok(ukr.num && ukr.region && ukr.qid && typeof ukr.pv === 'number' && ukr.wars.some(w => w.deaths > 0), JSON.stringify(ukr));
  assert.ok(readFileSync(new URL('../national/data/brief.json', import.meta.url)).length < 80 * 1024, 'brief.json stays under 80 KB');
  assert.doesNotMatch(readFileSync(new URL('../q/volatility.html', import.meta.url), 'utf8'), /national\/data\/index\.json'/, 'Volatility reads the brief, not the index');
});

test('data: countries, their codes and leaders, every indicator, and a series file for each country', () => {
  const n = read('national/data/index.json'), has = f => n.countries.filter(f).length;
  // October 2026: 217 World Bank economies; 215 with an ISO numeric code (Kosovo and the Channel Islands have none)
  // and a Wikidata item; 182 with a Gleditsch–Ward code (from the Retrospective, or else the countrycode list); 76 with
  // leadership data from the Retrospective. Well below that is a source that failed.
  assert.ok(n.countries.length >= 200 && n.countries.every(c => /^[A-Z]{3}$/.test(c.iso3)), `${n.countries.length} countries`);
  assert.ok(has(c => c.num) >= 200 && has(c => /^Q\d+$/.test(c.qid)) >= 200, 'ISO numeric codes and Wikidata items');
  assert.ok(has(c => c.gw != null) >= 160, `${has(c => c.gw != null)} countries with a GW code`);
  assert.ok(has(c => c.leadership) >= 65, `${has(c => c.leadership)} countries with leadership data`);
  // Every indicator has values for at least 50 countries (central government debt, the sparsest, has 109).
  assert.ok(n.indicators.length >= 30, `${n.indicators.length} indicators`);
  for (const i of n.indicators) if (!ARCHIVED.has(i.code)) assert.ok(has(c => c.latest?.[i.code]) >= 50, `${i.code}: ${has(c => c.latest?.[i.code])} countries`);
  // The series behind each latest value.
  for (const c of n.countries) {
    const s = read(`national/data/series/${c.iso3}.json`);
    for (const code of Object.keys(c.latest)) assert.ok(s[code]?.length, `${c.iso3}: no ${code} series`);
  }
});

test('leaders: heads come from open statements, the latest start first, then a preferred one', async () => {
  const { pickHead, headsFromRows } = await import('../national/scripts/leaders.mjs');
  const st = (name, rank, start, end = null, more = {}) => ({ name, qid: null, rank, start, end, ...more });
  const T = '2026-11-06';
  // An ended statement is ignored, however recent or highly ranked.
  assert.equal(pickHead([st('Old', 'preferred', '2019-01-01', '2024-01-01'), st('New', 'normal', '2024-01-01')], T).name, 'New');
  assert.equal(pickHead([st('Gone', 'normal', '2020-01-01', '2025-07-17')], T), null, 'none open: no head');
  assert.equal(pickHead([st('Struck', 'deprecated', '2025-01-01')], T), null, 'a deprecated statement does not count');
  assert.equal(pickHead([], T), null);
  // The latest open statement wins, even over an older preferred one (a stale head left preferred); a preferred one
  // breaks a tie.
  assert.equal(pickHead([st('A', 'normal', '2010-01-01'), st('B', 'normal', '2021-03-22'), st('C', 'normal', null)], T).name, 'B');
  assert.equal(pickHead([st('Later', 'normal', '2026-01-01'), st('Stale', 'preferred', '2020-01-01')], T).name, 'Later');
  assert.equal(pickHead([st('Normal', 'normal', '2020-01-01'), st('Chosen', 'preferred', '2020-01-01')], T).name, 'Chosen');
  // The dead (Myanmar's Myint Swe), bodies such as a council (Haiti's, the Swiss Federal Council) and heads-to-be are
  // no heads.
  assert.equal(pickHead([st('Late', 'preferred', '2021-02-01', null, { dead: '2024-08-07' }), st('Next', 'normal', '2024-07-22')], T).name, 'Next');
  assert.equal(pickHead([st('Transitional Presidential Council', 'normal', '2024-04-25', null, { human: false })], T), null);
  assert.equal(pickHead([st('Elect', 'normal', '2027-01-20'), st('Now', 'normal', '2023-01-20')], T).name, 'Now');

  // From SPARQL rows, by item; a head with no label is no head.
  const row = (c, prop, h, hL, rank, start, x = {}) => ({
    c: { value: `http://www.wikidata.org/entity/${c}` }, prop: { value: prop }, h: { value: `http://www.wikidata.org/entity/${h}` },
    ...(hL ? { hL: { value: hL } } : {}), rank: { value: `http://wikiba.se/ontology#${rank}Rank` }, ...(start ? { start: { value: start + 'T00:00:00Z' } } : {}),
    ...(x.end ? { end: { value: x.end + 'T00:00:00Z' } } : {}), ...(x.repl ? { repl: { value: `http://www.wikidata.org/entity/${x.repl}` } } : {}),
    ...(x.dead ? { dead: { value: x.dead + 'T00:00:00Z' } } : {}), ...(x.human != null ? { human: { value: String(x.human) } } : {}),
  });
  const m = headsFromRows([row('Q1', 'hos', 'Q10', 'Ann Smith', 'Normal', '2020-01-01'), row('Q1', 'hog', 'Q11', 'Bo Lee', 'Preferred', '2021-05-02'), row('Q1', 'hog', 'Q12', 'Cy Doe', 'Normal', '2025-01-01'), row('Q2', 'hos', 'Q13', null, 'Normal', '2020-01-01')], [], T);
  assert.deepEqual(m.get('Q1'), { hos: { name: 'Ann Smith', qid: 'Q10', start: '2020-01-01' }, hog: { name: 'Cy Doe', qid: 'Q12', start: '2025-01-01' } });
  assert.deepEqual(m.get('Q2'), { hos: null, hog: null });

  // Ghana: the country's statement for the old head is open, but his own statement for the office ended and his
  // successor's began: the successor, from the office's statements (an undated holder is no candidate).
  const gha = headsFromRows([row('Q3', 'hog', 'Q30', 'Old President', 'Normal', '2017-01-07')],
    [row('Q3', 'hog', 'Q30', 'Old President', 'Normal', '2017-01-07', { end: '2025-01-07' }), row('Q3', 'hog', 'Q31', 'New President', 'Normal', '2025-01-07'), row('Q3', 'hog', 'Q32', 'Undated Holder', 'Normal', null)], T);
  assert.equal(gha.get('Q3').hog.name, 'New President');
  // Czechia: a returning head's earlier term ended before the country's statement for this term began: still the head.
  const cze = headsFromRows([row('Q4', 'hog', 'Q40', 'Returning PM', 'Normal', '2025-12-09')],
    [row('Q4', 'hog', 'Q40', 'Returning PM', 'Normal', '2017-12-06', { end: '2021-12-17' }), row('Q4', 'hog', 'Q41', 'Between PM', 'Normal', '2021-12-17', { end: '2025-12-09' })], T);
  assert.equal(cze.get('Q4').hog.name, 'Returning PM');
  // An end with no successor in the office's statements (an end date set by mistake) does not set the head aside.
  const lone = headsFromRows([row('Q5', 'hos', 'Q50', 'Sitting President', 'Preferred', '2022-05-15')], [row('Q5', 'hos', 'Q50', 'Sitting President', 'Normal', '2022-05-15', { end: '2024-05-15' })], T);
  assert.equal(lone.get('Q5').hos.name, 'Sitting President');
  // An open P39 statement of a past holder does not outrank the country's statement (Saint Vincent: the country names
  // the new PM without a date, and the old PM's statement for the office was never closed).
  const vct = headsFromRows([row('Q6', 'hog', 'Q60', 'New PM', 'Normal', null)], [row('Q6', 'hog', 'Q61', 'Old PM', 'Normal', '2001-03-28')], T);
  assert.equal(vct.get('Q6').hog.name, 'New PM');
  // "Replaced by" ends a statement only when the successor began later (Comoros names a predecessor there).
  const com = headsFromRows([row('Q7', 'hos', 'Q70', 'Re-elected', 'Normal', '2019-05-26', { repl: 'Q71' })], [row('Q7', 'hos', 'Q71', 'Interim', 'Normal', '2019-02-13', { end: '2019-04-03' })], T);
  assert.equal(com.get('Q7').hos.name, 'Re-elected');
  const irq = headsFromRows([row('Q8', 'hog', 'Q80', 'Old PM', 'Preferred', '2022-10-27')], [row('Q8', 'hog', 'Q80', 'Old PM', 'Normal', '2022-10-14', { repl: 'Q81' }), row('Q8', 'hog', 'Q81', 'New PM', 'Normal', '2026-04-27')], T);
  assert.equal(irq.get('Q8').hog.name, 'New PM');
  // A dead head and a council are passed over for the office's living holder.
  const mmr = headsFromRows([row('Q9', 'hos', 'Q90', 'Late President', 'Preferred', '2021-02-01', { dead: '2024-08-07' }), row('Q9', 'hos', 'Q92', 'A Council', 'Normal', '2024-04-25', { human: false })],
    [row('Q9', 'hos', 'Q91', 'Acting President', 'Normal', '2024-07-22')], T);
  assert.equal(mmr.get('Q9').hos.name, 'Acting President');
});

// The current leader is the holder of the office with the most power (Jude, 6 November 2026): the office Political
// Atlas names where it has the country, or else the one the system of government gives. Small fixtures, no network.
test('leaders: the office the Atlas names, else the one the system of government gives', async () => {
  const { leaderOffice, currentLeader, readAtlas } = await import('../national/scripts/leaders.mjs');
  const head = (name, qid, start = null) => ({ name, qid, start });
  const blr = { headOfState: head('Alexander Lukashenka', 'Q1', '1994-07-20'), headOfGovernment: head('Alexander Turchyn', 'Q2', '2025-03-10') };
  const prt = { headOfState: head('António José Seguro', 'Q3', '2026-03-09'), headOfGovernment: head('Luís Montenegro', 'Q4', '2024-04-02') };
  const atlas = leader => ({ executive: { leader } });
  // An Atlas record that says headOfState: the head of state, whatever the forms of government or a decision say.
  const a1 = leaderOffice({ atlas: atlas('headOfState'), government: ['parliamentary republic'], decision: { office: 'headOfGovernment' }, heads: blr });
  assert.deepEqual(a1, { office: 'headOfState', rule: 'atlas' });
  assert.equal(currentLeader(a1, blr).name, 'Alexander Lukashenka');
  // One that says headOfGovernment: the head of government, even where the Retrospective's open entry is the
  // President (Portugal, which showed President Seguro).
  const retroPrt = [{ name: 'Seguro', full: 'António José Seguro', start: '2026-03-09', parties: [{ name: 'Socialist Party' }] }];
  const a2 = leaderOffice({ atlas: atlas('headOfGovernment'), government: ['semi-presidential system'], heads: prt, retro: retroPrt });
  assert.deepEqual(a2, { office: 'headOfGovernment', rule: 'atlas' });
  assert.deepEqual(currentLeader(a2, prt, { retro: retroPrt }), { name: 'Luís Montenegro', qid: 'Q4', office: 'headOfGovernment', rule: 'atlas', since: '2024-04-02', party: null, url: 'https://www.wikidata.org/wiki/Q4', source: 'wikidata' });
  // The Retrospective's open entry for the chosen person gives the party and the article.
  const retroBlr = [{ name: 'Lukashenko', full: 'Alexander Lukashenko', start: '1994-07-20', url: 'https://en.wikipedia.org/wiki/Alexander_Lukashenko', parties: [{ name: 'Independent', e: null }] }];
  assert.deepEqual(currentLeader(a1, blr, { retro: retroBlr }), { name: 'Alexander Lukashenka', qid: 'Q1', office: 'headOfState', rule: 'atlas', since: '1994-07-20', party: 'Independent', url: 'https://en.wikipedia.org/wiki/Alexander_Lukashenko', source: 'wikidata' });

  // A country the Atlas lacks, under each system: presidential, a ruling monarchy, parliamentary.
  const two = { headOfState: head('A President', 'Q5'), headOfGovernment: head('A Premier', 'Q6') };
  assert.deepEqual(leaderOffice({ government: ['presidential system', 'republic'], heads: two }), { office: 'headOfState', rule: 'system' });
  assert.deepEqual(leaderOffice({ government: ['absolute monarchy'], heads: two }), { office: 'headOfState', rule: 'system' });
  assert.deepEqual(leaderOffice({ government: ['parliamentary republic'], heads: two }), { office: 'headOfGovernment', rule: 'system' });
  assert.deepEqual(leaderOffice({ government: ['constitutional monarchy'], heads: two }), { office: 'headOfGovernment', rule: 'system' });
  // Where the data cannot decide (forms of both kinds, or a bare "republic"), a decision (leader-offices.json) does.
  assert.equal(leaderOffice({ government: ['presidential system', 'parliamentary republic'], heads: two }).rule, 'undecided');
  assert.deepEqual(leaderOffice({ government: ['republic'], heads: two, decision: { office: 'headOfState' } }), { office: 'headOfState', rule: 'decision' });
  // Data that decides without a form: one person in both offices (Sierra Leone's President), one office for both (an
  // executive presidency), a head of state shared with other countries (a realm), the only office with a holder.
  assert.deepEqual(leaderOffice({ heads: { headOfState: head('Julius Maada Bio', 'Q7'), headOfGovernment: head('Julius Maada Bio', 'Q7') } }), { office: 'headOfState', rule: 'same-person' });
  assert.deepEqual(leaderOffice({ heads: two, sameOffice: true, government: ['parliamentary republic'] }), { office: 'headOfState', rule: 'same-office' });
  assert.deepEqual(leaderOffice({ heads: two, sharedHead: true }), { office: 'headOfGovernment', rule: 'shared-head-of-state' });
  assert.equal(leaderOffice({ heads: two, sharedHead: true, government: ['semi-presidential system'] }).rule, 'undecided', 'France shares Macron with Andorra');
  assert.deepEqual(leaderOffice({ heads: { headOfState: head('Only Head', 'Q8'), headOfGovernment: null } }), { office: 'headOfState', rule: 'only-holder' });
  // Undecided: the Retrospective's open entry where it is one of the heads, else the head of government.
  assert.deepEqual(leaderOffice({ heads: two, retro: [{ name: 'President', full: 'A President', start: '2020-01-01' }] }), { office: 'headOfState', rule: 'retrospective' });
  assert.deepEqual(leaderOffice({ heads: two, retro: [{ name: 'Gone', full: 'A President', start: '2010-01-01', end: '2015-01-01' }] }), { office: 'headOfGovernment', rule: 'undecided' });

  // An office with no holder is "Vacant", never a blank (Haiti's head of state); with no vacancy known, the other
  // office's holder (the name always comes from National Analysis's heads, never the Atlas); no heads, no leader.
  const hti = { headOfState: null, headOfGovernment: head('Alix Didier Fils-Aimé', 'Q9', '2024-11-11') };
  assert.deepEqual(currentLeader({ office: 'headOfState', rule: 'atlas' }, hti, { vacant: ['headOfState'] }), { name: 'Vacant', qid: null, office: 'headOfState', rule: 'atlas', since: null, party: null, url: null, source: 'vacant' });
  assert.deepEqual([currentLeader({ office: 'headOfState', rule: 'atlas' }, hti)].map(l => [l.name, l.office, l.rule]), [['Alix Didier Fils-Aimé', 'headOfGovernment', 'only-holder']]);
  assert.equal(currentLeader({ office: 'headOfGovernment', rule: 'system' }, {}), null);
  // A corrected name (leader-corrections.json) says so.
  assert.equal(currentLeader({ office: 'headOfGovernment', rule: 'system' }, { headOfGovernment: { name: 'Right Name', qid: null, start: null, corrected: true } }).source, 'correction');

  // The Atlas missing altogether: no records, and every country goes by the second rule.
  assert.equal(readAtlas('no-such-folder/political-atlas', p => JSON.parse(readFileSync(p, 'utf8'))), null);
  assert.deepEqual(leaderOffice({ atlas: null, government: ['presidential system'], heads: blr }), { office: 'headOfState', rule: 'system' });
  // An Atlas record without executive.leader falls through to the second rule.
  assert.equal(leaderOffice({ atlas: { executive: {} }, government: ['parliamentary republic'], heads: two }).rule, 'system');
});

test('leaders: names compare as one person across the Atlas and Wikidata, and disagreements are listed', async () => {
  const { samePerson, atlasDisagreement, headsFromRows } = await import('../national/scripts/leaders.mjs');
  assert.ok(samePerson('Alexander Lukashenko', 'Alexander Lukashenka'), 'one letter of transliteration');
  assert.ok(samePerson('Sergii Koretskyi', 'Serhii Koretskyi') && samePerson('Volodymyr Zelensky', 'Volodymyr Zelenskyy'));
  assert.ok(samePerson('Albert II', 'Albert II, Prince of Monaco') && samePerson('Hans-Adam II (Hereditary Prince Alois as regent)', 'Hans-Adam II, Prince of Liechtenstein'));
  assert.ok(samePerson('Charles III (represented by Governor General Mary Simon)', 'Charles III') && samePerson('Mohammed VI', 'Mohammed VI of Morocco'));
  assert.ok(samePerson('Daniel Ortega and Rosario Murillo', 'Daniel Ortega'), 'one of two co-presidents');
  assert.ok(samePerson('Lula', 'Luiz Inácio Lula da Silva') && samePerson('Laura Fernández', 'Laura Fernández Delgado') && samePerson('Mohammed bin Salman', 'Mohammed bin Salman Al Saud'));
  assert.ok(!samePerson('Mohammed bin Salman', 'Salman bin Abdulaziz Al Saud') && !samePerson('Charles III', 'Albert II') && !samePerson('Yulia Svyrydenko', 'Serhii Koretskyi'));
  const rec = { executive: { leader: 'headOfGovernment', headOfState: { name: 'Vacant' }, headOfGovernment: { name: 'Yulia Svyrydenko' } } };
  const heads = { headOfState: null, headOfGovernment: { name: 'Serhii Koretskyi', qid: 'Q1' } };
  assert.deepEqual(atlasDisagreement(rec, 'headOfGovernment', heads), { office: 'headOfGovernment', atlas: 'Yulia Svyrydenko', national: 'Serhii Koretskyi' });
  assert.equal(atlasDisagreement(rec, 'headOfState', heads), null, 'both say no one');
  assert.equal(atlasDisagreement({ executive: { headOfGovernment: { name: 'Sergii Koretskyi' } } }, 'headOfGovernment', heads), null, 'one person, two spellings');
  // Wikidata: statements for the office and none current is a vacancy; no statements at all is not.
  const row = (c, prop, h, hL, x = {}) => ({ c: { value: `http://www.wikidata.org/entity/${c}` }, prop: { value: prop }, h: { value: `http://www.wikidata.org/entity/${h}` }, hL: { value: hL },
    rank: { value: 'http://wikiba.se/ontology#NormalRank' }, start: { value: '2024-04-25T00:00:00Z' }, ...(x.end ? { end: { value: x.end + 'T00:00:00Z' } } : {}), ...(x.human != null ? { human: { value: String(x.human) } } : {}) });
  const m = headsFromRows([row('Q1', 'hos', 'Q10', 'Transitional Presidential Council', { human: false }), row('Q1', 'hog', 'Q11', 'Alix Didier Fils-Aimé')], [], '2026-11-06');
  assert.deepEqual(m.get('Q1'), { hos: null, hog: { name: 'Alix Didier Fils-Aimé', qid: 'Q11', start: '2024-04-25' }, vacant: ['hos'] });
  assert.deepEqual(headsFromRows([row('Q2', 'hog', 'Q12', 'A Premier')], [], '2026-11-06').get('Q2'), { hos: null, hog: { name: 'A Premier', qid: 'Q12', start: '2024-04-25' } });
});

test('leaders: only the IDs the Master Index has an entry for are tagged, each once', async () => {
  const { peopleInIndex } = await import('../national/scripts/leaders.mjs');
  const has = q => ['Q2866', 'Q11764394'].includes(q);
  // Belarus: the President is in the Master Index, the Prime Minister is not.
  assert.deepEqual(peopleInIndex({ headOfStateQid: 'Q2866', headOfGovernmentQid: 'Q56235580', leader: { qid: 'Q2866' } }, has), ['Q2866']);
  assert.deepEqual(peopleInIndex({ headOfStateQid: 'Q1', headOfGovernmentQid: 'Q11764394', leader: { qid: 'Q11764394' } }, has), ['Q11764394']);
  assert.deepEqual(peopleInIndex({ headOfStateQid: 'Q1058', headOfGovernmentQid: null, leader: { qid: 'Q1058' } }, has), [], 'no entry, no tag');
  assert.deepEqual(peopleInIndex({ headOfStateQid: 'x', leader: { name: 'Vacant', qid: null } }, () => true), []);
  // The page tags a name only where its ID is listed (q/national.html).
  assert.match(readFileSync(new URL('../q/national.html', import.meta.url), 'utf8'), /c\.peopleInIndex\?\.includes\(qid\)/);
});

test('leaders: the decisions are well formed, and the refresh passes the Atlas to the build', () => {
  const file = read('national/scripts/leader-offices.json');
  assert.ok(Array.isArray(file.decisions) && file.decisions.length < 60, 'a small file');
  const seen = new Set();
  for (const d of file.decisions) {
    assert.ok(/^[A-Z]{3}$/.test(d.iso3) && !seen.has(d.iso3) && ['headOfState', 'headOfGovernment'].includes(d.office) && d.reason?.length > 20 && /^https:\/\//.test(d.source) && /^\d{4}-\d\d-\d\d$/.test(d.checked), JSON.stringify(d));
    assert.ok(!('name' in d), `${d.iso3}: a decision names an office, not a person`);
    seen.add(d.iso3);
  }
  const yml = readFileSync(new URL('../.github/workflows/national-refresh.yml', import.meta.url), 'utf8');
  assert.match(yml, /repository: JudePettit\/political-atlas\s+path: political-atlas/);
  assert.match(yml, /node national\/scripts\/build\.mjs .*--atlas political-atlas/);
  // Without --atlas the build says that every leader goes by the system of government.
  assert.match(readFileSync(new URL('../national/scripts/build.mjs', import.meta.url), 'utf8'), /no --atlas <political-atlas folder>, so every current leader is chosen by the system of government/);
});

test('leaders: a correction applies while Wikidata gives the value it replaces, and lapses after', async () => {
  const { applyCorrections } = await import('../national/scripts/leaders.mjs');
  const k = { iso3: 'AAA', field: 'headOfGovernment', name: 'Right Name', source: 'https://example.org/', checked: '2026-11-06', replaces: 'Wrong Name' };
  const logs = [];
  const heads = new Map([['AAA', { headOfState: null, headOfGovernment: { name: 'Wrong Name', qid: 'Q9', start: '2026-07-16' } }]]);
  const r1 = applyCorrections(heads, [k], m => logs.push(m));
  assert.equal(r1.applied.length, 1); assert.equal(heads.get('AAA').headOfGovernment.name, 'Right Name');
  assert.equal(heads.get('AAA').headOfGovernment.start, null, 'a corrected name has no Wikidata start date');
  // Wikidata put right (or changed again): the correction no longer applies, and the build says so.
  const fixed = new Map([['AAA', { headOfState: null, headOfGovernment: { name: 'Newer Name', qid: 'Q8', start: '2026-10-01' } }]]);
  const r2 = applyCorrections(fixed, [k], m => logs.push(m));
  assert.equal(r2.lapsed.length, 1); assert.equal(fixed.get('AAA').headOfGovernment.name, 'Newer Name');
  assert.match(logs[0], /applied: AAA headOfGovernment/); assert.match(logs[1], /lapsed: AAA headOfGovernment/);
  // The committed file is well formed.
  const file = read('national/scripts/leader-corrections.json');
  assert.ok(Array.isArray(file.corrections));
  for (const c of file.corrections) assert.ok(/^[A-Z]{3}$/.test(c.iso3) && ['headOfState', 'headOfGovernment'].includes(c.field) && c.name && /^https?:\/\//.test(c.source) && /^\d{4}-\d\d-\d\d$/.test(c.checked) && 'replaces' in c, JSON.stringify(c));
});

test('data: every current leader is the holder of one office, by name from the heads, or "Vacant"', async () => {
  const n = read('national/data/index.json');
  const RULES = ['atlas', 'decision', 'same-person', 'same-office', 'system', 'shared-head-of-state', 'only-holder', 'retrospective', 'undecided'];
  for (const c of n.countries) {
    const l = c.leader;
    if (c.leadership) assert.deepEqual(c.leadership.current, l, `${c.iso3}: leadership.current is the leader`);
    if (!l) { assert.ok(!c.headOfState && !c.headOfGovernment, `${c.iso3}: heads but no leader`); continue; }
    assert.ok(['headOfState', 'headOfGovernment'].includes(l.office) && RULES.includes(l.rule), `${c.iso3}: ${JSON.stringify(l)}`);
    if (l.source === 'vacant') { assert.ok(l.name === 'Vacant' && c.vacant?.includes(l.office) && !c[l.office], `${c.iso3}: ${JSON.stringify(l)}`); continue; }
    assert.ok(['wikidata', 'correction'].includes(l.source), `${c.iso3}: source ${l.source}`);
    assert.equal(l.name, c[l.office], `${c.iso3}: the leader is the ${l.office}`);
    assert.equal(l.qid, c[l.office + 'Qid'], `${c.iso3}: the leader's Wikidata ID is the ${l.office}'s`);
    for (const o of ['headOfState', 'headOfGovernment']) assert.ok(c[o + 'Qid'] == null || /^Q[1-9]\d*$/.test(c[o + 'Qid']), `${c.iso3}: ${o}Qid`);
    for (const o of c.vacant || []) assert.ok(!c[o], `${c.iso3}: ${o} is vacant but named`);
  }
  const pol = n.countries.find(c => c.iso3 === 'POL');
  assert.notEqual(pol.leader?.name, 'Bronisław Komorowski', 'Poland\'s leader is not the one who left office in 2015');
  // Haiti had no head of state on 6 November 2026: a holder or "Vacant", never a blank. (No name or vacancy is fixed
  // here: national-refresh runs this test on new data before committing it, so a change of office holder must pass.)
  const hti = n.countries.find(c => c.iso3 === 'HTI');
  assert.ok(hti.headOfState || hti.vacant?.includes('headOfState'), 'Haiti: a head of state or "Vacant"');
  for (const iso of ['USA', 'MEX', 'XKX']) assert.ok(n.countries.find(c => c.iso3 === iso).headOfState, `${iso} has a head of state`);
  // No council or other body stands as a head, and no one the second reader found stale is shown as current.
  const by = Object.fromEntries(n.countries.map(c => [c.iso3, c]));
  for (const c of n.countries) for (const h of [c.headOfState, c.headOfGovernment]) assert.ok(!/\bcouncil\b/i.test(h || ''), `${c.iso3}: ${h}`);
  for (const [iso, gone] of [['GHA', 'Nana Akufo-Addo'], ['ZMB', 'Edgar Lungu'], ['MWI', 'Lazarus Chakwera'], ['COD', 'Ilunga Ilunkamba Sylvestre'], ['SDN', 'Abdalla Hamdok'], ['IRQ', "Muhammad Shia' al-Sudani"], ['MMR', 'Myint Swe']])
    assert.ok(![by[iso].headOfState, by[iso].headOfGovernment, by[iso].leader?.name].includes(gone), `${iso}: ${gone} is not current`);
});

// Jude's list (6 November 2026): the most powerful political figure, not the weaker office. Monaco and Liechtenstein go
// as Political Atlas says; where ../political-atlas is here, every Atlas country's leader holds the office it names.
// Only the office and the rule are fixed here, never a name: national-refresh runs this test on new data before
// committing it, so whoever holds the office next must pass. The name is that office's holder in the heads.
test('data: the current leader of the countries Jude named is the most powerful figure', async () => {
  const { readAtlas } = await import('../national/scripts/leaders.mjs');
  const by = Object.fromEntries(read('national/data/index.json').countries.map(c => [c.iso3, c]));
  const is = (iso, office, rule) => {
    const c = by[iso], l = c.leader;
    assert.equal(l?.office, office, `${iso}: ${JSON.stringify(l)}`);
    if (rule) assert.equal(l.rule, rule, `${iso}: decided by ${l.rule}`);
    if (l.source === 'vacant') assert.ok(c.vacant?.includes(office) && !c[office], `${iso}: "Vacant" only where the ${office} has no holder`);
    else assert.equal(l.name, c[office], `${iso}: the leader is the ${office}, by name`);
  };
  is('BLR', 'headOfState', 'atlas'); // the President, not the Prime Minister
  is('PRT', 'headOfGovernment', 'atlas'); // the Prime Minister, not the President
  is('GUY', 'headOfState', 'decision'); // the President, not the Prime Minister
  is('SLE', 'headOfState'); // the President, not the Chief Minister
  is('MCO', 'headOfState', 'atlas');
  is('LIE', 'headOfState', 'atlas');
  is('UKR', 'headOfState', 'atlas');
  is('GBR', 'headOfGovernment', 'atlas');
  const dir = new URL('../../political-atlas/', import.meta.url);
  const atlas = readAtlas(fileURLToPath(dir).replace(/[\\/]$/, ''), p => JSON.parse(readFileSync(p, 'utf8')));
  if (!atlas) return;
  // (Where National Analysis has no holder for that office, and it is not vacant, the other office's holder: San Marino.)
  // Where the Atlas names someone else for the office, the build lists it for a person to look at; it is no failure.
  // The office is checked, not the rule: a country the Atlas adds after the data was built keeps the rule that chose
  // its office then (a decision, say) until the next refresh, and is right as long as the office is the Atlas's.
  for (const [iso, r] of atlas) if (by[iso]?.leader && r.executive?.leader) {
    const l = by[iso].leader;
    assert.ok(l.rule === 'only-holder' ? !by[iso][r.executive.leader] : l.office === r.executive.leader, `${iso}: the Atlas names the ${r.executive.leader} (${JSON.stringify(l)})`);
  }
});

// Every name the page tags with data-qid gets a link to its Master Index entry (design/jdpi-entities.js), so the build
// lists in peopleInIndex only the heads' and leader's IDs that lake/data/index.json has; the rest stay untagged.
test('data: the people tagged for the Master Index are the heads and leader it has an entry for', () => {
  const n = read('national/data/index.json'), lake = new Set(read('lake/data/index.json').rows.map(r => r[0]));
  let tagged = 0;
  for (const c of n.countries) {
    const own = [c.headOfStateQid, c.headOfGovernmentQid, c.leader?.qid].filter(Boolean);
    if (!c.peopleInIndex) continue;
    assert.ok(Array.isArray(c.peopleInIndex) && c.peopleInIndex.length && new Set(c.peopleInIndex).size === c.peopleInIndex.length, `${c.iso3}: ${JSON.stringify(c.peopleInIndex)}`);
    for (const q of c.peopleInIndex) {
      assert.ok(own.includes(q), `${c.iso3}: ${q} is not one of its heads or its leader`);
      assert.ok(lake.has(q), `${c.iso3}: ${q} has no Master Index entry, so its link would open "No entry"`);
      tagged++;
    }
  }
  assert.ok(tagged > 50, `${tagged} people tagged`);
});

test('map, profile and comparison work', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/national`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr', { timeout: 20000 });
  const rows = await page.locator('#rows tr').count();
  const coloured = await page.locator('#map path[fill]:not([fill="#1b2833"])').count();
  await page.goto(`${BASE}/q/national#country=FRA`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dims .ind', { timeout: 20000 });
  const profile = await page.locator('#profile').innerText();
  await page.goto(`${BASE}/q/national#compare=FRA,DEU,GBR`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cmpsvg path[stroke-width="2"]', { timeout: 20000 });
  const cmpCols = await page.locator('#compare thead th').count();
  await browser.close();
  assert.ok(rows > 200, `rows: ${rows}`);
  assert.ok(coloured > 150, `coloured countries: ${coloured}`);
  assert.match(profile, /semi-presidential/i);
  assert.match(profile, /average time in office/i);
  assert.match(profile, /armed conflicts per year/i);
  assert.match(profile, /rule of law/i);
  assert.equal(cmpCols, 4);
  assert.deepEqual(errors, []);
});

test('page: the profile and the Compare table show the same current leader, tagged for the Master Index, and "Vacant"', pageTest, async () => {
  const n = read('national/data/index.json'), by = Object.fromEntries(n.countries.map(c => [c.iso3, c]));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Four countries (the Compare table's most): three of Jude's and one with a vacant head of state (Haiti on
  // 6 November 2026) where the data has one. Among them, a leader whose ID has no Master Index entry stays untagged.
  const tags = (c, q) => Boolean(q && c.peopleInIndex?.includes(q));
  const vacantIso = n.countries.find(c => c.vacant?.includes('headOfState'))?.iso3 || 'HTI';
  const isos = [...new Set(['BLR', 'PRT', 'GUY', vacantIso])], profile = {};
  const untagged = isos.find(iso => by[iso].leader?.qid && !tags(by[iso], by[iso].leader.qid));
  // The value in the profile's "Current leader" box and the names carrying a Wikidata ID there.
  const box = label => page.$$eval('#profile .stat', (ss, l) => { const s = ss.find(x => x.querySelector('span')?.textContent === l); const b = s?.querySelector('b'); return b ? { text: b.textContent.replace(/◈/g, '').trim(), qids: [...s.querySelectorAll('[data-qid]')].map(e => [e.dataset.qid, e.textContent]) } : null; }, label);
  for (const iso of isos) {
    await page.goto(`${BASE}/q/national#country=${iso}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#profile .stat', { timeout: 20000 });
    profile[iso] = { leader: await box('Current leader'), head: await box('Head of state') };
  }
  await page.goto(`${BASE}/q/national#compare=${isos.join(',')}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#compare [data-leader]', { timeout: 20000 });
  const cells = await page.$$eval('#compare [data-leader]', ts => Object.fromEntries(ts.map(t => [t.dataset.leader, { text: t.textContent.replace(/◈/g, '').trim(), qid: t.querySelector('[data-qid]')?.dataset.qid || null }])));
  const rowOf = label => page.$$eval('#compare tbody tr', (rs, l) => [...(rs.find(r => r.firstElementChild?.textContent === l)?.querySelectorAll('td') || [])].slice(1).map(td => ({ text: td.textContent.replace(/◈/g, '').trim(), qid: td.querySelector('[data-qid]')?.dataset.qid || null })), label);
  const hos = await rowOf('Head of state'), hog = await rowOf('Head of government');
  await browser.close();
  for (const [i, iso] of isos.entries()) {
    const c = by[iso];
    assert.equal(profile[iso].leader.text, c.leader.name, `${iso}: the profile shows the data's leader`);
    assert.equal(cells[iso].text, profile[iso].leader.text, `${iso}: the same person in the profile and the Compare table`);
    // Tagged (data-qid) exactly where the Master Index has the person, so no link opens "No entry".
    assert.deepEqual(profile[iso].leader.qids, tags(c, c.leader.qid) ? [[c.leader.qid, c.leader.name]] : [], `${iso}: the profile's leader tag`);
    assert.equal(cells[iso].qid, tags(c, c.leader.qid) ? c.leader.qid : null, `${iso}: the Compare table's leader tag`);
    assert.equal(hos[i].text, c.headOfState || (c.vacant?.includes('headOfState') ? 'Vacant' : '–'), `${iso}: head of state`);
    assert.equal(hos[i].qid, c.headOfState && tags(c, c.headOfStateQid) ? c.headOfStateQid : null, `${iso}: head of state's tag`);
    assert.equal(hog[i].text, c.headOfGovernment || (c.vacant?.includes('headOfGovernment') ? 'Vacant' : '–'), `${iso}: head of government`);
    assert.equal(hog[i].qid, c.headOfGovernment && tags(c, c.headOfGovernmentQid) ? c.headOfGovernmentQid : null, `${iso}: head of government's tag`);
  }
  if (vacantIso) assert.equal(profile[vacantIso].head.text.startsWith('Vacant'), true, `${vacantIso}: "Vacant", never a blank`);
  if (untagged) assert.deepEqual(profile[untagged].leader.qids, [], `${untagged}: a leader with no Master Index entry is not tagged`);
  for (const iso of isos) if (tags(by[iso], by[iso].headOfStateQid)) assert.ok(profile[iso].head.qids.some(([q]) => q === by[iso].headOfStateQid), `${iso}: the profile tags the head of state`);
  assert.ok(isos.some(iso => tags(by[iso], by[iso].leader?.qid)), 'at least one tagged leader is checked');
  assert.deepEqual(errors, []);
});

test('compare: countries are added and removed on the Compare page itself', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/national#compare`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#cmpadd', { timeout: 20000 });
  const names = () => page.locator('#compare thead th a.cname').allTextContents(); // as written: the heading shows them in capitals
  const count = n => page.waitForFunction(k => document.querySelectorAll('#compare thead th a.cname').length === k, n, { timeout: 10000 });
  const add = async text => { await page.fill('#cmpq', text); await page.press('#cmpq', 'Enter'); };
  // Nothing chosen yet: the box is there, with every country on offer.
  assert.deepEqual(await names(), []);
  assert.ok(await page.locator('#cmplist option').count() > 200, 'every country is offered');
  assert.equal(await page.textContent('#cmpmsg'), '0 of 4 chosen');
  // A name in full, in any case; then the start of a name that only one country has.
  await add('france'); await count(1);
  await add('Germ'); await count(2);
  assert.deepEqual(await names(), ['France', 'Germany']);
  assert.equal(await page.evaluate(() => location.hash), '#compare=FRA,DEU');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmpq', 'the box keeps the focus for the next country');
  assert.equal(await page.locator('#cmplist option[value="France"]').count(), 0, 'a chosen country is no longer offered');
  // What cannot be added says why, and changes nothing.
  await add('zzzz');
  assert.match(await page.textContent('#cmpmsg'), /^No country matches “zzzz”\.$/);
  await add('France');
  assert.equal(await page.textContent('#cmpmsg'), 'France is already in the comparison.');
  await add('Ko');
  assert.match(await page.textContent('#cmpmsg'), /^Several match: Korea, Rep\., .*Kosovo\. Type more of the name\.$/);
  assert.deepEqual(await names(), ['France', 'Germany']);
  // A name that is also the start of another (Niger, Nigeria) means the country of that name.
  await add('Niger'); await count(3);
  await add('Japan'); await count(4);
  assert.deepEqual(await names(), ['France', 'Germany', 'Niger', 'Japan']);
  // Four is the limit: the box is switched off until one is removed, here on the page.
  assert.equal(await page.isDisabled('#cmpq'), true);
  assert.equal(await page.getAttribute('#cmpq', 'placeholder'), 'Four chosen: remove one to add another');
  await page.click('#compare [data-rm="DEU"]'); await count(3);
  assert.equal(await page.isDisabled('#cmpq'), false);
  assert.equal(await page.textContent('#ccount'), '3');
  assert.equal(await page.evaluate(() => location.hash), '#compare=FRA,NER,JPN');
  // The ranking's ticks follow what was chosen here.
  await page.click('#tab-btn-map');
  await page.waitForSelector('#rows [data-cmp="NER"]');
  assert.deepEqual(await page.$$eval('#rows [data-cmp]:checked', bs => bs.map(b => b.dataset.cmp).sort()), ['FRA', 'JPN', 'NER']);
  await browser.close();
  assert.deepEqual(errors, []);
});
