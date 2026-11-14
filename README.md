# Vitruvian Manager (VM), by JDP-Iq

**Vitruvian Manager** (short **VM**) is a product of **JDP-Iq**. Vitruvian Manager's modules allow you to learn, earn,
create, and control. It opens on the Home page, where every module is a box that turns over to what you can do with it,
with a button to the Dashboard of what changed today. You pick a submodule in the sidebar, it opens in the main area,
and every submodule shares one design system, one Master Index and one light/dark theme. Its mark is Leonardo's
Vitruvian figure in a hard hat (`design/brand-vm.svg`).

Live at **https://jdpi.pages.dev** (Cloudflare Pages, deployed from this repo by GitHub Actions once the tests pass). Formerly PRP, and before that "JDP-I".
"prp" is still the internal name: file names (`design/prp.css`, `design/PRP-STYLE.md`), tokens (`--prp-*`), classes,
registry ids and storage keys keep it, and only what people read says Vitruvian Manager.

| Module | Code | Submodules |
|---|---|---|
| **Home**: where VM starts; its overview is the Home page, every other module as a box that turns over to what you can do with it | HM | Dashboard (what changed today: volatility's biggest movers, the topics rising and falling in the briefings' headlines, the next votes and summits, the markets, each line opening the one thing it names; then every module and submodule) |
| **Realtime Geopolitics**: what is happening now | RT | Global Headline Tracker (with its Highbrowse filter) · Geopolitical Volatility · Realtime Battlefield · National Analysis · Political Atlas · Realtime Calendar |
| **Highbrowse**: the news worth reading, in four briefings | HB | Highbrowse (the day's and the week's news across the four, and one search) · Political Briefing · Scientific Briefing · Economics Briefing · Digital Briefing |
| **Retrospective Geopolitics**: what happened and why | RS | Master Index · Political Retrospective · Retrospective Battlefield · War Focus · Kardashev Tracker · Historical Calendar · Learning · Politics |
| **International Mystery Management** (Int-Myst Mngmnt in the sidebar): intelligence tradecraft within the law | OI | OSINT Dashboard · SIGINT Dashboard · GEOINT & IMINT Dashboard · Intel Training |
| **Money Management**: your money end to end | MM | Market Briefing · Auto Trader · Algo Trader · Tally Stick · Learning · Finance & Economics |
| **Natural Science**: science through history | NS | Invention Timeline |
| **Digital Science**: computing, AI and the digital world | DS | Data Analytics · Integration Hub (with its Agents tab) · IoT Connect (your own smart devices through the bridge, with Hermes Messenger, an MQTT and Sparkplug link and your phone as the remote) |
| **Kino**: documentaries that play across the suite | KN | Political Events · Political Figures · Political Parties · Wars · Geopolitical Events · Great Thinkers |
| **Bibliotheca**: the reading room, public-domain books with the Master Index beside the text (Kino's submodule until November 2026) | BB | Neo Classic (the reader: the shelf, the Master Index's terms marked through the text, the Links pane and Augmented Reading) |

(In `registry.json` the ten modules are "suites" and their submodules "modules"; a suite's `name` is what the sidebar
shows, its `title` what its overview page, its box on the Home page and page eyebrows show, and its `summary` the line
or two on the back of its box: what you can do with it. The old ids `q`, `hp` and `fe` still work as aliases, and so do
the addresses of submodules that moved to another module: the four briefings, which came to Highbrowse in November 2026
from Realtime Geopolitics, Natural Science, Money Management and Digital Science, still open at `#/rt/briefing`,
`#/ns/science-briefing`, `#/mm/econ-briefing` and `#/ds/digital-briefing`. A submodule given a new id keeps its old one as an alias:
Neo Classic, Bibliotheca's reader, was Kino's `bibliotheca` until November 2026, and `#/kino/bibliotheca` still opens it, in
Bibliotheca, at `#/bibliotheca/neo-classic`.)

The Home module (`home`, first in the sidebar, November 2026) is where VM starts. Its overview is the Home page (`#/`;
`#/home` lands there): the intro, a small button to the Dashboard, and every other module as a box in registry order,
which turns over (a 3D card flip) on hover, on keyboard focus or at a first tap on a touch screen, a second tap or a
click opening the module's overview; with reduced motion its back shows without the turn. Its one submodule is the
Dashboard (`#/home/dashboard`, breadcrumb VM / Home / Dashboard), which was the home page, the Workspace, until then:
the Today panel (`design/prp-highlights.js`) over every module and submodule. The shell draws it itself (`"shell":
"dashboard"` in the registry, in place of a `url`), and the Workspace's old name, `#/workspace`, lands on it.

The Global Headline Tracker's filter of celebrity gossip, horoscopes, clickbait and other lowbrow stories is called
**Highbrowse** (wordmark `design/highbrowse-wordmark.svg`); the code and the database still call it `lowbrow`. The
Highbrowse module shares the name: its landing page (`highbrowse/`) analyses the four briefings' own stores in the
browser, with no timed job of its own (its Trends tab reads each briefing's `trends.json`, which the briefing's own
build writes with its store), and its figure is the first module variant of the Vitruvian figure
(`design/brand-hb.svg`, and `design/brand-hb-icon.svg` for the sidebar).

**Summaries in step with their stores.** A page that reads a small summary in place of a large store (the Dashboard,
Highbrowse's Trends tab) reads one written by the same build, in the same commit, as the store: each builder calls
`writeHeads()` from `integration/scripts/heads.mjs` as its last act, and every summary names its store's own time and
content (`summaryOf`). `tests/heads.test.mjs`, in the whole suite, fails when one is out of step; `node
integration/scripts/heads.mjs --all` mends it. The headline-trend rule is `design/prp-trends.js`; each briefing keeps
its stories a day by topic in `data/history.json` (rebuilt once, on 13 November 2026, from the committed stores by
`integration/scripts/backfill-history.mjs`).

## Architecture

```
  VM shell (this repo): sidebar → modules → submodules · breadcrumb · search · theme · registry.json
        │ draws the Home page (#/) and the Dashboard (#/home/dashboard) itself
        │ one persistent iframe per submodule page (state is kept when you switch)
        ├── pages in this repo: q/, highbrowse/, battlefield/, kardashev/, encyclopedia/, fe/, science/, econ/, digital/, osint/, sigint/, geoint/, …
        ├── the Vitruvian Manager bridge on the user's own computer (sigint/bridge/prp-bridge.mjs): SIGINT's relays, and with --iot IoT Connect and Hermes Messenger
        ├── the installable app: manifest.json, sw.js (offline worker for the shell and IoT Connect), design/icons/
        ├── political-atlas.pages.dev and hp-retrospective.pages.dev (own repos, Cloudflare Pages)
        └── trade-desk Worker (Market Briefing, Tally Stick, Algo Trader) and the double-signal Worker (private, Cloudflare Access)
  design/prp.css + design/prp-bar.js are loaded by every page, here and elsewhere
  lake/ (the Master Index's entity layer, keyed by Wikidata IDs) links every page to every other
```

| Piece | File | Role |
|---|---|---|
| Registry | `registry.json` | Modules (each with its `summary`, the back of its box on the Home page), submodules, URLs (the Dashboard has `"shell": "dashboard"` instead: the shell draws it), kinds (Realtime, Retrospective, Reference, Learning, Operations, Automation: for search, the catalogue and the MCP server, no longer shown as badges), status (`live` means published, and is never shown; only "In build" and "Planned" are flagged), `host` (said in each module overview's "About this module"), `data` (how the submodule's freshness line is worked out: `design/prp-freshness.js`) and each page's `views` (in-page tabs that can be deep-linked). |
| Freshness lines | `design/prp-freshness.js` | One line per submodule saying how fresh its data is ("Updated 13 Nov 20:37 UTC · every six hours", "Figures to Sep 2026 · UCDP monthly, checked weekly", "Reviewed 6 Nov · monthly review", "Available · prices delayed", "Reference · no schedule"), worked out from its store's own time and its refresh workflow's cron, and "Late" by the daily data check's rule. The shell shows it in the top bar, the sidebar, the Dashboard's tiles, each overview's "Last update" column and on the Home page's boxes; `tests/freshness-labels.test.mjs` holds each rhythm to its workflow. |
| Shell | `index.html`, `shell.js`, `shell.css` | Navigation, routing (`#/<module>/<submodule>[/<view>][?at=<url>]`), redirects for old addresses, search (press `/`), theme switch, persistent frames; the Home page (every module as a box that turns over to its `summary`) and the Dashboard (the Today panel over every module and submodule). |
| Design system | `design/prp.css`, guide in `design/PRP-STYLE.md` | Tokens (light and dark), type (Source Serif 4, IBM Plex Sans and Mono), components, validated data-viz palettes. `design/jdpi.css` imports it for older links. |
| Connector | `design/prp-bar.js` (`design/jdpi-bar.js`, its old name, now just loads it) | Runs on every page: theme, module accent, Master Index links, documentary mode inside the shell, and a slim "VM / Module / Submodule" bar when a page is opened on its own. |
| Brand | `design/brand-vm.svg`, `design/brand-vm-icon.svg`, `design/vm-loading.svg` | The mark (sidebar), the favicon (every page), and the figure the shell plays while a page loads. `design/brand-prp.svg`, the old mark, stays for external links. A module may have its own variant of the figure (registry `mark` and `figure`): Highbrowse's is `design/brand-hb.svg` and `design/brand-hb-icon.svg`. |
| Entity layer | `lake/` | See `lake/README.md`. |
| Documentary mode | `design/jdpi-documentary.js`, `design/jdpi-narrator.js` | Reads a page aloud as a documentary, with quiet classical music. |
| Voice | `design/prp-voice.js`, `functions/api/voice/v1/[[path]].js`, `functions/voice/[[path]].js` | One narration layer for the Documentary reader, Kino and Bibliotheca's narrator (Augmented Reading, which uses an online voice only when the reader chooses it, after it shows the cost in characters): this device's voice, or an online Azure voice through the site's own proxy (key, quota and cache on the server; set-up in `OPERATIONS.md`, section 4), falling back to the device voice whenever the online one cannot carry on. |
| Data for programs and AI tools | `functions/api/v1/[[path]].js`, `functions/mcp.js`, `integration/openapi.json`, `llms.txt` | The site's public data, read-only and with no sign-in: a JSON API at `/api/v1/` (described by `openapi.json`), an MCP server at `/mcp` for AI assistants, and `/llms.txt`, a short guide for language models. The Integration Hub rebuilds `openapi.json` and `llms.txt` every day. |
| Bridge | `sigint/bridge/prp-bridge.mjs` (and its `README.md`) | One Node file with no packages that the user runs on their own computer, on `localhost` only: SIGINT's relays, and, started with `--iot`, IoT Connect (Digital Science): discovery by each kind's standard question, the ownership tick, documented pairing with Y in its window, fixed command tables, an MQTT 3.1.1 and Sparkplug B link to the user's own broker, the phone remote with `--lan`, and Hermes Messenger, whose findings the Integration Hub's Agents tab lists (`integration/agents.json`). Secrets stay in its own state file, never in the repository or a page. |
| App | `manifest.json`, `sw.js`, `design/icons/`, `apple-touch-icon.png`, `design/scripts/render-icons.mjs` | Vitruvian Manager as a free installable app (Android and iPhone, from the browser): the manifest, icons rendered once from the mark, and an offline worker that keeps only the shell's and IoT Connect's own files, network first, and leaves every other request (other sites, data, `/api/`, `/mcp`, the bridge) alone. The shell registers it. |
| Aircraft proxy | `functions/api/sigint/adsb/[[path]].js` | Relays adsb.lol's aircraft positions to the SIGINT Dashboard, which a browser cannot read from adsb.lol directly. |

### One page, one submodule

A submodule is one page. A page's own views (archives, map/compare, live/archive, course parts) are **tabs inside the
page**, listed under `views` in the registry, never extra sidebar entries.

### Adding a submodule

1. Add an entry under the right module in `registry.json` with `id`, `name`, `kind`, `icon`, `status` (`live`,
   `in-build` or `planned`), `host`, `url`, `description` and `data` (its freshness line: see `design/prp-freshness.js`).
   Add `opensInNewTab: true` for private pages behind their own sign-in.
2. Hook the page up to the design system (see `design/PRP-STYLE.md` §2) and follow its anatomy and checklist.
3. If the page mentions people, places, wars, parties or ideas, add an adapter in `lake/scripts/adapters.mjs` so the
   Master Index links to it.
4. Commit and push. GitHub runs the whole test suite, and the site deploys only if it passes.

## Data refreshes

Every timed job (the GitHub workflows that rebuild and commit the data, the trading Worker's jobs, Double Signal's
scan, the Supabase jobs) is listed in [OPERATIONS.md](OPERATIONS.md): when it runs, what it writes, and how you know it
broke. Each refresh runs its tests before it commits, and the site deploys from GitHub only once the whole suite has passed
on that very commit (.github/workflows/pages-deploy.yml, which every deploy goes through).

## Tests

```bash
npm run test:unit                                 # the fast tests: no browser, no network (any platform)
npm run test:e2e                                  # everything, pages included, against a local copy it starts itself
node --test tests/*.test.mjs                      # data and page tests
PRP_URL=http://localhost:8787 node --test tests/platform.test.mjs   # shell and pages, with Edge via playwright-core
node tests/tools/serve.mjs 8787                   # local static server (keeps .html and query strings)
node tests/tools/shoot.mjs <url> <out.png> [--dark] [--width 390]   # screenshot a page in light or dark
node integration/scripts/coverage.mjs --json coverage.json --md coverage.md   # which countries each piece of content covers, and the gaps (no network)
```

CI (`.github/workflows/ci.yml`) runs the whole suite on every push and pull request, against a local copy of the site
served like Cloudflare Pages, and deploys that commit from main when it passes. The page tests read the site at `JDPI_URL` (the
platform test prefers `PRP_URL`); CI points both at its local copy, and without them most page tests fetch the live
site. `PRP_PAGES=0` leaves out every test that needs a browser or the network: the data refreshes test their new data
that way before they commit it.

## Licences

Code © JDP-Iq. Wikidata facts are CC0. Wikipedia summaries are CC BY-SA 4.0 and are credited where shown. Each data source
is credited on the page that uses it. `volatility/scripts/fips-iso3.json` is a table of country codes and names extracted
from the countrycode project (Arel-Bundock, Enevoldsen and Yetman, GPL-3.0), recorded with its source commit and checksum;
the codes themselves are facts, and the file is not part of Vitruvian Manager's code.
