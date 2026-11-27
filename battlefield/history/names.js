/* The Retrospective Battlefield's name for a place in a year. One rule for every reader of
   battlefield/history/data/places.json: the page (app.js: the table, a war's panel, a country's heading, the pointer's
   sentence and the list under the map), the build (battlefield/scripts/history-places.mjs) and the tests.
   A place `p` is places.json's { n, since?, stateFrom?, was? }:
   · `was` [{ n, from?, to }]: the earlier states' names, oldest first, each to its last year (and from its first year
     where that leaves a gap after the name before it, or after 1926): the build's, from history-places.mjs NAMED_AS.
   · `since`: Wikidata's earliest inception (P571) of the place's item, where after 1926; where the item has none, the
     year Wikidata ends the country (P17) that held the place's land (history-places.mjs SINCE_FROM: Western Sahara
     from 1976, when Spanish Sahara ended), so 1975 is "today’s Western Sahara".
   · `stateFrom`: the year Wikidata shows the state of this name existed from, where its inception is a later change of
     regime (Kuwait: a sovereign state from 1961, its item's inception the liberation of 1991): history-places.mjs
     STATE_FROM.
   The name of year y is the earlier state's name that covers y; else the place's own name, as "today’s …" when y is
   before the state of that name existed (the land then, a colony or a territory, not a state of that name).
   A year in which one name gives way to another keeps the earlier name VM holds, since the year began with it (the
   Kingdom of Serbs, Croats and Slovenes in 1929, the State of Greater Lebanon in 1926, the Malayan Union in 1948). A
   state's first year is its own where VM holds no earlier state for that year, since the land before was a colony or
   a territory, not a state of a name VM gives: Algeria in 1962 (`since`), the Dominion of Ceylon in 1948 (`from`),
   Kuwait in 1961 (`stateFrom`). So "today’s …" is said only of years wholly before the state of that name. (Second
   review, 25 November 2026: whether the year of a colony's independence should rather be "today’s …" is for the
   owner; the build would then write a first full year, the inception's year plus one where it is not 1 January.)
   A state that is gone is never "today’s": the build stops unless it has an earlier name for such years
   (history-places.mjs goneUnnamed). */

/** The earlier state's name a place has in year y, or null. A name with no `from` runs from the year after the name
    before it (or from the first year, for the first): the Federation of Malaya from 1949, not before the Malayan Union. */
export const earlierName = (p, y) => {
  const was = p?.was || [];
  for (const [i, w] of was.entries()) {
    const from = w.from ?? (i ? was[i - 1].to + 1 : -Infinity);
    if (from <= y && y <= w.to) return w.n;
  }
  return null;
};

/** True where the place's name in year y is the land of today, not a state of then. */
export const isToday = (p, y) => !earlierName(p, y) && (p?.stateFrom ?? p?.since) > y;

/** A place's name in year y, without "today’s": its earlier state's, else its own (Wikidata's English label). */
export const nameIn = (p, y) => earlierName(p, y) || p?.n || null;

/** A place's name in year y as the page says it: "today’s …" where the place was not yet a state of that name. */
export const placeName = (p, y) => {
  const n = nameIn(p, y);
  return n && isToday(p, y) ? `today’s ${n}` : n;
};
