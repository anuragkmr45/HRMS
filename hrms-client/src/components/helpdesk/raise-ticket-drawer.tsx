import { useState } from "react";
import { DrawerForm } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHelpdesk } from "@/lib/helpdesk-store";
import { useAuth } from "@/lib/auth";
import { useAssets } from "@/lib/assets-store";
import { useProjects } from "@/lib/projects-store";
import type { TicketCategory, TicketPriority } from "@/lib/mock/helpdesk";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { toastApiError } from "@/shared/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCategory?: TicketCategory;
}

export function RaiseTicketDrawer({ open, onOpenChange, defaultCategory }: Props) {
  const { user } = useAuth();
  const { categories, createTicket } = useHelpdesk();
  const { assets } = useAssets();
  const { projects } = useProjects();
  const navigate = useNavigate();

  const activeCats = categories.filter((c) => c.active);
  const [category, setCategory] = useState<TicketCategory>(
    defaultCategory ?? activeCats[0]?.key ?? "IT",
  );
  const cfg = activeCats.find((c) => c.key === category);
  const [subCategory, setSubCategory] = useState<string>(cfg?.subCategories[0]?.key ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [relatedAssetId, setRelatedAssetId] = useState<string>("");
  const [relatedProjectId, setRelatedProjectId] = useState<string>("");
  const [attachmentName, setAttachmentName] = useState<string>("");

  const reset = () => {
    setSubject("");
    setDescription("");
    setPriority("Medium");
    setRelatedAssetId("");
    setRelatedProjectId("");
    setAttachmentName("");
  };

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    try {
      const t = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
        subCategory: subCategory || cfg?.subCategories[0]?.key || "",
        priority,
        raisedBy: user?.name ?? "Anonymous",
        raisedByEmail: user?.email,
        raisedByDept: user?.department,
        relatedAssetId: relatedAssetId || undefined,
        relatedProjectId: relatedProjectId || undefined,
        attachmentName: attachmentName || undefined,
      });
      toast.success("Ticket created", {
        description: `${t.id} routed to ${t.assignee ?? "queue"}.`,
      });
      reset();
      onOpenChange(false);
      navigate({ to: "/helpdesk/$id", params: { id: t.id } });
    } catch (error) {
      toastApiError(error, "Unable to create ticket");
    }
  };

  return (
    <DrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a ticket"
      description="Pick the right team and we'll route it for you."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Submit ticket</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                const next = v as TicketCategory;
                setCategory(next);
                const nc = activeCats.find((c) => c.key === next);
                setSubCategory(nc?.subCategories[0]?.key ?? "");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeCats.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sub-category</Label>
            <Select value={subCategory} onValueChange={setSubCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {cfg?.subCategories.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Add as much detail as you can — steps to reproduce, screenshots, error codes."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Low", "Medium", "High", "Urgent"] as TicketPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Routed to</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground">
              {cfg?.defaultAssignee ?? "Unassigned queue"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Related asset (optional)</Label>
            <Select
              value={relatedAssetId || "none"}
              onValueChange={(v) => setRelatedAssetId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {assets.slice(0, 25).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id} · {a.brand} {a.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Related project (optional)</Label>
            <Select
              value={relatedProjectId || "none"}
              onValueChange={(v) => setRelatedProjectId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {projects.slice(0, 25).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Attachment</Label>
          <div className="flex items-center gap-2">
            <Input
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              placeholder="screenshot.png"
            />
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() =>
                setAttachmentName("evidence-" + Math.floor(Math.random() * 999) + ".png")
              }
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Attach a supporting screenshot or document.
          </p>
        </div>
      </div>
    </DrawerForm>
  );
}
