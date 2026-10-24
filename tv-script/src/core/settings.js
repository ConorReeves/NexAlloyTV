// Settings registry and storage.
//
// Features declare their settings at import time; the in-app settings panel
// (ui/settingsPanel.js) is generated from these declarations. Values live in
// the page's localStorage, so they persist with YouTube TV's own data and are
// cleared together with it.

import { warn } from './log.js';

const STORAGE_KEY = 'nexalloy-tv-settings';

/** @type {Map<string, object>} key -> definition */
const definitions = new Map();
/** @type {{id:string,title:string,summary?:string,icon:string,keys:string[]}[]} */
const categories = [];
const listeners = new Set();

let values = load();

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
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    warn('settings: could not load, using defaults', err);
    return {};
  }
}

function save() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch (err) {
    warn('settings: could not save', err);
  }
}

export function defineCategory({ id, title, summary, icon = 'SETTINGS' }) {
  if (!categories.some((c) => c.id === id)) {
    categories.push({ id, title, summary, icon, keys: [] });
  }
}

/**
 * @param {string} categoryId
 * @param {object} def
 * @param {string} def.key
 * @param {string} def.title
 * @param {string} [def.summary]
 * @param {'bool'|'choice'|'list'|'action'} [def.type]
 * @param {*} [def.default]
 * @param {{value:*, label:string}[]} [def.choices] for 'choice'
 * @param {Function} [def.run] for 'action'
 * @param {Function} [def.extraItems] for 'list': () => [{title, run}]
 */
export function defineSetting(categoryId, def) {
  const full = { type: 'bool', ...def, categoryId };
  if (full.type === 'list' && full.default === undefined) full.default = [];
  definitions.set(full.key, full);
  const category = categories.find((c) => c.id === categoryId);
  if (!category) throw new Error(`settings: unknown category ${categoryId}`);
  if (!category.keys.includes(full.key)) category.keys.push(full.key);
}

export function get(key) {
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  const def = definitions.get(key);
  if (!def) return undefined;
  // Copy list defaults so callers can't mutate the definition.
  return Array.isArray(def.default) ? [...def.default] : def.default;
}

export function set(key, value) {
  values[key] = value;
  save();
  for (const fn of listeners) {
    try {
      fn(key, value);
    } catch (err) {
      warn('settings listener', err);
    }
  }
}

export function reset(key) {
  delete values[key];
  save();
  for (const fn of listeners) fn(key, get(key));
}

/** Adds a string to a 'list' setting (case-insensitive, no duplicates). */
export function addToList(key, entry) {
  const trimmed = String(entry ?? '').trim();
  if (!trimmed) return false;
  const list = get(key) ?? [];
  if (list.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return false;
  set(key, [...list, trimmed]);
  return true;
}

export function removeFromList(key, entry) {
  set(key, (get(key) ?? []).filter((x) => x !== entry));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getCategories = () => categories;
export const getDefinition = (key) => definitions.get(key);

/** For tests. */
export function __resetForTests(initial = {}) {
  values = { ...initial };
}
