/* JDP-I shell: renders suites and modules from registry.json and hosts each
   module in a persistent workspace frame. Routes: #/ · #/<suite> · #/<suite>/<module>[/<submodule>] */

const state = { registry: null, frames: new Map(), route: null };
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_LABEL = { 'live': 'Live', 'in-build': 'In build', 'planned': 'Planned' };

function allModules() {
  return state.registry.suites.flatMap(s => s.modules.map(m => ({ suite: s, module: m })));
}

function parseRoute() {
  // #/suite/module/sub?at=<address>: "at" deep-links to an exact place inside the module (see deepLink()).
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [suiteId, moduleId, subId] = path.split('/').filter(Boolean).map(decodeURIComponent);
  const at = new URLSearchParams(query).get('at');
  const suite = state.registry.suites.find(s => s.id === suiteId) || null;
  const module = suite?.modules.find(m => m.id === moduleId) || null;
  const sub = module?.submodules?.find(x => x.id === subId) || null;
  return { suite, module, sub, at };
}

// A deep link may only point at the module's own page (same origin and path), so the shell never frames
// arbitrary sites.
function deepLink(r) {
  if (!r.at || !r.module?.url) return null;
  try {
    const want = new URL(r.at, location.href), base = new URL(r.sub?.url || r.module.url, location.href);
    const strip = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    return want.origin === base.origin && strip(want.pathname) === strip(base.pathname) ? want.href : null;
  } catch { return null; }
}

function href(suite, module, sub) {
  return '#/' + [suite?.id, module?.id, sub?.id].filter(Boolean).map(encodeURIComponent).join('/');
}

/* --- Navigation ---------------------------------------------------------- */
function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = `<a class="nav-item" href="#/" data-route=""><span class="icon">⌂</span>Platform overview</a>` +
    state.registry.suites.map(suite => `
      <details class="suite" data-suite="${suite.id}" open>
        <summary><span class="code">${esc(suite.code)}</span>${esc(suite.title)}<span class="chev">›</span></summary>
        <a class="nav-item suite-overview" href="${href(suite)}" data-route="${suite.id}"><span class="icon">▤</span>Suite overview</a>
        ${suite.modules.map(m => m.submodules?.length ? `
          <details class="mod" data-search="${esc((m.name + ' ' + suite.title + ' ' + suite.code).toLowerCase())}">
            <summary data-route="${suite.id}/${m.id}"><span class="icon">${esc(m.icon)}</span>${esc(m.name)}<span class="status-dot" data-status="${m.status}" title="${STATUS_LABEL[m.status]}"></span><span class="chev">›</span></summary>
            <div class="subs">
              <a class="sub" href="${href(suite, m)}" data-route="${suite.id}/${m.id}">Overview</a>
              ${m.submodules.map(sub => `<a class="sub" href="${href(suite, m, sub)}" data-route="${suite.id}/${m.id}/${sub.id}">${esc(sub.name)}</a>`).join('')}
            </div>
          </details>` : `
          <a class="nav-item" href="${href(suite, m)}" data-route="${suite.id}/${m.id}" data-search="${esc((m.name + ' ' + suite.title + ' ' + suite.code).toLowerCase())}">
            <span class="icon">${esc(m.icon)}</span>${esc(m.name)}<span class="status-dot" data-status="${m.status}" title="${STATUS_LABEL[m.status]}"></span>
          </a>`).join('')}
      </details>`).join('');

  const mods = allModules();
  $('#side-foot').innerHTML = `<b>${esc(state.registry.platform.name)} · v${esc(state.registry.platform.version)}</b><br>` +
    `${state.registry.suites.length} suites · ${mods.length} modules · ${mods.filter(x => x.module.status === 'live').length} live`;
}

function highlightNav(route) {
  const key = [route.suite?.id, route.module?.id, route.sub?.id].filter(Boolean).join('/');
  document.querySelectorAll('#nav [data-route]').forEach(el => {
    el.toggleAttribute('aria-current', el.dataset.route === key);
    if (el.dataset.route === key) el.setAttribute('aria-current', 'page');
  });
  if (route.module?.submodules) {
    const details = document.querySelector(`#nav summary[data-route="${route.suite.id}/${route.module.id}"]`)?.parentElement;
    if (details) details.open = true;
  }
}

/* --- Top bar ------------------------------------------------------------- */
function renderTop(route, frameUrl) {
  const parts = [`<a href="#/">JDP-I</a>`];
  if (route.suite) parts.push(route.module ? `<a href="${href(route.suite)}">${esc(route.suite.code)}</a>` : `<b>${esc(route.suite.code)} · ${esc(route.suite.title)}</b>`);
  if (route.module) parts.push(route.sub ? `<a href="${href(route.suite, route.module)}">${esc(route.module.name)}</a>` : `<b>${esc(route.module.name)}</b>`);
  if (route.sub) parts.push(`<b>${esc(route.sub.name)}</b>`);
  if (!route.suite) parts[0] = `<b>JDP-I · Platform overview</b>`;
  $('#crumbs').innerHTML = parts.join('<span class="sep">›</span>');

  $('#top-actions').innerHTML = frameUrl ? `
    <span class="jdpi-tag" data-status="${route.module.status}"><i class="jdpi-dot"></i>${esc(route.module.host)}</span>
    <button class="jdpi-btn" type="button" id="reload" title="Reload module">⟳<span>Reload</span></button>
    <a class="jdpi-btn" href="${esc(new URL(frameUrl, location.href).href)}" target="_blank" rel="noopener" title="Open in a new tab">↗<span>New tab</span></a>` : '';
  const reload = $('#reload');
  if (reload) reload.onclick = () => {
    const frame = state.frames.get(frameUrl);
    if (frame) { showLoading(); frame.src = frame.src; }
  };
}

/* --- Views --------------------------------------------------------------- */
function moduleCard(suite, m) {
  const open = m.url ? `<a class="jdpi-btn primary" href="${href(suite, m)}">Open ${esc(m.name)}</a>` : `<span class="jdpi-btn" aria-disabled="true">Not yet published</span>`;
  const subs = (m.submodules || []).map(s => `<a class="jdpi-btn" href="${href(suite, m, s)}">${esc(s.name)}</a>`).join('');
  return `<article class="mod-card">
    <div class="row"><div class="mod-icon">${esc(m.icon)}</div><span class="jdpi-tag" data-status="${m.status}"><i class="jdpi-dot"></i>${STATUS_LABEL[m.status]}</span></div>
    <h3>${esc(m.name)}</h3>
    <p>${esc(m.description)}</p>
    <div class="links">${open}${subs}</div>
    <div class="host" style="margin-top:12px">Hosted on ${esc(m.host)}</div>
  </article>`;
}

function renderHome() {
  const mods = allModules();
  $('#view').innerHTML = `<div class="page">
    <section class="hero">
      <div><div class="jdpi-eyebrow">${esc(state.registry.platform.name)} · ${esc(state.registry.platform.tagline)}</div>
        <h1 class="jdpi-h1">Platform overview</h1>
        <p>Three suites, one workspace. Choose a suite to see its modules, or open any module from the sidebar. Modules keep their state while you switch between them.</p></div>
      <div class="stats">
        <div class="stat"><b>${String(state.registry.suites.length).padStart(2, '0')}</b><span>Suites</span></div>
        <div class="stat"><b>${String(mods.length).padStart(2, '0')}</b><span>Modules</span></div>
        <div class="stat"><b>${String(mods.filter(x => x.module.status === 'live').length).padStart(2, '0')}</b><span>Live</span></div>
      </div>
    </section>
    <div class="section-head"><h2 class="jdpi-h2">Suites</h2><span class="jdpi-label">Select to open</span></div>
    <section class="suite-grid">${state.registry.suites.map(s => `
      <a class="suite-card" data-suite="${s.id}" href="${href(s)}">
        <span class="code">${esc(s.code)}${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.description)}</p>
        <ul>${s.modules.map(m => `<li><span class="icon">${esc(m.icon)}</span>${esc(m.name)}<span class="status-dot" data-status="${m.status}" title="${STATUS_LABEL[m.status]}"></span></li>`).join('')}</ul>
      </a>`).join('')}
    </section>
    <footer class="footer"><span>${esc(state.registry.platform.name)} · INTEGRATED INTELLIGENCE PLATFORM</span><span>MODULE REGISTRY v${esc(state.registry.platform.version)}</span></footer>
  </div>`;
}

function renderSuite(suite) {
  const live = suite.modules.filter(m => m.status === 'live').length;
  $('#view').innerHTML = `<div class="page">
    <section class="hero">
      <div><div class="jdpi-eyebrow">${esc(suite.name)} · ${esc(suite.title)}</div>
        <h1 class="jdpi-h1">${esc(suite.title)}</h1><p>${esc(suite.description)}</p></div>
      <div class="stats">
        <div class="stat"><b>${String(suite.modules.length).padStart(2, '0')}</b><span>Modules</span></div>
        <div class="stat"><b>${String(live).padStart(2, '0')}</b><span>Live</span></div>
      </div>
    </section>
    <div class="section-head"><h2 class="jdpi-h2">Modules</h2><span class="jdpi-label">${esc(suite.code)} suite</span></div>
    <section class="mod-grid">${suite.modules.map(m => moduleCard(suite, m)).join('')}</section>
    <footer class="footer"><span>${esc(suite.name)} · ${esc(suite.title.toUpperCase())}</span><span>JDP-I</span></footer>
  </div>`;
}

function renderPlaceholder(suite, m) {
  $('#view').innerHTML = `<div class="page"><div class="jdpi-panel placeholder">
    <div class="mod-icon">${esc(m.icon)}</div>
    <div class="jdpi-eyebrow">${esc(suite.name)} · ${STATUS_LABEL[m.status]}</div>
    <h1 class="jdpi-h1">${esc(m.name)}</h1>
    <p class="jdpi-muted">${esc(m.description)}</p>
    <div class="jdpi-note" style="margin-top:18px"><b>Not published yet.</b> This module will open here once it has a live URL in <code>registry.json</code>. Planned host: ${esc(m.host)}.</div>
  </div></div>`;
}

// Modules behind their own sign-in (e.g. Cloudflare Access) can't sign in inside a cross-site iframe,
// because browsers block third-party cookies there. Registry flag: "opensInNewTab": true.
function renderLaunch(suite, m, url) {
  const abs = new URL(url, location.href).href;
  $('#view').innerHTML = `<div class="page"><div class="jdpi-panel placeholder">
    <div class="mod-icon">${esc(m.icon)}</div>
    <div class="jdpi-eyebrow">${esc(suite.name)} · ${STATUS_LABEL[m.status]}</div>
    <h1 class="jdpi-h1">${esc(m.name)}</h1>
    <p class="jdpi-muted">${esc(m.description)}</p>
    <div class="jdpi-note" style="margin-top:18px"><b>Opens in its own tab.</b> ${esc(m.name)} is private and asks you to sign in, which browsers don't allow inside another site's frame.</div>
    <p style="margin-top:18px"><a class="jdpi-btn primary" href="${esc(abs)}" target="_blank" rel="noopener">Open ${esc(m.name)} ↗</a></p>
  </div></div>`;
}

/* --- Module frames: one persistent iframe per module URL ---------------- */
function showLoading() {
  if (!$('#frames .loading-bar')) $('#frames').insertAdjacentHTML('afterbegin', '<div class="loading-bar"></div>');
}

function showFrame(url, title) {
  const frames = $('#frames');
  let frame = state.frames.get(url);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.title = title;
    frame.src = url;
    frame.allow = 'clipboard-write; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    showLoading();
    frame.addEventListener('load', () => $('#frames .loading-bar')?.remove());
    frames.appendChild(frame);
    state.frames.set(url, frame);
  }
  state.frames.forEach(f => f.classList.toggle('active', f === frame));
}

/* --- Router -------------------------------------------------------------- */
function route() {
  const r = parseRoute();
  state.route = r;
  const suiteId = r.suite?.id || '';
  if (suiteId) document.documentElement.dataset.suite = suiteId; else delete document.documentElement.dataset.suite;

  const moduleUrl = r.module?.url ? (deepLink(r) || r.sub?.url || r.module.url) : null;
  const frameUrl = moduleUrl && !r.module.opensInNewTab ? moduleUrl : null;
  $('#view').hidden = !!frameUrl;
  $('#frames').hidden = !frameUrl;

  if (frameUrl) showFrame(frameUrl, `${r.module.name}${r.sub ? ' · ' + r.sub.name : ''}`);
  else if (moduleUrl) renderLaunch(r.suite, r.module, moduleUrl);
  else if (r.module) renderPlaceholder(r.suite, r.module);
  else if (r.suite) renderSuite(r.suite);
  else renderHome();

  if (!frameUrl) $('#view').scrollTop = 0;
  document.title = [r.sub?.name, r.module?.name, r.suite && !r.module ? r.suite.title : null, r.suite ? r.suite.name : 'JDP-I'].filter(Boolean).join(' · ');
  renderTop(r, frameUrl);
  highlightNav(r);
  closeMenu();
}

/* --- Sidebar search & mobile menu ---------------------------------------- */
function setupFind() {
  const input = $('#find');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('#nav [data-search]').forEach(el => { el.hidden = q && !el.dataset.search.includes(q); });
    document.querySelectorAll('#nav .suite').forEach(s => {
      const anyVisible = [...s.querySelectorAll('[data-search]')].some(el => !el.hidden);
      s.hidden = q && !anyVisible;
      if (q) s.open = true;
    });
    document.querySelectorAll('#nav .suite-overview, #nav > .nav-item').forEach(el => { el.hidden = !!q; });
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = [...document.querySelectorAll('#nav [data-search]')].find(el => !el.hidden);
      const target = first?.matches('a') ? first : first?.querySelector('a.sub');
      if (target) { location.hash = target.getAttribute('href'); input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); }
    } else if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); }
  });
}

function closeMenu() { $('#side').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); }
function setupMenu() {
  $('#menu').onclick = () => {
    const open = $('#side').classList.toggle('open');
    $('#menu').setAttribute('aria-expanded', open);
  };
  $('#view').addEventListener('click', closeMenu);
}

(async function init() {
  try {
    state.registry = await fetch('registry.json', { cache: 'no-cache' }).then(r => r.json());
  } catch (err) {
    $('#view').innerHTML = '<div class="page"><div class="jdpi-note">Could not load the module registry. Serve this folder over HTTP.</div></div>';
    console.error(err);
    return;
  }
  renderNav();
  setupFind();
  setupMenu();
  window.addEventListener('hashchange', route);
  route();
})();
