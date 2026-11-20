// Builds the Omni-Map's layer 3 (PRP-SCHOLAR-USP-DESIGN.md 4.2 and stage S5b) from free data only: elections and
// referendums (3b), coups (3c) and political change, the years a state's head of state or head of government changed
// (3a). The Political Retrospective's own leaders, coups and border events are not read: they are Archigos's (no licence
// stated) and its borders' source's (barred from commercial use), so Jude's rule of 18 November 2026 (MP-11) keeps them out.
//   node omni/scripts/build-political.mjs [--cache <folder>] [--only elections|coups|political-change|retro] [--retro <countries.json>]
//
// The order of steps:
// 1. Elections: reads the Master Index's shards (lake/data/e, committed; no fetch): every record of type "election"
//    (referendums among them) with a date and a country. Its date is Wikidata's point in time (P585), as the Master
//    Index stores it at Wikidata's precision ("1928" for a year, "1963-04" for a month), so a date known to the year is
//    never written as 1 January.
// 2. Coups: asks Wikidata's query service for the items that are instances of coup d'état (Q45382) or of a subclass of
//    it, then reads those items (wbgetentities): country (P17), point in time (P585) or start (P580), at Wikidata's
//    precision, with what supports the date (lake/scripts/refs.mjs), and their classes' names (an attempt is its own
//    class in Wikidata, and the layer says which).
// 3. Political change: asks the query service for every term (position held, P39, with a start, P580) of the office
//    each sovereign state (Q3624078) names as its head of state's (P1906) or its head of government's (P1313), its
//    end (P582) and end cause (P1534) where Wikidata gives them; a state changes in a year when a term begins that year
//    whose holder is not the one before (a holder named again is no change).
// 4. Writes omni/data/layers/elections/elections.json, omni/data/layers/coups/coups.json and
//    omni/data/layers/political-change/terms.json, their catalogue entries in omni/data/layers.json, each `built`
//    moving only when its rows change.
// 5. Writes omni/data/layers/retro-keys.json: the Political Retrospective's own key of each country by ISO3, from its
//    data/countries.json (the sibling folder hp-retrospective, or --retro), only so a click can open its page there.
//    Nothing else is written.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entities, sparql, keepStamp, claimIds } from './history-common.mjs';
import { arg, stamp, measure, putLayer } from './layer-catalogue.mjs';
import { wikidataDate, bestClaim } from '../../lake/scripts/dates.mjs';
import { support, supportText } from '../../lake/scripts/refs.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LAYERS = join(ROOT, 'omni/data/layers.json');
const yearOf = v => { const m = /^(-?\d+)/.exec(String(v ?? '')); return m && +m[1] !== 0 ? +m[1] : null; };
/** A date string's precision as Wikidata's numbers: 9 year, 10 month, 11 day. */
export const precisionOf = v => (/^-?\d+-\d\d-\d\d/.test(v) ? 11 : /^-?\d+-\d\d$/.test(v) ? 10 : /^-?\d+$/.test(v) ? 9 : null);
const CAL = { 'http://www.wikidata.org/entity/Q1985727': 'gregorian', 'http://www.wikidata.org/entity/Q1985786': 'julian' };

/* ---------- step 1: elections ---------- */
/** The year an election's own name begins with ("2026 Slovak referendum", "October 2013 … leadership election"), or null. */
export const labelYear = label => { const m = /^(?:\w+ )?(\d{4})\b/.exec(String(label || '')); return m ? +m[1] : null; };
/** Whether a date at its precision is still to come on the day `today` (YYYY-MM-DD): a year-only date after this
    year, a month after this month, a day after today. */
export const ahead = (v, today) => {
  const s = String(v || ''), p = precisionOf(s);
  return p === 9 ? s > today.slice(0, 4) : p === 10 ? s > today.slice(0, 7) : p === 11 ? s > today : false;
};
/** The Master Index's elections and referendums as rows: one per record with a date and a country.
    { rows, doubtful }: a record whose date falls more than a year from the year its own name begins with (V1 of the
    S5b/S5c review: "2026 Slovak referendum", which Wikidata dates 0202-07-04) is not drawn but listed as doubtful, with
    the date its source gives; one dated after `today` is marked expected (V2), drawn hollow, never as recorded. */
export function electionRows(records, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [], doubtful = [];
  for (const r of records) {
    if (r?.type !== 'election') continue;
    const v = r.facts?.date ?? null, p = precisionOf(v), y = yearOf(v);
    const country = (r.rel?.Country || []).map(c => c[0]).filter(q => /^Q\d+$/.test(q));
    if (!v || p == null || y == null || !country.length) continue;
    const row = { id: r.q, q: r.q, label: r.label, kind: /referend|plebiscite/i.test(`${r.label} ${r.desc || ''}`) ? 'referendum' : 'election',
      date: { from: v, p }, sortYear: y, country,
      src: { date: { id: 'wikidata', loc: `${r.q}#P585`, line: `Wikidata ${r.q}, point in time (P585), as the Master Index holds it (lake/data/e/${+r.q.slice(1) % 512}.json)` } } };
    const ly = labelYear(r.label);
    if (ly != null && Math.abs(ly - y) > 1) { doubtful.push({ q: r.q, label: r.label, date: { from: v, p }, labelYear: ly, loc: row.src.date.loc }); continue; }
    if (ahead(v, today)) row.expected = true;
    out.push(row);
  }
  const rows = out.sort((a, b) => a.sortYear - b.sortYear || String(a.date.from).localeCompare(String(b.date.from)) || +a.q.slice(1) - +b.q.slice(1));
  return { rows, doubtful: doubtful.sort((a, b) => +a.q.slice(1) - +b.q.slice(1)) };
}
function lakeRecords() {
  const dir = join(ROOT, 'lake/data/e'), out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) out.push(...Object.values(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  return out;
}

/* ---------- step 2: coups ---------- */
const valueDate = claim => {
  const d = wikidataDate(claim);
  if (!d) return null;
  const cal = CAL[claim.mainsnak.datavalue.value.calendarmodel];
  return { from: d.v, p: d.p, ...(cal ? { cal } : {}), ...(d.c ? { approx: true } : {}) };
};
/** One coup's row, or null without a country or a date. */
export function coupRow(e, label) {
  const q = e.id, when = bestClaim(e.claims?.P585), start = bestClaim(e.claims?.P580);
  const claim = when && valueDate(when) ? when : start && valueDate(start) ? start : null;
  const country = claimIds(e, 'P17');
  if (!claim || !country.length) return null;
  const date = valueDate(claim), p = claim === when ? 'P585' : 'P580', s = support(claim);
  const cls = claimIds(e, 'P31');
  // D6/V12 (S5b/S5c review): an item with no English label is named as such, never by its bare Q-id.
  const en = e.labels?.en?.value;
  return { id: q, q, label: en || `A coup with no English name on Wikidata (${q})`, ...(en ? {} : { unnamed: true }), date, sortYear: yearOf(date.from), country, cls, clsLabels: cls.map(label),
    attempt: cls.map(label).some(l => /attempt|fail/i.test(l)),
    src: { date: { id: 'wikidata', loc: `${q}#${p}`, support: s.support, line: `Wikidata ${q}, ${p === 'P585' ? 'point in time' : 'start time'} (${p}): ${supportText(s, label)}` } } };
}

/* ---------- step 3: political change ---------- */
// The offices first (one small query), then their terms, 25 offices a query (the whole in one query times out).
export const OFFICES_QUERY = `SELECT ?country ?office ?role WHERE {
  ?country wdt:P31 wd:Q3624078 .
  { ?country wdt:P1906 ?office . BIND("hos" AS ?role) } UNION { ?country wdt:P1313 ?office . BIND("hog" AS ?role) }
}`;
export const termsQuery = pairs => `SELECT ?country ?countryLabel ?iso ?office ?role ?person ?personLabel ?st ?start ?sp ?end ?ep ?cause ?causeLabel WHERE {
  VALUES (?country ?office ?role) { ${pairs.map(p => `(wd:${p.country} wd:${p.office} "${p.role}")`).join(' ')} }
  ?person p:P39 ?st . ?st ps:P39 ?office ; wikibase:rank ?rank ; pqv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?sp ] .
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER(?start >= "1900-01-01T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?st pqv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?ep ] }
  OPTIONAL { ?st pq:P1534 ?cause }
  OPTIONAL { ?country wdt:P298 ?iso }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
const q = u => String(u || '').replace('http://www.wikidata.org/entity/', '');
/** A SPARQL time at its precision: '1963-04-08' (11), '1963-04' (10), '1963' (9). */
export function timeAt(v, p) {
  const m = /^([+-]?\d+)-(\d\d)-(\d\d)/.exec(String(v || ''));
  if (!m) return null;
  const y = String(+m[1]);
  return +p >= 11 ? `${y}-${m[2]}-${m[3]}` : +p === 10 ? `${y}-${m[2]}` : y;
}
/** The terms and the change-years: { terms, years: { y: { t: { Q: [term indexes] } } }, places }. */
export function changeRows(bindings, { from = 1926 } = {}) {
  const seen = new Set(), terms = [], places = {};
  for (const b of bindings) {
    if (seen.has(b.st)) continue; seen.add(b.st);
    const c = q(b.country);
    places[c] ||= { q: c, n: b.countryLabel, iso3: b.iso || null };
    terms.push({ c, role: b.role, office: q(b.office), q: q(b.person), n: b.personLabel, start: { from: timeAt(b.start, b.sp), p: +b.sp },
      ...(b.end ? { end: { from: timeAt(b.end, b.ep), p: +b.ep } } : {}), ...(b.cause ? { cause: b.causeLabel } : {}), st: String(b.st).replace(/^.*\/statement\//, '') });
  }
  terms.sort((a, b) => a.c.localeCompare(b.c) || a.role.localeCompare(b.role) || String(a.start.from).localeCompare(String(b.start.from)) || a.q.localeCompare(b.q));
  const years = {};
  let prev = null;
  terms.forEach((t, i) => {
    const same = prev && prev.c === t.c && prev.role === t.role;
    const y = yearOf(t.start.from);
    const change = !(same && prev.q === t.q) && y >= from;
    if (same && prev.q === t.q) t.again = true;
    if (change) { const Y = (years[y] ||= { t: {} }); (Y.t[t.c] ||= []).push(i); }
    prev = t;
  });
  return { terms, years, places };
}

/* ---------- step 4 ---------- */
function write(path, body) {
  const full = join(ROOT, path), prev = existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : null;
  const file = { ...body, built: keepStamp(prev, body, stamp()) };
  const text = JSON.stringify(file) + '\n';
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
  return { file, m: measure(text) };
}
const span = rows => [Math.min(...rows.map(r => r.sortYear)), Math.max(...rows.map(r => r.sortYear))];
const PLACE = 'each at its country’s point: Cliopatria’s polity for the year, where VM’s crosswalk holds the country, else Natural Earth’s country of today from 1886; one neither holds is listed';
const placeMethod = 'Each is placed at its country (Wikidata’s country, P17, or the Master Index’s), at the label point of Cliopatria’s polity for the year where VM’s crosswalk of Cliopatria holds the country, else of Natural Earth’s country of today, from 1886 only; one neither holds is listed beside the map, never placed at a guess.';

export function electionsEntry(file, m) {
  return { id: 'elections', module: 'retrospective', title: 'Elections and referendums', role: 'point', geometry: 'point',
    time: { field: 'date', from: file.from, to: file.to, step: 'd', precision: 'day' }, data: 'omni/data/layers/elections/elections.json', at: 'country', space: PLACE,
    measure: null, status: 'recorded', statusBy: [{ from: +String(file.asOf).slice(0, 4) + 1, status: 'expected' }],
    style: { kind: 'points', token: '--prp-accent', hollow: `still to come on ${file.asOf}, the day VM built the layer: the date set for it, not a record` },
    legend: 'Elections and referendums: Wikidata (CC0), through the Master Index – placed by Vitruvian Manager', source: 'wikidata',
    method: `VM’s own text. Every election and referendum the Master Index holds with a date and a country (${file.rows.length} of them), each the Wikidata item’s point in time (P585) at the precision Wikidata records: a date known only to its year is shown as the year, never as 1 January, and one known to its month as the month. Those still to come on ${file.asOf}, the day VM built the layer (${file.rows.filter(r => r.expected).length} of them), are drawn hollow and marked expected: their date is the one set, not a record. ${file.doubtful.length ? `${file.doubtful.length === 1 ? 'One record is' : `${file.doubtful.length} records are`} left out as doubtful, because the date Wikidata gives (as the Master Index holds it) is more than a year from the year the item’s own name begins with, and VM does not choose between them: ${file.doubtful.map(d => `${d.label} (${d.q}), dated ${d.date.from}`).join('; ')}. ` : ''}${placeMethod} The Political Atlas’s election dates are not used: they are written by a language model, not taken from a source a page can name. The Political Retrospective’s are not used either; they are Wikidata’s too, through it.`,
    open: true, pinnable: true, built: file.built, files: [{ file: 'omni/data/layers/elections/elections.json', ...m }, ...retroFile()] };
}
export function coupsEntry(file, m) {
  return { id: 'coups', module: 'retrospective', title: 'Coups', role: 'point', geometry: 'point',
    time: { field: 'date', from: file.from, to: file.to, step: 'd', precision: 'day' }, data: 'omni/data/layers/coups/coups.json', at: 'country', space: PLACE,
    measure: null, status: 'as Wikidata records them', style: { kind: 'points', token: '--prp-bad' },
    legend: 'Coups: Wikidata (CC0), its items of coup d’état and its subclasses – placed by Vitruvian Manager', source: 'wikidata',
    method: `VM’s own text. Every Wikidata item that is an instance of coup d’état (Q45382) or of one of its subclasses, with a country (P17) and a date: its point in time (P585), else its start (P580), at Wikidata’s precision and in its calendar, with what supports the date (a reference, “Wikipedia-sourced, unverified”, or none). ${file.rows.length} of them, from ${file.from < 0 ? `${-file.from} BC` : file.from} on (${file.rows.filter(r => r.sortYear >= 1926).length} from 1926); an attempt is marked where Wikidata’s class says so, and an item Wikidata gives no English name (${file.rows.filter(r => r.unnamed).length} of them) is named so, with its Q-id. This counts the coups Wikidata records, which is not the same as the Political Retrospective’s coups: those are Archigos’s “irregular” entries of leaders, and Archigos states no licence, so VM cannot use them. ${placeMethod}`,
    open: true, pinnable: true, built: file.built, files: [{ file: 'omni/data/layers/coups/coups.json', ...m }, ...retroFile()] };
}
export function changeEntry(file, m) {
  return { id: 'political-change', module: 'retrospective', title: 'Political change: a new head of state or government', role: 'fill', geometry: 'polygon',
    time: { field: 'year', from: file.from, to: file.to, step: 'y', precision: 'year' }, data: 'omni/data/layers/political-change/terms.json', on: 'states',
    space: 'each state on Cliopatria’s border for the year, else on Natural Earth’s border of today from the state’s inception; a state neither holds is listed',
    measure: 'a state whose head of state or head of government changed in the year', status: 'as Wikidata records them',
    style: { kind: 'states', classes: [{ v: 1, label: 'A new head of government' }, { v: 2, label: 'A new head of state' }, { v: 3, label: 'Both' }] },
    legend: 'Political change: Wikidata (CC0), each term of the offices of head of state and of government – processed by Vitruvian Manager', source: 'wikidata',
    method: `VM’s own text. For each of today’s sovereign states (Wikidata’s Q3624078), the office it names as its head of state’s (P1906) and its head of government’s (P1313), and every term of those offices Wikidata records (position held, P39, with its start, P580, at Wikidata’s precision; its end, P582, and end cause, P1534, where given). A state is filled in a year when a term begins that year whose holder is not the one before; ${file.terms.length} terms from 1900, the changes counted from 1926. Wikidata gives an end cause for few terms, so how a leader came and went (by election, coup or death) is shown only where it does, and otherwise said not to be recorded. What this layer cannot give: Archigos’s coding of how each leader entered and left office (regular, irregular, imposed from abroad) and its choice of the effective leader, since Archigos states no licence; the states of the past that are not states today (the Soviet Union, Yugoslavia) are not in this first build. The leaders named are public office-holders only. VM has not checked the terms one by one: Wikidata’s records hold mistakes (a term given to the wrong office, a holder of an office abroad), and each term carries its Wikidata statement so a reader can check it there.`,
    open: true, pinnable: true, built: file.built, files: [{ file: 'omni/data/layers/political-change/terms.json', ...m }, ...retroFile()] };
}

/* ---------- step 5: the Political Retrospective's addresses ---------- */
/** The Political Retrospective's own keys of its countries by ISO3 (its data/countries.json): only the key, the ISO3 and
    the name, so a click opens its page at the country; none of its data (its leaders, its borders) is read or kept. A key is
    used only as that page's address, and is reached only through the ISO3 (never joined by the key alone). */
export function retroKeys(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc?.countries || {}).sort(([a], [b]) => +a - +b)) {
    if (!/^[A-Z]{3}$/.test(v?.iso3 || '')) continue;
    (out[v.iso3] ||= []).push({ k, n: v.name });
  }
  return out;
}
const RETRO = 'omni/data/layers/retro-keys.json';
// The address table as a file of the layers that open the Political Retrospective (the page loads it with them).
const retroFile = () => (existsSync(join(ROOT, RETRO)) ? [{ file: RETRO, role: 'addresses', ...measure(readFileSync(join(ROOT, RETRO), 'utf8')) }] : []);
function writeRetro(path) {
  if (!existsSync(path)) { console.log(`retro-keys.json: kept (no ${path})`); return; }
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const { file, m } = write(RETRO, { format: 'vm-addresses/1', module: 'https://hp-retrospective.pages.dev/', built: null, of: doc.built || null,
    about: 'VM’s own text. The Political Retrospective’s own key for each country it covers, by ISO3, read from its data/countries.json: only the key and the name, to open its page at that country (#y=<year>&c=<key>). None of its data is read.',
    keys: retroKeys(doc) });
  console.log(`retro-keys.json: ${Object.keys(file.keys).length} ISO3 codes; ${m.bytes} bytes; built ${file.built}`);
}

async function main() {
  const cache = arg('--cache'), only = arg('--only');
  const doing = k => !only || only === k;
  if (doing('retro')) writeRetro(arg('--retro') || join(ROOT, '../hp-retrospective/data/countries.json'));
  if (doing('elections')) {
    const today = stamp().slice(0, 10), { rows, doubtful } = electionRows(lakeRecords(), { today }), [from, to] = span(rows);
    const { file, m } = write('omni/data/layers/elections/elections.json', { layer: 'elections', format: 'vm-layer/1', source: 'wikidata', built: null, from, to,
      about: 'VM’s own text. The elections and referendums the Master Index holds with a date and a country, each date Wikidata’s point in time (P585) at Wikidata’s precision. Those still to come on the day VM built the file are marked expected; those whose date contradicts the year their own name begins with are listed as doubtful, not drawn.',
      asOf: today, rows, doubtful });
    putLayer(LAYERS, electionsEntry(file, m));
    console.log(`elections.json: ${rows.length} rows (${rows.filter(r => r.expected).length} expected), ${from}–${to}; ${doubtful.length} doubtful left out; ${m.bytes} bytes, ${m.gzip} gzipped; built ${file.built}`);
  }
  if (doing('coups')) {
    const list = await sparql('SELECT DISTINCT ?item WHERE { ?item wdt:P31/wdt:P279* wd:Q45382 . }', { cache, key: 'coups-list.json' });
    const qs = list.map(b => q(b.item)).filter(x => /^Q\d+$/.test(x));
    const got = await entities(qs, { props: 'claims|labels', cache, tag: 'coups' });
    const named = new Set();
    for (const e of Object.values(got)) { for (const c of claimIds(e, 'P31')) named.add(c); const s = support(bestClaim(e.claims?.P585) || bestClaim(e.claims?.P580)); if (s.via) named.add(s.via); if (s.ref && /^Q\d+$/.test(s.ref)) named.add(s.ref); }
    const labels = await entities([...named], { props: 'labels', cache, tag: 'coup-labels' });
    const label = x => labels[x]?.labels?.en?.value || x;
    const rows = Object.values(got).map(e => coupRow(e, label)).filter(r => r && r.sortYear != null)
      .sort((a, b) => a.sortYear - b.sortYear || String(a.date.from).localeCompare(String(b.date.from)) || +a.q.slice(1) - +b.q.slice(1));
    console.log(`Coups: ${qs.length} items; ${rows.length} with a country and a date (${rows.filter(r => r.sortYear >= 1926).length} from 1926)`);
    const [from, to] = span(rows);
    const { file, m } = write('omni/data/layers/coups/coups.json', { layer: 'coups', format: 'vm-layer/1', source: 'wikidata', built: null, from, to,
      about: 'VM’s own text. The Wikidata items of coup d’état (Q45382) and its subclasses with a country and a date, at Wikidata’s precision.', rows });
    putLayer(LAYERS, coupsEntry(file, m));
    console.log(`coups.json: ${m.bytes} bytes, ${m.gzip} gzipped; built ${file.built}`);
  }
  if (doing('political-change')) {
    const offices = (await sparql(OFFICES_QUERY, { cache, key: 'offices.json' })).map(o => ({ country: q(o.country), office: q(o.office), role: o.role }))
      .filter(o => /^Q\d+$/.test(o.country) && /^Q\d+$/.test(o.office)).sort((a, b2) => a.country.localeCompare(b2.country) || a.role.localeCompare(b2.role) || a.office.localeCompare(b2.office));
    const b = [];
    for (let i = 0; i < offices.length; i += 25) b.push(...await sparql(termsQuery(offices.slice(i, i + 25)), { cache, key: `terms-${i}-${offices.slice(i, i + 25).map(o => o.office).join('').length}.json` }));
    console.log(`${offices.length} offices of head of state or government; ${b.length} answers`);
    const { terms, years, places } = changeRows(b);
    const ys = Object.keys(years).map(Number).sort((x, y) => x - y);
    // Each state's inception (P571), the first year VM may draw it on Natural Earth's border of today.
    const got = await entities(Object.keys(places), { props: 'claims', cache, tag: 'pc' });
    for (const [c, p] of Object.entries(places)) { const d = wikidataDate(bestClaim(got[c]?.claims?.P571)); p.since = yearOf(d?.v); p.src = { id: 'wikidata', loc: `${c}#P571` }; }
    const { file, m } = write('omni/data/layers/political-change/terms.json', { layer: 'political-change', format: 'vm-terms/1', source: 'wikidata', built: null, from: ys[0], to: ys.at(-1),
      about: 'VM’s own text. Each term of the offices of head of state (P1906) and head of government (P1313) of today’s sovereign states, as Wikidata records them, and the years a new holder began.',
      places: Object.fromEntries(Object.entries(places).sort(([a], [b2]) => +a.slice(1) - +b2.slice(1))), terms, years: Object.fromEntries(ys.map(y => [y, years[y]])) });
    putLayer(LAYERS, changeEntry(file, m));
    console.log(`terms.json: ${terms.length} terms, ${Object.keys(places).length} states, changes ${ys[0]}–${ys.at(-1)}; ${m.bytes} bytes, ${m.gzip} gzipped; built ${file.built}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
