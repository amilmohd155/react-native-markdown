import { useSyncExternalStore } from 'react';

/**
 * Footnote focus (P3-15): where each definition sits inside the footnote
 * section, and which definition or reference is flashing. One store per
 * `<Markdown>`, created by the pipeline and reached through `ctx.options`.
 * It lives outside `ctx` state on purpose: a change must re-render only the
 * flashing element, never every block.
 */

export type FootnoteFocusTarget =
  | { readonly kind: 'definition'; readonly label: string }
  | {
      readonly kind: 'reference';
      readonly label: string;
      /** 1-based, as `FootnotePressInfo.reference`. */
      readonly reference: number;
    };

/** Resolved `footnotes.highlight`. */
export interface FootnoteHighlight {
  /** `null`: the theme's `footnoteHighlight` colour. */
  readonly color: string | null;
  /** Milliseconds of the whole flash (fade in and out). */
  readonly duration: number;
}

export const DEFAULT_FOOTNOTE_HIGHLIGHT_DURATION = 1500;

/** The render options part of P3-15. Keep it stable: it is part of `ctx` identity. */
export interface FootnoteFocusConfig {
  readonly store: FootnoteFocusStore;
  /** `'definition'`: definitions report their y and a press can scroll to one. */
  readonly target: 'section' | 'definition';
  /** `null`: no flash. */
  readonly highlight: FootnoteHighlight | null;
}

export interface FootnoteFocusStore {
  /** y of a definition inside the footnote section; `undefined` forgets it. */
  setDefinitionY(label: string, y: number | undefined): void;
  getDefinitionY(label: string): number | undefined;
  /** Called with the label whenever a definition's y is set (not on forget). */
  onDefinitionY(listener: (label: string) => void): () => void;
  /** Starts a flash on `target`, replacing the current one. */
  flash(target: FootnoteFocusTarget): void;
  /** Ends the flash and forgets every y (a stream `reset()`). */
  clear(): void;
  /** For `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
  /** The flash token for `key` (see `footnoteFocusKey`), or 0 when not flashing. */
  getFlashToken(key: string): number;
  /**
   * Plays the flash `token` once: the first `owner` to claim it gets `true`
   * (and again on a re-run of its effect), any other owner `false`. A
   * definition that unmounts and mounts again in a virtualized list is a new
   * owner and must not replay a flash that was already shown.
   */
  claim(token: number, owner: object): boolean;
}

export function footnoteFocusKey(target: FootnoteFocusTarget): string {
  return target.kind === 'definition'
    ? `d:${target.label}`
    : `r:${target.label}:${target.reference}`;
}

export function createFootnoteFocusStore(): FootnoteFocusStore {
  const ys = new Map<string, number>();
  const yListeners = new Set<(label: string) => void>();
  const listeners = new Set<() => void>();
  let flashKey: string | null = null;
  let token = 0;
  let claimedToken = 0;
  let claimedOwner: object | null = null;

  const notify = () => {
    for (const l of [...listeners]) l();
  };

  return {
    setDefinitionY(label, y) {
      if (y === undefined) {
        ys.delete(label);
        return;
      }
      ys.set(label, y);
      for (const l of [...yListeners]) l(label);
    },
    getDefinitionY: (label) => ys.get(label),
    onDefinitionY(listener) {
      yListeners.add(listener);
      return () => {
        yListeners.delete(listener);
      };
    },
    flash(target) {
      flashKey = footnoteFocusKey(target);
      token += 1;
      notify();
    },
    clear() {
      ys.clear();
      claimedToken = 0;
      claimedOwner = null;
      if (flashKey !== null) {
        flashKey = null;
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getFlashToken: (key) => (key === flashKey ? token : 0),
    claim(t, owner) {
      if (t !== claimedToken) {
        claimedToken = t;
        claimedOwner = owner;
        return true;
      }
      return claimedOwner === owner;
    },
  };
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * The flash token of `key` (0 = not flashing; a new flash on the same
 * target gives a new token, which restarts the animation). Re-renders the
 * caller only when its own token changes. No store: always 0.
 */
export function useFootnoteFlashToken(
  store: FootnoteFocusStore | undefined,
  key: string
): number {
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? store.getFlashToken(key) : 0),
    () => 0
  );
}
