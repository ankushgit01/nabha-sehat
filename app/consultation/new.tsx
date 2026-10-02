/**
 * Request a consultation. Offline: saved locally as 'queued' with a clear
 * "will send when back online" message; video option explains it needs internet
 * but the request can still be queued.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { requestConsultation } from '../../src/features/consultation/consultationService';
import { BigButton, OfflineBanner, styles } from '../../src/components/ui';
import { VoiceInput } from '../../src/components/VoiceInput';
import type { ConsultationMode } from '../../src/db/types';

export default function NewConsultation() {
  const { symptomLogId } = useLocalSearchParams<{ symptomLogId?: string }>();
  const { t } = useTranslation();
  const { repo, online, api, auth } = useApp();
  const [mode, setMode] = useState<ConsultationMode>('chat');
  const [note, setNote] = useState('');
  const [avail, setAvail] = useState<{ doctorsOnline: number; waiting: number } | null>(null);

  useEffect(() => {
    if (online && auth) api.consultations.availability().then(setAvail).catch(() => setAvail(null));
  }, [online, auth, api]);

  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen}>
        <Text variant="titleLarge">{t('consult.mode')}</Text>
        <SegmentedButtons
          value={mode}
          onValueChange={(v) => setMode(v as ConsultationMode)}
          buttons={[
            { value: 'chat', label: t('consult.chat'), icon: 'message-text' },
            { value: 'audio', label: t('consult.audio'), icon: 'phone' },
            { value: 'video', label: t('consult.video'), icon: 'video' },
          ]}
        />
        {mode === 'video' && !online && <HelperText type="info">{t('consult.videoNeedsNet')}</HelperText>}
        {avail && (
          <Text variant="bodyLarge">
            👩‍⚕️ {avail.doctorsOnline} · ⏳ {avail.waiting}
          </Text>
        )}
        <Text variant="titleMedium">{t('consult.note')}</Text>
        <VoiceInput onTranscript={(txt, final) => final && setNote((n) => `${n} ${txt}`.trim())} />
        <TextInput mode="outlined" multiline value={note} onChangeText={setNote} left={<TextInput.Icon icon="pencil" />} />
        <BigButton
          testID="consult-request"
          icon={online ? 'send' : 'clock-outline'}
          label={t('consult.request')}
          onPress={async () => {
            const c = await requestConsultation(repo, { mode, symptomLogId: symptomLogId ?? null, note: note || null });
            router.replace({ pathname: '/consultation/[id]', params: { id: c.id } });
          }}
        />
        {!auth && <HelperText type="info">{t('settings.register')}</HelperText>}
      </ScrollView>
    </>
  );
}
