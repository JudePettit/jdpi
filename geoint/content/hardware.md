---
title: Hardware Guide
dek: The physical side of geospatial work for hobbyists and independent analysts: drones and the rules for flying them in the EU, Ireland and the UK, cameras and lenses, GNSS positioning, receiving weather-satellite images yourself, computers and storage, and how the hardware and software fit together.
updated: 28 October 2026
scope: EU (EASA), Ireland, UK in brief
---

# Start here

You can do a great deal of GEOINT with no special hardware at all: a laptop, the free imagery in this dashboard and the tools in the [Software Cookbook](#tab=cookbook). Hardware earns its place when you need **your own** pictures (a drone survey of a flooded field you have permission to fly over, ground photos of a landmark), **better positions** than a phone gives, or **more computing** for photogrammetry and machine learning. Buy for the question you have, not the one you might have.

> [!NOTE] Not legal advice
> Aviation, privacy and data-protection rules differ between countries and change. The summaries below were checked on 28 October 2026; always read the regulator's current page before you fly.

# Drones

## Kinds of drone

| Kind | Typical weight | Good for | Limits |
|---|---|---|---|
| Mini camera drone | under 250 g | Practice, small sites, photos and video | Wind, short flights, small sensor |
| Consumer camera drone | 250 g–900 g | Better camera, mapping small areas | Registration and training needed |
| Prosumer or enterprise multirotor | 900 g–4 kg | Mapping, thermal or zoom cameras, RTK | Stricter category rules, cost |
| Fixed-wing or VTOL mapping drone | 2–10 kg | Large areas, long flights | Space to launch and land; often the Specific category |
| FPV (first-person view) | varies | Fast flying video | Usually beyond what the Open category allows without a spotter |

Sensors matter more than airframes. **RGB** cameras make maps and 3D models; **multispectral** cameras measure vegetation health; **thermal** cameras see heat (people, animals, leaks, fires), which raises extra privacy questions.

## EU and EASA rules: the Open category

Across the EU (and in Iceland, Liechtenstein, Norway and Switzerland) drones are regulated by EU Implementing Regulation 2019/947. Most hobby flying falls in the **Open category**: below **120 m** above the ground, in visual line of sight, not over assemblies of people, not carrying dangerous goods or dropping things, and only where the local **UAS geographical zones** allow.

| Subcategory | Which drones | Distance from uninvolved people |
|---|---|---|
| **A1**: over people | Class C0 (under 250 g), class C1 (under 900 g), and drones without a class mark under 250 g | May fly over uninvolved people (C1: minimise it), never over assemblies |
| **A2**: close to people | Class C2 (under 4 kg) | At least 30 m horizontally, or 5 m in low-speed mode; needs the A2 certificate |
| **A3**: far from people | Class C2, C3 and C4 (under 25 kg), and drones without a class mark from 250 g to 25 kg | No uninvolved people in the area; at least 150 m from residential, commercial, industrial or recreational areas |

- **Class marks.** New drones carry a class label, C0 to C4. Drones without one that were sold before 31 December 2023 (and privately built drones) can still fly: under 250 g in A1, otherwise in **A3** only.
- **Register as an operator** in your country of residence if your drone weighs **250 g or more**, or has a **camera or other sensor that can capture personal data** (unless it is a toy). You get an operator number to display on every drone and to load into its Remote ID.
- **Training.** For C1, C3 and C4 drones, complete the free **A1/A3 online training and test**. For A2 you also need the **A2 Certificate of Competency** (self-practical training plus a further exam). Under 250 g without a class mark, no training is required, but it is worth doing.
- **Remote ID.** C1, C2 and C3 drones broadcast their identity and position. Keep it switched on and loaded with your operator number.
- **Minimum age** is 16 in most countries (some allow from 12), with no minimum for toys and sub-250 g legacy drones.
- **Anything more** (heavier drones, beyond visual line of sight, over crowds) is the **Specific category** and needs an operational authorisation from your national authority.

## Ireland: the Irish Aviation Authority

- Register with the **IAA** if your drone is over 250 g **or has a camera**: create an account on [MySRS](https://iaa.mysrs.ie/auth/sign-up), verify your identity, complete the free online training (a short video and 40 questions, about 15 minutes; the certificate lasts five years), then register as an operator. Registration lasts **two years**; fees are in the IAA's schedule of charges.
- Registration is "not an approval to actually fly": you must still keep to the Open-category rules and the [UAS geographical zones](https://www.iaa.ie/general-aviation/drones/uas-geographic-zones), which restrict flying near airports, prisons, military sites and other sensitive places.
- The IAA's [drone pages](https://www.iaa.ie/general-aviation/drones) cover training, the A2 certificate and the Specific category. For privacy, see the Data Protection Commission's guidance in [Law & ethics](#tab=law).

## UK in brief: the Civil Aviation Authority

The UK left EASA and has its own, similar rules. From **1 January 2026**:

- A **Flyer ID** (pass the free online theory test, valid five years) is needed to fly any drone of **100 g or more**.
- An **Operator ID** (£12.34 a year, for people aged 18 or over) is needed for drones of **100 g or more with a camera**, and for all drones of **250 g or more**. Label every drone with it.
- New drones carry **UK class marks UK0 to UK6**; EU C-marks are recognised as the UK equivalents until the end of 2027.
- **Remote ID** applies to UK1, UK2, UK3, UK5 and UK6 drones from 2026, and from 1 January 2028 to UK0 drones with a camera of 100 g or more, UK4 and older drones.
- Follow the [Drone and Model Aircraft Code](https://www.caa.co.uk/drones/) and check flight restriction zones before every flight.

# Cameras and lenses

## Field of view and ground resolution

::: figure fov-gsd
How a camera's sensor width w, focal length f and height H above the ground set its field of view, its footprint on the ground and the ground sample distance (GSD), the size of one pixel on the ground.
:::

Three formulas cover most planning:

- **Field of view** = 2 × arctan(w ÷ 2f). With a 35 mm-equivalent focal length from the EXIF tag `FocalLengthIn35mmFormat`, the horizontal field of view is 2 × arctan(36 ÷ 2f₃₅).
- **Footprint width** on flat ground = H × w ÷ f.
- **Ground sample distance (GSD)** = footprint width ÷ image width in pixels.

**Worked example.** A 1-inch sensor (13.2 mm wide) behind an 8.8 mm lens (24 mm equivalent), 5,472 pixels across, flown at 100 m: footprint = 100 × 13.2 ÷ 8.8 = **150 m**; GSD = 150 m ÷ 5,472 ≈ **2.7 cm per pixel**; horizontal field of view = 2 × arctan(13.2 ÷ 17.6) ≈ **74°**. Halve the height and you halve the GSD, but need four times as many photos.

## Choosing and using a camera for mapping

- **Overlap:** plan about 75–80 % forward and 60–70 % side overlap. More for forests, crops and water, which match badly.
- **Shutter:** a mechanical or global shutter avoids the "rolling shutter" smear of fast-moving phone-style sensors; if yours has a rolling shutter, fly slower and turn on rolling-shutter correction in WebODM.
- **Exposure:** a shutter speed of 1/1000 s or faster stops motion blur; fix the focus at infinity and the white balance so all photos match.
- **Light:** overcast days give even light and short shadows; low sun gives long shadows that hide detail but help chronolocation.
- **Ground photos:** a phone's main camera is about 24–26 mm equivalent (a field of view around 70–75°). Note it: knowing the field of view lets you check a photo's viewpoint against a 3D model.

## Known sizes for measuring in imagery

| Object | Size |
|---|---|
| Shipping container, 20 ft | 6.06 × 2.44 m, 2.59 m high |
| Shipping container, 40 ft | 12.19 × 2.44 m, 2.59 m high |
| Football pitch (common size) | 105 × 68 m |
| Tennis court (doubles) | 23.77 × 10.97 m |
| Basketball court | 28 × 15 m |
| Car parking bay (Ireland, UK) | about 2.4 × 4.8 m |
| Motorway lane | about 3.5–3.75 m wide |
| Standard door | about 2.0–2.1 m high |
| Storey of a home | about 2.7–3.0 m |

Use several references, not one, and measure along the ground, not across a tilted roof.

# GNSS positioning and geotagging

## How accurate is a position?

| Source | Typical accuracy | Notes |
|---|---|---|
| Phone or camera GNSS | 3–10 m in the open; worse in cities | Dual-frequency phones do better; tall buildings reflect signals |
| Consumer drone GNSS in photo EXIF | 1–5 m | Good enough for a map that does not need to line up with others |
| Standalone GPS logger (GPX track) | 2–5 m | Geotag photos afterwards with ExifTool; sync the camera clock first |
| RTK or PPK with a base station | 1–3 cm | Needs a base on a known point, or a correction service |

## Geotagging your own photos

1. Set the camera clock carefully, and photograph a GPS or phone clock showing seconds at the start, so you can measure the offset later.
2. Record a track with a logger or phone app (one point a second is plenty).
3. Merge them with **ExifTool's** `-geotag` (see the [Software Cookbook](#tab=cookbook)), then check the positions on a map.
4. Phones and cameras that store the compass **heading** (`GPSImgDirection`) make each photo's view direction checkable. Compass headings are magnetic unless the device corrects them; see "True, magnetic and grid north" below.

## RTK, PPK and ground control

::: figure rtk
Real-time kinematic (RTK) positioning: a base receiver on a precisely known point and a rover (on a drone or a survey pole) track the same satellites. The base sends corrections, so the rover knows its position to a few centimetres; with post-processed kinematic (PPK), both log raw data and the corrections are applied after the flight.
:::

- **RTK** needs a live correction link: your own base station over radio, or a network service over the mobile internet (**NTRIP**). **PPK** needs only logs and is more forgiving of lost links.
- National reference-station networks (in Ireland run by Tailte Éireann, in Great Britain by Ordnance Survey) publish data for post-processing, and commercial services sell live corrections.
- **Ground control points** (marked targets measured with RTK) tie a drone map to the real world and let you report its accuracy. Use at least five, spread around the edges and the middle, and keep a few back as independent **checkpoints**.

# Weather-satellite images you receive yourself

You can receive images straight from weather satellites with a cheap software-defined radio. The easy analogue **APT** pictures ended in August 2025, when NOAA-15 and NOAA-19 were switched off; the main hobby target now is the Russian **Meteor-M** satellites' digital **LRPT** signal at 137 MHz, decoded with the free **SatDump**, using an RTL-SDR dongle and a V-dipole or QFH antenna. Geostationary satellites need a small dish and a low-noise amplifier at about 1.7 GHz.

The **[SIGINT Dashboard](prp://sigint/sigint/index.html#tab=cookbook&s=pipeline-wxsat)** covers the receivers, antennas, software (including [SatDump](prp://sigint/sigint/index.html#tab=cookbook&s=satdump)) and the legal points. For GEOINT, the value is independence: your own pictures of cloud, smoke and storms, at known times, to compare with NASA's daily images.

# Computers for photogrammetry and machine learning

| Job | What matters most | A sensible starting point |
|---|---|---|
| Browsing imagery, QGIS, this dashboard | A decent screen, 8–16 GB RAM | Any recent laptop |
| Photogrammetry, up to about 500 photos | CPU cores and RAM | 8+ cores, 32 GB RAM, 1 TB NVMe SSD |
| Photogrammetry, 1,000+ photos | RAM above all | 16+ cores, 64–128 GB RAM, 2 TB NVMe |
| Machine learning on imagery (segmentation, detection, change) | GPU memory | NVIDIA GPU with 12–24 GB VRAM (CUDA); Apple silicon works for smaller models |

- WebODM and ODM use mainly the **CPU and memory**; an NVIDIA GPU speeds up some steps. Other photogrammetry programs require an NVIDIA GPU.
- A desktop is cheaper and cooler than a laptop for long jobs. Cloud processing (for example WebODM Lightning, a paid service) avoids buying hardware for one-off big projects.
- Plan for power cuts and heat: long jobs run for hours.

# Storage for imagery

## How big is it?

| Data | Typical size |
|---|---|
| One Sentinel-2 L2A product (a 110 km tile, one date) | 0.5–1.2 GB |
| One Landsat 8–9 Collection 2 Level-2 scene | about 1 GB |
| One Sentinel-1 GRD radar scene | about 1–2 GB (SLC: 4–8 GB) |
| 500 drone photos (20 MP JPEG) | 5–10 GB |
| WebODM outputs for those photos | 2–10 GB |
| One hour of 4K drone video | 20–40 GB |

## Habits that save you later

- **Structure:** one folder per project, then per date and source, with `raw`, `work` and `out` subfolders. Never edit files in `raw`.
- **Integrity:** record a SHA-256 hash of every original (evidence must be shown to be unchanged) and keep a log of where each file came from.
- **Backups, 3-2-1:** three copies, on two kinds of media, one off-site.
- **Encryption:** turn on BitLocker (Windows), FileVault (macOS) or LUKS (Linux) for drives holding images of people or sensitive places.
- **Formats:** share rasters as **cloud-optimised GeoTIFF** (COG) and vectors as GeoPackage or GeoJSON.
- **Delete what you do not need**, especially imagery of people: data protection law expects it.

# How the hardware and software fit together

These are the three integration patterns most hobbyists use. Each is a chain: a weak link (a missed overlap, a wrong clock, a cloudy scene) spoils everything after it.

## Pattern 1: drone survey to map

::: figure drone-pipeline
Drone survey to map. Plan a grid flight with enough overlap, collect geotagged photos, process them in WebODM into an orthomosaic and elevation model, and bring the results into QGIS to measure and compare. RTK or PPK positions and ground control points improve accuracy.
:::

## Pattern 2: satellite catalogue to change report

::: figure satellite-pipeline
Satellite catalogue to report. Search a catalogue for two comparable scenes, download them, process them in SNAP or QGIS, detect change, and check it against true colour and ground or street-level evidence before reporting.
:::

## Pattern 3: field photo to verified location

::: figure photo-pipeline
Field photo to verified location. Read the original file's metadata with ExifTool, plot the position and view direction, then verify against the skyline, landmarks, shadows and street-level imagery. A mismatch sends you back to revise the position.
:::

# Other useful reference

## True, magnetic and grid north

Bearings in this dashboard are **true** (relative to the geographic North Pole). A phone or hand compass gives **magnetic** bearings, which differ by the **declination**: a few degrees in Ireland and the UK, more elsewhere, and changing every year. Look it up with NOAA's [magnetic field calculator](https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml) and add or subtract it. Map grids such as UTM have a third north, **grid north**, off true north by up to a few degrees away from the zone's central meridian. Phone compasses are typically good to 5–10°: calibrate them and keep away from cars and steel.

## A small field kit

- A phone with a camera app that records position and heading, plus a power bank.
- A notebook (paper does not run out of battery) and a pencil.
- A scale bar or an object of known size to include in close-up photos.
- A laser rangefinder and an inclinometer app, for distances and heights.
- High-visibility clothing near roads, and permission before you enter private land.

> [!SAFETY] Your safety comes first
> Do not go to places where you could be mistaken for a spy or a threat: military sites, critical infrastructure, protests and conflict zones. Tell someone where you are going, and see [Law & ethics](#tab=law) before you photograph anything sensitive.
