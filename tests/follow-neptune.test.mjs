// The Invention Timeline refresh does not stop on Neptune (the part "neptune" of 28 November 2026).
//  - The rehearsal of the refresh of 2 December 2026 on that day's Wikidata refused to write: "1 seed pn names not
//    used". On 13 November 2026 (revision 2568750075, "Import places from GND") Wikidata gave Johann Gottfried Galle
//    (Q76431) four work locations (P937: Berlin, Wrocław, Potsdam, Guben), so the rules through the people placed the
//    discovery of Neptune in Berlin (Q64), no longer at the university he had studied at (Q152087, P69), whose name of
//    the time the seed gave as its pn: the undated work-location rule takes the preferred statement, the only one, or
//    the nearest in time, among those within 100 km of the seed's fallback place, and of his four, all undated, the
//    first listed within 100 km is Berlin.
//  - Neptune is now placed by hand where it happened: the Berlin Observatory (Q698950), the location (P276) that
//    Wikidata's item for the discovery (Q1356165) gives, and where Wikipedia "Discovery of Neptune" (revision 1387592462,
//    read 28 November 2026) says the planet was confirmed. Its pn is gone: the observatory's name is the one it bore.
//  - A pn a source edit leaves unused no longer stops the refresh: build-progress.mjs's pnVerdict writes the event where
//    Wikidata's facts now place it and reports it, in that month and the later ones (the cache's pnHeld), and refuses
//    only a mistake in the seed: a pn no fact of its event leads to and no build has used or held (a typo or a stale
//    override), a pn beside a hand-set QID of another place, or a move to another item under the pn's place's name of
//    today. Its rule is tested on fixtures here, from the script's own text (the script runs its build when imported).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from '../science/scripts/progress-seed.mjs';
import { normName, parseRef, looksInstitutional } from '../science/scripts/progress-lib.mjs';
import { builtOn } from './tools/as-built.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const src = read('science/scripts/build-progress.mjs');
// A top-level function of the script, as written there (it reads nothing but its arguments).
const fn = name => {
  const at = src.indexOf(`\nfunction ${name}(`);
  assert.ok(at >= 0, `build-progress.mjs has a function ${name}`);
  return new Function(`${src.slice(at + 1, src.indexOf('\n}\n', at) + 2)}; return ${name};`)();
};

const FWU = 'Frederick William University Berlin';
const LABELS = { Q152087: 'Humboldt-Universität zu Berlin', Q64: 'Berlin', Q698950: 'Berlin Observatory', Q99: 'Humboldt-Universität zu Berlin' };
const facts = (reach, lastQ = null, more = {}) => ({ reach, lastQ, labelOf: q => LABELS[q] || null, norm: normName, ...more });

test('pnVerdict: a pn a source edit leaves unused is held and written; a pn nothing leads to is refused', () => {
  const pnVerdict = fn('pnVerdict');
  const pn = { qid: 'Q152087', name: FWU };
  // Placed at the pn's item: shown under the name of the time.
  assert.deepEqual(pnVerdict(pn, { qid: 'Q152087', name: 'Humboldt-Universität zu Berlin' }, facts(['Q152087'])), { name: FWU });
  // Neptune in the rehearsal of 28 November 2026: placed at Berlin, while Galle's P69 still names Q152087, and the last
  // build placed it there. Written, and reported.
  const neptune = pnVerdict(pn, { qid: 'Q64', name: 'Berlin' }, facts(['Q698950', 'Q152087', 'Q315658', 'Q64'], 'Q152087'));
  assert.ok(neptune.held && !neptune.refuse && !neptune.name, JSON.stringify(neptune));
  assert.match(neptune.held, /placed at Q64 “Berlin” this month.*still among the places they name/);
  // The statement that led there removed, but the last build placed it there: held too (the first month).
  assert.match(pnVerdict(pn, { qid: 'Q64', name: 'Berlin' }, facts(['Q64'], 'Q152087')).held, /where the last build placed it/);
  // The month after: the last build placed it at Berlin, but held the pn (the cache's pnHeld), and the seed is
  // unchanged. Still held, and reported as stale; an unused pn is never shown, so writing publishes nothing false.
  const later = pnVerdict(pn, { qid: 'Q64', name: 'Berlin' }, facts(['Q64'], 'Q64', { heldQ: 'Q152087' }));
  assert.ok(later.held && !later.refuse, JSON.stringify(later));
  assert.match(later.held, /held since an earlier build.*\(stale: mend the seed unless the facts will lead back\)$/);
  // A pn nothing of the event leads to, which no build placed there or held: a typo or a stale override, refused.
  const typo = pnVerdict({ qid: 'Q152078', name: FWU }, { qid: 'Q152087', name: 'Humboldt-Universität zu Berlin' }, facts(['Q152087'], 'Q152087'));
  assert.match(typo.refuse, /^pn “Q152078 Frederick William University Berlin” not used, since the event is placed at Q152087/);
  assert.ok(pnVerdict(pn, { qid: 'Q64', name: 'Berlin' }, facts(['Q64'], 'Q64', { heldQ: 'Q1' })).refuse, 'a record of another pn holds nothing');
  // The seed's own hand-set QID (at) moved to another place and its pn left behind (a stale override): the seed
  // contradicts itself, and is refused by the build that first meets it, even where the last build placed it at the pn.
  const stale = pnVerdict({ qid: 'Q3145188', name: 'Necker Hospital' }, { qid: 'Q90', name: 'Paris' },
    facts(['Q90', 'Q3145188'], 'Q3145188', { atQ: 'Q90', heldQ: 'Q3145188' }));
  assert.match(stale.refuse || '', /beside the seed’s hand-set place Q90: the seed contradicts itself/);
  // A hand-set QID that is the pn's: shown under the name of the time (stethoscope, stm).
  assert.deepEqual(pnVerdict({ qid: 'Q3145188', name: 'Necker Hospital' }, { qid: 'Q3145188', name: 'Necker–Enfants Malades Hospital' },
    facts(['Q3145188'], null, { atQ: 'Q3145188' })), { name: 'Necker Hospital' });
  // Moved to another item that bears the pn's place's name of today: writing would show today's name for the year.
  const dup = pnVerdict(pn, { qid: 'Q99', name: 'Humboldt-Universität zu Berlin' }, facts(['Q152087', 'Q99'], 'Q152087'));
  assert.match(dup.refuse, /bears the name Q152087 has today/);
});

test('the build reports a held pn, keeps it held until the seed is mended, and refuses only pnUnused', () => {
  assert.match(src, /const v = pnVerdict\(pn, chosen, \{ atQ: e\.at \? parseRef\(e\.at\)\.qid \|\| null : null, reach, lastQ: lastPlace\.get\(e\.id\) \|\| null,\s+heldQ: lastHeld\[e\.id\] \|\| null, labelOf: label, norm: normName \}\);/);
  assert.match(src, /else if \(v\.held\) \{ report\.pnHeld\.push\([^\n]*pnHeld\[e\.id\] = pn\.qid; \}/);
  assert.match(src, /else report\.pnUnused\.push\(/);
  // The record is the last writing build's: read from the cache, replaced only once the build writes, and saved.
  assert.match(src, /const lastHeld = cache\.pnHeld \|\| \{\}, pnHeld = \{\};/);
  const write = src.indexOf('writeFileSync(OUT_FILE, text);');
  assert.ok(write > 0 && src.indexOf('cache.pnHeld = pnHeld;') > write, 'the record is replaced after the write');
  assert.match(src, /"pnHeld":\$\{part\(cache\.pnHeld\)\}/);
  const guard = src.slice(src.indexOf('refuseIfLost(['), src.indexOf(']);', src.indexOf('refuseIfLost(['))).replace(/\/\/.*$/gm, '');
  assert.match(guard, /report\.pnUnused\.length/);
  assert.doesNotMatch(guard, /pnHeld/, 'a held pn does not stop the write');
});

// VM's own values, pinned outright: a pn beside a hand-set QID names that same place (francium, stethoscope, stm). A
// seed that moves its at and leaves the pn fails here, before any build, and the build refuses it too (pnVerdict).
test('seed: a pn beside a hand-set QID is that QID', () => {
  const both = SEED.filter(s => s.pn && parseRef(s.at).qid);
  assert.deepEqual(both.map(s => s.id).sort(), ['francium', 'stethoscope', 'stm']);
  for (const s of both) assert.equal(parseRef(s.pn).qid, parseRef(s.at).qid, s.id);
});

// The built data by its shape: every seed pn is in use (its event is at the pn's item) or held by the build that wrote
// the file (the cache's pnHeld). A pn added or changed in the seed without a rebuild fails here, at the hand gate,
// rather than stopping the next monthly refresh.
test('built data: every seed pn is used or held', () => {
  const data = JSON.parse(read('science/progress/data/events.json'));
  const held = JSON.parse(read('science/scripts/progress-cache.json')).pnHeld || {};
  const bad = SEED.filter(s => s.pn).flatMap(s => {
    const q = parseRef(s.pn).qid, e = data.events.find(x => x.id === s.id);
    return e && (e.place.q === q || held[s.id] === q) ? [] : [`${s.id}: pn ${q}, placed at ${e?.place.q}, not held`];
  });
  assert.deepEqual(bad, []);
  for (const [id, q] of Object.entries(held)) assert.equal(parseRef(SEED.find(s => s.id === id)?.pn).qid, q, `${id}: held as its pn`);
});

test('Neptune: placed by hand at the Berlin Observatory, with no name of another place', () => {
  const s = SEED.find(e => e.id === 'neptune');
  assert.equal(s.at, 'Q698950 Berlin Observatory');
  assert.equal(s.fb, 'Berlin Observatory');
  assert.equal(s.pn, undefined);
  const data = JSON.parse(read('science/progress/data/events.json'));
  const e = data.events.find(x => x.id === 'neptune');
  assert.deepEqual([e.place.q, e.positionBasis], ['Q698950', 'curated']);
  // Its name is Wikidata's label of the observatory, as every place without a pn is named; "Berlin Observatory" as
  // read on 28 October and 28 November 2026 (the cache's date of the read).
  const cache = JSON.parse(read('science/scripts/progress-cache.json')).items.Q698950;
  assert.equal(e.place.n, String(cache.l || cache.w || '').replace(/^./, c => c.toUpperCase()));
  // By rule: a place set by hand is among the event's institutions, and in the lookup, exactly when Wikidata's label
  // and description read like an institution (eventInstitutions; looksInstitutional).
  const inst = looksInstitutional(cache.l, cache.d);
  assert.equal(e.inst.includes('Q698950'), inst, 'the observatory is among its institutions exactly when it reads as one');
  assert.equal(!!data.institutions.Q698950, inst, 'and in the lookup likewise');
  // As read on 28 October and 28 November 2026 (the cache's date of the read): "Berlin Observatory", an institution.
  if (builtOn(cache.t, '2026-10-28') || builtOn(cache.t, '2026-11-28')) {
    assert.equal(e.place.n, 'Berlin Observatory');
    assert.ok(e.inst.includes('Q698950') && data.institutions.Q698950, 'the observatory is among its institutions');
  }
});
