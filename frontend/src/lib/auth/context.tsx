"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "admin" | "auditor";

export interface AuthUser {
  username: string;
  displayName: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const STORAGE_KEY = "supath-auth";

const USERS: Array<{ username: string; password: string; displayName: string; role: UserRole }> = [
  { username: "admin", password: "supath@admin", displayName: "Admin", role: "admin" },
  { username: "auditor", password: "supath@audit", displayName: "Auditor", role: "auditor" },
];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthUser;
        // Validate shape
        if (parsed.username && parsed.displayName && (parsed.role === "admin" || parsed.role === "auditor")) {
          setUser(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (username: string, password: string): boolean => {
    const match = USERS.find(
      (u) => u.username === username && u.password === password
    );
    if (!match) return false;
    const authUser: AuthUser = {
      username: match.username,
      displayName: match.displayName,
      role: match.role,
    };
    setUser(authUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
