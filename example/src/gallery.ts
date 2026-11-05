/**
 * The Playground's default document: a tour of what the library renders.
 * It uses every element and every built-in plugin at least once, in the
 * order a reader would meet them, and points at the Options that change it.
 * Inline images load from picsum.photos; the broken one is on purpose.
 */
export const gallery = `# Feature tour

CommonMark and GitHub Flavored Markdown, rendered as native \`Text\` and \`View\`. Everything below is one document: open **Options** to restyle it, or **Edit** to try your own.

## Text

Plain text takes **strong**, *emphasis*, ***both***, ~~strikethrough~~ and \`inline code\`. Inline styles change only what they set, so **strong text keeps the paragraph's size**.

Links open in the system: [a titled link](https://github.com "GitHub"), an autolink like https://expo.dev, and a bare www.example.com.

Soft breaks follow the *Soft line breaks* option:
this line continues
on the next two.

A hard break ends the line\\
right here.

### Heading levels

Levels 1 and 2 are above. Then:

### Level 3
#### Level 4
##### Level 5
###### Level 6

## Lists

- Bullets nest, and the marker follows the depth
  - Second level ◦
    - Third level ▪
      - Back to •
- Back at the top

8. Numbers keep their start
9. and stay aligned
10. as they grow to two digits
11. like this

- [x] Task lists render checkboxes
- [ ] Turn on *Interactive tasks* and tap one
- Plain items can sit between them

1. A loose list gets paragraph spacing

   so an item can hold several paragraphs.

2. Like this second item.

## Quotes and rules

> A quote mutes its text, and the style **cascades** into everything inside it.
>
> > Quotes nest.

---

## Code

\`\`\`ts title="greet.ts"
function greet(name: string): string {
  return \`Hello, \${name}! Long lines scroll sideways instead of wrapping.\`;
}
\`\`\`

    an indented code block

## Tables

| Left | Center | Right |
|:-----|:------:|------:|
| aligned | per | column |
| **bold** | \`code\` | [link](https://expo.dev) |

## Images

![A block image](https://picsum.photos/id/1015/800/450)

Block images keep their aspect ratio and never grow past their natural size:

![A portrait image](https://picsum.photos/id/1011/240/320)

An inline image ![icon](https://picsum.photos/id/1025/64/64) scales to the line height. A broken one shows its alt text:

![This image failed to load](https://example.invalid/missing.png)

## Footnotes

Footnotes link both ways[^1], and a named one works too[^note]. The first again[^1].

[^1]: Referenced twice, so it has two back-links.
[^note]: A named footnote.

    It can hold a second paragraph.

## Inline HTML

A safe subset of tags becomes real formatting: H<sub>2</sub>O and E = mc<sup>2</sup>, <u>underline</u>, <mark>highlight</mark>, press <kbd>Ctrl</kbd> + <kbd>C</kbd>, a line<br>break. Scripts with no Unicode form fall back to smaller text, as in Brand<sup>TM</sup>; the *Superscript fallback* option raises it.

## Safe by default

Anything else stays visible as text, never as markup: an <span>unknown tag</span>, a <script>alert(1)</script> tag, and a [dangerous link](javascript:alert(1)).

<div>
Block-level HTML is never interpreted either.
</div>
`;
