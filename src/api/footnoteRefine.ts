import type { FootnoteFocusStore } from '../render/footnoteFocus';

/** How long a press waits for a definition's y after the first scroll. */
const FOOTNOTE_REFINE_TIMEOUT = 5000;

/**
 * Calls `refine(y)` once the definition `label` has a y (P3-15): at once when
 * it is known, otherwise when it is measured, for at most
 * `FOOTNOTE_REFINE_TIMEOUT`. Returns the cancel.
 */
export function refineOnMeasure(
  store: FootnoteFocusStore,
  label: string,
  refine: (y: number) => void
): () => void {
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    off?.();
    off = null;
    clearTimeout(timer);
  };
  const known = store.getDefinitionY(label);
  if (known !== undefined) {
    refine(known);
    return cancel;
  }
  off = store.onDefinitionY((changed) => {
    if (changed !== label) return;
    const y = store.getDefinitionY(label);
    cancel();
    if (y !== undefined) refine(y);
  });
  timer = setTimeout(cancel, FOOTNOTE_REFINE_TIMEOUT);
  return cancel;
}
