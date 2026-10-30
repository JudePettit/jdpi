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

**The mark.** `design/brand-vm.svg` (the Vitruvian figure in a hard hat, with the Antikythera mechanism, a book, a
wrench and a mouse; for 40 px and up) and `design/brand-vm-icon.svg` (the favicon, drawn for 16 and 32 px). The shell
plays `design/vm-loading.svg` while a page loads. `design/brand-prp.svg` stays in place only for old external links.

| Old | New | id (registry) | Code |
|---|---|---|---|
| JDP-I, then PRP (platform) | **Vitruvian Manager** (**VM**), by **JDP-Iq** | | |
| Q · Geopolitical Intelligence | **Realtime Geopolitics** | `rt` (alias `q`) | RT |
| H&P · History & Politics | **Retrospective Geopolitics** | `rs` (alias `hp`) | RS |
| F&E · Finance & Economics | **Money Management** | `mm` (alias `fe`) | MM |
| (new) | **International Mystery Management** (sidebar: **Int-Myst Mngmnt**) | `oi` | OI |
| (new) | **Natural Science** | `ns` | NS |
| (new) | **Digital Science** | `ds` | DS |
| (new) | **Kino** (documentaries) | `kino` | KN |

In the registry the seven are "suites" and their pages "modules"; in the interface we say **module** for the seven and
**submodule** for the pages. A module has a short `name` (the sidebar, the breadcrumb, search) and a full `title` (its
overview page, the home's headings, page eyebrows, the tab title); they differ only for International Mystery
Management, whose sidebar name is **Int-Myst Mngmnt**.

| Submodule | Module | Notes |
|---|---|---|
| Intelligence Briefing (was Briefing) | RT | `q/briefing.html` |
| Global Headline Tracker | RT | one submodule: 24-hour map and day/week/month/year archives are tabs inside the page; its filter of lowbrow stories is **Highbrowse** (wordmark `design/highbrowse-wordmark.svg`; the code and the database still say `lowbrow`) |
| Geopolitical Volatility, National Analysis, Realtime Battlefield, Realtime Calendar | RT | |
| Political Atlas | RT (moved from H&P) | external site political-atlas.pages.dev |
| OSINT Dashboard, SIGINT Dashboard, GEOINT & IMINT Dashboard | OI (new; moved from RT) | `osint/`, `sigint/`, `geoint/`; tabs include a Software Cookbook, a Kit or Hardware Guide and Law & ethics |
| Intel Training (was OSINT Training) | OI | `fe/learning.html?course=osint|sigint|geoint`: three courses as tabs |
| Encyclopaedia | RS | |
| Political Retrospective (was H&P Retrospective) | RS | external site hp-retrospective.pages.dev |
| Historical Calendar, Kardashev Tracker | RS | |
| Retrospective Battlefield | RS | world map 1926–2025 (`battlefield/history/`) |
| War Focus | RS | now its own submodule (`battlefield/focus/`) |
| Learning · Politics | RS | `fe/learning.html?course=politics` |
| Market Briefing (was TD Markets) | MM | trade-desk `/markets/` |
| Economics Briefing | MM (new) | `econ/briefing/` |
| Tally Stick | MM | trade-desk `/tally/` (private) |
| Algo Trader (was Double Signal) | MM | trade-desk `/tally/algo/` (private); Double Signal's logic is the **Double Agent** ruleset |
| Auto Trader (was Trader Tracker) | MM | `fe/traders.html` |
| Learning · Finance & Economics | MM | `fe/learning.html?course=finance` |
| Scientific Briefing | NS (new) | `science/briefing/` |
| Invention Timeline | NS (new) | `science/progress/` |
| Digital Briefing, Data Analytics, Integration Hub | DS (new) | `digital/briefing/`, `analytics/`, `integration/` |
| Political Events, Political Figures, Political Parties, Wars, Geopolitical Events, Great Thinkers | KN (new) | `kino/index.html?cat=<id>` |

**Sidebar order.** Within each module the strongest submodules come first, the calendar second-last and the course last.

Never write "JDP-I", "PRP", "Q", "H&P" or "F&E", or a module's former name, in visible text any more (code identifiers,
file names and URLs may keep them). Page titles: `<Submodule> · VM` (e.g. `Intelligence Briefing · VM`).

**One page, one submodule.** A page's own views (archives, map/compare, live/archive, course parts) are **tabs inside
the page**, never separate sidebar entries. Tabs use `.prp-tabs` with `role="tablist"`, update the URL
(`history.replaceState`) so a view can be linked, and switch without a full reload where practical.

## 2. Hooking a page up

```html
<html lang="en" data-suite="rt">              <!-- rt | rs | oi | mm | ns | ds | kino -->
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
the shell plays the Vitruvian Manager figure (`design/vm-loading.svg`, about 160 px) in the middle of the workspace, on
top of the page but letting clicks through, until the frame's load event (or until 600 ms after it when the page came
in under 300 ms, so that a quick page does not flash it); a hash-only move shows nothing. A page therefore needs no
loading screen of its own for its first paint. While a Kino film follows along,
the shell shows a compact bar over the bottom of the workspace (Kino accent, `--prp-*` tokens, a labelled region with a polite
live caption): Kino posts `prp:nowplaying` messages and the bar posts `prp:kino-control` back, same origin only (the
protocol is in `kino/README.md`, "Now playing"). It covers the bottom of the workspace (about 60 px, 80 px on phones),
so a page should not pin anything it needs there.

## 3. Tokens (write CSS against these; no raw hex in page CSS)

- Surfaces: `--prp-canvas` (page background), `--prp-surface` (panels, inputs), `--prp-surface-2` (table heads,
  toolbars), `--prp-surface-3` (hover/selected), `--prp-line`, `--prp-line-soft`, `--prp-line-strong`, `--prp-scrim`.
- Text: `--prp-text` (ink), `--prp-text-2`, `--prp-muted` (metadata), `--prp-faint` (hints only), `--prp-on-primary`.
- Action: `--prp-primary`, `--prp-primary-hover`, `--prp-primary-soft`, `--prp-link`, `--prp-focus`.
- Module accent: `--prp-accent`, `--prp-accent-soft` (set by `data-suite`); also `--prp-rt|rs|oi|mm|ns|ds|kn` and `-soft`.
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

Political-position colours in the Intelligence Briefing (far left … far right) stay as the page's own named tokens,
defined for both themes.

## 4. Page anatomy (publication front matter + ERP object page)

1. **Header**: `.prp-eyebrow` "Realtime Geopolitics · Intelligence Briefing", always with the module's full title
   ("International Mystery Management · OSINT Dashboard", never the sidebar's "Int-Myst Mngmnt"); mark the eyebrow and
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
`.prp-select`, `.prp-tabs`, `.prp-chip` (`.on`), `.prp-code` (module code chip), `.prp-kind` (Realtime/Retrospective
badge), `.prp-status` (`data-status="live|in-build"` or `.good|.warn|.bad`), `.prp-table` (`.num` cells),
`.prp-kpis`/`.prp-kpi`, `.prp-figure`/`.prp-caption`, `.prp-note` (`.warn`, `.bad`), `.prp-sources`, `.prp-empty`,
`.prp-label`, `.prp-meta`, `.prp-prose` (serif reading text), `.prp-num`, `.prp-up`/`.prp-down`.
Legacy `.jdpi-*` classes still work and look new.

## 6. Data visualisation rules

Colour follows the entity, never its rank; categorical colours in the fixed order; sequential = one hue light→dark;
diverging = two hues with a grey midpoint; status colours only for status and always with a word or icon. Thin marks,
recessive gridlines (`--prp-grid`), a legend for ≥2 series, direct labels where few, text in text tokens (never in the
series colour), a hover tooltip on marks, and a table or list view for anything a map or chart shows. No dual axes. Exception: a map may use more than three categorical colours (e.g. Invention Timeline, one per discipline) only when every mark is also named in a legend with counts that filters, in its tooltip and in a list.
More than eight categories (e.g. the calendars' seventeen event types): group related types into families, give each
family one categorical colour in the fixed order and each type in it its own shape (● ■ ◆), and name every mark in
chips that count and filter, a legend, the tooltip and the list. Never cycle the eight colours.

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

## 7. Accessibility

Contrast ≥4.5:1 for text (use `--prp-muted` or darker for anything readable), visible focus (`:focus-visible`), keyboard
operable tabs and sliders, `prefers-reduced-motion` respected, form labels, `aria-live` for updating feeds.

## 8. Checklist before you finish a page

- [ ] Old brand text gone (JDP-I, PRP, Q, H&P, F&E, and the modules' former names) from visible text, titles and footers;
      new names used, and the favicon is `design/brand-vm-icon.svg`.
- [ ] Only tokens in CSS (search the file for `#` colours outside token definitions; maps/charts read tokens).
- [ ] Works in light and dark (`<html data-theme="dark">`), including maps, charts and canvases (redraw on `prp:themechange`).
- [ ] Views are in-page tabs; old URL parameters still open the right view.
- [ ] Inline scripts still parse (`node --check` on extracted scripts) and existing tests still pass.
- [ ] Phone width (360px): no horizontal scroll; tables scroll inside their panel.
