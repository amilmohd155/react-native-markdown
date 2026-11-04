import type { ComponentType, ReactNode } from 'react';
import type { Align } from '../model';
import type { ElementName, ElementStyle } from '../theme';

/**
 * Semantic props of each built-in element.
 * Spec: docs/rewrite/04-api.md#element-catalog and
 * docs/rewrite/phase-1/element-props.md
 *
 * Plain values only (no table indexes, node ids or tokens), and `null`
 * rather than `undefined` for missing optional values, so shapes stay
 * stable and user `React.memo` components can bail out.
 */
interface WithChildren {
  readonly children: ReactNode;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ElementPropsMap {
  // Block
  Heading: WithChildren & { readonly level: HeadingLevel; readonly id: string };
  Paragraph: WithChildren;
  Blockquote: WithChildren;
  List: WithChildren & {
    readonly ordered: boolean;
    readonly start: number;
    readonly tight: boolean;
  };
  ListItem: WithChildren & {
    readonly index: number;
    readonly ordered: boolean;
    readonly marker: string;
    readonly checked: boolean | null;
  };
  CodeBlock: {
    readonly code: string;
    readonly language: string | null;
    readonly meta: string | null;
  };
  Table: WithChildren & { readonly align: readonly Align[] };
  TableRow: WithChildren & { readonly header: boolean; readonly index: number };
  TableCell: WithChildren & {
    readonly align: Align;
    readonly header: boolean;
    readonly column: number;
  };
  Divider: {};
  Image: {
    readonly src: string;
    readonly alt: string;
    readonly title: string | null;
  };
  HtmlBlock: { readonly html: string };
  FootnoteDefinition: WithChildren & {
    readonly label: string;
    readonly index: number;
    readonly references: number;
  };

  // Inline
  Strong: WithChildren;
  Emphasis: WithChildren;
  Strikethrough: WithChildren;
  InlineCode: { readonly code: string };
  Link: WithChildren & { readonly href: string; readonly title: string | null };
  InlineImage: {
    readonly src: string;
    readonly alt: string;
    readonly title: string | null;
    readonly width: number | null;
    readonly height: number | null;
  };
  LineBreak: { readonly hard: boolean };
  FootnoteReference: { readonly label: string; readonly index: number };
  Underline: WithChildren;
  Highlight: WithChildren;
  Superscript: WithChildren;
  Subscript: WithChildren;
  Kbd: WithChildren;
  HtmlInline: { readonly html: string };
}

/**
 * Props a component receives for element `K`: its semantic props plus
 * `style`, the resolved theme entry. Fails to compile if `ElementPropsMap`
 * misses an element name.
 */
export type ElementProps<K extends ElementName> = ElementPropsMap[K] & {
  readonly style: ElementStyle;
};

/** Inline elements: those rendered inside a block's <Text>. */
export type InlineElementName =
  | 'Strong'
  | 'Emphasis'
  | 'Strikethrough'
  | 'InlineCode'
  | 'Link'
  | 'InlineImage'
  | 'LineBreak'
  | 'FootnoteReference'
  | 'Underline'
  | 'Highlight'
  | 'Superscript'
  | 'Subscript'
  | 'Kbd'
  | 'HtmlInline';

/** A complete element → component map (defaults → plugins → `components`). */
export type Components = {
  readonly [K in ElementName]: ComponentType<ElementProps<K>>;
};
