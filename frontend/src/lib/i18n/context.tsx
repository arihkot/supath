"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { translations, Language, TranslationKey } from "./translations";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKey;
}

const I18nContext = createContext<I18nContextType>({
  language: "en",
  setLanguage: () => {},
  t: translations.en,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("supath-lang", lang);
      document.documentElement.lang = lang;
    }
  }, []);

  React.useEffect(() => {
    const saved = localStorage.getItem("supath-lang") as Language | null;
    const validLangs: Language[] = ["en", "hi", "bn", "te", "mr", "ta"];
    if (saved && validLangs.includes(saved)) {
      setLanguageState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const t = translations[language];

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
