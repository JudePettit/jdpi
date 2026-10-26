// War Focus data build: one file per war in battlefield/focus/data/wars/<id>.json plus an index.
//   node battlefield/focus/scripts/build.mjs [--cache dir] [--only id,id]
// Sources (downloaded into the cache directory once):
//   · UCDP Georeferenced Event Dataset v26.1 (1989–2025) and the 2026 candidate events: geolocated clashes with deaths.
//   · PRIO Battle Deaths Dataset v3.1 (annual battle deaths, 1946–2008).
//   · Correlates of War totals (already in Retrospective Battlefield's wars.json).
//   · Wikidata: the war's item and every battle, siege or military operation that is part of it, with coordinates,
//     dates and recorded deaths.
// Months with UCDP events use their recorded deaths. Earlier months spread each year's (PRIO) or the war's (COW) total
// across its months in proportion to the battles recorded in each month; these are flagged as estimates.
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { WARS } from './wars.mjs';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'data'), WAR_DIR = join(OUT, 'wars');
mkdirSync(WAR_DIR, { recursive: true });
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CACHE = arg('--cache') || join(tmpdir(), 'warfocus-src');
const ONLY = arg('--only')?.split(',');
mkdirSync(CACHE, { recursive: true });
const UA = { 'User-Agent': 'JDP-I War Focus (https://jdpi.pages.dev; research use)' };

async function download(url, file) {
  const path = join(CACHE, file);
  if (!existsSync(path)) { console.log('downloading', url); const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: ${r.status}`); writeFileSync(path, Buffer.from(await r.arrayBuffer())); }
  return path;
}
function unzip(zip, name) {
  const dir = join(CACHE, name);
  if (!existsSync(dir)) { mkdirSync(dir); execFileSync(process.platform === 'win32' ? 'powershell' : 'unzip', process.platform === 'win32' ? ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${dir}'`] : ['-o', zip, '-d', dir]); }
  return dir;
}

// ---- Month helpers
const ym = d => d.slice(0, 7);
const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return out; };

// ---- Streaming CSV (quoted fields may contain commas and newlines)
async function* csvRows(path) {
  let header = null, field = '', row = [], q = false, pendingQuote = false;
  for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (pendingQuote) { pendingQuote = false; if (c === '"') { field += '"'; continue; } q = false; }
      if (q) { if (c === '"') pendingQuote = true; else field += c; continue; }
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field.replace(/\r$/, '')); field = ''; if (!header) header = row; else yield Object.fromEntries(header.map((h, k) => [h, row[k]])); row = []; }
      else field += c;
    }
  }
  if (row.length || field) { row.push(field); if (header) yield Object.fromEntries(header.map((h, k) => [h, row[k]])); }
}

// ---- Wikidata
async function sparql(query) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
    if (r.ok) return (await r.json()).results.bindings;
    await new Promise(res => setTimeout(res, 5000 * (i + 1)));
  }
  throw new Error('SPARQL failed');
}
async function qidOf(title) {
  const r = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&redirects=1&format=json&titles=${encodeURIComponent(title)}`, { headers: UA })).json();
  return Object.values(r.query.pages)[0]?.pageprops?.wikibase_item || null;
}
const BATTLE_TYPES = 'wd:Q178561 wd:Q188055 wd:Q645883 wd:Q1261499 wd:Q2001676 wd:Q3199915 wd:Q124757';
async function battlesOf(qid) {
  const rows = await sparql(`SELECT ?b ?bLabel ?bDescription ?coord ?pt ?ptp ?st ?stp ?en ?enp ?deaths ?cas ?article WHERE {
    ?b wdt:P361+ wd:${qid} .
    ?b wdt:P31/wdt:P279* ?type . VALUES ?type { ${BATTLE_TYPES} }
    OPTIONAL { ?b wdt:P625 ?coord }
    OPTIONAL { ?b p:P585/psv:P585 [ wikibase:timeValue ?pt ; wikibase:timePrecision ?ptp ] }
    OPTIONAL { ?b p:P580/psv:P580 [ wikibase:timeValue ?st ; wikibase:timePrecision ?stp ] }
    OPTIONAL { ?b p:P582/psv:P582 [ wikibase:timeValue ?en ; wikibase:timePrecision ?enp ] }
    OPTIONAL { ?b wdt:P1120 ?deaths } OPTIONAL { ?b wdt:P1590 ?cas }
    OPTIONAL { ?article schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
  const by = new Map();
  for (const r of rows) {
    const q = r.b.value.split('/').pop();
    const b = by.get(q) || { q, n: r.bLabel?.value, desc: r.bDescription?.value || '', deaths: 0, cas: 0 };
    if (b.n === q) continue; // no English label
    const m = r.coord?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    if (m && b.lon == null) { b.lon = +(+m[1]).toFixed(3); b.lat = +(+m[2]).toFixed(3); }
    // Wikidata precision: 11 day, 10 month, 9 year. A month-only date spans its month, a year-only date its year.
    const d = (v, p, atEnd) => {
      const s = v?.value?.slice(0, 10); if (!s) return null; const pr = +(p?.value || 11);
      if (pr >= 11) return s;
      if (pr === 10) return atEnd ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).toISOString().slice(0, 10) : s.slice(0, 7) + '-01';
      return atEnd ? s.slice(0, 4) + '-12-31' : s.slice(0, 4) + '-01-01';
    };
    const sp = +((r.st ? r.stp : r.ptp)?.value || 11);
    if (!b.s) { b.s = d(r.st, r.stp) || d(r.pt, r.ptp); b.e = d(r.en, r.enp, true) || d(r.pt, r.ptp, true) || d(r.st, r.stp, true); if (sp < 11) b.p = sp === 10 ? 'm' : 'y'; }
    b.deaths = Math.max(b.deaths, +(r.deaths?.value || 0)); b.cas = Math.max(b.cas, +(r.cas?.value || 0));
    if (r.article) b.w = decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
    by.set(q, b);
  }
  // Drop plans that were never carried out.
  const planned = /\b(proposed|planned|plan|cancelled|canceled|aborted)\b/i;
  return [...by.values()].filter(b => b.s && /^\d{4}-\d{2}-\d{2}$/.test(b.s) && !b.s.startsWith('-') && !planned.test(b.n) && !/\b(planned|proposed|never (carried out|executed|implemented)|cancelled|canceled)\b/i.test(b.desc));
}

// ---- Load sources
const X = require('xlsx');
const prioRows = X.utils.sheet_to_json(X.readFile(await download('https://cdn.cloud.prio.org/files/d21ef702-a546-45a8-b3c9-5b520dcc1239/PRIO%20Battle%20Deaths%20Dataset%2031.xls?inline=true', 'prio_bd31.xls')).Sheets.bdonly);
const prio = new Map(); // id -> year -> best
for (const r of prioRows) { const v = r.bdeadbes > 0 ? r.bdeadbes : r.bdeadlow > 0 ? r.bdeadlow : 0; const m = prio.get(r.id) || new Map(); m.set(r.year, (m.get(r.year) || 0) + v); prio.set(r.id, m); }
const cow = new Map(JSON.parse(readFileSync(join(ROOT, '../history/data/wars.json'), 'utf8')).wars.filter(w => w.src === 'cow').map(w => [+w.id.slice(1), w]));
const gedDir = unzip(await download('https://ucdp.uu.se/downloads/ged/ged261-csv.zip', 'ged261.zip'), 'ged');
// The latest cumulative candidate file for the current year (UCDP publishes one a month, e.g. GEDEvent_v26_01_26_09).
const page = await (await fetch('https://ucdp.uu.se/downloads/', { headers: UA })).text();
const cand = [...page.matchAll(/candidateged\/(GEDEvent_v(\d+)_01_(\d+)_(\d+)\.csv)/g)].sort((a, b) => (+a[3] * 100 + +a[4]) - (+b[3] * 100 + +b[4])).at(-1);
const gedCand = await download(`https://ucdp.uu.se/downloads/candidateged/${cand[1]}`, cand[1]);
const wars = WARS.filter(w => !ONLY || ONLY.includes(w.id));
const today = new Date().toISOString().slice(0, 10);

// GED events for every war at once (one pass over the file).
const gedIds = new Map(); for (const w of wars) for (const id of w.ged || []) (gedIds.get(String(id)) || gedIds.set(String(id), []).get(String(id))).push(w);
const events = new Map(wars.map(w => [w.id, []]));
let maxGed = '1989-01-01';
for (const path of [join(gedDir, 'GEDEvent_v26_1.csv'), gedCand]) {
  for await (const e of csvRows(path)) {
    if (e.type_of_violence !== '1') continue;
    const ws = gedIds.get(e.conflict_new_id); if (!ws) continue;
    const d = e.date_start?.slice(0, 10); if (!d) continue;
    if (d > maxGed) maxGed = d;
    for (const w of ws) if (d >= w.start && d <= (w.end || today)) events.get(w.id).push({ d, lat: +e.latitude, lon: +e.longitude, best: +e.best || 0, dyad: e.dyad_name, where: e.where_description, prec: +e.where_prec, a: +e.deaths_a || 0, b: +e.deaths_b || 0, civ: +e.deaths_civilians || 0 });
  }
}
console.log('GED loaded through', maxGed);

// ---- Per war
const index = [];
for (const w of wars) {
  const qid = await qidOf(w.wiki);
  const end = w.end || maxGed;
  const months = monthsBetween(ym(w.start), ym(end));
  const mi = new Map(months.map((m, i) => [m, i]));
  const battles = qid ? (await battlesOf(qid)).filter(b => b.s >= w.start.slice(0, 4) && b.s <= end) : [];
  battles.sort((a, b) => (a.s < b.s ? -1 : 1));
  const ev = events.get(w.id) || [];
  // Monthly deaths. Per year: PRIO's annual total where it has one (scaled to the war's share of the year when the
  // PRIO conflict also runs outside the war), spread over the months by UCDP event deaths, or by battle counts when
  // there are no events; otherwise UCDP event deaths as recorded; COW wars spread their single total the same way.
  const deaths = months.map(() => 0), estimated = months.map(() => false);
  const gedDeaths = months.map(() => 0);
  for (const e of ev) { const i = mi.get(ym(e.d)); if (i != null) gedDeaths[i] += e.best; }
  const weight = months.map(m => 1 + battles.filter(b => ym(b.s) <= m && ym(b.e) >= m).length);
  const spread = (total, idxs) => {
    const useGed = idxs.some(i => gedDeaths[i] > 0), wt = i => (useGed ? gedDeaths[i] + 1 : weight[i]);
    const ws = idxs.reduce((s, i) => s + wt(i), 0); for (const i of idxs) { deaths[i] += Math.round(total * wt(i) / ws); estimated[i] = true; }
  };
  const allIdx = months.map((_, i) => i);
  const parts = [];
  if (w.deaths.cow) { spread(cow.get(w.deaths.cow).deaths, allIdx); parts.push('Correlates of War war total, spread across months by recorded battles'); }
  else {
    const byYear = new Map();
    for (const id of w.deaths.prio || []) for (const [y, v] of prio.get(id) || []) if (v > 0) byYear.set(y, (byYear.get(y) || 0) + v);
    // A first or last year is scaled to the war's share of it only when the PRIO conflict was also fighting in the
    // year beside it (Afghanistan 2000–01), not when the year's deaths all fell inside the war (Korea 1950).
    const y0 = +w.start.slice(0, 4), y1 = +end.slice(0, 4), busy = y => (byYear.get(y) || 0) >= 1000;
    let usedPrio = false, usedGed = false;
    for (let y = y0; y <= y1; y++) {
      const idxs = allIdx.filter(i => months[i].startsWith(y + '-'));
      const share = (y === y0 && busy(y - 1)) || (y === y1 && busy(y + 1)) ? idxs.length / 12 : 1;
      if (byYear.has(y)) { spread(byYear.get(y) * share, idxs); usedPrio = true; }
      else for (const i of idxs) if (gedDeaths[i]) { deaths[i] = gedDeaths[i]; usedGed = true; }
    }
    if (usedPrio) parts.push('PRIO Battle Deaths annual totals, spread across months by ' + (ev.length ? 'UCDP events' : 'recorded battles'));
    if (usedGed) parts.push('UCDP GED recorded deaths (state-based violence)');
  }
  const source = parts.join('; ');
  // Events: per month, 0.2° cells with deaths and counts, and the five deadliest events.
  const cells = months.map(() => new Map()), top = months.map(() => []);
  for (const e of ev) {
    const i = mi.get(ym(e.d)); if (i == null || !isFinite(e.lat)) continue;
    const k = `${(Math.round(e.lat * 5) / 5).toFixed(1)},${(Math.round(e.lon * 5) / 5).toFixed(1)}`;
    const c = cells[i].get(k) || [+k.split(',')[0], +k.split(',')[1], 0, 0]; c[2] += e.best; c[3]++; cells[i].set(k, c);
    top[i].push(e);
  }
  const cellsOut = cells.map(m => [...m.values()]);
  const topOut = top.map(l => l.sort((a, b) => b.best - a.best).slice(0, 5).map(e => [e.d, e.best, e.where, e.dyad]));
  // Theatre bounds from battles and events (5th–95th percentile to drop strays), falling back to the sides' states.
  const pts = [...battles.filter(b => b.lat != null).map(b => [b.lon, b.lat]), ...ev.filter(e => isFinite(e.lat)).map(e => [e.lon, e.lat])];
  let bbox = null;
  if (pts.length) {
    const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
    const lo = pts.length > 200 ? 0.01 : 0, hi = 1 - lo;
    bbox = [q(pts.map(p => p[0]), lo), q(pts.map(p => p[1]), lo), q(pts.map(p => p[0]), hi), q(pts.map(p => p[1]), hi)];
  }
  const total = deaths.reduce((s, v) => s + v, 0);
  const norm = side => (side.gw || []).map(x => (Array.isArray(x) ? { gw: x[0], from: x[1] || null, to: x[2] || null } : { gw: x, from: null, to: null }));
  const bf = w.bf || (w.deaths.cow ? 'c' + w.deaths.cow : w.ged ? 'u' + w.ged[0] : null);
  const data = {
    id: w.id, name: w.name, qid, wiki: w.wiki, bf, start: w.start, end: w.end, ongoing: !w.end, dataThrough: w.end ? null : maxGed,
    months, deaths, estimated, deathsSource: source, totalDeaths: total,
    sides: { a: { label: w.sides.a.label, states: norm(w.sides.a) }, b: { label: w.sides.b.label, states: norm(w.sides.b) } },
    theatre: w.theatre || [], control: (w.control || []).map(([gw, side, from, to]) => ({ gw, side, from, to })),
    bbox, battles: battles.map(({ q, n, desc, lat, lon, s, e, p, deaths, cas, w: art }) => ({ q, n, desc, lat, lon, s, e, p: p || null, deaths: deaths || null, cas: cas || null, w: art || null })),
    cells: cellsOut, top: topOut, events: ev.length,
  };
  writeFileSync(join(WAR_DIR, w.id + '.json'), JSON.stringify(data));
  index.push({ id: w.id, name: w.name, qid, wiki: w.wiki, bf, start: w.start, end: w.end, ongoing: !w.end, totalDeaths: total, deathsSource: source,
    battles: battles.length, mappedBattles: battles.filter(b => b.lat != null).length, events: ev.length, sides: [w.sides.a.label, w.sides.b.label], bbox });
  console.log(`${w.id}: ${qid} ${months.length} months, ${battles.length} battles (${battles.filter(b => b.lat != null).length} mapped), ${ev.length} events, ${total.toLocaleString('en-GB')} deaths`);
}
const IDX = join(OUT, 'index.json');
const prev = existsSync(IDX) && ONLY ? JSON.parse(readFileSync(IDX, 'utf8')).wars.filter(x => !ONLY.includes(x.id)) : [];
const all = [...prev, ...index].sort((a, b) => (a.start < b.start ? -1 : 1));
writeFileSync(IDX, JSON.stringify({ generated: new Date().toISOString(), gedThrough: maxGed,
  sources: { ucdp: 'UCDP Georeferenced Event Dataset v26.1 and candidate events (Sundberg & Melander 2013; Davies et al. 2026), CC BY 4.0',
    prio: 'PRIO Battle Deaths Dataset v3.1 (Lacina & Gleditsch 2005)', cow: 'Correlates of War Project war data (Sarkees & Wayman 2010)',
    wikidata: 'Wikidata (CC0): battles, sieges and operations that are part of each war', borders: 'CShapes 2.0 (Schvitz et al. 2022)' },
  wars: all }));
console.log(`index: ${all.length} wars`);
