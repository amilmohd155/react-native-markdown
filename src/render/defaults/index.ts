import type { Components } from '../elements';
import {
  Blockquote,
  CodeBlock,
  Divider,
  FootnoteDefinition,
  Heading,
  HtmlBlock,
  Image,
  List,
  ListItem,
  Paragraph,
  Table,
  TableCell,
  TableRow,
} from './block';
import {
  Emphasis,
  FootnoteReference,
  Highlight,
  HtmlInline,
  InlineCode,
  InlineImage,
  Kbd,
  LineBreak,
  Link,
  Strikethrough,
  Strong,
  Subscript,
  Superscript,
  Underline,
} from './inline';

/**
 * The built-in element components: the first layer of the component map
 * (defaults → plugins → `components` prop, M5). Exported publicly as
 * `defaults` in M5, so users can wrap them.
 */
export const defaultComponents: Components = Object.freeze({
  Heading,
  Paragraph,
  Blockquote,
  List,
  ListItem,
  CodeBlock,
  Table,
  TableRow,
  TableCell,
  Divider,
  Image,
  HtmlBlock,
  FootnoteDefinition,
  Strong,
  Emphasis,
  Strikethrough,
  InlineCode,
  Link,
  InlineImage,
  LineBreak,
  FootnoteReference,
  Underline,
  Highlight,
  Superscript,
  Subscript,
  Kbd,
  HtmlInline,
});

/**
 * The public name of `defaultComponents`: the built-in components, so a
 * custom component can wrap one:
 * `props.language === 'mermaid' ? <Mermaid /> : <defaults.CodeBlock {...props} />`.
 * Spec: docs/rewrite/04-api.md#wrapping-a-default
 */
export const defaults: Components = defaultComponents;
