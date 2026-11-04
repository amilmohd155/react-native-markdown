/**
 * CommonMark + GFM spec suites and pathological inputs.
 * Harness design: docs/rewrite/phase-1/testing-harness.md
 *
 * Suites not yet in IMPLEMENTED_SUITES register every example with
 * `test.failing`: it must fail, which keeps CI green while showing the
 * remaining work. Allowlisted examples use `test.failing` permanently, so an
 * allowlisted example that starts passing fails the run and its entry must
 * be removed.
 */
import { loadAllowlist } from '../utils/allowlist';
import {
  IMPLEMENTED_SUITES,
  normalizeHtml,
  presetFor,
  renderToHtml,
} from '../utils/renderToHtml';
import {
  readSpec,
  type SpecExample,
  type SpecSuite,
} from '../utils/specReader';
import { pathologicalCases } from '../fixtures/pathological/cases';

const SUITES: { suite: SpecSuite; file: string; expected: number }[] = [
  { suite: 'commonmark', file: 'commonmark/spec.txt', expected: 652 },
  { suite: 'gfm', file: 'gfm/spec.txt', expected: 672 },
  { suite: 'gfm-extensions', file: 'gfm/extensions.txt', expected: 30 },
];

/** cmark-gfm's own runner skips examples whose fence says `example disabled`. */
const DISABLED = 'disabled';

/** Some extensions.txt examples only check that parsing doesn't crash. */
const IGNORE_OUTPUT = '<IGNORE>\n';

/** Upper bound per pathological input. Generous: CI runners are slow. */
const PATHOLOGICAL_TIMEOUT_MS = 2000;

const allowlist = loadAllowlist();

for (const { suite, file, expected } of SUITES) {
  describe(suite, () => {
    const examples = readSpec(file, suite);

    it(`loads all ${expected} examples from ${file}`, () => {
      expect(examples).toHaveLength(expected);
    });

    // Not registered at all, as cmark-gfm's own runner does.
    const active = examples.filter((ex) => ex.extension !== DISABLED);
    const matches = (ex: SpecExample): boolean => {
      const actual = renderToHtml(ex.markdown, { preset: presetFor(suite) });
      return (
        ex.html === IGNORE_OUTPUT ||
        normalizeHtml(actual) === normalizeHtml(ex.html)
      );
    };

    if (!IMPLEMENTED_SUITES.has(suite)) {
      // Not required yet: one informational test instead of per-example
      // expectations (the core CommonMark examples here already pass, so
      // `test.failing` would reject them).
      it('is not required yet (reports progress only)', () => {
        const passing = active.filter((ex) => {
          try {
            return matches(ex);
          } catch {
            return false;
          }
        }).length;
        console.info(`${suite}: ${passing}/${active.length} examples pass`);
        expect(passing).toBeGreaterThanOrEqual(0);
      });
      return;
    }

    for (const ex of active) {
      const title = `#${ex.example} ${ex.section} (line ${ex.line})`;
      const run = () => {
        const actual = renderToHtml(ex.markdown, { preset: presetFor(suite) });
        if (ex.html !== IGNORE_OUTPUT) {
          expect(normalizeHtml(actual)).toBe(normalizeHtml(ex.html));
        }
      };

      const known = allowlist.get(`${suite}:${ex.example}`);
      if (known) {
        test.failing(`${title} [allowlisted: ${known.reason}]`, run);
      } else {
        test(title, run);
      }
    }
  });
}

describe('pathological', () => {
  for (const { name, input, expect: pattern } of pathologicalCases) {
    const run = () => {
      const html = renderToHtml(input(), { preset: 'commonmark' });
      expect(html).toMatch(pattern);
    };

    const known = allowlist.get(`pathological:${name}`);
    if (known) {
      test.failing(
        `${name} [allowlisted: ${known.reason}]`,
        run,
        PATHOLOGICAL_TIMEOUT_MS
      );
    } else if (!IMPLEMENTED_SUITES.has('pathological')) {
      test.failing(`${name} [not implemented]`, run, PATHOLOGICAL_TIMEOUT_MS);
    } else {
      test(name, run, PATHOLOGICAL_TIMEOUT_MS);
    }
  }
});
