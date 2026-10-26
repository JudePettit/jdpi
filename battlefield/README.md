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
