import { Platform } from 'react-native';
import type { ThemeTokens } from './types';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Built-in light theme (GitHub-like palette). The base `createTheme` merges
 * onto by default, and what `theme="light"` resolves.
 */
export const lightTheme: ThemeTokens = Object.freeze({
  colors: Object.freeze({
    text: '#1f2328',
    muted: '#59636e',
    link: '#0969da',
    codeBg: '#f6f8fa',
    border: '#d1d9e0',
    quoteBar: '#d1d9e0',
    highlight: '#fff8c5',
    footnoteHighlight: '#fff3a3',
  }),
  fonts: Object.freeze({ body: undefined, heading: undefined, mono }),
  fontSize: Object.freeze({ base: 16, scale: 1.2 }),
  lineHeight: 1.5,
  spacing: Object.freeze({ block: 12, listIndent: 20 }),
  radius: Object.freeze({ code: 6 }),
  // U+FE0E (text presentation): iOS draws ▪ as an emoji square without it.
  listBullets: Object.freeze(['•', '◦', '▪︎']),
  imageRatio: 16 / 9,
  checkbox: Object.freeze({
    checkedText: Object.freeze({
      textDecorationLine: 'line-through',
      opacity: 0.6,
    }),
  }),
  // GitHub light syntax colors; each is >= 4.5:1 on `colors.codeBg`.
  syntax: Object.freeze({
    keyword: '#cf222e',
    string: '#0a3069',
    number: '#0550ae',
    comment: '#59636e',
    function: '#8250df',
    type: '#953800',
    operator: '#cf222e',
    punctuation: '#1f2328',
    property: '#0550ae',
    constant: '#0550ae',
    plain: '#1f2328',
    inserted: '#116329',
    deleted: '#82071e',
  }),
});

/**
 * Built-in dark theme (GitHub-dark-like palette). Only colors (`colors`,
 * `syntax`) differ from
 * `lightTheme`, so switching scheme never changes layout.
 */
export const darkTheme: ThemeTokens = Object.freeze({
  ...lightTheme,
  colors: Object.freeze({
    text: '#e6edf3',
    muted: '#9198a1',
    link: '#4493f8',
    codeBg: '#151b23',
    border: '#3d444d',
    quoteBar: '#3d444d',
    highlight: '#5a4a00',
    footnoteHighlight: 'rgba(212, 167, 44, 0.35)',
  }),
  // GitHub dark syntax colors; each is >= 4.5:1 on `colors.codeBg`.
  syntax: Object.freeze({
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    comment: '#9198a1',
    function: '#d2a8ff',
    type: '#ffa657',
    operator: '#ff7b72',
    punctuation: '#e6edf3',
    property: '#79c0ff',
    constant: '#79c0ff',
    plain: '#e6edf3',
    inserted: '#7ee787',
    deleted: '#ffa198',
  }),
});
