import type { Node, Root } from 'mdast';
import defaultRenderRules from '../libs/renderRules';
import { getMergedStyles } from '../utils/getMergedStyles';
import type { ReactElement } from 'react';
import type { StyleMap } from '../types/style.types';
import type {
  ASTRendererOptions,
  ListBulletStyle,
  NodeTypeMap,
  RenderFunction,
  RenderRules,
  ValidNodeKey,
} from './ASTRenderer.types';

export default class ASTRenderer {
  private _renderRules: RenderRules;
  private _styles: StyleMap;
  private _debug: boolean;
  private _listBulletStyle: ListBulletStyle;
  private _customBulletElement: ReactElement | null;
  private _onLinkPress?: (url: string) => void;

  constructor({
    renderRules,
    styles = null,
    debug = false,
    listBulletStyle = 'disc',
    customBulletElement = null,
    onLinkPress,
  }: ASTRendererOptions) {
    this._renderRules = this.fallbackMerge(defaultRenderRules, renderRules);
    this._styles = getMergedStyles(styles, true);
    this._listBulletStyle = listBulletStyle;
    this._debug = debug;

    this._onLinkPress = onLinkPress;

    this._customBulletElement = customBulletElement;
  }

  private fallbackMerge(
    defaults: RenderRules,
    overrides?: Partial<RenderRules>
  ): RenderRules {
    return {
      ...Object.fromEntries(
        Object.entries(defaults).filter(([key]) => !(key in (overrides ?? {})))
      ),
      ...(overrides ?? {}),
    };
  }

  private get getListBulletCharacter() {
    switch (this._listBulletStyle) {
      case 'disc':
        return '\u2022'; // Unicode for bullet character
      case 'dash':
        return '-';
    }
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

    if (type === 'link' && this._onLinkPress) {
      extras = {
        ...extras,
        onPress: this._onLinkPress,
      };
    }

    if ('children' in node && Array.isArray(node.children)) {
      if (type === 'list') {
        const listNode = node as import('mdast').List;
        const start = listNode.start ?? 1;
        const ordered = listNode.ordered ?? false;

        for (let i = 0; i < listNode.children.length; i++) {
          const listItemNode = listNode.children[i];
          const listStyleType = ordered
            ? `${start + i}.`
            : this.getListBulletCharacter;

          const customListStyleType = !ordered && this._customBulletElement;

          if (!listItemNode) {
            console.warn(`Skipping empty list item at index: ${i}`);
            continue;
          }

          const renderedChild = this.renderNode(
            listItemNode,
            [node, ...parentStack],
            { listStyleType, index: i, ordered, start, customListStyleType }
          );

          children.push(renderedChild);
        }
      } else {
        for (const child of node.children) {
          children.push(this.renderNode(child, [node, ...parentStack]));
        }
      }
    }

    if (type === 'table' || type === 'tableCell' || type === 'tableRow') {
      console.warn(`Skipping unsupported node type: ${type}`);
      return null;
    }

    const renderFunction = this.getRenderFunction(type);
    this.debugLog(parentStack.length, type);

    return renderFunction({
      node: node as NodeTypeMap[typeof type],
      styles: this._styles,
      children,
      parentStack,
      extras,
    });
  };

  public render = (tree: Root): any => {
    const comp = this.renderNode(tree);

    return comp;
  };
}
