import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Camera, Eye, Vibrate, Volume2, VolumeX, Loader2 } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import CameraFeed, { CameraFeedRef } from "@/components/CameraFeed";
import AlertLog from "@/components/AlertLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMockBusTracker } from "@/hooks/useMockBusTracker";
import BusTracker from "@/components/BusTracker";

const Navigate = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [busTrackingActive, setBusTrackingActive] = useState(true);
  const { buses } = useMockBusTracker(busTrackingActive);
  const autoScanRef = useRef(false);
  const cameraRef = useRef<CameraFeedRef>(null);
  const scanningRef = useRef(false);
  const [alerts, setAlerts] = useState<string[]>([
    "Navigation active. Scanning surroundings…",
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
      const { data, error } = await supabase.functions.invoke("detect-objects", {
        body: { image: frame },
      });

      if (error) {
        console.error("Detection error:", error);
        toast.error("AI detection failed");
        return;
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
  }, [addAlert, hapticEnabled]);

  // Auto-scan loop
  useEffect(() => {
    autoScanRef.current = autoScan;
    if (!autoScan) return;

    const interval = setInterval(() => {
      if (autoScanRef.current && !scanningRef.current) {
        analyzeFrame();
      }
    }, 8000); // every 8 seconds

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
  }, [addAlert]);

  const handleVoiceCommand = useCallback(
    (command: string) => {
      const lower = command.toLowerCase();
      if (lower.includes("find") && lower.includes("bus")) {
        addAlert("Scanning for buses…");
        analyzeFrame();
      } else if (lower.includes("detect") && lower.includes("seat")) {
        addAlert("Scanning for available seats…");
        analyzeFrame();
      } else if (lower.includes("emergency") || lower.includes("sos")) {
        handleSOS();
      } else if (lower.includes("stop")) {
        addAlert("Stopping navigation.");
        navigate("/");
      }
    },
    [addAlert, handleSOS, navigate, analyzeFrame]
  );

  const { isListening, startListening } = useVoiceCommand(handleVoiceCommand);

  useEffect(() => {
    speak("Navigation mode active. Point your camera ahead.");
  }, [speak]);

  return (
    <main
      className="flex min-h-screen flex-col"
      role="main"
      aria-label="Navigation Screen"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-card">
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate("/")}
          aria-label="Go back to home"
          className="focus-ring text-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">
          EyeGuide<span className="text-primary">+</span>
        </h1>
        <Button
          variant="ghost"
          size="default"
          onClick={startListening}
          aria-label={isListening ? "Listening" : "Activate voice command"}
          className="focus-ring"
        >
          <Volume2 className={`h-6 w-6 ${isListening ? "text-primary animate-pulse" : "text-foreground"}`} />
        </Button>
      </header>

      {/* Camera Feed */}
      <section className="relative flex-1 min-h-[300px]" aria-label="Camera feed">
        <CameraFeed ref={cameraRef} />
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border">
          {aiScanning ? (
            <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          )}
          <span className="text-sm text-foreground" aria-live="polite">
            {aiScanning
              ? "🤖 AI analyzing frame…"
              : isListening
                ? "🎙️ Listening for commands…"
                : "Camera active — scanning"}
          </span>
        </div>
      </section>

      {/* Bus Tracker */}
      <section className="p-4 bg-card border-t border-border" aria-label="Nearby buses">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
          🚌 Nearby Buses
        </h2>
        <BusTracker buses={buses} />
      </section>

      {/* Alert Log */}
      <section className="p-4 bg-card border-t border-border" aria-label="Audio alerts">
        <AlertLog alerts={alerts} />
      </section>

      {/* Controls */}
      <footer className="p-4 bg-background border-t border-border space-y-3">
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 focus-ring"
            onClick={() => {
              setHapticEnabled(!hapticEnabled);
              speak(hapticEnabled ? "Haptic feedback off" : "Haptic feedback on");
            }}
            aria-label={`Haptic feedback ${hapticEnabled ? "enabled" : "disabled"}`}
            aria-pressed={hapticEnabled}
          >
            <Vibrate className={`h-5 w-5 mr-2 ${hapticEnabled ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
            {hapticEnabled ? "Haptic On" : "Haptic Off"}
          </Button>

          <Button
            variant={autoScan ? "nav" : "outline"}
            size="lg"
            className="flex-1 focus-ring"
            onClick={() => {
              const next = !autoScan;
              setAutoScan(next);
              speak(next ? "Auto scan enabled" : "Auto scan disabled");
              if (next) analyzeFrame();
            }}
            aria-label={autoScan ? "Auto scan enabled" : "Auto scan disabled"}
            aria-pressed={autoScan}
          >
            <Eye className={`h-5 w-5 mr-2 ${autoScan ? "" : "text-muted-foreground"}`} aria-hidden="true" />
            {autoScan ? "AI On" : "AI Off"}
          </Button>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 focus-ring"
            onClick={() => {
              analyzeFrame();
            }}
            disabled={aiScanning}
            aria-label="Scan now with AI"
          >
            {aiScanning ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5 mr-2 text-accent" aria-hidden="true" />
            )}
            {aiScanning ? "Scanning…" : "Scan Now"}
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="flex-1 focus-ring"
            onClick={startListening}
            aria-label="Activate voice command"
          >
            {isListening ? (
              <VolumeX className="h-5 w-5 mr-2 text-primary animate-pulse" aria-hidden="true" />
            ) : (
              <Volume2 className="h-5 w-5 mr-2" aria-hidden="true" />
            )}
            {isListening ? "Listening…" : "Voice"}
          </Button>
        </div>

        <Button
          variant="sos"
          size="xl"
          className="w-full focus-ring"
          onClick={handleSOS}
          aria-label="Emergency SOS. Double tap to activate."
        >
          <AlertTriangle className="h-8 w-8 mr-2" aria-hidden="true" />
          EMERGENCY SOS
        </Button>
      </footer>
    </main>
  );
};

export default Navigate;
