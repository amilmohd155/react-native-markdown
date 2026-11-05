import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * D2: the main entry must stay pure JS so it runs in Expo Go. The check is
 * `scripts/check-no-native.mjs`; these tests make sure it can fail, so a
 * regression in the script itself doesn't turn the CI job into a rubber stamp.
 */
const SCRIPT = join(__dirname, '../../scripts/check-no-native.mjs');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'expo-go-check-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(path: string, content = '') {
  const file = join(dir, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

/** Installs a fake package in the temp project's node_modules. */
function pkg(
  name: string,
  manifest: object = {},
  files: readonly string[] = []
) {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  );
  write(`node_modules/${name}/index.js`, 'module.exports = {};');
  for (const file of files) write(`node_modules/${name}/${file}`);
}

function check(entry: string) {
  write('entry.js', entry);
  const run = spawnSync(process.execPath, [SCRIPT, join(dir, 'entry.js')], {
    encoding: 'utf8',
  });
  return { ok: run.status === 0, output: run.stdout + run.stderr };
}

describe('check:expo-go', () => {
  it('passes pure JS and the platform packages', () => {
    pkg('left-pad');
    const result = check(
      "import 'react';\nimport 'react-native';\nimport 'left-pad';\n"
    );
    expect(result.output).toContain('OK');
    expect(result.ok).toBe(true);
  });

  it.each([
    ['TurboModuleRegistry', "TurboModuleRegistry.get('X');"],
    ['requireNativeComponent', "requireNativeComponent('X');"],
    ['NativeModules', 'NativeModules.X;'],
    ['react-native-nitro-modules', "import 'react-native-nitro-modules';"],
  ])('fails on %s in the entry graph', (api, code) => {
    const result = check(code);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(api);
  });

  it('fails on a module reached through a relative import', () => {
    write('deep.js', 'NativeModules.X;');
    const result = check("import './deep.js';");
    expect(result.ok).toBe(false);
    expect(result.output).toContain('deep.js');
  });

  it.each([
    ['an android directory', { files: ['android/build.gradle'] }],
    ['an ios directory', { files: ['ios/Module.swift'] }],
    ['a podspec', { files: ['thing.podspec'] }],
    ['a codegen config', { manifest: { codegenConfig: { name: 'x' } } }],
  ])('fails on a package with %s', (_label, spec) => {
    pkg(
      'native-thing',
      'manifest' in spec ? spec.manifest : {},
      'files' in spec ? spec.files : []
    );
    const result = check("import 'native-thing';");
    expect(result.ok).toBe(false);
    expect(result.output).toContain('native-thing');
  });

  it('fails on a native package behind a pure JS one, naming the chain', () => {
    pkg('pure', { dependencies: { 'native-thing': '1.0.0' } });
    pkg('native-thing', {}, ['ios/Module.swift']);
    const result = check("import 'pure';");
    expect(result.ok).toBe(false);
    expect(result.output).toContain('pure');
    expect(result.output).toContain('native-thing');
  });

  it('ignores an optional dependency that is not installed', () => {
    pkg('pure', { optionalDependencies: { missing: '1.0.0' } });
    expect(check("import 'pure';").ok).toBe(true);
  });
});
