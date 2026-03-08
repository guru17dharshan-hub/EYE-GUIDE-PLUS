import { useState, useCallback } from "react";

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

  const setLanguage = useCallback((lang: LanguageConfig) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lang));
  }, []);

  return { language, setLanguage, languages: SUPPORTED_LANGUAGES };
};
