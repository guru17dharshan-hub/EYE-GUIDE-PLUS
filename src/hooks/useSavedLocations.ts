import { useState, useEffect, useCallback } from "react";

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "home" | "frequent" | "custom";
  visits?: number;
}

const STORAGE_KEY = "eyeguide-saved-locations";

const MOCK_LOCATIONS: SavedLocation[] = [
  { id: "mock-1", name: "Home", lat: 12.9716, lng: 77.5946, type: "home", visits: 120 },
  { id: "mock-2", name: "Office", lat: 12.9352, lng: 77.6245, type: "frequent", visits: 85 },
  { id: "mock-3", name: "Hospital", lat: 12.9611, lng: 77.5993, type: "frequent", visits: 12 },
  { id: "mock-4", name: "Bus Station", lat: 12.9771, lng: 77.5721, type: "frequent", visits: 45 },
  { id: "mock-5", name: "Market", lat: 12.9660, lng: 77.5870, type: "frequent", visits: 30 },
];

export const useSavedLocations = () => {
  const [locations, setLocations] = useState<SavedLocation[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setLocations(JSON.parse(stored));
      } else {
        // Load mock data on first use
        setLocations(MOCK_LOCATIONS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_LOCATIONS));
      }
    } catch {
      setLocations(MOCK_LOCATIONS);
    }
  }, []);

  const save = useCallback((updated: SavedLocation[]) => {
    setLocations(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const setHome = useCallback(
    (lat: number, lng: number) => {
      const updated = locations.filter((l) => l.type !== "home");
      updated.unshift({
        id: crypto.randomUUID(),
        name: "Home",
        lat,
        lng,
        type: "home",
        visits: 0,
      });
      save(updated);
    },
    [locations, save]
  );

  const addLocation = useCallback(
    (name: string, lat: number, lng: number, type: "frequent" | "custom" = "custom") => {
      const loc: SavedLocation = {
        id: crypto.randomUUID(),
        name: name.trim(),
        lat,
        lng,
        type,
        visits: 0,
      };
      save([...locations, loc]);
      return loc;
    },
    [locations, save]
  );

  const removeLocation = useCallback(
    (id: string) => {
      save(locations.filter((l) => l.id !== id));
    },
    [locations, save]
  );

  const getHome = useCallback(() => {
    return locations.find((l) => l.type === "home") || null;
  }, [locations]);

  const getFrequent = useCallback(() => {
    return locations
      .filter((l) => l.type === "frequent" || l.type === "custom")
      .sort((a, b) => (b.visits || 0) - (a.visits || 0));
  }, [locations]);

  return { locations, setHome, addLocation, removeLocation, getHome, getFrequent };
};
