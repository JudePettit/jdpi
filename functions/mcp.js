// PRP's remote MCP server (Digital Science · Integration Hub): https://jdpi.pages.dev/mcp
// MCP Streamable HTTP, stateless and read-only: POST a JSON-RPC 2.0 message (or a batch, with at most one tools/call)
// and get a JSON response (or a one-event SSE stream if the client accepts only text/event-stream). Notifications get
// 202 Accepted. There are no sessions, no server-to-client stream (GET answers 405) and no keys. Bodies stop at 64 KB,
// counted as they arrive. Tools and data: integration/mcp/prp-mcp.mjs.
//   claude mcp add --transport http prp https://jdpi.pages.dev/mcp
// Origin: any origin may call it. The server holds no credentials and serves only public data, so a cross-site call can
// learn nothing a direct call could not (the DNS-rebinding risk the MCP spec warns about concerns local servers).
import { PROTOCOL_VERSIONS } from '../integration/mcp/prp-mcp.mjs';
import { prpFor, rateLimit, json, CORS, SAFE } from './_lib/prp-http.js';

const MAX_BODY = 64 * 1024;
const MAX_BATCH = 20;
// One tools/call per request, batch or not: each call has a CPU budget of its own, so twenty in one batch used to cost
// twenty budgets (1.5 s of CPU) under one rate-limit count. Other methods are cheap and may share a batch.
const MAX_TOOL_CALLS = 1;
const DOCS = 'https://jdpi.pages.dev/integration/#mcp';
const rpcError = (status, code, message, headers) => json(status, { jsonrpc: '2.0', id: null, error: { code, message } }, { 'Cache-Control': 'no-store', ...headers });

// The body as text, or null past `max` bytes. A body sent without Content-Length (chunked) is read only up to the limit.
async function readBody(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch { /* the client went away */ } return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0; for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

export async function onRequest({ request, env }) {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'max-age=86400' } });
  if (method !== 'POST') {
    return json(405, { error: 'This is Vitruvian Manager\'s MCP endpoint (Streamable HTTP, stateless). POST JSON-RPC 2.0 messages to it; it offers no event stream.', docs: DOCS, connect: 'claude mcp add --transport http prp https://jdpi.pages.dev/mcp' },
      { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' });
  }

  const wait = await rateLimit(request, env, { limit: 120, scope: 'mcp' });
  if (wait) return rpcError(429, -32000, `Too many requests: Vitruvian Manager allows about 120 a minute per client. Try again in ${wait} s, or run the local server (integration/mcp/prp-mcp.mjs).`, { 'Retry-After': String(wait) });

  const version = request.headers.get('mcp-protocol-version');
  if (version && !PROTOCOL_VERSIONS.includes(version)) return rpcError(400, -32600, `Unsupported MCP-Protocol-Version ${version}. Supported: ${PROTOCOL_VERSIONS.join(', ')}.`);

  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/json')) return rpcError(415, -32600, 'Send JSON-RPC as Content-Type: application/json.');

  const accept = (request.headers.get('accept') || '*/*').toLowerCase();
  const wantsJson = /application\/json|\*\/\*|application\/\*/.test(accept);
  const wantsSse = accept.includes('text/event-stream');
  if (!wantsJson && !wantsSse) return rpcError(406, -32600, 'Accept application/json or text/event-stream.');

  const declared = +request.headers.get('content-length');
  if (declared > MAX_BODY) return rpcError(413, -32600, `Request too large (max ${MAX_BODY / 1024} KB).`);
  const body = await readBody(request, MAX_BODY);
  if (body == null) return rpcError(413, -32600, `Request too large (max ${MAX_BODY / 1024} KB).`);

  let msg;
  try { msg = JSON.parse(body); } catch { return rpcError(400, -32700, 'Parse error: the body is not valid JSON.'); }

  const prp = prpFor(request, env);
  let out;
  if (Array.isArray(msg)) {
    if (!msg.length) return rpcError(400, -32600, 'Invalid Request: empty batch.');
    if (msg.length > MAX_BATCH) return rpcError(400, -32600, `Invalid Request: at most ${MAX_BATCH} messages in a batch.`);
    const res = [];
    let toolCalls = 0;
    for (const m of msg) { // one at a time, to stay within the CPU budget
      const isCall = m && typeof m === 'object' && m.jsonrpc === '2.0' && m.method === 'tools/call' && Object.prototype.hasOwnProperty.call(m, 'id');
      if (isCall && ++toolCalls > MAX_TOOL_CALLS) {
        const ok = typeof m.id === 'string' || (typeof m.id === 'number' && Number.isFinite(m.id));
        res.push({ jsonrpc: '2.0', id: ok ? m.id : null, error: { code: -32000, message: `Server error: Vitruvian Manager's remote server runs ${MAX_TOOL_CALLS === 1 ? 'one tools/call' : `${MAX_TOOL_CALLS} tools/call messages`} per request. Send the others as separate requests.` } });
        continue;
      }
      const r = await prp.handleMessage(m); if (r) res.push(r);
    }
    if (!res.length) return new Response(null, { status: 202, headers: { ...CORS, ...SAFE } });
    out = res;
  } else {
    out = await prp.handleMessage(msg);
    if (!out) return new Response(null, { status: 202, headers: { ...CORS, ...SAFE } }); // a notification or a response
    if (out.error && (out.error.code === -32600 || out.error.code === -32700)) return json(400, out, { 'Cache-Control': 'no-store' }); // not a valid request at all
  }

  const headers = { ...CORS, ...SAFE, 'Cache-Control': 'no-store' };
  if (!wantsJson && wantsSse) {
    return new Response(`event: message\ndata: ${JSON.stringify(out)}\n\n`, { status: 200, headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8' } });
  }
  return json(200, out, headers);
}
