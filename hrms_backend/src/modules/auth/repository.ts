import type { CoreUser, UUID } from "#shared";
import type {
  AuthTokenRecord,
  CompanyProfileRecord,
  MemoryDataStore,
  UserCredentialRecord,
  UserSessionPreferenceRecord,
} from "../../platform/data-store.js";

export class AuthRepository {
  constructor(private readonly store: MemoryDataStore) {}

  findUserByEmployeeCode(employeeCode: string): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employee_code.toLowerCase() === employeeCode.toLowerCase() &&
          user.employment_status === "active" &&
          !user.deleted_at,
      ) ?? null
    );
  }

  findUserByEmail(email: string): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.email.toLowerCase() === email.toLowerCase() && !user.deleted_at,
      ) ?? null
    );
  }

  findActivePasswordHash(userId: string): string | null {
    return this.findActiveCredential(userId)?.password_hash ?? null;
  }

  findActiveCredential(userId: string): UserCredentialRecord | null {
    return (
      this.store.userCredentials.find(
        (credential) =>
          credential.user_id === userId &&
          credential.status === "active" &&
          !credential.deleted_at,
      ) ?? null
    );
  }

  findTokenByHash(
    tokenHash: string,
    tokenType: AuthTokenRecord["token_type"],
  ): AuthTokenRecord | null {
    return (
      this.store.authTokens.find(
        (token) =>
          token.token_hash === tokenHash && token.token_type === tokenType,
      ) ?? null
    );
  }

  activeTokensForUser(
    userId: UUID,
    tokenType: AuthTokenRecord["token_type"],
  ): AuthTokenRecord[] {
    return this.store.authTokens.filter(
      (token) =>
        token.user_id === userId &&
        token.token_type === tokenType &&
        token.status === "active",
    );
  }

  activeTokensForEmail(
    email: string,
    tokenType: AuthTokenRecord["token_type"],
  ): AuthTokenRecord[] {
    const normalized = email.toLowerCase();
    return this.store.authTokens.filter(
      (token) =>
        token.email?.toLowerCase() === normalized &&
        token.token_type === tokenType &&
        token.status === "active",
    );
  }

  findCompanyBySlug(slug: string): CompanyProfileRecord | null {
    return (
      this.store.companyProfiles.find(
        (company) => company.company_slug.toLowerCase() === slug.toLowerCase(),
      ) ?? null
    );
  }

  findCompanyById(id: UUID): CompanyProfileRecord | null {
    return (
      this.store.companyProfiles.find((company) => company.id === id) ?? null
    );
  }

  upsertSessionPreference(
    preference: UserSessionPreferenceRecord,
  ): UserSessionPreferenceRecord {
    const index = this.store.userSessionPreferences.findIndex(
      (candidate) => candidate.user_id === preference.user_id,
    );
    if (index >= 0) {
      this.store.userSessionPreferences[index] = preference;
      return preference;
    }
    this.store.userSessionPreferences.push(preference);
    return preference;
  }

  sessionPreferenceFor(userId: UUID): UserSessionPreferenceRecord | null {
    return (
      this.store.userSessionPreferences.find(
        (preference) => preference.user_id === userId,
      ) ?? null
    );
  }

  tokensForEmail(
    email: string,
    tokenType: AuthTokenRecord["token_type"],
  ): AuthTokenRecord[] {
    const normalized = email.toLowerCase();

    return this.store.authTokens.filter(
      (token) =>
        token.email?.toLowerCase() === normalized &&
        token.token_type === tokenType,
    );
  }
}
