// SIGINT Dashboard: small DOM helpers shared by the views.
import { esc } from '../lib/util.js';

/** KPI tiles: items [{ label, value, sub, small, word, wordToken }]. */
export function kpis(host, items) {
  host.innerHTML = items.map(k => `<div class="prp-kpi"><span>${esc(k.label)}</span>` +
    `<b class="${k.small ? 'small' : ''}">${k.word ? `<span class="word" style="--s:var(${k.wordToken || '--prp-faint'})">${esc(k.value)}</span>` : esc(k.value)}</b>` +
    `${k.sub ? `<small>${esc(k.sub)}</small>` : ''}</div>`).join('');
}
/** Legend: [{ label, token, shape: 'sw' | 'ln' | 'dot' | 'hollow' }], with an optional title. */
export function legend(host, items, title = '') {
  host.innerHTML = (title ? `<span class="lt">${esc(title)}</span>` : '') + items.map(i =>
    `<span class="key"><span class="${i.shape === 'hollow' ? 'dot hollow' : i.shape || 'sw'}" style="--c:var(${i.token})"></span>${esc(i.label)}</span>`).join('');
}
export function emptyRow(tbody, cols, html) { tbody.innerHTML = `<tr><td colspan="${cols}" class="prp-empty">${html}</td></tr>`; }
/** A ticking "updated n s ago · next in n s" line. */
export function ticker(el) {
  let last = 0, next = 0, extra = '', timer = null;
  const draw = () => {
    if (!last) return;
    const age = Math.round((Date.now() - last) / 1000), left = next ? Math.max(0, Math.round((next - Date.now()) / 1000)) : null;
    el.textContent = `${extra}${extra ? ' · ' : ''}updated ${age < 2 ? 'now' : age + ' s ago'}${left != null ? ` · next in ${left} s` : ''}`;
  };
  return {
    set(text, nextAt = 0) { extra = text; last = Date.now(); next = nextAt; draw(); if (!timer) timer = setInterval(draw, 1000); },
    msg(text) { last = 0; el.textContent = text; },
    paused(text) { next = 0; extra = text; draw(); },
    stop() { clearInterval(timer); timer = null; },
  };
}
/** Read a CSS custom property (theme token). */
export const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Make table rows with data-row selectable by click and Enter/Space. */
export function selectableRows(tbody, onSelect) {
  tbody.addEventListener('click', e => { const tr = e.target.closest('tr[data-row]'); if (tr && !e.target.closest('a')) onSelect(tr.dataset.row); });
  tbody.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr[data-row]'); if (tr) { e.preventDefault(); onSelect(tr.dataset.row); } });
}
export { esc };
