import { renderTree } from '../../__tests__/tree';
import { getDefaultTheme, resolveTheme } from '../../theme';
import {
  createRenderCtx,
  DEFAULT_FOOTNOTE_BACK_LINK_MARK,
  DEFAULT_FOOTNOTE_LABELS,
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
      interactiveTasks: true,
      interactiveImages: false,
      interactiveFootnotes: false,
      footnoteFocus: null,
      footnoteLabels: DEFAULT_FOOTNOTE_LABELS,
      footnoteBackLinkMark: DEFAULT_FOOTNOTE_BACK_LINK_MARK,
      scriptFallback: 'smaller',
      images: 'allow',
      codeBlock: {
        header: false,
        lineNumbers: false,
        wrap: false,
        copyable: false,
      },
    });
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('makes tasks interactive by default, with or without onTaskToggle', () => {
    expect(createRenderCtx({ components }).options.interactiveTasks).toBe(true);
    expect(
      createRenderCtx({ components, interactiveTasks: false }).options
        .interactiveTasks
    ).toBe(false);
  });

  it('resolves codeBlock and makes it copyable with onCopyPress', () => {
    const ctx = createRenderCtx({
      components,
      codeBlock: { wrap: true },
      handlers: { onCopyPress: () => {} },
    });
    expect(ctx.options.codeBlock).toEqual({
      header: false,
      lineNumbers: false,
      wrap: true,
      copyable: true,
    });
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
    await update({ components, theme: resolveTheme({}) });
    await update({ components: Object.freeze({}) as Components });
    expect(new Set(seen).size).toBe(3);
  });

  it('changes ctx when interactiveTasks flips, keeping the task store', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, interactiveTasks: false });
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]!.options.interactiveTasks).toBe(false);
    expect(seen[1]!.tasks).toBe(seen[0]!.tasks);
  });

  it('keeps ctx when onTaskToggle is added', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, handlers: { onTaskToggle: () => {} } });
    expect(new Set(seen).size).toBe(1);
  });

  it('keeps ctx and its task store when the reset key changes', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, taskResetKey: 'x' });
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1]!.tasks).toBe(seen[0]!.tasks);
  });

  it('keeps ctx with a new inline codeBlock of the same values', async () => {
    const { seen, update } = await renderCtx({
      components,
      codeBlock: { header: true },
    });
    await update({ components, codeBlock: { header: true } });
    await update({ components, codeBlock: { header: true, wrap: false } });
    expect(new Set(seen).size).toBe(1);
  });

  it('changes ctx when a codeBlock flag changes', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, codeBlock: { lineNumbers: true } });
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[0]!.options.codeBlock.lineNumbers).toBe(false);
    expect(seen[1]!.options.codeBlock.lineNumbers).toBe(true);
  });

  it('changes ctx when onCopyPress is added, not when it changes', async () => {
    const { seen, update } = await renderCtx({ components });
    await update({ components, handlers: { onCopyPress: () => {} } });
    await update({ components, handlers: { onCopyPress: () => {} } });
    expect(seen[0]!.options.codeBlock.copyable).toBe(false);
    expect(seen[1]!.options.codeBlock.copyable).toBe(true);
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).toBe(seen[1]);
  });
});
