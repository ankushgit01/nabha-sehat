/**
 * Phone-number + OTP login. Needs internet (the code comes from the server);
 * offline it explains that and the user can carry on without logging in.
 * In OTP_MODE=demo the server returns the code and it is shown on screen.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../app-state/AppContext';
import { normalisePhone } from '../features/profile/profile';
import { BigButton } from './ui';

export function PhoneLogin({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const { api, online, userId, signIn } = useApp();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    const e164 = normalisePhone(phone);
    if (!e164) return setErr(t('profile.invalidPhone'));
    setErr(null);
    setBusy(true);
    try {
      const r = await api.auth.requestOtp(e164);
      setSentTo(e164);
      setDemoCode(r.demoCode ?? null);
    } catch (e) {
      setErr(errorText(e) ?? t('profile.needsInternet'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sentTo) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await api.auth.verifyOtp(sentTo, code.trim(), userId);
      await signIn(r);
      onDone?.();
    } catch {
      setErr(t('profile.wrongCode'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        testID="login-phone"
        mode="outlined"
        label={t('profile.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={14}
        left={<TextInput.Affix text="+91" />}
        disabled={!!sentTo}
      />
      {!sentTo ? (
        <BigButton icon="message-lock" label={t('profile.sendOtp')} onPress={send} disabled={busy || !online} />
      ) : (
        <>
          <Text>{t('profile.otpSent', { phone: sentTo })}</Text>
          {demoCode && (
            <Text style={{ backgroundColor: '#FFF8E1', padding: 8, borderRadius: 8, color: '#333' }}>
              {t('profile.demoCode', { code: demoCode })}
            </Text>
          )}
          <TextInput
            testID="login-otp"
            mode="outlined"
            label={t('profile.enterOtp')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={8}
          />
          <BigButton icon="check-decagram" label={t('profile.verify')} onPress={verify} disabled={busy || code.length < 4} />
          <BigButton
            icon="pencil"
            label={t('common.edit')}
            color="transparent"
            onPress={() => {
              setSentTo(null);
              setCode('');
              setDemoCode(null);
            }}
          />
        </>
      )}
      {!online && <HelperText type="info">{t('profile.needsInternet')}</HelperText>}
      {err && <HelperText type="error">{err}</HelperText>}
    </View>
  );
}

function errorText(e: unknown): string | null {
  const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return typeof msg === 'string' ? msg : null;
}
