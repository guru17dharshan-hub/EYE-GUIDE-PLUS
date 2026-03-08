import { useCallback, useRef, useEffect } from "react";

// Map short voice-lang prefixes to full BCP 47 tags for better TTS matching
const LANG_TO_BCP47: Record<string, string> = {
  en: "en-US",
  ta: "ta-IN",
  hi: "hi-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
  zh: "zh-CN",
};

export const useSpeech = () => {
  const speakingRef = useRef(false);
  const queueRef = useRef<{ text: string; lang?: string }[]>([]);
  const currentLangRef = useRef("en");
  const voicesLoadedRef = useRef(false);

  // Preload voices — some browsers load them asynchronously
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoadedRef.current = true;
      }
    };

    if ("speechSynthesis" in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const findVoice = (langPrefix: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    const fullLang = LANG_TO_BCP47[langPrefix] || langPrefix;

    // 1. Exact BCP 47 match (e.g. "ta-IN")
    let voice = voices.find(v => v.lang.toLowerCase() === fullLang.toLowerCase());
    if (voice) return voice;

    // 2. Prefix match on the full tag (e.g. "ta")
    voice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
    if (voice) return voice;

    // 3. Contains match
    voice = voices.find(v => v.lang.toLowerCase().includes(langPrefix.toLowerCase()));
    return voice || null;
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
    // Set the full BCP 47 tag so the browser picks the right voice
    utterance.lang = LANG_TO_BCP47[lang] || lang;

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
