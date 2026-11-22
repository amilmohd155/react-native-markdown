import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Markdown } from '../../api/Markdown';
import { resolveTheme } from '../../theme/resolve';
import type { FlatThemeInput } from '../../theme';
import { admonitions } from '../index';

const KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
const LABEL = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

async function show(source: string, theme?: FlatThemeInput | 'dark') {
  await render(
    <Markdown source={source} plugins={[admonitions()]} theme={theme} />
  );
}

const box = (kind: (typeof KINDS)[number]) =>
  StyleSheet.flatten(screen.getByLabelText(LABEL[kind]).props.style);

describe('admonition theme: blockquote.admonitions', () => {
  it('uses a distinct accent bar, title and tint per kind', async () => {
    await show(KINDS.map((k) => `> [!${k.toUpperCase()}]\n> x`).join('\n\n'));
    const bars = KINDS.map((k) => box(k).borderLeftColor);
    expect(new Set(bars).size).toBe(5);
    for (const k of KINDS) {
      expect(box(k).backgroundColor).toBe(box(k).borderLeftColor + '1a');
      expect(
        StyleSheet.flatten(screen.getByText(LABEL[k]).props.style).color
      ).toBe(box(k).borderLeftColor);
    }
  });

  it('sets color and backgroundColor for one kind only', async () => {
    await show('> [!NOTE]\n> a\n\n> [!TIP]\n> b', {
      blockquote: {
        admonitions: { tip: { color: '#112233', backgroundColor: '#abcdef' } },
      },
    });
    expect(box('tip')).toMatchObject({
      borderLeftColor: '#112233',
      backgroundColor: '#abcdef',
    });
    expect(box('note').borderLeftColor).toBe('#0969da');
  });

  it('derives the tint from a custom color', async () => {
    await show('> [!NOTE]\n> a', {
      blockquote: { admonitions: { note: { color: '#112233' } } },
    });
    expect(box('note').backgroundColor).toBe('#1122331a');
  });

  it('inherits geometry from blockquote and ignores its colors', async () => {
    await show('> [!NOTE]\n> a', {
      blockquote: {
        borderLeftWidth: 6,
        borderRadius: 9,
        paddingLeft: 30,
        marginBottom: 41,
        backgroundColor: '#ff0000',
        borderLeftColor: '#00ff00',
      },
    });
    expect(box('note')).toMatchObject({
      borderLeftWidth: 6,
      borderRadius: 9,
      paddingLeft: 30,
      marginBottom: 41,
      borderLeftColor: '#0969da',
      backgroundColor: '#0969da1a',
    });
  });

  it('a dark block overrides one kind in dark only', () => {
    const input: FlatThemeInput = {
      blockquote: { admonitions: { caution: { color: '#b91c1c' } } },
      dark: { blockquote: { admonitions: { caution: { color: '#f87171' } } } },
    };
    const accent = (scheme: 'light' | 'dark') =>
      resolveTheme(input, scheme).admonitions.caution.accent;
    expect(accent('dark')).toBe('#f87171');
    expect(accent('light')).toBe('#b91c1c');
  });

  it('uses the dark accents on the dark theme', async () => {
    await show('> [!TIP]\n> a', 'dark');
    expect(box('tip').borderLeftColor).toBe('#3fb950');
  });

  it('scales sub/superscripts from an own fontSize', async () => {
    await show('> [!NOTE]\n> Brand<sup>TM</sup>', {
      blockquote: { fontSize: 20 },
    });
    const sup = screen.getByText('TM');
    expect(StyleSheet.flatten(sup.props.style).fontSize).toBe(15);
  });
});
