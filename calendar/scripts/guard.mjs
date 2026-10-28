// The calendar build's guard: a source that fails (Wikidata down, a list renamed) must not quietly wipe out a type of
// event. build-events.mjs stops before writing if any type had more than `over` events in the last build and would
// lose more than half of them, so the daily workflow fails instead of committing.

/** The types that would shrink like that, as "summit 649 → 12". */
export function lostTypes(before, after, over = 20) {
  const tally = list => list.reduce((n, e) => { n[e.type] = (n[e.type] || 0) + 1; return n; }, {});
  const [was, now] = [tally(before), tally(after)];
  return Object.keys(was).filter(t => was[t] > over && (now[t] || 0) < was[t] / 2).map(t => `${t} ${was[t]} → ${now[t] || 0}`);
}
