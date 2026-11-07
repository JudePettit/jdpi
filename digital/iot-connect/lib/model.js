// IoT Connect: the page's pure parts (names, grouping, commands, the state line). No DOM and no network, so Node tests
// load it as it is. Every string that came from a device (names, rooms, makers, announcements) is shown by the views
// with textContent only; nothing here builds HTML.

/** The kinds a typed address may name (the bridge's TYPED_KINDS): the kind decides the port, so the user gives none. */
export const TYPED_KINDS = [
  ['roku', 'Roku TV or player'], ['hue', 'Philips Hue bridge'], ['shelly', 'Shelly relay or dimmer'], ['tasmota', 'Tasmota device'],
  ['wiz', 'WiZ light'], ['lifx', 'LIFX light'], ['sonos', 'Sonos speaker'], ['samsung', 'Samsung TV'],
];

export const KIND_LABEL = {
  'media-renderer': 'Player', speaker: 'Speaker', tv: 'TV', light: 'Light', switch: 'Switch', 'hue-bridge': 'Hue bridge', cast: 'Google Cast',
  airplay: 'AirPlay', 'home-assistant': 'Home Assistant', broker: 'MQTT broker', remote: 'Remote', 'media-player': 'Player',
};
export const PROTOCOL_LABEL = {
  'upnp-av': 'DLNA (UPnP AV)', 'roku-ecp': 'Roku ECP', 'hue-clip2': 'Hue CLIP v2', 'hue-light': 'Hue light', 'shelly-rpc': 'Shelly RPC', 'tasmota-http': 'Tasmota HTTP',
  'wiz-udp': 'WiZ (UDP)', 'yeelight-lan': 'Yeelight LAN', 'lifx-lan': 'LIFX LAN', 'lg-webos': 'LG webOS', 'samsung-tizen': 'Samsung Tizen', 'home-assistant': 'Home Assistant',
};
export const kindLabel = k => KIND_LABEL[k] || (k ? String(k) : 'Device');
export const protocolLabel = p => PROTOCOL_LABEL[p] || (p ? String(p) : 'None VM can drive');

/** A device's status as a word and its tone: ok, offline, moved. */
export function statusWord(status) {
  return ({ ok: ['good', 'Ready'], offline: ['warn', 'Not answering'], moved: ['bad', 'Moved: a different device answers there'] })[status] || ['', 'Unknown'];
}

/** A typed address: an IPv4 or IPv6 address with no port, or null. The bridge checks it again, and more strictly. */
export function typedAddress(s) {
  const v = String(s ?? '').trim();
  if (/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v)) return v;
  if (/^[0-9a-f:]+$/i.test(v) && v.includes(':') && (v.match(/::/g) || []).length <= 1 && v.split(':').length <= 8 && v.split(':').every(p => p.length <= 4)) return v.toLowerCase();
  return null;
}

/** Devices grouped by room, rooms in alphabetical order with the room-less last, devices by name within. */
export function byRoom(devices) {
  const rooms = new Map();
  for (const d of devices || []) {
    const room = String(d.room || '').trim();
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room).push(d);
  }
  const names = [...rooms.keys()].sort((a, b) => (!a) - (!b) || a.localeCompare(b, 'en-GB'));
  return names.map(room => ({ room, label: room || 'No room', devices: rooms.get(room).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en-GB')) }));
}

/** The words for what a device can do, from its actions[]. */
export const ACTION_LABEL = {
  power: 'switch on and off', toggle: 'toggle', brightness: 'dim', colour: 'colour', 'colour-temp': 'white temperature', volume: 'set volume', mute: 'mute',
  'play-url': 'play an address', play: 'play', pause: 'pause', stop: 'stop', seek: 'seek', key: 'remote keys', launch: 'open a channel or app', ha: 'Home Assistant services',
};
export const canList = actions => (actions || []).map(a => ACTION_LABEL[a] || a).join(', ');

/** One command's body, with the numbers clamped as the bridge clamps them (it checks again). */
let seq = 0;
export function commandBody(device, action, args) {
  const a = args ? { ...args } : undefined;
  if (a && 'level' in a) a.level = Math.round(Math.min(action === 'volume' ? Number(device.volumeCeiling ?? 100) : 100, Math.max(0, Number(a.level) || 0)));
  if (a && 'kelvin' in a) a.kelvin = Math.round(Math.min(6500, Math.max(2000, Number(a.kelvin) || 2700)));
  if (a && 'hex' in a) a.hex = String(a.hex).toLowerCase();
  if (a && 'seconds' in a) a.seconds = Math.round(Math.max(0, Number(a.seconds) || 0));
  return { v: 1, id: `c-${Date.now().toString(36)}-${(++seq).toString(36)}`, device: device.id, action, ...(a ? { args: a } : {}) };
}

/** The state a device last reported, as one plain line: "On · 60% · Volume 20 · Playing". */
export function stateLine(state) {
  if (!state) return 'No state read yet';
  const parts = [];
  if (state.online === false) parts.push('Not answering');
  if (state.power === true) parts.push('On'); else if (state.power === false) parts.push('Off');
  if (Number.isFinite(state.brightness)) parts.push(`${Math.round(state.brightness)}%`);
  if (Number.isFinite(state.volume)) parts.push(`Volume ${Math.round(state.volume)}`);
  if (state.playback) parts.push(String(state.playback).replace(/^./, c => c.toUpperCase()));
  return parts.length ? parts.join(' · ') : 'No state read yet';
}

/** Which actions a remote pad can send to a device: keys, volume, playback. */
export const remoteable = d => d && d.status !== 'moved' && (d.actions || []).some(a => ['key', 'volume', 'mute', 'play', 'pause', 'stop', 'power'].includes(a));

/** "2 min ago" for an ISO time. */
export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
