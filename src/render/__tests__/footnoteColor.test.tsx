import { StyleSheet } from 'react-native';
import { renderTree, textOf } from '../../__tests__/tree';
import { resolveThemeProp } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { tableFor } from './helpers';

it('footnote.definition.color reaches the definition paragraph text', async () => {
  const theme = resolveThemeProp(
    { footnote: { definition: { color: '#a00' } } },
    'light'
  );
  const ctx = createRenderCtx({
    components: Object.freeze({ ...defaultComponents }),
    theme,
  });
  const root = await renderTree(
    <BlockList table={tableFor('a[^1]\n\n[^1]: First.\n')} ctx={ctx} />
  );
  const p = root.find(
    (n) => n.type === 'Text' && textOf(n).startsWith('First.')
  );
  expect(StyleSheet.flatten(p.props.style as never)).toMatchObject({
    color: '#a00',
  });
});
