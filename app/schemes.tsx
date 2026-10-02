/**
 * Ayushman Bharat / state scheme eligibility. Yes/No icon questions, each readable aloud.
 * Online: live API (6 s timeout). Offline or API failure: bundled rules, clearly
 * labelled "based on general rules — confirm online when possible".
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../src/app-state/AppContext';
import { Answers, BUNDLED_RULES, checkEligibility, EligibilityOutcome } from '../src/features/schemes/eligibility';
import { BigButton, Icon, OfflineBanner, SpeakButton, styles } from '../src/components/ui';

export default function Schemes() {
  const { t } = useTranslation();
  const { lang, online, api, auth } = useApp();
  const [answers, setAnswers] = useState<Answers>({});
  const [out, setOut] = useState<EligibilityOutcome | null>(null);

  return (
    <>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.screen}>
        <Text variant="bodyLarge">{t('schemes.intro')}</Text>
        {BUNDLED_RULES.questions.map((q) => (
          <Card key={q.id} mode="outlined">
            <Card.Content style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Icon name={q.icon} />
                <Text variant="titleMedium" style={{ flex: 1 }}>
                  {q.text[lang]}
                </Text>
                <SpeakButton text={q.text[lang]} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {[true, false].map((v) => (
                  <Chip
                    key={String(v)}
                    icon={v ? 'check-bold' : 'close-thick'}
                    selected={answers[q.id] === v}
                    onPress={() => setAnswers({ ...answers, [q.id]: v })}
                    style={{ minHeight: 48, flex: 1, justifyContent: 'center' }}
                  >
                    {v ? t('common.yes') : t('common.no')}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>
        ))}
        <BigButton
          icon="magnify-scan"
          label={t('schemes.check')}
          onPress={async () => setOut(await checkEligibility(answers, online && auth ? api.schemes.check : null))}
        />
        {out && (
          <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
            <Chip icon={out.source === 'live' ? 'cloud-check' : 'cellphone'}>
              {out.source === 'live' ? t('schemes.liveLabel') : t('schemes.offlineLabel')}
            </Chip>
            {out.results.map((r) => (
              <Card key={r.schemeId} mode="contained" style={{ backgroundColor: r.likelyEligible ? '#E8F5E9' : '#FFF3E0' }}>
                <Card.Title
                  title={r.name[lang]}
                  titleNumberOfLines={2}
                  subtitle={r.likelyEligible ? t('schemes.likely') : t('schemes.unlikely')}
                  left={() => <Icon name={r.likelyEligible ? 'check-circle' : 'help-circle'} color={r.likelyEligible ? '#2E7D32' : '#E65100'} />}
                  right={() => <SpeakButton text={`${r.name[lang]}. ${r.likelyEligible ? t('schemes.likely') : t('schemes.unlikely')}. ${r.nextSteps[lang]}`} />}
                />
                <Card.Content style={{ gap: 6 }}>
                  <Text>{r.benefit[lang]}</Text>
                  {r.notes.map((n, i) => (
                    <Text key={i}>• {n[lang]}</Text>
                  ))}
                  <Text variant="titleSmall">{t('schemes.nextSteps')}</Text>
                  <Text>{r.nextSteps[lang]}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
