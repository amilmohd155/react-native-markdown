export const mdxString = `
# Heading Level **1**

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

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
  console.log("hello world");
}
\`\`\`

Here's a code block without language specification:

\`\`\`
This is plain code
No syntax highlighting
\`\`\`

---

That was a horizontal rule (thematic break).

Here's a table: (Not yet implemented)

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   | 

Here are some links:

- [Inline link](https://example.com)
  - [Link with title](https://example.com "This is a title")
    - <https://autolink.example.com>
1) <email@example.com>
    1) [Link with title](https://example.com "This is a title")
    2) [Inline link](https://example.com)
- [Reference link][ref1]

Reference links are not supported yet, but here's an example:
[ref1]: https://example.com "Reference link" 

Here's an image:

![Alt text](https://fastly.picsum.photos/id/334/200/300.jpg?hmac=mY7moKpyBD1N0PF_abyW5_eUHxm9jV4JxZWPnxY7x3Q "Image title")

Here's a reference image: Not yet supported, but here's an example:

![Alt text][img1]

[img1]: https://fastly.picsum.photos/id/334/200/300.jpg?hmac=mY7moKpyBD1N0PF_abyW5_eUHxm9jV4JxZWPnxY7x3Q "Reference image"

Line breaks can be created with two spaces at the end of a line  
like this.

Hard line breaks can also be created with a backslash\\
at the end of a line.

Escape characters: \\*not italic\\* $begin:math:display$not a link\\$end:math:display$

Some special characters that might need escaping: \\* \\_ \\\` & < > [ ] ( ) # + - . ! | \\ ~

A paragraph with a soft line break
that continues on the next line.

    This is an indented code block
    It preserves whitespace
    And line breaks

Final paragraph to end the document.`;
