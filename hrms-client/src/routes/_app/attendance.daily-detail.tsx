import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataCard, EmptyState } from "@/components/ui-kit";
import { DailyExplanationView } from "@/domains/attendance/components/daily-explanation-view";
import { useAttendanceDailyCalendar, useAttendanceDailyExplanation } from "@/domains/attendance";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { asArray, asRecord, text, userFacingErrorMessage } from "@/shared/api";

interface SearchParams {
  date?: string;
  user_id?: string;
}

const OVERSIGHT_ROLES: Role[] = ["hr_admin", "main_admin", "manager", "auditor"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const Route = createFileRoute("/_app/attendance/daily-detail")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    date: typeof search.date === "string" && ISO_DATE.test(search.date) ? search.date : undefined,
    user_id:
      typeof search.user_id === "string" && UUID.test(search.user_id) ? search.user_id : undefined,
  }),
  component: AttendanceDailyDetail,
});

function AttendanceDailyDetail() {
  const { activeRole } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const date = search.date ?? localDate();
  const isOversight = Boolean(activeRole && OVERSIGHT_ROLES.includes(activeRole));
  const teamQuery = useAttendanceDailyCalendar({ date, page: 1, page_size: 100 }, isOversight);
  const employees = isOversight ? employeeOptions(teamQuery.data?.items) : [];
  const selectedUserId = isOversight
    ? employees.some((employee) => employee.id === search.user_id)
      ? search.user_id
      : employees[0]?.id
    : undefined;
  const explanationQuery = useAttendanceDailyExplanation(
    { date, user_id: selectedUserId },
    !isOversight || Boolean(selectedUserId),
  );

  const updateSearch = (next: SearchParams) =>
    navigate({
      to: "/attendance/daily-detail",
      search: {
        date: next.date ?? date,
        user_id: isOversight ? next.user_id : undefined,
      },
      replace: true,
    });

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-52">
          <label htmlFor="attendance-detail-date" className="mb-1.5 block text-xs font-medium">
            Work date
          </label>
          <Input
            id="attendance-detail-date"
            type="date"
            value={date}
            max={localDate()}
            onChange={(event) =>
              updateSearch({ date: event.target.value, user_id: selectedUserId })
            }
          />
        </div>

        {isOversight && (
          <div className="w-full sm:max-w-sm">
            <label className="mb-1.5 block text-xs font-medium" htmlFor="attendance-detail-user">
              Employee
            </label>
            <Select
              value={selectedUserId}
              disabled={teamQuery.isLoading || employees.length === 0}
              onValueChange={(userId) => updateSearch({ date, user_id: userId })}
            >
              <SelectTrigger id="attendance-detail-user">
                <SelectValue
                  placeholder={teamQuery.isLoading ? "Loading employees..." : "Select employee"}
                />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.employeeCode} - {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {teamQuery.isError && isOversight ? (
        <ErrorPanel error={teamQuery.error} />
      ) : isOversight && !teamQuery.isLoading && employees.length === 0 ? (
        <DataCard title="No employees" description={formatDate(date)}>
          <EmptyState
            icon={CalendarSearch}
            title="No visible attendance records"
            description="No active employees are available in your attendance scope for this date."
          />
        </DataCard>
      ) : explanationQuery.isLoading || (isOversight && teamQuery.isLoading) ? (
        <LoadingState />
      ) : explanationQuery.isError ? (
        <ErrorPanel error={explanationQuery.error} />
      ) : explanationQuery.data ? (
        <DailyExplanationView explanation={explanationQuery.data} />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="h-36 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: unknown }) {
  return (
    <DataCard title="Daily detail unavailable">
      <EmptyState
        title="Could not load attendance explanation"
        description={userFacingErrorMessage(error, "Attendance detail request failed.")}
      />
    </DataCard>
  );
}

function employeeOptions(value: unknown) {
  const seen = new Set<string>();
  return asArray(value)
    .map(asRecord)
    .map((record): EmployeeOption | null => {
      const employee = asRecord(record.employee);
      const id = text(record.employee_user_id);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        employeeCode: text(employee.employee_code, "UNKNOWN"),
        fullName: text(employee.full_name, "Unknown employee"),
      };
    })
    .filter((employee): employee is EmployeeOption => employee !== null)
    .sort((left, right) => left.employeeCode.localeCompare(right.employeeCode));
}

interface EmployeeOption {
  id: string;
  employeeCode: string;
  fullName: string;
}

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}
