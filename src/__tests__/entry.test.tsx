import { render, screen } from '@testing-library/react-native';
import * as entry from '..';

/**
 * The package entry point is the public API (since M5): it must export the
 * documented names and render, with nothing from v0 left.
 * Spec: docs/rewrite/04-api.md
 */
describe('package entry', () => {
  it('exports the public API', () => {
    expect(Object.keys(entry).sort()).toEqual([
      'Markdown',
      'createTheme',
      'darkTheme',
      'defaults',
      'definePlugin',
      'inlineView',
      'lightTheme',
      'parse',
      'useMarkdownTheme',
      'visit',
    ]);
  });

  it('renders markdown from the entry point', async () => {
    await render(<entry.Markdown source={'# Hi\n\n**there**'} />);
    expect(JSON.stringify(screen.toJSON())).toContain('there');
  });

  it('parses and visits through the entry point', () => {
    const headings: string[] = [];
    entry.visit(entry.parse('# One\n\n## Two'), {
      Heading: (_props, { text }) => {
        headings.push(text);
      },
    });
    expect(headings).toEqual(['One', 'Two']);
  });
});
