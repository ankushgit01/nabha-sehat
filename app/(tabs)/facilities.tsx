/**
 * Facility directory. List is ALWAYS from the local cache (seeded in-app, refreshed
 * on sync). Offline: the map shows an explicit "needs internet" placeholder and the
 * list + call buttons keep working.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../src/app-state/AppContext';
import { sortByDistance } from '../../src/features/facilities/nearest';
import { getBestEffortLocation, Fix } from '../../src/platform/location';
import { placeCall } from '../../src/platform/telephony';
import { FacilityMap } from '../../src/components/map/FacilityMap';
import { BigButton, Icon, OfflineBanner } from '../../src/components/ui';

const NABHA = { latitude: 30.3747, longitude: 76.15 };

export default function Facilities() {
  const { t } = useTranslation();
  const { facilities, lang } = useApp();
  const [here, setHere] = useState<Fix | null>(null);
  useEffect(() => {
    void getBestEffortLocation(6000).then((r) => setHere(r.fix));
  }, []);
  const list = sortByDistance(facilities, here);

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={list}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <BigButton icon="ambulance" label={t('sos.call108')} color="#B00020" textColor="#fff" onPress={() => void placeCall('108')} />
            <FacilityMap
              center={here ?? NABHA}
              markers={list.map((f) => ({ id: f.id, latitude: f.latitude, longitude: f.longitude, title: f.name_local[lang] ?? f.name }))}
            />
            {!here && <Text variant="bodySmall">{t('facilities.noLocation')}</Text>}
          </View>
        }
        renderItem={({ item: f }) => (
          <Card mode="outlined">
            <Card.Title
              title={f.name_local[lang] ?? f.name}
              titleNumberOfLines={2}
              subtitle={f.distanceKm != null ? t('facilities.km', { km: f.distanceKm.toFixed(1) }) : f.address}
              left={() => <Icon name="hospital-building" />}
            />
            <Card.Content style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {f.services.map((s) => (
                  <Chip key={s} compact>
                    {s.replace(/_/g, ' ')}
                  </Chip>
                ))}
              </View>
              {f.phone ? (
                <BigButton icon="phone" label={`${t('common.call')} ${f.phone}`} onPress={() => void placeCall(f.phone!)} />
              ) : (
                <Text variant="bodySmall" style={{ color: '#B00020' }}>
                  {t('facilities.unverified')}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}
      />
    </View>
  );
}
