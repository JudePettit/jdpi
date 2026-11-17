/* The saved research version (PRP-SCHOLAR-USP-DESIGN.md 5.7, 5.8, 5.9): "Save this view (bundle)", "Cite this view"
   and "Download data". Pure: the page hands in what it drew and a sha256 digest (crypto.subtle in a page, node:crypto
   in the tests); this file writes the files and a stored zip (no compression, CRC32, no library).

   The bundle, the cited object (5.7): recipe.txt, rows.csv, features.geojson, choices.json, metadata.json, README.txt,
   citation.csl.json, citation.ris, citation.bib.
     recipe.txt        the view's VR/1 recipe with its ds= pins and without pin=
     rows.csv          the rows drawn, one per feature drawn (5.8's columns, then layer and feature_id)
     features.geojson  the features drawn, canonical JSON (keys sorted, features by id)
     pin               the first 12 hex digits of the sha256 of the UTF-8 text
                         recipe.txt + "\n" + rows.csv + "\n" + features.geojson
                       so anyone can verify it from the files alone; metadata.recipe is recipe.txt + "&pin=<pin>"
                       (pin is VR/1's last key), so the pin is not part of what it hashes.
   A view (what bundleFiles and the citations read):
     { recipe, rows, features, choices, made (UTC ISO), vmCommit, deployment, code: [{ path, sha256 }],
       datasets: [{ id, version, sha256, licence, citation }], qids, from, subject, window: [from, to], liveUrl,
       providers: ['Cliopatria v0.2.1 (Bennett et al. 2025) – processed by Vitruvian Manager'], sources? } */
import { readRecipe, writeRecipe } from './vm-recipe.js';
import { formatSpan } from './vm-dates.js';

export const COLUMNS = ['Entity', 'Code', 'date', 'precision', 'value', 'low', 'high', 'measure', 'status', 'by', 'origin', 'source_id', 'source_loc', 'layer', 'feature_id'];
const utf8 = s => new TextEncoder().encode(String(s));
const EDTF_CELL = /^-?\d{4,6}(?:-\d\d){0,2}(?:\/-?\d{4,6}(?:-\d\d){0,2})?[~?%]?$/;
const NUMBER = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/* ---------- rows.csv ---------- */
/** RFC 4180 text with 5.8's columns and CRLF line ends. A cell a spreadsheet would read as a formula (= + - @, a tab or
    a carriage return at the start) gets a leading ', as Data Analytics' toCSV does; numbers and EDTF dates (a BC date
    begins with a minus sign) are written as they are. */
export function rowsCsv(rows) {
  const cell = (v, col) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number' || NUMBER.test(s) || (col === 'date' && EDTF_CELL.test(s)))) s = "'" + s;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.join(',')];
  for (const r of rows || []) lines.push(COLUMNS.map(c => cell(r?.[c], c)).join(','));
  return lines.join('\r\n') + '\r\n';
}

/* ---------- features.geojson ---------- */
const canon = v => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};
/** The features drawn as canonical GeoJSON: keys sorted, features in id order, coordinates as drawn. */
export function featuresGeojson(features) {
  const fs = [...(features || [])].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return canon({ type: 'FeatureCollection', features: fs.map(f => ({ type: 'Feature', id: f.id, properties: f.properties ?? {}, geometry: f.geometry ?? null })) });
}

/* ---------- the pin ---------- */
const hex = b => (typeof b === 'string' ? b.toLowerCase() : [...new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : b)].map(x => x.toString(16).padStart(2, '0')).join(''));
/** The pin: the first 12 hex digits of sha256(recipe.txt + "\n" + rows.csv + "\n" + features.geojson). digest(bytes)
    returns the hash as an ArrayBuffer, a byte array or hex. */
export async function pin(recipeTxt, csv, geojson, digest) {
  return hex(await digest(utf8(`${recipeTxt}\n${csv}\n${geojson}`))).slice(0, 12);
}

/* ---------- metadata, README, citations ---------- */
/** 5.7's metadata: { pin, made, vmCommit, deployment, recipe, datasets, qids, from, code }. vmCommit is null on a static
    site with no build step; `code` lists the sha256 of every VM script the page ran instead. A dataset keeps, beside 5.7's
    { id, version, sha256, licence, citation }, what its licence asks to travel with it (licenceUrl, credit, changes) and
    where its bytes come from (file, source, sourceSha256), when the page gives them. */
const DATASET_EXTRA = ['licenceUrl', 'credit', 'changes', 'file', 'source', 'sourceSha256'];
export function metadata({ pin: p, made, vmCommit = null, deployment, recipe, datasets = [], qids = [], from = null, code = [] }) {
  return { pin: p, made, vmCommit: vmCommit ?? null, deployment: deployment ?? null, recipe,
    datasets: datasets.map(d => ({ id: d.id, version: d.version, sha256: d.sha256 ?? null, licence: d.licence ?? null, citation: d.citation ?? null,
      ...Object.fromEntries(DATASET_EXTRA.filter(k => d[k] != null).map(k => [k, d[k]])) })),
    qids: [...qids], from: from ?? null, code: code.map(c => ({ path: c.path, sha256: c.sha256 })) };
}
const titleOf = v => `${v.subject || 'Omni-Map view'}${Array.isArray(v.window) ? `, ${formatSpan(v.window[0], v.window[1])}` : ''}`;
const yearMade = v => String(v.made || '').slice(0, 4);
const ymd = v => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(v.made || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
const providers = v => (v.providers || []).join('; ');
/** The address a citation names: the view's recipe with its ds= pins and its pin= (so a reader who follows it after the
    data has changed is told so, 5.7), on the live view's page; the live view's own address when there is no pin. */
export function citeUrl(v) {
  if (v.citeUrl) return v.citeUrl;
  if (!v.pin || !v.recipe || !v.liveUrl) return v.liveUrl;
  const r = readRecipe(v.recipe);
  if (!r) return v.liveUrl;
  delete r.pin;
  return `${String(v.liveUrl).split('#')[0]}#${writeRecipe(r)}&pin=${v.pin}`;
}
/** The APA 7 line of 5.9 (the pinned address until the researcher deposits the bundle for a DOI). */
export const apa = v => `JDP-Iq. (${yearMade(v)}). ${titleOf(v)} [Data set, version ${v.pin}]. Vitruvian Manager. ${citeUrl(v)}`;
/** CSL-JSON (Zotero and others): one dataset item. */
export function cslJson(v) {
  const d = ymd(v);
  return [{ id: `vm-view-${v.pin}`, type: 'dataset', title: titleOf(v), author: [{ literal: 'JDP-Iq' }], publisher: 'Vitruvian Manager',
    version: v.pin, ...(d ? { issued: { 'date-parts': [d] } } : {}), URL: citeUrl(v), genre: 'Data set',
    note: `Providers: ${providers(v)}. A saved Omni-Map view; the bundle holds its recipe, rows and features, and its pin verifies them. VM is not a primary source.` }];
}
/** RIS (TY  - DATA). */
export function ris(v) {
  const d = ymd(v);
  return [['TY', 'DATA'], ['AU', 'JDP-Iq'], ['TI', titleOf(v)], ['PY', yearMade(v)], ...(d ? [['DA', d.map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('/')]] : []),
    ['PB', 'Vitruvian Manager'], ['ET', v.pin], ['UR', citeUrl(v)], ['N1', `Providers: ${providers(v)}`], ['ER', '']]
    .map(([k, x]) => `${k}  - ${x}`).join('\r\n') + '\r\n';
}
const bib = s => String(s ?? '').replace(/[\\{}]/g, c => `\\${c}`).replace(/[&%$#_]/g, c => `\\${c}`).replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
/** BibTeX (@misc). */
export function bibtex(v) {
  return `@misc{vm-view-${v.pin},\n  author = {{JDP-Iq}},\n  title = {${bib(titleOf(v))}},\n  year = {${yearMade(v)}},\n  publisher = {Vitruvian Manager},\n`
    + `  version = {${v.pin}},\n  howpublished = {Data set},\n  url = {${citeUrl(v)}},\n  note = {${bib(`Providers: ${providers(v)}`)}}\n}\n`;
}
/** The licence lines a file set carries for each dataset or source whose licence asks for them (CC BY: the credit, a
    link to the licence, and the changes made). */
const licenceLines = items => items.filter(d => d && (d.licence || d.licenceUrl)).map(d => {
  const who = String(d.credit || d.citation || d.short || d.id);
  const lic = [d.licence && !who.includes(d.licence) ? d.licence : '', d.licenceUrl || ''].filter(Boolean).join(' ');
  return `  ${d.id || d.source}: ${who}.${lic ? ` Licence: ${lic}.` : ''}${d.changes ? ` Changes by Vitruvian Manager: ${d.changes}` : ''}`;
});
/** README.txt: what the bundle is, how to verify its pin, how to cite and keep it. */
export function readme(v) {
  const lic = licenceLines(v.datasets || []);
  return [
    `${titleOf(v)}: a saved Omni-Map view from Vitruvian Manager (VM)`,
    '',
    `Pin ${v.pin}, made ${v.made} (UTC), at ${v.deployment || 'the site that drew it'} (the site's address, not a per-deployment address:`,
    'VM does not yet keep each day\'s page, so this bundle is the record of what was drawn).',
    '',
    'What is here',
    '  recipe.txt         the view\'s recipe (VR/1), with the versions of the data it drew (ds=)',
    '  rows.csv           the rows drawn, one per feature, with each row\'s source (source_id, source_loc)',
    '  features.geojson   the features drawn, whole (not cut at the edge of the view), keys sorted, in id order',
    '  choices.json       what VM chose for the view (events and clutter)',
    '  metadata.json      the pin, the time, the deployment, the datasets with versions, licences and citations, the',
    '                     Wikidata items and the sha256 of each VM script the page ran (vmCommit is null: VM is a static',
    '                     site with no build step, so a page cannot know its own commit)',
    '  citation.csl.json, citation.ris, citation.bib   the citation in three formats (Zotero reads all three)',
    '',
    'To verify the pin: join the three files recipe.txt, rows.csv and features.geojson, exactly as they are, with one',
    'newline (\\n) between each, and take the sha256 of the UTF-8 text. Its first 12 hex digits are the pin.',
    'The pin covers those three files only. choices.json, metadata.json (the time, the deployment, the licences), this',
    'README and the citation files are not covered by it: a change to them leaves the pin as it is.',
    '',
    'A live address draws today\'s data; only this bundle is exact. For a DOI, deposit this zip in Zenodo or OSF under',
    'your own account and cite that deposit. "Open a saved view" on the Omni-Map reads it from your computer (nothing',
    'is uploaded) and draws its frozen features again.',
    '',
    `Cite as: ${apa(v)}`,
    `Live view (today's data, not this bundle): ${v.liveUrl}`,
    `Providers: ${providers(v)}`,
    ...(lic.length ? ['', 'Licences and credits of the data passed on here:', ...lic, ''] : []),
    'A date before AD 1 is written in EDTF and begins with a minus sign (-0425 is 426 BC); open rows.csv as text if a',
    'spreadsheet reads it as a number.',
    'VM is not a primary source.',
    '',
  ].join('\r\n');
}

/* ---------- the stored zip ---------- */
let TABLE = null;
/** CRC32 (IEEE 802.3), as zip and zlib compute it. */
export function crc32(bytes) {
  if (!TABLE) { TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1 January 1980, 00:00: fixed, so the same files give the same zip
/** A zip of the files ({ name, text } or { name, bytes }), stored with no compression, names in UTF-8. */
export function zipStored(files) {
  const items = files.map(f => ({ name: utf8(f.name), data: f.bytes instanceof Uint8Array ? f.bytes : utf8(f.text ?? '') }));
  for (const it of items) it.crc = crc32(it.data);
  const size = items.reduce((n, it) => n + 30 + it.name.length + it.data.length + 46 + it.name.length, 22);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  let o = 0;
  const local = [];
  for (const it of items) {
    local.push(o);
    dv.setUint32(o, 0x04034b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 0x0800, true); dv.setUint16(o + 8, 0, true);
    dv.setUint16(o + 10, DOS_TIME, true); dv.setUint16(o + 12, DOS_DATE, true); dv.setUint32(o + 14, it.crc, true);
    dv.setUint32(o + 18, it.data.length, true); dv.setUint32(o + 22, it.data.length, true); dv.setUint16(o + 26, it.name.length, true); dv.setUint16(o + 28, 0, true);
    out.set(it.name, o + 30); out.set(it.data, o + 30 + it.name.length);
    o += 30 + it.name.length + it.data.length;
  }
  const cd = o;
  items.forEach((it, i) => {
    dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true); dv.setUint16(o + 8, 0x0800, true); dv.setUint16(o + 10, 0, true);
    dv.setUint16(o + 12, DOS_TIME, true); dv.setUint16(o + 14, DOS_DATE, true); dv.setUint32(o + 16, it.crc, true);
    dv.setUint32(o + 20, it.data.length, true); dv.setUint32(o + 24, it.data.length, true); dv.setUint16(o + 28, it.name.length, true);
    dv.setUint16(o + 30, 0, true); dv.setUint16(o + 32, 0, true); dv.setUint16(o + 34, 0, true); dv.setUint16(o + 36, 0, true);
    dv.setUint32(o + 38, 0, true); dv.setUint32(o + 42, local[i], true); out.set(it.name, o + 46);
    o += 46 + it.name.length;
  });
  dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 4, 0, true); dv.setUint16(o + 6, 0, true);
  dv.setUint16(o + 8, items.length, true); dv.setUint16(o + 10, items.length, true);
  dv.setUint32(o + 12, o - cd, true); dv.setUint32(o + 16, cd, true); dv.setUint16(o + 20, 0, true);
  return out;
}
/** The files of a stored zip: [{ name, bytes }]. Throws on anything that is not a stored zip, or a CRC that fails. */
export function readZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not a zip file');
  const n = dv.getUint16(e + 10, true), dec = new TextDecoder('utf-8', { fatal: true });
  let o = dv.getUint32(e + 16, true);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (o + 46 > b.length || dv.getUint32(o, true) !== 0x02014b50) throw new Error('This is not a zip file: its directory is broken');
    const method = dv.getUint16(o + 10, true), crc = dv.getUint32(o + 16, true), csize = dv.getUint32(o + 20, true);
    const nlen = dv.getUint16(o + 28, true), xlen = dv.getUint16(o + 30, true), clen = dv.getUint16(o + 32, true), at = dv.getUint32(o + 42, true);
    const name = dec.decode(b.subarray(o + 46, o + 46 + nlen));
    if (method !== 0) throw new Error(`${name} is compressed; a saved view is a stored zip`);
    if (dv.getUint32(at, true) !== 0x04034b50) throw new Error('This is not a zip file: a file header is broken');
    const start = at + 30 + dv.getUint16(at + 26, true) + dv.getUint16(at + 28, true);
    const data = b.slice(start, start + csize);
    if (data.length !== csize || crc32(data) !== crc) throw new Error(`${name} fails its CRC check: the file has been changed or damaged`);
    out.push({ name, bytes: data });
    o += 46 + nlen + xlen + clen;
  }
  return out;
}

/* ---------- the bundle and the download ---------- */
const sortRows = rows => [...(rows || [])].sort((a, b) => `${a.layer}\u0000${a.feature_id}`.localeCompare(`${b.layer}\u0000${b.feature_id}`));
const pinned = recipe => { const r = readRecipe(recipe); if (!r) throw new Error('The view\'s recipe is not VR/1'); delete r.pin; return writeRecipe(r); };
/** The nine files of "Save this view (bundle)" and its pin: { pin, files: [{ name, text }] }. */
export async function bundleFiles(view, digest) {
  const recipeTxt = pinned(view.recipe), csv = rowsCsv(sortRows(view.rows)), geo = featuresGeojson(view.features);
  const p = await pin(recipeTxt, csv, geo, digest);
  const v = { ...view, pin: p };
  const meta = metadata({ ...v, recipe: `${recipeTxt}&pin=${p}` });
  return { pin: p, citeUrl: citeUrl(v), files: [
    { name: 'recipe.txt', text: recipeTxt }, { name: 'rows.csv', text: csv }, { name: 'features.geojson', text: geo },
    { name: 'choices.json', text: JSON.stringify(view.choices ?? {}, null, 2) + '\n' }, { name: 'metadata.json', text: JSON.stringify(meta, null, 2) + '\n' },
    { name: 'README.txt', text: readme(v) }, { name: 'citation.csl.json', text: JSON.stringify(cslJson(v), null, 2) + '\n' },
    { name: 'citation.ris', text: ris(v) }, { name: 'citation.bib', text: bibtex(v) },
  ] };
}
const slugOf = v => `${v.subject || 'omni-map-view'}${Array.isArray(v.window) ? ` ${v.window[0]} ${v.window[1]}` : ''}`.normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'omni-map-view';
/** "Download data" (5.8): <slug>.csv, <slug>.metadata.json, README.txt. A cite-only source (sources[id].terms) gives no
    rows, only where to get them. */
export function dataFiles(view) {
  const src = id => (Array.isArray(view.sources) ? view.sources.find(s => s.id === id) : view.sources?.[id]) || null;
  const citeOnly = new Set((view.rows || []).map(r => r.source_id).filter(id => src(id)?.terms === 'cite-only'));
  const rows = sortRows((view.rows || []).filter(r => !citeOnly.has(r.source_id)));
  const slug = slugOf(view), used = [...new Set(rows.map(r => r.source_id))].map(src).filter(Boolean);
  const meta = {
    title: titleOf(view), recipe: view.recipe, versions: (view.datasets || []).map(d => ({ id: d.id, version: d.version })),
    columns: { value: { citationShort: used.map(s => s.short || s.id).join('; '), citationLong: used.map(s => s.citation || s.id).join('; '),
      descriptionProcessing: 'The rows VM drew for this view, as each source records them; VM spreads, interpolates and models nothing here (origin: source).',
      unit: [...new Set(rows.map(r => r.measure).filter(Boolean))].join('; ') || null } },
    dateDownloaded: String(view.made || '').slice(0, 10),
    licences: used.map(s => ({ source: s.id, licence: s.licence ?? null, ...Object.fromEntries(['licenceUrl', 'credit', 'changes'].filter(k => s[k] != null).map(k => [k, s[k]])) })),
    citeOnly: [...citeOnly].map(id => ({ source: id, citation: src(id).citation, url: src(id).url })),
  };
  const notes = [...citeOnly].map(id => `  ${src(id).citation}: ${src(id).url} (its terms bar passing its data on, so VM lists it here and gives no rows)`);
  const text = [`${titleOf(view)}: the data drawn, from Vitruvian Manager`, '', `${slug}.csv            the rows, with each row's source (source_id, source_loc)`,
    `${slug}.metadata.json  the recipe, the data versions, citations, units and licences`, '',
    ...(notes.length ? ['Rows from these sources are not included; get them from the source itself:', ...notes, ''] : []),
    ...(used.length ? ['Licences and credits of the data passed on here:', ...licenceLines(used), ''] : []),
    'Dates are EDTF: a date before AD 1 begins with a minus sign (-0425 is 426 BC).', `Recipe: ${view.recipe}`, ''].join('\r\n');
  return [{ name: `${slug}.csv`, text: rowsCsv(rows) }, { name: `${slug}.metadata.json`, text: JSON.stringify(meta, null, 2) + '\n' }, { name: 'README.txt', text }];
}
