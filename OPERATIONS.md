# Operations

Every timed job behind Vitruvian Manager: when it runs, what it writes, and how you know it broke. Checked against the
files on 31 October 2026 (jdpi `fb8c85b`, trade-desk `8e7873d`, political-atlas `dabbb34`, double-signal `fd64ae8`).
Updated 2 November: Double Signal now has a private GitHub repository, and Political Atlas skipped its November update
(its monthly update is on again for December).

**Times** are UTC. In winter London keeps UTC (GMT), so the times read the same there. In summer (BST, from the last
Sunday in March to the last Sunday in October) London is an hour ahead, and the summer London time is in brackets:
"05:23 (06:23)" is 05:23 in London in winter and 06:23 in summer.

**Confirmed outside the files (30–31 October):** Cloudflare Pages' own Git deployments for jdpi are switched off
(Branch control: automatic deployments disabled, previews none), so the site deploys only from GitHub after the tests.
Supabase runs the repository's refresh-top-stories with the Highbrowse filter (version 10, deployed 30 October), and
its Claude key works: the function reports `translation: claude`, and its backfill judged the stored stories.

## Summary

The site's data keeps itself current through timed jobs in four places. **GitHub** runs eleven workflows in jdpi that
rebuild the site's data files from public sources (from every six hours to once a month), test the new data, commit it
and redeploy the site. A twelfth, the daily **freshness check at 09:33**, is the alarm: it goes red when any of the
eleven has stopped working or the site is serving old data. Political Atlas has its own monthly workflow, which
proposes its changes as a pull request for you to approve. On **Cloudflare**, the trade-desk Worker runs Tally Stick's
rules and Algo Trader's agents every minute and takes a Hype Tracker snapshot every hour, and the Double Signal Worker
scans the market every ten minutes. **Supabase** collects the Global Headline Tracker's stories every ten minutes and
takes a calendar snapshot every morning. The **site's server functions** (the JSON API, the MCP server and the aircraft
proxy) are not timed: they run only when something calls them, within rate limits. Only the jdpi data has an automatic
alarm; for everything else, the sections below say where it logs and what a failure looks like. Claude's own timers
(routines that resume work sessions) are not part of the site and are not listed.

## 1. GitHub Actions

A *workflow* is a script that GitHub runs on its own computers, on a timetable or when code is pushed. Each is a file
in the repository's `.github/workflows/` folder, and each run appears in the repository's **Actions** tab: green when it
worked, red when it failed. Every scheduled workflow below can also be started by hand (Actions → the workflow → **Run
workflow**). GitHub often starts scheduled runs late when it is busy; the freshness check allows three hours for that.

**What every jdpi refresh does.** It builds its data, runs that module's tests on the new data, and commits only its own
files through one shared step (`.github/actions/commit-data`). Nothing is committed when nothing changed. If another run
pushed first, the commit is rebased onto it and the push retried, up to five times; a clash, or a fifth failure, turns
the run red and drops that run's data (the next run tries again). Then the run hands main, with its commit on it, to the
pipeline (`pages-deploy.yml`), even when the refresh failed, so anything it did commit goes live, but only once the
whole test suite has passed on that very commit: the module's own tests guard its data, the whole suite guards the site.
If the suite fails, nothing is deployed and the run goes red; the next refresh, or any push, tries again (since 7
November 2026; before, a refresh deployed main without the suite). Every build also has a **guard**: when a source fails
and the new file would lose too much (usually more than half of a count, for some a tenth), nothing is written and the
run fails, so the page keeps its last good data and simply ages.

**Summaries in step with their stores** (since 13 November 2026). Where a page reads a small summary in place of a
large store (the Dashboard's Today panel, Highbrowse's Trends tab), the summary is written beside the store by the same
build, as its last act (`writeHeads()` in `integration/scripts/heads.mjs`), and committed with it by the same
`commit-data` step: each briefing's `stories.head.json` (the Political Briefing's `latest.head.json`), `trends.json` and
`history.json`; `volatility/data/index.head.json`; `calendar/data/upcoming.json`; and a head beside the Realtime
Battlefield, Auto Trader, Invention Timeline and National Analysis stores and the Integration Hub's catalogue. Each
names its store's own time and a hash of its content (`summaryOf`). The module's own tests check its summaries before
the commit, and `tests/heads.test.mjs`, in the whole suite, fails on any commit where one is out of step, so it cannot
deploy. A store built by hand writes its summaries too (the builders do it, whoever runs them); after a hand edit or a
merge, run `node integration/scripts/heads.mjs --all` and commit what it writes (`--check` lists what is out of step).
Never edit a summary by hand. `integration/data/briefing-activity.json` and `volatility-movers.json` stay at their
addresses as the Integration Hub's daily copy; no page reads them.

**Freshness lines** (since 13 November 2026). Every submodule shows, in the top bar, the sidebar, the Dashboard's tiles,
its module's overview and the back of its module's box on the Home page, one line saying how fresh its data is, worked
out by `design/prp-freshness.js` and never written by hand: its store's own time (from the small file named in its
registry entry's `data`, usually the head above) and its refresh's rhythm, from the workflow's cron (copied in
`SCHEDULES` there; `tests/freshness-labels.test.mjs` fails when a copy and its workflow disagree, or when the rhythm a
store is expected at disagrees with the hours in `.github/scripts/freshness.mjs`). A line says **Late** by the alarm's own
rule below (older than twice the rhythm plus three hours), or while `status/health.json` names its store as failing and
the store has not been rebuilt since that check; a failing workflow row marks no line late. "Live" no longer appears:
a submodule's `status: live` means only that it is published. Changing a schedule therefore means changing its copy in
`SCHEDULES` too (the test says so).
Three lines are not checked against a schedule here. The Global Headline Tracker's "Collected daily, country by country"
(and Realtime Battlefield's news line, "collected daily") is the registry's own note: the collection runs on Supabase's
`pg_cron`, outside this repository, so no test holds the word "daily" to it; the tracker's own page shows each archive's
collection time beside its stories. The Political Retrospective's line gives no build date: the only dated public file of
hp-retrospective.pages.dev is its 1.4 MB country file, too large to read for one date. Kino's time is read from its
Wikidata cache (about 47 KB), so only where its line is shown in full; the sidebar and the Home page say "Checked monthly".
The Dashboard's two counts ("Updated in the last 24 hours", "Late") leave out a submodule whose file could not be read,
and say how many those are.

**The catalogue's copies** (Data Analytics, the Integration Hub). `integration/catalog.json` and the copies under
`integration/data` are remade only by the daily calendar refresh, so after any other refresh a dataset's date and rows
there can be a day older than its store. Both pages label them as the catalogue's ("Updated, in the catalogue"; "Rows in
the catalogue of" its time, in UTC), read each store's own small file (the one its freshness line reads) and, when the
store is newer than the catalogue, say so with the store's own time. Rebuilding the catalogue in every refresh would
rewrite a hundred generated files and make refreshes collide; this is the smaller step.

| Job (workflow) | When: UTC (London in summer) | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **Scientific, Economics and Digital Briefings** (`briefings-refresh.yml`) | Every six hours: 01:45, 07:45, 13:45, 19:45 (02:45, 08:45, 14:45, 20:45) | Fetches every feed of the three briefings and rolls their seven-day stores forward. Each briefing is built and tested on its own. Guard: a briefing with fewer than 75% of its feeds working is not written. | `science/briefing/data`, `econ/briefing/data`, `digital/briefing/data` (each store with its head, `trends.json` and `history.json`), in one commit | Red run naming the briefing that failed: it is put back as it was, the other two are still committed. Freshness: its `stories.json` older than 15 hours. |
| **Political Briefing** (`briefing-refresh.yml`) | Daily 06:05 and 18:05 (07:05, 19:05) | Fetches its 64 publisher feeds and rolls the seven-day story store forward. Guard: not written if fewer than 75% of feeds work, or a political position (far left to far right) has fewer than 8 working publishers. | `briefing/data` (`latest.json` with its head, `trends.json` and `history.json`) | Red run; the page says "Data is N hours old". Freshness: older than 27 hours. |
| **Geopolitical Volatility** (`volatility-refresh.yml`) | Daily 01:25 (02:25) | Scores the latest complete day of GDELT's event files, looking back 7 days. Guard: a day with fewer than 72 of its 96 quarter-hour files, or too few located events, is not written; it is tried again the next night. | `volatility/data` (a file per day, and `index.json`) | Red run when two nights in a row could not complete their day. Freshness: the newest complete day older than 51 hours, or the site serving an older copy. |
| **Realtime and Historical Calendars, and the Integration Hub** (`calendar-refresh.yml`) | Daily 05:23 (06:23) | Rebuilds the calendars from Wikipedia (the Current events portal, its lists and electoral calendars), Wikidata and the Political Atlas, adds Wikipedia summaries, and tests them. Then rebuilds the Integration Hub (data catalogue, iCalendar files, country profiles, `openapi.json`, `llms.txt`) and tests that. Guard: stops if a type of event would lose more than half its records; the Hub stops if a dataset would lose more than half its rows. | `calendar/data`, `calendar/scripts/summary-cache.json`, `integration/` (catalogue, data, feeds, skill, `openapi.json`), `llms.txt` | Red run. If only the Hub failed, its files are thrown away, the calendars are still committed, and the run ends red. Freshness: `calendar/data/2020s.json` or `integration/catalog.json` older than 51 hours. |
| **Realtime Battlefield** (`battlefield-refresh.yml`) | Mondays 06:17 (07:17) | Looks for UCDP's monthly release of candidate events and rebuilds when there is a new one; most weeks nothing changes. Guard: refuses an older release, or a file with fewer months, or a tenth fewer events or deaths. | `battlefield/data/realtime.json` and its head | Red run. Freshness counts it as monthly: older than about 62 days. |
| **Auto Trader** (`traders-refresh.yml`) | Tuesdays 03:41 (04:41) | US House members' trade reports, then large investors' 13F holdings (tickers from OpenFIGI), each tested and committed on its own. Guard: trades not written if a year loses a tenth of its trades or half its members or parties; holdings not written if a listed investor goes missing or has a tenth fewer positions. | `traders/data/congress.json`, its head and `traders/scripts/ptr-cache.json`; `traders/data/investors.json`, its head and `traders/scripts/figi-cache.json` | Red run if either half failed (the other is still committed). Freshness: either file older than about 14 days. |
| **War Focus** (`warfocus-refresh.yml`) | 2nd of the month, 02:53 (03:53) | Re-scores the ongoing wars from UCDP's events and picks up new battles from Wikidata. Guard: not written if a war loses its Wikidata item, half its battles or a tenth of its UCDP events. | `battlefield/focus/data` | Red run. Freshness: older than about 62 days. |
| **Invention Timeline** (`progress-refresh.yml`) | 2nd of the month, 04:37 (05:37) | Re-reads the facts behind the breakthroughs from Wikidata (entries older than 25 days). Guard: not written if a curated event cannot be placed, people or institutions fall by a tenth, or the file would pass 1.5 MB. | `science/progress/data`, `science/scripts/progress-cache.json` | Red run. Freshness: older than about 62 days. |
| **Master Index, and the Bibliotheca tags** (`lake-refresh.yml`) | 3rd of the month, 03:31 (04:31) | Rebuilds the entity layer (mentions from every module, Wikidata facts, Wikipedia summaries), then tags every Bibliotheca book again against it. The books' mentions are filed under Neo Classic (`neo-classic`, Bibliotheca's reader; `bibliotheca` until 12 November 2026, when Bibliotheca left Kino for a module of its own and the committed lake was renamed to match). Guard: stops if a module's adapter fails, its mentions halve, or the entities fall by a tenth. | `lake/data`, `lake/scripts/summary-cache.json`, `bibliotheca/data/books`, `bibliotheca/data/index.json` | Red run. Freshness: `lake/data/manifest.json` older than about 62 days. |
| **Kino** (`kino-refresh.yml`) | 4th of the month, 04:13 (05:13) | Re-reads the documentaries' Wikidata labels and Wikimedia Commons image credits (entries older than 25 days) and rebuilds the catalogue. Guard: stops before writing the catalogue if a script fails its checks or a Commons image it names is gone. | `kino/data/index.json`, `media.json`, `iso.json`, and `kino/scripts/cache.json` | Red run. Freshness: the cache older than about 62 days. |
| **National Analysis** (`national-refresh.yml`) | 5th of the month, 03:47 (04:47) | World Bank indicators, plus leadership and conflict data from the Retrospective; heads of state and government from Wikidata, and from Political Atlas (checked out beside it, `--atlas`) the office whose holder is each country's current leader. The log lists where the Atlas and Wikidata name different people for that office, and the countries no data or `national/scripts/leader-offices.json` decides. Guard: not written if an indicator's countries halve, or the countries, their Wikidata matches, GW codes or leadership data fall by a tenth. | `national/data` | Red run. Freshness: `national/data/index.json` older than about 62 days. |
| **Check data freshness** (`freshness.yml`) | Daily 09:33 (10:33) | The alarm: see below. | `status/health.json` (the Dashboard's health mark), committed and deployed through the pipeline; the issue "Data health check failing"; a table on the run's summary page | It is the signal: the issue, a red run and the Dashboard's mark. |
| **Political Atlas monthly update** (political-atlas, `monthly-update.yml`) | 1st of the month, 06:00 (07:00) | Asks Claude, with web search, to check and update all 78 country records (paid: the Atlas README puts a full run at a few to low tens of US dollars), validates them, and opens a pull request, "Monthly political data update", for you to review. Nothing goes live until you merge it; merging redeploys Political Atlas. | `data/` in political-atlas, on the `data-update` branch (the pull request) | Red run in political-atlas's Actions tab, or no new pull request on the 1st. The freshness check does not watch it. It was switched off from 31 October to 2 November, so the November run was skipped; it runs again from 1 December. |

**Not timed.** These run when code is pushed. They are listed so that a red run there is not mistaken for a data failure.

- jdpi `ci.yml` (Test and deploy): every push to main and every pull request runs the whole test suite, the pages
  included (in Microsoft Edge); on main a passing suite deploys that commit. A red run means a change broke a test, so
  it was not deployed. The refreshes' own commits do not start it: each refresh calls the same pipeline itself. To
  test and deploy by hand: Actions → Test and deploy → Run workflow, on main (the only Run workflow button that
  deploys).
- jdpi `pages-deploy.yml` (Test and deploy the site): the only way the site reaches Cloudflare Pages (project `jdpi`),
  called by `ci.yml`, by every refresh and by the freshness check; it cannot be run on its own. Its `test` job runs the
  whole suite on one commit; its `deploy` job then uploads exactly that commit, only if the suite passed, the commit is
  still the head of main (a newer commit's own run deploys it, and an older one never overwrites it) and the repository
  variable `DEPLOY_TESTED_ONLY` is `true`. Runs from another branch test but never deploy. A passing run that deploys
  nothing because the variable is not `true` says so in a warning. wrangler, the upload tool, is pinned to one exact
  version there, with the date it was pinned beside it; the version is written only in that file. A red `test` job
  means the suite failed on that commit, so nothing was deployed; a red `deploy` job means the site was not updated
  (for example, the `CLOUDFLARE_API_TOKEN` secret is missing or was rejected). Either way the data was still committed.
  A skipped `deploy` job with the notice "main has moved on" is normal.

  **Only tested commits go live.** Re-running an Actions run uses the workflow files of that run's own commit, so a
  run from before 7 November 2026 would still use the old pipeline, which deployed main untested whenever
  `DEPLOY_FROM_GITHUB` was `true`. Two locks keep those out. Both are settings only you can change, from your terminal
  (`gh` signed in to GitHub):
  1. The switch. Before the push that brings this pipeline, `gh variable set DEPLOY_TESTED_ONLY --body true --repo
     JudePettit/jdpi`; right after it, `gh variable set DEPLOY_FROM_GITHUB --body false --repo JudePettit/jdpi`. Old
     runs, re-run or still queued, then deploy nothing, and the new pipeline goes on deploying. Leave
     `DEPLOY_FROM_GITHUB` off: it no longer switches anything on in jdpi (trade-desk keeps its own).
  2. The token. The deploy job runs in the GitHub environment `production`, which GitHub makes on the first deploy.
     Let it admit main only, then keep the Cloudflare token there and nowhere else:
     `gh api -X PUT repos/JudePettit/jdpi/environments/production -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"`,
     `gh api -X POST repos/JudePettit/jdpi/environments/production/deployment-branch-policies -f name=main -f type=branch`,
     `gh secret set CLOUDFLARE_API_TOKEN --env production --repo JudePettit/jdpi` (it asks for the token), then
     `gh secret delete CLOUDFLARE_API_TOKEN --repo JudePettit/jdpi`. A pull request, another branch or an old copy of
     the pipeline then cannot read the token at all, whatever its workflow files say.
- jdpi `kino-check.yml` (Check Kino): on pushes that touch Kino or the files its films link to, checks the scripts and
  runs the Kino tests. Deploys nothing.
- trade-desk `ci.yml` (Test and deploy): every push to main and every pull request runs the tests; on main a passing
  suite deploys the trade-desk Worker (`DEPLOY_FROM_GITHUB` is `true` there too).
- hp-retrospective has no workflows. Double Signal's private repository (`JudePettit/double-signal`, since 2 November)
  has one, `ci.yml` (Test): every push to main and every pull request runs its tests. It deploys nothing; Double
  Signal is still deployed by hand.

### The alarm: Check data freshness, daily at 09:33 (10:33)

After the morning's refreshes, `.github/scripts/freshness.mjs` makes four checks. The run goes red if any fails, and
its summary page has a table with a tick or a cross on every line.

1. **Each data file's age.** Every refresh stamps its file with the time it was made. A file older than twice its
   schedule plus three hours means its workflow has stopped committing, whether it fails, GitHub skipped it, or it
   "succeeded" without writing:
   - 15 hours: `science/`, `econ/` and `digital/briefing/data/stories.json`
   - 27 hours: `briefing/data/latest.json`
   - 51 hours: `calendar/data/2020s.json`, `integration/catalog.json`, `volatility/data/index.json` (its newest day)
   - about 14 days: `traders/data/congress.json`, `traders/data/investors.json`
   - about 62 days: `battlefield/data/realtime.json`, `battlefield/focus/data/index.json`,
     `science/progress/data/events.json`, `lake/data/manifest.json`, `national/data/index.json`, `kino/scripts/cache.json`
2. **Each refresh workflow's last scheduled run** must have succeeded. A grey run that GitHub cancelled because
   another was queued behind it is not a failure, and is ignored.
3. **The site serves the latest data.** The three briefings' stories, `calendar/data/2020s.json` and
   `volatility/data/index.json` on jdpi.pages.dev may be at most two hours behind the repository (checked again after
   three minutes). A failure here means a stuck deploy.
4. **What AI tools and other sites read still answers:** `/api/v1/datasets` lists at least 30 datasets, the MCP server
   lists at least 9 tools and answers `list_datasets`, and `/llms.txt` loads and names Vitruvian Manager.

**How it reaches you.** When the check fails it opens one GitHub issue, "Data health check failing", assigned to the
repository's owner, so GitHub's own notifications (email and the mobile app, as your GitHub notification settings
allow) carry it. Each further day it still fails, it adds a comment with that day's table; it never opens a second
issue. The first day it passes again, it comments "The check passed on …: all fresh" and closes the issue. It also
writes `status/health.json` (when it ran, whether it passed, and the plain names of what failed), commits it and
deploys it through the pipeline; the Dashboard (Home → Dashboard) reads that file and shows a small mark under its
intro, naming the failing stores and the check's date, or saying the check has not run for three days. While the
check passes the mark stays hidden. Because the file goes live through the tested pipeline, the mark lags when main is
red; the issue does not.

Every store's time is read as written: a full time as it is, and a bare date (as old copies may carry) as the end of
that day. The Integration Hub catalogue carries a full time since 7 November 2026, and is restamped on every build.

It watches only jdpi. Political Atlas, the Workers, Supabase and the aircraft proxy are outside it.

## 2. Cloudflare Workers

Two Workers have timers (Cloudflare calls them cron triggers). They run around the clock, so London time makes no
difference.

| Job | When | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **Tally Stick rules** (trade-desk) | Every minute | Checks each rule that is switched on (price, the day's change, Hype score, volume, or a set weekday time by the New York, London or UTC clock) and, when one fires, records its alert or sends its order through the risk gate. | `rules` (each rule's last check, note and firing), `orders_log`, `activity` | Tally Stick's **Activity** panel shows a `system` row "Rules run failed: …". Each rule's note in the Rules table says why it has not fired. |
| **Algo Trader agents** (trade-desk) | Every minute | Runs every agent that is on (simulated or live), one run at a time (a lease stops two overlapping). Refreshes Trading 212's instrument list at most once a day. | `agents` (each agent's book), `settings`, `t212_instruments`, `orders_log`, `activity` | Activity: "Algo Trader run failed: …" (`system`) or "[agent] Run failed: …" (`strategy`). On the Algo Trader page each agent shows its **Last run**: a time that stops moving means the agents are not running. |
| **Hype Tracker snapshot** (trade-desk) | Every hour, on the hour | Saves the top 40 tickers' score, mentions and volume ratio for the trend lines, then deletes snapshots older than 30 days and past days' order counters. It runs separately from the minute's job, so each has its own allowance of outside requests. | `hype_snapshots`, `settings` | Activity: "Hype snapshot failed: …"; gaps in a ticker's Hype history. |
| **Double Signal scan** (double-signal) | Every 10 minutes | Moves the hourly scan of the whole US market forward (Alpaca's market data), then sends queued alert emails through Resend. Algo Trader's Double Agent reads the alerts it finds. | Double Signal's own database: `scan_jobs`, `alerts`, `delivery_outbox`, `monitor_settings` | Double Signal's page (behind Cloudflare Access) shows its status as `degraded` (the last scan failed or hit a problem) or `setup_required`; "tick failed" in its Worker logs. |

- **Where they log.** trade-desk's `activity` table is its log: Tally Stick's Activity panel shows the newest 100 rows,
  and the MCP tool `recent_activity` reads it too. The status endpoint (`/api/tally/status`) shows the set-up
  (accounts, limits, the kill switch, MCP tokens), not whether the timers ran. Cloudflare also keeps each run's log for
  both Workers (observability is switched on): Cloudflare dashboard → Workers & Pages → the Worker → Logs (or
  Observability).
- **Silence is the failure nobody announces.** With no rule or agent switched on, a healthy minute writes nothing, and
  a timer that has stopped writes nothing either. Check that the agents' Last run times move.
- **Deploys.** trade-desk is deployed by its GitHub `ci.yml` once the tests pass. Double Signal is deployed by hand
  (`npm run deploy` in its folder); its code has been in the private repository `JudePettit/double-signal` since
  2 November, where every push runs the tests (no deploy).
- **On demand, not timed:** trade-desk's `/mcp` (about 120 requests a minute per client, 64 KB a request, one tool call
  each) and its public market data (`/api/public/…`, cached for 30 seconds).

## 3. Supabase (project `rpatomxgobrljilgbmub`)

Two jobs run inside the database on pg_cron, Supabase's timer. Their schedules and SQL live only in the database; no
repository holds them.

| Job | When | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **refresh-top-stories** (calls the Edge Function of the same name; its code is in `headlines/refresh-top-stories/`) | Every 10 minutes | Collects the Global Headline Tracker. Each call takes up to 6 of the 78 countries not yet done that UTC day, so all are normally done within about two hours of midnight UTC. For each, it reads the 5 most-read outlets' feeds (5 front-page items each), leaves out lowbrow stories with **Highbrowse** (fixed rules first, then Claude's verdict), translates non-English titles with Claude, and keeps 3 stories per outlet. Then a *backfill* (at most every 9 minutes) gives up to 100 stored stories a missing verdict or English title. It reads its list of outlets from jdpi.pages.dev, and it spends Claude credit. | `country_top_stories`; in `source_status_history`, a row per country (`country_top_stories`: `ready` or `unavailable`, the story count, translation and token use) and per backfill (`country_top_stories_backfill`: "Checking N stories", or `unavailable` with "Backfill failed: …") | The tracker says "today's refresh pending, showing" an earlier date. Status rows say `unavailable` ("No outlet feeds responded") or `translation: not configured` (the `ANTHROPIC_API_KEY` secret is missing). A Claude error for a country leaves no status row at all (only the call's reply has it), and the country is tried again ten minutes later; the Edge Function's logs show it. |
| **jp-iq-calendar-daily-snapshot** | Daily 05:00 (06:00) | Runs `SELECT public.capture_calendar_snapshot()`. That function is in no repository, so what it copies could not be checked. | By its name and the columns the site's client reads, a dated row in `calendar_snapshots` | Only the job's history in Supabase. Nothing in the site's code reads `calendar_snapshots` any more (the reader in `q/supabase-client.js` is never called), so a failure shows nowhere else. |

- The Edge Function is deployed to Supabase by hand (`supabase functions deploy refresh-top-stories --no-verify-jwt`),
  so the running copy can differ from the repository's.
- In the Supabase dashboard: the Cron page (Integrations → Cron) lists each run of both jobs. For refresh-top-stories
  that only shows the call was sent; whether it worked is in Edge Functions → refresh-top-stories → Logs, and in the
  newest rows of `source_status_history` (Table Editor, sorted by `checked_at`).

## 4. The site's server functions (Cloudflare Pages Functions)

None is timed. Five run on demand and have limits:

| Job | When | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **JSON API**, `/api/v1/` (`functions/api/v1/[[path]].js`) | On demand | Answers questions about the site's public data (catalogue, datasets, Master Index, events, briefings, RSS and JSON feeds, `calendar.ics`) from the deployment's own files. Limits: about 240 requests a minute per client; 100 rows a page; 400 events in a `.ics`. | Nothing | The 09:33 check fails if `/api/v1/datasets` lists fewer than 30 datasets. A caller over the limit is told "Too many requests" (429). |
| **MCP server**, `/mcp` (`functions/mcp.js`) | On demand | Lets AI tools such as Claude read the same data. Limits: about 120 requests a minute per client; 64 KB a request; 20 messages a batch; one tool call a request. | Nothing | The 09:33 check fails if it lists fewer than 9 tools or `list_datasets` does not answer. |
| **Aircraft proxy**, `/api/sigint/adsb/` (`functions/api/sigint/adsb/[[path]].js`) | On demand: the SIGINT Dashboard asks every 15 seconds while it is open | Relays adsb.lol's aircraft positions, which a browser cannot read from adsb.lol directly. Limits: about 30 requests a minute per client; answers cached for 10 seconds; adsb.lol's own refusals passed on. | Cloudflare's cache only | Nothing watches it. The SIGINT Dashboard shows no aircraft, and the proxy answers "adsb.lol did not answer" (502) or passes on adsb.lol's error. |
| **Voice proxy**, `/api/voice/v1/` (`functions/api/voice/v1/[[path]].js`, with `functions/_lib/voice.js` and `voice-providers.js`) | On demand: once a page when the Documentary panel or Kino's settings open, or Bibliotheca's Augmented Reading is turned on (`GET voices`, and again each time Bibliotheca offers the online voice, to show what is left), then one `POST say` a sentence while an online voice reads (Bibliotheca: one a unit of up to 200 characters, only within the characters the reader allowed for that chapter) | Speaks a sentence with an Azure neural voice, the key kept on the server. Only the site's own pages may call it. Limits: 1,000 characters a request; about 90 requests a minute per client; 30,000 characters a person a UTC day (`VOICE_DAILY_CHARS`) and 450,000 for the whole site a UTC month (`VOICE_MONTHLY_CHARS`, below Azure's free 500,000). Cache hits are free. | With an R2 bucket bound as `VOICE`: each clip and its `.vtt`, once (`azure/<voice>/<key>`). With a D1 database bound as `VOICE_DB`: the character counts (table `voice_usage`). Without them, nothing (the counts live in each copy's memory) | Nothing watches it, and by design nobody notices: every failure falls back to the device voice. `GET /api/voice/v1/voices` says `available: false, reason: "not configured"` without the secrets; the panel or Kino's note says "The online voice is not answering" or "has used today's allowance". |
| **Voice clips**, `/voice/<provider>/<voice>/<key>.mp3` and `.vtt` (`functions/voice/[[path]].js`) | On demand, when a page plays a stored clip | Serves the clips the voice proxy stored in R2, cached for a year (a clip never changes), with ranges for seeking. | Nothing | 404 for every clip while no bucket is bound as `VOICE`. |

The limits are counted separately in each of Cloudflare's copies of the function, so they are approximate, unless a
rate-limiting binding named `PRP_RATE_LIMITER` is added in Cloudflare; neither the repository nor the jdpi Pages
project's settings (checked 30 October) has one. The aircraft proxy always counts this way. So do the voice proxy's
character counts until a D1 database is bound as `VOICE_DB` (then they are shared and exact); until then only Azure's own
free-tier cap is hard, so bind D1 before moving the Speech resource to a paid tier. On the free tier (F0) Azure itself takes about 20 requests a minute
for the whole site, roughly two listeners at once; beyond that a listener hears the device voice for 30 seconds at a
time. The Speech resource is `vm-voice-speech` (free tier, UK South) in Jude's personal Azure subscription, made by
`PRP-azure-speech.mjs` (in the OneDrive folder, beside the vault script); its key is the Pages secret
`AZURE_SPEECH_KEY` (vault item "PRP / Azure / Speech key"), its region `AZURE_SPEECH_REGION`.

**The voice proxy's settings** (Cloudflare dashboard → Workers & Pages → jdpi → Settings → Variables and Secrets, for
Production; the vault script, `PRP-set-secrets.mjs`, has no Pages target yet, so these are set in the dashboard or with
`npx wrangler pages secret put <NAME> --project-name=jdpi`):

| Name | Kind | What |
|---|---|---|
| `AZURE_SPEECH_KEY` | Secret (Encrypt) | Key 1 of the Azure Speech resource (Azure portal → the Speech resource → Keys and Endpoint). Without it, and the region, the online voice is "not configured". |
| `AZURE_SPEECH_REGION` | Text | The resource's region as Azure writes it, e.g. `uksouth`. |
| `VOICE_SALT` | Secret (Encrypt), optional | Any long random string: salts the hash of each listener's IP address the counts are kept under. Without it each copy of the function draws its own. |
| `VOICE_DAILY_CHARS`, `VOICE_MONTHLY_CHARS` | Text, optional | The two character limits (defaults 30000 and 450000). |
| `VOICE_ORIGINS` | Text, optional | Other origins allowed to call the proxy, comma-separated (a custom domain, or `http://localhost:8788` for `wrangler pages dev`). |
| `VOICE` | R2 bucket binding, optional | The clip cache (Settings → Bindings → R2 bucket; a bucket such as `prp-voice`). |
| `VOICE_DB` | D1 database binding, optional | The shared character counts (Settings → Bindings → D1 database; the table is created on first use). |

Bindings and variables apply from the next deployment. The repository has no `wrangler.toml` for Pages: if one is ever
added it becomes the only source of the project's bindings, so it must then list these as well.

## When something breaks

Look in this order:

1. **The freshness check**: the open issue "Data health check failing" (github.com/JudePettit/jdpi → Issues), or
   Actions → Check data freshness. Red means a jdpi refresh has
   stopped, the site is serving old data, or the API, the MCP server or `llms.txt` is not answering. Its summary table
   names each file, its age and its workflow, with a link to that workflow's last run.
2. **That workflow's red run.** Open the red step; the line marked as an error says what happened:
   - "Not written: … A source probably failed", "Only N of M feeds …", or the like: an outside source was down or has
     changed. The next run usually fixes it; if it keeps failing, the source has changed and the script needs work. The
     page keeps its last good data meanwhile.
   - A failed test step: the new data broke a test, so it was not committed.
   - A failed `tests/heads.test.mjs` in the `deploy / test` job ("Out of step (run node integration/scripts/heads.mjs
     --all)"): a store was committed without its summaries, usually after a hand edit or a merge. Run that command on
     main and commit what it writes; the next deploy then passes.
   - "Someone else changed the same files …" or "Could not push the commit after 5 attempts": run it again (Run
     workflow).
   - A failed `deploy / test` job: the whole suite failed on main after the commit, so nothing was deployed. Open
     its "Run the suite" step for the failing test; main stays undeployed until a commit makes it pass.
   - A failed `deploy / deploy` job: the data was committed but the site was not updated (see `pages-deploy.yml`
     above).
3. **The site itself.** Pages say when their data is old (for example "Data is N hours old" on the Intelligence
   Briefing). If the files on GitHub are fresh but the site is not, the deploy is stuck: Cloudflare dashboard →
   Workers & Pages → jdpi → Deployments.
4. **Trade Desk.** Tally Stick's Activity panel for `system` rows, and the Algo Trader page for each agent's Last run. No
   new rows at all: the Worker's logs in Cloudflare, and trade-desk's Actions tab for a failed deploy.
5. **The Global Headline Tracker.** "Today's refresh pending" after about 03:00 UTC means collection is stuck. In
   Supabase, look at the Edge Function's logs, then the Cron page, then `source_status_history`. The function reads its
   outlet list from jdpi.pages.dev, so a site outage stops it too.
6. **Political Atlas.** On the 1st a pull request "Monthly political data update" should appear (political-atlas →
   Pull requests). If none does, look for a red run in its Actions tab.
7. **Double Signal.** Its page's status, then its Worker logs in Cloudflare.

GitHub emails you about a failed scheduled run if your GitHub notification settings allow it (Settings → Notifications,
under Actions), and about the freshness check's issue as it does about any issue assigned to you (Settings →
Notifications, Participating: email, and GitHub Mobile for the phone). GitHub can also switch a schedule off altogether, for example after 60 days without activity in a public
repository; the workflow's page then shows a banner with a button to enable it again.

## Keep this current

Change this file in the same commit as any change to a timed job, and:

- **A new or changed jdpi refresh.** Every pipeline today has each of these; a new one needs them all:
  1. **A guard in the build:** before writing, compare the new data with the last good copy and stop, writing
     nothing, when a source failed and a count would fall too far (usually by more than half, for some by a tenth).
     The run then fails and the page keeps its last good data.
  2. **A `generated` stamp** in the main data file, with the time it was made. If a page is to read a summary of the
     store rather than the store itself, add it to `HEADS` in `integration/scripts/heads.mjs`, call `writeHeads()` at the
     end of the build, put the summary's path in the workflow's `commit-data` paths, and check it in the module's test
     (`checkHeads`); `tests/heads.test.mjs` holds all four in place.
  3. **A data test** in `tests/` that checks the committed files (their shape and the counts the guard protects) and
     passes with `PRP_PAGES=0`, so the refresh can run it with no browser.
  4. **A workflow** copied from an existing one: a schedule staggered from the others (in data order), a time limit
     and a no-overlap group, the test step before `./.github/actions/commit-data` (which commits only its own
     paths), then the deploy job (`needs` the refresh job, `if: ${{ !cancelled() }}`, `uses:
     ./.github/workflows/pages-deploy.yml`, `with: deploy: ${{ github.ref == 'refs/heads/main' }}`, `secrets:
     inherit`); `tests/freshness.test.mjs` checks every workflow has it.
  5. **A freshness entry:** add the file to `STORES` in `.github/scripts/freshness.mjs` (its plain name, which the
     issue and the Dashboard's mark show, its workflow, how often it
     can change in hours, and `live: true` if the site's copy should be compared). Without that entry the alarm will
     not notice the job stopping.
  6. **A row in section 1 of this file.** If the data names people, places, wars or parties, also add an adapter in
     `lake/scripts/adapters.mjs` so the Master Index links to it.
  7. **Its freshness line:** the workflow's cron in `SCHEDULES` (`design/prp-freshness.js`), and in the submodule's
     registry entry a `data` block naming the line's class, the workflow and the small file whose time it shows
     (`tests/freshness-labels.test.mjs` checks all three against the workflow and the freshness entry).
- **A Worker timer:** trade-desk's are `triggers.crons` in `wrangler.jsonc` with the matching branch of `scheduled()` in
  `src/index.js`; Double Signal's is in `vite.config.ts`.
- **A Supabase job:** its schedule and SQL exist only in the database, so write them down here.
- **A server function with a limit:** add it to section 4.
- The README's "Data refreshes" paragraph points here: keep it that way rather than repeating the list.
