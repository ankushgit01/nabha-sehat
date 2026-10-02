/**
 * Native map — react-native-maps (Google Maps on Android needs an API key via the
 * config plugin: `["react-native-maps", { "androidGoogleMapsApiKey": "..." }]`; set
 * it from an EAS secret). Requires the custom dev client, not Expo Go.
 */
import React from 'react';
import MapView, { Marker } from 'react-native-maps';
import type { MapProps } from './Map.types';

export default function Map({ center, markers, height, onMarkerPress }: MapProps) {
  return (
    <MapView
      style={{ height, borderRadius: 12 }}
      initialRegion={{ ...center, latitudeDelta: 0.25, longitudeDelta: 0.25 }}
      showsUserLocation
      accessibilityLabel="Map of nearby hospitals"
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          title={m.title}
          description={m.description}
          onPress={() => onMarkerPress?.(m.id)}
        />
      ))}
    </MapView>
  );
}
