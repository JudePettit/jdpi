# Kino

Kino is Vitruvian Manager's fifth module: preprogrammed documentaries on wars, political events, parties, people and thinkers,
narrated over simple looping animations (maps, timelines, portraits, quotations, charts) and linked scene by scene to
the exact place in Vitruvian Manager's other submodules that tells the same story.

One page, six submodules. `kino/index.html?cat=<category>` is the catalogue and player for one category:

| Submodule | Registry id | URL |
|---|---|---|
| Political Events | `kino-political-events` | `kino/index.html?cat=political-events` |
| Political Figures | `kino-political-figures` | `kino/index.html?cat=political-figures` |
| Political Parties | `kino-political-parties` | `kino/index.html?cat=political-parties` |
| Wars | `kino-wars` | `kino/index.html?cat=wars` |
| Geopolitical Events | `kino-geopolitical-events` | `kino/index.html?cat=geopolitical-events` |
| Great Thinkers | `kino-great-thinkers` | `kino/index.html?cat=great-thinkers` (multi-part courses with a quiz) |

A documentary opens in the player with `#doc=<id>`, at a scene with `#doc=<id>&s=<scene id or number>`
(e.g. `kino/index.html?cat=wars#doc=ww2-europe&s=barbarossa`). Any category's page can play any documentary.

## Files

```
kino/
  index.html, kino.css, kino.js   the page: catalogue, player, captions, controls, links into PRP
  lib/text.js        caption words, sentences and the speech rules (shared with the validator)
  lib/links.js       shell routes (#/<suite>/<module>?at=…) and Kino deep links (shared)
  lib/format.js      the six categories, the visual kinds, scene flattening, short citations (shared)
  lib/stage.js       the 16:9 stage: map, timeline, portrait, quote, chart, module and title visuals
  lib/voice.js       speech synthesis (British voice, word timing) and the background music
  data/<category>/<id>.json   the scripts (hand-written; the only files you edit to add a documentary)
  data/plan.json     titles in preparation, listed under each catalogue
  data/index.json    built: the catalogue
  data/media.json    built: images resolved from Wikidata (P18) and Wikimedia Commons, with author and licence
  data/iso.json      built: ISO 3166-1 alpha-3 → the numeric ids world-atlas uses, and withdrawn codes → successors
  scripts/validate.mjs     checks every script and every link (exit code 1 on errors)
  scripts/build-index.mjs  validates, resolves Wikidata and Commons (cached in scripts/cache.json), writes the built files
tests/kino.test.mjs        schema, links, ISO codes, sources, built data, speech rules, the validator, the page
.github/workflows/kino-check.yml    validate and test on every change to Kino
.github/workflows/kino-refresh.yml  monthly: re-read labels and image credits from Wikidata and Commons
```

## Script format

One JSON file per documentary, `kino/data/<category>/<id>.json`; the file name is the id.

```jsonc
{
  "id": "ww2-europe",                       // lower-case words joined by hyphens = the file name
  "title": "The Second World War in Europe, 1939–1945",
  "category": "wars",                       // one of the six; = the folder
  "subjects": [{ "qid": "Q362", "label": "World War II" }],   // Wikidata items; labels are checked at build time
  "era": [1939, 1945],                      // whole years; BC as negative numbers
  "summary": "One to three sentences for the catalogue card.",
  "minutes": 7,                             // running time; the validator warns if the narration disagrees
  "preview": { "scene": "barbarossa" },     // optional: the scene the catalogue card animates
  "sources": [
    { "id": "beevor-2012", "kind": "book", "author": "Antony Beevor", "title": "The Second World War", "year": 2012, "publisher": "Weidenfeld & Nicolson" },
    { "id": "harrison-2019", "kind": "article", "author": "Mark Harrison", "title": "…", "year": 2019, "journal": "Europe-Asia Studies 71 (6): 1036–1047", "url": "https://doi.org/…" },
    { "id": "wd", "kind": "wikidata", "title": "World War II (Q362)", "url": "https://www.wikidata.org/wiki/Q362" },
    { "id": "hansard-1940-may", "kind": "web", "title": "…", "publisher": "Hansard (UK Parliament)", "url": "https://…" }
  ],
  "scenes": [ /* 10 to 14 is usual; see below */ ]
}
```

`sources[].kind` is `wikidata`, `book`, `article` or `web`. Books need author, title, year and publisher; articles
author, title, year and journal; web sources a URL. Every documentary cites at least two scholarly books or articles
plus Wikidata, and every work cited must have been checked to exist (author, title, year).

**Short citations.** Under the captions each source is cited short: the first author's family name and the year
("Beevor 2012"), "A & B" for two authors ("Glantz & House 1995") and "A et al." for three or more ("Hirschman et al.
1995"). Write authors' names as the work prints them, separated by commas, "and", "&" or semicolons ("Charles
Hirschman, Samuel Preston and Vu Manh Loi"); "Surname, Given" forms are read too ("Beevor, Antony"; "Hirschman,
Charles; Preston, Samuel"). The family name of a name in natural order is its last word, with particles such as "de"
or "van der" and without "Jr". Where that is wrong, give the source a `cite` with the short form to show:

```jsonc
{ "id": "shen-2012", "kind": "book", "author": "Shen Zhihua", "cite": "Shen 2012", … }   // family name first
{ "id": "garton-ash-1990", "kind": "book", "author": "Timothy Garton Ash", "cite": "Garton Ash 1990", … }
```

Use it for names written family name first (Chinese, Korean, Vietnamese, Hungarian…), surnames of two words, and
institutions given as authors. (`short`, its older name, still works.) Sources without an author are cited by their
publisher or title.

### Scenes

```jsonc
{
  "id": "poland",                           // unique in the documentary; used in deep links (&s=poland)
  "title": "The invasion of Poland, September 1939",
  "narration": "Two to five sentences in Vitruvian Manager's own words …",
  "visual": { "kind": "map", … },           // see below
  "focus": {                                // optional (required for maps): what the stage shows and zooms to
    "countries": ["POL", "DEU"],            // ISO 3166-1 alpha-3; also SUN, YUG, CSK (drawn as their successors)
    "points": [[21.01, 52.23, "Warsaw, surrendered 28 September"]],   // [lon, lat, label]; pulsing dots
    "bbox": [10, 46.5, 32, 57]              // [west, south, east, north]; without it the view frames every
  },                                        //   highlighted country and point
  "link": { "label": "War Focus · September 1939", "suite": "rs", "module": "war-focus",
            "at": "battlefield/focus/index.html#war=ww2&m=1939-09" },        // optional: the place in PRP
  "cites": ["weinberg-1994", "beevor-2012"],  // source ids behind this scene
  "seconds": 12                             // optional: minimum time on screen
}
```

Visual kinds (all drawn in SVG and CSS, looping quietly, still for `prefers-reduced-motion`):

| kind | fields | what it shows |
|---|---|---|
| `title` | `kicker`, `heading`, `sub` | the title card; with `focus`, over a faint map |
| `map` | `groups: [{ label, tone: 1–3, countries }]`, `arrows: [{ from, via?, to, tone?, label? }]`, `fronts: [{ line: [[lon,lat]…], label? }]`, `still?` | present-day borders (world-atlas 2.0.2); groups fade in by tone with a key; arrows draw in; fronts march; points pulse; the view glides between scenes. `still: true` stops the pulsing (for sombre scenes) |
| `timeline` | `from`, `to`, `events: [{ at, label }]` | a sweep along the years that lights each event; dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD` |
| `portrait` | `qid` (its Wikidata image, P18) or `file` (`"File:…"` on Commons), `heading`, `sub`, `position` | the image with a slow Ken Burns drift, credited with author and licence |
| `quote` | `text` (45 words at most), `who`, `when`, `cite` | a short quotation from a cited primary source |
| `chart` | `type: "bar"\|"line"`, `title`, `unit`, `data: [{ label, value }\|{ label, low, high }]`, `note`, `cite` | bars or ranges drawn in; **casualty figures must be ranges** (`low`, `high`) with sources |
| `module` | `blurb` (and the scene's `link`) | a card that opens the linked PRP submodule |

Tones follow the categorical palette in its fixed order; keep the same tone for the same side throughout a film
(the exemplars use 1 for the Allies, 2 for the Axis, 3 for the Soviet Union).

### Links into PRP

`at` is the exact place, written the way the target page reads its own address; the validator checks it against that
page's data.

| Submodule (suite/module) | `at` | checked |
|---|---|---|
| War Focus (`rs/war-focus`) | `battlefield/focus/index.html#war=<id>&m=YYYY-MM` | war in `battlefield/focus/data/index.json`, month in the war |
| Retrospective Battlefield (`rs/battlefield-history`) | `battlefield/history/index.html#y=<year>&w=<war id>` | year 1926–2025, war fought that year |
| Encyclopaedia (`rs/encyclopedia`) | `encyclopedia/index.html#<QID>` | QID in `lake/data/index.json` |
| Kardashev Tracker (`rs/kardashev`) | `kardashev/index.html#y=<step>&p=<polity>` | a step year and polity id |
| Historical Calendar (`rs/historical-calendar`) | `q/calendar.html?period=history&month=YYYY-MM` | 1980-01 onwards |
| Political Retrospective (`rs/retrospective`) | `https://hp-retrospective.pages.dev/#y=<year>&c=<GW code>` | year 1926 onwards |
| National Analysis (`rt/pestle`) | `q/national.html#country=<ISO3>` | country in `national/data/index.json` |
| Political Atlas (`rt/atlas`) | `https://political-atlas.pages.dev/#<ISO3>` | one of its 78 countries |
| Invention Timeline (`ns/progress`) | `science/progress/index.html#y=<year>&e=<event id>` | event in `science/progress/data/events.json` |
| Learning (`mm/learning`, `rs/learning-politics`) | `fe/learning.html?course=<course>&lesson=<lesson id>` | lesson heading in `fe/learning/<course>.md` |
| Another Kino film (`kino/kino-<category>`) | `kino/index.html?cat=<category>#doc=<id>&s=<scene>` | documentary and scene exist |

The player opens a link through the shell route `https://jdpi.pages.dev/#/<suite>/<module>?at=<absolute url>`. Inside the
shell it posts `{ type: 'prp:navigate', hash }` to the parent (shell.js moves there), and if the shell's address has not
changed a moment later it sets it directly (same origin). Outside the shell, a link opens PRP in a new tab.
**Follow along in PRP** opens each scene's place as the film reaches it: inside the shell the narration carries on while
the shell shows the submodule, and the now-playing bar (below) shows the captions and controls; outside it, one
companion tab follows. Links to other Kino films are never followed automatically; opened by hand, a film in another
category plays in that category's submodule (through the shell), and this one pauses.

The shell keeps **one frame per submodule** (and view). Following a film through twelve War Focus months moves the one
War Focus frame twelve times: when only the hash differs the page is not reloaded but its address changes in place,
so every page Kino links to by hash re-renders on `hashchange` (War Focus, Retrospective Battlefield, the
Encyclopaedia, Kardashev, Invention Timeline, National Analysis, Volatility, and the two external sites all do).
A different query (the calendars' `month`, Learning's `course` and `lesson`) loads the new address in the same frame.
The frames move without adding to the browser's history, so Back and Forward step through the places the film opened.

### Courses (Great Thinkers)

A course replaces `scenes` with `parts` and may end with a short quiz:

```jsonc
"parts": [
  { "id": "life", "title": "A life", "scenes": [ … ] },
  { "id": "ideas", "title": "The ideas", "scenes": [ … ] }
],
"quiz": [{ "q": "When did Britain return to gold?", "options": ["1919", "1925", "1931"], "answer": 1, "explain": "…" }]
```

The chapter list shows the parts; the quiz appears under the player when the course ends.

## Writing a documentary

- **Facts** come from Wikidata and the scholarly works the script cites; verify every work exists before citing it.
  **Write in Vitruvian Manager's own words**: never copy a source's sentences. Quotations are short, attributed and from a
  primary source you cite (Hansard, a treaty text, a speech transcript).
- **Plain British English**, a measured documentary tone, balanced and non-partisan. Where historians disagree, say so
  and cite both sides. No glorification of violence; no graphic detail.
- **Casualty figures** as ranges with their sources ("between 5.6 and 5.8 million"), never a single uncertain number.
- **Narration is spoken.** Two to five sentences a scene. A full stop with no space after it is read as "point" between
  digits (5.6 → "5 point 6", digits after the point one by one) and "dot" between letters, never as a sentence end; so
  write numbers normally, but avoid abbreviations with full stops (write "the United States", "for example",
  "Mr Churchill"): the validator warns about them. "1939–1945" is read "1939 to 1945". Write regnal numbers out
  ("Elizabeth the Second").
- Maps use present-day borders for orientation (the key says so). Mark simplified fronts "(approximate)".

## Adding a documentary

1. Write `kino/data/<category>/<id>.json` in the format above (start from one of the exemplars).
2. `node kino/scripts/validate.mjs`: fix every error and warning (links, ISO codes, sentence counts, sources, ranges).
3. `node kino/scripts/build-index.mjs`: resolves subjects and portraits through Wikidata and Commons, writes
   `data/index.json`, `media.json` and `iso.json` (add `--offline` to use the cache only).
4. Remove its line from `data/plan.json` if it was planned, then `node --test tests/kino.test.mjs` (and with a local
   server, `JDPI_URL=http://localhost:8787 node --test tests/kino.test.mjs`).
5. Watch it at `kino/index.html?cat=<category>#doc=<id>` in light and dark and at phone width.

## The player

- **Stage** 16:9, scaled to the screen so stage, captions and controls fit together; text keeps legible minimums.
- **Captions** always on, in the serif reading face, the spoken word highlighted (from the voice's word boundaries, or
  timed when a voice sends none). Under them: the scene's PRP link, its sources, and the map key on phones.
- **Voice**: the browser's speech synthesis, a British voice chosen as the shell's Documentary reader chooses it, and
  sharing its saved choice (`jdpi.doc.voice`). **Captions only** plays the same timing silently.
- **Music**: the reader's public-domain and CC0 Commons recordings, quiet and ducked under the voice; off by default.
- **Controls**: play/pause, previous/next scene, scene bar, chapters, speed (0.8× to 1.5×), voice or captions only,
  music, follow along, full screen. **Keys**: Space or K play/pause · ← → or J L scene · Home End · < > speed ·
  C captions only · M music · P follow along · O open this scene's place · F full screen · ? shortcuts.
- Inside the shell, leaving Kino (its frame hidden) pauses the film unless it is following along.

## Now playing (inside the shell)

While Kino follows along its own frame is hidden, so the shell shows the film in a compact bar over the bottom of the
workspace: "Kino · <title> · <n>/<count>", the sentence being read (one line), Pause or Play, Previous, Next and
**Back to film**. The bar hides while Kino's frame is the one in view and when playback stops. Messages go only between
same-origin windows (`postMessage` with the page's own origin as the target).

Kino → shell (`window.parent`), on every scene, sentence and play-state change, at most one every 300 ms (the latest
state is always sent), while Follow along is on and a film is open:

```jsonc
{
  "type": "prp:nowplaying",
  "doc": { "id": "korean-war", "title": "The Korean War, 1950–1953", "category": "wars" },
  "scene": { "index": 5, "count": 12, "title": "Inchon and the march north, September–October 1950" },  // index from 0
  "caption": "On 15 September MacArthur landed two divisions at Inchon, far behind the North Korean lines, and …",  // the sentence being read, in full
  "playing": true,
  "route": "#/kino/kino-wars?at=https%3A%2F%2Fjdpi.pages.dev%2Fkino%2Findex.html%3Fcat%3Dwars%23doc%3Dkorean-war%26s%3Dinchon"
}
```

`route` is the shell route back to this film at this scene, in the category page that plays it (`filmRoute` in
`lib/links.js`). When playback stops (another film is opened, the viewer goes back to the catalogue, or the page is
left), ends, or Follow along is switched off, Kino sends `{ "type": "prp:nowplaying", "stopped": true }`; it sends
nothing while Follow along is off. A paused film stays in the bar with `"playing": false`.

Shell → Kino: the bar's buttons post `{ "type": "prp:kino-control", "action": "pause" | "play" | "next" | "prev" | "stop" }` to
the frame that sent the message. Kino accepts it only from `window.parent` on its own origin, and answers with a new
`prp:nowplaying`. "Back to film" moves the shell to `route` and puts the keyboard focus in Kino's frame. The shell
accepts `prp:nowplaying` only from its own origin and its own frames, shows only text from it, and uses `route` only
when it is a shell route; a new page loading in Kino's frame clears the bar.

The bar is a labelled region ("Now playing in Kino"); its caption is a polite live region that changes once a
sentence; every control is a button or link that works from the keyboard; it slides in only without
`prefers-reduced-motion`. It fits 360 px (two rows on phones) and leaves room for the Documentary reader's button.

## Data and licences

Scripts: written by PRP. Wikidata: CC0. Maps: world-atlas 2.0.2 (Natural Earth, public domain) with d3 7.9.0 and
topojson-client 3.1.0 from jsDelivr. Images: Wikimedia Commons, each under its own licence, credited on screen and in
`data/media.json`. Music: public-domain and CC0 recordings on Wikimedia Commons.
