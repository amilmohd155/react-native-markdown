/**
 * Pathological inputs: each must parse in bounded time and produce output
 * matching `expect`, applied to the test HTML serializer's output.
 *
 * Ported from commonmark/cmark `test/pathological_tests.py` at tag 0.31.1:
 * https://github.com/commonmark/cmark/blob/0.31.1/test/pathological_tests.py
 * Copyright (c) 2014, John MacFarlane. BSD-2-Clause, see ../SOURCES.md.
 *
 * Not ported:
 * - "reference collisions": targets cmark's internal reference hash function.
 * - "nested inlines": checks cmark's CommonMark *writer*, which we don't have.
 * - "many references": commented out upstream as well.
 */

export interface PathologicalCase {
  name: string;
  /** Built lazily: some inputs are several hundred KB. */
  input: () => string;
  expect: RegExp;
}

const repeat = (s: string, n: number) => s.repeat(n);

export const pathologicalCases: PathologicalCase[] = [
  {
    name: 'nested strong emph',
    input: () => repeat('*a **a ', 32500) + 'b' + repeat(' a** a*', 32500),
    expect: /(<em>a <strong>a ){32500}b( a<\/strong> a<\/em>){32500}/,
  },
  {
    name: 'many emph closers with no openers',
    input: () => repeat('a_ ', 32500),
    expect: /(a[_] ){32499}a_/,
  },
  {
    name: 'many emph openers with no closers',
    input: () => repeat('_a ', 32500),
    expect: /(_a ){32499}_a/,
  },
  {
    name: 'many link closers with no openers',
    input: () => repeat('a]', 32500),
    expect: /(a\]){32500}/,
  },
  {
    name: 'many link openers with no closers',
    input: () => repeat('[a', 32500),
    expect: /(\[a){32500}/,
  },
  {
    name: 'mismatched openers and closers',
    input: () => repeat('*a_ ', 25000),
    expect: /([*]a[_] ){24999}[*]a_/,
  },
  {
    name: 'issue #389',
    input: () => repeat('*a ', 20000) + repeat('_a*_ ', 20000),
    expect: /(<em>a ){20000}(_a<\/em>_ ?){20000}/,
  },
  {
    name: 'openers and closers multiple of 3',
    input: () => 'a**b' + repeat('c* ', 25000),
    expect: /a[*][*]b(c[*] ){24999}c[*]/,
  },
  {
    name: 'link openers and emph closers',
    input: () => repeat('[ a_', 25000),
    expect: /(\[ a_){25000}/,
  },
  {
    name: 'pattern [ (]( repeated',
    input: () => repeat('[ (](', 40000),
    expect: /(\[ \(\]\(){40000}/,
  },
  {
    name: 'pattern ![[]() repeated',
    input: () => repeat('![[]()', 160000),
    expect: /(!\[<a href=""><\/a>){160000}/,
  },
  {
    name: 'hard link/emph case',
    input: () => '**x [a*b**c*](d)',
    expect: /\*\*x <a href="d">a<em>b\*\*c<\/em><\/a>/,
  },
  {
    name: 'nested brackets',
    input: () => repeat('[', 25000) + 'a' + repeat(']', 25000),
    expect: /\[{25000}a\]{25000}/,
  },
  {
    name: 'nested block quotes',
    input: () => repeat('> ', 25000) + 'a',
    expect: /(<blockquote>\n){25000}/,
  },
  {
    name: 'deeply nested lists',
    input: () =>
      Array.from({ length: 500 }, (_, x) => repeat('  ', x) + '* a\n').join(''),
    expect:
      /<ul>\n(<li>a\n<ul>\n){499}<li>a<\/li>\n<\/ul>\n(<\/li>\n<\/ul>\n){499}/,
  },
  {
    name: 'U+0000 in input',
    input: () => 'abc\u0000de\u0000',
    expect: /abc�?de�?/,
  },
  {
    name: 'backticks',
    input: () =>
      Array.from({ length: 2499 }, (_, i) => 'e' + repeat('`', i + 1)).join(''),
    expect: /^<p>[e`]*<\/p>\n$/,
  },
  {
    name: 'unclosed links A',
    input: () => repeat('[a](<b', 30000),
    expect: /(\[a]\(&lt;b){30000}/,
  },
  {
    name: 'unclosed links B',
    input: () => repeat('[a](b', 30000),
    expect: /(\[a]\(b){30000}/,
  },
  {
    name: 'unclosed <!--',
    input: () => '</' + repeat('<!--', 300000),
    expect: /&lt;\/(&lt;!--){300000}/,
  },
  {
    name: 'empty lines in deeply nested lists',
    input: () => repeat('- ', 30000) + 'x' + repeat('\n', 30000),
    expect: /^(<\w+>\n?)+x(<\/\w+>\n)+$/,
  },
  {
    name: 'empty lines in deeply nested lists in blockquote',
    input: () => '> ' + repeat('- ', 30000) + 'x\n' + repeat('>\n', 30000),
    expect: /^(<\w+>\n?)+x(<\/\w+>\n)+$/,
  },
  {
    name: 'emph in deep blockquote',
    input: () => repeat('>', 100000) + repeat('a*', 100000),
    expect: /^(<\w+>\n)+<p>.*<\/p>\n(<\/\w+>\n)+$/,
  },
];
