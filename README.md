# Vitruvian Manager (VM), by JDP-Iq

**Vitruvian Manager** (short **VM**) is a product of **JDP-Iq**. It does for one person what an ERP does for an
enterprise: one workspace for geopolitics, intelligence tradecraft, history, money and science. You pick a submodule in
the sidebar, it opens in the main area, and every submodule shares one design system, one Encyclopaedia and one
light/dark theme. Its mark is Leonardo's Vitruvian figure in a hard hat (`design/brand-vm.svg`).

Live at **https://jdpi.pages.dev** (Cloudflare Pages, deployed from this repo by GitHub Actions once the tests pass). Formerly PRP, and before that "JDP-I".
"prp" is still the internal name: file names (`design/prp.css`, `design/PRP-STYLE.md`), tokens (`--prp-*`), classes,
registry ids and storage keys keep it, and only what people read says Vitruvian Manager.

| Module | Code | Submodules |
|---|---|---|
| **Realtime Geopolitics**: what is happening now | RT | Political Briefing · Global Headline Tracker (with its Highbrowse filter) · Geopolitical Volatility · Realtime Battlefield · National Analysis · Political Atlas · Realtime Calendar |
| **Retrospective Geopolitics**: what happened and why | RS | Encyclopaedia · Political Retrospective · Retrospective Battlefield · War Focus · Kardashev Tracker · Historical Calendar · Learning · Politics |
| **International Mystery Management** (Int-Myst Mngmnt in the sidebar): intelligence tradecraft within the law | OI | OSINT Dashboard · SIGINT Dashboard · GEOINT & IMINT Dashboard · Intel Training |
| **Money Management**: your money end to end | MM | Market Briefing · Economics Briefing · Auto Trader · Algo Trader · Tally Stick · Learning · Finance & Economics |
| **Natural Science**: science now and through history | NS | Scientific Briefing · Invention Timeline |
| **Digital Science**: computing, AI and the digital world | DS | Digital Briefing · Data Analytics · Integration Hub |
| **Kino**: documentaries that play across the suite | KN | Political Events · Political Figures · Political Parties · Wars · Geopolitical Events · Great Thinkers |

(In `registry.json` the seven modules are "suites" and their submodules "modules"; a suite's `name` is what the sidebar
shows and its `title` what its overview page and page eyebrows show. The old ids `q`, `hp` and `fe` still work as
aliases.)

The Global Headline Tracker's filter of celebrity gossip, horoscopes, clickbait and other lowbrow stories is called
**Highbrowse** (wordmark `design/highbrowse-wordmark.svg`); the code and the database still call it `lowbrow`.

## Architecture

```
  VM shell (this repo): sidebar → modules → submodules · breadcrumb · search · theme · registry.json
        │ one persistent iframe per submodule page (state is kept when you switch)
        ├── pages in this repo: q/, battlefield/, kardashev/, encyclopedia/, fe/, science/, osint/, sigint/, geoint/
        ├── political-atlas.pages.dev and hp-retrospective.pages.dev (own repos, Cloudflare Pages)
        └── trade-desk Worker (Market Briefing, Tally Stick, Algo Trader) and the double-signal Worker (private, Cloudflare Access)
  design/prp.css + design/prp-bar.js are loaded by every page, here and elsewhere
  lake/ (the Encyclopaedia's entity layer, keyed by Wikidata IDs) links every page to every other
```

| Piece | File | Role |
|---|---|---|
| Registry | `registry.json` | Modules, submodules, URLs, kinds (Realtime, Retrospective, Reference, Learning, Operations, Automation), status, and each page's `views` (in-page tabs that can be deep-linked). |
| Shell | `index.html`, `shell.js`, `shell.css` | Navigation, routing (`#/<module>/<submodule>[/<view>][?at=<url>]`), redirects for old addresses, search (press `/`), theme switch, persistent frames. |
| Design system | `design/prp.css`, guide in `design/PRP-STYLE.md` | Tokens (light and dark), type (Source Serif 4, IBM Plex Sans and Mono), components, validated data-viz palettes. `design/jdpi.css` imports it for older links. |
| Connector | `design/prp-bar.js` (`design/jdpi-bar.js`, its old name, now just loads it) | Runs on every page: theme, module accent, Encyclopaedia links, documentary mode inside the shell, and a slim "VM / Module / Submodule" bar when a page is opened on its own. |
| Brand | `design/brand-vm.svg`, `design/brand-vm-icon.svg`, `design/vm-loading.svg` | The mark (sidebar), the favicon (every page), and the figure the shell plays while a page loads. `design/brand-prp.svg`, the old mark, stays for external links. |
| Entity layer | `lake/` | See `lake/README.md`. |
| Documentary mode | `design/jdpi-documentary.js`, `design/jdpi-narrator.js` | Reads a page aloud as a documentary, with quiet classical music. |
| Data for programs and AI tools | `functions/api/v1/[[path]].js`, `functions/mcp.js`, `integration/openapi.json`, `llms.txt` | The site's public data, read-only and with no sign-in: a JSON API at `/api/v1/` (described by `openapi.json`), an MCP server at `/mcp` for AI assistants, and `/llms.txt`, a short guide for language models. The Integration Hub rebuilds `openapi.json` and `llms.txt` every day. |
| Aircraft proxy | `functions/api/sigint/adsb/[[path]].js` | Relays adsb.lol's aircraft positions to the SIGINT Dashboard, which a browser cannot read from adsb.lol directly. |

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
4. Commit and push. GitHub runs the whole test suite, and the site deploys only if it passes.

## Data refreshes

Every timed job (the GitHub workflows that rebuild and commit the data, the trading Worker's jobs, Double Signal's
scan, the Supabase jobs) is listed in [OPERATIONS.md](OPERATIONS.md): when it runs, what it writes, and how you know it
broke. Each refresh runs its tests before it commits, and the site deploys from GitHub once the suite passes.

## Tests

```bash
npm run test:unit                                 # the fast tests: no browser, no network (any platform)
npm run test:e2e                                  # everything, pages included, against a local copy it starts itself
node --test tests/*.test.mjs                      # data and page tests
PRP_URL=http://localhost:8787 node --test tests/platform.test.mjs   # shell and pages, with Edge via playwright-core
node tests/tools/serve.mjs 8787                   # local static server (keeps .html and query strings)
node tests/tools/shoot.mjs <url> <out.png> [--dark] [--width 390]   # screenshot a page in light or dark
```

CI (`.github/workflows/ci.yml`) runs the whole suite on every push and pull request, against a local copy of the site
served like Cloudflare Pages, and deploys main when it passes. The page tests read the site at `JDPI_URL` (the
platform test prefers `PRP_URL`); CI points both at its local copy, and without them most page tests fetch the live
site. `PRP_PAGES=0` leaves out every test that needs a browser or the network: the data refreshes test their new data
that way before they commit it.

## Licences

Code © JDP-Iq. Wikidata facts are CC0. Wikipedia summaries are CC BY-SA 4.0 and are credited where shown. Each data source
is credited on the page that uses it. `volatility/scripts/fips-iso3.json` is a table of country codes and names extracted
from the countrycode project (Arel-Bundock, Enevoldsen and Yetman, GPL-3.0), recorded with its source commit and checksum;
the codes themselves are facts, and the file is not part of Vitruvian Manager's code.
