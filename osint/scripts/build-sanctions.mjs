#!/usr/bin/env node
// OSINT Dashboard: Vitruvian Manager's own sanctions index (companies, organisations and ships only) from two official
// lists, written to osint/data/sanctions-index.json. Run: node osint/scripts/build-sanctions.mjs
//
// A PERSON IS NEVER INDEXED. Each list types its records; every record the list types as an individual (EU subject
// type "P", UK "Individual") is dropped as it is read, before any of its fields is looked at, and nothing is written
// inside the repository until every step below has worked.
//
// Inputs (no key, no sign-in; each address is a plain public link on the list's own official page, read 21 Nov 2026):
//   EU  Consolidated list of persons, groups and entities subject to EU financial sanctions, the Consolidated Financial
//       Sanctions File 1.0 (CSV), from the link printed in the official catalogue record at data.europa.eu, which labels
//       that file "Creative Commons Attribution 4.0 International". (The XML 1.1 and CSV 1.1 files carry the
//       "European Commission reuse notice", Decision 2011/833/EU, whose text could not be read on 21 Nov 2026: not used.)
//   UK  The UK Sanctions List (FCDO), XML, from https://www.gov.uk/government/publications/the-uk-sanctions-list:
//       "All content is available under the Open Government Licence v3.0, except where otherwise stated".
//   Left out, and the page says why: the US Treasury's lists (no download link could be read on 21 Nov 2026) and the
//   UN Security Council list (its terms allow only "personal, non-commercial use").
//   Options: --eu-file <path> and --uk-file <path> read a copy already downloaded (into a scratch folder, never into
//   the repository) in place of fetching; --out <path> writes elsewhere (tests); --now <ISO time> fixes the clock.
//
// Order of steps:
//   1. Read the last index (osint/data/sanctions-index.json), if there is one, for a list that fails today.
//   2. For each list: fetch the file into memory (or read the copy given), record its size, its sha256, the time read
//      and the date the list says it was generated.
//   3. Parse it, dropping every individual first, and keep from each remaining record only: the name and aliases, the
//      list's own type, the regime or programme, the date listed where the list gives one, the list's reference, the
//      country, for a ship its IMO number and flag (and for an aircraft its registration, when a list types one), and,
//      for the EU, the legal act the list cites with its address on EUR-Lex. Everything else is dropped: remarks,
//      statements of reasons, street addresses, phones, emails, websites, registration and tax numbers, parent and
//      subsidiary companies, owners and operators, citizenship, functions, titles, and any name written as a person's
//      name parts (EU: a first, middle or last name, or a gender; UK: Name1 to Name5).
//   4. Check each list: enough records (at least 500, and at least half of the last index's count), every record of a
//      kept type, no field outside the kept set. A list that fails steps 2 to 4 keeps its last records and its last
//      read date, marked "stale" with the reason; a list with no earlier copy is marked "failed" with no records.
//   5. Check the whole index again (no individual type, no field outside the kept set, under 1.5 MB gzipped), then
//      write it to a temporary file beside the target and rename it into place. If every list failed and there was no
//      earlier index, nothing is written and the script exits with an error. With --strict, a list kept from an
//      earlier read (or failed) also makes the run exit with code 2, after the index is written.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = resolve(ROOT, 'osint/data/sanctions-index.json');
const UA = 'VM build check (https://jdpi.pages.dev)';

/** The one set of fields a record may carry. Anything else is never written. */
export const KEPT = ['list', 'type', 'name', 'aliases', 'regime', 'listed', 'ref', 'country', 'imo', 'flag', 'reg', 'act', 'actDate', 'actUrl'];
/** The list's own types VM keeps. Individuals ("P", "Individual") are never among them. */
export const KEPT_TYPES = { eu: ['enterprise'], uk: ['Entity', 'Ship'] };
export const MIN_RECORDS = 500;
export const MAX_GZIP = 1.5 * 1024 * 1024;

export const SOURCES = {
  eu: {
    name: 'EU consolidated list of financial sanctions',
    publisher: 'European Commission',
    file: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList/content?token=dG9rZW4tMjAxNw',
    format: 'Consolidated Financial Sanctions File 1.0 (CSV)',
    catalogue: 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    termsQuote: 'The official catalogue record labels this file “Creative Commons Attribution 4.0 International”.',
    termsRead: '2026-11-21',
    credit: 'Contains data from the EU consolidated list of financial sanctions, © European Union, under CC BY 4.0. Vitruvian Manager kept the names, types, programmes, cited acts, references, countries and IMO numbers of the enterprises only.',
    search: 'https://www.sanctionsmap.eu/',
    listedMeaning: 'This file gives no date of listing; it names the legal act the list cites for the entry, and that act’s date of publication.',
  },
  uk: {
    name: 'UK Sanctions List',
    publisher: 'Foreign, Commonwealth & Development Office',
    file: 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',
    format: 'UK Sanctions List (XML)',
    catalogue: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
    licence: 'Open Government Licence v3.0',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    termsQuote: 'gov.uk: “All content is available under the Open Government Licence v3.0, except where otherwise stated”.',
    termsRead: '2026-11-21',
    credit: 'Contains public sector information licensed under the Open Government Licence v3.0. Vitruvian Manager kept the names, types, regimes, designation dates, references, countries, IMO numbers and flags of the entities and ships only.',
    search: 'https://search-uk-sanctions-list.service.gov.uk/',
    listedMeaning: 'The date the UK designated it, as the list gives it.',
  },
};

/** Lists not in the index, with the reason, read on the day named. The page shows these words. */
export const LEFT_OUT = {
  us: {
    name: 'US Treasury (OFAC) sanctions lists',
    why: 'Left out: on 21 November 2026 the list pages (https://sanctionslist.ofac.treas.gov/Home/SdnList) sent the browser to a server that did not answer, so no download link could be read. No reuse statement was found on OFAC’s pages either.',
    search: 'https://sanctionssearch.ofac.treas.gov/',
  },
  un: {
    name: 'UN Security Council Consolidated List',
    why: 'Left out: the UN’s terms of use (https://www.un.org/en/about-us/terms-of-use, read 21 November 2026) allow only “personal, non-commercial use”, with no right to redistribute.',
    search: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list',
  },
};

/* ------------------------------------------------------------------------------------------------ small helpers */
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const uniq = a => [...new Set(a.filter(Boolean))];
export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
/** "20/11/2026" → "2026-11-20"; anything else → ''. The day is the list's own: its precision is kept. */
export function dmyToIso(s) {
  const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(+t) && t.toISOString().slice(0, 10) === iso ? iso : '';
}
const isoDay = s => (/^\d{4}-\d{2}-\d{2}$/.test(clean(s)) ? clean(s) : '');
const decodeXml = s => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
});
/** EUR-Lex links only, over https. */
function eurLex(u) {
  try {
    const x = new URL(clean(u));
    if (!/(^|\.)eur-lex\.europa\.eu$/i.test(x.hostname)) return '';
    x.protocol = 'https:';
    return x.href;
  } catch { return ''; }
}
/** A record with only the kept fields that have a value, in the kept order. */
function shape(r) {
  const out = {};
  for (const k of KEPT) {
    const v = r[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ EU: CSV 1.0 */
/** Rows of a ';'-separated file with '"' quoting (quotes doubled inside a field; a field may hold ';' or a newline). */
export function parseSemicolonCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * The EU CSV 1.0, enterprises only. Each row joins an entry to one of its names, addresses, births, identifications or
 * citizenships; a row whose Subject_type is not "E" is skipped before any other column of it is read.
 * Returns { generated, records, dropped: { individuals, rows, otherTypes, malformed, personNames } }.
 */
export function parseEuCsv(text) {
  const rows = parseSemicolonCsv(text);
  if (!rows.length) throw new Error('EU file: empty');
  const head = rows[0].map(h => clean(h));
  const col = name => { const i = head.indexOf(name); if (i < 0) throw new Error(`EU file: no column ${name}`); return i; };
  const C = {
    date: col('Date_file'), id: 1, type: col('Subject_type'), act: col('Leba_numtitle'), actDate: col('Leba_publication_date'), actUrl: col('Leba_url'),
    programme: col('Programme'), last: col('Naal_lastname'), first: col('Naal_firstname'), middle: col('Naal_middlename'), whole: col('Naal_wholename'),
    gender: col('Naal_gender'), lang: col('Naal_language'), country: col('Addr_country'), iden: col('Iden_number'), ref: col('EU_ref_num'),
  };
  if (head[C.id] !== 'Entity_logical_id') throw new Error('EU file: the second column is not Entity_logical_id');
  const width = head.length;
  const people = new Set(), others = new Set(), by = new Map();
  let generated = '', malformed = 0, personNames = 0, skippedRows = 0;
  for (const r of rows.slice(1)) {
    const type = clean(r[C.type]);
    if (type !== 'E') { skippedRows++; if (type === 'P') people.add(r[C.id]); else others.add(r[C.id]); continue; } // individuals and anything else: gone
    if (r.length !== width) { malformed++; continue; }
    generated ||= dmyToIso(r[C.date]);
    const id = clean(r[C.id]);
    let e = by.get(id);
    if (!e) {
      e = { list: 'eu', type: 'enterprise', names: [], regime: clean(r[C.programme]), ref: clean(r[C.ref]), country: [], imo: [], act: clean(r[C.act]), actDate: isoDay(r[C.actDate]), actUrl: eurLex(r[C.actUrl]) };
      by.set(id, e);
    }
    const whole = clean(r[C.whole]);
    if (whole) {
      // A name written as a person's name parts (last, first or middle name, or a gender) is not kept, even on an
      // enterprise. (Naal_title and Naal_function hold free text on enterprises, never kept.)
      if ([C.last, C.first, C.middle, C.gender].some(i => clean(r[i]))) personNames++;
      else e.names.push({ whole, lang: clean(r[C.lang]).toUpperCase() });
    }
    const cc = clean(r[C.country]);
    if (/^[A-Z]{3}$/.test(cc)) e.country.push(cc);
    const iden = clean(r[C.iden]);
    const imo = iden.match(/^(\d{7})\s*\(imo-/i);
    if (imo) e.imo.push(imo[1]);
  }
  const records = [];
  for (const e of by.values()) {
    // The name shown first: the first one the list gives in English, else the first with no language, else the first.
    const lead = e.names.find(n => n.lang === 'EN') || e.names.find(n => !n.lang) || e.names[0];
    const names = lead ? uniq([lead.whole, ...e.names.map(n => n.whole)]) : [];
    if (!names.length) continue; // no name left that is not a person's: not kept
    records.push(shape({ ...e, name: names[0], aliases: names.slice(1), country: uniq(e.country), imo: uniq(e.imo).join(', ') }));
  }
  records.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  return { generated, records, dropped: { individuals: people.size, rows: skippedRows, otherTypes: others.size, malformed, personNames } };
}

/* ------------------------------------------------------------------------------------------------ UK: XML */
const tag = (block, name) => [...block.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map(m => clean(decodeXml(m[1])));
const first = (block, name) => tag(block, name)[0] || '';

/**
 * The UK Sanctions List XML, entities and ships only. Each <Designation> is typed by <IndividualEntityShip>; a record
 * typed anything but Entity or Ship is skipped before any other field of it is read.
 */
export function parseUkXml(text) {
  const s = String(text);
  if (!/<Designations[\s>]/.test(s)) throw new Error('UK file: no <Designations> root');
  const generated = dmyToIso(first(s.slice(0, 2000), 'DateGenerated'));
  const blocks = s.split('<Designation>').slice(1).map(b => b.slice(0, b.indexOf('</Designation>')));
  let individuals = 0, otherTypes = 0, personNames = 0;
  const records = [];
  for (const b of blocks) {
    const type = first(b, 'IndividualEntityShip');
    if (type === 'Individual') { individuals++; continue; }
    if (!KEPT_TYPES.uk.includes(type)) { otherTypes++; continue; }
    const names = [];
    for (const m of b.matchAll(/<Name>([\s\S]*?)<\/Name>/g)) {
      const nb = m[1];
      if (/<Name[1-5]>/.test(nb)) { personNames++; continue; } // name parts (forename, surname…) are a person's: dropped
      const whole = first(nb, 'Name6');
      if (!whole) continue;
      const kind = first(nb, 'NameType').toLowerCase();
      names.push({ whole, primary: kind === 'primary name' });
    }
    const nonLatin = tag(b, 'NameNonLatinScript');
    const primary = names.find(n => n.primary)?.whole || names[0]?.whole || '';
    if (!primary) continue;
    const ship = type === 'Ship' ? (b.match(/<ShipDetails>([\s\S]*?)<\/ShipDetails>/) || [])[1] || '' : '';
    records.push(shape({
      list: 'uk', type, name: primary,
      aliases: uniq([...names.map(n => n.whole), ...nonLatin]).filter(n => n !== primary),
      regime: first(b, 'RegimeName'), listed: dmyToIso(first(b, 'DateDesignated')), ref: first(b, 'UniqueID'),
      country: uniq(tag(b, 'AddressCountry')),
      imo: uniq(tag(ship, 'IMONumber').map(x => (x.match(/(\d{7})/) || [])[1])).join(', '),
      flag: uniq(tag(ship, 'CurrentBelievedFlagOfShip')).join(', '),
    }));
  }
  records.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  return { generated, records, dropped: { individuals, otherTypes, personNames } };
}

/* ------------------------------------------------------------------------------------------------ checks */
/** Throws unless every record is of a kept type for its list and carries only kept fields. */
export function checkRecords(list, records) {
  for (const r of records) {
    if (r.list !== list) throw new Error(`${list}: a record of list ${r.list}`);
    if (!KEPT_TYPES[list].includes(r.type)) throw new Error(`${list}: a record of type ${r.type}`);
    for (const k of Object.keys(r)) if (!KEPT.includes(k)) throw new Error(`${list}: field ${k} is not kept`);
    if (!r.name || !r.ref) throw new Error(`${list}: a record without a name or reference`);
  }
}

/**
 * The index from today's reads and the last index. `reads` maps a list id to { ok: true, parsed, meta } or
 * { ok: false, error, meta }. Pure: no file is read or written.
 */
export function buildIndex(reads, prev, now = new Date()) {
  const lists = {}, records = [];
  for (const id of Object.keys(SOURCES)) {
    const src = SOURCES[id], rd = reads[id] || { ok: false, error: 'not read' };
    const old = prev?.lists?.[id];
    const oldRecords = (prev?.records || []).filter(r => r.list === id);
    let err = rd.ok ? '' : rd.error || 'could not be read';
    if (rd.ok) {
      try {
        const n = rd.parsed.records.length;
        if (n < MIN_RECORDS) throw new Error(`only ${n} records`);
        if (oldRecords.length && n < oldRecords.length / 2) throw new Error(`only ${n} records, against ${oldRecords.length} in the last index`);
        checkRecords(id, rd.parsed.records);
      } catch (e) { err = e.message; }
    }
    const base = { name: src.name, publisher: src.publisher, format: src.format, file: src.file, catalogue: src.catalogue, licence: src.licence, licenceUrl: src.licenceUrl, termsQuote: src.termsQuote, termsRead: src.termsRead, credit: src.credit, search: src.search, listedMeaning: src.listedMeaning };
    if (!err) {
      lists[id] = { ...base, status: 'ok', read: rd.meta.read, generated: rd.parsed.generated, bytes: rd.meta.bytes, sha256: rd.meta.sha256, records: rd.parsed.records.length, dropped: rd.parsed.dropped };
      records.push(...rd.parsed.records);
    } else if (old && oldRecords.length && (old.status === 'ok' || old.status === 'stale')) {
      lists[id] = { ...base, status: 'stale', read: old.read, generated: old.generated, bytes: old.bytes, sha256: old.sha256, records: oldRecords.length, dropped: old.dropped, failedAt: now.toISOString(), error: clean(err).slice(0, 300) };
      records.push(...oldRecords);
    } else {
      lists[id] = { ...base, status: 'failed', records: 0, failedAt: now.toISOString(), error: clean(err).slice(0, 300) };
    }
  }
  return {
    about: 'Vitruvian Manager’s own index of the companies, organisations and ships on official sanctions lists. A person is never indexed: every record a list types as an individual is dropped before anything is written. Written by osint/scripts/build-sanctions.mjs; never edited by hand. For learning, not a compliance check: the lists change daily, and the official list decides.',
    built: now.toISOString(),
    kept: KEPT,
    lists,
    leftOut: LEFT_OUT,
    records,
  };
}

/** Throws unless the whole index keeps the rules (run again just before writing). */
export function checkIndex(index) {
  for (const id of Object.keys(SOURCES)) checkRecords(id, index.records.filter(r => r.list === id));
  if (index.records.some(r => !SOURCES[r.list])) throw new Error('a record of an unknown list');
  const gz = gzipSync(JSON.stringify(index)).length;
  if (gz > MAX_GZIP) throw new Error(`the index is ${gz} bytes gzipped, over ${MAX_GZIP}`);
  return gz;
}

/* ------------------------------------------------------------------------------------------------ main */
async function readSource(id, file) {
  const read = new Date().toISOString();
  let buf;
  if (file) buf = readFileSync(file);
  else {
    const r = await fetch(SOURCES[id].file, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get('content-type') || '';
    if (/text\/html/i.test(type)) throw new Error(`the address answered a web page (${type}), not the file: perhaps a sign-in or a check`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const meta = { read, bytes: buf.length, sha256: sha256(buf) };
  const text = buf.toString('utf8');
  const parsed = id === 'eu' ? parseEuCsv(text) : parseUkXml(text);
  return { ok: true, parsed, meta };
}

async function main(argv) {
  const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : ''; };
  const out = opt('--out') ? resolve(opt('--out')) : OUT;
  const now = opt('--now') ? new Date(opt('--now')) : new Date();
  let prev = null;
  if (existsSync(out)) { try { prev = JSON.parse(readFileSync(out, 'utf8')); } catch { prev = null; } }
  const reads = {};
  for (const id of Object.keys(SOURCES)) {
    try { reads[id] = await readSource(id, opt(`--${id}-file`)); }
    catch (e) { reads[id] = { ok: false, error: e.message }; }
    const r = reads[id];
    console.log(id, r.ok ? `read ${r.meta.bytes} bytes, sha256 ${r.meta.sha256}, generated ${r.parsed.generated}, kept ${r.parsed.records.length}, dropped ${JSON.stringify(r.parsed.dropped)}` : `FAILED: ${r.error}`);
  }
  const index = buildIndex(reads, prev, now);
  if (!index.records.length) throw new Error('no list could be read and there is no earlier index: nothing written');
  const gz = checkIndex(index);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = out + '.tmp';
  writeFileSync(tmp, JSON.stringify(index, null, 0) + '\n');
  renameSync(tmp, out);
  for (const [id, l] of Object.entries(index.lists)) console.log(`${id}: ${l.status}, ${l.records} records${l.error ? ` (${l.error})` : ''}`);
  console.log(`wrote ${out}: ${index.records.length} records, ${gz} bytes gzipped`);
  // A list kept from an earlier read is written (the page says so); --strict makes that a failed run as well.
  if (argv.includes('--strict') && Object.values(index.lists).some(l => l.status !== 'ok')) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
