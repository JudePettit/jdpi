/* PRP narrator — the submodule side of Documentary mode. Loaded by prp-bar.js when a submodule runs inside the shell.
   The shell's reader (design/jdpi-documentary.js) owns the voice, music and controls; this script decides what to say
   next on this page, highlights it and scrolls to it. They talk by postMessage, so it works for submodules on other
   domains too.
     shell → page    { jdpiDoc: 'start' }                   begin from what is on screen now
                     { jdpiDoc: 'next', seq }                the next step, please
                     { jdpiDoc: 'stop' }                     clear the highlight (and the map's focus)
     page → shell    { jdpiDoc: 'ready', title, story }      on load, or window.jdpiNarrator.announce(); story: it tells its own
                     { jdpiDoc: 'step', seq, step }          step: { text, label? } | { chapterEnd, label } | { done }
   A page can tell its own story by defining window.jdpiDocumentary = { title, story() } where story() is an async
   generator yielding { text, el?, focus? } steps and { chapterEnd: true, label } pauses ("Continue Reading" or, with
   autoplay, an automatic pause). Such pages get the reader in any module; without one, the page's headings and
   paragraphs are read in order (offered in Retrospective Geopolitics).
   Map focus: each step may say where it is. A step's focus ({ countries, points, bbox, qids, padding } or { reset: true };
   null leaves the map as it is) is sent to the page as the window event 'prp:focus', which a map page answers by
   highlighting those places and zooming to fit them all (design/prp-focus.js). A step without focus is offered to the
   page first ('prp:focus-request'), then placed from data-iso3, data-lonlat, data-bbox and data-qid attributes on or
   inside the passage. The map goes back to its own view when the reading stops or ends. */
(function () {
  /* ---------- pure parts (tests/documentary.test.mjs) ---------- */
  // Words after which a full stop and a space do not end a sentence (initials are checked separately).
  const KEEP = /^(?:Mr|Mrs|Ms|Dr|Prof|St|Mt|Ft|Gen|Col|Lt|Sgt|Capt|Adm|Gov|Sen|Rep|Pres|Rev|Hon|Jr|Sr|No|Nos|Op|Vol|Fig|vs|v|cf|approx|ca|c|e\.g|i\.e)$/;
  // A text's sentences, for stories that quote the first few of an article. A sentence ends at . ! ? or … (with any
  // closing quote or bracket) followed by whitespace or the end: never at a full stop inside a number or a name (3.5,
  // jdpi.pages.dev), after initials (U.S. forces, John F. Kennedy) or after a common abbreviation (Dr., No., c.).
  function sentences(text) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim(), out = [];
    let from = 0;
    for (const m of t.matchAll(/[.!?…]+["'’”)\]]*(?=\s|$)/g)) {
      const end = m.index + m[0].length;
      if (/^\.(?!\.)/.test(m[0]) && end < t.length) {
        const word = (/(\S+)$/.exec(t.slice(from, m.index))?.[1] || '').replace(/^[("'‘“[]+/, '');
        if (/^(?:\p{L}\.)+\p{L}$/u.test(word) || /^\p{Lu}$/u.test(word) || KEEP.test(word)) continue;
      }
      out.push(t.slice(from, end).trim()); from = end;
    }
    if (from < t.length) out.push(t.slice(from).trim());
    return out.filter(Boolean);
  }
  // Map targets written on a passage, from [attribute, value] pairs: data-iso3 ("UKR" or "UKR RUS"), data-lonlat
  // ("30.52,50.45"), data-bbox ("w,s,e,n") and data-qid ("Q…").
  function targetsFromAttributes(pairs) {
    const t = { countries: [], points: [], bbox: null, qids: [] }, nums = s => s.split(/[\s,]+/).map(Number);
    for (const [k, v] of pairs || []) {
      const s = String(v ?? '').trim(); if (!s) continue;
      if (k === 'data-iso3') t.countries.push(...s.split(/[\s,]+/).filter(c => /^[a-z]{3}$/i.test(c)).map(c => c.toUpperCase()));
      else if (k === 'data-lonlat') { const [lon, lat] = nums(s); if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90) t.points.push([lon, lat]); }
      else if (k === 'data-bbox') { const b = nums(s); if (!t.bbox && b.length === 4 && b.every(Number.isFinite)) t.bbox = b; }
      else if (k === 'data-qid' && /^Q\d+$/.test(s)) t.qids.push(s);
    }
    t.countries = [...new Set(t.countries)]; t.qids = [...new Set(t.qids)];
    return t;
  }
  const hasTargets = t => !!t && typeof t === 'object' && (!!t.reset || Array.isArray(t.bbox) || ['countries', 'points', 'qids'].some(k => Array.isArray(t[k]) && t[k].length > 0));
  globalThis.PRPNarrator = { sentences, targetsFromAttributes, hasTargets };
  if (typeof document === 'undefined') return; // loaded by the tests, outside a browser

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

  /* ---------- map focus ---------- */
  const ATTRS = ['data-iso3', 'data-lonlat', 'data-bbox', 'data-qid'];
  function fromElement(el) {
    if (!el?.querySelectorAll) return null;
    const els = [el, ...el.querySelectorAll(ATTRS.map(a => `[${a}]`).join(','))].slice(0, 80);
    return targetsFromAttributes(els.flatMap(x => ATTRS.filter(a => x.hasAttribute(a)).map(a => [a, x.getAttribute(a)])));
  }
  // Where a step is: what the story says (null or false: leave the map as it is), else what the page can place,
  // else what the passage's attributes name.
  function targetsFor(value) {
    if ('focus' in value) return value.focus || null;
    const req = { text: String(value.text || ''), el: value.el || null, targets: null };
    window.dispatchEvent(new CustomEvent('prp:focus-request', { detail: req }));
    if (hasTargets(req.targets)) return req.targets;
    const t = fromElement(value.el);
    return hasTargets(t) ? t : null;
  }
  let focused = false;
  function focus(t) {
    if (!hasTargets(t)) return;
    if (t.reset) { if (!focused) return; focused = false; } else focused = true;
    window.dispatchEvent(new CustomEvent('prp:focus', { detail: { countries: [], points: [], bbox: null, qids: [], padding: 40, ...t } }));
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
    if (done || !value) { highlight(null); focus({ reset: true }); return { done: true }; }
    if (value.chapterEnd) return { chapterEnd: true, label: value.label || 'Continue Reading' };
    highlight(value.el);
    try { focus(targetsFor(value)); } catch (err) { console.warn('Documentary map focus:', err); }
    return { text: String(value.text || ''), label: value.label || null };
  }

  window.addEventListener('message', async e => {
    if (e.source !== window.parent || !e.data || typeof e.data !== 'object' || !('jdpiDoc' in e.data)) return;
    if (!local && e.origin !== SHELL.origin) return;
    const { jdpiDoc: cmd, seq } = e.data;
    if (cmd === 'start') { begin(); return; }
    if (cmd === 'stop') { iter?.return?.(); iter = null; highlight(null); focus({ reset: true }); return; }
    if (cmd === 'next') {
      let step;
      try { step = await next(); } catch (err) { step = { text: '', error: err.message, done: true }; }
      window.parent.postMessage({ jdpiDoc: 'step', seq, step, title: window.jdpiDocumentary?.title || document.title }, e.origin);
    }
  });
  // Announce the page (again once it has fully loaded). A page whose story comes or goes later (a course that loads
  // after the narrator, say) calls window.jdpiNarrator.announce() itself. Stories can split quoted text with
  // window.jdpiNarrator.sentences().
  const announce = () => window.parent.postMessage({ jdpiDoc: 'ready', title: window.jdpiDocumentary?.title || document.title, story: !!window.jdpiDocumentary?.story }, local ? '*' : SHELL.origin);
  window.jdpiNarrator = { announce, sentences, focus };
  announce();
  if (document.readyState !== 'complete') window.addEventListener('load', announce, { once: true });
})();
