# Battlefield modules (JDP-I Q)

## Realtime Battlefield (`q/battlefield.html`)
- **Data:** `data/realtime.json`, built from UCDP's Candidate Events Dataset, year to date (CC BY 4.0). UCDP publishes it monthly.
- **Refresh:** `.github/workflows/battlefield-refresh.yml` runs every Monday. It calls `scripts/fetch-latest.mjs`, which finds the newest file on ucdp.uu.se/downloads and rebuilds the data when it has changed.
- **Wars:** `scripts/wars.mjs` groups UCDP conflicts into wars and warzones, with background text and news keywords. Any conflict not listed falls into "Other armed violence in <country>". New conflicts appear there until they're added to a war.
- **Text:** monthly insights are generated from the events: deaths, change on the previous month, deadliest areas, main fighting and source headlines. "In the news" searches the Global Headline Tracker's `country_top_stories` table in Supabase using the war's keywords.

## Retrospective Battlefield (`battlefield/history/`)
- **1946–2025:** UCDP/PRIO Armed Conflict Dataset v26.1 (CC BY 4.0). Intensity 1 means 25–999 battle deaths in the year; intensity 2 means 1,000 or more.
- **1926–1945:** Correlates of War Inter-State, Intra-State and Extra-State War Data v4. These lists contain only wars with at least 1,000 battle deaths.
- **Borders:** CShapes 2.0 (CC BY-NC-SA, non-commercial), shared with H&P Retrospective.
- **Rebuild:**
  ```
  node battlefield/scripts/build-history.mjs <UcdpPrioConflict_v26_1.csv> <folder with the COW CSVs>
  ```
- **Wikipedia links:** titles live in `scripts/history-wiki.mjs`. Wars without a title link to a Wikipedia search.

## Correlates of War: terms (read 16 November 2026)
VM uses the COW War Data: Inter-State v4.0, Intra-State v4.1 and Extra-State v4.0 (the Retrospective Battlefield's wars of
1926–1945, and the war totals of the nine War Focus wars before 1946). The "Terms and Conditions" at the head of
https://correlatesofwar.org/data-sets/ (read 16 November 2026; they cover every COW data set and version, and the war data
page adds no licence of its own) say, among other things:

> "Users agree to cite each of the datasets they use in the manner described on each specific dataset web page. Users
> agree not to distribute the dataset to any third party without written permission of the COW director and data host.
> Users agree to ask permission for any dissemination, posting, or other use of the data that is not covered by the above
> restrictions."

They also bar any commercial use (VM is free). The war data page, https://correlatesofwar.org/data-sets/cow-war/ (read
the same day), asks for this citation: Sarkees, Meredith Reid and Frank Wayman (2010). Resort to War: 1816–2007.
Washington DC: CQ Press. Since July 2026 the war data sets are hosted at the University of Chicago (contact on that page).

So the data may not be passed on, and posting it needs permission. What VM does (S0, 16 November 2026):
- A cited total with a link stays: War Focus's nine totals and the Retrospective Battlefield's battle deaths, each cited
  as above with the link (`sources.cow` in `history/data/wars.json` and `focus/data/index.json`, written by
  `scripts/build-history.mjs` and `focus/scripts/build.mjs`; both pages' Sources paragraphs; War Focus's panel).
- No COW row is in a download: the Integration Hub's `retrospective-wars` holds the UCDP/PRIO conflicts only.
- Held for Jude's choice, unchanged: the Retrospective Battlefield's 40 wars of 1926–1945 on the page (no allowed source
  replaces them: UCDP starts in 1946), War Focus's monthly spread of the COW totals in `war-focus-monthly-deaths`, and
  National Analysis's count of COW wars per country.
- The record, as data the tests read: `integration/scripts/cite-only.mjs` (to become `integration/sources.json` at S1).
  A careful record of the terms as read, not legal advice.
