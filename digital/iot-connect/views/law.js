// IoT Connect · Law & safety: the design's §4.4 words, exactly, and where secrets are kept (§4.3).
import { LAW, STORED } from '../lib/words.js';

export function create(ctx, panel) {
  panel.querySelector('#law-words').textContent = LAW;
  panel.querySelector('#stored-words').textContent = STORED;
  return { show() {} };
}
