#!/usr/bin/env node
// Phase 1 · M8 done-when: the migration guide's code samples type-check
// against the built package.
//
// Extracts every fenced ```tsx block of docs/migration-from-v0.md and the
// root README (the v1
// samples; the v0.x ones are ```jsx and are not checked), writes each to its
// own file in a temp directory and type-checks them with the repo's strict
// compiler options. `@docren/react-native-markdown` resolves to the built
// declarations, so run `yarn prepare` first.
//
// Third-party packages the guide mentions but the repo doesn't depend on
// (expo-image, expo-router, a syntax highlighter) get minimal ambient shims.
//
// Usage: yarn prepare && node scripts/check-migration-samples.mjs [file.md...]
//   Default: docs/migration-from-v0.md and README.md.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guides = (
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['docs/migration-from-v0.md', 'README.md']
).map((p) => resolve(root, p));
const entry = join(root, 'lib/typescript/src/index.d.ts');

const SHIMS = `
declare module 'expo-image' {
  export const Image: any;
}
declare module 'expo-router' {
  export type Href = string;
  export function useRouter(): { push(href: Href): void };
}
declare module 'react-native-code-highlighter' {
  const CodeHighlighter: (props: {
    language: string;
    children: string;
  }) => import('react').ReactElement;
  export default CodeHighlighter;
}
`;

// -- Extract ------------------------------------------------------------------

const samples = [];
for (const guide of guides) {
  const lines = readFileSync(guide, 'utf8').split('\n');
  const before = samples.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '```tsx') continue;
    const start = i + 2; // 1-based line of the first code line
    const body = [];
    for (i++; i < lines.length && lines[i] !== '```'; i++) body.push(lines[i]);
    samples.push({ guide, start, code: body.join('\n') + '\n' });
  }
  if (samples.length === before) {
    console.error(`check-migration-samples: no tsx samples in ${guide}`);
    process.exit(1);
  }
}

// -- Check --------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'migration-samples-'));
try {
  const files = samples.map((sample, n) => {
    const file = join(dir, `sample-${String(n + 1).padStart(2, '0')}.tsx`);
    writeFileSync(file, sample.code);
    return file;
  });
  const shims = join(dir, 'shims.d.ts');
  writeFileSync(shims, SHIMS);
  mkdirSync(join(dir, 'node_modules'), { recursive: true });

  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    verbatimModuleSyntax: true,
    noImplicitReturns: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.esnext.d.ts'],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ['node'],
    typeRoots: [join(root, 'node_modules/@types')],
    baseUrl: root,
    paths: {
      '@docren/react-native-markdown': [entry],
      // @types first: `react` ships no types of its own.
      '*': ['node_modules/@types/*', 'node_modules/*'],
    },
  };

  const program = ts.createProgram([...files, shims], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  let failures = 0;
  for (const d of diagnostics) {
    if (!d.file || !files.includes(d.file.fileName)) {
      // Errors outside the samples (shims, environment) are still failures.
      console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      failures++;
      continue;
    }
    const n = files.indexOf(d.file.fileName);
    const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    const guideLine = samples[n].start + line;
    console.error(
      `${samples[n].guide}:${guideLine}  TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    );
    failures++;
  }

  if (failures > 0) {
    console.error(`\ncheck-migration-samples: ${failures} error(s) in ${samples.length} samples.`);
    process.exit(1);
  }
  console.log(`check-migration-samples: ${samples.length} samples type-check.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
