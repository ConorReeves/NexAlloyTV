// Bundles src/ into the script the Xposed patch injects. The output is
// committed, so a normal Gradle build doesn't need Node.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../app/src/main/resources/nexalloy-tv/nexalloy-tv.js');

let version = 'dev';
try {
  version = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim();
} catch {
  // Not a git checkout.
}

await build({
  entryPoints: [resolve(here, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'chrome120', // Chrobalt in YouTube TV 7.27 is Chromium 138.
  minify: false,
  legalComments: 'none',
  define: { __NEXALLOY_VERSION__: JSON.stringify(version) },
  outfile: out,
});

const banner = `/* NexAlloy YouTube TV script (${version}). Generated from tv-script/ by build.mjs. Do not edit. GPL-3.0-only. */\n`;
writeFileSync(out, banner + readFileSync(out, 'utf8'));
console.log(`Wrote ${out}`);
