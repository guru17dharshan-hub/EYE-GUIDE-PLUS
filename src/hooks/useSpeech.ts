import { useCallback, useRef } from "react";

export const useSpeech = () => {
  const speakingRef = useRef(false);
  const queueRef = useRef<{ text: string; lang?: string }[]>([]);
  const currentLangRef = useRef("en");

  const findVoice = (langPrefix: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    // Exact match first, then prefix match
    return (
      voices.find(v => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())) ||
      voices.find(v => v.lang.toLowerCase().includes(langPrefix.toLowerCase())) ||
      null
    );
  };

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return;
    if (!("speechSynthesis" in window)) return;

    const item = queueRef.current.shift()!;
    speakingRef.current = true;

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    const lang = item.lang || currentLangRef.current;
    utterance.lang = lang;

    // Try to find a matching voice
    const voice = findVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }

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

  const speak = useCallback((text: string, priority: "normal" | "high" = "normal", lang?: string) => {
    if (!("speechSynthesis" in window)) return;

    if (priority === "high") {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      queueRef.current = [{ text, lang }];
    } else {
      queueRef.current.push({ text, lang });
    }
    processQueue();
  }, [processQueue]);

  const setLang = useCallback((langPrefix: string) => {
    currentLangRef.current = langPrefix;
  }, []);

  const isSpeaking = useCallback(() => speakingRef.current, []);

  return { speak, isSpeaking, setLang };
};
