/* Augmented Reading in the reader's address: `&ar=1` after the seven keys lib/hash.js reads and writes. Pure (no DOM),
   so the tests read and write it in Node. readHash and writeHash are not touched: with the mode off the address is
   exactly what writeHash gives, and readHash ignores the extra key (URLSearchParams keeps it, and readHash asks only
   for its own seven). Whether the pane is held needs no key: it is held exactly when the address has t= or pane=vm. */

/** { ar } from a hash (with or without its #): ar=1 (or true, on, yes) turns the mode on; anything else is off. */
export function readMode(hash) {
  const v = (new URLSearchParams(String(hash || '').replace(/^#/, '')).get('ar') || '').trim().toLowerCase();
  return { ar: v === '1' || v === 'true' || v === 'on' || v === 'yes' };
}

/** The hash writeHash gave, with the mode added at the end ('' stays '': no book, no address). An `ar` already in it
    is dropped first, so the result is canonical whatever it is given. */
export function writeMode(hash, { ar = false } = {}) {
  const h = String(hash || '');
  if (!h || h === '#') return h;
  const parts = h.replace(/^#/, '').split('&').filter(p => p && !/^ar(=|$)/i.test(p));
  if (ar) parts.push('ar=1');
  return `#${parts.join('&')}`;
}
