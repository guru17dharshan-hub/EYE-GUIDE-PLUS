import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation, Volume2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { getStoredProfile } from "@/hooks/useOnboardingProfile";

const Home = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();

  // Redirect to setup if first time
  useEffect(() => {
    const profile = getStoredProfile();
    if (!profile.setupComplete) {
      navigate("/setup", { replace: true });
    }
  }, [navigate]);

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
      } else if (lower.includes("help")) {
        speak("You can say: Start navigation, Find my bus, or Navigate.");
      } else {
        speak(`I heard: ${command}. Say Start navigation or Find my bus to begin.`);
      }
    },
    [handleStartNavigation, speak]
  );

  // Auto-start voice recognition — fully hands-free
  const { isListening } = useVoiceCommand(handleVoiceCommand, true);

  useEffect(() => {
    const timer = setTimeout(() => {
      speak(
        "Welcome to EyeGuide Plus. I am listening. Say Start navigation or Find my bus to begin."
      );
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

      <div
        className="flex flex-col items-center gap-4 w-full max-w-sm"
        aria-live="polite"
      >
        <Button
          size="xl"
          variant="nav"
          className="w-full"
          onClick={handleStartNavigation}
          aria-label="Start navigation"
        >
          Start Navigation <ArrowRight className="h-6 w-6 ml-2" />
        </Button>

        <div className="flex items-center gap-2 text-primary animate-pulse">
          <Volume2 className="h-8 w-8" aria-hidden="true" />
          <span className="text-lg font-semibold">
            {isListening ? "Listening… speak a command" : "Initializing voice…"}
          </span>
        </div>
        <span className="text-sm text-muted-foreground text-center">
          Say "Start navigation", "Find my bus", or "Help"
        </span>
      </div>
    </main>
  );
};

export default Home;
