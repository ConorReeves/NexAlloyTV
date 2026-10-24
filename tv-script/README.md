# NexAlloy for YouTube TV

YouTube for Android TV and Google TV (`com.google.android.youtube.tv`) 7.x is "Chrobalt": a
Chromium 138 shell that runs the web app at `https://www.youtube.com/tv`. Its
UI, player and ads are JavaScript, so Morphe's phone patches (which hook the
phone app's compiled code) have nothing to attach to. Instead, the
`Web app injection` patch (`app/.../youtubetv/YouTubeTVPatches.kt`) injects
this script into the page, and the script ports Morphe's features to the web
app's data.

Settings live inside YouTube TV: **Settings > NexAlloy** (or the blue button
on the remote).

## Features

| Morphe patch | TV version |
| --- | --- |
| Hide ads (video, feed, Shorts) | Strips ad data from API responses |
| Hide paid promotion label | Same |
| SponsorBlock | Per-category skip / skip once / toast / off, highlight, skip counting, min length |
| Return YouTube Dislike | Toast with counts or percentage when a video starts |
| Loop video | Same |
| Default video quality (SmartTube-style) | Highest available at or below the target, once per video |
| Preferred codec: AV1 / VP9 / AVC (SmartTube-style) | Narrows the video formats when the video offers that codec |
| Frame rate cap (SmartTube-style) | Any / up to 30 fps, when the video offers it |
| Player "Video" button (SmartTube-style) | Quality for this video, codec and frame rate (reloads at the same position); also the yellow button |
| Disable playlist autoplay | Same |
| Hide info cards, end screen cards, end screen suggestion | Same |
| Keyword filter | Same; add the last search term from the settings screen |
| Channel filter | "Hide this channel" in video long-press menus |
| Hide videos by view count | English view counts only |
| Hide Shorts in feeds | Same |
| AI channel filter (AiSList) | Same lists; needs channel handles in the TV data (see below) |

Phone-only Morphe patches (navigation bar, swipe controls, miniplayer,
share sheet, haptics and so on) have no TV equivalent.

## Layout

- `src/core/` — settings store, JSON.parse response pipeline, YouTube TV
  command hook (`window._yttv` ... `resolveCommand`), routes, player, item
  helpers.
- `src/features/` — one module per feature; each declares its settings.
- `src/ui/settingsPanel.js` — settings UI generated from those declarations.
- `test/` — Node tests for the data transforms.

## Build and test

```bash
cd tv-script
npm install
npm test
npm run build   # writes app/src/main/resources/nexalloy-tv/nexalloy-tv.js
```

The built file is committed, so a Gradle build doesn't need Node.

## Inspecting the TV app

Enable the **Remote debugging** patch for YouTube TV in NexAlloy, force-stop
YouTube TV and reopen it, then on your computer:

```bash
adb forward tcp:9222 tcp:9222
```

Open `chrome://inspect` in Chrome, choose **Configure...**, add
`localhost:9222`, and inspect the YouTube TV page. To save API responses for
working on features, turn on **Settings > NexAlloy > Developer > Capture API
responses**, use the app, then run this in the DevTools console:

```js
copy(JSON.stringify(__nexalloy.captures))
```

Turn Remote debugging off afterwards: anything that can reach the TV over adb
can control the app while it's on.

## Assumptions to verify on a device

These are based on the web player or older TV data and need a capture to
confirm:

- End screen suggestion lives at `playerOverlays.playerOverlayRenderer.endScreen`.
- Search route keeps the query in `#/search?q=...` (for "Add last search").
- Channel handles (`/@handle`) appear somewhere in feed items (AI channel filter).
- Long-press menus are inline `showMenuCommand` menus, not engagement panels
  (for "Hide this channel").
