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

// --only's total and `n` for a record other modules mention too: `old` the committed record, `own` the modules this
// run speaks for, `mine` this run's mentions of the entity (`module`), `merged` the kept places of the new record.
export function recount(old, own, mine, merged) {
  const was = [...own].reduce((s, m) => s + countOf(old, m), 0);
  const given = {}, shown = {}, n = {};
  for (const x of mine) given[x.module] = (given[x.module] || 0) + 1;
  for (const m of new Set([...(old.mentions || []).map(x => x.m), ...Object.keys(old.n || {})])) if (!own.has(m)) given[m] = countOf(old, m);
  for (const x of merged) shown[x.m] = (shown[x.m] || 0) + 1;
  for (const [m, c] of Object.entries(given)) if (c !== (shown[m] || 0)) n[m] = c;
  return { total: old.total - was + mine.length, n };
}
