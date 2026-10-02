// Allows bundling .tflite models when EXPO_PUBLIC_TRIAGE_ENGINE=tflite.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');
module.exports = config;
