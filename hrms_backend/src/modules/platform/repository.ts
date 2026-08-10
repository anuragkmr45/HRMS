import { nowIso } from "../../platform/data-store.js";
import { conflict } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import type { FinanceGovernanceConfig, UUID } from "#shared";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { buildDeviceRegisteredEvent } from "./events.js";

export interface RegisteredDeviceReadModel {
  registered_device_id: UUID;
  platform: "ios" | "android";
  status: "registered" | "suspended" | "revoked";
  status_changed_at: string;
  created_at: string;
  updated_at: string;
}

interface RegisteredDeviceRow {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  installation_id_hash: string;
  platform: "ios" | "android";
  status: "registered" | "suspended" | "revoked";
  status_changed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export class PlatformRepository {
  constructor(private readonly store: MemoryDataStore) {}

  async registerDevice(input: {
    companyId: UUID;
    userId: UUID;
    installationIdHash: string;
    platform: "ios" | "android";
  }): Promise<{ device: RegisteredDeviceReadModel; created: boolean }> {
    const pool = this.store.pgPool;
    if (!pool) {
      throw conflict("Device registration requires PostgreSQL persistence.", {
        aggregate: "registered_device",
        reason: "postgres_unavailable",
      });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<RegisteredDeviceRow>(
        `INSERT INTO platform.registered_devices (
           company_id, user_id, installation_id_hash, platform
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, installation_id_hash) DO NOTHING
         RETURNING id, company_id, user_id, installation_id_hash, platform, status,
           status_changed_at, created_at, updated_at`,
        [
          input.companyId,
          input.userId,
          input.installationIdHash,
          input.platform,
        ],
      );
      const insertedDevice = inserted.rows[0];
      if (insertedDevice) {
        await this.insertDeviceRegisteredOutboxEvent(client, insertedDevice);
        await client.query("COMMIT");
        return {
          device: presentRegisteredDevice(insertedDevice),
          created: true,
        };
      }

      const existing = await client.query<RegisteredDeviceRow>(
        `SELECT id, company_id, user_id, installation_id_hash, platform, status,
           status_changed_at, created_at, updated_at
         FROM platform.registered_devices
         WHERE company_id = $1
           AND installation_id_hash = $2
         FOR UPDATE`,
        [input.companyId, input.installationIdHash],
      );
      const existingDevice = existing.rows[0];
      if (!existingDevice) {
        throw conflict(
          "Device registration could not be resolved after a uniqueness conflict.",
          {
            aggregate: "registered_device",
            reason: "registration_race_unresolved",
          },
        );
      }
      if (existingDevice.user_id !== input.userId) {
        throw conflict(
          "Device installation is already registered to another user.",
          {
            aggregate: "registered_device",
            reason: "device_owner_conflict",
          },
        );
      }
      if (existingDevice.status !== "registered") {
        throw conflict(
          "Device registration is not active and cannot be re-registered.",
          {
            aggregate: "registered_device",
            registered_device_id: existingDevice.id,
            status: existingDevice.status,
            reason: "device_status_conflict",
          },
        );
      }

      if (existingDevice.platform !== input.platform) {
        throw conflict(
          "Device installation platform does not match the existing registration.",
          {
            aggregate: "registered_device",
            registered_device_id: existingDevice.id,
            existing_platform: existingDevice.platform,
            requested_platform: input.platform,
            reason: "device_platform_conflict",
          },
        );
      }
      await client.query("COMMIT");
      return {
        device: presentRegisteredDevice(existingDevice),
        created: false,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listDevices(input: {
    companyId: UUID;
    userId: UUID;
  }): Promise<RegisteredDeviceReadModel[]> {
    const pool = this.store.pgPool;
    if (!pool) {
      throw conflict("Device listing requires PostgreSQL persistence.", {
        aggregate: "registered_device",
        reason: "postgres_unavailable",
      });
    }
    const result = await pool.query<RegisteredDeviceRow>(
      `SELECT id, company_id, user_id, installation_id_hash, platform, status,
         status_changed_at, created_at, updated_at
       FROM platform.registered_devices
       WHERE company_id = $1
         AND user_id = $2
       ORDER BY updated_at DESC, id ASC`,
      [input.companyId, input.userId],
    );
    return result.rows.map(presentRegisteredDevice);
  }

  private async insertDeviceRegisteredOutboxEvent(
    client: PoolClient,
    device: RegisteredDeviceRow,
  ): Promise<void> {
    const event = buildDeviceRegisteredEvent({
      companyId: device.company_id,
      userId: device.user_id,
      registeredDeviceId: device.id,
      platform: device.platform,
      registeredAt: device.created_at.toISOString(),
    });
    await client.query(
      `INSERT INTO platform.outbox_events (
         aggregate_type, aggregate_id, event_type, payload, idempotency_key
       )
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload),
        event.idempotencyKey,
      ],
    );
  }

  getFinanceGovernanceConfig(): FinanceGovernanceConfig | null {
    return this.store.financeGovernanceConfig;
  }

  saveFinanceGovernanceConfig(input: {
    primary_finance_manager_user_id: UUID;
    manager_backup_user_id: UUID | null;
    finance_approval_backup_user_id: UUID | null;
    effective_from: string;
    effective_to: string | null;
    status: "active" | "inactive";
    expected_version: number;
    updated_by_user_id: UUID;
  }): FinanceGovernanceConfig {
    const current = this.store.financeGovernanceConfig;
    if (!current) {
      if (input.expected_version !== 1) {
        throw conflict("Finance governance configuration is not initialized.", {
          aggregate: "finance_governance_config",
          expected_version: input.expected_version,
          current_version: null,
        });
      }
      const created = nowIso();
      const config: FinanceGovernanceConfig = {
        id: randomUUID(),
        scope_key: "global",
        primary_finance_manager_user_id: input.primary_finance_manager_user_id,
        manager_backup_user_id: input.manager_backup_user_id,
        finance_approval_backup_user_id: input.finance_approval_backup_user_id,
        status: input.status,
        effective_from: input.effective_from,
        effective_to: input.effective_to,
        updated_by_user_id: input.updated_by_user_id,
        created_at: created,
        updated_at: created,
        deleted_at: null,
        version: 1,
      };
      this.store.financeGovernanceConfig = config;
      return config;
    }
    if (current.version !== input.expected_version) {
      throw conflict(
        "Finance governance configuration was modified by another actor.",
        {
          aggregate: "finance_governance_config",
          id: current.id,
          expected_version: input.expected_version,
          current_version: current.version,
        },
      );
    }
    current.primary_finance_manager_user_id =
      input.primary_finance_manager_user_id;
    current.manager_backup_user_id = input.manager_backup_user_id;
    current.finance_approval_backup_user_id =
      input.finance_approval_backup_user_id;
    current.effective_from = input.effective_from;
    current.effective_to = input.effective_to;
    current.status = input.status;
    current.updated_by_user_id = input.updated_by_user_id;
    current.updated_at = nowIso();
    current.version += 1;
    return current;
  }
}

function presentRegisteredDevice(
  row: RegisteredDeviceRow,
): RegisteredDeviceReadModel {
  return {
    registered_device_id: row.id,
    platform: row.platform,
    status: row.status,
    status_changed_at: row.status_changed_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
