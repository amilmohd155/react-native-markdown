import { admonitions } from '@docren/react-native-markdown/admonitions';
import { mentions } from '@docren/react-native-markdown/mentions';

/**
 * The plugins every example screen uses. Module-level so a `parse()`, a
 * `useMarkdownStream()` and the `<Markdown>` or `useMarkdownBlocks()` that
 * renders their document share one plugin identity: a document parsed with a
 * plugin must be rendered with it too, or its nodes have no component.
 */
export const PLUGINS = [
  mentions({ schemes: ['user', 'channel'] }),
  admonitions(),
];
