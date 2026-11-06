/**
 * Stream equivalence under jsdom (phase 2 testing harness, Platform tests): a
 * subset of test/stream/equivalence.test.ts, so the core is also checked in the
 * web project's environment. After every flush the streamed table must equal
 * `parse(source so far)`.
 */
import { F2 } from '../../../bench/fixtures';
import { presetFor } from '../../../test/utils/renderToHtml';
import { readSpec, type SpecSuite } from '../../../test/utils/specReader';
import { targetedCases } from '../../../test/stream/cases';
import {
  awkwardSplits,
  fixed,
  loadStreamAllowlist,
  seeded,
  streamAndCompare,
  type RunOptions,
} from '../../../test/stream/harness';

const allowlist = loadStreamAllowlist();

const SUITES: { suite: SpecSuite; file: string }[] = [
  { suite: 'commonmark', file: 'commonmark/spec.txt' },
  { suite: 'gfm', file: 'gfm/spec.txt' },
  { suite: 'gfm-extensions', file: 'gfm/extensions.txt' },
];

/** Every 4th spec example, to keep the web project quick. */
const STRIDE = 4;

for (const { suite, file } of SUITES) {
  describe(`stream equivalence (web): ${suite}`, () => {
    const examples = readSpec(file, suite).filter(
      (ex) => ex.extension !== 'disabled' && ex.example % STRIDE === 0
    );
    for (const ex of examples) {
      const key = `${suite}:${ex.example}`;
      const body = () => {
        const options: RunOptions = {
          parse: { preset: presetFor(suite, ex.extension), html: 'text' },
          allowFullReparse: true,
        };
        const source = ex.markdown;
        streamAndCompare(fixed(1)(source), `${key} fixed(1)`, options);
        streamAndCompare(fixed(20)(source), `${key} fixed(20)`, options);
        streamAndCompare(seeded(1)(source), `${key} seed=1`, options);
        for (const a of awkwardSplits(source)) {
          streamAndCompare(a.chunks, `${key} ${a.name}`, options);
        }
      };
      const title = `#${ex.example} ${ex.section}`;
      const known = allowlist.get(key);
      if (known) it.failing(`${title} [allowlisted: ${known.reason}]`, body);
      else it(title, body);
    }
  });
}

describe('stream equivalence (web): targeted cases', () => {
  for (const c of targetedCases) {
    const key = `targeted:${c.name}`;
    const body = () => {
      for (const source of c.sources) {
        const options: RunOptions = {
          ...(c.parse ? { parse: c.parse } : {}),
          allowFullReparse: c.allowFullReparse ?? false,
        };
        streamAndCompare(fixed(1)(source), `${key} fixed(1)`, options);
        streamAndCompare(seeded(2)(source), `${key} seed=2`, options);
      }
    };
    const known = allowlist.get(key);
    if (known) it.failing(`${c.name} [allowlisted: ${known.reason}]`, body);
    else it(c.name, body);
  }
});

describe('stream equivalence (web): F2 fixture', () => {
  it.each([20, 195])('streams in chunks of %i', (size) => {
    streamAndCompare(fixed(size)(F2), `F2 fixed(${size})`);
  });
});
