// IoT Connect: building the page's elements. Text always goes in as text (textContent), never as HTML, because names,
// rooms, makers and announcements come from devices on the network and one of them may be hostile.

/** h('div', { class: 'x', dataset: { id: 1 }, onclick }, 'text', child, …): an element with its attributes and children. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** Replace an element's children. */
export function fill(el, ...children) { el.replaceChildren(...children.flat(Infinity).filter(c => c != null && c !== false)); return el; }

/** Say something in a status line: tone '', 'good', 'bad' or 'warn'. */
export function say(el, text, tone = '') {
  if (!el) return;
  el.textContent = text || '';
  el.dataset.tone = tone;
}

/** An SVG element (for the QR code). */
export function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A button that runs an async job once at a time, shows it is busy, and reports a refusal in a status line. */
export function busy(button, job) {
  return async (...a) => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { return await job(...a); } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  };
}
