/**
 * First-launch language picker. Choosable without reading: each tile shows a big
 * script glyph + native name, and tapping SPEAKS the language name before moving on.
 * Offline: fully local.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LANGUAGES } from '../../src/i18n';
import { useApp } from '../../src/app-state/AppContext';
import { speak } from '../../src/platform/voice';
import { BigButton, SosButton } from '../../src/components/ui';

export default function LanguageScreen() {
  const { setLang } = useApp();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
          ਭਾਸ਼ਾ ਚੁਣੋ · भाषा चुनें · Choose language
        </Text>
        {LANGUAGES.map((l) => (
          <BigButton
            key={l.code}
            testID={`lang-${l.code}`}
            icon="translate"
            label={`${l.glyph}   ${l.nativeName}`}
            height={96}
            onPress={async () => {
              speak(l.spokenPrompt, l.code);
              await setLang(l.code);
              router.replace('/(onboarding)/welcome');
            }}
          />
        ))}
        <View style={{ marginTop: 24 }}>
          <SosButton big />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
