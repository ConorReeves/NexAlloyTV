// Video quality, codec and frame rate overrides, in the style of SmartTube.
//
//  - Default quality: the highest available quality at or below the target,
//    applied once when each video starts. Changing quality by hand during a
//    video is respected.
//  - Preferred codec / frame rate cap: the player response's video formats
//    are narrowed, but only when a matching format is offered for the video,
//    so playback never breaks for lack of a format.
//  - A "Video" button in the player's button row (and the yellow remote
//    button) opens a menu to change quality for the current video, and
//    codec/frame rate (which reload the video at the same position).

import { log, warn } from '../core/log.js';
import { currentVideoId, onVideoChange } from '../core/nav.js';
import { PlayerState, getPlayer, getVideo, onPlayerState } from '../core/player.js';
import { onResponse } from '../core/responses.js';
import { defineCategory, defineSetting, get, getDefinition, set } from '../core/settings.js';
import { action, listItem, registerAction, resolveCommand, showModal, showToast } from '../core/yttv.js';

defineCategory({ id: 'video', title: 'Video', summary: 'Default quality, codec and frame rate', icon: 'VIDEO_QUALITY' });

defineSetting('video', { key: 'defaultQuality', title: 'Default quality', type: 'choice', default: 0,
  summary: 'Highest available at or below this',
  choices: [
    { value: 0, label: 'Auto' },
    { value: 4320, label: '4320p (8K)' },
    { value: 2160, label: '2160p (4K)' },
    { value: 1440, label: '1440p' },
    { value: 1080, label: '1080p' },
    { value: 720, label: '720p' },
    { value: 480, label: '480p' },
    { value: 360, label: '360p' },
  ] });

defineSetting('video', { key: 'preferredCodec', title: 'Preferred codec', type: 'choice', default: 'auto',
  summary: 'Used when the video offers it',
  choices: [
    { value: 'auto', label: 'Auto' },
    { value: 'av1', label: 'AV1' },
    { value: 'vp9', label: 'VP9' },
    { value: 'avc', label: 'AVC (H.264)' },
  ] });

defineSetting('video', { key: 'maxFps', title: 'Frame rate', type: 'choice', default: 0,
  summary: 'Used when the video offers it',
  choices: [
    { value: 0, label: 'Any' },
    { value: 30, label: 'Up to 30 fps' },
  ] });

defineSetting('video', { key: 'playerButton', title: 'Show "Video" button in the player', summary: 'Or press the yellow button while watching', default: true });
defineSetting('video', { key: 'qualityToast', title: 'Show a toast when quality is set', default: false });

// --- Format filtering ---------------------------------------------------------

/** 'av1' | 'vp9' | 'avc' | 'other' from a format mimeType. Exported for tests. */
export function codecOf(mimeType) {
  const m = /codecs="([^"]+)"/.exec(mimeType ?? '');
  const codec = (m ? m[1] : '').toLowerCase();
  if (codec.startsWith('av01')) return 'av1';
  if (codec.startsWith('vp9') || codec.startsWith('vp09')) return 'vp9';
  if (codec.startsWith('avc1')) return 'avc';
  return 'other';
}

const isVideoFormat = (f) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('video/');

/**
 * Keeps audio formats and only the video formats matching `keep`, if any
 * video format matches. Returns the number removed.
 */
function narrowVideoFormats(streamingData, keep) {
  const formats = streamingData?.adaptiveFormats;
  if (!Array.isArray(formats)) return 0;
  if (!formats.some((f) => isVideoFormat(f) && keep(f))) return 0;
  const kept = formats.filter((f) => !isVideoFormat(f) || keep(f));
  const removed = formats.length - kept.length;
  streamingData.adaptiveFormats = kept;
  return removed;
}

/** Exported for tests. */
export function filterFormatsByCodec(streamingData, preferred) {
  if (!preferred || preferred === 'auto') return 0;
  return narrowVideoFormats(streamingData, (f) => codecOf(f.mimeType) === preferred);
}

/** Exported for tests. Formats without an fps field are kept. */
export function filterFormatsByFps(streamingData, maxFps) {
  if (!maxFps) return 0;
  return narrowVideoFormats(streamingData, (f) => !(f.fps > maxFps));
}

onResponse('videoFormats', (r) => {
  if (!r.streamingData) return;
  // Frame rate first, so the codec choice is made among allowed frame rates.
  const byFps = filterFormatsByFps(r.streamingData, get('maxFps'));
  const byCodec = filterFormatsByCodec(r.streamingData, get('preferredCodec'));
  if (byFps || byCodec) log('formats: removed', byFps, 'by frame rate,', byCodec, 'by codec');
});

// --- Default quality ----------------------------------------------------------

const QUALITY_HEIGHT = {
  tiny: 144, small: 240, medium: 360, large: 480, hd720: 720, hd1080: 1080,
  hd1440: 1440, hd2160: 2160, hd2880: 2880, highres: 4320,
};

function qualityOptions(available) {
  return (available ?? [])
    .map((q) => {
      const id = typeof q === 'string' ? q : q?.quality;
      const label = typeof q === 'string' ? '' : q?.qualityLabel ?? '';
      const height = parseInt(label, 10) || QUALITY_HEIGHT[id] || 0;
      return { id, height, label: label || (height ? `${height}p` : id) };
    })
    .filter((q) => q.id && q.id !== 'auto' && q.height > 0)
    .sort((a, b) => b.height - a.height);
}

/**
 * Picks the best quality id at or below targetHeight from the player's
 * available qualities. Falls back to the lowest if all are above the target.
 * Accepts getAvailableQualityData() objects or getAvailableQualityLevels()
 * strings. Exported for tests.
 */
export function pickQuality(available, targetHeight) {
  const options = qualityOptions(available);
  if (!options.length) return null;
  return (options.find((q) => q.height <= targetHeight) ?? options[options.length - 1]).id;
}

const availableQualities = (player) => player?.getAvailableQualityData?.() ?? player?.getAvailableQualityLevels?.();

function setQuality(player, quality) {
  if (typeof player.setPlaybackQualityRange === 'function') player.setPlaybackQualityRange(quality, quality);
  if (typeof player.setPlaybackQuality === 'function') player.setPlaybackQuality(quality);
}

let appliedFor = null;

function applyDefaultQuality() {
  const target = get('defaultQuality');
  const player = getPlayer();
  if (!target || !player) return;
  const videoId = player.getVideoData?.()?.video_id ?? null;
  if (!videoId || appliedFor === videoId) return;

  const quality = pickQuality(availableQualities(player), target);
  if (!quality) return; // Not loaded yet; try again on the next state change.

  appliedFor = videoId;
  try {
    setQuality(player, quality);
    log('quality:', quality, 'for', videoId);
    if (get('qualityToast')) showToast('Quality set', `${QUALITY_HEIGHT[quality] ?? quality}p`);
  } catch (err) {
    warn('quality', err);
  }
}

onVideoChange(() => {
  appliedFor = null;
});

onPlayerState((state) => {
  if (state === PlayerState.PLAYING || state === PlayerState.BUFFERING) applyDefaultQuality();
});

// --- Player button and menu -----------------------------------------------------

const BUTTON_TYPE = 'TRANSPORT_CONTROLS_BUTTON_TYPE_NEXALLOY_VIDEO';
const MENU_ID = 'nexalloy-video-menu';
const POPUP_BACK = { signalAction: { signal: 'POPUP_BACK' } };

/** Adds the "Video" button to the player's button row. Exported for tests. */
export function addPlayerButton(r) {
  const controls = r?.transportControls?.transportControlsRenderer;
  if (!controls) return false;
  if (!Array.isArray(controls.promotedActions)) controls.promotedActions = [];
  if (controls.promotedActions.some((a) => a?.type === BUTTON_TYPE)) return false;
  controls.promotedActions.push({
    type: BUTTON_TYPE,
    button: {
      buttonRenderer: {
        isDisabled: false,
        text: { runs: [{ text: 'Video' }] },
        icon: { iconType: 'VIDEO_QUALITY' },
        command: action('VIDEO_MENU'),
      },
    },
  });
  return true;
}

onResponse('playerButton', (r) => {
  if (get('playerButton')) addPlayerButton(r);
});

function playingSummary(player) {
  try {
    const stats = player.getStatsForNerds?.();
    if (!stats) return '';
    const codec = String(stats.codecs ?? '').split(/[\s(/]/)[0];
    const res = String(stats.resolution ?? '').split(' ')[0];
    return [res, codec].filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

function currentQualityLabel(player) {
  const id = player.getPlaybackQuality?.();
  const option = qualityOptions(availableQualities(player)).find((q) => q.id === id);
  return option?.label ?? (id && id !== 'unknown' ? id : 'Auto');
}

const choiceLabel = (key) => {
  const def = getDefinition(key);
  const value = get(key);
  return def.choices.find((c) => c.value === value)?.label ?? String(value);
};

function showVideoMenu(update = false, selectedIndex = 0) {
  const player = getPlayer();
  if (!player || !currentVideoId()) {
    showToast('No video playing');
    return;
  }
  const playing = playingSummary(player);
  const items = [
    listItem({ title: 'Quality', subtitle: `${currentQualityLabel(player)} · this video`, icon: 'VIDEO_QUALITY', secondaryIcon: 'CHEVRON_RIGHT' },
      [action('VIDEO_QUALITY_MENU')]),
    listItem({ title: 'Codec', subtitle: `${choiceLabel('preferredCodec')} · reloads the video`, icon: 'SETTINGS', secondaryIcon: 'CHEVRON_RIGHT' },
      [action('VIDEO_CHOICE_MENU', { key: 'preferredCodec' })]),
    listItem({ title: 'Frame rate', subtitle: `${choiceLabel('maxFps')} · reloads the video`, icon: 'SLOW_MOTION_VIDEO', secondaryIcon: 'CHEVRON_RIGHT' },
      [action('VIDEO_CHOICE_MENU', { key: 'maxFps' })]),
  ];
  showModal({ id: MENU_ID, title: 'Video', subtitle: playing ? `Playing ${playing}` : undefined, items, selectedIndex, update });
}

function showQualityMenu() {
  const player = getPlayer();
  const options = qualityOptions(availableQualities(player));
  const current = player?.getPlaybackQuality?.();
  const items = [
    listItem({ title: 'Auto', secondaryIcon: current === 'auto' ? 'RADIO_BUTTON_CHECKED' : 'RADIO_BUTTON_UNCHECKED' },
      [POPUP_BACK, action('VIDEO_SET_QUALITY', { quality: 'auto' })]),
    ...options.map((q) =>
      listItem({ title: q.label, secondaryIcon: q.id === current ? 'RADIO_BUTTON_CHECKED' : 'RADIO_BUTTON_UNCHECKED' },
        [POPUP_BACK, action('VIDEO_SET_QUALITY', { quality: q.id })]),
    ),
  ];
  const selected = Math.max(0, items.findIndex((i) => i.compactLinkRenderer.secondaryIcon.iconType === 'RADIO_BUTTON_CHECKED'));
  showModal({ id: `${MENU_ID}-quality`, title: 'Quality', subtitle: 'For this video', items, selectedIndex: selected });
}

function showChoiceMenu(key) {
  const def = getDefinition(key);
  const value = get(key);
  const items = def.choices.map((c) =>
    listItem({ title: c.label, secondaryIcon: c.value === value ? 'RADIO_BUTTON_CHECKED' : 'RADIO_BUTTON_UNCHECKED' },
      [POPUP_BACK, action('VIDEO_SET_CHOICE', { key, value: c.value })]),
  );
  const selected = Math.max(0, def.choices.findIndex((c) => c.value === value));
  showModal({ id: `${MENU_ID}-${key}`, title: def.title, subtitle: `${def.summary}. Also changes the default.`, items, selectedIndex: selected });
}

/**
 * Reloads the current video at the same position, so a new player response
 * is fetched and format filtering applies.
 */
function reloadCurrentVideo() {
  const player = getPlayer();
  const videoId = player?.getVideoData?.()?.video_id ?? currentVideoId();
  if (!videoId) return;
  const at = Math.floor(player?.getCurrentTime?.() ?? getVideo()?.currentTime ?? 0);
  appliedFor = null;
  if (typeof player?.loadVideoById === 'function') {
    player.loadVideoById({ videoId, startSeconds: at });
  } else {
    resolveCommand({ watchEndpoint: { videoId, startTimeSeconds: at } });
  }
}

registerAction('VIDEO_MENU', () => showVideoMenu());
registerAction('VIDEO_QUALITY_MENU', () => showQualityMenu());
registerAction('VIDEO_CHOICE_MENU', ({ key }) => showChoiceMenu(key));

registerAction('VIDEO_SET_QUALITY', ({ quality }) => {
  const player = getPlayer();
  if (!player) return;
  // Stop the default-quality logic from overriding a manual choice.
  appliedFor = player.getVideoData?.()?.video_id ?? appliedFor;
  try {
    if (quality === 'auto') {
      player.setPlaybackQualityRange?.('auto', 'auto');
      player.setPlaybackQuality?.('auto');
    } else {
      setQuality(player, quality);
    }
    showToast('Quality', quality === 'auto' ? 'Auto' : `${QUALITY_HEIGHT[quality] ?? quality}p`);
  } catch (err) {
    warn('set quality', err);
  }
});

registerAction('VIDEO_SET_CHOICE', ({ key, value }) => {
  if (get(key) === value) return;
  set(key, value);
  showToast(getDefinition(key).title, `${choiceLabel(key)} · reloading`);
  reloadCurrentVideo();
});

// Yellow button opens the menu while watching.
const KEY_YELLOW = 405;
globalThis.document?.addEventListener?.(
  'keydown',
  (e) => {
    if (e.keyCode !== KEY_YELLOW || !currentVideoId()) return;
    e.preventDefault();
    e.stopPropagation();
    showVideoMenu();
  },
  true,
);
