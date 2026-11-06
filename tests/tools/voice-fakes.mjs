// The voice proxy and a speech engine as page tests play them, for the narrator's tests (tests/bibliotheca-page.test.mjs).
// Copied from tests/prp-voice.test.mjs, which keeps its own; these take a few more options.
import '../../design/prp-voice.js';

const V = globalThis.PRPVoice;
export const ONLINE = [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' }];
export const RYAN_ID = 'azure:en-GB-RyanNeural';

/* The site's voice proxy as the test plays it (no server is started; Playwright answers the page's requests): GET
   voices says it is set up, with what is left (left); POST say answers each sentence with a short silent clip, or,
   past `quotaAfter` sentences, 429 as when the day's characters are spent. Each request is kept (its body), and every
   GET voices counted (said.voices). */
export async function fakeProxy(page, { quotaAfter = Infinity, clip = 0.3, left = { today: 30000, month: 450000 }, available = true, cache = 'off' } = {}) {
  const said = [];
  said.voices = 0;
  await page.route('**/api/voice/v1/voices', route => {
    said.voices++;
    return route.fulfill({ json: available ? { available: true, engine: 'azure', voices: ONLINE, left, cache: 'none', quota: 'memory' } : { available: false, reason: 'not configured', voices: [] } });
  });
  await page.route('**/api/voice/v1/say', async route => {
    said.push(route.request().postDataJSON());
    if (said.length > quotaAfter) return route.fulfill({ status: 429, headers: { 'Retry-After': '3600' }, json: { error: 'quota', reason: 'daily', retryAfter: 3600 } });
    return route.fulfill({ status: 200, body: Buffer.from(V.silentWav(clip)), headers: { 'content-type': 'audio/wav', 'x-prp-voice-duration': String(clip), 'x-prp-voice-cache': cache } });
  });
  return said;
}

/* A speech engine for the test browser, which has none: two English voices (the American one first, so picking the
   British one is the reader's doing); each utterance "said" in `ms` ms (150 by default), with a word boundary at each
   space, and recorded as the reader set it up. `voices: 0` gives an engine with no voice; `late` lists the voices only
   after that many ms, as Chrome and Edge do (with a voiceschanged event). Pass it to page.addInitScript with its
   options: page.addInitScript(FAKE_SPEECH, { ms: 150 }). */
export const FAKE_SPEECH = (opt = {}) => {
  const ms = opt.ms ?? 150;
  const all = [{ name: 'Microsoft Zira - English (United States)', lang: 'en-US' }, { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' }];
  let voices = opt.voices === 0 ? [] : opt.late ? [] : all;
  const spoken = (window.__spoken = []);
  const listeners = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false, pending: false, paused: false, current: null, getVoices: () => voices, resume() {},
    addEventListener(t, f) { if (t === 'voiceschanged') listeners.push(f); },
    speak(u) {
      spoken.push({ text: u.text, voice: u.voice?.name || null, lang: u.lang, rate: u.rate, pitch: u.pitch });
      this.current = u; this.speaking = true;
      setTimeout(() => {
        if (this.current !== u) return;
        u.onstart?.();
        // Word boundaries spread over the utterance.
        const starts = [0];
        for (let i = 0; i < u.text.length; i++) if (u.text[i] === ' ') starts.push(i + 1);
        starts.forEach((c, j) => setTimeout(() => { if (this.current === u) u.onboundary?.({ name: 'word', charIndex: c }); }, (j * (ms - 20)) / starts.length));
      }, 10);
      setTimeout(() => { if (this.current !== u) return; this.current = null; this.speaking = false; u.onend?.(); }, ms);
    },
    cancel() { const u = this.current; this.current = null; this.speaking = false; u?.onerror?.({ error: 'interrupted' }); },
  };
  if (opt.late && opt.voices !== 0) setTimeout(() => { voices = all; listeners.forEach(f => f()); }, opt.late);
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};
