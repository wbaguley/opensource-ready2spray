import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plane, Truck, Wrench, TrendingUp, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { useMemo } from "react";

export default function EquipmentDashboard() {
  const { data: equipment, isLoading: equipmentLoading } = trpc.equipment.list.useQuery();
  const { data: jobsResponse, isLoading: jobsLoading } = trpc.jobs.list.useQuery();
  const jobs = jobsResponse?.data ?? [];

  const analytics = useMemo(() => {
    if (!equipment || !jobsResponse) return null;

    const totalEquipment = equipment.length;
    const activeEquipment = equipment.filter(e => e.status === 'active').length;
    const maintenanceEquipment = equipment.filter(e => e.status === 'maintenance').length;
    const inactiveEquipment = equipment.filter(e => e.status === 'inactive').length;

    // Calculate equipment usage from jobs
    const equipmentUsage = equipment.map(equip => {
      const assignedJobs = jobs.filter(j => j.equipmentId === equip.id);
      const completedJobs = assignedJobs.filter(j => j.statusId === 3);
      const activeJobs = assignedJobs.filter(j => j.statusId === 2);
      
      // Calculate estimated hours (simplified: 2 hours per job)
      const estimatedHours = completedJobs.length * 2;
      
      // Calculate utilization rate (jobs assigned / total days in service)
      const utilizationRate = assignedJobs.length > 0 ? 
        Math.min(100, (assignedJobs.length / 30) * 100) : 0;

      return {
        ...equip,
        totalJobs: assignedJobs.length,
        completedJobs: completedJobs.length,
        activeJobs: activeJobs.length,
        estimatedHours,
        utilizationRate: Math.round(utilizationRate),
      };
    });

    // Sort by utilization rate
    equipmentUsage.sort((a, b) => b.utilizationRate - a.utilizationRate);

    // Calculate overdue maintenance
    const overdueMaintenanceCount = equipment.filter(e => 
      e.nextMaintenanceDate && new Date(e.nextMaintenanceDate) < new Date()
    ).length;

    return {
      totalEquipment,
      activeEquipment,
      maintenanceEquipment,
      inactiveEquipment,
      equipmentUsage,
      overdueMaintenanceCount,
    };
  }, [equipment, jobs]);

  const getEquipmentIcon = (type: string) => {
    switch (type) {
      case "plane":
      case "helicopter":
        return <Plane className="h-5 w-5" />;
      case "truck":
      case "ground_rig":
        return <Truck className="h-5 w-5" />;
      default:
        return <Wrench className="h-5 w-5" />;
    }
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 70) return "text-green-600 bg-green-50";
    if (rate >= 40) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  if (equipmentLoading || jobsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Equipment Utilization Dashboard</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No equipment data available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Equipment Utilization Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor equipment usage, performance, and maintenance status
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalEquipment}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.activeEquipment} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Maintenance</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.maintenanceEquipment}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.overdueMaintenanceCount} overdue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(
                analytics.equipmentUsage.reduce((sum, e) => sum + e.utilizationRate, 0) /
                  analytics.equipmentUsage.length || 0
              )}%
            </div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.equipmentUsage.reduce((sum, e) => sum + e.estimatedHours, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated flight/drive hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equipment Utilization Table */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment Utilization Details</CardTitle>
          <CardDescription>
            Individual equipment performance and usage statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.equipmentUsage.map((equip) => (
              <div
                key={equip.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                    {getEquipmentIcon(equip.equipmentType)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{equip.name}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {equip.equipmentType.replace("_", " ")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Jobs</div>
                    <div className="font-semibold">{equip.totalJobs}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Completed</div>
                    <div className="font-semibold">{equip.completedJobs}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Active</div>
                    <div className="font-semibold">{equip.activeJobs}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Hours</div>
                    <div className="font-semibold">{equip.estimatedHours}</div>
                  </div>
                  <div className="text-center min-w-[100px]">
                    <div className="text-sm text-muted-foreground mb-1">Utilization</div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getUtilizationColor(
                        equip.utilizationRate
                      )}`}
                    >
                      {equip.utilizationRate}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {analytics.equipmentUsage.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No equipment data available. Add equipment to start tracking utilization.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Alerts */}
      {analytics.overdueMaintenanceCount > 0 && (
        <Card className="mt-6 border-yellow-200 bg-yellow-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" />
              Maintenance Alerts
            </CardTitle>
            <CardDescription>
              Equipment requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {equipment
                ?.filter(e => e.nextMaintenanceDate && new Date(e.nextMaintenanceDate) < new Date())
                .map((equip) => (
                  <div
                    key={equip.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-200"
                  >
                    <div className="flex items-center gap-3">
                      {getEquipmentIcon(equip.equipmentType)}
                      <div>
                        <div className="font-medium">{equip.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Maintenance was due on{" "}
                          {new Date(equip.nextMaintenanceDate!).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-yellow-800">
                      {Math.floor(
                        (new Date().getTime() - new Date(equip.nextMaintenanceDate!).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )}{" "}
                      days overdue
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
