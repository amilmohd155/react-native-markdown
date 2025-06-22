import type { Node, Parent } from 'mdast';
import type { Extension } from 'mdast-util-from-markdown';

function getKey(node: Node): string {
  const { start, end } = node.position ?? {};

  if (start && end) {
    return `${node.type}-${start.line}:${start.column}-${end.line}:${end.column}`;
  }

  // fallback in case position is not available (e.g., synthetic or malformed nodes)
  return `${node.type}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Recursively traverses the mdast tree starting at `node` and sets the `key` property
 * on each node to a string that represents the node's position in the source document.
 *
 * The `key` property is a string with the following format:
 * `${type}-${startLine}:${startColumn}-${endLine}:${endColumn}`
 * where `startLine`, `startColumn`, `endLine`, and `endColumn` are the
 * coordinates of the node's position in the source document.
 *
 * If the node does not have a `position` property (e.g. synthetic or malformed nodes),
 * the `key` property is set to a random string.
 */
function addKeysRecursively(node: Node): void {
  if (node.position) {
    node.key = getKey(node);
  }

  if ('children' in node && Array.isArray((node as Parent).children)) {
    for (const child of (node as Parent).children) {
      addKeysRecursively(child);
    }
  }
}

/**
 * Returns an extension that adds a `key` property to all nodes in the mdast
 * tree, which is a string that represents the node's position in the source
 * document. This is useful for e.g. differentiating between nodes with the same
 * type and value.
 *
 * The `key` property is a string with the following format:
 * `${type}-${startLine}:${startColumn}-${endLine}:${endColumn}`
 * where `startLine`, `startColumn`, `endLine`, and `endColumn` are the
 * coordinates of the node's position in the source document.
 *
 * If the node does not have a `position` property (e.g. synthetic or malformed
 * nodes), the `key` property is set to a random string.
 *
 * This extension is useful when serializing and deserializing mdast nodes,
 * since the `key` property can be used to identify nodes.
 */
export function getKeyFromMarkdown(): Extension {
  return {
    transforms: [
      (tree) => {
        addKeysRecursively(tree);
      },
    ],
  };
}
