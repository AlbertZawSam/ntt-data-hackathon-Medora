// Learn more: https://docs.expo.dev/guides/customizing-metro/
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// amplify_outputs.json only exists after `npm run sandbox`. Until then,
// bundle an empty stub so the app still opens and says the backend isn't deployed.
const outputsPath = path.join(__dirname, 'amplify_outputs.json');
const stubPath = path.join(__dirname, 'src/services/amplify-outputs.missing.json');
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('amplify_outputs.json') && !fs.existsSync(outputsPath)) {
    return { type: 'sourceFile', filePath: stubPath };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
