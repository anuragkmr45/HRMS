import { ErrorCodes, type ErrorCode } from "#shared";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(ErrorCodes.BadRequest, message, 400, details);

export const companyContextRequired = (details?: unknown) =>
  new AppError(
    ErrorCodes.CompanyContextRequired,
    "Company context is required for this operation.",
    400,
    details,
  );

export const unauthorized = (
  message = "Authentication required",
  details?: unknown,
) => new AppError(ErrorCodes.Unauthorized, message, 401, details);

export const forbidden = (message = "Forbidden", details?: unknown) =>
  new AppError(ErrorCodes.Forbidden, message, 403, details);

export const notFound = (message = "Not found", details?: unknown) =>
  new AppError(ErrorCodes.NotFound, message, 404, details);

export const conflict = (
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
) => new AppError(ErrorCodes.WorkflowConflict, message, 409, details, headers);

export const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(
    ErrorCodes.TooManyRequests,
    "Too many requests. Please wait and try again.",
    429,
    {
      retry_after_seconds: retryAfterSeconds,
    },
  );

export const selfApprovalBlocked = (action: string) =>
  new AppError(
    ErrorCodes.SelfApprovalBlocked,
    "Requester cannot perform this approval or finance action on their own ticket.",
    403,
    { action },
  );

export const missingRemarks = (action: string) =>
  new AppError(
    ErrorCodes.MissingRemarks,
    "Remarks are required for this action.",
    400,
    {
      action,
    },
  );
