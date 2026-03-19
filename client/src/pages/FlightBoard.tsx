import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plane, MapPin, Calendar, User, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function FlightBoard() {
  const { user } = useAuth();
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);

  const { data: jobsResponse, isLoading } = trpc.jobs.list.useQuery();
  const jobs = jobsResponse?.data ?? [];
  const { data: jobStatuses } = trpc.jobStatuses.list.useQuery();
  const updateJobMutation = trpc.jobs.update.useMutation({
    onSuccess: () => {
      toast.success("Job status updated!");
      setCompletionDialogOpen(false);
      setSelectedJob(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update job: ${error.message}`);
    },
  });

  // Filter jobs for today and this week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayJobs = jobs?.filter(job => {
    if (!job.scheduledStart) return false;
    const jobDate = new Date(job.scheduledStart);
    jobDate.setHours(0, 0, 0, 0);
    return jobDate.getTime() === today.getTime();
  }) || [];

  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
  
  const thisWeekJobs = jobs?.filter(job => {
    if (!job.scheduledStart) return false;
    const jobDate = new Date(job.scheduledStart);
    return jobDate >= thisWeekStart && jobDate < new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  }) || [];

  const handleCompleteJob = (job: any) => {
    setSelectedJob(job);
    setCompletionDialogOpen(true);
  };

  const handleStatusChange = (statusId: number) => {
    if (selectedJob) {
      updateJobMutation.mutate({
        id: selectedJob.id,
        statusId,
      });
    }
  };

  const getStatusColor = (statusId: number | null) => {
    if (!statusId) return "#999";
    const status = jobStatuses?.find(s => s.id === statusId);
    return status?.color || "#999";
  };

  const getStatusName = (statusId: number | null) => {
    if (!statusId) return "Unknown";
    const status = jobStatuses?.find(s => s.id === statusId);
    return status?.name || "Unknown";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4 pb-20">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Plane className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Flight Board</h1>
        </div>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || "Pilot"}
        </p>
      </div>

      {/* Today's Jobs */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Today's Jobs ({todayJobs.length})
        </h2>
        
        {todayJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No jobs scheduled for today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {todayJobs.map((job) => (
              <Card key={job.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {job.customerName || `Job #${job.id}`}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {job.location || "No location specified"}
                      </CardDescription>
                    </div>
                    <Badge 
                      style={{ 
                        backgroundColor: getStatusColor(job.statusId),
                        color: 'white'
                      }}
                    >
                      {getStatusName(job.statusId)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Job Details */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Start Time</p>
                      <p className="font-medium">
                        {job.scheduledStart ? new Date(job.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Acres</p>
                      <p className="font-medium">{job.acres || 'N/A'}</p>
                    </div>
                    {job.commodityCrop && (
                      <div>
                        <p className="text-muted-foreground">Crop</p>
                        <p className="font-medium">{job.commodityCrop}</p>
                      </div>
                    )}
                    {job.targetPest && (
                      <div>
                        <p className="text-muted-foreground">Target</p>
                        <p className="font-medium">{job.targetPest}</p>
                      </div>
                    )}
                  </div>

                  {/* Chemical Info */}
                  {job.chemicalProduct && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-blue-900">Chemical</p>
                      <p className="text-sm text-blue-700">{job.chemicalProduct}</p>
                      {job.applicationRate && (
                        <p className="text-xs text-blue-600 mt-1">
                          Rate: {job.applicationRate}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Pilot Assignment */}
                  {job.personnelName && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Assigned to:</span>
                      <span className="font-medium">{job.personnelName}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1" 
                      onClick={() => handleCompleteJob(job)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Update Status
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* This Week's Jobs */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          This Week ({thisWeekJobs.length})
        </h2>
        
        {thisWeekJobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No jobs scheduled this week</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {thisWeekJobs.map((job) => (
              <Card key={job.id} className="overflow-hidden">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{job.customerName || `Job #${job.id}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.scheduledStart ? new Date(job.scheduledStart).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBD'}
                      </p>
                    </div>
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: getStatusColor(job.statusId),
                        color: getStatusColor(job.statusId)
                      }}
                    >
                      {getStatusName(job.statusId)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Job Completion Dialog */}
      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Job Status</DialogTitle>
            <DialogDescription>
              Select the new status for this job
            </DialogDescription>
          </DialogHeader>
          
          {selectedJob && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium">{selectedJob.customerName || `Job #${selectedJob.id}`}</p>
                <p className="text-sm text-muted-foreground">{selectedJob.location}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Change status to:</p>
                <div className="grid gap-2">
                  {jobStatuses?.map((status) => (
                    <Button
                      key={status.id}
                      variant="outline"
                      className="justify-start h-auto py-3"
                      onClick={() => handleStatusChange(status.id)}
                      disabled={updateJobMutation.isPending}
                    >
                      <div
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: status.color }}
                      />
                      <div className="text-left">
                        <p className="font-medium">{status.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {status.category.replace('_', ' ')}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
