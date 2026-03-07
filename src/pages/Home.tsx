import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mic, Navigation, Volume2 } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";

const Home = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();

  const handleStartNavigation = useCallback(() => {
    speak("Starting navigation mode.");
    navigate("/navigate");
  }, [navigate, speak]);

  const handleVoiceCommand = useCallback(
    (command: string) => {
      const lower = command.toLowerCase();
      if (lower.includes("find") && lower.includes("bus")) {
        handleStartNavigation();
      } else if (lower.includes("start") || lower.includes("navigate")) {
        handleStartNavigation();
      }
    },
    [handleStartNavigation]
  );

  const { isListening, startListening } = useVoiceCommand(handleVoiceCommand);

  useEffect(() => {
    const timer = setTimeout(() => {
      speak("Welcome to EyeGuide Plus. Say Find my bus to start.");
    }, 500);
    return () => clearTimeout(timer);
  }, [speak]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-8 p-6"
      role="main"
      aria-label="EyeGuide Plus Home Screen"
    >
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Navigation className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-5xl font-black tracking-tight text-foreground">
          EyeGuide<span className="text-primary">+</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-md" aria-live="polite">
          Your AI-powered navigation assistant for visually impaired users.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5 w-full max-w-sm">
        <Button
          variant="nav"
          size="xl"
          className="w-full focus-ring"
          onClick={handleStartNavigation}
          aria-label="Start Navigation"
        >
          <Navigation className="h-8 w-8 mr-2" aria-hidden="true" />
          Start Navigation
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full focus-ring"
          onClick={startListening}
          aria-label={isListening ? "Listening for voice command" : "Activate voice command"}
        >
          <Mic className={`h-6 w-6 mr-2 ${isListening ? "text-primary animate-pulse" : ""}`} aria-hidden="true" />
          {isListening ? "Listening…" : "Voice Command"}
        </Button>
      </div>

      <div
        className="mt-8 flex items-center gap-2 text-muted-foreground text-sm"
        aria-live="polite"
      >
        <Volume2 className="h-4 w-4" aria-hidden="true" />
        <span>Say "Find my bus" or tap Start Navigation</span>
      </div>
    </main>
  );
};

export default Home;
