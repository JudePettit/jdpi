// Speech providers for Vitruvian Manager's voice proxy (functions/api/voice/v1/[[path]].js). No route lives here.
// A provider: { id, model, format, type, voices, configured(env), engine(), ssml(), synthesize() }. One today: Azure Speech.
//
// Azure Speech, REST synthesis (https://<region>.tts.speech.microsoft.com/cognitiveservices/v1): SSML in, audio out, one
// request per sentence. The REST route returns audio only: Azure's word-boundary events come over the Speech SDK's
// WebSocket, which a Pages Function cannot hold open for a whole reading. So the proxy is asked for one sentence at a time
// (the pages do that anyway, to start speaking sooner): the clip's own length times the sentence exactly, and the words
// inside it are estimated (PRPVoice.estimate, Kino's rule), marked source "estimate". A provider that sends real word
// timings later fills `timings` and the pages use them as they are.
//
// Settings (Cloudflare dashboard → Workers & Pages → jdpi → Settings → Variables and Secrets):
//   AZURE_SPEECH_KEY     secret: key 1 (or 2) of the Speech resource (Azure portal → the resource → Keys and Endpoint)
//   AZURE_SPEECH_REGION  plain text: the resource's region, e.g. uksouth
// Without both, the proxy answers 503 { reason: 'not configured' } and the pages keep the device voice.
// The free tier (F0) gives 500,000 characters of neural voice a month and 20 requests a minute; the proxy's monthly
// budget (VOICE_MONTHLY_CHARS, functions/_lib/voice.js) stays below it.

export class ProviderError extends Error {
  constructor(message, { status = 502, retryAfter = 0, reason = 'provider' } = {}) { super(message); this.status = status; this.retryAfter = retryAfter; this.reason = reason; }
}

// British neural voices, the same family as Edge's free "Online (Natural)" voices the device list prefers.
const AZURE_VOICES = [
  { voice: 'en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' },
  { voice: 'en-GB-ThomasNeural', name: 'Thomas', label: 'Thomas, British English', lang: 'en-GB' },
  { voice: 'en-GB-OliverNeural', name: 'Oliver', label: 'Oliver, British English', lang: 'en-GB' },
  { voice: 'en-GB-SoniaNeural', name: 'Sonia', label: 'Sonia, British English', lang: 'en-GB' },
  { voice: 'en-GB-LibbyNeural', name: 'Libby', label: 'Libby, British English', lang: 'en-GB' },
];
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const AZURE = {
  id: 'azure',
  model: 'neural',
  // 24 kHz mono MP3 at a constant 48 kbit/s (6 kB a second): what the pre-render plan stores, and plenty for one voice.
  format: 'audio-24khz-48kbitrate-mono-mp3',
  type: 'audio/mpeg',
  voices: AZURE_VOICES,
  region: env => String(env?.AZURE_SPEECH_REGION || '').trim().toLowerCase(),
  configured(env) { return !!String(env?.AZURE_SPEECH_KEY || '').trim() && /^[a-z0-9]{3,30}$/.test(this.region(env)); },
  // The clip key's engine part: the engine, model and audio format, so a change of either makes new clips.
  engine() { return `${this.id}/${this.model}/${this.format}`; },
  voice: id => AZURE_VOICES.find(v => v.voice === id) || null,
  // The text is already what the voice is to say (the page's normaliser has run); `lexicon` is PRPVoice.lexicon, whose
  // ssml() escapes it and wraps each lexicon word ("Ave") in <sub alias>.
  ssml(text, voice, lang, lexicon) {
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xml(lang)}"><voice name="${xml(voice)}">${lexicon.ssml(text)}</voice></speak>`;
  },
  async synthesize({ text, voice, lang, lexicon }, env, fetch) {
    const url = `https://${this.region(env)}.tts.speech.microsoft.com/cognitiveservices/v1`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': String(env.AZURE_SPEECH_KEY).trim(), 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': this.format, 'User-Agent': 'vitruvian-manager-voice' },
        body: this.ssml(text, voice, lang, lexicon),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new ProviderError(`Azure did not answer (${e?.name === 'TimeoutError' ? 'timed out' : 'network'})`, { status: 503 });
    }
    if (!res.ok) {
      const retryAfter = Math.max(0, Math.min(3600, Math.ceil(+res.headers.get('Retry-After') || 0)));
      // 429: the free tier's 20 requests a minute (or the month's quota); 401/403: the key or region is wrong.
      if (res.status === 429) throw new ProviderError('Azure is busy (too many requests)', { status: 503, retryAfter: retryAfter || 30, reason: 'busy' });
      if (res.status === 401 || res.status === 403) throw new ProviderError(`Azure refused the key (HTTP ${res.status}): check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION`, { status: 503, reason: 'refused' });
      throw new ProviderError(`Azure answered HTTP ${res.status}`, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    if (!audio.byteLength) throw new ProviderError('Azure sent no audio', { status: 502 });
    return { audio, type: (res.headers.get('content-type') || this.type).split(';')[0].trim() || this.type, chars: text.length, timings: null };
  },
};

export const PROVIDERS = { azure: AZURE };
