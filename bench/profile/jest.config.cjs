/**
 * Jest project for the Node sweep (React Native preset, so `react-native`
 * resolves). Run through `yarn profile` in bench/, not directly.
 */
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

module.exports = {
  rootDir: root,
  preset: 'react-native',
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
  moduleNameMapper: {
    '^@docren/react-native-markdown$': '<rootDir>/src/index.tsx',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)',
  ],
  testMatch: ['<rootDir>/bench/profile/**/*.test.[jt]s?(x)'],
};
