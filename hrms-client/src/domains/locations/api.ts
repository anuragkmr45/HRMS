import { apiRequest } from "@/shared/api";

export interface IndiaLocationRecord {
  id: string;
  type: "city" | "state";
  city: string | null;
  state: string;
  country: string;
  country_code: string;
  label: string;
  value: string;
}

export const locationsApi = {
  listIndia(query: { search?: string; limit?: number } = {}) {
    return apiRequest<IndiaLocationRecord[]>("/api/v1/locations/india", { query });
  },
};
