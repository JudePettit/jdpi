/* A page of Vitruvian Manager in a pane beside a page's main content: Kino's Split view, Bibliotheca's pane.
   An ES module of exports only: loading it does nothing to a page, and the pure parts (frameMove, clampShare,
   canFrame) run in Node for the tests. It imports nothing from Kino or Bibliotheca.

   A place is one exact address inside a submodule:
     { module, suite,   registry ids ('war-focus', 'rs')
       name, label,     what the pane's head says ('War Focus', 'September 1939')
       code,            the module's code chip ('RS'), when the host knows it
       page,            the absolute address to frame
       href,            what "Open" opens in a new tab: the shell at that place
       hash,            the shell route, used inside the shell ('#/rs/war-focus?at=…')
       onOpen }         optional: the host opens it itself (Kino's other films)
   toShell(hash) is the host's own function that moves the shell (shellGo in both pages); shell is the shell's address,
   for the tab a host opens when there is no shell around it.

   Five rules (PRP-KINO-BIBLIOTHECA-DESIGN.md, section 3.6): a framed page takes the host's theme; on its own, a link in
   a framed page that would open at the top opens a new tab instead; a framed page that asks the shell to move
   ('prp:navigate') is passed on inside the shell and opened in a new tab without one; the shell leaves full screen
   when it changes the frame in view (shell.js); and a page shown in a pane (its frame is named 'prp-side', which
   stays with the frame as it moves) offers no pane of its own. Styles: design/prp-split.css. */

/* ---------- pure parts ---------- */

/* Cloudflare Pages serves /x/index.html at /x/ and /x.html at /x (with a 308, as tests/tools/serve.mjs does
   locally), so a frame asked for encyclopedia/index.html#Q1 is at encyclopedia/#Q1 once loaded: page addresses are
   compared without index.html and .html, and a hash-only move is written on the frame's own address. */
export const stripPage = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
export const samePage = (a, b) => a.origin === b.origin && stripPage(a.pathname) === stripPage(b.pathname) && a.search === b.search;

/** How to send a frame from where it is to where it should be, the way the shell moves its own (shell.js):
      { how: 'none' }               already there;
      { how: 'hash', url }          the same page with another hash: location.replace(url), no reload;
      { how: 'load', url }          another page (or another query): load it.
    `from` is the frame's current address (null when it has none yet, or it is on another origin). */
export function frameMove(from, to, base = 'http://localhost/') {
  const want = new URL(to, base);
  let here = null;
  try { here = from && from !== 'about:blank' ? new URL(from, base) : null; } catch { here = null; }
  if (!here) return { how: 'load', url: want.href };
  if (here.href === want.href) return { how: 'none' };
  if (samePage(here, want)) {
    if (here.hash === want.hash) return { how: 'none' };
    // Dropping the hash altogether is a navigation (only a move to another fragment stays in the document).
    if (!want.hash) return { how: 'load', url: want.href };
    const moved = new URL(here.href); moved.hash = want.hash;
    return { how: 'hash', url: moved.href };
  }
  return { how: 'load', url: want.href };
}

/** The pane's share of the container's width, in per cent: inside [min, max], and, where the container is wide enough
    for both, leaving the main content at least minMain px and the pane at least minSide px. Where it is not, the two
    minimums share the width in proportion. */
export function clampShare(share, width, { min = 25, max = 60, minMain = 0, minSide = 0 } = {}) {
  let s = Number.isFinite(+share) && share !== null && share !== '' ? +share : min;
  s = Math.min(max, Math.max(min, s));
  if (width > 0 && (minMain || minSide)) {
    const lo = (minSide / width) * 100, hi = 100 - (minMain / width) * 100;
    s = lo <= hi ? Math.min(hi, Math.max(lo, s)) : (minSide / (minMain + minSide)) * 100;
  }
  return Math.round(s * 10) / 10;
}

/** A submodule by its id or one of its aliases: { suite, module }, or null. */
export function findModule(registry, id) {
  for (const s of registry?.suites || []) {
    const m = (s.modules || []).find(x => x.id === id || x.aliases?.includes(id));
    if (m) return { suite: s, module: m };
  }
  return null;
}

/** Whether a place can be shown in a pane, by the shell's own rule (deepLink and renderLaunch in shell.js): its
    submodule is in the registry with a page, is not marked opensInNewTab, and the address is on that page.
      { ok: true } or { ok: false, why: 'private' | 'elsewhere' | 'unlisted' } */
export function canFrame(place, registry, base = 'http://localhost/') {
  const hit = findModule(registry, place?.module);
  if (!hit || !hit.module.url) return { ok: false, why: 'unlisted' };
  if (hit.module.opensInNewTab) return { ok: false, why: 'private' };
  try {
    const want = new URL(place.page, base), own = new URL(hit.module.url, base);
    if (want.origin !== own.origin || stripPage(want.pathname) !== stripPage(own.pathname)) return { ok: false, why: 'elsewhere' };
  } catch { return { ok: false, why: 'elsewhere' }; }
  return { ok: true };
}

/** The only routes shell.js accepts from a page. */
export const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;

/* ---------- in the page ---------- */

/** True in a page shown in a pane: it then offers no pane of its own (rule 5). */
export const inSidePane = () => { try { return window.name === 'prp-side'; } catch { return false; } };

/** Moves the shell to a route, from a page inside it (Kino and Bibliotheca): the shell's listener first ('prp:navigate',
    which the shell only accepts from its own origin); if the shell has not moved in 350 ms (an older shell), its
    address is set directly, but only if it has not moved at all meanwhile (a reader who moved it and came back within
    the wait, by the sidebar or Back, would otherwise be sent to this route again). In another page's pane the parent is
    that page, not the shell: it is only asked, and passes the request on or opens a new tab (sideFrame). */
export function shellGo(hash) {
  window.parent.postMessage({ type: 'prp:navigate', hash }, location.origin);
  if (inSidePane()) return;
  let before = null, moved = false;
  const mark = () => { moved = true; };
  try { before = window.top.location.hash; window.top.addEventListener('hashchange', mark, { once: true }); } catch { /* the shell is on another origin */ }
  setTimeout(() => {
    try { window.top.removeEventListener('hashchange', mark); if (!moved && before !== null && window.top.location.hash === before) window.top.location.hash = hash; } catch { /* only the listener can */ }
  }, 350);
}

const theme = () => window.prpTheme?.() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
/** The host's theme, for a framed page (design/prp-bar.js takes it from its parent only). */
export function postTheme(f) { try { f.contentWindow?.postMessage({ type: 'prp:theme', theme: theme() }, '*'); } catch { /* not loaded */ } }

/** On its own, a link in a framed page that would open at the top (it believes it is in the shell) opens in a new tab
    instead of replacing the host; its address is already the shell's route to the place. Inside the shell the top is
    the shell, which is right. The link's target is changed as the click goes down to it (capture), so the browser's own
    new-tab handling does the rest. Called on each page a frame loads; a page on another site keeps its links. */
export function keepTop(f, embedded) {
  if (embedded) return;
  try {
    f.contentDocument?.addEventListener('click', e => {
      const a = e.target.closest?.('a[target="_top"], a[target="_parent"]');
      if (a) { a.target = '_blank'; a.relList.add('noopener'); }
    }, true);
  } catch { /* another origin: its links are its own */ }
}

/** Whether a frame's page is a submodule's page: true when it loaded the connector (design/prp-bar.js), false when it
    did not (a missing page: the live site answers one with the shell itself, the local server with a 404), null on
    another origin, where that cannot be seen. */
export function connected(f) {
  let doc;
  try { doc = f.contentDocument; } catch { return null; }
  if (!doc) return null;
  return !!doc.querySelector('script[src*="prp-bar.js"], script[src*="jdpi-bar.js"]');
}

/** Opens an address in a new tab, without giving it this page; false when the browser refused. */
export function openTab(url) {
  const w = window.open(url, '_blank');
  if (!w) return false;
  try { w.opener = null; } catch { /* another origin */ }
  return true;
}

/** Sends a frame to an address, by hash alone when only the hash differs (no reload), as shell.js does: 'none',
    'hash' or 'load'. While a page it was sent to has not yet replaced the one before, the new address loads afresh. */
export function moveFrame(f, url) {
  let from = null;
  try {
    const here = f.contentWindow?.location.href;
    if (here && here !== 'about:blank' && !(f.dataset.loading && f.dataset.url && !samePage(new URL(here), new URL(f.dataset.url)))) from = here;
  } catch { from = f.dataset.url || null; }
  const move = frameMove(from, url, location.href);
  f.dataset.url = new URL(url, location.href).href;
  if (move.how === 'none') return 'none';
  if (move.how === 'hash') { try { f.contentWindow.location.replace(move.url); return 'hash'; } catch { /* load it below */ } }
  f.dataset.loading = '1';
  // location.replace keeps the frame's moves out of the page's history; the first load sets src.
  if (!f.getAttribute('src')) f.src = move.url; else { try { f.contentWindow.location.replace(move.url); } catch { f.src = move.url; } }
  return 'load';
}

/** A pane frame: named 'prp-side', moved like the shell's frames, given the host's theme, its top links kept (rule 2)
    and its requests to move the shell answered (rule 3).
      const sf = sideFrame(iframe, { embedded, shell, toShell, onLoad({ ok, frame }), onBlocked(url) });
      sf.go(url)  // 'none' | 'hash' | 'load'
      sf.drop()   // its listeners go; the frame stays where the host put it */
export function sideFrame(f, { embedded = false, shell = new URL('/', location.href).href, toShell = () => {}, onLoad = () => {}, onBlocked = () => {} } = {}) {
  f.name = 'prp-side';
  if (!f.getAttribute('referrerpolicy')) f.referrerPolicy = 'strict-origin-when-cross-origin';
  const loaded = () => {
    let at = '';
    try { at = f.contentWindow?.location.href || ''; } catch { at = 'elsewhere'; }
    if (at === 'about:blank' && f.dataset.url && f.dataset.url !== 'about:blank') return; // the empty page before the first load
    delete f.dataset.loading;
    postTheme(f);
    const ok = connected(f) !== false;
    if (ok) keepTop(f, embedded);
    onLoad({ ok, frame: f });
  };
  const message = e => {
    if (e.source !== f.contentWindow || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'jdpi:module-ready' || e.data.type === 'prp:hello') postTheme(f);
    const hash = String(e.data.hash || '');
    if (e.data.type === 'prp:navigate' && e.origin === location.origin && SHELL_ROUTE.test(hash)) {
      if (embedded) toShell(hash);
      else { const url = new URL(hash, shell).href; if (!openTab(url)) onBlocked(url); }
    }
  };
  const themed = () => postTheme(f);
  f.addEventListener('load', loaded);
  window.addEventListener('message', message);
  window.addEventListener('prp:themechange', themed);
  return {
    frame: f,
    go: url => moveFrame(f, url),
    drop() { f.removeEventListener('load', loaded); window.removeEventListener('message', message); window.removeEventListener('prp:themechange', themed); },
  };
}

/* A page opens with its own front matter (title, description, readings), a third of a pane's height; in a pane the
   page's body is the point. Every submodule page ends that front matter with its .prp-meta line, so once the page has
   loaded the frame is scrolled to just below it. A page is still drawing as it loads (a map, a timeline), and the meta
   line itself grows when its "Loading…" becomes the readings, so the scroll follows both for a few seconds, until the
   reader touches the frame. Same origin; only the frame's scroll moves. */
export function skipFrontMatter(f) {
  let win, doc;
  try { win = f.contentWindow; doc = f.contentDocument; } catch { return; } // another origin
  const meta = doc?.querySelector('.prp-meta');
  if (!meta || !win) return;
  let ro = null, timer = 0, done = false;
  const stop = () => { done = true; ro?.disconnect(); clearTimeout(timer); };
  const go = () => { if (!done) win.scrollTo(0, Math.max(0, Math.round(meta.getBoundingClientRect().bottom + win.scrollY + 4))); };
  try { ro = new win.ResizeObserver(go); ro.observe(doc.documentElement); ro.observe(meta); } catch { /* no ResizeObserver: once is all */ }
  timer = setTimeout(stop, 8000);
  for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.addEventListener(ev, stop, { once: true, passive: true });
  go();
}

/* The Master Index opens with its own front matter (title, search, counts). Once the page has drawn the entry asked
   for (it replaces #entity's contents: "Loading…", then the entry with its h2), the frame is scrolled to the page's
   tabs, just above the entry. A page that never draws an h2 (no such entry) is left where it is. */
const watching = new WeakMap();
export function watchEntry(f) {
  let doc, win;
  try { doc = f.contentDocument; win = f.contentWindow; } catch { return; }
  const box = doc?.getElementById('entity');
  if (!box || !win) return;
  watching.get(f)?.disconnect();
  const mo = new MutationObserver(() => {
    if (!box.querySelector('h2')) return;
    mo.disconnect();
    const tabs = doc.querySelector('[role="tablist"]') || box;
    win.scrollTo({ top: Math.max(0, tabs.getBoundingClientRect().top + win.scrollY - 4), behavior: 'auto' });
  });
  mo.observe(box, { childList: true });
  watching.set(f, mo);
  setTimeout(() => mo.disconnect(), 20000);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** How "Open" reaches a place: { href, target, inShell } (inShell: the host moves the shell instead of following it). */
export function openWay(place, why, { embedded = false } = {}) {
  if (why === 'private' || why === 'elsewhere' || why === 'unlisted') return { href: place.page, target: '_blank', inShell: false };
  return { href: place.href || place.page, target: embedded ? '_top' : '_blank', inShell: embedded && !!place.hash };
}

/** What a pane shows for a place it cannot frame (why: 'private', 'elsewhere', 'unlisted', 'missing', 'film',
    'none'). The element has data-why; its button, if any, is a link or calls place.onOpen. */
export function card(place, why, { embedded = false, toShell = () => {}, onOpen = () => {}, text } = {}) {
  const el = document.createElement('div');
  el.className = 'prp-side-card';
  el.dataset.why = why;
  const name = place?.name || 'This page';
  const say = text || {
    private: `${name} is private and asks you to sign in, which browsers do not allow inside another page.`,
    elsewhere: 'This page cannot be shown here.',
    unlisted: 'This page cannot be shown here.',
    missing: 'This page could not be shown here.',
    film: `This scene points to another film${place?.label ? `: ${place.label}` : ''}.`,
    none: 'This scene has no place in Vitruvian Manager.',
  }[why] || 'This page cannot be shown here.';
  const button = { private: `Open ${name}`, elsewhere: 'Open', unlisted: 'Open', missing: 'Open in Vitruvian Manager', film: 'Open the film' }[why];
  el.innerHTML = `<p>${esc(say)}</p>`;
  if (button && place && why !== 'none') {
    const way = openWay(place, why, { embedded });
    const a = document.createElement('a');
    a.className = 'prp-btn sm'; a.href = way.href || '#'; a.target = way.target; a.rel = 'noopener';
    a.textContent = `${button} ↗`;
    a.addEventListener('click', e => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      onOpen(place);
      if (place.onOpen) { e.preventDefault(); place.onOpen(); return; }
      if (way.inShell) { e.preventDefault(); toShell(place.hash); }
    });
    el.appendChild(a);
  }
  return el;
}

/** The pane: a head (the submodule's code, the place, Hold, Open, close) over one frame per submodule, the six shown
    most recently kept and the rest dropped (a page in a hidden frame keeps running), or a card.
      const pane = sidePane(aside, { registry, base, embedded, toShell, onHold(on), onClose(), onOpen(place), max });
      pane.show(place)  // 'frame' | the card's why
      pane.clear(text)  // a card with this text, no frame
      pane.setHold(on); pane.drop()  // every frame goes
    pane.current is the place shown (null after clear and drop). */
export function sidePane(host, { registry = null, base = new URL('/', location.href).href, embedded = false, toShell = () => {}, onHold = () => {}, onClose = () => {},
  onOpen = () => {}, onBlocked = () => {}, max = 6, holdTitle = 'Hold: keep this page (H)', closeLabel = 'Close the pane' } = {}) {
  host.classList.add('prp-side');
  host.querySelector('.prp-side-head')?.remove(); host.querySelector('.prp-side-body')?.remove();
  host.insertAdjacentHTML('beforeend', `<div class="prp-side-head">
      <span class="prp-code" data-side-code hidden></span>
      <span class="prp-side-label" data-side-label></span>
      <button type="button" class="prp-btn sm" data-side-hold aria-pressed="false" title="${esc(holdTitle)}">Hold</button>
      <a class="prp-btn sm" data-side-open href="#" target="_blank" rel="noopener" title="Open this page in Vitruvian Manager">Open ↗</a>
      <button type="button" class="prp-btn sm ghost" data-side-close aria-label="${esc(closeLabel)}" title="${esc(closeLabel)}">✕</button>
    </div><div class="prp-side-body"></div>`);
  const $ = s => host.querySelector(s);
  const body = $('.prp-side-body'), frames = new Map();
  let seq = 0, current = null, way = null;
  const pane = {
    el: host,
    get current() { return current; },
    frames,
    show(place) {
      current = place;
      const fit = place.film ? { ok: false, why: 'film' } : canFrame(place, registry, base);
      head(place, fit.ok ? null : fit.why);
      if (!fit.ok) { showCard(card(place, fit.why, { embedded, toShell, onOpen })); return fit.why; }
      const key = place.module;
      let rec = frames.get(key);
      if (!rec) {
        const f = document.createElement('iframe');
        f.className = 'prp-side-frame';
        f.dataset.module = key;
        rec = { f, sf: null, at: 0 };
        rec.sf = sideFrame(f, { embedded, shell: base, toShell, onBlocked, onLoad: ({ ok }) => loaded(rec, ok) });
        frames.set(key, rec);
        rec.sf.go(place.page);
        body.appendChild(f);
      } else if (rec.sf.go(place.page) === 'hash' && key === 'encyclopedia') watchEntry(rec.f);
      rec.at = ++seq;
      rec.f.title = place.label ? `${place.name} · ${place.label}` : place.name;
      for (const r of frames.values()) r.f.hidden = r !== rec;
      body.querySelector('.prp-side-card')?.remove();
      // Six frames at most: the one shown longest ago goes.
      while (frames.size > max) {
        const old = [...frames.entries()].filter(([, r]) => r !== rec).sort((a, b) => a[1].at - b[1].at)[0];
        drop(old[0]);
      }
      return 'frame';
    },
    clear(text) {
      current = null;
      head(null, 'none');
      showCard(card(null, 'none', { text }));
    },
    setHold(on) { $('[data-side-hold]').setAttribute('aria-pressed', String(!!on)); },
    drop() { for (const k of [...frames.keys()]) drop(k); current = null; body.querySelector('.prp-side-card')?.remove(); },
  };
  function drop(key) { const r = frames.get(key); if (!r) return; r.sf.drop(); r.f.remove(); frames.delete(key); }
  function loaded(rec, ok) {
    if (!ok) {
      // A missing page (the live site answers one with the shell itself): its frame goes, so no shell runs in a pane.
      const place = current && frames.get(current.module) === rec ? current : null;
      drop(rec.f.dataset.module);
      if (place) { head(place, 'missing'); showCard(card(place, 'missing', { embedded, toShell, onOpen })); }
      return;
    }
    if (rec.f.dataset.module === 'encyclopedia') watchEntry(rec.f); else skipFrontMatter(rec.f);
  }
  function showCard(el) {
    for (const r of frames.values()) r.f.hidden = true;
    body.querySelector('.prp-side-card')?.remove();
    body.appendChild(el);
  }
  function head(place, why) {
    const code = $('[data-side-code]');
    code.hidden = !place?.code; code.textContent = place?.code || ''; code.dataset.suite = place?.suite || '';
    $('[data-side-label]').innerHTML = place ? `<b>${esc(place.name || '')}</b>${place.label && place.label !== place.name ? ` · ${esc(place.label)}` : ''}` : '';
    $('[data-side-label]').title = place ? `${place.name || ''}${place.label ? ` · ${place.label}` : ''}` : '';
    const open = $('[data-side-open]');
    open.hidden = !place || why === 'none';
    way = place ? openWay(place, why, { embedded }) : null;
    if (way) { open.href = way.href || '#'; open.target = way.target; }
  }
  $('[data-side-hold]').addEventListener('click', () => onHold($('[data-side-hold]').getAttribute('aria-pressed') !== 'true'));
  $('[data-side-close]').addEventListener('click', () => onClose());
  $('[data-side-open]').addEventListener('click', e => {
    if (!current || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    onOpen(current);
    if (current.onOpen) { e.preventDefault(); current.onOpen(); return; }
    if (way?.inShell) { e.preventDefault(); toShell(current.hash); }
  });
  return pane;
}

/** The divider between the main content and the pane: the pane's own left edge, dragged with any pointer or moved
    with the keys (Left wider, Right narrower, two points a press; Home and End the limits; Enter, or a double click,
    where it began). It sets data-dir on the container ('row' from rowFrom px of page width, 'column' below) and
    --prp-split-share (the pane's share, in per cent), and saves the share in this browser under storeKey.
      const sp = splitter(container, pane, { share: 40, min: 25, max: 60, minMain: 480, minSide: 328, rowFrom: 901, storeKey, label, onStart, onEnd });
      sp.share; sp.set(share); sp.update(); sp.drop() */
export function splitter(container, pane, { share = 40, min = 25, max = 60, minMain = 0, minSide = 0, rowFrom = 901, storeKey = '', label = 'Resize the pane', onStart = () => {}, onEnd = () => {} } = {}) {
  const read = () => { try { const v = storeKey ? localStorage.getItem(storeKey) : null; return v === null ? null : JSON.parse(v); } catch { return null; } };
  const save = v => { try { if (storeKey) localStorage.setItem(storeKey, JSON.stringify(v)); } catch { /* private mode */ } };
  const limits = { min, max, minMain, minSide };
  let want = Number.isFinite(+read()) && read() !== null ? +read() : share, now = want;
  let bar = pane.querySelector(':scope > .prp-split-bar');
  if (!bar) { bar = document.createElement('div'); bar.className = 'prp-split-bar'; pane.prepend(bar); }
  Object.assign(bar, { tabIndex: 0 });
  bar.setAttribute('role', 'separator'); bar.setAttribute('aria-orientation', 'vertical'); bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', String(min)); bar.setAttribute('aria-valuemax', String(max));
  const mq = matchMedia(`(min-width: ${rowFrom}px)`);
  const width = () => container.getBoundingClientRect().width;
  const apply = () => {
    now = clampShare(want, width(), limits);
    container.style.setProperty('--prp-split-share', `${now}%`);
    bar.setAttribute('aria-valuenow', String(Math.round(now)));
    bar.setAttribute('aria-valuetext', `The pane takes ${Math.round(now)}% of the width`);
  };
  const update = () => { container.dataset.dir = mq.matches ? 'row' : 'column'; bar.hidden = !mq.matches; apply(); };
  const set = (v, keep = true) => { want = Math.min(max, Math.max(min, +v)); apply(); want = now; if (keep) save(now); };

  let drag = null;
  const down = e => {
    if (e.button !== 0 || container.dataset.dir !== 'row') return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, from: now }; // the pane's edge moves with the pointer, wherever it was held
    try { bar.setPointerCapture(e.pointerId); } catch { /* the pointer has gone */ }
    container.classList.add('dragging');
    onStart();
  };
  const move = e => {
    if (!drag || e.pointerId !== drag.id) return;
    set(drag.from + ((drag.x - e.clientX) / width()) * 100, false);
  };
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    try { bar.releasePointerCapture(e.pointerId); } catch { /* released */ }
    container.classList.remove('dragging');
    save(now);
    onEnd();
  };
  const key = e => {
    const k = e.key, step = { ArrowLeft: 2, ArrowRight: -2 }[k];
    if (step === undefined && !['Home', 'End', 'Enter'].includes(k)) return;
    e.preventDefault(); e.stopPropagation();
    onStart();
    if (step !== undefined) set(now + step); else if (k === 'Home') set(min); else if (k === 'End') set(max); else set(share);
    onEnd();
  };
  const reset = () => { onStart(); set(share); onEnd(); };
  bar.addEventListener('pointerdown', down);
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', up);
  bar.addEventListener('pointercancel', up);
  bar.addEventListener('keydown', key);
  bar.addEventListener('dblclick', reset);
  const ro = new ResizeObserver(() => apply());
  ro.observe(container);
  mq.addEventListener?.('change', update);
  update();
  return {
    bar,
    get share() { return now; },
    set,
    update,
    drop() { ro.disconnect(); mq.removeEventListener?.('change', update); for (const [ev, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['keydown', key], ['dblclick', reset]]) bar.removeEventListener(ev, fn); },
  };
}

/** Full screen for one element, through the browser's Fullscreen API. It sets data-prp-fs on <html> while its
    target is in full screen, and tells the host however full screen ended (the key, the button, Escape, the shell).
    supported is false where the browser has no full screen for elements (an iPhone): the host then hides its button.
      const fs = fullScreen(el, { onChange(on) }); fs.supported; fs.on; fs.toggle() (inside a press); fs.exit() */
export function fullScreen(target, { onChange = () => {} } = {}) {
  const supported = typeof target.requestFullscreen === 'function';
  const isOn = () => document.fullscreenElement === target;
  let was = false;
  const changed = () => {
    const on = isOn();
    document.documentElement.toggleAttribute('data-prp-fs', on);
    if (on !== was) { was = on; onChange(on); }
  };
  document.addEventListener('fullscreenchange', changed);
  const exit = () => { if (isOn()) return document.exitFullscreen().catch(() => {}); return Promise.resolve(); };
  return {
    supported,
    get on() { return isOn(); },
    toggle() { if (isOn()) return exit(); return supported ? target.requestFullscreen().catch(() => {}) : Promise.resolve(); },
    exit,
    drop() { document.removeEventListener('fullscreenchange', changed); },
  };
}
