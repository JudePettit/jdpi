// Builds the Omni-Map's one war registry (PRP-SCHOLAR-USP-DESIGN.md stage S5b): one id per war, joining the UCDP
// conflict ids, War Focus's ids and Wikidata's Q-ids, so the conflict, battle and event layers name a war the same way.
//   node omni/scripts/build-wars.mjs --acd <UcdpPrioConflict_v26_1.csv> [--cache <folder>]
// No Correlates of War record and no Correlates of War number is read or written (its terms bar commercial use, Jude's
// rule of 18 November 2026, MP-11): the Retrospective Battlefield's "cow" rows are skipped, and War Focus's "bf" ids
// are read only where they are UCDP conflict ids ("u<n>").
//
// The order of steps:
// 1. Reads UCDP/PRIO's Armed Conflict Dataset 26.1 (CC BY 4.0), downloaded by hand from https://ucdp.uu.se/downloads/
//    into a scratch folder: each conflict's id, its location as UCDP names it and its years.
// 2. Reads the names VM gives those conflicts (battlefield/history/data/wars.json, its "ucdp" rows only) and War Focus's
//    39 wars (battlefield/focus/data/index.json: id, name, Q-id, and the UCDP id where its "bf" is one).
// 3. Asks Wikidata (wbgetentities, VM's client name, one request at a time) for each War Focus war's item: its English
//    label checks the Q-id, and its start and end (P580, P582) give the war's years, at the precision Wikidata records.
// 4. Joins: each War Focus war is a war of its own, holding its UCDP conflict for the years of the war (two War Focus
//    wars may share one UCDP conflict: the Chechen wars, and Afghanistan's); every other UCDP conflict is a war of its
//    own. A conflict-year belongs to the War Focus war whose years hold it, else to the conflict's own war (warOf).
// 5. Writes omni/data/layers/wars/registry.json, keeping its `built` when nothing else changed. Nothing else is written.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csv, entities, keepStamp, sha256 } from './history-common.mjs';
import { arg, stamp } from './layer-catalogue.mjs';
import { wikidataDate, bestClaim } from '../../lake/scripts/dates.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const OUT = join(ROOT, 'omni/data/layers/wars/registry.json');
const yearOf = v => { const m = /^(-?\d+)/.exec(String(v ?? '')); return m ? +m[1] : null; };

/** Step 1: the conflicts of ACD rows: { id: { id, location, years: [..] } }. */
export function acdConflicts(rows) {
  const out = {};
  for (const r of rows) {
    const id = +r.conflict_id;
    (out[id] ||= { id, location: r.location, years: [] }).years.push(+r.year);
  }
  for (const c of Object.values(out)) c.years = [...new Set(c.years)].sort((a, b) => a - b);
  return out;
}

/** Step 4: the registry's wars from the conflicts, VM's names, War Focus's wars and their Wikidata years. */
export function joinWars(conflicts, names, wf, wfYears) {
  const wars = [];
  for (const w of wf) {
    const u = /^u(\d+)$/.exec(w.bf || '');
    const y = wfYears[w.id] || {};
    wars.push({ id: `wf-${w.id}`, name: w.name, q: w.qid || null, wf: w.id, ucdp: u && conflicts[+u[1]] ? [+u[1]] : [], from: y.from ?? null, to: y.to ?? null, ...(y.src ? { src: y.src } : {}) });
  }
  const held = new Set(wars.flatMap(w => w.ucdp));
  for (const c of Object.values(conflicts).sort((a, b) => a.id - b.id)) {
    if (held.has(c.id)) continue;
    wars.push({ id: `ucdp-${c.id}`, name: names[c.id] || c.location, q: null, wf: null, ucdp: [c.id], from: c.years[0], to: c.years.at(-1), src: { id: 'ucdp-acd', loc: `UcdpPrioConflict_v26_1.csv;conflict_id=${c.id}` } });
  }
  return wars;
}

/** The war a UCDP conflict-year belongs to: the War Focus war holding that conflict whose years hold the year (the
    nearest by its start when none does), else the conflict's own. */
export function warOf(registry, conflictId, year) {
  const ws = registry.wars.filter(w => w.ucdp.includes(conflictId));
  if (!ws.length) return null;
  if (ws.length === 1) return ws[0].id;
  const holds = ws.filter(w => w.from != null && w.from <= year && year <= (w.to ?? Infinity));
  if (holds.length) return holds[0].id;
  return ws.slice().sort((a, b) => Math.abs((a.from ?? 0) - year) - Math.abs((b.from ?? 0) - year))[0].id;
}

async function main() {
  const acdFile = arg('--acd'), cache = arg('--cache');
  if (!acdFile || !existsSync(acdFile)) { console.error('Give --acd <UcdpPrioConflict_v26_1.csv>, downloaded from https://ucdp.uu.se/downloads/'); process.exit(1); }
  const acdBuf = readFileSync(acdFile);
  const conflicts = acdConflicts(csv(acdBuf.toString('utf8')));
  const wj = JSON.parse(readFileSync(join(ROOT, 'battlefield/history/data/wars.json'), 'utf8'));
  // VM's names of the UCDP conflicts only: a "cow" row is never read.
  const names = Object.fromEntries(wj.wars.filter(w => w.src === 'ucdp' && /^u\d+$/.test(w.id)).map(w => [+w.id.slice(1), w.name]));
  const wf = JSON.parse(readFileSync(join(ROOT, 'battlefield/focus/data/index.json'), 'utf8')).wars;
  const got = await entities(wf.map(w => w.qid), { props: 'claims|labels', cache, tag: 'wars' });
  const wfYears = {};
  for (const w of wf) {
    const e = got[w.qid];
    if (!e) { console.log(`${w.id}: Wikidata holds no ${w.qid}; its years are left empty`); continue; }
    const a = wikidataDate(bestClaim(e.claims?.P580)), b = wikidataDate(bestClaim(e.claims?.P582));
    // An end Wikidata does not record stays empty (an ongoing war, or one it leaves open): never guessed.
    wfYears[w.id] = { from: yearOf(a?.v), to: yearOf(b?.v), src: { id: 'wikidata', loc: `${w.qid}#P580`, label: e.labels?.en?.value || null } };
  }
  const wars = joinWars(conflicts, names, wf, wfYears);
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const body = { format: 'vm-wars/1', built: null,
    about: 'VM’s own text. One id per war for the Omni-Map’s layers: each War Focus war (its Q-id and years from Wikidata, CC0), holding its UCDP conflict for those years, and every other conflict of UCDP/PRIO’s Armed Conflict Dataset 26.1 (CC BY 4.0) as a war of its own. No Correlates of War record or number: its terms bar commercial use.',
    sources: { 'ucdp-acd': { file: 'UcdpPrioConflict_v26_1.csv', sha256: sha256(acdBuf) }, wikidata: { read: 'wbgetentities' } },
    wars };
  const file = { ...body, built: keepStamp(prev, body, stamp()) };
  mkdirSync(join(ROOT, 'omni/data/layers/wars'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n');
  console.log(`${wars.length} wars (${wars.filter(w => w.wf).length} War Focus, ${wars.filter(w => !w.wf).length} UCDP only); built ${file.built}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
