/* The Omni-Map's time control, its pure parts (Jude, 15 and 17 November 2026: a slider long enough for every year VM
   holds, back to Cliopatria's first year, with a Play button; ledger MP-08, MP-11). No DOM, no fetch: omni/app.js
   draws the control with design/prp-period.js and calls these; tests/omni.test.mjs calls them directly.

   Years are signed historical years with no year 0 (design/vm-dates.js): -1 is 1 BC and the year after it is AD 1.
     yearText(y, { bc })       '508 BC', 'AD 33' on a track that holds years before AD 1, else '1494'
     readYear(text)            what a reader types: '500 BC', '500 BCE', 'AD 33', '33 AD', '33 CE', '-500', '1494'
                               → { year } or { error: 'zero' | 'unreadable' }
     ticksFor(from, to, o)     the track's labelled years: its two ends, and round years between (every 1, 2, 5, 10, …
                               years, the smallest that keeps to o.maxLabels), none crowding an end
     playSteps(span, size)     the steps Play offers, in years (multiples of the slider's own step), and playStep, the
                               one it starts on: the smallest that crosses the years shown in about 120 steps or fewer
     nextStop(stops, at, k)    the stop Play moves to: the first at least k years after `at`; the last stop when that
                               passes it; null at the last stop (Play stops there)
     keepFiles(order, keep, n) which decoded borders files to let go of: all but the n most recently used, never one
                               in `keep` (the frame's, and the next ones Play needs) */
import { addYears, yearsBetween } from '../../design/vm-dates.js';

export function yearText(y, { bc = false } = {}) {
  if (!Number.isInteger(y) || y === 0) return '';
  return y < 0 ? `${-y} BC` : bc ? `AD ${y}` : String(y);
}

export function readYear(text) {
  const s = String(text ?? '').trim().replace(/[−‒–]/g, '-').replace(/[\s ]+/g, ' ').replace(/,/g, '').replace(/\./g, '');
  let m, y = null;
  if ((m = /^(-)? ?(\d{1,5})$/.exec(s))) y = (m[1] ? -1 : 1) * +m[2];
  else if ((m = /^(\d{1,5}) ?(BC|BCE)$/i.exec(s))) y = -m[1];
  else if ((m = /^(?:AD|CE) ?(\d{1,5})$/i.exec(s)) || (m = /^(\d{1,5}) ?(?:AD|CE)$/i.exec(s))) y = +m[1];
  if (y === null || !Number.isFinite(y)) return { error: 'unreadable' };
  if (y === 0) return { error: 'zero' };
  return { year: y };
}

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
export function ticksFor(from, to, { maxLabels = 8, minor = true, bc = from < 0 } = {}) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return [];
  const span = Math.max(1, yearsBetween(from, to));
  const label = y => yearText(y, { bc });
  const key = NICE.find(k => span / k <= Math.max(1, maxLabels)) || NICE.at(-1);
  const small = minor ? [...NICE].reverse().find(k => k < key && key % k === 0 && span / k <= maxLabels * 5) || null : null;
  const out = [{ at: from, text: label(from), kind: 'key' }];
  // A round year too close to an end would print over the end's own label: kept a label's width away (the track holds
  // about maxLabels of them), so '3400 BC' and '3000 BC' never touch on a phone.
  const room = span * Math.max(0.07, 1 / Math.max(1, maxLabels));
  const crowds = y => yearsBetween(from, y) < room || yearsBetween(y, to) < room;
  const every = small || key;
  // Round years are counted on the historical year (500 BC, AD 500), never on year 0, which does not exist.
  for (let y = Math.ceil(from / every) * every; y < to; y += every) {
    if (y === 0 || y <= from) continue;
    if (y % key === 0 && !crowds(y)) out.push({ at: y, text: label(y), kind: 'key' });
    else if (small) out.push({ at: y, text: '', kind: 'minor' });
  }
  if (to !== from) out.push({ at: to, text: label(to), kind: 'key' });
  return out;
}

const PLAY = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
export function playSteps(span, size = 1) {
  const s = Math.max(1, size);
  const out = PLAY.filter(k => k % s === 0 && (k <= Math.max(s, span) || k === s));
  return out.length ? out : [s];
}
export function playStep(span, size = 1) {
  const list = playSteps(span, size);
  return list.find(k => span / k <= 120) || list.at(-1);
}

export function nextStop(stops, at, k) {
  if (!Array.isArray(stops) || !stops.length) return null;
  const last = stops.at(-1);
  if (at == null || at >= last) return null;
  const target = addYears(at, Math.max(1, k));
  const next = stops.find(y => y >= target);
  return next ?? last;
}

export function keepFiles(order, keep, n = 4) {
  const hold = new Set(keep || []);
  const drop = [], list = [...(order || [])];
  let held = list.length;
  for (const f of list) {
    if (held <= n) break;
    if (hold.has(f)) continue;
    drop.push(f); held--;
  }
  return drop;
}
