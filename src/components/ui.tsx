/**
 * Shared accessible building blocks: every actionable element pairs an icon with
 * text, is ≥56dp tall, exposes an accessibilityLabel, and can be read aloud.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text, useTheme, Banner, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useApp } from '../app-state/AppContext';
import { canSpeak, speak, stopSpeaking } from '../platform/voice';
import { TOUCH } from '../theme';
import type { SyncStatus } from '../db/types';
import firstAid from '../assets/first-aid/firstAid.json';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 32, color }: { name: string; size?: number; color?: string }) {
  const theme = useTheme();
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? theme.colors.onSurface} />;
}

/** Big icon-first tile. Long-press reads the label aloud (helps non-readers explore). */
export function BigButton(props: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  style?: ViewStyle;
  height?: number;
  testID?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const { lang } = useApp();
  const bg = props.color ?? theme.colors.primaryContainer;
  const fg = props.textColor ?? theme.colors.onPrimaryContainer;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      onLongPress={() => speak(props.label, lang)}
      style={({ pressed }) => [
        styles.big,
        { backgroundColor: bg, minHeight: props.height ?? TOUCH.large, opacity: props.disabled ? 0.5 : pressed ? 0.8 : 1 },
        props.style,
      ]}
    >
      <Icon name={props.icon} size={36} color={fg} />
      <Text variant="titleMedium" style={{ color: fg, flexShrink: 1 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Reads text aloud in the current language; hidden when no TTS voice is installed. */
export function SpeakButton({ text, size = 28 }: { text: string; size?: number }) {
  const { lang } = useApp();
  const { t } = useTranslation();
  const [ok, setOk] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    void canSpeak(lang).then(setOk);
    return () => stopSpeaking();
  }, [lang]);
  if (!ok) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? t('common.stop') : t('common.listen')}
      hitSlop={12}
      style={styles.speak}
      onPress={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else {
          setSpeaking(true);
          speak(text, lang, { onDone: () => setSpeaking(false) });
        }
      }}
    >
      <Icon name={speaking ? 'stop-circle' : 'volume-high'} size={size} />
    </Pressable>
  );
}

export function OfflineBanner() {
  const { online, syncing } = useApp();
  const { t } = useTranslation();
  if (online && !syncing) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.offline, { backgroundColor: online ? '#E3F2FD' : '#FFF3E0' }]}>
      <Icon name={online ? 'cloud-sync' : 'wifi-off'} size={22} color="#333" />
      <Text style={{ color: '#333', flex: 1 }}>{online ? t('net.syncing') : t('net.offline')}</Text>
    </View>
  );
}

const SYNC_ICON: Record<SyncStatus, string> = {
  local_only: 'cellphone',
  pending: 'cloud-upload-outline',
  synced: 'cloud-check',
  conflict: 'cloud-alert',
};
export function SyncBadge({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();
  return (
    <Chip compact icon={SYNC_ICON[status]} accessibilityLabel={t(`sync.${status}`)} style={{ alignSelf: 'flex-start' }}>
      {t(`sync.${status}`)}
    </Chip>
  );
}

/** Persistent SOS button (home + every tab header). Navigates — never needs network. */
export function SosButton({ big, symptom }: { big?: boolean; symptom?: string }) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID="sos-button"
      accessibilityRole="button"
      accessibilityLabel={`${t('home.sos')}. ${t('home.sosHint')}`}
      onPress={() => router.push({ pathname: '/sos', params: symptom ? { symptom } : {} })}
      style={({ pressed }) => [
        big ? styles.sosBig : styles.sosSmall,
        { backgroundColor: '#B00020', opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name="alarm-light" size={big ? 48 : 24} color="#fff" />
      <Text variant={big ? 'headlineMedium' : 'labelLarge'} style={{ color: '#fff', fontWeight: '800' }}>
        {t('home.sos')}
      </Text>
      {big && (
        <Text variant="bodyLarge" style={{ color: '#fff' }}>
          {t('home.sosHint')}
        </Text>
      )}
    </Pressable>
  );
}

export function Disclaimer() {
  const { t } = useTranslation();
  return (
    <View style={styles.disclaimer} accessibilityRole="text">
      <Icon name="information-outline" size={20} />
      <Text variant="bodySmall" style={{ flex: 1 }}>
        {t('app.disclaimer')}
      </Text>
    </View>
  );
}

export function ReviewBanner() {
  const { t } = useTranslation();
  if ((firstAid._review.status as string) === 'APPROVED') return null;
  return (
    <Banner visible icon="alert-outline" style={{ backgroundColor: '#FFF8E1' }}>
      {t('app.reviewBanner')}
    </Banner>
  );
}

export const styles = StyleSheet.create({
  big: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
  speak: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  sosBig: { minHeight: TOUCH.sos + 40, borderRadius: 24, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 4 },
  sosSmall: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 24, marginRight: 8 },
  disclaimer: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, opacity: 0.85 },
  screen: { padding: 16, gap: 16 },
});
