// Feed filters, following Morphe's "Hide layout components" filters:
// keyword filter, channel filter, low view count filter, Shorts in feeds, and
// the AI channel filter (AiSList).

import { log, warn } from '../core/log.js';
import { describe, forEachVideoItem, longPressMenuItems, parseViewCount, removeVideoItems } from '../core/items.js';
import { onRouteChange } from '../core/nav.js';
import { onResponse } from '../core/responses.js';
import { addToList, defineCategory, defineSetting, get } from '../core/settings.js';
import { action, menuServiceItem, registerAction, showToast } from '../core/yttv.js';

defineCategory({ id: 'feed', title: 'Feed filters', summary: 'Hide videos by keyword, channel, views or AI channels', icon: 'FILTER_LIST' });

let lastSearch = '';

defineSetting('feed', {
  key: 'filterKeywords',
  type: 'list',
  title: 'Keyword filter',
  summary: 'Hide videos whose title or channel contains these',
  emptyHint: 'Search for a word, then come back here to add it',
  extraItems: () =>
    lastSearch
      ? [{ title: `Add "${lastSearch}"`, subtitle: 'From your last search', run: () => addToList('filterKeywords', lastSearch) }]
      : [],
});
defineSetting('feed', {
  key: 'filterChannels',
  type: 'list',
  title: 'Hidden channels',
  summary: 'Hide all videos from these channels',
  emptyHint: 'Long-press a video and choose "Hide this channel"',
});
defineSetting('feed', { key: 'channelMenuItem', title: 'Add "Hide this channel" to video menus', default: true });
defineSetting('feed', { key: 'minViews', title: 'Hide videos with few views', type: 'choice', default: 0, summary: 'English view counts only', choices: [
  { value: 0, label: 'Off' },
  { value: 1000, label: 'Under 1K views' },
  { value: 10000, label: 'Under 10K views' },
  { value: 100000, label: 'Under 100K views' },
] });
defineSetting('feed', { key: 'hideShortsInFeed', title: 'Hide Shorts in feeds', default: false });
defineSetting('feed', { key: 'aiChannelFilter', title: 'AI channel filter', type: 'choice', default: 'off',
  summary: 'Community list from AiSList',
  choices: [
    { value: 'off', label: 'Off' },
    { value: 'block', label: 'Hide blocklisted channels' },
    { value: 'blockWarn', label: 'Hide blocklisted and warnlisted channels' },
  ] });
defineSetting('feed', { key: 'filterOnWatchPage', title: 'Also filter the related videos row', default: true });

// --- Last search, for the "Add keyword" shortcut --------------------------------

onRouteChange((route) => {
  if (!route.path.startsWith('/search')) return;
  const q = route.params.get('q') ?? route.params.get('query') ?? route.params.get('search_query');
  if (q) lastSearch = q.trim();
});

// --- AiSList ------------------------------------------------------------------

const AISLIST = {
  block: 'https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt',
  warn: 'https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt',
};
const AISLIST_CACHE_KEY = 'nexalloy-tv-aislist';
const AISLIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Only @handles are used, as in Morphe. Exported for tests. */
export function parseHandleList(text) {
  const set = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) set.add(line.toLowerCase());
  }
  return set;
}

let aiLists = { block: new Set(), warn: new Set() };
let aiLoading = false;

function loadAiLists() {
  if (aiLoading) return;
  try {
    const cached = JSON.parse(localStorage.getItem(AISLIST_CACHE_KEY) ?? 'null');
    if (cached?.block) {
      aiLists = { block: parseHandleList(cached.block), warn: parseHandleList(cached.warn ?? '') };
      if (Date.now() - cached.fetchedAt < AISLIST_MAX_AGE_MS) return;
    }
  } catch {
    // Refetch.
  }
  aiLoading = true;
  Promise.all([AISLIST.block, AISLIST.warn].map((u) => fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(r.status)))))
    .then(([block, warnText]) => {
      localStorage.setItem(AISLIST_CACHE_KEY, JSON.stringify({ block, warn: warnText, fetchedAt: Date.now() }));
      aiLists = { block: parseHandleList(block), warn: parseHandleList(warnText) };
      log('AiSList loaded', aiLists.block.size, 'blocked,', aiLists.warn.size, 'warned');
    })
    .catch((err) => warn('AiSList fetch failed', err))
    .finally(() => {
      aiLoading = false;
    });
}

// --- Filtering ----------------------------------------------------------------

/**
 * Decides whether a video item should be hidden. Pure, exported for tests.
 * @returns {string|null} the reason, or null to keep it
 */
export function filterReason(info, opts) {
  const haystack = `${info.title}\n${info.channel}`.toLowerCase();
  for (const kw of opts.keywords) {
    if (kw && haystack.includes(kw.toLowerCase())) return `keyword "${kw}"`;
  }
  const channel = info.channel.toLowerCase();
  if (channel && opts.channels.some((c) => c.toLowerCase() === channel)) return `channel "${info.channel}"`;
  if (opts.hideShorts && info.isShort) return 'short';
  if (opts.minViews > 0 && !info.isLive && !info.isShort) {
    const views = parseViewCount(info.lines);
    if (views !== null && views < opts.minViews) return `${views} views`;
  }
  if (opts.aiMode !== 'off' && info.handles.length) {
    for (const h of info.handles) {
      if (opts.aiBlock.has(h)) return `AiSList ${h}`;
      if (opts.aiMode === 'blockWarn' && opts.aiWarn.has(h)) return `AiSList warn ${h}`;
    }
  }
  return null;
}

function currentOptions() {
  const aiMode = get('aiChannelFilter');
  if (aiMode !== 'off') loadAiLists();
  return {
    keywords: get('filterKeywords') ?? [],
    channels: get('filterChannels') ?? [],
    minViews: get('minViews') ?? 0,
    hideShorts: !!get('hideShortsInFeed'),
    aiMode,
    aiBlock: aiLists.block,
    aiWarn: aiLists.warn,
  };
}

function isWatchNext(r) {
  return !!r.contents?.singleColumnWatchNextResults;
}

/** Exported for tests. */
export function filterResponse(r, opts) {
  return removeVideoItems(r, (_item, info) => {
    const reason = filterReason(info, opts);
    if (reason) log('feed filter:', info.title, '-', reason);
    return !!reason;
  });
}

function addChannelMenuItems(r) {
  forEachVideoItem(r, (item) => {
    const menu = longPressMenuItems(item);
    if (!menu) return;
    const { channel } = describe(item);
    if (!channel) return;
    if (menu.some((m) => m?.menuServiceItemRenderer?.serviceEndpoint?.customAction?.action === 'NEXALLOY_HIDE_CHANNEL')) return;
    menu.push(menuServiceItem('Hide this channel', action('HIDE_CHANNEL', { channel })));
  });
}

registerAction('HIDE_CHANNEL', ({ channel }) => {
  if (addToList('filterChannels', channel)) {
    showToast(`Hiding videos from ${channel}`, 'Takes effect as feeds reload. Undo in NexAlloy > Feed filters');
  }
});

onResponse('feedFilters', (r) => {
  if (!r.contents && !r.continuationContents && !r.onResponseReceivedActions) return;
  if (isWatchNext(r) && !get('filterOnWatchPage')) return;
  const opts = currentOptions();
  const active = opts.keywords.length || opts.channels.length || opts.minViews || opts.hideShorts || opts.aiMode !== 'off';
  if (active) filterResponse(r, opts);
  if (get('channelMenuItem')) addChannelMenuItems(r);
});
