// War Focus: how a death figure is written. A month marked as estimated (scripts/build.mjs) is a share of a yearly
// (PRIO) or whole-war (Correlates of War) total, spread over its months by the battles or UCDP events recorded in each,
// so it is no count of people: it is shown rounded and marked ~. A month, or a period of months, to two significant
// figures; a running or whole-war total that includes such months to three (it gathers many months, and the sources'
// own totals carry more digits than any one month's share); a running total of one month is that month, written as one.
// A recorded count (UCDP's events) stays as it is.
// Pure functions, no DOM: app.js uses them, and tests/warfocus.test.mjs tests them in Node.

/** n rounded to `digits` significant figures (a number below 10^digits is unchanged). */
export function sig(n, digits) {
  if (!Number.isFinite(n) || n === 0) return n;
  const k = 10 ** (Math.floor(Math.log10(Math.abs(n))) + 1 - digits);
  return k <= 1 ? Math.round(n) : Math.round(n / k) * k;
}

const whole = n => Math.round(n).toLocaleString('en-GB');

/** A figure as written: `est` marks one built on estimated months; `total` a running or whole-war total. */
export function deaths(n, est, { total = false } = {}) {
  return est ? `~${whole(sig(n, total ? 3 : 2))}` : whole(n);
}

/** Whose estimate a war's ~ figures are, from its deathsSource (scripts/build.mjs writes it), in a few words. */
export function estimateOf(source) {
  const s = String(source || '');
  if (/^Correlates of War/.test(s)) return 'Correlates of War’s war total';
  if (/PRIO/.test(s)) return 'PRIO’s yearly totals';
  return '';
}
