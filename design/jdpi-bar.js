/* JDP-I module connector.
   Add to any module:
     <script src="https://jdpi.pages.dev/design/jdpi-bar.js" data-suite="hp" data-module="atlas" defer></script>
   - Inside the JDP-I shell (iframe): adds .jdpi-embedded to <html> so elements marked
     data-jdpi-standalone hide, and tells the shell the module's title.
   - Opened directly: shows a slim "JDP-I › Suite › Module" bar linking back to the shell. */
(function () {
  const script = document.currentScript;
  const SHELL = (script && script.dataset.shell) || 'https://jdpi.pages.dev/';
  const suite = (script && script.dataset.suite) || '';
  const moduleId = (script && script.dataset.module) || '';
  const SUITE_NAMES = { q: 'Q', hp: 'H&P', fe: 'F&E' };

  const root = document.documentElement;
  if (suite && !root.dataset.suite) root.dataset.suite = suite;

  let embedded = false;
  try { embedded = window.self !== window.top; } catch { embedded = true; }

  if (embedded) {
    root.classList.add('jdpi-embedded');
    const announce = () => {
      try { window.parent.postMessage({ type: 'jdpi:module-ready', suite, module: moduleId, title: document.title }, '*'); } catch { /* ignore */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce); else announce();
    return;
  }

  const inject = () => {
    if (document.querySelector('.jdpi-returnbar')) return;
    const bar = document.createElement('div');
    bar.className = 'jdpi-returnbar';
    const href = SHELL + (suite ? `#/${suite}${moduleId ? '/' + moduleId : ''}` : '');
    bar.innerHTML = `<a href="${href}"><span aria-hidden="true">←</span><b>JDP-I</b></a>` +
      (suite ? `<span class="sep">›</span><span class="suite">${SUITE_NAMES[suite] || suite}</span>` : '') +
      `<span class="sep">›</span><span>${document.title.replace(/</g, '&lt;')}</span>`;
    document.body.prepend(bar);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
