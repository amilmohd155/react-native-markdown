import { resolveThemeProp } from '../cache';
import { resolveTheme } from '../resolve';
import { resetThemeWarnings } from '../warn';

describe('table column width bounds', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetThemeWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('defaults to 48 and 280, frozen', () => {
    const { tableColumns } = resolveTheme({});
    expect(tableColumns).toEqual({ min: 48, max: 280 });
    expect(Object.isFrozen(tableColumns)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('takes overrides, including 0', () => {
    expect(
      resolveTheme({ table: { minColumnWidth: 0, maxColumnWidth: 400 } })
        .tableColumns
    ).toEqual({ min: 0, max: 400 });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity])('warns and defaults for %p', (v) => {
    const t = resolveTheme({
      table: { minColumnWidth: v, maxColumnWidth: v },
    });
    expect(t.tableColumns).toEqual({ min: 48, max: 280 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('raises max to min when min > max', () => {
    const t = resolveTheme({
      table: { minColumnWidth: 300, maxColumnWidth: 100 },
    });
    expect(t.tableColumns).toEqual({ min: 300, max: 300 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('raises a default max when only min exceeds it', () => {
    expect(
      resolveTheme({ table: { minColumnWidth: 500 } }).tableColumns
    ).toEqual({ min: 500, max: 500 });
  });

  it('keeps the theme cache identity', () => {
    const input = { table: { minColumnWidth: 60 } };
    expect(resolveThemeProp(input, 'light')).toBe(
      resolveThemeProp(input, 'light')
    );
  });
});
