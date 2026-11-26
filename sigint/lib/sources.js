// SIGINT Dashboard: shared feed access used by the Overview checks and the live views (browser only).
import { store, fetchWithTimeout, fetchJSON, localFetchOptions, isoDay, explainError, hhmm } from './util.js';

/* ---- Public ADS-B: adsb.lol ------------------------------------------------------------------------------------------
   adsb.lol sends no CORS headers, so a browser can't read it directly. Routes, in order:
     1. the Vitruvian Manager proxy on this site (a Cloudflare Pages Function, functions/api/sigint/adsb/[[path]].js),
     2. the Vitruvian Manager bridge on this computer (its /public/adsb.lol relay),
     3. direct, in case adsb.lol enables CORS later.
   The winning route is remembered for the session. */
export const ADSB_PROXY_PATH = '/api/sigint/adsb';
let adsbRoute = null;
export const adsbRouteNow = () => adsbRoute;
export function adsbCandidates(ctx, lat, lon, nm) {
  const path = `v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.max(1, Math.min(250, Math.round(nm)))}`;
  const out = [];
  if (/^https?:$/.test(location.protocol)) out.push({ id: 'proxy', label: 'Vitruvian Manager proxy', url: `${location.origin}${ADSB_PROXY_PATH}/${path}` });
  if (ctx.bridge.on) out.push({ id: 'bridge', label: 'Vitruvian Manager bridge', url: `${ctx.bridge.url}/public/adsb.lol/${path}` });
  out.push({ id: 'direct', label: 'adsb.lol direct', url: `https://api.adsb.lol/${path}` });
  return out;
}
/** adsb.lol allows about 500 requests a day per address; count the ones this browser makes (direct or via the bridge). */
const BUDGET_KEY = 'prp.sigint.adsbBudget', DAILY_CAP = 450;
export function adsbBudget() {
  const b = store.get(BUDGET_KEY, null);
  const today = isoDay(new Date());
  return b && b.d === today ? b : { d: today, n: 0 };
}
function spend() { const b = adsbBudget(); b.n++; store.set(BUDGET_KEY, b); return b; }
export const adsbBudgetLeft = () => Math.max(0, DAILY_CAP - adsbBudget().n);

// A route that failed is skipped for a while (a CORS-blocked request still reaches adsb.lol and counts against its limit).
// The direct route is blocked by CORS today, so after one failure this browser leaves it alone for a day.
const blockedUntil = new Map();
const DIRECT_KEY = 'prp.sigint.adsbDirectBlockedUntil';
export async function fetchAdsbPublic(ctx, lat, lon, nm, { force = false } = {}) {
  if (force) blockedUntil.clear();
  const cands = adsbCandidates(ctx, lat, lon, nm);
  const order = adsbRoute ? [...cands.filter(c => c.id === adsbRoute), ...cands.filter(c => c.id !== adsbRoute)] : cands;
  let lastErr = null;
  for (const c of order) {
    if ((blockedUntil.get(c.id) || 0) > Date.now()) continue;
    if (c.id === 'direct' && (store.get(DIRECT_KEY, 0) || 0) > Date.now()) {
      lastErr = lastErr || Object.assign(new TypeError('adsb.lol does not allow browsers to read it directly (no CORS headers)'), { cors: true });
      continue;
    }
    if (c.id !== 'proxy' && adsbBudgetLeft() <= 0) { lastErr = Object.assign(new Error('Daily request budget for adsb.lol used up in this browser'), { budget: true }); continue; }
    try {
      if (c.id !== 'proxy') spend();
      const r = await fetchWithTimeout(c.url, { timeout: 10000, cache: 'no-store' });
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      const j = await r.json();
      if (!j || (!Array.isArray(j.ac) && !Array.isArray(j.aircraft))) throw new Error('Unexpected reply');
      adsbRoute = c.id;
      blockedUntil.delete(c.id);
      return { json: j, route: c };
    } catch (e) {
      lastErr = e;
      if (adsbRoute === c.id) adsbRoute = null;
      if (!(e.status >= 500)) blockedUntil.set(c.id, Date.now() + (c.id === 'direct' ? 10 : 3) * 60e3);
      if (c.id === 'direct' && e instanceof TypeError) store.set(DIRECT_KEY, Date.now() + 864e5);
    }
  }
  throw Object.assign(lastErr || new Error('Every route failed in the last few minutes'), { tried: order.map(c => c.label) });
}

/* ---- Your receivers: direct or through the bridge ---------------------------------------------------------------------- */
export function receiverUrl(ctx, { url, viaBridge, route }) {
  return viaBridge ? `${ctx.bridge.url}/local/${route}` : url;
}
export async function fetchReceiverJSON(ctx, opts, timeout = 8000) {
  const u = receiverUrl(ctx, opts);
  const r = await fetchWithTimeout(u, { timeout, cache: 'no-store', ...(opts.viaBridge ? {} : localFetchOptions(u)) });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

/* ---- CelesTrak GP data, cached in this browser (CelesTrak asks clients not to download the same data repeatedly) ----
   CelesTrak's usage policy (celestrak.org/usage-policy.php, updated 16 November 2026) asks software to stop querying on
   any answer other than HTTP 200, and to stop every request for at least 15 minutes after a 500 or 503. So after any
   failed download (another status, a reply that is not GP data, a timeout or a network failure) this browser leaves
   CelesTrak alone for 15 minutes, for every group, whether or not the visitor forces a refresh or reloads the page:
   the pause is kept in this browser's storage, and in this module too for when storage is blocked. Requests to
   CelesTrak go one at a time and a group already being asked for is not asked for twice, so a failure stops the
   requests queued behind it. Meanwhile the copy this browser kept is shown with its own time. */
const GP_PAUSE_KEY = 'prp.sigint.gpPausedUntil', GP_PAUSE_MS = 15 * 60e3;
let memPause = null;
const gpInFlight = new Map();
let gpChain = Promise.resolve();
// A pause that ends more than 15 minutes from now was stored while the clock was ahead; it is not trusted.
const livePause = (p, now) => p && typeof p.until === 'number' && p.until > now && p.until - now <= GP_PAUSE_MS ? p : null;
/** The pause after a failed CelesTrak download, { at, until, why, status }, or null when the page may ask again. */
export function gpPause(now = Date.now()) {
  return livePause(store.get(GP_PAUSE_KEY, null), now) || livePause(memPause, now);
}
const pauseNote = p => `${p.why} at ${hhmm(new Date(p.at))}, so this page will not ask CelesTrak again before ${hhmm(new Date(p.until))}`;
/** One request to CelesTrak, made only when no pause is running: { data, at } or { pause }. Never throws. */
async function askCelestrak(group, key) {
  const paused = gpPause();
  if (paused) return { pause: paused };
  const started = Date.now();
  try {
    const data = await fetchJSON(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, { timeout: 20000 })
      .catch(e => { throw e instanceof SyntaxError ? new Error('Unexpected reply from CelesTrak') : e; });
    if (!Array.isArray(data)) throw new Error('Unexpected reply from CelesTrak');
    const at = Date.now();
    store.set(key, { t: at, data });
    // A good answer ends only a pause that began before this request was sent (another tab may have started one since).
    const stored = store.get(GP_PAUSE_KEY, null);
    if (!(stored?.at >= started)) store.del(GP_PAUSE_KEY);
    if (!(memPause?.at >= started)) memPause = null;
    return { data, at };
  } catch (e) {
    const at = Date.now();
    const pause = { at, until: at + GP_PAUSE_MS, why: explainError(e), status: e.status || null };
    memPause = pause;
    store.set(GP_PAUSE_KEY, pause);
    return { pause };
  }
}
export async function loadGp(group, { maxAgeH = 6, force = false } = {}) {
  const key = `prp.sigint.gp.${group}`;
  const cached = store.get(key, null);
  const have = cached && Array.isArray(cached.data);
  if (!force && have && Date.now() - cached.t < maxAgeH * 3600e3) return { data: cached.data, at: cached.t, cached: true };
  let job = gpInFlight.get(group);
  if (!job) {
    job = gpChain.then(() => askCelestrak(group, key)).finally(() => { if (gpInFlight.get(group) === job) gpInFlight.delete(group); });
    gpInFlight.set(group, job);
    gpChain = job.then(() => {}, () => {});
  }
  const got = await job;
  if (got.data) return { data: got.data, at: got.at, cached: false };
  const { pause } = got;
  const note = pauseNote(pause);
  // No status on this error, so explainError() shows the whole sentence where the page gives the data's state.
  const err = Object.assign(new Error(note), { paused: true, retryAt: pause.until, httpStatus: pause.status });
  if (have) return { data: cached.data, at: cached.t, cached: true, stale: true, paused: true, retryAt: pause.until, note, error: err };
  throw err;
}

/* ---- Small public checks for the Overview -------------------------------------------------------------------------------- */
export const SWPC = 'https://services.swpc.noaa.gov';
export const WSPR_LIVE = 'https://db1.wspr.live/';
export const wsprUrl = sql => `${WSPR_LIVE}?query=${encodeURIComponent(sql)}`;

export async function bridgeHealth(ctx) {
  const r = await fetchWithTimeout(`${ctx.bridge.url}/health`, { timeout: 4000, cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  const j = await r.json();
  if (j?.name !== 'prp-bridge') throw new Error('Something else answered at that address');
  return j;
}
