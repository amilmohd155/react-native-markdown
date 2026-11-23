import { renderTree } from '../../__tests__/tree';
import type { RenderCtx } from '../../render/context';
import { useMarkdownPipeline } from '../pipeline';

type Sizes = Record<string, { width: number; height: number }>;

function setup() {
  const seen: RenderCtx[] = [];
  function Probe(props: { sizes?: Sizes }) {
    seen.push(
      useMarkdownPipeline({ source: 'x', imageSizes: props.sizes }, 'Probe').ctx
    );
    return null;
  }
  return { seen, Probe };
}

describe('imageSizes (P3-36)', () => {
  it('keeps ctx for an equal inline object and renews it on change', async () => {
    const { seen, Probe } = setup();
    const tree = await renderTree(
      <Probe sizes={{ a: { width: 1, height: 2 } }} />
    );
    await tree.rerender(<Probe sizes={{ a: { width: 1, height: 2 } }} />);
    const last = seen[seen.length - 1]!;
    expect(last).toBe(seen[0]);
    expect(last.options.imageSizes).toEqual({ a: { width: 1, height: 2 } });
    await tree.rerender(<Probe sizes={{ a: { width: 1, height: 3 } }} />);
    expect(seen[seen.length - 1]).not.toBe(seen[0]);
  });
});
