// integration/sources.json: the EU database right for every source, the free stand-ins' terms read on the day MP-11
// placed them, the IEA's terms for its non-CC material, and Archigos's decision split in two (MP-11 fixer, 20 November
// 2026). The sources the owner keeps for later (MBFC, AllSides, Yahoo Finance, ApeWisdom, CoinGecko, publishers, US
// House transaction reports) are not changed by this job and are left out here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../integration/sources.json', import.meta.url), 'utf8'));
const by = Object.fromEntries(doc.sources.map(s => [s.id, s]));
const LATER = new Set(['mbfc', 'allsides', 'yahoo-finance', 'apewisdom', 'coingecko', 'publishers', 'us-house-ptr']);

test('sources.json: every source but the later ones says where it stands on the EU database right', () => {
  const missing = doc.sources.filter(s => !LATER.has(s.id) && !(typeof s.databaseRight === 'string' && s.databaseRight.trim())).map(s => s.id);
  assert.deepEqual(missing, []);
  for (const s of doc.sources) if (/^CC BY(-SA)? 4\.0$/.test(s.licence)) assert.match(s.databaseRight, /licen[cs]e.*(sui generis|database right)|(sui generis|database right).*licen[cs]ed/i, s.id);
  for (const s of doc.sources) if (/^CC0 1\.0/.test(s.licence)) assert.match(s.databaseRight, /waives the EU database right/, s.id);
});

test('sources.json: the free stand-ins’ terms were read on or after 20 November 2026, when MP-11 placed them', () => {
  for (const id of ['cliopatria', 'natural-earth', 'natural-earth-admin0', 'wikidata', 'wikipedia', 'ucdp-acd', 'ucdp-brd', 'ucdp-ged', 'ucdp-candidate'])
    assert.ok(by[id].termsRead >= '2026-11-20', `${id}: ${by[id].termsRead}`);
});

test('sources.json: the IEA’s terms for its non-CC material are said; Archigos’s names and dates are open work, only its coding waits', () => {
  assert.match(by.iea.licence, /small extracts \(no more than five data points, not as a download\)/);
  assert.ok(by.iea.note.includes('https://www.iea.org/terms/terms-of-use-for-non-cc-material'));
  assert.match(by.archigos.decision, /names and dates are open work: to be built from Wikidata’s positions held \(P39\)/);
  assert.match(by.archigos.decision, /Only the coding of how each leader took and left office \(entry and exit\) waits on VM’s owner/);
});
