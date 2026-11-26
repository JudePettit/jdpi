// War Focus data build: one file per war in battlefield/focus/data/wars/<id>.json plus an index.
//   node battlefield/focus/scripts/build.mjs [--cache dir] [--only id,id] [--allow-drop]
//   node battlefield/focus/scripts/build.mjs --deaths-only [--cache dir] [--only id,id]
//   node battlefield/focus/scripts/build.mjs --sides-only [--cache dir] [--only id,id]
// Guard: nothing is written when a war lost its Wikidata item (its Wikipedia title no longer resolves), all or half
// of its battles, or a tenth of its UCDP events, or when the UCDP data ends earlier than before; --allow-drop writes.
// Sources (downloaded into the cache directory once):
//   · UCDP Georeferenced Event Dataset v26.1 (1989–2025) and the candidate events of every later year: geolocated clashes with deaths.
//   · PRIO Battle Deaths Dataset v3.1: annual battle deaths, its years 1946–1988 only. Its page states no licence; VM
//     keeps these years until its owner decides (20 November 2026).
//   · UCDP Battle-Related Deaths Dataset v26.1, conflict level (CC BY 4.0): annual battle deaths from 1989, in place of
//     PRIO's years 1989–2008 (by the war's `ged` conflicts, else the UCDP conflict of its bf u<id>).
//   · Wikidata: the war's item and every battle, siege or military operation that is part of it, with coordinates,
//     dates and recorded deaths.
// Months with UCDP events use their recorded deaths. Other months spread each year's total (PRIO's or UCDP's) across
// its months in proportion to the UCDP events or the battles recorded in each month; these are flagged as estimates.
// A war no free source gives battle deaths for (deaths: {}, the nine before 1946) has no figure: totalDeaths null.
//   · States (sides, the contested state, occupation) are Wikidata Q-ids (scripts/wars.mjs), each named as the
//     Retrospective Battlefield names its places (battlefield/history/data/places.json), else by its Wikidata label and
//     inception (wbgetentities, cached in <cache>/state-names.json). No Gleditsch–Ward number is read or written (21
//     November 2026).
//   · Borders: Cliopatria v0.2.1 (CC BY 4.0), the Omni-Map's (omni/data/borders/1900-1999 and 2000-2024), for each
//     war's theatre: the boxes of its states' rows (stateBoxes, scripts/rules.mjs) through the Battlefield's crosswalk
//     (places.json `rows`), a state no row holds then taking its reference land's boxes (scripts/lands.mjs), else the
//     war's committed bbox. The page draws the spans scripts/build-borders.mjs cuts from the same files.
//   · Lands (scripts/lands.mjs, 21 November 2026), from the same rows and crosswalk: for each year of a war, the states
//     drawn only as a fragment (listed in `unplaced` with the states no row holds), the polygons drawn uncoloured as
//     another war state's land, and the war's states whose land lies joined inside another row (`lands`).
//   · A war's nameAs (scripts/wars.mjs): the earlier state's Wikidata label and dissolution year (P576), the same call.
// Order of steps: (--sides-only) each committed war file's states again from scripts/wars.mjs, their lands, the states
// VM cannot place, and their names, then the war files and the index's sources; else load PRIO and UCDP BRD; then (a
// full build) GED, each war's battles
// from Wikidata and Wikipedia, its deaths, the guard, then every file; or (--deaths-only) each committed war file's
// months, UCDP cells and battles, its deaths again from the yearly totals, then the war files and the index. Nothing is
// written until every step has worked.
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { WARS, leftOutOf } from './wars.mjs';
import { battleDates, fixDates, partsWithin, apportion, eventMonths, monthWeights, wdDate, decadeFits, stateBoxes, infoboxEnd, endAgainstArticle, casualtiesOf, byStart, pickCoord } from './rules.mjs';
import { linkParts, ownDeaths, groupBattles, ownFigure } from '../figures.mjs';
import { readArticle, battleFigures, wdStatements, keptFigures } from './infobox.mjs';
import { candidateFiles } from '../../scripts/ucdp.mjs';
import { refuseIfLost } from '../../../calendar/scripts/guard.mjs';
import { rowPlace, warStates, warStatesIn, drawnRow, unplacedIn } from '../places.mjs';
import { decodeRows, makeLands } from './lands.mjs';
import { DOTS, dotOn } from '../dots.mjs';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'data'), WAR_DIR = join(OUT, 'wars'), FIG_DIR = join(OUT, 'figures');
mkdirSync(WAR_DIR, { recursive: true });
mkdirSync(FIG_DIR, { recursive: true });
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CACHE = arg('--cache') || join(tmpdir(), 'warfocus-src');
const ONLY = arg('--only')?.split(',');
const DEATHS_ONLY = process.argv.includes('--deaths-only');
const SIDES_ONLY = process.argv.includes('--sides-only');
const PRIO_TO = 1988, BRD_FROM = 1989, BRD_TO = 2008;
mkdirSync(CACHE, { recursive: true });
const UA = { 'User-Agent': process.env.VM_UA || 'JDP-I War Focus (https://jdpi.pages.dev; research use)' };
const pause = ms => new Promise(res => setTimeout(res, ms));

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
// A second before each query, so a war's queries do not arrive at once.
async function sparql(query) {
  for (let i = 0; i < 4; i++) {
    await pause(1000);
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
    // A query that runs out of time after its answer has begun comes back 200 with the error text inside the JSON (16
    // November 2026, the Second World War's battles): asked again, after the same wait as a refusal.
    if (r.ok) { try { return JSON.parse(await r.text()).results.bindings; } catch { console.log(`  SPARQL answer cut short: waiting ${5 * (i + 1)} s`); await pause(5000 * (i + 1)); continue; } }
    console.log(`  SPARQL ${r.status}: waiting ${5 * (i + 1)} s`);
    await pause(5000 * (i + 1));
  }
  throw new Error('SPARQL failed');
}
async function qidOf(title) {
  const r = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&redirects=1&format=json&titles=${encodeURIComponent(title)}`, { headers: UA })).json();
  return Object.values(r.query.pages)[0]?.pageprops?.wikibase_item || null;
}
const BATTLE_TYPES = 'wd:Q178561 wd:Q188055 wd:Q645883 wd:Q1261499 wd:Q2001676 wd:Q3199915 wd:Q124757';
const DATES = `OPTIONAL { ?b p:P585/psv:P585 [ wikibase:timeValue ?pt ; wikibase:timePrecision ?ptp ] }
    OPTIONAL { ?b p:P580/psv:P580 [ wikibase:timeValue ?st ; wikibase:timePrecision ?stp ] }
    OPTIONAL { ?b p:P582/psv:P582 [ wikibase:timeValue ?en ; wikibase:timePrecision ?enp ] }`;
const addTime = (list, v, p) => { if (v && !list.some(x => x.v === v.value && x.p === p?.value)) list.push({ v: v.value, p: p?.value ?? 11 }); };
// The items within a war: every item that is part of it (P361+), with the item it is part of and its dates, walked
// down from the war by partsWithin (scripts/rules.mjs) so that no wider or later campaign brings in another war's battles.
// And not from a wider operation that is also part of something outside the war down to a part of it fought outside
// the war's theatre (partsWithin, with each item's place: its coordinates, or its location's).
async function partsOf(qid, span, theatre) {
  const rows = await sparql(`SELECT ?b ?parent ?pt ?ptp ?st ?stp ?en ?enp WHERE { ?b wdt:P361+ wd:${qid} . ?b wdt:P361 ?parent . ${DATES} }`);
  const placeRows = await sparql(`SELECT ?b (SAMPLE(?co) AS ?c) (SAMPLE(?lco) AS ?lc) WHERE { ?b wdt:P361+ wd:${qid} . OPTIONAL { ?b wdt:P625 ?co } OPTIONAL { ?b wdt:P276/wdt:P625 ?lco } } GROUP BY ?b`);
  const places = new Map();
  for (const r of placeRows) {
    const m = (r.c || r.lc)?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    if (m) places.set(r.b.value.split('/').pop(), [+m[1], +m[2]]);
  }
  const edges = [], times = new Map();
  for (const r of rows) {
    const c = r.b.value.split('/').pop(), parent = r.parent.value.split('/').pop();
    edges.push({ c, parent });
    const t = times.get(c) || times.set(c, { start: [], end: [], point: [] }).get(c);
    addTime(t.start, r.st, r.stp); addTime(t.end, r.en, r.enp); addTime(t.point, r.pt, r.ptp);
  }
  // An item with parts of its own is dated by its start and end only: a point in time given for a campaign is often
  // its last day (Operation Deny Flight, 1993–95, has only 20 December 1995). A battle with no parts also by its point.
  const dates = new Map(), parents = new Set(edges.map(x => x.parent));
  for (const [q, t] of times) {
    const point = parents.has(q) ? [] : t.point;
    const s = [...t.start, ...point].map(x => wdDate(x.v, x.p)).filter(Boolean).sort()[0] || null;
    const e = (t.end.length ? t.end : t.start.length ? [] : point).map(x => wdDate(x.v, x.p, true)).filter(Boolean).sort().at(-1) || null;
    dates.set(q, { s, e });
  }
  return { within: partsWithin(edges, dates, qid, span, { places, ...theatre }), edges };
}
// ---- English Wikipedia (CC BY-SA 4.0): each battle's lead section (its infobox), at a named revision (BF-08).
// Politely: 50 titles a request, one request at a time, a second apart, maxlag=5, four tries (after Retry-After, or 5,
// 10, 15 s). First the revision each title is at (a small answer), then the text of the revisions not already in the
// cache (<cache>/wikipedia/<revid>.json). A batch that fails four times is left out and counted (`wpFailed`): its
// battles keep their last committed figures. Never round a refusal: on a 429 or 403 the build waits as told, and stops.
const WP_DIR = join(CACHE, 'wikipedia');
mkdirSync(WP_DIR, { recursive: true });
const wpFailed = new Set();
// A source that fails three batches running is down for this run (review R3-04): its other batches are not tried, so
// the run ends in minutes with the last committed figures kept, not killed at the time limit. A request that hangs is
// given up after a minute.
const breaker = { wikipedia: 0, wikidata: 0 }, DOWN = 3, TIMEOUT = 60000;
async function wpApi(params) {
  if (breaker.wikipedia >= DOWN) return null;
  const url = `https://en.wikipedia.org/w/api.php?format=json&formatversion=2&maxlag=5&${params}`;
  for (let k = 0; k < 4; k++) {
    await pause(1000);
    let res = null;
    try { res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) }); } catch (e) { console.log(`  Wikipedia: ${e.message}; waiting ${5 * (k + 1)} s`); await pause(5000 * (k + 1)); continue; }
    const wait = (+res.headers.get('retry-after') || 5 * (k + 1)) * 1000;
    if (res.status === 403) throw new Error('Wikipedia refused the request (403): stopping, not working round it');
    if (!res.ok) { console.log(`  Wikipedia ${res.status}: waiting ${wait / 1000} s`); await pause(wait); continue; }
    const j = await res.json().catch(() => null);
    if (j?.error) { console.log(`  Wikipedia ${j.error.code}: waiting ${wait / 1000} s`); await pause(wait); continue; }
    if (j) { breaker.wikipedia = 0; return j; }
  }
  if (++breaker.wikipedia >= DOWN) console.log(`  Wikipedia: ${DOWN} batches failed in a row; not asked again this run`);
  return null;
}
/** Map title → { text, rev, ts, page, redirected } for each title the API answers (through normalisation and redirects). */
async function fetchLeads(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const ids = await wpApi(`action=query&prop=revisions&rvprop=ids|timestamp&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`);
    if (!ids) { batch.forEach(t => wpFailed.add(t)); console.log(`  Wikipedia: ${batch.length} titles not read this time`); continue; }
    const norm = new Map((ids.query?.normalized || []).map(x => [x.from, x.to])), redir = new Map((ids.query?.redirects || []).map(x => [x.from, x]));
    const pages = new Map((ids.query?.pages || []).filter(p => p.revisions?.length).map(p => [p.title, { rev: p.revisions[0].revid, ts: p.revisions[0].timestamp }]));
    const want = [...pages.values()].filter(p => !existsSync(join(WP_DIR, `${p.rev}.json`))).map(p => p.rev);
    if (want.length) {
      const txt = await wpApi(`action=query&prop=revisions&rvprop=content|ids|timestamp&rvslots=main&rvsection=0&revids=${want.join('|')}`);
      if (!txt) { batch.forEach(t => wpFailed.add(t)); console.log(`  Wikipedia: ${batch.length} articles not read this time`); continue; }
      for (const p of txt.query?.pages || []) for (const r of p.revisions || []) writeFileSync(join(WP_DIR, `${r.revid}.json`), JSON.stringify({ title: p.title, rev: r.revid, ts: r.timestamp, text: r.slots?.main?.content || '' }));
    }
    for (const t of batch) {
      let k = norm.get(t) || t, redirected = false;
      for (let n = 0; n < 3 && redir.has(k); n++) { const x = redir.get(k); redirected = true; k = x.to; }
      const p = pages.get(k), file = p && join(WP_DIR, `${p.rev}.json`);
      if (file && existsSync(file)) out.set(t, { ...JSON.parse(readFileSync(file, 'utf8')), page: k, redirected });
    }
  }
  return out;
}

// ---- Wikidata's statements of deaths, casualties, injured and missing, read in full from its JSON (wbgetentities):
// every value with its rank, qualifiers and references (infobox.mjs wdStatements). 50 items a request, a second apart,
// four tries; cached for the day (<cache>/wikidata/<date>/). A batch that fails is counted (`wdFailed`): its battles
// keep their last committed figures.
const wdFailed = new Set();
async function wdEntities(qids) {
  const dir = join(CACHE, 'wikidata', new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50), file = join(dir, createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 16) + '.json');
    let j = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    for (let k = 0; k < 4 && !j && breaker.wikidata < DOWN; k++) {
      await pause(1000);
      try {
        const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&maxlag=5&ids=${ids.join('|')}`, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
        const wait = (+res.headers.get('retry-after') || 5 * (k + 1)) * 1000;
        if (res.status === 403) throw new Error('Wikidata refused the request (403): stopping, not working round it');
        const body = res.ok ? await res.json().catch(() => null) : null;
        if (body?.entities) { j = { entities: Object.fromEntries(Object.entries(body.entities).map(([q, e]) => [q, { claims: Object.fromEntries(['P1120', 'P1590', 'P1339', 'P1446'].filter(p => e.claims?.[p]).map(p => [p, e.claims[p]])) }])) }; writeFileSync(file, JSON.stringify(j)); }
        else { console.log(`  Wikidata ${res.status}${body?.error ? ' ' + body.error.code : ''}: waiting ${wait / 1000} s`); await pause(wait); }
      } catch (e) { if (/refused/.test(e.message)) throw e; console.log(`  Wikidata: ${e.message}`); await pause(5000 * (k + 1)); }
    }
    if (!j) { ids.forEach(q => wdFailed.add(q)); if (breaker.wikidata < DOWN && ++breaker.wikidata >= DOWN) console.log(`  Wikidata: ${DOWN} batches failed in a row; not asked again this run`); console.log(`  Wikidata: ${ids.length} items not read this time`); continue; }
    breaker.wikidata = 0;
    for (const q of ids) out.set(q, wdStatements(j.entities[q]));
  }
  return out;
}

// ---- UCDP's clashes near a battle (BF-08): for a battle since 1989 placed and dated to the day, the war's recorded
// events (state-based) dated to the day inside its dates and placed to a town or nearer (where_prec 1–2) within 25 km.
// A separate measure, shown apart and never ranked: { v (best), low, high, n (events), km }.
const KM = 25;
const distKm = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
// The reader never stops the build: a field it trips on is a field not read.
function readSafely(text, b) { try { return readArticle(text, { s: b.s, e: b.e || b.eW }); } catch (e) { console.log(`  ${b.q} ${b.n}: the reader failed (${e.message}); not read`); return { state: 'unread', sides: [] }; } }
function ucdpNear(b, ev) {
  // A day-precise date has no `p` (scripts/rules.mjs); an end at another precision has `pe`.
  if (!b.s || b.s < '1989-01-01' || b.lat == null || b.p != null || (b.pe && b.pe !== 'd') || b.u) return null;
  // A battle of several separate days (rules.mjs battleDates, pts): the clashes of those days, not of the days between.
  const e1 = b.e || b.s, inDates = e => (b.pts ? b.pts.some(d => d.length === 10 && e.d >= d && e.de <= d) : e.d >= b.s && e.de <= e1);
  const hit = ev.filter(e => e.dp === 1 && e.prec <= 2 && inDates(e) && isFinite(e.lat) && distKm(b.lat, b.lon, e.lat, e.lon) <= KM);
  if (!hit.length) return null;
  const sum = k => hit.reduce((s, e) => s + (e[k] || 0), 0);
  return { v: sum('best'), low: sum('low'), high: sum('high'), n: hit.length, km: KM };
}
// Each item's recorded deaths (P1120) as statements, with the date a figure was counted (its P585), at the rank the
// truthy value has (preferred where there is one, else normal, never deprecated); and its "has part(s)" (P527), so a
// whole and its parts are linked when only the whole names them. Asked of the war's battles by their ids, 250 at a
// time: asked through the war's P361 tree, as the other queries are, Wikidata's query service times out on it.
// Casualties (P1590) as statements too, with their "statement is subject of" (P805), since a figure about something
// else is no casualty count (rules.mjs casualtiesOf: the atomic bombings' 201,779 hibakusha are living survivors).
// Its places (P625, best rank) here too: asked with the battles through the P361 tree, the Second World War's answer
// ran past the query service's minute (16 November 2026), as each extra place multiplies an item's rows.
async function deathsAndParts(qids) {
  const rows = [];
  for (let i = 0; i < qids.length; i += 250) rows.push(...await sparql(`SELECT ?b ?k ?d ?rank ?at ?c ?crank ?about ?coord WHERE { VALUES ?b { ${qids.slice(i, i + 250).map(q => 'wd:' + q).join(' ')} }
    { ?b wdt:P527 ?k } UNION { ?b p:P1120 ?s . ?s ps:P1120 ?d ; wikibase:rank ?rank . OPTIONAL { ?s pq:P585 ?at } }
    UNION { ?b p:P1590 ?cs . ?cs ps:P1590 ?c ; wikibase:rank ?crank . OPTIONAL { ?cs pq:P805 ?about } } UNION { ?b wdt:P625 ?coord } }`));
  const has = [], stmts = new Map(), casStmts = new Map(), coords = new Map();
  const rank = v => (/Preferred/.test(v) ? 'preferred' : /Deprecated/.test(v) ? 'deprecated' : 'normal');
  for (const r of rows) {
    const b = r.b.value.split('/').pop();
    if (r.k) has.push({ c: r.k.value.split('/').pop(), parent: b });
    if (r.d && !/Deprecated/.test(r.rank.value)) (stmts.get(b) || stmts.set(b, []).get(b)).push({ v: +r.d.value, pref: /Preferred/.test(r.rank.value), at: r.at?.value.slice(0, 10) || null });
    const m = r.coord?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    if (m) { const c = [+(+m[2]).toFixed(3), +(+m[1]).toFixed(3)], l = coords.get(b) || coords.set(b, []).get(b); if (!l.some(x => x[0] === c[0] && x[1] === c[1])) l.push(c); }
    if (r.c) (casStmts.get(b) || casStmts.set(b, []).get(b)).push({ v: +r.c.value, rank: rank(r.crank.value), about: r.about?.value.split('/').pop() || null });
  }
  const deaths = new Map(), cas = new Map();
  for (const [b, list] of stmts) { const best = list.some(s => s.pref) ? list.filter(s => s.pref) : list; deaths.set(b, best.filter(s => s.v > 0)); }
  for (const [b, list] of casStmts) cas.set(b, casualtiesOf(list));
  return { has, deaths, cas, coords };
}
// ---- Date corrections (review front-pages-9, 25 November 2026): a battle whose Wikidata date gives no reference and
// whose own English Wikipedia article gives another. Each entry names its source, at the revision read; the battle
// keeps Wikidata's start in sW and the page says both (rules.mjs fixDates). Once Wikidata gives the same date the entry
// changes nothing, and the build says it can go; an entry whose battle is no longer among its war's battles is warned
// of, and one whose battle has no start in Wikidata stops the build (fixDates), so no correction stops applying unseen.
const DATE_FIXES = [
  { war: 'ww2', q: 'Q180182', s: '1945-02-19', source: 'English Wikipedia, "Battle of Iwo Jima", its infobox: "19 February – 26 March 1945" (revision 1387000548, read 25 November 2026); Wikidata starts it on 8 February 1945 (P580) with no reference', url: 'https://en.wikipedia.org/w/index.php?oldid=1387000548' },
];
const FIXES = new Map(DATE_FIXES.map(f => [f.q, f]));
async function battlesOf(qid, span, theatre, warId) {
  const { within, edges } = await partsOf(qid, span, theatre);
  // What War Focus leaves out of this war although Wikidata makes it part of it (wars.mjs LEFT_OUT, with its reason).
  const left = leftOutOf(warId, edges);
  const wasWithin = new Set([...left.keys()].filter(q => within.has(q)));
  for (const q of left.keys()) within.delete(q);
  const rows = await sparql(`SELECT ?b ?bLabel ?bDescription ?pt ?ptp ?st ?stp ?en ?enp ?article WHERE {
    ?b wdt:P361+ wd:${qid} .
    ?b wdt:P31/wdt:P279* ?type . VALUES ?type { ${BATTLE_TYPES} }
    ${DATES}
    OPTIONAL { ?article schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
  const { has, deaths, cas, coords } = await deathsAndParts([...new Set(rows.map(r => r.b.value.split('/').pop()))].filter(q => within.has(q)));
  const by = new Map();
  for (const r of rows) {
    const q = r.b.value.split('/').pop();
    if (!within.has(q)) continue; // reached only through a campaign outside the war (partsWithin)
    const b = by.get(q) || { q, n: r.bLabel?.value, desc: r.bDescription?.value || '', deaths: 0, cas: cas.get(q) || 0, t: { start: [], end: [], point: [] }, dvals: deaths.get(q) || [], coords: coords.get(q) || [] };
    if (b.n === q) continue; // no English label
    addTime(b.t.start, r.st, r.stp); addTime(b.t.end, r.en, r.enp); addTime(b.t.point, r.pt, r.ptp);
    if (r.article) b.w = decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
    by.set(q, b);
  }
  // Every place it has (its best-ranked P625s): one picked the same whatever order Wikidata answers in (the first
  // row's, as until November 2026, moved between runs), and a whole's again once its parts are known (wholesAndParts).
  for (const b of by.values()) { const c = pickCoord(b.coords); if (c) { b.lat = c[0]; b.lon = c[1]; } }
  // Dates by battleDates (scripts/rules.mjs): Wikidata's precision kept, a decade alone no date (the battle is listed
  // as undated), an end before the start or after the war's end not drawn as a span. Then drop plans that were never
  // carried out.
  const planned = /\b(proposed|planned|plan|cancelled|canceled|aborted)\b/i;
  const out = [];
  for (const b of by.values()) {
    const d = fixDates(battleDates({ start: b.t.start, end: b.t.end, point: b.t.point, name: b.n, warEnd: span.warEnd }), FIXES.get(b.q));
    if (!d) continue;
    if (FIXES.has(b.q)) console.log(d.sW ? `  date corrected: ${b.q} ${b.n} from ${d.s}, not Wikidata's ${d.sW} (DATE_FIXES)` : `  date correction for ${b.q} ${b.n}: Wikidata now gives ${d.s}, so its DATE_FIXES entry can go`);
    delete b.t; Object.assign(b, d);
    out.push(b);
  }
  for (const f of DATE_FIXES) if (f.war === warId && !out.some(b => b.q === f.q)) console.warn(`  DATE_FIXES ${f.q}: not among ${warId}'s battles, so the correction is not applied`);
  const kept = out.filter(b => (b.u === 'undated' ? b.dec != null : /^\d{4}-\d{2}-\d{2}$/.test(b.s) && !b.s.startsWith('-')) && !planned.test(b.n) && !/\b(planned|proposed|never (carried out|executed|implemented)|cancelled|canceled)\b/i.test(b.desc));
  // An end checked against the battle's English Wikipedia article (endAgainstArticle, scripts/rules.mjs): only where
  // Wikidata's runs more than a month, as it must to end over a month after the article's.
  const long = kept.filter(b => b.w && b.s && !b.pts && (b.e || b.u === 'after') && dayNo(b.e || b.eW) - dayNo(b.s) > 31 && (b.u === 'after' || (b.pe === 'd' ? null : b.pe || b.p) !== 'y'));
  // Every battle's article is read once (BF-08: its infobox's casualties too, scripts/infobox.mjs), at the revision named.
  const articles = await fetchLeads([...new Set(kept.filter(b => b.w).map(b => b.w))]);
  if (long.some(b => wpFailed.has(b.w))) throw new Error('Wikipedia lead sections failed (an end could not be checked against its article)');
  let conflicts = 0;
  for (const b of long) {
    const d = endAgainstArticle(b, infoboxEnd(articles.get(b.w)?.text), span.warEnd);
    if (d !== b) { Object.assign(b, d); conflicts++; }
  }
  if (long.length) console.log(`  ${long.length} ends checked against Wikipedia, ${conflicts} drawn to the article's earlier end`);
  // Each row of LEFT_OUT that applied, with the battles and operations it took out: those within the war's span and
  // theatre (partsWithin) that would otherwise have been read for the list, not every item Wikidata files under them.
  const leftOut = [...new Set(left.values())].map(row => {
    const items = [...new Set(rows.map(r => r.b.value.split('/').pop()).filter(q => wasWithin.has(q) && left.get(q) === row))];
    if (items.length) console.log(`  left out: ${row.name} and its parts, ${items.length} items (wars.mjs LEFT_OUT)`);
    return { q: row.qid, n: row.name, items: items.length, why: row.why, source: row.source, url: row.url };
  }).filter(x => x.items);
  return { battles: kept, edges: [...edges, ...has], articles, leftOut };
}
// A whole and its parts (figures.mjs, RV-05 A1): the links between the war's own battles both ways (`up` on a part,
// `upAlso` where it has another whole in the list, `parts` on the whole), and each item's own death figure: a figure
// Wikidata gives a whole that is one of its parts' own is left to that part (`dv` keeps every figure recorded). A
// figure counted over a year after the battle (the cities' registers of the atomic bombings' dead, counted to 2013)
// keeps its date (`dAt`), so the page can say so.
// A part with two wholes goes under the one whose recorded figure holds it, then whose dates hold it (linkParts, the
// second reader's WF2-04). An item Wikidata places in several places is put at its first part's (pickCoord).
function wholesAndParts(battles, edges, warId = '') {
  const facts = new Map(battles.map(b => [b.q, { v: Math.max(0, ...b.dvals.map(s => s.v)), s: b.s || null, e: b.e || null }]));
  const links = linkParts(battles.map(b => b.q), edges, facts), by = new Map(battles.map(b => [b.q, b]));
  for (const b of battles) {
    const parts = links.get(b.q).parts.map(q => by.get(q)).filter(p => p.lat != null && p.s).sort(byStart);
    if (b.coords?.length > 1 && parts.length) { const c = pickCoord(b.coords, parts.map(p => [p.lat, p.lon])); b.lat = c[0]; b.lon = c[1]; }
  }
  for (const b of battles) {
    const l = links.get(b.q), kids = [...edges.filter(x => x.parent === b.q && x.c !== b.q && by.has(x.c)).map(x => x.c)];
    const partValues = new Set(kids.flatMap(k => by.get(k).dvals.map(s => s.v)));
    const { deaths, dv } = ownDeaths(b.dvals.map(s => s.v), partValues);
    b.deaths = deaths; b.dv = dv;
    const at = deaths && b.dvals.filter(s => s.v === deaths).map(s => s.at).filter(Boolean).sort()[0];
    const over = b.e || b.s || (b.dec != null ? `${b.dec + 9}-12-31` : null);
    b.dAt = at && over && dayNo(at) - dayNo(over) > 366 ? at : null;
    b.up = l.up; b.upAlso = l.upAlso; b.parts = l.parts;
  }
  // For review (WF2-03): a whole ranked by its own figure where its parts' add up to more, which says a part's figure
  // is wrong or covers more than the whole does.
  for (const n of groupBattles(battles).byQ.values()) if (n.from === 'own' && n.sum > n.fig) console.log(`  review ${warId}: ${n.b.q} ${n.b.n}: its own ${n.fig}, its parts' ${n.sum} (ranked by its own)`);
}
const dayNo = d => Date.parse(d + 'T00:00:00Z') / 864e5;

// The war's id in the Retrospective Battlefield (its wars.json): bf as written, else u<first GED conflict id>.
const bfOf = w => w.bf || (w.ged ? 'u' + w.ged[0] : null);

// Monthly deaths. Per year: an annual total where one source has it (PRIO's to 1988, UCDP Battle-Related Deaths' for
// 1989–2008), scaled to the war's share of the year when the conflict also runs outside the war, spread over the
// months by UCDP event deaths, or by battle counts when there are no events; otherwise UCDP event deaths as recorded.
// A war with no free source for its deaths (deaths: {}) has none: every month 0, not an estimate, and total null.
function deathsFor(w, months, end, gedDeaths, shared, dated, events) {
  const deaths = months.map(() => 0), estimated = months.map(() => false);
  if (!w.deaths.prio && !w.deaths.ucdp) {
    return { deaths, estimated, covered: null, total: null,
      source: 'No free source gives this war’s battle deaths by month or year, so none is shown; each battle’s own figures are listed below' };
  }
  // A battle dated only to its year weighs no month (rules.mjs monthWeights, S0).
  const weight = monthWeights(months, dated);
  // A total shared out in whole deaths that add up to it (apportion).
  const spread = (total, idxs) => {
    const useGed = idxs.some(i => gedDeaths[i] > 0), wt = i => (useGed ? gedDeaths[i] + 1 : weight[i]);
    apportion(total, idxs.map(wt)).forEach((n, k) => { deaths[idxs[k]] += n; estimated[idxs[k]] = true; });
  };
  const allIdx = months.map((_, i) => i), parts = [];
  const byYear = new Map(), from = new Map();
  const add = (y, v, src) => { byYear.set(y, (byYear.get(y) || 0) + v); from.set(y, src); };
  for (const id of w.deaths.prio || []) for (const [y, v] of prio.get(id) || []) if (v > 0) add(y, v, 'prio');
  // UCDP's years only for a war PRIO counted (the years PRIO's v3.1 gave to 2008).
  if (w.deaths.prio) {
    const ids = w.ged || (/^u\d+$/.test(bfOf(w) || '') ? [bfOf(w).slice(1)] : []);
    for (const id of ids) for (const [y, v] of brd.get(String(id)) || []) add(y, v, 'brd');
  }
  // A first or last year is scaled to the war's share of it only when the conflict was also fighting in the year
  // beside it (Afghanistan 2000–01), not when the year's deaths all fell inside the war (Korea 1950).
  const y0 = +w.start.slice(0, 4), y1 = +end.slice(0, 4), busy = y => (byYear.get(y) || 0) >= 1000;
  const used = new Set();
  let usedGed = false;
  for (let y = y0; y <= y1; y++) {
    const idxs = allIdx.filter(i => months[i].startsWith(y + '-'));
    const share = (y === y0 && busy(y - 1)) || (y === y1 && busy(y + 1)) ? idxs.length / 12 : 1;
    if (byYear.has(y)) { spread(byYear.get(y) * share, idxs); used.add(from.get(y)); }
    else for (const i of idxs) if (gedDeaths[i]) { deaths[i] = gedDeaths[i]; usedGed = true; }
  }
  const by = events ? 'UCDP events' : 'recorded battles';
  if (used.has('prio')) parts.push(`PRIO Battle Deaths annual totals to 1988, spread across months by ${by}`);
  if (used.has('brd')) parts.push(`UCDP Battle-Related Deaths annual totals for 1989–2008, spread across months by ${by}`);
  if (usedGed) parts.push('UCDP GED recorded deaths (state-based violence)' + (shared.some(Boolean) ? ', an event UCDP dates only to a period shared out over the days of that period' : ''));
  return { deaths, estimated, covered: null, total: deaths.reduce((s, v) => s + v, 0), source: parts.join('; ') };
}

// --deaths-only: each committed war file's deaths again from the yearly totals, with its months, UCDP cells (their
// deaths add up to the month's UCDP deaths) and battles as built; then the war files and the index's entries.
function deathsOnly() {
  const IDXF = join(OUT, 'index.json'), idx = JSON.parse(readFileSync(IDXF, 'utf8')), out = [];
  for (const w of wars) {
    const file = join(WAR_DIR, w.id + '.json'), d = JSON.parse(readFileSync(file, 'utf8'));
    const gedDeaths = d.months.map((_, i) => (d.cells[i] || []).reduce((s, c) => s + (c[2] || 0), 0));
    const shared = d.shared || d.months.map(() => 0);
    const r = deathsFor(w, d.months, w.end || d.dataThrough || today, gedDeaths, shared, (d.battles || []).filter(b => b.s), d.events);
    Object.assign(d, { bf: bfOf(w), deaths: r.deaths, estimated: r.estimated, deathsSource: r.source, totalDeaths: r.total, covered: r.covered });
    const e = idx.wars.find(x => x.id === w.id); if (!e) throw new Error(`${w.id}: not in the index`);
    Object.assign(e, { bf: bfOf(w), totalDeaths: r.total, deathsSource: r.source });
    out.push([file, JSON.stringify(d)]);
    console.log(`${w.id}: ${r.total == null ? 'no figure' : r.total.toLocaleString('en-GB')} · ${r.source.slice(0, 90)}`);
  }
  delete idx.sources.cow;
  idx.sources.prio = 'PRIO Battle Deaths Dataset v3.1 (Lacina & Gleditsch 2005), its years 1946–1988 only; its page states no licence, and VM keeps these years until its owner decides';
  idx.sources.brd = 'UCDP Battle-Related Deaths Dataset v26.1, conflict level (Davies et al. 2026), CC BY 4.0: 1989–2008';
  for (const [file, text] of out) writeFileSync(file, text);
  writeFileSync(IDXF, JSON.stringify(idx));
  console.log(`deaths again for ${out.length} wars`);
}

// ---- States and borders (21 November 2026). A war's states as the files hold them: sides { label, states [{ q, from,
// to }] }, theatre [Q], control [{ q, side, from, to }], and names { Q: { n, since? } }.
const SITE = join(ROOT, '../../');
const PLACES = JSON.parse(readFileSync(join(SITE, 'battlefield/history/data/places.json'), 'utf8'));
const BORDERS_SOURCE = 'Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0: one border a year';
const FIRST_YEAR = 1926;
const norm = side => (side.q || []).map(x => (Array.isArray(x) ? { q: x[0], from: x[1] || null, to: x[2] || null } : { q: x, from: null, to: null }));
const statesOf = w => ({ sides: { a: { label: w.sides.a.label, states: norm(w.sides.a) }, b: { label: w.sides.b.label, states: norm(w.sides.b) } },
  theatre: w.theatre || [], control: (w.control || []).map(([q, side, from, to]) => ({ q, side, from, to })) });
// Each state's name: the Battlefield's (places.json, Wikidata's English label and its inception where after 1926), else
// Wikidata's, read the same way (build-history.mjs step 5): its English label and its earliest inception (P571).
// A war's nameAs { Q: Q2 } names Q by Q2's label to the year of Q2's dissolution (P576): `then` { n, to }.
async function namesOf(qs, nameAs = {}) {
  const file = join(CACHE, 'state-names.json');
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const earlier = Object.values(nameAs);
  const need = [...new Set([...qs.filter(q => !PLACES.places[q]), ...earlier])].filter(q => !cache[q] || (earlier.includes(q) && cache[q].to == null));
  for (let i = 0; i < need.length; i += 50) {
    const ids = need.slice(i, i + 50);
    await pause(1000);
    const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|claims&languages=en&maxlag=5&ids=${ids.join('|')}`, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (res.status === 403) throw new Error('Wikidata refused the request (403): stopping, not working round it');
    if (!res.ok) throw new Error(`Wikidata: ${res.status} for the states' names`);
    const body = await res.json();
    for (const q of ids) {
      const e = body.entities?.[q];
      if (!e || e.missing != null || !e.labels?.en?.value) throw new Error(`Wikidata holds no English label for ${q}`);
      const years = p => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => /^\+?(-?\d+)-/.exec(c.mainsnak?.datavalue?.value?.time || '')?.[1]).filter(Boolean).map(Number);
      const since = years('P571'), to = years('P576');
      cache[q] = { n: e.labels.en.value, ...(since.length && Math.min(...since) > FIRST_YEAR ? { since: Math.min(...since) } : {}), ...(to.length ? { to: Math.max(...to) } : {}) };
      if (earlier.includes(q) && cache[q].to == null) throw new Error(`Wikidata gives ${q} no dissolution (P576), so its name has no last year`);
    }
  }
  if (need.length) writeFileSync(file, JSON.stringify(cache));
  return Object.fromEntries([...qs].sort((a, b) => +a.slice(1) - +b.slice(1)).map(q => {
    const p = PLACES.places[q] || cache[q], was = nameAs[q] ? cache[nameAs[q]] : null;
    return [q, { n: p.n, ...(p.since ? { since: p.since } : {}), ...(was ? { then: { n: was.n, to: was.to } } : {}) }];
  }));
}
// Cliopatria's rows (the Omni-Map's files of War Focus's years), for each war's theatre boxes.
const CLIO = ['1900-1999', '2000-2024'].map(f => JSON.parse(readFileSync(join(SITE, `omni/data/borders/${f}.topo.json`), 'utf8')));
const placeOf = (id, y) => rowPlace(PLACES.rows, id, y);
// The places drawn in a year (Cliopatria's last, 2024, for a later year): each drawn row's place, and the small states'
// dots (dots.mjs) drawn on some day of it. A war's state none of them is goes in its file's `unplaced` { year: [Q] }:
// the page lists it, never drawing it on another shape.
const SMALL = new Set(JSON.parse(readFileSync(join(SITE, 'omni/data/base/small-states.json'), 'utf8')).points.map(p => p.q));
const DOT_LIST = Object.values(DOTS).filter(d => SMALL.has(d.q));
const placedCache = new Map();
function placedIn(y) {
  y = Math.min(y, PLACES.bordersTo);
  if (!placedCache.has(y)) {
    const t = CLIO[y < 2000 ? 0 : 1], rowQs = new Set();
    for (const g of t.objects.borders.geometries) {
      const p = g.properties;
      if (p.f <= y && y <= p.t && drawnRow({ properties: p, geometry: g.type ? {} : null })) { const q = placeOf(p.id, y); if (q) rowQs.add(q); }
    }
    const all = new Set(rowQs);
    for (const d of DOT_LIST) if (dotOn(d, `${y}-12-31`, rowQs)) all.add(d.q);
    placedCache.set(y, all);
  }
  return placedCache.get(y);
}
// Whose land each row draws (scripts/lands.mjs, 21 November 2026): for each year of a war, the states drawn only as a
// fragment (`parts`, listed as ones VM cannot place), the polygons drawn uncoloured because they lie on another war
// state's land (`left`), and the war's states whose land lies joined inside another place's coloured row (`inside`).
// The war file's `lands` { year: { parts?, left?, inside? } } holds only the years with any.
const LANDS = makeLands(CLIO.map(decodeRows), placeOf, (p, has) => drawnRow({ properties: p, geometry: has ? {} : null }), { from: 1900, to: PLACES.bordersTo });
function landsOf(w, s, end) {
  const out = {}, war = { ...s, start: w.start, end: w.end };
  for (let y = +w.start.slice(0, 4); y <= +end.slice(0, 4); y++) {
    const a = `${y}-01-01` < w.start ? w.start : `${y}-01-01`, b = `${y}-12-31` > end ? end : `${y}-12-31`;
    if (a > b) continue;
    const r = LANDS.year(y, warStatesIn(war, a, b), s.theatre), e = {};
    for (const k of ['parts', 'left', 'inside']) if (r[k].length) e[k] = r[k];
    if (Object.keys(e).length) out[y] = e;
  }
  return out;
}
// A state drawn only as a fragment is listed with those no row holds.
function unplacedOf(w, s, end, lands) {
  const out = {}, war = { ...s, start: w.start, end: w.end };
  for (let y = +w.start.slice(0, 4); y <= +end.slice(0, 4); y++) {
    const parts = lands[y]?.parts || [], placed = new Set([...placedIn(y)].filter(q => !parts.includes(q)));
    const qs = unplacedIn(war, y, placed); if (qs.length) out[y] = qs;
  }
  return out;
}
// The Retrospective Battlefield's years (its data/wars.json), for the page's links to a state there: UCDP/PRIO's first
// year and its last.
const RETRO = (() => { const r = JSON.parse(readFileSync(join(SITE, 'battlefield/history/data/wars.json'), 'utf8')); return { ucdpFrom: r.ucdpFrom, lastYear: r.lastYear }; })();
// The boxes of the war's states' rows in its years (stateBoxes, a land two rows draw going to the place whose land it is,
// lands.mjs whose; a part on land another place taking no part holds by its reference land, lands.mjs holder, none).
// A state no row holds then (Vietnam, Cambodia and Laos
// in 1946–54, Algeria to 1962) takes its reference land's (lands.mjs ref: its own rows in the nearest year within twelve
// of the war's, that it is whole), else the war's committed bbox, so partsWithin keeps a theatre for every state
// (21 November 2026).
function theatreBoxes(w, end, bbox = null) {
  const a = Math.min(+w.start.slice(0, 4), PLACES.bordersTo), b = Math.min(+end.slice(0, 4), PLACES.bordersTo), out = new Map();
  const s = statesOf(w), ws = new Set(warStates(s)), holder = (q, poly, y, key) => LANDS.holder(q, poly, y, key, ws);
  for (const t of CLIO) for (const [q, bs] of stateBoxes(t, a, b, placeOf, LANDS.whose, holder)) (out.get(q) || out.set(q, []).get(q)).push(...bs);
  for (const q of warStates(s)) {
    if (out.get(q)?.length) continue;
    let rf = null;
    for (let y = a; y <= b && !rf; y++) rf = LANDS.ref(q, y, s.theatre.includes(q));
    if (rf) out.set(q, rf.boxes.slice());
    else if (bbox) out.set(q, [bbox]);
  }
  return out;
}

// --sides-only: each committed war file's states again from scripts/wars.mjs, with their names; then the war files and
// the index's sources (the months, deaths, battles and events are kept as built).
async function sidesOnly(list) {
  const IDXF = join(OUT, 'index.json'), idx = JSON.parse(readFileSync(IDXF, 'utf8')), out = [];
  for (const w of list) {
    const file = join(WAR_DIR, w.id + '.json'), d = JSON.parse(readFileSync(file, 'utf8'));
    const s = statesOf(w), end = w.end || d.dataThrough || new Date().toISOString().slice(0, 10), lands = landsOf(w, s, end);
    delete d.lands;
    Object.assign(d, s, { names: await namesOf([...warStates(s)], w.nameAs), unplaced: unplacedOf(w, s, end, lands), lands });
    out.push([file, JSON.stringify(d)]);
    const n = k => Object.values(lands).reduce((t, e) => t + (e[k]?.length || 0), 0);
    console.log(`${w.id}: ${Object.keys(d.names).length} states, ${Object.values(d.unplaced).flat().length} state-years VM cannot place (${n('parts')} only a fragment), ${n('left')} rows partly uncoloured, ${n('inside')} lands inside another row`);
  }
  idx.sources.borders = BORDERS_SOURCE;
  idx.battlefield = RETRO;
  for (const [file, text] of out) writeFileSync(file, text);
  writeFileSync(IDXF, JSON.stringify(idx));
  console.log(`states again for ${out.length} wars`);
}
if (SIDES_ONLY) { await sidesOnly(WARS.filter(w => !ONLY || ONLY.includes(w.id))); process.exit(0); }

// ---- Load sources
const X = require('xlsx');
const prioRows = X.utils.sheet_to_json(X.readFile(await download('https://cdn.cloud.prio.org/files/d21ef702-a546-45a8-b3c9-5b520dcc1239/PRIO%20Battle%20Deaths%20Dataset%2031.xls?inline=true', 'prio_bd31.xls')).Sheets.bdonly);
const prio = new Map(); // id -> year -> best
for (const r of prioRows) { if (r.year > PRIO_TO) continue; const v = r.bdeadbes > 0 ? r.bdeadbes : r.bdeadlow > 0 ? r.bdeadlow : 0; const m = prio.get(r.id) || new Map(); m.set(r.year, (m.get(r.year) || 0) + v); prio.set(r.id, m); }
// UCDP Battle-Related Deaths v26.1, conflict-year (bd_best), for PRIO's years 1989–2008.
const brd = new Map(); // UCDP conflict id -> year -> bd_best
{
  const dir = unzip(await download('https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip', 'ucdp-brd-conf-261-csv.zip'), 'brd261');
  for await (const r of csvRows(join(dir, 'BattleDeaths_v26_1_conf.csv'))) {
    const y = +r.year, v = +r.bd_best; if (!(y >= BRD_FROM && y <= BRD_TO) || !(v > 0)) continue;
    const m = brd.get(r.conflict_id) || brd.set(r.conflict_id, new Map()).get(r.conflict_id); m.set(y, (m.get(y) || 0) + v);
  }
  if (!brd.size) throw new Error('UCDP Battle-Related Deaths: no conflict-years read');
}
const wars = WARS.filter(w => !ONLY || ONLY.includes(w.id));
const today = new Date().toISOString().slice(0, 10);
if (DEATHS_ONLY) { deathsOnly(); process.exit(0); }
const gedDir = unzip(await download('https://ucdp.uu.se/downloads/ged/ged261-csv.zip', 'ged261.zip'), 'ged');
// The candidate files for every year GED v26.1 does not cover yet: 2026's latest now, and 2026's last plus 2027's
// latest once UCDP's first 2027 file is out (until a GED release covering 2026 replaces ged261 above and GED_THROUGH).
const GED_THROUGH = 2025;
const page = await (await fetch('https://ucdp.uu.se/downloads/', { headers: UA })).text();
const candNames = candidateFiles(page, GED_THROUGH);
if (!candNames.length) throw new Error(`No UCDP candidate events file after ${GED_THROUGH} on https://ucdp.uu.se/downloads/`);
const gedCands = [];
for (const name of candNames) gedCands.push(await download(`https://ucdp.uu.se/downloads/candidateged/${name}`, name));

// GED events for every war at once (one pass over the file).
const gedIds = new Map(); for (const w of wars) for (const id of w.ged || []) (gedIds.get(String(id)) || gedIds.set(String(id), []).get(String(id))).push(w);
const events = new Map(wars.map(w => [w.id, []]));
let maxGed = '1989-01-01';
for (const path of [join(gedDir, 'GEDEvent_v26_1.csv'), ...gedCands]) {
  for await (const e of csvRows(path)) {
    if (e.type_of_violence !== '1') continue;
    const ws = gedIds.get(e.conflict_new_id); if (!ws) continue;
    const d = e.date_start?.slice(0, 10); if (!d) continue;
    if (d > maxGed) maxGed = d;
    for (const w of ws) if (d >= w.start && d <= (w.end || today)) events.get(w.id).push({ d, de: e.date_end?.slice(0, 10) || d, lat: +e.latitude, lon: +e.longitude, best: +e.best || 0, dyad: e.dyad_name, where: e.where_description, prec: +e.where_prec, a: +e.deaths_a || 0, b: +e.deaths_b || 0, civ: +e.deaths_civilians || 0, low: +e.low || 0, high: +e.high || 0, dp: +e.date_prec || 0 });
  }
}
console.log('GED loaded through', maxGed);

// ---- Per war (the files are kept in memory and written only once the whole build has passed the guard)
const index = [], pending = [], figLost = [];
const FIG_SOURCES = { wikidata: 'Wikidata (CC0): deaths (P1120), casualties (P1590), injured (P1339) and missing (P1446), each statement with its rank, qualifiers and references',
  wikipedia: 'English Wikipedia (CC BY-SA 4.0): the casualty fields of each battle’s infobox and, where the page says so, its dates, at the revision named; figures and dates taken as facts, with at most a few words of its own',
  ucdp: 'UCDP Georeferenced Event Dataset v26.1 and candidate events (CC BY 4.0): recorded clashes within 25 km of a battle in its dates, since 1989, shown apart' };
for (const w of wars) {
  const qid = await qidOf(w.wiki);
  const end = w.end || maxGed;
  const months = monthsBetween(ym(w.start), ym(end));
  const mi = new Map(months.map((m, i) => [m, i]));
  const ev = events.get(w.id) || [];
  // The war's theatre for partsWithin: its UCDP events, and the territory of its sides' and contested states then.
  // A state no Cliopatria row holds in the war's years has no box (it is listed on the page, never drawn).
  const prevBbox = (() => { try { return JSON.parse(readFileSync(join(WAR_DIR, w.id + '.json'), 'utf8')).bbox || null; } catch { return null; } })();
  const boxes = theatreBoxes(w, w.end || today, prevBbox);
  const qs = [...new Set([...w.sides.a.q || [], ...w.sides.b.q || [], ...w.theatre || []].map(x => (Array.isArray(x) ? x[0] : x)))];
  const theatre = { points: ev.filter(e => isFinite(e.lat) && isFinite(e.lon)).map(e => [e.lon, e.lat]), states: qs.flatMap(q => boxes.get(q) || []) };
  // A battle dated only to its decade (u 'undated') is kept when the decade overlaps the war's years, and listed last.
  const found = qid ? await battlesOf(qid, { start: w.start, end: w.end || today, warEnd: w.end }, theatre, w.id) : { battles: [], edges: [] };
  const battles = found.battles.filter(b => (b.u === 'undated' ? decadeFits(b.dec, w.start, end) : b.s >= w.start.slice(0, 4) && b.s <= end));
  battles.sort(byStart);
  wholesAndParts(battles, found.edges, w.id);
  const dated = battles.filter(b => b.s);
  // Each event's deaths by month: an event UCDP dates only to a period (date_prec above 1, a week, a month, a year) is
  // shared out over the days of its period that fall in the war (eventMonths, scripts/rules.mjs), not put on its first day.
  for (const e of ev) e.m = eventMonths(e.d, e.de, e.best, w.start, end).filter(([m]) => mi.has(m));
  // Monthly deaths (deathsFor, below the loop's helpers).
  const gedDeaths = months.map(() => 0), shared = months.map(() => 0);
  for (const e of ev) for (const [m, n] of e.m) { const i = mi.get(m); gedDeaths[i] += n; if (e.m.length > 1) shared[i] += n; }
  const { deaths, estimated, source, covered, total } = deathsFor(w, months, end, gedDeaths, shared, dated, ev.length);

  // Events: per month, 0.2° cells with deaths and counts, and the five deadliest events.
  const cells = months.map(() => new Map()), top = months.map(() => []);
  // An event over a period counts in each of its months with that month's share of its deaths.
  for (const e of ev) for (const [m, n] of e.m) {
    const i = mi.get(m); if (!isFinite(e.lat)) continue;
    const k = `${(Math.round(e.lat * 5) / 5).toFixed(1)},${(Math.round(e.lon * 5) / 5).toFixed(1)}`;
    const c = cells[i].get(k) || [+k.split(',')[0], +k.split(',')[1], 0, 0]; c[2] += n; c[3]++; cells[i].set(k, c);
    top[i].push({ e, n });
  }
  const cellsOut = cells.map(m => [...m.values()]);
  // [date, deaths this month, place, dyad] and, for an event over a period, [..., its last day, its whole count].
  const topOut = top.map(l => l.sort((a, b) => b.n - a.n).slice(0, 5).map(({ e, n }) => (e.m.length > 1 ? [e.d, n, e.where, e.dyad, e.de, e.best] : [e.d, n, e.where, e.dyad])));
  // Theatre bounds from battles and events (5th–95th percentile to drop strays), falling back to the sides' states.
  const pts = [...battles.filter(b => b.lat != null).map(b => [b.lon, b.lat]), ...ev.filter(e => isFinite(e.lat)).map(e => [e.lon, e.lat])];
  let bbox = null;
  if (pts.length) {
    const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
    const lo = pts.length > 200 ? 0.01 : 0, hi = 1 - lo;
    bbox = [q(pts.map(p => p[0]), lo), q(pts.map(p => p[1]), lo), q(pts.map(p => p[0]), hi), q(pts.map(p => p[1]), hi)];
  }
  const bf = bfOf(w), states = statesOf(w), names = await namesOf([...warStates(states)], w.nameAs), lands = landsOf(w, states, end), unplaced = unplacedOf(w, states, end, lands);
  // ---- Each battle's figures from every source (BF-08, scripts/infobox.mjs battleFigures): Wikidata's statements read
  // in full, the article's infobox at the revision read, and since 1989 UCDP's clashes nearby where nothing else gives
  // one. The detail for the battle's window goes to data/figures/<id>.json, loaded on demand. A battle whose source
  // could not be read this time keeps its last committed figures (and their detail).
  const prevWar = (() => { try { return JSON.parse(readFileSync(join(WAR_DIR, w.id + '.json'), 'utf8')); } catch { return null; } })();
  const prevDetail = (() => { try { return JSON.parse(readFileSync(join(FIG_DIR, w.id + '.json'), 'utf8')).battles || {}; } catch { return {}; } })();
  const prevBy = new Map((prevWar?.battles || []).map(b => [b.q, b]));
  const stmts = await wdEntities(battles.map(b => b.q));
  const detail = {}, tally = { kept: 0, wp: 0, zero: 0, ucdp: 0, unread: 0 };
  for (const b of battles) {
    const failed = wdFailed.has(b.q) || (b.w && wpFailed.has(b.w)), old = prevBy.get(b.q);
    const kept = failed ? keptFigures(b, old) : null;
    if (kept) { Object.assign(b, kept); if (prevDetail[b.q]) detail[b.q] = prevDetail[b.q]; tally.kept++; continue; }
    const a = b.w ? found.articles?.get(b.w) : null;
    const article = !b.w ? null : !a ? { why: failed ? 'failed' : 'noart' } : a.redirected ? { why: 'redirect' } : { ...readSafely(a.text, b), title: a.title, rev: a.rev, ts: a.ts };
    const fx = battleFigures({ deaths: b.deaths, cas: b.cas, wd: stmts.get(b.q) || [], article, ucdp: ucdpNear(b, ev) });
    if (fx.detail) detail[b.q] = fx.detail;
    delete fx.detail;
    Object.assign(b, fx);
    if (!b.deaths && !b.cas && (ownFigure(b, 'd') || ownFigure(b, 'c'))) tally.wp++;
    if (b.fd && b.fd.v === 0) tally.zero++;
    if (b.fu) tally.ucdp++;
    if (b.fs === 'unread') tally.unread++;
  }
  // The guard for figures: a tenth of the battles that had a figure losing it is a source that failed, not an edit.
  const hadFig = x => x.deaths || x.cas || ownFigure(x, 'd') || ownFigure(x, 'c');
  const had = (prevWar?.battles || []).filter(hadFig), now = new Map(battles.map(x => [x.q, x]));
  const lostFig = had.filter(x => now.has(x.q) && !hadFig(now.get(x.q))).length;
  if (lostFig > Math.max(3, had.length / 10)) figLost.push(`${w.id}: ${lostFig} of ${had.length} battles with figures would lose them`);
  pending.push([join(FIG_DIR, w.id + '.json'), JSON.stringify({ id: w.id, sources: FIG_SOURCES, battles: detail })]);
  const data = {
    id: w.id, name: w.name, qid, wiki: w.wiki, bf, start: w.start, end: w.end, ongoing: !w.end, dataThrough: w.end ? null : maxGed,
    months, deaths, estimated, deathsSource: source, totalDeaths: total, covered, shared: shared.some(Boolean) ? shared : null,
    ...states, names, unplaced, lands, bbox, battles: battles.map(({ q, n, desc, lat, lon, s, e, p, pe, pts, u, eW, eA, sW, sWp, dec, deaths, cas, dv, dAt, w: art, up, upAlso, parts, fd, fc, fs, fw, fwp, fu }) => ({ q, n, desc, lat, lon, s: s || null, e: e || null, p: p || null, ...(pe ? { pe } : {}), ...(pts ? { pts } : {}), ...(u ? { u } : {}), ...(eW ? { eW } : {}), ...(eA ? { eA } : {}), ...(sW ? { sW } : {}), ...(sWp ? { sWp } : {}), ...(dec != null ? { dec } : {}), deaths: deaths || null, cas: cas || null,
      ...(dv ? { dv } : {}), ...(dAt ? { dAt } : {}), w: art || null, ...(up ? { up } : {}), ...(upAlso?.length ? { upAlso } : {}), ...(parts?.length ? { parts } : {}),
      ...(fd ? { fd } : {}), ...(fc ? { fc } : {}), ...(fs ? { fs } : {}), ...(fw ? { fw } : {}), ...(fwp ? { fwp } : {}), ...(fu ? { fu } : {}) })),
    cells: cellsOut, top: topOut, events: ev.length,
    ...(found.leftOut?.length ? { leftOut: found.leftOut } : {}),
  };
  pending.push([join(WAR_DIR, w.id + '.json'), JSON.stringify(data)]);
  index.push({ id: w.id, name: w.name, qid, wiki: w.wiki, bf, start: w.start, end: w.end, ongoing: !w.end, totalDeaths: total, deathsSource: source,
    battles: battles.length, mappedBattles: battles.filter(b => b.lat != null).length, events: ev.length, sides: [w.sides.a.label, w.sides.b.label], bbox });
  console.log(`${w.id}: ${qid} ${months.length} months, ${battles.length} battles (${battles.filter(b => b.lat != null).length} mapped), ${ev.length} events, ${total == null ? 'no figure for' : total.toLocaleString('en-GB')} deaths; figures: ${tally.wp} from Wikipedia, ${tally.zero} zero, ${tally.unread} not read, ${tally.ucdp} UCDP nearby${tally.kept ? `, ${tally.kept} kept from the last build` : ''}`);
}
const IDX = join(OUT, 'index.json');
const old = existsSync(IDX) ? JSON.parse(readFileSync(IDX, 'utf8')) : { wars: [] };
// The guard (see the top), against the committed index; with --only, just the wars rebuilt. Wikidata edits move a few
// battles, never half, and UCDP revises events by a few per cent: more than that is a lookup or a download that failed
// (a title that no longer resolves has no item and so no battles; a missing candidate file loses the year's events).
const rebuilt = new Map(index.map(x => [x.id, x])), lost = [];
for (const o of old.wars) {
  const x = rebuilt.get(o.id);
  if (!x) continue; // not rebuilt this time (--only)
  if (o.qid && !x.qid) { lost.push(`${o.id}: no Wikidata item for ${o.wiki}`); continue; }
  if (o.battles && (!x.battles || (o.battles > 20 && x.battles < o.battles / 2))) lost.push(`${o.id} battles ${o.battles} → ${x.battles}`);
  if (o.events > 100 && x.events < o.events * 0.9) lost.push(`${o.id} UCDP events ${o.events} → ${x.events}`);
}
if (!ONLY && old.gedThrough > maxGed) lost.push(`UCDP events through ${old.gedThrough} → ${maxGed}`);
lost.push(...figLost);
if (wpFailed.size || wdFailed.size) console.log(`Not read this time (last figures kept): ${wpFailed.size} Wikipedia articles, ${wdFailed.size} Wikidata items`);
refuseIfLost(lost);
for (const [file, text] of pending) writeFileSync(file, text);
const others = ONLY ? old.wars.filter(x => !ONLY.includes(x.id)) : [];
const all = [...others, ...index].sort((a, b) => (a.start < b.start ? -1 : 1));
// A partial build (--only) may not reach the latest UCDP events, so it keeps the index's later date.
const gedThrough = ONLY && old.gedThrough > maxGed ? old.gedThrough : maxGed;
writeFileSync(IDX, JSON.stringify({ generated: new Date().toISOString(), gedThrough,
  sources: { ucdp: 'UCDP Georeferenced Event Dataset v26.1 and candidate events (Sundberg & Melander 2013; Davies et al. 2026), CC BY 4.0',
    prio: 'PRIO Battle Deaths Dataset v3.1 (Lacina & Gleditsch 2005), its years 1946–1988 only; its page states no licence, and VM keeps these years until its owner decides',
    brd: 'UCDP Battle-Related Deaths Dataset v26.1, conflict level (Davies et al. 2026), CC BY 4.0: 1989–2008',
    wikidata: 'Wikidata (CC0): battles, sieges and operations that are part of each war', borders: BORDERS_SOURCE,
    wikipedia: FIG_SOURCES.wikipedia },
  battlefield: RETRO, wars: all }));
console.log(`index: ${all.length} wars`);
