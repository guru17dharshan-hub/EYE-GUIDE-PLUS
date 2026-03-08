import { useState, useCallback, useRef, useEffect } from "react";

export const useVoiceCommand = (
  onCommand: (command: string) => void,
  autoStart = false,
  isSpeaking?: () => boolean,
  recognitionLang = "en-US"
) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(autoStart);
  const onCommandRef = useRef(onCommand);
  const isSpeakingRef = useRef(isSpeaking);
  const langRef = useRef(recognitionLang);
  onCommandRef.current = onCommand;
  isSpeakingRef.current = isSpeaking;
  langRef.current = recognitionLang;

  const createRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = langRef.current;

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);
      if (shouldListenRef.current) {
        setTimeout(() => {
          try {
            // Recreate with latest lang
            const r = createRecognition();
            if (r) {
              recognitionRef.current = r;
              r.start();
            }
          } catch {}
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

      if (isSpeakingRef.current?.()) {
        console.log("Ignored mic input during speech:", transcript);
        return;
      }

      onCommandRef.current(transcript);
    };

    return recognition;
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    try { recognition.start(); } catch {}
  }, [createRecognition]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    setIsListening(false);
  }, []);

  // Restart recognition when language changes
  useEffect(() => {
    if (shouldListenRef.current && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      // Will auto-restart via onend handler with new lang
    }
  }, [recognitionLang]);

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
