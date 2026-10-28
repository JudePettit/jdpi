/* PRP narrator — the submodule side of Documentary mode. Loaded by prp-bar.js when a submodule runs inside the shell.
   The shell's reader (design/jdpi-documentary.js) owns the voice, music and controls; this script decides what to say
   next on this page, highlights it and scrolls to it. They talk by postMessage, so it works for submodules on other
   domains too.
     shell → page    { jdpiDoc: 'start' }                   begin from what is on screen now
                     { jdpiDoc: 'next', seq }                the next step, please
                     { jdpiDoc: 'stop' }                     clear the highlight
     page → shell    { jdpiDoc: 'ready', title, story }      on load, or window.jdpiNarrator.announce(); story: it tells its own
                     { jdpiDoc: 'step', seq, step }          step: { text, label? } | { chapterEnd, label } | { done }
   A page can tell its own story by defining window.jdpiDocumentary = { title, story() } where story() is an async
   generator yielding { text, el? } steps and { chapterEnd: true, label } pauses ("Continue Reading" or, with
   autoplay, an automatic pause). Such pages get the reader in any module; without one, the page's headings and
   paragraphs are read in order (offered in Retrospective Intelligence). */
(function () {
  const script = document.currentScript;
  const SHELL = new URL((script && script.dataset.shell) || 'https://jdpi.pages.dev/', location.href);
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let iter = null, lit = null;

  // The passage being read: the module accent as an outline, on its soft tint (PRP tokens, so both themes work).
  const style = document.createElement('style');
  style.textContent = '.jdpi-reading{outline:2px solid var(--prp-accent,currentColor)!important;outline-offset:4px;border-radius:4px;background:var(--prp-accent-soft,transparent)!important;transition:outline-color .3s}'
    + '@media(prefers-reduced-motion:reduce){.jdpi-reading{transition:none}}';
  document.head.appendChild(style);

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function highlight(el) {
    lit?.classList.remove('jdpi-reading');
    lit = el || null;
    if (!lit) return;
    lit.classList.add('jdpi-reading');
    lit.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  }

  // Generic story: headings, paragraphs and list items in reading order, starting from what is on screen.
  // Site headers are skipped, but a PRP page's own front matter (its title and dek) is read first.
  const SKIP = 'nav, header, footer, button, select, script, style, .jdpi-bar, .tabs, .prp-tabs, .toc, [aria-hidden="true"], [hidden], .modal';
  const FRONT = '.prp-title, .prp-dek';
  function readable(root) {
    const els = [...root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, figcaption, dd, .lead, .summary, .prp-dek')];
    return els.filter(el => {
      if (el.closest(SKIP) && !(el.matches(FRONT) && !el.closest('nav, footer, [hidden], [aria-hidden="true"]'))) return false;
      if (el.querySelector('p, li')) return false; // read the innermost blocks
      const t = el.innerText?.trim() || '';
      const min = /^H\d$/.test(el.tagName) ? 3 : 25;
      const r = el.getBoundingClientRect();
      return t.length >= min && r.width > 0 && r.height > 0;
    });
  }
  // Pages built from <div>s (event rows, cards) have few paragraphs: fall back to the smallest blocks of real text.
  function leafBlocks(root) {
    const len = el => (el.innerText || '').trim().length;
    return [...root.querySelectorAll('div, section, td, span, a')].filter(el => {
      if (el.closest(SKIP) || len(el) < 40 || len(el) > 1500) return false;
      if ([...el.children].some(c => len(c) >= 40)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  async function* generic() {
    const root = document.querySelector('main, article, [role="main"]') || document.body;
    let blocks = readable(root);
    if (blocks.filter(el => !/^H\d$/.test(el.tagName)).length < 3) blocks = [...new Set([...blocks, ...leafBlocks(root)])].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const startAt = Math.max(0, blocks.findIndex(el => el.getBoundingClientRect().bottom > 0));
    for (const el of blocks.slice(startAt)) yield { text: el.innerText.trim().replace(/\s+/g, ' '), el };
  }

  function begin() {
    const custom = window.jdpiDocumentary;
    iter = (custom?.story ? custom.story() : generic())[Symbol.asyncIterator]();
  }
  async function next() {
    if (!iter) begin();
    const { value, done } = await iter.next();
    if (done || !value) { highlight(null); return { done: true }; }
    if (value.chapterEnd) return { chapterEnd: true, label: value.label || 'Continue Reading' };
    highlight(value.el);
    return { text: String(value.text || ''), label: value.label || null };
  }

  window.addEventListener('message', async e => {
    if (e.source !== window.parent || !e.data || typeof e.data !== 'object' || !('jdpiDoc' in e.data)) return;
    if (!local && e.origin !== SHELL.origin) return;
    const { jdpiDoc: cmd, seq } = e.data;
    if (cmd === 'start') { begin(); return; }
    if (cmd === 'stop') { iter?.return?.(); iter = null; highlight(null); return; }
    if (cmd === 'next') {
      let step;
      try { step = await next(); } catch (err) { step = { text: '', error: err.message, done: true }; }
      window.parent.postMessage({ jdpiDoc: 'step', seq, step, title: window.jdpiDocumentary?.title || document.title }, e.origin);
    }
  });
  // Announce the page (again once it has fully loaded). A page whose story comes or goes later (a course that loads
  // after the narrator, say) calls window.jdpiNarrator.announce() itself.
  const announce = () => window.parent.postMessage({ jdpiDoc: 'ready', title: window.jdpiDocumentary?.title || document.title, story: !!window.jdpiDocumentary?.story }, local ? '*' : SHELL.origin);
  window.jdpiNarrator = { announce };
  announce();
  if (document.readyState !== 'complete') window.addEventListener('load', announce, { once: true });
})();
