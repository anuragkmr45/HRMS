import { Roles, type AuthUser, type FinanceGovernanceConfig, type UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { badRequest, notFound } from "../../platform/errors.js";
import { resolveActiveCompanyMembershipContext } from "../../platform/company-membership-context.js";
import { CoreService } from "../core/service.js";
import { PlatformRepository, type RegisteredDeviceReadModel } from "./repository.js";
import {
  assertCanManageDeviceLifecycle,
  assertCanReadFinanceGovernance,
  assertCanWriteFinanceGovernance,
  canManageDeviceLifecycle,
} from "./policy.js";
import type { PlatformDeviceLifecycleReason } from "./events.js";

export interface FinanceGovernanceReadModel {
  config: FinanceGovernanceConfig | null;
  primary_finance_manager: Record<string, unknown> | null;
  manager_backup_actor: Record<string, unknown> | null;
  finance_backup_actor: Record<string, unknown> | null;
  valid: boolean;
  blocking_issues: string[];
  eligible_finance_managers: Array<Record<string, unknown>>;
  eligible_manager_backups: Array<Record<string, unknown>>;
  eligible_finance_backups: Array<Record<string, unknown>>;
}

export class PlatformService {
  private readonly repository: PlatformRepository;
  private readonly core: CoreService;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new PlatformRepository(store);
    this.core = new CoreService(store);
  }

  getFinanceGovernance(actor: AuthUser): FinanceGovernanceReadModel {
    assertCanReadFinanceGovernance(actor);
    return this.presentFinanceGovernance(this.repository.getFinanceGovernanceConfig());
  }

  async registerDevice(
    actor: AuthUser,
    input: {
      installation_id_hash: string;
      platform: "ios" | "android";
    }
  ): Promise<{ device: RegisteredDeviceReadModel; created: boolean }> {
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "platform.devices.register",
      requireActiveEmployment: true
    });
    return this.repository.registerDevice({
      companyId: context.companyId,
      userId: context.userId,
      installationIdHash: input.installation_id_hash,
      platform: input.platform
    });
  }

  async listDevices(actor: AuthUser): Promise<{ items: RegisteredDeviceReadModel[] }> {
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "platform.devices.list",
      requireActiveEmployment: true
    });
    return {
      items: await this.repository.listDevices({
        companyId: context.companyId,
        userId: context.userId
      })
    };
  }

  async revokeDevice(
    actor: AuthUser,
    deviceId: UUID,
    input: { reason?: PlatformDeviceLifecycleReason },
  ): Promise<RegisteredDeviceReadModel> {
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "platform.devices.revoke",
      requireActiveEmployment: true
    });
    return this.repository.transitionDeviceLifecycle({
      companyId: context.companyId,
      actorUserId: context.userId,
      actorCanManageCompanyDevices: canManageDeviceLifecycle(actor),
      deviceId,
      targetStatus: "revoked",
      reason: input.reason ?? (
        canManageDeviceLifecycle(actor) ? "administrative" : "user_requested"
      ),
    });
  }

  async suspendDevice(
    actor: AuthUser,
    deviceId: UUID,
    input: { reason?: PlatformDeviceLifecycleReason },
  ): Promise<RegisteredDeviceReadModel> {
    assertCanManageDeviceLifecycle(actor);
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "platform.devices.suspend",
      requireActiveEmployment: true
    });
    return this.repository.transitionDeviceLifecycle({
      companyId: context.companyId,
      actorUserId: context.userId,
      actorCanManageCompanyDevices: true,
      deviceId,
      targetStatus: "suspended",
      reason: input.reason ?? "administrative",
    });
  }

  async restoreDevice(
    actor: AuthUser,
    deviceId: UUID,
    input: { reason?: PlatformDeviceLifecycleReason },
  ): Promise<RegisteredDeviceReadModel> {
    assertCanManageDeviceLifecycle(actor);
    const context = resolveActiveCompanyMembershipContext(this.store, {
      userId: actor.id,
      operation: "platform.devices.restore",
      requireActiveEmployment: true
    });
    return this.repository.transitionDeviceLifecycle({
      companyId: context.companyId,
      actorUserId: context.userId,
      actorCanManageCompanyDevices: true,
      deviceId,
      targetStatus: "registered",
      reason: input.reason ?? "administrative",
    });
  }

  updateFinanceGovernance(
    actor: AuthUser,
    input: {
      primary_finance_manager_user_id: UUID;
      manager_backup_user_id: UUID | null;
      finance_approval_backup_user_id: UUID | null;
      effective_from: string;
      effective_to?: string | null;
      status: "active" | "inactive";
      expected_version: number;
    }
  ): FinanceGovernanceReadModel {
    assertCanWriteFinanceGovernance(actor);
    const primary = this.core.getUser(input.primary_finance_manager_user_id);
    if (!this.isActiveUser(primary.id) || !primary.roles.includes(Roles.FinanceManager)) {
      throw badRequest("Primary finance manager must be an active user with Finance Manager role");
    }
    if (input.manager_backup_user_id) {
      const managerBackup = this.core.getUser(input.manager_backup_user_id);
      if (!this.isActiveUser(managerBackup.id) || !managerBackup.roles.includes(Roles.Reviewer)) {
        throw badRequest("Manager backup must be an active Manager");
      }
    }
    if (input.finance_approval_backup_user_id === primary.id) {
      throw badRequest("Finance approval backup cannot be the same as the primary finance manager");
    }
    if (input.finance_approval_backup_user_id) {
      const financeBackup = this.core.getUser(input.finance_approval_backup_user_id);
      if (
        !this.isActiveUser(financeBackup.id) ||
        !financeBackup.roles.includes(Roles.FinanceManager)
      ) {
        throw badRequest("Finance approval backup must be an active Finance Manager");
      }
    }
    const config = this.repository.saveFinanceGovernanceConfig({
      primary_finance_manager_user_id: input.primary_finance_manager_user_id,
      manager_backup_user_id: input.manager_backup_user_id,
      finance_approval_backup_user_id: input.finance_approval_backup_user_id,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      status: input.status,
      expected_version: input.expected_version,
      updated_by_user_id: actor.id
    });
    return this.presentFinanceGovernance(config);
  }

  private presentFinanceGovernance(config: FinanceGovernanceConfig | null): FinanceGovernanceReadModel {
    const primary = config ? this.store.users.find((user) => user.id === config.primary_finance_manager_user_id) ?? null : null;
    const managerBackup = config?.manager_backup_user_id
      ? this.store.users.find((user) => user.id === config.manager_backup_user_id) ?? null
      : null;
    const financeBackup = config?.finance_approval_backup_user_id
      ? this.store.users.find((user) => user.id === config.finance_approval_backup_user_id) ?? null
      : null;
    const blockingIssues: string[] = [];
    if (!config) {
      blockingIssues.push("finance_governance_missing");
    } else {
      if (config.status !== "active") {
        blockingIssues.push("finance_governance_inactive");
      }
      if (!primary || !this.isActiveUser(primary.id) || !primary.roles.includes(Roles.FinanceManager)) {
        blockingIssues.push("primary_finance_manager_invalid");
      }
      if (config.manager_backup_user_id && (!managerBackup || !this.isActiveUser(managerBackup.id) || !managerBackup.roles.includes(Roles.Reviewer))) {
        blockingIssues.push("manager_backup_invalid");
      }
      if (config.finance_approval_backup_user_id) {
        if (
          !financeBackup ||
          !this.isActiveUser(financeBackup.id) ||
          !financeBackup.roles.includes(Roles.FinanceManager)
        ) {
          blockingIssues.push("finance_approval_backup_invalid");
        }
      } else {
        blockingIssues.push("finance_approval_backup_missing");
      }
      if (primary && financeBackup && primary.id === financeBackup.id) {
        blockingIssues.push("finance_approval_backup_self_reference");
      }
    }

    return {
      config,
      primary_finance_manager: primary ? this.presentUser(primary.id) : null,
      manager_backup_actor: managerBackup ? this.presentUser(managerBackup.id) : null,
      finance_backup_actor: financeBackup ? this.presentUser(financeBackup.id) : null,
      valid: blockingIssues.length === 0,
      blocking_issues: blockingIssues,
      eligible_finance_managers: this.store.users
        .filter((user) => this.isActiveUser(user.id) && user.roles.includes(Roles.FinanceManager))
        .map((user) => this.presentUser(user.id)),
      eligible_manager_backups: this.store.users
        .filter((user) => this.isActiveUser(user.id) && user.roles.includes(Roles.Reviewer))
        .map((user) => this.presentUser(user.id)),
      eligible_finance_backups: this.store.users
        .filter((user) => this.isActiveUser(user.id) && user.roles.includes(Roles.FinanceManager))
        .map((user) => this.presentUser(user.id))
    };
  }

  private isActiveUser(userId: UUID): boolean {
    const user = this.store.users.find((candidate) => candidate.id === userId);
    return Boolean(user && user.employment_status === "active" && !user.deleted_at);
  }

  private presentUser(userId: UUID): Record<string, unknown> {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user) {
      throw notFound("User not found", { id: userId });
    }
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id && !candidate.deleted_at);
    return {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      roles: user.roles,
      department_id: user.department_id,
      department_name: department?.name ?? null,
      employment_status: user.employment_status
    };
  }
}
