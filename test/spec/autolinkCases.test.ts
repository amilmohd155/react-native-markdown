/**
 * GFM autolinks, case by case.
 * Harness design: docs/rewrite/phase-1/testing-harness.md#allowlist-format
 *
 * `extensions.txt` example 19 bundles 32 autolink cases, one paragraph each.
 * 5 are known gaps (P1-1), so the example is allowlisted as a whole; this
 * file splits it so the other 27 stay enforced. Case `n` (0-based) is
 * allowlisted as `"example": "19/n"`.
 */
import { loadAllowlist } from '../utils/allowlist';
import { normalizeHtml, renderToHtml } from '../utils/renderToHtml';
import { readSpec } from '../utils/specReader';

const EXAMPLE = 19;
const CASES = 32;

const allowlist = loadAllowlist();
const example = readSpec('gfm/extensions.txt', 'gfm-extensions')[EXAMPLE - 1]!;
const inputs = example.markdown.split('\n\n').map((md) => md.trim() + '\n');
const outputs = normalizeHtml(example.html).trim().split('\n');

describe(`gfm-extensions #${EXAMPLE} (${example.section}) by case`, () => {
  it(`splits into ${CASES} cases with one output line each`, () => {
    expect(example.section).toBe('Autolinks');
    expect(inputs).toHaveLength(CASES);
    expect(outputs).toHaveLength(CASES);
  });

  it('has case-level allowlist entries only for cases that exist', () => {
    const prefix = `gfm-extensions:${EXAMPLE}/`;
    const cases = [...allowlist.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => Number(key.slice(prefix.length)));
    expect(cases.every((n) => Number.isInteger(n) && n < CASES)).toBe(true);
    // The whole example stays allowlisted while any case is.
    if (cases.length > 0) {
      expect(allowlist.has(`gfm-extensions:${EXAMPLE}`)).toBe(true);
    }
  });

  inputs.forEach((markdown, index) => {
    const title = `case ${index}: ${JSON.stringify(markdown.trim())}`;
    const run = () => {
      const html = renderToHtml(markdown, { preset: 'gfm' });
      expect(normalizeHtml(html).trim()).toBe(outputs[index]);
    };
    const known = allowlist.get(`gfm-extensions:${EXAMPLE}/${index}`);
    if (known) test.failing(`${title} [allowlisted: ${known.reason}]`, run);
    else test(title, run);
  });
});
