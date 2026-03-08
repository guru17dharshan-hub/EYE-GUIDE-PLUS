import { useState, useEffect, useCallback, useRef } from "react";

interface FallDetectionOptions {
  onFallDetected: () => void;
  onFallConfirmed: () => void; // Called if no response after fall
  enabled: boolean;
  confirmationTimeout?: number; // ms to wait for "I'm okay" response
}

/**
 * Detects falls using the DeviceMotion API (accelerometer).
 * If a fall is detected, calls onFallDetected.
 * If no response within confirmationTimeout, calls onFallConfirmed (SOS).
 */
export const useFallDetection = ({
  onFallDetected,
  onFallConfirmed,
  enabled,
  confirmationTimeout = 15000,
}: FallDetectionOptions) => {
  const [fallDetected, setFallDetected] = useState(false);
  const [supported, setSupported] = useState(true);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFallTimeRef = useRef(0);
  const cooldownMs = 30000; // Don't re-trigger within 30s

  const confirmSafe = useCallback(() => {
    setFallDetected(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (!("DeviceMotionEvent" in window)) {
      setSupported(false);
      return;
    }

    // Request permission on iOS 13+
    const requestPermission = async () => {
      const DME = DeviceMotionEvent as any;
      if (typeof DME.requestPermission === "function") {
        try {
          const permission = await DME.requestPermission();
          if (permission !== "granted") {
            setSupported(false);
            return false;
          }
        } catch {
          setSupported(false);
          return false;
        }
      }
      return true;
    };

    let active = true;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!active) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Calculate total acceleration magnitude
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);

      // Fall detection: sudden free-fall (magnitude near 0) followed by impact (high magnitude)
      // Threshold: magnitude < 3 m/s² (free fall) or > 35 m/s² (impact)
      const now = Date.now();
      if ((magnitude < 3 || magnitude > 35) && now - lastFallTimeRef.current > cooldownMs) {
        lastFallTimeRef.current = now;
        setFallDetected(true);
        onFallDetected();

        // Start confirmation timer
        confirmTimerRef.current = setTimeout(() => {
          if (active) {
            onFallConfirmed();
            setFallDetected(false);
          }
        }, confirmationTimeout);
      }
    };

    requestPermission().then((granted) => {
      if (granted && active) {
        window.addEventListener("devicemotion", handleMotion);
      }
    });

    return () => {
      active = false;
      window.removeEventListener("devicemotion", handleMotion);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [enabled, onFallDetected, onFallConfirmed, confirmationTimeout]);

  return {
    fallDetected,
    supported,
    confirmSafe, // Call this when user says "I'm okay"
  };
};
