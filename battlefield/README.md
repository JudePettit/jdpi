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
  they were CShapes 2.0 (CC BY-NC-SA, non-commercial). Its two files (`history/data/borders.topo.json` and `history/names.mjs`),
  read by no page or script since 21 November 2026, when War Focus left them too, were removed on 22 November 2026
  with the owner's agreement.
- **Old addresses:** a link written before the change still opens the same view: `w=c<number>` opens the same war, or
  the whole war it was part of (`oldIds`, `oldWithin` in `history/data/wars.json`); a war no longer listed says so in
  plain words (`oldGone`); `c=<number>` opens the country it stood for (`oldCountries` in `history/data/places.json`),
  and a number UCDP gave two states opens the one of the year shown (`history/old-countries.js`, which the coverage
  report reads too).
- **Unplaced:** a state with no Cliopatria row of its own in a year is named under the map, above the table and in a
  war's panel ("VM cannot place this on a free border for …"), never drawn on another state's row or on a part's
  (occupied Yugoslavia, 1941–44; Palestine, whose only row from 2014 is Gaza's).
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
- **Borders (since 21 November 2026):** Cliopatria v0.2.1 (Bennett et al. 2025, CC BY 4.0), the Omni-Map's files in
  `omni/data/borders/`, cut into spans of years by `scripts/build-borders.mjs` (`data/borders/<from>-<to>.topo.json`
  and `index.json`, each under 110 KB gzipped, no point moved or removed), drawn as the Retrospective Battlefield draws
  them: its rule for which rows are drawn (`scripts/history-places.mjs`) and its crosswalk from Cliopatria's rows to
  Wikidata items (`history/data/places.json`). One border a year: a month shows its year's border, so a border that
  changed within a year cannot be shown (the page says so under the map). Cliopatria ends in 2024: 2025 and 2026 are
  drawn on 2024's borders, and the caption and Sources line say so. Small states Cliopatria has no row for are dots at
  Natural Earth's points (`omni/data/base/small-states.json`, public domain); Vanuatu has no such point, so a war that names it lists it.
  Until 21 November the borders were CShapes 2.0 (CC BY-NC-SA 4.0, non-commercial), month by month.
- **States are Wikidata items:** every side, theatre and control entry (`scripts/wars.mjs`), the built files
  (`data/wars/<id>.json`: `sides`, `theatre`, `control`, `names`, `unplaced`) and the picked state (`#c=<Q-id>`) are
  Q-ids. A dated membership keeps its dates at their precision; the Bosnian War's Yugoslavia is the SFRY (Q83286) to 26
  April 1992 and the FRY (Q838261) from 27 April. No Gleditsch–Ward number is read, joined or shown. An old address or
  focus with a number (`c=<number>`, Kino's and Documentary mode's `gw:<number>`) opens the same state: the number is
  read as its Q-id for the year shown (`oldCountries` in `history/data/places.json`, through `history/old-countries.js`).
  A number War Focus itself used before 21 November 2026 that the Battlefield's table lacks, or gives another state for
  War Focus's years (255 Germany, 552 Zimbabwe in 1939–45 and 1998–2003, 713 Taiwan under Japanese rule to 1945, and
  48 more), is in `focus/old-numbers.mjs`, each the Q-id the conversion gave it in `scripts/wars.mjs` for the years of
  the wars that used it; so is a number of War Focus's previous border file (CShapes 2.0, removed on 22 November 2026) for the
  years it drew it under that state's name where the Battlefield's table has none (265 East Germany, 315
  Czechoslovakia; third review R5). War Focus reads a run only in its own years, then the Battlefield's table (loaded
  only when a number is asked for; R4), the Battlefield after its own (second review X4).
- **States with no free border:** a state taking part with no Cliopatria row of its own that year (and no dot) is listed
  under the map, above the battles and months tables and in the war's panel, "VM cannot place … on a free border for
  <year>", in its side's colour, and still counted on its side. It is never drawn on a guessed shape, on today's border
  or through another state's row. The list for each year is in each war file's `unplaced`. Under the map the line groups
  the states by what they are that month, in words (each side by its label, "held by" a side, "contested", "on no side"),
  and says that a state in a side's list is still counted with it only where that is so.
- **Whose land a row draws** (`scripts/lands.mjs`, 21 November 2026; each war file's `lands`, by year): Cliopatria
  places occupied, annexed or administered land inside the holder's row, and a row can be only a far-off fragment of its
  state. So that no part, puppet or occupier stands in for a whole state:
  - a state whose rows hold less than a tenth of their area in the nearest other years is only a fragment (Denmark of
    1940, the Faroes; Norway of 1941–44, Jan Mayen; Italy of 1944, its Tianjin concession): it is listed with the states
    VM cannot place, and the fragment is drawn uncoloured (`parts`);
  - a polygon of another row that lies half or more inside a war state's own land (its rows in the nearest year, within
    twelve, that it is whole) is drawn uncoloured, with a dotted edge, when that land is the larger share of the war
    state's territory than of the row's own (`left`): the United States' part over South Vietnam (1967–75) and over Iraq
    (2006–11), Norway and Libya inside Nazi Germany's row of 1942, Greenland in the United States' row of 1943–44;
  - likewise a polygon of a war state's own row that lies half or more on the land of a state outside the war (its
    rows in the nearest years before and after, each within twelve, so land that
    changed hands for good, as Kaliningrad, Crimea in 2024, Goa or the Dodecanese in Greece's row, stays the row's) and is the smaller
    share of that war state's land, or a speck wholly on it (Nazi Germany's on Mallorca in 1939; third review R2): Japan
    in the United States' row of 1950–53 (the Korean War: Tokyo is never drawn as the United States), Oman, Qatar and
    Bahrain in Britain's row of 2001–21, the Dutch East Indies in the Empire of Japan's row of 1943–45 (second review
    X1, 22 November 2026). Where both states are drawn in the year, the land goes to the one that alone holds it in the
    latest year both are drawn (`whose`): Newfoundland is Canada's from 1949, Norway's land Norway's in 1942. The other
    state's land is read on its main rows only (each a tenth or more of its land that year), never on a row listed in
    `NOT_REFERENCE` or for a place in `NOT_HOLDER`, so no land is named another's falsely: Cabinda, which the
    crosswalk's Cabinda-only rows of 1979–2024 file under Portugal, stays Angola's; France's polygons of 1991 on the
    Comoros and Mayotte are not named Cape Verde's (its row also draws the Comoros); no part is named the British
    Colonial Empire's or the British Overseas Territories' (groupings of a state's dependencies);
  - each such part is its own entry, naming its own state and the year of that state's border it was measured
    against, so one row can hold several (Nazi Germany's of 1942: Norway's of 1940, Libya's of 1953, Yugoslavia's of
    1940); pointing at it names that state (second review X5), and where less than nine tenths of the polygon lies on
    that land it says only part of the shape does (Japan's Timor of 1943, Portugal's in part; third review R1);
  - Cliopatria's rows are dissolved shapes, so land joined to its holder (France and Poland inside Germany in 1942,
    Serb-held Bosnia inside Serbia-Montenegro in 1992–95, Burma inside the British Raj) is in the same polygon and cannot
    be cut out without drawing another year's border; where a quarter or more of a war state's land lies in another
    place's coloured polygon, the line under the map names it ("Part of this state lies inside another state's shape on
    Cliopatria's border for 1994: Bosnia and Herzegovina (inside Serbia-Montenegro)") (`inside`).
- **Names of a year:** the Second World War's Yugoslavia is drawn on the rows the Battlefield files under the Socialist
  Federal Republic (Q83286) and named the Kingdom of Yugoslavia (Wikidata Q191077, its label, dissolved 1945) to 1945
  (`nameAs` in `scripts/wars.mjs`); the Battlefield's own crosswalk still keys Cliopatria's Yugoslavia rows of 1920–45 to
  Q83286. Japan's Taiwan in the wars with Japan is Q137816, Taiwan under Japanese rule, not Q865 (which Wikidata dates
  from 1912 as the Republic of China).
- **What was lost in the move** (`warfocus-borders-compare.tsv`, each war at its first, middle and last month, 117
  checks; counted again on 22 November 2026): 475 states drawn on CShapes, 272 on Cliopatria; 198 moved to "cannot
  place", 1 drawn only now. The largest
  are colonies and occupied states Cliopatria holds within their rulers' rows: Sudan and Libya in the Second World War,
  Algeria in the Algerian War, Indonesia in 1945, Angola in 1975, Korea and Taiwan in the wars with Japan, Kuwait in the
  Gulf War. Cliopatria's own rows place some land with another state: its "Kingdom of Great Britain" row (1969–2023)
  holds Oman, Qatar and Bahrain, so War Focus's theatre boxes give those parts to the states whose land they are, not
  to Britain, and the map leaves them uncoloured (`stateBoxes`, `scripts/rules.mjs`, with `whose`, `scripts/lands.mjs`;
  a part on land a state outside the war holds by its reference land gives no box either, `holder`: Japan's over Java);
  its United States row of 2006–2023 covers Iraq, its United States row of 1967–2005 covers South Vietnam, and its
  Honduras row of 1979–1991 covers El Salvador, so Iraq (2006–11), South Vietnam (1967–72) and El Salvador are listed,
  not drawn, and the United States' parts over them are left uncoloured; Bosnia and Herzegovina in 1992–95 is drawn only
  as the small row Cliopatria gives it, the rest named inside Serbia-Montenegro. The months of a year now share its border, so a change within a year
  (an annexation or an armistice line) shows only in the years Cliopatria gives it. Natural Earth names the Holy See's
  point "Vatican". The coverage report counts the Second World War's Puerto Rico within the United States now (one
  Wikidata item). Month by Month no longer reads the Soviet Union as Russia (Khalkhin Gol, the Winter War, the Second
  World War) or Yugoslavia as Serbia (the Second World War), since neither is a National Analysis country, and now
  reads Germany in the Second World War.
- **Rebuild the states only** (names, lands and the states VM cannot place, from `scripts/wars.mjs`; reads Wikidata's
  labels for states the Battlefield's places do not name, and a `nameAs` item's dissolution, cached in
  `<folder>/state-names.json`):
  ```
  node battlefield/focus/scripts/build.mjs --sides-only --cache <folder>
  ```
- **Rebuild the borders** (only when the Omni-Map's Cliopatria files change; a test checks each span against their
  sha256):
  ```
  node battlefield/focus/scripts/build-borders.mjs
  ```
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
