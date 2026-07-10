import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { platformApi } from "./api";

export function useApiReady(enabled = true) {
  return useQuery({
    queryKey: queryKeys.action("platform", "health", "live"),
    queryFn: () => platformApi.versionedLive(),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}
