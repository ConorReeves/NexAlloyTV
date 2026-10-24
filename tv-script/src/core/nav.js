// Route helpers. YouTube TV keeps its route in the URL hash, e.g.
// https://www.youtube.com/tv#/watch?v=VIDEO_ID&list=...

export function parseRoute(hash) {
  const raw = (hash ?? '').replace(/^#/, '') || '/';
  try {
    const url = new URL(raw, 'https://tv.invalid');
    return { path: url.pathname, params: url.searchParams };
  } catch {
    return { path: '/', params: new URLSearchParams() };
  }
}

export const currentRoute = () => parseRoute(globalThis.location?.hash);

export function videoIdOf(route) {
  return route.path === '/watch' ? route.params.get('v') : null;
}

export const currentVideoId = () => videoIdOf(currentRoute());

const routeListeners = [];
const videoListeners = [];
let lastVideoId;

function emit() {
  const route = currentRoute();
  for (const fn of routeListeners) fn(route);
  const videoId = videoIdOf(route);
  if (videoId !== lastVideoId) {
    lastVideoId = videoId;
    for (const fn of videoListeners) fn(videoId);
  }
}

export function onRouteChange(fn) {
  routeListeners.push(fn);
}

/** fn(videoId | null) when the watched video changes, including at startup. */
export function onVideoChange(fn) {
  videoListeners.push(fn);
}

export function install() {
  globalThis.addEventListener('hashchange', emit, false);
  // Initial state, once features have registered.
  setTimeout(emit, 0);
}
