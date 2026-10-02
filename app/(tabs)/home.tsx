/**
 * Home: the start of the single decision flow. Huge SOS at top, then "check my symptoms".
 * Offline: every tile works; "Talk to a doctor" queues the request locally.
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BigButton, Disclaimer, OfflineBanner, SosButton, SpeakButton, styles } from '../../src/components/ui';

export default function Home() {
  const { t } = useTranslation();
  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen}>
        <SosButton big />
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('home.howFeel')} <SpeakButton text={t('home.howFeel')} />
        </Text>
        <BigButton testID="home-check" icon="stethoscope" label={t('home.checkSymptoms')} height={96} onPress={() => router.push('/(tabs)/symptom-check')} />
        <BigButton icon="doctor" label={t('home.talkDoctor')} onPress={() => router.push('/consultation/new')} />
        <BigButton icon="medical-bag" label={t('home.firstAid')} onPress={() => router.push('/first-aid')} />
        <BigButton icon="folder-heart-outline" label={t('home.myRecords')} onPress={() => router.push('/(tabs)/records')} />
        <BigButton icon="card-account-details-star-outline" label={t('home.schemes')} onPress={() => router.push('/schemes')} />
        <BigButton icon="hospital-marker" label={t('home.hospitals')} onPress={() => router.push('/(tabs)/facilities')} />
        <Disclaimer />
      </ScrollView>
    </>
  );
}
