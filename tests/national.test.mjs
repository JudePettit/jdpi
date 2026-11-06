// National Analysis: map, country profile (overview + PESTLE), and side-by-side comparison.
// The data test reads the committed national/data (which national-refresh tests before committing); the page test
// runs against JDPI_URL (default live), and PRP_PAGES=0 leaves it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('leaders: the Retrospective\'s last leader is current only while open and named as a present head', async () => {
  const { currentLeader, sameFamily } = await import('../national/scripts/leaders.mjs');
  const heads = { hos: { name: 'Karol Nawrocki', qid: 'Q1', start: '2025-08-06' }, hog: { name: 'Donald Tusk', qid: 'Q2', start: '2023-12-13' } };
  // A stale Retrospective leader (an entry that ended) is not current: the head of government is.
  const stale = [{ name: 'Komorowski', full: 'Bronisław Komorowski', start: '2010-08-06', end: '2015-08-06', parties: [{ name: 'Civic Platform' }] }];
  assert.deepEqual(currentLeader(stale, heads), { name: 'Donald Tusk', since: '2023-12-13', party: null, url: 'https://www.wikidata.org/wiki/Q2', source: 'wikidata' });
  // Open, but no longer either head: not current either.
  assert.equal(currentLeader([{ name: 'Komorowski', full: 'Bronisław Komorowski', start: '2010-08-06' }], heads).source, 'wikidata');
  // Open and a present head: the Retrospective's entry, with its start and party.
  assert.deepEqual(currentLeader([...stale, { name: 'Tusk', full: 'Donald Tusk', start: '2023-12-13', url: 'u', parties: [{ name: 'Old', e: '2001' }, { name: 'Civic Coalition', e: null }] }], heads),
    { name: 'Donald Tusk', since: '2023-12-13', party: 'Civic Coalition', url: 'u', source: 'retrospective' });
  // A number is not a name: the entry fails, and the head of government is the leader.
  const greece = { hos: { name: 'Konstantinos Tasoulas', qid: 'Q3', start: '2025-03-13' }, hog: { name: 'Kyriakos Mitsotakis', qid: 'Q4', start: '2023-06-26' } };
  const num = currentLeader([{ name: '9811205000', full: '9811205000', start: '2019-06-08' }], greece);
  assert.equal(num.name, 'Kyriakos Mitsotakis'); assert.equal(num.source, 'wikidata');
  // The head of state where there is no head of government; nobody where there are no heads.
  assert.equal(currentLeader([], { hos: { name: 'Donald Trump', qid: 'Q5', start: '2025-01-20' }, hog: null }).name, 'Donald Trump');
  // In a presidential system the head of state governs (Uzbekistan: the President, not the Prime Minister).
  const uzb = { hos: { name: 'Shavkat Mirziyoyev', qid: 'Q6', start: '2016-12-14' }, hog: { name: 'Abdulla Aripov', qid: 'Q7', start: '2016-12-14' } };
  assert.equal(currentLeader([], uzb, { presidential: true }).name, 'Shavkat Mirziyoyev');
  assert.equal(currentLeader([], uzb).name, 'Abdulla Aripov');
  // Haiti: the Retrospective's open entry is a council that is no present head: the Prime Minister.
  const hti = currentLeader([{ name: 'Council', full: 'Transitional Presidential Council', start: '2024-04-25' }], { hos: null, hog: { name: 'Alix Didier Fils-Aimé', qid: 'Q8', start: '2024-11-11' } });
  assert.equal(hti.name, 'Alix Didier Fils-Aimé'); assert.equal(hti.source, 'wikidata');
  // A misspelt short name still matches by the full name's last word (the Retrospective has "Ilhma Aliyev").
  const aze = currentLeader([{ name: 'Ilhma Aliyev', full: 'Ilham Aliyev', start: '2003-08-04' }], { hos: { name: 'Ilham Aliyev', qid: 'Q9', start: '2003-10-31' }, hog: { name: 'Ali Asadov', qid: 'Q10', start: '2019-10-08' } });
  assert.equal(aze.name, 'Ilham Aliyev'); assert.equal(aze.source, 'retrospective');
  assert.equal(currentLeader(undefined, {}), null);
  // Family names compare without accents or case, and with both spellings of names like Zelensky.
  assert.ok(sameFamily('Zelensky', 'Volodymyr Zelenskyy') && sameFamily('Zelenskyy', 'Volodymyr Zelenskiy'));
  assert.ok(sameFamily('DIAZ-CANEL', 'Miguel Díaz-Canel Bermúdez') && sameFamily('de la Huerta', 'Adolfo de la Huerta'));
  assert.ok(!sameFamily('Lapid', 'Benjamin Netanyahu') && !sameFamily('9811205000', 'Kyriakos Mitsotakis'));
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

test('data: every current leader is a name, and the Retrospective\'s only when it agrees with a present head', async () => {
  const n = read('national/data/index.json');
  for (const c of n.countries) {
    const l = c.leader;
    if (c.leadership) assert.deepEqual(c.leadership.current, l, `${c.iso3}: leadership.current is the leader`);
    if (!l) { assert.ok(!c.headOfState && !c.headOfGovernment, `${c.iso3}: heads but no leader`); continue; }
    assert.match(l.name, /\p{L}/u, `${c.iso3}: ${l.name}`);
    assert.ok(['retrospective', 'wikidata'].includes(l.source), `${c.iso3}: source ${l.source}`);
    if (l.source === 'wikidata') assert.ok([c.headOfGovernment, c.headOfState].includes(l.name), `${c.iso3}: ${l.name}`);
    else assert.ok(l.since && !l.name.match(/^\d+$/), `${c.iso3}: ${JSON.stringify(l)}`);
  }
  const pol = n.countries.find(c => c.iso3 === 'POL');
  assert.notEqual(pol.leader?.name, 'Bronisław Komorowski', 'Poland\'s leader is not the one who left office in 2015');
  for (const iso of ['USA', 'MEX', 'XKX']) assert.ok(n.countries.find(c => c.iso3 === iso).headOfState, `${iso} has a head of state`);
  // No council or other body stands as a head, and no one the second reader found stale is shown as current.
  const by = Object.fromEntries(n.countries.map(c => [c.iso3, c]));
  for (const c of n.countries) for (const h of [c.headOfState, c.headOfGovernment]) assert.ok(!/\bcouncil\b/i.test(h || ''), `${c.iso3}: ${h}`);
  for (const [iso, gone] of [['GHA', 'Nana Akufo-Addo'], ['ZMB', 'Edgar Lungu'], ['MWI', 'Lazarus Chakwera'], ['COD', 'Ilunga Ilunkamba Sylvestre'], ['SDN', 'Abdalla Hamdok'], ['IRQ', "Muhammad Shia' al-Sudani"], ['MMR', 'Myint Swe']])
    assert.ok(![by[iso].headOfState, by[iso].headOfGovernment, by[iso].leader?.name].includes(gone), `${iso}: ${gone} is not current`);
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
