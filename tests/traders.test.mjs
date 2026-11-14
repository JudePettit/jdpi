// Trader Tracker: House trades (filters, member view) and 13F investors (runs against JDPI_URL).
// The data test reads the committed traders/data (which traders-refresh tests before committing); PRP_PAGES=0 leaves
// out the page test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('data: House trades and 13F holdings are complete enough to show', () => {
  const c = read('traders/data/congress.json'), inv = read('traders/data/investors.json');
  // October 2026: 143 members and 11,263 trades over 2025–26 (7,666 filed in 2025). In January the file moves on a
  // year, so it holds the year before (about 4,500 trades for 2026) and a new year that may still be empty: floors of
  // 50 members and 1,000 trades in the earlier year hold then, and a lost year or a lost list of members does not.
  const filedIn = y => c.trades.filter(t => t.filed.startsWith(`${y}-`)).length;
  assert.ok(c.members.length >= 50, `${c.members.length} members`);
  assert.ok(filedIn(c.years[0]) >= 1000, `${filedIn(c.years[0])} trades filed in ${c.years[0]}`);
  // Party and Bioguide ID come from the congress-legislators lists (all 143 matched now; the Master Index needs the ID).
  assert.ok(c.members.filter(m => m.party && m.bioguide).length >= c.members.length * 0.9, 'members with a party and a Bioguide ID');
  const ids = new Set(c.members.map(m => m.id));
  assert.equal(ids.size, c.members.length, 'member ids are unique');
  for (const t of c.trades) assert.ok(ids.has(t.member) && /^\d{4}-\d{2}-\d{2}$/.test(t.filed) && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.asset && t.url && ['buy', 'sell', 'partial sale', 'exchange'].includes(t.type), JSON.stringify(t));
  assert.equal(c.members.reduce((s, m) => s + m.trades, 0), c.trades.length, 'members add up to the trades');
  // Ten investors, each with the positions of its latest 13F, and a US ticker for most holdings (1,803 of 1,907 now).
  assert.ok(inv.investors.length >= 8, `${inv.investors.length} investors`);
  for (const i of inv.investors) assert.ok(i.cik && /^\d{4}-\d{2}-\d{2}$/.test(i.period) && i.positions?.length, `${i.person}: ${i.positions?.length} positions for ${i.period}`);
  assert.ok(inv.tickers.mapped >= inv.tickers.of * 0.8, `${inv.tickers.mapped} of ${inv.tickers.of} holdings with a ticker`);
});

test('Congress trades filter by member and ticker; investors show 13F holdings', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/fe/traders?tab=congress`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#trades tr td', { timeout: 20000 });
  const rows = await page.locator('#trades tr').count();
  await page.fill('#member-search', 'Pelosi');
  await page.locator('.member', { hasText: 'Pelosi' }).click();
  await page.selectOption('#f-days', '9999');
  const title = await page.locator('#trades-title').innerText();
  const pelosi = await page.locator('#trades').innerText();
  await page.click('.tabs button[data-tab=investors]');
  await page.locator('.card', { hasText: 'Warren Buffett' }).click();
  const detail = await page.locator('#investor-detail').innerText();
  await browser.close();
  assert.ok(rows > 50, `rows: ${rows}`);
  assert.match(title, /Pelosi/);
  assert.match(pelosi, /Spouse/);
  assert.match(detail, /BERKSHIRE|Berkshire/);
  assert.match(detail, /APPLE|Apple|AMERICAN EXPRESS|American Express/);
  assert.deepEqual(errors, []);
});

/* ---- its summary (integration/scripts/heads.mjs), written by the build with the store and committed with it; checked
   here too, so a refresh never commits one out of step. */
import { checkHeads as checkSummaries } from '../integration/scripts/heads.mjs';
test('congress.head.json is in step with its store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('traders/data/congress.json'), [], 'run node integration/scripts/heads.mjs traders/data/congress.json');
});
test('investors.head.json is in step with its store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('traders/data/investors.json'), [], 'run node integration/scripts/heads.mjs traders/data/investors.json');
});

/* ---- the filing's age beside each Mirror button (fe/filing-age.js; the review of 12 November 2026: "Auto Trader keeps a
   filing's age beside every mirror action"). Made-up data and a fixed "now", so these never lean on the clock or on the
   dates of the real store. */
import '../fe/filing-age.js';
const { daysAgo, filingOf, filingAge } = globalThis.VMFilingAge;
const NOW = Date.UTC(2026, 10, 14, 23, 30); // 14 Nov 2026, late in the UTC day
const fakeInvestors = [
  { cik: 111, person: 'Investor A', period: '2026-06-30', filed: '2026-08-14' },
  { cik: 222, person: 'Investor B', period: '2025-06-30', filed: '2025-08-01', stale: 'The fund closed in 2025 and files no more.' },
];
const trade = o => ({ member: 'm1', ticker: 'AAA', assetType: 'ST', date: '2026-10-01', filed: '2026-10-20', ...o });
const fakeCongress = { trades: [
  trade({}),
  trade({ date: '2026-11-03', filed: '2026-11-10' }),
  trade({ assetType: 'OP', note: 'Purchased 10 call options', date: '2026-11-04', filed: '2026-11-04' }),
  trade({ assetType: 'OP', note: 'Sold 5 put options', date: '2026-11-12', filed: '2026-11-13' }), // a put: not copied
  trade({ assetType: 'GS', date: '2026-11-12', filed: '2026-11-13' }), // a bond: not copied
  trade({ ticker: null, date: '2026-11-12', filed: '2026-11-13' }), // no ticker: not copied
  trade({ date: '2024-11-14', filed: '2024-12-01' }), // 730 days before: still in
  trade({ date: '2024-11-13', filed: '2024-12-01' }), // 731 days before: out
  trade({ member: 'm2', date: '2026-11-13', filed: '2026-11-14' }), // another member
] };

test('filing age: whole UTC days, "today" and "1 day ago"', () => {
  assert.equal(daysAgo('2026-11-14', NOW), 'today');
  assert.equal(daysAgo('2026-11-13', NOW), '1 day ago');
  assert.equal(daysAgo('2026-08-14', NOW), '92 days ago');
  assert.equal(daysAgo('2026-06-30', NOW), '137 days ago');
  // Just after midnight UTC the count moves on a whole day, whatever the hour.
  assert.equal(daysAgo('2026-11-13', Date.UTC(2026, 10, 14, 0, 1)), '1 day ago');
});

test('filing age: an investor\'s 13F in the money site\'s words, and a stale one copies nothing', () => {
  const data = { investors: fakeInvestors, congress: fakeCongress };
  assert.equal(filingAge(filingOf({ cik: 111 }, data, NOW), NOW),
    'Copies the 13F for the quarter to 30 Jun 2026 (137 days ago), filed 14 Aug 2026 (92 days ago).');
  assert.equal(filingAge(filingOf({ cik: '222' }, data, NOW), NOW),
    'Its latest filing is the 13F for the quarter to 30 Jun 2025 (502 days ago), filed 1 Aug 2025 (470 days ago), and it is out of date: The fund closed in 2025 and files no more. Mirror copies nothing from it.');
  assert.equal(filingAge(filingOf({ cik: 999 }, data, NOW), NOW), 'Filing not found in Auto Trader’s data.');
});

test('filing age: a member\'s trades are that member\'s, with a ticker, of the last 730 days, shares or calls', () => {
  const data = { investors: fakeInvestors, congress: fakeCongress };
  const f = filingOf({ source: 'congress', member: 'm1' }, data, NOW);
  assert.deepEqual(f, { kind: 'congress', trades: 4, date: '2026-11-04', filed: '2026-11-10' });
  assert.equal(filingAge(f, NOW),
    'Builds its portfolio from 4 disclosed trades of the last two years: the latest made 4 Nov 2026 (10 days ago), the latest filed 10 Nov 2026 (4 days ago).');
  assert.equal(filingAge(filingOf({ source: 'congress', member: 'm2' }, data, NOW), NOW),
    'Builds its portfolio from 1 disclosed trade of the last two years: the latest made 13 Nov 2026 (1 day ago), the latest filed 14 Nov 2026 (today).');
  assert.equal(filingAge(filingOf({ source: 'congress', member: 'nobody' }, data, NOW), NOW), 'No disclosed stock trades in the last two years to copy.');
});

test('page: each Mirror button has its filing\'s age beside it, worked out from the page\'s data', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(NOW));
    const pos = { ticker: 'AAA', name: 'A CORP', cls: 'COM', weight: 1, value: 1e8, shares: 1000, change: 'new' };
    const inv = i => ({ fund: 'Fund', style: 'Value investing', registeredName: 'FUND LP', filingUrl: 'https://www.sec.gov/', total: 1e8, positions: [pos], sold: [], previousPeriod: '2026-03-31', ...i });
    const members = [{ id: 'm1', name: 'Member One', party: 'Democrat', district: 'XX01', trades: 8 }, { id: 'm2', name: 'Member Two', party: 'Republican', district: 'XX02', trades: 1 },
      { id: 'm3', name: 'Member Three', party: 'Democrat', district: 'XX03', trades: 1 }];
    const trades = [...fakeCongress.trades, trade({ member: 'm3', date: '2023-01-05', filed: '2023-01-20' })]
      .map(t => ({ url: 'https://disclosures-clerk.house.gov/', owner: 'self', asset: 'A Corp', type: 'buy', amount: '$1,001 - $15,000', ...t }));
    await page.route('**/traders/data/congress.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ generated: '2026-11-14T06:00:00Z', years: [2025, 2026], members, trades }) }));
    await page.route('**/traders/data/investors.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ generated: '2026-11-14T06:00:00Z', tickers: { mapped: 1, of: 1 }, investors: fakeInvestors.map(inv) }) }));
    await page.goto(`${BASE}/fe/traders?tab=congress&member=m1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#age-member', { timeout: 20000 });
    // Beside the button: the age sits in the same group as "Mirror trades".
    const member = page.locator('.mirror', { has: page.locator('a', { hasText: 'Mirror trades' }) }).locator('#age-member');
    assert.equal(await member.innerText(), 'Builds its portfolio from 4 disclosed trades of the last two years: the latest made 4 Nov 2026 (10 days ago), the latest filed 10 Nov 2026 (4 days ago).');
    // A member whose only ticker trade is older than two years keeps the button and is told there is nothing to copy.
    await page.locator('.member', { hasText: 'Member Three' }).click();
    assert.equal(await page.locator('#age-member').innerText(), 'No disclosed stock trades in the last two years to copy.');
    await page.click('.tabs button[data-tab=investors]');
    await page.locator('.card', { hasText: 'Investor A' }).click();
    const a = page.locator('.mirror', { has: page.locator('a', { hasText: 'Mirror portfolio' }) }).locator('#age-investor');
    assert.equal(await a.innerText(), 'Copies the 13F for the quarter to 30 Jun 2026 (137 days ago), filed 14 Aug 2026 (92 days ago).');
    await page.locator('.card', { hasText: 'Investor B' }).click();
    const b = page.locator('#age-investor');
    assert.match(await b.innerText(), /^Its latest filing is the 13F for the quarter to 30 Jun 2025 \(502 days ago\), filed 1 Aug 2025 \(470 days ago\), and it is out of date: .* Mirror copies nothing from it\.$/);
    assert.match(await b.getAttribute('class'), /\bstale\b/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
