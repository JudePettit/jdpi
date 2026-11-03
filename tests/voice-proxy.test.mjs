// The voice proxy's Pages Functions: functions/api/voice/v1/[[path]].js (POST say, GET voices) and functions/voice/[[path]].js
// (clips from R2), called in Node with fakes for everything outside: Azure (a fake fetch that answers with real MP3 frames),
// R2 (a Map), D1 (Node's own SQLite, so the real upsert runs) and the clock. Covered: a missing secret, the origin check,
// the request checks, the clip key worked out on the server, the cache, the per-person and monthly quotas (and the
// characters given back when Azure fails), the lexicon in the SSML, serving clips with ranges, and the CPU each request
// takes. No network, no secret, no browser.   node --test tests/voice-proxy.test.mjs
// PRP_CPU_LIMIT_MS raises the time limit of the CPU test on a slower machine (default 40 ms, as in integration-hub.test.mjs).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../design/prp-voice.js';
import { handle } from '../functions/api/voice/v1/[[path]].js';
import { onRequest as clips, parseRange } from '../functions/voice/[[path]].js';
import { mp3Duration, resetVoiceCounts, resetVoiceRates, quotaStore, reserve } from '../functions/_lib/voice.js';

import { AZURE } from '../functions/_lib/voice-providers.js';

const V = globalThis.PRPVoice;
const SITE = 'https://jdpi.pages.dev';
const NOW = Date.UTC(2026, 10, 2, 22, 0, 0); // 22:00 UTC on 2 November 2026: two hours to the next day, 28 days and two to December
const ENGINE = 'azure/neural/audio-24khz-48kbitrate-mono-mp3';
const SECRETS = { AZURE_SPEECH_KEY: 'test-key-not-real', AZURE_SPEECH_REGION: 'uksouth', VOICE_SALT: 'test-salt' };

// MPEG-2 Layer III frames, 24 kHz mono at 48 kbit/s (what Azure sends): 144 bytes and 24 ms each.
const frames = (n, { header = [0xff, 0xf3, 0x64, 0xc0], size = 144 } = {}) => { const b = new Uint8Array(n * size); for (let i = 0; i < n; i++) b.set(header, i * size); return b; };

// Azure, faked: it records each request and answers with `n` frames (or what `answer` returns).
function azure(answer) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, headers: init.headers, body: init.body }); return answer ? answer(calls.length) : new Response(frames(50), { headers: { 'content-type': 'audio/mpeg' } }); };
  return { calls, fetch };
}
// R2, faked (strict about ranges, as R2 is: one that runs past the end throws).
function r2() {
  const objects = new Map(), log = [];
  const view = (key, o, range) => {
    const all = o.data, size = all.byteLength;
    let start = 0, end = size;
    if (range) {
      if (range.suffix != null) start = Math.max(0, size - range.suffix);
      else { start = range.offset; end = range.length != null ? range.offset + range.length : size; }
      if (start >= size || end > size) throw new Error('get: The requested range is not satisfiable (10039)');
    }
    const body = all.slice(start, end);
    return { key, size, range, body, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), text: async () => new TextDecoder().decode(body) };
  };
  return {
    objects, log,
    async get(key, opts) { log.push(['get', key]); const o = objects.get(key); return o ? view(key, o, opts?.range) : null; },
    async head(key) { log.push(['head', key]); const o = objects.get(key); return o ? { key, size: o.data.byteLength, httpMetadata: o.httpMetadata } : null; },
    async put(key, value, opts = {}) { log.push(['put', key]); const data = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value.slice(0)); objects.set(key, { data, httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata }); },
  };
}
// D1, faked on Node's built-in SQLite: the same statements D1 runs.
async function d1() {
  let sqlite; try { sqlite = await import('node:sqlite'); } catch { return null; }
  const db = new sqlite.DatabaseSync(':memory:');
  const statements = [];
  return {
    db, statements,
    prepare(sql) {
      statements.push(sql);
      const st = db.prepare(sql);
      const bound = args => ({ first: async () => st.get(...args) ?? null, run: async () => st.run(...args), all: async () => ({ results: st.all(...args) }) });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
  };
}

async function call(path, { method = 'POST', body, headers = {}, env = {}, ip = '203.0.113.7', fetch = azure().fetch, now = NOW } = {}) {
  const init = { method, headers: { 'content-type': 'application/json', origin: SITE, 'cf-connecting-ip': ip, ...headers } };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const waits = [];
  const res = await handle({ request: new Request(`${SITE}/api/voice/v1/${path}`, init), env, params: { path: path.split('/') }, waitUntil: p => waits.push(p) }, { fetch, now: () => now });
  await Promise.all(waits);
  const type = res.headers.get('content-type') || '';
  const out = { status: res.status, headers: res.headers, type };
  if (type.startsWith('application/json')) out.json = await res.json(); else out.bytes = new Uint8Array(await res.arrayBuffer());
  return out;
}
const say = (body, opts = {}) => call('say', { body, ...opts, env: { ...SECRETS, ...opts.env } });
const SENTENCE = 'Ave, I am Vitruvius, and this is the war of 1939 to 1945.';
const get = (path, { method = 'GET', headers = {}, env } = {}) => clips({ request: new Request(`${SITE}/voice/${path}`, { method, headers }), env, params: { path: path.split('/') } });

beforeEach(() => { resetVoiceRates(); resetVoiceCounts(); });

describe('POST /api/voice/v1/say', () => {
  test('without AZURE_SPEECH_KEY and AZURE_SPEECH_REGION: 503 "not configured", and Azure is never called', async () => {
    const az = azure();
    for (const env of [{}, { AZURE_SPEECH_KEY: 'k' }, { AZURE_SPEECH_REGION: 'uksouth' }, { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'uk south!' }]) {
      const r = await call('say', { body: { text: SENTENCE, voice: 'azure:en-GB-RyanNeural' }, env, fetch: az.fetch });
      assert.equal(r.status, 503, JSON.stringify(env));
      assert.deepEqual(r.json, { error: 'unavailable', reason: 'not configured' });
    }
    assert.equal(az.calls.length, 0);
    const v = await call('voices', { method: 'GET' });
    assert.equal(v.status, 200, 'asking which voices exist is not an error');
    assert.deepEqual(v.json, { available: false, reason: 'not configured', engine: 'azure', voices: [], left: null, cache: 'none', quota: 'memory' });
  });

  test('only this site\'s own pages: another Origin, or none without Sec-Fetch-Site: same-origin, is refused', async () => {
    const body = { text: SENTENCE, voice: 'azure:en-GB-RyanNeural' };
    assert.equal((await say(body, { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await say(body, { headers: { origin: 'https://jdpi.pages.dev.evil.example' } })).status, 403);
    const bare = await handle({ request: new Request(`${SITE}/api/voice/v1/say`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env: SECRETS, params: { path: ['say'] } }, { fetch: azure().fetch, now: () => NOW });
    assert.equal(bare.status, 403, 'no Origin and no Sec-Fetch-Site (curl): refused');
    const fetchSite = await handle({ request: new Request(`${SITE}/api/voice/v1/say`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) }), env: SECRETS, params: { path: ['say'] } }, { fetch: azure().fetch, now: () => NOW });
    assert.equal(fetchSite.status, 200);
    assert.equal((await say(body, { headers: { origin: 'http://localhost:8788' }, env: { VOICE_ORIGINS: 'http://localhost:8788, https://vm.example/' } })).status, 200);
    const ok = await say(body);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), null, 'no CORS: other sites cannot read an answer');
  });

  test('the request is checked: method, JSON, size, text, voice and normaliser', async () => {
    const good = { text: SENTENCE, voice: 'azure:en-GB-RyanNeural' };
    const cases = [
      [{ method: 'GET' }, 405], [{ headers: { 'content-type': 'text/plain' }, body: good }, 415], [{ body: '{not json' }, 400], [{ body: '[1]' }, 400],
      [{ body: { ...good, text: '   ' } }, 400], [{ body: { ...good, text: 42 } }, 400], [{ body: { ...good, text: 'x'.repeat(1001) } }, 413],
      [{ body: JSON.stringify({ ...good, pad: 'x'.repeat(9000) }) }, 413], [{ body: { ...good, voice: 'azure:en-US-JennyNeural' } }, 400],
      [{ body: { ...good, voice: 'Microsoft Ryan Online (Natural)' } }, 400], [{ body: { ...good, norm: 'mine@9' } }, 400],
    ];
    for (const [opts, status] of cases) {
      const r = await call('say', { body: opts.body ?? good, method: opts.method, headers: opts.headers, env: SECRETS });
      assert.equal(r.status, status, JSON.stringify(opts).slice(0, 120));
      assert.ok(r.json?.error, 'a JSON error the reader can read');
    }
    assert.equal((await call('nope', { env: SECRETS, body: good })).status, 404);
    assert.equal((await say({ ...good, text: 'x'.repeat(1000) })).status, 200, '1,000 characters is allowed');
    assert.equal((await say({ ...good, voice: 'en-GB-SoniaNeural' })).status, 200, 'the prefix is optional');
  });

  test('Azure is asked for one sentence as SSML, with the key, region, format and the lexicon; the clip comes back with its timing', async () => {
    const az = azure();
    const r = await say({ text: `  ${SENTENCE}  `, voice: 'azure:en-GB-RyanNeural', norm: 'kino-text@1', lang: 'en-GB' }, { fetch: az.fetch });
    assert.equal(r.status, 200);
    assert.equal(az.calls.length, 1);
    const [c] = az.calls;
    assert.equal(c.url, 'https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.equal(c.headers['Ocp-Apim-Subscription-Key'], 'test-key-not-real');
    assert.equal(c.headers['X-Microsoft-OutputFormat'], 'audio-24khz-48kbitrate-mono-mp3');
    assert.equal(c.headers['Content-Type'], 'application/ssml+xml');
    assert.equal(c.body, '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="en-GB-RyanNeural"><sub alias="ah-way">Ave</sub>, I am Vitruvius, and this is the war of 1939 to 1945.</voice></speak>');
    assert.equal(r.type, 'audio/mpeg');
    assert.equal(r.bytes.length, 50 * 144);
    const h = n => r.headers.get(`x-prp-voice-${n}`);
    // The key is worked out here, from the text as it will be said (white space collapsed), never taken from the page.
    assert.equal(h('key'), await V.key({ engine: ENGINE, voice: 'en-GB-RyanNeural', text: SENTENCE, norm: 'kino-text@1' }));
    assert.equal(h('engine'), ENGINE);
    assert.equal(h('cache'), 'off', 'no R2 bound: nothing stored');
    assert.equal(h('duration'), '1.2', '50 frames of 24 ms');
    const t = JSON.parse(h('timings'));
    assert.equal(t.source, 'estimate');
    assert.deepEqual(t.sentences, [[0, 1.2]], 'the sentence is timed exactly by the clip');
    assert.equal(t.words.length, V.tokens(SENTENCE).length);
    assert.deepEqual(t.words.map(w => w[2]), V.tokens(SENTENCE).map((_, i) => i));
    assert.equal(h('left'), String(30000 - SENTENCE.length));
    assert.equal(r.headers.get('cache-control'), 'no-store');
    // Escaping: nothing a page sends can become SSML markup.
    const esc = azure();
    await say({ text: 'He wrote <voice name="x"> & "left".', voice: 'azure:en-GB-RyanNeural' }, { fetch: esc.fetch });
    assert.match(esc.calls[0].body, /He wrote &lt;voice name=&quot;x&quot;&gt; &amp; &quot;left&quot;\./);
  });

  test('with R2 bound as VOICE: made once, then served from the cache without Azure and without counting', async () => {
    const bucket = r2(), az = azure(), env = { VOICE: bucket };
    const body = { text: SENTENCE, voice: 'azure:en-GB-ThomasNeural', norm: 'prp-speech@1' };
    const first = await say(body, { env, fetch: az.fetch });
    const key = first.headers.get('x-prp-voice-key');
    assert.equal(first.headers.get('x-prp-voice-cache'), 'miss');
    assert.equal(first.headers.get('x-prp-voice-url'), `/voice/azure/en-GB-ThomasNeural/${key}.mp3`);
    assert.deepEqual([...bucket.objects.keys()].sort(), [`azure/en-GB-ThomasNeural/${key}.mp3`, `azure/en-GB-ThomasNeural/${key}.vtt`]);
    const stored = bucket.objects.get(`azure/en-GB-ThomasNeural/${key}.mp3`);
    assert.deepEqual(stored.httpMetadata, { contentType: 'audio/mpeg', cacheControl: 'public, max-age=31536000, immutable' });
    assert.deepEqual(stored.customMetadata, { duration: '1.2', chars: String(SENTENCE.length), norm: 'prp-speech@1', source: 'estimate' });
    const vtt = V.vtt.parse(new TextDecoder().decode(bucket.objects.get(`azure/en-GB-ThomasNeural/${key}.vtt`).data));
    assert.deepEqual(vtt.tokens, V.tokens(SENTENCE));
    assert.deepEqual(vtt.sentences, [[0, 1.2]]);

    const second = await say(body, { env, fetch: az.fetch });
    assert.equal(second.headers.get('x-prp-voice-cache'), 'hit');
    assert.equal(second.headers.get('x-prp-voice-key'), key);
    assert.deepEqual(second.bytes, first.bytes);
    assert.equal(az.calls.length, 1, 'Azure asked once');
    const v = await call('voices', { method: 'GET', env: { ...SECRETS, ...env } });
    assert.equal(v.json.left.today, 30000 - SENTENCE.length, 'the hit cost nothing');
    assert.equal(v.json.cache, 'r2');
    // Another voice, normaliser or text is another clip.
    await say({ ...body, norm: 'kino-text@1' }, { env, fetch: az.fetch });
    assert.equal(az.calls.length, 2);
    // Private passages never touch the cache.
    const before = bucket.log.length, p1 = await say({ ...body, private: true }, { env, fetch: az.fetch });
    await say({ ...body, private: true }, { env, fetch: az.fetch });
    assert.equal(p1.headers.get('x-prp-voice-cache'), 'private');
    assert.equal(p1.headers.get('x-prp-voice-url'), null);
    assert.equal(bucket.log.length, before, 'no R2 read or write');
    assert.equal(az.calls.length, 4);
  });

  test('quota: each person\'s day and the site\'s month, with the time to wait; characters come back when Azure fails', async () => {
    const env = { VOICE_DAILY_CHARS: '120', VOICE_MONTHLY_CHARS: '200' }, text = 'x'.repeat(60), body = { text, voice: 'azure:en-GB-RyanNeural' };
    assert.equal((await say(body, { env, ip: '198.51.100.1' })).status, 200);
    assert.equal((await say({ ...body, text: 'y'.repeat(60) }, { env, ip: '198.51.100.1' })).status, 200);
    const day = await say({ ...body, text: 'z'.repeat(60) }, { env, ip: '198.51.100.1' });
    assert.equal(day.status, 429);
    assert.deepEqual(day.json, { error: 'quota', reason: 'daily', retryAfter: 7200 });
    assert.equal(day.headers.get('retry-after'), '7200');
    assert.equal((await say({ ...body, text: 'w'.repeat(60) }, { env, ip: '198.51.100.2' })).status, 200, 'another person still may');
    const month = await say({ ...body, text: 'v'.repeat(60) }, { env, ip: '198.51.100.3' });
    assert.equal(month.status, 429);
    assert.deepEqual(month.json, { error: 'quota', reason: 'monthly', retryAfter: 28 * 86400 + 7200 });
    // The next day the person may again (the month still counts).
    const tomorrow = NOW + 7200 * 1000 + 1;
    assert.equal((await say({ ...body, text: 'u'.repeat(20) }, { env, ip: '198.51.100.1', now: tomorrow })).status, 200);
    // A failure gives the characters back.
    resetVoiceCounts();
    const down = azure(() => new Response('oops', { status: 500 }));
    const fail = await say(body, { env, ip: '198.51.100.9', fetch: down.fetch });
    assert.equal(fail.status, 502); assert.equal(fail.json.error, 'provider');
    for (let i = 0; i < 2; i++) assert.equal((await say({ ...body, text: `${i}`.repeat(60) }, { env, ip: '198.51.100.9' })).status, 200, 'the failed 60 were given back');
    // Larger than the whole day: refused before Azure is asked.
    assert.equal((await say({ ...body, text: 'q'.repeat(121) }, { env: { VOICE_DAILY_CHARS: '120' } })).json.reason, 'daily');
  });

  test('Azure busy, refusing the key, or unreachable: 503 or 502 with a reason, and nothing counted', async () => {
    const env = { VOICE_DAILY_CHARS: '100' }, body = { text: 'x'.repeat(100), voice: 'azure:en-GB-RyanNeural' };
    const busy = await say(body, { env, fetch: azure(() => new Response('', { status: 429, headers: { 'Retry-After': '12' } })).fetch });
    assert.equal(busy.status, 503); assert.deepEqual(busy.json, { error: 'provider', reason: 'busy', retryAfter: 12 }); assert.equal(busy.headers.get('retry-after'), '12');
    const refused = await say(body, { env, fetch: azure(() => new Response('', { status: 401 })).fetch });
    assert.equal(refused.status, 503); assert.equal(refused.json.reason, 'refused');
    const gone = await say(body, { env, fetch: () => Promise.reject(new TypeError('fetch failed')) });
    assert.equal(gone.status, 503); assert.match(gone.json.reason, /did not answer/);
    const empty = await say(body, { env, fetch: azure(() => new Response(new Uint8Array(0))).fetch });
    assert.equal(empty.status, 502);
    assert.equal((await say(body, { env })).status, 200, 'all 100 characters still there');
  });

  test('about 90 requests a minute per client, then 429 "rate"', async () => {
    const body = { text: 'Hello.', voice: 'azure:en-GB-RyanNeural' };
    for (let i = 0; i < 90; i++) assert.equal((await say(body, { ip: '192.0.2.50' })).status, 200);
    const r = await say(body, { ip: '192.0.2.50' });
    assert.equal(r.status, 429); assert.equal(r.json.error, 'rate'); assert.ok(r.json.retryAfter > 0);
  });

  test('D1 bound as VOICE_DB: one count for every copy of the function, made with an atomic upsert', async t => {
    const db = await d1();
    if (!db) { t.skip('node:sqlite is not available in this Node'); return; }
    const env = { VOICE_DB: db, VOICE_DAILY_CHARS: '100' }, body = { text: 'x'.repeat(60), voice: 'azure:en-GB-RyanNeural' };
    assert.equal((await say(body, { env })).status, 200);
    resetVoiceCounts(); // the memory store is not used: forgetting it changes nothing
    const again = await say(body, { env: { ...env } }); // another copy of the function, the same database
    assert.equal(again.status, 429); assert.equal(again.json.reason, 'daily');
    assert.ok(db.statements.some(s => /^CREATE TABLE IF NOT EXISTS voice_usage/.test(s)));
    assert.deepEqual(db.db.prepare('SELECT period, chars FROM voice_usage ORDER BY period').all().map(r => ({ ...r })), [{ period: 'd:2026-11-02', chars: 60 }, { period: 'm:2026-11', chars: 60 }]);
    assert.equal(db.db.prepare('SELECT who FROM voice_usage WHERE period = ?').get('d:2026-11-02').who.length, 32, 'a hash, not the address');
    const v = await call('voices', { method: 'GET', env: { ...SECRETS, ...env } });
    assert.equal(v.json.quota, 'd1'); assert.deepEqual(v.json.left, { today: 40, month: 450000 - 60 });
    // Two requests at once cannot both pass the limit.
    const store = quotaStore(env);
    const both = await Promise.all([reserve(store, { who: 'p', chars: 70, now: NOW, daily: 100, monthly: 1000 }), reserve(store, { who: 'p', chars: 70, now: NOW, daily: 100, monthly: 1000 })]);
    assert.deepEqual(both.map(r => r.ok).sort(), [false, true]);
  });

  test('GET /api/voice/v1/voices: the voices, labelled, and what is left', async () => {
    const v = await call('voices', { method: 'GET', env: SECRETS });
    assert.equal(v.status, 200);
    assert.equal(v.json.available, true);
    assert.deepEqual(v.json.voices.map(x => x.id), AZURE.voices.map(x => `azure:${x.voice}`));
    assert.deepEqual(v.json.voices[0], { id: 'azure:en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' });
    assert.deepEqual(v.json.left, { today: 30000, month: 450000 });
    for (const id of v.json.voices.map(x => x.id)) assert.equal(V.isOnline(id), true, `${id} is an online id to the pages`);
    assert.equal((await call('voices', { method: 'POST', env: SECRETS })).status, 405);
  });

  test('CPU: a request served from the cache, and one made by Azure, take a few milliseconds of work', async () => {
    const limit = Number(process.env.PRP_CPU_LIMIT_MS) || 40, env = { VOICE: r2() };
    const long = 'A long sentence about the war, '.repeat(31).trim() + '.'; // about 990 characters
    for (const [name, text] of [['miss', long], ['hit', long]]) {
      const times = [];
      for (let i = 0; i < 3; i++) {
        resetVoiceRates();
        const t0 = performance.now();
        const r = await say({ text: name === 'miss' ? `${text} ${i}` : text, voice: 'azure:en-GB-RyanNeural' }, { env });
        times.push(performance.now() - t0);
        assert.equal(r.status, 200);
      }
      assert.ok(Math.min(...times) < limit, `${name}: ${Math.min(...times).toFixed(1)} ms (limit ${limit} ms)`);
    }
  });
});

describe('GET /voice/<provider>/<voice>/<key>.mp3 | .vtt', () => {
  const KEY = 'a'.repeat(64), PATH = `azure/en-GB-RyanNeural/${KEY}`;
  async function stored() {
    const bucket = r2();
    await bucket.put(`${PATH}.mp3`, frames(50), { httpMetadata: { contentType: 'audio/mpeg' } });
    await bucket.put(`${PATH}.vtt`, 'WEBVTT\n\n0\n00:00:00.000 --> 00:00:01.200\n<00:00:00.000>Hello\n', { httpMetadata: { contentType: 'text/vtt; charset=utf-8' } });
    return { VOICE: bucket };
  }
  test('a clip, cached for a year by its key; HEAD; If-None-Match', async () => {
    const env = await stored();
    const r = await get(`${PATH}.mp3`, { env });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'audio/mpeg');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(r.headers.get('etag'), `"${KEY}"`);
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    assert.equal(r.headers.get('content-length'), '7200');
    assert.equal(mp3Duration(new Uint8Array(await r.arrayBuffer())), 1.2);
    const h = await get(`${PATH}.mp3`, { env, method: 'HEAD' });
    assert.equal(h.status, 200); assert.equal(h.headers.get('content-length'), '7200'); assert.equal(await h.text(), '');
    assert.equal((await get(`${PATH}.mp3`, { env, headers: { 'If-None-Match': `W/"${KEY}"` } })).status, 304);
    const v = await get(`${PATH}.vtt`, { env });
    assert.equal(v.headers.get('content-type'), 'text/vtt; charset=utf-8');
    assert.deepEqual(V.vtt.parse(await v.text()).tokens, ['Hello']);
  });

  test('ranges: 206 with Content-Range, clamped at the end, 416 past it', async () => {
    const env = await stored();
    const part = async (range, status, cr, len) => {
      const r = await get(`${PATH}.mp3`, { env, headers: { Range: range } });
      assert.equal(r.status, status, range);
      assert.equal(r.headers.get('content-range'), cr, range);
      if (len != null) assert.equal((await r.arrayBuffer()).byteLength, len, range);
    };
    await part('bytes=0-99', 206, 'bytes 0-99/7200', 100);
    await part('bytes=7100-', 206, 'bytes 7100-7199/7200', 100);
    await part('bytes=-144', 206, 'bytes 7056-7199/7200', 144);
    await part('bytes=7000-99999', 206, 'bytes 7000-7199/7200', 200);
    await part('bytes=9999-', 416, 'bytes */7200');
    await part('bytes=0-10, 20-30', 200, null, 7200); // several ranges: the whole clip
    assert.deepEqual([parseRange('bytes=5-1'), parseRange('items=0-1'), parseRange('bytes=-0'), parseRange('bytes=3-')], [null, null, null, { offset: 3 }]);
  });

  test('404 without a bucket, for a clip not there, or a name that is not a clip\'s; 405 for other methods', async () => {
    const env = await stored();
    assert.equal((await get(`${PATH}.mp3`, { env: {} })).status, 404);
    for (const p of [`azure/en-GB-RyanNeural/${'b'.repeat(64)}.mp3`, `azure/en-GB-RyanNeural/${KEY}.wav`, `azure/en-GB-RyanNeural/${KEY.slice(1)}.mp3`, `azure/en-US-JennyNeural/${KEY}.mp3`,
      `elevenlabs/x/${KEY}.mp3`, `azure/en-GB-RyanNeural/${KEY}.mp3/extra`, `azure/../${KEY}.mp3`, `constructor/x/${KEY}.mp3`]) assert.equal((await get(p, { env })).status, 404, p);
    assert.equal((await get(`${PATH}.mp3`, { env, method: 'DELETE' })).status, 405);
  });
});

test('MP3 length, frame by frame: MPEG 2 and 1 Layer III, an ID3 tag skipped, anything else 0', () => {
  assert.equal(mp3Duration(frames(50)), 1.2);
  assert.equal(mp3Duration(frames(1000).buffer), 24);
  // MPEG-1 Layer III, 44.1 kHz, 128 kbit/s: 417 or 418 bytes (padding) and 1152 samples a frame.
  const f1 = frames(10, { header: [0xff, 0xfb, 0x90, 0x40], size: 417 });
  assert.equal(mp3Duration(f1), Math.round((10 * 1152 / 44100) * 1000) / 1000);
  const id3 = new Uint8Array(10 + 300 + 7200); id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 2, 44]); id3.fill(0xff, 10, 310); id3.set(frames(50), 310);
  assert.equal(mp3Duration(id3), 1.2, 'the tag\'s bytes (even 0xFF ones) are not frames');
  assert.equal(mp3Duration(V.silentWav(1)), 0);
  assert.equal(mp3Duration(new Uint8Array(0)), 0);
});
