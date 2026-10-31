// Realtime and Retrospective Battlefield: the history build's names and places, the Realtime data (the committed
// battlefield/data/realtime.json, which battlefield-refresh tests before committing), then the pages (against
// JDPI_URL, default live; PRP_PAGES=0 leaves them out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { actors, stateName, interstateName, parties } from '../battlefield/scripts/ucdp.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const HISTORY = JSON.parse(readFileSync(new URL('../battlefield/history/data/wars.json', import.meta.url), 'utf8'));
const REALTIME = JSON.parse(readFileSync(new URL('../battlefield/data/realtime.json', import.meta.url), 'utf8'));
const war = id => HISTORY.wars.find(w => w.id === id);
const locIn = (w, y) => w.locYears?.[y] || w.loc;
const activeIn = y => HISTORY.wars.filter(w => w.years.some(([yy]) => yy === y));

test('UCDP names: each actor once, without "Government of", by the name that fits the date', () => {
  assert.deepEqual(actors('Government of Australia, Government of United Kingdom, Government of United States of America', '156, 28, 3'),
    ['Government of Australia', 'Government of United Kingdom', 'Government of United States of America']);
  assert.deepEqual(actors('Military faction (forces of Augusto Pinochet, Toribio Merino and Leigh Guzman)', '757'), ['Military faction (forces of Augusto Pinochet, Toribio Merino and Leigh Guzman)']);
  assert.deepEqual(actors('Military Junta for the Consolidation of Democracy, Peace and Justice', '549'), ['Military Junta for the Consolidation of Democracy, Peace and Justice']);
  assert.deepEqual(actors('CPP, Military faction (forces of Honasan, Abenina & Zumel)'), ['CPP', 'Military faction (forces of Honasan, Abenina & Zumel)']);
  assert.equal(stateName('Government of Russia (Soviet Union)', '1956-11-04'), 'Soviet Union');
  assert.equal(stateName('Government of Russia (Soviet Union)', '2022-02-24'), 'Russia');
  assert.equal(stateName('Government of Yemen (North Yemen)', '2024-01-12'), 'Yemen');
  const row = { year: '2003', side_a: 'Government of Australia, Government of United Kingdom, Government of United States of America', side_a_id: '156, 28, 3', gwno_a: '900,  200, 2', side_b: 'Government of Iraq', side_b_id: '116', gwno_b: '645' };
  assert.equal(interstateName([row]), 'Australia, United Kingdom, United States of America – Iraq');
  assert.deepEqual([...parties(row, '2003-03-20')], [[900, 'Australia'], [200, 'United Kingdom'], [2, 'United States of America'], [645, 'Iraq']]);
});

test('Retrospective data: wars sit where they were fought, not in every state that sent forces', () => {
  // The finding: the United States had no war on its own territory in 2003 (Iraq, Afghanistan and al-Qaida were all abroad).
  assert.deepEqual(activeIn(2003).filter(w => locIn(w, 2003).includes(2)).map(w => w.name), []);
  assert.deepEqual(war('u420').loc, [645]);
  assert.deepEqual(war('u13692').loc, [700]);
  assert.deepEqual(war('u16099').loc, [678]);
  for (const [id, gw] of [['u252', 200], ['u252', 220], ['u350', 2], ['u368', 2], ['u250', 365], ['u431', 365], ['u323', 640]]) assert.ok(!war(id).loc.includes(gw), `${war(id).name} is not on ${gw}`);
  // Wars fought on both sides keep both.
  for (const [id, gws] of [['u235', [731, 732]], ['u293', [816, 817]], ['u13243', [365, 369]], ['u324', [630, 645]], ['u409', [530, 531]]]) assert.deepEqual([...war(id).loc].sort((a, b) => a - b), gws, war(id).name);
  // The Falklands were fought on islands the map has no shape for: neither Argentina nor Britain, but named.
  assert.deepEqual(war('u346').loc, []);
  assert.deepEqual(war('u346').where, ['the Falkland Islands']);
  // Al-Qaida's war with the United States reached US soil in 2001 only; Hezbollah's with Israel was fought in Lebanon.
  assert.deepEqual(locIn(war('u418'), 2001), [2, 700]);
  assert.ok(!locIn(war('u418'), 2010).includes(2));
  assert.ok(locIn(war('u426'), 2006).includes(660));
  // World War II moves year by year: Poland in 1939, North Africa and the Pacific later; never New Zealand or South Africa.
  const ww2 = war('c139');
  assert.deepEqual([...locIn(ww2, 1939)].sort((a, b) => a - b), [255, 290]);
  for (const gw of [620, 651, 840, 775, 911, 365]) assert.ok(locIn(ww2, 1942).includes(gw), `1942: ${gw}`);
  for (const gw of [2, 20, 140, 560, 712, 920]) assert.ok(!ww2.loc.includes(gw), `World War II not fought in ${gw}`);
  assert.ok(Object.keys(ww2.locYears).length === 7);
  // Colonial wars are fought in the colony, civil wars in their own country, not in the states that intervened.
  assert.deepEqual(war('c454').loc, [665]);
  assert.deepEqual(war('c718').loc, [230]);
  // Every year a war was active has its places.
  for (const w of HISTORY.wars) if (w.locYears) for (const [y] of w.years) assert.ok(w.locYears[y], `${w.name} ${y}`);
});

test('Retrospective data: war names list each side once, without "Government of"; actor names stay whole', () => {
  for (const w of HISTORY.wars) assert.doesNotMatch(w.name, /Government of/, w.name);
  assert.equal(war('u420').name, 'Australia, United Kingdom, United States of America – Iraq');
  assert.equal(war('u228').name, 'Egypt, Iraq, Jordan, Lebanon, Syria – Israel');
  assert.equal(war('u16099').name, 'United Kingdom, United States of America – Yemen');
  assert.equal(war('u13243').name, 'Russia – Ukraine');
  assert.equal(war('u250').name, 'Hungary – Soviet Union');
  for (const w of HISTORY.wars) for (const s of [...w.sideA, ...w.sideB]) assert.equal((s.match(/\(/g) || []).length, (s.match(/\)/g) || []).length, `${w.name}: ${s}`);
});

test('Realtime data: the year so far month by month, with enough wars and conflict cells to map', () => {
  const r = REALTIME, sum = f => r.wars.reduce((s, w) => s + (f(w) || 0), 0);
  assert.equal(r.generated, new Date(Date.parse(r.generated)).toISOString());
  assert.match(r.version, /^\d{2}\.01\.\d{2}\.\d{2}$/);
  // A year-to-date file: every month from January to the one its release covers to ('26.01.26.09': September 2026).
  const [, , yy, mm] = r.version.split('.');
  assert.equal(r.latest, `20${yy}-${mm}`, `release ${r.version}`);
  assert.deepEqual(r.months, Array.from({ length: +mm }, (_, i) => `${r.year}-${String(i + 1).padStart(2, '0')}`));
  // The page plots and lists these; the live view asks for as much (10 wars, 100 markers). Each month of 2026 has had
  // 1,400–2,000 events, 9,000–40,000 deaths and 50–56 wars with events, so a month under 300 events, 1,000 deaths or
  // 10 wars is a short file, not a quiet month.
  assert.ok(r.wars.filter(w => w.status === 'active').length >= 10, `${r.wars.filter(w => w.status === 'active').length} active wars`);
  assert.ok(sum(w => w.points?.length) >= 100, 'conflict cells to plot');
  r.months.forEach((m, i) => {
    const events = sum(w => w.monthly[i]?.events), deaths = sum(w => w.monthly[i]?.deaths), wars = r.wars.filter(w => w.monthly[i]?.events).length;
    assert.ok(events >= 300 && deaths >= 1000 && wars >= 10, `${m}: ${events} events, ${deaths} deaths, ${wars} wars`);
  });
  assert.ok(sum(w => w.events) <= r.totals.events && sum(w => w.deaths) <= r.totals.deaths, 'wars within the totals');
  // Every war has a summary and an entry for every month, in order (the archive view looks each month up).
  assert.equal(new Set(r.wars.map(w => w.id)).size, r.wars.length, 'war ids are unique');
  for (const w of r.wars) {
    assert.ok(w.id && w.name && w.summary && /^\d{4}-\d{2}-\d{2}$/.test(w.lastActive), w.id);
    assert.deepEqual(w.monthly.map(m => m.month), r.months, w.id);
    assert.ok(w.points.every(p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p[2] >= 0 && p[2] < r.months.length && p[4] > 0), `${w.id}: points`);
  }
});

async function open(path) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { browser, page, errors };
}

test('Realtime: live view lists extant wars and plots events; a war opens its briefing', pageTest, async () => {
  const { browser, page, errors } = await open('q/battlefield?view=live');
  await page.waitForSelector('.warrow', { timeout: 20000 });
  const wars = await page.locator('.warrow').count();
  const markers = await page.locator('path.leaflet-interactive').count();
  await page.locator('.warrow').first().click();
  await page.waitForSelector('.detail h2');
  const briefing = await page.locator('.detail').innerText();
  await browser.close();
  assert.ok(wars >= 10, `wars: ${wars}`);
  assert.ok(markers >= 100, `markers: ${markers}`);
  assert.match(briefing, /deaths/);
  assert.match(briefing, /background/i);
  assert.deepEqual(errors, []);
});

test('Realtime: archive view shows a month with an insight per war', pageTest, async () => {
  // The month in which the most wars recorded events, from the data the page itself loads (a new year's file replaces
  // the last year's months).
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const busiest = data.months.map((m, i) => [m, data.wars.filter(w => w.monthly[i].events).length]).sort((a, b) => b[1] - a[1])[0][0];
  const name = new Date(`${busiest}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const { browser, page, errors } = await open(`q/battlefield?view=archive&month=${busiest}`);
  await page.waitForSelector('.arow', { timeout: 20000 });
  const month = await page.locator('#month').getAttribute('data-value'); // the timeline's end handle (design/prp-period.js)
  const rows = await page.locator('.arow').count();
  const first = await page.locator('.arow p').first().innerText();
  await browser.close();
  assert.equal(month, busiest);
  assert.ok(rows >= 10, `rows: ${rows}`);
  assert.match(first, new RegExp(`^${name}: .* events, about .* deaths`));
  assert.deepEqual(errors, []);
});

test('Realtime: an archive period sums each war over its months; the start handle on the end gives one month again', pageTest, async () => {
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const [first, last] = [data.months[0], data.months.at(-1)], year = last.slice(0, 4);
  const name = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const deaths = w => w.monthly.reduce((s, x) => s + x.deaths, 0);
  const top = data.wars.filter(w => w.monthly.some(x => x.events)).sort((a, b) => deaths(b) - deaths(a))[0];
  const { browser, page, errors } = await open(`q/battlefield?view=archive&month=${last}&from=${first}`);
  await page.waitForSelector('.arow', { timeout: 20000 });
  const title = await page.locator('#archtitle').innerText();
  const side = await page.locator('#sidetitle').innerText();
  const row = await page.locator('.arow h4').first().innerText();
  const perMonth = await page.locator('.arow').first().locator('.permonth span').count();
  // The start handle pushed onto the end: one month, as before, and no from= in the address.
  await page.locator('#month-from').focus();
  await page.keyboard.press('End');
  const one = { title: await page.locator('#archtitle').innerText(), url: page.url(), months: await page.locator('.permonth').count() };
  await browser.close();
  assert.equal(title, `${name(first)}–${name(last)} ${year}`);
  assert.equal(side, `Wars in ${name(first)}–${name(last)} ${year}`);
  assert.ok(row.includes(top.name) && row.includes(`${deaths(top).toLocaleString('en-GB')} deaths`), `first row: ${row}; expected ${top.name}, ${deaths(top)}`);
  assert.equal(perMonth, data.months.length);
  assert.equal(one.title, `${name(last)} ${year}`);
  assert.match(one.url, new RegExp(`\\?view=archive&month=${last}$`));
  assert.equal(one.months, 0);
  assert.deepEqual(errors, []);
});

test('Retrospective: 1939 shows World War II; 2025 shows dozens of conflicts', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1939');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const y1939 = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=2025'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2025');
  const n2025 = +(await page.locator('#panel .sub').innerText()).match(/^(\d+) armed/)[1];
  const red = await page.locator('path.shape[fill="var(--c-war)"]').count();
  // A long list shows its first items and opens the rest in a pop-out.
  await page.evaluate(() => { location.hash = '#y=2025&c=2'; });
  await page.waitForSelector('#panel [data-more]');
  const shown = await page.locator('#panel .war').count();
  await page.locator('#panel [data-more]').last().click();
  await page.waitForSelector('#modal:not([hidden]) .war');
  const all = await page.locator('#modal .war').count();
  const heading = await page.locator('#modal-title').innerText();
  await browser.close();
  assert.ok(all > 6, `pop-out lists every US conflict: ${all}`);
  assert.ok(shown < all + 12, 'panel shows a shortened list');
  assert.match(heading, /all conflicts 1926–2025/);
  assert.match(y1939, /World War II/);
  assert.ok(n2025 >= 40, `2025 conflicts: ${n2025}`);
  assert.ok(red >= 5, `countries at war: ${red}`);
  assert.deepEqual(errors, []);
});

test('Retrospective: 2003 shades Iraq at war and its invaders as fighting abroad; 1942 shows the war in North Africa and the Pacific', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2003');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const fills = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('path.shape')].map(p => [p.__data__.properties.gw, p.getAttribute('fill')])));
  const y2003 = await fills();
  await page.evaluate(() => { location.hash = '#y=2003&c=2'; });
  await page.waitForFunction(() => /^No conflict on its territory in 2003/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const us = await page.locator('#panel .sub').innerText();
  await page.evaluate(() => { location.hash = '#y=1982&w=u346'; });
  await page.waitForSelector('#panel h2');
  const falklands = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=1942'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1942');
  const y1942 = await fills();
  await browser.close();
  assert.equal(y2003[645], 'var(--c-war)');
  for (const gw of [2, 200, 900]) assert.equal(y2003[gw], 'var(--c-abroad)', `2003: ${gw}`);
  assert.match(us, /fighting in \d+ abroad/);
  assert.match(falklands, /over territory in the Falkland Islands/);
  for (const gw of [620, 651, 840, 775, 911]) assert.equal(y1942[gw], 'var(--c-war)', `1942: ${gw}`);
  for (const gw of [560, 920]) assert.equal(y1942[gw], 'var(--c-abroad)', `1942: ${gw}`);
  assert.deepEqual(errors, []);
});

test('Retrospective: a period of years shows every conflict active in it at its peak; the end handle pulled onto the start gives one year', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1942');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const atWar = () => page.locator('path.shape[fill="var(--c-war)"]').count();
  const red1942 = await atWar();
  await page.evaluate(() => { location.hash = '#y=1945&f=1939'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1939–1945');
  const period = {
    label: (await page.locator('#year-label').textContent()).trim(), // textContent: the CSS upper-cases it
    sub: await page.locator('#panel .sub').innerText(),
    red: await atWar(),
    card: (await page.locator('#panel .war[data-id] .lvl').first().textContent()).trim(), // textContent: the CSS upper-cases it
    handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()],
  };
  // A redraw (a country chosen) keeps the period in the address.
  await page.evaluate(() => { location.hash = '#y=1945&f=1939&c=2'; });
  await page.waitForFunction(() => /on its territory in 1939–1945/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const kept = page.url();
  // The end handle pulled back onto the start: one year again, the start at rest, and no f in the address.
  await page.locator('#year').fill('1939');
  await page.locator('#year').dispatchEvent('input');
  const one = { big: await page.locator('#year-big').innerText(), url: page.url(), handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()] };
  await browser.close();
  assert.equal(period.label, 'Period');
  assert.match(period.sub, /^\d+ armed conflicts, \d+ at war level at some point$/);
  assert.ok(period.red >= red1942, `countries at war 1939–1945: ${period.red}; 1942: ${red1942}`);
  assert.equal(period.card, 'War · 1939–45 · 7 yrs'); // World War II leads: at war level, active in all seven years
  assert.deepEqual(period.handles, ['1939', '1945']);
  assert.match(kept, /#y=1945&f=1939&c=2$/);
  assert.equal(one.big, '1939');
  assert.match(one.url, /#y=1939&c=2$/);
  assert.deepEqual(one.handles, ['1939', '1939']);
  assert.deepEqual(errors, []);
});

// The year keeps a period's width at rest too, so on a phone opening a period narrows no figure into another line:
// before, "At war level" wrapped and dropped the timeline and the map 13px under the reader's finger.
test('Retrospective: on a phone, opening a period keeps the timeline where it was', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/history/#y=1945`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  await page.waitForSelector('.jdpi-returnbar', { timeout: 15000 }); // prp-bar.js adds it after load, moving the page down
  await page.evaluate(() => document.fonts.ready);
  const track = () => page.evaluate(() => { const r = document.querySelector('#timeline .prp-period-range').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  const rest = await track();
  await page.locator('#from').focus();
  await page.keyboard.press('ArrowLeft'); // a drag's first move
  const first = await track();
  for (let k = 1; k < 6; k++) await page.keyboard.press('ArrowLeft');
  const period = await track();
  assert.equal(await page.locator('#year-big').textContent(), '1939–1945');
  assert.deepEqual(first, rest, 'the first move');
  assert.deepEqual(period, rest, 'the period opened');
  assert.equal(rest.sideways, 0);
  assert.deepEqual(errors, []);
});
