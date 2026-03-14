"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth/context";
import { I18nProvider } from "@/lib/i18n/context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, SidebarContent } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const ADMIN_ONLY_PATHS = ["/loop-closure"];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isLoading) return;

    if (!user && pathname !== "/login") {
      router.replace("/login");
      return;
    }

    if (
      user &&
      user.role !== "admin" &&
      ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      router.replace("/");
    }
  }, [isLoading, user, pathname, router]);

  const handleMobileToggle = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  // Avoid flash while hydrating auth state
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Login page — no shell
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Not authenticated yet — blank while redirect fires
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden below md */}
      <Sidebar />

      {/* Mobile sidebar drawer — visible below md */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 p-0 bg-sidebar text-sidebar-foreground"
        >
          {/* Accessible title for the sheet (visually hidden) */}
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="flex flex-col h-full">
            <SidebarContent onNavigate={handleMobileClose} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMobileMenuToggle={handleMobileToggle} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
