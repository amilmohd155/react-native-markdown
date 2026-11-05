/// <reference lib="dom" />
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Image, Linking } from 'react-native';
import { WEB_FIXTURES } from '../../../test/web/fixtures';
import { clearImageSizeCache } from '../../render/imageSize';
import { Markdown } from '../Markdown';

/**
 * The renderer tests again under react-native-web + jsdom (D1, 06-testing.md ·
 * Platform tests). Assertions go through the DOM, not RN host nodes.
 */
afterEach(() => {
  clearImageSizeCache();
  jest.restoreAllMocks();
});

describe('fixtures', () => {
  it.each(WEB_FIXTURES)(
    '$name renders its text',
    async ({ source, text, images = [] }) => {
      const { container } = render(<Markdown source={source} />);
      await act(async () => {});
      const content = container.textContent ?? '';
      for (const t of text) expect(content).toContain(t);
      for (const alt of images) {
        expect(container.querySelector(`img[alt="${alt}"]`)).not.toBeNull();
      }
    }
  );
});

describe('structure', () => {
  // Known web gaps (accessibility polish, phase 3): lists and tables have no
  // ARIA roles, and every heading is an <h1> (RN has no aria-level).
  it('gives headings the heading role', () => {
    render(<Markdown source={'# Title\n\n### Third'} />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Third' })).toBeTruthy();
  });

  it('renders the safe HTML subset as text, not markup', () => {
    const { container } = render(
      <Markdown source={'a <u>under</u> <script>alert(1)</script>'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('under');
  });
});

describe('links', () => {
  it('opens http(s) links through Linking by default', () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);
    render(<Markdown source="[docs](https://example.com/docs)" />);
    fireEvent.click(screen.getByRole('link', { name: 'docs' }));
    expect(openURL).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('cancels the default when onLinkPress returns false', () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);
    const onLinkPress = jest.fn(() => false);
    render(
      <Markdown
        source="[docs](https://example.com)"
        onLinkPress={onLinkPress}
      />
    );
    fireEvent.click(screen.getByRole('link', { name: 'docs' }));
    expect(onLinkPress).toHaveBeenCalledWith('https://example.com', {
      title: null,
    });
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('task lists', () => {
  it('reports the new state of a clicked checkbox', () => {
    const onTaskToggle = jest.fn();
    render(
      <Markdown source={'- [ ] a\n- [x] b'} onTaskToggle={onTaskToggle} />
    );
    const [first, second] = screen.getAllByRole('checkbox');
    fireEvent.click(first!);
    fireEvent.click(second!);
    expect(onTaskToggle.mock.calls).toEqual([
      [true, { index: 0 }],
      [false, { index: 1 }],
    ]);
  });
});

describe('images', () => {
  // react-native-web's Image.getSize has only the callback form and returns
  // nothing; the renderer must not depend on a returned promise.
  it('sizes an image through the callback form of Image.getSize', async () => {
    const getSize = jest.spyOn(Image, 'getSize').mockImplementation(((
      _src: string,
      success: (w: number, h: number) => void
    ) => {
      success(200, 100);
    }) as never);
    render(<Markdown source="![alt](https://example.com/a.png)" />);
    await act(async () => {});
    expect(getSize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'alt' })).toBeTruthy();
  });

  it('does not throw when react-native-web sizes an image', async () => {
    expect(() =>
      render(<Markdown source="![alt](https://example.com/a.png)" />)
    ).not.toThrow();
    await act(async () => {});
  });

  it('shows the alt text for a denied image', () => {
    const { container } = render(
      <Markdown
        source="![nope](https://evil.test/a.png)"
        images={{ allowHosts: ['example.com'] }}
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('nope');
  });
});

describe('memoization', () => {
  it('re-rendering with the same source renders no block again', () => {
    let renders = 0;
    const Paragraph = (props: { children?: unknown }) => {
      renders++;
      return <p>{props.children as never}</p>;
    };
    const source = 'one\n\ntwo';
    const { rerender } = render(
      <Markdown
        source={source}
        components={{ Paragraph: Paragraph as never }}
      />
    );
    const first = renders;
    rerender(
      <Markdown
        source={source}
        components={{ Paragraph: Paragraph as never }}
      />
    );
    expect(first).toBe(2);
    expect(renders).toBe(first);
  });
});
