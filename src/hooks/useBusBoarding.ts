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
  autoScanInterval: number;
  lastSeatDirection: string | null; // e.g. "left, 1 meter"
  nextStop: string | null;
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
    instruction: "Door is open. Step up carefully — mind the gap.",
    scanInterval: 2000, // Faster scanning during boarding
  },
  finding_seat: {
    instruction: "You're inside the bus. Scanning for an available seat.",
    scanInterval: 2500,
  },
  seated: {
    instruction: "You're seated! Relax. I'll alert you when your stop is near.",
    scanInterval: 10000,
  },
};

// Hesitation prompts — spoken if user stays in a phase too long
const HESITATION_CONFIG: Partial<Record<BoardingPhase, { delay: number; message: string }>> = {
  boarding: {
    delay: 8000,
    message: "Board now. The bus is waiting. Step up and move inside.",
  },
  finding_seat: {
    delay: 15000,
    message: "Still looking for a seat. Hold a handrail for safety. I'll keep scanning.",
  },
  approaching: {
    delay: 15000,
    message: "Keep moving toward the bus. It may leave soon.",
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
    lastSeatDirection: null,
    nextStop: null,
  });

  const phaseRef = useRef<BoardingPhase>("idle");
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hesitationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hesitationCountRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (phaseTimerRef.current) { clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null; }
    if (hesitationTimerRef.current) { clearTimeout(hesitationTimerRef.current); hesitationTimerRef.current = null; }
  }, []);

  const setPhase = useCallback(
    (phase: BoardingPhase, busRoute?: string) => {
      if (phaseRef.current === phase) return;
      phaseRef.current = phase;
      hesitationCountRef.current = 0;
      const config = PHASE_CONFIG[phase];

      setState((prev) => ({
        ...prev,
        phase,
        busRoute: busRoute ?? prev.busRoute,
        instructions: config.instruction,
        autoScanInterval: config.scanInterval,
      }));

      if (config.instruction) {
        speakFn(config.instruction);
        if (hapticEnabled && navigator.vibrate) {
          navigator.vibrate(getBoardingHaptic(phase));
        }
      }
    },
    [speakFn, hapticEnabled]
  );

  // Hesitation detection — repeat prompts if user stays too long in a phase
  useEffect(() => {
    clearTimers();
    const hesitationCfg = HESITATION_CONFIG[state.phase];
    if (!hesitationCfg) return;

    const startHesitationLoop = () => {
      hesitationTimerRef.current = setTimeout(() => {
        if (phaseRef.current === state.phase) {
          hesitationCountRef.current += 1;
          speakFn(hesitationCfg.message);
          if (hapticEnabled && navigator.vibrate) {
            navigator.vibrate([400, 150, 400]); // Urgent pattern
          }
          // Repeat up to 3 times
          if (hesitationCountRef.current < 3) {
            startHesitationLoop();
          }
        }
      }, hesitationCfg.delay);
    };

    startHesitationLoop();

    return clearTimers;
  }, [state.phase, speakFn, hapticEnabled, clearTimers]);

  // Auto-advance from "detected" → "approaching" after a timeout
  useEffect(() => {
    if (state.phase === "detected") {
      phaseTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "detected") {
          setPhase("approaching");
        }
      }, 12000);
      return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
    }
  }, [state.phase, setPhase]);

  // Process AI detection results and advance the boarding state machine
  const processDetection = useCallback(
    (detectionResult: {
      objects?: Array<{ name?: string; type?: string; direction?: string } | string>;
      alert?: string;
      urgency?: string;
      boarding_phase_hint?: string;
      seat_direction?: string;
      next_stop?: string;
      obstacles?: string[];
    }) => {
      const objects = (detectionResult.objects || []).map((o) =>
        typeof o === "string" ? o.toLowerCase() : (o.name || o.type || "").toLowerCase()
      );
      const alert = (detectionResult.alert || "").toLowerCase();
      const hint = (detectionResult.boarding_phase_hint || "").toLowerCase();

      const hasBus = objects.some((o) => o.includes("bus")) || alert.includes("bus");
      const hasDoor = objects.some((o) => o.includes("door")) || alert.includes("door");
      const doorOpen = alert.includes("door open") || alert.includes("door is open") || alert.includes("opening");
      const hasInterior = objects.some((o) =>
        o.includes("seat") || o.includes("aisle") || o.includes("handrail") || o.includes("interior")
      ) || alert.includes("inside") || alert.includes("interior");
      const hasSeat = objects.some((o) => o.includes("seat")) || alert.includes("seat");
      const seatOccupied = alert.includes("occupied") || alert.includes("no empty") || alert.includes("no available");
      const seatAvailable = hasSeat && !seatOccupied;
      const hasObstacle = objects.some((o) => o.includes("pole") || o.includes("obstacle") || o.includes("barrier"))
        || alert.includes("pole") || alert.includes("obstacle");

      // Update seat direction and next stop info
      if (detectionResult.seat_direction) {
        setState((prev) => ({ ...prev, lastSeatDirection: detectionResult.seat_direction! }));
      }
      if (detectionResult.next_stop) {
        setState((prev) => ({ ...prev, nextStop: detectionResult.next_stop! }));
      }

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
          if (hasDoor || doorOpen) {
            setPhase("boarding");
          } else if (hasBus) {
            setPhase("approaching");
          }
          break;

        case "approaching":
          if (hasDoor || doorOpen) {
            setPhase("boarding");
          } else if (hasInterior) {
            setPhase("finding_seat");
          }
          break;

        case "boarding":
          if (hasInterior || hasSeat) {
            setPhase("finding_seat");
          }
          // If door is detected open, give specific guidance
          if (doorOpen && !hasInterior) {
            speakFn("Door is open. Step up now and move inside.");
          }
          break;

        case "finding_seat":
          // Announce obstacles
          if (hasObstacle && detectionResult.alert) {
            // The AI alert already contains obstacle info — it'll be spoken via the main alert handler
          }
          if (seatAvailable) {
            const dir = detectionResult.seat_direction || "nearby";
            speakFn(`Empty seat available ${dir}. Move toward it carefully.`);
            setPhase("seated");
          }
          break;

        case "seated":
          // Monitor for next stop announcements
          if (detectionResult.next_stop) {
            speakFn(`Next stop: ${detectionResult.next_stop}.`);
          }
          break;
      }
    },
    [setPhase, speakFn]
  );

  const reset = useCallback(() => {
    clearTimers();
    hesitationCountRef.current = 0;
    setState({
      phase: "idle",
      busRoute: null,
      instructions: "",
      autoScanInterval: 8000,
      lastSeatDirection: null,
      nextStop: null,
    });
    phaseRef.current = "idle";
  }, [clearTimers]);

  const getPromptContext = useCallback((): string => {
    switch (phaseRef.current) {
      case "idle":
        return "Look for buses, obstacles, and navigation hazards.";
      case "detected":
        return "A bus was spotted. Tell the user where the bus is relative to them (left, right, ahead) and its route number if visible. Guide them toward it.";
      case "approaching":
        return "The user is walking toward a bus. Look for the bus door. Tell them how to reach the door (step up, go left/right). Warn of any obstacles like poles, curbs, or puddles.";
      case "boarding":
        return "The user is at the bus door. Check if the door is open. If open, say 'Door is open' and guide them to step up. Look for handrails, steps, gaps. Warn about the step height. If they seem to be hesitating, encourage them to board. Include 'door open' or 'door closed' in your alert.";
      case "finding_seat":
        return "The user is inside the bus. The phone may be clipped to their chest or in a pocket with camera facing outward. Find empty seats and describe their EXACT position: 'Empty seat on your left, 1 meter away' or 'Empty seat two rows ahead on the right'. Warn about poles, handrails, standing passengers, and bags in the aisle. Include a 'seat_direction' field like 'on your left, 1 meter' and an 'obstacles' array. If you see a pole or obstacle, say 'Pole ahead — move right to avoid it'.";
      case "seated":
        return "The user is seated on the bus. Monitor for stop announcements, digital displays showing next stop, or any notable changes. If you can read a next stop display, include 'next_stop' field with the stop name. Say 'All clear' if nothing notable.";
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
