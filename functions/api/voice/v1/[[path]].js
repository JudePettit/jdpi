// Vitruvian Manager's voice proxy (Pages Function): a lifelike online voice for the narration, with the key kept here.
//   POST /api/voice/v1/say     { text, voice, lang?, norm?, private? }
//     text   what the voice is to say, one sentence (or part of a long one), at most 1,000 characters, already through
//            the page's normaliser, which norm names: 'prp-speech@1' (the Documentary), 'kino-text@1' (Kino), 'plain@1'.
//            The lexicon (PRPVoice.lexicon: "Ave" is "ah-way") is applied here, as SSML.
//     voice  'azure:en-GB-RyanNeural' (or without the prefix): one of GET /api/voice/v1/voices
//     → 200 audio/mpeg: the sentence, spoken. Headers:
//         X-PRP-Voice-Key       the clip key (PRPVoice.key, worked out here: a page never supplies one)
//         X-PRP-Voice-Cache     hit (from R2, no characters counted) | miss (made now, and stored) | off (no R2) | private
//         X-PRP-Voice-Duration  seconds, counted from the MP3's frames: the sentence's exact length
//         X-PRP-Voice-Timings   JSON Timings over the words of `text` ([start, end, word], seconds): the sentence exact, the
//                               words inside it estimated (source "estimate"), since Azure's REST synthesis sends none
//         X-PRP-Voice-Url       the stored clip, /voice/<provider>/<voice>/<key>.mp3, when R2 holds it
//         X-PRP-Voice-Left      this person's characters left today
//     → 400 | 403 (not this site's page) | 405 | 413 (over 1,000 characters or 8 KB) | 415 (not JSON)
//     → 429 { error: 'quota', reason: 'daily' | 'monthly', retryAfter } or 429 { error: 'rate', retryAfter } (Retry-After)
//     → 503 { error: 'unavailable', reason: 'not configured' }: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set
//     → 503 | 502 { error: 'provider', reason }: Azure busy (its free tier takes 20 requests a minute), refusing the key, down
//     Whatever the failure, the page's reader falls back to the device voice by itself (design/prp-voice.js).
//   GET  /api/voice/v1/voices  → 200 { available, reason?, engine, voices: [{ id, name, label, lang }], left: { today, month }
//                                | null, cache: 'r2' | 'none', quota: 'd1' | 'memory' }, 200 even when not set up, so a
//                                page asking logs no error
// Same origin only; about 90 requests a minute per client on top of the character quota. Settings, bindings and the
// limits' caveats: functions/_lib/voice.js and voice-providers.js. Tests: tests/voice-proxy.test.mjs.
import { V, LIMITS, IMMUTABLE, settings, allowedOrigin, limitRate, who, quotaStore, reserve, usage, mp3Duration, readBody, json, fail, clipResponse } from '../../../_lib/voice.js';
import { PROVIDERS, ProviderError } from '../../../_lib/voice-providers.js';

const PER_MINUTE = 90;

export function onRequest(ctx) { return handle(ctx, { fetch: (...a) => fetch(...a), now: () => Date.now() }); }

/** The route, with its outside world passed in (fetch for the provider, the clock), so the tests can give fakes. */
export async function handle({ request, env = {}, params, waitUntil }, deps) {
  const route = (Array.isArray(params?.path) ? params.path : String(params?.path || '').split('/')).filter(Boolean).join('/');
  try {
    if (route === 'say') return await say(request, env, waitUntil, deps);
    if (route === 'voices') return await voices(request, env, deps);
    return fail(404, 'not_found', 'POST /api/voice/v1/say or GET /api/voice/v1/voices.');
  } catch {
    return fail(500, 'internal', 'The voice proxy failed. The page reads on with this device\'s voice.');
  }
}

async function voices(request, env, deps) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'method_not_allowed', 'Use GET.', { headers: { Allow: 'GET, HEAD' } });
  const wait = await limitRate(request, env, { limit: PER_MINUTE });
  if (wait) return fail(429, 'rate', `Too many requests: about ${PER_MINUTE} a minute. Try again in ${wait} s.`, { retryAfter: wait });
  const provider = PROVIDERS.azure, ok = provider.configured(env), s = settings(env);
  let left = null;
  if (ok) { const u = await usage(quotaStore(env), { who: await who(request, env), now: deps.now() }); left = { today: Math.max(0, s.daily - u.today), month: Math.max(0, s.monthly - u.month) }; }
  const body = {
    available: ok, ...(ok ? {} : { reason: 'not configured' }), engine: provider.id,
    voices: ok ? provider.voices.map(v => ({ id: `${provider.id}:${v.voice}`, name: v.name, label: v.label, lang: v.lang })) : [],
    left, cache: env.VOICE?.get ? 'r2' : 'none', quota: env.VOICE_DB?.prepare ? 'd1' : 'memory',
  };
  return request.method === 'HEAD' ? new Response(null, { status: 200, headers: json(200, body).headers }) : json(200, body);
}

async function say(request, env, waitUntil, deps) {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'POST a JSON body: { text, voice }.', { headers: { Allow: 'POST' } });
  if (!allowedOrigin(request, env)) return fail(403, 'origin', 'Only Vitruvian Manager\'s own pages may use its voice.');
  const provider = PROVIDERS.azure;
  if (!provider.configured(env)) return fail(503, 'unavailable', 'not configured');
  const wait = await limitRate(request, env, { limit: PER_MINUTE });
  if (wait) return fail(429, 'rate', `Too many requests: about ${PER_MINUTE} a minute. Try again in ${wait} s.`, { retryAfter: wait });

  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return fail(415, 'bad_request', 'Send JSON (Content-Type: application/json).');
  if (+request.headers.get('content-length') > LIMITS.body) return fail(413, 'too_large', `At most ${LIMITS.body / 1024} KB.`);
  const raw = await readBody(request, LIMITS.body);
  if (raw == null) return fail(413, 'too_large', `At most ${LIMITS.body / 1024} KB.`);
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, 'bad_request', 'The body is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'bad_request', 'Send an object: { text, voice }.');
  const text = V.canon(typeof body.text === 'string' ? body.text : '');
  if (!text) return fail(400, 'bad_request', 'text is empty.');
  if (text.length > LIMITS.text) return fail(413, 'too_large', `At most ${LIMITS.text} characters a request: send one sentence at a time.`);
  const voice = provider.voice(String(body.voice ?? '').replace(new RegExp(`^${provider.id}:`), ''));
  if (!voice) return fail(400, 'bad_request', 'Unknown voice: GET /api/voice/v1/voices lists them.');
  const norm = body.norm == null ? V.NORM.plain : String(body.norm);
  if (!Object.values(V.NORM).includes(norm)) return fail(400, 'bad_request', `Unknown norm: ${Object.values(V.NORM).join(', ')}.`);
  const priv = body.private === true;

  const engine = provider.engine(), key = await V.key({ engine, voice: voice.voice, text, norm });
  const path = `${provider.id}/${voice.voice}/${key}`, unit = V.unit(text);
  const bucket = !priv && env.VOICE?.get && env.VOICE?.put ? env.VOICE : null;
  const answer = (audio, extra) => clipResponse(audio, { key, engine, ...extra });

  // 1. Made before: from R2, free.
  if (bucket) {
    const hit = await bucket.get(`${path}.mp3`).catch(() => null);
    if (hit) {
      const audio = await hit.arrayBuffer(), duration = +hit.customMetadata?.duration || mp3Duration(audio);
      return answer(audio, { type: hit.httpMetadata?.contentType || provider.type, cache: 'hit', duration, timings: V.estimate(unit, { duration }), url: `/voice/${path}.mp3` });
    }
  }
  // 2. The characters, taken from the person's day and the site's month before Azure is asked (given back if it fails).
  const s = settings(env), q = await reserve(quotaStore(env), { who: await who(request, env), chars: text.length, now: deps.now(), daily: s.daily, monthly: s.monthly });
  if (!q.ok) return fail(429, 'quota', q.reason, { retryAfter: q.retryAfter });
  // 3. Azure.
  let out;
  try { out = await provider.synthesize({ text, voice: voice.voice, lang: voice.lang, lexicon: V.lexicon }, env, deps.fetch); } catch (e) {
    await q.refund();
    const pe = e instanceof ProviderError ? e : new ProviderError('The provider failed');
    return fail(pe.status, 'provider', pe.reason === 'provider' ? pe.message : pe.reason, { retryAfter: pe.retryAfter });
  }
  const duration = mp3Duration(out.audio), timings = out.timings || V.estimate(unit, { duration });
  // 4. Stored once the answer has gone (an R2 write needs the whole clip, which is here): the clip and its WebVTT.
  let url = null;
  if (bucket) {
    url = `/voice/${path}.mp3`;
    const put = Promise.all([
      bucket.put(`${path}.mp3`, out.audio, { httpMetadata: { contentType: out.type, cacheControl: IMMUTABLE }, customMetadata: { duration: String(duration), chars: String(text.length), norm, source: timings.source } }),
      bucket.put(`${path}.vtt`, V.vtt.format(timings, V.tokens(text)), { httpMetadata: { contentType: 'text/vtt; charset=utf-8', cacheControl: IMMUTABLE } }),
    ]).catch(() => { /* the next listener synthesises it again */ });
    if (waitUntil) waitUntil(put); else await put;
  }
  return answer(out.audio, { type: out.type, cache: priv ? 'private' : bucket ? 'miss' : 'off', duration, timings, url, left: q.today });
}
