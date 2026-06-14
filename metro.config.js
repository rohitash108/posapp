const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// On web, expo-sqlite is not needed (we use IndexedDB instead).
// Exclude it to avoid the missing wa-sqlite.wasm error during web builds.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'expo-sqlite' || moduleName.startsWith('expo-sqlite/'))
  ) {
    return { type: 'empty' };
  }

  // Zustand's ESM build (esm/middleware.mjs) uses `import.meta` which Hermes
  // cannot handle on web. Force the CJS build instead.
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const cjsPath = require.resolve(moduleName, { paths: [__dirname] });
    return { type: 'sourceFile', filePath: cjsPath };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
