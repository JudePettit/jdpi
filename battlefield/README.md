# Battlefield modules (JDP-I Q)

## Realtime Battlefield (`q/battlefield.html`)
- **Data:** `data/realtime.json`, built from UCDP's Candidate Events Dataset, year to date (CC BY 4.0). UCDP publishes it monthly.
- **Refresh:** `.github/workflows/battlefield-refresh.yml` runs every Monday. It calls `scripts/fetch-latest.mjs`, which finds the newest file on ucdp.uu.se/downloads and rebuilds the data when it has changed.
- **Wars:** `scripts/wars.mjs` groups UCDP conflicts into wars and warzones, with background text and news keywords. Any conflict not listed falls into "Other armed violence in <country>". New conflicts appear there until they're added to a war.
- **Text:** monthly insights are generated from the events: deaths, change on the previous month, deadliest areas, main fighting and source headlines. "In the news" searches the Global Headline Tracker's `country_top_stories` table in Supabase using the war's keywords.

## Retrospective Battlefield (`battlefield/history/`)
Free data only since 20 November 2026 (Jude's rule MP-11 of 17 November: "use only free data if possible"). Places
are Wikidata items; no Correlates of War value, CShapes border or Gleditsch–Ward number is joined.
- **1946–2025:** UCDP/PRIO Armed Conflict Dataset v26.1 (CC BY 4.0). Intensity 1 means 25–999 battle deaths in the year; intensity 2 means 1,000 or more.
- **1926–1945:** the wars Wikidata lists (CC0), with English Wikipedia's article titles (CC BY-SA 4.0), by VM's rule
  (`scripts/wars-1926.mjs`). No free source measures these wars' size, so the page shows them at one level, "a war
  Wikidata lists", and smaller ones may be missing. Until 20 November they came from the Correlates of War.
- **Borders:** Cliopatria v0.2.1 (CC BY 4.0), as VM holds it in `omni/data/borders/`; where no Cliopatria row holds a
  place that year, Natural Earth's border of today or its point (public domain, `omni/data/base/`). Until 20 November
  they were CShapes 2.0 (CC BY-NC-SA, non-commercial); `history/data/borders.topo.json` and `history/names.mjs` are
  no longer read by the page and stay only until War Focus and the Integration Hub's catalogue stop reading them.
- **Old addresses:** a link written before the change still opens the same view: `w=c<number>` opens the same war, or
  the whole war it was part of (`oldIds`, `oldWithin` in `history/data/wars.json`); a war no longer listed says so in
  plain words (`oldGone`); `c=<number>` opens the country it stood for (`oldCountries` in `history/data/places.json`).
- **Rebuild:**
  ```
  node --max-old-space-size=6000 battlefield/scripts/build-history.mjs <UcdpPrioConflict_v26_1.csv> [--cache <folder>]
  ```
- **Wikipedia links:** titles live in `scripts/history-wiki.mjs`. Wars without a title link to a Wikipedia search.

## War Focus (`battlefield/focus/`)
- **Battle deaths by month:** UCDP's Georeferenced Event Dataset (GED v26.1, CC BY 4.0) from 1989; PRIO's Battle
  Deaths Dataset v3.1 yearly totals for 1946–1988, whose page states no licence (kept until VM's owner decides); UCDP's
  Battle-Related Deaths Dataset v26.1 (CC BY 4.0) yearly totals for the years GED does not cover from 1989.
- **The nine wars before 1946** (the Northern Expedition to the Second World War) have no figure: no free source gives
  their battle deaths by month or year, and the Correlates of War totals they showed until 20 November 2026 are gone.
  Each battle's own figures, from Wikidata, are still listed.
- **Rebuild the deaths only** (from the committed files, with PRIO's and UCDP's files in the cache):
  ```
  node battlefield/focus/scripts/build.mjs --deaths-only --cache <folder>
  ```

## Correlates of War: terms (read 16 November 2026)
The "Terms and Conditions" at the head of https://correlatesofwar.org/data-sets/ (read 16 and 18 November 2026) say:

> "Data are not to be used for any commercial activity; users of COW data agree not to sell or use the data as part of
> any financial profit-making activity. […] Users agree not to distribute the dataset to any third party without written
> permission of the COW director and data host."

So since 20 November 2026 no VM data file holds a Correlates of War value: the Retrospective Battlefield's wars of
1926–1945 are Wikidata's, War Focus's nine totals are gone, and National Analysis counts the wars of 1926–45 on VM's
Wikidata list. `integration/scripts/cite-only.mjs` keeps the record of the terms and lists nothing as hosted
(`HOSTED` is empty). A careful record of the terms as read, not legal advice.
