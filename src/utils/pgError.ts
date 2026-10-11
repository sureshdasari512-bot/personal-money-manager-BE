import { AppError } from '../types/index.js';

/**
 * Standard PostgreSQL error codes used for client-friendly mapping.
 * Full list: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_CODE = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  notNullViolation: '23502',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  connectionFailure: '08006',
  tooManyConnections: '53300',
  queryCanceled: '57014',
} as const;

interface PgLikeError {
  code?: string;
  constraint?: string;
  column?: string;
  table?: string;
  detail?: string;
}

/**
 * Narrows an unknown throw to the pg driver fields we care about.
 *
 * @param error - Caught value from a failed query
 * @returns Pg-like error fields (all optional)
 */
function asPgError(error: unknown): PgLikeError {
  if (typeof error !== 'object' || error === null) {
    return {};
  }
  const e = error as Record<string, unknown>;
  const result: PgLikeError = {};
  if (typeof e.code === 'string') result.code = e.code;
  if (typeof e.constraint === 'string') result.constraint = e.constraint;
  if (typeof e.column === 'string') result.column = e.column;
  if (typeof e.table === 'string') result.table = e.table;
  if (typeof e.detail === 'string') result.detail = e.detail;
  return result;
}

/**
 * Returns true when the thrown value is a known pg database error.
 *
 * @param error - Caught value
 */
export function isPgError(error: unknown): boolean {
  const e = asPgError(error);
  return typeof e.code === 'string' && e.code.length === 5;
}

/**
 * Maps a pg driver error onto a client-safe AppError.
 *
 * Unique-violation and foreign-key-violation errors carry enough context in
 * their `constraint` field to produce a specific, actionable message.
 * All other DB errors become a generic 500 so internals are never leaked.
 *
 * Call this inside service-layer catch blocks — never in controllers or
 * repositories, so the mapping stays close to the business context.
 *
 * @param error - Unknown throw from a repository call
 * @param constraintMessages - Map of constraint name → human-readable message.
 *   Provide this for every unique/FK constraint the caller could hit so the
 *   client gets a meaningful message instead of the generic fallback.
 * @returns AppError safe to pass to next(err)
 */
export function mapPgError(
  error: unknown,
  constraintMessages: Record<string, string> = {},
): AppError {
  const e = asPgError(error);

  if (e.code === PG_CODE.uniqueViolation) {
    const specific = e.constraint ? constraintMessages[e.constraint] : undefined;
    return new AppError(
      specific ?? 'A record with these details already exists.',
      409,
    );
  }

  if (e.code === PG_CODE.foreignKeyViolation) {
    const specific = e.constraint ? constraintMessages[e.constraint] : undefined;
    return new AppError(
      specific ?? 'A related record was not found or has been deleted.',
      422,
    );
  }

  if (e.code === PG_CODE.checkViolation) {
    const specific = e.constraint ? constraintMessages[e.constraint] : undefined;
    return new AppError(
      specific ?? 'The value provided is outside the allowed range.',
      422,
    );
  }

  if (e.code === PG_CODE.notNullViolation) {
    return new AppError(
      `A required value is missing${e.column ? ` (${e.column})` : ''}.`,
      422,
    );
  }

  if (
    e.code === PG_CODE.connectionFailure ||
    e.code === PG_CODE.tooManyConnections
  ) {
    return new AppError('The database is temporarily unavailable. Please try again.', 503);
  }

  if (e.code === PG_CODE.queryCanceled) {
    return new AppError('The request took too long and was cancelled. Please try again.', 503);
  }

  // Unknown DB error — do not leak details to the client.
  return new AppError('Internal server error', 500);
}
