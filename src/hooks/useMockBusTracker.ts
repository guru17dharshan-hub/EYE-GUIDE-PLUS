import { useState, useEffect, useRef, useCallback } from "react";

export interface MockBus {
  id: string;
  routeNumber: string;
  destination: string;
  distanceMeters: number;
  etaMinutes: number;
  status: "approaching" | "arriving" | "departed";
}

const BUS_ROUTES: Omit<MockBus, "distanceMeters" | "etaMinutes" | "status">[] = [
  { id: "bus-1", routeNumber: "42A", destination: "Central Station" },
  { id: "bus-2", routeNumber: "15B", destination: "City Hospital" },
  { id: "bus-3", routeNumber: "7C", destination: "University Campus" },
  { id: "bus-4", routeNumber: "23", destination: "Airport Terminal" },
];

const randomBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const useMockBusTracker = (active: boolean) => {
  const [buses, setBuses] = useState<MockBus[]>([]);
  const tickRef = useRef(0);

  const generateBuses = useCallback((): MockBus[] => {
    const count = randomBetween(1, 3);
    const shuffled = [...BUS_ROUTES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((route) => {
      const distance = randomBetween(50, 800);
      const eta = Math.max(1, Math.round(distance / 120));
      return {
        ...route,
        distanceMeters: distance,
        etaMinutes: eta,
        status: distance < 100 ? "arriving" : "approaching",
      };
    });
  }, []);

  useEffect(() => {
    if (!active) {
      setBuses([]);
      tickRef.current = 0;
      return;
    }

    // Initial data
    setBuses(generateBuses());

    const interval = setInterval(() => {
      tickRef.current += 1;

      setBuses((prev) => {
        // Move existing buses closer
        const updated = prev
          .map((bus) => {
            const newDist = Math.max(0, bus.distanceMeters - randomBetween(30, 100));
            const newEta = Math.max(0, Math.round(newDist / 120));
            const status: MockBus["status"] =
              newDist === 0 ? "departed" : newDist < 100 ? "arriving" : "approaching";
            return { ...bus, distanceMeters: newDist, etaMinutes: newEta, status };
          })
          .filter((b) => b.status !== "departed");

        // Every 3rd tick, maybe add a new bus
        if (tickRef.current % 3 === 0 && updated.length < 3) {
          const existing = new Set(updated.map((b) => b.id));
          const available = BUS_ROUTES.filter((r) => !existing.has(r.id));
          if (available.length > 0) {
            const route = available[Math.floor(Math.random() * available.length)];
            const distance = randomBetween(400, 800);
            updated.push({
              ...route,
              distanceMeters: distance,
              etaMinutes: Math.round(distance / 120),
              status: "approaching",
            });
          }
        }

        return updated;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [active, generateBuses]);

  return { buses };
};
