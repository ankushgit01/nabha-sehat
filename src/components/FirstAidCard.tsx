/** Renders bundled (offline) first-aid content. No network involved anywhere. */
import React from 'react';
import { View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import firstAid from '../assets/first-aid/firstAid.json';
import { useApp } from '../app-state/AppContext';
import { Icon, SpeakButton } from './ui';
import type { Lang } from '../db/types';

type L = Record<Lang, string>;
type LL = Record<Lang, string[]>;
interface Topic {
  icon: string;
  title: L;
  do: LL;
  dont: LL;
}
const TOPICS = firstAid.topics as unknown as Record<string, Topic>;
export const FIRST_AID_TOPICS = Object.keys(TOPICS);
export const topicMeta = (id: string) => TOPICS[id];

export function FirstAidCard({ topic }: { topic: string }) {
  const { lang } = useApp();
  const { t } = useTranslation();
  const tp = TOPICS[topic] ?? TOPICS.general_emergency!;
  const steps = tp.do[lang];
  const donts = tp.dont[lang];
  const spoken = [tp.title[lang], ...steps, donts.length ? t('result.dont') : '', ...donts].join('. ');
  return (
    <Card mode="outlined" testID={`first-aid-${topic}`}>
      <Card.Title
        title={tp.title[lang]}
        titleVariant="titleLarge"
        titleNumberOfLines={3}
        left={() => <Icon name={tp.icon} />}
        right={() => <SpeakButton text={spoken} />}
      />
      <Card.Content style={{ gap: 10 }}>
        <Text variant="titleMedium">{t('result.whatToDo')}</Text>
        {steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text variant="titleMedium" style={{ fontWeight: '800', minWidth: 24 }}>
              {i + 1}.
            </Text>
            <Text variant="bodyLarge" style={{ flex: 1 }}>
              {s}
            </Text>
          </View>
        ))}
        {donts.length > 0 && (
          <>
            <Text variant="titleMedium" style={{ color: '#B00020', marginTop: 6 }}>
              ✕ {t('result.dont')}
            </Text>
            {donts.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="close-octagon" size={22} color="#B00020" />
                <Text variant="bodyLarge" style={{ flex: 1 }}>
                  {s}
                </Text>
              </View>
            ))}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
