import {
  Flag,
  hasFlag,
  isBuiltInInline,
  NodeType,
  nodeTypeName,
  PLUGIN_NODE_TYPE_MAX,
  PLUGIN_NODE_TYPE_MIN,
} from '../types';

describe('NodeType', () => {
  const ids = Object.values(NodeType);

  it('has unique ids that fit the Uint8 column below the plugin range', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(PLUGIN_NODE_TYPE_MIN);
    }
    expect(PLUGIN_NODE_TYPE_MAX).toBe(255);
  });

  it('matches the ids in token-mapping.md', () => {
    expect(NodeType).toMatchObject({
      Root: 0,
      Heading: 1,
      FootnoteDefinition: 15,
      Text: 32,
      Image: 38,
      FootnoteReference: 46,
    });
  });

  it('classifies built-in inline types', () => {
    expect(isBuiltInInline(NodeType.Paragraph)).toBe(false);
    expect(isBuiltInInline(NodeType.Root)).toBe(false);
    expect(isBuiltInInline(NodeType.Text)).toBe(true);
    expect(isBuiltInInline(NodeType.FootnoteReference)).toBe(true);
    expect(isBuiltInInline(PLUGIN_NODE_TYPE_MIN)).toBe(false);
  });

  it('names types for debugging', () => {
    expect(nodeTypeName(NodeType.Heading)).toBe('Heading');
    expect(nodeTypeName(130)).toBe('Plugin(130)');
    expect(nodeTypeName(99)).toBe('Unknown(99)');
  });
});

describe('Flag', () => {
  const bits = Object.values(Flag);

  it('uses one distinct bit per flag, all within Uint8', () => {
    expect(bits.reduce((a, b) => a | b, 0)).toBe(0xff);
    expect(new Set(bits).size).toBe(8);
    for (const bit of bits) expect(bit & (bit - 1)).toBe(0);
  });

  it('tests flags', () => {
    const flags = Flag.ORDERED | Flag.TIGHT;
    expect(hasFlag(flags, Flag.ORDERED)).toBe(true);
    expect(hasFlag(flags, Flag.TIGHT)).toBe(true);
    expect(hasFlag(flags, Flag.TASK)).toBe(false);
  });
});
