import { type Extension } from 'mdast-util-from-markdown';
import type { Definition, Root, RootContent } from 'mdast';

/**
 * Normalizes an identifier by trimming whitespace and converting it to lowercase.
 *
 * @param id - The identifier to be normalized.
 * @returns The normalized identifier.
 */

function normalizeIdentifier(id: string): string {
  return id.trim().toLowerCase();
}
/**
 * Recursively transforms `linkReference` and `imageReference` nodes in the
 * given Markdown Abstract Syntax Tree (AST) to `link` and `image` nodes
 * respectively, by using the definitions provided. If a reference does
 * not have a corresponding definition, it is left unchanged.
 *
 * @param node - The root or content node of the Markdown AST to transform.
 * @param definitions - A map of identifier strings to their corresponding
 * definition nodes, used to resolve references.
 */

const transform = (
  node: RootContent | Root,
  definitions: Map<string, Definition>
): void => {
  if (node.type === 'linkReference' || node.type === 'imageReference') {
    const def = definitions.get(normalizeIdentifier(node.identifier));
    if (!def) return;

    if (node.type === 'linkReference') {
      const linkNode: any = node;
      linkNode.type = 'link';
      linkNode.url = def.url;
      linkNode.title = def.title ?? null;
    }

    if (node.type === 'imageReference') {
      const imageNode: any = node;
      imageNode.type = 'image';
      imageNode.url = def.url;
      imageNode.title = def.title ?? null;
    }
  }

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      transform(child, definitions);
    }
  }
};

/**
 * An extension that resolves link and image references to their definitions.
 * It modifies the tree in place, replacing linkReference and imageReference nodes
 * with link and image nodes, respectively, using the URL and title from the definition.
 *
 * The extension also removes the original definition nodes from the tree.
 *
 * @returns An extension that resolves link and image references.
 */
export function resolveReference(): Extension {
  return {
    transforms: [
      (tree) => {
        const definitions = new Map<string, Definition>();

        // Store definitions and their indices
        // This is necessary because we will modify the tree and need to remove these nodes later
        // without affecting the indices of other nodes.
        const definitionIndices: number[] = [];

        // Collect all definitions in the tree
        // and store them in a map for quick access.
        // Also, collect their indices for later removal.
        for (const node of tree.children) {
          if (node.type === 'definition') {
            definitions.set(normalizeIdentifier(node.identifier), node);
            definitionIndices.push(tree.children.indexOf(node));
          }
        }

        // If there are no definitions, we can skip the transformation
        if (definitions.size === 0) return;

        // Transform the tree by replacing linkReference and imageReference nodes
        transform(tree, definitions);

        // Remove the original definition nodes (in reverse to avoid index shift)
        for (const index of definitionIndices.reverse()) {
          tree.children.splice(index, 1);
        }
      },
    ],
  };
}
