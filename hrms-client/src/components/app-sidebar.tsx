import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Clock,
  CalendarDays,
  Briefcase,
  Activity,
  Timer,
  Receipt,
  Laptop,
  LifeBuoy,
  BarChart3,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, ROLE_MAP } from "@/lib/auth";
import { AppearanceSidebarControl } from "@/components/theme/appearance-menu";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";

interface Item {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
}

const WORKSPACE: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "EMS", url: "/ems", icon: UserCircle },
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Leave & WFH", url: "/leave-wfh", icon: CalendarDays },
  { title: "Timesheet", url: "/timesheet", icon: Timer },
];

const OPERATIONS: Item[] = [
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Projects", url: "/projects", icon: Briefcase },
  { title: "Team Utilization", url: "/team-utilization", icon: Activity },
  { title: "Expense Management", url: "/expenses", icon: Receipt },
  { title: "Assets", url: "/assets", icon: Laptop },
  { title: "Helpdesk", url: "/helpdesk", icon: LifeBuoy },
];

const INSIGHTS: Item[] = [
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Admin Settings", url: "/admin-settings", icon: Settings },
];

const ALL_GROUPS: { label: string; items: Item[] }[] = [
  { label: "Workspace", items: WORKSPACE },
  { label: "Operations", items: OPERATIONS },
  { label: "Insights", items: INSIGHTS },
];

type LiquidIndicatorBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

function getLiquidIndicatorBox(content: HTMLElement, activeItem: HTMLElement): LiquidIndicatorBox {
  const contentRect = content.getBoundingClientRect();
  const activeRect = activeItem.getBoundingClientRect();

  return {
    x: activeRect.left - contentRect.left + content.scrollLeft,
    y: activeRect.top - contentRect.top + content.scrollTop,
    width: activeRect.width,
    height: activeRect.height,
    visible: true,
  };
}

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { activeRole } = useAuth();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [pendingActiveUrl, setPendingActiveUrl] = useState<string | null>(null);
  const [indicatorBox, setIndicatorBox] = useState<LiquidIndicatorBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
  });

  const accessible = useMemo(() => (activeRole ? ROLE_MAP[activeRole].modules : []), [activeRole]);

  const routeMatches = useCallback(
    (url: string) => path === url || path.startsWith(url + "/"),
    [path],
  );
  const canAccess = useCallback((url: string) => accessible.includes(url), [accessible]);
  const visibleItems = useMemo(
    () => ALL_GROUPS.flatMap((group) => group.items).filter((item) => canAccess(item.url)),
    [canAccess],
  );
  const currentActiveUrl = useMemo(
    () => visibleItems.find((item) => routeMatches(item.url))?.url ?? null,
    [routeMatches, visibleItems],
  );
  const activeUrl = pendingActiveUrl ?? currentActiveUrl;
  const isActive = (url: string) => activeUrl === url;

  useEffect(() => {
    setPendingActiveUrl(null);
  }, [path]);

  const moveIndicatorToElement = useCallback((activeItem: HTMLElement) => {
    const content = contentRef.current;
    if (!content) return;

    const nextBox = getLiquidIndicatorBox(content, activeItem);
    setIndicatorBox((current) => {
      if (
        current.visible === nextBox.visible &&
        Math.abs(current.x - nextBox.x) < 0.5 &&
        Math.abs(current.y - nextBox.y) < 0.5 &&
        Math.abs(current.width - nextBox.width) < 0.5 &&
        Math.abs(current.height - nextBox.height) < 0.5
      ) {
        return current;
      }

      return nextBox;
    });
  }, []);

  const updateIndicator = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const activeItem = content.querySelector<HTMLElement>(
      '[data-sidebar="menu-button"][data-active="true"]',
    );

    if (!activeItem) {
      setIndicatorBox((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }

    moveIndicatorToElement(activeItem);
  }, [moveIndicatorToElement]);

  const handleNavigationIntent = useCallback(
    (url: string, element: HTMLElement) => {
      setPendingActiveUrl(url);
      moveIndicatorToElement(element);
    },
    [moveIndicatorToElement],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateIndicator);
    return () => window.cancelAnimationFrame(frame);
  }, [activeUrl, collapsed, isMobile, updateIndicator, visibleItems.length]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const scheduleUpdate = () => window.requestAnimationFrame(updateIndicator);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const mutationObserver = new MutationObserver(scheduleUpdate);

    resizeObserver.observe(content);
    mutationObserver.observe(content, {
      attributes: true,
      attributeFilter: ["data-active", "class", "style"],
      childList: true,
      subtree: true,
    });
    content.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      content.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [updateIndicator]);

  const indicatorStyle = {
    width: `${indicatorBox.width}px`,
    height: `${indicatorBox.height}px`,
    transform: `translate3d(${indicatorBox.x}px, ${indicatorBox.y}px, 0)`,
    opacity: indicatorBox.visible ? 1 : 0,
  } satisfies CSSProperties;

  const renderGroup = (label: string, items: Item[]) => {
    const visible = items.filter((i) => canAccess(i.url));
    if (visible.length === 0) return null;
    return (
      <SidebarGroup key={label}>
        {!collapsed && (
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.url)}
                  className="glass-sidebar-item rounded-xl"
                  tooltip={item.title}
                >
                  <Link
                    to={item.url}
                    className="flex items-center gap-3"
                    onPointerDown={(event) => handleNavigationIntent(item.url, event.currentTarget)}
                    onClick={(event) => handleNavigationIntent(item.url, event.currentTarget)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2.5 rounded-xl outline-none">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground shadow-md"
            style={{ background: "var(--gradient-primary)" }}
          >
            <span className="text-sm font-bold">H</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold tracking-tight">Hawkaii HRMS</span>
              <span className="text-[11px] text-muted-foreground">Workforce OS</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent
        ref={contentRef}
        className="relative px-2 py-2"
        data-liquid-indicator-ready={indicatorBox.visible ? "true" : "false"}
      >
        <span
          aria-hidden="true"
          className="sidebar-liquid-active-indicator"
          style={indicatorStyle}
        />
        {ALL_GROUPS.map((g) => renderGroup(g.label, g.items))}
      </SidebarContent>

      {!collapsed && activeRole && (
        <SidebarFooter className="space-y-3 border-t p-3">
          {isMobile && <AppearanceSidebarControl />}
          <div className="rounded-xl border border-primary/15 bg-primary-soft/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80">
              Active role
            </p>
            <p className="mt-0.5 text-sm font-semibold text-primary">
              {ROLE_MAP[activeRole].label}
            </p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
