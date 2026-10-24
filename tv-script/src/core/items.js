// Helpers for video items in feeds, shelves, search results and the related
// videos row. YouTube TV uses two item shapes: the older `tileRenderer` and
// the newer `lockupViewModel`. Rather than hard-coding every container path
// (home, subscriptions, search, continuations...), item arrays are found by
// walking the response.

const MAX_DEPTH = 40;

export const isVideoItem = (x) => !!(x && typeof x === 'object' && (x.tileRenderer || x.lockupViewModel));

/** Plain text of a YouTube text object ({simpleText}, {runs}, {content} or string). */
export function textOf(t) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (typeof t.content === 'string') return t.content;
  if (Array.isArray(t.runs)) return t.runs.map((r) => r?.text ?? '').join('');
  return '';
}

function collect(obj, key, out, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_DEPTH) return out;
  if (Array.isArray(obj)) {
    for (const x of obj) collect(x, key, out, depth + 1);
    return out;
  }
  for (const k in obj) {
    const v = obj[k];
    if (k === key) out.push(v);
    if (v && typeof v === 'object') collect(v, key, out, depth + 1);
  }
  return out;
}

/** Every value stored under `key` anywhere inside obj. */
export const findAll = (obj, key) => collect(obj, key, []);

/** Extracts what filters need from a tile/lockup. Missing fields are null/empty. */
export function describe(item) {
  const info = { videoId: null, title: '', lines: [], channel: '', handles: [], isShort: false, isLive: false };
  if (item.tileRenderer) {
    const t = item.tileRenderer;
    const meta = t.metadata?.tileMetadataRenderer;
    info.videoId = t.contentId ?? t.onSelectCommand?.watchEndpoint?.videoId ?? null;
    info.title = textOf(meta?.title);
    for (const line of meta?.lines ?? []) {
      const parts = (line?.lineRenderer?.items ?? [])
        .map((i) => textOf(i?.lineItemRenderer?.text))
        .filter(Boolean);
      if (parts.length) info.lines.push(parts.join(' '));
    }
    info.isShort = !!t.onSelectCommand?.reelWatchEndpoint || t.contentType === 'TILE_CONTENT_TYPE_SHORT';
  } else if (item.lockupViewModel) {
    const l = item.lockupViewModel;
    const meta = l.metadata?.lockupMetadataViewModel;
    info.videoId = l.contentId ?? null;
    info.title = textOf(meta?.title);
    for (const row of meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
      const parts = (row?.metadataParts ?? []).map((p) => textOf(p?.text)).filter(Boolean);
      if (parts.length) info.lines.push(parts.join(' '));
    }
    const onTap = l.rendererContext?.commandContext?.onTap?.innertubeCommand;
    info.isShort = !!onTap?.reelWatchEndpoint || l.contentType === 'LOCKUP_CONTENT_TYPE_SHORT';
  }
  // First metadata line is the channel on TV tiles ("Channel • 1.2M views").
  info.channel = (info.lines[0] ?? '').split(/\s[•·]\s/)[0].trim();
  info.handles = findAll(item, 'canonicalBaseUrl')
    .filter((u) => typeof u === 'string' && u.startsWith('/@'))
    .map((u) => u.slice(1).toLowerCase());
  info.isLive = info.lines.some((l) => /\bLIVE\b|watching/i.test(l));
  return info;
}

/**
 * Parses an English view count ("1.2M views", "15K views", "1,234 views",
 * "No views"). Returns null if the text has no recognisable count.
 */
export function parseViewCount(lines) {
  for (const line of lines) {
    if (/\bno views\b/i.test(line)) return 0;
    const m = /([\d.,]+)\s*([KMB])?\s+views?\b/i.exec(line);
    if (!m) continue;
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isNaN(n)) continue;
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase()] ?? 1;
    return Math.round(n * mult);
  }
  return null;
}

/**
 * Removes video items for which shouldRemove(item, info) is true, from every
 * item array in obj. Returns the number removed.
 */
export function removeVideoItems(obj, shouldRemove, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_DEPTH) return 0;
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
    if (v && typeof v === 'object') removed += removeVideoItems(v, shouldRemove, depth + 1);
  }
  return removed;
}

/** Calls fn(item) for every video item in obj. */
export function forEachVideoItem(obj, fn, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_DEPTH) return;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      if (isVideoItem(x)) fn(x);
      forEachVideoItem(x, fn, depth + 1);
    }
    return;
  }
  for (const k in obj) {
    const v = obj[k];
    if (v && typeof v === 'object') forEachVideoItem(v, fn, depth + 1);
  }
}

/**
 * Removes array elements (anywhere in obj) whose single renderer key matches
 * `test(key)`. Used for ad slots and similar non-video entries.
 */
export function removeRenderers(obj, test, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_DEPTH) return 0;
  let removed = 0;
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const el = obj[i];
      if (el && typeof el === 'object' && !Array.isArray(el)) {
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
    if (v && typeof v === 'object') removed += removeRenderers(v, test, depth + 1);
  }
  return removed;
}

/** The long-press menu items array of a tile/lockup, if it has one. */
export function longPressMenuItems(item) {
  const tileMenu = item.tileRenderer?.onLongPressCommand?.showMenuCommand?.menu?.menuRenderer;
  if (tileMenu && Array.isArray(tileMenu.items)) return tileMenu.items;
  const lockupMenu =
    item.lockupViewModel?.rendererContext?.commandContext?.onLongPress?.innertubeCommand?.showMenuCommand?.menu
      ?.menuRenderer;
  if (lockupMenu && Array.isArray(lockupMenu.items)) return lockupMenu.items;
  return null;
}
