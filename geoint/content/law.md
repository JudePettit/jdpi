---
title: Law & ethics
dek: What the law and plain decency ask of anyone who collects, analyses and publishes pictures and maps of places: privacy and data protection when people appear, where you may fly and stand, the countries that forbid photographing military sites, imagery licences, and how to publish without putting people at risk.
updated: 28 October 2026
scope: General information, focused on the EU, Ireland and the UK; not legal advice
---

# The ground rules of this dashboard

1. **Public sources only.** Use what anyone can see or download, on the provider's terms. Never get round logins, paywalls, CAPTCHAs or rate limits, and never use leaked or hacked material.
2. **Places, events and infrastructure, not private people.** Investigate what happened, where and when, who is responsible as an organisation or office-holder, and whether a claim is true. Do not locate, profile, track or expose private individuals, and do not use these tools to find where someone lives or goes.
3. **Corroborate before you publish**, say how sure you are, and correct mistakes openly.
4. **Do no harm.** Ask who could be hurt by what you publish (the people in the picture, sources, local communities, you) and change what you publish accordingly.

The [OSINT Training](prp://osint-training/fe/learning.html?course=osint&lesson=law-terms-of-service-and-data-protection) course covers the general law of open-source work; this page adds what is specific to imagery and maps.

> [!LEGAL] Not legal advice
> This is general information, checked on 28 October 2026. Laws differ by country and change. If you plan to publish something that could identify people, involves a military or critical site, or will be used as evidence, take advice from a lawyer or your organisation's legal team first.

# Privacy and data protection when people appear

## When an image is personal data

Under the EU General Data Protection Regulation (GDPR), and the UK GDPR, an image in which a person **can be identified** (by their face, but also by their car's number plate, their house, their clothes and the context) is **personal data**. So are precise locations linked to a person. Collecting, storing, analysing or publishing such images is "processing", and the law applies unless an exemption does.

- **The household exemption** covers purely personal activity, such as family photos. It stops applying when you publish to the world: the EU Court of Justice held in *Lindqvist* (2003) that putting personal data on an openly accessible website is not purely personal, and in *Ryneš* (2014) that a home camera covering a public street is not purely domestic either.
- **A lawful basis** is needed for anything else. For independent research the usual one is **legitimate interests**, which needs a genuine purpose, necessity, and a balancing test against the people's rights.
- **Journalism, research and art** have exemptions that each country sets: in Ireland in section 43 of the Data Protection Act 2018, in the UK in the "special purposes" provisions of the Data Protection Act 2018. They are narrower than many people think and still expect fairness and care.
- **Special categories** need extra care: images that reveal health, religion, ethnicity, sexual orientation, political opinions or trade-union membership. A photo of a protest, a clinic or a place of worship can reveal them.

## Drones and other cameras

- The Irish Data Protection Commission's [Guidance on the use of drones](https://www.dataprotection.ie/en/dpc-guidance/guidance-on-the-use-of-drones) explains when drone recording is processing of personal data and suggests a data protection impact assessment for anything beyond household use. The IAA's [privacy page](https://www.iaa.ie/general-aviation/drones/privacy) says the same in brief, and the UK's Information Commissioner's Office has similar guidance.
- **Thermal cameras** see people through darkness and light vegetation; **zoom lenses** see into gardens and windows. Plan flights and framing to avoid people who are not part of your subject.
- Being lawful to fly does not make it lawful to record: aviation rules and data protection rules are separate, and you must meet both.

## Practical minimisation

- Frame and crop to the subject. Blur faces, number plates and house numbers that are not needed for the finding.
- Strip location metadata from your own photos before sharing (`exiftool -gps:all= photo.jpg`), unless the location is the point.
- Keep raw imagery of people only as long as you need it, encrypted, and delete it afterwards.
- People have rights over their data, including access and objection: be ready to answer a request.

# Where you may fly and stand

## No-fly zones and airspace

- In the EU, each state publishes **UAS geographical zones**: around airports and airfields, prisons, military sites, government buildings, hospitals' helipads, nature reserves and temporary events. In Ireland, check the [IAA's geographical zones](https://www.iaa.ie/general-aviation/drones/uas-geographic-zones) before every flight; in the UK, the CAA's flight restriction zones.
- **Temporary restrictions** appear for state visits, emergencies, wildfires and major events. Never fly near an emergency: drones have grounded firefighting aircraft.
- National parks and nature reserves often need permission, and disturbing wildlife (nesting birds, seal colonies) can be an offence in itself.

## Trespass and private land

- Taking off or landing on private land needs the landowner's permission, as does entering land on foot to photograph it.
- Flying low or repeatedly over private property can amount to trespass or nuisance, and following or watching people can be harassment, in Ireland and the UK.
- Photographing private property from a public place is generally lawful in Ireland and the UK. Satellite and aerial imagery published by others is the safer way to look at places you cannot visit.

# Photographing military sites and critical infrastructure

Many countries make it a crime to photograph, film or even sketch military installations, and some extend this to bridges, ports, power stations and other critical infrastructure, whatever your intention. Signs are not always present, and "everyone can see it on satellite imagery" is not a defence. Examples:

| Country | What the law says |
|---|---|
| **United Kingdom** | The National Security Act 2023 makes it an offence to inspect, including to photograph, a "prohibited place" for a purpose prejudicial to the UK; the restrictions on drones near prisons and military sites also apply. |
| **Germany** | Section 109g of the Criminal Code punishes making images of military installations or equipment that knowingly endanger national security. |
| **Poland** | Since April 2025 photographing or filming designated military sites and critical infrastructure (about 25,000 places, marked "zakaz fotografowania" for infrastructure) without permission is punishable by fines and up to 30 days' detention. |
| **Greece** | In 2001 a group of British and Dutch plane-spotters were arrested and convicted of espionage for noting aircraft at a military airshow; they were acquitted on appeal, after months of legal jeopardy. |
| **United States** | 18 U.S.C. § 795 forbids photographing vital military installations designated by the President without permission. |
| **Elsewhere** | Russia, China, India, Egypt, Iran, Turkey, Cyprus and many others restrict photography of military sites, and some treat foreign visitors with cameras near them as suspected spies. |

In wartime, publishing **where defence forces are** can kill. Ukraine, for example, made the unauthorised publication of information about the movement and positions of its armed forces a crime in March 2022, and imagery of where strikes landed is restricted there. Respect such rules even where you are out of reach of them.

> [!CAUTION] Before you travel with a camera or drone
> Read the destination country's rules (your foreign ministry's travel advice is a good start). Do not photograph soldiers, bases, border posts, airports, ports, bridges or power plants in countries that restrict it, and do not take a drone without checking that you may.

# Imagery and map licences

| Source | Licence | What to write |
|---|---|---|
| Copernicus Sentinel (EU) | Free and open, any use | "Contains modified Copernicus Sentinel data [year]" |
| Landsat (USGS and NASA) | Public domain | "Landsat imagery courtesy of the U.S. Geological Survey" |
| NASA GIBS, Worldview, MODIS, VIIRS | No restrictions | "NASA Worldview / EOSDIS GIBS" |
| Vantor Open Data (formerly Maxar) | CC BY-NC 4.0: non-commercial, with credit | The credit given with the dataset, typically "© [year] Vantor" |
| Planet | Commercial licence; publication depends on your plan | As your licence specifies |
| Umbra, Capella and Satellogic open data | CC BY 4.0 | The provider and the licence |
| Google Earth and Maps | Allowed for many editorial and non-commercial uses with the attribution visible | Keep Google's and the provider's credit; see the Geo guidelines |
| Esri World Imagery and Wayback | Esri's terms of use | "Esri, Vantor, Earthstar Geographics" as shown on the map |
| EOxCloudless Sentinel-2 mosaic | CC BY-NC-SA 4.0 for non-commercial use | "EOxCloudless [year] by EOX IT Services GmbH (contains modified Copernicus Sentinel data)" |
| OpenStreetMap | Open Database Licence (ODbL) | "© OpenStreetMap contributors", and share-alike for databases you derive |
| Mapillary and KartaView photos | CC BY-SA 4.0 | The contributor, the platform and the licence |
| Your own drone or ground photos | Yours | But the privacy rules above still apply to people in them |

Also respect each service's **terms of use**, which this dashboard follows: NASA FIRMS keys are personal; Nominatim allows one search a second and no automated or "as you type" searching; Overpass servers ask for small, polite queries; Google Earth Engine's free tiers are for non-commercial work.

# Responsible publication

## Do not expose vulnerable people or places

Some correct, public information should still not be published precisely. Before you publish, ask whether your map or image could help someone find:

- **people at risk**: refugee shelters, domestic-violence refuges, safe houses, witnesses, activists, minorities, children;
- **sources and people in the picture** who never agreed to be identified;
- **fragile places**: nests of endangered birds, archaeological sites that could be looted, the exact location of rare plants;
- **vulnerabilities**: the weak points of a dam, a power grid or a water supply.

If so, publish less: blur, crop, coarsen coordinates to a town or a grid square, delay publication until the danger has passed, or keep the detail for the authorities or the people concerned.

## Show your work, carefully

- Publish enough for others to check you (coordinates, dates, sources, method) unless doing so creates the harms above; then share the detail privately with editors or reviewers.
- Separate what you saw from what you infer, and use plain estimative language ("likely", "almost certainly") with your reasons.
- Label unverified material clearly, and do not amplify a false claim in the act of debunking it.
- Keep an audit trail: originals, hashes, archive links and notes of every step.

## Look after yourself and your sources

- Imagery from wars and disasters can be distressing. Limit exposure, turn off autoplay, and talk to someone.
- Do not reveal your own location through your photos' metadata, your screenshots or your accounts.
- The [Berkeley Protocol on Digital Open Source Investigations](https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source) (UN Human Rights Office and UC Berkeley, 2022) sets professional standards for this work, including for safety and ethics. The OSINT Training lesson [Doing no harm and staying safe](prp://osint-training/fe/learning.html?course=osint&lesson=doing-no-harm-and-staying-safe) turns it into practice.

# Checklist before you publish an image or map

1. Is everything in it from a public source, used on that source's terms, and credited as its licence asks?
2. Have three independent checks confirmed the location and date, and is the uncertainty stated?
3. Can any private person be identified? If so, is it necessary, lawful and fair, and have faces, plates and addresses been removed where they are not?
4. Could it help someone find people at risk, fragile places or weak points? If so, have you reduced precision or delayed?
5. Does it show a military or critical site in a country that forbids that, or troop positions in a war?
6. Have you stripped your own location from the files, and kept the originals and your notes?
