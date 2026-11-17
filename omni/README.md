# Omni-Map

The Omni-Map is Digital Science's map of dated borders and the events VM holds, opened at the right place and years
from a tagged name (PRP-SCHOLAR-USP-DESIGN.md, stage S1). This file describes its data: what each file is, where it
comes from, under what terms, how it was changed and how to rebuild it. The page itself is `omni/index.html`.

In this first version VM holds borders for **1400–1600 only**, and **2 battles** for those years. The page says so
wherever a view reaches past what VM holds.

## The files

| File | What it is | Built by |
|---|---|---|
| `data/borders/1400-1499.topo.json`, `data/borders/1500-1600.topo.json` | Cliopatria v0.2.1's rows overlapping each span, as TopoJSON (format `vm-borders/1`, described in `design/prp-map.js`) | `scripts/build-borders.mjs` |
| `data/borders/index.json` | The files, their years, rows, sizes and sha256, and the archive they were built from | `scripts/build-borders.mjs` |
| `data/borders/qids.json` | The crosswalk from Wikidata Q-ids to Cliopatria's names by year, and the ids rejected, with why | `scripts/build-borders.mjs` |
| `data/base/ne_110m_land.geojson` | Natural Earth 5.1.1's land at 1:110 million, unchanged: the plain base (see `data/base/README.md`) | `scripts/build-base.mjs` |
| `data/layers/battles.json` | The battles the Master Index holds with a date in 1400–1600, each value with its source | `scripts/build-battles.mjs` |
| `data/layers.json` | The layer catalogue (design 4.2): each layer's years, step, status, legend, source and method | by hand; the builders set each layer's `built` and years |

VM's sources, with their terms as read, are in `integration/sources.json` (design 5.1).

Sizes, 17 November 2026 (gzip level 9): 1400–1499 758,803 bytes (179,888 gzipped), 1500–1600 893,937 bytes (212,613
gzipped), the base 138,160 (50,328), qids.json 42,025 (5,846), the battles 2,387 (761). The design's limit is 1.5 MB
compressed per borders file (7.3), and 1.5 MB for the whole default view, MapLibre included; only the frame's file loads.

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
- Changes by Vitruvian Manager: the rows of 1400–1600 only, converted to TopoJSON quantised to 1/100,000 of each file's
  extent (points that then coincide are merged; no simplification), with a row id added.

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
extent in particular years, so societies without written records are not drawn; with rare exceptions a polity occupies
at least 5,000 km² and lasts at least 50 years (its paper). Its README warns that the maps "reflect only one version of
the territory held by past polities", and the paper that the dataset does not encode border uncertainty or territorial
disputes. Its rows carry no field naming which atlas or regional source each outline came from (the paper lists its
sources by region). Each row holds from its FromYear to its ToYear, both included; a row spanning 1499 and 1500 is in
both files. RELATION rows (vassalages, alliances, unions) are kept, and drawn as outlines over the polities they join;
POLITY rows are filled. A name in parentheses, such as "(Kingdom of France)", is a composite polity, an entity with its
dependencies (the paper: composite polities "are denoted in the database by enclosing their name in parentheses"); VM
draws it as a dashed outline, like a RELATION row, so its core is not filled twice, and a download keeps each row's own
area, so a composite's area and its parts' must not be added together. Each row's id is `cl-` and the first ten hex digits of the sha256 of `Name|FromYear|ToYear|Type`,
so it is the same on every run of one release, whatever script the name is written in ("Đại Việt" keeps its letters).

Borders are quantised to 1/100,000 of each file's extent by topojson-server, which also makes each border two rows share
into one arc, so neighbours never gap or overlap. Quantising merges the points of a line that then fall on the same
spot; nothing else is taken out, and no simplifier is used, since the files come to about a tenth of the size limit (a
departure from design 7.3, which names a topology-preserving simplifier, recorded for Jude). Precision: VM counts a border
before 1500 as known only to its century (see "How a click sets the view"); from 1500 to 1600 the years are
Cliopatria's, which VM has not checked.

**The crosswalk (qids.json).** A Q-id is drawn only through it, never through a row's own Wikidata id. Cliopatria's ids
are checked first: each POLITY row's id is read from Wikidata (labels and aliases in English and multilingual, the
English Wikipedia title, inception and dissolution), and used only where one of those names matches the row's name or
Wikipedia phrase and, where Wikidata dates the item, its years meet the row's. Of 267 ids, 24 name-and-id pairs were
rejected; each is listed with Wikidata's label and why. The Kingdom of France's rows carry Q207162, which Wikidata labels
"Bourbon Restoration in France" and dates 1815–1830 (though "Kingdom of France" is among its aliases); Joseon's carry
Gojoseon's id; the Swiss Confederation's, today's Switzerland's. Then a Master Index place whose label is a row's name,
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
  unwidened. Otherwise the name's own span (born to died, founded to dissolved, start to end), each end widened by 10% of
  the span (at least one step) and rounded outward to whole steps; a lone date five years either way, a battle one; a
  living person ends today. Until a paragraph has a checked periods record, the years are therefore those of what was
  named, not the passage's own, and the reader's card says so ("This paragraph has no periods record yet").
- **The year it opens on (the frame).** The passage's first year, where its record gives one; else
  the start of the book's era (for The Prince, 1494–1527), if that falls inside the window; else the window's first year. The card beside
  the map says which of the three it is.
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
npm run test:unit
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
