/* PRP shell: renders the four modules (Realtime Intelligence, Retrospective Intelligence, Money Management, Natural
   Science) and their submodules from registry.json, and hosts each submodule page in a persistent workspace frame.
   Routes: #/ · #/<module> · #/<module>/<submodule>[/<view>][?at=<url>]
   (In registry.json the four modules are "suites" and their submodules "modules", as before.)
   Old links keep working: suite and submodule aliases (q → rt, hp → rs, fe → mm, trade-desk → markets, …), submodules
   that moved between modules, and old sub-entries that became views or their own submodule are redirected. */

const state = { registry: null, frames: new Map(), route: null, theme: 'system' };
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

// A deep link may only point at the submodule's own page (same origin and path), so the shell never frames other sites.
function deepLink(r) {
  if (!r.at || !r.module?.url) return null;
  try {
    const want = new URL(r.at, location.href), base = new URL(r.view?.url || r.module.url, location.href);
    const strip = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    return want.origin === base.origin && strip(want.pathname) === strip(base.pathname) ? want.href : null;
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
  });
  applyTheme(saved);
}

/* --- Navigation ------------------------------------------------------------ */
function navItem(suite, m) {
  const flag = m.status === 'live' ? '' : `<span class="flag">${esc(STATUS[m.status] || m.status)}</span>`;
  const search = [m.name, suite.name, suite.code, kindLabel(m.kind), ...(m.aliases || [])].join(' ').toLowerCase();
  return `<a class="nav-item" href="${href(suite, m)}" data-route="${suite.id}/${m.id}" data-search="${esc(search)}" data-suite="${suite.id}">
    <span class="icon" aria-hidden="true">${esc(m.icon)}</span><span class="grow">${esc(m.name)}</span>${flag}</a>`;
}
function renderNav() {
  const P = state.registry.platform;
  $('#nav').innerHTML = `<a class="nav-item" href="#/" data-route=""><span class="icon" aria-hidden="true">⌂</span><span class="grow">Home</span></a>` +
    state.registry.suites.map(suite => `
      <details class="suite" data-suite="${suite.id}" open>
        <summary><span class="prp-code" data-suite="${suite.id}">${esc(suite.code)}</span>${esc(suite.name)}<span class="chev" aria-hidden="true">›</span></summary>
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
function renderTop(r, frameUrl) {
  const P = state.registry.platform, parts = [r.suite ? `<a href="#/">${esc(P.name)}</a>` : `<b>${esc(P.name)} · ${esc(P.fullName)}</b>`];
  if (r.suite) parts.push(r.module ? `<a href="${href(r.suite)}">${esc(r.suite.name)}</a>` : `<b>${esc(r.suite.name)}</b>`);
  if (r.module) parts.push(r.view ? `<a href="${href(r.suite, r.module)}">${esc(r.module.name)}</a>` : `<b>${esc(r.module.name)}</b>`);
  if (r.view) parts.push(`<b>${esc(r.view.name)}</b>`);
  $('#crumbs').innerHTML = parts.join('<span class="sep" aria-hidden="true">/</span>');
  const m = r.module;
  $('#top-actions').innerHTML = m ? `
    ${m.kind ? `<span class="prp-kind">${esc(kindLabel(m.kind))}</span>` : ''}
    <span class="prp-status" data-status="${esc(m.status)}">${esc(STATUS[m.status] || m.status)}</span>
    ${frameUrl ? `<button class="prp-btn sm" type="button" id="reload" title="Reload this page">⟳<span class="btn-label">Reload</span></button>
    <a class="prp-btn sm" href="${esc(new URL(frameUrl, location.href).href)}" target="_blank" rel="noopener" title="Open in a new tab">↗<span class="btn-label">New tab</span></a>` : ''}` : '';
  const reload = $('#reload');
  if (reload) reload.onclick = () => { const f = state.frames.get(frameUrl); if (f) { showLoading(); f.src = f.src; } };
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
  $('#view').innerHTML = `<div class="page">
    <header class="head">
      <div class="prp-eyebrow">${esc(P.name)} <span class="sep">·</span> ${esc(P.fullName)}</div>
      <h1 class="prp-title">Workspace</h1>
      <p class="prp-dek">${esc(P.tagline)} Realtime modules show what is happening now; Retrospective modules show what happened before and why.</p>
      <div class="prp-kpis">
        <div class="prp-kpi"><span>Modules</span><b>${state.registry.suites.length}</b></div>
        <div class="prp-kpi"><span>Submodules</span><b>${mods.length}</b></div>
        <div class="prp-kpi"><span>Realtime</span><b>${kinds.realtime || 0}</b></div>
        <div class="prp-kpi"><span>Retrospective</span><b>${kinds.retrospective || 0}</b></div>
      </div>
    </header>
    ${state.registry.suites.map((s, i) => `<section class="group" data-suite="${s.id}">
      <div class="group-head"><span class="prp-code">${esc(s.code)}</span><h2 class="prp-h2"><span class="prp-section-no">${i + 1}.</span>${esc(s.name)}</h2><a class="more" href="${href(s)}">Module overview →</a></div>
      <p>${esc(s.description)}</p>
      <div class="tiles">${s.modules.map(m => tile(s, m)).join('')}</div>
    </section>`).join('')}
    <footer class="footer"><span>${esc(P.name)}, the ${esc(P.fullName)}. A product of ${esc(P.company)}.</span><span>Registry v${esc(P.version)}</span></footer>
  </div>`;
}

function renderSuite(suite) {
  const live = suite.modules.filter(m => m.status === 'live').length;
  $('#view').innerHTML = `<div class="page" data-suite="${suite.id}">
    <header class="head">
      <div class="prp-eyebrow">${esc(state.registry.platform.name)} <span class="sep">/</span> Module ${esc(suite.code)}</div>
      <h1 class="prp-title">${esc(suite.name)}</h1><p class="prp-dek">${esc(suite.description)}</p>
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
    <div class="prp-eyebrow">${esc(suite.name)} <span class="sep">·</span> ${esc(kindLabel(m.kind))}</div>
    <h1 class="prp-title">${esc(m.name)}</h1><p class="prp-dek">${esc(m.description)}</p>${body}</div></div>`;
}
// Submodules behind their own sign-in (Cloudflare Access) can't sign in inside another site's frame: browsers block
// the third-party cookie. Registry flag: "opensInNewTab": true.
function renderLaunch(suite, m, url) {
  const abs = new URL(url, location.href).href;
  renderNotice(suite, m, `<div class="prp-note" style="margin-top:18px"><b>Opens in its own tab.</b> ${esc(m.name)} is private and asks you to sign in, which browsers don't allow inside another site's frame.</div>
    <div class="actions"><a class="prp-btn primary" href="${esc(abs)}" target="_blank" rel="noopener">Open ${esc(m.name)} ↗</a></div>`);
}

/* --- Frames: one persistent iframe per URL, so each submodule keeps its state -- */
function showLoading() { if (!$('#frames .loading-bar')) $('#frames').insertAdjacentHTML('afterbegin', '<div class="loading-bar" role="progressbar" aria-label="Loading"></div>'); }
function showFrame(url, title) {
  let frame = state.frames.get(url);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.title = title; frame.src = url; frame.allow = 'clipboard-write; fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    showLoading();
    frame.addEventListener('load', () => { $('#frames .loading-bar')?.remove(); postTheme(frame); });
    $('#frames').appendChild(frame);
    state.frames.set(url, frame);
  }
  state.frames.forEach(f => f.classList.toggle('active', f === frame));
}

/* --- Router ---------------------------------------------------------------- */
function route() {
  const r = parseRoute();
  // Rewrite old addresses (aliases, moved submodules, views that became submodules) to their canonical form.
  const canon = href(r.suite, r.module, r.view) + (r.query ? '?' + r.query : '');
  if ((r.suite || r.module) && location.hash !== canon && location.hash.replace(/^#\/?/, '#/') !== canon) { history.replaceState(null, '', canon); }
  state.route = r;
  if (r.suite) document.documentElement.dataset.suite = r.suite.id; else delete document.documentElement.dataset.suite;

  const url = r.module?.url ? (deepLink(r) || r.view?.url || r.module.url) : null;
  const newTab = r.view?.opensInNewTab ?? r.module?.opensInNewTab;
  const frameUrl = url && !newTab ? url : null;
  $('#view').hidden = !!frameUrl;
  $('#frames').hidden = !frameUrl;

  if (frameUrl) showFrame(frameUrl, `${r.module.name}${r.view ? ' · ' + r.view.name : ''}`);
  else if (url) renderLaunch(r.suite, r.module, url);
  else if (r.module) renderNotice(r.suite, r.module, `<div class="prp-note" style="margin-top:18px"><b>Not published yet.</b> It will open here once it has a live address.</div>`);
  else if (r.suite) renderSuite(r.suite);
  else renderHome();

  if (!frameUrl) $('#view').scrollTop = 0;
  const P = state.registry.platform;
  document.title = [r.view?.name, r.module?.name, r.suite && !r.module ? r.suite.name : null, r.suite ? P.name : `${P.name} · ${P.fullName}`].filter(Boolean).join(' · ');
  renderTop(r, frameUrl);
  highlightNav(r);
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
  document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); } });
}

function closeMenu() { $('#side').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); }
function setupMenu() {
  $('#menu').onclick = () => { const open = $('#side').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(open)); };
  $('#view').addEventListener('click', closeMenu);
}

(async function init() {
  setupTheme();
  try { state.registry = await fetch('registry.json', { cache: 'no-cache' }).then(r => r.json()); }
  catch (err) { $('#view').innerHTML = '<div class="page"><div class="prp-note">Could not load the module registry. Serve this folder over HTTP.</div></div>'; console.error(err); return; }
  renderNav();
  setupFind();
  setupMenu();
  window.addEventListener('hashchange', route);
  route();
})();
