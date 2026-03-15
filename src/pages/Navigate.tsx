// @refresh reset
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Camera, Eye, Globe, Loader2, MapPin, Mic, MicOff, QrCode } from "lucide-react";
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
import { useEdgeCaseDetection } from "@/hooks/useEdgeCaseDetection";
import { useLanguage, SUPPORTED_LANGUAGES } from "@/hooks/useLanguage";

const Navigate = () => {
  const navigate = useNavigate();
  const { speak, isSpeaking, setLang } = useSpeech();
  const { language, setLanguage, autoDetectAndSwitch, languages } = useLanguage();
  const [showLangPicker, setShowLangPicker] = useState(false);
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
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
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

  // Edge-case detection (camera obstruction, low battery, missed stop, GPS cross-check)
  const {
    edgeCaseState,
    checkFrameBrightness,
    triggerMissedStop,
    clearMissedStop,
    crossCheckBusRoute,
    scanIntervalMultiplier,
  } = useEdgeCaseDetection(speak, hapticEnabled);

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
      clearMissedStop();
    }
    prevPhaseRef.current = boardingState.phase;
  }, [boardingState.phase, boardingState.busRoute, startTrip, endTrip, clearMissedStop]);

  // Missed stop detection: if we were approaching destination and now we're not
  const wasApproachingRef = useRef(false);
  useEffect(() => {
    if (boardingState.isApproachingDestination) {
      wasApproachingRef.current = true;
    }
    if (
      wasApproachingRef.current &&
      !boardingState.isApproachingDestination &&
      boardingState.phase === "seated" &&
      boardingState.destinationStop
    ) {
      // We passed the destination
      const nextBus = buses.find((b) => b.status === "approaching" || b.status === "departed");
      const nextMsg = nextBus
        ? `Next Bus ${nextBus.routeNumber} arrives in ${nextBus.etaMinutes} minutes. Stay seated.`
        : "Stay seated. I'll find the next option.";
      triggerMissedStop(boardingState.destinationStop, nextMsg);
      wasApproachingRef.current = false;
    }
  }, [boardingState.isApproachingDestination, boardingState.phase, boardingState.destinationStop, buses, triggerMissedStop]);

  const addAlert = useCallback(
    (message: string, vibrate = true, priority: "normal" | "high" = "normal", spoken = true) => {
      setAlerts((prev) => [message, ...prev].slice(0, 20));
      if (spoken) {
        speak(message, priority, language.voiceLang);
      }
      if (vibrate && hapticEnabled && navigator.vibrate) {
        navigator.vibrate(priority === "high" ? [300, 100, 300] : 200);
      }
    },
    [speak, hapticEnabled, language.voiceLang]
  );

  const analyzeFrame = useCallback(async () => {
    if (scanningRef.current || aiThinking) return;
    const frame = cameraRef.current?.captureFrame();
    if (!frame) return;

    scanningRef.current = true;
    setAiScanning(true);

    // Check for camera obstruction
    checkFrameBrightness(frame);

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
        // GPS cross-check for unreadable bus number
        if (data.alert && (data.alert.toLowerCase().includes("unclear") || data.alert.toLowerCase().includes("unreadable") || data.alert.toLowerCase().includes("can't read"))) {
          const confirmedRoute = crossCheckBusRoute(buses);
          if (confirmedRoute) {
            processDetection({ ...data, boarding_phase_hint: "detected" });
          } else {
            processDetection(data);
          }
        } else {
          processDetection(data);
        }
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

  const lastAiCallRef = useRef<number>(0);
  const AI_COOLDOWN_MS = 4000; // 4 second cooldown between AI calls

  const askAI = useCallback(async (question: string) => {
    // Skip very short or meaningless transcripts — don't speak, just log
    const trimmed = question.trim();
    if (trimmed.length < 6 || trimmed.split(/\s+/).length < 3) {
      // Silently ignore — don't interrupt with "I heard..." messages
      return;
    }

    // Client-side rate limiting
    const now = Date.now();
    if (now - lastAiCallRef.current < AI_COOLDOWN_MS) {
      return; // silently skip, too soon
    }
    lastAiCallRef.current = now;

    setAiThinking(true);
    addAlert("Thinking…", false, "normal", false); // visual only, no speech
    try {
      const { data, error } = await supabase.functions.invoke("ask-ai", {
        body: { question: trimmed, language: language.shortCode },
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
  }, [addAlert, language.shortCode]);

  // Auto-scan loop — uses boarding state interval when boarding is active
  useEffect(() => {
    autoScanRef.current = autoScan;
    const shouldAutoScan = autoScan || isBoarding;
    if (!shouldAutoScan) return;

    const interval = setInterval(() => {
      if ((autoScanRef.current || isBoarding) && !scanningRef.current) {
        analyzeFrame();
      }
    }, isBoarding ? boardingState.autoScanInterval * scanIntervalMultiplier : 8000 * scanIntervalMultiplier);

    return () => clearInterval(interval);
  }, [autoScan, analyzeFrame, isBoarding, boardingState.autoScanInterval]);

  // Bus arrival voice alerts
  // Auto-announce only at 3-minute intervals when a bus is very close (<100m, arriving)
  // User can triple-tap to hear bus status on demand
  const hapticCleanupRef = useRef<(() => void) | null>(null);
  const closestBusRef = useRef<number>(Infinity);
  const lastBusAnnouncementRef = useRef<number>(0);
  const BUS_ANNOUNCE_INTERVAL = 180000; // 3 minutes

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

  // Periodic auto-announce (every 3 min) for imminent buses only
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const imminentBuses = buses.filter(
        (b) => b.status === "arriving" && b.distanceMeters < 100 && b.etaMinutes <= 1
      );
      if (imminentBuses.length > 0 && now - lastBusAnnouncementRef.current >= BUS_ANNOUNCE_INTERVAL) {
        lastBusAnnouncementRef.current = now;
        const bus = imminentBuses[0];
        addAlert(
          `🚌 Bus ${bus.routeNumber} to ${bus.destination} is arriving! ${bus.distanceMeters} meters away.`,
          true
        );
        if (hapticEnabled && navigator.vibrate) {
          navigator.vibrate(getProximityVibration(bus.distanceMeters));
        }
      }
    }, 10000); // check every 10s but only announce per interval
    return () => clearInterval(interval);
  }, [buses, addAlert, hapticEnabled]);

  // Triple-tap to announce bus status on demand
  const tapTimestampsRef = useRef<number[]>([]);
  const announceBusStatus = useCallback(() => {
    if (buses.length === 0) {
      speak("No buses nearby at the moment.");
      return;
    }
    const arriving = buses.filter((b) => b.status === "arriving");
    if (arriving.length > 0) {
      const msg = arriving
        .map((b) => `Bus ${b.routeNumber} to ${b.destination}, ${b.distanceMeters} meters away, arriving in ${b.etaMinutes} minute${b.etaMinutes !== 1 ? "s" : ""}`)
        .join(". ");
      speak(msg);
      addAlert(`🚌 ${msg}`);
    } else {
      const closest = [...buses].sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
      speak(`Nearest bus: ${closest.routeNumber} to ${closest.destination}, ${closest.distanceMeters} meters away, arriving in ${closest.etaMinutes} minutes.`);
    }
    lastBusAnnouncementRef.current = Date.now();
  }, [buses, speak, addAlert]);

  const handleTripleTap = useCallback(() => {
    const now = Date.now();
    tapTimestampsRef.current.push(now);
    // Keep only taps within last 1 second
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t < 1000);
    if (tapTimestampsRef.current.length >= 3) {
      tapTimestampsRef.current = [];
      announceBusStatus();
    }
  }, [announceBusStatus]);

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

      // ---- Tamil commands (check first since Tamil Unicode is unambiguous) ----
      // "என் பஸ் காண்பி" → Find my bus
      if (command.includes("என் பஸ்") || command.includes("காண்பி") || command.includes("பஸ் கண்டுபிடி")) {
        addAlert("பஸ்களைத் தேடுகிறேன்…");
        analyzeFrame();
      }
      // "பஸ் [number] கண்காணி" → Track bus
      else if (command.includes("கண்காணி") || command.includes("பஸ் நிலை")) {
        const busNum = command.match(/\d+/)?.[0];
        if (busNum) {
          const bus = buses.find(b => b.routeNumber === busNum);
          if (bus) {
            addAlert(`பஸ் ${bus.routeNumber} ${bus.destination} நோக்கி, ${bus.distanceMeters} மீட்டர் தொலைவில், ${bus.etaMinutes} நிமிடத்தில் வரும்.`);
          } else {
            addAlert(`பஸ் ${busNum} தற்போது அருகில் இல்லை.`);
          }
        } else {
          const busInfo = buses.map(b => `பஸ் ${b.routeNumber} ${b.destination} நோக்கி, ${b.etaMinutes} நிமிடம்`).join(". ");
          addAlert(busInfo || "அருகில் பஸ்கள் இல்லை.");
        }
      }
      // "அவசரம்" → Emergency SOS
      else if (command.includes("அவசரம்") || command.includes("உதவி")) {
        handleSOS();
      }
      // "நேவிகேஷன் நிறுத்து" / "நிறுத்து" → Stop navigation
      else if (command.includes("நிறுத்து") || command.includes("வீட்டுக்கு")) {
        addAlert("வழிசெலுத்தல் நிறுத்தப்பட்டது. முகப்புக்குச் செல்கிறேன்.");
        navigate("/");
      }
      // "எந்த பஸ்கள் அருகில் உள்ளன?" → Nearby buses
      else if (command.includes("அருகில்") || command.includes("பஸ்கள்")) {
        if (buses.length === 0) {
          addAlert("அருகில் பஸ்கள் இல்லை.");
        } else {
          const busInfo = buses.map(b => `பஸ் ${b.routeNumber} ${b.destination} நோக்கி, ${b.distanceMeters} மீட்டர், ${b.etaMinutes} நிமிடம்`).join(". ");
          addAlert(`அருகிலுள்ள பஸ்கள்: ${busInfo}`);
        }
      }
      // "நான் எங்கே இருக்கிறேன்?" → Where am I
      else if (command.includes("எங்கே") || command.includes("இருப்பிடம்")) {
        if (position) {
          addAlert(`நீங்கள் அட்சரேகை ${position.lat.toFixed(4)}, தீர்க்கரேகை ${position.lng.toFixed(4)} இல் உள்ளீர்கள்.`);
        } else {
          addAlert("உங்கள் இருப்பிடத்தைக் கண்டறிகிறேன். காத்திருக்கவும்.");
        }
      }
      // "ஸ்கேன்" → Scan
      else if (command.includes("ஸ்கேன்") || command.includes("பார்")) {
        addAlert("சுற்றுப்புறத்தை ஸ்கேன் செய்கிறேன்…");
        analyzeFrame();
      }
      // ---- Regular English commands ----
      // Transit card scanning
      else if (lower.includes("scan card") || lower.includes("scan ticket") || lower.includes("transit card") || lower.includes("scan pass")) {
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
        addAlert("Scanning for buses…", false, "normal", false);
        analyzeFrame();
      } else if (lower.includes("detect") && lower.includes("seat")) {
        addAlert("Scanning for seats…", false, "normal", false);
        analyzeFrame();
      } else if (lower.includes("scan") || lower.includes("look") || lower.includes("what") && lower.includes("see")) {
        addAlert("Scanning…", false, "normal", false);
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
      // Camera toggle
      else if (lower.includes("camera on") || lower.includes("turn on camera") || lower.includes("enable camera") || lower.includes("start camera")) {
        setCameraOn(true);
        addAlert("Camera turned on.");
      } else if (lower.includes("camera off") || lower.includes("turn off camera") || lower.includes("disable camera") || lower.includes("stop camera")) {
        setCameraOn(false);
        addAlert("Camera turned off.");
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
      // Help — short spoken summary only
      else if (lower.includes("help") || lower.includes("command") || lower.includes("what can")) {
        addAlert("Say: Scan, Find bus, Bus status, Emergency, Camera on, Camera off, Mic on, Mic off, or ask me anything.");
      }
      // Mic toggle via voice — silent, visual-only feedback
      else if (lower.includes("mic off") || lower.includes("mike off") || lower.includes("mute mic") || lower.includes("stop listening")) {
        setMicEnabled(false);
        addAlert("Microphone off.", false, "normal", false);
      } else if (lower.includes("mic on") || lower.includes("mike on") || lower.includes("unmute mic") || lower.includes("start listening")) {
        setMicEnabled(true);
        addAlert("Microphone on.", false, "normal", false);
      }
      // Language switching
      else if (lower.includes("switch to") || lower.includes("change language") || lower.includes("speak in")) {
        const matchedLang = languages.find(l =>
          lower.includes(l.name.toLowerCase().split(" ")[0]) ||
          lower.includes(l.shortCode)
        );
        if (matchedLang) {
          setLanguage(matchedLang);
          speak(`Language changed to ${matchedLang.name}`, "high", matchedLang.voiceLang);
          addAlert(`🌐 Language: ${matchedLang.name}`);
        } else {
          addAlert("Available languages: English, Tamil, Hindi, Telugu, Kannada, Malayalam, Spanish, French, Arabic, Chinese. Say Switch to Tamil, for example.");
        }
      }
      // Fallback — treat as a question for AI
      else {
        askAI(command);
      }
    },
    [addAlert, handleSOS, navigate, analyzeFrame, buses, askAI, contacts, addContact, removeContact, callContact, extractPhoneFromSpeech, position, setHome, addLocation, getHome, getFrequent, locations, scanFromDataUrl, qrSupported, fallDetected, confirmSafe, setDestination, isFeedbackActive, processFeedbackInput, cancelFeedback, endTrip, languages, setLanguage, speak]
  );

  // Sync TTS language
  useEffect(() => {
    setLang(language.voiceLang);
  }, [language.voiceLang, setLang]);

  // Spoken confirmations for language auto-switch in each language
  const LANG_SWITCH_CONFIRMATIONS: Record<string, string> = {
    ta: "மொழி தமிழுக்கு மாற்றப்பட்டது",
    hi: "भाषा हिन्दी में बदल दी गई",
    te: "భాష తెలుగుకు మార్చబడింది",
    kn: "ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ",
    ml: "ഭാഷ മലയാളത്തിലേക്ക് മാറ്റി",
    es: "Idioma cambiado a español",
    fr: "Langue changée en français",
    ar: "تم تغيير اللغة إلى العربية",
    zh: "语言已切换为中文",
    en: "Language switched to English",
  };

  // Auto-detect language from raw transcript
  const prevLangRef = useRef(language.shortCode);
  const handleTranscriptRaw = useCallback((transcript: string) => {
    const before = prevLangRef.current;
    const detected = autoDetectAndSwitch(transcript);
    if (detected.shortCode !== before) {
      prevLangRef.current = detected.shortCode;
      const confirmation = LANG_SWITCH_CONFIRMATIONS[detected.shortCode] || `Language switched to ${detected.name}`;
      speak(confirmation, "high", detected.voiceLang);
      addAlert(`🌐 ${confirmation}`);
    }
  }, [autoDetectAndSwitch, addAlert, speak]);

  // Auto-start continuous voice recognition with selected language
  const { isListening, startListening, stopListening } = useVoiceCommand(handleVoiceCommand, micEnabled, isSpeaking, language.code, handleTranscriptRaw);

  // Sync mic state with voice recognition
  useEffect(() => {
    if (micEnabled) {
      startListening();
    } else {
      stopListening();
    }
  }, [micEnabled, startListening, stopListening]);

  useEffect(() => {
    const timer = setTimeout(() => {
      speak("Navigation active. Say Help for commands.");
    }, 500);
    return () => clearTimeout(timer);
  }, [speak]);

  return (
    <main
      className="flex min-h-screen flex-col"
      role="main"
      aria-label="Navigation Screen"
      onTouchStart={handleTripleTap}
      onClick={handleTripleTap}
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="text-xl font-bold text-foreground">
          EyeGuide<span className="text-primary">+</span>
        </h1>
        <div className="flex items-center gap-3">
          {/* Language Picker */}
          <div className="relative">
            <button
              onClick={() => setShowLangPicker(prev => !prev)}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-bold shadow-md"
              aria-label={`Language: ${language.name}. Tap to change.`}
            >
              <Globe className="h-5 w-5" />
              {language.name.split(" ")[0]}
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-card border-2 border-primary/20 rounded-2xl shadow-2xl py-2 min-w-[220px] max-h-[350px] overflow-y-auto">
                <p className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Voice Language</p>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang);
                      setLang(lang.voiceLang);
                      setShowLangPicker(false);
                      speak(`Language changed to ${lang.name}`, "high", lang.voiceLang);
                      addAlert(`🌐 AI Language: ${lang.name}`);
                    }}
                    className={`w-full text-left px-4 py-3 text-base hover:bg-accent transition-colors ${
                      lang.code === language.code ? "text-primary font-bold bg-primary/10" : "text-foreground"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setMicEnabled(prev => !prev)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl transition-colors font-bold shadow-md ${
              micEnabled ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            }`}
            aria-label={micEnabled ? "Microphone on. Tap to mute." : "Microphone off. Tap to unmute."}
          >
            {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            {micEnabled ? (isListening ? "Listening" : "Mic On") : "Mic Off"}
          </button>
        </div>
      </header>

      {/* Camera Feed - click to toggle size */}
      <section
        className={`relative flex items-start gap-3 p-3 bg-card border-b border-border cursor-pointer ${cameraExpanded ? "flex-col" : ""}`}
        aria-label="Camera feed — tap to enlarge"
        onClick={() => cameraOn && setCameraExpanded((prev) => !prev)}
      >
        <div className={`relative rounded-xl overflow-hidden border border-border shrink-0 transition-all duration-300 ${cameraExpanded ? "w-full h-[300px]" : "w-32 h-24"}`}>
          {cameraOn ? (
            <CameraFeed ref={cameraRef} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-muted gap-2 p-4">
              <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground text-center">Camera off</p>
            </div>
          )}
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

      {/* Camera Obstruction Alert */}
      {edgeCaseState.cameraObstructed && (
        <section className="px-4 py-3 border-t border-border bg-accent/20 flex items-center gap-3" aria-live="assertive">
          <Camera className="h-5 w-5 text-accent-foreground shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">📷 Camera Obstructed</p>
            <p className="text-xs text-muted-foreground">Hold phone outward or clip it to your chest.</p>
          </div>
        </section>
      )}

      {/* Low Battery Alert */}
      {edgeCaseState.powerSaving && (
        <section className="px-4 py-3 border-t border-border bg-accent/20 flex items-center gap-3" aria-live="polite">
          <span className="text-lg" aria-hidden="true">🔋</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Power-Saving Mode — {edgeCaseState.batteryLevel}%</p>
            <p className="text-xs text-muted-foreground">Scan frequency reduced. Emergency features still active.</p>
          </div>
        </section>
      )}

      {/* Missed Stop Alert */}
      {edgeCaseState.missedStop && (
        <section className="px-4 py-3 border-t border-destructive bg-destructive/10 flex items-center gap-3" aria-live="assertive">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">Missed Stop: {edgeCaseState.missedStopName}</p>
            <p className="text-xs text-muted-foreground">Stay seated. I'll guide you to the next option.</p>
          </div>
          <button
            onClick={clearMissedStop}
            className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-accent"
          >
            Dismiss
          </button>
        </section>
      )}

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
        cameraOn={cameraOn}
        micEnabled={micEnabled}
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
          🎙️ Voice-only mode — {language.name} • Ask anything or say "Help" • {autoScan ? "Auto-scan ON" : "Auto-scan OFF"} • Haptic {hapticEnabled ? "ON" : "OFF"}
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
