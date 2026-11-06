const chunkify = (size) => {
  const out = [];
  for (let k = 0; k < text.length; k += size) out.push(text.slice(k, k + size));
  return out;
};

window.runBench = function (fixtures, warmup, measured) {
  const out = {};
  for (const fx of fixtures) {
    text = fx.text ?? F2;
    rate = fx.size * 62.5; // one chunk per 16 ms
    const chunks = chunkify(fx.size);
    let t = 0;
    const timed = chunks.map((c) => {
      const at = t;
      t += (c.length / rate) * 1000;
      return { t: at, text: c };
    });
    const strategies = [
      'naive',
      'tail',
      'tail+frame',
      'w33',
      'w50',
      'w100',
      'w200',
    ];
    if (fx.fence) strategies.push('tail+fence');
    const runs = [];
    for (let r = 0; r < warmup + measured; r++) {
      const row = {
        warmup: r < warmup,
        fullMs: timeOf(() => parseFull(text)),
        s: {},
      };
      for (const s of strategies) {
        let res;
        if (s === 'naive') res = simulateNaive(chunks);
        else if (s.startsWith('w'))
          res = simulateWindow(timed, Number(s.slice(1)));
        else res = simulate(s, chunks);
        if (res.source !== text) throw new Error(s + ': source mismatch');
        const total = res.flushes.reduce((a, b) => a + b, 0);
        row.s[s] = {
          total,
          p90: p90(res.flushes),
          flushes: res.flushes.length,
          fast: res.fastPath ?? 0,
          x: total / row.fullMs,
        };
      }
      runs.push(row);
    }
    out[fx.name] = { chars: text.length, chunk: fx.size, rate, runs };
  }
  return out;
};
