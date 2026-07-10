import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coreApi, mapApiUserToEmployee, mapApiUsersToEmployees } from "@/domains/core";
import {
  asArray,
  asRecord,
  isUuid,
  pageItems,
  text,
  useApiRouteEnabled,
  withApiFallback,
  type ApiRecord,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { EMPLOYEES, type Employee, type AuditEntry, type RoleHistoryEntry } from "./mock/employees";
import { DEPARTMENTS as SEED_DEPTS, type Department } from "./mock/departments";
import { DESIGNATIONS as SEED_DESIGS, type Designation } from "./mock/designations";
import type { ProfilePhotoPolicy } from "@/shared/uploads/profile-photo";

const EMP_KEY = "hawkaii_employees_v2";
const DEPT_KEY = "hawkaii_departments_v1";
const DESG_KEY = "hawkaii_designations_v1";

const backendRoleByUiRole: Record<string, string> = {
  main_admin: "Admin",
  hr_admin: "HR Manager",
  employee: "Employee",
  manager: "Reviewer",
  project_manager: "Reviewer",
  finance_manager: "Finance Manager",
  asset_admin: "Asset Manager",
  helpdesk_agent: "Employee",
};

function apiEmploymentStatus(status: Employee["status"]): string {
  switch (status) {
    case "exited":
      return "terminated";
    case "active":
    case "probation":
    case "confirmed":
    case "notice_period":
      return "active";
    case "draft":
    case "invited":
    case "onboarding":
    case "inactive":
    default:
      return "inactive";
  }
}

function selectorLevel(value: unknown): Designation["level"] {
  const level = typeof value === "number" ? value : Number(value);
  if (level >= 6) return "Director";
  if (level >= 5) return "Principal";
  if (level >= 4) return "Lead";
  if (level >= 3) return "Senior";
  if (level <= 1) return "Junior";
  return "Mid";
}

interface Ctx {
  employees: Employee[];
  departments: Department[];
  designations: Designation[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  profilePhotoPolicy?: ProfilePhotoPolicy;
  upsert: (e: Employee, actor?: string) => Promise<Employee>;
  uploadProfilePhoto: (id: string, file: File) => Promise<Employee>;
  remove: (id: string, actor?: string) => void;
  setStatus: (id: string, status: Employee["status"], actor?: string) => Promise<void>;
  setLogin: (id: string, enabled: boolean, actor?: string) => Promise<void>;
  setRoles: (id: string, roles: string[], actor?: string) => Promise<void>;
  addDepartment: (name: string, description?: string) => Department;
  addDesignation: (title: string, department: string) => Designation;
  reset: () => void;
}

const Ctx = React.createContext<Ctx | null>(null);

function loadLs<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLs(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(v));
}

const newAudit = (actor: string, action: string, remarks?: string): AuditEntry => ({
  id: "a_" + Math.random().toString(36).slice(2, 10),
  at: new Date().toISOString(),
  actor,
  action,
  remarks,
});

export function EmployeesProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = React.useState<Employee[]>(EMPLOYEES);
  const [departments, setDepartments] = React.useState<Department[]>(SEED_DEPTS);
  const [designations, setDesignations] = React.useState<Designation[]>(SEED_DESIGS);
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled([
    "/dashboard",
    "/employees",
    "/projects",
    "/team-utilization",
    "/timesheet",
    "/assets",
  ]);

  React.useEffect(() => {
    setEmployees(loadLs(EMP_KEY, EMPLOYEES));
    setDepartments(loadLs(DEPT_KEY, SEED_DEPTS));
    setDesignations(loadLs(DESG_KEY, SEED_DESIGS));
  }, []);

  const persistE = (next: Employee[]) => {
    setEmployees(next);
    saveLs(EMP_KEY, next);
  };
  const persistD = (next: Department[]) => {
    setDepartments(next);
    saveLs(DEPT_KEY, next);
  };
  const persistG = (next: Designation[]) => {
    setDesignations(next);
    saveLs(DESG_KEY, next);
  };

  const apiSelectorsQuery = useQuery({
    queryKey: queryKeys.list("core", "org-selectors"),
    queryFn: () =>
      withApiFallback(
        async () => coreApi.orgSelectors(),
        () => ({ departments, designations, managers: [], roles: [] }),
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.referenceStaleMs,
  });

  const profilePhotoPolicyQuery = useQuery({
    queryKey: queryKeys.action("core", "users", "profile-photo-policy"),
    queryFn: () => coreApi.profilePhotoPolicy(),
    enabled: apiEnabled,
    staleTime: queryTimings.referenceStaleMs,
  });

  const visibleDepartments = React.useMemo<Department[]>(() => {
    const rows = asArray(asRecord(apiSelectorsQuery.data).departments);
    if (!apiEnabled || rows.length === 0) return departments;
    return rows.map((value) => {
      const row = asRecord(value);
      const id = text(row.id);
      const name = text(row.name, "Department");
      const head = employees.find(
        (employee) => employee.department === name && employee.manager !== "—",
      )?.manager;
      return {
        id,
        apiId: id,
        name,
        costCenter: text(row.cost_center) || null,
        head: head ?? "—",
        headcount: employees.filter((employee) => employee.department === name).length,
      };
    });
  }, [apiEnabled, apiSelectorsQuery.data, departments, employees]);

  const visibleDesignations = React.useMemo<Designation[]>(() => {
    const rows = asArray(asRecord(apiSelectorsQuery.data).designations);
    if (!apiEnabled || rows.length === 0) return designations;
    return rows.map((value) => {
      const row = asRecord(value);
      const id = text(row.id);
      return {
        id,
        apiId: id,
        title: text(row.title, "Employee"),
        level: selectorLevel(row.level),
        department: "—",
      };
    });
  }, [apiEnabled, apiSelectorsQuery.data, designations]);

  const invalidateCoreUsers = async () => {
    const core = queryKeys.domain("core");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...core, "users"] }),
      queryClient.invalidateQueries({ queryKey: [...core, "user"] }),
      queryClient.invalidateQueries({ queryKey: [...core, "user-subtree"] }),
      queryClient.invalidateQueries({ queryKey: [...core, "user-role-history"] }),
      queryClient.invalidateQueries({ queryKey: [...core, "user-audit"] }),
    ]);
  };

  const apiEmployeesQuery = useQuery({
    queryKey: queryKeys.list("core", "users", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await coreApi.listUsersPartial({ page_size: 100 });
          return mapApiUsersToEmployees(pageItems(response), employees);
        },
        () => employees,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const visibleEmployees = apiEnabled ? (apiEmployeesQuery.data ?? []) : employees;
  const apiError =
    apiEmployeesQuery.error instanceof Error
      ? apiEmployeesQuery.error
      : apiSelectorsQuery.error instanceof Error
        ? apiSelectorsQuery.error
        : null;

  const findEmployee = (id: string) =>
    visibleEmployees.find((employee) => employee.id === id || employee.apiId === id);

  const resolveDepartmentId = (employee: Employee): string | null => {
    const department = visibleDepartments.find(
      (candidate) => candidate.name === employee.department || candidate.id === employee.department,
    );
    const id = department?.apiId ?? department?.id;
    return id && isUuid(id) ? id : null;
  };

  const resolveDesignationId = (employee: Employee): string | null => {
    const designation = visibleDesignations.find(
      (candidate) =>
        candidate.title === employee.designation || candidate.id === employee.designation,
    );
    const id = designation?.apiId ?? designation?.id;
    return id && isUuid(id) ? id : null;
  };

  const resolveManagerId = (employee: Employee): string | null => {
    const manager = visibleEmployees.find(
      (candidate) => candidate.name === employee.manager || candidate.id === employee.manager,
    );
    const id = manager?.apiId;
    return id && isUuid(id) ? id : null;
  };

  const employeeWriteBody = (employee: Employee): ApiRecord => {
    const departmentId = resolveDepartmentId(employee);
    const designationId = resolveDesignationId(employee);
    if (!departmentId || !designationId) {
      throw new Error("Employee department and designation must come from backend selectors.");
    }
    return {
      employee_code: employee.id,
      email: employee.email,
      full_name: employee.name,
      department_id: departmentId,
      designation_id: designationId,
      manager_user_id: resolveManagerId(employee),
      roles: Array.from(
        new Set(employee.systemRoles.map((role) => backendRoleByUiRole[role] ?? "Employee")),
      ),
      employment_status: apiEmploymentStatus(employee.status),
      joined_on: employee.joinedAt,
      login_enabled: employee.loginEnabled,
    };
  };

  const updateMutation = useMutation({
    mutationFn: (employee: Employee) => {
      if (!employee.apiId || !isUuid(employee.apiId)) {
        return coreApi.createUser(employeeWriteBody(employee));
      }
      const {
        employee_code: _employeeCode,
        login_enabled: _loginEnabled,
        roles: _roles,
        ...body
      } = employeeWriteBody(employee);
      return coreApi.updateUser(employee.apiId, {
        ...body,
        expected_version: employee.version ?? 1,
      });
    },
    onSuccess: invalidateCoreUsers,
  });

  const statusMutation = useMutation({
    mutationFn: ({ employee, status }: { employee: Employee; status: Employee["status"] }) => {
      if (!employee.apiId || !isUuid(employee.apiId)) return Promise.resolve({});
      const expected_version = employee.version ?? 1;
      if (status === "active" || status === "confirmed" || status === "probation") {
        return coreApi.activateUser(employee.apiId, { expected_version });
      }
      if (status === "inactive" || status === "exited") {
        return coreApi.deactivateUser(employee.apiId, {
          expected_version,
          status: status === "exited" ? "terminated" : "inactive",
        });
      }
      return coreApi.updateUser(employee.apiId, {
        expected_version,
        employment_status: apiEmploymentStatus(status),
      });
    },
    onSuccess: invalidateCoreUsers,
  });

  const loginMutation = useMutation({
    mutationFn: ({ employee, enabled }: { employee: Employee; enabled: boolean }) => {
      if (!employee.apiId || !isUuid(employee.apiId)) return Promise.resolve({});
      const expected_version = employee.version ?? 1;
      return enabled
        ? coreApi.enableLogin(employee.apiId, { expected_version, invite_email: true })
        : coreApi.disableLogin(employee.apiId, { expected_version });
    },
    onSuccess: invalidateCoreUsers,
  });

  const rolesMutation = useMutation({
    mutationFn: ({ employee, roles }: { employee: Employee; roles: string[] }) => {
      if (!employee.apiId || !isUuid(employee.apiId)) return Promise.resolve({});
      return coreApi.replaceRoles(employee.apiId, {
        expected_version: employee.version ?? 1,
        roles: Array.from(new Set(roles.map((role) => backendRoleByUiRole[role] ?? "Employee"))),
      });
    },
    onSuccess: invalidateCoreUsers,
  });

  const profilePhotoMutation = useMutation({
    mutationFn: ({ userId, file }: { userId: string; file: File }) => {
      const formData = new FormData();
      formData.set("file", file);
      return coreApi.uploadProfilePhoto(userId, formData);
    },
    onSuccess: invalidateCoreUsers,
  });

  const upsert: Ctx["upsert"] = async (e, actor = "Rahul Verma") => {
    const exists = employees.some((x) => x.id === e.id);
    const action = exists ? "Profile updated" : "Profile created";
    const next: Employee = {
      ...e,
      audit: [newAudit(actor, action), ...(e.audit ?? [])],
    };
    if (apiEnabled) {
      const response = await updateMutation.mutateAsync({ ...(findEmployee(e.id) ?? {}), ...next });
      return mapApiUserToEmployee(response, next);
    }
    persistE(exists ? employees.map((x) => (x.id === e.id ? next : x)) : [next, ...employees]);
    return next;
  };

  const uploadProfilePhoto: Ctx["uploadProfilePhoto"] = async (id, file) => {
    const current = findEmployee(id);
    const apiUserId =
      current?.apiId && isUuid(current.apiId) ? current.apiId : isUuid(id) ? id : null;
    if (apiEnabled) {
      if (!apiUserId) {
        throw new Error("Employee must be saved before uploading a profile photo.");
      }
      const response = await profilePhotoMutation.mutateAsync({ userId: apiUserId, file });
      return mapApiUserToEmployee(response, current);
    }
    const previewUrl = URL.createObjectURL(file);
    const next = employees.map((employee) =>
      employee.id === id || employee.apiId === id
        ? { ...employee, avatarUrl: previewUrl, profilePhotoDocumentId: undefined }
        : employee,
    );
    persistE(next);
    const updated = next.find((employee) => employee.id === id || employee.apiId === id) ?? current;
    if (!updated) throw new Error("Employee must be saved before uploading a profile photo.");
    return updated;
  };

  const remove: Ctx["remove"] = (id) => persistE(employees.filter((x) => x.id !== id));

  const setStatus: Ctx["setStatus"] = async (id, status, actor = "Rahul Verma") => {
    const current = findEmployee(id);
    if (apiEnabled && current) {
      if (status === "notice_period") {
        throw new Error("Notice-period status is not available from the backend yet.");
      }
      await statusMutation.mutateAsync({ employee: current, status });
      return;
    }
    persistE(
      employees.map((x) =>
        x.id === id
          ? {
              ...x,
              status,
              audit: [newAudit(actor, "Status changed", `Status set to ${status}`), ...x.audit],
            }
          : x,
      ),
    );
  };

  const setLogin: Ctx["setLogin"] = async (id, enabled, actor = "Rahul Verma") => {
    const current = findEmployee(id);
    if (apiEnabled && current) {
      await loginMutation.mutateAsync({ employee: current, enabled });
      return;
    }
    persistE(
      employees.map((x) =>
        x.id === id
          ? {
              ...x,
              loginEnabled: enabled,
              audit: [newAudit(actor, enabled ? "Login enabled" : "Login disabled"), ...x.audit],
            }
          : x,
      ),
    );
  };

  const setRoles: Ctx["setRoles"] = async (id, roles, actor = "Rahul Verma") => {
    const current = findEmployee(id);
    if (apiEnabled && current) {
      await rolesMutation.mutateAsync({ employee: current, roles });
      return;
    }
    persistE(
      employees.map((x) => {
        if (x.id !== id) return x;
        const entry: RoleHistoryEntry = {
          at: new Date().toISOString(),
          actor,
          from: x.systemRoles,
          to: roles,
        };
        return {
          ...x,
          systemRoles: roles,
          roleHistory: [entry, ...x.roleHistory],
          audit: [newAudit(actor, "Roles updated", roles.join(", ")), ...x.audit],
        };
      }),
    );
  };

  const addDepartment: Ctx["addDepartment"] = (name, _description) => {
    const id = `DEP-${String(visibleDepartments.length + 1).padStart(2, "0")}`;
    const dept: Department = { id, name, head: "—", headcount: 0 };
    persistD([...departments, dept]);
    return dept;
  };

  const addDesignation: Ctx["addDesignation"] = (title, department) => {
    const id = `DSG-${String(visibleDesignations.length + 1).padStart(2, "0")}`;
    const desig: Designation = { id, title, level: "Mid", department };
    persistG([...designations, desig]);
    return desig;
  };

  const reset = () => {
    persistE(EMPLOYEES);
    persistD(SEED_DEPTS);
    persistG(SEED_DESIGS);
  };

  return (
    <Ctx.Provider
      value={{
        employees: visibleEmployees,
        departments: visibleDepartments,
        designations: visibleDesignations,
        loading: apiEnabled && (apiEmployeesQuery.isLoading || apiSelectorsQuery.isLoading),
        error: apiError,
        isApiBacked: apiEnabled && Boolean(apiEmployeesQuery.data),
        profilePhotoPolicy: profilePhotoPolicyQuery.data,
        upsert,
        uploadProfilePhoto,
        remove,
        setStatus,
        setLogin,
        setRoles,
        addDepartment,
        addDesignation,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEmployees() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useEmployees must be used inside EmployeesProvider");
  return ctx;
}

export function nextEmployeeId(existing: Employee[]): string {
  const max = existing.reduce((m, e) => {
    const n = parseInt(e.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `EMP-${max + 1}`;
}
