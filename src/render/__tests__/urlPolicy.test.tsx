/* eslint-disable no-script-url -- dangerous URLs are the test inputs */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Markdown, type MarkdownProps } from '../../api/Markdown';
import { hostOf, imageAllowed, type ImagesPolicy } from '../imagePolicy';
import { isOpenableUrl } from '../links';

function mount(props: MarkdownProps): ReactTestRenderer {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<Markdown {...props} />);
  });
  return root;
}

function text(root: ReactTestRenderer): string {
  const collect = (node: unknown): string => {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && 'children' in node) {
      return ((node as { children: unknown[] | null }).children ?? [])
        .map(collect)
        .join('');
    }
    return '';
  };
  return collect(root.toJSON());
}

const images = (root: ReactTestRenderer) =>
  root.root.findAll((n) => (n.type as unknown) === 'Image');

describe('hostOf', () => {
  it.each([
    ['https://example.com/a.png', 'example.com'],
    ['HTTP://Example.COM/a.png', 'example.com'],
    ['https://example.com:8080/a.png', 'example.com'],
    ['https://example.com./a.png', 'example.com'],
    ['//cdn.example.com/a.png', 'cdn.example.com'],
    ['https://user:pw@example.com/a.png', 'example.com'],
    ['https://allowed.com@evil.com/a.png', 'evil.com'],
    ['https://example.com?x=@evil.com', 'example.com'],
    ['https://example.com#@evil.com', 'example.com'],
    ['https://[::1]:3000/a.png', '[::1]'],
  ])('reads the host of %s', (src, host) => {
    expect(hostOf(src)).toBe(host);
  });

  it.each([
    '/relative/a.png',
    'a.png',
    'data:image/png;base64,AAAA',
    'ftp://example.com/a.png',
    'https://',
    'https://example.com\\@evil.com/a.png',
    'https://exa mple.com/a.png',
    'https://example.com/\u0000.png',
  ])('refuses to read %j', (src) => {
    expect(hostOf(src)).toBeNull();
  });
});

describe('imageAllowed', () => {
  const allow = (...allowHosts: string[]): ImagesPolicy => ({ allowHosts });

  it('allows everything by default, nothing with deny', () => {
    expect(imageAllowed('allow', '/x.png')).toBe(true);
    expect(imageAllowed('allow', 'data:image/png;base64,AAAA')).toBe(true);
    expect(imageAllowed('deny', 'https://example.com/x.png')).toBe(false);
  });

  it('matches exact hosts, case-insensitively', () => {
    const policy = allow('Images.Example.com');
    expect(imageAllowed(policy, 'https://images.example.com/a.png')).toBe(true);
    expect(imageAllowed(policy, 'https://example.com/a.png')).toBe(false);
    expect(imageAllowed(policy, 'https://x.images.example.com/a.png')).toBe(
      false
    );
  });

  it('matches *. wildcards on subdomains only', () => {
    const policy = allow('*.example.com');
    expect(imageAllowed(policy, 'https://cdn.example.com/a.png')).toBe(true);
    expect(imageAllowed(policy, 'https://a.b.example.com/a.png')).toBe(true);
    expect(imageAllowed(policy, 'https://example.com/a.png')).toBe(false);
    expect(imageAllowed(policy, 'https://notexample.com/a.png')).toBe(false);
    expect(imageAllowed(policy, 'https://example.com.evil.com/a.png')).toBe(
      false
    );
  });

  it('refuses relative, data and unreadable URLs under an allowlist', () => {
    const policy = allow('example.com');
    expect(imageAllowed(policy, '/a.png')).toBe(false);
    expect(imageAllowed(policy, 'data:image/png;base64,AAAA')).toBe(false);
    expect(imageAllowed(policy, 'https://example.com\\@evil.com/a.png')).toBe(
      false
    );
  });

  it('is not fooled by userinfo', () => {
    expect(
      imageAllowed(allow('allowed.com'), 'https://allowed.com@evil.com/a.png')
    ).toBe(false);
  });

  it('refuses everything with an empty allowlist', () => {
    expect(imageAllowed(allow(), 'https://example.com/a.png')).toBe(false);
  });
});

describe('<Markdown images>', () => {
  const block = '![A cat](https://cdn.example.com/cat.png)';
  const inline = 'Look ![A cat](https://cdn.example.com/cat.png) here';

  it('renders images by default', () => {
    expect(images(mount({ source: block }))).toHaveLength(1);
    expect(images(mount({ source: inline }))).toHaveLength(1);
  });

  it('shows the alt text instead of a denied block image', () => {
    const root = mount({ source: block, images: 'deny' });
    expect(images(root)).toHaveLength(0);
    expect(text(root)).toBe('A cat');
  });

  it('shows the alt text instead of a denied inline image', () => {
    const root = mount({ source: inline, images: 'deny' });
    expect(images(root)).toHaveLength(0);
    expect(text(root)).toBe('Look A cat here');
  });

  it('renders nothing for a denied image without alt text', () => {
    const root = mount({
      source: 'a ![](https://cdn.example.com/cat.png) b',
      images: 'deny',
    });
    expect(text(root)).toBe('a  b');
  });

  it('keeps images from allowed hosts and denies the rest', () => {
    const source = `${block}\n\n![Dog](https://tracker.test/dog.png)\n\nx ![Bird](/bird.png) y`;
    const root = mount({
      source,
      images: { allowHosts: ['*.example.com'] },
    });
    expect(images(root)).toHaveLength(1);
    expect(text(root)).toContain('Dog');
    expect(text(root)).toContain('x Bird y');
  });

  it('keeps the render context for an equal inline allowlist', () => {
    let renders = 0;
    const Counting = ({ children }: { children?: unknown }) => {
      renders++;
      return <>{children as never}</>;
    };
    const props = (): MarkdownProps => ({
      source: 'one\n\ntwo',
      components: { Paragraph: Counting as never },
      images: { allowHosts: ['a.example.com'] },
    });
    const root = mount(props());
    const first = renders;
    act(() => root.update(<Markdown {...props()} />));
    expect(renders).toBe(first);
    act(() =>
      root.update(
        <Markdown {...props()} images={{ allowHosts: ['b.example.com'] }} />
      )
    );
    expect(renders).toBeGreaterThan(first);
  });
});

describe('link URL layers', () => {
  it('keeps links with dangerous schemes as text at parse time', () => {
    for (const href of [
      'javascript:alert(1)',
      'vbscript:x',
      'file:///etc/passwd',
      'data:text/html;base64,AAAA',
    ]) {
      const root = mount({ source: `[click](${href})` });
      const links = root.root.findAll(
        (n) => typeof n.props?.href === 'string' && n.props.href === href
      );
      expect(links).toHaveLength(0);
      expect(text(root)).toContain('click');
    }
  });

  it('opens only http, https, mailto and tel by default', () => {
    expect(isOpenableUrl('https://a.test')).toBe(true);
    expect(isOpenableUrl('HTTP://a.test')).toBe(true);
    expect(isOpenableUrl(' mailto:a@b.test')).toBe(true);
    expect(isOpenableUrl('tel:+123')).toBe(true);
    expect(isOpenableUrl('myapp://deep/link')).toBe(false);
    expect(isOpenableUrl('intent://x#Intent;end')).toBe(false);
    expect(isOpenableUrl('/relative')).toBe(false);
    expect(isOpenableUrl('//host/path')).toBe(false);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
  });
});
