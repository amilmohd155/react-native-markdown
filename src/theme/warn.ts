import type { CoreFlatTheme, CoreThemeKey } from './flatTypes';
import { SYNTAX_TOKEN_TYPES } from './types';

/**
 * Dev-only warning for props a core key of the flat theme does not accept
 * (P3a, theme-props.md "Implementation notes" 1). Types already reject them
 * for TypeScript users; this catches plain JS and `as` casts.
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */

type Accepted = {
  readonly [K in CoreThemeKey]: readonly (keyof NonNullable<
    CoreFlatTheme[K]
  >)[];
};

const TEXT = [
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'textAlign',
] as const;
const MARGIN = ['marginTop', 'marginBottom'] as const;

// Keep in step with the interfaces in `flatTypes.ts`.
const ACCEPTED: Accepted = {
  paragraph: [...TEXT, ...MARGIN],
  h1: [...TEXT, ...MARGIN],
  h2: [...TEXT, ...MARGIN],
  h3: [...TEXT, ...MARGIN],
  h4: [...TEXT, ...MARGIN],
  h5: [...TEXT, ...MARGIN],
  h6: [...TEXT, ...MARGIN],
  blockquote: [
    ...TEXT,
    ...MARGIN,
    'backgroundColor',
    'borderLeftColor',
    'borderLeftWidth',
    'borderRadius',
    'padding',
    'paddingLeft',
    'admonitions',
  ],
  list: [
    ...MARGIN,
    'bullets',
    'bulletColor',
    'bulletSize',
    'markerColor',
    'markerFontWeight',
    'markerMinWidth',
    'gapWidth',
    'marginLeft',
    'itemSpacing',
  ],
  listItem: [...TEXT],
  codeBlock: [
    ...TEXT,
    ...MARGIN,
    'backgroundColor',
    'borderColor',
    'borderWidth',
    'borderRadius',
    'padding',
    'syntax',
  ],
  codeBlockHeader: [
    'color',
    'fontFamily',
    'fontSize',
    'lineHeight',
    'backgroundColor',
    'borderBottomColor',
    'borderBottomWidth',
    'paddingHorizontal',
    'paddingVertical',
  ],
  table: [
    ...MARGIN,
    'borderColor',
    'borderWidth',
    'borderRadius',
    'align',
    'horizontalOverflow',
    'headerBackgroundColor',
    'headerColor',
    'headerFontFamily',
    'rowEvenBackgroundColor',
    'rowOddBackgroundColor',
  ],
  tableCell: [
    ...TEXT,
    'backgroundColor',
    'padding',
    'paddingHorizontal',
    'paddingVertical',
  ],
  divider: [...MARGIN, 'backgroundColor', 'height'],
  image: [
    ...MARGIN,
    'borderRadius',
    'aspectRatio',
    'height',
    'maxHeight',
    'resizeMode',
  ],
  inlineImage: ['size'],
  htmlBlock: ['color', 'fontFamily', 'fontSize', ...MARGIN],
  footnoteDefinition: ['color', 'fontSize', 'lineHeight', 'highlightColor'],
  checkbox: [
    'color',
    'checkedColor',
    'size',
    'borderColor',
    'checkmarkColor',
    'borderRadius',
    'checkedText',
  ],
  strong: ['color', 'fontFamily', 'fontWeight'],
  em: ['color', 'fontFamily', 'fontStyle'],
  strikethrough: ['color'],
  underline: ['color'],
  highlight: ['color', 'backgroundColor'],
  link: [
    'color',
    'fontFamily',
    'fontWeight',
    'textDecorationLine',
    'backgroundColor',
    'variants',
  ],
  inlineCode: ['color', 'fontFamily', 'fontSize', 'backgroundColor'],
  kbd: ['color', 'fontFamily', 'fontSize', 'backgroundColor'],
  superscript: ['color', 'fontScale'],
  subscript: ['color', 'fontScale'],
  footnoteReference: ['color', 'fontScale'],
  footnoteBackLink: ['color'],
};

const ACCEPTED_SETS = new Map<string, ReadonlySet<string>>(
  Object.entries(ACCEPTED).map(([key, props]) => [
    key,
    new Set<string>(props as readonly string[]),
  ])
);
const SYNTAX_TYPES: ReadonlySet<string> = new Set(SYNTAX_TOKEN_TYPES);

/** `__DEV__` as React Native and Jest define it; false when absent. */
function isDev(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

const warned = new Set<string>();

function warnOnce(path: string, message: string): void {
  if (warned.has(path)) return;
  warned.add(path);
  console.warn(`[react-native-markdown] ${message}`);
}

function checkBlock(block: unknown): void {
  if (typeof block !== 'object' || block === null) return;
  for (const [key, props] of Object.entries(block)) {
    // Not a core key: a plugin's (unknown to the resolver) or `dark`/`light`.
    const accepted = ACCEPTED_SETS.get(key);
    if (accepted === undefined) continue;
    if (typeof props !== 'object' || props === null) continue;
    for (const [prop, value] of Object.entries(props)) {
      if (!accepted.has(prop)) {
        warnOnce(
          `${key}.${prop}`,
          `theme: "${prop}" is not a prop of "${key}" and is ignored.`
        );
      } else if (
        key === 'codeBlock' &&
        prop === 'syntax' &&
        typeof value === 'object' &&
        value !== null
      ) {
        for (const type of Object.keys(value)) {
          if (!SYNTAX_TYPES.has(type)) {
            warnOnce(
              `codeBlock.syntax.${type}`,
              `theme: "${type}" is not a syntax token type and is ignored.`
            );
          }
        }
      }
    }
  }
}

/**
 * Warns (console.warn, once per distinct `key.prop`) about unknown props of
 * core keys in a theme input and its `dark`/`light` blocks. Does nothing
 * outside `__DEV__`. Called on a resolve miss only, never on a cache hit.
 */
export function warnUnknownThemeProps(input: object): void {
  if (!isDev()) return;
  checkBlock(input);
  const { dark, light } = input as { dark?: unknown; light?: unknown };
  checkBlock(dark);
  checkBlock(light);
}

/** Forgets which warnings were shown. For tests. */
export function resetThemeWarnings(): void {
  warned.clear();
}
