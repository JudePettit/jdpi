// Data Analytics (Digital Science): a workbench for PRP's own data. Datasets come from the Integration Hub's catalogue
// (integration/catalog.json); files load into the browser, steps run in lib/engine.js, charts are drawn with Observable
// Plot (lib/render.js), and the whole analysis lives in the URL hash (lib/spec.js) so a link shares it. "Copy for AI"
// builds a prompt (lib/ai.js); nothing is sent to any AI service and no keys are stored.
import { toTable, runPipeline, columnsOf, STEP_TYPES, CMPS, AGGS, profile, toCSV, formatValue, aggName } from './lib/engine.js';
import { FUNCTIONS } from './lib/expr.js';
import { parseHash, toHash, emptySpec, emptyChart, describeStep, describeChart, CHART_TYPES, CHART_FNS } from './lib/spec.js';
import { prepareChart, suggestChart, chartProblem, countryMatcher, countryShare } from './lib/chartdata.js';
import { loadDataset, datasetUrls, declaredBytes, mb } from './lib/load.js';
import { buildPrompt, analysisLink } from './lib/ai.js';
import { availableExamples } from './lib/examples.js';
// The chart renderer and the exporter load when first needed, so a first visit carries only the workbench.
let renderMod = null, exportMod = null;
const R = () => (renderMod ||= import('./lib/render.js').catch(e => { renderMod = null; throw e; }));
const X = () => (exportMod ||= import('./lib/export.js').catch(e => { exportMod = null; throw e; }));

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n ?? 0).toLocaleString('en-GB');
const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const day = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T00:00:00Z' : s); return Number.isNaN(+d) ? String(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const SITE = new URL('../', import.meta.url);
const dict = o => Object.assign(Object.create(null), o); // lookups by ids from data, without a prototype
const MODULES = dict({ rt: ['RT', 'Realtime Intelligence'], rs: ['RS', 'Retrospective Intelligence'], oi: ['OI', 'i-Spy'], mm: ['MM', 'Money Management'], ns: ['NS', 'Natural Science'], ds: ['DS', 'Digital Science'], kino: ['KN', 'Kino'] });
const ORDER = ['rt', 'rs', 'oi', 'mm', 'ns', 'ds', 'kino'];
let embedded = false;
try { embedded = window.self !== window.top; } catch { embedded = true; }

const S = {
  cat: null, catUrl: null, sub: dict({}), subUrl: dict({}),
  spec: emptySpec(), chartAuto: true, savedSteps: null,
  data: null, loadingId: null, abort: null, loadState: null,
  run: null, result: null, sql: null,
  page: 0, pageSize: 50,
  chart: null, drawSeq: 0, geo: null, match: null,
};
const moduleInfo = id => MODULES[id] || [String(id || '').toUpperCase().slice(0, 3), id || 'PRP'];
const subName = id => S.sub[id] || '';
const currentDs = () => S.cat?.datasets.find(d => d.id === S.spec.d) || null;
// A link to another PRP page: through the shell when this page is inside it, so the shell's frame for that page moves.
function prpLink(path, submodule, moduleId) {
  let url;
  try { url = new URL(path, SITE); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null; // only web addresses become links
  if (embedded && submodule && moduleId) return { href: new URL(`#/${moduleId}/${submodule}?at=${encodeURIComponent(url.href)}`, SITE).href, target: '_top' };
  return { href: url.href, target: '' };
}

/* =============================== catalogue and datasets =============================== */
async function loadCatalogue() {
  let url = new URL('integration/catalog.json', SITE);
  const override = new URLSearchParams(location.search).get('catalog');
  if (override) { try { const u = new URL(override, SITE); if (u.origin === location.origin && /\.json$/i.test(u.pathname)) url = u; } catch { /* ignore */ } }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`The catalogue did not load (HTTP ${res.status}).`);
  const cat = await res.json();
  if (!Array.isArray(cat?.datasets)) throw new Error('The catalogue lists no datasets.');
  cat.datasets = cat.datasets.filter(d => d && typeof d.id === 'string' && d.id && (d.url || d.urls?.length));
  S.cat = cat; S.catUrl = url;
}
async function loadRegistry() {
  try {
    const reg = await fetch(new URL('registry.json', SITE)).then(r => (r.ok ? r.json() : null));
    for (const s of reg?.suites || []) { MODULES[s.id] = [s.code || MODULES[s.id]?.[0] || s.id.toUpperCase(), s.name || s.title]; for (const m of s.modules || []) { S.sub[m.id] = m.name; S.subUrl[m.id] = m.url || m.pendingUrl || null; } }
  } catch { /* names fall back to ids */ }
}
const hay = d => (d._hay ||= [d.id, d.title, d.description, moduleInfo(d.module)[1], subName(d.submodule), ...(d.fields || []).map(f => `${f.name} ${f.description || ''}`)].join(' ').toLowerCase());
function shownDatasets() {
  const words = $('#ds-q').value.trim().toLowerCase().split(/\s+/).filter(Boolean), mod = $('#ds-module').value;
  return S.cat.datasets.filter(d => (!mod || d.module === mod) && words.every(w => hay(d).includes(w)));
}
function renderPicker() {
  if (!S.cat) return;
  const list = shownDatasets(), all = S.cat.datasets.length;
  $('#picker-count').textContent = list.length === all ? `${num(all)}` : `${num(list.length)} of ${num(all)}`;
  const groups = [...new Set([...ORDER, ...list.map(d => d.module)])].map(m => [m, list.filter(d => d.module === m)]).filter(g => g[1].length);
  $('#ds-list').innerHTML = groups.length ? groups.map(([m, ds]) => {
    const [code, name] = moduleInfo(m);
    return `<li class="ds-group" role="presentation"><span class="prp-code" data-suite="${esc(m)}">${esc(code)}</span>${esc(name)}</li>` + ds.map(d => {
      const bytes = declaredBytes(d);
      return `<li><button type="button" class="ds-item" data-id="${esc(d.id)}" aria-current="${d.id === S.spec.d}"><span class="t">${esc(d.title || d.id)}</span>` +
        `<span class="m">${num(d.rows)} rows${bytes ? ' · ' + mb(bytes) : ''}${d.refresh ? ' · ' + esc(d.refresh) : ''}</span></button></li>`;
    }).join('');
  }).join('') : '<li class="ds-empty">No dataset matches. Try another word or all modules.</li>';
}
function renderModuleFilter() {
  const present = [...new Set(S.cat.datasets.map(d => d.module))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  $('#ds-module').innerHTML = '<option value="">All modules</option>' + present.map(m => `<option value="${esc(m)}">${esc(moduleInfo(m)[1])} (${S.cat.datasets.filter(d => d.module === m).length})</option>`).join('');
}
function renderMeta() {
  const c = S.cat, mods = new Set(c.datasets.map(d => d.module)).size, rows = c.datasets.reduce((a, d) => a + (+d.rows || 0), 0);
  $('#meta').innerHTML = `<span><b>${num(c.datasets.length)}</b> datasets from <b>${num(mods)}</b> modules · <b>${num(rows)}</b> rows in all</span>` +
    `<span>Catalogue of ${esc(day(c.generated))}</span><span>Source: the Integration Hub</span>`;
  $('#cat-generated').textContent = c.generated ? `updated ${day(c.generated)}` : '';
}
function renderCatalogue() {
  if (!S.cat) return;
  $('#cat-count').textContent = plural(S.cat.datasets.length, 'dataset');
  const sorted = [...S.cat.datasets].sort((a, b) => (ORDER.indexOf(a.module) + 1 || 99) - (ORDER.indexOf(b.module) + 1 || 99));
  $('#cat-rows').innerHTML = sorted.map(d => {
    const [code, name] = moduleInfo(d.module), bytes = declaredBytes(d), files = datasetUrls(d).length;
    return `<tr><td><button type="button" class="linkish" data-open="${esc(d.id)}">${esc(d.title || d.id)}</button><small>${esc(d.description || '')}</small></td>` +
      `<td class="nowrap"><span class="prp-code" data-suite="${esc(d.module)}" title="${esc(name)}">${esc(code)}</span> ${esc(subName(d.submodule) || d.submodule || '')}</td>` +
      `<td class="num">${num(d.rows)}</td><td class="num nowrap">${bytes ? mb(bytes) : '–'}${files > 1 ? `<small>${files} files</small>` : ''}</td><td class="num">${num(d.fields?.length || 0)}</td>` +
      `<td>${esc(d.refresh || '')}</td><td class="nowrap">${esc(day(d.updated))}</td><td><small>${esc(d.licence || '')}</small></td></tr>`;
  }).join('');
}

/* Starting points on the empty page: only those whose dataset and fields exist in this catalogue. */
function renderExamples() {
  const ok = availableExamples(S.cat);
  $('#examples').innerHTML = ok.length ? '<li class="prp-label examples-head">Or try</li>' + ok.map(e => `<li><a href="#d=${encodeURIComponent(e.d)}&${esc(e.hash)}">${esc(e.label)}<small>${esc(e.note)}</small></a></li>`).join('') : '';
}

/* =============================== the dataset panel and loading =============================== */
let INTRO = '';
function showIntro() { $('#ds-panel').innerHTML = INTRO; renderExamples(); hideWork(); renderPicker(); }
function renderDataset() {
  const panel = $('#ds-panel'), ds = currentDs();
  if (!S.cat) return;
  if (!S.spec.d) { showIntro(); return; }
  if (!ds) {
    panel.innerHTML = `<div class="prp-panel-body"><h2 class="prp-h2" id="ds-title">No dataset “${esc(S.spec.d)}”</h2><p class="desc">The catalogue has no dataset with that id; it may have been renamed. Choose one from the list.</p></div>`;
    hideWork(); return;
  }
  const [code, modName] = moduleInfo(ds.module), sub = subName(ds.submodule), bytes = declaredBytes(ds), files = datasetUrls(ds).length;
  const page = ds.page ? prpLink(ds.page, ds.submodule, ds.module) : null;
  const fields = ds.fields || [];
  panel.innerHTML = `<div class="prp-panel-head ds-head"><span class="prp-code" data-suite="${esc(ds.module)}">${esc(code)}</span><span class="where grow">${esc(modName)}${sub ? ' · ' + esc(sub) : ''}</span>` +
    (page ? `<a class="prp-btn sm ghost" href="${esc(page.href)}"${page.target ? ` target="${page.target}"` : ''}>Open ${esc(sub || 'its page')} ↗</a>` : '') + '</div>' +
    `<div class="prp-panel-body"><h2 class="prp-h2" id="ds-title">${esc(ds.title || ds.id)}</h2><p class="desc">${esc(ds.description || '')}</p>` +
    `<dl class="facts"><div><dt>Rows</dt><dd>${num(ds.rows)}</dd></div><div><dt>Size</dt><dd>${bytes ? mb(bytes) : '–'}${files > 1 ? ` in ${files} files` : ''}</dd></div>` +
    `<div><dt>Updated</dt><dd>${esc(day(ds.updated) || '–')}${ds.refresh ? ' · ' + esc(ds.refresh) : ''}</dd></div><div><dt>Licence</dt><dd>${esc(ds.licence || '–')}</dd></div>` +
    `<div><dt>Sources</dt><dd>${esc((ds.sources || []).join('; ') || '–')}</dd></div><div><dt>Id</dt><dd><code>${esc(ds.id)}</code></dd></div></dl>` +
    (fields.length ? `<details class="fields"><summary>${plural(fields.length, 'field')}</summary><div class="scroll"><table class="prp-table"><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Description</th></tr></thead><tbody>` +
      fields.map(f => `<tr><td><code>${esc(f.name)}</code></td><td><span class="type">${esc(f.type || '')}</span></td><td>${esc(f.description || '')}</td></tr>`).join('') + '</tbody></table></div></details>' : '') +
    '<div id="load-state" role="status" aria-live="polite"></div></div>';
  renderLoadState();
}
function renderLoadState() {
  const box = $('#load-state'), st = S.loadState;
  if (!box || !st) { if (box) box.innerHTML = ''; return; }
  if (st.kind === 'progress') {
    const pct = st.total ? Math.min(100, Math.round((st.bytes / st.total) * 100)) : null;
    box.innerHTML = `<div class="progress"><div class="bar${pct == null ? ' indeterminate' : ''}" role="progressbar" aria-label="Loading the dataset" aria-valuemin="0" aria-valuemax="100"${pct == null ? '' : ` aria-valuenow="${pct}"`}><i style="width:${pct ?? 30}%"></i></div>` +
      `<span class="status">${st.parsing ? `Preparing ${plural(st.parsing, 'row')}…` : `Loading ${mb(st.bytes || 0)}${st.total ? ' of ' + mb(st.total) : ''}${st.files > 1 ? ` · file ${st.file} of ${st.files}` : ''}…`}</span></div>`;
  } else if (st.kind === 'done') {
    box.innerHTML = `<p class="status good">Loaded ${plural(st.rows, 'row')} and ${plural(st.columns, 'column')} (${mb(st.bytes)}${st.generated ? `, file generated ${esc(day(st.generated))}` : ''}).</p>`;
  } else if (st.kind === 'confirm') {
    box.innerHTML = `<div class="prp-note warn load-note"><b>This dataset is ${mb(st.bytes)}.</b> Loading it may take a while and use a lot of memory, especially on a phone.<div class="row"><button type="button" class="prp-btn primary sm" data-large="yes">Load anyway</button><button type="button" class="prp-btn sm" data-large="no">Cancel</button></div></div>`;
  } else {
    const hub = prpLink('integration/index.html#tab=api', 'integration-hub', 'ds');
    box.innerHTML = `<div class="prp-note ${st.kind === 'cancelled' ? '' : 'bad'} load-note">${esc(st.message)}${st.kind === 'refused' ? ` <a href="${esc(hub.href)}"${hub.target ? ' target="_top"' : ''}>The Integration Hub</a> explains the API and MCP server.` : ''}` +
      (st.kind !== 'refused' ? '<div class="row"><button type="button" class="prp-btn sm" data-retry>Try again</button></div>' : '') + '</div>';
  }
}
function setLoad(st) { S.loadState = st; renderLoadState(); }
let largeAnswer = null;
const askLarge = bytes => new Promise(resolve => { largeAnswer = resolve; setLoad({ kind: 'confirm', bytes }); });

async function openDataset(id) {
  if (S.data?.id !== id) S.loadState = null;
  if (matchMedia('(max-width: 900px)').matches) collapsePicker(true); // on a phone the analysis comes first
  renderPicker();
  // Bring the chosen dataset into view in the list (the list scrolls, not the page).
  const list = $('#ds-list'), item = list.querySelector('[aria-current="true"]');
  if (item && list.clientHeight) {
    const dy = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (dy < 0 || dy > list.clientHeight - item.offsetHeight) list.scrollTop += dy - list.clientHeight / 3;
  }
  renderDataset();
  const ds = currentDs();
  if (!ds) return;
  if (S.data?.id === id) { setLoad({ kind: 'done', rows: S.data.base.rows.length, columns: S.data.base.columns.length, bytes: S.data.bytes, generated: S.data.generated }); apply(); return; }
  S.abort?.abort();
  const ctl = new AbortController();
  S.abort = ctl; S.loadingId = id; S.data = null; S.sql = null; hideWork();
  setLoad({ kind: 'progress', bytes: 0, total: declaredBytes(ds), file: 1, files: datasetUrls(ds).length });
  try {
    const out = await loadDataset(ds, { root: SITE, signal: ctl.signal, onProgress: p => { if (S.loadingId === id) setLoad({ kind: 'progress', ...p }); }, confirm: askLarge });
    if (S.loadingId !== id) return;
    setLoad({ kind: 'progress', bytes: out.bytes, total: out.bytes, file: 1, files: 1, parsing: out.records.length });
    await new Promise(r => setTimeout(r, 0));
    const declared = Object.fromEntries((ds.fields || []).map(f => [f.name, f.type]));
    const base = toTable(out.records, { declared });
    S.data = { id, ds, base, bytes: out.bytes, generated: out.generated, key: `${id}@${Date.now()}` };
    setLoad({ kind: 'done', rows: base.rows.length, columns: base.columns.length, bytes: out.bytes, generated: out.generated });
    apply();
  } catch (e) {
    if (e.name === 'AbortError' || S.loadingId !== id) return;
    setLoad({ kind: e.code === 'too-large' ? 'refused' : e.code === 'cancelled' ? 'cancelled' : 'error', message: e.message || String(e) });
  }
}
function hideWork() { for (const id of ['#steps-panel', '#result-panel', '#chart-panel', '#ai-panel']) $(id).hidden = true; }

/* =============================== running the analysis =============================== */
const isSql = () => S.spec.sql != null;
let applyTimer = 0, pointerDown = false;
function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(() => apply({ keepSteps: true }), 220); }
function apply({ keepSteps = false, keepPage = false } = {}) {
  clearTimeout(applyTimer);
  if (!S.data) { syncHash(); return; }
  for (const id of ['#steps-panel', '#result-panel', '#chart-panel', '#ai-panel']) $(id).hidden = false;
  if (isSql()) {
    S.run = null;
    S.result = S.sql && S.sql.key === S.data.key && S.sql.for === S.spec.sql ? S.sql.table : null;
  } else {
    S.run = runPipeline(S.data.base, S.spec.steps);
    S.result = S.run.table;
  }
  if (!keepPage) S.page = 0;
  renderMode();
  // While typing, rebuild the steps only when the columns they offer have changed (a new derived name, say).
  const sig = JSON.stringify(S.run?.trace.map(t => t.input.map(c => c.name + ':' + c.type)) || []);
  if (!keepSteps || (sig !== S.stepSig && !pointerDown)) renderSteps(); else updateStepStatus();
  S.stepSig = sig;
  renderResult();
  renderChartPanel();
  syncHash();
  refreshPrompt();
}
function syncHash() {
  const h = toHash(S.spec);
  if (h !== location.hash && !(h === '' && !location.hash)) history.replaceState(null, '', h || location.pathname + location.search);
}

/* ---------- steps ---------- */
const TYPE_CMPS = dict({
  number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'in', 'empty', 'notempty'],
  date: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'in', 'empty', 'notempty'],
  boolean: ['eq', 'ne', 'empty', 'notempty'],
  array: ['contains', 'eq', 'ne', 'starts', 'in', 'empty', 'notempty'],
  string: ['eq', 'ne', 'contains', 'starts', 'in', 'gt', 'lt', 'empty', 'notempty'],
});
const CMP_WORDS = dict({
  number: { eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤', in: 'is one of' },
  date: { eq: 'is in', ne: 'is not in', gt: 'is after', ge: 'is from', lt: 'is before', le: 'is up to' },
  array: { contains: 'has an item containing', eq: 'has the item', ne: 'does not have the item', starts: 'has an item starting', in: 'has one of' },
  string: { gt: 'comes after', lt: 'comes before' },
});
const cmpLabel = (type, c) => CMP_WORDS[type]?.[c] || CMPS[c];
const PLACEHOLDER = dict({ number: 'a number', date: '2026, 2026-10 or 2026-10-28', boolean: 'true or false' });
const stepInput = i => S.run?.trace[i]?.input || S.data.base.columns;
function colOptions(cols, value, { filter = () => true, blank = '' } = {}) {
  const opts = cols.filter(filter);
  const has = opts.some(c => c.name === value), exists = cols.some(c => c.name === value);
  return (blank ? `<option value="">${esc(blank)}</option>` : '') + (!has && value ? `<option value="${esc(value)}" selected>${esc(value)}${exists ? '' : ' (not in the data here)'}</option>` : '') +
    opts.map(c => `<option value="${esc(c.name)}"${c.name === value ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}
const field = (label, control, cls = '') => `<label class="field ${cls}"><span class="prp-label">${label}</span>${control}</label>`;
const FUNCS_HELP = `<details class="funcs"><summary>Functions and operators</summary><ul><li><code>+ - * / % ^</code> arithmetic; <code>+</code> also joins text</li><li><code>= != &lt; &lt;= &gt; &gt;=</code>, <code>and</code>, <code>or</code>, <code>not</code>, <code>test ? a : b</code></li><li>Text in quotes: <code>'election'</code>; a column with spaces: <code>\`my column\`</code></li>` +
  Object.values(FUNCTIONS).map(f => `<li><code>${esc(f[3].split(':')[0])}</code>${esc(f[3].slice(f[3].indexOf(':')))}</li>`).join('') + '</ul></details>';
const commonValues = (col, type) => {
  const base = S.data.base;
  if (!base.columns.some(c => c.name === col) || !['string', 'array', 'boolean'].includes(type)) return [];
  return profile(base, col, { top: 60 })?.common.map(e => String(e.v)) || [];
};

function stepBody(s, i) {
  const cols = stepInput(i);
  const typeOf = n => cols.find(c => c.name === n)?.type || 'string';
  switch (s.op) {
    case 'filter': {
      const t = typeOf(s.col), known = TYPE_CMPS[t] || TYPE_CMPS.string, needsVal = s.cmp !== 'empty' && s.cmp !== 'notempty';
      const list = known.includes(s.cmp) ? known : [...known, s.cmp]; // a condition from a link that does not suit the column still shows
      const values = commonValues(s.col, t);
      return field('Column', `<select class="prp-select" data-k="col">${colOptions(cols, s.col, { filter: c => c.type !== 'object' })}</select>`) +
        field('Condition', `<select class="prp-select" data-k="cmp">${list.map(c => `<option value="${esc(c)}"${c === s.cmp ? ' selected' : ''}>${esc(cmpLabel(t, c))}</option>`).join('')}</select>`) +
        (needsVal ? field('Value', `<input class="prp-input" data-k="val" value="${esc(s.val ?? '')}" placeholder="${esc(s.cmp === 'in' ? 'a | b | c' : PLACEHOLDER[t] || 'a value')}"${values.length ? ` list="dl-${i}"` : ''} autocomplete="off">` +
          (values.length ? `<datalist id="dl-${i}">${values.map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : ''), 'grow') : '');
    }
    case 'where': return field('Keep rows where', `<input class="prp-input mono" data-k="expr" value="${esc(s.expr ?? '')}" placeholder="deaths > 100 and year(date) >= 2020" autocomplete="off" spellcheck="false">`, 'grow') + FUNCS_HELP;
    case 'select': {
      const chosen = s.cols || [];
      return `<div class="chips" aria-label="Columns kept">${chosen.map((c, j) => `<span class="prp-chip">${esc(c)}<button type="button" data-act="col-del" data-j="${j}" aria-label="Remove ${esc(c)}">×</button></span>`).join('') || '<span class="hint">No columns chosen</span>'}</div>` +
        field('Add a column', `<select class="prp-select" data-k="col-add"><option value="">Choose…</option>${cols.filter(c => !chosen.includes(c.name)).map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select>`) +
        `<div class="row"><button type="button" class="prp-btn sm ghost" data-act="col-all">All</button><button type="button" class="prp-btn sm ghost" data-act="col-none">None</button></div>`;
    }
    case 'derive':
      return field('New column', `<input class="prp-input" data-k="as" value="${esc(s.as ?? '')}" placeholder="name" autocomplete="off" spellcheck="false">`) + '<span class="eq" aria-hidden="true">=</span>' +
        field('Expression', `<input class="prp-input mono" data-k="expr" value="${esc(s.expr ?? '')}" placeholder="year(date)" autocomplete="off" spellcheck="false">`, 'grow') + FUNCS_HELP;
    case 'unnest': {
      const lists = cols.filter(c => c.type === 'array');
      return lists.length || s.col ? field('List column', `<select class="prp-select" data-k="col">${colOptions(cols, s.col, { filter: c => c.type === 'array', blank: lists.length ? '' : 'No list columns' })}</select>`) +
        '<p class="hint">Each item of the list gets its own row (the other columns repeat), so you can filter, group or map by item.</p>' : '<p class="hint">There is no list column at this point.</p>';
    }
    case 'group': {
      const by = s.by || [], aggs = s.aggs?.length ? s.aggs : [{ fn: 'count', col: '', as: '' }];
      return `<div class="subrows"><div class="row"><span class="prp-label">Group by</span><div class="chips">${by.map((c, j) => `<span class="prp-chip">${esc(c)}<button type="button" data-act="by-del" data-j="${j}" aria-label="Stop grouping by ${esc(c)}">×</button></span>`).join('') || '<span class="hint">nothing: one summary row</span>'}</div>` +
        `<select class="prp-select" data-k="by-add" aria-label="Group by another column"><option value="">Add a column…</option>${cols.filter(c => !by.includes(c.name) && c.type !== 'object').map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>` +
        `<span class="prp-label">Aggregates</span>` + aggs.map((a, j) => `<div class="subrow"><select class="prp-select" data-k="agg-fn" data-j="${j}" aria-label="Aggregate ${j + 1}">${Object.entries(AGGS).map(([k, v]) => `<option value="${esc(k)}"${k === a.fn ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` +
          `<select class="prp-select" data-k="agg-col" data-j="${j}" aria-label="Column for aggregate ${j + 1}">${a.fn === 'count' ? `<option value="">of rows</option>` : ''}${colOptions(cols, a.col, { filter: c => (['sum', 'mean', 'median'].includes(a.fn) ? c.type === 'number' : c.type !== 'object') })}</select>` +
          `<input class="prp-input" data-k="agg-as" data-j="${j}" value="${esc(a.as || '')}" placeholder="${esc(aggName({ fn: a.fn, col: a.col }))}" aria-label="Name for aggregate ${j + 1}" autocomplete="off" spellcheck="false">` +
          `<button type="button" class="icon-btn" data-act="agg-del" data-j="${j}" aria-label="Remove aggregate ${j + 1}"${aggs.length < 2 ? ' disabled' : ''}>×</button></div>`).join('') +
        `<div><button type="button" class="prp-btn sm ghost" data-act="agg-add">Add an aggregate</button></div></div>`;
    }
    case 'sort': {
      const by = s.by?.length ? s.by : [{ col: '', desc: false }];
      return `<div class="subrows">${by.map((b, j) => `<div class="subrow"><span class="prp-label">${j ? 'then by' : 'by'}</span><select class="prp-select" data-k="sort-col" data-j="${j}" aria-label="Sort column ${j + 1}">${colOptions(cols, b.col, { blank: b.col ? '' : 'Choose…' })}</select>` +
        `<select class="prp-select" data-k="sort-dir" data-j="${j}" aria-label="Direction ${j + 1}"><option value="asc"${b.desc ? '' : ' selected'}>Ascending (A–Z, low–high, old–new)</option><option value="desc"${b.desc ? ' selected' : ''}>Descending (Z–A, high–low, new–old)</option></select>` +
        `<button type="button" class="icon-btn" data-act="sort-del" data-j="${j}" aria-label="Remove sort key ${j + 1}"${by.length < 2 ? ' disabled' : ''}>×</button></div>`).join('')}` +
        `<div><button type="button" class="prp-btn sm ghost" data-act="sort-add">Then by…</button></div></div>`;
    }
    case 'limit': return field('Keep the first', `<input class="prp-input" type="number" min="0" step="1" data-k="n" value="${esc(s.n ?? 20)}" style="width:110px">`) + '<span class="eq">rows</span>';
    default: return '';
  }
}
const INCOMPLETE = /^(Give|Choose|Write|Name)\b/;
function stepStatus(i) {
  const t = S.run?.trace[i];
  if (!t) return { rows: '', error: '' };
  return { rows: t.error ? 'skipped' : `${num(t.before)} → ${num(t.rows)} rows`, error: t.error || '' };
}
function renderSteps() {
  // Keep the focus (and the caret) on the same control across a rebuild.
  const a = document.activeElement, li = a?.closest?.('.step');
  const keep = li && a.dataset.k ? { i: li.dataset.i, k: a.dataset.k, j: a.dataset.j, start: a.selectionStart, end: a.selectionEnd } : null;
  const steps = S.spec.steps;
  $('#steps-empty').hidden = steps.length > 0;
  $('#steps').innerHTML = steps.map((s, i) => {
    const st = stepStatus(i);
    return `<li class="step" data-i="${i}"${st.error && !INCOMPLETE.test(st.error) ? ' data-error' : ''}><div class="step-head"><span class="no">${i + 1}</span><b>${esc(STEP_TYPES[s.op] || s.op)}</b><span class="rows">${esc(st.rows)}</span>` +
      `<span class="tools"><button type="button" class="icon-btn" data-act="up" aria-label="Move step ${i + 1} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="icon-btn" data-act="down" aria-label="Move step ${i + 1} down"${i < steps.length - 1 ? '' : ' disabled'}>↓</button>` +
      `<button type="button" class="icon-btn" data-act="del" aria-label="Remove step ${i + 1}">×</button></span></div>` +
      `<div class="step-body">${stepBody(s, i)}</div><p class="step-err"${st.error ? '' : ' hidden'}${INCOMPLETE.test(st.error) ? ' style="color:var(--prp-muted)"' : ''}>${esc(st.error)}</p></li>`;
  }).join('');
  if (keep) {
    const el = $(`#steps .step[data-i="${keep.i}"] [data-k="${keep.k}"]${keep.j != null ? `[data-j="${keep.j}"]` : ''}`);
    if (el) { el.focus(); if (keep.start != null && el.setSelectionRange) try { el.setSelectionRange(keep.start, keep.end); } catch { /* number inputs */ } }
  }
}
function updateStepStatus() {
  document.querySelectorAll('#steps .step').forEach(li => {
    const i = +li.dataset.i, st = stepStatus(i), err = li.querySelector('.step-err');
    li.querySelector('.rows').textContent = st.rows;
    err.textContent = st.error; err.hidden = !st.error;
    err.style.color = INCOMPLETE.test(st.error) ? 'var(--prp-muted)' : '';
    li.toggleAttribute('data-error', !!st.error && !INCOMPLETE.test(st.error));
  });
}
function newStep(op) {
  const cols = S.result?.columns || S.data.base.columns;
  const text = cols.find(c => c.type === 'string') || cols[0];
  const numCol = [...cols].reverse().find(c => c.type === 'number');
  switch (op) {
    case 'filter': return { op, col: text?.name || '', cmp: 'eq', val: '' };
    case 'where': return { op, expr: '' };
    case 'select': return { op, cols: cols.map(c => c.name) };
    case 'derive': return { op, as: 'new_column', expr: '' };
    case 'unnest': return { op, col: cols.find(c => c.type === 'array')?.name || '' };
    case 'group': {
      const low = cols.filter(c => c.type === 'string' || c.type === 'boolean').map(c => ({ c, p: profile(S.result || S.data.base, c.name, { cap: 400 }) })).filter(e => e.p && e.p.distinct > 1 && e.p.distinct < 400).sort((a, b) => a.p.distinct - b.p.distinct)[0];
      return { op, by: low ? [low.c.name] : [], aggs: [{ fn: 'count', col: '', as: '' }] };
    }
    case 'sort': return { op, by: [{ col: numCol?.name || cols[0]?.name || '', desc: !!numCol }] };
    case 'limit': return { op, n: 20 };
    default: return null;
  }
}
function onStepsEvent(e) {
  const li = e.target.closest('.step');
  const i = li ? +li.dataset.i : -1, s = S.spec.steps[i];
  const el = e.target, k = el.dataset?.k, j = el.dataset?.j != null ? +el.dataset.j : null;
  if (e.type === 'click') {
    const act = el.closest('[data-act]')?.dataset.act;
    if (!act || !s) return;
    const steps = S.spec.steps;
    if (act === 'del') steps.splice(i, 1);
    else if (act === 'up' && i > 0) [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
    else if (act === 'down' && i < steps.length - 1) [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
    else if (act === 'col-del') s.cols.splice(+el.closest('[data-j]').dataset.j, 1);
    else if (act === 'col-all') s.cols = stepInput(i).map(c => c.name);
    else if (act === 'col-none') s.cols = [];
    else if (act === 'by-del') s.by.splice(+el.closest('[data-j]').dataset.j, 1);
    else if (act === 'agg-add') { s.aggs = s.aggs?.length ? s.aggs : [{ fn: 'count', col: '', as: '' }]; const n = stepInput(i).find(c => c.type === 'number'); s.aggs.push(n ? { fn: 'sum', col: n.name, as: '' } : { fn: 'distinct', col: stepInput(i)[0]?.name || '', as: '' }); }
    else if (act === 'agg-del') s.aggs.splice(+el.closest('[data-j]').dataset.j, 1);
    else if (act === 'sort-add') s.by.push({ col: '', desc: false });
    else if (act === 'sort-del') s.by.splice(+el.closest('[data-j]').dataset.j, 1);
    else return;
    apply();
    return;
  }
  if (!s || !k) return;
  // Text boxes apply as you type (and never rebuild the list under the pointer); lists apply on change.
  if (el.tagName === 'INPUT' ? e.type !== 'input' : e.type !== 'change') return;
  const v = el.value;
  const typing = el.tagName === 'INPUT';
  switch (k) {
    case 'col': s.col = v; if (s.op === 'filter') { const t = stepInput(i).find(c => c.name === v)?.type || 'string'; if (!(TYPE_CMPS[t] || TYPE_CMPS.string).includes(s.cmp)) s.cmp = (TYPE_CMPS[t] || TYPE_CMPS.string)[0]; } break;
    case 'cmp': s.cmp = v; break;
    case 'val': s.val = v; break;
    case 'expr': s.expr = v; break;
    case 'as': s.as = v; break;
    case 'n': s.n = v === '' ? '' : Math.max(0, Math.floor(+v)); break;
    case 'col-add': if (v) s.cols.push(v); break;
    case 'by-add': if (v) s.by.push(v); break;
    case 'agg-fn': { s.aggs ||= [{ fn: 'count', col: '', as: '' }]; const a = s.aggs[j]; a.fn = v; const cols = stepInput(i); if (v === 'count') a.col = ''; else if (['sum', 'mean', 'median'].includes(v) && cols.find(c => c.name === a.col)?.type !== 'number') a.col = cols.find(c => c.type === 'number')?.name || ''; else if (!a.col) a.col = cols[0]?.name || ''; break; }
    case 'agg-col': s.aggs[j].col = v; break;
    case 'agg-as': s.aggs[j].as = v; break;
    case 'sort-col': s.by = s.by?.length ? s.by : [{ col: '', desc: false }]; s.by[j].col = v; break;
    case 'sort-dir': s.by = s.by?.length ? s.by : [{ col: '', desc: false }]; s.by[j].desc = v === 'desc'; break;
    default: return;
  }
  if (typing) scheduleApply(); else apply();
}

/* ---------- SQL mode ---------- */
function defaultSQL() {
  const cols = S.data.base.columns, q = n => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : `"${n.replace(/"/g, '""')}"`);
  const g = cols.find(c => c.type === 'string');
  return g ? `SELECT ${q(g.name)}, COUNT(*) AS n\nFROM data\nGROUP BY 1\nORDER BY n DESC\nLIMIT 20` : 'SELECT *\nFROM data\nLIMIT 100';
}
function renderMode() {
  const sql = isSql();
  $('#mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'sql') === sql)));
  $('#steps-box').hidden = sql; $('#sql-box').hidden = !sql;
  if (sql && document.activeElement !== $('#sql')) $('#sql').value = S.spec.sql;
  if (sql && !S.result) $('#sql-status').textContent = S.sql?.error ? '' : 'Run the query to see its result.';
}
async function runSql() {
  const text = $('#sql').value;
  S.spec.sql = text; syncHash();
  const status = $('#sql-status'), out = $('#sql-out');
  out.hidden = true; status.className = 'status';
  const t0 = performance.now();
  try {
    $('#sql-run').disabled = true;
    const { runSQL } = await import('./lib/sql.js');
    const r = await runSQL(S.data.base, S.data.key, text, m => { status.textContent = m; });
    S.sql = { key: S.data.key, for: text, table: { columns: columnsOf(r.rows, r.names), rows: r.rows }, error: '' };
    status.className = 'status good';
    status.textContent = `${plural(r.total, 'row')} in ${Math.round(performance.now() - t0)} ms${r.truncated ? `; showing the first ${num(r.rows.length)}` : ''}.`;
    S.chartAuto = S.chartAuto || !S.spec.chart.type;
    apply({ keepSteps: true });
  } catch (e) {
    S.sql = { key: S.data.key, for: text, table: null, error: e.message || String(e) };
    status.textContent = '';
    out.textContent = (e.message || String(e)).replace(/^Error:\s*/, '');
    out.hidden = false;
    apply({ keepSteps: true });
  } finally { $('#sql-run').disabled = false; }
}

/* ---------- result table ---------- */
const URLISH = /^https?:\/\/[^\s"'<>]+$/;
function cell(v, c) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '<td><span class="nil">–</span></td>';
  const text = formatValue(v, c.type, c.name);
  if (typeof v === 'number') return `<td class="num">${esc(text)}</td>`;
  if (typeof v === 'string' && URLISH.test(v)) return `<td><a href="${esc(v)}" target="_blank" rel="noopener noreferrer" title="${esc(v)}">${esc(text.replace(/^https?:\/\/(www\.)?/, ''))}</a></td>`;
  return `<td${text.length > 50 ? ` title="${esc(text.slice(0, 600))}"` : ''}>${esc(text.length > 160 ? text.slice(0, 159) + '…' : text)}</td>`;
}
function renderResult() {
  const t = S.result, table = $('#result-table'), pager = $('#pager');
  $('#csv').disabled = !t?.rows.length;
  if (!t) { $('#result-count').textContent = ''; table.innerHTML = `<tbody><tr><td class="prp-empty">${isSql() ? (S.sql?.error ? 'The query did not run; see the message above.' : 'Run the SQL query to see its result.') : ''}</td></tr></tbody>`; pager.innerHTML = ''; return; }
  const n = t.rows.length, base = S.data.base.rows.length, pages = Math.max(1, Math.ceil(n / S.pageSize));
  S.page = Math.min(S.page, pages - 1);
  $('#result-count').textContent = `${plural(n, 'row')} × ${plural(t.columns.length, 'column')}${n !== base && !isSql() ? ` · from ${num(base)}` : ''}`;
  if (!n) { table.innerHTML = '<tbody><tr><td class="prp-empty">No rows. Loosen a filter or remove a step.</td></tr></tbody>'; pager.innerHTML = ''; return; }
  const from = S.page * S.pageSize, rows = t.rows.slice(from, from + S.pageSize);
  table.innerHTML = `<thead><tr>${t.columns.map(c => `<th scope="col"${c.type === 'number' ? ' class="num"' : ''}>${esc(c.name)}<span class="type">${esc(c.type)}</span></th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r => `<tr>${t.columns.map(c => cell(r[c.name], c)).join('')}</tr>`).join('')}</tbody>`;
  pager.innerHTML = `<span class="status">Rows ${num(from + 1)}–${num(from + rows.length)} of ${num(n)}</span><div class="row">` +
    `<button type="button" class="prp-btn sm" data-p="prev"${S.page ? '' : ' disabled'}>‹ Previous</button><span class="status">Page ${num(S.page + 1)} of ${num(pages)}</span>` +
    `<button type="button" class="prp-btn sm" data-p="next"${S.page < pages - 1 ? '' : ' disabled'}>Next ›</button>` +
    `<label class="row status">Rows per page <select class="prp-select" id="page-size">${[25, 50, 100, 250].map(k => `<option${k === S.pageSize ? ' selected' : ''}>${k}</option>`).join('')}</select></label></div>`;
}

/* ---------- chart ---------- */
const QUANT = c => c.type === 'number' || c.type === 'date';
const CHART_LABELS = dict({
  bar: ['Categories', 'Value', 'Stack by'], line: ['Across', 'Value', 'One line per'], area: ['Across', 'Value', 'One band per'],
  scatter: ['Across (x)', 'Up (y)', 'Colour by'], hist: ['Values', '', 'Stack by'], map: ['Countries', 'Value', ''],
});
function endsInSort() {
  if (isSql()) return /order\s+by/i.test(S.spec.sql || '');
  const ops = S.spec.steps.map(s => s.op).filter(op => op !== 'limit' && op !== 'select');
  return ops[ops.length - 1] === 'sort';
}
function renderChartControls() {
  const c = S.spec.chart, t = S.result, cols = t?.columns || [];
  $('#chart-type').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (c.type || ''))));
  $('#chart-controls').hidden = !c.type;
  if (!c.type) return;
  const [lx, ly, lc] = CHART_LABELS[c.type];
  $('#lbl-x').textContent = lx; $('#lbl-y').textContent = ly; $('#lbl-color').textContent = lc;
  const xFilter = c.type === 'bar' ? x => x.type !== 'array' && x.type !== 'object' : c.type === 'map' ? x => x.type === 'string' || x.type === 'number' : QUANT;
  $('#cx').innerHTML = colOptions(cols, c.x, { filter: xFilter, blank: c.x ? '' : 'Choose…' });
  const yNeeded = c.type !== 'hist';
  $('#f-y').hidden = !yNeeded;
  if (c.type === 'scatter') $('#cy').innerHTML = colOptions(cols, c.y, { filter: QUANT, blank: c.y ? '' : 'Choose…' });
  else $('#cy').innerHTML = `<option value=""${c.y ? '' : ' selected'}>Count of rows</option>` + colOptions(cols, c.y, { filter: x => x.type === 'number' });
  const showFn = yNeeded && c.type !== 'scatter' && !!c.y;
  $('#f-fn').hidden = !showFn;
  $('#cfn').innerHTML = Object.entries(CHART_FNS).filter(([k]) => k !== 'count').map(([k, v]) => `<option value="${esc(k)}"${k === (c.fn || 'sum') ? ' selected' : ''}>${esc(v)}</option>`).join('');
  $('#f-color').hidden = c.type === 'map';
  $('#ccolor').innerHTML = `<option value="">Nothing</option>` + colOptions(cols, c.color, { filter: x => (x.type === 'string' || x.type === 'boolean') && x.name !== c.x });
  $('#f-bins').hidden = c.type !== 'hist';
  if (document.activeElement !== $('#cbins')) $('#cbins').value = c.bins || '';
}
function renderChartPanel() {
  const t = S.result;
  if (!t) { $('#chart-panel').hidden = true; return; }
  $('#chart-panel').hidden = false;
  const c = S.spec.chart, problem = c.type ? chartProblem(t, c) : '';
  // A chart chosen by hand stays while it fits; when its columns are gone (after a group, say), a new one is suggested.
  if (!S.chartAuto && /^No column/.test(problem)) S.chartAuto = true;
  if (S.chartAuto && (!c.type || problem)) { const sug = suggestChart(t); S.spec.chart = sug ? { ...emptyChart(), ...sug } : emptyChart(); }
  renderChartControls();
  drawFigure();
}
/** The column whose values are most often countries (for a map). */
function countryColumn(cols) {
  if (!S.match) return cols.find(x => x.type === 'string' && /country|iso|nation|state/i.test(x.name))?.name || cols.find(x => x.type === 'string')?.name || '';
  const scored = cols.filter(x => x.type === 'string').map(x => ({ x, s: countryShare(S.result, x.name, S.match) })).sort((a, b) => b.s - a.s);
  return scored[0]?.s > 0.3 ? scored[0].x.name : scored[0]?.x.name || '';
}
function figureCaption(prep) {
  const ds = S.data.ds, [, modName] = moduleInfo(ds.module), sub = subName(ds.submodule);
  const what = cap(describeChart(S.spec.chart));
  const steps = isSql() ? [] : S.spec.steps.filter((s, i) => !S.run?.trace[i]?.error).map(describeStep);
  const how = isSql() ? ' From an SQL query over the dataset.' : steps.length ? ` Steps: ${steps.length > 3 ? steps.slice(0, 3).join('; ') + `; and ${steps.length - 3} more` : steps.join('; ')}.` : '';
  const src = ds.sources || [];
  const from = src.length ? ', from ' + (src.length > 3 ? `${src.slice(0, 3).join('; ')} and ${src.length - 3} more` : src.join('; ')) : '';
  const source = `Source: ${ds.title} (PRP ${modName}${sub ? ' · ' + sub : ''})${from}${ds.licence ? '. ' + ds.licence.replace(/\.$/, '') : ''}.`;
  return { lead: 'Figure 1.', title: what, text: `${what}.${how} ${source}` };
}
async function drawFigure() {
  const seq = ++S.drawSeq, t = S.result, c = S.spec.chart;
  if (!t || $('#chart-panel').hidden) return;
  const host = $('#chart');
  const clear = msg => {
    host.innerHTML = msg ? `<p class="prp-empty">${esc(msg)}</p>` : '';
    $('#legend').innerHTML = ''; $('#ramp').innerHTML = ''; $('#caption').innerHTML = ''; $('#chart-notes').innerHTML = ''; $('#chart-table').innerHTML = ''; $('#chart-table-box').hidden = true;
    for (const b of ['#png', '#svg', '#chart-csv']) $(b).disabled = true;
    S.chart = null;
  };
  if (!c.type) { clear('No chart. Choose a type above to draw one.'); return; }
  if (c.type === 'map' && !S.match) {
    clear('Loading the world map…');
    try { S.geo = await (await R()).ensureMap(); S.match = countryMatcher(S.geo.countries); } catch (e) { if (seq === S.drawSeq) clear(e.message); return; }
    if (seq !== S.drawSeq) return;
  }
  const prep = prepareChart(t, c, { ordered: endsInSort(), country: S.match });
  if (!prep.ok) { clear(prep.error); return; }
  let Plot, lib;
  if (!window.Plot) host.innerHTML = '<p class="prp-empty">Loading the chart library…</p>';
  try { lib = await R(); Plot = await lib.ensurePlot(); } catch (e) { if (seq === S.drawSeq) clear(e.message); return; }
  if (seq !== S.drawSeq) return;
  const T = lib.readTokens();
  const width = Math.max(260, Math.floor(host.getBoundingClientRect().width || 640));
  let drawn;
  try { drawn = lib.renderChart(Plot, prep, { width, T, geo: S.geo, countryOf: S.match }); } catch (e) { clear(`The chart could not be drawn: ${e.message}`); return; }
  host.replaceChildren(drawn.svg);
  $('#legend').innerHTML = drawn.legend.length >= 2 ? drawn.legend.map(l => `<li><i style="background:${esc(l.colour)}" aria-hidden="true"></i>${esc(l.name)}</li>`).join('') : '';
  $('#ramp').innerHTML = drawn.ramp?.thresholds.length ? lib.rampSVG(drawn.ramp, T, Math.min(360, width)) : '';
  const capt = figureCaption(prep);
  $('#caption').innerHTML = `<b>${capt.lead}</b> ${esc(capt.text)}`;
  $('#chart-notes').innerHTML = prep.notes.map(n => `<li>${esc(n)}</li>`).join('');
  const tt = prep.table;
  $('#chart-table-box').hidden = false;
  $('#chart-table-note').hidden = !prep.tableNote; $('#chart-table-note').textContent = prep.tableNote || '';
  $('#chart-table').innerHTML = `<table class="prp-table chart-table"><caption class="prp-caption">${esc(capt.title)}</caption><thead><tr>${tt.columns.map(k => `<th scope="col"${k.type === 'number' ? ' class="num"' : ''}>${esc(k.name)}</th>`).join('')}</tr></thead><tbody>` +
    tt.rows.map(r => `<tr>${tt.columns.map(k => { const v = r[k.name]; return v == null || v === '' ? '<td><span class="nil">–</span></td>' : typeof v === 'number' ? `<td class="num">${esc(formatValue(v, 'number', k.name))}</td>` : `<td>${esc(formatValue(v, k.type, k.name))}</td>`; }).join('')}</tr>`).join('') + '</tbody></table>';
  for (const b of ['#png', '#svg', '#chart-csv']) $(b).disabled = false;
  S.chart = { prep, drawn, T, cap: capt, width };
}

/* ---------- exports ---------- */
const BOM = String.fromCharCode(0xfeff); // so spreadsheet programs read the CSV as UTF-8
const fileBase = x => x.slug(`${S.spec.d}-${S.spec.chart.type || 'data'}`);
async function exportCSV() {
  if (!S.result) return;
  const x = await X();
  x.download(new Blob([BOM + toCSV(S.result)], { type: 'text/csv;charset=utf-8' }), `${x.slug(S.spec.d)}.csv`);
  note('#export-status', '');
}
async function exportChartCSV() {
  if (!S.chart) return;
  const x = await X();
  x.download(new Blob([BOM + toCSV(S.chart.prep.table)], { type: 'text/csv;charset=utf-8' }), `${fileBase(x)}-chart.csv`);
}
async function exportImage(kind) {
  if (!S.chart) return;
  try {
    const x = await X(), { drawn, T, cap } = S.chart;
    const c = x.composeSVG({ svg: drawn.svg, legend: drawn.legend.length >= 2 ? drawn.legend : [], ramp: drawn.ramp?.thresholds.length ? drawn.ramp : null, title: `${cap.title} · ${S.data.ds.title}`, caption: `${cap.lead} ${cap.text}`, lead: cap.lead, T });
    if (kind === 'svg') x.download(new Blob([c.text], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase(x)}.svg`);
    else x.download(await x.svgToPng(c, 2), `${fileBase(x)}.png`);
    note('#export-status', `Saved ${kind.toUpperCase()}, ${c.width} × ${c.height} px${kind === 'png' ? ' at 2×' : ''}.`);
  } catch (e) { note('#export-status', e.message, true); }
}
function note(sel, msg, bad = false) { const el = $(sel); el.textContent = msg; el.className = 'status' + (bad ? ' bad' : msg ? ' good' : ''); }

/* ---------- Copy for AI ---------- */
// Links in the prompt point at this site when it is public (a preview deployment too), otherwise at the live one.
const PUBLIC_SITE = location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname) ? SITE.href : 'https://jdpi.pages.dev/';
function aiPrompt() {
  const ds = S.data.ds, [, modName] = moduleInfo(ds.module);
  return buildPrompt({
    ds, moduleName: modName, submoduleName: subName(ds.submodule), siteUrl: PUBLIC_SITE, hubUrl: new URL('integration/index.html#tab=mcp', PUBLIC_SITE).href,
    result: S.result || { columns: S.data.base.columns, rows: [] }, spec: S.spec, question: $('#ai-q').value,
    types: Object.fromEntries(S.data.base.columns.map(c => [c.name, c.type])),
    link: analysisLink(new URL('analytics/', PUBLIC_SITE).href, S.spec), chartNote: S.chart ? describeChart(S.spec.chart) : '', errors: S.run?.errors || [],
  });
}
let promptTimer = 0;
function refreshPrompt() { clearTimeout(promptTimer); if ($('#ai-preview-box').open) promptTimer = setTimeout(() => { $('#ai-preview').textContent = aiPrompt(); }, 150); }
async function copyForAI() {
  const text = aiPrompt();
  $('#ai-preview').textContent = text;
  try {
    await navigator.clipboard.writeText(text);
    note('#ai-status', `Copied ${num(text.length)} characters. Paste them into Claude or another assistant.`);
  } catch {
    // Older browsers, or the clipboard is blocked: select the preview so it can be copied by hand.
    $('#ai-preview-box').open = true;
    const r = document.createRange(); r.selectNodeContents($('#ai-preview'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    note('#ai-status', ok ? `Copied ${num(text.length)} characters.` : 'The browser blocked the clipboard: the text is selected below; copy it with Ctrl+C or ⌘C.', !ok);
  }
}

/* =============================== tabs, the address and events =============================== */
function setTab(tab, { push = true } = {}) {
  S.spec.tab = tab === 'catalogue' ? 'catalogue' : 'work';
  for (const [t, panel] of [['work', '#panel-work'], ['catalogue', '#panel-catalogue']]) {
    const on = S.spec.tab === t, b = $(`#tab-${t}`);
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(panel).hidden = !on;
  }
  if (S.spec.tab === 'catalogue') renderCatalogue();
  else requestAnimationFrame(() => { if (S.chart && Math.abs(($('#chart').getBoundingClientRect().width || 0) - S.chart.width) > 16) drawFigure(); });
  if (push) syncHash();
}
function adopt(spec) {
  const sameData = spec.d && spec.d === S.data?.id;
  S.spec = spec;
  S.chartAuto = !spec.chart.type;
  setTab(spec.tab, { push: false });
  if (!S.cat) return;
  if (!spec.d) { S.data = null; S.abort?.abort(); showIntro(); return; }
  if (sameData) { renderPicker(); apply(); } else openDataset(spec.d);
}
function chooseDataset(id) {
  if (id === S.spec.d && S.data?.id === id) return;
  S.spec = { ...emptySpec(), d: id, tab: 'work' };
  S.chartAuto = true;
  if (matchMedia('(max-width: 900px)').matches) collapsePicker(true);
  setTab('work', { push: false });
  openDataset(id);
  syncHash();
}
function collapsePicker(on) {
  $('#picker').classList.toggle('collapsed', on);
  $('#picker-toggle').setAttribute('aria-expanded', String(!on));
  $('#picker-toggle').textContent = on ? 'Show datasets' : 'Hide list';
}

function wire() {
  $('#ds-q').addEventListener('input', renderPicker);
  $('#ds-module').addEventListener('change', renderPicker);
  $('#ds-list').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) chooseDataset(b.dataset.id); });
  $('#cat-rows').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) chooseDataset(b.dataset.open); });
  $('#picker-toggle').addEventListener('click', () => collapsePicker(!$('#picker').classList.contains('collapsed')));
  $('#ds-panel').addEventListener('click', e => {
    const large = e.target.closest('[data-large]');
    if (large && largeAnswer) { const f = largeAnswer; largeAnswer = null; f(large.dataset.large === 'yes'); }
    if (e.target.closest('[data-retry]') && S.spec.d) { S.data = null; openDataset(S.spec.d); }
  });
  for (const ev of ['input', 'change', 'click']) $('#steps').addEventListener(ev, onStepsEvent);
  $('#steps').addEventListener('pointerdown', () => { pointerDown = true; });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, () => { pointerDown = false; });
  $('#steps-panel').querySelector('.add').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b || !S.data) return;
    const step = newStep(b.dataset.add); if (!step) return;
    S.spec.steps.push(step);
    apply();
    const last = $('#steps').lastElementChild?.querySelector('input, select');
    last?.focus();
  });
  $('#mode').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b || !S.data) return;
    if (b.dataset.v === 'sql' && !isSql()) { S.savedSteps = S.spec.steps; S.spec.sql = S.sql?.for ?? defaultSQL(); }
    else if (b.dataset.v === 'steps' && isSql()) { S.spec.sql = null; if (S.savedSteps && !S.spec.steps.length) S.spec.steps = S.savedSteps; }
    else return;
    S.chartAuto = true;
    apply();
  });
  $('#sql').addEventListener('input', () => { S.spec.sql = $('#sql').value; clearTimeout(applyTimer); applyTimer = setTimeout(syncHash, 400); });
  $('#sql').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSql(); } });
  $('#sql-run').addEventListener('click', runSql);
  $('#pager').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; S.page += b.dataset.p === 'next' ? 1 : -1; renderResult(); $('#result-scroll').scrollTop = 0; });
  $('#pager').addEventListener('change', e => { if (e.target.id === 'page-size') { S.pageSize = +e.target.value; S.page = 0; renderResult(); } });
  $('#csv').addEventListener('click', exportCSV);
  $('#chart-csv').addEventListener('click', exportChartCSV);
  $('#svg').addEventListener('click', () => exportImage('svg'));
  $('#png').addEventListener('click', () => exportImage('png'));
  $('#chart-type').addEventListener('click', async e => {
    const b = e.target.closest('[data-v]'); if (!b || !S.result) return;
    const type = b.dataset.v, c = S.spec.chart;
    S.chartAuto = false;
    if (type === 'map' && !S.match) {
      $('#chart').innerHTML = '<p class="prp-empty">Loading the world map…</p>';
      try { S.geo = await (await R()).ensureMap(); S.match = countryMatcher(S.geo.countries); } catch { /* drawFigure reports it */ }
    }
    const cols = S.result.columns;
    if (!type) { S.spec.chart = { ...emptyChart() }; }
    else {
      const next = { ...c, type };
      // Keep what still fits the new type; otherwise pick the first column that does.
      const fits = { bar: x => x.type !== 'array' && x.type !== 'object', map: x => x.type === 'string', line: QUANT, area: QUANT, scatter: QUANT, hist: QUANT }[type];
      if (type === 'map') { if (!(S.match && cols.some(x => x.name === next.x) && countryShare(S.result, next.x, S.match) > 0.3)) next.x = countryColumn(cols); }
      else if (!cols.some(x => x.name === next.x && fits(x))) next.x = cols.find(fits)?.name || '';
      if (type === 'scatter' && !cols.some(x => x.name === next.y && QUANT(x))) next.y = cols.find(x => QUANT(x) && x.name !== next.x)?.name || '';
      if (type === 'hist') next.y = '';
      if (type === 'map') next.color = '';
      if (next.color === next.x) next.color = '';
      S.spec.chart = next;
    }
    renderChartControls(); drawFigure(); syncHash(); refreshPrompt();
  });
  const chartInput = () => {
    const c = S.spec.chart;
    S.chartAuto = false;
    c.x = $('#cx').value; c.y = c.type === 'hist' ? '' : $('#cy').value;
    c.fn = c.y && c.type !== 'scatter' && $('#cfn').value !== 'sum' ? $('#cfn').value : ''; // sum is the default, left out of the address
    c.color = c.type === 'map' ? '' : $('#ccolor').value; c.bins = c.type === 'hist' ? Math.max(0, Math.min(200, Math.floor(+$('#cbins').value || 0))) : 0;
    renderChartControls(); drawFigure(); syncHash(); refreshPrompt();
  };
  for (const id of ['#cx', '#cy', '#cfn', '#ccolor']) $(id).addEventListener('change', chartInput);
  $('#cbins').addEventListener('change', chartInput);
  $('#ai-copy').addEventListener('click', copyForAI);
  $('#ai-q').addEventListener('input', refreshPrompt);
  $('#ai-preview-box').addEventListener('toggle', refreshPrompt);
  // Tabs: click, arrow keys, Home and End.
  const tabs = [$('#tab-work'), $('#tab-catalogue')];
  tabs.forEach((b, k) => {
    b.addEventListener('click', () => setTab(k ? 'catalogue' : 'work'));
    b.addEventListener('keydown', e => {
      const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault(); const n = tabs[(next + tabs.length) % tabs.length]; n.focus(); setTab(n.id === 'tab-catalogue' ? 'catalogue' : 'work');
    });
  });
  window.addEventListener('hashchange', () => {
    const { spec } = parseHash(location.hash);
    if (toHash(spec) === toHash(S.spec)) return;
    adopt(spec);
  });
  window.addEventListener('prp:themechange', () => { if (S.chart || S.spec.chart.type) drawFigure(); });
  // Redraw when the figure's width changes (a rotated phone, a resized window), not when its height does.
  let rt = 0;
  new ResizeObserver(entries => {
    const w = Math.round(entries[0].contentRect.width);
    if (!S.chart || !w || Math.abs(w - S.chart.width) < 16) return;
    clearTimeout(rt); rt = setTimeout(drawFigure, 160);
  }).observe($('#figure'));
  const hub = prpLink('integration/index.html#tab=mcp', 'integration-hub', 'ds');
  $('#hub-link').href = hub.href; if (hub.target) $('#hub-link').target = hub.target;
}

async function init() {
  INTRO = $('#ds-panel').innerHTML;
  wire();
  const { spec, problems } = parseHash(location.hash);
  S.spec = spec;
  S.chartAuto = !spec.chart.type;
  setTab(spec.tab, { push: false });
  const reg = loadRegistry();
  try { await loadCatalogue(); } catch (e) {
    $('#meta').innerHTML = `<span class="status bad">${esc(e.message)}</span>`;
    $('#ds-list').innerHTML = `<li class="ds-empty">${esc(e.message)} <button type="button" class="prp-btn sm" onclick="location.reload()">Try again</button></li>`;
    return;
  }
  await reg;
  renderMeta(); renderModuleFilter(); renderPicker(); renderExamples();
  if (S.spec.tab === 'catalogue') renderCatalogue();
  if (problems.length) $('#meta').insertAdjacentHTML('beforeend', `<span class="status bad">${esc(problems.join('; '))}</span>`);
  if (S.spec.d) openDataset(S.spec.d);
}
init();
