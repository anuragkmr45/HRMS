import type { DataStore } from "../platform/data-store.js";

export const DEFAULT_COORDINATE_PURGE_BATCH_SIZE = 500;
export const DEFAULT_COORDINATE_PURGE_INTERVAL_MS = 60 * 60_000;
export const ATTENDANCE_COORDINATE_PURGE_WORKER_VERSION = "geo-s14-008";

export interface AttendanceCoordinatePurgeWorkerInput {
  batchSize?: number;
}

export interface AttendanceCoordinatePurgeWorkerResult {
  skipped: boolean;
  skip_reason: string | null;
  purged: number;
  batch_size: number;
  evidence_ids: string[];
  company_ids: string[];
}

export class AttendanceCoordinatePurgeWorker {
  constructor(private readonly store: DataStore) {}

  async purgeExpired(input: AttendanceCoordinatePurgeWorkerInput = {}): Promise<AttendanceCoordinatePurgeWorkerResult> {
    const batchSize = normalizedBatchSize(input.batchSize);
    if (!this.store.pgPool || this.store.kind !== "postgres") {
      return {
        skipped: true,
        skip_reason: "PostgreSQL is required for attendance coordinate purging.",
        purged: 0,
        batch_size: batchSize,
        evidence_ids: [],
        company_ids: [],
      };
    }

    const client = await this.store.pgPool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; company_id: string }>(
        `
          WITH candidates AS (
            SELECT
              evidence.id,
              evidence.company_id,
              evidence.attendance_event_id,
              evidence.retention_policy_version_id,
              evidence.coordinate_retention_class,
              evidence.coordinate_retention_seconds,
              evidence.coordinates_expire_at,
              event.command_execution_id
            FROM attendance.location_evidence evidence
            LEFT JOIN attendance.attendance_events event
              ON event.id = evidence.attendance_event_id
             AND event.company_id = evidence.company_id
            WHERE evidence.latitude IS NOT NULL
              AND evidence.longitude IS NOT NULL
              AND evidence.coordinates_expire_at IS NOT NULL
              AND evidence.coordinates_expire_at <= now()
              AND evidence.coordinates_purged_at IS NULL
            ORDER BY evidence.coordinates_expire_at, evidence.id
            FOR UPDATE OF evidence SKIP LOCKED
            LIMIT $1
          ),
          command_redactions AS (
            UPDATE attendance.command_executions AS command
            SET request_snapshot = attendance.redact_location_from_command_request_snapshot(command.request_snapshot)
            FROM candidates
            WHERE candidates.command_execution_id IS NOT NULL
              AND command.id = candidates.command_execution_id
              AND command.company_id = candidates.company_id
              AND command.request_snapshot IS DISTINCT FROM attendance.redact_location_from_command_request_snapshot(command.request_snapshot)
            RETURNING candidates.id AS location_evidence_id
          ),
          offline_redactions AS (
            UPDATE attendance.offline_event_inbox AS inbox
            SET event_payload = attendance.redact_location_from_offline_event_payload(inbox.event_payload),
                updated_at = now()
            FROM candidates
            WHERE inbox.company_id = candidates.company_id
              AND inbox.attendance_event_id = candidates.attendance_event_id
              AND inbox.event_payload IS DISTINCT FROM attendance.redact_location_from_offline_event_payload(inbox.event_payload)
            RETURNING candidates.id AS location_evidence_id
          ),
          updated AS (
            UPDATE attendance.location_evidence AS evidence
            SET latitude = NULL,
                longitude = NULL,
                altitude_meters = NULL,
                raw_payload = '{}'::jsonb,
                coordinates_purged_at = now()
            FROM candidates
            WHERE evidence.id = candidates.id
              AND evidence.coordinates_purged_at IS NULL
            RETURNING
              evidence.id,
              evidence.company_id,
              evidence.attendance_event_id,
              evidence.retention_policy_version_id,
              evidence.coordinate_retention_class,
              evidence.coordinate_retention_seconds,
              evidence.coordinates_expire_at,
              evidence.coordinates_purged_at
          ),
          action_input AS (
            SELECT
              updated.*,
              (
                SELECT count(*)::integer
                FROM command_redactions
                WHERE command_redactions.location_evidence_id = updated.id
              ) AS command_redaction_count,
              (
                SELECT count(*)::integer
                FROM offline_redactions
                WHERE offline_redactions.location_evidence_id = updated.id
              ) AS offline_redaction_count
            FROM updated
          ),
          retention_actions AS (
            INSERT INTO attendance.location_retention_actions (
              company_id,
              location_evidence_id,
              attendance_event_id,
              retention_policy_version_id,
              coordinate_retention_class,
              coordinate_retention_seconds,
              coordinates_expire_at,
              coordinates_purged_at,
              action_type,
              worker_origin,
              worker_version,
              storage_surfaces,
              redacted_command_snapshot_count,
              redacted_offline_event_payload_count
            )
            SELECT
              action_input.company_id,
              action_input.id,
              action_input.attendance_event_id,
              action_input.retention_policy_version_id,
              action_input.coordinate_retention_class,
              action_input.coordinate_retention_seconds,
              action_input.coordinates_expire_at,
              action_input.coordinates_purged_at,
              'attendance.location_coordinates.purged',
              'attendance-coordinate-purge-worker',
              $2,
              '["attendance.location_evidence"]'::jsonb
                || CASE
                  WHEN action_input.command_redaction_count > 0
                    THEN '["attendance.command_executions.request_snapshot"]'::jsonb
                  ELSE '[]'::jsonb
                END
                || CASE
                  WHEN action_input.offline_redaction_count > 0
                    THEN '["attendance.offline_event_inbox.event_payload"]'::jsonb
                  ELSE '[]'::jsonb
                END,
              action_input.command_redaction_count,
              action_input.offline_redaction_count
            FROM action_input
            RETURNING location_evidence_id
          )
          SELECT id, company_id
          FROM updated
          WHERE EXISTS (
            SELECT 1
            FROM retention_actions
            WHERE retention_actions.location_evidence_id = updated.id
          )
        `,
        [batchSize, ATTENDANCE_COORDINATE_PURGE_WORKER_VERSION],
      );
      await client.query("COMMIT");
      const companyIds = [...new Set(result.rows.map((row) => row.company_id))];
      return {
        skipped: false,
        skip_reason: null,
        purged: result.rowCount ?? result.rows.length,
        batch_size: batchSize,
        evidence_ids: result.rows.map((row) => row.id),
        company_ids: companyIds,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizedBatchSize(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_COORDINATE_PURGE_BATCH_SIZE;
  }
  return Math.min(value, 5_000);
}
