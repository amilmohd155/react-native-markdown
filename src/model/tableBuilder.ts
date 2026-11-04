import type { NodeTable } from './nodeTable';
import { NodeType, type NodeAttrs } from './types';

/** Node id meaning "none" in the parent / child / sibling / text / attr columns. */
export const NONE = -1;

/** Root node id. Every table has exactly one root. */
export const ROOT = 0;

/** Block index columns, built by the block index (M1 task 3). */
export interface BlockIndex {
  readonly blockCount: number;
  readonly blocks: Int32Array;
  readonly blockStart: Int32Array;
  readonly blockEnd: Int32Array;
  readonly blockContext: readonly string[];
}

export const EMPTY_BLOCK_INDEX: BlockIndex = {
  blockCount: 0,
  blocks: new Int32Array(0),
  blockStart: new Int32Array(0),
  blockEnd: new Int32Array(0),
  blockContext: [],
};

const DEFAULT_CAPACITY = 256;

/**
 * Appends nodes to a growable struct-of-arrays table, in document order.
 *
 * - `add` takes positional arguments, so building a node allocates nothing
 *   beyond the optional text and attribute values.
 * - Children are linked in O(1) through a builder-only `lastChild` column.
 * - Columns grow by doubling; `finish` returns views trimmed to `count`.
 * - A builder produces one table. It can't be used after `finish`.
 */
export class TableBuilder {
  private capacity: number;
  private size = 0;
  private finished = false;

  private type: Uint8Array;
  private flags: Uint8Array;
  private parent: Int32Array;
  private firstChild: Int32Array;
  private nextSibling: Int32Array;
  private lastChild: Int32Array;
  private text: Int32Array;
  private attr: Int32Array;

  private readonly strings: string[] = [];
  private readonly attrs: NodeAttrs[] = [];

  constructor(initialCapacity = DEFAULT_CAPACITY) {
    this.capacity = Math.max(1, initialCapacity);
    this.type = new Uint8Array(this.capacity);
    this.flags = new Uint8Array(this.capacity);
    this.parent = new Int32Array(this.capacity);
    this.firstChild = new Int32Array(this.capacity);
    this.nextSibling = new Int32Array(this.capacity);
    this.lastChild = new Int32Array(this.capacity);
    this.text = new Int32Array(this.capacity);
    this.attr = new Int32Array(this.capacity);

    this.append(NodeType.Root, NONE, 0, null, null);
  }

  /** Number of nodes added so far, including the root. */
  get count(): number {
    return this.size;
  }

  /**
   * Adds a node as the last child of `parent` and returns its id.
   * Throws if `parent` doesn't exist yet.
   */
  add(
    type: number,
    parent: number,
    flags = 0,
    text: string | null = null,
    attrs: NodeAttrs | null = null
  ): number {
    this.assertOpen();
    if (parent < 0 || parent >= this.size) {
      throw new RangeError(`Parent node ${parent} does not exist`);
    }
    return this.append(type, parent, flags, text, attrs);
  }

  /** Last child of `id`, or `NONE`. Used to merge adjacent text runs. */
  lastChildOf(id: number): number {
    return this.lastChild[id]!;
  }

  typeOf(id: number): number {
    return this.type[id]!;
  }

  /** Sets flag bits on an existing node (e.g. `TIGHT` on a list). */
  addFlags(id: number, flags: number): void {
    this.assertOpen();
    this.flags[id] = this.flags[id]! | flags;
  }

  /** Appends to a node's text, creating it if absent. Used to merge text runs. */
  appendText(id: number, text: string): void {
    this.assertOpen();
    const index = this.text[id]!;
    if (index === NONE) {
      this.text[id] = this.strings.push(text) - 1;
    } else {
      this.strings[index] += text;
    }
  }

  /** Replaces a node's attributes (e.g. a heading's slug, set after its text). */
  setAttrs(id: number, attrs: NodeAttrs): void {
    this.assertOpen();
    const index = this.attr[id]!;
    if (index === NONE) {
      this.attr[id] = this.attrs.push(attrs) - 1;
    } else {
      this.attrs[index] = attrs;
    }
  }

  /**
   * Freezes the builder and returns the table, columns trimmed to `count`.
   * `source` and `context` feed block identity (`isSameBlock`, P1-9).
   */
  finish(
    blockIndex: BlockIndex = EMPTY_BLOCK_INDEX,
    source = '',
    context = ''
  ): NodeTable {
    this.assertOpen();
    this.finished = true;
    const n = this.size;
    return {
      count: n,
      type: this.type.subarray(0, n),
      flags: this.flags.subarray(0, n),
      parent: this.parent.subarray(0, n),
      firstChild: this.firstChild.subarray(0, n),
      nextSibling: this.nextSibling.subarray(0, n),
      text: this.text.subarray(0, n),
      attr: this.attr.subarray(0, n),
      strings: this.strings,
      attrs: this.attrs,
      source,
      context,
      ...blockIndex,
    };
  }

  private append(
    type: number,
    parent: number,
    flags: number,
    text: string | null,
    attrs: NodeAttrs | null
  ): number {
    if (this.size === this.capacity) this.grow();

    const id = this.size++;
    this.type[id] = type;
    this.flags[id] = flags;
    this.parent[id] = parent;
    this.firstChild[id] = NONE;
    this.nextSibling[id] = NONE;
    this.lastChild[id] = NONE;
    this.text[id] = text === null ? NONE : this.strings.push(text) - 1;
    this.attr[id] = attrs === null ? NONE : this.attrs.push(attrs) - 1;

    if (parent !== NONE) {
      const last = this.lastChild[parent]!;
      if (last === NONE) this.firstChild[parent] = id;
      else this.nextSibling[last] = id;
      this.lastChild[parent] = id;
    }
    return id;
  }

  private grow(): void {
    const capacity = this.capacity * 2;
    this.type = growUint8(this.type, capacity);
    this.flags = growUint8(this.flags, capacity);
    this.parent = growInt32(this.parent, capacity);
    this.firstChild = growInt32(this.firstChild, capacity);
    this.nextSibling = growInt32(this.nextSibling, capacity);
    this.lastChild = growInt32(this.lastChild, capacity);
    this.text = growInt32(this.text, capacity);
    this.attr = growInt32(this.attr, capacity);
    this.capacity = capacity;
  }

  private assertOpen(): void {
    if (this.finished) {
      throw new Error('TableBuilder was already finished');
    }
  }
}

function growUint8(column: Uint8Array, capacity: number): Uint8Array {
  const next = new Uint8Array(capacity);
  next.set(column);
  return next;
}

function growInt32(column: Int32Array, capacity: number): Int32Array {
  const next = new Int32Array(capacity);
  next.set(column);
  return next;
}
