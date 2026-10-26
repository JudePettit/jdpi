// Geopolitical Volatility Index (GVI) for JDP-I — a port of the GTTS method "gvi-1.1" to a static daily build.
//   node volatility/scripts/ingest.mjs [--days 30]
// For each missing UTC day (oldest first): download GDELT 2.0's 96 quarter-hour event exports, keep events with a
// country location, and score five components per country:
//   conflict & security 35% (CAMEO 17–20) · political escalation 20% (10–13, 15, 16 excl. 162/163) · civil unrest 20%
//   (14) · economic disruption 10% (162/163) · cross-border spread 15% (conflict/political events between actors of
//   different countries).
// Intensity = Σ(0.1 + max(0, −Goldstein)/10) over a component's events ÷ all the country's events that day. Each
// component is ranked (mid-rank percentile) against all sufficiently covered country-days in the trailing 90 stored
// days; the score is the weighted sum, shrunk toward the day's evidence-weighted global mean by events/(events+75).
// Coverage: insufficient <25 events or <5 sources; low; medium ≥75 & 12; high ≥300 & 40. Needs ≥72 of 96 slices and
// ≥7 baseline days. Writes volatility/data/days/<day>.json and rebuilds volatility/data/index.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';

const ROOT = fileURLToPath(new URL('../data/', import.meta.url));
const DAYS_DIR = join(ROOT, 'days');
mkdirSync(DAYS_DIR, { recursive: true });
const UA = { 'User-Agent': 'JDP-I Geopolitical Volatility (https://jdpi.pages.dev)' };
export const METHOD = 'gvi-1.1-q96'; // gvi-1.1 scored on all 96 quarter-hour GDELT slices rather than the 24 on the hour
export const COMPONENTS = [
  { key: 'conflict', label: 'Conflict & security', weight: 0.35 },
  { key: 'political', label: 'Political / diplomatic escalation', weight: 0.2 },
  { key: 'unrest', label: 'Civil unrest', weight: 0.2 },
  { key: 'economic', label: 'Economic disruption', weight: 0.1 },
  { key: 'spread', label: 'Cross-border spread', weight: 0.15 },
];
const KEYS = COMPONENTS.map(c => c.key);
const SLOTS = 96, MIN_SLOTS = 72, BASELINE_DAYS = 90, MIN_BASELINE = 7, PRIOR = 75, EVIDENCE = 6;
const argDays = process.argv.indexOf('--days');
const LOOKBACK = argDays > 0 ? +process.argv[argDays + 1] : 14;
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));

// GDELT ActionGeo uses FIPS 10-4 country codes; map them to ISO3 with the countrycode project's code list.
const codelist = parseCsv(await (await fetch('https://raw.githubusercontent.com/vincentarelbundock/countrycode/main/dictionary/codelist_without_cldr.csv', { headers: UA })).text());
const FIPS = new Map();
for (const r of codelist) if (r.fips && r.iso3c && !['ATA', 'ATF'].includes(r.iso3c)) FIPS.set(r.fips, { iso3: r.iso3c, name: r['country.name.en'] });
FIPS.set('WE', { iso3: 'PSE', name: 'Palestine' }); // GDELT codes the Gaza Strip (GZ) and West Bank (WE) separately
FIPS.set('KV', { iso3: 'XKX', name: 'Kosovo' });

function categorize(code, root) {
  if (code.startsWith('162') || code.startsWith('163')) return 'economic';
  if (root >= 17 && root <= 20) return 'conflict';
  if (root === 14) return 'unrest';
  if ([10, 11, 12, 13, 15, 16].includes(root)) return 'political';
  return null;
}
const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Minimal zip reader for GDELT's single-file archives.
function unzipFirst(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0x04034b50) throw new Error('not a zip');
  const method = v.getUint16(8, true), csize = v.getUint32(18, true), nlen = v.getUint16(26, true), xlen = v.getUint16(28, true);
  const start = 30 + nlen + xlen;
  const data = buf.subarray(start, start + csize);
  return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
}

async function fetchSlot(day, slot) {
  const url = `https://data.gdeltproject.org/gdeltv2/${day.replaceAll('-', '')}${String(slot >> 2).padStart(2, '0')}${String((slot & 3) * 15).padStart(2, '0')}00.export.CSV.zip`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404) return null;
      if (r.ok) return unzipFirst(Buffer.from(await r.arrayBuffer()));
    } catch {}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return undefined; // error
}

function parseSlot(text, byCountry) {
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 61) continue;
    const fips = c[53] === 'GZ' ? 'WE' : c[53];
    if (!FIPS.has(fips)) continue;
    const url = c[60];
    if (!/^https?:\/\//i.test(url)) continue;
    const code = c[26], cat = categorize(code, +c[28]), g = +c[30] || 0, articles = +c[33] || 0;
    const cross = (cat === 'conflict' || cat === 'political') && !!c[7] && !!c[17] && c[7] !== c[17];
    (byCountry[fips] ||= []).push({ id: +c[0], code, g, a: articles, cat, cross, a1: c[6], a2: c[16], loc: c[52], url, s: (0.1 + Math.max(0, -g) / 10) * Math.log2(2 + articles) });
  }
}

function aggregate(records) {
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
const coverageOf = (n, s) => (n < 25 || s < 5 ? 'insufficient' : n >= 300 && s >= 40 ? 'high' : n >= 75 && s >= 12 ? 'medium' : 'low');
function midrank(sorted, x) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  const less = lo; let lo2 = less; hi = sorted.length;
  while (lo2 < hi) { const m = (lo2 + hi) >> 1; if (sorted[m] <= x) lo2 = m + 1; else hi = m; }
  return ((less + 0.5 * (lo2 - less)) / sorted.length) * 100;
}
const storedDays = () => readdirSync(DAYS_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, 10)).sort();
const loadDay = d => JSON.parse(readFileSync(join(DAYS_DIR, d + '.json'), 'utf8'));

async function ingestDay(day) {
  const byCountry = {};
  let ok = 0;
  for (let i = 0; i < SLOTS; i += 8) {
    const texts = await Promise.all(Array.from({ length: 8 }, (_, j) => fetchSlot(day, i + j)));
    for (const t of texts) if (typeof t === 'string') { parseSlot(t, byCountry); ok++; }
  }
  const merged = Object.fromEntries(Object.entries(byCountry).map(([f, r]) => [f, aggregate(r)]));
  const totalEvents = Object.values(merged).reduce((t, m) => t + m.n, 0);
  const today = {};
  for (const [f, m] of Object.entries(merged)) today[f] = { raw: Object.fromEntries(KEYS.map(k => [k, m.n ? m.w[k] / m.n : 0])), cov: coverageOf(m.n, m.src.size) };
  // Trailing baseline from stored days (no look-ahead), plus today.
  const pool = Object.fromEntries(KEYS.map(k => [k, []]));
  const base = storedDays().filter(d => d >= addDays(day, -(BASELINE_DAYS - 1)) && d < day);
  for (const d of base) for (const c of Object.values(loadDay(d).countries)) if (c.coverage !== 'insufficient') for (const k of KEYS) pool[k].push(c.raw[k]);
  const slotsOk = ok >= MIN_SLOTS;
  let baselineDays = base.length;
  if (slotsOk && Object.values(today).some(t => t.cov !== 'insufficient')) { baselineDays++; for (const t of Object.values(today)) if (t.cov !== 'insufficient') for (const k of KEYS) pool[k].push(t.raw[k]); }
  for (const k of KEYS) pool[k].sort((a, b) => a - b);

  const countries = {};
  for (const [fips, m] of Object.entries(merged)) {
    const t = today[fips], meta = FIPS.get(fips);
    let score = null, components = null, reason = null;
    if (!slotsOk) reason = `Only ${ok}/${SLOTS} GDELT slices retrieved`;
    else if (t.cov === 'insufficient') reason = 'Too few events or sources';
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
      share: totalEvents ? m.n / totalEvents : 0, coverage: slotsOk ? t.cov : 'insufficient',
      evidence: m.ev.filter(e => !seen.has(e.url) && seen.add(e.url)).slice(0, EVIDENCE).map(e => ({ code: e.code, cat: e.cat, g: e.g, a: e.a, a1: e.a1, a2: e.a2, loc: e.loc, url: e.url })),
    };
  }
  // Shrink toward the evidence-weighted global mean so thinly covered countries don't swing to extremes.
  const scored = Object.values(countries).filter(c => c.score != null);
  const vol = scored.reduce((n, c) => n + c.events, 0);
  const mean = vol ? scored.reduce((n, c) => n + c.score * c.events, 0) / vol : 0;
  for (const c of scored) { const w = c.events / (c.events + PRIOR); c.score = Math.round((mean + w * (c.score - mean)) * 10) / 10; }
  writeFileSync(join(DAYS_DIR, day + '.json'), JSON.stringify({ day, method: METHOD, slots: ok, totalEvents, baselineDays, globalMean: Math.round(mean * 10) / 10, countries }));
  console.log(`${day}: ${ok}/${SLOTS} slices, ${Object.keys(countries).length} countries, ${scored.length} scored, baseline ${baselineDays} days`);
}

// ---- Missing days in the look-back window, oldest first (the baseline must be built in order).
const yesterday = addDays(ymd(new Date()), -1);
const have = new Set(storedDays());
for (let i = LOOKBACK; i >= 1; i--) { const d = addDays(yesterday, -(i - 1)); if (!have.has(d)) await ingestDay(d); }

// ---- index.json: per-country daily series (score, components, events, tone, coverage) for the last 365 days and the
// latest day's details. Day files older than the baseline window are pruned; their rows live on in the index.
const INDEX = join(ROOT, 'index.json');
const prev = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { countries: {}, global: [] };
const stored = storedDays(), latestDay = stored.at(-1), cutoff = addDays(latestDay, -364);
const series = {}, global = new Map(prev.global.map(g => [g[0], g]));
for (const [iso, s] of Object.entries(prev.countries)) series[iso] = { name: s.name, days: new Map(s.days.map(r => [r[0], r])) };
for (const d of stored) {
  const x = loadDay(d);
  global.set(d, [d, x.totalEvents, x.slots, x.globalMean]);
  for (const [iso, c] of Object.entries(x.countries)) {
    const s = (series[iso] ||= { name: c.name, days: new Map() });
    s.days.set(d, [d, c.score, c.components ? KEYS.map(k => c.components[k]) : null, c.events, c.tone, c.coverage[0]]);
  }
}
const last = loadDay(latestDay);
const countries = {};
for (const [iso, s] of Object.entries(series)) {
  const days = [...s.days.values()].filter(r => r[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (days.length) countries[iso] = { name: s.name, days, latest: last.countries[iso] || null };
}
const globalRows = [...global.values()].filter(g => g[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
writeFileSync(INDEX, JSON.stringify({ generated: new Date().toISOString(), method: METHOD, components: COMPONENTS, latest: latestDay, days: globalRows.length, global: globalRows, countries }));
for (const d of stored) if (d < addDays(latestDay, -(BASELINE_DAYS + 5))) unlinkSync(join(DAYS_DIR, d + '.json'));
console.log(`index: ${globalRows.length} days, ${Object.keys(countries).length} countries, latest ${latestDay}`);
