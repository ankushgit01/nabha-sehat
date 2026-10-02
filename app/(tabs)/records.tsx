/**
 * Personal health record: chronological, searchable, from LOCAL storage.
 * Shows per-record sync state ("saved on this phone" vs "synced").
 * Offline: identical behaviour; new photos/documents are copied into app storage
 * and uploaded by the sync worker later.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, View } from 'react-native';
import { Card, Searchbar, Text } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { useApp } from '../../src/app-state/AppContext';
import { BigButton, Icon, OfflineBanner, SyncBadge } from '../../src/components/ui';
import { URGENCY } from '../../src/theme';
import type { HealthRecord, SosEvent, SyncStatus, UrgencyTier } from '../../src/db/types';

interface Row {
  id: string;
  kind: HealthRecord['type'];
  title: string;
  subtitle: string;
  at: string;
  sync: SyncStatus;
  icon: string;
  color?: string;
  image?: string | null;
  onPress?: () => void;
}

export default function Records() {
  const { t, i18n } = useTranslation();
  const { repo, store } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const recs = await repo.list('health_records');
    const sos = await store.list<SosEvent>('sos_events', { orderBy: '-created_at' });
    const out: Row[] = recs.map((r) => {
      const urg = r.type === 'symptom_log' ? URGENCY[r.summary as UrgencyTier] : undefined;
      return {
        id: r.id,
        kind: r.type,
        title: r.type === 'consultation' ? t('records.consultation') : r.title,
        subtitle: r.type === 'symptom_log' ? t(`result.${r.summary}`) : r.summary ?? t(`records.${r.type}`),
        at: r.created_at,
        sync: r.sync_status,
        icon: urg?.icon ?? (r.type === 'consultation' ? 'doctor' : 'file-document-outline'),
        color: urg?.color,
        image: r.mime_type?.startsWith('image/') ? r.file_uri : null,
        onPress:
          r.type === 'symptom_log' && r.reference_id
            ? () => router.push({ pathname: '/triage-result/[id]', params: { id: r.reference_id! } })
            : r.type === 'consultation' && r.reference_id
              ? () => router.push({ pathname: '/consultation/[id]', params: { id: r.reference_id! } })
              : undefined,
      };
    });
    for (const s of sos) {
      out.push({
        id: s.id,
        kind: 'sos_event',
        title: t('records.sos_event'),
        subtitle: [s.reported_symptom, s.contacted_numbers.join(', ')].filter(Boolean).join(' · '),
        at: s.created_at,
        sync: s.sync_status,
        icon: 'alarm-light',
        color: '#B00020',
      });
    }
    out.sort((a, b) => b.at.localeCompare(a.at));
    setRows(out);
  }, [repo, store, t]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.title} ${r.subtitle}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  const addDocument = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    let uri = a.uri;
    if (Platform.OS !== 'web') {
      // Copy into app storage so the record survives gallery cleanup; compressed via quality above.
      const dest = `${FileSystem.documentDirectory}records/${Date.now()}.jpg`;
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}records`, { intermediates: true });
      await FileSystem.copyAsync({ from: a.uri, to: dest });
      uri = dest;
    }
    await repo.create('health_records', {
      type: 'document',
      reference_id: null,
      title: a.fileName ?? t('records.document'),
      file_uri: uri,
      file_remote_url: null,
      mime_type: a.mimeType ?? 'image/jpeg',
      summary: null,
    });
    await load();
  };

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={filtered}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Searchbar placeholder={t('records.search')} value={q} onChangeText={setQ} />
            <BigButton icon="camera-plus" label={t('records.addDoc')} onPress={addDocument} />
          </View>
        }
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 32 }}>{t('records.empty')}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={item.onPress} disabled={!item.onPress} accessibilityRole={item.onPress ? 'button' : 'text'}>
            <Card mode="outlined">
              <Card.Content style={{ flexDirection: 'row', gap: 12 }}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                ) : (
                  <Icon name={item.icon} size={40} color={item.color} />
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="titleMedium">{item.title}</Text>
                  <Text variant="bodyMedium">{item.subtitle}</Text>
                  <Text variant="bodySmall">{new Date(item.at).toLocaleString(i18n.language === 'en' ? 'en-IN' : `${i18n.language}-IN`)}</Text>
                  <SyncBadge status={item.sync} />
                </View>
              </Card.Content>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
