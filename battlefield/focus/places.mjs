// War Focus: where a war's states are drawn, on Cliopatria's borders (21 November 2026). Pure functions, no DOM: the
// page (app.js), the build (scripts/build.mjs) and tests/warfocus.test.mjs share them. Rows are placed through the
// Retrospective Battlefield's crosswalk (battlefield/history/data/places.json `rows`, written by
// battlefield/scripts/build-history.mjs from history-places.mjs), never a second one: a state is drawn in a month
// only on a Cliopatria row of that month's year whose place is the state's own Q-id. A state no row holds that year
// is listed as one VM cannot place on a free border, never drawn on a guessed shape, on today's border, or through a
// part or a puppet (a German row holds the Netherlands in 1941; the Netherlands is listed, not drawn as Germany).

/** The year whose border a month (YYYY-MM or a date) is drawn on: its own, or Cliopatria's last (2024) after it. */
export const borderYear = (month, bordersTo) => Math.min(+String(month).slice(0, 4), bordersTo);

/** A Cliopatria row VM fills: a polity, not a composite (its name in brackets), with a shape (history-places.mjs). */
export const drawnRow = f => f.properties.k === 'POLITY' && !/^\(.+\)$/.test(f.properties.n || '') && !!f.geometry;

/** The place (a Q-id) of a Cliopatria row in year y, from places.json `rows`: a Q-id, or runs [[from, to, Q], …]. */
export function rowPlace(rows, id, y) {
  const v = rows?.[id];
  if (typeof v === 'string') return v;
  return Array.isArray(v) ? v.find(([a, b]) => a <= y && y <= b)?.[2] || null : null;
}

/** The span file of the borders index (data/borders/index.json) that holds year y. */
export const spanOf = (index, y) => index.spans.find(s => s.from <= y && y <= s.to) || null;

const meets = (from, to, a, b) => (!from || from <= b) && (!to || to >= a);
/**
 * The states of a war (a built war file: sides.{a,b}.states [{ q, from, to }], theatre [Q], control [{ q, side, from,
 * to }]) on a side, contested or occupied at some day from a to b (ISO dates, inclusive). Returns a Set of Q-ids.
 */
export function warStatesIn(war, a, b) {
  const out = new Set();
  for (const s of ['a', 'b']) for (const x of war.sides?.[s]?.states || []) if (meets(x.from, x.to, a, b)) out.add(x.q);
  for (const q of war.theatre || []) out.add(q);
  for (const c of war.control || []) if (meets(c.from, c.to, a, b)) out.add(c.q);
  return out;
}

/** Every state a war's definitions name, in any month. */
export const warStates = war => warStatesIn(war, '0000-01-01', '9999-12-31');

/**
 * The war's states that no drawn row of year y holds (`placed`: the Set of Q-ids drawn that year, rows and the small
 * states' points), among those taking part at some day of year y within the war's own dates. Sorted by Q-id number.
 */
export function unplacedIn(war, y, placed) {
  const a = `${y}-01-01` < war.start ? war.start : `${y}-01-01`, end = war.end || '9999-12-31', b = `${y}-12-31` > end ? end : `${y}-12-31`;
  if (a > b) return [];
  return [...warStatesIn(war, a, b)].filter(q => !placed.has(q)).sort((p, q) => +p.slice(1) - +q.slice(1));
}

/**
 * The war's states VM cannot place in the days a to b (ISO dates, the months shown): for each year of them, the states
 * the build found no row for that year (war.unplaced { year: [Q] }, from unplacedIn) that take part at some day of that
 * year within a to b. Returns [[year, [Q, …]], …], years in order, only those with a state.
 */
export function unplacedShown(war, a, b) {
  const out = [];
  for (let y = +a.slice(0, 4); y <= +b.slice(0, 4); y++) {
    const ya = `${y}-01-01` < a ? a : `${y}-01-01`, yb = `${y}-12-31` > b ? b : `${y}-12-31`, on = warStatesIn(war, ya, yb);
    const qs = (war.unplaced?.[y] || []).filter(q => on.has(q));
    if (qs.length) out.push([y, qs]);
  }
  return out;
}

/**
 * The name of a state for a year: its own (`names`, the war file's { Q: { n, since } }), or "today's …" where Wikidata
 * dates it after that year (the land, not a state of then), as the Retrospective Battlefield says it; or, to the year
 * `then.to`, the earlier state's name the war gives it (`then`, scripts/wars.mjs nameAs: the Kingdom of Yugoslavia).
 */
export const stateName = (names, q, y) => {
  const n = names?.[q];
  if (!n) return q;
  if (n.then && y <= n.then.to) return n.then.n;
  return n.since > y ? `today’s ${n.n}` : n.n;
};

/** The one sentence the page says of states it cannot place: "VM cannot place … on a free border for <year>". */
export const cannotPlace = (what, when) => `VM cannot place ${what} on a free border for ${when}`;
