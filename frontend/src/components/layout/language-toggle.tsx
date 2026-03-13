"use client";

import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLanguage(language === "en" ? "hi" : "en")}
      className="h-8 px-2.5 text-xs font-medium gap-1.5"
    >
      <Languages className="w-3.5 h-3.5" />
      {language === "en" ? "हिंदी" : "English"}
    </Button>
  );
}
