title: Kit Guide
intro: The physical side of open-source work: a workstation that keeps research apart from your life, storage and archiving that will stand up to scrutiny, what network privacy tools do and don't do, capture tools, screens and phones, and the patterns that connect software, hardware and this dashboard.
updated: 28 October 2026

## What you need, and what you don't
Good open-source research needs a reasonably recent computer, free software and disciplined habits. Spend on storage and backups before gadgets.

| Item | Enough to start | Comfortable | Why it matters |
|---|---|---|---|
| Computer | Any 64-bit laptop from the last six years, 8 GB of memory | 16–32 GB of memory, a solid-state disk of 1 TB | Virtual machines and video need memory and space |
| Screens | The laptop's own | A second monitor, 24–27 inches | Compare sources and imagery side by side |
| Storage | An external drive, encrypted | Two encrypted drives plus encrypted off-site backup | Evidence must survive a failure or theft |
| Accounts | A password manager and two-factor authentication | A hardware security key | Your accounts protect your sources |
| Network | Your home connection | A reputable paid VPN, Tor Browser when needed | Separates what sites see from who you are |
| Phone | Your own, with care | A separate phone for research accounts | Some sources are app-only |

! Rule of thumb: Separate, encrypt, back up, log. Most failures in amateur investigations are not technical: a deleted post nobody saved, a file nobody hashed, or research done while logged in to a personal account.

## The investigator's workstation
### Separate browser profiles or virtual machines
Keep research apart from your personal life. Each step up the ladder adds protection and effort:
1. **A separate browser profile** for research (Chrome, Edge and Firefox all support profiles): its own history, cookies and extensions, and no personal logins.
2. **A separate browser** used only for research, so a slip of habit is less likely.
3. **A virtual machine** for research, reset to a clean snapshot between cases (see the [Cookbook's VM section](#tab=cookbook&s=vms)).
4. **A dedicated laptop** for high-risk work.

::: figure stack
label: The investigator's workstation in layers
caption: A compartmentalised workstation, from the web you investigate down to the hardware. Each layer limits what a mistake or a malicious file can reach.
- [dashed] The public web | the sites, archives and APIs you investigate
- Network privacy | a VPN or Tor Browser hides your address from the sites; neither makes you anonymous
- Research browser profile | no personal logins; Wayback and InVID extensions; a content blocker
- Research virtual machine | a clean snapshot per case; shared folders and clipboard off
- [accent] Host system | updated automatically; password manager; two-factor authentication
- Hardware | full-disk encryption; encrypted backups; a screen lock
:::

A sensible research profile holds few extensions: the [Wayback Machine extension](#tab=cookbook&s=wayback-extension), the [InVID-WeVerify plugin](#tab=cookbook&s=invid), and a content blocker such as [uBlock Origin](https://ublockorigin.com) (uBlock Origin Lite in Chrome), which also blocks many trackers. Every extension can read the pages you visit.

### Password manager and two-factor authentication
- Use a password manager so every account has a long, unique password: [Bitwarden](https://bitwarden.com) and [1Password](https://1password.com) sync across devices; [KeePassXC](https://keepassxc.org) keeps an encrypted file on your own computer.
- Turn on two-factor authentication everywhere, preferably with an authenticator app, a passkey or a hardware security key rather than text messages.
- Register research accounts honestly within each platform's rules, and never reuse a personal email or phone number on them if you want the separation to hold.

### Full-disk encryption
If your laptop is lost or seized, encryption keeps the case files, sources and logins on it unreadable.

::: os windows
1. Windows 11 Pro: **Settings › Privacy & security › Device encryption** or **BitLocker drive encryption** › turn on. Windows 11 Home has **Device encryption** on most modern hardware.
2. Save the recovery key somewhere other than the laptop (your password manager, or printed and stored safely).
3. For external drives: right-click the drive in File Explorer › **Turn on BitLocker** (BitLocker To Go).
:::
::: os macos
1. **System Settings › Privacy & Security › FileVault** › **Turn On**.
2. Keep the recovery key somewhere other than the Mac.
3. For external drives: **Disk Utility** › erase as **APFS (Encrypted)**, or right-click the drive in Finder › **Encrypt**.
:::
::: os linux
1. Choose **encrypt the disk (LUKS)** when installing; most installers offer it. Adding it afterwards means reinstalling or careful re-partitioning.
2. For external drives, format them with LUKS (GNOME **Disks** offers "Password protect volume"), or use [VeraCrypt](https://veracrypt.io) for drives shared with Windows and macOS.
:::

### Updates and untrusted files
- Leave automatic updates on for the system, the browser and every tool in the [Cookbook](#tab=cookbook).
- Treat documents from investigation subjects as hostile. Open them inside the research VM, or convert them first with [Dangerzone](https://dangerzone.rocks), which turns documents into safe PDFs in an isolated container.
- Do not plug in USB drives you did not buy yourself.

### Backups
Use the **3-2-1 rule**: three copies of everything, on two kinds of media, with one copy off-site. Encrypt every copy, and test a restore every few months.

::: figure lanes arrows
label: Three copies of case data: working copy, local backup, off-site backup
caption: The 3-2-1 backup pattern for case files. Encryption travels with every copy, and a restore test is the only proof a backup works.
## Working copy | on the encrypted laptop
- Case folders | captures, working copies, notes
- Case notebook export | JSON, weekly or after big changes
## Local backup | encrypted external drive
- Automatic backup | File History, Time Machine or Déjà Dup
- Kept apart | unplugged when not in use
## Off-site backup | encrypted before it leaves
- Cloud with client-side encryption | or a drive kept elsewhere
- [accent] Restore test | every few months
:::

## Archiving and storage
### What to capture
For each important source, keep three things:
1. **An independent archive.** Save the page to the Wayback Machine from the [Archives tab](#tab=archives) or the extension. archive.today also exists, but English Wikipedia deprecated it in February 2026 after its CAPTCHA page was found running a denial-of-service script and some snapshots were found altered; treat it as a secondary copy at most.
2. **Your own copy**: a complete page with [SingleFile](https://github.com/gildas-lormeau/SingleFile) or a web archive (WACZ) with [ArchiveWeb.page](https://archiveweb.page), plus a full-page screenshot that shows the address and the time, and the original media file where the platform allows it (or [yt-dlp](#tab=cookbook&s=yt-dlp)).
3. **A log entry**: the address, the time in UTC, the archive link, the file names and their hashes, in the [Case notebook](#tab=notebook).

### Hashing captured files
A cryptographic hash such as SHA-256 is a fingerprint of a file: change a single bit and the hash changes completely. Recording it when you collect a file lets you, and anyone you hand it to, show later that it has not changed.

::: os windows
In PowerShell, one file, then a whole folder into a manifest:
```sh
Get-FileHash .\video.mp4 -Algorithm SHA256
Get-ChildItem -File | Get-FileHash -Algorithm SHA256 | Export-Csv SHA256SUMS.csv -NoTypeInformation
```
:::
::: os macos
In Terminal:
```sh
shasum -a 256 video.mp4
shasum -a 256 * > SHA256SUMS.txt
```
:::
::: os linux
In a terminal:
```sh
sha256sum video.mp4
sha256sum * > SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt
```
The last line checks every file against the manifest later.
:::

The [Media check](#tab=media) and [Archives](#tab=archives) tabs also hash any file in your browser (nothing is uploaded) and add the hash to the notebook.

### Chain of custody
If your work could become evidence, record how each item was handled from collection to report. Courts and reviewers ask who collected it, when, from where, how, and what happened to it since.

| Record | Example |
|---|---|
| Who collected it | Your name or initials |
| When (UTC) | 2026-10-27 15:42 UTC |
| From where | The original address, and the archive link |
| How | The tool and version (yt-dlp 2026.10.26, SingleFile 1.32) |
| What | File name, size and SHA-256 |
| Where it is kept | The encrypted drive and folder |
| Every later step | Copied, converted, shared with whom, when |

- **Keep originals read-only** and analyse copies. A converted or edited file gets its own hash and a note of what changed.
- **Name files consistently**, for example `20261027T1542Z_youtube_VIDEOID_original.mp4`.
- **Use one folder per case**: `00-admin`, `01-captures` (originals, read-only), `02-working`, `03-analysis`, `04-report`.
- The [Berkeley Protocol](#tab=law&s=the-berkeley-protocol) sets out preservation standards for material that may reach a court. If that is possible, talk to the lawyers or investigators who would use it early.

## Network privacy
### What a VPN does and doesn't do
A virtual private network sends your traffic through an encrypted tunnel to the VPN company's server, which then talks to websites for you.

| A VPN does | A VPN does not |
|---|---|
| Hide your internet address from the sites you visit | Make you anonymous: the VPN company can see where you go |
| Hide which sites you visit from your internet provider and from the café's Wi-Fi | Stop sites recognising you when you log in, or through cookies and browser fingerprints |
| Let you see a site as it appears from another country (where that is lawful) | Protect you from malware, phishing or bad habits |
| Encrypt traffic on untrusted networks | Make an action legal that is otherwise unlawful, or override a site's terms |

- **Choose carefully.** Prefer a paid provider with an independently audited no-logs policy. Avoid free VPN apps from unknown companies: the product is often your data.
- **Check work rules.** An employer's or university's VPN is for their network and may log what you do.
- **Tor Browser** goes further, through three relays so no single one knows both who you are and where you go; see the [Cookbook](#tab=cookbook&s=tor-browser).

### Being seen
- Every site you visit logs your address unless a VPN or Tor hides it. Some platforms show account owners who viewed their profile; check your research account's privacy settings.
- Links and documents can carry trackers that report when and where they were opened. Open unknown links in the research profile, and documents in the VM or Dangerzone.
- This dashboard's own lookups go straight from your browser to the service named on each tab (the Wayback Machine, IANA and the domain registries' RDAP servers, Google or Cloudflare DNS, crt.sh, GLEIF, GDELT, OpenSanctions). Those services see your address and what you looked up; Vitruvian Manager sees nothing.

## Screen capture and recording
Capture so that a reader can see what you saw, where and when: include the address bar and the system clock where you can, and note the time in UTC.

| Task | Windows | macOS | Linux |
|---|---|---|---|
| Screenshot of an area | [[Win+Shift+S]] (Snipping Tool) | [[Cmd+Shift+4]] | [[PrtSc]] (GNOME) or Spectacle (KDE) |
| Screen recording | Snipping Tool's record mode, or [OBS Studio](https://obsproject.com) | [[Cmd+Shift+5]], or OBS Studio | GNOME's screenshot tool (record), or OBS Studio |
| Full-page screenshot | Firefox: right-click › **Take Screenshot** › **Save full page** | Same in Firefox | Same in Firefox |
| Full-page, in Chrome | Developer tools ([[F12]]), then [[Ctrl+Shift+P]] › "Capture full size screenshot" | Same with [[Cmd+Option+I]] and [[Cmd+Shift+P]] | Same as Windows |
| Capture and annotate | [ShareX](https://getsharex.com) (free) | Built-in markup in Preview | Flameshot |

- **Screenshots are not originals.** Keep the original file or archive as well, and hash both.
- **Record live streams** with OBS Studio, noting the start and end in UTC; save the platform's own recording too if it offers one.
- **Mind what else is on screen**: notifications, personal tabs and your own account name end up in evidence.

## Multiple monitors
A second screen is the single most useful hardware upgrade for verification: you can hold a video still on one screen while you match it to satellite imagery on another, with the notebook open throughout.

::: figure lanes screens
label: A three-screen layout: sources, analysis, notes
caption: A three-screen layout. Sources stay on one screen, analysis on another, and notes and messages on the laptop, so the research profile never mixes with personal windows.
## Screen 1: sources | research browser profile
- The page or video you are checking
- Archives tab | capture before you analyse
## Screen 2: analysis | maps and comparison
- GEOINT & IMINT dashboard | satellite and street-level imagery
- [accent] Case notebook | claims, grades, timeline
## Laptop: notes | a separate profile
- Notes in Obsidian or Joplin
- Team chat | no research tabs here
:::

- Two 24–27 inch monitors at 1440p or 1080p are plenty. Rotate one to portrait for long documents and feeds.
- Arrange windows the same way every time; habits prevent leaks such as pasting a source link into the wrong chat.

## Mobile considerations
- **App-only sources.** Some material lives mainly in apps (TikTok, Telegram channels, WhatsApp). Use a separate phone for research accounts, set up honestly within the apps' rules, and keep your personal apps and contacts off it. Observe; do not join closed groups under false pretences.
- **Capture originals.** Screen-record on the phone (iOS Control Centre; Android Quick Settings), then move files to your workstation by cable or AirDrop with **Options › All Photos Data** on, so the original and its metadata survive. Messaging apps strip metadata and recompress.
- **Hash on the workstation**, as soon as the file arrives, and log it.
- **Your own photos leak your location.** Turn off location for the camera, or remove it when you share (iOS share sheet: **Options › Location** off; Google Photos: **Remove location**). For verification-friendly JPEGs on an iPhone, set **Settings › Camera › Formats › Most Compatible**.
- **Verification is easier on a desktop.** InVID, ExifTool and the imagery tools need a big screen; use the phone to capture, the workstation to analyse.

::: figure flow
label: From a phone capture to the case notebook
caption: Moving evidence off a phone without losing the original. Hash once the file is on the workstation, before anything else touches it.
- Capture on the phone | screen recording or original photo
- Transfer the original | cable, or AirDrop with All Photos Data
- [accent] Hash on arrival | SHA-256, read-only copy kept
- Log it | Case notebook item with the hash
:::

## Integration patterns
### Collect, capture, hash, log, analyse, report
The core pattern of an investigation, and how the software and hardware above fit it.

::: figure flow
label: Collect, capture and archive, hash, notebook, analysis, report
caption: The evidence chain. Every source passes through capture and hashing before analysis, and the notebook links each claim to its archived, hashed source, so the report can be checked step by step.
- Collect | Search, Events and Domains tabs; the original post or file
- Capture and archive | Wayback Machine, SingleFile, yt-dlp, screenshots
- Hash | SHA-256 per file; a manifest per folder
- [accent] Notebook | claim, source, archive link, date, grade, hash
- Analysis | corroboration, geolocation, competing hypotheses
- Report | bottom line first; the sources table
:::

1. **Collect** with a question in mind, from the [Search](#tab=search), [Events](#tab=events), [Domains](#tab=domains) and [Organisations](#tab=orgs) tabs or the platform itself.
2. **Capture and archive** at once: an independent archive and your own copy.
3. **Hash** each file on arrival and keep the original read-only.
4. **Log** it in the [Case notebook](#tab=notebook): the claim, the source address, the archive link, the date accessed, the Admiralty grade and the hash.
5. **Analyse** copies, never originals; record your reasoning and the alternatives you rejected.
6. **Report** with the bottom line first and the notebook's sources table, so a reader can retrace every step.

### API, notebook, export
Several tabs read public APIs straight from your browser. Their results go into the notebook with one click, and the notebook exports to the tools you write with.

::: figure flow
label: Public API, then the dashboard, then the notebook, then an export
caption: How data moves from public APIs to your write-up. Nothing passes through Vitruvian Manager's servers: the browser calls each API directly, the notebook lives in this browser, and exports are files you keep.
- Public APIs | Wayback, RDAP, DNS, crt.sh, GLEIF, GDELT
- This dashboard | in your browser; any API key stays here
- [accent] Case notebook | stored in this browser only
- Export | JSON for tools, Markdown for people
- Your write-up | Obsidian, Joplin, Zotero, OpenRefine
:::

- **JSON** keeps every field and loads into OpenRefine, Python or another copy of this notebook (use it as your backup).
- **Markdown** reads well in Obsidian, Joplin or any editor, includes the sources table and imports back into the notebook.
- **Keys** you add (an OpenSanctions key, for example) stay in this browser and go only to their own service.
- Clearing your browser's site data deletes the notebook. Export after every working session.

## Reference
### Dates, times and places
| Topic | Use | Avoid |
|---|---|---|
| Dates | 2026-10-27 or 27 October 2026 | 10/27/26 or 27/10/26 (ambiguous) |
| Times | 15:42 UTC, with the source's local zone noted | Local times without a zone |
| Coordinates | Decimal degrees: 53.34845, -6.25308 | Unlabelled degrees, minutes and seconds |
| Distances | Metres and kilometres | Pixels on a screenshot |

### Converting coordinates
Degrees, minutes and seconds become decimal degrees as degrees + minutes ÷ 60 + seconds ÷ 3,600, negative for south and west. 53° 20′ 54.4″ N, 6° 15′ 11.1″ W is 53.34844, -6.25308.

### Further reading
- [OSINT Training](course:) in Vitruvian Manager: the course behind these tools, especially [Archives and preservation](course:archives-and-preservation) and [Doing no harm and staying safe](course:doing-no-harm-and-staying-safe).
- Bellingcat's [Online Investigations Toolkit](https://bellingcat.gitbook.io/toolkit).
- The [Law & ethics](#tab=law) tab for what is lawful and what is fair.
