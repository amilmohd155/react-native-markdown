import { createElement, type ComponentType } from 'react';
import { Image } from 'react-native';
import { render } from '@testing-library/react-native';
import { gallery } from '../../example/src/gallery';
import { Markdown } from '../api/Markdown';
import { defaultComponents } from '../render/defaults';
import type { Components } from '../render/elements';
import { isInlineView, markInlineView } from '../render/inlineView';
import { ELEMENT_NAMES, type ElementName } from '../theme';

/**
 * The example app's gallery document promises every element at least once
 * (it is the Playground's default text). Rendering it through spies on
 * every default element checks that, so a new element without a place in
 * the gallery fails here.
 */
describe('example gallery', () => {
  let getSize: jest.SpyInstance;
  beforeEach(() => {
    getSize = jest.spyOn(Image, 'getSize') as jest.SpyInstance;
    getSize.mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => getSize.mockRestore());

  it('renders every element', async () => {
    const seen = new Set<ElementName>();
    const spies: Record<string, unknown> = {};
    for (const name of ELEMENT_NAMES) {
      const Default = defaultComponents[name] as ComponentType<object>;
      const Spy = (props: object) => {
        seen.add(name);
        return createElement(Default, props);
      };
      spies[name] = isInlineView(Default) ? markInlineView(Spy) : Spy;
    }
    await render(
      <Markdown
        source={gallery}
        components={spies as Partial<Components>}
        onTaskToggle={() => {}}
        onFootnotePress={() => {}}
      />
    );
    expect(ELEMENT_NAMES.filter((name) => !seen.has(name))).toEqual([]);
  });
});
