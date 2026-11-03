// Vitruvian Manager's voice proxy: helpers shared by functions/api/voice/v1/[[path]].js (synthesis, quota) and
// functions/voice/[[path]].js (clips from R2). No route lives here. The clip key, the lexicon, the word-timing estimate and
// WebVTT come from design/prp-voice.js, imported here for its side effect (globalThis.PRPVoice), so the pages and the
// proxy share one definition of each.
//
// The first Pages Function with a paid key and the first that needs a quota. What it guards:
// - Origin. Only the site's own pages may ask for speech: the Origin header must be this deployment's own origin (or one
//   listed in VOICE_ORIGINS), or, with no Origin, Sec-Fetch-Site must say same-origin. No CORS headers are sent, so other
//   sites' scripts cannot read an answer either.
// - Quota. Characters synthesised per person per UTC day (VOICE_DAILY_CHARS, default 30,000: about 35 minutes of
//   listening) and for the whole site per UTC month (VOICE_MONTHLY_CHARS, default 450,000, below the 500,000 a month Azure's
//   free tier gives). Cache hits cost nothing. A "person" is a salted SHA-256 of their IP address (VOICE_SALT); the address
//   itself is never kept. Without VOICE_SALT each isolate draws a random salt, so a person's count starts again in each
//   copy of the function: set VOICE_SALT once D1 is bound.
//   The counts live in D1 when a database is bound as VOICE_DB (one table, voice_usage, created on first use; each count
//   an atomic upsert that refuses to pass its limit). Without D1 they live in this isolate's memory, and that is a real
//   limitation: Cloudflare runs many isolates and recycles them, each counting on its own from zero, so both limits are
//   approximate and the only hard cap is Azure's own on the free tier. Bind D1 before choosing a paid tier. KV is not used:
//   its free plan allows 1,000 writes a day and one write a second to a key, too few for counters.
// - Cache. Clips by their key (PRPVoice.key, worked out here, never taken from a page) in R2 when a bucket is bound as
//   VOICE: <provider>/<voice>/<key>.mp3 and a .vtt beside it, written once and never changed, served by
//   functions/voice/[[path]].js. Without the bucket nothing is stored and every sentence is synthesised. Private passages
//   (Personal Genius, Auteur) are never read from or written to it.
// Requests per client are also limited (limitRate below: about 90 a minute; global with a PRP_RATE_LIMITER binding).
// Self-contained, like the aircraft proxy: nothing here loads the MCP server's module, so a fault there cannot stop the voice.
import '../../design/prp-voice.js';

export const V = globalThis.PRPVoice;
export const LIMITS = { text: 1000, body: 8 * 1024 };
export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const SAFE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };

export function settings(env) {
  const int = (v, d) => { const n = Math.floor(Number(v)); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
  return {
    daily: int(env?.VOICE_DAILY_CHARS, 30000),
    monthly: int(env?.VOICE_MONTHLY_CHARS, 450000),
    origins: String(env?.VOICE_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean),
  };
}

/** True when the request comes from this site's own pages (see above). */
export function allowedOrigin(request, env) {
  const self = new URL(request.url).origin, origin = request.headers.get('Origin');
  if (origin) return origin === self || settings(env).origins.includes(origin);
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

/**
 * Requests per client IP and minute: with a Workers rate-limiting binding named PRP_RATE_LIMITER the count is global (as for
 * the MCP server and the API, functions/_lib/prp-http.js); without one it is kept per isolate, which still stops a runaway
 * loop. Returns null when the request may go ahead, else the seconds to wait.
 */
const hits = new Map();
export async function limitRate(request, env, { limit = 90, windowMs = 60_000, scope = 'voice' } = {}) {
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
export const resetVoiceRates = () => hits.clear(); // for the tests

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
let isolateSalt = '';
// An IPv6 client is one /64 (its first four groups): one home or phone gets a whole /64, so counting each address would
// let one person rotate through millions.
const person = ip => { if (!ip.includes(':')) return ip; const [a, b = ''] = ip.split('::'); const h = a ? a.split(':') : [], t = b ? b.split(':') : []; return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t].slice(0, 4).join(':') + '::/64'; };
/** The person a request counts against: a salted hash of the client's IP address. */
export async function who(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const salt = String(env?.VOICE_SALT || '') || (isolateSalt ||= hex(crypto.getRandomValues(new Uint8Array(16))));
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${person(ip)}`))).slice(0, 32);
}

/* ---------- quota stores: add(period, who, chars, limit) → new total, or null when it would pass the limit ---------- */
const counts = new Map(); // this isolate's: `${period}|${who}` → characters
const MEMORY = {
  kind: 'memory',
  async add(period, who, chars, limit) {
    const k = `${period}|${who}`, now = (counts.get(k) || 0) + chars;
    if (now > limit) return null;
    counts.set(k, now);
    return now;
  },
  async sub(period, who, chars) { const k = `${period}|${who}`; counts.set(k, Math.max(0, (counts.get(k) || 0) - chars)); },
  async get(period, who) { return counts.get(`${period}|${who}`) || 0; },
  // Counts from earlier days and months are no longer needed.
  prune(day, month) { if (counts.size > 5000) for (const k of counts.keys()) if (!k.startsWith(`${day}|`) && !k.startsWith(`${month}|`)) counts.delete(k); },
};
export const resetVoiceCounts = () => counts.clear(); // for the tests
const D1 = new WeakMap();
function d1Store(db) {
  let ready = null;
  const init = () => (ready ||= db.prepare('CREATE TABLE IF NOT EXISTS voice_usage (period TEXT NOT NULL, who TEXT NOT NULL, chars INTEGER NOT NULL, PRIMARY KEY (period, who))').run()
    .catch(e => { ready = null; throw e; }));
  return {
    kind: 'd1',
    // One statement: insert the count, or add to it only while the total stays within the limit (RETURNING gives no row
    // when it would not), so two copies of the function cannot both pass the limit.
    async add(period, who, chars, limit) {
      await init();
      const row = await db.prepare('INSERT INTO voice_usage (period, who, chars) VALUES (?1, ?2, ?3) ON CONFLICT (period, who) DO UPDATE SET chars = voice_usage.chars + excluded.chars WHERE voice_usage.chars + excluded.chars <= ?4 RETURNING chars')
        .bind(period, who, chars, limit).first();
      return row ? row.chars : null;
    },
    async sub(period, who, chars) { await init(); await db.prepare('UPDATE voice_usage SET chars = MAX(0, chars - ?3) WHERE period = ?1 AND who = ?2').bind(period, who, chars).run(); },
    async get(period, who) { await init(); const row = await db.prepare('SELECT chars FROM voice_usage WHERE period = ?1 AND who = ?2').bind(period, who).first(); return row ? row.chars : 0; },
  };
}
/** D1 when VOICE_DB is bound, else this isolate's memory. */
export function quotaStore(env) {
  const db = env?.VOICE_DB;
  if (!db?.prepare) return MEMORY;
  if (!D1.has(db)) D1.set(db, d1Store(db));
  return D1.get(db);
}

const periods = now => { const iso = new Date(now).toISOString(); return { day: `d:${iso.slice(0, 10)}`, month: `m:${iso.slice(0, 7)}` }; };
const untilTomorrow = now => { const d = new Date(now); return Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000); };
const untilNextMonth = now => { const d = new Date(now); return Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - now) / 1000); };
/**
 * Takes `chars` from the person's day and the site's month, or neither.
 * → { ok: true, today, month, refund() }   today / month: characters left after this request
 * → { ok: false, reason: 'daily' | 'monthly', retryAfter }   seconds until the day or month turns (UTC)
 */
export async function reserve(store, { who, chars, now, daily, monthly }) {
  const { day, month } = periods(now);
  store.prune?.(day, month);
  // A first count is inserted whole (the limit is checked on adding to one), so a request larger than a limit stops here.
  if (chars > daily) return { ok: false, reason: 'daily', retryAfter: untilTomorrow(now) };
  if (chars > monthly) return { ok: false, reason: 'monthly', retryAfter: untilNextMonth(now) };
  const d = await store.add(day, who, chars, daily);
  if (d == null) return { ok: false, reason: 'daily', retryAfter: untilTomorrow(now) };
  const m = await store.add(month, '*', chars, monthly);
  if (m == null) { await store.sub(day, who, chars); return { ok: false, reason: 'monthly', retryAfter: untilNextMonth(now) }; }
  return { ok: true, today: daily - d, month: monthly - m, refund: () => Promise.all([store.sub(day, who, chars), store.sub(month, '*', chars)]).catch(() => {}) };
}
/** The person's characters used today and the site's this month. */
export async function usage(store, { who, now }) {
  const { day, month } = periods(now);
  return { today: await store.get(day, who), month: await store.get(month, '*') };
}

/* ---------- MP3 ---------- */
// Seconds of audio in an MP3, counted frame by frame (MPEG 1, 2 and 2.5 Layer III; an ID3v2 tag skipped); 0 if it is not
// MP3. Exact for Azure's constant-bitrate clips, and the length the pages time a sentence by.
const KBPS = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const HZ = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
export function mp3Duration(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  let i = 0, samples = 0, rate = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) { i++; continue; } // not a Layer III frame header
    const hz = HZ[ver][sr], len = Math.floor(((ver === 3 ? 144 : 72) * KBPS[ver === 3 ? 1 : 2][br] * 1000) / hz) + pad;
    samples += ver === 3 ? 1152 : 576; rate = hz; i += len;
  }
  return rate ? Math.round((samples / rate) * 1000) / 1000 : 0;
}

/* ---------- requests and answers ---------- */
/** The body as text, or null past `max` bytes (counted as it arrives). */
export async function readBody(request, max) {
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
export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SAFE, ...headers } });
/** An error the pages' reader understands: { error, reason, retryAfter? } (JSON), with Retry-After when it applies. */
export function fail(status, error, reason, { retryAfter, headers = {} } = {}) {
  return json(status, { error, reason, ...(retryAfter ? { retryAfter } : {}) }, { ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}), ...headers });
}
const ms = v => Math.round(v * 1000) / 1000;
/** A clip and what the pages need to time it (see functions/api/voice/v1/[[path]].js). */
export function clipResponse(audio, { type = 'audio/mpeg', key, engine, cache, duration, timings, url, left }) {
  const t = { duration: ms(timings.duration), words: timings.words.map(([s, e, j]) => [ms(s), ms(e), j]), sentences: timings.sentences.map(([s, e]) => [ms(s), ms(e)]), source: timings.source };
  return new Response(audio, { status: 200, headers: {
    'Content-Type': type, 'Content-Length': String(audio.byteLength), 'Cache-Control': 'no-store', ...SAFE,
    'X-PRP-Voice-Key': key, 'X-PRP-Voice-Engine': engine, 'X-PRP-Voice-Cache': cache, 'X-PRP-Voice-Duration': String(ms(duration)),
    'X-PRP-Voice-Timings': JSON.stringify(t), ...(url ? { 'X-PRP-Voice-Url': url } : {}), ...(left != null ? { 'X-PRP-Voice-Left': String(left) } : {}),
  } });
}
