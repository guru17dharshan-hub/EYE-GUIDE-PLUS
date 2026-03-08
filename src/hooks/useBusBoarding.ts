import { useState, useCallback, useRef, useEffect } from "react";
import { getBoardingHaptic } from "@/utils/haptics";

export type BoardingPhase =
  | "idle"        // No bus detected
  | "detected"    // Bus spotted in camera
  | "approaching" // User walking toward bus
  | "boarding"    // User at the door / entering
  | "finding_seat"// Inside bus, looking for seat
  | "seated";     // User has found a seat

interface BoardingState {
  phase: BoardingPhase;
  busRoute: string | null;
  instructions: string;
  autoScanInterval: number; // ms between scans during boarding
}

const PHASE_CONFIG: Record<BoardingPhase, { instruction: string; scanInterval: number }> = {
  idle: { instruction: "", scanInterval: 8000 },
  detected: {
    instruction: "Bus detected! Walk towards the bus. I'll guide you.",
    scanInterval: 4000,
  },
  approaching: {
    instruction: "Keep walking forward. The bus door should be ahead.",
    scanInterval: 3000,
  },
  boarding: {
    instruction: "You're at the bus door. Step up carefully and enter the bus.",
    scanInterval: 3000,
  },
  finding_seat: {
    instruction: "You're inside the bus. I'm scanning for an available seat.",
    scanInterval: 2500,
  },
  seated: {
    instruction: "You're seated! Relax. I'll alert you when your stop is near.",
    scanInterval: 10000,
  },
};

export const useBusBoarding = (
  speakFn: (msg: string) => void,
  hapticEnabled: boolean
) => {
  const [state, setState] = useState<BoardingState>({
    phase: "idle",
    busRoute: null,
    instructions: "",
    autoScanInterval: 8000,
  });

  const phaseRef = useRef<BoardingPhase>("idle");
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhase = useCallback(
    (phase: BoardingPhase, busRoute?: string) => {
      if (phaseRef.current === phase) return;
      phaseRef.current = phase;
      const config = PHASE_CONFIG[phase];

      setState({
        phase,
        busRoute: busRoute ?? null,
        instructions: config.instruction,
        autoScanInterval: config.scanInterval,
      });

      if (config.instruction) {
        speakFn(config.instruction);
        if (hapticEnabled && navigator.vibrate) {
          navigator.vibrate(getBoardingHaptic(phase));
        }
      }
    },
    [speakFn, hapticEnabled]
  );

  // Process AI detection results and advance the boarding state machine
  const processDetection = useCallback(
    (detectionResult: {
      objects?: Array<{ name?: string; type?: string } | string>;
      alert?: string;
      urgency?: string;
      boarding_phase_hint?: string;
    }) => {
      const objects = (detectionResult.objects || []).map((o) =>
        typeof o === "string" ? o.toLowerCase() : (o.name || o.type || "").toLowerCase()
      );
      const alert = (detectionResult.alert || "").toLowerCase();
      const hint = (detectionResult.boarding_phase_hint || "").toLowerCase();

      const hasBus = objects.some((o) => o.includes("bus")) || alert.includes("bus");
      const hasDoor = objects.some((o) => o.includes("door")) || alert.includes("door");
      const hasInterior = objects.some((o) =>
        o.includes("seat") || o.includes("aisle") || o.includes("handrail") || o.includes("interior")
      ) || alert.includes("inside") || alert.includes("interior");
      const hasSeat = objects.some((o) => o.includes("seat")) || alert.includes("seat");
      const seatOccupied = alert.includes("occupied") || alert.includes("no empty") || alert.includes("no available");
      const seatAvailable = hasSeat && !seatOccupied;

      const currentPhase = phaseRef.current;

      // Use hint from AI if provided
      if (hint === "seated" || hint === "finding_seat" || hint === "boarding" || hint === "approaching" || hint === "detected") {
        setPhase(hint as BoardingPhase);
        return;
      }

      switch (currentPhase) {
        case "idle":
          if (hasBus) {
            const routeMatch = (detectionResult.alert || "").match(/\b(\d{1,4}[A-Z]?)\b/);
            setPhase("detected", routeMatch?.[1] || undefined);
          }
          break;

        case "detected":
          if (hasDoor) {
            setPhase("boarding");
          } else if (hasBus) {
            setPhase("approaching");
          }
          break;

        case "approaching":
          if (hasDoor) {
            setPhase("boarding");
          } else if (hasInterior) {
            setPhase("finding_seat");
          }
          break;

        case "boarding":
          if (hasInterior || hasSeat) {
            setPhase("finding_seat");
          }
          break;

        case "finding_seat":
          if (seatAvailable) {
            setPhase("seated");
          }
          break;

        case "seated":
          // Stay seated until manually reset
          break;
      }
    },
    [setPhase]
  );

  // Auto-advance from "detected" → "approaching" after a timeout
  useEffect(() => {
    if (state.phase === "detected") {
      phaseTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "detected") {
          setPhase("approaching");
        }
      }, 12000);
    }
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, [state.phase, setPhase]);

  const reset = useCallback(() => {
    setPhase("idle");
  }, [setPhase]);

  const getPromptContext = useCallback((): string => {
    switch (phaseRef.current) {
      case "idle":
        return "Look for buses, obstacles, and navigation hazards.";
      case "detected":
        return "A bus was spotted. Tell the user where the bus is relative to them (left, right, ahead) and its route number if visible. Guide them toward it.";
      case "approaching":
        return "The user is walking toward a bus. Look for the bus door. Tell them how to reach the door (step up, go left/right). Warn of obstacles.";
      case "boarding":
        return "The user is at the bus door. Guide them to step up and enter safely. Look for handrails, steps, and obstacles. Once inside, look for seats.";
      case "finding_seat":
        return "The user is inside the bus. Find empty seats. Describe where available seats are (left, right, front, back). If a seat is found say 'Empty seat available' with location.";
      case "seated":
        return "The user is seated on the bus. Just monitor for their stop or any important announcements. Say 'All clear' if nothing notable.";
      default:
        return "Analyze this camera frame for navigation hazards.";
    }
  }, []);

  return {
    boardingState: state,
    processDetection,
    getPromptContext,
    reset,
    isBoarding: state.phase !== "idle" && state.phase !== "seated",
  };
};
