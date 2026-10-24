const PREFIX = '[NexAlloy]';

export const log = (...args) => console.info(PREFIX, ...args);
export const warn = (...args) => console.warn(PREFIX, ...args);

/** Runs fn, logging instead of throwing. Feature code must never break the app. */
export function guard(label, fn) {
  try {
    return fn();
  } catch (err) {
    warn(label, err);
    return undefined;
  }
}
