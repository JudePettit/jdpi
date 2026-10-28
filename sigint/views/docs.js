// SIGINT Dashboard · Software Cookbook, Hardware Guide and Law & ethics: Markdown files in content/, rendered with a
// contents list, deep links (#tab=cookbook&s=sdrpp), and for the cookbook a search box and kind filters.
import { esc, store } from '../lib/util.js';
import { renderMarkdown } from '../lib/md.js';

const CATS = [
  ['all', 'All'], ['drivers', 'Drivers'], ['receivers', 'Receivers'], ['decoders', 'Decoders'], ['analysis', 'Analysis'],
  ['planning', 'Planning and logging'], ['mesh', 'Mesh'], ['web', 'Web receivers'], ['pipelines', 'Pipelines'],
];
const PREFIX = { cookbook: 'cb', hardware: 'hw', law: 'law' };

export function create(ctx, panel, tab) {
  const $ = s => panel.querySelector(s);
  const p = PREFIX[tab];
  const doc = $(`#${p}-doc`), toc = $(`#${p}-toc`);
  let loaded = false, loading = null, sections = [], cat = 'all', q = '';

  // Links in the content: "#/oi/osint-training" opens a PRP submodule (in the shell when embedded); "#s=id" a section here.
  const linkAttrs = href => {
    if (/^https?:/i.test(href)) return ' target="_blank" rel="noopener"';
    if (href.startsWith('#/')) return ' data-prp-link';
    return '';
  };

  async function load() {
    try {
      const r = await fetch(panel.dataset.doc, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { html, toc: items } = renderMarkdown(await r.text(), { sectionLevel: tab === 'cookbook' ? 2 : 0, linkAttrs, idPrefix: '' });
      doc.innerHTML = html;
      for (const a of doc.querySelectorAll('a[data-prp-link]')) {
        const route = a.getAttribute('href').slice(1);
        a.href = `${ctx.shell}#${route}`;
        if (ctx.embedded) a.target = '_top';
      }
      buildToc(items);
      if (tab === 'cookbook') setupCookbook(items);
      if (tab === 'law') setupChecklist();
      loaded = true;
    } catch (e) {
      doc.innerHTML = `<p class="prp-note bad">This document could not be loaded (${esc(e.message)}). It is also available as a plain file: <a href="${esc(panel.dataset.doc)}">${esc(panel.dataset.doc)}</a>.</p>`;
    }
  }
  function buildToc(items) {
    toc.innerHTML = items.filter(i => i.level <= 2).map(i =>
      `<a href="#tab=${tab}&s=${encodeURIComponent(i.id)}" data-s="${esc(i.id)}" class="${i.level === 1 ? 'toc-h' : 'l2'}">${esc(i.text)}</a>`).join('');
    toc.addEventListener('click', e => {
      const a = e.target.closest('a[data-s]'); if (!a) return;
      e.preventDefault(); go(a.dataset.s);
    });
    // Highlight the section being read.
    const targets = [...doc.querySelectorAll(tab === 'cookbook' ? 'h1[id], section.md-sec' : 'h1[id], h2[id]')];
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) {
        const id = en.target.id;
        toc.querySelectorAll('a.on').forEach(x => x.classList.remove('on'));
        const a = toc.querySelector(`a[data-s="${CSS.escape(id)}"]`);
        if (a) { a.classList.add('on'); if (toc.scrollHeight > toc.clientHeight) a.scrollIntoView({ block: 'nearest' }); }
      }
    }, { rootMargin: '-80px 0px -70% 0px' });
    targets.forEach(t => io.observe(t));
  }
  /** Scroll to a section. An explicit jump clears filters that hide it; the quiet re-scroll after fonts load doesn't. */
  function go(id, smooth = true, { settle = false } = {}) {
    const el = doc.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    if (el.hidden) {
      if (settle) return;
      if (tab === 'cookbook') { cat = 'all'; q = ''; $('#cb-q').value = ''; applyFilter(); }
    }
    el.scrollIntoView({ behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto', block: 'start' });
    ctx.setParam('s', id);
  }

  function setupCookbook() {
    sections = [...doc.querySelectorAll('section.md-sec')].map(s => ({ el: s, text: s.textContent.toLowerCase(), cats: (s.dataset.cats || '').split(' ') }));
    const chips = $('#cb-chips');
    const count = c => (c === 'all' ? sections.length : sections.filter(s => s.cats.includes(c)).length);
    chips.innerHTML = CATS.filter(([c]) => count(c)).map(([c, label]) => `<button type="button" class="prp-chip${c === cat ? ' on' : ''}" data-c="${c}" aria-pressed="${c === cat}">${esc(label)}<span class="n">${count(c)}</span></button>`).join('');
    chips.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; applyFilter(); });
    let t = 0;
    $('#cb-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().toLowerCase(); applyFilter(); }, 120); });
    // Headings inside each recipe stay in the document flow; the H1 kind headings hide when none of their recipes match.
    applyFilter();
  }
  function applyFilter() {
    const words = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const s of sections) {
      const ok = (cat === 'all' || s.cats.includes(cat)) && words.every(w => s.text.includes(w));
      s.el.hidden = !ok; if (ok) shown++;
    }
    // A kind heading (H1) and its introduction show when any of its recipes do; a heading with no recipes (the
    // introduction) shows only when nothing is filtered.
    const unfiltered = cat === 'all' && !words.length;
    for (const h of doc.querySelectorAll('h1')) {
      let n = h.nextElementSibling, total = 0, any = false;
      const intro = [];
      while (n && n.tagName !== 'H1') {
        if (n.matches('section.md-sec')) { total++; if (!n.hidden) any = true; } else if (!total) intro.push(n);
        n = n.nextElementSibling;
      }
      const show = total ? any : unfiltered;
      h.hidden = !show; intro.forEach(x => { x.hidden = !show; });
    }
    for (const a of toc.querySelectorAll('a[data-s]')) {
      const target = doc.querySelector(`#${CSS.escape(a.dataset.s)}`);
      a.hidden = target ? target.hidden : false;
    }
    $('#cb-chips').querySelectorAll('[data-c]').forEach(b => { const on = b.dataset.c === cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('#cb-status').textContent = `${shown} of ${sections.length} recipes`;
    if (!shown) { if (!doc.querySelector('.doc-empty')) doc.insertAdjacentHTML('afterbegin', '<p class="doc-empty">No recipe matches. Clear the search or choose All.</p>'); }
    else doc.querySelector('.doc-empty')?.remove();
  }

  function setupChecklist() {
    const key = 'prp.sigint.lawChecklist';
    const saved = store.get(key, {}) || {};
    doc.querySelectorAll('.md-tasks input[type="checkbox"]').forEach((box, i) => {
      box.checked = !!saved[i];
      box.addEventListener('change', () => { saved[i] = box.checked; store.set(key, saved); });
    });
  }

  return {
    async show(params = {}) {
      const first = !loaded;
      if (first) await (loading ||= load());
      const s = params.s || ctx.param('s');
      if (!s) return;
      // Web fonts change line heights: scroll once they are in, and once more after layout settles.
      try { await document.fonts?.ready; } catch { /* no font API */ }
      requestAnimationFrame(() => {
        go(s, false);
        if (!first) return;
        // Re-align once layout settles, unless the reader has already moved on (scrolled, searched or filtered).
        const y = window.scrollY;
        setTimeout(() => { if (Math.abs(window.scrollY - y) < 4 && !q && cat === 'all') go(s, false, { settle: true }); }, 350);
      });
    },
    hide() {},
  };
}
