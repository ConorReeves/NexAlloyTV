// Minimal browser stand-ins so feature modules can be imported under Node.
// Timers are stubbed so module-level polling doesn't keep the test alive.
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.location = { hash: '' };
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
