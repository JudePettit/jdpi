// Timeline of Progress (Natural Science): the curated seed, the built data (science/progress/data/events.json), the
// placement rules and the lake adapter. The page test runs when JDPI_URL is set (e.g. JDPI_URL=http://localhost:8787), and
// never with PRP_PAGES=0 (the refresh workflow's check before it commits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from '../science/scripts/progress-seed.mjs';
import { DISCIPLINE_IDS, BASIS, parseRef, nameMatches, yearOf, yearLabel, parsePoint, span, covers, distanceKm, choosePlace, eventInstitutions, seedProblems } from '../science/scripts/progress-lib.mjs';
import { progress, ADAPTERS } from '../lake/scripts/adapters.mjs';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = join(ROOT, 'science/progress/data/events.json');
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const QID = /^Q\d+$/;

test('seed: valid entries, unique ids, every discipline used as a main one', () => {
  assert.ok(SEED.length >= 300, `${SEED.length} entries`);
  for (const e of SEED) assert.deepEqual(seedProblems(e), [], e.id);
  assert.equal(new Set(SEED.map(e => e.id)).size, SEED.length);
  assert.deepEqual([...new Set(SEED.map(e => e.d.split(' ')[0]))].sort(), [...DISCIPLINE_IDS].sort());
});

test('data: compact, complete and consistent', () => {
  assert.ok(statSync(FILE).size < 1.5 * 1024 * 1024, 'events.json is under 1.5 MB');
  assert.deepEqual(data.disciplines.map(d => d.id), DISCIPLINE_IDS);
  assert.equal(data.firstYear, -3000);
  assert.ok(data.lastYear >= 2025);
  const ids = new Set(data.events.map(e => e.id));
  assert.equal(ids.size, data.events.length);
  for (const s of SEED) assert.ok(ids.has(s.id), `missing ${s.id}`);
  for (const e of data.events) {
    assert.ok(Number.isInteger(e.y) && e.y >= data.firstYear && e.y <= data.lastYear, e.id);
    assert.ok(e.d.length && e.d.every(d => DISCIPLINE_IDS.includes(d)), e.id);
    assert.ok(e.t && e.n, e.id);
    assert.ok(e.positionBasis in BASIS, `${e.id}: ${e.positionBasis}`);
    assert.ok(e.place.n && QID.test(e.place.q) && Math.abs(e.place.lat) <= 90 && Math.abs(e.place.lon) <= 180, e.id);
    if (e.q) assert.match(e.q, QID);
    for (const q of e.people) assert.ok(data.people[q], `${e.id}: person ${q}`);
    for (const q of e.inst) assert.ok(data.institutions[q], `${e.id}: institution ${q}`);
    if (e.via) assert.ok(e.people.includes(e.via), `${e.id}: via`);
  }
  for (const [q, p] of Object.entries(data.people)) {
    assert.match(q, QID);
    assert.ok(p.name, q);
    if (p.born != null && p.died != null && !p.approx) assert.ok(p.born <= p.died, `${q}: life`);
    for (const i of p.inst) assert.ok(data.institutions[i], `${q}: institution ${i}`);
  }
  for (const [q, i] of Object.entries(data.institutions)) { assert.match(q, QID); assert.ok(i.name && !QID.test(i.name), q); }
  // Most positions come from Wikidata facts rather than from the places set by hand.
  const byBasis = {};
  for (const e of data.events) byBasis[e.positionBasis] = (byBasis[e.positionBasis] || 0) + 1;
  assert.ok(((byBasis.curated || 0) + (byBasis.fallback || 0)) / data.events.length < 0.4, JSON.stringify(byBasis));
  assert.ok(data.events.filter(e => e.people.length).length > 450);
});

test('data: well-known breakthroughs sit where they happened', () => {
  const near = (id, lat, lon, km = 40) => {
    const e = data.events.find(x => x.id === id);
    assert.ok(distanceKm([e.place.lat, e.place.lon], [lat, lon]) < km, `${id}: ${e.place.n} (${e.positionBasis})`);
  };
  near('principia', 52.2, 0.12);            // Cambridge
  near('transistor', 40.68, -74.4);          // Bell Labs, Murray Hill
  near('graphene', 53.47, -2.23);            // Manchester
  near('general-relativity', 52.52, 13.4);   // Berlin
  near('higgs-boson', 46.23, 6.05);          // CERN
  near('insulin', 43.66, -79.4);             // Toronto
  near('barometer', 43.77, 11.25);           // Florence, not Torricelli's birthplace
  near('shors-algorithm', 40.68, -74.4);     // Bell Labs, not Shor's birthplace
  const newton = data.events.find(e => e.id === 'principia');
  assert.deepEqual(newton.people, ['Q935']);
  assert.equal(data.people.Q935.name, 'Isaac Newton');
});

test('lib: references, names, years and spans', () => {
  assert.deepEqual(parseRef('Q935 Isaac Newton'), { qid: 'Q935', name: 'Isaac Newton' });
  assert.deepEqual(parseRef('Isaac Newton'), { qid: null, name: 'Isaac Newton' });
  assert.ok(nameMatches('Al-Khwarizmi', ['Muhammad ibn Musa al-Khwarizmi']));
  assert.ok(nameMatches('Thebes, Egypt', ['Thebes']));
  assert.ok(nameMatches('Banu Musa', ['Banū Mūsā']));
  assert.ok(!nameMatches('Ted Hoff', ['Marcian Hoff']));
  assert.equal(yearOf('-0286-01-01T00:00:00Z'), -287);
  assert.deepEqual([yearLabel(-300), yearLabel(105), yearLabel(1687, true)], ['300 BC', 'AD 105', 'c. 1687']);
  assert.deepEqual(parsePoint('Point(0.1167 52.2)'), [52.2, 0.1167]);
  assert.equal(parsePoint('<http://www.wikidata.org/entity/Q405> Point(1 2)'), null);
  assert.deepEqual(span({ s: 1900 }, { born: 1870, died: 1920 }), [1900, 1920]);
  assert.ok(covers({ s: 1912, e: 1914 }, 1915, {}));
  assert.ok(!covers({ s: 1912, e: 1913 }, 1915, {}));
});

test('lib: choosePlace tries the rules in order, anchored by the hand-set place', () => {
  const P = {
    Qcam: { lat: 52.2, lon: 0.12, label: 'University of Cambridge', inst: true }, Qox: { lat: 51.75, lon: -1.25, label: 'University of Oxford', inst: true },
    Qman: { lat: 53.48, lon: -2.24, label: 'Manchester', inst: false }, Qbell: { lat: 40.68, lon: -74.4, label: 'Bell Labs', inst: true },
    Qnyc: { lat: 40.71, lon: -74.0, label: 'New York City', inst: false }, Qgrant: { lat: 52.91, lon: -0.64, label: 'Grantham', inst: false },
  };
  const place = q => P[q] || null;
  const got = r => [r.qid, r.basis];
  const newton = { qid: 'Qn', born: 1643, died: 1727, employer: [{ q: 'Qcam', s: 1669, e: 1701 }], birthplace: ['Qgrant'] };
  assert.deepEqual(got(choosePlace({ year: 1687, fb: 'Qcam' }, [newton], place)), ['Qcam', 'institution-at-time']);
  assert.deepEqual(got(choosePlace({ year: 1687, fb: 'Qcam', item: { qid: 'Qi', loc: ['Qox'] } }, [newton], place)), ['Qox', 'discovery']);
  assert.deepEqual(got(choosePlace({ year: 1687, fb: 'Qcam', at: 'Qman', item: { qid: 'Qi', loc: ['Qox'] } }, [newton], place)), ['Qman', 'curated']);
  // An undated post far from the hand-set place is skipped (Dalton was in Manchester, not Oxford).
  const dalton = { qid: 'Qd', born: 1766, died: 1844, employer: [{ q: 'Qox' }] };
  assert.deepEqual(got(choosePlace({ year: 1803, fb: 'Qman' }, [dalton], place)), ['Qman', 'fallback']);
  assert.deepEqual(got(choosePlace({ year: 1803 }, [dalton], place)), ['Qox', 'institution']);
  // An institution the discoverers shared wins over each one's own.
  const a = { qid: 'Qa', employer: [{ q: 'Qox' }, { q: 'Qbell' }] }, b = { qid: 'Qb', employer: [{ q: 'Qbell', s: 1945, e: 1951 }] };
  const shared = choosePlace({ year: 1947 }, [a, b], place);
  assert.deepEqual(got(shared), ['Qbell', 'shared-institution']);
  assert.deepEqual(eventInstitutions({ year: 1947 }, [a, b], place, shared), ['Qbell']);
  // A birthplace counts only in the same town as the hand-set place (New York is ~35 km from Bell Labs).
  const shor = { qid: 'Qs', born: 1959, birthplace: ['Qnyc'] };
  assert.deepEqual(got(choosePlace({ year: 1994, fb: 'Qbell' }, [shor], place)), ['Qbell', 'fallback']);
  assert.equal(choosePlace({ year: 1994 }, [shor], place).basis, 'birthplace');
  assert.equal(choosePlace({ year: 1994 }, [], place), null);
});

test('lake adapter: breakthroughs, scientists and institutions with deep links', () => {
  assert.equal(ADAPTERS.progress, progress);
  const m = progress({ jdpiDir: ROOT });
  const url = /^https:\/\/jdpi\.pages\.dev\/science\/progress\/index\.html#y=-?\d+&e=[a-z0-9-]+$/;
  for (const x of m) {
    assert.equal(x.module, 'progress');
    assert.match(x.url, url);
    assert.match(x.key.qid, QID);
    assert.ok(x.label && x.context, x.url);
  }
  const has = (x, f, v) => x.tags.some(([a, b]) => a === f && (v == null || b === v));
  assert.equal(m.filter(x => has(x, 'Event type', 'Scientific breakthrough')).length, data.events.filter(e => e.q).length);
  const sci = m.filter(x => has(x, 'Role', 'Scientist'));
  assert.equal(new Set(sci.map(x => x.key.qid)).size, Object.keys(data.people).length);
  assert.ok(sci.every(x => has(x, 'Discipline')));
  assert.ok(sci.filter(x => has(x, 'Institution')).length > sci.length / 2);
  assert.ok(new Set(m.filter(x => has(x, 'Role', 'Scientific institution')).map(x => x.key.qid)).size > 200);
  const newton = sci.find(x => x.key.qid === 'Q935' && x.url.endsWith('#y=1687&e=principia'));
  assert.ok(newton, 'Newton links to the Principia');
  assert.ok(has(newton, 'Discipline', 'Physics') && newton.tags.some(([f, v]) => f === 'Institution' && /Cambridge/.test(v)));
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: deep link, slider, discipline filter and tabs', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/science/progress/index.html#y=1687&e=principia`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('circle.dot', { timeout: 20000 });
  const card = await page.locator('#panel .card').innerText();
  assert.match(card, /Principia/);
  assert.match(card, /Isaac Newton/);
  assert.match(card, /University of Cambridge/);
  assert.equal(await page.locator('#panel .card [data-qid="Q935"]').count(), 1);
  assert.equal(await page.locator('#year-big').innerText(), '1687');
  assert.equal(await page.locator('circle.dot').count(), data.events.filter(e => e.y <= 1687).length);
  await page.locator('#year').fill('0');
  await page.locator('#year').dispatchEvent('input');
  assert.equal(await page.locator('#year-big').innerText(), '3000 BC');
  assert.match(page.url(), /#y=-3000(&|$)/);
  await page.keyboard.press('End');
  assert.equal(await page.locator('#year-big').innerText(), String(data.lastYear));
  await page.locator('.lg[data-d="math"]').dblclick();
  const maths = data.events.filter(e => e.d.includes('math')).length;
  assert.equal(await page.locator('circle.dot').count(), maths);
  assert.match(page.url(), /d=math/);
  await page.locator('#tab-list').click();
  assert.equal(await page.locator('#list-rows tr[data-e]').count(), maths);
  await page.locator('#tab-people').click();
  await page.waitForSelector('.sci');
  assert.ok(await page.locator('.sci').count() > 20);
  assert.match(page.url(), /v=scientists/);
  await browser.close();
  assert.deepEqual(errors, []);
});
