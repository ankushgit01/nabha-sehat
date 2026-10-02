/**
 * Consultation status + chat.
 * Offline: shows the locally saved request with its queued state, and any doctor
 * note/prescription already synced. Chat/video show an explicit "needs internet".
 * Online: refreshes queue status every 10 s ONLY while this screen is open
 * (the global sync worker never polls).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { consultationView } from '../../src/features/consultation/consultationService';
import { decidePull } from '../../src/features/sync/merge';
import { BigButton, Icon, OfflineBanner, SpeakButton, SyncBadge, styles } from '../../src/components/ui';
import type { Consultation } from '../../src/db/types';

export default function ConsultationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { repo, store, online, api, auth } = useApp();
  const [c, setC] = useState<Consultation | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<{ id: string; from: 'patient' | 'doctor'; text: string }[]>([]);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => setC((await repo.get('consultations', id)) ?? null), [id, repo]);
  useEffect(() => void load(), [load]);

  useFocusEffect(
    useCallback(() => {
      if (!online || !auth) return;
      let alive = true;
      const tick = async () => {
        try {
          const q = await api.consultations.queueStatus(id);
          const local = await repo.get('consultations', id);
          const d = decidePull('consultations', local, q.consultation);
          if (d.action !== 'keep_local' || d.record) await store.put('consultations', d.record!);
          if (!alive) return;
          setPos(q.position);
          await load();
          if (q.consultation.mode === 'chat') setMsgs(await api.consultations.messages(id));
        } catch {
          /* not on server yet / network blip — local state is still shown */
        }
      };
      void tick();
      const timer = setInterval(tick, 10_000);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [online, auth, api, id, repo, store, load]),
  );

  if (!c) return null;
  const view = consultationView(c, online);

  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen}>
        <Card mode="contained">
          <Card.Content style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Icon name={c.mode === 'video' ? 'video' : c.mode === 'audio' ? 'phone' : 'message-text'} />
              <Text variant="titleLarge" style={{ flex: 1 }} testID={`consult-state-${view}`}>
                {view === 'queued_offline' && t('consult.queuedOffline')}
                {view === 'waiting' && t('consult.waiting', { pos: pos ?? '…' })}
                {(view === 'active' || view === 'active_offline') && t('consult.active')}
                {view === 'completed' && t('consult.completed')}
                {view === 'cancelled' && t('consult.cancelled')}
              </Text>
            </View>
            {c.doctor_name && <Text>👩‍⚕️ {c.doctor_name}</Text>}
            <SyncBadge status={c.sync_status} />
          </Card.Content>
        </Card>

        {view === 'active' && c.room_url && c.mode !== 'chat' && (
          <BigButton icon="video" label={t('consult.join')} onPress={() => void Linking.openURL(c.room_url!)} />
        )}
        {view === 'active_offline' && c.mode !== 'chat' && <Text>{t('consult.videoNeedsNet')}</Text>}

        {c.mode === 'chat' && online && c.sync_status === 'synced' && view !== 'completed' && (
          <View style={{ gap: 8 }}>
            {msgs.map((m) => (
              <Card key={m.id} style={{ alignSelf: m.from === 'patient' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <Card.Content>
                  <Text variant="bodyLarge">{m.text}</Text>
                </Card.Content>
              </Card>
            ))}
            <TextInput
              mode="outlined"
              value={draft}
              onChangeText={setDraft}
              right={
                <TextInput.Icon
                  icon="send"
                  accessibilityLabel={t('consult.send')}
                  onPress={async () => {
                    if (!draft.trim()) return;
                    await api.consultations.sendMessage(id, draft.trim());
                    setDraft('');
                    setMsgs(await api.consultations.messages(id));
                  }}
                />
              }
            />
          </View>
        )}

        {(c.notes || c.prescription) && (
          <Card mode="outlined">
            <Card.Title title={t('consult.doctorNote')} right={() => <SpeakButton text={`${c.notes ?? ''}. ${c.prescription ?? ''}`} />} />
            <Card.Content style={{ gap: 8 }}>
              {c.notes && <Text variant="bodyLarge">{c.notes}</Text>}
              {c.prescription && (
                <>
                  <Text variant="titleMedium">℞ {t('consult.prescription')}</Text>
                  <Text variant="bodyLarge">{c.prescription}</Text>
                </>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </>
  );
}
