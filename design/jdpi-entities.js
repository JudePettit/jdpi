/* PRP entity linker. Loaded by prp-bar.js on every submodule page.
   Adds a small ◈ link to the PRP Encyclopaedia next to anything the entity layer (lake/) knows about:
     - links to English Wikipedia articles (most submodules already link people, wars and events there);
     - elements with data-qid="Q…" (a Wikidata ID);
     - elements with data-entity-key="congress:P000197" (submodule keys listed in lake/data/keys.json).
   Lookups use small static shards, fetched only for titles present on the page, and re-run as pages render.
   The mark takes the PRP link colour, so it reads in light and dark. */
(function () {
  const script = document.currentScript;
  const SHELL = (script && script.dataset.shell) || 'https://jdpi.pages.dev/';
  const LAKE = new URL('lake/data/', SHELL).href;
  const T_SHARDS = 256;
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const shards = new Map();
  let keys = null;

  const norm = t => String(t).replace(/_/g, ' ').trim().replace(/^./, c => c.toUpperCase());
  function shardOf(t) { let h = 2166136261; for (const c of norm(t)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % T_SHARDS; }
  const getShard = n => { if (!shards.has(n)) shards.set(n, fetch(`${LAKE}t/${n}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))); return shards.get(n); };
  const getKeys = () => (keys ||= fetch(`${LAKE}keys.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})));

  // Inside the shell the Encyclopaedia opens as a submodule (Retrospective Geopolitics); on its own it opens directly.
  const pageUrl = q => new URL(`encyclopedia/index.html#${q}`, SHELL).href;
  const linkUrl = q => (embedded ? `${SHELL}#/rs/encyclopedia?at=${encodeURIComponent(pageUrl(q))}` : pageUrl(q));

  const style = document.createElement('style');
  style.textContent = '.jdpi-ency{display:inline-block;margin-left:3px;font-size:.78em;line-height:1;text-decoration:none!important;opacity:.75;vertical-align:.1em;color:var(--prp-link,currentColor)!important}'
    + '.jdpi-ency:hover,.jdpi-ency:focus-visible{opacity:1}';
  document.head.appendChild(style);

  function badge(el, q, label) {
    if (el.dataset.jdpiEncy) return;
    el.dataset.jdpiEncy = q;
    const a = document.createElement('a');
    a.className = 'jdpi-ency'; a.href = linkUrl(q); a.target = embedded ? '_top' : '_self';
    a.title = `${label ? `Open ${label}` : 'Open'} in the Vitruvian Manager Encyclopaedia`; a.setAttribute('aria-label', a.title);
    a.textContent = '◈';
    a.addEventListener('click', e => e.stopPropagation());
    el.insertAdjacentElement('afterend', a);
  }

  async function scan() {
    const anchors = [...document.querySelectorAll('a[href*="wikipedia.org/wiki/"]:not([data-jdpi-ency])')].filter(a => !a.closest('.jdpi-no-ency'));
    const byShard = new Map();
    for (const a of anchors) {
      let title;
      try { title = decodeURIComponent(new URL(a.href).pathname.split('/wiki/')[1] || ''); } catch { continue; }
      if (!title || /^(Special|File|Category|Help|Wikipedia):/.test(title)) continue;
      const n = shardOf(title);
      (byShard.get(n) || byShard.set(n, []).get(n)).push([a, title]);
    }
    for (const [n, list] of byShard) {
      const map = await getShard(n);
      for (const [a, title] of list) { const q = map[norm(title)]; if (q) badge(a, q, a.textContent.trim()); else a.dataset.jdpiEncy = '-'; }
    }
    for (const el of document.querySelectorAll('[data-qid]:not([data-jdpi-ency])')) badge(el, el.dataset.qid, el.textContent.trim());
    const keyed = document.querySelectorAll('[data-entity-key]:not([data-jdpi-ency])');
    if (keyed.length) { const k = await getKeys(); for (const el of keyed) { const q = k[el.dataset.entityKey]; if (q) badge(el, q, el.textContent.trim()); else el.dataset.jdpiEncy = '-'; } }
  }

  let pending = null;
  const schedule = () => { clearTimeout(pending); pending = setTimeout(() => scan().catch(() => {}), 400); };
  const start = () => { schedule(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'complete') setTimeout(start, 1200); else window.addEventListener('load', () => setTimeout(start, 1200), { once: true });
})();
