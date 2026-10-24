// Player tweaks: Morphe's loop video, disable playlist autoplay, hide info
// cards, hide end screen cards and hide end screen suggested video.

import { log } from '../core/log.js';
import { onVideoChange } from '../core/nav.js';
import { PlayerState, getVideo, onPlayerState, onVideoElement } from '../core/player.js';
import { onResponse } from '../core/responses.js';
import { defineCategory, defineSetting, get, onChange } from '../core/settings.js';
import { interceptCommands, showToast } from '../core/yttv.js';

defineCategory({ id: 'player', title: 'Player', summary: 'Looping, autoplay and end screens', icon: 'PLAY_ARROW' });
defineSetting('player', { key: 'loopVideo', title: 'Loop video', summary: 'Replay the current video when it ends', default: false });
defineSetting('player', { key: 'disablePlaylistAutoplay', title: 'Disable playlist autoplay', summary: 'Stop at the end of each video in a playlist', default: false });
defineSetting('player', { key: 'hideInfoCards', title: 'Hide info cards', default: true });
defineSetting('player', { key: 'hideEndScreenCards', title: 'Hide end screen cards', summary: 'Video, channel and link cards in the last seconds', default: false });
defineSetting('player', { key: 'hideEndScreenSuggestion', title: 'Hide end screen suggested video', summary: 'The "Up next" suggestion shown when a video ends', default: false });

// --- Response edits ---------------------------------------------------------

/** Exported for tests. */
export function applyPlayerResponseTweaks(r, opts) {
  if (opts.hideInfoCards && r.cards?.cardCollectionRenderer) delete r.cards;
  if (opts.hideEndScreenCards && r.endscreen) r.endscreen = null;
  const overlay = r.playerOverlays?.playerOverlayRenderer;
  if (opts.hideEndScreenSuggestion && overlay) {
    // Name used by the web player; verify against the TV app's next response.
    delete overlay.endScreen;
  }
}

onResponse('playerTweaks', (r) => {
  if (!r.cards && !r.endscreen && !r.playerOverlays) return;
  applyPlayerResponseTweaks(r, {
    hideInfoCards: get('hideInfoCards'),
    hideEndScreenCards: get('hideEndScreenCards'),
    hideEndScreenSuggestion: get('hideEndScreenSuggestion'),
  });
});

// --- Loop video ---------------------------------------------------------------
// With the media element looping, 'ended' never fires, so YouTube's player
// never reaches its end state and never autoplays the next video.

function applyLoop() {
  const video = getVideo();
  if (video) video.loop = !!get('loopVideo');
}

onVideoElement((video) => {
  applyLoop();
  // The player may reset attributes when it loads a new stream.
  video.addEventListener('loadedmetadata', applyLoop);
  video.addEventListener('play', applyLoop);
});
onVideoChange(() => setTimeout(applyLoop, 500));
onChange((key) => {
  if (key === 'loopVideo') applyLoop();
});

// --- Disable playlist autoplay -------------------------------------------------
// When a playlist video ends, the app resolves a watchEndpoint for the next
// entry. Navigation the user starts goes through the same path, so only
// commands that arrive shortly after the video ended are blocked.

const AUTOPLAY_WINDOW_MS = 15_000;
let endedAt = 0;

function markEnded() {
  endedAt = Date.now();
}

onVideoElement((video) => {
  video.addEventListener('ended', markEnded);
});

onPlayerState((value) => {
  if (value === PlayerState.ENDED) markEnded();
  else if (value === PlayerState.PLAYING) endedAt = 0;
});

interceptCommands((cmd) => {
  if (!get('disablePlaylistAutoplay') || !endedAt) return false;
  const watch = cmd?.watchEndpoint;
  if (!watch?.playlistId) return false;
  if (Date.now() - endedAt > AUTOPLAY_WINDOW_MS) return false;
  endedAt = 0;
  log('blocked playlist autoplay to', watch.videoId);
  showToast('Playlist autoplay is off', 'Select the next video to keep watching');
  return true;
});
