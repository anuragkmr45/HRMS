import {
  EmploymentStatuses,
  type CoreUser,
  type RoleKey,
  type UUID,
} from "#shared";
import { companyContextRequired, forbidden, unauthorized } from "./errors.js";
import type {
  CompanyProfileRecord,
  MemoryDataStore,
  UserSessionPreferenceRecord,
} from "./data-store.js";

export interface ActiveCompanyMembershipContext {
  userId: UUID;
  companyId: UUID;
  activeRole: RoleKey;
  user: CoreUser;
  company: CompanyProfileRecord;
  preference: UserSessionPreferenceRecord;
}

export interface ResolveActiveCompanyMembershipContextInput {
  userId: UUID;
  requestedCompanyId?: UUID | null;
  operation: string;
  requireActiveEmployment?: boolean;
}

/**
 * Resolves the user's one assigned company from session preferences. This is
 * intentionally fail-closed so future membership storage can replace the
 * implementation without callers selecting a company themselves.
 */
export function resolveActiveCompanyMembershipContext(
  store: MemoryDataStore,
  input: ResolveActiveCompanyMembershipContextInput,
): ActiveCompanyMembershipContext {
  const user = store.users.find((candidate) => candidate.id === input.userId);
  if (!user || user.deleted_at) {
    throw unauthorized("User no longer exists", {
      user_id: input.userId,
      operation: input.operation,
    });
  }

  if (
    input.requireActiveEmployment &&
    user.employment_status !== EmploymentStatuses.Active
  ) {
    throw unauthorized("User account is inactive or blocked", {
      user_id: input.userId,
      operation: input.operation,
    });
  }

  const preference = store.userSessionPreferences.find(
    (candidate) => candidate.user_id === user.id,
  );
  if (!preference || !preference.company_id) {
    throw companyContextRequired({
      user_id: input.userId,
      company_id: null,
      operation: input.operation,
    });
  }

  const company = store.companyProfiles.find(
    (candidate) => candidate.id === preference.company_id,
  );
  if (!company || company.status !== "active") {
    throw companyContextRequired({
      user_id: input.userId,
      company_id: preference.company_id,
      operation: input.operation,
    });
  }

  if (!user.roles.includes(preference.active_role)) {
    throw forbidden("Selected role is not assigned to this user.", {
      user_id: input.userId,
      company_id: company.id,
      active_role: preference.active_role,
      operation: input.operation,
    });
  }

  if (
    input.requestedCompanyId !== undefined &&
    input.requestedCompanyId !== company.id
  ) {
    throw forbidden("Requested company does not match the user's assignment.", {
      user_id: input.userId,
      company_id: company.id,
      requested_company_id: input.requestedCompanyId,
      operation: input.operation,
    });
  }

  return {
    userId: user.id,
    companyId: company.id,
    activeRole: preference.active_role,
    user,
    company,
    preference,
  };
}

export function assertUserInCompanyMembershipContext(
  store: MemoryDataStore,
  input: {
    userId: UUID;
    companyId: UUID;
    operation: string;
    requireActiveEmployment?: boolean;
  },
): ActiveCompanyMembershipContext {
  return resolveActiveCompanyMembershipContext(store, {
    userId: input.userId,
    requestedCompanyId: input.companyId,
    operation: input.operation,
    requireActiveEmployment: input.requireActiveEmployment,
  });
}
