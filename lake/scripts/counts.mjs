// An entity's count of appearances, kept right by --only (build.mjs, onlyMerge). A record's `total` counts every
// mention its modules gave, while its `mentions` keep each place once and only the first 300 in module order, so the
// list alone cannot say how many a module gave: a country the Retrospective names many times on one page, or a
// module's mentions past the 300th. `n` holds the count of every module whose mentions the list does not show in
// full ({ module: count }, only those modules; most records have none), so --only can take a module's old share out
// of the total and put its new one in, whatever the cap (until November 2026 it took out only the share the list
// showed, so a book's appearance past the cap was counted twice).

// The modules a record's kept list shows short: given every mention (`module`) and the kept places (`m`).
export function shortCounts(all, kept) {
  const given = {}, shown = {}, n = {};
  for (const x of all) given[x.module] = (given[x.module] || 0) + 1;
  for (const x of kept) shown[x.m] = (shown[x.m] || 0) + 1;
  for (const [m, c] of Object.entries(given)) if (c !== (shown[m] || 0)) n[m] = c;
  return n;
}

// A module's count on a record: from `n` when the list shows it short, else from the list.
export const countOf = (r, m) => r.n?.[m] ?? (r.mentions || []).filter(x => x.m === m).length;

// A record committed without `n` whose total exceeds the places it lists (1,139 of them in the build of 15 November
// 2026, made before `n` existed) cannot say which module gave the extra mentions. --only may still recount it when its
// own modules gave each place once (then the list shows their share in full), and must not otherwise: it would take out
// only the share the list shows and count the rest twice. The adapters that name one entity more than once at one place
// (the sweep's offline run of every adapter, 16 November 2026: Retrospective 1,386 times, the calendars 32, the
// Invention Timeline 2; Learning and Kino can resolve two titles to one ID at one place) are never taken to.
export const REPEATING = new Set(['retrospective', 'calendar', 'progress', 'learning', 'kino']);
/** Whether --only of `adapters` (names in ADAPTERS) can recount `old` from its list: it lists every place it was given
 *  (`n`, or a total no greater than its places), or the run's own mentions of it (`mine`, with `module` and `url`) name
 *  each place once, no adapter of the run is REPEATING, and the list is not at the 300-place cap. */
export function canRecount(old, adapters, mine = []) {
  if (old.n || !(old.total > (old.mentions || []).length)) return true;
  if ([...adapters].some(a => REPEATING.has(a)) || (old.mentions || []).length >= 300) return false;
  const seen = new Set();
  for (const x of mine) { const k = x.module + x.url; if (seen.has(k)) return false; seen.add(k); }
  return true;
}

// --only's total and `n` for a record other modules mention too: `old` the committed record, `own` the modules this
// run speaks for, `mine` this run's mentions of the entity (`module`), `merged` the kept places of the new record.
// `adapters`, when given, are the run's adapters: a record canRecount refuses throws, naming it (build.mjs collects
// every one and stops, as its other guards do, unless --allow-drop).
export function recount(old, own, mine, merged, { adapters = null } = {}) {
  if (adapters && !canRecount(old, adapters, mine)) {
    throw Object.assign(new Error(`${old.q || 'a record'} ${old.label || ''}: total ${old.total} over ${old.mentions.length} places and no n; --only ${[...adapters].join(',')} cannot say which module gave the rest (wait for the full build)`.replace(/\s+:/, ':')), { record: old.q });
  }
  const was = [...own].reduce((s, m) => s + countOf(old, m), 0);
  const given = {}, shown = {}, n = {};
  for (const x of mine) given[x.module] = (given[x.module] || 0) + 1;
  for (const m of new Set([...(old.mentions || []).map(x => x.m), ...Object.keys(old.n || {})])) if (!own.has(m)) given[m] = countOf(old, m);
  for (const x of merged) shown[x.m] = (shown[x.m] || 0) + 1;
  for (const [m, c] of Object.entries(given)) if (c !== (shown[m] || 0)) n[m] = c;
  return { total: old.total - was + mine.length, n };
}
