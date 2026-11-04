import { NodeType, TableBuilder, ROOT } from '../../model';
import type { ParserBackend, ParserBackendImpl } from '../../parse';
import { tableOf } from '../document';
import * as api from '../index';
import { parse } from '../parse';

const g = globalThis as { __DEV__?: unknown };

describe('parse', () => {
  it('returns an opaque handle exposing only blockCount', () => {
    const doc = parse('# A\n\nb\n');
    expect(doc.blockCount).toBe(2);
    expect(Object.keys(doc)).toEqual(['blockCount']);
    expect(Object.isFrozen(doc)).toBe(true);
  });

  it('keeps the node table behind the handle', () => {
    const table = tableOf(parse('para\n'));
    expect(table.blockCount).toBe(1);
    expect(table.type[table.blocks[0]!]).toBe(NodeType.Paragraph);
  });

  it('rejects objects that were not created by parse', () => {
    expect(() => tableOf({ blockCount: 0 })).toThrow(TypeError);
  });

  it('creates a new document per call', () => {
    expect(parse('x')).not.toBe(parse('x'));
  });

  it('passes preset and html options through', () => {
    const gfm = tableOf(parse('| a |\n|---|\n| b |\n'));
    const cm = tableOf(
      parse('| a |\n|---|\n| b |\n', { preset: 'commonmark' })
    );
    expect(gfm.type[gfm.blocks[0]!]).toBe(NodeType.Table);
    expect(cm.type[cm.blocks[0]!]).toBe(NodeType.Paragraph);

    const stripped = tableOf(parse('<div>x</div>\n', { html: 'strip' }));
    expect(stripped.blockCount).toBe(0);
  });

  it('uses a custom backend', () => {
    const backend: ParserBackendImpl = {
      name: 'fake',
      parse: jest.fn(() => {
        const b = new TableBuilder();
        b.add(NodeType.Divider, ROOT);
        return b.finish();
      }),
    };
    const doc = parse('anything', { backend, preset: 'commonmark' });
    expect(backend.parse).toHaveBeenCalledWith('anything', {
      preset: 'commonmark',
    });
    expect(tableOf(doc).type[1]).toBe(NodeType.Divider);
  });

  it('rejects a backend that is not a real one', () => {
    const fake: ParserBackend = { name: 'handmade' };
    expect(() => parse('x', { backend: fake })).toThrow(
      'Unsupported parser backend "handmade"'
    );
  });

  it('does not expose internals from the api entry', () => {
    expect(Object.keys(api).sort()).toEqual([
      'Markdown',
      'createTheme',
      'darkTheme',
      'defaults',
      'definePlugin',
      'inlineView',
      'lightTheme',
      'parse',
      'useMarkdownTheme',
      'visit',
    ]);
  });
});

describe('dev mode', () => {
  const original = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = original;
    jest.restoreAllMocks();
  });

  it('freezes strings, attrs and the table in dev', () => {
    g.__DEV__ = true;
    const table = tableOf(parse('# T\n\n| a |\n|:-|\n| b |\n'));
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table.strings)).toBe(true);
    expect(Object.isFrozen(table.attrs)).toBe(true);
    expect(table.attrs.every((a) => Object.isFrozen(a))).toBe(true);
    const tableAttrs = table.attrs.find((a) => 'align' in a) as {
      align: unknown[];
    };
    expect(Object.isFrozen(tableAttrs.align)).toBe(true);
  });

  it('does not freeze in production', () => {
    g.__DEV__ = false;
    expect(Object.isFrozen(tableOf(parse('x')))).toBe(false);
  });

  it('reports warnings to onWarning, else console.warn only in dev', () => {
    const backend = jest.requireActual('../../parse/markdownItBackend');
    const real = backend.parseWithMarkdownIt;
    jest
      .spyOn(backend, 'parseWithMarkdownIt')
      .mockImplementation((...args: unknown[]) => ({
        table: real(...args).table,
        warnings: ['unknown token "x"'],
      }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const onWarning = jest.fn();
    parse('a', { onWarning });
    expect(onWarning).toHaveBeenCalledWith('unknown token "x"');
    expect(warn).not.toHaveBeenCalled();

    g.__DEV__ = false;
    parse('a');
    expect(warn).not.toHaveBeenCalled();

    g.__DEV__ = true;
    parse('a');
    expect(warn).toHaveBeenCalledWith(
      '[react-native-markdown] unknown token "x"'
    );
  });
});
