import { MockBus } from "@/hooks/useMockBusTracker";
import { Bus, MapPin, Clock } from "lucide-react";

interface BusTrackerProps {
  buses: MockBus[];
}

const BusTracker = ({ buses }: BusTrackerProps) => {
  if (buses.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
        <Bus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>No buses nearby. Scanning…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Nearby buses">
      {buses.map((bus) => (
        <div
          key={bus.id}
          role="listitem"
          className={`flex items-center gap-3 rounded-xl p-3 border transition-colors ${
            bus.status === "arriving"
              ? "bg-primary/15 border-primary/40"
              : "bg-card border-border"
          }`}
          aria-label={`Bus ${bus.routeNumber} to ${bus.destination}, ${bus.distanceMeters} meters away, arriving in ${bus.etaMinutes} minutes`}
        >
          <div
            className={`flex items-center justify-center h-10 w-10 rounded-lg font-black text-sm ${
              bus.status === "arriving"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
            aria-hidden="true"
          >
            {bus.routeNumber}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              → {bus.destination}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {bus.distanceMeters}m
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {bus.etaMinutes} min
              </span>
            </div>
          </div>

          {bus.status === "arriving" && (
            <span className="text-xs font-bold text-primary animate-pulse">
              ARRIVING
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default BusTracker;
