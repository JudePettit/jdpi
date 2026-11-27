// The names VM keeps for battles where Wikidata's English label has lately been changed away from the name the
// battle's English Wikipedia article gives: one table, read by War Focus's build (battlefield/focus/scripts/build.mjs,
// which passes it to scripts/rules.mjs battlesFromRows) and by the Omni-Map's battles layer
// (omni/scripts/build-battles.mjs, which exports it as before). A name added here holds on both pages from their next
// builds. Each entry gives its sources.

/** { Q: name }, before Wikidata's English label on both pages.
    The killing of Yahya Sinwar (Q130549291): Wikidata's English label was set to "Shahadat of Yahya Sinwar" on 24
    November 2026 by a temporary account; before that it read "killing of Yahya Sinwar", as its en-us label still does,
    and the item's English Wikipedia article is "Killing of Yahya Sinwar" (its enwiki sitelink; all read 26 November
    2026). The edit was reverted on 27 November 2026 (Wikidata revision 2575432683, read that day), so the label agrees
    again today; the entry stays, so that a label changed again does not reach either page unseen. */
export const NAMES = {
  Q130549291: 'killing of Yahya Sinwar',
};
