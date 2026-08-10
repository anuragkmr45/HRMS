import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { schema } from "#db";
import { buildRealApp } from "../../../__tests__/real-infra.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const companyId = "00000000-0000-4000-8000-000000000601";
const attendanceEventId = "00000000-0000-4000-8000-000000000602";
const registeredDeviceId = "00000000-0000-4000-8000-000000000603";
const receivedAt = "2026-08-03T03:45:10.000Z";
const evaluatedAt = "2026-08-03T03:45:11.000Z";
const providerIssuedAt = "2026-08-03T03:45:09.000Z";
const challengeHash = "a".repeat(64);
const artifactHash = "b".repeat(64);

type TestApp = Awaited<ReturnType<typeof buildRealApp>>;

function deterministicUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

async function insertEvidence(
  pool: Pool,
  input: {
    id: string;
    provider?: string;
    verificationStatus?: string;
    challengeBindingHash?: string | null;
    artifactHash?: string | null;
    normalizedVerdict?: unknown;
    providerMetadata?: unknown;
    reasonCodes?: unknown;
    attendanceEventId?: string;
    registeredDeviceId?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO attendance.attestation_evidence (
      id,
      company_id,
      attendance_event_id,
      registered_device_id,
      provider,
      verification_status,
      adapter_version,
      challenge_binding_hash,
      artifact_hash,
      normalized_verdict,
      provider_metadata,
      reason_codes,
      received_at,
      provider_issued_at,
      evaluated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'attestation-adapter-v1', $7, $8,
      $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14
    )`,
    [
      input.id,
      companyId,
      input.attendanceEventId ?? attendanceEventId,
      input.registeredDeviceId ?? null,
      input.provider ?? "google_play_integrity",
      input.verificationStatus ?? "verified",
      input.challengeBindingHash ?? null,
      input.artifactHash ?? null,
      JSON.stringify(input.normalizedVerdict ?? { device_integrity: "recognized" }),
      JSON.stringify(input.providerMetadata ?? { verdict_source: "provider" }),
      JSON.stringify(input.reasonCodes ?? ["attestation.verified"]),
      receivedAt,
      providerIssuedAt,
      evaluatedAt,
    ],
  );
}

function requireApp(app: TestApp | undefined): TestApp {
  if (!app) throw new Error("Test application is unavailable.");
  return app;
}

describe("PostgreSQL attendance attestation evidence placeholder", () => {
  let app: TestApp | undefined;

  beforeEach(async () => {
    app = undefined;
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    const currentApp = app;
    app = undefined;

    try {
      if (currentApp) await currentApp.close();
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("creates the table, Drizzle mapping, columns, indexes, and no foreign keys", async () => {
    const pool = requireApp(app).store.pgPool!;
    expect(schema.attendanceAttestationEvidence).toBeDefined();

    const table = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('attendance.attestation_evidence') IS NOT NULL AS exists`,
    );
    expect(table.rows[0]?.exists).toBe(true);

    const columns = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'attendance'
         AND table_name = 'attestation_evidence'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "id",
      "company_id",
      "attendance_event_id",
      "registered_device_id",
      "provider",
      "verification_status",
      "adapter_version",
      "challenge_binding_hash",
      "artifact_hash",
      "normalized_verdict",
      "provider_metadata",
      "reason_codes",
      "received_at",
      "provider_issued_at",
      "evaluated_at",
      "created_at",
    ]);
    expect(columns.rows.find((row) => row.column_name === "registered_device_id")?.is_nullable).toBe("YES");
    expect(columns.rows.find((row) => row.column_name === "provider_issued_at")?.is_nullable).toBe("YES");

    const foreignKeys = await pool.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'attendance.attestation_evidence'::regclass
         AND contype = 'f'
       ORDER BY conname`,
    );
    expect(foreignKeys.rows).toEqual([]);

    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'attendance'
         AND tablename = 'attestation_evidence'
         AND indexname IN (
           'attestation_evidence_event_idx',
           'attestation_evidence_registered_device_idx',
           'attestation_evidence_provider_status_evaluated_idx'
         )
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "attestation_evidence_event_idx",
      "attestation_evidence_provider_status_evaluated_idx",
      "attestation_evidence_registered_device_idx",
    ]);
  });

  it("inserts and reads a valid row through the Drizzle mapping", async () => {
    const pool = requireApp(app).store.pgPool!;
    const db = drizzle(pool, { schema });
    const id = deterministicUuid(610);

    await db.insert(schema.attendanceAttestationEvidence).values({
      id,
      companyId,
      attendanceEventId,
      registeredDeviceId: null,
      provider: "google_play_integrity",
      verificationStatus: "verified",
      adapterVersion: "attestation-adapter-v1",
      challengeBindingHash: null,
      artifactHash: null,
      normalizedVerdict: { device_integrity: "recognized" },
      providerMetadata: { verdict_source: "provider" },
      reasonCodes: ["attestation.verified"],
      receivedAt: new Date(receivedAt),
      providerIssuedAt: null,
      evaluatedAt: new Date(evaluatedAt),
    });

    const rows = await db
      .select()
      .from(schema.attendanceAttestationEvidence)
      .where(eq(schema.attendanceAttestationEvidence.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      companyId,
      attendanceEventId,
      registeredDeviceId: null,
      provider: "google_play_integrity",
      verificationStatus: "verified",
      adapterVersion: "attestation-adapter-v1",
      normalizedVerdict: { device_integrity: "recognized" },
      providerMetadata: { verdict_source: "provider" },
      reasonCodes: ["attestation.verified"],
    });
  });

  it("accepts supported providers, statuses, nullable hashes, JSON objects, reason codes, and repeated provider attempts", async () => {
    const pool = requireApp(app).store.pgPool!;

    await insertEvidence(pool, {
      id: deterministicUuid(621),
      provider: "google_play_integrity",
      verificationStatus: "verified",
      challengeBindingHash: challengeHash,
      artifactHash,
      reasonCodes: ["attestation.verified", "play.integrity.basic"],
    });
    await insertEvidence(pool, {
      id: deterministicUuid(622),
      provider: "apple_app_attest",
      verificationStatus: "rejected",
      artifactHash,
      reasonCodes: ["attestation.rejected"],
    });
    await insertEvidence(pool, {
      id: deterministicUuid(623),
      verificationStatus: "indeterminate",
      challengeBindingHash: null,
      artifactHash: null,
      normalizedVerdict: { nonce_match: null },
      providerMetadata: {},
      reasonCodes: [],
      registeredDeviceId: null,
    });
    await insertEvidence(pool, {
      id: deterministicUuid(624),
      verificationStatus: "error",
      registeredDeviceId,
      reasonCodes: ["attestation.provider_error"],
    });
    await insertEvidence(pool, {
      id: deterministicUuid(625),
      provider: "google_play_integrity",
      verificationStatus: "verified",
      reasonCodes: ["attestation.retry_verified"],
    });

    const persisted = await pool.query<{ total: string; repeated_attempts: string; null_hashes: string; device_nulls: string }>(
      `SELECT
        count(*) AS total,
        count(*) FILTER (
          WHERE attendance_event_id = $1
            AND provider = 'google_play_integrity'
        ) AS repeated_attempts,
        count(*) FILTER (
          WHERE challenge_binding_hash IS NULL
            AND artifact_hash IS NULL
        ) AS null_hashes,
        count(*) FILTER (WHERE registered_device_id IS NULL) AS device_nulls
       FROM attendance.attestation_evidence`,
      [attendanceEventId],
    );

    expect(persisted.rows[0]).toEqual({
      total: "5",
      repeated_attempts: "4",
      null_hashes: "3",
      device_nulls: "4",
    });
  });

  it("rejects invalid providers, statuses, hashes, JSON structures, reason codes, and blank adapter versions", async () => {
    const pool = requireApp(app).store.pgPool!;

    await expect(insertEvidence(pool, {
      id: deterministicUuid(631),
      provider: "safetynet",
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_provider_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(632),
      verificationStatus: "not_evaluated",
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_verification_status_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(633),
      challengeBindingHash: "short",
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_challenge_binding_hash_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(634),
      artifactHash: "A".repeat(64),
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_artifact_hash_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(635),
      artifactHash: "g".repeat(64),
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_artifact_hash_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(636),
      normalizedVerdict: ["not", "object"],
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_normalized_verdict_object_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(637),
      providerMetadata: ["not", "object"],
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_provider_metadata_object_check",
    });

    await expect(insertEvidence(pool, {
      id: deterministicUuid(638),
      reasonCodes: [123],
    })).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_reason_codes_check",
    });

    await expect(
      pool.query(
        `INSERT INTO attendance.attestation_evidence (
          id, company_id, attendance_event_id, provider, verification_status,
          adapter_version, normalized_verdict, provider_metadata, reason_codes,
          received_at, evaluated_at
        ) VALUES (
          $1, $2, $3, 'google_play_integrity', 'verified', '   ',
          '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, $4, $5
        )`,
        [deterministicUuid(639), companyId, attendanceEventId, receivedAt, evaluatedAt],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "attestation_evidence_adapter_version_check",
    });
  });

  it("stores logical reference UUIDs without foreign-key enforcement", async () => {
    const pool = requireApp(app).store.pgPool!;
    const missingAttendanceEventId = deterministicUuid(650);
    const missingRegisteredDeviceId = deterministicUuid(651);

    await insertEvidence(pool, {
      id: deterministicUuid(652),
      attendanceEventId: missingAttendanceEventId,
      registeredDeviceId: missingRegisteredDeviceId,
      reasonCodes: ["attestation.logical_reference_only"],
    });

    const row = await pool.query<{
      attendance_event_id: string;
      registered_device_id: string;
    }>(
      `SELECT attendance_event_id, registered_device_id
       FROM attendance.attestation_evidence
       WHERE id = $1`,
      [deterministicUuid(652)],
    );

    expect(row.rows[0]).toEqual({
      attendance_event_id: missingAttendanceEventId,
      registered_device_id: missingRegisteredDeviceId,
    });
  });

  it("prevents update and delete through the immutable ledger trigger", async () => {
    const pool = requireApp(app).store.pgPool!;
    const id = deterministicUuid(660);
    await insertEvidence(pool, { id });

    await expect(
      pool.query(
        `UPDATE attendance.attestation_evidence
         SET verification_status = 'rejected'
         WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");

    await expect(
      pool.query(
        `DELETE FROM attendance.attestation_evidence
         WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow("immutable audit/log rows cannot be updated or deleted");

    const persisted = await pool.query<{ verification_status: string }>(
      `SELECT verification_status
       FROM attendance.attestation_evidence
       WHERE id = $1`,
      [id],
    );
    expect(persisted.rows[0]?.verification_status).toBe("verified");
  });

  it("allows existing attendance events without attestation evidence", async () => {
    const pool = requireApp(app).store.pgPool!;
    const eventId = deterministicUuid(670);

    await pool.query(
      `INSERT INTO attendance.attendance_events (
        id, company_id, employee_user_id, actor_user_id, event_type, source,
        occurred_at, received_at, payload, payload_hash
      ) VALUES (
        $1, $2, $3, $4, 'check_in', 'web', $5, $5, '{}'::jsonb, NULL
      )`,
      [
        eventId,
        companyId,
        deterministicUuid(671),
        deterministicUuid(672),
        receivedAt,
      ],
    );

    const counts = await pool.query<{ events: string; attestation: string }>(
      `SELECT
        (SELECT count(*) FROM attendance.attendance_events WHERE id = $1) AS events,
        (SELECT count(*) FROM attendance.attestation_evidence WHERE attendance_event_id = $1) AS attestation`,
      [eventId],
    );

    expect(counts.rows[0]).toEqual({
      events: "1",
      attestation: "0",
    });
  });
});
