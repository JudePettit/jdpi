// OSINT Dashboard · Search: one query, written in each engine's own syntax, opened in new tabs. Nothing is fetched or
// scraped. Each opened search can be logged in the case's activity log (the audit trail the course asks for).
import { esc, launchers, SEARCH_GROUPS, FILETYPES, buildQuery, normaliseSpec, specIsEmpty, isoDay } from './lib.js';
import { $, $$, copyText, settings } from './ui.js';

const daysAgo = n => isoDay(new Date(Date.now() - n * 864e5));
const EXAMPLES = [
  { label: 'Drone attacks on fuel depots, last 30 days', spec: { all: 'drone fuel depot', any: 'attack strike fire', from: daysAgo(30), to: isoDay() } },
  { label: 'Asset-freeze notices (UK, PDF)', spec: { phrase: 'asset freeze', site: 'gov.uk', filetype: 'pdf' } },
  { label: 'Ship-to-ship transfers', spec: { phrase: 'ship-to-ship transfer', any: 'tanker sanctions', none: 'game' } },
  { label: 'Data-centre planning (Ireland)', spec: { all: 'data centre planning', site: 'gov.ie', filetype: 'pdf' } },
  { label: 'Pontoon bridge tenders (EU)', spec: { all: 'pontoon bridge tender', site: 'ted.europa.eu' } },
];

let form, ctxRef, timer;
export function init(panel, ctx) {
  ctxRef = ctx;
  form = $('#search-form', panel);
  $('#s-filetype', panel).innerHTML = Object.entries(FILETYPES).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  $('#search-examples', panel).innerHTML = EXAMPLES.map((x, i) => `<button type="button" class="prp-chip" data-ex="${i}">${esc(x.label)}</button>`).join('');
  $('#search-examples', panel).addEventListener('click', e => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    fill(EXAMPLES[+b.dataset.ex].spec);
  });
  panel.querySelector('.chips[aria-label="Common sites"]').addEventListener('click', e => {
    const b = e.target.closest('[data-site]'); if (!b) return;
    form.site.value = b.dataset.site; render();
  });
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('reset', () => setTimeout(render, 0));
  const log = $('#log-searches', panel);
  log.checked = settings.get('logSearches', true);
  log.addEventListener('change', () => settings.set('logSearches', log.checked));
  $('#q-copy', panel).addEventListener('click', () => { const q = $('#q-google', panel).dataset.q; if (q) copyText(q, 'Query copied'); });
  $('#launch-groups', panel).addEventListener('click', e => {
    const a = e.target.closest('a.launch'); if (!a || a.getAttribute('aria-disabled') === 'true') return;
    if (a.classList.contains('internal')) return;
    ctxRef.log({ kind: 'search', text: `${a.dataset.name}: ${a.dataset.q}`, url: a.href });
  });
  if (ctx.state.q) form.all.value = ctx.state.q; // a link such as #tab=search&q=fuel+depot
  render();
}

export function show(state) {
  if (state.q && form.all.value !== state.q && specIsEmpty(readSpec())) { form.all.value = state.q; render(); }
}

function readSpec() {
  const f = new FormData(form);
  return Object.fromEntries(['all', 'phrase', 'any', 'none', 'intitle', 'site', 'filetype', 'from', 'to'].map(k => [k, String(f.get(k) || '')]));
}
function fill(spec) {
  form.reset();
  for (const [k, v] of Object.entries(spec)) if (form[k]) form[k].value = v;
  render();
}

function render() {
  const spec = normaliseSpec(readSpec());
  const empty = specIsEmpty(spec);
  const g = buildQuery(spec, 'google');
  const line = $('#q-google');
  line.textContent = empty ? 'Type some words to build a query.' : g.q;
  line.classList.toggle('empty', empty);
  line.dataset.q = empty ? '' : g.q;
  ctxRef.setParam({ q: spec.all });
  const all = launchers(spec);
  $('#launch-groups').innerHTML = SEARCH_GROUPS.map(grp => {
    const items = all.filter(l => l.group === grp.id);
    return `<section class="prp-panel launch-group" aria-labelledby="lg-${grp.id}"><div class="prp-panel-head"><b id="lg-${grp.id}">${esc(grp.name)}</b><span class="prp-label">${items.length}</span></div>
      <p class="note">${esc(grp.note)}</p>
      <div class="launch-list">${items.map(card).join('')}</div></section>`;
  }).join('');
}

function card(l) {
  const on = !!l.href;
  const attrs = l.internal ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<a class="launch${l.internal ? ' internal' : ''}" href="${on ? esc(l.href) : '#tab=search'}"${on ? attrs : ' aria-disabled="true" tabindex="-1"'} data-name="${esc(l.name)}" data-q="${esc(l.q)}">
    <span class="nm">${esc(l.name)}</span><span class="ds">${esc(l.desc)}</span>${l.dropped.length && on ? `<span class="dropped">${esc(l.dropped.join('; '))}</span>` : ''}${l.internal || !on ? '' : '<span class="sr-only"> (opens in a new tab)</span>'}</a>`;
}
