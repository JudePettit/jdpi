// OSINT Dashboard · the three guides (Software Cookbook, Kit Guide, Law & ethics). Each is a markdown-like file in
// content/, rendered by md.js into a contents list and an article, with install steps per operating system (one choice
// for all guides, remembered in this browser), copyable code and figures drawn as inline SVG.
import { esc } from './lib.js';
import { renderMarkdown } from './md.js';
import { $, $$, guideLink, copyText, settings, detectOs, wireTablist } from './ui.js';

const GUIDES = {
  cookbook: { file: 'content/cookbook.md', prefix: 'cb-' },
  kit: { file: 'content/kit.md', prefix: 'kit-' },
  law: { file: 'content/law.md', prefix: 'law-' },
};
const SYSTEMS = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const inst = new Map();
let osPref = '';

export async function init(panel, ctx, tab) {
  const g = GUIDES[tab];
  osPref ||= detectOs();
  panel.innerHTML = '<div class="prp-panel"><div class="loading">Loading the guide…</div></div>';
  let text;
  try {
    const res = await fetch(g.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
  } catch (e) {
    panel.innerHTML = `<div class="prp-note bad">The guide could not load (${esc(e.message)}). Check your connection and reload.</div>`;
    inst.set(tab, { panel, prefix: g.prefix, ready: false });
    return;
  }
  const r = renderMarkdown(text, { link: guideLink, idPrefix: g.prefix, figurePrefix: g.prefix + 'fig' });
  const hasOs = /data-os="(windows|macos|linux)"/.test(r.html);
  panel.innerHTML = `<div class="guide-layout">
    <aside class="prp-panel guide-toc" aria-label="Contents">
      ${hasOs ? `<div class="os-pref"><span class="prp-label" id="${tab}-os-l">Install steps for</span><div class="seg" role="group" aria-labelledby="${tab}-os-l">${Object.entries(SYSTEMS).map(([k, v]) => `<button type="button" data-os-pref="${k}" aria-pressed="${k === osPref}">${v}</button>`).join('')}</div></div>` : ''}
      <div class="toc-head"><span class="prp-label">Contents</span></div>
      <nav><ol>${r.toc.map(t => `<li><a class="l${t.level}" href="#tab=${tab}&s=${esc(t.id.slice(g.prefix.length))}" data-target="${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>
    </aside>
    <article class="prp-panel guide-body"><div class="inner">
      <div class="prp-eyebrow">OSINT Dashboard <span class="sep">·</span> Guide</div>
      <h2 class="g-title">${esc(r.meta.title || tab)}</h2>
      ${r.meta.intro ? `<p class="g-intro">${esc(r.meta.intro)}</p>` : ''}
      ${r.meta.updated ? `<p class="g-meta">Checked ${esc(r.meta.updated)} · ${r.toc.filter(t => t.level === 2).length} sections${r.figures ? ` · ${r.figures} figure${r.figures === 1 ? '' : 's'}` : ''}</p>` : ''}
      <div class="md">${r.html}</div>
    </div></article></div>`;
  // Install steps: one choice of system for every guide; browser tabs (Chrome, Firefox…) switch on their own.
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-os-pref]');
    if (b) { setOs(b.dataset.osPref); return; }
    const t = e.target.closest('.os-tabs [role=tab]');
    if (t) { if (SYSTEMS[t.dataset.os]) setOs(t.dataset.os); else selectPane(t); return; }
    const c = e.target.closest('.copy-code');
    if (c) copyText(c.previousElementSibling.textContent, 'Copied');
  });
  for (const list of $$('.os-tabs', panel)) wireTablist(list, t => { if (SYSTEMS[t.dataset.os]) setOs(t.dataset.os); else selectPane(t); });
  applyOs(panel);
  // Contents: highlight the section in view.
  const links = new Map($$('.guide-toc a[data-target]', panel).map(a => [a.dataset.target, a]));
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { links.forEach(a => a.classList.remove('cur')); links.get(en.target.id)?.classList.add('cur'); }
  }, { rootMargin: '0px 0px -75% 0px' });
  $$('.md-h2, .md-h3', panel).forEach(h => io.observe(h));
  inst.set(tab, { panel, prefix: g.prefix, ready: true, ctx });
}

export function show(state, tab) {
  const g = inst.get(tab);
  if (!g?.ready) return;
  if (state.s) {
    const el = document.getElementById(g.prefix + state.s);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
}

function selectPane(tabBtn) {
  const group = tabBtn.closest('.os-group');
  for (const b of $$('.os-tabs [role=tab]', group)) { const on = b === tabBtn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const p of $$('.os-pane', group)) p.hidden = p.dataset.os !== tabBtn.dataset.os;
}
function applyOs(root) {
  for (const group of $$('.os-group', root)) {
    const btn = $(`.os-tabs [data-os="${osPref}"]`, group);
    if (btn) selectPane(btn);
  }
  $$('[data-os-pref]', root).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.osPref === osPref)));
}
function setOs(os) {
  osPref = os;
  settings.set('os', os);
  for (const g of inst.values()) if (g.ready) applyOs(g.panel);
}
