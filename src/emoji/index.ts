import { definePlugin, type MarkdownPlugin } from '../plugins/definePlugin';
import { DEFAULT_EMOJI } from './defaults';
import { emojiRule } from './rule';

/** Options for {@link emoji}. */
export type EmojiOptions = {
  /** Resolves a shortcode name (without colons) to text. Consulted first. Must be sync and pure. */
  resolve?: (name: string) => string | undefined;
  /** Extra names, consulted after `resolve`. */
  map?: Readonly<Record<string, string>>;
  /** Use the built-in table of common names, last. Default `true`. */
  defaults?: boolean;
};

const own = (
  table: Readonly<Record<string, string>>,
  name: string
): string | undefined =>
  Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;

/**
 * `:name:` becomes the Unicode character at parse time (P3-23). No node: the
 * result is plain text. The plugin name is always `'emoji'`: the resolver is
 * not part of the parse-context string, so changing it does not invalidate a
 * cached parse.
 */
export function emoji(options: EmojiOptions = {}): MarkdownPlugin {
  const { resolve, map, defaults = true } = options;
  const lookup = (name: string): string | undefined =>
    resolve?.(name) ??
    (map ? own(map, name) : undefined) ??
    (defaults ? own(DEFAULT_EMOJI, name) : undefined);

  return definePlugin({
    name: 'emoji',
    syntax: { markdownIt: (md) => emojiRule(md, lookup) },
  });
}
