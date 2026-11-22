import type { FlatThemeBlock, FlatThemeInput } from '../flatTypes';

// Type-level checks: `yarn typecheck` fails if an expectation is wrong.
describe('flat theme types', () => {
  it('accepts whitelisted props', () => {
    const t: FlatThemeInput = {
      paragraph: { color: '#000', fontFamily: { regular: 'A' }, marginTop: 4 },
      h1: { fontSize: 32, textAlign: 'center' },
      blockquote: {
        borderLeftWidth: 4,
        admonitions: { caution: { color: 'red', backgroundColor: 'pink' } },
      },
      codeBlock: { syntax: { keyword: '#f00' }, padding: 8 },
      link: {
        color: 'blue',
        variants: { '^user:': { textDecorationLine: 'none' } },
      },
      checkbox: { checkedText: false },
      dark: { divider: { backgroundColor: '#333', height: 1 } },
      light: { strong: { fontWeight: 'normal' } },
    };
    const b: FlatThemeBlock = { superscript: { fontScale: 0.7 } };
    expect(t).toBeDefined();
    expect(b).toBeDefined();
  });

  it('rejects props outside the whitelist', () => {
    const bad: FlatThemeInput[] = [
      // @ts-expect-error divider takes no text props
      { divider: { color: 'red' } },
      // @ts-expect-error strikethrough takes color only
      { strikethrough: { fontSize: 12 } },
      // @ts-expect-error listItem takes no margins
      { listItem: { marginTop: 1 } },
      // @ts-expect-error unknown key
      { nope: {} },
      // @ts-expect-error unknown prop
      { paragraph: { padding: 1 } },
      // @ts-expect-error strong fontFamily is a plain string
      { strong: { fontFamily: { regular: 'A' } } },
      // @ts-expect-error unknown syntax token
      { codeBlock: { syntax: { nope: '#000' } } },
      // @ts-expect-error nested variants take link props only
      { link: { variants: { a: { variants: {} } } } },
      // @ts-expect-error scheme blocks are checked too
      { dark: { divider: { color: 'red' } } },
      // @ts-expect-error scheme blocks do not nest
      { dark: { dark: {} } },
    ];
    expect(bad).toHaveLength(10);
  });
});
