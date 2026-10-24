// Return YouTube Dislike. The TV UI has no dislike counter to fill in, so the
// counts are shown as a toast when a video starts.
// API: https://returnyoutubedislike.com/docs

import { warn } from '../core/log.js';
import { currentVideoId, onVideoChange } from '../core/nav.js';
import { defineCategory, defineSetting, get } from '../core/settings.js';
import { showToast } from '../core/yttv.js';

const API = 'https://returnyoutubedislikeapi.com/votes?videoId=';

defineCategory({ id: 'ryd', title: 'Return YouTube Dislike', summary: 'Dislike counts from returnyoutubedislike.com', icon: 'DISLIKE' });
defineSetting('ryd', { key: 'rydEnabled', title: 'Show dislikes when a video starts', default: true });
defineSetting('ryd', { key: 'rydStyle', title: 'Format', type: 'choice', default: 'count', choices: [
  { value: 'count', label: 'Counts' },
  { value: 'percent', label: 'Like/dislike percentage' },
] });

export function formatCount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '?';
  try {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

export function formatVotes(data, style) {
  const likes = data.likes ?? 0;
  const dislikes = data.dislikes ?? 0;
  const total = likes + dislikes;
  if (style === 'percent' && total > 0) {
    const pct = Math.round((likes / total) * 100);
    return [`${100 - pct}% disliked`, `${pct}% liked · ${formatCount(total)} ratings`];
  }
  return [`${formatCount(dislikes)} dislikes`, `${formatCount(likes)} likes`];
}

const cache = new Map();

onVideoChange(async (videoId) => {
  if (!videoId || !get('rydEnabled')) return;
  try {
    let data = cache.get(videoId);
    if (!data) {
      const res = await fetch(API + encodeURIComponent(videoId));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      cache.set(videoId, data);
    }
    // Let the player UI settle so the toast isn't swallowed by the transition.
    setTimeout(() => {
      if (currentVideoId() !== videoId) return;
      const [title, subtitle] = formatVotes(data, get('rydStyle'));
      showToast(`👎 ${title}`, subtitle);
    }, 2500);
  } catch (err) {
    warn('RYD', videoId, err);
  }
});
