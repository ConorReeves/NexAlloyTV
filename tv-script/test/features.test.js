import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTransforms } from '../src/core/responses.js';
import { describe, parseViewCount, removeVideoItems } from '../src/core/items.js';
import { parseRoute, videoIdOf } from '../src/core/nav.js';
import * as settings from '../src/core/settings.js';
import { handleCommand, registerAction, action, resolveWith } from '../src/core/yttv.js';
import { stripFeedAds, stripVideoAds } from '../src/features/ads.js';
import { selectSegments } from '../src/features/sponsorBlock.js';
import { formatVotes } from '../src/features/returnYouTubeDislike.js';
import { applyPlayerResponseTweaks } from '../src/features/playerTweaks.js';
import { filterReason, filterResponse, parseHandleList } from '../src/features/feedFilters.js';
import { addSettingsEntry } from '../src/ui/settingsPanel.js';
import { addPlayerButton, codecOf, filterFormatsByCodec, filterFormatsByFps, pickQuality } from '../src/features/videoQuality.js';

// Shapes follow what the YouTube TV web app is known to receive (tileRenderer
// and lockupViewModel items inside tvBrowseRenderer shelves).
function tile({ id = 'vid00000001', title = 'A video', channel = 'Some Channel', views = '1.2M views', handle, short = false } = {}) {
  const t = {
    tileRenderer: {
      contentId: id,
      style: 'TILE_STYLE_YTLR_DEFAULT',
      metadata: {
        tileMetadataRenderer: {
          title: { simpleText: title },
          lines: [
            { lineRenderer: { items: [{ lineItemRenderer: { text: { runs: [{ text: channel }] } } }] } },
            { lineRenderer: { items: [{ lineItemRenderer: { text: { simpleText: views } } }, { lineItemRenderer: { text: { simpleText: '•' } } }, { lineItemRenderer: { text: { simpleText: '2 years ago' } } }] } },
          ],
        },
      },
      onSelectCommand: short ? { reelWatchEndpoint: { videoId: id } } : { watchEndpoint: { videoId: id } },
      onLongPressCommand: { showMenuCommand: { menu: { menuRenderer: { items: [] } } } },
    },
  };
  if (handle) t.tileRenderer.onLongPressCommand.showMenuCommand.menu.menuRenderer.items.push({
    menuNavigationItemRenderer: { navigationEndpoint: { browseEndpoint: { browseId: 'UC1', canonicalBaseUrl: `/${handle}` } } },
  });
  return t;
}

function lockup({ id = 'lock0000001', title = 'Lockup video', channel = 'Lockup Channel', views = '15K views' } = {}) {
  return {
    lockupViewModel: {
      contentId: id,
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      metadata: {
        lockupMetadataViewModel: {
          title: { content: title },
          metadata: { contentMetadataViewModel: { metadataRows: [
            { metadataParts: [{ text: { content: channel } }] },
            { metadataParts: [{ text: { content: views } }, { text: { content: '1 day ago' } }] },
          ] } },
        },
      },
    },
  };
}

function homeResponse(shelves) {
  return {
    responseContext: {},
    contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: {
      contents: shelves.map((items) => ({ shelfRenderer: { content: { horizontalListRenderer: { items } } } })),
    } } } } } },
  };
}

const items = (r) => r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;

test('routes', () => {
  assert.equal(videoIdOf(parseRoute('#/watch?v=abc123&list=PL1')), 'abc123');
  assert.equal(videoIdOf(parseRoute('#/')), null);
  assert.equal(parseRoute('#/search?q=minecraft').params.get('q'), 'minecraft');
});

test('describe tile and lockup', () => {
  const t = describe(tile({ handle: '@SomeHandle' }));
  assert.equal(t.videoId, 'vid00000001');
  assert.equal(t.title, 'A video');
  assert.equal(t.channel, 'Some Channel');
  assert.deepEqual(t.handles, ['@somehandle']);
  assert.equal(parseViewCount(t.lines), 1_200_000);
  const l = describe(lockup());
  assert.equal(l.channel, 'Lockup Channel');
  assert.equal(parseViewCount(l.lines), 15_000);
  assert.equal(describe(tile({ short: true })).isShort, true);
});

test('view count parsing', () => {
  assert.equal(parseViewCount(['1,234 views']), 1234);
  assert.equal(parseViewCount(['No views']), 0);
  assert.equal(parseViewCount(['3.4B views']), 3_400_000_000);
  assert.equal(parseViewCount(['Some Channel']), null);
});

test('video ads are stripped', () => {
  const r = { responseContext: {}, adPlacements: [{ x: 1 }], playerAds: [{ y: 1 }], adSlots: [{}], adBreakHeartbeatParams: 'abc', streamingData: {} };
  assert.equal(stripVideoAds(r), true);
  assert.deepEqual(r.adPlacements, []);
  assert.deepEqual(r.playerAds, []);
  assert.deepEqual(r.adSlots, []);
  assert.equal('adBreakHeartbeatParams' in r, false);
  assert.ok(r.streamingData);
});

test('feed ads are removed from shelves and section lists', () => {
  const r = homeResponse([[tile(), { adSlotRenderer: {} }, tile({ id: 'v2' })]]);
  items(r).unshift({ tvMastheadRenderer: {} });
  const removed = stripFeedAds(r);
  assert.equal(removed, 2);
  assert.equal(items(r).length, 1);
  assert.equal(items(r)[0].shelfRenderer.content.horizontalListRenderer.items.length, 2);
});

test('shorts ads removed', () => {
  const r = { entries: [{ command: { reelWatchEndpoint: { videoId: 'a' } } }, { command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } }] };
  stripFeedAds(r);
  assert.equal(r.entries.length, 1);
});

test('sponsorblock picks this video and filters short segments', () => {
  const response = [
    { videoID: 'other', segments: [] },
    { videoID: 'abc', segments: [
      { UUID: '2', category: 'intro', actionType: 'skip', segment: [60, 61] },
      { UUID: '1', category: 'sponsor', actionType: 'skip', segment: [10, 40] },
      { UUID: '3', category: 'poi_highlight', actionType: 'poi', segment: [90, 90] },
    ] },
  ];
  const segs = selectSegments(response, 'abc', 3);
  assert.deepEqual(segs.map((s) => s.uuid), ['1', '3']);
  assert.equal(segs[0].start, 10);
  assert.deepEqual(selectSegments(response, 'missing'), []);
});

test('ryd formatting', () => {
  const [title, subtitle] = formatVotes({ likes: 900, dislikes: 100 }, 'percent');
  assert.equal(title, '10% disliked');
  assert.match(subtitle, /^90% liked/);
  assert.match(formatVotes({ likes: 1500, dislikes: 20 }, 'count')[0], /20 dislikes/);
});

test('player response tweaks', () => {
  const r = { cards: { cardCollectionRenderer: {} }, endscreen: { endscreenRenderer: {} }, playerOverlays: { playerOverlayRenderer: { endScreen: {}, autoplay: {} } } };
  applyPlayerResponseTweaks(r, { hideInfoCards: true, hideEndScreenCards: true, hideEndScreenSuggestion: true });
  assert.equal('cards' in r, false);
  assert.equal(r.endscreen, null);
  assert.equal('endScreen' in r.playerOverlays.playerOverlayRenderer, false);
  assert.ok(r.playerOverlays.playerOverlayRenderer.autoplay, 'autoplay data untouched');
});

const noFilters = { keywords: [], channels: [], minViews: 0, hideShorts: false, aiMode: 'off', aiBlock: new Set(), aiWarn: new Set() };

test('filter reasons', () => {
  const info = describe(tile({ title: 'Minecraft speedrun', channel: 'Gamer', views: '500 views', handle: '@AiSlop' }));
  assert.equal(filterReason(info, noFilters), null);
  assert.match(filterReason(info, { ...noFilters, keywords: ['MINECRAFT'] }), /keyword/);
  assert.match(filterReason(info, { ...noFilters, channels: ['gamer'] }), /channel/);
  assert.match(filterReason(info, { ...noFilters, minViews: 1000 }), /500 views/);
  assert.equal(filterReason(info, { ...noFilters, minViews: 100 }), null);
  assert.match(filterReason(info, { ...noFilters, aiMode: 'block', aiBlock: new Set(['@aislop']) }), /AiSList/);
  assert.equal(filterReason(info, { ...noFilters, aiMode: 'block', aiWarn: new Set(['@aislop']) }), null);
  assert.match(filterReason(info, { ...noFilters, aiMode: 'blockWarn', aiWarn: new Set(['@aislop']) }), /warn/);
  assert.match(filterReason(describe(tile({ short: true })), { ...noFilters, hideShorts: true }), /short/);
});

test('filterResponse removes across shelves and lockups', () => {
  const r = homeResponse([
    [tile({ id: 'keep1' }), tile({ id: 'drop1', title: 'Fortnite news' })],
    [lockup({ id: 'drop2', channel: 'Bad Channel' }), lockup({ id: 'keep2' })],
  ]);
  const removed = filterResponse(r, { ...noFilters, keywords: ['fortnite'], channels: ['Bad Channel'] });
  assert.equal(removed, 2);
  const ids = items(r).flatMap((s) => s.shelfRenderer.content.horizontalListRenderer.items.map((i) => describe(i).videoId));
  assert.deepEqual(ids, ['keep1', 'keep2']);
});

test('aislist parsing keeps only handles', () => {
  const set = parseHandleList('# comment\n@One\nUCabcdef\n  @two  \n');
  assert.deepEqual([...set], ['@one', '@two']);
});

test('settings entry is added once to the settings page', () => {
  const page = { items: [{ settingCategoryCollectionRenderer: { categoryId: 'general', items: [] } }] };
  assert.equal(addSettingsEntry(page), true);
  assert.equal(addSettingsEntry(page), false);
  assert.equal(page.items[0].settingCategoryCollectionRenderer.categoryId, 'nexalloy_category');
  assert.equal(page.items[0].settingCategoryCollectionRenderer.items[0].settingActionRenderer.serviceEndpoint.customAction.action, 'NEXALLOY_SETTINGS_SHOW');
  assert.equal(addSettingsEntry({ items: [{ somethingElse: {} }] }), false);
});

test('custom actions are dispatched and swallowed', () => {
  let got = null;
  registerAction('TEST', (p) => { got = p; });
  assert.equal(handleCommand(action('TEST', { a: 1 })), true);
  assert.deepEqual(got, { a: 1 });
  assert.equal(handleCommand({ watchEndpoint: { videoId: 'x' } }), false);
});

test('commandExecutorCommand wrappers containing NexAlloy actions are unpacked', () => {
  const calls = [];
  registerAction('WRAPPED', (p) => calls.push(['action', p]));
  const original = (c) => {
    calls.push(['app', c]);
    return 'app-result';
  };
  const wrapped = { commandExecutorCommand: { commands: [action('WRAPPED', { n: 1 }), { signalAction: { signal: 'POPUP_BACK' } }] } };
  assert.equal(resolveWith(original, null, wrapped), true);
  assert.deepEqual(calls, [['action', { n: 1 }], ['app', { signalAction: { signal: 'POPUP_BACK' } }]]);

  // The app's own wrappers go to the app as a whole.
  calls.length = 0;
  const appWrapper = { commandExecutorCommand: { commands: [{ signalAction: { signal: 'X' } }] } };
  assert.equal(resolveWith(original, null, appWrapper), 'app-result');
  assert.deepEqual(calls, [['app', appWrapper]]);
});

test('codec detection', () => {
  assert.equal(codecOf('video/mp4; codecs="av01.0.08M.08"'), 'av1');
  assert.equal(codecOf('video/webm; codecs="vp9"'), 'vp9');
  assert.equal(codecOf('video/webm; codecs="vp09.02.51.10.01.09.16.09.00"'), 'vp9');
  assert.equal(codecOf('video/mp4; codecs="avc1.640028"'), 'avc');
  assert.equal(codecOf('audio/mp4; codecs="mp4a.40.2"'), 'other');
});

const formats = () => ({
  adaptiveFormats: [
    { itag: 399, mimeType: 'video/mp4; codecs="av01.0.08M.08"' },
    { itag: 248, mimeType: 'video/webm; codecs="vp9"' },
    { itag: 137, mimeType: 'video/mp4; codecs="avc1.640028"' },
    { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
    { itag: 251, mimeType: 'audio/webm; codecs="opus"' },
  ],
});

test('codec filter keeps audio and the preferred video codec', () => {
  const sd = formats();
  assert.equal(filterFormatsByCodec(sd, 'avc'), 2);
  assert.deepEqual(sd.adaptiveFormats.map((f) => f.itag), [137, 140, 251]);
});

test('codec filter leaves formats alone when the codec is not offered or auto', () => {
  const sd = formats();
  sd.adaptiveFormats = sd.adaptiveFormats.filter((f) => f.itag !== 399);
  assert.equal(filterFormatsByCodec(sd, 'av1'), 0);
  assert.equal(sd.adaptiveFormats.length, 4);
  const sd2 = formats();
  assert.equal(filterFormatsByCodec(sd2, 'auto'), 0);
  assert.equal(sd2.adaptiveFormats.length, 5);
});

test('quality picking caps at the target', () => {
  const data = [
    { quality: 'hd2160', qualityLabel: '2160p60' },
    { quality: 'hd1080', qualityLabel: '1080p60' },
    { quality: 'hd720', qualityLabel: '720p' },
    { quality: 'auto', qualityLabel: 'Auto' },
  ];
  assert.equal(pickQuality(data, 1080), 'hd1080');
  assert.equal(pickQuality(data, 1440), 'hd1080');
  assert.equal(pickQuality(data, 4320), 'hd2160');
  assert.equal(pickQuality(data, 360), 'hd720', 'falls back to lowest when all are above');
  assert.equal(pickQuality(['hd1080', 'hd720', 'large', 'auto'], 720), 'hd720');
  assert.equal(pickQuality([], 1080), null);
});

test('frame rate cap keeps lower-fps video and all audio', () => {
  const sd = { adaptiveFormats: [
    { itag: 299, mimeType: 'video/mp4; codecs="avc1.64002a"', fps: 60 },
    { itag: 137, mimeType: 'video/mp4; codecs="avc1.640028"', fps: 30 },
    { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
  ] };
  assert.equal(filterFormatsByFps(sd, 30), 1);
  assert.deepEqual(sd.adaptiveFormats.map((f) => f.itag), [137, 140]);
  const only60 = { adaptiveFormats: [{ itag: 299, mimeType: 'video/mp4; codecs="avc1"', fps: 60 }] };
  assert.equal(filterFormatsByFps(only60, 30), 0, 'nothing removed when no format fits');
  assert.equal(filterFormatsByFps(formats(), 0), 0);
});

test('player button is added once to transport controls', () => {
  const r = { transportControls: { transportControlsRenderer: { promotedActions: [{ type: 'TRANSPORT_CONTROLS_BUTTON_TYPE_PLAYBACK_SETTINGS' }] } } };
  assert.equal(addPlayerButton(r), true);
  assert.equal(addPlayerButton(r), false);
  const actions = r.transportControls.transportControlsRenderer.promotedActions;
  assert.equal(actions.length, 2);
  assert.equal(actions[1].button.buttonRenderer.command.customAction.action, 'NEXALLOY_VIDEO_MENU');
  assert.equal(addPlayerButton({ responseContext: {} }), false);
});

test('full pipeline: JSON.parse-style transforms with defaults', () => {
  settings.__resetForTests({ filterKeywords: ['spam'] });
  const r = homeResponse([[tile({ id: 'ok' }), { adSlotRenderer: {} }, tile({ id: 'bad', title: 'Spam spam' })]]);
  r.adPlacements = [{}];
  applyTransforms(r);
  const shelf = items(r)[0].shelfRenderer.content.horizontalListRenderer.items;
  assert.deepEqual(shelf.map((i) => describe(i).videoId), ['ok']);
  assert.deepEqual(r.adPlacements, []);
  // "Hide this channel" menu item added to the remaining tile.
  const menu = shelf[0].tileRenderer.onLongPressCommand.showMenuCommand.menu.menuRenderer.items;
  assert.equal(menu.at(-1).menuServiceItemRenderer.serviceEndpoint.customAction.parameters.channel, 'Some Channel');
  settings.__resetForTests({});
});

test('removeVideoItems leaves non-video arrays alone', () => {
  const r = { a: [1, 2, 3], b: [{ x: 1 }] };
  assert.equal(removeVideoItems(r, () => true), 0);
  assert.deepEqual(r, { a: [1, 2, 3], b: [{ x: 1 }] });
});
