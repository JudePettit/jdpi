/* PRP shell (the product is Vitruvian Manager, short VM, by JDP-Iq; "prp" stays the internal name of files, tokens, ids
   and storage keys): renders the modules (Realtime Geopolitics, Retrospective Geopolitics, International Mystery
   Management, Money Management, Natural Science, Digital Science, Kino) and their submodules from registry.json, and
   hosts each submodule page in a persistent workspace frame. A module has a short name (registry "name", for the
   sidebar, the breadcrumb and search) and a full title (registry "title", for its overview page, the home's headings,
   page eyebrows and the tab title); they differ only where the full title is too long for the sidebar.
   Routes: #/ · #/<module> · #/<module>/<submodule>[/<view>][?at=<url>]
   (In registry.json the four modules are "suites" and their submodules "modules", as before.)
   Old links keep working: suite and submodule aliases (q → rt, hp → rs, fe → mm, trade-desk → markets, …), submodules
   that moved between modules, and old sub-entries that became views or their own submodule are redirected.
   One frame per submodule (and view): a deep link moves that frame, a plain visit shows it as it was left.
   While Kino follows along with its frame hidden, the now-playing bar shows its captions and controls. */

const state = { registry: null, frames: new Map(), route: null, theme: 'system', np: null, kinoMove: null };
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { 'live': 'Live', 'in-build': 'In build', 'planned': 'Planned' };
const kindLabel = k => state.registry.kinds?.[k] || '';

function allModules() { return state.registry.suites.flatMap(s => s.modules.map(m => ({ suite: s, module: m }))); }
const findSuite = id => state.registry.suites.find(s => s.id === id || s.aliases?.includes(id)) || null;
const findModule = id => allModules().find(x => x.module.id === id || x.module.aliases?.includes(id)) || null;

/* --- Routing --------------------------------------------------------------- */
function href(suite, module, view) { return '#/' + [suite?.id, module?.id, view?.id].filter(Boolean).map(encodeURIComponent).join('/'); }

function parseRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [suiteId, moduleId, viewId] = path.split('/').filter(Boolean).map(decodeURIComponent);
  const at = new URLSearchParams(query).get('at');
  let suite = suiteId ? findSuite(suiteId) : null, module = null, view = null;
  if (moduleId) {
    const hit = (suite && suite.modules.find(m => m.id === moduleId || m.aliases?.includes(moduleId))) || findModule(moduleId)?.module || null;
    if (hit) { module = hit; suite = state.registry.suites.find(s => s.modules.includes(hit)); }
  }
  if (module && viewId) {
    view = module.views?.find(v => v.id === viewId) || null;
    // An old sub-entry that is now its own submodule (e.g. War Focus under Retrospective Battlefield).
    if (!view) { const own = findModule(viewId); if (own) { module = own.module; suite = own.suite; } }
  }
  return { suite, module, view, at, query };
}

// The only addresses a page may move the shell to (Kino's 'prp:navigate', the now-playing bar's "Back to film").
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;

// Cloudflare Pages serves /x/index.html at /x/ and /x.html at /x (with a 308), so page addresses compare without them.
const stripPage = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
const samePage = (a, b) => a.origin === b.origin && stripPage(a.pathname) === stripPage(b.pathname) && a.search === b.search;

// A deep link may only point at the submodule's own page (same origin and path), so the shell never frames other sites.
function deepLink(r) {
  if (!r.at || !r.module?.url) return null;
  try {
    const want = new URL(r.at, location.href), base = new URL(r.view?.url || r.module.url, location.href);
    return want.origin === base.origin && stripPage(want.pathname) === stripPage(base.pathname) ? want.href : null;
  } catch { return null; }
}

/* --- Theme ----------------------------------------------------------------- */
const media = window.matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => (state.theme === 'system' ? (media.matches ? 'dark' : 'light') : state.theme);
function applyTheme(choice) {
  state.theme = choice;
  try { if (choice === 'system') localStorage.removeItem('prp.theme'); else localStorage.setItem('prp.theme', choice); } catch { /* private mode */ }
  if (choice === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
  state.frames.forEach(f => postTheme(f));
}
function postTheme(frame) { try { frame.contentWindow?.postMessage({ type: 'prp:theme', theme: resolvedTheme() }, '*'); } catch { /* cross-origin frames ignore it */ } }
function setupTheme() {
  let saved = 'system';
  try { saved = localStorage.getItem('prp.theme') || 'system'; } catch { /* ignore */ }
  document.querySelectorAll('[data-theme-choice]').forEach(b => { b.onclick = () => applyTheme(b.dataset.themeChoice); });
  media.addEventListener?.('change', () => { if (state.theme === 'system') state.frames.forEach(postTheme); });
  // A module announces itself when it loads; answer with the theme so it matches the shell.
  window.addEventListener('message', e => {
    if (e.data?.type === 'jdpi:module-ready' || e.data?.type === 'prp:hello') state.frames.forEach(f => { if (f.contentWindow === e.source) postTheme(f); });
    // Kino's 'Follow along' (and any same-origin page) may move the shell to another submodule; only shell routes are accepted.
    if (e.data?.type === 'prp:navigate' && e.origin === location.origin && SHELL_ROUTE.test(String(e.data.hash || ''))) {
      if (e.source === state.np?.frame?.contentWindow) state.kinoMove = e.data.hash; // the film moving the shell, not the viewer
      location.hash = e.data.hash;
    }
    if (e.data?.type === 'prp:nowplaying' && e.origin === location.origin) nowPlayingMessage(e);
  });
  applyTheme(saved);
}

/* --- Navigation ------------------------------------------------------------ */
function navItem(suite, m) {
  const flag = m.status === 'live' ? '' : `<span class="flag">${esc(STATUS[m.status] || m.status)}</span>`;
  const search = [m.name, suite.name, suite.title, suite.code, kindLabel(m.kind), ...(m.aliases || [])].join(' ').toLowerCase();
  return `<a class="nav-item" href="${href(suite, m)}" data-route="${suite.id}/${m.id}" data-search="${esc(search)}" data-suite="${suite.id}">
    <span class="icon" aria-hidden="true">${esc(m.icon)}</span><span class="grow">${esc(m.name)}</span>${flag}</a>`;
}
function renderNav() {
  const P = state.registry.platform;
  $('#nav').innerHTML = `<a class="nav-item" href="#/" data-route=""><span class="icon" aria-hidden="true">⌂</span><span class="grow">Home</span></a>` +
    state.registry.suites.map(suite => `
      <details class="suite" data-suite="${suite.id}" open>
        <summary${suite.title && suite.title !== suite.name ? ` title="${esc(suite.title)}"` : ''}><span class="prp-code" data-suite="${suite.id}">${esc(suite.code)}</span>${esc(suite.name)}<span class="chev" aria-hidden="true">›</span></summary>
        <a class="suite-link" href="${href(suite)}" data-route="${suite.id}">Module overview</a>
        ${suite.modules.map(m => navItem(suite, m)).join('')}
      </details>`).join('') +
    `<div class="search-results" id="search-results" hidden></div>`;
  const mods = allModules();
  $('#legal').innerHTML = `<b>${esc(P.name)} ${esc(P.version)}</b> · ${state.registry.suites.length} modules · ${mods.length} submodules<br>© ${new Date().getFullYear()} ${esc(P.company)}`;
}
function highlightNav(r) {
  const key = [r.suite?.id, r.module?.id].filter(Boolean).join('/');
  document.querySelectorAll('#nav [data-route]').forEach(el => { if (el.dataset.route === key) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
}

/* --- Top bar --------------------------------------------------------------- */
function renderTop(r, frame) {
  const P = state.registry.platform, parts = [r.suite ? `<a href="#/">${esc(P.name)}</a>` : `<b>${esc(P.fullName)}</b>`];
  if (r.suite) parts.push(r.module ? `<a href="${href(r.suite)}">${esc(r.suite.name)}</a>` : `<b>${esc(r.suite.name)}</b>`);
  if (r.module) parts.push(r.view ? `<a href="${href(r.suite, r.module)}">${esc(r.module.name)}</a>` : `<b>${esc(r.module.name)}</b>`);
  if (r.view) parts.push(`<b>${esc(r.view.name)}</b>`);
  $('#crumbs').innerHTML = parts.join('<span class="sep" aria-hidden="true">/</span>');
  const m = r.module;
  $('#top-actions').innerHTML = m ? `
    ${m.kind ? `<span class="prp-kind">${esc(kindLabel(m.kind))}</span>` : ''}
    <span class="prp-status" data-status="${esc(m.status)}">${esc(STATUS[m.status] || m.status)}</span>
    ${frame ? `<button class="prp-btn sm" type="button" id="reload" title="Reload this page">⟳<span class="btn-label">Reload</span></button>
    <a class="prp-btn sm" id="newtab" href="${esc(frameAddress(frame))}" target="_blank" rel="noopener" title="Open this page, as it is now, in a new tab">↗<span class="btn-label">New tab</span></a>` : ''}` : '';
  if (!frame) return;
  // The frame by its key, so a Reload that replaced the element is still found.
  const current = () => state.frames.get(frame.dataset.key);
  $('#reload').onclick = () => { const f = current(); if (f) reloadFrame(f); };
  // "New tab" opens the page where it is now, not where the shell first put it: refresh the address just before use.
  const tab = $('#newtab'), fresh = () => { const f = current(); if (f) tab.href = frameAddress(f); };
  for (const ev of ['pointerenter', 'pointerdown', 'focus', 'contextmenu', 'click']) tab.addEventListener(ev, fresh);
}

/* --- Views ----------------------------------------------------------------- */
const tile = (suite, m) => `<a class="tile" href="${href(suite, m)}" data-suite="${suite.id}">
    <div class="row"><span class="icon" aria-hidden="true">${esc(m.icon)}</span>${m.kind ? `<span class="prp-kind">${esc(kindLabel(m.kind))}</span>` : ''}</div>
    <h3>${esc(m.name)}</h3><p>${esc(m.description)}</p>
    <div class="foot"><span class="prp-status" data-status="${esc(m.status)}">${esc(STATUS[m.status] || m.status)}</span><span>${esc(m.host)}</span>${m.opensInNewTab ? '<span>Opens in a new tab</span>' : ''}</div>
  </a>`;

function renderHome() {
  const P = state.registry.platform, mods = allModules();
  const kinds = mods.reduce((a, x) => ((a[x.module.kind] = (a[x.module.kind] || 0) + 1), a), {});
  // The Today panel (PRP-ANALYSIS.md item 3): above the catalogue, the few lines that actually change. Its data loads
  // lazily after this paint (loadToday), so the cards are never held up; a cached session result, fresh or stale, is
  // dropped in here synchronously so a return visit shows it with no flash and no jump (a stale one is then refreshed
  // in place). The product counts move below it, as the analysis asks ("The counts can stay, below.").
  const today = TODAY_PANEL ? readTodayCache() : null;
  $('#view').innerHTML = `<div class="page">
    <header class="head">
      <div class="prp-eyebrow">${esc(P.fullName)} <span class="sep">·</span> by ${esc(P.company)}</div>
      <h1 class="prp-title">Workspace</h1>
      <p class="prp-dek">${esc(P.tagline)} Realtime modules show what is happening now; Retrospective modules show what happened before and why.</p>
    </header>
    ${TODAY_PANEL ? `<section id="today" class="today" aria-label="Today in your workspace" aria-live="off"${today ? '' : ' aria-busy="true"'}>${todayInnerHtml(today?.groups)}</section>` : ''}
    <div class="prp-kpis today-kpis">
      <div class="prp-kpi"><span>Modules</span><b>${state.registry.suites.length}</b></div>
      <div class="prp-kpi"><span>Submodules</span><b>${mods.length}</b></div>
      <div class="prp-kpi"><span>Realtime</span><b>${kinds.realtime || 0}</b></div>
      <div class="prp-kpi"><span>Retrospective</span><b>${kinds.retrospective || 0}</b></div>
    </div>
    ${state.registry.suites.map((s, i) => `<section class="group" data-suite="${s.id}">
      <div class="group-head"><span class="prp-code">${esc(s.code)}</span><h2 class="prp-h2"><span class="prp-section-no">${i + 1}.</span>${esc(s.title || s.name)}</h2><a class="more" href="${href(s)}">Module overview →</a></div>
      <p>${esc(s.description)}</p>
      <div class="tiles">${s.modules.map(m => tile(s, m)).join('')}</div>
    </section>`).join('')}
    <footer class="footer"><span>${esc(P.fullName)} (${esc(P.name)}), by ${esc(P.company)}.</span><span>Registry v${esc(P.version)}</span></footer>
  </div>`;
  // The cards have painted. Fill the panel when the browser is idle (never on the first-paint path): a cache miss fetches
  // through the highlights module, a hit renders at once. It never throws into route().
  if (TODAY_PANEL) (window.requestIdleCallback ? requestIdleCallback(loadToday, { timeout: 1500 }) : setTimeout(loadToday, 0));
}

function renderSuite(suite) {
  const live = suite.modules.filter(m => m.status === 'live').length;
  $('#view').innerHTML = `<div class="page" data-suite="${suite.id}">
    <header class="head">
      <div class="prp-eyebrow">${esc(state.registry.platform.name)} <span class="sep">/</span> Module ${esc(suite.code)}</div>
      <h1 class="prp-title">${esc(suite.title || suite.name)}</h1><p class="prp-dek">${esc(suite.description)}</p>
      <div class="prp-meta"><span><b>${suite.modules.length}</b> submodules</span><span><b>${live}</b> live</span></div>
    </header>
    <div class="list prp-panel"><table class="prp-table">
      <thead><tr><th>Submodule</th><th>Kind</th><th>Status</th><th>Host</th><th></th></tr></thead>
      <tbody>${suite.modules.map(m => `<tr>
        <td><a class="name" href="${href(suite, m)}">${esc(m.icon)}&nbsp; ${esc(m.name)}</a><p>${esc(m.description)}</p></td>
        <td><span class="prp-kind">${esc(kindLabel(m.kind))}</span></td>
        <td><span class="prp-status" data-status="${esc(m.status)}">${esc(STATUS[m.status] || m.status)}</span></td>
        <td class="prp-muted">${esc(m.host)}</td>
        <td><a class="prp-btn sm" href="${href(suite, m)}">Open</a></td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

function renderNotice(suite, m, body) {
  $('#view').innerHTML = `<div class="page" data-suite="${suite.id}"><div class="prp-panel launch">
    <div class="prp-eyebrow">${esc(suite.title || suite.name)} <span class="sep">·</span> ${esc(kindLabel(m.kind))}</div>
    <h1 class="prp-title">${esc(m.name)}</h1><p class="prp-dek">${esc(m.description)}</p>${body}</div></div>`;
}
// Submodules behind their own sign-in (Cloudflare Access) can't sign in inside another site's frame: browsers block
// the third-party cookie. Registry flag: "opensInNewTab": true.
function renderLaunch(suite, m, url) {
  const abs = new URL(url, location.href).href;
  renderNotice(suite, m, `<div class="prp-note" style="margin-top:18px"><b>Opens in its own tab.</b> ${esc(m.name)} is private and asks you to sign in, which browsers don't allow inside another site's frame.</div>
    <div class="actions"><a class="prp-btn primary" href="${esc(abs)}" target="_blank" rel="noopener">Open ${esc(m.name)} ↗</a></div>`);
}

/* --- Workspace "Today" panel (PRP-ANALYSIS.md item 3: "Make the Workspace a workspace, not a catalogue") ------------
   The home's cards never change, so above them we show the few things that do — the biggest 7-day volatility movers,
   how busy the briefings have been this week, the next votes and summits, and a market snapshot — each line a link into
   the submodule it came from. The data is design/prp-highlights.js over about 3 KB of files the Integration Hub derives
   for it, the Realtime Calendar's window and the trade-desk public API.
   To honour the analysis's performance mandate it is NEVER on the first-paint path: renderHome() paints the cards, then
   schedules loadToday() for idle time. The panel has four fixed slots (TODAY_SLOTS); each shows a loading card until its
   group settles, then the group, as soon as its own sources have answered (the slowest is never waited on: every request
   gives up after TODAY_FETCH_MS). Every card reserves the height of its fullest content (shell.css), so neither the fill
   nor a refresh moves anything below it. A group whose source failed shows a quiet "not available" in its slot; only when
   every source fails is the panel hidden.
   The result is kept in sessionStorage with when it was written and until when it is fresh (45 minutes, or the next UTC
   midnight if that is sooner: the module's cacheEntry). A fresh entry is shown and nothing is fetched; a stale one is
   shown at once and refreshed in place, slot by slot; and while the home stays open the panel refreshes itself when its
   entry goes stale. The panel is aria-live="off" inside the view's polite live region, so its fill and refreshes are not
   read out over whatever the reader is doing; it is a labelled region with headings, there to be visited.
   Every string is DATA from the module (or the session cache) and is escaped with esc() before it reaches the DOM,
   exactly as tile()/navItem() do, and a link is only ever a shell route. The honest time-window label the module
   computes for each group is shown verbatim, never sharpened. */
const TODAY_PANEL = true;
const TODAY_KEY = 'prp.today.v2';   // the session cache, { v: 2, at, until, groups }; bump the version if its shape changes
const TODAY_SLOTS = ['volatility', 'briefings', 'calendar', 'markets']; // the module's GROUP_IDS, in order (tests compare)
const TODAY_LINES = 5;              // the module's MAX_LINES: the most lines a card shows, and the room it reserves for
const TODAY_FETCH_MS = 8000;        // no source is waited on longer than this
let todayPending = false;           // one load at a time
let todayLoads = 0;                 // numbers each load, so a slot filled by this load is not filled again
let todayTimer = 0;                 // looks again when the entry goes stale while the home stays open
const onHome = () => !!$('#today') && !state.route?.suite && !state.route?.module;
const shellRoute = h => (SHELL_ROUTE.test(String(h || '')) ? h : '#/'); // a link is only ever a shell route
const abortAfter = ms => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);

// The session cache, read and written exactly like the theme's localStorage (setupTheme / applyTheme): every access is
// wrapped so private mode, blocked storage or a bad value can never throw. An empty or malformed entry reads as none.
function readTodayCache() {
  try {
    const e = JSON.parse(sessionStorage.getItem(TODAY_KEY) || 'null');
    return e && e.v === 2 && Number.isFinite(e.at) && Number.isFinite(e.until) && Array.isArray(e.groups) && e.groups.length ? e : null;
  } catch { return null; }
}
function writeTodayCache(entry) {
  try { sessionStorage.setItem(TODAY_KEY, JSON.stringify(entry)); sessionStorage.removeItem('prp.today.v1'); } catch { /* private mode or quota: just skip the cache */ }
}
const todayFresh = e => !!e && Date.now() >= e.at && Date.now() < e.until;

// One line: a link into its submodule, the headline value toned (the module's only styling hint: up/down for a market's
// gain or loss, worse/better for a rise or fall in volatility), the quieter detail below. Every field is data, so each is
// escaped; the title gives the full line back when it is clipped.
const TONES = { up: 'up', down: 'down', worse: 'worse', better: 'better' };
function todayItem(it) {
  const tone = TONES[it.tone] ? ' ' + TONES[it.tone] : '';
  const value = it.value ? `<span class="today-val${tone}">${esc(it.value)}</span>` : '';
  const detail = it.detail ? `<span class="today-detail">${esc(it.detail)}</span>` : '';
  const full = [it.label, it.value, it.detail].filter(Boolean).join(' · ');
  return `<a class="today-row" href="${esc(shellRoute(it.href))}" title="${esc(full)}"><span class="today-label">${esc(it.label)}</span>${value}${detail}</a>`;
}
// One group: a titled card (title, a link into the module named for where it goes, the honest window and source line)
// over its lines and its note (what was left out, or why there is nothing to show).
function todayCard(g, load = 0) {
  const items = (Array.isArray(g.items) ? g.items : []).slice(0, TODAY_LINES);
  const src = g.source ? `<span class="today-src">${g.window ? ' · ' : ''}${esc(g.source)}</span>` : '';
  return `<section class="today-card" data-group="${esc(g.id)}" data-state="${g.unavailable ? 'unavailable' : 'ready'}"${load ? ` data-load="${load}"` : ''}>
    <div class="today-head"><h3 class="prp-h3 today-h" title="${esc(g.title)}">${esc(g.title)}</h3><a class="more" href="${esc(shellRoute(g.href))}" aria-label="View ${esc(g.link || g.title)}">View →</a>
      <p class="today-win">${esc(g.window)}${src}</p></div>
    <div class="today-list">${items.map(todayItem).join('')}${g.note ? `<p class="today-note">${esc(g.note)}</p>` : ''}</div>
  </section>`;
}
// A slot while its group loads: the same card, the same reserved height, bars for text; hidden from screen readers.
const todaySkeleton = id => `<section class="today-card today-skeleton" data-group="${id}" data-state="loading" aria-hidden="true">
    <div class="today-head"><span class="sk sk-title"></span><span class="sk sk-win"></span></div>
    <div class="today-list">${'<span class="sk-row"><span class="sk"></span><span class="sk sk-sub"></span></span>'.repeat(TODAY_LINES)}</div></section>`;
// The panel: a slot per group, from the session cache when there is one, otherwise loading.
const todayInnerHtml = groups => `<h2 class="today-title">Today</h2><div class="today-grid">${TODAY_SLOTS.map(id => {
  const g = Array.isArray(groups) ? groups.find(x => x?.id === id) : null;
  return g ? todayCard(g) : todaySkeleton(id);
}).join('')}</div>`;

// Put one group into its slot. A refresh can land while a reader is on one of the card's links, so focus goes back to
// the link in the same place (the replacement has the same links in the same order, or fewer).
function renderTodaySlot(g, load) {
  const old = TODAY_SLOTS.includes(g?.id) ? $(`#today .today-card[data-group="${g.id}"]`) : null;
  if (!old) return;
  const links = [...old.querySelectorAll('a')], at = links.indexOf(document.activeElement);
  old.insertAdjacentHTML('afterend', todayCard(g, load));
  const card = old.nextElementSibling;
  old.remove();
  if (at >= 0) (card.querySelectorAll('a')[at] || card.querySelector('a'))?.focus({ preventScroll: true });
}

// Load the panel after the home is interactive, and again whenever its entry has gone stale. A fresh entry needs
// nothing. Otherwise the highlights module fetches every source at once (it never rejects) and hands each group over as
// it settles; each goes straight into its slot, replacing the loading card or the stale group. The viewer may leave the
// home while this runs, so the DOM is checked before every touch; called at idle time and by a timer, so it never throws.
async function loadToday() {
  clearTimeout(todayTimer);
  if (!onHome()) return; // only on the Workspace home (#/), only while shown
  const again = e => { todayTimer = setTimeout(loadToday, Math.max(0, e.until - Date.now()) + 1000); };
  const cached = readTodayCache();
  if (todayFresh(cached)) { again(cached); return; }
  if (todayPending) return;
  todayPending = true;
  const load = ++todayLoads, settled = {};
  $('#today').setAttribute('aria-busy', 'true');
  try {
    const { buildTodayHighlights, cacheEntry } = await import(new URL('design/prp-highlights.js', document.baseURI).href);
    await buildTodayHighlights({
      // base '' (the default) → same-origin data paths resolve like the shell's own fetch('registry.json'). Every request
      // carries AbortSignal.timeout(TODAY_FETCH_MS), and the module stops waiting for it then too, so no slow source can
      // hold its slot (or any other) beyond that.
      fetch: url => fetch(url, { signal: abortAfter(TODAY_FETCH_MS) }),
      timeoutMs: TODAY_FETCH_MS,
      onGroup: g => { if (!TODAY_SLOTS.includes(g?.id)) return; settled[g.id] = g; if (onHome()) renderTodaySlot(g, load); },
    });
    const groups = TODAY_SLOTS.map(id => settled[id]).filter(Boolean);
    const any = groups.some(g => !g.unavailable);
    if (any) { const entry = cacheEntry(groups); writeTodayCache(entry); if (onHome()) again(entry); }
    if (onHome()) {
      // A slot this load has not filled (the viewer left the home and came back meanwhile) gets its group now.
      for (const g of groups) if (!$(`#today .today-card[data-group="${g.id}"][data-load="${load}"]`)) renderTodaySlot(g, load);
      if (!any) $('#today').hidden = true; // nothing could be read at all (offline): no box of four apologies
    }
  } catch { if (onHome()) $('#today').hidden = true; } // the module itself could not be loaded: hide the panel, never break the shell
  finally { todayPending = false; $('#today')?.removeAttribute('aria-busy'); }
}

/* --- Frames: one persistent iframe per submodule and view, so each keeps its state ---------------------------------
   Frames are keyed by submodule and view, never by address. A deep link to a submodule whose frame exists moves that
   frame: when only the hash differs it is a same-document navigation (no reload; the page's hashchange handler
   re-renders), otherwise the new address loads in the same frame. Frames move with location.replace, so they add
   nothing to the browser's history and Back and Forward follow the shell's own address. A plain visit (no ?at=) shows
   the frame as it was left. Submodules sharing one page with different queries (the calendars, the courses, Kino's
   categories) are different submodules, so they keep separate frames. */
const views = m => m.views || [];
// A plain visit to a page whose address is one of its views is that view (Realtime Battlefield is its live map).
const frameKey = r => `${r.module.id}/${r.view?.id || views(r.module).find(v => v.url === r.module.url)?.id || ''}`;
const visibleFrame = () => ($('#frames').hidden ? null : $('#frames iframe.active'));
// Where a frame is now: its own address when it is on this origin, otherwise the address the shell last gave it.
function frameAddress(frame) {
  try { const u = frame.contentWindow.location.href; if (u && u !== 'about:blank') return u; } catch { /* another origin */ }
  return new URL(frame.dataset.url || frame.src, location.href).href;
}
/* Loading. While the frame in view loads a new page, a thin bar runs along the top of the workspace and the Vitruvian
   Manager figure (design/vm-loading.svg: he runs on all fours, then rolls off in his wheel) plays in its middle. Both
   start where a frame starts a new document (createFrame, moveFrame to another page, reloadFrame) and end at the frame's
   load event, or after a safety timeout in case none comes. A hash-only move never calls setLoading, so neither shows
   for one; nor do switches to a frame that has already loaded. The figure waits LOADER_DELAY_MS before it goes up, so a
   page that lands within that never shows it (no flash), and it comes down with the load event, never after it. The
   figure is laid over the frame with no pointer events and hidden from screen readers (the bar is the progress bar): it
   covers nothing you could click and holds up nothing. The SVG carries its own colours, so it reads in both themes.
   It is inlined rather than an <img>: as an image in Edge it ignored the page's (emulated) reduced-motion setting and
   kept rolling, where inline its own prefers-reduced-motion rule stops every animation and leaves one still frame; and
   an inline copy starts its loop afresh each time it is put up, so the figure is always seen setting off. Its class
   and keyframe names carry a vml- prefix, so its <style> cannot touch the shell's. The markup is fetched once, when a
   frame first loads, beside the frame's own load: until it has come, only the bar shows. */
const LOADER_DELAY_MS = 300;
let loaderCheck = 0; // the one pending re-check that puts the figure up once a load has run long enough
const loaderArt = { svg: '', asked: false };
function loaderSvg() {
  if (!loaderArt.asked) {
    loaderArt.asked = true;
    fetch('design/vm-loading.svg').then(r => (r.ok ? r.text() : '')).then(t => {
      if (!/^\s*<svg[\s>]/.test(t)) return; // a missing file (or a host's HTML fallback page) leaves just the bar
      loaderArt.svg = t; syncLoading();
    }).catch(() => { /* offline: the bar alone */ });
  }
  return loaderArt.svg;
}
function setLoading(frame, on) {
  const was = frame.hasAttribute('data-loading');
  frame.toggleAttribute('data-loading', on);
  clearTimeout(frame.loadingTimer);
  if (on) {
    if (!was) frame.loadingSince = performance.now(); // a move while loading keeps the first start
    frame.loadingTimer = setTimeout(() => setLoading(frame, false), 20000);
  }
  syncLoading();
}
function syncLoading() {
  const frame = visibleFrame(), busy = !!frame?.hasAttribute('data-loading');
  const bar = $('#frames .loading-bar'), figure = $('#frames .vm-loader');
  if (busy && !bar) $('#frames').insertAdjacentHTML('afterbegin', '<div class="loading-bar" role="progressbar" aria-label="Loading"></div>');
  else if (!busy && bar) bar.remove();
  // The figure goes up once the load has run LOADER_DELAY_MS, and comes down the moment the frame is no longer loading.
  const due = busy ? frame.loadingSince + LOADER_DELAY_MS - performance.now() : 0;
  if (busy && due <= 0 && !figure) { const svg = loaderSvg(); if (svg) $('#frames').insertAdjacentHTML('beforeend', `<div class="vm-loader" aria-hidden="true">${svg}</div>`); }
  else if (!busy && figure) figure.remove();
  // Not due yet: fetch the art meanwhile and look again when it is (switching frames meanwhile re-runs this anyway).
  clearTimeout(loaderCheck);
  if (busy && due > 0) { loaderSvg(); loaderCheck = setTimeout(syncLoading, due + 15); }
}
function createFrame(key, r, url) {
  const frame = document.createElement('iframe');
  frame.title = `${r.module.name}${r.view ? ' · ' + r.view.name : ''}`;
  frame.allow = 'clipboard-write; fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
  Object.assign(frame.dataset, { key, module: r.module.id, suite: r.suite.id, url: new URL(url, location.href).href });
  if (r.view) frame.dataset.view = r.view.id;
  frame.src = url;
  frame.addEventListener('load', () => {
    setLoading(frame, false); postTheme(frame);
    if (state.np?.frame === frame) setNowPlaying(null); // a new page in Kino's frame: the film it was playing has gone
  });
  setLoading(frame, true);
  return frame;
}
function moveFrame(frame, url) {
  // While a page is loading, compare with where it is going rather than where it was.
  const to = new URL(url, location.href), from = new URL(frame.hasAttribute('data-loading') ? frame.dataset.url : frameAddress(frame));
  frame.dataset.url = to.href;
  if (from.href === to.href) return;
  // The same page with another hash: change only the hash, on the page's own address, so it stays in place (no reload).
  if (samePage(from, to)) {
    if (from.hash === to.hash) return;
    const here = new URL(from.href); here.hash = to.hash;
    try { frame.contentWindow.location.replace(here.href); } catch { frame.src = to.href; }
    return;
  }
  try { frame.contentWindow.location.replace(to.href); } catch { frame.src = to.href; }
  setLoading(frame, true);
}
function reloadFrame(frame) {
  try { frame.contentWindow.location.reload(); setLoading(frame, true); return; } catch { /* another origin: load it afresh */ }
  // Setting the same address with a hash would only scroll, so a page on another origin gets a new frame in its place.
  const r = { module: findModule(frame.dataset.module).module, suite: { id: frame.dataset.suite }, view: null };
  const fresh = createFrame(frame.dataset.key, r, frameAddress(frame));
  if (frame.dataset.view) fresh.dataset.view = frame.dataset.view;
  fresh.title = frame.title; fresh.className = frame.className;
  if (state.np?.frame === frame) setNowPlaying(null);
  frame.replaceWith(fresh);
  state.frames.set(frame.dataset.key, fresh);
  syncLoading();
}
function showFrame(r, url, deep) {
  const key = frameKey(r);
  let frame = state.frames.get(key);
  if (!frame) { frame = createFrame(key, r, url); $('#frames').appendChild(frame); state.frames.set(key, frame); }
  else if (deep) moveFrame(frame, url);
  state.frames.forEach(f => f.classList.toggle('active', f === frame));
  syncLoading();
  return frame;
}

/* --- Kino now playing ---------------------------------------------------------------------------------------------
   While Kino follows along, its frame is hidden and the film's captions and controls can't be seen. Kino posts
   { type: 'prp:nowplaying', doc, scene, caption, playing, route } (or { stopped: true }) to the shell, which shows a
   compact bar over the bottom of the workspace; its buttons post { type: 'prp:kino-control', action } back to Kino's
   frame. Same origin only. Protocol: kino/README.md ("Now playing"). */
function nowPlayingMessage(e) {
  const frame = [...state.frames.values()].find(f => f.contentWindow === e.source);
  if (!frame) return;
  const d = e.data;
  if (d.stopped) { if (state.np?.frame === frame) setNowPlaying(null); return; }
  const num = v => (Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : 0);
  const own = findModule(frame.dataset.module);
  setNowPlaying({
    frame, title: String(d.doc?.title || 'Kino'), index: num(d.scene?.index), count: num(d.scene?.count), scene: String(d.scene?.title || ''),
    caption: String(d.caption || '').replace(/\s+/g, ' ').trim(), playing: d.playing === true, ended: d.ended === true,
    route: SHELL_ROUTE.test(String(d.route || '')) ? d.route : href(own?.suite, own?.module),
  });
}
function setNowPlaying(np) { state.np = np; syncNowPlaying(); }
function syncNowPlaying() {
  const np = state.np, bar = $('#np'), show = !!np && np.frame.isConnected && np.frame !== visibleFrame();
  document.documentElement.classList.toggle('np-on', show); // lifts the Documentary button above the bar on phones
  if (!show) {
    if (!bar.hidden && bar.contains(document.activeElement)) visibleFrame()?.focus();
    bar.hidden = true;
    return;
  }
  $('#np-title').textContent = np.title;
  $('#np-n').textContent = `${Math.min(np.index + 1, np.count || 1)}/${np.count || 1}`;
  $('#np-n').title = np.scene ? `Scene ${np.index + 1}: ${np.scene}` : '';
  const cap = $('#np-cap');
  if (cap.textContent !== np.caption) { cap.textContent = np.caption; cap.title = np.caption; } // the live region speaks only on a new sentence
  const play = $('#np-play'), label = np.playing ? 'Pause' : 'Play';
  if (play.getAttribute('aria-label') !== label) { play.textContent = np.playing ? '❚❚' : '▶\uFE0E'; play.setAttribute('aria-label', label); play.title = `${label} the film`; }
  $('#np-back').setAttribute('href', np.route);
  for (const id of ['#np-prev', '#np-play', '#np-next']) $(id).hidden = np.ended; // a finished film offers only Stop and "Back to film"
  bar.hidden = false;
  document.documentElement.style.setProperty('--np-h', `${bar.offsetHeight}px`);
}
function kinoControl(action) {
  const np = state.np;
  if (!np) return;
  if (action === 'play' || action === 'pause') { np.playing = action === 'play'; syncNowPlaying(); } // at once; Kino's reply confirms it
  if (action === 'stop') setNowPlaying(null); // the bar goes at once, even if Kino's frame has gone
  try { np.frame.contentWindow.postMessage({ type: 'prp:kino-control', action }, location.origin); } catch { /* the frame has gone */ }
}
// A film that follows along moves the shell to each scene's place. When you move the shell yourself while it plays (the
// sidebar, a link, Back), you have left it behind, so it pauses; the bar's Play resumes it. Kino's own moves are told
// apart by the prp:navigate message that precedes each: the address it asked for is the one exempt move.
function pauseFilmOnManualMove() {
  const np = state.np;
  if (location.hash === state.kinoMove) { state.kinoMove = null; return; }
  if (np?.playing && np.frame !== visibleFrame()) kinoControl('pause');
}
function setupNowPlaying() {
  $('#np-play').onclick = () => kinoControl(state.np?.playing ? 'pause' : 'play');
  $('#np-prev').onclick = () => kinoControl('prev');
  $('#np-next').onclick = () => kinoControl('next');
  $('#np-stop').onclick = () => kinoControl('stop');
  // "Back to film" is a link to the film's route (so it can also open in a new tab); after the shell has switched to
  // Kino's frame, focus goes into it, where the film's own keys work.
  $('#np-back').addEventListener('click', e => {
    const frame = state.np?.frame;
    if (!frame || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (location.hash === e.currentTarget.getAttribute('href')) { e.preventDefault(); route(); frame.focus(); return; }
    const focus = () => frame.focus();
    window.addEventListener('hashchange', focus, { once: true });
    setTimeout(() => window.removeEventListener('hashchange', focus), 1500);
  });
}

/* --- Router ---------------------------------------------------------------- */
function route() {
  const r = parseRoute();
  // Rewrite old addresses (aliases, moved submodules, views that became submodules) to their canonical form.
  const canon = href(r.suite, r.module, r.view) + (r.query ? '?' + r.query : '');
  if ((r.suite || r.module) && location.hash !== canon && location.hash.replace(/^#\/?/, '#/') !== canon) { history.replaceState(null, '', canon); }
  state.route = r;
  if (r.suite) document.documentElement.dataset.suite = r.suite.id; else delete document.documentElement.dataset.suite;

  const at = r.module?.url ? deepLink(r) : null, base = r.module?.url ? (r.view?.url || r.module.url) : null;
  const url = at || base;
  const newTab = r.view?.opensInNewTab ?? r.module?.opensInNewTab;
  const framed = !!url && !newTab;
  $('#view').hidden = framed;
  $('#frames').hidden = !framed;

  let frame = null;
  // A deep link to the page's own address (e.g. "open Volatility") is a plain visit: the frame shows as it was left.
  if (framed) frame = showFrame(r, url, !!at && new URL(at).href !== new URL(base, location.href).href);
  else if (url) renderLaunch(r.suite, r.module, url);
  else if (r.module) renderNotice(r.suite, r.module, `<div class="prp-note" style="margin-top:18px"><b>Not published yet.</b> It will open here once it has a live address.</div>`);
  else if (r.suite) renderSuite(r.suite);
  else renderHome();

  if (!framed) { $('#view').scrollTop = 0; syncLoading(); }
  const P = state.registry.platform;
  // "<Submodule> · VM", "<Module title> · VM", and the product's full name on the home (as index.html's own <title>).
  document.title = [r.view?.name, r.module?.name, r.suite && !r.module ? r.suite.title || r.suite.name : null, r.suite ? P.name : P.fullName].filter(Boolean).join(' · ');
  renderTop(r, frame);
  highlightNav(r);
  syncNowPlaying();
  closeMenu();
}

/* --- Search: submodules, plus a jump into the Encyclopaedia ------------------ */
function setupFind() {
  const input = $('#find'), results = () => $('#search-results');
  const enc = findModule('encyclopedia');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('#nav [data-search]').forEach(el => { el.hidden = !!q && !el.dataset.search.includes(q); });
    document.querySelectorAll('#nav .suite').forEach(s => { const any = [...s.querySelectorAll('[data-search]')].some(el => !el.hidden); s.hidden = !!q && !any; if (q) s.open = true; });
    document.querySelectorAll('#nav .suite-link, #nav > .nav-item').forEach(el => { el.hidden = !!q; });
    const box = results();
    if (q && enc) {
      const at = new URL(`${enc.module.url}#explore?q=${encodeURIComponent(input.value.trim())}`, location.href).href;
      box.innerHTML = `<a class="nav-item" href="${href(enc.suite, enc.module)}?at=${encodeURIComponent(at)}" data-entity-search><span class="icon" aria-hidden="true">◈</span><span class="grow">Search the Encyclopaedia for “${esc(input.value.trim())}”</span></a>`;
      box.hidden = false;
    } else box.hidden = true;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = [...document.querySelectorAll('#nav [data-search]')].find(el => !el.hidden) || $('#nav [data-entity-search]');
      if (first) { location.hash = first.getAttribute('href'); input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); }
    } else if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); }
  });
  // On a phone the search box is in the drawer, so "/" opens the drawer at it when it is closed.
  document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); if (phone.matches && !$('#side').classList.contains('open')) setDrawer(true, true); else { if (isCollapsed()) setCollapsed(false, false); input.focus(); } } });
}

/* --- Skip link: focus the workspace (the page in its frame, or the heading of a shell page) without touching the
   address, since the routes live in the hash. ----------------------------------------------------------------------- */
function setupSkip() {
  $('.skip').addEventListener('click', e => {
    e.preventDefault();
    const target = visibleFrame() || $('#view h1') || $('#view');
    if (target.tagName !== 'IFRAME') target.tabIndex = -1;
    target.focus();
  });
}

/* --- Phone drawer ---------------------------------------------------------------------------------------------------
   At 900 px and below the sidebar is a drawer. Closed, it is inert (off screen and out of the tab order). Open, it is
   modal: the rest of the page (the workspace, the Documentary button and reader) is inert under a scrim, and the scrim,
   Escape, its close button or any link in it (even to the page already shown) closes it. Opening moves focus into it
   (to the search box from the keyboard); closing while focus is in it puts focus back on ☰. */
const phone = window.matchMedia('(max-width: 900px)');
let behindDrawer = []; // what the open drawer made inert, given back when it closes
function setDrawer(open, toSearch = false) {
  const side = $('#side'), wasOpen = side.classList.contains('open'), active = document.activeElement;
  open = open && phone.matches;
  side.classList.toggle('open', open);
  side.inert = phone.matches && !open;
  $('#menu').setAttribute('aria-expanded', String(open));
  $('#scrim').hidden = !open;
  if (open && !wasOpen) {
    behindDrawer = [$('#main'), ...[...document.body.children].filter(el => !el.contains(side) && !el.inert && el.tagName !== 'SCRIPT')];
    behindDrawer.forEach(el => { el.inert = true; });
    if (toSearch) $('#find').focus(); else { side.tabIndex = -1; side.focus(); }
  } else if (!open && wasOpen) {
    behindDrawer.forEach(el => { el.inert = false; });
    behindDrawer = [];
    if (side.contains(active) || active === document.body || !active) $('#menu').focus();
  }
}
function closeMenu() { setDrawer(false); }

/* --- Sidebar collapse -----------------------------------------------------------------------------------------------
   Above 900 px the sidebar can be hidden so the page you are looking at gets the whole width; the choice is remembered
   in this browser (prp.sidebar) and applied before first paint by index.html. At 900 px and below the sidebar is the
   phone drawer instead, so the switch is hidden there and the class does nothing (shell.css). */
const SIDE_KEY = 'prp.sidebar';
const isCollapsed = () => document.documentElement.classList.contains('side-collapsed') && !phone.matches;
function setCollapsed(collapsed, remember = true) {
  document.documentElement.classList.toggle('side-collapsed', collapsed);
  const b = $('#collapse');
  b.setAttribute('aria-expanded', String(!collapsed));
  b.setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
  b.title = collapsed ? 'Show navigation' : 'Hide navigation (give the page the whole width)';
  b.textContent = collapsed ? '☰' : '⇤';
  // Hiding the sidebar while focus is in it would drop focus onto the page body: keep it on the switch.
  if (collapsed && $('#side').contains(document.activeElement)) b.focus();
  if (remember) { try { if (collapsed) localStorage.setItem(SIDE_KEY, 'collapsed'); else localStorage.removeItem(SIDE_KEY); } catch { /* private mode */ } }
}
function setupCollapse() {
  setCollapsed(document.documentElement.classList.contains('side-collapsed'), false); // the label and icon match what index.html applied
  $('#collapse').addEventListener('click', () => setCollapsed(!document.documentElement.classList.contains('side-collapsed')));
}
function setupMenu() {
  // A click from the keyboard (Enter or Space) has detail 0: the drawer then opens at its search box.
  $('#menu').addEventListener('click', e => setDrawer(!$('#side').classList.contains('open'), e.detail === 0));
  $('#side-close').addEventListener('click', closeMenu);
  $('#scrim').addEventListener('click', closeMenu);
  // After the link has done its work: a link to the page already shown changes nothing, so route() would not close it.
  $('#side').addEventListener('click', e => { if (e.target.closest('a[href]')) setTimeout(closeMenu); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#side').classList.contains('open')) closeMenu(); });
  phone.addEventListener?.('change', closeMenu);
  closeMenu();
}

(async function init() {
  setupTheme();
  setupSkip();
  setupMenu();
  setupCollapse();
  try { state.registry = await fetch('registry.json', { cache: 'no-cache' }).then(r => r.json()); }
  catch (err) { $('#view').innerHTML = '<div class="page"><div class="prp-note">Could not load the module registry. Serve this folder over HTTP.</div></div>'; console.error(err); return; }
  renderNav();
  setupFind();
  setupNowPlaying();
  window.addEventListener('hashchange', () => { route(); pauseFilmOnManualMove(); });
  route();
})();
