#!/usr/bin/env node
// Phase 1 · M5 done-when: no internal type (NodeTable, markdown-it `Token`)
// is reachable from the public .d.ts.
//
// Starts at the exports of the built entry declaration file and walks every
// type reachable from them (properties, signatures, type arguments, base
// types, unions...), recording where each named type is declared. It fails
// when a reachable type is declared somewhere that must stay private.
//
// Why walk types, not files: `api/index.d.ts` imports `../parse`, whose
// declaration file also declares the private `ParserBackend` (it returns a
// `NodeTable`). File reachability would flag harmless imports and miss
// inferred types; type reachability flags exactly what a consumer can touch.
//
// Usage: yarn prepare && node scripts/check-public-types.mjs [--list] [entry.d.ts]
//   --list   print every reachable named type, grouped by location.

import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const list = args.includes('--list');
const entry = resolve(
  root,
  args.find((a) => !a.startsWith('--')) ?? 'lib/typescript/src/index.d.ts'
);

// -- Rules --------------------------------------------------------------------
//
// A reachable type is a violation when it is declared in one of these places
// and is not in the place's allowlist.

/** Declared in the built library: folder (below lib/typescript/src/) → allowed names. */
const PRIVATE_FOLDERS = {
  // The node table and everything that describes it (D7, docs/rewrite/08).
  'model': new Set(['Align']),
  // Parser internals. Backends are first-party; users hold an opaque handle
  // (`ParserBackend`: just a name; the implementation is `ParserBackendImpl`).
  // `ParseOptions` is the base of the public `parse()` options (preset, html,
  // plugins); `HtmlMode` is its `html` value.
  'parse': new Set(['HtmlMode', 'ParseOptions', 'ParserBackend']),
  // Plugin registry internals. The plugin types users write are in definePlugin.
  'plugins/registry': new Set(),
};

/** Declared in a package: package name → allowed names (everything else is private). */
const PRIVATE_PACKAGES = {
  // markdown-it is the documented extension surface of `syntax.markdownIt`
  // only: its `Token` and the rest of its API must not be needed to use ours.
  'markdown-it': new Set(['MarkdownIt']),
};

// -- Program ------------------------------------------------------------------

const program = ts.createProgram([entry], {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
  types: [],
});
const checker = program.getTypeChecker();
const entryFile = program.getSourceFile(entry);
if (!entryFile) {
  console.error(
    `Cannot read ${relative(root, entry)}. Build first: yarn prepare`
  );
  process.exit(2);
}
const moduleSymbol = checker.getSymbolAtLocation(entryFile);
if (!moduleSymbol) {
  console.error(`${relative(root, entry)} has no exports.`);
  process.exit(2);
}

// -- Where is a symbol declared ------------------------------------------------

const libSrc = resolve(root, 'lib/typescript/src') + '/';

/** `{ kind, place }` for a declaration file, or `null` to ignore it. */
function locate(fileName) {
  const file = resolve(fileName);
  if (file.startsWith(libSrc)) {
    const inside = file.slice(libSrc.length).replace(/\.d\.ts$/, '');
    return { kind: 'lib', place: inside };
  }
  const nm = file.lastIndexOf('/node_modules/');
  if (nm !== -1) {
    const rest = file.slice(nm + '/node_modules/'.length);
    // @types/foo → foo; @scope/pkg → @scope/pkg
    const parts = rest.split('/');
    let pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    if (pkg === '@types') pkg = parts[1];
    return { kind: 'package', place: pkg };
  }
  return { kind: 'other', place: file };
}

function violationOf(name, where) {
  if (where.kind === 'lib') {
    for (const [folder, allowed] of Object.entries(PRIVATE_FOLDERS)) {
      if (
        (where.place === folder || where.place.startsWith(folder + '/')) &&
        !allowed.has(name)
      ) {
        return `declared in private ${folder}/ (${where.place})`;
      }
    }
  }
  if (where.kind === 'package') {
    const allowed = PRIVATE_PACKAGES[where.place];
    if (allowed && !allowed.has(name)) {
      return `declared in package "${where.place}", which only exposes ${[...allowed].join(', ')}`;
    }
  }
  return null;
}

// -- Walk ---------------------------------------------------------------------

/** name@place → chain of the first path that reached it. */
const reached = new Map();
const violations = new Map();
const seen = new Set();

function note(symbol, chain, force = false) {
  if (!symbol || !symbol.declarations?.length) return;
  // Named types only: methods and properties are not types of their own.
  if (!force && !(symbol.flags & ts.SymbolFlags.Type)) return;
  const name = symbol.getName();
  if (name === '__type' || name === '__object' || name === '__function') {
    return; // anonymous
  }
  const where = locate(symbol.declarations[0].getSourceFile().fileName);
  // The TypeScript lib (Promise, Array...) is not ours to police.
  if (!where || (where.kind === 'package' && where.place === 'typescript')) {
    return;
  }
  const key = `${name} @ ${where.kind === 'lib' ? where.place : where.place}`;
  if (!reached.has(key)) reached.set(key, chain);
  const why = violationOf(name, where);
  if (why && !violations.has(key)) violations.set(key, { why, chain });
}

/** Declarations from packages (and the TS lib) are named but not entered. */
function enters(symbol) {
  const decl = symbol?.declarations?.[0];
  if (!decl) return true;
  return locate(decl.getSourceFile().fileName).kind !== 'package';
}

function walk(type, chain) {
  if (!type || seen.has(type)) return;
  seen.add(type);

  note(type.aliasSymbol, chain);
  for (const arg of type.aliasTypeArguments ?? []) walk(arg, chain);

  if (type.isUnionOrIntersection()) {
    for (const t of type.types) walk(t, chain);
    return;
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    walk(checker.getBaseConstraintOfType(type), chain);
    const decl = type.symbol?.declarations?.[0];
    if (decl && ts.isTypeParameterDeclaration(decl) && decl.default) {
      walk(checker.getTypeFromTypeNode(decl.default), chain);
    }
    return;
  }
  if (type.flags & ts.TypeFlags.Index) {
    walk(type.type, chain);
    return;
  }
  if (type.flags & ts.TypeFlags.IndexedAccess) {
    walk(type.objectType, chain);
    walk(type.indexType, chain);
    return;
  }
  if (type.flags & ts.TypeFlags.Conditional) {
    walk(type.checkType, chain);
    walk(type.extendsType, chain);
    walk(checker.getBaseConstraintOfType(type), chain);
    return;
  }
  if (!(type.flags & ts.TypeFlags.Object)) return;

  const symbol = type.symbol;
  note(symbol, chain);
  if (!enters(symbol)) return;

  const here =
    symbol?.getName() && !symbol.getName().startsWith('__')
      ? `${chain} → ${symbol.getName()}`
      : chain;

  if (type.objectFlags & ts.ObjectFlags.Reference) {
    for (const arg of checker.getTypeArguments(type)) walk(arg, here);
    if (type.target !== type) walk(type.target, here);
  }
  if (type.objectFlags & ts.ObjectFlags.ClassOrInterface) {
    for (const base of checker.getBaseTypes(type)) walk(base, here);
    for (const param of type.typeParameters ?? []) walk(param, here);
  }
  for (const prop of checker.getPropertiesOfType(type)) {
    walk(checker.getTypeOfSymbol(prop), `${here} → .${prop.getName()}`);
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    walk(info.keyType, here);
    walk(info.type, here);
  }
  for (const sig of [
    ...type.getCallSignatures(),
    ...type.getConstructSignatures(),
  ]) {
    for (const param of sig.getParameters()) {
      walk(checker.getTypeOfSymbol(param), `${here} → (${param.getName()})`);
    }
    walk(sig.getReturnType(), `${here} → return`);
    for (const tp of sig.getTypeParameters() ?? []) walk(tp, here);
  }
}

for (const exported of checker.getExportsOfModule(moduleSymbol)) {
  const symbol =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
  const chain = exported.getName();
  note(symbol, chain, true);
  if (symbol.flags & ts.SymbolFlags.Type) {
    walk(checker.getDeclaredTypeOfSymbol(symbol), chain);
  }
  if (symbol.flags & ts.SymbolFlags.Value) {
    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (decl) walk(checker.getTypeOfSymbolAtLocation(symbol, decl), chain);
  }
}

// -- Report -------------------------------------------------------------------

if (list) {
  const byPlace = new Map();
  for (const key of reached.keys()) {
    const [name, place] = key.split(' @ ');
    const folder = place.includes('/') ? place.split('/')[0] : place;
    byPlace.set(folder, [...(byPlace.get(folder) ?? []), name]);
  }
  for (const [folder, names] of [...byPlace].sort()) {
    console.log(`${folder}: ${names.sort().join(', ')}`);
  }
  console.log();
}

if (violations.size > 0) {
  console.error('Internal types are reachable from the public declarations:\n');
  for (const [key, { why, chain }] of violations) {
    console.error(`  ${key.split(' @ ')[0]}: ${why}`);
    console.error(`    via ${chain}\n`);
  }
  process.exit(1);
}

console.log(
  `OK: ${reached.size} named types reachable from ${relative(root, entry)}, none internal.`
);
