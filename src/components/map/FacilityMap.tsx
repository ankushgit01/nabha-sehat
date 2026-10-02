/**
 * The ONE map component features use. Map tiles are the only UI allowed to need
 * internet (spec §3) — offline we show an explicit placeholder; the facility list
 * below the map is always rendered from local data.
 */
import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app-state/AppContext';
import { Icon } from '../ui';
import Map from './Map';
import type { MapMarker } from './Map.types';

export function FacilityMap(props: { center: { latitude: number; longitude: number }; markers: MapMarker[]; onMarkerPress?: (id: string) => void }) {
  const { online } = useApp();
  const { t } = useTranslation();
  if (!online) {
    return (
      <View
        testID="map-offline"
        style={{ height: 160, borderRadius: 12, backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}
      >
        <Icon name="map-marker-off" size={40} color="#546E7A" />
        <Text style={{ textAlign: 'center', color: '#37474F' }}>{t('facilities.mapOffline')}</Text>
      </View>
    );
  }
  return <Map height={240} {...props} />;
}
