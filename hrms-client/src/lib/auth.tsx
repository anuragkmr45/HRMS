import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type SessionContextResponse } from "@/domains/auth";
import {
  ApiError,
  clearApiAccessToken,
  isApiEnabled,
  isMockFallbackEnabled,
  onApiUnauthorized,
  setApiAccessToken,
  shouldUseMockFallback,
  userFacingErrorMessage,
  type ApiRecord,
} from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { USERS as SEED_USERS, type User } from "./mock/users";
import { ROLES, ROLE_MAP, ROLE_LABELS, type Role } from "./mock/roles";

// -------- Types --------
export interface PendingSignup {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  companyName: string;
  contact: string;
  token: string;
  isFirstAdmin: boolean;
  verified: boolean;
  passwordSet: boolean;
  createdAt: number;
  expiresAt: number;
  bootstrapToken?: string | null;
  emailDeliveryMode?: "send" | "log" | "disabled";
  emailDeliveryStatus?: string | null;
  emailDeliveryNotice?: string | null;
}

type AuthNextStep = "verify_email" | "set_password" | "login" | "company_bootstrap";

interface AuthVerificationResult {
  status: "ok" | "expired" | "invalid";
  pending?: PendingSignup;
  nextStep?: AuthNextStep;
  loginAllowed?: boolean;
}

interface CompanySetupInput {
  companyName?: string;
  timezone?: string;
  locale?: string;
  fullName?: string;
  landingPage?: string;
  departments?: string[];
  designations?: string[];
  companyLogoFile?: File | null;
}

interface CompanySetupResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  user: User | null;
  activeRole: Role | null;
  isInitializing: boolean;
  // session
  login: (email: string, password?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  setActiveRole: (role: Role) => void;
  canAccess: (path: string) => boolean;
  // signup flow
  signup: (
    input: Omit<
      PendingSignup,
      "id" | "token" | "isFirstAdmin" | "verified" | "passwordSet" | "createdAt" | "expiresAt"
    >,
  ) => Promise<PendingSignup>;
  resendVerification: (email: string) => Promise<PendingSignup | null>;
  verifyToken: (token: string) => Promise<AuthVerificationResult>;
  setPasswordForToken: (
    token: string,
    password: string,
  ) => Promise<{
    ok: boolean;
    user?: User;
    isFirstAdmin?: boolean;
    requiresLogin?: boolean;
    error?: string;
  }>;
  // password reset
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; token?: string }>;
  resetPasswordWithToken: (
    token: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  // wizard
  isCompanySetupComplete: boolean;
  completeCompanySetup: (input?: CompanySetupInput) => Promise<CompanySetupResult>;
}

const AuthCtx = React.createContext<AuthState | null>(null);
const SESSION_KEY = "hawkaii_session";
const USERS_KEY = "hawkaii_users";
const PENDING_KEY = "hawkaii_pending_signups";
const PASSWORDS_KEY = "hawkaii_passwords";
const RESET_KEY = "hawkaii_resets";
const SETUP_KEY = "hawkaii_company_setup";
const BOOTSTRAP_TOKEN_KEY = "hawkaii_company_bootstrap_token";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

interface BootstrapTokenRecord {
  token: string;
  userId?: string | null;
  companyId?: string | null;
  expiresAt: number;
}

// helpers (browser-safe)
const ls = {
  get<T>(k: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
  del(k: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(k);
  },
};

const ss = {
  get(k: string): string | null {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(k);
  },
  set(k: string, v: string | null | undefined) {
    if (typeof window === "undefined" || !v) return;
    window.sessionStorage.setItem(k, v);
  },
  del(k: string) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(k);
  },
};

const randomToken = () =>
  Math.random().toString(36).slice(2) +
  Date.now().toString(36) +
  Math.random().toString(36).slice(2);

const ROLE_BY_LABEL = new Map(ROLES.map((role) => [role.label.toLowerCase(), role.key]));
const ROLE_BY_KEY = new Map(ROLES.map((role) => [role.key, role.key]));
const API_ROLE_BY_NORMALIZED = new Map<string, Role>([
  ["admin", "main_admin"],
  ["hradmin", "hr_admin"],
  ["hrmanager", "hr_admin"],
  ["humanresourcesmanager", "hr_admin"],
  ["employee", "employee"],
  ["reviewer", "manager"],
  ["manager", "manager"],
  ["director", "director"],
  ["auditor", "auditor"],
  ["projectmanager", "project_manager"],
  ["financemanager", "finance_manager"],
  ["assetmanager", "asset_admin"],
  ["assetitadmin", "asset_admin"],
]);

const BACKEND_ROLE_BY_LOCAL_ROLE: Partial<Record<Role, string>> = {
  main_admin: "Admin",
  hr_admin: "HR Manager",
  employee: "Employee",
  manager: "Reviewer",
  director: "Director",
  auditor: "Auditor",
  project_manager: "Reviewer",
  finance_manager: "Finance Manager",
  asset_admin: "Asset Manager",
};

function shouldUseLocalAuthState(): boolean {
  return !isApiEnabled() || isMockFallbackEnabled();
}

function clearBootstrapToken() {
  ss.del(BOOTSTRAP_TOKEN_KEY);
  ls.del(BOOTSTRAP_TOKEN_KEY);
}

function storeBootstrapToken(token: string, userId?: string | null, companyId?: string | null) {
  ss.set(BOOTSTRAP_TOKEN_KEY, token);
  ls.set(BOOTSTRAP_TOKEN_KEY, {
    token,
    userId,
    companyId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  } satisfies BootstrapTokenRecord);
}

function currentBootstrapToken(userId?: string | null): string | null {
  const sessionToken = ss.get(BOOTSTRAP_TOKEN_KEY);
  if (sessionToken) return sessionToken;

  const record = ls.get<BootstrapTokenRecord | null>(BOOTSTRAP_TOKEN_KEY, null);
  if (!record?.token) return null;
  if (Date.now() > record.expiresAt) {
    clearBootstrapToken();
    return null;
  }
  if (userId && record.userId && record.userId !== userId) return null;
  return record.token;
}

function devOnlyToken(
  response: { dev_only?: Record<string, unknown> },
  key: string,
): string | null {
  const value = response.dev_only?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function captureCompanyBootstrapState(
  response: {
    setup_required?: boolean;
    next_step?: unknown;
    company_id?: unknown;
    dev_only?: Record<string, unknown>;
  },
  userId?: string | null,
): boolean {
  const setupRequired =
    response.setup_required === true || response.next_step === "company_bootstrap";
  const bootstrapToken = devOnlyToken(response, "company_bootstrap_token");
  if (setupRequired && bootstrapToken) {
    storeBootstrapToken(
      bootstrapToken,
      userId,
      typeof response.company_id === "string" ? response.company_id : null,
    );
  }
  return setupRequired;
}

function isDevelopmentExperience(): boolean {
  const appEnv = String(import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE ?? "").toLowerCase();
  return import.meta.env.DEV || ["local", "development", "dev"].includes(appEnv);
}

function errorMessage(error: unknown, fallback: string): string {
  return userFacingErrorMessage(error, fallback);
}

function mapApiRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    ROLE_BY_KEY.get(normalized as Role) ??
    ROLE_BY_LABEL.get(trimmed.toLowerCase()) ??
    API_ROLE_BY_NORMALIZED.get(compact) ??
    null
  );
}

function apiUserToLocalUser(apiUser: ApiRecord, roleValues?: unknown[]): User {
  const roleCandidates = roleValues?.length
    ? roleValues
    : Array.isArray(apiUser.roles)
      ? apiUser.roles
      : [];
  const roles = Array.from(
    new Set(roleCandidates.map(mapApiRole).filter((role): role is Role => Boolean(role))),
  );
  const fallbackRole: Role = roles[0] ?? "employee";

  return {
    id: String(apiUser.id ?? apiUser.user_id ?? randomToken()),
    name: String(apiUser.full_name ?? apiUser.name ?? apiUser.email ?? "API User"),
    email: String(apiUser.email ?? ""),
    roles: roles.length ? roles : [fallbackRole],
    department: String(
      apiUser.department_name ?? apiUser.department ?? apiUser.department_id ?? "General",
    ),
    designation: String(
      apiUser.designation_name ??
        apiUser.designation ??
        apiUser.designation_id ??
        ROLE_LABELS[fallbackRole],
    ),
    avatarColor: ROLE_MAP[fallbackRole].color,
  };
}

function sessionRoleValues(session: SessionContextResponse): unknown[] {
  const available = Array.isArray(session.available_roles)
    ? session.available_roles.flatMap((role) => [role.key, role.label])
    : [];
  const userRoles = Array.isArray(session.user?.roles) ? session.user.roles : [];
  return [...available, ...userRoles];
}

function activeRoleFromSession(session: SessionContextResponse, user: User): Role {
  const active = session.active_role;
  return mapApiRole(active?.key) ?? mapApiRole(active?.label) ?? user.roles[0];
}

export function dashboardPathForRole(_role: Role | null): string {
  // Single dashboard route adapts to active role, satisfying role-based redirect.
  return "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState<User | null>(null);
  const [activeRole, setActiveRoleState] = React.useState<Role | null>(null);
  const [users, setUsers] = React.useState<User[]>(SEED_USERS);
  const [setupDone, setSetupDone] = React.useState(true);
  const [sessionBlocked, setSessionBlocked] = React.useState(false);

  const persistSession = React.useCallback((u: User | null, role: Role | null) => {
    if (!shouldUseLocalAuthState()) return;
    if (u && role) ls.set(SESSION_KEY, { userId: u.id, role });
    else ls.del(SESSION_KEY);
  }, []);

  const applyApiUser = React.useCallback(
    (apiUserRecord: ApiRecord, roleValues?: unknown[], activeRoleOverride?: Role) => {
      const apiUser = apiUserToLocalUser(apiUserRecord, roleValues);
      const nextRole = activeRoleOverride ?? apiUser.roles[0];
      setUsers((current) => {
        const nextUsers = [...current.filter((u) => u.id !== apiUser.id), apiUser];
        if (shouldUseLocalAuthState()) ls.set(USERS_KEY, nextUsers);
        return nextUsers;
      });
      setUser(apiUser);
      setActiveRoleState(nextRole);
      persistSession(apiUser, nextRole);
      return { user: apiUser, role: nextRole };
    },
    [persistSession],
  );

  const applyApiSession = React.useCallback(
    (session: SessionContextResponse) => {
      const roleValues = sessionRoleValues(session);
      const apiUser = apiUserToLocalUser(session.user, roleValues);
      return applyApiUser(session.user, roleValues, activeRoleFromSession(session, apiUser));
    },
    [applyApiUser],
  );

  const clearAuthenticatedSession = React.useCallback(() => {
    setSessionBlocked(true);
    queryClient.clear();
    clearApiAccessToken();
    setUser(null);
    setActiveRoleState(null);
    persistSession(null, null);
  }, [persistSession, queryClient]);

  const apiSessionQuery = useQuery({
    queryKey: queryKeys.detail("auth", "session", "me"),
    queryFn: () => authApi.getSession(),
    enabled: isApiEnabled() && user === null && !sessionBlocked,
    retry: false,
    staleTime: queryTimings.realtimeStaleMs,
  });

  // hydrate
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const useLocalAuth = shouldUseLocalAuthState();
    const stored = useLocalAuth ? ls.get<User[] | null>(USERS_KEY, null) : null;
    const merged = stored && stored.length ? stored : SEED_USERS;
    setUsers(merged);
    if (useLocalAuth && !stored) ls.set(USERS_KEY, SEED_USERS);

    setSetupDone(useLocalAuth ? ls.get<boolean>(SETUP_KEY, true) : !currentBootstrapToken());

    if (!useLocalAuth) return;
    const session = ls.get<{ userId: string; role: Role } | null>(SESSION_KEY, null);
    if (session) {
      const u = merged.find((m) => m.id === session.userId);
      if (u) {
        setUser(u);
        setActiveRoleState(session.role);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!apiSessionQuery.data || sessionBlocked) return;
    const sessionUserId = String(
      apiSessionQuery.data.user.id ?? apiSessionQuery.data.user.user_id ?? "",
    );
    const setupRequired = captureCompanyBootstrapState(apiSessionQuery.data, sessionUserId);
    setSetupDone(!setupRequired && !currentBootstrapToken(sessionUserId));
    applyApiSession(apiSessionQuery.data);
  }, [apiSessionQuery.data, applyApiSession, sessionBlocked]);

  React.useEffect(() => {
    if (apiSessionQuery.error instanceof ApiError && apiSessionQuery.error.status === 401) {
      clearAuthenticatedSession();
    }
  }, [apiSessionQuery.error, clearAuthenticatedSession]);

  React.useEffect(() => {
    if (!isApiEnabled()) return undefined;
    return onApiUnauthorized(clearAuthenticatedSession);
  }, [clearAuthenticatedSession]);

  const isInitializing =
    isApiEnabled() && user === null && !sessionBlocked && apiSessionQuery.isPending;

  const persistUsers = (next: User[]) => {
    setUsers(next);
    if (shouldUseLocalAuthState()) ls.set(USERS_KEY, next);
  };

  // -------- Sessions --------
  const loginFromMock = (email: string, password?: string) => {
    const normalized = email.trim().toLowerCase();
    const u = users.find((m) => m.email.toLowerCase() === normalized);
    if (!u) return { ok: false, error: "No account found for this email." };
    // Mock password rule: any password works for seeded demo users; for new users check store.
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    const stored = passwords[u.id];
    if (stored && password && stored !== password) {
      return { ok: false, error: "Incorrect password." };
    }
    setUser(u);
    setActiveRoleState(u.roles[0]);
    persistSession(u, u.roles[0]);
    return { ok: true };
  };

  const login: AuthState["login"] = async (email, password) => {
    if (isApiEnabled()) {
      try {
        setSessionBlocked(false);
        queryClient.clear();
        const response = await authApi.login({ email, password: password ?? "" });
        setApiAccessToken(response.access_token);
        const loginSetupRequired = captureCompanyBootstrapState(
          response,
          typeof response.user.id === "string" ? response.user.id : null,
        );
        if (loginSetupRequired) setSetupDone(false);
        try {
          const session = await authApi.getSession();
          const sessionUserId = String(session.user.id ?? session.user.user_id ?? "");
          const sessionSetupRequired = captureCompanyBootstrapState(session, sessionUserId);
          setSetupDone(
            !loginSetupRequired && !sessionSetupRequired && !currentBootstrapToken(sessionUserId),
          );
          applyApiSession(session);
        } catch {
          const responseUserId = typeof response.user.id === "string" ? response.user.id : null;
          setSetupDone(!loginSetupRequired && !currentBootstrapToken(responseUserId));
          applyApiUser(response.user);
        }
        return { ok: true };
      } catch (error) {
        clearApiAccessToken();
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          return loginFromMock(email, password);
        }
        return { ok: false, error: userFacingErrorMessage(error, "Sign in failed.") };
      }
    }

    if (isMockFallbackEnabled()) return loginFromMock(email, password);
    return {
      ok: false,
      error: "Sign in is not available in this environment. Please contact your administrator.",
    };
  };

  const logout = () => {
    if (isApiEnabled()) void authApi.logout().catch(() => undefined);
    clearAuthenticatedSession();
  };

  const setActiveRole = (role: Role) => {
    setActiveRoleState(role);
    if (user) persistSession(user, role);
    const backendRole = BACKEND_ROLE_BY_LOCAL_ROLE[role];
    if (isApiEnabled() && backendRole) {
      void authApi
        .updateSessionPreference({ active_role: backendRole })
        .then((session) => applyApiSession(session))
        .catch(() => undefined);
    }
  };

  const canAccess = React.useCallback(
    (path: string) => {
      if (!activeRole) return false;
      return ROLE_MAP[activeRole].modules.includes(path);
    },
    [activeRole],
  );

  const signupFromLocal = (input: Parameters<AuthState["signup"]>[0]) => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const email = input.email.trim().toLowerCase();
    // First verified user of a company becomes Main Admin: check existing users for the same domain
    const domain = email.split("@")[1] ?? "";
    const isFirstAdmin = !users.some((u) => u.email.toLowerCase().endsWith("@" + domain));

    const now = Date.now();
    const record: PendingSignup = {
      ...input,
      email,
      id: "p_" + randomToken().slice(0, 10),
      token: randomToken(),
      isFirstAdmin,
      verified: false,
      passwordSet: false,
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    };
    // remove any prior pending for this email
    const next = [...pending.filter((p) => p.email !== email), record];
    ls.set(PENDING_KEY, next);
    return record;
  };

  const resendVerificationFromLocal = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const idx = pending.findIndex((p) => p.email === normalized);
    if (idx === -1) return null;
    const updated: PendingSignup = {
      ...pending[idx],
      token: randomToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    pending[idx] = updated;
    ls.set(PENDING_KEY, pending);
    return updated;
  };

  const verifyTokenFromLocal = (token: string): AuthVerificationResult => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const rec = pending.find((p) => p.token === token);
    if (!rec) return { status: "invalid" };
    if (Date.now() > rec.expiresAt) return { status: "expired", pending: rec };
    if (!rec.verified) {
      rec.verified = true;
      ls.set(PENDING_KEY, pending);
    }
    return { status: "ok", pending: rec, nextStep: "set_password", loginAllowed: false };
  };

  const setPasswordForTokenFromLocal = (token: string, password: string) => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const idx = pending.findIndex((p) => p.token === token);
    if (idx === -1) return { ok: false, error: "Invalid or expired link." };
    const rec = pending[idx];
    if (Date.now() > rec.expiresAt) return { ok: false, error: "Verification link has expired." };

    // create a real user
    const role: Role = rec.isFirstAdmin ? "main_admin" : "employee";
    const fullName = [rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(" ");
    const newUser: User = {
      id: "u_" + randomToken().slice(0, 8),
      name: fullName,
      email: rec.email,
      roles: [role],
      department: rec.isFirstAdmin ? "Executive" : "General",
      designation: rec.isFirstAdmin ? "Founder & Admin" : "Employee",
      avatarColor: "primary",
    };
    const nextUsers = [...users, newUser];
    persistUsers(nextUsers);

    // store password
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    passwords[newUser.id] = password;
    ls.set(PASSWORDS_KEY, passwords);

    // remove pending
    pending.splice(idx, 1);
    ls.set(PENDING_KEY, pending);

    // auto sign-in
    setUser(newUser);
    setActiveRoleState(role);
    persistSession(newUser, role);

    if (rec.isFirstAdmin) {
      setSetupDone(false);
      ls.set(SETUP_KEY, false);
    }

    return { ok: true, user: newUser, isFirstAdmin: rec.isFirstAdmin };
  };

  const requestPasswordResetFromLocal = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const u = users.find((m) => m.email.toLowerCase() === normalized);
    if (!u) return { ok: false };
    const resets = ls.get<Record<string, { userId: string; expiresAt: number }>>(RESET_KEY, {});
    const token = randomToken();
    resets[token] = { userId: u.id, expiresAt: Date.now() + TOKEN_TTL_MS };
    ls.set(RESET_KEY, resets);
    return { ok: true, token };
  };

  const resetPasswordWithTokenFromLocal = (token: string, password: string) => {
    const resets = ls.get<Record<string, { userId: string; expiresAt: number }>>(RESET_KEY, {});
    const entry = resets[token];
    if (!entry) return { ok: false, error: "Invalid or expired link." };
    if (Date.now() > entry.expiresAt) return { ok: false, error: "This reset link has expired." };
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    passwords[entry.userId] = password;
    ls.set(PASSWORDS_KEY, passwords);
    delete resets[token];
    ls.set(RESET_KEY, resets);
    return { ok: true };
  };

  // -------- Signup / Verification --------
  const signup: AuthState["signup"] = async (input) => {
    if (isApiEnabled()) {
      try {
        const fullName = [input.firstName, input.middleName, input.lastName]
          .filter(Boolean)
          .join(" ");
        const response = await authApi.signup({
          company_name: input.companyName,
          full_name: fullName,
          email: input.email.trim().toLowerCase(),
          timezone: "Asia/Kolkata",
          locale: "en-IN",
        });
        return {
          ...input,
          email: input.email.trim().toLowerCase(),
          id: response.signup_id,
          token: devOnlyToken(response, "email_verification_token") ?? "",
          isFirstAdmin: true,
          verified: false,
          passwordSet: false,
          createdAt: Date.now(),
          expiresAt: Date.now() + TOKEN_TTL_MS,
          emailDeliveryMode: response.email_delivery_mode,
          emailDeliveryStatus: response.email_delivery_status,
          emailDeliveryNotice: response.email_delivery_notice,
        };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) return signupFromLocal(input);
        throw error;
      }
    }
    if (isMockFallbackEnabled()) return signupFromLocal(input);
    throw new ApiError({
      status: 503,
      code: "api_disabled",
      message:
        "Account setup is not available in this environment. Please contact your administrator.",
    });
  };

  const resendVerification: AuthState["resendVerification"] = async (email) => {
    if (isApiEnabled()) {
      try {
        const response = await authApi.resendEmailVerification({
          email: email.trim().toLowerCase(),
        });
        return {
          id: "resend_" + randomToken().slice(0, 8),
          firstName: "",
          lastName: "",
          email: email.trim().toLowerCase(),
          companyName: "",
          contact: "",
          token: devOnlyToken(response, "email_verification_token") ?? "",
          isFirstAdmin: true,
          verified: false,
          passwordSet: false,
          createdAt: Date.now(),
          expiresAt: Date.now() + TOKEN_TTL_MS,
          emailDeliveryMode: response.email_delivery_mode,
          emailDeliveryStatus: response.email_delivery_status,
          emailDeliveryNotice: response.email_delivery_notice,
        };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          return resendVerificationFromLocal(email);
        }
        throw error;
      }
    }
    if (isMockFallbackEnabled()) return resendVerificationFromLocal(email);
    return null;
  };

  const verifyToken: AuthState["verifyToken"] = async (token) => {
    if (isApiEnabled()) {
      try {
        const response = await authApi.verifyEmail({ token });
        const bootstrapToken = devOnlyToken(response, "company_bootstrap_token");
        const passwordSetupToken = devOnlyToken(response, "password_setup_token");
        if (bootstrapToken) {
          storeBootstrapToken(bootstrapToken, response.user_id, response.company_id ?? null);
          setSetupDone(false);
        }
        return {
          status: "ok",
          nextStep: response.next_step,
          loginAllowed: response.login_allowed,
          pending: {
            id: response.user_id,
            firstName: "",
            lastName: "",
            email: "",
            companyName: "",
            contact: "",
            token: passwordSetupToken ?? "",
            bootstrapToken,
            isFirstAdmin: Boolean(bootstrapToken),
            verified: true,
            passwordSet: response.login_allowed,
            createdAt: Date.now(),
            expiresAt: Date.now() + TOKEN_TTL_MS,
          },
        };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error))
          return verifyTokenFromLocal(token);
        return { status: "invalid" };
      }
    }
    if (isMockFallbackEnabled()) return verifyTokenFromLocal(token);
    return { status: "invalid" };
  };

  const setPasswordForToken: AuthState["setPasswordForToken"] = async (token, password) => {
    if (isApiEnabled()) {
      try {
        await authApi.setPassword({ token, password, confirm_password: password });
        const isFirstAdmin = Boolean(currentBootstrapToken());
        if (isFirstAdmin) setSetupDone(false);
        return { ok: true, isFirstAdmin, requiresLogin: true };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          return setPasswordForTokenFromLocal(token, password);
        }
        return { ok: false, error: errorMessage(error, "Could not set password.") };
      }
    }
    if (isMockFallbackEnabled()) return setPasswordForTokenFromLocal(token, password);
    return {
      ok: false,
      error: "This action is not available in this environment. Please contact your administrator.",
    };
  };

  // -------- Password reset --------
  const requestPasswordReset: AuthState["requestPasswordReset"] = async (email) => {
    if (isApiEnabled()) {
      try {
        const response = await authApi.requestPasswordReset({ email: email.trim().toLowerCase() });
        return {
          ok: response.accepted,
          token: devOnlyToken(response, "password_reset_token") ?? undefined,
        };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          return requestPasswordResetFromLocal(email);
        }
        return { ok: false };
      }
    }
    if (isMockFallbackEnabled()) return requestPasswordResetFromLocal(email);
    return { ok: false };
  };

  const resetPasswordWithToken: AuthState["resetPasswordWithToken"] = async (token, password) => {
    if (isApiEnabled()) {
      try {
        await authApi.confirmPasswordReset({ token, password, confirm_password: password });
        return { ok: true };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          return resetPasswordWithTokenFromLocal(token, password);
        }
        return { ok: false, error: errorMessage(error, "Could not reset password.") };
      }
    }
    if (isMockFallbackEnabled()) return resetPasswordWithTokenFromLocal(token, password);
    return {
      ok: false,
      error: "This action is not available in this environment. Please contact your administrator.",
    };
  };

  const completeCompanySetup: AuthState["completeCompanySetup"] = async (input) => {
    if (isApiEnabled()) {
      const bootstrapToken = currentBootstrapToken(user?.id);
      if (!bootstrapToken) {
        return {
          ok: false,
          error: "Company setup token is missing. Sign in from the setup link again.",
        };
      }
      try {
        if (input?.companyLogoFile) {
          const formData = new FormData();
          formData.set("bootstrap_token", bootstrapToken);
          formData.set("file", input.companyLogoFile);
          await authApi.uploadCompanyLogo(formData);
        }
        await authApi.bootstrapCompany({
          bootstrap_token: bootstrapToken,
          company_profile: {
            company_name: input?.companyName,
            timezone: input?.timezone,
            locale: input?.locale ?? "en-IN",
          },
          departments: input?.departments,
          designations: input?.designations,
          first_admin_profile: {
            full_name: input?.fullName,
            landing_page: input?.landingPage ?? "/dashboard",
          },
        });
        clearBootstrapToken();
        queryClient.clear();
        const session = await authApi.getSession();
        const applied = applyApiSession(session);
        const setupRequired = captureCompanyBootstrapState(session, applied.user.id);
        setSetupDone(!setupRequired);
        return { ok: true };
      } catch (error) {
        if (isMockFallbackEnabled() && shouldUseMockFallback(error)) {
          setSetupDone(true);
          ls.set(SETUP_KEY, true);
          return { ok: true };
        }
        return { ok: false, error: errorMessage(error, "Could not complete company setup.") };
      }
    }
    setSetupDone(true);
    if (shouldUseLocalAuthState()) ls.set(SETUP_KEY, true);
    return { ok: true };
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        activeRole,
        isInitializing,
        login,
        logout,
        setActiveRole,
        canAccess,
        signup,
        resendVerification,
        verifyToken,
        setPasswordForToken,
        requestPasswordReset,
        resetPasswordWithToken,
        isCompanySetupComplete: setupDone,
        completeCompanySetup,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { ROLES, ROLE_MAP, ROLE_LABELS };
export type { Role, User };
