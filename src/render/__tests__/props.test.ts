import { NodeType, NONE, type NodeTable } from '../../model';
import { lightTokens } from '../../theme';
import {
  blockImageOf,
  codeBlockProps,
  footnoteDefinitionProps,
  footnoteReferenceProps,
  headingProps,
  htmlProps,
  imageProps,
  inlineCodeProps,
  inlineImageProps,
  lineBreakProps,
  linkProps,
  listItemProps,
  listProps,
  tableCellProps,
  tableProps,
  tableRowProps,
} from '../props';
import { nodesOfType, tableFor } from './helpers';

const bullets = lightTokens.listBullets;

/** List nesting depth of a list item, as the renderer computes it. */
function depthOf(table: NodeTable, item: number): number {
  let depth = 0;
  for (let p = table.parent[item]!; p !== NONE; p = table.parent[p]!) {
    if (table.type[p] === NodeType.ListItem) depth++;
  }
  return depth;
}

function markers(source: string): string[] {
  const table = tableFor(source);
  return nodesOfType(table, NodeType.ListItem).map(
    (id) => listItemProps(table, id, depthOf(table, id), bullets).marker
  );
}

describe('element props', () => {
  it('Heading: level and de-duplicated slug', () => {
    const table = tableFor('# Intro\n\n## Intro\n');
    expect(
      nodesOfType(table, NodeType.Heading).map((id) => headingProps(table, id))
    ).toEqual([
      { level: 1, id: 'intro' },
      { level: 2, id: 'intro-1' },
    ]);
  });

  it('List: ordered, start and tight', () => {
    const table = tableFor('3. a\n4. b\n\n- x\n\n- y\n');
    expect(
      nodesOfType(table, NodeType.List).map((id) => listProps(table, id))
    ).toEqual([
      { ordered: true, start: 3, tight: true },
      { ordered: false, start: 1, tight: false },
    ]);
  });

  it('ListItem: ordered markers from start, index and delimiter', () => {
    expect(markers('3. a\n4. b\n')).toEqual(['3.', '4.']);
    expect(markers('1) a\n1) b\n')).toEqual(['1)', '2)']);
    expect(markers('9. a\n9. b\n')).toEqual(['9.', '10.']);
  });

  it('ListItem: bullets by nesting depth, repeating', () => {
    const source = '- a\n  - b\n    - c\n      - d\n';
    expect(markers(source)).toEqual(['•', '◦', '▪\uFE0E', '•']);
  });

  it('ListItem: index and checked (null unless a task item)', () => {
    const table = tableFor('- [x] done\n- [ ] todo\n- plain\n');
    expect(
      nodesOfType(table, NodeType.ListItem).map((id) =>
        listItemProps(table, id, 0, bullets)
      )
    ).toEqual([
      { index: 0, ordered: false, marker: '•', checked: true },
      { index: 1, ordered: false, marker: '•', checked: false },
      { index: 2, ordered: false, marker: '•', checked: null },
    ]);
  });

  it('CodeBlock: drops exactly one trailing newline; language and meta', () => {
    const table = tableFor(
      '```ts title="a.ts"\nconst a = 1;\n\n```\n\n    indented\n'
    );
    expect(
      nodesOfType(table, NodeType.CodeBlock).map((id) =>
        codeBlockProps(table, id)
      )
    ).toEqual([
      { code: 'const a = 1;\n', language: 'ts', meta: 'title="a.ts"' },
      { code: 'indented', language: null, meta: null },
    ]);
  });

  it('Table, TableRow, TableCell', () => {
    const table = tableFor('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
    const [t] = nodesOfType(table, NodeType.Table);
    expect(tableProps(table, t!)).toEqual({ align: ['left', 'right'] });
    expect(
      nodesOfType(table, NodeType.TableRow).map((id) =>
        tableRowProps(table, id)
      )
    ).toEqual([
      { header: true, index: 0 },
      { header: false, index: 1 },
    ]);
    expect(
      nodesOfType(table, NodeType.TableCell).map((id) =>
        tableCellProps(table, id)
      )
    ).toEqual([
      { align: 'left', header: true, column: 0 },
      { align: 'right', header: true, column: 1 },
      { align: 'left', header: false, column: 0 },
      { align: 'right', header: false, column: 1 },
    ]);
  });

  it('Image and InlineImage', () => {
    const table = tableFor('![alt *text*](a.png "T")\n\nsee ![b](b.png)\n');
    const [first, second] = nodesOfType(table, NodeType.Image);
    expect(imageProps(table, first!)).toEqual({
      src: 'a.png',
      alt: 'alt text',
      title: 'T',
    });
    expect(inlineImageProps(table, second!)).toEqual({
      src: 'b.png',
      alt: 'b',
      title: null,
      width: null,
      height: null,
    });
    expect(
      inlineImageProps(table, second!, { width: 20, height: 10 })
    ).toMatchObject({ width: 20, height: 10 });
  });

  it('block Image only when the image is the paragraph’s only child', () => {
    const cases: [string, boolean][] = [
      ['![a](a.png)\n', true],
      ['  ![a](a.png)  \n', true],
      ['text ![a](a.png)\n', false],
      ['![a](a.png) ![b](b.png)\n', false],
      ['[![a](a.png)](https://x)\n', false],
    ];
    for (const [source, block] of cases) {
      const table = tableFor(source);
      const [paragraph] = nodesOfType(table, NodeType.Paragraph);
      expect([source, blockImageOf(table, paragraph!) !== NONE]).toEqual([
        source,
        block,
      ]);
    }
  });

  it('Link, InlineCode, LineBreak', () => {
    const table = tableFor('[a](https://x "T") [b](/y) `c`  \nd\n');
    expect(
      nodesOfType(table, NodeType.Link).map((id) => linkProps(table, id))
    ).toEqual([
      { href: 'https://x', title: 'T' },
      { href: '/y', title: null },
    ]);
    const [code] = nodesOfType(table, NodeType.InlineCode);
    expect(inlineCodeProps(table, code!)).toEqual({ code: 'c' });
    const [br] = nodesOfType(table, NodeType.LineBreak);
    expect(lineBreakProps(table, br!)).toEqual({ hard: true });
  });

  it('FootnoteReference and FootnoteDefinition', () => {
    const table = tableFor('a[^n] b[^n]\n\n[^n]: note\n');
    expect(
      nodesOfType(table, NodeType.FootnoteReference).map((id) =>
        footnoteReferenceProps(table, id)
      )
    ).toEqual([
      { label: 'n', index: 1 },
      { label: 'n', index: 1 },
    ]);
    const [def] = nodesOfType(table, NodeType.FootnoteDefinition);
    expect(footnoteDefinitionProps(table, def!)).toEqual({
      label: 'n',
      index: 1,
      references: 2,
    });
  });

  it('HtmlBlock and HtmlInline: the source HTML', () => {
    const table = tableFor('<div>\nx\n</div>\n\na <span>b</span>\n');
    const [block] = nodesOfType(table, NodeType.HtmlBlock);
    expect(htmlProps(table, block!)).toEqual({ html: '<div>\nx\n</div>\n' });
    expect(
      nodesOfType(table, NodeType.HtmlInline).map(
        (id) => htmlProps(table, id).html
      )
    ).toEqual(['<span>', '</span>']);
  });
});

describe('props contract', () => {
  const isPlain = (value: unknown): boolean =>
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value) ||
    (Array.isArray(value) && value.every(isPlain));

  it('props are plain values only, never undefined', () => {
    const table = tableFor(
      [
        '# H',
        '3. a\n   - [x] b',
        '```js\nx\n```',
        '| a |\n|:-:|\n| 1 |',
        '![i](i.png)',
        '[l](https://x) `c` ![j](j.png)  \nz[^f]',
        '<div>h</div>',
        '[^f]: note',
      ].join('\n\n')
    );

    const builders: [number, (id: number) => object][] = [
      [NodeType.Heading, (id) => headingProps(table, id)],
      [NodeType.List, (id) => listProps(table, id)],
      [NodeType.ListItem, (id) => listItemProps(table, id, 0, bullets)],
      [NodeType.CodeBlock, (id) => codeBlockProps(table, id)],
      [NodeType.Table, (id) => tableProps(table, id)],
      [NodeType.TableRow, (id) => tableRowProps(table, id)],
      [NodeType.TableCell, (id) => tableCellProps(table, id)],
      [NodeType.Image, (id) => inlineImageProps(table, id)],
      [NodeType.Link, (id) => linkProps(table, id)],
      [NodeType.InlineCode, (id) => inlineCodeProps(table, id)],
      [NodeType.LineBreak, (id) => lineBreakProps(table, id)],
      [NodeType.FootnoteReference, (id) => footnoteReferenceProps(table, id)],
      [NodeType.FootnoteDefinition, (id) => footnoteDefinitionProps(table, id)],
      [NodeType.HtmlBlock, (id) => htmlProps(table, id)],
    ];

    for (const [type, build] of builders) {
      const ids = nodesOfType(table, type);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        for (const [key, value] of Object.entries(build(id))) {
          expect([type, key, isPlain(value)]).toEqual([type, key, true]);
        }
      }
    }
  });
});
