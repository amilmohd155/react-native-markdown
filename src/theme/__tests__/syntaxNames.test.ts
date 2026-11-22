/**
 * P3a-4: syntax token names align with enriched-markdown's `syntaxColors`
 * (keyword, operator, punctuation, string, number, constant, comment,
 * function, type, variable, property, embedded); `plain`, `inserted` and
 * `deleted` are ours. Source: enriched-markdown docs-md/STYLES.md.
 */
import { resolveTheme } from '../resolve';
import { SYNTAX_TOKEN_TYPES } from '../types';

const BASE_COLOURED = ['operator', 'punctuation', 'variable', 'embedded'];

describe('syntax token names', () => {
  it('has the enriched-markdown names that map, plus ours', () => {
    for (const name of [
      'keyword',
      'operator',
      'punctuation',
      'string',
      'number',
      'constant',
      'comment',
      'function',
      'type',
      'variable',
      'property',
      'embedded',
    ]) {
      expect(SYNTAX_TOKEN_TYPES).toContain(name);
    }
    expect(SYNTAX_TOKEN_TYPES).toHaveLength(15);
  });

  it.each(['light', 'dark'] as const)(
    '%s: operator, punctuation, variable, embedded are the base code colour',
    (scheme) => {
      const resolved = resolveTheme({}, scheme);
      const base = resolved.elements.CodeBlock.text.color;
      for (const type of BASE_COLOURED) {
        expect([type, resolved.tokens.syntax[type as 'operator']]).toEqual([
          type,
          base,
        ]);
      }
    }
  );

  it('a partial syntax still colours the new types', () => {
    const { syntax } = resolveTheme({
      codeBlock: { syntax: { operator: '#111111', variable: '#222222' } },
    }).tokens;
    expect(syntax.operator).toBe('#111111');
    expect(syntax.variable).toBe('#222222');
  });
});
