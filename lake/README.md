# JDP-I entity layer ("data lake")

One record per person, place, war, party, election or idea that appears anywhere in JDP-I, keyed by its **Wikidata ID** (e.g. John Mearsheimer = Q725556). It powers the Master Index (`encyclopedia/`) and the ◈ links added across every module.

## How it fits together

```
module data ──► adapters.mjs ──► build.mjs ──► lake/data/ ──► Master Index (Explorer + entity pages)
 (Retrospective,   mentions:      resolve IDs,     static      └► jdpi-entities.js linker on every module page
  calendars,       key + link     Wikidata facts,  shards
  battlefields,    + context      tags, summaries
  Kardashev,       + tags
  Auto Trader,
  Learning,
  Invention Timeline,
  Bibliotheca,
  Kino,
  National Analysis,
  Volatility)
```

- **Adapters** (`scripts/adapters.mjs`): each module reports what it mentions as `{ key, label, module, url, date, context, tags }`. The key is a Wikipedia title, a Wikidata ID, or a module ID that Wikidata can resolve, such as a Congress Bioguide ID; a Wikidata ID wherever the module's data has one. `module` is the submodule's id in `registry.json`, and `url` the exact place in JDP-I, written as that page reads its own address. `ADAPTER_MODULES` lists the submodules each adapter files its mentions under.
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
- **Linker** (`design/jdpi-entities.js`, loaded by `prp-bar.js`): adds ◈ Master Index links next to Wikipedia links, `data-qid="Q…"` and `data-entity-key="…"` elements on any JDP-I page.
- **Deep links**: Master Index links open modules through the shell as `#/<suite>/<module>?at=<url>`. The shell only accepts URLs on that module's own page.

## Adapters

| Adapter | Submodules | What it reports, and where it links |
|---|---|---|
| `retrospective` | `retrospective` | Countries (by Wikidata ID), leaders, office-holders, their parties, elections and events, from the hp-retrospective repository (`--retro`); the country in the year |
| `calendar` | `historical-calendar`, `calendar` | Every event with a Wikipedia source, the last 180 days the Realtime Calendar's; its month |
| `battlefield` | `battlefield-history`, `war-focus`, `battlefield` | Retrospective Battlefield's wars, War Focus's wars and their battles and operations (by Wikidata ID), this year's wars; each at its year or month |
| `kardashev` | `kardashev` | Empires and countries, at the step of their largest share of world energy |
| `traders` | `traders` | Members of Congress who trade (by Bioguide ID) and famous investors |
| `learning` | `learning`, `learning-politics` | Thinkers and schools of thought taught in the Finance, Economics and Politics courses; the lesson |
| `progress` | `progress` | Breakthroughs, their scientists and institutions (by Wikidata ID); the breakthrough on the timeline |
| `bibliotheca` | `neo-classic` (Bibliotheca's reader; `bibliotheca` until November 2026, when Bibliotheca left Kino for a module of its own) | Each book's cast (by Wikidata ID, with the book's names); the first paragraph that names it |
| `kino` | `kino-<category>`, all six | What each documentary names by Wikidata ID: its subjects, each scene's Master Index link and portrait, and the War Focus wars, National Analysis and Political Atlas countries and Invention Timeline breakthroughs its scenes link to (not the items its Wikidata sources list, which are where its facts come from). One mention per film and entity, at the first scene that names it, or at the start for a subject |
| `pestle` | `pestle` (National Analysis) | Every country with its Wikidata ID (the Channel Islands and Kosovo have none there yet); its profile, `q/national.html#country=<ISO3>` |
| `volatility` | `volatility` | Every country scored on a day the index holds, with the Wikidata ID National Analysis gives it (Taiwan, Jersey and Vatican City have none); the country, `q/volatility.html#country=<ISO3>`, with its latest score |

The submodules with no entities of their own report nothing, each exempt with its reason in `tests/master-index.test.mjs`: the Master Index itself; the four briefings and the Global Headline Tracker (stories, whose names carry no Wikidata ID or Wikipedia link for the page linker to badge: marking the countries each story is filed under is to come); the OSINT, SIGINT and GEOINT dashboards and Intel Training; Data Analytics, the Integration Hub and IoT Connect (which controls the user's own devices through the local bridge); Tally Stick and Algo Trader (private); Market Briefing and the Political Atlas (other repositories, whose adapters are to come).

## Adding a module

1. Write an adapter in `scripts/adapters.mjs`, add it to `ADAPTERS`, and list the submodules its mentions are filed under in `ADAPTER_MODULES`. Give each submodule its name in `MODULE_NAMES` and its place in `MODULE_ORDER` (build.mjs), and its suite in `MODULE_SUITE` (encyclopedia page).
2. Where the module shows a name without a Wikipedia link, add `data-qid` or `data-entity-key` so the linker can find it.
3. Run `npm run build:lake`, or `node lake/scripts/build.mjs --only <adapter>` to add just that module's entities to the committed `data/` (Wikidata only, a request a second; summaries wait for the next full build). `--only` speaks for the adapter's `ADAPTER_MODULES`, so a submodule it no longer reports loses its mentions.

`tests/master-index.test.mjs` holds the suite to this: every live submodule in `registry.json` is an adapter's or exempt with its reason, and every adapter's submodules are named, ordered, in their suite and in the committed lake. A new submodule in neither fails it, with the steps above.

Every name in the lake is also a term to the Bibliotheca tagger, which reads every label and alias when the refresh tags the books again. So an adapter feeds what its submodule shows, by Wikidata ID: a work named only in a module's sources ("The Prince" is "Prince" with its "The" dropped, Marx's "Capital" is "Capital") would be a term wherever a book uses the common word, and fail the books' tests; a title is a key only where the module's data links that article, not a display name taken for one ("Jersey" would be the island wherever Smith writes "New Jersey"). Before committing a module's first build, tag the books again in a copy of the repository (`bibliotheca/scripts/tag-terms.mjs <slug>` for each) and run `tests/bibliotheca-data.test.mjs` there.

A mention may carry `aliases`, the names the module's own text uses: the build adds them to the entity's (Bibliotheca does, so its tagger finds a book's "Duke Valentino"). The lake does not record which module gave which name, so `--only` makes an entity's names again only when the adapters it runs give names; a run of adapters that give none (Kino, National Analysis, Volatility) leaves the committed names as they are, the books' among them.

## Bibliotheca

Each book's cast (`bibliotheca/data/cast/<slug>.json`, made by `bibliotheca/scripts/cast.mjs <slug>` from Wikidata and reviewed in its header's overrides) feeds the lake through the `bibliotheca` adapter: one mention per book and entity, filed under Neo Classic (`neo-classic`, in the Bibliotheca module) and linked to the first paragraph that names it there. After a build, `bibliotheca/scripts/tag-terms.mjs <slug>` tags the book again; the monthly refresh does it for every book.

A record's book-only names (`local`) feed its entity but not the name, since the name means someone else in other books (the Prince's "Cyrus", or "Naples", which there means the Kingdom). The book's shelf decision gives the name back to the entity. Every book is tagged against the one lake. So a cast record that is dropped, moved or made book-only changes the other books' terms at their next re-tag. After changing a cast, re-tag every book.

## Refresh

`.github/workflows/lake-refresh.yml` rebuilds monthly (on the 3rd) and commits `data/`. Summaries are cached in `scripts/summary-cache.json`, so a refresh only fetches new articles.

## Licences

Wikidata facts are CC0. Wikipedia summaries are CC BY-SA 4.0: the Master Index credits them on every page, and that text stays under the same licence.
