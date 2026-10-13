/**
 * Onboarding step 3: phone login + patient details. Both optional – "Skip" keeps
 * everything working offline on this phone (SOS never needs a login).
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { PhoneLogin } from '../../src/components/PhoneLogin';
import { ProfileForm } from '../../src/components/ProfileForm';
import { BigButton, SpeakButton } from '../../src/components/ui';

export default function ProfileOnboarding() {
  const { t } = useTranslation();
  const { auth, completeOnboarding } = useApp();
  const finish = async () => {
    await completeOnboarding();
    router.replace('/(tabs)/home');
  };
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text variant="headlineMedium">{t('profile.title')}</Text>
        <Text variant="bodyLarge">{t('profile.intro')}</Text>
        <SpeakButton text={t('profile.intro')} size={36} />
        {auth ? <Text variant="titleMedium">✅ {t('profile.loggedInAs', { phone: auth.phone })}</Text> : <PhoneLogin />}
        <Divider />
        <ProfileForm onSaved={finish} />
        <BigButton icon="debug-step-over" label={t('profile.skip')} color="transparent" onPress={finish} />
      </ScrollView>
    </SafeAreaView>
  );
}
