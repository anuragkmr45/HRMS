import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EmploymentStatuses,
  Roles,
  type AuthUser,
  type CoreUser,
} from "#shared";
import {
  assertCanDecideRegularization,
  assertCanSeeAttendanceUser,
  assertCanUseSelfAttendance,
  canSeeAllAttendance,
  canSeeAttendanceUser,
  canUseSelfAttendance,
} from "../policy.js";

function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: randomUUID(),
    employee_code: "EMP001",
    email: "employee@example.com",
    full_name: "Employee One",
    department_id: randomUUID(),
    designation_id: randomUUID(),
    roles: [Roles.Employee],
    employment_status: EmploymentStatuses.Active,
    email_verified_at: null,
    email_verification_status: "verified",
    hierarchy_path: "company.manager.employee",
    ...overrides,
  };
}

function makeCoreUser(overrides: Partial<CoreUser> = {}): CoreUser {
  return {
    ...makeAuthUser(),
    manager_user_id: null,
    profile_photo_document_id: null,
    profile_photo_url: null,
    timezone: "Asia/Kolkata",
    joined_on: "2026-01-01",
    terminated_on: null,
    deleted_at: null,
    version: 1,
    ...overrides,
  };
}

describe("attendance policy", () => {
  describe("canUseSelfAttendance", () => {
    it("allows employee", () => {
      expect(canUseSelfAttendance(makeAuthUser())).toBe(true);
    });

    it("allows reviewer", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Reviewer],
          }),
        ),
      ).toBe(true);
    });

    it("allows director", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Director],
          }),
        ),
      ).toBe(true);
    });

    it("allows finance manager", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.FinanceManager],
          }),
        ),
      ).toBe(true);
    });

    it("allows asset manager", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.AssetManager],
          }),
        ),
      ).toBe(true);
    });

    it("rejects admin", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Admin],
          }),
        ),
      ).toBe(false);
    });

    it("rejects hr manager", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.HRManager],
          }),
        ),
      ).toBe(false);
    });

    it("rejects auditor", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Auditor],
          }),
        ),
      ).toBe(false);
    });

    it("rejects admin even when employee role is also present", () => {
      expect(
        canUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Admin, Roles.Employee],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("assertCanUseSelfAttendance", () => {
    it("does not throw for employee", () => {
      expect(() => assertCanUseSelfAttendance(makeAuthUser())).not.toThrow();
    });

    it("throws for admin", () => {
      expect(() =>
        assertCanUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Admin],
          }),
        ),
      ).toThrow();
    });

    it("throws for admin even when employee role is also present", () => {
      expect(() =>
        assertCanUseSelfAttendance(
          makeAuthUser({
            roles: [Roles.Admin, Roles.Employee],
          }),
        ),
      ).toThrow();
    });
  });

  describe("canSeeAllAttendance", () => {
    it("allows admin", () => {
      expect(
        canSeeAllAttendance(
          makeAuthUser({
            roles: [Roles.Admin],
          }),
        ),
      ).toBe(true);
    });

    it("allows hr manager", () => {
      expect(
        canSeeAllAttendance(
          makeAuthUser({
            roles: [Roles.HRManager],
          }),
        ),
      ).toBe(true);
    });

    it("allows auditor", () => {
      expect(
        canSeeAllAttendance(
          makeAuthUser({
            roles: [Roles.Auditor],
          }),
        ),
      ).toBe(true);
    });

    it("rejects employee", () => {
      expect(canSeeAllAttendance(makeAuthUser())).toBe(false);
    });
  });

  describe("canSeeAttendanceUser", () => {
    it("allows self", () => {
      const actor = makeAuthUser();

      const user = makeCoreUser({
        id: actor.id,
        hierarchy_path: actor.hierarchy_path,
      });

      expect(canSeeAttendanceUser(actor, user)).toBe(true);
    });

    it("allows reporting hierarchy", () => {
      const manager = makeAuthUser({
        hierarchy_path: "company.manager",
      });

      const employee = makeCoreUser({
        hierarchy_path: "company.manager.employee",
      });

      expect(canSeeAttendanceUser(manager, employee)).toBe(true);
    });

    it("allows admin", () => {
      const admin = makeAuthUser({
        roles: [Roles.Admin],
      });

      expect(canSeeAttendanceUser(admin, makeCoreUser())).toBe(true);
    });

    it("rejects unrelated employee", () => {
      const actor = makeAuthUser({
        hierarchy_path: "company.sales",
      });

      const user = makeCoreUser({
        hierarchy_path: "company.finance.employee",
      });

      expect(canSeeAttendanceUser(actor, user)).toBe(false);
    });
  });

  describe("assertCanSeeAttendanceUser", () => {
    it("does not throw for reporting hierarchy", () => {
      const manager = makeAuthUser({
        hierarchy_path: "company.manager",
      });

      const employee = makeCoreUser({
        hierarchy_path: "company.manager.employee",
      });

      expect(() => assertCanSeeAttendanceUser(manager, employee)).not.toThrow();
    });

    it("throws for unrelated employee", () => {
      const actor = makeAuthUser({
        hierarchy_path: "company.sales",
      });

      const user = makeCoreUser({
        hierarchy_path: "company.finance.employee",
      });

      expect(() => assertCanSeeAttendanceUser(actor, user)).toThrow();
    });
  });

  describe("assertCanDecideRegularization", () => {
    it("blocks self approval", () => {
      const actor = makeAuthUser();

      expect(() =>
        assertCanDecideRegularization(actor, {
          employee_user_id: actor.id,
          current_approver_user_id: null,
        }),
      ).toThrow();
    });

    it("allows assigned approver", () => {
      const actor = makeAuthUser();

      expect(() =>
        assertCanDecideRegularization(actor, {
          employee_user_id: randomUUID(),
          current_approver_user_id: actor.id,
        }),
      ).not.toThrow();
    });

    it("allows admin", () => {
      const admin = makeAuthUser({
        roles: [Roles.Admin],
      });

      expect(() =>
        assertCanDecideRegularization(admin, {
          employee_user_id: randomUUID(),
          current_approver_user_id: null,
        }),
      ).not.toThrow();
    });

    it("allows hr manager", () => {
      const hr = makeAuthUser({
        roles: [Roles.HRManager],
      });

      expect(() =>
        assertCanDecideRegularization(hr, {
          employee_user_id: randomUUID(),
          current_approver_user_id: null,
        }),
      ).not.toThrow();
    });

    it("allows auditor", () => {
      const auditor = makeAuthUser({
        roles: [Roles.Auditor],
      });

      expect(() =>
        assertCanDecideRegularization(auditor, {
          employee_user_id: randomUUID(),
          current_approver_user_id: null,
        }),
      ).not.toThrow();
    });

    it("rejects unrelated employee", () => {
      const actor = makeAuthUser();

      expect(() =>
        assertCanDecideRegularization(actor, {
          employee_user_id: randomUUID(),
          current_approver_user_id: randomUUID(),
        }),
      ).toThrow();
    });
  });
});
