/**
 * Settings: language, text size, high contrast, emergency contacts, optional
 * phone/OTP registration (to back up records), sync status.
 * Offline: everything except "Send code"/"Verify" works; those show an error and
 * the app stays in local-only mode.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Divider, HelperText, List, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { LANGUAGES } from '../../src/i18n';
import { defaultEngine } from '../../src/features/triage/classifier';
import { BigButton, OfflineBanner, styles } from '../../src/components/ui';
import { PhoneLogin } from '../../src/components/PhoneLogin';
import { ProfileForm } from '../../src/components/ProfileForm';
import { buildMyRecordsCsv } from '../../src/features/records/exportRecords';
import { saveAndShareText } from '../../src/platform/share';
import { SYMPTOM_BY_ID } from '../../src/features/triage/vocab';

export default function More() {
  const { t } = useTranslation();
  const app = useApp();
  const [err, setErr] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');

  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen}>
        <Text variant="titleLarge">{t('settings.language')}</Text>
        <SegmentedButtons
          value={app.lang}
          onValueChange={(v) => void app.setLang(v as typeof app.lang)}
          buttons={LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName }))}
        />
        <Text variant="titleLarge">{t('settings.fontSize')}</Text>
        <SegmentedButtons
          value={String(app.fontScale)}
          onValueChange={(v) => void app.setFontScale(Number(v))}
          buttons={[
            { value: '1', label: 'A' },
            { value: '1.2', label: 'A+' },
            { value: '1.4', label: 'A++' },
          ]}
        />
        <List.Item
          title={t('settings.contrast')}
          left={(p) => <List.Icon {...p} icon="contrast-circle" />}
          right={() => <Switch value={app.highContrast} onValueChange={(v) => void app.setHighContrast(v)} />}
          style={{ minHeight: 56 }}
        />
        <Divider />

        <Text variant="titleLarge">{t('settings.contacts')}</Text>
        {app.contacts.map((c) => (
          <List.Item key={c.id} title={c.name} description={c.phone} left={(p) => <List.Icon {...p} icon="account-heart" />} />
        ))}
        <TextInput mode="outlined" label={t('onboarding.contactName')} value={cName} onChangeText={setCName} />
        <TextInput mode="outlined" label={t('onboarding.contactPhone')} value={cPhone} onChangeText={setCPhone} keyboardType="phone-pad" />
        <BigButton
          icon="account-plus"
          label={t('common.save')}
          disabled={cPhone.replace(/\D/g, '').length < 10}
          onPress={async () => {
            await app.saveContact({ name: cName || cPhone, phone: cPhone, relation: null });
            setCName('');
            setCPhone('');
          }}
        />
        <Divider />

        <Text variant="titleLarge">{t('settings.account')}</Text>
        {app.auth ? (
          <View style={{ gap: 8 }}>
            <Text>✅ {t('profile.loggedInAs', { phone: app.auth.phone })}</Text>
            <BigButton icon="logout" label={t('profile.logout')} color="transparent" onPress={() => void app.signOut()} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text>{t('settings.anonymous')}</Text>
            <Text variant="bodySmall">{t('settings.register')}</Text>
            <PhoneLogin />
          </View>
        )}
        <List.Accordion title={t('profile.edit')} left={(p) => <List.Icon {...p} icon="account-edit" />}>
          <ProfileForm />
        </List.Accordion>
        <BigButton
          testID="export-csv"
          icon="file-delimited"
          label={t('records.exportCsv')}
          onPress={async () => {
            try {
              const { csv, count } = await buildMyRecordsCsv(app.store, { profile: app.profile, phone: app.auth?.phone ?? null }, (id) => SYMPTOM_BY_ID.get(id)?.label[app.lang] ?? id);
              await saveAndShareText(`nabha_my_records_${new Date().toISOString().slice(0, 10)}.csv`, csv);
              setErr(t('records.exported', { count }));
            } catch {
              setErr(t('records.exportFailed'));
            }
          }}
        />
        {err && <HelperText type="info">{err}</HelperText>}
        {app.auth && (
          <BigButton icon="cloud-sync" label={t('settings.syncNow')} disabled={!app.online || app.syncing} onPress={() => void app.syncNow()} />
        )}
        {app.lastSync && (
          <Text variant="bodySmall">
            ↑{app.lastSync.pushed} ↓{app.lastSync.pulled} {app.lastSync.error ? `· ${app.lastSync.error}` : ''}
          </Text>
        )}
        <Divider />
        <List.Item title={t('settings.encryption')} description={app.store.encrypted ? t('settings.encOn') : t('settings.encOff')} left={(p) => <List.Icon {...p} icon="lock" />} />
        <List.Item title={t('settings.modelInfo')} description={defaultEngine().version} left={(p) => <List.Icon {...p} icon="brain" />} />
      </ScrollView>
    </>
  );
}
