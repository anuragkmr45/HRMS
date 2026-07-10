import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  email?: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showMeta?: boolean;
  subtitle?: string;
  tone?: "primary" | "success" | "info" | "warning";
}

const SIZES = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

const TONE = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  warning: "bg-warning/20 text-warning-foreground dark:bg-warning/15 dark:text-warning",
};

export function UserAvatar({
  name,
  email,
  src,
  size = "md",
  showMeta,
  subtitle,
  tone = "primary",
}: Props) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatar = (
    <Avatar className={SIZES[size]}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className={cn("font-semibold", TONE[tone])}>{initials}</AvatarFallback>
    </Avatar>
  );
  if (!showMeta) return avatar;
  return (
    <div className="flex items-center gap-3">
      {avatar}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle ?? email}</p>
      </div>
    </div>
  );
}
