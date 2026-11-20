# The Omni-Map's base: Natural Earth land

`ne_110m_land.geojson` is Natural Earth's land polygons at 1:110 million, copied unchanged from release v5.1.1
(GitHub tag of nvkelso/natural-earth-vector, 2022-05-13) by `omni/scripts/build-base.mjs`.

- Address: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_land.geojson
- Read: 2026-11-17
- sha256: 9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9
- Size: 138160 bytes (50328 gzipped)

It holds land only, with no country borders: the Omni-Map's `plain` base, which before 1886 must never be today's
political map (PRP-SCHOLAR-USP-DESIGN.md 4.2).

## Terms

Natural Earth is in the public domain. Its terms of use (https://www.naturalearthdata.com/about/terms-of-use/) and the LICENSE.md at the tag
(https://github.com/nvkelso/natural-earth-vector/blob/v5.1.1/LICENSE.md) say: "All versions of Natural Earth raster + vector map data found on this website are in the public domain. You may use the maps in any manner, including modifying the content and design, electronic dissemination, and offset printing."

No credit is required; the credit Natural Earth offers, which VM gives in the Omni-Map's legend: "Made with Natural Earth."

## The countries base

`countries.topo.json` is Natural Earth's Admin 0 – Countries at 1:110 million and `small-states.json` a label point for
each of the 64 states and territories that file leaves out, from the 1:50 million file, both release v5.1.1,
written by `omni/scripts/build-countries.mjs` (TopoJSON quantised to 1/100,000, no simplification; each country's
ISO 3166 alpha-3 code kept for joins).

- Addresses: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_admin_0_countries.geojson (sha256 6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f) and https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_50m_admin_0_countries.geojson (sha256 3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb)
- Read: 2026-11-18
- Sizes: countries.topo.json 110819 bytes (39418 gzipped); small-states.json 10294 bytes (2398 gzipped)

These are today's borders: the Omni-Map draws them only from 1886, and says so before then. The terms are the same
as for the land above.
