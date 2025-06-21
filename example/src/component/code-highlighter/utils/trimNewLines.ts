export function trimNewlines(value: string): string {
  const start = value.search(/[^\r\n]/);
  if (start === -1) return '';

  const end = value.search(/[\r\n]*$/);

  return value.slice(start, end);
}
