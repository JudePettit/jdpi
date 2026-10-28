// Integration Hub page (Digital Science). State lives in the URL hash (#tab=catalogue&q=…&m=rt&ds=<id>) so the shell
// and links can open any view; the page re-renders on hashchange. Everything from data is escaped or set as text.
// The tool list and the "Try a tool" console use the MCP server's own code (mcp/prp-mcp.mjs) on this site's files.
import { createPRP, EVENT_TYPES } from './mcp/prp-mcp.mjs';

const SITE = 'https://jdpi.pages.dev/';
const ROOT = new URL('../', import.meta.url).href; // the site root this page is served from
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-GB');
const fmtDate = d => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');
const MODULES = { rt: ['RT', 'Realtime Intelligence'], rs: ['RS', 'Retrospective Intelligence'], oi: ['OI', 'Offensive Intelligence'], mm: ['MM', 'Money Management'], ns: ['NS', 'Natural Science'], ds: ['DS', 'Digital Science'], kino: ['KN', 'Kino'] };
const TABS = ['overview', 'catalogue', 'mcp', 'api', 'feeds', 'skills', 'security'];

/* ------------------------------------------------------------------ state in the hash */
const state = { tab: 'overview', q: '', m: '', ds: '' };
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  state.tab = TABS.includes(p.get('tab')) ? p.get('tab') : (location.hash === '#mcp' || location.hash === '#api' ? location.hash.slice(1) : 'overview');
  state.q = p.get('q') || ''; state.m = MODULES[p.get('m')] ? p.get('m') : ''; state.ds = p.get('ds') || '';
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.tab !== 'overview') p.set('tab', state.tab);
  if (state.tab === 'catalogue') { if (state.q) p.set('q', state.q); if (state.m) p.set('m', state.m); if (state.ds) p.set('ds', state.ds); }
  const h = p.toString() ? '#' + p.toString() : '';
  if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
}
const setState = patch => { Object.assign(state, patch); writeHash(); render(); };

/* ------------------------------------------------------------------ tabs */
const tabs = TABS.map(t => document.getElementById('tab-' + t));
function showTab() {
  TABS.forEach((t, i) => { const on = t === state.tab; tabs[i].setAttribute('aria-selected', String(on)); tabs[i].tabIndex = on ? 0 : -1; document.getElementById('panel-' + t).hidden = !on; });
}
tabs.forEach((b, i) => {
  b.addEventListener('click', () => setState({ tab: TABS[i] }));
  b.addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    const j = k === -Infinity ? 0 : k === Infinity ? TABS.length - 1 : (i + k + TABS.length) % TABS.length;
    tabs[j].focus(); setState({ tab: TABS[j] });
  });
});
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { setState({ tab: b.dataset.go }); document.getElementById('tab-' + b.dataset.go).focus(); }));

/* ------------------------------------------------------------------ copy buttons */
document.addEventListener('click', async e => {
  const b = e.target.closest('.copy'); if (!b) return;
  const t = document.getElementById(b.dataset.copy)?.textContent || '';
  try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; } catch { const r = document.createRange(); r.selectNodeContents(document.getElementById(b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selected'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1600);
});

/* ------------------------------------------------------------------ data */
let CAT = null, REG = null;
const subName = id => { for (const s of REG?.suites || []) for (const m of s.modules) if (m.id === id) return m.name; return id; };
const files = d => d.urls || [d.url];
const rel = u => ROOT + u; // a site path → a link on this site

async function load() {
  const [cat, reg] = await Promise.all([fetch(new URL('catalog.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('catalogue ' + r.status); return r.json(); }), fetch(ROOT + 'registry.json').then(r => r.json()).catch(() => null)]);
  CAT = cat; REG = reg;
  const rows = cat.datasets.reduce((a, d) => a + d.rows, 0);
  const mods = new Set(cat.datasets.map(d => d.module));
  $('#meta').innerHTML = [`<span>Catalogue built <b>${esc(fmtDate(cat.generated))}</b></span>`, `<span><b>${cat.datasets.length}</b> datasets</span>`, `<span><b>${nf.format(rows)}</b> rows</span>`,
    `<span>Modules <b>${mods.size}</b></span>`, '<span>Access <b>read-only · no keys</b></span>'].join('');
  $('#kpis').innerHTML = [['Datasets', cat.datasets.length, 'described in one catalogue'], ['Rows', nf.format(rows), 'across every dataset'], ['MCP tools', prp.tools.length, 'read-only'], ['Modules covered', mods.size, 'of PRP\'s six'], ['Keys needed', 0, 'all public']]
    .map(([l, v, s]) => `<div class="prp-kpi"><span>${esc(l)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('');
  buildChips(); renderFeeds(); renderIcs(); render();
}

/* ------------------------------------------------------------------ catalogue */
function buildChips() {
  const count = m => CAT.datasets.filter(d => !m || d.module === m).length;
  const chip = (m, label) => `<button type="button" class="prp-chip${state.m === m ? ' on' : ''}" data-m="${esc(m)}" aria-pressed="${state.m === m}">${esc(label)} <span class="n">${count(m)}</span></button>`;
  $('#cat-m').innerHTML = chip('', 'All') + Object.entries(MODULES).filter(([m]) => count(m)).map(([m, [code]]) => chip(m, code)).join('');
}
$('#cat-m').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) setState({ m: b.dataset.m, ds: '' }); });
let qTimer;
$('#cat-q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => setState({ q: e.target.value.trim() }), 180); });
$('#cat-rows').addEventListener('click', e => { const b = e.target.closest('[data-ds]'); if (b) setState({ ds: state.ds === b.dataset.ds ? '' : b.dataset.ds }); });

const fold = s => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
function renderCatalogue() {
  if (!CAT) return;
  if ($('#cat-q').value !== state.q && document.activeElement !== $('#cat-q')) $('#cat-q').value = state.q;
  buildChips();
  const words = fold(state.q).split(/\s+/).filter(Boolean);
  const list = CAT.datasets.filter(d => (!state.m || d.module === state.m) && (!words.length || words.every(w => fold([d.id, d.title, d.description, subName(d.submodule), d.licence, ...d.sources, ...d.fields.map(f => f.name + ' ' + f.description)].join(' ')).includes(w))));
  $('#cat-count').textContent = `${list.length} of ${CAT.datasets.length} datasets`;
  if (!list.length) { $('#cat-rows').innerHTML = '<tr><td colspan="8" class="prp-empty">No dataset matches. Clear the search or pick All.</td></tr>'; return; }
  $('#cat-rows').innerHTML = list.map(d => {
    const [code, mod] = MODULES[d.module] || [d.module, d.module];
    const open = state.ds === d.id;
    const f = files(d);
    const lic = d.licence.length > 70 ? d.licence.slice(0, 68).replace(/\s+\S*$/, '') + '…' : d.licence;
    const row = `<tr>
      <td><button type="button" class="ds-name" data-ds="${esc(d.id)}" aria-expanded="${open}" aria-controls="det-${esc(d.id)}">${esc(d.title)}</button><div class="id">${esc(d.id)}</div></td>
      <td><span class="mod"><span class="prp-code" data-suite="${esc(d.module)}" title="${esc(mod)}">${esc(code)}</span></span><span class="sub">${esc(subName(d.submodule))}</span></td>
      <td class="num">${nf.format(d.rows)}</td><td class="num">${d.fields.length}</td>
      <td class="when">${esc(fmtDate(d.updated))}</td><td>${esc(d.refresh)}</td><td class="lic" title="${esc(d.licence)}">${esc(lic)}</td>
      <td><span class="links"><a href="${esc(rel(f[0]))}">JSON${f.length > 1 ? ` <span class="prp-muted">×${f.length}</span>` : ''}</a><a href="${esc(SITE)}api/v1/datasets/${esc(d.id)}/rows?limit=5">API</a>${d.page ? `<a href="${esc(/^https?:/.test(d.page) ? d.page : rel(d.page))}">Page</a>` : ''}</span></td></tr>`;
    return row + (open ? detail(d) : '');
  }).join('');
}
function detail(d) {
  const f = files(d);
  return `<tr class="detail" id="det-${esc(d.id)}"><td colspan="8"><div class="detail-grid">
    <div><p>${esc(d.description)}</p>
      <table class="fields"><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Meaning</th></tr></thead><tbody>
      ${d.fields.map(x => `<tr><td>${esc(x.name)}</td><td class="type">${esc(x.type)}</td><td>${esc(x.description)}</td></tr>`).join('')}</tbody></table></div>
    <div><dl>
      <dt>Rows</dt><dd>${nf.format(d.rows)}</dd><dt>Records</dt><dd><code>${esc(d.records || '(the file is the array)')}</code></dd>
      <dt>Files</dt><dd>${f.slice(0, 6).map(u => `<a href="${esc(rel(u))}">${esc(u)}</a>`).join('<br>')}${f.length > 6 ? `<br><span class="prp-muted">and ${f.length - 6} more shards</span>` : ''}</dd>
      <dt>Size</dt><dd>${d.bytes ? esc((d.bytes / 1048576).toFixed(d.bytes > 1048576 ? 1 : 2) + ' MB') : '–'}</dd>
      <dt>Updated</dt><dd>${esc(fmtDate(d.updated))} · ${esc(d.refresh)}</dd><dt>Licence</dt><dd>${esc(d.licence)}</dd>
      ${d.derivedFrom ? `<dt>Built from</dt><dd>${d.derivedFrom.map(x => `<code>${esc(x)}</code>`).join(' ')}</dd>` : ''}
      <dt>API</dt><dd><a href="${esc(SITE)}api/v1/datasets/${esc(d.id)}">/api/v1/datasets/${esc(d.id)}</a></dd>
    </dl><p style="margin-top:12px"><b>Sources</b></p><ul>${d.sources.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
  </div></td></tr>`;
}

/* ------------------------------------------------------------------ MCP tools and the try-it console */
const prp = createPRP({ origin: ROOT, read: async path => { const r = await fetch(ROOT + path); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); if ((r.headers.get('content-type') || '').includes('text/html')) return null; return r.text(); } });
const EXAMPLES = {
  list_datasets: { module: 'rt' }, describe_dataset: { id: 'realtime-wars' },
  query_dataset: { id: 'realtime-wars', where: { zone: 'Africa' }, select: ['name', 'deaths', 'status'], sort: '-deaths', limit: 5 },
  search_encyclopaedia: { query: 'Mearsheimer' }, get_entity: { qid: 'Q8663', mentions: 5 }, upcoming_events: { type: ['election', 'referendum'], limit: 10 },
  latest_briefing: { briefing: 'scientific', topic: 'space', limit: 5 }, country_profile: { country: 'Japan' }, list_submodules: { module: 'ds' }
};
function renderTools() {
  $('#tool-count').textContent = `${prp.tools.length} tools · all read-only`;
  $('#tool-rows').innerHTML = prp.tools.map(t => { const req = new Set(t.inputSchema.required); return `<tr><td>${esc(t.name)}</td><td>${esc(t.description)}</td><td><span class="args">${Object.keys(t.inputSchema.properties).map(k => `<span class="arg${req.has(k) ? ' req' : ''}" title="${esc(t.inputSchema.properties[k].description || '')}">${esc(k)}${req.has(k) ? '' : '?'}</span>`).join('') || '<span class="prp-muted">none</span>'}</span></td></tr>`; }).join('');
  $('#try-tool').innerHTML = prp.tools.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  $('#try-tool').value = 'query_dataset';
  $('#try-args').value = JSON.stringify(EXAMPLES.query_dataset, null, 1);
}
$('#try-tool').addEventListener('change', e => { $('#try-args').value = JSON.stringify(EXAMPLES[e.target.value] || {}, null, 1); $('#try-out').textContent = ''; $('#try-status').textContent = ''; });
$('#try-run').addEventListener('click', async () => {
  let a;
  try { a = JSON.parse($('#try-args').value || '{}'); } catch { $('#try-status').textContent = 'The arguments are not valid JSON.'; return; }
  $('#try-status').textContent = 'Running…'; $('#try-run').disabled = true;
  const t0 = performance.now();
  const res = await prp.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: $('#try-tool').value, arguments: a } });
  const ms = Math.round(performance.now() - t0);
  $('#try-run').disabled = false;
  const r = res.result || res;
  $('#try-status').textContent = r.isError ? `Tool error (${ms} ms): fix the arguments and run again.` : `Done in ${ms} ms · ${nf.format(JSON.stringify(r.structuredContent || r).length)} characters`;
  $('#try-out').textContent = JSON.stringify(r.structuredContent ?? r, null, 2);
});

/* ------------------------------------------------------------------ JSON API */
const API = [
  ['/api/v1/catalog', 'The full catalogue (?module=rt).', 'api/v1/catalog?module=ns'],
  ['/api/v1/datasets', 'Datasets in brief (?module=, ?q=).', 'api/v1/datasets?q=election'],
  ['/api/v1/datasets/{id}', 'Fields, licence, sources, shards and a sample.', 'api/v1/datasets/realtime-wars'],
  ['/api/v1/datasets/{id}/rows', 'Filtered, sorted, paged rows.', 'api/v1/datasets/political-calendar/rows?f.country=Chile&f.date.gte=2020-01-01&sort=-date&limit=5'],
  ['/api/v1/search?q=', 'Encyclopaedia search by name (&type=, &limit=).', 'api/v1/search?q=Mearsheimer'],
  ['/api/v1/entities/{qid}', 'An Encyclopaedia entry (or ?title=).', 'api/v1/entities/Q8663'],
  ['/api/v1/events', 'Political calendar (?country=, &type=, &from=, &to=, &q=).', 'api/v1/events?country=France&type=election'],
  ['/api/v1/briefings/{briefing}', 'Latest items: intelligence, scientific, economics, digital.', 'api/v1/briefings/scientific?topic=physics&type=paper'],
  ['/api/v1/countries/{country}', 'One country across PRP (name or ISO code).', 'api/v1/countries/FRA'],
  ['/api/v1/submodules', 'PRP\'s pages by module.', 'api/v1/submodules?module=ns'],
  ['/api/v1/feeds/{briefing}.rss', 'RSS 2.0 (or .json for JSON Feed 1.1).', 'api/v1/feeds/economics.rss?topic=monetary'],
  ['/api/v1/calendar.ics', 'iCalendar of political events, filterable.', 'api/v1/calendar.ics?country=Germany&type=election,referendum']
];
function renderApi() { $('#api-rows').innerHTML = API.map(([r, d, ex]) => `<tr><td><code>GET ${esc(r)}</code></td><td>${esc(d)}</td><td class="ex"><a href="${esc(SITE + ex)}">${esc('/' + ex)}</a></td></tr>`).join(''); }

/* ------------------------------------------------------------------ feeds and calendars */
const BRIEF = [['intelligence', 'Intelligence Briefing', 'intelligence-briefing-stories'], ['scientific', 'Scientific Briefing', 'science-briefing-stories'], ['economics', 'Economics Briefing', 'econ-briefing-stories'], ['digital', 'Digital Briefing', 'digital-briefing-stories']];
function topicsOf(id) {
  const d = CAT.datasets.find(x => x.id === id); if (!d) return null;
  const f = d.fields.find(x => ['disciplines', 'fields', 'topics', 'areas'].includes(x.name));
  const m = f && /\(([^)]+)\)/.exec(f.description); return m ? m[1].split(',').map(s => s.trim()) : [];
}
function renderFeeds() {
  $('#feed-rows').innerHTML = BRIEF.map(([key, name, ds]) => {
    const topics = key === 'intelligence' ? null : topicsOf(ds);
    const live = key === 'intelligence' || topics !== null;
    const rss = `${SITE}api/v1/feeds/${key}.rss`, jf = `${SITE}api/v1/feeds/${key}.json`;
    return `<tr><td><b>${esc(name)}</b>${live ? '' : ' <span class="prp-status" data-status="in-build">in build</span>'}</td><td><a href="${esc(rss)}">${esc('/api/v1/feeds/' + key + '.rss')}</a></td><td><a href="${esc(jf)}">${esc('/api/v1/feeds/' + key + '.json')}</a></td>
      <td>${key === 'intelligence' ? 'Add <code>?position=</code> far_left, left, centre, right or far_right' : topics?.length ? topics.map(t => `<code>${esc(t)}</code>`).join(' ') : 'When the Digital Briefing is published'}</td></tr>`;
  }).join('');
}
async function renderIcs() {
  const cal = CAT.datasets.find(d => d.id === 'political-calendar');
  const decades = (cal?.urls || []).map(u => /(\d{4}s)\.json$/.exec(u)?.[1]).filter(Boolean);
  const items = [['realtime-calendar.ics', 'Realtime Calendar', 'six months back to eighteen months ahead'], ...decades.map(d => [`historical-calendar-${d}.ics`, `Historical Calendar · ${d}`, `every event of the ${d}`])];
  $('#ics-files').innerHTML = items.map(([f, name, what]) => { const url = `${SITE}integration/feeds/${f}`; return `<li><b>${esc(name)}</b><span class="size">${esc(what)}</span><span class="acts"><a href="${esc(url.replace(/^https:/, 'webcal:'))}">Subscribe</a><a href="${esc(rel('integration/feeds/' + f))}" download>Download</a></span></li>`; }).join('');
  $('#ics-types').innerHTML = Object.entries(EVENT_TYPES).map(([k, label]) => `<button type="button" class="prp-chip" data-t="${esc(k)}" aria-pressed="false">${esc(label)}</button>`).join('');
  try { const idx = await fetch(ROOT + 'integration/data/countries/index.json').then(r => r.json()); $('#ics-countries').innerHTML = idx.countries.map(c => `<option value="${esc(c.name)}">`).join(''); } catch { /* the list is a convenience */ }
  updateIcs();
}
const icsTypes = new Set();
$('#ics-types').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; if (icsTypes.has(b.dataset.t)) icsTypes.delete(b.dataset.t); else icsTypes.add(b.dataset.t); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(icsTypes.has(b.dataset.t))); updateIcs(); });
$('#ics-country').addEventListener('input', () => updateIcs());
function updateIcs() {
  const p = new URLSearchParams();
  const c = $('#ics-country').value.trim(); if (c) p.set('country', c);
  if (icsTypes.size) p.set('type', [...icsTypes].join(','));
  const url = `${SITE}api/v1/calendar.ics${p.toString() ? '?' + p.toString() : ''}`;
  $('#ics-url').textContent = url;
  $('#ics-subscribe').href = url.replace(/^https:/, 'webcal:');
  $('#ics-open').href = url;
}

/* ------------------------------------------------------------------ render */
function render() { showTab(); if (state.tab === 'catalogue') renderCatalogue(); }
readHash(); renderTools(); renderApi(); render();
window.addEventListener('hashchange', () => { readHash(); render(); });
load().catch(() => { $('#meta').innerHTML = '<span>The catalogue could not be loaded. Try again shortly.</span>'; $('#cat-rows').innerHTML = '<tr><td colspan="8" class="prp-empty">The catalogue could not be loaded.</td></tr>'; });
