// Reviewer's tests (S5b/S5c, second round, 20 November 2026). Each proves a finding of that review; each FAILS on the
// working tree as the review found it. Not added to package.json's "test" line: the fixer decides whether to keep them.
//   node --test tests/omni-review-s5bc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../omni/lib/layers.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const DOC = read('omni/data/layers.json');
const pts = ids => ({ layers: [...DOC.layers, ...ids.map(id => ({ ...DOC.layers[1], id, title: `Layer ${id}` }))] });

test('review: unticking Show anyway names every layer it switches off, not only the last', () => {
  const cat = L.catalogue(pts(['p2', 'p3', 'p4', 'p5']));
  let s = L.setAnyway(L.emptySet(), true, cat).set;
  for (const id of ['battles', 'p2', 'p3', 'p4', 'p5']) s = L.switchOn(s, id, cat).set;
  const r = L.setAnyway(s, false, cat);
  assert.equal(r.dropped.length, 2);
  for (const d of r.dropped) assert.match(r.note || '', new RegExp(cat.byId.get(d.id).title.replace(/[()]/g, '\\$&')), `the note names ${d.id}`);
});

test('review: an election or referendum is never placed in a year its own name contradicts', () => {
  const rows = read('omni/data/layers/elections/elections.json').rows;
  const bad = rows.filter(r => { const m = /^(?:\w+ )?(\d{4})\b/.exec(r.label); return m && Math.abs(+m[1] - r.sortYear) > 1; })
    .map(r => `${r.label}: ${r.date.from}`);
  assert.deepEqual(bad, [], 'e.g. "2026 Slovak referendum" dated 0202-07-04 is drawn and listed at AD 202');
});

test('review: an election whose day has not come is not shown as recorded', () => {
  const doc = read('omni/data/layers/elections/elections.json');
  const built = doc.built.slice(0, 10);
  const ahead = doc.rows.filter(r => String(r.date.from) > built && !r.expected);
  assert.deepEqual(ahead.map(r => `${r.label}: ${r.date.from}`), [], `rows after ${built} carry no "expected" mark while the layer's status is "recorded"`);
});
