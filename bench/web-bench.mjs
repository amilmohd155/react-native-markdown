// Web run of the example app's Bench (Full 5+20), ParseSplit (Run) and Profile (full 3+15) screens
// in system Chrome at 4x CPU throttle. Needs a production export of the example app:
//   cd example && npx expo export --platform web --output-dir <dist>
//   node bench/web-bench.mjs <dist> <outPrefix> [bench,parsesplit,profile]
// e.g. outPrefix = bench/results/web-chrome-4x-2026-11-06 -> <prefix>-bench.json, -parsesplit.log, -profile.log
// Serves <dist> on 127.0.0.1 (random port) and stops the server on exit. Downloads nothing.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/playwright-core');

const [dist, prefix, only = 'bench,parsesplit,profile'] = process.argv.slice(2);
if (!dist || !prefix) throw new Error('usage: web-bench.mjs <dist> <outPrefix> [screens]');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dist, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const SCREENS = {
  bench: { tab: 'Bench', button: /^Full · 5\+20$/, done: /^Done$/m, tags: ['bench', 'bench:samples'] },
  parsesplit: { tab: 'ParseSplit', button: /^Run$/, done: /parse split · done/, tags: ['parseSplit'] },
  profile: { tab: 'Profile', button: /^full · 3\+15$/, done: /^Done · release build$/m, tags: ['profile', 'profile:samples'] },
};

function reassemble(lines, tag) {
  // [tag i/n] chunk ; a new run restarts at 1. Returns the last complete JSON.
  const re = new RegExp(`^\\[${tag.replace(':', '\\:')} (\\d+)/(\\d+)\\] ([\\s\\S]*)$`);
  let parts = [];
  let out = null;
  for (const l of lines) {
    const m = re.exec(l);
    if (!m) continue;
    const [i, n] = [Number(m[1]), Number(m[2])];
    if (i === 1) parts = [];
    parts.push(m[3]);
    if (i === n) out = JSON.parse(parts.join(''));
  }
  return out;
}

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const version = browser.version();
const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const env = {
  browser: 'Google Chrome (system app, headless, via playwright-core)',
  version,
  throttle: 'CDP Emulation.setCPUThrottlingRate rate=4',
  os: 'macOS 27.2 (Darwin 27.2.0), Apple M1',
  harness: 'bench/web-bench.mjs driving example/ production web export (expo export --platform web)',
  sha,
  date: new Date().toISOString(),
};
const results = {};
async function save(key) {
  if (results.bench) {
  const r = results.bench;
  await writeFile(`${prefix}-bench.json`, JSON.stringify({ env, userAgent: r.ua, wallMs: r.wallMs, ...r.tags.bench, samples: r.tags['bench:samples'] }));
}
if (results.parsesplit) {
  const r = results.parsesplit;
  await writeFile(`${prefix}-parsesplit.log`, JSON.stringify({ env, wallMs: r.wallMs, result: r.tags.parseSplit }, null, 1) + '\n');
}
if (results.profile) {
  const r = results.profile;
  await writeFile(`${prefix}-profile.log`, JSON.stringify({ env, wallMs: r.wallMs, ...r.tags.profile, samples: r.tags['profile:samples'] }) + '\n');
}
}

try {
  for (const key of only.split(',')) {
    const s = SCREENS[key];
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const lines = [];
    page.on('console', (m) => lines.push(m.text()));
    page.on('pageerror', (e) => lines.push(`[pageerror] ${e.message}`));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(url);
    await page.getByRole('tab', { name: s.tab, exact: true }).click();
    const t0 = Date.now();
    await page.getByText(s.button).filter({ visible: true }).click();
    await page.waitForFunction(
      ([src, flags]) => new RegExp(src, flags).test(document.body.innerText),
      [s.done.source, s.done.flags],
      { timeout: 25 * 60_000, polling: 2000 }
    );
    const wallMs = Date.now() - t0;
    await page.waitForTimeout(1000);
    const ua = await page.evaluate(() => navigator.userAgent);
    await page.screenshot({ path: `${prefix}-${key}.png` }).catch(() => {});
    results[key] = { lines, wallMs, ua, tags: Object.fromEntries(s.tags.map((t) => [t, reassemble(lines, t)])) };
    await page.close();
    await save(key);
    console.log(key, 'done', wallMs, 'ms');
  }
} finally {
  await browser.close();
  server.close();
}

for (const [k, r] of Object.entries(results)) if (Object.values(r.tags).some((v) => v === null)) console.error('WARNING: missing tag output for', k);
