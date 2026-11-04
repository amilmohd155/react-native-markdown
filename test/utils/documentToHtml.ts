import {
  Flag,
  getAttrs,
  getText,
  hasFlag,
  NodeType,
  ROOT,
  type NodeAttrsMap,
  type NodeTable,
} from '../../src/model';

/**
 * Serializes a node table to HTML in the CommonMark spec's conventions
 * (cmark's output format), so spec examples can be compared exactly.
 * Test-only: never shipped. Spec: docs/rewrite/phase-1/testing-harness.md
 *
 * Iterative (explicit stack): pathological inputs nest inline containers
 * tens of thousands deep, which would overflow a recursive walk.
 */
export function documentToHtml(table: NodeTable): string {
  const out: string[] = [];
  /** A node id to enter, or -(id + 1) for a node to exit. */
  const stack: number[] = [];
  /** markdown-it/cmark rule: a block opening right after a tight paragraph starts on a new line. */
  let afterTightParagraph = false;
  pendingCheckbox.clear();

  const children = (id: number): number[] => {
    const ids: number[] = [];
    for (let c = table.firstChild[id]!; c !== -1; c = table.nextSibling[c]!) {
      ids.push(c);
    }
    return ids;
  };
  const pushChildren = (id: number) => {
    const ids = children(id);
    for (let i = ids.length - 1; i >= 0; i--) stack.push(ids[i]!);
  };
  /** Paragraphs directly in an item of a tight list render without <p>. */
  const isTightParagraph = (id: number): boolean => {
    const item = table.parent[id]!;
    if (item === -1 || table.type[item] !== NodeType.ListItem) return false;
    const list = table.parent[item]!;
    return hasFlag(table.flags[list]!, Flag.TIGHT);
  };
  const blockOpen = (html: string) => {
    if (afterTightParagraph) out.push('\n');
    afterTightParagraph = false;
    out.push(html);
  };

  pushChildren(ROOT);

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const exiting = entry < 0;
    const id = exiting ? -entry - 1 : entry;
    const type = table.type[id]!;

    if (exiting) {
      out.push(closeTag(table, id, type, isTightParagraph));
      afterTightParagraph = type === NodeType.Paragraph && isTightParagraph(id);
      continue;
    }

    const leaf = leafHtml(table, id, type);
    if (leaf !== null) {
      // Leaf blocks with their own renderer rules (code, html) don't get the
      // newline-after-tight-paragraph; dividers (rendered as tags) do.
      if (type === NodeType.Divider) blockOpen(leaf);
      else {
        if (isBlockLeaf(type)) afterTightParagraph = false;
        out.push(leaf);
      }
      continue;
    }

    out.push(openTag(table, id, type, isTightParagraph, blockOpen));
    stack.push(-(id + 1));
    pushChildren(id);
  }

  return out.join('');
}

function isBlockLeaf(type: number): boolean {
  return type === NodeType.CodeBlock || type === NodeType.HtmlBlock;
}

/** HTML for nodes without children, or null for containers. */
function leafHtml(table: NodeTable, id: number, type: number): string | null {
  switch (type) {
    case NodeType.Text:
      return escapeHtml(getText(table, id) ?? '');
    case NodeType.LineBreak:
      return '<br />\n';
    case NodeType.InlineCode:
      return `<code>${escapeHtml(getText(table, id) ?? '')}</code>`;
    case NodeType.HtmlInline:
    case NodeType.HtmlBlock: {
      // tagfilter: HTML output uses the filtered HTML when there is one (P1-13).
      const attrs = getAttrs(table, id) as { filteredHtml?: string } | null;
      return attrs?.filteredHtml ?? getText(table, id) ?? '';
    }
    case NodeType.Divider:
      return '<hr />\n';
    case NodeType.CodeBlock: {
      const { language } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.CodeBlock];
      const cls = language ? ` class="language-${escapeHtml(language)}"` : '';
      return `<pre><code${cls}>${escapeHtml(getText(table, id) ?? '')}</code></pre>\n`;
    }
    case NodeType.FootnoteReference: {
      const { label, index, subId } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.FootnoteReference];
      const ref = footnoteId(label) + (subId > 0 ? `-${subId + 1}` : '');
      return `<sup class="footnote-ref"><a href="#fn-${footnoteId(label)}" id="fnref-${ref}" data-footnote-ref>${index}</a></sup>`;
    }
    case NodeType.Image: {
      const { src, alt, title } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.Image];
      const t = title === null ? '' : ` title="${escapeHtml(title)}"`;
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${t} />`;
    }
    default:
      return null;
  }
}

function openTag(
  table: NodeTable,
  id: number,
  type: number,
  isTightParagraph: (id: number) => boolean,
  blockOpen: (html: string) => void
): string {
  switch (type) {
    case NodeType.Paragraph:
      if (isTightParagraph(id)) return '';
      blockOpen(`<p>${pendingCheckbox.get(id) ?? ''}`);
      return '';
    case NodeType.Heading: {
      const { level } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.Heading];
      blockOpen(`<h${level}>`);
      return '';
    }
    case NodeType.Blockquote:
      // cmark prints an empty blockquote as "<blockquote>\n</blockquote>".
      blockOpen('<blockquote>\n');
      return '';
    case NodeType.List: {
      const { start } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.List];
      const ordered = hasFlag(table.flags[id]!, Flag.ORDERED);
      blockOpen(
        ordered
          ? start === 1
            ? '<ol>\n'
            : `<ol start="${start}">\n`
          : '<ul>\n'
      );
      return '';
    }
    case NodeType.ListItem: {
      const first = table.firstChild[id]!;
      // "<li>" stays on its line when empty or when its first block is a
      // tight paragraph; otherwise the content starts on a new line.
      const inline =
        first === -1 ||
        (table.type[first] === NodeType.Paragraph && isTightParagraph(first));
      // Task items: cmark-gfm's checkbox, then a space, before the content.
      const box = taskCheckbox(table.flags[id]!);
      blockOpen(inline ? `<li>${box}` : '<li>\n');
      if (!inline && box) {
        // Loose item: the checkbox opens its first paragraph (`<p><input … /> `).
        pendingCheckbox.set(first, box);
      }
      return '';
    }
    case NodeType.Table:
      blockOpen('<table>\n');
      return '';
    case NodeType.TableHead:
      return '<thead>\n';
    case NodeType.TableBody:
      return '<tbody>\n';
    case NodeType.TableRow:
      return '<tr>\n';
    case NodeType.TableCell: {
      const { align } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.TableCell];
      const tag = hasFlag(table.flags[id]!, Flag.HEADER) ? 'th' : 'td';
      return `<${tag}${align ? ` align="${align}"` : ''}>`;
    }
    case NodeType.FootnoteSection:
      blockOpen('<section class="footnotes" data-footnotes>\n<ol>\n');
      return '';
    case NodeType.FootnoteDefinition: {
      const { label } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.FootnoteDefinition];
      blockOpen(`<li id="fn-${footnoteId(label)}">\n`);
      return '';
    }
    case NodeType.Strong:
      return '<strong>';
    case NodeType.Emphasis:
      return '<em>';
    case NodeType.Strikethrough:
      return '<del>';
    case NodeType.Underline:
      return '<u>';
    case NodeType.Highlight:
      return '<mark>';
    case NodeType.Superscript:
      return '<sup>';
    case NodeType.Subscript:
      return '<sub>';
    case NodeType.Kbd:
      return '<kbd>';
    case NodeType.Link: {
      const { href, title } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.Link];
      const t = title === null ? '' : ` title="${escapeHtml(title)}"`;
      return `<a href="${escapeHtml(href)}"${t}>`;
    }
    default:
      return '';
  }
}

/** cmark-gfm's footnote ids: the label, href-escaped. */
function footnoteId(label: string): string {
  return escapeHtml(encodeURI(label));
}

/** cmark-gfm's back-links of a definition: one per reference. */
function backLinks(table: NodeTable, id: number): string {
  const { label, index, references } = getAttrs(
    table,
    id
  ) as NodeAttrsMap[typeof NodeType.FootnoteDefinition];
  const links: string[] = [];
  for (let n = 1; n <= references; n++) {
    const ref = footnoteId(label) + (n > 1 ? `-${n}` : '');
    const idx = n > 1 ? `${index}-${n}` : `${index}`;
    const sup = n > 1 ? `<sup class="footnote-ref">${n}</sup>` : '';
    links.push(
      `<a href="#fnref-${ref}" class="footnote-backref" data-footnote-backref data-footnote-backref-idx="${idx}" aria-label="Back to reference ${idx}">↩${sup}</a>`
    );
  }
  return links.join(' ');
}

/** Checkboxes owed to the first paragraph of a loose task item, by paragraph id. */
const pendingCheckbox = new Map<number, string>();

function taskCheckbox(flags: number): string {
  if (!hasFlag(flags, Flag.TASK)) return '';
  return hasFlag(flags, Flag.CHECKED)
    ? '<input type="checkbox" checked="" disabled="" /> '
    : '<input type="checkbox" disabled="" /> ';
}

function closeTag(
  table: NodeTable,
  id: number,
  type: number,
  isTightParagraph: (id: number) => boolean
): string {
  switch (type) {
    case NodeType.Paragraph: {
      if (isTightParagraph(id)) return '';
      // cmark-gfm puts a definition's back-links inside its last paragraph.
      const parent = table.parent[id]!;
      const lastInFootnote =
        table.type[parent] === NodeType.FootnoteDefinition &&
        table.nextSibling[id] === -1;
      return lastInFootnote ? ` ${backLinks(table, parent)}</p>\n` : '</p>\n';
    }
    case NodeType.FootnoteSection:
      return '</ol>\n</section>\n';
    case NodeType.FootnoteDefinition: {
      // Otherwise the back-links follow the last block.
      let child = table.firstChild[id]!;
      while (child !== -1 && table.nextSibling[child] !== -1) {
        child = table.nextSibling[child]!;
      }
      const inParagraph =
        child !== -1 && table.type[child] === NodeType.Paragraph;
      return inParagraph ? '</li>\n' : `${backLinks(table, id)}\n</li>\n`;
    }
    case NodeType.Heading: {
      const { level } = getAttrs(
        table,
        id
      ) as NodeAttrsMap[typeof NodeType.Heading];
      return `</h${level}>\n`;
    }
    case NodeType.Blockquote:
      return '</blockquote>\n';
    case NodeType.List:
      return hasFlag(table.flags[id]!, Flag.ORDERED) ? '</ol>\n' : '</ul>\n';
    case NodeType.ListItem:
      return '</li>\n';
    case NodeType.Table:
      return '</table>\n';
    case NodeType.TableHead:
      return '</thead>\n';
    case NodeType.TableBody:
      return '</tbody>\n';
    case NodeType.TableRow:
      return '</tr>\n';
    case NodeType.TableCell:
      return hasFlag(table.flags[id]!, Flag.HEADER) ? '</th>\n' : '</td>\n';
    case NodeType.Strong:
      return '</strong>';
    case NodeType.Emphasis:
      return '</em>';
    case NodeType.Strikethrough:
      return '</del>';
    case NodeType.Underline:
      return '</u>';
    case NodeType.Highlight:
      return '</mark>';
    case NodeType.Superscript:
      return '</sup>';
    case NodeType.Subscript:
      return '</sub>';
    case NodeType.Kbd:
      return '</kbd>';
    case NodeType.Link:
      return '</a>';
    default:
      return '';
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}
