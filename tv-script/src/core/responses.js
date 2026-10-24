// YouTube TV parses every InnerTube API response with JSON.parse, so wrapping
// it lets features edit the data before the app renders it. This is the TV
// counterpart of the protobuf/litho hooks the phone patches use.

import { guard } from './log.js';

/** @type {{name:string, fn:(obj:object)=>void}[]} */
const transforms = [];
const nativeParse = JSON.parse;

let capture = null;

/**
 * Registers a transform that runs on every parsed JSON object (and on each
 * object element of a top-level array). Transforms must check the shape they
 * care about themselves, cheaply, and mutate in place.
 */
export function onResponse(name, fn) {
  transforms.push({ name, fn });
}

/** Runs all transforms on an object. Exported for tests. */
export function applyTransforms(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const targets = Array.isArray(obj) ? obj.filter((x) => x && typeof x === 'object') : [obj];
  for (const target of targets) {
    if (capture && target.responseContext) capture(target);
    for (const t of transforms) guard(`transform ${t.name}`, () => t.fn(target));
  }
  return obj;
}

/** Debug capture of InnerTube responses (before transforms). */
export function setCapture(fn) {
  capture = fn;
}

export function install() {
  if (JSON.parse.__nexalloy) return;
  const wrapped = function parse(text, reviver) {
    const result = nativeParse.call(this, text, reviver);
    return applyTransforms(result);
  };
  wrapped.__nexalloy = true;
  JSON.parse = wrapped;
}

export { nativeParse };
