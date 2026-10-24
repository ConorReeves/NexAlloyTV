// Player access. `.html5-video-player` is YouTube's player element, which also
// exposes the player API (getVideoData, seekTo, getPlayerState, ...).

export const PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export const getPlayer = () => document.querySelector('.html5-video-player');
export const getVideo = () => document.querySelector('video');

/** Calls back with the <video> element every time a new one appears. */
export function onVideoElement(fn) {
  let current = null;
  const check = () => {
    const video = getVideo();
    if (video && video !== current) {
      current = video;
      fn(video);
    }
  };
  setInterval(check, 500);
  check();
}

/** Normalises the player's onStateChange payload (a number or an object). */
export function stateValue(state) {
  if (typeof state === 'number') return state;
  if (state && typeof state === 'object') return state.state ?? state.data ?? state.playerState ?? null;
  return null;
}

const stateListeners = [];
let stateListenerOn = null;

/** fn(state) on every player state change (see PlayerState). */
export function onPlayerState(fn) {
  stateListeners.push(fn);
  if (stateListeners.length > 1) return;
  setInterval(() => {
    const player = getPlayer();
    if (!player || player === stateListenerOn || typeof player.addEventListener !== 'function') return;
    stateListenerOn = player;
    player.addEventListener('onStateChange', (state) => {
      const value = stateValue(state);
      for (const listener of stateListeners) {
        try {
          listener(value);
        } catch (err) {
          console.warn('[NexAlloy] state listener', err);
        }
      }
    });
  }, 1000);
}

export function seekTo(seconds) {
  const player = getPlayer();
  if (player && typeof player.seekTo === 'function') {
    player.seekTo(seconds, true);
    return;
  }
  const video = getVideo();
  if (video) video.currentTime = seconds;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
