import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_LOGO } from "@/const";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!acceptedTerms) {
      setError("You must accept the Terms of Use to continue");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

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
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Register to start using Ready2Spray</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                autoComplete="name"
              />
            </div>
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
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
              />
            </div>

            {/* Terms of Use */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 mt-0.5"
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                I agree to the{" "}
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="text-primary underline hover:no-underline">
                      Terms of Use
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle>Terms of Use</DialogTitle>
                      <DialogDescription>
                        Please read these terms carefully before using Ready2Spray.
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] pr-4">
                      <div className="space-y-4 text-sm text-muted-foreground">
                        <section>
                          <h3 className="font-semibold text-foreground mb-1">1. Self-Hosted Software</h3>
                          <p>
                            Ready2Spray is open-source, self-hosted software that you install and
                            operate on your own infrastructure. You are solely responsible for
                            the deployment, maintenance, security, and operation of this software
                            and the server(s) on which it runs.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">2. Local Data Storage</h3>
                          <p>
                            All data entered into this platform -- including but not limited to
                            customer information, job records, personnel data, product details,
                            and any other business data -- is stored locally on your own
                            infrastructure. The developers of Ready2Spray do not have access to,
                            collect, transmit, or store any of your data. You are the sole data
                            controller and processor.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">3. Data Responsibility</h3>
                          <p>
                            You are solely responsible for the accuracy, security, backup, and
                            lawful handling of all data entered into this platform. This includes
                            compliance with all applicable data protection laws, privacy
                            regulations, and industry-specific requirements (such as EPA
                            compliance for pesticide application records) in your jurisdiction.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">4. No Warranty</h3>
                          <p>
                            This software is provided "AS IS" without warranty of any kind,
                            express or implied, including but not limited to the warranties of
                            merchantability, fitness for a particular purpose, and
                            noninfringement. The software may contain bugs or errors.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">5. Limitation of Liability</h3>
                          <p>
                            In no event shall the developers, contributors, or distributors of
                            Ready2Spray be liable for any direct, indirect, incidental, special,
                            consequential, or exemplary damages arising from the use of or
                            inability to use this software, including but not limited to loss of
                            data, loss of profits, business interruption, or any other
                            commercial damages or losses.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">6. Misuse</h3>
                          <p>
                            You agree not to use this software for any unlawful purpose or in
                            violation of any applicable laws or regulations. The developers of
                            Ready2Spray are not responsible for any misuse of this software by
                            you or any user you grant access to. You are solely liable for how
                            you use this software and the data you enter.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">7. AI Features</h3>
                          <p>
                            This software may include AI-powered features (such as product
                            label extraction and chat assistance). AI outputs may be inaccurate.
                            You are responsible for verifying all AI-generated information before
                            relying on it for compliance, safety, or operational decisions.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">8. Third-Party Services</h3>
                          <p>
                            If you configure integrations with third-party services (such as
                            Ollama, Anthropic, Google Maps, or Agrian), your use of those
                            services is subject to their respective terms and privacy policies.
                            The developers of Ready2Spray are not responsible for third-party
                            service availability or data handling.
                          </p>
                        </section>

                        <section>
                          <h3 className="font-semibold text-foreground mb-1">9. Acceptance</h3>
                          <p>
                            By creating an account and using this software, you acknowledge that
                            you have read, understood, and agree to be bound by these terms.
                          </p>
                        </section>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !acceptedTerms}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <a href="/login" className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); setLocation("/login"); }}>
                Sign In
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
