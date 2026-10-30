// SIGINT Dashboard: small shared helpers. Nothing here touches the DOM when imported, so Node tests can load it.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isNum = v => typeof v === 'number' && Number.isFinite(v);
/** A finite number from a number or numeric string, else null. */
export const num = v => {
  if (typeof v === 'string') { if (v.trim() === '') return null; v = Number(v); }
  return isNum(v) ? v : null;
};
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, dp = 0) => { const k = 10 ** dp; return Math.round(v * k) / k; };

const nf = new Map();
/** Grouped number in en-GB style; dp fixed decimals. Null/NaN print as an en dash. */
export function fmt(v, dp = 0) {
  if (!isNum(v)) return '–';
  const key = dp;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  return nf.get(key).format(v);
}
export const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;

/** "now", "12 s ago", "4 min ago", "3 h ago", "2 d ago" for a millisecond age. */
export function ago(ms) {
  if (!isNum(ms)) return '–';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 2) return 'now';
  if (s < 90) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
/** A duration in seconds as "9 min 12 s" or "45 s". */
export function duration(s) {
  if (!isNum(s)) return '–';
  s = Math.round(s);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${r} s` : ''}` : `${r} s`;
}
const pad = n => String(n).padStart(2, '0');
export const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const hhmmss = d => `${hhmm(d)}:${pad(d.getSeconds())}`;
export const utcHHMM = d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
export function dayLabel(d, now = new Date()) {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((a - b) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export const isoDay = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** localStorage, best effort: private windows, previews and blocked storage fall back to defaults. */
export const store = {
  get(key, def = null) { try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
};

/* ---- Local network helpers --------------------------------------------------------------------------------------
   An https page may fetch http://localhost and http://127.0.0.1 (they count as secure), but not other http hosts,
   unless Chrome's Local Network Access treats the request as local: a private IP literal, a .local name, or a fetch
   marked targetAddressSpace: "local". Browsers that do not know the option ignore it. */
export function hostKind(url) {
  let u;
  try { u = new URL(url); } catch { return 'invalid'; }
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h)) return 'loopback';
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home.arpa') || (!h.includes('.') && !h.includes(':'))) return 'local';
  return 'public';
}
export const isLoopbackUrl = url => hostKind(url) === 'loopback';
/** fetch() options for a user-configured receiver URL. Loopback needs none (localhost is already a secure origin), and
    "local" is the one value every Chrome that knows the option accepts. */
export function localFetchOptions(url) {
  return hostKind(url) === 'local' ? { targetAddressSpace: 'local' } : {};
}
/** Why a URL can't be fetched from this page, or '' if it should work (CORS still applies). */
export function mixedContentProblem(url, pageProtocol) {
  let u;
  try { u = new URL(url); } catch { return 'That is not a valid URL.'; }
  if (!/^https?:$/.test(u.protocol)) return 'Use an http:// or https:// address.';
  if (pageProtocol === 'https:' && u.protocol === 'http:' && hostKind(url) === 'public') return 'This page is served over HTTPS, so browsers block plain-HTTP addresses on the internet. Use https://, or reach it through the Vitruvian Manager bridge on localhost.';
  return '';
}

/** fetch with a timeout; resolves to the Response or throws (TypeError for network/CORS, AbortError for timeout). */
export async function fetchWithTimeout(url, { timeout = 12000, ...opts } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}
export async function fetchJSON(url, opts = {}) {
  const r = await fetchWithTimeout(url, opts);
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
/** A short, honest reason for a failed fetch. */
export function explainError(e) {
  if (!e) return 'Unknown error';
  if (e.name === 'AbortError') return 'Timed out';
  if (e.status) return `Server answered HTTP ${e.status}`;
  if (e instanceof TypeError) return 'Blocked or unreachable (network, CORS or mixed content)';
  return e.message || String(e);
}
