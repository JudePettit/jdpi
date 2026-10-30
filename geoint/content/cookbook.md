---
title: Software Cookbook
dek: The free tools that amateur and hobbyist analysts use for geospatial and imagery work, each with its official download source, install steps for your system, a first test that proves it works, the usual pitfalls and the legal points. Four recipes at the end combine them.
updated: 28 October 2026
scope: Windows, macOS and Linux
---

# How to use this cookbook

Each tool below has the same parts: what it answers, where to get it, how to install it on **Windows**, **macOS** or **Linux** (choose your system with the switch above), a **first test**, **pitfalls** and **legal notes**. The recipes at the end show how the tools fit together, and point to the dashboard tabs that do part of the job in your browser.

> [!SAFETY] Download only from the official source
> Every link here goes to the project's own site or its official repository. Avoid "download portals" and re-packaged installers: they are a common way to spread malware. Where a project publishes checksums (QGIS, GDAL, SNAP, ExifTool), compare them after downloading. Keep tools up to date, because file parsers such as image readers are a frequent target for attacks.

> [!NOTE] Versions change
> The versions named here were current on 28 October 2026. Prefer a project's long-term or stable release unless you need a new feature.

# The tools

## QGIS

::: facts
Answers: Almost everything on a map: layers, measurements, analysis, map figures
Official source: [qgis.org/download](https://qgis.org/download/)
Systems: Windows, macOS, Linux
Licence and cost: Free and open source (GNU GPL)
:::

QGIS is the free desktop GIS: it opens satellite images, drone orthomosaics, OpenStreetMap extracts, GPS tracks and spreadsheets of coordinates, lines them up on one map, measures them and prints them as figures. In October 2026 the download page offers **QGIS 3.44 LTR** (long-term release) and **QGIS 4.2** (July 2026), from the first generation built on Qt 6. 4.2 is planned to replace 3.44 as the long-term release from late 2026, a step the project was still debating in August. If unsure, take whichever version the download page calls the LTR.

### Install

::: os
@windows
1. On [qgis.org/download](https://qgis.org/download/) choose the **Long Term Version for Windows** (a `.msi` file, about 1.5 GB) or, to update easily later, the **OSGeo4W Network Installer** (`osgeo4w-setup.exe`, Express install, tick QGIS LTR).
2. Run the installer and accept the defaults. It also installs GDAL and the **OSGeo4W Shell**, a command line you will use below.
3. Start **QGIS** from the Start menu.
@macos
1. On [qgis.org/download](https://qgis.org/download/) choose **Long Term Version for macOS** (a signed `.dmg`).
2. Open the `.dmg` and drag QGIS to **Applications**.
3. On the first start, macOS may ask you to confirm opening an app downloaded from the internet: choose **Open**.
@linux
1. Debian and Ubuntu: follow the official [installation guide](https://qgis.org/resources/installation-guide/) to add the QGIS signing key and the `qgis.org/debian-ltr` or `qgis.org/ubuntu-ltr` repository, then run `sudo apt update` and `sudo apt install qgis qgis-plugin-grass`.
2. Other distributions: use your package manager, or the community Flatpak with `flatpak install flathub org.qgis.qgis`.
:::

### Add the plugins: QuickMapServices and Semi-Automatic Classification

Open **Plugins › Manage and Install Plugins…**, search, and click **Install plugin**. QGIS picks the version that matches your QGIS.

- **QuickMapServices** (by NextGIS) adds a **Web › QuickMapServices** menu of ready-made base maps: OpenStreetMap, satellite mosaics and more. In its settings, open **More services › Get contributed pack** to load the full list. Use it for context, then switch to proper imagery for measuring.
- **Semi-Automatic Classification Plugin (SCP)** by Luca Congedo searches and downloads Sentinel-2 and Landsat scenes, pre-processes them and classifies land cover (water, vegetation, built-up, burnt). Version 9 is the edition for QGIS 4; on the first run it offers to download its processing library, Remotior Sensus. The [SCP manual](https://semiautomaticclassificationmanual.readthedocs.io/) has step-by-step tutorials.

### First test

1. Open **Web › QuickMapServices › OSM › OSM Standard** (after installing the plugin as above). A world map appears.
2. Zoom to a town you know, then use the **Measure Line** tool (ruler icon) to measure a street you know the length of. Set the measurement to **Ellipsoidal** in the tool's options.
3. Save the project (**Project › Save**). If all three work, QGIS is ready.

### Pitfalls

- **Coordinate reference systems (CRS).** Most problems are a layer in the wrong CRS. Imagery from Sentinel-2 comes in UTM (e.g. EPSG:32636); web maps use EPSG:3857; GPS gives EPSG:4326. Set the project CRS deliberately and measure in a metric CRS, or ellipsoidally.
- **Web base maps are not evidence.** QuickMapServices mosaics are undated and stitched from many dates. Use dated imagery when the date matters.
- **Plugins run code on your machine.** Install only plugins you need from the official repository.

### Legal notes

- QGIS itself is free for any use. The **data** you load keeps its own licence: OpenStreetMap needs "© OpenStreetMap contributors"; Copernicus data "Contains modified Copernicus Sentinel data [year]".
- Many base-map services in QuickMapServices have their own terms (some forbid bulk downloading or commercial use). Read them before you publish a map made with one.

## Google Earth Pro

::: facts
Answers: What did this place look like in past years? What does it look like in 3D?
Official source: [google.com/earth/about/versions](https://www.google.com/earth/about/versions/)
Systems: Windows, macOS, Linux
Licence and cost: Free; Google's terms of service apply
:::

Google Earth Pro is the desktop version of Google Earth. Its **Historical Imagery** slider (the clock icon) shows older captures of the same place, often going back to the 1990s or earlier in cities, which is how many analysts check whether a building, crater or camp existed on a given date. It also measures, draws paths and polygons, and imports and exports KML. **Google will stop offering new downloads of Earth Pro on 25 June 2027**; the web version at [earth.google.com](https://earth.google.com/web/) now has historical imagery too, but fewer analysis tools.

### Install

::: os
@windows
1. Open [the versions page](https://www.google.com/earth/about/versions/) and choose **Download Earth Pro on desktop**.
2. Run `GoogleEarthProSetup.exe`. It installs and keeps itself updated.
@macos
1. Download Earth Pro from [the versions page](https://www.google.com/earth/about/versions/).
2. Open the `.dmg` and run the installer package.
@linux
1. Download the `.deb` (Debian, Ubuntu) or `.rpm` (Fedora, openSUSE) from [the versions page](https://www.google.com/earth/about/versions/).
2. Install it, for example `sudo apt install ./google-earth-pro-stable_current_amd64.deb`. This also adds Google's package repository for updates.
:::

### First test

Fly to a place you know, click the **clock** icon in the toolbar and drag the slider back. Note the **capture date** shown at the bottom of the window for each image: that date, not the slider position, is what you cite.

### Pitfalls

- A historical image's date applies to the image tile, not the whole view: neighbouring tiles can be years apart.
- 3D buildings and terrain are models, not photographs; check details against the flat imagery.
- Google blurs or lowers resolution at some sensitive sites at governments' request.

### Legal notes

- Screenshots in reports are allowed for many non-commercial and editorial uses **with the attribution visible** (Google and the imagery provider), under Google's [Geo guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/). Do not crop out the credit, and do not sell or redistribute the imagery itself.

## ESA SNAP

::: facts
Answers: Processing Sentinel-1 radar and Sentinel-2 and -3 optical data properly: calibration, terrain correction, indices
Official source: [step.esa.int](https://step.esa.int/main/download/snap-download/)
Systems: Windows, macOS (Apple silicon and Intel), Linux
Licence and cost: Free and open source (GNU GPL)
:::

The **Sentinel Application Platform (SNAP)** is the European Space Agency's toolbox for its satellites. Use it when the browser is not enough: radar backscatter (Sentinel-1) to see floods, ships and damage through cloud; band maths on Sentinel-2 (burn ratio, water index); and repeatable processing chains with its **Graph Builder** and the `gpt` command-line tool. The current version is **SNAP 14** (August 2026).

### Install

::: os
@windows
1. On the [SNAP download page](https://step.esa.int/main/download/snap-download/) choose the Windows installer for **All Toolboxes** (`esa-snap_all_windows-14.0.0.exe`), or the smaller **Sentinel Toolboxes** one if you only need Sentinel data.
2. Run it and accept the defaults. Allow it to configure the Python interface (`esa_snappy`) only if you will script SNAP.
@macos
1. Download the `.dmg` for your processor (Apple silicon or Intel) from the [download page](https://step.esa.int/main/download/snap-download/).
2. Run the installer inside it. If macOS blocks it, open **System Settings › Privacy & Security** and choose **Open Anyway**.
@linux
1. Download the Linux `.sh` installer from the [download page](https://step.esa.int/main/download/snap-download/).
2. Run `chmod +x esa-snap_all_linux-*.sh` and then `./esa-snap_all_linux-*.sh`, and follow the prompts.
:::

### First test

1. Download one small Sentinel-2 L2A product (see the Copernicus Browser below), or use **File › Product Library**.
2. **File › Open Product…** and open the `.SAFE` folder or `.zip`.
3. Right-click the product › **Open RGB Image Window** › choose the **Sentinel-2 MSI Natural Colors** profile. A true-colour image means SNAP and its Java runtime work.

### Pitfalls

- Memory: SNAP wants **16 GB of RAM or more** for Sentinel-1. Set the maximum memory in **Tools › Options › Performance** if it crashes.
- Products are large (about 1 GB each). Use **Raster › Subset** early to work on just your area.
- Radar images are not photographs: bright means rough or metallic, dark means smooth (calm water, tarmac). Read the [SNAP tutorials](https://step.esa.int/main/doc/tutorials/) before interpreting them.

### Legal notes

- Copernicus Sentinel data are free and open for any use, including commercial. Credit them as "Contains modified Copernicus Sentinel data [year]" (and "processed by [you]" if you processed them).

## GDAL and OGR

::: facts
Answers: Converting, reprojecting, clipping and inspecting any raster or vector file from the command line
Official source: [gdal.org](https://gdal.org/en/stable/download.html)
Systems: Windows, macOS, Linux
Licence and cost: Free and open source (MIT)
:::

**GDAL** (rasters) and **OGR** (vectors) are the libraries inside almost every GIS, including QGIS. On the command line they do in one line what takes many clicks: read a file's coordinates and dates, cut out an area, reproject, convert KML to GeoJSON, or build a cloud-optimised GeoTIFF for sharing. GDAL 3.11 added a single `gdal` command with sub-commands (`gdal raster info`, `gdal vector convert`) alongside the classic tools.

### Install

::: os
@windows
1. The easiest way: install QGIS (above) and open the **OSGeo4W Shell** from the Start menu. GDAL is already there.
2. Alternatively, install [Miniforge](https://conda-forge.org/download/) and run `conda install -c conda-forge gdal`.
@macos
1. With [Homebrew](https://brew.sh/): `brew install gdal`.
2. Or with Miniforge: `conda install -c conda-forge gdal`.
@linux
1. Debian and Ubuntu: `sudo apt install gdal-bin` (add `python3-gdal` for scripting).
2. Fedora: `sudo dnf install gdal`.
:::

### First test

```sh
gdalinfo --version
gdalinfo image.tif                      # size, coordinate system, corners, bands
ogr2ogr -f GeoJSON places.geojson places.kml
gdalwarp -t_srs EPSG:32636 -r bilinear in.tif out_utm36.tif
gdal_translate -of COG in.tif out_cog.tif   # cloud-optimised GeoTIFF
```

If `gdalinfo --version` prints a version number, the tools work.

### Pitfalls

- Several installations side by side (QGIS's, conda's, Homebrew's) can clash. Use one per project and check with `which gdalinfo` (Windows: `where gdalinfo`).
- Shell quoting differs between PowerShell, Command Prompt and Unix shells; copy commands carefully.
- `gdalwarp` resamples: use `-r near` for categories (land-cover classes) and `-r bilinear` or `-r cubic` for imagery.

### Legal notes

- GDAL's MIT licence allows any use. The files you convert keep their own licences and credits.

## Copernicus Browser

::: facts
Answers: What did this place look like on the last clear day, at 10 m? Through cloud (radar)? In infrared?
Official source: [browser.dataspace.copernicus.eu](https://browser.dataspace.copernicus.eu)
Systems: Any modern web browser
Licence and cost: Free; a free Copernicus Data Space Ecosystem account for downloads and advanced tools
:::

The Copernicus Browser shows **Sentinel-2** (10 m colour and infrared, every few days), **Sentinel-1** radar, **Sentinel-3**, **Landsat** and more, with date pickers that mark days with data, cloud filters, ready-made visualisations (true colour, short-wave infrared for fires, NDVI for vegetation), side-by-side comparison and time-lapse. It is the free successor to **Sentinel Hub's EO Browser, which closed on 20 March 2026**; old EO Browser links do not carry over. The **Imagery** tab's link list opens the browser at the place and dates you are looking at.

### Install

::: os
@any
1. Nothing to install. Open [browser.dataspace.copernicus.eu](https://browser.dataspace.copernicus.eu).
2. Browsing Sentinel-2 works without signing in. To download data or use the analysis tools, create a free account at [dataspace.copernicus.eu](https://dataspace.copernicus.eu).
:::

### First test

From the **Imagery** tab here, open **Copernicus Browser · Sentinel-2, 10 m colour** for a town you know. In the browser, open the calendar: days with images are highlighted. Pick a clear one and switch the visualisation to **SWIR**: water turns black and burn scars red-brown.

### Pitfalls

- A cloud percentage is for the whole 110 km tile, not your town: check the image itself.
- Sentinel-2 is **10 m per pixel**: enough for burn scars, floods, earthworks and large ships, not vehicles or people.
- Time-lapses and downloads count against free monthly quotas.

### Legal notes

- Sentinel data are free and open; credit "Contains modified Copernicus Sentinel data [year]". Data from other missions in the browser (for example commercial contributing missions) can have stricter licences.

## Google Earth Engine

::: facts
Answers: Change over years and large areas, computed in the cloud on petabytes of imagery
Official source: [earthengine.google.com](https://earthengine.google.com/)
Systems: Web browser; Python on any system
Licence and cost: Free for verified non-commercial use, within monthly quotas; paid for commercial use
:::

Earth Engine holds the full Landsat, Sentinel, MODIS and VIIRS archives and many other datasets, and runs your script on Google's servers, so you can compute, say, a cloud-free mosaic of a whole country for each month of the last ten years. You write JavaScript in the **Code Editor** or Python in a notebook.

### Install

::: os
@any
1. Sign in with a Google account and register a Google Cloud project for Earth Engine at [console.cloud.google.com/earth-engine](https://console.cloud.google.com/earth-engine). Choose **non-commercial** use and complete the eligibility questionnaire honestly.
2. Open the Code Editor at [code.earthengine.google.com](https://code.earthengine.google.com/).
3. For Python: `pip install earthengine-api geemap`, then in Python run `import ee; ee.Authenticate(); ee.Initialize(project='your-project-id')`.
:::

### First test

Paste this into the Code Editor and press **Run**. It shows the least cloudy Sentinel-2 image of Dublin from summer 2026.

```js
var point = ee.Geometry.Point([-6.26, 53.35]);
var img = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(point)
  .filterDate('2026-06-01', '2026-08-31')
  .sort('CLOUDY_PIXEL_PERCENTAGE')
  .first();
Map.centerObject(point, 11);
Map.addLayer(img, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Sentinel-2');
print(img.date());
```

### Pitfalls

- **Quotas.** Since 27 April 2026 non-commercial projects get a monthly allowance of compute (the Community tier: 150 EECU-hours; the Contributor tier: 1,000 with a billing account attached but not charged). Heavy scripts slow down when it runs out. Projects must re-verify non-commercial status every year.
- Results are only as good as the cloud masking. Inspect individual images before trusting a statistic.

### Legal notes

- Non-commercial use only on the free tiers: research, education, journalism and non-profit work generally qualify; work you are paid for may not. Read the [Earth Engine terms](https://earthengine.google.com/terms/) and each dataset's own licence in the catalogue.

## WebODM and OpenDroneMap

::: facts
Answers: Turning your own overlapping drone or ground photos into a measurable map (orthomosaic), elevation model and 3D model
Official source: [webodm.org/download](https://webodm.org/download) · [opendronemap.org](https://www.opendronemap.org/)
Systems: Windows, macOS, Linux
Licence and cost: Free and open source (AGPL); paid cloud processing optional
:::

Photogrammetry ("structure from motion") matches thousands of points between overlapping photos, works out where each photo was taken, and builds a **georeferenced orthomosaic** (a map-accurate photo), a **digital surface model** and a **3D mesh**. **OpenDroneMap** (ODM) is the long-standing open-source engine and command-line toolkit. **WebODM** is the friendly web interface around a processing engine. Since April 2026 WebODM is developed separately, at webodm.org, with its own engine (ODX); its Windows and macOS installers are free there. OpenDroneMap continues ODM and NodeODM at opendronemap.org.

### Install

::: os
@windows
1. Download the WebODM installer from [webodm.org/download](https://webodm.org/download) and run it. It runs natively, without Docker.
2. You need at least 8 GB of RAM and 20 GB of free disk; 16 GB and 100 GB are recommended.
@macos
1. Download the macOS installer from [webodm.org/download](https://webodm.org/download). It installs and manages Docker for you.
@linux
1. Install Git and Docker, then:
2. `git clone https://github.com/WebODM/WebODM --config core.autocrlf=input --depth 1`
3. `cd WebODM` and `./webodm.sh start`, then open http://localhost:8000.
:::

For the ODM engine alone (command line, any system with Docker):

```sh
docker run -ti --rm -v /path/to/project:/datasets/code opendronemap/odm --project-path /datasets
```

### First test

Download a small sample image set from [OpenDroneMap's sample datasets](https://github.com/OpenDroneMap/ODMdata), create a project in WebODM, choose **Select Images and GCP**, add the photos and start with the default options. When it finishes, open the **orthophoto** and the **3D model**, and download the orthophoto as a GeoTIFF to open in QGIS.

### Pitfalls

- **Overlap is everything:** about 75–80 % forward and 60–70 % side overlap, at a constant height, in diffuse light. Gaps, water, snow and moving trees fail to match.
- GPS in drone photos is accurate to a few metres. For centimetre accuracy you need **ground control points** or an RTK/PPK drone (see the Hardware Guide).
- Processing time and memory grow quickly with photo count: test with 50 photos before 1,000.

### Legal notes

- Fly legally first (registration, training, geographical zones: see the Hardware Guide and Law & ethics). An orthomosaic can show people, cars and back gardens in detail: it is personal data if people can be identified. Blur or crop before sharing.

## BlenderGIS

::: facts
Answers: Rebuilding a place in 3D from terrain and building footprints, to match a photo's viewpoint
Official source: [github.com/domlysz/BlenderGIS](https://github.com/domlysz/BlenderGIS) · Blender at [blender.org/download](https://www.blender.org/download/)
Systems: Windows, macOS, Linux
Licence and cost: Free and open source (GPL)
:::

**BlenderGIS** is an add-on for the free 3D program **Blender**. It imports base maps, elevation models and OpenStreetMap buildings into a 3D scene. Analysts use it to test a geolocation: put a virtual camera where you think the photographer stood, give it the photo's focal length, and see whether the skyline and buildings line up. (The free tool [fSpy](https://fspy.io/) can recover the camera position from straight lines in a photo and hand it to Blender.)

### Install

::: os
@any
1. Install Blender from [blender.org/download](https://www.blender.org/download/).
2. Download BlenderGIS as a ZIP from its [GitHub page](https://github.com/domlysz/BlenderGIS) (**Code › Download ZIP**, or the latest release).
3. In Blender: **Edit › Preferences › Add-ons**, use **Install from Disk…** (in the menu at the top right of that page in recent versions), choose the ZIP and tick **BlenderGIS**.
:::

### First test

In the 3D view, open the **GIS** menu › **Web geodata › Basemap**, choose OpenStreetMap and press **E** to set an area. Then **GIS › Web geodata › Get elevation (SRTM)** and **Get OSM** to add terrain and buildings.

### Pitfalls

- Elevation from OpenTopography needs a free **API key** (set it in the add-on's preferences).
- Set the scene's coordinate system in the add-on before importing, or layers will not line up.
- Big areas make huge meshes; start with a few square kilometres.

### Legal notes

- Base-map tiles come from services with usage policies: OpenStreetMap's tile servers forbid bulk downloading, and other providers' terms may restrict use. Import small areas, credit sources, and use a provider whose terms allow your use.

## PeakVisor

::: facts
Answers: Which mountain is that? Does this skyline match the place I think the photo was taken?
Official source: [peakvisor.com](https://peakvisor.com/)
Systems: iOS, Android; panoramas in a web browser
Licence and cost: Free with limits; paid subscription for full features
:::

PeakVisor draws a 3D terrain panorama with the names of peaks for any viewpoint, and can line up an imported photo against it. For geolocation, a skyline is a strong clue that is hard to fake and changes slowly. The **Measure & geolocate** tab here links to a PeakVisor panorama at your selected point, looking along your last measured bearing.

### Install

::: os
@any
1. Phones: install **PeakVisor** from the App Store or Google Play (publisher PeakVisor).
2. Browser: open a panorama from the link in the Measure tab, or from [peakvisor.com](https://peakvisor.com/).
:::

### First test

Open the panorama for a hilltop you know and check that the labelled peaks match what you see in a photo from there. Then try the **photo import**: choose a landscape photo, set its location, and align the skyline.

### Pitfalls

- The match depends on the right viewpoint **height** and on the terrain model: valleys and close ridges are less reliable than distant summits.
- Haze, cloud and snow lines change how a skyline looks; match shapes, not colours.

### Legal notes

- Panoramas are PeakVisor's renderings: link to them or describe the match rather than republishing screenshots without permission. Allow the app location access only while you use it.

## SunCalc

::: facts
Answers: Where was the sun at this place and time? How long were the shadows? When does the sun stand where a shadow says it was?
Official source: [suncalc.org](https://www.suncalc.org/) (web app) · library: [github.com/mourner/suncalc](https://github.com/mourner/suncalc)
Systems: Any web browser
Licence and cost: Free (the library is BSD-licensed)
:::

There are two SunCalcs. **suncalc.org** is a free web map that draws the sun's direction, sunrise and sunset lines for a place and time, and gives the shadow length for an object of a chosen height. **SunCalc** is also the small open-source JavaScript library, by Vladimir Agafonkin, that this dashboard's **Sun and shadows** and **chronolocation** panels use (version 2.1.1).

### Install

::: os
@any
1. Nothing to install: open [suncalc.org](https://www.suncalc.org/), or the **Measure & geolocate** tab here.
:::

### First test

Choose the same place, day and local time in both suncalc.org and the Measure tab. The sun's direction (azimuth) and height (altitude) should agree within a fraction of a degree. If they differ by about 15° or one hour, one of them has the wrong **time zone or daylight-saving** setting.

### Pitfalls

- Time zones and summer time are the commonest error. Work in UTC and convert at the end.
- Shadows on slopes are longer or shorter than on level ground; measure on flat ground.
- Object heights are often guesses: test the range (for example a lamp post of 6, 8 or 10 m) and report a time window.

### Legal notes

- Free to use. Credit the method rather than the site in a report: "sun position computed with SunCalc for [place], [date]".

## ExifTool, with GPS geotagging

::: facts
Answers: When, where and with what was this photo taken, according to its metadata? Can I add positions to my own photos from a GPS track?
Official source: [exiftool.org](https://exiftool.org/)
Systems: Windows, macOS, Linux
Licence and cost: Free and open source (Perl licence)
:::

**ExifTool** by Phil Harvey reads and writes metadata in almost every image, video and document format: camera model, lens and focal length, the time taken (and its time-zone offset, if recorded), GPS position, altitude and compass heading, editing software and more. Its **geotagging** feature writes GPS positions into your own photos from a track log recorded by a GPS logger or phone.

### Install

::: os
@windows
1. Download the **Windows Executable** (`exiftool-13.59_64.zip` at the time of writing) from [exiftool.org](https://exiftool.org/).
2. Extract it, rename `exiftool(-k).exe` to `exiftool.exe`, and move `exiftool.exe` **and** the `exiftool_files` folder together into a folder on your PATH (or run it from that folder).
@macos
1. Download the **MacOS Package** (`ExifTool-13.59.pkg`) from [exiftool.org](https://exiftool.org/) and run it; if macOS blocks it, use **Open Anyway** in Privacy & Security.
2. Or with Homebrew: `brew install exiftool`.
@linux
1. Debian and Ubuntu: `sudo apt install libimage-exiftool-perl`. Fedora: `sudo dnf install perl-Image-ExifTool`.
2. Or the full distribution from exiftool.org: unpack it, then `perl Makefile.PL`, `make test`, `sudo make install`.
:::

### First test

```sh
exiftool -ver
exiftool -a -G1 -s photo.jpg
exiftool -n -GPSLatitude -GPSLongitude -GPSAltitude -GPSImgDirection -DateTimeOriginal -OffsetTimeOriginal -Model -FocalLengthIn35mmFormat photo.jpg
```

The first prints the version; the second lists every tag with its group; the third prints the fields that matter for geolocation and chronolocation, with coordinates as decimal degrees (`-n`).

### Geotag your own photos from a GPS track

```sh
exiftool -geotag track.gpx "-Geotime<${DateTimeOriginal}+01:00" photos/
exiftool -n -csv -FileName -GPSLatitude -GPSLongitude photos/ > positions.csv
```

`-Geotime` tells ExifTool which time zone the camera clock was set to (here UTC+1). If the camera clock was also wrong, photograph a GPS or phone clock at the start and correct with `-geosync`. Open `positions.csv` in QGIS to check the result.

### Pitfalls

- **Metadata is easy to edit and usually stripped** by social networks. Its absence proves nothing; its presence is a lead to verify, not proof.
- Camera clocks drift and are often set to the wrong time zone. `OffsetTimeOriginal` exists only on newer cameras and phones.
- ExifTool keeps a backup (`photo.jpg_original`) when it writes. Always work on copies and keep a hash (`sha256sum`, or `Get-FileHash` in PowerShell) of the original file.

### Legal notes

- Location metadata in your own photos reveals where you were. **Remove it before you share sensitive images**: `exiftool -gps:all= -xmp:geotag= photo.jpg` removes GPS tags; `exiftool -all= photo.jpg` removes everything.
- Other people's metadata can be personal data (where they live, where they were). Use it to verify events, never to locate a private person.

# Recipes

## Recipe 1: geolocate a photo

1. **Get the best copy.** Find the earliest and largest version (reverse image search: see the [OSINT Training lesson](prp://osint-training/fe/learning.html?course=osint&lesson=reverse-image-search-metadata-and-synthetic-media)). Save it, note where and when you found it, and hash it.
2. **Read the metadata** with ExifTool. Note any GPS position, time and heading, as leads only.
3. **List the clues:** script and language on signs, road markings and which side people drive, terrain, vegetation, landmarks, distinctive buildings. The course lesson on [Geolocation](prp://osint-training/fe/learning.html?course=osint&lesson=geolocation) lists what to look for.
4. **Narrow the area.** In the [Features](#tab=features) tab, search for combinations, for example places of worship within 200 m of a railway station, or water towers near a bridge. Open the same query in Overpass Turbo for more complex searches.
5. **Match from above and at street level.** In [Measure & geolocate](#tab=measure), switch the base to Imagery, then open Mapillary, KartaView or Street View at candidate points. Use Google Earth Pro's historical imagery if the scene may have changed.
6. **Use the terrain.** Compare skylines with PeakVisor, or rebuild the scene with BlenderGIS. Check that the camera position can actually see the landmarks with the **Elevation profile and line of sight** tool.
7. **Confirm and record.** Show at least three independent matching features side by side, give the coordinates (decimal degrees and MGRS from the Measure tab) and the view direction, and say how sure you are.

## Recipe 2: date an image from its shadows

1. **Geolocate first.** The sun's position depends on the place, so you need it within a few kilometres.
2. **Pick an upright object with a clear shadow on level ground**: a lamp post, a pole, a building corner. Avoid people.
3. **Measure the shadow's direction**: on a satellite or drone image, use the **Shadow** tool in the [Measure & geolocate](#tab=measure) tab (click the base, then the tip). In a ground photo, work out the direction from mapped features in the frame.
4. **Estimate the height-to-shadow ratio.** The sun's altitude is arctan(height ÷ shadow length). Use known heights (a standard door is about 2 m; lamp posts and storeys vary, so test a range).
5. **Search.** Enter the direction and altitude in the **chronolocation** panel, choose the claimed day or the whole year, and read the matching time window. With both direction and altitude, a year usually has two matching dates either side of the summer solstice.
6. **Cross-check** with suncalc.org, with weather records for cloud, and with that day's satellite imagery in the [Imagery](#tab=imagery) tab.
7. **Report a window, not a minute** (for example "between 14:10 and 14:40 local time"), with the heights and directions you assumed. The [OSINT Training lesson](prp://osint-training/fe/learning.html?course=osint&lesson=satellite-imagery-and-chronolocation) has a worked example.

## Recipe 3: measure change between two satellite images

::: figure satellite-pipeline
From catalogue to report. Search, download two comparable scenes, process them in SNAP or QGIS, detect the change, check it, and report it with dates and credits.
:::

1. **Quick look first.** In the [Imagery](#tab=imagery) tab, use the before/after swipe on daily MODIS or VIIRS to find roughly when something changed. It is coarse (250–750 m) but daily.
2. **Find two good scenes.** In the Copernicus Browser, pick two cloud-free Sentinel-2 L2A images from the **same season** (vegetation and sun angle change through the year) before and after the event. Download them, or just the bands you need (for burns: B8A and B12; for water: B03 and B08; for vegetation: B04 and B08).
3. **Compute an index for each date** in QGIS (**Raster › Raster Calculator**) or SNAP (**Band Maths**). For burn scars, the normalised burn ratio, NBR = (B8A − B12) ÷ (B8A + B12). With GDAL:

```sh
gdal_calc.py -A B8A_before.jp2 -B B12_before.jp2 --calc="(A.astype(float)-B)/(A+B)" --outfile=nbr_before.tif
gdal_calc.py -A B8A_after.jp2 -B B12_after.jp2 --calc="(A.astype(float)-B)/(A+B)" --outfile=nbr_after.tif
gdal_calc.py -A nbr_before.tif -B nbr_after.tif --calc="A-B" --outfile=dnbr.tif
```

4. **Threshold and measure.** Pixels with a large change (for burns, a dNBR above about 0.27 is commonly classed as moderate severity or worse on the widely used USGS scale) can be turned into polygons (**Raster › Conversion › Polygonize**) and their area measured. The Semi-Automatic Classification Plugin can classify land cover instead.
5. **Check before you believe it.** Look at the true-colour images: cloud, cloud shadow, harvests, floods receding and snow all change the numbers.
6. **Report** the dates of both scenes, the method, the area with an honest margin, and "Contains modified Copernicus Sentinel data [year]".

## Recipe 4: make a map figure for a report

1. **Start in QGIS** with dated imagery or a plain base map, your evidence layers on top, and a metric CRS for the area (the local UTM zone).
2. **Open Project › New Print Layout.** Add the map, a **scale bar**, a **north arrow**, a small **inset map** showing where in the country this is, and a **legend** if you use more than one symbol.
3. **Write a caption** in the publication style used across Vitruvian Manager: "Figure 1. What it shows, where and when. Source." Give the imagery date and the coordinates of the key point.
4. **Credit every source:** "Contains modified Copernicus Sentinel data 2026", "© OpenStreetMap contributors", "Imagery: NASA Worldview", "Vantor Open Data (CC BY-NC 4.0)", as each licence asks.
5. **Choose colours that survive colour-blindness and print:** few colours, labels as well as colour, thin outlines.
6. **Check what the map reveals.** Remove or blur faces, number plates and house numbers that are not needed; consider reducing precision where a location could put people at risk (see [Law & ethics](#tab=law)).
7. **Export** as PDF or SVG for print and as PNG at 200–300 dpi for the web, and keep the QGIS project with the report so others can check it.
