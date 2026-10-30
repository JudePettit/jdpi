# Receivers {#receivers}

Prices are indicative EU retail prices including VAT in October 2026, rounded, for comparison only: check the maker’s own shop or an authorised dealer before buying, and beware of clones of the popular boards, which are common and often worse.

## Software-defined receivers {#sdrs}

| Receiver | Covers | Bandwidth · ADC | Transmits? | About | Notes |
|---|---|---|---|--:|---|
| RTL-SDR Blog V4 | 0.5 MHz–1.766 GHz | 2.4 MHz · 8-bit | No | €45–60 | The reference €30–50 dongle: HF upconverter, filters, 1 PPM TCXO, bias tee. Production ended in 2026 as its R828D tuner chips ran out; buy while stocks last. |
| RTL-SDR Blog V4L (Lite) | 0.5 MHz–1.766 GHz | 2.4 MHz · 8-bit | No | a little under the V4 | The successor: R828S tuner, same HF upconverter, simpler input filtering. Needs the updated RTL-SDR Blog driver. |
| Generic RTL2832U + R820T2 | 24 MHz–1.7 GHz | 2.4 MHz · 8-bit | No | €20–30 | Fine to start; drifts, runs hot, no HF without tricks. |
| Nooelec NESDR SMArt v5 | 25 MHz–1.75 GHz | 2.4 MHz · 8-bit | No | €35–45 | Metal case, TCXO; HF with Nooelec’s upconverter. |
| Airspy Mini | 24–1700 MHz | 6 MHz · 12-bit | No | €120–140 | Cleaner and wider than an RTL-SDR: good for ADS-B and AIS stations. |
| Airspy R2 | 24–1700 MHz | 10 MHz · 12-bit | No | €180–200 | |
| Airspy HF+ Discovery | 0.5 kHz–31 MHz, 60–260 MHz | 660 kHz · high dynamic range | No | €180–200 | Excellent HF and VHF airband receiver. |
| SDRplay RSP1B | 1 kHz–2 GHz | 10 MHz · 14-bit | No | €130–150 | Good all-rounder; SDRconnect/SDRuno software, or SoapySDR. |
| SDRplay RSPdx-R2 | 1 kHz–2 GHz | 10 MHz · 14-bit | No | €240–280 | Three antenna inputs, better HF/MW filtering. |
| KiwiSDR 2 | 10 kHz–30 MHz | all of HF at once · 14-bit | No | about €500 as a kit | A web receiver for several users at once, with GPS timing and TDoA direction finding. |
| HackRF One | 1 MHz–6 GHz | 20 MHz · 8-bit, half-duplex | **Yes** | €300–380 | Transmit-capable: a licence is needed to transmit. Buy from Great Scott Gadgets’ resellers; clones are widespread. |
| ADALM-Pluto | 325 MHz–3.8 GHz | 20 MHz · 12-bit, full duplex | **Yes** | €230–260 | Analog Devices’ learning SDR. Transmit only within a licence. |
| USRP B200mini / B210 | 70 MHz–6 GHz | 56 MHz · 12-bit | **Yes** | €1,500–2,500+ | Research-grade (Ettus/NI). |

## Other receivers {#other-rx}

| Device | For | About | Notes |
|---|---|--:|---|
| Heltec WiFi LoRa 32 V3 / V4 | Meshtastic | €20–30 | ESP32-S3 + SX1262, screen, Wi-Fi (so it serves /json/nodes). |
| LilyGO T-Beam | Meshtastic with GPS | €35–50 | GNSS and an 18650 battery holder; check polarity. |
| RAK WisBlock starter kit (RAK4631) | Meshtastic, low power | €30–40 | nRF52840: weeks on a battery; Bluetooth and USB, no Wi-Fi. |
| u-blox M8/M9/M10 USB receiver | GNSS, Web Serial in Vitruvian Manager | €12–30 | NMEA at 9600 baud out of the box; add an active patch antenna outdoors. |
| u-blox ZED-F9P board | Multi-band GNSS, RTK | €200–300 | L1 and L2/L5 signals; reports jamming and spoofing indicators (in u-blox’s own UBX messages). |
| Analogue hand-held scanner | VHF/UHF listening | from €130 | Uniden BC125AT class. Digital (trunking) scanners cost €500+ and mostly suit US systems. |

> [!legal] **Transmit-capable kit.** Owning a HackRF, Pluto or LimeSDR is legal; transmitting with one needs an amateur licence on amateur frequencies, or must keep within the rules of a licence-exempt band (power, duty cycle, approved equipment). Use a dummy load, attenuators or a shielded box for tests, and see **Law & ethics**.

# Antennas and the bits between {#antennas}

The antenna and where you put it matter more than the receiver. Outdoors, high, clear of the house’s electrical noise, with short low-loss coax: that is most of the performance.

## Antennas {#antenna-types}

| Antenna | Band | Best for | About | Notes |
|---|---|---|--:|---|
| Telescopic dipole kit | 70 MHz–1 GHz (adjust the arms) | General listening; a V-dipole for 137 MHz | in the RTL-SDR Blog kit | Each arm a quarter-wavelength: about 53 cm at 137 MHz, 6.9 cm at 1090 MHz. |
| V-dipole | 137 MHz | Meteor-M LRPT | DIY €5–15 | Two 53.4 cm arms at 120°, horizontal. |
| QFH (quadrifilar helix) | 137 MHz | Weather satellites | DIY €20–40, ready-made €80–150 | Right-hand circular, near-even response from horizon to zenith. |
| Turnstile (crossed dipoles) | 137 / 145 MHz | Satellites | DIY €15 | Simpler than a QFH; weaker near the horizon. |
| Discone | 25 MHz–1.3 GHz | Wideband scanning, airband | €50–100 | Broadband, vertically polarised; a jack of all trades. |
| 1090 MHz collinear or spider | 1090 MHz | ADS-B | DIY €10, ready €50–70 | The single best ADS-B upgrade, mounted high. |
| Marine VHF / 162 MHz dipole | 156–163 MHz | AIS | €40–80 | Mount with a view of the water. |
| Hand-held yagi (“Arrow” type) | 145 / 435 MHz | Amateur satellites, ISS | €100–150, tape-measure DIY €20 | Point by hand along the pass from **Satellites**. |
| Active loop | 10 kHz–30 MHz | Shortwave, mediumwave in noisy homes | €40–300 | Rejects local electrical noise better than a wire. |
| End-fed or random wire + 9:1 unun | 1–30 MHz | HF listening, WSPR | €20–50 | Long and high; keep it away from the house wiring. |
| L-band dish + feed + LNA | 1.69–1.71 GHz | METOP, FengYun, GOES HRIT | €100–250 | Needs aiming or tracking. |

## LNAs and filters {#lna-filters}

A **low-noise amplifier (LNA)** helps when it sits **at the antenna**, before the cable loss; at the receiver end it mostly amplifies noise. Many are powered up the coax by the SDR’s **bias tee**. A **filter** keeps strong out-of-band signals (FM broadcast, mobile masts, TV) from overloading a cheap receiver.

| Item | Use | About |
|---|---|--:|
| Wideband LNA (RTL-SDR Blog, Nooelec LaNA) | General gain at the antenna | €25–40 |
| FM band-stop filter (88–108 MHz) | Stops broadcast FM overload: AIS, airband, 2 m | €20–30 |
| 1090 MHz SAW-filtered LNA | ADS-B in cities | €25–50 |
| 137 MHz filtered LNA | Weather satellites | €30–45 |
| AIS (162 MHz) filtered LNA | Ships | €30–45 |

## Coax and connectors {#coax}

Loss grows with frequency and length. Typical datasheet values (dB per metre; lower is better):

| Cable | 137 MHz | 1090 MHz | 1.7 GHz | Notes |
|---|--:|--:|--:|---|
| RG174 (thin) | 0.33 | 1.0 | 1.3 | Pigtails only: 5 m loses half the signal at 1090 MHz. |
| RG58 | 0.19 | 0.6 | 0.85 | Short indoor runs. |
| RG6 (75 Ω satellite TV) | 0.08 | 0.22 | 0.3 | Cheap and good for receiving; the 50/75 Ω mismatch costs little. |
| LMR-240 / H155 | 0.11 | 0.27 | 0.36 | Flexible, low loss. |
| LMR-400 / Ecoflex 10 | 0.05 | 0.14 | 0.19 | Masts and long runs. |

Connectors: **SMA** on most SDRs (not RP-SMA, the Wi-Fi variant with the pin swapped), **F** on TV coax, **N** outdoors, **BNC** on scanners and test gear, **MCX** on older dongles. Weatherproof outdoor joints with self-amalgamating tape.

## Computers {#computers}

| Computer | Good for | About |
|---|---|--:|
| Raspberry Pi Zero 2 W | One ADS-B or AIS feeder | €18–25 |
| Raspberry Pi 4 / 5 | Feeders, OpenWebRX, SatDump scheduling, several dongles | €60–100 |
| Mini-PC (Intel N100/N150 class) | SatDump L-band, several SDRs, OpenWebRX with many users | €150–250 |
| Your laptop | SDR++, SDR#, WSJT-X, analysis | – |

Use the official power supply on a Pi: undervoltage is the commonest cause of dropped USB samples.

## Test gear {#test-gear}

| Tool | What it tells you | About |
|---|---|--:|
| NanoVNA (H, H4) | Antenna resonance and match (SWR), cable faults | €50–100 |
| tinySA (Basic, Ultra) | A pocket spectrum analyser: find interference and overload | €60–150 |

Buy from the projects’ listed sellers ([nanovna.com](https://nanovna.com/), [tinysa.org](https://tinysa.org/)): clones vary widely.

# How software and hardware fit together {#patterns}

Six patterns cover almost every station. Vitruvian Manager’s connectors use the first three; the others are how bigger setups grow.

<figure class="dg" id="pattern-a"><div class="dg-wrap"><svg viewBox="0 0 860 160" role="img" aria-labelledby="dga-t"><title id="dga-t">Receiver, decoder, local web API, optional Vitruvian Manager bridge, Vitruvian Manager page</title><defs><marker id="ah-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<rect class="dg-box" x="11" y="56" width="130" height="86" rx="6"/><text class="dg-t" x="23" y="80">Antenna + SDR</text><text class="dg-s" x="23" y="100">RTL-SDR, Airspy,</text><text class="dg-s" x="23" y="116">a LoRa radio</text>
<rect class="dg-box" x="188" y="56" width="130" height="86" rx="6"/><text class="dg-t" x="200" y="80">Decoder</text><text class="dg-s" x="200" y="100">readsb, AIS-catcher,</text><text class="dg-s" x="200" y="116">OpenWebRX</text>
<rect class="dg-box" x="365" y="56" width="130" height="86" rx="6"/><text class="dg-t" x="377" y="80">Local web API</text><text class="dg-s" x="377" y="100">aircraft.json,</text><text class="dg-s" x="377" y="116">ships.json…</text>
<rect class="dg-box alt" x="542" y="56" width="130" height="86" rx="6"/><text class="dg-t" x="554" y="80">VM bridge</text><text class="dg-s" x="554" y="100">localhost only;</text><text class="dg-s" x="554" y="116">adds CORS</text>
<rect class="dg-box accent" x="719" y="56" width="130" height="86" rx="6"/><text class="dg-t" x="731" y="80">VM page</text><text class="dg-s" x="731" y="100">in your browser,</text><text class="dg-s" x="731" y="116">polls every 5–15 s</text>
<path class="dg-line" d="M141,99H185" marker-end="url(#ah-a)"/><text class="dg-m" x="163" y="92" text-anchor="middle">IQ</text>
<path class="dg-line" d="M318,99H362" marker-end="url(#ah-a)"/><text class="dg-m" x="340" y="92" text-anchor="middle">msgs</text>
<path class="dg-line" d="M495,99H539" marker-end="url(#ah-a)"/><text class="dg-m" x="517" y="92" text-anchor="middle">HTTP</text>
<path class="dg-line" d="M672,99H716" marker-end="url(#ah-a)"/><text class="dg-m" x="694" y="92" text-anchor="middle">CORS</text>
<path class="dg-line soft" d="M430,56V28H784V53" marker-end="url(#ah-a)"/><text class="dg-m" x="607" y="21" text-anchor="middle">direct, when the receiver sends CORS headers (AIS-catcher, Meshtastic)</text>
</svg></div><figcaption><b>Figure H1.</b> Pattern (a): receiver → decoder → local JSON over HTTP → Vitruvian Manager. The decoder publishes JSON on your network; Vitruvian Manager reads it directly when the decoder allows other sites (CORS), otherwise through the Vitruvian Manager bridge on your computer.</figcaption></figure>

<figure class="dg" id="pattern-b"><div class="dg-wrap"><svg viewBox="0 0 860 230" role="img" aria-labelledby="dgb-t"><title id="dgb-t">Feeders send data to aggregators; adsb.lol publishes an open API that Vitruvian Manager reads</title><defs><marker id="ah-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<rect class="dg-box accent" x="10" y="20" width="135" height="50" rx="6"/><text class="dg-t" x="22" y="41">Your Pi feeder</text><text class="dg-s" x="22" y="59">readsb + feed clients</text>
<rect class="dg-box" x="10" y="90" width="135" height="50" rx="6"/><text class="dg-t" x="22" y="111">Other feeders</text><text class="dg-s" x="22" y="129">volunteers nearby</text>
<rect class="dg-box alt" x="10" y="160" width="135" height="50" rx="6"/><text class="dg-t" x="22" y="181">…thousands</text><text class="dg-s" x="22" y="199">worldwide</text>
<rect class="dg-box" x="185" y="20" width="140" height="50" rx="6"/><text class="dg-t" x="197" y="41">adsb.lol</text><text class="dg-s" x="197" y="59">open data (ODbL)</text>
<rect class="dg-box" x="185" y="90" width="140" height="50" rx="6"/><text class="dg-t" x="197" y="111">FlightAware</text><text class="dg-s" x="197" y="129">own site and apps</text>
<rect class="dg-box" x="185" y="160" width="140" height="50" rx="6"/><text class="dg-t" x="197" y="181">ADS-B Exchange</text><text class="dg-s" x="197" y="199">own site; paid API</text>
<path class="dg-line" d="M145,45H182" marker-end="url(#ah-b)"/><path class="dg-line" d="M145,45L182,112" marker-end="url(#ah-b)"/><path class="dg-line" d="M145,45L182,180" marker-end="url(#ah-b)"/>
<path class="dg-line soft" d="M145,115L182,50"/><path class="dg-line soft" d="M145,115H182"/><path class="dg-line soft" d="M145,115L182,185"/><path class="dg-line soft" d="M145,185L182,55"/><path class="dg-line soft" d="M145,185L182,120"/><path class="dg-line soft" d="M145,185H182"/>
<rect class="dg-box" x="370" y="20" width="140" height="50" rx="6"/><text class="dg-t" x="382" y="41">Public API</text><text class="dg-s" x="382" y="59">api.adsb.lol</text>
<rect class="dg-box alt" x="550" y="20" width="135" height="50" rx="6"/><text class="dg-t" x="562" y="41">VM proxy</text><text class="dg-s" x="562" y="59">or your bridge</text>
<rect class="dg-box accent" x="725" y="20" width="125" height="50" rx="6"/><text class="dg-t" x="737" y="41">VM Aircraft</text><text class="dg-s" x="737" y="59">map and table</text>
<path class="dg-line" d="M325,45H367" marker-end="url(#ah-b)"/><path class="dg-line" d="M510,45H547" marker-end="url(#ah-b)"/><path class="dg-line" d="M685,45H722" marker-end="url(#ah-b)"/>
<text class="dg-s" x="370" y="112">Feeders send raw messages to aggregators, and each aggregator</text><text class="dg-s" x="370" y="130">decides what to publish. adsb.lol publishes its merged data openly</text><text class="dg-s" x="370" y="148">under the ODbL, so VM can show it (through a small proxy, because</text><text class="dg-s" x="370" y="166">the API sends no CORS headers). The others keep their data on their</text><text class="dg-s" x="370" y="184">own sites and apps, with free access in return for feeding.</text>
</svg></div><figcaption><b>Figure H2.</b> Pattern (b): Raspberry Pi feeder → aggregators → public API → Vitruvian Manager. One feeder can send to several networks at once; what you get back depends on each network’s data policy.</figcaption></figure>

<figure class="dg" id="pattern-c"><div class="dg-wrap"><svg viewBox="0 0 860 170" role="img" aria-labelledby="dgc-t"><title id="dgc-t">USB devices connect straight into the browser through Web Serial or WebUSB</title><defs><marker id="ah-c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<rect class="dg-box" x="10" y="12" width="180" height="44" rx="6"/><text class="dg-t" x="22" y="31">USB GNSS receiver</text><text class="dg-m" x="22" y="47">NMEA text</text>
<rect class="dg-box" x="10" y="63" width="180" height="44" rx="6"/><text class="dg-t" x="22" y="82">Meshtastic radio</text><text class="dg-m" x="22" y="98">protobuf frames</text>
<rect class="dg-box alt" x="10" y="114" width="180" height="44" rx="6"/><text class="dg-t" x="22" y="133">RTL-SDR (planned)</text><text class="dg-m" x="22" y="149">raw IQ samples</text>
<rect class="dg-box" x="250" y="12" width="270" height="146" rx="6"/><text class="dg-t" x="266" y="38">Your browser (Chrome, Edge)</text><text class="dg-s" x="266" y="62">Web Serial: GNSS, Meshtastic</text><text class="dg-s" x="266" y="80">WebUSB: RTL-SDR (planned)</text><text class="dg-s" x="266" y="108">You pick the device in a prompt;</text><text class="dg-s" x="266" y="126">the page can’t see anything else.</text>
<rect class="dg-box accent" x="590" y="48" width="260" height="74" rx="6"/><text class="dg-t" x="606" y="76">VM decodes in the page</text><text class="dg-s" x="606" y="96">No server and nothing uploaded</text>
<path class="dg-line" d="M190,34H247" marker-end="url(#ah-c)"/><path class="dg-line" d="M190,85H247" marker-end="url(#ah-c)"/><path class="dg-line soft" d="M190,136H247" marker-end="url(#ah-c)"/><text class="dg-m" x="219" y="27" text-anchor="middle">USB</text>
<path class="dg-line" d="M520,85H587" marker-end="url(#ah-c)"/>
</svg></div><figcaption><b>Figure H3.</b> Pattern (c): browser-direct. Chrome and Edge on desktop can talk to a USB serial device (Web Serial) or a USB device (WebUSB) after you choose it, so a GNSS receiver or a Meshtastic radio needs no software at all. Firefox and Safari don’t support this.</figcaption></figure>

<figure class="dg" id="pattern-d"><div class="dg-wrap"><svg viewBox="0 0 860 170" role="img" aria-labelledby="dgd-t"><title id="dgd-t">Publishers send to an MQTT broker; subscribers feed dashboards</title><defs><marker id="ah-d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<rect class="dg-box" x="10" y="20" width="150" height="50" rx="6"/><text class="dg-t" x="22" y="41">rtl_433</text><text class="dg-s" x="22" y="59">433/868 MHz sensors</text>
<rect class="dg-box" x="10" y="100" width="150" height="50" rx="6"/><text class="dg-t" x="22" y="121">Meshtastic gateway</text><text class="dg-s" x="22" y="139">mesh → MQTT uplink</text>
<rect class="dg-box" x="225" y="45" width="175" height="80" rx="6"/><text class="dg-t" x="239" y="69">MQTT broker</text><text class="dg-s" x="239" y="89">Mosquitto on a Pi</text><text class="dg-m" x="239" y="108">rtl_433/…  msh/…</text>
<rect class="dg-box" x="460" y="45" width="165" height="80" rx="6"/><text class="dg-t" x="474" y="69">Subscriber</text><text class="dg-s" x="474" y="89">Node-RED, Home</text><text class="dg-s" x="474" y="106">Assistant, a script</text>
<rect class="dg-box accent" x="685" y="45" width="165" height="80" rx="6"/><text class="dg-t" x="699" y="69">Dashboard</text><text class="dg-s" x="699" y="89">VM (via JSON),</text><text class="dg-s" x="699" y="106">Grafana, Home Asst.</text>
<path class="dg-line" d="M160,45L222,72" marker-end="url(#ah-d)"/><path class="dg-line" d="M160,125L222,98" marker-end="url(#ah-d)"/><text class="dg-m" x="190" y="92" text-anchor="middle">publish</text>
<path class="dg-line" d="M400,85H457" marker-end="url(#ah-d)"/><text class="dg-m" x="429" y="78" text-anchor="middle">subscribe</text>
<path class="dg-line" d="M625,85H682" marker-end="url(#ah-d)"/><text class="dg-m" x="654" y="78" text-anchor="middle">HTTP</text>
</svg></div><figcaption><b>Figure H4.</b> Pattern (d): a message bus. Decoders publish to an MQTT broker; anything can subscribe. A small subscriber can expose the latest values as JSON for Vitruvian Manager (through the bridge) or feed Home Assistant and Grafana. Keep only your own devices’ data.</figcaption></figure>

<figure class="dg" id="pattern-e"><div class="dg-wrap"><svg viewBox="0 0 860 160" role="img" aria-labelledby="dge-t"><title id="dge-t">Record IQ to a file, then analyse offline</title><defs><marker id="ah-e" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<rect class="dg-box" x="10" y="30" width="140" height="80" rx="6"/><text class="dg-t" x="22" y="54">SDR</text><text class="dg-s" x="22" y="74">any receiver</text>
<rect class="dg-box" x="185" y="30" width="140" height="80" rx="6"/><text class="dg-t" x="197" y="54">Recorder</text><text class="dg-s" x="197" y="74">rtl_sdr, SDR++,</text><text class="dg-s" x="197" y="91">SatDump baseband</text>
<rect class="dg-box alt" x="360" y="30" width="140" height="80" rx="6"/><text class="dg-t" x="372" y="54">IQ file</text><text class="dg-s" x="372" y="74">.cu8 .cs16 .wav</text><text class="dg-s" x="372" y="91">+ SigMF metadata</text>
<rect class="dg-box" x="535" y="30" width="140" height="80" rx="6"/><text class="dg-t" x="547" y="54">Offline tools</text><text class="dg-s" x="547" y="74">inspectrum, URH,</text><text class="dg-s" x="547" y="91">GNU Radio, SatDump</text>
<rect class="dg-box accent" x="710" y="30" width="140" height="80" rx="6"/><text class="dg-t" x="722" y="54">Results</text><text class="dg-s" x="722" y="74">bits, images,</text><text class="dg-s" x="722" y="91">measurements</text>
<path class="dg-line" d="M150,70H182" marker-end="url(#ah-e)"/><path class="dg-line" d="M325,70H357" marker-end="url(#ah-e)"/><path class="dg-line" d="M500,70H532" marker-end="url(#ah-e)"/><path class="dg-line" d="M675,70H707" marker-end="url(#ah-e)"/>
<text class="dg-m" x="10" y="140">2.4 million samples a second at 8 bits each for I and Q is 4.8 MB a second: about 17 GB an hour.</text>
</svg></div><figcaption><b>Figure H5.</b> Pattern (e): record IQ, analyse later. Recording the raw samples lets you replay a satellite pass through a different decoder, or measure a signal slowly. Record only signals you may lawfully receive, and label recordings with SigMF metadata (frequency, rate, time, place).</figcaption></figure>

<figure class="dg" id="pattern-f"><div class="dg-wrap"><svg viewBox="0 0 860 260" role="img" aria-labelledby="dgf-t"><title id="dgf-t">Multilateration: several time-synchronised receivers locate an aircraft from time differences</title><defs><marker id="ah-f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker></defs>
<path class="dg-plane" transform="translate(430,26) scale(1.5)" d="M0,-9 L1.6,-3 L8,1.2 L8,3 L1.6,1.6 L1.2,6 L3.6,7.8 L3.6,9 L0,8.1 L-3.6,9 L-3.6,7.8 L-1.2,6 L-1.6,1.6 L-8,3 L-8,1.2 L-1.6,-3 Z"/><text class="dg-m" x="458" y="22">Mode S reply: no position inside</text>
<path class="dg-rf" d="M430,42L105,96"/><path class="dg-rf" d="M430,42L320,96"/><path class="dg-rf" d="M430,42L540,96"/><path class="dg-rf" d="M430,42L755,96"/>
<rect class="dg-box" x="30" y="96" width="150" height="48" rx="6"/><text class="dg-t" x="42" y="116">Receiver A</text><text class="dg-s" x="42" y="134">GNSS-timed clock</text>
<rect class="dg-box" x="245" y="96" width="150" height="48" rx="6"/><text class="dg-t" x="257" y="116">Receiver B</text><text class="dg-s" x="257" y="134">GNSS-timed clock</text>
<rect class="dg-box" x="465" y="96" width="150" height="48" rx="6"/><text class="dg-t" x="477" y="116">Receiver C</text><text class="dg-s" x="477" y="134">GNSS-timed clock</text>
<rect class="dg-box" x="680" y="96" width="150" height="48" rx="6"/><text class="dg-t" x="692" y="116">Receiver D</text><text class="dg-s" x="692" y="134">GNSS-timed clock</text>
<path class="dg-line" d="M105,144L345,193" marker-end="url(#ah-f)"/><path class="dg-line" d="M320,144L405,193" marker-end="url(#ah-f)"/><path class="dg-line" d="M540,144L460,193" marker-end="url(#ah-f)"/><path class="dg-line" d="M755,144L520,193" marker-end="url(#ah-f)"/>
<rect class="dg-box" x="300" y="196" width="260" height="50" rx="6"/><text class="dg-t" x="316" y="217">MLAT server</text><text class="dg-s" x="316" y="235">arrival-time differences → position</text>
<rect class="dg-box accent" x="640" y="196" width="210" height="50" rx="6"/><text class="dg-t" x="654" y="217">Position</text><text class="dg-s" x="654" y="235">back to the feeders’ maps</text>
<path class="dg-line" d="M560,221H637" marker-end="url(#ah-f)"/>
<text class="dg-s" x="20" y="210">Four or more receivers hear the same</text><text class="dg-s" x="20" y="226">message; clocks agree to well under a</text><text class="dg-s" x="20" y="242">microsecond (GNSS time, PPS, GPSDO).</text>
</svg></div><figcaption><b>Figure H6.</b> Pattern (f): GPS-disciplined timing and multilateration. Receivers that share precise time can locate a transmitter from the differences in arrival time: MLAT networks position aircraft that send no ADS-B position, and KiwiSDR’s TDoA does the same for HF transmitters. Accurate time from GNSS (or a GPS-disciplined oscillator) is what makes it work.</figcaption></figure>

# Frequencies: what lives where {#bands}

A primer for the bands this dashboard touches. Ireland and the UK follow the European (ITU Region 1) plan; North America is Region 2, and the differences catch people out.

| Band | Range | What you hear | Ireland, UK and EU | United States |
|---|---|---|---|---|
| LF | 30–300 kHz | Time signals, a few longwave broadcasters | MSF 60 kHz (UK), DCF77 77.5 kHz (DE) | WWVB 60 kHz; no longwave broadcasting |
| MF | 0.3–3 MHz | AM broadcast, NAVTEX (518 kHz), 160 m amateur | AM 531–1602 kHz in 9 kHz steps; 160 m 1.810–2.000 MHz | AM 530–1700 kHz in 10 kHz steps; 160 m 1.800–2.000 MHz |
| HF | 3–30 MHz | Shortwave broadcast, amateur bands, CB, weather fax, time signals | 40 m 7.0–7.2 MHz; 80 m 3.5–3.8 MHz; CB 26.965–27.405 MHz (UK also 27.60–27.99 MHz) | 40 m 7.0–7.3 MHz; 80 m 3.5–4.0 MHz; WWV on 2.5–20 MHz |
| VHF | 30–300 MHz | FM broadcast, aviation, weather satellites, amateur 2 m, marine, AIS, DAB | FM 87.5–108 MHz; 2 m 144–146 MHz; DAB 174–240 MHz | FM 88–108 MHz; 2 m 144–148 MHz; NOAA Weather Radio 162.40–162.55 MHz |
| VHF (cont.) | 108–137 MHz | Aircraft navigation (108–118) and voice (118–137, AM) | Not “general reception”: see Law & ethics | Legal to monitor |
| VHF (cont.) | 156–163 MHz | Marine VHF; AIS on 161.975 and 162.025 MHz | Voice is not general reception; AIS widely received | Legal to monitor |
| UHF | 300 MHz–3 GHz | 70 cm amateur, LoRa and other short-range devices, ADS-B 1090, GNSS L1 1575.42, L-band weather satellites | 70 cm around 430–440 MHz; PMR446; LoRa 868 MHz | 70 cm 420–450 MHz; LoRa 902–928 MHz |
| SHF | 3–30 GHz | Satellite TV, QO-100’s amateur downlink at 10.489 GHz, X-band weather satellites | QO-100 in view | QO-100 not in view |

> [!warn] **Bands to leave alone.** Mobile networks, cordless phones, Wi-Fi and other people’s data links, pagers, encrypted public-safety radio (TETRA, P25 with encryption) and satellite phone systems carry private communications. Receiving them is interception; this dashboard and its cookbook don’t help with any of them.

# Propagation basics {#propagation}

- **Ground wave** (LF and MF) follows the Earth’s surface: steady, regional, strongest over sea water.
- **Sky wave** (HF) bounces off the ionosphere. The **F layer** reflects; the **D layer** absorbs, more by day and more at low frequencies. The **maximum usable frequency (MUF)** rises with solar activity (solar flux F10.7) and in daylight; flares and geomagnetic storms disrupt it: see **Space weather**.
- **Line of sight** (VHF and up): range depends on both antenna heights. The radio horizon is roughly `4.12 × (√h1 + √h2)` km with heights in metres, so an antenna 10 m up sees an aircraft at 10,000 m about 425 km away, and a ship’s 20 m mast about 30 km.
- **Openings beyond the horizon** at VHF: **tropospheric ducting** under high pressure, **sporadic E** (mostly May to August: FM broadcast and 6 m from 1,000–2,000 km), **aurora** during storms, and **meteor scatter**.
- **Satellites** move fast: their signals shift in frequency (Doppler) by up to about ±3.5 kHz at 145 MHz and ±10 kHz at 435 MHz during a low-orbit pass, which Gpredict or SDR++ can correct.

# RF and site safety {#safety}

- **Receiving is safe; installing antennas is where people get hurt.** Work from a stable ladder with someone holding it, never on a roof alone, and never near overhead power lines: keep any mast or antenna far enough away that it can’t touch a line if it falls.
- **Lightning:** earth outdoor masts, fit a coax surge arrester at the point of entry, and disconnect antennas in storms.
- **Water:** weatherproof outdoor connectors and form a drip loop in the cable.
- **Batteries:** lithium cells in solar LoRa nodes need protected cells, ventilation and shade; charge with the right controller.
- **Transmitting** (licensed only): keep to the RF exposure limits (ICNIRP in Europe; Ofcom expects licensees to assess EMF exposure; the FCC requires an RF exposure evaluation), and never transmit into an LNA or a receiver.

# Starter shopping lists {#shopping}

Three budgets, each a complete station. Prices as in the tables above; all receive-only.

## About €30 {#buy-30}

| Item | About |
|---|--:|
| RTL-SDR dongle with telescopic antenna (generic R820T2; or €10–20 more for an RTL-SDR Blog V4L kit with HF and a bias tee) | €25–45 |
| Free software: SDR++, SatDump, AIS-catcher, readsb, WSJT-X | €0 |
| **What you can do:** FM and airband listening (where legal), ADS-B aircraft within 50–100 km from a window, Meteor-M images with the dipole set as a V, AIS near the coast, 2 m amateur and the ISS. | |

## About €150 {#buy-150}

| Item | About |
|---|--:|
| RTL-SDR Blog V4 or V4L with dipole kit | €50–65 |
| Raspberry Pi 4 (2 GB) or Pi Zero 2 W, power supply, microSD card | €35–75 |
| 1090 MHz antenna (DIY collinear €10, or ready-made) | €10–60 |
| USB GNSS receiver (u-blox) for **GNSS interference** | €15–25 |
| LoRa board (Heltec V3 or RAK starter kit) for **Mesh & APRS** | €25–35 |
| **What you get:** a 24/7 aircraft feeder for **Aircraft**, a GNSS monitor, a Meshtastic node, and the dongle back for satellites at weekends. | |

## About €500 {#buy-500}

| Item | About |
|---|--:|
| HF-capable SDR: SDRplay RSPdx-R2 or Airspy HF+ Discovery | €190–280 |
| Active loop or a good end-fed wire for HF | €40–120 |
| Raspberry Pi 5 with case, cooler and official supply | €90–120 |
| Second RTL-SDR (V4/V4L) with a filtered 1090 MHz LNA and outdoor antenna | €100–130 |
| NanoVNA or tinySA for antenna and interference checks | €50–100 |
| **What you get:** a shortwave and HF propagation station (WSPR, FT8 reporting), a dedicated ADS-B feeder, and the test gear to make antennas work. | |

# From SIGINT to OSINT {#osint}

Signals you can lawfully receive are open sources. In investigations they are evidence to corroborate, never conclusions on their own.

- **Flight tracking.** Public ADS-B and MLAT show government, military-transport and surveillance aircraft when their transponders are on: orbit patterns over a region, a state aircraft’s unusual destination, a sudden absence. Limits: transponders can be switched off or set to hide identity, aggregators filter some aircraft, and privacy programmes (LADD, PIA) exist for good reasons. Track aircraft and organisations, not private individuals.
- **Ship tracking.** AIS reveals ship-to-ship transfers, ports of call and “going dark” (gaps in reporting), all central to sanctions and smuggling investigations. AIS can be spoofed: positions that jump, ships “parked” in impossible places or circling in a pattern are warnings. Cross-check against satellite imagery and port records.
- **GNSS interference as an indicator.** Persistent jamming or spoofing in GPSJam or Flightradar24 maps often tracks military activity and conflict zones. It is a lead: interference has many sources, and the maps can’t say who is responsible.
- **Space weather and HF.** When a radio link or GNSS service fails, check **Space weather** before suspecting anything else: flares and storms cause outages too.

Method matters more than tools: record what you saw, when and from which source; grade how reliable each source is; and look for independent confirmation. Vitruvian Manager’s [OSINT Training](#/oi/osint-training) course covers the intelligence cycle, source grading, verification and geolocation, with exercises.
