// Builds the Omni-Map's battles layer (PRP-SCHOLAR-USP-DESIGN.md 4.2 layer 4), with each value's source (5.1) and its
// date at the precision and in the calendar Wikidata records (5.2). Stage S1 held the 2 battles of 1400–1600; stage
// S5b widens it to every battle of the Master Index with a date and a point, and War Focus's located battles.
//   node omni/scripts/build-battles.mjs [--cache <folder>]
// The values are read from Wikidata itself, so each keeps what supports it. War Focus's death figures are not battle
// values here (PRIO's and the Correlates of War's totals stay out: PRIO states no licence, COW bars commercial use).
// --cache keeps Wikidata's answers in a folder of your own (never the repository).
//
// The order of steps:
// 1. Reads the committed Master Index shards (lake/data/e, no fetch): the conflicts with a date, or a start (FROM, TO:
//    every year since S5b), and War Focus's located battles (battlefield/focus/data/wars/*.json: each battle's Q-id
//    and its war), and the war registry (omni/data/layers/wars/registry.json) for each war's id.
// 2. Fetches those items only from Wikidata (wbgetentities, claims and English labels, User-Agent "VM build check
//    (https://jdpi.pages.dev)") and keeps those Wikidata types a battle (P31 Q178561), and every one War Focus lists
//    as a battle of its war; then the names of the items their references and part-of (P361) statements name.
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
import { entities } from './history-common.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/battles.json');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const FROM = -Infinity, TO = Infinity; // S1 read 1400–1600; S5b reads every year
export const BATTLE = 'Q178561';
export const EARLIEST = -3000; // no battle VM could hold is dated earlier (Wikidata's oldest dated battles are later)
const CALENDARS = { 'http://www.wikidata.org/entity/Q1985727': 'gregorian', 'http://www.wikidata.org/entity/Q1985786': 'julian' };
const PROPERTY = { P585: 'point in time', P580: 'start time', P582: 'end time', P625: 'coordinate location' };
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); // (Wikidata is read through history-common.mjs, with its User-Agent)
const yearOf = v => { const y = parseInt(String(v ?? ''), 10); return Number.isFinite(y) && y !== 0 ? y : null; };
const ids = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** Step 1: the Master Index's conflicts dated in FROM..TO (a date, or a start). */
export function lakeConflicts(dir = join(ROOT, 'lake/data/e'), { from = FROM, to = TO } = {}) {
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    for (const r of Object.values(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
      if (r?.type !== 'conflict') continue;
      const y = yearOf(r.facts?.date ?? r.facts?.start);
      if (y != null && from <= y && y <= to) out.push(r.q);
    }
  }
  return out.sort((a, b) => +a.slice(1) - +b.slice(1));
}
/** Step 1: War Focus's located battles: { Q: registry war id } (a battle listed by two wars keeps the first). */
export function focusBattles(dir = join(ROOT, 'battlefield/focus/data/wars')) {
  const out = new Map();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const w = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const b of w.battles || []) if (/^Q\d+$/.test(b.q || '') && Number.isFinite(b.lat) && Number.isFinite(b.lon) && !out.has(b.q)) out.set(b.q, `wf-${w.id}`);
  }
  return out;
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
export function battleRow(e, label, war = null) {
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
    partOf, ...(partOf ? { partOfLabel: label(partOf) } : {}), ...(war ? { war } : {}),
    src:{ date: valueSource(q, dateP, dateClaim, label), pt: valueSource(q, 'P625', ptClaim, label) } };
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
    about: `The battles the Master Index holds with a date, and War Focus’s located battles, read from Wikidata on ${built.slice(0, 10)} by omni/scripts/build-battles.mjs. Dates at the precision and in the calendar Wikidata records; points as Wikidata gives them; each value with what supports it.`,
    rows };
}

/** The layer's method, from its rows (VM's own text). */
export function battlesMethod(file) {
  const withWar = file.rows.filter(r => r.war).length, wf = file.rows.filter(r => /^wf-/.test(r.war || '')).length;
  return `VM’s own text. The ${file.rows.length.toLocaleString('en-GB')} battles VM holds with a date and a point, ${file.from < 0 ? `${-file.from} BC` : file.from} to ${file.to}: every conflict of the Master Index that Wikidata types a battle (P31 Q178561), and every located battle of War Focus, each read from Wikidata by omni/scripts/build-battles.mjs: its point in time (P585), or its start and end (P580, P582), at the precision and in the calendar Wikidata records, never converted; its coordinate location (P625) as Wikidata gives it, with its precision; and what supports each value, by VM’s rule: a reference naming a work (P248), a reference URL or a database record counts as a reference; a value only imported from a Wikipedia (P143, P4656) reads ‘Wikipedia-sourced, unverified’; anything less reads ‘no reference’. A battle with no date or no point in Wikidata is left out, and so is one whose year no battle can have (before 3000 BC). ${withWar.toLocaleString('en-GB')} are tied to a war of VM’s war registry (omni/data/layers/wars/registry.json), ${wf.toLocaleString('en-GB')} of them to a war War Focus covers, which a click opens. Above 2,000 drawn at once, the points cluster. Wikidata’s data is CC0. Each view says how many battles VM holds for its years.`;
}

async function main() {
  const ci = process.argv.indexOf('--cache'), cache = ci > 0 ? process.argv[ci + 1] : null;
  const lake = lakeConflicts(), focus = focusBattles();
  const qs = [...new Set([...lake, ...focus.keys()])].sort((a, b) => +a.slice(1) - +b.slice(1));
  console.log(`The Master Index's conflicts with a date: ${lake.length}; War Focus's located battles: ${focus.size}; ${qs.length} items in all`);
  if (!qs.length) { console.error('None: nothing to write'); process.exit(1); }
  const got = await entities(qs, { props: 'claims|labels', cache, tag: 'battles' });
  const items = qs.map(q => got[q]).filter(Boolean);
  // A Master Index conflict is a battle when Wikidata types it one (S1's rule); War Focus's battles are its own list.
  const battles = items.filter(e => focus.has(e.id) || ids(e, 'P31').includes(BATTLE));
  console.log(`${items.length - battles.length} Master Index conflicts are not typed a battle (P31 ${BATTLE}) in Wikidata: left out`);
  // The war of a Master Index battle: the registry's war whose Q-id it is part of (P361).
  const registry = JSON.parse(readFileSync(join(ROOT, 'omni/data/layers/wars/registry.json'), 'utf8'));
  const warByQ = new Map(registry.wars.filter(w => w.q).map(w => [w.q, w.id]));
  // The names of the items the rows name: references (stated in, imported from) and part of.
  const named = new Set();
  for (const e of battles) {
    for (const p of ['P585', 'P580', 'P625']) { const s = support(bestClaim(e.claims?.[p])); if (s.via) named.add(s.via); if (s.ref && /^Q\d+$/.test(s.ref)) named.add(s.ref); }
    for (const q of ids(e, 'P361')) named.add(q);
  }
  const labels = new Map();
  if (named.size) {
    const l = await entities([...named], { props: 'labels', cache, tag: 'battle-labels' });
    for (const [q, e] of Object.entries(l)) labels.set(q, e.labels?.en?.value || q);
  }
  const warOfBattle = e => focus.get(e.id) || ids(e, 'P361').map(q => warByQ.get(q)).find(Boolean) || null;
  const all = battles.map(e => battleRow(e, q => labels.get(q) || q, warOfBattle(e))).filter(Boolean);
  const left = battles.length - all.length;
  // A year Wikidata gives that no battle can have (before 3000 BC, a slip of its digits such as -335000): left out, named.
  const odd = all.filter(r => r.sortYear == null || r.sortYear < EARLIEST);
  for (const r of odd) console.log(`${r.q} ${r.label}: Wikidata dates it ${r.date.from}, which no battle can have: left out`);
  const rows = all.filter(r => !odd.includes(r)).sort((a, b) => a.sortYear - b.sortYear || a.q.localeCompare(b.q));
  console.log(`${rows.length} battles drawn; ${left} with no date or no point in Wikidata and ${odd.length} with an impossible year left out`);
  // The stamp moves only with the rows (layerFile): unchanged rows keep the file, the catalogue and the sources as they are.
  const prev = readJson(OUT);
  const file = layerFile(rows, prev, stamp());
  mkdirSync(join(ROOT, 'omni/data/layers'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  console.log(file.built === prev?.built ? `The rows are unchanged: the stamp stays ${file.built}` : `The rows changed: stamped ${file.built}`);
  updateLayer(LAYERS, 'battles', { built: file.built, time: { from: file.from, to: file.to }, method: battlesMethod(file) });
  // Wikidata's entry in VM's sources names the read this layer holds (its version is when VM read it).
  const S = join(ROOT, 'integration/sources.json'), sources = JSON.parse(readFileSync(S, 'utf8'));
  const wd = sources.sources.find(s => s.id === 'wikidata');
  if (wd) { wd.version = file.built; wd.accessed = file.built.slice(0, 10); writeFileSync(S, JSON.stringify(sources, null, 2) + '\n'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
