import { describe, expect, it } from "vitest";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { AuthService } from "../service.js";

describe("auth onboarding company scope", () => {
  it("stores onboarding master data and policy defaults under the bootstrapped company", async () => {
    const store = createMemoryDataStore();
    const service = new AuthService(store, "test-secret");

    const signup = await service.signup({
      company_name: "Scoped Company",
      full_name: "Scoped Founder",
      email: "scoped-founder@example.test",
      timezone: "Asia/Kolkata",
      locale: "en-IN"
    });
    const signupDev = signup as typeof signup & { dev_only: { email_verification_token: string } };
    const emailVerificationToken = signupDev.dev_only.email_verification_token;
    const verification = service.verifyEmail({ token: emailVerificationToken });
    const verificationDev = verification as typeof verification & {
      dev_only: { password_setup_token: string; company_bootstrap_token: string };
    };
    const passwordSetupToken = verificationDev.dev_only.password_setup_token;
    const bootstrapToken = verificationDev.dev_only.company_bootstrap_token;

    service.setPassword({
      token: passwordSetupToken,
      password: "Founder@12345",
      confirm_password: "Founder@12345"
    });

    const bootstrap = service.bootstrapCompany({
      bootstrap_token: bootstrapToken,
      company_profile: {
        company_name: "Scoped Company India",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        fiscal_year_start_month: 4
      },
      departments: ["Engineering", "Customer Success"],
      designations: ["Founder", "Support Lead"],
      first_admin_profile: {
        full_name: "Scoped Admin",
        landing_page: "/dashboard"
      }
    });

    const companyId = bootstrap.company.id;
    const companyDepartments = store.departments.filter((department) => department.company_id === companyId);
    const companyDesignations = store.designations.filter((designation) => designation.company_id === companyId);
    const companyPolicies = store.adminPolicies.filter((policy) => policy.company_id === companyId);
    const admin = store.users.find((user) => user.id === bootstrap.admin_user.id);

    expect(companyDepartments.map((department) => department.name)).toEqual(["Engineering", "Customer Success"]);
    expect(companyDesignations.map((designation) => designation.title)).toEqual(["Founder", "Support Lead"]);
    expect(companyPolicies.map((policy) => policy.policy_key).sort()).toEqual(["asset", "attendance", "expense", "leave", "sla", "timesheet"]);
    expect(admin?.department_id).toBe(companyDepartments[0]!.id);
    expect(admin?.designation_id).toBe(companyDesignations[0]!.id);
    expect(store.departments.filter((department) => department.company_id === null).map((department) => department.name).sort()).toEqual([
      "Finance",
      "Sales"
    ]);
  });
});
