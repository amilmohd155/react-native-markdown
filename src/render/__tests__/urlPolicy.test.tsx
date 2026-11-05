/* eslint-disable no-script-url -- dangerous URLs are the test inputs */
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { textOf } from '../../__tests__/tree';
import { Markdown, type MarkdownProps } from '../../api/Markdown';
import { hostOf, imageAllowed, type ImagesPolicy } from '../imagePolicy';
import { isOpenableUrl } from '../links';

const mount = (props: MarkdownProps) => render(<Markdown {...props} />);

const text = () => textOf(screen.container);

const images = () => screen.container.queryAll((n) => n.type === 'Image');

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

  it('renders images by default', async () => {
    await mount({ source: block });
    expect(images()).toHaveLength(1);
    await screen.unmount();
    await mount({ source: inline });
    expect(images()).toHaveLength(1);
  });

  it('shows the alt text instead of a denied block image', async () => {
    await mount({ source: block, images: 'deny' });
    expect(images()).toHaveLength(0);
    expect(text()).toBe('A cat');
  });

  it('shows the alt text instead of a denied inline image', async () => {
    await mount({ source: inline, images: 'deny' });
    expect(images()).toHaveLength(0);
    expect(text()).toBe('Look A cat here');
  });

  it('renders nothing for a denied image without alt text', async () => {
    await mount({
      source: 'a ![](https://cdn.example.com/cat.png) b',
      images: 'deny',
    });
    expect(text()).toBe('a  b');
  });

  it('keeps images from allowed hosts and denies the rest', async () => {
    const source = `${block}\n\n![Dog](https://tracker.test/dog.png)\n\nx ![Bird](/bird.png) y`;
    await mount({
      source,
      images: { allowHosts: ['*.example.com'] },
    });
    expect(images()).toHaveLength(1);
    expect(text()).toContain('Dog');
    expect(text()).toContain('x Bird y');
  });

  it('keeps the render context for an equal inline allowlist', async () => {
    let renders = 0;
    const Counting = ({ children }: { children?: unknown }) => {
      renders++;
      return <Text>{children as never}</Text>;
    };
    const props = (): MarkdownProps => ({
      source: 'one\n\ntwo',
      components: { Paragraph: Counting as never },
      images: { allowHosts: ['a.example.com'] },
    });
    const view = await mount(props());
    const first = renders;
    await view.rerender(<Markdown {...props()} />);
    expect(renders).toBe(first);
    await view.rerender(
      <Markdown {...props()} images={{ allowHosts: ['b.example.com'] }} />
    );
    expect(renders).toBeGreaterThan(first);
  });
});

describe('link URL layers', () => {
  it('keeps links with dangerous schemes as text at parse time', async () => {
    for (const href of [
      'javascript:alert(1)',
      'vbscript:x',
      'file:///etc/passwd',
      'data:text/html;base64,AAAA',
    ]) {
      await mount({ source: `[click](${href})` });
      const links = screen.container.queryAll(
        (n) => typeof n.props?.href === 'string' && n.props.href === href
      );
      expect(links).toHaveLength(0);
      expect(text()).toContain('click');
      await screen.unmount();
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
