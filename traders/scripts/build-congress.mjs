// Builds traders/data/congress.json: stock trades disclosed by members of the US House of Representatives.
//   node traders/scripts/build-congress.mjs [years…] [--allow-drop]      (default: this year and last)
// Source: Clerk of the House, Periodic Transaction Reports (STOCK Act). Electronic filings are parsed from
// their PDFs; scanned paper filings can't be read and are listed with a link only. Parsed reports are cached
// in traders/scripts/ptr-cache.json, so weekly runs only fetch new filings.
// Guard: a yearly index or the legislators list that can't be fetched stops the build, and nothing is written when a
// year both builds cover loses a tenth of its trades, or half the members, or half their parties; --allow-drop writes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';

const UA = { 'User-Agent': 'JDP-I Trader Tracker (https://jdpi.pages.dev; judep92@gmail.com)' };
const CACHE = new URL('./ptr-cache.json', import.meta.url);
const OUT = new URL('../data/congress.json', import.meta.url);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const thisYear = new Date().getUTCFullYear();
const years = process.argv.slice(2).map(Number).filter(Boolean);
if (!years.length) years.push(thisYear - 1, thisYear);

// The body, or null when the file does not exist (404), or undefined when it could not be fetched (four failures):
// a missing file is an answer, a failed download is not, and is never cached as one.
async function get(url, as = 'text') {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return as === 'buffer' ? new Uint8Array(await res.arrayBuffer()) : await res.text();
      if (res.status === 404) return null;
    } catch {} // a refused connection or a body cut off mid-read: tried again like an HTTP error
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return undefined;
}

// The yearly index: a zip containing <year>FD.txt (tab-separated). Unzip with the built-in DecompressionStream.
// No index yet (404) is a year with no filings so far (early January); an index that failed, or a zip with no .txt in
// it, would otherwise empty the year.
async function indexFor(year) {
  const zip = await get(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`, 'buffer');
  if (zip === undefined) throw new Error(`House index ${year}: could not be fetched`);
  if (!zip) return [];
  const view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 30; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true), size = view.getUint32(i + 18, true), nameLen = view.getUint16(i + 26, true), extra = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(zip.slice(i + 30, i + 30 + nameLen));
    const start = i + 30 + nameLen + extra;
    if (!name.endsWith('.txt')) { i = start + size - 1; continue; }
    const data = zip.slice(start, start + size);
    const text = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data);
    const [head, ...rows] = text.replace(/\r/g, '').split('\n').filter(Boolean);
    const cols = head.split('\t');
    return rows.map(r => Object.fromEntries(r.split('\t').map((v, k) => [cols[k], v.trim()]))).filter(r => r.FilingType === 'P');
  }
  throw new Error(`House index ${year}: no .txt file in the zip`);
}

const TYPE = { P: 'buy', S: 'sell', 'S (partial)': 'partial sale', E: 'exchange' };
// PTR PDFs are a table. Each row is anchored by the transaction-type cell (P, S, S (partial), E) in its
// own column; the asset name may wrap onto following lines in the asset column, and is followed by note
// lines: "F S: New" (filing status), "S O: account" (sub-holding) and "D: description" (may wrap).
// Lines are rebuilt from each text item's x/y position.
// Strip table-header words that follow a description at a page break.
const cleanNote = s => s.replace(/\s+/g, ' ').replace(/\s*(ID Owner Asset|Transaction Type|Type Date|Notification Date|Amount Cap\.|Gains >|\$200\?).*$/, '').trim().slice(0, 240);
const ROW_CELLS = /^(P|S|S \(partial\)|E)$/;
function parseLines(lines) {
  const out = [];
  let row = null, note = null;
  for (const line of lines) {
    const text = line.map(i => i.str).join(' ').trim();
    if (/^\* For the complete list|^I V D|^I P O|^C S|^Filing ID/.test(text)) { row = null; note = null; continue; }
    const typeCell = line.find(i => i.x > 240 && i.x < 300 && ROW_CELLS.test(i.str.trim()));
    const dates = line.filter(i => /^\d\d\/\d\d\/\d{4}$/.test(i.str.trim()));
    if (typeCell && dates.length >= 2) {
      const left = line.filter(i => i.x < 240).map(i => i.str.trim());
      const owner = left[0] && /^(SP|JT|DC)$/.test(left[0]) ? left.shift() : 'self';
      const amount = line.filter(i => i.x > 420 && i.x < 520).map(i => i.str.trim()).join(' ');
      row = { owner, assetLines: [left.join(' ')], type: typeCell.str.trim(), d1: dates[0].str.trim(), amount, sub: null, note: null };
      out.push(row); note = null;
      continue;
    }
    if (!row) continue;
    // A table header repeated at the top of a new page ends the previous row's asset text.
    if (/^ID\s+Owner\s+Asset|^Type$|^Date$|^\$200\?$|^Gains >/.test(text)) { note = note || 'header'; continue; }
    if (/^F S\s*:/.test(text)) { note = 'status'; continue; }
    const so = text.match(/^S O\s*:\s*(.*)$/); if (so) { row.sub = so[1]; note = 'sub'; continue; }
    const d = text.match(/^D\s*:\s*(.*)$/); if (d) { row.note = d[1]; note = 'desc'; continue; }
    if (note === 'desc') { row.note += ' ' + text; continue; }
    // Continuation line: the asset column (x < 240) and the amount column (x 420–520) can both wrap.
    const assetPart = line.filter(i => i.x < 240).map(i => i.str.trim()).join(' ').trim();
    const amountPart = line.filter(i => i.x > 420 && i.x < 520).map(i => i.str.trim()).join(' ').trim();
    if (!note && assetPart) row.assetLines.push(assetPart);
    if (/^\$[\d,]+/.test(amountPart)) row.amount += ' ' + amountPart;
  }
  return out.map(r => {
    const full = r.assetLines.join(' ').replace(/\s+/g, ' ').trim();
    const assetType = (full.match(/\[([A-Z]{2})\]\s*$/) || [])[1] || null;
    const asset = full.replace(/\s*\[[A-Z]{2}\]\s*$/, '');
    const ticker = (asset.match(/\(([A-Z][A-Z.\-]{0,6})\)\s*$/) || [])[1] || null;
    const [mm, dd, yyyy] = r.d1.split('/');
    return { owner: r.owner, asset: asset.replace(/\s*\([A-Z.\-]{1,7}\)\s*$/, '').slice(0, 140), ticker, assetType, type: TYPE[r.type] || r.type, date: `${yyyy}-${mm}-${dd}`,
      amount: r.amount.replace(/\s*-\s*/, ' - ').replace(/\s+/g, ' ').trim(), ...(r.sub ? { account: r.sub.slice(0, 80) } : {}), ...(r.note ? { note: cleanNote(r.note) } : {}) };
  });
}

// A report's trades; null when the PDF does not exist, undefined when it could not be fetched or what came back is not
// a PDF (a challenge page, say; not cached, so the next run tries again), [] when pdf.js can't read a real PDF.
async function parsePdf(url) {
  const data = await get(url, 'buffer');
  if (!data) return data;
  if (String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') return undefined;
  try {
    const doc = await getDocument({ data, verbosity: 0 }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const items = (await (await doc.getPage(p)).getTextContent()).items
        .map(i => ({ str: i.str.replace(/\u0000/g, ''), x: i.transform[4], y: Math.round(i.transform[5]) })).filter(i => i.str.trim());
      const byY = new Map();
      for (const i of items) { const k = [...byY.keys()].find(y => Math.abs(y - i.y) <= 2) ?? i.y; (byY.get(k) || byY.set(k, []).get(k)).push(i); }
      for (const y of [...byY.keys()].sort((a, b) => b - a)) lines.push(byY.get(y).sort((a, b) => a.x - b.x));
    }
    return parseLines(lines);
  } catch { return []; }
}

// Party and chamber from the public congress-legislators dataset.
// Matched by surname and state, falling back to district (handles compound surnames); the historical list
// covers members who have left since filing.
// Without them every member would lose party and Bioguide ID (and with it the Encyclopaedia entry), so they must load.
async function legislators(list) {
  const text = await get(`https://unitedstates.github.io/congress-legislators/legislators-${list}.json`);
  if (!text) throw new Error(`congress-legislators ${list}: could not be fetched`);
  return JSON.parse(text);
}
const current = await legislators('current');
const historical = await legislators('historical');
const party = new Map(), byDistrict = new Map();
for (const l of [...historical, ...current]) {
  const t = l.terms.at(-1);
  if (t.type !== 'rep' || t.end < String(Math.min(...years) - 1)) continue;
  const info = { party: t.party, bioguide: l.id.bioguide, district: t.district };
  party.set(`${l.name.last}|${t.state}`.toLowerCase(), info);
  for (const term of l.terms) if (term.type === 'rep' && term.end >= String(Math.min(...years) - 1)) byDistrict.set(`${term.state}${String(term.district).padStart(2, '0')}`, info);
}

const filings = (await Promise.all(years.map(indexFor))).flat();
console.log(`${filings.length} periodic transaction reports in ${years.join(', ')}`);
const todo = filings.filter(f => !(f.DocID in cache));
let done = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let f; (f = todo.shift());) {
    const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.Year}/${f.DocID}.pdf`;
    // Paper filings (8-digit IDs not starting with 2) are scanned images.
    const rows = /^2\d{7}$/.test(f.DocID) ? await parsePdf(url) : null;
    if (rows !== undefined) cache[f.DocID] = rows;
    if (++done % 100 === 0) { console.log(done); writeFileSync(CACHE, JSON.stringify(cache)); }
  }
}));
writeFileSync(CACHE, JSON.stringify(cache));

const members = new Map(), trades = [];
for (const f of filings) {
  const name = [f.First, f.Last, f.Suffix].filter(Boolean).join(' ');
  const state = f.StateDst.slice(0, 2);
  const info = party.get(`${f.Last}|${state}`.toLowerCase()) || party.get(`${f.Last.split(/[\s-]/).at(-1)}|${state}`.toLowerCase()) || byDistrict.get(f.StateDst) || {};
  const key = `${f.Last}|${f.StateDst}`;
  if (!members.has(key)) members.set(key, { id: key.replace(/\W+/g, '-').toLowerCase(), name, district: f.StateDst, party: info.party || null, bioguide: info.bioguide || null, filings: 0, trades: 0, unreadable: 0 });
  const m = members.get(key);
  m.filings++;
  const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.Year}/${f.DocID}.pdf`;
  const [mm, dd, yyyy] = f.FilingDate.split('/');
  const filed = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const rows = cache[f.DocID];
  if (!rows) { m.unreadable++; continue; }
  // A transaction date after the filing date is a typo in the filing; keep it as filed but flag it.
  for (const t of rows) { trades.push({ member: m.id, filed, url, ...t, ...(t.date > filed ? { dateAsFiled: true } : {}) }); m.trades++; }
}
const sortDate = t => (t.dateAsFiled ? t.filed : t.date);
trades.sort((a, b) => sortDate(b).localeCompare(sortDate(a)) || b.filed.localeCompare(a.filed));
// The guard, against the committed file. Trades are compared per filing year, and only for the years both builds
// cover, so January's move from [last year, this year] to the next pair compares just the year they share. A year's
// trades grow as reports arrive, so a tenth fewer means a lost index or lost reports.
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { trades: [], members: [] };
const perYear = list => list.reduce((n, t) => { const y = +t.filed.slice(0, 4); if (years.includes(y)) n[`trades filed in ${y}`] = (n[`trades filed in ${y}`] || 0) + 1; return n; }, {});
const people = list => ({ members: list.length, 'members with a party': list.filter(m => m.party).length });
refuseIfLost([...lostCounts(perYear(prev.trades), perYear(trades), { keep: 0.9 }), ...lostCounts(people(prev.members), people([...members.values()]))]);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString(), years,
  source: 'Clerk of the US House of Representatives — Periodic Transaction Reports (STOCK Act)',
  members: [...members.values()].sort((a, b) => b.trades - a.trades), trades,
}));
console.log(`${trades.length} trades from ${members.size} members`);
