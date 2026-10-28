// GEOINT & IMINT Dashboard · the three guides (Software Cookbook, Hardware Guide, Law & ethics), rendered from
// geoint/content/<tab>.md by md.js, with a contents list, section links (#tab=cookbook&s=<id>), copy buttons on code and,
// in the cookbook, a switch that shows install steps for one operating system (remembered in this browser).
import { renderMarkdown, inline } from './md.js';
import { FIGURES } from './figures.js';
import { esc } from './util.js';

const TITLES = { cookbook: 'Software Cookbook', hardware: 'Hardware Guide', law: 'Law & ethics' };
const OS_KEY = 'prp.geoint.os';
const OS = [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux'], ['all', 'All systems']];
const osStore = {
  get() { try { return localStorage.getItem(OS_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(OS_KEY, v); } catch { /* storage blocked */ } },
};
function detectOS() {
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /win/i.test(p) ? 'windows' : /mac|iphone|ipad/i.test(p) ? 'macos' : /linux|x11|cros/i.test(p) ? 'linux' : 'all';
}

export async function init(panel, ctx, tab) {
  const doc = panel.querySelector('.doc');
  const res = await fetch(`content/${tab}.md`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`content/${tab}.md returned ${res.status}`);
  const text = await res.text();
  const { html, toc, meta } = renderMarkdown(text, { figures: FIGURES, prpLink: p => ctx.prpLink(p), idPrefix: tab });
  const words = text.split(/\s+/).length, mins = Math.max(3, Math.round(words / 230));
  const wide = window.matchMedia('(min-width: 901px)').matches;
  const os = osStore.get() || detectOS();
  doc.dataset.os = os;
  doc.innerHTML = `<nav class="doc-toc prp-panel" aria-label="Contents: ${esc(TITLES[tab])}"><details${wide ? ' open' : ''}><summary>Contents</summary><div class="head">Contents</div>
      <ol>${toc.map(t => `<li><a class="l${t.level}" href="#${t.id}" data-section="${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details></nav>
    <article class="doc-body prp-panel"><div class="inner">
      <header class="doc-head"><div class="prp-eyebrow">GEOINT &amp; IMINT Dashboard <span class="sep">·</span> ${esc(TITLES[tab])}</div>
        <h2>${esc(meta.title || TITLES[tab])}</h2>${meta.dek ? `<p>${inline(meta.dek)}</p>` : ''}
        <div class="prp-meta">${meta.updated ? `<span>Checked <b>${esc(meta.updated)}</b></span>` : ''}<span>About <b>${mins} min</b> to read</span>${meta.scope ? `<span>${esc(meta.scope)}</span>` : ''}</div></header>
      ${tab === 'cookbook' ? `<div class="os-switch"><span id="os-l">Show install steps for</span><div class="seg" role="group" aria-labelledby="os-l">${OS.map(([v, n]) => `<button type="button" data-os="${v}" aria-pressed="${v === os}">${n}</button>`).join('')}</div></div>` : ''}
      <div class="md">${html}</div>
    </div></article>`;

  doc.addEventListener('click', e => {
    const sec = e.target.closest('a[data-section]');
    if (sec && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      go(sec.dataset.section, true);
      if (!wide) doc.querySelector('.doc-toc details')?.removeAttribute('open');
      return;
    }
    const osb = e.target.closest('.os-switch [data-os]');
    if (osb) {
      doc.dataset.os = osb.dataset.os; osStore.set(osb.dataset.os);
      doc.querySelectorAll('.os-switch [data-os]').forEach(b => b.setAttribute('aria-pressed', String(b === osb)));
      return;
    }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const code = copy.closest('.code')?.querySelector('pre')?.textContent || '';
      navigator.clipboard?.writeText(code).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); }, () => { copy.textContent = 'Select and copy'; });
    }
  });

  // Highlight the section being read in the contents list.
  const links = new Map([...doc.querySelectorAll('.doc-toc a[data-section]')].map(a => [a.dataset.section, a]));
  const heads = [...doc.querySelectorAll('.md h2[id], .md h3[id]')].filter(h => links.has(h.id));
  let current = null;
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { current?.removeAttribute('aria-current'); current = links.get(en.target.id); current?.setAttribute('aria-current', 'true'); }
  }, { rootMargin: '-15% 0px -75% 0px' });
  heads.forEach(h => io.observe(h));

  function go(id, write, smooth = true) {
    const el = doc.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: smooth && !ctx.reduceMotion() ? 'smooth' : 'auto' });
    if (write) ctx.set({ s: id });
  }
  // Landing on a section: jump there, and again once web fonts have settled the layout.
  const land = id => { requestAnimationFrame(() => go(id, false, false)); document.fonts?.ready.then(() => setTimeout(() => go(id, false, false), 60)); };
  return {
    show(state) { if (state.s) land(state.s); },
    apply(state) { if (state.s) go(state.s, false); },
  };
}
