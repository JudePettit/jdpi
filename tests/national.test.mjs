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
  for (const c of file.corrections) assert.ok(/^[A-Z]{3}$/.test(c.iso3) && ['headOfState', 'headOfGovernment', 'regent'].includes(c.field) && c.name && /^https?:\/\//.test(c.source) && /^\d{4}-\d\d-\d\d$/.test(c.checked) && 'replaces' in c, JSON.stringify(c));
  for (const c of file.corrections.filter(x => x.field === 'regent')) assert.ok(c.actsFor && c.replaces === null && /^\d{4}-\d\d-\d\d$/.test(c.since) && /^Q[1-9]\d*$/.test(c.qid), JSON.stringify(c));
});

// Liechtenstein (Jude, 12 November 2026): the current leader is Hereditary Prince Alois, who has exercised the
// prince's powers as his father's deputy since 15 August 2004; Prince Hans-Adam II stays head of state.
test('leaders: a regent is the current leader while Wikidata\'s head of state is the one he acts for, and lapses after', async () => {
  const { applyCorrections, currentLeader, leaderOffice } = await import('../national/scripts/leaders.mjs');
  const k = read('national/scripts/leader-corrections.json').corrections.find(c => c.iso3 === 'LIE');
  assert.deepEqual([k.field, k.name, k.qid, k.since, k.actsFor], ['regent', 'Hereditary Prince Alois', 'Q311308', '2004-08-15', 'Hans-Adam II, Prince of Liechtenstein']);
  assert.match(k.source, /^https:\/\/fuerstenhaus\.li\//, 'checked on the Princely House\'s own site');
  assert.match(k.note, /https:\/\/fuerstenhaus\.li\/en\/\?p=2018/, 'that Hans-Adam II still reigns is backed by his own page');
  const hos = { name: 'Hans-Adam II, Prince of Liechtenstein', qid: 'Q57454', start: '1989-11-13' }, hog = { name: 'Brigitte Haas', qid: 'Q129676165', start: '2025-04-10' };
  const logs = [], heads = new Map([['LIE', { headOfState: { ...hos }, headOfGovernment: { ...hog } }]]);
  assert.equal(applyCorrections(heads, [k], m => logs.push(m)).applied.length, 1);
  const h = heads.get('LIE');
  assert.deepEqual([h.headOfState.name, h.headOfGovernment.name], [hos.name, hog.name], 'neither head changes');
  // The Atlas names the regent; the office is the head of state's, and its powers are the regent's.
  const choice = leaderOffice({ atlas: { executive: { leader: 'regent' } }, government: ['constitutional monarchy'], heads: h });
  assert.deepEqual(choice, { office: 'headOfState', rule: 'atlas' });
  assert.deepEqual(currentLeader(choice, h), { name: 'Hereditary Prince Alois', qid: 'Q311308', office: 'regent', rule: 'atlas', since: '2004-08-15', party: null, url: 'https://www.wikidata.org/wiki/Q311308', source: 'correction' });
  // Where the head of government's office is chosen, a regent changes nothing.
  assert.equal(currentLeader({ office: 'headOfGovernment', rule: 'system' }, h).name, 'Brigitte Haas');
  // Once Wikidata gives another head of state (the regent has succeeded), the correction lapses and the head of state leads.
  const later = new Map([['LIE', { headOfState: { name: 'Alois, Hereditary Prince of Liechtenstein', qid: 'Q311308', start: '2030-01-01' }, headOfGovernment: { ...hog } }]]);
  assert.equal(applyCorrections(later, [k], m => logs.push(m)).lapsed.length, 1);
  assert.equal(later.get('LIE').regent, undefined);
  assert.equal(currentLeader(choice, later.get('LIE')).office, 'headOfState');
  assert.match(logs[0], /applied: LIE regent/); assert.match(logs[1], /lapsed: LIE regent/);
  // A regent without the head he acts for is incomplete, and skipped.
  assert.equal(applyCorrections(new Map([['LIE', { headOfState: { ...hos } }]]), [{ ...k, actsFor: '' }]).applied.length, 0);
});

test('data: every current leader is the holder of one office, by name from the heads, or "Vacant"', async () => {
  const n = read('national/data/index.json');
  const RULES = ['atlas', 'decision', 'same-person', 'same-office', 'system', 'shared-head-of-state', 'only-holder', 'retrospective', 'undecided'];
  for (const c of n.countries) {
    const l = c.leader;
    if (c.leadership) assert.deepEqual(c.leadership.current, l, `${c.iso3}: leadership.current is the leader`);
    if (!l) { assert.ok(!c.headOfState && !c.headOfGovernment, `${c.iso3}: heads but no leader`); continue; }
    assert.ok(['headOfState', 'headOfGovernment', 'regent'].includes(l.office) && RULES.includes(l.rule), `${c.iso3}: ${JSON.stringify(l)}`);
    if (l.source === 'vacant') { assert.ok(l.name === 'Vacant' && c.vacant?.includes(l.office) && !c[l.office], `${c.iso3}: ${JSON.stringify(l)}`); continue; }
    assert.ok(['wikidata', 'correction'].includes(l.source), `${c.iso3}: source ${l.source}`);
    // A regent (a 'regent' correction) leads for a head of state who stays named as head of state.
    if (c.regent) assert.ok(l.office === 'regent' || l.office === 'headOfGovernment', `${c.iso3}: with a regent, the head of state does not lead`);
    if (l.office === 'regent') assert.ok(c.regent && c.headOfState && l.source === 'correction', `${c.iso3}: a regent for a named head of state`);
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

// RT-04 (16 November 2026): the Political Retrospective had no leader list for Montenegro and ten microstates, so their
// leadership figures were empty (no leaders since 1926, no tenure). Its lists now run to the present, and each of these
// states has the figures. No count is fixed beyond a floor: national-refresh runs this test on new data, and a list
// that gains its next leader must pass.
test('data: Montenegro and the ten microstates have leadership figures from the Retrospective\'s lists (RT-04)', () => {
  const by = Object.fromEntries(read('national/data/index.json').countries.map(c => [c.iso3, c]));
  const STATES = { MNE: 341, DMA: 54, GRD: 55, LCA: 56, VCT: 57, ATG: 58, KNA: 60, MCO: 221, LIE: 223, AND: 232, SMR: 331 };
  for (const [iso, gw] of Object.entries(STATES)) {
    const c = by[iso], l = c?.leadership;
    assert.ok(c && c.gw === gw, `${iso}: in National Analysis with GW code ${gw}`);
    assert.ok(l, `${iso}: has leadership data`);
    assert.ok(l.leaders100 >= 2, `${iso}: ${l.leaders100} leaders since 1926`);
    assert.ok(l.avgTenure > 0 && l.medianTenure > 0, `${iso}: average ${l.avgTenure} and median ${l.medianTenure} years in office`);
    assert.ok(l.longest?.name && /^\d{4}$/.test(l.longest.from) && (l.longest.to === 'present' || l.longest.to >= l.longest.from) && l.longest.years > 0,
      `${iso}: the longest in office, ${JSON.stringify(l.longest)}`);
  }
  // San Marino's two Captains Regent change every six months, and the Retrospective lists each of them: two entries a
  // term, so some four hundred since 1926.
  assert.ok(by.SMR.leadership.leaders100 >= 300, `SMR: ${by.SMR.leadership.leaders100} entries since 1926`);
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
  // The President, not the Prime Minister: decided by leader-offices.json until the Atlas covered Guyana (November 2026),
  // by the Atlas since; the office is what is checked, whichever decides it.
  is('GUY', 'headOfState');
  assert.ok(['atlas', 'decision'].includes(by.GUY.leader.rule), `GUY: decided by ${by.GUY.leader.rule}`);
  is('SLE', 'headOfState'); // the President, not the Chief Minister
  is('MCO', 'headOfState', 'atlas');
  // Liechtenstein: the regent who exercises the head of state's powers (leader-corrections.json), or the head of state
  // himself once that correction lapses.
  is('LIE', by.LIE.regent ? 'regent' : 'headOfState', 'atlas');
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
    // An Atlas regent leads in the head of state's office: the regent where a correction names him, else the head of state.
    const offices = r.executive.leader === 'regent' ? ['regent', 'headOfState'] : [r.executive.leader];
    assert.ok(l.rule === 'only-holder' ? !by[iso][r.executive.leader] : offices.includes(l.office), `${iso}: the Atlas names the ${r.executive.leader} (${JSON.stringify(l)})`);
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

// Liechtenstein's regent (Jude, 12 November 2026): "Current leader" is the regent, noted as acting for the head of
// state, and "Head of state" is still the prince. Read from the data, so the test holds when the office changes hands.
test('page: Liechtenstein\'s current leader is the regent who acts for the head of state', pageTest, async () => {
  const lie = read('national/data/index.json').countries.find(c => c.iso3 === 'LIE');
  const browser = await launch();
  const errors = [];
  try {
    for (const width of [1400, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${BASE}/q/national#country=LIE`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#profile .stat', { timeout: 20000 });
      const stat = label => page.$$eval('#profile .stat', (ss, l) => { const s = ss.find(x => x.querySelector('span')?.textContent === l); return s ? { value: s.querySelector('b').textContent.replace(/◈/g, '').trim(), note: s.querySelector('small')?.textContent.trim() || '' } : null; }, label);
      const leader = await stat('Current leader'), head = await stat('Head of state');
      assert.equal(leader.value, lie.leader.name, `${width}: the data's leader`);
      assert.equal(head.value, lie.headOfState, `${width}: the head of state stays`);
      if (lie.leader.office === 'regent') {
        assert.notEqual(lie.leader.name, lie.headOfState);
        assert.match(leader.note, /^Regent for the head of state · since 2004/, `${width}: ${leader.note}`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`);
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(errors, []);
});

// 14 November 2026: a corrected head of state (San Marino's Captains Regent) was credited to Wikidata alone. The page
// knows a corrected head by its missing Wikidata ID; this holds the rule to the data: every head named without an ID is
// the name a correction in leader-corrections.json gives for that country and office.
test('data: a head named without a Wikidata ID is one leader-corrections.json supplied', () => {
  const fixes = read('national/scripts/leader-corrections.json').corrections;
  const countries = read('national/data/index.json').countries;
  let n = 0;
  for (const c of countries) for (const o of ['headOfState', 'headOfGovernment']) {
    if (!c[o] || c[o + 'Qid']) continue;
    n++;
    assert.ok(fixes.some(k => k.iso3 === c.iso3 && k.field === o && k.name === c[o]), `${c.iso3} ${o} "${c[o]}" has no Wikidata ID and no correction`);
  }
  assert.ok(n > 0, 'the committed data has corrected heads (San Marino among them)');
});

test('page: a corrected head of state\'s source names the correction; a head from Wikidata alone is credited to it', pageTest, async () => {
  const countries = read('national/data/index.json').countries;
  const fixed = countries.find(c => c.iso3 === 'SMR' && c.headOfState && !c.headOfStateQid) || countries.find(c => c.headOfState && !c.headOfStateQid);
  const plain = countries.find(c => c.iso3 === 'FRA');
  const browser = await launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    const src = async iso3 => {
      await page.goto(`${BASE}/q/national#country=${iso3}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(n => document.querySelector('#profile h2')?.textContent === n && [...document.querySelectorAll('#profile .stat span')].some(s => s.textContent === 'Head of state'), countries.find(c => c.iso3 === iso3).name, { timeout: 20000 });
      return page.$$eval('#profile .stat', ss => ss.find(x => x.querySelector('span')?.textContent === 'Head of state').querySelector('small.src').textContent);
    };
    if (fixed) assert.match(await src(fixed.iso3), /^VM’s correction of Wikidata/, `${fixed.iso3}: ${fixed.headOfState}`);
    const fra = await src(plain.iso3);
    assert.match(fra, /^Wikidata/);
    assert.doesNotMatch(fra, /correction/);
  } finally { await browser.close(); }
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

/* ---- its summary (integration/scripts/heads.mjs), written by the build with the store and committed with it; checked
   here too, so a refresh never commits one out of step. */
import { checkHeads as checkSummaries } from '../integration/scripts/heads.mjs';
test('index.head.json is in step with its store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('national/data/index.json'), [], 'run node integration/scripts/heads.mjs national/data/index.json');
});

// Each statistic's own age and source, beside it (13 November 2026; the second review: "Show a clear age indicator for
// each underlying statistic, rather than relying on the page update date"). The build records each source's own date
// in index.json's "sources"; the page puts a World Bank value's year beside it, and under every Overview figure its
// source with its date; the comparison's rows give each value's year and each group its source.
test('data: the index records each source\'s own date', () => {
  const n = read('national/data/index.json'), s = n.sources;
  assert.ok(s, 'index.json has "sources" (rebuild with node national/scripts/build.mjs)');
  assert.equal(s.wikidataRead, n.generated, 'Wikidata is read by the build');
  assert.match(s.atlasReviewed, /^\d{4}-\d{2}-\d{2}$/, 'the day Political Atlas last reviewed its records (its manifest\'s lastUpdated)');
  assert.match(s.retrospectiveBuilt, /^\d{4}-\d{2}-\d{2}/);
  assert.match(s.calendarBuilt, /^\d{4}-\d{2}-\d{2}T/);
  // National Analysis holds its own copy of these two, as they stood when it was built. The Battlefield store is
  // checked weekly and gains a month with each UCDP release, and Kardashev's gains a year, while National Analysis is
  // rebuilt monthly: its copy may be older than the store, never newer. (Held equal, the first Battlefield refresh
  // with a new release would have failed this test, and with it every deploy, until National Analysis was rebuilt.)
  const through = read('battlefield/data/realtime.json').latest, lastYear = read('kardashev/data/energy.json').steps.at(-1).year;
  assert.match(s.battlefieldThrough, /^\d{4}-\d{2}$/);
  assert.ok(s.battlefieldThrough <= through, `its Battlefield figures run to ${s.battlefieldThrough}, the store's to ${through}`);
  assert.deepEqual(s.conflictYears, [1946, 2025]);
  assert.ok(Number.isInteger(s.energyYear) && s.energyYear <= lastYear, `its energy share is of ${s.energyYear}, the store's last year is ${lastYear}`);
  assert.match(readFileSync(new URL('../national/scripts/build.mjs', import.meta.url), 'utf8'), /atlasReviewed: typeof atlasManifest\?\.lastUpdated === 'string'/);
});

test('page: each figure carries its own year or date and its source, in the profile, the comparison and the ranking', pageTest, async t => {
  const n = read('national/data/index.json'), s = n.sources, irl = n.countries.find(c => c.iso3 === 'IRL');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = v => { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00Z' : v); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const width of [1400, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/national#country=IRL`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#profile .stat', { timeout: 20000 });
    const stat = label => page.$$eval('#profile .stat', (ss, l) => { const x = ss.find(e => e.querySelector('span')?.textContent === l); return x ? { value: x.querySelector('b').textContent, src: x.querySelector('small.src')?.textContent || null } : null; }, label);
    const wikidata = `Wikidata, read ${date(s.wikidataRead)}`;
    assert.equal((await stat('Head of state')).src, wikidata);
    assert.equal((await stat('System of government')).src, wikidata);
    assert.equal((await stat('Current leader')).src, irl.leader.rule === 'atlas' ? `Office named by Political Atlas, reviewed ${date(s.atlasReviewed)}; holder from ${wikidata}` : wikidata);
    assert.equal((await stat('Leaders in the last 100 years')).src, `Political Retrospective (Archigos and Wikidata), built ${date(s.retrospectiveBuilt)}`);
    assert.equal((await stat('Armed conflicts per year')).src, 'UCDP/PRIO Armed Conflict Dataset, 1946–2025');
    assert.equal((await stat('Calendar events since 1980')).src, `Historical and Realtime Calendars, as built ${date(s.calendarBuilt)}`);
    const pop = await stat('Population');
    assert.ok(pop.value.endsWith(String(irl.latest['SP.POP.TOTL'][0])), `the population's own year: ${pop.value}`);
    assert.equal(pop.src, 'World Bank (WDI and WGI)');
    assert.match((await stat('PESTLE pressure')).src, /^World Bank \(WDI and WGI\), values of \d{4}(–\d{4})?$/);
    assert.equal(await page.locator('#profile .stat').count(), await page.locator('#profile .stat small.src').count(), 'every figure has its source');
    assert.match(await page.textContent('#meta'), /Rebuilt monthly.*Each figure's year or date, and its source, beside it/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // The comparison: an indicator's value with its year; each group with its source.
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/q/national#compare=IRL,GBR`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#compare .cmp tbody tr', { timeout: 20000 });
  const gdp = n.indicators.find(i => i.code === 'NY.GDP.PCAP.KD') || n.indicators[0];
  const cells = await page.$$eval('#compare .cmp tbody tr', (rs, l) => [...(rs.find(r => r.firstElementChild?.textContent.startsWith(l))?.querySelectorAll('td') || [])].slice(1).map(td => td.querySelector('small.yr')?.textContent || null), gdp.label);
  assert.deepEqual(cells, ['IRL', 'GBR'].map(iso => String(n.countries.find(c => c.iso3 === iso).latest[gdp.code]?.[0] ?? null)));
  const groups = await page.$$eval('#compare .cmp tr.grp .gsrc', gs => gs.map(g => g.textContent));
  assert.ok(groups.some(g => g.startsWith('Political Retrospective')) && groups.some(g => g.includes('Realtime Battlefield, figures to')) && groups.some(g => /^Wikidata, read/.test(g)), groups.join(' | '));
  // The ranking: an indicator's value with each country's year.
  await page.goto(`${BASE}/q/national#map`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#rows tr', { timeout: 20000 });
  await page.selectOption('#metric', 'i_' + gdp.code);
  assert.ok(await page.locator('#rows td.num small.yr').count() > 100, 'each value with its year');
  await page.close();
});

/* ---- NA-05 (Jude, 15 November 2026): the map moves through time on the shared slider, and the yearly figures are a
   layer the Omni-Map can read (national/lib/pestle.js, national/scripts/years.mjs, national/data/years/). The rule's
   expected scores and ordering are worked by hand here, on three made-up countries, with indicators.mjs' thresholds. */
const NA5 = {
  AAA: { 'GOV_WGI_PV.EST': [[2008, 0.5], [2010, 0.2]], 'NY.GDP.MKTP.KD.ZG': [[2009, 2], [2010, 4]], 'FP.CPI.TOTL.ZG': [[2009, 3], [2010, 6]], 'SP.DYN.LE00.IN': [[2009, 70], [2010, 70.1]] },
  BBB: { 'GOV_WGI_PV.EST': [[2008, 0.1], [2010, 0.3]], 'NY.GDP.MKTP.KD.ZG': [[2007, 1], [2008, 3]], 'SP.DYN.LE00.IN': [[2004, 60], [2010, 59]], 'SI.POV.GINI': [[2006, 40]] },
  CCC: { 'NY.GDP.MKTP.KD.ZG': [[2005, 1], [2007, 2]] },
};
test('NA-05 rule: a year is scored from its own values (or up to two years older), worked by hand', async () => {
  const { scoreYear, rank } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  const a = scoreYear(NA5.AAA, 2010, INDICATORS), b = scoreYear(NA5.BBB, 2010, INDICATORS), c = scoreYear(NA5.CCC, 2010, INDICATORS);
  // AAA: political stability 0.5 (2008) → 0.2 worsens; GDP growth 2 → 4 improves; inflation 3 → 6 worsens; life
  // expectancy 70 → 70.1 is within its 0.3 threshold, stable.
  assert.deepEqual(a.items['GOV_WGI_PV.EST'], [2010, 0.2, 2008, -0.3, 'worsening']);
  assert.equal(a.items['SP.DYN.LE00.IN'][4], 'stable');
  assert.deepEqual([a.overall, a.pressure.political, a.pressure.economic, a.pressure.social, a.coverage, a.dims], [0.5, 1, 0.5, 0, 0.182, 3]);
  // BBB: political stability 0.1 → 0.3 improves; GDP growth 1 (2007) → 3 (2008) is used, as 2008 is within two years of
  // 2010; life expectancy 60 (2004) → 59 is not scored, its earlier value being more than five years back (but it has a
  // value, so it counts for coverage); the Gini of 2006 is too old for 2010 and counts as no value.
  assert.deepEqual(b.items['NY.GDP.MKTP.KD.ZG'], [2008, 3, 2007, 2, 'improving']);
  assert.deepEqual(b.items['SP.DYN.LE00.IN'], [2010, 59, null, null, null]);
  assert.equal(b.items['SI.POV.GINI'], undefined, 'a value older than two years is missing, not carried forward');
  assert.deepEqual([b.overall, b.coverage, b.dims, b.pressure.social], [0, 0.136, 2, null]);
  // CCC: GDP growth only in 2005 and 2007, both too old for 2010: no score at all.
  assert.deepEqual([c.overall, c.coverage, c.dims], [null, 0, 0]);
  // The ranking: highest pressure first, no score last.
  const rows = [{ name: 'CCC', s: c }, { name: 'BBB', s: b }, { name: 'AAA', s: a }];
  assert.deepEqual(rank(rows, r => r.s.overall, -1).map(r => r.name), ['AAA', 'BBB', 'CCC']);
  assert.deepEqual(rank(rows, r => r.s.overall, 1).map(r => r.name), ['BBB', 'AAA', 'CCC'], 'no score stays last either way');
});

test('NA-05 rule: a period compares the first and last values inside it', async () => {
  const { scorePeriod, periodPick } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  // BBB 2004→2010: political stability improves, GDP growth improves, life expectancy 60 → 59 worsens (social 1 of 1);
  // the Gini has one value inside the period, so it counts for coverage but is not scored.
  const p = scorePeriod(NA5.BBB, periodPick(2004, 2010), INDICATORS);
  assert.deepEqual([p.overall, p.pressure.social, p.coverage, p.dims], [0.333, 1, 0.182, 3]);
});

test('NA-05 data: Latest and the decades are the shared rule\'s, number for number', async () => {
  const { scorePeriod, latestPick, yearPick, periodPick } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  const n = read('national/data/index.json'), [, LAST] = n.years;
  let decades = 0;
  for (const c of n.countries) {
    const s = read(`national/data/series/${c.iso3}.json`);
    for (const pick of [latestPick, yearPick(LAST, Infinity)]) {
      const x = scorePeriod(s, pick, INDICATORS);
      assert.deepEqual([x.items, x.pressure, x.overall, x.coverage], [c.latest, c.pressure, c.overall, c.coverage], `${c.iso3}: Latest`);
    }
    for (const d of Object.keys(c.decades)) {
      const x = scorePeriod(s, periodPick(+d, +d + 9), INDICATORS);
      assert.deepEqual({ pressure: x.pressure, overall: x.overall, coverage: x.coverage }, c.decades[d], `${c.iso3}: the ${d}s`);
      decades++;
    }
  }
  assert.equal(decades, n.countries.length * 5);
  assert.match(readFileSync(new URL('../national/scripts/build.mjs', import.meta.url), 'utf8'), /from '\.\.\/lib\/pestle\.js'/, 'the build scores with the shared rule');
});

const YEARS = 'national/data/years/';
test('NA-05 data: pressure.json is the shared rule recomputed from the series', async () => {
  const { scoreYear, pressureRow } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  const n = read('national/data/index.json'), p = read(YEARS + 'pressure.json');
  assert.deepEqual(p.countries, n.countries.map(c => c.iso3));
  assert.deepEqual([p.to, p.maxAge, p.fields.length], [n.years[1], 2, 9]);
  // From the first year held (its coverage), with the first score in firstScore (a change needs an earlier value).
  assert.ok(p.values.some(r => r?.[0] != null), 'time.from is the first year with a value');
  assert.ok(p.values.some(r => r?.[p.firstScore - p.from]?.[0] != null), 'firstScore is the first year with a score');
  assert.ok(p.values.every(r => !r || r.length === p.to - p.from + 1));
  for (const [k, c] of n.countries.entries()) {
    const s = read(`national/data/series/${c.iso3}.json`);
    const want = Array.from({ length: p.to - p.from + 1 }, (_, i) => pressureRow(scoreYear(s, p.from + i, INDICATORS)));
    assert.deepEqual(p.values[k] || want.map(() => null), want, c.iso3);
  }
  // Not a fixed country's score (a World Bank revision would turn the refresh red): from 1998, when the governance
  // indicators first give a change, most countries score all six dimensions (195 to 204 in 1998–2025, 16 Nov 2026).
  for (let y = 1998; y <= p.to; y++) assert.ok(p.values.filter(r => r?.[y - p.from]?.[8] === 6).length > 150, `${y}: six dimensions`);
});

test('NA-05 data: the manifest lists every indicator, each file matches it, and a missing year is null', async () => {
  const { createHash } = await import('node:crypto');
  const n = read('national/data/index.json'), m = read(YEARS + 'manifest.json');
  assert.deepEqual([m.key, m.missing, m.countries], ['iso3', null, n.countries.map(c => c.iso3)]);
  assert.deepEqual(m.layers.filter(l => l.id.startsWith('wb:')).map(l => l.id), n.indicators.map(i => 'wb:' + i.code), 'every indicator, in order');
  const series = new Map(n.countries.map(c => [c.iso3, read(`national/data/series/${c.iso3}.json`)]));
  for (const l of m.layers) {
    for (const k of ['id', 'module', 'title', 'geometry', 'measure', 'unit', 'status', 'method', ...(l.data ? ['open'] : [])]) assert.ok(typeof l[k] === 'string' && l[k], `${l.id}.${k}`);
    assert.ok(l.source?.licence && /^https:\/\//.test(l.source.url) && l.source.citation, `${l.id}: a source with a licence and an address`);
    assert.equal(l.pinnable, false); assert.ok(l.pinNote, `${l.id}: says why it cannot be pinned`);
    if (!l.data) { assert.ok(ARCHIVED.has(l.id.slice(3)) && l.note, `${l.id}: only an archived series has no file`); continue; }
    const text = readFileSync(new URL(`../${l.data}`, import.meta.url), 'utf8'), f = JSON.parse(text);
    assert.equal(createHash('sha256').update(text).digest('hex'), l.sha256, `${l.id}: sha256`);
    assert.deepEqual([f.from, f.to], [l.time.from, l.time.to], `${l.id}: years`);
    assert.equal(f.countries.length, m.countries.length);
    assert.ok(f.values.every(r => r === null || r.length === f.to - f.from + 1), `${l.id}: one row per country of to−from+1 values`);
    if (l.id === 'national-pestle') { assert.equal(l.omni, false); assert.match(l.omniNote, /composite/); continue; }
    const code = l.id.slice(3);
    // time.from is the first year with a value (USP 4.2), and every cell is the series' own value or null: a year the
    // World Bank has no value for is never filled from another.
    assert.ok(f.values.some(r => r?.[0] != null) && f.values.some(r => r?.[f.to - f.from] != null), `${code}: from and to are years with values`);
    for (const [k, iso] of m.countries.entries()) {
      const pts = new Map((series.get(iso)[code] || []).map(p => [p[0], p[1]]));
      const row = f.values[k];
      if (!pts.size) { assert.equal(row, null, `${code} ${iso}: no values, a null row`); continue; }
      for (let y = f.from; y <= f.to; y++) assert.equal(row[y - f.from], pts.has(y) ? pts.get(y) : null, `${code} ${iso} ${y}`);
    }
    assert.equal(l.by, code.startsWith('GOV_WGI_') ? 'scholarly-estimate' : 'official');
  }
});

test('NA-05 data: the layer files are small enough for a phone', async () => {
  const { gzipSync } = await import('node:zlib');
  const m = read(YEARS + 'manifest.json'), buf = p => readFileSync(new URL(`../${p}`, import.meta.url)), size = p => buf(p).length;
  // The files gain a column of years each January (about 3.5 KB for the largest, NY.GDP.MKTP.CD), so the caps are per
  // country-year, not fixed sizes that a refresh would outgrow in a few years and so drop the whole monthly commit; the
  // phone's budget is what is sent over the wire, gzipped. 16 Nov 2026: NY.GDP.MKTP.CD 15.3 bytes a country-year
  // (149 KB, 70 KB gzipped), pressure.json 30, the 22 core files 412 KB gzipped.
  const perCell = (p, f) => size(p) / (f.countries.length * (f.to - f.from + 1));
  let core = 0;
  for (const l of m.layers.filter(x => x.data && x.id.startsWith('wb:'))) {
    const f = read(l.data), gz = gzipSync(buf(l.data)).length;
    assert.ok(perCell(l.data, f) < 20, `${l.data}: ${perCell(l.data, f).toFixed(1)} bytes a country-year`);
    assert.ok(gz < 120 * 1024, `${l.data}: ${gz} bytes gzipped`);
    if (l.core) core += gz;
  }
  assert.ok(core < 600 * 1024, `a period of pressure loads the 22 core files: ${core} bytes gzipped`);
  const p = read(YEARS + 'pressure.json');
  assert.ok(perCell(YEARS + 'pressure.json', p) < 40, `pressure.json: ${perCell(YEARS + 'pressure.json', p).toFixed(1)} bytes a country-year`);
  assert.ok(size(YEARS + 'manifest.json') < 64 * 1024, `manifest.json: ${size(YEARS + 'manifest.json')} bytes`); // 49 KB, 7 KB gzipped (16 Nov 2026)
});

/* ---- NA-05 review (16 November 2026): a period's change is ranked only where its two ends can be compared, ties are
   settled by name rather than by floating-point noise, and a score below the floor is not coloured or ranked. Worked by
   hand on made-up rows. */
test('NA-05 movers: like for like only, ties by name, and the tie at the cut is counted', async () => {
  const { movers, changeOf, comparable, FLOOR, scoreYear } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  // As the page works them: from pressure.json's thousandths, 0.347 − 0.097 is 0.25 exactly, not 0.24999999999999997.
  assert.equal(changeOf(0.097, 0.347), 0.25); assert.equal(changeOf(0.042, 0.292), 0.25); assert.equal(changeOf(0.083, 0.333), 0.25);
  assert.equal(changeOf(0.4, 0.122), -0.278); assert.equal(changeOf(null, 0.5), null);
  const rows = [
    { name: 'Alpha', d: changeOf(0, 0.33), ok: false }, // a one-dimension start: changed most, but not like for like
    { name: 'Malta', d: changeOf(0.042, 0.292), ok: true }, { name: 'Bolivia', d: changeOf(0.083, 0.333), ok: true }, { name: 'Bahamas', d: changeOf(0.097, 0.347), ok: true },
    { name: 'Chad', d: changeOf(0.2, 0.3), ok: true }, { name: 'Fiji', d: changeOf(0.4, 0.122), ok: true }, { name: 'Comoros', d: changeOf(0.5, 0.222), ok: true },
    { name: 'Peru', d: changeOf(0.3, 0.25), ok: true }, { name: 'Zed', d: 0, ok: true }, { name: 'None', d: null, ok: true }, { name: 'Omega', d: changeOf(0.5, 0.1), ok: false },
  ];
  const m = movers(rows, 2);
  assert.deepEqual(m.rose.top.map(r => r.name), ['Bahamas', 'Bolivia'], 'the ties at +25 pts in name order; Alpha is not ranked');
  assert.deepEqual([m.rose.more, m.rose.at], [1, 0.25], 'one more (Malta) at the same change as the last shown');
  assert.deepEqual(m.fell.top.map(r => r.name), ['Comoros', 'Fiji']);
  assert.deepEqual([m.fell.more, m.apart], [0, 2], 'two changes are not like for like');
  assert.deepEqual(movers(rows.map(r => ({ ...r, d: null }))).rose.top, []);
  // Two ends can be compared when both score the same dimensions, at least FLOOR of them.
  assert.equal(FLOOR, 3);
  const a = scoreYear(NA5.AAA, 2010, INDICATORS), b = scoreYear(NA5.BBB, 2010, INDICATORS); // 3 and 2 dimensions
  assert.equal(comparable(a, a), true);
  assert.equal(comparable(a, b), false, 'different dimensions at each end');
  assert.equal(comparable(b, b), false, 'two dimensions are below the floor');
  assert.equal(comparable(a, { ...a, pressure: { ...a.pressure, social: null, legal: 0 } }), false, 'the same number, but not the same dimensions');
  assert.equal(comparable(null, a), false);
});

test('NA-05 layer contract: units for each field, statuses in the USP vocabulary, territory, citations and templates', () => {
  const m = read(YEARS + 'manifest.json'), p = read(YEARS + 'pressure.json'), n = read('national/data/index.json');
  // USP 5.3: status is Fact, Estimate or Disputed; origin is source or vm (what rec=1 hides).
  for (const l of m.layers) {
    assert.ok(['fact', 'estimate', 'disputed'].includes(l.status), `${l.id}: status ${l.status}`);
    assert.ok(['source', 'vm'].includes(l.origin), `${l.id}: origin ${l.origin}`);
    // USP 5.1's source shape: a short form and its terms ("host": VM may hold the values).
    for (const k of ['id', 'citation', 'short', 'licence', 'url', 'accessed', 'terms']) assert.ok(l.source[k], `${l.id}: source.${k}`);
    assert.ok(['host', 'cite-only'].includes(l.source.terms));
    // The page opens a frame ({at}) or a window ({from}, {to}); a layer with no values opens nothing.
    if (l.data) { assert.match(l.open, /\{at\}/); assert.match(l.openPeriod, /\{from\}.*\{to\}/); } else { assert.equal(l.open, null); assert.equal(l.openPeriod, null); }
  }
  assert.match(m.note, /\{at\}/); assert.match(m.note, /\{from\}/);
  const pestle = m.layers.find(l => l.id === 'national-pestle');
  assert.deepEqual([pestle.status, pestle.origin], ['estimate', 'vm']);
  assert.match(pestle.method, /composite/);
  // Each field its own unit and scale: dims is a count, not thousandths.
  assert.deepEqual(Object.keys(pestle.fieldUnits), p.fields);
  for (const f of p.fields) assert.ok(pestle.fieldUnits[f].unit && Number.isFinite(pestle.fieldUnits[f].scale), f);
  assert.equal(pestle.fieldUnits.dims.scale, 1); assert.equal(pestle.fieldUnits.coverage.scale, 1000);
  assert.deepEqual(p.scales, p.fields.map(f => pestle.fieldUnits[f].scale));
  // The floor below which the page neither colours nor ranks a score is stated where a reader of the layer finds it.
  assert.equal(pestle.floor?.dims, 3); assert.ok(pestle.floor.note);
  for (const l of m.layers.filter(x => x.id.startsWith('wb:'))) {
    // The World Bank's figures are for today's countries, earlier years reconstructed for the present territory.
    assert.equal(l.borderPrecision, 'present-day', l.id);
    assert.match(l.method, /present territory/, l.id);
    // A governance layer cites the series its values come from (source 3), not the archived WDI code.
    if (l.id.startsWith('wb:GOV_WGI_')) { assert.match(l.source.citation, /GOV_WGI_/); assert.match(l.source.url, /indicator\/GOV_WGI_[A-Z]{2}\.EST\?source=3/); }
  }
  // The key: World Bank codes, ISO 3166 alpha-3 save two, and where the numeric and Gleditsch–Ward codes are.
  assert.match(m.keyNote, /XKX/); assert.match(m.keyNote, /CHI/); assert.match(m.keyNote, /index\.json/);
  // 1980 has no score (a change needs an earlier value) but has a coverage, which the layer carries.
  assert.equal(p.from, n.years[0]); assert.equal(pestle.time.from, p.from);
  assert.ok(p.firstScore > p.from && p.values.some(r => r?.[p.firstScore - p.from]?.[0] != null), 'firstScore is the first year with a score');
  assert.ok(p.values.every(r => !r || r.slice(0, p.firstScore - p.from).every(x => !x || x[0] == null)), 'no score before firstScore');
  const us = p.values[p.countries.indexOf('USA')][0];
  assert.ok(us && us[0] == null && us[7] > 0 && us[8] === 0, `USA 1980: no score, a coverage (${JSON.stringify(us)})`);
});

// The page on the slider (NA-05). Every expected figure is read from the committed data and worked out with the shared
// rule here, never fixed, so a monthly refresh passes as long as the page shows what the data says.
test('page NA-05: the slider replaces the decades, Latest stays the opening view, and years, periods and old addresses open as the data says', pageTest, async t => {
  const PL = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  const n = read('national/data/index.json'), by = Object.fromEntries(n.countries.map(c => [c.iso3, c])), LAST = n.years[1];
  const P = read(YEARS + 'pressure.json'), cellAt = (iso, y) => PL.pressureOf(P.values[P.countries.indexOf(iso)]?.[y - P.from]);
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const open = async hash => {
    await page.goto(`${BASE}/q/national${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#rows tr', { state: 'attached', timeout: 20000 });
    // (A new hash on the same page is a hashchange, not a load: wait for the view it names to be drawn.)
    await page.waitForFunction(() => window.__naDrawn && window.__naDrawn.view === document.querySelector('#yrlabel').textContent, null, { timeout: 20000 });
  };
  const row = async iso => page.$$eval(`#rows tr[data-iso="${iso}"] td`, tds => tds.map(td => td.textContent.trim()));
  const head = () => page.$$eval('#thead th', ths => ths.map(th => th.textContent.trim()));

  // 8 and 9. A bare address: no decade select, the slider at Latest, and Latest's numbers (index.json) on the map, in
  // the first ten rows of the ranking and in France's profile.
  await open('#map');
  assert.equal(await page.locator('#period').count(), 0, 'the decade select is gone');
  assert.equal(await page.textContent('#yrlabel'), 'Latest');
  assert.equal(await page.getAttribute('#yr', 'aria-valuetext'), 'Latest');
  assert.equal(await page.evaluate(() => location.hash), '#map', 'Latest writes no year');
  assert.equal(await page.getAttribute('#map path.land[data-iso="FRA"]', 'data-v'), String(by.FRA.overall));
  const top = PL.rank(n.countries, c => c.overall, -1).slice(0, 10);
  const shown = await page.$$eval('#rows tr', rs => rs.slice(0, 10).map(r => [r.dataset.iso, r.children[4].textContent.trim()]));
  assert.deepEqual(shown.map(r => r[0]), top.map(c => c.iso3), 'the ranking\'s order');
  for (const [k, c] of top.entries()) assert.ok(shown[k][1].startsWith(pct(c.overall)), `${c.iso3}: ${shown[k][1]}`);
  const pestleStat = () => page.$$eval('#profile .stat', ss => { const s = ss.find(x => x.querySelector('span')?.textContent === 'PESTLE pressure'); return s ? [s.querySelector('b').textContent, s.querySelector('small')?.textContent] : null; });
  await page.goto(`${BASE}/q/national#country=FRA`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#profile .stat', { timeout: 20000 });
  assert.equal((await pestleStat())[0], pct(by.FRA.overall));
  assert.equal(await page.evaluate(() => location.hash), '#country=FRA', '#country= opens unchanged');

  // 17 and 10. The keys on the end handle (the native ones): ArrowLeft steps a year back from Latest, Home goes to the
  // first year; the address and aria-valuetext follow. Back to 2010, France reads its 2010 score from pressure.json in
  // the tooltip, the ranking and the profile.
  await open('#map');
  await page.focus('#yr');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(y => document.querySelector('#yrlabel').textContent === String(y), LAST);
  assert.equal(await page.getAttribute('#yr', 'aria-valuetext'), String(LAST));
  assert.equal(await page.evaluate(() => location.hash), `#map&year=${LAST}`);
  await page.keyboard.press('Home');
  await page.waitForFunction(y => document.querySelector('#yrlabel').textContent === y, String(n.years[0]));
  assert.equal(await page.evaluate(() => location.hash), `#map&year=${n.years[0]}`);
  for (let y = n.years[0]; y < 2010; y++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__naDrawn?.view === '2010');
  const fra10 = cellAt('FRA', 2010);
  assert.ok((await row('FRA'))[4].startsWith(pct(fra10.overall)), 'the ranking');
  // (France's shape takes in French Guiana, so the middle of its box is at sea: the pointer event is sent to it.)
  await page.locator('#map path.land[data-iso="FRA"]').dispatchEvent('mousemove', { clientX: 600, clientY: 500 });
  await page.waitForSelector('#tip:not([hidden])');
  assert.match(await page.textContent('#tip'), new RegExp(`France.*Overall PESTLE pressure, 2010: ${pct(fra10.overall)}`, 's'));
  await page.click('#rows tr[data-iso="FRA"] a.cname');
  await page.waitForFunction(() => document.querySelector('#profile h2')?.textContent === 'France');
  await page.waitForFunction(() => [...document.querySelectorAll('#profile .stat')].some(s => s.querySelector('span')?.textContent === 'PESTLE pressure' && /^2010/.test(s.querySelector('small')?.textContent || '')));
  const [v10, note10] = await pestleStat();
  assert.equal(v10, pct(fra10.overall)); assert.match(note10, new RegExp(`^2010 · coverage ${pct(fra10.coverage)} · values of \\d{4}(–\\d{4})?${fra10.dims < 6 ? ' · partial' : '$'}`));
  assert.equal(await page.evaluate(() => location.hash), '#country=FRA&year=2010');

  // 11. An indicator by year: life expectancy at 2010 shows Japan's 2010 value from the layer.
  const le = read(YEARS + 'wb/SP.DYN.LE00.IN.json'), jpn = le.values[le.countries.indexOf('JPN')][2010 - le.from];
  await open('#map&year=2010&measure=wb:SP.DYN.LE00.IN');
  assert.equal(await page.inputValue('#metric'), 'i_SP.DYN.LE00.IN');
  assert.equal(await page.getAttribute('#map path.land[data-iso="JPN"]', 'data-v'), String(jpn));
  assert.ok((await row('JPN'))[3].startsWith(jpn.toFixed(1) + ' 2010'), (await row('JPN'))[3]);

  // 12. A period, 2000 to 2010: Start, End, Change and the period's pressure, with Rose most and Fell most; France's
  // period pressure is scorePeriod's.
  await open('#map&year=2010&from=2000');
  assert.equal(await page.textContent('#yrlabel'), '2000–2010');
  assert.deepEqual((await head()).slice(3), ['Overall PESTLE pressure, 2000', '2010', 'Change↓', 'Over 2000–2010']);
  assert.equal(await page.locator('#movers li a.cname').count(), 12, 'six each way (a tie at the sixth adds a line "and N more")');
  const sFra = read('national/data/series/FRA.json'), pFra = PL.scorePeriod(sFra, PL.periodPick(2000, 2010), INDICATORS);
  const r12 = await row('FRA');
  assert.equal(r12[3], pct(cellAt('FRA', 2000).overall)); assert.equal(r12[4], pct(fra10.overall));
  assert.ok(r12[6].startsWith(pct(pFra.overall)), r12[6]);

  // 14. An old address naming a decade opens it as a period, with the decade's figures, and is rewritten.
  await open('#period=1990');
  assert.equal(await page.evaluate(() => location.hash), '#map&year=1999&from=1990');
  assert.ok((await row('FRA'))[6].startsWith(pct(by.FRA.decades[1990].overall)));

  // 15. 1985: every score is partial (no governance indicators yet), so every country coloured by one is marked partial
  // (the stipple; a score below the floor is not coloured at all); a country with no Gini value within two years of
  // 1985 reads "No value for 1985".
  await open('#map&year=1985');
  const [land, hatched] = await page.evaluate(() => [document.querySelectorAll('#map path.land[data-v]').length, [...document.querySelectorAll('#map .stipple path')].filter(p => !p.hasAttribute('display')).length]);
  assert.ok(land > 150 && hatched === land, `${hatched} of ${land} hatched`);
  assert.ok(P.values.every(r => !r || !r[1985 - P.from] || r[1985 - P.from][8] < 6));
  const gini = read(YEARS + 'wb/SI.POV.GINI.json');
  const none = ['RUS', 'CAN', 'AUS', 'CHN', 'DZA', 'SAU', 'KAZ', 'MNG'].find(iso => { const r = gini.values[gini.countries.indexOf(iso)]; return !r || [1983, 1984, 1985].every(y => y < gini.from || r[y - gini.from] == null); });
  await page.selectOption('#metric', 'i_SI.POV.GINI');
  await page.waitForFunction(() => /Gini/.test(document.querySelector('#maptitle').textContent) && window.__naDrawn);
  assert.match((await row(none)).join(' '), /no value/);
  await page.locator(`#map path.land[data-iso="${none}"]`).dispatchEvent('mousemove', { clientX: 600, clientY: 500 });
  await page.waitForSelector('#tip:not([hidden])');
  assert.match(await page.textContent('#tip'), new RegExp(`No value for 1985`), `${none}'s tooltip`);

  // 13. Play from 2020 runs to Latest and stops there.
  await open('#map&year=2020');
  await page.click('#yr-play');
  await page.waitForFunction(() => document.querySelector('#yrlabel').textContent === 'Latest' && document.querySelector('#yr-play').getAttribute('aria-label') !== 'Pause', null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => location.hash), '#map');

  // A real pointer: the start handle dragged back from Latest opens a period ending at Latest.
  const track = await page.locator('#years .prp-period-track').boundingBox();
  await page.mouse.move(track.x + track.width - 1, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => /^\d{4}–Latest$/.test(document.querySelector('#yrlabel').textContent));
  assert.match(await page.evaluate(() => location.hash), /^#map&from=\d{4}$/);

  // 18. A comparison opens as before, and follows the slider. (Opened afresh: a hash moved in place keeps the period
  // the reader had, as the old page kept its decade; the review test checks that.)
  await page.goto('about:blank');
  await page.goto(`${BASE}/q/national#compare=USA,CHN,RUS,IND`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#compare .cmp tbody tr', { timeout: 20000 });
  assert.equal(await page.locator('#compare thead th').count(), 5);
  assert.equal(await page.evaluate(() => location.hash), '#compare=USA,CHN,RUS,IND');

  // 16. A phone: the slider shows, and nothing scrolls sideways, at a year and over a period.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('pageerror', e => errors.push(e.message));
  for (const h of ['#map', '#map&year=2010&from=2000']) {
    await phone.goto(`${BASE}/q/national${h}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await phone.waitForFunction(() => window.__naDrawn, null, { timeout: 20000 });
    assert.ok(await phone.isVisible('#years .prp-period-track'), `${h}: the slider is visible`);
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${h}: no sideways scroll`);
  }
  assert.deepEqual(errors, []);
});

// The NA-05 review (16 Nov 2026): what the reader sees of the years is honest and the slider behaves as Volatility's.
// Each figure is again worked out here from the committed data with the shared rule.
test('page NA-05 review: years shown honestly, movers like for like, failures said, and the slider laid out as Volatility\'s', pageTest, async t => {
  const PL = await import('../national/lib/pestle.js');
  const n = read('national/data/index.json'), by = Object.fromEntries(n.countries.map(c => [c.iso3, c])), LAST = n.years[1];
  const P = read(YEARS + 'pressure.json'), cellAt = (iso, y) => PL.pressureOf(P.values[P.countries.indexOf(iso)]?.[y - P.from]);
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const drawn = () => page.waitForFunction(() => window.__naDrawn && window.__naDrawn.view === document.querySelector('#yrlabel').textContent, null, { timeout: 20000 });
  // (Each address opened afresh, as a reader's link is: a hash moved in place keeps the years shown.)
  const open = async hash => { await page.goto('about:blank'); await page.goto(`${BASE}/q/national${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForSelector('#rows tr', { state: 'attached', timeout: 20000 }); await drawn(); };
  const tip = async iso => { await page.locator(`#map path.land[data-iso="${iso}"]`).dispatchEvent('mousemove', { clientX: 600, clientY: 500 }); await page.waitForSelector('#tip:not([hidden])'); return page.textContent('#tip'); };
  const movers = () => page.$$eval('#rose li, #fell li', ls => ls.map(l => ({ list: l.parentElement.id, iso: l.querySelector('a')?.getAttribute('href')?.split('=')[1] || null, text: l.textContent.trim() })));

  // R1. No value is Volatility's hatched no-data pattern; a partial score or an earlier year's value is a stipple of its
  // own, named in the legend, and the caption uses the legend's words.
  // (A large country, so its shape is on the 110m map.)
  const gini = read(YEARS + 'wb/SI.POV.GINI.json');
  const none15 = ['IND', 'DZA', 'LBY', 'SAU', 'COD', 'AFG', 'NGA', 'VEN'].find(iso => !PL.yearPick(2015)(PL.ptsOf(gini, gini.countries.indexOf(iso)))[1]);
  await open('#map&measure=wb:SI.POV.GINI&year=2015');
  assert.equal(await page.getAttribute(`#map path.land[data-iso="${none15}"]`, 'fill'), 'url(#nodata)', `${none15}: no Gini value within two years of 2015`);
  assert.equal(await page.locator('#map pattern#nodata').count(), 1);
  assert.ok(await page.locator('#map .stipple').count() === 1 && await page.locator('#map .hatch').count() === 0, 'the partial mark is not a hatch');
  assert.match(await page.textContent('#legend'), /No value for 2015/);
  assert.match(await page.textContent('#mapcap'), /No value for 2015/);
  assert.doesNotMatch(await page.textContent('#mapcap'), /No data” colour/);

  // F1. A period of an indicator: each end with its own year, in the tooltip and in Rose most / Fell most (China's
  // 2000 value is of 1999).
  await open('#map&year=2010&from=2000&measure=wb:SI.POV.GINI');
  const chn = PL.ptsOf(gini, gini.countries.indexOf('CHN')), [, ca] = PL.yearPick(2000)(chn), [, cb] = PL.yearPick(2010)(chn);
  const tChn = await tip('CHN');
  assert.ok(tChn.includes(`${ca[0]}: ${ca[1].toFixed(1)}`) && tChn.includes(`${cb[0]}: ${cb[1].toFixed(1)}`), tChn);
  if (ca[0] !== 2000) assert.ok(!tChn.includes(`2000: ${ca[1].toFixed(1)}`), `a ${ca[0]} value is not shown as 2000's: ${tChn}`);
  for (const mv of await movers()) assert.match(mv.text, /\d{4}: .* → \d{4}: /, mv.text);

  // F2, F4, F6. A period of pressure: only like-for-like ends are ranked (the same dimensions, at least FLOOR, at both
  // ends), in order of change with ties by name; a partial end is tagged in the table.
  await open('#map&year=2013&from=1981');
  const ms = await movers();
  for (const mv of ms.filter(x => x.iso)) {
    const a = cellAt(mv.iso, 1981), b = cellAt(mv.iso, 2013);
    assert.ok(PL.comparable(a, b), `${mv.iso}: ${a?.dims} dimensions in 1981, ${b?.dims} in 2013, listed`);
  }
  const want = PL.movers(n.countries.map(c => ({ name: c.name, iso: c.iso3, d: PL.changeOf(cellAt(c.iso3, 1981)?.overall, cellAt(c.iso3, 2013)?.overall), ok: PL.comparable(cellAt(c.iso3, 1981), cellAt(c.iso3, 2013)) })));
  assert.deepEqual(ms.filter(x => x.list === 'rose' && x.iso).map(x => x.iso), want.rose.top.map(r => r.iso), 'Rose most');
  assert.deepEqual(ms.filter(x => x.list === 'fell' && x.iso).map(x => x.iso), want.fell.top.map(r => r.iso), 'Fell most');
  if (want.apart) assert.match(await page.textContent('#movers'), new RegExp(`${want.apart} (more )?change`), 'the changes left out are counted');
  const ssd = await page.$$eval('#rows tr[data-iso="SSD"] td', tds => tds.map(td => td.textContent.trim()));
  if (cellAt('SSD', 1981)?.dims < 6) assert.match(ssd[3], /partial|too few/i, `South Sudan's 1981 start: ${ssd[3]}`);
  // F4. Below the floor a score is not coloured: no fill from the ramp, and words in the tooltip.
  await open('#map&year=1981');
  const drawnIsos = new Set(await page.$$eval('#map path.land[data-iso]', ps => ps.map(p => p.dataset.iso)));
  const few = n.countries.find(c => drawnIsos.has(c.iso3) && cellAt(c.iso3, 1981)?.overall != null && cellAt(c.iso3, 1981).dims < PL.FLOOR);
  if (few) {
    assert.equal(await page.getAttribute(`#map path.land[data-iso="${few.iso3}"]`, 'fill'), 'url(#nodata)');
    assert.match(await tip(few.iso3), /too few/i);
    assert.match((await page.$$eval(`#rows tr[data-iso="${few.iso3}"] td`, tds => tds.map(td => td.textContent))).join(' '), /too few/i);
  }

  // F5. A period to Latest: a country whose Latest score reaches back before the period began is not ranked.
  await open('#map&from=2020');
  for (const mv of (await movers()).filter(x => x.iso)) {
    const back = Object.entries(by[mv.iso].latest).some(([code, it]) => n.indicators.find(i => i.code === code)?.core && it[4] && it[2] < 2020);
    assert.ok(!back, `${mv.iso}: its Latest score uses values from before 2020`);
  }

  // F7 and R6. A period from 1980 (an old 1980s address) is ranked by the period's pressure, and the movers say why
  // there is no change; at 1980 alone the note says there is no score, and 1980's coverage shows (F9).
  await open('#period=1980');
  assert.match(await page.textContent('#movers'), /No score for 1980/);
  const [top1980] = await page.$$eval('#rows tr', rs => rs.slice(0, 1).map(r => r.dataset.iso));
  const dimsOf = x => Object.values(x?.pressure || {}).filter(v => v != null).length;
  const best80 = PL.rank(n.countries, c => { const x = c.decades['1980']; return x && x.overall != null && dimsOf(x) >= PL.FLOOR ? x.overall : null; }, -1)[0];
  assert.ok(by[top1980].decades['1980'].overall === best80.decades['1980'].overall, `ranked by the period: ${top1980} first`);
  await open('#map&year=1980');
  assert.match(await page.textContent('#tnote'), /No PESTLE score for 1980/);
  await page.selectOption('#metric', 'coverage');
  await drawn();
  assert.match(await tip('USA'), new RegExp(`PESTLE coverage, 1980: ${pct(cellAt('USA', 1980).coverage)}`));

  // R3 and R5. The track keeps its place when a drag opens a period; a Latest button brings the slider back at one
  // click, and is off at Latest. R7: a line under the slider says what Latest and a year are.
  await open('#map');
  assert.equal(await page.isDisabled('#yr-latest'), true);
  assert.match(await page.textContent('#yrhint'), /newest value/);
  const before = await page.locator('#years .prp-period-track').boundingBox();
  await page.mouse.move(before.x + before.width - 1, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width * 0.6, before.y + before.height / 2, { steps: 8 });
  const during = await page.locator('#years .prp-period-track').boundingBox();
  await page.mouse.up();
  assert.equal(during.x, before.x, 'the track does not move under the pointer');
  await page.waitForFunction(() => /–Latest$/.test(document.querySelector('#yrlabel').textContent));
  assert.equal(await page.isDisabled('#yr-latest'), false);
  await page.click('#yr-latest');
  await page.waitForFunction(() => document.querySelector('#yrlabel').textContent === 'Latest');
  assert.equal(await page.evaluate(() => location.hash), '#map');

  // R3-3. A hash moved in place (a Master Index tag, Kino) keeps the years and the measure the reader chose.
  await open('#map&year=1995&measure=wb:SP.DYN.LE00.IN');
  await page.evaluate(() => { location.hash = '#country=GHA'; });
  await page.waitForFunction(() => document.querySelector('#profile h2')?.textContent === 'Ghana');
  assert.deepEqual([await page.textContent('#yrlabel'), await page.inputValue('#metric')], ['1995', 'i_SP.DYN.LE00.IN']);
  await page.waitForFunction(() => decodeURIComponent(location.hash) === '#country=GHA&year=1995&measure=wb:SP.DYN.LE00.IN');

  // F8 and R11. A profile over a period names the years of its first values and of its last.
  await open('#country=USA&year=2010&from=2000');
  await page.waitForFunction(() => [...document.querySelectorAll('#profile .stat')].some(s => s.querySelector('span')?.textContent === 'PESTLE pressure' && /first values of/.test(s.textContent)));

  // F3. Compare: a score below the floor or on fewer dimensions wins neither best nor worst, and says partial.
  const tri = ['USA', 'XKX', 'SSD'];
  await page.goto('about:blank');
  await page.goto(`${BASE}/q/national#compare=${tri.join(',')}&year=1981`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('#compare .cmp tbody tr')].some(r => /Overall PESTLE pressure/.test(r.textContent)), null, { timeout: 20000 });
  const ov = await page.$$eval('#compare .cmp tbody tr', rs => { const r = rs.find(x => x.firstElementChild?.textContent === 'Overall PESTLE pressure'); return [...r.querySelectorAll('td.num')].map(td => [td.className, td.textContent]); });
  const dims = tri.map(i => cellAt(i, 1981)?.dims ?? 0), top = Math.max(...dims);
  ov.forEach(([cls, text], k) => {
    if (dims[k] < top || dims[k] < PL.FLOOR) assert.ok(!/best|worst/.test(cls), `${tri[k]} (${dims[k]} dimensions) ranked: ${text}`);
    if (cellAt(tri[k], 1981)?.overall != null && dims[k] < 6) assert.match(text, /partial|too few/i, `${tri[k]}: ${text}`);
  });

  // R9 and R10. An indicator with no values says so in the picker and fetches nothing; an address with a measure
  // that is not by year and a year says what it shows instead, and the address follows.
  const asked = [];
  page.on('request', r => { if (/years\/wb\/SM\.POP\.REFG\.OR/.test(r.url())) asked.push(r.url()); });
  await open('#map&year=2010');
  assert.match(await page.textContent('#metric option[value="i_SM.POP.REFG.OR"]'), /no values/i);
  await page.selectOption('#metric', 'i_SM.POP.REFG.OR');
  await page.waitForFunction(() => !document.querySelector('#tnote').hidden && /no values/i.test(document.querySelector('#tnote').textContent));
  assert.deepEqual(asked, []);
  await open('#map&measure=leaders100&year=2010');
  assert.equal(await page.isHidden('#tnote'), false);
  assert.equal(await page.evaluate(() => location.hash), '#map&year=2010');

  // R2 and R8. While a year's files load the map says so (aria-busy, "loading"); a file that fails to load leaves the
  // view that was showing, says so, and is asked for again on the next move.
  // (Life expectancy: a year of it needs its own file, which the page has not yet asked for.)
  const LE = 'SP.DYN.LE00.IN', leL = read(YEARS + `wb/${LE}.json`), leFra = PL.yearPick(LAST)(PL.ptsOf(leL, leL.countries.indexOf('FRA')))[1];
  let fail = true;
  await page.route('**/national/data/years/**', async r => { if (fail) return r.abort(); await new Promise(res => setTimeout(res, 600)); return r.continue(); });
  await open(`#map&measure=wb:${LE}`);
  await page.focus('#yr');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => /could not load/.test(document.querySelector('#tnote').textContent));
  assert.equal(await page.textContent('#yrlabel'), 'Latest', 'the view that was showing stays');
  assert.equal(await page.getAttribute('#map path.land[data-iso="FRA"]', 'data-v'), String(by.FRA.latest[LE][1]));
  fail = false;
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('#mapbox').getAttribute('aria-busy') === 'true' && /loading/.test(document.querySelector('#maptitle').textContent));
  await page.waitForFunction(y => window.__naDrawn?.view === String(y), LAST);
  assert.equal(await page.getAttribute('#mapbox', 'aria-busy'), 'false');
  assert.equal(await page.getAttribute('#map path.land[data-iso="FRA"]', 'data-v'), leFra ? String(leFra[1]) : null);
  assert.equal(await page.isHidden('#tnote'), true, 'the failure note goes once the figures have loaded');
  await page.unroute('**/national/data/years/**');

  // R4. On a phone the track has the full width, the buttons sit on the label's line.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(`${BASE}/q/national#map`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await phone.waitForFunction(() => window.__naDrawn, null, { timeout: 20000 });
  const pt = await phone.locator('#years .prp-period-track').boundingBox(), lb = await phone.locator('#yr-lbl').boundingBox(), pb = await phone.locator('#yr-play').boundingBox();
  assert.ok(pt.width > 320, `the phone's track: ${pt.width} px`);
  assert.ok(Math.abs((pb.y + pb.height / 2) - (lb.y + lb.height / 2)) < 20, 'Play on the label\'s line');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
});

// The NA-05 second review (16 Nov 2026): three faults a second reviewer found, each shown failing first. Every expected
// figure is again worked out from the committed data with the shared rule.
async function naPage(t) {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const drawn = () => page.waitForFunction(() => window.__naDrawn && window.__naDrawn.view === document.querySelector('#yrlabel').textContent, null, { timeout: 20000 });
  const open = async hash => { await page.goto('about:blank'); await page.goto(`${BASE}/q/national${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForSelector('#rows tr', { state: 'attached', timeout: 20000 }); await drawn(); };
  return { page, errors, open };
}

// X1. Sorting a period by Change ranks only the like-for-like changes, as Rose most and Fell most do: a change that is
// not like for like (or rests on a score under the floor) sorts with the no-values, after every ranked change, by name,
// in both directions, and its cell keeps its figure and its "not ranked" mark.
test('page NA-05 second review: sorting a period by Change ranks like-for-like changes only, as the movers do', pageTest, async t => {
  const PL = await import('../national/lib/pestle.js');
  const n = read('national/data/index.json');
  const P = read(YEARS + 'pressure.json'), cellAt = (iso, y) => PL.pressureOf(P.values[P.countries.indexOf(iso)]?.[y - P.from]);
  const { page, errors, open } = await naPage(t);
  const want = dir => PL.rank(n.countries, c => { const a = cellAt(c.iso3, 1981), b = cellAt(c.iso3, 1982), d = PL.changeOf(a?.overall, b?.overall); return d != null && PL.comparable(a, b) ? d : null; }, dir).map(c => c.iso3);
  const order = () => page.$$eval('#rows tr', rs => rs.map(r => r.dataset.iso));
  await open('#map&from=1981&year=1982');
  assert.equal(await page.$eval('#thead [data-sort="change"]', b => b.closest('th').getAttribute('aria-sort')), 'descending', 'a period opens sorted by Change');
  const down = await order();
  assert.notEqual(down[0], 'CHI', 'the Channel Islands (one dimension at each end) does not head the ranking');
  assert.deepEqual(down, want(-1), 'highest ranked change first, then the rest by name');
  const chi = await page.$$eval('#rows tr[data-iso="CHI"] td', tds => tds.map(td => td.textContent.trim()));
  assert.match(chi[5], /^\+100 pts\s*not ranked$/, `the Channel Islands' change keeps its figure and mark: ${chi[5]}`);
  assert.match(chi[3], /too few/); assert.match(chi[4], /too few/);
  await page.click('#thead [data-sort="change"]');
  await page.waitForFunction(() => document.querySelector('#thead [data-sort="change"]').closest('th').getAttribute('aria-sort') === 'ascending');
  assert.deepEqual(await order(), want(1), 'lowest ranked change first, then the rest by name');
  assert.deepEqual(errors, []);
});

// X2. A country's series that fails to load is never drawn as "no value": the profile and Compare say it could not load,
// as the map does, and the next move asks for it again.
test('page NA-05 second review: a country\'s series that fails to load is not drawn as "no value", in the profile or Compare', pageTest, async t => {
  const n = read('national/data/index.json'), LE = 'SP.DYN.LE00.IN', leLabel = n.indicators.find(i => i.code === LE).label;
  const ie = read('national/data/series/IRL.json')[LE], at = y => ie.find(p => p[0] === y)?.[1];
  const { page, errors, open } = await naPage(t);
  let fail = true, asked = 0;
  await page.route('**/national/data/series/IRL.json', r => { asked++; return fail ? r.fulfill({ status: 503, body: 'unavailable' }) : r.continue(); });
  const leRow = () => page.$eval(`#profile .ind[data-code="${LE}"]`, el => el.textContent);
  await open('#country=IRL&year=2010');
  await page.waitForFunction(() => document.querySelector('#profile h2')?.textContent === 'Ireland' && /could not load/.test(document.querySelector('#tnote').textContent), null, { timeout: 20000 });
  assert.doesNotMatch(await page.textContent('#profile'), /No value for 2010/, 'a failed load is not "no value"');
  assert.match(await leRow(), /could not load/i, `life expectancy (${at(2010)} in 2010): ${await leRow()}`);
  // The next move asks again, and draws what the data says.
  fail = false;
  const before = asked;
  await page.focus('#yr');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(code => /\b2011\b/.test(document.querySelector(`#profile .ind[data-code="${code}"]`)?.textContent || ''), LE, { timeout: 20000 });
  assert.ok(asked > before, 'the series was asked for again');
  assert.equal(await page.$eval(`#profile .ind[data-code="${LE}"] .v`, el => el.textContent), at(2011).toFixed(1));
  assert.doesNotMatch(await page.textContent('#tnote'), /could not load/);

  // Compare: the same, beside a country whose series loads.
  fail = true;
  await open('#compare=IRL,FRA&year=2010');
  await page.waitForFunction(() => [...document.querySelectorAll('#compare .cmp tbody tr')].length > 5 && /could not load/.test(document.querySelector('#tnote').textContent), null, { timeout: 20000 });
  const cells = await page.$$eval('#compare .cmp tbody tr', (rs, l) => { const r = rs.find(x => x.firstElementChild?.textContent === l); return [...r.querySelectorAll('td.num')].map(td => td.textContent); }, leLabel);
  assert.match(cells[0], /could not load/i, `Ireland's life expectancy: ${cells[0]}`);
  assert.doesNotMatch(cells[0], /no value/i);
  assert.ok(cells[1] && !/could not load|no value/i.test(cells[1]), `France's life expectancy: ${cells[1]}`);
  await page.waitForFunction(() => /could not load/i.test(document.querySelector('#cmpcap')?.textContent || ''));
  assert.deepEqual(errors, []);
});

// X3. Whichever render finishes last and draws leaves the map neither busy nor dimmed; a render that a later move has
// replaced leaves nothing set.
test('page NA-05 second review: a render that replaces one still loading leaves the map neither busy nor dimmed', pageTest, async t => {
  const LE = 'SP.DYN.LE00.IN';
  const { page, errors, open } = await naPage(t);
  await open(`#map&measure=wb:${LE}`);
  let finished;
  const oldDone = new Promise(res => { finished = res; });
  await page.route('**/national/data/years/**', async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); finished(); });
  await page.focus('#yr');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('#mapbox').getAttribute('aria-busy') === 'true');
  const t0 = await page.evaluate(() => window.__naDrawn.at);
  await page.click('#yr-latest');
  await page.waitForFunction(a => window.__naDrawn.at > a && window.__naDrawn.view === 'Latest', t0);
  assert.equal(await page.getAttribute('#mapbox', 'aria-busy'), 'false', 'Latest is drawn, so the map is not busy');
  await oldDone;
  await page.waitForTimeout(600);
  assert.equal(await page.getAttribute('#mapbox', 'aria-busy'), 'false', 'still not busy once the old request has finished');
  assert.equal(await page.$eval('#map', el => getComputedStyle(el).opacity), '1', 'not dimmed');
  assert.equal(await page.textContent('#yrlabel'), 'Latest');
  assert.doesNotMatch(await page.textContent('#maptitle'), /loading/);
  await page.unroute('**/national/data/years/**');
  assert.deepEqual(errors, []);
});

// NA-03 (15 Nov 2026): a Wikidata label that carries its holder's realm is shown as the name alone, in the build and
// in the data the page reads; a note in brackets, a party and a plain name are left as they are.
test('leaders: a name is shown without its realm ("Mohammed VI of Morocco" is "Mohammed VI"), in the data too', async () => {
  const { plainName } = await import('../national/scripts/leaders.mjs');
  const cases = [['Mohammed VI of Morocco', 'Mohammed VI'], ['Albert II, Prince of Monaco', 'Albert II'],
    ['William Alexander of the Netherlands', 'William Alexander'], ['Guillaume V, Grand Duke of Luxembourg', 'Guillaume V'],
    ['Salman bin Hamad, Crown Prince of Bahrain', 'Salman bin Hamad'], ['Carl XVI Gustaf of Sweden', 'Carl XVI Gustaf'],
    ['Charles III (represented by Governor General Mary Simon)', 'Charles III (represented by Governor General Mary Simon)'],
    ['Hereditary Prince Alois', 'Hereditary Prince Alois'], ['Emmanuel Macron', 'Emmanuel Macron'], [null, null]];
  for (const [a, b] of cases) assert.equal(plainName(a), b, String(a));
  const data = JSON.parse(readFileSync(new URL('../national/data/index.json', import.meta.url), 'utf8'));
  for (const c of data.countries) for (const n of [c.headOfState, c.headOfGovernment, c.regent, c.leader?.name].filter(Boolean)) {
    assert.equal(plainName(n), n, `${c.iso3}: "${n}" still carries its realm`);
  }
});
