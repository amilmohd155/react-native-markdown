import { useCallback, useSyncExternalStore } from 'react';
import { useRenderContext } from './contexts';

/** What `useTaskState` returns for one task item. */
export interface TaskState {
  /** The displayed state: the tap override, else the source value. `false` for a non-task item. */
  readonly checked: boolean;
  /** A tap can toggle it: toggling is enabled and no stream is running. */
  readonly interactive: boolean;
  /** Flips the box and calls `onTaskToggle`. Does nothing unless `interactive`. */
  readonly toggle: () => void;
}

const noop = () => {};

/**
 * The state and toggle of one task item, for a custom `ListItem`. The
 * default `ListItem` uses it too, so both share one store (P3-19).
 * Pass the slot's `taskIndex`, `checked` (source value) and `text`.
 */
export function useTaskState(
  taskIndex: number | null,
  checked: boolean | null,
  text: string | null
): TaskState {
  const { handlers, options, tasks } = useRenderContext();
  // Stable between renders: a new function would resubscribe every time.
  const subscribe = useCallback(
    (listener: () => void) =>
      taskIndex === null ? noop : tasks.subscribe(taskIndex, listener),
    [tasks, taskIndex]
  );
  const snapshot = useCallback(
    () => (taskIndex === null ? undefined : tasks.get(taskIndex)),
    [tasks, taskIndex]
  );
  const override = useSyncExternalStore(subscribe, snapshot);

  const interactive =
    checked !== null && taskIndex !== null && options.interactiveTasks;
  const toggle = useCallback(() => {
    if (!interactive || checked === null || taskIndex === null) return;
    const next = !(tasks.get(taskIndex) ?? checked);
    tasks.set(taskIndex, next);
    handlers.current.onTaskToggle?.({
      index: taskIndex,
      checked: next,
      text: text ?? '',
    });
  }, [interactive, checked, taskIndex, text, tasks, handlers]);

  return {
    checked: checked === null ? false : (override ?? checked),
    interactive,
    toggle,
  };
}
