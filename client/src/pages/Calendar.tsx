import { trpc } from "@/lib/trpc";
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Enable drag and drop
const DnDCalendar = withDragAndDrop(BigCalendar);

export default function Calendar() {
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());

  const { data: jobsResponse, isLoading } = trpc.jobs.list.useQuery();
  const jobs = jobsResponse?.data ?? [];
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: personnel } = trpc.personnel.list.useQuery();
  const { data: jobStatuses } = trpc.jobStatuses.list.useQuery();

  const utils = trpc.useUtils();

  const updateJobMutation = trpc.jobs.update.useMutation({
    onSuccess: () => {
      utils.jobs.list.invalidate();
      toast.success("Job schedule updated!");
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to update job: ${error.message}`);
    },
  });

  // Convert jobs to calendar events
  const events = useMemo(() => {
    if (!jobs) return [];
    
    return jobs
      .filter(job => job.scheduledStart && job.scheduledEnd)
      .map(job => {
        const status = jobStatuses?.find(s => s.id === job.statusId);
        return {
          id: job.id,
          title: job.customerName || `Job #${job.id}`,
          start: new Date(job.scheduledStart!),
          end: new Date(job.scheduledEnd!),
          resource: {
            ...job,
            statusColor: status?.color || "#999",
            statusName: status?.name || "Unknown",
          },
        };
      });
  }, [jobs, jobStatuses]);

  // Handle event drag and drop
  const handleEventDrop = useCallback(
    ({ event, start, end }: any) => {
      updateJobMutation.mutate({
        id: event.id,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
    },
    [updateJobMutation]
  );

  // Handle event resize
  const handleEventResize = useCallback(
    ({ event, start, end }: any) => {
      updateJobMutation.mutate({
        id: event.id,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
    },
    [updateJobMutation]
  );

  // Handle event click
  const handleSelectEvent = useCallback((event: any) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  }, []);

  // Custom event styling
  const eventStyleGetter = useCallback(
    (event: any) => {
      const backgroundColor = event.resource.statusColor;
      return {
        style: {
          backgroundColor,
          borderRadius: "4px",
          opacity: 0.9,
          color: "white",
          border: "none",
          display: "block",
        },
      };
    },
    []
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <CalendarIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Schedule Calendar</h1>
        </div>
        <p className="text-muted-foreground">
          Drag and drop jobs to reschedule. Click to view details.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4" style={{ height: "calc(100vh - 200px)" }}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor={(event: any) => event.start}
          endAccessor={(event: any) => event.end}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          eventPropGetter={eventStyleGetter}
          resizable
          draggableAccessor={() => true}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          step={30}
          showMultiDayTimes
          defaultDate={new Date()}
        />
      </div>

      {/* Job Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
            <DialogDescription>
              View and edit job information
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer</Label>
                  <p className="text-sm font-medium mt-1">
                    {selectedEvent.resource.customerName || "N/A"}
                  </p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedEvent.resource.statusColor }}
                    />
                    <p className="text-sm font-medium">{selectedEvent.resource.statusName}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <p className="text-sm font-medium mt-1">
                    {format(selectedEvent.start, "PPpp")}
                  </p>
                </div>
                <div>
                  <Label>End Time</Label>
                  <p className="text-sm font-medium mt-1">
                    {format(selectedEvent.end, "PPpp")}
                  </p>
                </div>
              </div>

              {selectedEvent.resource.location && (
                <div>
                  <Label>Location</Label>
                  <p className="text-sm font-medium mt-1">{selectedEvent.resource.location}</p>
                </div>
              )}

              {selectedEvent.resource.personnelName && (
                <div>
                  <Label>Assigned Pilot</Label>
                  <p className="text-sm font-medium mt-1">{selectedEvent.resource.personnelName}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedEvent.resource.commodity && (
                  <div>
                    <Label>Crop</Label>
                    <p className="text-sm font-medium mt-1">{selectedEvent.resource.commodity}</p>
                  </div>
                )}
                {selectedEvent.resource.acres && (
                  <div>
                    <Label>Acres</Label>
                    <p className="text-sm font-medium mt-1">{selectedEvent.resource.acres}</p>
                  </div>
                )}
              </div>

              {selectedEvent.resource.chemicalProduct && (
                <div>
                  <Label>Chemical Product</Label>
                  <p className="text-sm font-medium mt-1">{selectedEvent.resource.chemicalProduct}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setDialogOpen(false);
                  window.location.href = `/jobs/${selectedEvent.id}`;
                }}>
                  View Full Details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
