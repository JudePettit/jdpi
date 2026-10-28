// Shared by the Integration Hub's Pages Functions: the remote MCP server (functions/mcp.js) and the JSON API
// (functions/api/v1/[[path]].js). No route lives here: this file exports helpers only.
//
// Data come only from this deployment's own static files, through env.ASSETS (never an outside URL), and only from the
// allowlist in integration/mcp/prp-mcp.mjs. Static files are immutable within a deployment, so one PRP instance (and its
// parsed-file cache) is kept per isolate.
import { createPRP } from '../../integration/mcp/prp-mcp.mjs';

let instance = null;
let instanceOrigin = null;

/** The PRP data service for this request's deployment. */
export function prpFor(request, env) {
  const origin = new URL(request.url).origin;
  if (!instance || instanceOrigin !== origin) {
    const read = async path => {
      const res = await env.ASSETS.fetch(new Request(new URL('/' + path, origin).href, { headers: { Accept: 'application/json' } }));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`static file ${path}: HTTP ${res.status}`);
      // Pages answers an unknown path with the site's index page (single-page fallback): that means "missing".
      if ((res.headers.get('content-type') || '').includes('text/html')) return null;
      return res.text();
    };
    instance = createPRP({ read, origin: origin + '/' });
    instanceOrigin = origin;
  }
  return instance;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version, Retry-After',
  'Access-Control-Max-Age': '86400'
};
export const SAFE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };

/**
 * Fair-use limit per client IP. With a Workers rate-limiting binding named PRP_RATE_LIMITER it is global; without one it
 * is a best-effort count per isolate (Cloudflare runs many), which still stops a single runaway loop.
 * Returns null when the request may go ahead, or the seconds to wait.
 */
const hits = new Map();
export async function rateLimit(request, env, { limit = 120, windowMs = 60_000, scope = 'mcp' } = {}) {
  const ip = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const key = `${scope}:${ip}`;
  if (env?.PRP_RATE_LIMITER?.limit) {
    try { const { success } = await env.PRP_RATE_LIMITER.limit({ key }); return success ? null : 60; } catch { /* fall back to the local count */ }
  }
  const now = Date.now();
  let h = hits.get(key);
  if (!h || now - h.start >= windowMs) { h = { start: now, count: 0 }; hits.set(key, h); }
  h.count++;
  if (hits.size > 5000) for (const [k, v] of hits) { if (now - v.start >= windowMs) hits.delete(k); if (hits.size <= 2500) break; }
  return h.count > limit ? Math.max(1, Math.ceil((h.start + windowMs - now) / 1000)) : null;
}
export function resetRateLimits() { hits.clear(); }

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...SAFE, ...headers } });
}
