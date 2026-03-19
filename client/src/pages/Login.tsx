import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO } from "@/const";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Clear cached user data so it picks up the new session
      localStorage.removeItem("manus-runtime-user-info");
      window.location.href = data.redirect || "/dashboard";
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <img src={APP_LOGO} alt="Ready2Spray" className="h-12 mx-auto mb-4" />
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Sign in to manage your operations</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            {/* Demo login - bypasses auth for development/testing */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  const res = await fetch("/api/auth/dev-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || "Quick login failed");
                    return;
                  }
                  window.location.href = data.redirect || "/dashboard";
                } catch (err) {
                  setError("Quick login failed. Is the server running?");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Logging in..." : "Quick Login"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              For local installations, use Quick Login to get started immediately.
            </p>

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <a href="/register" className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); setLocation("/register"); }}>
                Register
              </a>
            </p>

            <p className="text-center text-xs text-muted-foreground mt-4 border-t pt-4">
              This is self-hosted software. All data is stored locally on your infrastructure.
              By signing in you agree to the <a href="/register" className="text-primary underline" onClick={(e) => { e.preventDefault(); setLocation("/register"); }}>Terms of Use</a>.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
