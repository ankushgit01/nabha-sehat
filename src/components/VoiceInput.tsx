/**
 * Mic button. Uses the platform/voice interface only. When STT is unavailable
 * (offline without on-device model, no service, permission denied) it explains
 * why and the user continues with icons/text — never a dead end.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { HelperText } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../app-state/AppContext';
import { listen, ListenHandle, sttAvailability, SttAvailability } from '../platform/voice';
import { BigButton } from './ui';

export function VoiceInput({ onTranscript }: { onTranscript: (text: string, final: boolean) => void }) {
  const { lang, online } = useApp();
  const { t } = useTranslation();
  const [avail, setAvail] = useState<SttAvailability | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<ListenHandle | null>(null);

  useEffect(() => {
    void sttAvailability(lang, online).then(setAvail);
  }, [lang, online]);
  useEffect(() => () => handle.current?.stop(), []);

  const hint =
    error === 'permission_denied' || avail?.reason === 'no_module' || avail?.reason === 'no_service'
      ? t('check.sttUnavailable')
      : avail?.reason === 'needs_network' || error === 'network'
        ? t('check.sttOffline')
        : null;

  return (
    <View>
      <BigButton
        testID="voice-input"
        icon={listening ? 'microphone' : 'microphone-outline'}
        label={listening ? t('check.listening') : t('check.speak')}
        color={listening ? '#C62828' : undefined}
        textColor={listening ? '#fff' : undefined}
        disabled={!avail?.available}
        onPress={async () => {
          if (listening) {
            handle.current?.stop();
            setListening(false);
            return;
          }
          setError(null);
          setListening(true);
          handle.current = await listen(lang, online, {
            onPartial: (txt) => onTranscript(txt, false),
            onFinal: (txt) => {
              onTranscript(txt, true);
              setListening(false);
            },
            onError: (code) => {
              setError(code);
              setListening(false);
            },
          });
        }}
      />
      {hint && <HelperText type="info">{hint}</HelperText>}
    </View>
  );
}
