import { describe, expect, it, vi } from "vitest";
import {
  createMemoryDataStore,
  seedIds,
  type MemoryDataStore,
} from "../../../platform/data-store.js";
import { AttendanceCommandService } from "../command-service.js";
import { AttendanceService } from "../service.js";

const companyAId = "11111111-1111-4111-8111-000000000001";
const companyBId = "22222222-2222-4222-8222-000000000001";
const staleCompanyId = "33333333-3333-4333-8333-000000000001";

describe("AttendanceService company tenancy", () => {
  it("uses the exact assigned company for a self punch", () => {
    const { service, employeeA, store } = tenancyStore();

    service.punch(employeeA, punchInput());

    expect(store.attendancePunches).toHaveLength(1);
    expect(store.attendancePunches[0]?.company_id).toBe(companyAId);
  });

  it("passes the resolved company into the PostgreSQL punch command", async () => {
    const { service, employeeA, store } = tenancyStore();
    store.pgPool = {} as NonNullable<MemoryDataStore["pgPool"]>;
    const execute = vi
      .spyOn(AttendanceCommandService.prototype, "execute")
      .mockResolvedValue({ command_id: "command-a" });

    await service.punchPostgres(employeeA, {
      ...punchInput(),
      idempotency_key: "punch-command-a",
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: companyAId }),
    );
    execute.mockRestore();
  });

  it.each([
    [
      "missing preference",
      (store: MemoryDataStore) => removePreference(store, seedIds.employee1),
    ],
    [
      "null company assignment",
      (store: MemoryDataStore) => assignCompany(store, seedIds.employee1, null),
    ],
    [
      "stale company assignment",
      (store: MemoryDataStore) =>
        assignCompany(store, seedIds.employee1, staleCompanyId),
    ],
    [
      "inactive assigned company",
      (store: MemoryDataStore) =>
        setCompanyStatus(store, companyAId, "inactive"),
    ],
  ])("rejects attendance with a %s", (_label, mutate) => {
    const { service, employeeA, store } = tenancyStore();
    mutate(store);

    expect(() => service.punch(employeeA, punchInput())).toThrowError(
      "Company context is required",
    );
  });

  it("rejects live attendance for an inactive actor", () => {
    const { service, employeeA, store } = tenancyStore();
    employeeA.employment_status = "inactive";

    expect(() => service.punch(employeeA, punchInput())).toThrowError(
      "User account is inactive or blocked",
    );
    expect(store.attendancePunches).toHaveLength(0);
  });

  it("accepts a matching requested company ID and rejects a mismatch or null", () => {
    const { service, employeeA } = tenancyStore();
    const query = { page: 1, page_size: 10 };

    expect(
      service.listMyPunches(employeeA, { ...query, company_id: companyAId })
        .total,
    ).toBe(0);
    expect(() =>
      service.listMyPunches(employeeA, { ...query, company_id: companyBId }),
    ).toThrowError("Requested company does not match");
    expect(() =>
      service.listMyPunches(employeeA, { ...query, company_id: null }),
    ).toThrowError("Requested company does not match");
  });

  it("prevents a Company A Admin from reading Company B punches and daily records", () => {
    const { adminA, employeeB, service } = tenancyStore();
    service.punch(employeeB, punchInput());

    expect(() =>
      service.monthlyCalendar(adminA, {
        page: 1,
        page_size: 10,
        month: "2026-07",
        user_id: employeeB.id,
      }),
    ).toThrowError("Requested company does not match");
    expect(() =>
      service.dailyCalendar(adminA, {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
        user_id: employeeB.id,
      }),
    ).toThrowError("Requested company does not match");
  });

  it("does not reveal a Company B regularization to Company A", () => {
    const { adminA, employeeB, service } = tenancyStore();
    const request = service.createRegularization(employeeB, {
      work_date: "2026-07-08",
      reason: "Missed punch",
      requested_punches: [{ event_type: "check_in", occurred_at: "2026-07-08T04:00:00.000Z" }],
    });

    expect(() =>
      service.decideRegularization(adminA, request.id, {
        decision: "approve",
        expected_version: 1,
      }),
    ).toThrowError("Attendance regularization request not found");
  });

  it("rejects a reassigned regularization employee before any decision mutation", () => {
    const { adminA, employeeA, service, store } = tenancyStore();
    const request = service.createRegularization(employeeA, {
      work_date: "2026-07-08",
      reason: "Missed punch",
      requested_punches: [
        {
          event_type: "check_in",
          occurred_at: "2026-07-08T04:00:00.000Z",
        },
      ],
    });
    assignCompany(store, employeeA.id, companyBId);
    const before = {
      regularizations: JSON.stringify(store.attendanceRegularizations),
      punches: JSON.stringify(store.attendancePunches),
      dayRecords: JSON.stringify(store.attendanceDayRecords),
      outbox: JSON.stringify(store.outbox),
    };

    expect(() =>
      service.decideRegularization(adminA, request.id, {
        decision: "approve",
        expected_version: request.version,
      }),
    ).toThrowError("Requested company does not match");
    expect(JSON.stringify(store.attendanceRegularizations)).toBe(
      before.regularizations,
    );
    expect(JSON.stringify(store.attendancePunches)).toBe(before.punches);
    expect(JSON.stringify(store.attendanceDayRecords)).toBe(before.dayRecords);
    expect(JSON.stringify(store.outbox)).toBe(before.outbox);
  });

  it("prevents a Company A Admin from adding a Company B employee to team views or exports", async () => {
    const { adminA, employeeB, service } = tenancyStore();

    expect(() =>
      service.dailyCalendar(adminA, {
        page: 1,
        page_size: 10,
        date: "2026-07-08",
        user_id: employeeB.id,
      }),
    ).toThrowError("Requested company does not match");
    await expect(
      service.createExportJob(adminA, {
        filters: { employee_user_id: employeeB.id },
      }),
    ).rejects.toThrow("Requested company does not match");
  });

  it("returns user not found for an unknown export target", async () => {
    const { adminA, service } = tenancyStore();

    await expect(
      service.createExportJob(adminA, {
        filters: { employee_user_id: "66666666-6666-4666-8666-000000000001" },
      }),
    ).rejects.toThrow("User not found");
  });

  it("keeps same employee/date records isolated by company", () => {
    const { employeeA, service, store } = tenancyStore();
    service.punch(employeeA, punchInput());
    const ownDay = store.attendanceDayRecords[0];
    if (!ownDay) throw new Error("Expected Company A day record");
    store.attendanceDayRecords.push({
      ...ownDay,
      id: "44444444-4444-4444-8444-000000000001",
      company_id: companyBId,
      work_minutes: 99999,
    });

    const result = service.dailyCalendar(employeeA, {
      page: 1,
      page_size: 10,
      date: "2026-07-08",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.work_minutes).not.toBe(99999);
  });

  it("keeps terminated users visible for same-company historical monthly calendars", () => {
    const { adminA, employeeA, service } = tenancyStore();
    employeeA.employment_status = "terminated";

    const result = service.monthlyCalendar(adminA, {
      page: 1,
      page_size: 10,
      month: "2026-07",
      user_id: employeeA.id,
    });

    expect(result.user.employee_code).toBe(employeeA.employee_code);
  });
});

function tenancyStore() {
  const store = createMemoryDataStore();
  addCompany(store, companyAId, "company-a");
  addCompany(store, companyBId, "company-b");
  assignCompany(store, seedIds.admin, companyAId);
  assignCompany(store, seedIds.employee1, companyAId);
  assignCompany(store, seedIds.employee2, companyBId);
  const adminA = userFor(store, seedIds.admin);
  const employeeA = userFor(store, seedIds.employee1);
  const employeeB = userFor(store, seedIds.employee2);
  return {
    store,
    service: new AttendanceService(store),
    adminA,
    employeeA,
    employeeB,
  };
}

function punchInput() {
  return {
    event_type: "check_in" as const,
    occurred_at: "2026-07-08T04:00:00.000Z",
    work_mode: "office" as const,
    source: "web" as const,
    metadata: {},
  };
}

function addCompany(store: MemoryDataStore, id: string, slug: string) {
  const source = store.companyProfiles[0];
  if (!source) throw new Error("Seed company is missing");
  store.companyProfiles.push({
    ...source,
    id,
    company_name: slug,
    company_slug: slug,
  });
}

function assignCompany(
  store: MemoryDataStore,
  userId: string,
  companyId: string | null,
) {
  const preference = store.userSessionPreferences.find(
    (candidate) => candidate.user_id === userId,
  );
  if (!preference) throw new Error("Seed preference is missing");
  preference.company_id = companyId;
}

function removePreference(store: MemoryDataStore, userId: string) {
  const index = store.userSessionPreferences.findIndex(
    (candidate) => candidate.user_id === userId,
  );
  if (index < 0) throw new Error("Seed preference is missing");
  store.userSessionPreferences.splice(index, 1);
}

function setCompanyStatus(
  store: MemoryDataStore,
  companyId: string,
  status: "active" | "inactive",
) {
  const company = store.companyProfiles.find(
    (candidate) => candidate.id === companyId,
  );
  if (!company) throw new Error("Company is missing");
  company.status = status;
}

function userFor(store: MemoryDataStore, userId: string) {
  const user = store.users.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Seed user is missing");
  return user;
}
