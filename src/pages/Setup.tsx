import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { useOnboardingProfile } from "@/hooks/useOnboardingProfile";

const STEPS = [
  {
    key: "welcome",
    prompt: "Welcome to EyeGuide Plus. Let's set up your profile. What's your name?",
  },
  {
    key: "mobility",
    prompt: "Do you use a cane, guide dog, or neither? Say cane, guide dog, or neither.",
  },
  {
    key: "home",
    prompt: "What's your home address? This helps with easy navigation home.",
  },
  {
    key: "emergency",
    prompt:
      "Would you like to add an emergency contact? Say a name followed by a phone number, or say skip.",
  },
  {
    key: "done",
    prompt:
      "All set! Your profile is ready. Say start or tap the button to begin navigating.",
  },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const Setup = () => {
  const navigate = useNavigate();
  const { speak } = useSpeech();
  const { profile, updateProfile, completeSetup } = useOnboardingProfile();
  const [step, setStep] = useState(0);
  const [spokenOnce, setSpokenOnce] = useState<Set<number>>(new Set());

  // Local input mirrors for each step
  const [nameInput, setNameInput] = useState(profile.name);
  const [homeInput, setHomeInput] = useState(profile.homeAddress);
  const [ecName, setEcName] = useState(profile.emergencyContactName);
  const [ecPhone, setEcPhone] = useState(profile.emergencyContactPhone);
  const [mobilityChoice, setMobilityChoice] = useState(profile.mobilityAid);

  const currentStep = STEPS[step];

  // Speak the prompt once per step
  useEffect(() => {
    if (!spokenOnce.has(step)) {
      const t = setTimeout(() => speak(currentStep.prompt, "high"), 400);
      setSpokenOnce((prev) => new Set(prev).add(step));
      return () => clearTimeout(t);
    }
  }, [step, currentStep.prompt, speak, spokenOnce]);

  const goNext = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const finishSetup = useCallback(() => {
    completeSetup();
    speak("Setup complete. Starting navigation.", "high");
    navigate("/");
  }, [completeSetup, navigate, speak]);

  const handleVoice = useCallback(
    (command: string) => {
      const lower = command.toLowerCase().trim();
      const key = currentStep.key as StepKey;

      if (lower.includes("back") || lower.includes("previous")) {
        goBack();
        return;
      }
      if (lower.includes("skip")) {
        goNext();
        return;
      }

      switch (key) {
        case "welcome":
          if (lower.length > 0) {
            const name = command.trim();
            setNameInput(name);
            updateProfile({ name });
            speak(`Got it, ${name}. Let's continue.`);
            goNext();
          }
          break;

        case "mobility":
          if (lower.includes("cane")) {
            setMobilityChoice("cane");
            updateProfile({ mobilityAid: "cane" });
            speak("Noted, you use a cane.");
            goNext();
          } else if (lower.includes("guide dog") || lower.includes("dog")) {
            setMobilityChoice("guide_dog");
            updateProfile({ mobilityAid: "guide_dog" });
            speak("Noted, you use a guide dog.");
            goNext();
          } else if (lower.includes("neither") || lower.includes("none") || lower.includes("no")) {
            setMobilityChoice("neither");
            updateProfile({ mobilityAid: "neither" });
            speak("Okay, no mobility aid.");
            goNext();
          } else {
            speak("Please say cane, guide dog, or neither.");
          }
          break;

        case "home":
          if (lower.length > 3) {
            setHomeInput(command.trim());
            updateProfile({ homeAddress: command.trim() });
            speak(`Home address set. Let's continue.`);
            goNext();
          }
          break;

        case "emergency":
          if (lower.includes("skip") || lower.includes("no")) {
            speak("Skipping emergency contact.");
            goNext();
          } else {
            // Try to extract name + phone from speech
            const words = command.trim().split(" ");
            const phoneMatch = command.match(/[\d\s\-\+]{7,}/);
            if (phoneMatch) {
              const phone = phoneMatch[0].trim();
              const name = command.replace(phone, "").trim() || "Emergency";
              setEcName(name);
              setEcPhone(phone);
              updateProfile({ emergencyContactName: name, emergencyContactPhone: phone });
              speak(`Added ${name} as emergency contact.`);
              goNext();
            } else {
              speak("I couldn't detect a phone number. Please say a name and phone number, or say skip.");
            }
          }
          break;

        case "done":
          if (lower.includes("start") || lower.includes("go") || lower.includes("navigate") || lower.includes("begin")) {
            finishSetup();
          }
          break;
      }
    },
    [currentStep.key, goNext, goBack, updateProfile, speak, finishSetup]
  );

  const { isListening } = useVoiceCommand(handleVoice, true);

  const handleManualNext = () => {
    const key = currentStep.key as StepKey;
    switch (key) {
      case "welcome":
        if (nameInput.trim()) {
          updateProfile({ name: nameInput.trim() });
          goNext();
        }
        break;
      case "mobility":
        if (mobilityChoice) {
          updateProfile({ mobilityAid: mobilityChoice as any });
          goNext();
        }
        break;
      case "home":
        updateProfile({ homeAddress: homeInput.trim() });
        goNext();
        break;
      case "emergency":
        updateProfile({ emergencyContactName: ecName, emergencyContactPhone: ecPhone });
        goNext();
        break;
      case "done":
        finishSetup();
        break;
    }
  };

  const mobilityOptions = [
    { value: "cane", label: "🦯 Cane" },
    { value: "guide_dog", label: "🐕‍🦺 Guide Dog" },
    { value: "neither", label: "🚶 Neither" },
  ] as const;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 bg-background"
      role="main"
      aria-label="EyeGuide Plus First-Time Setup"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Navigation className="h-10 w-10 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          EyeGuide<span className="text-primary">+</span> Setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 w-full max-w-xs" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-sm space-y-4" aria-live="polite">
        <p className="text-lg font-semibold text-foreground text-center">
          {currentStep.prompt}
        </p>

        {currentStep.key === "welcome" && (
          <Input
            placeholder="Your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            aria-label="Your name"
            className="text-lg text-center bg-card border-border"
            autoFocus
          />
        )}

        {currentStep.key === "mobility" && (
          <div className="grid grid-cols-3 gap-2">
            {mobilityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMobilityChoice(opt.value)}
                className={`rounded-xl p-4 text-center text-sm font-semibold border-2 transition-all ${
                  mobilityChoice === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
                aria-pressed={mobilityChoice === opt.value}
                aria-label={opt.label}
              >
                <span className="text-2xl block mb-1">{opt.label.split(" ")[0]}</span>
                <span>{opt.label.split(" ").slice(1).join(" ")}</span>
              </button>
            ))}
          </div>
        )}

        {currentStep.key === "home" && (
          <Input
            placeholder="Home address (or say it)"
            value={homeInput}
            onChange={(e) => setHomeInput(e.target.value)}
            aria-label="Home address"
            className="text-lg text-center bg-card border-border"
          />
        )}

        {currentStep.key === "emergency" && (
          <div className="space-y-3">
            <Input
              placeholder="Contact name"
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
              aria-label="Emergency contact name"
              className="bg-card border-border"
            />
            <Input
              placeholder="Phone number"
              type="tel"
              value={ecPhone}
              onChange={(e) => setEcPhone(e.target.value)}
              aria-label="Emergency contact phone"
              className="bg-card border-border"
            />
          </div>
        )}

        {currentStep.key === "done" && (
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 space-y-2 text-sm text-foreground">
            {profile.name && <p>👤 <strong>Name:</strong> {profile.name}</p>}
            {profile.mobilityAid && (
              <p>🦯 <strong>Mobility:</strong> {profile.mobilityAid === "guide_dog" ? "Guide dog" : profile.mobilityAid === "cane" ? "Cane" : "Neither"}</p>
            )}
            {profile.homeAddress && <p>🏠 <strong>Home:</strong> {profile.homeAddress}</p>}
            {profile.emergencyContactName && (
              <p>📞 <strong>Emergency:</strong> {profile.emergencyContactName} — {profile.emergencyContactPhone}</p>
            )}
          </div>
        )}
      </div>

      {/* Listening indicator */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm" aria-live="polite">
        <span className={`h-2 w-2 rounded-full ${isListening ? "bg-primary animate-pulse" : "bg-muted"}`} />
        {isListening ? "Listening — speak or type below" : "Initializing voice…"}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 w-full max-w-sm">
        {step > 0 && (
          <Button variant="outline" size="lg" onClick={goBack} className="flex-1" aria-label="Go back">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </Button>
        )}
        <Button
          size="lg"
          onClick={handleManualNext}
          className="flex-1"
          aria-label={currentStep.key === "done" ? "Start using EyeGuide Plus" : "Continue to next step"}
        >
          {currentStep.key === "done" ? (
            <>
              <Check className="h-5 w-5 mr-1" /> Start
            </>
          ) : (
            <>
              Next <ChevronRight className="h-5 w-5 ml-1" />
            </>
          )}
        </Button>
      </div>

      {/* Skip option for optional steps */}
      {(currentStep.key === "home" || currentStep.key === "emergency") && (
        <button
          onClick={goNext}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          aria-label="Skip this step"
        >
          Skip this step
        </button>
      )}
    </main>
  );
};

export default Setup;
