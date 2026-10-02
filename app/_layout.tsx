/**
 * Root: providers, bundled regional fonts, onboarding gate.
 * Offline: fonts are bundled (no Google Fonts fetch); all state boots from local storage.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { NotoSansGurmukhi_400Regular } from '@expo-google-fonts/noto-sans-gurmukhi';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from '../src/app-state/AppContext';
import { buildTheme } from '../src/theme';
import { fontFor } from '../src/i18n';

function Shell() {
  const app = useApp();
  const scheme = useColorScheme();
  const { t } = useTranslation();
  const theme = useMemo(
    () =>
      buildTheme({
        fontFamily: fontFor(app.lang),
        fontScale: app.fontScale,
        highContrast: app.highContrast,
        dark: scheme === 'dark',
      }),
    [app.lang, app.fontScale, app.highContrast, scheme],
  );

  if (!app.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  // Onboarding gate lives in app/index.tsx and app/(tabs)/_layout.tsx (redirecting from the
  // root layout before the navigator mounts is unsupported). SOS is reachable before onboarding.
  return (
    <PaperProvider theme={theme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { fontFamily: fontFor(app.lang) },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sos" options={{ title: t('sos.title'), headerStyle: { backgroundColor: '#B00020' }, headerTintColor: '#fff' }} />
        <Stack.Screen name="triage-result/[id]" options={{ title: t('result.title') }} />
        <Stack.Screen name="consultation/new" options={{ title: t('consult.title') }} />
        <Stack.Screen name="consultation/[id]" options={{ title: t('consult.title') }} />
        <Stack.Screen name="schemes" options={{ title: t('schemes.title') }} />
        <Stack.Screen name="first-aid/index" options={{ title: t('home.firstAid') }} />
        <Stack.Screen name="first-aid/[topic]" options={{ title: t('home.firstAid') }} />
      </Stack>
    </PaperProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    NotoSansGurmukhi: NotoSansGurmukhi_400Regular,
    NotoSansDevanagari: NotoSansDevanagari_400Regular,
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
