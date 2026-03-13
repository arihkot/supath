"use client";

import { useI18n } from "@/lib/i18n/context";
import { LanguageToggle } from "./language-toggle";
import { Separator } from "@/components/ui/separator";

export function Header() {
  const { t } = useI18n();

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* CHIPS Logo */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/5 border border-primary/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://chips.gov.in/assets/public/images/logo/chips-logo.webp"
              alt="CHIPS"
              className="h-6 w-auto"
              onError={(e) => {
                // Fallback to text if image fails
                const el = e.currentTarget;
                el.style.display = "none";
                const fallback = el.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div className="hidden items-center gap-1">
              <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
                <span className="text-[8px] font-bold text-primary">CG</span>
              </div>
              <span className="text-[10px] font-medium text-primary/80">
                CHIPS
              </span>
            </div>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">
              {t.appName}
            </h1>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden md:block">
              {t.appFullName}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-50 border border-green-200">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-medium text-green-700">
            {t.common.live}
          </span>
        </div>
        <LanguageToggle />
      </div>
    </header>
  );
}
