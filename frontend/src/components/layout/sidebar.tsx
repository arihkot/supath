"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
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
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { key: "dashboard", href: "/", icon: LayoutDashboard },
  { key: "map", href: "/map", icon: Map },
  { key: "detect", href: "/detect", icon: ScanSearch },
  { key: "reports", href: "/reports", icon: FileText },
  { key: "complaints", href: "/complaints", icon: MessageSquareWarning },
  { key: "analytics", href: "/analytics", icon: BarChart3 },
  { key: "contractors", href: "/contractors", icon: HardHat },
  { key: "citizenReport", href: "/report", icon: Camera },
  { key: "sources", href: "/sources", icon: Database },
  { key: "loopClosure", href: "/loop-closure", icon: RefreshCcw },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
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
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const label = t.nav[item.key as keyof typeof t.nav];

          const linkContent = (
            <Link
              href={item.href}
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

          if (collapsed) {
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger render={<span />}>
                  {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.key}>{linkContent}</div>;
        })}
      </nav>

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
