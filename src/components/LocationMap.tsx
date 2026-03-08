import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoPosition } from "@/hooks/useGeolocation";
import { SavedLocation } from "@/hooks/useSavedLocations";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LocationMapProps {
  position: GeoPosition | null;
  savedLocations: SavedLocation[];
  error?: string | null;
}

const LocationMap = ({ position, savedLocations, error }: LocationMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = position
      ? [position.lat, position.lng]
      : [12.9716, 77.5946];

    const map = L.map(containerRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update user position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    map.setView([position.lat, position.lng], map.getZoom(), { animate: true });

    // Accuracy circle
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng([position.lat, position.lng]);
      accuracyCircleRef.current.setRadius(position.accuracy || 20);
    } else {
      accuracyCircleRef.current = L.circle([position.lat, position.lng], {
        radius: position.accuracy || 20,
        color: "hsl(221,83%,53%)",
        fillColor: "hsl(221,83%,53%)",
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(map);
    }

    // User marker (blue dot)
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([position.lat, position.lng]);
    } else {
      userMarkerRef.current = L.circleMarker([position.lat, position.lng], {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "hsl(221,83%,53%)",
        fillOpacity: 1,
      })
        .bindPopup(`<strong>You are here</strong><br/>${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`)
        .addTo(map);
    }
  }, [position]);

  // Update saved location markers
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    savedLocations.forEach((loc) => {
      const isHome = loc.type === "home";
      const icon = L.divIcon({
        html: `<div style="width:${isHome ? 28 : 24}px;height:${isHome ? 28 : 24}px;border-radius:50%;background:${isHome ? "hsl(142,71%,45%)" : "hsl(262,83%,58%)"};border:${isHome ? 3 : 2}px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:${isHome ? 14 : 12}px;">${isHome ? "🏠" : "📍"}</div>`,
        className: "",
        iconSize: [isHome ? 28 : 24, isHome ? 28 : 24],
        iconAnchor: [isHome ? 14 : 12, isHome ? 14 : 12],
      });

      L.marker([loc.lat, loc.lng], { icon })
        .bindPopup(`<strong>${loc.name}</strong>${isHome ? " 🏠" : ""}${loc.visits ? `<br/><span style="font-size:12px">${loc.visits} visits</span>` : ""}`)
        .addTo(group);
    });
  }, [savedLocations]);

  if (error && !position) {
    return (
      <div className="flex items-center justify-center h-full bg-muted p-4">
        <p className="text-sm text-muted-foreground text-center">
          📍 Location unavailable: {error}
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
};

export default LocationMap;
