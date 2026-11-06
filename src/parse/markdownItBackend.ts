import type { Env, MarkdownIt, Token } from 'markdown-it';
import { computeLineOffsets, NodeType } from '../model';
import type { CarriedContext, ParseFromResult } from '../stream/types';
import type { MarkdownPlugin } from '../plugins/definePlugin';
import { resolvePreset } from '../plugins/presets';
import type { HtmlMode, ParseOptions, ParserBackendImpl } from './backend';
import {
  convertTokens,
  type ConvertResult,
  type HeadingRecord,
} from './convert';
import { getParser } from './markdownIt';
import { Slugger } from './slug';

/** Parses with markdown-it and returns the table plus dev-mode warnings. */
export function parseWithMarkdownIt(
  source: string,
  options: ParseOptions = {}
): ConvertResult {
  const html = options.html ?? 'safe';
  const { md, registry } = getParser(pluginList(options));
  const env: Env = {};
  const tokens = md.parse(source, env);
  return convertTokens(md, tokens, source, {
    html,
    registry,
    context: documentContext(html, registry.names, env.references),
  });
}

/** The preset's built-in plugins, then the user's. */
function pluginList(options: ParseOptions): readonly MarkdownPlugin[] {
  const preset = resolvePreset(options.preset ?? 'gfm');
  const extra = options.plugins;
  return extra && extra.length > 0 ? [...preset, ...extra] : preset;
}

/**
 * Everything outside a block's source text that changes the tree: html
 * mode, plugin names (which include the preset's) and the link reference
 * definitions (P1-9).
 */
function documentContext(
  html: HtmlMode,
  plugins: readonly string[],
  references: unknown
): string {
  return JSON.stringify([html, plugins, references ?? null]);
}

// ── parseFrom (phase 2, P2-3) ────────────────────────────────────────

type References = NonNullable<Env['references']>;

/**
 * markdown-it's carried context: what the prefix contributes to a tail parse.
 * - `references`: link reference definitions, in document order (first
 *   definition wins, so the seed is copied and the tail adds only new labels).
 * - `slugs`: heading slug counters, excluding headings inside the footnote
 *   section (that section comes after every real block, so its headings can
 *   never affect a later block).
 * - `footnotes`: labels of footnote definitions in the prefix.
 * Immutable after construction.
 */
class MarkdownItCarried {
  constructor(
    readonly references: References | undefined,
    readonly slugs: ReadonlyMap<string, number>,
    readonly footnotes: ReadonlySet<string>
  ) {}
}

const EMPTY_CARRIED = new MarkdownItCarried(
  undefined,
  new Map(),
  new Set<string>()
);

const asCarried = (c: MarkdownItCarried): CarriedContext =>
  c as unknown as CarriedContext;

function unwrap(carried: CarriedContext | undefined): MarkdownItCarried {
  if (carried === undefined) return EMPTY_CARRIED;
  if (!(carried instanceof MarkdownItCarried)) {
    throw new TypeError('parseFrom: carried context is from another backend');
  }
  return carried;
}

const size = (r: References | undefined): number =>
  r ? Object.keys(r).length : 0;

/** Labels of the footnote definitions markdown-it-footnote saw. */
function footnoteLabels(env: Env): string[] {
  const refs = (env.footnotes as { refs?: Record<string, number> } | undefined)
    ?.refs;
  return refs ? Object.keys(refs).map((k) => k.slice(1)) : [];
}

/** markdown-it's `normalize` core rule, for the block-only side parse. */
const normalize = (src: string): string =>
  src.replace(/\r\n?|\n/g, '\n').replace(/\0/g, '\uFFFD');

/**
 * Keeps the tokens of top-level blocks that start at or after `line`, plus
 * the footnote section (no `map`, level 0). Used when the prefix has footnote
 * definitions: the section must still contain them and numbering follows
 * references in the prefix, so the whole source is tokenized and only the
 * conversion is limited to the tail.
 */
function tailTokens(tokens: readonly Token[], line: number): Token[] {
  const out: Token[] = [];
  let keep = true;
  for (const token of tokens) {
    if (token.level === 0 && token.nesting !== -1) {
      keep = token.map ? token.map[0] >= line : true;
    }
    if (keep) out.push(token);
  }
  return out;
}

/** Line (0-based) at which `offset` starts; `offset` is a line start. */
function lineOf(lineOffsets: Int32Array, offset: number): number {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lineOffsets[mid]! < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Parses `source` from `offset` (a top-level block boundary) with the
 * prefix's context carried in. See `ParseFrom` in src/stream/types.ts.
 *
 * - References: the tail's `env.references` is seeded from the prefix, so
 *   `[x]` resolves and the merged map (same key order as a full parse)
 *   goes into `context`.
 * - Slugs: the converter's slugger is seeded from the prefix counters.
 * - Footnotes: the section is synthetic and always rebuilt (it is the last
 *   block, after every real block). With no footnote definition in the
 *   prefix a tail parse is exact. With one, the section needs the prefix's
 *   definitions and numbering, so the whole source is tokenized and only the
 *   tail blocks plus the section are converted (rare; correct over fast).
 *   Definitions in the tail set `hasFootnoteDefinition` (full-reparse
 *   trigger). Carried context never includes the section's own headings.
 * - `prefixCarried` is the context before the last REAL block (the footnote
 *   section is not one): the stream core resumes there.
 */
function parseFromMarkdownIt(
  source: string,
  offset: number,
  carried: CarriedContext | undefined,
  options: ParseOptions = {}
): ParseFromResult {
  const html = options.html ?? 'safe';
  const { md, registry } = getParser(pluginList(options));
  const seed = offset === 0 ? EMPTY_CARRIED : unwrap(carried);
  const input = offset === 0 ? asCarried(EMPTY_CARRIED) : asCarried(seed);
  const wholeSource = seed.footnotes.size > 0;

  const env: Env = {};
  let tokens: Token[];
  let tokenized: string;
  let base: number;
  if (wholeSource) {
    // Seeding is unnecessary: the full parse finds every reference itself.
    const all = md.parse(source, env);
    tokens = tailTokens(all, lineOf(computeLineOffsets(source), offset));
    tokenized = source;
    base = 0;
  } else {
    if (seed.references) env.references = { ...seed.references };
    tokenized = source.slice(offset);
    tokens = md.parse(tokenized, env);
    base = offset;
  }

  const references = env.references as References | undefined;
  const headings: HeadingRecord[] = [];
  const { table } = convertTokens(md, tokens, tokenized, {
    html,
    registry,
    context: documentContext(html, registry.names, references),
    offset: base,
    fullSource: source,
    slugger: new Slugger(seed.slugs),
    headings,
  });

  const labels = footnoteLabels(env);
  const hasFootnoteDefinition = labels.some((l) => !seed.footnotes.has(l));
  const newReferences = size(references) > size(seed.references);

  const slugsAfter = (upTo: number): ReadonlyMap<string, number> => {
    const slugger = new Slugger(seed.slugs);
    for (const h of headings) if (h.block < upTo) slugger.slug(h.text);
    return slugger.snapshot();
  };

  const after = new MarkdownItCarried(
    references,
    slugsAfter(Infinity),
    labels.length > 0 ? new Set([...seed.footnotes, ...labels]) : seed.footnotes
  );

  // Blocks except the last real one (the footnote section does not count).
  let real = table.blockCount;
  if (
    real > 0 &&
    table.type[table.blocks[real - 1]!] === NodeType.FootnoteSection
  ) {
    real--;
  }
  let prefixCarried: CarriedContext;
  // With one block the input is the answer only when nothing sits between
  // `offset` and the block (a gap can hold reference definitions).
  if (real === 0 || (real === 1 && table.blockStart[0] === offset)) {
    prefixCarried = input;
  } else {
    prefixCarried = asCarried(
      prefixContext(md, seed, source, offset, table.blockStart[real - 1]!, {
        slugs: slugsAfter(real - 1),
      })
    );
  }

  return {
    table,
    carried: asCarried(after),
    prefixCarried,
    newReferences,
    hasFootnoteDefinition,
  };
}

/**
 * Carried context after `source[offset, end)`: references and footnote
 * labels via a block-only pass (definitions produce no block of their own,
 * so they can sit in the gap before the last block and only the parser
 * knows about them).
 */
function prefixContext(
  md: MarkdownIt,
  seed: MarkdownItCarried,
  source: string,
  offset: number,
  end: number,
  carry: { slugs: ReadonlyMap<string, number> }
): MarkdownItCarried {
  const text = source.slice(offset, end);
  let references = seed.references;
  let footnotes = seed.footnotes;
  if (text.includes(']:')) {
    const env: Env = {};
    if (seed.references) env.references = { ...seed.references };
    md.block.parse(normalize(text), md, env, []);
    if (size(env.references as References | undefined) > size(references)) {
      references = env.references as References;
    }
    const labels = footnoteLabels(env).filter((l) => !footnotes.has(l));
    if (labels.length > 0) footnotes = new Set([...footnotes, ...labels]);
  }
  return new MarkdownItCarried(references, carry.slugs, footnotes);
}

/** The default, pure-JS parser backend. */
export const markdownItBackend: ParserBackendImpl = {
  name: 'markdown-it',
  parse: (source, options) => parseWithMarkdownIt(source, options).table,
  parseFrom: parseFromMarkdownIt,
};
