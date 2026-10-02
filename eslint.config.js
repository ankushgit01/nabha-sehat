// Shared lint config (app). Backend uses the same rules via its own tsconfig.
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = [
  ...expo,
  prettier,
  {
    ignores: ['node_modules', 'dist', 'ml', 'backend/node_modules', '.expo'],
  },
  {
    // Guardrail for spec §10: platform-specific modules may only be imported from src/platform/* and src/components/map/*.
    files: ['app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'expo-sqlite', message: 'Use src/platform/storage (LocalStore).' },
            { name: 'expo-speech', message: 'Use src/platform/voice.' },
            { name: 'expo-speech-recognition', message: 'Use src/platform/voice.' },
            { name: 'react-native-maps', message: 'Use src/components/map/FacilityMap.' },
            { name: 'react-leaflet', message: 'Use src/components/map/FacilityMap.' },
            { name: 'expo-sms', message: 'Use src/platform/telephony.' },
          ],
        },
      ],
    },
  },
];
