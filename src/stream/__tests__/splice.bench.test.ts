/**
 * Micro-benchmark for P2-2 (not a regression test): cost of one
 * `spliceTables` at 900 blocks. Skipped unless run explicitly:
 *   BENCH_SPLICE=1 yarn jest src/stream/__tests__/splice.bench -- --silent=false
 * Node/JIT numbers only; the Hermes figure on device is what P2-2 needs.
 */
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { spliceTables } from '../splice';

const run = process.env.BENCH_SPLICE ? it : it.skip;

run('splice cost at 900 blocks', () => {
  const blocks = Array.from(
    { length: 900 },
    (_, i) =>
      `Paragraph ${i} with **bold** and \`code\` and a [link](https://x.dev/${i}).`
  );
  const source = blocks.join('\n\n') + '\n';
  const prefix = parseWithMarkdownIt(source).table;
  const k = prefix.blockCount - 1;
  const offset = prefix.blockStart[k]!;
  const t = parseWithMarkdownIt(source.slice(offset)).table;
  const tail = { ...t, source };
  const id = {};

  for (let i = 0; i < 200; i++) spliceTables(prefix, k, tail, id); // warm up
  const runs = 2000;
  const start = performance.now();
  for (let i = 0; i < runs; i++) spliceTables(prefix, k, tail, id);
  const ms = (performance.now() - start) / runs;

  console.log(
    `splice @ ${prefix.blockCount} blocks / ${prefix.count} nodes: ${ms.toFixed(4)} ms`
  );
});
