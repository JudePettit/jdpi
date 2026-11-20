// Shared steps of the Omni-Map's history layers (stage S5b of PRP-SCHOLAR-USP-DESIGN.md): reading a CSV, asking
// Wikidata politely (wbgetentities and the query service, one request at a time and at most one every four seconds, with VM's client name and no personal
// detail, each answer kept in a cache folder of the caller's own, never the repository), and the file stamp rule.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { UA } from './layer-catalogue.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A CSV text as rows of { header: value } (quoted fields, doubled quotes and line breaks inside quotes kept). */
export function csv(text) {
  const rows = []; let row = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(c); rows.push(row); row = []; c = ''; }
    else c += ch;
  }
  if (c || row.length) { row.push(c); rows.push(row); }
  const h = rows[0].map(x => x.replace(/^﻿/, ''));
  return rows.slice(1).filter(r => r.length > 1).map(v => Object.fromEntries(h.map((k, i) => [k, v[i] ?? ''])));
}

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');

async function polite(url, { cache, key, accept = 'application/json' } = {}) {
  if (cache && key && existsSync(join(cache, key))) return JSON.parse(readFileSync(join(cache, key), 'utf8'));
  for (let tries = 0; tries < 5; tries++) {
    const res = await fetch(url, { headers: { ...UA, Accept: accept } });
    if (res.status === 429 || res.status >= 500) { const wait = (+res.headers.get('retry-after') || 30) * 1000; console.log(`Wikidata answered ${res.status}: waiting ${wait / 1000} s`); await sleep(wait); continue; }
    if (!res.ok) throw new Error(`Wikidata answered ${res.status} for ${url.slice(0, 120)}`);
    const j = await res.json();
    if (j.error) throw new Error(`Wikidata: ${j.error.info}`);
    if (cache && key) { mkdirSync(cache, { recursive: true }); writeFileSync(join(cache, key), JSON.stringify(j)); }
    await sleep(4000); // at most one request to Wikimedia every four seconds
    return j;
  }
  throw new Error('Wikidata kept refusing: try later');
}

/** Wikidata items by id, 50 a request (wbgetentities): { Q: entity }. */
export async function entities(ids, { props = 'claims|labels', cache = null, tag = 'e', size = 50 } = {}) {
  const out = {}, list = [...new Set(ids)].filter(q => /^Q\d+$/.test(q)).sort((a, b) => +a.slice(1) - +b.slice(1));
  // Wikidata cuts an answer over about 12 MB (a batch of countries' items): such a batch is asked for again in halves.
  const ask = async part => {
    const key = `${tag}-${props.replace(/\|/g, '_')}-${sha256(part.join('|')).slice(0, 16)}.json`;
    const j = await polite(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en&${new URLSearchParams({ ids: part.join('|'), props })}`, { cache, key });
    if (/truncated/.test(JSON.stringify(j.warnings || ''))) {
      if (part.length === 1) throw new Error(`Wikidata cut its answer for ${part[0]}`);
      const h = Math.ceil(part.length / 2);
      await ask(part.slice(0, h)); await ask(part.slice(h));
      return;
    }
    Object.assign(out, j.entities || {});
  };
  for (let i = 0; i < list.length; i += size) await ask(list.slice(i, i + size));
  for (const q of Object.keys(out)) if ('missing' in out[q]) delete out[q];
  return out;
}

/** Wikidata items by English Wikipedia title, 50 a request: { title: Q }. */
export async function byTitles(titles, { cache = null } = {}) {
  const out = {}, list = [...new Set(titles.filter(Boolean))].sort();
  for (let i = 0; i < list.length; i += 50) {
    const part = list.slice(i, i + 50);
    const key = `titles-${sha256(part.join('|')).slice(0, 16)}.json`;
    const j = await polite(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=enwiki&props=sitelinks&sitefilter=enwiki&redirects=yes&${new URLSearchParams({ titles: part.join('|') })}`, { cache, key });
    for (const [q, e] of Object.entries(j.entities || {})) if (/^Q\d+$/.test(q) && e.sitelinks?.enwiki?.title) out[e.sitelinks.enwiki.title] = q;
    // A title Wikipedia redirects is answered under its target's title: the caller keeps both.
    for (const n of j.normalized || []) if (out[n.to]) out[n.from] = out[n.to];
  }
  return out;
}

/** One query to Wikidata's query service (SPARQL), its bindings as plain { var: value }. */
export async function sparql(query, { cache = null, key = null } = {}) {
  const j = await polite(`https://query.wikidata.org/sparql?format=json&${new URLSearchParams({ query })}`, { cache, key, accept: 'application/sparql-results+json' });
  return j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

/** The ids of a claim list's items (deprecated ranks left out). */
export const claimIds = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** A layer file's `built`: the one it has when nothing else in it changed, else now (a rerun writes the same bytes). */
export function keepStamp(prev, next, now) {
  if (!prev || typeof prev.built !== 'string') return now;
  const rest = o => JSON.stringify({ ...o, built: null });
  return rest(prev) === rest({ ...next, built: null }) ? prev.built : now;
}
