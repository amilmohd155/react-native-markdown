# Fixing slow `FlatList` scrolling

Your list janks because every row re-renders when the parent state changes. Here is a **step-by-step** plan, from cheapest to most invasive.

## 1. Stabilise the props

`FlatList` compares props shallowly, so inline functions defeat it:

```tsx
const renderItem = useCallback(
  ({ item }: { item: Message }) => <Row message={item} />,
  [],
);

<FlatList
  data={messages}
  renderItem={renderItem}
  keyExtractor={(m) => m.id}
  getItemLayout={(_, i) => ({ length: 72, offset: 72 * i, index: i })}
/>
```

Things to check:

- `keyExtractor` returns a stable string, never the index
- `Row` is wrapped in `React.memo`
- `extraData` is only set when the selection actually changes

## 2. Measure before guessing

| Tool | What it shows | Cost |
|---|---|---|
| React Profiler | Commits per scroll | Low |
| Hermes sampling profiler | JS hot spots | Medium |
| `systrace` | Frame timing | High |

Start with the profiler. If `Row` commits more than once per visible item, see the [memo docs](https://react.dev/reference/react/memo) for the usual culprits.

## 3. Reduce work per row

1. Avoid parsing markdown on the JS thread during scroll
2. Cache the parsed result keyed on `message.id`
3. Lower `windowSize` from the default `21` to around `7`

> If it is still slow after all three, the problem is probably images, not text.

Let me know what the profiler says and I can narrow it down further.
