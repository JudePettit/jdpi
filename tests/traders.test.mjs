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
  // Party and Bioguide ID come from the congress-legislators lists (all 143 matched now; the Encyclopaedia needs the ID).
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
