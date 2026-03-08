import { useState, useCallback, useRef, useEffect } from "react";

export const useVoiceCommand = (
  onCommand: (command: string) => void,
  autoStart = false
) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(autoStart);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

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
      // Auto-restart if we should keep listening
      if (shouldListenRef.current) {
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 300);
      }
    };

    recognition.onerror = (event: any) => {
      // For "no-speech" or "aborted", just restart
      if (event.error === "no-speech" || event.error === "aborted") {
        return; // onend will handle restart
      }
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      // Get the latest result
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
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

  // Auto-start on mount if requested
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
