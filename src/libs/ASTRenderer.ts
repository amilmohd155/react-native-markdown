import type { Node, Root, RootContentMap } from 'mdast';
import defaultRenderRules from './renderRules';
import { getKey } from '../utils/getKey';
import type { ExpandUnion } from '../types/utils';
import { getMergedStyles, type StyleMap } from '../utils/getMergedStyles';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type BaseNodeKeys = {
  [K in keyof RootContentMap]: RootContentMap[K] extends Node ? K : never;
}[keyof RootContentMap];

// type RootContentMapExcludeHeading = Omit<RootContentMap, 'heading'>;

type ValidNodeKey = ExpandUnion<
  | BaseNodeKeys
  | 'unknown'
  | 'root'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
>;

// type ValidNodeKey =
//   | {
//       [K in keyof RootContentMap]: RootContentMap[K] extends Node ? K : never;
//     }[keyof RootContentMap]
//   | 'unknown'
//   | 'root'
//   | 'heading1'
//   | 'heading2'
//   | 'heading3'
//   | 'heading4'
//   | 'heading5'
//   | 'heading6';

type NodeTypeMap = Prettify<
  {
    [K in BaseNodeKeys]: RootContentMap[K];
  } & {
    heading1: RootContentMap['heading'];
    heading2: RootContentMap['heading'];
    heading3: RootContentMap['heading'];
    heading4: RootContentMap['heading'];
    heading5: RootContentMap['heading'];
    heading6: RootContentMap['heading'];
    unknown: Node;
    root: Root;
  }
>;

// export type RenderFunction = (
//   node: Node,
//   children: any[],
//   parentStack: Node[],
//   styles: NamedStyle,
//   key?: string | number,
//   ...extras: any[]
// ) => any;

export type RenderFunction<K extends ValidNodeKey = ValidNodeKey> = (
  node: NodeTypeMap[K],
  key: string,
  styles: StyleMap,
  children: any[],
  parentStack: Node[],
  ...extras: any[]
) => any;

// export type RenderRules = Record<string, RenderFunction>;
export type RenderRules = {
  [K in ValidNodeKey]?: RenderFunction<K>;
};

export default class ASTRenderer {
  private _renderRules: RenderRules;
  private _styles: StyleMap;
  private _debug: boolean;

  constructor({
    renderRules,
    styles = null,
    debug = false,
  }: {
    renderRules?: RenderRules;
    styles?: StyleMap | null;
    debug?: boolean;
  }) {
    this._renderRules = renderRules ?? defaultRenderRules;
    this._styles = getMergedStyles(styles, true);

    this._debug = debug;
  }

  private debugLog(length: number, type: string) {
    if (this._debug) {
      console.log(`${' '.repeat(length)}${type}`);
    }
  }

  private getRenderFunction(type: keyof RenderRules): RenderFunction {
    const fn = this._renderRules[type];

    if (!fn) {
      console.warn(`Missing render rule for node type: ${type}`);
      return (this._renderRules.unknown ?? (() => null)) as RenderFunction;
    }

    return fn as RenderFunction;
  }

  private renderNode = (
    node: Node,
    parentStack: Node[] = [],
    extras?: Record<string, any>
  ): any => {
    const children: any[] = [];
    let type = node.type as ValidNodeKey;

    if (type === 'heading' && 'depth' in node) {
      type = `heading${node.depth}` as ValidNodeKey;
      node.type = type;
    }

    if ('children' in node && Array.isArray(node.children)) {
      if (type === 'list') {
        const listNode = node as import('mdast').List;
        const start = listNode.start ?? 1;
        const ordered = listNode.ordered ?? false;

        for (let i = 0; i < listNode.children.length; i++) {
          const listItemNode = listNode.children[i];
          const bullet = ordered ? `${start + i}.` : `•`;

          if (!listItemNode) {
            console.warn(`Skipping empty list item at index: ${i}`);
            continue;
          }

          const renderedChild = this.renderNode(
            listItemNode,
            [node, ...parentStack],
            { bullet, index: i, ordered, start }
          );

          children.push(renderedChild);
        }
      } else {
        for (const child of node.children) {
          children.push(this.renderNode(child, [node, ...parentStack]));
        }
      }
    }

    if (
      type === 'definition' ||
      type === 'imageReference' ||
      type === 'linkReference' ||
      type === 'table' ||
      type === 'tableCell' ||
      type === 'tableRow'
    ) {
      // console.warn(`Skipping unsupported node type: ${type}`);
      return null;
    }

    const renderFunction = this.getRenderFunction(type);
    this.debugLog(parentStack.length, type);

    return renderFunction(
      node as NodeTypeMap[typeof type],
      getKey(node),
      this._styles,
      children,
      parentStack,
      extras
    );
  };

  public render = (tree: Root): any => {
    const comp = this.renderNode(tree);

    return comp;
  };
}
