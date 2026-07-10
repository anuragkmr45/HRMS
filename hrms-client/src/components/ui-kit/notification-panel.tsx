import { Bell, AtSign, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NOTIFICATIONS, type NotificationItem } from "@/lib/mock";
import {
  mapApiNotifications,
  notificationsApi,
  useNotifications,
  useNotificationUnreadCount,
} from "@/domains/notifications";
import { pageItems, useApiRouteEnabled } from "@/shared/api";
import { queryKeys } from "@/shared/query";

const ICONS: Record<NotificationItem["category"], LucideIcon> = {
  approval: Sparkles,
  mention: AtSign,
  system: Bell,
  alert: ShieldAlert,
};

const TONES: Record<NotificationItem["category"], string> = {
  approval: "bg-primary-soft text-primary",
  mention: "bg-info/15 text-info",
  system: "bg-muted text-muted-foreground",
  alert: "bg-destructive/15 text-destructive",
};

export function NotificationPanel() {
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled([], true);
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[]>(NOTIFICATIONS);
  const feedQuery = useNotifications({ page: 1, page_size: 10 }, apiEnabled);
  const unreadQuery = useNotificationUnreadCount(apiEnabled);
  const apiNotifications = useMemo(
    () => mapApiNotifications(pageItems(feedQuery.data)),
    [feedQuery.data],
  );
  const notifications = apiEnabled ? apiNotifications : localNotifications;
  const unread = apiEnabled
    ? (unreadQuery.data?.unread_count ?? notifications.filter((n) => !n.read).length)
    : localNotifications.filter((n) => !n.read).length;

  const refreshNotifications = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.domain("notifications") });
    queryClient.invalidateQueries({ queryKey: queryKeys.domain("dashboard") });
  };

  const markReadMutation = useMutation({
    mutationFn: (notification: NotificationItem) =>
      notificationsApi.markRead(notification.apiId ?? notification.id, {
        expected_version: notification.version,
      }),
    onSuccess: refreshNotifications,
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead({}),
    onSuccess: refreshNotifications,
  });

  const markRead = (notification: NotificationItem) => {
    if (notification.read) return;
    if (!apiEnabled) {
      setLocalNotifications((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
      return;
    }
    markReadMutation.mutate(notification);
  };

  const markAllRead = () => {
    if (!apiEnabled) {
      setLocalNotifications((items) => items.map((item) => ({ ...item, read: true })));
      return;
    }
    markAllReadMutation.mutate();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-1rem)] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread} unread</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary"
            onClick={markAllRead}
            disabled={unread === 0 || markAllReadMutation.isPending}
          >
            Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          <ul className="divide-y">
            {apiEnabled && feedQuery.isLoading && (
              <li className="p-4 text-sm text-muted-foreground">Loading notifications...</li>
            )}
            {apiEnabled && feedQuery.isError && (
              <li className="p-4 text-sm text-destructive">Notifications are unavailable.</li>
            )}
            {!feedQuery.isLoading && !feedQuery.isError && notifications.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">No notifications</li>
            )}
            {!feedQuery.isLoading &&
              !feedQuery.isError &&
              notifications.map((n) => {
                const Icon = ICONS[n.category];
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n)}
                    className={cn(
                      "flex w-full items-start gap-3 p-4 text-left transition hover:bg-accent/40",
                      !n.read && "bg-primary-soft/30",
                    )}
                  >
                    <div
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                        TONES[n.category],
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.description}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                    </div>
                  </button>
                );
              })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
