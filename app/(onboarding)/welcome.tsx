/**
 * Welcome + optional emergency contact. No account needed (spec §3).
 * Offline: contact is stored locally; nothing is sent anywhere.
 */
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { BigButton, Disclaimer, SpeakButton } from '../../src/components/ui';

export default function Welcome() {
  const { t } = useTranslation();
  const { saveContact, completeOnboarding } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const finish = async () => {
    if (phone.replace(/\D/g, '').length >= 10) await saveContact({ name: name || phone, phone, relation: null });
    await completeOnboarding();
    router.replace('/(tabs)/home');
  };
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text variant="headlineMedium">{t('onboarding.welcomeTitle')}</Text>
        <Text variant="bodyLarge">{t('onboarding.welcomeBody')}</Text>
        <SpeakButton text={`${t('onboarding.welcomeBody')} ${t('onboarding.contactBody')}`} size={36} />
        <Text variant="titleLarge">{t('onboarding.contactTitle')}</Text>
        <Text variant="bodyLarge">{t('onboarding.contactBody')}</Text>
        <TextInput mode="outlined" label={t('onboarding.contactName')} value={name} onChangeText={setName} left={<TextInput.Icon icon="account" />} />
        <TextInput
          mode="outlined"
          label={t('onboarding.contactPhone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          left={<TextInput.Icon icon="phone" />}
        />
        <BigButton icon="check-bold" label={t('common.save')} onPress={finish} />
        <BigButton icon="debug-step-over" label={t('onboarding.skip')} onPress={finish} color="transparent" />
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}
