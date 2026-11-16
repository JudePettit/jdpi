// War Focus: which side a state was on, at a date and over a period (16 November 2026). Pure functions, no DOM: app.js
// draws the map with them, and tests/warfocus.test.mjs tests them in Node. Over a period every month between the
// handles is read, as the other slider maps do (the Kardashev Tracker's periodPowers, commit 7bfe77d): a state on a side
// at any month of the period is shown, and a change at any month is marked, not only a difference between the ends.

export const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

/** A state's place in a war at a date: 'occ-a'/'occ-b' (wholly occupied, held by that side), 'side-a'/'side-b',
 *  'theatre' (the contested state of a civil war), or '' (not at war). Occupation comes first. */
export function sideOf(war, gw, date) {
  for (const c of war.control || []) if (c.gw === gw && inRange(date, c.from, c.to)) return 'occ-' + c.side;
  for (const s of ['a', 'b']) if ((war.sides?.[s]?.states || []).some(x => x.gw === gw && inRange(date, x.from, x.to))) return 'side-' + s;
  if ((war.theatre || []).includes(gw)) return 'theatre';
  return '';
}

/**
 * Each state's sides over a period's months (`dates`: [{ m: 'YYYY-MM', d: the date read for it }], in order): Map gw →
 * { last (its side in the last month), runs: [{ side, from, to }] (months in a row on one side, not-at-war left out),
 * changed (its side or occupation differs between any two months), held (the last side it held in the period),
 * earlier (on a side in the period but not in its last month: drawn faded, in the side it last held) }.
 */
export function periodSides(war, gws, dates) {
  const out = new Map();
  for (const gw of gws) {
    const runs = [];
    let prev = null, changed = false, held = '';
    for (const { m, d } of dates) {
      const s = sideOf(war, gw, d);
      if (prev !== null && s !== prev) changed = true;
      if (s) { const r = runs.at(-1); if (r && r.side === s && prev === s) r.to = m; else runs.push({ side: s, from: m, to: m }); held = s; }
      prev = s;
    }
    const last = prev ?? '';
    out.set(gw, { last, runs, changed, held, earlier: !last && !!held });
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
/** A run's months in words: "Jun 1940 – Aug 1943", or one month. */
export const runText = r => (r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`);
