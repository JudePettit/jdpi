// Pins of what a live source said, for the build that read it (27 November 2026, after the refresh rehearsals).
// The deploy (pages-deploy.yml) runs the whole of package.json's "test" list on whatever a data refresh has just
// committed. A test that pins a value a refresh reads from a live source (a Wikidata label or date, a Wikipedia infobox
// figure, a UCDP release) is true for the build it was written against and false after the next build if the source
// was edited meanwhile: the deploy then fails, the site is not published, and every later push and refresh is red until
// the test is mended (a pinned election date held back four refreshes on 27 November 2026). So:
//   - a pin of a live source's value holds only while the data carries the stamp of the build it describes
//     (builtOn: the stamp's day; or the stamp itself, such as UCDP's release, where the data names one);
//   - a comparison between two stores built from live sources holds only while one was built from the other as it now
//     stands (readAfter: the reader's stamp no earlier than the stamp of what it read), or, for two independent reads,
//     while both read on the same day (sameDay);
//   - a rule is tested by a fixture, and the built data by its shape, whatever the day.
// None of this is for VM's own values (its tables, its text, its fixed releases): those are pinned outright.

/** True while `stamp` (an ISO time) falls on `day` (YYYY-MM-DD). */
export const builtOn = (stamp, day) => typeof stamp === 'string' && stamp.slice(0, 10) === day;

/** True while two or more stamps (ISO times) fall on one day. */
export const sameDay = (...stamps) => stamps.length > 1 && stamps.every(s => typeof s === 'string' && s.length >= 10 && s.slice(0, 10) === stamps[0].slice(0, 10));

/** True while the store stamped `reader` was built no earlier than the store stamped `read` that it reads. */
export const readAfter = (reader, read) => {
  const a = Date.parse(reader), b = Date.parse(read);
  return Number.isFinite(a) && Number.isFinite(b) && a >= b;
};
