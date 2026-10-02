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

export default function More() {
  const { t } = useTranslation();
  const app = useApp();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
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
          <Text>{t('settings.registered', { phone: app.auth.phone })}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            <Text>{t('settings.anonymous')}</Text>
            <Text variant="bodySmall">{t('settings.register')}</Text>
            <TextInput mode="outlined" label={t('settings.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" left={<TextInput.Affix text="+91" />} />
            {!otpSent ? (
              <BigButton
                icon="message-lock"
                label={t('settings.sendOtp')}
                disabled={!app.online || phone.replace(/\D/g, '').length !== 10}
                onPress={async () => {
                  setErr(null);
                  try {
                    await app.api.auth.requestOtp(`+91${phone.replace(/\D/g, '')}`);
                    setOtpSent(true);
                  } catch (e) {
                    setErr(String(e));
                  }
                }}
              />
            ) : (
              <>
                <TextInput mode="outlined" label={t('settings.otp')} value={code} onChangeText={setCode} keyboardType="number-pad" />
                <BigButton
                  icon="check-decagram"
                  label={t('settings.verify')}
                  onPress={async () => {
                    setErr(null);
                    try {
                      const a = await app.api.auth.verifyOtp(`+91${phone.replace(/\D/g, '')}`, code, app.userId);
                      await app.signIn(a);
                    } catch (e) {
                      setErr(String(e));
                    }
                  }}
                />
              </>
            )}
            {!app.online && <HelperText type="info">{t('net.offline')}</HelperText>}
            {err && <HelperText type="error">{err}</HelperText>}
          </View>
        )}
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
