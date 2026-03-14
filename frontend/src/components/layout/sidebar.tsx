"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import {
  LayoutDashboard,
  Map,
  ScanSearch,
  FileText,
  MessageSquareWarning,
  BarChart3,
  HardHat,
  Camera,
  Database,
  ChevronLeft,
  ChevronRight,
  Shield,
  RefreshCcw,
  Lock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, adminOnly: false },
  { key: "map", href: "/map", icon: Map, adminOnly: false },
  { key: "detect", href: "/detect", icon: ScanSearch, adminOnly: false },
  { key: "reports", href: "/reports", icon: FileText, adminOnly: false },
  { key: "complaints", href: "/complaints", icon: MessageSquareWarning, adminOnly: false },
  { key: "analytics", href: "/analytics", icon: BarChart3, adminOnly: false },
  { key: "contractors", href: "/contractors", icon: HardHat, adminOnly: false },
  { key: "citizenReport", href: "/report", icon: Camera, adminOnly: false },
  { key: "sources", href: "/sources", icon: Database, adminOnly: false },
  { key: "loopClosure", href: "/loop-closure", icon: RefreshCcw, adminOnly: true },
];

/**
 * Shared navigation content used by both the desktop sidebar and the mobile sheet drawer.
 * When `collapsed` is true (desktop only), shows icon-only nav with tooltips.
 * `onNavigate` is called when a link is clicked — used to close the mobile drawer.
 */
export function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";

  return (
    <>
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 px-3 py-4 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary/20 shrink-0">
          <Shield className="w-5 h-5 text-sidebar-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold tracking-wide text-sidebar-primary">
              SUPATH
            </span>
            <span className="text-[10px] text-sidebar-foreground/60 truncate">
              {t.region}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const label = t.nav[item.key as keyof typeof t.nav];
          const locked = item.adminOnly && !isAdmin;

          const itemContent = (
            <span
              role={locked ? "button" : undefined}
              onClick={
                locked
                  ? () => {
                      // Don't navigate — show tooltip via hover only
                    }
                  : undefined
              }
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                locked
                  ? "opacity-40 cursor-not-allowed select-none text-sidebar-foreground/50"
                  : isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && (
                <span className="truncate flex-1">{label}</span>
              )}
              {!collapsed && locked && (
                <Lock className="w-3 h-3 shrink-0 ml-auto" />
              )}
            </span>
          );

          const linkContent = locked ? (
            itemContent
          ) : (
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );

          const tooltipLabel = locked
            ? `${label} (Admin only)`
            : label;

          if (collapsed) {
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger render={<span />}>
                  {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {tooltipLabel}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={item.key} open={locked ? undefined : false}>
              <TooltipTrigger render={<div />}>
                {linkContent}
              </TooltipTrigger>
              {locked && (
                <TooltipContent side="right" className="text-xs">
                  Admin only
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </nav>

      {/* Role badge */}
      {!collapsed && user && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
              user.role === "admin"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            )}
          >
            {user.role === "admin" ? (
              <Shield className="w-2.5 h-2.5" />
            ) : (
              <Lock className="w-2.5 h-2.5" />
            )}
            {user.role === "admin" ? t.auth.adminRole : t.auth.auditorRole}
          </span>
        </div>
      )}
    </>
  );
}

/** Desktop sidebar — hidden on mobile, shown from md breakpoint up */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <SidebarContent collapsed={collapsed} />

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center py-3 border-t border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
