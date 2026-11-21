// OSINT Dashboard · Organisations & sanctions: legal entities, registry numbers and corporate parents from the GLEIF API
// (keyless, CORS-enabled; sole traders are left out because they are individuals), Vitruvian Manager's own sanctions
// index (data/sanctions-index.json: the companies, organisations and ships on the EU's and the UK's official lists, no
// people, searched in this browser), sanctions screening with the user's own OpenSanctions key (kept in this browser,
// sent only to api.opensanctions.org), and link-outs to company registries and the official sanctions lists.
import {
  esc, isLei, gleifSearchUrl, gleifRecordUrl, summariseLei, filterLeiResults, EXCEPTION_REASONS, RELATIONSHIPS,
  OS_SCHEMAS, osSearchUrl, osWebUrl, summariseSanctions, orgLinks, dayLabel, isoDay, utcLabel,
  SANCTIONS_INDEX_URL, sanctionsSearch, sanctionsRow, sanctionsListLines, SX_VIA_NOTE,
} from './lib.js';
import { $, fetchData, failText, copyText, settings, num, extLink } from './ui.js';
import { figureHtml } from './md.js';

const EXAMPLES = ['Ryanair', 'Maersk', 'Sovcomflot', 'Rosneft'];
const KEY_STORE = 'prp.osint.opensanctions.key';
const cache = new Map();
let panelEl, ctxRef, results = [], selected = '', query = '', osKey = '', run = 0;

const get = async url => { if (cache.has(url)) return cache.get(url); const r = await fetchData(url, { timeout: 25000 }); if (r.ok || r.status === 404) cache.set(url, r); return r; };

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx;
  const form = $('#org-form', panel);
  $('#org-examples', panel).insertAdjacentHTML('beforeend', EXAMPLES.map(n => `<button type="button" class="prp-chip" data-n="${n}">${n}</button>`).join(''));
  $('#org-examples', panel).addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { form.q.value = b.dataset.n; search(); } });
  form.addEventListener('submit', e => { e.preventDefault(); search(); });
  $('#org-results', panel).addEventListener('click', e => { const b = e.target.closest('[data-lei]'); if (b) select(b.dataset.lei); });
  // OpenSanctions key: in memory, and in localStorage only if the user ticks "Remember".
  try { osKey = localStorage.getItem(KEY_STORE) || ''; } catch { osKey = ''; }
  const keyInput = $('#os-key', panel), remember = $('#os-remember', panel);
  keyInput.value = osKey; remember.checked = !!osKey;
  $('#os-schema', panel).innerHTML = Object.entries(OS_SCHEMAS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  $('#os-schema', panel).value = OS_SCHEMAS[settings.get('osSchema')] ? settings.get('osSchema') : 'Organization';
  $('#os-schema', panel).addEventListener('change', e => settings.set('osSchema', e.target.value));
  const keep = () => {
    osKey = keyInput.value.trim();
    try { if (remember.checked && osKey) localStorage.setItem(KEY_STORE, osKey); else localStorage.removeItem(KEY_STORE); } catch { /* storage blocked: memory only */ }
    keyState();
  };
  keyInput.addEventListener('change', keep);
  remember.addEventListener('change', keep);
  $('#os-forget', panel).addEventListener('click', () => { keyInput.value = ''; remember.checked = false; keep(); $('#os-out', panel).innerHTML = ''; });
  $('#os-search', panel).addEventListener('click', () => { keep(); screen(query || form.q.value.trim()); });
  keyState();
  // VM's own sanctions index: one file, searched in this browser.
  $('#sx-form', panel).addEventListener('submit', e => { e.preventDefault(); sxSearch($('#sx-form', panelEl).q.value.trim()); });
  $('#sx-out', panel).addEventListener('click', e => { const b = e.target.closest('[data-sx]'); if (b) sxAdd(+b.dataset.sx); });
  loadIndex().catch(() => {});
  renderLinks('');
  if (ctx.state.q) { form.q.value = ctx.state.q; search(); }
}
export function show(state) {
  if (state.q && state.q !== query) { $('#org-form', panelEl).q.value = state.q; search(); }
}

function keyState() {
  let remembered = false;
  try { remembered = !!localStorage.getItem(KEY_STORE); } catch { /* storage blocked */ }
  $('#os-key-state', panelEl).textContent = osKey ? 'Key set' + (remembered ? ' · remembered here' : ' · this visit only') : 'Needs your key';
}

function renderLinks(q) {
  const links = orgLinks(q);
  let group = '';
  $('#org-links', panelEl).innerHTML = links.map(l => {
    const head = l.group !== group ? `<h3>${esc((group = l.group))}</h3>` : '';
    return `${head}<a class="lcard" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" data-copy="${l.copy ? '1' : ''}"><b>${esc(l.name)}</b><span>${esc(l.desc)}</span>${l.copy && q ? '<em>Opens the search page: the name is copied for you to paste</em>' : ''}<span class="sr-only"> (opens in a new tab)</span></a>`;
  }).join('');
  $('#org-links', panelEl).onclick = e => { const a = e.target.closest('a[data-copy="1"]'); if (a && query) navigator.clipboard?.writeText(query).catch(() => {}); };
  $('#os-web', panelEl).href = osWebUrl(q);
}

async function search() {
  const form = $('#org-form', panelEl);
  const q = form.q.value.trim();
  if (!q) return;
  query = q; selected = '';
  const me = ++run;
  ctxRef.setParam({ q });
  ctxRef.log({ kind: 'lookup', text: `Organisation search (GLEIF): ${q}`, url: gleifSearchUrl(q) });
  renderLinks(q);
  $('#sx-form', panelEl).q.value = q; sxSearch(q, { log: false });
  const list = $('#org-results', panelEl);
  list.innerHTML = '<div class="loading">Searching the LEI register…</div>';
  if (isLei(q)) {
    const r = await get(gleifRecordUrl(q.toUpperCase()));
    if (me !== run) return;
    if (!r.ok) { list.innerHTML = `<div class="panel-msg bad">${esc(failText(r, 'GLEIF'))}</div>`; return; }
    results = [summariseLei(r.json.data)];
    renderResults({ total: 1, hidden: 0 });
    select(results[0].lei);
    return;
  }
  const r = await get(gleifSearchUrl(q, 25));
  if (me !== run) return;
  if (!r.ok) { list.innerHTML = `<div class="panel-msg bad">${esc(failText(r, 'GLEIF'))}</div>`; $('#org-count', panelEl).textContent = 'Error'; return; }
  const f = filterLeiResults(r.json);
  results = f.shown;
  renderResults(f);
  if (results.length) select(results[0].lei);
  else $('#org-detail', panelEl).innerHTML = '<p class="prp-empty">No entity to show.</p>';
}

function renderResults(f) {
  $('#org-count', panelEl).textContent = `${num(f.total)} match${f.total === 1 ? '' : 'es'}${f.total > results.length + f.hidden ? `, first ${num(results.length + f.hidden)} shown` : ''}`;
  if (!results.length) {
    $('#org-results', panelEl).innerHTML = `<p class="prp-empty">No legal entities found${f.hidden ? ` (${f.hidden} sole trader record${f.hidden === 1 ? ' was' : 's were'} left out)` : ''}. Most small private companies have no LEI: try the company registries below.</p>`;
    return;
  }
  $('#org-results', panelEl).innerHTML = `<ul class="result-list">${results.map(x => `<li><button type="button" data-lei="${esc(x.lei)}" aria-pressed="${x.lei === selected}"><span class="nm">${esc(x.name)}</span><span class="badge${x.status === 'ACTIVE' ? '' : ' warn'}">${esc(x.status === 'ACTIVE' ? x.jurisdiction || x.country : x.status.toLowerCase())}</span><span class="sub">${esc([x.categoryLabel, x.city, x.country, x.lei].filter(Boolean).join(' · '))}</span></button></li>`).join('')}</ul>
    ${f.hidden ? `<div class="panel-foot">${num(f.hidden)} sole-trader record${f.hidden === 1 ? '' : 's'} left out: they describe individuals.</div>` : ''}
    <div class="panel-foot">An LEI identifies a legal entity that trades in financial markets. Most small private companies don’t have one; their registry is the place to look.</div>`;
}

async function select(lei) {
  selected = lei;
  for (const b of panelEl.querySelectorAll('[data-lei]')) b.setAttribute('aria-pressed', String(b.dataset.lei === lei));
  const box = $('#org-detail', panelEl), me = run;
  box.innerHTML = '<div class="loading">Reading the record and its parents…</div>';
  let x = results.find(r => r.lei === lei);
  if (!x) { const r = await get(gleifRecordUrl(lei)); if (!r.ok) { box.innerHTML = `<div class="panel-msg bad">${esc(failText(r, 'GLEIF'))}</div>`; return; } x = summariseLei(r.json.data); }
  $('#org-detail-title', panelEl).textContent = x.name;
  const L = x.links || {}, none = Promise.resolve(null);
  const [dp, up, dpx, upx, kids, form, ra] = await Promise.all([
    L.directParent ? get(L.directParent) : none, L.ultimateParent ? get(L.ultimateParent) : none,
    L.directException ? get(L.directException) : none, L.ultimateException ? get(L.ultimateException) : none,
    L.children ? get(L.children + (L.children.includes('?') ? '&' : '?') + 'page%5Bsize%5D=10') : none,
    x.legalForm ? get(`https://api.gleif.org/api/v1/entity-legal-forms/${encodeURIComponent(x.legalForm)}`) : null,
    x.registeredAt && !x.registry ? get(`https://api.gleif.org/api/v1/registration-authorities/${encodeURIComponent(x.registeredAt)}`) : null,
  ]);
  if (selected !== lei || me !== run) return;
  const parent = dp?.ok && dp.json?.data ? summariseLei(dp.json.data) : null;
  const ultimate = up?.ok && up.json?.data ? summariseLei(up.json.data) : null;
  const reason = r => (r?.ok && r.json?.data?.attributes?.reason ? EXCEPTION_REASONS[r.json.data.attributes.reason] || r.json.data.attributes.reason : '');
  const children = kids?.ok ? (kids.json.data || []).map(summariseLei) : [];
  const childTotal = kids?.ok ? kids.json.meta?.pagination?.total ?? children.length : 0;
  const formName = form?.ok ? (form.json.data.attributes.names || []).find(n => n.languageCode === 'en')?.localName || form.json.data.attributes.names?.[0]?.localName : '';
  const raName = ra?.ok ? ra.json.data.attributes.internationalOrganizationName || ra.json.data.attributes.internationalName : '';
  const registry = x.registry ? `${extLink(x.registry.url, x.registry.name)}, number <span class="mono">${esc(x.registeredAs)}</span>` : x.registeredAs ? `${esc(raName || x.registeredAt)}, number <span class="mono">${esc(x.registeredAs)}</span>` : '—';
  // The ownership chain as a figure: this entity, its direct parent, its ultimate parent (or why none is reported).
  const lines = ['label: Accounting consolidation chain reported to GLEIF', `caption: Corporate parents of ${x.name} as reported to GLEIF: an arrow means “is consolidated in the accounts of”. Accounting parents are not the same as beneficial owners, who are people and are not named here. Source: GLEIF Level 2 data (CC0).`];
  lines.push(`- [accent] ${x.name} | ${[x.jurisdiction, 'this entity'].filter(Boolean).join(' · ')}`);
  if (parent) lines.push(`- ${parent.name} | direct parent · ${parent.jurisdiction}`);
  else lines.push(`- [dashed] No direct parent reported | ${reason(dpx) || 'no reason given'}`);
  if (ultimate && ultimate.lei !== parent?.lei) lines.push(`- ${ultimate.name} | ultimate parent · ${ultimate.jurisdiction}`);
  else if (!ultimate && parent) lines.push(`- [dashed] No ultimate parent reported | ${reason(upx) || 'the direct parent may be the top'}`);
  const kv = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  box.innerHTML = `<div class="org-detail-body">
    <dl class="kv">
      ${kv('Legal name', `<b>${esc(x.name)}</b>${x.otherNames.length ? `<span class="sub">Also: ${esc(x.otherNames.join('; '))}</span>` : ''}`)}
      ${kv('LEI', `<span class="mono">${esc(x.lei)}</span> <button type="button" class="prp-btn sm ghost" id="org-copy-lei">Copy</button>`)}
      ${kv('Status', `<span class="badge${x.status === 'ACTIVE' ? ' good' : ' warn'}">${esc(x.status.toLowerCase())}</span>${x.successor ? `<span class="sub">Successor: ${esc(x.successor)}</span>` : ''}`)}
      ${kv('Kind', esc([x.categoryLabel, formName].filter(Boolean).join(' · ')))}
      ${kv('Jurisdiction', esc(x.jurisdiction))}
      ${kv('Registered with', registry)}
      ${kv('Founded', x.created ? esc(dayLabel(x.created)) : '')}
      ${kv('Legal address', esc(x.legalAddress))}
      ${x.hqAddress && x.hqAddress !== x.legalAddress ? kv('Headquarters', esc(x.hqAddress)) : ''}
      ${kv('LEI record', esc([x.regStatus && `${x.regStatus.toLowerCase()}`, x.corroboration && x.corroboration.replace(/_/g, ' ').toLowerCase(), x.lastUpdate && `updated ${dayLabel(x.lastUpdate)}`, x.nextRenewal && `renewal due ${dayLabel(x.nextRenewal)}`].filter(Boolean).join(' · ')))}
      ${x.bic ? kv('BIC', `<span class="mono">${esc(x.bic)}</span>`) : ''}
    </dl>
    <div><h3>Ownership chain</h3>${figureHtml('flow', lines, { n: 1, id: 'org-chain', width: Math.min(960, 250 * (lines.length - 2)) })}</div>
    ${childTotal ? `<div><h3>Directly consolidated subsidiaries (${num(childTotal)})</h3><ul class="result-list">${children.map(c => `<li><button type="button" data-lei="${esc(c.lei)}" aria-pressed="false"><span class="nm">${esc(c.name)}</span><span class="badge">${esc(c.jurisdiction)}</span><span class="sub">${esc(c.lei)}</span></button></li>`).join('')}</ul>${childTotal > children.length ? `<p class="small muted">${num(childTotal - children.length)} more on ${extLink(x.page, 'GLEIF’s page')}.</p>` : ''}</div>` : ''}
    <div class="btn-row">${extLink(x.page, 'Open on GLEIF', 'prp-btn sm')}${x.opencorporates ? extLink(x.opencorporates, 'OpenCorporates', 'prp-btn sm') : ''}${x.registry ? extLink(x.registry.url, 'Registry', 'prp-btn sm') : ''}<button type="button" class="prp-btn sm" id="org-screen">Screen sanctions</button><button type="button" class="prp-btn sm primary" id="org-add">Add to the notebook</button></div>
  </div>`;
  box.querySelector('.result-list')?.addEventListener('click', e => { const b = e.target.closest('[data-lei]'); if (b) select(b.dataset.lei); });
  $('#org-copy-lei', panelEl).onclick = () => copyText(x.lei, 'LEI copied');
  $('#org-screen', panelEl).onclick = () => { $('#os-panel', panelEl).scrollIntoView({ behavior: 'smooth', block: 'start' }); screen(x.name); };
  $('#org-add', panelEl).onclick = () => ctxRef.addToNotebook({
    claim: `${x.name} (LEI ${x.lei}) is registered in ${x.jurisdiction || x.country}${x.registeredAs ? ` as number ${x.registeredAs}` : ''}; ${parent ? `its direct accounting parent is ${parent.name} (${parent.lei})` : `no direct parent is reported (${reason(dpx) || 'no reason given'})`}${ultimate && ultimate.lei !== parent?.lei ? `, ultimate parent ${ultimate.name}` : ''}.`,
    url: x.page, accessed: isoDay(), tags: ['company', 'GLEIF'],
    notes: `GLEIF record ${x.regStatus.toLowerCase()}, ${x.corroboration.replace(/_/g, ' ').toLowerCase()}, last updated ${dayLabel(x.lastUpdate)}. Read in the OSINT Dashboard on ${utcLabel(new Date())}.`,
  });
}

/* ---- VM's sanctions index (data/sanctions-index.json): companies, organisations and ships on the EU and UK lists ---- */
let sxIndex = null, sxLoading = null, sxHits = [], sxQuery = '';
const SX_TONE = { ok: '', warn: ' warn', bad: ' bad', info: ' info' };

function loadIndex() {
  sxLoading ||= fetchData(SANCTIONS_INDEX_URL, { timeout: 30000 }).then(r => {
    if (!r.ok || !Array.isArray(r.json?.records) || !r.json.lists) {
      sxLoading = null;
      $('#sx-dates', panelEl).innerHTML = `<p class="prp-note bad small">Vitruvian Manager’s sanctions index could not be loaded (${esc(r.ok || r.kind === 'parse' ? 'its file could not be read' : r.kind === 'http' ? `the site answered HTTP ${r.status}` : r.kind === 'timeout' ? 'it took too long to arrive' : 'the connection failed')}). Nothing can be searched here until it loads: reload the page, or search the official lists below.</p>`;
      $('#sx-state', panelEl).textContent = 'Could not be loaded';
      throw new Error('index');
    }
    sxIndex = r.json;
    renderDates();
    return sxIndex;
  });
  return sxLoading;
}

function renderDates() {
  const lines = sanctionsListLines(sxIndex);
  const read = lines.filter(l => l.tone !== 'info'), out = lines.filter(l => l.tone === 'info');
  $('#sx-dates', panelEl).innerHTML = `<h3 class="sx-h">When each list was read</h3><ul class="sx-lines">${read.map(l => `<li class="${l.tone === 'ok' ? '' : 'sx-' + l.tone}">${l.tone === 'ok' ? '' : `<span class="badge${SX_TONE[l.tone]}">${l.tone === 'warn' ? 'Not updated' : 'Failed'}</span> `}${esc(l.text)}</li>`).join('')}</ul>
    <ul class="sx-lines sx-left">${out.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>`;
  const bad = read.filter(l => l.tone !== 'ok').length;
  $('#sx-state', panelEl).textContent = bad ? `${bad} list${bad === 1 ? '' : 's'} not updated · no people` : `${num(sxIndex.records.length)} records · no people`;
}

async function sxSearch(q, { log = true } = {}) {
  const out = $('#sx-out', panelEl);
  sxQuery = q;
  if (!q) { out.innerHTML = '<p class="small error-text">Type a company, organisation or ship’s name, a list’s reference or an IMO number.</p>'; return; }
  if (!sxIndex) {
    out.innerHTML = '<div class="loading">Loading the index…</div>';
    try { await loadIndex(); } catch { out.innerHTML = ''; return; }
    if (sxQuery !== q) return;
  }
  if (log) ctxRef.log({ kind: 'lookup', text: `Vitruvian Manager’s sanctions index (EU and UK lists): ${q}` });
  const s = sanctionsSearch(sxIndex, q, { limit: 50 });
  sxHits = s.results;
  const stale = sanctionsListLines(sxIndex).filter(l => l.tone === 'warn' || l.tone === 'bad');
  const caveat = stale.length ? ` <b>${esc(stale.map(l => l.text.split(':')[0]).join(' and '))} ${stale.length === 1 ? 'was' : 'were'} not updated at the last read: see the dates above.</b>` : '';
  if (!s.total) {
    out.innerHTML = `<div class="prp-note small">No company, organisation or ship matching “${esc(q)}” in this index. That clears no one: check spellings, transliterations and former names, and search the official lists.${caveat}</div>`;
    return;
  }
  const rows = s.results.map((h, i) => {
    const r = sanctionsRow(h.rec, sxIndex.lists);
    const ship = [r.imo && `IMO ${r.imo}`, r.flag && `flag ${r.flag}`, r.reg && `registration ${r.reg}`].filter(Boolean).join(' · ');
    // A match through an alias alone may be a search for a person whose name an organisation carries: say plainly
    // that this row is the organisation's, and where a person is searched.
    return `<tr><td><b>${esc(r.name)}</b>${h.via ? `<span class="sub">Matched the alias “${esc(h.via)}”</span><span class="sub sx-via">${esc(SX_VIA_NOTE)}</span>` : ''}${r.aliases.length ? `<span class="sub">${num(r.aliases.length)} other name${r.aliases.length === 1 ? '' : 's'} on the list</span>` : ''}</td>
      <td data-label="List">${esc(r.list)}<span class="sub">${esc(r.type)}</span></td>
      <td data-label="Programme or regime">${esc(r.regime || '—')}</td>
      <td data-label="Date listed" class="mono">${r.listed ? esc(r.listed) : `<span class="sub">${esc(r.listedNote)}</span>`}</td>
      <td data-label="Reference" class="mono">${esc(r.ref)}</td>
      <td data-label="Country">${esc(r.country || '—')}</td>
      <td data-label="Ship" class="mono">${esc(ship || '—')}</td>
      <td data-label="Official record">${r.links.map(l => extLink(l.href, l.label)).join('<br>') || '—'}</td>
      <td class="sx-act"><button type="button" class="prp-btn sm ghost" data-sx="${i}" aria-label="Add ${esc(r.name)} to the notebook">Add</button></td></tr>`;
  }).join('');
  out.innerHTML = `<p class="small">${num(s.total)} record${s.total === 1 ? '' : 's'} matching “${esc(q)}”${s.total > s.results.length ? `, the first ${num(s.results.length)} shown` : ''}. Every row is a company, organisation or ship, never a person: the index holds no people. A match on a name is a lead: confirm it on the official list, by the reference, before you say anything.${caveat}</p>
    <div class="scroll"><table class="prp-table sx-table"><thead><tr><th scope="col">Name</th><th scope="col">List and type</th><th scope="col">Programme or regime</th><th scope="col">Date listed</th><th scope="col">Reference</th><th scope="col">Country</th><th scope="col">Ship</th><th scope="col">Official record</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sxAdd(i) {
  const h = sxHits[i]; if (!h) return;
  const r = sanctionsRow(h.rec, sxIndex.lists), l = sxIndex.lists[h.rec.list] || {};
  ctxRef.addToNotebook({
    claim: `The ${r.list} names “${r.name}” (${r.type}, reference ${r.ref})${r.regime ? ` under ${r.regime}` : ''}${r.listed ? `, designated ${r.listed}` : ''}.`,
    url: r.links[0]?.href || l.search || '', accessed: isoDay(), tags: ['sanctions', h.rec.list.toUpperCase()],
    notes: `Found in Vitruvian Manager’s sanctions index searching “${sxQuery}”; that copy of the list was read ${l.read ? utcLabel(l.read) : 'on an unknown date'}. The lists change daily: confirm on the official list before relying on it.`,
  });
}

async function screen(name) {
  const out = $('#os-out', panelEl);
  if (!name) { out.innerHTML = '<p class="small error-text">Search for an organisation first, or type a name above.</p>'; return; }
  $('#os-web', panelEl).href = osWebUrl(name);
  if (!osKey) {
    out.innerHTML = `<div class="prp-note">Without a key, ${extLink(osWebUrl(name), `search “${name}” on opensanctions.org`)}: free to anyone. Add a key above to screen names here.</div>`;
    return;
  }
  const schema = OS_SCHEMAS[$('#os-schema', panelEl).value] ? $('#os-schema', panelEl).value : 'Organization';
  out.innerHTML = '<div class="loading">Screening with OpenSanctions…</div>';
  ctxRef.log({ kind: 'lookup', text: `OpenSanctions screening (${OS_SCHEMAS[schema]}): ${name}` }); // no URL: it would hold the key
  const r = await fetchData(osSearchUrl(name, { schema, key: osKey, limit: 15 }), { timeout: 25000 });
  if (!r.ok) {
    const msg = r.kind === 'network' ? 'OpenSanctions refused the request before the browser could read the reason. That usually means the key is wrong or expired (the API answers a bad key without the header browsers need). Check the key, or search the website instead.'
      : r.status === 401 || r.status === 403 ? 'OpenSanctions did not accept the key. Check it, or search the website instead.' : failText(r, 'OpenSanctions');
    out.innerHTML = `<div class="prp-note bad">${esc(msg)} ${extLink(osWebUrl(name), 'Search on opensanctions.org')}</div>`;
    return;
  }
  const s = summariseSanctions(r.json);
  const people = s.hidden ? ` ${num(s.hidden)} ${s.hidden === 1 ? 'person was' : 'people were'} left out: this dashboard screens organisations, vessels and aircraft, not people.` : '';
  if (!s.results.length) { out.innerHTML = `<div class="prp-note">No entries matching “${esc(name)}” among ${esc(OS_SCHEMAS[schema].toLowerCase())}.${esc(people)} A clean result is not clearance: check spellings, transliterations and former names, and the official lists.</div>`; return; }
  out.innerHTML = `<p class="small">${num(s.total)}${s.relation === 'gte' ? '+' : ''} entr${s.total === 1 ? 'y' : 'ies'} matching “${esc(name)}”.${esc(people)} A match on a name is a lead: confirm identifiers on the official list before you say anything.</p>
    <div class="scroll"><table class="prp-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Flags</th><th scope="col">Countries</th><th scope="col" class="num">Lists</th><th scope="col">Last seen</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
    ${s.results.map((e, i) => `<tr><td>${e.url ? extLink(e.url, e.caption) : esc(e.caption)}</td><td>${esc(e.schema)}</td><td><div class="topics">${e.topics.map(t => `<span class="badge${/Sanctioned|Terror|crime/i.test(t) ? ' bad' : ''}">${esc(t)}</span>`).join('') || '—'}</div></td><td>${esc(e.countries.join(', ').toUpperCase())}</td><td class="num mono">${num(e.datasets.length)}</td><td class="mono">${esc(dayLabel(e.lastSeen))}</td><td><button type="button" class="prp-btn sm ghost" data-os="${i}">Add</button></td></tr>`).join('')}
    </tbody></table></div>`;
  out.querySelector('tbody').onclick = e => {
    const b = e.target.closest('[data-os]'); if (!b) return;
    const x = s.results[+b.dataset.os];
    ctxRef.addToNotebook({ claim: `OpenSanctions lists “${x.caption}” (${x.schema}) with flags: ${x.topics.join(', ') || 'none'}`, url: x.url, accessed: isoDay(), tags: ['sanctions'], notes: `Found screening “${name}”. On ${x.datasets.length} source list(s); last seen ${dayLabel(x.lastSeen)}. Confirm on the official list before relying on it.` });
  };
}
