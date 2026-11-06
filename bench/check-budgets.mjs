// Checks the F3 medians of a Bench result file against bench/budgets.json.
//
//   node check-budgets.mjs results/sm-s731b-2026-11-06-f3cm.json
//
// Exit code 1 if any median is over its ceiling. The ceilings are proposed
// (P2-9) and measured on one device, so only compare results from the same
// device and build (release, Hermes). Web and Node runs are not comparable.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) {
  console.error('usage: node check-budgets.mjs <bench-result.json>');
  process.exit(2);
}

const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));
const result = JSON.parse(readFileSync(file, 'utf8'));
const rows = result.summary ?? [];

if (result.device?.model !== budgets.device.model || result.device?.dev) {
  console.warn(
    `warning: result is from ${result.device?.model ?? 'unknown'}` +
      `${result.device?.dev ? ' (dev build)' : ''}, ceilings are for ` +
      `${budgets.device.model} (${budgets.device.build}). Not comparable.`
  );
}

let failed = false;
console.log(
  `status: ${budgets.status} (${budgets.fixture}, ${budgets.impl}, ms, median)`
);
for (const { metric, ceilingMs } of budgets.budgets) {
  const row = rows.find(
    (r) =>
      r.fixture === budgets.fixture &&
      r.impl === budgets.impl &&
      r.metric === metric
  );
  if (!row) {
    console.log(`${metric.padEnd(20)} missing from result`);
    failed = true;
    continue;
  }
  const over = row.median > ceilingMs;
  failed ||= over;
  console.log(
    `${metric.padEnd(20)} ${row.median.toFixed(1).padStart(7)} / ${String(
      ceilingMs
    ).padStart(4)}  ${over ? 'OVER' : 'ok'}`
  );
}
process.exit(failed ? 1 : 0);
