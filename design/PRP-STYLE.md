# Vitruvian Manager style and naming guide

**Vitruvian Manager** (short **VM**) is a product of **JDP-Iq** (lower-case q, always). It was called PRP before, and
JDP-I before that. This guide (still in `design/PRP-STYLE.md`) is what every page in the suite follows. The stylesheet is
`design/prp.css`; the connector script is `design/prp-bar.js`.

**"prp" is the internal name and stays.** File names (`design/prp.css`, this guide), tokens (`--prp-*`), classes
(`.prp-*`), registry ids, message types (`prp:theme`), storage keys (`prp.theme`) and the repository keep it; only what
people read changes.

## 1. Names

**The product.** Write **Vitruvian Manager** in prose, descriptions, alt text and labels, and anywhere read away from the
app (feeds, calendars, the API, the MCP server, `llms.txt`). Use **VM** only where the brand is in view and space is
tight: page titles (`<Submodule> · VM`), the sidebar's brand chip, the breadcrumb's first step, the standalone page bar
(`← VM / Module / Submodule`) and a diagram box too narrow for the full name. Keep "by JDP-Iq" where the maker is named.

**The mark.** `design/brand-vm.svg` (Vitruvius, VM's mascot, in an amber hard hat inside a circle, on the dark tile;
for 40 px and up) and `design/brand-vm-icon.svg` (the favicon: his head and hat only, so that it reads at 16 and 32 px).
The shell plays `design/vm-loading.svg` (Vitruvius running) while a page loads. Each SVG embeds its picture as data, so
it draws as an `<img>`. `design/brand-prp.svg` stays in place only for old external links.

**Vitruvius.** The mascot's pictures are in `design/vitruvius/`, listed with their words in `index.json` and shown on
`design/vitruvius/index.html`. Each suite's `"mark"` in the registry is its picture of him (64 px WebP, with 128 and
256 px ones beside it); each submodule's `"art"` sits beside its `"icon"`. **A picture is drawn only at 40 px or more**
(shell.js `ART_MIN`): smaller, every one is the same figure in the same circle and only the tool he holds differs, by
a few pixels, so they cannot be told apart. So the sidebar, the rows of a Home box and the Dashboard button keep the
glyphs, and no mark stands beside a module's code; the module's mark is in its box on the Home page (40 px) and at the
head of its overview (104 px, 72 on a phone), and a submodule's picture is on its Dashboard tile and its overview row
(44 px). Each has `width` and `height`, a `srcset` of the 64, 128 and 256 px files (`sizes` the drawn size, so a 40 to
64 px place never fetches the 256 px file), `decoding="async"`, `loading="lazy"` when it may be off screen, an empty
`alt` because the name is beside it, and the glyph behind it, which shows if the picture fails. A submodule with no
picture shows its glyph in the same round off-white medallion. Omni News's landing page shows its suite's 256 px
picture in its header, with alt text. Every place that shows him
can reach the credit: "Vitruvius, VM's mascot, was drawn by an AI image model (ChatGPT) from VM's own description; no
person drew or retouched the pictures. He is a new character, not a copy of Leonardo's drawing." New pictures go
through `design/scripts/vitruvius-art.mjs` (backgrounds removed, trimmed, size limits of 12 KB at 64 px, 20 KB at
128 px and 40 KB at 256 px; nothing inside a picture is redrawn or moved, so the credit stays true) and then
`design/scripts/render-icons.mjs`. Kino's module card credits the picture with a short "Drawn by AI" link under it
(the sentence as its title), not in the stage's floating credit box.

| Old | New | id (registry) | Code |
|---|---|---|---|
| JDP-I, then PRP (platform) | **Vitruvian Manager** (**VM**), by **JDP-Iq** | | |
| (new, November 2026) | **Home** (the Home page and the Dashboard) | `home` | HM |
| Q · Geopolitical Intelligence | **Realtime Geopolitics** | `rt` (alias `q`) | RT |
| (new, November 2026; Highbrowse until 14 November 2026) | **Omni News** (the four briefings) | `hb` | ON |
| H&P · History & Politics | **Retrospective Geopolitics** | `rs` (alias `hp`) | RS |
| F&E · Finance & Economics | **Wealth Automation** (Money Management until 15 November 2026) | `mm` (aliases `fe`, `wealth-automation`) | WA (MM until 15 November 2026) |
| (new) | **Intelligence Collection** (International Mystery Management until 15 November 2026) | `oi` | IC (OI until 14 November 2026, from Offensive Intelligence; IM until 15 November, from International Mystery Management) |
| (new) | **Natural Science** | `ns` | NS |
| (new) | **Digital Science** | `ds` | DS |
| (new) | **Kino** (documentaries) | `kino` | KN |
| Kino's submodule Bibliotheca (until November 2026) | **Bibliotheca** (the reading room) | `bibliotheca` | BT (the word is a compound, Biblio-Theca; BB until 17 November 2026) |

In the registry the ten are "suites" and their pages "modules"; in the interface we say **module** for the ten and
**submodule** for the pages. A module has a short `name` (the sidebar, the breadcrumb, search) and a full `title` (its
overview page, its box on the Home page, the Dashboard's headings, page eyebrows, the tab title); today they are the same for
every module (International Mystery Management's sidebar name was Int-Myst Mngmnt until 15 November 2026). It also has a `summary`: what you can do
with it, in a line or two (about 110 characters at most), for the back of its box on the Home page. Write it from what
its submodules do, beginning with a verb: "Follow today's politics, conflicts and country risk: headlines, volatility,
wars, leaders and coming votes."

| Submodule | Module | Notes |
|---|---|---|
| Dashboard (was the Workspace, the home page) | HM (new, November 2026) | drawn by the shell itself (`"shell": "dashboard"`, no `url`): the Today panel over every module and submodule, at `#/home/dashboard`; `#/workspace` lands there |
| Highbrowse (the module's landing page) | HB (new) | `highbrowse/`: the day's and the week's news across the four briefings (the biggest stories and topics, each briefing's coverage, the stories they share, the political spread) and one search across them; Today, This week, Search and Trends are tabs; it reads the briefings' own stores, and for Trends each briefing's `trends.json`, written with its store |
| Political Briefing (was Intelligence Briefing, before that Briefing) | HB (moved from RT) | `q/briefing.html`; reads `#q=` and `#w=` as the other briefings do, and `soft=1` to show sport, entertainment and lifestyle on one visit; a move by hash also puts back All stories, every publisher and all five positions. It opens on Top stories; `v=` picks the tab (`top`, `latest`, `publishers`), an address with `q=` opens Latest on that search, as before, and `?tab=publishers` the catalogue; `p=` picks the position whose top stories show where they are one at a time (1200 px or narrower) |
| Global Headline Tracker | RT | one submodule: 24-hour map and day/week/month/year archives are tabs inside the page; its filter of lowbrow stories is **Highbrowse** (wordmark `design/highbrowse-wordmark.svg`; the code and the database still say `lowbrow`), the name the Highbrowse module shares |
| Geopolitical Volatility, National Analysis, Realtime Battlefield, Realtime Calendar | RT | |
| Month by Month (new, 15 November 2026) | RT | `q/monthly.html` (data `monthly/`): VM's monthly direction marks, drawn anywhere by `design/prp-mark.js` (`.prp-mark`, `.prp-strip`): the words "More deaths recorded", "Fewer deaths recorded", "No large change by this rule" or "No mark", never better or worse; one neutral hue, the sign for the direction and the fill for the confidence; every mark with what changed, its period, its evidence and its confidence (or why there is none) beside it |
| Political Atlas | RT (moved from H&P) | external site political-atlas.pages.dev |
| OSINT Dashboard, SIGINT Dashboard, GEOINT & IMINT Dashboard | IM (new; moved from RT) | `osint/`, `sigint/`, `geoint/`; tabs include a Software Cookbook, a Kit or Hardware Guide and Law & ethics |
| Intel Training (was OSINT Training) | IM | `fe/learning.html?course=osint|sigint|geoint`: three courses as tabs |
| Master Index | RS | |
| Political Retrospective (was H&P Retrospective) | RS | external site hp-retrospective.pages.dev |
| Historical Calendar, Kardashev Tracker | RS | |
| Retrospective Battlefield | RS | world map 1926–2025 (`battlefield/history/`) |
| War Focus | RS | now its own submodule (`battlefield/focus/`) |
| Learning · Politics | RS | `fe/learning.html?course=politics` |
| Market Monitor (was TD Markets, then Market Briefing until 14 November 2026) | WA | trade-desk `/markets/` |
| Economics Briefing | HB (moved from MM) | `econ/briefing/` |
| Auto Trader (since 15 November 2026 one submodule of three parts, each a view: Tally Stick, the old Auto Trader and Algo Trader were three submodules) | WA | registry id `traders`, page `fe/traders.html`; its aliases keep every old id (`auto-trader`, `tally-stick`, `algo-trader`, `double-signal`) and add `omni-trade` and `investor-impersonator`, each landing on its view |
| · Omni Trade (was Tally Stick) | WA, a view of Auto Trader | trade-desk `/tally/` (private, opens in a new tab); view id `omni-trade`, alias `tally-stick` |
| · Investor Impersonator (was Auto Trader, before that Trader Tracker) | WA, a view of Auto Trader | `fe/traders.html`, with the tabs Members of Congress and Famous investors (the old views `congress` and `investors`, now its aliases, open their tab); view id `investor-impersonator` |
| · Algo Trader (was Double Signal) | WA, a view of Auto Trader | trade-desk `/tally/algo/` (private, opens in a new tab); view id `algo-trader`, alias `double-signal`; Double Signal's logic is the **Double Agent** ruleset |
| Learning · Finance & Economics | WA | `fe/learning.html?course=finance` |
| Scientific Briefing | HB (moved from NS) | `science/briefing/` |
| Invention Timeline | NS (new) | `science/progress/` |
| Digital Briefing | HB (moved from DS) | `digital/briefing/` |
| Data Analytics, Integration Hub | DS (new) | `analytics/`, `integration/`; the Hub's Agents tab lists Vitruvian Manager's agents (`integration/agents.json`, Hermes Messenger first) |
| IoT Connect | DS (new, November 2026) | icon ⊶ (two linked nodes; its own since 12 November 2026, when it stopped sharing the Home page's ⌂). `digital/iot-connect/`: your own smart devices through the Vitruvian Manager bridge, with Hermes Messenger, a UNS (MQTT, Sparkplug B) and the phone as the remote; tabs Overview, Devices, Remote, Hermes, UNS and Law & safety. Its page runs under its own strict Content-Security-Policy (`_headers`): no inline script or style, no style attributes, device text only ever as text, and only the bridge on `localhost:8790` besides the site itself |
| Political Events, Political Figures, Political Parties, Wars, Geopolitical Events, Great Thinkers | KN (new) | `kino/index.html?cat=<id>` |
| Neo Book (was Kino's Bibliotheca, with Neo Book its one view) | BT (new, November 2026; moved from KN) | `bibliotheca/neo/`, the same page at the same address with every key (`book`, `ch`, `p`, `t`, `pane`, `show`, `era`, `ar`); registry id `neo-classic`, alias `bibliotheca`, so `#/kino/bibliotheca` opens it at `#/bibliotheca/neo-classic`; its eyebrow reads "Bibliotheca · Neo Book" |

**Sidebar order.** Home comes first, its Home page item (with ⌂) where every other module has its "Module overview".
Within each module the strongest submodules come first, the calendar second-last and the course last.

Never write "JDP-I", "PRP", "Q", "H&P" or "F&E", or a module's former name, in visible text any more (code identifiers,
file names and URLs may keep them). Page titles: `<Submodule> · VM` (e.g. `Political Briefing · VM`).

**One page, one submodule.** A page's own views (archives, map/compare, live/archive, course parts) are **tabs inside
the page**, never separate sidebar entries. Tabs use `.prp-tabs` with `role="tablist"`, update the URL
(`history.replaceState`) so a view can be linked, and switch without a full reload where practical.

## 2. Hooking a page up

```html
<html lang="en" data-suite="rt">              <!-- rt | hb | rs | oi | mm | ns | ds | kino | bibliotheca -->
<meta name="theme-color" content="#f3f4f6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1318" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../design/brand-vm-icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../design/prp.css">   <!-- loads the fonts; drop the old DM/Manrope font links -->
<script src="../design/prp-bar.js" data-suite="rt" data-module="briefing" data-shell="../" defer></script>
```
External sites use the absolute URLs `https://jdpi.pages.dev/design/prp.css` and `…/prp-bar.js`.
`prp-bar.js` applies the theme (light by default, dark by system or choice), sets the accent, hides
`[data-jdpi-standalone]` elements inside the shell, and fires `window` event `prp:themechange` when the theme changes:
**anything drawn in canvas/SVG/Leaflet with theme colours must re-read the tokens and redraw on that event.**
Read a token in JS with `getComputedStyle(document.documentElement).getPropertyValue('--prp-map-land').trim()`.

### In the shell: one frame per submodule, and Kino's now-playing bar

The shell keeps one frame per submodule (and view). A deep link (`#/<module>/<submodule>?at=<url>`) moves that frame:
when only the hash differs the page stays loaded and its address changes in place, so **a page that can be linked to
by hash must re-render on `hashchange`**; a different query loads in the same frame. While a frame loads a new page,
the shell plays Vitruvius running (`design/vm-loading.svg`, about 160 px; still under `prefers-reduced-motion`) in the middle of the workspace, on
top of the page but letting clicks through, until the frame's load event (or until 600 ms after it when the page came
in under 300 ms, so that a quick page does not flash it); a hash-only move shows nothing. A page therefore needs no
loading screen of its own for its first paint. While a Kino film follows along,
the shell shows a compact bar over the bottom of the workspace (Kino accent, `--prp-*` tokens, a labelled region with a polite
live caption): Kino posts `prp:nowplaying` messages and the bar posts `prp:kino-control` back, same origin only (the
protocol is in `kino/README.md`, "Now playing"). It covers the bottom of the workspace (about 60 px, 80 px on phones),
so a page should not pin anything it needs there.

### A page of Vitruvian Manager beside a page's content: the shared pane

When a page shows another submodule's page beside its own content (Kino's Split view, Bibliotheca's pane), it uses
`design/prp-split.js` and `design/prp-split.css`, never a frame of its own making. The module is exports only (its pure
parts, `frameMove`, `clampShare` and `canFrame`, are tested in Node in `tests/prp-split.test.mjs`); the host marks its
container `.prp-split` (`data-side="on|off"`) and the pane `.prp-side`, and lays out the narrow case in its own CSS.

- **What may be framed** is the shell's own rule (`canFrame`): a submodule in the registry, not `opensInNewTab`, at an
  address on its own page. A private page (Auto Trader's Omni Trade and Algo Trader: a view marked `opensInNewTab`, found by its id, an alias or its page) is offered as a link in a new tab; a page on another
  site that is its submodule's own page (Political Atlas, the Political Retrospective) is framed, as the shell frames it.
  A page that loads without the connector (`design/prp-bar.js`) is a missing page, on the live site and locally: its
  frame goes and a card says so, so the shell never runs inside a pane.
- **Frames** are named `prp-side`, with no `allow` and no `sandbox`, and are moved like the shell's (`frameMove`: by hash
  where only the hash differs, with `location.replace`). They get the host's theme (`prp:theme`), and on its own the
  host turns their top links into new tabs. A framed page's `prp:navigate` is passed on to the shell inside it, and opens
  the shell at that route in a new tab without one. A page whose `window.name` is `prp-side` (`inSidePane()`) offers no
  pane, Follow or narrator of its own, and its `shellGo` only posts its message.
- **The divider** (`splitter`) is the pane's own left edge: 8 px (20 px on a touch screen), `role="separator"` with its
  value, dragged with any pointer (the frames ignore the pointer meanwhile) or moved with ← → (two points), Home, End and
  Enter (back to the start). The share is a per-viewer convenience in `localStorage`, never in the address.
- **Full screen** (`fullScreen`) sets `data-prp-fs` on `<html>` however it ends; the host hides its button where
  `supported` is false. Full screen with the pane on shows both, with it off the content alone: the same key turns the
  pane on and off in both. The shell leaves full screen whenever it changes the frame in view.
- Tokens only, light and dark; nothing in the pane slides or fades; no sideways scroll at 360 px.

### In the shell: the Home page and the Dashboard

The shell draws two pages itself, both the Home module's (`shell.js`, `shell.css`), on the same anatomy as any other.

**The Home page** (`#/`) is where VM starts: the eyebrow "Vitruvian Manager · by JDP-Iq", the title "Home", the intro
(the registry's `platform.tagline`: "Vitruvian Manager's modules allow you to learn, earn, create, and control.") and a
small button (`.prp-btn.sm`) to the Dashboard; then every other module as a box, in registry order, four across on a
wide screen and one on a phone. A box is one link to the module's overview. Its front shows the module's code, its mark
where it has one, its full title and its submodules' icons, under a rule in its accent; its back, its `summary` on its
accent's soft tint, and "Module overview →". It turns over (a 3D card flip about its upright axis) while a mouse is
over it, while it has keyboard focus, and at a first tap on a touch screen, a second tap opening it; a click or Enter
opens it at once. With reduced motion nothing turns: the back shows in place of the front. The link is named by the
title and described by the summary (`aria-labelledby`, `aria-describedby`), so a screen reader gets both whichever face
is up; the faces swap by transform and opacity, never `visibility` or `display`, which would take one from it.

**The Dashboard** (`#/home/dashboard`, breadcrumb VM / Home / Dashboard) was the home page, the Workspace, until
November 2026: the Today panel (`design/prp-highlights.js`), the four counts, and every module and submodule as tiles.
It is the one submodule without a page of its own: the registry gives it `"shell": "dashboard"` in place of a `url`, and
the shell draws it in its view, with no frame. `#/workspace` lands on it, and `#/home` on the Home page. Under its intro a health
mark (`.prp-status`, a dot with words) appears only when the daily data check failed, naming what failed and the
check's date, or when the check has not run for three days (`status/health.json`, OPERATIONS.md "The alarm").

**Freshness lines** (13 November 2026). Whether a page is available is one thing; how fresh its data is, another. Each
submodule has one line saying how fresh its data is, worked out by `design/prp-freshness.js` from its registry `data`
(never typed): the time is its store's own, the rhythm its refresh workflow's cron. The shell shows it in the top bar
(below 1200 px its short form, the whole line still read out), each sidebar item's title (with a "Late" flag like "In
build"), each Dashboard tile's foot, each module overview's "Last update" column and, a module's freshest, on the back of
its box on the Home page. The vocabulary, and nothing else:

| Class | Reads | For |
|---|---|---|
| Updated | "Updated 13 Nov 20:37 UTC · every six hours" (the time for a rhythm of a day or less, the date for weekly or monthly) | a store a VM workflow rebuilds |
| Data to | "Scored to 12 Nov · daily"; "Figures to Sep 2026 · UCDP monthly, checked weekly"; "Trades filed to 6 Nov · 13F holdings to 30 Jun 2026 · checked weekly" | data whose own period ends before its build |
| Reviewed, Checked | "Reviewed 6 Nov · monthly review" (Political Atlas); "Checked 4 Nov · monthly" (Kino) | a review of records; a re-read of sources |
| Combined | "Reads the four briefings · all updated since 13 Nov 18:52 UTC", or naming the late one; "Each card dated" | Highbrowse; the Dashboard |
| No time | "Available · prices delayed"; "On demand · asks its sources when you use it"; "Private · runs every minute"; "Reference · built 26 Oct · no schedule"; "Course · no schedule"; "Collected daily, country by country" | pages whose data has no store time here |

**Late** ("Late: updated …", after a warning dot) is the daily data check's own rule: older than twice the rhythm plus
three hours, or a store `status/health.json` names as failing and that has not been rebuilt since. Until a line's file
is read, or if it cannot be, the line gives its rhythm alone ("Updated every six hours"), which is always true. Never
write "Live" or a kind badge (Realtime, Retrospective…) where a reader could take it for freshness: `status: live` means
only "published". Times are UTC and say so. Pages carry the same idea inside: Realtime Battlefield dates its conflict
figures over the map and its news under each war; National Analysis puts each figure's year or date and source under
it; the Global Headline Tracker puts the archive day and the collection time above its results.

**The count** is worded one way wherever it shows: "10 modules, Home included · 38 submodules" (`countWords`).
Where each module's submodules are hosted is said in its overview's **About this module**, not in a column.

**The Today panel's rules** (13 November 2026). Each card reads only the small summaries each store's own build writes
beside it (`integration/scripts/heads.mjs`): never a copy made at another time, so a card can never be older than the
page it links to (`tests/heads.test.mjs`). Each line opens the one thing it names, through the shell's deep link
(`#/<module>/<submodule>?at=<that page's own address>`): a country (`q/volatility.html#country=IRL`), a topic
(`highbrowse/index.html#tab=trends&t=economics.monetary`, in Highbrowse's existing frame), an event
(`q/calendar.html?period=contemporary&event=<key>`) or a ticker (the Market Monitor's `#t=`). A link is built only from a
key that passed its pattern (`KEYS` in `design/prp-highlights.js`); anything else opens the submodule's front page. A
page opened on a thing that has gone opens as usual, with a plain `.prp-note.warn` saying so. The "Headline trends"
card and Highbrowse's Trends tab read the same `trends.json`, worked out by `design/prp-trends.js`, so they never
disagree; their wording stays modest: counts of the stories VM collected, never a claim about importance or truth.
With too little history they say so and show no number; until then the card gives each briefing's stories this week,
exactly the tab's "This week" (a week not held in full names its missing days). A share neither rising nor falling is
"Within its usual range", never "Steady". A trend line puts its percentile first, so a narrow card never cuts it, and
the card marks a briefing "Late" by the same rule as every freshness line, naming one it could not read.

## 3. Tokens (write CSS against these; no raw hex in page CSS)

- Surfaces: `--prp-canvas` (page background), `--prp-surface` (panels, inputs), `--prp-surface-2` (table heads,
  toolbars), `--prp-surface-3` (hover/selected), `--prp-line`, `--prp-line-soft`, `--prp-line-strong`, `--prp-scrim`.
- Text: `--prp-text` (ink), `--prp-text-2`, `--prp-muted` (metadata), `--prp-faint` (hints only), `--prp-on-primary`.
- Action: `--prp-primary`, `--prp-primary-hover`, `--prp-primary-soft`, `--prp-link`, `--prp-focus`.
- Module accent: `--prp-accent`, `--prp-accent-soft` (set by `data-suite`); also `--prp-hm|rt|hb|rs|oi|mm|ns|ds|kn|bb` and
  `-soft` (Home's `--prp-hm` is a neutral, the secondary ink `--prp-text-2` in each theme, since Home is VM itself;
  Highbrowse's `--prp-hb` is Tyrian purple, the senator's stripe; Bibliotheca's `--prp-bb` is rubric, the red of a
  manuscript's headings).
- Status (text-safe): `--prp-good|warn|bad|info` and `-soft`; gains/losses `--prp-up`, `--prp-down`.
- Data: categorical `--prp-cat-1…8` (fixed order, never cycled; scatter/maps use ≤3 colours before folding to
  "Other"), sequential `--prp-seq-100…700` (one hue, light→dark), diverging `--prp-div-neg-3…1`, `--prp-div-mid`,
  `--prp-div-pos-1…3`, status marks `--prp-status-good|warning|serious|critical`, `--prp-grid`, `--prp-axis`.
- Maps: `--prp-map-water`, `--prp-map-land`, `--prp-map-nodata`, `--prp-map-border`, `--prp-map-graticule`,
  `--prp-map-label`, `--prp-map-halo`. Raster basemaps: Esri Canvas `World_Light_Gray_Base` in light, `World_Dark_Gray_Base` in dark
  (`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/<layer>/MapServer/tile/{z}/{y}/{x}`, attribution "Tiles © Esri —
  Esri, HERE, Garmin, © OpenStreetMap contributors"), swapped on `prp:themechange`. (CARTO basemaps now need an API key.)
- Type: `--prp-font-serif` (Source Serif 4: page titles, section headings, reading text, captions),
  `--prp-font-ui` (IBM Plex Sans: everything interactive and body), `--prp-font-mono` (IBM Plex Mono: labels, codes,
  timestamps, numbers in tables). Sizes `--prp-fs-xs|sm|(base)|md|lg|xl|2xl`. Numbers: `font-variant-numeric: tabular-nums`.
- Shape: `--prp-radius-sm|radius|radius-lg`, `--prp-shadow-1|2`, `--prp-measure` (72ch reading width).

Political-position colours in the Political Briefing (far left … far right) stay as the page's own named tokens,
defined for both themes.

## 4. Page anatomy (publication front matter + ERP object page)

1. **Header**: `.prp-eyebrow` "Omni News · Political Briefing", always with the module's full title
   ("Intelligence Collection · OSINT Dashboard", never a shortened sidebar name); mark the eyebrow and
   any standalone brand with `data-jdpi-standalone` only if it duplicates the shell. Then `.prp-title` (serif h1),
   `.prp-dek` (one or two plain sentences: what this is and what you can do), `.prp-meta` line (Updated … · Source … ·
   Coverage …).
2. **Tabs** for the page's views (`.prp-tabs`).
3. **Toolbar/filters** in one row above the content (`.prp-input`, `.prp-select`, `.prp-chip`, `.prp-btn`).
4. **Content** in `.prp-panel`s: tables (`.prp-table`), KPI tiles (`.prp-kpis`/`.prp-kpi`), maps and charts as
   **figures** with a caption: `<figure class="prp-figure">…<figcaption><b>Figure 1.</b> What it shows. Source.</figcaption></figure>`.
5. **Sources** block at the bottom (`.prp-sources`): data sources, licences, refresh cadence, method notes.

Layout: max content width ~1440px, 24px page padding (16px on phones), 12–16px gaps. Light surfaces, 1px lines, small
radii, almost no shadows. Never a horizontal page scroll at 360px wide.

## 5. Components (classes in prp.css)

`.prp-panel`, `.prp-panel-head`, `.prp-panel-body`, `.prp-btn` (`.primary`, `.ghost`, `.danger`, `.sm`), `.prp-input`,
`.prp-select`, `.prp-tabs`, `.prp-chip` (`.on`), `.prp-code` (module code chip), `.prp-kind` (a small badge; the shell
no longer uses it for Realtime/Retrospective, which read as freshness), `.prp-status` (`data-status="in-build"` or
`.good|.warn|.bad`; the shell no longer shows "live"), `.prp-fresh` (shell.css: a freshness line, `.late` with its dot), `.prp-table` (`.num` cells),
`.prp-kpis`/`.prp-kpi`, `.prp-figure`/`.prp-caption`, `.prp-note` (`.warn`, `.bad`), `.prp-sources`, `.prp-empty`,
`.prp-label`, `.prp-meta`, `.prp-prose` (serif reading text), `.prp-num`, `.prp-up`/`.prp-down`.
Legacy `.jdpi-*` classes still work and look new.

**Time sliders: the period control** (`design/prp-period.js`, styled by `.prp-period` in prp.css). Every map that moves
through time uses it: ‹ ▶ › (optional), an optional strip of counts above, two handles on one track, the start of the
period (hollow) and its end (filled), and labelled ticks. A page loads the script before its own and calls
`PRPPeriod.mount(el, { stops, rest, labels, ids, play, ticks, strip, onChange })`; `period.set(from, to)` moves it from
code (`from` null puts the start at rest) and `period.update({ stops, ticks, from, to })` swaps its data. `rest` says where
the start sits until it is moved: `'first'` on an up-to page (the Invention Timeline, War Focus: everything up to the
end), `'end'` on a snapshot page (one year, month or day: the start rides on the end, and ‹ ›, play, the track and the
end handle move that one time as before). At rest a page behaves exactly as it did with one handle and writes no start to
its address; moved, the page shows the period and adds its start after the end parameter (`&f=` in a hash, `from=` beside
word keys). The start pushed past the end takes it along, the end pulled back past the start brings it, a click on the
track moves the nearer handle, and play runs from the start handle. Consecutive whole-number stops (years) keep the
inputs' values as the stops themselves, other stops as indices; each input carries `data-value`. The rules are pure
functions in `PRPPeriod.rules`, tested in `tests/prp-period.test.mjs`. Keep the page still around it while a handle
moves: whatever shares its row or sits above it (the year or period named beside it, header figures, a picker whose
names change with a period) keeps one width and one number of lines at rest and in a period, by reserving the widest
text or by giving the control a row of its own. Otherwise the first move of the start handle shrinks or drops the track
under the pointer mid-drag, and the handles jump (the end too). Test a drag with a real pointer (`page.mouse`), not only
with keys or `fill()`.

**Free sources lead: the access rule** (`design/prp-access.js`, styled by `.prp-access` and `.prp-access-alt` in
prp.css; Jude's rule of 6 November 2026). Every section that gathers the day's biggest stories from many outlets uses it:
Highbrowse's Today and This week, the Political, Scientific, Economics and Digital Briefings, the Global Headline Tracker
and National Analysis's latest headlines. `design/prp-access.json` classes every source VM collects from as `free`,
`signup`, `metered`, `paid` or `unknown` (could not be checked: counts as free), with the evidence and the day it was
checked; a publisher's own mark on one article (an open licence or `isAccessibleForFree` in its feed, LWN's "[$]")
overrides its source. A page loads the script and the table (`PRPAccess.load(…)`, a table that cannot be read counts
every source as free), classes each link (`T.classify({ briefing, id, host, name, url, mark })`: by feed id, then the
home page's host, never a Google News relay's), and orders every list it shows with `PRPAccess.leadFree` (or
`leadFreeGroups` for groups, such as the Tracker's outlets) after its own sort and filters: the first free entry takes
the top place, the rest keep their order. A story grouped from several outlets leads with a free copy. Links to sources
that are not free carry `PRPAccess.label(cls)` inside the link, at its end ("Paywall" or "Sign-up", read as part of the
link's name), and, where VM's data already groups the same story, `PRPAccess.altLink(…)` beside it ("Free at …"); where
it does not, nothing is offered. The subject briefings' builders apply it when they merge copies (`alt` keeps each
copy's link); the pages apply it again on load, so a table changed since the last refresh holds at once. Each section's
method note says that free sources lead. Tested in `tests/prp-access.test.mjs`.

## 6. Data visualisation rules

Colour follows the entity, never its rank; categorical colours in the fixed order; sequential = one hue light→dark;
diverging = two hues with a grey midpoint; status colours only for status and always with a word or icon. Thin marks,
recessive gridlines (`--prp-grid`), a legend for ≥2 series, direct labels where few, text in text tokens (never in the
series colour), a hover tooltip on marks, and a table or list view for anything a map or chart shows. No dual axes. Exception: a map may use more than three categorical colours (e.g. Invention Timeline, one per discipline) only when every mark is also named in a legend with counts that filters, in its tooltip and in a list.
More than eight categories (e.g. the calendars' seventeen event types): group related types into families, give each
family one categorical colour in the fixed order and each type in it its own shape (● ■ ◆), and name every mark in
chips that count and filter, a legend, the tooltip and the list. Never cycle the eight colours.

### A country with no data: drawn, hatched and explained

Every map that is about countries (Jude’s rule of 16 November 2026) draws all 197 of VM’s countries (the United Nations
members, the Holy See, Palestine, Kosovo and Taiwan): as its shape, or as a dot where the border file has none. A country
the page has nothing for is drawn in one quiet hatched grey, `--prp-map-nodata` crossed by `--prp-map-border`, the hatch
National Analysis and Volatility already draw; never blank, never bare tiles. Pointing at it or tapping it gives one
sentence, and its panel repeats it: "<Country>: no <what this page shows> <for when>. <Why, naming the source>.", as in
"Taiwan: no figures. The World Bank, this page’s source, does not publish data for Taiwan." The why is one of six
reasons: the source does not cover it; nothing recorded; too few reports to score; no row in this table; not on either
side; not an independent state that year. A page loads `design/prp-mapkit.js` and takes all four from it:
`PRPMapkit.countryOf` for which country a shape is (by its ISO number, then by name: the shape named Kosovo is XKX;
Northern Cyprus and Somaliland are no country), `PRPMapkit.dots(layer)` for the dots a border file needs (`'110m'`,
`'50m'`, `'cshapes'`), `PRPMapkit.NODATA` and `install()` for the fill (`.prp-nodata`, `.prp-nodata-swatch` in a
legend), and `PRPMapkit.sentence` for the words, so each page writes only its own tooltip. Left out of the rule: Kino’s
film maps, which illustrate a story (its validator makes sure every country a scene names can be drawn); the Kardashev
Tracker and the Invention Timeline, which draw land without borders and say in one caption sentence what an empty place
means; GEOINT, SIGINT and the OSINT media tab, which have no country subject. The Political Retrospective, its own
repository, carries a copy of the kit, and a jdpi test must keep the two equal; the Political Atlas already draws all
197 and keeps its own code. Tested in `tests/mapkit.test.mjs`.

### Documentary mode: zooming to what is read

The narrator (`design/jdpi-narrator.js`) sends each step's places to the page as a window event `prp:focus`
(`{ countries: [ISO3 | 'gw:<code>'], points: [[lon, lat]], bbox: [w, s, e, n], qids: ['Q…'], padding, label }`, or
`{ reset: true }` when reading stops or ends). A step without places is first offered to the page as
`prp:focus-request`, then read from `data-iso3`, `data-lonlat`, `data-bbox` or `data-qid` on the passage. A map page loads
`design/prp-focus.js` and calls `PRPFocus.listen({ focus, reset, request })`, turns the targets into one box with
`PRPFocus.resolve`, fits it (`PRPFocus.d3View(…).fit(box)` or `PRPFocus.leafletFit(map, box)`), outlines what it found
with `.prp-focus-hit` and offers a way back. All targets of a step are fitted at once; motion follows
`prefers-reduced-motion`. Read-aloud text treats a full stop as the end of a sentence only before a space or the end
of the text: "3.5" is read "3 point 5", "jdpi.pages.dev" "jdpi dot pages dot dev".

### Narration: one voice layer

Every page that reads aloud speaks through `design/prp-voice.js` (`PRPVoice.reader`), never `speechSynthesis` directly:
the Documentary reader, Kino and Bibliotheca's narrator (the AR Reader) today, Auteur and Personal Genius when they speak. The reader tries its
backends in order for each passage (`'prerendered'`, not built yet; `'stream'`, an online voice through the site's proxy
`/api/voice/v1/`; `'webspeech'`, this device's voice) and falls back silently, from the sentence where one stopped, telling
the page once (`onBackend`) so it can say so in a status line. Voice lists group this device's voices ("This device") and
the proxy's ("Azure (online)"), the online group only once the proxy says it is set up; the choice is saved in
`jdpi.doc.voice` (a device voice by its name, an online one as `azure:<voice>`). Call `reader.unlock({ voice })` at the top
of every Play click handler, before anything waits: iOS plays clips only on an element first played inside a tap. Words a
voice gets wrong go in `PRPVoice.lexicon` (bump its version: it is part of every clip's key), as Vitruvius's "Ave"
("ah-way") does.

Bibliotheca's narrator (`bibliotheca/neo/lib/narrator.js`) keeps its own choice of voice (`prp.bibliotheca.voice`, a
device voice only) and never reads or writes `jdpi.doc.voice`: a book is far longer than a film, so every visit starts
with this device's voice, it never switches to an online voice by itself, and it uses one only after an offer that shows
what it will cost in characters, for that chapter and no more (`gate`, the `fetch` it hands `PRPVoice.stream`, refuses
anything else). It cuts its own units (`lib/narrate.js`: sentences, short ones read together, at most 200 characters), so
the online voice gets about 6 requests a minute. A page that narrates a long text should do the same.

## 7. Accessibility

Contrast ≥4.5:1 for text (use `--prp-muted` or darker for anything readable), visible focus (`:focus-visible`), keyboard
operable tabs and sliders, `prefers-reduced-motion` respected, form labels, `aria-live` for updating feeds.
A card that turns over (the Home page's boxes) turns for the keyboard as it does for the mouse (on focus), at a first
tap on a touch screen, keeps both faces in the accessibility tree (its name and its description), and with reduced
motion shows its back without turning.
The period control is a labelled group of two native range inputs ("Start of the period", "End of the period" or the
page's own names), each with an `aria-valuetext` in words ("1939", "July 1940", "29 Oct 2026"; a resting start adds "(the same
as the end)") and the native keys (arrows, Page Up/Down, Home, End) with the same push and pull; ▶ toggles its name to
"Pause"; focus rings use `--prp-focus` (the end's is drawn outside the ring the resting start wears); handles grow to
22px on touch screens; in forced-colours mode the track, the period and the handles take system colours. The KPI or
label naming the year or period sits in an `aria-live` region.

## 8. Checklist before you finish a page

- [ ] Old brand text gone (JDP-I, PRP, Q, H&P, F&E, and the modules' former names) from visible text, titles and footers;
      new names used, and the favicon is `design/brand-vm-icon.svg`.
- [ ] Only tokens in CSS (search the file for `#` colours outside token definitions; maps/charts read tokens).
- [ ] Works in light and dark (`<html data-theme="dark">`), including maps, charts and canvases (redraw on `prp:themechange`).
- [ ] Views are in-page tabs; old URL parameters still open the right view.
- [ ] Inline scripts still parse (`node --check` on extracted scripts) and existing tests still pass.
- [ ] Phone width (360px): no horizontal scroll; tables scroll inside their panel.
