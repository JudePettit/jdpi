// Political Calendar (Realtime and Historical): the pipeline's news classifier and Wikipedia parsers, the built data,
// and the page (event types, month jump, year view, country highlighting) running against JDPI_URL.
//   node --test tests/calendar.test.mjs                                   (page tests against https://jdpi.pages.dev)
//   JDPI_URL=http://localhost:8787 node --test tests/calendar.test.mjs    (page tests against a local server)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { classify, headline, parseDay, eventsFromItems } from '../calendar/scripts/current-events.mjs';
import { countryOf, countryInText, normaliseCountry } from '../calendar/scripts/countries.mjs';
import { parseDate, eventsFromList, referendumsFromCalendar } from '../calendar/scripts/wiki-lists.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const TYPES = ['election', 'referendum', 'party', 'leader', 'inauguration', 'resignation', 'coup', 'conflict', 'ceasefire', 'assassination', 'crisis', 'protest', 'treaty', 'summit', 'sanctions', 'vote', 'court'];
const NEW_TYPES = ['referendum', 'summit', 'vote', 'court', 'resignation', 'protest', 'ceasefire', 'sanctions', 'party', 'inauguration'];
const DATA = ['1980s', '1990s', '2000s', '2010s', '2020s'].map(d => JSON.parse(readFileSync(new URL(`../calendar/data/${d}.json`, import.meta.url), 'utf8')));
const ALL = DATA.flatMap(d => d.events);
const GENERATED = DATA.map(d => d.generated).sort().at(-1).slice(0, 10);
const shiftMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

// A Current events item as parseDay() returns it.
const item = (text, category = 'Politics and elections', topics = [], links = []) =>
  ({ date: '2026-05-14', category, topics: topics.map(t => ({ text: t, links: [t] })), text, links: links.map(t => ({ target: t, label: t })), refs: [] });
const typeOf = (...a) => classify(item(...a))?.type ?? null;

test('news classifier: each new type, and the near-misses it must not take', () => {
  assert.equal(typeOf('Latvian prime minister Evika Siliņa resigns one day after losing her majority in the Saeima.'), 'resignation');
  assert.equal(typeOf('Thousands of people march through Madrid, Spain, demanding the resignation of prime minister Pedro Sánchez.'), 'protest');
  assert.equal(typeOf('The Parliament of Romania votes 281–4 to pass a motion of no confidence against prime minister Ilie Bolojan.'), 'vote');
  assert.equal(typeOf('Philippine vice president Sara Duterte is impeached by the House of Representatives for the second time.'), 'vote');
  assert.equal(typeOf('The parliament of South Korea approves a supplementary budget worth ₩26.2 trillion.', 'Business and economy'), 'vote');
  assert.equal(typeOf('The Supreme Court of the United States rules 6–3 that the executive order violates the 14th Amendment.', 'Law and crime'), 'court');
  assert.equal(typeOf('The International Criminal Court unseals arrest warrants for two Taliban ministers.', 'Law and crime'), 'court');
  assert.notEqual(typeOf('The South Carolina Supreme Court overturns the sentence of Alex Murdaugh.', 'Law and crime'), 'court');
  assert.equal(typeOf('Former Supreme Court justice Louise Arbour is sworn in as the 31st Governor General of Canada.'), 'inauguration');
  assert.equal(typeOf('Laura Fernández Delgado is sworn in as president of Costa Rica, succeeding Rodrigo Chaves Robles.'), 'inauguration');
  assert.equal(typeOf('The president-elect will take office on 19 August.'), null);
  assert.equal(typeOf('Lebanon inaugurates its second international airport.', 'Business and economy'), null);
  assert.equal(typeOf('Bolivian police clash with protesting miners in La Paz.', 'Politics and elections', ['2026 Bolivian protests']), 'protest');
  assert.equal(typeOf('Iranian missiles strike Doha.', 'Politics and elections', ['2026 Iranian strikes on Qatar']), null);
  assert.equal(typeOf('U.S. president Donald Trump announces that Israel and Lebanon have agreed to a 10-day ceasefire.', 'Armed conflicts and attacks'), 'ceasefire');
  assert.equal(typeOf('Several universities in Islamabad will shift to online classes amidst a potential second round of talks between Iran and the U.S.', 'Armed conflicts and attacks'), null);
  assert.equal(typeOf('The Council of the European Union approves the 22nd package of sanctions against Russia.', 'International relations'), 'sanctions');
  assert.equal(typeOf('Hotel operator Archipelago International ends management agreements for six hotels in Cuba, citing compliance with United States sanctions.', 'Business and economy'), null);
  assert.notEqual(typeOf('Mexican president Claudia Sheinbaum sanctions a constitutional amendment on dual citizenship.', 'Law and crime'), 'sanctions');
  assert.equal(typeOf('Former South Korean prime minister Kim Min-seok is elected as the new leader of the Democratic Party.'), 'party');
  assert.notEqual(typeOf('The Brazilian National Congress overrides a veto by president Luiz Inácio Lula da Silva.'), 'party');
  assert.equal(typeOf('The 8th European Political Community Summit is held in Yerevan, Armenia.', 'International relations'), 'summit');
  assert.equal(typeOf('Nepalese Sherpa Kami Rita reaches the summit of Mount Everest for a 32nd time.', 'Sports'), null);
  assert.equal(typeOf('Two giant pandas arrive at Zoo Atlanta as part of an agreement signed during Xi Jinping\'s state visit to the United States.', 'International relations', ['Panda diplomacy']), null);
  assert.equal(typeOf('Swiss voters reject an initiative that proposed a stricter form of Swiss neutrality.', 'Politics and elections', ['2026 Swiss referendums']), 'referendum');
  assert.notEqual(typeOf('A Canadian judge rules that Elections Alberta improperly approved a petition seeking a referendum on independence.'), 'referendum');
});

test('news headlines keep the main clause; countries come from links, demonyms and places', () => {
  const t = 'In Australia, Victorian premier Jacinta Allan resigns, triggering a leadership spill.';
  assert.equal(headline(t, t.indexOf('resigns'), t.indexOf('resigns') + 7), 'Victorian premier Jacinta Allan resigns');
  const c = 'The entire cabinet of Equatorial Guinea, led by prime minister Manuel Osa Nsue Nsua, resigns after reaching under 10% of its targets.';
  assert.equal(headline(c, c.indexOf('resigns'), c.indexOf('resigns') + 7), 'The entire cabinet of Equatorial Guinea, led by prime minister Manuel Osa Nsue Nsua, resigns');
  assert.equal(countryOf({ text: 'Latvian prime minister Evika Siliņa resigns.' }), 'Latvia');
  assert.equal(countryOf({ links: ['Supreme Court of Japan', 'Unification Church'], text: 'The Supreme Court of Japan upholds the order.' }), 'Japan');
  assert.equal(countryInText('two Uzbekistan-based cotton plants'), 'Uzbekistan');
  assert.equal(countryInText('Latin American leaders meet'), null);
  assert.equal(normaliseCountry("People's Republic of China"), 'China');
  assert.equal(normaliseCountry('Lithuanian Soviet Socialist Republic'), 'Lithuania');
  assert.equal(normaliseCountry('Republika Srpska'), 'Bosnia and Herzegovina');
  assert.equal(normaliseCountry('Soviet Union / Russia'), 'Soviet Union / Russia');
});

test('Current events pages parse into items under their story; one story is thinned to its main moments', () => {
  const wikitext = `{{Current events|year=2026|month=5|day=14}}
'''Politics and elections'''
*[[2026 Bolivian protests]]
**Bolivian police clash with protesting miners in [[La Paz]]. [https://example.com/a (''Reuters'')]
*[[Evika Siliņa|Latvian prime minister Evika Siliņa]] resigns. [https://example.com/b (BBC)]`;
  const items = parseDay('2026-05-14', wikitext);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].topics.map(t => t.text), ['2026 Bolivian protests']);
  assert.equal(items[0].refs[0].outlet, 'Reuters');
  const at = (date, text) => ({ ...items[0], date, text });
  const events = eventsFromItems([at('2026-05-14', items[0].text), at('2026-05-17', 'Protesters march again in La Paz.'), at('2026-05-30', 'Protesters march again in La Paz.'), { ...items[1] }]);
  assert.deepEqual(events.filter(e => e.type === 'protest').map(e => e.date), ['2026-05-14', '2026-05-30']);
  const protest = events.find(e => e.type === 'protest');
  assert.equal(protest.title, '2026 Bolivian protests');
  assert.equal(protest.ref, 'https://example.com/a');
  assert.equal(events.find(e => e.type === 'resignation')?.country, 'Latvia');
});

test('Wikipedia lists: dates, summit tables and electoral calendars', () => {
  assert.deepEqual(parseDate('14–15 December 2026'), { date: '2026-12-14', precision: 'day' });
  assert.deepEqual(parseDate('November 18 – 19, 2026'), { date: '2026-11-18', precision: 'day' });
  assert.deepEqual(parseDate('7–8 July', 2026), { date: '2026-07-07', precision: 'day' });
  assert.deepEqual(parseDate('{{start and end dates|2026|11|9|2026|11|20|df=y}}'), { date: '2026-11-09', precision: 'day' });
  assert.deepEqual(parseDate('April 2027'), { date: '2027-04-01', precision: 'month' });
  assert.equal(parseDate('{{TBA|{{Abbr|TBD|To be determined}}}}', 2027), null);
  const nato = `{| class="wikitable"
|-
! scope="row" | [[2026 Ankara NATO summit|2026]]
| 7–8 July || {{flag|Turkey}} || [[Ankara]]
|-
! scope="row" | [[2027 Albania NATO summit|2027]]
| {{TBA|{{Abbr|TBD|To be determined}}}} || {{flag|Albania}} || [[Tirana]]
|}`;
  const summits = eventsFromList(nato, { article: 'NATO summit', link: /NATO summit/, today: '2026-10-28' });
  assert.deepEqual(summits.map(e => [e.date, e.country, e.title, e.type]), [['2026-07-07', 'Turkey', '2026 Ankara NATO summit', 'summit']]);
  const euco = `{| class="wikitable"
|-
! 262
! rowspan="2" |2026
!26-27 November
|Extraordinary (MFF)
| rowspan="2" |{{flagu|Ireland}}
|[https://www.consilium.europa.eu/en/meetings/european-council/2026/11/26-27/ Website]
|-
! 263
!17 December
|Scheduled
|[https://www.consilium.europa.eu/en/meetings/european-council/2026/12/17/ Website]
|}`;
  const meetings = eventsFromList(euco, { article: 'List of European Council meetings', title: 'European Council meeting', country: 'European Union', today: '2026-10-28' });
  assert.deepEqual(meetings.map(e => [e.date, e.title, e.status]), [['2026-11-26', 'European Council meeting (extraordinary)', 'declared'], ['2026-12-17', 'European Council meeting', 'declared']]);
  assert.match(meetings[0].summary, /Council presidency: Ireland/);
  const calendar = `==December==
* 9 December: [[Elections in Fiji|Fiji]], [[2026 Fijian constitutional referendum|Constitutional referendum]]
* 13 December: [[Elections in Chile|Chile]], [[2026 Chilean election|President]]`;
  assert.deepEqual(referendumsFromCalendar(calendar, 2026).map(e => [e.date, e.country, e.title]), [['2026-12-09', 'Fiji', '2026 Fijian constitutional referendum']]);
});

test('calendar data: seventeen types, clean records, the new types in the last six months, the outlook and the archive', () => {
  for (const e of ALL) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, JSON.stringify(e));
    assert.ok(TYPES.includes(e.type), `unknown type ${e.type}`);
    assert.ok(['declared', 'tentative'].includes(e.status), `status ${e.status}`);
    assert.ok(e.title && e.country, JSON.stringify(e));
    assert.ok(!/�/.test(e.title), `broken character in ${e.title}`);
    if (e.ref) assert.ok(/^https?:\/\//.test(e.ref) && e.summary, `news item without its report or text: ${e.title}`);
  }
  assert.equal(new Set(ALL.map(e => e.date + '|' + e.title)).size, ALL.length, 'one record per date and title');
  const count = (list, t) => list.filter(e => e.type === t).length;
  const past = ALL.filter(e => e.date >= shiftMonths(GENERATED, -6) && e.date <= GENERATED);
  const ahead = ALL.filter(e => e.date > GENERATED && e.date <= shiftMonths(GENERATED, 18));
  const archive = ALL.filter(e => e.date < '2026-01-01');
  for (const t of NEW_TYPES) assert.ok(count(past, t) >= 1, `${t} in the last six months: ${count(past, t)}`);
  for (const t of ['summit', 'referendum']) assert.ok(count(ahead, t) >= 1, `${t} in the 18-month outlook: ${count(ahead, t)}`);
  for (const t of NEW_TYPES) assert.ok(count(archive, t) >= 1, `${t} before 2026: ${count(archive, t)}`);
  // Existing types keep their history.
  for (const t of ['election', 'leader', 'coup', 'conflict', 'assassination', 'crisis', 'treaty']) assert.ok(count(archive, t) >= 50, `${t} before 2026: ${count(archive, t)}`);
});

// ---- the page --------------------------------------------------------------------------------------------------
async function withPage(fn, { width = 1300, dark = false } = {}) {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await fn(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('Historical Calendar: Feb 2022 shows the invasion of Ukraine; highlighting and the year view work', async () => {
  await withPage(async page => {
    await page.goto(`${BASE}/q/calendar.html?period=2020s&month=2022-02`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.eventrow', { timeout: 20000 });
    const feb = await page.locator('#eventrows').innerText();
    const filters = await page.locator('#filters .filter').count();
    const title = await page.locator('#hero-title').innerText();
    const suite = await page.evaluate(() => document.documentElement.dataset.suite);
    // "See more" opens the event's full plain-text account in a pop-out.
    await page.locator('#eventrows .eventrow', { hasText: 'Russia launches full-scale invasion' }).locator('[data-more]').click();
    await page.waitForFunction(() => document.querySelectorAll('#modal-body p').length > 2, null, { timeout: 15000 });
    const modalText = await page.locator('#modal-body').innerText();
    await page.click('#modal-close');
    await page.fill('#countrypick', 'Ukraine');
    await page.click('#countryadd');
    const countries = new Set(await page.locator('.eventcountry').allInnerTexts().then(t => t.map(x => x.split(' · ')[0])));
    await page.click('.viewbtn[data-view=year]');
    const months = await page.locator('.ymonth').count();
    assert.match(feb, /Russia launches full-scale invasion of Ukraine/);
    assert.equal(title, 'Historical Calendar');
    assert.equal(suite, 'rs');
    assert.ok(modalText.length > 200, `pop-out text: ${modalText.length} chars`);
    assert.equal(filters, TYPES.length + 1);
    assert.deepEqual([...countries], ['Ukraine']);
    assert.equal(months, 12);
    assert.match(page.url(), /countries=Ukraine/);
  });
});

// A month in the realtime window with both resignations and court rulings, from the data the server should be serving.
const MONTH = (() => {
  const from = shiftMonths(GENERATED, -6), by = new Map();
  for (const e of ALL) if (e.date >= from && e.date <= GENERATED && (e.type === 'resignation' || e.type === 'court')) {
    const m = e.date.slice(0, 7), x = by.get(m) || by.set(m, { resignation: 0, court: 0 }).get(m);
    x[e.type]++;
  }
  return [...by].filter(([, x]) => x.resignation && x.court).sort((a, b) => (b[1].resignation + b[1].court) - (a[1].resignation + a[1].court))[0]?.[0];
})();

test('Realtime Calendar: type chips count, filter (one or several), link and legend the new event types', async () => {
  assert.ok(MONTH, 'a month with resignations and court rulings in the last six months');
  await withPage(async page => {
    await page.goto(`${BASE}/q/calendar.html?period=contemporary&month=${MONTH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.eventrow', { timeout: 20000 });
    const chips = await page.locator('#filters .filter').allInnerTexts();
    for (const label of ['Referendums', 'Summits & state visits', 'Parliamentary votes', 'Court rulings', 'Resignations', 'Protests & strikes', 'Ceasefires & peace talks', 'Sanctions', 'Party contests & congresses', 'Inaugurations & swearing-in'])
      assert.ok(chips.some(c => c.startsWith(label)), `chip ${label}`);
    // Every chip pairs a coloured, shaped mark with the type's name and a count.
    assert.ok(chips.every(c => /\d$/.test(c.trim())), chips.join(' | '));
    assert.equal(await page.locator('#filters .filter:not([data-filter=all]) .eventdot').count(), TYPES.length);
    const tags = async () => new Set((await page.locator('#eventrows .eventrow > .tag').allInnerTexts()).map(t => t.trim().toLowerCase()));
    await page.click('#filters .filter[data-filter=resignation]');
    assert.deepEqual([...await tags()], ['resignation']);
    assert.match(page.url(), /types=resignation/);
    assert.equal(await page.getAttribute('#filters .filter[data-filter=resignation]', 'aria-pressed'), 'true');
    await page.click('#filters .filter[data-filter=court]');
    assert.deepEqual([...await tags()].sort(), ['court ruling', 'resignation']);
    assert.match(page.url(), /types=resignation%2Ccourt|types=resignation,court/);
    const legend = await page.locator('#legend-types').innerText();
    assert.match(legend, /Resignations/);
    assert.match(legend, /Court rulings/);
    const tooltip = await page.locator('.day[role=button]').first().getAttribute('title');
    assert.match(tooltip, /\((?:Resignation|Court ruling)\)/);
    await page.click('#filters .filter[data-filter=all]');
    assert.ok((await tags()).size > 2, 'All events shows every type again');
    assert.doesNotMatch(page.url(), /types=/);
    // A news item's pop-out names the report it comes from.
    const news = page.locator('#eventrows .eventrow', { hasText: /resigns/i }).first();
    await news.locator('[data-more]').click();
    await page.waitForSelector('#modal:not([hidden])');
    assert.match(await page.locator('#modal-meta').innerText(), /RESIGNATION|Resignation/);
    await page.click('#modal-close');
  });
});

test('Realtime Calendar: ?types= opens with those types; marks take the categorical colours in light and dark', async () => {
  const colour = async page => page.locator('#filters .filter[data-filter=court] .eventdot').evaluate(el => getComputedStyle(el).backgroundColor);
  let light, dark;
  await withPage(async page => {
    await page.goto(`${BASE}/q/calendar.html?period=contemporary&month=${MONTH}&types=court`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.eventrow', { timeout: 20000 });
    assert.deepEqual([...new Set(await page.locator('#eventrows .eventrow > .tag').allInnerTexts())].map(t => t.trim().toLowerCase()), ['court ruling']);
    light = await colour(page);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    dark = await colour(page);
  });
  assert.ok(light && dark && light !== dark, `court mark: light ${light}, dark ${dark}`);
});

test('Realtime Calendar fits a phone: no horizontal scroll at 360px', async () => {
  await withPage(async page => {
    await page.goto(`${BASE}/q/calendar.html?period=contemporary&month=${MONTH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#filters .filter', { timeout: 20000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  }, { width: 360 });
});
