title: Software Cookbook
intro: The tools amateur and hobbyist investigators use most, with the official place to get each one, install steps for Windows, macOS and Linux, a first test, common pitfalls and the legal points to know. Workflows at the end chain them together.
updated: 28 October 2026

## How to use this cookbook
- **Install from the official source only.** Every tool below links to its maker's own site or official store listing. Copies on download portals and "cracked" versions are a common route for malware, and investigators are attractive targets.
- **Pick your system once.** The install steps show Windows, macOS or Linux; choose yours in any of them and the rest follow (the choice is remembered in this browser).
- **Check before you trust.** Where a maker publishes checksums or signatures, compare them (the [Kit Guide](#tab=kit&s=hashing-captured-files) shows how to hash a file). Keep tools updated: scrapers and verification tools break when websites change.
- **Stay inside the scope.** These tools serve investigations of events, organisations, places, infrastructure and claims. Several of them can also be pointed at people; do not use them that way. The [Law & ethics](#tab=law) tab sets out the boundaries.

! Checked: Download locations, versions and prices were checked on 28 October 2026. Tools change quickly; Bellingcat's free [Online Investigations Toolkit](https://bellingcat.gitbook.io/toolkit) keeps a wider, current list.

::: facts
Tools: 15, from browser extensions to whole virtual machines
Cost: All free except Hunchly (paid); Maltego CE needs a free account
Course: [Archives and preservation](course:archives-and-preservation), [Reverse image search, metadata and synthetic media](course:reverse-image-search-metadata-and-synthetic-media)
:::

## Browser extensions
Extensions run inside your browser with access to the pages you open. Install as few as you need, only from the official store listings named here, and keep them in a separate research profile (see the [Kit Guide](#tab=kit&s=separate-browser-profiles-or-virtual-machines)).

### InVID-WeVerify verification plugin {#invid}
::: facts
What it does: Splits videos into keyframes for reverse image search, reads metadata, magnifies details, runs forensic filters on images and sends an image to several search engines at once
Cost: Free (some advanced tools are limited to registered journalists, fact-checkers and researchers)
Official source: [weverify.eu/verification-plugin](https://weverify.eu/verification-plugin/), which links to the Chrome Web Store listing "Fake news debunker by InVID & WeVerify"
Made by: AFP Medialab with the InVID, WeVerify and vera.ai research projects
Runs in: Chrome, Edge, Brave, Vivaldi and other Chromium browsers. There is no official Firefox version
:::
::: os chrome Chrome, Brave or Vivaldi
1. Open [the official plugin page](https://weverify.eu/verification-plugin/) and follow its link to the Chrome Web Store (check the publisher shown there before installing).
2. Click **Add to Chrome**, then **Add extension**.
3. Pin it: click the puzzle-piece icon in the toolbar and the pin next to the plugin.
:::
::: os edge Microsoft Edge
1. Open [the official plugin page](https://weverify.eu/verification-plugin/) and follow its Chrome Web Store link.
2. Edge offers to **Allow extensions from other stores**: accept, then click **Get** or **Add to Chrome**.
3. Pin it from the **Extensions** button in the toolbar.
:::
::: os firefox Firefox
There is no official Firefox release. Do not install look-alikes from the add-ons site; use a Chromium browser profile for this plugin.
:::

#### First test
Open the plugin, choose **Keyframes**, paste the address of a public news video and click **Submit**. Then click any keyframe and use the reverse search buttons. For a still image, try **Magnifier** and **Forensic** with a photo you took yourself.

#### Pitfalls
- Keyframes are a sample: a fake can sit between them. Step through the video yourself when it matters.
- Forensic filters show compression patterns, not "fake" or "real". They mislead more often than they help in untrained hands.
- Some features send media to third-party services (search engines, the plugin's own servers). Do not process confidential or sensitive material with them.

#### Legal and ethical notes
- Use it to trace images of places and events, never to identify private people from their faces.
- Media you analyse belongs to its owners; analysis for verification is fine, republishing is a copyright question.

### Wayback Machine extension {#wayback-extension}
::: facts
What it does: Saves the page you are on to the Internet Archive (Save Page Now), shows its oldest and newest captures, and offers an archived copy when a page is gone
Cost: Free (some options need a free archive.org account)
Official source: the Internet Archive's listings on the [Chrome Web Store](https://chromewebstore.google.com/detail/wayback-machine/fpnmgdkabkmnadcjpehmlllkndpkmiak), [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/wayback-machine_new/), [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/wayback-machine/kjmickeoogghaimmomagaghnogelpcpn) and the [Mac App Store](https://apps.apple.com/app/wayback-machine/id1472432422) (for Safari)
Publisher shown in the store: Internet Archive
:::
::: os chrome Chrome, Edge or Brave
1. Open the Chrome Web Store or Edge Add-ons listing above and check the publisher is the Internet Archive.
2. Click **Add to Chrome** (or **Get** in Edge) and confirm.
3. Pin the icon so you can save pages in one click.
:::
::: os firefox Firefox
1. Open the Firefox Add-ons listing above and check it is published by the Internet Archive.
2. Click **Add to Firefox**, then **Add**.
:::
::: os safari Safari
1. Install **Wayback Machine** from the Mac App Store listing above.
2. Open Safari, choose **Safari › Settings › Extensions** and tick **Wayback Machine**.
:::

#### First test
Open any public news article, click the extension and choose **Save Page Now**. When it finishes, open the capture and check its timestamp. Then try **Oldest** on a site's home page. The [Archives tab](#tab=archives) does the same checks and keeps the result in your case notebook.

#### Pitfalls
- Pages behind logins, paywalls or heavy scripts often capture badly or not at all. Always check the capture, not just the "saved" message.
- Site owners can ask for captures to be excluded, and the archive has been offline before (a cyber-attack took it down for several days in October 2024). Keep your own copy and hash it as well.
- Saving a page tells the Internet Archive what you are looking at. That is fine for most work; think twice in sensitive cases.

#### Legal and ethical notes
- An archived copy proves what a page said at a moment, not that it was true.
- Archives are not a way round paywalls or logins; using them like that breaches publishers' terms.

## Metadata and media
### ExifTool {#exiftool}
::: facts
What it does: Reads, writes and removes metadata in images, video, audio and documents: thousands of tags, including makers' private notes
Cost: Free and open source
Official source: [exiftool.org](https://exiftool.org), by Phil Harvey
Version checked: 13.59 (October 2026)
Runs on: Windows, macOS and Linux (a command-line tool)
:::
::: os windows
1. On [exiftool.org](https://exiftool.org), download the **Windows Executable** (a zip such as `exiftool-13.59_64.zip`).
2. Extract the zip to a folder such as `C:\Tools\exiftool`. Keep the `exiftool_files` folder next to the program.
3. Rename `exiftool(-k).exe` to `exiftool.exe`. (The "-k" version pauses so you can read output when you double-click it.)
4. Add the folder to your PATH: Start › type "environment variables" › **Edit the system environment variables** › **Environment Variables** › select **Path** › **Edit** › **New**, then paste the folder.
5. Open a new PowerShell window and run `exiftool -ver`.
:::
::: os macos
1. On [exiftool.org](https://exiftool.org), download the **MacOS Package** (`ExifTool-13.59.pkg`) and open it to install.
2. Or, with [Homebrew](https://brew.sh): `brew install exiftool`.
3. Open Terminal and run `exiftool -ver`.
:::
::: os linux
1. Debian or Ubuntu: `sudo apt install libimage-exiftool-perl`. Fedora: `sudo dnf install perl-Image-ExifTool`.
2. Distribution packages can lag behind. For the newest version, download the **Perl distribution** from [exiftool.org](https://exiftool.org), extract it and run `./exiftool` from that folder.
3. Run `exiftool -ver`.
:::

#### First test
Take a photo with your phone, copy the original file to your computer and run:
```sh
exiftool -a -G1 -s photo.jpg
exiftool -time:all -a -G1 -s photo.jpg
exiftool -n -GPSLatitude -GPSLongitude -GPSImgDirection photo.jpg
```
The first lists every tag with its group, the second every date and time, the third the position in decimal degrees. Compare with what the [Media check](#tab=media) tab shows for the same file.

#### Pitfalls
- **Work on copies.** Writing commands change files. ExifTool keeps a backup named `*_original` unless you add `-overwrite_original`; never write to evidence.
- Times usually have no time zone. Look for `OffsetTimeOriginal` and compare with the GPS time, which is in UTC.
- Platforms strip metadata on upload, so files from social networks rarely have any. That proves nothing.
- Windows: an error about `exiftool_files` means the folder was not kept next to the program.

#### Legal and ethical notes
- Metadata can name the photographer, the camera's serial number and where someone lives. It is personal data under the GDPR: record only what your question needs.
- Do not strip copyright details from other people's images that you republish: removing "rights management information" is unlawful in the EU, the UK and the US.
- Strip your own photos before sharing them: `exiftool -gps:all= -xmp:geotag= photo.jpg` (on a copy).

### yt-dlp {#yt-dlp}
::: facts
What it does: Downloads video and audio, with the uploader's metadata, from YouTube and over a thousand other sites, to preserve material that may be deleted
Cost: Free and open source
Official source: [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) (releases and install instructions)
Version checked: 2026.10.26
Needs: [FFmpeg](https://www.ffmpeg.org/download.html) to merge the best video and audio, and, for YouTube, a JavaScript runtime: [Deno](https://docs.deno.com/runtime/getting_started/installation/) is recommended (required since version 2025.11.12)
:::
::: os windows
1. In PowerShell: `winget install yt-dlp.yt-dlp`. (Or download `yt-dlp.exe` from the project's **Releases** page on GitHub.)
2. Add the helpers if they are missing: `winget install Gyan.FFmpeg` and `winget install DenoLand.Deno`.
3. Open a new window and run `yt-dlp --version`.
:::
::: os macos
1. With [Homebrew](https://brew.sh): `brew install yt-dlp ffmpeg deno`.
2. Run `yt-dlp --version`.
:::
::: os linux
1. Install the helpers from your distribution, for example `sudo apt install ffmpeg`, and Deno from [its official instructions](https://docs.deno.com/runtime/getting_started/installation/).
2. Install the official binary:
```sh
mkdir -p ~/.local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp
```
3. Run `yt-dlp --version`. Update later with `yt-dlp -U`.
:::

#### First test
List what is available without downloading, then archive one public video you have a right to keep, with its metadata, and hash the result:
```sh
yt-dlp -F "https://www.youtube.com/watch?v=VIDEO_ID"
yt-dlp --write-info-json --write-description --write-thumbnail --restrict-filenames -o "%(upload_date)s_%(extractor)s_%(id)s.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
```
The `.info.json` file records the title, uploader, upload date and original address. Hash every file you keep (see the [Kit Guide](#tab=kit&s=hashing-captured-files)) and log it in the [Case notebook](#tab=notebook).

#### Pitfalls
- "No supported JavaScript runtime" means Deno is missing. "Sign in to confirm you're not a bot" means the site is limiting you: wait. Do not feed it your personal account's cookies to get round the check.
- Websites change constantly; update yt-dlp before important work.
- Re-encoding changes the file: keep the original download untouched and hash it.
- Upload dates come from the platform and are often in UTC; check the full timestamp in the `.info.json`.

#### Legal and ethical notes
- Most platforms' terms forbid downloading except through their own buttons. Download only what you need to preserve as evidence or for research, keep it private and do not republish it.
- Copyright exceptions differ by country (for example fair dealing for non-commercial research in Irish and UK law). They do not cover redistribution.
- Videos show people, and `.info.json` names the uploader: store them securely and delete them when the case closes.

## Capture and case management
### Hunchly (paid) {#hunchly}
::: facts
What it does: Records every page you visit in a case, automatically, with its address, time and hash; adds notes, tags and selectors; and builds a report and an evidence package
Cost: Classic licence €149 or US$169 a year (local storage); a free 30-day trial without a card. Checked October 2026
Official source: [hunch.ly](https://www.hunch.ly) (downloads at hunch.ly/downloads)
Runs on: A desktop app for Windows, macOS and Linux that works with a Chrome extension
:::
::: os windows
1. Download the Windows installer from [hunch.ly](https://www.hunch.ly) and run it.
2. Start Hunchly and install its Chrome extension from the link it shows. Use a dedicated Chrome profile for research.
3. Create a case, then turn capture on from the extension.
:::
::: os macos
1. Download the macOS installer from [hunch.ly](https://www.hunch.ly), open it and drag Hunchly to Applications.
2. Start Hunchly and install its Chrome extension from the link it shows, in a dedicated research profile.
3. Create a case and turn capture on.
:::
::: os linux
1. Download the Linux package from [hunch.ly](https://www.hunch.ly) and install it with your package manager.
2. Start Hunchly, install its Chrome extension in a dedicated research profile, create a case and turn capture on.
:::

#### First test
Create a case called "Test", open three public pages, and check each appears in Hunchly with a timestamp and hash. Add a note to one, then export the case report.

#### Pitfalls
- It captures only what you load in the browser profile where the extension is on. Keep personal browsing elsewhere, or it ends up in your case.
- A case holds everything you looked at: encrypt the disk it sits on and back it up.

#### Legal and ethical notes
- Captures are copies of other people's pages: use them as evidence and research records, not for republication.
- Everything a case collects about people is personal data; apply the [GDPR basics](#tab=law&s=gdpr-and-a-lawful-basis-for-personal-data).

::: tip Free alternatives
For your own copies of pages without a subscription: [SingleFile](https://github.com/gildas-lormeau/SingleFile) saves a complete page as one HTML file, and Webrecorder's [ArchiveWeb.page](https://archiveweb.page) records pages as standard web archives (WACZ) in your browser. Hash what they save and log it in the [Case notebook](#tab=notebook).
:::

## Link analysis and reconnaissance
### Maltego CE {#maltego}
::: facts
What it does: Draws entities (domains, companies, addresses, documents) and the links between them as a graph, with "transforms" that look up related entities in online sources
Cost: Free Community Edition with a Maltego ID (part of the free Basic plan); paid plans add data and limits
Official source: [maltego.com/downloads](https://www.maltego.com/downloads/)
Runs on: Windows, macOS and Linux (Maltego Graph desktop app)
:::
::: os windows
1. Download the Windows installer from [maltego.com/downloads](https://www.maltego.com/downloads/) and run it.
2. Start Maltego, sign in with (or create) a free Maltego ID and confirm the activation email.
3. Choose the free Community Edition when asked, and install only the Transform Hub items you need.
:::
::: os macos
1. Download the macOS package from [maltego.com/downloads](https://www.maltego.com/downloads/) and install it.
2. Start Maltego, sign in with your Maltego ID and choose the Community Edition.
:::
::: os linux
1. Download the .deb or .rpm package from [maltego.com/downloads](https://www.maltego.com/downloads/) and install it, for example `sudo apt install ./Maltego*.deb`.
2. Start Maltego, sign in with your Maltego ID and choose the Community Edition.
:::

#### First test
Create a new graph, drag a **Domain** entity onto it, set it to `wikipedia.org` and run the transform **To DNS Name - NS (name server)**. You should see its name servers appear as linked entities. Compare them with the [Domains tab](#tab=domains).

#### Pitfalls
- The free edition returns only a limited number of results per transform, so a graph can look complete when it is not.
- Every transform sends your entity to Maltego's servers or a data provider: you are telling third parties what you are investigating.

::: warn Entity-graph caution
A line on a graph is not a relationship. Two companies sharing an address, a name server or a director's name may mean nothing (formation agents and hosting companies serve thousands of clients). Label every link with its source and date, prune what you cannot explain, and never publish a graph as proof of association. Leave out the transforms that look up people, email addresses, phone numbers or breach data.
:::

#### Legal and ethical notes
- Data returned by transforms comes with each provider's terms; check them before reusing results.
- Graphs of people are profiles. Under the GDPR, building one needs a lawful basis you can defend; in this dashboard's scope, keep graphs to organisations and infrastructure.

### SpiderFoot {#spiderfoot}
::: facts
What it does: Automates reconnaissance of a domain, IP address or network across 200-plus data sources, in a local web interface
Cost: Free and open source (MIT licence); a separate paid hosted product exists
Official source: [github.com/smicallef/spiderfoot](https://github.com/smicallef/spiderfoot)
Status: Last numbered release v4.0 (April 2022); the code still receives occasional updates (April 2026)
Use only for: Infrastructure and organisation reconnaissance you are authorised to do
:::
::: os windows
1. Install [Python 3](https://www.python.org/downloads/) (tick **Add python.exe to PATH**) and [Git](https://git-scm.com/download/win).
2. In PowerShell:
```sh
git clone https://github.com/smicallef/spiderfoot.git
cd spiderfoot
py -3 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python sf.py -l 127.0.0.1:5001
```
3. Open `http://127.0.0.1:5001` in your browser.
:::
::: os macos
1. Install Python 3 and Git (with Homebrew: `brew install python git`).
2. In Terminal:
```sh
git clone https://github.com/smicallef/spiderfoot.git
cd spiderfoot
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 ./sf.py -l 127.0.0.1:5001
```
3. Open `http://127.0.0.1:5001`.
:::
::: os linux
1. Install Python 3, venv and Git, for example `sudo apt install python3 python3-venv git`.
2. Run the same commands as on macOS, then open `http://127.0.0.1:5001`.
:::

#### First test
Start a scan of a domain you own or are authorised to assess. Under **By Use Case** choose **Passive**, which queries third-party sources without connecting to the target's own servers. When it finishes, look at **Browse** for DNS records, certificates and hosting.

#### Configure it for this scope
- **Skip the people modules.** Switch to **By Module** and untick everything that collects people or their accounts, for example Account Finder (`sfp_accounts`), Human Name Extractor (`sfp_names`), E-Mail Address Extractor (`sfp_email`), Phone Number Extractor (`sfp_phone`), breach and leak lookups such as `sfp_haveibeenpwned`, and social-media modules.
- **Avoid active modules without written permission.** Port scans, DNS brute force and web spidering touch the target's systems.
- Many modules need their own API keys. Add only keys whose terms allow your use.

#### Pitfalls
- It runs with the dependencies of 2022: if `pip install` fails on the newest Python, use the previous Python release in the virtual environment.
- Results mix strong and weak signals. Verify anything you report by hand, ideally with the [Domains tab](#tab=domains) and the original source.
- The web interface has no login by default: keep it on `127.0.0.1`.

#### Legal and ethical notes
- Scanning or probing systems you do not own or have permission to test can be an offence (the UK's Computer Misuse Act 1990, Ireland's Criminal Justice (Offences Relating to Information Systems) Act 2017, the US Computer Fraud and Abuse Act) and breaches most hosting terms.
- Even passive results contain personal data (names in certificates, contact details in records): minimise and secure them.

## Maps and imagery
For geolocation and imagery work, see the [GEOINT & IMINT Dashboard](prp:geoint), which covers satellite imagery, terrain, measuring and sun-and-shadow tools.

### Google Earth Pro {#google-earth-pro}
::: facts
What it does: A 3D globe on your desktop with historical satellite imagery, measuring tools, 3D buildings and terrain, and KML/GPS import and export
Cost: Free
Official source: [google.com/earth/about/versions](https://www.google.com/earth/about/versions/) (**Google Earth Pro on desktop**)
Runs on: Windows, macOS and Linux (64-bit .deb and .rpm packages)
:::
::: os windows
1. On the official versions page, choose **Google Earth Pro on desktop**, accept the terms and download the installer.
2. Run it; Google Earth Pro opens when the install finishes.
:::
::: os macos
1. Download **Google Earth Pro on desktop** from the official versions page.
2. Open the .dmg and run the installer package inside it.
:::
::: os linux
1. Download the 64-bit .deb or .rpm from the official versions page.
2. Install it, for example `sudo apt install ./google-earth-pro-stable_current_amd64.deb`, and start **Google Earth Pro**.
:::

#### First test
Search for a port or airport you know, then choose **View › Historical Imagery** and step back through the dates on the slider. Use **Tools › Ruler** to measure a runway or quay and compare it with a published length.

#### Pitfalls
- Imagery dates are the capture dates of each tile, and neighbouring tiles can be years apart. Note the date shown at the bottom of the window.
- 3D buildings and terrain are models; they can be dated or simplified.

#### Legal and ethical notes
- Imagery belongs to Google and its providers; if you publish screenshots, follow Google's attribution and permission guidelines and credit the providers shown.

### QGIS {#qgis}
::: facts
What it does: A full geographic information system: layers, measurements, projections, georeferencing old maps and analysing OpenStreetMap and satellite data
Cost: Free and open source
Official source: [qgis.org/download](https://qgis.org/download/)
Versions: 3.44 is the long-term release recommended for steady work; 4.0 (March 2026) is the new major version
:::
::: os windows
1. On [qgis.org/download](https://qgis.org/download/), download the **long-term release** standalone installer (.msi).
2. Run it and start **QGIS** from the Start menu.
:::
::: os macos
1. Download the macOS long-term release installer from [qgis.org/download](https://qgis.org/download/) and open the .dmg.
2. Drag QGIS to Applications and start it.
:::
::: os linux
1. Follow the instructions for your distribution on [qgis.org/download](https://qgis.org/download/), which add the official package repository (distribution packages are often out of date).
2. Install `qgis` with your package manager and start it.
:::

#### First test
In the Browser panel, open **XYZ Tiles › OpenStreetMap** to add a basemap. Add a point layer with **Layer › Create Layer › New Temporary Scratch Layer**, mark two places and measure between them with the **Measure Line** tool.

#### Pitfalls
- Coordinates go wrong when layers use different coordinate reference systems: check the CRS of every layer (EPSG:4326 for latitude and longitude).
- Plugins vary in quality and some send data to online services.

#### Legal and ethical notes
- Basemaps and imagery have their own licences: OpenStreetMap data needs "© OpenStreetMap contributors" when you publish.

## Data, notes and references
### OpenRefine {#openrefine}
::: facts
What it does: Cleans messy tables: groups spelling variants of names, splits and joins columns, and reconciles names against databases such as Wikidata
Cost: Free and open source
Official source: [openrefine.org/download](https://openrefine.org/download)
Version checked: 3.10.1
Runs on: Windows, macOS and Linux; it opens in your browser at `http://127.0.0.1:3333` but runs on your computer
:::
::: os windows
1. Download the **Windows kit with embedded Java** from [openrefine.org/download](https://openrefine.org/download).
2. Extract the zip and run `openrefine.exe`. Your browser opens the app.
:::
::: os macos
1. Download the macOS .dmg from [openrefine.org/download](https://openrefine.org/download), open it and drag OpenRefine to Applications.
2. Start it; your browser opens the app.
:::
::: os linux
1. Install Java 11 or newer, for example `sudo apt install default-jre`.
2. Download the Linux kit from [openrefine.org/download](https://openrefine.org/download), extract it and run `./refine`.
:::

#### First test
Create a project from a CSV of company names (for example a sanctions list export or a procurement notice list). On the name column choose **Facet › Text facet**, then **Cluster** to see how many spelling variants it merges, such as "Rosneft", "ROSNEFT OIL CO" and "Rosneft Oil Company".

#### Pitfalls
- Clustering can merge different entities with similar names. Check every cluster; identifiers (registration numbers, LEIs) beat names.
- Reconciliation sends your values to an online service. Do not reconcile sensitive lists.

#### Legal and ethical notes
- Lists of people are personal data even after cleaning; keep them only as long as the case needs.

### Obsidian or Joplin (notes) {#notes}
::: facts
What they do: Keep investigation notes as plain Markdown files you own, with links between notes; the [Case notebook](#tab=notebook) exports straight into either
Obsidian: Free for personal and work use (not open source); optional paid Sync with end-to-end encryption. [obsidian.md/download](https://obsidian.md/download)
Joplin: Free and open source, with end-to-end encrypted sync (its own paid cloud, or Dropbox, OneDrive, Nextcloud or WebDAV). [joplinapp.org/download](https://joplinapp.org/download/)
Runs on: Windows, macOS, Linux, Android and iOS
:::
::: os windows
1. Download the installer from [obsidian.md/download](https://obsidian.md/download) or [joplinapp.org/download](https://joplinapp.org/download/) and run it.
2. Create a vault (Obsidian) or notebook (Joplin) for each case, in a folder on your encrypted disk.
:::
::: os macos
1. Download the .dmg from [obsidian.md/download](https://obsidian.md/download) or [joplinapp.org/download](https://joplinapp.org/download/) and drag the app to Applications.
2. Create one vault or notebook per case.
:::
::: os linux
1. Download the AppImage or .deb from [obsidian.md/download](https://obsidian.md/download), or use the install script on [joplinapp.org/download](https://joplinapp.org/download/).
2. Create one vault or notebook per case.
:::

#### First test
In the [Case notebook](#tab=notebook), choose **Export › Markdown**, and open the file in Obsidian (drop it into the vault folder) or Joplin (**File › Import › Markdown**). The sources table and grades should come through intact.

#### Pitfalls
- Obsidian community plugins run with full access to your files: install few, from authors you trust.
- Turn on end-to-end encryption before syncing a case anywhere, and keep vaults out of personal cloud folders that are not encrypted.

#### Legal and ethical notes
- Notes about people are personal data; date them, source them and delete them when the case closes.

### Zotero (references) {#zotero}
::: facts
What it does: Saves sources with their citation details and a snapshot of the page, and turns them into a reference list in any style
Cost: Free and open source; 300 MB of free sync storage
Official source: [zotero.org/download](https://www.zotero.org/download/) (the app and the Zotero Connector browser extension)
Runs on: Windows, macOS and Linux, with connectors for Chrome, Firefox, Edge and Safari
:::
::: os windows
1. Download and run the Zotero installer from [zotero.org/download](https://www.zotero.org/download/).
2. Install the Zotero Connector for your browser from the same page.
:::
::: os macos
1. Download Zotero from [zotero.org/download](https://www.zotero.org/download/), open the .dmg and drag it to Applications.
2. Install the Zotero Connector for your browser from the same page (for Safari it comes with the app; enable it in Safari's settings).
:::
::: os linux
1. Download the tarball from [zotero.org/download](https://www.zotero.org/download/), extract it and run `./zotero` (the download page links to install notes).
2. Install the Zotero Connector for your browser.
:::

#### First test
Create a collection named after your case. Open a news article and click the Connector button: Zotero saves the citation and a snapshot. Right-click the item and choose **Create Bibliography from Item** to get a formatted reference.

#### Pitfalls
- A snapshot is your copy, not an independent archive: add the Wayback Machine link in the item's **Extra** field.
- Automatic citation details are sometimes wrong (authors, dates): check them against the page.

#### Legal and ethical notes
- Snapshots are copies for your research; sharing a group library with them is redistribution.

## Privacy and compartmentalisation
### Tor Browser {#tor-browser}
::: facts
What it does: Routes your browsing through three volunteer relays so websites do not see your internet address, and makes every user look alike to resist fingerprinting
Cost: Free and open source
Official source: [torproject.org/download](https://www.torproject.org/download/)
Runs on: Windows, macOS, Linux and Android. On iOS the Tor Project points to Onion Browser
:::
::: os windows
1. Download the Windows installer from [torproject.org/download](https://www.torproject.org/download/). (The site explains how to verify its signature.)
2. Run it, then start **Tor Browser** and click **Connect**.
:::
::: os macos
1. Download the .dmg from [torproject.org/download](https://www.torproject.org/download/), open it and drag Tor Browser to Applications.
2. Start it and click **Connect**.
:::
::: os linux
1. Download the Linux archive from [torproject.org/download](https://www.torproject.org/download/) and extract it.
2. Run `./start-tor-browser.desktop` from the extracted folder (or register it as an app with `./start-tor-browser.desktop --register-app`), then click **Connect**.
:::

#### First test
Visit [check.torproject.org](https://check.torproject.org). It should say the browser is configured to use Tor and show an address that is not yours.

#### Pitfalls
- Do not log in to personal accounts, install extra extensions or open downloaded documents while online: each can reveal who you are.
- Many sites block Tor or show CAPTCHAs. Do not try to get round them; use another lawful route or skip the source.
- It is slower, and video sites may not work well.

#### Legal and ethical notes
- Tor is legal in Ireland, the UK, the EU and the US, but blocked or restricted in some countries (for example China, Russia and Iran). Check before you travel.
- Privacy is not permission: terms of service, rate limits and the law still apply.

### Virtual machines: the Trace Labs OSINT VM and Tsurugi Linux {#vms}
A virtual machine (VM) is a complete computer running in a window. Investigating inside one keeps your research separate from your own system: you can roll it back after each case, and a malicious document or link damages the VM, not your laptop. See the [workstation figure in the Kit Guide](#tab=kit&s=separate-browser-profiles-or-virtual-machines).

::: facts
Hypervisors (free): [VirtualBox](https://www.virtualbox.org/wiki/Downloads) (Windows, Linux, Intel and Apple-silicon Macs), VMware Workstation Pro and Fusion Pro (free since November 2024), or UTM on Apple-silicon Macs
Trace Labs OSINT VM: Built by the Trace Labs community; release 2026.10, based on Debian 13 since 2026.05 (earlier builds used Kali), with an ARM64 build for QEMU-based hypervisors. [github.com/tracelabs/tlosint-vm/releases](https://github.com/tracelabs/tlosint-vm/releases)
Tsurugi Linux: An Ubuntu-based distribution for digital forensics and OSINT, with LAB (64-bit, full), Acquire (32-bit, for acquisition) and BENTO (portable toolkit) editions. [tsurugi-linux.org/downloads.php](https://tsurugi-linux.org/downloads.php)
Hardware: 16 GB of RAM and 60 GB of free disk space make VMs comfortable
:::
::: os windows
1. Install VirtualBox from [virtualbox.org](https://www.virtualbox.org/wiki/Downloads) (or VMware Workstation Pro).
2. Download the Trace Labs OSINT VM appliance (.ova) and its checksum file from the [releases page](https://github.com/tracelabs/tlosint-vm/releases), and compare the hash in PowerShell: `Get-FileHash .\file.ova -Algorithm SHA256`.
3. In VirtualBox choose **File › Import Appliance**, select the .ova and finish. Or create a new VM from the Tsurugi ISO.
4. Before first use, take a snapshot named "clean", then update the system and change the default password given in the release notes.
:::
::: os macos
1. Intel Mac: install VirtualBox or VMware Fusion Pro. Apple silicon (M1 and later): use the ARM64 builds with UTM or VMware Fusion; x86-64 images such as Tsurugi's will not run at useful speed.
2. Download the image and checksum from the official release page and verify it: `shasum -a 256 file.ova`.
3. Import or create the VM, take a "clean" snapshot, update and change the default password.
:::
::: os linux
1. Install VirtualBox, or use KVM with virt-manager (`sudo apt install virt-manager`), which suits the ARM64 and QEMU builds.
2. Download the image and checksum from the official release page and verify it: `sha256sum file.ova`.
3. Import or create the VM, take a "clean" snapshot, update and change the default password.
:::

#### First test
Boot the VM, open its browser and confirm you can reach the [Software Cookbook](#tab=cookbook) here. Then restore the "clean" snapshot and check that anything you saved has gone: that reset is what you will do between cases.

#### Pitfalls
- Turn off shared folders, shared clipboard and drag-and-drop unless you need them: they bridge the VM and your own system.
- A VM still uses your home internet address unless you add a VPN or Tor.
- Snapshots are not backups. Export evidence out of the VM, hash it and store it on encrypted media.
- These images bundle many tools, including people-search tools. Their presence is not a licence to use them; this dashboard's scope still applies.

#### Legal and ethical notes
- Compartmentalisation protects you and your sources; it does not change what is lawful to collect.

## Workflows
Each workflow chains the tools above with this dashboard's tabs. Log every step in the [Case notebook](#tab=notebook) as you go.

### Verify a viral video {#verify-video}
::: figure flow
label: Verifying a viral video in eight steps
caption: A workflow for checking a video that claims to show a recent event. Each step names the tools that do it; the log in the Case notebook ties them together.
- Find the earliest copy | Search tab, InVID keyframes, reverse image search
- Preserve it | Wayback Machine, yt-dlp, SHA-256 hash
- Read the metadata | InVID, ExifTool, Media check tab
- Geolocate | Google Earth Pro, QGIS, GEOINT dashboard
- Chronolocate | shadows, weather, sun position
- Corroborate | other angles, Events tab, official sources
- [accent] Grade and log | Case notebook: claim, source, archive, grade
- Write it up | bottom line first, sources table
:::
1. **Find the earliest copy.** In InVID-WeVerify, extract keyframes and reverse-search several of them on Google Lens, Bing, Yandex and TinEye; sort TinEye by oldest. Search the claimed place and event on the [Search tab](#tab=search), in the local language. The earliest upload, not the most viral, is your primary source.
2. **Preserve it before it disappears.** Save the post with the Wayback Machine extension, download the video with yt-dlp (with `--write-info-json`), and hash both (Kit Guide). Record the capture in the [Archives tab](#tab=archives).
3. **Read the metadata.** Platforms strip most of it, so expect little; ExifTool and the [Media check](#tab=media) tab read what survives. The uploader's account history (age, past posts) matters more.
4. **Geolocate.** List clues (signs, road markings, buildings, terrain) and match them in Google Earth Pro, Street View or Mapillary; use QGIS or Overpass Turbo for combinations of features. The [GEOINT & IMINT Dashboard](prp:geoint) has the imagery and measuring tools. Aim for three or more independent matching features.
5. **Chronolocate.** Shadows give the sun's direction and height; compare with a sun calculator for the claimed date. Check weather records and satellite images for that day's cloud.
6. **Corroborate.** Look for other angles, local reporting (the [Events tab](#tab=events) shows when coverage began), and official statements.
7. **Grade and log.** In the [Case notebook](#tab=notebook), record the claim, the earliest source, the archive link, the date accessed and an Admiralty grade, such as F2 for an unknown account whose video you have geolocated and dated.
8. **Write it up** with the bottom line first, the evidence, what you could not confirm, and the sources table from the notebook. Blur bystanders' faces.

### Trace a company's ownership {#trace-ownership}
::: figure flow
label: Tracing a company's ownership in seven steps
caption: From a company name to its corporate parents and sanctions exposure. Registries give the legal facts; leaks, courts and graphs add context that must be checked.
- Pin down the entity | exact name, number, jurisdiction
- LEI and parents | Organisations tab (GLEIF)
- Read the filings | Companies House, CRO, OpenCorporates
- Screen sanctions | OpenSanctions, OFAC, EU, UK, UN
- Search leaks and courts | OCCRP Aleph, court records
- Clean and connect | OpenRefine, Maltego CE (with care)
- [accent] Log and report | Case notebook, sources table
:::
1. **Pin down the exact legal entity.** Search the name on the [Organisations & sanctions](#tab=orgs) tab and in the national registry (UK Companies House, Ireland's CRO, OpenCorporates for others). Record the registration number and jurisdiction: names are shared, numbers are not.
2. **Find its LEI and corporate parents.** The GLEIF lookup on the Organisations tab shows the direct and ultimate accounting parents, or the reason none is reported (for example, control by individuals whom GLEIF does not name).
3. **Read the filings.** Officers, persons with significant control (UK), annual returns and accounts. Note shell-company indicators: a formation agent's address shared by hundreds of companies, nominee directors, no staff.
4. **Screen sanctions lists.** OpenSanctions combines many lists; confirm any hit on the official list (OFAC, the EU, the UK Sanctions List, the UN). A name match is not a match until identifiers agree. Remember OFAC's 50 percent rule: a company owned half or more by sanctioned parties is blocked even if unlisted.
5. **Search leaks and court records** in OCCRP Aleph and the court databases on the [Search tab](#tab=search). Treat leaked material as a lead to verify, never as proof on its own.
6. **Clean and connect.** Use OpenRefine to merge spelling variants in lists of companies; draw the structure in Maltego CE only with sourced, dated links.
7. **Log and report** each fact with its registry link and archive copy. Directors and owners are people: keep the focus on the organisation and never publish home addresses.

### Build a timeline of an event {#event-timeline}
::: figure flow
label: Building a timeline of an event in six steps
caption: Building a timeline from coverage to sources to a checked sequence. The Case notebook's timeline view orders items by the date of the event, not the date you found them.
- Set the question and window | what, where, from when to when
- Watch the coverage | Events tab (GDELT), Search tab
- Collect primary sources | statements, filings, videos, posts
- Preserve and cite | Archives tab, Zotero, hashes
- [accent] Log with event dates | Case notebook timeline view
- Check and write up | time zones, conflicts, Obsidian or Joplin
:::
1. **Set the question and the window**, for example "What happened at the port between 10 and 14 May, and in what order?"
2. **Watch the coverage.** On the [Events tab](#tab=events), run a GDELT query for the place and event over the window; the timeline shows when reporting began and peaked, and the article list gives you sources to open. Search local-language outlets on the [Search tab](#tab=search).
3. **Collect primary sources**: official statements, notices to aviators and mariners, company filings, original videos and posts. Secondary reports point you to them.
4. **Preserve and cite.** Archive each source ([Archives tab](#tab=archives)), save it to Zotero for the reference list, and hash downloaded files.
5. **Log each item with its event date** in the [Case notebook](#tab=notebook), and switch to the **Timeline** view. Gaps and clusters show where to dig.
6. **Check and write up.** Convert all times to UTC; flag items whose times conflict and explain which you trust and why. Export the notebook to Obsidian or Joplin for drafting, and paste the sources table into the report.
