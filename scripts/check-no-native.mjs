#!/usr/bin/env node
// Decision D2: the default package must run in Expo Go, so the main entry
// point's import graph must not reach native code.
//
// Walks every module reachable from src/index.tsx through relative imports,
// then fails if:
//   - a source file references a native-module API, or
//   - a third-party package it imports ships native code (android/ or ios/
//     directories, a podspec, or a codegen config).
//
// Usage: node scripts/check-no-native.mjs [entry]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, process.argv[2] ?? 'src/index.tsx');

const NATIVE_APIS =
  /\b(TurboModuleRegistry|requireNativeComponent|codegenNativeComponent|NativeModules)\b|react-native-nitro-modules/;
// Platform packages the library may import: they're present in every
// React Native / Expo Go runtime.
const PLATFORM = new Set(['react', 'react-native', 'react/jsx-runtime']);
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

const problems = [];
const visited = new Set();
const packages = new Map(); // package name -> first importing file (absolute)

function resolveLocal(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const candidate of [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => join(base, 'index' + e)),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);

  const source = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  const match = NATIVE_APIS.exec(source);
  if (match) problems.push(`${rel}: references native API "${match[0]}"`);

  for (const m of source.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec.startsWith('.')) {
      const target = resolveLocal(file, spec);
      if (target) walk(target);
      else problems.push(`${rel}: cannot resolve "${spec}"`);
    } else {
      const name = packageName(spec);
      if (!PLATFORM.has(name) && !packages.has(name)) packages.set(name, file);
    }
  }
}

// Resolve from the importing file, as the bundler would.
function packageDir(name, importer) {
  const req = createRequire(importer);
  try {
    return dirname(req.resolve(`${name}/package.json`));
  } catch {
    // Some packages don't export ./package.json: resolve the entry and walk up.
    try {
      let dir = dirname(req.resolve(name));
      while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
      return dir;
    } catch {
      return null;
    }
  }
}

function isTypeOnly(name, importer) {
  const typesName = name.startsWith('@')
    ? `@types/${name.slice(1).replace('/', '__')}`
    : `@types/${name}`;
  return packageDir(typesName, importer) !== null;
}

/** Why the package in `dir` counts as native, or false. */
function nativeMarker(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.codegenConfig) return 'codegenConfig in package.json';
  const entries = readdirSync(dir);
  if (entries.includes('android') || entries.includes('ios')) {
    return 'android/ or ios/ directory';
  }
  if (entries.some((e) => e.endsWith('.podspec'))) return 'podspec';
  return false;
}

/**
 * Checks a package and, below it, everything it depends on at runtime:
 * a pure-JS package can still pull a native one in. Returns the first
 * problem as `[reason, chain]`, or false.
 */
function shipsNativeCode(name, importer, seen = new Set(), chain = [name]) {
  const dir = packageDir(name, importer);
  if (!dir) {
    // Type-only imports (e.g. `mdast` → @types/mdast) have no runtime module.
    if (chain.length === 1 && isTypeOnly(name, importer)) return false;
    return ['cannot be resolved, so it cannot be checked', chain];
  }
  if (seen.has(dir)) return false;
  seen.add(dir);

  const marker = nativeMarker(dir);
  if (marker) return [marker, chain];

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const from = join(dir, 'package.json');
  const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
  const deps = [...Object.keys(pkg.dependencies ?? {}), ...optional];
  for (const dep of deps) {
    if (PLATFORM.has(dep)) continue;
    // An optional dependency that isn't installed isn't part of the graph.
    if (optional.has(dep) && packageDir(dep, from) === null) continue;
    const found = shipsNativeCode(dep, from, seen, [...chain, dep]);
    if (found) return found;
  }
  return false;
}

walk(entry);
const checked = new Set();
for (const [name, importer] of packages) {
  const found = shipsNativeCode(name, importer, checked);
  if (found) {
    const [reason, chain] = found;
    problems.push(
      `${relative(root, importer)}: imports "${name}", ${
        chain.length > 1
          ? `which depends on ${chain.slice(1).join(' → ')}: `
          : ''
      }${reason}`
    );
  }
}

console.log(
  `Checked ${visited.size} modules and ${packages.size} third-party packages (and their dependencies) reachable from ${relative(root, entry)}.`
);
if (problems.length) {
  console.error(
    'Native code is reachable from the main entry point (breaks Expo Go, decision D2):'
  );
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('OK: no native code reachable (Expo Go safe).');
