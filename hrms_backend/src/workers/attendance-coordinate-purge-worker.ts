import type { DataStore } from "../platform/data-store.js";

export const DEFAULT_COORDINATE_PURGE_BATCH_SIZE = 500;
export const DEFAULT_COORDINATE_PURGE_INTERVAL_MS = 60 * 60_000;

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
            SELECT id
            FROM attendance.location_evidence
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND coordinates_expire_at IS NOT NULL
              AND coordinates_expire_at <= now()
              AND coordinates_purged_at IS NULL
            ORDER BY coordinates_expire_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT $1
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
            RETURNING evidence.id, evidence.company_id
          )
          SELECT id, company_id
          FROM updated
        `,
        [batchSize],
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
