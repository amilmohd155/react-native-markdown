/* eslint-disable no-void -- `void x` marks values used for type checks only */
/**
 * API-contract tests (Phase 1 · M5 done-when): the public types behave as
 * docs/rewrite/04-api.md says. Everything here is checked by `yarn typecheck`
 * (tsc over tests): a `@ts-expect-error` that stops erroring, or an
 * assertion that stops holding, fails the build. The runtime part only
 * makes sure the file executes.
 *
 * It imports like a consumer does: from the entry point and, for module
 * augmentation, from the package name (tsconfig `paths` maps it to src).
 * What must not be reachable from the built declarations is checked
 * separately by `yarn check:public-types`.
 */
import { createRef, useRef, type ComponentType, type ReactNode } from 'react';
import { Animated, FlatList, ScrollView, Text } from 'react-native';
import {
  Markdown,
  createTheme,
  darkTheme,
  defaults,
  definePlugin,
  inlineView,
  lightTheme,
  parse,
  useMarkdownTheme,
  visit,
  type Components,
  type ElementProps,
  type ElementStyle,
  type FootnoteBackLinkMark,
  type FootnotePressInfo,
  type HeadingLevel,
  type ImagePressInfo,
  type InlineViewProps,
  type LinkPressInfo,
  type MarkdownDocument,
  type MarkdownListComponent,
  type MarkdownListComponentProps,
  type MarkdownListRef,
  type MarkdownPlugin,
  type MarkdownProps,
  type MarkdownScrollComponent,
  type MarkdownScrollComponentProps,
  type MarkdownTheme,
  type ScrollOptions,
  type TaskToggleInfo,
  type ThemeInput,
  type VirtualizeOptions,
  type VisitProps,
} from '@docren/react-native-markdown';

// ── Helpers ──────────────────────────────────────────────────────────────

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Compile-time assertion: `expectType<Equal<A, B>>(true)`. */
function expectType<T extends true>(_value?: T): void {}

/** Accepts any props: `<Markdown {...} />` must compile (or not) as written. */
function element(_node: ReactNode): void {}

// A plugin package declares its elements by augmenting the package. This is
// the by-name form the docs show (04-api.md#types).
declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    ContractBadge: { label: string };
  }
}

// ── <Markdown> props ─────────────────────────────────────────────────────

describe('<Markdown> props', () => {
  it('needs exactly one of source and document', () => {
    const document = parse('x');
    element(<Markdown source="x" />);
    element(<Markdown document={document} />);
    // @ts-expect-error: neither
    element(<Markdown />);
    // @ts-expect-error: both
    element(<Markdown source="x" document={document} />);
    // @ts-expect-error: v0 prop
    element(<Markdown markdown="x" />);
  });

  it('types the simple props', () => {
    element(
      <Markdown
        source="x"
        preset="commonmark"
        html={{ allow: ['b', 'i'] }}
        images={{ allowHosts: ['*.example.com'] }}
        softBreak="newline"
        scriptFallback="raised"
        selectable
        maxFontSizeMultiplier={1.5}
        theme="auto"
      />
    );
    element(
      <Markdown source="x" preset={{ base: 'gfm', exclude: ['tables'] }} />
    );
    // @ts-expect-error: unknown preset
    element(<Markdown source="x" preset="markdown" />);
    element(
      <Markdown
        source="x"
        // @ts-expect-error: unknown built-in plugin
        preset={{ base: 'gfm', exclude: ['nope'] }}
      />
    );
    // @ts-expect-error: html mode
    element(<Markdown source="x" html="unsafe" />);
    // @ts-expect-error: images policy
    element(<Markdown source="x" images="some" />);
    // @ts-expect-error: soft break
    element(<Markdown source="x" softBreak="hard" />);
    // @ts-expect-error: theme name
    element(<Markdown source="x" theme="sepia" />);
  });

  it('types the events', () => {
    type Props = MarkdownProps;
    expectType<
      Equal<
        NonNullable<Props['onLinkPress']>,
        (href: string, info: LinkPressInfo) => boolean | void
      >
    >(true);
    expectType<
      Equal<
        NonNullable<Props['onImagePress']>,
        (src: string, info: ImagePressInfo) => void
      >
    >(true);
    expectType<
      Equal<
        NonNullable<Props['onTaskToggle']>,
        (checked: boolean, info: TaskToggleInfo) => void
      >
    >(true);
    expectType<
      Equal<
        NonNullable<Props['onFootnotePress']>,
        (label: string, info: FootnotePressInfo) => void | false
      >
    >(true);

    element(
      <Markdown
        source="x"
        onLinkPress={(href) => {
          void href.length;
          return false;
        }}
      />
    );
    expectType<
      Equal<FootnotePressInfo['direction'], 'reference' | 'definition'>
    >(true);
    expectType<
      Equal<
        NonNullable<NonNullable<Props['footnotes']>['backLinkMark']>,
        (reference: number, total: number) => string
      >
    >(true);
    expectType<
      Equal<FootnoteBackLinkMark, (reference: number, total: number) => string>
    >(true);
    element(<Markdown source="x" footnotes={{ backLinkMark: () => '↑' }} />);
    expectType<Equal<LinkPressInfo['title'], string | null>>(true);
    // @ts-expect-error: handlers receive the href first
    element(<Markdown source="x" onLinkPress={(href: number) => void href} />);
  });

  it('accepts theme inputs and createTheme results', () => {
    const input: ThemeInput = { colors: { link: '#00f' } };
    element(<Markdown source="x" theme={input} />);
    element(<Markdown source="x" theme={createTheme(input, darkTheme)} />);
    element(<Markdown source="x" theme={lightTheme} />);
    // @ts-expect-error: unknown token group
    element(<Markdown source="x" theme={{ sizes: {} }} />);
  });

  it('types the scroll and virtualize containers', () => {
    const flag = Math.random() > 0.5;
    const header = <Text>top</Text>;
    function ScrollWrapper(props: MarkdownScrollComponentProps) {
      return <ScrollView {...props} />;
    }
    function ListWrapper(props: MarkdownListComponentProps) {
      return <FlatList {...props} />;
    }

    element(<Markdown source="x" scroll />);
    element(<Markdown source="x" scroll={false} />);
    element(<Markdown source="x" virtualize />);
    element(<Markdown source="x" scroll={flag} virtualize={flag} />);
    element(
      <Markdown
        source="x"
        scroll={{
          header,
          footer: null,
          style: { flex: 1 },
          contentContainerStyle: { padding: 16 },
          onScroll: (e) => void e.nativeEvent.contentOffset.y,
          scrollEventThrottle: 16,
        }}
      />
    );
    element(
      <Markdown
        source="x"
        scroll={{ header }}
        virtualize={{ initialNumToRender: 4, windowSize: 5 }}
      />
    );

    // The component slots take RN's components, their Animated versions
    // and wrappers typed with the props we pass.
    element(<Markdown source="x" scroll={{ component: ScrollView }} />);
    element(
      <Markdown source="x" scroll={{ component: Animated.ScrollView }} />
    );
    element(<Markdown source="x" scroll={{ component: ScrollWrapper }} />);
    element(<Markdown source="x" virtualize={{ component: FlatList }} />);
    element(
      <Markdown source="x" virtualize={{ component: Animated.FlatList }} />
    );
    element(<Markdown source="x" virtualize={{ component: ListWrapper }} />);
    const scrollSlot: MarkdownScrollComponent = Animated.ScrollView;
    const listSlot: MarkdownListComponent = Animated.FlatList;
    void scrollSlot;
    void listSlot;

    // A list can't stand in for a scroll view.
    // @ts-expect-error: FlatList needs data and renderItem
    element(<Markdown source="x" scroll={{ component: FlatList }} />);
    element(
      // @ts-expect-error: scroll's component is a scroll view, not a list
      <Markdown source="x" scroll={{ component: ScrollView }} virtualize />
    );
    element(
      <Markdown
        source="x"
        // @ts-expect-error: windowing knobs belong to virtualize
        scroll={{ windowSize: 5 }}
      />
    );
    element(
      <Markdown
        source="x"
        // @ts-expect-error: no FlatListProps pass-through
        virtualize={{ maxToRenderPerBatch: 5 }}
      />
    );
    // @ts-expect-error: header is an element (text needs a <Text>)
    element(<Markdown source="x" scroll={{ header: 'top' }} />);
    // @ts-expect-error: not a container option
    element(<Markdown source="x" scroll={{ horizontal: true }} />);
    // @ts-expect-error: container options need scroll or virtualize
    element(<Markdown source="x" contentContainerStyle={{ padding: 1 }} />);
    // @ts-expect-error: virtualize takes no scroll-view component
    element(<Markdown source="x" virtualize={{ component: 'ScrollView' }} />);

    expectType<Equal<VirtualizeOptions['onScroll'], ScrollOptions['onScroll']>>(
      true
    );
  });

  it('types the list ref, componentRef and autoScroll', () => {
    const ref = createRef<MarkdownListRef>();
    const callbackRef = (handle: MarkdownListRef | null) => void handle;
    element(<Markdown source="x" scroll={{ ref, autoScroll: true }} />);
    element(
      <Markdown
        source="x"
        virtualize={{ ref: callbackRef, autoScroll: false }}
      />
    );
    element(
      <Markdown
        source="x"
        scroll={{ autoScroll: { threshold: 80 } }}
        virtualize={{ ref }}
      />
    );
    // componentRef takes refs to the instance, typed or not, and callbacks
    // (Reanimated's useAnimatedRef() is one of both).
    function Refs() {
      const scrollView = useRef<ScrollView>(null);
      const list = useRef<FlatList<unknown>>(null);
      const loose = useRef<unknown>(null);
      element(<Markdown source="x" scroll={{ componentRef: scrollView }} />);
      element(<Markdown source="x" virtualize={{ componentRef: list }} />);
      element(
        <Markdown
          source="x"
          scroll={{ component: Animated.ScrollView, componentRef: loose }}
        />
      );
      element(
        <Markdown
          source="x"
          virtualize={{
            componentRef: (instance: FlatList<unknown> | null) => void instance,
          }}
        />
      );
      return null;
    }
    void Refs;

    // Type checks only: never called.
    function calls(handle: MarkdownListRef) {
      handle.scrollToEnd({ animated: false });
      handle.scrollToOffset(10, { animated: true });
      handle.scrollToBlock(3, { viewPosition: 0.5, viewOffset: 8 });
      // @ts-expect-error: the offset is a number, not an options object
      handle.scrollToOffset({ offset: 10 });
      // @ts-expect-error: viewPosition is a number
      handle.scrollToBlock(3, { viewPosition: 'center' });
    }
    void calls;

    // List-only: there is no scroll view to control without a container.
    // @ts-expect-error: ref needs scroll or virtualize
    element(<Markdown source="x" ref={ref} />);
    // @ts-expect-error: autoScroll needs scroll or virtualize
    element(<Markdown source="x" autoScroll />);
    // @ts-expect-error: componentRef needs scroll or virtualize
    element(<Markdown source="x" componentRef={ref} />);
    element(
      <Markdown
        source="x"
        // @ts-expect-error: threshold is a number of pixels
        scroll={{ autoScroll: { threshold: 'bottom' } }}
      />
    );
    element(
      <Markdown
        source="x"
        // @ts-expect-error: the ref is a MarkdownListRef, not a ScrollView
        scroll={{ ref: createRef<ScrollView>() }}
      />
    );
  });
});

// ── Elements ─────────────────────────────────────────────────────────────

describe('elements', () => {
  it('gives each element its semantic props and style', () => {
    expectType<Equal<ElementProps<'Heading'>['level'], HeadingLevel>>(true);
    expectType<Equal<ElementProps<'Heading'>['id'], string>>(true);
    expectType<Equal<ElementProps<'Heading'>['style'], ElementStyle>>(true);
    expectType<Equal<ElementProps<'Link'>['href'], string>>(true);
    expectType<Equal<ElementProps<'Link'>['title'], string | null>>(true);
    expectType<Equal<ElementProps<'CodeBlock'>['language'], string | null>>(
      true
    );
    expectType<Equal<ElementProps<'ListItem'>['checked'], boolean | null>>(
      true
    );
    expectType<Equal<ElementProps<'FootnoteReference'>['reference'], number>>(
      true
    );
    expectType<Equal<ElementProps<'FootnoteBackLink'>['total'], number>>(true);
  });

  it('leaves children off leaf elements', () => {
    expectType<
      Equal<'children' extends keyof ElementProps<'CodeBlock'> ? 1 : 0, 0>
    >(true);
    expectType<
      Equal<'children' extends keyof ElementProps<'Divider'> ? 1 : 0, 0>
    >(true);
    expectType<
      Equal<'children' extends keyof ElementProps<'Heading'> ? 1 : 0, 1>
    >(true);
  });

  it('type-checks the components prop', () => {
    element(
      <Markdown
        source="x"
        components={{
          Heading: ({ level, children }) => (
            <>
              {level}
              {children}
            </>
          ),
          CodeBlock: ({ code, language }) => <>{code + String(language)}</>,
        }}
      />
    );
    element(
      <Markdown
        source="x"
        // @ts-expect-error: not an element
        components={{ Banner: () => null }}
      />
    );
    element(
      <Markdown
        source="x"
        components={{
          // @ts-expect-error: level is 1 to 6, not a string
          Heading: ({ level }: { level: string }) => <>{level}</>,
        }}
      />
    );
  });

  it('exposes the default components for wrapping', () => {
    expectType<
      Equal<
        (typeof defaults)['CodeBlock'],
        ComponentType<ElementProps<'CodeBlock'>>
      >
    >(true);
    expectType<Equal<keyof typeof defaults, keyof Components>>(true);

    const Mermaid = (_: { source: string }) => null;
    const components: Partial<Components> = {
      CodeBlock: (props) =>
        props.language === 'mermaid' ? (
          <Mermaid source={props.code} />
        ) : (
          <defaults.CodeBlock {...props} />
        ),
    };
    element(<Markdown source="x" components={components} />);
  });

  it('declares inline views with inlineView()', () => {
    const Chip = (props: InlineViewProps<'Link'>) => <>{props.href}</>;
    element(<Markdown source="x" components={{ Link: inlineView(Chip) }} />);
  });
});

// ── Plugins ──────────────────────────────────────────────────────────────

describe('plugins', () => {
  const badge = definePlugin({
    name: 'badge',
    nodes: {
      ContractBadge: {
        kind: 'inline',
        token: 'badge',
        from: (token) => ({ label: token.content }),
      },
    },
    components: {
      ContractBadge: ({ label }) => <>{label}</>,
    },
    theme: { ContractBadge: { text: { color: '#fff' } } },
  });

  it('infers node props and keeps the name literal', () => {
    expectType<Equal<typeof badge.name, 'badge'>>(true);
    expectType<MarkdownPlugin extends typeof badge ? false : true>(true);
    // Assignable to the list the `plugins` prop takes.
    const plugins: readonly MarkdownPlugin[] = [badge];
    element(<Markdown source="x" plugins={plugins} />);
    element(<Markdown source="x" plugins={[badge]} />);
  });

  it('checks plugin components against the props from()', () => {
    definePlugin({
      name: 'wrong',
      nodes: {
        Thing: { kind: 'inline', token: 't', from: () => ({ n: 1 }) },
      },
      components: {
        // @ts-expect-error: n is a number
        Thing: ({ n }: { n: string }) => <>{n}</>,
      },
    });
    definePlugin({
      name: 'unserializable',
      nodes: {
        Thing: {
          kind: 'inline',
          token: 't',
          // @ts-expect-error: attrs are plain values (stored in the table)
          from: () => ({ run: () => 1 }),
        },
      },
    });
  });

  it('lets a plugin declare its elements by augmenting the package', () => {
    element(
      <Markdown
        source="x"
        components={{ ContractBadge: ({ label }) => <>{label}</> }}
        theme={{ elements: { ContractBadge: { container: { padding: 2 } } } }}
      />
    );
    element(
      <Markdown
        source="x"
        components={{
          // @ts-expect-error: label is a string
          ContractBadge: ({ label }: { label: number }) => <>{label}</>,
        }}
      />
    );
    expectType<Equal<ElementProps<'ContractBadge'>['label'], string>>(true);
  });

  it('does not expose markdown-it tokens to plugin authors', () => {
    definePlugin({
      name: 'tokens',
      nodes: {
        Note: {
          kind: 'block',
          token: 'note',
          from: (token) => {
            expectType<Equal<typeof token.content, string>>(true);
            expectType<Equal<typeof token.meta, unknown>>(true);
            // @ts-expect-error: read-only
            token.content = 'changed';
            return { info: token.info };
          },
        },
      },
    });
  });
});

// ── parse, visit, theme ─────────────────────────────────────────────────

describe('parse and visit', () => {
  it('returns an opaque document', () => {
    const doc: MarkdownDocument = parse('# x');
    expectType<Equal<typeof doc.blockCount, number>>(true);
    // @ts-expect-error: the node table is private
    void doc.table;
    // @ts-expect-error: cannot be built by hand
    const fake: MarkdownDocument = { table: {} };
    void fake;
  });

  it('types the visitor by element', () => {
    const toc: { level: number; id: string; text: string }[] = [];
    visit(parse('# x'), {
      Heading: ({ level, id }, { text }) => {
        toc.push({ level, id, text });
      },
      Link: (_props) => {
        expectType<Equal<typeof _props.href, string>>(true);
        expectType<Equal<VisitProps<'Link'>['href'], string>>(true);
      },
    });
    // @ts-expect-error: not an element
    visit(parse('x'), { Banner: () => {} });
    // @ts-expect-error: props are read-only
    visit(parse('x'), { Heading: (props) => void (props.level = 2) });
  });
});

describe('theme', () => {
  it('gives custom components the merged tokens and styles', () => {
    type Theme = ReturnType<typeof useMarkdownTheme>;
    expectType<Equal<Theme, MarkdownTheme>>(true);
    expectType<Equal<Theme['styles']['Link'], ElementStyle>>(true);
    expectType<Equal<Theme['headings']['length'], 6>>(true);
  });
});

// ── What the entry does not export ──────────────────────────────────────

describe('internals', () => {
  it('are not exported', () => {
    // @ts-expect-error: the node table is private
    void (null as unknown as import('@docren/react-native-markdown').NodeTable);
    // @ts-expect-error: tableOf is internal
    void import('@docren/react-native-markdown').then((m) => m.tableOf);
    // @ts-expect-error: the internal backend contract is private
    void (null as unknown as import('@docren/react-native-markdown').ParserBackendImpl);
  });

  it('runs', () => {
    expect(typeof Markdown).toBe('function');
  });
});
