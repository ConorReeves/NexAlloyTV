/* NexAlloy YouTube TV script (9298f42). Generated from tv-script/ by build.mjs. Do not edit. GPL-3.0-only. */
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/core/log.js
  var PREFIX = "[NexAlloy]";
  var log = (...args) => console.info(PREFIX, ...args);
  var warn = (...args) => console.warn(PREFIX, ...args);
  function guard(label, fn) {
    try {
      return fn();
    } catch (err) {
      warn(label, err);
      return void 0;
    }
  }

  // src/core/nav.js
  function parseRoute(hash) {
    const raw = (hash ?? "").replace(/^#/, "") || "/";
    try {
      const url = new URL(raw, "https://tv.invalid");
      return { path: url.pathname, params: url.searchParams };
    } catch {
      return { path: "/", params: new URLSearchParams() };
    }
  }
  var currentRoute = () => parseRoute(globalThis.location?.hash);
  function videoIdOf(route) {
    return route.path === "/watch" ? route.params.get("v") : null;
  }
  var currentVideoId = () => videoIdOf(currentRoute());
  var routeListeners = [];
  var videoListeners = [];
  var lastVideoId;
  function emit() {
    const route = currentRoute();
    for (const fn of routeListeners) fn(route);
    const videoId = videoIdOf(route);
    if (videoId !== lastVideoId) {
      lastVideoId = videoId;
      for (const fn of videoListeners) fn(videoId);
    }
  }
  function onRouteChange(fn) {
    routeListeners.push(fn);
  }
  function onVideoChange(fn) {
    videoListeners.push(fn);
  }
  function install() {
    globalThis.addEventListener("hashchange", emit, false);
    setTimeout(emit, 0);
  }

  // src/core/responses.js
  var transforms = [];
  var nativeParse = JSON.parse;
  var capture = null;
  function onResponse(name, fn) {
    transforms.push({ name, fn });
  }
  function applyTransforms(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const targets = Array.isArray(obj) ? obj.filter((x) => x && typeof x === "object") : [obj];
    for (const target of targets) {
      if (capture && target.responseContext) capture(target);
      for (const t of transforms) guard(`transform ${t.name}`, () => t.fn(target));
    }
    return obj;
  }
  function setCapture(fn) {
    capture = fn;
  }
  function install2() {
    if (JSON.parse.__nexalloy) return;
    const wrapped = function parse(text2, reviver) {
      const result = nativeParse.call(this, text2, reviver);
      return applyTransforms(result);
    };
    wrapped.__nexalloy = true;
    JSON.parse = wrapped;
  }

  // src/core/settings.js
  var settings_exports = {};
  __export(settings_exports, {
    __resetForTests: () => __resetForTests,
    addToList: () => addToList,
    defineCategory: () => defineCategory,
    defineSetting: () => defineSetting,
    get: () => get,
    getCategories: () => getCategories,
    getDefinition: () => getDefinition,
    onChange: () => onChange,
    removeFromList: () => removeFromList,
    reset: () => reset,
    set: () => set
  });
  var STORAGE_KEY = "nexalloy-tv-settings";
  var definitions = /* @__PURE__ */ new Map();
  var categories = [];
  var listeners = /* @__PURE__ */ new Set();
  var values = load();
  function storage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
  function load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      warn("settings: could not load, using defaults", err);
      return {};
    }
  }
  function save() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (err) {
      warn("settings: could not save", err);
    }
  }
  function defineCategory({ id, title, summary, icon = "SETTINGS" }) {
    if (!categories.some((c) => c.id === id)) {
      categories.push({ id, title, summary, icon, keys: [] });
    }
  }
  function defineSetting(categoryId, def) {
    const full = { type: "bool", ...def, categoryId };
    if (full.type === "list" && full.default === void 0) full.default = [];
    definitions.set(full.key, full);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) throw new Error(`settings: unknown category ${categoryId}`);
    if (!category.keys.includes(full.key)) category.keys.push(full.key);
  }
  function get(key) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    const def = definitions.get(key);
    if (!def) return void 0;
    return Array.isArray(def.default) ? [...def.default] : def.default;
  }
  function set(key, value) {
    values[key] = value;
    save();
    for (const fn of listeners) {
      try {
        fn(key, value);
      } catch (err) {
        warn("settings listener", err);
      }
    }
  }
  function reset(key) {
    delete values[key];
    save();
    for (const fn of listeners) fn(key, get(key));
  }
  function addToList(key, entry) {
    const trimmed = String(entry ?? "").trim();
    if (!trimmed) return false;
    const list = get(key) ?? [];
    if (list.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return false;
    set(key, [...list, trimmed]);
    return true;
  }
  function removeFromList(key, entry) {
    set(key, (get(key) ?? []).filter((x) => x !== entry));
  }
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  var getCategories = () => categories;
  var getDefinition = (key) => definitions.get(key);
  function __resetForTests(initial = {}) {
    values = { ...initial };
  }

  // src/core/yttv.js
  var ACTION_PREFIX = "NEXALLOY_";
  var actions = /* @__PURE__ */ new Map();
  var interceptors = [];
  function findInstance() {
    const root = globalThis._yttv;
    if (!root) return null;
    for (const key in root) {
      const entry = root[key];
      if (entry && entry.instance && typeof entry.instance.resolveCommand === "function") {
        return entry.instance;
      }
    }
    return null;
  }
  function registerAction(name, fn) {
    actions.set(ACTION_PREFIX + name, fn);
  }
  function action(name, parameters) {
    return { customAction: { action: ACTION_PREFIX + name, parameters } };
  }
  function interceptCommands(fn) {
    interceptors.push(fn);
  }
  function resolveCommand(cmd) {
    const instance = findInstance();
    if (!instance) {
      warn("resolveCommand: app not ready", cmd);
      return false;
    }
    return instance.resolveCommand(cmd);
  }
  function customActionOf(cmd) {
    const custom = cmd?.customAction ?? cmd?.signalAction?.customAction;
    if (custom && typeof custom.action === "string" && custom.action.startsWith(ACTION_PREFIX)) {
      return custom;
    }
    return null;
  }
  function handleCommand(cmd) {
    const custom = customActionOf(cmd);
    if (custom) {
      const fn = actions.get(custom.action);
      if (fn) {
        try {
          fn(custom.parameters);
        } catch (err) {
          warn("action", custom.action, err);
        }
      } else {
        warn("unknown action", custom.action);
      }
      return true;
    }
    for (const fn of interceptors) {
      try {
        if (fn(cmd) === true) return true;
      } catch (err) {
        warn("interceptor", err);
      }
    }
    return false;
  }
  function resolveWith(original, thisArg, cmd, rest = []) {
    const inner = cmd?.commandExecutorCommand?.commands;
    if (Array.isArray(inner) && inner.some((c) => customActionOf(c))) {
      for (const c of inner) {
        if (!handleCommand(c)) original.call(thisArg, c, ...rest);
      }
      return true;
    }
    if (handleCommand(cmd)) return true;
    return original.call(thisArg, cmd, ...rest);
  }
  function patch() {
    const instance = findInstance();
    if (!instance) return false;
    if (instance.__nexalloyPatched) return true;
    const original = instance.resolveCommand;
    instance.resolveCommand = function(cmd, ...rest) {
      return resolveWith(original, this, cmd, rest);
    };
    instance.__nexalloyPatched = true;
    log("resolveCommand hooked");
    return true;
  }
  var readyCallbacks = [];
  function whenReady(fn) {
    if (findInstance()?.__nexalloyPatched) fn();
    else readyCallbacks.push(fn);
  }
  function install3() {
    const started = Date.now();
    const timer = setInterval(() => {
      if (patch()) {
        clearInterval(timer);
        const callbacks = readyCallbacks;
        readyCallbacks = [];
        for (const fn of callbacks) fn();
      } else if (Date.now() - started > 12e4) {
        clearInterval(timer);
        warn("gave up waiting for window._yttv; settings and menus will not work");
      }
    }, 250);
  }
  var text = (s) => ({ simpleText: String(s) });
  function showToast(title, subtitle) {
    const renderer = { title: text(title) };
    if (subtitle) renderer.subtitle = text(subtitle);
    return resolveCommand({
      openPopupAction: {
        popupType: "TOAST",
        popup: { overlayToastRenderer: renderer }
      }
    });
  }
  function listItem({ title, subtitle, icon, secondaryIcon }, commands) {
    const renderer = {
      title: text(title),
      serviceEndpoint: { commandExecutorCommand: { commands } }
    };
    if (subtitle) renderer.subtitle = text(subtitle);
    if (icon) renderer.icon = { iconType: icon };
    if (secondaryIcon) renderer.secondaryIcon = { iconType: secondaryIcon };
    return { compactLinkRenderer: renderer };
  }
  function showModal({ id, title, subtitle, items, selectedIndex = 0, update = false }) {
    const header = { title: text(title) };
    if (subtitle) header.subtitle = text(subtitle);
    const back = { signalAction: { signal: "POPUP_BACK" } };
    const cmd = {
      openPopupAction: {
        popupType: "MODAL",
        uniqueId: id,
        popup: {
          overlaySectionRenderer: {
            overlay: {
              overlayTwoPanelRenderer: {
                actionPanel: {
                  overlayPanelRenderer: {
                    header: { overlayPanelHeaderRenderer: header },
                    content: {
                      overlayPanelItemListRenderer: {
                        items,
                        selectedIndex: Math.max(0, Math.min(selectedIndex, items.length - 1))
                      }
                    }
                  }
                },
                backButton: { buttonRenderer: { command: back } }
              }
            },
            dismissalCommand: back
          }
        }
      }
    };
    if (update) {
      cmd.openPopupAction.shouldMatchUniqueId = true;
      cmd.openPopupAction.updateAction = true;
    }
    return resolveCommand(cmd);
  }
  function menuServiceItem(title, serviceEndpoint) {
    return {
      menuServiceItemRenderer: {
        text: { runs: [{ text: title }] },
        serviceEndpoint
      }
    };
  }

  // src/core/items.js
  var MAX_DEPTH = 40;
  var isVideoItem = (x) => !!(x && typeof x === "object" && (x.tileRenderer || x.lockupViewModel));
  function textOf(t) {
    if (t == null) return "";
    if (typeof t === "string") return t;
    if (typeof t.simpleText === "string") return t.simpleText;
    if (typeof t.content === "string") return t.content;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r?.text ?? "").join("");
    return "";
  }
  function collect(obj, key, out, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return out;
    if (Array.isArray(obj)) {
      for (const x of obj) collect(x, key, out, depth + 1);
      return out;
    }
    for (const k in obj) {
      const v = obj[k];
      if (k === key) out.push(v);
      if (v && typeof v === "object") collect(v, key, out, depth + 1);
    }
    return out;
  }
  var findAll = (obj, key) => collect(obj, key, []);
  function describe(item) {
    const info = { videoId: null, title: "", lines: [], channel: "", handles: [], isShort: false, isLive: false };
    if (item.tileRenderer) {
      const t = item.tileRenderer;
      const meta = t.metadata?.tileMetadataRenderer;
      info.videoId = t.contentId ?? t.onSelectCommand?.watchEndpoint?.videoId ?? null;
      info.title = textOf(meta?.title);
      for (const line of meta?.lines ?? []) {
        const parts = (line?.lineRenderer?.items ?? []).map((i) => textOf(i?.lineItemRenderer?.text)).filter(Boolean);
        if (parts.length) info.lines.push(parts.join(" "));
      }
      info.isShort = !!t.onSelectCommand?.reelWatchEndpoint || t.contentType === "TILE_CONTENT_TYPE_SHORT";
    } else if (item.lockupViewModel) {
      const l = item.lockupViewModel;
      const meta = l.metadata?.lockupMetadataViewModel;
      info.videoId = l.contentId ?? null;
      info.title = textOf(meta?.title);
      for (const row of meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
        const parts = (row?.metadataParts ?? []).map((p) => textOf(p?.text)).filter(Boolean);
        if (parts.length) info.lines.push(parts.join(" "));
      }
      const onTap = l.rendererContext?.commandContext?.onTap?.innertubeCommand;
      info.isShort = !!onTap?.reelWatchEndpoint || l.contentType === "LOCKUP_CONTENT_TYPE_SHORT";
    }
    info.channel = (info.lines[0] ?? "").split(/\s[•·]\s/)[0].trim();
    info.handles = findAll(item, "canonicalBaseUrl").filter((u) => typeof u === "string" && u.startsWith("/@")).map((u) => u.slice(1).toLowerCase());
    info.isLive = info.lines.some((l) => /\bLIVE\b|watching/i.test(l));
    return info;
  }
  function parseViewCount(lines) {
    for (const line of lines) {
      if (/\bno views\b/i.test(line)) return 0;
      const m = /([\d.,]+)\s*([KMB])?\s+views?\b/i.exec(line);
      if (!m) continue;
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (Number.isNaN(n)) continue;
      const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase()] ?? 1;
      return Math.round(n * mult);
    }
    return null;
  }
  function removeVideoItems(obj, shouldRemove, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return 0;
    let removed = 0;
    if (Array.isArray(obj)) {
      if (obj.some(isVideoItem)) {
        for (let i = obj.length - 1; i >= 0; i--) {
          const item = obj[i];
          if (isVideoItem(item) && shouldRemove(item, describe(item))) {
            obj.splice(i, 1);
            removed++;
          }
        }
      }
      for (const x of obj) removed += removeVideoItems(x, shouldRemove, depth + 1);
      return removed;
    }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === "object") removed += removeVideoItems(v, shouldRemove, depth + 1);
    }
    return removed;
  }
  function forEachVideoItem(obj, fn, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return;
    if (Array.isArray(obj)) {
      for (const x of obj) {
        if (isVideoItem(x)) fn(x);
        forEachVideoItem(x, fn, depth + 1);
      }
      return;
    }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === "object") forEachVideoItem(v, fn, depth + 1);
    }
  }
  function removeRenderers(obj, test, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return 0;
    let removed = 0;
    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) {
        const el = obj[i];
        if (el && typeof el === "object" && !Array.isArray(el)) {
          const keys = Object.keys(el);
          if (keys.length >= 1 && keys.some(test)) {
            obj.splice(i, 1);
            removed++;
            continue;
          }
        }
      }
      for (const x of obj) removed += removeRenderers(x, test, depth + 1);
      return removed;
    }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === "object") removed += removeRenderers(v, test, depth + 1);
    }
    return removed;
  }
  function longPressMenuItems(item) {
    const tileMenu = item.tileRenderer?.onLongPressCommand?.showMenuCommand?.menu?.menuRenderer;
    if (tileMenu && Array.isArray(tileMenu.items)) return tileMenu.items;
    const lockupMenu = item.lockupViewModel?.rendererContext?.commandContext?.onLongPress?.innertubeCommand?.showMenuCommand?.menu?.menuRenderer;
    if (lockupMenu && Array.isArray(lockupMenu.items)) return lockupMenu.items;
    return null;
  }

  // src/features/ads.js
  defineCategory({ id: "ads", title: "Ads", summary: "Video, feed and Shorts ads", icon: "BLOCK" });
  defineSetting("ads", { key: "hideVideoAds", title: "Hide video ads", summary: "Pre-roll, mid-roll and overlay ads", default: true });
  defineSetting("ads", { key: "hideFeedAds", title: "Hide feed ads", summary: "Ad tiles and banners on the home screen, search and the related row", default: true });
  defineSetting("ads", { key: "hidePaidPromotionLabel", title: "Hide paid promotion label", summary: 'The "Includes paid promotion" overlay', default: true });
  var FEED_AD_KEYS = /* @__PURE__ */ new Set([
    "adSlotRenderer",
    "promotedVideoRenderer",
    "compactPromotedVideoRenderer",
    "searchPyvRenderer",
    "tvMastheadRenderer",
    "statementBannerRenderer",
    "bannerPromoRenderer"
  ]);
  function stripVideoAds(r) {
    let changed = false;
    for (const key of ["adPlacements", "adSlots"]) {
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
  function stripFeedAds(r) {
    let removed = removeRenderers(r, (k) => FEED_AD_KEYS.has(k));
    if (Array.isArray(r.entries)) {
      const before = r.entries.length;
      r.entries = r.entries.filter((e) => !e?.command?.reelWatchEndpoint?.adClientParams?.isAd);
      removed += before - r.entries.length;
    }
    return removed;
  }
  onResponse("ads", (r) => {
    if (get("hideVideoAds")) stripVideoAds(r);
    if (get("hideFeedAds") && (r.contents || r.continuationContents || r.entries || r.onResponseReceivedActions)) {
      stripFeedAds(r);
    }
    if (get("hidePaidPromotionLabel") && r.paidContentOverlay) r.paidContentOverlay = null;
  });

  // src/core/player.js
  var PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  var getPlayer = () => document.querySelector(".html5-video-player");
  var getVideo = () => document.querySelector("video");
  function onVideoElement(fn) {
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
  function stateValue(state) {
    if (typeof state === "number") return state;
    if (state && typeof state === "object") return state.state ?? state.data ?? state.playerState ?? null;
    return null;
  }
  var stateListeners = [];
  var stateListenerOn = null;
  function onPlayerState(fn) {
    stateListeners.push(fn);
    if (stateListeners.length > 1) return;
    setInterval(() => {
      const player = getPlayer();
      if (!player || player === stateListenerOn || typeof player.addEventListener !== "function") return;
      stateListenerOn = player;
      player.addEventListener("onStateChange", (state) => {
        const value = stateValue(state);
        for (const listener of stateListeners) {
          try {
            listener(value);
          } catch (err) {
            console.warn("[NexAlloy] state listener", err);
          }
        }
      });
    }, 1e3);
  }
  function seekTo(seconds) {
    const player = getPlayer();
    if (player && typeof player.seekTo === "function") {
      player.seekTo(seconds, true);
      return;
    }
    const video = getVideo();
    if (video) video.currentTime = seconds;
  }
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  // src/features/sponsorBlock.js
  var API = "https://sponsor.ajay.app/api";
  defineCategory({ id: "sponsorblock", title: "SponsorBlock", summary: "Skip sponsors, intros, reminders and more", icon: "SKIP_NEXT" });
  defineSetting("sponsorblock", { key: "sbEnabled", title: "Enable SponsorBlock", default: true });
  defineSetting("sponsorblock", { key: "sbToastOnSkip", title: "Show a toast when skipping", default: true });
  defineSetting("sponsorblock", { key: "sbCountSkips", title: "Count skips", summary: "Tell SponsorBlock a segment was skipped, for the leaderboard", default: true });
  defineSetting("sponsorblock", {
    key: "sbMinSegment",
    title: "Minimum segment length",
    type: "choice",
    default: 0,
    choices: [{ value: 0, label: "Any" }, { value: 1, label: "1 second" }, { value: 3, label: "3 seconds" }, { value: 5, label: "5 seconds" }]
  });
  var BEHAVIOURS = [
    { value: "skip", label: "Skip automatically" },
    { value: "skipOnce", label: "Skip automatically once" },
    { value: "notify", label: "Show toast only" },
    { value: "off", label: "Disabled" }
  ];
  var CATEGORIES = [
    { id: "sponsor", title: "Sponsor", def: "skip" },
    { id: "selfpromo", title: "Unpaid/self promotion", def: "skip" },
    { id: "interaction", title: "Interaction reminder", def: "skip" },
    { id: "intro", title: "Intermission/intro", def: "notify" },
    { id: "outro", title: "Endcards/credits", def: "notify" },
    { id: "preview", title: "Preview/recap", def: "notify" },
    { id: "hook", title: "Hook/greetings", def: "off" },
    { id: "filler", title: "Filler tangent", def: "off" },
    { id: "music_offtopic", title: "Music: non-music section", def: "skip" }
  ];
  for (const c of CATEGORIES) {
    defineSetting("sponsorblock", { key: `sb_${c.id}`, title: c.title, type: "choice", default: c.def, choices: BEHAVIOURS });
  }
  defineSetting("sponsorblock", { key: "sbHighlight", title: "Highlight", type: "choice", default: "notify", choices: [
    { value: "notify", label: "Show toast with time" },
    { value: "jump", label: "Jump to highlight at start" },
    { value: "off", label: "Disabled" }
  ] });
  var CATEGORY_TITLE = Object.fromEntries([...CATEGORIES.map((c) => [c.id, c.title]), ["poi_highlight", "Highlight"]]);
  async function sha256Hex(s) {
    const data = new TextEncoder().encode(s);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function selectSegments(response, videoId, minLength = 0) {
    const entry = Array.isArray(response) ? response.find((v) => v?.videoID === videoId) : null;
    if (!entry) return [];
    return entry.segments.filter((s) => Array.isArray(s.segment) && s.segment.length === 2).filter((s) => s.actionType === "poi" || s.actionType === "full" || s.segment[1] - s.segment[0] >= minLength).map((s) => ({ uuid: s.UUID, category: s.category, actionType: s.actionType, start: s.segment[0], end: s.segment[1] })).sort((a, b) => a.start - b.start);
  }
  async function fetchSegments(videoId) {
    const categories2 = [...CATEGORIES.map((c) => c.id), "poi_highlight"];
    const prefix = (await sha256Hex(videoId)).slice(0, 4);
    const url = `${API}/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(categories2))}&actionTypes=${encodeURIComponent(JSON.stringify(["skip", "poi", "full"]))}`;
    const res = await fetch(url);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return selectSegments(await res.json(), videoId, get("sbMinSegment"));
  }
  var session = null;
  function behaviourFor(segment) {
    if (segment.category === "poi_highlight") return get("sbHighlight");
    return get(`sb_${segment.category}`) ?? "off";
  }
  function countSkip(segment) {
    if (!get("sbCountSkips")) return;
    fetch(`${API}/viewedVideoSponsorTime?UUID=${encodeURIComponent(segment.uuid)}`, { method: "POST" }).catch(() => {
    });
  }
  function onTimeUpdate(video) {
    if (!session || !get("sbEnabled") || session.videoId !== currentVideoId()) return;
    const t = video.currentTime;
    for (const seg of session.segments) {
      if (seg.actionType !== "skip") continue;
      if (t < seg.start || t >= seg.end - 0.25) continue;
      const behaviour = behaviourFor(seg);
      const title = CATEGORY_TITLE[seg.category] ?? seg.category;
      if (behaviour === "notify") {
        if (!session.notified.has(seg.uuid)) {
          session.notified.add(seg.uuid);
          showToast(`${title} segment`, `Until ${formatTime(seg.end)}`);
        }
        continue;
      }
      if (behaviour === "off") continue;
      if (behaviour === "skipOnce" && session.skippedOnce.has(seg.uuid)) continue;
      session.skippedOnce.add(seg.uuid);
      seekTo(seg.end);
      countSkip(seg);
      if (get("sbToastOnSkip")) showToast(`Skipped ${title.toLowerCase()}`, `${formatTime(seg.start)} \u2013 ${formatTime(seg.end)}`);
      break;
    }
  }
  function announce(segments) {
    const full = segments.find((s) => s.actionType === "full");
    if (full && behaviourFor(full) !== "off") {
      showToast(`This video is entirely ${(CATEGORY_TITLE[full.category] ?? full.category).toLowerCase()}`, "SponsorBlock");
    }
    const highlight = segments.find((s) => s.category === "poi_highlight");
    if (highlight) {
      const mode = get("sbHighlight");
      if (mode === "jump") {
        seekTo(highlight.start);
        showToast("Jumped to highlight", formatTime(highlight.start));
      } else if (mode === "notify") {
        showToast("Highlight", `at ${formatTime(highlight.start)}`);
      }
    }
  }
  onVideoChange(async (videoId) => {
    session = null;
    if (!videoId || !get("sbEnabled")) return;
    try {
      const segments = await fetchSegments(videoId);
      if (currentVideoId() !== videoId) return;
      session = { videoId, segments, skippedOnce: /* @__PURE__ */ new Set(), notified: /* @__PURE__ */ new Set() };
      if (segments.length) setTimeout(() => announce(segments), 1500);
    } catch (err) {
      warn("SponsorBlock", videoId, err);
    }
  });
  onVideoElement((video) => {
    video.addEventListener("timeupdate", () => onTimeUpdate(video));
  });

  // src/features/returnYouTubeDislike.js
  var API2 = "https://returnyoutubedislikeapi.com/votes?videoId=";
  defineCategory({ id: "ryd", title: "Return YouTube Dislike", summary: "Dislike counts from returnyoutubedislike.com", icon: "DISLIKE" });
  defineSetting("ryd", { key: "rydEnabled", title: "Show dislikes when a video starts", default: true });
  defineSetting("ryd", { key: "rydStyle", title: "Format", type: "choice", default: "count", choices: [
    { value: "count", label: "Counts" },
    { value: "percent", label: "Like/dislike percentage" }
  ] });
  function formatCount(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "?";
    try {
      return new Intl.NumberFormat(void 0, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    } catch {
      return String(n);
    }
  }
  function formatVotes(data, style) {
    const likes = data.likes ?? 0;
    const dislikes = data.dislikes ?? 0;
    const total = likes + dislikes;
    if (style === "percent" && total > 0) {
      const pct = Math.round(likes / total * 100);
      return [`${100 - pct}% disliked`, `${pct}% liked \xB7 ${formatCount(total)} ratings`];
    }
    return [`${formatCount(dislikes)} dislikes`, `${formatCount(likes)} likes`];
  }
  var cache = /* @__PURE__ */ new Map();
  onVideoChange(async (videoId) => {
    if (!videoId || !get("rydEnabled")) return;
    try {
      let data = cache.get(videoId);
      if (!data) {
        const res = await fetch(API2 + encodeURIComponent(videoId));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        cache.set(videoId, data);
      }
      setTimeout(() => {
        if (currentVideoId() !== videoId) return;
        const [title, subtitle] = formatVotes(data, get("rydStyle"));
        showToast(`\u{1F44E} ${title}`, subtitle);
      }, 2500);
    } catch (err) {
      warn("RYD", videoId, err);
    }
  });

  // src/features/playerTweaks.js
  defineCategory({ id: "player", title: "Player", summary: "Looping, autoplay and end screens", icon: "PLAY_ARROW" });
  defineSetting("player", { key: "loopVideo", title: "Loop video", summary: "Replay the current video when it ends", default: false });
  defineSetting("player", { key: "disablePlaylistAutoplay", title: "Disable playlist autoplay", summary: "Stop at the end of each video in a playlist", default: false });
  defineSetting("player", { key: "hideInfoCards", title: "Hide info cards", default: true });
  defineSetting("player", { key: "hideEndScreenCards", title: "Hide end screen cards", summary: "Video, channel and link cards in the last seconds", default: false });
  defineSetting("player", { key: "hideEndScreenSuggestion", title: "Hide end screen suggested video", summary: 'The "Up next" suggestion shown when a video ends', default: false });
  function applyPlayerResponseTweaks(r, opts) {
    if (opts.hideInfoCards && r.cards?.cardCollectionRenderer) delete r.cards;
    if (opts.hideEndScreenCards && r.endscreen) r.endscreen = null;
    const overlay = r.playerOverlays?.playerOverlayRenderer;
    if (opts.hideEndScreenSuggestion && overlay) {
      delete overlay.endScreen;
    }
  }
  onResponse("playerTweaks", (r) => {
    if (!r.cards && !r.endscreen && !r.playerOverlays) return;
    applyPlayerResponseTweaks(r, {
      hideInfoCards: get("hideInfoCards"),
      hideEndScreenCards: get("hideEndScreenCards"),
      hideEndScreenSuggestion: get("hideEndScreenSuggestion")
    });
  });
  function applyLoop() {
    const video = getVideo();
    if (video) video.loop = !!get("loopVideo");
  }
  onVideoElement((video) => {
    applyLoop();
    video.addEventListener("loadedmetadata", applyLoop);
    video.addEventListener("play", applyLoop);
  });
  onVideoChange(() => setTimeout(applyLoop, 500));
  onChange((key) => {
    if (key === "loopVideo") applyLoop();
  });
  var AUTOPLAY_WINDOW_MS = 15e3;
  var endedAt = 0;
  function markEnded() {
    endedAt = Date.now();
  }
  onVideoElement((video) => {
    video.addEventListener("ended", markEnded);
  });
  onPlayerState((value) => {
    if (value === PlayerState.ENDED) markEnded();
    else if (value === PlayerState.PLAYING) endedAt = 0;
  });
  interceptCommands((cmd) => {
    if (!get("disablePlaylistAutoplay") || !endedAt) return false;
    const watch = cmd?.watchEndpoint;
    if (!watch?.playlistId) return false;
    if (Date.now() - endedAt > AUTOPLAY_WINDOW_MS) return false;
    endedAt = 0;
    log("blocked playlist autoplay to", watch.videoId);
    showToast("Playlist autoplay is off", "Select the next video to keep watching");
    return true;
  });

  // src/features/videoQuality.js
  defineCategory({ id: "video", title: "Video", summary: "Default quality, codec and frame rate", icon: "VIDEO_QUALITY" });
  defineSetting("video", {
    key: "defaultQuality",
    title: "Default quality",
    type: "choice",
    default: 0,
    summary: "Highest available at or below this",
    choices: [
      { value: 0, label: "Auto" },
      { value: 4320, label: "4320p (8K)" },
      { value: 2160, label: "2160p (4K)" },
      { value: 1440, label: "1440p" },
      { value: 1080, label: "1080p" },
      { value: 720, label: "720p" },
      { value: 480, label: "480p" },
      { value: 360, label: "360p" }
    ]
  });
  defineSetting("video", {
    key: "preferredCodec",
    title: "Preferred codec",
    type: "choice",
    default: "auto",
    summary: "Used when the video offers it",
    choices: [
      { value: "auto", label: "Auto" },
      { value: "av1", label: "AV1" },
      { value: "vp9", label: "VP9" },
      { value: "avc", label: "AVC (H.264)" }
    ]
  });
  defineSetting("video", {
    key: "maxFps",
    title: "Frame rate",
    type: "choice",
    default: 0,
    summary: "Used when the video offers it",
    choices: [
      { value: 0, label: "Any" },
      { value: 30, label: "Up to 30 fps" }
    ]
  });
  defineSetting("video", { key: "playerButton", title: 'Show "Video" button in the player', summary: "Or press the yellow button while watching", default: true });
  defineSetting("video", { key: "qualityToast", title: "Show a toast when quality is set", default: false });
  function codecOf(mimeType) {
    const m = /codecs="([^"]+)"/.exec(mimeType ?? "");
    const codec = (m ? m[1] : "").toLowerCase();
    if (codec.startsWith("av01")) return "av1";
    if (codec.startsWith("vp9") || codec.startsWith("vp09")) return "vp9";
    if (codec.startsWith("avc1")) return "avc";
    return "other";
  }
  var isVideoFormat = (f) => typeof f?.mimeType === "string" && f.mimeType.startsWith("video/");
  function narrowVideoFormats(streamingData, keep) {
    const formats = streamingData?.adaptiveFormats;
    if (!Array.isArray(formats)) return 0;
    if (!formats.some((f) => isVideoFormat(f) && keep(f))) return 0;
    const kept = formats.filter((f) => !isVideoFormat(f) || keep(f));
    const removed = formats.length - kept.length;
    streamingData.adaptiveFormats = kept;
    return removed;
  }
  function filterFormatsByCodec(streamingData, preferred) {
    if (!preferred || preferred === "auto") return 0;
    return narrowVideoFormats(streamingData, (f) => codecOf(f.mimeType) === preferred);
  }
  function filterFormatsByFps(streamingData, maxFps) {
    if (!maxFps) return 0;
    return narrowVideoFormats(streamingData, (f) => !(f.fps > maxFps));
  }
  onResponse("videoFormats", (r) => {
    if (!r.streamingData) return;
    const byFps = filterFormatsByFps(r.streamingData, get("maxFps"));
    const byCodec = filterFormatsByCodec(r.streamingData, get("preferredCodec"));
    if (byFps || byCodec) log("formats: removed", byFps, "by frame rate,", byCodec, "by codec");
  });
  var QUALITY_HEIGHT = {
    tiny: 144,
    small: 240,
    medium: 360,
    large: 480,
    hd720: 720,
    hd1080: 1080,
    hd1440: 1440,
    hd2160: 2160,
    hd2880: 2880,
    highres: 4320
  };
  function qualityOptions(available) {
    return (available ?? []).map((q) => {
      const id = typeof q === "string" ? q : q?.quality;
      const label = typeof q === "string" ? "" : q?.qualityLabel ?? "";
      const height = parseInt(label, 10) || QUALITY_HEIGHT[id] || 0;
      return { id, height, label: label || (height ? `${height}p` : id) };
    }).filter((q) => q.id && q.id !== "auto" && q.height > 0).sort((a, b) => b.height - a.height);
  }
  function pickQuality(available, targetHeight) {
    const options = qualityOptions(available);
    if (!options.length) return null;
    return (options.find((q) => q.height <= targetHeight) ?? options[options.length - 1]).id;
  }
  var availableQualities = (player) => player?.getAvailableQualityData?.() ?? player?.getAvailableQualityLevels?.();
  function setQuality(player, quality) {
    if (typeof player.setPlaybackQualityRange === "function") player.setPlaybackQualityRange(quality, quality);
    if (typeof player.setPlaybackQuality === "function") player.setPlaybackQuality(quality);
  }
  var appliedFor = null;
  function applyDefaultQuality() {
    const target = get("defaultQuality");
    const player = getPlayer();
    if (!target || !player) return;
    const videoId = player.getVideoData?.()?.video_id ?? null;
    if (!videoId || appliedFor === videoId) return;
    const quality = pickQuality(availableQualities(player), target);
    if (!quality) return;
    appliedFor = videoId;
    try {
      setQuality(player, quality);
      log("quality:", quality, "for", videoId);
      if (get("qualityToast")) showToast("Quality set", `${QUALITY_HEIGHT[quality] ?? quality}p`);
    } catch (err) {
      warn("quality", err);
    }
  }
  onVideoChange(() => {
    appliedFor = null;
  });
  onPlayerState((state) => {
    if (state === PlayerState.PLAYING || state === PlayerState.BUFFERING) applyDefaultQuality();
  });
  var BUTTON_TYPE = "TRANSPORT_CONTROLS_BUTTON_TYPE_NEXALLOY_VIDEO";
  var MENU_ID = "nexalloy-video-menu";
  var POPUP_BACK = { signalAction: { signal: "POPUP_BACK" } };
  function addPlayerButton(r) {
    const controls = r?.transportControls?.transportControlsRenderer;
    if (!controls) return false;
    if (!Array.isArray(controls.promotedActions)) controls.promotedActions = [];
    if (controls.promotedActions.some((a) => a?.type === BUTTON_TYPE)) return false;
    controls.promotedActions.push({
      type: BUTTON_TYPE,
      button: {
        buttonRenderer: {
          isDisabled: false,
          text: { runs: [{ text: "Video" }] },
          icon: { iconType: "VIDEO_QUALITY" },
          command: action("VIDEO_MENU")
        }
      }
    });
    return true;
  }
  onResponse("playerButton", (r) => {
    if (get("playerButton")) addPlayerButton(r);
  });
  function playingSummary(player) {
    try {
      const stats = player.getStatsForNerds?.();
      if (!stats) return "";
      const codec = String(stats.codecs ?? "").split(/[\s(/]/)[0];
      const res = String(stats.resolution ?? "").split(" ")[0];
      return [res, codec].filter(Boolean).join(" \xB7 ");
    } catch {
      return "";
    }
  }
  function currentQualityLabel(player) {
    const id = player.getPlaybackQuality?.();
    const option = qualityOptions(availableQualities(player)).find((q) => q.id === id);
    return option?.label ?? (id && id !== "unknown" ? id : "Auto");
  }
  var choiceLabel = (key) => {
    const def = getDefinition(key);
    const value = get(key);
    return def.choices.find((c) => c.value === value)?.label ?? String(value);
  };
  function showVideoMenu(update = false, selectedIndex = 0) {
    const player = getPlayer();
    if (!player || !currentVideoId()) {
      showToast("No video playing");
      return;
    }
    const playing = playingSummary(player);
    const items = [
      listItem(
        { title: "Quality", subtitle: `${currentQualityLabel(player)} \xB7 this video`, icon: "VIDEO_QUALITY", secondaryIcon: "CHEVRON_RIGHT" },
        [action("VIDEO_QUALITY_MENU")]
      ),
      listItem(
        { title: "Codec", subtitle: `${choiceLabel("preferredCodec")} \xB7 reloads the video`, icon: "SETTINGS", secondaryIcon: "CHEVRON_RIGHT" },
        [action("VIDEO_CHOICE_MENU", { key: "preferredCodec" })]
      ),
      listItem(
        { title: "Frame rate", subtitle: `${choiceLabel("maxFps")} \xB7 reloads the video`, icon: "SLOW_MOTION_VIDEO", secondaryIcon: "CHEVRON_RIGHT" },
        [action("VIDEO_CHOICE_MENU", { key: "maxFps" })]
      )
    ];
    showModal({ id: MENU_ID, title: "Video", subtitle: playing ? `Playing ${playing}` : void 0, items, selectedIndex, update });
  }
  function showQualityMenu() {
    const player = getPlayer();
    const options = qualityOptions(availableQualities(player));
    const current = player?.getPlaybackQuality?.();
    const items = [
      listItem(
        { title: "Auto", secondaryIcon: current === "auto" ? "RADIO_BUTTON_CHECKED" : "RADIO_BUTTON_UNCHECKED" },
        [POPUP_BACK, action("VIDEO_SET_QUALITY", { quality: "auto" })]
      ),
      ...options.map(
        (q) => listItem(
          { title: q.label, secondaryIcon: q.id === current ? "RADIO_BUTTON_CHECKED" : "RADIO_BUTTON_UNCHECKED" },
          [POPUP_BACK, action("VIDEO_SET_QUALITY", { quality: q.id })]
        )
      )
    ];
    const selected = Math.max(0, items.findIndex((i) => i.compactLinkRenderer.secondaryIcon.iconType === "RADIO_BUTTON_CHECKED"));
    showModal({ id: `${MENU_ID}-quality`, title: "Quality", subtitle: "For this video", items, selectedIndex: selected });
  }
  function showChoiceMenu(key) {
    const def = getDefinition(key);
    const value = get(key);
    const items = def.choices.map(
      (c) => listItem(
        { title: c.label, secondaryIcon: c.value === value ? "RADIO_BUTTON_CHECKED" : "RADIO_BUTTON_UNCHECKED" },
        [POPUP_BACK, action("VIDEO_SET_CHOICE", { key, value: c.value })]
      )
    );
    const selected = Math.max(0, def.choices.findIndex((c) => c.value === value));
    showModal({ id: `${MENU_ID}-${key}`, title: def.title, subtitle: `${def.summary}. Also changes the default.`, items, selectedIndex: selected });
  }
  function reloadCurrentVideo() {
    const player = getPlayer();
    const videoId = player?.getVideoData?.()?.video_id ?? currentVideoId();
    if (!videoId) return;
    const at = Math.floor(player?.getCurrentTime?.() ?? getVideo()?.currentTime ?? 0);
    appliedFor = null;
    if (typeof player?.loadVideoById === "function") {
      player.loadVideoById({ videoId, startSeconds: at });
    } else {
      resolveCommand({ watchEndpoint: { videoId, startTimeSeconds: at } });
    }
  }
  registerAction("VIDEO_MENU", () => showVideoMenu());
  registerAction("VIDEO_QUALITY_MENU", () => showQualityMenu());
  registerAction("VIDEO_CHOICE_MENU", ({ key }) => showChoiceMenu(key));
  registerAction("VIDEO_SET_QUALITY", ({ quality }) => {
    const player = getPlayer();
    if (!player) return;
    appliedFor = player.getVideoData?.()?.video_id ?? appliedFor;
    try {
      if (quality === "auto") {
        player.setPlaybackQualityRange?.("auto", "auto");
        player.setPlaybackQuality?.("auto");
      } else {
        setQuality(player, quality);
      }
      showToast("Quality", quality === "auto" ? "Auto" : `${QUALITY_HEIGHT[quality] ?? quality}p`);
    } catch (err) {
      warn("set quality", err);
    }
  });
  registerAction("VIDEO_SET_CHOICE", ({ key, value }) => {
    if (get(key) === value) return;
    set(key, value);
    showToast(getDefinition(key).title, `${choiceLabel(key)} \xB7 reloading`);
    reloadCurrentVideo();
  });
  var KEY_YELLOW = 405;
  globalThis.document?.addEventListener?.(
    "keydown",
    (e) => {
      if (e.keyCode !== KEY_YELLOW || !currentVideoId()) return;
      e.preventDefault();
      e.stopPropagation();
      showVideoMenu();
    },
    true
  );

  // src/features/feedFilters.js
  defineCategory({ id: "feed", title: "Feed filters", summary: "Hide videos by keyword, channel, views or AI channels", icon: "FILTER_LIST" });
  var lastSearch = "";
  defineSetting("feed", {
    key: "filterKeywords",
    type: "list",
    title: "Keyword filter",
    summary: "Hide videos whose title or channel contains these",
    emptyHint: "Search for a word, then come back here to add it",
    extraItems: () => lastSearch ? [{ title: `Add "${lastSearch}"`, subtitle: "From your last search", run: () => addToList("filterKeywords", lastSearch) }] : []
  });
  defineSetting("feed", {
    key: "filterChannels",
    type: "list",
    title: "Hidden channels",
    summary: "Hide all videos from these channels",
    emptyHint: 'Long-press a video and choose "Hide this channel"'
  });
  defineSetting("feed", { key: "channelMenuItem", title: 'Add "Hide this channel" to video menus', default: true });
  defineSetting("feed", { key: "minViews", title: "Hide videos with few views", type: "choice", default: 0, summary: "English view counts only", choices: [
    { value: 0, label: "Off" },
    { value: 1e3, label: "Under 1K views" },
    { value: 1e4, label: "Under 10K views" },
    { value: 1e5, label: "Under 100K views" }
  ] });
  defineSetting("feed", { key: "hideShortsInFeed", title: "Hide Shorts in feeds", default: false });
  defineSetting("feed", {
    key: "aiChannelFilter",
    title: "AI channel filter",
    type: "choice",
    default: "off",
    summary: "Community list from AiSList",
    choices: [
      { value: "off", label: "Off" },
      { value: "block", label: "Hide blocklisted channels" },
      { value: "blockWarn", label: "Hide blocklisted and warnlisted channels" }
    ]
  });
  defineSetting("feed", { key: "filterOnWatchPage", title: "Also filter the related videos row", default: true });
  onRouteChange((route) => {
    if (!route.path.startsWith("/search")) return;
    const q = route.params.get("q") ?? route.params.get("query") ?? route.params.get("search_query");
    if (q) lastSearch = q.trim();
  });
  var AISLIST = {
    block: "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt",
    warn: "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt"
  };
  var AISLIST_CACHE_KEY = "nexalloy-tv-aislist";
  var AISLIST_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
  function parseHandleList(text2) {
    const set2 = /* @__PURE__ */ new Set();
    for (const raw of String(text2).split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("@")) set2.add(line.toLowerCase());
    }
    return set2;
  }
  var aiLists = { block: /* @__PURE__ */ new Set(), warn: /* @__PURE__ */ new Set() };
  var aiLoading = false;
  function loadAiLists() {
    if (aiLoading) return;
    try {
      const cached = JSON.parse(localStorage.getItem(AISLIST_CACHE_KEY) ?? "null");
      if (cached?.block) {
        aiLists = { block: parseHandleList(cached.block), warn: parseHandleList(cached.warn ?? "") };
        if (Date.now() - cached.fetchedAt < AISLIST_MAX_AGE_MS) return;
      }
    } catch {
    }
    aiLoading = true;
    Promise.all([AISLIST.block, AISLIST.warn].map((u) => fetch(u).then((r) => r.ok ? r.text() : Promise.reject(r.status)))).then(([block, warnText]) => {
      localStorage.setItem(AISLIST_CACHE_KEY, JSON.stringify({ block, warn: warnText, fetchedAt: Date.now() }));
      aiLists = { block: parseHandleList(block), warn: parseHandleList(warnText) };
      log("AiSList loaded", aiLists.block.size, "blocked,", aiLists.warn.size, "warned");
    }).catch((err) => warn("AiSList fetch failed", err)).finally(() => {
      aiLoading = false;
    });
  }
  function filterReason(info, opts) {
    const haystack = `${info.title}
${info.channel}`.toLowerCase();
    for (const kw of opts.keywords) {
      if (kw && haystack.includes(kw.toLowerCase())) return `keyword "${kw}"`;
    }
    const channel = info.channel.toLowerCase();
    if (channel && opts.channels.some((c) => c.toLowerCase() === channel)) return `channel "${info.channel}"`;
    if (opts.hideShorts && info.isShort) return "short";
    if (opts.minViews > 0 && !info.isLive && !info.isShort) {
      const views = parseViewCount(info.lines);
      if (views !== null && views < opts.minViews) return `${views} views`;
    }
    if (opts.aiMode !== "off" && info.handles.length) {
      for (const h of info.handles) {
        if (opts.aiBlock.has(h)) return `AiSList ${h}`;
        if (opts.aiMode === "blockWarn" && opts.aiWarn.has(h)) return `AiSList warn ${h}`;
      }
    }
    return null;
  }
  function currentOptions() {
    const aiMode = get("aiChannelFilter");
    if (aiMode !== "off") loadAiLists();
    return {
      keywords: get("filterKeywords") ?? [],
      channels: get("filterChannels") ?? [],
      minViews: get("minViews") ?? 0,
      hideShorts: !!get("hideShortsInFeed"),
      aiMode,
      aiBlock: aiLists.block,
      aiWarn: aiLists.warn
    };
  }
  function isWatchNext(r) {
    return !!r.contents?.singleColumnWatchNextResults;
  }
  function filterResponse(r, opts) {
    return removeVideoItems(r, (_item, info) => {
      const reason = filterReason(info, opts);
      if (reason) log("feed filter:", info.title, "-", reason);
      return !!reason;
    });
  }
  function addChannelMenuItems(r) {
    forEachVideoItem(r, (item) => {
      const menu = longPressMenuItems(item);
      if (!menu) return;
      const { channel } = describe(item);
      if (!channel) return;
      if (menu.some((m) => m?.menuServiceItemRenderer?.serviceEndpoint?.customAction?.action === "NEXALLOY_HIDE_CHANNEL")) return;
      menu.push(menuServiceItem("Hide this channel", action("HIDE_CHANNEL", { channel })));
    });
  }
  registerAction("HIDE_CHANNEL", ({ channel }) => {
    if (addToList("filterChannels", channel)) {
      showToast(`Hiding videos from ${channel}`, "Takes effect as feeds reload. Undo in NexAlloy > Feed filters");
    }
  });
  onResponse("feedFilters", (r) => {
    if (!r.contents && !r.continuationContents && !r.onResponseReceivedActions) return;
    if (isWatchNext(r) && !get("filterOnWatchPage")) return;
    const opts = currentOptions();
    const active = opts.keywords.length || opts.channels.length || opts.minViews || opts.hideShorts || opts.aiMode !== "off";
    if (active) filterResponse(r, opts);
    if (get("channelMenuItem")) addChannelMenuItems(r);
  });

  // src/features/developer.js
  var MAX_CAPTURES = 60;
  var captures = [];
  defineCategory({ id: "developer", title: "Developer", summary: "Debugging tools", icon: "SETTINGS" });
  defineSetting("developer", { key: "captureResponses", title: "Capture API responses", summary: `Keeps the last ${MAX_CAPTURES} in __nexalloy.captures`, default: false });
  defineSetting("developer", {
    key: "clearCaptures",
    type: "action",
    title: "Clear captured responses",
    run: () => {
      captures.length = 0;
      showToast("Captures cleared");
    }
  });
  function capture2(response) {
    let copy;
    try {
      copy = nativeParse(JSON.stringify(response));
    } catch {
      return;
    }
    captures.push({ at: (/* @__PURE__ */ new Date()).toISOString(), route: location.hash, keys: Object.keys(response), response: copy });
    if (captures.length > MAX_CAPTURES) captures.shift();
  }
  function apply() {
    setCapture(get("captureResponses") ? capture2 : null);
  }
  apply();
  onChange((key) => {
    if (key === "captureResponses") apply();
  });

  // src/ui/settingsPanel.js
  var ROOT_ID = "nexalloy-settings";
  var VERSION = true ? "9298f42" : "dev";
  var ICON_ON = "CHECK_BOX";
  var ICON_OFF = "CHECK_BOX_OUTLINE_BLANK";
  var ICON_MORE = "CHEVRON_RIGHT";
  function choiceLabel2(def, value) {
    return def.choices?.find((c) => c.value === value)?.label ?? String(value);
  }
  function settingRow(def, index, categoryId) {
    const value = get(def.key);
    switch (def.type) {
      case "bool":
        return listItem(
          { title: def.title, subtitle: def.summary, secondaryIcon: value ? ICON_ON : ICON_OFF },
          [action("SETTING_TOGGLE", { key: def.key, categoryId, index })]
        );
      case "choice":
        return listItem(
          {
            title: def.title,
            subtitle: def.summary ? `${choiceLabel2(def, value)} \xB7 ${def.summary}` : choiceLabel2(def, value),
            secondaryIcon: ICON_MORE
          },
          [action("SETTING_CYCLE", { key: def.key, categoryId, index })]
        );
      case "list": {
        const count = (value ?? []).length;
        return listItem(
          { title: def.title, subtitle: `${count} ${count === 1 ? "entry" : "entries"}${def.summary ? ` \xB7 ${def.summary}` : ""}`, secondaryIcon: ICON_MORE },
          [action("LIST_SHOW", { key: def.key })]
        );
      }
      case "action":
        return listItem({ title: def.title, subtitle: def.summary, secondaryIcon: ICON_MORE }, [
          action("SETTING_RUN", { key: def.key })
        ]);
      default:
        return null;
    }
  }
  function showRoot(update = false, selectedIndex = 0) {
    const items = getCategories().map(
      (c) => listItem({ title: c.title, subtitle: c.summary, icon: c.icon, secondaryIcon: ICON_MORE }, [
        action("CATEGORY_SHOW", { categoryId: c.id })
      ])
    );
    showModal({ id: ROOT_ID, title: "NexAlloy", subtitle: `YouTube TV patches \xB7 ${VERSION}`, items, selectedIndex, update });
  }
  function showCategory(categoryId, update = false, selectedIndex = 0) {
    const category = getCategories().find((c) => c.id === categoryId);
    if (!category) return;
    const items = category.keys.map((key, i) => settingRow(getDefinition(key), i, categoryId)).filter(Boolean);
    showModal({ id: `${ROOT_ID}-${categoryId}`, title: category.title, subtitle: category.summary, items, selectedIndex, update });
  }
  function showList(key, update = false) {
    const def = getDefinition(key);
    const extra = (def.extraItems?.() ?? []).map(
      (x, i) => listItem({ title: x.title, subtitle: x.subtitle, icon: "ADD" }, [action("LIST_EXTRA", { key, index: i })])
    );
    const entries = (get(key) ?? []).map(
      (entry) => listItem({ title: entry, subtitle: "Select to remove", icon: "DELETE" }, [action("LIST_REMOVE", { key, entry })])
    );
    const items = [...extra, ...entries];
    if (!items.length) {
      items.push(listItem({ title: "Nothing here yet", subtitle: def.emptyHint ?? "" }, []));
    }
    showModal({ id: `${ROOT_ID}-list-${key}`, title: def.title, subtitle: def.summary, items, update });
  }
  registerAction("SETTINGS_SHOW", () => showRoot());
  registerAction("CATEGORY_SHOW", ({ categoryId }) => showCategory(categoryId));
  registerAction("SETTING_TOGGLE", ({ key, categoryId, index }) => {
    set(key, !get(key));
    showCategory(categoryId, true, index);
  });
  registerAction("SETTING_CYCLE", ({ key, categoryId, index }) => {
    const def = getDefinition(key);
    const values2 = def.choices.map((c) => c.value);
    const next = values2[(values2.indexOf(get(key)) + 1) % values2.length];
    set(key, next);
    showCategory(categoryId, true, index);
  });
  registerAction("SETTING_RUN", ({ key }) => getDefinition(key)?.run?.());
  registerAction("LIST_SHOW", ({ key }) => showList(key));
  registerAction("LIST_REMOVE", ({ key, entry }) => {
    removeFromList(key, entry);
    showList(key, true);
  });
  registerAction("LIST_EXTRA", ({ key, index }) => {
    getDefinition(key)?.extraItems?.()?.[index]?.run?.();
    showList(key, true);
  });
  function addSettingsEntry(r) {
    if (!Array.isArray(r?.items)) return false;
    if (!r.items.some((i) => i?.settingCategoryCollectionRenderer)) return false;
    if (r.items.some((i) => i?.settingCategoryCollectionRenderer?.categoryId === "nexalloy_category")) return false;
    r.items.unshift({
      settingCategoryCollectionRenderer: {
        categoryId: "nexalloy_category",
        focused: false,
        items: [
          {
            settingActionRenderer: {
              itemId: "nexalloy_open",
              title: { runs: [{ text: "NexAlloy" }] },
              summary: { runs: [{ text: "Ad blocking, SponsorBlock, Return YouTube Dislike, player and feed tweaks" }] },
              actionLabel: { runs: [{ text: "NexAlloy" }] },
              serviceEndpoint: action("SETTINGS_SHOW")
            }
          }
        ]
      }
    });
    return true;
  }
  onResponse("settingsEntry", addSettingsEntry);

  // src/main.js
  var VERSION2 = true ? "9298f42" : "dev";
  install2();
  install3();
  install();
  var KEY_BLUE = 406;
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.keyCode === KEY_BLUE) {
        e.preventDefault();
        showRoot();
      }
    },
    true
  );
  whenReady(() => {
    if (!get("welcomeShown")) {
      set("welcomeShown", true);
      showToast("NexAlloy is active", "Settings: YouTube Settings > NexAlloy");
    }
  });
  globalThis.__nexalloy = { version: VERSION2, settings: settings_exports, captures, showSettings: showRoot };
  log("loaded", VERSION2);
})();
