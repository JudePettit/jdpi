# Operations

Every timed job behind Vitruvian Manager: when it runs, what it writes, and how you know it broke. Checked against the
files on 31 October 2026 (jdpi `fb8c85b`, trade-desk `8e7873d`, political-atlas `dabbb34`, double-signal `fd64ae8`).

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
the run red and drops that run's data (the next run tries again). Then the run deploys the site (`pages-deploy.yml`),
even when the refresh failed, so anything it did commit goes live. Every build also has a **guard**: when a source fails
and the new file would lose too much (usually more than half of a count, for some a tenth), nothing is written and the
run fails, so the page keeps its last good data and simply ages.

| Job (workflow) | When: UTC (London in summer) | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **Scientific, Economics and Digital Briefings** (`briefings-refresh.yml`) | Every six hours: 01:45, 07:45, 13:45, 19:45 (02:45, 08:45, 14:45, 20:45) | Fetches every feed of the three briefings and rolls their seven-day stores forward. Each briefing is built and tested on its own. Guard: a briefing with fewer than 75% of its feeds working is not written. | `science/briefing/data`, `econ/briefing/data`, `digital/briefing/data`, in one commit | Red run naming the briefing that failed: it is put back as it was, the other two are still committed. Freshness: its `stories.json` older than 15 hours. |
| **Intelligence Briefing** (`briefing-refresh.yml`) | Daily 06:05 and 18:05 (07:05, 19:05) | Fetches its 64 publisher feeds and rolls the seven-day story store forward. Guard: not written if fewer than 75% of feeds work, or a political position (far left to far right) has fewer than 8 working publishers. | `briefing/data/latest.json` | Red run; the page says "Data is N hours old". Freshness: older than 27 hours. |
| **Geopolitical Volatility** (`volatility-refresh.yml`) | Daily 01:25 (02:25) | Scores the latest complete day of GDELT's event files, looking back 7 days. Guard: a day with fewer than 72 of its 96 quarter-hour files, or too few located events, is not written; it is tried again the next night. | `volatility/data` (a file per day, and `index.json`) | Red run when two nights in a row could not complete their day. Freshness: the newest complete day older than 51 hours, or the site serving an older copy. |
| **Realtime and Historical Calendars, and the Integration Hub** (`calendar-refresh.yml`) | Daily 05:23 (06:23) | Rebuilds the calendars from Wikipedia (the Current events portal, its lists and electoral calendars), Wikidata and the Political Atlas, adds Wikipedia summaries, and tests them. Then rebuilds the Integration Hub (data catalogue, iCalendar files, country profiles, `openapi.json`, `llms.txt`) and tests that. Guard: stops if a type of event would lose more than half its records; the Hub stops if a dataset would lose more than half its rows. | `calendar/data`, `calendar/scripts/summary-cache.json`, `integration/` (catalogue, data, feeds, skill, `openapi.json`), `llms.txt` | Red run. If only the Hub failed, its files are thrown away, the calendars are still committed, and the run ends red. Freshness: `calendar/data/2020s.json` or `integration/catalog.json` older than 51 hours. |
| **Realtime Battlefield** (`battlefield-refresh.yml`) | Mondays 06:17 (07:17) | Looks for UCDP's monthly release of candidate events and rebuilds when there is a new one; most weeks nothing changes. Guard: refuses an older release, or a file with fewer months, or a tenth fewer events or deaths. | `battlefield/data/realtime.json` | Red run. Freshness counts it as monthly: older than about 62 days. |
| **Auto Trader** (`traders-refresh.yml`) | Tuesdays 03:41 (04:41) | US House members' trade reports, then large investors' 13F holdings (tickers from OpenFIGI), each tested and committed on its own. Guard: trades not written if a year loses a tenth of its trades or half its members or parties; holdings not written if a listed investor goes missing or has a tenth fewer positions. | `traders/data/congress.json` and `traders/scripts/ptr-cache.json`; `traders/data/investors.json` and `traders/scripts/figi-cache.json` | Red run if either half failed (the other is still committed). Freshness: either file older than about 14 days. |
| **War Focus** (`warfocus-refresh.yml`) | 2nd of the month, 02:53 (03:53) | Re-scores the ongoing wars from UCDP's events and picks up new battles from Wikidata. Guard: not written if a war loses its Wikidata item, half its battles or a tenth of its UCDP events. | `battlefield/focus/data` | Red run. Freshness: older than about 62 days. |
| **Invention Timeline** (`progress-refresh.yml`) | 2nd of the month, 04:37 (05:37) | Re-reads the facts behind the breakthroughs from Wikidata (entries older than 25 days). Guard: not written if a curated event cannot be placed, people or institutions fall by a tenth, or the file would pass 1.5 MB. | `science/progress/data`, `science/scripts/progress-cache.json` | Red run. Freshness: older than about 62 days. |
| **Encyclopaedia, and the Bibliotheca tags** (`lake-refresh.yml`) | 3rd of the month, 03:31 (04:31) | Rebuilds the entity layer (mentions from every module, Wikidata facts, Wikipedia summaries), then tags every Bibliotheca book again against it. Guard: stops if a module's adapter fails, its mentions halve, or the entities fall by a tenth. | `lake/data`, `lake/scripts/summary-cache.json`, `bibliotheca/data/books`, `bibliotheca/data/index.json` | Red run. Freshness: `lake/data/manifest.json` older than about 62 days. |
| **Kino** (`kino-refresh.yml`) | 4th of the month, 04:13 (05:13) | Re-reads the documentaries' Wikidata labels and Wikimedia Commons image credits (entries older than 25 days) and rebuilds the catalogue. Guard: stops before writing the catalogue if a script fails its checks or a Commons image it names is gone. | `kino/data/index.json`, `media.json`, `iso.json`, and `kino/scripts/cache.json` | Red run. Freshness: the cache older than about 62 days. |
| **National Analysis** (`national-refresh.yml`) | 5th of the month, 03:47 (04:47) | World Bank indicators, plus leadership and conflict data from the Retrospective. Guard: not written if an indicator's countries halve, or the countries, their Wikidata matches, GW codes or leadership data fall by a tenth. | `national/data` | Red run. Freshness: `national/data/index.json` older than about 62 days. |
| **Check data freshness** (`freshness.yml`) | Daily 09:33 (10:33) | The alarm: see below. | Nothing in the repository; a table on the run's summary page | It is the signal. |
| **Political Atlas monthly update** (political-atlas, `monthly-update.yml`) | 1st of the month, 06:00 (07:00) | Asks Claude, with web search, to check and update all 78 country records (paid: the Atlas README puts a full run at a few to low tens of US dollars), validates them, and opens a pull request, "Monthly political data update", for you to review. Nothing goes live until you merge it; merging redeploys Political Atlas. | `data/` in political-atlas, on the `data-update` branch (the pull request) | Red run in political-atlas's Actions tab, or no new pull request on the 1st. The freshness check does not watch it. |

**Not timed.** These run when code is pushed. They are listed so that a red run there is not mistaken for a data failure.

- jdpi `ci.yml` (Test and deploy): every push to main and every pull request runs the whole test suite, the pages
  included (in Microsoft Edge); on main a passing suite deploys. A red run means a change broke a test, so it was not
  deployed. The refreshes' own commits do not start it: they test their own data.
- jdpi `pages-deploy.yml` (Deploy the site): uploads main to Cloudflare Pages (project `jdpi`). Called by `ci.yml` and
  by every refresh, and runs only while the repository variable `DEPLOY_FROM_GITHUB` is `true` (it was on 31 October
  2026). A red deploy means the site was not updated (for example, the `CLOUDFLARE_API_TOKEN` secret is missing or
  was rejected); the data was still committed.
- jdpi `kino-check.yml` (Check Kino): on pushes that touch Kino or the files its films link to, checks the scripts and
  runs the Kino tests. Deploys nothing.
- trade-desk `ci.yml` (Test and deploy): every push to main and every pull request runs the tests; on main a passing
  suite deploys the trade-desk Worker (`DEPLOY_FROM_GITHUB` is `true` there too).
- hp-retrospective has no workflows, and Double Signal has no GitHub repository.

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

It watches only jdpi. Political Atlas, the Workers, Supabase and the aircraft proxy are outside it.

### Where the README is out of date

The README's "Data refreshes" paragraph lists the Briefing twice daily, the Scientific Briefing every six hours,
"Volatility, National Analysis, Battlefield and War Focus, Auto Trader (weekly)", and the Invention Timeline and the
Encyclopaedia monthly. Where they disagree, the workflow files are right:

- Volatility runs **daily**; Battlefield and Auto Trader are **weekly**; War Focus and National Analysis are
  **monthly**. The README gives Volatility, National Analysis, Battlefield and War Focus no schedule of their own, or,
  read as one group with Auto Trader, calls them all weekly.
- The Economics and Digital Briefings run with the Scientific one.
- It leaves out the Calendars and Integration Hub (daily), Kino (monthly), the Bibliotheca tags, the freshness check,
  the deploy at the end of every refresh, and everything outside jdpi.
- "Commit. Cloudflare redeploys automatically" (under "Adding a submodule") is still true in effect, but the deploy now
  comes from GitHub after the tests pass, so a commit that fails a test is not deployed.

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
  (`npm run deploy` in its folder).
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

None is timed. Three run on demand and have limits:

| Job | When | What it does | What it writes | How you know it broke |
|---|---|---|---|---|
| **JSON API**, `/api/v1/` (`functions/api/v1/[[path]].js`) | On demand | Answers questions about the site's public data (catalogue, datasets, Encyclopaedia, events, briefings, RSS and JSON feeds, `calendar.ics`) from the deployment's own files. Limits: about 240 requests a minute per client; 100 rows a page; 400 events in a `.ics`. | Nothing | The 09:33 check fails if `/api/v1/datasets` lists fewer than 30 datasets. A caller over the limit is told "Too many requests" (429). |
| **MCP server**, `/mcp` (`functions/mcp.js`) | On demand | Lets AI tools such as Claude read the same data. Limits: about 120 requests a minute per client; 64 KB a request; 20 messages a batch; one tool call a request. | Nothing | The 09:33 check fails if it lists fewer than 9 tools or `list_datasets` does not answer. |
| **Aircraft proxy**, `/api/sigint/adsb/` (`functions/api/sigint/adsb/[[path]].js`) | On demand: the SIGINT Dashboard asks every 15 seconds while it is open | Relays adsb.lol's aircraft positions, which a browser cannot read from adsb.lol directly. Limits: about 30 requests a minute per client; answers cached for 10 seconds; adsb.lol's own refusals passed on. | Cloudflare's cache only | Nothing watches it. The SIGINT Dashboard shows no aircraft, and the proxy answers "adsb.lol did not answer" (502) or passes on adsb.lol's error. |

The limits are counted separately in each of Cloudflare's copies of the function, so they are approximate, unless a
rate-limiting binding named `PRP_RATE_LIMITER` is added in Cloudflare; neither the repository nor the jdpi Pages
project's settings (checked 30 October) has one. The aircraft proxy always counts this way.

## When something breaks

Look in this order:

1. **The freshness check** (github.com/JudePettit/jdpi → Actions → Check data freshness). Red means a jdpi refresh has
   stopped, the site is serving old data, or the API, the MCP server or `llms.txt` is not answering. Its summary table
   names each file, its age and its workflow, with a link to that workflow's last run.
2. **That workflow's red run.** Open the red step; the line marked as an error says what happened:
   - "Not written: … A source probably failed", "Only N of M feeds …", or the like: an outside source was down or has
     changed. The next run usually fixes it; if it keeps failing, the source has changed and the script needs work. The
     page keeps its last good data meanwhile.
   - A failed test step: the new data broke a test, so it was not committed.
   - "Someone else changed the same files …" or "Could not push the commit after 5 attempts": run it again (Run
     workflow).
   - A failed deploy step: the data was committed but the site was not updated (see `pages-deploy.yml` above).
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
under Actions). GitHub can also switch a schedule off altogether, for example after 60 days without activity in a public
repository; the workflow's page then shows a banner with a button to enable it again.

## Keep this current

Change this file in the same commit as any change to a timed job, and:

- **A new or changed jdpi refresh:** copy an existing workflow (a test step, `./.github/actions/commit-data`, the
  deploy job), stamp the data file with `generated`, and add the file to `STORES` in `.github/scripts/freshness.mjs`
  (its workflow, how often it can change in hours, and `live: true` if the site's copy should be compared). Without
  that entry the alarm will not notice the job stopping.
- **A Worker timer:** trade-desk's are `triggers.crons` in `wrangler.jsonc` with the matching branch of `scheduled()` in
  `src/index.js`; Double Signal's is in `vite.config.ts`.
- **A Supabase job:** its schedule and SQL exist only in the database, so write them down here.
- **A server function with a limit:** add it to section 4.
- The README's "Data refreshes" paragraph should point here rather than repeat the list.
