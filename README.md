<div align="center">
  <h1>NexAlloy TV</h1>
  <a href="https://github.com/ConorReeves/NexAlloyTV/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/ConorReeves/NexAlloyTV?include_prereleases"></a>
  <a href="https://github.com/ConorReeves/NexAlloyTV"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/ConorReeves/NexAlloyTV"></a>
  <br>
</div>

**An LSPosed module for YouTube on Google TV and Android TV, forked from [NexAlloy](https://github.com/NexAlloy/NexAlloy).**

> [!IMPORTANT]
> - This is **NOT an official NexAlloy, Morphe or ReVanced project**. Please don't ask their developers for help with this fork.
> - **Root access** and **LSPosed** are **required** on the TV.
> - YouTube TV support is **experimental**.

> [!NOTE]
> This fork uses its own package ID (`io.creeves.nexalloytv`), so it installs alongside upstream NexAlloy rather than replacing it. Settings aren't carried over.

## Downloads
- **Release build**: [Download](https://github.com/ConorReeves/NexAlloyTV/releases/latest)

## How it works

YouTube for Android TV (`com.google.android.youtube.tv`) 7.x is a Chromium shell that runs the web app at `youtube.com/tv`. Its UI, player and ads are JavaScript, so NexAlloy's phone patches have nothing to hook. Instead, this module injects a script into the page that brings Morphe's features to the web app. The script's source is in [tv-script/](tv-script/README.md).

## Setup

1. Install the APK on the TV and enable the module in LSPosed for **YouTube** (`com.google.android.youtube.tv`).
2. Force-stop YouTube and open it again.
3. Configure features inside YouTube under **Settings > NexAlloy**, or press the blue button on the remote.

If YouTube crashes while the script is being injected, the module turns injection off and shows a message. Clear YouTube's data to try again.

## Patches

### YouTube (Google TV / Android TV)

- **Web app injection**
  - Hide video, feed and Shorts ads
  - Hide paid promotion label
  - SponsorBlock, with per-category behaviour
  - Return YouTube Dislike
  - Default video quality, preferred codec (AV1 / VP9 / AVC) and frame rate cap
  - Player "Video" button for quality, codec and frame rate (also the yellow button)
  - Loop video
  - Disable playlist autoplay
  - Hide info cards, end screen cards and end screen suggestions
  - Feed filters: keywords, channels, view counts, Shorts
  - AI channel filter (AiSList)
- **Remote debugging** (off by default): starts Chrome DevTools on port 9222 for working on the script

See [tv-script/README.md](tv-script/README.md) for details and known limitations.

### Other apps

The upstream NexAlloy patches for phone apps (YouTube, YouTube Music, Reddit, Google Photos, Photomath, Instagram, Threads, Strava and AllTrails) are still included but aren't the focus of this fork. See [upstream NexAlloy](https://github.com/NexAlloy/NexAlloy#patches) for that list.

## Support

[Create an issue](https://github.com/ConorReeves/NexAlloyTV/issues/new/choose)

## ⭐ Credits

[NexAlloy](https://github.com/NexAlloy/NexAlloy): ChsBuffer's LSPosed module, which this fork is based on  
[DexKit](https://luckypray.org/DexKit/en/): a high-performance dex runtime parsing library  
[Morphe](https://morphe.software): Transform Your Android Apps  
[ReVanced](https://revanced.app): Continuing the legacy of Vanced at [revanced.app](https://revanced.app)  
[SponsorBlock](https://sponsor.ajay.app), [Return YouTube Dislike](https://returnyoutubedislike.com) and [AiSList](https://github.com/Override92/AiSList): the data behind those features  
[SmartTube](https://github.com/yuliskov/SmartTube): inspiration for the video quality, codec and frame rate options
