// Vitruvian Manager proxy for the public aircraft feed (Cloudflare Pages Function). adsb.lol sends no CORS headers, so the SIGINT
// Dashboard can't read it from the browser; this same-origin endpoint relays one validated query shape with a short
// edge cache, so many viewers in one area share one upstream request.
//
// INSTALL (site owner): copy this file to  functions/api/sigint/adsb/[[path]].js  at the repository root. Pages then
// serves it at  /api/sigint/adsb/v2/point/{lat}/{lon}/{radius_nm}  and the dashboard uses it automatically.
// Data: adsb.lol, ODbL 1.0 (attribution shown on the page). adsb.lol asks heavy or production users to get in touch.

const UPSTREAM = 'https://api.adsb.lol/';
const TTL = 10; // seconds; aircraft move ~2.5 km in that time, and the page polls every 15 s
// Per client: the page asks 4 times a minute, so 30 leaves room for several tabs while a runaway client is turned away
// before it reaches adsb.lol. The count is kept in this isolate (Cloudflare runs several), so the cap is approximate;
// it is self-contained so this file can still be copied into place on its own.
const LIMIT = 30, WINDOW_MS = 60_000;
const hits = new Map(); // client ip → { start, count }

/** Seconds a client must wait before its next request, or 0. */
export function adsbWait(request, now = Date.now()) {
  const key = request.headers.get('cf-connecting-ip') || 'unknown';
  let h = hits.get(key);
  if (!h || now - h.start >= WINDOW_MS) hits.set(key, (h = { start: now, count: 0 }));
  if (++h.count <= LIMIT) return 0;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start >= WINDOW_MS) hits.delete(k);
  return Math.max(1, Math.ceil((h.start + WINDOW_MS - now) / 1000));
}
export const resetAdsbLimits = () => hits.clear(); // for the tests

/** Validate and normalise the path: only v2/point/{lat}/{lon}/{nm}, coordinates rounded to 0.01° to share cache entries. */
export function proxyPath(parts) {
  const p = Array.isArray(parts) ? parts : String(parts || '').split('/').filter(Boolean);
  if (p.length !== 5 || p[0] !== 'v2' || p[1] !== 'point') return null;
  const lat = Number(p[2]), lon = Number(p[3]), r = Number(p[4]);
  if (![lat, lon, r].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || r < 1 || r > 250) return null;
  return `v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${Math.round(r)}`;
}

export async function onRequestGet({ request, params, waitUntil }) {
  const wait = adsbWait(request);
  if (wait) return json(429, { error: `Too many requests: about ${LIMIT} a minute per client. Try again in ${wait} s.` }, { 'Retry-After': String(wait) });
  const path = proxyPath(params.path);
  if (!path) return json(400, { error: 'Use /api/sigint/adsb/v2/point/{lat}/{lon}/{radius_nm 1–250}' });
  const key = new Request(new URL(`/api/sigint/adsb/${path}`, request.url).href);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let up;
  try {
    up = await fetch(UPSTREAM + path, { headers: { Accept: 'application/json', 'User-Agent': 'PRP SIGINT Dashboard proxy (+https://jdpi.pages.dev/sigint/)' }, cf: { cacheTtl: TTL } });
  } catch {
    return json(502, { error: 'adsb.lol did not answer' });
  }
  if (!up.ok) return json(up.status === 429 ? 429 : 502, { error: `adsb.lol answered HTTP ${up.status}` });
  const res = new Response(up.body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}`, 'X-Source': 'adsb.lol (ODbL)' } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
