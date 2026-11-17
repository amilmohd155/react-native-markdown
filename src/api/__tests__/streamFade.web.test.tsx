/// <reference lib="dom" />
/**
 * `streamingConfig.animation` under react-native-web (P2b-5): the fade runs
 * on the JS driver (the web has no native one, and asking for it warns),
 * and Reduce Motion is read from react-native-web's `AccessibilityInfo`.
 *
 * jsdom has no `matchMedia`, where react-native-web reports Reduce Motion
 * as on, so the tests set it. Not proven: the opacity frames of a real
 * browser (jsdom reports the end value).
 */
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { resetReduceMotionCache } from '../fade';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const probe = {} as { current: UseMarkdownStreamResult };

function Streamed() {
  const stream = useMarkdownStream({ streamingConfig: { animation: 'fade' } });
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} />;
}

/** Elements with an inline opacity: the fade wrappers. */
const wrappers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
    (div) => div.style.opacity !== ''
  );

beforeEach(() => {
  jest.useFakeTimers();
  resetReduceMotionCache();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('fades new blocks with the JS driver and no warning', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  const warn = jest.spyOn(console, 'warn');
  const error = jest.spyOn(console, 'error');
  const { container } = render(<Streamed />);
  await act(async () => {});
  await act(async () => probe.current.append('One.\n\nTwo.'));
  expect(wrappers(container).map((div) => div.textContent)).toEqual([
    'One.',
    'Two.',
  ]);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(timing).toHaveBeenCalledTimes(2);
  for (const [, config] of timing.mock.calls) {
    expect(config).toMatchObject({ duration: 200, useNativeDriver: false });
  }
  expect(wrappers(container).map((div) => div.style.opacity)).toEqual([
    '1',
    '1',
  ]);
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it('Reduce Motion (the jsdom default) turns it off', async () => {
  const { container } = render(<Streamed />);
  await act(async () => {});
  await act(async () => probe.current.append('One.\n\nTwo.'));
  expect(container.textContent).toContain('Two.');
  expect(wrappers(container)).toHaveLength(0);
});
