const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');
const pkgName = require('../package.json').name;

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});

// react-native-monorepo-config only prefers the `source` condition for the bare
// package name. Plugin subpaths (`<pkg>/emoji`, P3-22) need it too, or they
// resolve to the built `lib/` output.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(`${pkgName}/`)) {
    context = {
      ...context,
      unstable_conditionNames: ['source', ...context.unstable_conditionNames],
    };
  }
  return resolveRequest(context, moduleName, platform);
};

module.exports = config;
