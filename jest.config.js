/**
 * One Jest project per kind of test (`--selectProjects <name>`):
 *
 * - `unit`: the library's own tests, React Native preset (`yarn test`).
 * - `web`: the renderer under react-native-web and jsdom (`yarn test:web`).
 * - `spec`: the CommonMark and GFM suites, plain Node (`yarn test:spec`).
 * - `stream`: the stream equivalence harness, plain Node (`yarn test:stream`).
 * - `perf`: parse and render time against stored baselines (`yarn perf`).
 */

const shared = {
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
};

// The package name resolves to the sources, so tests and perf import it as a
// user would.
const library = '<rootDir>/src/index.tsx';

// Projects that run React Native code through its own preset.
const reactNative = {
  ...shared,
  preset: 'react-native',
  moduleNameMapper: { '^@docren/react-native-markdown$': library },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)',
  ],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...reactNative,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)'],
      // `*.web.test.tsx` belongs to the web project.
      testPathIgnorePatterns: ['/node_modules/', '\\.web\\.test\\.[jt]sx?$'],
    },
    {
      ...shared,
      displayName: 'web',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.web.test.[jt]s?(x)'],
      moduleNameMapper: {
        '^@docren/react-native-markdown$': library,
        '^react-native$': 'react-native-web',
      },
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
    },
    {
      ...shared,
      displayName: 'spec',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/spec/**/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'stream',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/stream/**/*.test.ts'],
    },
    {
      ...reactNative,
      displayName: 'perf',
      testMatch: ['<rootDir>/perf/**/*.test.[jt]s?(x)'],
    },
  ],
};
