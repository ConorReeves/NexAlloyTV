// NexAlloy for YouTube TV (com.google.android.youtube.tv, Chrobalt web app).
// Injected into https://www.youtube.com/tv by the "Web app injection" patch.

import { log } from './core/log.js';
import * as nav from './core/nav.js';
import * as responses from './core/responses.js';
import * as settings from './core/settings.js';
import * as yttv from './core/yttv.js';

// Features register settings, response transforms and actions on import.
import './features/ads.js';
import './features/sponsorBlock.js';
import './features/returnYouTubeDislike.js';
import './features/playerTweaks.js';
import './features/videoQuality.js';
import './features/feedFilters.js';
import { captures } from './features/developer.js';
import { showSettings } from './ui/settingsPanel.js';

const VERSION = typeof __NEXALLOY_VERSION__ === 'string' ? __NEXALLOY_VERSION__ : 'dev';

responses.install();
yttv.install();
nav.install();

// Blue colour button opens NexAlloy settings, as a fallback to the entry in
// YouTube's Settings page.
const KEY_BLUE = 406;
document.addEventListener(
  'keydown',
  (e) => {
    if (e.keyCode === KEY_BLUE) {
      e.preventDefault();
      showSettings();
    }
  },
  true,
);

yttv.whenReady(() => {
  if (!settings.get('welcomeShown')) {
    settings.set('welcomeShown', true);
    yttv.showToast('NexAlloy is active', 'Settings: YouTube Settings > NexAlloy');
  }
});

globalThis.__nexalloy = { version: VERSION, settings, captures, showSettings };
log('loaded', VERSION);
