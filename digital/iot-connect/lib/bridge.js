// IoT Connect: the page's only way to the Vitruvian Manager bridge. It reads with GET and changes with POST, always
// with Content-Type exactly application/json and a JSON object as the body (the bridge refuses anything else), and it
// talks only to the bridge on this computer: http://localhost:8790, the one port the site's security policy lets
// this page reach. Every answer from the bridge has `ok`; a refusal is { ok: false, code, error }, where error is plain
// English the page shows with textContent. Nothing here runs on import, and nothing is sent unless a view calls it.

export const DEFAULT_BRIDGE = 'http://localhost:8790';
/** A bridge address the page will use: loopback by name or number, http, a port, no path. (Not [::1]: a security
    policy cannot name an IPv6 address, so the site's could not let the page reach it.) */
export const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})$/;

export function normaliseBase(url) {
  const v = String(url || '').trim().replace(/\/+$/, '');
  const m = LOOPBACK.exec(v);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 65535 ? v : null;
}

export class BridgeError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}

/** What to say when the bridge cannot be reached at all. */
export function unreachable(base) {
  return `The bridge did not answer at ${base}. Is it running with --iot, and did you allow this site to reach this computer when the browser asked?`;
}

/**
 * A client for one bridge. `fetchFn` is the browser's fetch (or a test's). GET paths and POST paths are fixed by the
 * views; a path never comes from the address bar or the hash.
 */
export function createClient(base = DEFAULT_BRIDGE, { fetchFn = (...a) => fetch(...a), timeout = 12000 } = {}) {
  const root = normaliseBase(base);
  if (!root) throw new BridgeError('bad-request', 'The bridge must be on this computer: http://localhost and a port.');
  async function call(method, path, body) {
    if (!/^\/(health|iot(\/[a-z-]+){1,2})$/.test(path)) throw new BridgeError('bad-request', 'Not a bridge address this page uses.');
    const init = { method, headers: {}, cache: 'no-store', credentials: 'omit' };
    if (method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body && typeof body === 'object' ? body : {}); }
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeout);
    let res;
    try { res = await fetchFn(root + path, init); } catch (e) { throw new BridgeError('unreachable', unreachable(root)); }
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    if (!json || typeof json !== 'object') throw new BridgeError('no-answer', `The bridge answered ${res.status} without a reply this page understands.`, res.status);
    if (path === '/health') return json;
    if (json.ok === false || !res.ok) throw new BridgeError(json.code || 'refused', String(json.error || `The bridge answered ${res.status}.`), res.status);
    return json;
  }
  return {
    base: root,
    health: () => call('GET', '/health'),
    get: path => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
  };
}
