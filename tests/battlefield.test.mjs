// Realtime and Retrospective Battlefield: the history build's names and places, then the pages (against JDPI_URL,
// default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { actors, stateName, interstateName, parties } from '../battlefield/scripts/ucdp.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const HISTORY = JSON.parse(readFileSync(new URL('../battlefield/history/data/wars.json', import.meta.url), 'utf8'));
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

async function open(path) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { browser, page, errors };
}

test('Realtime: live view lists extant wars and plots events; a war opens its briefing', async () => {
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

test('Realtime: archive view shows a month with an insight per war', async () => {
  const { browser, page, errors } = await open('q/battlefield?view=archive&month=2026-03');
  await page.waitForSelector('.arow', { timeout: 20000 });
  const month = await page.locator('#month').inputValue();
  const rows = await page.locator('.arow').count();
  const first = await page.locator('.arow p').first().innerText();
  await browser.close();
  assert.equal(month, '2026-03');
  assert.ok(rows >= 10, `rows: ${rows}`);
  assert.match(first, /^March: .* events, about .* deaths/);
  assert.deepEqual(errors, []);
});

test('Retrospective: 1939 shows World War II; 2025 shows dozens of conflicts', async () => {
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

test('Retrospective: 2003 shades Iraq at war and its invaders as fighting abroad; 1942 shows the war in North Africa and the Pacific', async () => {
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
