import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Camera, Eye, Loader2, MapPin, QrCode } from "lucide-react";
import { getProximityVibration, startProximityPulse } from "@/utils/haptics";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import CameraFeed, { CameraFeedRef } from "@/components/CameraFeed";
import AlertLog from "@/components/AlertLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMockBusTracker } from "@/hooks/useMockBusTracker";
import BusTracker from "@/components/BusTracker";
import { useBusBoarding } from "@/hooks/useBusBoarding";
import { useEmergencyContacts } from "@/hooks/useEmergencyContacts";
import EmergencyContacts from "@/components/EmergencyContacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSavedLocations } from "@/hooks/useSavedLocations";
import LocationMap from "@/components/LocationMap";
import QuickActions from "@/components/QuickActions";
import ManagePanel from "@/components/ManagePanel";
import { useTransitCardScanner } from "@/hooks/useTransitCardScanner";
import { useFallDetection } from "@/hooks/useFallDetection";
import { useTripFeedback } from "@/hooks/useTripFeedback";

const Navigate = () => {
  const navigate = useNavigate();
  const { speak, isSpeaking } = useSpeech();
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [busTrackingActive, setBusTrackingActive] = useState(true);
  const [showContacts, setShowContacts] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const { buses } = useMockBusTracker(busTrackingActive);
  const { contacts, addContact, removeContact, callContact, callAll } = useEmergencyContacts();
  const { boardingState, processDetection, getPromptContext, reset: resetBoarding, isBoarding, setDestination } = useBusBoarding(speak, hapticEnabled);
  const { position, error: geoError } = useGeolocation(true);
  const { locations, setHome, addLocation, removeLocation, getHome, getFrequent } = useSavedLocations();
  const [showMap, setShowMap] = useState(false);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const autoScanRef = useRef(false);
  const cameraRef = useRef<CameraFeedRef>(null);
  const scanningRef = useRef(false);
  const { lastScan, scanFromDataUrl, supported: qrSupported, clearScan } = useTransitCardScanner();
  // Voice contact addition state machine: "idle" | "awaiting_name" | "awaiting_phone"
  const voiceContactModeRef = useRef<"idle" | "awaiting_name" | "awaiting_phone">("idle");
  const pendingContactNameRef = useRef("");
  const [alerts, setAlerts] = useState<string[]>([
    "Navigation active. Voice control enabled.",
  ]);
  const [voiceTranscripts, setVoiceTranscripts] = useState<string[]>([]);

  // Fall detection
  const handleFallDetected = useCallback(() => {
    speak("Are you okay? Say I'm okay or I'm fine within 15 seconds, or I will contact your emergency contacts.", "high");
    if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500]);
  }, [speak]);

  const handleFallConfirmed = useCallback(() => {
    speak("No response detected. Activating emergency SOS.", "high");
    // Will trigger SOS after the handleSOS is defined
    if (contacts.length > 0) {
      callAll();
      speak(`Calling ${contacts[0].name} now.`, "high");
    }
  }, [speak, contacts, callAll]);

  const { fallDetected, confirmSafe } = useFallDetection({
    onFallDetected: handleFallDetected,
    onFallConfirmed: handleFallConfirmed,
    enabled: hapticEnabled,
  });

  // Trip feedback system
  const { feedbackState, startTrip, endTrip, processVoiceInput: processFeedbackInput, cancelFeedback, isFeedbackActive } = useTripFeedback(speak, hapticEnabled);

  // Track previous heading for recalibration
  const prevHeadingRef = useRef<number | null>(null);
  const headingChangeThreshold = 45; // degrees

  // Heading-based recalibration alerts
  useEffect(() => {
    if (!position?.heading || position.heading === null) return;
    const heading = position.heading;
    if (prevHeadingRef.current !== null) {
      const delta = Math.abs(heading - prevHeadingRef.current);
      const normalized = delta > 180 ? 360 - delta : delta;
      if (normalized > headingChangeThreshold && (boardingState.phase === "post_exit" || boardingState.phase === "approaching")) {
        speak("Direction changed. Recalibrating guidance.");
      }
    }
    prevHeadingRef.current = heading;
  }, [position?.heading, boardingState.phase, speak]);

  const prevPhaseRef = useRef(boardingState.phase);

  // Auto-start trip when boarding begins
  useEffect(() => {
    if (boardingState.phase === "boarding") {
      startTrip(boardingState.busRoute);
    }
    // Trigger feedback when trip ends (reset from seated/post_exit)
    if (boardingState.phase === "idle" && prevPhaseRef.current === "post_exit") {
      endTrip();
    }
    prevPhaseRef.current = boardingState.phase;
  }, [boardingState.phase, boardingState.busRoute, startTrip, endTrip]);

  const addAlert = useCallback(
    (message: string, vibrate = true, priority: "normal" | "high" = "normal") => {
      setAlerts((prev) => [message, ...prev].slice(0, 20));
      speak(message, priority);
      if (vibrate && hapticEnabled && navigator.vibrate) {
        navigator.vibrate(200);
      }
      // Design principle: Critical alerts are repeated twice with vibration
      if (priority === "high") {
        setTimeout(() => {
          speak(message, priority);
          if (hapticEnabled && navigator.vibrate) navigator.vibrate([300, 100, 300]);
        }, 3000);
      }
    },
    [speak, hapticEnabled]
  );

  const analyzeFrame = useCallback(async () => {
    if (scanningRef.current || aiThinking) return;
    const frame = cameraRef.current?.captureFrame();
    if (!frame) return;

    scanningRef.current = true;
    setAiScanning(true);

    try {
      const boardingContext = boardingState.phase !== "idle"
        ? { phase: boardingState.phase, prompt: getPromptContext() }
        : undefined;

      const { data, error } = await supabase.functions.invoke("detect-objects", {
        body: { image: frame, boarding_context: boardingContext },
      });

      if (error) {
        console.error("Detection error:", error);
        toast.error("AI detection failed");
        return;
      }

      // Feed results into boarding state machine
      if (data) {
        processDetection(data);
      }

      if (data?.alert) {
        const urgency = data.urgency || "low";
        if (urgency === "high" && hapticEnabled && navigator.vibrate) {
          navigator.vibrate([300, 100, 300]);
        }
        addAlert(`🤖 ${data.alert}`, urgency !== "low");
      }

      if (data?.objects?.length > 0) {
        const names = data.objects.map((o: any) => (typeof o === "string" ? o : o.name || o.type || o)).join(", ");
        addAlert(`Detected: ${names}`, false);
      }
    } catch (e) {
      console.error("Analysis error:", e);
    } finally {
      scanningRef.current = false;
      setAiScanning(false);
    }
  }, [addAlert, hapticEnabled, boardingState.phase, getPromptContext, processDetection]);

  const askAI = useCallback(async (question: string) => {
    setAiThinking(true);
    addAlert("Let me think about that…", false);
    try {
      const { data, error } = await supabase.functions.invoke("ask-ai", {
        body: { question },
      });
      if (error) {
        console.error("Ask AI error:", error);
        addAlert("Sorry, I could not get an answer right now.");
        return;
      }
      if (data?.answer) {
        addAlert(`🤖 ${data.answer}`, true, "high");
      }
    } catch (e) {
      console.error("Ask AI error:", e);
      addAlert("Sorry, something went wrong with my answer.");
    } finally {
      setAiThinking(false);
    }
  }, [addAlert]);

  // Auto-scan loop — uses boarding state interval when boarding is active
  useEffect(() => {
    autoScanRef.current = autoScan;
    const shouldAutoScan = autoScan || isBoarding;
    if (!shouldAutoScan) return;

    const interval = setInterval(() => {
      if ((autoScanRef.current || isBoarding) && !scanningRef.current) {
        analyzeFrame();
      }
    }, isBoarding ? boardingState.autoScanInterval : 8000);

    return () => clearInterval(interval);
  }, [autoScan, analyzeFrame, isBoarding, boardingState.autoScanInterval]);

  // Bus arrival voice alerts
  // Only alert for buses that are very close (<100m) and arriving within 2 minutes
  // Progressive haptic pulse for nearest bus
  const hapticCleanupRef = useRef<(() => void) | null>(null);
  const closestBusRef = useRef<number>(Infinity);

  useEffect(() => {
    const closest = buses.reduce((min, b) => Math.min(min, b.distanceMeters), Infinity);
    closestBusRef.current = closest;

    // Start proximity pulse when a bus is within 500m
    if (hapticEnabled && closest <= 500 && !hapticCleanupRef.current) {
      hapticCleanupRef.current = startProximityPulse(
        () => closestBusRef.current,
        () => hapticEnabled
      );
    }
    // Stop when no buses nearby or haptic disabled
    if ((closest > 500 || !hapticEnabled) && hapticCleanupRef.current) {
      hapticCleanupRef.current();
      hapticCleanupRef.current = null;
    }

    return () => {
      if (hapticCleanupRef.current) {
        hapticCleanupRef.current();
        hapticCleanupRef.current = null;
      }
    };
  }, [buses, hapticEnabled]);

  const prevBusesRef = useRef<string[]>([]);
  useEffect(() => {
    const imminentBuses = buses.filter(
      (b) => b.status === "arriving" && b.distanceMeters < 100 && b.etaMinutes < 2
    );
    const newArrivals = imminentBuses.filter(
      (b) => !prevBusesRef.current.includes(b.id)
    );
    newArrivals.forEach((bus) => {
      addAlert(
        `🚌 Bus ${bus.routeNumber} to ${bus.destination} is arriving! ${bus.distanceMeters} meters away.`,
        true
      );
      // Intense haptic for imminent arrival
      if (hapticEnabled && navigator.vibrate) {
        const pattern = getProximityVibration(bus.distanceMeters);
        navigator.vibrate(pattern);
      }
    });
    prevBusesRef.current = imminentBuses.map((b) => b.id);
  }, [buses, addAlert, hapticEnabled]);

  const handleSOS = useCallback(() => {
    addAlert("EMERGENCY SOS ACTIVATED. Contacting emergency services.");
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    if (contacts.length > 0) {
      addAlert(`Calling ${contacts[0].name}…`);
      callAll();
    } else {
      addAlert("No emergency contacts saved. Say Add contact to add one.");
    }
  }, [addAlert, contacts, callAll]);

  // Helper to extract phone digits from spoken text
  const extractPhoneFromSpeech = useCallback((speech: string): string => {
    // Map spoken words to digits
    const wordToDigit: Record<string, string> = {
      zero: "0", oh: "0", one: "1", two: "2", to: "2", too: "2",
      three: "3", four: "4", for: "4", five: "5", six: "6",
      seven: "7", eight: "8", nine: "9",
    };
    // Replace spoken number words with digits
    let processed = speech.toLowerCase();
    Object.entries(wordToDigit).forEach(([word, digit]) => {
      processed = processed.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
    });
    // Also handle "double" and "triple"
    processed = processed.replace(/double\s*(\d)/g, "$1$1");
    processed = processed.replace(/triple\s*(\d)/g, "$1$1$1");
    // Extract only digits and +
    const digits = processed.replace(/[^\d+]/g, "");
    return digits;
  }, []);

  const handleVoiceCommand = useCallback(
    (command: string) => {
      const lower = command.toLowerCase();
      setVoiceTranscripts((prev) => [`🎙️ ${command}`, ...prev].slice(0, 10));

      // ---- Trip feedback state machine (highest priority) ----
      if (isFeedbackActive) {
        if (lower.includes("cancel") || lower.includes("skip feedback")) {
          cancelFeedback();
          return;
        }
        const handled = processFeedbackInput(command);
        if (handled) return;
      }

      // ---- Voice contact state machine ----
      if (voiceContactModeRef.current === "awaiting_name") {
        if (lower.includes("cancel") || lower.includes("never mind")) {
          voiceContactModeRef.current = "idle";
          addAlert("Contact addition cancelled.");
          return;
        }
        const name = command.trim();
        if (name.length < 1) {
          addAlert("I didn't catch the name. Please say the contact name again.");
          return;
        }
        pendingContactNameRef.current = name;
        voiceContactModeRef.current = "awaiting_phone";
        addAlert(`Got it, ${name}. Now say the phone number. For example, say 9 8 7 6 5 4 3 2 1 0.`);
        return;
      }

      if (voiceContactModeRef.current === "awaiting_phone") {
        if (lower.includes("cancel") || lower.includes("never mind")) {
          voiceContactModeRef.current = "idle";
          pendingContactNameRef.current = "";
          addAlert("Contact addition cancelled.");
          return;
        }
        const phone = extractPhoneFromSpeech(command);
        if (phone.length < 5) {
          addAlert("That doesn't seem like a valid phone number. Please say the digits again clearly.");
          return;
        }
        const name = pendingContactNameRef.current;
        addContact(name, phone);
        voiceContactModeRef.current = "idle";
        pendingContactNameRef.current = "";
        addAlert(`Saved! ${name} with number ${phone.split("").join(" ")} is now your emergency contact. In an emergency, say SOS to call them.`);
        return;
      }

      // ---- Regular commands ----
      // Transit card scanning
      if (lower.includes("scan card") || lower.includes("scan ticket") || lower.includes("transit card") || lower.includes("scan pass")) {
        if (qrSupported === false) {
          addAlert("QR scanning is not supported on this device. Try Chrome on Android.");
        } else {
          addAlert("Hold your transit card or QR code in front of the camera.");
          const frame = cameraRef.current?.captureFrame();
          if (frame) {
            scanFromDataUrl(frame).then((result) => {
              if (result) {
                addAlert(`✅ Card scanned! Code: ${result.rawValue}`, true, "high");
              } else {
                addAlert("No QR code or barcode detected. Try holding it closer.");
              }
            });
          }
        }
      }
      // Navigation commands
      else if (lower.includes("find") && lower.includes("bus")) {
        addAlert("Scanning for buses…");
        analyzeFrame();
      } else if (lower.includes("detect") && lower.includes("seat")) {
        addAlert("Scanning for available seats…");
        analyzeFrame();
      } else if (lower.includes("scan") || lower.includes("look") || lower.includes("what") && lower.includes("see")) {
        addAlert("Scanning surroundings…");
        analyzeFrame();
      }
      // Auto scan toggle
      else if (lower.includes("auto scan on") || lower.includes("enable auto") || lower.includes("start auto")) {
        setAutoScan(true);
        addAlert("Auto scan enabled. I will scan every 8 seconds.");
        analyzeFrame();
      } else if (lower.includes("auto scan off") || lower.includes("disable auto") || lower.includes("stop auto")) {
        setAutoScan(false);
        addAlert("Auto scan disabled.");
      }
      // Haptic toggle
      else if (lower.includes("haptic on") || lower.includes("vibration on")) {
        setHapticEnabled(true);
        addAlert("Haptic feedback enabled.");
      } else if (lower.includes("haptic off") || lower.includes("vibration off")) {
        setHapticEnabled(false);
        addAlert("Haptic feedback disabled.");
      }
      // Emergency
      else if (lower.includes("emergency") || lower.includes("sos") || lower.includes("help me")) {
        handleSOS();
      }
      // Fall detection confirmation
      else if (fallDetected && (lower.includes("i'm okay") || lower.includes("i'm fine") || lower.includes("im okay") || lower.includes("im fine") || lower.includes("i am okay") || lower.includes("i am fine"))) {
        confirmSafe();
        addAlert("Glad you're okay! Fall alert cancelled.");
      }
      // Set destination stop
      else if (lower.includes("my stop is") || lower.includes("destination is") || lower.includes("get off at") || lower.includes("exit at")) {
        const stopName = command.replace(/my stop is|destination is|get off at|exit at/i, "").trim();
        if (stopName.length > 1) {
          setDestination(stopName);
          addAlert(`Destination set to ${stopName}. I'll alert you when it's approaching.`);
        } else {
          addAlert("Please say the stop name. For example: My stop is Central Station.");
        }
      }
      // Prepare to exit
      else if (lower.includes("prepare to exit") || lower.includes("getting off") || lower.includes("next stop is mine")) {
        addAlert("Preparing to exit. Move toward the door carefully. Hold the handrail.");
      }
      // Add contact by voice — start the flow
      else if (lower.includes("add contact") || lower.includes("save contact") || lower.includes("new contact") || lower.includes("add number") || lower.includes("save number") || lower.includes("add phone")) {
        voiceContactModeRef.current = "awaiting_name";
        addAlert("Sure! Say the contact name. For example, say Mom, or Dad, or Doctor.");
      }
      // List saved contacts by voice
      else if (lower.includes("my contact") || lower.includes("show contact") || lower.includes("list contact") || lower.includes("who is saved")) {
        if (contacts.length === 0) {
          addAlert("You have no emergency contacts saved. Say Add contact to save one.");
        } else {
          const list = contacts.map(c => `${c.name}, ${c.phone.split("").join(" ")}`).join(". ");
          addAlert(`Your emergency contacts are: ${list}.`);
        }
      }
      // Remove contact by voice
      else if (lower.includes("remove contact") || lower.includes("delete contact")) {
        if (contacts.length === 0) {
          addAlert("You have no contacts to remove.");
        } else {
          // Remove the last added contact
          const last = contacts[contacts.length - 1];
          removeContact(last.id);
          addAlert(`Removed ${last.name} from your emergency contacts.`);
        }
      }
      // Call contact by voice
      else if (lower.includes("call") && !lower.includes("help")) {
        if (contacts.length === 0) {
          addAlert("No emergency contacts saved. Say Add contact to save one.");
        } else {
          // Check if a name is mentioned
          const match = contacts.find(c => lower.includes(c.name.toLowerCase()));
          if (match) {
            addAlert(`Calling ${match.name}…`);
            callContact(match);
          } else {
            addAlert(`Calling ${contacts[0].name}…`);
            callContact(contacts[0]);
          }
        }
      }
      // Bus info
      else if (lower.includes("bus") && (lower.includes("status") || lower.includes("nearby") || lower.includes("where"))) {
        if (buses.length === 0) {
          addAlert("No buses detected nearby.");
        } else {
          const busInfo = buses.map(b =>
            `Bus ${b.routeNumber} to ${b.destination}, ${b.etaMinutes} minutes away, ${b.status}`
          ).join(". ");
          addAlert(`Nearby buses: ${busInfo}`);
        }
      }
      // Location commands
      else if (lower.includes("where am i") || lower.includes("my location") || lower.includes("current location")) {
        if (position) {
          addAlert(`You are at latitude ${position.lat.toFixed(4)}, longitude ${position.lng.toFixed(4)}.`);
        } else {
          addAlert("I'm still trying to find your location. Please wait.");
        }
      }
      else if (lower.includes("show map") || lower.includes("open map")) {
        setShowMap(true);
        addAlert("Opening the map.");
      }
      else if (lower.includes("close map") || lower.includes("hide map")) {
        setShowMap(false);
        addAlert("Map closed.");
      }
      else if (lower.includes("save home") || lower.includes("set home") || lower.includes("mark home")) {
        if (position) {
          setHome(position.lat, position.lng);
          addAlert("Your current location has been saved as Home.");
        } else {
          addAlert("Cannot save home. Location is not available yet.");
        }
      }
      else if (lower.includes("save location") || lower.includes("save this place") || lower.includes("mark location")) {
        if (position) {
          addLocation("Saved Place", position.lat, position.lng, "custom");
          addAlert("Your current location has been saved.");
        } else {
          addAlert("Cannot save location. Location is not available yet.");
        }
      }
      else if (lower.includes("my places") || lower.includes("saved places") || lower.includes("saved location") || lower.includes("frequent location")) {
        const freq = getFrequent();
        const home = getHome();
        let msg = "";
        if (home) msg += `Home is saved. `;
        if (freq.length > 0) {
          msg += `You have ${freq.length} saved places: ${freq.map(l => l.name).join(", ")}.`;
        } else {
          msg += "No saved places yet. Say Save location to save one.";
        }
        addAlert(msg);
      }
      // Navigate to home
      else if (lower.includes("go home") || lower.includes("go back") || lower.includes("exit") || lower.includes("stop")) {
        const home = getHome();
        if (home && (lower.includes("navigate home") || lower.includes("take me home") || lower.includes("directions home"))) {
          addAlert(`Home is at latitude ${home.lat.toFixed(4)}, longitude ${home.lng.toFixed(4)}. Opening map.`);
          setShowMap(true);
        } else {
          addAlert("Stopping navigation. Going home.");
          navigate("/");
        }
      }
      // Rate trip manually
      else if (lower.includes("rate trip") || lower.includes("rate my trip") || lower.includes("trip feedback")) {
        endTrip();
      }
      // Help
      else if (lower.includes("help") || lower.includes("command") || lower.includes("what can")) {
        addAlert(
          "Available commands: Scan, Find bus, Detect seat, Bus status, Scan card, " +
          "Auto scan on, Auto scan off, Haptic on, Haptic off, " +
          "Add contact, My contacts, Call, Remove contact, Emergency, SOS, " +
          "My stop is [name], Prepare to exit, I'm okay, Rate trip, " +
          "Where am I, Show map, Save home, Save location, My places, Go home. " +
          "You can also ask me any question and I will answer."
        );
      }
      // Fallback — treat as a question for AI
      else {
        askAI(command);
      }
    },
    [addAlert, handleSOS, navigate, analyzeFrame, buses, askAI, contacts, addContact, removeContact, callContact, extractPhoneFromSpeech, position, setHome, addLocation, getHome, getFrequent, locations, scanFromDataUrl, qrSupported, fallDetected, confirmSafe, setDestination, isFeedbackActive, processFeedbackInput, cancelFeedback, endTrip]
  );

  // Auto-start continuous voice recognition
  const { isListening } = useVoiceCommand(handleVoiceCommand, true, isSpeaking);

  useEffect(() => {
    const timer = setTimeout(() => {
      speak(
        "Navigation mode active. Voice control is on. Point your camera ahead. You can ask me any question or say Help for commands."
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [speak]);

  return (
    <main
      className="flex min-h-screen flex-col"
      role="main"
      aria-label="Navigation Screen"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="text-xl font-bold text-foreground">
          EyeGuide<span className="text-primary">+</span>
        </h1>
        <div className="flex items-center gap-2 text-primary" aria-live="polite">
          <div className={`h-3 w-3 rounded-full ${isListening ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-sm font-medium">
            {isListening ? "Listening" : "Voice off"}
          </span>
        </div>
      </header>

      {/* Camera Feed - click to toggle size */}
      <section
        className={`relative flex items-start gap-3 p-3 bg-card border-b border-border cursor-pointer ${cameraExpanded ? "flex-col" : ""}`}
        aria-label="Camera feed — tap to enlarge"
        onClick={() => setCameraExpanded((prev) => !prev)}
      >
        <div className={`relative rounded-xl overflow-hidden border border-border shrink-0 transition-all duration-300 ${cameraExpanded ? "w-full h-[300px]" : "w-32 h-24"}`}>
          <CameraFeed ref={cameraRef} />
        </div>
        {!cameraExpanded && (
          <div className="flex-1 flex items-center gap-2 min-h-[96px]">
            {aiScanning ? (
              <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            )}
            <span className="text-sm text-foreground" aria-live="polite">
              {aiScanning
                ? "🤖 AI analyzing frame…"
                : aiThinking
                  ? "🤖 AI thinking…"
                  : isListening
                    ? "🎙️ Listening — say a command or ask anything"
                    : "Camera active"}
            </span>
          </div>
        )}
        {cameraExpanded && (
          <div className="absolute bottom-6 left-6 right-6 flex items-center gap-2 bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border">
            <Camera className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Tap to minimize</span>
          </div>
        )}
      </section>

      {/* Location Map */}
      {showMap && (
        <section className="h-[250px] border-t border-border" aria-label="Location map">
          <LocationMap position={position} savedLocations={locations} error={geoError} />
        </section>
      )}

      {/* Location status bar */}
      <section className="flex items-center gap-2 px-4 py-2 bg-card border-t border-border" aria-label="Location status">
        <MapPin className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-xs text-muted-foreground truncate">
          {position
            ? `📍 ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
            : geoError
              ? `Location: ${geoError}`
              : "Locating…"}
          {!showMap && " — Say \"Show map\" to view"}
        </span>
      </section>

      {/* Boarding Assistance Banner */}
      {boardingState.phase !== "idle" && (
        <section
          className={`px-4 py-3 border-t border-border flex flex-col gap-2 ${
            boardingState.phase === "seated"
              ? "bg-green-500/10 border-green-500/30"
              : boardingState.phase === "exiting"
                ? "bg-red-500/10 border-red-500/30"
                : boardingState.phase === "post_exit"
                  ? "bg-blue-500/10 border-blue-500/30"
                  : boardingState.phase === "boarding"
                    ? "bg-orange-500/10 border-orange-500/30"
                    : "bg-primary/10 border-primary/30"
          }`}
          aria-live="assertive"
          aria-label="Bus boarding assistance"
        >
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full shrink-0 animate-pulse ${
              boardingState.phase === "seated" ? "bg-green-500"
                : boardingState.phase === "exiting" ? "bg-red-500"
                : boardingState.phase === "post_exit" ? "bg-blue-500"
                : boardingState.phase === "boarding" ? "bg-orange-500"
                : "bg-primary"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {boardingState.phase === "post_exit" ? "🚶" : "🚌"} {boardingState.phase === "post_exit" ? "Outdoor Navigation" : "Boarding Assistant"} — {boardingState.phase.replace("_", " ").toUpperCase()}
                {boardingState.busRoute && ` (Route ${boardingState.busRoute})`}
              </p>
              <p className="text-xs text-muted-foreground">{boardingState.instructions}</p>
            </div>
            {(boardingState.phase === "seated" || boardingState.phase === "post_exit") && (
              <button
                onClick={() => resetBoarding()}
                className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-accent"
              >
                Done
              </button>
            )}
          </div>
          {boardingState.phase === "finding_seat" && boardingState.lastSeatDirection && (
            <p className="text-xs text-primary font-medium ml-6">
              💺 Seat spotted: {boardingState.lastSeatDirection}
            </p>
          )}
          {boardingState.phase === "seated" && boardingState.nextStop && (
            <p className="text-xs text-foreground font-medium ml-6">
              📍 Next stop: {boardingState.nextStop}
              {boardingState.isApproachingDestination && (
                <span className="text-red-500 font-bold animate-pulse ml-2">⚠️ YOUR STOP IS NEXT!</span>
              )}
            </p>
          )}
          {boardingState.phase === "seated" && boardingState.destinationStop && (
            <p className="text-xs text-muted-foreground ml-6">
              🎯 Destination: {boardingState.destinationStop}
            </p>
          )}
        </section>
      )}

      {/* Fall Detection Alert */}
      {fallDetected && (
        <section
          className="px-4 py-3 border-t border-destructive bg-destructive/15 flex items-center gap-3"
          aria-live="assertive"
        >
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">Fall Detected!</p>
            <p className="text-xs text-muted-foreground">Say "I'm okay" or tap below to cancel the alert.</p>
          </div>
          <button
            onClick={() => { confirmSafe(); addAlert("Fall alert cancelled. Glad you're okay!"); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-semibold"
          >
            I'm Okay
          </button>
        </section>
      )}

      {/* Bus Tracker */}
      <section className="p-4 bg-card border-t border-border" aria-label="Nearby buses">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            🚌 Nearby Buses
          </h2>
          <button
            onClick={() => handleVoiceCommand("scan card")}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            aria-label="Scan transit card"
          >
            <QrCode className="h-3.5 w-3.5" />
            Scan Card
          </button>
        </div>
        <BusTracker buses={buses} />
        {lastScan && (
          <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-between">
            <p className="text-xs text-foreground">
              ✅ Last scan: <span className="font-mono">{lastScan.rawValue.slice(0, 40)}</span>
            </p>
            <button onClick={clearScan} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
        )}
      </section>

      {/* Trip Feedback Banner */}
      {isFeedbackActive && (
        <section
          className="px-4 py-3 border-t border-border bg-accent/20 flex items-center gap-3"
          aria-live="assertive"
          aria-label="Trip feedback"
        >
          <span className="text-lg" aria-hidden="true">⭐</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Trip Feedback — {feedbackState.phase === "rating" ? "Rate 1-5" : feedbackState.phase === "comment" ? "Any comments?" : "Save route?"}
            </p>
            <p className="text-xs text-muted-foreground">
              {feedbackState.phase === "rating" && "Say a number from 1 to 5, or say Skip."}
              {feedbackState.phase === "comment" && "Describe your trip, or say Skip."}
              {feedbackState.phase === "save_route" && "Say Yes to save this route, or No."}
            </p>
          </div>
          <button
            onClick={cancelFeedback}
            className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-accent"
          >
            Skip
          </button>
        </section>
      )}

      {/* Quick Action Buttons */}
      <QuickActions
        onAction={handleVoiceCommand}
        autoScan={autoScan}
        hapticEnabled={hapticEnabled}
        showMap={showMap}
        onOpenManage={() => setShowManage(true)}
      />

      {/* Voice Transcript Box */}
      {voiceTranscripts.length > 0 && (
        <section className="mx-4 mb-2 p-3 bg-muted/50 border border-border rounded-lg max-h-28 overflow-y-auto" aria-label="Voice transcripts">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Voice Input</p>
          {voiceTranscripts.map((t, i) => (
            <p key={i} className={`text-xs ${i === 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{t}</p>
          ))}
        </section>
      )}

      {/* Alert Log */}
      <section className="p-4 bg-card border-t border-border" aria-label="Audio alerts">
        <AlertLog alerts={alerts} />
      </section>

      {/* Minimal status footer */}
      <footer className="p-3 bg-background border-t border-border text-center" aria-live="polite">
        <p className="text-xs text-muted-foreground">
          🎙️ Voice-only mode — Ask anything or say "Help" • {autoScan ? "Auto-scan ON" : "Auto-scan OFF"} • Haptic {hapticEnabled ? "ON" : "OFF"}
        </p>
      </footer>

      {showContacts && (
        <EmergencyContacts
          contacts={contacts}
          onAdd={addContact}
          onRemove={removeContact}
          onCall={callContact}
          onClose={() => setShowContacts(false)}
        />
      )}

      {showManage && (
        <ManagePanel
          contacts={contacts}
          onAddContact={addContact}
          onRemoveContact={removeContact}
          onCallContact={callContact}
          locations={locations}
          onSetHome={setHome}
          onAddLocation={addLocation}
          onRemoveLocation={removeLocation}
          position={position}
          onClose={() => setShowManage(false)}
        />
      )}
    </main>
  );
};

export default Navigate;
