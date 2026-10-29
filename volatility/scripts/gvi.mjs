// Geopolitical Volatility Index (GVI): the method, as pure functions with no side effects on import (no network, no
// writes), so tests can load it. ingest.mjs is the script the workflow runs: it downloads GDELT, reads and writes
// volatility/data and calls these. The method is described at the top of ingest.mjs.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export const METHOD = 'gvi-1.1-q96'; // gvi-1.1 scored on all 96 quarter-hour GDELT slices rather than the 24 on the hour
export const COMPONENTS = [
  { key: 'conflict', label: 'Conflict & security', weight: 0.35 },
  { key: 'political', label: 'Political / diplomatic escalation', weight: 0.2 },
  { key: 'unrest', label: 'Civil unrest', weight: 0.2 },
  { key: 'economic', label: 'Economic disruption', weight: 0.1 },
  { key: 'spread', label: 'Cross-border spread', weight: 0.15 },
];
export const KEYS = COMPONENTS.map(c => c.key);
// A day has 96 quarter-hour slices and is stored only with at least 72 of them. The baseline is the stored days in the
// trailing 90 and needs 7 of them; PRIOR is the shrinkage weight in events; EVIDENCE the strongest events kept per country.
export const SLOTS = 96, MIN_SLOTS = 72, BASELINE_DAYS = 90, MIN_BASELINE = 7, PRIOR = 75, EVIDENCE = 6;
// Content guard for a day that has its slices. The thinnest complete days stored (2026-09-26 to 10-27, all 96 slices) had
// 14,471 located events (Sunday 4 October) and 191 countries with events (Sunday 25 October); with only 72 of their
// slices they would still have about 10,850 events and 185 countries. So GDELT's volume would have to fall by more than
// half for a real day to fail. A broken FIPS table leaves only the three codes set below (at most 3 countries and some
// 200 events) and a change in GDELT's columns leaves none: a day under either limit is a broken build, not a quiet day.
export const MIN_EVENTS = 5000, MIN_COUNTRIES = 120;

export const ymd = d => d.toISOString().slice(0, 10);
export const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));

// GDELT ActionGeo uses FIPS 10-4 country codes. fips-iso3.json maps them to ISO3: an extract of the countrycode project's
// code list at a pinned commit (its source, sha256 and licence are in the file), so no build depends on fetching it.
// Antarctica and the French Southern Territories are left out. GDELT codes the West Bank (WE) and the Gaza Strip (GZ)
// separately, and uses Kosovo's KV and South Sudan's OD (FIPS since 2011), which the code list does not map.
export const FIPS_TABLE = JSON.parse(readFileSync(new URL('./fips-iso3.json', import.meta.url), 'utf8'));
export function fipsMap(rows) {
  const m = new Map();
  for (const [fips, iso3, name] of rows) if (!['ATA', 'ATF'].includes(iso3)) m.set(fips, { iso3, name });
  m.set('WE', { iso3: 'PSE', name: 'Palestine' });
  m.set('KV', { iso3: 'XKX', name: 'Kosovo' });
  m.set('OD', { iso3: 'SSD', name: 'South Sudan' });
  return m;
}
export const FIPS = fipsMap(FIPS_TABLE.rows);
// Codes GDELT uses for part of a country, counted with the rest of it: Gaza with the West Bank, and Belgrade, which GDELT
// codes RB (an older FIPS code for Serbia) while the rest of Serbia is RI.
export const FIPS_ALIAS = new Map([['GZ', 'WE'], ['RB', 'RI']]);

export function categorize(code, root) {
  if (code.startsWith('162') || code.startsWith('163')) return 'economic';
  if (root >= 17 && root <= 20) return 'conflict';
  if (root === 14) return 'unrest';
  if ([10, 11, 12, 13, 15, 16].includes(root)) return 'political';
  return null;
}
export const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Minimal zip reader for GDELT's single-file archives.
export function unzipFirst(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0x04034b50) throw new Error('not a zip');
  const method = v.getUint16(8, true), csize = v.getUint32(18, true), nlen = v.getUint16(26, true), xlen = v.getUint16(28, true);
  const start = 30 + nlen + xlen;
  const data = buf.subarray(start, start + csize);
  return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
}

// The event export of quarter-hour `slot` (0–95) of `day`.
export const slotUrl = (day, slot) => `https://data.gdeltproject.org/gdeltv2/${day.replaceAll('-', '')}${String(slot >> 2).padStart(2, '0')}${String((slot & 3) * 15).padStart(2, '0')}00.export.CSV.zip`;

// Add a slice's events with a mapped ActionGeo country and a web source to byCountry (FIPS code → event records).
export function parseSlot(text, byCountry, table = FIPS) {
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 61) continue;
    const fips = FIPS_ALIAS.get(c[53]) || c[53];
    if (!table.has(fips)) continue;
    const url = c[60];
    if (!/^https?:\/\//i.test(url)) continue;
    const code = c[26], cat = categorize(code, +c[28]), g = +c[30] || 0, articles = +c[33] || 0;
    const cross = (cat === 'conflict' || cat === 'political') && !!c[7] && !!c[17] && c[7] !== c[17];
    (byCountry[fips] ||= []).push({ id: +c[0], code, g, a: articles, cat, cross, a1: c[6], a2: c[16], loc: c[52], url, s: (0.1 + Math.max(0, -g) / 10) * Math.log2(2 + articles) });
  }
  return byCountry;
}

// Download a day's slices 8 at a time and parse them. fetchSlot(day, slot) gives a slice's text, null when GDELT has not
// published it (404) or undefined when it could not be fetched. Stops as soon as MIN_SLOTS is out of reach, which also
// bounds the run time when GDELT is down.
export async function fetchDay(day, fetchSlot, table = FIPS) {
  const byCountry = {};
  let ok = 0, missing = 0, failed = 0;
  for (let i = 0; i < SLOTS && missing + failed <= SLOTS - MIN_SLOTS; i += 8) {
    const texts = await Promise.all(Array.from({ length: 8 }, (_, j) => fetchSlot(day, i + j)));
    for (const t of texts) if (typeof t === 'string') { parseSlot(t, byCountry, table); ok++; } else if (t === null) missing++; else failed++;
  }
  return { ok, missing, failed, byCountry };
}

export function aggregate(records) {
  const seen = new Set(), recs = records.filter(r => !seen.has(r.url) && seen.add(r.url));
  const a = { n: 0, art: 0, src: new Set(), w: zero(), k: zero(), tone: 0, ev: [] };
  for (const e of recs) {
    a.n++; a.art += e.a; a.tone += e.g;
    const d = domainOf(e.url); if (d) a.src.add(d);
    if (!e.cat) continue;
    const w = 0.1 + Math.max(0, -e.g) / 10;
    a.w[e.cat] += w; a.k[e.cat]++;
    if (e.cross) { a.w.spread += w; a.k.spread++; }
    a.ev.push(e);
  }
  a.ev.sort((x, y) => y.s - x.s);
  return a;
}
export const mergeDay = byCountry => Object.fromEntries(Object.entries(byCountry).map(([f, r]) => [f, aggregate(r)]));
export const coverageOf = (n, s) => (n < 25 || s < 5 ? 'insufficient' : n >= 300 && s >= 40 ? 'high' : n >= 75 && s >= 12 ? 'medium' : 'low');
export function midrank(sorted, x) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  const less = lo; let lo2 = less; hi = sorted.length;
  while (lo2 < hi) { const m = (lo2 + hi) >> 1; if (sorted[m] <= x) lo2 = m + 1; else hi = m; }
  return ((less + 0.5 * (lo2 - less)) / sorted.length) * 100;
}

// The content guard: what is wrong with a day of this many located events and countries, or null.
export const thinDay = (events, countries) => (events >= MIN_EVENTS && countries >= MIN_COUNTRIES ? null
  : `only ${events} located events in ${countries} countries (a complete day has at least ${MIN_EVENTS} and ${MIN_COUNTRIES})`);
// Why a stored day file is not a complete day (too few slices, or too thin), or null.
export const dayProblem = x => (!(x?.slots >= MIN_SLOTS) ? `only ${x?.slots ?? 0}/${SLOTS} GDELT slices`
  : thinDay(x.totalEvents, Object.keys(x.countries || {}).length));

// The days of the look-back window ending `yesterday` to ingest, oldest first (the baseline is built in order): those
// with no complete stored file (complete(day) is false when it is missing, unreadable, short or thin).
export function daysToIngest(yesterday, lookback, complete) {
  const days = [];
  for (let i = lookback - 1; i >= 0; i--) { const d = addDays(yesterday, -i); if (!complete(d)) days.push(d); }
  return days;
}

// Score a day: `merged` maps FIPS codes to aggregate()s, the third argument is fetchDay's slice counts, and `prior` the
// stored days of the baseline window before it (any iterable of day objects, read once). Returns the day file's contents.
export function scoreDay(day, merged, { ok, missing = 0, failed = 0 }, prior, table = FIPS) {
  const totalEvents = Object.values(merged).reduce((t, m) => t + m.n, 0);
  const today = {};
  for (const [f, m] of Object.entries(merged)) today[f] = { raw: Object.fromEntries(KEYS.map(k => [k, m.n ? m.w[k] / m.n : 0])), cov: coverageOf(m.n, m.src.size) };
  // Trailing baseline from stored days (no look-ahead), plus today.
  const pool = Object.fromEntries(KEYS.map(k => [k, []]));
  let baselineDays = 0;
  for (const p of prior) { baselineDays++; for (const c of Object.values(p.countries)) if (c.coverage !== 'insufficient') for (const k of KEYS) pool[k].push(c.raw[k]); }
  if (Object.values(today).some(t => t.cov !== 'insufficient')) { baselineDays++; for (const t of Object.values(today)) if (t.cov !== 'insufficient') for (const k of KEYS) pool[k].push(t.raw[k]); }
  for (const k of KEYS) pool[k].sort((a, b) => a - b);

  const countries = {};
  for (const [fips, m] of Object.entries(merged)) {
    const t = today[fips], meta = table.get(fips);
    let score = null, components = null, reason = null;
    if (t.cov === 'insufficient') reason = 'Too few events or sources';
    else if (baselineDays < MIN_BASELINE) reason = `Baseline has ${baselineDays}/${MIN_BASELINE} days`;
    else {
      components = {}; let s = 0;
      for (const c of COMPONENTS) { const p = midrank(pool[c.key], t.raw[c.key]); components[c.key] = Math.round(p * 10) / 10; s += c.weight * p; }
      score = Math.round(s * 10) / 10;
    }
    const seen = new Set();
    countries[meta.iso3] = {
      fips, name: meta.name, score, components, reason, raw: t.raw, counts: m.k,
      events: m.n, articles: m.art, sources: m.src.size, tone: m.n ? Math.round(m.tone / m.n * 100) / 100 : null,
      share: totalEvents ? m.n / totalEvents : 0, coverage: t.cov,
      evidence: m.ev.filter(e => !seen.has(e.url) && seen.add(e.url)).slice(0, EVIDENCE).map(e => ({ code: e.code, cat: e.cat, g: e.g, a: e.a, a1: e.a1, a2: e.a2, loc: e.loc, url: e.url })),
    };
  }
  // Shrink toward the evidence-weighted global mean so thinly covered countries don't swing to extremes. A day with no
  // country scored (the first week, while the baseline fills) has no mean.
  const scored = Object.values(countries).filter(c => c.score != null);
  const vol = scored.reduce((n, c) => n + c.events, 0);
  const mean = vol ? scored.reduce((n, c) => n + c.score * c.events, 0) / vol : 0;
  for (const c of scored) { const w = c.events / (c.events + PRIOR); c.score = Math.round((mean + w * (c.score - mean)) * 10) / 10; }
  return { day, method: METHOD, slots: ok, missing, failed, totalEvents, baselineDays, globalMean: scored.length ? Math.round(mean * 10) / 10 : null, countries };
}

// index.json: per-country daily rows [day, score, [5 components] or null, events, tone, coverage initial] and global rows
// [day, located events, slices, mean score or null] for the last 365 days, and each country's latest-day record.
// `stored` lists the day files oldest first and load(day) reads one. The day files are the only source for the days they
// cover: rows are carried over from the previous index only for days older than the oldest file (pruned ones), so a day
// that is skipped or deleted leaves no row behind.
export function buildIndex(prev, stored, load, generated) {
  if (!stored.length) throw new Error('No complete day is stored; nothing to index');
  const first = stored[0];
  // Pruned days live on through their rows, except a short or thin day that older code wrote: its rows would hold nulls.
  const kept = g => g[0] < first && g[2] >= MIN_SLOTS && g[1] >= MIN_EVENTS;
  const global = new Map((prev?.global || []).filter(kept).map(g => [g[0], g]));
  const series = {};
  for (const [iso, s] of Object.entries(prev?.countries || {})) series[iso] = { name: s.name, days: new Map(s.days.filter(r => global.has(r[0])).map(r => [r[0], r])) };
  let last;
  for (const d of stored) {
    const x = load(d);
    last = x;
    const anyScored = Object.values(x.countries).some(c => c.score != null);
    global.set(d, [d, x.totalEvents, x.slots, anyScored ? x.globalMean : null]); // day files written before 2026-10-29 hold 0
    for (const [iso, c] of Object.entries(x.countries)) {
      const s = (series[iso] ||= { name: c.name, days: new Map() });
      s.days.set(d, [d, c.score, c.components ? KEYS.map(k => c.components[k]) : null, c.events, c.tone, c.coverage[0]]);
    }
  }
  const latest = stored.at(-1), cutoff = addDays(latest, -364);
  const countries = {};
  for (const [iso, s] of Object.entries(series)) {
    const days = [...s.days.values()].filter(r => r[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (days.length) countries[iso] = { name: s.name, days, latest: last.countries[iso] || null };
  }
  const globalRows = [...global.values()].filter(g => g[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { generated, method: METHOD, components: COMPONENTS, latest, days: globalRows.length, global: globalRows, countries };
}
// Day files kept: the baseline, 5 spare days and the latest (96). Older ones are pruned; their rows live on in the index.
export const pruneBefore = latest => addDays(latest, -(BASELINE_DAYS + 5));
