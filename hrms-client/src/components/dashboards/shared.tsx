import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_MAP, type Role } from "@/lib/auth";
import type { User } from "@/lib/mock";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HeroAction {
  label: string;
  to: string;
  variant?: "primary" | "outline";
}

export function DashboardHero({
  user,
  activeRole,
  actions,
}: {
  user: User;
  activeRole: Role;
  actions: HeroAction[];
}) {
  const [greeting, setGreeting] = useState("Good day");
  const displayName = user.name.trim() || user.email.split("@")[0] || "there";

  useEffect(() => {
    setGreeting(getGreetingForLocalTimeZone());
  }, []);

  return (
    <Card className="overflow-hidden rounded-3xl border-border/60 p-0 shadow-sm">
      <div className="relative p-6 sm:p-8" style={{ background: "var(--gradient-hero)" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary/80">
              {ROLE_MAP[activeRole].label} workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}, {displayName}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {ROLE_MAP[activeRole].description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.label}
                asChild
                variant={a.variant === "outline" ? "outline" : undefined}
                className={
                  a.variant === "outline" ? "rounded-full" : "rounded-full text-primary-foreground"
                }
                style={
                  a.variant === "outline" ? undefined : { background: "var(--gradient-primary)" }
                }
              >
                <Link to={a.to}>{a.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function getGreetingForLocalTimeZone(date = new Date()): string {
  const timeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const hour = timeZone ? hourInTimeZone(date, timeZone) : date.getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function hourInTimeZone(date: Date, timeZone: string): number {
  try {
    const formattedHour = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(date);
    const hour = Number.parseInt(formattedHour, 10);

    return Number.isFinite(hour) ? hour : date.getHours();
  } catch {
    return date.getHours();
  }
}

// ----- Small chart helpers (consistent palette) -----
const PRIMARY = "var(--chart-1)";
const PRIMARY_SOFT = "var(--chart-7)";
const SUCCESS = "var(--chart-3)";
const WARNING = "var(--chart-4)";
const INFO = "var(--chart-2)";
const DESTRUCTIVE = "var(--chart-5)";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  borderRadius: 10,
  fontSize: 12,
  padding: "6px 10px",
};

export function MiniArea({
  data,
  dataKey = "v",
  height = 120,
  color = PRIMARY,
}: {
  data: { label: string; v: number }[];
  dataKey?: string;
  height?: number;
  color?: string;
}) {
  const gradientId = `mini-area-${useId().replace(/:/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={28}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MiniBars({
  data,
  height = 120,
  color = PRIMARY,
}: {
  data: { label: string; v: number }[];
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={28}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="v" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 160,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
}) {
  const palette = [PRIMARY, INFO, SUCCESS, WARNING, DESTRUCTIVE, PRIMARY_SOFT];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={42}
          outerRadius={62}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={d.color ?? palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export const CHART_COLORS = { PRIMARY, PRIMARY_SOFT, SUCCESS, WARNING, INFO, DESTRUCTIVE };

export function ProgressBar({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
}) {
  const map = {
    primary: "var(--gradient-primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    destructive: "var(--destructive)",
    info: "var(--info)",
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: map[tone] }}
      />
    </div>
  );
}
