# Vitruvius pictures waiting for their modules

These four pictures of Vitruvius, VM's mascot, are kept for modules VM does not have yet. They are not shown
anywhere on the site, and no page, stylesheet, script or registry entry points at them. A test
(`tests/vitruvius.test.mjs`) fails if anything outside the design tools starts to.

| Picture | Waits for |
| --- | --- |
| `future-politics-64.webp`, `future-politics-256.webp` | the Politics module |
| `future-history-64.webp`, `future-history-256.webp` | the History module |
| `future-military-64.webp`, `future-military-256.webp` | the Military module |
| `future-master-index-64.webp`, `future-master-index-256.webp` | the Master Index |

When one of those modules is built, give its suite in `registry.json` a `"mark"` that points at the 64 px picture, move
the two files up into `design/vitruvius/`, and change its entry in `design/vitruvius/index.json` from kind `future`
to kind `module`.

Vitruvius, VM's mascot, was drawn by an AI image model (ChatGPT) from VM's own description; no person drew or
retouched the pictures. He is a new character, not a copy of Leonardo's drawing.

The files are made by `node design/scripts/vitruvius-art.mjs <folder of chosen pictures>`.
