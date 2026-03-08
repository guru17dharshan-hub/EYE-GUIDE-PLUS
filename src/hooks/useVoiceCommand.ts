import { useState, useCallback, useRef, useEffect } from "react";

export const useVoiceCommand = (
  onCommand: (command: string) => void,
  autoStart = false,
  isSpeaking?: () => boolean
) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(autoStart);
  const onCommandRef = useRef(onCommand);
  const isSpeakingRef = useRef(isSpeaking);
  onCommandRef.current = onCommand;
  isSpeakingRef.current = isSpeaking;

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);
      if (shouldListenRef.current) {
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 300);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;

      // Ignore mic input while the app is speaking (prevents echo/feedback loop)
      if (isSpeakingRef.current?.()) {
        console.log("Ignored mic input during speech:", transcript);
        return;
      }

      onCommandRef.current(transcript);
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    try { recognition.start(); } catch {}
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    if (autoStart) {
      const timer = setTimeout(startListening, 1000);
      return () => {
        clearTimeout(timer);
        stopListening();
      };
    }
    return () => stopListening();
  }, [autoStart, startListening, stopListening]);

  return { isListening, startListening, stopListening };
};
