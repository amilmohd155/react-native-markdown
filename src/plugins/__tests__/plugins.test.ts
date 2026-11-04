import type { MarkdownIt } from 'markdown-it';
import {
  Flag,
  isSameBlock,
  NodeType,
  PLUGIN_NODE_TYPE_MIN,
  type NodeTable,
} from '../../model';
import { getParser } from '../../parse/markdownIt';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks } from '../../parse/__tests__/dump';
import { definePlugin, type MarkdownPlugin } from '../definePlugin';
import { createRegistry } from '../registry';

// ── Test syntax ─────────────────────────────────────────────────────────

/** `$x$` → self-contained inline `math_inline` token. */
function mathInline(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false;
    const end = state.src.indexOf('$', state.pos + 1);
    if (end === -1) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = state.src.slice(state.pos + 1, end);
    }
    state.pos = end + 1;
    return true;
  });
}

/** `++x++` → inline container `ins_open` … `ins_close`. */
function insert(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'ins', (state, silent) => {
    if (!state.src.startsWith('++', state.pos)) return false;
    const end = state.src.indexOf('++', state.pos + 2);
    if (end === -1) return false;
    if (!silent) {
      const max = state.posMax;
      state.push('ins_open', 'ins', 1);
      state.pos += 2;
      state.posMax = end;
      state.md.inline.tokenize(state);
      state.posMax = max;
      state.push('ins_close', 'ins', -1);
    }
    state.pos = end + 2;
    return true;
  });
}

/** `:::kind` … `:::` → block container `container_note_open` … `_close`. */
function container(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'container_note',
    (state, start, end, silent) => {
      const lineText = (line: number) =>
        state.src.slice(
          state.bMarks[line]! + state.tShift[line]!,
          state.eMarks[line]
        );
      const match = /^:::(\w+)\s*$/.exec(lineText(start));
      if (!match) return false;
      if (silent) return true;
      let next = start + 1;
      while (next < end && lineText(next).trim() !== ':::') next++;

      const open = state.push('container_note_open', 'div', 1);
      open.meta = { kind: match[1] };
      open.map = [start, Math.min(next + 1, end)];
      const lineMax = state.lineMax;
      state.lineMax = next;
      state.md.block.tokenize(state, start + 1, next);
      state.lineMax = lineMax;
      state.push('container_note_close', 'div', -1);
      state.line = Math.min(next + 1, end);
      return true;
    }
  );
}

const math = definePlugin({
  name: 'math',
  syntax: { markdownIt: mathInline },
  nodes: {
    Math: {
      kind: 'inline',
      token: 'math_inline',
      inlineView: true,
      from: (token) => ({ tex: token.content }),
    },
  },
});

const ins = definePlugin({
  name: 'ins',
  syntax: { markdownIt: insert },
  nodes: { Insert: { kind: 'inline', token: 'ins', from: () => ({}) } },
});

const note = definePlugin({
  name: 'note',
  syntax: { markdownIt: container },
  nodes: {
    Note: {
      kind: 'block',
      token: 'container_note',
      from: (token) => ({
        kind: String((token.meta as { kind?: string } | null)?.kind),
      }),
    },
  },
});

const parse = (src: string, plugins: readonly MarkdownPlugin[]) =>
  parseWithMarkdownIt(src, { preset: 'commonmark', plugins });
const blocks = (src: string, plugins: readonly MarkdownPlugin[]) =>
  dumpBlocks(parse(src, plugins).table);

const typeOf = (table: NodeTable, name: string) =>
  PLUGIN_NODE_TYPE_MIN + table.pluginNodes.findIndex((n) => n.name === name);

// ── Tests ───────────────────────────────────────────────────────────────

describe('definePlugin', () => {
  it('returns the plugin unchanged', () => {
    const plugin = { name: 'x' };
    expect(definePlugin(plugin)).toBe(plugin);
  });
});

describe('plugin nodes in the converter', () => {
  it('maps a self-contained inline token, with props and INLINE_VIEW', () => {
    const { table } = parse('a $x^2$ b\n', [math]);
    expect(table.pluginNodes).toEqual([
      { name: 'Math', kind: 'inline', inlineView: true },
    ]);
    expect(blocks('a $x^2$ b\n', [math])).toEqual([
      {
        type: 'Paragraph',
        children: [
          { type: 'Text', text: 'a ' },
          {
            type: `Plugin(${PLUGIN_NODE_TYPE_MIN})`,
            flags: ['INLINE_VIEW'],
            attrs: { tex: 'x^2' },
          },
          { type: 'Text', text: ' b' },
        ],
      },
    ]);
  });

  it('maps an inline open/close pair to a container with children', () => {
    expect(blocks('a ++b *c*++ d\n', [ins])).toEqual([
      {
        type: 'Paragraph',
        children: [
          { type: 'Text', text: 'a ' },
          {
            type: `Plugin(${PLUGIN_NODE_TYPE_MIN})`,
            attrs: {},
            children: [
              { type: 'Text', text: 'b ' },
              { type: 'Emphasis', children: [{ type: 'Text', text: 'c' }] },
            ],
          },
          { type: 'Text', text: ' d' },
        ],
      },
    ]);
  });

  it('maps a block container and indexes it as a top-level block', () => {
    const src = 'before\n\n:::warning\ninside **x**\n:::\n\nafter\n';
    const { table, warnings } = parse(src, [note]);
    expect(warnings).toEqual([]);
    expect(dumpBlocks(table)).toEqual([
      { type: 'Paragraph', children: [{ type: 'Text', text: 'before' }] },
      {
        type: `Plugin(${PLUGIN_NODE_TYPE_MIN})`,
        attrs: { kind: 'warning' },
        children: [
          {
            type: 'Paragraph',
            children: [
              { type: 'Text', text: 'inside ' },
              { type: 'Strong', children: [{ type: 'Text', text: 'x' }] },
            ],
          },
        ],
      },
      { type: 'Paragraph', children: [{ type: 'Text', text: 'after' }] },
    ]);
    expect(table.blockCount).toBe(3);
    expect(table.type[table.blocks[1]!]).toBe(typeOf(table, 'Note'));
    expect(src.slice(table.blockStart[1]!, table.blockEnd[1]!)).toBe(
      ':::warning\ninside **x**\n:::\n'
    );
  });

  it('assigns type ids from 128 in plugin order', () => {
    const { table } = parse(':::a\n$x$ ++y++\n:::\n', [note, math, ins]);
    expect(table.pluginNodes.map((n) => n.name)).toEqual([
      'Note',
      'Math',
      'Insert',
    ]);
    expect(typeOf(table, 'Note')).toBe(128);
    expect(typeOf(table, 'Math')).toBe(129);
    expect(typeOf(table, 'Insert')).toBe(130);
  });

  it('treats a token of the other kind as unknown', () => {
    const wrongKind = definePlugin({
      name: 'math-as-block',
      syntax: { markdownIt: mathInline },
      nodes: {
        Math: { kind: 'block', token: 'math_inline', from: () => ({}) },
      },
    });
    const { table, warnings } = parse('$x$\n', [wrongKind]);
    expect(dumpBlocks(table)).toEqual([
      { type: 'Paragraph', children: [{ type: 'Text', text: 'x' }] },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"math_inline"');
  });

  it('still warns for plugin tokens nobody registered', () => {
    const syntaxOnly = definePlugin({
      name: 'math-syntax-only',
      syntax: { markdownIt: mathInline },
    });
    const { warnings } = parse('$x$\n', [syntaxOnly]);
    expect(warnings[0]).toContain('"math_inline"');
  });

  it('leaves tables without plugin nodes with an empty list', () => {
    expect(parse('x\n', []).table.pluginNodes).toEqual([]);
  });
});

describe('createRegistry', () => {
  const node = { kind: 'inline', token: 't', from: () => ({}) } as const;

  it('rejects duplicate and empty plugin names', () => {
    expect(() => createRegistry([{ name: 'a' }, { name: 'a' }])).toThrow(
      'Plugin "a" is registered twice'
    );
    expect(() => createRegistry([{ name: '' }])).toThrow('non-empty name');
  });

  it('rejects duplicate node names and tokens', () => {
    expect(() =>
      createRegistry([
        { name: 'a', nodes: { X: node } },
        { name: 'b', nodes: { X: { ...node, token: 'u' } } },
      ])
    ).toThrow('Node "X" is registered twice');
    expect(() =>
      createRegistry([{ name: 'a', nodes: { X: node, Y: node } }])
    ).toThrow('Token "t" is already mapped to node "X"');
  });

  it('allows the same token for a block and an inline node', () => {
    const registry = createRegistry([
      { name: 'a', nodes: { X: node, Y: { ...node, kind: 'block' } } },
    ]);
    expect(registry.inline('t')?.name).toBe('X');
    expect(registry.block('t')?.name).toBe('Y');
  });

  it('rejects inlineView on block nodes and unknown kinds', () => {
    expect(() =>
      createRegistry([
        {
          name: 'a',
          nodes: { X: { ...node, kind: 'block', inlineView: true } },
        },
      ])
    ).toThrow('inlineView is only valid on inline nodes');
    expect(() =>
      createRegistry([
        // Invalid kind on purpose (the internal plugin list type is erased).
        { name: 'a', nodes: { X: { ...node, kind: 'span' } } },
      ])
    ).toThrow("kind must be 'block' or 'inline'");
  });

  it('rejects more plugin nodes than the Uint8 type column holds', () => {
    const nodes = Object.fromEntries(
      Array.from({ length: 129 }, (_, i) => [
        `N${i}`,
        { ...node, token: `t${i}` },
      ])
    );
    expect(() => createRegistry([{ name: 'many', nodes }])).toThrow(
      'Too many plugin nodes'
    );
    delete nodes.N128;
    expect(createRegistry([{ name: 'many', nodes }]).nodes).toHaveLength(128);
  });
});

describe('parser cache', () => {
  it('shares one markdown-it instance per plugin list', () => {
    const setup = jest.fn();
    const counted = definePlugin({
      name: 'counted',
      syntax: { markdownIt: setup },
    });
    const a = getParser([counted, math]);
    expect(getParser([counted, math])).toBe(a);
    expect(setup).toHaveBeenCalledTimes(1);

    expect(getParser([math, counted])).not.toBe(a);
    expect(getParser([counted])).not.toBe(a);
    expect(getParser([])).not.toBe(a);
  });

  it('shares instances between parses with equal options', () => {
    const setup = jest.fn();
    const counted = definePlugin({
      name: 'counted-2',
      syntax: { markdownIt: setup },
    });
    parseWithMarkdownIt('x', { plugins: [counted] });
    parseWithMarkdownIt('y', { preset: 'gfm', plugins: [counted] });
    parseWithMarkdownIt('z', {
      preset: { base: 'gfm', exclude: [] },
      plugins: [counted],
    });
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('does not cache a plugin list that fails validation', () => {
    const bad = { name: '' };
    expect(() => getParser([bad])).toThrow();
    expect(() => getParser([bad])).toThrow();
  });

  it('rejects a user plugin named like a built-in one', () => {
    expect(() =>
      parseWithMarkdownIt('x', { preset: 'gfm', plugins: [{ name: 'tables' }] })
    ).toThrow('Plugin "tables" is registered twice');
  });
});

describe('document context', () => {
  it('includes the plugin names, so a different plugin set changes every block', () => {
    const src = 'plain\n';
    const without = parse(src, []).table;
    const withMath = parse(src, [math]).table;
    expect(withMath.context).not.toBe(without.context);
    expect(isSameBlock(without, 0, withMath, 0)).toBe(false);
    expect(isSameBlock(withMath, 0, parse(src, [math]).table, 0)).toBe(true);
  });
});

it('keeps built-in node types below the plugin range', () => {
  expect(Math.max(...Object.values(NodeType))).toBeLessThan(
    PLUGIN_NODE_TYPE_MIN
  );
  expect(Flag.INLINE_VIEW).toBe(1 << 7);
});
