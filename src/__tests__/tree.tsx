import { act, type ReactElement } from 'react';
import { createRoot, type JsonElement, type TestInstance } from 'test-renderer';

export type { JsonElement, TestInstance };
/** A host element, or a text string. */
export type TestNode = TestInstance | string;
/** A host type (`'Text'`, `'Paragraph'`) or a predicate. */
export type Match = string | ((node: TestInstance) => boolean);

/**
 * Structure-test helper on `test-renderer` (the renderer under
 * `@testing-library/react-native`), for tests that look at the tree itself:
 * which host elements render, with which props. Tests of what a user sees or
 * does use `@testing-library/react-native` (`render`, `screen`, `fireEvent`).
 *
 * Unlike RNTL, it accepts text inside any host element, so tests can use
 * made-up host names such as `hostComponents()` produces. Everything is async,
 * as in React 19's `act`.
 */
export interface Tree {
  /** The root container: query from here. */
  readonly container: TestInstance;
  rerender(element: ReactElement): Promise<void>;
  unmount(): Promise<void>;
  /** Every host element below the container that matches, in tree order. */
  findAll(match: Match): TestInstance[];
  /** The only host element that matches; throws for none or several. */
  find(match: Match): TestInstance;
  /**
   * The rendered tree as `react-test-renderer`'s `toJSON()` returned it: the
   * single root element, an array for several roots, or `null`.
   */
  toJSON(): JsonElement | JsonElement[] | null;
}

const predicate = (match: Match) =>
  typeof match === 'string'
    ? (node: TestInstance) => node.type === match
    : match;

/** Descendants of `node` matching `match` (not `node` itself). */
export function findAll(node: TestInstance, match: Match): TestInstance[] {
  return node.queryAll(predicate(match));
}

/** The only descendant of `node` matching `match`; throws for none or several. */
export function find(node: TestInstance, match: Match): TestInstance {
  const found = findAll(node, match);
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one match, found ${found.length} (${String(match)})`
    );
  }
  return found[0]!;
}

/** All the text below `node`, concatenated. */
export function textOf(node: TestNode): string {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
}

const mounted = new Set<{ unmount(): void }>();
afterEach(async () => {
  for (const root of mounted) await act(async () => root.unmount());
  mounted.clear();
});

/** Renders `element` and returns the tree. Unmounts after each test. */
export async function renderTree(element: ReactElement): Promise<Tree> {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot();
  let unmounted = false;
  mounted.add(root);
  await act(async () => root.render(element));
  return {
    container: root.container,
    async rerender(next) {
      await act(async () => root.render(next));
    },
    async unmount() {
      unmounted = true;
      mounted.delete(root);
      await act(async () => root.unmount());
    },
    findAll: (match) => findAll(root.container, match),
    find: (match) => find(root.container, match),
    toJSON() {
      if (unmounted) return null;
      const json = root.container.children.map((child) =>
        typeof child === 'string' ? child : child.toJSON()
      ) as JsonElement[];
      if (json.length === 0) return null;
      return json.length === 1 ? json[0]! : json;
    },
  };
}
