// IoT Connect (Digital Science): every sentence about the law, safety and limits that the page shows, in one place, so
// a test can hold them to the design (PRP-IOT-CONNECT-DESIGN.md §4.4) word for word. Nothing here touches the DOM.

/** The Law & safety tab's text, exactly as the design's §4.4 gives it. */
export const LAW = 'IoT Connect is for your own devices on your own home network. It finds devices by sending each kind’s standard discovery question and listening for answers, or by an address you type; it never tries other addresses or ports. On a shared network (a shared flat, student halls, a hotel, an office) what it finds may be other people’s: add only a device that is yours or whose owner has said yes. Using someone else’s device without permission can be an offence (UK Computer Misuse Act 1990; Ireland’s Criminal Justice (Offences Relating to Information Systems) Act 2017). IoT Connect connects only as each maker documents, asks you to confirm on the device and in the bridge window, and never guesses passwords. Keys stay in the bridge’s file on your computer. Lights change at most twice a second and volume stops at a ceiling, because rapid flashing can trigger seizures and loud sound can harm hearing. The phone remote is plain HTTP on your Wi-Fi: use it only at home.';

/** The ownership tick beside every Add button (design §2.3), as the bridge's refusal quotes it. */
export const TICK_OWNED = 'This device is mine, or I have its owner’s permission to control it';
/** The tick that unlocks devices needing no pairing on a network that looks shared. */
export const TICK_HOME = 'This is my own home network';
export const SHARED = 'This looks like a shared network. Devices here may belong to other people.';

/** Short forms beside the buttons (design §4.4: "short forms beside the buttons"). */
export const SHORT = {
  discover: 'Asks each kind’s standard “who is there?” question once and listens for three seconds. It never tries other addresses or ports.',
  typed: 'One address at a time, with no port: the kind decides the port. The answer is the same for every failure, so it cannot map your network.',
  add: 'Add only a device that is yours or whose owner has said yes. Adding waits for Y in the bridge window.',
  pair: 'Pairing follows the maker’s own steps, with your consent on the device and Y in the bridge window. VM never guesses passwords.',
  command: 'Lights change at most twice a second, and volume stops at each device’s ceiling.',
  phone: 'The phone remote is plain HTTP on your Wi-Fi: use it only at home. Anyone on the same Wi-Fi can see its commands.',
  haSwitch: 'A switch may run a heater, a pump or a door: tick only what is safe to switch from a phone.',
  ai: 'The AI question is off unless you switch it on in the bridge’s config file, and each question is shown to you, with its host, before it is sent.',
};

/** What IoT Connect does not do: limits, not plans (design §1). */
export const LIMITS = [
  ['Infrared', 'A phone browser has no infrared. A Broadlink blaster through Home Assistant can send the codes you list.'],
  ['Miracast (screen mirroring)', 'No web page or Node program can start it: press Windows key + K on the computer.'],
  ['The EZCast app, EZAir and AirPlay', 'Undocumented, Apple-only or closed. The EZCast U02 is driven by DLNA only: it plays an address it can fetch, pauses if it supports Pause, and does not mirror.'],
  ['Bluetooth speakers', 'VM cannot see them: pair them in Windows.'],
  ['Google Cast and Android TV', 'Planned for the second version.'],
  ['Tuya', 'Needs a cloud key, so use Home Assistant.'],
  ['When it works', 'The brands are known only after the first “Look for devices”, and the computer running the bridge must be awake.'],
];

/** The phone remote's limits, stated on the Remote tab (design §2.8). */
export const PHONE_LIMITS = [
  'The remote opens in the phone’s browser and cannot install as an app (“Add to Home Screen” makes a shortcut).',
  'It is plain HTTP on your Wi-Fi: anyone on the same Wi-Fi can see its commands and could pretend to be the bridge.',
  'Whoever captures the pairing gets the key: pair at home, and revoke a phone you lose.',
  'A phone can switch, dim, colour, set volume, play, pause, stop and use a TV’s arrow keys. It cannot add, pair, change settings or see a key.',
];

/** The Hub's security line for agents (design §6, step 10). */
export const HUB_SECURITY = 'The Hub holds no keys. Hermes Messenger runs in the bridge on your own computer; an AI key you give it stays there.';

/** Where secrets live (design §4.3), for the Law & safety tab. */
export const STORED = 'Device keys and tokens, the Home Assistant token, the broker password, certificate fingerprints and phone key hashes live only in the bridge’s state file, %APPDATA%\\VM\\bridge\\iot-state.json (or the path given with --state), or in environment variables (VM_HA_TOKEN, VM_MQTT_PASSWORD, VM_AI_KEY). On Windows your user folder’s own permissions protect it, not anything VM sets. Never in this page, the site, its storage or the logs; a phone keeps only its own revocable remote key.';

/** Why the bridge is needed at all. */
export const WHY_BRIDGE = 'A website may not reach into your home network, so this page talks to the Vitruvian Manager bridge, the small program you already run for the SIGINT Dashboard. It listens on this computer only (localhost), and IoT Connect is off in it unless you start it with --iot.';
