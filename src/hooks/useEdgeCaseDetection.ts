import { useState, useEffect, useCallback, useRef } from "react";

interface EdgeCaseState {
  cameraObstructed: boolean;
  lowBattery: boolean;
  batteryLevel: number | null;
  powerSaving: boolean;
  missedStop: boolean;
  missedStopName: string | null;
}

/**
 * Detects edge-case scenarios:
 * 1. Camera obstruction (consecutive dark/blank frames)
 * 2. Low battery → power-saving mode
 * 3. Missed destination stop
 * 4. Unreadable bus number (handled in processDetection via GPS cross-check)
 */
export const useEdgeCaseDetection = (
  speakFn: (msg: string, priority?: "normal" | "high") => void,
  hapticEnabled: boolean
) => {
  const [state, setState] = useState<EdgeCaseState>({
    cameraObstructed: false,
    lowBattery: false,
    batteryLevel: null,
    powerSaving: false,
    missedStop: false,
    missedStopName: null,
  });

  const darkFrameCountRef = useRef(0);
  const lastObstructionAlertRef = useRef(0);
  const missedStopAlertedRef = useRef(false);

  // ── Battery monitoring ──
  useEffect(() => {
    let battery: any = null;

    const handleLevelChange = () => {
      if (!battery) return;
      const level = Math.round(battery.level * 100);
      setState((prev) => ({ ...prev, batteryLevel: level }));

      if (level <= 15 && !state.powerSaving) {
        setState((prev) => ({ ...prev, lowBattery: true, powerSaving: true }));
        speakFn(
          "Low battery. Switching to power-saving mode. Emergency features still active.",
          "high"
        );
        if (hapticEnabled && navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } else if (level > 20 && state.powerSaving) {
        setState((prev) => ({ ...prev, lowBattery: false, powerSaving: false }));
        speakFn("Battery recovered. Resuming normal operation.");
      }
    };

    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        battery = b;
        handleLevelChange();
        battery.addEventListener("levelchange", handleLevelChange);
      }).catch(() => {});
    }

    return () => {
      if (battery) battery.removeEventListener("levelchange", handleLevelChange);
    };
  }, [speakFn, hapticEnabled, state.powerSaving]);

  // ── Camera obstruction detection ──
  const checkFrameBrightness = useCallback(
    (frameDataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64; // sample small
        canvas.height = 48;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 64, 48);
        const data = ctx.getImageData(0, 0, 64, 48).data;

        let totalBrightness = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / pixelCount;

        if (avgBrightness < 15) {
          darkFrameCountRef.current += 1;
        } else {
          darkFrameCountRef.current = 0;
          if (state.cameraObstructed) {
            setState((prev) => ({ ...prev, cameraObstructed: false }));
          }
        }

        // Alert after 3 consecutive dark frames, max once every 30s
        if (darkFrameCountRef.current >= 3) {
          const now = Date.now();
          if (now - lastObstructionAlertRef.current > 30000) {
            lastObstructionAlertRef.current = now;
            setState((prev) => ({ ...prev, cameraObstructed: true }));
            speakFn(
              "Camera obstructed. Hold phone outward or clip it to your chest.",
              "high"
            );
            if (hapticEnabled && navigator.vibrate) navigator.vibrate([300, 100, 300]);
          }
        }
      };
      img.src = frameDataUrl;
    },
    [speakFn, hapticEnabled, state.cameraObstructed]
  );

  // ── Missed stop detection ──
  const checkMissedStop = useCallback(
    (destinationStop: string | null, currentStop: string | null, isApproaching: boolean) => {
      if (!destinationStop || !currentStop || missedStopAlertedRef.current) return;

      // If we were approaching and now the current stop changed past our destination
      if (
        isApproaching === false &&
        currentStop.toLowerCase() !== destinationStop.toLowerCase() &&
        state.missedStopName === null
      ) {
        // Not triggered until we've actually been approaching before
        return;
      }
    },
    [state.missedStopName]
  );

  const triggerMissedStop = useCallback(
    (destinationStop: string, nextBusInfo?: string) => {
      if (missedStopAlertedRef.current) return;
      missedStopAlertedRef.current = true;
      setState((prev) => ({ ...prev, missedStop: true, missedStopName: destinationStop }));
      const busMsg = nextBusInfo || "Stay seated. I'll find the next option.";
      speakFn(
        `You passed your stop, ${destinationStop}. ${busMsg}`,
        "high"
      );
      if (hapticEnabled && navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    },
    [speakFn, hapticEnabled]
  );

  const clearMissedStop = useCallback(() => {
    missedStopAlertedRef.current = false;
    setState((prev) => ({ ...prev, missedStop: false, missedStopName: null }));
  }, []);

  // ── GPS cross-check for unreadable bus number ──
  const crossCheckBusRoute = useCallback(
    (buses: Array<{ routeNumber: string; distanceMeters: number; status: string }>) => {
      // Find the closest arriving bus
      const closest = buses
        .filter((b) => b.status === "arriving" && b.distanceMeters < 50)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
      if (closest) {
        speakFn(
          `Bus number unclear. Cross-checking with GPS. Bus ${closest.routeNumber} confirmed.`,
          "high"
        );
        return closest.routeNumber;
      }
      return null;
    },
    [speakFn]
  );

  /** Power-saving scan interval multiplier (2x when in power-saving mode) */
  const scanIntervalMultiplier = state.powerSaving ? 2 : 1;

  return {
    edgeCaseState: state,
    checkFrameBrightness,
    checkMissedStop,
    triggerMissedStop,
    clearMissedStop,
    crossCheckBusRoute,
    scanIntervalMultiplier,
  };
};
