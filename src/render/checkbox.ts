import type { Insets } from 'react-native';

/** Minimum touch target of the task checkbox, in points (P3-20). */
const MIN_TOUCH_TARGET = 44;

/**
 * `hitSlop` for a checkbox box `size` points wide in a marker column `room`
 * wide, in a list whose items are `gap` apart. The visual size stays as is.
 *
 * Width reaches 44pt. The item content is a later sibling that covers
 * everything right of the column, so the right slop stops there
 * (`room - box width`) and the left slop, over the list gutter, makes up
 * the rest. Height is the line plus at most half the gap above and below:
 * 44pt tall is not reachable in a tight list (`gap` 0) without the targets
 * of neighbouring rows overlapping, so there it stays the line height.
 */
export function checkboxHitSlop(
  size: number,
  lineHeight: number,
  gap: number,
  room: number
): Insets {
  const right = Math.max(
    0,
    Math.min(Math.ceil((MIN_TOUCH_TARGET - size) / 2), Math.floor(room - size))
  );
  const left = Math.max(0, Math.ceil(MIN_TOUCH_TARGET - size - right));
  const y = Math.max(
    0,
    Math.min(
      Math.ceil((MIN_TOUCH_TARGET - lineHeight) / 2),
      Math.floor(gap / 2)
    )
  );
  return { top: y, bottom: y, left, right };
}
