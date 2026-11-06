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
(e.g. `kino/index.html?cat=wars#doc=ww2-europe&s=barbarossa`), and with Split view on with `&split=1` at the end
(`#doc=ww2-europe&s=barbarossa&split=1`; read and written by `readKinoView` and `kinoViewHash` in `lib/links.js`, apart
from `readKinoHash` and `kinoHash`). Any category's page can play any documentary.

## Files

```
kino/
  index.html, kino.css, kino.js   the page: catalogue, player, captions, controls, Split view, Related, links into VM
  lib/text.js        caption words, sentences and the speech rules (shared with the validator)
  lib/links.js       shell routes (#/<suite>/<module>?at=…), Kino deep links and a scene's link as a place (shared)
  lib/related.js     the Related screens of a scene, from the scripts and the Master Index (shared)
  lib/format.js      the six categories, the visual kinds, scene flattening, short citations (shared)
  lib/stage.js       the 16:9 stage: map, timeline, portrait, quote, chart, module and title visuals
  lib/voice.js       the narration (this device's British voice or an online voice, word timing) and the background music
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
| Master Index (`rs/encyclopedia`) | `encyclopedia/index.html#<QID>` | QID in `lake/data/index.json` |
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
changed a moment later (and has not moved at all meanwhile) it sets it directly (same origin). Outside the shell, a
link opens Vitruvian Manager in a new tab. **Follow along in VM** opens each scene's place as the film reaches it: inside the shell the narration carries on while
the shell shows the submodule, and the now-playing bar (below) shows the captions and controls; outside it, one
companion tab follows. Links to other Kino films are never followed automatically; opened by hand, a film in another
category plays in that category's submodule (through the shell), and this one pauses.

The shell keeps **one frame per submodule** (and view). Following a film through twelve War Focus months moves the one
War Focus frame twelve times: when only the hash differs the page is not reloaded but its address changes in place,
so every page Kino links to by hash re-renders on `hashchange` (War Focus, Retrospective Battlefield, the
Master Index, Kardashev, Invention Timeline, National Analysis, Volatility, and the two external sites all do).
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
  In full screen it is the largest 16:9 box the screen leaves above the sentence box and the controls, the same size in
  every scene, at the foot of its room, and the text drawn on it keeps its share of the picture (no ceilings).
- **Captions** always on, in the serif reading face, the spoken word highlighted (from the voice's word boundaries,
  timed when a voice sends none, or from the clip's clock for an online voice). Under them: the scene's place in Vitruvian
  Manager, its sources, and the map key on phones. With Split view on, and in full screen, the block of text gives way
  to the sentence being read, in a box three lines tall that never changes height; a longer sentence scrolls by whole
  lines to the word being said. `#cap-text` still holds every word.
- **Voice**: through the shared voice layer (`design/prp-voice.js`), as the shell's Documentary reader speaks, and sharing
  its saved choice (`jdpi.doc.voice`). By default the browser's speech synthesis, a British voice chosen as the
  Documentary chooses it, spoken exactly as before. The settings also list the site's online voices (group "Azure
  (online)") once its voice proxy (`functions/api/voice/v1/`) says it is set up: each sentence is then fetched as a clip
  (the next one while this one plays, the next scene's first during this scene's last) and played on one audio element,
  and whenever the online voice cannot carry on (not set up, offline, the day's allowance spent) the device voice reads on
  from the same sentence, with a note saying so once. When the browser has no English voice of its own, Kino asks the
  proxy (1.6 s after it loads) and, if it is set up, reads with an online voice even though none was chosen in the
  settings (the first one the proxy lists), so each sentence then goes to Azure, as the page's footer says; with neither
  a device voice nor the proxy, it plays with captions only and its Voice button is disabled. **Captions only** plays
  the same timing silently and never asks the proxy.
- **Music**: the reader's public-domain and CC0 Commons recordings, quiet and ducked under the voice; off by default.
- **Controls**: play/pause, previous/next scene, scene bar, chapters, speed (0.8× to 1.5×), voice or captions only,
  music, follow along, Split view, Related, full screen. The two newest buttons show their sign alone unless the row of
  controls is at least 1,050 px wide (their names are in their tooltips). **Keys**: Space or K play/pause · ← → or J L
  scene · Home End · < > speed · C captions only · M music · P follow along · O open this scene's place · V Split view ·
  T Related · H hold the pane or let go · F full screen · ? shortcuts. On the pane's divider: ← → Home End Enter. A key
  something else has handled (the divider's) is left alone.
- Inside the shell, leaving Kino (its frame hidden) pauses the film unless it is following along: the theatre's box
  becomes 0 × 0 (the frame's window keeps its size in Edge), seen by an IntersectionObserver and as each sentence starts.

### Split view (V): the place beside the film

Follow takes the viewer to each scene's place; **Split view** brings the place to the film. The same page at the same
address (`link.at`) shows in a pane beside the stage and its sentence box, built by the shared piece
`design/prp-split.js` (and `design/prp-split.css`), which Bibliotheca's pane uses too. The two are alternatives:
turning one on turns the other off. Split view is remembered (`prp.kino.split`) and written into the address
(`split=1`); a film opened with no such key starts as the viewer last left it, and a later address in the same film
never turns it off.

- **Side by side** from 901 px of page width (in the shell, the frame's): the pane takes 40% at first (25 to 60%,
  never leaving the film under 480 px or the pane's frame under 320 px), as tall as the stage and its captions and at
  least 360 px; the chapter list moves under the player. Its left edge is a divider: drag it with any pointer, or
  focus it and use the keys; the share is saved in `prp.split.kino`. Under 901 px the pane follows the controls,
  `clamp(300px, 55vh, 560px)` tall, and a place chosen there is scrolled into view.
- The pane's head: the submodule's code, the place, **Hold** (H: the pane stays while the film moves on; again, back to
  the scene's place), **Open** (once what Follow does at every scene: the shell moves there, or a new tab; full screen
  ends) and close (Split view off).
- With it on, the scene's place button, O, the list under the player and a module card show their place in the pane,
  held unless it is the scene's own. In full screen with Split view off they turn it on.
- One frame for each submodule, the six shown most recently, moved by hash where only the hash differs; all are
  dropped when Split view is turned off or the film is closed. A framed page gets the player's theme; on its own,
  its links that would open at the top open a new tab, and its requests to move the shell (`prp:navigate`) open the
  shell at that route in a new tab (inside the shell they are passed on).
- A card in place of a frame: a scene with no place, a scene whose place is another film ("Open the film"), a private
  submodule (`opensInNewTab`: offered as a link), an address that is not its submodule's own page, and a page that
  loaded without the connector (`design/prp-bar.js`), which is how a missing page looks on the live site and locally.
- A film shown in another page's pane (a frame named `prp-side`) offers no Split view, Related or Follow.

### Related (T): the screens tagged with the scene

A strip under the sentence box, hidden at first and remembered (`prp.kino.related`): three chips and **See more** with
the count of all the screens, which opens a panel over the lower part of the player (a non-modal dialog: its close
button, Escape outside full screen, a click outside, See more again or a choice close it, and the focus goes back to
See more). The list (`relatedPlaces` in `lib/related.js`) is the scene's own place; then the places the Master Index
records (its "Appears in", from the lake's shards `lake/data/e/<n mod 512>.json`) for what the scene names: the entry
its link names, the person in its portrait, the war or the country its link names (War Focus, PESTLE, the Atlas) and up
to four countries on its map, the last two through `battlefield/focus/data/index.json` and `national/data/brief.json`
(`tagTables`); or else the film's subjects; up to four each, leaving out other films; then the film's other places,
nearest scene first. That tags 155 of the 221 scenes by what they show (86 by the links and portraits alone), and
leaves 31 with no tagged screen. A chosen screen shows in the pane, held, turning Split view on if it was off.

### Full screen (F)

The theatre goes full screen as a grid: the stage fitted by CSS alone (`.kn-fit`, `container-type: size`), the sentence
box three lines tall at `clamp(18px, 1.3vw, 28px)`, the strip, the controls (one row from 1,280 px wide, with words). The
note lies over the top of the screen instead of taking a row: it can come at any moment (no voice on the device, the
online voice's allowance spent), and the stage keeps its size when it does. With Split view on the pane is a second
column running the full height above the strip and the controls (one column under 901 px). On a short screen (a phone
held sideways) the box is two lines and the controls one row of signs.
F, the button and Escape leave it; so do a course's end (its quiz is under the player), "Sources" on the end card, Open
in the pane, and any move of the shell (`shell.js` leaves full screen when it changes the frame in view).

## Now playing (inside the shell)

While Kino follows along its own frame is hidden, so the shell shows the film in a compact bar over the bottom of the
workspace: "Kino · <title> · <n>/<count>", the sentence being read (one line), Pause or Play, Previous, Next and
**Back to film**. The bar hides while Kino's frame is the one in view and when playback stops. Messages go only between
same-origin windows (`postMessage` with the page's own origin as the target).

Kino → shell (`window.parent`), on every scene, sentence and play-state change, at most one every 300 ms (the latest
state is always sent), while Follow along is on and a film is open. A change of play state (playing, paused, ended) goes
at once: held back, it could reach the shell after the viewer's next press on the bar and undo it.

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
`prp:nowplaying`. Before it posts `play`, the shell calls the frame's `window.prpKinoUnlock()` directly (same origin),
synchronously inside the click: iOS lets audio play only from inside a tap, and the message arrives after it, so without
this an online voice's first clip would be refused (once the proxy had made and counted it) and the device voice would
read instead. "Back to film" moves the shell to `route` and puts the keyboard focus in Kino's frame; the film is moved
by its hash on the page's own address (`kino/`, where the server puts `kino/index.html`), even while the page is still
loading its fonts or pictures, so it is the same film, still following along, not the page loaded afresh. The shell
accepts `prp:nowplaying` only from its own origin and its own frames, shows only text from it, and uses `route` only
when it is a shell route; a new page loading in Kino's frame clears the bar (the page's own load event, which can come
after it has posted, does not: the shell keeps the document that posted and clears the bar only for another).

The bar is a labelled region ("Now playing in Kino"); its caption is a polite live region that changes once a
sentence; every control is a button or link that works from the keyboard; it slides in only without
`prefers-reduced-motion`. It fits 360 px (two rows on phones) and leaves room for the Documentary reader's button.

## Data and licences

Scripts: written by Vitruvian Manager. Wikidata: CC0. Maps: world-atlas 2.0.2 (Natural Earth, public domain) with d3 7.9.0 and
topojson-client 3.1.0 from jsDelivr. Images: Wikimedia Commons, each under its own licence, credited on screen and in
`data/media.json`. Music: public-domain and CC0 recordings on Wikimedia Commons.
