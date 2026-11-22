import { Platform } from 'react-native';
import type { FlatThemeBlock } from './flatTypes';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Built-in light theme (GitHub-like palette), as a flat theme block: the
 * base every resolve merges onto when the scheme is light. Only values that
 * differ by scheme or are read as defaults by several elements live here;
 * the resolver derives the rest (sizes, spacing, heading scale).
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */
export const lightTheme: FlatThemeBlock = Object.freeze({
  paragraph: Object.freeze({ color: '#1f2328', fontSize: 16 }),
  blockquote: Object.freeze({ color: '#59636e', borderLeftColor: '#d1d9e0' }),
  link: Object.freeze({ color: '#0969da' }),
  codeBlock: Object.freeze({
    backgroundColor: '#f6f8fa',
    fontFamily: mono,
    borderRadius: 6,
    // GitHub light syntax colors; each is >= 4.5:1 on the code background.
    syntax: Object.freeze({
      keyword: '#cf222e',
      string: '#0a3069',
      number: '#0550ae',
      comment: '#59636e',
      function: '#8250df',
      type: '#953800',
      operator: '#1f2328',
      punctuation: '#1f2328',
      property: '#0550ae',
      constant: '#0550ae',
      variable: '#1f2328',
      embedded: '#1f2328',
      plain: '#1f2328',
      inserted: '#116329',
      deleted: '#82071e',
    }),
  }),
  divider: Object.freeze({ backgroundColor: '#d1d9e0' }),
  highlight: Object.freeze({ backgroundColor: '#fff8c5' }),
  footnote: Object.freeze({
    definition: Object.freeze({ highlightColor: '#fff3a3' }),
  }),
  // U+FE0E (text presentation): iOS draws ▪ as an emoji square without it.
  list: Object.freeze({
    bullets: Object.freeze(['•', '◦', '▪︎']),
    marginLeft: 20,
    gapWidth: 6,
  }),
  image: Object.freeze({}),
  checkbox: Object.freeze({
    checkedText: Object.freeze({
      textDecorationLine: 'line-through',
      opacity: 0.6,
    }),
  }),
} as const);

/**
 * Built-in dark theme (GitHub-dark-like palette). Only colors differ from
 * `lightTheme`, so switching scheme never changes layout.
 */
export const darkTheme: FlatThemeBlock = Object.freeze({
  ...lightTheme,
  paragraph: Object.freeze({ ...lightTheme.paragraph, color: '#e6edf3' }),
  blockquote: Object.freeze({ color: '#9198a1', borderLeftColor: '#3d444d' }),
  link: Object.freeze({ color: '#4493f8' }),
  codeBlock: Object.freeze({
    ...lightTheme.codeBlock,
    backgroundColor: '#151b23',
    // GitHub dark syntax colors; each is >= 4.5:1 on the code background.
    syntax: Object.freeze({
      keyword: '#ff7b72',
      string: '#a5d6ff',
      number: '#79c0ff',
      comment: '#9198a1',
      function: '#d2a8ff',
      type: '#ffa657',
      operator: '#e6edf3',
      punctuation: '#e6edf3',
      property: '#79c0ff',
      constant: '#79c0ff',
      variable: '#e6edf3',
      embedded: '#e6edf3',
      plain: '#e6edf3',
      inserted: '#7ee787',
      deleted: '#ffa198',
    }),
  }),
  divider: Object.freeze({ backgroundColor: '#3d444d' }),
  highlight: Object.freeze({ backgroundColor: '#5a4a00' }),
  footnote: Object.freeze({
    definition: Object.freeze({
      highlightColor: 'rgba(212, 167, 44, 0.35)',
    }),
  }),
} as const);
