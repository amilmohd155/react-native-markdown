import { createElement } from 'react';
import { View } from 'react-native';
import { renderTree } from '../../__tests__/tree';
import { Markdown } from '../../api/Markdown';
import { defaultComponents, defaults } from '../defaults';
import type { ElementProps } from '../elements';
import { inlineView, type InlineViewProps } from '../inlineView';

describe('defaults', () => {
  it('is the built-in component map', () => {
    expect(defaults).toBe(defaultComponents);
  });

  it('can be wrapped by a custom component', async () => {
    const Mermaid = ({ source }: { source: string }) =>
      createElement('Mermaid', { source });
    const CodeBlock = (props: ElementProps<'CodeBlock'>) =>
      props.language === 'mermaid' ? (
        <Mermaid source={props.code} />
      ) : (
        <defaults.CodeBlock {...props} />
      );

    const root = await renderTree(
      <Markdown
        source={'```mermaid\ngraph TD\n```\n\n```js\nlet x\n```'}
        components={{ CodeBlock }}
      />
    );
    expect(root.find('Mermaid').props.source).toContain('graph TD');
    expect(JSON.stringify(root.toJSON())).toContain('let x');
  });
});

describe('inlineView() through <Markdown>', () => {
  it('declares a built-in inline element, which receives baseline', async () => {
    let seen: InlineViewProps<'Link'> | undefined;
    const LinkChip = (props: InlineViewProps<'Link'>) => {
      seen = props;
      return createElement(View, null, props.children);
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const root = await renderTree(
      <Markdown
        source="see [docs](https://x.dev)"
        components={{ Link: inlineView(LinkChip) }}
      />
    );
    expect(seen?.href).toBe('https://x.dev');
    expect(seen?.baseline).toEqual({
      fontSize: expect.any(Number),
      lineHeight: expect.any(Number),
    });
    expect(root.findAll('View').length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
