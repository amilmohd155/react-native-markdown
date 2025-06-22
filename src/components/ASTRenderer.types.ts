import type { Node, Root, RootContentMap } from 'mdast';
import type { ExpandUnion, Prettify } from '../types/utils';
import type { StyleMap } from '../types/style.types';
import type { ReactElement } from 'react';

type BaseNodeKeys = {
  [K in keyof RootContentMap]: RootContentMap[K] extends Node ? K : never;
}[keyof RootContentMap];

type ValidNodeKey = ExpandUnion<BaseNodeKeys | 'unknown' | 'root'>;

type NodeTypeMap = Prettify<
  {
    [K in BaseNodeKeys]: RootContentMap[K];
  } & {
    unknown: Node;
    root: Root;
  }
>;

type RenderFunction<K extends ValidNodeKey = ValidNodeKey> = (params: {
  node: NodeTypeMap[K];
  styles: StyleMap;
  children: any[];
  parentStack: Node[];
  extras?: any;
}) => any;

type RenderRules = {
  [K in ValidNodeKey]?: RenderFunction<K>;
};

type ListBulletStyle = 'disc' | 'dash';

interface ASTRendererOptions {
  renderRules?: RenderRules;
  styles?: StyleMap | null;
  debug?: boolean;
  listBulletStyle?: ListBulletStyle;
  customBulletElement?: ReactElement | null;
}

export type {
  RenderFunction,
  RenderRules,
  ListBulletStyle,
  ASTRendererOptions,
  ValidNodeKey,
  NodeTypeMap,
};
