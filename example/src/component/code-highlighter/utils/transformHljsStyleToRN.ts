import transform, { type StyleTuple } from 'css-to-react-native';
import type { HljsStyle, HighlighterStyleSheet } from '../types';

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background',
  'backgroundColor',
  'fontWeight',
  'fontStyle',
]);

function isValidRNValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return true;

  const val = value.trim().toLowerCase();

  // Reject gradients and other unsupported patterns
  if (val.startsWith('linear-gradient') || val.startsWith('radial-gradient')) {
    return false;
  }

  // If background is a gradient-like string, skip it
  if (
    (key === 'background' || key === 'backgroundColor') &&
    val.includes('gradient')
  ) {
    return false;
  }

  return true;
}

export function transformHljsStyleToRN(
  hljsStyle: HljsStyle
): HighlighterStyleSheet {
  const result: HighlighterStyleSheet = {};

  for (const [className, style] of Object.entries(hljsStyle)) {
    const filtered: StyleTuple[] = [];

    for (const [key, value] of Object.entries(style)) {
      if (ALLOWED_STYLE_PROPERTIES.has(key) && isValidRNValue(key, value)) {
        filtered.push([key, value]);
      }
    }

    if (filtered.length > 0) {
      result[className] = transform(filtered);
    }
  }

  return result;
}
