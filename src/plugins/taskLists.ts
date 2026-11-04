import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** `meta.task` on a `list_item_open` token, read by the converter. */
export interface TaskMeta {
  readonly checked: boolean;
}

/** `[ ]`, `[x]` or `[X]` (a tab also counts as blank), then whitespace or the end of the text. */
const MARKER = /^\[([ \txX])\]([ \t]|$)/;

/**
 * GFM task list items, as a markdown-it core rule after `inline`.
 * Spec: GFM spec "Task list items (extension)", token-mapping.md#task-lists
 *
 * An item is a task when its first block is a paragraph that starts with a
 * task list item marker followed by whitespace. The marker and one
 * whitespace character are removed from the text; `meta.task` records the
 * state on `list_item_open`.
 *
 * Runs before `text_join`, so an escaped `\[ ]` (a `text_special` token)
 * is never a marker.
 */
export function gfmTaskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', taskLists);
}

function taskLists(state: StateCore): void {
  const { tokens } = state;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (
      tokens[i]!.type !== 'list_item_open' ||
      tokens[i + 1]!.type !== 'paragraph_open' ||
      tokens[i + 2]!.type !== 'inline'
    ) {
      continue;
    }
    const checked = stripMarker(tokens[i + 2]!.children);
    if (checked !== null) {
      const item = tokens[i]!;
      item.meta = { ...item.meta, task: { checked } satisfies TaskMeta };
    }
  }
}

/** Removes a leading marker; returns whether it was checked, or null if there is none. */
function stripMarker(children: Token[] | null): boolean | null {
  const first = children?.[0];
  if (!children || first?.type !== 'text') return null;
  const match = MARKER.exec(first.content);
  if (!match) return null;

  if (match[2] === '') {
    // `[ ]` ends the text: the whitespace must be a line ending after it,
    // with content on the next line (`- [ ]` alone is not a task).
    if (children[1]?.type !== 'softbreak') return null;
    children.splice(0, 2);
  } else {
    first.content = first.content.slice(match[0].length);
    if (first.content === '') children.shift();
  }
  return match[1] === 'x' || match[1] === 'X';
}
