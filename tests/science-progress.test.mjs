// Invention Timeline (Natural Science): the curated seed, the built data (science/progress/data/events.json), the
// placement rules and the lake adapter. The page test runs when JDPI_URL is set (e.g. JDPI_URL=http://localhost:8787), and
// never with PRP_PAGES=0 (the refresh workflow's check before it commits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from '../science/scripts/progress-seed.mjs';
import { DISCIPLINE_IDS, BASIS, parseRef, nameMatches, yearOf, yearLabel, parsePoint, span, covers, EDUCATION_YEARS, distanceKm, firstYear, choosePlace, eventInstitutions, seedProblems } from '../science/scripts/progress-lib.mjs';
import { progress, ADAPTERS } from '../lake/scripts/adapters.mjs';
import { pageTest, launch } from './tools/pages.mjs';
import { builtOn } from './tools/as-built.mjs';

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
  // A school with only a start year is not "the institution at the time" twenty years on (Hawking: St Albans School
  // from 1952, Hawking radiation in 1974; ChatGPT's review, ledger RV-05): his university is.
  P.Qsch = { lat: 51.75, lon: -0.34, label: 'St Albans School', inst: true };
  const hawking = { qid: 'Qh', born: 1942, died: 2018, educated: [{ q: 'Qsch', s: 1952 }], employer: [{ q: 'Qcam', e: 2018 }] };
  assert.deepEqual(got(choosePlace({ year: 1974 }, [hawking], place)), ['Qcam', 'institution']);
  assert.ok(!covers({ s: 1952 }, 1974, { born: 1942 }, EDUCATION_YEARS) && covers({ s: 1952 }, 1958, { born: 1942 }, EDUCATION_YEARS));
  // A doctoral student at the time still counts there.
  assert.deepEqual(got(choosePlace({ year: 1965 }, [{ ...hawking, educated: [{ q: 'Qcam', s: 1962 }], employer: [] }], place)), ['Qcam', 'institution-at-time']);
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

// ---- The corrections of build 4 of ChatGPT's confirmed page faults (vm-workflows/chatgpt-taskmaster/CONFIRMED.md,
// progress-4 to progress-11, 25 November 2026), checked on the built data here so that the monthly refresh
// (progress-refresh.yml, which runs this file before it commits) fails rather than commit data that loses them.
// The placing rules themselves are tested in tests/corrections-4.test.mjs.
const cache = JSON.parse(readFileSync(join(ROOT, 'science/scripts/progress-cache.json'), 'utf8'));
const ev = id => { const e = data.events.find(x => x.id === id); assert.ok(e, `no event ${id}`); return e; };
// The earliest inception Wikidata gives for a place, by the build's own rule (firstYear in progress-lib.mjs).
const founded = q => { const ys = (cache.items[q]?.c?.P571 || []).filter(s => s.y != null).map(firstYear).filter(y => y != null); return ys.length ? Math.min(...ys) : null; };

test('progress-4: no breakthrough placed through its discoverer sits at a place founded after its year', () => {
  // Only the rules that go through the people: a site, a place set by hand or a fallback town may carry a later
  // municipal or refounding date (Saqqara, the Pantheon, Cheongju) and is right all the same.
  const PERSON = ['shared-institution', 'institution-at-time', 'institution', 'work-location', 'education', 'birthplace'];
  const bad = data.events.filter(e => PERSON.includes(e.positionBasis) && founded(e.place.q) != null && founded(e.place.q) > e.y)
    .map(e => `${e.y} ${e.id}: ${e.place.n} (founded ${founded(e.place.q)})`);
  assert.deepEqual(bad, []);
  assert.equal(ev('historiae-animalium').place.n, 'Zurich');          // not the University of Zurich (1833)
  assert.notEqual(ev('mauveine').place.q, 'Q189022');                 // not Imperial College London (1907)
  assert.notEqual(ev('brocas-area').place.n, 'École pratique des hautes études'); // founded 1868
  assert.notEqual(ev('avogadro').place.n, 'University of Turin');      // his chair there from 1820
});

test('progress-4: no card lists an institution founded after its year', () => {
  // Goethe University Frankfurt (1914) for Salvarsan in 1909, the University of Palermo (1806) for Ceres in 1801.
  const bad = data.events.flatMap(e => e.inst.filter(q => founded(q) != null && founded(q) > e.y)
    .map(q => `${e.y} ${e.id}: ${data.institutions[q]?.name || q} (founded ${founded(q)})`));
  assert.deepEqual(bad, []);
});

test('progress-4 and progress-5: places set by hand where Wikidata’s facts would mislead', () => {
  const AT = {
    'tycho-supernova': 'Q1335155',   // Herrevad Abbey, not Uraniborg (1576)
    'haber-process': 'Q1040',        // Karlsruhe, not BASF
    'lac-operon': 'Q391083',         // Institut Pasteur, not the Collège de France (Jacob from 1964)
    'difference-engine': 'Q84',      // London, not Cambridge (Babbage's post 1827-1839)
    'de-motu-cordis': 'Q164946',     // St Bartholomew's Hospital, not Oxford
    'fraunhofer-lines': 'Q503628',   // Benediktbeuern, not LMU Munich
    'daguerreotype': 'Q90',          // Paris, not Cormeilles-en-Parisis
    'lovelace-notes': 'Q84',         // London, not Cambridge
    'antiseptic-surgery': 'Q5566905',// Glasgow Royal Infirmary, not Edinburgh
    'phonograph': 'Q20657326',       // Menlo Park, not Cooper Union
    'rocket-equation': 'Q2837',      // Kaluga, not Borovsk
    'optical-fibre': 'Q852729',      // Harlow, not Imperial College
    'pulsars': 'Q2402680',           // Mullard Radio Astronomy Observatory, not her college
    'rotation-curves': 'Q1043963',   // the Carnegie Institution, not Georgetown
    'ct-scanner': 'Q678138',         // Hayes, not Cambridge
    'artemisinin': 'Q1073814',       // the Academy of Traditional Chinese Medicine, not Peking University
    'stm': 'Q1474431',               // IBM's Zurich laboratory, not ETH Zurich
    'prions': 'Q1061104',            // UCSF, not Berkeley
    'pcr': 'Q5065711',               // Cetus Corporation (Emeryville), not Berkeley
    'cobe': 'Q52152', 'jwst': 'Q52152', // Goddard Space Flight Center, not the University of Maryland
    'vitruvius': 'Q220',             // Rome, not Italy or the Roman Republic
    'ice-age': 'Q69345',             // Neuchâtel, where Agassiz spoke in July 1837
    // Danzig: Wikipedia "Daniel Gabriel Fahrenheit": he "began experimenting with mercury thermometers in 1713" while
    // living there (1712-1714), and "In 1714, Fahrenheit left Danzig for Berlin and Dresden". Not The Hague (from 1736).
    'fahrenheit': 'Q1792',
    // Wikipedia "Stethoscope": invented "in 1816 by René Laennec at the Necker-Enfants Malades Hospital in Paris". Not
    // the Paris Medical Faculty (an undated Wikidata post: he was made professor of medicine only in 1823).
    'stethoscope': 'Q3145188',
    // Paris, where he died in 1832; not the École Normale Supérieure, which expelled him from 4 January 1831
    // (Wikipedia "Évariste Galois"; Wikidata's dated P69 ends in 1830).
    'galois-theory': 'Q90',
    // Wikipedia "Discovery of penicillin": "While working at St Mary's Hospital, London, in 1928". Not Imperial College
    // (Fleming's undated Wikidata employer).
    'penicillin': 'Q3495342',
    // Wikipedia "Streptomycin": first isolated on 19 October 1943 by Schatz in Waksman's laboratory at Rutgers
    // University. Not Temple University (Schatz's undated Wikidata employer, a later post).
    'streptomycin': 'Q499451',
    // Wikipedia "Discovery of Neptune" (revision 1387592462, read 28 November 2026): the planet was confirmed "at the
    // Berlin Observatory", by Galle; Wikidata's item for the discovery (Q1356165) gives its location (P276) as the Berlin
    // Observatory (Q698950). Not the university Galle had studied at, nor Berlin as one of his undated work places
    // (added to Wikidata on 13 November 2026), where the rules through the people placed it.
    'neptune': 'Q698950',
    // Where the seed's fallback place already named the body the work was done at, but the education rule placed the
    // event at a school nearby (the second readers of 28 November 2026; each article read once that day):
    // Wikipedia "Ignaz Semmelweis" (revision 1383434529): in 1847 he proposed hand washing "at Vienna General Hospital's
    // First Obstetrical Clinic". Not the University of Vienna.
    'handwashing': 'Q180080',
    // Wikipedia "Pluto" (revision 1387738753): the observatory's director gave the search to Tombaugh, who had just
    // arrived at the observatory (Lowell Observatory, Flagstaff), and he found the moving object in February 1930. Not
    // Northern Arizona University, under a name the college did not then bear.
    'pluto': 'Q466895',
    // Wikipedia "Francium" (revision 1385825504): discovered on 7 January 1939 "by Marguerite Perey of the Curie
    // Institute in Paris"; Wikipedia "Curie Institute (Paris)" (revision 1383501461): the Institut du Radium, founded
    // in 1909, merged with the Fondation Curie in 1970 to become the Institut Curie, so the seed's pn names it the Radium
    // Institute for 1939. Not the University of Paris.
    'francium': 'Q2451973',
    // Wikipedia "Atomic clock" (revision 1386411903): the first practical caesium clock "was built at the National
    // Physical Laboratory in the United Kingdom in 1955 by Louis Essen". Not the University of London.
    'atomic-clock': 'Q1967606',
    // Wikipedia "Nicolas Léonard Sadi Carnot" (revision 1379960021, read 28 November 2026): in Paris he attended
    // lectures at the Sorbonne and the Collège de France, and his Reflections were "published at his own expense in
    // June 1824". Not the Lycée Charlemagne, where he prepared for the École polytechnique as a boy, nor the École
    // polytechnique (1812-1814), whose Wikidata place is its campus at Palaiseau.
    'carnot-cycle': 'Q90',
    // Wikipedia "Zabdiel Boylston" (revision 1356032392, read 28 November 2026): "During a smallpox outbreak in 1721 in
    // Boston, Boylston inoculated" his son and two enslaved men. Not Harvard University, in Cambridge, Massachusetts,
    // 5 km from Boston (an undated place of study), where the education rule placed it.
    'variolation-boston': 'Q100',
    // Wikipedia "Old Naval Observatory" (revision 1372951816, read 28 November 2026): it "is where the United States
    // Naval Observatory was located from 1844 to 1893", and "It was with this telescope that the Moons of Mars were
    // discovered by Asaph Hall in 1877". The seed's fallback names the observatory as a body, whose Wikidata item stands
    // at its site of today.
    'moons-of-mars': 'Q1570896',
    // Wikipedia "Andrew Fire" (revision 1381483627, read 28 November 2026): from 1986 to 2003 he was on the staff of the
    // "Carnegie Institution of Washington’s Department of Embryology in Baltimore", where the work on double-stranded
    // RNA was done. Wikidata's Q30294630 is that department, in Baltimore (revision 2474470841). Not the Carnegie
    // Institution's item, whose coordinates are its headquarters in Washington, D.C., 59 km away, where the seed's
    // institution had placed it (tests/follow-placing.test.mjs), nor Johns Hopkins University, his adjunct post.
    'rna-interference': 'Q30294630',
  };
  for (const [id, q] of Object.entries(AT)) {
    assert.equal(ev(id).place.q, q, `${id}: ${ev(id).place.n}`);
    assert.equal(ev(id).positionBasis, 'curated', id);
  }
  assert.ok(Object.keys(AT).every(id => SEED.find(s => s.id === id).at), 'each is set by hand in the seed');
});

test('progress-6: people are named as the seed spells them where the Wikidata label is not their Wikipedia title', () => {
  assert.equal(data.people.Q7229.name, 'Marie-Anne Paulze Lavoisier');
  assert.equal(data.people.Q84284.name, 'Christian Doppler');
  assert.equal(data.people.Q76468.name, 'Hans Lipperhey');
  assert.equal(data.people.Q139518.name, 'Zacharias Janssen');
  assert.equal(data.people.Q935.name, 'Isaac Newton');
  // A label that is the person's Wikipedia title stays, whatever the seed's spelling.
  assert.equal(data.people.Q234357.name, 'Stanisław Ulam');
  assert.equal(data.people.Q157250.name, 'Harry Kroto');
  assert.equal(data.people.Q494615.name, 'Chang Yŏngsil');
  assert.equal(data.people.Q6209774.name, 'Joe Farman');
  assert.deepEqual(Object.values(data.people).map(p => p.name).filter(n => /\(|\)/.test(n)), [], 'no disambiguator such as "(physicist)"');
});

test('progress-7: the Chinese breakthroughs of 850, 1040 and 1637 are in China, not the People’s Republic', () => {
  for (const id of ['gunpowder', 'movable-type', 'tiangong-kaiwu']) assert.deepEqual([ev(id).place.q, ev(id).place.n], ['Q29520', 'China'], id);
  assert.deepEqual(data.events.filter(e => e.y < 1949 && e.place.q === 'Q148').map(e => e.id), []);
  assert.equal(ev('vitruvius').place.n, 'Rome');
});

// The Friedrich Wilhelm University from 1828 until its closure in 1945; reopened in 1946 as the University of Berlin;
// Humboldt University from 1949 (Wikipedia "Humboldt University of Berlin", revision 1388386551, read 28 November
// 2026); written as the page already names Q20266330, its 1828 Wikidata item. Which events Wikidata's facts place at
// Q152087 changes with its edits (Neptune left it in the rehearsal of 28 November 2026, when Galle's work places had
// been added), so the rule is tested, not a count: on a fixture, and on the built data whatever it holds. Problems,
// one line each: an event there from 1828 to 1945 not under that name, one from 1949 not under the lookup's (today's)
// name, and one before 1828 or from 1946 to 1948, for which VM has set no name of the time.
const FWU = 'Frederick William University Berlin';
const berlinNames = d => d.events.filter(e => e.place.q === 'Q152087').flatMap(e => {
  const want = e.y < 1828 || (e.y >= 1946 && e.y < 1949) ? null : e.y < 1946 ? FWU : d.institutions.Q152087?.name;
  return want && e.place.n === want ? [] : [`${e.y} ${e.id}: “${e.place.n}”, not ${want ? `“${want}”` : 'a name VM has set'}`];
});
// Every seed pn is the name its event is shown under whenever the build places the event at the pn's item.
const pnNames = (d, seed) => seed.filter(s => s.pn).flatMap(s => {
  const { qid, name } = parseRef(s.pn), e = d.events.find(x => x.id === s.id);
  return e && e.place.q === qid && e.place.n !== name ? [`${s.id}: at ${qid} as “${e.place.n}”, not its pn “${name}”`] : [];
});
test('progress-8: the names of the time, by rule (a fixture)', () => {
  const fixture = { institutions: { Q152087: { name: 'Humboldt-Universität zu Berlin' } }, events: [
    { id: 'a', y: 1846, place: { q: 'Q152087', n: FWU } },
    { id: 'b', y: 1882, place: { q: 'Q152087', n: 'Humboldt-Universität zu Berlin' } }, // today's name for the year
    { id: 'c', y: 2016, place: { q: 'Q152087', n: FWU } },                               // the old name after 1949
    { id: 'd', y: 2016, place: { q: 'Q152087', n: 'Humboldt-Universität zu Berlin' } },
    { id: 'e', y: 1815, place: { q: 'Q152087', n: FWU } },                               // before the name was given
    { id: 'f', y: 1846, place: { q: 'Q64', n: 'Berlin' } },                              // elsewhere: not this rule's
    { id: 'g', y: 1945, place: { q: 'Q152087', n: FWU } },                               // the year of its closure
    { id: 'h', y: 1947, place: { q: 'Q152087', n: FWU } }] };                            // the University of Berlin then
  assert.deepEqual(berlinNames(fixture), ['1882 b: “Humboldt-Universität zu Berlin”, not “Frederick William University Berlin”',
    '2016 c: “Frederick William University Berlin”, not “Humboldt-Universität zu Berlin”', '1815 e: “Frederick William University Berlin”, not a name VM has set',
    '1947 h: “Frederick William University Berlin”, not a name VM has set']);
  const seed = [{ id: 'a', pn: `Q152087 ${FWU}` }, { id: 'b', pn: `Q152087 ${FWU}` }, { id: 'f', pn: `Q152087 ${FWU}` }];
  assert.deepEqual(pnNames(fixture, seed), [`b: at Q152087 as “Humboldt-Universität zu Berlin”, not its pn “${FWU}”`]);
});

test('progress-8: institutions and places under the names they had in the year', async t => {
  // Placed through their people, so where Wikidata's facts lead each month: under the name of the year whenever they are
  // at the pn's item (pnNames, below), as they were in the build of 26 November 2026.
  for (const [id, then] of [['boolean-algebra', 'Queen\'s College Cork'],   // University College Cork from 1908
    ['weather-fronts', 'Geophysical Institute, Bergen']]) {                 // the University of Bergen from 1946
    const pn = parseRef(SEED.find(s => s.id === id).pn);
    assert.equal(pn.name, then, `${id}: the seed's name of the time`);
    if (ev(id).place.q === pn.qid) assert.equal(ev(id).place.n, then, id);
  }
  // Placed by the seed itself (a place set by hand, or the fallback of an event with no people), so pinned outright.
  assert.equal(ev('reusable-rocket').place.n, 'Cape Canaveral Air Force Station');  // Space Force Station from December 2020
  assert.equal(ev('fahrenheit').place.n, 'Danzig');                                 // the name his Wikipedia article uses
  assert.equal(ev('stethoscope').place.n, 'Necker Hospital');                       // merged with the Enfants Malades in 1920
  assert.equal(ev('artemisinin').place.n, 'Academy of Traditional Chinese Medicine'); // renamed in 1985 and 2005
  assert.equal(ev('rotation-curves').place.n, 'Carnegie Institution of Washington');  // Carnegie Institution for Science from 2007
  assert.equal(ev('stm').place.n, 'IBM Zurich Research Laboratory');                 // later IBM Research – Zurich
  assert.equal(ev('francium').place.n, 'Radium Institute');                          // the Institut Curie from 1970
  assert.deepEqual(pnNames(data, SEED), [], 'every pn shown where its event is placed at its item');
  await t.test('Q152087 under its name of the year, on the built data', st => {
    const there = data.events.filter(e => e.place.q === 'Q152087');
    if (!there.length) { st.skip('Wikidata\'s facts place no event at Q152087 in this build: nothing to check (the fixture proves the rule)'); return; }
    assert.deepEqual(berlinNames(data), []);
  });
  // The seed's name agrees with the lookup's name for Q20266330, Wikidata's label: held to the reads that gave it
  // (its cache date; "Frederick William University Berlin" as read on 28 October and on 28 November 2026).
  const read20266330 = cache.items.Q20266330?.t;
  if (builtOn(read20266330, '2026-10-28') || builtOn(read20266330, '2026-11-28')) assert.equal(data.institutions.Q20266330?.name, FWU);
  assert.notEqual(ev('michelson-morley').place.q, 'Q1047060');                     // not Case Western Reserve (1967)
  assert.notEqual(ev('pulsars').place.q, 'Q1195404');                              // not Murray Edwards College (New Hall until 2008)
});

test('progress-9 to progress-11: titles and the year that match the linked articles', () => {
  assert.equal(ev('telescope').t, 'Lipperhey seeks a patent for the telescope'); // the States General did not award it
  assert.deepEqual([ev('ice-age').y, ev('ice-age').t], [1837, 'Agassiz proposes an ice age']); // Neuchâtel, July 1837
  assert.equal(ev('tcp-ip').t, 'Cerf and Kahn design a protocol to join networks'); // TCP and IP split only in 1978
  assert.ok(!data.events.some(e => /^The telescope is patented$|^TCP\/IP joins/.test(e.t)));
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: deep link, slider, discipline filter and tabs', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch();
  t.after(() => browser.close()); // a failed assertion must not leave the browser open (the run would hang)
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
  // The period's start handle: from 1900 to the end, in the address, the KPI and the map; it cannot pass the end
  // handle, and pulling the end handle back past it brings it along. (The slider's stops are single years from 1800,
  // so 1900's position counts back from the last stop; app.js's state is module-scoped, so the page is read as a user sees it.)
  const at1900 = +(await page.locator('#from').getAttribute('max')) - (data.lastYear - 1900);
  await page.locator('#from').fill(String(at1900));
  await page.locator('#from').dispatchEvent('input');
  assert.match(page.url(), /#y=\d+&f=1900(&|$)/);
  assert.equal(await page.locator('#year-big').innerText(), `1900–${data.lastYear}`);
  assert.equal((await page.locator('#year-label').textContent()).trim(), 'Period'); // textContent: the CSS upper-cases it
  assert.equal(await page.locator('circle.dot').count(), data.events.filter(e => e.y >= 1900).length);
  await page.keyboard.press('Escape'); // closes Principia's card, so the panel shows the period
  assert.match(await page.locator('#panel .side-title').innerText(), new RegExp(`^1900 to ${data.lastYear}$`));
  await page.locator('#year').fill(String(at1900 - 20));
  await page.locator('#year').dispatchEvent('input');
  assert.deepEqual([await page.locator('#from').inputValue(), await page.locator('#year').inputValue()], [String(at1900 - 20), String(at1900 - 20)]);
  assert.equal(await page.locator('#year-big').innerText(), '1880');
  assert.match(page.url(), /#y=1880&f=1880(&|$)/);
  await page.locator('#from').fill('0');
  await page.locator('#from').dispatchEvent('input');
  await page.locator('#year').press('End'); // End on the focused end handle (on the start handle it would move that one)
  assert.equal(await page.locator('#year-big').innerText(), String(data.lastYear));
  assert.doesNotMatch(page.url(), /f=/);
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
  assert.deepEqual(errors, []);
});

/* ---- its summary (integration/scripts/heads.mjs), written by the build with the store and committed with it; checked
   here too, so a refresh never commits one out of step. */
import { checkHeads as checkSummaries } from '../integration/scripts/heads.mjs';
test('events.head.json is in step with its store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('science/progress/data/events.json'), [], 'run node integration/scripts/heads.mjs science/progress/data/events.json');
});

// MP-12 (Jude, 17 November 2026): the three movement buttons; End, the page's own key, keeps the span in Move Together.
import { movementCheck } from './tools/movement.mjs';
test('page: the movement buttons: Move Together moves both years with the span kept (End too), Single Year shows one year, the address keeps it', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { s0 } = await movementCheck(page, {
    url: `${BASE}/science/progress/#y=1900&f=1800`, from: '#from', to: '#year', single: 'Single Year',
    ready: p => p.waitForFunction(() => document.querySelector('#year')?.dataset.value && /\d/.test(document.querySelector('#year-big')?.textContent || ''), null, { timeout: 30000 }),
    readout: p => p.locator('#year-big').innerText(),
  });
  assert.deepEqual([s0.from, s0.to], ['1800', '1900'], 'an address with no move= opens its period as before');
  // End (the page's own key) in Move Together: the end on the last stop, the start the same number of stops before it.
  await page.locator('[data-move="together"]').click();
  await page.keyboard.press('End');
  const end = await page.evaluate(() => [+document.querySelector('#from').value, +document.querySelector('#year').value, +document.querySelector('#year').max]);
  assert.equal(end[1], end[2], 'End: the end on the last stop');
  assert.equal(end[1] - end[0], s0.j - s0.i, 'End: the span kept');
  // Shift+→ in Move Together walks on from breakthrough to breakthrough, even where the next one sits on the same stop
  // (from 1600 to 1796 the stops are four years apart: 1609 and 1610 sit on 1608's).
  const ys = [...new Set(data.events.map(e => e.y))].sort((a, b) => a - b), after = y => ys.find(v => v > y);
  await page.goto('about:blank');
  await page.goto(`${BASE}/science/progress/#y=1608&f=1600&move=together`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#year')?.dataset.value === '1608', null, { timeout: 30000 });
  let y = 1608;
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Shift+ArrowRight');
    y = after(y);
    await page.waitForFunction(v => document.querySelector('#year').dataset.value === String(v), y, { timeout: 5000 });
  }
  assert.ok(y > 1610, `three steps past 1608 reach ${y}`);
  assert.match(page.url(), new RegExp(`y=${y}(&|$)`));
  assert.deepEqual(errors, []);
});
