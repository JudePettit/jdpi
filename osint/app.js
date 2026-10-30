// OSINT Dashboard (International Mystery Management). One page, eleven in-page tabs. The URL hash holds the view
// (#tab=domains&q=example.org, #tab=cookbook&s=exiftool) so the shell and other pages can link to it; the case notebook
// is shared by every tab. Each tab's code loads the first time the tab opens (tab-*.js); pure helpers are in lib.js,
// exif.js and md.js, tested by tests/osint.test.mjs.
import { TABS, parseHash, toHash, resolveTab, caseStats, esc } from './lib.js';
import { $, toast, wireTablist, wireCourseLinks, settings, num } from './ui.js';
import { createStore } from './store.js';

const MODULES = {
  overview: () => import('./tab-overview.js'), search: () => import('./tab-search.js'), archives: () => import('./tab-archives.js'),
  domains: () => import('./tab-domains.js'), orgs: () => import('./tab-orgs.js'), events: () => import('./tab-events.js'),
  media: () => import('./tab-media.js'), notebook: () => import('./tab-notebook.js'),
  cookbook: () => import('./tab-guide.js'), kit: () => import('./tab-guide.js'), law: () => import('./tab-guide.js'),
};

const store = createStore();
const started = new Map();
let state = readLocation();

function readLocation() {
  if (!location.hash) {
    const t = new URLSearchParams(location.search).get('tab'); // ?tab=… from older links
    if (t) return parseHash('#tab=' + t);
  }
  return parseHash(location.hash);
}

/** Shared with every tab module. */
const ctx = {
  store,
  get state() { return state; },
  /** Switch tab (and optionally pass q or s), keeping the URL in step. */
  go(tab, params = {}) { navigate({ tab, q: params.q || '', s: params.s || '', w: params.w || '' }); },
  /** Change q or s for the current tab without re-running it. */
  setParam(params) {
    state = { ...state, ...params };
    const h = toHash(state);
    if (h !== location.hash) history.replaceState(history.state, '', h);
  },
  /** Record a search or lookup in the case's activity log (the user can turn this off on the Search tab). */
  log(entry) { if (settings.get('logSearches', true)) store.log(entry); },
  /** Add an item to the current case and offer to open it. */
  addToNotebook(fields, label = 'Added to the case notebook') {
    const item = store.addItem(fields);
    if (item) toast(`${label}: “${store.current().title}”`, { action: { label: 'Open', run: () => ctx.go('notebook') } });
    return item;
  },
};

function navigate(next) {
  state = { tab: resolveTab(next.tab) || 'overview', q: next.q || '', s: next.s || '', w: next.w || '' };
  const h = toHash(state);
  if (h !== location.hash) history.replaceState(history.state, '', h);
  activate(state.tab);
}

async function activate(tab, { focus = false } = {}) {
  for (const t of TABS) {
    const btn = $('#tab-' + t.id), panel = $('#panel-' + t.id), on = t.id === tab;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  }
  const btn = $('#tab-' + tab), list = $('#tabs');
  const left = btn.offsetLeft - list.offsetLeft;
  if (left < list.scrollLeft || left + btn.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = Math.max(0, left - 24);
  if (focus) btn.focus();
  let mod = started.get(tab);
  if (!mod) {
    mod = MODULES[tab]().then(async m => { await m.init($('#panel-' + tab), ctx, tab); return m; });
    started.set(tab, mod);
  }
  try {
    const m = await mod;
    if (state.tab === tab) m.show?.(state, tab);
  } catch (e) {
    console.error(e);
    started.delete(tab);
    $('#panel-' + tab).insertAdjacentHTML('afterbegin', `<div class="prp-note bad">This view could not load (${esc(e.message)}). Reload the page to try again.</div>`);
  }
}

/* ---------- header and tab badge follow the notebook ---------- */
function renderMeta() {
  const c = store.current(), s = caseStats(c);
  $('#nb-count').textContent = s.items ? num(s.items) : '';
  $('#nb-count').setAttribute('aria-label', s.items ? `${s.items} items` : '');
  $('#meta').innerHTML = [
    '<span>Tools and links checked <b>28 Oct 2026</b></span>',
    '<span>Live lookups: <b>8 keyless services</b>, OpenSanctions with your key</span>',
    `<span>Case <b>${esc(c.title)}</b>: ${num(s.items)} item${s.items === 1 ? '' : 's'}, ${num(s.graded)} graded${store.persistent ? '' : ' · <b>not saved: storage is blocked</b>'}</span>`,
    '<span>Notebook stored in this browser only</span>',
  ].join('');
}
store.on(renderMeta);
renderMeta();

/* ---------- tabs ---------- */
const tabList = $('#tabs');
tabList.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) navigate({ tab: b.dataset.tab }); });
wireTablist(tabList, b => navigate({ tab: b.dataset.tab }));
window.addEventListener('hashchange', () => { state = readLocation(); activate(state.tab); });
wireCourseLinks(document);
activate(state.tab);

// Warm the most-used modules in the background so switching feels instant.
const warm = () => ['search', 'notebook', 'archives', 'domains'].forEach(t => MODULES[t]().catch(() => {}));
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2500);
