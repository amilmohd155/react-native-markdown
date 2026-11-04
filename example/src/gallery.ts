/**
 * Gallery fixture: every v1 element at least once, for visual QA on
 * devices. Grows with each M3 element task.
 */
export const gallery = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

A paragraph with **strong**, *emphasis*, ***both***, ~~strikethrough~~, \`inline code\`,
a [link](https://github.com "GitHub") and an autolink https://expo.dev. A soft
line break joins lines with a space; a hard break (backslash) ends the line\\
right here.

**A heading-sized run? No:** inline styles only change what they set, so this
**strong text keeps the paragraph's size**.

## Safe HTML subset

H<sub>2</sub>O and E = mc<sup>2</sup>, <u>underline</u>, <mark>highlight</mark>,
press <kbd>Ctrl</kbd> + <kbd>C</kbd>, a line<br>break, and <span>unknown tags</span> as text.

<div>
Block HTML is never interpreted.
</div>

## Lists

- Bullet one
- Bullet two
  - Nested ◦
    - Deeper ▪
      - Back to •
- Bullet three

8. Eight
9. Nine
10. Ten (markers stay aligned)
11. Eleven

- [x] Done task
- [ ] Open task
- Plain item in a task list

1. Loose list item

   with a second paragraph.

2. Second loose item

## Blockquote

> A quote's text is muted, and it **cascades** into its paragraphs.
>
> > Nested quote.

## Code

\`\`\`ts title="example.ts"
function greet(name: string): string {
  return \`Hello, \${name}! This line is long enough to scroll horizontally.\`;
}
\`\`\`

    indented code block

---

## Table

| Left | Center | Right |
|:-----|:------:|------:|
| a | b | c |
| longer cell content | **bold** | \`code\` |

## Images

![Block image](https://picsum.photos/id/1015/800/450)

A portrait image keeps its own aspect ratio, never wider than its natural size:

![Portrait image](https://picsum.photos/id/1011/240/320)

A broken image shows its alt text:

![This image failed to load](https://example.invalid/missing.png)

Inline image ![icon](https://picsum.photos/id/1025/64/64) inside text.

## Footnotes

A claim with a footnote[^1] and another[^note]. The first one again[^1].

[^1]: The first footnote, referenced twice: two back-links.
[^note]: A named footnote, referenced once.

    It has a second paragraph, indented under the definition.
`;
