// SponsorBlock, following Morphe's behaviour: per-category actions, skip
// toasts, privacy-preserving hash-prefix lookups and (optional) skip counting.
// API: https://wiki.sponsor.ajay.app/w/API_Docs

import { warn } from '../core/log.js';
import { onVideoChange, currentVideoId } from '../core/nav.js';
import { formatTime, onVideoElement, seekTo } from '../core/player.js';
import { defineCategory, defineSetting, get } from '../core/settings.js';
import { showToast } from '../core/yttv.js';

const API = 'https://sponsor.ajay.app/api';

defineCategory({ id: 'sponsorblock', title: 'SponsorBlock', summary: 'Skip sponsors, intros, reminders and more', icon: 'SKIP_NEXT' });

defineSetting('sponsorblock', { key: 'sbEnabled', title: 'Enable SponsorBlock', default: true });
defineSetting('sponsorblock', { key: 'sbToastOnSkip', title: 'Show a toast when skipping', default: true });
defineSetting('sponsorblock', { key: 'sbCountSkips', title: 'Count skips', summary: 'Tell SponsorBlock a segment was skipped, for the leaderboard', default: true });
defineSetting('sponsorblock', { key: 'sbMinSegment', title: 'Minimum segment length', type: 'choice', default: 0,
  choices: [{ value: 0, label: 'Any' }, { value: 1, label: '1 second' }, { value: 3, label: '3 seconds' }, { value: 5, label: '5 seconds' }] });

const BEHAVIOURS = [
  { value: 'skip', label: 'Skip automatically' },
  { value: 'skipOnce', label: 'Skip automatically once' },
  { value: 'notify', label: 'Show toast only' },
  { value: 'off', label: 'Disabled' },
];

// Morphe's categories and default behaviours.
export const CATEGORIES = [
  { id: 'sponsor', title: 'Sponsor', def: 'skip' },
  { id: 'selfpromo', title: 'Unpaid/self promotion', def: 'skip' },
  { id: 'interaction', title: 'Interaction reminder', def: 'skip' },
  { id: 'intro', title: 'Intermission/intro', def: 'notify' },
  { id: 'outro', title: 'Endcards/credits', def: 'notify' },
  { id: 'preview', title: 'Preview/recap', def: 'notify' },
  { id: 'hook', title: 'Hook/greetings', def: 'off' },
  { id: 'filler', title: 'Filler tangent', def: 'off' },
  { id: 'music_offtopic', title: 'Music: non-music section', def: 'skip' },
];

for (const c of CATEGORIES) {
  defineSetting('sponsorblock', { key: `sb_${c.id}`, title: c.title, type: 'choice', default: c.def, choices: BEHAVIOURS });
}
defineSetting('sponsorblock', { key: 'sbHighlight', title: 'Highlight', type: 'choice', default: 'notify', choices: [
  { value: 'notify', label: 'Show toast with time' },
  { value: 'jump', label: 'Jump to highlight at start' },
  { value: 'off', label: 'Disabled' },
] });

const CATEGORY_TITLE = Object.fromEntries([...CATEGORIES.map((c) => [c.id, c.title]), ['poi_highlight', 'Highlight']]);

async function sha256Hex(s) {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Picks this video's segments out of a hash-prefix response. Exported for tests. */
export function selectSegments(response, videoId, minLength = 0) {
  const entry = Array.isArray(response) ? response.find((v) => v?.videoID === videoId) : null;
  if (!entry) return [];
  return entry.segments
    .filter((s) => Array.isArray(s.segment) && s.segment.length === 2)
    .filter((s) => s.actionType === 'poi' || s.actionType === 'full' || s.segment[1] - s.segment[0] >= minLength)
    .map((s) => ({ uuid: s.UUID, category: s.category, actionType: s.actionType, start: s.segment[0], end: s.segment[1] }))
    .sort((a, b) => a.start - b.start);
}

async function fetchSegments(videoId) {
  const categories = [...CATEGORIES.map((c) => c.id), 'poi_highlight'];
  const prefix = (await sha256Hex(videoId)).slice(0, 4);
  const url = `${API}/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(categories))}` +
    `&actionTypes=${encodeURIComponent(JSON.stringify(['skip', 'poi', 'full']))}`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return selectSegments(await res.json(), videoId, get('sbMinSegment'));
}

let session = null; // { videoId, segments, skippedOnce:Set, notified:Set }

function behaviourFor(segment) {
  if (segment.category === 'poi_highlight') return get('sbHighlight');
  return get(`sb_${segment.category}`) ?? 'off';
}

function countSkip(segment) {
  if (!get('sbCountSkips')) return;
  fetch(`${API}/viewedVideoSponsorTime?UUID=${encodeURIComponent(segment.uuid)}`, { method: 'POST' }).catch(() => {});
}

function onTimeUpdate(video) {
  if (!session || !get('sbEnabled') || session.videoId !== currentVideoId()) return;
  const t = video.currentTime;
  for (const seg of session.segments) {
    if (seg.actionType !== 'skip') continue;
    if (t < seg.start || t >= seg.end - 0.25) continue;
    const behaviour = behaviourFor(seg);
    const title = CATEGORY_TITLE[seg.category] ?? seg.category;
    if (behaviour === 'notify') {
      if (!session.notified.has(seg.uuid)) {
        session.notified.add(seg.uuid);
        showToast(`${title} segment`, `Until ${formatTime(seg.end)}`);
      }
      continue;
    }
    if (behaviour === 'off') continue;
    if (behaviour === 'skipOnce' && session.skippedOnce.has(seg.uuid)) continue;
    session.skippedOnce.add(seg.uuid);
    seekTo(seg.end);
    countSkip(seg);
    if (get('sbToastOnSkip')) showToast(`Skipped ${title.toLowerCase()}`, `${formatTime(seg.start)} – ${formatTime(seg.end)}`);
    break;
  }
}

function announce(segments) {
  const full = segments.find((s) => s.actionType === 'full');
  if (full && behaviourFor(full) !== 'off') {
    showToast(`This video is entirely ${(CATEGORY_TITLE[full.category] ?? full.category).toLowerCase()}`, 'SponsorBlock');
  }
  const highlight = segments.find((s) => s.category === 'poi_highlight');
  if (highlight) {
    const mode = get('sbHighlight');
    if (mode === 'jump') {
      seekTo(highlight.start);
      showToast('Jumped to highlight', formatTime(highlight.start));
    } else if (mode === 'notify') {
      showToast('Highlight', `at ${formatTime(highlight.start)}`);
    }
  }
}

onVideoChange(async (videoId) => {
  session = null;
  if (!videoId || !get('sbEnabled')) return;
  try {
    const segments = await fetchSegments(videoId);
    if (currentVideoId() !== videoId) return;
    session = { videoId, segments, skippedOnce: new Set(), notified: new Set() };
    if (segments.length) setTimeout(() => announce(segments), 1500);
  } catch (err) {
    warn('SponsorBlock', videoId, err);
  }
});

onVideoElement((video) => {
  video.addEventListener('timeupdate', () => onTimeUpdate(video));
});
