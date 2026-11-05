import { createElement, memo, type ReactNode } from 'react';
import { F1, F2, F3 } from '../../../bench/fixtures';
import { buildObjectTree, ObjectTreeMarkdown } from '../../../bench/objectTree';
import * as api from '../../api';
import { tableOf } from '../../api/document';
import { Markdown, parse } from '../../api';
import { renderTree } from '../../__tests__/tree';
import { hostComponents } from './helpers';

/**
 * The test-only object-tree model (bench/objectTree, option B in
 * docs/rewrite/08-model-and-api.md) must render exactly what the flat table
 * renders: the A/B only means something if the output is the same.
 */

// Every syntax the renderer has a path for, beyond the bench fixtures.
const EXTRA = `# Title *with* \`code\`

Setext
======

Soft
break and a hard\\
break, ~~gone~~, <kbd>K</kbd>, H~2~O, x^2^, ==mark==, ++under++.

> quote with **bold _nested_**
> - item in quote

1. one
2. two
   - nested [link](https://example.com "t")
   - [ ] todo
   - [x] done
10. ten

- tight
- list

- loose

- list

![alt](https://example.com/a.png)

Text with ![inline](https://example.com/b.png) image.

| a | b |
|:--|--:|
| 1 | **2** |

<div>html block</div>

Inline <b>html</b> and https://autolink.example.com and a footnote[^1].

\`\`\`ts title=x
const a = 1;
\`\`\`

---

[^1]: The note, with *emphasis*.
`;

const SOURCES: ReadonlyArray<[string, string]> = [
  ['F1', F1],
  ['F2', F2],
  ['F3', F3],
  ['syntax gallery', EXTRA],
];

describe('object-tree model (bench only)', () => {
  it.each(SOURCES)('renders %s like the flat table', async (_name, source) => {
    const components = hostComponents();
    const flat = await renderTree(
      <Markdown source={source} components={components} />
    );
    const flatJson = JSON.stringify(flat.toJSON());
    await flat.unmount();

    const viaSource = await renderTree(
      <ObjectTreeMarkdown source={source} components={components} />
    );
    expect(JSON.stringify(viaSource.toJSON())).toBe(flatJson);

    const tree = buildObjectTree(tableOf(parse(source)));
    const viaTree = await renderTree(
      <ObjectTreeMarkdown tree={tree} components={components} />
    );
    expect(JSON.stringify(viaTree.toJSON())).toBe(flatJson);
    expect(flatJson.length).toBeGreaterThan(100);
  });

  it('renders the default components identically too', async () => {
    const flat = await renderTree(<Markdown source={EXTRA} />);
    const flatJson = JSON.stringify(flat.toJSON());
    const other = await renderTree(<ObjectTreeMarkdown source={EXTRA} />);
    expect(JSON.stringify(other.toJSON())).toBe(flatJson);
  });

  it('skips unchanged blocks when one block is edited', async () => {
    const renders: string[] = [];
    const Paragraph = memo(function CountingParagraph({
      children,
    }: {
      children?: ReactNode;
    }) {
      renders.push(String(children));
      return createElement('Paragraph', null, children);
    });
    const components = hostComponents({ Paragraph });
    const first = 'one\n\ntwo\n\nthree\n';
    const root = await renderTree(
      <ObjectTreeMarkdown source={first} components={components} />
    );
    expect(renders).toEqual(['one', 'two', 'three']);
    renders.length = 0;
    await root.rerender(
      <ObjectTreeMarkdown
        source={'one\n\ntwo!\n\nthree\n'}
        components={components}
      />
    );
    expect(renders).toEqual(['two!']);
  });

  it('is not part of the public API', () => {
    expect(Object.keys(api).some((k) => /object.?tree/i.test(k))).toBe(false);
  });
});
