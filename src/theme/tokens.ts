import { Platform } from 'react-native';
import type { ThemeTokens } from './types';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Default light tokens (GitHub-like palette).
 * M4 adds `darkTheme`, `createTheme` and `'auto'`.
 */
export const lightTokens: ThemeTokens = Object.freeze({
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
  listBullets: Object.freeze(['•', '◦', '▪\uFE0E']),
});
