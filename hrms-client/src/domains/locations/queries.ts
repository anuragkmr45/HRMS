import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { locationsApi } from "./api";

export function useIndiaLocations(query: { search?: string; limit?: number } = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("locations", "india", query),
    queryFn: () => locationsApi.listIndia(query),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}
