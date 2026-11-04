import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': [
        'error',
        {
          quoteProps: 'consistent',
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'es5',
          useTabs: false,
        },
      ],
    },
  },
  {
    // v1 code (Phase 1): no `any`, so internal types can't leak loosely into
    // the public API. The v0.x code is exempt until it is removed in M5/M6.
    files: [
      'src/{api,mdast,model,parse,plugins,render,theme}/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // The node table packs flags into Uint8 bits and hashes blocks (FNV-1a).
      'no-bitwise': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'lib/'
    ],
  },
]);
