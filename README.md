# JDP-I

JDP-I is a single workspace for three suites of intelligence apps. You pick a module from one sidebar, it opens in the main area, and every module shares the same look.

| Suite | Focus | Accent | Modules |
|---|---|---|---|
| **Q** | Geopolitical intelligence | Lime `#b7f36b` | Briefing · Political Calendar · Country Headlines · Geopolitical Volatility · Country PESTLE |
| **H&P** | History & politics | Cyan `#6ddac8` | Political Atlas |
| **F&E** | Finance & economics | Amber `#f0b95a` | Double Signal (in build) |

Live at **https://jdpi.pages.dev** (Cloudflare Pages, deployed from this repo).

## Architecture

```
            ┌──────────────────────── JDP-I shell (this repo) ────────────────────────┐
            │  Sidebar: suites → modules → submodules     Top bar: breadcrumb, actions │
            │  Router (#/suite/module/sub)   registry.json   design/ (design system)   │
            └────────┬───────────────────────┬───────────────────────┬────────────────┘
                     │ persistent iframes (one per module, state kept when you switch)
       ┌─────────────┴──────────┐   ┌────────┴─────────┐   ┌─────────┴─────────┐
       │ Q suite                │   │ H&P suite        │   │ F&E suite         │
       │ q/calendar.html  (here)│   │ Political Atlas  │   │ Double Signal     │
       │ q/headlines.html (here)│   │ (own repo,       │   │ (Next.js, own     │
       │ Briefing, Volatility,  │   │  Cloudflare)     │   │  project)         │
       │ PESTLE (Lovable)       │   │                  │   │                   │
       └────────────────────────┘   └──────────────────┘   └───────────────────┘
```

**Each module stays an independent app.** It has its own codebase, host and deploy pipeline, so modules can be built with different tools (plain HTML, Lovable, Next.js) and released separately. The shell only has to know each module's URL.

| Piece | File | Role |
|---|---|---|
| Module registry | `registry.json` | The single list of suites, modules, submodules, URLs and status. Adding a module is a JSON edit. |
| Shell | `index.html`, `shell.js`, `shell.css` | Navigation, routing, breadcrumb, persistent module frames, sidebar search (press `/`). |
| Design system | `design/jdpi.css` | Colour, type and spacing tokens, suite accents, and shared components. |
| Module connector | `design/jdpi-bar.js` | Runs in each module. Inside the shell, it hides the module's own brand header. Opened on its own, it adds a "← JDP-I › Suite › Module" bar. |
| Brand | `design/brand-jdpi.svg`, `design/brand-eye-q.svg` | The platform mark and the Q suite mark. |

### Adding a module

1. Add an entry under the right suite in `registry.json`:
   ```json
   { "id": "my-module", "name": "My Module", "icon": "◇", "status": "live",
     "host": "Cloudflare Pages", "url": "https://my-module.pages.dev",
     "description": "One sentence on what it does." }
   ```
   `status` is `live`, `in-build` or `planned`. Set `url: null` until the module is deployed; the shell then shows an "in build" page. Add `submodules` (each with `id`, `name` and `url`) to list deep links in the sidebar.
2. Connect the module to the design system (see below).
3. Commit. Cloudflare redeploys the shell automatically.

To add a whole new suite, add an object to `suites` with `id`, `code`, `name`, `title` and `description`. Give it an accent in `design/jdpi.css` (`[data-suite="xx"]`) and in `shell.css`.

## Connecting a module to the design system

Add these two lines to the module's `<head>`, setting `data-suite` to `q`, `hp` or `fe`:

```html
<link rel="stylesheet" href="https://jdpi.pages.dev/design/jdpi.css">
<script src="https://jdpi.pages.dev/design/jdpi-bar.js" data-suite="fe" data-module="double-signal" defer></script>
```

Then:
- Use the tokens (`var(--jdpi-bg)`, `var(--jdpi-panel)`, `var(--jdpi-accent)`, `var(--jdpi-font-display)`…) instead of hard-coded colours and fonts.
- Add `data-jdpi-standalone` to the module's own brand header so it hides inside the shell. Keep functional toolbars (search, filters) visible.
- For resilience, give token fallbacks, e.g. `background: var(--jdpi-bg, #101820)`, so the module still looks right if the shared stylesheet can't load.

**Next.js / Tailwind (Double Signal).** Put the two tags in `app/layout.tsx` (`<link>` in `<head>`, `<Script src=… strategy="afterInteractive" data-suite="fe" data-module="double-signal" />`). Then map Tailwind/shadcn theme variables to the tokens in `globals.css`: `--background: var(--jdpi-bg)`, `--card: var(--jdpi-panel)`, `--primary: var(--jdpi-amber)`, `--border: var(--jdpi-line)`, `--font-sans: var(--jdpi-font-ui)`.

**Lovable apps (Briefing, Volatility, PESTLE).** Paste this into each project's Lovable chat:

> Restyle this app to the JDP-I design system. In index.html add `<link rel="stylesheet" href="https://jdpi.pages.dev/design/jdpi.css">` and `<script src="https://jdpi.pages.dev/design/jdpi-bar.js" data-suite="q" data-module="MODULE_ID" defer></script>`. Use the CSS variables from that stylesheet for all colours and fonts: background `--jdpi-bg`, panels `--jdpi-panel`/`--jdpi-panel-2`, borders `--jdpi-line`, text `--jdpi-text`/`--jdpi-muted`, accent `--jdpi-lime`, headings in `--jdpi-font-display` (Manrope), body in `--jdpi-font-ui` (DM Sans), labels and numbers in `--jdpi-font-mono` (DM Mono). Add the attribute `data-jdpi-standalone` to the app's top brand header. Keep the dark theme only.

Replace `MODULE_ID` with `briefing`, `volatility` or `pestle`.

## Design principles

- **Dark, calm and data-dense.** It's a workspace people keep open, not a marketing site.
- **One accent per suite.** Lime for Q, cyan for H&P, amber for F&E. The accent marks the active item, primary actions and key numbers only.
- **Three typefaces with fixed jobs:** Manrope for headings, DM Sans for interface text, DM Mono for labels, codes, dates and figures.
- **Status is always explicit:** Live, In build, or Planned, shown with a coloured dot and tag.

## Local development

```bash
npx serve@14.2.4 -l 8090 .
```

Then open http://localhost:8090. The Q pages (`q/`) came from the original JDP-I Q hub built in Codex. Edit them here from now on.
