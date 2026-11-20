# Omni-Map

The Omni-Map is Digital Science's map of dated borders and the events VM holds, opened at the right place and years
from a tagged name (PRP-SCHOLAR-USP-DESIGN.md, stage S1). This file describes its data: what each file is, where it
comes from, under what terms, how it was changed and how to rebuild it. The page itself is `omni/index.html`.

VM holds Cliopatria's borders for **every year it covers, 3400 BC to AD 2024** (1400–1600 only until 18 November
2026), and **2 battles**, both of 1400–1600. The page says so wherever a view reaches past what VM holds.

## The files

| File | What it is | Built by |
|---|---|---|
| `data/borders/<from>-<to>.topo.json`, 17 files from `m3400-m301.topo.json` to `2000-2024.topo.json` (a year below zero written m and its digits) | Cliopatria v0.2.1's rows overlapping each file's years, as TopoJSON (format `vm-borders/1`, described in `design/prp-map.js`); the page loads a file only when the frame reaches its years | `scripts/build-borders.mjs` |
| `data/borders/index.json` | The files, their years, rows, sizes and sha256, and the archive they were built from | `scripts/build-borders.mjs` |
| `data/borders/qids.json` | The crosswalk from Wikidata Q-ids to Cliopatria's names by year, and the ids rejected, with why | `scripts/build-borders.mjs` |
| `data/base/ne_110m_land.geojson` | Natural Earth 5.1.1's land at 1:110 million, unchanged: the plain base (see `data/base/README.md`) | `scripts/build-base.mjs` |
| `data/layers/battles.json` | The battles the Master Index and War Focus hold with a date and a point (1,967, 1258–2025), each value with its source | `scripts/build-battles.mjs` |
| `data/layers/wars/registry.json` | The one war registry (S5b): each war of the lake and of UCDP/PRIO ACD 26.1 once, with its ids in each, its years and its War Focus id where there is one; a UCDP conflict's years outside every War Focus war that holds it are the conflict's own war (`ucdp-<id>`), whose from and to are the years ACD records it as active (25 or more battle-related deaths); an event UCDP files under the conflict belongs to its own war in any year, so an event can fall outside those years (conflict 364 in 1989); no COW record | `scripts/build-wars.mjs` |
| `data/layers/conflict-territory/conflicts.json` | Layer 2: UCDP/PRIO ACD 26.1 and UCDP BRD 26.1 by country and year, 1946–2025 (intensity, battle deaths from 1989, the sides fighting abroad), each joined to a country by its name and ISO 3166 code, never by a GW code alone | `scripts/build-conflict-territory.mjs` (places from `scripts/ucdp-places.mjs`) |
| `data/layers/political-change/terms.json`, `elections/elections.json`, `coups/coups.json` | Layer 3: heads of state and government from Wikidata (P39), elections and referendums from the Master Index, coups from Wikidata (Q45382), each value with its source | `scripts/build-political.mjs` |
| `data/layers/retro-keys.json` | The Retrospective’s own country keys by ISO 3166 code (format `vm-addresses/1`), read from its `data/countries.json`, so a click on a country opens the Retrospective at that country | `scripts/build-political.mjs --only retro` |
| `data/layers/breakthroughs/events.json` | Layer 5: the Invention Timeline’s breakthroughs, with their disciplines as a filter | `scripts/build-breakthroughs.mjs` |
| `data/layers.json` | The layer catalogue (design 4.2): each layer's years, step, status, legend, source and method, and the `absent` lines for layers VM leaves out for want of free data | by hand for borders and battles; the S5a builders put their whole entries (`scripts/layer-catalogue.mjs`) |
| `data/layers.head.json` | The catalogue's `generated` alone: the small file every page's sidebar reads for the Omni-Map's line (`registry.json`), so the catalogue can grow without weighing on every page | written beside `layers.json` by every writer (`writeCatalogue` in `scripts/layer-catalogue.mjs`, used by `updateLayer` in `scripts/build-borders.mjs`), never by hand |
| `data/base/countries.topo.json`, `data/base/small-states.json` | Natural Earth 5.1.1's Admin 0 countries at 1:110 million as TopoJSON (177 countries, id `ne-<ADM0_A3>`, ISO 3166 alpha-3 code), and a point for each of the 64 small states only the 1:50 million map holds: the countries base (see `data/base/README.md`) | `scripts/build-countries.mjs` |
| `data/layers/wb/EN.POP.DNST.json` | The World Bank's population density (people per km² of land area), every economy and year it gives, 1961–2024 (format `vm-series/1`) | `scripts/build-wb.mjs` |
| `data/layers/density/<year>.json`, `index.json` | GHSL GHS-POP R2023A summed into 0.25° cells, one file per epoch, 1975–2030 (2025 and 2030 are projections), as `[step, people]` pairs (format `vm-grid/1`); the index lists each file's sha256 and the GHSL zip it came from | `scripts/build-density.mjs` |
| `data/layers/density-hyde/<year>.json`, `index.json` | HYDE 3.2.1's population counts (baseline) summed into the same 0.25° cells, 48 epochs from 4000 BC to 1970 (a year BC is named m and its digits: `m4000.json`), on the GHSL grid's classes; the index names each file's archive entry and the archive's sha256 | `scripts/build-density-hyde.mjs` |

VM's sources, with their terms as read, are in `integration/sources.json` (design 5.1).

Sizes, 18 November 2026 (gzip level 9): the 17 borders files come to 12,987,328 bytes (3,040,791 gzipped), from
`m3400-m301` (538 rows, 386,180 bytes, 87,896 gzipped) to the largest, `1800-1899` (1,745 rows, 1,857,657 bytes, 449,310
gzipped); `1400-1499` is 758,803 bytes (179,888 gzipped), byte for byte the file of 17 November. `index.json` lists each
file's rows, bytes and gzipped bytes. The design's limit is 1.5 MB compressed per borders file (7.3), and 1.5 MB for the
whole default view, MapLibre included; only the frame's file loads. How the years were split: each century built alone
was measured first (from 572 bytes gzipped for 3400–3301 BC, one row, to 449,310 for the 1800s), and centuries were
joined, from the first, while their sizes alone added up to no more than 200,000 bytes gzipped (`JOIN_GZ` in the
builder), so the early millennia are a few small files; no century needed splitting, and nothing is simplified.

## Sources and terms

Each source's own licence or terms were opened and read on 17 November 2026 before its data was used.

**Cliopatria** (Seshat Global History Databank), release tag **v0.2.1** of 3 October 2026, "Updates to polities and
wikidata in response to issues": the archive `cliopatria.geojson.zip` in the tag
(https://github.com/Seshat-Global-History-Databank/cliopatria/tree/v0.2.1; 46,005,176 bytes, sha256
`e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4`, git blob `a1e7093b64990bf97cd3c31bda96de1cafed822c`),
holding one file, `cliopatria_polities_only_v021.geojson`. Zenodo: https://doi.org/10.5281/zenodo.23128623 (v0.2.1,
2026-10-03, creators Ed Chalstrey and James Bennett, licence cc-by-4.0). Its LICENSE.md at the tag
(https://github.com/Seshat-Global-History-Databank/cliopatria/blob/v0.2.1/LICENSE.md) says: "This data is licensed under
a Creative Commons Attribution 4.0 International License, which permits use, sharing, adaptation, distribution and
reproduction in any medium or format, as long as you give appropriate credit to the original author(s) and the source,
provide a link to the Creative Commons license, and indicate if changes were made."

The credit VM gives, as CC BY 4.0 asks (credit, a link to the licence, and the changes):
- Short, in the legend: "Borders: Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager".
- Long, in the method note and here: Cliopatria v0.2.1, Ed Chalstrey and James Bennett, Seshat Global History Databank,
  Zenodo, https://doi.org/10.5281/zenodo.23128623, described in J. S. Bennett et al., 'Cliopatria - A geospatial database
  of world-wide political entities from 3400BCE to 2024CE', Scientific Data 12, 247 (2025),
  https://doi.org/10.1038/s41597-025-04516-9. Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
- Changes by Vitruvian Manager: every row, 3400 BC to AD 2024, in 17 files by years (a row spanning two files is in
  both), converted to TopoJSON quantised to 1/100,000 of each file's extent (points that then coincide are merged; no
  simplification), with a row id added.

What CC BY 4.0 asks, as Cliopatria's LICENSE.md puts it: appropriate credit to the original authors and the source, a
link to the licence, and a statement of any changes. The three lines above are VM's answer to each.

**Natural Earth**, release v5.1.1 (13 May 2022), `geojson/ne_110m_land.geojson`. Public domain: "All versions of
Natural Earth raster + vector map data found on this website are in the public domain. You may use the maps in any
manner, including modifying the content and design, electronic dissemination, and offset printing."
(https://www.naturalearthdata.com/about/terms-of-use/ and LICENSE.md at the tag). No credit is required; VM gives the one
it offers: "Made with Natural Earth."

**Wikidata**, read 17 November 2026 for the battles' dates, points and references. "All structured data (i.e. the main,
Property, Lexeme, and EntitySchema namespaces) is released into the public domain under Creative Commons Zero."
(https://www.wikidata.org/wiki/Wikidata:Licensing). Credit: "Wikidata (CC0)", with each value's item and property.

**topojson-server** 3.0.1 (Mike Bostock), used by the borders builder only, never served: a script-only
devDependency. Its LICENSE (ISC): "Permission to use, copy, modify, and/or distribute this software for any purpose with
or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies."

**MapLibre GL JS** 5.24.0 (npm, 23 April 2026), read 17 November 2026, draws the map; VM hosts no copy. Its LICENSE.txt
(https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/LICENSE.txt, BSD 3-Clause, © MapLibre contributors):
"Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met". `omni/index.html` loads it from cdn.jsdelivr.net at that exact version with its
Subresource Integrity hashes (js `sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp`, css
`sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK`, computed from the jsDelivr, unpkg and npm
copies, which agree byte for byte), so a changed file is refused. 5.24.0, not 6.x: 6.x ships a separate worker file a
hash cannot cover; 5.24.1 (11 November 2026) only changes attribution handling, which VM does not use (its attribution
control is off and the page writes its own credits); move to it after 25 November with a new hash. When the library
cannot load (blocked, or refused by its hash) the page says "The map library (MapLibre GL JS 5.24.0, from
cdn.jsdelivr.net) could not load, so the map cannot be drawn. What the map would show is listed below."; without WebGL,
"This map needs WebGL, which this browser does not have or has turned off. What the map would show is listed below."
In both cases the legend, the slider, the lists and the three actions still work. Credit, in the method text and the
legend: "Map drawn with MapLibre GL JS 5.24.0 (BSD 3-Clause)". It is recorded in `integration/sources.json` as `maplibre`.

No value from a source whose terms bar passing its data on ("cite-only": the Correlates of War) is held under
`omni/data`; `tests/omni-data.test.mjs` scans every file there.

## Method

**Borders.** Cliopatria draws a polity where one or more written sources attest to it and indicate its location and
extent in particular years, so a polity that no written source attests, such as the Xia Dynasty before 1600 BC in the
paper's example, is not drawn; with rare exceptions a polity occupies
at least 5,000 km² and lasts at least 50 years (its paper). Its README warns that the maps "reflect only one version of
the territory held by past polities", and the paper that the dataset does not encode border uncertainty or territorial
disputes. Its rows carry no field naming which atlas or regional source each outline came from (the paper lists its
sources by region). Its README calls it a dataset of worldwide polities from 3400 BCE to 2024 CE, with over 1,600
political entities sampled at varying timesteps and spatial scales; release v0.2.1 holds 13,797 rows, and fewer than
20 in any century before 800 BC, so the map shows few polities in those years. These are a research dataset's
borders, made to compare polities across the world and five thousand years: coarser than a survey's, and no line on
the map is a surveyed boundary. Each row holds from its FromYear to its ToYear, both included; a row spanning two files'
years is in both. Cliopatria writes years before AD 1 as negative numbers (its README: "negative for BCE"); VM reads −1
as 1 BC, with no year 0, so the six rows that end at year 0 (the Roman Empire, Judea, the Parthian Empire, the
Indo-Greeks, the Indo-Scythians and the Yuezhi) are drawn to 1 BC, and their next rows start at AD 1. RELATION rows (vassalages, alliances, unions) are kept, and drawn as outlines over the polities they join;
POLITY rows are filled. A name in parentheses, such as "(Kingdom of France)", is a composite polity, an entity with its
dependencies (the paper: composite polities "are denoted in the database by enclosing their name in parentheses"); VM
draws it as a dashed outline, like a RELATION row, so its core is not filled twice, and a download keeps each row's own
area, so a composite's area and its parts' must not be added together. Each row's id is `cl-` and the first ten hex digits of the sha256 of `Name|FromYear|ToYear|Type`,
so it is the same on every run of one release, whatever script the name is written in ("Đại Việt" keeps its letters).

Borders are quantised to 1/100,000 of each file's extent by topojson-server, which also makes each border two rows share
into one arc, so neighbours never gap or overlap. Quantising merges the points of a line that then fall on the same
spot; nothing else is taken out, and no simplifier is used (Jude's decision of 17 November 2026; the largest file, the
1800s, is under a third of the size limit; a departure from design 7.3, which names a topology-preserving simplifier).
The builder stops, writing nothing, if a file would pass the limit. Precision: VM counts a border before 1500 as known
only to its century (see "How a click sets the view"); from 1500 the years are Cliopatria's, which VM has not checked.

**The crosswalk (qids.json).** A Q-id is drawn only through it, never through a row's own Wikidata id. Cliopatria's ids
are checked first: each POLITY row's id is read from Wikidata (labels and aliases in English and multilingual, the
English Wikipedia title, inception and dissolution), and used only where one of those names matches the row's name or
Wikipedia phrase and, where Wikidata dates the item, its years meet the row's own (each row is checked alone; where
some of a name's rows meet Wikidata's years and others do not, those others are listed as rejected with their years).
On 17 November 2026, for 1400–1600, 24 of 267 ids' name-and-id pairs were rejected; they stay rejected in every year
(Jude's decision of 18 November 2026), even where Wikidata's years now meet some of their rows. For the whole span,
built 18 November 2026: 1,410 ids read from Wikidata (267 on 17 November, 1,143 on 18 November), 1,381 Q-ids used,
344 rejections, each listed with Wikidata's label and why. The Kingdom of France's rows carry Q207162, which Wikidata
labels "Bourbon Restoration in France" and dates 1815–1830 (though "Kingdom of France" is among its aliases); Joseon's
carry Gojoseon's id; the Swiss Confederation's, today's Switzerland's. Then a Master Index place whose label is a row's name,
and whose founding or dissolution in the lake meets the row's years, is matched by name: so Q70972, the Kingdom of
France, reaches its rows. RELATION rows carry one of their parts' ids and are not crosswalked. An entity with no
crosswalk row is "VM cannot outline this" (the Republic of Genoa is outlined; Genoa the city, Q1449, is not).

**Battles.** The Master Index's conflicts dated in 1400–1600 that Wikidata types a battle: the Battle of Fornovo
(Q764793) and the Battle of Agnadello (Q1754732). Each date is shown as Wikidata records it, at its precision and in its
calendar, never converted: Fornovo's 6 July 1495 is recorded in the Gregorian calendar, Agnadello's 14 May 1509 in the
Julian. Each value says what supports it (lake/scripts/refs.mjs, design 5.1): a reference naming a work (P248), a
reference URL or a database record; "Wikipedia-sourced, unverified" for a value only imported from a Wikipedia (P143,
P4656); "no reference" otherwise. Both battles' points, and Fornovo's date, were imported from Wikipedias; Agnadello's
date has no reference. The Master Index stores every entry's point itself from its full build of 3 December 2026
(lake/scripts/build.mjs, `pt` and `ptp`); until then the battles file reads these two items from Wikidata directly.

## How a click sets the view

A click on a tagged name in Neo Book (design/vm-click.js) turns the name's Master Index record into a view, by these
rules:

- **The years shown (the window).** Where the paragraph has a periods record checked by a second reader, its period,
  unwidened. Otherwise the name's own span (born to died; else founded, or failing that start, to dissolved, or failing
  that end: each end from the first key that records it, so the Roman Empire's start and dissolved read 27 BC–AD 395),
  each end widened by 10% of the span (at least one step) and rounded outward to whole steps; a lone date five years
  either way, a battle one. An
  end runs to today only where the record says the thing still exists: a person born within 120 years of today with no
  death recorded, or a place with no end that is a member of the United Nations. Anything else with a start and no end
  is its start alone, five years either way. The reader's heading and the map's give the name's own years as the
  Master Index records them, never the window: "Alexander the Great · 356–323 BC" (the map's own heading adds "map of
  360–319 BC"), and "Classical Athens · from 508 BC, end not recorded", never "801 BC–AD 2026" (MP-10, 18 November
  2026). Until a paragraph has a checked periods record, the years
  are therefore those of what was named, not the passage's own, and the reader's card says so ("This paragraph has no
  periods record yet").
- **The year it opens on (the frame).** The passage's first year, where its record gives one; else, for a battle, the
  year it was fought (Fornovo opens on 1495, so it is drawn when the map opens); else
  the start of the book's era (for The Prince, 1494–1527), if that falls inside the window; else the first year of the
  name's own years that the crosswalk can outline (qids.json); else its own first recorded year, or, where that is
  before the borders VM holds and its years reach them, their first year (Ancient Egypt, 4000–30 BC, opens on 3400 BC);
  else the window's first year. The card beside the map says which of these it is, and the map says the one reason it
  can tell from the entry's record.
- **Where it opens (the box).** A clicked place opens on its own outline at the frame, or on its Master Index point
  where VM cannot outline it; where VM holds neither for that year, the map shows the whole world and says so in a
  sentence ("VM holds no outline of Classical Athens for 508 BC (…), and the Master Index holds no point for it, so the
  map shows the whole world."), never the box of the other places the passage names.
- **The step.** The coarsest of: the precision of the span's ends, the fill's own step (borders change by the year), and
  the step the window's length calls for (a day or month under 5 years, a year under 300, a decade under 1,500, a
  century beyond).
- **The places in focus.** The name's own point; the places it belongs to (Wikidata's country, participants and member
  of) whose own dates hold the frame, never a present-day state (one with no end that is a member of the United Nations,
  or one founded after the frame); and the places the paragraph names. A place VM cannot outline is named with the
  reason; nothing placeable shows the world, with "VM cannot place this".
- **Borders before 1500.** VM counts a border of those years as known only to its century: Cliopatria dates its rows by
  the year, but VM has not checked the years of its medieval outlines, so the legend and a download say "century" for
  them; from 1500 the years are Cliopatria's.

## The slider and Play

With no recipe in its address the page shows every year VM holds, on 1400 where VM holds it; an address that names
its years (`t=`) opens on those, so an address from before 18 November 2026 opens what it opened. The slider has a stop
for every year (or decade, or century, as the step says) of its window, however many thousands of years that is, with
its two ends and round years labelled; years before AD 1 are written "508 BC" and the years after them "AD 1", and
1 BC is followed by AD 1 (there is no year 0). An exact year is reached by the keys on the slider (arrows, Page Up and
Down, Home, End) or by "Go to year", which reads "1494", "500 BC", "500 BCE", "AD 33", "33 CE" or "-500"; a year
outside the window but inside what VM holds widens the slider to every year VM holds, and "Every year VM holds" does
the same for the view shown. Play steps through the window by the step and at the pace chosen (a step is a number of
years: 1, 5, 10, 25, 50, 100, 250, 500 or 1,000, whichever the window holds; it starts on the smallest that crosses
the window in about 120 steps), asks for the borders files of the next three steps ahead, draws a year only once its
file has loaded, and keeps the four most recently used files. Its steps count whole years with no year 0, so a hundred
years after 100 BC is AD 1, and Play then lands on AD 101, 201 and so on, not on round hundreds. Wherever a borders file
has still to load, the note under the slider says "Loading the borders for …" until it is drawn, and the year shown
beside the slider stays on the year the map draws. An address that names a year 0, years that could not be read, or a
year outside its own years opens on the window's first year (its last, for a year after it) and says so under "In
focus". Play stops at the window's last year and says so, at any
move of the slider, and at a new recipe (the address, Kino's next move, the reader's next click); from the last year it
starts again at the first. The pure parts are in `omni/lib/time.js`.

## Layers (stage S5a)

The panel "Layers" lists every layer in `data/layers.json`, each with a switch (a checkbox with the role switch: Space
or a click), what it is doing at the frame, and its legend, source, licence and method; a layer VM leaves out for want
of free data stays in the list as a line saying why. A layer's data loads only when it is switched on, and for a layer
split by years (the grid) only the file of the frame's epoch. A layer whose years miss the frame says so, as
"Population density (by country) holds 1961 to 2024; the map is at 1494", and draws nothing.

The clutter rule (`omni/lib/layers.js`, pure): one fill, one base and at most three point or line layers. A second
fill or base replaces the first; a fourth point or line layer switches off the oldest, with a note, unless "Show
anyway" is ticked; the layer holding the view's subject (`q=`: a clicked battle's, election's, coup's or any point
layer's, found in its data once loaded) is never dropped. Above 2,000 visible points a
point layer clusters. The borders are always drawn; under a fill they are outlines.

In the address (design 3.2's keys): `fill=wb:EN.POP.DNST` or `fill=density-grid`, `base=countries`, `l=` the point and
line layers in the order switched on, `all=1` for Show anyway (which lets `l=` hold up to twelve). A fill's or base's id
given in `l=` is read into its own key. An address from before S5a opens as it did; an id VM does not hold is named
on the page and not drawn. The bundle and "Download data" carry each drawn layer's rows (each value with its
source and its place in it) and its dataset entry with sha256 and licence, and `ds=` pins each drawn layer's version
(the battles only when they are switched on). A layer's answer that comes after the reader has moved on (another
frame, or the layer switched off) changes nothing drawn, and a layer file of another shape than the page reads is
named in the page's loading note and not drawn.

| Layer | Role | Years | From |
|---|---|---|---|
| Countries today | base | 1886–2024, today's borders | Natural Earth 5.1.1 Admin 0 (public domain) |
| Population density (by country) | fill | 1961–2024 | World Bank WDI EN.POP.DNST (CC BY 4.0), drawn on today's countries |
| Population density (grid) | fill | 1975–2030 in five-year epochs; the frame shows the epoch at or before it | GHSL GHS-POP R2023A (CC BY 4.0), summed into 0.25° cells |
| Population density before 1975 (HYDE) | fill | 4000 BC to 1970 in HYDE's 48 epochs (a thousand years apart before AD 1, a century apart to 1700, ten years apart after); its 1970 stands to 1974; HYDE's "0 AD" is left out | HYDE 3.2.1 baseline from the DANS Data Station (CC0 1.0 by the repository's record, CC BY 3.0 by its readme), summed into 0.25° cells on the grid's classes. HYDE 3.3 sits behind a bot check VM does not get round, so VM holds the earlier release |

`omni/lib/layer-view.js` loads, draws and lists the layers; S5b and S5c add catalogue entries, builders, data and draw
rules only. The fills' colours are the design system's sequential blues stretched to ten steps (`--om-seq-1` …
`--om-seq-10` in `styles.css`); the classes take `--om-seq-2` upward (`tokenOf` in `lib/layers.js`), since the first step
is close to the sea's colour. A country with no value for the year is drawn in the map's no-data colour, the countries
are outlined under a fill, and an economy with a value but no free shape (the Channel Islands and Gibraltar, for the
World Bank) is named under the key, never dropped silently. Each line of the list gives the years the layer holds and
the year the map actually draws. A layer left out has a line starting "VM’s own text", with links to what VM read.

`design/prp-map-d3.js` draws the same dated borders as SVG with d3, from the same core (`design/prp-map.js`, which
stays pure); a page that uses it loads d3 itself at an exact version with its SRI hash. `omni/d3.html#at=1494` is its
test page (d3 7.9.0 from jsDelivr); `tests/omni-layers-page.test.mjs` checks it slices the rows the MapLibre page draws
at 1494 and 1900.

## Layers of history (stage S5b)

Four layers draw on what VM already holds or on free data, read with its terms:

- **Conflict on territory** (fill, 1946–2025): each country coloured by the highest UCDP intensity on its territory in
  the year; a country whose forces fight only abroad is outlined in a dashed line instead. A strip above the key counts
  the armed conflicts of each year, as UCDP counts them. Before 1946 the layer says it has no free data: VM’s free-data rule
  (MP-11) leaves out COW and PRIO’s battle deaths, so there are no deaths before UCDP’s from 1989.
- **Political change** (fill), **Elections and referendums** and **Coups** (points): who held office at the frame,
  and the elections and coups of the period from the slider’s start to the frame.
- **Battles** (points): now every dated battle with a point, from the Master Index and War Focus.
- **Breakthroughs** (points): the Invention Timeline’s events, with a Discipline filter (`l=breakthroughs:d=astro`).

A state is placed by Cliopatria’s shape for the year where the crosswalk has one, by Natural Earth’s from 1886, and as
a point for a small state; one with none is listed under the key with why. A click on a country or a point (a battle's
too) opens a
panel with its values and the module that holds it at that year: the Battlefield history
(`battlefield/history/index.html#y=<year>&c=<GW or ISO3>`), the Retrospective (`#y=<year>&c=<its key>`), War Focus
(`battlefield/focus/index.html#war=<id>`) or the Invention Timeline (`science/progress/index.html#y=<year>&e=<id>`). A
point list shows at most 40 items, the rest counted.

## Layers of now (stage S5c)

VM’s own text. Four more layers, each loaded only when it is switched on:

- **World Bank indicators** (fills, one at a time, `fill=wb:<code>`): one layer per World Development Indicators series
  whose own metadata reads CC BY 4.0, listed together under one disclosure in the layer list. A series whose metadata
  gives other terms is not built and is listed with them: military expenditure (MS.MIL.XPND.GD.ZS) is SIPRI’s, under
  SIPRI’s terms, so it is absent. An originator’s own terms decide over the World Bank’s label: the series taken from
  the IEA (EG.USE.PCAP.KG.OE, EG.FEC.RNEW.ZS, EN.GHG.CO2.PC.CE.AR5), IHME (EN.ATM.PM25.MC.M3) and ITU (IT.CEL.SETS.P2,
  IT.NET.USER.ZS) are absent too, each with the words of its terms. Each series’ entry names its originators
  (`originators`) and what VM read of their terms; where an originator’s terms were not read (the UN Population
  Division’s page holds none in its text), its method says “originator’s terms not read”. The builder finds a barred
  originator in a series’ sources by its full name in any case or by its abbreviation as a word (IEA, IHME, ITU, SIPRI),
  and stops if one comes back unlisted.
- **UCDP’s events** (points, 1989–2026, `l=ucdp-events`, `l=ucdp-events:t=1|2|3`, `l=ucdp-events:w=<war id>`): UCDP
  GED 26.1 summed into 0.5° cells by month, one file a year (`data/layers/ucdp-events/<year>.json`); only the frame’s
  year is fetched. An event UCDP knows only to its province or country is drawn hollow at its country; one known only to
  the country at large, or at sea or in the air, is counted under the key and not drawn. 2026 is UCDP Candidate’s
  monthly counts by country, from VM’s Realtime file, and is labelled candidate; each country is joined by its UCDP
  name through VM’s crosswalk, and a name the crosswalk cannot read is counted in the file’s `unjoined`, not drawn. A
  candidate year GED has not yet recorded is kept, as written, until GED’s yearly release records it. Each row counts
  one war’s events (its `war` a list of at most one index into the file’s `wars`), so the war filter’s totals are the
  war’s own; the filter goes through the war registry; a cell names no actor and no person.
- **The calendars’ events** (points, 1980–2029, `l=calendar-events`): VM Calendars’ events, one file a decade, each
  event with its date’s precision (day or month), its ISO3 where it has a country of today, and its source class. An
  event to come is drawn hollow. Leader and coup events that may be Archigos’s, and the Atlas’s, are left out and counted.
- **Volatility score** (fill, `fill=gvi`): VM’s own Geopolitical Volatility Index by country, the last day VM holds of
  the frame’s year (`data/layers/gvi/<year>.json`). The days are kept in `volatility/data/kept/` by
  `volatility/scripts/ingest.mjs`, so none is lost when Volatility’s index drops days older than a year.

The map draws at most three point or line layers; a fourth switches off the oldest and says so. A page or the narrator
can send `prp:focus` with ISO3 codes (`{ countries: ['FRA'] }`) and the map fits them; a Q-id (`{ qids: ['Q1449'] }`)
is fitted to its border of the frame's year, else to its point in the Master Index, read from its shard if the view
has not read it; `{ reset: true }` fits the view’s own box, and a focus whose reads finish after a newer focus or a
reset changes nothing. If the battles' file cannot load, whether switched on or named in the address, their switch goes
back off and the list says why. Only the latest address is drawn: an older one whose reads finish late stops there. A
layer’s loading errors are those of the latest frame; a file of the wrong shape is read again when the layer is next
switched on. A `fill=` or `base=` the recipe cannot read is named under “In focus”, never dropped in silence. Across VM, a tagged name (a Wikipedia link, or an element with `data-qid`) opens VM’s card
(`design/jdpi-entities.js`, offers from `design/vm-click.js`): the person’s life on the Omni-Map, their encyclopedia
entry, and Wikipedia. A Ctrl-, Shift-, Alt- or middle-click still goes to Wikipedia.

Power Patterns (layer 16) is not built: the module does not exist yet.

## Rebuilding

None of these files has a schedule; each is rebuilt by hand. Every builder writes nothing until its steps have worked,
and states its order of steps at its top.

```
# Borders: download the archive from the tag to a folder outside the repository, then
npm install --no-save topojson-server@3.0.1      # until package.json lists it as a devDependency
node --max-old-space-size=6000 omni/scripts/build-borders.mjs --zip <folder>/cliopatria.geojson.zip [--cache <folder>]
# The base: fetches the one file and checks its sha256
node omni/scripts/build-base.mjs
# The battles: reads the lake from disk, then asks Wikidata for those items only
node omni/scripts/build-battles.mjs [--cache <folder>]
# The countries base: Natural Earth 5.1.1's Admin 0 at 1:110m and 1:50m, each checked against its pinned sha256
node omni/scripts/build-countries.mjs [--file110 <file>] [--file50 <file>]
# Population density by country: the World Bank's API (stops unless the series' own licence reads CC BY 4.0)
node omni/scripts/build-wb.mjs --code EN.POP.DNST [--data <file>] [--meta <file>] [--countries <file>]
# Population density as a grid: the twelve GHS-POP 30 arc-second WGS84 zips, downloaded first (about 5.6 GB)
node --max-old-space-size=6000 omni/scripts/build-density.mjs --zips <12 zips> --work <folder outside the repository>
# Population density before 1975: HYDE3_2_1-baseline.zip (about 5.3 GB) from the DANS Data Station
# (https://archaeology.datastations.nl/api/access/datafile/5490328), downloaded first; the archive packs with Deflate64,
# which the script reads itself, checking each entry's CRC-32
node --max-old-space-size=6000 omni/scripts/build-density-hyde.mjs --zip <file> --work <folder outside the repository>
# S5b, in this order: UCDP's ACD 26.1 and BRD 26.1 CSVs downloaded first (CC BY 4.0), then
node omni/scripts/build-wars.mjs --acd <UcdpPrioConflict_v26_1.csv> [--cache <folder>]
node omni/scripts/build-conflict-territory.mjs --acd <UcdpPrioConflict_v26_1.csv> --brd <BattleDeaths_v26_1_conf.csv> [--cache <folder>]
node omni/scripts/build-political.mjs [--cache <folder>] [--only elections|coups|political-change|retro] [--retro <countries.json>]
node omni/scripts/build-breakthroughs.mjs
# S5c: every World Bank series in build-wb.mjs's list, each licence and originator read from its own metadata
# (every series' originators are checked before anything is written); --keep-values reuses each file's values and
# fetches nothing but the metadata, for a change of method or terms alone
node omni/scripts/build-wb.mjs --all [--meta-dir <folder>] [--keep-values]
# UCDP GED 26.1 (ged261-csv.zip, CC BY 4.0), downloaded first into a scratch folder of its own; checked against its sha256
node --max-old-space-size=6000 omni/scripts/build-ucdp-events.mjs --file <ged261-csv.zip>
# The Volatility score: the kept days first, then the layer
node volatility/scripts/ingest.mjs --keep-only
node omni/scripts/build-gvi.mjs
# The calendars' events, from calendar/data/<decade>.json (rebuilt each morning by calendar-refresh.yml)
node omni/scripts/build-calendar-layer.mjs
npm run test:unit
# then, from the main session only: node integration/scripts/build-catalog.mjs --quiet
```

A new Cliopatria release is a change made by hand: read its licence again, record its sha256 in `RELEASE`
(build-borders.mjs), and update `integration/sources.json`, the legend and this file.

## What others do

The design's section 1.1 lists the tools VM was compared with. The six it had not yet checked were surveyed for S1:

Checked on 17 November 2026, public pages only. Each line gives what the tool does and what it does better:
- **Euratlas (Periodis):** political maps of Europe at each century's turn, with an index of polities and a
  bibliography per year. Static images; you start from the map. Does better: long coverage, careful polity lists.
- **Omniatlas:** political maps dated to the day, with narratives; no sources; newer maps behind Patreon. Does
  better: fine date steps.
- **HistoryMaps:** only partly checked. A metered paywall (one free read a month, then sign-in or subscription from
  $30/year) hid its maps; third parties describe a draggable world timeline and war maps with Wikipedia-based text.
- **Peripleo:** the instance with the time filter (peripleo.pelagios.org) is offline; the live British Library fork
  shows points, clusters and facets with no documented time filter.
- **DARMC, now Mapping Past Societies:** an ArcGIS atlas with boundary layers at ca. 814, 1000, 1200 and 1450, a
  map-sources page and downloadable spreadsheets. Does better: thematic depth (economy, health, roads).
- **nodegoat:** a research environment for one's own data, with per-object sources and diachronic maps; it needs an
  account and holds no borders.
- **Also found:** TimeMap (OldMapsOnline: year slider, borders, rulers and battles, the year kept in the address),
  OpenHistoricalMap (public-domain data with a date slider), GapVis/Hestia (Herodotus beside a map of the places it
  names, as points), the Wikidata History Map (event points) and the World Historical Gazetteer (place authority).

None of these goes from a name in a book to a map at that passage's years, with borders as they stood, a source and
date on each value, and a view that can be frozen and cited. Each holds some of those parts; the passage as the
start and the frozen bundle remain the narrow point of difference. Because HistoryMaps could not be fully seen and
other tools may exist, the reader-facing page describes what VM does and claims nothing "unique" or "only". VM links
to these tools and reuses their identifiers.
