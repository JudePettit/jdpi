// SIGINT Dashboard: just enough of the Meshtastic client protocol to list nodes from your own radio over USB (pure).
// The radio speaks protobuf (meshtastic/protobufs, mesh.proto) in frames of 0x94 0xC3, a 16-bit big-endian length and
// the payload. We ask for the node database (ToRadio.want_config_id) and read FromRadio my_info, node_info and position,
// user and telemetry packets. Text messages are deliberately not decoded: this view is about the mesh, not its chat.

export const START1 = 0x94, START2 = 0xC3, MAX_FRAME = 512;
export const PORT = { TEXT_MESSAGE_APP: 1, POSITION_APP: 3, NODEINFO_APP: 4, ROUTING_APP: 5, TELEMETRY_APP: 67, NEIGHBORINFO_APP: 71 };
export const BROADCAST = 0xffffffff;

/* ---- Protobuf wire format ----------------------------------------------------------------------------------------- */
/** Iterate the fields of a protobuf message: { field, wire, v } where v is a BigInt (varint), Uint8Array (bytes) or a
    DataView-backed { u32, i32, f32 } for 32-bit fields and { u64 } for 64-bit ones. Stops quietly at malformed input. */
export function* fields(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  const varint = () => {
    let r = 0n, s = 0n;
    for (let k = 0; k < 10; k++) {
      if (i >= buf.length) throw new RangeError('truncated varint');
      const b = buf[i++];
      r |= BigInt(b & 0x7f) << s; s += 7n;
      if (!(b & 0x80)) return r;
    }
    throw new RangeError('varint too long');
  };
  try {
    while (i < buf.length) {
      const key = Number(varint()), field = key >>> 3, wire = key & 7;
      if (field === 0) return;
      if (wire === 0) yield { field, wire, v: varint() };
      else if (wire === 1) { if (i + 8 > buf.length) return; yield { field, wire, v: { u64: view.getBigUint64(i, true), f64: view.getFloat64(i, true) } }; i += 8; }
      else if (wire === 2) { const len = Number(varint()); if (i + len > buf.length) return; yield { field, wire, v: buf.subarray(i, i + len) }; i += len; }
      else if (wire === 5) { if (i + 4 > buf.length) return; yield { field, wire, v: { u32: view.getUint32(i, true), i32: view.getInt32(i, true), f32: view.getFloat32(i, true) } }; i += 4; }
      else return; // groups (3/4) are not used by Meshtastic
    }
  } catch { /* truncated message: keep what was read */ }
}
const u32 = v => Number(BigInt.asUintN(32, v));
const i32 = v => Number(BigInt.asIntN(32, BigInt.asIntN(64, v)));
const sint32 = v => { const n = Number(BigInt.asUintN(32, v)); return (n >>> 1) ^ -(n & 1); };
const text = b => new TextDecoder().decode(b);
const fixed = v => (v && typeof v === 'object' && 'u32' in v ? v : null);

/** Minimal protobuf writer, enough for ToRadio and for tests. */
export function pb() {
  const out = [];
  const varint = n => { let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); };
  const api = {
    varint(field, n) { varint((field << 3) | 0); varint(n); return api; },
    sint(field, n) { varint((field << 3) | 0); varint(n >= 0 ? n * 2 : -n * 2 - 1); return api; },
    bytes(field, b) { varint((field << 3) | 2); varint(b.length); out.push(...b); return api; },
    string(field, s) { return api.bytes(field, new TextEncoder().encode(s)); },
    message(field, w) { return api.bytes(field, w.done()); },
    fixed32(field, n) { varint((field << 3) | 5); const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, n >>> 0, true); out.push(...new Uint8Array(d.buffer)); return api; },
    sfixed32(field, n) { varint((field << 3) | 5); const d = new DataView(new ArrayBuffer(4)); d.setInt32(0, n | 0, true); out.push(...new Uint8Array(d.buffer)); return api; },
    float(field, x) { varint((field << 3) | 5); const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x, true); out.push(...new Uint8Array(d.buffer)); return api; },
    done: () => Uint8Array.from(out),
  };
  return api;
}
/** Wrap a payload in the serial frame header. */
export function frame(payload) {
  const f = new Uint8Array(payload.length + 4);
  f[0] = START1; f[1] = START2; f[2] = (payload.length >> 8) & 0xff; f[3] = payload.length & 0xff; f.set(payload, 4);
  return f;
}
/** ToRadio { want_config_id } in a serial frame: asks the radio to send its node database. */
export const wantConfigFrame = id => frame(pb().varint(3, id >>> 0).done());
/** Bytes to send first: 32 × START2 wakes a sleeping radio and resynchronises its frame parser (as the official clients do). */
export const WAKE = new Uint8Array(32).fill(START2);

/** A streaming frame parser: push byte chunks; calls onFrame(payload) for each frame and onText(line) for debug-log text. */
export function frameParser(onFrame, onText = () => {}) {
  let buf = new Uint8Array(0), textBuf = '';
  const flushText = bytes => {
    if (!bytes.length) return;
    textBuf += new TextDecoder().decode(bytes);
    const lines = textBuf.split(/\r?\n/); textBuf = lines.pop();
    if (textBuf.length > 2048) textBuf = '';
    for (const l of lines) if (l.trim()) onText(l);
  };
  return chunk => {
    const merged = new Uint8Array(buf.length + chunk.length); merged.set(buf); merged.set(chunk, buf.length); buf = merged;
    let i = 0;
    while (i < buf.length) {
      const s = buf.indexOf(START1, i);
      if (s < 0) { flushText(buf.subarray(i)); i = buf.length; break; }
      if (s > i) flushText(buf.subarray(i, s));
      if (s + 4 > buf.length) { i = s; break; }
      if (buf[s + 1] !== START2) { flushText(buf.subarray(s, s + 1)); i = s + 1; continue; }
      const len = (buf[s + 2] << 8) | buf[s + 3];
      if (len > MAX_FRAME) { i = s + 1; continue; } // corrupt length: resync on the next START1
      if (s + 4 + len > buf.length) { i = s; break; }
      onFrame(buf.slice(s + 4, s + 4 + len));
      i = s + 4 + len;
    }
    buf = buf.slice(i);
  };
}

/* ---- Messages ------------------------------------------------------------------------------------------------------ */
export function decodeUser(b) {
  const u = {};
  for (const { field, v } of fields(b)) {
    if (field === 1) u.id = text(v); else if (field === 2) u.longName = text(v); else if (field === 3) u.shortName = text(v);
    else if (field === 5) u.hwModel = u32(v); else if (field === 6) u.isLicensed = v !== 0n; else if (field === 7) u.role = u32(v);
  }
  return u;
}
export function decodePosition(b) {
  const p = {};
  for (const { field, v } of fields(b)) {
    const f = fixed(v);
    if (field === 1 && f) p.lat = f.i32 / 1e7; else if (field === 2 && f) p.lon = f.i32 / 1e7;
    else if (field === 3 && typeof v === 'bigint') p.alt = i32(v); else if (field === 4 && f) p.time = f.u32;
    else if (field === 9 && typeof v === 'bigint') p.altHae = sint32(v);
    else if (field === 19 && typeof v === 'bigint') p.sats = u32(v); else if (field === 23 && typeof v === 'bigint') p.precisionBits = u32(v);
  }
  if (p.lat === 0 && p.lon === 0) { delete p.lat; delete p.lon; }
  return p;
}
export function decodeDeviceMetrics(b) {
  const m = {};
  for (const { field, v } of fields(b)) {
    const f = fixed(v);
    if (field === 1 && typeof v === 'bigint') m.battery = u32(v); else if (field === 2 && f) m.voltage = f.f32;
    else if (field === 3 && f) m.channelUtil = f.f32; else if (field === 4 && f) m.airUtilTx = f.f32; else if (field === 5 && typeof v === 'bigint') m.uptime = u32(v);
  }
  return m;
}
export function decodeNodeInfo(b) {
  const n = {};
  for (const { field, v } of fields(b)) {
    const f = fixed(v);
    if (field === 1) n.num = u32(v); else if (field === 2) n.user = decodeUser(v); else if (field === 3) n.position = decodePosition(v);
    else if (field === 4 && f) n.snr = f.f32; else if (field === 5 && f) n.lastHeard = f.u32; else if (field === 6) n.deviceMetrics = decodeDeviceMetrics(v);
    else if (field === 7) n.channel = u32(v); else if (field === 8) n.viaMqtt = v !== 0n; else if (field === 9) n.hopsAway = u32(v);
  }
  return n;
}
export function decodeMeshPacket(b) {
  const p = {};
  for (const { field, v } of fields(b)) {
    const f = fixed(v);
    if (field === 1 && f) p.from = f.u32; else if (field === 2 && f) p.to = f.u32; else if (field === 3) p.channel = u32(v);
    else if (field === 4) {
      const d = {};
      for (const x of fields(v)) { if (x.field === 1) d.portnum = u32(x.v); else if (x.field === 2) d.payload = x.v; }
      p.decoded = d;
    } else if (field === 5) p.encrypted = true; else if (field === 6 && f) p.id = f.u32; else if (field === 7 && f) p.rxTime = f.u32;
    else if (field === 8 && f) p.rxSnr = f.f32; else if (field === 9) p.hopLimit = u32(v); else if (field === 12) p.rxRssi = i32(v);
    else if (field === 14) p.viaMqtt = v !== 0n; else if (field === 15) p.hopStart = u32(v);
  }
  return p;
}
/** Telemetry: time (1) and, of its variants, device_metrics (2). */
export function decodeTelemetry(b) {
  const t = {};
  for (const { field, v } of fields(b)) { const f = fixed(v); if (field === 1 && f) t.time = f.u32; else if (field === 2) t.deviceMetrics = decodeDeviceMetrics(v); }
  return t;
}
/** FromRadio → { kind, … }. */
export function decodeFromRadio(b) {
  for (const { field, v } of fields(b)) {
    if (field === 2) return { kind: 'packet', packet: decodeMeshPacket(v) };
    if (field === 3) { let myNode = null; for (const x of fields(v)) if (x.field === 1) myNode = u32(x.v); return { kind: 'myInfo', myNodeNum: myNode }; }
    if (field === 4) return { kind: 'nodeInfo', node: decodeNodeInfo(v) };
    if (field === 7) return { kind: 'configComplete', id: u32(v) };
    if (field === 8) return { kind: 'rebooted' };
    if (field === 13) return { kind: 'metadata' };
  }
  return { kind: 'other' };
}

/* ---- Node database ------------------------------------------------------------------------------------------------- */
export const nodeId = num => '!' + (num >>> 0).toString(16).padStart(8, '0');
/** Merge one decoded FromRadio into a Map(num → node). Returns true if something visible changed. */
export function applyFromRadio(db, msg, nowSec = Math.floor(Date.now() / 1000)) {
  if (!msg) return false;
  if (msg.kind === 'myInfo' && msg.myNodeNum != null) { db.myNodeNum = msg.myNodeNum; return true; }
  if (msg.kind === 'nodeInfo' && msg.node?.num != null) {
    const n = msg.node, cur = db.get(n.num) || { num: n.num, id: nodeId(n.num) };
    if (n.user) Object.assign(cur, { longName: n.user.longName ?? cur.longName, shortName: n.user.shortName ?? cur.shortName, hwModel: n.user.hwModel ?? cur.hwModel, role: n.user.role ?? cur.role, isLicensed: n.user.isLicensed });
    if (n.position && n.position.lat != null) Object.assign(cur, { lat: n.position.lat, lon: n.position.lon, alt: n.position.alt ?? null, precisionBits: n.position.precisionBits ?? null });
    if (n.snr != null) cur.snr = n.snr;
    if (n.lastHeard) cur.lastHeard = n.lastHeard;
    if (n.deviceMetrics) Object.assign(cur, { battery: n.deviceMetrics.battery ?? cur.battery, voltage: n.deviceMetrics.voltage ?? cur.voltage, channelUtil: n.deviceMetrics.channelUtil ?? cur.channelUtil });
    if (n.hopsAway != null) cur.hopsAway = n.hopsAway;
    cur.viaMqtt = !!n.viaMqtt;
    db.set(n.num, cur);
    return true;
  }
  if (msg.kind === 'packet' && msg.packet?.from != null) {
    const p = msg.packet, cur = db.get(p.from) || { num: p.from, id: nodeId(p.from) };
    cur.lastHeard = p.rxTime || nowSec;
    if (p.rxSnr != null && p.rxSnr !== 0) cur.snr = p.rxSnr;
    if (p.rxRssi != null && p.rxRssi !== 0) cur.rssi = p.rxRssi;
    if (p.hopStart) cur.hopsAway = Math.max(0, p.hopStart - (p.hopLimit ?? 0));
    if (p.viaMqtt != null) cur.viaMqtt = p.viaMqtt;
    const d = p.decoded;
    if (d?.payload) {
      if (d.portnum === PORT.POSITION_APP) { const pos = decodePosition(d.payload); if (pos.lat != null) Object.assign(cur, { lat: pos.lat, lon: pos.lon, alt: pos.alt ?? null, precisionBits: pos.precisionBits ?? null }); }
      else if (d.portnum === PORT.NODEINFO_APP) { const u = decodeUser(d.payload); Object.assign(cur, { longName: u.longName ?? cur.longName, shortName: u.shortName ?? cur.shortName, hwModel: u.hwModel ?? cur.hwModel }); }
      else if (d.portnum === PORT.TELEMETRY_APP) { const t = decodeTelemetry(d.payload); if (t.deviceMetrics) Object.assign(cur, { battery: t.deviceMetrics.battery ?? cur.battery, voltage: t.deviceMetrics.voltage ?? cur.voltage, channelUtil: t.deviceMetrics.channelUtil ?? cur.channelUtil }); }
    }
    db.set(p.from, cur);
    return true;
  }
  return false;
}

/** HardwareModel names from mesh.proto (October 2026); unknown numbers show as "Model n". */
const HW = 'UNSET,TLORA_V2,TLORA_V1,TLORA_V2_1_1P6,TBEAM,HELTEC_V2_0,TBEAM_V0P7,T_ECHO,TLORA_V1_1P3,RAK4631,HELTEC_V2_1,HELTEC_V1,LILYGO_TBEAM_S3_CORE,RAK11200,NANO_G1,TLORA_V2_1_1P8,TLORA_T3_S3,NANO_G1_EXPLORER,NANO_G2_ULTRA,LORA_TYPE,WIPHONE,WIO_WM1110,RAK2560,HELTEC_HRU_3601,HELTEC_WIRELESS_BRIDGE,STATION_G1,RAK11310,MAKERFABS_TRACKER,MAKERFABS_RESERVED,CANARYONE,RP2040_LORA,STATION_G2,LORA_RELAY_V1,T_ECHO_PLUS,PPR,GENIEBLOCKS,NRF52_UNKNOWN,PORTDUINO,ANDROID_SIM,DIY_V1,NRF52840_PCA10059,DR_DEV,M5STACK,HELTEC_V3,HELTEC_WSL_V3,BETAFPV_2400_TX,BETAFPV_900_NANO_TX,RPI_PICO,HELTEC_WIRELESS_TRACKER,HELTEC_WIRELESS_PAPER,T_DECK,T_WATCH_S3,PICOMPUTER_S3,HELTEC_HT62,EBYTE_ESP32_S3,ESP32_S3_PICO,CHATTER_2,HELTEC_WIRELESS_PAPER_V1_0,HELTEC_WIRELESS_TRACKER_V1_0,UNPHONE,TD_LORAC,CDEBYTE_EORA_S3,TWC_MESH_V4,NRF52_PROMICRO_DIY,RADIOMASTER_900_BANDIT_NANO,HELTEC_CAPSULE_SENSOR_V3,HELTEC_VISION_MASTER_T190,HELTEC_VISION_MASTER_E213,HELTEC_VISION_MASTER_E290,HELTEC_MESH_NODE_T114,SENSECAP_INDICATOR,TRACKER_T1000_E,RAK3172,WIO_E5,RADIOMASTER_900_BANDIT,ME25LS01_4Y10TD,RP2040_FEATHER_RFM95,M5STACK_COREBASIC,M5STACK_CORE2,RPI_PICO2,M5STACK_CORES3,SEEED_XIAO_S3,MS24SF1,TLORA_C6,WISMESH_TAP,ROUTASTIC,MESH_TAB,MESHLINK,XIAO_NRF52_KIT,THINKNODE_M1,THINKNODE_M2,T_ETH_ELITE,HELTEC_SENSOR_HUB,MUZI_BASE,HELTEC_MESH_POCKET,SEEED_SOLAR_NODE,NOMADSTAR_METEOR_PRO,CROWPANEL,LINK_32,SEEED_WIO_TRACKER_L1,SEEED_WIO_TRACKER_L1_EINK,MUZI_R1_NEO,T_DECK_PRO,T_LORA_PAGER,M5STACK_RESERVED,WISMESH_TAG,RAK3312,THINKNODE_M5,HELTEC_MESH_SOLAR,T_ECHO_LITE,HELTEC_V4,M5STACK_C6L,M5STACK_CARDPUTER_ADV,HELTEC_WIRELESS_TRACKER_V2,T_WATCH_ULTRA,THINKNODE_M3,WISMESH_TAP_V2,RAK3401,RAK6421,THINKNODE_M4,THINKNODE_M6,MESHSTICK_1262,TBEAM_1_WATT,T5_S3_EPAPER_PRO,TBEAM_BPF,MINI_EPAPER_S3,TDISPLAY_S3_PRO,HELTEC_MESH_NODE_T096,MESH_TRACKER_X1,THINKNODE_M7,THINKNODE_M8,THINKNODE_M9,HELTEC_V4_R8,HELTEC_MESH_NODE_T1,STATION_G3,T_IMPULSE_PLUS,T_ECHO_CARD,SEEED_WIO_TRACKER_L2,CROWPANEL_P4,HELTEC_MESH_TOWER_V2,MESHNOLOGY_W10,HELTEC_RC32,HELTEC_RC52,HELTEC_RCC6,SEEED_WIO_TRACKER_L1_PRO_1W,MESHNOLOGY_W12,MESHPAGER_X2,T_CONNECT_PRO,AXIOMETA_GENESIS_MINI,MAKERFABS_NOMAD_TERMINAL,THINKNODE_MX,NODARA,HELTEC_MESH_POCKET_V2'.split(',');
export function hwModelName(n) {
  if (n == null) return '–';
  if (n === 255) return 'Private hardware';
  const s = HW[n];
  return s ? s.replace(/_/g, ' ').replace(/\bV(\d)P(\d)\b/g, 'V$1.$2') : `Model ${n}`;
}
