/* PRP entity linker. Loaded by prp-bar.js on every submodule page.
   Adds a small ◈ link to the PRP Master Index next to anything the entity layer (lake/) knows about:
     - links to English Wikipedia articles (most submodules already link people, wars and events there);
     - elements with data-qid="Q…" (a Wikidata ID);
     - elements with data-entity-key="congress:P000197" (submodule keys listed in lake/data/keys.json).
   Lookups use small static shards, fetched only for titles present on the page, and re-run as pages render.
   The mark takes the PRP link colour, so it reads in light and dark.
   Stage S5c (PRP-SCHOLAR-USP-DESIGN.md 2.2): a plain click on a tagged name (a Wikipedia link VM knows, a data-qid or
   data-entity-key name that is not itself a button or another link) or on its ◈ opens VM's card, not Wikipedia: the
   entry's description and years from the lake (lake/data/e/<n>.json), and its offers from design/vm-click.js's cardOf
   (the Omni-Map at its own years, the Master Index entry, the Wikipedia article, the name's own link last). A click with
   Ctrl, Cmd, Shift or Alt, a middle click and a long press go where they always went (Wikipedia, or the ◈'s Master
   Index entry). Escape or the close button shuts the card and gives focus back. An element in .jdpi-no-card, and Neo
   Book's terms (which set data-jdpi-ency themselves and send their own vm:click), are left alone. */
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

  // Inside the shell the Master Index opens as a submodule (Retrospective Geopolitics); on its own it opens directly.
  const pageUrl = q => new URL(`encyclopedia/index.html#${q}`, SHELL).href;
  const linkUrl = q => (embedded ? `${SHELL}#/rs/encyclopedia?at=${encodeURIComponent(pageUrl(q))}` : pageUrl(q));

  // A constructed stylesheet where the browser has them: a page with a strict Content-Security-Policy (IoT Connect's)
  // refuses an inline <style>, but not a sheet made through the CSSOM.
  const css = '.jdpi-ency{display:inline-block;margin-left:3px;font-size:.78em;line-height:1;text-decoration:none!important;opacity:.75;vertical-align:.1em;color:var(--prp-link,currentColor)!important}'
    + '.jdpi-ency:hover,.jdpi-ency:focus-visible{opacity:1}'
    + '.jdpi-card{position:fixed;right:16px;bottom:16px;z-index:2147483000;box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;padding:14px 16px;'
    + 'background:var(--prp-surface,Canvas);color:var(--prp-text,CanvasText);border:1px solid var(--prp-border,GrayText);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);font:14px/1.45 system-ui,sans-serif;text-align:left}'
    + '.jdpi-card[hidden]{display:none}.jdpi-card h2{margin:2px 28px 4px 0;font-size:17px;line-height:1.3}.jdpi-card h2:focus{outline:none}.jdpi-card h2:focus-visible{outline:2px solid var(--prp-focus,Highlight)}'
    + '.jdpi-card-k{margin:0;font-size:12px;color:var(--prp-muted,GrayText)}.jdpi-card-d{margin:0 0 8px;color:var(--prp-text-2,inherit)}'
    + '.jdpi-card ul{list-style:none;margin:0;padding:0}.jdpi-card li{margin:0 0 8px}.jdpi-card li a{font-weight:600;color:var(--prp-link,LinkText)}.jdpi-card li span{display:block;font-size:12.5px;color:var(--prp-muted,GrayText)}'
    + '.jdpi-card-x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;border-radius:6px;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer}'
    + '.jdpi-card-x:focus-visible{outline:2px solid var(--prp-focus,Highlight)}.jdpi-card-thin{font-size:12.5px;color:var(--prp-muted,GrayText);margin:6px 0 0}'
    + '[data-jdpi-card]:not(a){cursor:pointer}';
  try { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }
  catch { const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el); }

  function badge(el, q, label) {
    if (el.dataset.jdpiEncy) return;
    el.dataset.jdpiEncy = q;
    const a = document.createElement('a');
    a.className = 'jdpi-ency'; a.href = linkUrl(q); a.target = embedded ? '_top' : '_self';
    a.title = `${label ? `Open ${label}` : 'Open'} in the Vitruvian Manager Master Index`; a.setAttribute('aria-label', a.title);
    a.textContent = '◈';
    a.dataset.jdpiCardBadge = q;
    // S5c: a plain click on the ◈ opens the card; with a modifier it opens the Master Index entry, as before.
    a.addEventListener('click', e => { e.stopPropagation(); if (plain(e)) { e.preventDefault(); openCard(el, q, label, a); } });
    el.insertAdjacentElement('afterend', a);
    // The name itself opens the card too, unless it is a control of its own (a button, a link elsewhere).
    if (!ownControl(el)) el.dataset.jdpiCard = q;
  }

  /* ---------- stage S5c: VM's card ---------- */
  const plain = e => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  const isWiki = el => el.tagName === 'A' && /wikipedia\.org\/wiki\//.test(el.href || '');
  const ownControl = el => !!el.closest('.jdpi-no-card') || (el.tagName === 'A' ? !isWiki(el) : !!el.closest('button, a, input, select, textarea, label, summary, [role="button"], [role="link"], [onclick]'));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const records = new Map();
  const recordOf = q => { const n = +q.slice(1) % 512; if (!records.has(n)) records.set(n, fetch(`${LAKE}e/${n}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))); return records.get(n).then(m => m[q] || null); };
  let clickMod = null, card = null, back = null;
  const loadClick = () => (clickMod ||= import(new URL('design/vm-click.js', SHELL).href).catch(() => null));
  const target = embedded ? '_top' : '_self';
  const hrefOf = o => (o.id === 'entry' ? linkUrl(o.at.split('#')[1]) : new URL(o.at, SHELL).href);
  function cardEl() {
    if (card) return card;
    card = document.createElement('div');
    card.className = 'jdpi-card jdpi-no-ency jdpi-no-card'; card.hidden = true; card.id = 'jdpi-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false'); card.setAttribute('aria-labelledby', 'jdpi-card-t');
    card.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeCard(); } });
    document.body.appendChild(card);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && card && !card.hidden) closeCard(); });
    document.addEventListener('click', e => { if (card && !card.hidden && !card.contains(e.target) && !e.target.closest?.('[data-jdpi-card],[data-jdpi-card-badge]')) closeCard(false); });
    return card;
  }
  const focusable = el => !!el && (el.matches?.('a[href],button,input,select,textarea,summary,[tabindex]') || false);
  function closeCard(refocus = true) {
    if (!card || card.hidden) return;
    card.hidden = true;
    if (refocus && back && document.contains(back)) back.focus();
    back = null;
  }
  function paint(c) {
    const el = cardEl();
    const offers = c.offers.map(o => `<li><a href="${esc(hrefOf(o))}" target="${o.id === 'link' || o.id === 'wiki' ? '_blank' : target}"${o.id === 'link' || o.id === 'wiki' ? ' rel="noreferrer"' : ''} data-offer="${esc(o.id)}">${esc(o.name)}</a><span>${esc(o.why)}</span></li>`).join('');
    const sub = [c.desc, c.years, c.q].filter(Boolean).join(' · ');
    el.innerHTML = `<button type="button" class="jdpi-card-x" aria-label="Close the card">×</button><p class="jdpi-card-k">VM’s card</p><h2 id="jdpi-card-t" tabindex="-1">${esc(c.title)}</h2>`
      + (sub ? `<p class="jdpi-card-d">${esc(sub)}</p>` : '') + (c.loading ? `<p class="jdpi-card-thin" role="status">Reading VM’s lake…</p>` : `<ul aria-label="Open ${esc(c.title)}">${offers}</ul>`)
      + (c.thin?.text ? `<p class="jdpi-card-thin">${esc(c.thin.text)}</p>` : '');
    el.querySelector('.jdpi-card-x').addEventListener('click', () => closeCard());
  }
  async function openCard(el, q, label, from = el) {
    // V11 (S5b/S5c review): a tagged name that cannot take focus (a span with data-qid) gives focus back to the nearest
    // control that can (its ◈ badge, the next link), else the name itself made focusable for that once.
    const badge = from?.nextElementSibling?.matches?.('a.jdpi-ency') ? from.nextElementSibling : null;
    back = focusable(from) ? from : badge || (() => { from?.setAttribute?.('tabindex', '-1'); return from; })();
    const href = isWiki(el) ? el.href : null, title = label || el.textContent.trim();
    paint({ title, q, desc: '', years: '', offers: [], loading: true });
    const c = cardEl(); c.hidden = false; c.dataset.q = q;
    c.querySelector('h2').focus();
    const [rec, mod] = await Promise.all([recordOf(q), loadClick()]);
    if (c.hidden || c.dataset.q !== q) return;
    const out = mod?.cardOf ? mod.cardOf(rec, { q, label: title, href, today: new Date().toISOString().slice(0, 10) })
      : { title: rec?.label || title, q, desc: rec?.desc || '', years: '', thin: false,
          offers: [{ id: 'entry', name: 'Master Index entry', at: `encyclopedia/index.html#${q}`, why: 'What the Master Index holds' }, ...(href ? [{ id: 'link', name: 'Wikipedia article', at: href, why: 'Where the name links on this page' }] : [])] };
    paint(out);
    c.querySelector('h2').focus();
  }
  // A plain click on a tagged name opens the card (bubbling, so a page's own handler on it runs first and may refuse).
  document.addEventListener('click', e => {
    if (e.defaultPrevented || !plain(e)) return;
    const el = e.target.closest?.('[data-jdpi-card]');
    if (!el || ownControl(el) || (card && card.contains(el))) return;
    e.preventDefault();
    openCard(el, el.dataset.jdpiCard, el.textContent.trim());
  });
  window.JDPICard = { open: (q, label = '') => /^Q[1-9]\d*$/.test(q) && openCard(document.body, q, label, document.activeElement), close: () => closeCard() };

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
