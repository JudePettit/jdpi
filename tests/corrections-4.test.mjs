// Build 4 of ChatGPT's confirmed page faults (vm-workflows/chatgpt-taskmaster/CONFIRMED.md, 25 November 2026): the
// Invention Timeline's places, names and titles (progress-4 to progress-11). Here: the placing rules in
// progress-lib.mjs, and the cards on the page. The checks on the built data (science/progress/data/events.json) are in
// tests/science-progress.test.mjs, which the monthly refresh runs before it commits new data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePlace, eventInstitutions, firstYear } from '../science/scripts/progress-lib.mjs';
import { pageTest, launch } from './tools/pages.mjs';

const got = r => [r.qid, r.basis];

test('progress-4: a place founded after the year is not where the discoverer worked then', () => {
  const P = {
    Quzh: { lat: 47.37, lon: 8.55, label: 'University of Zurich', inst: true, founded: 1833 },
    Qzh: { lat: 47.37, lon: 8.54, label: 'Zurich', inst: false },
  };
  const place = q => P[q] || null;
  const gessner = { qid: 'Qg', born: 1516, died: 1565, employer: [{ q: 'Quzh' }], birthplace: ['Qzh'] };
  assert.deepEqual(got(choosePlace({ year: 1551, fb: 'Qzh' }, [gessner], place)), ['Qzh', 'birthplace']);
  // Founded before the year, it still counts.
  assert.deepEqual(got(choosePlace({ year: 1900, fb: 'Qzh' }, [gessner], place)), ['Quzh', 'institution']);
});

test('progress-4: the undated rules drop a statement whose own dates rule out the year', () => {
  const P = {
    Qtur: { lat: 45.07, lon: 7.69, label: 'University of Turin', inst: true },
    Qver: { lat: 45.32, lon: 8.42, label: 'Vercelli', inst: false },
    Qhague: { lat: 52.08, lon: 4.31, label: 'The Hague', inst: false },
    Qams: { lat: 52.37, lon: 4.89, label: 'Amsterdam', inst: false },
    Qsch: { lat: 45.3, lon: 8.4, label: 'Liceo di Vercelli', inst: true },
  };
  const place = q => P[q] || null;
  // Avogadro, 1811: his Turin chair began in 1820 (Wikidata employer 1820-1850), so the seed's Vercelli stands.
  const avogadro = { qid: 'Qa', born: 1776, died: 1856, employer: [{ q: 'Qtur', s: 1820, e: 1850 }] };
  assert.deepEqual(got(choosePlace({ year: 1811, fb: 'Qver' }, [avogadro], place)), ['Qver', 'fallback']);
  // A work location dated only to other years is dropped; an undated one stays.
  const worker = { qid: 'Qw', born: 1686, died: 1736, work: [{ q: 'Qams', s: 1702, e: 1706 }, { q: 'Qhague' }] };
  assert.deepEqual(got(choosePlace({ year: 1730 }, [worker], place)), ['Qhague', 'work-location']);
  // A school entered after the year is not where the discoverer studied.
  const pupil = { qid: 'Qp', born: 1776, educated: [{ q: 'Qsch', s: 1830 }] };
  assert.equal(choosePlace({ year: 1811, fb: 'Qver' }, [pupil], place).basis, 'fallback');
  // Only explicit dates count: a post given only its end (Hawking's Cambridge, ending 2018) still counts for 1974.
  P.Qcam = { lat: 52.2, lon: 0.12, label: 'University of Cambridge', inst: true };
  assert.deepEqual(got(choosePlace({ year: 1974 }, [{ qid: 'Qh', born: 1942, died: 2018, employer: [{ q: 'Qcam', e: 2018 }] }], place)), ['Qcam', 'institution']);
});

test('progress-4: the card’s institutions leave out a place founded after the year', () => {
  // Ehrlich, 1909: Wikidata lists Berlin (dated) and Goethe University Frankfurt (founded 1914) around the year.
  const P = {
    Qber: { lat: 52.5, lon: 13.4, label: 'Frederick William University Berlin', inst: true, founded: 1828 },
    Qffm: { lat: 50.1, lon: 8.7, label: 'Goethe University Frankfurt', inst: true, founded: 1914 },
    Qffc: { lat: 50.1, lon: 8.68, label: 'Frankfurt', inst: false },
  };
  const place = q => P[q] || null;
  const ehrlich = { qid: 'Qe', born: 1854, died: 1915, employer: [{ q: 'Qber', s: 1887, e: 1915 }, { q: 'Qffm', s: 1904, e: 1915 }] };
  const chosen = { qid: 'Qffc', basis: 'work-location' };
  assert.deepEqual(eventInstitutions({ year: 1909 }, [ehrlich], place, chosen), ['Qber']);
  assert.deepEqual(eventInstitutions({ year: 1915 }, [ehrlich], place, chosen), ['Qber', 'Qffm']);
});

test('progress-4: a founding date given to the century or decade counts from its first year', () => {
  assert.equal(firstYear({ y: 1600, pr: 7 }), 1501);   // "16th century"
  assert.equal(firstYear({ y: 1835, pr: 8 }), 1830);   // "1830s"
  assert.equal(firstYear({ y: 1809, pr: 11 }), 1809);  // a full date
  assert.equal(firstYear({ y: 1809 }), 1809);
});

// The page shows the corrected names on the cards (runs when JDPI_URL is set, never with PRP_PAGES=0).
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: the cards show the corrected names and title', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const card = async (y, id) => {
    await page.goto('about:blank');
    await page.goto(`${BASE}/science/progress/index.html#y=${y}&e=${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#panel .card', { timeout: 20000 });
    return page.locator('#panel .card').innerText();
  };
  let c = await card(1842, 'doppler-effect');
  assert.match(c, /Christian Doppler(?!r)/);
  c = await card(1789, 'traite-elementaire');
  assert.match(c, /Marie-Anne Paulze Lavoisier/);
  c = await card(1608, 'telescope');
  assert.match(c, /Lipperhey seeks a patent for the telescope/);
  assert.match(c, /Hans Lipperhey/);
  c = await card(1854, 'boolean-algebra');
  assert.match(c, /Queen's College Cork/);
  c = await card(1040, 'movable-type');
  assert.doesNotMatch(c, /People's Republic of China/);
  c = await card(1816, 'stethoscope');
  assert.match(c, /Necker Hospital/);
  c = await card(1909, 'salvarsan');
  assert.doesNotMatch(c, /Goethe University Frankfurt/);
  assert.deepEqual(errors, []);
});
