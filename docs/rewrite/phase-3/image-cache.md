# Phase 3 · Image size cache and placeholder

Design for the image polish ([P3-36](./decisions.md#p3-36-image-size-polish-explicit-sizes-a-hardened-cache-fade-in-and-a-retry)), on top of the basic version ([P3-6](./decisions.md#p3-6-the-image-placeholder-ships-with-or-before-virtualize)). **Built** (2026-11-22). Reference: [03 · Default elements](../03-architecture.md) and [04 · Markdown](../04-api.md#markdown).

## Before P3-36 (basic)

- `src/render/imageSize.ts`: a module-global `Map` keyed by the raw `src`, at most 500 entries, oldest dropped first (FIFO, a hit does not refresh). One `Image.getSize` per URL (`pending` dedupes); a failure is cached as `'error'` and not retried until evicted. Components subscribe per URL with `useSyncExternalStore`; the lookup starts on subscribe, after commit, so it never runs during server rendering.
- Block `Image` (`src/render/defaults/block.tsx`): unknown size is a `codeBg` box at the theme `imageRatio` (16:9); a known size sets `aspectRatio` and caps the frame at the natural width. A failure shows a bordered alt-text box. Inline image (`src/render/defaults/inline.tsx`): a line-height square until known; `src/render/inline.ts` reads the cache synchronously, so a cached inline image is sized on first render.
- The `images` policy ([P1-21](../phase-1/decisions.md#p1-21-images-policy-semantics)) runs first: a refused image is alt text and never looks up a size.

## Gaps (closed by P3-36, except as noted in Open)

1. A cold start shifts whenever the real ratio is not `imageRatio`. The node table has no width or height, so there is no explicit source.
2. FIFO, not LRU. An error is permanent until evicted, and there is no retry.
3. The loaded image appears with no transition; the error box offers nothing to do and reports nothing.
4. Loading is not announced, and an image with an empty `alt` is exposed to screen readers.

## Design

**Resolution order.** `imageSizes[src]`, then the cache, then `Image.getSize`. A provided size is never looked up and never evicted; it lives in the render context, not the module cache, so one `<Markdown>`'s sizes don't leak into another. Block and inline images use the same lookup.

```tsx
<Markdown document={doc} imageSizes={{ 'https://x.test/a.png': { width: 800, height: 450 } }} />
await prefetchImageSizes(urls); // warms the cache before the document mounts
```

`imageSizes` is compared shallowly, key by key, like `images` ([pipeline.ts](../../../src/api/pipeline.ts)), so an inline object doesn't re-render. Keys are exact `src` strings. `prefetchImageSizes(urls)` runs `loadImageSize` for each URL and resolves when all have settled (a failure is cached, not thrown).

**Cache.**

- LRU: a read refreshes recency (delete and set); the bound stays 500, fixed.
- An error entry records its time and expires after 60 s: the next subscribe retries it. `retry(src)` clears the entry and looks up again.
- Entries stay typed unions (`{ width, height }`, or an error entry with its time); no `any`.
- Server rendering: nothing fills the cache there (subscribe never runs), so a server render uses `imageSizes` or the `imageRatio` box. Don't seed the module cache on a server: it is shared across requests.

**Placeholder.** The `codeBg` box at `imageRatio` stays, with `accessibilityState={{ busy: true }}`. On load the image fades in (opacity 0 to 1, `Animated`, native driver, 150 ms; theme `image.fadeDuration`, 0 turns it off). No fade when the size was known on the first render (a remount in `virtualize`, or `imageSizes`), so a recycled row doesn't flicker; no fade when reduce motion is on (`AccessibilityInfo`, pure JS). No skeleton pulse: it costs animation per image in long lists.

**Error state.** The alt-text box becomes a `Pressable` (`accessibilityRole="button"`, hint "Retry loading the image") that calls `retry`. New handler `onImageError({ src, alt, title })`, read through the handlers ref like `onImagePress`, called once per failed lookup the image saw start (not per render, and not for a remount onto a cached error), for block and inline images. An inline image keeps its square on error and has no retry press. With `interactiveImages` a failed image is not pressable for `onImagePress`.

**Accessibility (basic).** `busy` while loading. An image with an empty `alt` gets `accessible={false}` (and `aria-hidden` on web), as a decorative image; the error box already shows `src` for an empty `alt`. Screen-reader passes are waived (P3-36).

## Checks

- Unit (`src/render/__tests__/images.test.tsx`): an `imageSizes` entry renders at its ratio on first render with no `getSize` call; LRU keeps a recently read entry; an error expires after 60 s (fake timers) and a retry press looks up again; `onImageError` fires once; no fade when cached; fade on load; empty `alt` is hidden; `prefetchImageSizes` warms the cache.
- A `virtualize` remount reads the size synchronously, and a provided size means no placeholder-to-image shift.
- Device: Android Expo Go (the gallery images: cold start, scroll back in `virtualize`, a broken URL, retry) and web (`getSize` is callback-only on react-native-web; the box and fade). iOS simulator too; no physical iPhone, no VoiceOver or TalkBack.
- Images stay out of the benchmark fixtures ([REPORT](../../../bench/results/REPORT.md)); the fade adds no cost to a cached image. Keep it that way, or record a waiver.

## Open

- **Headers.** Deferred to the unscheduled roadmap ([#59](https://github.com/amilmohd155/react-native-markdown/issues/59)): an `imageRequestHeaders` prop, native only, passed to `Image.getSizeWithHeaders` and `source.headers`, and part of the cache key. Until then a protected image falls back to its error box; `imageSizes` skips the lookup but the image still draws without headers.
- **`onLoad` size.** The real `<Image>` `onLoad` event carries the source size; it could fill an unknown entry and spare a second fetch where the platform has no shared image cache. Not decided.
- **Key normalization.** Keys are the raw `src`; a fragment changes no pixels but gets its own entry. Left as is unless a real case shows up.
