import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FirstAidCard } from '../../src/components/FirstAidCard';
import { ReviewBanner, SosButton, styles } from '../../src/components/ui';

export default function FirstAidTopic() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <SosButton big />
      <ReviewBanner />
      <FirstAidCard topic={topic} />
    </ScrollView>
  );
}
