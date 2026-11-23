import { useEffect, useRef, useState } from 'react';
import { useRenderContext } from './contexts';
import { cachedImageSize, type ImageSize } from './imageSize';

/**
 * Calls `onImageError` once per failed size lookup this image saw start: a
 * remount onto a cached error does not report it again, and a retry that
 * fails reports again. `size` is the value of `useImageSize`.
 */
export function useImageErrorReport(
  src: string,
  alt: string,
  title: string | null,
  size: ImageSize | 'error' | null,
  provided: ImageSize | undefined
): void {
  const { handlers } = useRenderContext();
  // Unknown at mount: this component's subscription starts the lookup.
  const [unknownAtMount] = useState(
    () => cachedImageSize(src, provided) === undefined
  );
  const lookedUp = useRef(unknownAtMount);
  const failed = size === 'error';
  const loading = size === null;
  useEffect(() => {
    if (!failed) {
      lookedUp.current = loading;
    } else if (lookedUp.current) {
      lookedUp.current = false;
      handlers.current.onImageError?.({ src, alt, title });
    }
    // `alt` and `title` are the same image's: only a new lookup reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, loading, src]);
}
