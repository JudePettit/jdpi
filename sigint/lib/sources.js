// SIGINT Dashboard: shared feed access used by the Overview checks and the live views (browser only).
import { store, fetchWithTimeout, fetchJSON, localFetchOptions, isoDay } from './util.js';

/* ---- Public ADS-B: adsb.lol ------------------------------------------------------------------------------------------
   adsb.lol sends no CORS headers, so a browser can't read it directly. Routes, in order:
     1. the PRP proxy on this site (a Cloudflare Pages Function, sigint/edge/adsb-proxy.js, if the site deploys it),
     2. the PRP bridge on this computer (its /public/adsb.lol relay),
     3. direct, in case adsb.lol enables CORS later.
   The winning route is remembered for the session. */
export const ADSB_PROXY_PATH = '/api/sigint/adsb';
let adsbRoute = null;
export const adsbRouteNow = () => adsbRoute;
export function adsbCandidates(ctx, lat, lon, nm) {
  const path = `v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.max(1, Math.min(250, Math.round(nm)))}`;
  const out = [];
  if (/^https?:$/.test(location.protocol)) out.push({ id: 'proxy', label: 'PRP proxy', url: `${location.origin}${ADSB_PROXY_PATH}/${path}` });
  if (ctx.bridge.on) out.push({ id: 'bridge', label: 'PRP bridge', url: `${ctx.bridge.url}/public/adsb.lol/${path}` });
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

/* ---- CelesTrak GP data, cached in this browser (CelesTrak asks clients not to download the same data repeatedly) ---- */
export async function loadGp(group, { maxAgeH = 6, force = false } = {}) {
  const key = `prp.sigint.gp.${group}`;
  const cached = store.get(key, null);
  if (!force && cached && Array.isArray(cached.data) && Date.now() - cached.t < maxAgeH * 3600e3) return { data: cached.data, at: cached.t, cached: true };
  try {
    const data = await fetchJSON(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, { timeout: 20000 });
    if (!Array.isArray(data)) throw new Error('Unexpected reply from CelesTrak');
    store.set(key, { t: Date.now(), data });
    return { data, at: Date.now(), cached: false };
  } catch (e) {
    if (cached?.data) return { data: cached.data, at: cached.t, cached: true, stale: true, error: e };
    throw e;
  }
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
