// @refresh reset
import { useState, useCallback, useRef } from "react";

export interface LanguageConfig {
  code: string;       // BCP 47 for speech recognition (e.g., "ta-IN")
  name: string;       // Display name
  shortCode: string;  // ISO 639-1 for AI responses (e.g., "ta")
  voiceLang: string;  // lang prefix for TTS voice matching
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: "en-US", name: "English", shortCode: "en", voiceLang: "en" },
  { code: "ta-IN", name: "தமிழ் (Tamil)", shortCode: "ta", voiceLang: "ta" },
  { code: "hi-IN", name: "हिन्दी (Hindi)", shortCode: "hi", voiceLang: "hi" },
  { code: "te-IN", name: "తెలుగు (Telugu)", shortCode: "te", voiceLang: "te" },
  { code: "kn-IN", name: "ಕನ್ನಡ (Kannada)", shortCode: "kn", voiceLang: "kn" },
  { code: "ml-IN", name: "മലയാളം (Malayalam)", shortCode: "ml", voiceLang: "ml" },
  { code: "es-ES", name: "Español (Spanish)", shortCode: "es", voiceLang: "es" },
  { code: "fr-FR", name: "Français (French)", shortCode: "fr", voiceLang: "fr" },
  { code: "ar-SA", name: "العربية (Arabic)", shortCode: "ar", voiceLang: "ar" },
  { code: "zh-CN", name: "中文 (Chinese)", shortCode: "zh", voiceLang: "zh" },
];

// Unicode script ranges for auto-detection
const SCRIPT_PATTERNS: { pattern: RegExp; shortCode: string }[] = [
  { pattern: /[\u0B80-\u0BFF]/,  shortCode: "ta" }, // Tamil
  { pattern: /[\u0900-\u097F]/,  shortCode: "hi" }, // Devanagari (Hindi)
  { pattern: /[\u0C00-\u0C7F]/,  shortCode: "te" }, // Telugu
  { pattern: /[\u0C80-\u0CFF]/,  shortCode: "kn" }, // Kannada
  { pattern: /[\u0D00-\u0D7F]/,  shortCode: "ml" }, // Malayalam
  { pattern: /[\u0600-\u06FF]/,  shortCode: "ar" }, // Arabic
  { pattern: /[\u4E00-\u9FFF]/,  shortCode: "zh" }, // Chinese CJK
];

/**
 * Detects the script/language of a text string based on Unicode character ranges.
 * Returns the matching LanguageConfig or null if no non-Latin script detected.
 */
export function detectLanguageFromText(text: string): LanguageConfig | null {
  for (const { pattern, shortCode } of SCRIPT_PATTERNS) {
    // Count matching characters
    const matches = (text.match(new RegExp(pattern.source, "g")) || []).length;
    if (matches >= 2) {
      return SUPPORTED_LANGUAGES.find(l => l.shortCode === shortCode) || null;
    }
  }
  return null; // Latin script or undetected — don't switch
}

const STORAGE_KEY = "eyeguide-language";

export const useLanguage = () => {
  const [language, setLanguageState] = useState<LanguageConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return SUPPORTED_LANGUAGES.find(l => l.code === parsed.code) || SUPPORTED_LANGUAGES[0];
      }
    } catch {}
    return SUPPORTED_LANGUAGES[0];
  });

  // Cooldown to avoid flapping between languages
  const lastAutoSwitchRef = useRef(0);
  const AUTO_SWITCH_COOLDOWN = 5000; // 5 seconds

  const setLanguage = useCallback((lang: LanguageConfig) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lang));
  }, []);

  /**
   * Auto-detect language from transcript text. If a non-Latin script is detected
   * and differs from current language, switch automatically. Returns the detected
   * language (or current language if no switch).
   */
  const autoDetectAndSwitch = useCallback((transcript: string): LanguageConfig => {
    const now = Date.now();
    if (now - lastAutoSwitchRef.current < AUTO_SWITCH_COOLDOWN) {
      return language;
    }

    const detected = detectLanguageFromText(transcript);
    if (detected && detected.shortCode !== language.shortCode) {
      lastAutoSwitchRef.current = now;
      setLanguage(detected);
      return detected;
    }

    // If text is purely Latin and we're not on English, check if it looks English
    if (!detected && language.shortCode !== "en") {
      const latinChars = (transcript.match(/[a-zA-Z]/g) || []).length;
      const totalChars = transcript.replace(/\s/g, "").length;
      if (totalChars > 3 && latinChars / totalChars > 0.8) {
        lastAutoSwitchRef.current = now;
        const en = SUPPORTED_LANGUAGES[0];
        setLanguage(en);
        return en;
      }
    }

    return language;
  }, [language, setLanguage]);

  return { language, setLanguage, autoDetectAndSwitch, languages: SUPPORTED_LANGUAGES };
};
