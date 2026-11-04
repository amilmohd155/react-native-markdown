import { NodeType, type NodeTable } from '../../model';
import type { Preset } from '../../parse';
import { getMarkdownIt } from '../../parse/markdownIt';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { GFM_PLUGINS, type GfmPluginName } from '../gfm';
import { resolvePreset } from '../presets';

const has = (table: NodeTable, type: number): boolean =>
  Array.from(table.type).includes(type);

/**
 * One input per built-in plugin, and how to tell its syntax was parsed.
 * Every built-in plugin must have an entry (checked below).
 */
const SAMPLES: Record<
  GfmPluginName,
  { src: string; parsed: (t: NodeTable) => boolean }
> = {
  tables: {
    src: '| a |\n|---|\n| b |\n',
    parsed: (t) => has(t, NodeType.Table),
  },
  strikethrough: {
    src: '~~gone~~\n',
    parsed: (t) => has(t, NodeType.Strikethrough),
  },
};

const NAMES = GFM_PLUGINS.map((p) => p.name);
const parsedWith = (preset: Preset, name: GfmPluginName) =>
  SAMPLES[name].parsed(
    parseWithMarkdownIt(SAMPLES[name].src, { preset }).table
  );

describe('resolvePreset', () => {
  it('gfm is every built-in plugin, in order; commonmark is none', () => {
    expect(resolvePreset('gfm')).toBe(GFM_PLUGINS);
    expect(resolvePreset('gfm').map((p) => p.name)).toEqual([
      'tables',
      'strikethrough',
    ]);
    expect(resolvePreset('commonmark')).toEqual([]);
  });

  it('{ base, exclude } drops the named plugins and keeps the order', () => {
    const plugins = resolvePreset({ base: 'gfm', exclude: ['tables'] });
    expect(plugins.map((p) => p.name)).toEqual(
      NAMES.filter((n) => n !== 'tables')
    );
    expect(resolvePreset({ base: 'gfm' })).toBe(GFM_PLUGINS);
    expect(resolvePreset({ base: 'gfm', exclude: [] })).toBe(GFM_PLUGINS);
  });

  it('returns the same array for equal presets', () => {
    const a = resolvePreset({
      base: 'gfm',
      exclude: ['tables', 'strikethrough'],
    });
    const b = resolvePreset({
      base: 'gfm',
      exclude: ['strikethrough', 'tables', 'tables'],
    });
    expect(a).toBe(b);
  });

  it('rejects unknown bases and plugin names', () => {
    // @ts-expect-error: invalid on purpose
    expect(() => resolvePreset('github')).toThrow('Unknown preset "github"');
    expect(() =>
      // @ts-expect-error: invalid on purpose
      resolvePreset({ base: 'gfm', exclude: ['tablez'] })
    ).toThrow('Unknown built-in plugin "tablez"');
    expect(() =>
      // @ts-expect-error: only gfm can be a base
      resolvePreset({ base: 'commonmark', exclude: ['tables'] })
    ).toThrow('Unknown preset base "commonmark"');
  });
});

describe('presets', () => {
  it('has a sample for every built-in plugin', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)('gfm parses %s', (name) => {
    expect(parsedWith('gfm', name)).toBe(true);
  });

  it.each(NAMES)('commonmark does not parse %s', (name) => {
    expect(parsedWith('commonmark', name)).toBe(false);
  });

  it.each(NAMES)('excluding %s removes exactly its syntax', (excluded) => {
    const preset: Preset = { base: 'gfm', exclude: [excluded] };
    for (const name of NAMES) {
      expect([name, parsedWith(preset, name)]).toEqual([
        name,
        name !== excluded,
      ]);
    }
  });

  it('the commonmark instance has no GFM rules enabled', () => {
    const md = getMarkdownIt('commonmark');
    expect(md.block.ruler.getRules('')).not.toContainEqual(
      expect.objectContaining({ name: 'table' })
    );
    const inline = md.inline.ruler.getRules('').map((fn) => fn.name);
    expect(inline).not.toContain('strikethrough');
  });

  it('defaults to gfm', () => {
    const { table } = parseWithMarkdownIt(SAMPLES.tables.src);
    expect(SAMPLES.tables.parsed(table)).toBe(true);
  });

  it('presets are part of the document context', () => {
    const src = 'x\n';
    const gfm = parseWithMarkdownIt(src, { preset: 'gfm' }).table.context;
    const same = parseWithMarkdownIt(src, {
      preset: { base: 'gfm', exclude: [] },
    }).table.context;
    const fewer = parseWithMarkdownIt(src, {
      preset: { base: 'gfm', exclude: ['tables'] },
    }).table.context;
    expect(same).toBe(gfm);
    expect(fewer).not.toBe(gfm);
  });
});
