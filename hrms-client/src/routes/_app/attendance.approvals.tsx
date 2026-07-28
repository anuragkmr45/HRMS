import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ManagerAttendanceReviewQueue } from "@/domains/attendance/manager-review-queue";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";

export const Route = createFileRoute("/_app/attendance/approvals")({
  component: AttendanceApprovalsPage,
});

const ATTENDANCE_REVIEW_ROLES: Role[] = ["manager", "director", "hr_admin", "main_admin"];

function AttendanceApprovalsPage() {
  const { activeRole } = useAuth();
  const allowed = Boolean(activeRole && ATTENDANCE_REVIEW_ROLES.includes(activeRole));

  if (!allowed) return <Navigate to="/attendance" />;

  return <ManagerAttendanceReviewQueue enabled={allowed} />;
}
