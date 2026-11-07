// IoT Connect: the one keymap the page, the phone remote and the bridge share (the bridge's KEYMAP and PHONE_KEYS in
// sigint/bridge/prp-bridge.mjs hold the same names, which tests/iot-connect.test.mjs checks). A key is sent as
// { action: 'key', args: { name } }; the bridge turns the name into each maker's own code. Only a click sends one: the
// page binds no keyboard shortcut to a command, so no key press, address or hash can make the bridge do anything.

/** Every key the remote has, in the order the phone remote lists them. */
export const KEYS = ['Up', 'Down', 'Left', 'Right', 'OK', 'Back', 'Home', 'VolumeUp', 'VolumeDown', 'Mute'];

/** What each key's button says, and its accessible name. */
export const LABELS = {
  Up: ['▲', 'Up'], Down: ['▼', 'Down'], Left: ['◀', 'Left'], Right: ['▶', 'Right'], OK: ['OK', 'OK'],
  Back: ['Back', 'Back'], Home: ['Home', 'Home'], VolumeUp: ['Vol +', 'Volume up'], VolumeDown: ['Vol −', 'Volume down'], Mute: ['Mute', 'Mute'],
};

/** The d-pad's 3 × 3 grid (null: an empty cell), then the row under it. */
export const PAD = [[null, 'Up', null], ['Left', 'OK', 'Right'], [null, 'Down', null]];
export const ROW = ['Back', 'Home', 'VolumeDown', 'Mute', 'VolumeUp'];

export const isKey = name => typeof name === 'string' && KEYS.includes(name);
