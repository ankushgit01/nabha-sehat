/**
 * Photo check: take/choose a photo of a cut, burn, rash, bite… and/or describe the
 * problem (headache, fever…). The server asks an AI for simple first-aid guidance.
 * Needs internet + login (the AI runs on the server). Offline it says so and points to
 * the bundled First aid guides and SOS, so there is never a dead end.
 * Photos are sent for this one check only; they are not saved on the server.
 */
import React, { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { ActivityIndicator, Card, HelperText, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { useApp } from '../src/app-state/AppContext';
import { defaultModifiers } from '../src/features/profile/profile';
import { PhoneLogin } from '../src/components/PhoneLogin';
import { BigButton, Disclaimer, Icon, OfflineBanner, SosButton, SpeakButton, styles } from '../src/components/ui';
import type { AiAdvice, AiCheckRequest } from '../src/api/client';

type Photo = { uri: string; base64: string; mediaType: NonNullable<AiCheckRequest['image']>['mediaType'] };

const URGENCY: Record<AiAdvice['urgency'], { color: string; icon: string }> = {
  emergency: { color: '#B00020', icon: 'alarm-light' },
  see_doctor_today: { color: '#E65100', icon: 'doctor' },
  see_doctor_soon: { color: '#F9A825', icon: 'calendar-clock' },
  home_care: { color: '#2E7D32', icon: 'home-heart' },
};

export default function PhotoCheck() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { api, auth, online, lang, profile } = useApp();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [text, setText] = useState('');
  const [ageGroup, setAgeGroup] = useState(() => defaultModifiers(profile).age_group);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [advice, setAdvice] = useState<AiAdvice | null>(null);

  const pick = async (camera: boolean) => {
    setErr(null);
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setErr(t('photo.noCamera'));
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, base64: true };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a?.base64) return;
    const mime = a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    setPhoto({ uri: a.uri, base64: a.base64, mediaType: mime });
    setAdvice(null);
  };

  const check = async () => {
    if (busy || (!photo && !text.trim())) return;
    setBusy(true);
    setErr(null);
    setAdvice(null);
    try {
      const result = await api.ai.check({
        image: photo ? { data: photo.base64, mediaType: photo.mediaType } : undefined,
        text: text.trim() || undefined,
        lang,
        ageGroup,
        pregnant: profile ? defaultModifiers(profile).pregnant : undefined,
      });
      setAdvice(result);
    } catch (e) {
      const status = isAxiosError(e) ? e.response?.status : undefined;
      setErr(
        status === 429
          ? t('photo.errBusy')
          : status === 400 || status === 413
            ? t('photo.errPhoto')
            : status === 401
              ? t('photo.needLogin')
              : t('photo.errGeneric'),
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    setText('');
    setAdvice(null);
    setErr(null);
  };

  if (!online) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <OfflineBanner />
        <Text variant="titleMedium">{t('photo.offline')}</Text>
        <BigButton icon="medical-bag" label={t('home.firstAid')} onPress={() => router.push('/first-aid')} />
        <SosButton big />
      </ScrollView>
    );
  }

  if (!auth) {
    return (
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium">{t('photo.needLogin')}</Text>
        <PhoneLogin />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="bodyLarge" style={{ flex: 1 }}>
          {t('photo.intro')}
        </Text>
        <SpeakButton text={t('photo.intro')} />
      </View>

      {photo ? (
        <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 240, borderRadius: 16 }} resizeMode="cover" accessibilityLabel={t('photo.yourPhoto')} />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <BigButton icon="camera" label={t('photo.takePhoto')} onPress={() => void pick(true)} style={{ flex: 1 }} />
        <BigButton icon="image" label={t('photo.gallery')} onPress={() => void pick(false)} style={{ flex: 1 }} />
      </View>

      <TextInput
        mode="outlined"
        label={t('photo.describe')}
        placeholder={t('photo.describePlaceholder')}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
      />

      <Text variant="titleMedium">{t('check.who')}</Text>
      <SegmentedButtons
        value={ageGroup}
        onValueChange={(v) => setAgeGroup(v as typeof ageGroup)}
        buttons={[
          { value: 'child', label: t('check.child'), icon: 'baby-face-outline' },
          { value: 'adult', label: t('check.adult'), icon: 'account' },
          { value: 'elderly', label: t('check.elderly'), icon: 'human-cane' },
        ]}
      />

      <BigButton
        icon="magnify-scan"
        label={busy ? t('photo.checking') : t('photo.check')}
        color={theme.colors.primary}
        textColor={theme.colors.onPrimary}
        disabled={busy || (!photo && !text.trim())}
        onPress={() => void check()}
        height={80}
      />
      {busy && <ActivityIndicator size="large" />}
      {err && (
        <HelperText type="error" visible style={{ fontSize: 16 }}>
          {err}
        </HelperText>
      )}

      {advice && <AdviceCard advice={advice} />}
      {advice && <BigButton icon="refresh" label={t('photo.again')} onPress={reset} />}
      <Disclaimer />
    </ScrollView>
  );
}

function AdviceCard({ advice }: { advice: AiAdvice }) {
  const { t } = useTranslation();
  const u = URGENCY[advice.urgency];
  const spoken = [
    t(`photo.urgency.${advice.urgency}`),
    advice.title,
    advice.what_we_see,
    t('photo.steps'),
    ...advice.steps,
  ].join('. ');
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <View style={{ backgroundColor: u.color, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Icon name={u.icon} size={40} color="#fff" />
        <Text variant="titleLarge" style={{ color: '#fff', flex: 1, fontWeight: '700' }}>
          {t(`photo.urgency.${advice.urgency}`)}
        </Text>
      </View>
      {advice.urgency === 'emergency' && <SosButton big />}

      <Card mode="outlined">
        <Card.Content style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="titleLarge" style={{ flex: 1 }}>
              {advice.title}
            </Text>
            <SpeakButton text={spoken} />
          </View>
          <Text variant="bodyLarge">{advice.what_we_see}</Text>
        </Card.Content>
      </Card>

      <Section icon="format-list-numbered" title={t('photo.steps')} items={advice.steps} numbered />
      <Section icon="close-octagon-outline" title={t('photo.avoid')} items={advice.avoid} />
      <Section icon="hospital-box-outline" title={t('photo.doctorIf')} items={advice.go_to_doctor_if} />
      {advice.urgency !== 'home_care' && (
        <BigButton icon="doctor" label={t('home.talkDoctor')} onPress={() => router.push('/consultation/new')} />
      )}
    </View>
  );
}

function Section({ icon, title, items, numbered }: { icon: string; title: string; items: string[]; numbered?: boolean }) {
  if (!items.length) return null;
  return (
    <Card mode="outlined">
      <Card.Content style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name={icon} size={26} />
          <Text variant="titleMedium">{title}</Text>
        </View>
        {items.map((s, i) => (
          <Text key={i} variant="bodyLarge">
            {numbered ? `${i + 1}. ` : '• '}
            {s}
          </Text>
        ))}
      </Card.Content>
    </Card>
  );
}
