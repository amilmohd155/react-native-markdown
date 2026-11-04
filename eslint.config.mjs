import { fixupConfigRules } from '@eslint/compat';
import reactNativeConfig from '@react-native/eslint-config/flat';
import prettierConfig from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  ...fixupConfigRules(reactNativeConfig),
  {
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  // Formatting is Prettier's job.
  prettierConfig,
  {
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
    files: ['src/{api,model,parse,plugins,render,theme}/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // The node table packs flags into Uint8 bits and hashes blocks (FNV-1a).
      'no-bitwise': 'off',
    },
  },
  {
    // example/android and example/ios are generated (expo prebuild).
    ignores: ['node_modules/', 'lib/', 'example/android/', 'example/ios/'],
  },
]);
