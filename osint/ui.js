// OSINT Dashboard: small DOM helpers shared by the tab modules (selectors, toasts, copying, downloads, fetch with a
// timeout and a plain-English reason when it fails, per-viewer settings, and links into the rest of PRP).
import { esc, lessonUrl } from './lib.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const num = n => Number(n || 0).toLocaleString('en-GB');
export const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
export const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL = new URL('../', location.href).href;

/** A link into another PRP submodule: through the shell (target _top) when embedded, direct otherwise. */
export function prpLink(suite, module, path) {
  const url = new URL(path, SHELL).href;
  return embedded ? { href: `${SHELL}#/${suite}/${module}?at=${encodeURIComponent(url)}`, target: '_top' } : { href: url, target: '_self' };
}
/** A link to an OSINT Training lesson (by slug; '' for the course home). */
export const courseLink = slug => prpLink('oi', 'osint-training', lessonUrl(slug));

/** Resolve links in guides: http(s) opens a new tab, #… stays here, course:slug and prp:module[#hash] go to PRP pages. */
export function guideLink(href) {
  const h = String(href || '').trim();
  if (/^https?:\/\//i.test(h)) return { href: h, target: '_blank', rel: 'noopener noreferrer', cls: 'ext' };
  if (h.startsWith('#') || /^mailto:/i.test(h)) return { href: h };
  let m = h.match(/^course:([a-z0-9-]*)$/i);
  if (m) return { ...courseLink(m[1]), cls: 'prp-link' };
  m = h.match(/^prp:(geoint|sigint|headlines|briefing|volatility)(#.*)?$/i);
  if (m) {
    const paths = { geoint: 'geoint/index.html', sigint: 'sigint/index.html', headlines: 'q/headlines.html?view=current', briefing: 'q/briefing.html', volatility: 'q/volatility.html' };
    const r = prpLink('rt', m[1], paths[m[1]] + (m[2] || ''));
    return { ...r, cls: 'prp-link' };
  }
  return null;
}

/** Apply course links written in the page's HTML as data-course="slug". */
export function wireCourseLinks(root = document) {
  for (const a of $$('a[data-course]', root)) { const r = courseLink(a.dataset.course); a.href = r.href; a.target = r.target; }
}

/* ---- Toasts ---- */
export function toast(msg, { tone = 'good', action = null, ms = 5000 } = {}) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (tone === 'bad' ? ' bad' : '');
  el.innerHTML = `<span class="grow">${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'prp-btn sm'; b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.append(b);
  }
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? label : 'Copy failed: select the text and copy it yourself', { tone: ok ? 'good' : 'bad' });
    return ok;
  }
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---- Fetch with a timeout and a reason ---- */
/**
 * fetch() that never throws: { ok, status, text, json, kind } where kind is 'ok', 'http' (a status we could read),
 * 'network' (offline, blocked, or refused by the browser's CORS check, which hides the real status), 'timeout' or 'parse'.
 */
export async function fetchData(url, { timeout = 20000, headers = {}, as = 'json' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, text, kind: 'http' };
    if (as === 'text') return { ok: true, status: res.status, text, kind: 'ok' };
    try { return { ok: true, status: res.status, text, json: text ? JSON.parse(text) : null, kind: 'ok' }; }
    catch { return { ok: false, status: res.status, text, kind: 'parse' }; }
  } catch (e) {
    return { ok: false, status: 0, text: '', kind: e?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(timer); }
}
export function failText(r, service) {
  if (r.kind === 'timeout') return `${service} took too long to answer. Try again in a minute.`;
  if (r.kind === 'network') return `${service} could not be reached from this page (offline, blocked by an extension, or the service refused the browser’s cross-site check, which also happens when it is overloaded or rate-limiting).`;
  if (r.kind === 'parse') return `${service} sent a reply that could not be read.`;
  if (r.status === 404) return `${service} has no record of that.`;
  if (r.status === 429) return `${service} is limiting requests. Wait a minute and try again.`;
  return `${service} answered with an error (HTTP ${r.status}).`;
}

/* ---- Per-viewer settings (conveniences only; the page works without storage) ---- */
const SETTINGS_KEY = 'prp.osint.settings';
export const settings = {
  all() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; } },
  get(k, d) { const v = this.all()[k]; return v === undefined ? d : v; },
  set(k, v) { try { const s = this.all(); s[k] = v; localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ } },
};

/** The user's system, for install steps: a saved choice, or a guess from the browser. */
export function detectOs() {
  const saved = settings.get('os', '');
  if (['windows', 'macos', 'linux'].includes(saved)) return saved;
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'macos';
  if (p.includes('linux') || p.includes('x11') || p.includes('cros')) return 'linux';
  return 'windows';
}

/** Read a File as an ArrayBuffer. */
export const readFile = file => (file.arrayBuffer ? file.arrayBuffer() : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsArrayBuffer(file); }));
export const readTextFile = file => (file.text ? file.text() : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsText(file); }));

/** Make a label.dropzone accept dropped files and keyboard activation; calls onFile(file). */
export function wireDropzone(zone, input, onFile) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); });
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) onFile(f); input.value = ''; });
  zone.tabIndex = 0;
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
}

/** Keyboard support for a role=tablist: arrows, Home and End move and activate. */
export function wireTablist(list, activate) {
  list.addEventListener('keydown', e => {
    const tabs = $$('[role=tab]', list), i = tabs.indexOf(document.activeElement);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || j === undefined) return;
    e.preventDefault();
    const t = tabs[(j + tabs.length) % tabs.length];
    t.focus(); activate(t);
  });
}

/** A one-line external link. */
export const extLink = (href, text, cls = '') => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${cls ? ` class="${cls}"` : ''}>${esc(text)}<span class="sr-only"> (opens in a new tab)</span></a>`;
