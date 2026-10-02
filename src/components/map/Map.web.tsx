/** Web map — Leaflet + OpenStreetMap tiles (react-native-maps has no web support). */
import React, { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import type { MapProps } from './Map.types';

// Leaflet's default marker images don't resolve under Metro; use a CSS-only marker.
const icon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:11px;background:#00695C;border:3px solid #fff;box-shadow:0 0 3px #000"></div>',
  iconSize: [22, 22],
});

export default function Map({ center, markers, height, onMarkerPress }: MapProps) {
  useEffect(() => {
    const id = 'leaflet-css';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);
  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={11} style={{ height: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {markers.map((m) => (
          <Marker key={m.id} position={[m.latitude, m.longitude]} icon={icon} eventHandlers={{ click: () => onMarkerPress?.(m.id) }}>
            <Popup>
              <b>{m.title}</b>
              <br />
              {m.description}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
