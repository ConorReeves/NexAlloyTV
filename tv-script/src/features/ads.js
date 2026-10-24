// Hide ads. Mirrors Morphe's "Hide ads" / "Hide video ads" by stripping ad
// data from API responses before the app sees it.

import { removeRenderers } from '../core/items.js';
import { onResponse } from '../core/responses.js';
import { defineCategory, defineSetting, get } from '../core/settings.js';

defineCategory({ id: 'ads', title: 'Ads', summary: 'Video, feed and Shorts ads', icon: 'BLOCK' });
defineSetting('ads', { key: 'hideVideoAds', title: 'Hide video ads', summary: 'Pre-roll, mid-roll and overlay ads', default: true });
defineSetting('ads', { key: 'hideFeedAds', title: 'Hide feed ads', summary: 'Ad tiles and banners on the home screen, search and the related row', default: true });
defineSetting('ads', { key: 'hidePaidPromotionLabel', title: 'Hide paid promotion label', summary: 'The "Includes paid promotion" overlay', default: true });

// Renderer keys that are always ads when they appear as an item in a list.
const FEED_AD_KEYS = new Set([
  'adSlotRenderer',
  'promotedVideoRenderer',
  'compactPromotedVideoRenderer',
  'searchPyvRenderer',
  'tvMastheadRenderer',
  'statementBannerRenderer',
  'bannerPromoRenderer',
]);

export function stripVideoAds(r) {
  let changed = false;
  for (const key of ['adPlacements', 'adSlots']) {
    if (Array.isArray(r[key]) && r[key].length) {
      r[key] = [];
      changed = true;
    }
  }
  if (r.playerAds) {
    r.playerAds = [];
    changed = true;
  }
  if (r.adBreakHeartbeatParams) {
    delete r.adBreakHeartbeatParams;
    changed = true;
  }
  return changed;
}

export function stripFeedAds(r) {
  let removed = removeRenderers(r, (k) => FEED_AD_KEYS.has(k));
  // Shorts sequence ads.
  if (Array.isArray(r.entries)) {
    const before = r.entries.length;
    r.entries = r.entries.filter((e) => !e?.command?.reelWatchEndpoint?.adClientParams?.isAd);
    removed += before - r.entries.length;
  }
  return removed;
}

onResponse('ads', (r) => {
  if (get('hideVideoAds')) stripVideoAds(r);
  if (get('hideFeedAds') && (r.contents || r.continuationContents || r.entries || r.onResponseReceivedActions)) {
    stripFeedAds(r);
  }
  if (get('hidePaidPromotionLabel') && r.paidContentOverlay) r.paidContentOverlay = null;
});
