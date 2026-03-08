import { useState, useCallback, useRef } from "react";

export interface TripLog {
  id: string;
  busRoute: string | null;
  startTime: number;
  endTime: number;
  rating: number | null;
  feedback: string | null;
  savedRoute: boolean;
}

interface TripFeedbackState {
  active: boolean; // Currently collecting feedback
  phase: "rating" | "comment" | "save_route" | "done";
  currentTrip: Partial<TripLog> | null;
}

export const useTripFeedback = (
  speakFn: (msg: string, priority?: "normal" | "high") => void,
  hapticEnabled: boolean
) => {
  const [state, setState] = useState<TripFeedbackState>({
    active: false,
    phase: "rating",
    currentTrip: null,
  });
  const [tripHistory, setTripHistory] = useState<TripLog[]>(() => {
    try {
      const saved = localStorage.getItem("eyeguide_trip_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const tripStartRef = useRef<number>(0);

  const startTrip = useCallback((busRoute: string | null) => {
    tripStartRef.current = Date.now();
    setState({
      active: false,
      phase: "rating",
      currentTrip: { busRoute, startTime: Date.now() },
    });
  }, []);

  const endTrip = useCallback(() => {
    setState((prev) => ({
      ...prev,
      active: true,
      phase: "rating",
      currentTrip: {
        ...prev.currentTrip,
        endTime: Date.now(),
      },
    }));
    speakFn("Trip complete! How was your trip? Rate from 1 to 5.");
    if (hapticEnabled && navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }, [speakFn, hapticEnabled]);

  const processVoiceInput = useCallback(
    (input: string): boolean => {
      if (!state.active) return false;
      const lower = input.toLowerCase();

      switch (state.phase) {
        case "rating": {
          const ratingMatch = lower.match(/\b([1-5])\b/);
          if (ratingMatch) {
            const rating = parseInt(ratingMatch[1]);
            setState((prev) => ({
              ...prev,
              phase: "comment",
              currentTrip: { ...prev.currentTrip, rating },
            }));
            const labels = ["terrible", "poor", "okay", "good", "excellent"];
            speakFn(`Got it, ${rating} out of 5, ${labels[rating - 1]}. Any comments about the trip? Say skip to skip.`);
            return true;
          }
          if (lower.includes("skip") || lower.includes("no")) {
            setState((prev) => ({
              ...prev,
              phase: "save_route",
              currentTrip: { ...prev.currentTrip, rating: null },
            }));
            speakFn("Would you like to save this route for next time? Say yes or no.");
            return true;
          }
          return true; // Consume input during feedback
        }

        case "comment": {
          if (lower.includes("skip") || lower.includes("no comment") || lower.includes("nothing")) {
            setState((prev) => ({
              ...prev,
              phase: "save_route",
              currentTrip: { ...prev.currentTrip, feedback: null },
            }));
          } else {
            setState((prev) => ({
              ...prev,
              phase: "save_route",
              currentTrip: { ...prev.currentTrip, feedback: input.trim() },
            }));
            speakFn("Thanks for your feedback!");
          }
          speakFn("Would you like to save this route for next time? Say yes or no.");
          return true;
        }

        case "save_route": {
          const save = lower.includes("yes") || lower.includes("save");
          const trip: TripLog = {
            id: `trip-${Date.now()}`,
            busRoute: state.currentTrip?.busRoute || null,
            startTime: state.currentTrip?.startTime || Date.now(),
            endTime: state.currentTrip?.endTime || Date.now(),
            rating: state.currentTrip?.rating || null,
            feedback: state.currentTrip?.feedback || null,
            savedRoute: save,
          };

          setTripHistory((prev) => {
            const updated = [trip, ...prev].slice(0, 50);
            try { localStorage.setItem("eyeguide_trip_history", JSON.stringify(updated)); } catch {}
            return updated;
          });

          if (save) {
            speakFn("Route saved! I'll remember it for next time.");
          } else {
            speakFn("Okay, route not saved. Trip logged.");
          }

          setState({ active: false, phase: "done", currentTrip: null });
          if (hapticEnabled && navigator.vibrate) navigator.vibrate([100]);
          return true;
        }

        default:
          return false;
      }
    },
    [state, speakFn, hapticEnabled]
  );

  const cancelFeedback = useCallback(() => {
    setState({ active: false, phase: "rating", currentTrip: null });
    speakFn("Trip feedback cancelled.");
  }, [speakFn]);

  return {
    feedbackState: state,
    tripHistory,
    startTrip,
    endTrip,
    processVoiceInput,
    cancelFeedback,
    isFeedbackActive: state.active,
  };
};
