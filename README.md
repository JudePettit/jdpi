# PRP — Personal Resource Planner

**PRP** is a product of **JDP-Iq**. It does for one person what an ERP does for an enterprise: one workspace for
intelligence, history, money and science. You pick a submodule in the sidebar, it opens in the main area, and every
submodule shares one design system, one Encyclopaedia and one light/dark theme.

Live at **https://jdpi.pages.dev** (Cloudflare Pages, deployed from this repo). Formerly "JDP-I".

| Module | Code | Submodules |
|---|---|---|
| **Realtime Intelligence**: what is happening now | RT | Intelligence Briefing · Global Headline Tracker · Geopolitical Volatility · National Analysis · Realtime Battlefield · Political Atlas · Realtime Calendar · OSINT Dashboard · SIGINT Dashboard · GEOINT & IMINT Dashboard · OSINT Training |
| **Retrospective Intelligence**: what happened and why | RS | Encyclopaedia · Political Retrospective · Historical Calendar · Retrospective Battlefield · War Focus · Kardashev Tracker · Learning · Politics |
| **Money Management**: your money end to end | MM | TD Markets · Tally Stick · Algo Trader · Auto Trader · Learning · Finance & Economics |
| **Natural Science**: science now and through history | NS | Scientific Briefing · Invention Timeline |

(In `registry.json` the four modules are "suites" and their submodules "modules". The old ids `q`, `hp` and `fe` still
work as aliases.)

## Architecture

```
  PRP shell (this repo): sidebar → modules → submodules · breadcrumb · search · theme · registry.json
        │ one persistent iframe per submodule page (state is kept when you switch)
        ├── pages in this repo: q/, battlefield/, kardashev/, encyclopedia/, fe/, science/, osint/, sigint/, geoint/
        ├── political-atlas.pages.dev and hp-retrospective.pages.dev (own repos, Cloudflare Pages)
        └── trade-desk Worker (TD Markets, Tally Stick, Algo Trader) and the double-signal Worker (private, Cloudflare Access)
  design/prp.css + design/prp-bar.js are loaded by every page, here and elsewhere
  lake/ (the Encyclopaedia's entity layer, keyed by Wikidata IDs) links every page to every other
```

| Piece | File | Role |
|---|---|---|
| Registry | `registry.json` | Modules, submodules, URLs, kinds (Realtime, Retrospective, Reference, Learning, Operations, Automation), status, and each page's `views` (in-page tabs that can be deep-linked). |
| Shell | `index.html`, `shell.js`, `shell.css` | Navigation, routing (`#/<module>/<submodule>[/<view>][?at=<url>]`), redirects for old addresses, search (press `/`), theme switch, persistent frames. |
| Design system | `design/prp.css`, guide in `design/PRP-STYLE.md` | Tokens (light and dark), type (Source Serif 4, IBM Plex Sans and Mono), components, validated data-viz palettes. `design/jdpi.css` imports it for older links. |
| Connector | `design/prp-bar.js` (`design/jdpi-bar.js` is an identical copy) | Runs on every page: theme, module accent, Encyclopaedia links, documentary mode inside the shell, and a slim "PRP / Module / Submodule" bar when a page is opened on its own. |
| Entity layer | `lake/` | See `lake/README.md`. |
| Documentary mode | `design/jdpi-documentary.js`, `design/jdpi-narrator.js` | Reads a page aloud as a documentary, with quiet classical music. |

### One page, one submodule

A submodule is one page. A page's own views (archives, map/compare, live/archive, course parts) are **tabs inside the
page**, listed under `views` in the registry, never extra sidebar entries.

### Adding a submodule

1. Add an entry under the right module in `registry.json` with `id`, `name`, `kind`, `icon`, `status` (`live`,
   `in-build` or `planned`), `host`, `url` and `description`. Add `opensInNewTab: true` for private pages behind their own
   sign-in.
2. Hook the page up to the design system (see `design/PRP-STYLE.md` §2) and follow its anatomy and checklist.
3. If the page mentions people, places, wars, parties or ideas, add an adapter in `lake/scripts/adapters.mjs` so the
   Encyclopaedia links to it.
4. Commit. Cloudflare redeploys automatically.

## Data refreshes

GitHub Actions (`.github/workflows/`) rebuild data and commit it: Briefing (twice daily), Scientific Briefing (every six
hours), Volatility, National Analysis, Battlefield and War Focus, Auto Trader (weekly), Invention Timeline and the
Encyclopaedia (monthly).

## Tests

```bash
node --test tests/*.test.mjs                      # data and page tests
PRP_URL=http://localhost:8787 node --test tests/platform.test.mjs   # shell and pages, with Edge via playwright-core
node tests/tools/serve.mjs 8787                   # local static server (keeps .html and query strings)
node tests/tools/shoot.mjs <url> <out.png> [--dark] [--width 390]   # screenshot a page in light or dark
```

## Licences

Code © JDP-Iq. Wikidata facts are CC0. Wikipedia summaries are CC BY-SA 4.0 and are credited where shown. Each data source
is credited on the page that uses it. `volatility/scripts/fips-iso3.json` is a table of country codes and names extracted
from the countrycode project (Arel-Bundock, Enevoldsen and Yetman, GPL-3.0), recorded with its source commit and checksum;
the codes themselves are facts, and the file is not part of PRP's code.
