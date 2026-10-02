export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
}
export interface MapProps {
  center: { latitude: number; longitude: number };
  markers: MapMarker[];
  height: number;
  onMarkerPress?: (id: string) => void;
}
