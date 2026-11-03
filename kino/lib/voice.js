/* Kino narration and music (browser only).
   Voice: the shared voice layer (design/prp-voice.js), choosing and sharing the voice as the shell's Documentary reader
   does (design/jdpi-documentary.js, the saved choice "jdpi.doc.voice"). By default that is this device's British voice,
   spoken exactly as before (Kino's quirks are the layer's defaults: PRPVoice.WEBSPEECH.kino); a lifelike online voice
   (Azure, through the site's proxy) reads instead when one is chosen in the settings and the proxy answers, and when it
   cannot carry on (not set up, offline, the day's quota spent) the device voice reads on from the same sentence. Each
   sentence is one utterance or clip (long utterances get cut off in some browsers); a full stop inside a word is never
   a sentence break, and the decimal rule in lib/text.js reads it as "point" or "dot". The word being spoken is reported
   for the caption: from the voice's boundary events where it sends them, from an estimate where it does not, and from
   the clip's clock for an online voice. Captions-only mode runs the same timing without the voice.
   Music: the reader's public-domain and CC0 classical recordings from Wikimedia Commons, quiet, ducked under speech. */
import '../../design/prp-voice.js';
import { utterances } from './text.js';

const V = globalThis.PRPVoice;
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export { store };

/* ---------- voice ---------- */
const device = V.webspeech(V.WEBSPEECH.kino), online = V.stream();
let onlineList = []; // the proxy's voices, once it has answered (it is asked only when they are wanted)
export const hasSpeech = () => device.device.has();
export function voices() { return device.device.voices(); }
export function pickVoice(name = store.get('jdpi.doc.voice', null)) { return device.device.pick(name); }
/** British voices first, then the other English ones. */
export function voiceList() { return device.device.list(); }
export function onVoices(fn) { device.device.onChange(fn); }
/** The online voices ([] when the proxy is not set up or not reachable): asks the proxy once a page. */
export async function onlineVoices() { onlineList = await online.voices(); return onlineList; }
/** The online voices known so far, without asking. */
export const knownOnline = () => onlineList;
// The voice to read with: the saved one; with no device voice at all, an online voice rather than silence.
function chosenVoice() {
  const saved = store.get('jdpi.doc.voice', null);
  if (voices().length || !onlineList.length || onlineList.some(v => v.id === saved)) return saved;
  return onlineList[0].id;
}

/**
 * Reads a passage sentence by sentence, aloud or silently (captions only).
 *   const r = new Reader({ onWord: i => …, onSentence: k => …, onBackend: (id, why) => … });
 *   r.unlock();                                         // in the Play click handler, before any await (iOS)
 *   await r.read(text, { voice: true, rate: 0.92, from: 0, next: nextText });
 *     // resolves { done: true, … } or { done: false, sentence, … }; next: the following scene, whose first sentence an
 *     // online voice fetches while this scene's last one plays
 *   r.stop(); r.sentence
 */
export class Reader {
  constructor({ onWord = () => {}, onSentence = () => {}, onBackend = () => {} } = {}) {
    this.r = V.reader({ utterances, norm: V.NORM.kino, backends: { stream: online, webspeech: device }, onWord, onSentence, onBackend });
  }
  get sentence() { return this.r.sentence; }
  unlock() { this.r.unlock({ voice: chosenVoice }); } // only when an online voice will read (see PRPVoice.reader)
  stop() { this.r.stop(); }
  async read(text, { voice = true, rate = 0.92, from = 0, next } = {}) {
    this.r.stop(); // as before: a new reading starts by cancelling whatever was being said
    return this.r.read(text, { silent: !voice, voice: chosenVoice, rate, from, next: voice ? next : undefined });
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
