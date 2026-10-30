// Integration Hub (Digital Science): the catalogue contract, the MCP server and JSON API Pages Functions (called with a fake
// env whose ASSETS reads this checkout), caps and errors, the file allowlist, feeds and calendars, the local stdio server,
// and the page.   node --test tests/integration-hub.test.mjs
// PRP_PAGES=0 leaves the page test out (the daily workflow's check after the catalogue build); PRP_CPU_LIMIT_MS raises the
// time limit of the hostile-requests test on a slower machine (default 40 ms).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, normalize, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const imp = p => import(pathToFileURL(join(ROOT, p)).href);
const core = await imp('integration/mcp/prp-mcp.mjs');
const { onRequest: mcp } = await imp('functions/mcp.js');
const { onRequest: api } = await imp('functions/api/v1/[[path]].js');
const { resetRateLimits } = await imp('functions/_lib/prp-http.js');
const CAT = J('integration/catalog.json');
const QI = J('integration/data/query-index.json');
const REG = J('registry.json');

/* ---------------------------------------------------------------- a fake Pages env: ASSETS reads this checkout */
const fetched = [];
function makeEnv() {
  return {
    ASSETS: {
      fetch: async req => {
        const u = new URL(typeof req === 'string' ? req : req.url);
        const path = decodeURIComponent(u.pathname);
        fetched.push(path);
        const file = normalize(join(ROOT, path));
        if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
        try { const body = await readFile(file); return new Response(body, { headers: { 'content-type': extname(file) === '.json' ? 'application/json' : 'text/plain' } }); }
        catch { return new Response('<!doctype html><title>Vitruvian Manager</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }); } // Pages' single-page fallback
      }
    }
  };
}
let origin = 0; // a fresh origin per test file section gets a fresh PRP instance (the functions keep one per origin)
const site = () => `https://t${origin}.jdpi.test`;
async function rpc(body, { headers = {}, method = 'POST', env = makeEnv() } = {}) {
  const init = { method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await mcp({ request: new Request(site() + '/mcp', init), env });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}
const call = async (name, args = {}) => (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).json.result;
async function get(path, { method = 'GET', env = makeEnv() } = {}) {
  const u = new URL(site() + path);
  const res = await api({ request: new Request(u, { method }), env, params: { path: u.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean) } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

/* ================================================================ catalogue contract */
describe('catalogue (integration/catalog.json)', () => {
  const MODULES = new Set(['rt', 'rs', 'mm', 'ns', 'ds', 'kino']);
  const TYPES = new Set(['string', 'number', 'date', 'boolean', 'array', 'object']);
  const SUBMODULES = new Set(REG.suites.flatMap(s => s.modules.map(m => m.id)));
  test('follows the schema', () => {
    assert.match(CAT.generated, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(CAT.datasets.length >= 35, 'covers PRP\'s datasets');
    const ids = new Set();
    for (const d of CAT.datasets) {
      assert.match(d.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, d.id); assert.ok(!ids.has(d.id), `duplicate ${d.id}`); ids.add(d.id);
      for (const k of ['title', 'description', 'licence', 'refresh']) assert.ok(typeof d[k] === 'string' && d[k].length > 3, `${d.id}.${k}`);
      assert.ok(MODULES.has(d.module), `${d.id}.module`); assert.ok(SUBMODULES.has(d.submodule), `${d.id}.submodule ${d.submodule} is a registry id`);
      assert.equal(d.format, 'json'); assert.equal(typeof d.records, 'string');
      assert.ok(!!d.url !== !!d.urls, `${d.id}: url or urls`);
      assert.match(d.updated, /^\d{4}-\d{2}-\d{2}$/, `${d.id}.updated`);
      assert.ok(Array.isArray(d.sources) && d.sources.length && d.sources.every(s => typeof s === 'string' && s.length), `${d.id}.sources`);
      assert.ok(Number.isInteger(d.rows) && d.rows > 0, `${d.id}.rows`);
      assert.ok(d.fields.length > 0);
      for (const f of d.fields) {
        assert.ok(TYPES.has(f.type), `${d.id}.${f.name} type ${f.type}`);
        assert.ok(f.description && f.description !== f.name, `${d.id}.${f.name} is described`);
        // A source that refreshes between catalogue builds may add a field; the build lists it as "not yet described".
        if (d.derivedFrom || !LIVE.has(d.refresh)) assert.ok(!/^Not yet described/.test(f.description), `${d.id}.${f.name} is described`);
      }
    }
  });
  // Briefings refresh several times a day, the catalogue once (after the calendars): their files may be newer than it.
  const LIVE = new Set(['6-hourly', 'twice daily']);
  test('files exist, records resolve, row counts and field lists are real', () => {
    for (const d of CAT.datasets) {
      let n = 0; const keys = new Set();
      for (const u of d.urls || [d.url]) {
        assert.ok(existsSync(join(ROOT, u)), `${d.id}: ${u} exists`);
        const recs = d.records ? d.records.split('.').reduce((o, k) => o?.[k], J(u)) : J(u);
        assert.ok(Array.isArray(recs), `${d.id}: ${u} → ${d.records} is an array`);
        n += recs.length; for (const r of recs) for (const k of Object.keys(r)) keys.add(k);
      }
      if (LIVE.has(d.refresh)) { assert.ok(n > 0, `${d.id} has rows`); continue; }
      assert.equal(n, d.rows, `${d.id} row count`);
      for (const k of keys) assert.ok(d.fields.some(f => f.name === k), `${d.id}: field ${k} is listed`);
      for (const f of d.fields) if (!d.derivedFrom) assert.ok(keys.has(f.name), `${d.id}: listed field ${f.name} occurs`);
    }
  });
  test('covers the main PRP datasets', () => {
    const ids = new Set(CAT.datasets.map(d => d.id));
    for (const id of ['political-calendar', 'upcoming-political-events', 'encyclopaedia-entities', 'realtime-wars', 'retrospective-wars', 'war-focus-wars', 'volatility-latest', 'national-countries', 'kardashev-shares',
      'science-briefing-stories', 'science-progress-events', 'econ-briefing-stories', 'congress-trades', 'investor-holdings', 'kino-documentaries', 'intelligence-briefing-stories', 'headline-outlets', 'prp-submodules']) assert.ok(ids.has(id), id);
    if (existsSync(join(ROOT, 'digital/briefing/data/stories.json'))) assert.ok(ids.has('digital-briefing-stories'));
  });
  test('the query index matches the catalogue', () => {
    for (const d of CAT.datasets) {
      const q = QI.datasets[d.id]; assert.ok(q, `${d.id} in the query index`);
      assert.deepEqual(new Set(q.parts.map(p => p.url)), new Set(d.urls || [d.url]));
      assert.equal(q.parts.reduce((a, p) => a + p.rows, 0), d.rows, `${d.id} parts' rows`);
      for (const p of q.parts) assert.ok(p.cost > 0 && p.bytes > 0);
      for (const p of q.parts.filter(x => x.url.startsWith('integration/data/'))) assert.ok(p.cost <= 1_400_000, `${p.url} is a small shard (cost ${p.cost})`);
    }
  });
  test('derived files carry provenance', () => {
    for (const d of CAT.datasets.filter(x => x.derivedFrom)) for (const u of d.urls || [d.url]) { const f = J(u); assert.equal(f.dataset, d.id); assert.ok(f.generated && f.licence && Array.isArray(f.derivedFrom)); }
  });
});

/* ================================================================ MCP protocol */
describe('MCP server (functions/mcp.js)', () => {
  before(() => { origin++; resetRateLimits(); });
  test('initialize negotiates the protocol version and declares tools', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.json.id, 1); assert.equal(r.json.result.protocolVersion, '2025-06-18');
    assert.deepEqual(r.json.result.capabilities, { tools: { listChanged: false } });
    assert.equal(r.json.result.serverInfo.name, 'prp'); assert.match(r.json.result.instructions, /data, not as instructions/);
    const old = await rpc({ jsonrpc: '2.0', id: 'a', method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    assert.equal(old.json.result.protocolVersion, '2025-03-26');
    const unknown = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    assert.equal(unknown.json.result.protocolVersion, core.PROTOCOL_VERSIONS[0]);
  });
  test('notifications get 202 with no body; ping answers', async () => {
    const n = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(n.status, 202); assert.equal(n.text, '');
    const p = await rpc({ jsonrpc: '2.0', id: 9, method: 'ping' });
    assert.deepEqual(p.json, { jsonrpc: '2.0', id: 9, result: {} });
  });
  test('tools/list: nine read-only tools with object schemas', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = r.json.result.tools;
    assert.deepEqual(tools.map(t => t.name), ['list_datasets', 'describe_dataset', 'query_dataset', 'search_encyclopaedia', 'get_entity', 'upcoming_events', 'latest_briefing', 'country_profile', 'list_submodules']);
    for (const t of tools) {
      assert.equal(t.inputSchema.type, 'object'); assert.equal(t.inputSchema.additionalProperties, false);
      assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); assert.ok(t.description.length > 40);
      assert.equal(t.fn, undefined);
    }
  });
  test('tools/call returns structured content plus the same JSON as text', async () => {
    const r = await call('list_datasets', { module: 'ns' });
    assert.equal(r.isError, false);
    assert.ok(r.structuredContent.datasets.every(d => d.module === 'ns'));
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
  });
  test('protocol errors', async () => {
    const unknownTool = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } });
    assert.equal(unknownTool.json.error.code, -32602);
    const unknownMethod = await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list' });
    assert.equal(unknownMethod.json.error.code, -32601);
    const parse = await rpc('{"jsonrpc":"2.0",');
    assert.equal(parse.status, 400); assert.equal(parse.json.error.code, -32700);
    const invalid = await rpc({ id: 6, method: 'ping' });
    assert.equal(invalid.status, 400); assert.equal(invalid.json.error.code, -32600);
    const nullId = await rpc({ jsonrpc: '2.0', id: null, method: 'ping' });
    assert.equal(nullId.json.error.code, -32600);
    const badParams = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: [1] });
    assert.equal(badParams.json.error.code, -32602);
  });
  test('batches: answers in order, notifications dropped; all-notification batch → 202', async () => {
    const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    assert.equal(r.status, 200); assert.equal(r.json.length, 2); assert.deepEqual(r.json.map(x => x.id), [1, 2]);
    const n = await rpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }]);
    assert.equal(n.status, 202);
    assert.equal((await rpc([])).status, 400);
    assert.equal((await rpc(Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' })))).status, 400);
  });
  test('HTTP: GET 405, OPTIONS 204 with CORS, content type, accept, size, protocol header, SSE', async () => {
    const g = await rpc(null, { method: 'GET' });
    assert.equal(g.status, 405); assert.match(g.headers.get('allow'), /POST/);
    const o = await mcp({ request: new Request(site() + '/mcp', { method: 'OPTIONS' }), env: makeEnv() });
    assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), '*'); assert.match(o.headers.get('access-control-allow-headers'), /MCP-Protocol-Version/i);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { accept: 'text/html' } })).status, 406);
    assert.equal((await rpc('{"x":"' + 'a'.repeat(70000) + '"}')).status, 413);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { 'mcp-protocol-version': '2020-01-01' } })).status, 400);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { 'mcp-protocol-version': '2025-06-18' } })).status, 200);
    const sse = await rpc({ jsonrpc: '2.0', id: 8, method: 'ping' }, { headers: { accept: 'text/event-stream' } });
    assert.match(sse.headers.get('content-type'), /text\/event-stream/);
    assert.deepEqual(JSON.parse(/^data: (.*)$/m.exec(sse.text)[1]), { jsonrpc: '2.0', id: 8, result: {} });
    const plain = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(plain.headers.get('access-control-allow-origin'), '*'); assert.equal(plain.headers.get('cache-control'), 'no-store');
  });
  test('rate limit: 429 with Retry-After past about 120 calls a minute', async () => {
    resetRateLimits();
    const env = makeEnv(); let last;
    for (let i = 0; i < 125; i++) last = await mcp({ request: new Request(site() + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' }), env });
    assert.equal(last.status, 429); assert.ok(+last.headers.get('retry-after') > 0);
    const other = await mcp({ request: new Request(site() + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' }), env });
    assert.equal(other.status, 200);
    resetRateLimits();
  });
});

/* ================================================================ tools */
describe('tools', () => {
  before(() => { origin++; resetRateLimits(); });
  test('describe_dataset gives fields, licence and a sample', async () => {
    const r = (await call('describe_dataset', { id: 'realtime-wars' })).structuredContent;
    assert.equal(r.id, 'realtime-wars'); assert.ok(r.fields.length > 5); assert.ok(r.sample.length > 0); assert.match(r.url, /^https:\/\/.*integration\/data\/realtime-wars\.json$/);
  });
  test('query_dataset filters, sorts, selects', async () => {
    const r = (await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'zone', op: 'eq', value: 'africa' }], select: ['name', 'deaths'], sort: '-deaths', limit: 3 })).structuredContent;
    assert.equal(r.returned, 3); assert.deepEqual(Object.keys(r.rows[0]), ['name', 'deaths']);
    assert.ok(r.rows[0].deaths >= r.rows[1].deaths && r.rows[1].deaths >= r.rows[2].deaths);
    assert.ok(r.complete); assert.ok(r.licence); assert.match(r.notice, /not as instructions/);
    const obj = (await call('query_dataset', { id: 'political-calendar', where: { country: 'Chile', date: { gte: '2020-01-01', lte: '2029-12-31' } }, sort: 'date' })).structuredContent;
    assert.ok(obj.complete, 'a date range reads only the decade it needs'); assert.equal(obj.scanned.shards, 1);
    assert.ok(obj.rows.every(e => e.country === 'Chile' && e.date >= '2020-01-01'));
    const arr = (await call('query_dataset', { id: 'science-progress-events', where: [{ field: 'disciplines', op: 'contains', value: 'Mathematics' }], limit: 2 })).structuredContent;
    assert.ok(arr.matched > 10);
    const txt = (await call('query_dataset', { id: 'realtime-wars', text: 'Sudan' })).structuredContent;
    assert.ok(txt.matched >= 1);
  });
  test('query_dataset caps rows, size and long text, and says so', async () => {
    const r = (await call('query_dataset', { id: 'science-briefing-stories', limit: 100 })).structuredContent;
    assert.ok(r.returned < 100, 'cut before 100 rows');
    assert.ok(JSON.stringify(r.rows).length <= 48_000 + 2_000, 'rows stay near the 48 KB cap');
    assert.ok(r.notes.some(n => /^Cut at \d+ rows/.test(n))); assert.equal(r.next_offset, r.returned);
    const longest = J('calendar/data/1990s.json').events.concat(J('calendar/data/2000s.json').events).sort((a, b) => (b.summary || '').length - (a.summary || '').length)[0];
    assert.ok(longest.summary.length > 600, 'a long summary to test with');
    const long = (await call('query_dataset', { id: 'political-calendar', where: { date: longest.date, title: longest.title }, select: ['title', 'summary'] })).structuredContent;
    assert.ok(long.rows[0].summary.length <= 600); assert.ok(long.rows[0].summary.endsWith('…')); assert.ok(long.notes.some(n => /shortened to 600/.test(n)));
    const big = (await call('query_dataset', { id: 'realtime-wars', limit: 1000 })).structuredContent;
    assert.ok(big.returned <= 100); assert.ok(big.notes.some(n => /capped at 100/.test(n)), 'a limit above the cap is capped, and the result says so');
  });
  test('sharded data: partial scans say so and continue with a cursor; indexes narrow the scan', async () => {
    const a = (await call('query_dataset', { id: 'political-calendar', where: { type: 'coup' } })).structuredContent;
    assert.equal(a.complete, false); assert.match(a.next_cursor, /^p\d+$/); assert.ok(a.notes[0].startsWith('Partial'));
    const b = (await call('query_dataset', { id: 'political-calendar', where: { type: 'coup' }, cursor: a.next_cursor })).structuredContent;
    assert.ok(b.scanned.records > 0); assert.notDeepEqual(b.rows[0], a.rows[0]);
    const t = (await call('query_dataset', { id: 'encyclopaedia-entities', where: { type: 'organisation' } })).structuredContent;
    assert.ok(t.complete); assert.equal(t.scanned.shards, 1, 'type partition: one shard');
    const ticker = Object.entries(QI.datasets['congress-trades'].index.ticker).find(([, parts]) => parts.length === 1)[0];
    const x = (await call('query_dataset', { id: 'congress-trades', where: { ticker } })).structuredContent;
    assert.ok(x.complete); assert.equal(x.scanned.shards, 1, 'ticker index: one shard');
  });
  test('query_dataset errors are tool errors with a way forward', async () => {
    const f = await call('query_dataset', { id: 'realtime-wars', where: { nope: 1 } });
    assert.equal(f.isError, true); assert.match(f.content[0].text, /No field "nope"\. Fields: id, name/);
    const op = await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'name', op: 'regex', value: '.*' }] });
    assert.match(op.content[0].text, /Unknown op/);
    const id = await call('query_dataset', { id: 'no-such-thing' });
    assert.equal(id.isError, true); assert.match(id.content[0].text, /No dataset/);
    const arg = await call('query_dataset', { id: 'realtime-wars', evil: true });
    assert.match(arg.content[0].text, /Unknown argument "evil"/);
    const cur = await call('query_dataset', { id: 'political-calendar', cursor: 'p99' });
    assert.match(cur.content[0].text, /cursor/);
    const many = await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'id', op: 'in', value: Array.from({ length: 101 }, (_, i) => 'w' + i) }] });
    assert.match(many.content[0].text, /at most 100 values/);
    const listForEq = await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'zone', op: 'eq', value: ['Europe'] }] });
    assert.match(listForEq.content[0].text, /takes one value/);
    assert.match((await call('query_dataset', { id: 'realtime-wars', select: Array.from({ length: 61 }, () => 'id') })).content[0].text, /at most 60 fields/);
  });
  test('search_encyclopaedia and get_entity', async () => {
    const s = (await call('search_encyclopaedia', { query: 'mearsheimer' })).structuredContent;
    assert.equal(s.results[0].qid, 'Q461830');
    const war = (await call('search_encyclopaedia', { query: 'Korean War', type: 'conflict' })).structuredContent;
    assert.equal(war.results[0].label, 'Korean War');
    const alias = (await call('search_encyclopaedia', { query: 'USSR' })).structuredContent;
    assert.equal(alias.results[0].label, 'Soviet Union');
    const e = (await call('get_entity', { qid: 'Q8663', mentions: 3 })).structuredContent;
    assert.equal(e.label, 'Korean War'); assert.ok(e.mentions.length <= 3); assert.match(e.summary_licence, /CC BY-SA/);
    const byTitle = (await call('get_entity', { title: 'John Mearsheimer' })).structuredContent;
    assert.equal(byTitle.qid, 'Q461830');
    assert.equal((await call('get_entity', { qid: 'Q0' })).isError, true);
    assert.equal((await call('get_entity', { qid: 'Q1/../../x' })).isError, true);
  });
  test('upcoming_events, country_profile, latest_briefing, list_submodules', async () => {
    const ev = (await call('upcoming_events', { type: 'ballots', limit: 5 })).structuredContent;
    assert.ok(ev.events.every(e => ['election', 'referendum', 'party'].includes(e.type) && e.date >= ev.from));
    const past = (await call('upcoming_events', { country: 'FRA', from: '2017-01-01', to: '2017-12-31', type: 'election' })).structuredContent;
    assert.ok(past.events.some(e => /French presidential election/.test(e.title)));
    assert.match((await call('upcoming_events', { type: 'picnic' })).content[0].text, /Unknown event type/);
    const c = (await call('country_profile', { country: 'Britain' })).structuredContent;
    assert.equal(c.iso3, 'GBR'); assert.ok(c.indicators.length > 20); assert.ok('volatility' in c && 'wars_this_year' in c);
    assert.equal((await call('country_profile', { country: 'Atlantis' })).isError, true);
    const intel = (await call('latest_briefing', { briefing: 'intelligence', limit: 10 })).structuredContent;
    assert.equal(intel.returned, 10); assert.ok(new Set(intel.items.map(i => i.position)).size >= 4, 'balanced across positions');
    const sci = (await call('latest_briefing', { briefing: 'scientific', topic: 'physics', type: 'paper', limit: 3 })).structuredContent;
    assert.ok(sci.items.every(i => i.type === 'paper' && i.topics.includes('Physics')));
    const econ = (await call('latest_briefing', { briefing: 'econ', topic: 'monetary' })).structuredContent;
    assert.equal(econ.briefing, 'Economics Briefing');
    const dig = await call('latest_briefing', { briefing: 'digital' });
    assert.equal(dig.isError, !existsSync(join(ROOT, 'digital/briefing/data/stories.json')));
    const sub = (await call('list_submodules', { module: 'ds' })).structuredContent;
    assert.ok(sub.submodules.some(m => m.id === 'integration-hub'));
  });
});

/* ================================================================ only catalogue files can be read */
describe('file allowlist', () => {
  before(() => { origin++; resetRateLimits(); });
  test('the allowlist admits catalogue files and refuses everything else', () => {
    const prp = core.createPRP({ read: async () => null });
    for (const p of ['integration/catalog.json', 'integration/data/names/3.json', 'lake/data/e/7.json', 'integration/data/countries/FRA.json', 'calendar/data/1990s.json', 'registry.json']) assert.ok(prp.allowed(p), p);
    for (const p of ['_headers', '../_headers', 'functions/mcp.js', 'integration/../_headers', '/etc/passwd', 'lake/data/index.json', 'package.json', '.github/workflows/calendar-refresh.yml',
      'integration/data/countries/fra.json', 'lake/data/e/7.json?x', 'integration%2Fcatalog.json', 'C:\\Windows\\win.ini', 'https://example.com/x.json']) assert.ok(!prp.allowed(p), p);
  });
  test('hostile arguments never reach a file outside the catalogue', async () => {
    fetched.length = 0;
    const hostile = [
      ['describe_dataset', { id: '../../_headers' }], ['describe_dataset', { id: 'registry.json' }], ['query_dataset', { id: '../functions/mcp' }],
      ['query_dataset', { id: 'realtime-wars', cursor: '../../_headers' }], ['get_entity', { qid: 'Q1/../../../_headers' }], ['get_entity', { title: '../../../_headers' }],
      ['country_profile', { country: '../../../_headers' }], ['country_profile', { country: 'FRA/../../_headers' }], ['latest_briefing', { briefing: '../../_headers' }],
      ['search_encyclopaedia', { query: '../../_headers' }], ['list_datasets', { module: '../../' }], ['upcoming_events', { country: '../x', from: '../../' }]
    ];
    for (const [name, args] of hostile) await call(name, args);
    for (const path of ['/api/v1/datasets/..%2F..%2F_headers', '/api/v1/datasets/realtime-wars/rows?select=../../_headers', '/api/v1/entities/..%2F_headers', '/api/v1/countries/..%2F..%2F_headers', '/api/v1/feeds/..%2Fx.rss', '/api/v1/briefings/..%2F_headers']) {
      const r = await get(path); assert.ok(r.status >= 400, `${path} → ${r.status}`);
    }
    const allowedWith = core.createPRP({ read: async p => readFile(join(ROOT, p), 'utf8') });
    await allowedWith.callTool('list_datasets', {}); await allowedWith.callTool('describe_dataset', { id: 'realtime-wars' });
    for (const p of fetched) assert.ok(allowedWith.allowed(p.replace(/^\//, '')), `read only allowed files, not ${p}`);
    assert.ok(!fetched.some(p => /_headers|functions|package\.json|\.github/.test(p)));
  });
});

/* ================================================================ JSON API */
describe('JSON API (functions/api/v1)', () => {
  before(() => { origin++; resetRateLimits(); });
  test('index, catalogue, datasets, rows with f. filters', async () => {
    const i = await get('/api/v1/');
    assert.equal(i.status, 200); assert.equal(i.headers.get('access-control-allow-origin'), '*'); assert.ok(i.json.endpoints.length >= 10);
    const c = await get('/api/v1/catalog?module=ns');
    assert.ok(c.json.datasets.length && c.json.datasets.every(d => d.module === 'ns'));
    const l = await get('/api/v1/datasets?q=election');
    assert.ok(l.json.count >= 2);
    const d = await get('/api/v1/datasets/kardashev-world');
    assert.equal(d.json.id, 'kardashev-world');
    const r = await get('/api/v1/datasets/political-calendar/rows?f.country=Chile&f.date.gte=2020-01-01&f.type.in=election,referendum&select=date,title,type&sort=-date&limit=4');
    assert.equal(r.status, 200); assert.ok(r.json.rows.length > 0 && r.json.rows.length <= 4);
    assert.ok(r.json.rows.every(x => ['election', 'referendum'].includes(x.type) && x.date >= '2020-01-01'));
    assert.deepEqual(Object.keys(r.json.rows[0]), ['date', 'title', 'type']);
    const w = await get('/api/v1/datasets/realtime-wars/rows?where=' + encodeURIComponent(JSON.stringify({ zone: 'Europe' })));
    assert.ok(w.json.rows.every(x => x.zone === 'Europe'));
    assert.equal((await get('/api/v1/datasets/realtime-wars/rows?f.nope=1')).status, 400);
    assert.equal((await get('/api/v1/datasets/realtime-wars/rows?limit=abc')).status, 400);
  });
  test('search, entities, events, briefings, countries, submodules', async () => {
    assert.equal((await get('/api/v1/search?q=Thatcher&type=person')).json.results[0].qid, 'Q7416');
    assert.equal((await get('/api/v1/entities/Q8663')).json.label, 'Korean War');
    assert.equal((await get('/api/v1/entities?title=Korean%20War')).json.qid, 'Q8663');
    assert.equal((await get('/api/v1/entities/Q99999999')).status, 404);
    assert.equal((await get('/api/v1/entities/Q999999999999')).status, 400);
    const ev = await get('/api/v1/events?country=Germany&type=election,referendum&limit=3');
    assert.ok(ev.json.events.every(e => e.country === 'Germany'));
    assert.equal((await get('/api/v1/briefings')).json.briefings.length, 4);
    assert.equal((await get('/api/v1/briefings/scientific?topic=space&limit=2')).json.returned, 2);
    assert.equal((await get('/api/v1/briefings/intelligence?position=centre&limit=3')).json.items.every(i => i.position === 'Centre'), true);
    assert.ok((await get('/api/v1/countries')).json.count > 200);
    assert.equal((await get('/api/v1/countries/de')).json.iso3, 'DEU');
    assert.ok((await get('/api/v1/submodules?module=rt')).json.submodules.every(s => s.module === 'rt'));
  });
  test('feeds: RSS 2.0 and JSON Feed 1.1', async () => {
    const rss = await get('/api/v1/feeds/scientific.rss?topic=physics');
    assert.equal(rss.status, 200); assert.match(rss.headers.get('content-type'), /application\/rss\+xml/);
    assert.match(rss.text, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/); assert.ok((rss.text.match(/<item>/g) || []).length > 5);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(rss.text), 'no control characters');
    assert.equal((rss.text.match(/<item>/g) || []).length, (rss.text.match(/<\/item>/g) || []).length);
    const jf = await get('/api/v1/feeds/economics.json');
    assert.equal(jf.json.version, 'https://jsonfeed.org/version/1.1'); assert.ok(jf.json.items.length > 5 && jf.json.items.every(i => i.id && i.url));
    const intel = await get('/api/v1/feeds/intelligence.rss?position=far_right');
    assert.equal(intel.status, 200);
    assert.equal((await get('/api/v1/feeds/nothing.rss')).status, 400);
  });
  test('calendar.ics: valid iCalendar, filtered', async () => {
    const plain = await get('/api/v1/calendar.ics');
    assert.equal(plain.status, 302); assert.match(plain.headers.get('location'), /\/integration\/feeds\/realtime-calendar\.ics$/, 'unfiltered: the static file');
    const r = await get('/api/v1/calendar.ics?country=France&type=election');
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/calendar/);
    checkIcs(r.text);
    assert.ok(/SUMMARY:.*French/.test(r.text.replace(/\r\n /g, '')));
  });
  test('methods, unknown routes, HEAD', async () => {
    assert.equal((await get('/api/v1/catalog', { method: 'POST' })).status, 405);
    assert.equal((await get('/api/v1/nothing')).status, 404);
    const h = await get('/api/v1/catalog', { method: 'HEAD' });
    assert.equal(h.status, 200); assert.equal(h.text, '');
    const o = await api({ request: new Request(site() + '/api/v1/catalog', { method: 'OPTIONS' }), env: makeEnv(), params: { path: ['catalog'] } });
    assert.equal(o.status, 204);
  });
  test('every endpoint in openapi.json answers', async () => {
    const oa = J('integration/openapi.json');
    assert.equal(oa.openapi, '3.1.0');
    const examples = { '/': '/', '/catalog': '/catalog', '/datasets': '/datasets', '/datasets/{id}': '/datasets/volatility-global', '/datasets/{id}/rows': '/datasets/volatility-global/rows?limit=2', '/search': '/search?q=war', '/entities/{qid}': '/entities/Q8663',
      '/entities': '/entities?title=Korean%20War', '/events': '/events', '/briefings': '/briefings', '/briefings/{briefing}': '/briefings/economics', '/countries': '/countries', '/countries/{country}': '/countries/JPN', '/submodules': '/submodules',
      '/feeds/{feed}': '/feeds/economics.rss', '/calendar.ics': '/calendar.ics?type=summit' };
    for (const p of Object.keys(oa.paths)) { assert.ok(examples[p], `example for ${p}`); const r = await get('/api/v1' + examples[p]); assert.equal(r.status, 200, `${p} → ${r.status}`); }
    assert.deepEqual(oa.paths['/datasets/{id}'].get.parameters[0].schema.enum, CAT.datasets.map(d => d.id).sort());
  });
});

/* ================================================================ calendars, skill, llms.txt */
function checkIcs(text) {
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n') && text.endsWith('END:VCALENDAR\r\n'));
  const lines = text.split('\r\n'); lines.pop();
  assert.ok(lines.every(l => !l.includes('\n')), 'CRLF line endings only');
  for (const l of lines) assert.ok(Buffer.byteLength(l) <= 75, `line ≤ 75 octets: ${l.slice(0, 40)}`);
  const begins = lines.filter(l => l === 'BEGIN:VEVENT').length;
  assert.equal(begins, lines.filter(l => l === 'END:VEVENT').length);
  const uids = lines.filter(l => l.startsWith('UID:'));
  assert.equal(uids.length, begins); assert.equal(new Set(uids).size, uids.length, 'unique UIDs');
  return begins;
}
describe('calendars, skill and llms.txt', () => {
  test('static iCalendar files are valid and cover the calendars', () => {
    const files = readdirSync(join(ROOT, 'integration/feeds')).filter(f => f.endsWith('.ics'));
    assert.ok(files.includes('realtime-calendar.ics'));
    let n = 0;
    for (const f of files.filter(x => x.startsWith('historical'))) n += checkIcs(readFileSync(join(ROOT, 'integration/feeds', f), 'utf8'));
    checkIcs(readFileSync(join(ROOT, 'integration/feeds/realtime-calendar.ics'), 'utf8'));
    assert.ok(n >= CAT.datasets.find(d => d.id === 'political-calendar').rows - 10, 'every historical event is in a decade file');
  });
  test('toICS escapes text and folds multi-byte lines at 75 octets', () => {
    const ics = core.toICS([{ date: '2026-01-02', country: 'Côte d\'Ivoire', title: 'Élection présidentielle; second tour, «Abidjan»', type: 'election', status: 'tentative', summary: 'Ünïcödé '.repeat(40), source: 'https://example.org/a,b' }], { name: 'T', stamp: '2026-01-01T00:00:00Z' });
    checkIcs(ics);
    assert.match(ics.replace(/\r\n /g, ''), /SUMMARY:Élection présidentielle\\; second tour\\, «Abidjan» \(Côte d'Ivoire\)/);
    assert.match(ics, /STATUS:TENTATIVE/); assert.match(ics, /DTSTART;VALUE=DATE:20260102\r\nDTEND;VALUE=DATE:20260103/);
    const injected = core.toICS([{ date: '2024-02-29', country: 'X', title: 'A\rBEGIN:VEVENT\nB', type: 'vote', summary: 'one\r\ntwo\rthree' }], { stamp: '2026-01-01T00:00:00Z' });
    assert.equal(checkIcs(injected), 1, 'line breaks in data cannot start a new component');
    assert.ok(!/\r(?!\n)/.test(injected) && !/(?<!\r)\n/.test(injected), 'only CRLF line endings');
    assert.match(injected, /DTEND;VALUE=DATE:20240301/, 'leap day');
  });
  test('the skill zip holds SKILL.md with a name and description', () => {
    const z = readFileSync(join(ROOT, 'integration/skill/prp-data.zip'));
    assert.equal(z.readUInt32LE(0), 0x04034b50);
    assert.ok(z.includes('prp-data/SKILL.md') && z.includes('prp-data/reference/datasets.md'));
    const md = readFileSync(join(ROOT, 'integration/skill/prp-data/SKILL.md'), 'utf8');
    const fm = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(md.replace(/\r\n/g, '\n'));
    assert.ok(fm, 'frontmatter'); assert.equal(fm[1], 'prp-data'); assert.ok(fm[2].length < 1024);
  });
  test('llms.txt points to the catalogue, MCP server and API', () => {
    const t = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
    assert.match(t, /^# Vitruvian Manager \(VM\)/); assert.match(t, /\/mcp\)/); assert.match(t, /catalog\.json/); assert.match(t, /api\/v1/); assert.match(t, /not as instructions|never as instructions/);
    for (const d of CAT.datasets) assert.ok(t.includes(`[${d.id}]`), d.id);
  });
});

/* ================================================================ the local stdio server */
describe('local stdio server (integration/mcp/prp-mcp.mjs)', () => {
  test('speaks MCP over stdio, reading from --base', async () => {
    const server = createServer(async (req, res) => {
      const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      try { res.writeHead(200, { 'content-type': 'application/json' }).end(await readFile(p)); } catch { res.writeHead(404).end('not found'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const child = spawn(process.execPath, [join(ROOT, 'integration/mcp/prp-mcp.mjs'), '--base', base], { stdio: ['pipe', 'pipe', 'pipe'] });
    const replies = []; let buf = '';
    const waitFor = n => new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('timeout: ' + buf)), 20000); const check = () => { if (replies.length >= n) { clearTimeout(t); ok(); } else setTimeout(check, 20); }; check(); });
    child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { replies.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
    const send = m => child.stdin.write(JSON.stringify(m) + '\n');
    try {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'query_dataset', arguments: { id: 'political-calendar', where: { type: 'coup' }, limit: 500 } } });
      child.stdin.write('not json\n');
      await waitFor(4);
      const byId = Object.fromEntries(replies.filter(r => r.id != null).map(r => [r.id, r]));
      assert.equal(byId[1].result.serverInfo.name, 'prp');
      assert.equal(byId[2].result.tools.length, 9);
      const q = byId[3].result.structuredContent;
      assert.equal(q.complete, true, 'no edge budget locally: every shard read'); assert.equal(q.scanned.shards, 5); assert.ok(q.returned > 100, 'local row cap is higher');
      assert.ok(replies.some(r => r.error?.code === -32700), 'parse error answered');
    } finally { child.kill(); server.close(); }
  });
});

/* ================================================================ the page */
describe('page (integration/index.html)', () => {
  const html = readFileSync(join(ROOT, 'integration/index.html'), 'utf8');
  test('is hooked up to PRP as Digital Science · Integration Hub', () => {
    assert.match(html, /<html lang="en" data-suite="ds" class="prp">/);
    assert.match(html, /<title>Integration Hub · VM<\/title>/);
    assert.match(html, /href="\.\.\/design\/prp\.css"/);
    assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="ds" data-module="integration-hub" data-shell="\.\.\/" defer><\/script>/);
    assert.match(html, /Digital Science <span class="sep">·<\/span> Integration Hub/);
    assert.ok(!/JDP-I(?!q)|H&amp;P|F&amp;E/.test(html), 'no old brand names');
  });
  test('every tab has its panel', () => {
    for (const t of ['overview', 'catalogue', 'mcp', 'api', 'feeds', 'skills', 'security']) { assert.match(html, new RegExp(`id="tab-${t}"[^>]*aria-controls="panel-${t}"`)); assert.match(html, new RegExp(`id="panel-${t}" role="tabpanel"`)); }
  });
  test('CSS uses tokens only; the script escapes data', () => {
    const css = readFileSync(join(ROOT, 'integration/hub.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const values = [...css.matchAll(/[a-z-]+\s*:\s*([^;{}]+)[;}]/g)].map(m => m[1]);
    assert.ok(values.length > 100);
    assert.ok(!values.some(v => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v)), 'no raw colours in declarations: tokens only');
    const js = readFileSync(join(ROOT, 'integration/hub.js'), 'utf8');
    assert.match(js, /const esc = /); assert.match(js, /textContent = JSON\.stringify/, 'tool output is shown as text');
  });
});

/* ================================================================ abuse and robustness (security review) */
// Each test pins a problem an adversarial review found: CPU blow-ups at the edge, protocol corner cases, the stdio
// server's handling of piped input, and inputs that used to fail as internal errors.
const diskRead = async p => { try { return await readFile(join(ROOT, p), 'utf8'); } catch { return null; } };
const IN100 = Array.from({ length: 100 }, (_, i) => 'no such title ' + i);
const recordsOf = id => { const d = CAT.datasets.find(x => x.id === id); return (d.urls || [d.url]).flatMap(u => (d.records ? d.records.split('.').reduce((o, k) => o?.[k], J(u)) : J(u))); };
async function staticServer() {
  const server = createServer(async (req, res) => {
    const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { 'content-type': 'application/json' }).end(await readFile(p)); } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

describe('abuse and robustness', () => {
  before(() => { origin++; resetRateLimits(); });

  test('a batch runs at most one tools/call; cheap methods still share it', async () => {
    const calls = [1, 2, 3].map(id => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'query_dataset', arguments: { id: 'political-calendar', where: [{ field: 'title', op: 'in', value: IN100 }] } } }));
    const r = await rpc([...calls, { jsonrpc: '2.0', id: 4, method: 'ping' }, { jsonrpc: '2.0', id: 5, method: 'tools/list' }]);
    assert.equal(r.status, 200);
    const byId = Object.fromEntries(r.json.map(x => [x.id, x]));
    assert.equal(byId[1].result.isError, false);
    for (const id of [2, 3]) { assert.equal(byId[id].error.code, -32000); assert.match(byId[id].error.message, /one tools\/call per request/); }
    assert.deepEqual(byId[4].result, {}); assert.equal(byId[5].result.tools.length, 9);
  });

  test('a body sent without Content-Length is read only up to 64 KB', async () => {
    const chunk = new TextEncoder().encode(' '.repeat(16 * 1024));
    let pulled = 0;
    const body = new ReadableStream({ pull(c) { if (pulled++ < 64) c.enqueue(chunk); else c.close(); } }); // 1 MB, chunked
    const res = await mcp({ request: new Request(site() + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' }), env: makeEnv() });
    assert.equal(res.status, 413);
    assert.ok(pulled <= 8, `stopped after ${pulled} chunks of 16 KB`);
    const small = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"ping"}')); c.close(); } });
    assert.equal((await mcp({ request: new Request(site() + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: small, duplex: 'half' }), env: makeEnv() })).status, 200);
  });

  test('free-text words are distinct, at most eight and at most 64 characters', () => {
    assert.deepEqual(core.queryWords('e e e E é'), ['e']);
    assert.equal(core.queryWords(Array.from({ length: 50 }, (_, i) => 'w' + i).join(' ')).length, core.MAX_WORDS);
    assert.equal(core.queryWords('x'.repeat(500))[0].length, 64);
  });

  test('the work of a query is bounded, however many conditions, values and words it asks for', async () => {
    const prp = core.createPRP({ read: diskRead });
    const hostile = [
      { id: 'political-calendar', where: [{ field: 'title', op: 'in', value: IN100 }] },
      { id: 'political-calendar', where: Array.from({ length: 12 }, () => ({ field: 'summary', op: 'contains', value: 'e' })) },
      { id: 'intelligence-briefing-stories', text: 'e t a o i n s r', sort: ['-t', 'd', 'u'] },
      { id: 'encyclopaedia-entities', where: Array.from({ length: 12 }, () => ({ field: 'label', op: 'ne', value: 'zzz' })), text: 'a e i o' },
      { id: 'congress-trades', where: Array.from({ length: 12 }, () => ({ field: 'name', op: 'starts_with', value: '' })), sort: ['name', '-filed', 'asset'] }
    ];
    for (const args of hostile) for (const pass of ['cold', 'warm']) {
      const w0 = prp.workDone();
      const r = await prp.callTool('query_dataset', args);
      const spent = prp.workDone() - w0;
      // The row being filtered when the budget runs out may finish past the line (by its own cost); nothing else may.
      // Before the review, the second query cost 84M units (40 ms) and the first 50 ms.
      assert.ok(spent <= prp.limits.workBudget * 1.1, `${JSON.stringify(args).slice(0, 70)} (${pass}): ${spent.toLocaleString()} units`);
      if (!r.complete && r.next_cursor) assert.match(r.next_cursor, /^p\d+(r\d+)?$/);
      if (/r\d+$/.test(r.next_cursor || '')) assert.match(r.notes.join(' '), /only in part/);
    }
  });

  test('a query cut by its budget resumes mid-shard from its cursor and, followed to the end, finds every match', async () => {
    const prp = core.createPRP({ read: diskRead, limits: { workBudget: 150_000 } });
    const args = { id: 'political-calendar', where: [{ field: 'summary', op: 'contains', value: 'Election' }], select: ['date', 'title'], limit: 1 };
    let cursor, total = 0, calls = 0, mid = 0;
    do {
      const r = await prp.callTool('query_dataset', { ...args, ...(cursor ? { cursor } : {}) });
      total += r.matched; calls++; cursor = r.next_cursor;
      if (/r\d+$/.test(cursor || '')) mid++;
    } while (cursor && calls < 400);
    assert.ok(mid > 3, 'stopped inside shards');
    const want = recordsOf('political-calendar').filter(e => typeof e.summary === 'string' && core.foldText(e.summary).includes('election')).length;
    assert.equal(total, want, 'every record read exactly once across the cursors');
    assert.match((await call('query_dataset', { id: 'political-calendar', cursor: 'p0r999999' })).content[0].text, /cursor is not valid/);
  });

  test('`in` and `contains` give exactly the rows a plain comparison of each value gives', async () => {
    const prp = core.createPRP({ read: diskRead, limits: { scanBudget: Infinity, workBudget: Infinity } });
    // The comparison query_dataset documents: case and accents ignored, numbers compared as numbers, lists item by item.
    const fold = core.foldText, isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : NaN);
    const eqv = (a, b) => { if (a == null || b == null) return a == b; if (typeof a === 'number' || typeof b === 'number') { const x = num(a), y = num(b); return Number.isFinite(x) && x === y; } if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b); return fold(String(a)) === fold(String(b)); }; // eslint-disable-line eqeqeq
    const incl = (v, x) => typeof v === 'string' && fold(v).includes(fold(String(x)));
    const inRef = (v, xs) => xs.some(y => (Array.isArray(v) ? v.some(e => eqv(e, y)) : eqv(v, y)));
    const containsRef = (v, x) => (Array.isArray(v) ? v.some(e => eqv(e, x) || incl(e, x) || (isObj(e) && Object.values(e).some(y => incl(y, x)))) : incl(v, x));
    for (const id of ['science-progress-events', 'national-countries', 'realtime-wars']) {
      const recs = recordsOf(id), fields = CAT.datasets.find(d => d.id === id).fields;
      for (const f of fields) {
        const seen = [...new Set(recs.flatMap(r => (Array.isArray(r[f.name]) ? r[f.name] : [r[f.name]])).filter(v => v != null && typeof v !== 'object'))].slice(0, 4);
        const values = [...seen, ...seen.map(v => (typeof v === 'string' ? v.toUpperCase() : String(v))), ...seen.filter(v => typeof v === 'string' && Number.isFinite(num(v))).map(Number), true, 'false', null, 'Côte'].slice(0, 100);
        const got = (await prp.callTool('query_dataset', { id, where: [{ field: f.name, op: 'in', value: values }], limit: 1 })).matched;
        assert.equal(got, recs.filter(r => inRef(r[f.name], values)).length, `${id}.${f.name} in ${JSON.stringify(values).slice(0, 80)}`);
        for (const x of [seen[0], String(seen[0] ?? '').slice(1, 4), 5, true].filter(x => x != null && x !== '')) {
          const c = (await prp.callTool('query_dataset', { id, where: [{ field: f.name, op: 'contains', value: x }], limit: 1 })).matched;
          assert.equal(c, recs.filter(r => containsRef(r[f.name], x)).length, `${id}.${f.name} contains ${JSON.stringify(x)}`);
        }
      }
    }
  });

  test('a briefing search stops within its budget, newest items first, and says so', async () => {
    const tight = core.createPRP({ read: diskRead, limits: { workBudget: 50_000 } });
    const r = await tight.callTool('latest_briefing', { briefing: 'intelligence', query: 'e '.repeat(900), hours: 336 });
    assert.equal(r.complete, false); assert.ok(r.searched.items > 0 && r.searched.items < r.searched.of); assert.match(r.notes[0], /Searched the newest/);
    const light = await core.createPRP({ read: diskRead }).callTool('latest_briefing', { briefing: 'scientific', query: 'the' });
    assert.equal(light.complete, undefined, 'a light search covers everything');
  });

  // The fastest of three runs must stay under 40 ms: about four times the slowest case on a fast desktop core (the batch of
  // 20 in-lists, some 10 ms), and well below the 50 ms to 1.5 s these requests took before they were bounded. A shared CI
  // runner is slower and noisier, so PRP_CPU_LIMIT_MS raises the limit there (80 still catches that old cost on a runner
  // half as fast) rather than the check being dropped.
  const CPU_LIMIT_MS = Number(process.env.PRP_CPU_LIMIT_MS) || 40;
  test('hostile requests that took 50 ms to 1.5 s of CPU now take a few', async () => {
    resetRateLimits();
    const env = makeEnv();
    const e900 = 'e '.repeat(900);
    const cases = {
      'batch of 20 in-lists': () => rpc(Array.from({ length: 20 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name: 'query_dataset', arguments: { id: 'political-calendar', where: [{ field: 'title', op: 'in', value: IN100 }] } } })), { env }),
      'in-list of 100': () => get('/api/v1/datasets/political-calendar/rows?f.title.in=' + encodeURIComponent(IN100.join(',')), { env }),
      'briefing with 900 words': () => rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'latest_briefing', arguments: { briefing: 'intelligence', query: e900, hours: 336 } } }, { env }),
      'feed with 900 words': () => get('/api/v1/feeds/intelligence.rss?q=' + encodeURIComponent(e900), { env }),
      'events with 900 words': () => get('/api/v1/events?from=2018-01-01&days=1830&q=' + encodeURIComponent(e900), { env })
    };
    for (const [name, run] of Object.entries(cases)) {
      await run(); // files parsed: what remains is the work the request asks for
      const times = [];
      for (let i = 0; i < 3; i++) { const t = performance.now(); const r = await run(); times.push(performance.now() - t); assert.equal(r.status, 200, name); }
      assert.ok(Math.min(...times) < CPU_LIMIT_MS, `${name}: ${Math.min(...times).toFixed(1)} ms (limit ${CPU_LIMIT_MS} ms)`);
    }
  });

  test('impossible dates are 400s, not internal errors; very early and very late years work', async () => {
    for (const q of ['from=2024-13-45', 'from=2023-02-29', 'to=2024-04-31', 'from=2024-00-10', 'from=2024-02-30&days=3']) {
      const r = await get('/api/v1/events?' + q);
      assert.equal(r.status, 400, q); assert.match(r.json.error.message, /real date/, q);
    }
    assert.equal((await get('/api/v1/calendar.ics?from=2024-02-30')).status, 400);
    assert.equal((await get('/api/v1/events?from=2024-02-29&days=1')).status, 200);
    const early = await call('upcoming_events', { from: '0005-01-01' });
    assert.equal(early.isError, false); assert.equal(early.structuredContent.matched, 0);
    const late = await call('upcoming_events', { from: '9999-06-01' });
    assert.equal(late.isError, false); assert.equal(late.structuredContent.to, '9999-12-31');
  });

  test('inherited names are neither arguments nor ops', async () => {
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const r = await rpc(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_datasets","arguments":{"${k}":"x"}}}`);
      assert.equal(r.json.result.isError, true, k); assert.match(r.json.result.content[0].text, /Unknown argument/, k);
    }
    for (const op of ['constructor', '__proto__', 'toString', 'valueOf']) assert.match((await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'zone', op, value: 'x' }] })).content[0].text, /Unknown op/, op);
    assert.match((await call('query_dataset', { id: 'realtime-wars', where: [{ field: 'zone', op: 'in', value: [{ a: 1 }] }] })).content[0].text, /values for `in`/);
    assert.equal((await call('query_dataset', { id: 'congress-trades', where: { ticker: 'constructor' } })).structuredContent.matched, 0);
  });

  test('paths with white space or control characters are refused (a tab would turn "/\\t/x" into "//x")', () => {
    const prp = core.createPRP({ read: async () => null });
    assert.equal(new URL('/' + '\t/evil.example/x.json', 'https://jdpi.pages.dev').host, 'evil.example', 'what the rule prevents');
    for (const p of ['\t/evil.example/x.json', 'integration/catalog.json\n', ' integration/catalog.json', 'registry.json\r', 'lake/data/e/7.json\u0000']) assert.ok(!prp.allowed(p), JSON.stringify(p));
  });

  test('a wide filtered calendar stops at 400 events and says so', async () => {
    const r = await get('/api/v1/calendar.ics?from=2018-06-01&to=2021-06-01');
    assert.equal(r.status, 200);
    assert.equal(checkIcs(r.text), 400);
    assert.match(r.text.replace(/\r\n /g, ''), /X-WR-CALDESC:.*The first 400 of \d+ events/);
    assert.ok(+r.headers.get('x-prp-truncated') > 400);
  });

  test('a search reads at most 16 entry shards not yet parsed, and more on the next call', async () => {
    const prp = core.createPRP({ read: diskRead });
    const a = await prp.callTool('search_encyclopaedia', { query: 'ma', limit: 25 });
    assert.ok(prp.reads.filter(p => p.startsWith('lake/data/e/')).length <= 16);
    assert.ok(a.returned >= 10);
    const b = await prp.callTool('search_encyclopaedia', { query: 'ma', limit: 25 });
    assert.ok(b.returned >= a.returned);
  });

  test('stdio: piped input is answered before exit; empty and oversized batches and long lines follow JSON-RPC', async () => {
    const out = [];
    const lines = core.stdioLines(core.createPRP({ read: diskRead }), { write: async s => { out.push(JSON.parse(s)); }, maxLine: 4000 });
    lines.push('[]\n');
    lines.push(JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' }))) + '\n');
    lines.push('{"jsonrpc":"2.0","id":"x","method":"pi'); lines.push('ng"}\n'); // one message over two chunks
    lines.push('x'.repeat(5000)); lines.push('the rest of that long line\n');
    lines.push('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"list_datasets","arguments":{}}}'); // no final newline
    await lines.end();
    assert.deepEqual(out.map(o => o.error?.code ?? o.id), [-32600, -32600, 'x', -32600, 7]);
    assert.match(out[0].error.message, /empty batch/); assert.match(out[1].error.message, /at most 50/); assert.match(out[3].error.message, /limited to/);
    assert.equal(out[4].result.isError, false);
    // The real process, with stdin closed straight after one request (as `echo … | node prp-mcp.mjs` does).
    const { server, base } = await staticServer();
    try {
      const child = spawn(process.execPath, [join(ROOT, 'integration/mcp/prp-mcp.mjs'), '--base', base], { stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_datasets', arguments: { module: 'ns' } } }) + '\n');
      const text = await new Promise((ok, fail) => { let s = ''; const t = setTimeout(() => fail(new Error('timeout')), 20000); child.stdout.on('data', d => { s += d; }); child.on('close', () => { clearTimeout(t); ok(s); }); });
      const reply = JSON.parse(text.trim());
      assert.equal(reply.id, 1); assert.ok(reply.result.structuredContent.datasets.every(d => d.module === 'ns'));
    } finally { server.close(); }
  });

  test('stdio: --base must be a plain http(s) address', () => {
    assert.equal(core.baseUrl('http://localhost:8787'), 'http://localhost:8787/');
    assert.equal(core.baseUrl('https://jdpi.pages.dev/sub'), 'https://jdpi.pages.dev/sub/');
    for (const bad of ['file:///etc/', 'http://u:p@x.test/', 'https://x.test/?a=1', 'https://x.test/#y', 'javascript:alert(1)', '', 'ftp://x.test/', undefined]) assert.equal(core.baseUrl(bad), null, String(bad));
  });
});

/* ================================================================ the page under hostile data (Edge) */
// Every text slot the Hub fills from the catalogue or the address carries HTML that would count into window.__xss if it
// ever ran. The catalogue is served by the test (page.route), so nothing hostile is on disk. Skips when the page is not served.
describe('page under hostile data', () => {
  const BASE = (process.env.JDPI_URL || 'http://localhost:8787').replace(/\/$/, '');
  const XSS = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1">';
  const entry = (id, extra = {}) => ({ id, title: 'Evil ' + XSS, module: 'rt', submodule: 'x' + XSS, description: XSS, url: 'evil/' + XSS + '.json', format: 'json', records: XSS,
    fields: [{ name: XSS, type: XSS, description: XSS + ' (' + XSS + ')' }], rows: 3, licence: XSS.repeat(3), sources: [XSS], updated: '2026-10-28', refresh: XSS,
    page: 'javascript:window.__xss=1', derivedFrom: [XSS], bytes: 5000, ...extra });
  const catalogue = { generated: '2026-10-28', datasets: [entry('evil-set'), entry('x' + XSS, { module: XSS, urls: ['a/' + XSS, 'b.json'], url: undefined }), entry('science-briefing-stories', { fields: [{ name: 'disciplines', type: 'array', description: `Fields (${XSS}, b)` }] })] };
  test('hostile catalogue text and addresses are shown as text, never run', pageTest, async t => {
    if (!(await fetch(BASE + '/integration/').then(r => r.ok).catch(() => false))) { t.skip(`the Hub is not served at ${BASE}`); return; }
    const browser = await launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.route('**/integration/catalog.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogue) }));
      await context.route('**/integration/data/countries/index.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ countries: [{ iso3: 'XSS', iso2: 'XS', name: XSS, names: [XSS] }] }) }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const ran = () => page.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('img[src="x"], svg[onload]').length }));
      await page.goto(`${BASE}/integration/#tab=catalogue&ds=evil-set&q=${encodeURIComponent('evil')}&m=${encodeURIComponent(XSS)}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#cat-rows tr.detail');
      for (const tab of ['feeds', 'mcp', 'overview']) await page.click(`#tab-${tab}`);
      // The try-it console runs the server's code on the hostile catalogue: its output is text.
      await page.click('#tab-mcp');
      await page.selectOption('#try-tool', 'list_datasets');
      await page.fill('#try-args', '{}');
      await page.click('#try-run');
      await page.waitForFunction(() => /Done|error/.test(document.querySelector('#try-status').textContent));
      await page.evaluate(h => { location.hash = h; }, `#tab=catalogue&ds=${encodeURIComponent('x' + XSS)}&q=${encodeURIComponent(XSS)}`);
      await page.waitForSelector('#cat-rows tr.detail');
      assert.deepEqual(await ran(), { xss: undefined, imgs: 0 });
      assert.equal(await page.$$eval('a[href^="javascript:"]', a => a.length), 0, 'javascript: is never a link');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
});
