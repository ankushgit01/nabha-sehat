/**
 * The automatic branch point of the decision flow.
 *  - emergency → SOS button first + first aid shown instantly (bundled; zero network)
 *  - urgent/routine → doctor consult (online) or queued request (offline) + scheme check
 *  - self_care → safe home-care guidance
 * Offline: everything renders from the local symptom_log + bundled content.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { FirstAidCard } from '../../src/components/FirstAidCard';
import { BigButton, Disclaimer, Icon, ReviewBanner, SosButton, SpeakButton, SyncBadge, styles } from '../../src/components/ui';
import { URGENCY } from '../../src/theme';
import { SYMPTOM_BY_ID } from '../../src/features/triage/vocab';
import type { SymptomLog } from '../../src/db/types';

export default function TriageResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, online, lang } = useApp();
  const { t } = useTranslation();
  const [log, setLog] = useState<SymptomLog | null>(null);

  useEffect(() => {
    void repo.get('symptom_logs', id).then((l) => setLog(l ?? null));
  }, [id, repo]);
  if (!log) return null;

  const u = URGENCY[log.urgency];
  const headline = t(`result.${log.urgency}`);
  const generic =
    log.urgency === 'self_care' ? t('result.selfCareGeneric') : log.urgency === 'routine' ? t('result.routineGeneric') : t('result.urgentGeneric');
  const symptomNames = log.selected_symptoms.map((s) => SYMPTOM_BY_ID.get(s)?.label[lang] ?? s).join(', ');

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ReviewBanner />
      <View
        testID={`urgency-${log.urgency}`}
        accessibilityRole="alert"
        style={{ backgroundColor: u.color, borderRadius: 20, padding: 20, gap: 8, alignItems: 'center' }}
      >
        <Icon name={u.icon} size={56} color={u.onColor} />
        <Text variant="headlineMedium" style={{ color: u.onColor, textAlign: 'center', fontWeight: '800' }}>
          {headline}
        </Text>
        <Text style={{ color: u.onColor, textAlign: 'center' }}>{symptomNames}</Text>
        <SpeakButton text={`${headline}. ${log.urgency === 'emergency' ? '' : generic}`} size={36} />
      </View>

      {log.urgency === 'emergency' && (
        <>
          <SosButton big symptom={log.selected_symptoms.find((s) => SYMPTOM_BY_ID.get(s)?.firstAid === log.advice_topic)} />
          <Text variant="titleLarge">{t('sos.firstAidBelow')}</Text>
          <FirstAidCard topic={log.advice_topic ?? 'general_emergency'} />
        </>
      )}

      {log.urgency !== 'emergency' && (
        <>
          <Card mode="contained">
            <Card.Content>
              <Text variant="bodyLarge">{generic}</Text>
            </Card.Content>
          </Card>
          {log.advice_topic && <FirstAidCard topic={log.advice_topic} />}
          {log.urgency !== 'self_care' && (
            <BigButton
              testID="consult-from-result"
              icon={online ? 'doctor' : 'clock-outline'}
              label={online ? t('result.consult') : t('result.consultOffline')}
              onPress={() => router.push({ pathname: '/consultation/new', params: { symptomLogId: log.id } })}
            />
          )}
          <BigButton icon="card-account-details-star-outline" label={t('result.schemeCheck')} onPress={() => router.push('/schemes')} />
        </>
      )}

      {log.concern_areas.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text variant="titleMedium">{t('result.concerns')}</Text>
          <Text variant="bodyLarge">{log.concern_areas.map((c) => t(`concern.${c}`)).join(' · ')}</Text>
        </View>
      )}
      <View style={{ gap: 4 }}>
        <SyncBadge status={log.sync_status} />
        <Text variant="bodySmall">
          {t('result.decisionSupport')} · {t('result.speed', { ms: Math.max(1, Math.round(log.inference_ms)) })} · {log.model_version}
        </Text>
      </View>
      <Disclaimer />
    </ScrollView>
  );
}
