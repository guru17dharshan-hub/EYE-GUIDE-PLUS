import { useCallback, useRef } from "react";

export const useSpeech = () => {
  const speakingRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return;
    if (!("speechSynthesis" in window)) return;

    const text = queueRef.current.shift()!;
    speakingRef.current = true;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      speakingRef.current = false;
      processQueue();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string, priority: "normal" | "high" = "normal") => {
    if (!("speechSynthesis" in window)) return;

    if (priority === "high") {
      // High priority: cancel current speech and jump to front
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      queueRef.current = [text]; // clear queue, only this message
    } else {
      queueRef.current.push(text);
    }
    processQueue();
  }, [processQueue]);

  const isSpeaking = useCallback(() => speakingRef.current, []);

  return { speak, isSpeaking };
};
