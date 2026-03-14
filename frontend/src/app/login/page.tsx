"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 300));

    const success = login(username.trim(), password);
    if (success) {
      router.replace("/");
    } else {
      setError("Invalid username or password.");
      setIsLoading(false);
    }
  };

  const fillDemo = (role: "admin" | "auditor") => {
    if (role === "admin") {
      setUsername("admin");
      setPassword("supath@admin");
    } else {
      setUsername("auditor");
      setPassword("supath@audit");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-[360px] flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://chips.gov.in/assets/public/images/logo/chips-logo.webp"
            alt="CHIPS"
            className="h-12 w-auto object-contain dark:invert"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-semibold tracking-tight">Welcome to SUPATH</CardTitle>
            <CardDescription className="text-sm">Sign in to your account</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="flex flex-col gap-5 pt-4 pb-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-foreground" htmlFor="username">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="h-10 px-3"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pr-9 h-10 px-3"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex-col gap-4 pt-4 pb-4">
              <Button type="submit" className="w-full h-10 font-medium text-base" disabled={isLoading}>
                Sign in
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Demo Credentials Section */}
        <div className="flex flex-col w-full gap-3 mt-2">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">Demo Accounts</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fillDemo("admin")}
              className="flex items-center justify-between w-full p-3 text-left border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm font-medium">Admin</span>
              <span className="text-xs font-mono text-muted-foreground">admin / supath@admin</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo("auditor")}
              className="flex items-center justify-between w-full p-3 text-left border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm font-medium">Auditor</span>
              <span className="text-xs font-mono text-muted-foreground">auditor / supath@audit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
