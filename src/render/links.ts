import { Linking } from 'react-native';
import type { HandlersRef, LinkPressInfo } from './context';

/** Schemes the default link handler opens (P1-3). */
const OPENABLE = /^(https?|mailto|tel):/i;

/**
 * Whether the default handler opens `href`: http, https, mailto and tel
 * only. markdown-it's validateLink already rejected dangerous schemes at
 * parse time; this second layer keeps custom schemes (deep links) out of
 * `Linking.openURL` unless the app handles them in `onLinkPress`.
 * Relative URLs have no meaning to the OS, so they are only reported.
 */
export function isOpenableUrl(href: string): boolean {
  return OPENABLE.test(href.trim());
}

/**
 * A link press: `onLinkPress` first (it always receives the href, even for
 * schemes the default refuses); returning `false` cancels the default,
 * which opens allowlisted URLs with `Linking` and swallows its errors.
 */
export function pressLink(
  handlers: HandlersRef,
  href: string,
  info: LinkPressInfo
): void {
  const result = handlers.current.onLinkPress?.(href, info);
  if (result === false || !isOpenableUrl(href)) return;
  Linking.openURL(href).catch(() => {
    // No app can open it (or the user cancelled): nothing to do.
  });
}
