title: Open-source intelligence (OSINT)
intro: A practical, university-style course in open-source intelligence (OSINT) for the individual analyst: the intelligence cycle, source grading, search and archives, image and video verification, records, movement tracking, conflict data, structured analysis, writing up, and the law, ethics and safety that bound the work. The last unit shows how to use PRP itself as an intelligence tool and ends with two capstone exercises.

# Unit 1 · Foundations

## What OSINT is, and what it is not
Open-source intelligence (OSINT) is intelligence produced from **publicly available information**: material that any member of the public can lawfully see, request, buy or observe. US law (2006) defines it as intelligence "produced from publicly available information" and disseminated "for the purpose of addressing a specific intelligence requirement". Two ideas follow.
- **Information is not intelligence.** A video, a company filing or a satellite image is raw material. It becomes intelligence only when it has been evaluated, combined with other material and analysed to answer a question that someone needs answered.
- **Open means lawfully available, not merely findable.** News, statistics, company and court records, published imagery, public social-media posts, papers and open datasets are open. Hacked databases, private data dumped online, other people's accounts, anything behind a login you are not entitled to and anything obtained by deceiving someone are not, however easy they are to reach.

Because the sources are public, others can retrace your steps: that is OSINT's great strength, and why method and documentation run through this whole course. It also has limits. Much is never published, some of what is published is deliberate deception, coverage is richest where internet access and press freedom are strongest, and access changes when platforms change their rules. Meta closed CrowdTangle, the free tool researchers and journalists used to monitor Facebook and Instagram, in August 2024; Twitter's free TweetDeck became X Pro, a paid product, in 2023, and since 2026 it has been available only on X's top Premium+ tier.

! Scope: This course is about investigating events, organisations, places and claims. It does not teach, and you should not attempt, locating, identifying or profiling private individuals; Unit 10 explains why.

? What turns a piece of public information into intelligence?
* Being found before anyone else finds it
+ Being evaluated and analysed to answer a specific question
* Being classified by a government
= Information becomes intelligence through evaluation and analysis against a requirement. Secrecy has nothing to do with it.

? Which of these is NOT open-source material?
* A judgment published by a national court
* A public post on a social-media platform
+ A database of customer records stolen in a hack and posted online
= Open sources are lawfully available to the public. Stolen data being easy to download does not make it open, and using it raises serious legal and ethical problems.

## The intelligence cycle
Intelligence work is usually described as a cycle. The stages overlap and loop back, but naming them shows you what you have skipped:
1. **Direction**: define the question (the requirement), who needs the answer, by when and why, and break it into sub-questions and observable indicators.
2. **Collection**: plan which sources could answer it, and log every search.
3. **Processing**: make the material usable by translating, archiving, de-duplicating, geolocating and grading it.
4. **Analysis**: turn evidence into judgements, test the alternatives and state likelihood and confidence (Unit 8).
5. **Dissemination**: get the answer to the person who needs it, in a usable form and in time.
6. **Feedback**: learn whether it was useful and right, check old forecasts against what happened and refine the question.

NATO and UK doctrine name four core functions (direction, collection, processing and dissemination) and treat analysis as part of processing. The labels differ but the logic is the same: **the question comes first**. Collecting without one produces a pile, not intelligence.

! Worked example: "Is Country A preparing a military operation on its border within 30 days?" breaks into indicators you can observe: unusual troop and rail movements, field hospitals and fuel dumps on satellite imagery, airspace closures in NOTAMs (official notices to aviators), cancelled military leave and a shift in official rhetoric. Each indicator tells you where to collect.

? In the intelligence cycle, what should come before collection?
+ Direction: a clearly stated question and what would answer it
* Dissemination of a first draft
* Processing of the raw data
= Without a defined requirement you cannot know what to collect, or when you have enough.

? You check a forecast you wrote three months ago against what actually happened. Which stage is this?
* Collection
* Processing
+ Feedback
= Feedback closes the loop: it tells you how well your methods and judgements work and sharpens the next question.

# Unit 2 · Sources and evaluation

## Grading sources and tracing provenance
Intelligence services grade every item on two separate scales, known as the **Admiralty** or **NATO system** and set out in NATO intelligence doctrine: a letter for the **source** and a number for the **information**.

| Letter | Source reliability | Number | Information credibility |
|---|---|---|---|
| A | Completely reliable | 1 | Confirmed by other sources |
| B | Usually reliable | 2 | Probably true |
| C | Fairly reliable | 3 | Possibly true |
| D | Not usually reliable | 4 | Doubtful |
| E | Unreliable | 5 | Improbable |
| F | Reliability cannot be judged | 6 | Truth cannot be judged |

- **Grade the two separately.** A usually reliable news agency can relay a claim it could not check (**B3**); an anonymous new account can post something that satellite imagery confirms (**F1**). F and 6 are honest grades, and reliability is earned claim by claim, not because you like what a source says.
- **The source is the originator, not the platform.** A news site quoting an anonymous official is a channel; the official is the source.

Establish **provenance** (who created the material, when, where, how, and how it reached you) and work back towards the **primary source**: the video as first uploaded, the judgment, the filing, the image, the official statement. News reports are **secondary** sources. Compilations such as encyclopaedias, the ACLED and UCDP datasets and PRP's own submodules are **tertiary**: excellent for orientation and base rates, but not the final word on a specific claim.

**Corroboration** means confirmation by an **independent** source, one with separate access to the facts. Ten outlets running the same wire story are one source; so are a thousand accounts sharing one clip. Beware **circular reporting**, where a claim travels from an unsourced post to a news story to an encyclopaedia and back again as "established".

! Rule of thumb: Count origins, not repetitions, and write a grade next to every item in your notes, for example "news agency citing a port authority statement: B2".

? A brand-new account with no history posts a video that you then confirm with satellite imagery. What is the best grade?
* A1
* E5
+ F1
= You cannot judge the source's reliability (F), but the information is confirmed by an independent source (1). Grading the two separately captures exactly that.

? Which pair offers genuine corroboration of an explosion at a factory?
* Two news sites that both credit the same news agency report
+ A local resident's video and a satellite fire detection at the same place and time
* A viral post and a thousand reposts of it
= Only the video and the satellite detection come from independent collection; the others are one source repeated.

# Unit 3 · Search craft

## Search operators, languages and translation
Search engines index different parts of the web and localise their results, so run important searches on several: Google and Bing everywhere, Yandex for the Russian-language web, Baidu for China and Naver for Korea. Operators make each search precise:

| Operator | Example | Finds |
|---|---|---|
| "…" | "fuel depot" | the exact phrase |
| minus sign | jaguar -car | pages without the word car |
| OR | protest OR demonstration | either word |
| site: | site:gov.uk | pages on one domain or country domain |
| filetype: | filetype:pdf | one type of document (pdf, xlsx, docx) |
| intitle: | intitle:tender | the word in the page title |
| before: and after: | after:2026-01-01 | pages dated after a day (Google) |

**Search in the language of the place**, where local people report first and in most detail:
- Translate your keywords, not just the results, and add local names, scripts and transliterations: Kharkiv, Kharkov and Харків; Hodeidah, Hudaydah and Al-Hudayda.
- Use machine translation (Google Translate, DeepL, Bing or Yandex) for the gist. Check key passages with a second engine and, before you publish, with a fluent speaker: machines stumble on negation, idiom, sarcasm, names and numbers. Watch dates too: 03/04 is 3 April in Europe and 4 March in the US, and Iran and Thailand use their own calendars.
- Search where local people post: Telegram channels matter in Russia, Ukraine and much of the Middle East, VK in Russia and Weibo in China.

! Tools change: Tools are named here as they stood in October 2026. Bellingcat's free [Online Investigations Toolkit](https://bellingcat.gitbook.io/toolkit) keeps an up-to-date list of what exists and what each tool does.

? You need reports of a flood in a small town in Poland. What is the best first step?
* Search in English on one engine
+ Search the town's Polish name with Polish keywords on more than one engine
* Wait for international news agencies to cover it
= Local-language searches surface local reporting first and in most detail, and different engines index different sites.

? What does the search site:gov.ie filetype:pdf "procurement" return?
+ PDF documents on Irish government domains containing the word procurement
* Every Irish website that mentions procurement
* Only the home page of gov.ie
= site: limits results to a domain, filetype: to a type of document and quotation marks to an exact word or phrase.

## Archives and preservation
Posts are deleted, pages edited and whole sites taken down. **Preserve first, analyse second.**
- The **[Wayback Machine](https://web.archive.org)** of the Internet Archive holds past captures of much of the public web, and "Save Page Now" captures a page for you. Google dropped its own cached pages in 2024 and now links to the Wayback Machine from its "About this result" panel. It misses pages built heavily from scripts or behind logins, site owners can have captures removed, and a cyber-attack took it offline for several days in October 2024.
- **archive.today** (also at archive.ph and archive.is) stores a static copy and a screenshot, and often captures what the Wayback Machine cannot. It is run anonymously, so its long-term future is uncertain. Capture important pages in both.
- **Keep your own copy**: download the original file where the platform allows it, take a full-page screenshot showing the address and time, record a **SHA-256 hash** of each file (a fingerprint that changes if a single bit changes), keep originals read-only and work only on copies.
- **Log every capture**: address, time in UTC, archive links, file name and hash.

! Caution: An archived copy proves what a page said at a moment, not that it was true. Archives are not a way round paywalls or logins: using them like that breaches publishers' terms.

? Why compute a hash for every file you preserve?
* It compresses the file to save space
+ It lets you and others show later that the file has not changed since you collected it
* It removes the file's metadata
= A cryptographic hash such as SHA-256 is a fingerprint: any alteration changes it, which supports the integrity of your evidence.

? A page you archived last week has since been edited. What does your archived copy show?
+ What the page said when you captured it
* That the original claim was true
* Who edited the page
= Archives preserve content at a moment in time. Whether that content was accurate is a separate question.

# Unit 4 · Verifying images and video

## Reverse image search, metadata and synthetic media
Most false visuals are not sophisticated fakes but **real images with the wrong caption**: old footage, another country, another war. So ask first: where did this first appear, and is it older than claimed?
1. Search the image, or stills from several moments of a video, on several engines, because their indexes differ: **Google Lens**, **Bing Visual Search**, **Yandex Images** (often the strongest for places in Russia and Eastern Europe) and **[TinEye](https://tineye.com)** (sort results by oldest). Crop to distinctive details and try a mirrored copy, since reposts are often flipped.
2. The free **[InVID-WeVerify plugin](https://weverify.eu/verification-plugin/)** for Chrome and Firefox extracts keyframes from videos, reads metadata, magnifies details and sends images to several search engines at once.

**Metadata** (EXIF data: camera, time, sometimes GPS position) helps less than people think. Most platforms strip it on upload, anyone can edit it, and camera clocks are often wrong or set to another time zone: its absence proves nothing and its presence proves little. Signed **Content Credentials** (the C2PA standard), which some cameras, phones and editing tools now attach, are useful evidence when present, but most images carry none.

**AI-generated and edited media** are improving fast, and automated detectors give false alarms in both directions. Rely on provenance, context and corroboration: who else filmed the scene, does it match street-level and satellite imagery, and are the shadows, weather and signs consistent? Beware the "liar's dividend" too: genuine footage dismissed as fake.

! Privacy: Use reverse image search to trace images of places and events, never to identify private people from their faces.

? A dramatic photo is shared as showing yesterday's storm. Reverse image search finds the same photo on a news site four years ago. What does this establish?
* That the photo is AI-generated
+ That the photo is old and miscaptioned, whatever it shows
* That yesterday's storm did not happen
= An earlier appearance disproves the claimed date. It says nothing about whether yesterday's storm happened.

? A photo found online has no EXIF metadata. What can you conclude?
* It is fake
* It was taken with a phone
+ Very little, because most platforms strip metadata on upload
= Missing metadata is normal for images shared online and is not evidence of manipulation.

## Geolocation
Geolocation means proving where an image or video was taken, in a way that others can check.
1. **List the clues**: script and language on signs, phone numbers and web addresses, road markings and the side of the road, number-plate formats (for the country, not the owner), architecture, vegetation, terrain, power lines, shop chains and places of worship.
2. **Narrow the area** using those clues and what the claim itself says.
3. **Compare from above and at street level**: Google Earth for layouts and rooftops (Google Earth Pro's historical imagery shows older captures, which matters if the scene has changed); Google Street View, **[Mapillary](https://www.mapillary.com)** (crowd-sourced street photos), Apple Look Around and Yandex Panoramas for facades and signs.
4. **Query the map**: **[Overpass Turbo](https://overpass-turbo.eu)** finds combinations of features in OpenStreetMap, such as a church within 200 m of a railway bridge, and Google Earth's 3D view lets you match ridgelines and skylines.
5. **Confirm** with at least three independent matching features, and record the coordinates with a side-by-side annotated comparison.

! Standard: A geolocation that others cannot reproduce is only an assertion. Publish the coordinates and the matching features.

? How many independent matching features should a solid geolocation show?
* One distinctive building is enough
+ Several, conventionally at least three, shown side by side
* None, if the source is reliable
= Several independent matches rule out coincidental resemblance and let others check the result.

? Which tool searches OpenStreetMap for places with a particular combination of features?
* TinEye
+ Overpass Turbo
* SunCalc
= Overpass Turbo runs queries on OpenStreetMap data, for example every petrol station within 100 m of a roundabout.

## Satellite imagery and chronolocation
Free satellite imagery lets anyone check large-scale claims:
- **Sentinel-2**, from the EU's Copernicus programme, photographs the land in colour and infrared at **10 m** resolution about every five days: enough for burn scars, floods, earthworks, camps and large ships, but not single vehicles.
- **Sentinel-1** is radar: it sees through cloud and at night, and shows ships and flooding well.
- **Landsat** (NASA and the US Geological Survey, 30 m) has the longest archive, back to 1972, and **[NASA Worldview](https://worldview.earthdata.nasa.gov)** shows coarse daily views of smoke, cloud and weather.

Browse Sentinel imagery free, by date and with cloud filters, false colour and time-lapses, in the **[Copernicus Browser](https://browser.dataspace.copernicus.eu)**: the free successor to Sentinel Hub's EO Browser, which was retired in March 2026. Sharper commercial imagery (Planet daily at about 3 m; Vantor, formerly Maxar, and Airbus down to about 30 cm) is sold or published through the news media. Providers can restrict sensitive areas: until 2020, US rules limited US companies' imagery of Israel to 2 m resolution.

**Chronolocation** establishes when something was filmed. A shadow's direction gives the sun's bearing (azimuth) and its length the sun's height (elevation):

$ sun elevation = arctan(object height ÷ shadow length)

! Worked example: A 3 m lamp post casts a 5.2 m shadow pointing north-east, so the sun is about 30° high (arctan 0.58) in the south-west: afternoon, in the northern hemisphere. Enter the place and claimed date in [SunCalc](https://www.suncalc.org) and read off when the sun stands about 30° high in the south-west. Allow for sloping ground and estimated heights, and give a time window rather than a minute; the season, weather records and that day's cloud on satellite images narrow the date.

? Sentinel-2 imagery has 10 m resolution. What can you reliably see with it?
* Individual cars in a car park
+ A large new burn scar or flooded area
* Faces in a crowd
= One 10 m pixel covers 100 m², so large changes in land cover are clear and small objects are not.

? A 2 m post casts a 2 m shadow. How high is the sun?
* 30°
+ 45°
* 60°
= arctan(2 ÷ 2) = arctan(1) = 45°.

# Unit 5 · Structured records

## Company registries and ownership
Companies leave records because the law requires them to. Registries show who formally runs a company, who owns or controls it and what it has filed.
- **[UK Companies House](https://find-and-update.company-information.service.gov.uk)** offers free search of officers, filings, accounts and **persons with significant control** (PSCs). Long criticised for accepting filings unchecked, it has required new directors and PSCs to verify their identity since 18 November 2025.
- **Ireland's Companies Registration Office** gives basic company details free through its CORE search, and filed documents for a small fee. Ireland's beneficial-ownership register closed to the general public after a 2022 ruling of the EU Court of Justice; access now requires a "legitimate interest".
- **[OpenCorporates](https://opencorporates.com)** gathers registries from around the world into one search, and **[OCCRP Aleph](https://aleph.occrp.org)**, from the Organized Crime and Corruption Reporting Project, searches registries, court records, sanctions lists and documents published with past investigations; its public version is free.

A standard company check: identify the exact legal entity (full name, registration number and jurisdiction, since names are often shared); list officers and controllers over time; read the filing history for late accounts and sudden changes; look for **shell indicators** such as an address shared with hundreds of companies, nominee directors, no staff or owners in secrecy jurisdictions; then follow the ownership chain across borders, one registry at a time.

! Remember: A register records what was filed, not necessarily the truth: treat filings as the company's own claims. Directors are people too, so keep the focus on the organisation and never publish home addresses.

? A company's registered address is shared by 600 other companies. What does this most likely indicate?
* That the company is fraudulent
+ That it uses a formation agent's address: a reason to dig further, not proof of wrongdoing
* That the registry has made an error
= Formation agents legitimately provide addresses to many clients. It is also common among shell companies, so it is an indicator, not a conclusion.

? Why record a company's registration number and jurisdiction?
+ Many companies share similar names, and the number identifies the exact legal entity
* The number shows the company's profits
* Only listed companies have numbers
= Entity resolution starts with unique identifiers; names alone cause false matches.

## Sanctions, procurement and court records
**Sanctions lists** name the people, companies, ships and aircraft subject to asset freezes and bans.
- US: the Treasury's OFAC [Sanctions List Search](https://sanctionssearch.ofac.treas.gov). Under OFAC's **50 percent rule**, a company owned 50% or more in total by sanctioned persons is itself blocked, even if it is not listed.
- UK: since 28 January 2026 the **[UK Sanctions List](https://www.gov.uk/government/publications/the-uk-sanctions-list)** has been the only official source; the old OFSI Consolidated List has closed.
- EU: the consolidated list, browsable on the [EU Sanctions Map](https://www.sanctionsmap.eu). UN: the Security Council Consolidated List. **[OpenSanctions](https://www.opensanctions.org)** combines many lists in one search, free for non-commercial use.
- A name match is not a match until the identifiers agree (registration numbers, addresses, IMO numbers for ships). False matches hurt real people and businesses.

**Public procurement** records show who sells what to governments: the EU's [TED](https://ted.europa.eu) (Tenders Electronic Daily); the UK's [Find a Tender](https://www.find-tender.service.gov.uk), the central platform since the Procurement Act 2023 took effect on 24 February 2025, and Contracts Finder for smaller contracts; Ireland's eTenders; and SAM.gov and [USAspending](https://www.usaspending.gov) in the US. Tenders are indicators too: a defence ministry buying winter fuel, field hospitals or pontoon bridges is telling you something.

**Court records** hold sworn evidence and findings: the UK's [Find Case Law](https://caselaw.nationalarchives.gov.uk) and BAILII, the Irish Courts Service's published judgments, and PACER (paid) and CourtListener (free) in the US. Read the judgment, not just the news report of it; remember that allegations in a claim are not findings; and obey reporting restrictions and anonymity orders.

? A company is not on any sanctions list, but two listed people together own 60% of it. Under OFAC's 50 percent rule, what is its status?
* Unaffected, because it is not listed
+ Treated as blocked
* Blocked only in the EU
= OFAC treats entities owned 50% or more, in aggregate, by blocked persons as blocked themselves.

? A sanctions search returns a company with almost the same name as a supplier you are researching. What should you do next?
+ Compare registration numbers, addresses and jurisdictions before drawing any conclusion
* Report the supplier as sanctioned
* Ignore it, because company names are unique
= Similar names produce many false positives; only matching identifiers establish a true match.

# Unit 6 · Movement and infrastructure

## Tracking aircraft, ships, fires and lights
**Aircraft** fitted with ADS-B continuously broadcast their identity, position, altitude and speed. Volunteers' receivers pick these up, and multilateration (MLAT) can locate many aircraft that send no position.
- **[Flightradar24](https://www.flightradar24.com)** hides some aircraft at their operators' request; **[ADS-B Exchange](https://www.adsbexchange.com)**, owned by the aviation data company JETNET since 2023, does not, and nor do community networks such as adsb.fi, airplanes.live and adsb.lol.
- They reveal military airlift surges, surveillance flights along borders, government aircraft on diplomatic trips, airspace closures and GPS jamming, which shows up as aircraft reporting degraded navigation accuracy ([GPSJam](https://gpsjam.org) maps it daily). Military aircraft often fly with transponders off or masked, and coverage is thin over sea and desert.

**Ships** of 300 gross tonnage and over on international voyages, and all passenger ships, must carry AIS, which broadcasts identity, position, course, speed and a destination typed in by the crew.
- **[MarineTraffic](https://www.marinetraffic.com)** (owned by Kpler since 2023) and **[VesselFinder](https://www.vesselfinder.com)** show live positions free; **[Global Fishing Watch](https://globalfishingwatch.org)** maps vessel activity free; **[Equasis](https://www.equasis.org)** (free registration) gives each ship's flag, owners, managers and inspection record.
- Follow ships by **IMO number**, which stays with the hull for life; names, flags and MMSI numbers change.
- **AIS gaps** may be holes in coverage, or ships "going dark" or broadcasting false positions, for example to hide ship-to-ship transfers of sanctioned oil by the so-called shadow fleet. Check a gap against Sentinel-1 radar imagery, which shows ships whether or not they transmit.

**Fires**: **[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov)** maps heat detected by satellites worldwide, usually within three hours (VIIRS pixels cover about 375 m, MODIS about 1 km), and has been used to follow fighting and scorched-earth tactics, most famously along the front line in Ukraine. A hotspot means **heat**, not a cause: crop burning, wildfires, gas flares and factories all appear, and cloud or brief fires between satellite passes are missed, so compare with the same place and season in earlier years.

**Lights and infrastructure**: night-time lights from the VIIRS day/night band (such as NASA's Black Marble) show blackouts after strikes on power grids, the growth of camps and economic slowdowns; moonlight, cloud, snow and season all change brightness, so compare like with like. OpenStreetMap records power lines, substations, pipelines and railways, which [OpenInfraMap](https://openinframap.org) displays.

! Ethics: These data can also reveal private people's movements. Use them to study state, military and commercial operations, and never publish a private individual's live location.

? A tanker's AIS signal disappears for four days near a known transfer area. What is the best interpretation?
* Proof of sanctions evasion
+ An indicator to check against radar imagery, ownership records and the ship's history
* A certain sign of equipment failure
= Gaps have innocent and suspicious explanations. Corroborate with independent sources before drawing a conclusion.

? A FIRMS hotspot appears at an oil refinery in a war zone. What does it show by itself?
* That the refinery was struck by a missile
+ That satellites detected unusual heat there, which could have several causes
* That the refinery has stopped operating
= Refineries flare gas routinely. FIRMS detects heat; establishing the cause needs other evidence and a comparison with the normal pattern.

# Unit 7 · Event and conflict data

## Event data and base rates
Three datasets dominate open conflict analysis. They measure different things in different ways, so learn their strengths and biases before drawing conclusions from them.

| Dataset | [GDELT](https://www.gdeltproject.org) | [ACLED](https://acleddata.com) | [UCDP](https://ucdp.uu.se) (Uppsala University) |
|---|---|---|---|
| Method | Automated coding of world news in over 100 languages | Human coders reading news, local partners' and agencies' reports | Researchers applying fixed definitions |
| Covers | Every kind of reported interaction, coded in CAMEO categories from statements and threats to protests and fighting | Political violence and protest: battles, explosions and remote violence, violence against civilians, protests, riots, strategic developments | Organised violence that kills at least 25 people in a year; wars at 1,000 or more battle deaths |
| Updated | Every 15 minutes | Weekly | Provisional events monthly; checked dataset yearly |
| Access | Free | Free registration; use governed by a licence | Free, open licence (CC BY 4.0) |
| Main bias | Counts media attention, not events; duplicates and misplaced locations | Depends on what is reported; start dates vary by region | Conservative death counts; slower; leaves out non-lethal events |

**Normalise GDELT**: it reads more sources every year, so raw counts drift upwards; use shares or rankings, as PRP's Geopolitical Volatility does. Use ACLED for protest and local violence and UCDP for strict comparisons across countries and decades, and when datasets disagree, look for different definitions, thresholds and sources before suspecting error.

**Base rates.** Before asking what is special about a case, ask how often such things happen. That frequency is your starting estimate; the details of the case then move it up or down. Taking this **outside view** first is a habit of the best performers in Philip Tetlock's forecasting tournaments (Tetlock and Gardner, _Superforecasting_, 2015).
- **Armed conflict**: UCDP counted 65 state-based armed conflicts in 2025, the most since its records began in 1946. Thirteen reached war intensity (1,000 or more battle deaths) and eight were fought between states.
- **Coups**: Powell and Thyne's dataset counts several hundred coup attempts worldwide since 1950, and about half succeeded, so a new attempt starts at roughly even odds.
- **Reference classes matter**: "coups in West Africa since 2000" and "coups worldwide since 1950" give different rates. Try several and see how far the answer moves.

! Worked example: 3 coup attempts in 60 years gives a base rate of about 5% a year, or 2.5% for a six-month window. Unpaid soldiers, a disputed election and a coup next door may justify raising it, but you should be able to say by how much and why.

? Why can rising GDELT event counts for a country mislead you?
* GDELT covers only Europe
+ They can reflect more media attention or more sources rather than more events
* GDELT counts deaths, not events
= GDELT codes news reports. More coverage produces more coded events, so counts must be normalised and checked.

? What is the main reason to start an estimate from a base rate?
* Base rates are always right
+ It grounds the estimate in how often similar events actually happen, before vivid details sway you
* It saves collecting evidence about the case
= Striking details push estimates too far; the base rate is the disciplined starting point to adjust from.

# Unit 8 · Structured analysis

## Key assumptions and competing hypotheses
Analysts rarely fail for lack of information. More often they reason from untested assumptions towards the first plausible answer. Structured analytic techniques (Heuer and Pherson; the US government's _Tradecraft Primer_, 2009) slow that process down and make it visible.

**Key assumptions check.** List the assumptions your judgement rests on. For each, ask why you believe it and what would make it false, then mark it **solid**, **correct with caveats** or **unsupported**. Israel was surprised in October 1973 partly because of "the concept", a fixed belief that Egypt would not go to war until it could strike Israel's airfields.

**Analysis of competing hypotheses (ACH)**, from Richards Heuer's _Psychology of Intelligence Analysis_ (1999):
1. List every plausible hypothesis, including uncomfortable ones, and all the significant evidence, including things that should have happened but did not.
2. Mark each item consistent (C), inconsistent (I) or not applicable (N/A) for each hypothesis.
3. Concentrate on **diagnostic** evidence: items consistent with one hypothesis and inconsistent with others. Evidence consistent with everything tells you nothing.
4. Favour the hypothesis with the **least inconsistent** evidence, check how much the result rests on a few unverified items, and name what would change your mind.

| Evidence (fire at a fuel depot) | H1 accident | H2 sabotage | H3 drone strike |
|---|---|---|---|
| Fire began at 03:10, when the depot was closed | C | C | C |
| No air-raid alert in the region that night | C | C | I |
| Two separate seats of fire, 200 m apart | I | C | C |
| Camera footage of a person at the fence at 02:50 (unverified) | N/A | C | N/A |

The first item fits everything, so it is not diagnostic. H2 has no inconsistent evidence, but that rests on an unverified clip and on an assumption that small drones always trigger alerts, so verifying those two items is the next collection task.

? In ACH, which hypothesis do you tentatively favour?
* The one with the most consistent evidence
+ The one with the least inconsistent evidence
* The one your best source prefers
= Consistent evidence often fits several hypotheses; inconsistent evidence actually rules hypotheses out.

? Evidence that is consistent with every hypothesis is best described as what?
+ Non-diagnostic
* Decisive
* Inconsistent
= However striking it is, it cannot help you choose between explanations.

## Indicators, warnings and red teams
**Indicators** are observable changes you would expect to see if a scenario were developing. Good ones are specific, observable in sources you can actually reach and **diagnostic**: much more likely under one scenario than under the others. For the scenario "the government postpones the election":

| Type | Indicator | Where to look |
|---|---|---|
| Legal | A court petition or emergency decree on electoral law | Official gazette, court records |
| Administrative | The electoral commission halts printing of ballots | Commission notices, procurement records |
| Political | Ruling-party figures start speaking of "security conditions" | Domestic media, party channels |
| Coercive | Opposition rallies banned in the capital | Local news, protest data |

Set a baseline and thresholds in advance (for example green, amber and red) and record each change with its date and source. Separate **leading** indicators, which come before the event, from **lagging** ones, which confirm it, and review the list as you learn: an indicator that never moves may be the wrong one.

**Challenge your own analysis.** **Red teaming** means thinking and planning as the other side would, from its interests, history and constraints rather than yours. **Devil's advocacy** argues the strongest case against the prevailing view. A **pre-mortem** imagines that it is six months later and your assessment proved wrong, and asks why, which brings out weaknesses while you can still fix them.

? What makes an indicator diagnostic?
* It is easy to observe
+ It is much more likely under one scenario than under the alternatives
* It appears in many news reports
= An indicator that would appear whichever scenario is unfolding cannot tell you which one it is.

? What is a pre-mortem?
+ Imagining your assessment has failed and explaining why, before you finalise it
* An autopsy report used as evidence
* A review written after a forecast has failed
= Assuming failure frees people to name weaknesses they would otherwise keep to themselves.

## Biases and estimative language
- **Confirmation bias**: seeking and favouring evidence for what you already believe. The US Senate Intelligence Committee's 2004 report on pre-war assessments of Iraqi weapons found that analysts read ambiguous evidence as confirming a presumption, and criticised "groupthink".
- **Mirror imaging**: assuming others think, value and calculate as you do. Ask how the situation looks from their capital, with their history and domestic pressures.
- **Anchoring**: staying too close to the first number or story you met; write down the base rate before you read the details. Watch, too, for **availability** (judging likelihood by how easily examples come to mind) and **hindsight bias**.

In 1951 a US National Intelligence Estimate called a Soviet attack on Yugoslavia that year a "serious possibility". Sherman Kent later found that the people who had agreed the wording read it as anything from a 20% to an 80% chance. His essay _Words of Estimative Probability_ (1964) began the effort to tie words to numbers. Today's standards:

| US (ICD 203) | Chance | UK (probability yardstick) | Chance |
|---|---|---|---|
| Almost no chance | 1–5% | Remote chance | about 5% or less |
| Very unlikely | 5–20% | Highly unlikely | about 10–20% |
| Unlikely | 20–45% | Unlikely | about 25–35% |
| Roughly even chance | 45–55% | Realistic possibility | about 40–50% |
| Likely | 55–80% | Likely or probable | about 55–75% |
| Very likely | 80–95% | Highly likely | about 80–90% |
| Almost certain | 95–99% | Almost certain | about 95% or more |

**Confidence** (high, moderate or low) is a separate judgement about the evidence and reasoning behind an estimate. UK guidance (2025) rates it on the information base, the analytical rigour, and the complexity and volatility of the issue. The US directive ICD 203 forbids putting a likelihood term and a confidence level in the same sentence: write "An attack is unlikely (20–45%)." and then, separately, "We have high confidence in this judgement because…".

! Keep score: Record your forecasts and check them when the outcome is known. Being well calibrated means the things you call 70% likely happen about 70% of the time.

? Why did Sherman Kent push for agreed meanings for words such as "probable"?
* To make estimates sound more confident
+ Because readers took the same phrase to mean very different probabilities
* Because numbers were classified
= The 1951 "serious possibility" episode showed that one phrase could mean 20% to one reader and 80% to another.

? Which follows the US guidance on likelihood and confidence?
* "We assess with high confidence that an attack is unlikely."
+ "An attack is unlikely (20–45%). We have high confidence in this judgement because…"
* "An attack might perhaps happen."
= ICD 203 keeps likelihood and confidence in separate sentences, and vague words such as "might perhaps" give the reader nothing to act on.

# Unit 9 · Writing it up

## Bottom line up front, sourcing and the audit trail
Readers are busy, so put the answer first:
1. **Bottom line up front (BLUF)**: one to three sentences giving your judgement, how likely it is, how confident you are and the main reason.
2. **Key judgements**, each with its basis, then the **evidence**, with every source graded and linked to an archived copy.
3. **Alternatives** you considered, the **gaps** you could not close and the **indicators** that would change your mind.

Keep **facts** ("the video shows…"), **assessments** ("we assess…") and **assumptions** ("we assume…") visibly apart. Give times in UTC, dates unambiguously (12 May 2026 or 2026-05-12) and coordinates in decimal degrees, and caption every map and annotated image with what it shows and where it came from.

! BLUF example: A fire at the Northport fuel depot early on 12 May was almost certainly (95–99%) started by two drones. It is likely (55–80%) that Country B's armed forces launched them. Confidence in that attribution is low because it rests on one unverified claim of responsibility. (A fictional example.)

**Keep an audit trail** from the first search to the final draft: queries, sites visited, captures with their archive links and hashes, translations, decisions and the reasons for them, and each version of the product. It lets you, a reviewer, a court or a reader retrace and check the work, protects you when a finding is challenged and makes corrections possible. When you get something wrong, correct it openly.

? What belongs in a BLUF?
+ The judgement, how likely it is, how confident you are and the main reason
* A full chronological account of the research
* A list of every source consulted
= The bottom line gives a busy reader the answer and its strength in a few sentences; the detail follows.

? Why keep an audit trail of searches, captures and decisions?
* Search engines require it
+ So that you and others can retrace, check and if necessary correct the work
* To make the report longer
= Reproducibility is what makes OSINT credible, and a log is what makes it reproducible.

# Unit 10 · Law, ethics and safety

## Law, terms of service and data protection
The legal line is simple to state: **collect only what is lawfully available to you.**
- **No unauthorised access.** Do not guess or reuse passwords, use another person's login, exploit a security flaw or open data plainly not meant to be public, even if a server leaves it exposed. These can be crimes under the UK's Computer Misuse Act 1990, Ireland's Criminal Justice (Offences Relating to Information Systems) Act 2017 and the US Computer Fraud and Abuse Act.
- **No bypassing or deception.** Do not get round paywalls, logins, geo-blocks or rate limits, and do not trick people into giving you information they would not otherwise give.
- **Terms of service** bind you on each platform, and many forbid automated scraping and fake accounts; breaking them can get you banned or sued. Use official downloads and APIs where they are offered.
- **Data protection.** Under the EU GDPR and the UK GDPR, personal data that is publicly available is still personal data. Collect only what your question needs (data minimisation), use it only for that purpose, keep it accurate and secure, and delete it when you are done; data revealing political opinions, health, ethnicity or religion needs extra justification. The household exemption covers purely personal activity, not publishing to the world (EU Court of Justice, _Lindqvist_, 2003), and journalism and research exemptions are set by national law, not blanket permissions.
- **Defamation.** Saying that a named company or official did wrong is defamatory unless you can prove it. Describe exactly what the evidence shows, and offer a right of reply before publishing serious allegations.

? A company's server is misconfigured and exposes its internal files without a password. May you download them?
* Yes, because they are technically public
+ No: deliberately accessing data plainly not meant to be public can be an offence, whatever the security failure
* Yes, if you delete them afterwards
= Open source means lawfully available, not merely reachable. Exposed internal files are not published information.

? Public social-media posts contain people's names and photographs. Under the GDPR, what is true?
+ They are still personal data, so any collection must be necessary, limited and secure
* They are free of data-protection rules because they are public
* Only governments may collect them
= Being public changes the risk, not the principles: data protection still applies.

## Doing no harm and staying safe
OSINT can hurt people: by exposing victims and witnesses, by naming the wrong person, or by publishing what a hostile group could use.
- **Investigate events, organisations, places and claims, not private individuals.** Never identify, locate or profile private people, or publish anyone's address, contact details or movements (doxxing). Public figures can be scrutinised for their public roles and conduct, not their private lives.
- **Mind the mosaic effect**: harmless details combined can expose a person or a sensitive site. And misidentification destroys lives: after the 2013 Boston Marathon bombing, online sleuths wrongly named an innocent missing student as a suspect, and the accusation spread worldwide.
- **Protect dignity**: blur the faces of victims and bystanders, avoid gratuitous graphic material, and think about what your publication will do to the people in it and their families.

The **[Berkeley Protocol on Digital Open Source Investigations](https://humanrights.berkeley.edu/projects/berkeley-protocol-on-digital-open-source-investigations/)**, from the UC Berkeley Human Rights Center and the UN Human Rights Office (launched in 2020, published in 2022), sets the professional standard for open-source work that may become evidence. Its principles are professional (accountability, competency, objectivity, legality and security awareness), methodological (accuracy, data minimisation, preservation and security by design) and ethical (dignity, humility, inclusivity, independence and transparency). Its investigation process runs from online inquiries and preliminary assessment through collection and preservation to verification (of the source, the technical data and the content) and investigative analysis.

**Your own security**, in plain defensive terms:
- Think first about who might take an interest in your work and what they could learn about you, and match your precautions to the answer.
- Keep research separate from your personal life: use a separate browser profile or device, and research accounts registered honestly within each platform's rules. Never impersonate anyone.
- Observe, don't interact: do not like, follow, join or message the accounts and groups you study. Some sites tell owners who viewed a page, and links and documents can carry trackers that record your internet address.
- Keep your system updated, use a password manager and two-factor authentication on your own accounts, treat downloaded files and attachments as untrusted, and encrypt and back up what you hold. A VPN hides your internet address from the sites you visit, but the VPN provider can see your traffic: it is not anonymity.
- Graphic material causes vicarious trauma. Turn off autoplay, mute the sound, view footage small or in greyscale where you can, take breaks and talk to someone.

? A video shows people fleeing an attack. What should you do before publishing your analysis of it?
* Identify everyone visible so the record is complete
+ Blur the faces of victims and bystanders and publish only what your question requires
* Repost the raw footage widely so others can help
= The Berkeley Protocol's principles of dignity and data minimisation mean publishing what the analysis needs, not exposing the people in it.

? Which is NOT one of the Berkeley Protocol's investigation phases?
* Preservation
* Verification
+ Covert infiltration
= Its phases are online inquiries, preliminary assessment, collection, preservation, verification and investigative analysis. Deception has no place in them.

? What does a VPN do?
* Makes you completely anonymous online
+ Hides your internet address from the sites you visit, while the VPN provider can still see your traffic
* Encrypts the files on your computer
= A VPN moves trust from your internet provider and the sites you visit to the VPN provider. It is one layer of protection, not anonymity.

# Unit 11 · Using PRP as an intelligence tool

## PRP as a source: news and framing
PRP brings many open sources into one workspace: live views in Realtime Intelligence, history and the Encyclopaedia in Retrospective Intelligence, financial tools in Money Management and science views in Natural Science. Treat it as you would any compilation, a **tertiary source** for orientation, base rates and leads. Before relying on a view, read its **Sources** block (where the data come from, how often they refresh and how they are processed), note when it was last updated, and trace any claim you will publish back to its primary source.

### Workflow: Intelligence Briefing (framing across the spectrum)
1. Add a **topic** with the keywords people actually use, including names, places and alternative spellings. Topics are saved in your browser only.
2. Use the **balanced columns** view, which sets fifty publishers' coverage side by side in five positions (far left, left, centre, right and far right), and leave "Hard news only" on.
3. Compare the framing: which positions cover the story at all, the verbs in the headlines ("killed", "died", "eliminated"), who is quoted and what is left out. Coverage on one side only is a finding in itself. Positions describe editorial slant, not accuracy, and outlets marked ⚠ have mixed or low factual-reliability ratings.
4. Trace every factual claim you will use to its primary source, and grade it.

### Workflow: Global Headline Tracker (country coverage and archives)
1. Pick a covered country on the map to see its last 24 hours of headlines.
2. Read the **top stories** from its most-read outlets, translated into English, and open the original-language article for anything important.
3. Use the daily, weekly, monthly and yearly archives to see what the domestic press has led with; stories that persist for days show what matters there.
4. Compare with the Intelligence Briefing: stories that are big at home but invisible abroad, or the reverse, are often the most telling.

? Where should you look first to understand how a PRP view was built?
* The colour key on the map
+ The page's Sources block: data source, refresh cadence and method
* The page's title
= Knowing a view's sources and refresh cadence is the first step in grading it, as with any other source.

? A story appears only in far-right outlets in the Intelligence Briefing. What is the right reading?
* It must be false
* It must be true and suppressed elsewhere
+ The asymmetry is a finding to investigate: trace the claim to its primary source and look for independent confirmation
= Who covers a story is informative, but on its own it is evidence of neither truth nor falsehood.

## Warning, risk and conflict
### Workflow: Geopolitical Volatility (indicators and warnings)
A daily score from 0 to 100 for every country, built from GDELT, weighting conflict and security (35%), political and diplomatic escalation (20%), civil unrest (20%), cross-border spread (15%) and economic disruption (10%), each ranked against every adequately covered country-day of the past 90 days.
1. Learn each watched country's normal range before anything happens: that is your baseline.
2. Compare up to four countries, and read the **components**, not just the total.
3. Treat a spike as a **warning to investigate**: check whether one big story is driving the coverage, then turn to the Global Headline Tracker and Realtime Battlefield. A day without a score means too little data, not calm.
4. Write thresholds into your indicator list, such as "unrest component above 80 for three days running".

### Workflow: National Analysis (PESTLE country risk)
Political, economic, social, technological, legal and environmental pressure (the share of each dimension's indicators that are worsening) across 41 indicators, with a profile of how each country is governed, how often its leaders change and how much conflict it has seen.
1. Place the country on the map and ranking, then read which dimensions are under most pressure.
2. Compare it with up to three true peers (neighbours, or countries with similar incomes or political systems), and use the period selector to see whether the pressures are new or long-standing.
3. Check the data dates, since World Bank series often lag by a year or two, and pair these slow structural signals with Volatility's fast daily ones.

### Workflow: Realtime Battlefield (conflict tracking)
Every armed conflict recorded this year from UCDP's candidate events, grouped into wars and warzones, with monthly briefings and related coverage.
1. Use the three-month live map for the current picture and the year-to-date archive for trends, and log each war's monthly deaths in your own notes.
2. Remember that the data are **provisional and about a month behind**, and fill the latest days with graded near-real-time sources: FIRMS detections, geolocated video and local news.

### Workflow: Retrospective Battlefield and War Focus (historical base rates)
Every war and armed conflict from 1926 to 2025 on a slider (UCDP/PRIO data from 1946, the Correlates of War before that), and the major wars of the last century month by month.
1. Define a reference class (interstate wars, civil wars with foreign intervention, wars in one region) and count how many there were, how long they lasted and how they ended.
2. In War Focus, compare the shape of a current war (monthly deaths, territory changing hands) with comparable past ones.
3. Mind the seam: before 1946 only wars with 1,000 or more battle deaths are listed, so smaller conflicts seem to appear suddenly in 1946.

? A country's Volatility score jumps from 40 to 85 in a day. What is the best first step?
* Report that the country is entering a war
+ Check which components moved and what coverage drove them, then verify in other sources
* Ignore it, since GDELT is unreliable
= A spike is a warning to investigate. The components and the underlying reports show whether it is a real change or a burst of media attention.

? Retrospective Battlefield shows far more conflicts from 1946 onwards than in 1926–1945. What is the most likely reason?
* The world suddenly became more violent in 1946
+ The data change: before 1946 only wars with 1,000 or more battle deaths are listed, afterwards conflicts from 25 deaths
* Borders were redrawn in 1946
= Two datasets with different thresholds meet in 1946. A jump at a seam in the data is an artefact, not history.

## Power, precedent and entities
### Workflow: Political Atlas and Political Retrospective (power and precedent)
The Atlas shows who holds power in 78 countries (executives, legislatures, courts, elections, policies and challenges); the Retrospective moves a slider from 1926 to today, redrawing borders and showing who led each country and how they took and left power.
1. Map the formal power in the Atlas: who controls the executive, each chamber and the top court, and when the next election falls. Confirm anything important with official sources, since the Atlas is refreshed monthly.
2. Step through the country's past in the Retrospective, noting irregular seizures of power and border changes, and turn them into base rates: how often power changed hands irregularly, and how long leaders lasted.

### Workflow: Realtime and Historical Calendar (scheduled events as indicators)
Upcoming elections and the last six months of new leaders, coups, wars, assassinations, crises and treaties; the historical view runs from 1980 to today.
1. Highlight your countries so the calendar shows only their events; the selection is kept in the page address, so you can bookmark it.
2. Treat scheduled events (elections, referendums, summits, anniversaries) as **stress points** with indicators to watch beforehand, and check what happened around previous ones.
3. After each event, compare the outcome with what you expected and record it: that is the feedback stage.

### Workflow: Encyclopaedia (entity resolution and link analysis)
Every person, place, party, war, idea and organisation in PRP, keyed to its **Wikidata Q-number**, with links to everywhere it appears in the suite.
1. **Resolve** each entity to its Q-number, which separates namesakes and gathers spellings and transliterations under one record.
2. **Read across** the places it appears to turn scattered mentions into one timeline.
3. **Query by tags** with + or AND, | or OR, - or NOT, brackets, quotation marks for phrases and Facet:Value to be exact. For example, leaders who took power irregularly, and this century's coups:

$ Role:Took power irregularly + Type:Person
$ Event type:Coup + 21st century

4. **Chart the links**, with entities as nodes and relationships as labelled, sourced lines, and verify each in primary sources: Wikidata is edited by volunteers, and a missing tag is not evidence that a link does not exist.

? An election is due in eight weeks. How should the Realtime Calendar shape your work?
+ As a scheduled stress point: set indicators and thresholds to watch in the weeks before it
* As proof that unrest will follow
* As irrelevant, because elections are planned
= Scheduled events are predictable moments of pressure. The calendar tells you when to watch and your indicators tell you what to watch.

? Why resolve an entity to its Wikidata Q-number before analysing it?
+ It separates people or organisations with the same name and gathers different spellings under one identifier
* It proves the entity is real
* It reveals private information about the entity
= A unique identifier is the basis of reliable entity resolution, especially across languages and scripts.

## Money and science as signals
### Workflow: TD Markets and the Hype Tracker (financial signals)
Indices, interest rates, currencies, commodities and crypto react to political risk within seconds, in public. The **Hype Tracker** flags tickers suddenly discussed or traded far more than usual, weighting Reddit mentions 45%, trading volume against its three-month average 40% and search trends 15%.
1. Pick the instruments tied to your question: a country's currency and bond yields, oil for a Gulf crisis, wheat for a Black Sea blockade, defence and shipping shares.
2. Time-stamp sharp moves against your event timeline. Markets often move on news before it is widely reported, and sometimes on rumours that prove false.
3. Treat a Hype Tracker surge as a lead (a leak, a contract, a disaster) that may also be coordinated hype.

### Workflow: Auto Trader (disclosures as OSINT)
Trades reported by members of the US House of Representatives under the STOCK Act (within 30 days of learning of a trade, and no later than 45 days after it), and large investors' holdings from their quarterly SEC Form 13F filings (due within 45 days of each quarter's end, covering long positions in US-listed securities only).
1. Read them as **late, partial records**: they give value ranges rather than exact amounts, and 13F filings omit short positions and most non-US holdings.
2. Treat patterns, such as trades in a sector shortly before a committee acts on it, as leads: check the committee's records and the filing itself, and describe exactly what the record shows. Nothing here is investment advice.

### Workflow: Scientific Briefing and Timeline of Progress (science and technology intelligence)
New papers and science news by discipline, and a map-and-slider timeline of breakthroughs with the people and institutions behind them, linked to the Encyclopaedia.
1. Follow the disciplines that matter to your question, and separate peer-reviewed results from preprints and press releases.
2. Map who does the work: institutions, countries and collaborations show where capability is concentrated and how it moves.
3. Handle dual-use subjects with care: describe capabilities and trends, and never publish anything that would help someone cause harm.

? A representative's disclosure shows a large purchase of a defence company's shares three weeks before a related committee vote. What can you responsibly conclude?
* That the representative traded on inside information
+ That the timing is a lead to check against committee records and the filing itself, not proof of wrongdoing
* Nothing, because disclosures are always late
= Disclosures are late and partial. A pattern justifies a closer look and careful wording, never an accusation without evidence.

? A small company's ticker tops the Hype Tracker overnight. How should an analyst treat it?
+ As a sign of unusual attention that may point to a story, to be checked against news, filings and the possibility of coordinated hype
* As evidence that the company is about to be bought
* As a reason to buy the shares
= The Hype Tracker measures talk, trading volume and searches, not facts. It is a lead for investigation.

## Capstone 1: the burning depot
**Scenario (fictional).** At 01:22 UTC on 12 May a Telegram channel posts a 40-second night video of a large fire, captioned "Drone strike destroys army fuel depot at Northport". One side's officials call it a successful operation; the other side's call it an accident at a civilian site. **Your task**: establish what happened, when and where, and how confident you can be, using OSINT methods and at least four PRP submodules, and finish with a BLUF.

### Model answer
1. **Provenance**: reverse searches of keyframes find no earlier copies. The earliest upload is the 01:22 post, from a channel whose past local reports have mostly proved accurate (source grade C). Archive it twice, download the file, hash it and log it.
2. **Place**: storage tanks, a water tower and a rail spur in the frame match the Northport depot on satellite and street-level imagery: three independent features. Record the coordinates.
3. **Time and corroboration**: FIRMS shows two heat detections at the depot at 00:58 UTC, and the next clear Sentinel-2 image, on 15 May, shows burn scars on two tanks 200 m apart, matching the two seats of fire in the video.
4. **PRP context**: Realtime Battlefield shows strikes on fuel infrastructure in this war in each of the last three months, and War Focus shows such strikes rising in comparable wars when the front stalled. The Intelligence Briefing splits along partisan lines, but the Global Headline Tracker shows the country's own outlets leading with an air-raid alert that night. Volatility's conflict component is at the top of its 90-day range.
5. **Hypotheses**: two seats of fire are inconsistent with a single accident; the air-raid alert and the recent pattern fit a drone strike; sabotage has no supporting evidence. The judgement rests most on the alert reports, so confirm them next.

! BLUF: A fire destroyed at least two fuel tanks at the Northport depot at about 01:00 UTC on 12 May, very likely (80–95%) as a result of a drone strike. We have moderate confidence in this judgement: the timing and damage are well corroborated, but no weapon debris has been verified. The strike fits a three-month pattern of attacks on fuel infrastructure in this war.

? In the model answer, which items independently confirm the video's place and time?
* The number of views the clip received
+ The FIRMS detections and the burn scars on later Sentinel-2 imagery of the geolocated site
* The officials' statements
= Satellite detections and imagery are collected independently of the video, so they corroborate it; views and partisan statements do not.

? Why does the BLUF give likelihood and confidence in separate sentences?
+ They are different judgements: how probable the conclusion is, and how solid the evidence and reasoning behind it are
* Confidence is always low in war zones
* To make the summary longer
= Keeping them apart, as ICD 203 requires, stops readers confusing the probability of an event with the strength of the evidence for it.

## Capstone 2: six weeks to the vote
**Scenario (fictional).** Country C holds a presidential election in six weeks. The president's party controls parliament and the constitutional court, the main opposition leader has been barred from standing, the currency has fallen 12% in three months and Geopolitical Volatility's civil-unrest component is climbing. **Your task**: assess the likelihood of serious unrest (sustained mass protests or deadly clashes) between now and four weeks after the vote, using at least five PRP submodules, and set out the indicators to watch.

### Model answer
1. **Base rate**: the Historical Calendar and Political Retrospective show mass protests after two of the country's last five presidential elections, one of them followed by a coup attempt: about 40% before considering current conditions.
2. **Structure and power**: National Analysis shows rising economic and political pressure and a history of irregular changes of leader. The Political Atlas shows that the president's camp controls parliament and the court, so legal challenges to the result will probably fail and the opposition is likely to turn to the street; confirm the court's membership on its own website.
3. **Actors**: the Encyclopaedia resolves the main figures and parties to Q-numbers and shows the security chiefs' party ties and their roles in past crises.
4. **Signals**: Volatility's unrest component has risen for three weeks; the Global Headline Tracker shows domestic outlets dominated by the candidate ban; TD Markets shows the currency and bond yields weakening as investors price in political risk.
5. **Hypotheses and assumptions**: a calm vote is inconsistent with the ban, the currency's fall and rising unrest, and nothing yet points to postponement. The key assumption, that the security forces stay loyal to the president, is supported but untested.

! BLUF: Serious unrest in Country C around the election is likely (55–75% on the UK yardstick), up from a base rate of about 40%, because the leading opposition candidate has been barred and the economy is weakening. Confidence is moderate: the unrest trend is clear, but the security forces' loyalty is untested.

! Indicators: Formal opposition calls for street action or a boycott; Volatility's unrest component above 80 for three days; security forces' leave cancelled or troops moved to the capital; internet shutdowns (watch outage monitors such as IODA and NetBlocks); a further 10% fall in the currency within a week on TD Markets.

? Why does the model answer start from the country's own election history?
+ It gives a base rate for unrest, which the current indicators then adjust
* History always repeats itself
* Current indicators are unreliable
= Starting from the outside view stops the vivid details of the current crisis from dominating the estimate.

? Which indicator in the model answer best distinguishes serious unrest from limited protest?
* Thin international coverage
+ Security forces' leave being cancelled and troops moved to the capital
* The election date being fixed
= Preparations by the security forces suggest that the authorities themselves expect large-scale disorder; the other items fit several scenarios.
