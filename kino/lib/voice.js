/* Kino narration and music (browser only).
   Voice: the browser's speech synthesis, choosing a British voice the same way as the shell's Documentary reader
   (design/jdpi-documentary.js), and sharing its saved choice of voice ("jdpi.doc.voice"). Each sentence is one
   utterance (long ones get cut off in some browsers); a full stop inside a word is never a sentence break, and the
   decimal rule in lib/text.js reads it as "point" or "dot". The word being spoken is reported for the caption, from
   the voice's boundary events where it sends them and from an estimate where it does not.
   Captions-only mode runs the same timing without the voice.
   Music: the reader's public-domain and CC0 classical recordings from Wikimedia Commons, quiet, ducked under speech. */
import { utterances, wordAt } from './text.js';

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export { store };

/* ---------- voice ---------- */
export const hasSpeech = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
const PREFER = [/Microsoft (Ryan|Thomas|Oliver|Alfie|Elliot|Noah|Ethan).*(Online|Natural)/i, /Microsoft.*(Online|Natural).*United Kingdom/i, /Google UK English Male/i, /^Daniel\b/i, /^Arthur\b/i, /Microsoft George/i, /Microsoft Ryan/i];
export function voices() { return hasSpeech() ? speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang)) : []; }
export function pickVoice(name = store.get('jdpi.doc.voice', null)) {
  const all = voices();
  if (name) { const v = all.find(x => x.name === name); if (v) return v; }
  for (const re of PREFER) { const v = all.find(x => re.test(x.name) && /GB|UK|United Kingdom/i.test(x.lang + x.name)); if (v) return v; }
  return all.find(v => /en-GB/i.test(v.lang)) || all[0] || null;
}
/** British voices first, then the other English ones. */
export function voiceList() { const all = voices(); return [...all.filter(v => /en-GB/i.test(v.lang)), ...all.filter(v => !/en-GB/i.test(v.lang))]; }
export function onVoices(fn) { if (hasSpeech()) speechSynthesis.addEventListener?.('voiceschanged', fn); }

const CHARS_PER_SEC = 14.2; // about 165 words a minute at rate 1

/**
 * Reads a passage sentence by sentence, aloud or silently (captions only).
 *   const r = new Reader({ onWord: i => …, onSentence: k => … });
 *   await r.read(text, { voice: true, rate: 0.92, from: 0 });   // resolves { done: true } or { done: false, sentence }
 *   r.stop();
 */
export class Reader {
  constructor({ onWord = () => {}, onSentence = () => {} } = {}) { this.onWord = onWord; this.onSentence = onSentence; this.token = 0; this.sentence = 0; this.pending = null; }
  stop() {
    this.token++;
    if (hasSpeech()) speechSynthesis.cancel();
    clearTimeout(this.timer); cancelAnimationFrame(this.raf);
    const p = this.pending; this.pending = null; p?.(false);
  }
  async read(text, { voice = true, rate = 0.92, from = 0 } = {}) {
    const busy = hasSpeech() && (speechSynthesis.speaking || speechSynthesis.pending);
    this.stop();
    const token = ++this.token, list = utterances(text);
    const useVoice = voice && hasSpeech() && voices().length > 0;
    if (busy) await new Promise(r => setTimeout(r, 90)); // Chrome can drop an utterance queued straight after cancel()
    if (token !== this.token) return { done: false, sentence: from };
    for (let k = Math.max(0, from); k < list.length; k++) {
      if (token !== this.token) return { done: false, sentence: k };
      this.sentence = k; this.onSentence(k);
      const ok = useVoice ? await this.speakOne(list[k], rate, token) : await this.timeOne(list[k], rate, token);
      if (!ok || token !== this.token) return { done: false, sentence: k };
    }
    return { done: true };
  }
  // Word timing from an estimate: each word's share of the sentence by its length, with a pause after punctuation.
  schedule(utt, rate, token, t0 = performance.now(), speakingFrom = 0) {
    const weights = utt.words.map(w => (w.to - w.from) + 1.5 + (/[,;:]$/.test(utt.text.slice(w.from, w.to)) ? 4 : 0));
    const total = weights.reduce((a, b) => a + b, 0), dur = (total / (CHARS_PER_SEC * rate)) * 1000;
    const marks = []; let acc = 0; for (const w of weights) { marks.push(acc / total); acc += w; }
    const tick = now => {
      if (token !== this.token || this.boundaryMode) return;
      const p = (now - t0) / dur; let i = 0;
      while (i + 1 < marks.length && marks[i + 1] <= p) i++;
      this.onWord(utt.words[Math.max(i, speakingFrom)].i);
      if (p < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return dur;
  }
  timeOne(utt, rate, token) {
    return new Promise(resolve => {
      this.boundaryMode = false;
      this.pending = resolve;
      const dur = this.schedule(utt, rate, token);
      this.timer = setTimeout(() => { if (this.pending === resolve) this.pending = null; resolve(token === this.token); }, dur + 380);
    });
  }
  speakOne(utt, rate, token) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(utt.text);
      const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = rate; u.pitch = 0.94;
      this.boundaryMode = false;
      let settled = false;
      const finish = ok => { if (settled) return; settled = true; clearTimeout(watchdog); clearTimeout(fallback); if (this.pending === finish) this.pending = null; resolve(ok); };
      this.pending = finish;
      u.onboundary = e => { if (token !== this.token) return; if (e.name && e.name !== 'word') return; this.boundaryMode = true; this.onWord(wordAt(utt, e.charIndex)); };
      u.onstart = () => { if (token === this.token && !this.boundaryMode) this.onWord(utt.words[0].i); };
      u.onend = () => finish(token === this.token);
      u.onerror = e => finish(token === this.token && e.error !== 'interrupted' && e.error !== 'canceled');
      // Voices that send no word boundaries: highlight by estimate once speech has had a moment to start.
      const fallback = setTimeout(() => { if (!this.boundaryMode && token === this.token) this.schedule(utt, rate, token); }, 450);
      // Some engines never fire "end": give up well after the sentence should have finished.
      const watchdog = setTimeout(() => finish(token === this.token), Math.max(6000, (utt.text.length / (CHARS_PER_SEC * rate)) * 2500 + 4000));
      speechSynthesis.speak(u);
      if (speechSynthesis.paused) speechSynthesis.resume(); // Chrome can leave the queue paused
    });
  }
}

/* ---------- music ---------- */
const C = 'https://upload.wikimedia.org/wikipedia/commons/';
export const TRACKS = [
  ['Debussy', 'Clair de lune', 'b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg', 'File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg'],
  ['Satie', 'Gymnopédie No. 1 (Michael Laucke)', 'a/a6/Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac', 'File:Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac'],
  ['Bach', 'Air (Orchestral Suite No. 3)', '1/1e/Air_%28Bach%29.ogg', 'File:Air_(Bach).ogg'],
  ['Chopin', 'Nocturne in E-flat, Op. 9 No. 2 (Peter Johnston, CC0)', '0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg', 'File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg'],
  ['Debussy', 'Rêverie', '5/53/Reverie.ogg', 'File:Reverie.ogg'],
  ['Satie', 'Gnossienne No. 1 (La Pianista)', '9/91/Satie_-_Gnossienne_1.ogg', 'File:Satie_-_Gnossienne_1.ogg'],
  ['Bach', 'Goldberg Variations: Aria (Musopen, CC0)', 'a/af/Bach%2C_Goldberg_Variations%2C_Aria_%28Musopen_version%29.ogg', 'File:Bach,_Goldberg_Variations,_Aria_(Musopen_version).ogg'],
  ['Ravel', 'Pavane pour une infante défunte', '4/4d/Maurice_Ravel_-_Pavane_pour_une_infante_d%C3%A9funte.ogg', 'File:Maurice_Ravel_-_Pavane_pour_une_infante_défunte.ogg'],
  ['Mozart', 'Piano Concerto No. 12: Andante', 'a/aa/Mozart%3B_Concerto_No._12_in_A-_II._Andante.ogg', 'File:Mozart;_Concerto_No._12_in_A-_II._Andante.ogg'],
  ['Bach', 'Cello Suite No. 1: Prelude (CC0)', 'a/a7/Bach_Cello_Suite_1_Prelude_%28BWV_1007%29_Played_by_Chris.ogg', 'File:Bach_Cello_Suite_1_Prelude_(BWV_1007)_Played_by_Chris.ogg'],
  ['Grieg', 'Peer Gynt: Morning Mood', '7/7b/Henrik_Ibsen%2C_Edvard_Grieg_-_Morgenstemning_%28Morning_Mood%29.ogg', 'File:Henrik_Ibsen,_Edvard_Grieg_-_Morgenstemning_(Morning_Mood).ogg'],
  ['Elgar', 'Enigma Variations: Nimrod (Barbirolli)', 'e/e7/Elgar%3B_Enigma_variations%2C_Theme_IX._Nimrod.ogg', 'File:Elgar;_Enigma_variations,_Theme_IX._Nimrod.ogg'],
].map(([composer, title, path, page]) => { const file = path.split('/').pop(); return { composer, title, src: C + path, mp3: `${C}transcoded/${path}/${file}.mp3`, page: 'https://commons.wikimedia.org/wiki/' + page }; });

export class Music {
  constructor({ onTrack = () => {} } = {}) {
    this.onTrack = onTrack; this.on = false; this.vol = 0.14; this.ducked = false; this.order = []; this.k = -1;
    this.audio = new Audio(); this.audio.preload = 'none';
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => {
      const a = this.audio;
      if (a.dataset.fallback && a.src !== a.dataset.fallback) { a.src = a.dataset.fallback; a.dataset.fallback = ''; if (this.on) a.play().catch(() => {}); } else this.next();
    });
  }
  get track() { return this.k >= 0 ? TRACKS[this.order[this.k]] : null; }
  next() {
    if (!this.order.length || this.k >= this.order.length - 1) { this.order = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5); this.k = -1; }
    const t = TRACKS[this.order[++this.k]];
    this.audio.dataset.fallback = t.src; this.audio.src = t.mp3; this.audio.volume = this.level();
    this.onTrack(t);
    if (this.on) this.audio.play().catch(() => {});
  }
  level() { return this.ducked ? this.vol * 0.45 : this.vol; }
  set(on) {
    this.on = on;
    if (on) { if (!this.audio.src) this.next(); else this.audio.play().catch(() => {}); } else this.audio.pause();
  }
  duck(on) {
    this.ducked = on;
    const a = this.audio, target = this.level(), start = a.volume, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 600); a.volume = Math.max(0, Math.min(1, start + (target - start) * k)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
}
