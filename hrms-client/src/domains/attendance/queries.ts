import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { attendanceApi } from "./api";
import type {
  AttendanceExportBody,
  AttendancePunchBody,
  AttendanceQuery,
  AttendanceRegularizationBody,
  AttendanceRegularizationDecisionBody,
} from "./api";

export function useMyAttendanceSummary(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "summary-my", query),
    queryFn: () => attendanceApi.mySummary(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useTeamAttendanceSummary(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "summary-team", query),
    queryFn: () => attendanceApi.teamSummary(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceMonthlyCalendar(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "calendar-monthly", query),
    queryFn: () => attendanceApi.monthlyCalendar(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceDailyCalendar(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "calendar-daily", query),
    queryFn: () => attendanceApi.dailyCalendar(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceExceptions(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "exceptions", query),
    queryFn: () => attendanceApi.listExceptions(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyAttendancePunches(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "punches-my", query),
    queryFn: () => attendanceApi.listMyPunches(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useMyAttendanceRegularizations(query: AttendanceQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "regularizations-my", query),
    queryFn: () => attendanceApi.listMyRegularizations(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useManagerAttendanceRegularizationQueue(
  query: AttendanceQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.list("attendance", "regularizations-manager-queue", query),
    queryFn: () => attendanceApi.managerRegularizationQueue(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAttendancePunchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendancePunchBody) => attendanceApi.punch(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceRegularizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendanceRegularizationBody) => attendanceApi.createRegularization(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}

export function useAttendanceExportMutation() {
  return useMutation({
    mutationFn: (input: AttendanceExportBody) => attendanceApi.createExport(input),
  });
}

export function useAttendanceRegularizationDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AttendanceRegularizationDecisionBody }) =>
      attendanceApi.decideRegularization(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("attendance") }),
  });
}
