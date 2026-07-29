import type { Pool, PoolClient } from "pg";
import type { UUID } from "#shared";
import { badRequest, conflict, notFound } from "../../platform/errors.js";

export const GEOFENCE_PUBLISHED_PERIOD_OVERLAP_CONSTRAINT =
  "attendance_geofence_versions_published_period_no_overlap";

type PostgresConstraintError = {
  code?: string;
  constraint?: string;
  message?: string;
};

type GeofenceVersionPublishRow = {
  id: UUID;
  company_id: UUID;
  geofence_id: UUID;
  version_number: number;
  version_status: string;
  shape_type: "circle" | "polygon";
  circle_radius_meters: string | null;
  effective_from: Date;
  effective_until: Date | null;
  canonical_hash: string;
  published_at: Date;
  published_by_user_id: UUID;
};

type GeofenceShapeValidationRow = {
  shape_type: "circle" | "polygon";
  geometry_type: string | null;
  srid: number | null;
  coord_dim: number | null;
  is_empty: boolean | null;
  is_valid: boolean | null;
  valid_reason: string | null;
  npoints: number | null;
  area_square_meters: number | null;
  x_min: number | null;
  x_max: number | null;
  y_min: number | null;
  y_max: number | null;
  circle_radius_meters: string | null;
  radius_is_finite: boolean | null;
};

export type PublishedGeofenceVersion = {
  id: UUID;
  company_id: UUID;
  geofence_id: UUID;
  version_number: number;
  version_status: "published";
  shape_type: "circle" | "polygon";
  circle_radius_meters: string | null;
  effective_from: string;
  effective_until: string | null;
  canonical_hash: string;
  published_at: string;
  published_by_user_id: UUID;
  geometry_diagnostics?: Record<string, unknown>;
};

export class PostgresGeofenceRepository {
  constructor(private readonly pool: Pool) {}

  async publishDraftVersion(input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    versionId: UUID;
    effectiveFrom: string;
    effectiveUntil?: string | null;
  }): Promise<PublishedGeofenceVersion> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const version = await publishDraftVersionInTransaction(client, input);
      await client.query("COMMIT");
      return version;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const mapped = mapGeofencePublishPostgresError(error);
      if (mapped) throw mapped;
      throw error;
    } finally {
      client.release();
    }
  }

  async findActivePublishedVersion(input: {
    companyId: UUID;
    geofenceId: UUID;
    asOf: string;
  }): Promise<PublishedGeofenceVersion | null> {
    const result = await this.pool.query<GeofenceVersionPublishRow>(
      `SELECT id, company_id, geofence_id, version_number, version_status,
          shape_type, circle_radius_meters::text, effective_from,
          effective_until, canonical_hash, published_at, published_by_user_id
       FROM attendance.geofence_versions
       WHERE company_id = $1
         AND geofence_id = $2
         AND version_status = 'published'
         AND effective_from <= $3::timestamptz
         AND (effective_until IS NULL OR $3::timestamptz < effective_until)
       ORDER BY effective_from DESC, published_at DESC, version_number DESC`,
      [input.companyId, input.geofenceId, input.asOf],
    );
    if (result.rows.length > 1) {
      throw conflict("Geofence has multiple active published versions.", {
        code: "geofence_ambiguous_active_versions",
        geofence_id: input.geofenceId,
        version_ids: result.rows.map((row) => row.id),
      });
    }
    return result.rows[0] ? presentPublishedVersion(result.rows[0]) : null;
  }
}

async function publishDraftVersionInTransaction(
  client: PoolClient,
  input: {
    companyId: UUID;
    actorUserId: UUID;
    geofenceId: UUID;
    versionId: UUID;
    effectiveFrom: string;
    effectiveUntil?: string | null;
  },
): Promise<PublishedGeofenceVersion> {
  validateEffectivePeriod(input.effectiveFrom, input.effectiveUntil ?? null);

  const geofence = await client.query<{ id: UUID }>(
    `SELECT id
     FROM attendance.geofences
     WHERE id = $1
       AND company_id = $2
       AND deleted_at IS NULL
     FOR UPDATE`,
    [input.geofenceId, input.companyId],
  );
  if (!geofence.rows[0]) {
    throw notFound("Geofence not found", { geofence_id: input.geofenceId });
  }

  const version = await client.query<{ id: UUID; version_status: string }>(
    `SELECT id, version_status
     FROM attendance.geofence_versions
     WHERE id = $1
       AND company_id = $2
       AND geofence_id = $3
     FOR UPDATE`,
    [input.versionId, input.companyId, input.geofenceId],
  );
  const draft = version.rows[0];
  if (!draft) {
    throw notFound("Geofence version not found", {
      geofence_id: input.geofenceId,
      version_id: input.versionId,
    });
  }
  if (draft.version_status !== "draft") {
    throw conflict("Only draft geofence versions can be published.", {
      geofence_id: input.geofenceId,
      version_id: input.versionId,
      status: draft.version_status,
    });
  }

  const diagnostics = await validatePersistedShape(client, input);
  await rejectOverlappingPublishedPeriod(client, input);

  const update = await client.query<GeofenceVersionPublishRow>(
    `UPDATE attendance.geofence_versions
     SET version_status = 'published',
         effective_from = $4::timestamptz,
         effective_until = $5::timestamptz,
         canonical_hash = attendance.geofence_shape_canonical_hash(
           shape_type,
           shape,
           circle_radius_meters
         ),
         published_at = transaction_timestamp(),
         published_by_user_id = $6
     WHERE id = $1
       AND company_id = $2
       AND geofence_id = $3
       AND version_status = 'draft'
     RETURNING id, company_id, geofence_id, version_number, version_status,
       shape_type, circle_radius_meters::text, effective_from, effective_until,
       canonical_hash, published_at, published_by_user_id`,
    [
      input.versionId,
      input.companyId,
      input.geofenceId,
      input.effectiveFrom,
      input.effectiveUntil ?? null,
      input.actorUserId,
    ],
  );
  const published = update.rows[0];
  if (!published) {
    throw conflict("Geofence version could not be published.", {
      geofence_id: input.geofenceId,
      version_id: input.versionId,
    });
  }

  await client.query(
    `UPDATE attendance.geofences
     SET current_published_version_id = $1,
         updated_by_user_id = $2,
         updated_at = transaction_timestamp(),
         version = version + 1
     WHERE id = $3
       AND company_id = $4`,
    [published.id, input.actorUserId, input.geofenceId, input.companyId],
  );

  return {
    ...presentPublishedVersion(published),
    geometry_diagnostics: diagnostics,
  };
}

function validateEffectivePeriod(
  effectiveFrom: string,
  effectiveUntil: string | null,
): void {
  const fromMs = Date.parse(effectiveFrom);
  if (!Number.isFinite(fromMs)) {
    throw badRequest("effectiveFrom must be a valid ISO timestamp.");
  }
  if (effectiveUntil === null) return;
  const untilMs = Date.parse(effectiveUntil);
  if (!Number.isFinite(untilMs)) {
    throw badRequest("effectiveUntil must be null or a valid ISO timestamp.");
  }
  if (fromMs >= untilMs) {
    throw badRequest("effectiveUntil must be after effectiveFrom.");
  }
}

async function validatePersistedShape(
  client: PoolClient,
  input: { companyId: UUID; geofenceId: UUID; versionId: UUID },
): Promise<Record<string, unknown>> {
  const result = await client.query<GeofenceShapeValidationRow>(
    `SELECT shape_type,
        ST_GeometryType(shape) AS geometry_type,
        ST_SRID(shape) AS srid,
        ST_CoordDim(shape) AS coord_dim,
        ST_IsEmpty(shape) AS is_empty,
        CASE
          WHEN ST_GeometryType(shape) IN ('ST_Polygon', 'ST_MultiPolygon')
            THEN ST_IsValid(shape)
          ELSE true
        END AS is_valid,
        CASE
          WHEN ST_GeometryType(shape) IN ('ST_Polygon', 'ST_MultiPolygon')
            THEN ST_IsValidReason(shape)
          ELSE 'Valid Geometry'
        END AS valid_reason,
        ST_NPoints(shape) AS npoints,
        CASE
          WHEN shape_type = 'polygon'
            AND ST_GeometryType(shape) IN ('ST_Polygon', 'ST_MultiPolygon')
            AND ST_IsValid(shape)
            THEN ST_Area(shape::geography)
          ELSE NULL
        END AS area_square_meters,
        ST_XMin(Box3D(shape)) AS x_min,
        ST_XMax(Box3D(shape)) AS x_max,
        ST_YMin(Box3D(shape)) AS y_min,
        ST_YMax(Box3D(shape)) AS y_max,
        circle_radius_meters::text,
        circle_radius_meters IS NOT NULL
          AND circle_radius_meters::text NOT IN ('NaN', 'Infinity', '-Infinity')
          AS radius_is_finite
      FROM attendance.geofence_versions
      WHERE id = $1
        AND company_id = $2
        AND geofence_id = $3`,
    [input.versionId, input.companyId, input.geofenceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound("Geofence version not found", {
      geofence_id: input.geofenceId,
      version_id: input.versionId,
    });
  }
  const diagnostics = {
    shape_type: row.shape_type,
    geometry_type: row.geometry_type,
    srid: row.srid,
    coord_dim: row.coord_dim,
    is_empty: row.is_empty,
    is_valid: row.is_valid,
    valid_reason: row.valid_reason,
    npoints: row.npoints,
    area_square_meters: row.area_square_meters,
  };

  if (row.is_empty) {
    throw badRequest("Geofence shape must not be empty.", diagnostics);
  }
  if (row.srid !== 4326) {
    throw badRequest("Geofence shape must use SRID 4326.", diagnostics);
  }
  if (row.coord_dim !== 2) {
    throw badRequest("Geofence shape must be two-dimensional.", diagnostics);
  }
  if (
    row.x_min === null ||
    row.x_max === null ||
    row.y_min === null ||
    row.y_max === null ||
    row.x_min < -180 ||
    row.x_max > 180 ||
    row.y_min < -90 ||
    row.y_max > 90
  ) {
    throw badRequest("Geofence coordinates must be valid longitude and latitude values.", {
      ...diagnostics,
      envelope: {
        longitude_min: row.x_min,
        longitude_max: row.x_max,
        latitude_min: row.y_min,
        latitude_max: row.y_max,
      },
    });
  }

  if (row.shape_type === "circle") {
    if (row.geometry_type !== "ST_Point") {
      throw badRequest("Circle geofences must be stored as a point.", diagnostics);
    }
    if (!row.radius_is_finite || row.circle_radius_meters === null) {
      throw badRequest("Circle geofence radius must be finite.", diagnostics);
    }
    if (Number(row.circle_radius_meters) <= 0) {
      throw badRequest("Circle geofence radius must be greater than zero.", diagnostics);
    }
    return diagnostics;
  }

  if (!["ST_Polygon", "ST_MultiPolygon"].includes(row.geometry_type ?? "")) {
    throw badRequest("Polygon geofences must be stored as a polygon or multipolygon.", diagnostics);
  }
  if (row.circle_radius_meters !== null) {
    throw badRequest("Polygon geofences must not include a circle radius.", diagnostics);
  }
  if (!row.is_valid) {
    throw badRequest(`Invalid polygon geofence: ${row.valid_reason ?? "unknown reason"}.`, diagnostics);
  }
  if (Number(row.area_square_meters ?? 0) <= 0) {
    throw badRequest("Polygon geofence area must be greater than zero.", diagnostics);
  }
  return diagnostics;
}

async function rejectOverlappingPublishedPeriod(
  client: PoolClient,
  input: {
    companyId: UUID;
    geofenceId: UUID;
    versionId: UUID;
    effectiveFrom: string;
    effectiveUntil?: string | null;
  },
): Promise<void> {
  const result = await client.query<{ id: UUID }>(
    `SELECT id
     FROM attendance.geofence_versions
     WHERE company_id = $1
       AND geofence_id = $2
       AND id <> $3
       AND version_status = 'published'
       AND tstzrange(effective_from, effective_until, '[)') &&
           tstzrange($4::timestamptz, $5::timestamptz, '[)')
     LIMIT 1`,
    [
      input.companyId,
      input.geofenceId,
      input.versionId,
      input.effectiveFrom,
      input.effectiveUntil ?? null,
    ],
  );
  const existing = result.rows[0];
  if (existing) {
    throw conflict("Published geofence effective periods cannot overlap.", {
      code: "geofence_published_period_overlap",
      constraint: GEOFENCE_PUBLISHED_PERIOD_OVERLAP_CONSTRAINT,
      geofence_id: input.geofenceId,
      conflicting_version_id: existing.id,
    });
  }
}

function mapGeofencePublishPostgresError(error: unknown) {
  if (!isPostgresConstraintError(error)) return null;
  if (
    error.code === "23P01" &&
    error.constraint === GEOFENCE_PUBLISHED_PERIOD_OVERLAP_CONSTRAINT
  ) {
    return conflict("Published geofence effective periods cannot overlap.", {
      code: "geofence_published_period_overlap",
      constraint: GEOFENCE_PUBLISHED_PERIOD_OVERLAP_CONSTRAINT,
    });
  }
  return null;
}

function isPostgresConstraintError(
  error: unknown,
): error is PostgresConstraintError {
  return typeof error === "object" && error !== null && "code" in error;
}

function presentPublishedVersion(
  row: GeofenceVersionPublishRow,
): PublishedGeofenceVersion {
  return {
    id: row.id,
    company_id: row.company_id,
    geofence_id: row.geofence_id,
    version_number: row.version_number,
    version_status: "published",
    shape_type: row.shape_type,
    circle_radius_meters: row.circle_radius_meters,
    effective_from: row.effective_from.toISOString(),
    effective_until: row.effective_until?.toISOString() ?? null,
    canonical_hash: row.canonical_hash,
    published_at: row.published_at.toISOString(),
    published_by_user_id: row.published_by_user_id,
  };
}
