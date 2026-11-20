// Builds the Omni-Map's layer 8 (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5c): UCDP's georeferenced events, January 1989 to
// the latest month of its release, as counts in 0.5° cells by month and type of violence; and 2026 from UCDP's Candidate
// Events as the Realtime Battlefield holds them (battlefield/data/realtime.json), by country and month, labelled candidate.
//   node --max-old-space-size=6000 omni/scripts/build-ucdp-events.mjs --file <ged261-csv.zip, in a scratch folder of its own>
// The order of steps:
// 1. Reads the zip (UCDP's own file, https://ucdp.uu.se/downloads/ged/ged261-csv.zip), checks its sha256 against the one
//    recorded when it was downloaded (SHA256 below), and inflates its one CSV in memory (nothing is unpacked to disk, and
//    nothing in it is run).
// 2. Reads every event's year, month (of date_start), type of violence (1 state-based, 2 non-state, 3 one-sided),
//    where_prec, point, country, conflict id, and its best, low and high deaths. No actor, side or person is read.
// 3. Places each event by its where_prec, as UCDP's codebook defines it: 1 to 3 (the exact place, within 25 km, or a
//    second-order division) go into the 0.5° cell of its point; 4 and 5 (a province or a wider area) are counted by country
//    and month only, since a point there would claim more than UCDP knows; 6 and 7 (the country alone, or at sea or in the
//    air) are listed beside the map, never drawn. A country is joined by ISO3 through VM's crosswalk of UCDP's names
//    (omni/scripts/ucdp-places.mjs), never by its Gleditsch and Ward number.
// 4. Joins each state-based event's conflict to the war registry (omni/data/layers/wars/registry.json, build-wars.mjs), so
//    the layer's war filter (l=ucdp-events:w=<registry id>) works; non-state and one-sided events have no registry war.
// 5. Reads 2026 from battlefield/data/realtime.json (UCDP Candidate Events, by country and month, already joined to ISO3
//    by the Realtime Battlefield): counts only, status "candidate", no cells (it holds no points).
// 6. Writes omni/data/layers/ucdp-events/<year>.json (vm-ged-cells/1), one file a year, and index.json listing each with
//    its first and last month, bytes, gzipped bytes and sha256, then the layer's entry in omni/data/layers.json. Nothing is
//    written until every step has worked; a file keeps its `built` when nothing in it changes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { placeResolver } from './ucdp-places.mjs';
import { warOf } from './build-wars.mjs';
import { arg, stamp, measure, putLayer, keepBuilt, readJson, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/ucdp-events');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const SHA256 = '8c941d84954e555ee2e54f40fa04d9203bf1e2f962203d0a9930966c4947c667'; // ged261-csv.zip, downloaded 18 November 2026
export const FILE_URL = 'https://ucdp.uu.se/downloads/ged/ged261-csv.zip';
export const DEG = 0.5, COLS = 720;
export const TYPES = { 1: 'state-based', 2: 'non-state', 3: 'one-sided' };

/** Step 1: the first entry of a zip (stored or deflated), from its central directory. */
export function unzipFirst(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip: no end of central directory');
  const cd = buf.readUInt32LE(e + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('not a zip: no central directory');
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), off = buf.readUInt32LE(cd + 42);
  const name = buf.slice(cd + 46, cd + 46 + buf.readUInt16LE(cd + 28)).toString('utf8');
  const lh = off, data = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const body = buf.slice(data, data + size);
  if (method === 0) return { name, text: body.toString('utf8') };
  if (method === 8) return { name, text: inflateRawSync(body).toString('utf8') };
  throw new Error(`zip method ${method} is not read here`);
}

/** Step 2: a CSV's rows as arrays (quoted fields, doubled quotes and line breaks inside quotes kept), and its header. */
export function* csvRows(text) {
  let row = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(c); yield row; row = []; c = ''; }
    else c += ch;
  }
  if (c || row.length) { row.push(c); yield row; }
}

/** The 0.5° cell of a point: row 0 at 90° N, column 0 at 180° W. */
export const cellOf = (lon, lat) => Math.min(359, Math.floor((90 - lat) / DEG)) * COLS + Math.min(COLS - 1, Math.floor((lon + 180) / DEG));
export const cellCentre = cell => [-180 + (cell % COLS) * DEG + DEG / 2, 90 - Math.floor(cell / COLS) * DEG - DEG / 2];

/** Steps 2–4: the layer's years from GED's events, each { cells, country, listed, wars }. events: [{ year, month, type,
    prec, lon, lat, country, conflict, best, low, high }]. */
export function cellYears(events, { resolveName, registry }) {
  const years = new Map(), unread = new Set();
  const Y = y => { if (!years.has(y)) years.set(y, { cells: new Map(), country: new Map(), listed: new Map(), wars: new Map(), months: new Set() }); return years.get(y); };
  const add = (m, k, e, war) => {
    const r = m.get(k) || { n: 0, best: 0, low: 0, high: 0, w: new Set() };
    r.n++; r.best += e.best; r.low += e.low; r.high += e.high; if (war) r.w.add(war);
    m.set(k, r);
  };
  for (const e of events) {
    const y = Y(e.year);
    y.months.add(e.month);
    const war = e.type === 1 ? warOf(registry, e.conflict, e.year) : null;
    if (war && !y.wars.has(war)) y.wars.set(war, y.wars.size);
    if (e.prec >= 1 && e.prec <= 3 && Number.isFinite(e.lon) && Number.isFinite(e.lat)) { add(y.cells, `${cellOf(e.lon, e.lat)}|${e.month}|${e.type}`, e, war); continue; }
    const p = resolveName(e.country, e.year);
    if (!p) unread.add(e.country);
    // A state that is not one of today's (the Soviet Union, Yugoslavia) is keyed by its Q-id.
    const key = `${p?.iso3 || p?.q || e.country}|${e.month}|${e.type}`;
    add(e.prec === 4 || e.prec === 5 ? y.country : y.listed, key, e, war);
  }
  const out = {};
  for (const [year, y] of [...years].sort((a, b) => a[0] - b[0])) {
    const wi = w => [...w].map(x => y.wars.get(x)).sort((a, b) => a - b);
    const rows = (m, num) => [...m].map(([k, r]) => { const [a, mo, t] = k.split('|'); return [num ? +a : a, +mo, +t, r.n, r.best, r.low, r.high, wi(r.w)]; })
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2]));
    out[year] = { months: [...y.months].sort((a, b) => a - b), wars: [...y.wars.keys()], cells: rows(y.cells, true), country: rows(y.country, false), listed: rows(y.listed, false) };
  }
  return { years: out, unread: [...unread].sort() };
}

/** Step 5: 2026 from the Realtime Battlefield's candidate events: by country and month, counts only. */
export function candidateYear(rt) {
  const months = (rt.months || []).map(m => +String(m).slice(5, 7)).filter(Boolean);
  const country = [];
  for (const c of Object.values(rt.countries || {})) {
    if (!/^[A-Z]{3}$/.test(c.iso3 || '')) continue;
    const s = c.series || {}, from = +String(s.from || rt.months?.[0] || '').slice(5, 7) || 1;
    (s.events || []).forEach((n, i) => { if (n) country.push([c.iso3, from + i, 0, n, s.deaths?.[i] ?? 0, null, null, []]); });
  }
  country.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return { months, wars: [], cells: [], country, listed: [] };
}

function main() {
  const file = arg('--file');
  if (!file || !existsSync(file)) { console.error(`Give --file <ged261-csv.zip>, downloaded from ${FILE_URL} into a scratch folder of its own`); process.exit(1); }
  const buf = readFileSync(file), sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== SHA256) throw new Error(`${file}: sha256 ${sha}, not the one recorded (${SHA256})`);
  const { name, text } = unzipFirst(buf);
  const it = csvRows(text), head = it.next().value.map(h => h.replace(/^﻿/, ''));
  const col = k => { const i = head.indexOf(k); if (i < 0) throw new Error(`GED has no column ${k}`); return i; };
  const C = Object.fromEntries(['year', 'type_of_violence', 'conflict_new_id', 'where_prec', 'latitude', 'longitude', 'country', 'date_start', 'best', 'low', 'high'].map(k => [k, col(k)]));
  const events = [];
  for (const r of it) {
    if (r.length < head.length - 1) continue;
    const d = r[C.date_start];
    events.push({ year: +r[C.year], month: +d.slice(5, 7), type: +r[C.type_of_violence], prec: +r[C.where_prec], lon: +r[C.longitude], lat: +r[C.latitude],
      country: r[C.country], conflict: +r[C.conflict_new_id], best: +r[C.best] || 0, low: +r[C.low] || 0, high: +r[C.high] || 0 });
  }
  const registry = JSON.parse(readFileSync(join(ROOT, 'omni/data/layers/wars/registry.json'), 'utf8'));
  const topo = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/countries.topo.json'), 'utf8'));
  const small = JSON.parse(readFileSync(join(ROOT, 'omni/data/base/small-states.json'), 'utf8')).points;
  const resolveName = placeResolver([...topo.objects.countries.geometries.map(g => g.properties), ...small]);
  const { years, unread } = cellYears(events, { resolveName, registry });
  const ys = Object.keys(years).map(Number);
  const rt = JSON.parse(readFileSync(join(ROOT, 'battlefield/data/realtime.json'), 'utf8'));
  if (rt.year > ys.at(-1)) years[rt.year] = candidateYear(rt);
  const now = stamp(), outs = [];
  for (const [y, body] of Object.entries(years)) {
    const cand = +y > ys.at(-1);
    const doc = { format: 'vm-ged-cells/1', layer: 'ucdp-events', source: cand ? 'ucdp-candidate' : 'ucdp-ged', version: cand ? rt.version : '26.1', status: cand ? 'candidate' : 'recorded', year: +y, built: null,
      from: cand ? 'battlefield/data/realtime.json' : `${FILE_URL} (${name}, sha256 ${SHA256})`, deg: DEG, cols: COLS,
      columns: ['cell or iso3', 'month', 'type (1 state-based, 2 non-state, 3 one-sided; 0 every type)', 'events', 'best', 'low', 'high', 'wars (indexes into wars)'], ...body };
    const f = join(OUT, `${y}.json`);
    doc.built = keepBuilt(readJson(f), doc, now);
    const t = JSON.stringify(doc) + '\n', m = measure(t);
    if (m.gzip > LIMIT_GZ) throw new Error(`ucdp-events/${y}.json is over the limit`);
    outs.push({ y: +y, f, t, m, doc, cand });
  }
  const last = outs.filter(o => !o.cand).at(-1);
  const index = { format: 'vm-ged-index/1', layer: 'ucdp-events', built: null, first: `${outs[0].y}-${String(outs[0].doc.months[0]).padStart(2, '0')}`, last: `${last.y}-${String(last.doc.months.at(-1)).padStart(2, '0')}`,
    files: outs.map(o => ({ year: o.y, file: `${o.y}.json`, status: o.doc.status, months: [o.doc.months[0], o.doc.months.at(-1)], cells: o.doc.cells.length, ...o.m })) };
  const ixFile = join(OUT, 'index.json');
  index.built = keepBuilt(readJson(ixFile), index, now);
  const ixText = JSON.stringify(index, null, 1) + '\n';
  mkdirSync(OUT, { recursive: true });
  for (const o of outs) writeFileSync(o.f, o.t);
  writeFileSync(ixFile, ixText);
  const sum = k => outs.filter(o => !o.cand).reduce((s, o) => s + o.doc[k].reduce((a, r) => a + r[3], 0), 0);
  console.log(`${events.length} events: ${sum('cells')} in cells, ${sum('country')} by country and month, ${sum('listed')} listed; names VM's crosswalk cannot read: ${unread.join('; ') || 'none'}`);
  for (const o of outs) console.log(`ucdp-events/${o.y}.json: ${o.doc.cells.length} cell rows, ${o.doc.country.length} country rows; ${o.m.bytes} bytes, ${o.m.gzip} gzipped`);
  const yrs = outs.map(o => o.y);
  putLayer(LAYERS, {
    id: 'ucdp-events', module: 'battlefield', title: 'Organised violence, UCDP events (0.5° cells by month)', role: 'point', geometry: 'point',
    // D5 (S5b/S5c review): time.last is the last month the layer holds, the candidate months among them; recordedLast is
    // GED's own last month, after which every month is candidate.
    time: { field: 'month', from: yrs[0], to: yrs.at(-1), step: 'm', precision: 'month', first: index.first, last: outs.at(-1).cand ? `${outs.at(-1).y}-${String(outs.at(-1).doc.months.at(-1)).padStart(2, '0')}` : index.last, recordedLast: index.last, shows: 'the frame’s year, every month of it' },
    data: 'omni/data/layers/ucdp-events/index.json', split: 'year', space: '0.5° cells (about 55 km at the equator), by month and type of violence',
    measure: 'events, and best, low and high deaths, a cell and month', status: 'recorded', statusBy: [{ from: last.y + 1, status: 'candidate' }],
    style: { kind: 'cells', token: '--prp-bad' },
    filter: { field: 't', label: 'Type of violence', values: Object.entries(TYPES).map(([id, n]) => ({ id, name: n })) },
    legend: 'Organised violence: UCDP Georeferenced Event Dataset 26.1 (CC BY 4.0), 0.5° cells by month; 2026: UCDP Candidate Events, by country and month',
    source: 'ucdp-ged',
    method: `VM’s own text. UCDP’s Georeferenced Event Dataset (GED) 26.1, every event from ${index.first} to ${index.last}: an event is a day of organised violence with at least one death, state-based (a government against another or against a rebel group), non-state (groups with no government) or one-sided (against civilians). VM counts the events and sums UCDP’s best, low and high deaths in 0.5° cells by month and type, from the month each event began; no actor, side or person is named. UCDP says how exactly it knows each place (where_prec): VM puts the events known to the place, within 25 km, or to a district into cells (1 to 3); those known only to a province or a wider area (4 and 5) are counted by country and month and drawn at the country, not in a cell; those known only to the country, or at sea or in the air (6 and 7), are listed beside the map and never drawn. Countries are joined by ISO3 through VM’s crosswalk of UCDP’s names, never by a Gleditsch and Ward number. A state-based event’s conflict is joined to VM’s war registry, so the map can show one war (l=ucdp-events:w=<id>). ${rt.year > ys.at(-1) ? `${rt.year} is UCDP’s Candidate Events (${rt.version}), as the Realtime Battlefield holds them: by country and month only, and candidate, not yet checked by UCDP. ` : ''}The map shows the frame’s year, every month of it, one file loaded at a time (omni/scripts/build-ucdp-events.mjs).`,
    open: true, pinnable: true, built: index.built,
    files: [{ file: 'omni/data/layers/ucdp-events/index.json', ...measure(ixText) }, ...outs.map(o => ({ file: `omni/data/layers/ucdp-events/${o.y}.json`, ...o.m }))],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
