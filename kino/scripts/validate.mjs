// Kino script validator. Checks every documentary in kino/data/<category>/<id>.json against the format in
// kino/README.md, and every link into PRP against the target submodule's own data (the war and month exist in War
// Focus, the QID is in the Encyclopaedia, the year is a Kardashev step, and so on).
//   node kino/scripts/validate.mjs            all scripts; exit code 1 on any error
//   node kino/scripts/validate.mjs <file>…    just these
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_IDS, VISUAL_KINDS, SOURCE_KINDS, flatScenes } from '../lib/format.js';
import { countSentences, speechWarnings, wordCount, estimateSeconds } from '../lib/text.js';
import { TARGETS, onOwnPage, readAt } from '../lib/links.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA = join(ROOT, 'kino', 'data');
const BUILT = new Set(['index.json', 'media.json', 'iso.json', 'plan.json']);

// Political Atlas (political-atlas.pages.dev) covers these 78 countries (its data/countries/*.json, October 2026).
export const ATLAS_COUNTRIES = ['HRV', 'BIH', 'SRB', 'MNE', 'XKX', 'ALB', 'MKD', 'TUR', 'GEO', 'ARM', 'AZE', 'POL', 'CZE', 'SVK', 'HUN', 'SVN', 'ROU', 'BGR', 'MDA', 'UKR', 'BLR',
  'DNK', 'GRL', 'SWE', 'NOR', 'FIN', 'ISL', 'EST', 'LVA', 'LTU', 'GBR', 'IRL', 'FRA', 'DEU', 'NLD', 'BEL', 'LUX', 'AUT', 'CHE', 'LIE', 'MCO', 'AND', 'ITA', 'SMR', 'VAT', 'ESP',
  'PRT', 'MLT', 'GRC', 'CYP', 'RUS', 'CHN', 'JPN', 'ISR', 'SAU', 'USA', 'CAN', 'MEX', 'GTM', 'BLZ', 'HND', 'SLV', 'NIC', 'CRI', 'PAN', 'CUB', 'HTI', 'DOM', 'JAM', 'BHS', 'BRB',
  'TTO', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT'];

// Withdrawn ISO 3166-1 codes (ISO 3166-3) for states a documentary may need, drawn as their present-day successors.
export const HISTORICAL = {
  SUN: ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], // Soviet Union
  YUG: ['SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'MKD', 'XKX'], // Yugoslavia
  CSK: ['CZE', 'SVK'], // Czechoslovakia
};
// Countries world-atlas draws that the National Analysis list (World Bank) leaves out, with their ISO numeric codes.
export const EXTRA_ISO = { ESH: '732', FLK: '238', ATF: '260', TWN: '158', ATA: '010' };

const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const isDate = s => /^-?\d{1,4}(-\d{2}(-\d{2})?)?$/.test(String(s));
const lonlat = p => Array.isArray(p) && p.length >= 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const THIS_YEAR = new Date().getUTCFullYear();

/** Everything a link can be checked against, read once from the repository. */
export function loadContext() {
  const registry = read('registry.json');
  const nat = read('national/data/index.json');
  const iso = new Map(nat.countries.map(c => [c.iso3, c.num]));
  for (const [k, v] of Object.entries(EXTRA_ISO)) iso.set(k, v);
  const focus = read('battlefield/focus/data/index.json');
  const history = read('battlefield/history/data/wars.json');
  const lake = read('lake/data/index.json');
  const progress = read('science/progress/data/events.json');
  const energy = read('kardashev/data/energy.json');
  const lessons = {};
  for (const course of ['economics', 'finance', 'politics', 'osint']) {
    const p = join(ROOT, 'fe/learning', `${course}.md`);
    lessons[course] = existsSync(p) ? new Set(readFileSync(p, 'utf8').split('\n').filter(l => l.startsWith('## ')).map(l => slug(l.slice(3)))) : new Set();
  }
  const warMonths = new Map();
  return {
    registry,
    iso,
    nationalIso: new Set(nat.countries.map(c => c.iso3)),
    focusWars: new Map(focus.wars.map(w => [w.id, w])),
    warMonths: id => { if (!warMonths.has(id)) { try { warMonths.set(id, new Set(read(`battlefield/focus/data/wars/${id}.json`).months)); } catch { warMonths.set(id, new Set()); } } return warMonths.get(id); },
    historyWars: new Map(history.wars.map(w => [w.id, w])), historyYears: [history.firstYear, history.lastYear],
    lakeQids: new Set(lake.rows.map(r => r[0])), lakeLabel: new Map(lake.rows.map(r => [r[0], r[1]])),
    progressEvents: new Map(progress.events.map(e => [e.id, e])),
    kardashevYears: new Set(energy.steps.map(s => s.year)), kardashevPolities: new Set(energy.polities.map(p => p.id)),
    lessons,
    docs: new Map(), // filled by validateAll so Kino-to-Kino links can be checked
  };
}

/** Every script file: [{ category, id, path }]. */
export function scriptFiles() {
  if (!existsSync(DATA)) return [];
  const out = [];
  for (const cat of readdirSync(DATA)) {
    const dir = join(DATA, cat);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.json') && !BUILT.has(f)) out.push({ category: cat, id: basename(f, '.json'), path: join(dir, f) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A country code a scene may highlight: ISO 3166-1 alpha-3 that the map can draw, or a withdrawn code with successors. */
export const validCountry = (code, ctx) => ctx.iso.has(code) || code in HISTORICAL;

/** Problems with one link (an empty list when it resolves). */
export function checkLink(link, ctx) {
  const p = [];
  if (!link || typeof link !== 'object') return ['link must be an object'];
  for (const k of ['label', 'suite', 'module', 'at']) if (!link[k] || typeof link[k] !== 'string') p.push(`link.${k} is required`);
  if (p.length) return p;
  if (link.suite === 'kino') {
    // Kino's submodules are "kino-<category>" in registry.json; the page is kino/index.html?cat=<category>.
    const cat = link.module.replace(/^kino-/, ''), u = new URL(link.at, 'https://x/');
    if (!CATEGORY_IDS.includes(cat)) p.push(`link: no Kino category "${link.module}"`);
    if (!link.module.startsWith('kino-')) p.push(`link.module: use the registry id "kino-${cat}"`);
    const kino = ctx.registry.suites.find(s => s.id === 'kino');
    if (kino && !kino.modules.some(m => m.id === link.module)) p.push(`link: registry.json has no Kino submodule "${link.module}"`);
    if (u.pathname !== '/kino/index.html' || u.searchParams.get('cat') !== cat) p.push(`link.at for Kino must be kino/index.html?cat=${cat}#doc=<id>`);
    const doc = new URLSearchParams(u.hash.slice(1)).get('doc'), s = new URLSearchParams(u.hash.slice(1)).get('s');
    if (doc && ctx.docs.size && !ctx.docs.has(doc)) p.push(`link: no Kino documentary "${doc}"`);
    else if (doc && s && ctx.docs.has(doc) && !flatScenes(ctx.docs.get(doc)).some(x => x.id === s)) p.push(`link: "${doc}" has no scene "${s}"`);
    return p;
  }
  const suite = ctx.registry.suites.find(s => s.id === link.suite || s.aliases?.includes(link.suite));
  if (!suite) return [`link: no module "${link.suite}" in registry.json`];
  const mod = suite.modules.find(m => m.id === link.module || m.aliases?.includes(link.module));
  if (!mod) return [`link: no submodule "${link.module}" in ${suite.name}`];
  if (suite.id !== link.suite) p.push(`link.suite: use "${suite.id}", not the old id "${link.suite}"`);
  const url = mod.url || mod.pendingUrl;
  if (!url) return [`link: ${mod.name} has no address yet`];
  if (!onOwnPage(link, url)) p.push(`link.at "${link.at}" is not on ${mod.name}'s page (${url}); the shell would refuse it`);
  const t = TARGETS[mod.id];
  if (!t) return p; // a submodule Kino does not know how to address more precisely: the page itself is enough
  let at;
  try { at = readAt({ ...link, module: mod.id }); } catch { return [...p, `link.at "${link.at}" is not a URL`]; }
  const bad = msg => p.push(`link to ${mod.name}: ${msg}`);
  switch (mod.id) {
    case 'war-focus': {
      const w = ctx.focusWars.get(at.war);
      if (!w) { bad(`no war "${at.war}" (battlefield/focus/data/index.json)`); break; }
      if (at.m && !ctx.warMonths(at.war).has(at.m)) bad(`${w.name} has no month "${at.m}"`);
      break;
    }
    case 'battlefield-history': {
      const y = +at.y;
      if (!Number.isInteger(y) || y < ctx.historyYears[0] || y > ctx.historyYears[1]) bad(`year "${at.y}" is outside ${ctx.historyYears.join('–')}`);
      if (at.w) { const w = ctx.historyWars.get(at.w); if (!w) bad(`no war "${at.w}"`); else if (y && !w.years.some(([yy]) => yy === y)) bad(`${w.name} was not fought in ${y}`); }
      break;
    }
    case 'encyclopedia': if (!ctx.lakeQids.has(at.qid)) bad(`no entry ${at.qid} in lake/data/index.json`); break;
    case 'kardashev':
      if (!ctx.kardashevYears.has(+at.y)) bad(`${at.y} is not one of the tracker's steps`);
      if (at.p && !ctx.kardashevPolities.has(at.p)) bad(`no polity "${at.p}"`);
      break;
    case 'historical-calendar': {
      const m = at.month || '';
      if (!/^\d{4}-\d{2}$/.test(m) || m < '1980-01' || m > `${THIS_YEAR}-12`) bad(`month "${m}" must be YYYY-MM from 1980-01 on`);
      if (at.period !== 'history') bad('add period=history');
      break;
    }
    case 'pestle': if (!ctx.nationalIso.has(at.country)) bad(`no country "${at.country}"`); break;
    case 'atlas': if (!ATLAS_COUNTRIES.includes(at.country)) bad(`Political Atlas does not cover "${at.country}"`); break;
    case 'retrospective': { const y = +at.y; if (!Number.isInteger(y) || y < 1926 || y > THIS_YEAR) bad(`year "${at.y}" is outside 1926–${THIS_YEAR}`); break; }
    case 'learning': case 'learning-politics':
      if (!ctx.lessons[at.course]) bad(`no course "${at.course}"`);
      else if (at.lesson && !ctx.lessons[at.course].has(at.lesson)) bad(`no lesson "${at.lesson}" in ${at.course}`);
      break;
    case 'progress': {
      const e = at.e && ctx.progressEvents.get(at.e);
      if (at.e && !e) bad(`no event "${at.e}"`);
      if (e && at.y && +at.y < e.y) bad(`year ${at.y} is before ${e.t} (${e.y}), which would not be on the map yet`);
      break;
    }
  }
  return p;
}

const CASUALTY = /death|dead|killed|casualt|victim|murder|fatalit|lost/i;

/** { errors, warnings } for one script. `file` (optional) checks the id and category against its path. */
export function validateScript(doc, ctx, file) {
  const errors = [], warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`), warn = (where, msg) => warnings.push(`${where}: ${msg}`);
  if (!doc || typeof doc !== 'object') return { errors: ['not an object'], warnings };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.id || '')) err('id', 'lower-case words joined by hyphens');
  if (!CATEGORY_IDS.includes(doc.category)) err('category', `one of ${CATEGORY_IDS.join(', ')}`);
  if (file) {
    if (basename(file, '.json') !== doc.id) err('id', `"${doc.id}" must match the file name`);
    if (basename(dirname(file)) !== doc.category) err('category', `"${doc.category}" must match the folder`);
  }
  if (!doc.title?.trim()) err('title', 'required');
  if (!doc.summary?.trim()) err('summary', 'required'); else if (countSentences(doc.summary) > 3) warn('summary', 'keep it to three sentences or fewer');
  if (!Array.isArray(doc.era) || doc.era.length !== 2 || !doc.era.every(Number.isInteger) || doc.era[0] > doc.era[1]) err('era', '[from, to] as whole years, from ≤ to');
  if (!(doc.minutes > 0 && doc.minutes <= 180)) err('minutes', 'a running time in minutes');
  if (!Array.isArray(doc.subjects) || !doc.subjects.length) err('subjects', 'at least one { qid, label }');
  else doc.subjects.forEach((s, i) => { if (!/^Q\d+$/.test(s?.qid || '')) err(`subjects[${i}]`, 'qid like Q8016'); if (!s?.label) err(`subjects[${i}]`, 'label'); });

  // Sources: Wikidata plus scholarly books and articles, each complete enough to find.
  const ids = new Set();
  if (!Array.isArray(doc.sources) || !doc.sources.length) err('sources', 'required');
  else {
    doc.sources.forEach((s, i) => {
      const at = `sources[${i}]${s?.id ? ` (${s.id})` : ''}`;
      if (!SOURCE_KINDS.includes(s?.kind)) { err(at, `kind is one of ${SOURCE_KINDS.join(', ')}`); return; }
      if (s.id) { if (ids.has(s.id)) err(at, 'duplicate id'); ids.add(s.id); }
      if (!s.title) err(at, 'title');
      if (s.kind === 'book' || s.kind === 'article') {
        if (!s.author) err(at, 'author');
        if (!Number.isInteger(s.year) || s.year < 1500 || s.year > THIS_YEAR) err(at, 'year');
        if (s.kind === 'book' && !s.publisher) err(at, 'publisher');
        if (s.kind === 'article' && !s.journal) err(at, 'journal');
      }
      if (s.kind === 'web' && !s.url) err(at, 'url');
      if (s.url && !/^https:\/\//.test(s.url)) err(at, 'url must be https');
    });
    const scholarly = doc.sources.filter(s => s.kind === 'book' || s.kind === 'article').length;
    if (scholarly < 2) err('sources', 'cite at least two scholarly books or articles');
    if (!doc.sources.some(s => s.kind === 'wikidata')) warn('sources', 'add the Wikidata items the facts come from');
  }
  const cites = (where, list) => { for (const c of [].concat(list || [])) if (!ids.has(c)) err(where, `cites unknown source "${c}"`); };

  // Scenes (a course keeps them in parts).
  const course = Array.isArray(doc.parts);
  if (course) {
    if (doc.category !== 'great-thinkers') warn('parts', 'courses belong in great-thinkers');
    if (doc.scenes) err('scenes', 'a course has parts, not scenes');
    if (doc.parts.length < 2) err('parts', 'a course has at least two parts');
    doc.parts.forEach((p, i) => { if (!/^[a-z0-9-]+$/.test(p?.id || '')) err(`parts[${i}]`, 'id'); if (!p?.title) err(`parts[${i}]`, 'title'); if (!Array.isArray(p?.scenes) || p.scenes.length < 2) err(`parts[${i}]`, 'at least two scenes'); });
    if (doc.quiz !== undefined) {
      if (!Array.isArray(doc.quiz)) err('quiz', 'a list of questions');
      else doc.quiz.forEach((q, i) => {
        if (!q?.q) err(`quiz[${i}]`, 'q (the question)');
        if (!Array.isArray(q?.options) || q.options.length < 2) err(`quiz[${i}]`, 'at least two options');
        else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(`quiz[${i}]`, 'answer is the index of the right option');
      });
    }
  } else {
    if (doc.category === 'great-thinkers') warn('scenes', 'Great Thinkers holds courses: group the scenes into parts');
    if (!Array.isArray(doc.scenes) || !doc.scenes.length) err('scenes', 'required');
    if (doc.quiz) err('quiz', 'only courses (with parts) have a quiz');
  }
  const scenes = flatScenes(doc);
  if (scenes.length && (scenes.length < 6 || scenes.length > 24)) warn('scenes', `${scenes.length} scenes; a documentary usually has 10 to 14`);
  const sceneIds = new Set();
  let seconds = 0, links = 0;
  scenes.forEach((s, i) => {
    const at = `scene ${i + 1}${s?.id ? ` (${s.id})` : ''}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s?.id || '')) err(at, 'id: lower-case words joined by hyphens');
    else if (sceneIds.has(s.id)) err(at, 'duplicate id'); else sceneIds.add(s.id);
    if (!s.title?.trim()) err(at, 'title');
    const n = countSentences(s.narration || '');
    if (!s.narration?.trim()) err(at, 'narration');
    else if (n < 2 || n > 5) err(at, `narration has ${n} sentences; write 2 to 5`);
    for (const w of speechWarnings(s.narration || '')) warn(at, w);
    if (/\s{2,}/.test(s.narration || '')) warn(at, 'double space in narration');
    seconds += Math.max(estimateSeconds(s.narration || '', 0.92), s.seconds || 0) + 1.5;
    if (s.seconds !== undefined && !(s.seconds > 0 && s.seconds <= 120)) err(at, 'seconds is 1 to 120');
    cites(at, s.cites);

    const f = s.focus;
    if (f !== undefined) {
      if (typeof f !== 'object') err(at, 'focus must be an object');
      else {
        for (const c of f.countries || []) if (!validCountry(c, ctx)) err(at, `focus country "${c}" is not an ISO 3166-1 alpha-3 code the map can draw`);
        (f.points || []).forEach((p, k) => { if (!lonlat(p) || typeof p[2] !== 'string') err(at, `focus.points[${k}] is [lon, lat, "label"]`); });
        if (f.bbox !== undefined) {
          const b = f.bbox;
          if (!Array.isArray(b) || b.length !== 4 || !lonlat([b[0], b[1]]) || !lonlat([b[2], b[3]]) || b[1] >= b[3]) err(at, 'focus.bbox is [west, south, east, north] in degrees');
        }
      }
    }
    const v = s.visual;
    if (!v || !VISUAL_KINDS.includes(v.kind)) { err(at, `visual.kind is one of ${VISUAL_KINDS.join(', ')}`); return; }
    switch (v.kind) {
      case 'map': {
        if (!f || !(f.countries?.length || f.points?.length || f.bbox)) err(at, 'a map needs focus: countries, points or a bbox');
        (v.groups || []).forEach((g, k) => {
          if (!g?.label) err(at, `visual.groups[${k}].label`);
          if (![1, 2, 3].includes(g?.tone)) err(at, `visual.groups[${k}].tone is 1, 2 or 3`);
          if (!g?.countries?.length) err(at, `visual.groups[${k}].countries`);
          for (const c of g?.countries || []) if (!validCountry(c, ctx)) err(at, `visual.groups[${k}] country "${c}" is not a valid ISO3 code`);
        });
        (v.arrows || []).forEach((a, k) => { if (!lonlat(a?.from) || !lonlat(a?.to) || (a.via && !lonlat(a.via))) err(at, `visual.arrows[${k}] needs from and to as [lon, lat]`); if (a?.tone && ![1, 2, 3].includes(a.tone)) err(at, `visual.arrows[${k}].tone`); });
        (v.fronts || []).forEach((l, k) => { if (!Array.isArray(l?.line) || l.line.length < 2 || !l.line.every(lonlat)) err(at, `visual.fronts[${k}].line is at least two [lon, lat] points`); });
        break;
      }
      case 'timeline':
        if (!isDate(v.from) || !isDate(v.to) || String(v.from) > String(v.to)) err(at, 'timeline from and to are dates (YYYY, YYYY-MM or YYYY-MM-DD), from ≤ to');
        if (!Array.isArray(v.events) || v.events.length < 2) err(at, 'timeline needs at least two events');
        else v.events.forEach((e, k) => { if (!isDate(e?.at) || !e?.label) err(at, `visual.events[${k}] is { at, label }`); else if (String(e.at).slice(0, 4) < String(v.from).slice(0, 4) || String(e.at).slice(0, 4) > String(v.to).slice(0, 4)) err(at, `visual.events[${k}] is outside the timeline`); });
        break;
      case 'portrait':
        if (!/^Q\d+$/.test(v.qid || '') && !/^File:/.test(v.file || '')) err(at, 'portrait needs a qid (its Wikidata image, P18) or a Commons file ("File:…")');
        break;
      case 'quote':
        if (!v.text) err(at, 'quote text'); else if (wordCount(v.text) > 45) err(at, 'keep quotations short (45 words at most)');
        if (!v.who) err(at, 'quote: who said or wrote it');
        if (!v.when) err(at, 'quote: when');
        if (!v.cite) err(at, 'quote: cite the source it is taken from'); else cites(at, v.cite);
        break;
      case 'chart': {
        if (!['bar', 'line'].includes(v.type)) err(at, 'chart type is bar or line');
        if (!v.title) err(at, 'chart title'); if (!v.unit) err(at, 'chart unit');
        if (!Array.isArray(v.data) || v.data.length < 2) err(at, 'chart needs at least two rows');
        const deaths = CASUALTY.test([v.title, v.unit, ...(v.data || []).map(d => d.label)].join(' '));
        (v.data || []).forEach((d, k) => {
          const hasV = typeof d?.value === 'number', hasR = typeof d?.low === 'number' && typeof d?.high === 'number';
          if (!d?.label || (!hasV && !hasR)) err(at, `visual.data[${k}] is { label, value } or { label, low, high }`);
          if (hasR && d.low > d.high) err(at, `visual.data[${k}]: low > high`);
          if (deaths && !hasR) err(at, `visual.data[${k}]: give casualty figures as a range (low, high)`);
        });
        if (!v.cite) err(at, 'chart: cite its sources'); else cites(at, v.cite);
        break;
      }
      case 'module': if (!s.link) err(at, 'a module card needs a link'); break;
    }
    if (s.link) { links++; for (const m of checkLink(s.link, ctx)) err(at, m); }
  });
  if (!links) warn('scenes', 'no scene links into PRP');
  if (doc.minutes > 0 && scenes.length) {
    const est = seconds / 60;
    if (Math.abs(est - doc.minutes) > Math.max(2, est * 0.4)) warn('minutes', `${doc.minutes} given; the narration runs about ${est.toFixed(1)} minutes`);
  }
  return { errors, warnings };
}

/** Validate every script; returns [{ path, id, errors, warnings }]. */
export function validateAll(ctx = loadContext(), files = scriptFiles()) {
  const loaded = files.map(f => { try { return { ...f, doc: JSON.parse(readFileSync(f.path, 'utf8')) }; } catch (e) { return { ...f, error: e.message }; } });
  for (const f of loaded) if (f.doc?.id) ctx.docs.set(f.doc.id, f.doc);
  return loaded.map(f => (f.error ? { path: f.path, id: f.id, errors: [`not valid JSON: ${f.error}`], warnings: [] } : { path: f.path, id: f.id, ...validateScript(f.doc, ctx, f.path) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ctx = loadContext();
  const args = process.argv.slice(2);
  const files = args.length ? args.map(p => ({ path: p, id: basename(p, '.json'), category: basename(dirname(p)) })) : scriptFiles();
  if (args.length) for (const f of scriptFiles()) { try { ctx.docs.set(f.id, JSON.parse(readFileSync(f.path, 'utf8'))); } catch { /* reported when validated */ } }
  const results = validateAll(ctx, files);
  let errors = 0;
  for (const r of results) {
    const where = relative(ROOT, r.path).replace(/\\/g, '/');
    console.log(`${r.errors.length ? '✗' : '✓'} ${where}${r.warnings.length ? ` (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})` : ''}`);
    for (const e of r.errors) console.log(`    error   ${e}`);
    for (const w of r.warnings) console.log(`    warning ${w}`);
    errors += r.errors.length;
  }
  if (!results.length) console.log('No scripts in kino/data/<category>/.');
  process.exit(errors ? 1 : 0);
}
