// PRP JSON API v1 (Digital Science · Integration Hub): https://jdpi.pages.dev/api/v1/
// Read-only, public, no keys, CORS open. The same tools and caps as the MCP server (integration/mcp/prp-mcp.mjs), over GET.
// Described in integration/openapi.json.
//   /api/v1/                       index of endpoints
//   /api/v1/catalog                the data catalogue (?module=)
//   /api/v1/datasets               datasets in brief (?module= &q=)
//   /api/v1/datasets/{id}          one dataset: fields, licence, sources, sample
//   /api/v1/datasets/{id}/rows     rows: f.<field>=<value>, f.<field>.<op>=<value>, where=<json>, text, select, sort, limit, offset, cursor
//   /api/v1/search?q=              Encyclopaedia search (&type= &limit=)
//   /api/v1/entities/{qid}         an Encyclopaedia entry (or /api/v1/entities?title=)
//   /api/v1/events                 political calendar (?country= &type= &from= &to= &days= &q= &status= &limit=)
//   /api/v1/briefings/{briefing}   latest items: intelligence, scientific, economics, digital (?topic= &position= &type= &q= &source= &hours= &order= &limit=)
//   /api/v1/countries[/{country}]  country list, or one country's profile
//   /api/v1/submodules             Vitruvian Manager's pages (?module=)
//   /api/v1/feeds/{briefing}.rss | .json   RSS 2.0 or JSON Feed 1.1 of a briefing (?topic= &position= &type=)
//   /api/v1/calendar.ics           iCalendar of political events (?country= &type= &from= &to=; default the Realtime Calendar window)
import { toRSS, toJSONFeed, toICS, ToolError, briefingKey } from '../../../integration/mcp/prp-mcp.mjs';
import { prpFor, rateLimit, json, CORS, SAFE } from '../../_lib/prp-http.js';

const DOCS = 'https://jdpi.pages.dev/integration/#api';
const MAX_ICS_EVENTS = 400;
const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'in', 'exists'];
const err = (status, code, message, headers = {}) => json(status, { error: { code, message, docs: DOCS } }, { 'Cache-Control': 'no-store', ...headers });
const ok = (body, maxAge = 300) => json(200, body, { 'Cache-Control': `public, max-age=${maxAge}` });
const text = (body, type, maxAge = 900, extra = {}) => new Response(body, { status: 200, headers: { 'Content-Type': type, ...CORS, ...SAFE, 'Cache-Control': `public, max-age=${maxAge}`, ...extra } });

// Query-string parameters → tool arguments (only those the tool takes; numbers and booleans converted).
function args(q, spec) {
  const a = {};
  for (const [param, [name, kind]] of Object.entries(spec)) {
    const v = q.get(param);
    if (v == null || v === '') continue;
    if (kind === 'int') { if (!/^\d{1,6}$/.test(v)) throw new ToolError(`"${param}" must be a whole number.`); a[name] = +v; }
    else if (kind === 'bool') { if (!/^(true|false|1|0|yes|no)$/i.test(v)) throw new ToolError(`"${param}" must be true or false.`); a[name] = /^(true|1|yes)$/i.test(v); }
    else if (kind === 'list') a[name] = v.split(',').map(s => s.trim()).filter(Boolean);
    else a[name] = v;
  }
  return a;
}
function rowArgs(id, q) {
  const a = { id, ...args(q, { select: ['select', 'list'], sort: ['sort', 'list'], limit: ['limit', 'int'], offset: ['offset', 'int'], text: ['text', 'string'], q: ['text', 'string'], cursor: ['cursor', 'string'] }) };
  const where = [];
  if (q.get('where')) { let w; try { w = JSON.parse(q.get('where')); } catch { throw new ToolError('`where` must be JSON: a list of {field, op, value} or an object.'); } if (Array.isArray(w)) where.push(...w); else if (w && typeof w === 'object') a.where = w; else throw new ToolError('`where` must be a list or an object.'); }
  for (const [k, v] of q) {
    if (!k.startsWith('f.')) continue;
    const parts = k.slice(2).split('.');
    const op = parts.length > 1 && OPS.includes(parts[parts.length - 1]) ? parts.pop() : 'eq';
    const field = parts.join('.');
    if (!field) throw new ToolError(`Bad filter "${k}": use f.<field>=<value> or f.<field>.<op>=<value>.`);
    where.push({ field, op, value: op === 'in' ? v.split(',').map(s => s.trim()) : op === 'exists' ? !/^(false|0|no)$/i.test(v) : v });
  }
  if (where.length) { if (a.where) throw new ToolError('Use either `where` as an object or f.<field> filters, not both.'); a.where = where; }
  return a;
}

const ENDPOINTS = [
  ['GET /api/v1/catalog', 'The data catalogue: every dataset with fields, rows, licence, sources and file URLs.', '/api/v1/catalog?module=rt'],
  ['GET /api/v1/datasets', 'Datasets in brief.', '/api/v1/datasets?q=election'],
  ['GET /api/v1/datasets/{id}', 'One dataset: fields with types and meanings, licence, sources, shards and a sample.', '/api/v1/datasets/realtime-wars'],
  ['GET /api/v1/datasets/{id}/rows', 'Filter, sort and page rows: f.<field>=<value>, f.<field>.<op>=<value> (ops: ' + OPS.join(', ') + '), select, sort, limit (max 100), offset, text, cursor.', '/api/v1/datasets/political-calendar/rows?f.country=Chile&f.date.gte=2020-01-01&sort=-date&limit=5'],
  ['GET /api/v1/search', 'Search the Encyclopaedia by name.', '/api/v1/search?q=Mearsheimer'],
  ['GET /api/v1/entities/{qid}', 'One Encyclopaedia entry (or ?title= with a Wikipedia title).', '/api/v1/entities/Q8663'],
  ['GET /api/v1/events', 'Political calendar in a date range (default today to 18 months ahead).', '/api/v1/events?country=France&type=election'],
  ['GET /api/v1/briefings/{briefing}', 'Latest items of the intelligence, scientific, economics or digital briefing.', '/api/v1/briefings/scientific?topic=physics&type=paper'],
  ['GET /api/v1/countries/{country}', 'One country across Vitruvian Manager.', '/api/v1/countries/FRA'],
  ['GET /api/v1/submodules', 'Vitruvian Manager\'s pages by module.', '/api/v1/submodules?module=ns'],
  ['GET /api/v1/feeds/{briefing}.rss', 'RSS 2.0 of a briefing (.json for JSON Feed 1.1).', '/api/v1/feeds/economics.rss?topic=monetary'],
  ['GET /api/v1/calendar.ics', 'iCalendar of political events (filterable).', '/api/v1/calendar.ics?country=Germany&type=election,referendum']
];

export async function onRequest({ request, env, params }) {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'max-age=86400' } });
  if (method !== 'GET' && method !== 'HEAD') return err(405, 'method_not_allowed', 'The API is read-only: use GET.', { Allow: 'GET, HEAD, OPTIONS' });
  const wait = await rateLimit(request, env, { limit: 240, scope: 'api' });
  if (wait) return err(429, 'rate_limited', `Too many requests: about 240 a minute per client. Try again in ${wait} s, or read the static files in the catalogue.`, { 'Retry-After': String(wait) });

  const res = await route(request, env, params);
  return method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

async function route(request, env, params) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const seg = (Array.isArray(params?.path) ? params.path : String(params?.path || '').split('/')).filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  if (seg.some(s => s.length > 200 || /[\\]/.test(s) || s === '..')) return err(400, 'bad_path', 'That path is not valid.');
  const prp = prpFor(request, env);
  const call = (name, a) => prp.callTool(name, a);
  const site = url.origin + '/';
  try {
    const [a, b, c, ...rest] = seg;
    if (rest.length) return err(404, 'not_found', 'No such endpoint.');
    if (!a) return ok({ name: 'Vitruvian Manager JSON API', version: 'v1', publisher: 'JDP-Iq', about: 'Read-only access to Vitruvian Manager\'s public data. No keys; CORS open; about 240 requests a minute per client.', openapi: site + 'integration/openapi.json', mcp: site + 'mcp', docs: site + 'integration/#api', catalogue: site + 'integration/catalog.json', endpoints: ENDPOINTS.map(([route, description, example]) => ({ route, description, example: site.replace(/\/$/, '') + example })) }, 3600);
    switch (a) {
      case 'catalog': {
        if (b) break;
        const cat = await prp.getJson('integration/catalog.json');
        const m = q.get('module');
        return ok(m ? { ...cat, datasets: cat.datasets.filter(d => d.module === m) } : cat);
      }
      case 'datasets':
        if (!b) return ok(await call('list_datasets', args(q, { module: ['module', 'string'], q: ['query', 'string'] })));
        if (!c) return ok(await call('describe_dataset', { id: b }));
        if (c === 'rows') return ok(await call('query_dataset', rowArgs(b, q)));
        break;
      case 'search': if (!b) return ok(await call('search_encyclopaedia', args(q, { q: ['query', 'string'], query: ['query', 'string'], type: ['type', 'string'], limit: ['limit', 'int'] }))); break;
      case 'entities':
        if (c) break;
        return ok(await call('get_entity', b ? { qid: b, ...args(q, { mentions: ['mentions', 'int'] }) } : args(q, { title: ['title', 'string'], qid: ['qid', 'string'], mentions: ['mentions', 'int'] })), 3600);
      case 'events': if (!b) return ok(await call('upcoming_events', args(q, { country: ['country', 'string'], type: ['type', 'list'], from: ['from', 'string'], to: ['to', 'string'], days: ['days', 'int'], q: ['query', 'string'], status: ['status', 'string'], limit: ['limit', 'int'] }))); break;
      case 'briefings':
        if (c) break;
        if (!b) return ok({ briefings: Object.entries(prp.BRIEFINGS).map(([id, x]) => ({ id, name: x.name, module: x.module, api: `${site}api/v1/briefings/${id}`, rss: `${site}api/v1/feeds/${id}.rss`, json_feed: `${site}api/v1/feeds/${id}.json`, page: site + x.page })) }, 3600);
        return ok(await call('latest_briefing', { briefing: b, ...briefingArgs(q) }));
      case 'countries':
        if (c) break;
        if (!b) { const idx = await prp.getJson('integration/data/countries/index.json'); return ok({ count: idx.countries.length, countries: idx.countries.map(({ iso3, iso2, name }) => ({ iso3, iso2, name, profile: `${site}api/v1/countries/${iso3}` })) }, 3600); }
        return ok(await call('country_profile', { country: b }));
      case 'submodules': if (!b) return ok(await call('list_submodules', args(q, { module: ['module', 'string'] })), 3600); break;
      case 'feeds': {
        const m = /^([a-z]+)\.(rss|json|xml)$/.exec(b || '');
        if (!m || c) break;
        const key = briefingKey(m[1]);
        const B = prp.BRIEFINGS[key];
        const r = await call('latest_briefing', { briefing: key, ...briefingArgs(q), limit: 50, hours: 168 });
        const self = `${site}api/v1/feeds/${b}${url.search}`;
        const feed = { title: `Vitruvian Manager ${B.name}${r.topic ? ` · ${r.topics?.find(t => t.id === r.topic)?.label || r.topic}` : ''}${r.position ? ` · ${r.position.replace('_', ' ')}` : ''}`, link: site + B.page, self, updated: r.generated,
          description: `The newest items in Vitruvian Manager's ${B.name} (${B.module}). Headlines and summaries belong to their publishers; follow the links to read them.`, items: r.items };
        return m[2] === 'json' ? text(toJSONFeed(feed), 'application/feed+json; charset=utf-8') : text(toRSS(feed), 'application/rss+xml; charset=utf-8');
      }
      case 'calendar.ics': {
        if (b) break;
        // Unfiltered, it is exactly the Realtime Calendar file the daily build writes: send the client there (no CPU here).
        if (![...q.keys()].length) return new Response(null, { status: 302, headers: { Location: `${site}integration/feeds/realtime-calendar.ics`, ...CORS, 'Cache-Control': 'public, max-age=3600' } });
        const today = new Date().toISOString().slice(0, 10);
        const months = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
        const a2 = args(q, { country: ['country', 'string'], type: ['type', 'list'], from: ['from', 'string'], to: ['to', 'string'], q: ['query', 'string'] });
        // Default: the Realtime Calendar's window, six months back to eighteen months ahead.
        const r = await prp.findEvents({ from: months(today, -6), ...(a2.from ? {} : { to: months(today, 18) }), ...a2 }, { maxYears: 3 });
        // Writing iCalendar costs about 8 µs an event here: at most MAX_ICS_EVENTS, the earliest first, keep a call within budget.
        const events = r.hits.slice(0, MAX_ICS_EVENTS);
        const cut = r.hits.length > events.length ? ` The first ${MAX_ICS_EVENTS} of ${r.hits.length} events, to ${events[events.length - 1].date}: narrow the dates, country or types for the rest, or use the static calendar files.` : '';
        const name = `Vitruvian Manager political calendar${r.country ? ` · ${r.country.name}` : ''}${r.types ? ` · ${[...r.types].join(', ')}` : ''}`;
        return text(toICS(events, { name, description: `Political events ${r.from} to ${r.to} from Vitruvian Manager's Realtime and Historical Calendars.${cut}`, stamp: r.generated || undefined }), 'text/calendar; charset=utf-8', 3600, { 'Content-Disposition': 'inline; filename="prp-calendar.ics"', ...(cut ? { 'X-PRP-Truncated': String(r.hits.length) } : {}) });
      }
    }
    return err(404, 'not_found', `No endpoint ${url.pathname}. See ${site}api/v1/ for the list.`);
  } catch (e) {
    if (e instanceof ToolError) return err(e.status || 400, e.status === 404 ? 'not_found' : e.status === 403 ? 'forbidden' : 'bad_request', e.message);
    return err(500, 'internal', 'Something went wrong reading Vitruvian Manager\'s data. Try again, or narrow the request.');
  }
}
function briefingArgs(q) {
  return args(q, { topic: ['topic', 'string'], position: ['position', 'string'], type: ['type', 'string'], q: ['query', 'string'], source: ['source', 'string'], hours: ['hours', 'int'], hard_news: ['hard_news', 'bool'], balance: ['balance', 'bool'], order: ['order', 'string'], limit: ['limit', 'int'] });
}
