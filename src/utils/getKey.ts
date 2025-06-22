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

export function getKeyFromMarkdown(): Extension {
  return {
    transforms: [
      (tree) => {
        // Recursively add keys to all nodes in the tree
        addKeysRecursively(tree);
        // visit(tree, (node) => {
        //   if (node && node.position) {
        //     (node as any).key = getKey(node);
        //   }
        // });
      },
    ],
  };
}
