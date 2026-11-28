// Invention Timeline: no event moves to a wrong place at a refresh (the part "placing" of 28 November 2026).
//  - The rehearsal of the refresh of 2 December 2026 on that day's Wikidata moved the invention of dynamite (1867) from
//    Geesthacht, the seed's place, to Hamburg: Wikidata now gives Alfred Nobel (Q23810) seven work locations (P937), all
//    undated, and the undated work-location rule took Hamburg, 27 km away and within the 100 km the rules allow round
//    the seed's place. Wikipedia "Alfred Nobel" (revision 1388215578, read 28 November 2026): "From 1865 to 1873, Nobel
//    lived in Krümmel (now in the municipality of Geesthacht, near Hamburg)". The same weakness had placed five events
//    at a school or a city near the body the seed names (Neptune, hand washing, Pluto, francium, the atomic clock), which
//    the round before this one set by hand.
//  - The rule is mended at its source (progress-lib.mjs, choosePlace): the weak clues (a work location without dates,
//    where they studied, their birthplace) give way to the seed's place unless they agree with it, being that very
//    place, or lying within ANCHOR_KM_WEAK (10 km) of a seed place that is a town and not an institution. A dated clue
//    and a shared institution still come first; a main institution (undated) too, unless the seed's place is itself
//    another institution (the second readers of 28 November 2026: Nüsslein-Volhard's Tübingen beat the European
//    Molecular Biology Laboratory for 1980, Vine's East Anglia beat Cambridge for 1963). Measured on the committed cache
//    and on the cache of 28 November, that last step moves twelve cards to the body the seed names (the notes of this
//    part give each its source), and the moons of Mars (1877) are set by hand at the Old Naval Observatory, where the
//    rule had them and the seed's United States Naval Observatory stood until 1893. Within 10 km of a seed town is not
//    always within it: the inoculations of 1721 are set by hand in Boston, not at Harvard (Cambridge, Massachusetts).
//    Measured on the committed cache and on the cache of
//    28 November, it moves dynamite back to Geesthacht and, besides, Leonardo's anatomy (1510) from Milan to Pavia,
//    Titan and the pendulum clock (1655, 1656) from Leiden University to The Hague, Whittle's jet engine (1937) from
//    Coventry to Rugby, the Hubble constant (2001) from Pasadena to the Carnegie Observatories and vitamin B12 (1956)
//    from the town of Oxford to its university, each checked against a source (the notes of this part); and with the
//    five events' hand-set places taken away it places each of them where the round before set it by hand. It would
//    have moved Carnot's heat engines (1824) to the Lycée Charlemagne, his school as a boy, so that one is set by hand
//    in Paris (tests/science-progress.test.mjs).
//  - looksInstitutional did not count the Carnegie Institution for Science (Q1043963), which Wikidata labels "Carnegie
//    Science" and describes as a "non-profit organization in the USA" (read 28 November 2026), as an institution, so
//    Vera Rubin's card for the rotation curves (1970) lost it; "organization" (a whole word) and "non-profit" now count.
//    (Later the same day the seed set that event by hand at the Institution's Department of Terrestrial Magnetism,
//    Q30258396, as it had set RNA interference at the Department of Embryology: its place chip names the Institution
//    and the card lists no institution. tests/science-progress.test.mjs pins it.)
//  - Neptune's card (1846) listed the University of Paris, from Le Verrier's post there from 1847 (P108, Q209842):
//    covers() allows a year either side, which the placing rules need for loose dates, and eventInstitutions used it
//    for the card too. Besides the institution it is placed at, the card now lists only what a statement's own dates
//    allow in the year itself (27 entries in 25 events of the committed data whose statements lie wholly outside the
//    year; with the moves, 33 entries in 29 events: the notes of this part list them), and a school with only its start
//    date runs EDUCATION_YEARS, as in choosePlace (not Hawking's St Albans School, from 1952, for 1974). The institution
//    it is placed at is listed first, also when it is the place set by hand or the seed's fallback place; a person
//    (Robert Boyle, given as Hooke's employer) is not listed at all (build-progress.mjs).
//  - A pn a source edit leaves unused (pnVerdict's "held") was seen only in the run's log; events.json now lists them
//    (its pnHeld), so that the data a green refresh commits shows them.
//  - Wikidata gave van 't Hoff's death (Q102822, P570) as 1901 on 28 November 2026, against its own description
//    "(1852-1911)"; the seed's LIFE sets 1911 by hand, from Wikipedia (progress-seed.mjs names the revision).
//  - The verifier of 28 November 2026 found one of those twelve wrong: RNA interference (1998) went from Johns Hopkins
//    University in Baltimore to the Carnegie Institution (Q1043963), whose Wikidata coordinates are its headquarters in
//    Washington, D.C., 59 km away. The work was done at the Carnegie Institution of Washington's Department of
//    Embryology in Baltimore (Wikipedia "Andrew Fire", revision 1381483627: from 1986 to 2003 Fire was on the staff of
//    the "Carnegie Institution of Washington’s Department of Embryology in Baltimore", and the work on double-stranded
//    RNA was published while his group was there; the Nobel Foundation's biography of Fire, read the same day, has him
//    move to Baltimore in 1986 and to Stanford in 2003). The seed sets it by hand at Wikidata's item for the department
//    (Q30294630 "Department of Embryology", "facility in Baltimore, United States", P749 Q1043963, P625 39.33099,
//    -76.625012; revision 2474470841, read 28 November 2026), and its pn names whose department it was. Every other
//    case where the seed's institution beat a discoverer's main institution more than 10 km away was checked against a
//    source; on the data of that day's build a new one fails here until it is (a later refresh is not stopped by it).
// Rules are tested on fixtures; the built data by its shape; what a build of 28 November 2026 placed only while the data
// carries that day's stamp (tests/tools/as-built.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED, LIFE } from '../science/scripts/progress-seed.mjs';
import { BASIS, ANCHOR_KM, ANCHOR_KM_WEAK, parseRef, distanceKm, firstYear, looksInstitutional, choosePlace, eventInstitutions } from '../science/scripts/progress-lib.mjs';
import { builtOn } from './tools/as-built.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const data = JSON.parse(read('science/progress/data/events.json'));
const cache = JSON.parse(read('science/scripts/progress-cache.json'));
const src = read('science/scripts/build-progress.mjs');
// A top-level function of the script, as written there (it reads nothing but its arguments; the script runs its build
// when imported).
const fn = name => {
  const at = src.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, `build-progress.mjs has a function ${name}`);
  return new Function(`${src.slice(at + 1, src.indexOf('\n}\n', at) + 2)}; return ${name};`)();
};

// Fixture places (coordinates rounded from Wikidata's; inst: looksInstitutional of the label and description).
const PLACES = {
  Qobs: { label: 'Berlin Observatory', lat: 52.504, lon: 13.394, inst: true },
  Qberlin: { label: 'Berlin', lat: 52.52, lon: 13.405, inst: false },
  Qhu: { label: 'Humboldt University', lat: 52.518, lon: 13.393, inst: true },
  Qgeest: { label: 'Geesthacht', lat: 53.433, lon: 10.367, inst: false },
  Qhamburg: { label: 'Hamburg', lat: 53.55, lon: 10.0, inst: false },
  Qedin: { label: 'Edinburgh', lat: 55.953, lon: -3.189, inst: false },
  Qmerch: { label: 'Merchiston Tower', lat: 55.932, lon: -3.216, inst: false },
  Qrugby: { label: 'Rugby', lat: 52.371, lon: -1.262, inst: false },
  Qcov: { label: 'Coventry', lat: 52.408, lon: -1.51, inst: false },
  Qoxu: { label: 'University of Oxford', lat: 51.757, lon: -1.254, inst: true },
  Qox: { label: 'Oxford', lat: 51.752, lon: -1.258, inst: false },
  Qpot: { label: 'Astrophysical Observatory Potsdam', lat: 52.381, lon: 13.064, inst: true },
  Qparis: { label: 'University of Paris', lat: 48.849, lon: 2.345, inst: true },
  Qeth: { label: 'ETH Zurich', lat: 47.376, lon: 8.548, inst: true },
  Qembl: { label: 'European Molecular Biology Laboratory', lat: 49.385, lon: 8.71, inst: true },
  Qtueb: { label: 'University of Tübingen', lat: 48.524, lon: 9.06, inst: true },
  Qcam: { label: 'University of Cambridge', lat: 52.205, lon: 0.113, inst: true },
  Quea: { label: 'University of East Anglia', lat: 52.622, lon: 1.241, inst: true },
  Qstalb: { label: 'St Albans School', lat: 51.753, lon: -0.341, inst: true },
  Qlondon: { label: 'London', lat: 51.507, lon: -0.128, inst: false },
};
const place = q => PLACES[q] || null;
const km = (a, b) => distanceKm([PLACES[a].lat, PLACES[a].lon], [PLACES[b].lat, PLACES[b].lon]);
const pick = (event, people) => { const c = choosePlace(event, people, place); return c && [c.qid, c.basis]; };

test('the fixture distances are those the rule is about', () => {
  assert.ok(km('Qgeest', 'Qhamburg') > 20 && km('Qgeest', 'Qhamburg') < 100, 'Hamburg lies within reach of Geesthacht');
  assert.ok(km('Qrugby', 'Qcov') > ANCHOR_KM_WEAK && km('Qrugby', 'Qcov') < 20, 'Coventry is 18 km from Rugby');
  assert.ok(km('Qedin', 'Qmerch') < ANCHOR_KM_WEAK, 'Merchiston Tower is in Edinburgh');
  assert.ok(km('Qobs', 'Qberlin') < ANCHOR_KM_WEAK && km('Qobs', 'Qhu') < ANCHOR_KM_WEAK, 'the city and its university are beside the observatory');
});

test('choosePlace: a seed place that names the body where it was done keeps the event against a city, a school or a birthplace nearby', () => {
  // Neptune (1846) without its hand-set place: Galle's undated work location Berlin, where he studied, and his birthplace.
  const galle = { qid: 'Q76431', born: 1812, died: 1910, work: [{ q: 'Qberlin' }], educated: [{ q: 'Qhu' }], birthplace: ['Qhu'] };
  assert.deepEqual(pick({ year: 1846, fb: 'Qobs' }, [galle]), ['Qobs', 'fallback']);
  assert.deepEqual(pick({ year: 1846, fb: 'Qobs' }, [{ ...galle, work: [] }]), ['Qobs', 'fallback'], 'where he studied');
  assert.deepEqual(pick({ year: 1846, fb: 'Qobs' }, [{ ...galle, work: [], educated: [] }]), ['Qobs', 'fallback'], 'his birthplace');
  // A clue that is the seed's place itself still places it, by its own rule (vitamin B12, 1956: the University of Oxford).
  const hodgkin = { qid: 'Q7487', born: 1910, died: 1994, work: [{ q: 'Qox' }], educated: [{ q: 'Qoxu', s: 1928, e: 1932 }] };
  assert.deepEqual(pick({ year: 1956, fb: 'Qoxu' }, [hodgkin]), ['Qoxu', 'education']);
});

test('choosePlace: a seed town keeps the event against another town within reach, and gives way to a clue within it', () => {
  // Dynamite (1867): Nobel's undated work locations include Hamburg, 27 km from Geesthacht.
  const nobel = { qid: 'Q23810', born: 1833, died: 1896, work: [{ q: 'Qhamburg' }] };
  assert.deepEqual(pick({ year: 1867, fb: 'Qgeest' }, [nobel]), ['Qgeest', 'fallback']);
  // The jet engine (1937): Whittle's birthplace Coventry, 18 km from Rugby.
  assert.deepEqual(pick({ year: 1937, fb: 'Qrugby' }, [{ qid: 'Q312547', born: 1907, died: 1996, birthplace: ['Qcov'] }]), ['Qrugby', 'fallback']);
  // Logarithms (1614): Napier's Merchiston Tower, within Edinburgh, is more exact than the town.
  assert.deepEqual(pick({ year: 1614, fb: 'Qedin' }, [{ qid: 'Q295252', born: 1550, died: 1617, work: [{ q: 'Qmerch' }] }]), ['Qmerch', 'work-location']);
});

test('choosePlace: a dated clue, a shared institution and a main institution still come before the seed’s place', () => {
  // Potsdam is 23 km from the Berlin Observatory: within reach for these rules, not for the weak ones.
  const dated = { qid: 'Qa', born: 1850, died: 1920, employer: [{ q: 'Qpot', s: 1880, e: 1900 }] };
  assert.deepEqual(pick({ year: 1890, fb: 'Qobs' }, [dated]), ['Qpot', 'institution-at-time']);
  const datedWork = { qid: 'Qa', born: 1850, died: 1920, work: [{ q: 'Qpot', s: 1880, e: 1900 }] };
  assert.deepEqual(pick({ year: 1890, fb: 'Qobs' }, [datedWork]), ['Qpot', 'work-location']);
  // A main institution (undated) comes before a seed town within reach (Berlin, 24 km from Potsdam).
  const main = { qid: 'Qa', born: 1850, died: 1920, employer: [{ q: 'Qpot' }] };
  assert.deepEqual(pick({ year: 1890, fb: 'Qberlin' }, [main]), ['Qpot', 'institution']);
  const shared = [{ ...main, qid: 'Qa' }, { ...main, qid: 'Qb' }];
  assert.deepEqual(pick({ year: 1890, fb: 'Qobs' }, shared), ['Qpot', 'shared-institution']);
  // No seed place: the weak clues place it as before.
  assert.deepEqual(pick({ year: 1867 }, [{ qid: 'Q23810', born: 1833, died: 1896, work: [{ q: 'Qhamburg' }] }]), ['Qhamburg', 'work-location']);
});

test('choosePlace: a main institution gives way to a seed place that is itself another institution', () => {
  // The body-plan genes (1980): Nüsslein-Volhard's undated employers include Tübingen (her post from 1981, 99 km away)
  // and the EMBL, which the seed names; the EMBL is chosen, by the same rule.
  const cnv = { qid: 'Q77174', born: 1942, employer: [{ q: 'Qtueb' }, { q: 'Qembl' }] };
  assert.deepEqual(pick({ year: 1980, fb: 'Qembl' }, [cnv]), ['Qembl', 'institution']);
  // Sea-floor spreading (1963): Vine's undated employer East Anglia, 90 km from Cambridge, gives way to the seed's
  // Cambridge, where Matthews studied (so the education rule places it there, as the seed's place itself).
  const vine = { qid: 'Q948019', born: 1939, died: 1988, employer: [{ q: 'Quea' }] };
  const matthews = { qid: 'Q1261309', born: 1931, died: 1997, educated: [{ q: 'Qcam' }] };
  assert.deepEqual(pick({ year: 1963, fb: 'Qcam' }, [vine, matthews]), ['Qcam', 'education']);
  assert.deepEqual(pick({ year: 1963, fb: 'Qcam' }, [vine]), ['Qcam', 'fallback']);
  // Without a seed place, or with a seed town, the main institution places it as before.
  assert.deepEqual(pick({ year: 1963 }, [vine]), ['Quea', 'institution']);
  assert.deepEqual(pick({ year: 1980, fb: 'Qtueb' }, [cnv]), ['Qtueb', 'institution'], 'the seed’s place is the candidate');
});

test('looksInstitutional: a non-profit organisation counts; organisms and organisational words do not', () => {
  // Wikidata's label and description of Q1043963 as read on 28 November 2026 (the rule's own example, not a pin).
  assert.equal(looksInstitutional('Carnegie Science', 'non-profit organization in the USA'), true);
  assert.equal(looksInstitutional('Bureau des Longitudes', 'French scientific organization'), true);
  assert.equal(looksInstitutional('Some foundation', 'nonprofit in Ohio'), true);
  assert.equal(looksInstitutional('cell theory', 'theory that all living organisms are composed of cells'), false);
  assert.equal(looksInstitutional('Turing pattern', 'organizational pattern in chemistry'), false);
  assert.equal(looksInstitutional('Rugby', 'market town in Warwickshire, England'), false);
});

test('eventInstitutions: a card lists what a statement’s own dates allow in the year itself', () => {
  // Neptune (1846): Le Verrier's University of Paris post from 1847 is not on the card; Galle's observatory is.
  const leVerrier = { qid: 'Q104154', born: 1811, died: 1877, employer: [{ q: 'Qparis', s: 1847, e: 1854 }] };
  const galle = { qid: 'Q76431', born: 1812, died: 1910, employer: [{ q: 'Qobs', s: 1835, e: 1851 }] };
  const chosen = { qid: 'Qobs', basis: 'curated' };
  assert.deepEqual(eventInstitutions({ year: 1846 }, [leVerrier, galle], place, chosen), ['Qobs']);
  assert.deepEqual(eventInstitutions({ year: 1847 }, [leVerrier, galle], place, chosen), ['Qobs', 'Qparis'], 'in 1847 it is');
  // General relativity (1915): ETH Zurich to 1914 is not; the Berlin university from 1914 is.
  const einstein = { qid: 'Q937', born: 1879, died: 1955, employer: [{ q: 'Qeth', s: 1912, e: 1914 }, { q: 'Qhu', s: 1914, e: 1933 }] };
  assert.deepEqual(eventInstitutions({ year: 1915 }, [einstein], place, null), ['Qhu']);
  // A statement with only its start is listed from that year on (span() runs it on, as before).
  assert.deepEqual(eventInstitutions({ year: 1915 }, [{ ...einstein, employer: [{ q: 'Qeth', s: 1912 }] }], place, null), ['Qeth']);
});

test('eventInstitutions: a school with only its start runs EDUCATION_YEARS, as in choosePlace', () => {
  // Hawking radiation (1974): Hawking's St Albans School has only its start (P69 from 1952) in Wikidata.
  const hawking = { qid: 'Q17714', born: 1942, died: 2018, educated: [{ q: 'Qstalb', s: 1952 }] };
  assert.deepEqual(eventInstitutions({ year: 1974 }, [hawking], place, null), []);
  assert.deepEqual(eventInstitutions({ year: 1958 }, [hawking], place, null), ['Qstalb'], 'within eight years it is');
  // A post with only its start still runs on (40 years).
  assert.deepEqual(eventInstitutions({ year: 1974 }, [{ ...hawking, educated: [], employer: [{ q: 'Qcam', s: 1962 }] }], place, null), ['Qcam']);
});

test('eventInstitutions: the card lists the institution it is placed at, first, whatever the rule; not a town or a birthplace', () => {
  const nobody = { qid: 'Qa', born: 1900, died: 1990 };
  // Placed by hand, or at the seed's fallback place, when that place is an institution (the EMBL for 1980).
  assert.deepEqual(eventInstitutions({ year: 1980 }, [nobody], place, { qid: 'Qembl', basis: 'fallback' }), ['Qembl']);
  assert.deepEqual(eventInstitutions({ year: 1980 }, [nobody], place, { qid: 'Qembl', basis: 'curated' }), ['Qembl']);
  assert.deepEqual(eventInstitutions({ year: 1980 }, [nobody], place, { qid: 'Qembl', basis: 'discovery' }), ['Qembl']);
  assert.deepEqual(eventInstitutions({ year: 1980 }, [nobody], place, { qid: 'Qberlin', basis: 'fallback' }), [], 'a town');
  assert.deepEqual(eventInstitutions({ year: 1980 }, [nobody], place, { qid: 'Qhu', basis: 'birthplace' }), [], 'a birthplace');
  // The education rule's school is listed, being where the card says it was done, though the studies lie before the year
  // (the page says so: "the institution it is placed at and those its discoverers belonged to in that year").
  const hutton = { qid: 'Q295321', born: 1726, died: 1797, educated: [{ q: 'Qedin', s: 1740, e: 1746 }] };
  assert.deepEqual(eventInstitutions({ year: 1785 }, [hutton], place, { qid: 'Qoxu', basis: 'education' }), ['Qoxu']);
});

test('BASIS and the page: the fallback and the method say what the rule does', () => {
  assert.match(BASIS.fallback, /^Place set by hand \(Wikidata gives the discoverers no dated institution near it, nor a more exact place\)$/);
  assert.deepEqual(data.basis, BASIS, 'the data carries the rule’s words');
  const page = read('science/progress/index.html').replace(/\s+/g, ' ');
  assert.ok(page.includes('their main institution, unless the place set by hand for the breakthrough is another institution;'), 'Method: the main institution');
  assert.ok(page.includes('then a work location without dates, where they studied or their birthplace, but only if it is the place set by hand for the breakthrough or lies within 10 km of the town that place names; and finally that place set by hand, which may be approximate.'), 'Method: the weak clues');
  assert.equal(ANCHOR_KM_WEAK, 10, 'the page’s 10 km is the rule’s');
  // "where Wikidata describes that place as one": a facility set by hand (the Carnegie Institution's two departments,
  // for rna-interference and rotation-curves, as Wikidata described them on 28 November 2026) is not listed as the
  // place's institution, and its place chip carries the Institution's name.
  assert.ok(page.includes('a card lists the institution it is placed at (where Wikidata describes that place as one) and those its discoverers belonged to in that year, by Wikidata’s dates.'), 'Method: the card’s institutions');});

test('build: a person is not listed among a card’s institutions', () => {
  assert.match(src, /eventInstitutions\(ev, models, place, chosen\)\.filter\(q => label\(q\) && !has\(q, 'P31', HUMAN\)\)/);
  // The built data, by its shape: no card lists an item the cache describes as a human (Q5), such as Robert Boyle
  // (Q43393), given by Wikidata as Hooke's employer.
  const human = q => (cache.items[q]?.c?.P31 || []).some(s => s.q === 'Q5');
  assert.deepEqual(data.events.flatMap(e => e.inst.filter(human).map(q => `${e.id}: ${q}`)), []);
});

test('LIFE: a life date set by hand, where Wikidata’s is wrong, is the one the page shows', () => {
  // Wikidata's P570 for van 't Hoff read 1901 on 28 November 2026; Wikipedia gives 1 March 1911 (the seed names the
  // revision). Held to the seed's own entry, not to what Wikidata says today.
  assert.equal(LIFE.Q102822?.died, 1911);
  for (const [q, fix] of Object.entries(LIFE)) {
    assert.ok(Object.keys(fix).length && Object.keys(fix).every(k => ['born', 'died'].includes(k) && Number.isInteger(fix[k])), q);
    for (const k of Object.keys(fix)) if (data.people[q]) assert.equal(data.people[q][k], fix[k], `${q} ${k}`);
  }
  assert.ok(data.people.Q102822, 'van ’t Hoff is on the page (tetrahedral-carbon)');
  assert.match(src, /const lifeYear = \(q, p, minPrecision = 0\) => LIFE\[q\]\?\.\[LIFE_KEY\[p\]\] \?\? yearOf\(q, p, minPrecision\);/);
  assert.match(src, /born: lifeYear\(q, 'P569'\), died: lifeYear\(q, 'P570'\)/, 'the placing rules use it too');
});

test('heldEntries: one entry per held pn, sorted, with the seed’s pn, where the event is placed and why', () => {
  const heldEntries = fn('heldEntries');
  const seed = new Map([['neptune', { id: 'neptune', pn: 'Q152087 Frederick William University Berlin' }], ['a', { id: 'a', pn: 'Q1 Old name' }]]);
  const placed = new Map([['neptune', { q: 'Q64', n: 'Berlin' }], ['a', { q: 'Q2', n: 'New' }]]);
  assert.deepEqual(heldEntries({ neptune: 'Q152087', a: 'Q1' }, { neptune: 'why n', a: 'why a' }, seed, placed), [
    { id: 'a', pn: 'Q1 Old name', placed: { q: 'Q2', n: 'New' }, why: 'why a' },
    { id: 'neptune', pn: 'Q152087 Frederick William University Berlin', placed: { q: 'Q64', n: 'Berlin' }, why: 'why n' },
  ]);
  assert.deepEqual(heldEntries({}, {}, seed, placed), []);
  assert.match(src, /pnHeld: heldEntries\(pnHeld, heldWhy, seedById, /, 'events.json carries them');
});

test('data: pnHeld lists the pns this build held, as the cache records them', () => {
  assert.ok(Array.isArray(data.pnHeld), 'events.json has a pnHeld list (empty when none is held)');
  const ids = data.pnHeld.map(h => h.id);
  assert.deepEqual(ids, [...new Set(ids)].sort(), 'one entry per event, sorted');
  assert.deepEqual(ids, Object.keys(cache.pnHeld || {}).sort(), 'the same events as the cache’s pnHeld, which the same build wrote');
  for (const h of data.pnHeld) {
    const s = SEED.find(e => e.id === h.id), ev = data.events.find(e => e.id === h.id);
    assert.ok(s?.pn, `${h.id}: a seed event with a pn`);
    assert.equal(h.pn, s.pn, h.id);
    assert.equal(cache.pnHeld[h.id], parseRef(s.pn).qid, h.id);
    assert.deepEqual(h.placed, ev.place, h.id);
    assert.notEqual(h.placed.q, parseRef(s.pn).qid, `${h.id}: held, so placed elsewhere`);
    assert.ok(typeof h.why === 'string' && h.why.length > 20, h.id);
  }
});

// Reading the cache as the build does (build-progress.mjs: coordOf, founding).
const claimsOf = (q, p) => cache.items[q]?.c?.[p] || [];
const coordOf = (q, hop = 0) => {
  const it = cache.items[q];
  if (!it || it.missing) return null;
  const ll = claimsOf(q, 'P625').filter(s => s.ll), own = ll.find(s => s.preferred) || ll[0];
  if (own) return own.ll;
  if (hop) return null;
  for (const p of ['P159', 'P276', 'P131']) for (const s of claimsOf(q, p)) { const c = s.q && coordOf(s.q, 1); if (c) return c; }
  return null;
};
const foundedIn = q => { const ys = claimsOf(q, 'P571').filter(s => s.y != null).map(firstYear).filter(y => y != null); return ys.length ? Math.min(...ys) : null; };
const seedQ = raw => { if (!raw) return null; const r = parseRef(raw); return r.qid || cache.titles[r.name]?.q || null; };

test('rna-interference: placed by hand at the Carnegie Institution of Washington’s Department of Embryology, in Baltimore, not at the headquarters in Washington', () => {
  // Sources in the header: Wikipedia "Andrew Fire" (revision 1381483627) and Wikidata Q30294630 (revision 2474470841).
  const s = SEED.find(e => e.id === 'rna-interference'), e = data.events.find(x => x.id === 'rna-interference');
  assert.equal(parseRef(s.at).qid, 'Q30294630', 'the seed sets the department by hand');
  assert.deepEqual(parseRef(s.pn), { qid: 'Q30294630', name: 'Carnegie Institution of Washington’s Department of Embryology' },
    'the pn says whose department it is, by the name the sources give it (a bare "Department of Embryology" does not)');
  assert.deepEqual([e.place.q, e.place.n, e.positionBasis], ['Q30294630', parseRef(s.pn).name, 'curated']);
  // The dot is in Baltimore, beside Johns Hopkins University (Wikipedia "Carnegie Institution for Science", revision
  // 1373604630: the Department of Embryology was "located on the Johns Hopkins University campus in Baltimore"), and
  // not at the Carnegie Institution's own coordinates, its headquarters in Washington, D.C.
  // The coordinates and the card's institutions come from Wikidata as the build read it, so they are checked only on
  // the data built on 28 November 2026 (tests/tools/as-built.mjs); the seed's values above hold whatever the day.
  if (builtOn(data.generated, '2026-11-28')) {
    const dot = [e.place.lat, e.place.lon];
    assert.ok(distanceKm(dot, coordOf('Q193727')) < 5, `${distanceKm(dot, coordOf('Q193727')).toFixed(1)} km from Johns Hopkins University`);
    assert.ok(distanceKm(dot, coordOf('Q1043963')) > 50, 'not at the headquarters in Washington');
    // The card does not list the Carnegie Institution under its name of today (Wikidata's label of Q1043963 read
    // "Carnegie Science" on 28 November 2026) for 1998. The department is not listed either: Wikidata's description
    // ("facility") does not read as an institution, and a listing would add "now Department of Embryology", which is
    // not its name today (Wikipedia "Carnegie Institution for Science", revision 1373604630: the life sciences were
    // "historically housed under departments" and are now in the Biosphere Sciences & Engineering division).
    assert.ok(!e.inst.includes('Q1043963'), 'no Carnegie Science on the card for 1998');
  }
  for (const q of e.inst) assert.notEqual(data.institutions[q]?.name, 'Carnegie Science', q);
});

test('where the seed’s institution beat a discoverer’s main institution more than 10 km away, each case is one checked against a source', t => {
  // The cases are worked out from Wikidata as the build of 28 November 2026 read it (employers, their dates, coordinates
  // and founding dates), so a source edit alone can add one. The list is checked only on that build's data
  // (tests/tools/as-built.mjs): it catches a change to the rule or the seed in a build made that day, and does not stop
  // a monthly refresh. After a build by hand on another day, set that day here and check the list again.
  if (!builtOn(data.generated, '2026-11-28')) return t.skip(`events.json was built on ${String(data.generated).slice(0, 10)}, not by the build this list was checked against`);
  // The rule's step for a main institution (choosePlace, agreesMain) lets an institution the seed names beat an undated
  // main institution within ANCHOR_KM. That is right where the seed names the body the work was done at, and wrong where
  // Wikidata gives that body the coordinates of a headquarters or a parent elsewhere (rna-interference, above). Listed
  // here: every event not set by hand whose dot is the seed's institution while a discoverer's main institution that
  // the rule could have taken (undated at one end at least, not ruled out by its own dates, founded by the year, within
  // ANCHOR_KM of the seed's place) lies more than 10 km from the dot. A new one fails until it is checked and added.
  const CHECKED = {
    // Wikipedia "Theodore Maiman" (revision 1385296544, read 28 November 2026): "On May 16, 1960, at Hughes' Malibu,
    // California, laboratories". HRL Laboratories' own coordinates are at Malibu; Hughes Aircraft's are Culver City.
    laser: 'Q5635801',
    // Wikipedia "Vine–Matthews–Morley hypothesis" (revision 1375293480): "Vine and his PhD adviser at Cambridge
    // University, Drummond Hoyle Matthews, were first to publish the theory in September 1963". Not East Anglia.
    'seafloor-spreading': 'Q35794',
    // Wikipedia "Christiane Nüsslein-Volhard" (revision 1386060292): "In 1978, she set up her own lab in the newly
    // founded European Molecular Biology Laboratory in Heidelberg", and published in October 1980. Not Tübingen.
    'body-plan-genes': 'Q695267',
    // Wikipedia "Sagittarius A*" (revision 1386869430): "On October 16, 2002, an international team led by Reinhard
    // Genzel at the Max Planck Institute for Extraterrestrial Physics reported". Not LMU Munich.
    'sagittarius-a-star': 'Q822371',
    // Wikipedia "Induced pluripotent stem cell" (revision 1382035102): "first generated by Shinya Yamanaka and Kazutoshi
    // Takahashi at Kyoto University, Japan, in 2006". Not the Nara Institute of Science and Technology.
    'ips-cells': 'Q336264',
  };
  const DATED = ['shared-institution', 'institution-at-time'];
  const found = {};
  for (const e of data.events) {
    const s = SEED.find(x => x.id === e.id), fb = seedQ(s.fb);
    if (s.at || e.place.q !== fb || DATED.includes(e.positionBasis)) continue;
    if (!looksInstitutional(cache.items[fb]?.l, cache.items[fb]?.d)) continue;
    const anchor = coordOf(fb), dot = [e.place.lat, e.place.lon];
    const beaten = e.people.flatMap(p => ['P108', 'P1416'].flatMap(k => claimsOf(p, k))).filter(st => st.q && st.q !== fb
      && !(st.s != null && st.e != null) && !(st.s != null && st.s > e.y + 1) && !(st.e != null && st.e < e.y - 1)
      && coordOf(st.q) && !(foundedIn(st.q) > e.y) && distanceKm(coordOf(st.q), anchor) <= ANCHOR_KM && distanceKm(coordOf(st.q), dot) > 10);
    if (beaten.length) found[e.id] = e.place.q;
  }
  for (const [id, q] of Object.entries(found)) assert.equal(CHECKED[id], q, `${id}: the seed's institution ${q} beat a main institution more than 10 km away; check it against a source`);
  assert.ok(!found['rna-interference'], 'rna-interference is set by hand');
});

test('as built on 28 November 2026: where the rule now places the events it moved', t => {
  if (!builtOn(data.generated, '2026-11-28')) return t.skip(`events.json was built on ${String(data.generated).slice(0, 10)}, not by the build this describes`);
  const ev = id => data.events.find(e => e.id === id);
  const at = { 'leonardo-anatomy': 'Q6259', 'titan-rings': 'Q36600', 'pendulum-clock': 'Q36600', 'jet-engine': 'Q623765', 'hubble-constant': 'Q30255594', 'vitamin-b12': 'Q34433' };
  // A main institution that gave way to the body the seed names (the notes of this part give each its source).
  const main = { 'electrolysis-metals': 'Q2171086', 'galaxy-redshifts': 'Q466895', hela: 'Q1472068', 'hydrogen-line': 'Q13371', laser: 'Q5635801',
    'seafloor-spreading': 'Q35794', 'sanger-sequencing': 'Q185800', 'body-plan-genes': 'Q695267', 'cosmic-inflation': 'Q915217',
    dolly: 'Q1633976', 'sagittarius-a-star': 'Q822371' };
  for (const [id, q] of Object.entries({ ...at, ...main })) assert.equal(ev(id).place.q, q, `${id}: ${ev(id).place.n}`);
  for (const [id, q] of Object.entries(main)) assert.equal(ev(id).inst[0], q, `${id}: the card lists where it is placed first`);
  assert.ok(!ev('neptune').inst.includes('Q209842'), 'Neptune’s card: no University of Paris');
  assert.ok(!ev('general-relativity').inst.includes('Q11942'), 'general relativity’s card: no ETH Zurich');
  assert.ok(!ev('hawking-radiation').inst.includes('Q7592283'), 'Hawking radiation’s card: no St Albans School');
  assert.ok(!ev('micrographia').inst.includes('Q43393'), 'Micrographia’s card: not Robert Boyle');
});
