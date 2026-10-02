/** First-aid library — bundled content. Offline: identical. */
import React from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../src/app-state/AppContext';
import { FIRST_AID_TOPICS, topicMeta } from '../../src/components/FirstAidCard';
import { BigButton, ReviewBanner, SosButton, styles } from '../../src/components/ui';

export default function FirstAidIndex() {
  const { lang } = useApp();
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <SosButton big />
      <ReviewBanner />
      {FIRST_AID_TOPICS.filter((k) => k !== 'general_emergency').map((k) => (
        <BigButton
          key={k}
          icon={topicMeta(k)!.icon}
          label={topicMeta(k)!.title[lang]}
          onPress={() => router.push({ pathname: '/first-aid/[topic]', params: { topic: k } })}
        />
      ))}
    </ScrollView>
  );
}
