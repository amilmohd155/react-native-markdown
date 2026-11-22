import { Image, StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { find } from '../../__tests__/tree';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { clearImageSizeCache } from '../imageSize';
import { createTheme, resolveTheme, type FlatThemeInput } from '../../theme';
import { tableFor } from './helpers';

let getSize: jest.SpyInstance;

beforeEach(() => {
  clearImageSizeCache();
  getSize = jest.spyOn(Image, 'getSize');
  getSize.mockResolvedValue({ width: 200, height: 100 });
});
afterEach(() => getSize.mockRestore());

function renderSource(source: string, theme: FlatThemeInput) {
  const ctx = createRenderCtx({
    theme: resolveTheme(createTheme(theme)),
    components: defaultComponents,
  });
  return render(<BlockList table={tableFor(source)} ctx={ctx} />);
}

async function mount(source: string, theme: FlatThemeInput) {
  await renderSource(source, theme);
  await waitFor(() => expect(getSize).toHaveBeenCalled());
  await screen.findByLabelText('a');
}

const styleOf = () =>
  StyleSheet.flatten(find(screen.container, 'Image').props.style) as Record<
    string,
    unknown
  >;
const modeOf = () => find(screen.container, 'Image').props.resizeMode;

describe('block image sizing', () => {
  it('natural ratio, contain, by default', async () => {
    await mount('![a](x.png)', {});
    await waitFor(() => expect(styleOf().aspectRatio).toBe(2));
    expect(modeOf()).toBe('contain');
  });

  it('height is fixed and keeps contain', async () => {
    await mount('![a](x.png)', { image: { height: 80 } });
    await waitFor(() => expect(styleOf().height).toBe(80));
    expect(styleOf().aspectRatio).toBeUndefined();
    expect(modeOf()).toBe('contain');
  });

  it('maxHeight caps the natural ratio and defaults to cover', async () => {
    await mount('![a](x.png)', { image: { maxHeight: 60, height: 80 } });
    await waitFor(() => expect(styleOf().maxHeight).toBe(60));
    expect(styleOf().aspectRatio).toBe(2);
    expect(styleOf().height).toBeUndefined();
    expect(modeOf()).toBe('cover');
  });

  it('aspectRatio wins over maxHeight and height', async () => {
    await mount('![a](x.png)', {
      image: { aspectRatio: 1, maxHeight: 60, height: 80 },
    });
    await waitFor(() => expect(styleOf().aspectRatio).toBe(1));
    expect(styleOf().maxHeight).toBeUndefined();
    expect(styleOf().height).toBeUndefined();
    expect(modeOf()).toBe('cover');
  });

  it('explicit resizeMode beats the default', async () => {
    await mount('![a](x.png)', {
      image: { aspectRatio: 1, resizeMode: 'stretch' },
    });
    await waitFor(() => expect(modeOf()).toBe('stretch'));
  });
});

describe('inline image size', () => {
  it('scales the image to fit a square of `size`', async () => {
    await mount('text ![a](x.png) text', { inlineImage: { size: 40 } });
    await waitFor(() =>
      expect(styleOf()).toMatchObject({ width: 40, height: 20 })
    );
  });
});

describe('before the size is known', () => {
  beforeEach(() => {
    getSize.mockReturnValue(new Promise(() => {}));
  });
  const mountPending = (theme: FlatThemeInput) =>
    renderSource('![a](x.png)', theme);

  it('holds 16:9 by default (also with no image theme)', async () => {
    await mountPending({});
    expect(styleOf().aspectRatio).toBeCloseTo(16 / 9);
  });

  it('holds the fixed height', async () => {
    await mountPending({ image: { height: 80 } });
    expect(styleOf().height).toBe(80);
  });

  it('holds 16:9 under the maxHeight cap', async () => {
    await mountPending({ image: { maxHeight: 60 } });
    expect(styleOf()).toMatchObject({ maxHeight: 60 });
    expect(styleOf().aspectRatio).toBeCloseTo(16 / 9);
  });
});
