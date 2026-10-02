import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nabha Sehat',
  slug: 'nabha-telemedicine',
  scheme: 'nabhasehat',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'in.nabhasehat.app',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Your location is sent with an SOS message so help can find you.',
      NSMicrophoneUsageDescription: 'Speak your symptoms instead of typing.',
      NSSpeechRecognitionUsageDescription: 'Turns your spoken symptoms into text.',
      NSCameraUsageDescription: 'Take a photo of a wound, rash or prescription for your health record.',
    },
  },
  android: {
    package: 'in.nabhasehat.app',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO', 'CALL_PHONE', 'SEND_SMS', 'CAMERA'],
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router', 'expo-sqlite', 'expo-location', 'expo-image-picker'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.org',
    triageEngine: 'js',
  },
  experiments: { typedRoutes: true },
};

export default config;
