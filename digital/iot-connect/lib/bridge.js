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

/** How long the bridge itself waits, in seconds (its /iot/status `waits` replaces these, so the page waits exactly as
    long as the bridge it talks to, plus a margin for the reply to arrive): for Y in the bridge window, for a TV's own
    accept after the Y, for a command to a device (two UPnP actions of up to 30 seconds each for "Play address", then
    the volume check after a play starts), and for Hermes's optional AI question. Plain reads wait READ_SECONDS. */
export const WAITS = { confirm: 60, pair: 60, command: 70, ai: 20 };
export const READ_SECONDS = 12;
const MARGIN = 10;

/** What the page says when its own wait runs out (the bridge is running: it took the request and has not replied). */
export function late(wait, seconds) {
  if (wait === 'confirm' || wait === 'pair') return `No reply from the bridge within ${seconds} seconds while it waited for Y in its window. Look at the bridge window: it says whether the step was done.`;
  if (wait === 'command') return `No reply from the bridge within ${seconds} seconds: the device may still be answering. Press Read state to see whether it was done.`;
  return `The bridge took more than ${seconds} seconds to reply.`;
}

/**
 * A client for one bridge. `fetchFn` is the browser's fetch (or a test's). GET paths and POST paths are fixed by the
 * views; a path never comes from the address bar or the hash.
 */
export function createClient(base = DEFAULT_BRIDGE, { fetchFn = (...a) => fetch(...a), timeout = READ_SECONDS * 1000, waits = null, margin = MARGIN } = {}) {
  const root = normaliseBase(base);
  if (!root) throw new BridgeError('bad-request', 'The bridge must be on this computer: http://localhost and a port.');
  const w = { ...WAITS };
  const setWaits = x => { for (const k of Object.keys(WAITS)) if (Number.isFinite(x?.[k]) && x[k] > 0) w[k] = x[k]; };
  setWaits(waits);
  /** The page's limit for one kind of call, in milliseconds: the bridge's own wait and the margin. */
  const limit = wait => Math.round((wait === 'pair' ? w.confirm + w.pair + margin : w[wait] != null ? w[wait] + margin : 0) * 1000) || timeout;
  async function call(method, path, body, { wait = null } = {}) {
    if (!/^\/(health|iot(\/[a-z-]+){1,2})$/.test(path)) throw new BridgeError('bad-request', 'Not a bridge address this page uses.');
    const init = { method, headers: {}, cache: 'no-store', credentials: 'omit' };
    if (method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body && typeof body === 'object' ? body : {}); }
    const ms = limit(wait);
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(ms);
    let res;
    try { res = await fetchFn(root + path, init); } catch (e) {
      // The page's own limit ran out: the bridge took the request, so it is running; say so, not "did not answer".
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new BridgeError('timeout', late(wait, Math.round(ms / 1000)));
      throw new BridgeError('unreachable', unreachable(root));
    }
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
    /** opts.wait: 'confirm' (a step that waits for Y in the bridge window), 'pair', 'command' or 'ai'. */
    post: (path, body = {}, opts = {}) => call('POST', path, body, opts),
    setWaits,
    get waits() { return { ...w }; },
    limit,
  };
}
