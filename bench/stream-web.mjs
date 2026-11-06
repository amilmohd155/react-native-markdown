// Phase 2 S5 web run: bundles stream.mjs's simulation, runs it in Chrome with 4x CPU throttle.
//   node stream-web.mjs <out.json> [warmup=5] [measured=20]
// Needs playwright-core (root node_modules) and esbuild (bench/node_modules). Downloads nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/playwright-core');
const [outFile, w = '5', m = '20'] = process.argv.slice(2);

const lines = readFileSync('stream.mjs', 'utf8').split('\n');
const entry =
  readFileSync('stream-web-head.ts', 'utf8') +
  lines.slice(52, 270).join('\n') +
  readFileSync('stream-web-tail.ts', 'utf8');
writeFileSync('.stream-web-entry.generated.ts', entry);
const bundle = await build({
  entryPoints: ['.stream-web-entry.generated.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const code = bundle.outputFiles[0].text;
const code4d = readFileSync('fixtures/code-heavy.md', 'utf8');
const fixtures = [
  { name: 'F4a', size: 20, fence: true },
  { name: 'F4b', size: 195, fence: true },
  { name: 'F4d', size: 20, fence: true, text: code4d },
];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.setContent('<html><body>bench</body></html>');
await page.addScriptTag({ content: code });
const t0 = Date.now();
const res = await page.evaluate(([f, a, b]) => window.runBench(f, a, b), [fixtures, Number(w), Number(m)]);
const ua = await page.evaluate(() => navigator.userAgent);
const version = browser.version();
await browser.close();
const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const dirty = execFileSync('git', ['status', '--short']).toString().trim();
writeFileSync(
  outFile,
  JSON.stringify({
    env: {
      browser: 'Google Chrome (system app, headless, via playwright-core)',
      version,
      userAgent: ua,
      throttle: 'CDP Emulation.setCPUThrottlingRate rate=4',
      os: 'macOS 27.2 (Darwin 27.2.0), Apple M1',
      harness: 'bench/stream-web.mjs (simulation copied from bench/stream.mjs)',
    },
    sha,
    dirty: dirty || 'clean',
    warmup: Number(w),
    measured: Number(m),
    wallMs: Date.now() - t0,
    note: 'streamCost = sum of flush time (tail parse + convert; no splice/React) / one parse() of the full text measured in the same run. Virtual-clock arrival, 1 chunk per 16 ms. Strategies interleaved per run. naive interpolated from 40 sampled prefixes. F4c skipped: transcripts are synthetic (4.2 KB).',
    results: res,
  })
);
console.log('done', Date.now() - t0, 'ms');
