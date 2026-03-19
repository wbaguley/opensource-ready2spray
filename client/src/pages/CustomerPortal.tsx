import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, MapPin, CheckCircle, Clock, AlertCircle, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { APP_LOGO, APP_TITLE } from "@/const";

export default function CustomerPortal() {
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");

  // Mock login for now - in production, this would use proper authentication
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setCustomerEmail(email);
    setIsLoggedIn(true);
    toast.success("Welcome to your customer portal!");
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCustomerEmail("");
    setEmail("");
    toast.success("Logged out successfully");
  };

  // Fetch customer data
  const { data: customers } = trpc.customers.list.useQuery(undefined, {
    enabled: isLoggedIn,
  });

  const customer = customers?.find((c) => c.email === customerEmail);

  const { data: servicePlans } = trpc.servicePlans.list.useQuery(undefined, {
    enabled: isLoggedIn && !!customer,
  });

  const { data: jobsResponse } = trpc.jobs.list.useQuery(undefined, {
    enabled: isLoggedIn && !!customer,
  });
  const jobs = jobsResponse?.data ?? [];

  const customerServicePlans = servicePlans?.filter(
    (plan) => plan.customerId === customer?.id
  );

  const customerJobs = jobs?.filter((job: any) => job.customerId === customer?.id);

  const upcomingJobs = customerJobs
    ?.filter((job) => {
      const scheduledDate = job.scheduledStart ? new Date(job.scheduledStart) : null;
      return scheduledDate && scheduledDate >= new Date();
    })
    .sort((a, b) => {
      const dateA = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const dateB = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return dateA - dateB;
    });

  const pastJobs = customerJobs
    ?.filter((job) => {
      const scheduledDate = job.scheduledStart ? new Date(job.scheduledStart) : null;
      return scheduledDate && scheduledDate < new Date();
    })
    .sort((a, b) => {
      const dateA = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const dateB = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return dateB - dateA; // Most recent first
    })
    .slice(0, 10); // Last 10 jobs

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={APP_LOGO} alt={APP_TITLE} className="h-16" />
            </div>
            <CardTitle className="text-2xl">Customer Portal</CardTitle>
            <CardDescription>
              Access your service plans, upcoming jobs, and service history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter the email address associated with your account
                </p>
              </div>

              <Button type="submit" className="w-full">
                Access Portal
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Account Not Found</h3>
            <p className="text-muted-foreground mb-4">
              We couldn't find an account with email: {customerEmail}
            </p>
            <Button onClick={handleLogout} variant="outline">
              Try Different Email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt={APP_TITLE} className="h-10" />
            <div>
              <h1 className="text-xl font-bold">{APP_TITLE}</h1>
              <p className="text-sm text-muted-foreground">Customer Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium">{customer.name}</p>
              <p className="text-sm text-muted-foreground">{customer.email}</p>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Active Service Plans */}
        <Card>
          <CardHeader>
            <CardTitle>Your Service Plans</CardTitle>
            <CardDescription>
              Active recurring service agreements
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!customerServicePlans || customerServicePlans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active service plans</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customerServicePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{plan.planName}</h3>
                        <p className="text-sm text-muted-foreground capitalize">
                          {plan.planType.replace("_", " ")} service
                        </p>
                      </div>
                      <Badge
                        variant={
                          plan.status === "active"
                            ? "default"
                            : plan.status === "paused"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {plan.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p className="font-medium">
                          {plan.startDate
                            ? new Date(plan.startDate).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Next Service</p>
                        <p className="font-medium">
                          {plan.nextServiceDate
                            ? new Date(plan.nextServiceDate).toLocaleDateString()
                            : "TBD"}
                        </p>
                      </div>
                    </div>

                    {plan.defaultTargetPests ? (
                      <div className="text-sm">
                        <p className="text-muted-foreground mb-1">Target Pests</p>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            try {
                              const pests =
                                typeof plan.defaultTargetPests === "string"
                                  ? JSON.parse(plan.defaultTargetPests)
                                  : plan.defaultTargetPests;
                              return Array.isArray(pests)
                                ? pests.map((pest: string, i: number) => (
                                    <Badge key={i} variant="outline">
                                      {pest}
                                    </Badge>
                                  ))
                                : null;
                            } catch {
                              return null;
                            }
                          })() as React.ReactNode}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Services</CardTitle>
            <CardDescription>
              Your scheduled pest control services
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!upcomingJobs || upcomingJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No upcoming services scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingJobs.map((job) => (
                  <div
                    key={job.id}
                    className="border rounded-lg p-4 flex items-start gap-4 hover:shadow-md transition-shadow"
                  >
                    <div className="bg-green-100 rounded-lg p-3">
                      <Calendar className="h-6 w-6 text-green-700" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{job.title}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {job.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {job.scheduledStart
                              ? new Date(job.scheduledStart).toLocaleDateString()
                              : "TBD"}
                          </span>
                        </div>
                        {job.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {job.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service History */}
        <Card>
          <CardHeader>
            <CardTitle>Service History</CardTitle>
            <CardDescription>
              Your past pest control services
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!pastJobs || pastJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No service history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pastJobs.map((job) => (
                  <div
                    key={job.id}
                    className="border rounded-lg p-4 flex items-start gap-4 opacity-75"
                  >
                    <div className="bg-gray-100 rounded-lg p-3">
                      <CheckCircle className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{job.title}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {job.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {job.scheduledStart
                              ? new Date(job.scheduledStart).toLocaleDateString()
                              : "N/A"}
                          </span>
                        </div>
                        {job.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {job.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
