/* PRP module connector (design/prp-bar.js; design/jdpi-bar.js is an identical copy kept for older pages).
   Add to any submodule page:
     <script src="https://jdpi.pages.dev/design/prp-bar.js" data-suite="rt" data-module="atlas" defer></script>
   - Inside the PRP shell (iframe): adds .prp-embedded/.jdpi-embedded to <html> so elements marked data-jdpi-standalone
     hide, announces the page to the shell, and takes the shell's light/dark theme (postMessage "prp:theme").
   - Opened directly: shows a slim "VM / Module / Submodule" bar linking back to the shell (Vitruvian Manager, short VM),
     with a theme switch.
   - Everywhere: applies the saved theme, sets the module accent, and loads the Encyclopaedia linker.
   Pages that draw in canvas or SVG with theme colours should redraw on the window event "prp:themechange". */
(function () {
  const script = document.currentScript;
  const SHELL = (script && script.dataset.shell) || 'https://jdpi.pages.dev/';
  const moduleId = (script && script.dataset.module) || '';
  // Old suite ids, and submodules that moved to another module in PRP 2.0.
  const CANON = { q: 'rt', hp: 'rs', fe: 'mm' };
  const MOVED = { atlas: 'rt', 'trade-desk': 'mm', markets: 'mm', 'tally-stick': 'mm', 'algo-trader': 'mm', 'double-signal': 'mm', traders: 'mm', 'learning-politics': 'rs', 'osint-training': 'oi', osint: 'oi', sigint: 'oi', geoint: 'oi' };
  // Module names as the sidebar shows them (registry "name"), and the full title where the name is abbreviated (registry
  // "title"), which the bar gives as a tooltip.
  const NAMES = { rt: 'Realtime Geopolitics', rs: 'Retrospective Geopolitics', oi: 'Int-Myst Mngmnt', mm: 'Money Management', ns: 'Natural Science', ds: 'Digital Science', kino: 'Kino' };
  const TITLES = { oi: 'International Mystery Management' };
  const given = (script && script.dataset.suite) || '';
  const suite = MOVED[moduleId] || CANON[given] || given;

  const root = document.documentElement;
  root.dataset.suite = suite || root.dataset.suite || '';

  /* Theme: the shell's choice when embedded; otherwise this site's saved choice, or the system setting. */
  const store = { get() { try { return localStorage.getItem('prp.theme'); } catch { return null; } }, set(v) { try { if (v === 'system') localStorage.removeItem('prp.theme'); else localStorage.setItem('prp.theme', v); } catch { /* ignore */ } } };
  const setTheme = t => {
    if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
    window.dispatchEvent(new CustomEvent('prp:themechange', { detail: { theme: currentTheme() } }));
  };
  const currentTheme = () => root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  window.prpTheme = currentTheme; // pages can ask which palette to draw with
  const saved = store.get();
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!root.dataset.theme) window.dispatchEvent(new CustomEvent('prp:themechange', { detail: { theme: currentTheme() } })); });

  const shellUrl = new URL(SHELL, location.href);
  const load = (file, extra = {}) => {
    if (document.querySelector(`script[src*="${file}"]`)) return;
    const s = document.createElement('script');
    s.src = new URL('design/' + file, shellUrl).href; s.defer = true; s.dataset.shell = shellUrl.href;
    Object.assign(s.dataset, extra);
    document.head.appendChild(s);
  };
  // Encyclopaedia links on every page (the Encyclopaedia links natively).
  if (moduleId !== 'encyclopedia') load('jdpi-entities.js');

  let embedded = false;
  try { embedded = window.self !== window.top; } catch { embedded = true; }

  if (embedded) {
    load('jdpi-narrator.js'); // Documentary mode: answers the shell's reader
    root.classList.add('prp-embedded', 'jdpi-embedded'); // a class on <html> is safe to add before hydration
    window.addEventListener('message', e => { if (e.source === window.parent && e.data?.type === 'prp:theme') setTheme(e.data.theme); });
    const announce = () => { try { window.parent.postMessage({ type: 'jdpi:module-ready', suite, module: moduleId, title: document.title }, '*'); } catch { /* ignore */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce); else announce();
    return;
  }

  const LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };
  const inject = () => {
    if (document.querySelector('.jdpi-returnbar')) return;
    const bar = document.createElement('div');
    bar.className = 'jdpi-returnbar prp-returnbar';
    const link = SHELL + (suite ? `#/${suite}${moduleId ? '/' + moduleId : ''}` : '');
    bar.innerHTML = `<a href="${link}" title="Vitruvian Manager"><span aria-hidden="true">←</span><b>VM</b></a>` +
      (NAMES[suite] ? `<span class="sep">/</span><span class="suite"${TITLES[suite] ? ` title="${TITLES[suite]}"` : ''}>${NAMES[suite]}</span>` : '') +
      `<span class="sep">/</span><span class="page-title"></span><button type="button" class="theme"></button>`;
    // Follow the page's title, which some pages change as you move within them (an Encyclopaedia entry, a Kino film),
    // less its product suffix: "· VM", or the older "· PRP" and the full "· Vitruvian Manager" on pages not yet moved.
    const pageTitle = bar.querySelector('.page-title');
    const syncTitle = () => { pageTitle.textContent = document.title.replace(/\s*[·|—-]\s*(?:VM|PRP|Vitruvian Manager)\b.*$/, ''); };
    syncTitle();
    new MutationObserver(syncTitle).observe(document.head, { childList: true, characterData: true, subtree: true });
    const btn = bar.querySelector('.theme');
    const show = () => { btn.textContent = LABEL[store.get() || 'system']; };
    btn.onclick = () => { const next = { system: 'light', light: 'dark', dark: 'system' }[store.get() || 'system']; store.set(next); setTheme(next); show(); };
    show();
    document.body.prepend(bar);
  };
  // Wait until the page has loaded (and React/Next apps have hydrated) before adding DOM nodes.
  const later = () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1500)))(inject, { timeout: 3000 }), 800);
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
})();
