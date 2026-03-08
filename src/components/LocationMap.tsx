import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoPosition } from "@/hooks/useGeolocation";
import { SavedLocation } from "@/hooks/useSavedLocations";

// Fix default marker icons in Leaflet + Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const currentLocationIcon = new L.DivIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:hsl(221,83%,53%);border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.4);"></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const homeIcon = new L.DivIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:hsl(142,71%,45%);border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🏠</div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const frequentIcon = new L.DivIcon({
  html: `<div style="width:24px;height:24px;border-radius:50%;background:hsl(262,83%,58%);border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;">📍</div>`,
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Auto-pan to current location
const MapUpdater = ({ position }: { position: GeoPosition | null }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView([position.lat, position.lng], map.getZoom(), { animate: true });
    }
  }, [position, map]);
  return null;
};

interface LocationMapProps {
  position: GeoPosition | null;
  savedLocations: SavedLocation[];
  error?: string | null;
}

const LocationMap = ({ position, savedLocations, error }: LocationMapProps) => {
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : [12.9716, 77.5946]; // Default Bangalore

  if (error && !position) {
    return (
      <div className="flex items-center justify-center h-full bg-muted p-4">
        <p className="text-sm text-muted-foreground text-center">
          📍 Location unavailable: {error}
        </p>
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={15}
      className="w-full h-full z-0"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapUpdater position={position} />

      {/* Current location */}
      {position && (
        <>
          <Circle
            center={[position.lat, position.lng]}
            radius={position.accuracy || 20}
            pathOptions={{
              color: "hsl(221,83%,53%)",
              fillColor: "hsl(221,83%,53%)",
              fillOpacity: 0.15,
              weight: 1,
            }}
          />
          <Marker position={[position.lat, position.lng]} icon={currentLocationIcon}>
            <Popup>
              <strong>You are here</strong>
              <br />
              <span className="text-xs">
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </span>
            </Popup>
          </Marker>
        </>
      )}

      {/* Saved locations */}
      {savedLocations.map((loc) => (
        <Marker
          key={loc.id}
          position={[loc.lat, loc.lng]}
          icon={loc.type === "home" ? homeIcon : frequentIcon}
        >
          <Popup>
            <strong>{loc.name}</strong>
            {loc.type === "home" && " 🏠"}
            {loc.visits ? (
              <>
                <br />
                <span className="text-xs">{loc.visits} visits</span>
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default LocationMap;
