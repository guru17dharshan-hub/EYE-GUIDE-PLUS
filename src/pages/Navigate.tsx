import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Camera, Vibrate, Volume2, VolumeX } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import CameraFeed from "@/components/CameraFeed";
import AlertLog from "@/components/AlertLog";

const Navigate = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([
    "Navigation active. Scanning surroundings…",
  ]);

  const addAlert = useCallback(
    (message: string) => {
      setAlerts((prev) => [message, ...prev].slice(0, 20));
      speak(message);
      if (hapticEnabled && navigator.vibrate) {
        navigator.vibrate(200);
      }
    },
    [speak, hapticEnabled]
  );

  const handleSOS = useCallback(() => {
    addAlert("EMERGENCY SOS ACTIVATED. Contacting emergency services.");
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
  }, [addAlert]);

  const handleVoiceCommand = useCallback(
    (command: string) => {
      const lower = command.toLowerCase();
      if (lower.includes("find") && lower.includes("bus")) {
        addAlert("Searching for nearby buses…");
      } else if (lower.includes("detect") && lower.includes("seat")) {
        addAlert("Scanning for available seats…");
      } else if (lower.includes("emergency") || lower.includes("sos")) {
        handleSOS();
      } else if (lower.includes("stop")) {
        addAlert("Stopping navigation.");
        navigate("/");
      }
    },
    [addAlert, handleSOS, navigate]
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
        <CameraFeed />
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border">
          <Camera className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <span className="text-sm text-foreground" aria-live="polite">
            {isListening ? "🎙️ Listening for commands…" : "Camera active — scanning"}
          </span>
        </div>
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
            aria-label={`Haptic feedback ${hapticEnabled ? "enabled" : "disabled"}. Tap to toggle.`}
            aria-pressed={hapticEnabled}
          >
            <Vibrate className={`h-5 w-5 mr-2 ${hapticEnabled ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
            {hapticEnabled ? "Haptic On" : "Haptic Off"}
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
