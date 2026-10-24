// Developer tools: response capture, for working out the shape of YouTube TV's
// API data. Captures are kept in memory only. Read them from Chrome DevTools
// (NexAlloy's "Remote debugging" patch) with:
//
//   copy(JSON.stringify(__nexalloy.captures))

import { setCapture, nativeParse } from '../core/responses.js';
import { defineCategory, defineSetting, get, onChange } from '../core/settings.js';
import { showToast } from '../core/yttv.js';

const MAX_CAPTURES = 60;
const captures = [];

defineCategory({ id: 'developer', title: 'Developer', summary: 'Debugging tools', icon: 'SETTINGS' });
defineSetting('developer', { key: 'captureResponses', title: 'Capture API responses', summary: `Keeps the last ${MAX_CAPTURES} in __nexalloy.captures`, default: false });
defineSetting('developer', {
  key: 'clearCaptures',
  type: 'action',
  title: 'Clear captured responses',
  run: () => {
    captures.length = 0;
    showToast('Captures cleared');
  },
});

function capture(response) {
  // Deep copy before transforms run, so captures show what YouTube sent.
  let copy;
  try {
    copy = nativeParse(JSON.stringify(response));
  } catch {
    return;
  }
  captures.push({ at: new Date().toISOString(), route: location.hash, keys: Object.keys(response), response: copy });
  if (captures.length > MAX_CAPTURES) captures.shift();
}

function apply() {
  setCapture(get('captureResponses') ? capture : null);
}

apply();
onChange((key) => {
  if (key === 'captureResponses') apply();
});

export { captures };
