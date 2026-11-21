# Daily Synopsis (Omni News)

Each day's major political stories, picked by stated rules from the Political Briefing's fifty publishers, with their
**5 Sided Analysis**: the outlets' own headlines laid out from far left to far right. A short written digest and a
written comparison are added only when a draft written by an AI model (Claude) passes the check in
`lib/check.mjs`, and they are labelled as such. No person checks the text. Page: `daily-synopsis/index.html`
(`#day=2026-11-21` opens a day; `?data=fixture` shows the made-up test days).

## How a day is made

1. **The stories, by rules, with no model** (`lib/day.mjs`, `selectStories`). The stories are Highbrowse's groups of
   headlines (`highbrowse/analysis.js`). A story is major when, in the 24 hours to the Political Briefing's refresh of
   the day, at least 3 different publishers ran a headline in it, from at least 2 of the five positions. The ten with
   the most publishers (then the most positions, the most headlines, the newest) are the day's. Sport, entertainment
   and lifestyle are left out.
2. **The input file** (`data/input/<day>.json`, `makeInput`): each story's items, by side, with the outlet, the
   headline, the link and the feed's short summary (at most 240 characters). This file is what the scheduled Claude run
   reads, and all it reads. Once written it is never changed, so a draft always answers the input it was written from.
3. **The rules-only digest** (`data/days/<day>.json`, `rulesDay`): the headlines of each story and its 5 Sided
   Analysis's rules layer, under the label "assembled by rules, with no AI model".
4. **The draft**. A scheduled Claude run, following `PROMPT.md`, reads the input file and pushes
   `daily-synopsis/drafts/<day>.json` to the branch `claude/daily-synopsis-drafts`. The daily workflow fetches it to a
   temporary file (it is never committed to `main`) and `lib/check.mjs` checks it.
5. **The check.** The whole draft is refused when its shape is wrong; a sentence cites nothing or an item not in the
   input (or, for a story, another story's); a sentence holds a quotation mark or reported speech; a number, a date or
   a capitalised name is not in the items it cites; a name is in only one outlet's items (a private person is not
   carried); an outlet is named; a sentence holds a link, markup or an instruction-like line; or a limit is passed
   (280 characters a sentence, 1 to 3 lead sentences and 600 characters, 2 to 4 sentences and 900 characters a story,
   100 KB a draft). One story's written 5 Sided Analysis is refused, and that story keeps its rules layer alone, when a
   side cites another side's item or none; a side with no items has a sentence, or a side with items has none; a
   journalist or an outlet is named; a motive, an intent or a judgement is stated (the list in `lib/check-words.json`);
   the closing comparison is made when only one half carried the story, or cites anything but one item or more from
   each half; or a limit is passed (1 or 2 sentences a side, 300 characters for the closing sentence). A refusal is
   kept as codes and places only, never the draft's words.

   Some details of the check. List entries in `lib/check-words.json` ending in `*` are word stems (bias* is biased,
   biases, biasing), and `…` stands for one to six words (described … as). The digest's own sentences are refused
   for the words in `judgementEverywhere` unless the headline they cite holds them. A closing sentence whose `kind` is
   `same` may not hold a word of difference (`closingSame`), nor one whose `kind` is `differ` a word of sameness
   (`closingDiffer`). Only digits 0 to 9 count as digits; any other is refused. Dates, outlets and names are found in
   any case, so "monday" or "jacobin" is checked as Monday or Jacobin. A capital counts towards a name's two outlets
   only where it tells: not on the first word of a headline or summary, and not in a headline in title case; this
   matters only for a name each of whose words the day also prints in lower case (Hope, White), listed in
   `commonWordNames` or found so. The headline and summary in the input file are plain text: control, zero-width and
   direction characters are removed by `makeInput`. `PROMPT.md` carries the lists between `<!-- list:NAME -->`
   markers; after any change to the lists run `node daily-synopsis/scripts/prompt-lists.mjs`, and a test fails until
   it is run.

   Known limits. A lower-case name that is in none of the day's items (jane doakes) cannot be told from two ordinary
   words without a dictionary, and passes the name rule. Soft news is left out only when the Briefing's categoriser
   tags an item as sport, entertainment or lifestyle; an item it does not tag can reach a story.
6. **The label**, in the day's file (`label.text`, `label.meta`) and in the page's `<meta name="vm-authorship">`: "written
   by an AI model (Claude) ... and no person checked it. The linked reports are the sources", or "assembled by rules,
   with no AI model ... and no person checked it".

## The 5 Sided Analysis

Every story has its rules layer: five places in the order far left, left, centre, right, far right, each with its
number of outlets and its headlines (each with the caution flag ⚠, the Wikipedia flag and the Paywall or Sign-up label),
and, for a side with none, the fixed line "None of Vitruvian Manager's outlets on this side was found reporting it in
the 24 hours", under the label that a side with no headline is not proof the side did not report it. Sides are told
apart by their names and their order; the colour beside each name is only a mark. They sit in a row at full width and
stack in the same order at 390 and 360 pixels. A written analysis is made only for a story that at least three of the
five sides carried, one left of centre and one right of centre.

Distinctive words per side are left out: measured on the stores of 17 to 21 November 2026, word forms were not
reduced to their roots (build and building counted as two words on two sides) and a side held one to three outlets
a story, too few for a word to stand for a side.

## The archive

One file a day in `data/days/`, with its input in `data/input/`, each at most 1.5 MB gzipped (a day is about 45 KB).
A day whose date has passed is never opened for writing again (`scripts/build.mjs`; a test proves it). A correction is a
dated note added to `data/corrections.json` by `scripts/correct.mjs`, and shown beside the day or the story:

    node daily-synopsis/scripts/correct.mjs --day 2026-11-21 --story s3 --text "The note, in VM's own words."

`data/index.json` lists every day, newest first.

## Running it

- `node daily-synopsis/scripts/build.mjs [--draft <file>] [--now <ISO time>]` builds today's day (the workflow
  `.github/workflows/daily-synopsis.yml`, daily at 08:20, 12:20, 16:20 and 20:20 UTC; it holds no secret).
- `node tests/fixtures/daily-synopsis/make-fixture.mjs` rebuilds the three made-up days the page shows with
  `?data=fixture` (a good hand-written draft, a refused one, and none).
- Tests: `npm run test:unit` (with `tests/daily-synopsis.test.mjs`) and
  `npm run test:e2e -- tests/daily-synopsis-page.test.mjs`. No test calls a model: every draft in them is written by
  hand.

## Not yet set up

The scheduled Claude run that writes the draft is not set up here: until it is, every day is the rules-only digest,
labelled as such. It needs a scheduled agent that can read `main` and push to `claude/daily-synopsis-drafts` only, with
`PROMPT.md` as its instructions, writing by about 11:30 UTC so that the 12:20 run publishes it.
