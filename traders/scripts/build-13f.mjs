// Builds traders/data/investors.json: the latest two quarterly 13F holdings reports of well-known investors,
// with what they bought, added to, trimmed and sold, and a US ticker for each holding so Algo Trader can mirror it.
//   node traders/scripts/build-13f.mjs                  full build from SEC EDGAR, then tickers
//   node traders/scripts/build-13f.mjs --tickers-only   only (re)assign tickers in the existing investors.json
// Source: SEC EDGAR (13F-HR). 13F covers US-listed long positions of managers with over $100m, filed within
// 45 days of each quarter end; shorts and most non-US holdings are not included.
// Tickers: OpenFIGI's mapping API turns each CUSIP into its US composite listing. Answers are cached in
// traders/scripts/figi-cache.json, so a refresh only looks up CUSIPs it has not seen (and re-checks old answers
// now and then, as tickers change). Without OPENFIGI_API_KEY the API takes 10 jobs a request, 25 requests a minute.
// Guard: when EDGAR gives nothing the build exits 1, and nothing is written when an investor still listed below is
// missing (its filings could not be read), has no positions where it had some, or a tenth fewer in the same quarter;
// --allow-drop writes anyway.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { refuseIfLost } from '../../calendar/scripts/guard.mjs';

const UA = { 'User-Agent': 'PRP Auto Trader judep92@gmail.com' };
const OUT = new URL('../data/investors.json', import.meta.url);
// CIKs are checked against EDGAR's registered names when the script runs.
const INVESTORS = [
  { cik: 1067983, person: 'Warren Buffett', fund: 'Berkshire Hathaway', style: 'Value investing; long-term holdings of quality businesses' },
  { cik: 2026053, person: 'Bill Ackman', fund: 'Pershing Square (Pershing Square Inc.; filed as Pershing Square Capital Management, CIK 1336528, until Q1 2026)', style: 'Concentrated activist investing' },
  { cik: 1649339, person: 'Michael Burry', fund: 'Scion Asset Management', style: 'Contrarian value; known for shorting US housing before 2008', stale: 'Scion deregistered in November 2025; its last 13F covers Q3 2025 and will not update.' },
  { cik: 1350694, person: 'Ray Dalio', fund: 'Bridgewater Associates', style: 'Global macro; "All Weather" risk parity' },
  { cik: 1536411, person: 'Stanley Druckenmiller', fund: 'Duquesne Family Office', style: 'Global macro; growth and technology' },
  { cik: 1656456, person: 'David Tepper', fund: 'Appaloosa Management', style: 'Distressed debt and opportunistic equities' },
  { cik: 1029160, person: 'George Soros', fund: 'Soros Fund Management', style: 'Global macro' },
  { cik: 1040273, person: 'Dan Loeb', fund: 'Third Point', style: 'Event-driven and activist' },
  { cik: 1489933, person: 'David Einhorn', fund: 'Greenlight Capital (files as DME Capital Management)', style: 'Value and short selling' },
  { cik: 921669, person: 'Carl Icahn', fund: 'Icahn Capital', style: 'Activist investing' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return json ? await res.json() : await res.text();
    } catch {} // a refused connection or a body cut off mid-read: tried again like an HTTP error
    await sleep(1500 * (i + 1));
  }
  throw new Error(`EDGAR ${url}`);
}
const pause = () => sleep(250); // EDGAR asks for at most 10 requests a second

// Issuer names arrive XML-escaped ("PG&amp;E CORP").
const xmlText = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (m, d, h, n) => (d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[n.toLowerCase()]));
function parseInfoTable(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const f = tag => xmlText((m[1].match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<`)) || [])[1]?.trim() || '');
    rows.push({ name: f('nameOfIssuer'), cls: f('titleOfClass'), cusip: f('cusip'), value: +f('value'), shares: +f('sshPrnamt'), putCall: f('putCall') || null });
  }
  return rows;
}

async function holdings(cik, filing) {
  const acc = filing.accession.replace(/-/g, '');
  const index = await get(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/index.json`);
  await pause();
  const files = index.directory.item.map(i => i.name).filter(n => n.endsWith('.xml') && n !== 'primary_doc.xml');
  for (const name of files) {
    const rows = parseInfoTable(await get(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${name}`, false));
    await pause();
    if (rows.length) {
      // Merge rows for the same security (managers often split holdings across sub-advisers).
      const by = new Map();
      for (const r of rows) {
        const k = r.cusip + '|' + (r.putCall || '');
        const x = by.get(k) || by.set(k, { ...r, value: 0, shares: 0 }).get(k);
        x.value += r.value; x.shares += r.shares;
      }
      // Since 2023 13F values are in dollars, but some filers still report thousands: detect that from
      // the implied share price of ordinary (non-option) holdings.
      const prices = [...by.values()].filter(h => !h.putCall && h.shares > 0).map(h => h.value / h.shares).sort((a, b) => a - b);
      const scale = prices.length && prices[Math.floor(prices.length / 2)] < 1 ? 1000 : 1;
      return [...by.values()].map(h => ({ ...h, value: h.value * scale }));
    }
  }
  return [];
}

async function build13f() {
  const out = [];
  for (const inv of INVESTORS) {
    try {
      const sub = await get(`https://data.sec.gov/submissions/CIK${String(inv.cik).padStart(10, '0')}.json`);
      await pause();
      const r = sub.filings.recent;
      const f13 = r.form.map((form, i) => ({ form, accession: r.accessionNumber[i], filed: r.filingDate[i], period: r.reportDate[i] }))
        .filter(f => f.form === '13F-HR').slice(0, 2);
      if (!f13.length) { console.warn(inv.fund, 'no 13F-HR'); continue; }
      const [cur, prev] = await Promise.all(f13.map(f => holdings(inv.cik, f)));
      const total = cur.reduce((s, h) => s + h.value, 0);
      const prevBy = new Map((prev || []).map(h => [h.cusip + '|' + (h.putCall || ''), h]));
      const curBy = new Set(cur.map(h => h.cusip + '|' + (h.putCall || '')));
      const positions = cur.map(h => {
        const p = prevBy.get(h.cusip + '|' + (h.putCall || ''));
        const change = !p ? 'new' : h.shares > p.shares * 1.005 ? 'added' : h.shares < p.shares * 0.995 ? 'trimmed' : 'unchanged';
        return { name: h.name, cls: h.cls, cusip: h.cusip, putCall: h.putCall, value: h.value, shares: h.shares, weight: total ? h.value / total : 0, change, sharesChange: p ? h.shares - p.shares : h.shares };
      }).sort((a, b) => b.value - a.value);
      const sold = (prev || []).filter(h => !curBy.has(h.cusip + '|' + (h.putCall || ''))).map(h => ({ name: h.name, cls: h.cls, cusip: h.cusip, putCall: h.putCall, value: h.value, shares: h.shares })).sort((a, b) => b.value - a.value);
      out.push({ ...inv, registeredName: sub.name, period: f13[0].period, filed: f13[0].filed, previousPeriod: f13[1]?.period || null,
        filingUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${inv.cik}&type=13F-HR`, total, positions, sold });
      console.log(`${inv.person} (${sub.name}): ${positions.length} positions, ${sold.length} sold, quarter ${f13[0].period}`);
    } catch (e) { console.warn(inv.fund, e.message); }
  }
  return { generated: new Date().toISOString(), source: 'SEC EDGAR Form 13F-HR', investors: out };
}

/* ---------- Tickers (OpenFIGI: CUSIP → US listing) ---------- */
const FIGI_URL = 'https://api.openfigi.com/v3/mapping';
const FIGI_CACHE = new URL('./figi-cache.json', import.meta.url);
const FIGI_KEY = process.env.OPENFIGI_API_KEY || '';
const FIGI_JOBS = FIGI_KEY ? 100 : 10;      // jobs per request
const FIGI_GAP = FIGI_KEY ? 260 : 2500;     // ms between requests: 25 a minute without a key, 25 per 6 s with one
const RECHECK_DAYS = { mapped: 180, unmapped: 30 };
const PREFERRED = ['Common Stock', 'ETP', 'ADR'];
const today = new Date().toISOString().slice(0, 10);
const ageDays = d => (Date.parse(today) - Date.parse(d || '1970-01-01')) / 864e5;
// 13F CUSIPs are nine characters; a few filers drop leading zeros or use lower case.
const cusipKey = c => { const k = String(c || '').trim().toUpperCase(); return /^[0-9A-Z]{6,9}$/.test(k) ? k.padStart(9, '0') : null; };

function readCache() { try { return JSON.parse(readFileSync(FIGI_CACHE, 'utf8')); } catch { return {}; } }
// One CUSIP per line, sorted, so weekly diffs stay small.
function writeCache(cache) {
  writeFileSync(FIGI_CACHE, '{\n' + Object.keys(cache).sort().map(k => `${JSON.stringify(k)}: ${JSON.stringify(cache[k])}`).join(',\n') + '\n}\n');
}

// Foreign issuers' numbers (CINS) start with a letter and need their own id type.
const idType = c => (/^[A-Z]/.test(c) ? 'ID_CINS' : 'ID_CUSIP');
// US venues in OpenFIGI's (Bloomberg) exchange codes, for the few securities OpenFIGI lists without a US composite.
const US_VENUES = ['UN', 'UW', 'UQ', 'UR', 'UA', 'UP', 'UF', 'UV', 'UB', 'UC', 'UD', 'UM', 'UT', 'UU', 'UX', 'UZ'];
// The best US listing among OpenFIGI's answers: the US composite before single venues, and common stock / ETP / ADR
// before other equity types. Bonds, preferreds and listings outside the US give null.
function pick(data) {
  const venue = d => (d.exchCode === 'US' ? 0 : US_VENUES.includes(d.exchCode) ? 1 + US_VENUES.indexOf(d.exchCode) : -1);
  const rank = d => venue(d) + (PREFERRED.includes(d.securityType) ? 0 : 100);
  return (data || []).filter(d => d.ticker && d.marketSector === 'Equity' && venue(d) >= 0).sort((a, b) => rank(a) - rank(b))[0] || null;
}

async function figi(jobs) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(FIGI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(FIGI_KEY ? { 'X-OPENFIGI-APIKEY': FIGI_KEY } : {}) }, body: JSON.stringify(jobs) });
    if (res.ok) return res.json();
    if (res.status === 429) { const wait = (+res.headers.get('ratelimit-reset') || 60) + 1; console.warn(`OpenFIGI: rate limited, waiting ${wait}s`); await sleep(wait * 1000); continue; }
    if (res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
    throw new Error(`OpenFIGI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  throw new Error('OpenFIGI: gave up after repeated errors');
}

async function addTickers(data) {
  const cache = readCache();
  const holdingsOf = i => [...i.positions, ...(i.sold || [])];
  const all = [...new Set(data.investors.flatMap(holdingsOf).map(h => cusipKey(h.cusip)).filter(Boolean))];
  const todo = all.filter(c => { const e = cache[c]; return !e || ageDays(e.at) > (e.ticker ? RECHECK_DAYS.mapped : RECHECK_DAYS.unmapped); });
  console.log(`OpenFIGI: ${all.length} CUSIPs, ${todo.length} to look up${FIGI_KEY ? ' (with API key)' : ''}`);
  // First ask for the US composite listing only (small answers); then ask again, unfiltered, for those without one.
  // A CUSIP found in neither pass is cached as null and asked again after RECHECK_DAYS.unmapped.
  const lookup = async (cusips, usOnly) => {
    for (let i = 0; i < cusips.length; i += FIGI_JOBS) {
      const batch = cusips.slice(i, i + FIGI_JOBS);
      const answers = await figi(batch.map(c => ({ idType: idType(c), idValue: c, ...(usOnly ? { exchCode: 'US' } : {}) })));
      batch.forEach((c, j) => {
        const best = pick(answers[j]?.data);
        if (best) cache[c] = { ticker: best.ticker, exch: best.exchCode, type: best.securityType, name: best.name, figi: best.figi, at: today };
        else if (!usOnly) cache[c] = { ticker: null, at: today };
      });
      if ((i / FIGI_JOBS) % 20 === 19) { writeCache(cache); console.log(`OpenFIGI: ${i + batch.length} of ${cusips.length}${usOnly ? '' : ' (second pass)'}`); }
      if (i + FIGI_JOBS < cusips.length) await sleep(FIGI_GAP);
    }
  };
  try {
    await lookup(todo, true);
    const missed = todo.filter(c => cache[c]?.at !== today);
    if (missed.length) { console.log(`OpenFIGI: ${missed.length} without a US composite listing; checking single US venues`); await sleep(FIGI_GAP); await lookup(missed, false); }
  } catch (e) { console.warn('OpenFIGI lookups stopped early; the rest keep their cached tickers:', e.message); }
  writeCache(cache);

  // Tickers as brokers write them: OpenFIGI's class separator "BRK/B" becomes "BRK.B". Options carry the underlying's ticker.
  const tickerOf = h => cache[cusipKey(h.cusip)]?.ticker?.replace(/\//g, '.') || null;
  const withTicker = h => { const { name, ticker: _old, ...rest } = h; return { name, ticker: tickerOf(h), ...rest }; };
  let mapped = 0, count = 0;
  for (const inv of data.investors) {
    inv.positions = inv.positions.map(withTicker);
    inv.sold = (inv.sold || []).map(withTicker);
    const share = inv.total ? inv.positions.filter(p => p.ticker).reduce((s, p) => s + p.value, 0) / inv.total : 0;
    console.log(`  ${inv.person}: ${inv.positions.filter(p => p.ticker).length} of ${inv.positions.length} holdings have a ticker (${(share * 100).toFixed(1)}% of value)`);
    for (const h of holdingsOf(inv)) { count++; if (h.ticker) mapped++; }
  }
  data.tickers = { source: 'OpenFIGI (CUSIP to US listing)', mapped, of: count };
  return data;
}

const tickersOnly = process.argv.includes('--tickers-only');
const data = tickersOnly ? JSON.parse(readFileSync(OUT, 'utf8')) : await build13f();
// Nothing read at all is EDGAR failing (or blocking us), not a quiet week: the run must go red, not green with old data.
if (!data.investors.length) { console.error('No 13F filings could be read; investors.json is unchanged'); process.exit(1); }
// The guard, against the committed file, for investors still listed (one taken out on purpose is not compared). A new
// quarter may change the positions freely, but not to none; the same quarter is the same filing, so a tenth fewer
// positions is a holdings file read short.
if (!tickersOnly) {
  const now = new Map(data.investors.map(i => [i.cik, i]));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { investors: [] };
  refuseIfLost(prev.investors.filter(p => INVESTORS.some(i => i.cik === p.cik)).flatMap(p => {
    const n = now.get(p.cik);
    if (!n) return [`${p.person}: no 13F read`];
    if (p.positions.length && !n.positions.length) return [`${p.person} positions ${p.positions.length} → 0`];
    return n.period === p.period && n.positions.length < p.positions.length * 0.9 ? [`${p.person} positions ${p.positions.length} → ${n.positions.length}`] : [];
  }));
}
await addTickers(data);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify(data));
console.log(`investors.json: ${data.investors.length} investors, ${data.tickers.mapped} of ${data.tickers.of} holdings with a ticker`);
