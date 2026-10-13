/**
 * Patient details: name, age, gender, village, blood group, long-term illness, allergies.
 * Icon + text chips (big targets) instead of dropdowns; every field optional.
 * Saved on the phone first; synced to the server when logged in + online.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Chip, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../app-state/AppContext';
import { BLOOD_GROUPS, CONDITIONS, EMPTY_PROFILE, Gender, Profile, validateProfile } from '../features/profile/profile';
import { BigButton } from './ui';

const GENDERS: { id: Gender; icon: string }[] = [
  { id: 'male', icon: 'face-man' },
  { id: 'female', icon: 'face-woman' },
  { id: 'other', icon: 'account' },
];

export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const { profile, saveProfile } = useApp();
  const [p, setP] = useState<Profile>(profile ?? EMPTY_PROFILE);
  const [ageText, setAgeText] = useState(p.age != null ? String(p.age) : '');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleCondition = (c: string) => {
    let next = p.conditions.includes(c) ? p.conditions.filter((x) => x !== c) : [...p.conditions, c];
    if (c === 'none') next = next.includes('none') ? ['none'] : [];
    else next = next.filter((x) => x !== 'none');
    setP({ ...p, conditions: next });
  };

  const save = async () => {
    const age = ageText.trim() === '' ? null : Number(ageText);
    const candidate: Profile = {
      ...p,
      age: Number.isFinite(age) ? (age as number) : null,
      name: p.name?.trim() || null,
      village: p.village?.trim() || null,
      allergies: p.allergies?.trim() || null,
      // Pregnancy only makes sense for women; avoid wrong triage defaults.
      conditions: p.gender === 'female' ? p.conditions : p.conditions.filter((c) => c !== 'pregnant'),
    };
    const errors = validateProfile(candidate);
    if (errors.age) return setErr(t('profile.invalidAge'));
    setErr(null);
    await saveProfile(candidate);
    setSaved(true);
    onSaved?.();
  };

  return (
    <View style={{ gap: 12 }}>
      <TextInput mode="outlined" label={t('profile.name')} value={p.name ?? ''} onChangeText={(v) => setP({ ...p, name: v })} left={<TextInput.Icon icon="account" />} />
      <TextInput
        mode="outlined"
        label={t('profile.age')}
        value={ageText}
        onChangeText={(v) => setAgeText(v.replace(/\D/g, '').slice(0, 3))}
        keyboardType="number-pad"
        left={<TextInput.Icon icon="cake-variant" />}
      />

      <Text variant="titleMedium">{t('profile.gender')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {GENDERS.map((g) => (
          <Chip key={g.id} icon={g.icon} selected={p.gender === g.id} onPress={() => setP({ ...p, gender: g.id })} style={{ minHeight: 48, justifyContent: 'center' }}>
            {t(`profile.${g.id}`)}
          </Chip>
        ))}
      </View>

      <TextInput mode="outlined" label={t('profile.village')} value={p.village ?? ''} onChangeText={(v) => setP({ ...p, village: v })} left={<TextInput.Icon icon="home-group" />} />

      <Text variant="titleMedium">{t('profile.bloodGroup')}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {BLOOD_GROUPS.map((b) => (
          <Chip key={b} selected={p.blood_group === b} onPress={() => setP({ ...p, blood_group: p.blood_group === b ? null : b })} style={{ minHeight: 44 }}>
            {b}
          </Chip>
        ))}
      </View>

      <Text variant="titleMedium">{t('profile.conditions')}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {CONDITIONS.filter((c) => c !== 'pregnant' || p.gender === 'female').map((c) => (
          <Chip key={c} selected={p.conditions.includes(c)} onPress={() => toggleCondition(c)} style={{ minHeight: 44 }}>
            {t(`profile.cond_${c}`)}
          </Chip>
        ))}
      </View>

      <TextInput mode="outlined" label={t('profile.allergies')} value={p.allergies ?? ''} onChangeText={(v) => setP({ ...p, allergies: v })} left={<TextInput.Icon icon="pill" />} />

      {err && <HelperText type="error">{err}</HelperText>}
      <BigButton testID="profile-save" icon="content-save" label={saved ? t('profile.saved') : t('profile.save')} onPress={save} />
    </View>
  );
}
