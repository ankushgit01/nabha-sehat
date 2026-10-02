/**
 * SOS. ZERO network dependency anywhere on this screen:
 *  - the SOS log is written to local storage first (append-only)
 *  - GPS needs no data connection
 *  - SMS + call are handed to the phone's own telephony
 *  - first-aid content is bundled in the app
 * A 5-second cancellable countdown guards against accidental taps; the call/SMS
 * buttons below are always available for an immediate manual action.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../src/app-state/AppContext';
import { startSos, planContacts } from '../src/features/sos/sosService';
import { emergencyFacilityNumber } from '../src/features/facilities/nearest';
import { getBestEffortLocation } from '../src/platform/location';
import { mapsLink, placeCall, sendSms } from '../src/platform/telephony';
import { FirstAidCard } from '../src/components/FirstAidCard';
import { BigButton, Icon, ReviewBanner, styles } from '../src/components/ui';
import { SYMPTOM_BY_ID } from '../src/features/triage/vocab';
import type { SosEvent } from '../src/db/types';

const COUNTDOWN = 5;

export default function Sos() {
  const { symptom } = useLocalSearchParams<{ symptom?: string }>();
  const { t } = useTranslation();
  const { repo, contacts, facilities, lang } = useApp();
  const [left, setLeft] = useState(COUNTDOWN);
  const [cancelled, setCancelled] = useState(false);
  const [ev, setEv] = useState<SosEvent | null>(null);
  const [stage, setStage] = useState<'countdown' | 'locating' | 'done'>('countdown');
  const started = useRef(false);

  const facilityNumber = emergencyFacilityNumber(facilities, null);
  const plan = planContacts(contacts, facilityNumber);
  const symptomLabel = symptom ? SYMPTOM_BY_ID.get(symptom)?.label[lang] ?? null : null;
  const topic = (symptom && SYMPTOM_BY_ID.get(symptom)?.firstAid) || 'general_emergency';

  const go = async (skip?: { sms?: boolean; call?: boolean }) => {
    if (started.current) return;
    started.current = true;
    setStage('locating');
    await startSos(
      {
        repo,
        getLocation: getBestEffortLocation,
        sendSms,
        placeCall,
        mapsLink,
        message: ({ symptom: s, link }) =>
          link
            ? t('sos.smsBody', { symptom: s ? `(${s})` : '', link })
            : t('sos.smsBodyNoLoc', { symptom: s ? `(${s})` : '' }),
      },
      { plan, reportedSymptom: symptomLabel, skipSms: skip?.sms, skipCall: skip?.call },
      (p) => setEv(p.event),
    );
    setStage('done');
  };

  useEffect(() => {
    if (cancelled || stage !== 'countdown') return;
    if (left <= 0) {
      void go();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, cancelled, stage]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {stage === 'countdown' && !cancelled && (
        <View style={{ backgroundColor: '#B00020', borderRadius: 20, padding: 20, gap: 12 }}>
          <Text variant="headlineMedium" style={{ color: '#fff', textAlign: 'center' }} accessibilityLiveRegion="assertive">
            {t('sos.countdown', { s: left })}
          </Text>
          <ProgressBar progress={(COUNTDOWN - left) / COUNTDOWN} color="#fff" />
          {!contacts.length && <Text style={{ color: '#fff' }}>{t('sos.noContact')}</Text>}
          <BigButton icon="phone" label={t('sos.callNow')} color="#fff" textColor="#B00020" onPress={() => void go()} testID="sos-call-now" />
          <BigButton icon="close" label={t('common.cancel')} color="#7F0000" textColor="#fff" onPress={() => setCancelled(true)} testID="sos-cancel" />
        </View>
      )}

      {stage !== 'countdown' && (
        <View style={{ gap: 6 }}>
          {stage === 'locating' && !ev?.latitude && <Text>{t('sos.sending')}</Text>}
          {ev && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name={ev.latitude != null ? 'crosshairs-gps' : 'crosshairs-off'} />
              <Text style={{ flex: 1 }}>{ev.latitude != null ? t('sos.locOk') : ev.location_error ? t('sos.locFail') : t('sos.sending')}</Text>
            </View>
          )}
          {ev && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="shield-check" color="#2E7D32" />
              <Text style={{ flex: 1 }}>{t('sos.logged')}</Text>
            </View>
          )}
        </View>
      )}

      {/* Always-available manual actions */}
      <BigButton icon="ambulance" label={t('sos.call108')} color="#B00020" textColor="#fff" onPress={() => void placeCall('108')} />
      {contacts[0] && (
        <BigButton icon="phone" label={t('sos.callContact', { name: contacts[0].name })} onPress={() => void placeCall(contacts[0]!.phone)} />
      )}
      {(cancelled || stage === 'done') && (
        <BigButton
          icon="message-alert"
          label={t('sos.sendSms')}
          onPress={() => {
            started.current = false;
            void go({ call: true });
          }}
        />
      )}

      <ReviewBanner />
      <Text variant="titleLarge">{t('sos.firstAidBelow')}</Text>
      <FirstAidCard topic={topic} />
      <BigButton icon="medical-bag" label={t('home.firstAid')} onPress={() => router.push('/first-aid')} />
    </ScrollView>
  );
}
