// Vitruvian Manager's voice clips (Pages Function): GET or HEAD /voice/<provider>/<voice>/<key>.mp3 | .vtt from the R2
// bucket bound as VOICE. The voice proxy (functions/api/voice/v1/[[path]].js) writes them, and the pre-render pipeline
// will. A clip's name is its content's key (PRPVoice.key), so a clip never changes: cached for a year (immutable), ETag the
// key (304 to If-None-Match), Range requests answered 206 so audio can seek. 404 when no bucket is bound or the clip is not
// there; 416 for a range past its end. Same-origin use only, so no CORS headers. Tests: tests/voice-proxy.test.mjs.
import { PROVIDERS } from '../_lib/voice-providers.js';
import { IMMUTABLE, SAFE } from '../_lib/voice.js';

const TYPES = { mp3: 'audio/mpeg', vtt: 'text/vtt; charset=utf-8' };
const say = (status, message, headers = {}) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...SAFE, ...headers } });

// One range of a Range header: { offset, length } | { offset } | { suffix }; null for none, several, or one not understood
// (the whole clip is sent instead, as HTTP allows).
export function parseRange(h) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return +m[2] > 0 ? { suffix: +m[2] } : null;
  const from = +m[1];
  if (m[2] === '') return { offset: from };
  const to = +m[2];
  return to >= from ? { offset: from, length: to - from + 1 } : null;
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return say(405, 'Use GET.', { Allow: 'GET, HEAD' });
  const seg = (Array.isArray(params?.path) ? params.path : String(params?.path || '').split('/')).filter(Boolean);
  const [provider, voice, file, ...rest] = seg, m = /^([0-9a-f]{64})\.(mp3|vtt)$/.exec(file || '');
  if (rest.length || !m || !Object.hasOwn(PROVIDERS, provider) || !PROVIDERS[provider].voice(voice)) return say(404, 'No such clip.'); // own keys only: "constructor" is not a provider
  if (!env?.VOICE?.get) return say(404, 'No clip store is set up (an R2 bucket bound as VOICE).');
  const etag = `"${m[1]}"`, path = `${provider}/${voice}/${file}`;
  const base = { 'Content-Type': TYPES[m[2]], 'Cache-Control': IMMUTABLE, ETag: etag, 'Accept-Ranges': 'bytes', ...SAFE };
  if ((request.headers.get('If-None-Match') || '').split(',').some(t => t.trim().replace(/^W\//, '') === etag)) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': IMMUTABLE } });

  if (request.method === 'HEAD') {
    const head = await env.VOICE.head(path);
    return head ? new Response(null, { status: 200, headers: { ...base, 'Content-Length': String(head.size) } }) : say(404, 'No such clip.');
  }
  let range = parseRange(request.headers.get('Range')), obj;
  try { obj = await env.VOICE.get(path, range ? { range } : undefined); } catch (e) {
    if (!range) throw e;
    // R2 refuses a range that runs past the end: clamp it to the clip's size (HTTP's rule), or 416 if it starts past it.
    const head = await env.VOICE.head(path);
    if (!head) return say(404, 'No such clip.');
    const start = range.suffix != null ? Math.max(0, head.size - range.suffix) : range.offset;
    if (start >= head.size) return say(416, 'That range is not in the clip.', { 'Content-Range': `bytes */${head.size}` });
    range = { offset: start, length: head.size - start };
    obj = await env.VOICE.get(path, { range });
  }
  if (!obj) return say(404, 'No such clip.');
  if (!range) return new Response(obj.body, { status: 200, headers: { ...base, 'Content-Length': String(obj.size) } });
  const size = obj.size;
  const start = range.suffix != null ? Math.max(0, size - range.suffix) : range.offset;
  const end = range.suffix != null || range.length == null ? size - 1 : Math.min(size - 1, range.offset + range.length - 1);
  if (start >= size) return say(416, 'That range is not in the clip.', { 'Content-Range': `bytes */${size}` });
  return new Response(obj.body, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
}
