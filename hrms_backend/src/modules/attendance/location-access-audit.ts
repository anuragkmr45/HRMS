import type { Pool, PoolClient } from "pg";
import type { UUID } from "#shared";
import { badRequest, notFound } from "../../platform/errors.js";

export const AttendanceLocationAccessAuditActions = {
  ExactCoordinatesViewed: "attendance.location_coordinates.viewed",
  ExactCoordinatesExported: "attendance.location_coordinates.exported",
} as const;

export type AttendanceLocationAccessAuditAction =
  (typeof AttendanceLocationAccessAuditActions)[keyof typeof AttendanceLocationAccessAuditActions];

export type AttendanceLocationAccessAuditOutcome = "allowed" | "denied";

export interface AttendanceExactCoordinateViewAuditInput {
  companyId: UUID;
  actorUserId: UUID;
  locationEvidenceId: UUID;
  outcome?: AttendanceLocationAccessAuditOutcome;
  reasonCode?: string | null;
  requestId?: string | null;
  operationContext?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AttendanceExactCoordinateExportAuditInput {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId?: UUID | null;
  exportRecordCount: number;
  outcome?: AttendanceLocationAccessAuditOutcome;
  reasonCode?: string | null;
  requestId?: string | null;
  operationContext?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditedExactCoordinateEvidence {
  locationEvidenceId: UUID;
  attendanceEventId: UUID;
  companyId: UUID;
  employeeUserId: UUID;
  capturedAt: string;
  receivedAt: string;
  latitude: string;
  longitude: string;
  accuracyMeters: string | null;
  altitudeMeters: string | null;
  provider: string | null;
  permissionState: string;
}

interface InsertAuditInput {
  companyId: UUID;
  actorUserId: UUID;
  subjectEmployeeUserId?: UUID | null;
  locationEvidenceId?: UUID | null;
  attendanceEventId?: UUID | null;
  action: AttendanceLocationAccessAuditAction;
  outcome?: AttendanceLocationAccessAuditOutcome;
  reasonCode?: string | null;
  requestId?: string | null;
  operationContext?: string | null;
  exportRecordCount?: number | null;
  metadata?: Record<string, unknown>;
}

const coordinateMetadataKeys = new Set([
  "lat",
  "latitude",
  "lng",
  "long",
  "longitude",
  "coordinate",
  "coordinates",
  "altitude",
  "altitude_meters",
  "geo_point",
  "point",
  "geometry",
  "geography",
  "location",
  "raw_payload",
]);

const allowedMetadataKeys = new Set([
  "audit_scope",
  "date_from",
  "date_to",
  "employee_count",
  "export_format",
  "filter_hash",
  "filters",
  "format",
  "record_count",
  "request_scope",
  "report_key",
  "ui_surface",
  "work_date",
]);

const auditCodePattern = /^[A-Za-z0-9_.:-]{1,128}$/u;
const coordinateLikeNumberPattern = /-?[0-9]{1,3}\.[0-9]{3,}/u;

export class AttendanceLocationAccessAuditRepository {
  constructor(private readonly client: PoolClient) {}

  async insert(input: InsertAuditInput): Promise<void> {
    const metadata = safeMetadata(input.metadata);
    await this.client.query(
      `
        INSERT INTO attendance.location_access_audit_logs (
          company_id, actor_user_id, subject_employee_user_id,
          location_evidence_id, attendance_event_id, action, outcome,
          reason_code, request_id, operation_context, export_record_count, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      `,
      [
        input.companyId,
        input.actorUserId,
        input.subjectEmployeeUserId ?? null,
        input.locationEvidenceId ?? null,
        input.attendanceEventId ?? null,
        input.action,
        input.outcome ?? "allowed",
        safeAuditCode(input.reasonCode, "reason_code"),
        safeRequestId(input.requestId),
        safeAuditCode(input.operationContext, "operation_context"),
        input.exportRecordCount ?? null,
        JSON.stringify(metadata),
      ],
    );
  }
}

export class AttendanceLocationAccessAuditService {
  constructor(private readonly pool: Pool) {}

  async withAuditedExactCoordinateView(
    input: AttendanceExactCoordinateViewAuditInput,
  ): Promise<AuditedExactCoordinateEvidence> {
    return this.withTransaction(async (repository, client) => {
      const evidence = await readTenantScopedExactCoordinateEvidence(
        client,
        input.companyId,
        input.locationEvidenceId,
      );
      await repository.insert({
        ...input,
        subjectEmployeeUserId: evidence.employeeUserId,
        attendanceEventId: evidence.attendanceEventId,
        action: AttendanceLocationAccessAuditActions.ExactCoordinatesViewed,
      });
      return evidence;
    });
  }

  async auditExactCoordinateExport(input: AttendanceExactCoordinateExportAuditInput): Promise<void> {
    await this.withTransaction(async (repository) => {
      await repository.insert({
        ...input,
        action: AttendanceLocationAccessAuditActions.ExactCoordinatesExported,
        exportRecordCount: validateExportRecordCount(input.exportRecordCount),
      });
    });
  }

  private async withTransaction<T>(
    run: (repository: AttendanceLocationAccessAuditRepository, client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const repository = new AttendanceLocationAccessAuditRepository(client);
      const result = await run(repository, client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function safeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const metadata = value ?? {};
  assertNoCoordinateMetadata(metadata);
  return metadata;
}

function assertNoCoordinateMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoCoordinateMetadata(item);
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (value.length > 128 || coordinateLikeNumberPattern.test(value))) {
      throw badRequest("Location access audit metadata cannot contain exact coordinate values.");
    }
    if (typeof value === "number" && (!Number.isFinite(value) || !Number.isInteger(value))) {
      throw badRequest("Location access audit metadata numbers must be finite integers.");
    }
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizedAuditKey(key);
    if (coordinateMetadataKeys.has(normalizedKey) || !allowedMetadataKeys.has(normalizedKey)) {
      throw badRequest("Location access audit metadata cannot contain exact coordinate fields.", {
        key,
      });
    }
    assertNoCoordinateMetadata(nested);
  }
}

function safeRequestId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!auditCodePattern.test(trimmed) || coordinateLikeNumberPattern.test(trimmed)) {
    throw badRequest("Location access audit request ID is invalid.");
  }
  return trimmed;
}

function safeAuditCode(value: string | null | undefined, field: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    !auditCodePattern.test(trimmed) ||
    coordinateLikeNumberPattern.test(trimmed) ||
    coordinateMetadataKeys.has(normalizedAuditKey(trimmed))
  ) {
    throw badRequest("Location access audit code is invalid.", { field });
  }
  return trimmed;
}

function validateExportRecordCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest("Location coordinate export audit count must be a non-negative integer.");
  }
  return value;
}

function normalizedAuditKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[\s-]+/gu, "_")
    .toLowerCase()
    .replace(/^_+|_+$/gu, "");
}

async function readTenantScopedExactCoordinateEvidence(
  client: PoolClient,
  companyId: UUID,
  locationEvidenceId: UUID,
): Promise<AuditedExactCoordinateEvidence> {
  const result = await client.query<{
    id: UUID;
    attendance_event_id: UUID;
    company_id: UUID;
    employee_user_id: UUID;
    captured_at: Date;
    received_at: Date;
    latitude: string;
    longitude: string;
    accuracy_meters: string | null;
    altitude_meters: string | null;
    provider: string | null;
    permission_state: string;
  }>(
    `SELECT
        id,
        attendance_event_id,
        company_id,
        employee_user_id,
        captured_at,
        received_at,
        latitude::text,
        longitude::text,
        accuracy_meters::text,
        altitude_meters::text,
        provider,
        permission_state
       FROM attendance.location_evidence
      WHERE id = $1
        AND company_id = $2
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND coordinates_purged_at IS NULL
        AND coordinates_expire_at IS NOT NULL
        AND coordinates_expire_at > now()
      FOR SHARE`,
    [locationEvidenceId, companyId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound("Exact coordinate evidence was not found for this company.");
  }
  return {
    locationEvidenceId: row.id,
    attendanceEventId: row.attendance_event_id,
    companyId: row.company_id,
    employeeUserId: row.employee_user_id,
    capturedAt: row.captured_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    altitudeMeters: row.altitude_meters,
    provider: row.provider,
    permissionState: row.permission_state,
  };
}
