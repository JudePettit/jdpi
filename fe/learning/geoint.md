title: Geospatial and imagery intelligence (GEOINT & IMINT)
intro: A practical, university-style course in geospatial and imagery intelligence for the individual analyst: how satellite and aerial images are made and read, change over time, geolocation and chronolocation, measurement and terrain, coordinates and map data, verification and reporting, and the legal, ethical and safety limits of the work. Each practical unit closes with a walkthrough in PRP's GEOINT & IMINT Dashboard, and two capstone exercises bring the methods together at the end.

# Unit 1 · Foundations

## What GEOINT and IMINT are, and their limits
**Geospatial intelligence (GEOINT)** is intelligence about places: what is where, how large it is, what lies around it and how it changes. **Imagery intelligence (IMINT)** is the part of it that comes from pictures of the Earth, taken from satellites, aircraft and drones or on the ground. The term GEOINT spread after 2003, when the US National Imagery and Mapping Agency was renamed the National Geospatial-Intelligence Agency, and US law defines it as "the exploitation and analysis of imagery and geospatial information" to describe, assess and depict physical features and activities on the Earth.

For an open-source analyst the work comes down to three questions: **where** is this, **when** was it taken, and **what has changed**? Answering them draws on three kinds of material:
- **Imagery**: satellite scenes, aerial and drone photographs, and photos and video taken on the ground.
- **Geospatial data**: maps, elevation models, coordinates, place names and databases of mapped features such as OpenStreetMap.
- **Collateral**: everything else that gives a picture meaning, from news reports and official statements to company records, sensor feeds and other analysts' findings.

As the [OSINT course](#/oi/osint-training/course-osint) puts it, information is not intelligence. A satellite image stays raw material until it has been interpreted and set beside other evidence to answer a question that matters to someone. In imagery work the intelligence cycle is often called **TCPED**: tasking (choosing what to image, or which archive to search), collection, processing (correcting and aligning the images), exploitation (interpreting them) and dissemination.

Imagery's great strength is independence: a satellite records the ground whatever anyone says about it, and a dated image lets anyone test a claim. Its limits are just as real:
- It shows only what is visible from above, at the sensor's resolution, on the days it passed and, for optical sensors, when the sky was clear.
- It shows what, rarely who or why: ownership, intent and purpose need other sources.
- It can be misread, and it can be deceived by decoys, camouflage and look-alikes.
- Access depends on providers' licences and governments' policies, which can change overnight (Unit 2).

Open GEOINT is now practised far beyond governments: by newsroom visual-investigation teams, university and think-tank researchers, human-rights groups, the UN's satellite centre UNOSAT, humanitarian mappers and independent analysts working with free imagery and software.

! Scope: The subjects here are places, events, infrastructure and claims. Finding, watching or tracking private individuals with imagery or maps is outside this course and should never be attempted; Unit 10 explains why.

? What is the relationship between IMINT and GEOINT?
* They are two names for the same discipline
+ IMINT is drawn from imagery; GEOINT combines imagery with maps and other information about places
* GEOINT comes only from satellites and IMINT only from photos taken on the ground
= Imagery intelligence is one ingredient of geospatial intelligence, which also draws on maps, elevation, coordinates and place data.

? A satellite image shows a long column of trucks on a road. Which question can it not answer by itself?
* Where the trucks were at that moment
* Roughly how many there were
+ Why they were there
= Imagery records physical facts at a moment. Purpose and intent need other sources and careful analysis.

## From balloons to CORONA to daily imagery
Pictures of the Earth from above have served intelligence for as long as people could take them, and each step in their history added a technique that analysts still use.

| When | Milestone | What it added |
|---|---|---|
| 1858 | Nadar takes the first aerial photographs, from a balloon near Paris | The overhead view |
| 1914–1918 | Air photography becomes routine over the Western Front | Comparing the same ground over time; overlapping stereo pairs that show height |
| 1939–1945 | Allied interpreters at RAF Medmenham, in England | Systematic interpretation, measurement and specialist teams |
| 1956–1962 | U-2 flights over the Soviet Union and Cuba | Strategic reconnaissance from high altitude |
| 1960–1972 | CORONA satellites | Whole countries covered from orbit |
| 1972 | Landsat 1 | A civilian, scientific record of the land, unbroken since |
| 1999–2005 | IKONOS, then Google Earth | Metre-scale imagery for sale, then free to view |
| 2015 onwards | Sentinel-2, constellations of small satellites, commercial radar | Free 10 m imagery every few days; near-daily sharp imagery for sale |

**Measurement.** In 1943 Constance Babington Smith, an interpreter at Medmenham, found a cross-shaped speck less than a millimetre long on a print of the German weapons site at Peenemünde. From the photograph's scale she worked out a wingspan of about 6 m: the first sighting of the V-1 flying bomb.

**Pattern.** On 14 October 1962 a U-2 photographed missile sites being built near San Cristóbal in Cuba. Analysts at the US National Photographic Interpretation Center recognised them by comparing the vehicles and the layout with Soviet missile sites they had already studied, and President Kennedy saw the photographs two days later.

**Coverage from orbit.** After a U-2 was shot down over the Soviet Union in May 1960, satellites took over. CORONA's cameras exposed film that came back to Earth in capsules caught in mid-air by aircraft; the first successful return, in August 1960, covered more than four million square kilometres of Soviet territory. By 1972 CORONA had taken about 800,000 images, its resolution improving from about 8 m to about 2 m. President Clinton declassified them in February 1995, and frames already scanned can now be downloaded free from the US Geological Survey's [EarthExplorer](https://earthexplorer.usgs.gov) (others can be requested for scanning): a record of the 1960s landscape for archaeologists, glaciologists and historians.

**Public evidence.** In August 1995 the United States showed the UN Security Council aerial photographs of freshly disturbed ground near Srebrenica, evidence of mass graves. In April 2022 commercial satellite images taken on 18 and 19 March showed dark shapes on Yablunska Street in Bucha, where bodies were later filmed, while Russian forces still held the town. They contradicted Russia's claim that the scene had been staged after its troops left on 30 March, and anyone could check their dates.

Three habits are older than satellites: compare the same place over time, measure against known sizes, and recognise patterns from what you have studied before. And imagery persuades most when its date and source are open to checking.

### In PRP: the dashboard at a glance
PRP's [GEOINT & IMINT Dashboard](#/oi/geoint) puts the free data and tools this course uses in one place, with a tab for each job:
- [Overview](#/oi/geoint/overview): which tool answers which question, and the limits to remember for each.
- [Imagery](#/oi/geoint/imagery): NASA's daily satellite images since 2000 and night lights since 2012, with a before-and-after swipe and links to sharper imagery of the same place.
- [Fires & hazards](#/oi/geoint/hazards): satellite fire detections, earthquakes and disaster alerts.
- [Features](#/oi/geoint/features): infrastructure and landmarks mapped in OpenStreetMap.
- [Measure & geolocate](#/oi/geoint/measure): coordinates, distances, areas, bearings, terrain, line of sight, and the sun and its shadows.
- [Software Cookbook](#/oi/geoint/cookbook), [Hardware Guide](#/oi/geoint/hardware) and [Law & ethics](#/oi/geoint/law): the desktop tools, the kit and the rules.

? Why did the CORONA satellites send their film back to Earth in capsules?
* To keep the images from allied governments
* Because radio signals cannot pass through the atmosphere
+ Before digital sensors and data links were good enough, exposed film had to be recovered physically
= Early reconnaissance satellites photographed on film, which came back in capsules caught in mid-air over the Pacific.

? Commercial satellite images of Bucha taken on 18 and 19 March 2022 became central to the public debate. What did they establish?
* Who had killed the people in the street
+ That dark shapes lay where bodies were later filmed while Russian forces still held the town
* That the scene had been staged after Russian troops left
= Dated imagery fixes when something was present. It cannot by itself say who was responsible: that needed other evidence.

# Unit 2 · How images are made

## The four resolutions
Every image is a trade-off between four kinds of resolution:

| Resolution | What it measures | Examples |
|---|---|---|
| **Spatial** | The size of one pixel on the ground: the ground sample distance (GSD) | MODIS 250 m–1 km; Sentinel-2 10 m; PlanetScope about 3 m; the sharpest commercial satellites about 30 cm |
| **Spectral** | How many bands of light are recorded, and how narrow they are | A phone camera: 3 (red, green and blue); Landsat 8 and 9: 11; Sentinel-2: 13, from blue to short-wave infrared |
| **Temporal** | How often the same place is imaged | MODIS and VIIRS daily; Sentinel-2 every five days or less; commercial satellites when tasked |
| **Radiometric** | How finely brightness is recorded | 8 bits give 256 levels; Sentinel-2's 12 bits give 4,096 |

**Spatial resolution** is the one people notice, and the one most often over-read. A pixel records the average of everything inside it, so an object smaller than a pixel blends into its surroundings (a "mixed pixel"). A very bright or hot object can still change a pixel enough to be **detected**, such as a gas flare in a 375 m pixel or a ship on a dark sea, but to **recognise** what it is you need several pixels across it, and to **identify** its exact type a dozen or more. Haze, motion, compression and the optics also blur detail, so GSD is a best case.

Intelligence agencies rate how much an image can show on the **National Imagery Interpretability Rating Scale (NIIRS)**, from 0 to 9. Each step up roughly halves the ground resolution:

| NIIRS | Ground resolution, roughly | You can |
|---|---|---|
| 1 | over 9 m | Tell runways from taxiways at a large airport |
| 2 | 4.5–9 m | Pick out large buildings such as hospitals and factories |
| 4 | 1.2–2.5 m | Identify large fighter aircraft by type |
| 6 | 0.4–0.75 m | Tell apart models of small helicopters |
| 8 | 0.1–0.2 m | See the rows of rivets on a large aircraft |

! Worked example: A 40-foot shipping container is 12.2 m long and 2.4 m wide. At Sentinel-2's 10 m it spans about one pixel lengthways and a quarter of one across: at best a faint change in a pixel or two. At PlanetScope's 3 m it is about four pixels by one, a small bright bar. At 50 cm it is about 24 by 5 pixels, plainly a container; at 30 cm, about 40 by 8.

The resolutions pull against each other. A sensor with fine pixels sees a narrow strip of ground, so it revisits less often unless it is one of many satellites, while the daily global coverage of MODIS and VIIRS comes with coarse pixels. Free imagery is mostly 10 m or coarser; sharper imagery is mostly commercial. Three cautions:
- **Zooming in adds no detail.** Beyond the native resolution, a map simply draws bigger pixels.
- **"AI enhancement" invents detail.** Super-resolution models produce plausible texture that the sensor never recorded. It may help a display; it is never evidence.
- **Pan-sharpening** merges a sharp black-and-white (panchromatic) band with coarser colour bands, as Landsat does to reach 15 m. It is standard and documented, but say when you have used it.

? On Sentinel-2's 10 m imagery, how would a 40-foot shipping container appear?
* As a clear rectangle you could measure
+ At best as a faint change in one or two pixels, not a recognisable shape
* It could never affect the image at all
= At 12.2 by 2.4 m it is about one pixel long and a quarter of a pixel wide, so it blends into its surroundings.

? A website offers to sharpen 10 m imagery to 1 m with artificial intelligence. Can you cite the sharpened image as evidence?
* Yes, if the website is well known
* Yes, provided you label it as enhanced
+ No: the extra detail is generated by the model, not observed by the sensor
= Detail finer than the sensor's resolution is a guess. Use enhanced images, if at all, only for display, and say so.

## Optical, infrared and radar
**Passive** sensors record energy coming from the surface: reflected sunlight, or the heat the surface gives off. **Active** sensors send out their own energy and record what comes back.

| Kind | Records | Works | Good for | Limits |
|---|---|---|---|---|
| Visible (true colour) | Reflected red, green and blue light | By day, without cloud | What the eye would see | Cloud, haze, smoke, darkness |
| Near- and short-wave infrared | Reflected light just beyond red | By day, without cloud | Vegetation, water, burn scars; seeing through haze and thin smoke | As above |
| Thermal infrared | Heat emitted by the surface | Day and night | Fires, warm outflows, working industry | Coarse from space: Landsat's is 100 m |
| Night lights | Faint visible light at night | Clear nights | Electricity, settlements, gas flares, lit fishing fleets | Moonlight, cloud, snow, twilight |
| Radar (SAR) | Echoes of microwave pulses it sends | Day and night, through cloud | Floods, ships, ground movement, damage | Not a photograph: it takes practice to read |

**False colour** shows invisible bands as visible colours. Leaves reflect near-infrared strongly, so in the classic colour-infrared view (near-infrared shown as red) healthy vegetation glows red. In short-wave infrared composites, such as the MODIS bands 7-2-1 view in PRP, water is dark blue to black, vegetation green, bare soil brown, ice and snow cyan and fresh burn scars a deep red-brown, while thin smoke almost disappears. Indices turn bands into numbers; the best known measures vegetation:

$ NDVI = (near-infrared − red) ÷ (near-infrared + red)

It runs from −1 to 1: water is negative, bare ground near zero and dense, healthy vegetation 0.6 or more.

**Synthetic aperture radar (SAR)** works differently. A radar satellite such as Sentinel-1, whose microwaves are about 5.5 cm long, looks sideways at the ground and measures **backscatter**, the share of its pulse that returns:
- Smooth surfaces such as calm water and tarmac reflect the pulse away like a mirror, so they look dark. Floods, and oil slicks that calm the sea, stand out as dark patches.
- Rough surfaces such as fields and forests look grey.
- Corners and metal (buildings, ships, vehicles) bounce the pulse straight back and look very bright.
- The image is grainy ("speckle"), tall objects lean towards the satellite ("layover"), slopes facing it look squashed and bright, and hills hide the ground behind them ("radar shadow").

Two radar images taken from the same position add more. **Interferometry (InSAR)** measures ground movement to within centimetres, and a loss of **coherence**, the similarity between the two images, marks surfaces that changed in between. The researchers Corey Scher and Jamon Van Den Hoek used free Sentinel-1 coherence to map likely building damage across Gaza week by week from late 2023, checking their results against UNOSAT's assessments from very-high-resolution imagery.

! Rule of thumb: Radar is not a photograph. Bright means rough, angular or metallic, and dark means smooth; read a radar image beside an optical image of the same place.

? Why can Sentinel-1 image a flood under thick cloud when Sentinel-2 cannot?
+ It sends out its own microwave pulses, which pass through cloud
* It flies below the cloud
* It carries a sharper camera
= Radar is an active sensor at wavelengths that cloud barely affects; optical sensors depend on sunlight reaching the ground and coming back.

? On a radar image of a harbour, bright points are scattered across a dark sea. What are they most likely to be?
* Patches of calm water
* The shadows of clouds
+ Ships, whose metal hulls and decks reflect the pulse back to the satellite
= Calm water reflects the pulse away and looks dark, while ships act as corner reflectors and look bright. Cloud barely affects radar at this wavelength.

## Open and commercial imagery
The free missions are the analyst's foundation:

| Mission | Sensor | Pixel | Revisit | Since | Terms |
|---|---|---|---|---|---|
| Sentinel-2 (EU Copernicus) | Optical, 13 bands | 10–60 m | Every 5 days or less | 2015 | Free and open |
| Sentinel-1 (EU Copernicus) | C-band radar | About 5 × 20 m | 6–12 days | 2014 | Free and open |
| Landsat 8 and 9 (USGS and NASA) | Optical and thermal | 15–100 m | 8 days together | 1972, for the series | Public domain |
| MODIS on Terra and Aqua (NASA) | Optical and thermal, 36 bands | 250 m–1 km | Daily | 2000 | No restrictions |
| VIIRS on NOAA-20 and NOAA-21 (and Suomi NPP until 2 November 2026) | Optical, thermal and night lights | 375–750 m | Daily | 2012 | No restrictions |
| NISAR (NASA and ISRO) | L-band radar (and S-band) | 3–10 m | 12 days | 2025 | Free |

The fleets change. Sentinel-1B failed at the end of 2021; Sentinel-1C (launched in December 2024) and Sentinel-1D (November 2025) have taken over from it and from Sentinel-1A, whose mission ended in June 2026, and since 24 June 2026 the new pair has given a six-day repeat again. Sentinel-2C took over from 2A in January 2025. MODIS's two satellites have drifted from their original pass times as their missions near their end, and NASA plans to stop collecting MODIS data in 2027, leaving VIIRS as the successor; Suomi NPP's data stop on 2 November 2026, and NOAA-20 and NOAA-21 carry VIIRS on. NISAR, launched in July 2025, released its first calibrated data to the public in July 2026; its longer radar wavelength sees deeper into forests.

Where to find them:
- The **[Copernicus Browser](https://browser.dataspace.copernicus.eu)**: Sentinel-1, -2 and -3 and Landsat, by date, with cloud filters and ready-made views. Sentinel Hub's EO Browser, which many older guides still describe, shut on 20 March 2026, and this is its free replacement.
- **[NASA Worldview](https://worldview.earthdata.nasa.gov)**: the daily MODIS and VIIRS images, fires and night lights.
- **USGS EarthExplorer**: every Landsat scene since 1972, and declassified CORONA film.
- **Google Earth Engine**: whole archives analysed in the cloud, free for non-commercial work within monthly quotas.
- **Esri World Imagery Wayback** and **Google Earth Pro's historical imagery**: dated sub-metre captures to look at, and to republish only as their providers' terms allow.

**Commercial imagery** is sharper and costs money: Planet (PlanetScope at about 3 m almost daily, SkySat at about 50 cm), Vantor (formerly Maxar, down to about 30 cm), Airbus (Pléiades Neo, 30 cm), and radar satellites from ICEYE, Capella and Umbra that see through cloud at under a metre. Some providers publish open data: Vantor's Open Data programme releases images of disasters under CC BY-NC 4.0, and Umbra and Capella share radar scenes under CC BY 4.0. Commercial imagery is **licensed, not sold**: a typical licence lets you view it and publish limited, credited extracts for the purposes it names, but not pass on the files.

**Access can vanish.** US rules held US companies' imagery of Israel to 2 m until 2020, and still hold it to 40 cm. In March 2025 the US government suspended Ukraine's access to the US-funded commercial imagery service run by Maxar (now Vantor) for about a week. In 2026, during the war with Iran, Planet delayed new imagery of the Middle East first by four days, then by 14 days, and in April, at the US government's request, withheld it indefinitely; it eased the hold over Iran on 1 July, but at the last report, in late August, most of the Gulf was still withheld. Google Earth blurs or degrades some sensitive sites. Archives released in full under fixed public policies, such as Copernicus and Landsat, are the dependable baseline, so learn to get the most from them.

! Rule of thumb: Start coarse and daily to learn when something happened, use Sentinel at 10 m to see what happened, and look for sharper archive or commercial images to identify it. Note every image's date, source and licence as you go.

### In PRP: choosing a product in the Imagery tab
1. Open [Imagery](#/oi/geoint/imagery) and pick a **Product**: VIIRS (NOAA-20, NOAA-21, or Suomi NPP for days up to 2 November 2026) or MODIS (Terra or Aqua) in true colour, MODIS bands 7-2-1 in false colour, or one of the night-lights products. The **This view** panel gives each product's pixel size and the local time it was taken, checks whether your day has imagery and offers the nearest day that does.
2. Zoom in only as far as the pixels allow: at 250–750 m you will see towns, rivers, fields, smoke, floods and burn scars, not buildings.
3. For sharper views, use **Open the same place in**: the Copernicus Browser's Sentinel-2 (colour or short-wave infrared), Sentinel-1 radar and pan-sharpened Landsat 8–9, each with a date window ending on your day, as well as NASA Worldview, Esri Wayback, Google Earth, USGS EarthExplorer and LandsatLook.
4. Read the **Sharper, commercial imagery** panel for the open-data programmes and their licences.

? You need to find roughly which day, three years ago, a large reservoir began to drain. Where should you look first?
+ Daily MODIS or VIIRS images, to bracket the day, before turning to sharper scenes
* A single very-high-resolution commercial image
* Google Earth's 3D buildings
= Daily coarse imagery tells you when, cheaply and for free; sharper but rarer scenes then show what happened.

? What does a typical commercial imagery licence allow?
* Copying the original files and passing them on
* Any use at all, once you have paid
+ Viewing the imagery and publishing limited, credited extracts for the uses the licence names
= Commercial imagery is licensed rather than sold outright. Read the terms before you publish, and keep the credit with every image.

# Unit 3 · Reading an image

## The elements of interpretation
Photo interpreters have long taught a set of clues, the **elements of interpretation**. Use them deliberately and in order: first orient yourself (where north is, the scale, the date and the direction of the sun), then read the scene from the landscape down to the object.

| Element | Ask | Example |
|---|---|---|
| **Site** | Where in the landscape is it? | A harbour on a sheltered bay; a radar on a hilltop; a power station beside a river or the sea |
| **Association** | What lies next to it, and what goes with it? | Cooling towers, a switchyard and a coal yard make a power station; silos and rail sidings a grain terminal |
| **Pattern** | How are things arranged? | Identical tents in rows; evenly spaced shelters at an airfield; the circles of pivot irrigation |
| **Shape** | What outline and form does it have? | Runways are long and straight; railways curve gently and roads tightly; a cooling tower is round, with a waisted profile |
| **Size** | How big is it, absolutely and against things you know? | A 40-foot container is 12.2 m long; a football pitch about 105 × 68 m; a tennis court 23.8 m |
| **Shadow** | What profile and height does its shadow reveal? | A water tower's mushroom-shaped shadow beside a silo's straight one |
| **Tone and colour** | How bright, and what colour? | Wet soil darker than dry; new concrete bright; a fresh burn scar black |
| **Texture** | Is the surface smooth or rough, fine or coarse? | Calm water and tarmac smooth; forest canopy rough; an orchard finely dotted |

Add **time** as a ninth element: the same place across seasons and years, the subject of Unit 4.

**Shadows** deserve special care. They often give the only clue to height in a vertical image, telling a tall structure from a flat one, but they hide whatever lies inside them, and in a vertical image every sun shadow must point the same way: one at odds with the rest suggests a composite.

Two examples of the elements at work:
- **Tone and pattern.** During the dry July of 2018, two local researchers flying drones over the Boyne Valley noticed rings of greener crop in a field near Newgrange. Buried ditches and post-holes hold more moisture, so the crop above them stayed green: they had found a previously unknown henge about 150 m across. Crop marks like these reveal buried archaeology across Ireland and Britain in dry summers.
- **Association and absence.** In 2020 BuzzFeed News reporters located internment camps in Xinjiang partly by noticing where the Chinese map service Baidu had blanked out its imagery, then examining those places on other imagery for high walls, internal fences and watchtowers. The work won a Pulitzer Prize in 2021. What has been hidden can itself be a clue.

! Worked example: A walled rectangle about 180 × 90 m sits on a riverbank. Inside are six circles about 25 m across with long shadows, so they are tall cylinders rather than ponds; a rail spur ends beside them and a pipe runs to a jetty. Site, shape, shadow and association together say fuel depot.

? From directly above, a water tower and a storage tank both look like circles. Which element best tells them apart?
* Tone
+ Shadow, which shows each structure's side profile
* Texture
= A vertical view flattens shapes, but a shadow cast sideways reveals the profile, such as a water tower's bowl on a narrow stem.

? In a dry summer, a ring of greener crop appears in a wheat field and fades after rain. What is the most likely explanation?
+ A buried ditch that holds more moisture, such as an archaeological feature
* A fault in the satellite's sensor
* A newly laid pipeline
= Buried ditches keep the soil damper, so the crop above them stays greener in a drought: a classic crop mark.

## Detection, identification and confidence
Interpretation moves through steps, each needing more detail and more evidence:
1. **Detection**: something is there.
2. **Recognition**: what general kind of thing it is, such as a vehicle, an aircraft or a building.
3. **Identification**: its exact type or function.
4. **Description**: how many, in what condition, doing what.

The traps are well known:
- **Look-alikes**: greenhouses, solar panels and tents; spoil heaps and earthworks; cloud shadows, burn scars and wet fields; plastic sheeting and water.
- **Decoys and camouflage**: before D-Day in 1944 the Allies built dummy tanks and landing craft for a fictitious army aimed at Calais, and both sides in the war in Ukraine have used dummy launchers and aircraft. Real heavy equipment usually leaves tracks, needs supporting vehicles and fuel, and moves; decoys often do not.
- **Geometry**: an image taken off to one side ("off-nadir") shows the sides of buildings and makes tall objects lean, so compare like with like.
- **Processing**: compression blocks, sharpening halos, colour fringes from pan-sharpening, and seams in mosaics. A cloud-free basemap is stitched together from many dates, so it shows no single moment.
- **Yourself**: you see most readily what the caption told you to expect. Describe the scene before you read the claim, or hide it, and where you can, ask a colleague to read the image blind.

Keep a consistent ladder of confidence for identifications:

| Call | Meaning |
|---|---|
| **Possible** | Consistent with the identification, but other explanations remain open |
| **Probable** | Most features fit and the alternatives are unlikely |
| **Confirmed** | Identified directly and corroborated by independent evidence |

Use these words for what something is, and estimative language for judgements about what will happen or why (the OSINT course's lesson on [biases and estimative language](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Dbiases-and-estimative-language)). Write the observation and the inference separately: "Observed: six objects about 7 m long, in two rows behind earth banks. Assessed: probably self-propelled guns, from their size, the gun-like shadows and the tracks leading to them." Annotate a copy and keep the clean original beside it.

### In PRP: practising interpretation
1. In [Measure & geolocate](#/oi/geoint/measure), set the **Base** to **Imagery** (Esri World Imagery: sub-metre in many places, but stitched from captures of different dates, none shown on the map) or **Sentinel-2** (a cloud-free 10 m mosaic made in 2025), and zoom into a port, an airport and a power station you know. Name each element you use.
2. Check sizes with the **Distance** and **Area** tools against the [known sizes](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dhardware%26s%3Dhardware-known-sizes-for-measuring-in-imagery) in the Hardware Guide.
3. Use [Features](#/oi/geoint/features) as an answer key, since OpenStreetMap often names what you are looking at, and for dated, sharper captures open the place in Esri Wayback or Google Earth from the [Imagery](#/oi/geoint/imagery) tab's links.

? An image shows four tank-shaped objects in a muddy field, with crisp shadows but no track marks around them. What is the best call?
* Confirmed tanks, because the shape is right
* Certainly decoys
+ Possible tanks at most: real tanks would usually leave tracks, so decoys remain a live alternative
= Missing tracks lower your confidence without proving deception; look for other dates, supporting vehicles and movement.

? Why is a cloud-free mosaic, such as a web map's satellite layer, weak evidence of what a place looked like on a particular day?
+ It is stitched together from many images taken on different dates
* Its resolution is always too coarse
* Mosaics are always altered to hide sensitive sites
= Basemaps and cloudless mosaics are composites. When the date matters, use a single dated scene.

# Unit 4 · Change over time

## Before and after: change detection
Comparing images of the same place is the oldest IMINT technique and still the most powerful. It is also the easiest to get wrong, because most differences between two images are not events. Compare like with like:
- **The same sensor and processing**, or at least the same resolution and bands.
- **The same season**: crops, leaves, snow, river levels and the height of the sun all change through the year.
- **A similar time of day and viewing angle**, so that shadows and the lean of tall objects match. Sun-synchronous satellites help, because they pass over each place at about the same local time.
- **Aligned images**: a shift of one pixel makes every edge look like a change.

Then rule out **false change**: cloud and cloud shadow, haze, snow, harvest and ploughing, tides and reservoir levels, wet ground after rain, and the seams of a mosaic.

The methods, from simplest to most demanding:
- **Look**: swipe between two images, flick from one to the other, or animate a series.
- **Difference an index**: compute an index for each date and subtract one from the other. For fire, the normalised burn ratio pairs near-infrared, which healthy plants reflect strongly, with short-wave infrared, which bare and burnt ground reflects strongly:

$ NBR = (NIR − SWIR) ÷ (NIR + SWIR);   dNBR = NBR before − NBR after

! Worked example: Before a fire, a Sentinel-2 pixel reflects 0.30 in near-infrared (band 8A) and 0.10 in short-wave infrared (band 12): NBR = 0.20 ÷ 0.40 = 0.50. After it, the values are 0.15 and 0.25: NBR = −0.10 ÷ 0.40 = −0.25. So dNBR = 0.50 − (−0.25) = 0.75: high severity on the widely used scale, which runs 0.10–0.27 low, 0.27–0.44 moderate-low, 0.44–0.66 moderate-high and above 0.66 high.

- **Radar change**: changes in backscatter and losses of coherence (Unit 2) work through cloud and at night.
- **Classification**: sorting the pixels of each date into land-cover classes and comparing them, for example with the Semi-Automatic Classification Plugin for QGIS described in the [Software Cookbook](#/oi/geoint/cookbook).

**Bracketing.** Imagery shows that something changed between two observations, not when. Record the last clear image without the change and the first image with it, report that window, and narrow it with other sources: daily coarse imagery, fire detections, posts, official notices. If the window includes cloudy days, say so.

? You compare a June image of farmland with a January image and see large changes in colour. What should you suspect first?
+ Seasonal change in crops and vegetation rather than an event
* A wildfire
* A fault in the satellite
= Comparing images from the same season removes most natural change, which would otherwise swamp the signs of real events.

? The last clear image without a new embankment is dated 3 May and the first with it 11 May. What can you report?
* It was built on 11 May
* It was built on 7 May, halfway between the two
+ It was built, or at least begun, between 3 and 11 May
= Imagery brackets a change between two observations. Report the window, and narrow it with other evidence if you can.

## Time series: seasons, night lights and fires
A single pair of images can mislead; a long series shows what is normal for the place and the time of year, so that an anomaly stands out from the seasons. A field's vegetation index rises and falls with its crop every year, and a field abandoned in a war misses its season. A river spreads every spring, and a flood is a rise far outside that range.

**Night lights.** The Day/Night Band of the VIIRS instruments, recording since early 2012, is sensitive enough to record city lights, gas flares, fires and the brightly lit fishing fleets that work at night. NASA's **[Black Marble](https://blackmarble.gsfc.nasa.gov)** products correct its readings for moonlight, the atmosphere and the viewing angle, and the daily version fills cloudy nights from earlier clear ones. They showed the blackouts in Puerto Rico after Hurricane Maria in 2017, in Texas during the winter storm of February 2021, and in Ukraine after the strikes on its power grid from October 2022. Read them with care:
- Moonlight, cloud and snow all change brightness; snow can make a darkened town look brighter.
- Gap-filling can copy an earlier night's lights into a cloudy night, so look at the uncorrected Day/Night Band image of that night as well.
- Around midsummer, at Ireland's latitude and further north, the sky is not dark enough at the time of the night-time pass, so for weeks either side of the solstice the daily products have no fresh observations: expect gaps, or older values carried forward.
- Compare like with like: the same month in earlier years, and nights with a similar moon.

**Fires.** VIIRS (375 m pixels) and MODIS (1 km) detect unusual heat, and NASA's **[FIRMS](https://firms.modaps.eosdis.nasa.gov)** maps the detections, usually within three hours of a satellite's pass. Each detection carries a time, a confidence level and its fire radiative power, a measure of intensity.
- A detection means heat, not a cause: farmers' stubble fires, wildfires, gas flares, steel plants and military strikes all register.
- Satellites pass at fixed times (the VIIRS satellites at about 01:30 and 13:30 local solar time), so short fires between passes, and fires under cloud, are missed.
- Heat that recurs at one spot night after night is usually industrial.
- Check the same place in the same season of earlier years before calling anything unusual. The Economist's tracker of the fighting in Ukraine worked on this principle, flagging fires that the usual pattern for that place and season did not explain.

### In PRP: before and after, lights and fires
1. In [Imagery](#/oi/geoint/imagery), tick **Before/after swipe**, set the two dates and drag the divider, or focus it and use the arrow keys. The presets show what to look for: [the Kakhovka reservoir draining after the dam was breached on 6 June 2023](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dimagery%26preset%3Dkakhovka), [the Aral Sea in 2000 and 2025](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dimagery%26preset%3Daral), [the Indus floods of 2022 in false colour](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dimagery%26preset%3Dindus), [the Houston blackout of February 2021](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dimagery%26preset%3Dhouston) and [the Los Angeles fires of January 2025](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dimagery%26preset%3Dla-fires), with fire detections on top.
2. For night lights, set **Black Marble** beside the unprocessed **Day/Night Band** of the same night, and check the moon and the cloud before you call a blackout. For nights after 2 November 2026, when Suomi NPP's data stop, choose the NOAA-20 Black Marble.
3. In [Fires & hazards](#/oi/geoint/hazards), set the **Fire day**, compare the VIIRS and MODIS detections, and step back through earlier days and the same season in earlier years. Add your own free NASA FIRMS key to list the last 24 hours to 7 days with times and intensities. The same map shows USGS earthquakes and GDACS disaster alerts, which are often the first sign that imagery is worth checking.
4. Record each pair's dates and product, and confirm anything important at 10 m through the Imagery tab's Copernicus Browser links.

? Night-lights imagery shows a city much darker than a week ago. Before reporting a blackout, what should you check?
+ Cloud, moonlight and snow on both nights, and the raw Day/Night Band as well as the gap-filled product
* Only that the satellite was working
* Nothing, because darkening always means a power cut
= Brightness changes with cloud, moon, snow and processing, and gap-filling can carry lights over from earlier nights.

? Fire detections appear at the same industrial site on most nights for a year. What do they most likely show?
* A new fire every night
* A fault in the satellite
+ Persistent heat from industry, such as a gas flare or a steelworks
= Heat that recurs at one spot is usually industrial. Compare with the site's history before treating a detection as an event.

# Unit 5 · Geolocation

## From clues to candidate places
The OSINT course's lesson on [geolocation](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Dgeolocation) sets out the basic method; this unit takes it further. Work from the broad to the narrow, and write every clue down with a note of how strong it is:
1. **Climate and hemisphere**: vegetation, snow, soil colour, the style of roofs, and the sun, which outside the tropics stands due south at midday in the northern hemisphere and due north in the southern.
2. **Country**: script and language; which side of the road traffic keeps to; road markings, bollards, kerbs and signs; the shape and colours of number plates (for the country, never the owner); telephone codes and web addresses; shop chains; flags.
3. **Region and town**: terrain, coastline and rivers; architecture; landmarks such as churches, minarets, water towers, chimneys, masts and bridges; names on signs and shopfronts that you can search.
4. **The exact spot**: the geometry of a junction, the line of a kerb, the order of buildings along a street, the skyline, and alignments between features.

A sign with a searchable business name is strong; a kind of tree is weak. A clue that rules a region out is as useful as one that points to it.

Then narrow the search:
- Start from the claim, but test it rather than trust it.
- Draw the area the clues allow: a river with a ridge to its south, within sight of a motorway.
- Query the map for combinations of features, such as a water tower close to a railway station beside a river (Unit 8).
- Compare from above with satellite basemaps and Google Earth's 3D view, and with older dated imagery if the scene may since have changed.
- Compare at street level: Google Street View, Apple Look Around, Mapillary and KartaView, and national services such as Yandex in Russia, Baidu in China, and Naver and Kakao in South Korea. Coverage is patchy, and each panorama has its own date.

Beware of look-alikes. Standard designs repeat across whole countries (Soviet-era housing blocks, motorway service areas, chain stores), and images are often flipped, cropped or, increasingly, generated.

? Which clue usually narrows a photo's location the most?
* The kind of trees in the background
+ A shop sign with a business name you can search
* The weather
= Distinctive, searchable text and landmarks narrow the search sharply; vegetation and weather only rule out broad regions.

? The text on every sign in a photo reads backwards. What should you do first?
+ Mirror the image, since reposted copies are often flipped, and look again
* Assume the country writes from right to left
* Discard the photo as fake
= Flipped copies are common. Mirroring restores the text and the true layout before you compare the scene with maps.

## Matching and proving a location
Once you have candidates, test each until only one fits:
- **From above**: match the ground-level view to the overhead view, using building footprints and roof shapes, the road layout, trees, pitches and car parks. Mind the dates: the place may have changed since the reference image was taken, or since the photo.
- **At street level**: facades, signs, kerbs, poles and street furniture.
- **Terrain**: skylines change slowly and are hard to fake. Compare them with the 3D terrain in PeakVisor or Google Earth, or rebuild the scene in Blender with the BlenderGIS add-on; fSpy can recover the camera's position from straight lines in the photo. The [Software Cookbook](#/oi/geoint/cookbook) explains all three.

Then fix the camera's position:
- **Alignments**: two features that line up in the photo put the camera on the line through them, beyond the nearer one. This is a **line of position**, and two of them cross at the camera.
- **Field of view**: a phone's main camera covers about 65–75° across, so the features at the edges of the frame bound the view.
- **Line of sight**: the camera must be able to see what the photo shows, so check the terrain in between (Unit 7).

The standard of proof:
- **At least three independent matches**, of different kinds where possible (a building, a junction, a skyline), shown side by side with the matching features marked.
- Explain any differences, such as a new building, a felled tree or another season.
- Record the camera position as coordinates to five decimal places (about a metre) and in MGRS, with the view direction and the dates of the reference images you matched against.
- State your confidence, confirmed or probable, and let someone else reproduce the result from your notes.

! Worked example: A photo shows a domed church directly in front of a brick chimney: on the map, the line through the chimney and the dome, extended past the dome, runs west across a river. A second alignment in the photo, the west pier of a three-arched bridge in front of a mast on the hill beyond, gives a second line, which crosses the first on the riverbank 400 m west of the church. That is the candidate camera position: check the rest of the scene from there at street level.

### In PRP: geolocating with Features and Measure & geolocate
1. In [Features](#/oi/geoint/features), use **Find a place** to move to the area of the claim, choose a preset that makes a good landmark (places of worship, water towers, telecom masts and lighthouses under Landmarks for geolocation, or bridges and railway stations under Transport), and tick **Only within** to require a second feature nearby, for example [any place of worship no more than 200 m from a railway station](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dfeatures%26fp%3Dworship%26fn%3Dstations%26fnr%3D200). Run the query on the current view or around a point, or open it in Overpass Turbo.
2. In [Measure & geolocate](#/oi/geoint/measure), set the base to **Imagery** and check each candidate. For an alignment, use **Bearing** to measure from the farther feature to the nearer one, then choose **Bearing line**, click the nearer feature and add a line on that bearing, which is filled in for you: the camera lies somewhere along it. Add a second alignment, and the page marks where the lines cross. If you know the bearing on which the camera saw a landmark, from a compass heading in the metadata for example, click the landmark, enter that bearing and tick "seen from the camera".
3. Open the candidate in **Street level and 3D**: Mapillary, KartaView, Google Street View, PeakVisor (looking along your last bearing), Google Earth and OpenStreetMap.
4. Draw a **Distance** line from the camera to the subject and open **Elevation profile and line of sight** to check that the view is possible.
5. Copy the coordinates and MGRS reference from the readout, and work through the Software Cookbook's [Recipe 1: geolocate a photo](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dcookbook%26s%3Dcookbook-recipe-1-geolocate-a-photo).

? What makes a geolocation convincing to other people?
* One striking landmark
* The reputation of the person who found it
+ Several independent features matched side by side, with coordinates and reference-image dates they can check
= Independent matches rule out coincidence, and published coordinates let anyone reproduce the result.

? In a photo, a church spire stands exactly in front of a factory chimney. What does that give you?
* The time the photo was taken
+ A line of position: the camera stood on the line through the chimney and the spire, beyond the spire
* The height of the camera
= Two features in line define a line on the map; a second alignment that crosses it fixes the camera's position.

# Unit 6 · Chronolocation

## The sun as a clock
Two angles give the sun's position: its **azimuth**, the compass bearing measured clockwise from true north, and its **elevation** (or altitude), its height above the horizon. Shadows point directly away from the sun, so a shadow's bearing plus or minus 180° is the sun's azimuth, and an upright object's height against the length of its shadow on level ground gives the elevation:

$ sun elevation = arctan(object height ÷ shadow length)

How the sun moves:
- In the northern hemisphere outside the tropics it rises in the east (north-east in summer, south-east in winter), stands due south at **solar noon** and sets in the west.
- Its noon height is about 90° minus the latitude plus the sun's **declination**, which runs from −23.4° in late December to +23.4° in late June. In Dublin (53.35° N) that is about 13° at midwinter and 60° at midsummer.
- Solar noon is rarely 12:00 by the clock. It shifts with longitude within the time zone, with summer time, and by up to about 16 minutes through the year. In Dublin it falls at about 13:25 in summer; in western Spain, which keeps Central European Time, the summer sun is highest between about 14:30 and 14:40.

What a shadow can tell you:
- **Its direction alone, on a known date**: the time, to within minutes if the direction is good.
- **Its elevation alone**: two times on any day, one in the morning and one in the afternoon.
- **Both together**: a time of day and, across a year, usually two dates, mirrored either side of the summer solstice. Season, foliage and weather decide between them.

! Worked example: A photo is geolocated to Eyre Square in Galway (53.2743, -9.0490). A 6 m lamp post casts a 6.1 m shadow across level paving, pointing north-east (45°). So the sun was in the south-west (225°), about 44.5° high (arctan 0.98). Searching the whole year finds two matches: about 15:40 local time (14:40 UTC) around 1 May, and about 15:47 (14:47 UTC) around 11 August. Trees in full, dark leaf favour August, since in early May many are only coming into leaf. A 10% error in the shadow's length moves each date by eight to ten days, and a 4° error in its direction moves the time by about ten minutes and the dates by a few days, so report a window, not a minute. [Open the place in Measure & geolocate](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dmeasure%26ll%3D53.2743%2C-9.049%26z%3D17%26mp%3D53.2743%2C-9.049) to try it.

Measuring a shadow in a ground photo takes care:
- **Direction**: relate the shadow to lines whose bearings you can measure on a map, such as a kerb, a wall or the edge of a road.
- **Length**: measure on level ground against objects of known size. Lengths along the line of sight are foreshortened, so shadows running across the view measure best.
- **Pitfalls**: ground that slopes towards the sun shortens a shadow and ground that slopes away lengthens it; heights are often guesses, so test a range; the sun is about half a degree across, so the tips of shadows are blurred; refraction lifts the sun slightly near the horizon; and in the tropics the noon sun can be north or south of overhead.

? In Ireland, a shadow points due north at about midday. Where is the sun?
+ Due south, close to its highest point of the day
* Due north
* In the east, soon after sunrise
= Shadows point away from the sun, and in Ireland the sun crosses due south at solar noon.

? Why do a shadow's direction and length usually match two dates in a year?
* Because the clocks change twice a year
+ Because the sun's daily path in the weeks before the summer solstice mirrors its path in the weeks after
* Because the Earth has two hemispheres
= With both angles, the matching dates fall either side of the solstice; foliage, harvests and weather choose between them.

## Other clocks and the metadata trap
Shadows are not the only clock. Combine them with these:
- **Satellite pass times.** Sun-synchronous satellites cross the equator at fixed local solar times: Landsat 8 and 9 at about 10:00, Sentinel-2 at about 10:30, VIIRS at about 13:30 (and again at about 01:30 at night), and Sentinel-1 around dawn and dusk. Away from the equator the local time shifts, by more than people expect: over Ireland, Sentinel-2 passes at about 11:15 local solar time. MODIS was launched to pass at about 10:30 on Terra and 13:30 on Aqua, but both satellites have since drifted: by 2026 Terra was crossing the equator at about 09:00 or earlier, and Aqua at about 15:30 or later. So always take the time from each scene's metadata, which records the exact acquisition time in UTC, and cite that.
- **Weather.** Cloud, rain, wet roads, snow and wind can be checked against archived observations, such as airport weather reports and the records of Met Éireann and other national weather services, and against that day's satellite images of cloud.
- **Season.** Leaves, blossom, crops and harvest, snow, and seasonal decorations and events.
- **Change on dated imagery.** A building under construction, a road not yet surfaced, a block since demolished: dated captures in Google Earth's historical imagery or Esri Wayback can bracket when a photo could have been taken.
- **The moon.** Its phase narrows a night-time photo to a few days in each month.

**The metadata trap.** A satellite operator's timestamp is reliable; a ground photo's is only a lead.
- A file's EXIF time is whatever the camera's clock said: often wrong, set to another time zone, or edited. Only newer devices record the time-zone offset.
- Most platforms strip metadata on upload, so its absence proves nothing.
- A post's time is when it was uploaded, not when it was filmed, and platforms usually display it in your own time zone, not the poster's.
- Re-uploads give old pictures new dates, so find the earliest appearance (the OSINT course's lesson on [reverse image search and metadata](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Dreverse-image-search-metadata-and-synthetic-media)).
- Work in UTC, convert only at the end, and say which zone you mean.

### In PRP: the Sun and shadows and chronolocation panels
1. In [Measure & geolocate](#/oi/geoint/measure), click the place with **Inspect** or paste its coordinates into **Go to coordinates**. The **Sun and shadows** panel estimates the time zone from the position: check it, and whether summer time applied.
2. Set the claimed **Day** and **Local time** to read the sun's azimuth and altitude, and the direction of shadows and their length for the object height you enter. The chart shows the sun's altitude through the day.
3. On sharp imagery, use the **Shadow** tool: click the base of an upright object, then the tip of its shadow, and the direction and length go into the chronolocation form. For a ground photo, type in the direction, height and length you estimated.
4. In **When was it taken? Chronolocation**, search the chosen day, 15 days either side or the whole year, with tolerances for direction and altitude. Widen the tolerances to see how far the answer moves, and choose a match to see it in the calculator.
5. Check that day's cloud in the [Imagery](#/oi/geoint/imagery) tab, read any metadata on your own device in the OSINT Dashboard's [Media check](#/oi/osint/media) (as a lead only), and follow the Software Cookbook's [Recipe 2: date an image from its shadows](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dcookbook%26s%3Dcookbook-recipe-2-date-an-image-from-its-shadows).

? A photo's metadata says it was taken at 09:12. What do you actually know?
* That it was taken at 09:12 local time
* That it was taken at 09:12 UTC
+ Only what the camera's clock recorded, which may be wrong, in another time zone or edited
= Metadata is a lead to test against shadows, weather and other evidence, never proof on its own.

? A Sentinel-2 scene shows trucks parked at a depot. What can its metadata tell you that a ground photo's often cannot?
+ The time of acquisition in UTC, recorded by the satellite's operator
* Who owns the trucks
* Where the trucks went next
= Satellite scenes carry the operator's acquisition time, which makes them reliable clocks; a ground photo's time is only as good as the camera's clock.

# Unit 7 · Measurement and terrain

## Distance, area, bearing and height
Measure on the Earth, not on the screen. Web maps use the **Web Mercator** projection, which keeps local shapes but stretches distances by 1 ÷ cos(latitude) and areas by the square of that:

$ metres per pixel = 156,543 × cos(latitude) ÷ 2^zoom   (for standard 256-pixel map tiles)

At zoom 17 a pixel covers 1.19 m at the equator but 0.71 m in Dublin (53.35° N), where distances are drawn 1.68 times as long as at the equator and areas 2.8 times as large. That is why Greenland looks as big as Africa, which is about fourteen times larger. Tools that measure on the Earth's surface rather than the screen avoid the problem: PRP's measure distances and bearings on the WGS84 ellipsoid and areas on an equal-area sphere.
- **Distance.** The shortest route is a great circle (a geodesic on the ellipsoid). A straight line on a Mercator map is a rhumb line of constant bearing, which is longer except along the equator or a meridian.
- **Bearing.** There are three norths. **True** north, which the dashboard uses, points to the geographic pole. **Magnetic** north, a compass's, differs by the declination, a few degrees at most in Ireland and Britain today but more elsewhere, and it changes year by year (the Hardware Guide's note on [true, magnetic and grid north](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dhardware%26s%3Dhardware-true-magnetic-and-grid-north)). **Grid** north, on UTM and the Irish and British grids, parts from true north by an angle that grows with distance from each grid's central meridian, reaching a degree or more. A back bearing is the bearing plus or minus 180°.
- **Area.** Measure on the ellipsoid or in an equal-area projection, and give a margin. On a 10 m image an outline is uncertain by about half a pixel all round: for a site 500 m square, that is 2,000 m of edge × 5 m, about ±1 ha of its 25 ha, or ±4%.
- **Known sizes.** Containers, pitches, courts, parking bays and traffic lanes give a scale in photos and images. Use several, not one, and measure along the ground.
- **Counting pixels.** Length = number of pixels × GSD, uncertain by half a pixel or more at each end.

**Height from a shadow in imagery.** Seen from above, the length of a shadow on level ground and the sun's elevation at the moment of capture (given in the scene's metadata, or computed for its time and place) give the height:

$ height = shadow length × tan(sun elevation)

! Worked example: On a 50 cm image taken when the sun stood 38° high, a chimney's shadow on level ground measures 82 m from base to tip. Height = 82 × tan 38° = 82 × 0.78 = 64 m. Allowing a metre either way on the length and half a degree on the elevation, it stands between about 62 and 66 m.

**Lean.** An image taken off to one side shows tall objects leaning away from the satellite by about their height × tan(off-nadir angle): a 40 m tower seen 25° off nadir leans about 19 m, enough to put its top over the next street or over part of its own shadow.

? You measure a building on a web-map screenshot of Oslo (60° N), using the zoom level's metres-per-pixel figure for the equator. How far out are you?
* Not at all: web maps are true to scale everywhere
+ About twice too long, because Web Mercator stretches distances by 1 ÷ cos(latitude)
* About half too short
= At 60° the Mercator scale factor is 2. Measure with tools that work on the ellipsoid instead.

? On an image taken when the sun stood 45° high, a mast's shadow on level ground is 30 m long. How tall is the mast?
* About 21 m
* About 42 m
+ About 30 m
= Height = shadow length × tan(sun elevation) = 30 × tan 45° = 30 × 1 = 30 m.

## Terrain, profiles and line of sight
**Elevation models** come in two kinds. A **digital surface model (DSM)** includes the tops of trees and buildings; a **digital terrain model (DTM)** is the bare ground; "DEM" covers both.
- The free global models are **SRTM**, flown on the Space Shuttle in February 2000, at about 30 m between 60° N and 56° S; the **Copernicus DEM**, made from the German TanDEM-X mission, at 30 and 90 m; and ASTER's GDEM. In practice SRTM and the Copernicus DEM behave as surface models: forests and cities raise them.
- Their heights are uncertain by several metres, more on steep slopes and in forests and cities, with gaps in deep valleys. National lidar surveys, where they exist and are open (England's, for example), reach 1 m or finer.
- **Hillshade** lights a model from one direction, by convention the north-west, to show relief. It is a rendering, not a photograph.

An **elevation profile** samples the ground's height along a line. A **line of sight** is clear if the straight line from the observer's eye to the target clears the ground everywhere, once you add the observer's height (an eye about 1.7 m above the ground), the target's height, the curve of the Earth and **refraction**, which bends light slightly downwards and lets you see a little further.

$ hidden by the curve ≈ distance² ÷ (2 × Earth's radius);   horizon ≈ 3.57 × √(eye height in m) km

Over 10 km the curve hides about 7.8 m, or 6.8 m with normal refraction. An eye 1.7 m above a calm sea sees about 4.7 km to the horizon, or about 5 km with refraction, and the top of a 30 m mast stays in view out to about 26 km.

Uses: can a camera on this ridge see the valley floor? Which hilltops overlook a road? Where could a photographer have stood? A **viewshed** maps everything visible from one point, and QGIS can compute it. Terrain matters for chronolocation too: hills delay sunrise and hasten sunset, so a valley can fall into shade while the sun is still above the true horizon.

! Caution: A terrain model leaves out most buildings, walls and trees, and a surface model may include trees felled since it was made. A clear line of sight means "possible", not "proven": confirm it with imagery or a photo from the spot.

### In PRP: measuring in the Measure & geolocate tab
1. In [Measure & geolocate](#/oi/geoint/measure), **Inspect** a point to read its decimal degrees, DMS, MGRS and terrain height (±10–30 m), or go to coordinates you paste in.
2. **Distance** (click points, then double-click, press Enter or choose Finish) gives the ellipsoidal length in kilometres, miles and nautical miles, with a table of each segment's length and bearing when there are several. **Area** gives the area and perimeter, and **Bearing** the true bearing, back bearing and distance.
3. With a distance line drawn, open **Elevation profile and line of sight**, enter the observer's and the target's heights above the ground, and read whether the line is clear and, if not, where it is blocked. The profile allows for curvature and refraction, and a table view lists the numbers.
4. Tick **Hillshade** to see the relief, and switch the base between Map, Imagery and Sentinel-2 to measure what you can see.
5. Keep the captions' limits in mind: the elevation data have cells of 30–90 m in most places, and buildings and trees are missing.

? The line-of-sight tool shows a clear view between a hilltop and a village 8 km away. What can you conclude?
* The village is certainly visible from the hilltop
+ The terrain does not block the view, but buildings and trees, which the model leaves out, still might
* Nothing, because terrain models are useless at that distance
= Terrain models capture hills, not every wall and tree. Treat a clear result as possible, and confirm it with imagery or a photo from the spot.

? Roughly how far away is the horizon for someone standing on a beach with eyes 1.7 m above a calm sea?
* About 50 km
+ About 5 km
* About 500 m
= It is about 3.57 × √1.7 ≈ 4.7 km without refraction, and about 5 km with normal refraction.

# Unit 8 · Maps, coordinates and data

## Coordinates, datums and projections
A position needs coordinates, the **datum** they refer to (the model of the Earth's shape and where it sits) and, on a flat map, the **projection**.

**Datums.** GPS works in **WGS84**. Europe's surveyors use **ETRS89**, which is fixed to the Eurasian plate and has drifted from WGS84 by about 2.5 cm a year since 1989: nearly a metre by now. Older national datums differ far more. Latitude and longitude on OSGB36, the datum behind Britain's National Grid and older Ordnance Survey maps, differ from WGS84 by roughly 60 to 140 m depending on the place, enough to put a point in the next street, and maps published in China must use an obfuscated system (GCJ-02) that shifts positions by a few hundred metres.

**Formats.** The same point, the Spire on O'Connell Street in Dublin, in three common forms:

| Format | Example |
|---|---|
| Decimal degrees (DD) | 53.34981, -6.26031 |
| Degrees, minutes and seconds (DMS) | 53°20′59.3″N 6°15′37.1″W |
| Degrees and decimal minutes, used at sea and in the air | 53°20.989′N 6°15.619′W |

- **Order.** People usually write latitude first, but GeoJSON, KML and many programming tools want longitude first. Swapped, Dublin's coordinates land in the Indian Ocean.
- **Precision.** Each decimal place of a degree is ten times finer:

| Decimal places | Step in latitude | Enough for |
|---|---|---|
| 1 | 11 km | A region |
| 2 | 1.1 km | A town |
| 3 | 110 m | A neighbourhood |
| 4 | 11 m | A building |
| 5 | 1.1 m | A doorway |
| 6 | 11 cm | Surveying |

Steps of longitude shrink towards the poles: four decimal places of longitude are 6.6 m in Dublin. Give five decimal places for a geolocation, and never more precision than the evidence supports.

**Projections.** Every flat map distorts something. **Web Mercator** (EPSG:3857) keeps local shapes but not sizes (Unit 7). **UTM** divides the world into 60 zones, each 6° of longitude wide, with metric coordinates and little distortion within a zone; Dublin is in zone 29 north (EPSG:32629). National grids include **Irish Transverse Mercator** (EPSG:2157) and the **British National Grid** (EPSG:27700). Use an equal-area projection for statistics of area, and always record the EPSG code.

**MGRS**, the Military Grid Reference System used by NATO forces and many emergency services, writes a UTM position in a compact, unambiguous form:

$ 29U PV 82352 14684  =  zone 29, latitude band U, 100 km square PV, easting 82352 m, northing 14684 m

| Digits after the square | Precision |
|---|---|
| 4 (2 + 2) | 1 km |
| 6 (3 + 3) | 100 m |
| 8 (4 + 4) | 10 m |
| 10 (5 + 5) | 1 m |

So 29U PV 823 146 is the 100 m square that contains the Spire. References are truncated, not rounded: each one names the south-west corner of its square. [Open the Spire in Measure & geolocate](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dmeasure%26ll%3D53.34981%2C-6.26031%26z%3D17%26mp%3D53.34981%2C-6.26031) to see all three forms and the MGRS reference side by side.

? The coordinates 53.3498, -6.2603 are pasted into a tool that expects longitude first. Where does the point land?
* Exactly where intended
* Elsewhere in Ireland
+ In the Indian Ocean, near the Seychelles, because latitude and longitude have been swapped
= GeoJSON, KML and many programming tools put longitude first, and swapped values move a point thousands of kilometres.

? How precise is a position given to four decimal places of a degree of latitude?
* About 1 km
+ About 11 m
* About 1 cm
= A degree of latitude is about 111 km, so 0.0001° is about 11 m. Steps of longitude shrink towards the poles.

## Gazetteers, OpenStreetMap and Overpass
**Gazetteers** are directories of place names with their coordinates and types:
- **[GeoNames](https://www.geonames.org)**, worldwide and free under a Creative Commons licence, and the US National Geospatial-Intelligence Agency's **GEOnet Names Server**, for places outside the US, with variant and historical spellings.
- **Wikidata**, where each place has a Q-number linked to its other names and to everything else recorded about it; PRP's [Encyclopaedia](#/rs/encyclopedia) keys every entry to one.
- National gazetteers such as Ireland's Placenames Database, **[logainm.ie](https://www.logainm.ie)**, with the official Irish and English forms, and Great Britain's **OS Open Names**.

Names are slippery. They differ by language and script (Baile Átha Cliath and Dublin; Kharkiv, Kharkov and Харків), by politics (Derry and Londonderry) and over time (Dnipropetrovsk became Dnipro in 2016; Artemivsk became Bakhmut the same year, though Russian officials still call it Artyomovsk), and many places share a name (Ireland alone has a great many called Newtown). Search every variant, and record the identifier, not only the name.

**OpenStreetMap** (OSM), founded in 2004, is a map of the world built by volunteers and published under the Open Database Licence, with the credit "© OpenStreetMap contributors". It is made of **nodes** (points), **ways** (lines and areas) and **relations** (groups of them), each described by tags of the form key=value, such as amenity=hospital, railway=station, power=substation or landuse=military.
- Coverage is dense in much of Europe and patchy elsewhere, and features are tagged as volunteers chose: an empty search is not evidence that nothing is there.
- Every edit is public, with its date and author, so a feature's history shows when it appeared and changed, and exposes vandalism. Some edits are wrong on purpose.
- Some things are left out deliberately. After Russia's full-scale invasion in 2022, Ukraine's OSM community asked mappers to stop editing the country altogether, fearing that fresh edits could help attackers plan.

**Overpass** answers queries on OSM data by tag and place, and **[Overpass Turbo](https://overpass-turbo.eu)** is its interactive website. This query finds every railway station within 300 m of a water tower in the map view:

$ nwr["man_made"="water_tower"]({{bbox}})->.towers; nwr["railway"="station"](around.towers:300); out center;

**Nominatim**, OSM's place search, asks for no more than one search a second and no searching as you type, and PRP keeps to that.

### In PRP: querying OpenStreetMap in the Features tab
1. In [Features](#/oi/geoint/features), use **Find a place** to move the map; it searches once, when you press Search.
2. Choose a preset under **Features**: transport (airfields, helipads, ports, stations, bridges, border crossings), energy and water (power plants, substations, wind turbines, fuel depots, dams), civil (hospitals, and military areas as tagged in OSM) or landmarks for geolocation. Search the **Current view**, or **Around a point** within 1–25 km, and tick **Only within** to require another feature nearby.
3. **Run query**, click a point for its tags, read the table and **Download GeoJSON** to keep a copy; note the date of the OSM data shown above the table.
4. Copy the **Overpass QL** the page wrote, or open it in **Overpass Turbo** to refine it. The **Overpass server** menu says who runs each public server: the operator sees the area and the features you ask about.
5. Try it with the [airfields around Dublin](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dfeatures%26ll%3D53.4%2C-6.25%26z%3D10), then on your own area.

? An Overpass query for hospitals in a rural district returns nothing. What does that show?
* That the district has no hospital
+ Only that none is mapped and tagged that way in OpenStreetMap
* That the server is broken
= OpenStreetMap holds what volunteers have mapped and how they tagged it; an empty result is not evidence of absence.

? Why record a place's GeoNames or Wikidata identifier as well as its name?
+ Names change and vary by language and spelling, and many places share one; the identifier pins down a single place
* The identifier gives the place's population
* Search engines need it
= Identifiers resolve ambiguity in place names, as registration numbers do for companies.

# Unit 9 · Verification and reporting

## Documenting imagery evidence
Record, for every image you rely on:

| Record | Why |
|---|---|
| Provider, mission and sensor | Grades the source and tells others where to look |
| Product and processing level | Raw or corrected; pan-sharpened, mosaicked or neither |
| Scene or product identifier | Lets anyone retrieve exactly the same image |
| Acquisition date and time, in UTC | The clock of your evidence |
| Viewing and sun angles, and cloud cover | How shadows, lean and gaps should look |
| Where and when you obtained it | The catalogue, the address and the date of download |
| Licence and credit | What you may publish, and how to credit it |
| File name and SHA-256 hash | Proves the file is unaltered since you saved it |
| What you did to it | Crops, contrast stretches, false colour, annotations |

For photos and video, add the provenance (the earliest upload you found, who posted it, archived copies) and what the metadata says; for map data, the query and the date of the data.

Preserve as you go:
- Keep originals read-only and work on copies; annotate a copy and keep the clean version.
- Web maps and online globes change their imagery without notice. When you rely on one, capture the screen with the imagery date and credit visible, and note the date you looked.
- Keep the project files, queries and scripts, so that the analysis can be run again. The OSINT course's lesson on [archives and preservation](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Darchives-and-preservation) covers web captures and hashing in more detail.

The **[Berkeley Protocol on Digital Open Source Investigations](https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source)** (from the UN Human Rights Office and UC Berkeley's Human Rights Center: launched in 2020, published in 2022) treats verification as three questions: the **source** (who made, posted or hosts the material), the **technical data** (its metadata and file properties) and the **content** (whether what it shows fits independent evidence such as imagery, weather, shadows and other footage). It lays out an investigation in six phases: online inquiries, a preliminary assessment, collection, preservation, verification and investigative analysis. Open-source evidence now reaches courts: in 2017 the International Criminal Court issued an arrest warrant for the Libyan commander Mahmoud al-Werfalli based largely on videos posted online. To be usable, a record must show where each item came from, who handled it and that it is unchanged.

? Which details matter most when you cite a satellite image as evidence of an event?
* The colour scheme used to display it
* The size of the file
+ The provider, the scene identifier and the acquisition date and time in UTC
= Without the scene's identity and time, nobody can retrieve the same image or check when it was taken.

? Under the Berkeley Protocol, verifying a piece of material means checking which three things?
+ Its source, its technical data and its content
* Its resolution, its colours and its file format
* Its publisher, its price and its licence
= The protocol asks who produced or posted the material, what its technical data show and whether its content fits independent evidence.

## Uncertainty and the imagery report
Say how sure you are about each dimension:
- **Where**: the position's margin in metres, and whether the geolocation is confirmed or probable.
- **When**: a window, from shadows ("between 14:25 and 14:55 UTC") or from imagery ("between the images of 3 and 11 May").
- **What**: possible, probable or confirmed, with the alternatives you considered.
- **How much**: measurements with margins, such as "6.2 ha, give or take 0.5 ha".

For judgements, use estimative language and keep likelihood and confidence apart, as in the OSINT course's lesson on [biases and estimative language](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Dbiases-and-estimative-language). Choose verbs with care: "shows" for what is visible, "is consistent with" when other explanations remain, "indicates" when the evidence points one way. Never write that satellite images "prove" something: images are evidence, and it is the analysis that stands or falls. Describe objects before you name them: "six objects about 7 m long" comes before "probably self-propelled guns".

An imagery report, in order:
1. **Bottom line up front**: what happened, where and when, how likely, how confident.
2. **Key judgements**, each with its evidence.
3. **Figures**: annotated images beside clean copies, each with a scale bar, a north arrow, coordinates and a caption of the form "Figure 1. What it shows, where and when. Source and credit."
4. **Method**: sources, tools and settings, so that others can reproduce the work.
5. **Alternatives, gaps and indicators**: cloudy days, limits of resolution, and what would change your mind.
6. **What you withheld and why**: coordinates coarsened or details left out for safety (Unit 10).

! Caption example: Figure 2. A new embankment about 120 m long (arrow) at a quarry, seen on 3 May (left) and 11 May 2026 (right). Sentinel-2 Level-2A true colour, 10 m pixels. Contains modified Copernicus Sentinel data 2026. (A fictional example.)

### In PRP: keeping the record and building the figure
1. Fingerprint each file you download in the OSINT Dashboard's [Archives](#/oi/osint/archives) tab, which computes its SHA-256 hash in your browser, and log each finding in its [Case notebook](#/oi/osint/notebook) with the image's provider, scene and date, the source grade, an archived link and the hash. Export the notebook with your report.
2. Copy coordinates and MGRS references from [Measure & geolocate](#/oi/geoint/measure), and each image's product, date and credit from the caption under the [Imagery](#/oi/geoint/imagery) map.
3. Build map figures with the Software Cookbook's [Recipe 4: make a map figure for a report](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dcookbook%26s%3Dcookbook-recipe-4-make-a-map-figure-for-a-report), with a scale bar, a north arrow, an inset map, a caption and credits.
4. Before you publish, work through the [checklist](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dlaw%26s%3Dlaw-checklist-before-you-publish-an-image-or-map) at the end of Law & ethics.

? Which sentence best reports an identification made from 50 cm imagery?
* "Satellite images prove the army has deployed artillery here."
+ "Six objects about 7 m long, in two rows behind earth banks, are probably self-propelled guns."
* "There is artillery here."
= Describe what is visible, then give the interpretation with an explicit level of confidence.

? Why place an unannotated copy beside an annotated image in a report?
+ So that readers can check the evidence without your arrows and labels steering their eyes
* Because annotations are not allowed in evidence
* To make the report longer
= Annotations help readers find features, but readers should be able to see for themselves that the features are there.

# Unit 10 · Law, ethics and safety

## Privacy, drones and sensitive sites
**Privacy.** Both the EU GDPR and the UK GDPR treat a picture as personal data once someone in it can be identified, whether by face, number plate, home or context, and the same goes for a precise location tied to a person.
- Satellite images rarely identify anyone on their own, but combined with other data (a car on a known driveway, a garden, a daily routine) they can. Drone and street-level images often identify people directly.
- Publishing to the world is not purely personal activity (EU Court of Justice, _Lindqvist_, 2003), and nor is a home camera that covers a public street (_Ryneš_, 2014). Exemptions for journalism and academic work are set by each country (in Ireland, section 43 of the Data Protection Act 2018) and are narrower than many people assume.
- Minimise: crop to what the finding needs, blur any faces, plates and house numbers it does not, and delete raw imagery of people once the work is done.

**Drones.** Flying legally and recording lawfully are separate tests, and you must pass both.
- In the EU, including Ireland, Regulation (EU) 2019/947 sets the rules for the Open category: below 120 m, within sight, never over assemblies of people, and only where national geographical zones allow. Register as an operator if your drone has a mass of 250 g or more or carries a camera, unless it is a toy. In Ireland you register and train with the Irish Aviation Authority, and check its geographical zones (airports, prisons, military sites and more) before every flight; the Hardware Guide's [Ireland section](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dhardware%26s%3Dhardware-ireland-the-irish-aviation-authority) has the steps.
- In the UK, since 1 January 2026 the Civil Aviation Authority has required a Flyer ID for flying drones that weigh 100 g or more, and an Operator ID if the drone weighs 100 g or more and has a camera, or weighs 250 g or more.
- In the US, the FAA requires drones over 250 g, and every drone flown under Part 107, to be registered and to broadcast Remote ID; recreational pilots pass a free safety test (TRUST), and other pilots need a Part 107 certificate.
- Remote ID broadcasts include where the pilot is standing (or, from an add-on module, where the drone took off), so treat what you receive as personal data and never use it to find a pilot.

**Sensitive sites.** Many countries make it an offence to photograph or record military sites, whatever satellites already show:
- **Ireland**: section 9 of the Official Secrets Act 1963 makes it an offence to obtain, record or publish information about the Defence Forces (their numbers, equipment, disposition or movements), their operations or the defence of any place, in a manner prejudicial to the safety or preservation of the State.
- **UK**: under the National Security Act 2023 it is an offence to inspect a prohibited place, including by photographing it, for a purpose prejudicial to the UK's safety or interests.
- **US**: 18 U.S.C. § 795 forbids photographing designated defence installations without permission, and § 797 forbids publishing such photographs.
- **Elsewhere** the rules can be stricter and enforced against visitors. Poland tightened its law in 2025, and in 2001 Greece arrested a group of British and Dutch plane-spotters at a military air show and convicted them of espionage before they were acquitted on appeal.

**Radio rules.** GEOINT touches signals in two places, and both are receive-only.
- Weather satellites broadcast pictures for anyone to receive, and a cheap receiver will pick them up (see the [SIGINT course](#/oi/osint-training/course-sigint) and the SIGINT Dashboard's [weather-satellite station](#/oi/sigint?at=sigint%2Findex.html%23tab%3Dcookbook%26s%3Dpipeline-wxsat)). In Ireland, apparatus that can only receive (television sets aside) is exempt from wireless telegraphy licensing (S.I. No. 197 of 2005), on condition that it causes no harmful interference and is not used to divulge the content of messages, but anything that transmits needs a licence or exemption from ComReg.
- A drone's control and video links are not broadcasts. Trying to intercept, decode or decrypt them can be an offence: in Ireland under the Criminal Justice (Offences Relating to Information Systems) Act 2017, in the UK under the Wireless Telegraphy Act 2006 and in the US under the Wiretap Act. Jamming or spoofing satellite navigation is also a crime: in Ireland the Wireless Telegraphy Acts forbid using jammers and an order of 2011 (S.I. No. 66 of 2011) bans selling, hiring out, making or importing them; in the UK deliberate interference is an offence under the 2006 Act; in the US the FCC prohibits operating, marketing or selling any jammer. Analysts study interference from public data, as in the SIGINT Dashboard's [GNSS](#/oi/sigint/gnss) tab, and never cause it.

? You fly a 249 g camera drone in Ireland as a hobby. Must you register as an operator?
* No, because it weighs under 250 g
+ Yes: in the EU a drone carrying a camera must be registered, whatever its weight, unless it is a toy
* Only if you fly over people
= Registration applies to drones of 250 g or more and to lighter ones with a camera or other sensor able to capture personal data, toys excepted.

? A military base is plainly visible on free satellite imagery. Does that make it lawful to photograph it from the road outside?
* Yes, because satellites already show it
* Yes, provided you never publish the photo
+ Not necessarily: many countries make photographing military sites an offence, whatever is visible from space
= Rules on photographing military sites apply on the ground regardless of satellite imagery, and some apply even to photos that are never published.

## Licences, publication and safety
**Licences and terms.** Credit every image and map as its licence asks, and keep to each service's terms:

| Source | Terms | Credit |
|---|---|---|
| Copernicus Sentinel | Free and open, any use, including commercial | "Contains modified Copernicus Sentinel data [year]" |
| Landsat | US public domain | "Landsat imagery courtesy of the U.S. Geological Survey" |
| NASA GIBS and Worldview (MODIS, VIIRS) | Free of restrictions; NASA asks to be credited | "NASA Worldview" or "NASA EOSDIS GIBS" |
| Commercial: Planet, Vantor, Airbus and others | Licensed; usually small, credited extracts only | Exactly as the licence words it |
| Open-data programmes | Vantor Open Data CC BY-NC 4.0; Umbra and Capella CC BY 4.0 | The provider's name and the licence |
| Google Earth and Maps | Editorial and other non-commercial use is often allowed, provided Google's attribution stays visible | Google and the imagery provider, as shown on screen |
| OpenStreetMap | Open Database Licence: credit, and share alike for derived databases | "© OpenStreetMap contributors" |
| Mapillary and KartaView | CC BY-SA 4.0 | The photographer, the platform and CC BY-SA |

Services have rules of their own: Nominatim allows one search a second, the public Overpass servers ask for small queries, FIRMS keys are personal, and Earth Engine's free use is limited to non-commercial projects. The dashboard's [licences table](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dlaw%26s%3Dlaw-imagery-and-map-licences) gives more detail.

**Publish responsibly.** Lawful and public is not the same as harmless.
- **The mosaic effect.** In 2018 the global heatmap of the fitness app Strava, built from users' public activity, revealed the outlines of military bases and patrol routes. Points harmless on their own add up.
- **War.** Publishing where defending forces are can get people killed; Ukraine made unauthorised publication of its forces' movements a crime in March 2022. Delay, coarsen or leave out current positions.
- **People at risk**: refuges, shelters, safe houses, witnesses, minorities and children. **Fragile places**: archaeological sites (satellite images of Apamea in Syria showed the ancient city pitted with looters' holes during the civil war) and the nests of rare species. **Vulnerabilities**: the weak points of dams, power grids and water supplies.
- **How to publish less**: blur, crop, give a town or a 1 km grid square (a four-digit MGRS reference) instead of a doorway, delay, or share the detail only with editors, the authorities or the people concerned.
- Accountability cuts the other way too: exposing a hidden camp or a mass grave can be the whole point of the work. Weigh who is helped and who is endangered, and say what you withheld.

**Stay safe.**
- Do not go and look. Approaching military sites, critical infrastructure, protests or conflict zones with a camera can get you arrested or worse; imagery exists so that you do not have to.
- Strip location data from your own photos before you share them (see the Software Cookbook's section on [ExifTool](#/oi/geoint?at=geoint%2Findex.html%23tab%3Dcookbook%26s%3Dcookbook-exiftool-with-gps-geotagging)), and check what your screenshots reveal about you.
- Imagery of disasters and war can be distressing: limit your exposure, take breaks and talk to someone.
- The Berkeley Protocol's ethical principles (dignity, humility, inclusivity, independence and transparency) apply to imagery as to any other open source; the OSINT course's lesson on [doing no harm and staying safe](#/oi/osint-training/course-osint?at=fe%2Flearning.html%3Fcourse%3Dosint%26lesson%3Ddoing-no-harm-and-staying-safe) puts them into practice.

### In PRP: the Law & ethics tab
1. Read the GEOINT & IMINT Dashboard's [Law & ethics](#/oi/geoint/law). It covers data protection when people are in the picture, the rules on flying and on access to land, the places where photographing a military site is a crime, imagery licences and safe publication.
2. Keep its four ground rules: public sources, on their own terms; places, events and infrastructure, never private people; corroboration before publication; and no harm.
3. Answer every question in its checklist before you publish an image or a map.
4. For drones, read the [Hardware Guide](#/oi/geoint/hardware)'s rules for the EU, Ireland and the UK; for receivers, read the SIGINT Dashboard's [Law & ethics](#/oi/sigint/law).

? Your analysis would show the exact location of a women's refuge visible on satellite imagery. What should you do?
+ Leave it out or reduce the precision: the building is visible, but publishing its location could endanger the people in it
* Publish it, because the imagery is public
* Publish it with a warning
= Lawful and public is not the same as harmless. Protect people at risk by publishing less.

? In 2018 a fitness app's public heatmap revealed the layout of military bases. What does this illustrate?
* That fitness apps are illegal
+ The mosaic effect: individually harmless data combined into sensitive information
* That satellite imagery is no longer needed
= Aggregated location data can expose what no single point reveals. Consider what your combined map shows before you publish it.

# Unit 11 · Capstone exercises

## Capstone 1: the camp in the valley
**Scenario (fictional).** On 14 June a regional news channel in Country E posts a photo captioned "New army camp outside Velmora, built this week". Taken from high ground, it shows a river valley crossed by a railway viaduct of seven arches, a church spire beside the viaduct, a line of pylons climbing the far slope and, on the valley floor, a fenced rectangle of tents, trucks and fresh earth banks with a 20-foot shipping container at one corner. Velmora lies at about 48° N, 30 km from a tense border. **Your task**: establish where and when the photo was taken, whether the camp is new, how large it is and what it probably is, using at least four tabs of the GEOINT & IMINT Dashboard; finish with a BLUF and a decision about what to publish.

### Model answer
1. **Provenance**: reverse searches find no earlier copy; the channel says a reader sent it, and the file carries no metadata, which proves nothing either way. Preserve it, hash it and log it (source F; the information not yet graded).
2. **Candidates**: in Features, bridges on major roads and railways within 500 m of a place of worship, searched within 25 km of Velmora, returns nine bridges. On the Imagery base in Measure & geolocate, only one is a seven-arch railway viaduct over a river, with a power line climbing the slope beyond it.
3. **Proof**: the number of arches, the spire's position beside the third arch and the angle of the pylon line all match, and the ridge line matches PeakVisor's panorama from the hill north of the viaduct. Two alignments in the photo, the spire in line with the third pylon and the viaduct's east end in line with a notch in the far ridge, give lines of position that cross on that hillside, 2.1 km from the camp, and the elevation profile shows a clear line of sight from there to the valley floor. Record the camera position in decimal degrees and MGRS, and the view direction.
4. **Time of year**: the end of the container, 2.59 m high, casts a shadow about 3.1 m long on level ground (scaled against the container's 6.06 m side), pointing along the camp's main track, which runs at 65° on the satellite image. So the sun stood at 245° and about 40° high (arctan 0.84). At Velmora's latitude the sun is there around 30 April and again around 11 August; in mid-June it would be about 50° high at that bearing, and the shadow would be only about 2.1 m long. The photo shows stubble and round bales in the fields, which fits August, not late April: it was most likely taken in early to mid-August, ten months before it was posted.
5. **When the camp appeared**: daily MODIS and VIIRS pixels (250–750 m) are far too coarse for a site of a few hectares, so turn to Sentinel-2 through the Imagery tab's Copernicus Browser links. The last clear image of undisturbed fields was taken on 9 July last year and the first showing cleared ground and earth banks on 14 July; the camp appears on every clear image since.
6. **Size and nature**: the Area tool gives about 6.3 ha of cleared ground (give or take 0.5 ha at 10 m). Rows of identical tents, earth banks around vehicle parks and a track to the railway fit a military logistics camp; a construction camp or a camp for displaced people would not usually raise earth banks around its vehicles. Call it probable, not confirmed.
7. **Publication**: publish the correction (the photo is old and the camp is not new), the bracketing dates and the measured area, with credited Sentinel-2 figures. Do not identify or locate the photographer, who stood near a military site in a country that may forbid photographing it, and blur any faces. Run through the Law & ethics checklist, and ask whether exact coordinates add anything: "beside the railway viaduct outside Velmora" supports the finding, and in a crisis precise coordinates could help an attacker.

! BLUF: The photo shows a real camp beside the railway viaduct outside Velmora, but the camp is not new: its ground was cleared between 9 and 14 July last year, and the photo itself was most likely taken in August last year, ten months before it was posted as "built this week". The camp covers about 6 ha and is probably a military logistics site. We have high confidence in the location and in the camp's age, and moderate confidence in the date of the photo and the purpose of the camp.

? What showed that the photo was not taken in the week it was posted?
* The file had no metadata
* Daily MODIS images showed no camp
+ The container's shadow was far too long for mid-June at that latitude, and the stubble fitted August
= Missing metadata proves nothing, and MODIS pixels are too coarse for a small camp; the geometry of the shadow and the season settle it.

? Why does the model answer give the camp's construction as a window between two Sentinel-2 dates?
+ Imagery shows only that the change happened between the last clear image without it and the first with it
* Sentinel-2 images carry no dates
* Building a camp always takes five days
= Bracketing is the honest way to date a change from imagery; other sources may narrow the window.

## Capstone 2: the night the river rose
**Scenario (fictional).** After three days of storms, the governor of a province in Country F says on 4 March that "no homes have been flooded" along the River Lenna. Local posts show water in the streets and say the power has been off for two nights in Upper Ford, Lower Ford and Hillcrest, three villages below the Lenna dam. Cloud covers the valley until 7 March. **Your task**: map the flooding and how it changed, estimate what was affected, check whether the lights went out and assess the governor's statement, using at least four tabs of the dashboard; finish with a BLUF and a note of what you would not publish.

### Model answer
1. **The broad picture**: in Imagery, MODIS bands 7-2-1 for 26 February, a clear day before the storms, and for 8 March, compared with the swipe, show dark water spread across the floodplain for about 25 km below the dam. At 250–500 m this shows the extent, not the streets.
2. **Through the cloud**: the Copernicus Browser's Sentinel-1 radar image of 5 March, compared with one taken from the same orbit on 21 February, shows a smooth, dark surface over about 38 km² that was dry before, including the fields around all three villages. Flooded streets can look bright rather than dark on radar, because water and walls bounce the pulse back, so the villages need checking separately.
3. **When the sky cleared**: Sentinel-2 on 8 March, at 10 m, shows water in the streets of Upper Ford and Lower Ford; Hillcrest is dry.
4. **Measurement and terrain**: in Measure & geolocate, the Area tool on the flood outline gives about 38 km², and allowing for the uncertain edges of the radar classification, between about 32 and 44 km². An elevation profile across the valley shows Upper and Lower Ford 2–4 m above the river and Hillcrest on a terrace about 9 m higher, which explains why it stayed dry.
5. **Infrastructure**: in Features, one of the valley's electricity substations lies inside the flooded area, which would explain the outage in both Fords; no hospital lies in the flooded area.
6. **Lights**: in Imagery, Black Marble shows the villages lit on the cloudy night of 5 March, but its gap-filling copied that from earlier clear nights. On the clear night of 7 March the Day/Night Band shows Upper and Lower Ford dark and Hillcrest lit.
7. **Independent checks**: Fires & hazards shows a GDACS flood alert for the basin, and the Copernicus Emergency Management Service's rapid mapping, an outline drawn independently of yours, broadly agrees with it.
8. **What not to publish**: the names and faces in residents' posts, the locations of the shelters where displaced families are staying, and any speculation about weak points of the dam. Credit "Contains modified Copernicus Sentinel data [year]" on every figure.

! BLUF: Floodwater from the River Lenna covered about 38 km² (32–44 km²) of the valley below the dam by 5 March, and on 8 March it was still in the streets of Upper Ford and Lower Ford, whose lights were out on the clear night of 7 March. The governor's statement that no homes were flooded is almost certainly (95–99%) wrong. Confidence is high in the extent and timing of the flood, and moderate in the number of homes affected, because 10 m imagery shows flooded streets, not the inside of houses.

? Why does the model answer rely on Sentinel-1 for 5 March rather than Sentinel-2?
* Sentinel-1 has sharper pixels than Sentinel-2
+ Radar sees through the cloud that covered the valley until 7 March
* Sentinel-2 does not image rivers
= Optical satellites need a clear sky; radar works through cloud and at night.

? Black Marble showed the villages lit on the cloudy night of 5 March. Why is that not evidence that the power was on?
* Black Marble cannot see villages
+ Its gap-filling can copy values from earlier clear nights into cloudy ones
* Floodwater reflects street lights upwards
= Compare gap-filled products with the unprocessed Day/Night Band of that night, and trust clear nights.
