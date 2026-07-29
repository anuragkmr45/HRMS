import { BriefcaseBusiness, Building2, House, Laptop, MapPin, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ATTENDANCE_WORK_MODES,
  attendanceWorkModeLabel,
  type AttendanceWorkMode,
} from "../work-context";

const MODE_ICONS = {
  office: Building2,
  remote: Laptop,
  wfh: House,
  field: MapPin,
} satisfies Record<AttendanceWorkMode, typeof BriefcaseBusiness>;

interface AttendanceWorkContextProps {
  value?: AttendanceWorkMode;
  disabled?: boolean;
  locked?: boolean;
  onValueChange: (value?: AttendanceWorkMode) => void;
}

export function AttendanceWorkContext({
  value,
  disabled = false,
  locked = false,
  onValueChange,
}: AttendanceWorkContextProps) {
  return (
    <div className="border-t bg-muted/20 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
          <span>Work mode</span>
          {!value && (
            <span className="text-xs font-normal text-muted-foreground">Company default</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Monitor className="h-3.5 w-3.5" />
          <span>Punch source: Web browser</span>
        </div>
      </div>

      <ToggleGroup
        type="single"
        value={value ?? ""}
        variant="outline"
        disabled={disabled || locked}
        aria-label="Work mode"
        onValueChange={(next) => onValueChange(next ? (next as AttendanceWorkMode) : undefined)}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {ATTENDANCE_WORK_MODES.map((mode) => {
          const Icon = MODE_ICONS[mode];
          return (
            <ToggleGroupItem
              key={mode}
              value={mode}
              aria-label={attendanceWorkModeLabel(mode)}
              className="w-full justify-start px-2.5"
            >
              <Icon />
              <span>{attendanceWorkModeLabel(mode)}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

export function AttendanceWorkModeBadge({ value }: { value: unknown }) {
  const label = attendanceWorkModeLabel(value);
  return label ? (
    <Badge variant="outline" className="font-medium text-muted-foreground">
      {label}
    </Badge>
  ) : null;
}
