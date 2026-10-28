# The principle {#principle}

The hobby rests on one distinction: **receiving transmissions that are meant for anyone** (broadcasting, amateur radio, aircraft and ship safety broadcasts, weather satellites, time signals, your own devices) is generally lawful; **intercepting communications meant for someone else**, decrypting anything, and **using or passing on** what you overheard are not. Transmitting is a separate matter: it needs a licence, or equipment and limits that the law exempts.

> [!warn] **Not legal advice.** This is a plain-language summary for hobbyists, checked in October 2026. Laws change and details matter: when in doubt, ask the regulator (ComReg, Ofcom, the FCC) or a lawyer.

# Ireland {#ireland}

## Owning and using a receiver {#ie-receivers}

Radio equipment in Ireland is governed by the **Wireless Telegraphy Acts 1926 to 2009**, enforced by **ComReg**: equipment needs a licence unless it is exempt. Apparatus that can only receive is exempt under **S.I. No. 197 of 2005** (the Wireless Telegraphy Act 1926 (Section 3) (Exemption of Receive Only Apparatus for Wireless Telegraphy) Order), apart from television sets, which need a TV licence. So owning an SDR, a scanner or a GNSS receiver needs no licence.

## Interception and disclosure {#ie-interception}

- **Postal and Telecommunications Services Act 1983, section 98** (as amended, including by the Interception Act 1993): intercepting a telecommunications message carried by a licensed operator (the phone and mobile networks), or disclosing or using one, is an offence unless authorised.
- **Criminal Justice (Offences Relating to Information Systems) Act 2017, section 5**: intentionally intercepting, without lawful authority, any **non-public** transmission of data to, from or within an information system, including the electromagnetic emissions that carry it. Other people’s Wi-Fi and data links fall here.
- **Data protection** (GDPR and the Data Protection Act 2018) applies when you record or publish information about identifiable people: a boat owner’s movements, a mesh node’s position, a private aircraft’s trips.

In practice: broadcasting, amateur radio, ADS-B, AIS, weather satellites and time signals are received openly and widely shared. Emergency services use the encrypted national digital radio network; mobile, pager, business and other private traffic is not for listeners.

## Transmitting {#ie-transmitting}

An amateur station licence from ComReg follows a HAREC-standard examination (organised with the [IRTS](https://www.irts.ie/)); Irish callsigns start EI or EJ. Licence-exempt devices, such as PMR446 radios and short-range devices including 868 MHz LoRa (Meshtastic on the EU_868 setting), must stay within the conditions ComReg publishes for permitted short-range devices.

# United Kingdom {#uk}

## Owning and using a receiver {#uk-receivers}

No licence is needed to own or use receive-only equipment. **Ofcom** regulates the spectrum under the **Wireless Telegraphy Act 2006**.

## Section 48: interception and disclosure {#uk-s48}

Under **section 48 of the Wireless Telegraphy Act 2006**, it is an offence, without lawful authority:

- to **use** wireless telegraphy apparatus **with intent to obtain information** about the contents, sender or addressee of a message of which neither you nor anyone you act for is an intended recipient; or
- to **disclose** information about the contents, sender or addressee of such a message (when that information came from the use of wireless telegraphy apparatus).

Disclosure in legal proceedings, or in reporting them, is excepted. In plain terms: receiving radio is broadly allowed, but listening **in order to** learn private messages, and **using or passing on** what you heard, is the offence. Ofcom’s long-standing guidance is that scanners may be used to listen only to transmissions **intended for general reception**, such as broadcasting, amateur radio and Citizens’ Band, unless you are authorised. Personal listening to airband or marine voice is a grey area that is rarely pursued; recording, publishing or acting on what is said is where the offence clearly lies.

## Other laws {#uk-other}

- **Investigatory Powers Act 2016, section 3**: intercepting communications in the course of transmission over public or private telecommunication systems (mobile networks, other people’s Wi-Fi) is an offence.
- **Computer Misuse Act 1990**: unauthorised access to computers and devices, including through their radio links.
- **UK GDPR and the Data Protection Act 2018** for personal data you record or publish.

## Transmitting {#uk-transmitting}

An **Ofcom amateur radio licence** follows exams run by the [RSGB](https://rsgb.org/) at Foundation, Intermediate and Full level. CB, PMR446 and approved short-range devices (868 MHz LoRa within its power and duty-cycle limits) are licence-exempt.

# United States {#us}

- **Electronic Communications Privacy Act** (18 U.S.C. §§ 2510–2523): intentionally intercepting electronic communications is a federal crime. Section 2511(2)(g) excepts communications **readily accessible to the general public**, such as amateur, CB, GMRS, marine and aviation radio, and public-safety radio **that is not scrambled or encrypted**. Intercepting **cellular and cordless phone** calls is illegal.
- **Communications Act, section 705** (47 U.S.C. § 605): don’t divulge or use the contents of radio communications not meant for the public (broadcasts, amateur and distress traffic are exceptions).
- **FCC rule 47 CFR § 15.121**: scanners sold in the US must not be able to receive the cellular bands, or be easily modified to.
- **State laws**: several states (for example New York, Florida, Indiana, Kentucky and Minnesota) restrict scanner use in vehicles or while committing a crime, often with exceptions for licensed amateurs. Check your state.
- **Transmitting**: an FCC amateur licence (Technician, General, Amateur Extra) follows a volunteer-examiner test; GMRS needs a licence without an exam; FRS and MURS are licence-free within their rules.

# Across the EU {#eu}

The **GDPR** governs personal data in every member state; the **ePrivacy Directive** protects the confidentiality of communications; the **Radio Equipment Directive** sets the rules for equipment you buy; and the European short-range-device decision harmonises licence-exempt bands such as 433 and 868 MHz.

# Dual-use tools {#dual-use}

Some tools in the Software Cookbook and Hardware Guide can transmit or attack as well as listen. They are legal to own; how you use them is what the law cares about.

| Tool | Lawful uses | Never |
|---|---|---|
| HackRF One, ADALM-Pluto, LimeSDR (transmit-capable SDRs) | Receiving; licensed amateur transmission within your licence; testing your own devices through cables and attenuators or in a shielded box; teaching | Transmitting without a licence, jamming, replaying or spoofing signals |
| Flipper Zero (sub-GHz, RFID/NFC, infrared) | Reading and learning from your own cards, tags and remotes; testing your own systems | Cloning someone else’s access card, opening others’ garages or cars, replaying others’ signals |
| Universal Radio Hacker, GNU Radio, inspectrum | Analysing your own devices’ radio links; research on your own recordings | Attacking or impersonating other people’s devices |
| Wireshark | Your own network and devices | Monitoring networks you are not authorised to test |

> [!bad] **Jamming and spoofing are illegal everywhere this page covers.** That includes GNSS jammers and spoofers, mobile-phone jammers, and replaying key-fob, garage-door or alarm signals. They endanger aviation, shipping and emergency services, and carry heavy penalties under the Wireless Telegraphy Acts in Ireland and the UK and federal law in the US (where marketing or using jammers is prohibited outright).

# Ethics {#ethics}

- **Track things and patterns, not people.** Aircraft, ships and mesh nodes often belong to private individuals. Don’t compile, publish or use their movements to follow anyone.
- **Respect the privacy schemes.** The FAA’s LADD and PIA programmes exist so aircraft owners can limit what is shown; PRP withholds those identities by default.
- **Don’t republish private content.** If you overhear something not meant for you (a medical call, a business conversation, airline data-link messages), don’t record it, post it or act on it.
- **Mind the data’s terms.** Credit adsb.lol (ODbL), keep aisstream.io keys out of web pages, and use wspr.live only for free, open projects as it asks.
- **Conflict zones.** Interference maps and tracks from war zones can endanger people. Share analysis, not raw positions of people on the ground.

# Safe practice {#safety}

- Antenna work at height is the real hazard: stable ladders, a helper, nowhere near power lines, never in a storm.
- Earth outdoor masts and fit surge arresters; disconnect antennas when lightning is near.
- Treat lithium batteries in outdoor nodes with care: protected cells, shade and the right charger.
- If you transmit (licensed), check RF exposure and never key up into a receiver or an LNA.

# Checklist {#checklist}

Tick these off for your own station; your answers stay in this browser.

- [ ] I only listen to transmissions meant for anyone: broadcasting, amateur radio, ADS-B, AIS, weather satellites, time signals, or my own devices.
- [ ] Nothing I receive is encrypted or scrambled, and I never try to decrypt anything.
- [ ] I don’t record, publish or act on the content of messages not meant for me.
- [ ] My maps and posts don’t expose private people (boat owners, private pilots, mesh-node owners).
- [ ] I transmit only with a licence, or with licence-exempt equipment within its limits.
- [ ] Transmit-capable tools are used only on my own devices, through cables or a shielded box when testing.
- [ ] My antennas are safe: away from power lines, earthed, weatherproofed.
- [ ] I follow each data source’s terms and credit it.
