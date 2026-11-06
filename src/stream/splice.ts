import type { NodeTable } from '../model';
import type { SpliceTables } from './types';

/**
 * Table splice (phase 2 S1.3, P2-2 option A: copy). See `SpliceTables` in
 * `./types` for the contract.
 *
 * Layout notes the contract leaves implicit:
 * - Every table has one root (id 0). The result keeps the prefix's root; the
 *   tail's root is dropped and its children are re-parented onto it, so the
 *   result has the same shape (and ids) as a full parse of the source.
 * - Prefix columns may be longer than `count`, and the prefix's open block
 *   (index `stableCount`, onward) is dropped: only nodes below
 *   `prefix.blocks[stableCount]` are kept.
 * - `strings` / `attrs` are appended in node order, so the kept prefix uses
 *   a leading run of each; the rest belonged to dropped nodes.
 */
export const spliceTables: SpliceTables = (
  prefix,
  stableCount,
  tail,
  prefixId
): NodeTable => {
  if (
    !Number.isInteger(stableCount) ||
    stableCount < 0 ||
    stableCount > prefix.blockCount
  ) {
    throw new RangeError(
      `stableCount ${stableCount} is outside [0, ${prefix.blockCount}]`
    );
  }

  // Nodes [0, keep) belong to the prefix root plus blocks [0, stableCount).
  const keep =
    stableCount < prefix.blockCount
      ? prefix.blocks[stableCount]!
      : prefix.count;
  const tailNodes = Math.max(tail.count - 1, 0); // without the tail root
  const shift = keep - 1; // tail id t >= 1 becomes t + shift
  const count = keep + tailNodes;

  let stringCut = 0;
  let attrCut = 0;
  for (let i = 0; i < keep; i++) {
    const t = prefix.text[i]!;
    if (t >= stringCut) stringCut = t + 1;
    const a = prefix.attr[i]!;
    if (a >= attrCut) attrCut = a + 1;
  }

  const type = new Uint8Array(count);
  const flags = new Uint8Array(count);
  const parent = new Int32Array(count);
  const firstChild = new Int32Array(count);
  const nextSibling = new Int32Array(count);
  const text = new Int32Array(count);
  const attr = new Int32Array(count);

  type.set(prefix.type.subarray(0, keep));
  flags.set(prefix.flags.subarray(0, keep));
  parent.set(prefix.parent.subarray(0, keep));
  firstChild.set(prefix.firstChild.subarray(0, keep));
  nextSibling.set(prefix.nextSibling.subarray(0, keep));
  text.set(prefix.text.subarray(0, keep));
  attr.set(prefix.attr.subarray(0, keep));

  type.set(tail.type.subarray(1, tail.count), keep);
  flags.set(tail.flags.subarray(1, tail.count), keep);
  const remap = (v: number) => (v <= 0 ? v : v + shift);
  for (let t = 1; t < tail.count; t++) {
    const i = t + shift;
    parent[i] = remap(tail.parent[t]!);
    firstChild[i] = remap(tail.firstChild[t]!);
    nextSibling[i] = remap(tail.nextSibling[t]!);
    const s = tail.text[t]!;
    text[i] = s < 0 ? s : s + stringCut;
    const a = tail.attr[t]!;
    attr[i] = a < 0 ? a : a + attrCut;
  }

  // Re-link the top-level sibling chain across the seam.
  const firstTail = tail.count > 1 ? remap(tail.firstChild[0]!) : -1;
  if (stableCount > 0) nextSibling[prefix.blocks[stableCount - 1]!] = firstTail;
  else firstChild[0] = firstTail;

  const blockCount = stableCount + tail.blockCount;
  const blocks = new Int32Array(blockCount);
  const blockStart = new Int32Array(blockCount);
  const blockEnd = new Int32Array(blockCount);
  blocks.set(prefix.blocks.subarray(0, stableCount));
  blockStart.set(prefix.blockStart.subarray(0, stableCount));
  blockEnd.set(prefix.blockEnd.subarray(0, stableCount));
  for (let b = 0; b < tail.blockCount; b++) {
    blocks[stableCount + b] = remap(tail.blocks[b]!);
  }
  blockStart.set(tail.blockStart.subarray(0, tail.blockCount), stableCount);
  blockEnd.set(tail.blockEnd.subarray(0, tail.blockCount), stableCount);

  return {
    count,
    type,
    flags,
    parent,
    firstChild,
    nextSibling,
    text,
    attr,
    strings: prefix.strings.slice(0, stringCut).concat(tail.strings),
    attrs: prefix.attrs.slice(0, attrCut).concat(tail.attrs),
    pluginNodes: tail.pluginNodes,
    blockCount,
    blocks,
    blockStart,
    blockEnd,
    blockContext: prefix.blockContext
      .slice(0, stableCount)
      .concat(tail.blockContext.slice(0, tail.blockCount)),
    source: tail.source,
    context: tail.context,
    prefixId,
    stableCount,
  };
};
