# JDP-I entity layer ("data lake")

One record per person, place, war, party, election or idea that appears anywhere in JDP-I, keyed by its **Wikidata ID** (e.g. John Mearsheimer = Q725556). It powers the Encyclopaedia (`encyclopedia/`) and the ◈ links added across every module.

## How it fits together

```
module data ──► adapters.mjs ──► build.mjs ──► lake/data/ ──► Encyclopaedia (Explorer + entity pages)
 (Retrospective,   mentions:      resolve IDs,     static      └► jdpi-entities.js linker on every module page
  calendars,       key + link     Wikidata facts,  shards
  Battlefield,     + context      tags, summaries
  Kardashev,       + tags
  Traders,
  Learning)
```

- **Adapters** (`scripts/adapters.mjs`): each module reports what it mentions as `{ key, label, module, url, date, context, tags }`. The key is a Wikipedia title, a Wikidata ID, or a module ID that Wikidata can resolve, such as a Congress Bioguide ID. `url` is the exact place in JDP-I.
- **Build** (`scripts/build.mjs`):
  - Resolves every key to a Wikidata ID.
  - Fetches facts, plus one level of related entities (parties, ideologies, movements, countries, conflicts), so those get pages too.
  - Turns facts into tags: nationality, occupation, field, movement, ideology, party, position, conflict and century. It adds module tags and curated school-of-thought tags (`scripts/thinkers.mjs`).
  - Keeps each entity's first six English aliases from Wikidata, tidied by `scripts/aliases.mjs`, then the names a module's own text uses. A trailing comma goes, and so does the full stop after a regnal number ("Alexander VI."). An abbreviation keeps its stop ("With.", "Oxon."), or the Bibliotheca tagger would read it as a word at every sentence it opens. The Bibliotheca cast reads aliases by the same rule.
  - Attaches Wikipedia summaries (cached).
- **Output** (`data/`), static files served by Cloudflare Pages, readable from any origin:
  - `index.json`: the search and filter index (tags, modules, one row per entity with its tags and its first link into each module).
  - `e/<n>.json`: full entity records, sharded by Wikidata number % 512.
  - `t/<n>.json`: English Wikipedia title → Wikidata ID, sharded by hash. The linker uses these.
  - `keys.json`: module keys (e.g. `congress:P000197`) → Wikidata ID.
  - `manifest.json`: counts and build time.
- **Linker** (`design/jdpi-entities.js`, loaded by `jdpi-bar.js`): adds ◈ Encyclopaedia links next to Wikipedia links, `data-qid="Q…"` and `data-entity-key="…"` elements on any JDP-I page.
- **Deep links**: Encyclopaedia links open modules through the shell as `#/<suite>/<module>?at=<url>`. The shell only accepts URLs on that module's own page.

## Adding a module

1. Write an adapter in `scripts/adapters.mjs` and add it to `ADAPTERS`. Give the module's name in `MODULE_NAMES` (build.mjs) and its suite in `MODULE_SUITE` (encyclopedia page).
2. Where the module shows a name without a Wikipedia link, add `data-qid` or `data-entity-key` so the linker can find it.
3. Run `npm run build:lake`, or `node lake/scripts/build.mjs --only <adapter>` to add just that module's entities to the committed `data/` (Wikidata only, a request a second; summaries wait for the next full build).

A mention may carry `aliases`, the names the module's own text uses: the build adds them to the entity's (Bibliotheca does, so its tagger finds a book's "Duke Valentino").

## Bibliotheca

Each book's cast (`bibliotheca/data/cast/<slug>.json`, made by `bibliotheca/scripts/cast.mjs <slug>` from Wikidata and reviewed in its header's overrides) feeds the lake through the `bibliotheca` adapter: one mention per book and entity, linked to the first paragraph that names it in Neo Classic. After a build, `bibliotheca/scripts/tag-terms.mjs <slug>` tags the book again; the monthly refresh does it for every book.

A record's book-only names (`local`) feed its entity but not the name, since the name means someone else in other books (the Prince's "Cyrus", or "Naples", which there means the Kingdom). The book's shelf decision gives the name back to the entity. Every book is tagged against the one lake. So a cast record that is dropped, moved or made book-only changes the other books' terms at their next re-tag. After changing a cast, re-tag every book.

## Refresh

`.github/workflows/lake-refresh.yml` rebuilds monthly (on the 3rd) and commits `data/`. Summaries are cached in `scripts/summary-cache.json`, so a refresh only fetches new articles.

## Licences

Wikidata facts are CC0. Wikipedia summaries are CC BY-SA 4.0: the Encyclopaedia credits them on every page, and that text stays under the same licence.
