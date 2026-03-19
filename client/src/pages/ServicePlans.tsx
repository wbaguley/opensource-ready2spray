import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Calendar, DollarSign, User, MapPin, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ServicePlanFormData = {
  customerId: string;
  siteId: string;
  planName: string;
  planType: "monthly" | "quarterly" | "bi_monthly" | "annual" | "one_off";
  startDate: string;
  endDate: string;
  nextServiceDate: string;
  defaultTargetPests: string;
  pricePerService: string;
  status: "active" | "paused" | "cancelled" | "completed";
  notes: string;
};

const initialFormData: ServicePlanFormData = {
  customerId: "",
  siteId: "",
  planName: "",
  planType: "monthly",
  startDate: "",
  endDate: "",
  nextServiceDate: "",
  defaultTargetPests: "",
  pricePerService: "",
  status: "active",
  notes: "",
};

const planTypeLabels = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  bi_monthly: "Bi-Monthly",
  annual: "Annual",
  one_off: "One-Off Service",
};

const statusColors = {
  active: "bg-green-500",
  paused: "bg-yellow-500",
  cancelled: "bg-red-500",
  completed: "bg-blue-500",
};

export default function ServicePlans() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [formData, setFormData] = useState<ServicePlanFormData>(initialFormData);

  const { data: servicePlans, isLoading } = trpc.servicePlans.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: sites } = trpc.sites.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.servicePlans.create.useMutation({
    onSuccess: () => {
      utils.servicePlans.list.invalidate();
      toast.success("Service plan created successfully!");
      setDialogOpen(false);
      setFormData(initialFormData);
    },
    onError: (error: any) => {
      toast.error(`Failed to create service plan: ${error.message}`);
    },
  });

  const updateMutation = trpc.servicePlans.update.useMutation({
    onSuccess: () => {
      utils.servicePlans.list.invalidate();
      toast.success("Service plan updated successfully!");
      setDialogOpen(false);
      setEditingPlan(null);
      setFormData(initialFormData);
    },
    onError: (error: any) => {
      toast.error(`Failed to update service plan: ${error.message}`);
    },
  });

  const deleteMutation = trpc.servicePlans.delete.useMutation({
    onSuccess: () => {
      utils.servicePlans.list.invalidate();
      toast.success("Service plan deleted successfully!");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete service plan: ${error.message}`);
    },
  });

  const processNowMutation = trpc.servicePlans.processNow.useMutation({
    onSuccess: (result) => {
      utils.servicePlans.list.invalidate();
      utils.jobs.list.invalidate();
      toast.success(`Generated ${result.generated} jobs from ${result.processed} service plans!`);
    },
    onError: (error: any) => {
      toast.error(`Failed to process service plans: ${error.message}`);
    },
  });

  const handleProcessNow = () => {
    if (confirm("This will generate jobs for all active service plans that are due. Continue?")) {
      processNowMutation.mutate();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId || isNaN(parseInt(formData.customerId))) {
      toast.error("Please select a customer");
      return;
    }

    const payload = {
      customerId: parseInt(formData.customerId),
      siteId: formData.siteId ? parseInt(formData.siteId) : undefined,
      planName: formData.planName,
      planType: formData.planType,
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
      nextServiceDate: formData.nextServiceDate || undefined,
      defaultTargetPests: formData.defaultTargetPests ? JSON.stringify(formData.defaultTargetPests.split(",").map(p => p.trim())) : undefined,
      pricePerService: formData.pricePerService || undefined,
      status: formData.status,
      notes: formData.notes || undefined,
    };

    if (editingPlan) {
      updateMutation.mutate({
        id: editingPlan.id,
        ...payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (plan: any) => {
    setEditingPlan(plan);
    setFormData({
      customerId: plan.customerId?.toString() || "",
      siteId: plan.siteId?.toString() || "",
      planName: plan.planName || "",
      planType: plan.planType || "monthly",
      startDate: plan.startDate || "",
      endDate: plan.endDate || "",
      nextServiceDate: plan.nextServiceDate || "",
      defaultTargetPests: plan.defaultTargetPests
        ? (() => { try { const p = Array.isArray(plan.defaultTargetPests) ? plan.defaultTargetPests : JSON.parse(plan.defaultTargetPests); return Array.isArray(p) ? p.join(", ") : ""; } catch { return ""; } })()
        : "",
      pricePerService: plan.pricePerService || "",
      status: plan.status || "active",
      notes: plan.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this service plan?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getCustomerName = (customerId: number) => {
    return customers?.find(c => c.id === customerId)?.name || "Unknown Customer";
  };

  const getSiteName = (siteId: number | null) => {
    if (!siteId) return null;
    return sites?.find(s => s.id === siteId)?.name || "Unknown Site";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Service Plans</h1>
          </div>
          <p className="text-muted-foreground">
            Manage recurring service agreements for pest control customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleProcessNow}
            disabled={processNowMutation.isPending}
          >
            {processNowMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Process Now
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingPlan(null); setFormData(initialFormData); }}>
                <Plus className="mr-2 h-4 w-4" />
                New Service Plan
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit Service Plan" : "Create New Service Plan"}</DialogTitle>
              <DialogDescription>
                {editingPlan ? "Update service plan details" : "Create a recurring service agreement"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="planName">Plan Name *</Label>
                  <Input
                    id="planName"
                    value={formData.planName}
                    onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
                    placeholder="e.g., Monthly Pest Control"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="customerId">Customer *</Label>
                  {customers && customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      No customers yet. <a href="/customers" className="text-primary underline">Create a customer first</a>.
                    </p>
                  ) : (
                    <Select
                      value={formData.customerId}
                      onValueChange={(value) => setFormData({ ...formData, customerId: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label htmlFor="siteId">Site (Optional)</Label>
                  <Select
                    value={formData.siteId}
                    onValueChange={(value) => setFormData({ ...formData, siteId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific site</SelectItem>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id.toString()}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="planType">Plan Type *</Label>
                  <Select
                    value={formData.planType}
                    onValueChange={(value) => setFormData({ ...formData, planType: value as ServicePlanFormData["planType"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="bi_monthly">Bi-Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="one_off">One-Off Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as ServicePlanFormData["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="endDate">End Date (Optional)</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="nextServiceDate">Next Service Date</Label>
                  <Input
                    id="nextServiceDate"
                    type="date"
                    value={formData.nextServiceDate}
                    onChange={(e) => setFormData({ ...formData, nextServiceDate: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="pricePerService">Price Per Service</Label>
                  <Input
                    id="pricePerService"
                    type="number"
                    step="0.01"
                    value={formData.pricePerService}
                    onChange={(e) => setFormData({ ...formData, pricePerService: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="defaultTargetPests">Default Target Pests (comma-separated)</Label>
                  <Input
                    id="defaultTargetPests"
                    value={formData.defaultTargetPests}
                    onChange={(e) => setFormData({ ...formData, defaultTargetPests: e.target.value })}
                    placeholder="e.g., Ants, Spiders, Roaches"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about this service plan..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPlan ? "Update Plan" : "Create Plan"}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {!servicePlans || servicePlans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No service plans yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first recurring service agreement to get started
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Service Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {servicePlans.map((plan) => (
            <Card key={plan.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{plan.planName}</CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {getCustomerName(plan.customerId)}
                      </span>
                      {plan.siteId && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {getSiteName(plan.siteId)}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={statusColors[plan.status as keyof typeof statusColors]}>
                      {plan.status}
                    </Badge>
                    <Badge variant="outline">
                      {planTypeLabels[plan.planType as keyof typeof planTypeLabels]}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">{plan.startDate ? new Date(plan.startDate).toLocaleDateString() : "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Next Service</p>
                    <p className="font-medium">{plan.nextServiceDate ? new Date(plan.nextServiceDate).toLocaleDateString() : "Not scheduled"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p className="font-medium">{plan.endDate ? new Date(plan.endDate).toLocaleDateString() : "Ongoing"}</p>
                  </div>
                  {plan.pricePerService && (
                    <div>
                      <p className="text-sm text-muted-foreground">Price Per Service</p>
                      <p className="font-medium flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {plan.pricePerService}
                      </p>
                    </div>
                  )}
                </div>

                {!!plan.defaultTargetPests && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-1">Target Pests</p>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        try {
                          const pests = Array.isArray(plan.defaultTargetPests)
                            ? plan.defaultTargetPests
                            : (typeof plan.defaultTargetPests === 'string' ? JSON.parse(plan.defaultTargetPests) : []);
                          return Array.isArray(pests) ? pests.map((pest: string, idx: number) => (
                            <Badge key={idx} variant="secondary">{pest}</Badge>
                          )) : null;
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                )}

                {plan.notes && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{plan.notes}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(plan)}
                  >
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
