// Builds traders/data/investors.json: the latest two quarterly 13F holdings reports of well-known investors,
// with what they bought, added to, trimmed and sold.
//   node traders/scripts/build-13f.mjs
// Source: SEC EDGAR (13F-HR). 13F covers US-listed long positions of managers with over $100m, filed within
// 45 days of each quarter end; shorts and most non-US holdings are not included.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = { 'User-Agent': 'JDP-I Trader Tracker judep92@gmail.com' };
// CIKs are checked against EDGAR's registered names when the script runs.
const INVESTORS = [
  { cik: 1067983, person: 'Warren Buffett', fund: 'Berkshire Hathaway', style: 'Value investing; long-term holdings of quality businesses' },
  { cik: 1336528, person: 'Bill Ackman', fund: 'Pershing Square Capital Management', style: 'Concentrated activist investing' },
  { cik: 1649339, person: 'Michael Burry', fund: 'Scion Asset Management', style: 'Contrarian value; known for shorting US housing before 2008' },
  { cik: 1350694, person: 'Ray Dalio', fund: 'Bridgewater Associates', style: 'Global macro; "All Weather" risk parity' },
  { cik: 1536411, person: 'Stanley Druckenmiller', fund: 'Duquesne Family Office', style: 'Global macro; growth and technology' },
  { cik: 1656456, person: 'David Tepper', fund: 'Appaloosa Management', style: 'Distressed debt and opportunistic equities' },
  { cik: 1029160, person: 'George Soros', fund: 'Soros Fund Management', style: 'Global macro' },
  { cik: 1040273, person: 'Dan Loeb', fund: 'Third Point', style: 'Event-driven and activist' },
  { cik: 1079114, person: 'David Einhorn', fund: 'Greenlight Capital', style: 'Value and short selling' },
  { cik: 921669, person: 'Carl Icahn', fund: 'Icahn Capital', style: 'Activist investing' },
];

async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return json ? res.json() : res.text();
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`EDGAR ${url}`);
}
const pause = () => new Promise(r => setTimeout(r, 250)); // EDGAR asks for at most 10 requests a second

function parseInfoTable(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const f = tag => (m[1].match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<`)) || [])[1]?.trim() || '';
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
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/investors.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString(), source: 'SEC EDGAR Form 13F-HR', investors: out }));
