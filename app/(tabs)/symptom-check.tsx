/**
 * Symptom intake: voice, text and body-part/symptom icons all feed the same list of
 * symptom ids, then the on-device classifier runs.
 * Offline: icons + text + classification work fully. Voice works only where the OS
 * has an on-device model for the language; otherwise the mic explains why and the
 * other two inputs remain (no dead end).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Chip, SegmentedButtons, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { BODY_PARTS, SYMPTOMS, SYMPTOM_BY_ID } from '../../src/features/triage/vocab';
import { symptomIdsFromText } from '../../src/features/triage/textToSymptoms';
import { runTriage } from '../../src/features/triage/triageService';
import { speak } from '../../src/platform/voice';
import { VoiceInput } from '../../src/components/VoiceInput';
import { BigButton, Disclaimer, Icon, OfflineBanner, SpeakButton, styles } from '../../src/components/ui';
import type { TriageModifiers } from '../../src/db/types';

const DURATIONS = [1, 3, 7, 14, 30];

export default function SymptomCheck() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { lang, repo } = useApp();
  const [text, setText] = useState('');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [part, setPart] = useState<string | null>(null);
  const [mods, setMods] = useState<TriageModifiers>({ age_group: 'adult', pregnant: false, duration_days: 1 });
  const [busy, setBusy] = useState(false);

  const fromText = useMemo(() => symptomIdsFromText(`${text} ${transcript ?? ''}`), [text, transcript]);
  const selected = useMemo(
    () => [...new Set([...picked, ...fromText])].filter((s) => !removed.has(s) || picked.has(s)),
    [picked, fromText, removed],
  );

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) {
      next.delete(id);
      setRemoved(new Set(removed).add(id));
    } else {
      next.add(id);
      const r = new Set(removed);
      r.delete(id);
      setRemoved(r);
    }
    setPicked(next);
  };

  const submit = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const { log } = await runTriage(repo, {
        symptoms: selected,
        modifiers: mods,
        text: text || null,
        transcript,
        lang,
      });
      router.push({ pathname: '/triage-result/[id]', params: { id: log.id } });
      setPicked(new Set());
      setText('');
      setTranscript(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="headlineSmall" style={{ flex: 1 }} accessibilityRole="header">
            {t('check.title')}
          </Text>
          <SpeakButton text={`${t('check.title')} ${t('check.pickIcons')}`} />
        </View>

        <VoiceInput onTranscript={(txt) => setTranscript(txt)} />
        {transcript ? <Text variant="bodyLarge">“{transcript}”</Text> : null}
        <TextInput
          mode="outlined"
          label={t('check.type')}
          placeholder={t('check.typePlaceholder')}
          value={text}
          onChangeText={setText}
          multiline
          left={<TextInput.Icon icon="keyboard-outline" />}
        />

        {(text || transcript) && (
          <Text variant="bodyMedium">{fromText.length ? t('check.detected') : t('check.noneDetected')}</Text>
        )}
        {selected.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selected.map((id) => (
              <Chip key={id} icon={SYMPTOM_BY_ID.get(id)?.icon} onClose={() => toggle(id)} style={{ minHeight: 44 }}>
                {SYMPTOM_BY_ID.get(id)?.label[lang] ?? id}
              </Chip>
            ))}
          </View>
        )}

        <Text variant="titleMedium">{t('check.pickIcons')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BODY_PARTS.map((b) => (
            <Tile key={b.id} icon={b.icon} label={b.label[lang]} active={part === b.id} onPress={() => setPart(part === b.id ? null : b.id)} />
          ))}
        </View>
        {part && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SYMPTOMS.filter((s) => s.bodyPart === part).map((s) => (
              <Tile
                key={s.id}
                testID={`sym-${s.id}`}
                icon={s.icon}
                label={s.label[lang]}
                active={selected.includes(s.id)}
                danger={s.redFlag}
                onPress={() => toggle(s.id)}
              />
            ))}
          </View>
        )}

        <Text variant="titleMedium">{t('check.who')}</Text>
        <SegmentedButtons
          value={mods.age_group}
          onValueChange={(v) => setMods({ ...mods, age_group: v as TriageModifiers['age_group'], pregnant: v === 'adult' && mods.pregnant })}
          buttons={[
            { value: 'child', label: t('check.child'), icon: 'baby-face-outline' },
            { value: 'adult', label: t('check.adult'), icon: 'account' },
            { value: 'elderly', label: t('check.elderly'), icon: 'human-cane' },
          ]}
        />
        {mods.age_group === 'adult' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <Icon name="human-pregnant" />
            <Text variant="titleMedium" style={{ flex: 1 }}>
              {t('check.pregnant')}
            </Text>
            <Switch value={mods.pregnant} onValueChange={(v) => setMods({ ...mods, pregnant: v })} accessibilityLabel={t('check.pregnant')} />
          </View>
        )}
        <Text variant="titleMedium">{t('check.howLong')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DURATIONS.map((d) => (
            <Chip key={d} selected={mods.duration_days === d} onPress={() => setMods({ ...mods, duration_days: d })} style={{ minHeight: 44 }}>
              {d === 30 ? '30+' : t('check.days', { count: d })}
            </Chip>
          ))}
        </View>

        <BigButton
          testID="check-now"
          icon="arrow-right-bold-circle"
          label={`${t('check.checkNow')}${selected.length ? ` (${t('check.selected', { count: selected.length })})` : ''}`}
          color={theme.colors.primary}
          textColor={theme.colors.onPrimary}
          disabled={!selected.length || busy}
          onPress={submit}
          height={80}
        />
        <Disclaimer />
      </ScrollView>
    </>
  );
}

function Tile(p: { icon: string; label: string; active: boolean; danger?: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  const { lang } = useApp();
  return (
    <Pressable
      testID={p.testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: p.active }}
      accessibilityLabel={p.label}
      onPress={p.onPress}
      onLongPress={() => speak(p.label, lang)}
      style={{
        width: 104,
        minHeight: 104,
        borderRadius: 16,
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: p.active ? 3 : 1,
        borderColor: p.active ? theme.colors.primary : p.danger ? '#B00020' : theme.colors.outline,
        backgroundColor: p.active ? theme.colors.primaryContainer : theme.colors.surface,
      }}
    >
      <Icon name={p.icon} size={40} color={p.danger ? '#B00020' : undefined} />
      <Text variant="labelLarge" style={{ textAlign: 'center' }} numberOfLines={3}>
        {p.label}
      </Text>
    </Pressable>
  );
}
