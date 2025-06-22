export const mdxString = `
[img1]: https://fastly.picsum.photos/id/135/200/300.jpg?hmac=d3sTOCUkxdC1OKCgh9wTPjck-gMWATyVHFvflla5vLI "Reference image"
[linkRef]:https://example.com

> React Native Markdown Example

# Heading Level 1

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

---

That was a horizontal rule (thematic break).

This is a paragraph with some **bold text** and _italic text_. You can also use **bold** and _italic_ syntax. Here's some **_bold and italic_** text together.

This is another paragraph with \`inline code\`.

> This is a blockquote
>
> It can span multiple lines
>
> > And can be nested

Here's an unordered list:

- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
    - Deeply nested item
- Item 3

Here's an ordered list:

1. First item
2. Second item
   1. Nested ordered item
   2. Another nested item
3. Third item

Here's a code block:

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

Here's a code block without language specification:

\`\`\`
This is plain code
No syntax highlighting
\`\`\`


Here are some links:

- [Unordered list with link](https://example.com)
- [Link Reference][linkRef]
1) <email@example.com>

This is a link in a paragraph [Inline link](https://example.com)


Here's an image:

![Alt text](https://fastly.picsum.photos/id/70/200/200.jpg?hmac=hRU7tEHltyLUTf0bCrAWFXlPRXOBTsvCcvL-dIUG2CE "Image title")

Here's a reference image:

![Alt text][img1]


Line breaks can be created with two spaces at the end of a line  
like this.

Hard line breaks can also be created with a backslash\\
at the end of a line.

A paragraph with a soft line break
that continues on the next line.

    This is an indented code block
    It preserves whitespace
    And line breaks

Final paragraph to end the document.`;

// Here's a table: (Not yet implemented)

// | Column 1 | Column 2 | Column 3 |
// | -------- | -------- | -------- |
// | Cell 1   | Cell 2   | Cell 3   |
// | Cell 4   | Cell 5   | Cell 6   |
