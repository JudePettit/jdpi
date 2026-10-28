// SIGINT Dashboard: curated reference data (pure). Checked October 2026; frequencies are the published downlinks,
// and anything whose status changes often says so and links to the live status page instead of guessing.

/** Satellite notes keyed by CelesTrak OBJECT_NAME. simple: receivable with a hand-held or fixed antenna and a €30 SDR. */
export const SAT_META = [
  { match: /^ISS \(ZARYA\)$/, label: 'ISS', downlink: '145.800 MHz FM (ARISS contacts, SSTV events) · 145.825 MHz APRS', antenna: '2 m vertical or hand-held yagi', simple: true, kind: 'station' },
  { match: /\(SO-50\)/, label: 'SO-50', downlink: '436.795 MHz FM repeater', antenna: '70 cm yagi; a whip on high passes', simple: true, kind: 'amateur', note: 'Listening needs no licence; talking through it (145.850 MHz, 67 Hz tone) needs an amateur licence.' },
  { match: /\(AO-7\)/, label: 'AO-7', downlink: '145.925–145.975 MHz SSB/CW transponder (mode B)', antenna: '2 m yagi', simple: true, kind: 'amateur', note: 'Launched 1974; works only in sunlight.' },
  { match: /\(FO-29\)/, label: 'FO-29', downlink: '435.800–435.900 MHz SSB/CW transponder', antenna: '70 cm yagi', simple: true, kind: 'amateur' },
  { match: /RS-44/, label: 'RS-44', downlink: '435.610–435.670 MHz SSB/CW transponder', antenna: '70 cm yagi', simple: true, kind: 'amateur' },
  { match: /\(AO-73\)/, label: 'AO-73 (FUNcube-1)', downlink: '145.935 MHz BPSK telemetry; 145.950–145.970 MHz transponder', antenna: '2 m yagi or turnstile', simple: true, kind: 'amateur' },
  { match: /^ES'HAIL 2$/, label: "QO-100 (Es'hail-2)", downlink: '10489.5–10490 MHz narrowband transponder', antenna: '60–80 cm satellite-TV dish with an LNB', simple: false, kind: 'amateur', note: 'Geostationary at 25.9° E: always in view from Europe, Africa, the Middle East and India.' },
  { match: /^METEOR-M2 [34]$/, downlink: '137.900 MHz LRPT (alternate 137.100 MHz)', antenna: 'V-dipole or QFH', simple: true, kind: 'weather', note: 'Digital images; decode with SatDump. The mode and frequency change from time to time: check a current status page before recording.' },
  { match: /^METEOR-M2 2$/, downlink: '137 MHz LRPT no longer transmits', antenna: '', simple: false, kind: 'weather', silent: true },
  { match: /^METEOR-M 2$/, downlink: 'Retired', antenna: '', simple: false, kind: 'weather', silent: true },
  { match: /^METOP-[BC]$/, downlink: '1701.3 MHz AHRPT', antenna: 'Tracking dish (60 cm or more) with an L-band LNA', simple: false, kind: 'weather' },
  { match: /^NOAA 2[01]|^SUOMI NPP/, downlink: '7812 MHz X-band (HRD)', antenna: 'X-band tracking dish', simple: false, kind: 'weather' },
  { match: /^FENGYUN 3/, downlink: 'L-band or X-band HRPT (varies by satellite)', antenna: 'Tracking dish', simple: false, kind: 'weather' },
  { match: /^GOES 1[89]$/, downlink: '1694.1 MHz HRIT/EMWIN', antenna: 'L-band dish (about 1 m) with an LNA', simple: false, kind: 'weather', note: 'Americas and the eastern Atlantic only.' },
  { match: /^GEO-KOMPSAT-2A$/, downlink: '1692.14 MHz LRIT', antenna: 'L-band dish with an LNA', simple: false, kind: 'weather', note: 'Asia–Pacific only.' },
];
export function satMeta(name) {
  return SAT_META.find(m => m.match.test(name)) || null;
}
/** The decommissioned NOAA POES satellites, for the note in the Satellites view (dates from NOAA OSPO). */
export const NOAA_POES_END = [
  { name: 'NOAA-18', date: '2025-06-06' }, { name: 'NOAA-19', date: '2025-08-13' }, { name: 'NOAA-15', date: '2025-08-19' },
];
export const SAT_GROUPS = [
  { id: 'weather', label: 'Weather', celestrak: 'weather' },
  { id: 'stations', label: 'ISS and stations', celestrak: 'stations' },
  { id: 'amateur', label: 'Amateur', celestrak: 'amateur' },
];

/** Public receivers anyone can tune from a browser. Coordinates are approximate (town level). */
export const RECEIVERS = [
  { name: 'University of Twente WebSDR', kind: 'WebSDR', place: 'Enschede, Netherlands', lat: 52.24, lon: 6.85, bands: '0–29 MHz: longwave, mediumwave and all of shortwave at once', url: 'http://websdr.ewi.utwente.nl:8901/' },
  { name: 'Hack Green WebSDR', kind: 'WebSDR', place: 'Nantwich, England', lat: 53.03, lon: -2.54, bands: 'HF amateur bands plus 2 m and 70 cm', url: 'http://hackgreensdr.org:8901/' },
  { name: 'Northern Utah WebSDR', kind: 'WebSDR', place: 'Corinne, Utah, United States', lat: 41.55, lon: -112.11, bands: 'LF to HF across several receivers', url: 'http://websdr.sdrutah.org/' },
];
export const DIRECTORIES = [
  { name: 'WebSDR.org', kind: 'WebSDR', what: 'Every public WebSDR (PA3FWM’s software), with a map and band list', url: 'http://websdr.org/' },
  { name: 'KiwiSDR public receivers', kind: 'KiwiSDR', what: 'Hundreds of 0–30 MHz KiwiSDRs worldwide, many with TDoA direction finding', url: 'http://rx.kiwisdr.com/' },
  { name: 'Receiverbook', kind: 'OpenWebRX', what: 'Public OpenWebRX receivers, often VHF/UHF with digital-mode decoders', url: 'https://www.receiverbook.de/' },
];

/** Deep links to public maps at a location. */
const f = (v, dp = 3) => Number(v).toFixed(dp);
export const LINKS = {
  adsbGlobe: (lat, lon) => `https://globe.adsb.lol/?lat=${f(lat)}&lon=${f(lon)}&zoom=9`,
  adsbx: (lat, lon) => `https://globe.adsbexchange.com/?lat=${f(lat)}&lon=${f(lon)}&zoom=9`,
  fr24: (lat, lon) => `https://www.flightradar24.com/${f(lat, 2)},${f(lon, 2)}/9`,
  marineTraffic: (lat, lon) => `https://www.marinetraffic.com/en/ais/home/centerx:${f(lon)}/centery:${f(lat)}/zoom:10`,
  vesselFinder: () => 'https://www.vesselfinder.com/',
  myShipTracking: () => 'https://www.myshiptracking.com/',
  aprs: (lat, lon) => `https://aprs.fi/#!z=10&lat=${f(lat, 4)}&lng=${f(lon, 4)}`,
  gpsjam: (lat, lon, date) => `https://gpsjam.org/?lat=${f(lat, 2)}&lon=${f(lon, 2)}&z=5${date ? `&date=${date}` : ''}`,
  fr24Jamming: () => 'https://www.flightradar24.com/data/gps-jamming',
  satnogs: norad => `https://db.satnogs.org/satellite/${encodeURIComponent(norad)}/`,
  heavensAbove: (lat, lon) => `https://www.heavens-above.com/PassSummary.aspx?satid=25544&lat=${f(lat, 4)}&lng=${f(lon, 4)}&alt=0&tz=UCT`,
};
