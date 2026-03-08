import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Camera, Eye, Loader2, MapPin } from "lucide-react";
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

const Navigate = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [busTrackingActive, setBusTrackingActive] = useState(true);
  const [showContacts, setShowContacts] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const { buses } = useMockBusTracker(busTrackingActive);
  const { contacts, addContact, removeContact, callContact, callAll } = useEmergencyContacts();
  const { boardingState, processDetection, getPromptContext, reset: resetBoarding, isBoarding } = useBusBoarding(speak, hapticEnabled);
  const { position, error: geoError } = useGeolocation(true);
  const { locations, setHome, addLocation, removeLocation, getHome, getFrequent } = useSavedLocations();
  const [showMap, setShowMap] = useState(false);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const autoScanRef = useRef(false);
  const cameraRef = useRef<CameraFeedRef>(null);
  const scanningRef = useRef(false);
  // Voice contact addition state machine: "idle" | "awaiting_name" | "awaiting_phone"
  const voiceContactModeRef = useRef<"idle" | "awaiting_name" | "awaiting_phone">("idle");
  const pendingContactNameRef = useRef("");
  const [alerts, setAlerts] = useState<string[]>([
    "Navigation active. Voice control enabled.",
  ]);

  const addAlert = useCallback(
    (message: string, vibrate = true) => {
      setAlerts((prev) => [message, ...prev].slice(0, 20));
      speak(message);
      if (vibrate && hapticEnabled && navigator.vibrate) {
        navigator.vibrate(200);
      }
    },
    [speak, hapticEnabled]
  );

  const analyzeFrame = useCallback(async () => {
    if (scanningRef.current) return;
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
        addAlert(`🤖 ${data.answer}`);
      }
    } catch (e) {
      console.error("Ask AI error:", e);
      addAlert("Sorry, something went wrong with my answer.");
    } finally {
      setAiThinking(false);
    }
  }, [addAlert]);

  // Auto-scan loop
  useEffect(() => {
    autoScanRef.current = autoScan;
    if (!autoScan) return;

    const interval = setInterval(() => {
      if (autoScanRef.current && !scanningRef.current) {
        analyzeFrame();
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [autoScan, analyzeFrame]);

  // Bus arrival voice alerts
  const prevBusesRef = useRef<string[]>([]);
  useEffect(() => {
    const arrivingNow = buses.filter((b) => b.status === "arriving");
    const newArrivals = arrivingNow.filter(
      (b) => !prevBusesRef.current.includes(b.id)
    );
    newArrivals.forEach((bus) => {
      addAlert(
        `🚌 Bus ${bus.routeNumber} to ${bus.destination} is arriving! ${bus.distanceMeters} meters away.`,
        true
      );
    });
    prevBusesRef.current = arrivingNow.map((b) => b.id);
  }, [buses, addAlert]);

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
      // Navigation commands
      if (lower.includes("find") && lower.includes("bus")) {
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
      // Help
      else if (lower.includes("help") || lower.includes("command") || lower.includes("what can")) {
        addAlert(
          "Available commands: Scan, Find bus, Detect seat, Bus status, " +
          "Auto scan on, Auto scan off, Haptic on, Haptic off, " +
          "Add contact, My contacts, Call, Remove contact, Emergency, SOS, " +
          "Where am I, Show map, Save home, Save location, My places, Go home. " +
          "You can also ask me any question and I will answer."
        );
      }
      // Fallback — treat as a question for AI
      else {
        askAI(command);
      }
    },
    [addAlert, handleSOS, navigate, analyzeFrame, buses, askAI, contacts, addContact, removeContact, callContact, extractPhoneFromSpeech, position, setHome, addLocation, getHome, getFrequent, locations]
  );

  // Auto-start continuous voice recognition
  const { isListening } = useVoiceCommand(handleVoiceCommand, true);

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

      {/* Bus Tracker */}
      <section className="p-4 bg-card border-t border-border" aria-label="Nearby buses">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
          🚌 Nearby Buses
        </h2>
        <BusTracker buses={buses} />
      </section>

      {/* Quick Action Buttons */}
      <QuickActions
        onAction={handleVoiceCommand}
        autoScan={autoScan}
        hapticEnabled={hapticEnabled}
        showMap={showMap}
        onOpenManage={() => setShowManage(true)}
      />

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
