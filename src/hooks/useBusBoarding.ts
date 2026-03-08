import { useState, useCallback, useRef, useEffect } from "react";
import { getBoardingHaptic } from "@/utils/haptics";

export type BoardingPhase =
  | "idle"          // No bus detected
  | "detected"      // Bus spotted in camera
  | "approaching"   // User walking toward bus
  | "boarding"      // User at the door / entering
  | "finding_seat"  // Inside bus, looking for seat
  | "seated"        // User has found a seat
  | "exiting"       // Preparing to exit / at the door
  | "post_exit";    // Just exited, outdoor navigation

interface BoardingState {
  phase: BoardingPhase;
  busRoute: string | null;
  instructions: string;
  autoScanInterval: number;
  lastSeatDirection: string | null;
  nextStop: string | null;
  destinationStop: string | null;
  isApproachingDestination: boolean;
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
    scanInterval: 2000,
  },
  finding_seat: {
    instruction: "You're inside the bus. Scanning for an available seat.",
    scanInterval: 2500,
  },
  seated: {
    instruction: "You're seated! Relax. I'll alert you when your stop is near.",
    scanInterval: 10000,
  },
  exiting: {
    instruction: "Prepare to exit. Move toward the door carefully. Hold the handrail.",
    scanInterval: 2000,
  },
  post_exit: {
    instruction: "You've exited the bus. Switching to outdoor navigation mode.",
    scanInterval: 3000,
  },
};

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
  exiting: {
    delay: 10000,
    message: "The bus has stopped. Move to the door and exit now.",
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
    destinationStop: null,
    isApproachingDestination: false,
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

  // Set user's destination stop
  const setDestination = useCallback((stop: string) => {
    setState((prev) => ({ ...prev, destinationStop: stop }));
    speakFn(`Destination set to ${stop}. I'll alert you when it's approaching.`);
  }, [speakFn]);

  // Hesitation detection
  useEffect(() => {
    if (hesitationTimerRef.current) { clearTimeout(hesitationTimerRef.current); hesitationTimerRef.current = null; }
    const hesitationCfg = HESITATION_CONFIG[state.phase];
    if (!hesitationCfg) return;

    const startHesitationLoop = () => {
      hesitationTimerRef.current = setTimeout(() => {
        if (phaseRef.current === state.phase) {
          hesitationCountRef.current += 1;
          speakFn(hesitationCfg.message);
          if (hapticEnabled && navigator.vibrate) {
            navigator.vibrate([400, 150, 400]);
          }
          if (hesitationCountRef.current < 3) {
            startHesitationLoop();
          }
        }
      }, hesitationCfg.delay);
    };

    startHesitationLoop();

    return () => {
      if (hesitationTimerRef.current) { clearTimeout(hesitationTimerRef.current); hesitationTimerRef.current = null; }
    };
  }, [state.phase, speakFn, hapticEnabled]);

  // Auto-advance from "detected" → "approaching"
  useEffect(() => {
    if (state.phase === "detected") {
      phaseTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "detected") setPhase("approaching");
      }, 12000);
      return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
    }
  }, [state.phase, setPhase]);

  // Auto-advance from "post_exit" → "idle" after 60s
  useEffect(() => {
    if (state.phase === "post_exit") {
      phaseTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "post_exit") {
          speakFn("Outdoor navigation complete. Returning to normal scanning mode.");
          reset();
        }
      }, 60000);
      return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
    }
  }, [state.phase, speakFn]);

  const processDetection = useCallback(
    (detectionResult: {
      objects?: Array<{ name?: string; type?: string; direction?: string } | string>;
      alert?: string;
      urgency?: string;
      boarding_phase_hint?: string;
      seat_direction?: string;
      next_stop?: string;
      obstacles?: string[];
      landmark?: string;
      exit_guidance?: string;
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
      const busSlowing = alert.includes("slowing") || alert.includes("stopping") || alert.includes("stop");
      const hasExterior = alert.includes("sidewalk") || alert.includes("outside") || alert.includes("exited")
        || objects.some((o) => o.includes("sidewalk") || o.includes("crosswalk") || o.includes("curb"));

      // Update enriched state
      if (detectionResult.seat_direction) {
        setState((prev) => ({ ...prev, lastSeatDirection: detectionResult.seat_direction! }));
      }
      if (detectionResult.next_stop) {
        setState((prev) => {
          const isApproaching = prev.destinationStop
            ? detectionResult.next_stop!.toLowerCase().includes(prev.destinationStop.toLowerCase())
            : false;
          if (isApproaching && !prev.isApproachingDestination) {
            speakFn(`Your destination, ${prev.destinationStop}, is the next stop! Prepare to exit.`);
            if (hapticEnabled && navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
          }
          return { ...prev, nextStop: detectionResult.next_stop!, isApproachingDestination: isApproaching };
        });
      }

      const currentPhase = phaseRef.current;

      // AI phase hints
      const validHints: BoardingPhase[] = ["detected", "approaching", "boarding", "finding_seat", "seated", "exiting", "post_exit"];
      if (validHints.includes(hint as BoardingPhase)) {
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
          if (hasDoor || doorOpen) setPhase("boarding");
          else if (hasBus) setPhase("approaching");
          break;

        case "approaching":
          if (hasDoor || doorOpen) setPhase("boarding");
          else if (hasInterior) setPhase("finding_seat");
          break;

        case "boarding":
          if (hasInterior || hasSeat) setPhase("finding_seat");
          if (doorOpen && !hasInterior) {
            speakFn("Door is open. Step up now and move inside.");
          }
          break;

        case "finding_seat":
          if (seatAvailable) {
            const dir = detectionResult.seat_direction || "nearby";
            speakFn(`Empty seat available ${dir}. Move toward it carefully.`);
            setPhase("seated");
          }
          break;

        case "seated":
          if (detectionResult.next_stop) {
            speakFn(`Next stop: ${detectionResult.next_stop}.`);
          }
          // Detect bus slowing/stopping at destination
          if (busSlowing && state.isApproachingDestination) {
            speakFn("Bus is stopping. This is your stop. Exit via the nearest door.");
            setPhase("exiting");
          }
          break;

        case "exiting":
          if (doorOpen) {
            speakFn("Door is opening. Step down carefully — mind the gap.");
          }
          if (hasExterior) {
            speakFn("You've exited the bus. Walk straight to reach the sidewalk.");
            setPhase("post_exit");
          }
          break;

        case "post_exit":
          // Outdoor navigation — landmarks, crosswalks, course correction
          if (detectionResult.landmark) {
            speakFn(`Landmark detected: ${detectionResult.landmark}.`);
          }
          break;
      }
    },
    [setPhase, speakFn, hapticEnabled, state.isApproachingDestination]
  );

  const reset = useCallback(() => {
    clearTimers();
    hesitationCountRef.current = 0;
    phaseRef.current = "idle";
    setState({
      phase: "idle",
      busRoute: null,
      instructions: "",
      autoScanInterval: 8000,
      lastSeatDirection: null,
      nextStop: null,
      destinationStop: null,
      isApproachingDestination: false,
    });
  }, [clearTimers]);

  const getPromptContext = useCallback((): string => {
    switch (phaseRef.current) {
      case "idle":
        return "Look for buses, obstacles, and navigation hazards. Identify crosswalks, stairs, curbs, and landmarks.";
      case "detected":
        return "A bus was spotted. Tell the user where the bus is relative to them (left, right, ahead) and its route number if visible. Guide them toward it.";
      case "approaching":
        return "The user is walking toward a bus. Look for the bus door. Tell them how to reach the door. Warn of obstacles like poles, curbs, puddles, low-hanging objects.";
      case "boarding":
        return "The user is at the bus door. Check if the door is open. If open, say 'Door is open' and guide them to step up. Mention the step height and any gap. Look for handrails. Include 'door open' or 'door closed' in alert.";
      case "finding_seat":
        return "The user is inside the bus (phone clipped to chest or in pocket). Find empty seats with EXACT position: 'Empty seat on your left, 1 meter away'. Warn about ALL obstacles: poles, bags in aisle, standing passengers, low-hanging handles. Include 'seat_direction' and 'obstacles' fields. Say 'Caution: low-hanging bag ahead' or 'Pole ahead — move right'.";
      case "seated":
        return "The user is seated. Monitor for: digital stop displays, announcements, bus slowing/stopping. Include 'next_stop' field. If bus is slowing say 'bus is stopping'. Watch for the user's destination. Also warn of any sudden obstacles or people moving in the aisle.";
      case "exiting":
        return "The user is preparing to exit the bus. Guide them to the door. Check if the door is open or closed. When open say 'Door is opening. Step down carefully — mind the gap.' Mention step height and gap size. Look for handrails. Once outside, describe the immediate surroundings: sidewalk direction, obstacles. Include 'exit_guidance' field.";
      case "post_exit":
        return "The user just exited the bus. Switch to outdoor navigation. Identify: sidewalks, crosswalks (and their signals), stairs, curbs, landmarks (station entrances, benches, signs, buildings). Give directional guidance: 'Walk straight for 5 meters to the sidewalk. Turn left.' If the user veers off course, say 'Recalibrating — turn right to stay on track.' Include 'landmark' field if any landmark is visible. Warn about traffic, uneven ground, puddles.";
      default:
        return "Analyze this camera frame for navigation hazards.";
    }
  }, []);

  return {
    boardingState: state,
    processDetection,
    getPromptContext,
    reset,
    setDestination,
    isBoarding: state.phase !== "idle" && state.phase !== "seated" && state.phase !== "post_exit",
  };
};
