/* The narrator in the reader's address: `&ar=1` (the AR Reader: the narrator with the pane following it) or, since
   17 November 2026, `&reader=1` (the Reader: the same narrator without the pane), after the seven keys lib/hash.js
   reads and writes. Pure (no DOM), so the tests read and write it in Node. readHash and writeHash are not touched: with
   both off the address is exactly what writeHash gives, and readHash ignores the extra keys (URLSearchParams keeps
   them, and readHash asks only for its own seven). The two are never both on: an address carrying both is the AR
   Reader, so one written before the Reader existed means what it meant. Whether the pane is held needs no key: it is
   held exactly when the address has t= or pane=vm. */

const on = (q, k) => ['1', 'true', 'on', 'yes'].includes((q.get(k) || '').trim().toLowerCase());

/** { ar, reader } from a hash (with or without its #): ar=1 or reader=1 (or true, on, yes) turns one on; anything else
    is off; ar wins over reader. */
export function readMode(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const ar = on(q, 'ar');
  return { ar, reader: !ar && on(q, 'reader') };
}

/** The hash writeHash gave, with the mode added at the end ('' stays '': no book, no address). An `ar` or `reader`
    already in it is dropped first, so the result is canonical whatever it is given; asked for both, it writes ar. */
export function writeMode(hash, { ar = false, reader = false } = {}) {
  const h = String(hash || '');
  if (!h || h === '#') return h;
  const parts = h.replace(/^#/, '').split('&').filter(p => p && !/^(ar|reader)(=|$)/i.test(p));
  if (ar) parts.push('ar=1');
  else if (reader) parts.push('reader=1');
  return `#${parts.join('&')}`;
}
