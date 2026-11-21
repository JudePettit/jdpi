// Daily Synopsis: the day's stories, by rules, with no model. Pure functions (no file, no network, no clock), used by
// daily-synopsis/scripts/build.mjs and the tests.
//   selectStories(stores, { ref, access })   the major stories of the 24 hours before `ref`
//   makeInput(stories, meta)                 the day's input file: what the scheduled Claude run reads, and all it reads
//   rulesDay(input, { generated })           the day as rules alone make it: the outlets' own headlines, fixed labels
//   withDraft(day, input, draft, result, …)  the day with a checked draft's text, or with the one plain line saying the
//                                            written digest is not available
//
// THE RULE. The stories are Highbrowse's own groups (highbrowse/analysis.js buildModel: headlines from the four Omni
// News briefings' stores grouped as one story when they share enough of their rarer words; the Political Briefing's Top
// stories are the same groups), so the same headlines make the same story on every page. A story is MAJOR when, in the
// 24 hours before `ref` (and up to an hour after it, for feeds a little ahead of the clock):
//   - at least MIN_OUTLETS (3) different Political Briefing publishers ran a headline in it (outlets counted by their
//     catalogue id, as the Briefing counts its publishers; an article two briefings carry counts once), and
//   - those publishers come from at least MIN_SIDES (2) of the five positions VM records for them (far left, left,
//     centre, right, far right: briefing/scripts/sources.mjs).
// Only the Political Briefing's publishers have a position, so the Scientific, Economics and Digital Briefings' items
// help group the headlines (as in Top stories) but are not counted, listed or given to the model: their shape has no
// position to put them on the spectrum. Sport, entertainment and lifestyle are left out, as Highbrowse leaves them out.
// Ranked by publishers, then positions, then headlines, then the newest headline; the first CAP (10) are the day's.
// Measured on the committed stores on 21 November 2026, for the five days 17 to 21 November: 20 to 30 major stories a
// day, so the day always holds ten.
//
// THE 5 SIDED ANALYSIS. Every story's headlines are laid out by side, far left to far right. A story gets a written
// analysis (the model's, checked) only when at least FIVE_MIN_SIDES (3) of the five sides carried it, at least one left
// of centre (far left or left) and one right of centre (right or far right): 7 to 10 of each day's ten on the same days.
import { buildModel, politicalTops, isFree, POSITIONS } from '../../highbrowse/analysis.js';
import { plainText } from './check.mjs';

export const MIN_OUTLETS = 3, MIN_SIDES = 2, CAP = 10, FIVE_MIN_SIDES = 3, MAX_ITEMS = 30;
export const INPUT_FORMAT = 'vm-daily-synopsis-input/1', DAY_FORMAT = 'vm-daily-synopsis-day/1', INDEX_FORMAT = 'vm-daily-synopsis-index/1';
export const SIDE_LABELS = { far_left: 'Far left', left: 'Left', centre: 'Centre', right: 'Right', far_right: 'Far right' };
const H = 36e5;

// VM's fixed words. The label opens every day, before its first sentence, and goes with every archived copy.
export const LABEL = {
  model: 'The text of this digest was written by an AI model (Claude) from the headlines listed beneath it and the short summaries in their feeds, and no person checked it. The linked reports are the sources.',
  rules: 'This digest was assembled by rules, with no AI model: Vitruvian Manager’s code picked the stories and grouped the outlets’ own headlines beneath them, and no person checked it. The linked reports are the sources.',
  fiveModel: 'Each written 5 Sided Analysis was written by the same model from the outlets’ headlines and the short summaries in their feeds alone, never from the articles, and no person checked it.',
  fiveRules: 'The 5 Sided Analysis under each story lays out the outlets’ own headlines by side, far left to far right, by rules alone.',
  notProof: 'A side with no headline here was not found among Vitruvian Manager’s outlets, which is not proof that the side did not report it.',
  unavailable: 'The written digest is not available for this day.',
  fiveUnavailable: 'The written comparison is not available for this story.',
  fiveNotEligible: 'No written comparison for this story: one is written only when at least three of the five sides carried it, one left of centre and one right of centre.',
  fiveOneHalf: 'Only one of the two halves, left or right of centre, carried this story, so they are not compared.',
  noSide: 'None of Vitruvian Manager’s outlets on this side was found reporting it in the 24 hours.',
};
export const meta = authorship => (authorship === 'model'
  ? 'Written by an AI model (Claude) from the listed headlines; no person checked it'
  : 'Assembled by rules, with no AI model; no person checked it');

/** The UTC day of a time, "2026-11-21". */
export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

/**
 * The major stories of the 24 hours before `ref`, at most CAP, ranked. `stores` are the four briefings' stores in
 * Highbrowse's order ([political, scientific, economics, digital], any but the first may be null); `access` the
 * access table (PRPAccess.table), so a story's first headline is one anyone can read wherever one is.
 */
export function selectStories(stores, { ref, access = null }) {
  const model = buildModel(stores, { now: ref, access });
  const lo = ref - 24 * H, hi = ref + H;
  const tops = politicalTops(model, '24h');
  const out = [];
  for (const t of tops) {
    const entries = t.entries.filter(e => e.item.at >= lo && e.item.at <= hi && e.item.pos);
    const per = Object.fromEntries(POSITIONS.map(p => [p, new Set(entries.filter(e => e.item.pos === p).map(e => e.item.sid)).size]));
    const outlets = POSITIONS.reduce((a, p) => a + per[p], 0), sides = POSITIONS.filter(p => per[p] > 0);
    if (outlets < MIN_OUTLETS || sides.length < MIN_SIDES) continue;
    out.push({ order: t.order, outlets, per, sides, entries, newest: Math.max(...entries.map(e => e.item.at)) });
  }
  out.sort((a, b) => b.outlets - a.outlets || b.sides.length - a.sides.length || b.entries.length - a.entries.length || b.newest - a.newest || a.order - b.order);
  return out.slice(0, CAP);
}

const fiveEligible = sides => sides.length >= FIVE_MIN_SIDES && sides.some(p => p === 'far_left' || p === 'left') && sides.some(p => p === 'right' || p === 'far_right');

/** A short, stable id for the day's input: the first 12 hex digits of a SHA-256 of its stories. */
async function digestOf(text) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * The day's input file. Each story: its rank, its outlets per side, whether it gets a written analysis, the id of its
 * first headline (the most typical one anyone can read) and its items, by side from far left to far right and, within
 * a side, the most typical first. Each item: id, side, outlet, outletId, caution, access, headline, url, published and
 * the feed's short summary (used by the model and the check, never shown). The headline and the summary are the
 * publishers' text made plain (check.mjs plainText): line breaks and tabs become spaces, and control, zero-width and
 * direction characters are taken out, so no text in them is hidden from a person reading the input file.
 */
export async function makeInput(stories, { day, ref, storeGenerated, generated }) {
  const list = stories.map((s, n) => {
    const id = `s${n + 1}`;
    const ordered = [...s.entries].sort((a, b) => POSITIONS.indexOf(a.item.pos) - POSITIONS.indexOf(b.item.pos) || a.rank - b.rank).slice(0, MAX_ITEMS);
    const items = ordered.map((e, k) => ({
      id: `${id}-${k + 1}`, side: e.item.pos, outlet: e.item.src, outletId: e.item.sid, caution: !!e.item.caution, access: e.item.acc || 'free',
      headline: plainText(e.item.t), url: e.item.u, published: new Date(e.item.at).toISOString(), summary: plainText(e.item.d).slice(0, 240).trim(),
    }));
    const byRank = [...ordered].sort((a, b) => a.rank - b.rank);
    const lead = byRank.find(e => isFree(e.item)) || byRank[0];
    return {
      id, rank: n + 1, outlets: s.outlets, sides: Object.fromEntries(POSITIONS.map(p => [p, s.per[p]])), written5: fiveEligible(s.sides),
      lead: items[ordered.indexOf(lead)].id, items,
    };
  });
  const body = JSON.stringify(list);
  return {
    format: INPUT_FORMAT, day, id: `${day}-${await digestOf(body)}`, generated,
    window: { from: new Date(ref - 24 * H).toISOString(), to: new Date(ref).toISOString() }, storeGenerated,
    rule: { minOutlets: MIN_OUTLETS, minSides: MIN_SIDES, cap: CAP, fiveMinSides: FIVE_MIN_SIDES, fiveNeedsLeftAndRight: true },
    sides: POSITIONS.map(k => ({ key: k, label: SIDE_LABELS[k] })),
    stories: list,
  };
}

const headlineOf = i => ({ id: i.id, side: i.side, outlet: i.outlet, outletId: i.outletId, caution: i.caution, access: i.access, headline: i.headline, url: i.url, published: i.published });

/** The day as rules alone make it: each story's headlines, and its 5 Sided Analysis's rules layer. */
export function rulesDay(input, { generated }) {
  return {
    format: DAY_FORMAT, day: input.day, input: input.id, generated, updated: generated, window: input.window, storeGenerated: input.storeGenerated,
    authorship: 'rules', model: null, label: { text: LABEL.rules, five: LABEL.fiveRules, notProof: LABEL.notProof, meta: meta('rules') },
    rule: input.rule, sides: input.sides,
    written: { status: 'missing', note: LABEL.unavailable, attempts: [] },
    lead: null,
    stories: input.stories.map(s => ({
      id: s.id, rank: s.rank, outlets: s.outlets, lead: s.lead, headlines: s.items.map(headlineOf), sentences: null,
      five: {
        sides: input.sides.map(({ key, label }) => ({ key, label, outlets: s.sides[key], headlines: s.items.filter(i => i.side === key).map(i => i.id) })),
        eligible: s.written5, written: null, status: s.written5 ? 'missing' : 'not-eligible',
        note: s.written5 ? LABEL.fiveUnavailable : LABEL.fiveNotEligible,
      },
    })),
  };
}

/**
 * The day with a checked draft. `result` is checkDraft's. A refused draft adds an attempt (its codes and places, never
 * its words) and leaves the day as rules made it; a passing one publishes its text, once: a day whose written digest is
 * published keeps it, and a later draft is not looked at.
 */
export function withDraft(day, input, draft, result, { checked }) {
  if (day.written.status === 'published') return day;
  const attempt = { checked, ok: result.ok, reasons: result.reasons };
  if (!result.ok) return { ...day, updated: checked, written: { ...day.written, status: 'refused', note: LABEL.unavailable, attempts: [...day.written.attempts, attempt] } };
  const byId = new Map(draft.stories.map(s => [s.id, s]));
  const anyFive = Object.values(result.five).some(f => f && f.ok);
  return {
    ...day, updated: checked, authorship: 'model', model: draft.model,
    label: { ...day.label, text: LABEL.model, five: anyFive ? LABEL.fiveModel : LABEL.fiveRules, meta: meta('model') },
    written: { status: 'published', note: null, attempts: [...day.written.attempts, { ...attempt, five: Object.fromEntries(Object.entries(result.five).filter(([, f]) => f).map(([k, f]) => [k, f.ok ? { ok: true } : f])) }] },
    lead: draft.lead.map(s => ({ text: s.text, cites: [...s.cites] })),
    stories: day.stories.map(s => {
      const d = byId.get(s.id), f = result.five[s.id];
      const five = { ...s.five };
      if (s.five.eligible) {
        const story = input.stories.find(x => x.id === s.id);
        const halves = ['far_left', 'left'].some(k => story.sides[k]) && ['right', 'far_right'].some(k => story.sides[k]);
        if (f && f.ok) {
          five.written = {
            sides: Object.fromEntries(Object.entries(d.five.sides).map(([k, list]) => [k, list.map(x => ({ text: x.text, cites: [...x.cites] }))])),
            closing: d.five.closing ? { kind: d.five.closing.kind, text: d.five.closing.text, cites: [...d.five.closing.cites] } : null,
          };
          five.status = 'published'; five.note = halves ? null : LABEL.fiveOneHalf;
        } else { five.status = 'refused'; five.note = LABEL.fiveUnavailable; }
      }
      return { ...s, sentences: d.sentences.map(x => ({ text: x.text, cites: [...x.cites] })), five };
    }),
  };
}

/** The index of the days: newest first, each day's authorship, the state of its written digest and its counts.
 *  `corrections` is corrections.json's list of notes (a day's file is never opened again once its date has passed, so
 *  a correction to it is a dated note kept there, shown beside the day). */
export function indexOf(days, { generated, corrections = [] }) {
  const list = [...days].sort((a, b) => (a.day < b.day ? 1 : -1));
  return {
    format: INDEX_FORMAT, generated, latest: list[0]?.day || null,
    days: list.map(d => ({
      day: d.day, authorship: d.authorship, written: d.written.status, stories: d.stories.length,
      fiveWritten: d.stories.filter(s => s.five.status === 'published').length, corrections: corrections.filter(c => c.day === d.day).length,
    })),
  };
}

/** One correction note, checked: a day kept, a date on or after it, plain text in VM's words (no link, no markup, no
 *  quotation mark), at most 500 characters. Returns the note or throws. */
export const CORRECTIONS_FORMAT = 'vm-daily-synopsis-corrections/1';
export function correctionNote({ day, date, story = null, text }, { days, checkText }) {
  if (!days.includes(day)) throw new Error(`${day}: no such day is kept`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < day) throw new Error(`${date}: a correction is dated on or after its day`);
  if (story !== null && !/^s\d{1,2}$/.test(story)) throw new Error(`${story}: a story id is s1, s2, …`);
  if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new Error('A correction is plain text of 1 to 500 characters.');
  const fault = checkText(text);
  if (fault) throw new Error(`The correction's text: ${fault}`);
  return { day, date, story, text: text.trim() };
}
