// Access to YouTube TV's internal command resolver.
//
// The TV web app routes every UI command (navigation, popups, toasts, menu
// actions) through `resolveCommand` on an instance stored under window._yttv.
// Wrapping it lets NexAlloy handle its own commands (from settings buttons and
// menu items it adds) and observe or veto the app's commands.
//
// Approach first worked out by TizenTube (github.com/reisxd/TizenTube).

import { log, warn } from './log.js';

const ACTION_PREFIX = 'NEXALLOY_';
const actions = new Map();
const interceptors = [];

function findInstance() {
  const root = globalThis._yttv;
  if (!root) return null;
  for (const key in root) {
    const entry = root[key];
    if (entry && entry.instance && typeof entry.instance.resolveCommand === 'function') {
      return entry.instance;
    }
  }
  return null;
}

/** Name is prefixed automatically. */
export function registerAction(name, fn) {
  actions.set(ACTION_PREFIX + name, fn);
}

/** A command object that runs a registered action when resolved. */
export function action(name, parameters) {
  return { customAction: { action: ACTION_PREFIX + name, parameters } };
}

/**
 * fn(cmd) is called for every command the app resolves. Return true to
 * swallow it.
 */
export function interceptCommands(fn) {
  interceptors.push(fn);
}

export function resolveCommand(cmd) {
  const instance = findInstance();
  if (!instance) {
    warn('resolveCommand: app not ready', cmd);
    return false;
  }
  return instance.resolveCommand(cmd);
}

function customActionOf(cmd) {
  const custom = cmd?.customAction ?? cmd?.signalAction?.customAction;
  if (custom && typeof custom.action === 'string' && custom.action.startsWith(ACTION_PREFIX)) {
    return custom;
  }
  return null;
}

/** Exported for tests: returns true if handled/swallowed. */
export function handleCommand(cmd) {
  const custom = customActionOf(cmd);
  if (custom) {
    const fn = actions.get(custom.action);
    if (fn) {
      try {
        fn(custom.parameters);
      } catch (err) {
        warn('action', custom.action, err);
      }
    } else {
      warn('unknown action', custom.action);
    }
    return true;
  }
  for (const fn of interceptors) {
    try {
      if (fn(cmd) === true) return true;
    } catch (err) {
      warn('interceptor', err);
    }
  }
  return false;
}

/**
 * The patched resolveCommand. YouTube TV's own executor runs the commands
 * inside a commandExecutorCommand without passing each one back through
 * resolveCommand, so wrappers that contain NexAlloy actions are unpacked
 * here. Wrappers without NexAlloy actions are left to the app untouched.
 * Exported for tests.
 */
export function resolveWith(original, thisArg, cmd, rest = []) {
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
  instance.resolveCommand = function (cmd, ...rest) {
    return resolveWith(original, this, cmd, rest);
  };
  instance.__nexalloyPatched = true;
  log('resolveCommand hooked');
  return true;
}

let readyCallbacks = [];

/** Calls back once the app's command resolver is hooked. */
export function whenReady(fn) {
  if (findInstance()?.__nexalloyPatched) fn();
  else readyCallbacks.push(fn);
}

export function install() {
  const started = Date.now();
  const timer = setInterval(() => {
    if (patch()) {
      clearInterval(timer);
      const callbacks = readyCallbacks;
      readyCallbacks = [];
      for (const fn of callbacks) fn();
    } else if (Date.now() - started > 120_000) {
      clearInterval(timer);
      warn('gave up waiting for window._yttv; settings and menus will not work');
    }
  }, 250);
}

// ---------------------------------------------------------------------------
// Renderer builders (YouTube TV's own popup/toast schemas)

const text = (s) => ({ simpleText: String(s) });

export function showToast(title, subtitle) {
  const renderer = { title: text(title) };
  if (subtitle) renderer.subtitle = text(subtitle);
  return resolveCommand({
    openPopupAction: {
      popupType: 'TOAST',
      popup: { overlayToastRenderer: renderer },
    },
  });
}

/**
 * A selectable row in a modal list. `commands` run in order when selected.
 */
export function listItem({ title, subtitle, icon, secondaryIcon }, commands) {
  const renderer = {
    title: text(title),
    serviceEndpoint: { commandExecutorCommand: { commands } },
  };
  if (subtitle) renderer.subtitle = text(subtitle);
  if (icon) renderer.icon = { iconType: icon };
  if (secondaryIcon) renderer.secondaryIcon = { iconType: secondaryIcon };
  return { compactLinkRenderer: renderer };
}

export function showModal({ id, title, subtitle, items, selectedIndex = 0, update = false }) {
  const header = { title: text(title) };
  if (subtitle) header.subtitle = text(subtitle);
  const back = { signalAction: { signal: 'POPUP_BACK' } };
  const cmd = {
    openPopupAction: {
      popupType: 'MODAL',
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
                      selectedIndex: Math.max(0, Math.min(selectedIndex, items.length - 1)),
                    },
                  },
                },
              },
              backButton: { buttonRenderer: { command: back } },
            },
          },
          dismissalCommand: back,
        },
      },
    },
  };
  if (update) {
    cmd.openPopupAction.shouldMatchUniqueId = true;
    cmd.openPopupAction.updateAction = true;
  }
  return resolveCommand(cmd);
}

export function menuServiceItem(title, serviceEndpoint) {
  return {
    menuServiceItemRenderer: {
      text: { runs: [{ text: title }] },
      serviceEndpoint,
    },
  };
}
