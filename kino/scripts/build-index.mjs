// Kino build: validates every script, resolves subjects and portraits through Wikidata and Wikimedia Commons, and
// writes the catalogue (kino/data/index.json), the image credits (kino/data/media.json) and the country codes the
// map draws (kino/data/iso.json).
//   node kino/scripts/build-index.mjs             fetch only what the cache lacks
//   node kino/scripts/build-index.mjs --refresh   refetch cached entries older than 25 days (the monthly job)
//   node kino/scripts/build-index.mjs --offline   use the cache only; fails if something is missing
// Wikidata items are CC0; images keep their own Commons licences, which media.json records for the credit line.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, scriptFiles, validateAll, ROOT, DATA, HISTORICAL, EXTRA_ISO } from './validate.mjs';
import { CATEGORIES, flatScenes } from '../lib/format.js';

const CACHE_FILE = join(ROOT, 'kino/scripts/cache.json');
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline'), REFRESH = args.includes('--refresh');
const MAX_AGE = 25 * 86400e3, THUMB = 500;
const UA = { 'User-Agent': 'PRP-Kino/1.0 (https://jdpi.pages.dev; kino/scripts/build-index.mjs)', 'Accept': 'application/json' };
const today = new Date().toISOString();

const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
cache.entities ||= {}; cache.files ||= {};
const stale = e => !e || (REFRESH && Date.now() - Date.parse(e.at || 0) > MAX_AGE);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const strip = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
// Commons templates leave QuickStatements residue ("title QS:P1476,…", "date QS:P571,…") in the metadata.
const noQS = s => s.replace(/\s*\b(title|label|date)\s+QS:.*$/i, '').trim();

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (attempt >= 4) throw e; await sleep(1500 * attempt); }
  }
}

/** Labels and images (P18) for Wikidata items. */
async function resolveEntities(qids) {
  const want = [...new Set(qids)].filter(q => stale(cache.entities[q]));
  if (!want.length) return;
  if (OFFLINE) throw new Error(`--offline, but the cache lacks ${want.join(', ')}`);
  for (const batch of chunks(want, 50)) {
    const j = await getJson('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: batch.join('|'), props: 'labels|claims', languages: 'en', format: 'json' }));
    for (const q of batch) {
      const e = j.entities?.[q];
      if (!e || e.missing !== undefined) { console.warn(`  Wikidata has no ${q}`); continue; }
      const p18 = (e.claims?.P18 || []).filter(c => c.mainsnak?.datavalue).sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')).map(c => 'File:' + c.mainsnak.datavalue.value);
      cache.entities[q] = { label: e.labels?.en?.value || null, p18: p18.slice(0, 3), at: today };
    }
    await sleep(300);
  }
}

/** Thumbnail, size, author and licence for Commons files. */
async function resolveFiles(files) {
  const want = [...new Set(files)].filter(f => stale(cache.files[f]));
  if (!want.length) return;
  if (OFFLINE) throw new Error(`--offline, but the cache lacks ${want.join(', ')}`);
  for (const batch of chunks(want, 40)) {
    const j = await getJson('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(THUMB), format: 'json', formatversion: '2' }));
    const norm = Object.fromEntries((j.query?.normalized || []).map(n => [n.to, n.from]));
    for (const p of j.query?.pages || []) {
      const asked = norm[p.title] || p.title, ii = p.imageinfo?.[0];
      if (!ii) { console.warn(`  Commons has no ${asked}`); continue; }
      const m = ii.extmetadata || {};
      const src = String(ii.thumburl || ii.url).replace(/\?.*$/, '');
      cache.files[asked] = {
        src, width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height, page: ii.descriptionurl,
        artist: strip(m.Artist?.value) || null, credit: strip(m.Credit?.value) || null,
        licence: strip(m.LicenseShortName?.value) || null, licenceUrl: m.LicenseUrl?.value || null,
        date: noQS(strip(m.DateTimeOriginal?.value)).slice(0, 40) || null,
        title: noQS(strip(m.ObjectName?.value)).slice(0, 120) || null, at: today,
      };
    }
    await sleep(300);
  }
}

// A good credit line names the author and the licence; a bare "credit" (often just the upload source) is the fallback.
const authored = f => { const c = cache.files[f]; return !!(c && c.licence && c.artist); };
const credited = f => { const c = cache.files[f]; return !!(c && c.licence && (c.artist || c.credit)); };

(async function main() {
  const ctx = loadContext();
  const results = validateAll(ctx);
  let errors = 0;
  for (const r of results) {
    for (const e of r.errors) console.error(`✗ ${r.id}: ${e}`);
    for (const w of r.warnings) console.warn(`! ${r.id}: ${w}`);
    errors += r.errors.length;
  }
  if (errors) { console.error(`${errors} error(s); nothing written.`); process.exit(1); }
  const docs = [...ctx.docs.values()];
  const files = scriptFiles();
  const plan = existsSync(join(DATA, 'plan.json')) ? JSON.parse(readFileSync(join(DATA, 'plan.json'), 'utf8')) : {};

  // 1. Wikidata: every subject, every portrait by QID, every planned title's subject.
  const portraitQids = docs.flatMap(d => flatScenes(d).filter(s => s.visual?.kind === 'portrait' && s.visual.qid).map(s => s.visual.qid));
  const planQids = Object.values(plan).flat().map(p => p.qid).filter(Boolean);
  await resolveEntities([...docs.flatMap(d => d.subjects.map(s => s.qid)), ...portraitQids, ...planQids]);

  // 2. Commons: explicit files, and up to three P18 images for each portrait QID (the first with a full credit wins).
  const explicit = docs.flatMap(d => flatScenes(d).filter(s => s.visual?.kind === 'portrait' && s.visual.file).map(s => s.visual.file));
  await resolveFiles([...explicit, ...portraitQids.flatMap(q => cache.entities[q]?.p18 || [])]);
  const qidFile = {};
  for (const q of new Set(portraitQids)) {
    const p18 = cache.entities[q]?.p18 || [];
    qidFile[q] = p18.find(authored) || p18.find(credited) || p18.find(f => cache.files[f]) || null;
    if (!qidFile[q]) console.warn(`! no usable image for ${q}`);
  }
  for (const f of explicit) if (!cache.files[f]) { console.error(`✗ Commons has no ${f}`); errors++; }
  if (errors) process.exit(1);

  // 3. media.json: only what the scripts use.
  const used = [...new Set([...explicit, ...Object.values(qidFile).filter(Boolean)])].sort();
  const media = { generated: today.slice(0, 10), note: 'Images from Wikimedia Commons, each under its own licence; resolved by kino/scripts/build-index.mjs.', qids: qidFile, files: {} };
  for (const f of used) { const { at, ...rest } = cache.files[f]; media.files[f] = { ...rest, title: noQS(rest.title || '') || null, date: noQS(rest.date || '') || null }; }

  // 4. index.json: the catalogue.
  const labelOf = (q, fallback) => cache.entities[q]?.label || fallback;
  for (const d of docs) for (const s of d.subjects) { const l = cache.entities[s.qid]?.label; if (l && l !== s.label) console.warn(`! ${d.id}: subject ${s.qid} is "${l}" on Wikidata (script says "${s.label}")`); }
  const previewOf = d => {
    const scenes = flatScenes(d);
    const pick = (d.preview?.scene && scenes.find(s => s.id === d.preview.scene)) || scenes.find(s => s.visual?.kind === 'portrait') || scenes.find(s => s.visual?.kind === 'map' && s.focus?.countries?.length) || scenes[0];
    if (pick?.visual?.kind === 'portrait') return { kind: 'portrait', file: pick.visual.file || qidFile[pick.visual.qid] || null, position: pick.visual.position || null };
    if (pick?.visual?.kind === 'map') return { kind: 'map', countries: [...new Set([...(pick.focus.countries || []), ...(pick.visual.groups || []).flatMap(g => g.countries)])], tones: Object.fromEntries((pick.visual.groups || []).flatMap(g => g.countries.map(c => [c, g.tone]))), bbox: pick.focus.bbox || null, arrows: (pick.visual.arrows || []).slice(0, 4).map(a => ({ from: a.from, to: a.to, via: a.via, tone: a.tone })) };
    return { kind: 'title' };
  };
  const entry = d => {
    const scenes = flatScenes(d), file = files.find(f => f.id === d.id);
    return {
      id: d.id, title: d.title, category: d.category, era: d.era, minutes: d.minutes, summary: d.summary,
      subjects: d.subjects.map(s => ({ qid: s.qid, label: labelOf(s.qid, s.label) })),
      scenes: scenes.length, parts: d.parts?.length || 0, quiz: d.quiz?.length || 0,
      sources: d.sources.length, scholarly: d.sources.filter(s => s.kind === 'book' || s.kind === 'article').length,
      links: [...new Set(scenes.filter(s => s.link).map(s => `${s.link.suite}/${s.link.module}`))],
      preview: previewOf(d), path: `${file.category}/${file.id}.json`,
    };
  };
  const list = docs.map(entry).sort((a, b) => a.era[0] - b.era[0] || a.title.localeCompare(b.title));
  const index = {
    generated: today.slice(0, 10),
    categories: CATEGORIES.map(c => ({ ...c, count: list.filter(d => d.category === c.id).length })),
    docs: list,
    plan: Object.fromEntries(Object.entries(plan).filter(([k]) => !k.startsWith('_')).map(([cat, items]) => [cat, items.map(p => ({ ...p, ...(p.qid ? { label: labelOf(p.qid, p.title) } : {}) }))])),
  };

  // 5. iso.json: ISO3 → the ISO numeric id world-atlas uses, withdrawn codes → successors, and features with no id.
  const nat = JSON.parse(readFileSync(join(ROOT, 'national/data/index.json'), 'utf8'));
  const codes = Object.fromEntries([...nat.countries.filter(c => c.num).map(c => [c.iso3, String(c.num).padStart(3, '0')]), ...Object.entries(EXTRA_ISO)].sort());
  const iso = { note: 'ISO 3166-1 alpha-3 → numeric (world-atlas@2 feature ids); historical → present-day successors; byName → features world-atlas draws without an id.', codes, historical: HISTORICAL, byName: { XKX: 'Kosovo' } };

  // Keep the old "generated" date when nothing else changed, so a rebuild without changes leaves the files untouched.
  const write = (name, obj) => {
    const file = join(DATA, name), strip = o => JSON.stringify({ ...o, generated: null });
    if (existsSync(file) && 'generated' in obj) { try { const old = JSON.parse(readFileSync(file, 'utf8')); if (strip(old) === strip(obj)) obj.generated = old.generated; } catch { /* rewrite */ } }
    writeFileSync(file, JSON.stringify(obj, null, name === 'index.json' ? 1 : 0) + '\n');
  };
  write('index.json', index); write('media.json', media); write('iso.json', iso);
  writeFileSync(CACHE_FILE, JSON.stringify({ note: 'Wikidata and Commons answers for kino/scripts/build-index.mjs; safe to delete.', entities: Object.fromEntries(Object.entries(cache.entities).sort()), files: Object.fromEntries(Object.entries(cache.files).sort()) }, null, 1) + '\n');
  console.log(`✓ ${list.length} documentaries in ${index.categories.filter(c => c.count).length} categories · ${used.length} images · ${Object.keys(codes).length} country codes`);
  process.exit(0); // fetch keeps idle sockets open for a while; do not wait for them
})().catch(e => { console.error(e); process.exit(1); });
