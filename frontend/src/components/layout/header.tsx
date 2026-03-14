"use client";

import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { LanguageToggle } from "./language-toggle";
import { LogOut, Menu } from "lucide-react";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { t } = useI18n();
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-14 px-3 sm:px-4 border-b bg-card">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile hamburger menu */}
        <button
          onClick={onMobileMenuToggle}
          className="flex md:hidden items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* CHIPS Logo */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-primary/5 border border-primary/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://chips.gov.in/assets/public/images/logo/chips-logo.webp"
              alt="CHIPS"
              className="h-6 w-auto"
              onError={(e) => {
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
          <div className="hidden sm:block w-px h-8 bg-border shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-none truncate">
              {t.appName}
            </h1>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden md:block">
              {t.appFullName}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-50 border border-green-200">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-medium text-green-700">
            {t.common.live}
          </span>
        </div>

        <LanguageToggle />

        {/* User info + logout */}
        {user && (
          <>
            <div className="w-px h-6 bg-border shrink-0 mx-0.5 sm:mx-1" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Avatar */}
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                <span className="text-[10px] font-bold text-primary uppercase">
                  {user.displayName.charAt(0)}
                </span>
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xs font-medium text-foreground">
                  {user.displayName}
                </span>
                <span
                  className={
                    "text-[10px] font-medium " +
                    (user.role === "admin"
                      ? "text-blue-600"
                      : "text-amber-600")
                  }
                >
                  {user.role === "admin" ? t.auth.adminRole : t.auth.auditorRole}
                </span>
              </div>
              <button
                onClick={logout}
                title={t.auth.logout}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
