import { definePlugin } from '../plugins/definePlugin';
import { Mention, type MentionAttrs } from './Mention';
import { mentionRule } from './rule';

export { useMentionPress } from './Mention';
export type { MentionAttrs } from './Mention';

/** Options for {@link mentions}. */
export type MentionsOptions = {
  /**
   * Link schemes that become mentions, matched case-insensitively:
   * `['user']` turns `[@Alice](user://alice)` into a mention.
   */
  schemes: string[];
};

/**
 * `[label](scheme://id)` becomes a `Mention` node at parse time. The sorted
 * schemes are the plugin's `contextKey`, so a different set invalidates a
 * cached parse.
 */
export function mentions(options?: MentionsOptions) {
  const schemes = [
    ...new Set((options?.schemes ?? []).map((s) => s.toLowerCase())),
  ].sort();
  const set: ReadonlySet<string> = new Set(schemes);
  return definePlugin<'mentions', { Mention: MentionAttrs }>({
    name: 'mentions',
    contextKey: JSON.stringify(schemes),
    syntax: { markdownIt: (md) => mentionRule(md, set) },
    nodes: {
      Mention: {
        kind: 'inline',
        token: 'mention',
        from: (token) => ({
          scheme: String(token.attrGet('scheme') ?? ''),
          id: String(token.attrGet('id') ?? ''),
          label: String(token.attrGet('label') ?? ''),
          url: String(token.attrGet('url') ?? ''),
        }),
      },
    },
    components: { Mention },
  });
}
