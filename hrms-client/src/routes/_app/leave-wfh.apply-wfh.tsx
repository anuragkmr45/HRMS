import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Home, Send } from "lucide-react";
import { useCreateWfhMutation } from "@/domains/leave-wfh";
import { userFacingErrorMessage } from "@/shared/api";

export const Route = createFileRoute("/_app/leave-wfh/apply-wfh")({
  component: ApplyWfhPage,
});

function diffDays(from: string, to: string, half: boolean) {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  const d = Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
  if (d <= 0) return 0;
  return half && d === 1 ? 0.5 : d;
}

function ApplyWfhPage() {
  const navigate = useNavigate();
  const mutation = useCreateWfhMutation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dayType, setDayType] = useState<"full" | "half">("full");
  const [reason, setReason] = useState("");
  const [project, setProject] = useState("");

  const duration = diffDays(from, to, dayType === "half");

  const submit = async () => {
    if (!from || !to) return toast.error("Please select both dates");
    if (new Date(to) < new Date(from)) return toast.error("End date must be after start date");
    if (!reason.trim()) return toast.error("Reason is required");
    try {
      const response = await mutation.mutateAsync({
        date_from: from,
        date_to: to,
        half_day: dayType === "half",
        reason,
        project_ref: project || undefined,
      });
      toast.success("WFH request submitted");
      navigate({ to: "/leave-wfh" });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card className="rounded-2xl border-border/60 p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-info/15 text-info">
          <Home className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Apply for work from home</h3>
          <p className="text-xs text-muted-foreground">
            Per policy, employees may take 2 WFH days per week.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="from">From date</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="to">To date</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Day type</Label>
          <RadioGroup
            value={dayType}
            onValueChange={(v) => setDayType(v as "full" | "half")}
            className="mt-2 flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="full" /> Full day
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="half" /> Half day
            </label>
          </RadioGroup>
        </div>
        <div>
          <Label htmlFor="proj">Project / task reference</Label>
          <Input
            id="proj"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. Atlas Payments — sprint 19"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>Reporting manager</Label>
          <Input value="Assigned automatically" disabled className="mt-1.5" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What will you focus on at home?"
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Duration: <span className="font-semibold text-foreground tabular-nums">{duration}</span>{" "}
          day{duration === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button
            className="rounded-full"
            disabled={mutation.isPending}
            onClick={() => void submit()}
          >
            <Send className="mr-1.5 h-4 w-4" /> Submit
          </Button>
        </div>
      </div>
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return userFacingErrorMessage(error, "WFH request failed.");
}
