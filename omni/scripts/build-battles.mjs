// Builds the Omni-Map's thin battles layer for 1400–1600 (PRP-SCHOLAR-USP-DESIGN.md S1 and 4.2 layer 4: "S1 holds 2
// battles for 1400–1600 and says so"), with each value's source (5.1) and its date at the precision and in the
// calendar Wikidata records (5.2).
//   node omni/scripts/build-battles.mjs [--cache <folder>]
// The Master Index will hold every entry's coordinates after its full build of 3 December 2026 (lake/scripts/build.mjs
// stores P625 from stage S1); until then this reads the few battles it needs from Wikidata itself, the smallest honest
// route. --cache keeps Wikidata's answers in a folder of your own (never the repository).
//
// The order of steps:
// 1. Reads the committed Master Index shards (lake/data/e, no fetch): the conflicts with a date, or a start, in
//    1400–1600 (FROM, TO).
// 2. Fetches those items only from Wikidata (wbgetentities, claims and English labels, User-Agent "VM build check
//    (https://jdpi.pages.dev)") and keeps those Wikidata types a battle (P31 Q178561); then one more request for the
//    names of the items their references and part-of (P361) statements name.
// 3. For each: its point in time (P585), else its start and end (P580, P582), by lake/scripts/dates.mjs at its
//    precision, with the calendar Wikidata records (calendarmodel), never converted; its coordinate location (P625) by
//    lake/scripts/coords.mjs; what supports each value by lake/scripts/refs.mjs (a reference, "Wikipedia-sourced,
//    unverified", or none), with a source line for the page.
// 4. Writes omni/data/layers/battles.json, the battles layer's `built` and years in omni/data/layers.json, and the
//    read's time as Wikidata's version and access date in integration/sources.json. Nothing else is written. The stamp
//    is the run's time only when the rows changed (layerFile): a rerun on the same answers writes the same bytes.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wikidataDate, bestClaim } from '../../lake/scripts/dates.mjs';
import { wikidataPoint } from '../../lake/scripts/coords.mjs';
import { support, supportText } from '../../lake/scripts/refs.mjs';
import { updateLayer } from './build-borders.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/battles.json');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const FROM = 1400, TO = 1600;
export const BATTLE = 'Q178561';
const CALENDARS = { 'http://www.wikidata.org/entity/Q1985727': 'gregorian', 'http://www.wikidata.org/entity/Q1985786': 'julian' };
const PROPERTY = { P585: 'point in time', P580: 'start time', P582: 'end time', P625: 'coordinate location' };
const UA = { 'User-Agent': 'VM build check (https://jdpi.pages.dev)' };
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const yearOf = v => { const y = parseInt(String(v ?? ''), 10); return Number.isFinite(y) && y !== 0 ? y : null; };
const ids = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** Step 1: the Master Index's conflicts dated in FROM..TO (a date, or a start). */
export function lakeConflicts(dir = join(ROOT, 'lake/data/e')) {
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    for (const r of Object.values(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
      if (r?.type !== 'conflict') continue;
      const y = yearOf(r.facts?.date ?? r.facts?.start);
      if (y != null && FROM <= y && y <= TO) out.push(r.q);
    }
  }
  return out.sort((a, b) => +a.slice(1) - +b.slice(1));
}

/** A value's date (5.2's shape) from a time claim: { from, p, cal?, approx? }, cal as Wikidata records it. */
export function valueDate(claim) {
  const d = wikidataDate(claim);
  if (!d) return null;
  const cal = CALENDARS[claim.mainsnak.datavalue.value.calendarmodel];
  return { from: d.v, p: d.p, ...(cal ? { cal } : {}), ...(d.c ? { approx: true } : {}) };
}

/** The source of one value: { id: 'wikidata', loc: '<Q>#<P>', support, ref?, loc?, via?, line }. */
export function valueSource(q, p, claim, label) {
  const s = support(claim);
  const named = { ...s, ...(s.via ? { via: label(s.via), viaQ: s.via } : {}), ...(s.ref && /^Q\d+$/.test(s.ref) ? { refLabel: label(s.ref) } : {}) };
  const { loc: refLoc, ...rest } = named;
  return { id: 'wikidata', loc: `${q}#${p}`, ...rest, ...(refLoc ? { refLoc } : {}),
    line: `Wikidata ${q}, ${PROPERTY[p] || p} (${p}): ${supportText(s, label)}` };
}

/** Step 3: one battle's row, or null when Wikidata gives it no date or no point (it cannot be drawn). */
export function battleRow(e, label) {
  const q = e.id, when = bestClaim(e.claims?.P585), start = bestClaim(e.claims?.P580), end = bestClaim(e.claims?.P582);
  let date = null, dateClaim = null, dateP = null;
  if (when && valueDate(when)) { date = valueDate(when); dateClaim = when; dateP = 'P585'; }
  else if (start && valueDate(start)) {
    const a = valueDate(start), b = end ? valueDate(end) : null;
    date = { ...a, ...(b ? { to: b.from } : {}), ...(b && b.p < a.p ? { p: b.p } : {}) }; dateClaim = start; dateP = 'P580';
  }
  const ptClaim = bestClaim(e.claims?.P625), point = wikidataPoint(ptClaim);
  if (!date || !point) return null;
  const partOf = ids(e, 'P361')[0] || null;
  return { id: q, q, label: e.labels?.en?.value || q, date, sortYear: yearOf(date.from), pt: point.pt, ...(point.p ? { ptPrec: point.p } : {}),
    partOf, ...(partOf ? { partOfLabel: label(partOf) } : {}),
    src: { date: valueSource(q, dateP, dateClaim, label), pt: valueSource(q, 'P625', ptClaim, label) } };
}

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/** Step 4's file: the layer as written, from its rows. Its `built` is the one the file already has (prev) when the rows
    are byte for byte the same as its own, so a rerun on the same Wikidata answers writes the same bytes and the
    battles@ pin of a saved view stays; otherwise `now`. The read's date in `about` follows the stamp. */
export function layerFile(rows, prev, now) {
  const same = !!prev && typeof prev.built === 'string' && JSON.stringify(prev.rows) === JSON.stringify(rows);
  const built = same ? prev.built : now;
  const from = Math.min(...rows.map(r => r.sortYear)), to = Math.max(...rows.map(r => r.sortYear));
  return { layer: 'battles', format: 'vm-layer/1', source: 'wikidata', built, from, to,
    about: `The battles the Master Index holds with a date in ${FROM}–${TO}, read from Wikidata on ${built.slice(0, 10)} by omni/scripts/build-battles.mjs. Dates at the precision and in the calendar Wikidata records; points as Wikidata gives them; each value with what supports it.`,
    rows };
}

async function wbget(params, cache, key) {
  if (cache && existsSync(join(cache, key))) return JSON.parse(readFileSync(join(cache, key), 'utf8'));
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&${new URLSearchParams(params)}`;
  for (let tries = 0; tries < 4; tries++) {
    const res = await fetch(u, { headers: UA });
    if (res.status === 429 || res.status >= 500) { const wait = (+res.headers.get('retry-after') || 30) * 1000; console.log(`Wikidata answered ${res.status}: waiting ${wait / 1000} s`); await sleep(wait); continue; }
    if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`Wikidata: ${j.error.info}`);
    if (cache) { mkdirSync(cache, { recursive: true }); writeFileSync(join(cache, key), JSON.stringify(j)); }
    await sleep(1000);
    return j;
  }
  throw new Error('Wikidata kept refusing: try later');
}

async function main() {
  const ci = process.argv.indexOf('--cache'), cache = ci > 0 ? process.argv[ci + 1] : null;
  const qs = lakeConflicts();
  console.log(`The Master Index's conflicts dated ${FROM}–${TO}: ${qs.join(', ') || 'none'}`);
  if (!qs.length) { console.error('None: nothing to write'); process.exit(1); }
  const got = await wbget({ ids: qs.join('|'), props: 'claims|labels', languages: 'en' }, cache, 'battles-items.json');
  const items = qs.map(q => got.entities[q]).filter(e => e && !('missing' in e));
  const battles = items.filter(e => ids(e, 'P31').includes(BATTLE));
  for (const e of items.filter(x => !battles.includes(x))) console.log(`${e.id} is not typed a battle (P31 ${BATTLE}) in Wikidata: left out`);
  // The names of the items the rows name: references (stated in, imported from) and part of.
  const named = new Set();
  for (const e of battles) {
    for (const p of ['P585', 'P580', 'P625']) { const s = support(bestClaim(e.claims?.[p])); if (s.via) named.add(s.via); if (s.ref && /^Q\d+$/.test(s.ref)) named.add(s.ref); }
    for (const q of ids(e, 'P361')) named.add(q);
  }
  const labels = new Map();
  if (named.size) {
    const l = await wbget({ ids: [...named].sort().join('|'), props: 'labels', languages: 'en' }, cache, 'battles-labels.json');
    for (const [q, e] of Object.entries(l.entities)) labels.set(q, e.labels?.en?.value || q);
  }
  const rows = battles.map(e => battleRow(e, q => labels.get(q) || q)).filter(Boolean).sort((a, b) => a.sortYear - b.sortYear || a.q.localeCompare(b.q));
  for (const e of battles) if (!rows.some(r => r.q === e.id)) console.log(`${e.id}: Wikidata gives no date or no point, so it cannot be drawn: left out`);
  // The stamp moves only with the rows (layerFile): unchanged rows keep the file, the catalogue and the sources as they are.
  const prev = readJson(OUT);
  const file = layerFile(rows, prev, stamp());
  mkdirSync(join(ROOT, 'omni/data/layers'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  for (const r of rows) console.log(`${r.label}: ${JSON.stringify(r.date)} at ${r.pt.join(', ')}; date ${r.src.date.support}, point ${r.src.pt.support}`);
  console.log(file.built === prev?.built ? `The rows are unchanged: the stamp stays ${file.built}` : `The rows changed: stamped ${file.built}`);
  updateLayer(LAYERS, 'battles', { built: file.built, time: { from: file.from, to: file.to } });
  // Wikidata's entry in VM's sources names the read this layer holds (its version is when VM read it).
  const S = join(ROOT, 'integration/sources.json'), sources = JSON.parse(readFileSync(S, 'utf8'));
  const wd = sources.sources.find(s => s.id === 'wikidata');
  if (wd) { wd.version = file.built; wd.accessed = file.built.slice(0, 10); writeFileSync(S, JSON.stringify(sources, null, 2) + '\n'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
