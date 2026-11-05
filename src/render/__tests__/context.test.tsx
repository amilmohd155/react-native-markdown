import { renderTree } from '../../__tests__/tree';
import { getDefaultTheme, lightTheme, resolveTheme } from '../../theme';
import {
  createRenderCtx,
  useRenderCtx,
  type RenderCtx,
  type RenderCtxInput,
} from '../context';
import type { Components } from '../elements';

// The default element map arrives in later M3 tasks; ctx only stores it.
const components = Object.freeze({}) as Components;

async function renderCtx(initial: RenderCtxInput) {
  const seen: RenderCtx[] = [];
  function Probe(props: RenderCtxInput) {
    seen.push(useRenderCtx(props));
    return null;
  }
  const tree = await renderTree(<Probe {...initial} />);
  return {
    seen,
    update(next: RenderCtxInput) {
      return tree.rerender(<Probe {...next} />);
    },
  };
}

describe('createRenderCtx', () => {
  it('fills defaults', () => {
    const ctx = createRenderCtx({ components });
    expect(ctx.theme).toBe(getDefaultTheme());
    expect(ctx.options).toEqual({
      softBreak: 'space',
      selectable: false,
      maxFontSizeMultiplier: null,
      interactiveTasks: false,
      interactiveImages: false,
      interactiveFootnotes: false,
      scriptFallback: 'smaller',
      images: 'allow',
    });
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('makes tasks interactive only with onTaskToggle', () => {
    const ctx = createRenderCtx({
      components,
      handlers: { onTaskToggle: () => {} },
    });
    expect(ctx.options.interactiveTasks).toBe(true);
  });
});

describe('useRenderCtx', () => {
  it('keeps ctx identity across re-renders with new inline handlers', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { seen, update } = await renderCtx({
      components,
      handlers: { onLinkPress: first },
    });
    await update({ components, handlers: { onLinkPress: second } });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    // Calls go to the latest handler.
    seen[1]!.handlers.current.onLinkPress?.('https://x', { title: null });
    expect(second).toHaveBeenCalledWith('https://x', { title: null });
    expect(first).not.toHaveBeenCalled();
  });

  it('changes ctx when an option changes', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, softBreak: 'newline' });
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]!.options.softBreak).toBe('newline');
  });

  it('changes ctx when the theme or the component map changes', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, theme: resolveTheme(lightTheme) });
    await update({ components: Object.freeze({}) as Components });
    expect(new Set(seen).size).toBe(3);
  });

  it('changes ctx when onTaskToggle is added', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, handlers: { onTaskToggle: () => {} } });
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]!.options.interactiveTasks).toBe(true);
  });
});
