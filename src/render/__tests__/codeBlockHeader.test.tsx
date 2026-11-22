import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockProviders } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import type { ElementProps } from '../elements';

type HeaderProps = Omit<ElementProps<'CodeBlockHeader'>, 'style'>;

const BASE: HeaderProps = {
  language: 'ts',
  code: 'const a = 1;',
  open: false,
  wrap: false,
  onToggleWrap: null,
  onCopy: null,
};

async function renderHeader(props: Partial<HeaderProps> = {}) {
  const ctx = createRenderCtx({
    components: defaultComponents,
    maxFontSizeMultiplier: 1.5,
  });
  const Header = defaultComponents.CodeBlockHeader;
  await render(
    <BlockProviders ctx={ctx}>
      <Header {...BASE} {...props} style={ctx.theme.elements.CodeBlockHeader} />
    </BlockProviders>
  );
}

describe('default CodeBlockHeader', () => {
  it('shows the language and no buttons without callbacks', async () => {
    await renderHeader();
    expect(screen.getByText('ts')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([null, ''])(
    'labels a block without a language "plaintext" (%p)',
    async (language) => {
      await renderHeader({ language });
      expect(screen.getByText('plaintext')).toBeTruthy();
      expect(screen.queryByText('ts')).toBeNull();
    }
  );

  it('shows Wrap with its state and wires onToggleWrap', async () => {
    const onToggleWrap = jest.fn();
    await renderHeader({ onToggleWrap, wrap: true });
    const wrap = screen.getByRole('button', { name: 'Wrap lines' });
    expect(wrap).toBeSelected();
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
    fireEvent.press(wrap);
    expect(onToggleWrap).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'exposes Wrap %s as aria-pressed for web',
    async (wrap) => {
      await renderHeader({ onToggleWrap: () => {}, wrap });
      const button = screen.getByRole('button', { name: 'Wrap lines' });
      expect(button.props['aria-pressed']).toBe(wrap);
      expect(button.props.accessibilityState.selected).toBe(wrap);
    }
  );

  it('underlines the Wrap label only while wrap is on', async () => {
    const underline = expect.objectContaining({
      textDecorationLine: 'underline',
    });
    await renderHeader({ onToggleWrap: () => {}, wrap: true });
    expect(StyleSheet.flatten(screen.getByText('Wrap').props.style)).toEqual(
      underline
    );
    await renderHeader({ onToggleWrap: () => {}, wrap: false });
    expect(
      StyleSheet.flatten(screen.getByText('Wrap').props.style)
    ).not.toEqual(underline);
  });

  it('keeps the theme text style under the Wrap cue', async () => {
    await renderHeader({ onToggleWrap: () => {}, wrap: true });
    const style = screen.getByText('Wrap').props.style;
    expect(style[0]).toBe(screen.getByText('ts').props.style);
  });

  it('shows Copy and wires onCopy', async () => {
    const onCopy = jest.fn();
    await renderHeader({ onCopy });
    const copy = screen.getByRole('button', { name: 'Copy code' });
    expect(copy).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Wrap lines' })).toBeNull();
    fireEvent.press(copy);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('disables Copy while the fence is open', async () => {
    const onCopy = jest.fn();
    await renderHeader({ onCopy, open: true });
    const copy = screen.getByRole('button', { name: 'Copy code' });
    expect(copy).toBeDisabled();
    fireEvent.press(copy);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('caps font scaling like the code block', async () => {
    await renderHeader({ onCopy: () => {} });
    expect(screen.getByText('ts').props.maxFontSizeMultiplier).toBe(1.5);
    expect(screen.getByText('Copy').props.maxFontSizeMultiplier).toBe(1.5);
  });
});
