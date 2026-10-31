// The names an entity's lake record keeps (build.mjs, record), in one place, so the Bibliotheca cast
// (bibliotheca/scripts/cast.mjs, lakeAliases) holds an item's names exactly as the next build will, and the tests check
// the rule itself (tests/bibliotheca-cast.test.mjs, tests/bibliotheca-data.test.mjs).

/** A Wikidata alias as the lake keeps it. A trailing comma, colon, semicolon or space goes ("Venice, " is Venice), and
    so does the full stop after a regnal number, I, V and X, after a name ("Alexander VI." is Alexander VI, "Leo X." Leo
    X): the tagger matches aliases as written, and a term is whole words. Any other full stop stays, since it is an
    abbreviation's or an initial's: Wikidata gives William Withering the botanist's "With.", the University of Oxford
    "Oxon.", the University of London "Lond.", Ramsay MacDonald "J. R. M.", and with the stop gone those would be the
    words "With", "Oxon", "Lond" and the initials "J. R. M", the first of which opens a sentence on nearly every page of
    every book on the Bibliotheca shelf (the monthly refresh re-tags them all against the new lake: 342 Withs). */
export const tidyAlias = s => String(s ?? '').replace(/[\s,;:]+$/, '').replace(/(\p{L}{2,}\s[IVX]+)\.$/u, '$1');

/** The aliases a record keeps: Wikidata's first six (English), tidied, less the label and repeats; then the names a
    module's own text uses (a mention's `aliases`: a book's "Duke Valentino" for Cesare Borgia), so the Bibliotheca
    tagger finds the entity in the book. */
export function recordAliases(wikidata = [], label = null, own = []) {
  const wd = [...new Set(wikidata.slice(0, 6).map(tidyAlias).filter(a => a && a !== label))];
  return [...wd, ...[...new Set(own)].filter(a => a && a !== label && !wd.includes(a))];
}
