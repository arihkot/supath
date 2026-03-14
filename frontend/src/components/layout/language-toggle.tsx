"use client";

import { useI18n } from "@/lib/i18n/context";
import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Language } from "@/lib/i18n/translations";

const LANGUAGES: { code: Language; nativeLabel: string }[] = [
  { code: "en", nativeLabel: "English" },
  { code: "hi", nativeLabel: "हिंदी" },
  { code: "bn", nativeLabel: "বাংলা" },
  { code: "te", nativeLabel: "తెలుగు" },
  { code: "mr", nativeLabel: "मराठी" },
  { code: "ta", nativeLabel: "தமிழ்" },
];

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Languages className="w-3.5 h-3.5" />
        <span>{current.nativeLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className="flex items-center justify-between gap-4 cursor-pointer"
          >
            <span>{lang.nativeLabel}</span>
            {language === lang.code && (
              <Check className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
