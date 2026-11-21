// Wikipedia's perennial sources list beside the Political Briefing's publishers (Jude, 17 and 20 November 2026: free
// data, and a free flag beside the Media Bias/Fact Check one, which stays). Writes briefing/data/rsp.json, a file of its
// own because it is CC BY-SA 4.0: each row's name and status from English Wikipedia's "Wikipedia:Reliable sources/
// Perennial sources", and the table joining each of the briefing's publishers to its row or rows. It copies none of the
// list's summaries or discussions. The flag says what it is: the standing consensus of Wikipedia's editors on using an
// outlet as a source in Wikipedia, not Vitruvian Manager's judgement, not Media Bias/Fact Check's, and not a rating of
// any single article (design/prp-rsp.js draws it).
//
// Terms, read on 21 November 2026: https://en.wikipedia.org/wiki/Wikipedia:Copyrights ("Permission is granted to copy,
// distribute and/or modify Wikipedia's text under the terms of the Creative Commons Attribution-ShareAlike 4.0
// International License"); https://creativecommons.org/licenses/by-sa/4.0/legalcode.en (Section 4 covers the sui
// generis database right). The file credits Wikipedia contributors, links the page, names every revision read and says
// what VM changed.
//
// Inputs: briefing/scripts/sources.mjs (each publisher's id, name and own site), and MediaWiki's public interface
// (https://en.wikipedia.org/w/api.php), read with a client name that names no person and four seconds between requests.
// Order of steps:
//   1. Request 1: the list's main page, its Header (which names the sub-pages that hold the table: /1 to /8 and the
//      Overflow page /X) and its Status template (the words each status code shows), with their revision ids.
//   2. From the Header, the sub-pages; from the Status template, the words (a format change stops the build).
//   3. Request 2, four seconds later: the sub-pages' wikitext and revision ids.
//   4. Every row: its page, its place, its anchor, its name (markup taken out), its status code and whether it is
//      blacklisted; its web addresses (RSPUSES) are read for the join and not kept.
//   5. Checks: every row has exactly one status and a known code; every sub-page has rows; the totals are sane.
//   6. The join, outlet by outlet (joinOutlet, below): a row is the outlet's when one of its web addresses is the
//      outlet's own site and its name agrees with the outlet's. Rows of one outlet with different statuses are a split,
//      by period when a row's name holds a year, else by subject. A name with no address, or an address under another
//      name, is an uncertain match and gives no flag. Neither is "not on Wikipedia's list".
//   7. Only then is briefing/data/rsp.json written. Nothing is written if a step fails, so the last good file stays.
//   node briefing/scripts/build-rsp.mjs                  build and write
//   node briefing/scripts/build-rsp.mjs --dry            build and print the join, write nothing
//   node briefing/scripts/build-rsp.mjs --raw <folder>   also save the two API replies with their sha256 (a folder
//                                                        outside the repository: downloads never go into it first)
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, relative, isAbsolute, join } from 'node:path';

export const LIST = 'Wikipedia:Reliable sources/Perennial sources';
export const LIST_URL = 'https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources';
export const API = 'https://en.wikipedia.org/w/api.php';
export const UA = 'VM build check (https://jdpi.pages.dev)';
export const LICENCE = 'CC BY-SA 4.0';
export const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const CREDIT = 'Wikipedia contributors';
export const CHANGES = 'Vitruvian Manager kept each row’s name, its status and its anchor only, and joined the rows to the Political Briefing’s publishers by their own web addresses and names. It copied none of the list’s summaries, discussions or uses.';
export const ABOUT = 'English Wikipedia’s list of perennial sources, as Vitruvian Manager read it: the standing consensus of Wikipedia’s editors on using each outlet as a source in Wikipedia. It is not Vitruvian Manager’s judgement, not Media Bias/Fact Check’s, and not a rating of any single article.';
const WAIT_MS = 4000;
const OUT = fileURLToPath(new URL('../data/rsp.json', import.meta.url));
const REPO = fileURLToPath(new URL('../../', import.meta.url));

/* ---------------------------------------------------------------- wikitext */
/** The text with every {{template}} taken out, nested ones included. */
export function stripTemplates(s) {
  let out = '', depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('{{', i)) { depth++; i++; continue; }
    if (depth && s.startsWith('}}', i)) { depth--; i++; continue; }
    if (!depth) out += s[i];
  }
  return out;
}
/** The top-level templates named `name` in the text, each as its list of arguments. */
export function templates(s, name) {
  const found = [], re = new RegExp(`\\{\\{\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`, 'gi');
  for (let m; (m = re.exec(s));) {
    let depth = 1, i = m.index + 2, args = [], cur = '', link = 0;
    for (; i < s.length && depth; i++) {
      if (s.startsWith('{{', i)) { depth++; cur += '{{'; i++; continue; }
      if (s.startsWith('}}', i)) { depth--; if (depth) cur += '}}'; i++; continue; }
      if (s.startsWith('[[', i)) { link++; cur += '[['; i++; continue; }
      if (s.startsWith(']]', i) && link) { link--; cur += ']]'; i++; continue; }
      if (s[i] === '|' && depth === 1 && !link) { args.push(cur); cur = ''; continue; }
      cur += s[i];
    }
    args.push(cur);
    found.push(args.slice(1).map(a => a.trim()));
  }
  return found;
}
/** Wikitext to plain text: templates, references and tags out, links to their text, no bold or italics. */
export function plainText(s) {
  return stripTemplates(String(s)
    .replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, ''))
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** The words the Status template shows for each code: { gr, m, nc, gu, d, b }. Throws when its shape has changed. */
export function statusWords(wikitext) {
  const sw = String(wikitext).match(/\{\{#switch:\{\{\{1\|\}\}\}\|([^{}]*Generally reliable[^{}]*)\}\}/);
  if (!sw) throw new Error('The Status template no longer has the switch that names "Generally reliable".');
  const words = {}, pending = [];
  let fallback = null;
  for (const part of sw[1].split('|')) {
    const eq = part.indexOf('=');
    if (eq < 0) { if (/^[a-z]{1,3}$/.test(part.trim())) pending.push(part.trim()); else fallback = part.trim(); continue; }
    const code = part.slice(0, eq).trim(), word = part.slice(eq + 1).trim();
    for (const c of [...pending, code]) words[c] = word;
    pending.length = 0;
  }
  if (!fallback) throw new Error('The Status template has no default word.');
  words.d = fallback; // the default case, which the list writes as "d"
  const bl = String(wikitext).match(/\[\[File:[^|\]]+\|20px\|([^|\]]+)\|link=[^\]]*#Blacklisted\]\]/);
  if (!bl) throw new Error('The Status template no longer names its blacklisted mark.');
  words.b = bl[1].trim();
  for (const c of ['gr', 'nc', 'gu', 'd']) if (!words[c]) throw new Error(`The Status template names no word for "${c}".`);
  return words;
}

/** The sub-pages the Header links, in its order: [{ page: '1', label: '#−A', overflow: false }, …]. */
export function subPages(header) {
  const re = /\[\[Wikipedia:Reliable sources\/Perennial sources\/([^|\]]+)\|([^\]]+)\]\]/g, out = [];
  for (let m; (m = re.exec(String(header)));) if (!out.some(p => p.page === m[1])) out.push({ page: m[1], label: m[2].trim(), overflow: /overflow/i.test(m[2]) });
  if (!out.length) throw new Error('The Header links no sub-page.');
  return out;
}

const hostOf = u => String(u).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
/**
 * The rows of one sub-page: { page, n (its place on the page), id (the anchor), name, alt (other names it gives),
 * st (status code), b (blacklisted), hosts (web addresses, for the join only), paths (whether an address names a part
 * of a site) }. Throws when a row has no status or more than one.
 */
export function parseRows(page, wikitext) {
  const rows = [];
  const chunks = String(wikitext).split(/\n(?=\|-)/);
  for (const chunk of chunks) {
    const lines = chunk.split('\n'), head = lines[0];
    if (!/^\|-/.test(head)) continue;
    const cls = head.match(/class="([^"]*)"/), id = head.match(/id="([^"]*)"/);
    if (!cls || !/\bs-[a-z]+\b/.test(cls[1])) continue;
    const status = templates(chunk, 'WP:RSPSTATUS');
    if (status.length !== 1) throw new Error(`${page}: the row "${id ? id[1] : head}" has ${status.length} status marks.`);
    const [code, ...named] = status[0];
    const st = String(code).trim().toLowerCase(), b = named.some(a => /^b\s*=\s*\S/.test(a));
    let cell = (lines[1] || '').replace(/^\|\s*/, '');
    cell = cell.replace(/^data-sort-value=("[^"]*"|\S+)\s*\|(?!\|)\s*/, '');
    const altText = [...cell.matchAll(/<small>([\s\S]*?)<\/small>/gi)].map(m => plainText(m[1])).join(', ');
    const name = plainText(cell.replace(/<small>[\s\S]*?<\/small>/gi, ''));
    const alt = altText.replace(/^\(|\)$/g, '').split(/\s*[,;]\s*/).map(s => s.replace(/^\(|\)$/g, '').trim()).filter(Boolean);
    const uses = templates(chunk, 'WP:RSPUSES').flat().filter(a => a && !a.includes('='));
    rows.push({ page, n: rows.length + 1, id: id ? id[1] : '', name, alt, st, b, hosts: uses.map(hostOf).filter(Boolean), paths: uses.map(u => /\//.test(u.replace(/^https?:\/\//, ''))) });
  }
  return rows;
}

/* ---------------------------------------------------------------- the join */
const STOP = new Set(['the', 'news', 'network', 'politics', 'online', 'media', 'website', 'magazine', 'newspaper', 'inc', 'com', 'co', 'uk', 'us', 'and']);
const tokens = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
  .split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t));
const compact = s => tokens(s).join('').replace(/^the(?=.{3})/, '');
// A row's own name without what tells its parts apart: "Fox News (politics and science)" → "Fox News",
// "The Washington Free Beacon 2019–present" → "The Washington Free Beacon".
const baseName = s => String(s).replace(/\([^)]*\)/g, ' ').replace(/\b(1[89]|20)\d\d\b\s*[-–—]?\s*(present|(1[89]|20)\d\d)?/gi, ' ').replace(/\s+/g, ' ').trim();
const namesOf = row => [baseName(row.name), ...row.alt].filter(Boolean);
/** Whether a name is the outlet's own (the same words, one held in the other, or the same letters run together). */
export function nameAgrees(outletName, rowName) {
  const a = tokens(outletName), b = tokens(rowName), ca = compact(outletName), cb = compact(rowName);
  if (!a.length || !b.length) return false;
  if (ca === cb) return true;
  if (a.every(t => b.includes(t)) || b.every(t => a.includes(t))) return true;
  return ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca));
}
const sameName = (outletName, rowName) => compact(outletName) === compact(rowName) && compact(outletName).length > 0;
const hostHits = (sites, row) => row.hosts.some(h => sites.some(s => h === s || h.endsWith('.' + s) || s.endsWith('.' + h)));
const bareHit = (sites, row) => row.hosts.some((h, k) => !row.paths[k] && sites.some(s => h === s || h.endsWith('.' + s) || s.endsWith('.' + h)));
export const rowKey = r => `${r.page}:${r.n}`;
const YEAR = /\b(1[89]|20)\d\d\b/;

/**
 * One outlet ({ id, name, site: host or [hosts] }) against the list's rows:
 *   { match: 'listed', rows: [keys] }                       its row, or rows with one status
 *   { match: 'split', by: 'subject' | 'period', rows: [keys] }  rows of the outlet with different statuses
 *   { match: 'uncertain', why }                             no flag: a name with no address, or an address under another name
 *   { match: 'none' }                                       not on Wikipedia's list
 */
export function joinOutlet(outlet, rows) {
  const sites = [].concat(outlet.site || []).map(hostOf).filter(Boolean);
  const byHost = rows.filter(r => hostHits(sites, r));
  const own = byHost.filter(r => namesOf(r).some(n => nameAgrees(outlet.name, n)));
  const other = byHost.filter(r => !own.includes(r));
  const named = rows.filter(r => namesOf(r).some(n => sameName(outlet.name, n)) && !own.includes(r));
  if (own.length) {
    // Another outlet's row on the same site as a whole (not one part of it): the site is not the outlet's alone.
    const shared = other.filter(r => bareHit(sites, r));
    if (shared.length) return { match: 'uncertain', why: 'Its web address is also under another outlet’s row.' };
    // Another row of this very name that lists other web addresses: two outlets of one name.
    const twin = named.filter(r => !byHost.includes(r) && compact(baseName(r.name)) === compact(baseName(own[0].name)));
    if (twin.length) return { match: 'uncertain', why: 'Two rows of this name, for different web addresses.' };
    const keys = own.map(rowKey);
    const statuses = new Set(own.map(r => r.st + (r.b ? '+b' : '')));
    if (statuses.size === 1) return { match: 'listed', rows: keys };
    return { match: 'split', by: own.some(r => YEAR.test(r.name)) ? 'period' : 'subject', rows: keys };
  }
  if (byHost.length) return { match: 'uncertain', why: 'Its web address is only under another outlet’s row.' };
  if (named.length) return { match: 'uncertain', why: named.some(r => !nameAgrees(outlet.name, baseName(r.name))) ? 'It is named only inside another outlet’s row.' : 'A row of this name lists other web addresses.' };
  return { match: 'none' };
}

/** The file's document: what it is, its licence and credit, the revisions read, the words, the rows and the join. */
export function buildDoc({ read, main, header, status, pages, words, rows, outlets }) {
  const all = rows.map(r => ({ k: rowKey(r), page: r.page, id: r.id, name: r.name, st: r.st, ...(r.b ? { b: true } : {}) }));
  const overflow = new Set(pages.filter(p => p.overflow).map(p => p.page));
  const live = rows.filter(r => !overflow.has(r.page));
  const count = list => ({ rows: list.length, gr: list.filter(r => r.st === 'gr').length, nc: list.filter(r => r.st === 'nc' || r.st === 'm').length,
    gu: list.filter(r => r.st === 'gu').length, d: list.filter(r => r.st === 'd').length, blacklisted: list.filter(r => r.b).length });
  const join = {};
  for (const o of outlets) join[o.id] = joinOutlet(o, rows);
  return {
    about: ABOUT, source: LIST, sourceUrl: LIST_URL, credit: CREDIT, licence: LICENCE, licenceUrl: LICENCE_URL, changes: CHANGES, read,
    revisions: [main, header, status, ...pages.map(p => p.rev)].map(r => ({ page: r.title, revid: r.revid, timestamp: r.timestamp, url: `https://en.wikipedia.org/w/index.php?oldid=${r.revid}` })),
    pages: pages.map(p => ({ page: p.page, label: p.label, overflow: p.overflow })),
    words, counts: { live: count(live), overflow: count(rows.filter(r => overflow.has(r.page))) },
    rows: all, outlets: join,
  };
}

/** The checks the build makes before it writes, and the data test makes again. Returns the problems found. */
export function problems(doc) {
  const out = [], known = new Set(['gr', 'nc', 'm', 'gu', 'd']);
  if (!Array.isArray(doc.rows) || doc.rows.length < 300) out.push(`only ${doc.rows?.length} rows`);
  for (const r of doc.rows || []) {
    if (!known.has(r.st)) out.push(`row ${r.k} has the unknown status "${r.st}"`);
    if (!r.name || r.name.length > 160) out.push(`row ${r.k} has no name or a long one`);
    const extra = Object.keys(r).filter(k => !['k', 'page', 'id', 'name', 'st', 'b'].includes(k));
    if (extra.length) out.push(`row ${r.k} keeps ${extra.join(', ')}`);
  }
  for (const p of doc.pages || []) if (!doc.rows.some(r => r.page === p.page)) out.push(`no rows on /${p.page}`);
  const keys = new Set((doc.rows || []).map(r => r.k));
  for (const [id, j] of Object.entries(doc.outlets || {})) for (const k of j.rows || []) if (!keys.has(k)) out.push(`${id} joins a row that is not there (${k})`);
  return out;
}

/** The file's text: one row a line, so a week's changes read as a short diff. */
export function serialise(doc) {
  const { rows, outlets, ...rest } = doc;
  const head = JSON.stringify(rest, null, 1).replace(/\n}$/, '');
  return `${head},\n "rows": [\n${rows.map(r => '  ' + JSON.stringify(r)).join(',\n')}\n ],\n "outlets": {\n${Object.entries(outlets).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n }\n}\n`;
}

/* ---------------------------------------------------------------- the run */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(titles) {
  const q = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', titles: titles.join('|'), format: 'json', formatversion: '2', maxlag: '5' });
  const r = await fetch(`${API}?${q}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`The API answered HTTP ${r.status}.`);
  const text = await r.text(), j = JSON.parse(text);
  if (j.error) throw new Error(`The API answered: ${j.error.code}.`);
  const pages = new Map((j.query?.pages || []).map(p => [p.title, p]));
  const out = titles.map(t => {
    const p = pages.get(t), rev = p?.revisions?.[0];
    if (!rev?.slots?.main?.content) throw new Error(`No text for "${t}".`);
    return { title: t, revid: rev.revid, timestamp: rev.timestamp, content: rev.slots.main.content };
  });
  return { out, text };
}

async function main(argv) {
  const dry = argv.includes('--dry'), rawAt = argv.indexOf('--raw'), raw = rawAt >= 0 ? resolve(argv[rawAt + 1] || '') : null;
  if (raw) { const rel = relative(REPO, raw); if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error('--raw must be a folder outside the repository.'); mkdirSync(raw, { recursive: true }); }
  const { SOURCES } = await import('./sources.mjs');
  const missing = SOURCES.filter(s => !s.site);
  if (missing.length) throw new Error(`No own site for ${missing.map(s => s.id).join(', ')} in sources.mjs.`);
  const read = new Date().toISOString();
  const saved = [];
  const r1 = await api([LIST, `${LIST}/Header`, `${LIST}/Status`]);
  saved.push(['request-1.json', r1.text]);
  const [mainRev, header, status] = r1.out;
  const pages = subPages(header.content), words = statusWords(status.content);
  await sleep(WAIT_MS);
  const r2 = await api(pages.map(p => `${LIST}/${p.page}`));
  saved.push(['request-2.json', r2.text]);
  r2.out.forEach((rev, k) => { pages[k].rev = rev; });
  const rows = pages.flatMap((p, k) => parseRows(p.page, r2.out[k].content));
  const doc = buildDoc({ read, main: mainRev, header, status, pages, words, rows, outlets: SOURCES });
  const bad = problems(doc);
  if (bad.length) throw new Error(`Not written: ${bad.slice(0, 8).join('; ')}`);
  if (raw) {
    const sums = saved.map(([name, text]) => { writeFileSync(join(raw, name), text); return `${createHash('sha256').update(text).digest('hex')}  ${name}`; });
    writeFileSync(join(raw, 'SHA256SUMS'), sums.join('\n') + `\n# read ${read} from ${API}\n`);
  }
  const c = doc.counts;
  console.log(`Read ${read}: ${c.live.rows} rows on the live table (${c.live.gr} generally reliable, ${c.live.nc} no consensus, ${c.live.gu} generally unreliable, ${c.live.d} deprecated; ${c.live.blacklisted} blacklisted) and ${c.overflow.rows} on the overflow page.`);
  const byKey = new Map(doc.rows.map(r => [r.k, r]));
  for (const s of SOURCES) {
    const j = doc.outlets[s.id];
    console.log(`${s.id.padEnd(20)} ${j.match.padEnd(9)} ${j.rows ? j.rows.map(k => `${byKey.get(k).name} [${byKey.get(k).st}${byKey.get(k).b ? '+b' : ''}]`).join(' ; ') : j.why || ''}`);
  }
  if (dry) return;
  mkdirSync(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
  writeFileSync(OUT + '.tmp', serialise(doc));
  renameSync(OUT + '.tmp', OUT);
  console.log(`Wrote ${relative(REPO, OUT)}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
