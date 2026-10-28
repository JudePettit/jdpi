// Time per call of the remote MCP server's tools and the API's feed and calendar routes, measured locally.
//   node integration/scripts/bench.mjs [--runs 15]
// Files are served from memory as bytes (like env.ASSETS), so no disk I/O is counted and, the work being single-threaded,
// elapsed time is CPU time. (process.cpuUsage ticks at ~15 ms on Windows, too coarse for this.)
//   core cold  = a fresh isolate: every file the call needs is parsed (JSON.parse dominates)
//   core warm  = the same isolate again: files already parsed and cached
//   function   = the whole Pages Function on a fresh isolate: decoding the asset bodies, JSON-RPC or HTTP wrapper, the tool
// Cloudflare Workers Free allows 10 ms of CPU per request; edge cores are typically somewhat slower than a desktop's.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const at = process.argv.indexOf('--runs');
const runs = Math.max(3, at > 0 ? +process.argv[at + 1] || 15 : 15);
const load = p => import(pathToFileURL(join(ROOT, p)).href);
const { createPRP } = await load('integration/mcp/prp-mcp.mjs');
const { onRequest: mcp } = await load('functions/mcp.js');
const { onRequest: api } = await load('functions/api/v1/[[path]].js');
const { resetRateLimits } = await load('functions/_lib/prp-http.js');

const bytes = new Map();
const file = p => { if (!bytes.has(p)) { try { bytes.set(p, readFileSync(join(ROOT, p))); } catch { bytes.set(p, null); } } return bytes.get(p); };
const read = async p => { const b = file(p); return b == null ? null : b.toString('utf8'); };
const env = { ASSETS: { fetch: async req => { const b = file(decodeURIComponent(new URL(req.url).pathname).slice(1)); return b == null ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) : new Response(b, { headers: { 'content-type': 'application/json' } }); } } };

const cases = [
  ['tools/list', null],
  ['list_datasets', {}], ['describe_dataset', { id: 'congress-trades' }],
  ['query_dataset', { id: 'realtime-wars', where: { zone: 'Africa' }, sort: '-deaths', limit: 10 }],
  ['query_dataset', { id: 'political-calendar', where: { type: 'coup' } }],
  ['query_dataset', { id: 'political-calendar', where: { country: 'Chile', date: { gte: '2010-01-01' } } }],
  ['query_dataset', { id: 'congress-trades', where: { ticker: 'NVDA' }, sort: '-filed' }],
  ['query_dataset', { id: 'encyclopaedia-entities', where: { type: 'person' }, sort: '-mentions', limit: 20 }],
  ['query_dataset', { id: 'national-key-series', where: { indicator: 'NY.GDP.MKTP.KD.ZG', iso3: 'GBR' } }],
  ['query_dataset', { id: 'intelligence-briefing-stories', text: 'budget', limit: 20 }],
  ['search_encyclopaedia', { query: 'Mearsheimer' }], ['search_encyclopaedia', { query: 'labour party' }], ['search_encyclopaedia', { query: 'UN' }],
  ['get_entity', { qid: 'Q8663' }], ['upcoming_events', {}], ['upcoming_events', { country: 'France', from: '1980-01-01', to: '1984-12-31' }],
  ['latest_briefing', { briefing: 'intelligence' }], ['latest_briefing', { briefing: 'intelligence', query: 'budget' }], ['latest_briefing', { briefing: 'scientific', topic: 'physics' }],
  ['latest_briefing', { briefing: 'economics' }], ['latest_briefing', { briefing: 'digital' }], ['country_profile', { country: 'Japan' }], ['list_submodules', {}],
  ['GET', '/api/v1/feeds/intelligence.rss'], ['GET', '/api/v1/feeds/scientific.json'], ['GET', '/api/v1/calendar.ics'], ['GET', '/api/v1/calendar.ics?country=FR'], ['GET', '/api/v1/datasets/congress-trades/rows?f.ticker=AAPL']
];
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const min = a => Math.min(...a);
let host = 0;
const rpcFor = (name, args) => (name === 'tools/list' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' } : { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
async function viaCore(name, args, prp) {
  const r = await prp.handleMessage(rpcFor(name, args));
  if (r.result?.isError) throw new Error(`${name}: ${r.result.content[0].text}`);
  return JSON.stringify(r).length;
}
async function viaFunction(name, args) {
  const origin = `https://b${host++}.test`; // a new origin is a fresh PRP instance: a cold isolate
  if (name === 'GET') { const u = new URL(origin + args); const r = await api({ request: new Request(u), env, params: { path: u.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean) } }); return (await r.text()).length; }
  const r = await mcp({ request: new Request(origin + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(rpcFor(name, args)) }), env });
  return (await r.text()).length;
}
for (const [name, args] of cases) { if (name !== 'GET') await viaCore(name, args, createPRP({ read })); await viaFunction(name, args); } // load every file once
console.log(`Time per call over ${runs} runs, in ms: minimum (the intrinsic cost) / median (with this machine's noise). Files in memory, so no I/O.\n`);
console.log('call'.padEnd(66), 'core cold'.padStart(12), 'core warm'.padStart(12), 'function cold'.padStart(14), 'reply'.padStart(9));
for (const [name, args] of cases) {
  const cold = [], warm = [], fn = []; let size = 0;
  for (let i = 0; i < runs; i++) {
    resetRateLimits();
    if (name !== 'GET') {
      const prp = createPRP({ read });
      let t = performance.now(); size = await viaCore(name, args, prp); cold.push(performance.now() - t);
      t = performance.now(); await viaCore(name, args, prp); warm.push(performance.now() - t);
    }
    const t = performance.now(); const n = await viaFunction(name, args); fn.push(performance.now() - t); if (name === 'GET') size = n;
  }
  const label = name === 'GET' ? `GET ${args}` : `${name} ${args ? JSON.stringify(args) : ''}`;
  const f = a => (a.length ? `${min(a).toFixed(1)} / ${median(a).toFixed(1)}` : '–');
  console.log(label.slice(0, 66).padEnd(66), f(cold).padStart(12), f(warm).padStart(12), f(fn).padStart(14), `${(size / 1024).toFixed(1)} KB`.padStart(9));
}
