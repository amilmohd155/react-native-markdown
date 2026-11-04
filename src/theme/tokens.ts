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
  }),
  fonts: Object.freeze({ body: undefined, heading: undefined, mono }),
  fontSize: Object.freeze({ base: 16, scale: 1.2 }),
  lineHeight: 1.5,
  spacing: Object.freeze({ block: 12, listIndent: 20 }),
  radius: Object.freeze({ code: 6 }),
  // U+FE0E (text presentation): iOS draws ▪ as an emoji square without it.
  listBullets: Object.freeze(['•', '◦', '▪︎']),
});

/**
 * Built-in dark theme (GitHub-dark-like palette). Only colors differ from
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
  }),
});
