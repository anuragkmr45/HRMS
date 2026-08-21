import { Pool } from "pg";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import { AttendanceMigrationDryRunService } from "../src/modules/attendance/migration-dry-run-service.js";
import { AttendanceProjectionReplayError } from "../src/modules/attendance/projection-rebuild-service.js";

const ExitCodes = {
  Success: 0,
  UnexpectedFailure: 1,
  InvalidInput: 2,
} as const;

const AllowedArguments = new Set([
  "company-id",
  "employee-user-id",
  "date-from",
  "date-to",
]);

let pool: Pool | undefined;

try {
  loadRuntimeEnv();

  const args = parseArgs(process.argv.slice(2));

  pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
  });

  const service = new AttendanceMigrationDryRunService(pool);
  const result = await service.run({
    companyId: requireArg(args, "company-id"),
    employeeUserId: requireArg(args, "employee-user-id"),
    dateFrom: requireArg(args, "date-from"),
    dateTo: requireArg(args, "date-to"),
  });

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = ExitCodes.Success;
} catch (error) {
  const output = errorOutput(error);
  console.error(JSON.stringify(output.body, null, 2));
  process.exitCode = output.exitCode;
} finally {
  if (pool) {
    try {
      await pool.end();
    } catch {
      if ((process.exitCode ?? ExitCodes.Success) === ExitCodes.Success) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "database_cleanup_failed",
              message:
                "Attendance migration dry-run completed, but database cleanup failed.",
            },
            null,
            2,
          ),
        );
        process.exitCode = ExitCodes.UnexpectedFailure;
      }
    }
  }
}

function parseArgs(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];

    if (!token?.startsWith("--")) {
      throw new AttendanceProjectionReplayError(
        "invalid_cli_arguments",
        `Unexpected positional argument: ${token ?? "<empty>"}.`,
      );
    }

    const name = token.slice(2);

    if (!AllowedArguments.has(name)) {
      throw new AttendanceProjectionReplayError(
        "unknown_cli_argument",
        `Unknown argument: --${name}.`,
      );
    }

    if (Object.hasOwn(parsed, name)) {
      throw new AttendanceProjectionReplayError(
        "duplicate_cli_argument",
        `Argument --${name} was provided more than once.`,
      );
    }

    const value = values[index + 1];

    if (!value || value.startsWith("--")) {
      throw new AttendanceProjectionReplayError(
        "invalid_cli_arguments",
        `--${name} requires a value.`,
      );
    }

    parsed[name] = value;
    index += 1;
  }

  return parsed;
}

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name];

  if (!value) {
    throw new AttendanceProjectionReplayError(
      "missing_cli_argument",
      `Missing required --${name}.`,
    );
  }

  return value;
}

function errorOutput(error: unknown): {
  exitCode: number;
  body: { ok: false; code: string; message: string };
} {
  if (error instanceof AttendanceProjectionReplayError) {
    const invalidCodes = new Set([
      "invalid_uuid",
      "invalid_date",
      "invalid_date_range",
      "date_range_too_large",
      "invalid_cli_arguments",
      "missing_cli_argument",
      "unknown_cli_argument",
      "duplicate_cli_argument",
    ]);

    return {
      exitCode: invalidCodes.has(error.replayCode)
        ? ExitCodes.InvalidInput
        : ExitCodes.UnexpectedFailure,
      body: {
        ok: false,
        code: error.replayCode,
        message: error.message,
      },
    };
  }

  return {
    exitCode: ExitCodes.UnexpectedFailure,
    body: {
      ok: false,
      code: "attendance_migration_dry_run_failed",
      message: "Attendance migration dry-run failed.",
    },
  };
}
