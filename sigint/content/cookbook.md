# How to use this cookbook {#about}

Each recipe gives what the program is for, where to get it (the project’s own site or its GitHub releases, nothing else), how to install it on Windows, Linux and Raspberry Pi, and macOS, a first test, the usual pitfalls and the legal points that apply. Names, links and install routes were checked in October 2026; projects move, so when a step here disagrees with the project’s own documentation, follow the project.

> [!warn] **Receive only.** Several programs here can also transmit when paired with transmit-capable hardware (HackRF, ADALM-Pluto, LimeSDR) or a radio. Transmitting needs a licence, except in licence-exempt bands within their power and duty-cycle limits. What you may listen to, record and share is in **Law & ethics**.

# Drivers {#drivers}

Your SDR needs a driver before any program can use it. For the RTL-SDR dongles almost everyone starts with, that is one recipe on Windows and one package on Linux.

## rtl-sdr and the RTL-SDR Blog drivers {#rtl-sdr .drivers}

- **For:** the driver library and command-line tools (`rtl_test`, `rtl_fm`, `rtl_sdr`, `rtl_tcp`) for RTL2832U USB dongles. The RTL-SDR Blog V4 (R828D tuner) and V4L “Lite” (R828S) need the RTL-SDR Blog version of the driver; V3 and generic dongles also work with the standard one.
- **Systems:** Windows, Linux, Raspberry Pi, macOS
- **Official source:** [osmocom rtl-sdr](https://osmocom.org/projects/rtl-sdr/wiki) · [RTL-SDR Blog drivers (releases)](https://github.com/rtlsdrblog/rtl-sdr-blog/releases) · [Zadig](https://zadig.akeo.ie/) · [RTL-SDR Blog quick start guide](https://www.rtl-sdr.com/rtl-sdr-quick-start-guide/)
- **Licence:** GPL, free

### Windows

1. Plug the dongle in and let Windows finish (it will install a TV-tuner driver you don’t want).
2. Run **Zadig**. Choose *Options → List All Devices*, then pick **Bulk-In, Interface (Interface 0)**. Check that the USB ID reads `0BDA 2838` (most dongles) and that the target driver is **WinUSB**, then press *Replace Driver*.
3. Download `Release.zip` from the RTL-SDR Blog releases and copy `rtlsdr.dll` into your SDR program’s folder: the **x64** one for 64-bit programs, the **x86** one for 32-bit programs such as SDR#. For a V4 or V4L this step is required.

### Linux and Raspberry Pi

For a V3 or a generic dongle the distribution package is enough:

```
sudo apt install rtl-sdr
```

For a V4 or V4L, build the RTL-SDR Blog driver (as its quick start guide does):

```
sudo apt purge ^librtlsdr
sudo apt install libusb-1.0-0-dev git cmake pkg-config build-essential
git clone https://github.com/rtlsdrblog/rtl-sdr-blog
cd rtl-sdr-blog && mkdir build && cd build
cmake ../ -DINSTALL_UDEV_RULES=ON && make && sudo make install
sudo cp ../rtl-sdr.rules /etc/udev/rules.d/ && sudo ldconfig
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
```

Reboot, or unplug the dongle and run `sudo rmmod dvb_usb_rtl28xxu`.

### macOS

`brew install librtlsdr` gives the standard driver. Most Mac SDR programs (SDR++, SDRangel) bundle their own; for a V4L check the RTL-SDR Blog V4L guide, which tracks which Mac builds support it.

### First test

```
rtl_test -t
rtl_test -s 2400000
```

The first line should name the tuner (R828D on a V4, R820T or R860 on a V3). Leave the second running for ten seconds: an occasional “lost at least … bytes” means USB or CPU trouble.

### Pitfalls

- In Zadig, choosing the wrong device (a keyboard, Bluetooth adapter or webcam) replaces *its* driver. Roll it back in Device Manager.
- Windows’ *Memory Integrity* setting can stop WinUSB devices working. The RTL-SDR Blog guide explains the trade-off; don’t turn security features off lightly.
- `usb_claim_interface error -6` on Linux means the TV driver grabbed the dongle: blacklist it as above.
- The V4 and V4L receive HF through a built-in upconverter: don’t enable “direct sampling” on them.
- A short USB extension cable moves the dongle away from the computer’s own noise.
- Turn on the bias tee (4.5 V up the coax) only for an LNA or active antenna that needs it, never into an antenna that is a DC short (some loops).

> [!legal] **Legal.** An RTL-SDR can’t transmit. What you tune to is still governed by the reception rules in **Law & ethics**.

## SoapySDR {#soapysdr .drivers}

- **For:** a vendor-neutral SDR interface with plug-in modules (RTL-SDR, Airspy, SDRplay, HackRF, Pluto, LimeSDR, remote devices). CubicSDR, GQRX (through gr-osmosdr), SDRangel, OpenWebRX and many scripts use it. Install it when a program asks for it.
- **Systems:** Windows, Linux, Raspberry Pi, macOS
- **Official source:** [SoapySDR wiki](https://github.com/pothosware/SoapySDR/wiki)
- **Licence:** Boost Software Licence, free

### Windows

The simplest route is [radioconda](https://github.com/radioconda/radioconda-installer), which installs SoapySDR with its common modules alongside GNU Radio. The old PothosSDR bundle is no longer maintained.

### Linux and Raspberry Pi

```
sudo apt install soapysdr-tools soapysdr-module-rtlsdr
```

Other modules follow the same naming (`soapysdr-module-airspy`, `-hackrf`, `-all`). For SDRplay, install the SDRplay API from sdrplay.com first, then the SoapySDRPlay3 module.

### macOS

Homebrew carries SoapySDR and the common modules (`brew search soapy`).

### First test

```
SoapySDRUtil --info
SoapySDRUtil --find
SoapySDRUtil --probe="driver=rtlsdr"
```

### Pitfalls

- After upgrades, a module built against an older SoapySDR shows up as “no factory for key”. Reinstall the module.
- The SDRplay module needs SDRplay’s API service running.

# Receivers {#receivers}

General-coverage receiver programs: a waterfall, demodulators for AM, FM, SSB and CW, recording, and plug-ins. Start with **SDR++** on any system, or **SDR#** on Windows.

## SDR++ {#sdrpp .receivers}

- **For:** a fast, cross-platform receiver with a clean waterfall, all the analogue modes, a recorder, a frequency manager, a rigctl server for satellite Doppler, and a server mode for remote radios. The usual first program in 2026.
- **Systems:** Windows, Linux, Raspberry Pi, macOS, Android
- **Official source:** [sdrpp.org](https://www.sdrpp.org/) (nightly builds) · [GitHub releases](https://github.com/AlexandreRouma/SDRPlusPlus/releases)
- **Licence:** GPL, free

### Windows

1. Download the Windows x64 zip from the nightly build, unzip it into a folder you own (not *Program Files*) and run `sdrpp.exe`.
2. For an RTL-SDR, set up WinUSB with Zadig first (see **rtl-sdr**). If a V4L shows no signal, put the x64 `rtlsdr.dll` from the RTL-SDR Blog release into the SDR++ folder.

### Linux and Raspberry Pi

Download the `.deb` for your distribution from the nightly release and install it with `sudo apt install ./sdrpp_*.deb`. Arch users have the AUR.

### macOS

Download the macOS build from the nightly release; the first time, right-click the app and choose *Open*.

### First test

Source **RTL-SDR**, sample rate 2.4 MSPS, press ▶, tune to a local FM station between 88 and 108 MHz in **WFM** mode. Then try the 2 m amateur band (144–146 MHz in Europe, 144–148 MHz in the Americas) in NFM.

### Pitfalls

- Too much gain makes phantom signals and a raised noise floor. Lower the gain until the noise floor stops dropping, then stop.
- A spike in the middle of the spectrum is the dongle’s DC offset: tune slightly off it.
- On a Raspberry Pi use 1 MSPS or so, or run `sdrpp --server` on the Pi and the full program on a PC.

## SDR# (SDRSharp) {#sdrsharp .receivers}

- **For:** Airspy’s long-running Windows receiver with a large plug-in community; best with Airspy hardware, fine with an RTL-SDR.
- **Systems:** Windows
- **Official source:** [airspy.com/download](https://airspy.com/download/) (the only official source; avoid repackaged “community” bundles)
- **Licence:** freeware (closed source)

### Windows

1. Download the SDR# package from airspy.com and extract it to a folder of your own, such as `C:\SDRSharp`.
2. Install the .NET Desktop Runtime the download page asks for.
3. For an RTL-SDR, run `install-rtlsdr.bat` if the package includes it, or set up WinUSB with Zadig; for a V4 or V4L, put the **x86** `rtlsdr.dll` from the RTL-SDR Blog release into the SDR# folder.

### First test

Source **RTL-SDR USB**, ▶, WFM on a broadcast station.

### Pitfalls

- Windows SmartScreen warns on first run: continue only if the file came from airspy.com.
- Plug-ins are programs: install only those you trust.

## GQRX {#gqrx .receivers}

- **For:** a simple, solid receiver built on GNU Radio, with a remote-control port that Gpredict uses for satellite Doppler correction.
- **Systems:** Linux, Raspberry Pi, macOS
- **Official source:** [gqrx.dk](https://gqrx.dk/) · [GitHub releases](https://github.com/gqrx-sdr/gqrx/releases)
- **Licence:** GPL, free

### Linux and Raspberry Pi

```
sudo apt install gqrx-sdr
```

It is also on Flathub.

### macOS

Through Homebrew or MacPorts, as gqrx.dk describes, or the release page.

### First test

Device string `rtl=0`, input rate 2400000, then an FM station.

### Pitfalls

- An older distribution’s gr-osmosdr may not know the RTL-SDR V4: install the RTL-SDR Blog driver first, or use SDR++.
- Turn on *Remote control* (TCP port 7356) for Gpredict.
- No official Windows build: use SDR++ there.

## SDRangel {#sdrangel .receivers}

- **For:** a whole SDR laboratory: dozens of demodulators and decoders (ADS-B, AIS, DAB, packet, digital voice), a map, a satellite tracker and several radios at once. Powerful, with a learning curve.
- **Systems:** Windows, Linux, Raspberry Pi, macOS, Android
- **Official source:** [sdrangel.org](https://www.sdrangel.org/) · [GitHub releases](https://github.com/f4exb/sdrangel/releases)
- **Licence:** GPL, free

### Install

Windows: run the installer from the releases page. Linux: the packages on the releases page, or the Snap (`sudo snap install sdrangel`, then grant it USB access as the Snap page explains). macOS: the disk image on the releases page.

### First test

Add your device, start it, add a *Broadcast FM demodulator* channel and tune a station. Then add an *ADS-B demodulator* at 1090 MHz and open the *Map* feature.

### Pitfalls

- Many channels at once are heavy on the CPU, especially on a Pi.
- Save a configuration once it works.

> [!legal] **Legal.** With transmit-capable hardware SDRangel can transmit. Keep transmit channels off unless you hold the right licence for the frequency.

## HDSDR {#hdsdr .receivers}

- **For:** a Windows receiver from the Winrad family, popular for shortwave and HF listening; hardware connects through “ExtIO” plug-in DLLs.
- **Systems:** Windows (runs under Wine on Linux, unsupported)
- **Official source:** [hdsdr.de](https://www.hdsdr.de/)
- **Licence:** freeware

### Windows

Install HDSDR, then copy the ExtIO DLL for your receiver (listed on the HDSDR hardware page; for an RTL-SDR, set up WinUSB with Zadig first) into the HDSDR folder. Use the ExtIO build that matches your HDSDR (32- or 64-bit).

### First test

Start, choose the ExtIO, and tune the 49 m broadcast band (5.9–6.2 MHz) with an HF-capable receiver (RTL-SDR Blog V4 or V4L, Airspy HF+, SDRplay).

## CubicSDR {#cubicsdr .receivers}

- **For:** a cross-platform SoapySDR receiver with a tidy interface. Development has slowed (the last release was in 2022), but it still works for general listening.
- **Systems:** Windows, Linux, macOS
- **Official source:** [GitHub releases](https://github.com/cjcliffe/CubicSDR/releases) · [cubicsdr.com](https://cubicsdr.com/)
- **Licence:** GPL, free

### Install

Installers for Windows and macOS are on the releases page; on Linux, `sudo apt install cubicsdr`.

### Pitfalls

The bundled SoapySDR modules predate the RTL-SDR V4 and V4L. For a new setup, SDR++ is the better choice.

# Decoders {#decoders}

Programs that turn a signal into data: aircraft positions, ship reports, satellite images, digital-mode contacts, packets.

## readsb and tar1090 {#tar1090 .decoders}

- **For:** readsb decodes aircraft transponders (ADS-B and Mode S) at 1090 MHz; tar1090 is the web map that adsb.lol and other aggregators also use, and it serves the `aircraft.json` this dashboard reads.
- **Systems:** Linux, Raspberry Pi (Windows and macOS through Docker or WSL2, or simply a Pi)
- **Official source:** [readsb](https://github.com/wiedehopf/readsb) · [tar1090](https://github.com/wiedehopf/tar1090) · [installer](https://github.com/wiedehopf/adsb-scripts/wiki/Automatic-installation-for-readsb) · [ADSB.im turnkey image](https://adsb.im/)
- **Licence:** open source, free

### Raspberry Pi and Linux

The project’s installer sets up readsb and tar1090 together (it is a short shell script; read it first if you like):

```
sudo bash -c "$(wget -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"
sudo readsb-set-location 53.35 -6.26
```

Use your own latitude and longitude. The map is then at `http://<pi>/tar1090` and the data at `http://<pi>/tar1090/data/aircraft.json`. For a no-terminal setup, the **ADSB.im** image installs the same software with a web setup page and feeds the aggregators you choose.

### Connect it to PRP

In **Aircraft**, choose *My receiver* and enter the `aircraft.json` address. Then either tick *Through the bridge* (the PRP bridge with `--route adsb=…`), or let the browser read it directly by allowing this site in lighttpd:

```
# /etc/lighttpd/conf-enabled/89-prp-cors.conf
$HTTP["url"] =~ "^/tar1090/data/" {
  setenv.add-response-header += ( "Access-Control-Allow-Origin" => "https://jdpi.pages.dev" )
}
```

then `sudo systemctl restart lighttpd`. Chrome and Edge reach `.local` names and private addresses from this HTTPS page after asking your permission; Firefox and Safari don’t, so use the bridge there.

### First test

Open the tar1090 map: within minutes you should see aircraft. Overnight, the range outline (“heywhatsthat” or tar1090’s range plot) shows how far you hear.

### Pitfalls

- The antenna decides everything: a 1090 MHz antenna outdoors and high beats any amount of gain. Keep the coax short.
- Mobile-phone and TV transmitters nearby overload cheap dongles: a 1090 MHz filtered LNA (or a FlightAware Pro Stick Plus) fixes it.
- Underpowered Pi supplies cause USB dropouts: use the official supply.
- Set the location precisely if you join MLAT (multilateration) networks.

> [!legal] **Legal.** ADS-B is broadcast unencrypted for air-traffic safety and is widely received and shared. Respect privacy programmes (LADD, PIA), and don’t use flight data to follow private individuals.

## dump1090-fa (FlightAware) {#dump1090-fa .decoders}

- **For:** FlightAware’s ADS-B decoder with its SkyAware map; the standard choice if you feed FlightAware with PiAware.
- **Systems:** Linux, Raspberry Pi
- **Official source:** [GitHub](https://github.com/flightaware/dump1090) · [PiAware](https://www.flightaware.com/adsb/piaware/)
- **Licence:** GPL, free

### Install

Follow FlightAware’s *PiAware* instructions, which add FlightAware’s package repository; then `sudo apt install dump1090-fa` (PiAware installs it for you). The map is at `http://<pi>:8080/` and the data at `http://<pi>:8080/data/aircraft.json`.

### Pitfalls

- dump1090 has many forks. For a new station not tied to FlightAware, readsb is the actively developed one; the JSON format is compatible, and PRP reads both.

## AIS-catcher {#ais-catcher .decoders}

- **For:** decoding ships’ AIS messages (161.975 and 162.025 MHz) with an RTL-SDR, Airspy, SDRplay or HackRF, with a built-in web map and a JSON feed PRP reads; it can share data with community maps.
- **Systems:** Windows, Linux, Raspberry Pi, macOS, Android
- **Official source:** [aiscatcher.org](https://www.aiscatcher.org/) · [GitHub](https://github.com/jvde-github/AIS-catcher) · [documentation](https://docs.aiscatcher.org/)
- **Licence:** GPL, free

### Raspberry Pi and Linux

The documented installer sets AIS-catcher up as a service with a browser setup wizard (“managed mode”):

```
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/jvde-github/AIS-catcher/main/scripts/aiscatcher-install) -p -M"
```

Open the dashboard at `http://<pi>:8118` and follow the wizard; enable the web viewer.

### Windows

Download the latest (“Edge”) x64 zip linked from the documentation, unzip it, set up WinUSB with Zadig, then run `start-GUI.bat` and open `http://localhost:8118`. For a quick manual run: `AIS-catcher -N 8100` starts the web viewer on port 8100.

### macOS

Build from source with Homebrew, as the documentation describes.

### Connect it to PRP

In **Ships**, enter `http://<host>:8100/api/ships.json`. AIS-catcher already sends CORS headers, so `localhost` works directly; for another machine, tick *Through the bridge* or rely on Chrome’s local-network permission.

### Pitfalls

- AIS is line of sight: you need a view of the sea or a busy waterway, and the antenna as high as possible. A marine VHF antenna or a vertical dipole cut for 162 MHz beats the dongle’s whip.
- Strong FM broadcast stations overload the dongle: an FM band-stop filter helps.

> [!legal] **Legal.** AIS is broadcast for collision avoidance and meant to be received by anyone. Small craft owners are private people: share aggregate pictures, not a log of one boat’s movements.

## SatDump {#satdump .decoders}

- **For:** decoding weather and other satellites: Meteor-M LRPT at 137 MHz, METOP and FengYun HRPT in L-band, GOES HRIT and more; live or from recordings, with automatic scheduling and tracking.
- **Systems:** Windows, Linux, Raspberry Pi, macOS, Android
- **Official source:** [satdump.org](https://www.satdump.org/) · [GitHub releases](https://github.com/SatDump/SatDump/releases)
- **Licence:** GPL, free

### Install

Windows: the installer or zip from the releases page. Linux: the packages on the releases page for Debian, Ubuntu and Raspberry Pi OS, or build from source. macOS: the disk image on the releases page.

### First test

Check the next Meteor-M pass in **Satellites**, open SatDump’s *Recorder*, select your SDR, choose the Meteor M2-x LRPT pipeline that matches the satellite’s current mode, set 137.900 MHz, and start a few minutes before the satellite rises. Images appear as the pass ends.

### Pitfalls

- NOAA-15, 18 and 19 were switched off in 2025: there is no more analogue APT. Old tutorials built around WXtoImg no longer apply.
- Meteor modes and frequencies change; check a current status page before a session.
- A V-dipole or QFH outdoors with a clear view of the sky matters more than the dongle.

## WSJT-X {#wsjt-x .decoders}

- **For:** weak-signal digital modes: FT8, FT4, WSPR, JT65, Q65 and more. Receiving and reporting what you hear needs only an HF-capable SDR and an antenna.
- **Systems:** Windows, Linux, macOS
- **Official source:** [wsjt.sourceforge.io](https://wsjt.sourceforge.io/wsjtx.html) (Joe Taylor, K1JT, and the WSJT team)
- **Licence:** GPL, free

### Install

Download the current release for your system from the official page (Windows installer, Linux packages, macOS disk image) and read its release notes.

### Receive-only setup

Set *Rig* to *None*. Route the audio from SDR++ (USB mode, on the band’s FT8 dial frequency, for example 14.074 MHz) into WSJT-X with a virtual audio cable (Windows) or a PipeWire/PulseAudio loopback (Linux). Decodes appear every 15 seconds.

### Pitfalls

- The computer clock must be within about a second: turn on network time.
- Uploading spots to PSKReporter or WSPRnet needs a callsign or a registered listener identity; never use someone else’s.

> [!legal] **Legal.** Transmitting with WSJT-X needs an amateur radio licence.

## fldigi {#fldigi .decoders}

- **For:** classic digital modes by sound card: RTTY, PSK31, CW, Olivia, MFSK, and weather fax and NAVTEX broadcasts meant for ships.
- **Systems:** Windows, Linux, macOS
- **Official source:** [w1hkj.org](http://www.w1hkj.org/) (downloads on the project’s SourceForge page)
- **Licence:** GPL, free

### Install

Windows and macOS installers are linked from w1hkj.org; on Linux, `sudo apt install fldigi`.

### First test

Feed it USB audio from SDR++ on the 20 m PSK31 frequency (14.070 MHz) and watch the waterfall; or try the weather-fax broadcasts many meteorological services send on HF.

## Direwolf {#direwolf .decoders}

- **For:** a software packet modem and APRS decoder; with an RTL-SDR it shows the APRS traffic around you.
- **Systems:** Linux, Raspberry Pi, Windows, macOS
- **Official source:** [GitHub](https://github.com/wb2osz/direwolf)
- **Licence:** GPL, free

### Install

Linux and Raspberry Pi: `sudo apt install direwolf`. Windows: the zip on the releases page. macOS: build from source.

### First test

Europe uses 144.800 MHz, North America 144.390 MHz:

```
rtl_fm -f 144.800M -s 24000 -g 40 - | direwolf -r 24000 -D 1 -
```

Decoded packets scroll past within minutes in most towns.

### Pitfalls

Set the dongle’s frequency correction (`-p` in `rtl_fm`) if packets are rare: cheap dongles drift a few kHz.

> [!legal] **Legal.** Decoding needs no licence. Gating packets to the internet (an iGate) needs a callsign and an APRS-IS passcode, and transmitting needs an amateur licence.

## rtl_433 {#rtl-433 .decoders}

- **For:** decoding the 433, 868 and 915 MHz short-range devices around a house: weather stations, thermometers, energy meters, doorbells. Output to the screen, JSON or MQTT for home automation.
- **Systems:** Linux, Raspberry Pi, Windows, macOS
- **Official source:** [GitHub](https://github.com/merbanan/rtl_433)
- **Licence:** GPL, free

### Install

Linux: `sudo apt install rtl-433`. Windows: builds on the releases page. macOS: `brew install rtl_433`.

### First test

```
rtl_433
rtl_433 -f 868M -s 1024k
rtl_433 -F json -F mqtt://localhost:1883
```

### Privacy first

You will also hear your neighbours’ sensors, and tyre-pressure sensors on passing cars, whose IDs can identify a vehicle. Keep only your own devices: filter by protocol (`-R`) and ID, don’t log the rest, and never publish others’ data.

> [!legal] **Legal.** Receiving is fine; recording or sharing other people’s data is personal data under GDPR. Never replay or imitate a remote control, key fob or alarm signal: that is interference at best and an offence at worst.

## multimon-ng {#multimon-ng .decoders}

- **For:** a decoder for simple digital modes in audio: AFSK1200 (APRS and packet), DTMF tones, CW, EAS/SAME weather-alert headers, X10 and more.
- **Systems:** Linux, Raspberry Pi, macOS, Windows
- **Official source:** [GitHub](https://github.com/EliasOenal/multimon-ng)
- **Licence:** GPL, free

### Install

Linux: `sudo apt install multimon-ng`; macOS: `brew install multimon-ng`; Windows: build or use the releases.

### Lawful uses

APRS and packet you are entitled to hear, DTMF from your own equipment, public weather-alert broadcasts (NOAA Weather Radio SAME headers in the US), and test signals you generate yourself.

> [!bad] **Don’t decode pagers.** multimon-ng can also decode paging protocols (POCSAG, FLEX). Pager messages carry medical, police and personal information; in Ireland and the UK listening with intent and disclosing are offences, and in the US the ECPA protects display-pager messages. PRP gives no recipe for it.

# Analysis {#analysis}

Tools for looking inside signals and data. Two of them can transmit with the right hardware: they are listed because they are standard for analysing **your own** devices.

## GNU Radio {#gnuradio .analysis}

- **For:** the toolkit for building your own signal processing, graphically (GNU Radio Companion) or in Python: the basis of much SDR software and teaching.
- **Systems:** Windows, Linux, macOS
- **Official source:** [gnuradio.org](https://www.gnuradio.org/) · [installing](https://wiki.gnuradio.org/index.php/InstallingGR) · [radioconda](https://github.com/radioconda/radioconda-installer)
- **Licence:** GPL, free

### Install

Windows and macOS: **radioconda** installs GNU Radio with SDR drivers and SoapySDR in one go. Linux: `sudo apt install gnuradio` (or radioconda for a newer version).

### First test

In GNU Radio Companion, connect an *osmocom Source* (or *Soapy RTLSDR Source*) to a *QT GUI Frequency Sink*, run it and tune to an FM station.

## Universal Radio Hacker {#urh .analysis}

- **For:** investigating digital wireless protocols: record, demodulate and decode the bits of a device’s radio link, with fuzzing and simulation tools. Dual use, so the limits below matter.
- **Systems:** Windows, Linux, macOS
- **Official source:** [GitHub](https://github.com/jopohl/urh)
- **Licence:** GPL, free

### Install

`pip install urh` on any system with Python, or the Windows installer on the releases page.

### Lawful use

Analyse **devices you own**: your weather station, your own remote sockets, a sensor you are building. Record on your own premises, keep power low, and when you transmit, stay within the licence-exempt band’s rules or your licence (or use a cable and attenuator instead of an antenna).

> [!bad] **Limits.** Never record and replay, jam or spoof other people’s devices: car keys, garage doors, alarms, smart meters. In Ireland and the UK that can breach the Wireless Telegraphy Acts and computer-misuse laws; in the US, FCC rules and federal law.

## inspectrum {#inspectrum .analysis}

- **For:** looking at recorded IQ files in detail: measure symbol rates, frequencies and timing, and extract bits by eye.
- **Systems:** Linux, macOS (Windows through radioconda or WSL)
- **Official source:** [GitHub](https://github.com/miek/inspectrum)
- **Licence:** GPL, free

### Install

Linux: `sudo apt install inspectrum`; macOS: `brew install inspectrum`.

### First test

Record a few seconds of your own key fob or weather sensor with `rtl_sdr -f 433.92M -s 1M rec.cu8`, open it, and drag the cursors over a burst.

## Wireshark {#wireshark .analysis}

- **For:** the standard network protocol analyser. In this hobby it helps debug **your own** network: a Meshtastic MQTT gateway, a Pi feeder’s uploads, the PRP bridge.
- **Systems:** Windows, Linux, macOS
- **Official source:** [wireshark.org](https://www.wireshark.org/download.html)
- **Licence:** GPL, free

### Install

Windows and macOS: the installers from wireshark.org (Windows includes Npcap). Linux: `sudo apt install wireshark` and add yourself to the `wireshark` group.

> [!bad] **Limits.** Capture only networks you own or are authorised to test. Monitoring other people’s Wi-Fi or decoding cellular traffic is interception, an offence in Ireland, the UK and the US.

# Planning and logging {#planning}

## Gpredict {#gpredict .planning}

- **For:** real-time satellite tracking with maps, sky views and pass lists, plus Doppler tuning of your receiver (through rigctl) and rotator control.
- **Systems:** Linux, Windows, macOS
- **Official source:** [oz9aec.dk/gpredict](https://oz9aec.dk/gpredict/) · [GitHub releases](https://github.com/csete/gpredict/releases)
- **Licence:** GPL, free

### Install

Linux: `sudo apt install gpredict`. Windows: the zip on the releases page. macOS: Homebrew.

### First test

*Edit → Update TLE data from network*, set your ground station, and add the ISS and Meteor-M N2-3 and N2-4 to a module. For Doppler, start GQRX’s remote control or SDR++’s rigctl server and attach it in the *Radio control* window.

## CHIRP {#chirp .planning}

- **For:** programming the memory channels of hand-held and mobile radios from a computer; good for setting up a scanner-style receive list on a licensed radio.
- **Systems:** Windows, Linux, macOS
- **Official source:** [chirpmyradio.com](https://chirpmyradio.com/projects/chirp/wiki/Home) (CHIRP-next builds)
- **Licence:** GPL, free

### Install

Windows: the installer; macOS: the app bundle; Linux: the Python package, all from the CHIRP download page.

### Pitfalls

Programming cables with counterfeit USB chips fail on modern Windows; buy a cable with a genuine FTDI or CH340 chip. Always read the radio first and save a backup before writing.

> [!legal] **Legal.** Cheap dual-band hand-helds can transmit on frequencies they are not approved for (PMR446, marine, business channels). Transmitting needs an amateur licence on amateur bands, or approved equipment within licence-exempt rules.

# Mesh {#mesh}

## Meshtastic {#meshtastic .mesh}

- **For:** off-grid text messaging and position sharing over a LoRa mesh of low-cost radios, licence-free in the ISM bands. PRP reads your radio’s node list over USB or Wi-Fi.
- **Systems:** web flasher and web client in Chrome or Edge; apps for Android, iOS/iPadOS and macOS; a Python command-line tool
- **Official source:** [meshtastic.org](https://meshtastic.org/docs/getting-started/) · [web flasher](https://flasher.meshtastic.org/) · [web client](https://client.meshtastic.org/)
- **Licence:** GPL firmware and apps, free

### Install

1. Connect the board (Heltec V3/V4, RAK WisBlock 4631, LilyGO T-Beam and others) by USB, open the **web flasher** in Chrome or Edge, pick the board and the latest stable firmware, and flash.
2. Open the app or the web client, connect, and set the **region**: `EU_868` in Ireland, the UK and the EU; `US` in North America. Give the node a name.
3. Optional: `pip install meshtastic`, then `meshtastic --info` and `meshtastic --nodes`.

### Connect it to PRP

**Mesh & APRS → Connect over USB** (Chrome or Edge), or on Wi-Fi boards the radio’s address with *Read node list* (it serves `/json/nodes` with CORS), or the bridge with `--route mesh=http://meshtastic.local/json/nodes`.

### Pitfalls

- Never power a LoRa radio without its antenna connected.
- The wrong region either won’t talk to your neighbours or breaks the law.
- Check battery polarity on boards that take 18650 cells.
- Set position precision deliberately: by default nodes share an approximate position.

> [!legal] **Legal.** In Europe LoRa runs in the 868 MHz short-range-device band with power and duty-cycle limits that the EU_868 setting enforces. “Licensed” (ham) mode turns off encryption and is only for licensed amateurs.

# Web receivers {#web}

## OpenWebRX {#openwebrx .web}

- **For:** turning an SDR on a Raspberry Pi or PC into a receiver you use from any browser, with built-in decoders (FT8, WSPR, APRS, SSTV, weather fax and many more). **OpenWebRX+** is an actively maintained fork with extra decoders and ready-made Pi images.
- **Systems:** Linux, Raspberry Pi (Docker elsewhere)
- **Official source:** [OpenWebRX](https://www.openwebrx.de/) · [OpenWebRX+ (GitHub)](https://github.com/luarvique/openwebrx) · [OpenWebRX+ packages and images](https://github.com/luarvique/ppa)
- **Licence:** AGPL, free

### Raspberry Pi

The simplest route is an OpenWebRX+ SD-card image from its GitHub releases: flash it, boot, and browse to `http://<pi>:8073`. On Debian or Ubuntu, add the package repository exactly as the OpenWebRX+ (or OpenWebRX) instructions show for your release, then `sudo apt install openwebrx`.

### First test

Create an admin user (`sudo openwebrx admin adduser <name>`), log in to the settings, add your SDR and a profile (for example 2 m, or an HF band with a V4), and listen from another device.

### Connect it to PRP

**Listen → My SDR**: the receiver opens in its own tab; its status (`/status.json`) comes through the bridge with `--route owrx=http://<host>:8073/status.json`.

### Pitfalls

- A public receiver needs bandwidth and a sensible user limit.
- OpenWebRX+ includes decoders for pagers and some aviation data links. Keep pager decoding off, and don’t publish what airline data links (ACARS, VDL2, HFDL) contain.

> [!legal] **Legal.** Making a receiver public republishes what it hears. Keep public profiles to broadcast, amateur and other general-reception services.

# Pipelines {#pipelines}

Chains of the recipes above that make a working station.

## Raspberry Pi ADS-B feeder {#pipeline-adsb .pipelines}

- **For:** a 24/7 aircraft receiver that feeds the community networks and gives PRP your own live data.
- **Hardware:** Raspberry Pi 4 or 5 (a Pi 3 or Zero 2 W copes with ADS-B alone), RTL-SDR or FlightAware Pro Stick Plus, a 1090 MHz antenna outdoors, short low-loss coax, optionally a 1090 MHz filtered LNA at the antenna.
- **Software:** readsb + tar1090 (or the ADSB.im image), feed clients.

### Steps

1. Flash Raspberry Pi OS Lite (64-bit) with SSH enabled, or flash ADSB.im instead and skip to step 4.
2. Install readsb and tar1090 with the installer above and set your location.
3. Check the map at `http://<pi>/tar1090` for a day; move the antenna higher if the range is poor.
4. Feed the networks you want: adsb.lol (open data, and the API this dashboard uses), FlightAware (PiAware), ADS-B Exchange, each with its own feeder instructions.
5. In PRP, **Aircraft → My receiver**, through the bridge or with the lighttpd CORS line.

## Weather-satellite station {#pipeline-wxsat .pipelines}

- **For:** receiving Meteor-M N2-3 and N2-4 images at 137 MHz automatically.
- **Hardware:** V-dipole (two 53.4 cm arms at 120°, horizontal, opening to the north or south) or a QFH; RTL-SDR V4/V4L; optionally a 137 MHz filtered LNA; Raspberry Pi 4 or 5, or any PC.
- **Software:** SatDump (with its scheduler), PRP **Satellites** for planning.

### Steps

1. Put the antenna outside with a clear view of the sky; even a balcony works for high passes.
2. Check the next pass above 20° in PRP **Satellites** or SatDump’s tracker.
3. In SatDump, set the Meteor LRPT pipeline, 137.900 MHz, and record the pass; review the images.
4. Turn on SatDump’s automatic scheduling (auto-track) so every good pass is recorded.
5. Next step up: an L-band dish and LNA for METOP and FengYun HRPT, which need tracking.

## Meshtastic node {#pipeline-meshtastic .pipelines}

- **For:** joining or starting a local LoRa mesh, and seeing it in PRP.
- **Hardware:** Heltec V3 or V4, RAK WisBlock 4631 starter kit or LilyGO T-Beam; a better 868 MHz antenna than the stock one; a battery or a small solar panel for a fixed node.
- **Software:** Meshtastic web flasher, app or web client.

### Steps

1. Flash, set region and name (recipe above).
2. Check who you hear in the app; a node high up (a window facing the town, a rooftop) hears far more.
3. For a fixed relay, set the role to *Router* only if the local community agrees; most fixed nodes should stay *Client*.
4. In PRP, **Mesh & APRS → Connect over USB**, or read `/json/nodes` over Wi-Fi.

## AIS station {#pipeline-ais .pipelines}

- **For:** watching the ships in your local waters and sharing the data.
- **Hardware:** RTL-SDR, a marine VHF or 162 MHz dipole antenna as high as possible with sea view, an FM band-stop filter if you are near a broadcast mast, a Raspberry Pi.
- **Software:** AIS-catcher in managed mode.

### Steps

1. Install AIS-catcher with the managed-mode installer and complete the wizard.
2. Watch the built-in map for a day; tune the gain for the most messages.
3. Share with the AIS-catcher community map, or with sites that accept feeders, using their instructions.
4. In PRP, **Ships → My receiver** with `/api/ships.json`.

## HF propagation monitor {#pipeline-wspr .pipelines}

- **For:** measuring which HF bands are open from your location, receive-only, 24/7.
- **Hardware:** an HF-capable receiver (RTL-SDR Blog V4/V4L, Airspy HF+, SDRplay, or a KiwiSDR), an HF antenna away from household noise (an active loop or an end-fed wire).
- **Software:** WSJT-X in WSPR mode (one band at a time), or a KiwiSDR’s built-in WSPR and FT8 extensions for many bands at once.

### Steps

1. Receive WSPR on one band (for example 14.0956 MHz USB dial) and check you decode spots.
2. Upload spots under your callsign or registered listener identity so they reach WSPRnet and wspr.live.
3. Compare with **Space weather → Bands open near you**, which reads the same database.
