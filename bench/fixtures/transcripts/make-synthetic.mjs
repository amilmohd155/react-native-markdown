// Builds SYNTHETIC streaming transcripts (NOT recorded). See SOURCES.md.
// Usage: node make-synthetic.mjs   (run from this directory)
// Deterministic: seeded PRNG, no network, no downloads.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

let seed = 0x5eed1234;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
// Rough BPE-like pseudo-tokens: " word", punctuation runs, newlines, 4-char slices of long words.
const tokenize = (s) =>
  (s.match(/ ?[A-Za-z0-9_]+|\n+| ?[^\sA-Za-z0-9_]+|\s/g) ?? []).flatMap((t) =>
    t.length > 6 && /[A-Za-z]/.test(t) ? t.match(/^ ?.{1,4}|.{1,4}/g) : [t],
  );

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const stats = [];
const names = readdirSync('text')
  .filter((f) => f.endsWith('.md'))
  .sort();
for (const name of names) {
  const text = readFileSync(`text/${name}`, 'utf8');
  const toks = tokenize(text);
  const out = [];
  let t = 0;
  for (let i = 0; i < toks.length; ) {
    // an event carries 1..3 tokens (mostly 1; servers sometimes batch)
    const r = rnd();
    const n = r < 0.7 ? 1 : r < 0.92 ? 2 : 3;
    const chunk = toks.slice(i, i + n).join('');
    i += n;
    // inter-arrival: ~25 ms median, lognormal-ish, rare 150-400 ms stalls
    const gap = rnd() < 0.02 ? 150 + rnd() * 250 : 25 * Math.exp((rnd() - 0.5) * 1.4);
    t += out.length === 0 ? 400 : gap; // first-token latency
    out.push({ t: Math.round(t), text: chunk });
  }
  if (out.map((c) => c.text).join('') !== text) throw new Error('round-trip failed');
  const file = name.replace(/\.md$/, '.json');
  writeFileSync(file, JSON.stringify(out));
  const sz = out.map((c) => c.text.length).sort((a, b) => a - b);
  const gaps = out
    .slice(1)
    .map((c, i) => c.t - out[i].t)
    .sort((a, b) => a - b);
  stats.push({
    file,
    chars: text.length,
    chunks: out.length,
    size: { min: sz[0], median: q(sz, 0.5), p90: q(sz, 0.9), max: sz.at(-1) },
    gapMs: { min: gaps[0], median: q(gaps, 0.5), p90: q(gaps, 0.9), max: gaps.at(-1) },
    durationMs: out.at(-1).t,
  });
}
writeFileSync('stats.json', JSON.stringify(stats, null, 2) + '\n');
console.log(JSON.stringify(stats));
