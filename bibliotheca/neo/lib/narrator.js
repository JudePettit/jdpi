/* Bibliotheca's narrator: the book read aloud through the voice layer (design/prp-voice.js, PRPVoice.reader), never
   speechSynthesis directly. Plain module: the reading loop, the voices, the permission for the online voice, the day's
   own count and `gate`. Nothing here touches the page: the page (app.js) is told each unit, word, change of state and
   message, and draws them. gate, dayCount and the loop take their fetch, storage, clock and backends as options, so
   the tests run them in Node (tests/bibliotheca-narrator.test.mjs).

   The online voice and its allowance (PRP-KINO-BIBLIOTHECA-DESIGN.md, section 6.5):
   1. Reading a book never spends the allowance unless the reader chooses the online voice. The book has its own
      choice of voice (prp.bibliotheca.voice, a device voice only); jdpi.doc.voice, Kino's and the Documentary's, is
      never read or written here. Every visit starts with this device's voice, and an online voice is never saved. With
      no device voice the narrator does not switch to an online one by itself: it says so and offers the choice.
      The reader is given an online voice only for a paragraph the permission covers to its end, so the voice changes
      between paragraphs, never inside one; the next paragraph is handed over to be fetched ahead only when it is in the
      same chapter and inside the permission. As a second lock, gate (the fetch handed to PRPVoice.stream) counts every
      request to `say` and answers any the permission does not cover itself, nothing leaving the browser: a 429 with
      retryAfter 1 (with no retryAfter one refusal would set the online voice aside for ten minutes, and the next
      permission would be read by the device voice with the page told nothing).
   2. It shows what it costs: the sum of the units still to read in the chapter (the strings the proxy counts), and
      what is left, from a fresh GET voices each time an offer is made. The narrator keeps its own count for the UTC day
      in this browser (prp.bibliotheca.sent): it never allows more than the proxy says is left, nor in one day more in
      all than the most the proxy has said was left that day, so the day's limit holds while the proxy keeps its counts
      in each copy of the function's memory. A permission is for one chapter, to the end of a paragraph, and no more.
   3. When the online voice cannot carry on, the device voice reads on from that unit (the voice layer does that), the
      permission ends at once, and the page says why: the characters allowed have been read; the proxy says today's or
      this month's allowance is spent; or the online voice is not answering. With no device voice the reading pauses. */
import '../../../design/prp-voice.js';
import { chapterPassages, costFrom, permitFrom, LECTURE, SPEEDS, secondsFor } from './narrate.js';

const V = globalThis.PRPVoice;
export const ENDPOINT = '/api/voice/v1/';
export const KEYS = { voice: 'prp.bibliotheca.voice', speed: 'prp.bibliotheca.speed', sent: 'prp.bibliotheca.sent', subs: 'prp.bibliotheca.subs' };
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

/** A small store over localStorage (or the one given), every read and write guarded. */
export function storeOf(ls) {
  const s = () => { try { return ls !== undefined ? ls : globalThis.localStorage; } catch { return null; } };
  return {
    get(k, d) { try { const v = s()?.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { s()?.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
}

/** The day's own count, in this browser: { day, max, sent } under prp.bibliotheca.sent.
      told(left)     the proxy has said `left` characters are left today: the most it has said today is kept
      allowed(left)  what may be allowed now: never more than `left`, nor than the day's most less what was sent
      spend(n), refund(n) */
export function dayCount(store, now = () => Date.now()) {
  const read = () => {
    const day = utcDay(now()), r = store.get(KEYS.sent, null);
    return r && r.day === day && Number.isFinite(r.max) && Number.isFinite(r.sent) ? r : { day, max: 0, sent: 0 };
  };
  const write = r => store.set(KEYS.sent, r);
  return {
    get: read,
    told(left) { const r = read(); if (Number.isFinite(+left)) { r.max = Math.max(r.max, Math.max(0, +left)); write(r); } return r; },
    allowed(left) { const r = read(); return Math.max(0, Math.min(Number.isFinite(+left) ? +left : 0, r.max - r.sent)); },
    spend(n) { const r = read(); r.sent += n; write(r); },
    refund(n) { const r = read(); r.sent = Math.max(0, r.sent - n); write(r); },
  };
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** The fetch handed to PRPVoice.stream: a request to `say` goes out only when the permission covers its characters
    (PRPVoice.canon of its text, what the proxy counts); any other it answers itself, 429 with retryAfter 1. Every
    other request (GET voices) passes through. A clip the proxy served from its cache, and a request it refused, cost
    nothing.
      const g = gate(fetch, { onSpend(n), onRefund(n), onRefuse(), onAnswer(res, body) });
      g.grant(chars); g.end(); g.left(); g.used; g.fetch */
export function gate(real, { onSpend = () => {}, onRefund = () => {}, onRefuse = () => {}, onAnswer = () => {} } = {}) {
  let permit = null, sent = new Map(); // what has gone out under this permission: a unit's text, how many times
  const g = {
    refused: 0,
    /** Whether a unit's text has already been asked for under this permission (its clip is on its way or kept). */
    has: text => (sent.get(V.canon(text)) || 0) > 0,
    get permit() { return permit; },
    get used() { return permit ? permit.used : 0; },
    grant(chars) { permit = { chars: Math.max(0, Math.floor(chars)), used: 0 }; sent = new Map(); },
    end() { permit = null; sent = new Map(); },
    left() { return permit ? permit.chars - permit.used : 0; },
    async fetch(url, init = {}) {
      if (!/\/say(?:[?#]|$)/.test(String(url))) return real(url, init);
      let text = '';
      try { text = V.canon(JSON.parse(init.body || '{}').text); } catch { text = ''; }
      const n = text.length;
      const mark = d => { const c = (sent.get(text) || 0) + d; if (c > 0) sent.set(text, c); else sent.delete(text); };
      const mine = permit;
      if (!mine || !n || mine.used + n > mine.chars) {
        g.refused++; onRefuse();
        return json(429, { error: 'quota', reason: 'permission', retryAfter: 1 }, { 'Retry-After': '1' });
      }
      mine.used += n; mark(1); onSpend(n);
      let res;
      try { res = await real(url, init); } catch (e) { mine.used -= n; if (permit === mine) mark(-1); onRefund(n); throw e; }
      if (!res.ok) { mine.used -= n; if (permit === mine) mark(-1); onRefund(n); }
      else if (/^hit$/i.test(res.headers.get('X-PRP-Voice-Cache') || '')) { mine.used -= n; onRefund(n); }
      let body = null;
      if (!res.ok) { try { body = await res.clone().json(); } catch { body = null; } }
      onAnswer(res, body);
      return res;
    },
  };
  return g;
}

/** What the proxy says about itself: { available, voices: [{ id, name, label, lang }], left: { today, month } | null,
    quota, about } (about: its counts are approximate, kept in each copy's memory). Never throws. */
export async function probe(fetchFn, endpoint = ENDPOINT) {
  try {
    const r = await fetchFn(endpoint + 'voices', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (!j || j.available !== true || !Array.isArray(j.voices)) return { available: false, voices: [], left: null, quota: null, about: true };
    const voices = j.voices.filter(v => V.isOnline(v.id)).map(v => ({ id: v.id, name: String(v.name || v.id), label: String(v.label || v.name || v.id), lang: String(v.lang || 'en-GB') }));
    const left = j.left && Number.isFinite(+j.left.today) ? { today: +j.left.today, month: Number.isFinite(+j.left.month) ? +j.left.month : +j.left.today } : null;
    return { available: true, voices, left, quota: j.quota || null, about: j.quota !== 'd1' };
  } catch { return { available: false, voices: [], left: null, quota: null, about: true }; }
}

/** The narrator.
      const n = new Narrator({ onUnit, onWord, onState, onMessage, onChapterEnd, fetch, store, device, stream, now });
      n.load(chapter, key); n.at(pid); n.play(); n.pause(); n.speed = 1.15; n.deviceVoice = name;
      await n.offer(voiceId) → figures; n.accept(voiceId) (inside the press); n.decline()
    onUnit({ pid, k, unit, passage, backend }) at the start of each unit; onWord(i) the word being said (numbered through
    the paragraph); onState() after any change of state; onMessage({ text, why }) a line for the message row (null
    clears it); onChapterEnd() when the chapter has been read to its end. */
export class Narrator {
  constructor(o = {}) {
    this.o = o;
    this.store = o.store || storeOf();
    this.now = o.now || (() => Date.now());
    this.real = o.fetch || ((...a) => globalThis.fetch(...a));
    this.endpoint = o.endpoint || ENDPOINT;
    this.day = dayCount(this.store, this.now);
    this.device = o.device || V.webspeech();
    this.passages = []; this.key = null; this.pos = { i: 0, k: 0 };
    this.playing = false; this.token = 0;
    this.permit = null;          // { voice, key, chars, total, from }: the online voice for this chapter, this many characters
    this.online = null;          // the proxy's answer: { available, voices, left, quota, about }
    this.lastOnline = null;      // the online voice last read with this visit (for the row's one-press offer), never saved
    this.stale = false;          // true while the proxy is being asked afresh for a new chapter's one-press offer
    this.intended = 'webspeech';
    const sp = +this.store.get(KEYS.speed, 1);
    this._speed = SPEEDS.includes(sp) ? sp : 1;
    this._voice = this.store.get(KEYS.voice, null);
    this.g = gate(this.real, {
      onSpend: n => { this.day.spend(n); this.o.onState?.(); },
      onRefund: n => { this.day.refund(n); this.o.onState?.(); },
      onAnswer: (res, body) => { if (res.status === 429 && body?.error === 'quota') this.refusal = body.reason === 'monthly' ? 'monthly' : 'daily'; },
    });
    this.makeStream = o.stream || (fetchFn => V.stream({ fetch: fetchFn }));
    this.stream = this.makeStream(this.g.fetch);
    this.backends = { stream: this.stream, webspeech: this.device };
    this.reader = V.reader({
      norm: V.NORM.plain, backends: this.backends,
      onSentence: k => this.sentence(k),
      onWord: i => this.o.onWord?.(i),
      onBackend: (id, why) => { if (why && id === 'webspeech' && this.intended === 'stream') this.handOver(why.reason === 'quota' ? (this.g.refused > this.refusedSeen ? 'used' : 'quota') : 'unavailable'); },
    });
    this.refusedSeen = 0;
  }

  /* ---------- what it reads ---------- */
  get speed() { return this._speed; }
  set speed(s) {
    if (!SPEEDS.includes(+s)) return;
    this._speed = +s; this.store.set(KEYS.speed, this._speed);
    if (this.playing) this.restart();
    this.o.onState?.();
  }
  get rate() { return LECTURE * this._speed; }
  /** This device's English voices, British first ([] with none, or before the browser has listed them). */
  deviceVoices() { try { return this.device.device.list(); } catch { return []; } }
  hasDeviceVoice() { return this.deviceVoices().length > 0; }
  get deviceVoice() { const all = this.deviceVoices(); return all.some(v => v.name === this._voice) ? this._voice : (this.device.device?.pick?.(null)?.name || null); }
  set deviceVoice(name) {
    this._voice = name || null; this.store.set(KEYS.voice, this._voice);
    if (this.playing && this.intended === 'webspeech') this.restart();
    this.o.onState?.();
  }
  get passage() { return this.passages[this.pos.i] || null; }
  get unit() { return this.passage?.units[this.pos.k] || null; }
  /** The voice now reading, or that will read the next unit: 'stream' (online) or 'webspeech' (this device). */
  get voiceKind() { return this.permit && this.covers(this.pos.i, this.pos.k) ? 'stream' : 'webspeech'; }

  /** A chapter to read (key: something that names it, the book and its number), from a paragraph (its index in
      chapter.paragraphs; the first by default). A permission is for one chapter. Carries on reading if it was. */
  load(chapter, key, where = 0) {
    const same = key === this.key;
    this.stopVoice();
    this.passages = chapterPassages(chapter); this.key = key;
    if (!same && this.permit) this.endPermit(null);
    // The row's one-press offer for the new chapter: what is left is asked afresh (section 6.5), as for any offer, and
    // the offer waits for the answer (stale) rather than show the last one's figures.
    if (!same && this.lastOnline) { this.stale = true; this.refresh().catch(() => {}).finally(() => { this.stale = false; this.o.onState?.(); }); }
    this.at(where);
  }
  /** Read from this paragraph (or the next one that is read, if it is a note or a table): by its index in
      chapter.paragraphs, or its id. Carries on reading if it was. */
  at(where, { k = 0 } = {}) {
    let i = typeof where === 'number' ? this.passages.findIndex(p => p.pi >= where) : this.passages.findIndex(p => p.id === where);
    if (i < 0 && typeof where !== 'number') return false;
    if (i < 0) i = this.passages.length;
    this.pos = { i, k: Math.max(0, Math.min(k, (this.passages[i]?.units.length || 1) - 1)) };
    if (this.playing) this.restart();
    this.o.onState?.();
    return true;
  }

  /* ---------- play and pause ---------- */
  /** Inside the press, before any await: the audio is unlocked (iOS) for an online voice. */
  play() {
    if (this.playing) return;
    this.reader.unlock({ voice: this.voiceKind === 'stream' ? this.permit.voice : this.deviceVoice });
    this.playing = true;
    this.o.onState?.();
    this.run();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.stopVoice();
    this.o.onState?.();
  }
  stopVoice() { this.token++; try { this.reader.stop(); } catch { /* nothing to stop */ } }
  restart() { this.stopVoice(); if (this.playing) this.run(); }

  // What a paragraph still costs from a unit: its units not yet asked for under this permission (the stream asks for
  // the next unit, and the next paragraph's first, while one plays, and keeps the clips).
  owed(i, k = 0) {
    let c = 0;
    for (const u of this.passages[i]?.units.slice(k) || []) if (!this.g.has(u.text)) c += u.text.length;
    return c;
  }
  covers(i, k) {
    const p = this.permit;
    if (!p || p.key !== this.key || !this.passages[i]) return false;
    return this.owed(i, k) <= this.g.left();
  }

  async run() {
    const my = ++this.token;
    while (this.playing && my === this.token) {
      const p = this.passages[this.pos.i];
      if (!p) { this.playing = false; this.o.onState?.(); this.o.onChapterEnd?.(); return; }
      const online = this.covers(this.pos.i, this.pos.k);
      // The permission has been read to its end (a paragraph it does not cover is next): it ends here.
      if (!online && this.permit && this.permit.key === this.key) this.endPermit('used');
      if (!online && !this.hasDeviceVoice()) { this.playing = false; this.say('nodevice'); this.o.onState?.(); return; }
      this.intended = online ? 'stream' : 'webspeech';
      this.started = false;
      let next;
      if (online) {
        const q = this.passages[this.pos.i + 1];
        if (q && this.owed(this.pos.i, this.pos.k) + this.owed(this.pos.i + 1) <= this.g.left()) next = { text: q.text, units: q.units, id: q.id };
      }
      const r = await this.reader.read({ text: p.text, units: p.units, id: p.id }, { voice: online ? this.permit.voice : this.deviceVoice, rate: this.rate, from: this.pos.k, next });
      if (my !== this.token) return;
      if (r.done) { this.pos = { i: this.pos.i + 1, k: 0 }; continue; }
      if (r.reason === 'stopped') { this.playing = false; this.o.onState?.(); return; } // stopped by something else
      // No voice could say it (a device voice that failed): stop, and say so.
      this.pos.k = r.sentence ?? this.pos.k;
      this.playing = false; this.say('failed'); this.o.onState?.();
      return;
    }
  }
  // Each unit as it starts: the reader is told; an online voice that declined the paragraph at the outset is noticed
  // here (the voice layer says nothing when it never started).
  sentence(k) {
    const p = this.passage;
    if (!p) return;
    this.pos.k = k;
    const backend = this.reader.backend;
    if (this.intended === 'stream' && backend && backend !== 'stream') this.handOver('unavailable');
    this.o.onUnit?.({ pid: p.id, k, unit: p.units[k], passage: p, backend });
  }

  /* ---------- the online voice ---------- */
  /** The proxy asked afresh: its voices and what is left. */
  async refresh() {
    this.online = await probe(this.real, this.endpoint);
    if (this.online.left) this.day.told(this.online.left.today);
    this.o.onState?.();
    return this.online;
  }
  /** What is left to allow now, in characters: the proxy's day and month, and the day's own count. */
  leftNow() {
    const l = this.online?.left;
    if (!l) return 0;
    return Math.max(0, Math.min(l.today, l.month, this.day.allowed(l.today)));
  }
  /** The figures for an offer, from the unit being read: { voice, name, cost, minutes, today, month, about, allow:
      { chars, minutes, all } }. */
  figures(voiceId) {
    const v = this.online?.voices.find(x => x.id === voiceId) || { id: voiceId, name: String(voiceId).split('-').pop()?.replace(/Neural$/, '') || voiceId };
    const p = this.passage, cost = p ? costFrom(this.passages, p.id, this.pos.k) : 0;
    const left = this.leftNow(), allow = p ? permitFrom(this.passages, p.id, this.pos.k, left) : { chars: 0, all: false };
    return { voice: v.id, name: v.name, cost, minutes: Math.max(1, Math.round(secondsFor(cost, this._speed) / 60)), today: this.online?.left?.today ?? 0,
      month: this.online?.left?.month ?? 0, about: this.online?.about !== false, allow: { chars: allow.chars, all: allow.all && allow.chars > 0, minutes: Math.max(1, Math.round(secondsFor(allow.chars, this._speed) / 60)) } };
  }
  /** An offer: the proxy asked afresh, then the figures. Reads nothing. */
  async offer(voiceId) { await this.refresh(); return this.figures(voiceId); }
  /** "Read with it", inside its own press: permission for what the figures allow, worked out now; the audio unlocked;
      the unit being read read again with the online voice. Returns the characters allowed (0: nothing could be). */
  accept(voiceId) {
    const f = this.figures(voiceId);
    if (!f.allow.chars) return 0;
    // A fresh stream: one that has just been refused (by gate, or the proxy) stands aside for a while, and this is a
    // new permission the reader has just given.
    this.stream?.stop?.();
    this.stream = this.makeStream(this.g.fetch);
    this.backends.stream = this.stream;
    this.g.grant(f.allow.chars);
    this.refusedSeen = this.g.refused;
    this.refusal = null;
    this.permit = { voice: voiceId, key: this.key, chars: f.allow.chars, total: f.cost, all: f.allow.all };
    this.lastOnline = voiceId;
    this.reader.unlock({ voice: voiceId });
    this.say(null);
    if (this.playing) this.restart(); else { this.playing = true; this.run(); }
    this.o.onState?.();
    return f.allow.chars;
  }
  /** The running count while the online voice reads: { used, chars }. */
  get count() { return this.permit ? { used: this.g.used, chars: this.permit.chars } : null; }
  endPermit(why) {
    const was = this.permit;
    this.permit = null; this.g.end();
    if (was && why) this.say(why, was);
    this.o.onState?.();
  }
  // The online voice could not carry on: the device voice reads on from that unit (the voice layer does it); the
  // permission ends at once, so the voice does not flip back a minute later. With no device voice, the reading pauses.
  handOver(why) {
    if (!this.permit) return;
    this.intended = 'webspeech';
    this.endPermit(why === 'quota' ? this.refusal || 'daily' : why);
    // (After this tick: the voice layer is about to hand the unit to the device voice, and that is what must stop.)
    if (!this.hasDeviceVoice()) { this.playing = false; queueMicrotask(() => { if (!this.playing) this.stopVoice(); }); this.say('nodevice'); this.o.onState?.(); }
  }
  say(why, permit = null) { this.o.onMessage?.(why ? { why, permit } : null); }
}
