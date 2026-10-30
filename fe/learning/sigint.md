title: Signals intelligence (SIGINT)
intro: A practical, university-style course in signals intelligence (SIGINT) for the individual analyst, taught entirely within the law and receive-only: what SIGINT is and what you may lawfully do, radio fundamentals, software-defined radio, tracking aircraft and ships, satellites and space weather, satellite-navigation interference, the near spectrum of mesh and amateur data, and the tradecraft, law and ethics that bound the work. Each practical unit ends with how to do it in Vitruvian Manager's SIGINT Dashboard, and the course closes with two capstone exercises.
sources: Written for Vitruvian Manager from public, primary material checked in October 2026: regulators and legislation (ComReg and the Irish Statute Book, Ofcom and legislation.gov.uk, the FCC), NOAA's Space Weather Prediction Center, CelesTrak, ARISS, IMO and ICAO documentation, and the dashboards' own sources. Frequencies and satellite status change; the text says so where it matters and points to a live status page rather than guessing.

# Unit 1 · Foundations

## What SIGINT is, and what you may lawfully do
Signals intelligence (SIGINT) is intelligence produced from **transmitted signals**: the radio waves that aircraft, ships, satellites, beacons and devices put into the air. The professional discipline has three branches: **COMINT** (from communications), **ELINT** (from emissions that are not communications, such as radar) and **FISINT** (from instrumentation signals, such as a missile's telemetry). This course teaches none of them as a state practises them. It teaches what an individual can do lawfully, from a desk and an antenna, with public signals: **observe, measure, identify and correlate the transmissions that are meant to be received by anyone.**

Two ideas bound everything that follows.
- **Receive only.** Listening and decoding are one thing; transmitting is another. Transmitting needs a licence or a licence-exempt device used within its limits. This course never transmits, and it never asks you to jam, spoof or replay a signal.
- **Open means meant for general reception.** Broadcasting, amateur radio, aircraft and ship safety broadcasts, weather satellites, navigation and time signals are sent to be heard by all. The content of private communications is not, and intercepting it, decrypting protected signals, or passing on what you overheard are offences (Unit 11). The line is not about what your antenna can pick up; it is about what the signal was for.

A hobbyist with a thirty-euro receiver can see airliners 200 km away, read ships' identities from across a bay, pull pictures from a Russian weather satellite and hear a geomagnetic storm disturb the shortwave bands, while maps built from the same aircraft broadcasts show where satellite navigation is being jammed around a war. All of it comes from signals broadcast in the clear. That is the raw material. Turning it into intelligence is the rest of the course.

! Scope: This course studies aircraft, ships, satellites, infrastructure and the spectrum itself: things, patterns and places. It does not teach, and you should not attempt, following or profiling private individuals from their signals; Unit 11 explains why, and the ethics run through every unit.

? What most sharply separates lawful hobby SIGINT from interception?
* The power of the receiver you use
+ Whether the signal was meant for general reception, not merely whether you can hear it
* Whether the signal is analogue or digital
= The legal line turns on what a transmission is for. Broadcast, amateur, ADS-B, AIS and weather signals are meant for anyone; the content of private communications is not, however easily it is received.

? Why is "receive only" the first rule of this course?
* Receivers are cheaper than transmitters
* Transmitting gives worse results
+ Receiving public signals is broadly lawful, while transmitting needs a licence (or a licence-exempt device within its limits) and jamming or spoofing is an offence everywhere this course covers
= Reception of signals meant for all is generally allowed; putting energy into the air (transmitting, jamming, spoofing, replaying) is regulated or criminal, and this course never does it.

## From signal to intelligence
A decoded signal is **information**, not intelligence. It becomes intelligence only when it is evaluated, combined with other evidence and used to answer a question. The intelligence cycle of the [OSINT course](#/oi/osint-training) applies here unchanged: **direction** (the question first), **collection** (which signals, from which receivers), **processing** (decode, timestamp, log), **analysis** (what it does and does not show), **dissemination** and **feedback**.

Signals have particular strengths and particular traps.
- **They are precise and time-stamped.** A position report carries a latitude, a longitude and a second. That precision tempts over-confidence: the report is exactly what the transmitter *said*, which is not always where it *was*.
- **The source is the transmitter, not your receiver.** Grade a track the way the OSINT course grades any source (the Admiralty system: a letter for reliability, a number for credibility). An aircraft's own ADS-B is usually reliable; an AIS name or destination keyed in by hand, or a position that may be spoofed, is not.
- **Absence is ambiguous.** No signal can mean the transmitter is off, out of range, blocked by terrain, filtered by an aggregator, or never there. A gap is a question, not an answer.
- **Corroborate across collection paths.** A single clip, a single feed and a single sensor are each one source. An AIS gap confirmed by radar imagery, or a jamming report confirmed by several unrelated aircraft, is corroboration; one transponder on its own is not.

! Rule of thumb: Write down what the signal physically shows, then, separately, what you infer from it. "The aircraft stopped broadcasting ADS-B at 14:02" is an observation; "the aircraft landed" is an inference, and often a wrong one.

? A ship's AIS shows it alongside a berth it cannot physically reach. What is the right first reading?
* The ship has moved the berth
+ The position is the transmitter's claim, which may be stale, mistyped or spoofed, and needs corroboration
* The receiver is faulty
= A position report is what the transmitter sent, not a proven fact. Impossible positions are a classic sign of a stale fix or deliberate spoofing, to be checked against other sources.

? Why is a sudden loss of an aircraft's ADS-B signal a weak basis for concluding it has landed?
+ Loss of signal has many causes (range, terrain, the transponder switched off, aggregator filtering), so absence alone is ambiguous
* Aircraft never switch off their transponders
* ADS-B is always received perfectly
= No signal is not the same as no aircraft. Before inferring a landing, rule out range, terrain and a deliberately silent transponder, and look for corroboration.

# Unit 2 · Radio fundamentals

## Frequency, wavelength and the bands
A radio signal is an electromagnetic wave. Its **frequency** (how many cycles pass each second, measured in hertz) and its **wavelength** (the physical length of one cycle) are tied together by the speed of light. For a quick figure in air:

$ wavelength (metres) ≈ 300 ÷ frequency (MHz)

So 1090 MHz (aircraft ADS-B) has a wavelength of about 0.28 m, and a quarter-wave element for it is about 6.9 cm; 137 MHz (weather satellites) is about 2.2 m, with a quarter-wave of about 55 cm (real elements are cut a little shorter). Antenna sizes follow directly from this: the lower the frequency, the bigger the antenna.

The spectrum is divided into **bands**, and what you can hear depends on which one. Ireland and the UK follow the European plan (ITU Region 1); North America (Region 2) differs, which catches people out.

| Band | Range | What lives there |
|---|---|---|
| LF | 30–300 kHz | Time signals (MSF 60 kHz, DCF77 77.5 kHz), a little longwave |
| MF | 0.3–3 MHz | AM broadcast, NAVTEX, the 160 m amateur band |
| HF | 3–30 MHz | Shortwave broadcast, amateur bands, CB, weather fax, WSPR and FT8 |
| VHF | 30–300 MHz | FM and DAB, aircraft (118–137 MHz), weather satellites (137 MHz), marine and AIS (156–162 MHz), 2 m amateur |
| UHF | 0.3–3 GHz | 70 cm amateur, LoRa (868/915 MHz), ADS-B (1090 MHz), GNSS (around 1.1–1.6 GHz) |
| SHF | 3–30 GHz | Satellite television, the QO-100 amateur downlink (10.5 GHz), X-band satellites |

**Frequency allocation** is why the dashboard can tell you where to look: every service has its slice. It also marks the bands you leave alone. Mobile networks, cordless phones, Wi-Fi, pagers and encrypted public-safety radio carry private traffic; receiving their content is interception, and Vitruvian Manager gives no help with any of them.

! Caution: Numbers here are the published allocations in Region 1 and Region 2 as they stood in October 2026. Allocations change, and a frequency legal to monitor in one country can be a private service in another. When in doubt, check the regulator (ComReg, Ofcom, the FCC).

? An aircraft signal is at 1090 MHz and a weather satellite at about 137 MHz. What follows for their antennas?
* The 1090 MHz antenna is much larger
* Both need the same size of antenna
+ The 137 MHz antenna is much larger, because wavelength grows as frequency falls
= Wavelength is inversely proportional to frequency. At 137 MHz a wave is about 2.2 m long; at 1090 MHz about 0.28 m, so the higher-frequency antenna is far smaller.

? Why does this course not help with receiving mobile-phone or encrypted public-safety traffic?
* The signals are too weak to hear
+ They carry private communications, so receiving their content is interception, not open reception
* They are on frequencies no receiver can reach
= Those bands carry communications meant for specific parties. Intercepting their content is an offence; the hobby stays with signals meant for general reception.

## Modulation: how information rides a wave
A bare wave at one frequency (a **carrier**) carries no information until it is **modulated**: varied in some way to encode sound or data. The three classic analogue schemes vary different properties of the carrier.
- **AM** (amplitude modulation) varies the strength. It is simple and used by longwave and mediumwave broadcast and, importantly, by **aircraft voice** (118–137 MHz), so two stations transmitting together produce a characteristic heterodyne.
- **FM** (frequency modulation) varies the frequency. Broadcast FM is wide (about 200 kHz) and hi-fi; **narrow FM** (roughly 11–16 kHz) carries marine and amateur voice and many data modes.
- **SSB** (single sideband) is a stripped-down AM that sends only one sideband and no carrier, so it is efficient over long distances: the standard for HF voice and much amateur work. Tuned slightly wrong, SSB voice sounds comically high or low.
- **CW** (continuous wave) is Morse: the carrier switched on and off. It occupies almost no bandwidth and gets through when nothing else will.

**Digital modes** encode bits rather than sound, usually by shifting frequency (**FSK**), phase (**PSK**) or both, and often across many sub-carriers at once (**OFDM**, as in DAB). The signals you will decode in this course are nearly all digital: ADS-B and Mode S are pulses at 1090 MHz, AIS is GMSK (a smooth form of FSK) at 162 MHz, weather-satellite LRPT is phase-modulated, and the weak-signal amateur modes FT8 and WSPR are narrow FSK.

**Bandwidth** is how much spectrum a signal occupies, and it is set by how fast the information flows: Morse needs almost none, voice a few kilohertz, a weather-satellite image around a hundred kilohertz, live television megahertz. A receiver must be wide enough to take in the whole signal but no wider, or it only adds noise. On a waterfall (Unit 4) each mode has a recognisable shape and width, which is often how you identify an unknown signal.

! Worked example: On HF, a signal about 2.5 kHz wide with no steady carrier, whose audio is garbled "Donald Duck" speech until you switch to USB or LSB, is single sideband. Two thin lines 170 Hz apart, with the signal flicking steadily between them, are amateur radioteletype (RTTY); a cluster of narrow signals about 50 Hz wide that start and stop together every 15 seconds is FT8. In the VHF broadcast band, a signal about 200 kHz wide carrying music is FM. Width and behaviour name the mode before you decode a bit.

? Aircraft voice on 118–137 MHz uses AM rather than FM. What practical consequence does this have?
+ Two aircraft transmitting at once produce a heterodyne whistle rather than one capturing the channel
* The signal cannot be received by an SDR
* It carries no voice, only data
= AM lets simultaneous transmissions mix audibly (a heterodyne), which is one reason aviation kept it: a blocked transmission is obvious. FM, by contrast, tends to capture the strongest signal.

? What mainly determines how much bandwidth a signal occupies?
* The transmitter's power
* The carrier frequency: the higher it is, the wider every signal must be
+ How fast information is sent: more data per second needs more spectrum
= Bandwidth follows the information rate. Morse needs almost none, voice a few kilohertz, an image or video far more. Matching receiver bandwidth to the signal keeps out needless noise.

## Decibels, noise and sensitivity
Radio engineers measure ratios in **decibels (dB)** because signal strengths span an enormous range. The decibel is logarithmic:

$ ratio in dB = 10 × log₁₀(power out ÷ power in)

Three numbers are worth memorising: **+3 dB** is roughly double the power, **−3 dB** is half, and **+10 dB** is ten times. Gains and losses then simply add: an antenna that gives +6 dB into 4 dB of cable loss nets +2 dB. An absolute level is written **dBm**, referenced to one milliwatt; received signals are deep in the negatives, often around −100 dBm, and satellite-navigation signals arrive near −130 dBm, below the noise.

What limits reception is not signal strength alone but the **signal-to-noise ratio (SNR)**: how far the signal stands above the background. That background, the **noise floor**, comes partly from the receiver and, at HF and VHF, far more from the environment: switching power supplies, LED lighting, car chargers, plasma screens and poor-quality electronics fill a modern home with radio noise. This is why **the antenna and where you put it matter more than the receiver**. An antenna outdoors, high, and away from the house's electrical noise can lift the SNR more than any amount of gain indoors.

A **low-noise amplifier (LNA)** helps only when it sits at the antenna, before the cable loss; at the receiver end it mostly amplifies noise already mixed in. A **filter** stops strong out-of-band signals (broadcast FM, mobile masts) from overloading a cheap receiver and raising its noise floor everywhere. More gain is not better: once turning it up makes the noise floor rise, signal and noise are rising together, and beyond that point extra gain only risks overloading the receiver into false signals.

! Keep in mind: You cannot amplify your way past noise. If the signal and the noise rise together, the SNR is unchanged. The cure for a weak signal is almost always a better antenna, a better site or a filter, not more gain.

? A receive chain has an antenna giving +6 dB, then 4 dB of cable loss, then a filter costing 1 dB. What is the net?
* About +11 dB
+ About +1 dB, because gains and losses in decibels add
* About −11 dB
= Decibels add along a chain: 6 − 4 − 1 = +1 dB. The logarithmic scale is what makes this simple arithmetic.

? Why does an antenna outdoors and high usually beat a more expensive receiver indoors?
* Outdoor antennas are always larger
+ It raises the signal-to-noise ratio by escaping the home's electrical noise, which no amount of receiver gain can recover
* Receivers work better in daylight
= Reception is limited by signal-to-noise ratio, and modern homes are full of radio noise. Getting the antenna away from that noise lifts the SNR; amplifying a noisy signal does not.

# Unit 3 · Antennas and propagation

## Antennas and polarisation
The antenna is the part of the system that actually couples to the radio wave, and it is where most performance is won or lost. A few ideas carry you a long way.
- **Resonance and size.** An antenna works best near a size related to the wavelength: a half-wave dipole, or a quarter-wave vertical over a ground plane. Because wavelength falls with frequency, high-frequency antennas are small (a 1090 MHz element is centimetres) and low-frequency ones are large.
- **Gain and pattern.** A simple antenna hears in most directions; a **directional** antenna (a yagi, a dish) concentrates its reach one way, trading coverage for gain. Satellite work often wants an antenna that hears well from horizon to overhead; a distant airport wants gain towards the horizon.
- **Polarisation.** The wave has an orientation. Broadcast FM and most VHF data are **vertical** or **horizontal**; satellites usually transmit **circular** polarisation, because the ionosphere twists a linear wave (Faraday rotation) and the spacecraft's orientation to you changes through a pass, either of which would make a linear signal fade in and out. Matching polarisation can be worth 20 dB; a cross-polarised antenna can lose most of the signal.

For the signals in this course: a simple vertical or a discone covers general VHF/UHF listening; a horizontal **V-dipole** or a **QFH** (quadrifilar helix) suits 137 MHz weather satellites; a **collinear** mounted high is the single best upgrade for 1090 MHz aircraft; a marine antenna with a view of the water suits AIS; and a hand-held **yagi** lets you follow an amateur satellite or the ISS across the sky by hand.

! Standard: An antenna is only as good as its site. High, outdoors, clear of obstructions and the house's noise, with short low-loss cable, beats any clever design installed badly.

? Weather satellites transmit circular polarisation. Why?
* Circular polarisation travels faster
* Linear antennas cannot receive satellites at all
+ A linear wave's orientation would keep changing, twisted by the ionosphere and by the changing geometry of the pass, so a fixed antenna would see deep fades
= Faraday rotation in the ionosphere and the satellite's changing orientation relative to you would rotate a linear signal unpredictably. Circular polarisation is unaffected by that rotation, which is why 137 MHz weather satellites and many others use it. (A linear antenna such as a V-dipole still works, at a small, steady loss.)

? What is usually the single most effective improvement to a 1090 MHz aircraft station?
* A more powerful computer
+ A resonant antenna mounted high and outdoors, with short low-loss coax
* A higher sample rate on the receiver
= At 1090 MHz, height and a clean, resonant antenna with short cable decide range. The receiver matters far less than getting the antenna up and out.

## How signals travel
Whether you can hear a transmitter depends on how its signal **propagates**, and that changes with frequency, time of day and the Sun.
- **Ground wave** (LF and MF) hugs the Earth's surface and reaches reliably over a region, best over sea water. It is why AM stations cover a city day and night.
- **Sky wave** (HF, 3–30 MHz) bounces off the **ionosphere**. The F layer reflects signals back to Earth, allowing worldwide reach; the D layer, present by day, absorbs the lower frequencies. The highest frequency that will reflect, the **maximum usable frequency (MUF)**, rises with solar activity and in daylight and falls at night, which is why shortwave bands "open" and "close" through the day.
- **Line of sight** (VHF and up) travels roughly straight, so range depends on how high both ends are. A useful estimate, with heights in metres:

$ radio horizon (km) ≈ 4.12 × (√h₁ + √h₂)

An antenna 10 m up hears an airliner at 10,000 m from about 425 km away, but a ship's 20 m mast from only about 30 km. This single formula explains why aircraft are heard far and ships near.
- **Beyond the horizon at VHF**, now and then: **tropospheric ducting** under high pressure, **sporadic E** (mostly May to August, opening the lower VHF bands over 1,000–2,000 km), **aurora** during geomagnetic storms, and meteor scatter. These come and go and are themselves signals worth logging.

Because HF propagation is driven by the Sun, space weather (Unit 8) is part of SIGINT: a flare can black out HF across the sunlit Earth within minutes, and a geomagnetic storm can disturb paths for days.

! Worked example: You hear a distant FM broadcaster that is normally far out of range on a warm, settled summer evening. That is probably tropospheric ducting or sporadic E, not a change at the transmitter: a propagation event to note with its date, band and the path it opened.

? Why are aircraft heard hundreds of kilometres away while ships are heard only tens?
+ Both are line-of-sight at VHF/UHF, and an airliner's great height pushes its radio horizon far beyond a ship's low mast
* Aircraft transmit far more power than ships
* Ship signals are encrypted
= The radio horizon grows with the square root of height. With your antenna 10 m up, an aircraft at 10 km is in view from ~425 km; a ship's mast at 20 m only from ~30 km. Height, not power, is the difference.

? A normally closed HF band suddenly carries signals from across the world by day. What has most likely changed?
* The transmitters increased power together
* Your receiver's gain was turned up
+ Ionospheric conditions: higher solar activity or daytime ionisation raised the maximum usable frequency
= HF relies on the ionosphere, which varies with the Sun and time of day. A band "opening" reflects a change in the maximum usable frequency, not in the transmitters or your receiver.

# Unit 4 · Software-defined radio

## The receiver and the waterfall
A traditional radio is built for one job. A **software-defined radio (SDR)** instead digitises a slice of spectrum and does the tuning, filtering and demodulation in software, so one small device can be a broadcast radio, an aircraft decoder, a satellite receiver and a spectrum analyser in turn. The thirty-euro RTL-SDR dongle that started the hobby is still where most people begin.

A few settings govern every SDR.
- **Centre frequency**: where in the spectrum you are looking.
- **Sample rate** (or bandwidth): how wide a slice you capture at once, typically 2–10 MHz. Faster shows more spectrum but demands more from the computer; the raw data rate is large (a 2.4 MHz, 8-bit stream is nearly 5 MB every second).
- **Gain**: amplification before digitising. Set it high enough to lift signals clear of the noise, then stop; too much overloads the receiver and invents signals that are not there.

The display that makes an SDR so powerful is the **waterfall**: a spectrogram with frequency across and time scrolling down, brightness showing strength. On it you *see* the spectrum. A steady broadcast carrier is a bright vertical line; voice flickers around it; a data burst is a coloured block of a characteristic width; a satellite pass drifts in frequency as it moves (the **Doppler shift**). Reading a waterfall is the core skill of the hobby: before you decode anything, you identify it by where it sits, how wide it is and how it behaves.

No receiver yet? The [Listen](#/oi/sigint/listen) tab of the SIGINT Dashboard lists public web receivers (WebSDR, KiwiSDR and OpenWebRX) that you can tune from a browser, nearest first, so you can practise reading a waterfall before you buy anything.

! Tools change: Software is named here as it stood in October 2026. The [Software Cookbook](#/oi/sigint/cookbook) keeps installation recipes current for SDR++, SDR#, SatDump and the decoders, with the legal points for each.

? What does the sample rate of an SDR mainly control?
* How loud the audio is
+ How wide a slice of spectrum you capture at once, at the cost of more data and computer load
* The colour of the waterfall
= Sample rate sets the captured bandwidth. A wider slice shows more of the spectrum but produces a much larger data stream and needs more processing.

? Why can turning the gain up too far make reception worse?
* High gain drains the antenna
+ Overload creates spurious signals and raises the noise floor, lowering the signal-to-noise ratio
* Gain has no effect on an SDR
= Once the noise floor rises with the gain, signal and noise are being amplified together; beyond that, extra gain overloads the front end and manufactures false signals. The aim is enough gain to lift the signals clear, no more.

## From samples to meaning
Capturing the spectrum is only the first step; a **decoder** turns a signal into data. Each service has its own.
- **Aircraft**: readsb or dump1090 decode the 1090 MHz pulses into positions, identities and altitudes, and serve them as JSON the dashboard reads.
- **Ships**: AIS-catcher turns 162 MHz AIS bursts into vessel reports.
- **Weather satellites**: SatDump demodulates 137 MHz LRPT into images.
- **Amateur data**: WSJT-X decodes the weak-signal modes FT8 and WSPR; Direwolf decodes APRS packets.

Two working methods matter beyond any single tool.
- **Live versus recorded.** You can decode in real time, or record the raw samples (an **IQ file**) and analyse later. Recording lets you replay a one-off satellite pass through a different decoder, or study a signal slowly. The files are large, and you record only signals you may lawfully receive.
- **Decode locally, keep it yours.** Vitruvian Manager decodes some signals in the browser itself (satellite-navigation NMEA over a USB cable, a Meshtastic radio's node list) and connects to your own decoders through a small **bridge** that runs on your own computer, so your receivers' data reach the page without passing through anyone's server. Your location is kept in your browser and leaves it only as a rounded position in requests to the public feeds. The [Overview](#/oi/sigint) and the [Hardware Guide](#/oi/sigint/hardware?at=sigint%2Findex.html%23tab%3Dhardware%26s%3Dpatterns) explain how the receiver, decoder, bridge and page fit together.

! Caution: A decoder only decodes; it does not change what you are allowed to receive. Several tools can also decode private traffic (pagers, data links); those recipes are deliberately absent, and Unit 11 explains why.

? What is the advantage of recording raw IQ samples rather than only decoding live?
* It uses less storage than live decoding
* It recovers signals your receiver could not hear at the time
+ You can replay the same capture later through different decoders and study it slowly
= An IQ recording preserves the raw signal, so a one-off event such as a satellite pass can be decoded again with other tools or analysed carefully offline. It holds only what your receiver captured, and the files are large, so record only what you may lawfully receive.

? Vitruvian Manager decodes a USB satellite-navigation receiver in the browser and keeps your position on the page. Why does this matter?
+ It keeps your receiver's data and your location on your own computer rather than sending them to a website
* It makes the satellites transmit faster
* It is the only way to decode NMEA
= Decoding locally is a privacy choice: your position and your receiver's output stay with you. The bridge works the same way: it runs on your own computer and passes your receivers' data to the page without sending them through a website.

# Unit 5 · Aircraft (ADS-B and Mode S)

## How aircraft broadcast
Airliners and most other aircraft in controlled airspace announce themselves on **1090 MHz**, and this is the richest signal an individual can receive. Two related systems share the frequency.
- **Mode S** is a transponder reply: when interrogated (or spontaneously), an aircraft sends short messages carrying a unique 24-bit **ICAO address**, and often its identity and altitude. It does **not** contain a position.
- **ADS-B** (Automatic Dependent Surveillance–Broadcast) is the richer extended message: the aircraft takes its own position from satellite navigation and broadcasts latitude, longitude, altitude, speed, track and callsign, unencrypted, for air-traffic safety: position and velocity about twice a second, identity every few seconds. In the US a second link, **978 MHz UAT**, carries ADS-B for aircraft that stay below 18,000 feet, mostly light aircraft.

Volunteers worldwide run receivers and pool the data. From it you can see a live map of the sky: airliners on their routes, a government aircraft on a diplomatic trip, a military transport surge, surveillance aircraft flying racetrack orbits along a border, air-ambulance activity after an incident. Each aircraft carries an ICAO address that normally stays with it as long as it keeps its registration, a callsign that changes by flight, and often a registration that ties it to an operator.

**Emergency and special codes** are worth knowing: the transponder **squawk** 7500 signals unlawful interference (hijack), 7600 radio failure and 7700 a general emergency. These are broadcast in the clear and the dashboard flags them.

### In the SIGINT Dashboard
[Aircraft (ADS-B)](#/oi/sigint/aircraft) shows aircraft near your location on a map and in a table, nearest first, coloured by altitude, from a public feed or your own receiver. It flags emergency squawks and military aircraft, and links out to the public globes. Set your location on the [Overview](#/oi/sigint); the [Hardware Guide](#/oi/sigint/hardware) covers building a 1090 MHz station.

? What is the key difference between a Mode S reply and an ADS-B message?
* Mode S is encrypted and ADS-B is not
+ ADS-B carries the aircraft's own position; a plain Mode S reply carries identity and altitude but no position
* They are on completely different frequencies
= Both share 1090 MHz, but ADS-B adds satellite-derived position, velocity and callsign. Mode S alone gives identity and altitude, which is why locating a Mode S-only aircraft needs multilateration.

? An aircraft is broadcasting squawk 7700. What does this mean, and can you receive it?
* A private code you may not receive
* That the aircraft is military
+ A general emergency, broadcast unencrypted for safety, so it is received openly
= 7700 is the general-emergency transponder code (7500 hijack, 7600 radio failure). These are safety broadcasts in the clear, and the dashboard flags them.

## Reading the sky, and its limits
Aircraft data is powerful precisely because it is open, but reading it well means knowing what it does not show.
- **Multilateration (MLAT)** locates aircraft that send Mode S but no ADS-B position. When several receivers with synchronised clocks hear the same message, the tiny differences in arrival time fix the aircraft's position. It needs three or four receivers in view of the aircraft and good timing, and it works only where coverage is dense.
- **Coverage has holes.** Volunteers' receivers thin out over sea, desert and poor regions, and everything is line-of-sight, so low aircraft far away are simply missing. Absence is not evidence.
- **Some aircraft are hidden or masked.** Military aircraft often fly with transponders off or with changing identities. In the US, privacy programmes let operators limit what is shown: **LADD** (Limiting Aircraft Data Displayed) limits what the FAA's own data feeds pass on to flight-tracking websites, though it cannot stop anyone receiving the aircraft's ADS-B directly, and **PIA** (Privacy ICAO Address) lets an aircraft broadcast a temporary address not tied to its registration. Aggregators differ: some honour operators' requests to hide aircraft, others show everything they receive.
- **The ethics are real.** These same data could track a private person's movements. The famous jet-tracking accounts that follow billionaires' aircraft run on exactly this public data, and the tension they caused — a platform banning them in December 2022 while the data stayed public — is the whole ethical question in miniature. Study organisations, states and patterns, not individuals, and never publish a private person's live location.

! Ethics: Vitruvian Manager withholds the identities of aircraft in the US privacy programmes by default. Keep that setting on unless you have a lawful, specific reason, and never use flight data to follow or expose a private individual.

? An aircraft that broadcasts no ADS-B position still appears on a community map with a position, tagged "MLAT". How is that position derived?
* The aircraft is transmitting ADS-B normally after all
+ Multilateration: several receivers with synchronised clocks fix it from the differences in when its Mode S messages arrive
* The map has guessed it from the aircraft's usual route
= Aircraft that send Mode S without an ADS-B position can be located by MLAT, which needs several receivers hearing the same message with tightly synchronised clocks, and so works only where coverage is dense.

? What is the right way to treat aircraft covered by the FAA's LADD and PIA privacy programmes?
* Identify them anyway, since the data is public
+ Respect the privacy choice: study patterns and organisations, and don't expose a private individual's movements
* Report them to the authorities
= LADD and PIA exist to limit tracking of private aircraft. The hobby's ethics, and Vitruvian Manager's default, are to withhold those identities and to avoid following individuals.

# Unit 6 · Ships (AIS)

## How ships broadcast
Ships announce themselves on marine VHF around **162 MHz** using the **Automatic Identification System (AIS)**, broadcast in the clear for collision avoidance. Under the international SOLAS convention, AIS is required on ships of 300 gross tonnage and over on international voyages, on cargo ships of 500 gross tonnage and over even on domestic voyages, and on **all passenger ships regardless of size**. Smaller craft often carry it voluntarily.

AIS comes in classes. **Class A** (the larger, mandated ships) transmits often and at higher power; **Class B** (smaller vessels) less often and more weakly. The messages carry an **MMSI** (a nine-digit identifier), the ship's name and callsign, its type, position, course, speed, navigation status, and a **destination and ETA typed in by the crew** — which, being hand-entered, is frequently wrong, stale or blank. For a durable identity, follow the **IMO number**, which stays with the hull for life; names, flags and MMSIs change.

From AIS you can watch a port's traffic, a strait's flow, fishing patterns, a naval vessel's movements when it chooses to transmit, and the comings and goings that matter to sanctions and smuggling work. As with aircraft, it is line-of-sight: a coastal receiver hears tens of kilometres, so most open-ocean coverage comes from satellites and shared networks.

### In the SIGINT Dashboard
[Ships (AIS)](#/oi/sigint/ships) plots vessels near you, coloured by type, from your own AIS-catcher receiver or, through the Vitruvian Manager bridge, aisstream.io's free feed, with name, type, speed, course and destination; the [Hardware Guide](#/oi/sigint/hardware) covers a marine antenna with a view of the water.

Follow a specific ship's history on the public trackers the tab links to, and its flag, managers and inspection record on [Equasis](https://www.equasis.org) (free registration).

? Which identifier should you use to follow a particular ship over time, and why?
+ The IMO number, because it stays with the hull for life while names, flags and MMSIs change
* The destination field, because crews keep it accurate
* The ship's name, because names are unique
= The IMO number is permanent to the hull. Names, flags and MMSIs are changed routinely, and the destination is hand-typed and often unreliable.

? Why is a ship's AIS "destination" field weak evidence?
* It is encrypted
* It is set by the port authority
+ It is typed in by the crew, so it is often stale, blank or simply wrong
= The destination and ETA are entered by hand and not verified, so they are among the least reliable fields. Treat them as a claim, not a fact.

## Gaps, spoofing and dark ships
The interesting questions in ship-watching are usually about **absence and deception**.
- **AIS gaps** have many causes: a coastal receiver's limited range, a satellite revisit gap, equipment faults — or a ship deliberately switching off ("going dark"). Vessels go dark to hide ship-to-ship transfers of sanctioned cargo, illegal fishing, or port calls they would rather not show. A gap is an **indicator to investigate**, not a conclusion: corroborate it with radar satellite imagery, which sees a ship whether or not it transmits.
- **Spoofing.** Because AIS is unauthenticated, positions can be falsified. The signatures are telltale: a track that jumps impossibly, a ship "circling" in a tight pattern, two vessels sharing one identity, or a ship apparently sitting on land. In June 2021 the AIS positions of two NATO warships, HMS Defender and HNLMS Evertsen, were falsified to show them steaming towards Russia's naval base at Sevastopol in Crimea while a harbour webcam showed them still in Odesa — a textbook case of the system being gamed, and of why you corroborate.
- **The shadow fleet.** Tankers moving sanctioned oil have made dark activity and identity-swapping routine, and tracking them is a live field of open-source work. The method is always the same: follow the IMO number, log the gaps, and check independent sources.

Corroboration for ships comes above all from **satellite radar** (Sentinel-1), which is why ship-watching reaches naturally into geospatial intelligence.

! Worked example: A tanker's AIS stops for three days near a known transfer area, then resumes 200 km away with a slightly different reported draught. That is an indicator, not proof: check Sentinel-1 radar for a vessel at the gap, the ship's ownership and flag history, and whether a second ship shared the spot. Describe exactly what each source shows.

### In the SIGINT Dashboard
Cross-check an AIS gap against radar and optical imagery in the [GEOINT & IMINT Dashboard](#/oi/geoint/imagery), whose Imagery tab opens Sentinel-1 radar for a place and dates in the Copernicus Browser, and check a ship's owners and any sanctions listing in the OSINT Dashboard's [Organisations & sanctions](#/oi/osint/orgs) tab. The analysis habits are in the [OSINT course](#/oi/osint-training).

? A tanker's AIS signal disappears for several days near a known transfer area. What is the best interpretation?
* Proof of sanctions evasion
+ An indicator to corroborate with radar imagery, ownership records and the ship's history
* Certain equipment failure
= Gaps have innocent and suspicious explanations. A gap is a lead; radar imagery and ownership records are how you test it before drawing any conclusion.

? Which pattern most strongly suggests AIS spoofing rather than a genuine track?
* A ship slowing as it approaches a port
* A ship transmitting a destination
+ A vessel's position jumping impossibly or circling in a tight, unnatural pattern, or two ships sharing one identity
= Spoofed AIS often shows physically impossible movement, circling, or duplicated identities. The 2021 Black Sea case, where warships were shown near Crimea while a webcam placed them in port, is a clear example.

# Unit 7 · Satellites

## Orbits, elements and passes
To receive a satellite you must know where it will be, and that comes from its **orbit**. Low-Earth-orbit (LEO) satellites, including weather and amateur satellites and the ISS, circle the Earth roughly every 90 to 100 minutes and are in view for only about ten to fifteen minutes per **pass**, rising in one part of the sky and setting in another. Geostationary satellites sit fixed over the equator and are always in view from a given place, if high enough above the horizon.

An orbit is described by a set of **orbital elements**, published for the public as **TLEs** (two-line element sets) or the newer **OMM** format. CelesTrak distributes them; software propagates them with the standard **SGP4** model to predict passes for your exact location: when the satellite rises, how high it climbs (its maximum **elevation**), where it sets and how long it is up. Elements age, so refresh them every few days.

One housekeeping change is worth knowing. On 11 July 2026 the catalogue ran out of five-digit numbers (the permanent series stops at 69,999; the block above it is reserved for provisional objects), so newly catalogued objects are numbered from 100,000. The classic TLE has room for only five characters: CelesTrak no longer issues TLEs for these objects, Space-Track offers a stop-gap "Alpha-5" form with a letter in the first place, and the OMM formats have no such limit. Vitruvian Manager reads CelesTrak's OMM data, so it is unaffected.

A satellite's signal **shifts in frequency** as it passes (the Doppler effect), by several kilohertz at VHF and more at UHF, so tracking software or a wide receiver setting is needed to follow it.

### In the SIGINT Dashboard
[Satellites](#/oi/sigint/satellites) predicts the next passes over your location from CelesTrak elements, propagated in your browser, with a sky plot of each pass, the downlink frequency and the antenna to use, plus the geostationary satellites above your horizon. Set your location on the [Overview](#/oi/sigint).

? Why must orbital elements (TLEs) be refreshed every few days?
* The satellite changes frequency daily
+ They are a snapshot of an orbit that drifts over time, so predictions lose accuracy as the elements age
* The file is deleted after a few days
= TLEs describe an orbit at a moment. Atmospheric drag and other effects change the orbit, so old elements give increasingly wrong pass predictions.

? A low-Earth-orbit satellite's signal drifts in frequency across a pass. What causes this, and what is the remedy?
+ The Doppler shift from its motion; track it with prediction software or a wide-enough receiver setting
* Interference; switch the satellite off
* A fault in the SDR; replace it
= A fast-moving satellite produces a Doppler shift of several kilohertz. Tracking software retunes to follow it, or a wider receiver bandwidth takes in the whole swing.

## What you can receive today
What is actually transmitting changes, so this unit is dated to **October 2026** and tells you how to check.
- **Weather satellites at 137 MHz.** The long era of NOAA's analogue **APT** pictures has ended: NOAA-18 was switched off in June 2025, NOAA-19 on 13 August and NOAA-15 on 19 August 2025. What remains at 137 MHz are the Russian **Meteor-M N2-3** and **N2-4**, sending digital **LRPT** images that SatDump decodes. Both were listed as operational in October 2026, but which of them is sending LRPT, in what mode and on which frequency (137.900 or 137.100 MHz) changes from time to time, and reception varies, so check a current status page before a session rather than trusting any fixed figure.
- **Higher-resolution weather satellites** in L-band (around 1.7 GHz) — Europe's **Metop**, China's FengYun, and the geostationary **GOES** (Americas) and others — need a dish rather than a simple antenna, and for the low-orbit ones a dish that tracks the satellite across the sky. Services here also shift: operators retire old direct-broadcast products on their own schedules.
- **The ISS**'s amateur stations change mode often, so check the [ARISS status page](https://www.ariss.org/current-status-of-iss-stations.html). Its classic downlink is 145.800 MHz FM, used for scheduled voice contacts with schools and for occasional slow-scan television (SSTV) events that send receivable images; at other times a voice repeater downlinks on 437.800 MHz, and in late October 2026 its APRS packet relay, still under test, was on 437.825 MHz rather than the long-standing 145.825 MHz. **Amateur satellites** carry transponders and beacons on 2 m and 70 cm; a geostationary amateur transponder, **QO-100**, is permanently in view from Europe, Africa and the Middle East but needs a dish. Receiving any of these needs no licence; transmitting through them does.

! Tools change: Satellite status is the thing most likely to be out of date in any guide. Before planning a session, check a live source such as [SatNOGS](https://db.satnogs.org) or a community status page for the satellite's current mode, and treat frequencies here as a starting point.

? As of October 2026, what is the realistic way to receive weather-satellite images at 137 MHz with simple equipment?
* Receive NOAA APT, as in older tutorials
* It is no longer possible at all
+ Decode the Russian Meteor-M N2-3 or N2-4 digital LRPT images, after checking their current mode
= The NOAA APT satellites were switched off in 2025. The Meteor-M pair still transmit digital LRPT at 137 MHz, but their modes change, so a current status check comes first.

? Listening to the ISS's amateur radio needs no licence. What does transmitting through an amateur satellite, or the ISS's repeater, require?
* Nothing, as it is in space
+ An amateur radio licence
* Permission from the satellite's country only
= Listening to satellites meant for general reception is free; transmitting (through an amateur satellite's uplink, say) is a licensed activity like any other amateur transmission.

# Unit 8 · Space weather

## The Sun, the ionosphere and your radio
The Sun drives the medium that HF radio and satellite navigation depend on, so **space weather is part of SIGINT**: it explains outages that would otherwise look like equipment faults or deliberate interference. A handful of indices, all published by NOAA's Space Weather Prediction Center, tell the story.
- **Solar flares** emit a burst of X-rays that reaches Earth in about eight minutes and ionises the daytime D layer, absorbing HF on the sunlit side of the Earth. Flares are graded by their peak X-ray flux as A, B, C, M and X, each class ten times stronger than the one before; strong M- and X-class flares can black out the lower HF frequencies for tens of minutes and, in the largest, for hours. The dashboard shows the live GOES X-ray flux.
- **The planetary K index (Kp)**, 0 to 9, measures geomagnetic disturbance every three hours; **Kp 5 or more is a geomagnetic storm** (graded G1–G5). Storms disturb high-latitude and polar HF paths, lower the usable frequencies for a day or two, and bring aurora — which itself opens unusual VHF paths.
- **Solar flux (F10.7)** tracks the general level of solar activity; higher values lift the upper HF bands. **Solar Cycle 25** reached its maximum in October 2024 (on the smoothed sunspot number) and is now in its declining phase, though strong flares continue well past the peak.
- **The solar wind and its magnetic field (Bz)**, measured by spacecraft at the L1 point 1.5 million km sunward, give roughly 15 to 60 minutes' warning of incoming storms: a strongly southward Bz lets energy into the magnetosphere, and aurora and disturbance follow.

Space weather also hits **satellite navigation**: a severe geomagnetic storm enlarges ionospheric errors and can degrade accuracy, especially at high latitudes. The great storm of **10–12 May 2024**, the first G5 since 2003, pushed precision-farming GNSS off by metres and sent guided tractors astray. So before blaming a GNSS or HF problem on jamming, **check space weather first**.

### In the SIGINT Dashboard
[Space weather](#/oi/sigint/spaceweather) shows the current scales, Kp, X-ray flux, solar wind and Bz with a plain reading of what each means for HF, GNSS and VHF, plus, from the last hour's WSPR reports near you, which HF bands are carrying signals. Use it to rule out a solar cause before investigating interference on [GNSS interference](#/oi/sigint/gnss).

? HF signals on the sunlit side of the Earth fade out for half an hour. Before suspecting jamming, what should you check?
+ Space weather: a strong M- or X-class solar flare absorbs daytime HF across the sunlit hemisphere
* The receiver's power cable
* Whether the antenna has rotated
= Solar flares cause sudden HF fade-outs on the daylight side. Checking the X-ray flux first distinguishes a natural blackout from interference or a fault.

? What does a planetary K index (Kp) of 6 indicate?
* Perfectly quiet conditions
* A solar flare in progress
+ A moderate (G2) geomagnetic storm, disturbing high-latitude HF and possibly bringing aurora
= Kp of 5 or more is a geomagnetic storm, and Kp 6 corresponds to G2: disturbed polar and high-latitude paths, lowered usable frequencies and possible aurora. Flares are measured separately, by X-ray class.

# Unit 9 · Satellite navigation and interference

## How GNSS works, and how it fails
Global navigation satellite systems — GPS (US), Galileo (EU), GLONASS (Russia) and BeiDou (China), together **GNSS** — let a receiver work out its position and a very precise time from the faint signals of satellites overhead. The signals are extraordinarily weak by the time they reach the ground, which makes GNSS both vital and fragile. It fails in two quite different ways, and telling them apart is a core SIGINT skill.
- **Jamming** drowns the satellites with noise, so the receiver loses lock. The signature in a receiver is that **every satellite's signal weakens at once** and the fix is lost; the carrier-to-noise figures collapse together. Jamming denies service but does not deceive.
- **Spoofing** transmits false satellite signals so the receiver computes a **wrong but confident** position or time. It is subtler and more dangerous: the receiver may show a healthy signal while placing you somewhere you are not, or drifting your clock.

Both jamming and spoofing are **illegal everywhere this course covers**, and this course never does either. The skill is to **detect and map** interference from its effects, using signals that are lawful to receive, and to understand the limits of what you can conclude.

A simple, legal way to watch your own GNSS environment is to read an ordinary USB satellite-navigation receiver: it reports, in plain **NMEA** text, each satellite's signal strength and whether it is used in the fix. A sudden drop across all satellites, with the antenna unmoved and clear sky above, is the signature of interference.

### In the SIGINT Dashboard
[GNSS interference](#/oi/sigint/gnss) reads a USB receiver in your browser over a cable and shows per-satellite signal strength, a sky plot and a running trace of the four strongest satellites' average, so a collapse across all satellites at once stands out. A clearly labelled sample recording, including a simulated jamming episode, shows the view without hardware.

? In a receiver, how does jamming typically differ from spoofing?
* Jamming moves your position; spoofing just adds noise
+ Jamming weakens every satellite at once and loses the fix; spoofing can leave signals looking healthy while the computed position is wrong
* They are indistinguishable in every case
= Jamming denies service (all signals fall, fix lost); spoofing deceives (a confident but false position or time). The patterns differ, which is why both signal strength and fix behaviour are watched.

? Is detecting and mapping GNSS interference, from signals you may lawfully receive, legal — and is transmitting a jammer?
+ Detecting and mapping interference is lawful; jamming and spoofing are illegal everywhere this course covers
* Both are illegal
* Both are legal
= Observing interference through lawful reception is fine and useful. Generating interference (jamming or spoofing) endangers aviation and shipping and is an offence; this course never does it.

## Mapping interference from the sky
The widest view of GNSS interference comes, ingeniously, from **aircraft**. Airliners broadcast, within their ADS-B, a measure of how accurate or trustworthy their navigation currently is — the **NACp** (navigation accuracy) and **NIC** (navigation integrity) fields. When many aircraft over one area report degraded values at the same time, something is interfering with GNSS there. Two public maps turn this into regular pictures:
- **[GPSJam](https://gpsjam.org)** aggregates each UTC day of aircraft reports into coloured hexagons: green where more than 98% of aircraft reported good accuracy, yellow where 2–10% reported low accuracy, red above 10%. It uses NACp, subtracts one from each cell's count of degraded aircraft to suppress false alarms where traffic is thin, and refreshes soon after midnight UTC.
- **Flightradar24's jamming map** does the same from its own receivers using NIC, refreshed every six hours.

These maps are a genuine conflict indicator: persistent interference shows plainly around the Baltic, the eastern Mediterranean, the Black Sea and parts of the Middle East. But their limits are strict, and an analyst must respect them.
- They **cannot see where there are no aircraft**, and they aggregate over hours, so a red region may have had interference for only part of the day.
- They **mix jamming with equipment faults** at low percentages, and they cannot tell jamming from spoofing.
- A **single aircraft** proves nothing; the signal is in the pattern across many.
- Most of all, they **do not establish who is responsible**, and a healthy ADS-B navigation field does not rule out trouble. When a plane carrying the European Commission president landed at Plovdiv, Bulgaria, on 31 August 2025, the Commission said its satellite navigation had been jammed, and suspicion fell on Russia. But the aircraft's own ADS-B showed good navigation integrity throughout, Bulgaria's government said days later that its ground instruments had detected no prolonged jamming, and experts noted that spoofing can leave the broadcast figures looking healthy while a crew still has trouble. The episode is a lesson in confidence: the data showed what it showed, and the cause stayed contested.

! Standard: Interference maps are a lead, never a verdict. State exactly what the data shows ("aircraft over this area reported degraded navigation accuracy on this date"), and keep the cause and the attribution as separate, carefully hedged judgements.

### In the SIGINT Dashboard
[GNSS interference](#/oi/sigint/gnss) links to GPSJam at your location (the previous day's map) and to Flightradar24's jamming map, alongside your own receiver's view, and explains the NACp field. Read a suspected interference event together with [Space weather](#/oi/sigint/spaceweather) to rule out a solar cause, and with the confidence language of the [OSINT course](#/oi/osint-training).

? How do GPSJam and similar maps detect GNSS interference without any ground sensors?
* They measure jamming signals directly from satellites
* They ask pilots to report by radio
+ They aggregate the navigation-accuracy fields (NACp, NIC) that aircraft broadcast in ADS-B, flagging areas where many aircraft report degraded values at once
= Aircraft broadcast how good their navigation currently is. When many report degraded accuracy over one area, the maps colour it as likely interference, from ordinary ADS-B data.

? A GPSJam hexagon is red over a region for one date. What may you responsibly conclude?
* That a named state jammed GPS there
+ That aircraft there reported degraded navigation accuracy that day; the cause and who is responsible are separate, hedged judgements needing more evidence
* That GPS was down for everyone on the ground all day
= The map shows degraded aircraft reports aggregated over a day. It cannot see gaps without aircraft, cannot name a culprit, and mixes causes, so attribution must be argued separately and carefully.

# Unit 10 · The near spectrum: mesh and amateur data

## LoRa mesh and APRS
Two systems, one licence-exempt and one amateur, let individuals send and relay small amounts of data by radio. Amateur APRS is sent in the clear for anyone to receive; a mesh is different, because its messages belong to its users and are encrypted.
- **LoRa mesh (Meshtastic).** Cheap LoRa radios form an off-grid text-and-position mesh in the licence-exempt bands: **868 MHz** in Ireland, the UK and the EU, **915 MHz** in North America. They are popular with hikers, community groups and emergency volunteers. In Europe the band carries a **duty-cycle limit** (in the sub-band Meshtastic uses, no more than 10% of each hour), which the firmware's EU region setting enforces; using the wrong region either fails to reach your neighbours or breaks the rules. A Meshtastic radio keeps a **node database** — names, hardware, signal quality and the positions owners choose to share — which Vitruvian Manager can read from your own radio. Message contents are a different matter: they are encrypted, and Vitruvian Manager does not decode them.
- **APRS.** The Automatic Packet Reporting System carries amateur positions, weather and short messages on **144.800 MHz** in Europe and **144.390 MHz** in North America, relayed by digipeaters and gated to the internet. The public map (aprs.fi) shows most of what reaches the internet. **Receiving APRS needs no licence**; relaying it to the internet (an iGate) needs a callsign, and transmitting needs an amateur licence.

The licensing rule is the thread through both: **listening is free; transmitting is regulated.** You may build a receive-only station for either and watch all day; the moment you put energy into the air you are in licensed or licence-exempt-device territory, with its own limits.

And both carry **personal data**. A mesh node's position and an APRS station's track usually belong to a private individual. Treat them as the OSINT course treats any personal data: do not compile, publish or use them to follow anyone, and remember that node positions are often deliberately blurred by their owners for exactly this reason.

### In the SIGINT Dashboard
[Mesh & APRS](#/oi/sigint/mesh) reads your own Meshtastic radio's node list over USB or Wi-Fi and maps the nodes that share a position — reading the database only, never messages — and links to the public APRS map at your location with propagation reports. The [Software Cookbook](#/oi/sigint/cookbook) covers Meshtastic and the APRS decoder Direwolf, with the licensing points.

? In Ireland and the EU, what keeps a Meshtastic radio within the rules on the 868 MHz band?
+ The firmware's EU region setting, which enforces the band's duty-cycle and power limits
* Transmitting only at night
* Using the North American 915 MHz setting
= The 868 MHz band is licence-exempt but duty-cycle limited; the EU_868 region setting keeps transmissions within those limits. The US 915 MHz setting is for Region 2 and would be both ineffective and non-compliant in Europe.

? You want to watch APRS traffic around you. What does that require?
* An amateur licence to receive
* Permission from each station
+ Nothing more than a receiver: receiving APRS needs no licence, though gating it to the internet or transmitting does
= Receiving APRS, like other amateur transmissions meant for general reception, needs no licence. A callsign is needed only to run an internet gateway (iGate) or to transmit.

# Unit 11 · Analysis, law and ethics

## From signals to an assessment
Signals rarely answer a question alone; their value is in **correlation**. The analyst's job is to combine a signal with other signals, with open sources, and with imagery, and to state a judgement with its uncertainty — the discipline taught in full by the [OSINT course](#/oi/osint-training) and used here unchanged.
- **Fuse across sources.** An ADS-B track of a surveillance aircraft, an AIS gap beneath its orbit, a GNSS-interference hexagon over the same water and local news of a naval exercise are four weak signals that together may support one judgement. Each on its own is thin.
- **Separate observation from inference, and grade your sources.** Record what each signal physically shows, timestamped in UTC, with the receiver or feed it came from and a reliability grade. Keep "the transponder went silent" apart from "the aircraft landed".
- **Use estimative language.** Say how likely a judgement is and, separately, how confident you are in the evidence behind it, in the calibrated vocabulary the OSINT course sets out (for example "likely (55–80%)", with confidence stated apart). Signals' false precision makes this discipline more important, not less.
- **Document for reproducibility.** Log the elements, feeds, captures, decoder settings and times so another analyst could retrace your steps. A decoded screenshot without its provenance is an assertion, not evidence.

! Worked example: You judge that a vessel conducted a covert transfer. The signals: an AIS gap (your receiver, graded B2), a Sentinel-1 radar return at the gap (GEOINT, A2), no aircraft overhead (coverage hole, not evidence). Write: "A ship-to-ship transfer is likely (55–80%). Confidence is moderate: the radar return corroborates the AIS gap, but the vessel is not positively identified." Likelihood and confidence stated separately, as the OSINT course requires.

? Why is a single decoded signal usually a weak basis for a confident judgement?
* Signals are always wrong
+ Signals are precise but ambiguous; strength comes from correlating several independent signals and sources
* One signal is always enough
= A position report or a gap is exactly what the transmitter sent, which is not the same as what happened. Confidence grows by fusing independent signals, open sources and imagery, each graded.

? How should likelihood and confidence appear in a SIGINT assessment?
+ As separate judgements: how probable the conclusion is, and, apart from that, how solid the evidence and reasoning are
* Combined into one vivid phrase
* Only as a single percentage
= Keeping likelihood and confidence apart (as in the OSINT course and professional doctrine) stops a reader confusing how probable a conclusion is with how strong the evidence for it is.

## Law: what you may receive
The law is where SIGINT as a hobby lives or dies, so learn the principle and the main statutes. The principle, across Ireland, the UK and the US alike: **receiving transmissions meant for general reception is broadly lawful; intercepting the content of private communications, decrypting protected signals, and using or passing on what you overheard are not.** This is a plain-language summary checked in October 2026, not legal advice; the regulator or a lawyer settles hard cases. The full detail is in the [Law & ethics](#/oi/sigint/law) guide.
- **Ireland.** The Wireless Telegraphy Acts, enforced by ComReg, exempt receive-only apparatus from licensing (under S.I. No. 197 of 2005), so owning an SDR, scanner or GNSS receiver needs no licence. But intercepting a telecommunications message carried by a licensed operator (the phone and mobile networks), or disclosing or using one, is an offence under section 98 of the Postal and Telecommunications Services Act 1983; and intentionally intercepting any non-public transmission of data to, from or within an information system, including the radio emissions that carry it, is an offence under section 5 of the Criminal Justice (Offences Relating to Information Systems) Act 2017.
- **United Kingdom.** No licence is needed to own a receiver. Under **section 48 of the Wireless Telegraphy Act 2006**, it is an offence, without lawful authority, to use apparatus **with intent to obtain information** about the contents, sender or addressee of a message you are not meant to receive, or to **disclose** such information. Ofcom's guidance is that receivers and scanners may be used only for **"general reception"**, such as licensed broadcasting and hobby (amateur and CB) radio, unless you are authorised. That list does not name aircraft and ship broadcasts such as ADS-B and AIS, which are sent to all and widely decoded and shared, but whose strict legal position is untested; listening to air-traffic or marine voice is a greyer area still. What is clearly an offence is listening for private messages and passing on what you learn.
- **United States.** The Electronic Communications Privacy Act makes intentional interception of electronic communications a crime, but excepts communications **readily accessible to the general public** (amateur, CB, marine, aviation, and unencrypted public-safety radio). Intercepting cellular and cordless-phone calls is illegal, and scanners sold in the US must not cover the cellular bands.

Across all three, three things are always out of bounds: **decrypting** protected signals, **intercepting the content of private communications**, and **transmitting without authority** (including jamming and spoofing). Knowing that these are illegal is part of the tradecraft; how to do them has no place in it.

! Not legal advice: Laws change and details matter. The summaries here and in the Law & ethics guide were checked in October 2026; when in doubt, ask the regulator (ComReg, Ofcom, the FCC) or a lawyer before you act.

? Owning a receive-only SDR needs no licence in Ireland and the UK. Does that make all reception lawful?
* Yes: if the device is legal, any reception is legal
* Only government reception is lawful
+ No: receiving is bounded by what the signal is for, and intercepting or disclosing the content of private communications remains an offence
= The receiver is exempt from licensing, but the law still forbids intercepting private communications and disclosing what you hear. Legal kit does not license illegal listening.

? Under the UK's Wireless Telegraphy Act 2006, section 48, what is the offence?
* Owning a scanner
+ Using apparatus with intent to obtain, or disclosing, information about a message you are not an intended recipient of, without lawful authority
* Listening to BBC radio
= Section 48 targets using a receiver to obtain the contents, sender or addressee of a message not meant for you, and disclosing what you so learn. General-reception broadcasting is fine.

## Doing no harm, and staying safe
Lawful reception can still do harm, and the ethics matter as much as the law.
- **Track things and patterns, not people.** Aircraft, ships and mesh nodes often belong to private individuals. Do not compile, publish or use their movements to follow anyone, respect the aircraft and node privacy schemes, and never publish a private person's live location — the issue the jet-tracking disputes made plain.
- **Don't republish private content.** If you receive something not meant for you — a medical call overheard, an airline data-link message, anyone's private traffic — do not record it, post it or act on it.
- **Mind conflict zones.** Tracks and interference maps from war zones can endanger people on the ground. Share analysis and aggregate pictures, not raw real-time positions of people.
- **Follow each source's terms.** Credit the open feeds (adsb.lol under its licence), keep service keys out of web pages, and use shared databases as their projects ask.
- **Use the Berkeley Protocol for serious work.** Open-source investigations that might become evidence should follow the [Berkeley Protocol](https://humanrights.berkeley.edu/projects/berkeley-protocol-on-digital-open-source-investigations/): accuracy, data minimisation, preservation, dignity and transparency, the same standard the OSINT course sets.

**Your own safety** is mostly physical. The real hazard of this hobby is not the radio but the antenna: work on masts from a stable ladder with a helper, never near overhead power lines, never in a storm; earth outdoor masts and fit surge protection; and treat the lithium batteries in outdoor nodes with care. If you ever transmit, under a licence, keep within exposure limits and never transmit into a receiver or a receive preamplifier (LNA).

! Ethics: The whole hobby rests on a courtesy as much as a law: receive what is meant for all, leave alone what is meant for someone else, and never let a precise signal tempt you into exposing a private person.

? You receive, by accident, the content of a private message not meant for you. What should you do?
+ Not record, publish or act on it: receiving by chance is one thing, but using or disclosing it can be an offence, and is unethical
* Post it, since you received it openly
* Report the sender
= The law and the ethics both turn on use and disclosure. Overhearing something by chance does not entitle you to keep, share or act on private content.

? What is the most dangerous part of a receive-only radio hobby?
* The radio waves themselves
* Reading the waterfall for too long
+ Installing antennas: working at height and near power lines, where the physical risks are real
= Receiving is physically safe; antenna work is where people are hurt. Ladders, power lines and storms are the hazards to respect, along with lithium batteries in outdoor nodes.

## Capstone 1: the airport that lost its bearings
**Scenario (fictional).** Over two evenings, air-traffic recordings and local posts report that aircraft approaching a regional airport near a conflict zone are having satellite-navigation trouble, and one flight circled before landing. A commentator blames enemy jamming. **Your task**: establish, from lawfully received signals, what can and cannot be shown about GNSS interference around that airport and when, rule out other causes, and finish with a judgement stated as likelihood and confidence, using at least three tabs of the SIGINT Dashboard, other parts of Vitruvian Manager and the OSINT method.

### Model answer
1. **Frame the question and observe, don't infer.** The claim is "enemy jamming on these dates". Break it into what signals can show: degraded aircraft navigation reports over the area, their timing, and whether a natural cause fits.
2. **Map the interference.** [GNSS interference](#/oi/sigint/gnss) and the linked GPSJam and Flightradar24 maps show whether many aircraft reported degraded NACp/NIC over the airport on those dates. Record exactly what the hexagons show and for which period; note that the maps aggregate over hours to a day and cannot see where there are no aircraft.
3. **Watch the aircraft directly.** [Aircraft (ADS-B)](#/oi/sigint/aircraft) shows the approach traffic live if the trouble recurs, and the public globes it links to, some of which can replay past days, show which flights orbited or went around; note that a healthy navigation field does not rule out trouble, and a single aircraft proves nothing.
4. **Rule out the Sun.** [Space weather](#/oi/sigint/spaceweather) shows whether a geomagnetic storm or flare in recent days could explain GNSS degradation (for older dates, use the archives of NOAA's Space Weather Prediction Center), as the May 2024 storm did for farmers; a quiet space-weather record strengthens the interference reading.
5. **Corroborate with open sources.** The OSINT Dashboard's [Events](#/oi/osint/events) tab and [Geopolitical Volatility](#/rt/volatility) place the dates against local events and the conflict's tempo; remember that some regions (the Baltic, the Black Sea, the eastern Mediterranean) see interference almost daily.
6. **State it carefully, separating cause from attribution.** The maps show degraded reports; the cause is a separate judgement; who is responsible is a third, and the thinnest.

! BLUF: Over the two evenings, aircraft approaching the airport reported degraded satellite-navigation accuracy, consistent with GNSS interference in the area (likely, 55–80%). Space weather was quiet, making a solar cause unlikely. Confidence is moderate: the aircraft reports are clear and appear on both maps, but the two maps draw on the same aircraft broadcasts, cannot see the ground, cannot separate jamming from spoofing with certainty, and do not establish who was responsible. (A fictional example.)

? In the model answer, why is ruling out space weather a necessary step?
* Space weather is the only possible cause
+ A geomagnetic storm or flare can degrade GNSS too, so excluding it strengthens the case that interference, not the Sun, is the cause
* It is required by law
= GNSS degradation has natural causes. Checking that space weather was quiet, as the May 2024 storm showed it need not be, removes a competing explanation before attributing the effect to interference.

? Why does the BLUF keep "interference", "the cause" and "who is responsible" as separate, differently hedged claims?
+ The data support each to a different degree: degraded reports are observed, the cause is inferred, and attribution is weakest of all
* To make the report longer
* Because attribution is always certain
= Signals show degraded navigation reports directly; that they mean jamming rather than spoofing or a fault is an inference; and naming a culprit needs evidence the maps cannot give. Honest confidence tracks that ladder.

## Capstone 2: the tanker that went quiet
**Scenario (fictional).** A mid-sized tanker's AIS stops transmitting for four days off a coast known for ship-to-ship transfers of sanctioned oil, then resumes 180 km away. A campaigner calls it proof of sanctions-busting. **Your task**: establish what the signals show, corroborate the gap with imagery and records, and reach a judgement as likelihood and confidence, using the SIGINT, GEOINT and OSINT dashboards and the correlation discipline of Unit 11.

### Model answer
1. **Observe the gap precisely.** [Ships (AIS)](#/oi/sigint/ships) and the linked public trackers give the last position and time before the gap and the first after it. Record them in UTC. Follow the **IMO number**, not the name or MMSI, which can change.
2. **Weigh the innocent explanations.** A gap can be a coverage hole, a satellite revisit gap or a fault. Note where receivers thin out; absence is a question, not an answer.
3. **Corroborate with radar.** In the [GEOINT & IMINT Dashboard](#/oi/geoint/imagery), open Sentinel-1 radar over the gap area for those dates: radar sees a vessel whether or not it transmits, though its passes are days apart and may miss the gap; a second ship alongside would be telling.
4. **Check identity and history in open sources.** In the OSINT Dashboard's [Organisations & sanctions](#/oi/osint/orgs) tab, screen the vessel against the sanctions lists, confirming any match by its IMO number, and trace the company that owns it; Equasis gives its flag, managers and inspection history, and the public trackers show whether this hull has gone dark before.
5. **Look for a partner and a pattern.** A second vessel with its own matching gap at the same place strengthens the transfer hypothesis; a lone gap over a known coverage hole weakens it.
6. **Judge, separating observation from inference.** The AIS gap and the resumed position are observations; a transfer is an inference; sanctions-busting is a further, legal characterisation to state with care and a right of reply.

! BLUF: The tanker stopped transmitting AIS for four days off the coast and resumed 180 km away. A ship-to-ship transfer during the gap is a realistic possibility (about 40–50% on the UK yardstick), raised if radar imagery shows a vessel at the site and lowered if the gap sits in a known coverage hole. Confidence is low to moderate: AIS gaps are common and have innocent causes, and the vessel's activity during the gap is not directly observed. Calling it sanctions evasion would need the transferred cargo and counterpart identified. (A fictional example.)

? Why follow the tanker by its IMO number rather than its name or MMSI?
* The name is always encrypted
* The MMSI never changes
+ The IMO number is fixed to the hull, while names, flags and MMSIs are changed, especially by vessels trying to obscure their identity
= Entity resolution needs a stable identifier. The IMO number stays with the hull for life; the very ships this capstone concerns change names, flags and MMSIs to confuse tracking.

? Which single piece of evidence would most strengthen the transfer hypothesis?
* A longer AIS gap
+ Sentinel-1 radar imagery showing a vessel of the tanker's size, ideally with a second vessel alongside, at the gap location during the dates
* More news coverage of sanctions generally
= Radar imagery observes vessels independently of AIS and during the silence itself. A second ship alongside at the spot and time is the kind of independent corroboration that lifts a gap from suspicion towards a supported judgement.
