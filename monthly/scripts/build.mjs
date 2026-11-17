// Month by Month (Realtime Geopolitics): Vitruvian Manager's monthly direction marks, the month's bulletin, the watch
// list and the year strips, built only from VM's own public JSON.
//   node monthly/scripts/build.mjs [--ged <dir>] [--today yyyy-mm-dd] [--allow-drop]
// Reads: battlefield/data/realtime.json, battlefield/focus/data (index and wars), volatility/data/index.json, the
// calendars (calendar/data/<decade>s.json, upcoming.json), national/data/index.json, monthly/data/ged-countries.json
// and its own last output (monthly/data/series.json carries the year's candidate months past January, when
// realtime.json starts again). Writes monthly/data: marks.json (and its head), series.json, bulletins/<yyyy-mm>.json
// and bulletins/index.json, watch.json and watch/<yyyy-mm>.json, strips/<ISO3>.json and strips/focus-<id>.json.
// --ged <dir>: first (re)writes monthly/data/ged-countries.json, each country's months 1989 onward from UCDP's GED
// (GEDEvent_v26_1.csv in <dir> or <dir>/ged, as War Focus's build leaves it in its cache), all three kinds of violence.
// The rule is monthly/scripts/rules.mjs (vm-direction-1); the design, PRP-CONFLICT-WATCH-DESIGN.md.
// Guard: nothing is written when a mark lacks its explanation, period, evidence or confidence, or when the units fall by
// more than half against the last marks.json (a source that failed); --allow-drop writes anyway.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE, VOL_RULE, WORDS, fightingMark, volatilityMark, volatilityDays, volatilityRise, markProblems, addMonths, monthsFrom, monthName, fmt, short, spanName } from './rules.mjs';
import { realtimeRows, focusRows, countryRows, mergeRows, gwTable, GW_NOTES, INDEPENDENCE, seriesFromEvents, gedSrc } from './series.mjs';
import { eventKey, writeHeads } from '../../integration/scripts/heads.mjs';
import { refuseIfLost } from '../../calendar/scripts/guard.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'monthly/data');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const readIf = p => (existsSync(join(ROOT, p)) ? read(p) : null);
const write = (p, obj) => { mkdirSync(join(ROOT, p, '..'), { recursive: true }); writeFileSync(join(ROOT, p), JSON.stringify(obj)); };
const sameData = (a, b) => JSON.stringify({ ...a, generated: null }) === JSON.stringify({ ...b, generated: null });
// A file whose content is unchanged keeps its old time, so a day that changed nothing commits nothing there.
const writeIfChanged = (p, obj) => { const old = readIf(p); if (!old || !sameData(old, obj)) write(p, obj); };
const NOW = new Date().toISOString();
const TODAY = arg('--today') || NOW.slice(0, 10);
const day = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const longDay = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ============================================================================ --ged: each country's months from GED */
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
async function buildGed(dir) {
  const find = d => (existsSync(d) ? readdirSync(d).filter(f => /^GEDEvent_v\d+_\d+\.csv$/i.test(f)).sort().map(f => join(d, f)) : []);
  const file = [...find(dir), ...find(join(dir, 'ged'))].at(-1);
  if (!file) throw new Error(`No GEDEvent_v<version>.csv in ${dir} or ${dir}/ged`);
  const version = file.match(/GEDEvent_v(\d+)_(\d+)\.csv$/i).slice(1).join('.');
  const by = new Map();
  let last = '1989-01-01', n = 0;
  for await (const e of csvRows(file)) {
    const gw = String(e.country_id || '').split(/[;,\s]/)[0], d = e.date_start?.slice(0, 10);
    if (!/^\d+$/.test(gw) || !d) continue;
    const c = by.get(gw) || by.set(gw, { names: new Map(), events: [], years: new Map() }).get(gw);
    c.names.set(e.country, (c.names.get(e.country) || 0) + 1);
    c.events.push({ d, de: e.date_end?.slice(0, 10) || d, best: +e.best || 0, place: e.where_description || e.adm_1 || '' });
    const y = d.slice(0, 4); (c.years.get(y) || c.years.set(y, new Set()).get(y)).add(+e.conflict_new_id);
    if (d > last) last = d; n++;
  }
  const through = `${last.slice(0, 4)}-12`;
  const countries = {};
  for (const [gw, c] of by) {
    const s = seriesFromEvents(c.events, '1989-01', through);
    s.top = s.top.map(t => (t ? t.slice(0, 5) : null)); // date, deaths this month, place, end, whole count (no headline in GED)
    const name = [...c.names].sort((a, b) => b[1] - a[1])[0][0].replace(/ \(.*\)$/, '');
    countries[gw] = { name, ...s, conflicts: Object.fromEntries([...c.years].sort().map(([y, set]) => [y, [...set].filter(Number.isFinite).sort((a, b) => a - b)])) };
  }
  const out = { generated: NOW, source: 'UCDP Georeferenced Event Dataset', version, licence: 'CC BY 4.0', through, events: n,
    about: 'Each country\'s months from UCDP GED (country_id, a Gleditsch and Ward code; all three kinds of violence), an event dated only to a span of days shared out over them and counted in each month it touches. Built by monthly/scripts/build.mjs --ged.', countries };
  const prev = readIf('monthly/data/ged-countries.json');
  if (prev && prev.events > 1000 && n < prev.events * 0.9) refuseIfLost([`GED events ${prev.events} → ${n}`]);
  if (!prev || !sameData(prev, out)) write('monthly/data/ged-countries.json', out);
  console.log(`GED ${version}: ${n} events in ${by.size} countries, to ${through}`);
}
if (arg('--ged')) await buildGed(arg('--ged'));

/* ============================================================================ the sources */
const rt = read('battlefield/data/realtime.json');
const wfIndex = read('battlefield/focus/data/index.json');
const wfWars = wfIndex.wars.map(w => read(`battlefield/focus/data/wars/${w.id}.json`));
const vol = readIf('volatility/data/index.json');
const volFacts = volatilityDays(vol); // each day's method and baseline, as the store records them (null: not recorded)
const volRecordsMethods = !!vol?.global?.length && vol.global.every(g => volFacts.methodOf(g[0]));
const nat = read('national/data/index.json');
const ged = readIf('monthly/data/ged-countries.json');
const stored = readIf('monthly/data/series.json');
const prevMarks = readIf('monthly/data/marks.json');
const upcoming = readIf('calendar/data/upcoming.json');
const decades = readdirSync(join(ROOT, 'calendar/data')).filter(f => /^\d{4}s\.json$/.test(f)).sort();
const calEvents = decades.flatMap(f => read(`calendar/data/${f}`).events || []);
const calGenerated = decades.map(f => read(`calendar/data/${f}`).generated).filter(Boolean).sort().at(-1) || null;
const M = rt.latest;
const GED_THROUGH = +String(wfIndex.gedThrough || '2025').slice(0, 4) >= 2026 ? 2025 : 2025; // GED 26.1 covers to 2025
const CANDIDATE = rt.version; // the candidate release realtime.json is built from (War Focus reads the same files)

/* ---------------------------------------------------------------- countries: names, codes, Master Index ids */
const { iso: gwOfIso, gw: isoOfGw } = gwTable(nat);
const natBy = new Map(nat.countries.map(c => [c.iso3, c]));
const DISPLAY = { COD: 'DR Congo', COG: 'Congo', MMR: 'Myanmar', CIV: 'Ivory Coast', PSE: 'Palestine', KOR: 'South Korea', PRK: 'North Korea', LAO: 'Laos', TUR: 'Turkey' };
const nameOf = iso => DISPLAY[iso] || vol?.countries?.[iso]?.name || natBy.get(iso)?.name || iso;
const ALIASES = { 'dr congo': 'COD', congo: 'COG', 'ivory coast': 'CIV', 'the gambia': 'GMB', 'saint kitts and nevis': 'KNA', 'saint lucia': 'LCA', 'saint vincent and the grenadines': 'VCT', 'são tomé and príncipe': 'STP', micronesia: 'FSM', 'greenland (denmark)': 'GRL', palestine: 'PSE', 'bosnia-herzegovina': 'BIH', 'russia (soviet union)': 'RUS', 'yemen (north yemen)': 'YEM', 'cambodia (kampuchea)': 'KHM', 'myanmar (burma)': 'MMR', 'zimbabwe (rhodesia)': 'ZWE', 'madagascar (malagasy)': 'MDG', 'serbia (yugoslavia)': 'SRB', 'turkey': 'TUR', 'iran': 'IRN', 'syria': 'SYR', 'russia': 'RUS', 'laos': 'LAO', 'kyrgyzstan': 'KGZ', 'egypt': 'EGY', 'venezuela': 'VEN', 'south korea': 'KOR', 'north korea': 'PRK' };
const isoByName = new Map();
for (const c of nat.countries) isoByName.set(c.name.toLowerCase(), c.iso3);
for (const [iso, c] of Object.entries(vol?.countries || {})) if (!isoByName.has(c.name.toLowerCase())) isoByName.set(c.name.toLowerCase(), iso);
for (const [k, v] of Object.entries(ALIASES)) isoByName.set(k, v);
const isoOf = name => isoByName.get(String(name || '').toLowerCase().trim()) || isoByName.get(String(name || '').replace(/ \(.*\)$/, '').toLowerCase().trim()) || null;
// Wikidata IDs for the few names National Analysis does not hold (the World Bank leaves Taiwan out; the calendars name
// the European Union and the United Nations as a "country"), so every name still carries its Master Index link.
const EXTRA_QID = { TWN: 'Q865', 'european union': 'Q458', 'united nations': 'Q1065' };
const country = iso => (iso ? { iso3: iso, name: nameOf(iso), qid: natBy.get(iso)?.qid || EXTRA_QID[iso] || null } : null);
const named = name => { const iso = isoOf(name); return country(iso) || { iso3: null, name: String(name || ''), qid: EXTRA_QID[String(name || '').toLowerCase()] || null }; };

/* ---------------------------------------------------------------- calendar context: dated events beside a month */
const CONTEXT_TYPES = new Set(['coup', 'ceasefire', 'vote', 'conflict', 'treaty', 'election', 'referendum', 'assassination', 'crisis']);
const calByMonth = new Map();
for (const e of calEvents) {
  if (!CONTEXT_TYPES.has(e.type) || typeof e.date !== 'string') continue;
  const isos = String(e.country || '').split(' / ').map(isoOf).filter(Boolean);
  for (const iso of isos) { const k = `${e.date.slice(0, 7)}|${iso}`; (calByMonth.get(k) || calByMonth.set(k, []).get(k)).push(e); }
}
const contextOf = (isos, m, n = 6) => {
  const seen = new Set(), out = [];
  for (const iso of isos) for (const e of calByMonth.get(`${m}|${iso}`) || []) {
    const key = eventKey(e); if (seen.has(key)) continue; seen.add(key);
    out.push({ key, date: e.date, type: e.type, title: short(e.title, 120), country: country(iso) }); // the country matched ("Soviet Union / Russia" is Russia's)
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, n);
};
const STRIP_DOT = new Set(['coup', 'ceasefire', 'vote']);

/* ---------------------------------------------------------------- units */
// Realtime Battlefield's named wars (all three kinds of UCDP violence; "Other armed violence in <country>" is left to
// the country units), War Focus's wars (state-based fighting only), and every country UCDP recorded events in. A war
// War Focus covers is shown once in the bulletin, by its War Focus unit (PAIRS); Realtime Battlefield keeps its own
// mark beside its own figures.
const PAIRS = { 'russia-ukraine': 'russia-ukraine', yemen: 'yemen', sudan: 'sudan-2023' };
const storedRows = id => (stored?.units?.[id] || []);
const pageOf = (suite, module, url, label) => ({ suite, module, url, label });
const counts = (rows, months) => months.map(m => { const r = rows.find(x => x.m === m); return r ? `${monthName(m)} ${fmt(r.d)} deaths in ${fmt(r.e)} events` : `${monthName(m)} not held`; }).join('; ');
const units = [];
const rtEvidence = (rows, page) => ({ dataset: 'UCDP Candidate Events Dataset', version: CANDIDATE, released: rt.generated.slice(0, 10), counts: counts(rows, [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1), M]), page });

for (const w of rt.wars.filter(w => !w.id.startsWith('other-'))) {
  const id = `war:${w.id}`, rows = mergeRows(storedRows(id), realtimeRows(w, rt));
  const isos = w.countries.map(isoOf).filter(Boolean);
  const page = pageOf('rt', 'battlefield', `q/battlefield.html?view=live&war=${w.id}`, `Realtime Battlefield: ${w.name}`);
  units.push({ id, kind: 'war', name: w.name, wiki: w.wiki || null, qid: null, counts: 'all organised violence', primary: !PAIRS[w.id], primaryUnit: PAIRS[w.id] ? `focus:${PAIRS[w.id]}` : id,
    countries: isos.map(country), rows, page, evidence: rows2 => [rtEvidence(rows2, page)], seriesRule: w.series ? 'shared' : 'start' });
}
// Realtime Battlefield's sources name a report War Focus records only by its place: each War Focus war looks only in
// its own Realtime Battlefield war's sources (PAIRS), so two wars' events on one day with one count never swap names.
const rtHeadlinesOf = focusId => {
  const rw = rt.wars.find(w => PAIRS[w.id] === focusId);
  if (!rw) return null;
  const map = new Map();
  for (const x of rw.monthly || []) for (const s of x.sources || []) if (s.headline) map.set(`${s.date}|${s.deaths}`, { headline: s.headline, office: s.office });
  return map;
};
for (const w of wfWars) {
  const id = `focus:${w.id}`, rows = focusRows(w, { gedThrough: GED_THROUGH, headlines: rtHeadlinesOf(w.id) });
  // Its countries: the theatre, or where War Focus names none, the states on each side, with the days they fought.
  const theatre = (w.theatre || []).map(g => isoOfGw.get(Array.isArray(g) ? g[0] : g)).filter(Boolean).map(iso => ({ iso, from: null, to: null }));
  const sides = theatre.length ? [] : ['a', 'b'].flatMap(k => w.sides?.[k]?.states || []).map(s => ({ iso: isoOfGw.get(s.gw), from: s.from || null, to: s.to || null })).filter(x => x.iso);
  const ranges = [...theatre, ...sides];
  const isos = [...new Set(ranges.map(x => x.iso))];
  const last = rows.at(-1)?.m || M;
  const page = pageOf('rs', 'war-focus', `battlefield/focus/index.html#war=${w.id}&m=${w.ongoing ? M : last}`, `War Focus: ${w.name}`);
  const ev = rows2 => [{ dataset: M.slice(0, 4) > String(GED_THROUGH) ? 'UCDP Candidate Events Dataset, through War Focus' : 'UCDP Georeferenced Event Dataset, through War Focus',
    version: M.slice(0, 4) > String(GED_THROUGH) ? CANDIDATE : '26.1', released: wfIndex.generated.slice(0, 10), counts: counts(rows2, [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1), M]), page }];
  units.push({ id, kind: 'focus', name: w.name, qid: w.qid || null, wiki: w.wiki || null, counts: 'state-based fighting only', primary: !!w.ongoing, primaryUnit: id,
    countries: isos.map(country), ranges, rows, page, evidence: ev, ongoing: !!w.ongoing, dataThrough: w.dataThrough, start: w.start, end: w.end, war: w });
}
// The unit's countries in month m (a state on a side only in the months it fought).
const isosAt = (u, m) => (u.ranges ? [...new Set(u.ranges.filter(x => (!x.from || x.from.slice(0, 7) <= m) && (!x.to || x.to.slice(0, 7) >= m)).map(x => x.iso))] : u.countries.map(c => c?.iso3).filter(Boolean));
const gws = new Set([...Object.keys(ged?.countries || {}), ...Object.keys(rt.countries || {}), ...Object.keys(stored?.units || {}).filter(k => k.startsWith('gw:')).map(k => k.slice(3))]);
for (const gw of [...gws].sort((a, b) => a - b)) {
  const iso = isoOfGw.get(+gw);
  if (!iso) continue; // a code National Analysis has no country for (a state that no longer exists)
  const id = `country:${iso}`, rows = mergeRows(storedRows(`gw:${gw}`), countryRows(gw, ged, rt));
  if (!rows.length) continue;
  const page = pageOf('rt', 'pestle', `q/national.html#country=${iso}`, `National Analysis: ${nameOf(iso)}`);
  const ev = rows2 => [{ dataset: M.slice(0, 4) > String(GED_THROUGH) ? 'UCDP Candidate Events Dataset' : 'UCDP Georeferenced Event Dataset', version: M.slice(0, 4) > String(GED_THROUGH) ? CANDIDATE : (ged?.version || '26.1'),
    released: (M.slice(0, 4) > String(GED_THROUGH) ? rt.generated : ged?.generated || rt.generated).slice(0, 10), counts: counts(rows2, [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1), M]), page }];
  const ind = INDEPENDENCE[+gw];
  units.push({ id, kind: 'country', name: nameOf(iso), iso3: iso, gw: +gw, qid: natBy.get(iso)?.qid || null, counts: 'all organised violence', primary: true, primaryUnit: id,
    countries: [country(iso)], rows, page, evidence: ev, from: ind ? ind[0] : null, fromWhy: ind ? (ind[2] || `${nameOf(iso)} became independent in ${monthName(ind[0])}; before that UCDP counts these events under ${ind[1]}.`) : null });
}

/* ---------------------------------------------------------------- conflicts counted per year (GED's yearly threshold) */
// UCDP counts a conflict only in years with 25 or more battle deaths, so a conflict can enter or leave a country's
// figures at a new year. Where the four months span two years and a conflict is counted in only one of them, no mark.
const conflictsIn = (u, y) => {
  if (u.kind !== 'country') return null;
  if (y <= GED_THROUGH) return ged?.countries?.[u.gw]?.conflicts?.[y] || null;
  if (y === rt.year) return rt.countries?.[u.gw]?.conflicts || null;
  return null;
};
function seamOf(u, m) {
  const y0 = +addMonths(m, -3).slice(0, 4), y1 = +m.slice(0, 4);
  if (y0 === y1 || u.kind !== 'country') return null;
  const a = conflictsIn(u, y0), b = conflictsIn(u, y1);
  if (!a || !b) return null;
  const only = [...a.filter(x => !b.includes(x)), ...b.filter(x => !a.includes(x))];
  return only.length ? `The four months span ${y0} and ${y1}, and ${only.length === 1 ? 'a UCDP conflict is' : `${only.length} UCDP conflicts are`} counted in only one of them: UCDP counts a conflict only in years with 25 or more battle deaths, so the change may reflect that rule, not the fighting.` : null;
}

/* ---------------------------------------------------------------- the marks */
const markOf = (u, m) => {
  const rowsAt = new Map(u.rows.map(r => [r.m, r]));
  const yb = rowsAt.get(addMonths(m, -12));
  const ctx = { from: u.from || null, fromWhy: u.fromWhy || null, seam: seamOf(u, m), yearBefore: yb && !yb.est ? yb.d : null };
  // War Focus takes in each UCDP month on the 2nd of the next month: until then its ongoing wars wait for M.
  if (u.kind === 'focus' && u.ongoing && !rowsAt.has(m) && m === M) {
    return { month: m, strand: 'fighting', direction: 'none', words: WORDS.none, sign: '', period: { month: m, baseline: [addMonths(m, -3), addMonths(m, -2), addMonths(m, -1)] }, figures: null, confidence: null, steps: [], provisional: true, notes: [],
      what: `War Focus holds this war's figures to ${longDay(u.dataThrough)}.`, why: { code: 'awaited', text: `War Focus has not yet taken in UCDP's figures for ${monthName(m)}: it does so on the 2nd of each month.` }, inputs: null };
  }
  // A War Focus war that has ended has no month after its record: it is not awaiting UCDP, and it has no current mark.
  const lastRow = u.rows.at(-1)?.m || null;
  if (u.kind === 'focus' && !u.ongoing && (!lastRow || m > lastRow)) {
    const endM = (u.end || '').slice(0, 7) || lastRow;
    return { month: m, strand: 'fighting', direction: 'none', words: WORDS.none, sign: '', period: { month: m, baseline: [addMonths(m, -3), addMonths(m, -2), addMonths(m, -1)] }, figures: null, confidence: null, steps: [], provisional: false, notes: [],
      what: lastRow ? `War Focus's monthly record of this war runs from ${monthName(u.rows[0].m)} to ${monthName(lastRow)}.` : 'War Focus holds no monthly record of this war.',
      why: { code: 'ended', text: `This war ended${u.end ? ` on ${longDay(u.end)}` : endM ? ` in ${monthName(endM)}` : ''}, so it has no mark for ${monthName(m)}. Its months are in its year strip on War Focus.` }, inputs: null, ended: true };
  }
  const mark = fightingMark(u.rows, m, ctx);
  const four = [addMonths(m, -3), addMonths(m, -2), addMonths(m, -1), m].map(x => rowsAt.get(x)).filter(Boolean);
  return { ...mark, inputs: { rows: four, from: ctx.from, fromWhy: ctx.fromWhy, seam: ctx.seam, yearBefore: ctx.yearBefore } };
};
for (const u of units) {
  const mark = markOf(u, M);
  const ended = mark.ended; delete mark.ended;
  mark.evidence = ended
    ? [{ dataset: `War Focus's record of the war (${u.war.deathsSource || 'UCDP and other datasets'})`, version: u.rows.length ? `${monthName(u.rows[0].m)} to ${monthName(u.rows.at(-1).m)}` : 'none', released: wfIndex.generated.slice(0, 10), counts: `${fmt(u.rows.length)} months held, none after ${u.rows.length ? monthName(u.rows.at(-1).m) : 'its end'}`, page: u.page }]
    : u.evidence(u.rows);
  mark.context = ended ? [] : contextOf(isosAt(u, M), M);
  u.fighting = mark;
  if (u.kind === 'country') {
    const days = vol?.countries?.[u.iso3]?.days || [];
    // The store says which method scored each day and against how many days (Jude's decision G, 17 November 2026), so a
    // mark compares like with like; none before April 2027 in any case (rules.mjs VOL_RULE).
    const vm = volatilityMark(days, M, volFacts);
    vm.evidence = [{ dataset: 'GDELT 2.0, through VM\'s Geopolitical Volatility', version: vol?.method || 'none', released: (vol?.latest || '').slice(0, 10) || 'none', counts: `${days.filter(d => d[0].startsWith(M)).length} scored days in ${monthName(M)}`, page: pageOf('rt', 'volatility', `q/volatility.html#country=${u.iso3}`, `Geopolitical Volatility: ${u.name}`) }];
    u.volatility = vm;
  }
}

/* ---------------------------------------------------------------- strips: twelve squares a year */
// Countries from April 1989 (GED begins in January 1989; the first month with three before it) or independence; War
// Focus wars from their first month not estimated. Each square is the mark the rule gives that month.
const shortWhat = mk => (mk.figures?.median != null ? `${fmt(mk.figures.deaths)} deaths against a median of ${fmt(mk.figures.median)} (${mk.figures.pct == null ? 'none before' : `${mk.figures.pct >= 0 ? '+' : '−'}${fmt(Math.abs(mk.figures.pct))}%`})` : mk.what);
function stripOf(u) {
  const ok = u.rows.filter(r => !r.est);
  if (!ok.length) return { id: u.id, name: u.name, from: null, to: M, why: u.kind === 'focus' ? 'War Focus\'s monthly deaths for this war are estimates spread from yearly or whole-war totals, not recorded events, so no month can be marked.' : 'No months held.', months: [] };
  // A country's first square is April 1989 (GED begins in January; April is the first month with three before it), or
  // its independence, whose first three months show why they have no mark.
  const first = u.kind === 'country' ? [u.from || '1989-04', ok[0].m].sort().at(-1) : ok[0].m;
  const last = u.kind === 'focus' && !u.ongoing ? u.rows.at(-1).m : M;
  const at = new Map(u.rows.map(r => [r.m, r]));
  const months = monthsFrom(first, last).map(m => {
    const r = at.get(m), mk = markOf(u, m);
    const dots = contextOf(isosAt(u, m), m, 20).filter(e => STRIP_DOT.has(e.type)).map(e => ({ key: e.key, type: e.type, title: e.title }));
    return { m, d: r?.d ?? null, e: r?.e ?? null, sh: r?.sh ?? null, prov: !!r?.prov, direction: mk.direction, confidence: mk.confidence, steps: mk.steps.map(s => s.code), what: shortWhat(mk), why: mk.why?.text || mk.reason || null, dots };
  });
  return { id: u.id, name: u.name, kind: u.kind, counts: u.counts, from: first, to: last, rule: RULE.id,
    note: u.kind === 'focus' && u.rows[0].est ? `Before ${monthName(first)} War Focus's monthly deaths for this war are estimates spread from yearly totals, so the strip starts there.` : u.fromWhy || null, months };
}

/* ---------------------------------------------------------------- strands: what is in, awaited, not yet possible */
const lastDay = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const ongoing = units.filter(u => u.kind === 'focus' && u.ongoing);
const wfHas = ongoing.length && ongoing.every(u => u.dataThrough && u.dataThrough >= lastDay(M));
const hasCountries = units.some(u => u.kind === 'country' && u.rows.some(r => r.m === M));
const strands = [
  { id: 'realtime', name: 'Realtime Battlefield', state: 'in', text: `UCDP's candidate events for ${monthName(M)} (release ${CANDIDATE}) are in.` },
  { id: 'warfocus', name: 'War Focus', state: wfHas ? 'in' : 'awaited', text: wfHas ? `War Focus holds ${monthName(M)} for its ${ongoing.length} ongoing wars.` : `War Focus has not yet taken in ${monthName(M)}: it does so on the 2nd of each month. This bulletin is a provisional issue until then.` },
  { id: 'countries', name: 'Countries', state: hasCountries ? 'in' : 'not-yet', text: hasCountries ? `Per-country figures for ${monthName(M)} are in.` : `Per-country figures are not yet possible: Realtime Battlefield's file gains them at its next rebuild from UCDP's next release, and the years since 1989 at War Focus's next monthly run.` },
  { id: 'volatility', name: 'Volatility', state: 'not-yet', text: `Volatility marks are not yet possible: the first month that can have one is ${monthName(VOL_RULE.firstMonth)}${volRecordsMethods ? '' : ', and the volatility store must first say which method scored each day'}.` },
];
const final = strands.filter(s => ['realtime', 'warfocus'].includes(s.id)).every(s => s.state === 'in');

/* ---------------------------------------------------------------- the bulletin */
const line = u => ({ unit: u.id, kind: u.kind, name: u.name, qid: u.qid || null, wiki: u.wiki || null, iso3: u.iso3 || null, counts: u.counts, page: u.page,
  direction: u.fighting.direction, words: u.fighting.words, confidence: u.fighting.confidence, deaths: u.fighting.figures?.deaths ?? null, median: u.fighting.figures?.median ?? null,
  change: u.fighting.figures?.change ?? null, pct: u.fighting.figures?.pct ?? null, what: u.fighting.what, why: u.fighting.why?.text || null, provisional: u.fighting.provisional });
const tally = list => Object.fromEntries(['worse', 'better', 'same', 'none'].map(d => [d, list.filter(u => u.fighting.direction === d).length]));
const moved = list => list.filter(u => ['worse', 'better'].includes(u.fighting.direction)).sort((a, b) => Math.abs(b.fighting.figures.change) - Math.abs(a.fighting.figures.change)).map(line);
const warUnits = units.filter(u => u.kind !== 'country' && u.primary && (u.kind === 'war' || u.ongoing));
const countryUnits = units.filter(u => u.kind === 'country');
const newly = list => list.filter(u => { const f = u.fighting.figures; return f?.baseline && f.eventBaseline.every(x => x === 0) && f.events > 0; })
  .map(u => ({ unit: u.id, name: u.name, qid: u.qid || null, wiki: u.wiki || null, iso3: u.iso3 || null, page: u.page, deaths: u.fighting.figures.deaths, events: u.fighting.figures.events }));
const bulletin = {
  month: M, rule: RULE.id, issued: NOW, provisional: !final, strands,
  counts: { wars: tally(warUnits), countries: tally(countryUnits) },
  wars: moved(warUnits), countries: moved(countryUnits), newlyRecorded: [...newly(warUnits), ...newly(countryUnits)],
  marks: Object.fromEntries(units.filter(u => u.primary || u.kind === 'war').map(u => [u.id, { direction: u.fighting.direction, deaths: u.fighting.figures?.deaths ?? null, confidence: u.fighting.confidence }])),
  sources: { realtime: CANDIDATE, warFocus: wfIndex.generated.slice(0, 10) },
};
// Kept as issued: a month's bulletin is written until it is final (every strand it waits for holds the month), then
// never again. Later releases that move a past month's mark are listed as revisions, beside the bulletin as issued.
const bulletins = existsSync(join(OUT, 'bulletins')) ? readdirSync(join(OUT, 'bulletins')).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort() : [];
const kept = new Map(bulletins.map(f => [f.slice(0, 7), read(`monthly/data/bulletins/${f}`)]));
const keptM = kept.get(M);
const writeBulletin = !keptM || keptM.provisional;
const revisions = [];
for (const [bm, b] of kept) {
  if (bm >= M || b.provisional) continue;
  for (const [uid, was] of Object.entries(b.marks || {})) {
    const u = units.find(x => x.id === uid); if (!u) continue;
    const now = markOf(u, bm);
    if (now.direction !== was.direction) revisions.push({ unit: uid, name: u.name, qid: u.qid || null, wiki: u.wiki || null, iso3: u.iso3 || null, month: bm, issued: { direction: was.direction, words: WORDS[was.direction], deaths: was.deaths }, now: { direction: now.direction, words: now.words, deaths: now.figures?.deaths ?? null }, release: CANDIDATE });
  }
}

/* ---------------------------------------------------------------- the watch list: the next 30 days */
const to = day(TODAY, 29);
const evs = (upcoming?.events || []).filter(e => e.date >= TODAY && e.date <= to);
const watchItem = (e, group, kind) => { const parts = String(e.country).split(' / '); return { date: e.date, group, kind, type: e.type, title: e.title, country: named(parts.find(p => isoOf(p)) || parts[0]), status: e.status || '', key: e.key, source: 'Realtime Calendar' }; };
const rises = Object.entries(vol?.countries || {}).map(([iso, c]) => ({ iso, r: volatilityRise(c.days || [], vol.latest) })).filter(x => x.r).sort((a, b) => b.r.change - a.r.change)
  .map(({ iso, r }) => ({ ...r, group: 'volatility', kind: 'risk', country: country(iso), source: 'Geopolitical Volatility', date: r.to }));
const watch = {
  generated: NOW, from: TODAY, to, rule: VOL_RULE.id, method: vol?.method || null, volatilityLatest: vol?.latest || null, calendars: upcoming?.generated || null,
  // `kind` keeps Jude's two categories (12 November 2026: risks and openings); the page never shows them, only the
  // groups by type, since calling a vote a risk or a summit an opening is a judgement VM's data cannot make.
  votes: evs.filter(e => e.type === 'election' || e.type === 'referendum').map(e => watchItem(e, 'votes', 'risk')),
  summits: evs.filter(e => e.type === 'summit').map(e => watchItem(e, 'summits', 'opening')),
  volatility: rises,
  fixed: 'Ceasefire and mandate end dates: VM\'s calendars do not hold them, so this list cannot include them.',
};
const watchMonth = TODAY.slice(0, 7);
const writeWatchIssue = !existsSync(join(OUT, `watch/${watchMonth}.json`));

/* ---------------------------------------------------------------- the Dashboard's card */
const top5 = moved(warUnits).slice(0, 5).map(l => ({ unit: l.unit, name: l.name, direction: l.direction, words: l.words, confidence: l.confidence, deaths: l.deaths, median: l.median, change: l.change, pct: l.pct }));

/* ---------------------------------------------------------------- write */
const strip = u => ({ id: u.id, kind: u.kind, name: u.name, qid: u.qid || null, wiki: u.wiki || null, iso3: u.iso3 || null, counts: u.counts, primary: u.primary, primaryUnit: u.primaryUnit, ...(u.kind === 'focus' ? { ongoing: u.ongoing } : {}),
  countries: u.countries, page: u.page, seriesRule: u.seriesRule || 'shared', fighting: u.fighting, ...(u.volatility ? { volatility: u.volatility } : {}) });
const marks = {
  generated: NOW, rule: RULE.id, volatilityRule: VOL_RULE.id, month: M,
  sources: {
    realtime: { dataset: 'UCDP Candidate Events Dataset', version: CANDIDATE, built: rt.generated, latest: rt.latest, counting: rt.wars.some(w => w.series) ? 'shared' : 'start' },
    warFocus: { dataset: 'UCDP GED 26.1 and candidate events, state-based', built: wfIndex.generated, through: wfIndex.gedThrough },
    gedCountries: ged ? { version: ged.version, built: ged.generated, through: ged.through } : null,
    volatility: vol ? { method: vol.method, latest: vol.latest } : null,
    calendars: calGenerated,
  },
  strands, provisional: !final, revisions,
  bulletin: { month: M, provisional: !final, counts: bulletin.counts, top: top5 },
  units: units.map(strip),
  notes: Object.entries(GW_NOTES).map(([iso, text]) => ({ iso3: iso, text })),
};
const problems = marks.units.flatMap(u => [...markProblems(u.fighting).map(p => `${u.id}: ${p}`), ...(u.volatility ? markProblems(u.volatility).map(p => `${u.id} volatility: ${p}`) : [])]);
if (problems.length) { console.error(`Not written: ${problems.slice(0, 20).join('; ')}`); process.exit(1); }
if (prevMarks && prevMarks.units.length > 10 && marks.units.length < prevMarks.units.length / 2) refuseIfLost([`units ${prevMarks.units.length} → ${marks.units.length}`]);

const seriesOut = { generated: NOW, about: 'The months Month by Month has taken in for each unit, so a year\'s candidate months stay after realtime.json starts again each January. Generated by monthly/scripts/build.mjs; never edit by hand.', units: {} };
for (const u of units) {
  if (u.kind === 'war') seriesOut.units[u.id] = u.rows;
  if (u.kind === 'country') seriesOut.units[`gw:${u.gw}`] = u.rows.filter(r => +r.m.slice(0, 4) > GED_THROUGH);
}
writeIfChanged('monthly/data/series.json', seriesOut);
for (const u of units.filter(x => x.kind !== 'war')) writeIfChanged(`monthly/data/strips/${u.kind === 'country' ? u.iso3 : 'focus-' + u.id.slice(6)}.json`, { generated: NOW, ...stripOf(u) });
if (writeBulletin) write(`monthly/data/bulletins/${M}.json`, bulletin);
const allB = [...new Set([...kept.keys(), M])].sort().reverse();
writeIfChanged('monthly/data/bulletins/index.json', { generated: NOW, months: allB.map(m => ({ month: m, provisional: m === M ? (writeBulletin ? bulletin.provisional : keptM.provisional) : !!kept.get(m)?.provisional })) });
writeIfChanged('monthly/data/watch.json', watch);
if (writeWatchIssue) write(`monthly/data/watch/${watchMonth}.json`, { ...watch, issued: NOW });
const OUT_FILE = join(OUT, 'marks.json');
writeFileSync(OUT_FILE, JSON.stringify(marks));
writeHeads('monthly/data/marks.json'); // marks.head.json in step with it (integration/scripts/heads.mjs)
console.log(`Month by Month ${M}: ${units.length} units (${units.filter(u => u.kind === 'war').length} Realtime Battlefield wars, ${units.filter(u => u.kind === 'focus').length} War Focus wars, ${countryUnits.length} countries); bulletin ${writeBulletin ? (final ? 'issued' : 'provisional') : 'kept as issued'}; watch list ${watch.votes.length} votes, ${watch.summits.length} summits, ${watch.volatility.length} volatility rises.`);
