/**
 * GitHub-style heading slugs: lowercase, punctuation removed, spaces become
 * hyphens, duplicates get `-1`, `-2`, … suffixes in document order.
 * Spec: docs/rewrite/phase-1/element-props.md#per-element (Heading `id`)
 */
export class Slugger {
  private readonly seen = new Map<string, number>();

  slug(text: string): string {
    const base = text
      .toLowerCase()
      .trim()
      // Keep letters, marks, numbers, spaces, hyphens and underscores.
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');

    const count = this.seen.get(base);
    if (count === undefined) {
      this.seen.set(base, 0);
      return base;
    }

    // Find the next free suffix; `a-1` may already be a heading of its own.
    let n = count + 1;
    while (this.seen.has(`${base}-${n}`)) n++;
    this.seen.set(base, n);
    const slug = `${base}-${n}`;
    this.seen.set(slug, 0);
    return slug;
  }
}
