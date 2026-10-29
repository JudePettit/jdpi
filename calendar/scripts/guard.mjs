// The calendar build's guard: a source that fails (Wikidata down, a list renamed, the Current events portal
// unreachable) must not quietly wipe out a type of event. build-events.mjs stops before writing if a type of event
// would lose more than half of its records, so the daily workflow fails instead of committing. Counting over the whole
// history alone hides the sources that feed only the present: the Current events portal fills most of the year's
// resignations, court rulings and sanctions, and Wikipedia's lists most of the outlook's summits, yet each is a small
// share of a type's records since 1980. So the types are also counted since the news start and in the outlook, and
// the news items on their own (lostEvents).
// Other modules' builds guard their output the same way, on plain counts: lostCounts and refuseIfLost.

/** Counts that would shrink too far: a key with more than `over` in `was` and less than `keep` of it in `now`, as "summit 649 → 12". */
export function lostCounts(was, now, { over = 20, keep = 0.5 } = {}) {
  return Object.keys(was).filter(k => was[k] > over && (now[k] || 0) < was[k] * keep).map(k => `${k} ${was[k]} → ${now[k] || 0}`);
}

/** Stops the build (exit code 1, nothing written) if anything was lost, unless it was run with --allow-drop. */
export function refuseIfLost(lost) {
  if (!lost.length) return;
  if (process.argv.includes('--allow-drop')) { console.warn(`Writing despite: ${lost.join(', ')} (--allow-drop).`); return; }
  console.error(`Not written: ${lost.join(', ')}. A source probably failed; --allow-drop writes anyway.`);
  process.exit(1);
}

const tally = list => list.reduce((n, e) => { n[e.type] = (n[e.type] || 0) + 1; return n; }, {});

/** The types that would shrink like that, as "summit 649 → 12". */
export function lostTypes(before, after, over = 20) {
  return lostCounts(tally(before), tally(after), { over });
}

/**
 * Everything the calendar would lose between two builds, counted four ways over the same days for both: each type over
 * the whole history (more than 20 records), each type from `from` (the news start) to `today` and each type in the
 * outlook after `today` up to `to` (more than 10 records in either), and the news items (records with the report they
 * cite, `ref`) from `from` to `today` (more than 20).
 */
export function lostEvents(before, after, { from, today, to }) {
  const recent = list => list.filter(e => e.date >= from && e.date <= today);
  const ahead = list => list.filter(e => e.date > today && e.date <= to);
  const news = list => recent(list).filter(e => e.ref).map(() => ({ type: 'news items' }));
  return [
    ...lostTypes(before, after),
    ...lostTypes(recent(before), recent(after), 10).map(x => `${x} since ${from}`),
    ...lostTypes(ahead(before), ahead(after), 10).map(x => `${x} in the outlook to ${to}`),
    ...lostTypes(news(before), news(after)),
  ];
}
